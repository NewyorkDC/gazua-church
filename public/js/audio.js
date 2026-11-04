/**
 * BGM — 음원 파일 없이 브라우저가 WebAudio 로 **그 자리에서 합성**한다.
 * 버튼을 누르면 바로 만들어져 나오고, 끊기지 않고 계속 돈다.
 *
 *   1 hymn    'Amazing Grace' (New Britain, 1835 · 퍼블릭 도메인) 파이프오르간
 *   2 dies    'Dies irae' — 베르디 레퀴엠(1874, 퍼블릭 도메인) 풍 g단조.
 *             내리치는 화음 + 대북 + 쏟아지는 하강 음계 + 같은 음을 두들기는 합창
 *   3 toccata 바흐 토카타 BWV 565(퍼블릭 도메인) 도입부를 본뜬 d단조 오르간
 *   4 fanfare 상승장 팡파르 — D장조 자작곡
 *
 * 2·3번은 성부를 음 단위로 옮긴 전사가 아니라 같은 어법으로 쓴 편곡이다.
 * public/audio/<이름>.mp3 를 넣어 두면 합성 대신 그 파일을 재생한다.
 */

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const TRACKS = [
  { key: 'hymn', no: 1, label: '찬송가', icon: '🕊', file: 'hymn' },
  { key: 'dies', no: 2, label: '진노의 날', icon: '🔥', file: 'dies-irae' },
  { key: 'toccata', no: 3, label: '토카타', icon: '🎹', file: 'toccata' },
  { key: 'fanfare', no: 4, label: '상승장 팡파르', icon: '🎺', file: 'fanfare' },
];

/* ─────────────────────────────── 1. Amazing Grace (3/4) */

const HYMN_BPM = 68;
const G4 = 67, A4 = 69, B4 = 71, D4 = 62, E4 = 64, D5 = 74;

const HYMN_MELODY = [
  [D4, 1],
  [G4, 1.5], [B4, 0.5], [G4, 1],
  [B4, 2], [A4, 1],
  [G4, 2], [E4, 1],
  [D4, 2], [D4, 1],
  [G4, 1.5], [B4, 0.5], [G4, 1],
  [B4, 2], [A4, 1],
  [D5, 3],
  [D5, 2], [D5, 1],
  [B4, 1.5], [D5, 0.5], [B4, 1],
  [D5, 2], [B4, 1],
  [A4, 2], [G4, 1],
  [D4, 2], [D4, 1],
  [G4, 1.5], [B4, 0.5], [G4, 1],
  [B4, 2], [A4, 1],
  [G4, 3],
  [G4, 2], [D4, 1],
];

const HYMN_CHORDS = [
  [55, 59, 62], [55, 59, 62], [48, 52, 55], [50, 54, 57],
  [55, 59, 62], [55, 59, 62], [50, 54, 57], [50, 54, 57],
  [55, 59, 62], [55, 59, 62], [48, 52, 55], [50, 54, 57],
  [55, 59, 62], [48, 52, 55], [50, 54, 57], [55, 59, 62],
];

/* ─────────────────────────────── 2. Dies irae (베르디풍, g단조) */

const DIES_BPM = 160;
const Gm = [43, 55, 58, 62, 67];
const Cm = [36, 48, 51, 55, 60];
const Eb = [39, 51, 55, 58, 63];
const D7 = [38, 50, 54, 57, 60];
const Gm6 = [43, 55, 58, 64, 67];
const RUN_HI = [79, 77, 75, 74, 72, 70, 69, 67];
const RUN_MID = [74, 72, 70, 69, 67, 65, 63, 62];

