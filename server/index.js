'use strict';

const CTRL_RE = new RegExp('[\u0000-\u001f\u007f​-‏  ]', 'g');

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Market } = require('./market');
const { randomNick, sanitizeNick, rankFor, RANKS } = require('./names');

const PORT = Number(process.env.PORT || 8080);
const ROOM_CAP = Number(process.env.ROOM_CAP || 100);
const ROOM_COUNT = Number(process.env.ROOM_COUNT || 1);   // 사람 늘면 올리면 된다
const ROTATE_MS = Number(process.env.ROTATE_MS || 5 * 60 * 1000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const market = new Market();

// ─────────────────────────────────────────────────────────── 상수

const ST = { IDLE: 0, WALK: 1, JUMP: 2, PRAY: 3, CLEAN: 4, BULL: 5, BEAR: 6 };
const SKINS = ['believer', 'ant', 'trump', 'musk'];

/** 오물 명중 판정용 구 (월드 좌표) — world.js 의 실제 형상과 맞춰 둔 값 */
const HEAD = { y: 5.23, r: 0.68 };
const BODY = { y: 3.62, r: 1.05 };

const HALF = 14.4;          // 바닥 정사각 반폭
const STATUE_KEEP = 2.35;   // 동상 진입 금지 반경
const MAX_CONFESS = 20;
const COLLAPSE_MS = 60000;   // 똥더미로 1분 있다가 재건

/** 기도 버튼을 누르면 랜덤으로 외치는 멘트 */
const PRAY_LINES = [
  // 상승 기원
  '올라라', '가즈아', '떡상 가즈아', '상한가 가자', '빨간불 주세요', '쭉쭉 올라라',
  '우상향 가즈아', '갭상승 가자', '천장 뚫어줘', '달까지 간다', '불기둥 세워줘',
  '장대양봉 주세요', '따상 가즈아', '신고가 가자', '로켓 발사', '떡상 각이다',
  '시초가부터 가자', '종가 베팅 간다', '오늘은 다르다', '거래량 터져라',
  // 절박
  '제발', '한 번만요', '살려줘', '진짜 마지막이야', '이번엔 진짜', '오늘만 버티게',
  '제 평단 좀', '원금만 오면 팔게요', '본전만', '손절 안 해', '버틸게요',
  '더는 못 버텨', '숨만 쉬게 해줘', '계좌 좀 보지 말까', '눈 뜨기 무섭다',
  '한 호가만', '딱 1%만', '제발 멈춰', '여기서 더는 안 돼', '마지막 기회야',
  // 반성 / 다짐
  '고점에 샀습니다', '뇌동매매 안 할게요', '유튜브 안 볼게요', '레버리지 끊을게요',
  '빚투 안 해요', '차트 안 보고 잘게요', '물타기 그만할게요', '단타 끊겠습니다',
  '리딩방 나왔어요', '테마주 안 살게요', '공부하고 살게요', '분할매수 할게요',
  '손절선 지킬게요', '풀매수 반성합니다', '회개합니다', '다신 안 그럴게요',
  // 신앙(?)
  '아멘', '할렐루야', '트황님 굽어살피소서', '트황님 자비를', '주여 어찌하여',
  '새벽기도 왔습니다', '십일조 냈습니다', '헌금했으니 부탁드려요', '금식기도 중',
  '통성기도 갑니다', '철야 뛰겠습니다', '간증하게 해주세요', '은혜를 주소서',
  '감사기도 드리게 해줘', '응답해 주세요',
  // 상황극
  '반대매매만은', '마진콜 안 돼', '증거금 모자라', '물렸습니다', '존버 간다',
  '계좌가 녹아요', '파란불 싫어요', '음봉 그만', '설거지 당했다', '횡보 그만',
  '서킷만은 안 돼', '상폐만은 제발', '유상증자 소식 끊어줘', '공매도 막아줘',
  '기관아 그만 팔아', '외인아 돌아와', '개미 좀 살려줘',
  // 소원
  '내 돈 돌려줘', '통장 지켜줘', '월급 넣었어요', '애들 학원비야', '치킨값만',
  '소고기 먹게 해줘', '퇴사하게 해줘', '건물 사게 해줘', '전세금 올려줘',
  '대출 갚게 해줘', '적금 깬 거 후회 안 하게', '올해만 좀', '노후 좀 부탁해요',
  '한강은 싫어요', '웃으면서 팔게 해줘',
];

// ─────────────────────────────────────────────────────────── 전광판 슬롯

const FIXED_SLOTS = market.fixedSymbols();            // 삼전 / 하닉 / QQQ / SOXX
let recoSlots = ['TSLA', 'NVDA', 'SOXL', 'PLTR'];     // 추천 4칸
let nextRotateAt = Date.now() + ROTATE_MS;
const votes = new Map();

function activeSymbols() { return [...FIXED_SLOTS, ...recoSlots]; }

function voteTally() {
  return [...votes.entries()]
    .map(([sym, set]) => ({ sym, name: market.get(sym)?.name || sym, n: set.size }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
}

function rotateSlots() {
  const top = voteTally().filter(v => v.n > 0).slice(0, 4).map(v => v.sym);
  if (top.length) {
    const fill = recoSlots.filter(s => !top.includes(s));
    recoSlots = [...top, ...fill].slice(0, 4);
  }
  votes.clear();
  nextRotateAt = Date.now() + ROTATE_MS;
  broadcastAll({
    t: 'slots', reco: recoSlots, nextRotateAt,
    tally: voteTally(), px: market.fulls(recoSlots),
  });
}

// ─────────────────────────────────────────────────────────── 방

class Player {
  constructor(id, ws, nick, skin) {
    this.id = id;
    this.ws = ws;
    this.nick = nick;
    this.skin = skin;
    const a = Math.random() * Math.PI * 2;
    const d = 7 + Math.random() * 8;
    this.x = Math.cos(a) * d;
    this.y = 0;
    this.z = Math.sin(a) * d;
    this.ry = Math.atan2(-this.x, -this.z);
    this.st = ST.IDLE;
    this.hits = 0;
    this.heads = 0;
    this.cleans = 0;
    this.prays = 0;
    this.joinedAt = Date.now();
    this.lastChat = 0;
    this.lastThrow = 0;
    this.lastClean = 0;
    this.lastWish = 0;
    this.lastConfess = 0;
    this.moveBudget = 0;
    this.sentRank = -1;
  }

  get score() {
    const mins = (Date.now() - this.joinedAt) / 60000;
    return Math.floor(this.cleans * 2 + this.hits + this.heads * 3 + this.prays * 2 + mins);
  }

  get rank() { return rankFor(this.score); }

  pub() { return [this.id, this.nick, this.x, this.y, this.z, this.ry, this.st, this.rank, this.skin]; }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.moved = new Set();

    this.dirt = 0;              // 0~100
    this.hits = 0;
    this.cleans = 0;
    this.splats = [];
    this.splatSeq = 1;
    this.collapsed = false;
    this.reviveTimer = null;
    this.reviveAt = 0;

    this.bull = 0;              // 상승기원
    this.bear = 0;              // 하락기원
    this.wishDirty = false;

    this.confessions = [];      // {k, nick, m}
    this.confSeq = 1;
  }

  get size() { return this.players.size; }
  get full() { return this.players.size >= ROOM_CAP; }

  send(obj) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(s);
  }

  sendExcept(id, obj) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.id !== id && p.ws.readyState === 1) p.ws.send(s);
  }

  board() {
    const list = [...this.players.values()];
    const by = (k) => list.filter(p => p[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5)
      .map(p => ({ nick: p.nick, n: p[k], rank: p.rank }));
    return { clean: by('cleans'), hit: by('hits'), head: by('heads') };
  }

  addSplat(x, y, z) {
    const s = { k: this.splatSeq++, x: r2(x), y: r2(y), z: r2(z) };
    this.splats.push(s);
    if (this.splats.length > 70) this.splats.shift();
    return s;
  }

  /** 오염도에 맞춰 얼룩 수를 줄인다 */
  trimSplats() {
    const want = Math.ceil(this.dirt / 2.2);
    const gone = [];
    while (this.splats.length > want) gone.push(this.splats.shift().k);
    return gone;
  }
}

