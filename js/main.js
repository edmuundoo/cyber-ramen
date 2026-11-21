import { GAME_CONFIG } from './config.js?v=90';
import { gameState, createShiftRuntimeState } from './state.js?v=90';
import { audio } from './audio.js?v=90';
import {
  buildCustomerPortraitSVG,
  buildCourierDroneSVG,
  generateAppleTouchIcon
} from './renderer.js?v=90';
import { FirstPersonWebGLScene } from './webgl3d.js?v=90';
import { CustomerAndDeliverySystem } from './customers.js?v=90';
import { KitchenSystem } from './kitchen.js?v=90';
import { EconomySystem } from './economy.js?v=90';
import { TutorialSystem } from './tutorial.js?v=90';

class CyberRamenApp {
  constructor() {
    this.shell = document.getElementById('app-shell');
    this.streetCanvas = document.getElementById('street-canvas');

    this.scene3D = new FirstPersonWebGLScene(this.streetCanvas, {
      onPickObject: (hitId) => this.handle3DObjectPicked(hitId),
      onSwipeSector: (dir) => this.handleHorizontalSwipe(dir),
      onSwipeUpVessel: () => this.handleVesselServeOrPack(),
      onSwipeDownPress: () => this.handlePressAction()
    });

    this.tutorial = new TutorialSystem();

    this.customerSystem = new CustomerAndDeliverySystem(
      (msg, color) => this.showToast(msg, color),
      () => this.renderCustomerStage(),
      () => {
        this.renderCourierWindow();
        this.kitchenSystem?.renderRightSectorDOM();
      }
    );

    this.kitchenSystem = new KitchenSystem({
      onToast: (msg, color) => this.showToast(msg, color),
      onSpawnCoins: (count) => this.scene3D.spawnCoins(count),
      onTutorialEvent: (ev, payload) => {
        if (ev === 'broth_poured') {
          this.scene3D.triggerBrothPourAnim(payload);
        } else if (ev === 'noodle_pulled' && payload && typeof payload === 'object') {
          this.scene3D.triggerNoodleDumpAnim(payload.index, payload.quality);
        } else if (ev === 'topping_added') {
          this.scene3D.triggerToppingPlaceAnim(payload);
        } else if (ev === 'dish_served') {
          this.scene3D.triggerHandAction(ev, [0, 0.96, 0.83]);
        }
        this.tutorial.onEvent(ev);
      },
      evaluateDish: (vessel, order) => this.customerSystem.evaluateDishAccuracy(vessel, order)
    });

    this.economySystem = new EconomySystem(
      (msg, color) => this.showToast(msg, color),
      () => this.startNewShiftDay()
    );

    this.lastFrameTime = performance.now();
    this.lastPatienceBucket = -1;

    this.initPWAAndDialogs();
    this.initNavigationAndControls();
    this.syncVisualTierAndHUD();
    this.kitchenSystem.renderAllKitchen();
    this.renderCourierWindow();

    requestAnimationFrame((now) => this.loop(now));
  }

  handleVesselServeOrPack() {
    const rt = gameState.runtime;
    const type = rt.activeVessel.type;
    if (!type) {
      this.showToast('В левой руке пусто! Возьмите 🍜 Миску или 📦 Вок-коробку справа на складе!', '#ffaa00');
      return;
    }
    if (rt.activeSector === 2) {
      const delivered = this.kitchenSystem.deliverBoxToCourierDrone();
      if (delivered) {
        this.scene3D.triggerAutoCloseAndDroneDeliverAnim(delivered);
        this.renderCourierWindow();
      }
      return;
    }
    if (rt.cameraFocus === 'customer') {
      if ((rt.customerPanSide || 0) === 1) {
        const delivered = this.kitchenSystem.deliverBoxToCourierDrone();
        if (delivered) {
          this.scene3D.triggerAutoCloseAndDroneDeliverAnim(delivered);
          this.renderCourierWindow();
        }
      } else {
        this.kitchenSystem.serveToCounterCustomer();
      }
    } else {
      // Если камера на столе — ставим посуду из руки на свободный слот стола
      const freeIdx = (rt.tableSlots || []).findIndex((s) => !s);
      const res = this.kitchenSystem.handleTableSlotTap(freeIdx !== -1 ? freeIdx : 1);
      if (res) this.triggerTableSlot3DAnim(res);
    }
  }

