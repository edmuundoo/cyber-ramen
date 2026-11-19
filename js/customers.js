import { GAME_CONFIG } from './config.js?v=74';
import { gameState } from './state.js?v=74';
import { audio } from './audio.js?v=74';

export class CustomerAndDeliverySystem {
  constructor(onToast, onCustomerChanged, onDeliveryChanged) {
    this.onToast = onToast;
    this.onCustomerChanged = onCustomerChanged;
    this.onDeliveryChanged = onDeliveryChanged;
    this.orderSeq = 1;
  }

  update(dt) {
    const rt = gameState.runtime;
    if (!rt.shiftActive) return;

    // 1. Кулдаун «Успокоителя» (Манэки-нэко)
    if (rt.pacifierCooldown > 0) {
      rt.pacifierCooldown = Math.max(0, rt.pacifierCooldown - dt);
    }

    // 2. Посетители у стойки и очередь (Поток А)
    if (rt.nextCustomer && rt.nextCustomer.stepInProgress < 1) {
      rt.nextCustomer.stepInProgress = Math.min(1, rt.nextCustomer.stepInProgress + dt * 2.2);
    }

    if (!rt.currentCustomer) {
      rt.customerSpawnTimer -= dt;
      if (rt.customerSpawnTimer <= 0) {
        this.spawnCustomer();
      }
    } else {
      const cust = rt.currentCustomer;
      if (cust.stepForwardProgress < 1) {
        cust.stepForwardProgress = Math.min(1, cust.stepForwardProgress + dt * 2.4);
      }
      const district = gameState.getCurrentDistrict();
      const neonSlowdown = gameState.hasUpgrade('neon_sign') ? 0.75 : 1.0;
      // В первый день во время туториала терпение не падает ниже 45%
      const isTutorial = !gameState.persistent.tutorialDone && gameState.persistent.day === 1;
      const dirtyPileCount =
        (rt.dirtyShelfLeft?.length || 0) + (rt.dirtyShelfRight?.length || 0);
      const messPenalty = dirtyPileCount >= 5 ? 1.3 : 1.0;
      const decay =
        district.patienceDecayRate * neonSlowdown * messPenalty * (isTutorial ? 0.35 : 1.0);

      cust.patience = Math.max(isTutorial ? 45 : 0, cust.patience - decay * dt);
      if (cust.patience <= 0) {
        this.handleCustomerWalkout();
      }
    }

    // 3. Заказы курьеров CyberEats (Поток Б)
    if (!rt.activeDelivery) {
      rt.deliverySpawnTimer -= dt;
      if (rt.deliverySpawnTimer <= 0) {
        this.spawnDeliveryOrder();
      }
    } else {
      const del = rt.activeDelivery;
      del.remainingSec -= dt;
      if (del.remainingSec <= 0) {
        this.resolveCourierArrival();
      }
    }
  }