const rooms = new Map();
for (let i = 1; i <= ROOM_COUNT; i++) rooms.set(String(i), new Room(String(i)));

function roomCounts() {
  return [...rooms.values()].map(r => ({ id: r.id, n: r.size, cap: ROOM_CAP }));
}

function broadcastAll(obj) {
  const s = JSON.stringify(obj);
  for (const r of rooms.values()) {
    for (const p of r.players.values()) if (p.ws.readyState === 1) p.ws.send(s);
  }
}

function r2(v) { return Math.round(v * 100) / 100; }

function clampPos(x, z) {
  x = Math.max(-HALF, Math.min(HALF, x));
  z = Math.max(-HALF, Math.min(HALF, z));
  const d = Math.hypot(x, z);
  if (d < STATUE_KEEP) {
    const k = STATUE_KEEP / (d || 1);
    x *= k; z *= k;
  }
  return [x, z];
}

/**
 * 광선 vs 구. 맞으면 **던진 사람 쪽 표면(진입점)** 을 돌려준다.
 * 중심 평면의 최근접점을 쓰면 얼룩이 반대편에 붙어서 관통한 것처럼 보인다.
 */
function rayHit(ex, ey, ez, dx, dy, dz, target) {
  const lx = -ex, ly = target.y - ey, lz = -ez;        // 눈 → 구 중심
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca <= 0.5) return null;                          // 뒤쪽
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = target.r * target.r;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t0 = Math.max(0.3, tca - thc);                  // 가까운 쪽 교점
  return {
    x: ex + dx * t0,
    y: ey + dy * t0,
    z: ez + dz * t0,
    dist: t0,
  };
}

