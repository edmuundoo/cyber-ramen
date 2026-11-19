import { gameState } from './state.js';

export class StreetRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.raindrops = [];
    this.drones = [];
    this.steamParticles = [];
    this.coinParticles = [];
    this.time = 0;

    this.initEntities();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(180, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width || 360;
    this.height = rect.height || 220;
  }

  initEntities() {
    for (let i = 0; i < 65; i++) {
      this.raindrops.push({
        x: Math.random() * 450,
        y: Math.random() * 260,
        len: 10 + Math.random() * 14,
        speed: 240 + Math.random() * 140
      });
    }
    for (let i = 0; i < 3; i++) {
      this.drones.push({
        x: Math.random() * 420,
        y: 35 + i * 28,
        speed: (i % 2 === 0 ? 1 : -1) * (24 + i * 12),
        color: i % 2 === 0 ? '#00f5d4' : '#ff2a85'
      });
    }
    for (let i = 0; i < 16; i++) {
      this.steamParticles.push({
        x: 40 + Math.random() * 320,
        y: 160 + Math.random() * 60,
        r: 6 + Math.random() * 12,
        vy: 14 + Math.random() * 16,
        alpha: 0.1 + Math.random() * 0.2
      });
    }
  }

  spawnCoins(count = 8, text = '+¥') {
    const cx = this.width * 0.35;
    const cy = this.height * 0.65;
    for (let i = 0; i < count; i++) {
      this.coinParticles.push({
        x: cx + (Math.random() - 0.5) * 50,
        y: cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 70,
        vy: -55 - Math.random() * 55,
        life: 1.0,
        label: i === 0 ? text : '¥'
      });
    }
  }

  updateAndDraw(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!ctx || !w || !h) return;

    const district = gameState.getCurrentDistrict();
    const tier = district.tier;
    const hasNeonSign = gameState.hasUpgrade('neon_sign');

    // 1. Ночное небо по тиру района
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (tier === 1) {
      skyGrad.addColorStop(0, '#090612');
      skyGrad.addColorStop(1, '#1c1124');
    } else if (tier === 2) {
      skyGrad.addColorStop(0, '#100726');
      skyGrad.addColorStop(1, '#2a0f45');
    } else {
      skyGrad.addColorStop(0, '#041424');
      skyGrad.addColorStop(1, '#0d2e47');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Силуэты зданий и неоновые вывески
    this.drawCityscape(ctx, w, h, tier, hasNeonSign);

    // 3. Пролетающие дроны на заднем плане
    for (const d of this.drones) {
      d.x += d.speed * dt;
      if (d.speed > 0 && d.x > w + 30) d.x = -30;
      if (d.speed < 0 && d.x < -30) d.x = w + 30;

      ctx.save();
      ctx.fillStyle = '#141824';
      ctx.fillRect(d.x - 10, d.y - 3, 20, 6);
      ctx.fillStyle = d.color;
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(d.x + (d.speed > 0 ? 9 : -9), d.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Анимация дождя
    ctx.strokeStyle = tier === 3 ? 'rgba(0, 245, 212, 0.28)' : 'rgba(180, 210, 255, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const r of this.raindrops) {
      r.y += r.speed * dt;
      r.x -= r.speed * 0.18 * dt;
      if (r.y > h) {
        r.y = -15;
        r.x = Math.random() * (w + 60);
      }
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 3, r.y + r.len);
    }
    ctx.stroke();

    // 5. Пар от кастрюль у нижней кромки окна
    for (const s of this.steamParticles) {
      s.y -= s.vy * dt;
      s.x += Math.sin(this.time * 2 + s.y * 0.05) * 8 * dt;
      if (s.y < h * 0.35) {
        s.y = h + 10;
        s.x = 20 + Math.random() * (w - 40);
      }
      ctx.fillStyle = `rgba(235, 245, 255, ${s.alpha * (s.y / h)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Частицы монет / кредитов при подаче заказа
    for (let i = this.coinParticles.length - 1; i >= 0; i--) {
      const p = this.coinParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      p.life -= dt * 0.95;
      if (p.life <= 0) {
        this.coinParticles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = 'bold 13px "SF Mono", monospace';
      ctx.fillStyle = '#10f56c';
      ctx.shadowColor = '#10f56c';
      ctx.shadowBlur = 8;
      ctx.fillText(p.label, p.x, p.y);
      ctx.restore();
    }

    // 7. Эффект тусклой мигающей лампочки на старте (Tier 1) или голографической рамки (Tier 3)
    if (tier === 1 && !hasNeonSign) {
      const flicker = 0.88 + Math.sin(this.time * 19) * 0.05 + (Math.random() > 0.97 ? -0.18 : 0);
      const bulbGrad = ctx.createRadialGradient(w * 0.5, 18, 4, w * 0.5, 40, w * 0.7);
      bulbGrad.addColorStop(0, `rgba(255, 175, 75, ${0.22 * flicker})`);
      bulbGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = bulbGrad;
      ctx.fillRect(0, 0, w, h);
    } else if (hasNeonSign) {
      ctx.save();
      ctx.strokeStyle = tier === 3 ? 'rgba(0, 245, 212, 0.45)' : 'rgba(255, 42, 133, 0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.restore();
    }
  }

  drawCityscape(ctx, w, h, tier, hasNeonSign) {
    // Дальние башни
    const buildings = [
      { x: 0.02, w: 0.16, h: 0.68 },
      { x: 0.2, w: 0.18, h: 0.82 },
      { x: 0.4, w: 0.22, h: 0.74 },
      { x: 0.64, w: 0.16, h: 0.86 },
      { x: 0.82, w: 0.18, h: 0.72 }
    ];

    buildings.forEach((b, idx) => {
      const bx = b.x * w;
      const bw = b.w * w;
      const bh = b.h * h;
      const by = h - bh;

      ctx.fillStyle = tier === 1 ? '#120c1c' : tier === 2 ? '#160d29' : '#081b2b';
      ctx.fillRect(bx, by, bw, bh);

      // Светящиеся окна
      const winColor =
        tier === 1
          ? 'rgba(255, 170, 70, 0.32)'
          : idx % 2 === 0
            ? 'rgba(0, 245, 212, 0.38)'
            : 'rgba(255, 42, 133, 0.38)';
      ctx.fillStyle = winColor;
      for (let wy = by + 12; wy < h - 25; wy += 14) {
        for (let wx = bx + 6; wx < bx + bw - 8; wx += 11) {
          if ((wx + wy + idx) % 3 !== 0) {
            ctx.fillRect(wx, wy, 5, 7);
          }
        }
      }
    });

    // Неоновые вывески на зданиях
    ctx.save();
    const signPulse = 0.8 + 0.2 * Math.sin(this.time * 4);
    if (tier >= 2 || hasNeonSign) {
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 10 * signPulse;
      ctx.strokeStyle = '#ff2a85';
      ctx.strokeRect(w * 0.66, h * 0.22, 46, 20);
      ctx.fillStyle = '#ff2a85';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('RAMEN', w * 0.66 + 5, h * 0.22 + 14);
    }
    if (tier === 3) {
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 14 * signPulse;
      ctx.strokeStyle = '#00f5d4';
      ctx.strokeRect(w * 0.21, h * 0.16, 64, 22);
      ctx.fillStyle = '#00f5d4';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('CORP PLAZA', w * 0.21 + 4, h * 0.16 + 14);
    }
    ctx.restore();
  }
}

// Генерация живого SVG-портрета посетителя (дыхание, моргание, постукивание пальцами)
export function buildCustomerPortraitSVG(customer, patiencePct = 100) {
  if (!customer) return '';
  const { palette, id } = customer;
  const isImpatient = patiencePct < 42;
  const mouthPath =
    patiencePct > 65
      ? 'M 44 68 Q 50 73 56 68'
      : patiencePct > 35
        ? 'M 44 70 L 56 70'
        : 'M 44 73 Q 50 67 56 73';

  const catEars =
    id === 'cybercat'
      ? `<polygon points="26,32 34,12 44,28" fill="${palette.hair}" stroke="#00f5d4" stroke-width="1.5"/>
         <polygon points="74,32 66,12 56,28" fill="${palette.hair}" stroke="#00f5d4" stroke-width="1.5"/>`
      : '';

  const fingerTapAnim = isImpatient
    ? `<g class="impatient-hand">
         <rect x="66" y="96" width="22" height="8" rx="4" fill="${palette.skin}" stroke="#ff385c" stroke-width="1.5">
           <animateTransform attributeName="transform" type="translate" values="0,0; 0,-5; 0,0" dur="0.32s" repeatCount="indefinite"/>
         </rect>
       </g>`
    : '';

  return `
    <svg viewBox="0 0 100 110" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0; 0,2.5; 0,0" dur="2.4s" repeatCount="indefinite"/>
        <!-- Куртка с неоновым воротником -->
        <path d="M 16 108 C 18 80, 82 80, 84 108 Z" fill="${palette.coat}" stroke="${palette.visor}" stroke-width="2"/>
        <path d="M 28 84 L 38 106 M 72 84 L 62 106" stroke="${palette.visor}" stroke-width="2" opacity="0.7"/>
        ${catEars}
        <!-- Голова -->
        <rect x="30" y="28" width="40" height="48" rx="14" fill="${palette.skin}"/>
        <!-- Прическа / шлем -->
        <path d="M 28 42 C 28 20, 72 20, 72 42 C 62 33, 38 33, 28 42 Z" fill="${palette.hair}"/>
        <!-- Кибер-визор и моргающие глаза -->
        <rect x="33" y="45" width="34" height="11" rx="4" fill="#0b0716" stroke="${palette.visor}" stroke-width="1.8"/>
        <circle cx="42" cy="50.5" r="2.8" fill="${palette.visor}">
          <animate attributeName="r" values="2.8;2.8;0.4;2.8" keyTimes="0;0.92;0.96;1" dur="3.4s" repeatCount="indefinite"/>
        </circle>
        <circle cx="58" cy="50.5" r="2.8" fill="${palette.visor}">
          <animate attributeName="r" values="2.8;2.8;0.4;2.8" keyTimes="0;0.92;0.96;1" dur="3.4s" repeatCount="indefinite"/>
        </circle>
        <!-- Кибер-имплант на щеке -->
        <line x1="33" y1="61" x2="41" y2="63" stroke="${palette.visor}" stroke-width="1.4"/>
        <!-- Рот -->
        <path d="${mouthPath}" fill="none" stroke="#1b0d24" stroke-width="2.4" stroke-linecap="round"/>
        ${fingerTapAnim}
      </g>
    </svg>
  `;
}

export function buildCourierDroneSVG() {
  return `
    <svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="16" width="28" height="16" rx="6" fill="#122334" stroke="#00f5d4" stroke-width="2"/>
      <circle cx="24" cy="24" r="4.5" fill="#ff2a85"/>
      <line x1="4" y1="12" x2="18" y2="12" stroke="#00f5d4" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="30" y1="12" x2="44" y2="12" stroke="#00f5d4" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;
}

// Генерация PNG-иконки для iOS Home Screen через скрытый Canvas
export function generateAppleTouchIcon() {
  try {
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 180;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const g = ctx.createLinearGradient(0, 0, 180, 180);
    g.addColorStop(0, '#0f0820');
    g.addColorStop(1, '#07222c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 180, 180);

    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 160, 160);

    // Миска рамена
    ctx.fillStyle = '#ff2a85';
    ctx.beginPath();
    ctx.arc(90, 102, 52, 0, Math.PI, false);
    ctx.fill();

    // Лапша
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(46, 94, 88, 10);

    // Палочки
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(35, 58);
    ctx.lineTo(145, 76);
    ctx.stroke();

    const link = document.getElementById('apple-touch-icon');
    if (link) link.href = c.toDataURL('image/png');
  } catch {
    // Оставляем SVG fallback
  }
}
