// Процедурный генератор высокодетализированных текстур и аниме-киберпанк персонажей (Canvas2D -> WebGL Texture)
// В стиле референс-арта: дождливый неоновый переулок с вывесками кандзи и аниме-гостьи в кибер-куртках с визором на лбу.

function createGLTextureFromCanvas(gl, canvas, clamp = true) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_S,
    clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_T,
    clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT
  );
  return tex;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 1. Задник глубокого туманного киберпанк-переулка (небоскрёбы в дымке, окна, провода, свет фар)
export function createAlleyBackdropTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Атмосферный градиент ночного дождливого каньона мегаполиса (бирюзово-синий туман как на референсе)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  skyGrad.addColorStop(0.0, '#13232e');
  skyGrad.addColorStop(0.32, '#1d3847');
  skyGrad.addColorStop(0.62, '#274959');
  skyGrad.addColorStop(0.82, '#1a2e3b');
  skyGrad.addColorStop(1.0, '#0d1720');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Силуэты дальних мега-башен сквозь дождливую дымку
  const towers = [
    { x: 60, y: 80, w: 180, h: 720, col: '#142632', winCol: '#7be8ff' },
    { x: 220, y: 140, w: 155, h: 660, col: '#182d3a', winCol: '#ffd175' },
    { x: 350, y: 40, w: 220, h: 760, col: '#162936', winCol: '#8ef5ff' },
    { x: 545, y: 110, w: 190, h: 690, col: '#152733', winCol: '#ff85c8' },
    { x: 710, y: 65, w: 210, h: 740, col: '#12222d', winCol: '#7be8ff' }
  ];

  for (const t of towers) {
    ctx.fillStyle = t.col;
    ctx.fillRect(t.x, t.y, t.w, t.h);

    // Сетка светящихся окон небоскрёбов
    ctx.fillStyle = t.winCol;
    for (let wy = t.y + 28; wy < t.y + t.h - 40; wy += 22) {
      for (let wx = t.x + 16; wx < t.x + t.w - 20; wx += 18) {
        const seed = Math.sin(wx * 12.7 + wy * 31.3);
        if (seed > 0.15) {
          ctx.globalAlpha = seed > 0.7 ? 0.55 : 0.22;
          ctx.fillRect(wx, wy, 9, 12);
        }
      }
    }
  }
  ctx.globalAlpha = 1.0;

  // Мягкая голубоватая дымка в глубине улицы (эффект тумана после дождя)
  const mistGrad = ctx.createRadialGradient(480, 560, 40, 480, 560, 520);
  mistGrad.addColorStop(0.0, 'rgba(135, 215, 235, 0.42)');
  mistGrad.addColorStop(0.55, 'rgba(62, 118, 142, 0.24)');
  mistGrad.addColorStop(1.0, 'rgba(18, 34, 46, 0.0)');
  ctx.fillStyle = mistGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Перетянутые через переулок силуэты уличных проводов на фоне неба
  ctx.strokeStyle = 'rgba(10, 18, 26, 0.78)';
  ctx.lineWidth = 3.5;
  for (let i = 0; i < 9; i++) {
    const y0 = 150 + i * 48;
    const y1 = 165 + ((i * 37) % 160);
    const sag = 35 + (i % 3) * 28;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.quadraticCurveTo(512, Math.max(y0, y1) + sag, 1024, y1);
    ctx.stroke();
  }

  return createGLTextureFromCanvas(gl, c);
}

// 2. Текстура боковых фасадов зданий переулка (рольставни шаッター, трубы, бетон, кондиционеры)
export function createBuildingFacadeTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext('2d');

  const wallGrad = ctx.createLinearGradient(0, 0, 512, 1024);
  wallGrad.addColorStop(0.0, '#1a222c');
  wallGrad.addColorStop(0.5, '#202a36');
  wallGrad.addColorStop(1.0, '#10161e');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, 512, 1024);

  // Горизонтальные швы бетонных плит и потёки дождя
  ctx.strokeStyle = 'rgba(8, 12, 18, 0.65)';
  ctx.lineWidth = 3;
  for (let y = 60; y < 1024; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Металлические гофрированные рольставни закрытых лавок внизу стены
  for (let sx = 28; sx < 460; sx += 225) {
    ctx.fillStyle = '#141c24';
    ctx.fillRect(sx, 510, 195, 460);
    for (let ry = 520; ry < 960; ry += 14) {
      ctx.fillStyle = ry % 28 === 0 ? '#263342' : '#0f151c';
      ctx.fillRect(sx + 6, ry, 183, 8);
    }
    ctx.strokeStyle = '#334457';
    ctx.lineWidth = 4;
    ctx.strokeRect(sx, 510, 195, 460);
  }

  // Вертикальные коммуникационные трубы и кабель-каналы
  ctx.fillStyle = '#2b3947';
  ctx.fillRect(232, 0, 18, 1024);
  ctx.fillStyle = '#3c4d5e';
  ctx.fillRect(236, 0, 5, 1024);

  // Неоновые рефлексы на мокрой стене
  const pinkGlow = ctx.createRadialGradient(380, 320, 10, 380, 320, 220);
  pinkGlow.addColorStop(0, 'rgba(255, 50, 160, 0.28)');
  pinkGlow.addColorStop(1, 'rgba(255, 50, 160, 0)');
  ctx.fillStyle = pinkGlow;
  ctx.fillRect(0, 0, 512, 1024);

  return createGLTextureFromCanvas(gl, c);
}

// 3. Текстура наружного блока кондиционера (с решёткой вентилятора как слева вверху на скриншоте)
export function createACUnitTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#8b99a6';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#47535e';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  // Круглая шахта вентилятора слева
  ctx.fillStyle = '#1b2229';
  ctx.beginPath();
  ctx.arc(98, 128, 72, 0, Math.PI * 2);
  ctx.fill();

  // Лопасти и защитная сетка
  ctx.strokeStyle = '#394652';
  ctx.lineWidth = 4;
  for (let r = 22; r <= 70; r += 16) {
    ctx.beginPath();
    ctx.arc(98, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(98, 128);
    ctx.lineTo(98 + Math.cos(ang) * 72, 128 + Math.sin(ang) * 72);
    ctx.stroke();
  }

  // Боковая вентиляционная решётка справа
  ctx.fillStyle = '#2d3740';
  for (let y = 44; y < 210; y += 14) {
    ctx.fillRect(186, y, 46, 7);
  }

  return createGLTextureFromCanvas(gl, c);
}

// 4. Текстура мокрого асфальта с лужами и отражениями неона
export function createWetAsphaltTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, 512, 512);

  // Зернистость мокрой брусчатки/асфальта
  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(38, 58, 74, 0.35)' : 'rgba(8, 12, 18, 0.5)';
    ctx.fillRect(x, y, 12, 4);
  }

  // Отражения розовых, бирюзовых и тёплых вывесок в мокрых лужах
  const puddles = [
    { x: 130, y: 260, rx: 95, ry: 180, col: 'rgba(255, 45, 145, 0.32)' },
    { x: 370, y: 240, rx: 90, ry: 190, col: 'rgba(0, 240, 220, 0.28)' },
    { x: 256, y: 180, rx: 110, ry: 140, col: 'rgba(210, 245, 255, 0.26)' }
  ];
  for (const p of puddles) {
    const g = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, p.ry);
    g.addColorStop(0, p.col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }

  // Горизонтальные полосы ряби от дождя в лужах
  ctx.fillStyle = 'rgba(180, 235, 255, 0.16)';
  for (let y = 20; y < 500; y += 16) {
    ctx.fillRect(60 + ((y * 19) % 180), y, 85, 2);
  }

  return createGLTextureFromCanvas(gl, c, false);
}

