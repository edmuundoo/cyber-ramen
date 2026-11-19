import { GAME_CONFIG } from './config.js?v=51';
import { gameState } from './state.js?v=51';
import { audio } from './audio.js?v=51';

export class KitchenSystem {
  constructor(callbacks) {
    this.onToast = callbacks.onToast;
    this.onSpawnCoins = callbacks.onSpawnCoins;
    this.onTutorialEvent = callbacks.onTutorialEvent;
    this.evaluateDish = callbacks.evaluateDish;
    this.tickAccum = 0;

    this.initSauceCanvasGesture();
  }

  update(dt) {
    const rt = gameState.runtime;
    if (!rt.shiftActive) {
      audio.stopKettleWhistle();
      return;
    }

    const unlockedBaskets = gameState.getUnlockedBasketCount();
    const hasAutoBoiler = gameState.hasUpgrade('auto_boiler');
    let stateChanged = false;
    let anyBoiling = false;
    let maxBoilingProgress = 0;
    let highestWhistle = null; // null | 'aldente' | 'overcooked'

    for (let i = 0; i < unlockedBaskets; i++) {
      const b = rt.baskets[i];
      if (b.state === 'empty' || b.state === 'lifted' || b.state === 'aldente_locked') {
        continue;
      }

      const prevState = b.state;
      b.elapsed += dt;

      if (b.elapsed < GAME_CONFIG.AL_DENTE_START) {
        b.state = 'boiling';
        anyBoiling = true;
        maxBoilingProgress = Math.max(maxBoilingProgress, b.elapsed / GAME_CONFIG.AL_DENTE_START);
      } else if (b.elapsed >= GAME_CONFIG.AL_DENTE_START && b.elapsed <= GAME_CONFIG.AL_DENTE_END) {
        b.state = 'aldente';
        if (prevState !== 'aldente') {
          audio.playAlDentePing();
          stateChanged = true;
          if (hasAutoBoiler) {
            b.state = 'lifted';
            b.cookedQuality = 'aldente';
            this.onToast(`🤖 Авто-таймер поднял сотейник #${i + 1} (Al Dente)!`, '#10f56c');
          }
        }
        if (b.state === 'aldente' && highestWhistle !== 'overcooked') {
          highestWhistle = 'aldente';
        }
      } else if (b.elapsed > GAME_CONFIG.AL_DENTE_END) {
        if (hasAutoBoiler) {
          b.state = 'lifted';
          b.cookedQuality = 'aldente';
          b.elapsed = (GAME_CONFIG.AL_DENTE_START + GAME_CONFIG.AL_DENTE_END) / 2;
        } else {
          b.state = 'overcooked';
          highestWhistle = 'overcooked';
          if (prevState !== 'overcooked') {
            stateChanged = true;
          }
        }
      }
    }

    // 1. Отсчитывающий звуковой таймер во время варки лапши (тик-так)
    if (anyBoiling) {
      this.tickAccum += dt;
      if (this.tickAccum >= 0.48) {
        this.tickAccum = 0;
        audio.playTimerTick(maxBoilingProgress);
      }
    } else {
      this.tickAccum = 0;
    }

    // 2. Свист закипающего чайника: свистит на Al Dente и ещё сильнее свистит при переваре, пока не тапнешь корзину!
    audio.syncKettleWhistle(highestWhistle);

    // 3. Таймер остывания блюд, временно отставленных на 3 слота центрального стола
    if (Array.isArray(rt.tableSlots)) {
      for (const slotVessel of rt.tableSlots) {
        if (
          slotVessel &&
          slotVessel.type &&
          (slotVessel.broth || slotVessel.noodleState || slotVessel.toppings.length > 0)
        ) {
          slotVessel.tableAgeSec = (slotVessel.tableAgeSec || 0) + dt;
        }
      }
    }

    // 4. Таймеры гостей, которые едят из керамических мисок и затем оставляют грязную миску на ПРАВОЙ полке прилавка!
    if (Array.isArray(rt.eatingTimers) && rt.eatingTimers.length > 0) {
      for (let i = rt.eatingTimers.length - 1; i >= 0; i--) {
        const item = rt.eatingTimers[i];
        item.remainingSec -= dt;
        if (item.remainingSec <= 0) {
          rt.eatingTimers.splice(i, 1);
          const dirtyBowl = {
            broth: item.broth || 'tonkotsu',
            placedAt: performance.now()
          };
          rt.dirtyShelfRight.push(dirtyBowl);
          audio.playTapPop();
          this.onToast(
            '🍽️ Гость доел и оставил грязную миску на правой полке прилавка!',
            '#ffaa00'
          );
        }
      }
    }

    this.updateEdgeAlerts();
    if (stateChanged) {
      this.onTutorialEvent('basket_state_change');
    }
  }

  createEmptyVessel(type = null) {
    return {
      type,
      noodleState: null,
      broth: null,
      toppings: [],
      tableAgeSec: 0,
      wasStagedOnTable: false,
      overflowCount: 0
    };
  }