  createCustomerOrderAndArchetype(excludeId = null) {
    const district = gameState.getCurrentDistrict();
    const unlockedBroths = gameState.getUnlockedBroths();
    const unlockedToppings = gameState.getUnlockedToppings();
    const menuDishes = gameState.getUnlockedMenuDishes();

    // Гарантируем ротацию ярких персонажей без повторов подряд (1-я Кира -> 2-й в очереди Райдэн -> 3-я Никс -> 4-я Аканэ)
    const roster = GAME_CONFIG.CUSTOMERS;
    let archetype = roster[(this.orderSeq - 1) % roster.length];
    if (excludeId && archetype.id === excludeId) {
      const others = roster.filter((c) => c.id !== excludeId);
      archetype = others[Math.floor(Math.random() * others.length)] || archetype;
    }

    // Выбираем блюдо из фирменного меню (на 1-м заказе 1-го дня всегда Классический Тонкоцу)
    const dish =
      gameState.persistent.day === 1 && this.orderSeq === 1
        ? menuDishes[0]
        : menuDishes[Math.floor(Math.random() * menuDishes.length)];

    const brothId = unlockedBroths.includes(dish.broth)
      ? dish.broth
      : dish.fallbackBroth || 'tonkotsu';

    const finalToppings = [...dish.toppings];
    let extraToppingId = null;

    // Покупатель может запросить экстра-топпинг к позиции из меню
    const extraPool = unlockedToppings.filter((id) => id !== 'chili' || !finalToppings.includes('chili'));
    if (gameState.persistent.day === 1 && this.orderSeq === 1) {
      extraToppingId = 'egg';
      finalToppings.push('egg');
    } else if (Math.random() < 0.72 && extraPool.length > 0) {
      extraToppingId = extraPool[Math.floor(Math.random() * extraPool.length)];
      finalToppings.push(extraToppingId);
    }

    const extraVoiceMap = {
      egg: 'маринованное яйцо',
      chashu: 'свинину тяшу',
      nori: 'листы нори',
      scallion: 'зелёный лук',
      shrimp: 'креветку темпура',
      chili: 'острый соус чили'
    };

    const greetings = ['Привет, шеф!', 'Доброй ночи!', 'Эй, повар!', 'Наконец-то горячий рамен!'];
    const greet = greetings[this.orderSeq % greetings.length];
    const wantsTakeout =
      !(gameState.persistent.day === 1 && this.orderSeq === 1) && Math.random() < 0.32;

    // Клиент не всегда заказывает напиток (~45% заказов, кроме самого первого заказа 1-го дня)
    const drinkKeys = Object.keys(GAME_CONFIG.DRINKS || {});
    const wantsDrink =
      !(gameState.persistent.day === 1 && this.orderSeq === 1) &&
      drinkKeys.length > 0 &&
      Math.random() < 0.45;
    const drinkId = wantsDrink ? drinkKeys[Math.floor(Math.random() * drinkKeys.length)] : null;
    const drinkCfg = drinkId ? GAME_CONFIG.DRINKS[drinkId] : null;
    const drinkSuffix = drinkCfg ? `, и ещё ${drinkCfg.voiceName}` : '';
    const takeoutSuffix = wantsTakeout ? ', и упакуй с собой в коробочке!' : '!';

    const voiceText = extraToppingId
      ? `${greet} Мне ${dish.voiceName}, добавь экстра ${extraVoiceMap[extraToppingId]}${drinkSuffix}${takeoutSuffix}`
      : `${greet} Мне один ${dish.voiceName} строго по меню${drinkSuffix}${takeoutSuffix}`;

    const order = {
      isRiddle: false,
      wantsTakeout,
      drink: drinkId,
      menuDishId: dish.id,
      menuDishName: wantsTakeout ? `${dish.name} (📦 С собой)` : dish.name,
      extraToppingId,
      broth: brothId,
      toppings: finalToppings,
      forbidden: [],
      dialogue: `«${voiceText}»`,
      voiceText
    };

    const basePrice = this.calculateOrderBasePrice(order.broth, order.toppings, district.priceMultiplier);
    this.orderSeq++;

    return {
      ...archetype,
      patience: 100,
      order,
      basePrice,
      stepForwardProgress: 1.0,
      stepInProgress: 1.0
    };
  }

  spawnCustomer() {
    const rt = gameState.runtime;

    if (rt.nextCustomer) {
      // 2-й покупатель из очереди делает шаг вперёд к прилавку на место первого!
      rt.currentCustomer = rt.nextCustomer;
      rt.currentCustomer.patience = 100;
      rt.currentCustomer.stepForwardProgress = 0.0;
    } else {
      rt.currentCustomer = this.createCustomerOrderAndArchetype(null);
      rt.currentCustomer.stepForwardProgress = 1.0;
    }

    // Сразу ставим следующего уникального персонажа вторым в очередь прямо за первым покупателем!
    rt.nextCustomer = this.createCustomerOrderAndArchetype(rt.currentCustomer.id);
    rt.nextCustomer.stepInProgress = 0.0;

    // 1. Камера автоматически поднимается на гостя ТОЛЬКО когда подходит самый первый клиент в начале смены!
    // Все остальные клиенты подходят к стойке без дёргания камеры — мы видим их и слышим голосовой заказ.
    const isFirstCustomerOfShift = !rt.firstCustomerSeen;
    rt.firstCustomerSeen = true;

    if (isFirstCustomerOfShift) {
      rt.activeSector = 1;
      rt.cameraFocus = 'customer';
      rt.customerPanSide = 0;
      rt.carryingAssembly = false;
    }

    this.onCustomerChanged();

    // 2. Посетитель озвучивает заказ голосом (авто-перевод камеры только для первого клиента смены)
    this.announceCurrentCustomerOrder(isFirstCustomerOfShift);
  }