// 5. Набор неоновых вывесок с японскими иероглифами кандзи/катаканой (как на скриншоте!)
export function createKanjiSignTextures(gl) {
  const specs = [
    {
      id: 'ramen_white',
      w: 256,
      h: 640,
      bg: '#fff7eb',
      border: '#d62828',
      textCol: '#d62828',
      subCol: '#222831',
      chars: ['ラ', 'ー', 'メ', 'ン'],
      sub: '本格中華そば'
    },
    {
      id: 'pink_cyber',
      w: 256,
      h: 640,
      bg: '#ff2a95',
      border: '#ffb8e6',
      textCol: '#ffffff',
      subCol: '#ffe3f4',
      chars: ['夜', '屋', '台', '街'],
      sub: 'サイバー'
    },
    {
      id: 'yellow_izakaya',
      w: 220,
      h: 560,
      bg: '#ffbe2e',
      border: '#5c2a00',
      textCol: '#241004',
      subCol: '#8f1d00',
      chars: ['定', '食', '餃', '子'],
      sub: '営業中'
    },
    {
      id: 'cyan_denno',
      w: 220,
      h: 560,
      bg: '#00d8d8',
      border: '#b8ffff',
      textCol: '#04222b',
      subCol: '#ffffff',
      chars: ['電', '脳', '九', '龍'],
      sub: '24時間'
    },
    {
      id: 'hobon_horiz',
      w: 512,
      h: 180,
      bg: '#fff4e4',
      border: '#c92a2a',
      textCol: '#b81d1d',
      subCol: '#2b2b2b',
      chars: ['ホ', 'ボ', 'ー', 'ン'],
      horiz: true
    }
  ];

  const out = {};
  for (const s of specs) {
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const ctx = c.getContext('2d');

    // Светящийся фон короба вывески
    ctx.fillStyle = s.bg;
    roundRectPath(ctx, 6, 6, s.w - 12, s.h - 12, 16);
    ctx.fill();

    // Контурная рамка
    ctx.strokeStyle = s.border;
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.fillStyle = s.textCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (s.horiz) {
      ctx.font = '900 84px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
      ctx.fillText(s.chars.join(''), s.w * 0.5, s.h * 0.54);
    } else {
      ctx.font = '900 102px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
      const startY = 105;
      const stepY = 118;
      s.chars.forEach((ch, idx) => {
        ctx.fillText(ch, s.w * 0.5, startY + idx * stepY);
      });
      if (s.sub) {
        ctx.fillStyle = s.subCol;
        ctx.font = '700 32px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(s.sub, s.w * 0.5, s.h - 48);
      }
    }

    out[s.id] = createGLTextureFromCanvas(gl, c);
  }
  return out;
}

// 5Б. Аутентичная японско-киберпанковская доска «MENU / お品書き» на левой стене (без русского текста — чистый стиль ятая!)
export function createWallMenuSignTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext('2d');

  // Глубокая лакированная кедровая доска с фактурой дерева
  const bg = ctx.createLinearGradient(0, 0, 512, 320);
  bg.addColorStop(0, '#221614');
  bg.addColorStop(0.5, '#171014');
  bg.addColorStop(1, '#110b12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 320);

  // Тонкие древесные волокна
  ctx.fillStyle = 'rgba(255, 195, 130, 0.045)';
  for (let y = 10; y < 312; y += 14) {
    ctx.fillRect(14, y, 484, 3);
  }

  // Тёмная бронзовая внешняя рамка + тонкая неоновая внутренняя линия
  ctx.strokeStyle = '#c8843c';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 300);
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.72)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(22, 22, 468, 276);

  // Угловые декоративные золотые уголки (японский орнамент рамки)
  ctx.fillStyle = '#e5a34e';
  for (const [cx, cy] of [[22, 22], [490, 22], [22, 298], [490, 298]]) {
    ctx.fillRect(cx - 5, cy - 5, 10, 10);
  }

  // Левая колонка: стилизованная векторная миска рамена с паром и палочками + красная печать «拉麺»
  // Неоновый ореол за миской
  const glow = ctx.createRadialGradient(118, 165, 12, 118, 165, 86);
  glow.addColorStop(0, 'rgba(255, 60, 100, 0.25)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(30, 70, 180, 190);

  // Волнистые линии пара над миской
  ctx.strokeStyle = '#00f5d4';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const sx of [96, 118, 140]) {
    ctx.beginPath();
    ctx.moveTo(sx, 142);
    ctx.quadraticCurveTo(sx - 9, 122, sx, 106);
    ctx.quadraticCurveTo(sx + 9, 90, sx, 74);
    ctx.stroke();
  }

  // Пара палочек наискосок
  ctx.strokeStyle = '#f3d49b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 152);
  ctx.lineTo(186, 128);
  ctx.moveTo(68, 162);
  ctx.lineTo(188, 142);
  ctx.stroke();

  // Миска рамена (полукруг + ободок + основание)
  ctx.fillStyle = '#d92238';
  ctx.beginPath();
  ctx.arc(118, 166, 56, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8e6c8';
  ctx.fillRect(62, 162, 112, 8);
  ctx.fillStyle = '#991628';
  ctx.fillRect(92, 220, 52, 12);

  // Вертикальная разделительная линия
  ctx.strokeStyle = 'rgba(229, 163, 78, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(212, 46);
  ctx.lineTo(212, 274);
  ctx.stroke();

  // Правая часть: стильный заголовок «MENU» + кандзи «お品書き» + лаконичные строки прайса
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffcf70';
  ctx.font = '700 22px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  ctx.fillText('お品書き  •  夜台', 236, 66);

  ctx.fillStyle = '#00f5d4';
  ctx.shadowColor = 'rgba(0, 245, 212, 0.65)';
  ctx.shadowBlur = 14;
  ctx.font = '900 58px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
  ctx.fillText('MENU', 234, 122);
  ctx.shadowBlur = 0;

  // 3 стильные строчки-позиции с кандзи и точками
  const rows = [
    ['豚骨拉麺', '¥'],
    ['辛口味噌', '¥'],
    ['天婦羅麺', '¥']
  ];
  ctx.font = '700 22px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  rows.forEach(([label, cur], idx) => {
    const ry = 182 + idx * 36;
    ctx.fillStyle = '#f4ead8';
    ctx.fillText(label, 236, ry);
    ctx.fillStyle = 'rgba(255, 207, 112, 0.45)';
    ctx.fillText('• • • • •', 336, ry);
    ctx.fillStyle = '#ffcf70';
    ctx.fillText(cur, 428, ry);
  });

  // Красная японская печать «ханко» в правом верхнем углу
  ctx.fillStyle = '#d92238';
  ctx.fillRect(424, 46, 44, 44);
  ctx.strokeStyle = '#ffcf70';
  ctx.lineWidth = 2;
  ctx.strokeRect(427, 49, 38, 38);
  ctx.fillStyle = '#fff5e4';
  ctx.textAlign = 'center';
  ctx.font = '900 20px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  ctx.fillText('麺', 446, 69);

  return createGLTextureFromCanvas(gl, c);
}

// 6. Силуэты прохожих в капюшонах с неоновыми полосами в глубине переулка (как на скриншоте!)
export function createPedestrianTextures(gl) {
  const configs = [
    { neon1: '#00f5d4', neon2: '#ff2a95' },
    { neon1: '#ff2a95', neon2: '#10f56c' },
    { neon1: '#00d8ff', neon2: '#00f5d4' }
  ];

  return configs.map((cfg) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 512);

    // Ноги в тёмных кибер-брюках
    ctx.fillStyle = '#0e1620';
    ctx.lineCap = 'round';
    ctx.lineWidth = 24;
    ctx.strokeStyle = '#0e1620';
    ctx.beginPath();
    ctx.moveTo(106, 290);
    ctx.lineTo(96, 485);
    ctx.moveTo(150, 290);
    ctx.lineTo(158, 485);
    ctx.stroke();

    // Куртка с капюшоном
    ctx.fillStyle = '#111b26';
    ctx.beginPath();
    ctx.moveTo(86, 130);
    ctx.lineTo(170, 130);
    ctx.lineTo(192, 295);
    ctx.lineTo(64, 295);
    ctx.closePath();
    ctx.fill();

    // Капюшон
    ctx.beginPath();
    ctx.arc(128, 96, 38, 0, Math.PI * 2);
    ctx.fill();

    // Светящиеся неоновые полосы на куртке, рукавах и капюшоне (в стиле скриншота!)
    ctx.shadowColor = cfg.neon1;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = cfg.neon1;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 92, 28, Math.PI * 0.85, Math.PI * 2.15);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(92, 145);
    ctx.lineTo(72, 265);
    ctx.moveTo(164, 145);
    ctx.lineTo(184, 265);
    ctx.moveTo(98, 205);
    ctx.lineTo(158, 205);
    ctx.stroke();

    ctx.shadowColor = cfg.neon2;
    ctx.strokeStyle = cfg.neon2;
    ctx.beginPath();
    ctx.moveTo(104, 148);
    ctx.lineTo(104, 282);
    ctx.moveTo(152, 148);
    ctx.lineTo(152, 282);
    ctx.stroke();
    ctx.shadowBlur = 0;

    return createGLTextureFromCanvas(gl, c);
  });
}