  isVesselEmptyOfFood(v) {
    if (!v || !v.type) return true;
    return !v.broth && !v.noodleState && (!v.toppings || v.toppings.length === 0);
  }

  handleBasketAction(index) {
    const rt = gameState.runtime;
    const unlocked = gameState.getUnlockedBasketCount();
    if (index >= unlocked) return;

    const b = rt.baskets[index];

    // 1-Й ТАП: Опускаем сотейник с лапшой в кипящую воду и запускаем таймер варки
    if (b.state === 'empty') {
      b.state = 'boiling';
      b.elapsed = 0;
      b.cookedQuality = null;
      this.tickAccum = 0;
      audio.playBoilBubble();
      audio.playTimerTick(0);
      this.onToast(`🧺 Сотейник #${index + 1}: лапша опущена в воду, таймер запущен!`, '#00f5d4');
      this.onTutorialEvent('noodle_started');
      this.updateEdgeAlerts();
      return;
    }

    // 2-Й ТАП: Достаём (поднимаем) сотейник с лапшой из кастрюли, останавливая варку,
    // но НЕ высыпаем сразу в миску/коробку (можно сварить и поднять сразу до 3 сотейников!)
    if (b.state === 'boiling' || b.state === 'aldente' || b.state === 'overcooked') {
      let quality = 'under';
      if (b.state === 'aldente') {
        quality = 'aldente';
      } else if (b.state === 'overcooked') {
        quality = 'over';
      }

      b.state = 'lifted';
      b.cookedQuality = quality;

      if (quality === 'aldente') {
        audio.playAlDentePing();
        this.onToast(
          `🍜 Сотейник #${index + 1} поднят из воды (Al Dente)! Тапните ещё раз, чтобы закинуть в посуду.`,
          '#10f56c'
        );
      } else if (quality === 'under') {
        audio.playTapPop();
        this.onToast(
          `⚠️ Сотейник #${index + 1} поднят рано (недовар). Тапните ещё раз, чтобы закинуть в посуду.`,
          '#ffaa00'
        );
      } else {
        audio.playPenaltyBuzz();
        this.onToast(
          `⚠️ Сотейник #${index + 1} поднят поздно (перевар). Тапните ещё раз, чтобы закинуть в посуду.`,
          '#ff385c'
        );
      }

      this.updateEdgeAlerts();
      return;
    }

    // 3-Й ТАП: Когда сотейник уже поднят из воды ('lifted') — высыпаем лапшу из него в миску или вок-коробку в левой руке!
    if (!rt.activeVessel.type) {
      audio.playPenaltyBuzz();
      this.onToast(
        'В левой руке пусто! Возьмите 🍜 Миску или 📦 Коробку справа и тапните поднятый сотейник.',
        '#ffaa00'
      );
      return;
    }

    const quality = b.cookedQuality || 'aldente';

    if (rt.activeVessel.noodleState) {
      rt.activeVessel.overflowCount = (rt.activeVessel.overflowCount || 0) + 1;
      rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + 12;
      rt.dailyStats.penalties += 12;
      audio.playPenaltyBuzz();
      this.onToast('⚠️ Перелив с краёв! В посуде уже была лапша (перевод продуктов -¥12)!', '#ff385c');
    }

    rt.activeVessel.noodleState = quality;
    rt.vesselHeldInLeft = true;
    b.state = 'empty';
    b.elapsed = 0;
    b.cookedQuality = null;

    if (quality === 'aldente') {
      audio.playAlDentePing();
      this.onToast('🍜 Лапша Al Dente закинута в посуду в левой руке!', '#10f56c');
    } else if (quality === 'under') {
      audio.playTapPop();
      this.onToast('⚠️ Лапша (недовар) закинута в посуду.', '#ffaa00');
    } else {
      audio.playPenaltyBuzz();
      this.onToast('⚠️ Лапша (перевар) закинута в посуду.', '#ff385c');
    }

    this.onTutorialEvent('noodle_pulled', { index, quality });
    this.renderAllKitchen();
  }

  selectBroth(brothId) {
    const unlocked = gameState.getUnlockedBroths();
    if (!unlocked.includes(brothId)) return;

    const rt = gameState.runtime;
    if (!rt.activeVessel.type) {
      audio.playPenaltyBuzz();
      this.onToast('В левой руке пусто! Сначала возьмите 🍜 Миску или 📦 Коробку справа на складе!', '#ffaa00');
      return;
    }

    if (rt.activeVessel.broth) {
      rt.activeVessel.overflowCount = (rt.activeVessel.overflowCount || 0) + 1;
      rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + 15;
      rt.dailyStats.penalties += 15;
      audio.playPenaltyBuzz();
      this.onToast('⚠️ Бульон перелился через край! Перевод продуктов (-¥15)', '#ff385c');
    }

    rt.activeVessel.broth = brothId;
    rt.vesselHeldInLeft = true;
    audio.playSauceSizzle();
    const cfg = GAME_CONFIG.BROTHS[brothId];
    this.onToast(`🍲 Налит ${cfg.name} в посуду в левой руке`, '#00f5d4');
    this.onTutorialEvent('broth_poured', brothId);
    this.renderAllKitchen();
  }