  announceCurrentCustomerOrder(focusCamera = false) {
    const rt = gameState.runtime;
    const cust = rt.currentCustomer;
    if (!cust) return;

    if (focusCamera) {
      rt.activeSector = 1;
      rt.cameraFocus = 'customer';
      rt.customerPanSide = 0;
      rt.carryingAssembly = false;
    }
    this.onCustomerChanged();

    audio.speakCustomerOrder(cust.order.voiceText, cust.id, () => {
      // 3. Автоматически опускаем камеру на стол после речи только у первого клиента в начале смены
      if (focusCamera && gameState.runtime.currentCustomer === cust) {
        if (
          gameState.runtime.activeSector === 1 &&
          gameState.runtime.cameraFocus === 'customer' &&
          (gameState.runtime.customerPanSide || 0) === 0 &&
          !gameState.runtime.carryingAssembly
        ) {
          gameState.runtime.cameraFocus = 'worktable';
        }
        this.onCustomerChanged();
      }
    });
  }

  calculateOrderBasePrice(brothId, toppings, multiplier = 1.0) {
    const brothPrice = GAME_CONFIG.BROTHS[brothId]?.priceAdd || 45;
    const topPrice = toppings.reduce(
      (sum, id) => sum + (GAME_CONFIG.TOPPINGS[id]?.priceAdd || 15),
      0
    );
    return Math.round((brothPrice + topPrice) * multiplier);
  }

  handleCustomerWalkout() {
    const rt = gameState.runtime;
    rt.currentCustomer = null;
    rt.customerSpawnTimer = 2.0;
    rt.dailyStats.penalties += 15;
    rt.dailyStats.badReviews = (rt.dailyStats.badReviews || 0) + 1;
    gameState.persistent.rating = Math.max(1.0, +(gameState.persistent.rating - 0.2).toFixed(1));
    audio.playPenaltyBuzz();
    this.onToast('😠 Гость не дождался заказа и оставил плохой отзыв! Рейтинг -0.2★', '#ff385c');
    this.onCustomerChanged();
    gameState.save();
  }

  triggerPacifier() {
    const rt = gameState.runtime;
    if (rt.pacifierCooldown > 0) return false;
    rt.pacifierCooldown = GAME_CONFIG.PACIFIER_COOLDOWN_SEC;

    if (rt.currentCustomer) {
      rt.currentCustomer.patience = Math.min(
        100,
        rt.currentCustomer.patience + GAME_CONFIG.PACIFIER_PATIENCE_BOOST
      );
    }
    audio.playPacifierWave();
    this.onToast('🐱 Неон-Кот: волна чилла +32% к терпению!', '#ff2a85');
    this.onCustomerChanged();
    return true;
  }

  spawnDeliveryOrder() {
    const rt = gameState.runtime;
    const district = gameState.getCurrentDistrict();
    const unlockedBroths = gameState.getUnlockedBroths();
    const unlockedToppings = gameState.getUnlockedToppings().filter((id) => id !== 'chili');

    const brothId = unlockedBroths[Math.floor(Math.random() * unlockedBroths.length)];
    const t1 = unlockedToppings[Math.floor(Math.random() * unlockedToppings.length)];
    const toppings = [t1];
    if (Math.random() < 0.45) toppings.push('egg');
    if (Math.random() < 0.3) toppings.push('chili');

    const basePrice = Math.round(
      this.calculateOrderBasePrice(brothId, toppings, district.priceMultiplier) * 1.25
    );

    rt.activeDelivery = {
      id: `CE-${100 + Math.floor(Math.random() * 899)}`,
      broth: brothId,
      toppings,
      totalSec: 36,
      remainingSec: 36,
      payout: basePrice
    };
    this.onToast(`⚡ Новый заказ CyberEats (${rt.activeDelivery.id})!`, '#00f5d4');
    this.onDeliveryChanged();
  }