function triggerCollapse(room, by) {
  room.collapsed = true;
  room.dirt = 100;
  room.reviveAt = Date.now() + COLLAPSE_MS;
  room.bull = 0;              // 붕괴하면 기원 수치도 리셋
  room.bear = 0;
  room.wishDirty = true;
  room.send({ t: 'event', e: 'collapse', by: by ? by.nick : '누군가', reviveAt: room.reviveAt });
  clearTimeout(room.reviveTimer);
  room.reviveTimer = setTimeout(() => {
    room.collapsed = false;
    room.reviveAt = 0;
    room.dirt = 0;
    room.splats.length = 0;
    room.send({ t: 'event', e: 'revive' });
  }, COLLAPSE_MS);
}

// ─────────────────────────────────────────────────────────── 정적 파일

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';

  if (rel === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ rooms: roomCounts(), cap: ROOM_CAP }));
    return;
  }

  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ─────────────────────────────────────────────────────────── 웹소켓

const wss = new WebSocketServer({ server, maxPayload: 4096 });
let nextId = 1;

wss.on('connection', (ws) => {
  let room = null;
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (me) return;
      const rid = String(m.room || '1');
      const r = rooms.get(rid);
      if (!r) { ws.send(JSON.stringify({ t: 'err', reason: '없는 예배실입니다' })); return; }
      if (r.full) { ws.send(JSON.stringify({ t: 'full', room: rid, rooms: roomCounts() })); return; }

      const nick = sanitizeNick(m.nick) || randomNick();
      const skin = SKINS.includes(m.skin) ? m.skin : 'believer';
      me = new Player(nextId++, ws, nick, skin);
      room = r;
      r.players.set(me.id, me);

      ws.send(JSON.stringify({
        t: 'welcome',
        id: me.id, room: rid, cap: ROOM_CAP, nick: me.nick, skin: me.skin,
        you: { x: r2(me.x), z: r2(me.z), ry: r2(me.ry) },
        players: [...r.players.values()].filter(p => p.id !== me.id).map(p => p.pub()),
        statue: { dirt: r2(r.dirt), splats: r.splats, collapsed: r.collapsed, reviveAt: r.reviveAt },
        wish: { bull: r.bull, bear: r.bear },
        conf: r.confessions,
        fixed: FIXED_SLOTS, reco: recoSlots, nextRotateAt,
        px: market.fulls(activeSymbols()),
        bands: market.bandQuotes(),
        tally: voteTally(),
        candidates: market.candidates(),
        ranks: RANKS.map(r => ({ label: r.label, need: r.need })),
        rooms: roomCounts(),
        board: r.board(),
      }));
      r.sendExcept(me.id, { t: 'join', p: me.pub(), n: r.size });
      broadcastAll({ t: 'rooms', rooms: roomCounts() });
      return;
    }

    if (!me || !room) return;
    const now = Date.now();

    switch (m.t) {
      case 'mv': {
        if (me.moveBudget > 30) return;
        me.moveBudget++;
        const [x, z] = clampPos(Number(m.x) || 0, Number(m.z) || 0);
        me.x = r2(x);
        me.z = r2(z);
        me.y = r2(Math.max(0, Math.min(8, Number(m.y) || 0)));
        me.ry = r2(Number(m.ry) || 0);
        const st = Number(m.st);
        me.st = st >= 0 && st <= 6 ? st : ST.IDLE;
        room.moved.add(me.id);
        break;
      }

      case 'say': {
        if (now - me.lastChat < 900) return;
        me.lastChat = now;
        const text = sanitizeText(m.m, 40);
        if (!text) return;
        room.send({ t: 'say', id: me.id, nick: me.nick, m: text });
        break;
      }

      case 'act': {
        if (m.a === 'throw') {
          if (room.collapsed) return;
          if (now - me.lastThrow < 480) return;
          me.lastThrow = now;

          let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0, dz = Number(m.dz) || 0;
          const len = Math.hypot(dx, dy, dz) || 1;
          dx /= len; dy /= len; dz /= len;

          const ex = me.x, ey = me.y + 1.45, ez = me.z;
          let part = 'head';
          let p = rayHit(ex, ey, ez, dx, dy, dz, HEAD);
          if (!p) { part = 'body'; p = rayHit(ex, ey, ez, dx, dy, dz, BODY); }

          const payload = {
            t: 'act', a: 'throw', id: me.id,
            x: me.x, y: r2(ey), z: me.z,
            dx: r2(dx), dy: r2(dy), dz: r2(dz),
            dist: p ? r2(p.dist) : r2(Math.hypot(ex, ez) + 7),
            hit: !!p, part: p ? part : null,
          };

          if (p) {
            me.hits++;
            room.hits++;
            if (part === 'head') me.heads++;
            room.dirt = Math.min(100, room.dirt + (part === 'head' ? 3.4 : 1.5));
            payload.splat = room.addSplat(p.x, p.y, p.z);
            payload.dirt = r2(room.dirt);
          }
          room.send(payload);
          if (room.dirt >= 100 && !room.collapsed) triggerCollapse(room, me);
        } else if (m.a === 'clean') {
          if (room.collapsed) return;
          if (now - me.lastClean < 200) return;
          if (Math.hypot(me.x, me.z) > 5.6) return;
          me.lastClean = now;
          me.cleans++;
          room.cleans++;
          room.dirt = Math.max(0, room.dirt - 1);          // 한 번에 1%
          room.send({ t: 'act', a: 'clean', id: me.id, dirt: r2(room.dirt), gone: room.trimSplats() });
        } else if (m.a === 'bull' || m.a === 'bear') {
          if (now - me.lastWish < 150) return;
          me.lastWish = now;
          if (m.a === 'bull') room.bull++; else room.bear++;
          me.prays++;
          room.wishDirty = true;
          room.sendExcept(me.id, { t: 'act', a: m.a, id: me.id });
        } else if (m.a === 'pray') {
          me.prays++;
          room.send({ t: 'act', a: 'pray', id: me.id, nick: me.nick, m: PRAY_LINES[(Math.random() * PRAY_LINES.length) | 0] });
        } else if (m.a === 'jump') {
          room.sendExcept(me.id, { t: 'act', a: 'jump', id: me.id });
        }
        break;
      }

      case 'confess': {
        if (now - me.lastConfess < 4000) return;
        const text = sanitizeText(m.m, 50);
        if (!text) return;
        me.lastConfess = now;
        room.confessions.push({ k: room.confSeq++, nick: me.nick, m: text });
        while (room.confessions.length > MAX_CONFESS) room.confessions.shift();
        room.send({ t: 'conf', list: room.confessions, by: me.nick });
        break;
      }

      case 'vote': {
        const sym = String(m.s || '').toUpperCase().replace(/[^A-Z0-9가-힣.]/g, '').slice(0, 12);
        if (!sym) return;
        const inst = market.ensure(sym, sanitizeNick(m.name) || undefined);
        for (const set of votes.values()) set.delete(me.id);
        if (!votes.has(inst.sym)) votes.set(inst.sym, new Set());
        votes.get(inst.sym).add(me.id);
        broadcastAll({ t: 'tally', tally: voteTally(), nextRotateAt });
        ws.send(JSON.stringify({ t: 'voted', sym: inst.sym, name: inst.name }));
        break;
      }

      case 'board':
        ws.send(JSON.stringify({ t: 'board', board: room.board(), n: room.size }));
        break;
    }
  });

  ws.on('close', () => {
    if (me && room) {
      room.players.delete(me.id);
      room.moved.delete(me.id);
      for (const set of votes.values()) set.delete(me.id);
      room.send({ t: 'leave', id: me.id, n: room.size });
      broadcastAll({ t: 'rooms', rooms: roomCounts() });
    }
  });
});

