import { GAME_CONFIG } from './config.js?v=87';

const BASE_SAVE_KEY = 'CR_NIGHT_YATAI_SAVE_V1';

function initTelegramMiniApp() {
  try {
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
    if (!tg) return null;
    tg.ready?.();
    tg.expand?.();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#07050c');
    tg.setBackgroundColor?.('#07050c');
    return tg;
  } catch {
    return null;
  }
}

export function getTelegramUser() {
  try {
    const user = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user : null;
    if (user && user.id) {
      return {
        id: String(user.id),
        username: user.username || '',
        firstName: user.first_name || 'Шеф'
      };
    }
  } catch {
    // fallback to local guest profile
  }
  return null;
}

function getActiveSaveKey() {
  const tgUser = getTelegramUser();
  return tgUser ? `${BASE_SAVE_KEY}_TG_${tgUser.id}` : BASE_SAVE_KEY;
}

export function getMaxTrayCapacity(upgrades = []) {
  return upgrades.includes('xl_trays') ? 12 : 6;
}

export function createInitialPersistentState() {
  const maxCap = getMaxTrayCapacity([]);
  return {
    version: 1,
    day: 1,
    money: 150,
    rating: 4.8,
    upgrades: [],
    activeLoan: null,
    inDebtCollector: false,
    tutorialDone: false,
    pwaPromptSeen: false,
    settings: {
      muted: false,
      musicOn: true,
      rainOn: true
    },
    trayStock: {
      egg: maxCap,
      chashu: maxCap,
      nori: maxCap,
      scallion: maxCap,
      shrimp: maxCap,
      chili: maxCap
    }
  };
}

export function createShiftRuntimeState() {
  return {
    activeSector: 1, // -1: Мойка (слева от плиты), 0: Лево (Варка), 1: Центр (Сборка/Гость), 2: Право (Склад/Курьер)
    cameraFocus: 'worktable', // 'customer' (верхний ракурс) | 'worktable' (стол) | 'under_counter' (под прилавком: подносы/пакеты)
    customerPanSide: 0, // -1: взгляд влево на грязные миски, 0: по центру на гостя, +1: взгляд вправо на дрона
    underCounterSide: 0, // 0: подносы под прилавком, 1: пакеты для заказов с собой правее под прилавком
    carryingAssembly: false, // true ТОЛЬКО когда поднялись к клиенту прямо с основной столешницы с собранным подносом/пакетом!
    fridgeOpen: false, // true когда дверца крио-холодильника открыта и камера внутри него!
    customerTalking: false,
    firstCustomerSeen: false,
    shiftElapsed: 0,
    shiftActive: true,
    pacifierCooldown: 0,
    sauceModeArmed: false,
    vesselHeldInLeft: false,
    pendingVesselChoice: null,
    // Круговорот из 10 керамических мисок (Чистые -> В заказе -> Едят -> Грязные на полке -> Грязные в мойке -> Чистые)
    maxCleanBowls: 10,
    cleanBowls: 10,
    eatingTimers: [],
    dirtyShelfLeft: [],
    dirtyShelfRight: [],
    dirtyInSink: [],
    washedOnRack: 0,
    nextDirtyShelfSide: 'left',
    baskets: [
      { index: 0, state: 'empty', elapsed: 0 },
      { index: 1, state: 'empty', elapsed: 0 },
      { index: 2, state: 'empty', elapsed: 0 }
    ],
    // Посуда, которая сейчас находится в ЛЕВОЙ РУКЕ повара (перемещается вместе с нами по всем секторам!)
    activeVessel: {
      type: null,         // null (рука свободна) | 'bowl' (миска в левой руке) | 'box' (вок-коробка в левой руке)
      noodleState: null,  // null | 'under' | 'aldente' | 'over'
      broth: null,        // null | 'tonkotsu' | 'chili_broth' | 'miso_mushroom'
      toppings: [],       // массив id топпингов
      tableAgeSec: 0,     // сколько секунд простояла на центральном столе (влияет на свежесть и отзывы!)
      wasStagedOnTable: false,
      overflowCount: 0    // перелив через край (перевод продуктов)
    },
    // Посуда, которая сейчас находится в ПРАВОЙ РУКЕ повара (при двуручном переливании / подъёме с подноса / парных пустых тарелках!)
    rightHandVessel: null,
    // Зона сборки заказа в центре столешницы (поднос / пакет, поставленная миска или коробка, палочки, напитки)
    assembly: {
      hasTray: false,
      hasBag: false,
      isDirtyTray: false,
      dirtyTrayBroth: null,
      vessel: null,
      hasChopsticks: false,
      drink: null
    },
    // Лужа пролитого бульона на рабочей поверхности столешницы (level: 0 = чисто, 1 = небольшой перелив, 2 = мощный потоп с лапшой!)
    tableSpill: {
      level: 0,
      broth: 'tonkotsu',
      hasNoodles: false
    },
    tableSlots: [null, null, null],
    sealerSlot: null,     // { vessel, sealed: false, inAirlock: false }
    currentCustomer: null,
    nextCustomer: null,   // 2-й покупатель в очереди, стоящий сразу за первым покупателем
    customerSpawnTimer: 1.0,
    activeDelivery: null,
    deliverySpawnTimer: 12.0,
    dailyStats: {
      salesRevenue: 0,
      tipsEarned: 0,
      deliveryBonuses: 0,
      collectorWithheld: 0,
      restockSpent: 0,
      penalties: 0,
      wastedFoodCost: 0,
      badReviews: 0,
      servedCount: 0,
      deliveryCount: 0
    }
  };
}

