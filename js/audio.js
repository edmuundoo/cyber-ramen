import { gameState } from './state.js?v=91';

class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.rainNode = null;
    this.rainGain = null;
    this.musicTimer = null;
    this.chordStep = 0;
    this.speechTimer = null;
    this.whistleNodes = null;
    this.whistleMode = null; // null | 'aldente' | 'overcooked'
  }

  ensureContext() {
    if (gameState.persistent.settings.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.syncAmbience();
    return this.ctx;
  }

  syncAmbience() {
    if (!this.ctx) return;
    const { muted, rainOn, musicOn } = gameState.persistent.settings;
    if (muted) {
      this.stopRain();
      this.stopMusic();
      this.stopKettleWhistle();
      return;
    }
    if (rainOn) this.startRain();
    else this.stopRain();

    if (musicOn) this.startMusic();
    else this.stopMusic();
  }

  startRain() {
    if (this.rainNode || !this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 0.16;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.08;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();

    this.rainNode = noise;
    this.rainGain = gain;
  }

  stopRain() {
    if (this.rainNode) {
      try {
        this.rainNode.stop();
        this.rainNode.disconnect();
      } catch {}
      this.rainNode = null;
      this.rainGain = null;
    }
  }

  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    // Lo-Fi Cyberpunk progression: Cm9 -> Fm9 -> Dm7b5 -> G7alt
    const chords = [
      [130.81, 155.56, 196.0, 233.08, 293.66],
      [174.61, 207.65, 261.63, 311.13, 392.0],
      [146.83, 174.61, 207.65, 261.63],
      [196.0, 246.94, 293.66, 349.23, 415.3]
    ];

    const playChord = () => {
      if (!this.ctx || gameState.persistent.settings.muted || !gameState.persistent.settings.musicOn) return;
      const now = this.ctx.currentTime;
      const notes = chords[this.chordStep % chords.length];
      this.chordStep++;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        // Мягкий виниловый detune для Lo-Fi атмосферы
        osc.detune.setValueAtTime((Math.random() - 0.5) * 12, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(620, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.018 / notes.length, now + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 3.5);
      });
    };

    playChord();
    this.musicTimer = setInterval(playChord, 3600);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  // Бульканье воды при опускании и варке лапши
  playBoilBubble() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.06;
      const baseFreq = 220 + Math.random() * 180;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, start);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.1, start + 0.09);

      gain.gain.setValueAtTime(0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.095);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    }
  }

  // Отсчитывающий звуковой таймер варки лапши (чёткое тиканье механического таймера)
  playTimerTick(progress = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 920 + Math.min(1, progress) * 280;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, now + 0.032);

    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // Непрерывный свист закипающего чайника с пробкой:
  // mode === 'aldente' -> мягкий мелодичный паровой свист готовности
  // mode === 'overcooked' -> пронзительный интенсивный свист бурлящего чайника!
  // mode === null -> выключает свист
  syncKettleWhistle(mode = null) {
    if (gameState.persistent.settings.muted || !mode) {
      this.stopKettleWhistle();
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.whistleNodes) {
      const now = ctx.currentTime;

      // 1. Паровой шум воздуха через свисток в крышке чайника
      const bufLen = ctx.sampleRate;
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const steamNoise = ctx.createBufferSource();
      steamNoise.buffer = noiseBuf;
      steamNoise.loop = true;

      const steamFilter = ctx.createBiquadFilter();
      steamFilter.type = 'bandpass';
      steamFilter.frequency.setValueAtTime(2400, now);
      steamFilter.Q.setValueAtTime(4.2, now);

      const steamGain = ctx.createGain();
      steamGain.gain.setValueAtTime(0.025, now);

      steamNoise.connect(steamFilter);
      steamFilter.connect(steamGain);
      steamGain.connect(ctx.destination);
      steamNoise.start(now);

      // 2. Два близких резонансных тона свистка чайника + вибрато LFO от бурления пара
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const toneGain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      lfo.type = 'sine';

      osc1.frequency.setValueAtTime(1650, now);
      osc2.frequency.setValueAtTime(1668, now);
      lfo.frequency.setValueAtTime(6.5, now);
      lfoGain.gain.setValueAtTime(18, now);

      toneGain.gain.setValueAtTime(0.001, now);
      toneGain.gain.linearRampToValueAtTime(0.055, now + 0.18);

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      osc1.connect(toneGain);
      osc2.connect(toneGain);
      toneGain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      lfo.start(now);

      this.whistleNodes = {
        steamNoise,
        steamFilter,
        steamGain,
        osc1,
        osc2,
        lfo,
        lfoGain,
        toneGain
      };
      this.whistleMode = null;
    }

    if (this.whistleMode !== mode) {
      this.whistleMode = mode;
      const now = ctx.currentTime;
      const n = this.whistleNodes;

      if (mode === 'aldente') {
        // Приятный паровой свист чайника при достижении Al Dente
        n.osc1.frequency.setTargetAtTime(1780, now, 0.12);
        n.osc2.frequency.setTargetAtTime(1798, now, 0.12);
        n.lfo.frequency.setTargetAtTime(7.0, now, 0.1);
        n.lfoGain.gain.setTargetAtTime(22, now, 0.1);
        n.toneGain.gain.setTargetAtTime(0.055, now, 0.1);
        n.steamFilter.frequency.setTargetAtTime(2400, now, 0.1);
        n.steamGain.gain.setTargetAtTime(0.026, now, 0.1);
      } else if (mode === 'overcooked') {
        // Сильный тревожный свист вовсю кипящего чайника, когда лапша переварилась!
        n.osc1.frequency.setTargetAtTime(2380, now, 0.08);
        n.osc2.frequency.setTargetAtTime(2418, now, 0.08);
        n.lfo.frequency.setTargetAtTime(14.5, now, 0.08);
        n.lfoGain.gain.setTargetAtTime(68, now, 0.08);
        n.toneGain.gain.setTargetAtTime(0.095, now, 0.08);
        n.steamFilter.frequency.setTargetAtTime(3200, now, 0.08);
        n.steamGain.gain.setTargetAtTime(0.052, now, 0.08);
      }
    }
  }

  stopKettleWhistle() {
    this.whistleMode = null;
    if (!this.whistleNodes) return;
    const n = this.whistleNodes;
    this.whistleNodes = null;
    try {
      n.steamNoise.stop();
      n.osc1.stop();
      n.osc2.stop();
      n.lfo.stop();
      n.steamGain.disconnect();
      n.toneGain.disconnect();
    } catch {}
  }

  // Таймер готовности Al Dente (звонкий двойной пинг)
  playAlDentePing() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.09;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.09, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  // Шкворчание соуса чили и бульона
  playSauceSizzle() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.45));
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2600;
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  // Звон монет / перевод кредитов
  playCoinChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1046.5, 1318.5, 1567.98].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.065;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  // Пневмо-пресс запайки термо-контейнера
  playSealerPress() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
    this.playSauceSizzle();
  }

  // Расслабляющая волна Неон-Кота Манэки-нэко
  playPacifierWave() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.56);
    });
  }

  // Короткий клик при добавлении топпинга
  playTapPop() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  // Звук штрафа / ошибки
  playPenaltyBuzz() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.setValueAtTime(98, now + 0.12);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  // Голосовая озвучка заказа посетителем (Web Speech API ru-RU + кибер-формантный синтезатор)
  speakCustomerOrder(text, customerId = 'student', onFinish = null) {
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }

    const cleanText = String(text || '').replace(/[«»"]/g, '').trim();
    gameState.runtime.customerTalking = true;

    let finished = false;
    const completeSpeech = () => {
      if (finished) return;
      finished = true;
      if (this.speechTimer) {
        clearTimeout(this.speechTimer);
        this.speechTimer = null;
      }
      gameState.runtime.customerTalking = false;
      if (typeof onFinish === 'function') {
        onFinish();
      }
    };

    const startedAt = performance.now();
    // Гарантированный таймер переключения камеры на крупный план миски и лотков
    const durationMs = Math.max(2900, Math.min(4600, cleanText.length * 64));
    this.speechTimer = setTimeout(completeSpeech, durationMs);

    if (gameState.persistent.settings.muted) {
      return;
    }

    // 1. Мягкие кибер-речевые слоги (Web Audio API) для эффекта голосовой рации / импланта
    const ctx = this.ensureContext();
    const voiceProfiles = {
      samurai: { baseFreq: 135, pitch: 0.82, rate: 1.02 },
      corpo: { baseFreq: 165, pitch: 0.94, rate: 1.06 },
      student: { baseFreq: 210, pitch: 1.06, rate: 1.08 },
      hacker: { baseFreq: 245, pitch: 1.15, rate: 1.12 },
      cybercat: { baseFreq: 290, pitch: 1.28, rate: 1.12 }
    };
    const prof = voiceProfiles[customerId] || voiceProfiles.student;

    if (ctx) {
      const now = ctx.currentTime;
      const syllables = Math.min(14, Math.max(6, Math.floor(cleanText.length / 4)));
      for (let i = 0; i < syllables; i++) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        const t = now + i * 0.14;
        const f = prof.baseFreq * (0.9 + ((i * 7) % 5) * 0.06);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 1.08, t + 0.09);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(950 + (i % 3) * 320, t);
        filter.Q.value = 2.2;

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.032, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      }
    }

    // 2. Полноценная русская речь через Web Speech API (speechSynthesis)
    if ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function') {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = 'ru-RU';
        utter.pitch = prof.pitch;
        utter.rate = prof.rate;
        utter.volume = 1.0;

        const voices = window.speechSynthesis.getVoices?.() || [];
        const ruVoice = voices.find((v) => /ru/i.test(v.lang));
        if (ruVoice) utter.voice = ruVoice;

        utter.onend = () => {
          if (performance.now() - startedAt >= 1800) {
            completeSpeech();
          }
        };
        utter.onerror = () => {};
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback таймер уже запущен выше
      }
    }
  }
}

export const audio = new CyberAudioEngine();