  setVesselType(type) {
    const rt = gameState.runtime;

    // Если в левой руке уже есть наполненная посуда — нельзя взять вторую, пока не поставишь текущую на стол или не выбросишь!
    if (rt.activeVessel && rt.activeVessel.type && !this.isVesselEmptyOfFood(rt.activeVessel)) {
      audio.playPenaltyBuzz();
      this.onToast(
        'Левая рука занята! Сначала поставьте посуду на одно из 3 мест на центральном столе.',
        '#ffaa00'
      );
      return false;
    }

    // Если в руке уже есть пустая посуда того же типа — ничего не делаем
    if (rt.activeVessel && rt.activeVessel.type === type && this.isVesselEmptyOfFood(rt.activeVessel)) {
      return false;
    }

    // Если в руке была пустая чистая миска и игрок меняет её на коробку — возвращаем чистую миску обратно в стопку
    if (rt.activeVessel && rt.activeVessel.type === 'bowl' && this.isVesselEmptyOfFood(rt.activeVessel)) {
      rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
    }

    if (type === 'bowl') {
      if ((rt.cleanBowls ?? 10) <= 0) {
        audio.playPenaltyBuzz();
        this.onToast(
          '🍽️ Чистые миски закончились (0/10)! Заберите грязные с полки и помойте в мойке слева (или возьмите дорогую коробку -¥8)!',
          '#ff385c'
        );
        return false;
      }
      rt.cleanBowls = Math.max(0, (rt.cleanBowls ?? 10) - 1);
    } else if (type === 'box') {
      // Картонные вок-коробочки всегда доступны, но стоят ¥8 за штуку
      rt.dailyStats.restockSpent = (rt.dailyStats.restockSpent || 0) + 8;
    }

    rt.activeVessel = this.createEmptyVessel(type);
    rt.vesselHeldInLeft = true;
    rt.pendingVesselChoice = null;
    audio.playTapPop();
    this.onToast(
      type === 'bowl'
        ? `🍜 Чистая миска взята в левую руку (осталось чистых: ${rt.cleanBowls}/10)`
        : '📦 Вок-коробка взята в левую руку (дорогая упаковка -¥8)',
      type === 'bowl' ? '#00f5d4' : '#ffaa00'
    );
    this.renderAllKitchen();
    return true;
  }

  // Взаимодействие с одним из 3 слотов на центральном столе (поставить / взять / перелить!)
  handleTableSlotTap(slotIndex) {
    const rt = gameState.runtime;
    if (!Array.isArray(rt.tableSlots)) {
      rt.tableSlots = [null, null, null];
    }
    const idx = Math.max(0, Math.min(2, slotIndex));
    const slotV = rt.tableSlots[idx];
    const handV = rt.activeVessel;
    const hasHand = Boolean(handV && handV.type);
    const hasSlot = Boolean(slotV && slotV.type);

    // 1. Слот на столе пустой, а в левой руке есть миска или коробка -> СТАВИМ на стол!
    if (!hasSlot && hasHand) {
      const placed = {
        ...JSON.parse(JSON.stringify(handV)),
        wasStagedOnTable: true,
        tableAgeSec: handV.tableAgeSec || 0
      };
      rt.tableSlots[idx] = placed;
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        placed.type === 'bowl'
          ? `🍜 Миска временно поставлена на стол (слот #${idx + 1}). Рука свободна!`
          : `📦 Вок-коробка временно поставлена на стол (слот #${idx + 1}). Рука свободна!`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'place', slotIndex: idx, vessel: placed };
    }

    // 2. В слоте на столе стоит посуда, а левая рука пустая -> БЕРЁМ со стола обратно в левую руку!
    if (hasSlot && !hasHand) {
      rt.activeVessel = JSON.parse(JSON.stringify(slotV));
      rt.tableSlots[idx] = null;
      rt.vesselHeldInLeft = true;
      audio.playTapPop();
      const staleWarn =
        (rt.activeVessel.tableAgeSec || 0) > 18
          ? ' ⚠️ (Долго стояло на столе — гость может придраться!)'
          : '';
      this.onToast(
        `${rt.activeVessel.type === 'bowl' ? '🍜 Миска' : '📦 Вок-коробка'} взята со стола в левую руку!${staleWarn}`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'pickup', slotIndex: idx, vessel: rt.activeVessel };
    }