function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CTRL_RE, '').trim();
  return s ? s.slice(0, max) : null;
}

// ─────────────────────────────────────────────────────────── 루프

setInterval(() => {
  for (const r of rooms.values()) {
    for (const p of r.players.values()) p.moveBudget = 0;

    if (r.wishDirty) {
      r.wishDirty = false;
      r.send({ t: 'wish', bull: r.bull, bear: r.bear });
    }

    if (!r.moved.size) continue;
    const a = [];
    for (const id of r.moved) {
      const p = r.players.get(id);
      if (p) a.push([p.id, p.x, p.y, p.z, p.ry, p.st]);
    }
    r.moved.clear();
    if (a.length) r.send({ t: 'st', a });
  }
}, 100);

setInterval(() => {
  market.tick();
  broadcastAll({ t: 'mk', q: market.quotes(activeSymbols()), b: market.bandQuotes() });
}, 2000);

setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.size) continue;
    r.send({ t: 'board', board: r.board(), n: r.size });
    // 직위가 올라간 사람만 추려서 알린다
    const changed = [];
    for (const p of r.players.values()) {
      const rk = p.rank;
      if (rk !== p.sentRank) { p.sentRank = rk; changed.push([p.id, rk]); }
      if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t: 'me', score: p.score, rank: rk }));
    }
    if (changed.length) r.send({ t: 'ranks', a: changed });
  }
}, 10000);

setInterval(() => { if (Date.now() >= nextRotateAt) rotateSlots(); }, 5000);

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);

market.setActiveGetter(activeSymbols);
market.start();

server.listen(PORT, () => {
  console.log(`\n  ⛪  가즈아 교회  http://localhost:${PORT}`);
  console.log(`      예배실 ${ROOM_COUNT}개 · 방당 최대 ${ROOM_CAP}명 · 추천종목 교체 ${Math.round(ROTATE_MS / 60000)}분`);
  console.log(`      방을 늘리려면  ROOM_COUNT=3 npm start`);
  console.log(`      실시세(BTC)를 쓰려면  LIVE=1 npm start\n`);
});