const DIES_BARS = [
  { ch: Gm, blast: [0, 2], run: [0.5, 2.5], hi: true, g: 1.25 },
  { ch: Gm, blast: [0, 2], run: [0.5, 2.5], hi: true, g: 1.25 },
  { ch: Eb, blast: [0, 2], run: [0.5, 2.5], hi: false, g: 1.3 },
  { ch: D7, blast: [0, 1, 2, 3], g: 1.35 },

  { ch: Gm, blast: [0], drive: true, g: 1.0,
    choir: [[74, 0, 0.5], [74, 0.5, 0.5], [74, 1, 0.5], [70, 1.5, 0.5], [74, 2, 0.5], [74, 2.5, 0.5], [74, 3, 1]] },
  { ch: Gm, blast: [0], drive: true, g: 1.0,
    choir: [[74, 0, 0.5], [74, 0.5, 0.5], [72, 1, 0.5], [70, 1.5, 0.5], [67, 2, 2]] },
  { ch: Cm, blast: [0], drive: true, g: 1.05,
    choir: [[75, 0, 0.5], [75, 0.5, 0.5], [75, 1, 0.5], [72, 1.5, 0.5], [75, 2, 0.5], [75, 2.5, 0.5], [75, 3, 1]] },
  { ch: D7, blast: [0, 2], drive: true, g: 1.1,
    choir: [[74, 0, 1], [73, 1, 1], [72, 2, 2]] },

  { ch: Gm, drive: true, g: 1.05, choir: [[74, 0, 1], [73, 1, 1], [72, 2, 1], [71, 3, 1]] },
  { ch: Gm6, drive: true, g: 1.1, choir: [[70, 0, 1], [69, 1, 1], [68, 2, 1], [67, 3, 1]] },
  { ch: Cm, drive: true, blast: [0], g: 1.15, choir: [[75, 0, 1], [74, 1, 1], [72, 2, 2]] },
  { ch: D7, drive: true, blast: [0, 2], g: 1.2, choir: [[70, 0, 1], [69, 1, 1], [66, 2, 2]] },

  { ch: Gm, blast: [0, 1, 2, 3], run: [0.5, 1.5, 2.5, 3.5], hi: true, g: 1.35 },
  { ch: Eb, blast: [0, 1, 2, 3], run: [0.5, 1.5, 2.5, 3.5], hi: false, g: 1.35 },
  { ch: D7, blast: [0, 2], run: [0.5, 2.5], hi: true, g: 1.4 },
  { ch: Gm, blast: [0], hold: true, g: 1.4 },
];

/* ─────────────────────────────── 3. 토카타 (d단조, 자유 리듬) */

const TOC_BEAT = 0.33;
/** [음들, 시작박, 길이, 세기] */
const TOCCATA = [
  [[81], 0, 0.42, 0.16], [[79], 0.42, 0.42, 0.16], [[81], 0.84, 2.1, 0.18],
  [[79], 3.1, 0.36, 0.14], [[77], 3.46, 0.36, 0.14], [[76], 3.82, 0.36, 0.14],
  [[74], 4.18, 0.36, 0.14], [[73], 4.54, 0.36, 0.14], [[71], 4.9, 0.36, 0.14],
  [[69], 5.26, 3.2, 0.2],

  [[69], 9.0, 0.42, 0.15], [[67], 9.42, 0.42, 0.15], [[69], 9.84, 1.9, 0.17],
  [[67], 11.9, 0.34, 0.13], [[65], 12.24, 0.34, 0.13], [[64], 12.58, 0.34, 0.13],
  [[62], 12.92, 0.34, 0.13], [[61], 13.26, 0.34, 0.13], [[59], 13.6, 0.34, 0.13],
  [[57], 13.94, 3.0, 0.19],

  // 감7화음 — 그 유명한 긴장
  [[61, 64, 67, 70], 17.6, 4.2, 0.13],
  // d단조 전체화음 + 페달
  [[38, 50, 53, 57, 62, 65], 22.4, 7.0, 0.12],
];
const TOC_LEN = 30.5;

/* ─────────────────────────────── 4. 상승장 팡파르 (D장조 4/4) */