    // 3. И в левой руке есть посуда, И на столе в этом слоте стоит посуда -> ПЕРЕЛИВАЕМ содержимое, а пустая убирается со стола!
    if (hasSlot && hasHand) {
      const handEmpty = this.isVesselEmptyOfFood(handV);
      const slotEmpty = this.isVesselEmptyOfFood(slotV);

      if (handEmpty && slotEmpty) {
        // Обе пустые — просто убираем пустую со стола (если это была чистая миска, возвращаем её в стопку)
        if (slotV.type === 'bowl') {
          rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
        }
        rt.tableSlots[idx] = null;
        audio.playTapPop();
        this.onToast('Пустая посуда убрана со стола.', '#00f5d4');
        this.renderAllKitchen();
        return { action: 'pickup', slotIndex: idx, vessel: rt.activeVessel };
      }

      const fromType = handEmpty ? slotV.type : handV.type;
      const toType = handEmpty ? handV.type : slotV.type;

      let mergedBroth = handV.broth || slotV.broth;
      let mergedNoodle = handV.noodleState || slotV.noodleState;
      const mergedToppings = [...(slotV.toppings || []), ...(handV.toppings || [])];
      let overflow = (handV.overflowCount || 0) + (slotV.overflowCount || 0);

      // Если переливаем из полной в уже полную — перелив через край!
      if ((handV.broth && slotV.broth) || (handV.noodleState && slotV.noodleState) || mergedToppings.length > 6) {
        overflow += 1;
        rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + 15;
        rt.dailyStats.penalties += 15;
      }

      const targetVesselType = handEmpty ? handV.type : slotV.type;
      // Если перелили из керамической миски в коробку — опустевшая испачканная миска отправляется в мойку!
      if (fromType === 'bowl' && targetVesselType !== 'bowl') {
        rt.dirtyInSink.push({ broth: mergedBroth || 'tonkotsu' });
      }
      rt.activeVessel = {
        type: targetVesselType,
        broth: mergedBroth,
        noodleState: mergedNoodle,
        toppings: mergedToppings.slice(0, 8),
        tableAgeSec: Math.max(handV.tableAgeSec || 0, slotV.tableAgeSec || 0),
        wasStagedOnTable: true,
        overflowCount: overflow
      };
      // После переливания пустая посуда автоматически убирается со стола!
      rt.tableSlots[idx] = null;
      rt.vesselHeldInLeft = true;

      audio.playSauceSizzle();
      this.onToast(
        overflow > 0
          ? '⚠️ Перелито, но часть перелилась через край (перевод продуктов)!'
          : `🔄 Заказ перелит в ${targetVesselType === 'box' ? '📦 Вок-коробку' : '🍜 Миску'}, пустая посуда убрана со стола!`,
        overflow > 0 ? '#ffaa00' : '#10f56c'
      );
      this.renderAllKitchen();
      return {
        action: 'pour',
        slotIndex: idx,
        fromType,
        toType,
        vessel: JSON.parse(JSON.stringify(rt.activeVessel))
      };
    }