  handlePressAction() {
    const delivered = this.kitchenSystem.deliverBoxToCourierDrone();
    if (delivered) {
      this.scene3D.triggerAutoCloseAndDroneDeliverAnim(delivered);
      this.renderCourierWindow();
    }
  }

  triggerTableSlot3DAnim(res) {
    if (!res) return;
    if (res.action === 'place') {
      this.scene3D.triggerTableSlotPlaceAnim(res.slotIndex, res.vessel);
    } else if (res.action === 'pickup') {
      this.scene3D.triggerTableSlotPickupAnim(res.slotIndex, res.vessel);
    } else if (res.action === 'pour') {
      this.scene3D.triggerTableSlotPourAnim(res.slotIndex, res.fromType, res.toType, res.vessel);
    }
  }

  handle3DObjectPicked(hitId, skipAutoTurn = false) {
    if (!hitId) return;

    // На широком экране из центрального ракурса (Сектор 1) можно тапать прямо по видимым объектам
    // плиты слева (Сектор 0) или склада справа (Сектор 2): камера плавно поворачивается, а затем запускается 3D-анимация!
    const rtNow = gameState.runtime;
    if (!skipAutoTurn && rtNow.activeSector === 1 && rtNow.cameraFocus === 'worktable') {
      let targetSector = null;
      if (hitId.startsWith('basket_') || hitId.startsWith('broth_') || hitId === 'wall_menu_board') {
        targetSector = 0;
      } else if (hitId === 'vessel_bowl' || hitId === 'vessel_box' || hitId === 'cryo_fridge') {
        targetSector = 2;
      }
      if (targetSector !== null) {
        if (this.pendingAutoTurnTimer) {
          clearTimeout(this.pendingAutoTurnTimer);
          this.pendingAutoTurnTimer = null;
        }
        this.switchSector(targetSector);
        this.pendingAutoTurnTimer = setTimeout(() => {
          this.pendingAutoTurnTimer = null;
          if (gameState.runtime.activeSector === targetSector) {
            this.handle3DObjectPicked(hitId, true);
          }
        }, 170);
        return;
      }
    }

    if (hitId.startsWith('basket_')) {
      const idx = Number(hitId.replace('basket_', ''));
      this.kitchenSystem.handleBasketAction(idx);
      return;
    }

    if (hitId.startsWith('broth_')) {
      const brothId = hitId.replace('broth_', '');
      this.kitchenSystem.selectBroth(brothId);
      return;
    }

    if (hitId.startsWith('topping_')) {
      const topId = hitId.replace('topping_', '');
      this.kitchenSystem.handleToppingTap(topId);
      return;
    }

    if (hitId === 'under_tray_stack') {
      const ok = this.kitchenSystem.takeTrayFromUnderCounter();
      if (ok) {
        this.scene3D.triggerTrayPlaceAnim();
      }
      return;
    }

    if (hitId === 'under_bag_stack') {
      const res = this.kitchenSystem.takeBagFromUnderCounter();
      if (res) {
        this.scene3D.triggerBagPackAnim(res);
      }
      return;
    }

    if (hitId === 'held_left_vessel') {
      const res = this.kitchenSystem.handleHeldLeftVesselTap();
      if (res) {
        if (res.action === 'pour_right_to_left') {
          this.scene3D.triggerDualHandAnim('pour_right_to_left', res);
        } else if (res.action === 'return_left_empty') {
          this.scene3D.triggerRightStackReturnAnim(res.type);
        }
      }
      return;
    }

    if (hitId === 'assembly_zone' || hitId === 'center_vessel' || hitId.startsWith('table_slot_')) {
      const res = this.kitchenSystem.handleAssemblyZoneTap();
      if (res) {
        if (res.action === 'pickup_tray_right' || res.action === 'handoff_and_pickup_tray_left') {
          this.scene3D.triggerDualHandAnim(res.action, res);
        } else {
          this.scene3D.triggerAssemblyVesselAnim(res);
        }
      }
      return;
    }

    if (hitId === 'table_spill' || hitId === 'kitchen_cloth') {
      const wiped = this.kitchenSystem.wipeTableSpill();
      if (wiped) {
        this.scene3D.triggerWipeSpillAnim(wiped);
      }
      return;
    }

    if (hitId === 'table_chopsticks') {
      const ok = this.kitchenSystem.addChopsticksToAssembly();
      if (ok) {
        this.scene3D.triggerChopsticksPlaceAnim();
      }
      return;
    }

    if (hitId === 'vessel_bowl') {
      this.startVesselPickupSequence('bowl');
      return;
    }

    if (hitId === 'vessel_box') {
      this.startVesselPickupSequence('box');
      return;
    }

    if (hitId === 'trash_bin' || hitId === 'clear_vessel') {
      const tossed = this.kitchenSystem.disposeHeldVesselToTrash();
      if (tossed) {
        this.scene3D.triggerTossFromHandToTrashAnim(tossed);
      }
      return;
    }

    if (hitId === 'customer_serve') {
      if (gameState.runtime.cameraFocus === 'customer') {
        const hasHeld = Boolean(gameState.runtime.activeVessel && gameState.runtime.activeVessel.type);
        if (gameState.runtime.carryingAssembly && !hasHeld && this.kitchenSystem.hasAssembledOrder()) {
          const served = this.kitchenSystem.serveToCounterCustomer();
          if (served) {
            this.scene3D.triggerServePushAnim(Boolean(served.servedBag));
          }
        } else if (gameState.runtime.currentCustomer) {
          this.customerSystem.announceCurrentCustomerOrder();
          this.showToast(gameState.runtime.currentCustomer.order.dialogue, '#00f5d4');
        } else {
          gameState.runtime.cameraFocus = 'worktable';
          gameState.runtime.carryingAssembly = false;
        }
      } else {
        this.customerSystem.announceCurrentCustomerOrder();
      }
      return;
    }

    if (hitId === 'wall_menu_board') {
      audio.playTapPop();
      this.syncVisualTierAndHUD();
      this.renderCourierWindow();
      const codexModal = document.getElementById('codex-modal');
      if (codexModal && !codexModal.open) codexModal.showModal();
      return;
    }

    if (hitId === 'pacifier_cat') {
      this.scene3D.triggerHandAction('cat', [1.0, 0.16, 0.52]);
      this.customerSystem.triggerPacifier();
      return;
    }

    if (hitId === 'courier_drone' || hitId === 'sealer_station' || hitId === 'airlock_station') {
      const rt = gameState.runtime;
      const hasBoxToDeliver =
        (rt.activeVessel && rt.activeVessel.type === 'box') ||
        (rt.assembly && rt.assembly.vessel && rt.assembly.vessel.type === 'box');
      if (!hasBoxToDeliver && rt.activeDelivery) {
        const del = rt.activeDelivery;
        const brothName = GAME_CONFIG.BROTHS[del.broth]?.shortName || del.broth;
        const topNames = (del.toppings || [])
          .map((id) => GAME_CONFIG.TOPPINGS[id]?.shortName || id)
          .join(', ');
        audio.playTapPop();
        this.showToast(
          `🚁 Заказ ${del.id} (${Math.ceil(del.remainingSec)}с): ${brothName} + ${topNames} в 📦 Коробке`,
          '#00f5d4'
        );
        return;
      }
      const delivered = this.kitchenSystem.deliverBoxToCourierDrone();
      if (delivered) {
        this.scene3D.triggerAutoCloseAndDroneDeliverAnim(delivered);
        this.renderCourierWindow();
      }
      return;
    }

    if (hitId === 'cryo_fridge') {
      if (this.kitchenSystem.blockIfBothHandsBusy()) return;
      if (!gameState.runtime.fridgeOpen) {
        gameState.runtime.fridgeOpen = true;
        this.scene3D.triggerFridgeDoorAnim('open');
        audio.playTapPop();
      }
      return;
    }

    if (hitId.startsWith('fridge_top_')) {
      const toppingId = hitId.slice('fridge_top_'.length);
      const ok = this.kitchenSystem.restockSingleTopping(toppingId);
      if (ok) {
        this.scene3D.triggerFridgeRestockAnim(toppingId);
      }
      return;
    }

    if (hitId.startsWith('fridge_drink_')) {
      const drinkId = hitId.slice('fridge_drink_'.length);
      const res = this.kitchenSystem.addDrinkToAssembly(drinkId);
      if (res) {
        this.scene3D.triggerDrinkPlaceAnim(res.drinkId, res.intoBag);
        // Ждём ~460мс, пока правая рука дотянется до банки, возьмёт её и чуть опустит к себе,
        // и ровно в этот момент закрываем холодильник и поворачиваем камеру на стол — рука едет вместе с нами и ставит банку!
        setTimeout(() => {
          if (gameState.runtime.fridgeOpen && gameState.runtime.activeSector === 2) {
            gameState.runtime.fridgeOpen = false;
            this.scene3D.triggerFridgeDoorAnim('close');
            gameState.runtime.cameraFocus = 'worktable';
            this.switchSector(1);
          }
        }, 460);
      }
      return;
    }

    if (hitId === 'dirty_bowl_left' || hitId === 'dirty_bowl_right') {
      const side = hitId === 'dirty_bowl_right' ? 'right' : 'left';
      const res = this.kitchenSystem.collectDirtyBowlFromShelf(side);
      if (res) {
        this.scene3D.triggerCollectDirtyBowlAnim(res.side, res.bowl);
      }
      return;
    }

    if (hitId === 'sink_clog') {
      const prevClog = this.kitchenSystem.unclogSinkDrain();
      if (prevClog) {
        this.scene3D.triggerSinkUnclogAnim(prevClog);
      }
      return;
    }

    if (hitId === 'sink_wash') {
      const rtSink = gameState.runtime;
      const heldV = rtSink.activeVessel;
      if (heldV && heldV.type && !this.kitchenSystem.isVesselEmptyOfFood(heldV)) {
        const dumped = this.kitchenSystem.dumpHeldVesselIntoSink();
        if (dumped) {
          this.scene3D.triggerSinkDumpAnim(dumped);
        }
        return;
      }
      if (rtSink.sinkClog && rtSink.sinkClog.clogged) {
        const prevClog = this.kitchenSystem.unclogSinkDrain();
        if (prevClog) {
          this.scene3D.triggerSinkUnclogAnim(prevClog);
        }
        return;
      }
      const washed = this.kitchenSystem.washOneBowlInSink();
      if (washed) {
        this.scene3D.triggerSinkWashAnim(washed);
      }
      return;
    }

    if (hitId === 'sink_clean_rack') {
      const moved = this.kitchenSystem.collectCleanBowlFromRack();
      if (moved) {
        this.scene3D.triggerRackToCleanStackAnim(moved.fromRackIdx);
      }
      return;
    }
  }

