'use strict';

/**
 * 시세 엔진.
 *
 * 기본은 **실시세**다. Yahoo Finance 의 공개 chart 엔드포인트에서
 * 1분봉과 현재가를 가져온다 (키 불필요, 거래소에 따라 15분 지연될 수 있음).
 * 네트워크가 막히거나 심볼을 못 찾으면 해당 종목만 조용히 시뮬레이션으로 떨어진다.
 *
 *   LIVE=0 npm start   → 전부 시뮬레이션으로 강제
 */

const CANDLE_MS = 60 * 1000;
const KEEP = 60;
const POLL_MS = Number(process.env.POLL_MS || 30000);
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const MAX_USER_SYMBOLS = Number(process.env.MAX_USER_SYMBOLS || 60);

/** 고정 2개 벽 */
const FIXED = [
  { sym: '005930', name: '삼성전자', sub: 'KRX 005930', yahoo: '005930.KS', cur: '₩', base: 216500, vol: 0.0012 },
  { sym: '000660', name: 'SK하이닉스', sub: 'KRX 000660', yahoo: '000660.KS', cur: '₩', base: 540000, vol: 0.0016 },
  { sym: 'QQQ', name: 'QQQ', sub: '나스닥100 ETF', yahoo: 'QQQ', cur: '$', base: 600, vol: 0.0008 },
  { sym: 'SOXX', name: 'SOXX', sub: '반도체 ETF', yahoo: 'SOXX', cur: '$', base: 300, vol: 0.0014 },
];

/** 추천 후보 (빠른 선택) */
const CANDIDATES = [
  { sym: 'TSLA', name: '테슬라', yahoo: 'TSLA', cur: '$', base: 398 },
  { sym: 'NVDA', name: '엔비디아', yahoo: 'NVDA', cur: '$', base: 190 },
  { sym: 'PLTR', name: '팔란티어', yahoo: 'PLTR', cur: '$', base: 180 },
  { sym: 'SOXL', name: 'SOXL(반도체3배)', yahoo: 'SOXL', cur: '$', base: 73 },
  { sym: 'TQQQ', name: 'TQQQ(나스닥3배)', yahoo: 'TQQQ', cur: '$', base: 110 },
  { sym: 'KORU', name: 'KORU(한국3배)', yahoo: 'KORU', cur: '$', base: 40 },
  { sym: 'IONQ', name: '아이온큐', yahoo: 'IONQ', cur: '$', base: 60 },
  { sym: 'RGTI', name: '리게티', yahoo: 'RGTI', cur: '$', base: 38 },
  { sym: 'COIN', name: '코인베이스', yahoo: 'COIN', cur: '$', base: 300 },
  { sym: 'MSTR', name: '스트래티지', yahoo: 'MSTR', cur: '$', base: 250 },
  { sym: 'AAPL', name: '애플', yahoo: 'AAPL', cur: '$', base: 260 },
  { sym: 'MSFT', name: '마이크로소프트', yahoo: 'MSFT', cur: '$', base: 500 },
  { sym: '373220', name: 'LG에너지솔루션', yahoo: '373220.KS', cur: '₩', base: 420000 },
  { sym: '042660', name: '한화오션', yahoo: '042660.KS', cur: '₩', base: 110000 },
  { sym: '034020', name: '두산에너빌리티', yahoo: '034020.KS', cur: '₩', base: 86000 },
  { sym: '005380', name: '현대차', yahoo: '005380.KS', cur: '₩', base: 248000 },
];

/** 상단 띠 */
const BANDS = [
  { sym: 'BTC', name: '비트코인', yahoo: 'BTC-USD', cur: '$', base: 77700, dec: 2 },
  { sym: 'KOSPI', name: '코스피', yahoo: '^KS11', cur: '', base: 5647, dec: 2 },
  { sym: 'USDKRW', name: '원/달러', yahoo: 'KRW=X', cur: '₩', base: 1340, dec: 2 },
  { sym: 'NQ', name: '나스닥 선물', yahoo: 'NQ=F', cur: '', base: 28200, dec: 2 },
];

function rnd(n = 1) { return (Math.random() * 2 - 1) * n; }