    this.onToast('В левой руке пусто! Возьмите посуду справа на складе.', '#ffaa00');
    return null;
  }

  // Выбрасывание в мусорку ТОЛЬКО того, что сейчас находится в левой руке!
  disposeHeldVesselToTrash() {
    const rt = gameState.runtime;
    if (!rt.activeVessel || !rt.activeVessel.type) {
      audio.playPenaltyBuzz();
      this.onToast('В левой руке ничего нет! Чтобы выбросить со стола — сначала возьмите в руку.', '#ffaa00');
      return null;
    }

    const tossed = JSON.parse(JSON.stringify(rt.activeVessel));
    const hadFood = !this.isVesselEmptyOfFood(tossed);

    rt.activeVessel = this.createEmptyVessel(null);
    rt.vesselHeldInLeft = false;
    rt.sauceModeArmed = false;

    if (tossed.type === 'bowl') {
      // Сама керамическая миска не выбрасывается: если в ней была еда — миска уходит грязной в мойку, если пустая — возвращается в чистые!
      if (hadFood) {
        rt.dirtyInSink.push({ broth: tossed.broth || 'tonkotsu' });
      } else {
        rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
      }
    }

    if (hadFood) {
      const wasteCost =
        (tossed.broth ? 15 : 0) +
        (tossed.noodleState ? 12 : 0) +
        (tossed.toppings ? tossed.toppings.length * 10 : 0);
      rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + wasteCost;
      rt.dailyStats.penalties += wasteCost;
      audio.playPenaltyBuzz();
      this.onToast(
        tossed.type === 'bowl'
          ? `🗑️ Продукты выброшены (-¥${wasteCost}), грязная миска отправлена в мойку!`
          : `🗑️ Выброшено из руки в мусорку! Списаны продукты (-¥${wasteCost})`,
        '#ff385c'
      );
    } else {
      audio.playTapPop();
      this.onToast(
        tossed.type === 'bowl'
          ? '🍜 Пустая миска возвращена в чистую стопку'
          : '🗑️ Пустая коробка сброшена из руки в мусорку',
        '#ffaa00'
      );
    }

    this.renderAllKitchen();
    return tossed;
  }

  clearActiveVessel() {
    return this.disposeHeldVesselToTrash();
  }

  handleToppingTap(toppingId) {
    const rt = gameState.runtime;
    if (!rt.activeVessel.type) {
      audio.playPenaltyBuzz();
      this.onToast('В левой руке пусто! Возьмите 🍜 Миску или 📦 Коробку справа (на складе) ▶', '#ffaa00');
      return;
    }
    const unlocked = gameState.getUnlockedToppings();
    if (!unlocked.includes(toppingId)) return;

    const stock = gameState.persistent.trayStock[toppingId] ?? 0;
    if (stock <= 0) {
      audio.playPenaltyBuzz();
      this.onToast('❄️ 3D-лоток пуст! Повернитесь вправо к 3D-холодильнику ▶', '#ff385c');
      return;
    }

    const cfg = GAME_CONFIG.TOPPINGS[toppingId];
    if (cfg.isSauce) {
      if (rt.sauceModeArmed) {
        this.applyChiliSauce();
      } else {
        rt.sauceModeArmed = true;
        audio.playTapPop();
        this.onToast('🌶️ Проведите ЗИГЗАГОМ по посуде (или тапните Чили ещё раз)!', '#ffaa00');
        this.renderAllKitchen();
      }
      return;
    }

    gameState.persistent.trayStock[toppingId] = Math.max(0, stock - 1);

    // Если в миску или вок-коробку навалили больше 6 топпингов — перелив с краёв (перевод продуктов)!
    if (rt.activeVessel.toppings.length >= 6) {
      rt.activeVessel.overflowCount = (rt.activeVessel.overflowCount || 0) + 1;
      rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + cfg.restockUnitCost;
      rt.dailyStats.penalties += cfg.restockUnitCost;
      audio.playPenaltyBuzz();
      this.onToast('⚠️ Слишком много! Ингредиенты вываливаются через край (перевод продуктов)!', '#ff385c');
    } else {
      rt.activeVessel.toppings.push(toppingId);
      audio.playTapPop();
    }

    this.onTutorialEvent('topping_added', toppingId);
    gameState.save();
    this.renderAllKitchen();
  }

  applyChiliSauce() {
    const rt = gameState.runtime;
    const stock = gameState.persistent.trayStock.chili ?? 0;
    if (stock <= 0) {
      rt.sauceModeArmed = false;
      this.onToast('❄️ Чили-соус закончился! Тапните 3D-холодильник справа ▶', '#ff385c');
      this.renderAllKitchen();
      return;
    }
    gameState.persistent.trayStock.chili = Math.max(0, stock - 1);
    if (!rt.activeVessel.toppings.includes('chili')) {
      rt.activeVessel.toppings.push('chili');
    }
    rt.sauceModeArmed = false;
    audio.playSauceSizzle();
    this.onToast('🌶️ Огненный зигзаг чили-соуса добавлен!', '#ff2a85');
    this.onTutorialEvent('topping_added', 'chili');
    gameState.save();
    this.renderAllKitchen();
  }

  serveToCounterCustomer() {
    const rt = gameState.runtime;
    const cust = rt.currentCustomer;
    if (!cust) {
      this.onToast('У окна сейчас нет посетителя!', '#ffaa00');
      return false;
    }
    if (!rt.activeVessel.type) {
      this.onToast('В левой руке пусто! Возьмите посуду со стола или справа на складе.', '#ffaa00');
      return false;
    }
    if (!rt.activeVessel.broth && !rt.activeVessel.noodleState) {
      this.onToast('Посуда в руке пуста! Сварите лапшу и налейте бульон ◀ слева', '#ffaa00');
      return false;
    }

    // 1. Если прохожий заказал «с собой в коробочке» (wantsTakeout), а у вас в руке миска — он НЕ возьмёт!
    if (cust.order.wantsTakeout && rt.activeVessel.type !== 'box') {
      audio.playPenaltyBuzz();
      this.onToast(
        '🙅‍♂️ Гость просил С СОБОЙ! Поставьте миску на стол, возьмите пустую вок-коробку и перелейте!',
        '#ff385c'
      );
      return false;
    }

    // 2. Если гостю дают совсем другой бульон — он отказывается брать заказ!
    // Придётся либо отставить его на один из 3 слотов стола в надежде, что купит следующий, либо выбросить!
    if (rt.activeVessel.broth !== cust.order.broth) {
      audio.playPenaltyBuzz();
      this.onToast(
        '🙅‍♂️ Гость отказался: «Я заказывал совсем другой бульон!» Отставьте на стол или выбросьте в мусорку.',
        '#ff385c'
      );
      return false;
    }

    // 3. Если блюдо долго стояло на столе (> 18 сек) — большинство гостей откажутся брать, либо оставят плохой отзыв!
    const tableAge = rt.activeVessel.tableAgeSec || 0;
    if (tableAge > 18 && Math.random() < 0.68) {
      audio.playPenaltyBuzz();
      this.onToast(
        '🙅‍♂️ Гость отказался: «Оно давно стояло на столе и остыло! Сделай свежее!»',
        '#ff385c'
      );
      return false;
    }

    const evalRes = this.evaluateDish(rt.activeVessel, cust.order);
    let leftBadReviewFromTable = false;
    if (rt.activeVessel.wasStagedOnTable && tableAge > 8) {
      leftBadReviewFromTable = true;
      evalRes.isPerfect = false;
      evalRes.multiplier = Math.max(0.3, evalRes.multiplier - 0.25);
      evalRes.notes.push('Со стола (плохой отзыв -0.15★)');
      rt.dailyStats.badReviews = (rt.dailyStats.badReviews || 0) + 1;
      gameState.persistent.rating = Math.max(1.0, +(gameState.persistent.rating - 0.15).toFixed(2));
    }

    const district = gameState.getCurrentDistrict();
    const basePay = Math.round(cust.basePrice * evalRes.multiplier);

    const speedFactor = cust.patience / 100;
    let rawTip = Math.round(
      basePay * 0.35 * speedFactor * district.tipMultiplier * (evalRes.isPerfect ? 1.35 : 0.7)
    );
    if (evalRes.multiplier < 0.75 || leftBadReviewFromTable) rawTip = 0;

    let collectorCut = 0;
    if (gameState.persistent.inDebtCollector && rawTip > 0) {
      collectorCut = Math.ceil(rawTip * 0.5);
      rawTip -= collectorCut;
      rt.dailyStats.collectorWithheld += collectorCut;
    }

    const totalEarned = basePay + rawTip;
    gameState.persistent.money += totalEarned;
    rt.dailyStats.salesRevenue += basePay;
    rt.dailyStats.tipsEarned += rawTip;
    rt.dailyStats.servedCount += 1;

    if (gameState.persistent.inDebtCollector && gameState.persistent.money >= 0) {
      gameState.persistent.inDebtCollector = false;
      this.onToast('🦾 Долг погашен! Коллектор покинул переулок.', '#00f5d4');
    }

    audio.playCoinChime();
    this.onSpawnCoins(10, `+¥${totalEarned}`);

    const qualityTag = evalRes.notes.join(', ');
    const collectorNote = collectorCut > 0 ? ` (Коллектор -¥${collectorCut})` : '';
    this.onToast(
      `🍜 Подано: +¥${basePay} и чаевые +¥${rawTip}${collectorNote} [${qualityTag}]`,
      leftBadReviewFromTable ? '#ffaa00' : evalRes.isPerfect ? '#10f56c' : '#00f5d4'
    );

    // Если отдали заказ в керамической миске — через 8–10 секунд гость доест и оставит грязную миску на правой полке прилавка!
    if (rt.activeVessel.type === 'bowl') {
      rt.eatingTimers.push({
        remainingSec: 7.5 + Math.random() * 2.5,
        side: 'right',
        broth: rt.activeVessel.broth || 'tonkotsu'
      });
    }

    rt.activeVessel = this.createEmptyVessel(null);
    rt.vesselHeldInLeft = false;
    rt.sauceModeArmed = false;
    rt.currentCustomer = null;
    rt.customerSpawnTimer = 0.75;
    this.onTutorialEvent('dish_served');
    gameState.save();
    this.renderAllKitchen();
    return true;
  }

  // Забрать одну грязную миску с левой или правой верхней полки прилавка (1 тап = 1 миска уходит в мойку!)
  collectDirtyBowlFromShelf(side = 'left') {
    const rt = gameState.runtime;
    const shelf = side === 'right' ? rt.dirtyShelfRight : rt.dirtyShelfLeft;
    if (!shelf || shelf.length === 0) {
      return null;
    }

    const bowl = shelf.pop();
    rt.dirtyInSink.push(bowl);
    audio.playTapPop();
    this.onToast(
      `🍽️ Грязная миска убрана с полки в мойку (в мойке: ${rt.dirtyInSink.length} шт.)`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return { side, bowl, remainingOnShelf: shelf.length };
  }

  // Помыть одну грязную миску в раковине (Сектор -1, левее плиты): 1 тап = 1 чистая миска возвращается на склад!
  washOneBowlInSink() {
    const rt = gameState.runtime;
    if (!rt.dirtyInSink || rt.dirtyInSink.length === 0) {
      audio.playTapPop();
      this.onToast('✨ В мойке чисто! Грязные миски можно забрать с верхних полок прилавка.', '#00f5d4');
      return null;
    }

    const washed = rt.dirtyInSink.pop();
    rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
    audio.playBoilBubble();
    audio.playAlDentePing();
    this.onToast(
      `🫧 Миска вымыта до блеска! Чистых мисок: ${rt.cleanBowls}/10 (в мойке осталось: ${rt.dirtyInSink.length})`,
      '#10f56c'
    );
    this.renderAllKitchen();
    return washed;
  }

  // Автоматическое закрывание вок-коробочки и мгновенная передача дрону-курьеру при тапе по дрону!
  deliverBoxToCourierDrone() {
    const rt = gameState.runtime;
    const del = rt.activeDelivery;
    if (!del) {
      audio.playPenaltyBuzz();
      this.onToast('Сейчас нет активного заказа от дрона-курьера CyberEats!', '#ffaa00');
      return null;
    }
    if (!rt.activeVessel || !rt.activeVessel.type) {
      audio.playPenaltyBuzz();
      this.onToast('В левой руке пусто! Возьмите собранную 📦 Вок-коробку.', '#ffaa00');
      return null;
    }
    if (rt.activeVessel.type !== 'box') {
      audio.playPenaltyBuzz();
      this.onToast(
        'Дрону нужна 📦 Вок-коробка! Поставьте миску на стол, возьмите пустую коробку и перелейте!',
        '#ffaa00'
      );
      return null;
    }
    if (!rt.activeVessel.broth || !rt.activeVessel.noodleState) {
      audio.playPenaltyBuzz();
      this.onToast('Сначала налейте бульон и добавьте лапшу в 📦 Вок-коробку!', '#ffaa00');
      return null;
    }

    const deliveredVessel = JSON.parse(JSON.stringify(rt.activeVessel));
    const score = this.evaluateDish(deliveredVessel, {
      isDelivery: true,
      broth: del.broth,
      toppings: del.toppings,
      forbidden: []
    });

    const finalPayout = Math.max(25, Math.round(del.payout * score.multiplier));
    const bonus = score.isPerfect ? 25 : 8;
    gameState.persistent.money += finalPayout + bonus;
    rt.dailyStats.salesRevenue += finalPayout;
    rt.dailyStats.deliveryBonuses += bonus;
    rt.dailyStats.deliveryCount += 1;
    gameState.persistent.rating = Math.min(5.0, +(gameState.persistent.rating + 0.1).toFixed(1));

    rt.activeVessel = this.createEmptyVessel(null);
    rt.vesselHeldInLeft = false;
    rt.sealerSlot = null;
    rt.activeDelivery = null;
    rt.deliverySpawnTimer = 12 + Math.random() * 6;

    audio.playSealerPress();
    audio.playCoinChime();
    this.onSpawnCoins(8, `+¥${finalPayout + bonus}`);
    this.onToast(
      `🚁 Коробка закрыта и передана дрону! +¥${finalPayout + bonus} [${score.notes.join(', ')}]`,
      '#10f56c'
    );
    this.onTutorialEvent('dish_served');
    gameState.save();
    this.renderAllKitchen();
    return deliveredVessel;
  }

  transferBoxToSealer() {
    return this.deliverBoxToCourierDrone();
  }

  sealCurrentBox() {
    const rt = gameState.runtime;
    if (!rt.sealerSlot || rt.sealerSlot.sealed) return;
    rt.sealerSlot.sealed = true;
    audio.playSealerPress();
    this.onToast('🔥 3D-пресс запаял крышку! Тапните 3D-шлюз выдачи.', '#ffaa00');
    this.renderAllKitchen();
  }

  moveBoxToAirlock() {
    const rt = gameState.runtime;
    if (!rt.sealerSlot || !rt.sealerSlot.sealed || rt.sealerSlot.inAirlock) return;
    rt.sealerSlot.inAirlock = true;
    audio.playAlDentePing();
    this.onToast('🚀 3D-бокс в шлюзе! Дрон-курьер заберёт его по таймеру.', '#10f56c');
    this.renderAllKitchen();
  }

  restockAllToppings() {
    const maxCap = gameState.getMaxTrayCap();
    const unlocked = gameState.getUnlockedToppings();
    let totalCost = 0;
    let refilledAny = false;

    for (const id of unlocked) {
      const current = gameState.persistent.trayStock[id] ?? 0;
      const missing = maxCap - current;
      if (missing > 0) {
        totalCost += missing * GAME_CONFIG.TOPPINGS[id].restockUnitCost;
        gameState.persistent.trayStock[id] = maxCap;
        refilledAny = true;
      }
    }
    if (!refilledAny) {
      this.onToast('❄️ Все 3D-гастроемкости уже полные!', '#00f5d4');
      return;
    }
    gameState.runtime.dailyStats.restockSpent += totalCost;
    audio.playTapPop();
    this.onToast(`❄️ 3D-лотки пополнены из крио-холодильника (учтено ¥${totalCost})`, '#00bbf9');
    this.onTutorialEvent('tray_restocked');
    gameState.save();
    this.renderAllKitchen();
  }

  initSauceCanvasGesture() {
    const canvas = document.getElementById('sauce-gesture-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let totalDist = 0;
    let lastPt = null;

    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: ((clientX - r.left) / r.width) * canvas.width,
        y: ((clientY - r.top) / r.height) * canvas.height
      };
    };

    const start = (e) => {
      if (!gameState.runtime.sauceModeArmed) return;
      e.stopPropagation();
      drawing = true;
      totalDist = 0;
      lastPt = getPos(e);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ff2a55';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff2a55';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(lastPt.x, lastPt.y);
    };

    const move = (e) => {
      if (!drawing || !gameState.runtime.sauceModeArmed) return;
      e.stopPropagation();
      const pt = getPos(e);
      totalDist += Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      lastPt = pt;

      if (totalDist > 95) {
        drawing = false;
        setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 200);
        this.applyChiliSauce();
      }
    };

    const end = () => {
      if (!drawing) return;
      drawing = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (totalDist > 25 && gameState.runtime.sauceModeArmed) {
        this.applyChiliSauce();
      }
    };

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  updateEdgeAlerts() {
    const rt = gameState.runtime;
    const leftEdge = document.getElementById('edge-alert-left');
    const leftLabel = document.getElementById('edge-alert-left-label');
    const rightEdge = document.getElementById('edge-alert-right');
    const rightLabel = document.getElementById('edge-alert-right-label');

    const badgeLeft = document.getElementById('badge-left-sector');
    const badgeCenter = document.getElementById('badge-center-sector');
    const badgeRight = document.getElementById('badge-right-sector');

    const hasAlDente = rt.baskets.some((b) => b.state === 'aldente');
    const hasLifted = rt.baskets.some((b) => b.state === 'lifted' || b.state === 'aldente_locked');
    const hasOver = rt.baskets.some((b) => b.state === 'overcooked');
    const hasBoiling = rt.baskets.some((b) => b.state === 'boiling');

    if (badgeLeft) {
      if (hasAlDente) {
        badgeLeft.hidden = false;
        badgeLeft.textContent = 'AL DENTE!';
        badgeLeft.style.setProperty('--badge-bg', '#10f56c');
      } else if (hasOver) {
        badgeLeft.hidden = false;
        badgeLeft.textContent = 'ПЕРЕВАР!';
        badgeLeft.style.setProperty('--badge-bg', '#ff385c');
      } else if (hasBoiling) {
        badgeLeft.hidden = false;
        badgeLeft.textContent = 'ВАРИТСЯ';
        badgeLeft.style.setProperty('--badge-bg', '#ffaa00');
      } else if (hasLifted) {
        badgeLeft.hidden = false;
        badgeLeft.textContent = 'ГОТОВА';
        badgeLeft.style.setProperty('--badge-bg', '#00f5d4');
      } else {
        badgeLeft.hidden = true;
      }
    }

    const needsSinkWash =
      (rt.dirtyInSink?.length || 0) > 0 && (rt.cleanBowls ?? 10) <= 2;

    if (leftEdge && leftLabel) {
      if (rt.activeSector !== 0 && (hasAlDente || hasOver || hasBoiling)) {
        leftEdge.classList.add('is-visible');
        const color = hasAlDente ? '#10f56c' : hasOver ? '#ff385c' : '#ffaa00';
        leftEdge.style.setProperty('--alert-color', color);
        leftLabel.textContent = hasAlDente ? 'AL DENTE!' : hasOver ? 'ГОРИТ!' : 'ВАРКА';
      } else if (rt.activeSector !== -1 && needsSinkWash) {
        leftEdge.classList.add('is-visible');
        leftEdge.style.setProperty('--alert-color', '#00f5d4');
        leftLabel.textContent = `МОЙКА (${rt.dirtyInSink.length})`;
      } else {
        leftEdge.classList.remove('is-visible');
      }
    }

    if (badgeCenter) {
      if (rt.currentCustomer && rt.activeSector !== 1) {
        badgeCenter.hidden = false;
        badgeCenter.textContent = `${Math.round(rt.currentCustomer.patience)}%`;
        badgeCenter.style.setProperty(
          '--badge-bg',
          rt.currentCustomer.patience < 40 ? '#ff385c' : '#00f5d4'
        );
      } else {
        badgeCenter.hidden = true;
      }
    }

    const unlockedTop = gameState.getUnlockedToppings();
    const hasEmptyTray = unlockedTop.some((id) => (gameState.persistent.trayStock[id] ?? 0) === 0);
    const hasDelivery = Boolean(rt.activeDelivery);

    if (badgeRight) {
      if (hasDelivery) {
        badgeRight.hidden = false;
        badgeRight.textContent = `${Math.ceil(rt.activeDelivery.remainingSec)}с`;
        badgeRight.style.setProperty(
          '--badge-bg',
          rt.activeDelivery.remainingSec < 12 ? '#ff385c' : '#00f5d4'
        );
      } else if (hasEmptyTray) {
        badgeRight.hidden = false;
        badgeRight.textContent = 'ПУСТО!';
        badgeRight.style.setProperty('--badge-bg', '#ffaa00');
      } else {
        badgeRight.hidden = true;
      }
    }

    if (rightEdge && rightLabel) {
      if (rt.activeSector !== 2 && (hasDelivery || hasEmptyTray)) {
        rightEdge.classList.add('is-visible');
        const urgent = hasDelivery && rt.activeDelivery.remainingSec < 12;
        const color = urgent ? '#ff385c' : hasDelivery ? '#00f5d4' : '#ffaa00';
        rightEdge.style.setProperty('--alert-color', color);
        rightLabel.textContent = hasDelivery
          ? `КУРЬЕР ${Math.ceil(rt.activeDelivery.remainingSec)}С`
          : 'ЛОТОК ПУСТ';
      } else {
        rightEdge.classList.remove('is-visible');
      }
    }
  }

  updateDeliveryTimerDOM() {
    // Таймер отображается directement на 3D-голограмме шлюза и в окне курьера
  }

  renderRightSectorDOM() {
    this.updateEdgeAlerts();
  }

  renderAllKitchen() {
    const sauceCanvas = document.getElementById('sauce-gesture-canvas');
    if (sauceCanvas) {
      sauceCanvas.classList.toggle('is-active', gameState.runtime.sauceModeArmed);
    }
    this.updateEdgeAlerts();
  }
}
