/**
 * Original procedural audio built on the Web Audio API.
 *
 * There are no audio files to ship, license or fail to load. Music, ambience
 * and effects are synthesised at runtime, with separate buses for each so the
 * settings sliders are meaningful. Everything is optional: if the context
 * cannot start (autoplay policy, unsupported browser, muted device) the game
 * runs silently and never throws.
 */

const NOTE = (semitones, base = 220) => base * Math.pow(2, semitones / 12);

const MUSIC_SCENES = {
  meadow: {
    root: 220,
    wave: 'triangle',
    barLength: 4.2,
    chords: [
      [0, 7, 12, 16],
      [-3, 4, 9, 12],
      [-7, 0, 5, 9],
      [-5, 2, 7, 11],
    ],
    arp: [12, 16, 19, 16, 12, 9, 7, 9],
    arpRate: 0.52,
    padGain: 0.055,
    brightness: 1500,
    bass: true,
  },
  woods: {
    root: 174,
    wave: 'sine',
    barLength: 5.2,
    chords: [
      [0, 7, 10, 14],
      [-2, 5, 7, 12],
      [-5, 2, 7, 10],
      [-4, 3, 8, 12],
    ],
    arp: [12, 15, 19, 22, 19, 12],
    arpRate: 0.8,
    padGain: 0.05,
    brightness: 1100,
    bass: true,
  },
  ruins: {
    root: 146,
    wave: 'triangle',
    barLength: 5.6,
    chords: [
      [0, 3, 7, 10],
      [-2, 5, 8, 12],
      [-4, 3, 7, 10],
      [-5, 2, 7, 11],
    ],
    arp: [12, 15, 19, 15],
    arpRate: 0.95,
    padGain: 0.052,
    brightness: 900,
    bass: true,
  },
  archive: {
    root: 130,
    wave: 'sine',
    barLength: 6.4,
    chords: [
      [0, 5, 8, 12],
      [-3, 4, 9, 12],
      [-5, 2, 7, 10],
      [-7, 0, 5, 8],
    ],
    arp: [12, 17, 20, 24],
    arpRate: 1.15,
    padGain: 0.05,
    brightness: 700,
    bass: true,
  },
  observatory: {
    root: 196,
    wave: 'sine',
    barLength: 6,
    chords: [
      [0, 7, 12, 19],
      [-5, 2, 7, 14],
      [-3, 4, 9, 16],
      [-7, 0, 5, 12],
    ],
    arp: [19, 24, 26, 31, 26, 24],
    arpRate: 0.85,
    padGain: 0.05,
    brightness: 1800,
    bass: true,
  },
  library: {
    root: 110,
    wave: 'sine',
    barLength: 7,
    chords: [
      [0, 7, 10, 14],
      [-4, 3, 8, 12],
      [-5, 2, 7, 11],
      [-9, 0, 5, 9],
    ],
    arp: [12, 19, 24, 19],
    arpRate: 1.4,
    padGain: 0.058,
    brightness: 620,
    bass: true,
  },
  sanctuary: {
    root: 164.8,
    wave: 'sine',
    barLength: 6.8,
    chords: [
      [0, 7, 12, 16],
      [-2, 5, 10, 14],
      [-4, 3, 8, 12],
      [-5, 2, 7, 11],
    ],
    arp: [12, 16, 19, 24, 19, 16],
    arpRate: 0.7,
    padGain: 0.055,
    brightness: 2200,
    bass: true,
  },
  title: {
    root: 174.6,
    wave: 'triangle',
    barLength: 5.4,
    chords: [
      [0, 7, 12, 15],
      [-3, 4, 9, 12],
      [-5, 2, 7, 11],
      [-7, 0, 5, 10],
    ],
    arp: [12, 15, 19, 22, 19, 15],
    arpRate: 0.62,
    padGain: 0.05,
    brightness: 1300,
    bass: true,
  },
  reveal: {
    root: 220,
    wave: 'sine',
    barLength: 8,
    chords: [
      [0, 7, 12, 16, 19],
      [-3, 4, 9, 12, 16],
      [2, 7, 14, 19, 23],
      [0, 7, 12, 16, 24],
    ],
    arp: [12, 19, 24, 28],
    arpRate: 1.6,
    padGain: 0.065,
    brightness: 2400,
    bass: true,
  },
};