class Instrument {
  constructor(meta) {
    this.sym = meta.sym;
    this.name = meta.name || meta.sym;
    this.sub = meta.sub || '';
    this.yahoo = meta.yahoo || null;
    this.cur = meta.cur ?? '$';
    this.dec = meta.dec ?? (meta.cur === '₩' ? 0 : 2);
    this.vol = meta.vol || 0.0022;
    this.price = meta.base;
    this.prevClose = meta.base;
    this.candles = [];
    this.live = false;
    this.failures = 0;
    this._seed();
  }

  _r(v) {
    const m = Math.pow(10, this.dec);
    return Math.round(v * m) / m;
  }

  /** 실시세가 오기 전까지 보여 줄 임시 봉 */
  _seed() {
    const now = Date.now();
    let p = this.price;
    const out = [];
    for (let i = KEEP - 1; i >= 0; i--) {
      const idx = Math.floor((now - i * CANDLE_MS) / CANDLE_MS);
      const o = p;
      let h = o, l = o, c = o;
      for (let k = 0; k < 12; k++) { c *= 1 + rnd(this.vol); h = Math.max(h, c); l = Math.min(l, c); }
      out.push({ i: idx, o: this._r(o), h: this._r(h), l: this._r(l), c: this._r(c), v: Math.round(2000 + Math.random() * 9000) });
      p = c;
    }
    this.candles = out;
    this.price = this._r(p);
    this.prevClose = out[0].o;
  }

  /** Yahoo chart 응답을 그대로 반영한다 */
  applyChart(j) {
    const res = j?.chart?.result?.[0];
    if (!res || !res.meta) return false;
    const meta = res.meta;
    const price = Number(meta.regularMarketPrice);
    if (!isFinite(price) || price <= 0) return false;

    if (meta.currency === 'KRW' && this.cur === '₩') this.dec = 0;
    this.price = this._r(price);
    const pc = Number(meta.chartPreviousClose ?? meta.previousClose);
    this.prevClose = isFinite(pc) && pc > 0 ? this._r(pc) : this.prevClose;

    const ts = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const out = [];
    for (let i = Math.max(0, ts.length - KEEP); i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      out.push({
        i: Math.floor(ts[i] / 60),
        o: this._r(o), h: this._r(h), l: this._r(l), c: this._r(c),
        v: Math.round(q.volume?.[i] || 0),
      });
    }
    if (out.length >= 2) this.candles = out;
    this.live = true;
    this.failures = 0;
    return true;
  }

  /** 실시세가 붙어 있으면 아무것도 지어내지 않는다 */
  tick() {
    if (this.live) return;
    const pull = ((this.prevClose - this.price) / this.prevClose) * 0.015;
    this.price = this._r(this.price * (1 + rnd(this.vol) + pull));
    if (this.price <= 0) this.price = this._r(this.prevClose);
    const idx = Math.floor(Date.now() / CANDLE_MS);
    let last = this.candles[this.candles.length - 1];
    if (!last || last.i !== idx) {
      last = { i: idx, o: this.price, h: this.price, l: this.price, c: this.price, v: 0 };
      this.candles.push(last);
      if (this.candles.length > KEEP) this.candles.shift();
    }
    last.c = this.price;
    if (this.price > last.h) last.h = this.price;
    if (this.price < last.l) last.l = this.price;
    last.v += Math.round(60 + Math.random() * 400);
  }

  get change() { return this._r(this.price - this.prevClose); }
  get changePct() { return Math.round((this.price / this.prevClose - 1) * 10000) / 100; }

  quote() {
    const c = this.candles[this.candles.length - 1];
    return [this.price, this.change, this.changePct, c.i, c.o, c.h, c.l, c.c, c.v, this.live ? 1 : 0];
  }

  full() {
    return {
      sym: this.sym, name: this.name, sub: this.sub, cur: this.cur, dec: this.dec, live: this.live,
      price: this.price, change: this.change, changePct: this.changePct,
      candles: this.candles.map(c => [c.i, c.o, c.h, c.l, c.c, c.v]),
    };
  }
}