const FAN_BPM = 126;
const D_ = [38, 50, 54, 57, 62];
const G_ = [43, 55, 59, 62, 67];
const A_ = [45, 57, 61, 64, 69];
const Bm_ = [47, 59, 62, 66, 71];

const FANFARE_BARS = [
  { ch: D_, timp: [0, 2], mel: [[74, 0, 0.5], [78, 0.5, 0.5], [81, 1, 1], [78, 2, 0.5], [81, 2.5, 0.5], [86, 3, 1]], g: 1.0 },
  { ch: G_, timp: [0], mel: [[83, 0, 1], [81, 1, 1], [79, 2, 2]], g: 1.0 },
  { ch: A_, timp: [0, 2], mel: [[76, 0, 0.5], [78, 0.5, 0.5], [81, 1, 1], [83, 2, 2]], g: 1.05 },
  { ch: D_, timp: [0], mel: [[86, 0, 3], [81, 3, 1]], g: 1.1 },

  { ch: Bm_, timp: [0, 2], mel: [[83, 0, 0.5], [81, 0.5, 0.5], [83, 1, 1], [86, 2, 2]], g: 1.05 },
  { ch: G_, timp: [0], mel: [[85, 0, 1], [83, 1, 1], [81, 2, 2]], g: 1.05 },
  { ch: A_, timp: [0, 1, 2, 3], mel: [[81, 0, 1], [83, 1, 1], [85, 2, 1], [86, 3, 1]], g: 1.15 },
  { ch: D_, timp: [0, 2], mel: [[90, 0, 4]], hold: true, g: 1.2 },
];

/* ═══════════════════════════════════════════════════ */

export class Bgm {
  constructor() {
    this.ctx = null;
    this.track = null;
    this.timer = 0;
    this.buffers = {};
    this.fileSrc = null;
  }

  get playing() { return this.track !== null; }

  static info(key) { return TRACKS.find(t => t.key === key) || null; }

  async play(track) {
    this.stop();
    if (!track) return null;
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.track = track;
    const now = this.ctx.currentTime;
    const vol = track === 'dies' ? 0.24 : track === 'toccata' ? 0.27 : 0.3;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(vol, now + 0.8);

    const file = await this._loadFile(track);
    if (this.track !== track) return this.track;
    if (file) {
      const src = this.ctx.createBufferSource();
      src.buffer = file;
      src.loop = true;
      src.connect(this.master);
      src.start();
      this.fileSrc = src;
      return this.track;
    }

    this.cursor = 0;
    this.beatPos = 0;
    this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
    const fn = {
      hymn: '_schedHymn', dies: '_schedDies',
      toccata: '_schedToccata', fanfare: '_schedFanfare',
    }[track];
    const tick = () => this[fn]();
    this.timer = setInterval(tick, 110);
    tick();
    return this.track;
  }

  stop() {
    clearInterval(this.timer);
    this.track = null;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    if (this.fileSrc) {
      const s = this.fileSrc;
      this.fileSrc = null;
      setTimeout(() => { try { s.stop(); } catch {} }, 700);
    }
  }

  async _loadFile(track) {
    if (track in this.buffers) return this.buffers[track];
    const name = Bgm.info(track)?.file || track;
    let buf = null;
    for (const ext of ['mp3', 'ogg', 'm4a']) {
      try {
        const r = await fetch(`/audio/${name}.${ext}`);
        if (!r.ok) continue;
        buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
        break;
      } catch {}
    }
    this.buffers[track] = buf;
    return buf;
  }

  _build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    const wet = ctx.createGain(); wet.gain.value = 0.34;
    const d1 = ctx.createDelay(1); d1.delayTime.value = 0.21;
    const d2 = ctx.createDelay(1); d2.delayTime.value = 0.37;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 2400;

