import { GAME_CONFIG } from './config.js?v=74';
import { gameState } from './state.js?v=74';
import {
  createAlleyBackdropTexture,
  createBuildingFacadeTexture,
  createACUnitTexture,
  createWetAsphaltTexture,
  createKanjiSignTextures,
  createPedestrianTextures,
  AnimeCustomerTextureRenderer
} from './art3d.js?v=74';

/**
 * Полноэкранный WebGL 3D движок от первого лица с процедурной высокодетализированной
 * геометрией (тела вращения Lathe для круглых мисок и котлов, полусферы для яиц Аджитама,
 * торы для колечек зелёного лука, волнистые меши лапши, цилиндры с процедурным мраморным
 * узором для свинины Тяшу и рифлёные листы Нори).
 */
export class FirstPersonWebGLScene {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.gl =
      canvas.getContext('webgl', { antialias: true, alpha: false }) ||
      canvas.getContext('experimental-webgl');

    this.holoLayer = document.getElementById('holo-labels-layer');
    this.holoNodes = new Map();

    this.time = 0;
    this.width = 390;
    this.height = 844;

    // Позиция глаз повара внутри тележки (плавно переключается между крупным планом гостя и крупным планом стола с миской)
    this.camPos = [0, 1.58, 0.22];
    this.camPosTarget = [0, 1.58, 0.22];
    this.lookAtCurrent = [0, 0.94, -0.51];
    this.lookAtTarget = [0, 0.94, -0.51];
    this.dragPanX = 0;
    this.dragPanY = 0;

    // Пружинная анимация наполнения 3D-миски при добавлении ингредиентов
    this.vesselBounce = 0;
    this.lastVesselSig = '';

    // Состояние 3D-посуды (миски или вок-коробки), которая ВСЕГДА держится в левой руке повара при перемещении между секторами
    this.heldVesselAppear = 0;
    this.tablePlaceAnim = 0;
    this.pourAnim = {
      active: false,
      type: 'none',
      timer: 0,
      duration: 0.88,
      potIndex: 0,
      brothId: 'tonkotsu',
      basketIndex: 0,
      quality: 'aldente'
    };

    // Анимации взятия и возврата посуды справа (Сектор 2), работы с 3 слотами стола (Сектор 1), мусорки и дрона-курьера
    this.rightGrabAnim = { active: false, type: 'bowl', timer: 0, duration: 0.32 };
    this.rightReturnAnim = { active: false, type: 'bowl', timer: 0, duration: 0.48, targetIdx: 0 };
    this.slotAnim = {
      active: false,
      action: 'place', // 'place' | 'pickup' | 'pour'
      slotIndex: 1,
      timer: 0,
      duration: 0.48,
      vessel: null,
      fromType: 'bowl',
      toType: 'box'
    };
    this.trashTossAnim = {
      active: false,
      timer: 0,
      duration: 0.52,
      vessel: null
    };
    this.droneDeliverAnim = {
      active: false,
      timer: 0,
      duration: 0.88,
      vessel: null
    };
    this.collectDirtyAnim = {
      active: false,
      side: 'left',
      timer: 0,
      duration: 0.42,
      bowl: null
    };
    this.sinkWashAnim = {
      active: false,
      timer: 0,
      duration: 0.96,
      bowl: null,
      sinkIndex: 0,
      rackIndex: 0
    };
    this.rackPickupAnim = {
      active: false,
      timer: 0,
      duration: 0.42,
      fromRackIdx: 0
    };
    this.sinkFaucetFlowTimer = 0;
    this.handPourAnim = {
      active: false,
      fromType: 'bowl',
      toType: 'box',
      timer: 0,
      duration: 1.48,
      vessel: null
    };
    this.toppingAnim = {
      active: false,
      toppingId: 'egg',
      timer: 0,
      duration: 0.68
    };
    this.trayPlaceAnim = { active: false, timer: 0, duration: 0.56 };
    this.bagPackAnim = {
      active: false,
      timer: 0,
      duration: 0.94,
      hadItems: false,
      onTray: false,
      prevVessel: null,
      prevChopsticks: false,
      prevDrink: null
    };
    this.assemblyVesselAnim = {
      active: false,
      action: 'place',
      timer: 0,
      duration: 0.38,
      vessel: null,
      intoBag: false
    };
    this.chopsticksPlaceAnim = { active: false, timer: 0, duration: 0.42 };
    this.drinkPlaceAnim = {
      active: false,
      drinkId: 'cola',
      intoBag: false,
      timer: 0,
      duration: 1.28
    };
    this.fridgeDoorOpenT = 0; // 0 = дверца закрыта, 1 = дверца распахнута на 110°
    this.fridgeDoorHandAnim = { active: false, action: 'open', timer: 0, duration: 0.56 };
    this.fridgeRestockAnim = { active: false, toppingId: 'egg', timer: 0, duration: 0.58 };
    this.servePushAnim = { active: false, timer: 0, duration: 0.46, servedBag: false };
    this.centerPlaceFromRight = 0;
    this.existingShiftProgress = 0;
    this.returnHeldAnim = { active: false, type: 'bowl', timer: 0, duration: 0.48 };
    this.discardSwipeAnim = {
      active: false,
      timer: 0,
      duration: 0.58,
      oldVessel: null,
      newType: null
    };

    this.handAnim = {
      active: false,
      type: 'none',
      timer: 0,
      duration: 0.4,
      color: [0, 0.96, 0.83]
    };

    this.meshes = {};
    this.interactables = [];
    this.holoMarkers = [];
    this.rain3D = [];
    this.steam3D = [];
    this.coins3D = [];
    this.uiScale = 1.0;
    this.currentTanHalfFovY = Math.tan((68 * Math.PI) / 360);
    this.currentAspect = 0.56;

    this.initParticles();
    if (this.gl) {
      this.initShadersAndMeshes();
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 80));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }
    if (typeof ResizeObserver !== 'undefined' && this.canvas) {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.canvas);
    }
    this.initDirect3DInput();
  }

  initParticles() {
    for (let i = 0; i < 85; i++) {
      this.rain3D.push({
        x: (Math.random() - 0.5) * 9.0,
        y: 0.4 + Math.random() * 5.0,
        z: -2.0 - Math.random() * 5.5,
        speed: 4.8 + Math.random() * 2.5
      });
    }
    for (let i = 0; i < 34; i++) {
      this.steam3D.push({
        x: (Math.random() - 0.5) * 0.5,
        y: Math.random() * 0.7,
        z: (Math.random() - 0.5) * 0.5,
        speed: 0.32 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  spawnCoins(count = 10) {
    for (let i = 0; i < count; i++) {
      this.coins3D.push({
        x: (Math.random() - 0.5) * 0.4,
        y: 1.08,
        z: -0.52,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 1.5 + Math.random() * 1.1,
        vz: (Math.random() - 0.5) * 0.7,
        life: 1.0
      });
    }
    this.triggerHandAction('serve', [0.06, 0.96, 0.42]);
  }

  triggerHandAction(type, color = [0, 0.96, 0.83]) {
    this.handAnim.active = true;
    this.handAnim.type = type;
    this.handAnim.timer = 0;
    this.handAnim.duration = type === 'serve' ? 0.5 : 0.34;
    this.handAnim.color = color;
    this.vesselBounce = 1.0;
  }

  triggerBrothPourAnim(brothId) {
    const brothKeys = ['tonkotsu', 'chili_broth', 'miso_mushroom'];
    const idx = Math.max(0, brothKeys.indexOf(brothId));
    this.pourAnim.active = true;
    this.pourAnim.type = 'broth';
    this.pourAnim.timer = 0;
    this.pourAnim.duration = 1.04;
    this.pourAnim.potIndex = idx;
    this.pourAnim.brothId = brothId;
    this.vesselBounce = 1.0;
  }

  triggerNoodleDumpAnim(basketIndex, quality = 'aldente') {
    this.pourAnim.active = true;
    this.pourAnim.type = 'noodles';
    this.pourAnim.timer = 0;
    this.pourAnim.duration = 1.08;
    this.pourAnim.basketIndex = basketIndex;
    this.pourAnim.quality = quality;
    this.vesselBounce = 1.0;
  }

  triggerTablePlaceAnim() {
    this.tablePlaceAnim = 1.0;
    this.heldVesselAppear = 0;
    this.pourAnim.active = false;
    this.vesselBounce = 0.85;
  }

  triggerRightStackGrabAnim(type = 'bowl') {
    this.rightReturnAnim.active = false;
    this.rightGrabAnim.active = true;
    this.rightGrabAnim.type = type;
    this.rightGrabAnim.timer = 0;
    this.rightGrabAnim.duration = 0.56;
    this.heldVesselAppear = 1.0;
    this.vesselBounce = 0.45;
  }

  triggerRightStackReturnAnim(type = 'bowl') {
    this.rightGrabAnim.active = false;
    this.rightReturnAnim.active = true;
    this.rightReturnAnim.type = type;
    this.rightReturnAnim.timer = 0;
    this.rightReturnAnim.duration = 0.48;
    this.rightReturnAnim.targetIdx = Math.max(0, Math.min(9, (gameState.runtime.cleanBowls ?? 1) - 1));
    this.vesselBounce = 0.35;
  }

  triggerTableSlotPlaceAnim(slotIndex = 1, vessel = null) {
    this.slotAnim.active = true;
    this.slotAnim.action = 'place';
    this.slotAnim.slotIndex = slotIndex;
    this.slotAnim.timer = 0;
    this.slotAnim.duration = 0.38;
    this.slotAnim.vessel = vessel ? { ...vessel, toppings: [...(vessel.toppings || [])] } : null;
    this.vesselBounce = 0.75;
  }

  triggerTableSlotPickupAnim(slotIndex = 1, vessel = null) {
    this.slotAnim.active = true;
    this.slotAnim.action = 'pickup';
    this.slotAnim.slotIndex = slotIndex;
    this.slotAnim.timer = 0;
    this.slotAnim.duration = 0.38;
    this.slotAnim.vessel = vessel ? { ...vessel, toppings: [...(vessel.toppings || [])] } : null;
    this.heldVesselAppear = 0.35;
    this.vesselBounce = 0.8;
  }

  triggerTableSlotPourAnim(slotIndex = 1, fromType = 'bowl', toType = 'box', vessel = null) {
    this.slotAnim.active = true;
    this.slotAnim.action = 'pour';
    this.slotAnim.slotIndex = slotIndex;
    this.slotAnim.timer = 0;
    this.slotAnim.duration = 0.68;
    this.slotAnim.fromType = fromType;
    this.slotAnim.toType = toType;
    this.slotAnim.vessel = vessel ? { ...vessel, toppings: [...(vessel.toppings || [])] } : null;
    this.vesselBounce = 1.0;
  }

  triggerTossFromHandToTrashAnim(vessel = null) {
    this.trashTossAnim.active = true;
    this.trashTossAnim.timer = 0;
    this.trashTossAnim.duration = 0.52;
    this.trashTossAnim.vessel = vessel ? { ...vessel, toppings: [...(vessel.toppings || [])] } : null;
    this.heldVesselAppear = 0;
  }

  triggerAutoCloseAndDroneDeliverAnim(vessel = null) {
    this.droneDeliverAnim.active = true;
    this.droneDeliverAnim.timer = 0;
    this.droneDeliverAnim.duration = 0.88;
    this.droneDeliverAnim.vessel = vessel ? { ...vessel, toppings: [...(vessel.toppings || [])] } : { type: 'box', toppings: [] };
    this.heldVesselAppear = 0;
  }

  triggerCollectDirtyBowlAnim(side = 'left', bowl = null) {
    this.collectDirtyAnim.active = true;
    this.collectDirtyAnim.side = side;
    this.collectDirtyAnim.timer = 0;
    this.collectDirtyAnim.duration = 0.42;
    this.collectDirtyAnim.bowl = bowl || { broth: 'tonkotsu' };
  }

  triggerDirectHandPourAnim(fromType = 'bowl', toType = 'box', vessel = null) {
    this.handPourAnim.active = true;
    this.handPourAnim.fromType = fromType;
    this.handPourAnim.toType = toType;
    this.handPourAnim.timer = 0;
    this.handPourAnim.duration = 1.48;
    this.handPourAnim.vessel = vessel
      ? { ...vessel, toppings: [...(vessel.toppings || [])] }
      : { type: toType, broth: 'tonkotsu', noodleState: 'aldente', toppings: [] };
    this.heldVesselAppear = 1.0;
    this.vesselBounce = 0.85;
  }

  triggerSinkWashAnim(bowl = null) {
    this.sinkWashAnim.active = true;
    this.sinkWashAnim.timer = 0;
    this.sinkWashAnim.duration = 0.96;
    this.sinkWashAnim.bowl = bowl || { broth: 'tonkotsu' };
    this.sinkWashAnim.sinkIndex = bowl?.sinkIndex ?? 0;
    this.sinkWashAnim.rackIndex = bowl?.rackIndex ?? 0;
    // Вода из крана начинает лить при тапе на тарелочку и продолжает идти ещё 1 секунду после завершения мытья!
    this.sinkFaucetFlowTimer = this.sinkWashAnim.duration + 1.0;
  }

  triggerToppingPlaceAnim(toppingId = 'egg') {
    this.toppingAnim.active = true;
    this.toppingAnim.toppingId = toppingId || 'egg';
    this.toppingAnim.timer = 0;
    this.toppingAnim.duration = 0.68;
    this.vesselBounce = 0.75;
  }

  triggerTrayPlaceAnim() {
    this.trayPlaceAnim.active = true;
    this.trayPlaceAnim.timer = 0;
    this.trayPlaceAnim.duration = 0.56;
  }

  triggerBagPackAnim(info = {}) {
    this.bagPackAnim.active = true;
    this.bagPackAnim.timer = 0;
    this.bagPackAnim.duration = info.hadItems ? 0.96 : 0.56;
    this.bagPackAnim.hadItems = Boolean(info.hadItems);
    this.bagPackAnim.onTray = Boolean(info.onTray);
    this.bagPackAnim.prevVessel = info.prevVessel || null;
    this.bagPackAnim.prevChopsticks = Boolean(info.prevChopsticks);
    this.bagPackAnim.prevDrink = info.prevDrink || null;
  }

  triggerFridgeDoorAnim(action = 'open') {
    this.fridgeDoorHandAnim.active = true;
    this.fridgeDoorHandAnim.action = action;
    this.fridgeDoorHandAnim.timer = 0;
    this.fridgeDoorHandAnim.duration = 0.56;
  }

  triggerFridgeRestockAnim(toppingId = 'egg') {
    this.fridgeRestockAnim.active = true;
    this.fridgeRestockAnim.toppingId = toppingId;
    this.fridgeRestockAnim.timer = 0;
    this.fridgeRestockAnim.duration = 0.58;
  }

  triggerDrinkPlaceAnim(drinkId = 'cola', intoBag = false) {
    this.drinkPlaceAnim.active = true;
    this.drinkPlaceAnim.drinkId = drinkId;
    this.drinkPlaceAnim.intoBag = Boolean(intoBag);
    this.drinkPlaceAnim.timer = 0;
    this.drinkPlaceAnim.duration = 1.28;
  }

  triggerAssemblyVesselAnim(res = {}) {
    this.assemblyVesselAnim.active = true;
    this.assemblyVesselAnim.action = res.action || 'place';
    this.assemblyVesselAnim.timer = 0;
    this.assemblyVesselAnim.duration = 0.38;
    this.assemblyVesselAnim.vessel = res.vessel
      ? { ...res.vessel, toppings: [...(res.vessel.toppings || [])] }
      : null;
    this.assemblyVesselAnim.intoBag = Boolean(res.intoBag || res.fromBag);
    this.vesselBounce = 0.7;
  }

  triggerChopsticksPlaceAnim() {
    this.chopsticksPlaceAnim.active = true;
    this.chopsticksPlaceAnim.timer = 0;
    this.chopsticksPlaceAnim.duration = 0.42;
  }

  triggerServePushAnim(servedBag = false) {
    this.servePushAnim.active = true;
    this.servePushAnim.timer = 0;
    this.servePushAnim.duration = 0.46;
    this.servePushAnim.servedBag = Boolean(servedBag);
  }

  triggerRackToCleanStackAnim(fromRackIdx = 0) {
    this.rackPickupAnim.active = true;
    this.rackPickupAnim.timer = 0;
    this.rackPickupAnim.duration = 0.42;
    this.rackPickupAnim.fromRackIdx = fromRackIdx;
  }

  triggerCenterVesselArrivalAnim(type = 'bowl', hadExisting = false) {
    if (!hadExisting) {
      this.centerPlaceFromRight = 1.0;
      this.existingShiftProgress = 0;
    } else {
      this.centerPlaceFromRight = 0.75;
    }
    this.vesselBounce = 0.85;
  }

  triggerReturnHeldVesselAnim(type = 'bowl') {
    this.returnHeldAnim.active = true;
    this.returnHeldAnim.type = type;
    this.returnHeldAnim.timer = 0;
    this.returnHeldAnim.duration = 0.48;
    this.vesselBounce = 0.65;
  }

  triggerSwipeOldAndPlaceNewAnim(oldVessel, newType = 'bowl') {
    this.discardSwipeAnim.active = true;
    this.discardSwipeAnim.timer = 0;
    this.discardSwipeAnim.duration = 0.58;
    this.discardSwipeAnim.oldVessel = oldVessel;
    this.discardSwipeAnim.newType = newType;
    this.existingShiftProgress = 0;
    if (newType) {
      this.centerPlaceFromRight = 1.0;
    }
    this.vesselBounce = 0.95;
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = Math.max(260, rect.width || window.innerWidth);
    this.height = Math.max(360, rect.height || window.innerHeight);
    this.uiScale = Math.max(0.74, Math.min(1.38, Math.min(this.width / 390, this.height / 760)));

    const targetW = Math.floor(this.width * dpr);
    const targetH = Math.floor(this.height * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      if (this.gl) {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    const sauceCanvas = document.getElementById('sauce-gesture-canvas');
    if (sauceCanvas) {
      const sw = Math.floor(this.width);
      const sh = Math.floor(this.height);
      if (sauceCanvas.width !== sw || sauceCanvas.height !== sh) {
        sauceCanvas.width = sw;
        sauceCanvas.height = sh;
      }
    }
  }

  // =========================================================================
  // ШЕЙДЕРЫ (БЛИКИ SPECULAR + ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ТЯШУ, НОРИ, КЕРАМИКИ, БУЛЬОНА)
  // И ГЕНЕРАЦИЯ ВЫСОКОДЕТАЛИЗИРОВАННЫХ 3D-ПРИМИТИВОВ В ЕДИНОМ VBO
  // =========================================================================
  initShadersAndMeshes() {
    const gl = this.gl;

    const vsSource = `
      attribute vec3 aPos;
      attribute vec3 aNormal;
      uniform mat4 uMVP;
      uniform mat4 uModel;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      void main() {
        vec4 world = uModel * vec4(aPos, 1.0);
        vWorldPos = world.xyz;
        vLocalPos = aPos;
        vNormal = normalize(mat3(uModel) * aNormal);
        gl_Position = uMVP * vec4(aPos, 1.0);
      }
    `;

    // uPattern:
    // 0 = обычный гладкий или воксельный шейдинг
    // 1 = Свинина Тяшу (спиральные слои розового мяса, белой жировой прослойки и карамельной корочки)
    // 2 = Лист водорослей Нори (тёмно-изумрудная прессованная текстура в клеточку с отливом)
    // 3 = Керамическая раменная миска (золотисто-красный японский орнамент по ободку)
    // 4 = Живой бульон (круги жира и тепловая рябь на поверхности)
    // 5 = Металлическая сетка варочной корзины (ситечко)
    const fsSource = `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      uniform vec3 uColor;
      uniform float uEmissive;
      uniform float uSpecular;
      uniform float uPattern;
      uniform float uAlpha;
      uniform float uUseTex;
      uniform sampler2D uTex;
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform vec3 uLightPos1;
      uniform vec3 uLightColor1;
      uniform vec3 uLightPos2;
      uniform vec3 uLightColor2;
      uniform vec3 uFogColor;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 baseCol = uColor;
        float alpha = uAlpha;

        if (uUseTex > 0.5) {
          vec2 uv = vec2(vLocalPos.x + 0.5, 0.5 - vLocalPos.y);
          vec4 texCol = texture2D(uTex, uv);
          if (texCol.a < 0.08) discard;
          baseCol = texCol.rgb * uColor;
          alpha = texCol.a * uAlpha;
        } else if (uPattern > 0.5 && uPattern < 1.5) {
          // 1: Рулет свинины Тяшу (спираль мраморного жира + карамельная корочка по краю)
          float r = length(vLocalPos.xz) * 2.0;
          float ang = atan(vLocalPos.z, vLocalPos.x);
          float spiral = sin(r * 16.0 + ang * 2.0);
          vec3 crustCol = vec3(0.32, 0.12, 0.06);
          vec3 meatCol = vec3(0.84, 0.44, 0.42);
          vec3 fatCol = vec3(0.98, 0.92, 0.86);
          if (r > 0.84) {
            baseCol = crustCol;
          } else if (spiral > 0.28) {
            baseCol = mix(meatCol, fatCol, 0.78);
          } else {
            baseCol = meatCol;
          }
        } else if (uPattern > 1.5 && uPattern < 2.5) {
          // 2: Прессованный лист водорослей Нори (рельефная сетка и характерный тёмно-зелёный отлив)
          float gx = abs(sin(vLocalPos.x * 42.0));
          float gy = abs(sin(vLocalPos.y * 55.0));
          float grid = smoothstep(0.82, 0.98, max(gx, gy));
          baseCol = mix(vec3(0.04, 0.19, 0.11), vec3(0.09, 0.34, 0.20), grid * 0.65);
        } else if (uPattern > 2.5 && uPattern < 3.5) {
          // 3: Керамическая миска (красно-золотая кайма у верхнего края и глянцевая глазурь)
          if (vLocalPos.y > 0.84) {
            baseCol = vec3(0.0, 0.95, 0.83);
          } else if (vLocalPos.y > 0.68 && vLocalPos.y <= 0.84) {
            float wave = step(0.0, sin(atan(vLocalPos.z, vLocalPos.x) * 12.0));
            baseCol = mix(vec3(0.88, 0.16, 0.28), vec3(0.98, 0.78, 0.22), wave * 0.45);
          }
        } else if (uPattern > 3.5 && uPattern < 4.5) {
          // 4: Поверхность горячего бульона с каплями ароматного масла
          float r = length(vLocalPos.xz) * 2.0;
          float ripple = sin(r * 22.0 - uTime * 3.5) * 0.5 + 0.5;
          float oilDrop = smoothstep(0.62, 0.85, sin(vLocalPos.x * 26.0 + uTime) * cos(vLocalPos.z * 26.0 - uTime * 0.8));
          baseCol = mix(baseCol, baseCol * 1.28 + vec3(0.18, 0.12, 0.02), oilDrop * 0.55 + ripple * 0.12);
        } else if (uPattern > 4.5 && uPattern < 5.5) {
          // 5: Металлическая сетка корзины для варки лапши
          float wx = abs(sin(atan(vLocalPos.z, vLocalPos.x) * 18.0));
          float wy = abs(sin(vLocalPos.y * 34.0));
          float wire = max(smoothstep(0.7, 0.95, wx), smoothstep(0.7, 0.95, wy));
          baseCol = mix(baseCol * 0.45, baseCol * 1.25, wire);
        } else if (uPattern > 5.5 && uPattern < 6.5) {
          // 6: Прозрачное стекло витрины крио-холодильника с диагональными бликами и ледяным кантом
          float stripe1 = smoothstep(0.78, 0.95, sin((vLocalPos.z * 5.2 + vLocalPos.y * 4.0) * 3.14159));
          float stripe2 = smoothstep(0.86, 0.98, sin((vLocalPos.z * 2.6 + vLocalPos.y * 2.1 - 0.55) * 3.14159));
          float edge = smoothstep(0.41, 0.5, max(abs(vLocalPos.y), abs(vLocalPos.z)));
          baseCol = mix(baseCol, vec3(0.84, 0.97, 1.0), clamp(stripe1 * 0.45 + stripe2 * 0.35 + edge * 0.5, 0.0, 1.0));
          alpha = clamp(uAlpha + stripe1 * 0.13 + stripe2 * 0.09 + edge * 0.2, 0.0, 0.85);
        }

        vec3 Ldir = normalize(vec3(0.32, 0.9, 0.48));
        float diffDir = max(dot(N, Ldir), 0.0) * 0.54 + 0.36;

        vec3 L1 = uLightPos1 - vWorldPos;
        float dist1 = length(L1);
        vec3 L1n = normalize(L1);
        float att1 = 1.0 / (1.0 + 0.22 * dist1 + 0.08 * dist1 * dist1);
        float diff1 = max(dot(N, L1n), 0.0) * att1;

        vec3 L2 = uLightPos2 - vWorldPos;
        float dist2 = length(L2);
        vec3 L2n = normalize(L2);
        float att2 = 1.0 / (1.0 + 0.28 * dist2 + 0.1 * dist2 * dist2);
        float diff2 = max(dot(N, L2n), 0.0) * att2;

        // Глянцевый блик (Specular Blinn-Phong) для желтка яйца, бульона, керамики и металла
        vec3 H1 = normalize(L1n + V);
        vec3 Hdir = normalize(Ldir + V);
        float spec = (pow(max(dot(N, H1), 0.0), 28.0) * 0.9 + pow(max(dot(N, Hdir), 0.0), 24.0) * 0.65) * uSpecular;

        vec3 litColor = baseCol * diffDir
                      + baseCol * uLightColor1 * diff1 * 1.15
                      + baseCol * uLightColor2 * diff2 * 1.05
                      + baseCol * uEmissive
                      + vec3(1.0, 0.97, 0.92) * spec;

        if (uUseTex > 0.5) {
          litColor = mix(litColor, baseCol, clamp(uEmissive, 0.0, 1.0));
        }

        float depth = length(vWorldPos - uCamPos);
        float fogFactor = clamp((depth - 3.6) / 9.8, 0.0, 0.72);
        vec3 finalColor = mix(litColor, uFogColor, fogFactor * (1.0 - uEmissive * 0.8));

        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.program = prog;

    // Строим коллекцию 3D-примитивов в единый массив вершин [x, y, z, nx, ny, nz]
    const allFloats = [];
    const registerMesh = (name, floats) => {
      const first = allFloats.length / 6;
      for (let i = 0; i < floats.length; i++) allFloats.push(floats[i]);
      const count = floats.length / 6;
      this.meshes[name] = { first, count };
    };

    registerMesh('box', this.buildBoxGeometry());
    registerMesh('quad', [
      -0.5, -0.5, 0.0,  0, 0, 1,
       0.5, -0.5, 0.0,  0, 0, 1,
       0.5,  0.5, 0.0,  0, 0, 1,
      -0.5, -0.5, 0.0,  0, 0, 1,
       0.5,  0.5, 0.0,  0, 0, 1,
      -0.5,  0.5, 0.0,  0, 0, 1
    ]);
    registerMesh('cylinder', this.buildCylinderGeometry(24, 1.0, 1.0));
    registerMesh('cone', this.buildCylinderGeometry(20, 0.04, 1.0));
    registerMesh('hemisphere', this.buildHemisphereGeometry(20, 10));
    registerMesh('sphere', this.buildSphereGeometry(18, 12));
    registerMesh('torus', this.buildTorusGeometry(18, 10, 0.35, 0.15));
    registerMesh('bowl_lathe', this.buildHollowBowlGeometry(28));
    registerMesh('pot_lathe', this.buildHollowPotGeometry(24));
    registerMesh('wavy_noodle', this.buildWavyNoodleGeometry(26));

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(allFloats), gl.STATIC_DRAW);

    const stride = 6 * 4;
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNormal = gl.getAttribLocation(prog, 'aNormal');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 3 * 4);

    this.uMVP = gl.getUniformLocation(prog, 'uMVP');
    this.uModel = gl.getUniformLocation(prog, 'uModel');
    this.uColor = gl.getUniformLocation(prog, 'uColor');
    this.uEmissive = gl.getUniformLocation(prog, 'uEmissive');
    this.uSpecular = gl.getUniformLocation(prog, 'uSpecular');
    this.uPattern = gl.getUniformLocation(prog, 'uPattern');
    this.uAlpha = gl.getUniformLocation(prog, 'uAlpha');
    this.uUseTex = gl.getUniformLocation(prog, 'uUseTex');
    gl.uniform1f(this.uAlpha, 1.0);
    this.uTex = gl.getUniformLocation(prog, 'uTex');
    this.uTime = gl.getUniformLocation(prog, 'uTime');
    this.uCamPos = gl.getUniformLocation(prog, 'uCamPos');
    this.uLightPos1 = gl.getUniformLocation(prog, 'uLightPos1');
    this.uLightColor1 = gl.getUniformLocation(prog, 'uLightColor1');
    this.uLightPos2 = gl.getUniformLocation(prog, 'uLightPos2');
    this.uLightColor2 = gl.getUniformLocation(prog, 'uLightColor2');
    this.uFogColor = gl.getUniformLocation(prog, 'uFogColor');

    // Генерируем высокодетализированные текстуры переулка, вывесок кандзи и аниме-персонажа кодом
    this.texBackdrop = createAlleyBackdropTexture(gl);
    this.texFacade = createBuildingFacadeTexture(gl);
    this.texACUnit = createACUnitTexture(gl);
    this.texAsphalt = createWetAsphaltTexture(gl);
    this.texSigns = createKanjiSignTextures(gl);
    this.texPedestrians = createPedestrianTextures(gl);
    this.animeCustomerRenderer = new AnimeCustomerTextureRenderer(gl);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
  }

  // 1. Базовый куб
  buildBoxGeometry() {
    return [
      -0.5,-0.5, 0.5,  0,0,1,   0.5,-0.5, 0.5,  0,0,1,   0.5, 0.5, 0.5,  0,0,1,
      -0.5,-0.5, 0.5,  0,0,1,   0.5, 0.5, 0.5,  0,0,1,  -0.5, 0.5, 0.5,  0,0,1,
       0.5,-0.5,-0.5,  0,0,-1, -0.5,-0.5,-0.5,  0,0,-1, -0.5, 0.5,-0.5,  0,0,-1,
       0.5,-0.5,-0.5,  0,0,-1, -0.5, 0.5,-0.5,  0,0,-1,  0.5, 0.5,-0.5,  0,0,-1,
      -0.5, 0.5, 0.5,  0,1,0,   0.5, 0.5, 0.5,  0,1,0,   0.5, 0.5,-0.5,  0,1,0,
      -0.5, 0.5, 0.5,  0,1,0,   0.5, 0.5,-0.5,  0,1,0,  -0.5, 0.5,-0.5,  0,1,0,
      -0.5,-0.5,-0.5,  0,-1,0,  0.5,-0.5,-0.5,  0,-1,0,  0.5,-0.5, 0.5,  0,-1,0,
      -0.5,-0.5,-0.5,  0,-1,0,  0.5,-0.5, 0.5,  0,-1,0, -0.5,-0.5, 0.5,  0,-1,0,
       0.5,-0.5, 0.5,  1,0,0,   0.5,-0.5,-0.5,  1,0,0,   0.5, 0.5,-0.5,  1,0,0,
       0.5,-0.5, 0.5,  1,0,0,   0.5, 0.5,-0.5,  1,0,0,   0.5, 0.5, 0.5,  1,0,0,
      -0.5,-0.5,-0.5, -1,0,0,  -0.5,-0.5, 0.5, -1,0,0,  -0.5, 0.5, 0.5, -1,0,0,
      -0.5,-0.5,-0.5, -1,0,0,  -0.5, 0.5, 0.5, -1,0,0,  -0.5, 0.5,-0.5, -1,0,0
    ];
  }

  // 2. Гладкий цилиндр / усечённый конус (для ломтиков тяшу, бутылочки соуса, кастрюль, ручек)
  buildCylinderGeometry(segs = 24, topScale = 1.0, botScale = 1.0) {
    const out = [];
    const rTop = 0.5 * topScale;
    const rBot = 0.5 * botScale;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      // Боковая грань
      out.push(
        c0 * rBot, -0.5, s0 * rBot, c0, 0, s0,
        c1 * rBot, -0.5, s1 * rBot, c1, 0, s1,
        c1 * rTop,  0.5, s1 * rTop, c1, 0, s1,
        c0 * rBot, -0.5, s0 * rBot, c0, 0, s0,
        c1 * rTop,  0.5, s1 * rTop, c1, 0, s1,
        c0 * rTop,  0.5, s0 * rTop, c0, 0, s0
      );
      // Верхняя крышка
      out.push(
        0, 0.5, 0, 0, 1, 0,
        c1 * rTop, 0.5, s1 * rTop, 0, 1, 0,
        c0 * rTop, 0.5, s0 * rTop, 0, 1, 0
      );
      // Нижняя крышка
      out.push(
        0, -0.5, 0, 0, -1, 0,
        c0 * rBot, -0.5, s0 * rBot, 0, -1, 0,
        c1 * rBot, -0.5, s1 * rBot, 0, -1, 0
      );
    }
    return out;
  }

  // 3. Полусфера (y = 0..0.5, радиус 0.5) с плоским основанием — для половинки яйца и желтка!
  buildHemisphereGeometry(lonSegs = 20, latSegs = 10) {
    const out = [];
    for (let lat = 0; lat < latSegs; lat++) {
      const th0 = (lat / latSegs) * (Math.PI * 0.5);
      const th1 = ((lat + 1) / latSegs) * (Math.PI * 0.5);
      const y0 = Math.sin(th0) * 0.5, r0 = Math.cos(th0) * 0.5;
      const y1 = Math.sin(th1) * 0.5, r1 = Math.cos(th1) * 0.5;
      const ny0 = Math.sin(th0), nr0 = Math.cos(th0);
      const ny1 = Math.sin(th1), nr1 = Math.cos(th1);

      for (let lon = 0; lon < lonSegs; lon++) {
        const ph0 = (lon / lonSegs) * Math.PI * 2;
        const ph1 = ((lon + 1) / lonSegs) * Math.PI * 2;
        const c0 = Math.cos(ph0), s0 = Math.sin(ph0);
        const c1 = Math.cos(ph1), s1 = Math.sin(ph1);

        out.push(
          c0 * r0, y0, s0 * r0, c0 * nr0, ny0, s0 * nr0,
          c1 * r0, y0, s1 * r0, c1 * nr0, ny0, s1 * nr0,
          c1 * r1, y1, s1 * r1, c1 * nr1, ny1, s1 * nr1,
          c0 * r0, y0, s0 * r0, c0 * nr0, ny0, s0 * nr0,
          c1 * r1, y1, s1 * r1, c1 * nr1, ny1, s1 * nr1,
          c0 * r1, y1, s0 * r1, c0 * nr1, ny1, s0 * nr1
        );
      }
    }
    // Плоское донышко полусферы (срез яйца)
    for (let lon = 0; lon < lonSegs; lon++) {
      const ph0 = (lon / lonSegs) * Math.PI * 2;
      const ph1 = ((lon + 1) / lonSegs) * Math.PI * 2;
      out.push(
        0, 0, 0, 0, -1, 0,
        Math.cos(ph0) * 0.5, 0, Math.sin(ph0) * 0.5, 0, -1, 0,
        Math.cos(ph1) * 0.5, 0, Math.sin(ph1) * 0.5, 0, -1, 0
      );
    }
    return out;
  }

  // 4. Полная сфера (для сегментов креветки темпура, капель, глаз, декора)
  buildSphereGeometry(lonSegs = 18, latSegs = 12) {
    const out = [];
    for (let lat = 0; lat < latSegs; lat++) {
      const th0 = ((lat / latSegs) - 0.5) * Math.PI;
      const th1 = (((lat + 1) / latSegs) - 0.5) * Math.PI;
      const y0 = Math.sin(th0) * 0.5, r0 = Math.cos(th0) * 0.5;
      const y1 = Math.sin(th1) * 0.5, r1 = Math.cos(th1) * 0.5;
      const ny0 = Math.sin(th0), nr0 = Math.cos(th0);
      const ny1 = Math.sin(th1), nr1 = Math.cos(th1);

      for (let lon = 0; lon < lonSegs; lon++) {
        const ph0 = (lon / lonSegs) * Math.PI * 2;
        const ph1 = ((lon + 1) / lonSegs) * Math.PI * 2;
        const c0 = Math.cos(ph0), s0 = Math.sin(ph0);
        const c1 = Math.cos(ph1), s1 = Math.sin(ph1);

        out.push(
          c0 * r0, y0, s0 * r0, c0 * nr0, ny0, s0 * nr0,
          c1 * r0, y0, s1 * r0, c1 * nr0, ny0, s1 * nr0,
          c1 * r1, y1, s1 * r1, c1 * nr1, ny1, s1 * nr1,
          c0 * r0, y0, s0 * r0, c0 * nr0, ny0, s0 * nr0,
          c1 * r1, y1, s1 * r1, c1 * nr1, ny1, s1 * nr1,
          c0 * r1, y1, s0 * r1, c0 * nr1, ny1, s0 * nr1
        );
      }
    }
    return out;
  }

  // 5. Тор (3D-колечко) — для нарезанных колечек зелёного лука и ободков!
  buildTorusGeometry(mainSegs = 18, tubeSegs = 10, R = 0.35, r = 0.15) {
    const out = [];
    for (let i = 0; i < mainSegs; i++) {
      const u0 = (i / mainSegs) * Math.PI * 2;
      const u1 = ((i + 1) / mainSegs) * Math.PI * 2;
      const cu0 = Math.cos(u0), su0 = Math.sin(u0);
      const cu1 = Math.cos(u1), su1 = Math.sin(u1);

      for (let j = 0; j < tubeSegs; j++) {
        const v0 = (j / tubeSegs) * Math.PI * 2;
        const v1 = ((j + 1) / tubeSegs) * Math.PI * 2;
        const cv0 = Math.cos(v0), sv0 = Math.sin(v0);
        const cv1 = Math.cos(v1), sv1 = Math.sin(v1);

        const p00 = [(R + r * cv0) * cu0, r * sv0, (R + r * cv0) * su0, cv0 * cu0, sv0, cv0 * su0];
        const p10 = [(R + r * cv0) * cu1, r * sv0, (R + r * cv0) * su1, cv0 * cu1, sv0, cv0 * su1];
        const p11 = [(R + r * cv1) * cu1, r * sv1, (R + r * cv1) * su1, cv1 * cu1, sv1, cv1 * su1];
        const p01 = [(R + r * cv1) * cu0, r * sv1, (R + r * cv1) * su0, cv1 * cu0, sv1, cv1 * su0];

        out.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
    }
    return out;
  }

  // 6. Полая круглая 3D-миска для рамена (Lathe вращение профиля с реальной внутренней чашей!)
  buildHollowBowlGeometry(segs = 28) {
    // Профиль (r, y) от 0 до 1 по высоте: ножка -> внешняя стенка -> ободок -> внутренняя чаша -> дно
    const profile = [
      [0.0, 0.0, 0, -1],
      [0.46, 0.0, 0.4, -0.9],
      [0.46, 0.14, 0.9, -0.2],
      [0.76, 0.42, 0.85, -0.45],
      [0.96, 0.78, 0.92, -0.25],
      [1.0, 0.96, 0.7, 0.7],
      [0.91, 1.0, -0.3, 0.95],
      [0.84, 0.76, -0.9, 0.3],
      [0.64, 0.4, -0.82, 0.55],
      [0.42, 0.18, -0.3, 0.95],
      [0.0, 0.18, 0, 1]
    ];
    return this.buildLatheFromProfile(profile, segs);
  }

  // 7. Полый круглый 3D-чан для бульона (Lathe с утолщённым бортиком и глубоким нутром)
  buildHollowPotGeometry(segs = 24) {
    const profile = [
      [0.0, 0.0, 0, -1],
      [0.92, 0.0, 0.9, -0.3],
      [0.95, 0.88, 1.0, 0.0],
      [1.02, 0.95, 0.8, 0.6],
      [0.98, 1.0, 0.0, 1.0],
      [0.86, 0.96, -0.8, 0.5],
      [0.85, 0.12, -1.0, 0.1],
      [0.0, 0.12, 0, 1]
    ];
    return this.buildLatheFromProfile(profile, segs);
  }

  buildLatheFromProfile(profile, segs) {
    const out = [];
    for (let p = 0; p < profile.length - 1; p++) {
      const [r0, y0, nr0, ny0] = profile[p];
      const [r1, y1, nr1, ny1] = profile[p + 1];

      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);

        out.push(
          c0 * r0 * 0.5, y0, s0 * r0 * 0.5, c0 * nr0, ny0, s0 * nr0,
          c1 * r0 * 0.5, y0, s1 * r0 * 0.5, c1 * nr0, ny0, s1 * nr0,
          c1 * r1 * 0.5, y1, s1 * r1 * 0.5, c1 * nr1, ny1, s1 * nr1,
          c0 * r0 * 0.5, y0, s0 * r0 * 0.5, c0 * nr0, ny0, s0 * nr0,
          c1 * r1 * 0.5, y1, s1 * r1 * 0.5, c1 * nr1, ny1, s1 * nr1,
          c0 * r1 * 0.5, y1, s0 * r1 * 0.5, c0 * nr1, ny1, s0 * nr1
        );
      }
    }
    return out;
  }

  // 8. Волнистая 3D-нить раменной лапши (4.5 изгиба вдоль Z)
  buildWavyNoodleGeometry(steps = 26) {
    const out = [];
    const rx = 0.085;
    const ry = 0.28;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const z0 = -0.5 + t0;
      const z1 = -0.5 + t1;
      const x0 = Math.sin(t0 * Math.PI * 4.5) * 0.22;
      const x1 = Math.sin(t1 * Math.PI * 4.5) * 0.22;
      const y0 = Math.cos(t0 * Math.PI * 3.0) * 0.12;
      const y1 = Math.cos(t1 * Math.PI * 3.0) * 0.12;

      // Верхняя и боковые грани извилистой нити лапши
      out.push(
        x0 - rx, y0 + ry, z0, 0, 1, 0,
        x0 + rx, y0 + ry, z0, 0, 1, 0,
        x1 + rx, y1 + ry, z1, 0, 1, 0,
        x0 - rx, y0 + ry, z0, 0, 1, 0,
        x1 + rx, y1 + ry, z1, 0, 1, 0,
        x1 - rx, y1 + ry, z1, 0, 1, 0,

        x0 - rx, y0 - ry, z0, -1, 0.3, 0,
        x0 - rx, y0 + ry, z0, -1, 0.3, 0,
        x1 - rx, y1 + ry, z1, -1, 0.3, 0,
        x0 - rx, y0 - ry, z0, -1, 0.3, 0,
        x1 - rx, y1 + ry, z1, -1, 0.3, 0,
        x1 - rx, y1 - ry, z1, -1, 0.3, 0,

        x0 + rx, y0 + ry, z0, 1, 0.3, 0,
        x0 + rx, y0 - ry, z0, 1, 0.3, 0,
        x1 + rx, y1 - ry, z1, 1, 0.3, 0,
        x0 + rx, y0 + ry, z0, 1, 0.3, 0,
        x1 + rx, y1 - ry, z1, 1, 0.3, 0,
        x1 + rx, y1 + ry, z1, 1, 0.3, 0
      );
    }
    return out;
  }

  // Надёжная обработка свайпов и 3D-тапов на всём 3D-вьюпорте
  initDirect3DInput() {
    const viewport = document.getElementById('fp-3d-viewport') || this.canvas;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let isPointerDown = false;
    let gestureLookedUp = false;
    this.headPeeking = false;
    this.headReturnTimer = null;

    viewport.addEventListener('pointerdown', (e) => {
      if (gameState.runtime.sauceModeArmed) return;
      if (e.target.closest('button') || e.target.closest('[data-sector-zone]')) return;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      isPointerDown = true;
      gestureLookedUp = false;
      this._startedOnCustomer = gameState.runtime.cameraFocus === 'customer';
      this._startedUnderCounter = gameState.runtime.cameraFocus === 'under_counter';

      if (this.headReturnTimer) {
        clearTimeout(this.headReturnTimer);
        this.headReturnTimer = null;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!isPointerDown || gameState.runtime.sauceModeArmed) return;
      lastX = e.clientX;
      lastY = e.clientY;
      const dx = lastX - downX;
      const dy = lastY - downY;
      const lockHorizontal =
        gameState.runtime.activeSector === 1 &&
        gameState.runtime.cameraFocus === 'customer' &&
        Boolean(gameState.runtime.carryingAssembly);
      this.dragPanX = lockHorizontal ? 0 : Math.max(-0.28, Math.min(0.28, -dx * 0.0022));
      this.dragPanY = Math.max(-0.18, Math.min(0.18, dy * 0.0018));
    });

    const finishGesture = (endX, endY, isCancel = false) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      this.dragPanX = 0;
      this.dragPanY = 0;

      if (gameState.runtime.sauceModeArmed) return;

      const dx = endX - downX;
      const dy = endY - downY;
      const dist = Math.hypot(dx, dy);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      const clearHeadTimers = () => {
        this.headPeeking = false;
        if (this.headReturnTimer) {
          clearTimeout(this.headReturnTimer);
          this.headReturnTimer = null;
        }
      };

      const syncSectorHighlight = (secIdx) => {
        const shell = document.getElementById('app-shell');
        if (shell) shell.setAttribute('data-active-sector', String(secIdx));
        document.querySelectorAll('[data-sector-zone]').forEach((zone) => {
          const idx = Number(zone.getAttribute('data-sector-zone'));
          zone.classList.toggle('is-active', idx === secIdx);
        });
      };

      // 0. ДИАГОНАЛЬНЫЙ СВАЙП В ЕДИНОМ СТИЛЕ «ПРИТЯГИВАЕМ К СЕБЕ» (только явная диагональ ~30°..66°,
      // чтобы обычные свайпы влево/вправо с небольшим наклоном пальца не улетали случайно вверх в углы!):
      // - Со стола свайп в нижний левый угол (dx < 0, dy > 0) -> притягиваем к себе правый верхний угол (дрон, +1)!
      // - Со стола свайп в нижний правый угол (dx > 0, dy > 0) -> притягиваем к себе левый верхний угол (грязные миски, -1)!
      // - С верхнего ракурса свайп вверх по диагонали (dy < 0) -> притягиваем обратно к себе центральную столешницу!
      // - Из-под прилавка свайп вниз по диагонали (dy > 0) -> возвращаемся обратно на центральную столешницу!
      const isDiagonalGesture = dist > 28 && absY > 18 && absY > absX * 0.58 && absX > absY * 0.44;
      if (isDiagonalGesture) {
        if (gameState.runtime.activeSector === 1 && this._startedUnderCounter && dy > 0) {
          clearHeadTimers();
          gameState.runtime.cameraFocus = 'worktable';
          gameState.runtime.underCounterSide = 0;
          gameState.runtime.carryingAssembly = false;
          audio.playTapPop();
          return;
        }
        if (gameState.runtime.activeSector === 1 && !this._startedOnCustomer && !this._startedUnderCounter && dy > 0) {
          clearHeadTimers();
          gameState.runtime.cameraFocus = 'customer';
          gameState.runtime.customerPanSide = dx < 0 ? 1 : -1;
          gameState.runtime.carryingAssembly = false;
          audio.playTapPop();
          return;
        }
        if (gameState.runtime.activeSector === 1 && this._startedOnCustomer && dy < 0) {
          clearHeadTimers();
          gameState.runtime.cameraFocus = 'worktable';
          gameState.runtime.customerPanSide = 0;
          gameState.runtime.carryingAssembly = false;
          audio.playTapPop();
          return;
        }
        // От холодильника справа (Сектор 2) тянем к себе вниз (dy > 0) -> если открыт холодильник, закрываем его; иначе правый верхний угол (+1)!
        if (gameState.runtime.activeSector === 2 && dy > 0) {
          clearHeadTimers();
          if (gameState.runtime.fridgeOpen) {
            gameState.runtime.fridgeOpen = false;
            this.triggerFridgeDoorAnim('close');
            audio.playTapPop();
            return;
          }
          gameState.runtime.activeSector = 1;
          gameState.runtime.cameraFocus = 'customer';
          gameState.runtime.customerPanSide = 1;
          gameState.runtime.carryingAssembly = false;
          syncSectorHighlight(1);
          audio.playTapPop();
          return;
        }
        // От плиты слева (Сектор 0) тянем к себе вниз (dy > 0) -> левая верхняя полка с грязной посудой (-1)!
        if (gameState.runtime.activeSector === 0 && dy > 0) {
          clearHeadTimers();
          gameState.runtime.activeSector = 1;
          gameState.runtime.cameraFocus = 'customer';
          gameState.runtime.customerPanSide = -1;
          gameState.runtime.carryingAssembly = false;
          syncSectorHighlight(1);
          audio.playTapPop();
          return;
        }
      }

      // 1. ГОРИЗОНТАЛЬНЫЙ СВАЙП («притягиваем к себе»: широкий комфортный коридор влево/вправо!)
      if (dist > 22 && absX >= absY * 1.0) {
        if (this.callbacks.onSwipeSector) {
          this.callbacks.onSwipeSector(dx < 0 ? 1 : -1);
        }
        return;
      }

      // 2. ВЕРТИКАЛЬНЫЙ СВАЙП («притягиваем к себе», 3 уровня по вертикали в Секторе 1!):
      // - Верх (гость) <-- палец ВНИЗ (dy > 0) -- Центр (стол) -- палец ВВЕРХ (dy < 0) --> Низ (под прилавком: подносы/пакеты)
      if (dist > 26 && absY > absX * 1.12) {
        clearHeadTimers();

        // Из-под прилавка (подносы/пакеты): свайп ВНИЗ (dy > 0) -> возвращаемся на столешницу!
        if (dy > 0 && gameState.runtime.activeSector === 1 && this._startedUnderCounter) {
          gameState.runtime.cameraFocus = 'worktable';
          gameState.runtime.underCounterSide = 0;
          gameState.runtime.carryingAssembly = false;
          audio.playTapPop();
          return;
        }

        // С верхнего плана (гость / полки): свайп ВВЕРХ (dy < 0) -> возвращаемся на столешницу (поднос ставится обратно на стол!)
        if (dy < 0 && gameState.runtime.activeSector === 1 && this._startedOnCustomer) {
          gameState.runtime.cameraFocus = 'worktable';
          gameState.runtime.customerPanSide = 0;
          gameState.runtime.carryingAssembly = false;
          audio.playTapPop();
          return;
        }

        // Со стола (worktable): свайп ВВЕРХ (dy < 0) -> опускаемся ПОД ПРИЛАВОК к подносам!
        if (dy < 0 && gameState.runtime.activeSector === 1 && !this._startedOnCustomer && !this._startedUnderCounter) {
          gameState.runtime.cameraFocus = 'under_counter';
          gameState.runtime.underCounterSide = 0;
          gameState.runtime.carryingAssembly = false;
          audio.playTapPop();
          return;
        }

        // От холодильника справа (Сектор 2): свайп ВВЕРХ (dy < 0) -> закрываем холодильник (если открыт) и опускаемся ПОД ХОЛОДИЛЬНИК к пакетам!
        if (dy < 0 && gameState.runtime.activeSector === 2) {
          if (gameState.runtime.fridgeOpen) {
            gameState.runtime.fridgeOpen = false;
            this.triggerFridgeDoorAnim('close');
          }
          gameState.runtime.activeSector = 1;
          gameState.runtime.cameraFocus = 'under_counter';
          gameState.runtime.underCounterSide = 1;
          gameState.runtime.carryingAssembly = false;
          syncSectorHighlight(1);
          audio.playTapPop();
          return;
        }

        if (dy > 0 && gameState.runtime.activeSector === 2) {
          if (gameState.runtime.fridgeOpen) {
            gameState.runtime.fridgeOpen = false;
            this.triggerFridgeDoorAnim('close');
            audio.playTapPop();
            return;
          }
          gameState.runtime.activeSector = 1;
          gameState.runtime.cameraFocus = 'customer';
          gameState.runtime.customerPanSide = 1;
          gameState.runtime.carryingAssembly = false;
          syncSectorHighlight(1);
          audio.playTapPop();
          return;
        }

        if (dy > 0 && gameState.runtime.activeSector === 0) {
          gameState.runtime.activeSector = 1;
          gameState.runtime.cameraFocus = 'customer';
          gameState.runtime.customerPanSide = -1;
          gameState.runtime.carryingAssembly = false;
          syncSectorHighlight(1);
          audio.playTapPop();
          return;
        }

        // ТОЛЬКО при свайпе вверх на клиента С ОСНОВНОЙ СТОЛЕШНИЦЫ (worktable) поднимаем поднос/пакет,
        // если на нём что-то стоит И левая рука свободна (не держим тарелку или коробку)!
        if (dy > 0 && gameState.runtime.activeSector === 1 && !this._startedOnCustomer && !this._startedUnderCounter) {
          const a = gameState.runtime.assembly || {};
          const v = gameState.runtime.activeVessel;
          const hasHeldVessel = Boolean(v && v.type);
          const hasAssembled = Boolean((a.hasTray || a.hasBag) && (a.vessel || a.hasChopsticks || a.drink));
          gameState.runtime.cameraFocus = 'customer';
          gameState.runtime.customerPanSide = 0;
          gameState.runtime.carryingAssembly = !hasHeldVessel && hasAssembled;
          audio.playTapPop();
          return;
        }
        return;
      }

      if (isCancel) return;

      const hit = this.pick3DObjectAtScreen(endX, endY);
      if (hit && this.callbacks.onPickObject) {
        this.callbacks.onPickObject(hit);
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const sx = endX - rect.left;
      if (sx < 54 && this.callbacks.onSwipeSector) {
        this.callbacks.onSwipeSector(-1);
      } else if (sx > rect.width - 54 && this.callbacks.onSwipeSector) {
        this.callbacks.onSwipeSector(1);
      }
    };

    window.addEventListener('pointerup', (e) => finishGesture(e.clientX, e.clientY, false));
    window.addEventListener('pointercancel', () => finishGesture(lastX, lastY, true));
  }

  scheduleHeadReturnToTable(delayMs = 500) {
    if (this.headReturnTimer) {
      clearTimeout(this.headReturnTimer);
    }
    this.headReturnTimer = setTimeout(() => {
      this.headReturnTimer = null;
      this.headPeeking = false;
      if (!gameState.runtime.customerTalking) {
        gameState.runtime.cameraFocus = 'worktable';
        gameState.runtime.carryingAssembly = false;
      }
    }, delayMs);
  }

  pick3DObjectAtScreen(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    let bestId = null;
    let bestScore = Infinity;

    for (const box of this.interactables) {
      const pt = this.projectWorldToScreen(box.cx, box.cy, box.cz);
      if (!pt) continue;

      const d = Math.hypot(sx - pt.x, sy - pt.y);
      if (d <= box.screenRadius && d < bestScore) {
        bestScore = d;
        bestId = box.id;
      }
    }
    return bestId;
  }

  projectWorldToScreen(wx, wy, wz) {
    if (!this.vpMatrix) return null;
    const m = this.vpMatrix;
    const cx = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
    const cy = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
    const cw = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
    if (cw <= 0.1) return null;

    const ndcX = cx / cw;
    const ndcY = cy / cw;
    if (ndcX < -1.15 || ndcX > 1.15 || ndcY < -1.15 || ndcY > 1.15) return null;

    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1.0 - (ndcY * 0.5 + 0.5)) * this.height
    };
  }

  registerHitbox(id, cx, cy, cz, screenRadius = 56) {
    this.interactables.push({
      id,
      cx,
      cy,
      cz,
      screenRadius: screenRadius * (this.uiScale || 1.0)
    });
  }

  addHoloMarker() {
    // Плавающие 2D-плашки отключены: все 3D-объекты, миска и остатки в лотках
    // считываются напрямую через 3D-модели и неоновые 3D-индикаторы на бортиках.
  }

  updateAndDraw(dt) {
    this.time += dt;
    const gl = this.gl;
    if (!gl) return;

    const rt = gameState.runtime;
    const district = gameState.getCurrentDistrict();
    const tier = district.tier;

    // Отслеживаем изменения состава 3D-миски, чтобы запускать сочную анимацию наполнения
    const v = rt.activeVessel;
    const sig = `${v.type}|${v.broth || ''}|${v.noodleState || ''}|${v.toppings.join(',')}`;
    if (sig !== this.lastVesselSig) {
      this.lastVesselSig = sig;
      this.vesselBounce = 1.0;
    }
    if (this.vesselBounce > 0) {
      this.vesselBounce = Math.max(0, this.vesselBounce - dt * 4.2);
    }

    // Плавное появление/скрытие миски или вок-коробки в левой руке повара (всегда держим в левой руке во всех секторах!)
    const shouldHoldInLeft = Boolean(v && v.type);
    if (shouldHoldInLeft) {
      this.heldVesselAppear = Math.min(1, this.heldVesselAppear + dt * 6.5);
    } else {
      this.heldVesselAppear = Math.max(0, this.heldVesselAppear - dt * 8.0);
    }
    if (this.tablePlaceAnim > 0) {
      this.tablePlaceAnim = Math.max(0, this.tablePlaceAnim - dt * 3.6);
    }
    if (this.pourAnim.active) {
      this.pourAnim.timer += dt;
      if (this.pourAnim.timer >= this.pourAnim.duration) {
        this.pourAnim.active = false;
      }
    }

    // Таймеры анимаций взятия и возврата посуды справа, слотов стола, мусорки и доставки дрону
    if (this.rightGrabAnim.active) {
      this.rightGrabAnim.timer += dt;
      if (this.rightGrabAnim.timer >= this.rightGrabAnim.duration) {
        this.rightGrabAnim.active = false;
      }
    }
    if (this.rightReturnAnim.active) {
      this.rightReturnAnim.timer += dt;
      if (this.rightReturnAnim.timer >= this.rightReturnAnim.duration) {
        this.rightReturnAnim.active = false;
      }
    }
    if (this.slotAnim.active) {
      this.slotAnim.timer += dt;
      if (this.slotAnim.timer >= this.slotAnim.duration) {
        this.slotAnim.active = false;
      }
    }
    if (this.trashTossAnim.active) {
      this.trashTossAnim.timer += dt;
      if (this.trashTossAnim.timer >= this.trashTossAnim.duration) {
        this.trashTossAnim.active = false;
      }
    }
    if (this.droneDeliverAnim.active) {
      this.droneDeliverAnim.timer += dt;
      if (this.droneDeliverAnim.timer >= this.droneDeliverAnim.duration) {
        this.droneDeliverAnim.active = false;
      }
    }
    if (this.collectDirtyAnim.active) {
      this.collectDirtyAnim.timer += dt;
      if (this.collectDirtyAnim.timer >= this.collectDirtyAnim.duration) {
        this.collectDirtyAnim.active = false;
      }
    }
    if (this.sinkWashAnim.active) {
      this.sinkWashAnim.timer += dt;
      if (this.sinkWashAnim.timer >= this.sinkWashAnim.duration) {
        this.sinkWashAnim.active = false;
      }
    }
    if (this.rackPickupAnim.active) {
      this.rackPickupAnim.timer += dt;
      if (this.rackPickupAnim.timer >= this.rackPickupAnim.duration) {
        this.rackPickupAnim.active = false;
      }
    }
    if (this.sinkFaucetFlowTimer > 0) {
      this.sinkFaucetFlowTimer = Math.max(0, this.sinkFaucetFlowTimer - dt);
    }
    if (this.handPourAnim.active) {
      this.handPourAnim.timer += dt;
      if (this.handPourAnim.timer >= this.handPourAnim.duration) {
        this.handPourAnim.active = false;
      }
    }
    if (this.toppingAnim.active) {
      this.toppingAnim.timer += dt;
      if (this.toppingAnim.timer >= this.toppingAnim.duration) {
        this.toppingAnim.active = false;
      }
    }
    if (this.trayPlaceAnim.active) {
      this.trayPlaceAnim.timer += dt;
      if (this.trayPlaceAnim.timer >= this.trayPlaceAnim.duration) {
        this.trayPlaceAnim.active = false;
      }
    }
    if (this.bagPackAnim.active) {
      this.bagPackAnim.timer += dt;
      if (this.bagPackAnim.timer >= this.bagPackAnim.duration) {
        this.bagPackAnim.active = false;
      }
    }
    if (this.assemblyVesselAnim.active) {
      this.assemblyVesselAnim.timer += dt;
      if (this.assemblyVesselAnim.timer >= this.assemblyVesselAnim.duration) {
        this.assemblyVesselAnim.active = false;
      }
    }
    if (this.chopsticksPlaceAnim.active) {
      this.chopsticksPlaceAnim.timer += dt;
      if (this.chopsticksPlaceAnim.timer >= this.chopsticksPlaceAnim.duration) {
        this.chopsticksPlaceAnim.active = false;
      }
    }
    if (this.drinkPlaceAnim.active) {
      this.drinkPlaceAnim.timer += dt;
      if (this.drinkPlaceAnim.timer >= this.drinkPlaceAnim.duration) {
        this.drinkPlaceAnim.active = false;
      }
    }
    const targetDoorT = rt.fridgeOpen ? 1.0 : 0.0;
    if (this.fridgeDoorOpenT < targetDoorT) {
      this.fridgeDoorOpenT = Math.min(targetDoorT, this.fridgeDoorOpenT + dt * 2.5);
    } else if (this.fridgeDoorOpenT > targetDoorT) {
      this.fridgeDoorOpenT = Math.max(targetDoorT, this.fridgeDoorOpenT - dt * 2.8);
    }
    if (this.fridgeDoorHandAnim.active) {
      this.fridgeDoorHandAnim.timer += dt;
      if (this.fridgeDoorHandAnim.timer >= this.fridgeDoorHandAnim.duration) {
        this.fridgeDoorHandAnim.active = false;
      }
    }
    if (this.fridgeRestockAnim.active) {
      this.fridgeRestockAnim.timer += dt;
      if (this.fridgeRestockAnim.timer >= this.fridgeRestockAnim.duration) {
        this.fridgeRestockAnim.active = false;
      }
    }
    if (this.servePushAnim.active) {
      this.servePushAnim.timer += dt;
      if (this.servePushAnim.timer >= this.servePushAnim.duration) {
        this.servePushAnim.active = false;
      }
    }
    if (this.centerPlaceFromRight > 0) {
      this.centerPlaceFromRight = Math.max(0, this.centerPlaceFromRight - dt * 2.8);
    }
    if (rt.pendingVesselChoice) {
      this.existingShiftProgress = Math.min(1, this.existingShiftProgress + dt * 5.0);
    } else {
      this.existingShiftProgress = Math.max(0, this.existingShiftProgress - dt * 5.0);
    }
    if (this.returnHeldAnim.active) {
      this.returnHeldAnim.timer += dt;
      if (this.returnHeldAnim.timer >= this.returnHeldAnim.duration) {
        this.returnHeldAnim.active = false;
      }
    }
    if (this.discardSwipeAnim.active) {
      this.discardSwipeAnim.timer += dt;
      if (this.discardSwipeAnim.timer >= this.discardSwipeAnim.duration) {
        this.discardSwipeAnim.active = false;
      }
    }

    // Выбираем кинематографичный ракурс камеры:
    // - Сектор -1 (Мойка посуды левее варочной плиты)
    // - Сектор 0 (слева: варочная плита и бульоны)
    // - Сектор 2 (справа: склад, чистые миски, коробки, холодильник и дрон)
    // - Сектор 1:
    //   * cameraFocus === 'customer': верхний ракурс на гостя (с возможностью покрутиться чуть влево -1 и чуть вправо +1 на полки с грязными мисками!)
    //   * cameraFocus === 'worktable': крупный план рабочего стола
    if (rt.activeSector === -1) {
      this.camPosTarget = [-0.1, 1.68, 0.26];
      this.lookAtTarget = [-0.88, 0.84 + this.dragPanY * 0.4, 0.72 + this.dragPanX];
    } else if (rt.activeSector === 0) {
      this.camPosTarget = [-0.04, 1.68, 0.46];
      this.lookAtTarget = [-0.86, 0.98 + this.dragPanY * 0.6, -0.16 + this.dragPanX];
    } else if (rt.activeSector === 2) {
      if (rt.fridgeOpen) {
        // Приподнятый средний план внутрь открытого Крио-Холодильника — смотрим чуть сверху на все 3 полки и контейнеры!
        this.camPosTarget = [0.1, 1.52, 0.25];
        this.lookAtTarget = [0.88, 1.19 + this.dragPanY * 0.25, 0.27 - this.dragPanX * 0.25];
      } else {
        this.camPosTarget = [0.05, 1.66, 0.45];
        this.lookAtTarget = [0.88, 0.98 + this.dragPanY * 0.6, -0.1 - this.dragPanX];
      }
    } else if (rt.cameraFocus === 'customer') {
      const panSide = rt.customerPanSide || 0;
      const dims = this.getCustomerDimensions(rt.currentCustomer);
      const lookY = rt.currentCustomer ? dims.y + dims.h * 0.06 : 1.32;
      if (panSide === -1) {
        // Взгляд влево — на левую деревянную полочку с грязными мисками (слева от котика!)
        this.camPosTarget = [-0.08, 1.48, 0.04];
        this.lookAtTarget = [-0.66 + this.dragPanX * 0.4, 1.15 + this.dragPanY * 0.6, -1.06];
      } else if (panSide === 1) {
        // Взгляд вправо — на парящего за прилавком дрона-курьера справа от посетителей!
        this.camPosTarget = [0.08, 1.48, 0.04];
        this.lookAtTarget = [0.72 + this.dragPanX * 0.4, 1.34 + this.dragPanY * 0.6, -1.26];
      } else {
        this.camPosTarget = [0.02, 1.46, 0.02];
        this.lookAtTarget = [0.05 + this.dragPanX * 0.4, lookY + this.dragPanY * 0.6, -1.24];
      }
    } else if (rt.cameraFocus === 'under_counter') {
      const underSide = rt.underCounterSide || 0;
      if (underSide === 1) {
        // Лёгкий наклон направо — заглядываем ПОД ХОЛОДИЛЬНИК к пакетам для заказов с собой!
        this.camPosTarget = [-0.08, 1.06, 0.27];
        this.lookAtTarget = [0.78, 0.48 + this.dragPanY * 0.35, 0.27 - this.dragPanX * 0.35];
      } else {
        // Лёгкий наклон под передний прилавок — заглядываем на полку со стопкой больших подносов!
        this.camPosTarget = [0.0, 1.06, 0.58];
        this.lookAtTarget = [0.0 + this.dragPanX * 0.35, 0.46 + this.dragPanY * 0.35, -0.38];
      }
    } else {
      this.camPosTarget = [0.0, 1.78, 0.26];
      this.lookAtTarget = [0.0 + this.dragPanX, 0.92 + this.dragPanY * 0.75, -0.52];
    }

    const lerp = Math.min(1, dt * 6.5);
    for (let i = 0; i < 3; i++) {
      this.camPos[i] += (this.camPosTarget[i] - this.camPos[i]) * lerp;
      this.lookAtCurrent[i] += (this.lookAtTarget[i] - this.lookAtCurrent[i]) * lerp;
    }

    // Атмосферная бирюзово-синяя дымка ночного дождливого переулка (как на референс-арте)
    const fogColors = {
      1: [0.09, 0.17, 0.23],
      2: [0.11, 0.14, 0.25],
      3: [0.06, 0.19, 0.26]
    };
    const fog = fogColors[tier] || fogColors[1];
    gl.clearColor(fog[0], fog[1], fog[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.width / this.height;
    // Адаптивный угол обзора (Hor+ FOV) под пропорции конкретного девайса:
    // На узких и высоких экранах смартфонов (iPhone / Android 19.5:9 и 20:9) автоматически расширяем вертикальный FOV,
    // чтобы по горизонтали всегда целиком помещались все 3 кастрюли, все 6 лотков и холодильник со стойками посуды!
    const baseTanY = Math.tan((68 * Math.PI) / 360);
    const minHorizTan = baseTanY * 0.64;
    const tanHalfFovY =
      aspect < 0.64 ? minHorizTan / Math.max(0.36, aspect) : baseTanY;
    const adaptiveFovY = 2 * Math.atan(tanHalfFovY);
    this.currentTanHalfFovY = tanHalfFovY;
    this.currentAspect = aspect;

    const proj = this.mat4Perspective(adaptiveFovY, aspect, 0.1, 30.0);
    const view = this.mat4LookAt(this.camPos, this.lookAtCurrent, [0, 1, 0]);
    this.vpMatrix = this.mat4Multiply(proj, view);

    gl.uniform3fv(this.uFogColor, fog);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform3fv(this.uCamPos, this.camPos);

    const flicker =
      tier === 1 && !gameState.hasUpgrade('neon_sign')
        ? 0.92 + Math.sin(this.time * 21) * 0.05
        : 1.15;
    const light1Color =
      tier === 1
        ? [1.0 * flicker, 0.78 * flicker, 0.46 * flicker]
        : tier === 2
          ? [1.0, 0.38, 0.75]
          : [0.25, 0.98, 0.92];

    gl.uniform3fv(this.uLightPos1, [0.0, 2.25, 0.15]);
    gl.uniform3fv(this.uLightColor1, light1Color);
    gl.uniform3fv(this.uLightPos2, [0.0, 1.65, -1.7]);
    gl.uniform3fv(this.uLightColor2, [0.1, 0.88, 1.0]);

    this.interactables.length = 0;
    this.holoMarkers.length = 0;

    this.drawStreetAndCity3D(tier);
    this.drawYataiInterior3D(tier);
    this.drawUnderCounterStorage3D();
    this.drawCenterCounter3D();
    this.drawLeftBoilerStation3D();
    this.drawLeftSinkStation3D();
    this.drawRightFridgeAndSealer3D();
    this.drawCustomerAndCourier3D();
    this.drawParticles3D(dt);
    this.drawHeldVesselInLeftHand3D();
    this.drawDrinkPlaceAnim3D();
    this.drawCarriedAssemblyToCustomer3D();
    this.drawFirstPersonHands3D(dt);

    this.syncHoloLabelsDOM();
  }

  syncHoloLabelsDOM() {
    if (!this.holoLayer) return;
    const activeIds = new Set();

    for (const m of this.holoMarkers) {
      const pt = this.projectWorldToScreen(m.wx, m.wy, m.wz);
      if (!pt) continue;

      activeIds.add(m.id);
      let el = this.holoNodes.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'holo-tag';
        this.holoLayer.appendChild(el);
        this.holoNodes.set(m.id, el);
      }

      el.className = `holo-tag ${m.variant || ''}`.trim();
      el.style.setProperty('--hx', `${pt.x.toFixed(1)}px`);
      el.style.setProperty('--hy', `${pt.y.toFixed(1)}px`);

      const html = m.sub ? `${m.title}<small>${m.sub}</small>` : m.title;
      if (el._lastHtml !== html) {
        el.innerHTML = html;
        el._lastHtml = html;
      }
    }

    for (const [id, el] of this.holoNodes.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.holoNodes.delete(id);
      }
    }
  }

  // =========================================================================
  // ВЫСОКОДЕТАЛИЗИРОВАННЫЕ 3D-МОДЕЛИ ИНГРЕДИЕНТОВ (ДЛЯ ЛОТКОВ И ДЛЯ МИСКИ)
  // =========================================================================

  // 1. 3D-половинка маринованного яйца Аджитама (коричневатый белок, белый срез, выпуклый оранжевый желток)
  draw3DAjitamaEggHalf(x, y, z, scale = 1.0, rotY = 0) {
    // Внешняя соево-маринованная скорлупа белка (перевёрнутая полусфера, вытянутая в овал)
    this.drawMesh(
      'hemisphere',
      x,
      y + 0.018 * scale,
      z,
      0.088 * scale,
      0.036 * scale,
      0.068 * scale,
      [0.76, 0.56, 0.38],
      0.1,
      [Math.PI, rotY, 0],
      0.35,
      0
    );
    // Белоснежный овальный срез белка сверху
    this.drawMesh(
      'cylinder',
      x,
      y + 0.019 * scale,
      z,
      0.084 * scale,
      0.006 * scale,
      0.064 * scale,
      [0.98, 0.96, 0.91],
      0.18,
      [0, rotY, 0],
      0.45,
      0
    );
    // Глянцевый полужидкий ярко-оранжевый желток (выпуклая полусфера с мощным бликом Specular!)
    this.drawMesh(
      'hemisphere',
      x,
      y + 0.021 * scale,
      z,
      0.046 * scale,
      0.022 * scale,
      0.042 * scale,
      [1.0, 0.45, 0.02],
      0.42,
      [0, rotY, 0],
      0.95,
      0
    );
  }

  // 2. 3D-ломтик рулета свинины Тяшу (круглый медальон с процедурной спиралью жира и корочкой uPattern=1)
  draw3DChashuSlice(x, y, z, scale = 1.0, rot = [0.22, 0, -0.18]) {
    this.drawMesh(
      'cylinder',
      x,
      y,
      z,
      0.105 * scale,
      0.016 * scale,
      0.095 * scale,
      [0.85, 0.42, 0.4],
      0.18,
      rot,
      0.55,
      1
    );
  }

  // 3. 3D-лист прессованных водорослей Нори (с клетчатым рельефом uPattern=2 и изумрудным отливом)
  draw3DNoriSheet(x, y, z, scale = 1.0, rot = [-0.28, 0.15, 0]) {
    this.drawMesh(
      'box',
      x,
      y,
      z,
      0.082 * scale,
      0.115 * scale,
      0.006 * scale,
      [0.05, 0.24, 0.14],
      0.15,
      rot,
      0.45,
      2
    );
  }

  // 4. 3D-колечко нарезанного зелёного лука (настоящий полый тор!)
  draw3DScallionRing(x, y, z, scale = 1.0, rot = [0.1, 0.3, -0.1]) {
    this.drawMesh(
      'torus',
      x,
      y,
      z,
      0.036 * scale,
      0.028 * scale,
      0.036 * scale,
      [0.08, 0.92, 0.38],
      0.35,
      rot,
      0.3,
      0
    );
  }

  // 5. 3D-креветка Темпура (изогнутое тело в воздушной золотистой панировке + красный раздвоенный хвостик)
  draw3DTempuraShrimp(x, y, z, scale = 1.0, yaw = 0) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const segs = [
      { ox: -0.038, oy: 0.004, r: 0.036 },
      { ox: -0.012, oy: 0.014, r: 0.034 },
      { ox: 0.014, oy: 0.018, r: 0.029 },
      { ox: 0.036, oy: 0.024, r: 0.023 }
    ];
    for (const s of segs) {
      const wx = x + (s.ox * cy) * scale;
      const wz = z + (s.ox * sy) * scale;
      this.drawMesh(
        'sphere',
        wx,
        y + s.oy * scale,
        wz,
        s.r * scale,
        s.r * 0.85 * scale,
        s.r * 0.9 * scale,
        [0.98, 0.74, 0.26],
        0.22,
        [0, yaw, 0],
        0.35,
        0
      );
    }
    // Ярко-красный хвостик креветки веером вверх
    const tx = x + 0.056 * cy * scale;
    const tz = z + 0.056 * sy * scale;
    this.drawMesh(
      'cone',
      tx,
      y + 0.036 * scale,
      tz,
      0.026 * scale,
      0.038 * scale,
      0.016 * scale,
      [0.98, 0.18, 0.22],
      0.45,
      [0, yaw, -0.65],
      0.6,
      0
    );
  }

  // 6. 3D Картонная коробочка для Вока / Доставки (с 4 откинутыми клапанами крышки в открытом виде и сложенными в запечатанном!)
  draw3DWokBox(vx, vy, vz, s = 1.0, isSealed = false) {
    const cardCol = [0.95, 0.91, 0.84];       // Плотный светло-кремовый вощёный картон вок-коробочки
    const innerCol = [0.89, 0.84, 0.75];      // Внутренняя сторона картона
    const redStripe = [0.9, 0.16, 0.25];      // Фирменная красная полоса раменной на стенках коробочки
    const cyanAccent = [0.0, 0.92, 0.82];     // Неоновый штамп доставки CyberEats

    // 1) Квадратное вощёное дно вок-коробочки (узкое снизу, стенки расширяются кверху трапецией!)
    this.drawBox(vx, vy + 0.012 * s, vz, 0.23 * s, 0.018 * s, 0.21 * s, innerCol, 0.08, null, 0.35);

    // 2) 4 расширяющиеся кверху наклонные картонные стенки высокой вок-коробочки (высота 0.155 * s)
    const wallY = vy + 0.086 * s;
    const tilt = 0.22; // наклон стенок наружу (~12.5 градусов), создающий классическую форму трапеции Вока!

    // Задняя и передняя стенки (с красной графикой и бирюзовым логотипом)
    this.drawBox(vx, wallY, vz - 0.112 * s, 0.265 * s, 0.152 * s, 0.014 * s, cardCol, 0.12, [-tilt, 0, 0], 0.4);
    this.drawBox(vx, wallY + 0.01 * s, vz - 0.12 * s, 0.255 * s, 0.036 * s, 0.008 * s, redStripe, 0.35, [-tilt, 0, 0], 0.5);
    this.drawBox(vx, wallY - 0.022 * s, vz - 0.118 * s, 0.14 * s, 0.012 * s, 0.008 * s, cyanAccent, 0.75, [-tilt, 0, 0]);

    this.drawBox(vx, wallY, vz + 0.112 * s, 0.265 * s, 0.152 * s, 0.014 * s, cardCol, 0.12, [tilt, 0, 0], 0.4);
    this.drawBox(vx, wallY + 0.01 * s, vz + 0.12 * s, 0.255 * s, 0.036 * s, 0.008 * s, redStripe, 0.35, [tilt, 0, 0], 0.5);
    this.drawBox(vx, wallY - 0.022 * s, vz + 0.118 * s, 0.14 * s, 0.012 * s, 0.008 * s, cyanAccent, 0.75, [tilt, 0, 0]);

    // Левая и правая боковые стенки с диагональными оригами-складками и металлическими ушками проволочной ручки
    this.drawBox(vx - 0.122 * s, wallY, vz, 0.014 * s, 0.152 * s, 0.245 * s, cardCol, 0.1, [0, 0, tilt], 0.4);
    this.drawBox(vx + 0.122 * s, wallY, vz, 0.014 * s, 0.152 * s, 0.245 * s, cardCol, 0.1, [0, 0, -tilt], 0.4);
    // Диагональные рёбра-складки на боках вок-коробки
    this.drawBox(vx - 0.13 * s, wallY, vz, 0.008 * s, 0.148 * s, 0.012 * s, [0.82, 0.76, 0.68], 0.06, [0.35, 0, tilt]);
    this.drawBox(vx + 0.13 * s, wallY, vz, 0.008 * s, 0.148 * s, 0.012 * s, [0.82, 0.76, 0.68], 0.06, [-0.35, 0, -tilt]);

    // Металлические люверсы-заклёпки и тонкая проволочная ручка сбоку
    this.drawMesh('cylinder', vx - 0.138 * s, vy + 0.135 * s, vz, 0.022 * s, 0.012 * s, 0.022 * s, [0.75, 0.8, 0.88], 0.2, [0, 0, Math.PI * 0.5], 0.95);
    this.drawMesh('cylinder', vx + 0.138 * s, vy + 0.135 * s, vz, 0.022 * s, 0.012 * s, 0.022 * s, [0.75, 0.8, 0.88], 0.2, [0, 0, Math.PI * 0.5], 0.95);

    // 3) 4 КАРТОННЫХ КЛАПАНА КРЫШКИ СВЕРХУ:
    // - Когда коробочка ОТКРЫТА (!isSealed) -> все 4 лепестка откинуты в стороны наружу, открывая горловину для бульона и лапши!
    // - При передаче дрону-курьеру (sealProgress 0..1) -> лепестки плавно складываются внутрь и запечатываются неоновой пломбой!
    const rimY = vy + 0.16 * s;
    const sealProg = typeof isSealed === 'number' ? isSealed : isSealed ? 1.0 : 0.0;
    if (sealProg < 0.85) {
      const foldT = Math.min(1, sealProg / 0.85);
      const openAng = 0.88 * (1 - foldT) - 0.12 * foldT;
      const spreadZ = (0.168 * (1 - foldT) + 0.065 * foldT) * s;
      const spreadX = (0.178 * (1 - foldT) + 0.072 * foldT) * s;
      const flapY = rimY + (0.028 * (1 - foldT) + 0.01 * foldT) * s;

      // Задний и передний клапаны с замочным язычком
      this.drawBox(vx, flapY, vz - spreadZ, 0.275 * s, 0.088 * s, 0.01 * s, cardCol, 0.14, [-openAng, 0, 0], 0.4);
      this.drawBox(vx, flapY + 0.02 * (1 - foldT) * s, vz - spreadZ - 0.025 * (1 - foldT) * s, 0.11 * s, 0.032 * s, 0.01 * s, redStripe, 0.3, [-openAng, 0, 0]);

      this.drawBox(vx, flapY, vz + spreadZ, 0.275 * s, 0.088 * s, 0.01 * s, cardCol, 0.14, [openAng, 0, 0], 0.4);
      this.drawBox(vx, flapY + 0.02 * (1 - foldT) * s, vz + spreadZ + 0.025 * (1 - foldT) * s, 0.11 * s, 0.032 * s, 0.01 * s, redStripe, 0.3, [openAng, 0, 0]);

      // Левый и правый боковые клапаны-ушки
      this.drawBox(vx - spreadX, flapY - 0.004 * s, vz, 0.01 * s, 0.078 * s, 0.25 * s, innerCol, 0.12, [0, 0, openAng], 0.35);
      this.drawBox(vx + spreadX, flapY - 0.004 * s, vz, 0.01 * s, 0.078 * s, 0.25 * s, innerCol, 0.12, [0, 0, -openAng], 0.35);
    } else {
      // Сложенные внутрь и запечатанные клапаны вок-коробки + неоновая термо-пломба и поднятая проволочная дужка
      this.drawBox(vx - 0.065 * s, rimY + 0.004 * s, vz, 0.14 * s, 0.012 * s, 0.25 * s, innerCol, 0.1, [0, 0, -0.08]);
      this.drawBox(vx + 0.065 * s, rimY + 0.004 * s, vz, 0.14 * s, 0.012 * s, 0.25 * s, innerCol, 0.1, [0, 0, 0.08]);
      this.drawBox(vx, rimY + 0.012 * s, vz - 0.055 * s, 0.27 * s, 0.012 * s, 0.15 * s, cardCol, 0.14, [0.08, 0, 0]);
      this.drawBox(vx, rimY + 0.016 * s, vz + 0.055 * s, 0.27 * s, 0.012 * s, 0.15 * s, cardCol, 0.14, [-0.08, 0, 0]);
      // Защёлкнутый язычок и светящаяся пломба-стикер CYBER-EATS поверх закрытых клапанов
      this.drawBox(vx, rimY + 0.024 * s, vz, 0.22 * s, 0.01 * s, 0.065 * s, [0.06, 0.96, 0.42], 0.92, null, 0.9);
      // Поднятая стальная проволочная ручка-дужка над запечатанной коробочкой
      this.drawBox(vx - 0.138 * s, rimY + 0.045 * s, vz, 0.008 * s, 0.09 * s, 0.008 * s, [0.78, 0.84, 0.92], 0.2, null, 0.95);
      this.drawBox(vx + 0.138 * s, rimY + 0.045 * s, vz, 0.008 * s, 0.09 * s, 0.008 * s, [0.78, 0.84, 0.92], 0.2, null, 0.95);
      this.drawBox(vx, rimY + 0.088 * s, vz, 0.28 * s, 0.008 * s, 0.01 * s, [0.78, 0.84, 0.92], 0.25, null, 0.95);
    }
  }

  // =========================================================================
  // НАПОЛНЯЕМАЯ 3D-МИСКА ИЛИ ОТКРЫТАЯ КАРТОННАЯ КОРОБОЧКА ДЛЯ ВОКА (ОТОБРАЖАЕТ ВСЁ, ЧТО МЫ ПОЛОЖИЛИ!)
  // =========================================================================
  drawFilledVessel3D(vx, vy, vz, vessel, scale = 1.0, isSealed = false) {
    const bounceScale = 1.0 + Math.sin(this.vesselBounce * Math.PI) * 0.06;
    const s = scale * bounceScale;
    const isWokBox = vessel.type === 'box';
    const sealProg = typeof isSealed === 'number' ? isSealed : isSealed ? 1.0 : 0.0;

    // 1. КОРПУС 3D-ПОСУДЫ: Полая круглая керамическая раменная миска (Lathe) ИЛИ картонная Вок-коробочка с откинутыми клапанами
    if (!isWokBox) {
      // Настоящая круглая глубокая миска с орнаментом по ободку (uPattern=3)
      this.drawMesh(
        'bowl_lathe',
        vx,
        vy,
        vz,
        0.42 * s,
        0.165 * s,
        0.42 * s,
        [0.14, 0.09, 0.22],
        0.08,
        null,
        0.75,
        3
      );
    } else {
      this.draw3DWokBox(vx, vy, vz, s, sealProg);
      if (sealProg >= 0.85) return;
    }

    // Если навалили через край (vessel.overflowCount > 0) — рисуем подтёки и капли бульона через бортик!
    if ((vessel.overflowCount || 0) > 0) {
      const dripCol = vessel.broth === 'chili_broth' ? [0.95, 0.22, 0.18] : [0.92, 0.72, 0.42];
      for (let d = 0; d < 4; d++) {
        const da = d * 1.57 + 0.4;
        const dr = (isWokBox ? 0.135 : 0.195) * s;
        this.drawMesh(
          'sphere',
          vx + Math.cos(da) * dr,
          vy + 0.11 * s,
          vz + Math.sin(da) * dr,
          0.024 * s,
          0.048 * s,
          0.024 * s,
          dripCol,
          0.55
        );
      }
    }

    // Базовый уровень наполнения внутри миски или открытой вок-коробочки (поднимается по мере добавления бульона и лапши!)
    const hasBroth = Boolean(vessel.broth);
    const hasNoodles = Boolean(vessel.noodleState);
    const fillBaseY =
      vy +
      (isWokBox
        ? hasBroth && hasNoodles
          ? 0.132
          : hasBroth || hasNoodles
            ? 0.105
            : 0.068
        : hasBroth && hasNoodles
          ? 0.112
          : hasBroth || hasNoodles
            ? 0.092
            : 0.065) *
        s;
    const innerScale = isWokBox ? s * 0.74 : s;

    // 2. СЛОЙ БУЛЬОНА (наполняет чашу миски или открытую вок-коробочку изнутри и переливается каплями масла uPattern=4)
    if (hasBroth) {
      const bMap = {
        tonkotsu: [0.92, 0.74, 0.46],
        chili_broth: [0.95, 0.22, 0.18],
        miso_mushroom: [0.64, 0.18, 0.92]
      };
      const bCol = bMap[vessel.broth] || bMap.tonkotsu;
      if (!isWokBox) {
        this.drawMesh(
          'cylinder',
          vx,
          fillBaseY - 0.012 * s,
          vz,
          0.345 * s,
          0.036 * s,
          0.345 * s,
          bCol,
          0.35,
          null,
          0.9,
          4
        );
      } else {
        this.drawMesh(
          'box',
          vx,
          fillBaseY - 0.014 * s,
          vz,
          0.235 * s,
          0.042 * s,
          0.215 * s,
          bCol,
          0.38,
          null,
          0.9,
          4
        );
      }
    }

    // 3. СЛОЙ ВОЛНИСТОЙ 3D-ЛАПШИ (густое переплетённое гнездо из 12 извилистых нитей wavy_noodle)
    if (hasNoodles) {
      const nCol =
        vessel.noodleState === 'aldente'
          ? [1.0, 0.84, 0.28]
          : vessel.noodleState === 'under'
            ? [0.98, 0.94, 0.72]
            : [0.68, 0.48, 0.3];

      const noodleY = fillBaseY + 0.008 * innerScale;
      // Укладываем волнистые нити в 2 перекрещивающихся слоя внутри миски или вок-коробочки
      for (let i = -3; i <= 3; i++) {
        const span = (1.0 - Math.abs(i) * 0.11) * 0.26 * innerScale;
        this.drawMesh(
          'wavy_noodle',
          vx + i * 0.034 * innerScale,
          noodleY + (i % 2) * 0.006 * innerScale,
          vz,
          0.14 * innerScale,
          0.028 * innerScale,
          span,
          nCol,
          0.25,
          [0, 0.15 * i, 0],
          0.55,
          0
        );
      }
      for (let j = -2; j <= 2; j++) {
        const span = (1.0 - Math.abs(j) * 0.12) * 0.24 * innerScale;
        this.drawMesh(
          'wavy_noodle',
          vx,
          noodleY + 0.012 * innerScale,
          vz + j * 0.036 * innerScale,
          0.14 * innerScale,
          0.028 * innerScale,
          span,
          nCol,
          0.28,
          [0, Math.PI * 0.5 + j * 0.1, 0],
          0.55,
          0
        );
      }
    }

    // 4. СЛОЙ 3D-ТОППИНГОВ (подсчитываем количество каждой добавленной порции!)
    const counts = {};
    for (const t of vessel.toppings) {
      counts[t] = (counts[t] || 0) + 1;
    }

    const topY = fillBaseY + 0.016 * innerScale;
    const ts = innerScale;

    // 🟩 ВОДОРОСЛИ НОРИ (торчат веером у заднего правого бортика миски/вок-коробочки)
    if (counts.nori) {
      const sheetCount = Math.min(5, counts.nori * 2 + 1);
      for (let i = 0; i < sheetCount; i++) {
        const ang = -0.35 + i * 0.22;
        this.draw3DNoriSheet(
          vx + (0.07 + i * 0.032) * ts,
          topY + 0.038 * ts,
          vz - (0.11 - i * 0.015) * ts,
          0.95 * ts,
          [-0.38, ang, -0.12 + i * 0.08]
        );
      }
    }

    // 🥩 СВИНИНА ТЯШУ (круглые мраморные ломтики веером в левой дальней части)
    if (counts.chashu) {
      const sliceCount = Math.min(6, counts.chashu * 2);
      for (let i = 0; i < sliceCount; i++) {
        const a = -2.3 + i * 0.42;
        const r = 0.095 * ts;
        this.draw3DChashuSlice(
          vx + Math.cos(a) * r,
          topY + (0.01 + i * 0.004) * ts,
          vz + Math.sin(a) * r,
          0.95 * ts,
          [0.24, -a, 0.18]
        );
      }
    }

    // 🥚 МАРИНОВАННОЕ ЯЙЦО АДЖИТАМА (половинки с выпуклым оранжевым желтком справа спереди)
    if (counts.egg) {
      const halves = Math.min(4, counts.egg * 2);
      const eggCoords = [
        { dx: 0.078, dz: 0.055, ry: 0.4 },
        { dx: 0.015, dz: 0.092, ry: -0.3 },
        { dx: -0.055, dz: 0.078, ry: 0.8 },
        { dx: 0.11, dz: -0.01, ry: -0.6 }
      ];
      for (let i = 0; i < halves; i++) {
        const ec = eggCoords[i];
        this.draw3DAjitamaEggHalf(
          vx + ec.dx * ts,
          topY + 0.002 * ts,
          vz + ec.dz * ts,
          0.96 * ts,
          ec.ry
        );
      }
    }

    // 🍤 КРЕВЕТКА ТЕМПУРА (изогнутые золотистые креветки с красными хвостиками)
    if (counts.shrimp) {
      const numShrimp = Math.min(4, counts.shrimp * 2);
      for (let i = 0; i < numShrimp; i++) {
        const offsetZ = -0.02 + i * 0.045;
        this.draw3DTempuraShrimp(
          vx - 0.055 * ts + i * 0.025 * ts,
          topY + 0.01 * ts,
          vz + offsetZ * ts,
          1.05 * ts,
          0.4 + i * 0.5
        );
      }
    }

    // 🧅 ЗЕЛЁНЫЙ ЛУК (горка настоящих зелёных 3D-колечек по центру рамена)
    if (counts.scallion) {
      const ringCount = Math.min(20, counts.scallion * 10);
      for (let i = 0; i < ringCount; i++) {
        const ang = i * 2.39996; // Золотой угол Фибоначчи для естественной горки
        const rad = Math.sqrt(i / ringCount) * 0.078 * ts;
        this.draw3DScallionRing(
          vx + Math.cos(ang) * rad,
          topY + (0.014 + (i % 3) * 0.005) * ts,
          vz + Math.sin(ang) * rad,
          0.88 * ts,
          [Math.sin(i) * 0.3, ang, Math.cos(i) * 0.3]
        );
      }
    }

    // 🌶️ ОСТРЫЙ СОУС ЧИЛИ (глянцевый огненно-красный зигзаг поверх всех топпингов!)
    if (counts.chili) {
      this.drawMesh(
        'wavy_noodle',
        vx,
        topY + 0.026 * ts,
        vz,
        0.24 * ts,
        0.022 * ts,
        0.25 * ts,
        [1.0, 0.1, 0.22],
        0.85,
        [0, 0.4, 0],
        0.95,
        0
      );
      this.drawMesh(
        'wavy_noodle',
        vx,
        topY + 0.028 * ts,
        vz,
        0.2 * ts,
        0.02 * ts,
        0.23 * ts,
        [1.0, 0.22, 0.1],
        0.85,
        [0, -0.55, 0],
        0.95,
        0
      );
    }
  }

  // =========================================================================
  // КИБЕРПАНК-ПЕРЕУЛОК С ТЕКСТУРАМИ (КАНДЗИ-ВЫВЕСКИ, КОНДИЦИОНЕРЫ, ПРОХОЖИЕ, АВТО С ФАРАМИ, МОКРЫЙ АСФАЛЬТ)
  // =========================================================================
  drawStreetAndCity3D(tier) {
    // 1. Дальний туманный каньон мегаполиса с небоскрёбами и проводами (1024x1024 текстура на заднем плане)
    this.drawTexturedQuad(this.texBackdrop, 0.0, 2.55, -7.2, 8.8, 6.2, 0.72);

    // 2. Мокрый асфальт переулка с неоновыми отражениями в лужах (текстурированная плоскость дороги)
    this.drawTexturedQuad(
      this.texAsphalt,
      0.0,
      0.02,
      -4.2,
      4.4,
      7.2,
      0.48,
      [-Math.PI * 0.5, 0, 0]
    );
    // Тротуары и бордюры по бокам узкого переулка
    this.drawBox(-1.45, 0.06, -4.2, 0.75, 0.12, 7.2, [0.09, 0.13, 0.18], 0.05, null, 0.5);
    this.drawBox(1.45, 0.06, -4.2, 0.75, 0.12, 7.2, [0.09, 0.13, 0.18], 0.05, null, 0.5);

    // 3. Боковые текстурированные стены зданий переулка (с рольставнями шаッター и трубами)
    this.drawTexturedQuad(
      this.texFacade,
      -1.35,
      2.1,
      -3.2,
      3.8,
      4.2,
      0.38,
      [0, Math.PI * 0.5, 0]
    );
    this.drawTexturedQuad(
      this.texFacade,
      1.35,
      2.1,
      -3.2,
      3.8,
      4.2,
      0.38,
      [0, -Math.PI * 0.5, 0]
    );

    // Красные уличные козырьки над закрытыми лавками слева и справа (как на скриншоте!)
    this.drawBox(-1.12, 1.56, -2.55, 0.52, 0.06, 1.45, [0.46, 0.14, 0.16], 0.12, [0, 0, -0.28]);
    this.drawBox(1.12, 1.62, -2.75, 0.52, 0.06, 1.45, [0.42, 0.13, 0.18], 0.12, [0, 0, 0.28]);

    // Зелёный уличный мусорный бак слева у стены (как на скриншоте!)
    this.drawBox(-1.14, 0.48, -2.05, 0.34, 0.72, 0.42, [0.16, 0.3, 0.2], 0.08);
    this.drawBox(-1.14, 0.86, -2.05, 0.36, 0.05, 0.44, [0.22, 0.38, 0.25], 0.1);

    // 5. Светящиеся вертикальные японские вывески кандзи в глубине переулка
    if (this.texSigns) {
      // Слева дальше в переулке: жёлтая вертикальная вывеска 定食餃子 и фиолетово-розовая вывеска
      this.drawTexturedQuad(this.texSigns.yellow_izakaya, -0.76, 1.82, -3.75, 0.28, 0.72, 0.88);
      this.drawTexturedQuad(this.texSigns.pink_cyber, -0.72, 2.38, -4.25, 0.26, 0.58, 0.85);

      // Справа вверху: яркая розово-неоновая вертикальная вывеска 夜屋台街
      this.drawBox(0.84, 2.12, -2.55, 0.34, 0.84, 0.05, [1.0, 0.2, 0.65], 0.85);
      this.drawTexturedQuad(this.texSigns.pink_cyber, 0.84, 2.12, -2.52, 0.34, 0.84, 0.95);

      // Справа дальше: бирюзовая вертикальная вывеска 電脳九龍
      this.drawTexturedQuad(this.texSigns.cyan_denno, 0.68, 1.72, -3.65, 0.28, 0.68, 0.9);
    }

    // 6. Киберпанк-автомобиль в глубине мокрого переулка с яркими белыми фарами
    const carZ = -4.65;
    const carX = -0.06;
    this.drawBox(carX, 0.34, carZ, 0.82, 0.26, 1.25, [0.1, 0.15, 0.2], 0.12, null, 0.75);
    this.drawBox(carX, 0.54, carZ - 0.08, 0.66, 0.2, 0.72, [0.14, 0.22, 0.28], 0.18, null, 0.85);
    this.drawMesh('sphere', carX - 0.28, 0.36, carZ + 0.62, 0.11, 0.07, 0.05, [0.95, 0.99, 1.0], 1.0);
    this.drawMesh('sphere', carX + 0.28, 0.36, carZ + 0.62, 0.11, 0.07, 0.05, [0.95, 0.99, 1.0], 1.0);

    // 7. Парящий в тумане спиннер (летающая машина над переулком)
    const spinnerBob = Math.sin(this.time * 1.9) * 0.05;
    const spX = -0.14 + Math.sin(this.time * 0.45) * 0.18;
    const spY = 1.62 + spinnerBob;
    const spZ = -4.85;
    this.drawBox(spX, spY, spZ, 0.54, 0.14, 0.38, [0.12, 0.18, 0.24], 0.15, [0.05, 0.2, -0.04]);
    this.drawMesh('sphere', spX - 0.18, spY - 0.02, spZ + 0.18, 0.06, 0.04, 0.04, [1.0, 0.85, 0.5], 0.95);
    this.drawMesh('sphere', spX + 0.18, spY - 0.02, spZ + 0.18, 0.06, 0.04, 0.04, [0.4, 0.95, 1.0], 0.95);
  }

  drawYataiInterior3D(tier) {
    const woodMain =
      tier === 1
        ? [0.22, 0.16, 0.14]
        : tier === 2
          ? [0.16, 0.12, 0.26]
          : [0.09, 0.22, 0.32];
    const counterCol =
      tier === 1
        ? [0.28, 0.32, 0.36]
        : tier === 2
          ? [0.24, 0.22, 0.36]
          : [0.18, 0.32, 0.42];
    const trimEmissive = tier === 1 && !gameState.hasUpgrade('neon_sign') ? 0.45 : 0.85;
    const trimCol =
      tier === 3 ? [0.0, 0.96, 0.83] : tier === 2 ? [1.0, 0.16, 0.52] : [0.0, 0.92, 0.88];

    this.drawBox(0, 0.05, 0, 3.4, 0.1, 3.0, [0.1, 0.1, 0.14], 0.0);

    // ПЕРЕДНЯЯ СТАЛЬНАЯ СТОЛЕШНИЦА ПРИЛАВКА С ОТКРЫТОЙ ПОДСВЕЧЕННОЙ НИШЕЙ ПОД ПРИЛАВКОМ (ДЛЯ ПОДНОСОВ И ПАКЕТОВ!)
    // Боковые тумбы слева/справа, задняя стенка ниши и нижняя стальная полка на y = 0.34
    this.drawBox(-0.82, 0.44, -0.54, 0.46, 0.82, 1.04, woodMain, 0.0);
    this.drawBox(0.82, 0.44, -0.54, 0.46, 0.82, 1.04, woodMain, 0.0);
    this.drawBox(0, 0.44, -0.92, 1.2, 0.82, 0.28, woodMain, 0.0);
    this.drawBox(0, 0.18, -0.42, 1.2, 0.28, 0.78, [0.14, 0.12, 0.14], 0.0);
    // Внутренняя широкая стальная полка под прилавком (y = 0.34) для больших подносов и тёплая LED-подсветка сверху ниши
    this.drawBox(0, 0.34, -0.44, 1.18, 0.032, 0.68, [0.26, 0.3, 0.36], 0.08, null, 0.65);
    this.drawBox(0, 0.81, -0.22, 1.1, 0.014, 0.02, [0.98, 0.84, 0.56], 0.92);

    // Верхняя стальная столешница и неоновая полоса
    this.drawBox(0, 0.86, -0.54, 2.16, 0.07, 1.08, counterCol, 0.06, null, 0.55);
    this.drawBox(0, 0.9, -0.02, 2.1, 0.02, 0.025, trimCol, trimEmissive);

    // Широкий ступенчатый стальной подиум (мармит Bain-Marie) под 2 ряда увеличенных гастроемкостей
    this.drawBox(0, 0.915, -0.62, 0.88, 0.055, 0.22, [0.2, 0.24, 0.3], 0.06, null, 0.65);
    this.drawBox(0, 0.948, -0.85, 0.88, 0.115, 0.22, [0.22, 0.26, 0.33], 0.07, null, 0.7);
    // Боковые стальные бортики мармита
    this.drawBox(-0.435, 0.96, -0.735, 0.022, 0.12, 0.46, [0.36, 0.41, 0.48], 0.08, null, 0.8);
    this.drawBox(0.435, 0.96, -0.735, 0.022, 0.12, 0.46, [0.36, 0.41, 0.48], 0.08, null, 0.8);

    // ЗАДНЯЯ СТЕНКА-БОРТИК ПРИЛАВКА ТЕЛЕЖКИ (за контейнерами, z = -1.06, высотой до y = 1.07)
    // + ЛЕВАЯ И ПРАВАЯ ПОЛОЧКИ ВЫДАЧИ, КУДА ПОКУПАТЕЛИ СТАВЯТ ГРЯЗНЫЕ МИСКИ ПОСЛЕ ЕДЫ!
    this.drawBox(0, 0.54, -1.06, 2.32, 0.98, 0.09, [0.15, 0.18, 0.24], 0.05, null, 0.5);
    this.drawBox(0, 1.045, -1.06, 2.34, 0.048, 0.13, counterCol, 0.08, null, 0.68);
    this.drawBox(0, 1.068, -1.0, 2.24, 0.015, 0.02, trimCol, trimEmissive);
    // Деревянная подставка-столешница на ЛЕВОЙ (x = -0.68) части передней стойки (слева от котика!) под грязные миски
    this.drawBox(-0.68, 1.072, -1.04, 0.58, 0.016, 0.24, [0.32, 0.2, 0.14], 0.08, null, 0.55);

    // ЛЕВАЯ СТОЛЕШНИЦА ВАРОЧНОГО ЦЕХА И МОЙКИ ПОСУДЫ (с настоящим глубоким сквозным вырезом под чашу раковины на z = 0.48..0.96!)
    // 1) Секция под варочной плитой (z от -1.13 до +0.48)
    this.drawBox(-0.92, 0.44, -0.325, 0.92, 0.82, 1.61, woodMain, 0.0);
    this.drawBox(-0.92, 0.86, -0.325, 0.96, 0.07, 1.61, [0.22, 0.26, 0.32], 0.05, null, 0.45);
    // 2) Нижняя тумба под глубокой чашей раковины и сушилкой (z от +0.48 до +1.25, верх тумбы ниже дна раковины y = 0.75)
    this.drawBox(-0.92, 0.375, 0.865, 0.92, 0.75, 0.77, woodMain, 0.0);
    // 3) Столешница вокруг выреза раковины (дальняя часть под сушилкой z = 0.96..1.25 и боковые перемычки)
    this.drawBox(-0.92, 0.86, 1.105, 0.96, 0.07, 0.29, [0.22, 0.26, 0.32], 0.05, null, 0.45);
    this.drawBox(-1.265, 0.86, 0.72, 0.27, 0.07, 0.48, [0.22, 0.26, 0.32], 0.05, null, 0.45);
    this.drawBox(-0.535, 0.86, 0.72, 0.19, 0.07, 0.48, [0.22, 0.26, 0.32], 0.05, null, 0.45);
    this.drawBox(-0.45, 0.9, 0.06, 0.03, 0.025, 2.32, [0.0, 0.96, 0.83], 0.65);

    // ПРАВАЯ СТОЛЕШНИЦА СКЛАДА И УПАКОВКИ С ОТКРЫТОЙ ПОДСВЕЧЕННОЙ НИШЕЙ ПОД КРИО-ХОЛОДИЛЬНИКОМ (ДЛЯ ПАКЕТОВ С СОБОЙ!)
    // 1) Сплошная передняя тумба под стойками мисок и коробок (z от -1.095 до -0.02, без пересечения с передней стойкой!)
    this.drawBox(0.92, 0.44, -0.5575, 0.92, 0.82, 1.075, woodMain, 0.0);
    // 2) Задняя стенка ниши за пакетами и крайняя правая боковина (z от +0.56 до +0.655)
    this.drawBox(1.18, 0.44, 0.27, 0.4, 0.82, 0.58, woodMain, 0.0);
    this.drawBox(0.92, 0.44, 0.6075, 0.92, 0.82, 0.095, woodMain, 0.0);
    // 3) Нижний цоколь, внутренняя стальная полка (y = 0.34) и LED-подсветка ниши под холодильником (z = -0.02..+0.56)
    this.drawBox(0.72, 0.18, 0.27, 0.52, 0.28, 0.58, [0.14, 0.12, 0.14], 0.0);
    this.drawBox(0.74, 0.34, 0.27, 0.54, 0.032, 0.56, [0.26, 0.3, 0.36], 0.08, null, 0.65);
    this.drawBox(0.52, 0.805, 0.27, 0.02, 0.014, 0.52, [0.98, 0.88, 0.62], 0.92);
    // Верхняя правая столешница и неоновая полоса
    this.drawBox(0.92, 0.86, -0.22, 0.96, 0.07, 1.82, counterCol, 0.05, null, 0.45);
    this.drawBox(0.45, 0.9, -0.22, 0.03, 0.025, 1.76, trimCol, 0.65);

    // Боковые металлические стойки окна ятая
    this.drawBox(-1.12, 1.55, -0.98, 0.09, 1.5, 0.09, [0.18, 0.2, 0.25], 0.05, null, 0.5);
    this.drawBox(1.12, 1.55, -0.98, 0.09, 1.5, 0.09, [0.18, 0.2, 0.25], 0.05, null, 0.5);

    // ВЕРХНИЙ КОЗЫРЁК ЯТАЯ + ДВОЙНАЯ ЛЮМИНЕСЦЕНТНАЯ ЛАМПА ДНЕВНОГО СВЕТА + СВИСАЮЩИЕ ПРОВОДА (КАК НА СКРИНШОТЕ!)
    // Рифлёный тёмно-бордовый навес крыши ятая сверху
    this.drawBox(0, 1.98, -0.82, 2.4, 0.06, 0.95, [0.34, 0.14, 0.13], 0.08, [0.12, 0, 0]);
    for (let rx = -0.9; rx <= 0.9; rx += 0.3) {
      this.drawBox(rx, 1.95, -0.82, 0.04, 0.04, 0.92, [0.18, 0.1, 0.1], 0.04, [0.12, 0, 0]);
    }

    // Металлический корпус двойного потолочного светильника (y = 1.83, z = -0.98)
    this.drawBox(0, 1.86, -0.98, 0.96, 0.045, 0.14, [0.42, 0.46, 0.5], 0.15, null, 0.6);
    this.drawBox(-0.47, 1.82, -0.98, 0.035, 0.065, 0.13, [0.22, 0.25, 0.28], 0.1);
    this.drawBox(0.47, 1.82, -0.98, 0.035, 0.065, 0.13, [0.22, 0.25, 0.28], 0.1);

    // Две ярко светящиеся тёпло-белые люминесцентные трубки под козырьком!
    this.drawMesh(
      'cylinder',
      0,
      1.825,
      -0.95,
      0.034,
      0.9,
      0.034,
      [1.0, 0.96, 0.82],
      0.98,
      [0, 0, Math.PI * 0.5],
      0.9
    );
    this.drawMesh(
      'cylinder',
      0,
      1.795,
      -1.01,
      0.034,
      0.9,
      0.034,
      [1.0, 0.94, 0.78],
      0.95,
      [0, 0, Math.PI * 0.5],
      0.9
    );

    // Свисающие пучки цветных кабелей и проводов по верхним углам окна (жёлтый, оранжевый, тёмный — как на скриншоте!)
    const cableLoops = [
      { x0: -1.06, y0: 1.86, x1: -0.52, y1: 1.84, sag: 0.18, col: [0.85, 0.62, 0.18] },
      { x0: -1.08, y0: 1.78, x1: -0.62, y1: 1.85, sag: 0.24, col: [0.72, 0.35, 0.15] },
      { x0: 0.52, y0: 1.84, x1: 1.06, y1: 1.86, sag: 0.19, col: [0.82, 0.6, 0.2] },
      { x0: 0.64, y0: 1.85, x1: 1.08, y1: 1.72, sag: 0.25, col: [0.2, 0.22, 0.26] }
    ];
    for (const cb of cableLoops) {
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const cx = cb.x0 + (cb.x1 - cb.x0) * t;
        const cy = cb.y0 + (cb.y1 - cb.y0) * t - Math.sin(t * Math.PI) * cb.sag;
        this.drawBox(cx, cy, -0.96, 0.08, 0.016, 0.016, cb.col, 0.22);
      }
    }
  }

  // Локальный ортонормированный базис камеры: F (вперёд), R (вправо по экрану), U (вверх по экрану)
  getCameraBasis() {
    const fx = this.lookAtCurrent[0] - this.camPos[0];
    const fy = this.lookAtCurrent[1] - this.camPos[1];
    const fz = this.lookAtCurrent[2] - this.camPos[2];
    const flen = Math.hypot(fx, fy, fz) || 1;
    const F = [fx / flen, fy / flen, fz / flen];

    const rx = -F[2];
    const rz = F[0];
    const rlen = Math.hypot(rx, rz) || 1;
    const R = [rx / rlen, 0, rz / rlen];

    const U = [
      R[1] * F[2] - R[2] * F[1],
      R[2] * F[0] - R[0] * F[2],
      R[0] * F[1] - R[1] * F[0]
    ];
    return { F, R, U };
  }

  // Вычисляет 3D-позицию левой руки повара с миской или вок-коробкой:
  // Во всех секторах (включая поворот налево в Сектор 0) левая рука держит посуду близко к герою внизу экрана,
  // и только в момент наливания бульона или выкладывания готовой лапши плавно выдвигается чуть вперёд навстречу правой руке!
  getLeftHandWorldPos() {
    const rt = gameState.runtime;
    const swayY = Math.sin(this.time * 3.2) * 0.004;
    const { F, R, U } = this.getCameraBasis();

    let ext = 0;
    let catchDip = 0;
    if (rt.activeSector === 0 && this.pourAnim.active) {
      const p = Math.min(1, this.pourAnim.timer / this.pourAnim.duration);
      if (p < 0.24) {
        const t = p / 0.24;
        ext = t * t * (3 - 2 * t);
      } else if (p < 0.76) {
        ext = 1.0;
        const pourT = (p - 0.24) / 0.52;
        catchDip = Math.sin(pourT * Math.PI) * 0.014;
      } else {
        const t = (p - 0.76) / 0.24;
        const s = t * t * (3 - 2 * t);
        ext = 1.0 - s;
      }
    } else if (rt.activeSector === 1 && rt.cameraFocus === 'worktable' && this.toppingAnim.active) {
      // При накладывании топпингов палочками левая рука с миской/коробкой тоже плавно выезжает чуть вперёд навстречу!
      const p = Math.min(1, this.toppingAnim.timer / this.toppingAnim.duration);
      if (p < 0.24) {
        const t = p / 0.24;
        ext = t * t * (3 - 2 * t) * 0.85;
      } else if (p < 0.74) {
        ext = 0.85;
        if (p >= 0.56) {
          const dropT = (p - 0.56) / 0.18;
          catchDip = Math.sin(dropT * Math.PI) * 0.013;
        }
      } else {
        const t = (p - 0.74) / 0.26;
        const s = t * t * (3 - 2 * t);
        ext = 0.85 * (1.0 - s);
      }
    }

    const d = 0.58 + 0.085 * ext;
    const halfW = d * (this.currentTanHalfFovY || 0.6745) * (this.currentAspect || 0.56);
    const halfH = d * (this.currentTanHalfFovY || 0.6745);
    const r = Math.max(-0.15, Math.min(-0.085, -0.44 * halfW)) + 0.048 * ext;
    const u = Math.max(-0.27, Math.min(-0.18, -0.52 * halfH)) + 0.072 * ext - catchDip + swayY;

    return [
      this.camPos[0] + F[0] * d + R[0] * r + U[0] * u,
      this.camPos[1] + F[1] * d + R[1] * r + U[1] * u,
      this.camPos[2] + F[2] * d + R[2] * r + U[2] * u
    ];
  }

  // =========================================================================
  // 3D-МОДЕЛИ ПОДНОСА, БУМАЖНОГО ПАКЕТА С СОБОЙ, ПАЛОЧЕК И НИШИ ПОД ПРИЛАВКОМ
  // =========================================================================
  draw3DRamenTray(x, y, z, s = 1.0, rot = null) {
    const baseCol = [0.16, 0.08, 0.1];     // Тёмно-лаковый японский поднос «О-бон»
    const rimCol = [0.68, 0.16, 0.22];     // Алая лаковая окантовка по краям подноса
    const innerCol = [0.11, 0.09, 0.13];   // Нескользящее матовое дно подноса
    const tw = 0.6 * s;
    const td = 0.38 * s;
    const th = 0.013 * s;
    const lipH = 0.027 * s;

    this.drawBox(x, y + th * 0.5, z, tw, th, td, baseCol, 0.08, rot, 0.65);
    this.drawBox(x, y + th + 0.001 * s, z, tw - 0.036 * s, 0.004 * s, td - 0.036 * s, innerCol, 0.04, rot, 0.35);
    // 4 приподнятых бортика подноса
    this.drawBox(x, y + lipH * 0.5, z - td * 0.48, tw, lipH, 0.019 * s, rimCol, 0.2, rot, 0.78);
    this.drawBox(x, y + lipH * 0.5, z + td * 0.48, tw, lipH, 0.019 * s, rimCol, 0.2, rot, 0.78);
    this.drawBox(x - tw * 0.48, y + lipH * 0.5, z, 0.019 * s, lipH, td, rimCol, 0.2, rot, 0.78);
    this.drawBox(x + tw * 0.48, y + lipH * 0.5, z, 0.019 * s, lipH, td, rimCol, 0.2, rot, 0.78);
  }

  draw3DChopsticksPack(x, y, z, s = 1.0, rot = null) {
    // Японские одноразовые палочки «Варибаси» в бумажном чехле «Хасибукуро» с красным акцентом
    this.drawBox(x, y + 0.008 * s, z, 0.026 * s, 0.01 * s, 0.21 * s, [0.95, 0.93, 0.88], 0.22, rot, 0.35);
    this.drawBox(x, y + 0.012 * s, z + 0.02 * s, 0.028 * s, 0.005 * s, 0.055 * s, [0.88, 0.16, 0.24], 0.42, rot, 0.45);
    // Кончики бамбуковых палочек, слегка выглядывающие из чехла
    this.drawBox(x - 0.004 * s, y + 0.008 * s, z - 0.115 * s, 0.006 * s, 0.006 * s, 0.035 * s, [0.88, 0.74, 0.48], 0.12, rot, 0.3);
    this.drawBox(x + 0.004 * s, y + 0.008 * s, z - 0.115 * s, 0.006 * s, 0.006 * s, 0.035 * s, [0.88, 0.74, 0.48], 0.12, rot, 0.3);
  }

  draw3DDrinkCan(x, y, z, drinkId = 'cola', s = 1.0, rot = null) {
    const cfg = GAME_CONFIG.DRINKS?.[drinkId] || GAME_CONFIG.DRINKS.cola;
    const bodyCol = cfg.bodyCol || [0.88, 0.12, 0.18];
    const stripeCol = cfg.stripeCol || [0.96, 0.94, 0.9];
    const accentCol = cfg.accentCol || [0.1, 0.1, 0.14];
    const aluCol = [0.78, 0.83, 0.9];

    const r = 0.068 * s;
    const h = 0.112 * s;
    // Нижний суженный алюминиевый ободок дна
    this.drawMesh('cylinder', x, y + 0.008 * s, z, r * 0.88, 0.014 * s, r * 0.88, aluCol, 0.12, rot, 0.92);
    // Основной глянцевый корпус жестяной банки
    this.drawMesh('cylinder', x, y + 0.014 * s + h * 0.44, z, r, h * 0.84, r, bodyCol, 0.24, rot, 0.88);
    // Фирменная контрастная полоса и кибер-акцент по центру банки
    this.drawMesh('cylinder', x, y + 0.014 * s + h * 0.48, z, r * 1.03, h * 0.22, r * 1.03, stripeCol, 0.45, rot, 0.85);
    this.drawMesh('cylinder', x, y + 0.014 * s + h * 0.28, z, r * 1.02, h * 0.1, r * 1.02, accentCol, 0.28, rot, 0.78);
    // Верхний суженный скос банки и алюминиевая крышка с колечком-ключиком (pull-tab)
    this.drawMesh('cylinder', x, y + h * 0.96, z, r * 0.86, 0.016 * s, r * 0.86, aluCol, 0.2, rot, 0.95);
    this.drawMesh('torus', x, y + h * 1.03, z, r * 0.84, 0.007 * s, r * 0.84, [0.86, 0.9, 0.96], 0.24, rot, 0.96);
    this.drawBox(x + 0.006 * s, y + h * 1.045, z, 0.018 * s, 0.004 * s, 0.01 * s, [0.62, 0.68, 0.76], 0.18, rot, 0.95);
  }

  draw3DTakeoutBag(x, y, z, s = 1.0, foodItem = false, hasChopsticks = false, isCarried = false, rot = null, drinkId = null) {
    const kraftOuter = [0.77, 0.58, 0.37];   // Плотный тёплый японский крафт снаружи
    const kraftFold = [0.64, 0.47, 0.29];    // Боковые складки-фальцы, кромки и усиления ручек
    const kraftInner = [0.47, 0.34, 0.21];   // Притемнённая внутренняя стенка пакета
    const kraftBottom = [0.33, 0.23, 0.14];  // Глубокое тёмное внутреннее дно
    const ropeColA = [0.56, 0.39, 0.23];     // Витой бумажный жгут ручки (тон 1)
    const ropeColB = [0.46, 0.31, 0.18];     // Витой бумажный жгут ручки (тон 2)
    const redBrand = [0.9, 0.16, 0.25];      // Фирменная карминовая графика CYBER RAMEN
    const creamLabel = [0.95, 0.92, 0.85];   // Кремовый акцент штампа
    const cyanStamp = [0.0, 0.92, 0.82];     // Неоновый бирюзовый штамп раменной

    // Просторный широкий пакет (чуть меньше подноса 0.60 x 0.38 — свободно вмещает запечатанную вок-коробку, палочки и напиток!)
    const bw = 0.44 * s;
    const bh = 0.26 * s;
    const bd = 0.27 * s;
    const wt = 0.01 * s; // Толщина картонных стенок (внутри настоящее пустое 3D-пространство!)

    const ry = rot ? rot[1] || 0 : 0;
    const cy = Math.cos(ry);
    const sry = Math.sin(ry);
    const wp = (lx, lz) => [x + lx * cy + lz * sry, z - lx * sry + lz * cy];

    // Вспомогательная функция для гладких 3D-сегментов витых ручек
    const drawSeg = (ax, ay, az, bx, by, bz, w, col, emissive = 0.08, spec = 0.26) => {
      const vx = bx - ax;
      const vy = by - ay;
      const vz = bz - az;
      const len = Math.hypot(vx, vy, vz) || 0.001;
      const ux = vx / len;
      const uy = vy / len;
      const uz = vz / len;
      const rySeg = Math.asin(Math.max(-0.995, Math.min(0.995, ux)));
      const rxSeg = Math.atan2(-uy, uz);
      this.drawBox((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5, w, w, len * 1.14, col, emissive, [rxSeg, rySeg, 0], spec);
    };

    // 1. ДНО ПАКЕТА (внешнее + притемнённая внутренняя картонка-вкладыш, создающая реальную глубину)
    this.drawBox(x, y + 0.006 * s, z, bw, 0.012 * s, bd, kraftFold, 0.06, rot, 0.2);
    this.drawBox(x, y + 0.013 * s, z, bw - wt * 2.1, 0.004 * s, bd - wt * 2.1, kraftBottom, 0.02, rot, 0.12);

    // 2. ПЕРЕДНЯЯ И ЗАДНЯЯ СТЕНКИ ПОЛОГО ПАКЕТА + ВНУТРЕННИЙ ЗАТЕНЁННЫЙ СЛОЙ + УТОЛЩЁННЫЙ ПОДГИБ КРОМКИ СВЕРХУ
    for (const side of [1, -1]) {
      const wallZ = side * (bd * 0.5 - wt * 0.5);
      const innerZ = side * (bd * 0.5 - wt * 1.05);
      const [wx, wz] = wp(0, wallZ);
      const [ix, iz] = wp(0, innerZ);

      // Внешняя крафтовая стенка
      this.drawBox(wx, y + bh * 0.5, wz, bw, bh, wt, kraftOuter, 0.1, rot, 0.24);
      // Внутренняя притемнённая сторона стенки (хорошо читается при взгляде сверху внутрь!)
      this.drawBox(ix, y + bh * 0.5, iz, bw - wt * 1.8, bh - 0.016 * s, 0.003 * s, kraftInner, 0.03, rot, 0.12);
      // Аккуратный утолщённый верхний подгиб кромки пакета (манжета)
      this.drawBox(wx, y + bh - 0.008 * s, wz, bw + 0.004 * s, 0.016 * s, wt + 0.005 * s, kraftFold, 0.08, rot, 0.22);
      // Внутренняя картонка-усиление (патч), к которой приклеена витая ручка!
      const [px, pz] = wp(0, side * (bd * 0.5 - wt * 1.25));
      this.drawBox(px, y + bh - 0.03 * s, pz, 0.21 * s, 0.04 * s, 0.004 * s, kraftFold, 0.05, rot, 0.18);

      // Фирменная графика CYBER RAMEN на наружной стороне передней и задней стенок
      const printZ = side * (bd * 0.5 + 0.003 * s);
      const [prx, prz] = wp(0, printZ);
      // Широкая алая полоса-оби
      this.drawBox(prx, y + bh * 0.54, prz, bw * 0.86, 0.044 * s, 0.004 * s, redBrand, 0.36, rot, 0.38);
      // Японская квадратная печать-штамп слева от центра и бирюзовая кибер-линия снизу
      const [stx, stz] = wp(-bw * 0.24, printZ + side * 0.0022 * s);
      const [st2x, st2z] = wp(-bw * 0.24, printZ + side * 0.0036 * s);
      this.drawBox(stx, y + bh * 0.54, stz, 0.048 * s, 0.048 * s, 0.003 * s, creamLabel, 0.24, rot, 0.35);
      this.drawBox(st2x, y + bh * 0.54, st2z, 0.028 * s, 0.028 * s, 0.003 * s, redBrand, 0.45, rot, 0.4);
      // Светящийся неоновый штамп раменной под красной лентой
      const [cyx, cyz] = wp(bw * 0.06, printZ + side * 0.001 * s);
      this.drawBox(cyx, y + bh * 0.35, cyz, bw * 0.52, 0.014 * s, 0.003 * s, cyanStamp, 0.78, rot, 0.52);
      // Тонкий нижний сгиб дна снаружи
      this.drawBox(prx, y + 0.034 * s, prz, bw * 0.94, 0.006 * s, 0.003 * s, kraftFold, 0.04, rot, 0.18);
    }

    // 3. ЛЕВАЯ И ПРАВАЯ БОКОВЫЕ СТЕНКИ С ОБЪЁМНОЙ СКЛАДКОЙ-ФАЛЬЦЕМ (GUSSET)
    for (const side of [-1, 1]) {
      const outerX = side * (bw * 0.5 - wt * 0.5);
      const innerX = side * (bw * 0.5 - wt * 1.05);
      const creaseX = side * (bw * 0.5 - 0.014 * s);

      // Передняя и задняя половинки боковой стенки (между ними утопленный вертикальный фальц-складка!)
      for (const zHalf of [-1, 1]) {
        const [bx, bz] = wp(outerX, zHalf * bd * 0.245);
        this.drawBox(bx, y + bh * 0.5, bz, wt, bh, bd * 0.47, kraftFold, 0.08, rot, 0.22);
      }
      // Утопленная вертикальная линия сгиба-гармошки по центру боковины
      const [cx, cz] = wp(creaseX, 0);
      this.drawBox(cx, y + bh * 0.5, cz, 0.014 * s, bh - 0.008 * s, 0.022 * s, kraftInner, 0.04, rot, 0.15);
      // Внутренний притемнённый слой боковины
      const [ix, iz] = wp(innerX, 0);
      this.drawBox(ix, y + bh * 0.5, iz, 0.003 * s, bh - 0.016 * s, bd - wt * 1.8, kraftInner, 0.03, rot, 0.12);
      // Верхний край боковины и 2 угловых вертикальных ребра (герметичные углы без просветов)
      const [tx, tz] = wp(outerX, 0);
      this.drawBox(tx, y + bh - 0.008 * s, tz, wt + 0.004 * s, 0.016 * s, bd, kraftFold, 0.08, rot, 0.22);
      for (const zCorner of [-1, 1]) {
        const [kx, kz] = wp(side * (bw * 0.5 - 0.004 * s), zCorner * (bd * 0.5 - 0.004 * s));
        this.drawBox(kx, y + bh * 0.5, kz, 0.012 * s, bh, 0.012 * s, kraftFold, 0.06, rot, 0.2);
      }
    }

    // 4. ПРЕДМЕТЫ ВНУТРИ ПОЛОГО ПАКЕТА (ОТЧЁТЛИВО ВИДНЫ СВЕРХУ В ПРОСТРАНСТВЕ ПАКЕТА!)
    const hasFood = Boolean(foodItem);
    if (hasFood) {
      // Настоящая запечатанная 3D вок-коробочка (со сложенными клапанами, неоновой пломбой и стальной дужкой)
      // стоит на дне пакета чуть левее центра — справа остаётся место под напиток и палочки!
      const [boxWx, boxWz] = wp(-0.075 * s, -0.01 * s);
      this.draw3DWokBox(boxWx, y + 0.016 * s, boxWz, 0.78 * s, true);
    }

    if (drinkId) {
      // Охлаждённая жестяная банка напитка стоит прямо на дне полого пакета справа от коробки!
      const [drx, drz] = wp(0.095 * s, 0.01 * s);
      this.draw3DDrinkCan(drx, y + 0.016 * s, drz, drinkId, 1.12 * s, rot);
    }

    if (hasChopsticks) {
      // Японские палочки «Варибаси» в бумажном чехле стоят ВНУТРИ пакета у правого края, опираясь на стенку
      // и аккуратно выглядывая верхним красным кончиком из горловины!
      const [ch1x, ch1z] = wp(bw * 0.34, -0.02 * s);
      const [ch2x, ch2z] = wp(bw * 0.38, -0.02 * s);
      drawSeg(ch1x, y + 0.025 * s, ch1z, ch2x, y + bh + 0.065 * s, ch2z, 0.022 * s, [0.95, 0.93, 0.88], 0.22, 0.35);
      // Красная фирменная манжета на чехле палочек
      const mx1 = ch1x + (ch2x - ch1x) * 0.68;
      const my1 = (y + 0.025 * s) + (bh + 0.04 * s) * 0.68;
      const mz1 = ch1z + (ch2z - ch1z) * 0.68;
      const mx2 = ch1x + (ch2x - ch1x) * 0.88;
      const my2 = (y + 0.025 * s) + (bh + 0.04 * s) * 0.88;
      const mz2 = ch1z + (ch2z - ch1z) * 0.88;
      drawSeg(mx1, my1, mz1, mx2, my2, mz2, 0.0245 * s, redBrand, 0.44, 0.42);
      // Кончики бамбуковых палочек сверху чехла
      const tx2 = ch1x + (ch2x - ch1x) * 1.1;
      const ty2 = (y + 0.025 * s) + (bh + 0.04 * s) * 1.1;
      const tz2 = ch1z + (ch2z - ch1z) * 1.1;
      drawSeg(ch2x, y + bh + 0.065 * s, ch2z, tx2, ty2, tz2, 0.011 * s, [0.88, 0.74, 0.48], 0.14, 0.3);
    }

    // 5. УЛУЧШЕННЫЕ ПЛАВНЫЕ 3D-РУЧКИ ИЗ ВИТОГО КРАФТОВОГО ШНУРА (8-СЕГМЕНТНЫЕ АРКИ С КРЕПЛЕНИЕМ ИЗНУТРИ!)
    const segs = 8;
    const halfSpan = 0.092 * s;
    const archH = isCarried ? 0.125 * s : 0.112 * s;
    const anchorY = y + bh - 0.024 * s;
    const ropeW = 0.011 * s;

    for (const side of [1, -1]) {
      const baseLz = side * (bd * 0.5 - wt * 1.15);
      let prevPt = null;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const ang = Math.PI * (1 - u); // от PI (левая ножка) до 0 (правая ножка)
        const sinA = Math.sin(ang);
        const lx = Math.cos(ang) * halfSpan;
        const ly = anchorY + Math.pow(sinA, 0.72) * archH;
        // Когда пакет стоит — ручки мягко отклоняются чуть наружу, открывая полный вид внутрь пакета;
        // когда несём клиенту — обе ручки сходятся к центру прямо в перчатку героя!
        const lz = isCarried
          ? baseLz * (1 - Math.pow(sinA, 0.82))
          : baseLz + side * (sinA * 0.018 * s);
        const [wx, wz] = wp(lx, lz);
        if (prevPt) {
          drawSeg(prevPt[0], prevPt[1], prevPt[2], wx, ly, wz, ropeW, i % 2 === 0 ? ropeColA : ropeColB, 0.08, 0.25);
        }
        prevPt = [wx, ly, wz];
      }
    }
  }

  // НИШИ ПОД ПРИЛАВКОМ И ПОД ХОЛОДИЛЬНИКОМ (cameraFocus === 'under_counter'):
  // - Прямо под прилавком (underCounterSide = 0): стопка больших японских подносов;
  // - Поворот направо под холодильник (underCounterSide = 1): бумажные крафт-пакеты для заказов с собой!
  drawUnderCounterStorage3D() {
    const rt = gameState.runtime;
    const isUnderCounter = rt.activeSector === 1 && rt.cameraFocus === 'under_counter';
    const underSide = rt.underCounterSide || 0;
    const a = rt.assembly || {};

    // 1. ПОД ПЕРЕДНИМ ПРИЛАВКОМ ПО ЦЕНТРУ (x = 0.0, y = 0.358, z = -0.44): СТОПКА БОЛЬШИХ ПОДНОСОВ
    const trayX = 0.0;
    const trayY = 0.358;
    const trayZ = -0.44;
    const trayPulse = !a.hasTray ? 0.55 + 0.35 * Math.sin(this.time * 5.5) : 0.2;
    this.drawBox(trayX, trayY - 0.002, trayZ + 0.25, 0.62, 0.01, 0.012, [0.0, 0.96, 0.83], trayPulse);

    const visibleTrays = a.hasTray ? 5 : 6;
    for (let t = 0; t < visibleTrays; t++) {
      this.draw3DRamenTray(trayX, trayY + t * 0.026, trayZ, 0.94);
    }

    if (isUnderCounter && underSide === 0) {
      this.registerHitbox('under_tray_stack', trayX, trayY + 0.09, trayZ, 128);
    }

    // 2. ВНИЗУ ПОД КРИО-ХОЛОДИЛЬНИКОМ СПРАВА (x = 0.78, y = 0.358, z = +0.27): БУМАЖНЫЕ ПАКЕТЫ «С СОБОЙ»
    const bagX = 0.78;
    const bagY = 0.358;
    const bagZ = 0.27;
    const bagPulse = !a.hasBag ? 0.55 + 0.35 * Math.sin(this.time * 5.5 + 1.0) : 0.2;
    this.drawBox(bagX - 0.26, bagY - 0.002, bagZ, 0.012, 0.01, 0.48, [0.06, 0.96, 0.48], bagPulse);

    // Стоячие просторные крафт-пакеты в открытой полке под холодильником (лицевой стороной к игроку, без пересечений!)
    const bagRot = [0, -Math.PI * 0.5, 0];
    this.draw3DTakeoutBag(bagX - 0.12, bagY, bagZ - 0.04, 0.8, false, false, false, bagRot);
    this.draw3DTakeoutBag(bagX + 0.1, bagY, bagZ + 0.07, 0.8, false, false, false, bagRot);

    if (isUnderCounter && underSide === 1) {
      this.registerHitbox('under_bag_stack', bagX - 0.04, bagY + 0.14, bagZ, 128);
    }
  }

  // =========================================================================
  // СЕКТОР 1 (ПРИЛАВОК В 3D): 2 РЯДА ГАСТРОЕМКОСТЕЙ СВЕРХУ + ЗОНА СБОРКИ ЗАКАЗА + ПАЛОЧКИ + МУСОРКА
  // =========================================================================
  drawCenterCounter3D() {
    const rt = gameState.runtime;
    const v = rt.activeVessel;
    const hasHeldVessel = Boolean(v && v.type);
    const a = rt.assembly || { hasTray: false, hasBag: false, vessel: null, hasChopsticks: false, drink: null };
    const hasAssembled = Boolean((a.hasTray || a.hasBag) && (a.vessel || a.hasChopsticks || a.drink));
    const isCarryingOrder =
      rt.activeSector === 1 &&
      rt.cameraFocus === 'customer' &&
      (rt.customerPanSide || 0) === 0 &&
      Boolean(rt.carryingAssembly) &&
      !hasHeldVessel &&
      hasAssembled;

    // 0. ПОДСТОЛЬНЫЙ МЕТАЛЛИЧЕСКИЙ БАК-МУСОРКА СЛЕВА СПЕРЕДИ (x = -0.54, z = +0.06 — не мешает камере под прилавком!)
    const trashGlow = hasHeldVessel ? 0.45 + 0.25 * Math.sin(this.time * 5.0) : 0.1;
    const trashRimCol = hasHeldVessel ? [1.0, 0.28, 0.42] : [0.56, 0.62, 0.7];
    this.drawMesh('cylinder', -0.54, 0.56, 0.06, 0.21, 0.34, 0.21, [0.22, 0.26, 0.32], 0.06, null, 0.78);
    this.drawMesh('torus', -0.54, 0.73, 0.06, 0.218, 0.022, 0.218, trashRimCol, trashGlow, null, 0.9);
    this.drawMesh('cylinder', -0.54, 0.725, 0.06, 0.19, 0.015, 0.19, [0.06, 0.07, 0.1], 0.02, null, 0.2);
    const isCenterWorktable = rt.activeSector === 1 && rt.cameraFocus === 'worktable';
    if (isCenterWorktable) {
      this.registerHitbox('trash_bin', -0.54, 0.72, 0.06, 74);
    }

    // Анимация выбрасывания посуды из левой руки в мусорку при тапе на бак
    if (this.trashTossAnim.active && this.trashTossAnim.vessel) {
      const p = Math.min(1, this.trashTossAnim.timer / this.trashTossAnim.duration);
      const handPos = this.getLeftHandWorldPos();
      const tx = handPos[0] + (-0.54 - handPos[0]) * p;
      const tz = handPos[2] + (0.06 - handPos[2]) * p;
      const ty =
        handPos[1] * (1 - p) +
        0.58 * p +
        Math.sin(p * Math.PI) * 0.12;
      const shrink = Math.max(0.32, 0.72 * (1 - Math.max(0, p - 0.5) * 1.1));
      this.drawFilledVessel3D(tx, ty, tz, this.trashTossAnim.vessel, shrink);
    }

    // 1. ЦЕНТРАЛЬНАЯ ЗОНА СБОРКИ ЗАКАЗА (БОЛЬШОЙ ПОДНОС / ПАКЕТ + МИСКА/КОРОБКА + ПАЛОЧКИ)
    const asmX = 0.0;
    const asmY = 0.902;
    const asmZ = -0.24;

    // Если поднос на столе (и мы НЕ держим сам поднос перед клиентом — если держим пакет, то чистый поднос ОСТАЁТСЯ на столе!)
    const showStaticTray =
      a.hasTray &&
      !this.trayPlaceAnim.active &&
      !(isCarryingOrder && !a.hasBag);
    if (showStaticTray) {
      this.draw3DRamenTray(asmX, asmY, asmZ, 1.0);
    }

    // Анимация выкладывания подноса из-под прилавка на столешницу
    if (this.trayPlaceAnim.active) {
      const p = Math.min(1, this.trayPlaceAnim.timer / this.trayPlaceAnim.duration);
      const s = p * p * (3 - 2 * p);
      const tx = 0.0;
      const ty = 0.62 + (asmY - 0.62) * s + Math.sin(p * Math.PI) * 0.12;
      const tz = 0.04 + (asmZ - 0.04) * s;
      this.draw3DRamenTray(tx, ty, tz, 0.92 + 0.08 * s, [0.22 * (1 - s), 0, 0]);
      // Две перчатки по краям подноса, ставящие его на стол
      this.drawBox(tx - 0.3, ty + 0.01, tz + 0.03, 0.068, 0.036, 0.12, [0.16, 0.14, 0.24], 0.22, [0.12, -0.2, 0.1]);
      this.drawBox(tx + 0.3, ty + 0.01, tz + 0.03, 0.068, 0.036, 0.12, [0.16, 0.14, 0.24], 0.22, [0.12, 0.2, -0.1]);
    }

    // Если пакет стоит на столе/подносе (и мы не проигрываем анимацию упаковки и не держим его перед клиентом)
    const bagBaseY = a.hasTray ? asmY + 0.016 : asmY;
    const showStaticBag = a.hasBag && !this.bagPackAnim.active && !isCarryingOrder;
    const vesselFlyingIntoBag =
      this.assemblyVesselAnim.active &&
      this.assemblyVesselAnim.action === 'place' &&
      this.assemblyVesselAnim.intoBag;
    if (showStaticBag) {
      const drinkNotLandedYet =
        this.drinkPlaceAnim.active &&
        this.drinkPlaceAnim.intoBag &&
        this.drinkPlaceAnim.timer / this.drinkPlaceAnim.duration < 0.88;
      this.draw3DTakeoutBag(
        asmX,
        bagBaseY,
        asmZ,
        1.0,
        vesselFlyingIntoBag ? null : a.vessel,
        Boolean(a.hasChopsticks && !this.chopsticksPlaceAnim.active),
        false,
        null,
        drinkNotLandedYet ? null : a.drink
      );
    }

    // Анимация появления пакета из-под холодильника И ПЕРЕКЛАДЫВАНИЯ КОРОБКИ, НАПИТКА И ПАЛОЧЕК С ПОДНОСА В ПОЛЫЙ ПАКЕТ!
    if (this.bagPackAnim.active) {
      const p = Math.min(1, this.bagPackAnim.timer / this.bagPackAnim.duration);
      if (!this.bagPackAnim.hadItems) {
        const s = p * p * (3 - 2 * p);
        const bx = 0.36 + (asmX - 0.36) * s;
        const by = 0.64 + (bagBaseY - 0.64) * s + Math.sin(p * Math.PI) * 0.12;
        const bz = 0.08 + (asmZ - 0.08) * s;
        this.draw3DTakeoutBag(bx, by, bz, 1.0, false, false, false);
        this.drawBox(bx + 0.16, by + 0.24, bz + 0.04, 0.068, 0.036, 0.12, [0.16, 0.14, 0.24], 0.22, [0.15, 0.25, -0.15]);
      } else {
        if (p < 0.34) {
          const t = p / 0.34;
          const s = t * t * (3 - 2 * t);
          if (this.bagPackAnim.prevVessel) {
            this.drawFilledVessel3D(asmX - 0.13, asmY + 0.016, asmZ, this.bagPackAnim.prevVessel, 0.74);
          }
          if (this.bagPackAnim.prevDrink) {
            this.draw3DDrinkCan(asmX + 0.1, asmY + 0.016, asmZ - 0.05, this.bagPackAnim.prevDrink, 1.08);
          }
          if (this.bagPackAnim.prevChopsticks) {
            this.draw3DChopsticksPack(asmX + 0.22, asmY + 0.016, asmZ, 0.98);
          }
          const bx = 0.42 + (asmX + 0.16 - 0.42) * s;
          const by = 0.64 + (bagBaseY - 0.64) * s + Math.sin(t * Math.PI) * 0.1;
          const bz = 0.06 + (asmZ - 0.06) * s;
          this.draw3DTakeoutBag(bx, by, bz, 0.98, false, false, false);
        } else if (p < 0.76) {
          const t = (p - 0.34) / 0.42;
          const s = t * t * (3 - 2 * t);
          const bagPosX = asmX + 0.16;
          this.draw3DTakeoutBag(
            bagPosX,
            bagBaseY,
            asmZ,
            0.98,
            t > 0.8 ? this.bagPackAnim.prevVessel : false,
            t > 0.82 && this.bagPackAnim.prevChopsticks,
            false,
            null,
            t > 0.8 ? this.bagPackAnim.prevDrink : null
          );
          if (this.bagPackAnim.prevVessel && t <= 0.8) {
            const targetInBagX = bagPosX - 0.074;
            const targetInBagY = bagBaseY + 0.016;
            const vx = (asmX - 0.13) + (targetInBagX - (asmX - 0.13)) * s;
            const vy = (asmY + 0.016) + (targetInBagY - (asmY + 0.016)) * s + Math.sin(t * Math.PI) * 0.3;
            const sealP = Math.min(1, Math.max(0, (t - 0.12) / 0.48));
            this.drawFilledVessel3D(vx, vy, asmZ - 0.01 * s, this.bagPackAnim.prevVessel, 0.75, sealP);
            this.drawBox(vx - 0.08, vy + 0.06, asmZ + 0.06, 0.068, 0.036, 0.12, [0.16, 0.14, 0.24], 0.22, [0.15, -0.25, 0.15]);
          }
          if (this.bagPackAnim.prevDrink && t <= 0.8) {
            const dx = (asmX + 0.1) + (bagPosX + 0.092 - (asmX + 0.1)) * s;
            const dy = (asmY + 0.016) + (bagBaseY + 0.016 - (asmY + 0.016)) * s + Math.sin(t * Math.PI) * 0.28;
            const dz = (asmZ - 0.05) + (asmZ + 0.01 - (asmZ - 0.05)) * s;
            this.draw3DDrinkCan(dx, dy, dz, this.bagPackAnim.prevDrink, 1.08);
          }
          if (this.bagPackAnim.prevChopsticks && t <= 0.82) {
            const cx = (asmX + 0.22) + (bagPosX + 0.15 - (asmX + 0.22)) * s;
            const cy = (asmY + 0.016) + (bagBaseY + 0.24 - (asmY + 0.016)) * s + Math.sin(t * Math.PI) * 0.12;
            this.draw3DChopsticksPack(cx, cy, asmZ, 0.96, [0, 0, -0.4 * s]);
          }
        } else {
          const t = (p - 0.76) / 0.24;
          const s = t * t * (3 - 2 * t);
          const bx = (asmX + 0.16) + (asmX - (asmX + 0.16)) * s;
          this.draw3DTakeoutBag(bx, bagBaseY, asmZ, 1.0, a.vessel, Boolean(a.hasChopsticks), false, null, a.drink);
        }
      }
    }

    // Блюдо, напиток и палочки, лежащие непосредственно НА ПОДНОСЕ (тарелка слева, банка и палочки справа!)
    if (!a.hasBag && a.hasTray && !this.bagPackAnim.active && !isCarryingOrder) {
      const vesselOnTrayX = asmX - 0.13;
      const vesselOnTrayY = asmY + 0.016;
      if (a.vessel && !(this.assemblyVesselAnim.active && this.assemblyVesselAnim.action === 'place')) {
        this.drawFilledVessel3D(vesselOnTrayX, vesselOnTrayY, asmZ, a.vessel, 0.76);
      }
      const drinkNotLandedOnTray =
        this.drinkPlaceAnim.active &&
        !this.drinkPlaceAnim.intoBag &&
        this.drinkPlaceAnim.timer / this.drinkPlaceAnim.duration < 0.88;
      if (a.drink && !drinkNotLandedOnTray) {
        this.draw3DDrinkCan(asmX + 0.1, asmY + 0.016, asmZ - 0.05, a.drink, 1.12);
      }
      if (a.hasChopsticks && !this.chopsticksPlaceAnim.active) {
        this.draw3DChopsticksPack(asmX + 0.22, asmY + 0.016, asmZ, 1.02);
      }
    }

    // Анимация постановки посуды из левой руки на поднос (ближе к левому краю!) или внутрь полого пакета (с запечатыванием коробки!)
    if (this.assemblyVesselAnim.active && this.assemblyVesselAnim.vessel && this.assemblyVesselAnim.action === 'place') {
      const p = Math.min(1, this.assemblyVesselAnim.timer / this.assemblyVesselAnim.duration);
      const s = p * p * (3 - 2 * p);
      const handPos = this.getLeftHandWorldPos();
      const intoBag = Boolean(this.assemblyVesselAnim.intoBag);
      const targetX = intoBag ? asmX - 0.075 : asmX - 0.13;
      const targetY = intoBag ? bagBaseY + 0.016 : asmY + 0.017;
      const targetZ = intoBag ? asmZ - 0.01 : asmZ;
      const arcH = intoBag ? 0.28 : 0.08;
      const vx = handPos[0] + (targetX - handPos[0]) * s;
      const vy = handPos[1] + (targetY - handPos[1]) * s + Math.sin(p * Math.PI) * arcH;
      const vz = handPos[2] + (targetZ - handPos[2]) * s;
      const vsc = intoBag ? 0.64 + 0.14 * s : 0.64 + 0.12 * s;
      const sealP = intoBag ? Math.min(1, Math.max(0, (p - 0.22) / 0.55)) : 0;
      this.drawFilledVessel3D(vx, vy, vz, this.assemblyVesselAnim.vessel, vsc, sealP);
    }

    // Анимация переноса палочек Варибаси из зоны мисок и коробок (x=0.60, z=-0.36) на поднос или внутрь полого пакета!
    if (this.chopsticksPlaceAnim.active) {
      const p = Math.min(1, this.chopsticksPlaceAnim.timer / this.chopsticksPlaceAnim.duration);
      const s = p * p * (3 - 2 * p);
      const startX = 0.6;
      const startY = 1.03;
      const startZ = -0.36;
      const targetX = a.hasBag ? asmX + 0.16 : asmX + 0.22;
      const targetY = a.hasBag ? bagBaseY + 0.22 : asmY + 0.017;
      const cx = startX + (targetX - startX) * s;
      const cy = startY + (targetY - startY) * s + Math.sin(p * Math.PI) * 0.14;
      const cz = startZ + (asmZ - startZ) * s;
      this.draw3DChopsticksPack(cx, cy, cz, 1.0, [0, 0, (1 - s) * 0.6]);
      this.drawBox(cx + 0.05, cy + 0.03, cz + 0.05, 0.066, 0.034, 0.11, [0.16, 0.14, 0.24], 0.22, [0.15, 0.25, -0.15]);
    }

    if (isCenterWorktable && (a.hasTray || a.hasBag)) {
      this.registerHitbox('assembly_zone', asmX, asmY + 0.08, asmZ, 116);
    }

    // 2. 6 УВЕЛИЧЕННЫХ И ВЫСОКОДЕТАЛИЗИРОВАННЫХ 3D-ГАСТРОЕМКОСТЕЙ (GN-КОНТЕЙНЕРОВ) В 2 ШИРОКИХ РЯДА
    // Контейнеры стали шире и крупнее (шаг по X = 0.28, ширина каждого 0.255, глубина 0.19),
    // со стальными отбортованными фланцами, угловыми фасками, маринадом на дне и пышной выкладкой ингредиентов!
    const trayPositions = [
      { id: 'egg', x: -0.28, by: 1.0, z: -0.85 },
      { id: 'chashu', x: 0.0, by: 1.0, z: -0.85 },
      { id: 'nori', x: 0.28, by: 1.0, z: -0.85 },
      { id: 'scallion', x: -0.28, by: 0.94, z: -0.62 },
      { id: 'shrimp', x: 0.0, by: 0.94, z: -0.62 },
      { id: 'chili', x: 0.28, by: 0.94, z: -0.62 }
    ];

    const unlockedTop = gameState.getUnlockedToppings();
    const maxCap = gameState.getMaxTrayCap();

    // Цвет подложки/маринада на дне каждого контейнера
    const trayBaseColors = {
      egg: [0.18, 0.11, 0.07],      // тёмный соевый маринад аджитама
      chashu: [0.16, 0.09, 0.08],   // мясной глянец
      nori: [0.06, 0.09, 0.08],     // сухое тёмно-изумрудное дно
      scallion: [0.06, 0.12, 0.08], // свежая зелень на дне
      shrimp: [0.14, 0.11, 0.06],   // золотистая крошка темпура
      chili: [0.42, 0.05, 0.07]     // густая огненная паста чили
    };

    for (const tp of trayPositions) {
      const isUnlocked = unlockedTop.includes(tp.id);
      const stock = gameState.persistent.trayStock[tp.id] ?? 0;
      const ratio = isUnlocked ? stock / maxCap : 0;
      const by = tp.by;
      const tw = 0.255;
      const td = 0.19;

      // 1) Основной глубокий корпус стальной гастроемкости
      this.drawBox(tp.x, by + 0.012, tp.z, tw, 0.048, td, [0.27, 0.32, 0.4], 0.07, null, 0.75);

      // 2) Широкий хромированный отбортованный фланец (бортики настоящей гастроемкости GN по периметру!)
      const rimCol = [0.54, 0.6, 0.68];
      const rimY = by + 0.037;
      this.drawBox(tp.x, rimY, tp.z - td * 0.47, tw + 0.014, 0.008, 0.018, rimCol, 0.12, null, 0.92);
      this.drawBox(tp.x, rimY, tp.z + td * 0.47, tw + 0.014, 0.008, 0.018, rimCol, 0.12, null, 0.92);
      this.drawBox(tp.x - tw * 0.47, rimY, tp.z, 0.018, 0.008, td, rimCol, 0.12, null, 0.92);
      this.drawBox(tp.x + tw * 0.47, rimY, tp.z, 0.018, 0.008, td, rimCol, 0.12, null, 0.92);

      // 3) Внутреннее углубление гастроемкости с маринадом/соусом на дне
      const innerCol = trayBaseColors[tp.id] || [0.08, 0.09, 0.14];
      this.drawBox(tp.x, by + 0.026, tp.z, tw - 0.028, 0.022, td - 0.028, innerCol, tp.id === 'chili' ? 0.25 : 0.05, null, 0.6);

      // 4) Диегетический 3D-неоновый индикатор запаса в металлической оправе на переднем бортике
      if (isUnlocked) {
        const barCol =
          stock === 0
            ? [1.0, 0.15, 0.28]
            : ratio <= 0.35
              ? [1.0, 0.68, 0.0]
              : [0.06, 0.96, 0.42];
        const maxBarW = tw - 0.04;
        const barW = stock === 0 ? maxBarW : Math.max(0.032, maxBarW * ratio);
        const barGlow = stock === 0 ? 0.5 + 0.5 * Math.sin(this.time * 10) : 0.88;
        this.drawBox(tp.x, rimY + 0.005, tp.z + td * 0.47, barW, 0.009, 0.01, barCol, barGlow);
      }

      if (!isUnlocked) {
        // Если топпинг ещё закрыт (например, креветка до покупки апгрейда) — стальная крышка гастроемкости с ручкой!
        this.drawBox(tp.x, rimY + 0.006, tp.z, tw - 0.006, 0.01, td - 0.006, [0.38, 0.43, 0.52], 0.08, null, 0.85);
        this.drawBox(tp.x, rimY + 0.02, tp.z, 0.065, 0.018, 0.016, [0.62, 0.68, 0.76], 0.12, null, 0.9);
      } else if (stock > 0) {
        if (tp.id === 'egg') {
          // До 6 крупных глянцевых половинок яиц Аджитама в 2 ряда по 3 штуки!
          const visibleEggs = Math.max(1, Math.ceil(ratio * 6));
          const eggSlots = [
            [-0.068, -0.036, 0.25],
            [0.0, -0.038, -0.2],
            [0.068, -0.034, 0.35],
            [-0.066, 0.034, -0.3],
            [0.0, 0.036, 0.15],
            [0.066, 0.034, -0.25]
          ];
          for (let k = 0; k < visibleEggs; k++) {
            const [ox, oz, ry] = eggSlots[k];
            this.draw3DAjitamaEggHalf(tp.x + ox, by + 0.03, tp.z + oz, 0.84, ry);
          }
        } else if (tp.id === 'chashu') {
          // 2 ряда сочных мраморных ломтиков свинины Тяшу, уложенных аппетитной черепицей!
          const visibleSlices = Math.max(1, Math.ceil(ratio * 6));
          const chashuSlots = [
            [-0.048, -0.042, 0.15],
            [-0.045, 0.0, 0.1],
            [-0.042, 0.042, 0.05],
            [0.046, -0.042, -0.15],
            [0.045, 0.0, -0.1],
            [0.042, 0.042, -0.05]
          ];
          for (let k = 0; k < visibleSlices; k++) {
            const [ox, oz, ry] = chashuSlots[k];
            this.draw3DChashuSlice(
              tp.x + ox,
              by + 0.044 + (k % 3) * 0.005,
              tp.z + oz,
              0.84,
              [0.42, ry, 0]
            );
          }
        } else if (tp.id === 'nori') {
          // Плотная пачка из 6 широких рифлёных листов водорослей Нори веером в 2 ряда!
          const visibleNori = Math.max(2, Math.ceil(ratio * 6));
          for (let k = 0; k < visibleNori; k++) {
            const col = k % 3;
            const row = Math.floor(k / 3);
            this.draw3DNoriSheet(
              tp.x - 0.052 + col * 0.052,
              by + 0.082,
              tp.z - 0.028 + row * 0.038,
              0.92,
              [-0.24 + row * 0.06, (col - 1) * 0.12, 0]
            );
          }
        } else if (tp.id === 'scallion') {
          // Пышная гора из 22 сочных зелёных и салатовых колечек лука по всей площади лотка!
          const ringCount = Math.max(5, Math.ceil(ratio * 22));
          for (let k = 0; k < ringCount; k++) {
            const a = k * 2.39996;
            const rad = Math.sqrt(k / ringCount) * 0.082;
            this.draw3DScallionRing(
              tp.x + Math.cos(a) * rad * 1.15,
              by + 0.042 + (k % 4) * 0.007,
              tp.z + Math.sin(a) * rad * 0.82,
              0.92,
              [0.25 * Math.sin(k), a, -0.2 * Math.cos(k)]
            );
          }
        } else if (tp.id === 'shrimp') {
          // До 5 крупных золотистых королевских креветок Темпура с красными хвостиками!
          const count = Math.max(1, Math.ceil(ratio * 5));
          const shrimpSlots = [
            [-0.048, -0.036, 0.25],
            [0.048, -0.036, -0.2],
            [0.0, 0.0, 0.1],
            [-0.046, 0.038, 0.3],
            [0.046, 0.038, -0.15]
          ];
          for (let k = 0; k < count; k++) {
            const [ox, oz, yaw] = shrimpSlots[k];
            this.draw3DTempuraShrimp(tp.x + ox, by + 0.044 + (k % 2) * 0.006, tp.z + oz, 0.88, yaw);
          }
        } else if (tp.id === 'chili') {
          // В широком контейнере Чили: густая красная паста чили с зёрнышками перца,
          // торчащая стальная ложка И диспенсер-бутылка острого соуса!
          this.drawBox(tp.x - 0.025, by + 0.036, tp.z, 0.14, 0.012, 0.13, [0.86, 0.1, 0.14], 0.45, null, 0.85, 4);
          // Стальная ручка ложки, торчащая из чили-пасты (как на референс-скриншоте!)
          this.drawBox(tp.x - 0.045, by + 0.068, tp.z - 0.02, 0.014, 0.085, 0.01, [0.75, 0.8, 0.88], 0.2, [0.45, 0.2, -0.35], 0.9);

          const armed = rt.sauceModeArmed;
          const tilt = armed ? [0.35, 0, -0.45] : null;
          const bx = tp.x + 0.055;
          this.drawMesh(
            'cylinder',
            bx,
            by + 0.09,
            tp.z + 0.01,
            0.076,
            0.125,
            0.076,
            [0.96, 0.12, 0.22],
            armed ? 0.92 : 0.48,
            tilt,
            0.78,
            0
          );
          this.drawMesh(
            'cylinder',
            bx,
            by + 0.162,
            tp.z + 0.01,
            0.054,
            0.022,
            0.054,
            [0.96, 0.96, 0.98],
            0.3,
            tilt,
            0.5,
            0
          );
          this.drawMesh(
            'cone',
            bx,
            by + 0.196,
            tp.z + 0.01,
            0.036,
            0.052,
            0.036,
            [1.0, 0.25, 0.1],
            0.75,
            tilt,
            0.6,
            0
          );
        }
      } else if (isUnlocked && stock === 0) {
        const blink = 0.5 + 0.5 * Math.sin(this.time * 8);
        this.drawBox(tp.x, by + 0.036, tp.z, tw - 0.04, 0.01, td - 0.04, [1.0, 0.18, 0.3], blink);
      }

      if (isUnlocked && isCenterWorktable) {
        this.registerHitbox(`topping_${tp.id}`, tp.x, by + 0.06, tp.z, 64);
      }
    }

    // 3. СКУЛЬПТУРНЫЙ 3D НЕОНОВЫЙ КОТИК МАНЭКИ-НЭКО НА БОРТИКЕ СЛЕВА (x = -0.25, y = 1.07, z = -1.05)
    // Стоит прямо на левом краю заднего бортика прилавка — отлично виден в кадре и когда камера на покупателе, и когда на столе!
    const catX = -0.25;
    const catBaseY = 1.07;
    const catZ = -1.05;
    const catReady = rt.pacifierCooldown <= 0;
    const catGlow = catReady ? 0.85 : 0.2;

    // Туловище котика + красный ошейник с золотым бубенчиком + монетка кобан на животике
    this.drawMesh('cylinder', catX, catBaseY + 0.055, catZ, 0.105, 0.11, 0.09, [1.0, 0.84, 0.22], catGlow * 0.45, null, 0.85, 0);
    this.drawMesh('cylinder', catX, catBaseY + 0.105, catZ, 0.096, 0.018, 0.086, [0.95, 0.12, 0.25], 0.65);
    this.drawMesh('sphere', catX, catBaseY + 0.102, catZ + 0.046, 0.024, 0.024, 0.024, [1.0, 0.92, 0.3], 0.9);
    this.drawBox(catX, catBaseY + 0.055, catZ + 0.045, 0.042, 0.058, 0.008, [1.0, 0.95, 0.65], 0.75);

    // Голова котика с неоновыми ушками и светящимися глазками
    this.drawMesh('sphere', catX, catBaseY + 0.155, catZ, 0.098, 0.092, 0.092, [1.0, 0.86, 0.25], catGlow * 0.55, null, 0.85, 0);
    this.drawMesh('cone', catX - 0.032, catBaseY + 0.22, catZ, 0.034, 0.046, 0.034, [1.0, 0.16, 0.52], catGlow);
    this.drawMesh('cone', catX + 0.032, catBaseY + 0.22, catZ, 0.034, 0.046, 0.034, [1.0, 0.16, 0.52], catGlow);
    this.drawMesh('sphere', catX - 0.02, catBaseY + 0.162, catZ + 0.042, 0.014, 0.014, 0.01, [0.0, 0.96, 0.83], 0.95);
    this.drawMesh('sphere', catX + 0.02, catBaseY + 0.162, catZ + 0.042, 0.014, 0.014, 0.01, [0.0, 0.96, 0.83], 0.95);

    // Машущая лапка удачи
    const pawWave = Math.sin(this.time * 6) * 0.48;
    this.drawMesh('cylinder', catX + 0.054, catBaseY + 0.125, catZ + 0.035, 0.028, 0.085, 0.028, [1.0, 0.95, 0.82], catGlow, [pawWave, 0, 0]);
    if (rt.activeSector === 1 && (rt.cameraFocus === 'worktable' || (rt.customerPanSide || 0) === 0)) {
      this.registerHitbox('pacifier_cat', catX, catBaseY + 0.13, catZ, 52);
    }

    // 4. ГРЯЗНЫЕ МИСКИ НА ПРАВОЙ ВЕРХНЕЙ ПОЛКЕ ПРИЛАВКА (ВСТАВЛЯЮТСЯ ОДНА В ДРУГУЮ ПОД НАКЛОНОМ, КАК В ЖИЗНИ!):
    // - Первый ряд (3 нижние миски, индексы 0..2) стоят ПЛОСКО на полке (rx = 0, rz = 0), НЕ в одну линию и на разном расстоянии друг от друга;
    // - Второй ряд (индексы 3..5): 4-я миска вставляется прямо ВНУТРЬ 1-й грязной миски под углом/наклоном (одна в другую, упираясь в палочки и дно!),
    //   5-я миска вставляется внутрь 2-й под наклоном, 6-я — внутрь 3-й под наклоном;
    // - Третий и четвёртый ярусы (индексы 6..9) продолжают вкладываться одна в другую поверх второго ряда с живым чередованием наклона!
    const pyramidSlots = [
      // 1-й ряд (основание из 3 мисок): стоят абсолютно плоско (rx=0, rz=0), вразнобой по глубине dz и с разным шагом по dx
      { dx: -0.2, dy: 0.0, dz: 0.036, rot: [0.0, 0.35, 0.0] },
      { dx: 0.03, dy: 0.0, dz: -0.042, rot: [0.0, -0.55, 0.0] },
      { dx: 0.18, dy: 0.0, dz: 0.024, rot: [0.0, 0.75, 0.0] },
      // 2-й ряд: каждая следующая миска вставлена ВНУТРЬ соответствующей миски 1-го ряда (одна в другую, dy=0.034) под наклоном!
      { dx: -0.2 + 0.015, dy: 0.034, dz: 0.036 - 0.01, rot: [0.22, -0.48, -0.26] },
      { dx: 0.03 - 0.014, dy: 0.035, dz: -0.042 + 0.012, rot: [-0.21, 0.52, 0.25] },
      { dx: 0.18 + 0.013, dy: 0.034, dz: 0.024 - 0.011, rot: [0.2, 0.85, -0.24] },
      // 3-й ряд: вставляются одна в другую поверх мисок 2-го ряда с наклоном в другую сторону (dy=0.068)
      { dx: -0.2 - 0.008, dy: 0.068, dz: 0.036 + 0.006, rot: [-0.19, 0.32, 0.24] },
      { dx: 0.03 + 0.011, dy: 0.069, dz: -0.042 - 0.006, rot: [0.23, -0.65, -0.25] },
      { dx: 0.18 - 0.009, dy: 0.068, dz: 0.024 + 0.007, rot: [-0.21, 0.25, 0.23] },
      // 10-я миска (4-й ярус): вложена внутрь центральной стопки под наклоном (dy=0.103)
      { dx: 0.03 - 0.01, dy: 0.103, dz: -0.042 + 0.008, rot: [-0.24, 0.7, 0.27] }
    ];

    const leftList = rt.dirtyShelfLeft || [];
    const shelfCenterX = -0.68;
    const shelfBaseY = 1.078;
    const shelfCenterZ = -1.04;
    for (let i = 0; i < leftList.length; i++) {
      const slot = pyramidSlots[i % pyramidSlots.length];
      const extraTier = Math.floor(i / pyramidSlots.length) * 0.045;
      this.drawDirtyBowl3D(
        shelfCenterX + slot.dx,
        shelfBaseY + slot.dy + extraTier,
        shelfCenterZ + slot.dz,
        leftList[i].broth,
        0.48,
        slot.rot
      );
    }
    if (
      leftList.length > 0 &&
      rt.activeSector === 1 &&
      rt.cameraFocus === 'customer' &&
      (rt.customerPanSide || 0) === -1
    ) {
      // Хитбокс сбора грязных мисок активен ТОЛЬКО когда камера направлена на левую верхнюю полку (слева от котика)!
      this.registerHitbox('dirty_bowl_left', shelfCenterX, 1.15, shelfCenterZ, 108);
    }

    // Анимация руки, забирающей верхнюю грязную миску с левой полки в мойку
    if (this.collectDirtyAnim.active && this.collectDirtyAnim.bowl) {
      const p = Math.min(1, this.collectDirtyAnim.timer / this.collectDirtyAnim.duration);
      const s = p * p * (3 - 2 * p);
      const startX = shelfCenterX;
      const targetX = -0.94;
      const bx = startX + (targetX - startX) * s;
      const by = 1.14 + Math.sin(p * Math.PI) * 0.1 - s * 0.16;
      const bz = -1.04 + s * 0.72;
      this.drawDirtyBowl3D(
        bx,
        by,
        bz,
        this.collectDirtyAnim.bowl.broth,
        0.48 * (1 - p * 0.25),
        [0.2 * (1 - p), 0.4 * p, -0.25 * (1 - p)]
      );
      this.drawBox(bx + 0.06, by + 0.03, bz + 0.08, 0.07, 0.044, 0.13, [0.16, 0.14, 0.24], 0.22, [0.2, 0.2, 0]);
      this.drawBox(bx + 0.06, by + 0.055, bz + 0.08, 0.074, 0.012, 0.04, [0.0, 0.96, 0.83], 0.92, [0.2, 0.2, 0]);
    }
  }

  // 3D-модель грязной миски после еды (с поддержкой наклона rot для пирамиды из грязной посуды!)
  drawDirtyBowl3D(x, y, z, brothId = 'tonkotsu', s = 0.5, rot = null) {
    const rx = rot ? rot[0] : 0;
    const ry = rot ? rot[1] : 0;
    const rz = rot ? rot[2] : 0;
    this.drawMesh('bowl_lathe', x, y, z, 0.42 * s, 0.165 * s, 0.42 * s, [0.15, 0.1, 0.23], 0.08, [rx, ry, rz], 0.7, 3);
    const bMap = {
      tonkotsu: [0.76, 0.58, 0.34],
      chili_broth: [0.78, 0.18, 0.14],
      miso_mushroom: [0.52, 0.16, 0.74]
    };
    const bCol = bMap[brothId] || bMap.tonkotsu;
    // Остатки бульона и капли на дне наклонённой миски
    this.drawMesh(
      'cylinder',
      x - Math.sin(rz) * 0.04 * s,
      y + 0.042 * s,
      z + Math.sin(rx) * 0.04 * s,
      0.23 * s,
      0.015 * s,
      0.23 * s,
      bCol,
      0.25,
      [rx, ry, rz],
      0.85,
      4
    );
    this.draw3DScallionRing(x + 0.035 * s, y + 0.055 * s, z - 0.02 * s, 0.65 * s, [rx + 0.2, ry + 0.5, rz]);
    // Использованные бамбуковые палочки «Варибаси», торчащие под углом из грязной миски
    const stickY = y + 0.155 * s;
    this.drawBox(x, stickY, z - 0.016 * s, 0.44 * s, 0.012 * s, 0.012 * s, [0.85, 0.72, 0.5], 0.1, [rx, ry + 0.24, rz]);
    this.drawBox(x, stickY, z + 0.016 * s, 0.44 * s, 0.012 * s, 0.012 * s, [0.85, 0.72, 0.5], 0.1, [rx, ry + 0.08, rz]);
  }

  // =========================================================================
  // СЕКТОР 0 (ВАРКА В 3D): ПРОФЕССИОНАЛЬНАЯ ЯПОНСКАЯ ПЛИТА «ЮДЭМЭНКИ» (ТЕБО-ГАМА)
  // + 3 БОЛЬШИХ КАСТРЮЛИ-КОТЛА «ЗУНДО-НАБЭ» НА ГАЗОВО-ПЛАЗМЕННЫХ ГОРЕЛКАХ!
  // =========================================================================
  drawLeftBoilerStation3D() {
    const rt = gameState.runtime;
    const unlockedBaskets = gameState.getUnlockedBasketCount();
    const unlockedBroths = gameState.getUnlockedBroths();
    const flameFlicker = 0.82 + 0.18 * Math.sin(this.time * 24.0);

    // 0. ПРОМЫШЛЕННЫЙ КОРПУС ВАРОЧНОЙ ПЛИТЫ ИЗ НЕРЖАВЕЙКИ НА ЛЕВОЙ СТОЛЕШНИЦЕ
    // Включает паровую ванну для лапши (дальняя линия x = -1.05), чугунную панель конфорок под кастрюли (ближняя линия x = -0.68),
    // газовую магистраль из латуни и переднюю панель с поворотными кранами-вентилями пламени!
    this.drawBox(-0.87, 0.905, -0.16, 0.78, 0.042, 1.06, [0.22, 0.26, 0.33], 0.06, null, 0.78);
    // Утопленная паровая дека раменного бойлера «Юдэмэнки» под 3 корзины
    this.drawBox(-1.05, 0.928, -0.16, 0.34, 0.035, 1.0, [0.3, 0.35, 0.43], 0.08, null, 0.85);
    // Разделительный стальной бортик между бойлером лапши и конфорками бульонов
    this.drawBox(-0.87, 0.945, -0.16, 0.025, 0.04, 1.02, [0.48, 0.54, 0.62], 0.1, null, 0.9);
    // Латунно-медная газовая труба-рампа вдоль переднего края плиты + 6 поворотных вентилей жара
    this.drawMesh('cylinder', -0.49, 0.915, -0.16, 0.022, 1.02, 0.022, [0.82, 0.58, 0.24], 0.2, [Math.PI * 0.5, 0, 0], 0.88);

    // 1. ДАЛЬНИЙ РЯД (x = -1.05): 3 ГЛУБОКИХ ПАРОВЫХ ГНЕЗДА С СЕТЧАТЫМИ КОРЗИНАМИ «ТЭБО» ДЛЯ ЛАПШИ
    // Никакой цветной неоновой подсветки на гнезде и сотейничке — чистая полированная нержавейка!
    for (let i = 0; i < 3; i++) {
      const bz = -0.48 + i * 0.32;
      const bx = -1.05;
      const b = rt.baskets[i];
      const isUnlocked = i < unlockedBaskets;

      // Стальное уплотнительное кольцо гнезда бойлера (без подсветки)
      this.drawMesh('torus', bx, 0.942, bz, 0.24, 0.02, 0.24, [0.28, 0.32, 0.38], 0.05, null, 0.85);

      // Стальное гнездо варочного котла из матовой нержавейки (без подсветки)
      this.drawMesh('pot_lathe', bx, 0.92, bz, 0.245, 0.095, 0.245, [0.38, 0.43, 0.5], 0.06, null, 0.85, 0);

      if (isUnlocked) {
        // Горячая вода внутри гнезда бойлера
        this.drawMesh('cylinder', bx, 0.99, bz, 0.195, 0.022, 0.195, [0.22, 0.46, 0.58], 0.18, null, 0.9, 4);

        const isDumpingThisBasket =
          this.pourAnim.active &&
          this.pourAnim.type === 'noodles' &&
          this.pourAnim.basketIndex === i;

        if (!isDumpingThisBasket) {
          // 1) 'empty' -> сотейник с сырой лапшой стоит над водой (1.095)
          // 2) 'boiling' | 'aldente' | 'overcooked' -> опущен в кипящую воду (0.985)
          // 3) 'lifted' | 'aldente_locked' -> достали из кастрюли наверх (1.135), ждёт 3-го тапа для сброса в миску/коробку!
          const isLiftedCooked = b.state === 'lifted' || b.state === 'aldente_locked';
          const liftY =
            b.state === 'empty'
              ? 1.095
              : isLiftedCooked
                ? 1.135
                : 0.985 + Math.sin(this.time * 14 + i) * 0.006;

          // Металлическая сетчатая корзина-сотейничек «Тэбо» (uPattern=5) + стальной ободок + деревянная ручка (без неоновой подсветки!)
          this.drawMesh(
            'cylinder',
            bx,
            liftY,
            bz,
            0.168,
            0.11,
            0.168,
            [0.74, 0.78, 0.84],
            0.06,
            null,
            0.85,
            5
          );
          this.drawMesh('torus', bx, liftY + 0.055, bz, 0.172, 0.028, 0.172, [0.58, 0.64, 0.72], 0.08, null, 0.92);
          // Металлический кронштейн и деревянная ручка «Тэбо»
          this.drawBox(bx + 0.1, liftY + 0.055, bz, 0.05, 0.014, 0.022, [0.7, 0.75, 0.82], 0.08, [0, 0, -0.35], 0.9);
          this.drawMesh(
            'cylinder',
            bx + 0.175,
            liftY + 0.075,
            bz,
            0.03,
            0.19,
            0.03,
            [0.68, 0.4, 0.18],
            0.05,
            [0, 0, -1.22],
            0.4
          );

          // Лапша внутри сотейничка (сырая до варки, варящаяся в воде и готовая после поднятия!)
          const nQuality = isLiftedCooked ? (b.cookedQuality || 'aldente') : b.state;
          const nCol =
            b.state === 'empty'
              ? [0.95, 0.9, 0.74]
              : nQuality === 'aldente' || nQuality === 'aldente_locked'
                ? [0.96, 0.84, 0.42]
                : nQuality === 'overcooked' || nQuality === 'over'
                  ? [0.68, 0.48, 0.3]
                  : [0.98, 0.92, 0.68];
          for (let n = -2; n <= 2; n++) {
            this.drawMesh(
              'wavy_noodle',
              bx + n * 0.022,
              liftY + 0.024,
              bz,
              0.085,
              0.024,
              0.125,
              nCol,
              0.15,
              [0, n * 0.35, 0]
            );
          }
        }

        if (rt.activeSector === 0) {
          this.registerHitbox(`basket_${i}`, bx, 1.05, bz, 72);
        }
      } else {
        // Неактивное гнездо закрыто стальной заглушкой
        this.drawMesh('cylinder', bx, 1.01, bz, 0.21, 0.015, 0.21, [0.32, 0.36, 0.44], 0.05, null, 0.8);
      }
    }

    // 2. БЛИЖНИЙ РЯД (x = -0.66): 3 КРУПНЫХ МЕТАЛЛИЧЕСКИХ ЧАНА «ЗУНДО-НАБЭ» НА ГАЗОВО-ПЛАЗМЕННЫХ КОНФОРКАХ!
    const brothKeys = ['tonkotsu', 'chili_broth', 'miso_mushroom'];
    const brothColors = {
      tonkotsu: [0.92, 0.74, 0.44],
      chili_broth: [0.95, 0.18, 0.2],
      miso_mushroom: [0.68, 0.18, 0.92]
    };
    const flameColors = {
      tonkotsu: [0.0, 0.82, 1.0],
      chili_broth: [1.0, 0.38, 0.08],
      miso_mushroom: [0.65, 0.25, 1.0]
    };

    brothKeys.forEach((bId, idx) => {
      const pz = -0.48 + idx * 0.32;
      const px = -0.66;
      const isUnlocked = unlockedBroths.includes(bId);
      const isSelected = rt.activeVessel.broth === bId;
      const fCol = flameColors[bId] || [0.0, 0.82, 1.0];

      // 1) Поворотная ручка-вентиль конфорки на переднем краю плиты (x = -0.47) со светящимся индикатором мощности
      this.drawMesh(
        'cylinder',
        -0.47,
        0.922,
        pz,
        0.042,
        0.022,
        0.042,
        [0.16, 0.19, 0.25],
        0.1,
        [0, 0, Math.PI * 0.5],
        0.8
      );
      this.drawBox(
        -0.455,
        0.928,
        pz,
        0.014,
        0.024,
        0.008,
        isUnlocked ? fCol : [0.4, 0.42, 0.46],
        isUnlocked ? 0.92 : 0.1
      );

      // 2) Чугунная конфорка-горелка с крестовинами решётки (Готоку) и живым кольцом газово-плазменного пламени под кастрюлей!
      this.drawMesh('cylinder', px, 0.925, pz, 0.25, 0.02, 0.25, [0.12, 0.14, 0.18], 0.05, null, 0.5);
      // 4 чугунные лапки-крестовины конфорки, на которых стоит кастрюля
      this.drawBox(px, 0.938, pz, 0.29, 0.016, 0.024, [0.18, 0.2, 0.26], 0.08, null, 0.6);
      this.drawBox(px, 0.938, pz, 0.024, 0.016, 0.29, [0.18, 0.2, 0.26], 0.08, null, 0.6);

      // Яркое кольцо горящего пламени под дном кастрюли (пульсирует!)
      if (isUnlocked) {
        this.drawMesh(
          'torus',
          px,
          0.942,
          pz,
          0.225,
          0.028,
          0.225,
          fCol,
          0.92 * flameFlicker
        );
        // Языки пламени по кругу горелки
        for (let f = 0; f < 8; f++) {
          const fa = (f / 8) * Math.PI * 2 + this.time * 2.5;
          const fx = px + Math.cos(fa) * 0.125;
          const fz = pz + Math.sin(fa) * 0.125;
          this.drawMesh('cone', fx, 0.952, fz, 0.022, 0.032 * flameFlicker, 0.022, fCol, 0.95);
        }
      }

      // 3) Увеличенный широкий чан «Зундо-набэ» из полированной стали (диаметр 0.285, высота 0.165) — без неоновой подсветки при тапе!
      this.drawMesh(
        'pot_lathe',
        px,
        0.945,
        pz,
        0.285,
        0.165,
        0.285,
        [0.42, 0.47, 0.56],
        0.1,
        null,
        0.92,
        0
      );
      // Верхний хромированный ободок кастрюли и две боковые клепаные ручки-скобы (без подсветки при выборе)
      this.drawMesh('torus', px, 1.105, pz, 0.285, 0.022, 0.285, [0.64, 0.7, 0.78], 0.18, null, 0.95);
      this.drawBox(px, 1.065, pz - 0.152, 0.065, 0.018, 0.032, [0.58, 0.64, 0.72], 0.15, null, 0.9);
      this.drawBox(px, 1.065, pz + 0.152, 0.065, 0.018, 0.032, [0.58, 0.64, 0.72], 0.15, null, 0.9);

      if (isUnlocked) {
        // 4) Наваристый бурлящий бульон внутри большой кастрюли + плавающие ингредиенты и большой половник!
        const boilBob = Math.sin(this.time * 5.0 + idx) * 0.003;
        this.drawMesh(
          'cylinder',
          px,
          1.08 + boilBob,
          pz,
          0.24,
          0.025,
          0.24,
          brothColors[bId],
          0.48,
          null,
          0.92,
          4
        );

        // Внутри кастрюли томятся кусочки ингредиентов и поднимаются пузырьки (как в большой кастрюле на скриншоте!)
        if (bId === 'tonkotsu') {
          this.drawMesh('wavy_noodle', px - 0.03, 1.092 + boilBob, pz - 0.02, 0.11, 0.018, 0.12, [0.98, 0.88, 0.52], 0.35, [0, 0.5, 0]);
          this.draw3DChashuSlice(px + 0.045, 1.092 + boilBob, pz + 0.03, 0.68, [0.1, 0.4, 0]);
          this.draw3DScallionRing(px - 0.02, 1.096 + boilBob, pz + 0.045, 0.75, [0.1, 0.2, 0]);
        } else if (bId === 'chili_broth') {
          this.drawMesh('cone', px - 0.04, 1.095 + boilBob, pz + 0.02, 0.022, 0.055, 0.022, [1.0, 0.1, 0.15], 0.75, [1.2, 0.4, 0]);
          this.drawMesh('cone', px + 0.035, 1.095 + boilBob, pz - 0.03, 0.022, 0.055, 0.022, [1.0, 0.15, 0.1], 0.75, [-1.1, -0.5, 0]);
        } else {
          this.drawMesh('hemisphere', px - 0.035, 1.09 + boilBob, pz + 0.02, 0.052, 0.028, 0.052, [0.45, 0.28, 0.55], 0.4);
          this.draw3DScallionRing(px + 0.035, 1.096 + boilBob, pz - 0.025, 0.75, [0.1, 0.5, 0]);
        }

        // Крупный стальной половник с загнутой ручкой, опирающийся на бортик кастрюли (если сейчас не черпаем из этой кастрюли)
        const isPouringThisPot =
          this.pourAnim.active &&
          this.pourAnim.type === 'broth' &&
          this.pourAnim.potIndex === idx;
        if (!isPouringThisPot) {
          this.drawMesh('hemisphere', px + 0.025, 1.1 + boilBob, pz, 0.078, 0.038, 0.078, [0.88, 0.92, 0.96], 0.22, [Math.PI, 0, 0], 0.95);
          this.drawMesh('cylinder', px + 0.088, 1.175, pz, 0.018, 0.165, 0.018, [0.88, 0.92, 0.96], 0.28, [0, 0, -0.55], 0.95);
        }

        if (rt.activeSector === 0) {
          this.registerHitbox(`broth_${bId}`, px, 1.06, pz, 76);
        }
      } else {
        // Если бульон ещё не открыт апгрейдом — кастрюля накрыта стальной крышкой с ручкой (как дальняя кастрюля на скриншоте!)
        this.drawMesh('cylinder', px, 1.112, pz, 0.268, 0.016, 0.268, [0.46, 0.52, 0.6], 0.1, null, 0.88);
        this.drawBox(px, 1.132, pz, 0.075, 0.024, 0.022, [0.22, 0.25, 0.3], 0.12, null, 0.7);
      }
    });

    // 3. АНИМАЦИЯ НАЛИВАНИЯ БУЛЬОНА ЧЕРПАКОМ И ВЫКЛАДЫВАНИЯ ЛАПШИ СОТЕЙНИЧКОМ В МИСКУ/КОРОБКУ!
    // Левая рука чуть выдвигает миску/коробку навстречу, а правая рука зачерпывает бульон или встряхивает и опрокидывает сотейник!
    const v = rt.activeVessel;
    if (this.pourAnim.active && v && (v.type === 'bowl' || v.type === 'box')) {
      const [hx, hy, hz] = this.getLeftHandWorldPos();
      const { F, R, U } = this.getCameraBasis();
      const yawAngle = Math.atan2(-F[0], -F[2]);
      const p = Math.min(1, this.pourAnim.timer / this.pourAnim.duration);

      // Вспомогательная функция жёсткого вращения ПРОТИВ ЧАСОВОЙ СТРЕЛКИ (theta > 0) в плоскости экрана (R, Y_world)
      const evalCCWPoint = (px, py, pz, theta, locX, locY, locF = 0) => {
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        // При theta > 0: ось ex поворачивается из +R вверх (+Y), а ось ey (горловина чаши/сотейника) поворачивается из +Y влево (-R)!
        const exX = R[0] * c, exY = s, exZ = R[2] * c;
        const eyX = -R[0] * s, eyY = c, eyZ = -R[2] * s;
        return [
          px + locX * exX + locY * eyX + locF * F[0],
          py + locX * exY + locY * eyY + locF * F[1],
          pz + locX * exZ + locY * eyZ + locF * F[2]
        ];
      };

      // А) АНИМАЦИЯ ПРАВОЙ РУКИ С ЧЕРПАКОМ (ВРАЩЕНИЕ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ НАД МИСКОЙ В ЛЕВОЙ РУКЕ)
      if (this.pourAnim.type === 'broth') {
        const potZ = -0.48 + this.pourAnim.potIndex * 0.32;
        const potX = -0.66;
        const potY = 1.07;

        // Чаша черпака подходит справа-сверху от миски в левой руке и поворачивается ПРОТИВ часовой стрелки (влево к миске)
        const targetX = hx + R[0] * 0.055 + F[0] * 0.01;
        const targetY = hy + 0.21;
        const targetZ = hz + R[2] * 0.055 + F[2] * 0.01;

        let lx, ly, lz, tiltAngle = 0, isPouringStream = false, pourIntensity = 0;
        if (p < 0.3) {
          // 1) Правая рука погружает черпак в кипящий чан (зачерпывание) и поднимает к миске
          const t = p / 0.3;
          if (t < 0.42) {
            const st = t / 0.42;
            const dip = Math.sin(st * Math.PI);
            lx = potX + Math.cos(st * Math.PI) * 0.02;
            ly = potY - dip * 0.026;
            lz = potZ + Math.sin(st * Math.PI) * 0.02;
            tiltAngle = -dip * 0.22;
            this.drawMesh(
              'torus',
              potX,
              1.085,
              potZ,
              0.08 + st * 0.07,
              0.008,
              0.08 + st * 0.07,
              brothColors[this.pourAnim.brothId] || brothColors.tonkotsu,
              0.75
            );
          } else {
            const mt = (t - 0.42) / 0.58;
            const s = mt * mt * (3 - 2 * mt);
            lx = potX + (targetX - potX) * s;
            ly = potY + (targetY - potY) * s + Math.sin(mt * Math.PI) * 0.085;
            lz = potZ + (targetZ - potZ) * s;
            tiltAngle = mt * 0.22;
          }
        } else if (p < 0.78) {
          // 2) Правая рука крутит поварёшку ПРОТИВ ЧАСОВОЙ СТРЕЛКИ (+tiltAngle), наклоняя горловину влево к миске!
          const t = (p - 0.3) / 0.48;
          pourIntensity = Math.sin(t * Math.PI);
          lx = targetX - R[0] * 0.018 * pourIntensity;
          ly = targetY - 0.015 * pourIntensity + Math.sin(t * Math.PI * 2) * 0.005;
          lz = targetZ - R[2] * 0.018 * pourIntensity;
          tiltAngle = 0.22 + pourIntensity * 1.12;
          isPouringStream = true;
        } else {
          // 3) Правая рука возвращает черпак по часовой стрелке обратно в ровное положение и убирает в чан
          const t = (p - 0.78) / 0.22;
          const s = t * t * (3 - 2 * t);
          lx = targetX + (potX - targetX) * s;
          ly = targetY + (potY - targetY) * s + Math.sin(t * Math.PI) * 0.05;
          lz = targetZ + (potZ - targetZ) * s;
          tiltAngle = 0.22 * (1 - s);
        }

        const bCol = brothColors[this.pourAnim.brothId] || brothColors.tonkotsu;
        const ladleRot = [0, yawAngle, tiltAngle];

        // Полая стальная чаша поварёшки «Отама» (вращается против часовой стрелки углом +tiltAngle!)
        this.drawMesh(
          'pot_lathe',
          lx,
          ly,
          lz,
          0.092,
          0.052,
          0.092,
          [0.88, 0.92, 0.96],
          0.26,
          ladleRot,
          0.95
        );
        const rimPos = evalCCWPoint(lx, ly, lz, tiltAngle, 0, 0.048, 0);
        this.drawMesh('torus', rimPos[0], rimPos[1], rimPos[2], 0.092, 0.01, 0.092, [0.92, 0.96, 1.0], 0.3, ladleRot, 0.98);

        if (p < 0.74) {
          const fillScale = p < 0.3 ? 0.074 : 0.074 * Math.max(0.25, 1.0 - ((p - 0.3) / 0.48) * 0.75);
          const brothPos = evalCCWPoint(lx, ly, lz, tiltAngle, 0, 0.032, 0);
          this.drawMesh(
            'cylinder',
            brothPos[0],
            brothPos[1],
            brothPos[2],
            fillScale,
            0.014,
            fillScale,
            bCol,
            0.68,
            ladleRot,
            0.9,
            4
          );
        }

        // Длинная стальная ручка черпака и ПРАВАЯ РУКА вращаются как единое целое с чашей против часовой стрелки!
        const shaftPos = evalCCWPoint(lx, ly, lz, tiltAngle, 0.068, 0.088, -0.025);
        this.drawMesh(
          'cylinder',
          shaftPos[0],
          shaftPos[1],
          shaftPos[2],
          0.018,
          0.19,
          0.018,
          [0.88, 0.92, 0.96],
          0.3,
          [0, yawAngle, -0.58 + tiltAngle],
          0.95
        );

        const rhPos = evalCCWPoint(lx, ly, lz, tiltAngle, 0.125, 0.145, -0.055);
        const rhRot = [0.18, yawAngle + 0.35, -0.45 + tiltAngle * 0.85];
        this.drawBox(rhPos[0], rhPos[1], rhPos[2], 0.072, 0.048, 0.125, [0.16, 0.14, 0.24], 0.24, rhRot);
        this.drawBox(rhPos[0], rhPos[1] + 0.025, rhPos[2], 0.076, 0.013, 0.044, [0.0, 0.96, 0.83], 0.94, rhRot);
        const fingerPos = evalCCWPoint(lx, ly, lz, tiltAngle, 0.1, 0.125, -0.045);
        this.drawBox(fingerPos[0], fingerPos[1], fingerPos[2], 0.035, 0.032, 0.065, [0.12, 0.11, 0.18], 0.18, rhRot);
        const armPos = evalCCWPoint(lx, ly, lz, tiltAngle, 0.185, 0.165, -0.11);
        this.drawBox(armPos[0], armPos[1], armPos[2], 0.082, 0.056, 0.14, [0.11, 0.13, 0.2], 0.15, rhRot);

        // ГОРЯЧАЯ ОБЪЁМНАЯ 3D-СТРУЯ БУЛЬОНА ИЗ НАКЛОНЁННОГО ВЛЕВО КРАЯ ПОВАРЁШКИ ПРЯМО В МИСКУ!
        if (isPouringStream) {
          const lipPos = evalCCWPoint(lx, ly, lz, tiltAngle, -0.036, 0.044, 0);
          const streamTopY = lipPos[1];
          const streamBotY = hy + 0.068;
          const streamH = Math.max(0.04, streamTopY - streamBotY);
          const streamMidY = (streamTopY + streamBotY) * 0.5;
          const streamX = (lipPos[0] + hx) * 0.5;
          const streamZ = (lipPos[2] + hz) * 0.5;
          const pulseW = (0.022 + Math.sin(this.time * 42) * 0.005) * (0.65 + 0.35 * pourIntensity);

          this.drawMesh(
            'cylinder',
            (lipPos[0] * 0.65 + hx * 0.35),
            streamMidY + streamH * 0.2,
            (lipPos[2] * 0.65 + hz * 0.35),
            pulseW * 1.18,
            streamH * 0.62,
            pulseW * 1.18,
            bCol,
            0.82,
            null,
            0.95,
            4
          );
          this.drawMesh(
            'cylinder',
            (lipPos[0] * 0.3 + hx * 0.7),
            streamMidY - streamH * 0.2,
            (lipPos[2] * 0.3 + hz * 0.7),
            pulseW * 0.85,
            streamH * 0.62,
            pulseW * 0.85,
            bCol,
            0.86,
            null,
            0.95,
            4
          );

          for (let d = 0; d < 4; d++) {
            const df = (this.time * 5.5 + d * 0.25) % 1.0;
            const dy = streamTopY - df * streamH;
            const da = d * 1.57 + this.time * 8;
            const dr = 0.012 + df * 0.018;
            this.drawMesh(
              'sphere',
              streamX + Math.cos(da) * dr,
              dy,
              streamZ + Math.sin(da) * dr,
              0.016,
              0.024,
              0.016,
              bCol,
              0.9
            );
          }

          const r1 = 0.045 + ((this.time * 3.8) % 0.075);
          const r2 = 0.045 + (((this.time * 3.8) + 0.038) % 0.075);
          this.drawMesh('torus', hx, streamBotY + 0.008, hz, r1, 0.009, r1, bCol, 0.88);
          this.drawMesh('torus', hx, streamBotY + 0.006, hz, r2, 0.007, r2, [1.0, 0.92, 0.76], 0.75);
          this.drawMesh(
            'sphere',
            hx + Math.sin(this.time * 7) * 0.03,
            streamBotY + 0.06 + ((this.time * 0.5) % 0.08),
            hz,
            0.038,
            0.038,
            0.038,
            [0.92, 0.96, 1.0],
            0.38
          );
        }
      }

      // Б) АНИМАЦИЯ ПРАВОЙ РУКИ С СОТЕЙНИЧКОМ «ТЭБО» (ПОВОРОТ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ И ВЫСЫПАНИЕ ЛАПШИ В МИСКУ!)
      if (this.pourAnim.active && this.pourAnim.type === 'noodles') {
        const startZ = -0.48 + this.pourAnim.basketIndex * 0.32;
        const startX = -1.05;
        const startY = 1.135;

        const targetX = hx + R[0] * 0.065 + F[0] * 0.01;
        const targetY = hy + 0.225;
        const targetZ = hz + R[2] * 0.065 + F[2] * 0.01;

        let bx, by, bz, tiltZ = 0, isDumpingStream = false;
        if (p < 0.34) {
          // 1) Правая рука берёт поднятый сотейничек, делает двойное встряхивание воды «Югири» и несёт к выдвинутой левой руке
          if (p < 0.14) {
            const st = p / 0.14;
            const shakeY = Math.sin(st * Math.PI * 2) * 0.032;
            bx = startX;
            by = startY + shakeY;
            bz = startZ;
            tiltZ = Math.sin(st * Math.PI * 2) * 0.16;
            for (let w = 0; w < 3; w++) {
              this.drawMesh(
                'sphere',
                startX + (w - 1) * 0.04,
                startY - 0.06 - st * 0.06,
                startZ + (w % 2) * 0.03,
                0.012,
                0.018,
                0.012,
                [0.65, 0.9, 1.0],
                0.75
              );
            }
          } else {
            const t = (p - 0.14) / 0.2;
            const s = t * t * (3 - 2 * t);
            bx = startX + (targetX - startX) * s;
            by = startY + (targetY - startY) * s + Math.sin(t * Math.PI) * 0.11;
            bz = startZ + (targetZ - startZ) * s;
            tiltZ = t * 0.32;
          }
        } else if (p < 0.78) {
          // 2) Правая рука поворачивает сотейничек ПРОТИВ ЧАСОВОЙ СТРЕЛКИ (+tiltZ до ~95°), высыпая лапшу влево-вниз в миску!
          const t = (p - 0.34) / 0.44;
          const flipCurve = Math.sin(t * Math.PI);
          const shake = Math.sin(t * Math.PI * 6) * 0.016;
          bx = targetX - R[0] * 0.022 * flipCurve;
          by = targetY + shake;
          bz = targetZ - R[2] * 0.022 * flipCurve;
          tiltZ = 0.32 + flipCurve * 1.32;
          isDumpingStream = true;
        } else {
          // 3) Правая рука поворачивает пустой сотейничек обратно и ставит на гнездо бойлера
          const t = (p - 0.78) / 0.22;
          const s = t * t * (3 - 2 * t);
          bx = targetX + (startX - targetX) * s;
          by = targetY + (1.095 - targetY) * s + Math.sin(t * Math.PI) * 0.06;
          bz = targetZ + (startZ - targetZ) * s;
          tiltZ = 0.32 * (1 - s);
        }

        const nCol =
          this.pourAnim.quality === 'aldente'
            ? [1.0, 0.84, 0.28]
            : this.pourAnim.quality === 'under'
              ? [0.98, 0.94, 0.72]
              : [0.68, 0.48, 0.3];

        // Корпус сетчатого сотейничка «Тэбо» поворачивается ПРОТИВ ЧАСОВОЙ СТРЕЛКИ (+tiltZ) горловиной влево к миске!
        const teboRot = [0, yawAngle, tiltZ];
        this.drawMesh(
          'cylinder',
          bx,
          by,
          bz,
          0.155,
          0.105,
          0.155,
          [0.74, 0.78, 0.84],
          0.08,
          teboRot,
          0.88,
          5
        );
        const rimPos = evalCCWPoint(bx, by, bz, tiltZ, 0, 0.052, 0);
        this.drawMesh(
          'torus',
          rimPos[0],
          rimPos[1],
          rimPos[2],
          0.16,
          0.025,
          0.16,
          [0.58, 0.64, 0.72],
          0.1,
          teboRot,
          0.92
        );

        // Деревянная ручка «Тэбо» и ПРАВАЯ РУКА вращаются вместе с сотейником против часовой стрелки!
        const handlePos = evalCCWPoint(bx, by, bz, tiltZ, 0.12, 0.058, -0.02);
        this.drawMesh(
          'cylinder',
          handlePos[0],
          handlePos[1],
          handlePos[2],
          0.028,
          0.185,
          0.028,
          [0.68, 0.4, 0.18],
          0.06,
          [0, yawAngle, -1.18 + tiltZ],
          0.45
        );

        const rhPos = evalCCWPoint(bx, by, bz, tiltZ, 0.172, 0.086, -0.05);
        const rhRot = [0.18, yawAngle + 0.35, -0.45 + tiltZ * 0.85];
        this.drawBox(rhPos[0], rhPos[1], rhPos[2], 0.072, 0.048, 0.125, [0.16, 0.14, 0.24], 0.24, rhRot);
        this.drawBox(rhPos[0], rhPos[1] + 0.025, rhPos[2], 0.076, 0.013, 0.044, [0.0, 0.96, 0.83], 0.94, rhRot);
        const fingerPos = evalCCWPoint(bx, by, bz, tiltZ, 0.142, 0.068, -0.04);
        this.drawBox(fingerPos[0], fingerPos[1], fingerPos[2], 0.036, 0.032, 0.065, [0.12, 0.11, 0.18], 0.18, rhRot);
        const armPos = evalCCWPoint(bx, by, bz, tiltZ, 0.23, 0.11, -0.105);
        this.drawBox(armPos[0], armPos[1], armPos[2], 0.082, 0.056, 0.14, [0.11, 0.13, 0.2], 0.15, rhRot);

        // Лапша внутри сотейничка выскальзывает из его наклонённой влево горловины прямо в миску!
        if (p < 0.56) {
          const slideOut = p < 0.34 ? 0 : (p - 0.34) / 0.22;
          for (let n = -2; n <= 2; n++) {
            const np = evalCCWPoint(bx, by, bz, tiltZ, n * 0.014, 0.02 + slideOut * 0.065, 0);
            this.drawMesh(
              'wavy_noodle',
              np[0],
              np[1],
              np[2],
              0.08,
              0.022,
              0.11 * (1 - slideOut * 0.35),
              nCol,
              0.24,
              [0, yawAngle + n * 0.35, tiltZ]
            );
          }
        }
        if (isDumpingStream) {
          const mouthPos = evalCCWPoint(bx, by, bz, tiltZ, 0, 0.055, 0);
          const fallProgress = (p - 0.34) / 0.44;
          for (let k = 0; k < 7; k++) {
            const frac = (fallProgress * 2.1 + k * 0.14) % 1.0;
            const arc = Math.sin(frac * Math.PI);
            const ny = mouthPos[1] - frac * (mouthPos[1] - (hy + 0.068));
            const nx = mouthPos[0] * (1 - frac) + hx * frac + Math.cos(k * 1.9 + this.time * 14) * 0.022 * arc;
            const nz = mouthPos[2] * (1 - frac) + hz * frac + Math.sin(k * 1.7 + this.time * 14) * 0.022 * arc;
            this.drawMesh(
              'wavy_noodle',
              nx,
              ny,
              nz,
              0.115,
              0.026,
              0.145,
              nCol,
              0.32,
              [Math.PI * 0.38 + frac * 0.6, k * 0.55 + this.time * 4, 0.35]
            );
          }
        }
      }
    }
  }

  // =========================================================================
  // СЕКТОР -1 (МОЙКА ЛЕВЕЕ ВАРОЧНОЙ ПЛИТЫ В 3D): ПУСТАЯ ГЛУБОКАЯ СТАЛЬНАЯ РАКОВИНА СО СЛИВОМ,
  // КУДА СКЛАДЫВАЕТСЯ ГРЯЗНАЯ ПОСУДА, И КРАН, ИЗ КОТОРОГО ВОДА ЛЬЁТ ПРИ ТАПЕ НА ТАРЕЛКУ (+1 СЕК ПОСЛЕ МЫТЬЯ)!
  // =========================================================================
  drawLeftSinkStation3D() {
    const rt = gameState.runtime;
    const sinkX = -0.88;
    const sinkY = 0.905;
    const sinkZ = 0.72;
    const floorY = 0.768; // Дно глубокой пустой раковины (утоплено на ~16 см ниже бортиков!)
    const rimY = 0.925;
    const dirtyList = rt.dirtyInSink || [];
    const isWashing = this.sinkWashAnim.active;
    const isWaterFlowing = isWashing || this.sinkFaucetFlowTimer > 0;

    // 1. ПУСТАЯ ГЛУБОКАЯ ЧАША РАКОВИНЫ ИЗ МАТОВОЙ НЕРЖАВЕЙКИ (БЕЗ СТОЯЧЕЙ ВОДЫ!)
    // Сухое стальное дно глубокой раковины
    this.drawBox(sinkX, floorY, sinkZ, 0.52, 0.014, 0.5, [0.16, 0.19, 0.24], 0.04, null, 0.78);
    // 4 глубокие внутренние вертикальные стальные стенки раковины (от дна y = 0.768 до бортика y = 0.925)
    const wallMidY = (floorY + rimY) * 0.5;
    const wallH = rimY - floorY;
    this.drawBox(sinkX - 0.25, wallMidY, sinkZ, 0.018, wallH, 0.5, [0.25, 0.29, 0.36], 0.05, null, 0.82); // Дальняя стенка под краном
    this.drawBox(sinkX + 0.25, wallMidY, sinkZ, 0.018, wallH, 0.5, [0.19, 0.23, 0.29], 0.04, null, 0.78); // Ближняя стенка
    this.drawBox(sinkX, wallMidY, sinkZ - 0.24, 0.5, 0.018 + wallH, 0.018, [0.28, 0.33, 0.4], 0.06, null, 0.85); // Правая стенка (к плите)
    this.drawBox(sinkX, wallMidY, sinkZ + 0.24, 0.5, 0.018 + wallH, 0.018, [0.22, 0.26, 0.33], 0.05, null, 0.8); // Левая стенка (к сушилке)

    // Круглое стальное сливное отверстие с решёткой в центре сухого дна раковины
    this.drawMesh('torus', sinkX + 0.02, floorY + 0.008, sinkZ, 0.074, 0.01, 0.074, [0.62, 0.68, 0.76], 0.12, null, 0.92);
    this.drawMesh('cylinder', sinkX + 0.02, floorY + 0.007, sinkZ, 0.064, 0.004, 0.064, [0.05, 0.07, 0.1], 0.02, null, 0.3);
    this.drawBox(sinkX + 0.02, floorY + 0.009, sinkZ, 0.06, 0.003, 0.007, [0.52, 0.58, 0.66], 0.1, null, 0.9);
    this.drawBox(sinkX + 0.02, floorY + 0.009, sinkZ, 0.007, 0.003, 0.06, [0.52, 0.58, 0.66], 0.1, null, 0.9);

    // 4 верхних хромированных бортика раковины по периметру + неоновый индикатор на переднем крае
    const rimCol = [0.62, 0.68, 0.76];
    this.drawBox(sinkX, rimY, sinkZ - 0.26, 0.58, 0.02, 0.042, rimCol, 0.12, null, 0.92);
    this.drawBox(sinkX, rimY, sinkZ + 0.26, 0.58, 0.02, 0.042, rimCol, 0.12, null, 0.92);
    this.drawBox(sinkX - 0.27, rimY, sinkZ, 0.042, 0.02, 0.54, rimCol, 0.12, null, 0.92);
    this.drawBox(sinkX + 0.27, rimY, sinkZ, 0.042, 0.02, 0.54, rimCol, 0.12, null, 0.92);

    const sinkLedCol =
      dirtyList.length > 0
        ? [1.0, 0.68, 0.12]
        : [0.0, 0.96, 0.83];
    const sinkLedPulse =
      dirtyList.length > 0
        ? 0.55 + 0.35 * Math.sin(this.time * 6.0)
        : 0.35;
    this.drawBox(sinkX + 0.295, rimY + 0.002, sinkZ, 0.012, 0.012, 0.46, sinkLedCol, sinkLedPulse);

    // 2. ВЫСОКИЙ ХРОМИРОВАННЫЙ КРАН-ГУСАК И ВЕНТИЛИ ГОРЯЧЕЙ/ХОЛОДНОЙ ВОДЫ (x = -1.10, z = +0.72)
    const faucetX = sinkX - 0.22;
    this.drawMesh('cylinder', faucetX, sinkY + 0.14, sinkZ, 0.034, 0.24, 0.034, [0.78, 0.84, 0.92], 0.18, null, 0.96);
    // Изогнутый верхний излив гусака, нависающий над центром раковины
    this.drawBox(faucetX + 0.09, sinkY + 0.255, sinkZ, 0.2, 0.028, 0.028, [0.78, 0.84, 0.92], 0.18, [0, 0, -0.15], 0.96);
    this.drawMesh('cylinder', faucetX + 0.18, sinkY + 0.225, sinkZ, 0.03, 0.045, 0.03, [0.85, 0.9, 0.98], 0.22, null, 0.98);
    // Вентили холодной (бирюзовый) и горячей (красный) воды по бокам крана
    this.drawMesh('cylinder', faucetX + 0.01, sinkY + 0.055, sinkZ - 0.11, 0.038, 0.028, 0.038, [0.0, 0.88, 1.0], 0.75, null, 0.9);
    this.drawMesh('cylinder', faucetX + 0.01, sinkY + 0.055, sinkZ + 0.11, 0.038, 0.028, 0.038, [1.0, 0.22, 0.35], 0.75, null, 0.9);

    // 3. ДОЗАТОР МОЮЩЕГО СРЕДСТВА И ПОРОЛОНОВАЯ ГУБКА НА БОРТИКЕ (z = +0.46)
    const spongeHomeX = sinkX + 0.18;
    const spongeHomeY = rimY + 0.016;
    const spongeHomeZ = sinkZ - 0.25;
    this.drawMesh('cylinder', sinkX - 0.14, sinkY + 0.085, sinkZ - 0.26, 0.054, 0.1, 0.054, [0.0, 0.86, 0.78], 0.65, null, 0.85);
    this.drawBox(sinkX - 0.12, sinkY + 0.145, sinkZ - 0.26, 0.048, 0.014, 0.016, [0.88, 0.92, 0.96], 0.25);
    if (!isWashing) {
      // Жёлто-зелёная кухонная губка на переднем углу мойки
      this.drawBox(spongeHomeX, spongeHomeY, spongeHomeZ, 0.075, 0.024, 0.052, [1.0, 0.86, 0.18], 0.35, [0, 0.25, 0]);
      this.drawBox(spongeHomeX, spongeHomeY + 0.014, spongeHomeZ, 0.075, 0.008, 0.052, [0.1, 0.78, 0.38], 0.35, [0, 0.25, 0]);
    }

    // 4. ПЛОЩАДКА ДЛЯ ЧИСТОЙ ВЫМЫТОЙ ПОСУДЫ СЛЕВА ОТ РАКОВИНЫ (z = +1.07)
    // Вымытые миски складываются сюда левой рукой; только при тапе по чистой посуде на этой площадке они уходят в стопку чистых!
    const rackX = sinkX;
    const rackY = sinkY + 0.015;
    const rackZ = sinkZ + 0.35;
    const totalWashedOnRack = Math.max(0, Math.min(10, rt.washedOnRack || 0));
    const pWash = isWashing ? Math.min(1, this.sinkWashAnim.timer / this.sinkWashAnim.duration) : 1;
    // Пока рука ещё моет и несёт текущую миску к площадке (pWash < 0.88), на площадке лежат предыдущие миски
    const staticRackCount = Math.max(
      0,
      totalWashedOnRack - (isWashing && pWash < 0.88 ? 1 : 0)
    );

    this.drawBox(rackX, rackY, rackZ, 0.42, 0.022, 0.22, [0.22, 0.26, 0.33], 0.08, null, 0.82);
    for (let r = -3; r <= 3; r++) {
      this.drawBox(rackX + r * 0.052, rackY + 0.014, rackZ, 0.008, 0.01, 0.19, [0.68, 0.75, 0.84], 0.15, null, 0.92);
    }
    // Неоновый зелёный индикатор площадки чистой посуды (пульсирует, когда на площадке лежат чистые миски, готовые к переносу в стопку!)
    const rackLedGlow = totalWashedOnRack > 0 ? 0.55 + 0.4 * Math.sin(this.time * 6.5) : 0.18;
    const rackLedCol = totalWashedOnRack > 0 ? [0.06, 0.96, 0.48] : [0.0, 0.86, 0.78];
    this.drawBox(rackX + 0.205, rackY + 0.008, rackZ, 0.012, 0.012, 0.19, rackLedCol, rackLedGlow);

    // Отрисовываем стопку уже вымытых чистых мисок на площадке слева от раковины
    for (let m = 0; m < staticRackCount; m++) {
      const my = rackY + 0.016 + m * 0.022;
      const ms = 0.195 + m * 0.0018;
      this.drawMesh('bowl_lathe', rackX, my, rackZ, ms, 0.074, ms, [0.16, 0.1, 0.24], 0.16, null, 0.92, 3);
      this.drawMesh('torus', rackX, my + 0.064, rackZ, ms * 0.98, 0.011, ms * 0.98, [0.86, 0.22, 0.32], 0.28, null, 0.95);
    }

    if (rt.activeSector === -1 && totalWashedOnRack > 0) {
      this.registerHitbox('sink_clean_rack', rackX, rackY + 0.04 + staticRackCount * 0.015, rackZ, 96);
    }

    // 5. ГРЯЗНЫЕ МИСКИ НА ДНЕ ГЛУБОКОЙ ПУСТОЙ РАКОВИНЫ (1-й ряд плоско на дне, 2-й и 3-й ряды вставлены одна в другую под наклоном!)
    const sinkPyramid = [
      // 1-й ряд (3 плоские миски прямо на дне глубокой пустой раковины вразнобой)
      { dx: -0.08, dy: 0.008, dz: -0.11, rot: [0.0, 0.3, 0.0] },
      { dx: 0.09, dy: 0.008, dz: 0.03, rot: [0.0, -0.45, 0.0] },
      { dx: -0.03, dy: 0.008, dz: 0.12, rot: [0.0, 0.65, 0.0] },
      // 2-й ряд (вставлены одна в другую в миски 1-го ряда под углом!)
      { dx: -0.08 + 0.014, dy: 0.04, dz: -0.11 + 0.01, rot: [0.22, -0.5, -0.25] },
      { dx: 0.09 - 0.013, dy: 0.041, dz: 0.03 - 0.01, rot: [-0.2, 0.45, 0.24] },
      { dx: -0.03 + 0.012, dy: 0.04, dz: 0.12 - 0.011, rot: [-0.22, 0.75, -0.23] },
      // 3-й ряд (вставлены одна в другую поверх 2-го ряда)
      { dx: -0.08 - 0.008, dy: 0.072, dz: -0.11 - 0.006, rot: [-0.19, 0.35, 0.23] },
      { dx: 0.09 + 0.01, dy: 0.073, dz: 0.03 + 0.008, rot: [0.21, -0.6, -0.24] },
      { dx: -0.03 - 0.009, dy: 0.072, dz: 0.12 + 0.006, rot: [0.2, 0.25, 0.22] }
    ];
    const visibleDirty = Math.min(10, dirtyList.length);
    for (let i = 0; i < visibleDirty; i++) {
      const sp = sinkPyramid[i % sinkPyramid.length];
      const extraY = Math.floor(i / sinkPyramid.length) * 0.034;
      const bx = sinkX + sp.dx;
      const by = floorY + sp.dy + extraY;
      const bz = sinkZ + sp.dz;
      this.drawDirtyBowl3D(
        bx,
        by,
        bz,
        dirtyList[i].broth,
        0.46,
        sp.rot
      );
      if (rt.activeSector === -1) {
        this.registerHitbox('sink_wash', bx, by + 0.03, bz, 88);
      }
    }

    // 6. СТРУЯ ВОДЫ ИЗ КРАНА (ВКЛЮЧАЕТСЯ ПРИ ТАПЕ НА ТАРЕЛКУ И АВТОМАТИЧЕСКИ ВЫКЛЮЧАЕТСЯ ЧЕРЕЗ 1 СЕКУНДУ ПОСЛЕ МЫТЬЯ, ЕСЛИ НЕ ТАПНУТЬ ЕЩЁ РАЗ!)
    const spoutX = faucetX + 0.18;
    const spoutTopY = sinkY + 0.205;
    const spoutZ = sinkZ;
    if (isWaterFlowing) {
      const streamBottomY = isWashing && pWash >= 0.15 && pWash < 0.68 ? floorY + 0.12 : floorY + 0.01;
      const streamH = spoutTopY - streamBottomY;
      const streamMidY = (spoutTopY + streamBottomY) * 0.5;
      const streamW = 0.02 + Math.sin(this.time * 48) * 0.0035;

      this.drawMesh(
        'cylinder',
        spoutX,
        streamMidY,
        spoutZ,
        streamW,
        streamH,
        streamW,
        [0.55, 0.96, 1.0],
        0.92,
        null,
        0.98,
        4
      );
      // Маленькие брызги-колечки в точке падения струи в сливное отверстие на дне раковины
      const splashR = 0.032 + ((this.time * 3.2) % 0.045);
      this.drawMesh('torus', spoutX, floorY + 0.012, spoutZ, splashR, 0.005, splashR, [0.65, 0.96, 1.0], 0.85);
    }

    // Вспомогательная отрисовка компактной кибер-перчатки с коротким манжетом (отдельно от тела, как при взятии тарелки и наливании поварёшкой!)
    const drawReachingArm = (hx, hy, hz, isLeftHand = true, extraYaw = 0, extraRoll = 0) => {
      const yaw = 1.18 + extraYaw + (isLeftHand ? 0.15 : -0.15);
      const handRot = [0.16, yaw, extraRoll];

      // Ладонь кибер-перчатки с неоновой бирюзовой полосой и большим пальцем
      this.drawBox(hx, hy, hz, 0.072, 0.036, 0.125, [0.16, 0.14, 0.24], 0.24, handRot);
      this.drawBox(hx, hy + 0.02, hz, 0.076, 0.012, 0.042, [0.0, 0.96, 0.83], 0.94, handRot);
      const thumbZOff = isLeftHand ? -0.042 : 0.042;
      this.drawBox(hx - 0.02, hy + 0.008, hz + thumbZOff, 0.03, 0.024, 0.05, [0.2, 0.18, 0.3], 0.25, handRot);

      // Короткий фиксированный манжет запястья (без длинной тянущейся к телу руки!)
      const cuffX = hx + 0.078;
      const cuffY = hy - 0.016;
      const cuffZ = hz + (isLeftHand ? 0.022 : -0.022);
      this.drawBox(cuffX, cuffY, cuffZ, 0.078, 0.046, 0.125, [0.11, 0.13, 0.2], 0.16, handRot);
    };

    // 7. ДЕТАЛИЗИРОВАННАЯ 4-ФАЗНАЯ АНИМАЦИЯ МЫТЬЯ ОТ ПЕРВОГО ЛИЦА:
    // - Фаза 1 (p < 0.22): Компактные руки подхватывают грязную тарелку со дна раковины и губку с угла;
    // - Фаза 2 (0.22 <= p < 0.66): Левая рука держит тарелку под струёй воды, а правая рука моет её губкой с пышной белой пеной;
    // - Фаза 3 (0.66 <= p < 0.88): Тарелка сверкает чистотой — левая рука кладёт её СЛЕВА на площадку для чистой посуды;
    // - Фаза 4 (p >= 0.88): Перчатки аккуратно отходят от площадки!
    if (isWashing) {
      const p = pWash;
      const sIdx = this.sinkWashAnim.sinkIndex ?? 0;
      const sp = sinkPyramid[sIdx % sinkPyramid.length];
      const extraY = Math.floor(sIdx / sinkPyramid.length) * 0.034;
      const pickX = sinkX + sp.dx;
      const pickY = floorY + sp.dy + extraY;
      const pickZ = sinkZ + sp.dz;

      const washX = spoutX + 0.015;
      const washY = floorY + 0.135;
      const washZ = spoutZ;

      const rIdx = this.sinkWashAnim.rackIndex ?? 0;
      const targetRackY = rackY + 0.016 + rIdx * 0.022;

      // Руки стартуют и возвращаются прямо от тела героя (как в анимации взятия чистой миски/коробки!)
      const bodyLeftPos = this.getLeftHandWorldPos();
      const { R: camR } = this.getCameraBasis();
      const lhOrigin = [bodyLeftPos[0], bodyLeftPos[1], bodyLeftPos[2]];
      const rhOrigin = [
        bodyLeftPos[0] + camR[0] * 0.24,
        bodyLeftPos[1],
        bodyLeftPos[2] + camR[2] * 0.24
      ];

      if (p < 0.22) {
        // ФАЗА 1: Протягиваем руки от себя, захватываем грязную тарелку со дна раковины и поднимаем под кран!
        const t = p / 0.22;
        if (t < 0.52) {
          const reach = t / 0.52;
          const s = reach * reach * (3 - 2 * reach);
          // Грязная тарелка ещё лежит на дне раковины, пока руки тянутся к ней
          this.drawDirtyBowl3D(pickX, pickY, pickZ, this.sinkWashAnim.bowl?.broth || 'tonkotsu', 0.46, sp.rot);
          drawReachingArm(
            lhOrigin[0] + (pickX + 0.06 - lhOrigin[0]) * s,
            lhOrigin[1] + (pickY + 0.02 - lhOrigin[1]) * s,
            lhOrigin[2] + (pickZ + 0.05 - lhOrigin[2]) * s,
            true
          );
          drawReachingArm(
            rhOrigin[0] + (spongeHomeX - rhOrigin[0]) * s,
            rhOrigin[1] + (spongeHomeY + 0.02 - rhOrigin[1]) * s,
            rhOrigin[2] + (spongeHomeZ - rhOrigin[2]) * s,
            false
          );
          this.drawBox(spongeHomeX, spongeHomeY, spongeHomeZ, 0.075, 0.024, 0.052, [1.0, 0.86, 0.18], 0.35, [0, 0.25, 0]);
          this.drawBox(spongeHomeX, spongeHomeY + 0.014, spongeHomeZ, 0.075, 0.008, 0.052, [0.1, 0.78, 0.38], 0.35, [0, 0.25, 0]);
        } else {
          const lift = (t - 0.52) / 0.48;
          const s = lift * lift * (3 - 2 * lift);
          const bx = pickX + (washX - pickX) * s;
          const by = pickY + (washY - pickY) * s;
          const bz = pickZ + (washZ - pickZ) * s;
          this.drawDirtyBowl3D(bx, by, bz, this.sinkWashAnim.bowl?.broth || 'tonkotsu', 0.46, [0.15 * s, 0, -0.15 * s]);
          drawReachingArm(bx + 0.07, by - 0.01, bz + 0.06, true);

          const spX = spongeHomeX + (washX + 0.02 - spongeHomeX) * s;
          const spY = spongeHomeY + (washY + 0.055 - spongeHomeY) * s;
          const spZ = spongeHomeZ + (washZ - 0.04 - spongeHomeZ) * s;
          this.drawBox(spX, spY, spZ, 0.072, 0.024, 0.05, [1.0, 0.86, 0.18], 0.45, [0, 0.3, 0]);
          this.drawBox(spX, spY + 0.014, spZ, 0.072, 0.008, 0.05, [0.1, 0.78, 0.38], 0.45, [0, 0.3, 0]);
          drawReachingArm(spX + 0.06, spY + 0.025, spZ - 0.04, false);
        }
      } else if (p < 0.66) {
        // ФАЗА 2: Левая рука держит тарелку под струёй, а правая рука активно намывает её губочкой с пеной!
        const t = (p - 0.22) / 0.44;
        const rock = Math.sin(t * Math.PI * 4) * 0.014;
        const bx = washX + rock;
        const by = washY;
        const bz = washZ;
        const bowlTilt = [0.16, 0, -0.18 + rock * 3];

        if (t < 0.48) {
          // В первой половине мытья ещё видны смываемые следы бульона
          this.drawDirtyBowl3D(bx, by, bz, this.sinkWashAnim.bowl?.broth || 'tonkotsu', 0.47, bowlTilt);
        } else {
          // Во второй половине мытья тарелка уже полностью чистая и блестит!
          this.drawMesh('bowl_lathe', bx, by, bz, 0.205, 0.078, 0.205, [0.16, 0.1, 0.24], 0.22, bowlTilt, 0.95, 3);
          this.drawMesh('torus', bx, by + 0.068, bz, 0.2, 0.011, 0.2, [0.86, 0.22, 0.32], 0.35, bowlTilt, 0.96);
        }
        drawReachingArm(bx + 0.07, by - 0.01, bz + 0.065, true, 0, -0.15);

        // Правая рука с губкой совершает круговые движения внутри миски
        const scrubAng = t * Math.PI * 6;
        const sx = bx + Math.cos(scrubAng) * 0.052;
        const sz = bz + Math.sin(scrubAng) * 0.052;
        const sy = by + 0.058;
        this.drawBox(sx, sy, sz, 0.072, 0.024, 0.05, [1.0, 0.86, 0.18], 0.48, [0, scrubAng, 0]);
        this.drawBox(sx, sy + 0.014, sz, 0.072, 0.008, 0.05, [0.1, 0.78, 0.38], 0.48, [0, scrubAng, 0]);
        drawReachingArm(sx + 0.065, sy + 0.028, sz - 0.045, false, 0, 0.2);

        // Пышная шапка белых мыльных пузырей вокруг губки и тарелки
        for (let b = 0; b < 8; b++) {
          const ba = b * 0.785 + this.time * 11;
          const br = 0.042 + (b % 3) * 0.025;
          const bSize = 0.024 + Math.sin(t * Math.PI) * 0.015;
          this.drawMesh(
            'sphere',
            bx + Math.cos(ba) * br,
            by + 0.05 + (b % 2) * 0.018,
            bz + Math.sin(ba) * br,
            bSize,
            bSize,
            bSize,
            [0.95, 0.98, 1.0],
            0.9
          );
        }
      } else if (p < 0.88) {
        // ФАЗА 3: Тарелка чистая! Левая рука переносит и кладёт её СЛЕВА на площадку для чистой посуды!
        const t = (p - 0.66) / 0.22;
        const s = t * t * (3 - 2 * t);
        const arc = Math.sin(t * Math.PI) * 0.075;
        const bx = washX + (rackX - washX) * s;
        const by = washY + (targetRackY - washY) * s + arc;
        const bz = washZ + (rackZ - washZ) * s;
        const ms = 0.195 + rIdx * 0.0018;

        this.drawMesh('bowl_lathe', bx, by, bz, ms, 0.074, ms, [0.16, 0.1, 0.24], 0.22, null, 0.95, 3);
        this.drawMesh('torus', bx, by + 0.064, bz, ms * 0.98, 0.011, ms * 0.98, [0.86, 0.22, 0.32], 0.32, null, 0.96);
        drawReachingArm(bx + 0.075, by + 0.01, bz + 0.04, true);

        // Правая рука кладёт губку обратно на угол раковины и уходит к герою
        const spX = washX + 0.02 + (spongeHomeX - (washX + 0.02)) * s;
        const spY = washY + 0.055 + (spongeHomeY - (washY + 0.055)) * s;
        const spZ = washZ - 0.04 + (spongeHomeZ - (washZ - 0.04)) * s;
        this.drawBox(spX, spY, spZ, 0.075, 0.024, 0.052, [1.0, 0.86, 0.18], 0.35, [0, 0.25, 0]);
        this.drawBox(spX, spY + 0.014, spZ, 0.075, 0.008, 0.052, [0.1, 0.78, 0.38], 0.35, [0, 0.25, 0]);
        drawReachingArm(
          spX + 0.06 + (rhOrigin[0] - (spX + 0.06)) * s * 0.6,
          spY + 0.025 + (rhOrigin[1] - (spY + 0.025)) * s * 0.6,
          spZ - 0.04 + (rhOrigin[2] - (spZ - 0.04)) * s * 0.6,
          false
        );
      } else {
        // ФАЗА 4: Чистая тарелка уже лежит слева на площадке, а левая рука возвращается к герою
        const t = (p - 0.88) / 0.12;
        const s = t * t * (3 - 2 * t);
        this.drawBox(spongeHomeX, spongeHomeY, spongeHomeZ, 0.075, 0.024, 0.052, [1.0, 0.86, 0.18], 0.35, [0, 0.25, 0]);
        this.drawBox(spongeHomeX, spongeHomeY + 0.014, spongeHomeZ, 0.075, 0.008, 0.052, [0.1, 0.78, 0.38], 0.35, [0, 0.25, 0]);
        drawReachingArm(
          rackX + 0.075 + (lhOrigin[0] - (rackX + 0.075)) * s,
          targetRackY + 0.01 + (lhOrigin[1] - (targetRackY + 0.01)) * s,
          rackZ + 0.04 + (lhOrigin[2] - (rackZ + 0.04)) * s,
          true
        );
      }
    }

    // 8. АНИМАЦИЯ ЗАБОРА ЧИСТОЙ МИСКИ С ПЛОЩАДКИ СЛЕВА В СТОПКУ ЧИСТОЙ ПОСУДЫ (КАК ПРИ УБОРКЕ ГРЯЗНОЙ МИСКИ С ПОЛОЧКИ!)
    if (this.rackPickupAnim.active) {
      const p = Math.min(1, this.rackPickupAnim.timer / this.rackPickupAnim.duration);
      const s = p * p * (3 - 2 * p);
      const rIdx = this.rackPickupAnim.fromRackIdx || 0;
      const startY = rackY + 0.016 + rIdx * 0.022;
      const bx = rackX + (0.28 - rackX) * s;
      const by = startY + Math.sin(p * Math.PI) * 0.11 - s * 0.04;
      const bz = rackZ + (-0.18 - rackZ) * s;
      const sc = 1 - p * 0.25;
      const rot = [0.18 * (1 - p), 0.38 * p, -0.22 * (1 - p)];

      this.drawMesh('bowl_lathe', bx, by, bz, 0.198 * sc, 0.074 * sc, 0.198 * sc, [0.16, 0.1, 0.24], 0.24, rot, 0.95, 3);
      this.drawMesh('torus', bx, by + 0.064 * sc, bz, 0.194 * sc, 0.011 * sc, 0.194 * sc, [0.86, 0.22, 0.32], 0.35, rot, 0.96);
      this.drawBox(bx + 0.07, by + 0.025, bz + 0.04, 0.07, 0.042, 0.128, [0.16, 0.14, 0.24], 0.22, [0.18, 1.15, 0]);
      this.drawBox(bx + 0.07, by + 0.048, bz + 0.04, 0.074, 0.012, 0.04, [0.0, 0.96, 0.83], 0.92, [0.18, 1.15, 0]);
    }

    // Общий страховочный хитбокс по чаше раковины ТОЛЬКО когда камера в Секторе -1 (Мойка)
    if (rt.activeSector === -1) {
      this.registerHitbox('sink_wash', sinkX, floorY + 0.06, sinkZ, 108);
    }
  }

  // =========================================================================
  // СЕКТОР 2 (СКЛАД, ПОСУДА И КУРЬЕР В 3D): МИСКИ И КОРОБКИ СЛЕВА ОТ ХОЛОДИЛЬНИКА,
  // ДОСТАВЩИК В ЛЕВОМ ВЕРХНЕМ УГЛУ И КРИО-ХОЛОДИЛЬНИК СО СТЕКЛЯННОЙ ДВЕРЦЕЙ СПРАВА!
  // =========================================================================
  drawRightFridgeAndSealer3D() {
    const rt = gameState.runtime;
    const isRightSector = rt.activeSector === 2;
    const needVesselPulse = !rt.activeVessel.type ? 0.35 + 0.25 * Math.sin(this.time * 5.0) : 0.16;

    const isFridgeInteract = isRightSector && Boolean(rt.fridgeOpen) && this.fridgeDoorOpenT > 0.45;
    const isWarehouseInteract = isRightSector && !rt.fridgeOpen;

    // 1. ДИСПЕНСЕР КЕРАМИЧЕСКИХ МИСОК «ДОНБУРИ» (ВСЕ 10 ЧИСТЫХ МИСОК В СТОПКЕ: 10 -> 9 -> 8 -> ... -> 0)
    const bowlX = 0.84;
    const bowlZ = -0.22;
    this.drawBox(bowlX, 0.904, bowlZ, 0.24, 0.024, 0.23, [0.26, 0.16, 0.12], 0.08, null, 0.55);
    this.drawBox(bowlX, 0.917, bowlZ, 0.21, 0.006, 0.2, [0.16, 0.18, 0.22], 0.05, null, 0.3);
    this.drawBox(bowlX - 0.112, 0.914, bowlZ, 0.01, 0.008, 0.21, [1.0, 0.22, 0.54], needVesselPulse);

    // 4 высоких бамбуковых столбика-держателя на 10 мисок
    for (const [dx, dz] of [[-0.098, -0.095], [0.098, -0.095], [-0.098, 0.095], [0.098, 0.095]]) {
      this.drawMesh('cylinder', bowlX + dx, 1.02, bowlZ + dz, 0.014, 0.21, 0.014, [0.58, 0.38, 0.2], 0.08, null, 0.5);
    }

    // Отрисовываем точное количество оставшихся чистых мисок (от 10 до 0: взял одну -> стало 9, вернул -> снова 10!)
    const pourBowlNotGrabbedYet =
      this.handPourAnim.active &&
      this.handPourAnim.toType === 'bowl' &&
      this.handPourAnim.timer / this.handPourAnim.duration < 0.22;
    const returningBowlNotLandedYet =
      this.rightReturnAnim.active &&
      this.rightReturnAnim.type === 'bowl' &&
      this.rightReturnAnim.timer / this.rightReturnAnim.duration < 0.72;
    const cleanCount = Math.max(
      0,
      Math.min(
        10,
        (rt.cleanBowls ?? 10) + (pourBowlNotGrabbedYet ? 1 : 0) - (returningBowlNotLandedYet ? 1 : 0)
      )
    );

    if (cleanCount <= 0) {
      const emptyPulse = 0.5 + 0.45 * Math.sin(this.time * 9.0);
      this.drawBox(bowlX, 0.922, bowlZ, 0.19, 0.008, 0.18, [1.0, 0.18, 0.32], emptyPulse);
    }

    for (let m = 0; m < cleanCount; m++) {
      const my = 0.918 + m * 0.02;
      const ms = 0.192 + m * 0.0018;
      this.drawMesh('bowl_lathe', bowlX, my, bowlZ, ms, 0.072, ms, [0.16, 0.1, 0.24], 0.12, null, 0.82, 3);
      this.drawMesh('torus', bowlX, my + 0.063, bowlZ, ms * 0.98, 0.011, ms * 0.98, [0.86, 0.22, 0.32], 0.22, null, 0.88);
    }

    if (isWarehouseInteract) {
      this.registerHitbox('vessel_bowl', bowlX, 1.01, bowlZ, 82);
    }

    // 1Б. ИНТЕРАКТИВНЫЙ СТАКАНЧИК С ПАЛОЧКАМИ «ВАРИБАСИ» В ЗОНЕ МИСОК И КОРОБОК (x = 0.60, z = -0.36)
    // Тап по палочкам кладёт их на поднос или в пакет на центральном столе!
    const chopX = 0.6;
    const chopY = 0.902;
    const chopZ = -0.36;
    const asm = rt.assembly || {};
    const chopPulse = (asm.hasTray || asm.hasBag) && !asm.hasChopsticks ? 0.55 + 0.35 * Math.sin(this.time * 6) : 0.18;
    this.drawMesh('cylinder', chopX, chopY + 0.048, chopZ, 0.076, 0.096, 0.076, [0.22, 0.15, 0.12], 0.1, null, 0.65);
    this.drawMesh('torus', chopX, chopY + 0.096, chopZ, 0.078, 0.009, 0.078, [0.95, 0.72, 0.28], chopPulse, null, 0.85);
    for (let c = 0; c < 6; c++) {
      const ang = (c - 2.5) * 0.12;
      this.drawBox(chopX + (c % 2) * 0.008, chopY + 0.126, chopZ + (c - 2.5) * 0.007, 0.006, 0.102, 0.011, [0.95, 0.93, 0.88], 0.22, [ang, 0, ang * 0.4]);
      this.drawBox(chopX + (c % 2) * 0.008, chopY + 0.136, chopZ + (c - 2.5) * 0.007, 0.007, 0.026, 0.012, [0.88, 0.16, 0.24], 0.4, [ang, 0, ang * 0.4]);
    }
    if (isWarehouseInteract) {
      this.registerHitbox('table_chopsticks', chopX, chopY + 0.095, chopZ, 70);
    }

    // 2. ДИСПЕНСЕР ОТКРЫТЫХ КАРТОННЫХ КОРОБОЧЕК ДЛЯ ВОКА ВДОЛЬ ПРАВОЙ СТЕНКИ (x = 0.84, z = -0.50)
    const boxX = 0.84;
    const boxZ = -0.5;
    this.drawBox(boxX, 0.904, boxZ, 0.23, 0.024, 0.21, [0.14, 0.2, 0.28], 0.1, null, 0.75);
    this.drawBox(boxX - 0.108, 0.914, boxZ, 0.01, 0.008, 0.19, [0.0, 0.96, 0.83], needVesselPulse);
    for (const [dx, dz] of [[-0.102, -0.09], [0.102, -0.09], [-0.102, 0.09], [0.102, 0.09]]) {
      this.drawMesh('cylinder', boxX + dx, 0.975, boxZ + dz, 0.012, 0.12, 0.012, [0.62, 0.68, 0.76], 0.1, null, 0.9);
    }

    // Когда левая рука берёт верхнюю коробку (grabbingBox), на стопке остаются 2 нижние коробки,
    // а верхняя плавно переносится левой рукой в drawHeldVesselInLeftHand3D!
    const grabbingBox =
      (this.rightGrabAnim.active && this.rightGrabAnim.type === 'box') ||
      (this.rightReturnAnim.active &&
        this.rightReturnAnim.type === 'box' &&
        this.rightReturnAnim.timer / this.rightReturnAnim.duration < 0.72) ||
      (this.handPourAnim.active &&
        this.handPourAnim.toType === 'box' &&
        this.handPourAnim.timer / this.handPourAnim.duration >= 0.22);
    const boxStackCount = grabbingBox ? 2 : 3;
    for (let k = 0; k < boxStackCount; k++) {
      const by = 0.914 + k * 0.042;
      this.draw3DWokBox(boxX, by, boxZ, 0.56 + k * 0.02, false);
    }

    if (isWarehouseInteract) {
      this.registerHitbox('vessel_box', boxX, 1.0, boxZ, 78);
    }

    // 3. ПРЕМИАЛЬНЫЙ ПОЛЫЙ 3D КРИО-ХОЛОДИЛЬНИК С ПРОЗРАЧНОЙ СТЕКЛЯННОЙ ВИТРИНОЙ И ОТКРЫВАЮЩЕЙСЯ ДВЕРЦЕЙ!
    // (x = 0.72..1.08, z = 0.02..0.52, y = 0.895..1.66)
    const fZ = 0.27;
    const fFrontX = 0.72;
    const fBackX = 1.08;
    const fDepth = fBackX - fFrontX; // 0.36
    const fMidX = (fFrontX + fBackX) * 0.5; // 0.90
    const fWidth = 0.5; // z = 0.02 .. 0.52
    const shellDark = [0.14, 0.19, 0.26];
    const shellTrim = [0.22, 0.28, 0.37];
    const innerSteel = [0.64, 0.78, 0.88];
    const innerBack = [0.48, 0.68, 0.82];

    // 3А. ПОЛЫЙ КОРПУС ИЗ 5 ОТДЕЛЬНЫХ СТЕНОК (НИКАКОГО СПЛОШНОГО БЛОКА ВНУТРИ — ВИДНО НАСКВОЗЬ!)
    // Нижний цоколь и дно внутренней камеры
    this.drawBox(fMidX, 0.918, fZ, fDepth, 0.046, fWidth, shellDark, 0.08, null, 0.8);
    this.drawBox(fMidX - 0.01, 0.942, fZ, fDepth - 0.03, 0.008, fWidth - 0.04, innerSteel, 0.16, null, 0.85);
    // Задняя стенка (внешний кожух + светлая охлаждаемая внутренняя панель)
    this.drawBox(fBackX - 0.014, 1.255, fZ, 0.028, 0.66, fWidth, shellDark, 0.08, null, 0.82);
    this.drawBox(fBackX - 0.032, 1.255, fZ, 0.01, 0.61, fWidth - 0.044, innerBack, 0.28, null, 0.75);
    // Внутренние вертикальные крио-LED полосы подсветки в дальних углах камеры!
    this.drawBox(fBackX - 0.042, 1.255, fZ - fWidth * 0.44, 0.012, 0.58, 0.014, [0.58, 0.95, 1.0], 0.95);
    this.drawBox(fBackX - 0.042, 1.255, fZ + fWidth * 0.44, 0.012, 0.58, 0.014, [0.58, 0.95, 1.0], 0.95);
    // Левая (z = 0.03) и правая (z = 0.51) боковые стенки корпуса + светлые внутренние вкладыши
    for (const side of [-1, 1]) {
      const sz = fZ + side * (fWidth * 0.5 - 0.013);
      const isz = fZ + side * (fWidth * 0.5 - 0.026);
      this.drawBox(fMidX, 1.255, sz, fDepth, 0.66, 0.026, shellDark, 0.09, null, 0.82);
      this.drawBox(fMidX - 0.006, 1.255, isz, fDepth - 0.034, 0.61, 0.006, innerSteel, 0.18, null, 0.78);
    }
    // Потолок внутренней камеры + верхняя ледяная LED-лампа внутри
    this.drawBox(fMidX, 1.57, fZ, fDepth, 0.024, fWidth, shellTrim, 0.12, null, 0.85);
    this.drawBox(fFrontX + 0.075, 1.555, fZ, 0.034, 0.01, fWidth - 0.09, [0.82, 0.98, 1.0], 0.98);

    // Верхний компрессорный козырёк с цифровым дисплеем «-4°C» и решёткой радиатора
    this.drawBox(fMidX - 0.006, 1.622, fZ, fDepth + 0.014, 0.088, fWidth + 0.012, shellTrim, 0.12, null, 0.88);
    this.drawBox(fFrontX - 0.014, 1.622, fZ - 0.11, 0.01, 0.044, 0.12, [0.04, 0.08, 0.12], 0.15);
    this.drawBox(fFrontX - 0.019, 1.622, fZ - 0.11, 0.005, 0.024, 0.085, [0.0, 0.96, 0.88], 0.96);
    // Вентиляционные жалюзи справа на козырьке
    for (let v = 0; v < 4; v++) {
      this.drawBox(fFrontX - 0.014, 1.602 + v * 0.013, fZ + 0.09, 0.01, 0.006, 0.17, [0.08, 0.11, 0.16], 0.08);
    }

    // 3Б. ТРИ ВНУТРЕННИЕ СТАЛЬНЫЕ ПОЛКИ-РЕШЁТКИ С ПЕРЕДНЕЙ ХРОМИРОВАННОЙ КРОМКОЙ
    const shelfBotY = 0.955;
    const shelfMidY = 1.155;
    const shelfTopY = 1.365;
    for (const sy of [shelfMidY, shelfTopY]) {
      this.drawBox(fMidX - 0.006, sy, fZ, fDepth - 0.06, 0.011, fWidth - 0.056, [0.68, 0.76, 0.84], 0.2, null, 0.92);
      this.drawBox(fFrontX + 0.028, sy, fZ, 0.014, 0.016, fWidth - 0.052, [0.82, 0.88, 0.94], 0.26, null, 0.96);
    }

    const colZs = [fZ - 0.155, fZ, fZ + 0.155]; // [0.115, 0.27, 0.425]
    const unlockedTop = gameState.getUnlockedToppings();
    const maxCap = gameState.getMaxTrayCap();

    // 3В. ВЕРХНЯЯ ПОЛКА (y = 1.365): ЖЕСТЯНЫЕ БАНКИ НАПИТКОВ 3-Х ВИДОВ В 3 РЯДА (ПО 3 БАНКИ В ГЛУБИНУ!)
    const drinkRows = ['cola', 'matcha', 'ramune'];
    const drinkDepthXs = [0.79, 0.88, 0.97];
    const frontCanGrabbed =
      this.drinkPlaceAnim.active && this.drinkPlaceAnim.timer / this.drinkPlaceAnim.duration >= 0.24;
    for (let rIdx = 0; rIdx < drinkRows.length; rIdx++) {
      const dId = drinkRows[rIdx];
      const dz = colZs[rIdx];
      const dCfg = GAME_CONFIG.DRINKS?.[dId];
      // Тонкий цветной ценник-маркер ряда на передней планке верхней полки
      this.drawBox(fFrontX + 0.02, shelfTopY, dz, 0.005, 0.012, 0.1, dCfg?.bodyCol || [0.9, 0.2, 0.2], 0.72);
      for (let dIdx = 0; dIdx < drinkDepthXs.length; dIdx++) {
        // До p = 0.24 банка стоит на полке, пока правая рука тянется к ней; как только рука схватила — банка едет в руке!
        if (dIdx === 0 && frontCanGrabbed && this.drinkPlaceAnim.drinkId === dId) continue;
        this.draw3DDrinkCan(drinkDepthXs[dIdx], shelfTopY + 0.007, dz, dId, 1.0);
      }
      if (isFridgeInteract) {
        this.registerHitbox(`fridge_drink_${dId}`, 0.81, shelfTopY + 0.068, dz, 48);
      }
    }

    // Вспомогательная функция отрисовки стального гастро-контейнера с 3D-ингредиентом внутри холодильника!
    const drawFridgeIngredientContainer = (topId, cy, cz) => {
      const isUnlocked = unlockedTop.includes(topId);
      const stock = gameState.persistent.trayStock[topId] ?? 0;
      const ratio = isUnlocked ? stock / maxCap : 0;
      const cx = 0.88;
      const cwX = 0.21; // глубина по X
      const cwZ = 0.132; // ширина по Z

      // Стальной корпус контейнера + верхний фланец
      this.drawBox(cx, cy + 0.024, cz, cwX, 0.044, cwZ, isUnlocked ? [0.34, 0.4, 0.48] : [0.2, 0.22, 0.27], 0.1, null, 0.85);
      this.drawBox(cx, cy + 0.046, cz, cwX + 0.012, 0.007, cwZ + 0.012, [0.76, 0.82, 0.9], 0.18, null, 0.94);

      // LED-индикатор уровня запаса на столе на переднем торце контейнера!
      let indCol = [0.35, 0.4, 0.46];
      let indGlow = 0.12;
      if (isUnlocked) {
        if (ratio <= 0) {
          indCol = [1.0, 0.16, 0.28];
          indGlow = 0.55 + 0.45 * Math.sin(this.time * 9.0);
        } else if (ratio < 1) {
          indCol = [1.0, 0.72, 0.1];
          indGlow = 0.55 + 0.35 * Math.sin(this.time * 6.0);
        } else {
          indCol = [0.0, 0.96, 0.83];
          indGlow = 0.65;
        }
      }
      this.drawBox(cx - cwX * 0.5 - 0.003, cy + 0.026, cz, 0.006, 0.014, cwZ * 0.72, indCol, indGlow);

      // Содержимое контейнера (3D-ингредиенты прямо как на столе!)
      if (!isUnlocked) {
        this.drawBox(cx, cy + 0.052, cz, cwX * 0.76, 0.012, cwZ * 0.74, [0.16, 0.18, 0.23], 0.06);
      } else if (topId === 'egg') {
        this.drawBox(cx, cy + 0.042, cz, cwX - 0.018, 0.008, cwZ - 0.018, [0.22, 0.13, 0.08], 0.08);
        this.draw3DAjitamaEggHalf(cx - 0.045, cy + 0.048, cz - 0.022, 0.78, 0.35);
        this.draw3DAjitamaEggHalf(cx + 0.01, cy + 0.048, cz + 0.02, 0.78, -0.4);
        this.draw3DAjitamaEggHalf(cx + 0.052, cy + 0.048, cz - 0.012, 0.76, 0.8);
      } else if (topId === 'chashu') {
        this.drawBox(cx, cy + 0.042, cz, cwX - 0.018, 0.008, cwZ - 0.018, [0.2, 0.1, 0.09], 0.08);
        this.draw3DChashuSlice(cx - 0.042, cy + 0.056, cz, 0.78, [0.18, 0.3, 0.12]);
        this.draw3DChashuSlice(cx + 0.01, cy + 0.06, cz + 0.008, 0.78, [0.22, -0.2, 0.1]);
        this.draw3DChashuSlice(cx + 0.052, cy + 0.056, cz - 0.006, 0.76, [0.14, 0.1, 0.08]);
      } else if (topId === 'nori') {
        this.drawBox(cx, cy + 0.042, cz, cwX - 0.018, 0.008, cwZ - 0.018, [0.06, 0.1, 0.08], 0.06);
        for (let n = 0; n < 3; n++) {
          this.draw3DNoriSheet(cx - 0.04 + n * 0.04, cy + 0.072, cz, 0.68, [-0.15, 0.25, 0.08]);
        }
      } else if (topId === 'scallion') {
        this.drawBox(cx, cy + 0.042, cz, cwX - 0.018, 0.01, cwZ - 0.018, [0.09, 0.3, 0.12], 0.16);
        for (let g = 0; g < 6; g++) {
          const gx = cx - 0.055 + (g % 3) * 0.052;
          const gz = cz + (g < 3 ? -0.024 : 0.024);
          this.draw3DScallionRing(gx, cy + 0.054 + (g % 2) * 0.006, gz, 0.88, [0.2, g * 0.6, 0.1]);
        }
      } else if (topId === 'shrimp') {
        this.drawBox(cx, cy + 0.042, cz, cwX - 0.018, 0.008, cwZ - 0.018, [0.18, 0.13, 0.07], 0.08);
        this.draw3DTempuraShrimp(cx - 0.028, cy + 0.056, cz - 0.014, 0.76, 0.35);
        this.draw3DTempuraShrimp(cx + 0.032, cy + 0.058, cz + 0.016, 0.76, -0.45);
      } else if (topId === 'chili') {
        this.drawBox(cx, cy + 0.044, cz, cwX - 0.018, 0.012, cwZ - 0.018, [0.76, 0.08, 0.12], 0.45);
        for (const ox of [-0.036, 0.034]) {
          this.drawMesh('cylinder', cx + ox, cy + 0.078, cz, 0.036, 0.068, 0.036, [0.96, 0.14, 0.22], 0.48, null, 0.78);
          this.drawMesh('cone', cx + ox, cy + 0.122, cz, 0.016, 0.026, 0.016, [1.0, 0.52, 0.1], 0.55);
        }
      }

      if (isFridgeInteract) {
        this.registerHitbox(`fridge_top_${topId}`, cx - 0.03, cy + 0.058, cz, 48);
      }
    };

    // 3Г. СРЕДНЯЯ ПОЛКА (y = 1.155): ВЕРХНИЙ РЯД ИНГРЕДИЕНТОВ СТОЛА (ЯЙЦО, СВИНИНА, НОРИ)
    drawFridgeIngredientContainer('egg', shelfMidY + 0.006, colZs[0]);
    drawFridgeIngredientContainer('chashu', shelfMidY + 0.006, colZs[1]);
    drawFridgeIngredientContainer('nori', shelfMidY + 0.006, colZs[2]);

    // 3Д. НИЖНЯЯ ПОЛКА (y = 0.955): НИЖНИЙ РЯД ИНГРЕДИЕНТОВ СТОЛА (ЛУК, КРЕВЕТКА, ЧИЛИ)
    drawFridgeIngredientContainer('scallion', shelfBotY - 0.004, colZs[0]);
    drawFridgeIngredientContainer('shrimp', shelfBotY - 0.004, colZs[1]);
    drawFridgeIngredientContainer('chili', shelfBotY - 0.004, colZs[2]);

    // 3Е. АНИМАЦИИ ПРАВОЙ РУКИ ВНУТРИ ХОЛОДИЛЬНИКА (ПОПОЛНЕНИЕ КОНТЕЙНЕРА И ЗАБОР БАНКИ НАПИТКА!)
    if (this.fridgeRestockAnim.active) {
      const topPosMap = {
        egg: [0.84, shelfMidY + 0.065, colZs[0]],
        chashu: [0.84, shelfMidY + 0.065, colZs[1]],
        nori: [0.84, shelfMidY + 0.065, colZs[2]],
        scallion: [0.84, shelfBotY + 0.055, colZs[0]],
        shrimp: [0.84, shelfBotY + 0.055, colZs[1]],
        chili: [0.84, shelfBotY + 0.055, colZs[2]]
      };
      const tp = topPosMap[this.fridgeRestockAnim.toppingId] || topPosMap.egg;
      const p = Math.min(1, this.fridgeRestockAnim.timer / this.fridgeRestockAnim.duration);
      let gx, gy, gz;
      if (p < 0.35) {
        const s = (p / 0.35) * (p / 0.35) * (3 - 2 * (p / 0.35));
        gx = 0.48 + (tp[0] - 0.48) * s;
        gy = 1.02 + (tp[1] - 1.02) * s;
        gz = tp[2] + 0.08 * (1 - s);
      } else {
        const t = (p - 0.35) / 0.65;
        const s = t * t * (3 - 2 * t);
        gx = tp[0] + (0.42 - tp[0]) * s;
        gy = tp[1] + Math.sin(t * Math.PI) * 0.08 - 0.06 * s;
        gz = tp[2] - 0.42 * s;
        // Мини-контейнер пополнения летит в руке из холодильника налево к столу!
        this.drawBox(gx, gy - 0.02, gz, 0.12, 0.036, 0.095, [0.42, 0.5, 0.6], 0.2, [0, 0.2, 0], 0.9);
        this.drawBox(gx, gy, gz, 0.1, 0.012, 0.075, [0.0, 0.96, 0.88], 0.78);
      }
      this.drawBox(gx - 0.04, gy + 0.02, gz + 0.02, 0.11, 0.038, 0.068, [0.16, 0.14, 0.24], 0.24, [0.1, 0.2, -0.15]);
      this.drawBox(gx - 0.04, gy + 0.04, gz + 0.02, 0.038, 0.011, 0.072, [0.0, 0.96, 0.83], 0.94, [0.1, 0.2, -0.15]);
    }

    // 3Ж. ОТКРЫВАЮЩАЯСЯ ПРОЗРАЧНАЯ СТЕКЛЯННАЯ ДВЕРЦА НА ПЕТЛЯХ СПРАВА (pivot: x = 0.72, z = 0.51)
    // Рисуется В САМОМ КОНЦЕ после всех полок и продуктов, чтобы прозрачное стекло идеально просвечивало содержимое!
    const doorT = Math.max(0, Math.min(1, this.fridgeDoorOpenT));
    const doorSmooth = doorT * doorT * (3 - 2 * doorT);
    const doorAng = doorSmooth * 1.92; // Распахивается наружу и вправо на ~110°!
    const pivotX = fFrontX;
    const pivotZ = fZ + fWidth * 0.5 - 0.01; // 0.51
    const doorW = fWidth - 0.02; // 0.48
    const doorH = 0.62;
    const doorMidY = 1.255;
    const cosD = Math.cos(doorAng);
    const sinD = Math.sin(doorAng);
    const doorPt = (lx, lz) => [
      pivotX + lx * cosD + lz * sinD,
      pivotZ - lx * sinD + lz * cosD
    ];
    const doorRot = [0, doorAng, 0];
    const frameCol = [0.7, 0.77, 0.86];

    // Две петли справа
    this.drawBox(pivotX, 1.02, pivotZ, 0.02, 0.036, 0.022, [0.46, 0.52, 0.6], 0.15, null, 0.95);
    this.drawBox(pivotX, 1.49, pivotZ, 0.02, 0.036, 0.022, [0.46, 0.52, 0.6], 0.15, null, 0.95);

    // 4 алюминиевых профиля рамы дверцы
    const [flx, flz] = doorPt(0, -doorW + 0.012);
    const [frx, frz] = doorPt(0, -0.012);
    const [fcx, fcz] = doorPt(0, -doorW * 0.5);
    this.drawBox(flx, doorMidY, flz, 0.022, doorH, 0.024, frameCol, 0.22, doorRot, 0.94);
    this.drawBox(frx, doorMidY, frz, 0.022, doorH, 0.024, frameCol, 0.22, doorRot, 0.94);
    this.drawBox(fcx, doorMidY + doorH * 0.5 - 0.012, fcz, 0.022, 0.024, doorW, frameCol, 0.22, doorRot, 0.94);
    this.drawBox(fcx, doorMidY - doorH * 0.5 + 0.012, fcz, 0.022, 0.024, doorW, frameCol, 0.22, doorRot, 0.94);

    // Вертикальная хромированная ручка дверцы (со стороны открывания слева!) + 2 кронштейна
    const [hx, hz] = doorPt(-0.034, -doorW + 0.044);
    const [hbx, hbz] = doorPt(-0.017, -doorW + 0.044);
    this.drawMesh('cylinder', hx, doorMidY, hz, 0.015, 0.26, 0.015, [0.88, 0.93, 0.98], 0.28, doorRot, 0.98);
    this.drawBox(hbx, doorMidY + 0.1, hbz, 0.032, 0.014, 0.014, [0.76, 0.82, 0.9], 0.22, doorRot, 0.96);
    this.drawBox(hbx, doorMidY - 0.1, hbz, 0.032, 0.014, 0.014, [0.76, 0.82, 0.9], 0.22, doorRot, 0.96);

    // НАСТОЯЩЕЕ ПРОЗРАЧНОЕ СТЕКЛО ВИТРИНЫ (pattern = 6, alpha = 0.22 — сквозь него чётко видны все 3 полки!)
    this.drawBox(fcx, doorMidY, fcz, 0.005, doorH - 0.046, doorW - 0.046, [0.32, 0.84, 1.0], 0.26, doorRot, 0.98, 6, 0.22);

    // 3З. ПРАВАЯ РУКА ГЕРОЯ, ОТКРЫВАЮЩАЯ И ЗАКРЫВАЮЩАЯ ДВЕРЦУ ЗА ХРОМИРОВАННУЮ РУЧКУ!
    if (this.fridgeDoorHandAnim.active) {
      const p = Math.min(1, this.fridgeDoorHandAnim.timer / this.fridgeDoorHandAnim.duration);
      const wave = Math.sin(p * Math.PI);
      const grabX = hx - 0.055 * (1 - wave) - 0.025;
      const grabY = doorMidY - 0.06 * (1 - wave);
      const grabZ = hz + 0.02;
      const handRot = [0.08, doorAng + 0.35, -0.14];
      // Кибер-перчатка правой руки на ручке дверцы + предплечье
      this.drawBox(grabX, grabY, grabZ, 0.115, 0.042, 0.072, [0.16, 0.14, 0.24], 0.24, handRot);
      this.drawBox(grabX, grabY + 0.022, grabZ, 0.04, 0.012, 0.076, [0.0, 0.96, 0.83], 0.95, handRot);
      this.drawBox(grabX - 0.09, grabY - 0.03, grabZ + 0.04, 0.13, 0.048, 0.078, [0.11, 0.13, 0.2], 0.16, handRot);
    }

    if (isWarehouseInteract) {
      // Регистрируем хитбоксы и на самой ручке, и по всей плоскости дверцы холодильника — открывается с любого тапа!
      this.registerHitbox('cryo_fridge', hx, doorMidY, hz, 96);
      this.registerHitbox('cryo_fridge', fFrontX + 0.04, doorMidY, fZ + 0.05, 112);
    }
  }

  // Индивидуальные пропорции и рост каждого из 4 персонажей:
  // У всех нижний край квада уходит глубоко за новую заднюю стенку-бортик тележки (bottomY = 0.64),
  // а верхняя макушка отражает индивидуальный рост:
  // - Райдэн (samurai): высокий и широкоплечий
  // - Аканэ (corpo): высокая статная осанка
  // - Кира (student): средний рост
  // - Никс (hacker): миниатюрная, низенькая
  getCustomerDimensions(cust) {
    const id = cust?.id || 'student';
    const map = {
      samurai: { w: 0.86, h: 1.24, y: 1.26 }, // макушка y = 1.88, низ y = 0.64 (за стенкой!)
      corpo: { w: 0.76, h: 1.14, y: 1.21 },   // макушка y = 1.78, низ y = 0.64 (за стенкой!)
      student: { w: 0.74, h: 1.08, y: 1.18 }, // макушка y = 1.72, низ y = 0.64 (за стенкой!)
      hacker: { w: 0.66, h: 0.92, y: 1.10 }   // макушка y = 1.56, низ y = 0.64 (за стенкой!)
    };
    return map[id] || map.student;
  }

  drawCustomerAndCourier3D() {
    const rt = gameState.runtime;
    const cust = rt.currentCustomer;
    const nextCust = rt.nextCustomer;

    // 1. ВТОРОЙ ПОКУПАТЕЛЬ В ОЧЕРЕДИ (стоит почти сразу за первым покупателем, чуть левее его плеча, со своим собственным ростом!)
    if (nextCust && this.animeCustomerRenderer) {
      const dims2 = this.getCustomerDimensions(nextCust);
      const bob2 = Math.sin(this.time * 2.2 + 1.4) * 0.012;
      const sway2 = Math.cos(this.time * 1.15 + 0.9) * 0.008;
      const stepIn = nextCust.stepInProgress ?? 1.0;

      const qx = -0.22 + (-0.05 - -0.22) * stepIn + sway2;
      const qy = dims2.y + 0.01 + bob2;
      const qz = -1.68 + (-1.42 - -1.68) * stepIn;

      const nextTex = this.animeCustomerRenderer.updateCustomerTexture(
        nextCust,
        false,
        this.time
      );

      this.drawTexturedQuad(nextTex, qx, qy, qz, dims2.w * 0.95, dims2.h * 0.95, 0.8);
    }

    // 2. ПЕРВЫЙ ПОКУПАТЕЛЬ У ПРИЛАВКА (x = 0.20, z = -1.24; со своим ростом и плавным шагом вперёд из очереди!)
    if (cust && this.animeCustomerRenderer) {
      const dims1 = this.getCustomerDimensions(cust);
      const bob = Math.sin(this.time * 2.6) * 0.014;
      const sway = Math.cos(this.time * 1.4) * 0.008;
      const stepFwd = cust.stepForwardProgress ?? 1.0;

      const cx = -0.05 + (0.2 - -0.05) * stepFwd + sway;
      const cy = dims1.y + 0.01 * (1 - stepFwd) + bob;
      const cz = -1.42 + (-1.24 - -1.42) * stepFwd;

      const custTex = this.animeCustomerRenderer.updateCustomerTexture(
        cust,
        rt.customerTalking,
        this.time
      );

      this.drawTexturedQuad(custTex, cx, cy, cz, dims1.w, dims1.h, 0.88);

      // Диегетический неоновый индикатор терпения над головой гостя (с учётом его роста!)
      const patRatio = Math.max(0.05, cust.patience / 100);
      const patCol =
        patRatio > 0.5
          ? [0.06, 0.96, 0.42]
          : patRatio > 0.25
            ? [1.0, 0.68, 0.0]
            : [1.0, 0.18, 0.32];
      this.drawBox(
        cx,
        cy + dims1.h * 0.49,
        cz + 0.01,
        0.3 * patRatio,
        0.015,
        0.015,
        patCol,
        0.92
      );

      if (rt.activeSector === 1 && rt.cameraFocus === 'customer' && (rt.customerPanSide || 0) === 0) {
        this.registerHitbox('customer_serve', cx, cy + 0.05, cz, 95);
      }
    }

    // 3. КУРЬЕРСКИЙ ДРОН-РОБОТ CYBER-EATS ЗА ПРИЛАВКОМ СПРАВА ОТ ПОСЕТИТЕЛЕЙ (БЕЗ ПЛАТФОРМЫ, ПАРИТ В ВОЗДУХЕ!)
    const hasDelivery = Boolean(rt.activeDelivery);
    const deliveringNow = this.droneDeliverAnim.active;
    const baseDroneX = 0.78;
    const baseDroneY = 1.38;
    const baseDroneZ = -1.28;

    let droneX = baseDroneX + Math.sin(this.time * 1.9) * 0.018;
    let droneY = baseDroneY + Math.sin(this.time * 3.8) * 0.032;
    let droneZ = baseDroneZ + Math.cos(this.time * 2.1) * 0.014;
    const rotorSpin = this.time * (hasDelivery || deliveringNow ? 26 : 10);

    if (deliveringNow) {
      const p = Math.min(1, this.droneDeliverAnim.timer / this.droneDeliverAnim.duration);
      const handPos = this.getLeftHandWorldPos();

      if (p < 0.46) {
        // Фаза 1: Вок-коробка поднимается из левой руки к парящему за прилавком дрону, её 4 клапана автоматически закрываются!
        const t = p / 0.46;
        const s = t * t * (3 - 2 * t);
        const bx = handPos[0] + (baseDroneX - handPos[0]) * s;
        const by = handPos[1] + (baseDroneY - 0.16 - handPos[1]) * s + Math.sin(t * Math.PI) * 0.06;
        const bz = handPos[2] + (baseDroneZ - handPos[2]) * s;
        const sealProg = Math.min(1, t * 1.15);
        this.drawFilledVessel3D(bx, by, bz, { ...this.droneDeliverAnim.vessel, type: 'box' }, 0.6, sealProg);
      } else {
        // Фаза 2: Запечатанная вок-коробка захвачена лапами дрона, и дрон улетает в ночное небо переулка!
        const t = (p - 0.46) / 0.54;
        const fly = t * t;
        droneY = baseDroneY + fly * 0.95;
        droneZ = baseDroneZ - fly * 2.2;
        droneX = baseDroneX + fly * 0.25;
        this.drawFilledVessel3D(
          droneX,
          droneY - 0.16,
          droneZ,
          { ...this.droneDeliverAnim.vessel, type: 'box' },
          0.56,
          1.0
        );
      }
    }

    const bodyCol = hasDelivery || deliveringNow ? [0.1, 0.24, 0.34] : [0.14, 0.18, 0.24];
    const visorCol = hasDelivery || deliveringNow ? [0.06, 0.96, 0.42] : [0.0, 0.88, 0.82];
    this.drawMesh('sphere', droneX, droneY, droneZ, 0.24, 0.1, 0.2, bodyCol, 0.22, null, 0.88);
    this.drawMesh('sphere', droneX, droneY + 0.042, droneZ, 0.15, 0.055, 0.14, [0.22, 0.28, 0.38], 0.18, null, 0.92);
    this.drawMesh('sphere', droneX, droneY - 0.005, droneZ + 0.098, 0.1, 0.05, 0.04, visorCol, 0.95);

    // Нижние грузовые захваты-клешни для фиксации вок-коробки
    this.drawBox(droneX - 0.07, droneY - 0.07, droneZ, 0.015, 0.065, 0.022, [0.68, 0.75, 0.84], 0.2, [0, 0, 0.15], 0.9);
    this.drawBox(droneX + 0.07, droneY - 0.07, droneZ, 0.015, 0.065, 0.022, [0.68, 0.75, 0.84], 0.2, [0, 0, -0.15], 0.9);

    // 4 луча квадрокоптера с защитными кольцами и вращающимися неоновыми винтами
    const armOffsets = [
      [-0.13, -0.11, [1.0, 0.18, 0.54]],
      [0.13, -0.11, [0.0, 0.96, 0.83]],
      [-0.13, 0.11, [0.0, 0.96, 0.83]],
      [0.13, 0.11, [1.0, 0.18, 0.54]]
    ];
    for (const [ax, az, rCol] of armOffsets) {
      this.drawBox(droneX + ax * 0.6, droneY + 0.01, droneZ + az * 0.6, 0.11, 0.015, 0.02, [0.32, 0.38, 0.46], 0.15, [0, Math.atan2(ax, az), 0]);
      this.drawMesh('torus', droneX + ax, droneY + 0.024, droneZ + az, 0.1, 0.009, 0.1, rCol, hasDelivery ? 0.85 : 0.35);
      this.drawBox(droneX + ax, droneY + 0.028, droneZ + az, 0.095, 0.008, 0.02, rCol, 0.92, [0, rotorSpin, 0]);
    }

    if (rt.activeSector === 1 && rt.cameraFocus === 'customer' && (rt.customerPanSide || 0) >= 0) {
      this.registerHitbox('courier_drone', droneX, droneY - 0.03, droneZ, 102);
    }

    if (gameState.persistent.inDebtCollector) {
      this.drawMesh('cylinder', -0.78, 1.18, -1.45, 0.4, 0.58, 0.26, [0.1, 0.04, 0.08], 0.0);
      this.drawMesh('sphere', -0.78, 1.54, -1.45, 0.26, 0.26, 0.26, [0.2, 0.18, 0.22], 0.0);
      this.drawBox(-0.78, 1.55, -1.31, 0.23, 0.05, 0.04, [1.0, 0.1, 0.2], 1.0);
    }
  }

  // =========================================================================
  // 3D-МИСКА ИЛИ ВОК-КОРОБКА В ЛЕВОЙ РУКЕ ПОВАРА (ВСЕГДА С СОБОЙ ВО ВСЕХ СЕКТОРАХ!)
  // =========================================================================
  drawHeldVesselInLeftHand3D() {
    const rt = gameState.runtime;

    // АНИМАЦИЯ ВОЗВРАТА ПУСТОЙ МИСКИ ИЛИ КОРОБКИ ИЗ ЛЕВОЙ РУКИ ОБРАТНО НА СТОПКУ (Сектор 2):
    // 1) p < 0.72: левая рука по дуге переносит пустую посуду обратно на верхушку стопки;
    // 2) p >= 0.72: посуда уже стоит на стопке, а пустая левая рука плавно уходит обратно вниз.
    if (this.rightReturnAnim.active) {
      const basePos = this.getLeftHandWorldPos();
      const { F, R } = this.getCameraBasis();
      const yawAngle = Math.atan2(-F[0], -F[2]);
      const isBox = this.rightReturnAnim.type === 'box';
      const stackX = 0.84;
      const topBowlIdx = Math.max(0, Math.min(9, this.rightReturnAnim.targetIdx || 0));
      const stackY = isBox ? 0.998 : 0.918 + topBowlIdx * 0.02;
      const stackZ = isBox ? -0.5 : -0.22;
      const stackScale = isBox ? 0.6 : 0.48;
      const p = Math.min(1, this.rightReturnAnim.timer / this.rightReturnAnim.duration);

      let handAnchorX, handAnchorY, handAnchorZ;
      if (p < 0.72) {
        const t = p / 0.72;
        const s = t * t * (3 - 2 * t);
        const liftArc = Math.sin(t * Math.PI) * 0.08;
        const vx = basePos[0] + (stackX - basePos[0]) * s;
        const vy = basePos[1] + (stackY - basePos[1]) * s + liftArc;
        const vz = basePos[2] + (stackZ - basePos[2]) * s;
        const vsc = 0.64 + (stackScale - 0.64) * s;
        this.drawFilledVessel3D(
          vx,
          vy,
          vz,
          { type: this.rightReturnAnim.type, broth: null, noodleState: null, toppings: [] },
          vsc,
          false
        );
        handAnchorX = vx;
        handAnchorY = vy;
        handAnchorZ = vz;
      } else {
        const t = (p - 0.72) / 0.28;
        const s = t * t * (3 - 2 * t);
        handAnchorX = stackX + (basePos[0] - stackX) * s;
        handAnchorY = stackY + (basePos[1] - 0.14 - stackY) * s;
        handAnchorZ = stackZ + (basePos[2] - stackZ) * s;
      }

      const lhX = handAnchorX - R[0] * 0.092 - F[0] * 0.056;
      const lhY = handAnchorY - 0.036;
      const lhZ = handAnchorZ - R[2] * 0.092 - F[2] * 0.056;
      const lhRot = [0.06, yawAngle - 0.34, 0.12];
      this.drawBox(lhX, lhY, lhZ, 0.074, 0.034, 0.13, [0.16, 0.14, 0.24], 0.22, lhRot);
      this.drawBox(lhX, lhY + 0.018, lhZ, 0.078, 0.011, 0.04, [0.0, 0.96, 0.83], 0.92, lhRot);
      this.drawBox(
        handAnchorX - R[0] * 0.124 - F[0] * 0.022,
        handAnchorY + 0.022,
        handAnchorZ - R[2] * 0.124 - F[2] * 0.022,
        0.024,
        0.024,
        0.048,
        [0.2, 0.18, 0.3],
        0.25,
        [0.08, yawAngle - 0.15, 0.24]
      );
      this.drawBox(
        lhX - R[0] * 0.055 - F[0] * 0.082,
        lhY - 0.024,
        lhZ - R[2] * 0.055 - F[2] * 0.082,
        0.08,
        0.048,
        0.135,
        [0.11, 0.13, 0.2],
        0.15,
        lhRot
      );
      return;
    }

    const v = rt.activeVessel;
    if (!v || (v.type !== 'bowl' && v.type !== 'box')) return;
    if (
      this.droneDeliverAnim.active ||
      this.trashTossAnim.active ||
      rt.cameraFocus === 'under_counter' ||
      (rt.activeSector === -1 && (this.sinkWashAnim.active || this.rackPickupAnim.active))
    ) {
      return;
    }

    const basePos = this.getLeftHandWorldPos();
    let hx = basePos[0];
    let hy = basePos[1];
    let hz = basePos[2];
    let vesselScale = 0.64;

    // Координаты самой левой кисти (во время взятия со стопки рука сначала тянется к стопке, а затем забирает посуду к себе)
    let handAnchorX = hx;
    let handAnchorY = hy;
    let handAnchorZ = hz;

    const slotXCoords = [-0.28, 0.0, 0.28];
    const slotY = 0.906;
    const slotZ = -0.22;

    const { F, R, U } = this.getCameraBasis();
    const yawAngle = Math.atan2(-F[0], -F[2]);

    // СПЕЦИАЛЬНАЯ 4-ФАЗНАЯ АНИМАЦИЯ ПЕРЕЛИВАНИЯ БЕЗ СТОЛА (МИСКА -> КОРОБКА):
    // 1) p < 0.22: Герой перекладывает миску с едой из левой руки в правую руку;
    // 2) 0.22 <= p < 0.56: Освободившаяся левая рука стандартной анимацией берёт коробку со стопки к себе;
    // 3) 0.56 <= p < 0.88: Правая рука поднимает миску с едой над коробкой в левой руке и переливает рамен из правой в левую руку!
    // 4) p >= 0.88: Правая рука убирает опустевшую грязную миску в раковину, а полная коробка остаётся в левой руке!
    if (this.handPourAnim.active) {
      const p = Math.min(1, this.handPourAnim.timer / this.handPourAnim.duration);
      const fromType = this.handPourAnim.fromType || 'bowl';
      const toType = this.handPourAnim.toType || 'box';
      const isBoxTarget = toType === 'box';
      const stackX = 0.84;
      const topBowlIdx = Math.max(0, Math.min(9, rt.cleanBowls ?? 0));
      const stackY = isBoxTarget ? 0.998 : 0.918 + topBowlIdx * 0.02;
      const stackZ = isBoxTarget ? -0.5 : -0.22;
      const stackScale = isBoxTarget ? 0.6 : 0.48;

      // Позиция ожидания правой руки (справа внизу экрана, симметрично левой руке)
      const rightHoldX = basePos[0] + R[0] * 0.23 + F[0] * 0.02;
      const rightHoldY = basePos[1] + U[1] * 0.01;
      const rightHoldZ = basePos[2] + R[2] * 0.23 + F[2] * 0.02;

      const drawRightGloveAt = (rx, ry, rz, extraRoll = 0) => {
        const rhX = rx + R[0] * 0.088 - F[0] * 0.054;
        const rhY = ry - 0.034;
        const rhZ = rz + R[2] * 0.088 - F[2] * 0.054;
        const rhRot = [0.06, yawAngle + 0.34, -0.12 + extraRoll];
        this.drawBox(rhX, rhY, rhZ, 0.074, 0.034, 0.13, [0.16, 0.14, 0.24], 0.22, rhRot);
        this.drawBox(rhX, rhY + 0.018, rhZ, 0.078, 0.011, 0.04, [0.0, 0.96, 0.83], 0.92, rhRot);
        this.drawBox(
          rx + R[0] * 0.12 - F[0] * 0.02,
          ry + 0.022,
          rz + R[2] * 0.12 - F[2] * 0.02,
          0.024,
          0.024,
          0.048,
          [0.2, 0.18, 0.3],
          0.25,
          [0.08, yawAngle + 0.15, -0.24 + extraRoll]
        );
        this.drawBox(
          rhX + R[0] * 0.055 - F[0] * 0.082,
          rhY - 0.024,
          rhZ + R[2] * 0.055 - F[2] * 0.082,
          0.08,
          0.048,
          0.135,
          [0.11, 0.13, 0.2],
          0.15,
          rhRot
        );
      };

      const drawLeftGloveAt = (lx, ly, lz) => {
        const lhX = lx - R[0] * 0.092 - F[0] * 0.056;
        const lhY = ly - 0.036;
        const lhZ = lz - R[2] * 0.092 - F[2] * 0.056;
        const lhRot = [0.06, yawAngle - 0.34, 0.12];
        this.drawBox(lhX, lhY, lhZ, 0.074, 0.034, 0.13, [0.16, 0.14, 0.24], 0.22, lhRot);
        this.drawBox(lhX, lhY + 0.018, lhZ, 0.078, 0.011, 0.04, [0.0, 0.96, 0.83], 0.92, lhRot);
        this.drawBox(
          lx - R[0] * 0.124 - F[0] * 0.022,
          ly + 0.022,
          lz - R[2] * 0.124 - F[2] * 0.022,
          0.024,
          0.024,
          0.048,
          [0.2, 0.18, 0.3],
          0.25,
          [0.08, yawAngle - 0.15, 0.24]
        );
        this.drawBox(
          lhX - R[0] * 0.055 - F[0] * 0.082,
          lhY - 0.024,
          lhZ - R[2] * 0.055 - F[2] * 0.082,
          0.08,
          0.048,
          0.135,
          [0.11, 0.13, 0.2],
          0.15,
          lhRot
        );
      };

      const fullOldVessel = {
        type: fromType,
        broth: v.broth,
        noodleState: v.noodleState,
        toppings: v.toppings || [],
        overflowCount: v.overflowCount || 0
      };
      const emptyNewVessel = {
        type: toType,
        broth: null,
        noodleState: null,
        toppings: [],
        overflowCount: 0
      };
      const fullNewVessel = {
        type: toType,
        broth: v.broth,
        noodleState: v.noodleState,
        toppings: v.toppings || [],
        overflowCount: v.overflowCount || 0
      };

      if (p < 0.22) {
        // ФАЗА 1: Перекладываем наполненную миску из левой руки в правую руку!
        const t = p / 0.22;
        const s = t * t * (3 - 2 * t);
        const arc = Math.sin(t * Math.PI) * 0.045;
        const bx = basePos[0] + (rightHoldX - basePos[0]) * s;
        const by = basePos[1] + (rightHoldY - basePos[1]) * s + arc;
        const bz = basePos[2] + (rightHoldZ - basePos[2]) * s;

        this.drawFilledVessel3D(bx, by, bz, fullOldVessel, 0.62, false);

        // Левая рука передаёт миску до середины и возвращается влево, а правая рука принимает её!
        const lFollow = t < 0.55 ? s : 1 - (t - 0.55) / 0.45;
        drawLeftGloveAt(
          basePos[0] + (rightHoldX - basePos[0]) * 0.45 * lFollow,
          basePos[1] + arc * lFollow,
          basePos[2] + (rightHoldZ - basePos[2]) * 0.45 * lFollow
        );
        drawRightGloveAt(
          rightHoldX + (bx - rightHoldX) * (1 - s * 0.3),
          by,
          rightHoldZ + (bz - rightHoldZ) * (1 - s * 0.3)
        );
        return;
      }

      if (p < 0.56) {
        // ФАЗА 2: Правая рука держит миску с едой справа, а левая рука стандартной анимацией берёт коробку со стопки!
        this.drawFilledVessel3D(rightHoldX, rightHoldY, rightHoldZ, fullOldVessel, 0.6, false);
        drawRightGloveAt(rightHoldX, rightHoldY, rightHoldZ);

        const pGrab = (p - 0.22) / 0.34;
        if (pGrab < 0.28) {
          const t = pGrab / 0.28;
          const s = t * t * (3 - 2 * t);
          this.drawFilledVessel3D(stackX, stackY, stackZ, emptyNewVessel, stackScale, false);
          drawLeftGloveAt(
            basePos[0] + (stackX - basePos[0]) * s,
            basePos[1] + (stackY - basePos[1]) * s + Math.sin(t * Math.PI) * 0.04,
            basePos[2] + (stackZ - basePos[2]) * s
          );
        } else {
          const t = (pGrab - 0.28) / 0.72;
          const s = t * t * (3 - 2 * t);
          const liftArc = Math.sin(t * Math.PI) * 0.085;
          const lx = stackX + (basePos[0] - stackX) * s;
          const ly = stackY + (basePos[1] - stackY) * s + liftArc;
          const lz = stackZ + (basePos[2] - stackZ) * s;
          const sc = stackScale + (0.64 - stackScale) * s;
          this.drawFilledVessel3D(lx, ly, lz, emptyNewVessel, sc, false);
          drawLeftGloveAt(lx, ly, lz);
        }
        return;
      }

      if (p < 0.88) {
        // ФАЗА 3: Правая рука поднимает миску с едой над коробкой в левой руке и переливает рамен из правой руки в левую!
        const t = (p - 0.56) / 0.32;
        const pourCurve = Math.sin(t * Math.PI);

        // В левой руке стоит коробка (после середины переливания она наполняется раменом!)
        const leftHasFood = t >= 0.42;
        this.drawFilledVessel3D(
          basePos[0],
          basePos[1],
          basePos[2],
          leftHasFood ? fullNewVessel : emptyNewVessel,
          0.64,
          false
        );
        drawLeftGloveAt(basePos[0], basePos[1], basePos[2]);

        // Правая рука подносит миску сверху-справа к коробке и наклоняет её влево (против часовой стрелки)
        const pourTargetX = basePos[0] + R[0] * 0.105 + F[0] * 0.01;
        const pourTargetY = basePos[1] + 0.165;
        const pourTargetZ = basePos[2] + R[2] * 0.105 + F[2] * 0.01;
        const liftS = t < 0.25 ? t / 0.25 : t > 0.8 ? (1 - t) / 0.2 : 1.0;
        const rx = rightHoldX + (pourTargetX - rightHoldX) * liftS;
        const ry = rightHoldY + (pourTargetY - rightHoldY) * liftS;
        const rz = rightHoldZ + (pourTargetZ - rightHoldZ) * liftS;
        const tiltZ = 0.78 * pourCurve;

        if (fromType === 'bowl') {
          this.drawDirtyBowl3D(rx, ry, rz, v.broth || 'tonkotsu', 0.54, [0.15 * pourCurve, yawAngle, tiltZ]);
        } else {
          this.drawFilledVessel3D(rx, ry, rz, t < 0.5 ? fullOldVessel : { ...emptyNewVessel, type: fromType }, 0.56, false);
        }
        drawRightGloveAt(rx, ry, rz, tiltZ * 0.65);

        // Горячая 3D-струя бульона и лапши, льющаяся из миски в правой руке прямо в коробку в левой руке!
        if (t > 0.15 && t < 0.85) {
          const bMap = {
            tonkotsu: [0.92, 0.74, 0.44],
            chili_broth: [0.95, 0.18, 0.2],
            miso_mushroom: [0.68, 0.18, 0.92]
          };
          const bCol = bMap[v.broth] || bMap.tonkotsu;
          const streamX = (rx + basePos[0]) * 0.5;
          const streamZ = (rz + basePos[2]) * 0.5;
          const streamTopY = ry + 0.02;
          const streamBotY = basePos[1] + 0.065;
          const streamH = Math.max(0.04, streamTopY - streamBotY);
          this.drawMesh(
            'cylinder',
            streamX,
            (streamTopY + streamBotY) * 0.5,
            streamZ,
            0.024,
            streamH,
            0.024,
            bCol,
            0.86,
            null,
            0.95,
            4
          );
          if (v.noodleState) {
            const nFrac = ((t - 0.15) / 0.7) % 1.0;
            this.drawMesh(
              'wavy_noodle',
              streamX,
              streamTopY - nFrac * streamH,
              streamZ,
              0.095,
              0.022,
              0.12,
              [1.0, 0.84, 0.28],
              0.32,
              [0.4, this.time * 5, 0.3]
            );
          }
        }
        return;
      }

      // ФАЗА 4 (p >= 0.88): Полная коробка в левой руке, а правая рука уносит пустую грязную миску в раковину!
      const t = (p - 0.88) / 0.12;
      this.drawFilledVessel3D(basePos[0], basePos[1], basePos[2], fullNewVessel, 0.64, false);
      drawLeftGloveAt(basePos[0], basePos[1], basePos[2]);

      const awayX = rightHoldX - R[0] * 0.35 * t;
      const awayY = rightHoldY - 0.18 * t;
      const awayZ = rightHoldZ - F[2] * 0.12 * t;
      if (fromType === 'bowl') {
        this.drawDirtyBowl3D(awayX, awayY, awayZ, v.broth || 'tonkotsu', 0.5 * (1 - t * 0.3), [0.1, yawAngle, 0.2]);
      }
      drawRightGloveAt(awayX, awayY, awayZ);
      return;
    }

    if (this.rightGrabAnim.active) {
      // ЕДИНАЯ ПЛАВНАЯ АНИМАЦИЯ ВЗЯТИЯ МИСКИ ИЛИ КОРОБКИ СО СТОПКИ ЛЕВОЙ РУКОЙ:
      // 1) p < 0.28: верхняя миска/коробка ещё лежит на стопке, а левая рука тянется к ней;
      // 2) p >= 0.28: левая рука захватывает миску/коробку со стопки и плавно переносит её по дуге к себе!
      const isBox = v.type === 'box';
      const stackX = 0.84;
      const topBowlIdx = Math.max(0, Math.min(9, rt.cleanBowls ?? 0));
      const stackY = isBox ? 0.998 : 0.918 + topBowlIdx * 0.02;
      const stackZ = isBox ? -0.5 : -0.22;
      const stackScale = isBox ? 0.6 : 0.48;

      const p = Math.min(1, this.rightGrabAnim.timer / this.rightGrabAnim.duration);
      if (p < 0.28) {
        const t = p / 0.28;
        const s = t * t * (3 - 2 * t);
        hx = stackX;
        hy = stackY;
        hz = stackZ;
        vesselScale = stackScale;
        handAnchorX = basePos[0] + (stackX - basePos[0]) * s;
        handAnchorY = basePos[1] + (stackY - basePos[1]) * s + Math.sin(t * Math.PI) * 0.04;
        handAnchorZ = basePos[2] + (stackZ - basePos[2]) * s;
      } else {
        const t = (p - 0.28) / 0.72;
        const s = t * t * (3 - 2 * t);
        const liftArc = Math.sin(t * Math.PI) * 0.085;
        hx = stackX + (basePos[0] - stackX) * s;
        hy = stackY + (basePos[1] - stackY) * s + liftArc;
        hz = stackZ + (basePos[2] - stackZ) * s;
        vesselScale = stackScale + (0.64 - stackScale) * s;
        handAnchorX = hx;
        handAnchorY = hy;
        handAnchorZ = hz;
      }
    } else if (this.assemblyVesselAnim.active && this.assemblyVesselAnim.action === 'pickup') {
      const p = Math.min(1, this.assemblyVesselAnim.timer / this.assemblyVesselAnim.duration);
      const s = p * p * (3 - 2 * p);
      const startX = this.assemblyVesselAnim.intoBag ? -0.075 : -0.13;
      const startY = this.assemblyVesselAnim.intoBag ? 1.04 : 0.92;
      const startZ = -0.24;
      hx = startX + (basePos[0] - startX) * s;
      hy = startY + (basePos[1] - startY) * s + Math.sin(p * Math.PI) * 0.065;
      hz = startZ + (basePos[2] - startZ) * s;
      handAnchorX = hx;
      handAnchorY = hy;
      handAnchorZ = hz;
    } else if (this.slotAnim.active) {
      const i = this.slotAnim.slotIndex;
      const sx = slotXCoords[i] ?? 0.0;
      const p = Math.min(1, this.slotAnim.timer / this.slotAnim.duration);
      const s = p * p * (3 - 2 * p);

      if (this.slotAnim.action === 'pickup') {
        hx = sx + (basePos[0] - sx) * s;
        hy = slotY + (basePos[1] - slotY) * s + Math.sin(p * Math.PI) * 0.06;
        hz = slotZ + (basePos[2] - slotZ) * s;
      } else if (this.slotAnim.action === 'pour') {
        const hoverX = sx - 0.03;
        const hoverY = slotY + 0.19;
        const hoverZ = slotZ + 0.05;
        if (p < 0.25) {
          const t = p / 0.25;
          hx = basePos[0] + (hoverX - basePos[0]) * t;
          hy = basePos[1] + (hoverY - basePos[1]) * t;
          hz = basePos[2] + (hoverZ - basePos[2]) * t;
        } else if (p < 0.72) {
          hx = hoverX;
          hy = hoverY + Math.sin(((p - 0.25) / 0.47) * Math.PI) * 0.015;
          hz = hoverZ;
        } else {
          const t = (p - 0.72) / 0.28;
          hx = hoverX + (basePos[0] - hoverX) * t;
          hy = hoverY + (basePos[1] - hoverY) * t;
          hz = hoverZ + (basePos[2] - hoverZ) * t;
        }
      }
      handAnchorX = hx;
      handAnchorY = hy;
      handAnchorZ = hz;
    }

    const pPour = this.pourAnim.active ? Math.min(1, this.pourAnim.timer / this.pourAnim.duration) : 1;
    const pTop = this.toppingAnim.active ? Math.min(1, this.toppingAnim.timer / this.toppingAnim.duration) : 1;
    const hidePendingTop = this.toppingAnim.active && pTop < 0.64 && (v.toppings || []).length > 0;
    const heldView = {
      type: v.type,
      broth:
        this.pourAnim.active && this.pourAnim.type === 'broth' && pPour < 0.38
          ? null
          : v.broth,
      noodleState:
        this.pourAnim.active && this.pourAnim.type === 'noodles' && pPour < 0.42
          ? null
          : v.noodleState,
      toppings: hidePendingTop ? (v.toppings || []).slice(0, -1) : v.toppings || [],
      overflowCount: v.overflowCount || 0
    };

    this.drawFilledVessel3D(hx, hy, hz, heldView, vesselScale, false);

    // ЛЕВАЯ РУКА ПОВАРА: расположена строго ПОД донышком (hy - 0.036) и снаружи левой стенки,
    // чтобы перчатка и пальцы никогда не просвечивали сквозь внутреннее дно миски или коробки!
    const lhX = handAnchorX - R[0] * 0.092 - F[0] * 0.056;
    const lhY = handAnchorY - 0.036;
    const lhZ = handAnchorZ - R[2] * 0.092 - F[2] * 0.056;
    const lhRot = [0.06, yawAngle - 0.34, 0.12];

    // Ладонь левой кибер-перчатки и светящийся бирюзовый индикатор (ниже уровня дна посуды)
    this.drawBox(lhX, lhY, lhZ, 0.074, 0.034, 0.13, [0.16, 0.14, 0.24], 0.22, lhRot);
    this.drawBox(lhX, lhY + 0.018, lhZ, 0.078, 0.011, 0.04, [0.0, 0.96, 0.83], 0.92, lhRot);
    // Большой палец левой руки снаружи левого бортика миски/коробки (без пересечения внутренней чаши!)
    this.drawBox(
      handAnchorX - R[0] * 0.124 - F[0] * 0.022,
      handAnchorY + 0.022,
      handAnchorZ - R[2] * 0.124 - F[2] * 0.022,
      0.024,
      0.024,
      0.048,
      [0.2, 0.18, 0.3],
      0.25,
      [0.08, yawAngle - 0.15, 0.24]
    );
    // Предплечье левой руки, уходящее к левому плечу героя
    this.drawBox(
      lhX - R[0] * 0.055 - F[0] * 0.082,
      lhY - 0.024,
      lhZ - R[2] * 0.055 - F[2] * 0.082,
      0.08,
      0.048,
      0.135,
      [0.11, 0.13, 0.2],
      0.15,
      lhRot
    );

    // ПРАВАЯ РУКА С КУЛИНАРНЫМИ ПАЛОЧКАМИ «МОРИБАСИ»: НАКЛАДЫВАЕМ ИНГРЕДИЕНТЫ ИЗ ЛОТКОВ В ВЫДВИНУТУЮ МИСКУ/КОРОБКУ!
    if (this.toppingAnim.active && rt.activeSector === 1 && rt.cameraFocus === 'worktable') {
      const topId = this.toppingAnim.toppingId || 'egg';
      const trayCoords = {
        egg: [-0.28, 1.055, -0.85],
        chashu: [0.0, 1.055, -0.85],
        nori: [0.28, 1.055, -0.85],
        scallion: [-0.28, 0.995, -0.62],
        shrimp: [0.0, 0.995, -0.62],
        chili: [0.28, 0.995, -0.62]
      };
      const [trayX, trayY, trayZ] = trayCoords[topId] || trayCoords.egg;
      const rightStartX = basePos[0] + R[0] * 0.3 + F[0] * 0.04;
      const rightStartY = basePos[1] + 0.06;
      const rightStartZ = basePos[2] + R[2] * 0.3 + F[2] * 0.04;
      const dropX = hx;
      const dropY = hy + 0.095;
      const dropZ = hz;

      let tipX, tipY, tipZ;
      let pinchGap = 0.032; // Расстояние между кончиками палочек (меньше = зажат ингредиент)
      let carryingFood = false;

      if (pTop < 0.3) {
        // Фаза 1: Правая рука с палочками летит от героя к нужному лотку и зажимает ингредиент!
        const t = pTop / 0.3;
        const s = t * t * (3 - 2 * t);
        tipX = rightStartX + (trayX - rightStartX) * s;
        tipY = rightStartY + (trayY - rightStartY) * s + Math.sin(t * Math.PI) * 0.075;
        tipZ = rightStartZ + (trayZ - rightStartZ) * s;
        pinchGap = t < 0.65 ? 0.036 : 0.036 - ((t - 0.65) / 0.35) * 0.022;
      } else if (pTop < 0.72) {
        // Фаза 2: Палочки переносят зажатый 3D-ингредиент по дуге к выдвинутой левой руке и кладут прямо в миску/коробку!
        const t = (pTop - 0.3) / 0.42;
        const s = t * t * (3 - 2 * t);
        tipX = trayX + (dropX - trayX) * s;
        tipY = trayY + (dropY - trayY) * s + Math.sin(t * Math.PI) * 0.11;
        tipZ = trayZ + (dropZ - trayZ) * s;
        carryingFood = t < 0.82;
        pinchGap = t < 0.8 ? 0.014 : 0.014 + ((t - 0.8) / 0.2) * 0.022;
      } else {
        // Фаза 3: Правая рука с палочками плавно возвращается к герою
        const t = (pTop - 0.72) / 0.28;
        const s = t * t * (3 - 2 * t);
        tipX = dropX + (rightStartX - dropX) * s;
        tipY = dropY + (rightStartY - dropY) * s + Math.sin(t * Math.PI) * 0.06;
        tipZ = dropZ + (rightStartZ - dropZ) * s;
        pinchGap = 0.034;
      }

      // Направляющий вектор палочек от кончиков вверх-вправо-назад к кисти правой руки
      let sx = R[0] * 0.48 - F[0] * 0.56 + U[0] * 0.42;
      let sy = R[1] * 0.48 - F[1] * 0.56 + U[1] * 0.42;
      let sz = R[2] * 0.48 - F[2] * 0.56 + U[2] * 0.42;
      const slen = Math.hypot(sx, sy, sz) || 1;
      sx /= slen;
      sy /= slen;
      sz /= slen;

      // Перпендикулярная ось разведения двух палочек (в плоскости экрана, чтобы кончики обхватывали ингредиент с двух сторон!)
      let px = sy * F[2] - sz * F[1];
      let py = sz * F[0] - sx * F[2];
      let pz = sx * F[1] - sy * F[0];
      const plen = Math.hypot(px, py, pz) || 1;
      px /= plen;
      py /= plen;
      pz /= plen;

      const stickLen = 0.28;

      // Вспомогательная функция отрисовки стержня строго между точками p0 -> p1 с точным обратным расчётом углов mat4Model!
      const drawSegmentBox = (ax, ay, az, bx, by, bz, w, col, emissive, spec) => {
        const vx = bx - ax;
        const vy = by - ay;
        const vz = bz - az;
        const len = Math.hypot(vx, vy, vz) || 0.001;
        const ux = vx / len;
        const uy = vy / len;
        const uz = vz / len;
        const ry = Math.asin(Math.max(-0.995, Math.min(0.995, ux)));
        const rx = Math.atan2(-uy, uz);
        this.drawBox((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5, w, w, len, col, emissive, [rx, ry, 0], spec);
      };

      if (topId === 'chili' && pTop >= 0.3 && pTop < 0.78) {
        // Для острого чили-соуса правая рука сжимает красную бутылочку над миской с огненной струйкой!
        const bottleX = tipX + sx * 0.06;
        const bottleY = tipY + sy * 0.06 + 0.05;
        const bottleZ = tipZ + sz * 0.06;
        const bRot = [Math.PI * 0.72, yawAngle, 0.25];
        this.drawMesh('cylinder', bottleX, bottleY, bottleZ, 0.058, 0.11, 0.058, [0.96, 0.12, 0.22], 0.72, bRot, 0.78);
        this.drawMesh('cone', tipX, tipY + 0.025, tipZ, 0.028, 0.044, 0.028, [1.0, 0.25, 0.1], 0.85, bRot, 0.6);
        if (pTop > 0.46 && pTop < 0.72) {
          this.drawMesh('cylinder', dropX, (tipY + dropY) * 0.5, dropZ, 0.012, Math.max(0.04, tipY - dropY + 0.03), 0.012, [1.0, 0.16, 0.14], 0.95);
        }
      } else {
        // Две длинные бамбуковые кулинарные палочки «Морибаси»: кончики p0 точно зажимают ингредиент по центру (tipX, tipY, tipZ)!
        const gripGap = carryingFood ? 0.022 : pinchGap;
        for (const side of [-1, 1]) {
          const tipOff = side * gripGap * 0.5;
          const handOff = side * 0.008;
          // Передний кончик палочки чуть заходит за центр ингредиента (-0.016 вдоль стержня), крепко обхватывая его с двух сторон
          const p0x = tipX - sx * 0.016 + px * tipOff;
          const p0y = tipY - sy * 0.016 + py * tipOff;
          const p0z = tipZ - sz * 0.016 + pz * tipOff;
          const p1x = tipX + sx * (stickLen - 0.016) + px * handOff;
          const p1y = tipY + sy * (stickLen - 0.016) + py * handOff;
          const p1z = tipZ + sz * (stickLen - 0.016) + pz * handOff;
          // Основная бамбуковая часть палочки
          drawSegmentBox(p0x, p0y, p0z, p1x, p1y, p1z, 0.0085, [0.92, 0.78, 0.52], 0.16, 0.45);
          // Лакированная тёмно-бордовая верхняя рукоятка палочки (верхние 38% длины)
          const r0x = p0x + (p1x - p0x) * 0.62;
          const r0y = p0y + (p1y - p0y) * 0.62;
          const r0z = p0z + (p1z - p0z) * 0.62;
          drawSegmentBox(r0x, r0y, r0z, p1x, p1y, p1z, 0.0108, [0.46, 0.14, 0.16], 0.18, 0.65);
        }

        // Зажатый ровно МЕЖДУ кончиками палочек 3D-ингредиент во время переноса в миску/коробку!
        if (carryingFood) {
          if (topId === 'egg') {
            this.draw3DAjitamaEggHalf(tipX, tipY - 0.016, tipZ, 0.86, 0.4);
          } else if (topId === 'chashu') {
            this.draw3DChashuSlice(tipX, tipY, tipZ, 0.86, [0.35, 0.3, 0.2]);
          } else if (topId === 'nori') {
            this.draw3DNoriSheet(tipX, tipY, tipZ, 0.9, [-0.22, 0.25, 0.14]);
          } else if (topId === 'scallion') {
            for (let k = 0; k < 5; k++) {
              const a = k * 1.25;
              this.draw3DScallionRing(
                tipX + Math.cos(a) * 0.014,
                tipY + ((k % 3) - 1) * 0.005,
                tipZ + Math.sin(a) * 0.014,
                0.92,
                [0.2, a, 0.15]
              );
            }
          } else if (topId === 'shrimp') {
            this.draw3DTempuraShrimp(tipX, tipY - 0.014, tipZ, 0.92, 0.35);
          }
        }
      }

      // Компактная правая кибер-перчатка с коротким манжетом, держащая палочки (или бутылку чили)
      const rhX = tipX + sx * 0.165;
      const rhY = tipY + sy * 0.165;
      const rhZ = tipZ + sz * 0.165;
      const rhRot = [0.16, yawAngle + 0.38, -0.22];
      this.drawBox(rhX, rhY, rhZ, 0.07, 0.036, 0.122, [0.16, 0.14, 0.24], 0.24, rhRot);
      this.drawBox(rhX, rhY + 0.02, rhZ, 0.074, 0.012, 0.04, [0.0, 0.96, 0.83], 0.94, rhRot);
      this.drawBox(rhX - R[0] * 0.032, rhY - 0.01, rhZ - R[2] * 0.032, 0.028, 0.024, 0.05, [0.2, 0.18, 0.3], 0.25, rhRot);
      this.drawBox(rhX + sx * 0.085, rhY + sy * 0.085, rhZ + sz * 0.085, 0.076, 0.046, 0.125, [0.11, 0.13, 0.2], 0.16, rhRot);
    }
  }

  // =========================================================================
  // НЕПРЕРЫВНАЯ 5-ФАЗНАЯ АНИМАЦИЯ ВЗЯТИЯ БАНКИ ИЗ ХОЛОДИЛЬНИКА И ВЫСТАВЛЕНИЯ НА ПОДНОС / В ПАКЕТ:
  // 1) p < 0.24: правая рука вылетает ОТ НАС прямо к банке на верхней полке холодильника;
  // 2) 0.24..0.46: рука хватает банку, вынимает её с полки и чуть-чуть опускает к себе;
  // 3) 0.46..0.64: камера поворачивается от холодильника на стол, а правая рука с банкой едет вместе с нами!
  // 4) 0.64..0.88: рука по мягкой дуге идёт на стол и аккуратно ставит банку на поднос или внутрь полого пакета;
  // 5) 0.88..1.00: банка уже стоит на месте, а пустая правая рука плавно убирается обратно вниз.
  // =========================================================================
  drawDrinkPlaceAnim3D() {
    if (!this.drinkPlaceAnim.active) return;

    const rt = gameState.runtime;
    const a = rt.assembly || {};
    const p = Math.min(1, this.drinkPlaceAnim.timer / this.drinkPlaceAnim.duration);
    const { F, R, U } = this.getCameraBasis();
    const yawAngle = Math.atan2(-F[0], -F[2]);

    const drinkRows = ['cola', 'matcha', 'ramune'];
    const colZs = [0.115, 0.27, 0.425];
    const rIdx = Math.max(0, drinkRows.indexOf(this.drinkPlaceAnim.drinkId));
    const shelfPos = [0.79, 1.372, colZs[rIdx] ?? 0.27];

    const asmY = 0.902;
    const asmZ = -0.24;
    const bagBaseY = a.hasTray ? asmY + 0.016 : asmY;
    const intoBag = Boolean(this.drinkPlaceAnim.intoBag);
    const targetPos = intoBag
      ? [0.095, bagBaseY + 0.016, asmZ + 0.01]
      : [0.1, asmY + 0.016, asmZ - 0.05];

    // Точка выхода правой руки от тела героя (правый нижний край обзора) и точка переноса в руке при повороте камеры
    const rightOrigin = [
      this.camPos[0] + F[0] * 0.42 + R[0] * 0.17 - U[0] * 0.25,
      this.camPos[1] + F[1] * 0.42 + R[1] * 0.17 - U[1] * 0.25,
      this.camPos[2] + F[2] * 0.42 + R[2] * 0.17 - U[2] * 0.25
    ];
    const rightCarry = [
      this.camPos[0] + F[0] * 0.44 + R[0] * 0.11 - U[0] * 0.15,
      this.camPos[1] + F[1] * 0.44 + R[1] * 0.11 - U[1] * 0.15,
      this.camPos[2] + F[2] * 0.44 + R[2] * 0.11 - U[2] * 0.15
    ];

    let canX, canY, canZ;
    let handX, handY, handZ;
    let showCan = false;
    let canScale = 1.0;
    let canTilt = 0;

    if (p < 0.24) {
      // Фаза 1: пустая правая рука вылетает ОТ НАС к банке на верхней полке
      const t = p / 0.24;
      const s = t * t * (3 - 2 * t);
      handX = rightOrigin[0] + (shelfPos[0] - rightOrigin[0]) * s;
      handY = rightOrigin[1] + (shelfPos[1] + 0.05 - rightOrigin[1]) * s + Math.sin(t * Math.PI) * 0.03;
      handZ = rightOrigin[2] + (shelfPos[2] - rightOrigin[2]) * s;
      showCan = false;
    } else if (p < 0.46) {
      // Фаза 2: взяла банку с полки и чуть-чуть опустила к себе
      const t = (p - 0.24) / 0.22;
      const s = t * t * (3 - 2 * t);
      canX = shelfPos[0] + (rightCarry[0] - shelfPos[0]) * s;
      canY = shelfPos[1] + (rightCarry[1] - shelfPos[1]) * s + Math.sin(t * Math.PI) * 0.025;
      canZ = shelfPos[2] + (rightCarry[2] - shelfPos[2]) * s;
      handX = canX;
      handY = canY + 0.05;
      handZ = canZ;
      canScale = 1.0 - 0.12 * s;
      canTilt = 0.08 * s;
      showCan = true;
    } else if (p < 0.64) {
      // Фаза 3: камера поворачивается от холодильника на стол, рука держит банку и едет вместе с нами!
      const t = (p - 0.46) / 0.18;
      const bob = Math.sin(t * Math.PI) * 0.012;
      canX = rightCarry[0];
      canY = rightCarry[1] - bob;
      canZ = rightCarry[2];
      handX = canX;
      handY = canY + 0.05;
      handZ = canZ;
      canScale = 0.88 + 0.06 * t;
      canTilt = 0.08 * (1 - t * 0.4);
      showCan = true;
    } else if (p < 0.88) {
      // Фаза 4: рука идёт от нас на стол и аккуратно ставит банку на поднос или сверху опускает внутрь полого пакета!
      const t = (p - 0.64) / 0.24;
      if (intoBag) {
        const hoverY = targetPos[1] + 0.25;
        if (t < 0.62) {
          const u = t / 0.62;
          const s = u * u * (3 - 2 * u);
          canX = rightCarry[0] + (targetPos[0] - rightCarry[0]) * s;
          canY = rightCarry[1] + (hoverY - rightCarry[1]) * s + Math.sin(u * Math.PI) * 0.05;
          canZ = rightCarry[2] + (targetPos[2] - rightCarry[2]) * s;
        } else {
          const u = (t - 0.62) / 0.38;
          const s = u * u * (3 - 2 * u);
          canX = targetPos[0];
          canY = hoverY + (targetPos[1] - hoverY) * s;
          canZ = targetPos[2];
        }
        handX = canX;
        handY = canY + 0.082;
        handZ = canZ;
      } else {
        const s = t * t * (3 - 2 * t);
        canX = rightCarry[0] + (targetPos[0] - rightCarry[0]) * s;
        canY = rightCarry[1] + (targetPos[1] - rightCarry[1]) * s + Math.sin(t * Math.PI) * 0.085;
        canZ = rightCarry[2] + (targetPos[2] - rightCarry[2]) * s;
        handX = canX;
        handY = canY + 0.052;
        handZ = canZ;
      }
      canScale = 0.94 + 0.18 * (t * t * (3 - 2 * t)); // Плавно достигает точного размера 1.12 на подносе / в пакете!
      canTilt = 0.05 * (1 - t);
      showCan = true;
    } else {
      // Фаза 5: банка уже стоит на подносе/в пакете, пустая правая рука бесшовно вынимается и убирается обратно к нам!
      const t = (p - 0.88) / 0.12;
      const s = t * t * (3 - 2 * t);
      const releaseY = intoBag ? targetPos[1] + 0.082 : targetPos[1] + 0.052;
      const liftOut = intoBag ? Math.sin(t * Math.PI) * 0.16 : Math.sin(t * Math.PI) * 0.04;
      handX = targetPos[0] + (rightOrigin[0] - targetPos[0]) * s;
      handY = releaseY + (rightOrigin[1] - releaseY) * s + liftOut;
      handZ = targetPos[2] + (rightOrigin[2] - targetPos[2]) * s;
      showCan = false;
    }

    if (showCan) {
      this.draw3DDrinkCan(canX, canY, canZ, this.drinkPlaceAnim.drinkId, canScale, [0, 0, canTilt]);
    }

    // Детализированная правая кибер-перчатка героя (ладонь + индикатор + большой палец + предплечье к правому плечу!)
    const rhX = handX + R[0] * 0.048 - F[0] * 0.036;
    const rhY = handY - 0.008;
    const rhZ = handZ + R[2] * 0.048 - F[2] * 0.036;
    const rhRot = [0.06, yawAngle + 0.28, -0.14];

    this.drawBox(rhX, rhY, rhZ, 0.066, 0.034, 0.12, [0.16, 0.14, 0.24], 0.22, rhRot);
    this.drawBox(rhX, rhY + 0.018, rhZ, 0.07, 0.011, 0.038, [0.0, 0.96, 0.83], 0.92, rhRot);
    // Большой палец снаружи банки
    this.drawBox(
      handX + R[0] * 0.056 - F[0] * 0.006,
      handY + 0.018,
      handZ + R[2] * 0.056 - F[2] * 0.006,
      0.022,
      0.022,
      0.044,
      [0.2, 0.18, 0.3],
      0.25,
      [0.08, yawAngle + 0.12, -0.22]
    );
    // Предплечье правой руки, уходящее вниз-вправо к плечу героя
    this.drawBox(
      rhX + R[0] * 0.052 - F[0] * 0.078,
      rhY - 0.026,
      rhZ + R[2] * 0.052 - F[2] * 0.078,
      0.076,
      0.046,
      0.135,
      [0.11, 0.13, 0.2],
      0.15,
      rhRot
    );
  }

  // =========================================================================
  // ПОДНОС ИЛИ ПАКЕТ В РУКАХ ПЕРЕД КЛИЕНТОМ ПРИ ПОДЪЁМЕ КАМЕРЫ НА ГОСТЯ!
  // =========================================================================
  drawCarriedAssemblyToCustomer3D() {
    const rt = gameState.runtime;
    const a = rt.assembly || {};
    const v = rt.activeVessel;
    const hasHeldVessel = Boolean(v && v.type);
    const hasAssembled = Boolean((a.hasTray || a.hasBag) && (a.vessel || a.hasChopsticks || a.drink));
    const isCarrying =
      rt.activeSector === 1 &&
      rt.cameraFocus === 'customer' &&
      (rt.customerPanSide || 0) === 0 &&
      Boolean(rt.carryingAssembly) &&
      !hasHeldVessel &&
      hasAssembled;

    if (!isCarrying && !this.servePushAnim.active) return;

    const { F, R, U } = this.getCameraBasis();
    const yawAngle = Math.atan2(-F[0], -F[2]);
    const swayY = Math.sin(this.time * 2.8) * 0.004;

    let forwardBoost = 0;
    let fadeScale = 1.0;
    if (this.servePushAnim.active) {
      const p = Math.min(1, this.servePushAnim.timer / this.servePushAnim.duration);
      const s = p * p * (3 - 2 * p);
      forwardBoost = 0.34 * s;
      fadeScale = Math.max(0.45, 1.0 - s * 0.42);
    }

    const d = 0.56 + forwardBoost;
    const cx = this.camPos[0] + F[0] * d + U[0] * (-0.195 + swayY);
    const cy = this.camPos[1] + F[1] * d + U[1] * (-0.195 + swayY);
    const cz = this.camPos[2] + F[2] * d + U[2] * (-0.195 + swayY);

    const showingBag = this.servePushAnim.active ? this.servePushAnim.servedBag : Boolean(a.hasBag);

    if (showingBag) {
      // Поднимаемся к клиенту с наполненным просторным крафтовым ПАКЕТОМ (поднос остаётся чистым на столе!)
      const bs = 0.78 * fadeScale;
      const bagYPos = cy - 0.13 * fadeScale;
      this.draw3DTakeoutBag(
        cx,
        bagYPos,
        cz,
        bs,
        a.vessel || this.servePushAnim.active,
        Boolean(a.hasChopsticks),
        true,
        null,
        a.drink || null
      );
      // Правая кибер-перчатка крепко держит обе сведённые витые ручки сверху пакета!
      const rhX = cx + R[0] * 0.02;
      const rhY = bagYPos + 0.362 * bs;
      const rhZ = cz + R[2] * 0.02;
      const rhRot = [0.12, yawAngle + 0.14, -0.08];
      this.drawBox(rhX, rhY, rhZ, 0.072, 0.036, 0.115, [0.16, 0.14, 0.24], 0.24, rhRot);
      this.drawBox(rhX, rhY + 0.02, rhZ, 0.076, 0.011, 0.038, [0.0, 0.96, 0.83], 0.94, rhRot);
    } else {
      // Поднимаемся к клиенту с собранным ПОДНОСОМ (блюдо слева, банка напитка и палочки справа!)
      const ts = 0.82 * fadeScale;
      this.draw3DRamenTray(cx, cy, cz, ts);
      if (a.vessel) {
        this.drawFilledVessel3D(
          cx - R[0] * 0.13 * ts,
          cy + 0.016 * ts,
          cz - R[2] * 0.13 * ts,
          a.vessel,
          0.65 * fadeScale
        );
      }
      if (a.drink) {
        this.draw3DDrinkCan(
          cx + R[0] * 0.1 * ts - F[0] * 0.04 * ts,
          cy + 0.016 * ts,
          cz + R[2] * 0.1 * ts - F[2] * 0.04 * ts,
          a.drink,
          0.95 * fadeScale
        );
      }
      if (a.hasChopsticks) {
        this.draw3DChopsticksPack(
          cx + R[0] * 0.22 * ts,
          cy + 0.016 * ts,
          cz + R[2] * 0.22 * ts,
          0.88 * fadeScale
        );
      }

      // Обе кибер-перчатки героя держат поднос слева и справа за бортики
      for (const side of [-1, 1]) {
        const hx = cx + R[0] * (0.28 * side * ts) - F[0] * 0.03;
        const hy = cy - 0.008;
        const hz = cz + R[2] * (0.28 * side * ts) - F[2] * 0.03;
        const hRot = [0.08, yawAngle + side * 0.22, -side * 0.12];
        this.drawBox(hx, hy, hz, 0.07, 0.034, 0.12, [0.16, 0.14, 0.24], 0.24, hRot);
        this.drawBox(hx, hy + 0.019, hz, 0.074, 0.011, 0.038, [0.0, 0.96, 0.83], 0.94, hRot);
      }
    }
  }

  drawParticles3D(dt) {
    for (const r of this.rain3D) {
      r.y -= r.speed * dt;
      if (r.y < 0.05) {
        r.y = 4.6;
        r.x = (Math.random() - 0.5) * 9.0;
      }
      this.drawBox(r.x, r.y, r.z, 0.012, 0.22, 0.012, [0.45, 0.75, 1.0], 0.75);
    }

    for (const s of this.steam3D) {
      s.y += s.speed * dt;
      if (s.y > 0.75) s.y = 0.05;
      const sx = -0.85 + s.x * 0.45 + Math.sin(this.time * 2 + s.phase) * 0.04;
      const sz = -0.22 + s.z * 0.8;
      const scale = 0.036 + (1.0 - s.y) * 0.036;
      this.drawMesh('sphere', sx, 1.02 + s.y, sz, scale, scale, scale, [0.85, 0.92, 1.0], 0.35);
    }

    for (let i = this.coins3D.length - 1; i >= 0; i--) {
      const c = this.coins3D[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.vy -= 3.2 * dt;
      c.life -= dt * 1.1;
      if (c.life <= 0) {
        this.coins3D.splice(i, 1);
        continue;
      }
      this.drawMesh('cylinder', c.x, c.y, c.z, 0.065, 0.016, 0.065, [0.06, 0.96, 0.42], 0.95, [
        Math.PI * 0.5,
        this.time * 10,
        0
      ]);
    }
  }

  drawFirstPersonHands3D(dt) {
    // Показываем 3D-перчатки повара только в момент активного действия (чтобы в крупном плане не закрывать миску и лотки)
    if (!this.handAnim.active) return;

    const fx = this.lookAtCurrent[0] - this.camPos[0];
    const fy = this.lookAtCurrent[1] - this.camPos[1];
    const fz = this.lookAtCurrent[2] - this.camPos[2];
    const flen = Math.hypot(fx, fy, fz) || 1;
    const dx = fx / flen;
    const dy = fy / flen;
    const dz = fz / flen;

    const rx = -dz;
    const rz = dx;
    const rlen = Math.hypot(rx, rz) || 1;
    const ux = rx / rlen;
    const uz = rz / rlen;

    let distForward = 0.46;
    let dropY = -0.18 + Math.sin(this.time * 2.5) * 0.006;
    let glowCol = [0.0, 0.95, 0.83];

    if (this.handAnim.active) {
      this.handAnim.timer += dt;
      const p = Math.min(1, this.handAnim.timer / this.handAnim.duration);
      const wave = Math.sin(p * Math.PI);
      distForward += wave * 0.22;
      dropY += wave * 0.05;
      glowCol = this.handAnim.color;
      if (p >= 1) this.handAnim.active = false;
    }

    const yawAngle = Math.atan2(-dx, -dz);

    [-0.18, 0.18].forEach((side) => {
      const wx = this.camPos[0] + dx * distForward + ux * side;
      const wy = this.camPos[1] + dy * distForward + dropY;
      const wz = this.camPos[2] + dz * distForward + uz * side;

      this.drawBox(wx, wy, wz, 0.068, 0.048, 0.14, [0.16, 0.14, 0.24], 0.18, [0, yawAngle, 0]);
      this.drawBox(wx, wy + 0.025, wz, 0.072, 0.014, 0.04, glowCol, 0.9, [0, yawAngle, 0]);
    });
  }

  drawBox(x, y, z, sx, sy, sz, color, emissive = 0.0, rot = null, specular = 0.15, pattern = 0, alpha = 1.0) {
    this.drawMesh('box', x, y, z, sx, sy, sz, color, emissive, rot, specular, pattern, alpha);
  }

  drawTexturedQuad(tex, x, y, z, sx, sy, emissive = 0.75, rot = null) {
    if (!tex) return;
    const gl = this.gl;
    const info = this.meshes.quad;
    if (!info) return;

    const model = this.mat4Model(x, y, z, sx, sy, 1.0, rot);
    const mvp = this.mat4Multiply(this.vpMatrix, model);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uTex, 0);
    gl.uniform1f(this.uUseTex, 1.0);
    gl.uniformMatrix4fv(this.uModel, false, model);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniform3fv(this.uColor, [1.0, 1.0, 1.0]);
    gl.uniform1f(this.uEmissive, emissive);
    gl.uniform1f(this.uSpecular, 0.05);
    gl.uniform1f(this.uPattern, 0);
    gl.uniform1f(this.uAlpha, 1.0);
    gl.drawArrays(gl.TRIANGLES, info.first, info.count);
    gl.uniform1f(this.uUseTex, 0.0);
  }

  drawMesh(meshName, x, y, z, sx, sy, sz, color, emissive = 0.0, rot = null, specular = 0.25, pattern = 0, alpha = 1.0) {
    const gl = this.gl;
    const info = this.meshes[meshName] || this.meshes.box;
    if (!info) return;

    const model = this.mat4Model(x, y, z, sx, sy, sz, rot);
    const mvp = this.mat4Multiply(this.vpMatrix, model);

    gl.uniform1f(this.uUseTex, 0.0);
    gl.uniformMatrix4fv(this.uModel, false, model);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniform3fv(this.uColor, color);
    gl.uniform1f(this.uEmissive, emissive);
    gl.uniform1f(this.uSpecular, specular);
    gl.uniform1f(this.uPattern, pattern);
    gl.uniform1f(this.uAlpha, alpha);
    const isTranslucent = alpha < 0.99;
    if (isTranslucent) gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, info.first, info.count);
    if (isTranslucent) gl.depthMask(true);
  }

  mat4Perspective(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  mat4LookAt(eye, target, up) {
    let z0 = eye[0] - target[0];
    let z1 = eye[1] - target[1];
    let z2 = eye[2] - target[2];
    let len = Math.hypot(z0, z1, z2) || 1;
    z0 /= len;
    z1 /= len;
    z2 /= len;

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2) || 1;
    x0 /= len;
    x1 /= len;
    x2 /= len;

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    return new Float32Array([
      x0, y0, z0, 0,
      x1, y1, z1, 0,
      x2, y2, z2, 0,
      -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
      -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
      -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
      1
    ]);
  }

  mat4Model(x, y, z, sx, sy, sz, rot) {
    if (!rot) {
      return new Float32Array([
        sx, 0,  0,  0,
        0,  sy, 0,  0,
        0,  0,  sz, 0,
        x,  y,  z,  1
      ]);
    }
    const [rx, ry, rz] = rot;
    const cx = Math.cos(rx), srx = Math.sin(rx);
    const cy = Math.cos(ry), sry = Math.sin(ry);
    const cz = Math.cos(rz), srz = Math.sin(rz);

    return new Float32Array([
      cy * cz * sx, (cx * srz + srx * sry * cz) * sx, (srx * srz - cx * sry * cz) * sx, 0,
      -cy * srz * sy, (cx * cz - srx * sry * srz) * sy, (srx * cz + cx * sry * srz) * sy, 0,
      sry * sz, -srx * cy * sz, cx * cy * sz, 0,
      x, y, z, 1
    ]);
  }

  mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      const ai0 = a[i], ai1 = a[i + 4], ai2 = a[i + 8], ai3 = a[i + 12];
      out[i]      = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
      out[i + 4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
      out[i + 8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
      out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
    }
    return out;
  }
}