async function fetchChart(yahooSym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1m&range=1d`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** 사용자가 직접 넣은 심볼을 Yahoo 심볼로 풀어 본다 */
async function resolveSymbol(raw) {
  const s = String(raw).trim();
  const tries = [];
  if (/^\d{6}$/.test(s)) tries.push(s + '.KS', s + '.KQ');
  else if (/^[A-Za-z.\-]{1,10}$/.test(s)) tries.push(s.toUpperCase());

  for (const t of tries) {
    try {
      const j = await fetchChart(t);
      const meta = j?.chart?.result?.[0]?.meta;
      if (meta && isFinite(Number(meta.regularMarketPrice))) {
        return { yahoo: t, json: j, meta };
      }
    } catch {}
  }

  // 한글 종목명 등은 검색으로 한 번 더 시도
  try {
    const u = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(s)}&quotesCount=4&newsCount=0`;
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = await r.json();
      const hit = (j.quotes || []).find(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'));
      if (hit) {
        const cj = await fetchChart(hit.symbol);
        const meta = cj?.chart?.result?.[0]?.meta;
        if (meta) return { yahoo: hit.symbol, json: cj, meta, name: hit.shortname || hit.longname };
      }
    }
  } catch {}

  return null;
}

class Market {
  constructor() {
    this.inst = new Map();
    for (const m of FIXED) this.inst.set(m.sym, new Instrument(m));
    for (const m of CANDIDATES) this.inst.set(m.sym, new Instrument(m));
    this.bands = BANDS.map(b => new Instrument(b));
    this.bandByKey = new Map(this.bands.map(b => [b.sym, b]));
    this.simulated = process.env.LIVE === '0';
    this.userAdded = 0;
    this.activeGetter = () => [];
  }

  /** server 가 '지금 화면에 떠 있는 심볼'을 알려 준다 */
  setActiveGetter(fn) { this.activeGetter = fn; }

  ensure(sym, name) {
    const key = String(sym).toUpperCase().slice(0, 12);
    if (this.inst.has(key)) return this.inst.get(key);
    // 봇이 임의 심볼을 쏟아부어 메모리와 외부 요청을 늘리는 걸 막는다
    if (this.userAdded >= MAX_USER_SYMBOLS) return null;
    this.userAdded++;
    const krx = /^\d{6}$/.test(key);
    const inst = new Instrument({
      sym: key,
      name: name || key,
      cur: krx ? '₩' : '$',
      base: krx ? 50000 : 100,
      vol: 0.0028,
    });
    this.inst.set(key, inst);
    if (!this.simulated) this._resolveNew(inst);
    return inst;
  }

  async _resolveNew(inst) {
    const got = await resolveSymbol(inst.sym);
    if (!got) return;
    inst.yahoo = got.yahoo;
    if (got.meta.currency === 'KRW') { inst.cur = '₩'; inst.dec = 0; }
    else { inst.cur = '$'; inst.dec = 2; }
    if (got.name && inst.name === inst.sym) inst.name = got.name;
    inst.sub = got.yahoo;
    inst.applyChart(got.json);
  }

  get(sym) { return this.inst.get(sym); }
  candidates() { return CANDIDATES.map(c => ({ sym: c.sym, name: c.name })); }
  fixedSymbols() { return FIXED.map(f => f.sym); }

  tick() {
    for (const i of this.inst.values()) i.tick();
    for (const b of this.bands) b.tick();
  }

  quotes(symbols) {
    const out = {};
    for (const s of symbols) {
      const i = this.inst.get(s);
      if (i) out[s] = i.quote();
    }
    return out;
  }

  fulls(symbols) {
    const out = {};
    for (const s of symbols) {
      const i = this.inst.get(s);
      if (i) out[s] = i.full();
    }
    return out;
  }

  bandQuotes() {
    return this.bands.map(b => ({
      key: b.sym, label: b.name, cur: b.cur, dec: b.dec,
      price: b.price, changePct: b.changePct, live: b.live,
    }));
  }

  /** 화면에 떠 있는 종목 + 상단 띠만 순차적으로 갱신 */
  start() {
    if (this.simulated) {
      console.log('      ⚠ LIVE=0 — 전부 시뮬레이션으로 돕니다');
      return;
    }
    const round = async () => {
      const syms = this.activeGetter();
      const list = [
        ...syms.map(s => this.inst.get(s)).filter(Boolean),
        ...this.bands,
      ];
      for (const inst of list) {
        if (!inst.yahoo) continue;
        try {
          inst.applyChart(await fetchChart(inst.yahoo));
        } catch {
          if (++inst.failures >= 3) inst.live = false;
        }
        await new Promise(r => setTimeout(r, 180));
      }
    };
    round();
    setInterval(round, POLL_MS);
  }
}

module.exports = { Market, CANDLE_MS };
