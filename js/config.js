export const GAME_CONFIG = {
  SHIFT_DURATION_SEC: 155, // ~2.5 минуты реального времени на игровую смену
  START_HOUR: 21,          // 21:00
  END_HOUR: 2,             // 02:00 ночи
  PACIFIER_COOLDOWN_SEC: 20,
  PACIFIER_PATIENCE_BOOST: 32, // +32% терпения

  // Параметры варки лапши (секунды)
  BOIL_TIME_TOTAL: 6.0,
  AL_DENTE_START: 3.4, // Зелёная зона: 3.4с — 5.1с
  AL_DENTE_END: 5.1,

  // Бульоны
  BROTHS: {
    tonkotsu: {
      id: 'tonkotsu',
      name: 'Свиной Тонкоцу',
      shortName: 'Классик бульон',
      color: '#e0a96d',
      glow: '#ffbe76',
      priceAdd: 45,
      electricityAdd: 0,
      unlockedByDefault: true,
      tags: ['classic', 'meat', 'savory']
    },
    chili_broth: {
      id: 'chili_broth',
      name: 'Острый Кибер-Чили',
      shortName: 'Острый бульон',
      color: '#e63946',
      glow: '#ff2a55',
      priceAdd: 65,
      electricityAdd: 5,
      unlockedByDefault: false,
      upgradeId: 'menu_chili_broth',
      tags: ['spicy', 'hot']
    },
    miso_mushroom: {
      id: 'miso_mushroom',
      name: 'Неоновый Грибной',
      shortName: 'Грибной бульон',
      color: '#7209b7',
      glow: '#b5179e',
      priceAdd: 75,
      electricityAdd: 5,
      unlockedByDefault: false,
      upgradeId: 'menu_miso_broth',
      tags: ['umami', 'veggie', 'forest']
    }
  },

  // Топпинги и соусы в гастроемкостях
  TOPPINGS: {
    egg: {
      id: 'egg',
      name: 'Яйцо Адзитама',
      shortName: 'Яйцо',
      emoji: '🥚',
      priceAdd: 20,
      restockUnitCost: 5,
      unlockedByDefault: true,
      isSauce: false,
      tags: ['protein', 'classic']
    },
    chashu: {
      id: 'chashu',
      name: 'Свинина Тяшу',
      shortName: 'Свинина',
      emoji: '🥩',
      priceAdd: 30,
      restockUnitCost: 8,
      unlockedByDefault: true,
      isSauce: false,
      tags: ['meat', 'protein']
    },
    nori: {
      id: 'nori',
      name: 'Водоросли Нори',
      shortName: 'Нори',
      emoji: '🌿',
      priceAdd: 15,
      restockUnitCost: 4,
      unlockedByDefault: true,
      isSauce: false,
      tags: ['green', 'sea', 'veggie']
    },
    scallion: {
      id: 'scallion',
      name: 'Зелёный лук',
      shortName: 'Лук',
      emoji: '🧅',
      priceAdd: 12,
      restockUnitCost: 3,
      unlockedByDefault: true,
      isSauce: false,
      tags: ['green', 'veggie']
    },
    shrimp: {
      id: 'shrimp',
      name: 'Кибер-креветка',
      shortName: 'Креветка',
      emoji: '🦐',
      priceAdd: 42,
      restockUnitCost: 11,
      unlockedByDefault: false,
      upgradeId: 'menu_shrimp',
      isSauce: false,
      tags: ['seafood', 'sea', 'protein']
    },
    chili: {
      id: 'chili',
      name: 'Острый Чили-соус',
      shortName: 'Чили-соус',
      emoji: '🌶️',
      priceAdd: 18,
      restockUnitCost: 4,
      unlockedByDefault: true,
      isSauce: true,
      tags: ['spicy', 'hot']
    }
  },

  // Фирменные позиции Меню Раменной (Готовка строго по меню + возможный экстра-топпинг)
  MENU_DISHES: [
    {
      id: 'classic_tonkotsu',
      name: 'Классический Тонкоцу',
      voiceName: 'классический Тонкоцу',
      broth: 'tonkotsu',
      toppings: ['chashu', 'scallion'],
      desc: 'Свиной бульон Тонкоцу + Лапша + Свинина Тяшу 🥩 + Зелёный лук 🧅',
      unlockedByDefault: true
    },
    {
      id: 'tokyo_ajitama',
      name: 'Токио Адзитама',
      voiceName: 'рамен Токио Адзитама',
      broth: 'tonkotsu',
      toppings: ['egg', 'nori'],
      desc: 'Свиной бульон Тонкоцу + Лапша + Маринованное яйцо 🥚 + Водоросли Нори 🌿',
      unlockedByDefault: true
    },
    {
      id: 'samurai_blaze',
      name: 'Огненный Самурай',
      voiceName: 'Огненный Самурай',
      broth: 'chili_broth', // если ещё не открыт чан чили, готовится на свином с чили-соусом
      fallbackBroth: 'tonkotsu',
      toppings: ['chashu', 'egg', 'chili'],
      desc: 'Бульон (Острый/Свиной) + Лапша + Свинина Тяшу 🥩 + Яйцо 🥚 + Чили-соус 🌶️',
      unlockedByDefault: true
    },
    {
      id: 'emerald_zen',
      name: 'Изумрудный Дзен',
      voiceName: 'Изумрудный Дзен',
      broth: 'miso_mushroom',
      fallbackBroth: 'tonkotsu',
      toppings: ['nori', 'scallion', 'egg'],
      desc: 'Бульон (Грибной/Свиной) + Лапша + Нори 🌿 + Зелёный лук 🧅 + Яйцо 🥚',
      unlockedByDefault: true
    },
    {
      id: 'imperial_tempura',
      name: 'Императорский Темпура',
      voiceName: 'Императорский Темпура',
      broth: 'tonkotsu',
      toppings: ['shrimp', 'nori', 'scallion'],
      desc: 'Свиной бульон + Лапша + Креветка Темпура 🦐 + Нори 🌿 + Зелёный лук 🧅',
      requiresUpgrade: 'menu_shrimp'
    }
  ],

  // Районы мегаполиса и визуальные тиры тележки
  DISTRICTS: [
    {
      tier: 1,
      id: 'slums',
      name: 'ТРУЩОБЫ СЕКТОРА-9',
      subtitle: 'Ветхая деревянная повозка в тёмном переулке',
      dailyTax: 45,
      baseElectricity: 15,
      priceMultiplier: 1.0,
      tipMultiplier: 1.0,
      patienceDecayRate: 2.35 // % в секунду (~42 сек ожидания)
    },
    {
      tier: 2,
      id: 'neon_market',
      name: 'НЕОНОВЫЙ РЫНОК',
      subtitle: 'Стальной кибер-ларёк с неоновыми трубками',
      dailyTax: 95,
      baseElectricity: 30,
      priceMultiplier: 1.35,
      tipMultiplier: 1.35,
      patienceDecayRate: 2.7
    },
    {
      tier: 3,
      id: 'corpo_plaza',
      name: 'ДЕЛОВОЙ КВАРТАЛ',
      subtitle: 'Хромированный фудтрак с голограммами у башен корпораций',
      dailyTax: 170,
      baseElectricity: 55,
      priceMultiplier: 1.75,
      tipMultiplier: 1.8,
      patienceDecayRate: 3.05
    }
  ],

  // Дерево улучшений (Кухня, Меню, Тележка/Районы)
  UPGRADES: [
    // Оборудование кухни
    {
      id: 'basket_2',
      category: 'Оборудование кухни',
      name: '2-я корзина для варки',
      desc: 'Позволяет варить две порции лапши одновременно.',
      cost: 140,
      elecCost: 8
    },
    {
      id: 'basket_3',
      category: 'Оборудование кухни',
      name: '3-я корзина для варки',
      desc: 'Максимальная мощность варочного цеха (3 корзины).',
      cost: 260,
      elecCost: 12,
      requires: 'basket_2'
    },
    {
      id: 'auto_boiler',
      category: 'Оборудование кухни',
      name: 'Нейро-таймер Al Dente',
      desc: 'Лапша сама поднимается из кипятка в зелёной зоне и никогда не переваривается!',
      cost: 320,
      elecCost: 15
    },
    {
      id: 'xl_trays',
      category: 'Оборудование кухни',
      name: 'Глубокие гастроемкости XL',
      desc: 'Вместимость лотков на прилавке увеличивается с 6 до 12 порций.',
      cost: 180,
      elecCost: 0
    },
    {
      id: 'auto_sealer',
      category: 'Оборудование кухни',
      name: 'Авто-запайщик CyberEats',
      desc: 'Мгновенно запаивает термо-контейнеры при переносе в правый сектор.',
      cost: 240,
      elecCost: 10
    },

    // Расширение меню
    {
      id: 'menu_chili_broth',
      category: 'Новые позиции меню',
      name: 'Чан: Острый Кибер-Чили бульон',
      desc: 'Жгучий красный бульон (+¥65 к чеку). Открывает огненные заказы.',
      cost: 160,
      elecCost: 6
    },
    {
      id: 'menu_miso_broth',
      category: 'Новые позиции меню',
      name: 'Чан: Неоновый Грибной бульон',
      desc: 'Биолюминесцентный бульон умами (+¥75 к чеку). Любим хакерами.',
      cost: 230,
      elecCost: 8
    },
    {
      id: 'menu_shrimp',
      category: 'Новые позиции меню',
      name: 'Топпинг: Кибер-креветка',
      desc: 'Синтетический деликатес (+¥42 к порции). Повышает статус меню.',
      cost: 210,
      elecCost: 5
    },

    // Эволюция тележки и переезд
    {
      id: 'neon_sign',
      category: 'Эволюция тележки и локации',
      name: 'Неоновая вывеска и гирлянды',
      desc: 'Замедляет падение терпения клиентов на 25% и повышает чаевые.',
      cost: 175,
      elecCost: 10
    },
    {
      id: 'district_2',
      category: 'Эволюция тележки и локации',
      name: 'Шасси МК-II: Переезд на Неоновый рынок',
      desc: 'Трансформирует повозку в неоновый кибер-ларёк! Цены и чаевые x1.35.',
      cost: 390,
      elecCost: 15
    },
    {
      id: 'district_3',
      category: 'Эволюция тележки и локации',
      name: 'Антиграв-привод: Деловой квартал корпораций',
      desc: 'Хромированный фудтрак с голограммами! Цены x1.75, элитные гости.',
      cost: 780,
      elecCost: 25,
      requires: 'district_2'
    }
  ],

  // Тарифы «Кибер-Банка»
  LOANS: [
    {
      id: 'micro',
      name: 'Тариф «Микро-Импульс»',
      principal: 180,
      totalRepay: 210,
      dailyPayment: 70,
      days: 3,
      desc: 'Быстрые оборотные средства на продукты или первый чан бульона.'
    },
    {
      id: 'expansion',
      name: 'Тариф «Кибер-Оборот»',
      principal: 400,
      totalRepay: 480,
      dailyPayment: 120,
      days: 4,
      desc: 'Оптимальный кредит для покупки авто-таймера или переезда на Неоновый рынок.'
    },
    {
      id: 'corpo_lease',
      name: 'Тариф «Корпо-Лизинг»',
      principal: 750,
      totalRepay: 900,
      dailyPayment: 180,
      days: 5,
      desc: 'Крупный инвестиционный транш на хромированный фудтрак.'
    }
  ],

  // Архетипы посетителей (4 уникальных аниме-киберпанк персонажа)
  CUSTOMERS: [
    {
      id: 'student',
      name: 'Кира (Кибер-курьер)',
      role: 'КИБЕР-КУРЬЕР',
      palette: { skin: '#f4c5ad', hair: '#d92672', visor: '#00f5d4', coat: '#1c1829' }
    },
    {
      id: 'samurai',
      name: 'Райдэн (Неоновый ронин)',
      role: 'НЕОНОВЫЙ РОНИН',
      palette: { skin: '#ecc1a8', hair: '#b8cbe0', visor: '#ff2a55', coat: '#141824' }
    },
    {
      id: 'hacker',
      name: 'Никс (Нетраннер)',
      role: 'НЕТРАННЕР-ХАКЕР',
      palette: { skin: '#f7d1bf', hair: '#9d4edd', visor: '#00f5d4', coat: '#17132b' }
    },
    {
      id: 'corpo',
      name: 'Аканэ (Агент корпорации)',
      role: 'АГЕНТ КОРПОРАЦИИ',
      palette: { skin: '#f6cbb6', hair: '#dce2ec', visor: '#ffbe0b', coat: '#16141f' }
    }
  ],

  // Загадки (нарративные заказы)
  RIDDLE_TEMPLATES: [
    {
      id: 'burn_implants_no_green',
      text: '«Сделай так, чтобы у меня задымились импланты, но без этой зелёной травы!»',
      hintChips: ['🔥 Максимум остроты', '🚫 Без зелени (лук/нори)'],
      buildRecipe: (unlockedBroths) => ({
        broth: unlockedBroths.includes('chili_broth') ? 'chili_broth' : 'tonkotsu',
        toppings: ['chashu', 'chili'],
        forbidden: ['scallion', 'nori']
      })
    },
    {
      id: 'samurai_double_protein',
      text: '«После боя нужен двойной мясной заряд и яйцо на классическом бульоне!»',
      hintChips: ['🍜 Классик бульон', '🥩x2 Двойная свинина', '🥚 Яйцо'],
      buildRecipe: () => ({
        broth: 'tonkotsu',
        toppings: ['chashu', 'chashu', 'egg'],
        forbidden: []
      })
    },
    {
      id: 'vegan_zen_forest',
      text: '«Хочу чистый вегетарианский дзен: зелень и водоросли, никакого мяса и креветок!»',
      hintChips: ['🍄 Грибной или Классик', '🌿 Нори + 🧅 Лук', '🚫 Без мяса/морепродуктов'],
      buildRecipe: (unlockedBroths) => ({
        broth: unlockedBroths.includes('miso_mushroom') ? 'miso_mushroom' : 'tonkotsu',
        toppings: ['nori', 'scallion'],
        forbidden: ['chashu', 'shrimp']
      })
    },
    {
      id: 'cyber_sea_spicy',
      text: '«Дары кибер-моря под огненным соусом чили!»',
      hintChips: ['🦐/🌿 Море + Нори', '🌶️ Чили-соус'],
      buildRecipe: (unlockedBroths, unlockedToppings) => ({
        broth: unlockedBroths[0],
        toppings: unlockedToppings.includes('shrimp') ? ['shrimp', 'nori', 'chili'] : ['egg', 'nori', 'chili'],
        forbidden: []
      })
    }
  ]
};