class GameStateManager {
  constructor() {
    this.tg = initTelegramMiniApp();
    this.telegramUser = getTelegramUser();
    this.saveKey = getActiveSaveKey();
    this.persistent = this.load();
    this.runtime = createShiftRuntimeState();
    this.listeners = new Set();
    this.syncFromTelegramCloud();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return createInitialPersistentState();
      const parsed = JSON.parse(raw);
      const base = createInitialPersistentState();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        trayStock: { ...base.trayStock, ...(parsed.trayStock || {}) }
      };
    } catch {
      return createInitialPersistentState();
    }
  }

  syncFromTelegramCloud() {
    try {
      const cloud = this.tg?.CloudStorage;
      if (!cloud || !this.telegramUser) return;
      cloud.getItem(this.saveKey, (err, value) => {
        if (err || !value) return;
        try {
          const parsed = JSON.parse(value);
          if (parsed && (parsed.day > this.persistent.day || parsed.money !== this.persistent.money)) {
            const base = createInitialPersistentState();
            this.persistent = {
              ...base,
              ...parsed,
              settings: { ...base.settings, ...(parsed.settings || {}) },
              trayStock: { ...base.trayStock, ...(parsed.trayStock || {}) }
            };
            localStorage.setItem(this.saveKey, JSON.stringify(this.persistent));
            this.notify();
          }
        } catch {
          // ignore malformed cloud data
        }
      });
    } catch {
      // CloudStorage not supported in this client version
    }
  }

  save() {
    const serialized = JSON.stringify(this.persistent);
    try {
      localStorage.setItem(this.saveKey, serialized);
    } catch {
      // Игнорируем ошибки квоты в приватном режиме
    }
    try {
      if (this.tg?.CloudStorage && this.telegramUser) {
        this.tg.CloudStorage.setItem(this.saveKey, serialized);
      }
    } catch {
      // ignore CloudStorage error
    }
    this.notify();
  }

  resetAll() {
    this.persistent = createInitialPersistentState();
    this.runtime = createShiftRuntimeState();
    this.save();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      fn(this.persistent, this.runtime);
    }
  }

  hasUpgrade(id) {
    return this.persistent.upgrades.includes(id);
  }

  getCurrentDistrict() {
    if (this.hasUpgrade('district_3')) return GAME_CONFIG.DISTRICTS[2];
    if (this.hasUpgrade('district_2')) return GAME_CONFIG.DISTRICTS[1];
    return GAME_CONFIG.DISTRICTS[0];
  }

  getUnlockedBasketCount() {
    if (this.hasUpgrade('basket_3')) return 3;
    if (this.hasUpgrade('basket_2')) return 2;
    return 1;
  }

  getUnlockedBroths() {
    return Object.values(GAME_CONFIG.BROTHS)
      .filter((b) => b.unlockedByDefault || (b.upgradeId && this.hasUpgrade(b.upgradeId)))
      .map((b) => b.id);
  }

  getUnlockedToppings() {
    return Object.values(GAME_CONFIG.TOPPINGS)
      .filter((t) => t.unlockedByDefault || (t.upgradeId && this.hasUpgrade(t.upgradeId)))
      .map((t) => t.id);
  }

  getUnlockedMenuDishes() {
    return GAME_CONFIG.MENU_DISHES.filter(
      (d) => d.unlockedByDefault || (d.requiresUpgrade && this.hasUpgrade(d.requiresUpgrade))
    );
  }

  getMaxTrayCap() {
    return getMaxTrayCapacity(this.persistent.upgrades);
  }
}

export const gameState =
  typeof window !== 'undefined'
    ? (window.__CYBER_RAMEN_STATE__ = window.__CYBER_RAMEN_STATE__ || new GameStateManager())
    : new GameStateManager();
