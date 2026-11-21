import { GAME_CONFIG } from './config.js?v=108';
import { gameState } from './state.js?v=108';
import { audio } from './audio.js?v=108';

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

    // 3. Таймер остывания блюда на подносе / в пакете, на центральной и на правой резервной столешнице
    if (rt.assembly && rt.assembly.vessel && (rt.assembly.vessel.broth || rt.assembly.vessel.noodleState)) {
      rt.assembly.vessel.tableAgeSec = (rt.assembly.vessel.tableAgeSec || 0) + dt;
    }
    if (Array.isArray(rt.centerItems)) {
      for (const item of rt.centerItems) {
        if (item.vessel && (item.vessel.broth || item.vessel.noodleState)) {
          item.vessel.tableAgeSec = (item.vessel.tableAgeSec || 0) + dt;
        }
      }
    }
    if (Array.isArray(rt.reserveItems)) {
      for (const item of rt.reserveItems) {
        if (item.vessel && (item.vessel.broth || item.vessel.noodleState)) {
          item.vessel.tableAgeSec = (item.vessel.tableAgeSec || 0) + dt;
        }
      }
    }

    // 3Б. Очередь протекания мусорного пакета под раковиной:
    // Каждая выброшенная порция бульона созревает строго ПО ОЧЕРЕДИ (~5-6.5 сек после завершения предыдущего растекания),
    // плавно расширяя лужу, меняя её органичную форму и скрещивая цвета разных бульонов!
    if (rt.trashLeak) {
      const tl = rt.trashLeak;
      if (!Array.isArray(tl.queue)) tl.queue = [];
      const curS = tl.puddleSpread || 0;
      const tgtS = tl.targetSpread || 0;
      const curM = tl.puddleMorph || 0;
      const tgtM = tl.targetMorph || 0;

      // 1) Неторопливое, физически правдоподобное расползание и плавная деформация контура лужи
      const isSpreading = curS < tgtS - 0.002 || curM < tgtM - 0.002;
      if (curS < tgtS) {
        tl.puddleSpread = Math.min(tgtS, curS + dt * 0.062);
      }
      if (curM < tgtM) {
        tl.puddleMorph = Math.min(tgtM, curM + dt * 0.14);
      }

      // 2) Только когда текущее растекание завершилось, начинает отсчитывать задержку СЛЕДУЮЩАЯ порция из очереди!
      if (!isSpreading && tl.queue.length > 0) {
        const nextLeak = tl.queue[0];
        nextLeak.delay -= dt;
        if (nextLeak.delay <= 0) {
          tl.queue.shift();
          const prevN = tl.activeCount || 0;
          const addCol = Array.isArray(nextLeak.color) ? nextLeak.color : [0.92, 0.74, 0.44];

          // Смешиваем цвет лужи только в момент, когда эта порция реально просочилась в лужу!
          if (!Array.isArray(tl.color) || prevN === 0) {
            tl.color = [...addCol];
          } else {
            const w = 1 / (prevN + 1);
            tl.color = [
              +(tl.color[0] * (1 - w) + addCol[0] * w).toFixed(3),
              +(tl.color[1] * (1 - w) + addCol[1] * w).toFixed(3),
              +(tl.color[2] * (1 - w) + addCol[2] * w).toFixed(3)
            ];
          }

          tl.activeCount = prevN + 1;
          tl.broth = nextLeak.broth || tl.broth || 'tonkotsu';

          // Каждая новая порция плавно увеличивает площадь и сдвигает фазу формы (прорывая новые «языки» жидкости!)
          const spreadSteps = [0.44, 0.74, 0.94, 1.0];
          const morphSteps = [0.55, 1.38, 2.2, 2.85];
          const stepIdx = Math.min(spreadSteps.length - 1, prevN);
          tl.targetSpread = Math.max(tl.targetSpread || 0, spreadSteps[stepIdx]);
          tl.targetMorph = Math.max(tl.targetMorph || 0, morphSteps[stepIdx]);

          if (prevN === 0) {
            audio.playTapPop();
            this.onToast(
              '💦 Из-под мусорки под раковиной начал подтекать бульон — можно вытереть в мойке (Сектор -1).',
              '#ffaa00'
            );
          }
        }
      }
    }

    // 4. Таймеры гостей, которые едят из керамических мисок и затем оставляют грязную миску на ЛЕВОЙ полке прилавка (слева от котика)!
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
          rt.dirtyShelfLeft.push(dirtyBowl);
          audio.playTapPop();
          this.onToast(
            '🍽️ Гость доел и оставил грязную миску на левой полке прилавка!',
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

  isAccessoryItem(v) {
    return Boolean(v && (v.type === 'drink' || v.type === 'chopsticks'));
  }

  isFoodVessel(v) {
    return Boolean(v && (v.type === 'bowl' || v.type === 'box'));
  }

  getItemLabel(v) {
    if (!v || !v.type) return 'предмет';
    if (v.type === 'bowl') return '🍜 Миска';
    if (v.type === 'box') return '📦 Коробка';
    if (v.type === 'chopsticks') return '🥢 Палочки';
    if (v.type === 'drink') {
      const cfg = GAME_CONFIG.DRINKS?.[v.drinkId];
      return cfg ? `${cfg.emoji} ${cfg.name}` : '🥤 Напиток';
    }
    return 'предмет';
  }

  isVesselEmptyOfFood(v) {
    if (!v || !v.type) return true;
    return !v.broth && !v.noodleState && (!v.toppings || v.toppings.length === 0);
  }

  areBothHandsBusy() {
    const rt = gameState.runtime;
    return Boolean(rt.activeVessel && rt.activeVessel.type && rt.rightHandVessel && rt.rightHandVessel.type);
  }

  blockIfBothHandsBusy() {
    if (!this.areBothHandsBusy()) return false;
    const rt = gameState.runtime;
    if (this.isAccessoryItem(rt.rightHandVessel)) {
      audio.playPenaltyBuzz();
      this.onToast(
        `🙌 Обе руки заняты! Поставьте ${this.getItemLabel(rt.rightHandVessel)} из правой руки на стол или на поднос.`,
        '#ffaa00'
      );
      return true;
    }
    const leftEmpty = this.isVesselEmptyOfFood(rt.activeVessel);
    const rightEmpty = this.isVesselEmptyOfFood(rt.rightHandVessel);
    audio.playPenaltyBuzz();
    this.onToast(
      leftEmpty && !rightEmpty
        ? '🙌 Обе руки заняты! Тапните по пустой посуде слева, чтобы перелить, или верните пустую на склад ▶'
        : !leftEmpty && !rightEmpty
          ? '🙌 В обеих руках еда! Поставьте одну посуду на поднос или тапните по левой, чтобы перелить.'
          : '🙌 Обе руки заняты! Верните лишнюю пустую посуду обратно на склад справа ▶',
      '#ffaa00'
    );
    return true;
  }

  // Тап прямо по пустой посуде в ЛЕВОЙ руке:
  // 1) Если обе руки заняты (левая пустая, правая с едой) -> ПЕРЕЛИВАЕМ из правой руки в левую (грязная миска уходит на мойку)!
  // 2) Если в Секторе 2 в левой руке одна пустая посуда -> возвращаем её в стопку!
  handleHeldLeftVesselTap() {
    const rt = gameState.runtime;
    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);
    if (!hasLeft) return null;

    if (hasRight) {
      const leftEmpty = this.isVesselEmptyOfFood(left);
      if (this.isAccessoryItem(right)) {
        if (leftEmpty && rt.activeSector === 2 && !rt.fridgeOpen) {
          return this.setVesselType(left.type);
        }
        audio.playPenaltyBuzz();
        this.onToast(
          `🙌 В правой руке ${this.getItemLabel(right)} — поставьте на стол или поднос!`,
          '#ffaa00'
        );
        return null;
      }
      const rightEmpty = this.isVesselEmptyOfFood(right);
      if (!rightEmpty) {
        const prevLeft = JSON.parse(JSON.stringify(left));
        const srcRight = JSON.parse(JSON.stringify(right));
        const targetType = left.type;
        const fromType = srcRight.type;

        const bothHaveBroth = Boolean(prevLeft.broth && srcRight.broth);
        const bothHaveNoodles = Boolean(prevLeft.noodleState && srcRight.noodleState);
        const leftFull = Boolean(prevLeft.broth && prevLeft.noodleState);
        const rightFull = Boolean(srcRight.broth && srcRight.noodleState);
        const mergedToppings = [...(prevLeft.toppings || []), ...(srcRight.toppings || [])];
        const topOverflow = Math.max(0, mergedToppings.length - 6);

        // Определяем силу перелива через край:
        // 0 — чисто (в пустую тару, или соединили лапшу с бульоном без переполнения);
        // 1 — небольшой перелив (и там и там бульон, либо к полному блюду долили бульон/лапшу, либо >6 топпингов);
        // 2 — мощный перелив (в обеих руках и бульон, и лапша -> заливаем стол бульоном и лапшой!).
        let spillLevel = 0;
        if (leftFull && rightFull) {
          spillLevel = 2;
        } else if (
          bothHaveBroth ||
          bothHaveNoodles ||
          ((leftFull || rightFull) && !leftEmpty) ||
          topOverflow > 0
        ) {
          spillLevel = 1;
        }

        // Если в обеих тарах была лапша — берём более проблемную проварку (over > under > aldente)
        const noodleRank = { over: 3, under: 2, aldente: 1 };
        let mergedNoodle = prevLeft.noodleState || srcRight.noodleState;
        if (prevLeft.noodleState && srcRight.noodleState) {
          mergedNoodle =
            (noodleRank[prevLeft.noodleState] || 0) >= (noodleRank[srcRight.noodleState] || 0)
              ? prevLeft.noodleState
              : srcRight.noodleState;
        }

        const mergedBroth = prevLeft.broth || srcRight.broth;
        const spillBroth = srcRight.broth || prevLeft.broth || 'tonkotsu';

        rt.activeVessel = {
          type: targetType,
          broth: mergedBroth,
          noodleState: mergedNoodle,
          toppings: mergedToppings.slice(0, 6),
          tableAgeSec: Math.max(prevLeft.tableAgeSec || 0, srcRight.tableAgeSec || 0),
          wasStagedOnTable: Boolean(prevLeft.wasStagedOnTable || srcRight.wasStagedOnTable),
          overflowCount: (prevLeft.overflowCount || 0) + (srcRight.overflowCount || 0) + spillLevel + topOverflow
        };
        rt.rightHandVessel = null;
        rt.vesselHeldInLeft = true;

        if (fromType === 'bowl') {
          rt.dirtyInSink.push({ broth: srcRight.broth || 'tonkotsu' });
        }

        if (spillLevel > 0) {
          if (!rt.tableSpill) {
            rt.tableSpill = { level: 0, broth: spillBroth, hasNoodles: false };
          }
          const prevSpillLvl = rt.tableSpill.level || 0;
          rt.tableSpill.level = Math.min(2, prevSpillLvl > 0 ? Math.max(prevSpillLvl + 1, spillLevel) : spillLevel);
          rt.tableSpill.broth = spillBroth;
          rt.tableSpill.hasNoodles = Boolean(
            rt.tableSpill.hasNoodles || (spillLevel >= 2 && (prevLeft.noodleState || srcRight.noodleState))
          );

          // Если поднос уже стоит на столе — брызги сразу пачкают и его!
          if (rt.assembly && rt.assembly.hasTray) {
            rt.assembly.isDirtyTray = true;
            rt.assembly.dirtyTrayBroth = spillBroth;
          }

          const wasteCost = spillLevel >= 2 ? 22 : 10;
          rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + wasteCost;
          rt.dailyStats.penalties += wasteCost;

          audio.playSauceSizzle();
          audio.playPenaltyBuzz();
          this.onToast(
            spillLevel >= 2
              ? `💦 МОЩНЫЙ ПЕРЕЛИВ! Бульон с лапшой залил столешницу (-¥${wasteCost})! Вытрите стол тряпкой 🧽 перед подачей!`
              : `💦 Перелив через край! Бульон пролился на стол (-¥${wasteCost}) — вытрите лужу тряпкой 🧽!`,
            '#ff385c'
          );
        } else {
          audio.playSauceSizzle();
          this.onToast(
            fromType === 'bowl'
              ? `📦 Перелито в ${targetType === 'box' ? 'коробку' : 'миску'}! Грязная миска ушла на мойку (в мойке: ${rt.dirtyInSink.length})`
              : `🍜 Перелито в ${targetType === 'box' ? 'коробку' : 'миску'}!`,
            '#00f5d4'
          );
        }

        this.renderAllKitchen();
        return {
          action: 'pour_right_to_left',
          fromType,
          toType: targetType,
          vessel: JSON.parse(JSON.stringify(rt.activeVessel)),
          prevLeft,
          rightSource: srcRight,
          spillLevel,
          spillBroth
        };
      }
      audio.playTapPop();
      this.onToast('😄 В правой руке пустая посуда — переливать нечего! Верните лишнюю на склад ▶', '#ffaa00');
      return null;
    }

    // Если правая рука свободна, левая держит пустую посуду и мы на складе (Сектор 2) -> возвращаем пустую в стопку!
    if (rt.activeSector === 2 && this.isVesselEmptyOfFood(left)) {
      const prevType = left.type;
      if (prevType === 'bowl') {
        rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
      } else if (prevType === 'box') {
        rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - 8);
      }
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        prevType === 'bowl'
          ? `🍜 Пустая миска возвращена в стопку (чистых: ${rt.cleanBowls}/10)`
          : '📦 Пустая вок-коробка возвращена в стопку (+¥8)',
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'return_left_empty', type: prevType };
    }

    return null;
  }

  handleBasketAction(index) {
    if (this.blockIfBothHandsBusy()) return;
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
    if (this.blockIfBothHandsBusy()) return;
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
    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);
    const leftEmpty = !hasLeft || this.isVesselEmptyOfFood(left);
    const rightEmpty = !hasRight || this.isVesselEmptyOfFood(right);

    // =========================================================================
    // ВЕТКА 1: ОБЕ РУКИ ЗАНЯТЫ (hasLeft && hasRight)
    // =========================================================================
    if (hasLeft && hasRight) {
      // 1.0 В правой руке напиток или палочки: если в левой пустая посуда нужной стопки — спокойно возвращаем её левой рукой!
      if (this.isAccessoryItem(right)) {
        if (leftEmpty && left.type === type) {
          if (type === 'bowl') {
            rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
          } else if (type === 'box') {
            rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - 8);
          }
          rt.activeVessel = this.createEmptyVessel(null);
          rt.vesselHeldInLeft = false;
          rt.sauceModeArmed = false;
          audio.playTapPop();
          this.onToast(
            type === 'bowl'
              ? `🍜 Пустая миска возвращена в стопку (${rt.cleanBowls}/10), ${this.getItemLabel(right)} остаётся в правой руке.`
              : `📦 Пустая коробка возвращена в стопку (+¥8), ${this.getItemLabel(right)} остаётся в правой руке.`,
            '#00f5d4'
          );
          this.renderAllKitchen();
          return { action: 'return_left_empty', type };
        }
        audio.playPenaltyBuzz();
        this.onToast(
          `🙌 Обе руки заняты! Поставьте ${this.getItemLabel(right)} из правой руки на стол или на поднос.`,
          '#ffaa00'
        );
        return false;
      }

      // 1А. В обеих руках ТОЛЬКО ПУСТАЯ посуда (например, 2 пустые тарелки «для прикола и реалистичности»):
      // Тап по стопке возвращает правой рукой пустую обратно в стопку, оставляя в левой пустую!
      if (leftEmpty && rightEmpty) {
        if (right.type === type) {
          if (type === 'bowl') {
            rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
          } else if (type === 'box') {
            rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - 8);
          }
          rt.rightHandVessel = null;
          audio.playTapPop();
          this.onToast(
            type === 'bowl'
              ? `🍜 Пустая миска из правой руки возвращена в стопку (чистых: ${rt.cleanBowls}/10)`
              : '📦 Пустая коробка из правой руки возвращена в стопку (+¥8)',
            '#00f5d4'
          );
          this.renderAllKitchen();
          return { action: 'return_stack_right', type };
        }
        if (left.type === type) {
          if (type === 'bowl') {
            rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
          } else if (type === 'box') {
            rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - 8);
          }
          const moved = JSON.parse(JSON.stringify(right));
          rt.activeVessel = moved;
          rt.rightHandVessel = null;
          audio.playTapPop();
          this.onToast(
            type === 'bowl'
              ? `🍜 Пустая миска возвращена в стопку (чистых: ${rt.cleanBowls}/10)`
              : '📦 Пустая коробка возвращена в стопку (+¥8)',
            '#00f5d4'
          );
          this.renderAllKitchen();
          return { action: 'return_left_and_handoff_back', leftType: type, rightVessel: moved };
        }
        return false;
      }

      // 1Б. В левой ПУСТАЯ, в правой ПОЛНАЯ (с едой):
      // Тап по стопке того же типа, что в левой руке -> кладём чистую пустую из левой руки обратно в стопку
      // и перекладываем полную посуду из правой руки обратно в левую!
      if (leftEmpty && !rightEmpty) {
        if (left.type !== type) {
          audio.playPenaltyBuzz();
          this.onToast(
            left.type === 'bowl'
              ? 'Сначала верните пустую 🍜 миску в стопку мисок (или тапните по ней слева, чтобы перелить)!'
              : 'Сначала верните пустую 📦 коробку в стопку коробок (или тапните по ней слева, чтобы перелить)!',
            '#ffaa00'
          );
          return false;
        }
        if (type === 'bowl') {
          rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
        } else if (type === 'box') {
          rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - 8);
        }
        const restored = JSON.parse(JSON.stringify(right));
        rt.activeVessel = restored;
        rt.rightHandVessel = null;
        rt.vesselHeldInLeft = true;
        audio.playTapPop();
        this.onToast(
          type === 'bowl'
            ? `🍜 Пустая миска возвращена (${rt.cleanBowls}/10), рамен переложен обратно в левую руку!`
            : '📦 Пустая коробка возвращена (+¥8), рамен переложен обратно в левую руку!',
          '#00f5d4'
        );
        this.renderAllKitchen();
        return { action: 'return_left_and_handoff_back', leftType: type, rightVessel: restored };
      }

      if (!leftEmpty && !rightEmpty) {
        audio.playPenaltyBuzz();
        this.onToast(
          '🙌 В обеих руках еда! Поставьте одну посуду на поднос или тапните по левой, чтобы перелить.',
          '#ffaa00'
        );
      }

      return false;
    }

    // =========================================================================
    // ВЕТКА 2: В ЛЕВОЙ РУКЕ ПОЛНАЯ (С ЕДОЙ), ПРАВАЯ СВОБОДНА
    // -> Перекладываем полную в ПРАВУЮ руку и берём чистую пустую (type) в ЛЕВУЮ!
    //    Переливание НЕ происходит сразу — только по тапу по пустой посуде в левой руке!
    // =========================================================================
    if (hasLeft && !leftEmpty && !hasRight) {
      if (type === 'bowl') {
        if ((rt.cleanBowls ?? 10) <= 0) {
          audio.playPenaltyBuzz();
          this.onToast('🍽️ Чистые миски закончились (0/10)! Помойте посуду в раковине слева!', '#ff385c');
          return false;
        }
        rt.cleanBowls = Math.max(0, (rt.cleanBowls ?? 10) - 1);
      } else if (type === 'box') {
        rt.dailyStats.restockSpent = (rt.dailyStats.restockSpent || 0) + 8;
      }

      const fullMoved = JSON.parse(JSON.stringify(left));
      rt.rightHandVessel = fullMoved;
      rt.activeVessel = this.createEmptyVessel(type);
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        type === 'box'
          ? '🙌 Рамен в правой, 📦 пустая коробка в левой (-¥8)! Тапните по коробке слева, чтобы перелить (или верните в стопку).'
          : `🙌 Рамен в правой, 🍜 чистая миска в левой (${rt.cleanBowls}/10)! Тапните по миске слева, чтобы перелить (или верните в стопку).`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'handoff_and_grab_left', grabType: type, rightVessel: fullMoved };
    }

    // =========================================================================
    // ВЕТКА 3: В ЛЕВОЙ РУКЕ ПУСТАЯ, ПРАВАЯ СВОБОДНА
    // -> Если тапаем по СВОЕЙ стопке (миска -> миски, коробка -> коробки):
    //    ВОЗВРАЩАЕМ пустую посуду из левой руки обратно в стопку (руки свободны!).
    //    В руках никогда не может быть двух одинаковых пустых тарелок или двух пустых коробок!
    // -> Если тапаем по ДРУГОЙ стопке (миска -> коробки или коробка -> миски):
    //    правой рукой берём пустую посуду другого типа.
    // =========================================================================
    if (hasLeft && leftEmpty && !hasRight) {
      if (left.type === type) {
        if (type === 'bowl') {
          rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
        } else if (type === 'box') {
          rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - 8);
        }
        rt.activeVessel = this.createEmptyVessel(null);
        rt.vesselHeldInLeft = false;
        rt.sauceModeArmed = false;
        audio.playTapPop();
        this.onToast(
          type === 'bowl'
            ? `🍜 Пустая миска возвращена в стопку (чистых: ${rt.cleanBowls}/10)`
            : '📦 Пустая вок-коробка возвращена в стопку (+¥8)',
          '#00f5d4'
        );
        this.renderAllKitchen();
        return { action: 'return_left_empty', type };
      }

      if (type === 'bowl') {
        if ((rt.cleanBowls ?? 10) <= 0) {
          audio.playPenaltyBuzz();
          this.onToast('🍽️ Чистые миски закончились (0/10)! Помойте посуду в раковине слева!', '#ff385c');
          return false;
        }
        rt.cleanBowls = Math.max(0, (rt.cleanBowls ?? 10) - 1);
      } else if (type === 'box') {
        rt.dailyStats.restockSpent = (rt.dailyStats.restockSpent || 0) + 8;
      }

      rt.rightHandVessel = this.createEmptyVessel(type);
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        type === 'bowl'
          ? `🙌 Пустая миска взята в правую руку (${rt.cleanBowls}/10)! Тапните по любой стопке, чтобы вернуть лишнюю посуду.`
          : '🙌 Пустая коробка взята в правую руку (-¥8)! Тапните по любой стопке, чтобы вернуть лишнюю посуду.',
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'grab_stack_right', type };
    }

    // =========================================================================
    // ВЕТКА 4: ОБЕ РУКИ СВОБОДНЫ -> берём чистую посуду в левую руку
    // =========================================================================
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
    return { action: 'grab_stack_left', type };
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

  // Выбрасывание в мусорку под раковиной (Сектор -1):
  // - Коробка (пустая или полная): выбрасывается целиком в мусорку (если была в левой при миске в правой -> миска переходит в левую!).
  // - Наполненная миска (когда коробок в руках нет): содержимое вываливается в мусорку, а сама грязная миска ставится в мойку!
  // - Пустая чистая миска: не выбрасывается (верните в стопку на складе).
  disposeHeldVesselToTrash() {
    const rt = gameState.runtime;
    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);

    if (!hasLeft && !hasRight) {
      audio.playPenaltyBuzz();
      this.onToast('🗑️ В руках ничего нет — возьмите 📦 Коробку или наполненную 🍜 Миску!', '#ffaa00');
      return null;
    }

    const leftIsBox = hasLeft && left.type === 'box';
    const rightIsBox = hasRight && right.type === 'box';
    const rightIsAcc = hasRight && this.isAccessoryItem(right);
    const leftFilledBowl = hasLeft && left.type === 'bowl' && !this.isVesselEmptyOfFood(left);
    const rightFilledBowl = hasRight && right.type === 'bowl' && !this.isVesselEmptyOfFood(right);

    if (!leftIsBox && !rightIsBox && !leftFilledBowl && !rightFilledBowl && !rightIsAcc) {
      audio.playPenaltyBuzz();
      this.onToast('🍜 Пустую чистую миску не выбрасывают — верните её в стопку на складе ▶!', '#ffaa00');
      return null;
    }

    let tossed = null;
    let fromRight = false;
    let handoffBack = false;
    let rightBowl = null;
    let isBowlDumpToTrash = false;

    if (rightIsBox) {
      // В правой руке коробка (в левой миска или вторая коробка) -> выбрасываем коробку из ПРАВОЙ руки, левая остаётся!
      tossed = JSON.parse(JSON.stringify(right));
      rt.rightHandVessel = null;
      fromRight = true;
    } else if (leftIsBox && hasRight && !rightIsAcc) {
      // В левой руке коробка, в правой руке миска -> выбрасываем коробку из ЛЕВОЙ руки, миска переходит из правой в левую!
      tossed = JSON.parse(JSON.stringify(left));
      rightBowl = JSON.parse(JSON.stringify(right));
      rt.activeVessel = rightBowl;
      rt.rightHandVessel = null;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      handoffBack = true;
    } else if (leftIsBox) {
      // В левой руке коробка (правая пустая или держит напиток/палочки) -> выбрасываем коробку из левой руки!
      tossed = JSON.parse(JSON.stringify(left));
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
    } else if (rightFilledBowl) {
      // Наполненная миска в правой руке -> вываливаем содержимое в мусорку, а грязную миску ставим в мойку!
      tossed = JSON.parse(JSON.stringify(right));
      rt.rightHandVessel = null;
      rt.dirtyInSink.push({ broth: tossed.broth || 'tonkotsu' });
      fromRight = true;
      isBowlDumpToTrash = true;
    } else if (leftFilledBowl && hasRight && !rightIsAcc) {
      // Наполненная миска в левой руке, в правой пустая миска -> вываливаем левую в мусорку, ставим её в мойку, правую перекладываем в левую!
      tossed = JSON.parse(JSON.stringify(left));
      rightBowl = JSON.parse(JSON.stringify(right));
      rt.activeVessel = rightBowl;
      rt.rightHandVessel = null;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      rt.dirtyInSink.push({ broth: tossed.broth || 'tonkotsu' });
      handoffBack = true;
      isBowlDumpToTrash = true;
    } else if (leftFilledBowl) {
      // Наполненная миска в левой руке (правая пустая или держит напиток/палочки) -> вываливаем содержимое в мусорку, грязную миску в мойку!
      tossed = JSON.parse(JSON.stringify(left));
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
      rt.dirtyInSink.push({ broth: tossed.broth || 'tonkotsu' });
      isBowlDumpToTrash = true;
    } else if (rightIsAcc) {
      // В правой руке напиток или палочки -> выбрасываем в мусорку!
      tossed = JSON.parse(JSON.stringify(right));
      rt.rightHandVessel = null;
      fromRight = true;
    }

    const hadFood = this.isFoodVessel(tossed) && !this.isVesselEmptyOfFood(tossed);
    if (tossed && tossed.broth) {
      const brothRgbMap = {
        tonkotsu: [0.92, 0.74, 0.44],
        chili_broth: [0.95, 0.18, 0.2],
        miso_mushroom: [0.68, 0.18, 0.92]
      };
      const addCol = brothRgbMap[tossed.broth] || brothRgbMap.tonkotsu;
      if (!rt.trashLeak) {
        rt.trashLeak = {
          queue: [],
          activeCount: 0,
          puddleSpread: 0,
          targetSpread: 0,
          puddleMorph: 0,
          targetMorph: 0,
          seed: 1.37,
          broth: tossed.broth,
          color: null
        };
      }
      if (!Array.isArray(rt.trashLeak.queue)) rt.trashLeak.queue = [];
      // Ставим каждую порцию бульона в ОЧЕРЕДЬ с собственной задержкой (~5-6.5 сек), чтобы протекания шли строго по очереди!
      rt.trashLeak.queue.push({
        delay: 4.8 + Math.random() * 1.6,
        broth: tossed.broth,
        color: [...addCol]
      });
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
        isBowlDumpToTrash
          ? `🗑️ Содержимое миски выброшено в мусорку (-¥${wasteCost}), грязная миска поставлена в мойку!`
          : handoffBack
            ? `🗑️ Коробка выброшена (-¥${wasteCost}), миска переложена в левую руку!`
            : `🗑️ Коробка выброшена в мусорку! Списаны продукты (-¥${wasteCost})`,
        '#ff385c'
      );
    } else {
      audio.playTapPop();
      this.onToast(
        this.isAccessoryItem(tossed)
          ? `🗑️ ${this.getItemLabel(tossed)} выброшены в мусорку.`
          : handoffBack
            ? '🗑️ Пустая коробка выброшена в мусорку, миска переложена в левую руку!'
            : '🗑️ Пустая коробка выброшена в мусорку',
        '#ffaa00'
      );
    }

    this.renderAllKitchen();
    return {
      vessel: tossed,
      fromRight,
      handoffBack,
      rightBowl,
      isBowlDumpToTrash
    };
  }

  clearActiveVessel() {
    return this.disposeHeldVesselToTrash();
  }

  handleToppingTap(toppingId) {
    if (this.blockIfBothHandsBusy()) return;
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
    if (this.blockIfBothHandsBusy()) return;
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

  // Проверяет, собран ли на столе заказ (поднос или пакет, на котором лежит хоть что-то: посуда, палочки или напиток)
  hasAssembledOrder() {
    const a = gameState.runtime.assembly;
    if (!a) return false;
    return Boolean((a.hasTray || a.hasBag) && (a.vessel || a.hasChopsticks || a.drink));
  }

  // Достать поднос из-под прилавка и поставить на центральную столешницу:
  // - Если в правой руке банка или палочки (а стол пуст) -> достаём поднос ЛЕВОЙ рукой, банка/палочки остаются в правой!
  // - Если на столе стоит ровно 1 банка или палочки (руки свободны) -> правая приподнимает их, ЛЕВАЯ ставит поднос, правая кладёт на поднос!
  // - Если на столе стоит ровно 1 миска/коробка (руки свободны) -> левая приподнимает её, правая ставит поднос, левая ставит на поднос!
  takeTrayFromUnderCounter() {
    if (this.blockIfBothHandsBusy()) return false;
    const rt = gameState.runtime;
    if (!rt.assembly) {
      rt.assembly = { hasTray: false, hasBag: false, vessel: null, hasChopsticks: false, drink: null };
    }
    if (rt.assembly.hasTray) {
      audio.playPenaltyBuzz();
      this.onToast('🍱 Поднос уже стоит на столешнице!', '#ffaa00');
      return false;
    }

    const centerCount = Array.isArray(rt.centerItems) ? rt.centerItems.length : 0;
    const hasLeft = Boolean(rt.activeVessel && rt.activeVessel.type);
    const hasRight = Boolean(rt.rightHandVessel && rt.rightHandVessel.type);
    const hasAnyInHands = hasLeft || hasRight;

    if (centerCount > 1) {
      audio.playPenaltyBuzz();
      this.onToast(
        `🚫 На столе слишком много предметов (${centerCount} шт.) — оставьте максимум 1 предмет или освободите место под поднос!`,
        '#ffaa00'
      );
      return false;
    }

    let autoMoveItem = null;
    let leftHandOnly = Boolean(!hasLeft && hasRight);

    if (centerCount === 1) {
      if (hasAnyInHands) {
        audio.playPenaltyBuzz();
        this.onToast(
          '🚫 Освободите руки, чтобы приподнять стоящий на столе предмет и поставить под него поднос!',
          '#ffaa00'
        );
        return false;
      }
      autoMoveItem = rt.centerItems.pop();
      const soloV = autoMoveItem.vessel;
      if (soloV?.type === 'drink') {
        rt.assembly.drink = soloV.drinkId || 'cola';
        leftHandOnly = true;
      } else if (soloV?.type === 'chopsticks') {
        rt.assembly.hasChopsticks = true;
        leftHandOnly = true;
      } else {
        rt.assembly.vessel = JSON.parse(JSON.stringify(soloV));
        leftHandOnly = false;
      }
    }

    rt.assembly.hasTray = true;
    rt.cameraFocus = 'worktable';
    rt.underCounterSide = 0;

    // Если на рабочей поверхности осталась невытертая лужа бульона -> поднос сразу пачкается!
    if (rt.tableSpill && rt.tableSpill.level > 0) {
      rt.assembly.isDirtyTray = true;
      rt.assembly.dirtyTrayBroth = rt.tableSpill.broth || 'tonkotsu';
      audio.playPenaltyBuzz();
      this.onToast(
        autoMoveItem
          ? '💦 Поднос поставлен прямо на грязную лужу и испачкался! Предмет переставлен на поднос — вытрите стол и поднос тряпкой 🧽!'
          : '💦 Поднос поставлен прямо на грязную лужу и испачкался! Вытрите стол и поднос тряпкой 🧽 перед подачей!',
        '#ff385c'
      );
    } else {
      rt.assembly.isDirtyTray = false;
      rt.assembly.dirtyTrayBroth = null;
      audio.playTapPop();
      if (autoMoveItem) {
        this.onToast(
          `🍱 Поднос поставлен ${leftHandOnly ? 'левой рукой' : 'правой рукой'}, ${this.getItemLabel(autoMoveItem.vessel)} — на подносе!`,
          '#00f5d4'
        );
      } else if (leftHandOnly && hasRight) {
        this.onToast(
          `🍱 Поднос поставлен левой рукой! ${this.getItemLabel(rt.rightHandVessel)} остаётся в правой руке.`,
          '#00f5d4'
        );
      } else {
        this.onToast('🍱 Поднос поставлен на стол! Ставьте на него блюдо, напиток и палочки.', '#00f5d4');
      }
    }
    this.renderAllKitchen();
    return { autoMoveItem, leftHandOnly };
  }

  // Вытереть пролитый бульон на столешнице (и грязный поднос, если он стоит в луже) кухонной тряпкой!
  wipeTableSpill() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    const spill = rt.tableSpill || { level: 0, broth: 'tonkotsu', hasNoodles: false };
    const hasSpill = (spill.level || 0) > 0;
    const hasDirtyTray = Boolean(rt.assembly && rt.assembly.hasTray && rt.assembly.isDirtyTray);

    if (!hasSpill && !hasDirtyTray) {
      audio.playTapPop();
      this.onToast('✨ Рабочая поверхность идеально чистая!', '#00f5d4');
      return null;
    }

    const res = {
      prevLevel: Math.max(1, spill.level || 0),
      hadTray: hasDirtyTray,
      broth: spill.broth || rt.assembly?.dirtyTrayBroth || 'tonkotsu',
      hasNoodles: Boolean(spill.hasNoodles)
    };

    rt.tableSpill = { level: 0, broth: 'tonkotsu', hasNoodles: false };
    if (rt.assembly) {
      rt.assembly.isDirtyTray = false;
      rt.assembly.dirtyTrayBroth = null;
    }

    audio.playTapPop();
    this.onToast(
      hasDirtyTray
        ? '🧽 Столешница и поднос чисто вытерты тряпкой!'
        : '🧽 Лужа на столе вытерта тряпкой — теперь можно ставить поднос!',
      '#10f56c'
    );
    this.renderAllKitchen();
    return res;
  }

  // Достать бумажный пакет для заказа «с собой» из-под прилавка:
  // - Если в правой руке банка или палочки (а стол пуст) -> ставим пакет ЛЕВОЙ рукой, предмет остаётся в правой!
  // - Если на столе стоит ровно 1 банка или палочки (руки свободны) -> правая приподнимает, ЛЕВАЯ ставит пакет, правая убирает внутрь!
  // - Если на столе стоит ровно 1 коробка (руки свободны) -> левая приподнимает, правая ставит пакет, левая запечатывает и опускает внутрь!
  // - Если стоял поднос с заказом -> перекладывание заказа с подноса в пакет!
  takeBagFromUnderCounter() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    if (!rt.assembly) {
      rt.assembly = { hasTray: false, hasBag: false, vessel: null, hasChopsticks: false, drink: null };
    }
    if (rt.assembly.hasBag) {
      audio.playPenaltyBuzz();
      this.onToast('🛍️ Пакет уже стоит на столе!', '#ffaa00');
      return null;
    }

    const centerCount = !rt.assembly.hasTray && Array.isArray(rt.centerItems) ? rt.centerItems.length : 0;
    const hasLeft = Boolean(rt.activeVessel && rt.activeVessel.type);
    const hasRight = Boolean(rt.rightHandVessel && rt.rightHandVessel.type);
    const hasAnyInHands = hasLeft || hasRight;

    if (centerCount > 1) {
      audio.playPenaltyBuzz();
      this.onToast(
        `🚫 На столе слишком много предметов (${centerCount} шт.) — оставьте максимум 1 предмет или освободите место под пакет!`,
        '#ffaa00'
      );
      return null;
    }

    let fromCenterItem = null;
    let leftHandOnly = Boolean(!hasLeft && hasRight);

    if (centerCount === 1) {
      const solo = rt.centerItems[0];
      if (solo?.vessel?.type === 'bowl') {
        audio.playPenaltyBuzz();
        this.onToast(
          '🚫 Тарелку нельзя положить в пакет — только 📦 Коробку! Заберите миску со стола или перелейте в коробку на складе!',
          '#ff385c'
        );
        return null;
      }
      if (hasAnyInHands) {
        audio.playPenaltyBuzz();
        this.onToast(
          '🚫 Освободите руки, чтобы приподнять предмет со стола и положить его в пакет!',
          '#ffaa00'
        );
        return null;
      }
      fromCenterItem = rt.centerItems.pop();
      const soloV = fromCenterItem.vessel;
      if (soloV?.type === 'drink') {
        rt.assembly.drink = soloV.drinkId || 'cola';
        leftHandOnly = true;
      } else if (soloV?.type === 'chopsticks') {
        rt.assembly.hasChopsticks = true;
        leftHandOnly = true;
      } else {
        rt.assembly.vessel = JSON.parse(JSON.stringify(soloV));
        leftHandOnly = false;
      }
    }

    // Запрещаем перекладывать керамическую миску в пакет — в пакет можно класть ТОЛЬКО коробки!
    if (rt.assembly.vessel && rt.assembly.vessel.type === 'bowl') {
      audio.playPenaltyBuzz();
      this.onToast(
        '🚫 Тарелку нельзя положить в пакет — только 📦 Коробку! Заберите миску с подноса и перелейте в коробку на складе!',
        '#ff385c'
      );
      return null;
    }

    const hadItems = Boolean(rt.assembly.vessel || rt.assembly.hasChopsticks || rt.assembly.drink);
    const prevVessel = rt.assembly.vessel ? JSON.parse(JSON.stringify(rt.assembly.vessel)) : null;
    const prevChopsticks = Boolean(rt.assembly.hasChopsticks);
    const prevDrink = rt.assembly.drink || null;
    const onTray = Boolean(rt.assembly.hasTray);

    rt.assembly.hasBag = true;
    rt.cameraFocus = 'worktable';
    rt.underCounterSide = 0;
    audio.playTapPop();
    if (fromCenterItem) {
      if (fromCenterItem.vessel?.type === 'box') {
        audio.playSealerPress();
      }
      this.onToast(
        leftHandOnly
          ? `🛍️ Пакет выставлен левой рукой, ${this.getItemLabel(fromCenterItem.vessel)} убраны внутрь!`
          : '🛍️ Коробка приподнята левой рукой, пакет выставлен и аккуратно упакован!',
        '#00f5d4'
      );
    } else if (hadItems) {
      audio.playSealerPress();
      this.onToast(
        '🛍️ Заказ переложен с подноса в пакет! Пакет стоит на подносе — поднимитесь к гостю!',
        '#00f5d4'
      );
    } else if (leftHandOnly && hasRight) {
      this.onToast(
        `🛍️ Пакет поставлен левой рукой! ${this.getItemLabel(rt.rightHandVessel)} остаётся в правой руке.`,
        '#00f5d4'
      );
    } else if (onTray) {
      this.onToast('🛍️ Пакет поставлен на поднос! Кладите в него заказ с собой.', '#00f5d4');
    } else {
      this.onToast('🛍️ Пакет для заказа с собой поставлен на столешницу!', '#00f5d4');
    }
    this.renderAllKitchen();
    return { hadItems, onTray, fromCenterItem, leftHandOnly, prevVessel, prevChopsticks, prevDrink };
  }

  // Поставить посуду, напиток или палочки на поднос / в пакет, или забрать обратно в нужную руку!
  handleAssemblyZoneTap(preferredPart = null) {
    const rt = gameState.runtime;
    if (!rt.assembly) {
      rt.assembly = { hasTray: false, hasBag: false, vessel: null, hasChopsticks: false, drink: null };
    }
    const a = rt.assembly;
    const handV = rt.activeVessel;
    const rightV = rt.rightHandVessel;
    const hasHand = Boolean(handV && handV.type);
    const hasRight = Boolean(rightV && rightV.type);
    const rightIsAcc = hasRight && this.isAccessoryItem(rightV);

    if (!a.hasTray && !a.hasBag) {
      audio.playPenaltyBuzz();
      this.onToast('Свайпните вверх ↑ под прилавок, чтобы достать 🍱 Поднос или 🛍️ Пакет!', '#ffaa00');
      return null;
    }

    // 0А. Точечный тап по банке на подносе (когда правая рука свободна, и не мешаем постановке посуды из левой)
    if (preferredPart === 'drink' && !hasRight && a.drink && (!hasHand || a.vessel)) {
      const drinkId = a.drink;
      a.drink = null;
      rt.rightHandVessel = { type: 'drink', drinkId };
      audio.playTapPop();
      this.onToast(`${this.getItemLabel(rt.rightHandVessel)} взята с подноса в правую руку.`, '#00f5d4');
      this.renderAllKitchen();
      return { action: 'pickup_accessory', itemType: 'drink', drinkId, fromBag: a.hasBag };
    }

    // 0Б. Точечный тап по палочкам на подносе (когда правая рука свободна, и не мешаем постановке посуды из левой)
    if (preferredPart === 'chopsticks' && !hasRight && a.hasChopsticks && (!hasHand || a.vessel)) {
      a.hasChopsticks = false;
      rt.rightHandVessel = { type: 'chopsticks' };
      audio.playTapPop();
      this.onToast('🥢 Палочки взяты с подноса в правую руку.', '#00f5d4');
      this.renderAllKitchen();
      return { action: 'pickup_accessory', itemType: 'chopsticks', fromBag: a.hasBag };
    }

    // 0В. В ПРАВОЙ руке напиток или палочки -> СТАВИМ НА ПОДНОС / КЛАДЁМ В ПАКЕТ!
    if (rightIsAcc) {
      if (rightV.type === 'drink') {
        if (!a.drink) {
          const drinkId = rightV.drinkId || 'cola';
          a.drink = drinkId;
          rt.rightHandVessel = null;
          audio.playTapPop();
          this.onToast(
            a.hasBag
              ? `${this.getItemLabel(rightV)} убрана в пакет!`
              : `${this.getItemLabel(rightV)} поставлена на поднос!`,
            '#00f5d4'
          );
          this.renderAllKitchen();
          return { action: 'place_accessory', itemType: 'drink', drinkId, intoBag: a.hasBag };
        }
        // Если напиток уже есть, но в левой руке посуда и место под блюдо свободно -> ставим блюдо из левой!
        if (!(hasHand && !a.vessel)) {
          audio.playPenaltyBuzz();
          this.onToast('🥤 На подносе уже есть напиток! Поставьте банку на стол или заберите прежнюю.', '#ffaa00');
          return null;
        }
      } else if (rightV.type === 'chopsticks') {
        if (!a.hasChopsticks) {
          a.hasChopsticks = true;
          rt.rightHandVessel = null;
          audio.playTapPop();
          this.onToast(
            a.hasBag ? '🥢 Палочки Варибаси положены в пакет!' : '🥢 Палочки Варибаси положены на поднос!',
            '#00f5d4'
          );
          this.renderAllKitchen();
          return { action: 'place_accessory', itemType: 'chopsticks', intoBag: a.hasBag };
        }
        if (!(hasHand && !a.vessel)) {
          audio.playPenaltyBuzz();
          this.onToast('🥢 Палочки уже положены к заказу!', '#ffaa00');
          return null;
        }
      }
    }

    // 0. Если ОБЕ РУКИ ЗАНЯТЫ посудой и место на подносе свободно -> ставим посуду из ПРАВОЙ руки на поднос (освобождая правую руку!)
    if (hasHand && hasRight && !rightIsAcc) {
      if (!a.vessel) {
        if (a.hasBag && rightV.type !== 'box') {
          audio.playPenaltyBuzz();
          this.onToast('🚫 Тарелку нельзя положить в пакет — только 📦 Вок-коробку!', '#ff385c');
          return null;
        }
        const placedRight = JSON.parse(JSON.stringify(rightV));
        a.vessel = placedRight;
        rt.rightHandVessel = null;
        audio.playTapPop();
        this.onToast(
          a.hasBag
            ? `${placedRight.type === 'box' ? '📦 Коробка' : '🍜 Миска'} из правой руки положена в пакет!`
            : `${placedRight.type === 'box' ? '📦 Коробка' : '🍜 Миска'} из правой руки поставлена обратно на поднос!`,
          '#00f5d4'
        );
        this.renderAllKitchen();
        return { action: 'place', vessel: placedRight, intoBag: a.hasBag, fromRight: true };
      }
      this.blockIfBothHandsBusy();
      return null;
    }

    // 1. В левой руке есть тарелка/коробка (полная или пустая) и место на подносе/в пакете свободно -> СТАВИМ!
    if (hasHand && !a.vessel) {
      // В пакет запрещено класть керамическую тарелку — только коробки!
      if (a.hasBag && handV.type !== 'box') {
        audio.playPenaltyBuzz();
        this.onToast(
          '🚫 Тарелку нельзя положить в пакет — только 📦 Вок-коробку! Перелейте рамен в коробку на складе справа ▶',
          '#ff385c'
        );
        return null;
      }

      const placed = JSON.parse(JSON.stringify(handV));
      a.vessel = placed;
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        a.hasBag
          ? `${placed.type === 'box' ? '📦 Коробка' : '🍜 Миска'} положена в пакет!`
          : `${placed.type === 'box' ? '📦 Коробка' : '🍜 Миска'} поставлена на поднос!`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'place', vessel: placed, intoBag: a.hasBag };
    }

    // 2. Левая рука пустая, а на подносе/в пакете стоит посуда -> ЗАБИРАЕМ обратно в левую руку!
    if (!hasHand && a.vessel) {
      const picked = JSON.parse(JSON.stringify(a.vessel));
      rt.activeVessel = picked;
      rt.vesselHeldInLeft = true;
      a.vessel = null;
      audio.playTapPop();
      this.onToast(
        `${picked.type === 'box' ? '📦 Коробка' : '🍜 Миска'} взята обратно в левую руку.`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return { action: 'pickup', vessel: picked, fromBag: a.hasBag };
    }

    // 2Б. Руки пустые и блюда на подносе/в пакете нет -> забираем напиток или палочки обратно в правую руку!
    if (!hasHand && !hasRight && !a.vessel) {
      if (a.drink) {
        const drinkId = a.drink;
        a.drink = null;
        rt.rightHandVessel = { type: 'drink', drinkId };
        audio.playTapPop();
        this.onToast(
          a.hasBag
            ? `${this.getItemLabel(rt.rightHandVessel)} вынута из пакета в правую руку.`
            : `${this.getItemLabel(rt.rightHandVessel)} взята с подноса в правую руку.`,
          '#00f5d4'
        );
        this.renderAllKitchen();
        return { action: 'pickup_accessory', itemType: 'drink', drinkId, fromBag: a.hasBag };
      }
      if (a.hasChopsticks) {
        a.hasChopsticks = false;
        rt.rightHandVessel = { type: 'chopsticks' };
        audio.playTapPop();
        this.onToast(
          a.hasBag ? '🥢 Палочки вынуты из пакета в правую руку.' : '🥢 Палочки взяты с подноса в правую руку.',
          '#00f5d4'
        );
        this.renderAllKitchen();
        return { action: 'pickup_accessory', itemType: 'chopsticks', fromBag: a.hasBag };
      }
    }

    // 3. В левой руке ПУСТАЯ миска/коробка, а на подносе (без пакета) стоит посуда (НАПОЛНЕННАЯ или ПУСТАЯ) ->
    //    ПРАВОЙ РУКОЙ ПОДНИМАЕМ ПОСУДУ С ПОДНОСА И ДЕРЖИМ В ОБЕИХ РУКАХ!
    //    - Если поднятая с едой: тап по пустой слева -> перелить, либо на склад -> вернуть пустую в стопку.
    //    - Если поднятая тоже пустая (единственный способ получить 2 одинаковые пустые миски/коробки в обеих руках):
    //      можно поставить одну обратно на поднос, либо на складе двумя тапами вернуть обе в стопку!
    if (
      hasHand &&
      !hasRight &&
      a.vessel &&
      !a.hasBag &&
      this.isVesselEmptyOfFood(handV)
    ) {
      const lifted = JSON.parse(JSON.stringify(a.vessel));
      const liftedIsEmpty = this.isVesselEmptyOfFood(lifted);
      rt.rightHandVessel = lifted;
      a.vessel = null;
      audio.playTapPop();
      this.onToast(
        liftedIsEmpty
          ? `🙌 Пустая ${lifted.type === 'bowl' ? '🍜 миска' : '📦 коробка'} с подноса в правой руке! Поставьте обратно на поднос или верните обе на склад ▶`
          : `🙌 ${lifted.type === 'bowl' ? '🍜 Миска' : '📦 Коробка'} с подноса в правой руке! Тапните по пустой слева, чтобы перелить (или верните пустую на склад ▶)`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return {
        action: 'pickup_tray_right',
        vessel: lifted
      };
    }

    // 3Б. В левой руке НАПОЛНЕННОЕ блюдо (с едой), а на подносе (без пакета) стоит ЧИСТАЯ ПУСТАЯ миска/коробка ->
    //     Перекладываем блюдо из левой руки в ПРАВУЮ, а ЛЕВОЙ РУКОЙ забираем пустую миску/коробку с подноса!
    //     (После этого тап по подносу поставит туда уже наполненное блюдо из правой руки, а тап по пустой слева — перельёт!)
    if (
      hasHand &&
      !hasRight &&
      a.vessel &&
      !a.hasBag &&
      !this.isVesselEmptyOfFood(handV) &&
      this.isVesselEmptyOfFood(a.vessel)
    ) {
      const fullMoved = JSON.parse(JSON.stringify(handV));
      const emptyPicked = JSON.parse(JSON.stringify(a.vessel));
      rt.rightHandVessel = fullMoved;
      rt.activeVessel = emptyPicked;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      a.vessel = null;
      audio.playTapPop();
      this.onToast(
        `🙌 Блюдо переложено в правую руку, пустая ${emptyPicked.type === 'bowl' ? '🍜 миска' : '📦 коробка'} с подноса — в левой! Тапните по подносу, чтобы поставить блюдо, или по пустой слева, чтобы перелить.`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return {
        action: 'handoff_and_pickup_tray_left',
        type: emptyPicked.type,
        rightVessel: fullMoved
      };
    }

    // 3В. В левой руке НАПОЛНЕННОЕ блюдо, и на подносе (без пакета) тоже стоит НАПОЛНЕННОЕ блюдо ->
    //     ПРАВОЙ РУКОЙ поднимаем блюдо с подноса! Теперь в обеих руках еда:
    //     - тап по левой -> переливание из правой в левую (возможен перелив через край и лужа на столе!);
    //     - тап по подносу -> правая рука ставит блюдо обратно на поднос!
    if (
      hasHand &&
      !hasRight &&
      a.vessel &&
      !a.hasBag &&
      !this.isVesselEmptyOfFood(handV) &&
      !this.isVesselEmptyOfFood(a.vessel)
    ) {
      const lifted = JSON.parse(JSON.stringify(a.vessel));
      rt.rightHandVessel = lifted;
      a.vessel = null;
      audio.playTapPop();
      this.onToast(
        `🙌 ${lifted.type === 'bowl' ? '🍜 Миска' : '📦 Коробка'} с подноса взята в правую руку! Тапните по левой, чтобы перелить (осторожно — может перелиться!), или тапните по подносу, чтобы вернуть.`,
        '#ffaa00'
      );
      this.renderAllKitchen();
      return {
        action: 'pickup_tray_right',
        vessel: lifted
      };
    }

    if (hasHand && a.vessel) {
      audio.playPenaltyBuzz();
      this.onToast('На подносе уже стоит посуда! Сначала отдайте заказ или освободите место.', '#ffaa00');
      return null;
    }

    return null;
  }

  // Взять бамбуковые палочки Варибаси из стаканчика в ПРАВУЮ руку (или вернуть обратно в стаканчик!)
  takeChopsticksFromCup() {
    const rt = gameState.runtime;
    const right = rt.rightHandVessel;
    const hasRight = Boolean(right && right.type);

    if (hasRight && right.type === 'chopsticks') {
      rt.rightHandVessel = null;
      audio.playTapPop();
      this.onToast('🥢 Палочки возвращены обратно в стаканчик.', '#00f5d4');
      this.renderAllKitchen();
      return { action: 'return', itemType: 'chopsticks' };
    }

    if (hasRight) {
      audio.playPenaltyBuzz();
      this.onToast(
        `🙌 Правая рука уже занята (${this.getItemLabel(right)})! Сначала поставьте предмет на стол или поднос.`,
        '#ffaa00'
      );
      return null;
    }

    rt.rightHandVessel = { type: 'chopsticks' };
    audio.playTapPop();
    this.onToast('🥢 Палочки Варибаси в правой руке! Положите их на поднос, в пакет или на любую столешницу.', '#00f5d4');
    this.renderAllKitchen();
    return { action: 'pickup', itemType: 'chopsticks' };
  }

  addChopsticksToAssembly() {
    return this.takeChopsticksFromCup();
  }

  serveToCounterCustomer() {
    const rt = gameState.runtime;
    const cust = rt.currentCustomer;
    if (!cust) {
      this.onToast('У окна сейчас нет посетителя!', '#ffaa00');
      return false;
    }

    const a = rt.assembly;
    if (!this.hasAssembledOrder()) {
      audio.playPenaltyBuzz();
      this.onToast(
        '🍱 Соберите заказ на подносе или в пакете (свайп вверх ↑ на столе → под прилавок за подносом/пакетом)!',
        '#ffaa00'
      );
      return false;
    }

    const servingBag = Boolean(a.hasBag);
    const v = a.vessel;

    if (!v || (!v.broth && !v.noodleState)) {
      audio.playPenaltyBuzz();
      this.onToast('🙅‍♂️ Гость: «А где сам рамен?! Поставьте готовое блюдо на поднос!»', '#ff385c');
      return false;
    }

    // 1. Если гость просил «с собой», а мы поднялись с подносом без пакета -> отказывается и просит в пакет!
    if (cust.order.wantsTakeout && !servingBag) {
      audio.playPenaltyBuzz();
      audio.speakCustomerOrder('Эй, мне нужно с собой!', cust.id);
      this.onToast(
        '🙅‍♂️ Гость: «Эй, мне нужно с собой!» Опуститесь на стол, возьмите 🛍️ Пакет под холодильником (в пакет идут только 📦 Коробки)!',
        '#ff385c'
      );
      return false;
    }

    // 2. Если гостю дают совсем другой бульон — отказывается брать заказ!
    if (v.broth !== cust.order.broth) {
      audio.playPenaltyBuzz();
      this.onToast(
        '🙅‍♂️ Гость отказался: «Я заказывал совсем другой бульон!» Опуститесь и замените блюдо.',
        '#ff385c'
      );
      return false;
    }

    const evalRes = this.evaluateDish(v, cust.order);
    let penaltyNote = false;

    // 3. Если гость заказывал НА МЕСТЕ, а мы отдали ему заказ в ПАКЕТЕ — он берёт, но ухудшается рейтинг и нет чаевых!
    const wrongBagForDineIn = !cust.order.wantsTakeout && servingBag;
    if (wrongBagForDineIn) {
      penaltyNote = true;
      evalRes.isPerfect = false;
      evalRes.notes.push('В пакете для заказа на месте (-0.15★, без чаевых)');
      rt.dailyStats.badReviews = (rt.dailyStats.badReviews || 0) + 1;
      gameState.persistent.rating = Math.max(1.0, +(gameState.persistent.rating - 0.15).toFixed(2));
    }

    // 4. Если поднос поставили на лужу или забрызгали переливом и отдали ГРЯЗНЫМ — мощный штраф к рейтингу и 0 чаевых!
    const dirtyTrayPenalty = Boolean(a.isDirtyTray && !servingBag);
    if (dirtyTrayPenalty) {
      penaltyNote = true;
      evalRes.isPerfect = false;
      evalRes.multiplier = Math.max(0.35, evalRes.multiplier * 0.72);
      evalRes.notes.push('💦 Грязный поднос (-0.25★, без чаевых)');
      rt.dailyStats.badReviews = (rt.dailyStats.badReviews || 0) + 1;
      gameState.persistent.rating = Math.max(1.0, +(gameState.persistent.rating - 0.25).toFixed(2));
      audio.speakCustomerOrder('Фу! Поднос весь в бульоне!', cust.id);
    }

    // Небольшой бонус за положенные палочки Варибаси
    const chopstickBonus = a.hasChopsticks && !wrongBagForDineIn && !dirtyTrayPenalty ? 6 : 0;
    if (a.hasChopsticks) {
      evalRes.notes.push('🥢 Палочки');
    }

    // Проверка заказанного напитка из Крио-Холодильника
    let drinkPay = 0;
    const reqDrink = cust.order.drink || null;
    const givenDrink = a.drink || null;
    if (reqDrink) {
      const reqCfg = GAME_CONFIG.DRINKS?.[reqDrink];
      if (givenDrink === reqDrink && reqCfg) {
        drinkPay = reqCfg.priceAdd;
        evalRes.notes.push(`${reqCfg.emoji} ${reqCfg.shortName}`);
      } else if (givenDrink) {
        const givenCfg = GAME_CONFIG.DRINKS?.[givenDrink];
        drinkPay = Math.round((givenCfg?.priceAdd || 30) * 0.45);
        evalRes.isPerfect = false;
        evalRes.notes.push('Другой напиток');
      } else {
        evalRes.isPerfect = false;
        evalRes.notes.push('Забыт напиток');
      }
    } else if (givenDrink) {
      const givenCfg = GAME_CONFIG.DRINKS?.[givenDrink];
      drinkPay = 12;
      evalRes.notes.push(`${givenCfg?.emoji || '🥫'} Комплимент`);
    }

    const district = gameState.getCurrentDistrict();
    const basePay = Math.round(cust.basePrice * evalRes.multiplier) + chopstickBonus + drinkPay;

    const speedFactor = cust.patience / 100;
    let rawTip = Math.round(
      basePay * 0.35 * speedFactor * district.tipMultiplier * (evalRes.isPerfect ? 1.35 : 0.7)
    );
    if (evalRes.multiplier < 0.75 || wrongBagForDineIn || dirtyTrayPenalty) rawTip = 0;

    const totalEarned = basePay + rawTip;
    gameState.persistent.money += totalEarned;
    rt.dailyStats.salesRevenue += basePay;
    rt.dailyStats.tipsEarned += rawTip;
    rt.dailyStats.servedCount += 1;

    audio.playCoinChime();
    this.onSpawnCoins(10, `+¥${totalEarned}`);

    const qualityTag = evalRes.notes.join(', ');
    const vesselIcon = servingBag ? '🛍️' : '🍱';
    this.onToast(
      dirtyTrayPenalty
        ? `🤢 Отдан ГРЯЗНЫЙ поднос: +¥${basePay}, чаевые ¥0, рейтинг -0.25★!`
        : wrongBagForDineIn
          ? `⚠️ Отдано в пакете вместо подноса: +¥${basePay}, чаевые ¥0, рейтинг -0.15★`
          : `${vesselIcon} Подано: +¥${basePay} и чаевые +¥${rawTip} [${qualityTag}]`,
      dirtyTrayPenalty ? '#ff385c' : penaltyNote ? '#ffaa00' : evalRes.isPerfect ? '#10f56c' : '#00f5d4'
    );

    // Закон сохранения 10 керамических мисок:
    // - На подносе на месте: гость поест 7.5–10 сек и поставит грязную миску на левую полку прилавка;
    // - В пакете (если перекладывали из миски): освободившаяся миска уходит в раковину, чтобы не потеряться навсегда!
    if (v.type === 'bowl') {
      if (servingBag) {
        rt.dirtyInSink.push({ broth: v.broth || 'tonkotsu' });
      } else {
        rt.eatingTimers.push({
          remainingSec: 7.5 + Math.random() * 2.5,
          side: 'left',
          broth: v.broth || 'tonkotsu'
        });
      }
    }

    // Если отдавали ПАКЕТ -> отдаётся только пакет, а ЧИСТЫЙ ПОДНОС остаётся стоять на столешнице!
    // Если отдавали ПОДНОС -> отдаётся весь поднос целиком!
    if (servingBag) {
      a.hasBag = false;
      a.vessel = null;
      a.hasChopsticks = false;
      a.drink = null;
    } else {
      a.hasTray = false;
      a.hasBag = false;
      a.isDirtyTray = false;
      a.dirtyTrayBroth = null;
      a.vessel = null;
      a.hasChopsticks = false;
      a.drink = null;
    }
    rt.carryingAssembly = false;

    rt.sauceModeArmed = false;
    rt.currentCustomer = null;
    rt.customerSpawnTimer = 0.75;
    this.onTutorialEvent('dish_served');
    gameState.save();
    this.renderAllKitchen();
    return { servedBag: servingBag, keepTray: a.hasTray };
  }

  // Забрать одну грязную миску с левой или правой верхней полки прилавка (1 тап = 1 миска уходит в мойку!)
  collectDirtyBowlFromShelf(side = 'left') {
    if (this.blockIfBothHandsBusy()) return null;
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

  // Вылить/вывалить содержимое посуды из левой руки в раковину (Сектор -1):
  // - Если внутри ТОЛЬКО бульон -> чисто стекает в слив!
  // - Если есть лапша или топпинги -> слив раковины ЗАБИВАЕТСЯ, нужно убрать засор в мусорку по тапу!
  dumpHeldVesselIntoSink() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    const v = rt.activeVessel;
    if (!v || !v.type || this.isVesselEmptyOfFood(v)) {
      return null;
    }

    const dumped = JSON.parse(JSON.stringify(v));
    const hasSolids = Boolean(dumped.noodleState || (dumped.toppings && dumped.toppings.length > 0));
    const spillBroth = dumped.broth || 'tonkotsu';
    const wasCloggedBefore = Boolean(rt.sinkClog && rt.sinkClog.clogged);

    rt.activeVessel = this.createEmptyVessel(null);
    rt.vesselHeldInLeft = false;
    rt.sauceModeArmed = false;

    if (dumped.type === 'bowl') {
      rt.dirtyInSink.push({ broth: spillBroth });
    }

    const wasteCost =
      (dumped.broth ? 15 : 0) +
      (dumped.noodleState ? 12 : 0) +
      (dumped.toppings ? dumped.toppings.length * 10 : 0);
    if (wasteCost > 0) {
      rt.dailyStats.wastedFoodCost = (rt.dailyStats.wastedFoodCost || 0) + wasteCost;
      rt.dailyStats.penalties += wasteCost;
    }

    if (hasSolids) {
      if (!rt.sinkClog) {
        rt.sinkClog = { clogged: false, broth: spillBroth, hasNoodles: false, toppings: [] };
      }
      rt.sinkClog.clogged = true;
      rt.sinkClog.broth = spillBroth;
      rt.sinkClog.hasNoodles = Boolean(rt.sinkClog.hasNoodles || dumped.noodleState);
      rt.sinkClog.toppings = [...(rt.sinkClog.toppings || []), ...(dumped.toppings || [])].slice(0, 6);
      audio.playSauceSizzle();
      audio.playPenaltyBuzz();
      this.onToast(
        wasCloggedBefore
          ? `🚿 Раковина ещё сильнее забилась лапшой и остатками (-¥${wasteCost})! Вытащите засор в мусорку!`
          : `🚿 Слив раковины ЗАБИЛСЯ лапшой и ингредиентами (-¥${wasteCost})! Тапните по засору в раковине, чтобы выкинуть его в мусорку!`,
        '#ff385c'
      );
    } else if (wasCloggedBefore) {
      rt.sinkClog.broth = spillBroth;
      audio.playSauceSizzle();
      audio.playPenaltyBuzz();
      this.onToast(
        `🚿 Бульон вылит в забитую раковину (-¥${wasteCost}) — вода не уходит, сначала вытащите засор!`,
        '#ffaa00'
      );
    } else {
      audio.playSauceSizzle();
      audio.playBoilBubble();
      this.onToast(
        dumped.type === 'bowl'
          ? `🚿 Бульон вылит в раковину (-¥${wasteCost}), грязная миска осталась в мойке.`
          : `🚿 Бульон вылит в раковину (-¥${wasteCost}), пустая коробка сброшена в мусорку.`,
        '#ffaa00'
      );
    }

    this.renderAllKitchen();
    return {
      action: 'dump_to_sink',
      vessel: dumped,
      cloggedNow: hasSolids,
      wasCloggedBefore
    };
  }

  // Прочистить забитый слив раковины по тапу — выкидывает застрявшую лапшу и остатки в мусорку под раковиной!
  unclogSinkDrain() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    if (!rt.sinkClog || !rt.sinkClog.clogged) {
      return null;
    }

    const prevClog = JSON.parse(JSON.stringify(rt.sinkClog));
    rt.sinkClog = {
      clogged: false,
      broth: 'tonkotsu',
      hasNoodles: false,
      toppings: []
    };
    audio.playTapPop();
    audio.playBoilBubble();
    this.onToast('🗑️ Засор из раковины выброшен в мусорку под раковиной — слив снова чист!', '#10f56c');
    this.renderAllKitchen();
    return prevClog;
  }

  // Вытереть лужу, вытекшую из-под мусорного бака под раковиной (Сектор -1)
  wipeTrashLeak() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    const spread = rt.trashLeak?.puddleSpread || 0;
    if (!rt.trashLeak || spread <= 0.03) {
      return null;
    }
    const res = {
      prevSpread: Math.max(0.22, spread),
      prevMorph: rt.trashLeak.puddleMorph || 0.5,
      prevSeed: rt.trashLeak.seed || 1.37,
      broth: rt.trashLeak.broth || 'tonkotsu',
      color: Array.isArray(rt.trashLeak.color) ? [...rt.trashLeak.color] : null
    };
    rt.trashLeak = {
      queue: [],
      activeCount: 0,
      puddleSpread: 0,
      targetSpread: 0,
      puddleMorph: 0,
      targetMorph: 0,
      seed: +(0.4 + Math.random() * 5.4).toFixed(3),
      broth: 'tonkotsu',
      color: null
    };
    audio.playTapPop();
    this.onToast('🧽 Лужица под мусоркой вытерта начисто!', '#10f56c');
    this.renderAllKitchen();
    return res;
  }

  // =========================================================================
  // НОВАЯ ПРАВАЯ СТОЛЕШНИЦА-РЕЗЕРВ СПРАВА ОТ ХОЛОДИЛЬНИКА (СЕКТОР 3):
  // Умный подбор случайных НЕПЕРЕСЕКАЮЩИХСЯ точек для свободного складирования тарелок и коробок!
  // =========================================================================
  findFreeReserveSpot(items = []) {
    const minX = 0.62;
    const maxX = 1.16;
    const minZ = 0.70;
    const maxZ = 1.28;
    const minDist = 0.275;

    const isClear = (x, z, distLimit) => {
      for (const it of items) {
        if (Math.hypot(x - it.x, z - it.z) < distLimit) return false;
      }
      return true;
    };

    // 1. До 90 случайных точек по всей поверхности столешницы (естественная живая расстановка без жёсткой сетки!)
    for (let attempt = 0; attempt < 90; attempt++) {
      const rx = minX + Math.random() * (maxX - minX);
      const rz = minZ + Math.random() * (maxZ - minZ);
      if (isClear(rx, rz, minDist)) {
        return {
          x: +rx.toFixed(3),
          z: +rz.toFixed(3),
          rotY: +((Math.random() - 0.5) * 0.45).toFixed(3)
        };
      }
    }

    // 2. Fallback: плотный поиск самой свободной точки, когда стол почти заполнен (до 6-8 предметов без пересечений!)
    let best = null;
    let bestMinD = 0;
    const steps = 7;
    for (let ix = 0; ix < steps; ix++) {
      for (let iz = 0; iz < steps; iz++) {
        const cx = minX + (ix / (steps - 1)) * (maxX - minX) + (Math.random() - 0.5) * 0.025;
        const cz = minZ + (iz / (steps - 1)) * (maxZ - minZ) + (Math.random() - 0.5) * 0.025;
        const clampedX = Math.max(minX, Math.min(maxX, cx));
        const clampedZ = Math.max(minZ, Math.min(maxZ, cz));
        let nearest = Infinity;
        for (const it of items) {
          const d = Math.hypot(clampedX - it.x, clampedZ - it.z);
          if (d < nearest) nearest = d;
        }
        if (nearest >= 0.252 && nearest > bestMinD) {
          bestMinD = nearest;
          best = {
            x: +clampedX.toFixed(3),
            z: +clampedZ.toFixed(3),
            rotY: +((Math.random() - 0.5) * 0.45).toFixed(3)
          };
        }
      }
    }
    return best;
  }

  // Поставить предмет из руки (из правой, если она занята, иначе из левой) на случайную свободную точку правой столешницы!
  handleReserveSurfaceTap() {
    const rt = gameState.runtime;
    if (!Array.isArray(rt.reserveItems)) rt.reserveItems = [];
    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);

    if (!hasLeft && !hasRight) {
      audio.playTapPop();
      this.onToast('📦 Свободная столешница справа от холодильника — сюда можно складывать посуду, напитки и палочки!', '#00f5d4');
      return null;
    }

    const spot = this.findFreeReserveSpot(rt.reserveItems);
    if (!spot) {
      audio.playPenaltyBuzz();
      this.onToast('🚫 На правой столешнице больше нет свободного места! Заберите что-нибудь со стола.', '#ffaa00');
      return null;
    }

    const fromRight = hasRight;
    const placedVessel = JSON.parse(JSON.stringify(fromRight ? right : left));
    if (this.isFoodVessel(placedVessel)) {
      placedVessel.wasStagedOnTable = true;
    }

    const item = {
      id: `res_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      x: spot.x,
      z: spot.z,
      rotY: spot.rotY,
      vessel: placedVessel
    };
    rt.reserveItems.push(item);

    if (fromRight) {
      rt.rightHandVessel = null;
    } else {
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
    }

    audio.playTapPop();
    this.onToast(
      `${this.getItemLabel(placedVessel)} на правой столешнице (всего: ${rt.reserveItems.length})`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return {
      action: 'place',
      item: JSON.parse(JSON.stringify(item)),
      fromRight
    };
  }

  // Взаимодействие с конкретным предметом, стоящим на правой столешнице (Сектор 3)
  handleReserveItemTap(itemId) {
    const rt = gameState.runtime;
    if (!Array.isArray(rt.reserveItems)) rt.reserveItems = [];
    const idx = rt.reserveItems.findIndex((it) => it.id === itemId);
    if (idx === -1) return null;

    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);

    // Если обе руки заняты -> ставим предмет из правой руки на свободное место столешницы!
    if (hasLeft && hasRight) {
      return this.handleReserveSurfaceTap();
    }

    const item = rt.reserveItems[idx];
    const pickedVessel = JSON.parse(JSON.stringify(item.vessel));

    // 0. Напиток или палочки ВСЕГДА забираются в ПРАВУЮ руку (независимо от левой!)
    if (this.isAccessoryItem(pickedVessel)) {
      if (hasRight) {
        audio.playPenaltyBuzz();
        this.onToast(
          `🙌 Правая рука уже занята (${this.getItemLabel(right)})! Сначала поставьте предмет на свободное место стола.`,
          '#ffaa00'
        );
        return null;
      }
      rt.reserveItems.splice(idx, 1);
      rt.rightHandVessel = pickedVessel;
      audio.playTapPop();
      this.onToast(`${this.getItemLabel(pickedVessel)} взяты со столешницы в правую руку.`, '#00f5d4');
      this.renderAllKitchen();
      return {
        action: 'pickup',
        item: JSON.parse(JSON.stringify(item)),
        fromRight: true
      };
    }

    // 1. Левая рука свободна -> забираем миску/коробку в ЛЕВУЮ руку (даже если в правой банка или палочки!)
    if (!hasLeft) {
      rt.reserveItems.splice(idx, 1);
      rt.activeVessel = pickedVessel;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        `${this.getItemLabel(pickedVessel)} взята со столешницы в левую руку.`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return {
        action: 'pickup',
        item: JSON.parse(JSON.stringify(item)),
        fromRight: false
      };
    }

    // 2. В левой руке НАПОЛНЕННАЯ, а на столешнице стоит ПУСТАЯ -> перекладываем полную в правую, пустую берём в левую!
    if (!this.isVesselEmptyOfFood(left) && this.isVesselEmptyOfFood(pickedVessel)) {
      rt.reserveItems.splice(idx, 1);
      const fullMoved = JSON.parse(JSON.stringify(left));
      rt.rightHandVessel = fullMoved;
      rt.activeVessel = pickedVessel;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        `🙌 Блюдо в правой руке, пустая ${pickedVessel.type === 'box' ? '📦 коробка' : '🍜 миска'} в левой! Тапните по левой, чтобы перелить.`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return {
        action: 'handoff_and_pickup_tray_left',
        type: pickedVessel.type,
        rightVessel: fullMoved,
        targetPos: [item.x, 0.896, item.z]
      };
    }

    // 3. Иначе (левая пустая, или обе с едой) -> правой рукой поднимаем посуду со столешницы!
    rt.reserveItems.splice(idx, 1);
    rt.rightHandVessel = pickedVessel;
    audio.playTapPop();
    this.onToast(
      `🙌 ${this.getItemLabel(pickedVessel)} со столешницы взята в правую руку!`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return {
      action: 'pickup_tray_right',
      vessel: pickedVessel,
      targetPos: [item.x, 0.896, item.z]
    };
  }

  // =========================================================================
  // СВОБОДНАЯ РАССТАНОВКА НА ЦЕНТРАЛЬНОЙ СТОЛЕШНИЦЕ (МАКСИМУМ 3 ПРЕДМЕТА БЕЗ ПОДНОСА):
  // 3 живые зоны (слева, по центру, справа) с хаотичным случайным смещением и защитой от пересечений!
  // =========================================================================
  findFreeCenterSpot(items = []) {
    if (items.length >= 3) return null;
    const zones = [
      { id: 0, minX: -0.32, maxX: -0.21, minZ: -0.35, maxZ: -0.15 }, // Левая зона (не задевая тряпочку на -0.49!)
      { id: 1, minX: -0.06, maxX: 0.06, minZ: -0.35, maxZ: -0.15 },  // Центральная зона
      { id: 2, minX: 0.21, maxX: 0.32, minZ: -0.35, maxZ: -0.15 }    // Правая зона
    ];
    const usedZones = new Set(items.map((it) => it.zone));
    const freeZones = zones.filter((z) => !usedZones.has(z.id));
    if (freeZones.length === 0) return null;

    // Перемешиваем свободные зоны в случайном порядке, чтобы постановка ощущалась естественно и хаотично!
    for (let i = freeZones.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [freeZones[i], freeZones[j]] = [freeZones[j], freeZones[i]];
    }

    const minDist = 0.255;
    for (const zDef of freeZones) {
      for (let attempt = 0; attempt < 45; attempt++) {
        const rx = zDef.minX + Math.random() * (zDef.maxX - zDef.minX);
        const rz = zDef.minZ + Math.random() * (zDef.maxZ - zDef.minZ);
        let ok = true;
        for (const it of items) {
          if (Math.hypot(rx - it.x, rz - it.z) < minDist) {
            ok = false;
            break;
          }
        }
        if (ok) {
          return {
            zone: zDef.id,
            x: +rx.toFixed(3),
            z: +rz.toFixed(3),
            rotY: +((Math.random() - 0.5) * 0.48).toFixed(3)
          };
        }
      }
      // Fallback: центр свободной зоны с небольшим случайным смещением по Z
      return {
        zone: zDef.id,
        x: +((zDef.minX + zDef.maxX) * 0.5).toFixed(3),
        z: +(zDef.minZ + Math.random() * (zDef.maxZ - zDef.minZ)).toFixed(3),
        rotY: +((Math.random() - 0.5) * 0.48).toFixed(3)
      };
    }
    return null;
  }

  handleCenterSurfaceTap() {
    const rt = gameState.runtime;
    const a = rt.assembly || {};
    if (a.hasTray || a.hasBag) {
      return this.handleAssemblyZoneTap();
    }
    if (!Array.isArray(rt.centerItems)) rt.centerItems = [];
    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);

    if (!hasLeft && !hasRight) {
      audio.playTapPop();
      this.onToast('🍱 Свайпните вверх ↑ за подносом или поставьте сюда предметы (до 3 шт.)!', '#00f5d4');
      return null;
    }

    const spot = this.findFreeCenterSpot(rt.centerItems);
    if (!spot) {
      audio.playPenaltyBuzz();
      this.onToast('🚫 На центральной столешнице уже 3 предмета (максимум)! Освободите место или отнесите направо ▶', '#ffaa00');
      return null;
    }

    const fromRight = hasRight;
    const placedVessel = JSON.parse(JSON.stringify(fromRight ? right : left));
    if (this.isFoodVessel(placedVessel)) {
      placedVessel.wasStagedOnTable = true;
    }

    const item = {
      id: `ctr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      zone: spot.zone,
      x: spot.x,
      z: spot.z,
      rotY: spot.rotY,
      vessel: placedVessel
    };
    rt.centerItems.push(item);

    if (fromRight) {
      rt.rightHandVessel = null;
    } else {
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
      rt.sauceModeArmed = false;
    }

    audio.playTapPop();
    this.onToast(
      `${this.getItemLabel(placedVessel)} на столе (${rt.centerItems.length}/3)`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return {
      action: 'place',
      surface: 'center',
      item: JSON.parse(JSON.stringify(item)),
      fromRight
    };
  }

  handleCenterItemTap(itemId) {
    const rt = gameState.runtime;
    if (!Array.isArray(rt.centerItems)) rt.centerItems = [];
    const idx = rt.centerItems.findIndex((it) => it.id === itemId);
    if (idx === -1) return null;

    const left = rt.activeVessel;
    const right = rt.rightHandVessel;
    const hasLeft = Boolean(left && left.type);
    const hasRight = Boolean(right && right.type);

    // Если обе руки заняты -> ставим предмет из правой руки на свободное место центральной столешницы (если < 3)!
    if (hasLeft && hasRight) {
      return this.handleCenterSurfaceTap();
    }

    const item = rt.centerItems[idx];
    const pickedVessel = JSON.parse(JSON.stringify(item.vessel));

    // 0. Напиток или палочки ВСЕГДА забираются в ПРАВУЮ руку (независимо от левой!)
    if (this.isAccessoryItem(pickedVessel)) {
      if (hasRight) {
        audio.playPenaltyBuzz();
        this.onToast(
          `🙌 Правая рука уже занята (${this.getItemLabel(right)})! Сначала поставьте предмет на свободное место стола.`,
          '#ffaa00'
        );
        return null;
      }
      rt.centerItems.splice(idx, 1);
      rt.rightHandVessel = pickedVessel;
      audio.playTapPop();
      this.onToast(`${this.getItemLabel(pickedVessel)} взяты со стола в правую руку.`, '#00f5d4');
      this.renderAllKitchen();
      return {
        action: 'pickup',
        surface: 'center',
        item: JSON.parse(JSON.stringify(item)),
        fromRight: true
      };
    }

    // 1. Левая рука свободна -> забираем миску/коробку в ЛЕВУЮ руку (даже если в правой банка или палочки!)
    if (!hasLeft) {
      rt.centerItems.splice(idx, 1);
      rt.activeVessel = pickedVessel;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        `${this.getItemLabel(pickedVessel)} взята со стола в левую руку.`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return {
        action: 'pickup',
        surface: 'center',
        item: JSON.parse(JSON.stringify(item)),
        fromRight: false
      };
    }

    // 2. В левой наполненная, на столе пустая -> перекладываем полную в правую, пустую берём в левую!
    if (!this.isVesselEmptyOfFood(left) && this.isVesselEmptyOfFood(pickedVessel)) {
      rt.centerItems.splice(idx, 1);
      const fullMoved = JSON.parse(JSON.stringify(left));
      rt.rightHandVessel = fullMoved;
      rt.activeVessel = pickedVessel;
      rt.vesselHeldInLeft = true;
      rt.sauceModeArmed = false;
      audio.playTapPop();
      this.onToast(
        `🙌 Блюдо в правой руке, пустая ${pickedVessel.type === 'box' ? '📦 коробка' : '🍜 миска'} в левой! Тапните по левой, чтобы перелить.`,
        '#00f5d4'
      );
      this.renderAllKitchen();
      return {
        action: 'handoff_and_pickup_tray_left',
        type: pickedVessel.type,
        rightVessel: fullMoved,
        targetPos: [item.x, 0.896, item.z]
      };
    }

    // 3. Иначе (левая пустая, или обе с едой) -> правой рукой поднимаем посуду со стола!
    rt.centerItems.splice(idx, 1);
    rt.rightHandVessel = pickedVessel;
    audio.playTapPop();
    this.onToast(
      `🙌 ${this.getItemLabel(pickedVessel)} со стола взята в правую руку!`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return {
      action: 'pickup_tray_right',
      vessel: pickedVessel,
      targetPos: [item.x, 0.896, item.z]
    };
  }

  // Помыть одну грязную миску в раковине (Сектор -1, левее плиты):
  // Руки протягиваются к миске, моют её губкой и кладут слева на площадку для чистой посуды (washedOnRack)!
  washOneBowlInSink() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    if (rt.sinkClog && rt.sinkClog.clogged) {
      audio.playPenaltyBuzz();
      this.onToast('🚫 Слив раковины забит! Сначала тапните по засору, чтобы выкинуть остатки в мусорку!', '#ff385c');
      return null;
    }
    if (!rt.dirtyInSink || rt.dirtyInSink.length === 0) {
      audio.playTapPop();
      if ((rt.washedOnRack || 0) > 0) {
        this.onToast(
          `✨ В мойке пусто! Тапните по чистым мискам слева на сушилке (${rt.washedOnRack} шт.), чтобы убрать их в стопку!`,
          '#00f5d4'
        );
      } else {
        this.onToast('✨ В мойке чисто! Грязные миски можно забрать с левой верхней полки прилавка.', '#00f5d4');
      }
      return null;
    }

    const washed = rt.dirtyInSink.pop();
    const sinkIndex = rt.dirtyInSink.length;
    const rackIndex = rt.washedOnRack || 0;
    rt.washedOnRack = rackIndex + 1;
    audio.playBoilBubble();
    this.onToast(
      `🫧 Миска вымыта и положена слева на сушилку (${rt.washedOnRack} шт.)! Тапните по ней, чтобы убрать в стопку чистых!`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return {
      ...washed,
      sinkIndex,
      rackIndex
    };
  }

  // Забрать уже вымытую чистую миску с площадки слева от раковины (только тогда она попадает в стопку с чистой посудой!)
  collectCleanBowlFromRack() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    if (!rt.washedOnRack || rt.washedOnRack <= 0) {
      return null;
    }

    const fromRackIdx = rt.washedOnRack - 1;
    rt.washedOnRack = Math.max(0, rt.washedOnRack - 1);
    rt.cleanBowls = Math.min(rt.maxCleanBowls || 10, (rt.cleanBowls ?? 0) + 1);
    audio.playTapPop();
    audio.playAlDentePing();
    this.onToast(
      `✨ Чистая миска убрана в стопку! Чистых мисок на складе: ${rt.cleanBowls}/10`,
      '#10f56c'
    );
    this.renderAllKitchen();
    return {
      fromRackIdx,
      remainingOnRack: rt.washedOnRack
    };
  }

  // Автоматическое закрывание вок-коробочки и мгновенная передача дрону-курьеру при тапе по дрону!
  deliverBoxToCourierDrone() {
    if (this.blockIfBothHandsBusy()) return null;
    const rt = gameState.runtime;
    const del = rt.activeDelivery;
    if (!del) {
      audio.playPenaltyBuzz();
      this.onToast('Сейчас нет активного заказа от дрона-курьера CyberEats!', '#ffaa00');
      return null;
    }
    const useAssembly =
      (!rt.activeVessel || !rt.activeVessel.type) &&
      rt.assembly &&
      rt.assembly.vessel &&
      rt.assembly.vessel.type;
    const targetV = useAssembly ? rt.assembly.vessel : rt.activeVessel;

    if (!targetV || !targetV.type) {
      audio.playPenaltyBuzz();
      this.onToast('Нет собранной 📦 Вок-коробки для дрона!', '#ffaa00');
      return null;
    }
    if (targetV.type !== 'box') {
      audio.playPenaltyBuzz();
      this.onToast(
        'Дрону нужна 📦 Вок-коробка! Повернитесь к складу справа и тапните 📦 Коробку для переливания!',
        '#ffaa00'
      );
      return null;
    }
    if (!targetV.broth || !targetV.noodleState) {
      audio.playPenaltyBuzz();
      this.onToast('Сначала налейте бульон и добавьте лапшу в 📦 Вок-коробку!', '#ffaa00');
      return null;
    }

    const deliveredVessel = JSON.parse(JSON.stringify(targetV));
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

    if (useAssembly) {
      rt.assembly.vessel = null;
      rt.assembly.hasBag = false;
      rt.assembly.hasChopsticks = false;
      rt.assembly.drink = null;
    } else {
      rt.activeVessel = this.createEmptyVessel(null);
      rt.vesselHeldInLeft = false;
    }
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

  // Пополнить ОДИН выбранный контейнер на столе по тапу на него внутри открытого Крио-Холодильника!
  restockSingleTopping(toppingId) {
    if (this.blockIfBothHandsBusy()) return false;
    const cfg = GAME_CONFIG.TOPPINGS[toppingId];
    if (!cfg) return false;
    const unlocked = gameState.getUnlockedToppings();
    if (!unlocked.includes(toppingId)) {
      audio.playPenaltyBuzz();
      this.onToast(`🔒 ${cfg.emoji} «${cfg.name}» ещё не открыто! Купите в магазине апгрейдов.`, '#ffaa00');
      return false;
    }

    const maxCap = gameState.getMaxTrayCap();
    const current = gameState.persistent.trayStock[toppingId] ?? 0;
    const missing = maxCap - current;
    if (missing <= 0) {
      audio.playTapPop();
      this.onToast(`❄️ Контейнер ${cfg.emoji} «${cfg.shortName}» на столе уже полон (${maxCap}/${maxCap})!`, '#00f5d4');
      return false;
    }

    const cost = missing * cfg.restockUnitCost;
    gameState.persistent.trayStock[toppingId] = maxCap;
    gameState.runtime.dailyStats.restockSpent += cost;
    audio.playTapPop();
    this.onToast(
      `❄️ ${cfg.emoji} ${cfg.shortName}: лоток на столе пополнен (+${missing}, -¥${cost})`,
      '#00bbf9'
    );
    this.onTutorialEvent('tray_restocked');
    gameState.save();
    this.renderAllKitchen();
    return true;
  }

  // Взять охлаждённую жестяную банку с верхней полки холодильника в ПРАВУЮ руку (или вернуть обратно на полку!)
  takeDrinkFromFridge(drinkId) {
    const rt = gameState.runtime;
    const cfg = GAME_CONFIG.DRINKS?.[drinkId];
    if (!cfg) return null;

    const right = rt.rightHandVessel;
    const hasRight = Boolean(right && right.type);

    if (hasRight && right.type === 'drink' && right.drinkId === drinkId) {
      const refund = cfg.restockUnitCost || 10;
      rt.dailyStats.restockSpent = Math.max(0, (rt.dailyStats.restockSpent || 0) - refund);
      rt.rightHandVessel = null;
      audio.playTapPop();
      this.onToast(`${cfg.emoji} ${cfg.name} возвращена обратно в холодильник (+¥${refund}).`, '#00f5d4');
      this.renderAllKitchen();
      return { action: 'return', itemType: 'drink', drinkId };
    }

    if (hasRight) {
      audio.playPenaltyBuzz();
      this.onToast(
        `🙌 Правая рука уже занята (${this.getItemLabel(right)})! Сначала поставьте предмет на стол, поднос или верните на место.`,
        '#ffaa00'
      );
      return null;
    }

    rt.rightHandVessel = { type: 'drink', drinkId };
    rt.dailyStats.restockSpent = (rt.dailyStats.restockSpent || 0) + (cfg.restockUnitCost || 10);
    audio.playTapPop();
    this.onToast(
      `${cfg.emoji} ${cfg.name} в правой руке (-¥${cfg.restockUnitCost})! Ставьте на поднос, в пакет или на любую столешницу.`,
      '#00f5d4'
    );
    this.renderAllKitchen();
    return { action: 'pickup', itemType: 'drink', drinkId };
  }

  addDrinkToAssembly(drinkId) {
    return this.takeDrinkFromFridge(drinkId);
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