// 7. ДИНАМИЧЕСКИЙ ГЕНЕРАТОР АНИМЕ-КИБЕРПАНК ПЕРСОНАЖЕЙ (4 УНИКАЛЬНЫХ ПЕРСОНАЖА В ОДНОМ АНИМЕ-СТИЛЕ!)
// Каждый персонаж имеет собственный кэшируемый WebGL-текстурный слот, моргание глаз и артикуляцию рта при речи.
export class AnimeCustomerTextureRenderer {
  constructor(gl) {
    this.gl = gl;
    this.slots = new Map();
  }

  getOrCreateSlot(charId) {
    let slot = this.slots.get(charId);
    if (!slot) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      const texture = this.gl.createTexture();
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      slot = { canvas, ctx, texture, lastStateKey: '' };
      this.slots.set(charId, slot);
    }
    return slot;
  }

  getStyleForCustomer(cust) {
    const id = cust?.id || 'student';
    const presets = {
      // 1. КИРА (Розоволосая кибер-курьерша со скриншота с голографическим визором на лбу)
      student: {
        archetype: 'kira',
        hairMain: '#d92672',
        hairDark: '#7a1141',
        hairHighlight: '#ff7eb9',
        skin: '#f4c5ad',
        skinShadow: '#d4987d',
        eyeIris: '#472a28',
        jacketDark: '#1c1829',
        jacketMid: '#2a243d',
        collarGlow: '#00f5e5',
        neonTrace: '#ff33aa',
        visorGrad1: '#ff8ad8',
        visorGrad2: '#94f7ff',
        phaseOffset: 0.0
      },
      // 2. РАЙДЭН (Неоновый Ронин / Кибер-самурай с пепельно-серебристыми волосами, катаной за плечом, шрамом и респиратором)
      samurai: {
        archetype: 'raiden',
        hairMain: '#b8cbe0',
        hairDark: '#4a5d78',
        hairHighlight: '#f0f6ff',
        skin: '#edd',
        skinBase: '#ecc1a8',
        skinShadow: '#c79276',
        eyeIris: '#ff9f1c',
        jacketDark: '#141824',
        jacketMid: '#1f2638',
        collarGlow: '#ff2a55',
        neonTrace: '#00f5d4',
        visorGrad1: '#ff2a55',
        visorGrad2: '#ffaa00',
        phaseOffset: 1.9
      },
      // 3. НИКС (Аниме-Хакерша / Нетраннер с двухцветными фиолетово-мятными хвостиками, светящимися кошачьими кибер-ушками и AR-моноклем)
      hacker: {
        archetype: 'nyx',
        hairMain: '#7b2cbf',
        hairDark: '#3c096c',
        hairHighlight: '#00f5d4',
        skin: '#f7d1bf',
        skinShadow: '#d8a28c',
        eyeIris: '#ff2a85',
        jacketDark: '#17132b',
        jacketMid: '#241e42',
        collarGlow: '#10f56c',
        neonTrace: '#00f5d4',
        visorGrad1: '#00f5d4',
        visorGrad2: '#b5179e',
        phaseOffset: 3.4
      },
      // 4. АКАНЭ (Элитный агент корпорации с платиновым каре, алыми прядями и золотыми кибер-имплантами)
      corpo: {
        archetype: 'akane',
        hairMain: '#dce2ec',
        hairDark: '#6c7a94',
        hairHighlight: '#ffffff',
        skin: '#f6cbb6',
        skinShadow: '#d49a82',
        eyeIris: '#e6194b',
        jacketDark: '#16141f',
        jacketMid: '#261f33',
        collarGlow: '#ffbe0b',
        neonTrace: '#ff2a55',
        visorGrad1: '#ffbe0b',
        visorGrad2: '#ff2a55',
        phaseOffset: 4.8
      }
    };
    return presets[id] || presets.student;
  }

  updateCustomerTexture(cust, isTalking, time) {
    const charId = cust?.id || 'student';
    const st = this.getStyleForCustomer(cust);
    const slot = this.getOrCreateSlot(charId);

    const blink = Math.sin(time * 1.85 + st.phaseOffset) > 0.955 ? 1 : 0;
    const mouthFrame = isTalking ? Math.floor(Math.abs(Math.sin(time * 18.0)) * 3.4) : 0;
    const key = `${charId}|${blink}|${mouthFrame}`;

    if (key === slot.lastStateKey) {
      return slot.texture;
    }
    slot.lastStateKey = key;

    const ctx = slot.ctx;
    ctx.clearRect(0, 0, 640, 800);

    if (st.archetype === 'raiden') {
      this.drawRaidenRonin(ctx, st, blink, mouthFrame);
    } else if (st.archetype === 'nyx') {
      this.drawNyxHacker(ctx, st, blink, mouthFrame);
    } else if (st.archetype === 'akane') {
      this.drawAkaneCorpo(ctx, st, blink, mouthFrame);
    } else {
      this.drawKiraOrAkane(ctx, st, blink, mouthFrame);
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slot.canvas);
    return slot.texture;
  }

  // ===========================================================================
  // ПЕРСОНАЖ 2: РАЙДЭН — НЕОНОВЫЙ РОНИН (СЕРЕБРИСТЫЕ ВЗЪЕРОШЕННЫЕ ВОЛОСЫ, КАТАНА ЗА ПЛЕЧОМ, ШРАМ И КИБЕР-МАСКА)
  // ===========================================================================
  drawRaidenRonin(ctx, st, blink, mouthFrame) {
    const skin = st.skinBase || '#ecc1a8';

    // 1. РУКОЯТЬ НЕОНОВОЙ КАТАНЫ ЗА ПРАВЫМ ПЛЕЧОМ (Цука с ромбовидной оплёткой и светящейся гардой)
    ctx.save();
    ctx.translate(455, 255);
    ctx.rotate(0.42);
    // Ножны и длинная рукоять
    ctx.fillStyle = '#121521';
    roundRectPath(ctx, -18, -145, 36, 260, 8);
    ctx.fill();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Ромбовидная самурайская оплётка рукояти (tsuka-ito)
    ctx.fillStyle = '#ff2a55';
    for (let y = -128; y < -15; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(13, y + 10);
      ctx.lineTo(0, y + 20);
      ctx.lineTo(-13, y + 10);
      ctx.closePath();
      ctx.fill();
    }
    // Золотая гарда (Цуба) с неоновым свечением
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffbe0b';
    roundRectPath(ctx, -30, -12, 60, 12, 4);
    ctx.fill();
    ctx.restore();

    // 2. ЗАДНИЕ ОСТРЫЕ ПРЯДИ СЕРЕБРИСТЫХ ВОЛОС
    ctx.fillStyle = st.hairDark;
    ctx.beginPath();
    ctx.moveTo(195, 175);
    ctx.lineTo(148, 255);
    ctx.lineTo(182, 275);
    ctx.lineTo(155, 345);
    ctx.lineTo(215, 375);
    ctx.lineTo(425, 375);
    ctx.lineTo(485, 345);
    ctx.lineTo(458, 275);
    ctx.lineTo(492, 255);
    ctx.lineTo(445, 175);
    ctx.closePath();
    ctx.fill();

    // 3. ШЕЯ И ТЕМНАЯ ТАКТИЧЕСКАЯ ВОДОЛАЗКА С НЕОНОВЫМИ ЛИНИЯМИ ИМПЛАНТОВ
    ctx.fillStyle = skin;
    ctx.fillRect(280, 325, 80, 95);
    ctx.fillStyle = st.skinShadow;
    ctx.beginPath();
    ctx.moveTo(280, 335);
    ctx.quadraticCurveTo(320, 382, 360, 335);
    ctx.lineTo(360, 372);
    ctx.quadraticCurveTo(320, 402, 280, 372);
    ctx.closePath();
    ctx.fill();

    // Тактический кибер-жилет под курткой
    ctx.fillStyle = '#121622';
    ctx.beginPath();
    ctx.moveTo(210, 405);
    ctx.lineTo(430, 405);
    ctx.lineTo(412, 760);
    ctx.lineTo(228, 760);
    ctx.closePath();
    ctx.fill();

    // Светящаяся нагрудная эмблема неонового дракона/самурая
    ctx.save();
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(278, 465);
    ctx.lineTo(320, 525);
    ctx.lineTo(362, 465);
    ctx.moveTo(290, 515);
    ctx.lineTo(320, 565);
    ctx.lineTo(350, 515);
    ctx.stroke();
    ctx.restore();

    // 4. ВЫСОКИЙ БРОНИРОВАННЫЙ ВОРОТНИК ТЕХНО-САМУРАЯ С ОГНЕННО-АЛОЙ ПОДСВЕТКОЙ
    ctx.save();
    ctx.shadowColor = st.collarGlow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = st.collarGlow;
    ctx.beginPath();
    ctx.moveTo(192, 325);
    ctx.lineTo(278, 342);
    ctx.lineTo(288, 445);
    ctx.lineTo(204, 425);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(448, 325);
    ctx.lineTo(362, 342);
    ctx.lineTo(352, 445);
    ctx.lineTo(436, 425);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Широкие плечи, куртка и кибер-брюки Ронина (до самого низа y = 800)
    ctx.fillStyle = '#0e131d';
    ctx.fillRect(195, 700, 115, 100);
    ctx.fillRect(330, 700, 115, 100);

    ctx.fillStyle = st.jacketDark;
    ctx.beginPath();
    ctx.moveTo(205, 340);
    ctx.lineTo(284, 415);
    ctx.lineTo(272, 798);
    ctx.lineTo(132, 798);
    ctx.lineTo(124, 445);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(435, 340);
    ctx.lineTo(356, 415);
    ctx.lineTo(368, 798);
    ctx.lineTo(508, 798);
    ctx.lineTo(516, 445);
    ctx.closePath();
    ctx.fill();

    // Диагональный ремень ножен через грудь
    ctx.fillStyle = '#1e2436';
    ctx.beginPath();
    ctx.moveTo(225, 415);
    ctx.lineTo(265, 405);
    ctx.lineTo(428, 690);
    ctx.lineTo(385, 705);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(302, 512, 38, 28);

    // Неоновые бирюзовые и алые контуры на плечах и лацканах куртки
    ctx.save();
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(262, 425);
    ctx.lineTo(238, 535);
    ctx.lineTo(252, 710);
    ctx.moveTo(148, 455);
    ctx.lineTo(218, 472);
    ctx.lineTo(195, 610);
    ctx.moveTo(378, 425);
    ctx.lineTo(402, 535);
    ctx.lineTo(388, 710);
    ctx.moveTo(492, 455);
    ctx.lineTo(422, 472);
    ctx.lineTo(445, 610);
    ctx.stroke();

    // Наплечные броне-индикаторы
    ctx.fillStyle = '#ff2a55';
    ctx.shadowColor = '#ff2a55';
    ctx.beginPath();
    ctx.arc(154, 520, 12, 0, Math.PI * 2);
    ctx.arc(486, 520, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. МУЖСКОЕ АНИМЕ-ЛИЦО РОНИНА (ОСТРЫЕ СКУЛЫ, СВЕТЯЩИЙСЯ КИБЕР-ШРАМ, ЯНТАРНЫЕ ГЛАЗА И КИБЕР-МАСКА НА ЧЕЛЮСТИ)
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(232, 195);
    ctx.quadraticCurveTo(230, 292, 266, 338);
    ctx.quadraticCurveTo(320, 382, 374, 338);
    ctx.quadraticCurveTo(410, 292, 408, 195);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#633c32';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(238, 240);
    ctx.quadraticCurveTo(255, 315, 320, 364);
    ctx.quadraticCurveTo(385, 315, 402, 240);
    ctx.stroke();

    // Светящийся бирюзовый кибер-имплант / шрам через переносицу и левую скулу!
    ctx.save();
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(252, 286);
    ctx.lineTo(298, 274);
    ctx.lineTo(342, 274);
    ctx.lineTo(386, 292);
    ctx.stroke();
    ctx.restore();

    // Уверенные самурайские брови
    ctx.strokeStyle = '#33415c';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(252, 226);
    ctx.lineTo(304, 236);
    ctx.moveTo(388, 226);
    ctx.lineTo(336, 236);
    ctx.stroke();

    // Острые янтарно-золотые аниме-глаза
    const drawSharpEye = (cx, cy) => {
      if (blink) {
        ctx.strokeStyle = '#1b263b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx - 21, cy + 2);
        ctx.lineTo(cx + 21, cy + 2);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20, 11.5, 0, 0, Math.PI * 2);
      ctx.fill();

      const irisGrad = ctx.createLinearGradient(cx, cy - 11, cx, cy + 11);
      irisGrad.addColorStop(0, '#d90429');
      irisGrad.addColorStop(1, '#ffbe0b');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 10.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0d090a';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 4.5, cy - 3, 3.4, 0, Math.PI * 2);
      ctx.arc(cx + 4.5, cy + 3.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#141b29';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 1);
      ctx.quadraticCurveTo(cx, cy - 13, cx + 22, cy - 1);
      ctx.stroke();
    };
    drawSharpEye(280, 254);
    drawSharpEye(360, 254);

    // Нос
    ctx.fillStyle = st.skinShadow;
    ctx.beginPath();
    ctx.moveTo(320, 264);
    ctx.lineTo(313, 294);
    ctx.lineTo(325, 295);
    ctx.closePath();
    ctx.fill();

    // Рот (ухмылка ронина или речь) + тактический кибер-респиратор на подбородке
    const my = 318;
    if (mouthFrame === 0) {
      ctx.strokeStyle = '#5c2c2c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(298, my + 2);
      ctx.quadraticCurveTo(320, my + 8, 344, my - 3);
      ctx.stroke();
    } else {
      const openH = 6 + mouthFrame * 4.2;
      ctx.fillStyle = '#4a1220';
      ctx.beginPath();
      ctx.ellipse(320, my + 2, 16, openH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(308, my - openH + 3, 24, 5);
    }

    // Нижняя кибер-челюсть / полумаска на подбородке со светящимися боковыми клапанами
    ctx.fillStyle = '#192030';
    ctx.beginPath();
    ctx.moveTo(268, 332);
    ctx.lineTo(292, 342);
    ctx.lineTo(348, 342);
    ctx.lineTo(372, 332);
    ctx.lineTo(352, 362);
    ctx.lineTo(320, 372);
    ctx.lineTo(288, 362);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ff2a55';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 6. ПЫШНАЯ ВЗЪЕРОШЕННАЯ ПРИЧЁСКА АНИМЕ-РОНИНА С ОСТРЫМИ ПРЯДЯМИ НА ЛБУ И ТЕМНОЙ КИБЕР-ПОВЯЗКОЙ
    // Кибер-бандана на лбу со светящимся красным диодом
    ctx.fillStyle = '#181d2b';
    ctx.beginPath();
    ctx.moveTo(228, 178);
    ctx.quadraticCurveTo(320, 164, 412, 178);
    ctx.lineTo(408, 212);
    ctx.quadraticCurveTo(320, 200, 232, 212);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = '#ff2a55';
    ctx.shadowColor = '#ff2a55';
    ctx.shadowBlur = 12;
    roundRectPath(ctx, 296, 182, 48, 16, 4);
    ctx.fill();
    ctx.restore();

    // Передние острые серебристо-пепельные пряди волос
    const hairGrad = ctx.createLinearGradient(200, 70, 440, 340);
    hairGrad.addColorStop(0, st.hairHighlight);
    hairGrad.addColorStop(0.5, st.hairMain);
    hairGrad.addColorStop(1, st.hairDark);
    ctx.fillStyle = hairGrad;

    ctx.beginPath();
    ctx.moveTo(192, 185);
    ctx.lineTo(162, 128);
    ctx.lineTo(225, 135);
    ctx.lineTo(218, 78);
    ctx.lineTo(282, 112);
    ctx.lineTo(322, 62);
    ctx.lineTo(362, 110);
    ctx.lineTo(426, 76);
    ctx.lineTo(418, 135);
    ctx.lineTo(478, 128);
    ctx.lineTo(446, 188);
    // Острые пряди чёлки поверх банданы
    ctx.lineTo(422, 275);
    ctx.lineTo(395, 202);
    ctx.lineTo(355, 245);
    ctx.lineTo(332, 195);
    ctx.lineTo(312, 252);
    ctx.lineTo(288, 196);
    ctx.lineTo(248, 242);
    ctx.lineTo(222, 205);
    ctx.lineTo(212, 282);
    ctx.closePath();
    ctx.fill();
  }

  // ===========================================================================
  // ПЕРСОНАЖ 3: НИКС — АНИМЕ-ХАКЕРША С ДВОЙНЫМИ ХВОСТАМИ, СВЕТЯЩИМИСЯ КОШАЧЬИМИ НАУШНИКАМИ И AR-МОНОКЛЕМ
  // ===========================================================================
  drawNyxHacker(ctx, st, blink, mouthFrame) {
    // 1. ДВА ДЛИННЫХ ДВУХЦВЕТНЫХ ХВОСТА ПО БОКАМ (ФИОЛЕТОВЫЙ -> МЯТНО-БИРЮЗОВЫЙ НЕОН)
    const tailGrad = ctx.createLinearGradient(120, 140, 520, 520);
    tailGrad.addColorStop(0, '#5a189a');
    tailGrad.addColorStop(0.45, '#9d4edd');
    tailGrad.addColorStop(1, '#00f5d4');
    ctx.fillStyle = tailGrad;

    // Левый хвост
    ctx.beginPath();
    ctx.moveTo(215, 150);
    ctx.bezierCurveTo(115, 180, 95, 360, 138, 515);
    ctx.bezierCurveTo(175, 455, 195, 320, 228, 225);
    ctx.closePath();
    ctx.fill();

    // Правый хвост
    ctx.beginPath();
    ctx.moveTo(425, 150);
    ctx.bezierCurveTo(525, 180, 545, 360, 502, 515);
    ctx.bezierCurveTo(465, 455, 445, 320, 412, 225);
    ctx.closePath();
    ctx.fill();

    // 2. СВЕТЯЩИЕСЯ КОШАЧЬИ КИБЕР-НАУШНИКИ НА МАКУШКЕ (NEKO-HEADSET!)
    const drawCatEar = (x0, y0, xTip, yTip, x1, y1) => {
      ctx.fillStyle = '#1b142e';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(xTip, yTip);
      ctx.lineTo(x1, y1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = '#ff2a85';
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo((x0 + xTip) * 0.5 + 6, (y0 + yTip) * 0.5 + 12);
      ctx.lineTo(xTip, yTip + 18);
      ctx.lineTo((x1 + xTip) * 0.5 - 6, (y1 + yTip) * 0.5 + 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawCatEar(202, 155, 178, 66, 268, 125);
    drawCatEar(438, 155, 462, 66, 372, 125);

    // 3. ТОРС, КИБЕР-ЧОКЕР И ХУДИ СО СВЕТЯЩИМСЯ ЭКВАЛАЙЗЕРОМ
    ctx.fillStyle = st.skin;
    ctx.fillRect(286, 330, 68, 95);
    // Чокер со светящимся кристаллом
    ctx.fillStyle = '#141024';
    ctx.fillRect(284, 376, 72, 14);
    ctx.fillStyle = '#00f5d4';
    ctx.beginPath();
    ctx.arc(320, 383, 7, 0, Math.PI * 2);
    ctx.fill();

    // Внутренний топ со светящимся эквалайзером
    ctx.fillStyle = '#120e24';
    ctx.fillRect(230, 415, 180, 340);
    const eqHeights = [36, 62, 48, 76, 42, 58, 32];
    eqHeights.forEach((h, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#00f5d4' : '#ff2a85';
      ctx.fillRect(264 + idx * 17, 545 - h, 11, h);
    });

    // Неоновый воротник и укороченная куртка нетраннера
    ctx.save();
    ctx.shadowColor = '#10f56c';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#10f56c';
    ctx.beginPath();
    ctx.moveTo(210, 345);
    ctx.lineTo(282, 348);
    ctx.lineTo(290, 432);
    ctx.lineTo(218, 422);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(430, 345);
    ctx.lineTo(358, 348);
    ctx.lineTo(350, 432);
    ctx.lineTo(422, 422);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Кибер-шорты/брюки нетраннера до самого низа (y = 800)
    ctx.fillStyle = '#110d20';
    ctx.fillRect(210, 710, 98, 90);
    ctx.fillRect(332, 710, 98, 90);

    ctx.fillStyle = st.jacketDark;
    ctx.beginPath();
    ctx.moveTo(222, 355);
    ctx.lineTo(284, 415);
    ctx.lineTo(272, 798);
    ctx.lineTo(148, 798);
    ctx.lineTo(158, 425);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(418, 355);
    ctx.lineTo(356, 415);
    ctx.lineTo(368, 798);
    ctx.lineTo(492, 798);
    ctx.lineTo(482, 425);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(264, 430);
    ctx.lineTo(246, 535);
    ctx.lineTo(258, 695);
    ctx.moveTo(376, 430);
    ctx.lineTo(394, 535);
    ctx.lineTo(382, 695);
    ctx.stroke();
    ctx.restore();

    // 4. ЛИЦО НИКС, СВЕТЯЩИЕСЯ LED-ВЕСНУШКИ, КЛЫЧОК И ГОЛОГРАФИЧЕСКИЙ AR-МОНОКЛЬ
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.moveTo(238, 200);
    ctx.quadraticCurveTo(236, 295, 270, 336);
    ctx.quadraticCurveTo(320, 376, 370, 336);
    ctx.quadraticCurveTo(404, 295, 402, 200);
    ctx.closePath();
    ctx.fill();

    // Светящиеся неоновые точки-импланты на щёчках
    ctx.fillStyle = '#00f5d4';
    [262, 274, 286, 354, 366, 378].forEach((fx, i) => {
      ctx.beginPath();
      ctx.arc(fx, 286 + (i % 2) * 5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Большие выразительные розово-фиолетовые аниме-глаза
    const drawNyxEye = (cx, cy) => {
      if (blink) {
        ctx.strokeStyle = '#241018';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 2);
        ctx.quadraticCurveTo(cx, cy + 12, cx + 20, cy + 2);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 19, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const irisGrad = ctx.createLinearGradient(cx, cy - 12, cx, cy + 12);
      irisGrad.addColorStop(0, '#7209b7');
      irisGrad.addColorStop(1, '#ff2a85');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 11.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12071c';
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 4.5, cy - 3.5, 3.8, 0, Math.PI * 2);
      ctx.arc(cx + 4.5, cy + 4.0, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1f0b14';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx - 21, cy + 1);
      ctx.quadraticCurveTo(cx, cy - 15, cx + 21, cy + 1);
      ctx.stroke();
    };
    drawNyxEye(282, 256);
    drawNyxEye(358, 256);

    // Носик
    ctx.fillStyle = st.skinShadow;
    ctx.beginPath();
    ctx.moveTo(319, 268);
    ctx.lineTo(314, 291);
    ctx.lineTo(324, 293);
    ctx.closePath();
    ctx.fill();

    // Улыбка с милым аниме-клычком (yaeba) или говорящий рот
    const my = 320;
    if (mouthFrame === 0) {
      ctx.fillStyle = '#9e1946';
      ctx.beginPath();
      ctx.moveTo(300, my - 2);
      ctx.quadraticCurveTo(320, my + 15, 340, my - 2);
      ctx.closePath();
      ctx.fill();
      // Острый белый клычок справа
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(327, my - 1);
      ctx.lineTo(335, my - 1);
      ctx.lineTo(331, my + 8);
      ctx.closePath();
      ctx.fill();
    } else {
      const openH = 7 + mouthFrame * 4.5;
      ctx.fillStyle = '#5e1428';
      ctx.beginPath();
      ctx.ellipse(320, my + 2, 16, openH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(308, my - openH + 3, 24, 5);
    }

    // Полупрозрачный голографический AR-монокль перед правым глазом
    ctx.save();
    ctx.fillStyle = 'rgba(0, 245, 212, 0.28)';
    ctx.strokeStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    roundRectPath(ctx, 330, 232, 62, 44, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Чёлка и пряди у лица
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(212, 165);
    ctx.bezierCurveTo(225, 88, 415, 88, 428, 165);
    ctx.lineTo(408, 225);
    ctx.lineTo(378, 185);
    ctx.lineTo(345, 225);
    ctx.lineTo(320, 182);
    ctx.lineTo(292, 225);
    ctx.lineTo(262, 185);
    ctx.lineTo(232, 225);
    ctx.closePath();
    ctx.fill();
  }

  // ===========================================================================
  // ПЕРСОНАЖ 4: АКАНЭ — ЭЛИТНЫЙ АГЕНТ КОРПОРАЦИИ «АРАСАКА»
  // (В строгом закрытом нео-кимоно пиджаке с золотым шитьём, высоким бордовым воротником, корсетом-оби,
  //  причёской «химэ-кат» с золотыми кибер-шпильками кандзаси и узкими золотыми кибер-очками!)
  // ===========================================================================
  drawAkaneCorpo(ctx, st, blink, mouthFrame) {
    // 1. ДЛИННЫЕ ПРЯМЫЕ ПЛАТИНОВО-АЛЫЕ ВОЛОСЫ И ВЫСОКИЙ ПУЧОК С ЗОЛОТЫМИ ШПИЛЬКАМИ КАНДЗАСИ
    ctx.fillStyle = '#3d0c1e';
    ctx.beginPath();
    ctx.moveTo(196, 170);
    ctx.lineTo(164, 485);
    ctx.lineTo(476, 485);
    ctx.lineTo(444, 170);
    ctx.closePath();
    ctx.fill();

    // Две скрещенные золотые кибер-шпильки кандзаси с рубиновыми светящимися наконечниками
    ctx.save();
    ctx.strokeStyle = '#ffbe0b';
    ctx.shadowColor = '#ffbe0b';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(155, 118);
    ctx.lineTo(285, 185);
    ctx.moveTo(162, 168);
    ctx.lineTo(290, 132);
    ctx.stroke();

    ctx.fillStyle = '#ff1654';
    ctx.shadowColor = '#ff1654';
    ctx.beginPath();
    ctx.arc(155, 118, 9, 0, Math.PI * 2);
    ctx.arc(162, 168, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Высокий узел волос на макушке с золотым кольцом-заколкой
    ctx.fillStyle = '#dce2ec';
    ctx.beginPath();
    ctx.arc(320, 96, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(284, 118);
    ctx.lineTo(356, 118);
    ctx.stroke();

    // 2. ШЕЯ С ЗОЛОТЫМИ ЛИНИЯМИ КИБЕР-ИМПЛАНТОВ
    ctx.fillStyle = st.skin;
    ctx.fillRect(288, 330, 64, 90);
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(298, 345);
    ctx.lineTo(298, 405);
    ctx.moveTo(342, 345);
    ctx.lineTo(342, 405);
    ctx.stroke();

    // 3. СТРОГАЯ ЗАКРЫТАЯ ШЁЛКОВАЯ ВОДОЛАЗКА И ЭЛЕГАНТНЫЙ НЕО-КИМОНО ПИДЖАК КОРПОРАЦИИ (ПОЛНОСТЬЮ ПЕРЕОДЕТА!)
    // Никакого голого живота — закрытый бордово-чёрный корпоративный мундир с золотым шитьём и поясом-оби!
    ctx.fillStyle = '#4a0a1d';
    ctx.beginPath();
    ctx.moveTo(245, 385);
    ctx.lineTo(395, 385);
    ctx.lineTo(385, 620);
    ctx.lineTo(255, 620);
    ctx.closePath();
    ctx.fill();

    // Высокий закрытый воротник-стойка с золотой корпоративной брошью
    ctx.fillStyle = '#2b0612';
    ctx.fillRect(284, 372, 72, 32);
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(284, 372, 72, 32);

    // Основной приталенный кибер-пиджак / кимоно со структурированными острыми плечами и юбкой-брюками до y = 800
    ctx.fillStyle = '#14101c';
    ctx.beginPath();
    ctx.moveTo(142, 412);
    ctx.lineTo(268, 368);
    ctx.lineTo(320, 520);
    ctx.lineTo(372, 368);
    ctx.lineTo(498, 412);
    ctx.lineTo(482, 595);
    ctx.lineTo(418, 615);
    ctx.lineTo(442, 800);
    ctx.lineTo(198, 800);
    ctx.lineTo(222, 615);
    ctx.lineTo(158, 595);
    ctx.closePath();
    ctx.fill();

    // Высокий жёсткий воротник-стойка корпоративного плаща с золотисто-алой внутренней подсветкой
    ctx.save();
    ctx.shadowColor = '#ffbe0b';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#800f2f';
    ctx.beginPath();
    ctx.moveTo(228, 328);
    ctx.lineTo(284, 348);
    ctx.lineTo(288, 415);
    ctx.lineTo(236, 398);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(412, 328);
    ctx.lineTo(356, 348);
    ctx.lineTo(352, 415);
    ctx.lineTo(404, 398);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Асимметричный запашной лацкан кимоно-пиджака с золотым и рубиновым неоновым кантом
    ctx.save();
    ctx.strokeStyle = '#ffbe0b';
    ctx.shadowColor = '#ffbe0b';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    // Запах лацканов крест-накрест
    ctx.moveTo(268, 372);
    ctx.lineTo(356, 565);
    ctx.moveTo(372, 372);
    ctx.lineTo(298, 495);
    // Золотые эполеты на острых плечах
    ctx.moveTo(148, 414);
    ctx.lineTo(248, 384);
    ctx.moveTo(492, 414);
    ctx.lineTo(392, 384);
    // Золотые геометрические линии на рукавах
    ctx.moveTo(182, 435);
    ctx.lineTo(196, 565);
    ctx.moveTo(458, 435);
    ctx.lineTo(444, 565);
    ctx.stroke();
    ctx.restore();

    // Широкий корсетный пояс-оби на талии с золотой кибер-пряжкой «Арасака»
    ctx.fillStyle = '#590d22';
    ctx.fillRect(216, 568, 208, 66);
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 4;
    ctx.strokeRect(216, 568, 208, 66);

    // Центральная золотая пряжка с тремя корпоративными ромбами
    ctx.save();
    ctx.fillStyle = '#ffbe0b';
    ctx.shadowColor = '#ffbe0b';
    ctx.shadowBlur = 10;
    for (const dx of [-24, 0, 24]) {
      ctx.beginPath();
      ctx.moveTo(320 + dx, 582);
      ctx.lineTo(331 + dx, 601);
      ctx.lineTo(320 + dx, 620);
      ctx.lineTo(309 + dx, 601);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 4. УТОНЧЁННОЕ АНИМЕ-ЛИЦО АКАНЭ (РУБИНОВЫЕ ГЛАЗА, РОДИНКА, АЛАЯ ПОМАДА И ЗОЛОТЫЕ ОЧКИ)
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.moveTo(238, 198);
    ctx.quadraticCurveTo(236, 294, 270, 336);
    ctx.quadraticCurveTo(320, 378, 370, 336);
    ctx.quadraticCurveTo(404, 294, 402, 198);
    ctx.closePath();
    ctx.fill();

    // Золотые линии кибер-имплантов на скулах
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(246, 278);
    ctx.lineTo(268, 290);
    ctx.lineTo(264, 314);
    ctx.moveTo(394, 278);
    ctx.lineTo(372, 290);
    ctx.lineTo(376, 314);
    ctx.stroke();

    // Тонкие изящные брови
    ctx.strokeStyle = '#3d0c1e';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(256, 228);
    ctx.quadraticCurveTo(280, 218, 304, 228);
    ctx.moveTo(384, 228);
    ctx.quadraticCurveTo(360, 218, 336, 228);
    ctx.stroke();

    // Рубиново-красные глаза с длинными ресницами
    const drawAkaneEye = (cx, cy) => {
      if (blink) {
        ctx.strokeStyle = '#240812';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 2);
        ctx.quadraticCurveTo(cx, cy + 10, cx + 20, cy + 2);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 19, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      const irisGrad = ctx.createLinearGradient(cx, cy - 11, cx, cy + 11);
      irisGrad.addColorStop(0, '#590d22');
      irisGrad.addColorStop(1, '#ff1654');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#120309';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 4.5, cy - 3.5, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + 4.5, cy + 3.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#1c050e';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx - 21, cy + 1);
      ctx.quadraticCurveTo(cx, cy - 14, cx + 22, cy - 2);
      ctx.stroke();
    };
    drawAkaneEye(282, 254);
    drawAkaneEye(358, 254);

    // Аристократичная родинка под левым глазом
    ctx.fillStyle = '#2b0914';
    ctx.beginPath();
    ctx.arc(372, 274, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Узкие футуристические кибер-очки в золотой оправе на переносице
    ctx.save();
    ctx.fillStyle = 'rgba(255, 22, 84, 0.22)';
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 2.8;
    // Левая линза
    ctx.beginPath();
    ctx.moveTo(252, 250);
    ctx.lineTo(310, 254);
    ctx.lineTo(304, 272);
    ctx.lineTo(256, 268);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Правая линза
    ctx.beginPath();
    ctx.moveTo(388, 250);
    ctx.lineTo(330, 254);
    ctx.lineTo(336, 272);
    ctx.lineTo(384, 268);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Переносица очков
    ctx.beginPath();
    ctx.moveTo(310, 256);
    ctx.lineTo(330, 256);
    ctx.stroke();
    ctx.restore();

    // Изящный носик
    ctx.fillStyle = st.skinShadow;
    ctx.beginPath();
    ctx.moveTo(320, 266);
    ctx.lineTo(314, 292);
    ctx.lineTo(324, 294);
    ctx.closePath();
    ctx.fill();

    // Алые губы (утончённая улыбка или артикуляция речи)
    const my = 320;
    if (mouthFrame === 0) {
      ctx.fillStyle = '#c9184a';
      ctx.beginPath();
      ctx.moveTo(304, my);
      ctx.quadraticCurveTo(320, my - 5, 336, my);
      ctx.quadraticCurveTo(320, my + 10, 304, my);
      ctx.closePath();
      ctx.fill();
    } else {
      const openH = 6 + mouthFrame * 4.2;
      ctx.fillStyle = '#590d22';
      ctx.beginPath();
      ctx.ellipse(320, my + 2, 15, openH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(309, my - openH + 3, 22, 4.5);
    }

    // 5. ПРИЧЁСКА «ХИМЭ-КАТ» (РОВНАЯ ГРАФИЧНАЯ ЧЁЛКА И ПРЯМЫЕ БОКОВЫЕ ПРЯДИ С АЛЫМ ВНУТРЕННИМ ОКРАШИВАНИЕМ)
    // Алые внутренние пряди у шеи
    ctx.fillStyle = '#e6194b';
    ctx.fillRect(216, 225, 22, 185);
    ctx.fillRect(402, 225, 22, 185);

    // Платиново-белые идеально ровные боковые локоны и прямая чёлка Химэ
    const himeGrad = ctx.createLinearGradient(200, 100, 440, 420);
    himeGrad.addColorStop(0, '#ffffff');
    himeGrad.addColorStop(0.55, '#dce2ec');
    himeGrad.addColorStop(1, '#8d99ae');
    ctx.fillStyle = himeGrad;

    // Левая прямая прядь Химэ
    ctx.fillRect(198, 155, 36, 265);
    // Правая прямая прядь Химэ
    ctx.fillRect(406, 155, 36, 265);

    // Верхняя шапка волос и идеально ровная чёлка до бровей (никакого визора!)
    ctx.beginPath();
    ctx.moveTo(198, 175);
    ctx.bezierCurveTo(210, 95, 430, 95, 442, 175);
    ctx.lineTo(436, 214);
    ctx.lineTo(204, 214);
    ctx.closePath();
    ctx.fill();

    // Тонкая золотая диадема-ободок в волосах
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(320, 175, 92, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  // ===========================================================================
  // ПЕРСОНАЖ 1: КИРА (РОЗОВОЛОСАЯ С ВИЗОРОМ СО СКРИНШОТА)
  // ===========================================================================
  drawKiraOrAkane(ctx, st, blink, mouthFrame) {
    // =========================================================================
    // 1. ЗАДНИЙ СЛОЙ ПЫШНЫХ АНИМЕ-ВОЛОС (КАРЕ ДО ПЛЕЧ С ПРЯДЯМИ)
    // =========================================================================
    ctx.fillStyle = st.hairDark;
    ctx.beginPath();
    ctx.moveTo(205, 190);
    ctx.bezierCurveTo(155, 240, 150, 350, 178, 415);
    ctx.lineTo(462, 415);
    ctx.bezierCurveTo(492, 345, 485, 240, 435, 190);
    ctx.closePath();
    ctx.fill();

    // =========================================================================
    // 2. ТОРС, ШЕЯ, КЛЮЧИЦЫ И КРОП-ТОП ПОД КУРТКОЙ
    // =========================================================================
    // Талия и живот
    const torsoGrad = ctx.createLinearGradient(250, 400, 390, 740);
    torsoGrad.addColorStop(0, st.skin);
    torsoGrad.addColorStop(1, st.skinShadow);
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.moveTo(235, 410);
    ctx.lineTo(405, 410);
    ctx.lineTo(395, 735);
    ctx.lineTo(245, 735);
    ctx.closePath();
    ctx.fill();

    // Шея и тень под подбородком
    ctx.fillStyle = st.skin;
    ctx.fillRect(286, 330, 68, 92);
    ctx.fillStyle = st.skinShadow;
    ctx.beginPath();
    ctx.moveTo(286, 338);
    ctx.quadraticCurveTo(320, 378, 354, 338);
    ctx.lineTo(354, 368);
    ctx.quadraticCurveTo(320, 396, 286, 368);
    ctx.closePath();
    ctx.fill();

    // Тёмный спортивный кибер-кроп-топ с ярким розовым неоновым кантом на груди
    ctx.fillStyle = '#181524';
    ctx.beginPath();
    ctx.moveTo(228, 435);
    ctx.lineTo(412, 435);
    ctx.lineTo(398, 650);
    ctx.lineTo(242, 650);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = st.neonTrace;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(265, 442);
    ctx.lineTo(320, 515);
    ctx.lineTo(375, 442);
    ctx.stroke();

    // Кибер-пояс на бедрах в самом низу
    ctx.fillStyle = '#141320';
    ctx.fillRect(232, 720, 176, 75);
    ctx.strokeStyle = st.neonTrace;
    ctx.lineWidth = 5;
    ctx.strokeRect(240, 728, 160, 26);

    // =========================================================================
    // 3. РУКИ В ПЕРЧАТКАХ БЕЗ ПАЛЬЦЕВ (ЛЕВАЯ РУКА ТЯНЕТСЯ К СТОЙКЕ КАК НА СКРИНШОТЕ)
    // =========================================================================
    ctx.strokeStyle = st.skin;
    ctx.lineWidth = 38;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(192, 575);
    ctx.lineTo(105, 745);
    ctx.stroke();

    // Кибер-перчатка на запястье
    ctx.strokeStyle = '#1b172b';
    ctx.lineWidth = 42;
    ctx.beginPath();
    ctx.moveTo(128, 700);
    ctx.lineTo(96, 760);
    ctx.stroke();
    ctx.strokeStyle = st.neonTrace;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(112, 694);
    ctx.lineTo(144, 712);
    ctx.stroke();

    // =========================================================================
    // 4. КИБЕРПАНК-КУРТКА С ВЫСОКИМ БИРЮЗОВЫМ ВОРОТНИКОМ И НЕОНОВЫМИ КОНТУРАМИ
    // =========================================================================
    // Внутренняя светящаяся бирюзовая подкладка высокого воротника (как на скриншоте!)
    ctx.save();
    ctx.shadowColor = st.collarGlow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = st.collarGlow;
    ctx.beginPath();
    ctx.moveTo(212, 345);
    ctx.lineTo(285, 345);
    ctx.lineTo(295, 435);
    ctx.lineTo(222, 425);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(428, 345);
    ctx.lineTo(355, 345);
    ctx.lineTo(345, 435);
    ctx.lineTo(418, 425);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Левая и правая половинки укороченной куртки + рукава
    ctx.fillStyle = st.jacketDark;
    ctx.beginPath();
    // Левая сторона куртки и рукав
    ctx.moveTo(225, 355);
    ctx.lineTo(288, 415);
    ctx.lineTo(278, 665);
    ctx.lineTo(198, 650);
    ctx.lineTo(154, 595);
    ctx.lineTo(162, 425);
    ctx.closePath();
    ctx.fill();

    // Правая сторона куртки и рукав
    ctx.beginPath();
    ctx.moveTo(415, 355);
    ctx.lineTo(352, 415);
    ctx.lineTo(368, 670);
    ctx.lineTo(452, 655);
    ctx.lineTo(525, 615);
    ctx.lineTo(505, 425);
    ctx.closePath();
    ctx.fill();

    // Чёрные ремешки-застёжки на шее/воротнике (как на скриншоте)
    ctx.fillStyle = '#151320';
    ctx.save();
    ctx.translate(325, 398);
    ctx.rotate(-0.28);
    ctx.fillRect(-38, -8, 76, 14);
    ctx.fillRect(-34, 12, 72, 14);
    ctx.fillStyle = '#bcc8d6';
    ctx.fillRect(-10, -8, 12, 14);
    ctx.fillRect(-6, 12, 12, 14);
    ctx.restore();

    // Светящиеся маджента-неоновые дорожки (circuit lines) по бортам и плечам куртки!
    ctx.save();
    ctx.shadowColor = st.neonTrace;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = st.neonTrace;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Левый лацкан и плечо
    ctx.beginPath();
    ctx.moveTo(268, 428);
    ctx.lineTo(246, 515);
    ctx.lineTo(262, 635);
    ctx.moveTo(175, 442);
    ctx.lineTo(228, 456);
    ctx.lineTo(212, 560);
    ctx.stroke();

    // Правый лацкан и плечо
    ctx.beginPath();
    ctx.moveTo(372, 428);
    ctx.lineTo(395, 520);
    ctx.lineTo(382, 642);
    ctx.moveTo(485, 440);
    ctx.lineTo(422, 460);
    ctx.lineTo(442, 575);
    ctx.stroke();

    // Круглые розовые неоновые индикаторы на правом плече/рукаве (как на скриншоте!)
    ctx.fillStyle = '#ff66cc';
    ctx.beginPath();
    ctx.arc(496, 515, 13, 0, Math.PI * 2);
    ctx.arc(506, 568, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Два круглых значка-бейджа на груди куртки (золотистый и голубой, как на скриншоте!)
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(402, 502, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#8ce8ff';
    ctx.beginPath();
    ctx.arc(424, 534, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // =========================================================================
    // 5. АНИМЕ-ЛИЦО (СКУЛЫ, РУМЯНЕЦ, КИБЕР-ШВЫ, ГЛАЗА С БЛИКАМИ И ГОВОРЯЩИЙ РОТ)
    // =========================================================================
    // Форма головы/лица
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.moveTo(236, 200);
    ctx.quadraticCurveTo(234, 295, 268, 336);
    ctx.quadraticCurveTo(320, 378, 372, 336);
    ctx.quadraticCurveTo(406, 295, 404, 200);
    ctx.closePath();
    ctx.fill();

    // Тонкий контур челюсти и подбородка
    ctx.strokeStyle = '#6e3f38';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(242, 245);
    ctx.quadraticCurveTo(256, 312, 320, 360);
    ctx.quadraticCurveTo(384, 312, 398, 245);
    ctx.stroke();

    // Мягкий румянец на щеках и кибер-имплант линии на скулах
    ctx.fillStyle = 'rgba(255, 105, 135, 0.24)';
    ctx.beginPath();
    ctx.ellipse(274, 286, 20, 10, -0.1, 0, Math.PI * 2);
    ctx.ellipse(366, 286, 20, 10, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(165, 95, 85, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(248, 282);
    ctx.lineTo(270, 294);
    ctx.moveTo(392, 282);
    ctx.lineTo(370, 294);
    ctx.stroke();

    // Брови
    ctx.strokeStyle = '#4a152b';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(258, 232);
    ctx.quadraticCurveTo(282, 222, 302, 230);
    ctx.moveTo(382, 232);
    ctx.quadraticCurveTo(358, 222, 338, 230);
    ctx.stroke();

    // ГЛАЗА (Аниме-глаза с ресницами и двойными бликами ИЛИ моргание)
    const drawAnimeEye = (cx, cy) => {
      if (blink) {
        ctx.strokeStyle = '#241018';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 2);
        ctx.quadraticCurveTo(cx, cy + 12, cx + 20, cy + 2);
        ctx.stroke();
        return;
      }
      // Белок глаза
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 19, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      // Радужка
      const irisGrad = ctx.createLinearGradient(cx, cy - 12, cx, cy + 12);
      irisGrad.addColorStop(0, '#2a1215');
      irisGrad.addColorStop(1, st.eyeIris);
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 11.5, 0, Math.PI * 2);
      ctx.fill();

      // Зрачок
      ctx.fillStyle = '#0f070a';
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Яркие белые аниме-блики в глазах
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 4.5, cy - 3.5, 3.8, 0, Math.PI * 2);
      ctx.arc(cx + 4.5, cy + 4.0, 2.0, 0, Math.PI * 2);
      ctx.fill();

      // Густая верхняя подводка ресниц
      ctx.strokeStyle = '#1f0b14';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx - 21, cy + 1);
      ctx.quadraticCurveTo(cx, cy - 15, cx + 21, cy + 1);
      ctx.stroke();
    };

    drawAnimeEye(282, 256);
    drawAnimeEye(358, 256);

    // Изящный аниме-носик с тенью и бликом на кончике
    ctx.fillStyle = st.skinShadow;
    ctx.beginPath();
    ctx.moveTo(319, 268);
    ctx.lineTo(313, 292);
    ctx.lineTo(324, 294);
    ctx.closePath();
    ctx.fill();

    // РОТ (анимируется синхронно с голосовой озвучкой заказа!)
    const my = 320;
    if (mouthFrame === 0) {
      // Приветливая полуулыбка (как на скриншоте, с белой полоской зубов)
      ctx.fillStyle = '#8f243e';
      ctx.beginPath();
      ctx.moveTo(302, my - 2);
      ctx.quadraticCurveTo(320, my + 14, 338, my - 2);
      ctx.quadraticCurveTo(320, my + 2, 302, my - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(306, my - 1);
      ctx.lineTo(334, my - 1);
      ctx.lineTo(330, my + 4);
      ctx.lineTo(310, my + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // Открытый говорящий рот (3 фазы артикуляции)
      const openH = 7 + mouthFrame * 4.5;
      ctx.fillStyle = '#5e1428';
      ctx.beginPath();
      ctx.ellipse(320, my + 2, 16, openH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Язык
      ctx.fillStyle = '#e05378';
      ctx.beginPath();
      ctx.ellipse(320, my + openH * 0.45, 11, openH * 0.45, 0, 0, Math.PI);
      ctx.fill();

      // Верхние зубы
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(308, my - openH + 3, 24, 5);
    }

    // Бирюзовая светящаяся серьга-подвеска
    ctx.fillStyle = st.collarGlow;
    ctx.beginPath();
    ctx.arc(398, 305, 5, 0, Math.PI * 2);
    ctx.fill();

    // =========================================================================
    // 6. ПЕРЕДНИЕ ПРЯДИ ВОЛОС И ЧЁЛКА, ОБРАМЛЯЮЩИЕ ЛИЦО
    // =========================================================================
    const hairGrad = ctx.createLinearGradient(200, 95, 440, 360);
    hairGrad.addColorStop(0, st.hairHighlight);
    hairGrad.addColorStop(0.35, st.hairMain);
    hairGrad.addColorStop(1, st.hairDark);
    ctx.fillStyle = hairGrad;

    // Левая длинная прядь у лица
    ctx.beginPath();
    ctx.moveTo(238, 155);
    ctx.bezierCurveTo(188, 210, 192, 320, 224, 378);
    ctx.bezierCurveTo(236, 330, 238, 265, 256, 210);
    ctx.closePath();
    ctx.fill();

    // Правая длинная прядь у лица
    ctx.beginPath();
    ctx.moveTo(402, 155);
    ctx.bezierCurveTo(454, 210, 448, 320, 412, 375);
    ctx.bezierCurveTo(402, 330, 400, 265, 384, 210);
    ctx.closePath();
    ctx.fill();

    // Макушка и стильная асимметричная чёлка над визором
    ctx.beginPath();
    ctx.moveTo(212, 165);
    ctx.bezierCurveTo(225, 88, 415, 88, 428, 165);
    ctx.bezierCurveTo(380, 195, 260, 195, 212, 165);
    ctx.closePath();
    ctx.fill();

    // Блик на волосах
    ctx.strokeStyle = 'rgba(255, 215, 238, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(320, 155, 68, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // =========================================================================
    // 7. ГОЛОГРАФИЧЕСКИЙ КИБЕР-ВИЗОР НА ЛБУ (КАК НА СКРИНШОТЕ!)
    // =========================================================================
    // Боковые крепления ремешка визора
    ctx.fillStyle = '#252136';
    roundRectPath(ctx, 210, 164, 26, 38, 6);
    ctx.fill();
    roundRectPath(ctx, 404, 164, 26, 38, 6);
    ctx.fill();

    // Переливающаяся перламутрово-розово-голубая линза визора
    const visorGrad = ctx.createLinearGradient(225, 145, 415, 212);
    visorGrad.addColorStop(0.0, st.visorGrad1);
    visorGrad.addColorStop(0.48, '#ffffff');
    visorGrad.addColorStop(1.0, st.visorGrad2);

    ctx.fillStyle = visorGrad;
    ctx.beginPath();
    ctx.moveTo(226, 160);
    ctx.quadraticCurveTo(320, 138, 414, 160);
    ctx.lineTo(410, 206);
    ctx.quadraticCurveTo(320, 194, 230, 206);
    ctx.closePath();
    ctx.fill();

    // Оправа визора и диагональный глянцевый блик стекла
    ctx.strokeStyle = '#332c47';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.moveTo(268, 154);
    ctx.lineTo(296, 151);
    ctx.lineTo(278, 198);
    ctx.lineTo(252, 200);
    ctx.closePath();
    ctx.fill();
  }
}