const AMBIENCE_SCENES = {
  meadow: { wind: 0.05, windFreq: 520, birds: true, water: true, drone: 0 },
  woods: { wind: 0.045, windFreq: 420, birds: true, water: false, drone: 0 },
  ruins: { wind: 0.032, windFreq: 360, birds: false, water: false, drone: 0.012 },
  archive: { wind: 0.008, windFreq: 220, birds: false, water: false, drone: 0.02 },
  observatory: { wind: 0.05, windFreq: 760, birds: false, water: false, drone: 0.014 },
  library: { wind: 0.006, windFreq: 180, birds: false, water: false, drone: 0.016 },
  sanctuary: { wind: 0.03, windFreq: 900, birds: false, water: false, drone: 0.02 },
  celestial: { wind: 0.022, windFreq: 1180, birds: false, water: false, drone: 0.026 },
  title: { wind: 0.055, windFreq: 560, birds: true, water: false, drone: 0 },
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.scene = { music: 'title', ambience: 'meadow' };
    this.musicScene = 'title';
    this.ambienceNodes = [];
    this._nextBarTime = 0;
    this._barIndex = 0;
    this._noiseBuffer = null;
    this._birdTimer = 3;
    this._dripTimer = 5;
    this._musicDuck = 1;
    this._prevScene = null;
    this._master = null;
    this._musicBus = null;
    this._ambienceBus = null;
    this._sfxBus = null;
    this._lastSfx = new Map();
  }

  async unlock() {
    if (this.ready) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});

      this._master = this.ctx.createGain();
      this._master.gain.value = 1;
      this._master.connect(this.ctx.destination);

      this._musicBus = this.ctx.createGain();
      this._ambienceBus = this.ctx.createGain();
      this._sfxBus = this.ctx.createGain();
      this._musicBus.connect(this._master);
      this._ambienceBus.connect(this._master);
      this._sfxBus.connect(this._master);

      this._noiseBuffer = this._createNoiseBuffer(2);
      this.ready = true;
      this.setVolumes(this.settings);
      this._startAmbience(this.scene.ambience);
      this._setMusic(this.scene.music);
      return true;
    } catch (err) {
      console.info('[Audio] unavailable, continuing silently', err);
      this.ready = false;
      return false;
    }
  }

  _createNoiseBuffer(seconds = 2) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  setVolumes(settings = this.settings) {
    this.settings = settings;
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const muted = settings.muted ? 0 : 1;
    const set = (node, value) => {
      if (!node) return;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(Math.max(0.0001, value * muted), now, 0.08);
    };
    set(this._musicBus, settings.music * 0.85);
    set(this._ambienceBus, settings.ambient * 0.75);
    set(this._sfxBus, settings.sfx * 0.9);
  }

  setScene({ music, ambience } = {}) {
    if (music) this.scene.music = music;
    if (ambience) this.scene.ambience = ambience;
    if (!this.ready) return;
    if (music && music !== this.musicScene) this._setMusic(music);
    this._startAmbience(this.scene.ambience);
  }

  setIntensity(level) {
    // Used by the library approach: pull the pad down a little.
    if (!this.ready) return;
    this._musicDuck = level === 'reverent' ? 0.62 : 1;
    this.setVolumes(this.settings);
    if (this._musicBus) {
      this._musicBus.gain.setTargetAtTime(
        Math.max(0.0001, this.settings.music * 0.85 * this._musicDuck * (this.settings.muted ? 0 : 1)),
        this.ctx.currentTime,
        1.2,
      );
    }
  }

  /* ---------------------------------------------------------------- */
  /* Music                                                             */
  /* ---------------------------------------------------------------- */

  _setMusic(sceneName) {
    this.musicScene = sceneName;
    this._barIndex = 0;
    this._nextBarTime = this.ctx.currentTime + 0.25;
  }

  _scheduleMusic() {
    if (!this.ready || !this.ctx) return;
    const config = MUSIC_SCENES[this.musicScene] || MUSIC_SCENES.meadow;
    const horizon = this.ctx.currentTime + 0.9;
    while (this._nextBarTime < horizon) {
      const chord = config.chords[this._barIndex % config.chords.length];
      const barStart = this._nextBarTime;
      this._playPad(config, chord, barStart, config.barLength * 0.95);
      if (config.bass) {
        this._playBass(config, chord[0] - 12, barStart, config.barLength * 0.8);
      }
      // Gentle arpeggio, thinned out for calmer scenes.
      const arpStep = config.arpRate;
      for (let i = 0; i < Math.floor(config.barLength / arpStep) - 1; i++) {
        const note = config.arp[(i + this._barIndex) % config.arp.length];
        this._playPluck(config, note, barStart + i * arpStep, 0.32);
      }
      this._nextBarTime += config.barLength;
      this._barIndex++;
    }
  }

  _playPad(config, chord, time, duration) {
    for (const semitone of chord) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = config.wave;
      osc.frequency.value = NOTE(semitone, config.root);
      osc.detune.value = (Math.random() - 0.5) * 6;
      filter.type = 'lowpass';
      filter.frequency.value = config.brightness;
      filter.Q.value = 0.4;

      const peak = config.padGain / chord.length;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peak, time + 1.2);
      gain.gain.setValueAtTime(peak, time + duration - 1.4);
      gain.gain.linearRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter).connect(gain).connect(this._musicBus);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    }
  }

  _playBass(config, semitone, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = NOTE(semitone, config.root);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.045, time + 0.8);
    gain.gain.linearRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this._musicBus);
    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  _playPluck(config, semitone, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = NOTE(semitone, config.root);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.026, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this._musicBus);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  /* ---------------------------------------------------------------- */
  /* Ambience                                                          */
  /* ---------------------------------------------------------------- */

  _startAmbience(name) {
    if (!this.ready || !this.ctx) return;
    if (this._ambienceName === name) return;
    this._ambienceName = name;
    this._stopAmbience();
    const config = AMBIENCE_SCENES[name] || AMBIENCE_SCENES.meadow;
    const now = this.ctx.currentTime;

    if (config.wind > 0 && this._noiseBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = this._noiseBuffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = config.windFreq;
      filter.Q.value = 0.7;
      const gain = this.ctx.createGain();
      gain.gain.value = config.wind;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.08 + Math.random() * 0.05;
      lfoGain.gain.value = config.wind * 0.55;
      lfo.connect(lfoGain).connect(gain.gain);
      source.connect(filter).connect(gain).connect(this._ambienceBus);
      source.start(now);
      lfo.start(now);
      this.ambienceNodes.push(source, lfo);
      this._windGain = gain;
      this._windFilter = filter;
    }

    if (config.drone > 0) {
      for (const [freq, amp] of [
        [48, config.drone],
        [73, config.drone * 0.6],
      ]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = amp;
        const tremolo = this.ctx.createOscillator();
        const tremoloGain = this.ctx.createGain();
        tremolo.frequency.value = 0.06 + Math.random() * 0.04;
        tremoloGain.gain.value = amp * 0.4;
        tremolo.connect(tremoloGain).connect(gain.gain);
        osc.connect(gain).connect(this._ambienceBus);
        osc.start(now);
        tremolo.start(now);
        this.ambienceNodes.push(osc, tremolo);
      }
    }
    this._birdTimer = 1.5;
    this._dripTimer = 3;
  }

  _stopAmbience() {
    for (const node of this.ambienceNodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.ambienceNodes = [];
  }

  _ambientEvents(dt) {
    const config = AMBIENCE_SCENES[this._ambienceName] || AMBIENCE_SCENES.meadow;
    if (config.birds) {
      this._birdTimer -= dt;
      if (this._birdTimer <= 0) {
        this._birdTimer = 2.5 + Math.random() * 6;
        this._chirp();
      }
    }
    if (this._ambienceName === 'archive' || this._ambienceName === 'library') {
      this._dripTimer -= dt;
      if (this._dripTimer <= 0) {
        this._dripTimer = 6 + Math.random() * 12;
        this._drip();
      }
    }
    if (this._windFilter) {
      const t = this.ctx.currentTime;
      this._windFilter.frequency.setTargetAtTime(
        (AMBIENCE_SCENES[this._ambienceName]?.windFreq || 500) * (1 + Math.sin(t * 0.13) * 0.18),
        t,
        0.6,
      );
    }
  }

  _chirp() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 1600 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.4), t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), t + 0.06);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.018, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(this._ambienceBus);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  _drip() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200 + Math.random() * 600, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.02, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain).connect(this._ambienceBus);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  /* ---------------------------------------------------------------- */
  /* Effects                                                           */
  /* ---------------------------------------------------------------- */

  play(name, options = {}) {
    if (!this.ready || !this.ctx) return;
    if (this.settings.muted) return;
    if (options.muted) return;

    // Throttle identical sounds that fire in the same instant.
    const nowMs = performance.now();
    const last = this._lastSfx.get(name) || 0;
    if (nowMs - last < 45) return;
    this._lastSfx.set(name, nowMs);

    try {
      switch (name) {
        case 'footstep':
          this._footstep(options.surface);
          break;
        case 'jump':
          this._tone({ freq: 320, to: 520, duration: 0.22, gain: 0.05, type: 'sine' });
          this._noise({ duration: 0.12, gain: 0.03, freq: 900 });
          break;
        case 'land':
          this._noise({ duration: 0.14, gain: 0.05, freq: 320 });
          break;
        case 'interact':
          this._chime([880, 1320], 0.18, 0.035);
          break;
        case 'hover':
          this._tone({ freq: 1320, duration: 0.06, gain: 0.012, type: 'sine' });
          break;
        case 'dialogue':
          this._tone({ freq: 520, duration: 0.1, gain: 0.012, type: 'sine' });
          break;
        case 'dialogueAdvance':
          this._tone({ freq: 660, duration: 0.06, gain: 0.01, type: 'sine' });
          break;
        case 'item':
        case 'fragment':
          this._chime([523, 659, 784], 0.5, 0.04);
          break;
        case 'chest':
          this._sweep({ from: 180, to: 520, duration: 0.5, gain: 0.05, type: 'sawtooth' });
          this._chime([659, 988], 0.45, 0.03, 0.12);
          break;
        case 'mechanism':
          this._chime([440, 880, 1100], 0.4, 0.03);
          this._noise({ duration: 0.2, gain: 0.03, freq: 1400 });
          break;
        case 'unlock':
          this._chime([392, 523, 659, 784], 0.9, 0.045);
          this._sweep({ from: 120, to: 300, duration: 0.7, gain: 0.04, type: 'sine' });
          break;
        case 'locked':
          this._tone({ freq: 160, to: 110, duration: 0.22, gain: 0.045, type: 'triangle' });
          this._noise({ duration: 0.1, gain: 0.02, freq: 240 });
          break;
        case 'puzzleFail':
          this._chime([330, 311], 0.35, 0.035);
          this._tone({ freq: 140, duration: 0.3, gain: 0.035, type: 'triangle' });
          break;
        case 'page':
        case 'bookClose':
          this._noise({ duration: 0.22, gain: 0.042, freq: 2600 });
          break;
        case 'bookOpen':
          this._noise({ duration: 0.3, gain: 0.035, freq: 1800 });
          this._tone({ freq: 140, duration: 0.6, gain: 0.03, type: 'sine' });
          break;
        case 'seal':
          this._chime([1046, 1318, 1568, 2093], 1.2, 0.035);
          break;
        case 'reveal':
          this._revealSwell();
          break;
        case 'wish':
          // The wish gathering: a rising thread of air, then a distant bell.
          this._sweep({ from: 220, to: 880, duration: 1.5, gain: 0.035, type: 'sine' });
          this._chime([1318, 1760], 0.7, 0.02, 0.35);
          break;
        case 'wishBurst':
          this._noise({ duration: 0.35, gain: 0.045, freq: 3200 });
          this._chime([784, 1046, 1318, 1568], 1.4, 0.038);
          break;
        case 'chapter':
          this._chime([261.6, 392, 523.2], 1.6, 0.04);
          break;
        case 'open':
          this._tone({ freq: 520, duration: 0.09, gain: 0.02, type: 'sine' });
          break;
        case 'close':
          this._tone({ freq: 380, duration: 0.09, gain: 0.015, type: 'sine' });
          break;
        case 'toggle':
          this._tone({ freq: 720, duration: 0.1, gain: 0.02, type: 'sine' });
          break;
        default:
          break;
      }
    } catch (err) {
      console.debug('[Audio] sfx failed', name, err);
    }
  }

  _footstep(surface = 'grass') {
    const configs = {
      grass: { freq: 700, gain: 0.022, duration: 0.1 },
      stone: { freq: 1500, gain: 0.03, duration: 0.08 },
      wood: { freq: 900, gain: 0.026, duration: 0.09 },
      water: { freq: 1200, gain: 0.03, duration: 0.16 },
    };
    const config = configs[surface] || configs.grass;
    this._noise(config);
  }

  _tone({ freq = 440, to = null, duration = 0.2, gain = 0.03, type = 'sine', delay = 0 }) {
    if (!this.ready) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this._sfxBus);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  _sweep({ from = 200, to = 600, duration = 0.4, gain = 0.03, type = 'sine', delay = 0 }) {
    this._tone({ freq: from, to, duration, gain, type, delay });
  }

  _chime(freqs, duration = 0.4, gain = 0.03, spacing = 0.055) {
    freqs.forEach((freq, i) => {
      this._tone({ freq, duration, gain, type: 'sine', delay: i * spacing });
    });
  }

  _noise({ duration = 0.12, gain = 0.02, freq = 800, delay = 0 }) {
    if (!this.ready || !this._noiseBuffer) return;
    const now = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(g).connect(this._sfxBus);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  _revealSwell() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    // A slow, warm chord that signals the emotional turn without any audio file.
    const chord = [0, 7, 12, 16, 19, 24];
    chord.forEach((semi, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = i > 3 ? 'sine' : 'triangle';
      osc.frequency.value = NOTE(semi, 220);
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      gain.gain.setValueAtTime(0.0001, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.07 / chord.length, now + 1.6 + i * 0.08);
      gain.gain.setValueAtTime(0.07 / chord.length, now + 4.4);
      gain.gain.linearRampToValueAtTime(0.0001, now + 7.5);
      osc.connect(filter).connect(gain).connect(this._sfxBus);
      osc.start(now + i * 0.08);
      osc.stop(now + 7.8);
    });
  }

  update(dt) {
    if (!this.ready) return;
    this._scheduleMusic();
    this._ambientEvents(dt);
  }

  dispose() {
    this._stopAmbience();
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ready = false;
  }
}