    this.master.connect(d1); d1.connect(damp); damp.connect(fb);
    fb.connect(d2); d2.connect(d1); d2.connect(wet);
    damp.connect(wet);
    wet.connect(ctx.destination);
    this.master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.6);
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = nb.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    this.noise = nb;
  }

  /* ── 음색 ───────────────────────────── */

  _pipe(midi, at, dur, gain, partials) {
    const ctx = this.ctx;
    const f = hz(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.05);
    env.gain.setValueAtTime(gain, at + dur * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.2);
    env.connect(this.master);

    for (const [mul, amp, type] of partials) {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = f * mul;
      o.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g); g.connect(env);
      o.start(at);
      o.stop(at + dur + 0.3);
    }
  }

  _stab(midi, at, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    o.detune.value = (Math.random() - 0.5) * 10;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3600, at);
    lp.frequency.exponentialRampToValueAtTime(800, at + dur);
    lp.Q.value = 2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.2);

    o.connect(lp); lp.connect(env); env.connect(this.master);
    o.start(at);
    o.stop(at + dur * 1.4);
  }

  /** 금관 — 팡파르용 */
  _brass(midi, at, dur, gain) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.04);
    env.gain.setValueAtTime(gain, at + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.15);

    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(900, at);
    bp.frequency.linearRampToValueAtTime(3400, at + 0.08);
    bp.frequency.linearRampToValueAtTime(1800, at + dur);
    bp.Q.value = 1.2;

    for (const [det, amp] of [[-7, 1], [7, 0.8]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(midi);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g); g.connect(bp);
      o.start(at); o.stop(at + dur + 0.25);
    }
    bp.connect(env); env.connect(this.master);
  }

  _bassDrum(at, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, at);
    o.frequency.exponentialRampToValueAtTime(34, at + 0.14);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
    o.connect(env); env.connect(this.master);
    o.start(at); o.stop(at + 0.8);

    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 220;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.75, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    n.start(at);
  }

  _timp(midi, at, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz(midi) * 1.5, at);
    o.frequency.exponentialRampToValueAtTime(hz(midi), at + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    o.connect(env); env.connect(this.master);
    o.start(at); o.stop(at + 0.55);
  }

  /* ── 스케줄러 ──────────────────────────── */

  _schedHymn() {
    if (this.track !== 'hymn') return;
    const BEAT = 60 / HYMN_BPM;
    while (this.nextTime < this.ctx.currentTime + 0.6) {
      const [midi, beats] = HYMN_MELODY[this.cursor];
      const at = this.nextTime;
      const dur = beats * BEAT;

      this._pipe(midi, at, dur, 0.17, [[1, 1], [2, 0.42], [3, 0.16], [4, 0.08]]);

      if (this.beatPos % 3 < 0.01) {
        const ch = HYMN_CHORDS[Math.floor(this.beatPos / 3) % HYMN_CHORDS.length];
        for (const n of ch) this._pipe(n, at, 3 * BEAT, 0.072, [[1, 1], [2, 0.3], [3, 0.1]]);
        this._pipe(ch[0] - 12, at, 3 * BEAT, 0.1, [[1, 1], [2, 0.22]]);
      }

      this.nextTime += dur;
      this.beatPos += beats;
      this.cursor++;
      if (this.cursor >= HYMN_MELODY.length) {
        this.cursor = 0;
        this.beatPos = 0;
        this.nextTime += BEAT;
      }
    }
  }

  _schedDies() {
    if (this.track !== 'dies') return;
    const BEAT = 60 / DIES_BPM;
    const BAR = BEAT * 4;

    while (this.nextTime < this.ctx.currentTime + 0.8) {
      const b = DIES_BARS[this.bar];
      const at = this.nextTime;
      const g = b.g;

      for (const beat of b.blast || []) {
        const t = at + beat * BEAT;
        this._bassDrum(t, 0.5 * g);
        for (const n of b.ch) this._stab(n, t, BEAT * 0.5, 0.075 * g);
        this._pipe(b.ch[0], t, BEAT * 0.6, 0.1 * g, [[1, 1], [2, 0.4], [3, 0.18]]);
      }

      for (const beat of b.run || []) {
        const scale = b.hi ? RUN_HI : RUN_MID;
        scale.forEach((n, i) => {
          this._stab(n, at + beat * BEAT + i * BEAT * 0.125, BEAT * 0.12, 0.05 * g);
        });
      }

      if (b.drive) {
        for (let e = 0; e < 8; e++) {
          const t = at + e * BEAT * 0.5;
          const note = e % 2 === 0 ? b.ch[1] : b.ch[3];
          this._stab(note, t, BEAT * 0.4, 0.05 * g * (e % 2 === 0 ? 1 : 0.6));
        }
      }

      this._pipe(b.ch[0], at, BAR * (b.hold ? 1.8 : 0.95), 0.09 * g, [[1, 1], [2, 0.3], [3, 0.1]]);

      for (const [midi, beat, len] of b.choir || []) {
        const t = at + beat * BEAT;
        const dur = len * BEAT;
        this._pipe(midi, t, dur, 0.15 * g, [[1, 1], [2, 0.5], [3, 0.22], [4, 0.1]]);
        this._pipe(midi - 12, t, dur, 0.1 * g, [[1, 1], [2, 0.3]]);
        this._pipe(midi - 7, t, dur, 0.07 * g, [[1, 1], [2, 0.2]]);
      }

      this.nextTime += BAR * (b.hold ? 2 : 1);
      this.bar = (this.bar + 1) % DIES_BARS.length;
    }
  }

  _schedToccata() {
    if (this.track !== 'toccata') return;
    // 오르간 플레넘 — 배음을 두껍게
    const REG = [[1, 1], [2, 0.6], [3, 0.3], [4, 0.22], [6, 0.12], [8, 0.09]];
    while (this.nextTime < this.ctx.currentTime + 0.9) {
      const base = this.nextTime;
      for (const [notes, start, dur, gain] of TOCCATA) {
        const t = base + start * TOC_BEAT;
        if (t < this.ctx.currentTime - 0.1) continue;
        for (const n of notes) this._pipe(n, t, dur, gain / Math.max(1, notes.length * 0.55), REG);
      }
      this.nextTime = base + TOC_LEN * TOC_BEAT;
    }
  }

  _schedFanfare() {
    if (this.track !== 'fanfare') return;
    const BEAT = 60 / FAN_BPM;
    const BAR = BEAT * 4;

    while (this.nextTime < this.ctx.currentTime + 0.8) {
      const b = FANFARE_BARS[this.bar];
      const at = this.nextTime;
      const g = b.g;

      for (const beat of b.timp || []) this._timp(b.ch[0], at + beat * BEAT, 0.3 * g);

      // 반주 — 뒷박에 가볍게
      for (let e = 0; e < 8; e++) {
        if (e % 2 === 0) continue;
        this._stab(b.ch[2 + (e % 3 === 0 ? 1 : 0)], at + e * BEAT * 0.5, BEAT * 0.35, 0.035 * g);
      }
      this._pipe(b.ch[0], at, BAR * (b.hold ? 1.9 : 0.95), 0.08 * g, [[1, 1], [2, 0.35], [3, 0.12]]);
      for (const n of b.ch.slice(1, 4)) {
        this._pipe(n, at, BAR * 0.9, 0.035 * g, [[1, 1], [2, 0.25]]);
      }

      for (const [midi, beat, len] of b.mel || []) {
        this._brass(midi, at + beat * BEAT, len * BEAT, 0.085 * g);
        this._brass(midi - 12, at + beat * BEAT, len * BEAT, 0.04 * g);
      }

      this.nextTime += BAR * (b.hold ? 2 : 1);
      this.bar = (this.bar + 1) % FANFARE_BARS.length;
    }
  }
}

export { Bgm as Hymn };