  resolveCourierArrival() {
    const rt = gameState.runtime;
    const del = rt.activeDelivery;
    if (!del) return;

    // Проверяем, лежит ли запаянный термо-бокс в шлюзе
    if (rt.sealerSlot && rt.sealerSlot.inAirlock && rt.sealerSlot.sealed) {
      const box = rt.sealerSlot.vessel;
      const score = this.evaluateDishAccuracy(box, {
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

      rt.sealerSlot = null;
      audio.playCoinChime();
      this.onToast(`🚀 Курьер забрал заказ! +¥${finalPayout + bonus} (★+0.1)`, '#10f56c');
    } else {
      // Штраф за просроченную доставку
      const penalty = 30;
      gameState.persistent.money -= penalty;
      rt.dailyStats.penalties += penalty;
      gameState.persistent.rating = Math.max(1.0, +(gameState.persistent.rating - 0.3).toFixed(1));
      audio.playPenaltyBuzz();
      this.onToast(`⚠️ Курьер улетел без заказа! Штраф -¥${penalty}`, '#ff385c');
    }

    rt.activeDelivery = null;
    rt.deliverySpawnTimer = 14 + Math.random() * 6;
    this.onDeliveryChanged();
    gameState.save();
  }

  evaluateDishAccuracy(vessel, targetOrder) {
    let multiplier = 1.0;
    const notes = [];

    // 1. Качество варки лапши
    if (vessel.noodleState === 'aldente') {
      multiplier += 0.15;
      notes.push('Al Dente!');
    } else if (vessel.noodleState === 'under') {
      multiplier -= 0.25;
      notes.push('Недовар');
    } else if (vessel.noodleState === 'over') {
      multiplier -= 0.3;
      notes.push('Перевар');
    } else {
      multiplier -= 0.5;
      notes.push('Без лапши!');
    }

    // 2. Бульон
    if (vessel.broth !== targetOrder.broth) {
      multiplier -= 0.35;
      notes.push('Другой бульон');
    }

    // 3. Запрещённые ингредиенты (для загадок)
    if (targetOrder.forbidden && targetOrder.forbidden.length > 0) {
      for (const f of targetOrder.forbidden) {
        if (vessel.toppings.includes(f)) {
          multiplier -= 0.35;
          notes.push(`Лишнее: ${GAME_CONFIG.TOPPINGS[f]?.shortName}`);
        }
      }
    }

    // 4. Обязательные топпинги
    const actualCopy = [...vessel.toppings];
    let matched = 0;
    for (const req of targetOrder.toppings) {
      const idx = actualCopy.indexOf(req);
      if (idx !== -1) {
        matched++;
        actualCopy.splice(idx, 1);
      }
    }
    if (targetOrder.toppings.length > 0) {
      const topRatio = matched / targetOrder.toppings.length;
      if (topRatio < 1) {
        multiplier -= (1 - topRatio) * 0.4;
        notes.push('Не все топпинги');
      }
    }

    // 5. Если прохожий не просил с собой, а ему отдали в вок-коробке — не перфект!
    if (!targetOrder.isDelivery && !targetOrder.wantsTakeout && vessel.type === 'box') {
      multiplier -= 0.14;
      notes.push('В коробке без просьбы');
    }

    // 6. Если в посуду навалили с переливом через край
    if (vessel.overflowCount && vessel.overflowCount > 0) {
      multiplier -= vessel.overflowCount * 0.15;
      notes.push('Перелив через край');
    }

    const isPerfect =
      vessel.noodleState === 'aldente' &&
      vessel.broth === targetOrder.broth &&
      matched === targetOrder.toppings.length &&
      (!vessel.overflowCount || vessel.overflowCount === 0) &&
      (targetOrder.isDelivery || targetOrder.wantsTakeout || vessel.type === 'bowl') &&
      notes.length === 1;

    return {
      multiplier: Math.max(0.25, multiplier),
      isPerfect,
      notes
    };
  }
}
