import { GAME_CONFIG } from './config.js?v=44';
import { gameState } from './state.js?v=44';
import {
  createAlleyBackdropTexture,
  createBuildingFacadeTexture,
  createACUnitTexture,
  createWetAsphaltTexture,
  createKanjiSignTextures,
  createPedestrianTextures,
  AnimeCustomerTextureRenderer
} from './art3d.js?v=44';

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

    // Анимации взятия посуды справа (Сектор 2), работы с 3 слотами стола (Сектор 1), мусорки и дрона-курьера
    this.rightGrabAnim = { active: false, type: 'bowl', timer: 0, duration: 0.32 };
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
    this.rightGrabAnim.active = true;
    this.rightGrabAnim.type = type;
    this.rightGrabAnim.timer = 0;
    this.rightGrabAnim.duration = 0.56;
    this.heldVesselAppear = 1.0;
    this.vesselBounce = 0.45;
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
        float alpha = 1.0;

        if (uUseTex > 0.5) {
          vec2 uv = vec2(vLocalPos.x + 0.5, 0.5 - vLocalPos.y);
          vec4 texCol = texture2D(uTex, uv);
          if (texCol.a < 0.08) discard;
          baseCol = texCol.rgb * uColor;
          alpha = texCol.a;
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
    this.uUseTex = gl.getUniformLocation(prog, 'uUseTex');
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

      // В центральном секторе вертикальный свайп переключает взгляд между столом и покупателем!
      if (
        gameState.runtime.activeSector === 1 &&
        Math.abs(dy) > 18 &&
        Math.abs(dy) > Math.abs(dx) * 1.05
      ) {
        if (this._startedOnCustomer) {
          // Свайп обратно на стол, когда камера была на покупателе (работает для вертикального свайпа в любую сторону)
          gestureLookedUp = false;
          this.headPeeking = false;
          if (this.headReturnTimer) {
            clearTimeout(this.headReturnTimer);
            this.headReturnTimer = null;
          }
          gameState.runtime.cameraFocus = 'worktable';
          this.dragPanX = Math.max(-0.28, Math.min(0.28, -dx * 0.0018));
          return;
        }
        gestureLookedUp = true;
        this.headPeeking = true;
        if (this.headReturnTimer) {
          clearTimeout(this.headReturnTimer);
          this.headReturnTimer = null;
        }
        gameState.runtime.cameraFocus = 'customer';
        this.dragPanX = Math.max(-0.28, Math.min(0.28, -dx * 0.0018));
        return;
      }

      this.dragPanX = Math.max(-0.28, Math.min(0.28, -dx * 0.0022));
    });

    const finishGesture = (endX, endY, isCancel = false) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      this.dragPanX = 0;

      if (gameState.runtime.sauceModeArmed) return;

      const dx = endX - downX;
      const dy = endY - downY;
      const dist = Math.hypot(dx, dy);

      // Если камера уже была на покупателе и игрок свайпнул вертикально — возвращаем камеру назад на рабочий стол
      if (
        this._startedOnCustomer &&
        gameState.runtime.activeSector === 1 &&
        dist > 18 &&
        Math.abs(dy) > Math.abs(dx) * 1.05
      ) {
        gestureLookedUp = false;
        this.headPeeking = false;
        if (this.headReturnTimer) {
          clearTimeout(this.headReturnTimer);
          this.headReturnTimer = null;
        }
        gameState.runtime.cameraFocus = 'worktable';
        return;
      }

      // Если игрок свайпнул вертикально на покупателя в центральном секторе:
      // - если в руке пусто, пустая коробка или пустая миска -> камера через 0.5с сама возвращается вниз на стол;
      // - если в левой руке есть наполненная миска или вок-коробка -> камера НЕ уезжает обратно вниз,
      //   чтобы игрок мог спокойно тапнуть на самого покупателя и отдать заказ!
      if (
        gestureLookedUp ||
        (!this._startedOnCustomer &&
          gameState.runtime.activeSector === 1 &&
          dist > 24 &&
          Math.abs(dy) > Math.abs(dx) * 1.05)
      ) {
        gameState.runtime.cameraFocus = 'customer';
        const v = gameState.runtime.activeVessel;
        const hasFilledInHand = Boolean(
          v && v.type && (v.broth || v.noodleState || (v.toppings && v.toppings.length > 0))
        );
        if (!hasFilledInHand) {
          this.headPeeking = true;
          this.scheduleHeadReturnToTable(500);
        } else {
          this.headPeeking = false;
          if (this.headReturnTimer) {
            clearTimeout(this.headReturnTimer);
            this.headReturnTimer = null;
          }
        }
        return;
      }

      if (this.headPeeking && gameState.runtime.activeSector === 1) {
        const v = gameState.runtime.activeVessel;
        const hasFilledInHand = Boolean(
          v && v.type && (v.broth || v.noodleState || (v.toppings && v.toppings.length > 0))
        );
        if (!hasFilledInHand) {
          this.scheduleHeadReturnToTable(500);
        }
      }

      if (dist > 26) {
        if (Math.abs(dx) > Math.abs(dy) * 1.1) {
          if (this.callbacks.onSwipeSector) {
            this.callbacks.onSwipeSector(dx < 0 ? 1 : -1);
          }
          return;
        }
        if (dy > 28 && gameState.runtime.activeSector === 2) {
          if (this.callbacks.onSwipeDownPress) {
            this.callbacks.onSwipeDownPress();
          }
          return;
        }
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

    // Таймеры анимаций взятия посуды справа, слотов стола, мусорки и доставки дрону
    if (this.rightGrabAnim.active) {
      this.rightGrabAnim.timer += dt;
      if (this.rightGrabAnim.timer >= this.rightGrabAnim.duration) {
        this.rightGrabAnim.active = false;
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
    // - В Секторе 0 (слева: варка, бульоны и стопка мисок)
    // - В Секторе 2 (справа: склад, пресс, шлюз и стопка коробок доставки)
    // - В Секторе 1: когда гость произносит заказ (cameraFocus === 'customer') -> крупный план гостя;
    //   затем (cameraFocus === 'worktable') -> крупный план рабочего стола (2 ряда контейнеров сверху + миска/коробка по центру снизу)
    if (rt.activeSector === 0) {
      this.camPosTarget = [-0.04, 1.68, 0.46];
      this.lookAtTarget = [-0.86, 0.98, -0.16 + this.dragPanX];
    } else if (rt.activeSector === 2) {
      this.camPosTarget = [0.05, 1.66, 0.45];
      this.lookAtTarget = [0.88, 0.98, -0.1 - this.dragPanX];
    } else if (rt.cameraFocus === 'customer') {
      // 1. Когда подходит покупатель (или игрок свайпом поднял голову) — камера наводится на покупателя так,
      // чтобы внизу в кадре был виден бортик прилавка и стоящий на бортике слева Неоновый котик!
      const dims = this.getCustomerDimensions(rt.currentCustomer);
      const lookY = rt.currentCustomer ? dims.y + dims.h * 0.06 : 1.32;
      this.camPosTarget = [0.02, 1.46, 0.02];
      this.lookAtTarget = [0.05 + this.dragPanX * 0.4, lookY, -1.24];
    } else {
      // 2. Как только покупатель сказал заказ — камера сама плавно опускается на рабочий стол (2 ряда контейнеров + место под миску/коробку)!
      this.camPosTarget = [0.0, 1.78, 0.26];
      this.lookAtTarget = [0.0 + this.dragPanX, 0.92, -0.52];
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
    this.drawCenterCounter3D();
    this.drawLeftBoilerStation3D();
    this.drawRightFridgeAndSealer3D();
    this.drawCustomerAndCourier3D();
    this.drawParticles3D(dt);
    this.drawHeldVesselInLeftHand3D();
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

    // ПЕРЕДНЯЯ СТАЛЬНАЯ СТОЛЕШНИЦА ПРИЛАВКА (как на референс-скриншоте!)
    this.drawBox(0, 0.44, -0.54, 2.1, 0.82, 1.04, woodMain, 0.0);
    this.drawBox(0, 0.86, -0.54, 2.16, 0.07, 1.08, counterCol, 0.06, null, 0.55);
    this.drawBox(0, 0.9, -0.02, 2.1, 0.02, 0.025, trimCol, trimEmissive);

    // Широкий ступенчатый стальной подиум (мармит Bain-Marie) под 2 ряда увеличенных гастроемкостей
    this.drawBox(0, 0.915, -0.62, 0.88, 0.055, 0.22, [0.2, 0.24, 0.3], 0.06, null, 0.65);
    this.drawBox(0, 0.948, -0.85, 0.88, 0.115, 0.22, [0.22, 0.26, 0.33], 0.07, null, 0.7);
    // Боковые стальные бортики мармита
    this.drawBox(-0.435, 0.96, -0.735, 0.022, 0.12, 0.46, [0.36, 0.41, 0.48], 0.08, null, 0.8);
    this.drawBox(0.435, 0.96, -0.735, 0.022, 0.12, 0.46, [0.36, 0.41, 0.48], 0.08, null, 0.8);

    // ЗАДНЯЯ СТЕНКА-БОРТИК ПРИЛАВКА ТЕЛЕЖКИ (за контейнерами, z = -1.06, высотой до y = 1.07):
    // закрывает нижнюю часть покупателей и очереди с любого ракурса камеры!
    this.drawBox(0, 0.54, -1.06, 2.32, 0.98, 0.09, [0.15, 0.18, 0.24], 0.05, null, 0.5);
    this.drawBox(0, 1.045, -1.06, 2.34, 0.048, 0.13, counterCol, 0.08, null, 0.68);
    this.drawBox(0, 1.068, -1.0, 2.24, 0.015, 0.02, trimCol, trimEmissive);

    // ЛЕВАЯ СТОЛЕШНИЦА ВАРОЧНОГО ЦЕХА
    this.drawBox(-0.92, 0.44, -0.22, 0.92, 0.82, 1.75, woodMain, 0.0);
    this.drawBox(-0.92, 0.86, -0.22, 0.96, 0.07, 1.82, [0.22, 0.26, 0.32], 0.05, null, 0.45);
    this.drawBox(-0.45, 0.9, -0.22, 0.03, 0.025, 1.76, [0.0, 0.96, 0.83], 0.65);

    // ПРАВАЯ СТОЛЕШНИЦА СКЛАДА И УПАКОВКИ
    this.drawBox(0.92, 0.44, -0.22, 0.92, 0.82, 1.75, woodMain, 0.0);
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
  // СЕКТОР 1 (ПРИЛАВОК В 3D): 2 РЯДА ГАСТРОЕМКОСТЕЙ СВЕРХУ + 3 СЛОТА НА СТОЛЕ + МУСОРКА
  // =========================================================================
  drawCenterCounter3D() {
    const rt = gameState.runtime;
    const v = rt.activeVessel;
    const hasHeldVessel = Boolean(v && v.type);

    // 0. ПОДСТОЛЬНЫЙ МЕТАЛЛИЧЕСКИЙ БАК-МУСОРКА СЛЕВА СПЕРЕДИ (x = -0.42, z = +0.02)
    // Если в левой руке есть миска или коробка — тап по мусорке выбрасывает её из руки!
    const trashGlow = hasHeldVessel ? 0.45 + 0.25 * Math.sin(this.time * 5.0) : 0.1;
    const trashRimCol = hasHeldVessel ? [1.0, 0.28, 0.42] : [0.56, 0.62, 0.7];
    this.drawMesh('cylinder', -0.42, 0.56, 0.02, 0.21, 0.34, 0.21, [0.22, 0.26, 0.32], 0.06, null, 0.78);
    this.drawMesh('torus', -0.42, 0.73, 0.02, 0.218, 0.022, 0.218, trashRimCol, trashGlow, null, 0.9);
    this.drawMesh('cylinder', -0.42, 0.725, 0.02, 0.19, 0.015, 0.19, [0.06, 0.07, 0.1], 0.02, null, 0.2);
    this.registerHitbox('trash_bin', -0.42, 0.72, 0.02, 74);

    // Анимация выбрасывания посуды из левой руки в мусорку при тапе на бак
    if (this.trashTossAnim.active && this.trashTossAnim.vessel) {
      const p = Math.min(1, this.trashTossAnim.timer / this.trashTossAnim.duration);
      const handPos = this.getLeftHandWorldPos();
      const tx = handPos[0] + (-0.42 - handPos[0]) * p;
      const tz = handPos[2] + (0.02 - handPos[2]) * p;
      const ty =
        handPos[1] * (1 - p) +
        0.58 * p +
        Math.sin(p * Math.PI) * 0.12;
      const shrink = Math.max(0.32, 0.72 * (1 - Math.max(0, p - 0.5) * 1.1));
      this.drawFilledVessel3D(tx, ty, tz, this.trashTossAnim.vessel, shrink);
    }

    // 1. ТРИ СЛОТА НА ЦЕНТРАЛЬНОЙ ЧАСТИ СТОЛА (table_slot_0, table_slot_1, table_slot_2)
    // Сюда можно временно поставить до 3 мисок или коробок из левой руки, снова взять их
    // или перелить содержимое из одной посуды в другую (после чего пустая убирается со стола)!
    const slotXCoords = [-0.28, 0.0, 0.28];
    const slotY = 0.902;
    const slotZ = -0.22;

    for (let i = 0; i < 3; i++) {
      const sx = slotXCoords[i];
      const slotVessel = rt.tableSlots ? rt.tableSlots[i] : null;

      const isPlacingHere =
        this.slotAnim.active &&
        this.slotAnim.action === 'place' &&
        this.slotAnim.slotIndex === i;

      if (slotVessel && !isPlacingHere) {
        this.drawFilledVessel3D(sx, slotY + 0.002, slotZ, slotVessel, 0.76);
      }

      this.registerHitbox(`table_slot_${i}`, sx, slotY + 0.06, slotZ, 68);
    }

    // 1Б. АНИМАЦИЯ ПОСТАНОВКИ ПОСУДЫ НА СЛОТ СТОЛА ИЛИ ПЕРЕЛИВАНИЯ МЕЖДУ ПОСУДОЙ В РУКЕ И НА СТОЛЕ
    if (this.slotAnim.active && this.slotAnim.vessel) {
      const i = this.slotAnim.slotIndex;
      const sx = slotXCoords[i] ?? 0.0;
      const p = Math.min(1, this.slotAnim.timer / this.slotAnim.duration);
      const s = p * p * (3 - 2 * p);
      const handPos = this.getLeftHandWorldPos();

      if (this.slotAnim.action === 'place') {
        const vx = handPos[0] + (sx - handPos[0]) * s;
        const vy = handPos[1] + (slotY + 0.004 - handPos[1]) * s + Math.sin(p * Math.PI) * 0.06;
        const vz = handPos[2] + (slotZ - handPos[2]) * s;
        this.drawFilledVessel3D(vx, vy, vz, this.slotAnim.vessel, 0.72 + 0.04 * s);
      } else if (this.slotAnim.action === 'pour') {
        // Анимация переливания: на слоте стола стоит исходная посуда, из/в неё переливается бульон и лапша,
        // а после переливания (p > 0.72) пустая посуда автоматически убирается со стола!
        const emptyOnTable = {
          type: this.slotAnim.fromType || 'bowl',
          broth: p < 0.45 ? this.slotAnim.vessel.broth : null,
          noodleState: p < 0.5 ? this.slotAnim.vessel.noodleState : null,
          toppings: p < 0.55 ? this.slotAnim.vessel.toppings || [] : []
        };
        const tableScale = p < 0.72 ? 0.76 : Math.max(0.01, 0.76 * (1 - (p - 0.72) / 0.28));
        const slideZ = p < 0.72 ? slotZ : slotZ + ((p - 0.72) / 0.28) * 0.14;
        this.drawFilledVessel3D(sx, slotY + 0.004, slideZ, emptyOnTable, tableScale);

        // Струя бульона и каскад лапши при переливании (0.15 < p < 0.70)
        if (p > 0.15 && p < 0.7) {
          const bMap = {
            tonkotsu: [0.92, 0.74, 0.46],
            chili_broth: [0.95, 0.22, 0.18],
            miso_mushroom: [0.64, 0.18, 0.92]
          };
          const streamCol = bMap[this.slotAnim.vessel.broth] || [0.96, 0.82, 0.42];
          this.drawMesh(
            'cylinder',
            sx,
            slotY + 0.14,
            slotZ + 0.02,
            0.026,
            0.14,
            0.026,
            streamCol,
            0.82,
            null,
            0.95,
            4
          );
        }
      }
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

      if (isUnlocked) {
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
    this.registerHitbox('pacifier_cat', catX, catBaseY + 0.13, catZ, 52);
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

        this.registerHitbox(`basket_${i}`, bx, 1.05, bz, 72);
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

        this.registerHitbox(`broth_${bId}`, px, 1.06, pz, 76);
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
  // СЕКТОР 2 (СКЛАД, ПОСУДА И КУРЬЕР В 3D): МИСКИ И КОРОБКИ СЛЕВА ОТ ХОЛОДИЛЬНИКА,
  // ДОСТАВЩИК В ЛЕВОМ ВЕРХНЕМ УГЛУ И КРИО-ХОЛОДИЛЬНИК СО СТЕКЛЯННОЙ ДВЕРЦЕЙ СПРАВА!
  // =========================================================================
  drawRightFridgeAndSealer3D() {
    const rt = gameState.runtime;
    const needVesselPulse = !rt.activeVessel.type ? 0.35 + 0.25 * Math.sin(this.time * 5.0) : 0.16;

    // 1. ДИСПЕНСЕР КЕРАМИЧЕСКИХ МИСОК «ДОНБУРИ» + СТАКАН С ПАЛОЧКАМИ СЛЕВА ОТ ХОЛОДИЛЬНИКА У ПРАВОЙ СТЕНКИ (x = 0.84, z = -0.22)
    const bowlX = 0.84;
    const bowlZ = -0.22;
    this.drawBox(bowlX, 0.904, bowlZ, 0.24, 0.024, 0.23, [0.26, 0.16, 0.12], 0.08, null, 0.55);
    this.drawBox(bowlX, 0.917, bowlZ, 0.21, 0.006, 0.2, [0.16, 0.18, 0.22], 0.05, null, 0.3);
    this.drawBox(bowlX - 0.112, 0.914, bowlZ, 0.01, 0.008, 0.21, [1.0, 0.22, 0.54], needVesselPulse);

    // 4 угловых бамбуковых столбика-держателя стопки мисок
    for (const [dx, dz] of [[-0.098, -0.095], [0.098, -0.095], [-0.098, 0.095], [0.098, 0.095]]) {
      this.drawMesh('cylinder', bowlX + dx, 0.965, bowlZ + dz, 0.014, 0.1, 0.014, [0.58, 0.38, 0.2], 0.08, null, 0.5);
    }

    // Когда левая рука берёт верхнюю миску (grabbingBowl), на стопке остаются 3 нижние миски,
    // а 4-я (верхняя) плавно переносится самой левой рукой в drawHeldVesselInLeftHand3D!
    const grabbingBowl = this.rightGrabAnim.active && this.rightGrabAnim.type === 'bowl';
    const bowlStackCount = grabbingBowl ? 3 : 4;
    for (let m = 0; m < bowlStackCount; m++) {
      const my = 0.918 + m * 0.032;
      const ms = 0.195 + m * 0.004;
      this.drawMesh('bowl_lathe', bowlX, my, bowlZ, ms, 0.078, ms, [0.16, 0.1, 0.24], 0.12, null, 0.82, 3);
      this.drawMesh('torus', bowlX, my + 0.068, bowlZ, ms * 0.98, 0.012, ms * 0.98, [0.86, 0.22, 0.32], 0.22, null, 0.88);
    }

    // Подставка-стакан с бамбуковыми палочками «Варибаси» рядом с мисками (в стороне от обеих неоновых линий!)
    const cupX = 0.68;
    const cupZ = -0.11;
    this.drawMesh('cylinder', cupX, 0.948, cupZ, 0.062, 0.095, 0.062, [0.22, 0.15, 0.12], 0.08, null, 0.6);
    this.drawMesh('torus', cupX, 0.994, cupZ, 0.064, 0.008, 0.064, [0.78, 0.56, 0.26], 0.15, null, 0.8);
    for (let c = 0; c < 5; c++) {
      const ang = (c - 2) * 0.14;
      this.drawBox(cupX + (c - 2) * 0.008, 1.025, cupZ + (c % 2) * 0.006, 0.008, 0.095, 0.005, [0.92, 0.82, 0.62], 0.12, [ang * 0.5, 0, ang]);
      this.drawBox(cupX + (c - 2) * 0.008, 1.005, cupZ + (c % 2) * 0.006, 0.01, 0.035, 0.007, [0.95, 0.94, 0.9], 0.18, [ang * 0.5, 0, ang]);
    }

    this.registerHitbox('vessel_bowl', bowlX, 0.99, bowlZ, 78);

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
    const grabbingBox = this.rightGrabAnim.active && this.rightGrabAnim.type === 'box';
    const boxStackCount = grabbingBox ? 2 : 3;
    for (let k = 0; k < boxStackCount; k++) {
      const by = 0.914 + k * 0.042;
      this.draw3DWokBox(boxX, by, boxZ, 0.56 + k * 0.02, false);
    }

    this.registerHitbox('vessel_box', boxX, 1.0, boxZ, 78);

    // 3. КУРЬЕРСКИЙ ДРОН CYBER-EATS В ЛЕВОМ ВЕРХНЕМ УГЛУ (x = 0.72, y = 1.44, z = -0.46)
    // Парит наверху слева над столешницей, не перекрывая стопки мисок и коробок!
    const hasDelivery = Boolean(rt.activeDelivery);
    const deliveringNow = this.droneDeliverAnim.active;
    const padGlow = deliveringNow
      ? 0.98
      : hasDelivery
        ? 0.55 + 0.35 * Math.sin(this.time * 6.0)
        : 0.25;
    const padCol = deliveringNow || hasDelivery ? [0.06, 0.96, 0.42] : [0.0, 0.92, 0.86];

    const baseDroneX = 0.72;
    const baseDroneY = 1.44;
    const baseDroneZ = -0.46;

    // Компактное голографическое кольцо-маяк точки ожидания дрона в левом верхнем углу
    this.drawMesh('torus', baseDroneX, baseDroneY - 0.06, baseDroneZ, 0.19, 0.008, 0.19, padCol, padGlow * 0.8, null, 0.9);

    let droneX = baseDroneX;
    let droneY = baseDroneY + Math.sin(this.time * 4.2) * 0.026;
    let droneZ = baseDroneZ;
    const rotorSpin = this.time * (hasDelivery || deliveringNow ? 24 : 8);

    if (deliveringNow) {
      const p = Math.min(1, this.droneDeliverAnim.timer / this.droneDeliverAnim.duration);
      const handPos = this.getLeftHandWorldPos();

      if (p < 0.46) {
        // Фаза 1: Вок-коробка поднимается из левой руки к дрону в левый верхний угол, её 4 клапана автоматически закрываются!
        const t = p / 0.46;
        const s = t * t * (3 - 2 * t);
        const bx = handPos[0] + (baseDroneX - handPos[0]) * s;
        const by = handPos[1] + (baseDroneY - 0.16 - handPos[1]) * s + Math.sin(t * Math.PI) * 0.05;
        const bz = handPos[2] + (baseDroneZ - handPos[2]) * s;
        const sealProg = Math.min(1, t * 1.15);
        this.drawFilledVessel3D(bx, by, bz, { ...this.droneDeliverAnim.vessel, type: 'box' }, 0.6, sealProg);
      } else {
        // Фаза 2: Запечатанная вок-коробка захвачена лапами дрона, и дрон улетает в ночное небо!
        const t = (p - 0.46) / 0.54;
        const fly = t * t;
        droneY = baseDroneY + fly * 0.85;
        droneZ = baseDroneZ - fly * 1.85;
        droneX = baseDroneX + fly * 0.22;
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

    // Отрисовываем 3D-квадрокоптер курьерской службы CyberEats в левом верхнем углу
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

    this.registerHitbox('courier_drone', droneX, droneY - 0.03, droneZ, 94);

    // 5. ПРОФЕССИОНАЛЬНЫЙ БАРНЫЙ КРИО-ХОЛОДИЛЬНИК СО СТЕКЛЯННОЙ ВИТРИНОЙ (x = 0.89, z = +0.23)
    // Корпус из матовой нержавейки, верхний компрессорный отсек с решёткой радиатора и цифровым дисплеем «-4°C»,
    // внутренняя ледяная LED-подсветка, 3 стальные полки с гастроемкостями запасов и стеклянная дверца с ручкой!
    this.drawBox(0.9, 1.19, 0.23, 0.3, 0.66, 0.38, [0.16, 0.21, 0.28], 0.1, null, 0.82);
    // Внутренняя светящаяся крио-камера холодильника
    this.drawBox(0.86, 1.15, 0.23, 0.24, 0.5, 0.33, [0.06, 0.28, 0.42], 0.45, null, 0.7);
    // Верхняя панель агрегата с вентиляционными жалюзи и бирюзовым LED-индикатором температуры
    this.drawBox(0.88, 1.46, 0.23, 0.31, 0.09, 0.39, [0.22, 0.27, 0.35], 0.12, null, 0.88);
    this.drawBox(0.722, 1.46, 0.16, 0.012, 0.042, 0.095, [0.0, 0.96, 0.88], 0.92);
    this.drawBox(0.722, 1.46, 0.29, 0.012, 0.045, 0.12, [0.08, 0.1, 0.14], 0.1);

    // 3 внутренние стальные полки-решётки холодильника с богатым запасом ингредиентов
    this.drawBox(0.84, 1.0, 0.23, 0.22, 0.012, 0.32, [0.58, 0.66, 0.74], 0.2, null, 0.9);
    this.drawBox(0.84, 1.15, 0.23, 0.22, 0.012, 0.32, [0.58, 0.66, 0.74], 0.2, null, 0.9);
    this.drawBox(0.84, 1.29, 0.23, 0.22, 0.012, 0.32, [0.58, 0.66, 0.74], 0.2, null, 0.9);

    // Нижняя полка: лоток с маринованными яйцами Аджитама и рулеты свинины Тяшу
    this.draw3DAjitamaEggHalf(0.81, 1.01, 0.14, 0.88, 0.4);
    this.draw3DAjitamaEggHalf(0.81, 1.01, 0.21, 0.88, -0.3);
    this.draw3DChashuSlice(0.81, 1.02, 0.3, 0.92, [0.18, 0.4, 0]);
    this.draw3DChashuSlice(0.81, 1.04, 0.31, 0.92, [0.22, 0.2, 0]);

    // Средняя полка: пачки листов Нори, зелёный лук и золотистые креветки Темпура
    this.draw3DNoriSheet(0.81, 1.19, 0.14, 0.85, [-0.15, 0.35, 0]);
    this.draw3DNoriSheet(0.83, 1.19, 0.16, 0.85, [-0.1, 0.42, 0]);
    this.draw3DTempuraShrimp(0.8, 1.165, 0.25, 0.9, 0.3);
    this.draw3DScallionRing(0.8, 1.17, 0.32, 0.95, [0.1, 0.3, 0]);

    // Верхняя полка: запасные красные бутылочки острого чили-соуса с носиками
    for (const bz of [0.14, 0.23, 0.31]) {
      this.drawMesh('cylinder', 0.81, 1.34, bz, 0.048, 0.085, 0.048, [0.95, 0.14, 0.24], 0.45, null, 0.75);
      this.drawMesh('cone', 0.81, 1.395, bz, 0.022, 0.032, 0.022, [1.0, 0.55, 0.1], 0.5);
    }

    // Алюминиевая рама стеклянной дверцы холодильника и длинная вертикальная хромированная ручка слева
    this.drawBox(0.735, 1.15, 0.055, 0.022, 0.54, 0.022, [0.68, 0.75, 0.84], 0.25, null, 0.95);
    this.drawBox(0.735, 1.15, 0.405, 0.022, 0.54, 0.022, [0.68, 0.75, 0.84], 0.25, null, 0.95);
    this.drawBox(0.735, 1.41, 0.23, 0.022, 0.024, 0.37, [0.68, 0.75, 0.84], 0.25, null, 0.95);
    this.drawBox(0.735, 0.89, 0.23, 0.022, 0.024, 0.37, [0.68, 0.75, 0.84], 0.25, null, 0.95);
    // Световые блики на стекле витрины и вертикальная ручка дверцы
    this.drawBox(0.732, 1.15, 0.23, 0.006, 0.5, 0.32, [0.0, 0.82, 1.0], 0.32, null, 0.98);
    this.drawMesh('cylinder', 0.705, 1.15, 0.085, 0.016, 0.24, 0.016, [0.85, 0.9, 0.96], 0.3, null, 0.98);

    this.registerHitbox('cryo_fridge', 0.86, 1.15, 0.23, 84);
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

      this.registerHitbox('customer_serve', cx, cy + 0.05, cz, 95);
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
    const v = rt.activeVessel;
    if (!v || (v.type !== 'bowl' && v.type !== 'box')) return;
    if (this.droneDeliverAnim.active || this.trashTossAnim.active) return;

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

    if (this.rightGrabAnim.active) {
      // ЕДИНАЯ ПЛАВНАЯ АНИМАЦИЯ ВЗЯТИЯ МИСКИ ИЛИ КОРОБКИ СО СТОПКИ ЛЕВОЙ РУКОЙ:
      // 1) p < 0.28: верхняя миска/коробка ещё лежит на стопке, а левая рука тянется к ней;
      // 2) p >= 0.28: левая рука захватывает миску/коробку со стопки и плавно переносит её по дуге к себе!
      const isBox = v.type === 'box';
      const stackX = 0.84;
      const stackY = isBox ? 0.998 : 1.014;
      const stackZ = isBox ? -0.5 : -0.22;
      const stackScale = isBox ? 0.6 : 0.49;

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
      toppings: v.toppings || [],
      overflowCount: v.overflowCount || 0
    };

    this.drawFilledVessel3D(hx, hy, hz, heldView, vesselScale, false);

    // ЛЕВАЯ РУКА ПОВАРА: расположена строго ПОД донышком (hy - 0.036) и снаружи левой стенки,
    // чтобы перчатка и пальцы никогда не просвечивали сквозь внутреннее дно миски или коробки!
    const { F, R } = this.getCameraBasis();
    const yawAngle = Math.atan2(-F[0], -F[2]);
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

  drawBox(x, y, z, sx, sy, sz, color, emissive = 0.0, rot = null, specular = 0.15, pattern = 0) {
    this.drawMesh('box', x, y, z, sx, sy, sz, color, emissive, rot, specular, pattern);
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
    gl.drawArrays(gl.TRIANGLES, info.first, info.count);
    gl.uniform1f(this.uUseTex, 0.0);
  }

  drawMesh(meshName, x, y, z, sx, sy, sz, color, emissive = 0.0, rot = null, specular = 0.25, pattern = 0) {
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
    gl.drawArrays(gl.TRIANGLES, info.first, info.count);
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