  initPWAAndDialogs() {
    generateAppleTouchIcon();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js?v=90', { updateViaCache: 'none' })
        .then((reg) => reg.update())
        .catch(() => {});
    }

    document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isDialogContent =
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width;
          if (isDialogContent) return;
          dialog.close();
        });
      }
    });

    const isTelegramMiniApp = Boolean(window.Telegram?.WebApp?.initData);
    const isStandalone =
      isTelegramMiniApp ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (!isStandalone && !gameState.persistent.pwaPromptSeen) {
      const pwaModal = document.getElementById('pwa-modal');
      if (pwaModal && !pwaModal.open) {
        setTimeout(() => {
          pwaModal.showModal();
          gameState.persistent.pwaPromptSeen = true;
          gameState.save();
        }, 400);
      }
    }

    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  initNavigationAndControls() {
    const unlockAudio = () => {
      audio.ensureContext();
      // Если первый гость уже подошёл до первого клика, озвучиваем его голосовой заказ при разблокировке звука
      if (gameState.runtime.currentCustomer && gameState.runtime.cameraFocus === 'customer') {
        const isFirst = (gameState.runtime.dailyStats?.servedCount || 0) === 0;
        this.customerSystem.announceCurrentCustomerOrder(isFirst);
      }
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });

    // Кнопка 🗣️ в верхнем баре: посмотреть на гостя и повторить заказ голосом
    document.getElementById('btn-repeat-voice')?.addEventListener('click', () => {
      if (gameState.runtime.currentCustomer) {
        this.customerSystem.announceCurrentCustomerOrder();
      } else {
        this.showToast('У стойки пока нет посетителя', '#ffaa00');
      }
    });

    // Поворот головы по нижнему 360°-компасу
    document.querySelectorAll('[data-sector-zone]').forEach((zone) => {
      zone.addEventListener('click', () => {
        const idx = Number(zone.getAttribute('data-sector-zone'));
        if (idx === 1 && gameState.runtime.activeSector === 1) {
          gameState.runtime.cameraFocus = 'worktable';
          gameState.runtime.carryingAssembly = false;
        }
        this.switchSector(idx);
      });
    });

    const codexModal = document.getElementById('codex-modal');
    document.getElementById('btn-codex')?.addEventListener('click', () => {
      audio.playTapPop();
      if (codexModal && !codexModal.open) codexModal.showModal();
    });

    document.getElementById('btn-audio')?.addEventListener('click', () => {
      gameState.persistent.settings.muted = !gameState.persistent.settings.muted;
      if (!gameState.persistent.settings.muted) audio.ensureContext();
      audio.syncAmbience();
      gameState.save();
      this.syncVisualTierAndHUD();
    });

    document.getElementById('btn-toggle-music')?.addEventListener('click', () => {
      gameState.persistent.settings.musicOn = !gameState.persistent.settings.musicOn;
      audio.syncAmbience();
      gameState.save();
      this.syncVisualTierAndHUD();
    });

    document.getElementById('btn-toggle-rain')?.addEventListener('click', () => {
      gameState.persistent.settings.rainOn = !gameState.persistent.settings.rainOn;
      audio.syncAmbience();
      gameState.save();
      this.syncVisualTierAndHUD();
    });

    document.getElementById('btn-end-shift-early')?.addEventListener('click', () => {
      if (codexModal?.open) codexModal.close();
      this.economySystem.settleDayAndOpenTerminal();
    });

    document.getElementById('btn-show-pwa-guide')?.addEventListener('click', () => {
      if (codexModal?.open) codexModal.close();
      const pwaModal = document.getElementById('pwa-modal');
      if (pwaModal && !pwaModal.open) pwaModal.showModal();
    });

    document.getElementById('btn-reset-save')?.addEventListener('click', () => {
      if (codexModal?.open) codexModal.close();
      gameState.resetAll();
      this.tutorial.step = 1;
      this.tutorial.refreshBanner();
      this.syncVisualTierAndHUD();
      this.kitchenSystem.renderAllKitchen();
      this.renderCustomerStage();
      this.renderCourierWindow();
      this.showToast('🔄 Прогресс сброшен. День 1 начат заново!', '#00f5d4');
    });

    gameState.subscribe(() => {
      this.syncVisualTierAndHUD();
    });
  }

  startVesselPickupSequence(type) {
    const res = this.kitchenSystem.setVesselType(type);
    if (!res) return;
    if (res.action === 'return_left_empty') {
      this.scene3D.triggerRightStackReturnAnim(res.type);
    } else if (res.action === 'grab_stack_left') {
      this.scene3D.triggerRightStackGrabAnim(res.type);
    } else if (
      res.action === 'grab_stack_right' ||
      res.action === 'return_stack_right' ||
      res.action === 'handoff_and_grab_left' ||
      res.action === 'return_left_and_handoff_back'
    ) {
      this.scene3D.triggerDualHandAnim(res.action, res);
    }
  }

  handleHorizontalSwipe(dir) {
    const rt = gameState.runtime;
    // Когда открыт Крио-Холодильник (Сектор 2): свайп закрывает дверцу и возвращает камеру на склад справа!
    if (rt.activeSector === 2 && rt.fridgeOpen) {
      rt.fridgeOpen = false;
      this.scene3D.triggerFridgeDoorAnim('close');
      audio.playTapPop();
      return;
    }

    // Когда камера опущена ПОД ПРИЛАВОК (cameraFocus === 'under_counter'):
    // - свайп влево (dir = +1, поворот направо) -> пакеты для заказов с собой (underCounterSide = 1);
    // - свайп вправо (dir = -1, поворот налево) -> подносы (underCounterSide = 0)!
    if (rt.activeSector === 1 && rt.cameraFocus === 'under_counter') {
      const curUnder = rt.underCounterSide || 0;
      const nextUnder = Math.max(0, Math.min(1, curUnder + dir));
      if (nextUnder !== curUnder) {
        rt.underCounterSide = nextUnder;
        audio.playTapPop();
      }
      return;
    }

    // Когда камера поднята наверх (cameraFocus === 'customer'):
    // - если держим в руках собранный поднос или пакет (carryingAssembly) — двигаться влево/вправо НЕЛЬЗЯ!
    // - иначе свайпы влево/вправо поворачивают взгляд между левой полкой (-1), гостем (0) и правым дроном (+1)
    //   БЕЗ поднятия подноса со столешницы!
    if (rt.activeSector === 1 && rt.cameraFocus === 'customer') {
      if (rt.carryingAssembly) {
        return;
      }
      const curSide = rt.customerPanSide || 0;
      if (curSide === 1 && dir === 1) {
        rt.customerPanSide = 0;
        rt.cameraFocus = 'worktable';
        rt.carryingAssembly = false;
        this.switchSector(2);
        return;
      }
      if (curSide === -1 && dir === -1) {
        rt.customerPanSide = 0;
        rt.cameraFocus = 'worktable';
        rt.carryingAssembly = false;
        this.switchSector(0);
        return;
      }
      const nextSide = Math.max(-1, Math.min(1, curSide + dir));
      if (nextSide !== curSide) {
        rt.customerPanSide = nextSide;
        rt.carryingAssembly = false;
        audio.playTapPop();
      }
      return;
    }

    this.switchSector(rt.activeSector + dir);
  }

  switchSector(sectorIdx) {
    // Пока держим поднос или пакет перед клиентом — нельзя уходить в другие сектора влево/вправо!
    if (gameState.runtime.cameraFocus === 'customer' && gameState.runtime.carryingAssembly) {
      return;
    }
    // Сектора: -1 (Мойка левее плиты), 0 (Плита), 1 (Центральный стол), 2 (Склад справа)
    const clamped = Math.max(-1, Math.min(2, sectorIdx));
    if (gameState.runtime.activeSector === clamped) return;

    gameState.runtime.activeSector = clamped;
    gameState.runtime.customerPanSide = 0;
    gameState.runtime.underCounterSide = 0;
    gameState.runtime.carryingAssembly = false;
    if (clamped !== 2 && gameState.runtime.fridgeOpen) {
      gameState.runtime.fridgeOpen = false;
      this.scene3D.triggerFridgeDoorAnim('close');
    }
    if (gameState.runtime.cameraFocus === 'under_counter') {
      gameState.runtime.cameraFocus = 'worktable';
    }
    gameState.runtime.sauceModeArmed = false;
    // Посуда всегда остаётся в левой руке повара при перемещении между секторами,
    // пока игрок не поставит её на один из 3 слотов центрального стола, не отдаст заказу или не выбросит!
    gameState.runtime.vesselHeldInLeft = Boolean(
      gameState.runtime.activeVessel && gameState.runtime.activeVessel.type
    );

    this.shell.setAttribute('data-active-sector', String(clamped));

    document.querySelectorAll('[data-sector-zone]').forEach((zone) => {
      const idx = Number(zone.getAttribute('data-sector-zone'));
      zone.classList.toggle('is-active', idx === clamped);
    });

    audio.playTapPop();
    this.tutorial.onEvent('sector_changed');
    this.kitchenSystem.renderAllKitchen();
  }

  startNewShiftDay() {
    gameState.persistent.day += 1;
    gameState.runtime = createShiftRuntimeState();
    this.switchSector(1);
    this.syncVisualTierAndHUD();
    this.kitchenSystem.renderAllKitchen();
    this.renderCustomerStage();
    this.renderCourierWindow();
    this.tutorial.refreshBanner();
    gameState.save();
    this.showToast(`🏮 День ${gameState.persistent.day}: Смена открыта!`, '#00f5d4');
  }

  syncVisualTierAndHUD() {
    const p = gameState.persistent;
    const rt = gameState.runtime;
    const district = gameState.getCurrentDistrict();

    document.documentElement.setAttribute('data-yatai-tier', String(district.tier));

    const distEl = document.getElementById('hud-district-name');
    if (distEl) distEl.textContent = district.name;

    const dayEl = document.getElementById('hud-day-num');
    if (dayEl) dayEl.textContent = `ДЕНЬ ${p.day}`;

    const moneyEl = document.getElementById('hud-money');
    const creditsPill = document.getElementById('hud-credits-pill');
    if (moneyEl) moneyEl.textContent = String(p.money);
    if (creditsPill) creditsPill.classList.toggle('is-debt', p.money < 0);

    const revEl = document.getElementById('menu-shift-revenue');
    if (revEl && rt?.dailyStats) {
      const todayTotal =
        (rt.dailyStats.salesRevenue || 0) +
        (rt.dailyStats.tipsEarned || 0) +
        (rt.dailyStats.deliveryBonuses || 0);
      revEl.textContent = `+¥${todayTotal}`;
    }

    const ratingEl = document.getElementById('hud-rating');
    if (ratingEl) ratingEl.textContent = p.rating.toFixed(1);

    const audioBtn = document.getElementById('btn-audio');
    if (audioBtn) {
      audioBtn.textContent = p.settings.muted ? '🔇 Звук: ВЫКЛ' : '🔊 Звук: ВКЛ';
    }

    const musicBtn = document.getElementById('btn-toggle-music');
    if (musicBtn) {
      musicBtn.textContent = `🎵 Lo-Fi Синт: ${p.settings.musicOn ? 'ВКЛ' : 'ВЫКЛ'}`;
    }
    const rainBtn = document.getElementById('btn-toggle-rain');
    if (rainBtn) {
      rainBtn.textContent = `🌧️ Шум дождя: ${p.settings.rainOn ? 'ВКЛ' : 'ВЫКЛ'}`;
    }
  }

  renderCustomerStage() {
    const wrap = document.getElementById('customer-portrait-wrap');
    const nameTag = document.getElementById('customer-name-tag');
    const bubble = document.getElementById('order-bubble');
    if (wrap) wrap.hidden = true;
    if (nameTag) nameTag.hidden = true;
    if (bubble) bubble.hidden = true;
  }

  renderCourierWindow() {
    const del = gameState.runtime.activeDelivery;
    const card = document.getElementById('menu-delivery-card');
    const info = document.getElementById('menu-delivery-info');
    if (!card || !info) return;
    if (!del) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const brothName = GAME_CONFIG.BROTHS[del.broth]?.shortName || del.broth;
    info.textContent = `${del.id}: ${brothName} (${Math.ceil(del.remainingSec)}с)`;
  }

  updateLiveHUDAndTimers(dt) {
    const rt = gameState.runtime;
    if (!rt.shiftActive) return;

    rt.shiftElapsed += dt;
    const progress = Math.min(1, rt.shiftElapsed / GAME_CONFIG.SHIFT_DURATION_SEC);

    const totalMinutes = Math.floor(progress * 5 * 60);
    const hour = (GAME_CONFIG.START_HOUR + Math.floor(totalMinutes / 60)) % 24;
    const min = Math.floor((totalMinutes % 60) / 5) * 5;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

    const timeEl = document.getElementById('hud-time');
    if (timeEl) timeEl.textContent = timeStr;

    const shiftBar = document.getElementById('shift-progress-bar');
    if (shiftBar) shiftBar.style.setProperty('--shift-pct', `${(progress * 100).toFixed(1)}%`);

    const cust = rt.currentCustomer;
    if (cust) {
      const patBar = document.getElementById('patience-bar-fill');
      if (patBar) {
        const pct = Math.max(0, Math.min(100, cust.patience));
        const hue = Math.round((pct / 100) * 140);
        patBar.style.setProperty('--patience-pct', `${pct.toFixed(1)}%`);
        patBar.style.setProperty('--patience-hue', String(hue));
      }
      const bucket = cust.patience > 65 ? 2 : cust.patience > 40 ? 1 : 0;
      if (bucket !== this.lastPatienceBucket) {
        this.renderCustomerStage();
      }
    }

    if (rt.activeDelivery) {
      this.renderCourierWindow();
    }

    if (rt.shiftElapsed >= GAME_CONFIG.SHIFT_DURATION_SEC) {
      this.economySystem.settleDayAndOpenTerminal();
    }
  }

  showToast(message, color = '#00f5d4') {
    const layer = document.getElementById('feedback-toast-layer');
    if (!layer) return;

    const toast = document.createElement('div');
    toast.className = 'feedback-toast';
    toast.style.setProperty('--toast-color', color);
    toast.textContent = message;
    layer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 1650);
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.scene3D.updateAndDraw(dt);
    this.customerSystem.update(dt);
    this.kitchenSystem.update(dt);
    this.updateLiveHUDAndTimers(dt);

    requestAnimationFrame((next) => this.loop(next));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__cyberRamenApp = new CyberRamenApp();
});
