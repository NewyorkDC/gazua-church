import * as THREE from 'three';
import { World, HEAD, BODY, HALF, STEP_UP, EYE, fmtPrice } from './world.js';
import { Net } from './net.js';
import { Bgm, TRACKS } from './audio.js';

let RANKS = ['구도자', '새신자', '성도', '서리집사', '안수집사', '권사', '장로', '전도사', '목사', '담임목사 ✝'];
let RANK_NEED = [0, 8, 20, 45, 85, 140, 220, 340, 520, 800];
const ST = { IDLE: 0, WALK: 1, JUMP: 2, PRAY: 3, CLEAN: 4, BULL: 5, BEAR: 6 };
const WALLS = ['북①', '북②', '남①', '남②', '동①', '동②', '서①', '서②'];
const GRAV = 18;
const JUMP_V = 7.0;
const KEEP_R = 2.4;

const $ = (s) => document.querySelector(s);

/* ══════════════════════════════════════════ 상태 */

const app = {
  net: new Net(),
  bgm: new Bgm(),
  myId: null,
  room: '1',
  nick: '',
  skin: 'believer',
  me: { x: 0, y: 0, z: 10, ry: Math.PI, vy: 0, grounded: true, st: ST.IDLE },
  meAv: null,
  players: new Map(),
  labels: new Map(),
  fixed: [], reco: [],
  px: {},
  nextRotateAt: 0,
  myVote: null,
  candidates: [],
  joined: false,
  collapsed: false,
  reviveAt: 0,
};

const world = new World($('#scene'));
const net = app.net;
$('#loading').remove();

/* ══════════════════════════════════════════ 입장 화면 */

let pickedRoom = '1';

async function loadRooms() {
  let data = { rooms: [{ id: '1', n: 0, cap: 100 }], cap: 100 };
  try {
    const base = window.CHURCH_SERVER ? `https://${window.CHURCH_SERVER}` : '';
    const r = await fetch(base + '/api/rooms');
    if (r.ok) data = await r.json();
  } catch {}
  renderRoomPick(data.rooms);
  fillRoomSelect(data.rooms);
}

function renderRoomPick(rooms) {
  const box = $('#roomPick');
  box.innerHTML = '';
  // 방이 하나뿐이면 고를 게 없으니 숨긴다
  $('#roomField').classList.toggle('hidden', rooms.length < 2);
  $('.pill.room').classList.toggle('hidden', rooms.length < 2);
  for (const r of rooms) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rb' + (r.id === pickedRoom ? ' on' : '') + (r.n >= r.cap ? ' full' : '');
    b.innerHTML = `예배실 ${r.id}<small>${r.n}/${r.cap}</small>`;
    b.onclick = () => {
      if (r.n >= r.cap) return toast('예배실이 가득 찼습니다');
      pickedRoom = r.id;
      renderRoomPick(rooms);
    };
    box.appendChild(b);
  }
}

function fillRoomSelect(rooms) {
  const sel = $('#roomSelect');
  sel.innerHTML = '';
  for (const r of rooms) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `예배실 ${r.id} (${r.n}/${r.cap})`;
    if (r.id === app.room) o.selected = true;
    sel.appendChild(o);
  }
}

for (const b of document.querySelectorAll('#skinPick .sb')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('#skinPick .sb')) o.classList.remove('on');
    b.classList.add('on');
    app.skin = b.dataset.skin;
  };
}

loadRooms();

$('#enterBtn').onclick = () => {
  app.room = pickedRoom;
  app.nick = $('#nickInput').value.trim();
  $('#gate').classList.add('hidden');
  for (const el of document.querySelectorAll('.hud-top,.hud-left,.hud-bottom,.chat-log,.hud-right')) el.classList.remove('hidden');
  net.connect({ t: 'join', room: app.room, nick: app.nick || undefined, skin: app.skin });
};

$('#leaveBtn').onclick = () => {
  net.close();
  resetWorld();
  app.joined = false;
  for (const el of document.querySelectorAll('.hud-top,.hud-left,.hud-bottom,.chat-log,.hud-right')) el.classList.add('hidden');
  closePanels();
  $('#gate').classList.remove('hidden');
  loadRooms();
};

$('#roomSelect').onchange = (e) => {
  const rid = e.target.value;
  if (rid === app.room) return;
  net.close();
  resetWorld();
  app.room = rid;
  net.connect({ t: 'join', room: rid, nick: app.nick || app.myNick || undefined, skin: app.skin });
};

function resetWorld() {
  for (const id of [...world.avatars.keys()]) world.removeAvatar(id);
  for (const l of app.labels.values()) l.el.remove();
  app.labels.clear();
  app.players.clear();
  world.clearSplats();
  world.setDirt(0);
  world.setWish(0, 0);
  $('#chatLog').innerHTML = '';
  app.myId = null;
  app.meAv = null;
}

/* ══════════════════════════════════════════ 네트워크 */

net.on('welcome', (m) => {
  app.myId = m.id;
  app.myNick = m.nick;
  app.room = m.room;
  app.joined = true;
  app.fixed = m.fixed;
  app.reco = m.reco;
  app.nextRotateAt = m.nextRotateAt;
  app.candidates = m.candidates || [];
  Object.assign(app.px, m.px);

  $('#roomLabel').textContent = `예배실 ${m.room}`;
  $('#countLabel').textContent = m.players.length + 1;
  $('.pill.count i').textContent = `/${m.cap}`;

  app.me.x = m.you.x;
  app.me.z = m.you.z;
  app.me.ry = m.you.ry;
  app.me.y = world.groundAt(m.you.x, m.you.z);
  app.me.vy = 0;

  app.meAv = world.addAvatar(m.id, m.nick, m.skin);
  app.meAv.setRank(0);
  app.meAv.setPose(app.me.x, app.me.y, app.me.z, app.me.ry, ST.IDLE);
  app.meAv.update(0, true);
  app.players.set(m.id, { nick: m.nick, rank: 0 });

  world.camYaw = m.you.ry + Math.PI;
  world.camPos.set(m.you.x, 5, m.you.z + 8);

  for (const p of m.players) addRemote(p);

  setDirtUI(m.statue.dirt);
  for (const sp of m.statue.splats) world.addSplat(sp);
  if (m.ranks?.length) {
    RANKS = m.ranks.map(r => r.label);
    RANK_NEED = m.ranks.map(r => r.need);
    renderLadder();
  }
  app.collapsed = !!m.statue.collapsed;
  app.reviveAt = m.statue.reviveAt || 0;
  if (app.collapsed) world.collapse(true);

  applyWish(m.wish.bull, m.wish.bear);
  renderConfess(m.conf || []);
  applyPanels();
  buildBand(m.bands);
  renderChips();
  renderTally(m.tally);
  renderBoard(m.board);
  if (m.rooms) { fillRoomSelect(m.rooms); renderRoomPick(m.rooms); }
  logSys(`${m.nick} 님, 환영합니다 🙏`);
  toast(`${m.nick} 님, 환영합니다 🙏`);
});

net.on('full', (m) => {
  toast(`예배실 ${m.room}이(가) 가득 찼습니다`);
  net.close();
  if (m.rooms) { renderRoomPick(m.rooms); fillRoomSelect(m.rooms); }
  for (const el of document.querySelectorAll('.hud-top,.hud-left,.hud-bottom,.chat-log,.hud-right')) el.classList.add('hidden');
  $('#gate').classList.remove('hidden');
});

net.on('err', (m) => toast(m.reason || '오류'));

net.on('join', (m) => {
  addRemote(m.p);
  $('#countLabel').textContent = m.n;
  logSys(`${m.p[1]} 님이 들어왔습니다`);
});

net.on('leave', (m) => {
  const p = app.players.get(m.id);
  world.removeAvatar(m.id);
  const l = app.labels.get(m.id);
  if (l) { l.el.remove(); app.labels.delete(m.id); }
  app.players.delete(m.id);
  $('#countLabel').textContent = m.n;
  if (p) logSys(`${p.nick} 님이 나갔습니다`);
});

net.on('st', (m) => {
  for (const [id, x, y, z, ry, st] of m.a) {
    if (id === app.myId) continue;
    world.avatars.get(id)?.setPose(x, y, z, ry, st);
  }
});

net.on('say', (m) => {
  showBubble(m.id, m.m);
  addLog(m.nick, m.m, m.id === app.myId ? 'me' : '');
});

net.on('act', (m) => {
  if (m.a === 'throw') {
    world.throwMuck({ x: m.x, y: m.y, z: m.z }, { x: m.dx, y: m.dy, z: m.dz }, m.dist, m.hit, m.splat);
    if (m.hit && typeof m.dirt === 'number') setDirtUI(m.dirt);
    if (m.id === app.myId) {
      if (!m.hit) toast('빗나갔습니다 💩');
      else if (m.part === 'head') toast('머리 명중! 🎯 +3.4%');
    } else if (m.hit && m.part === 'head') {
      const p = app.players.get(m.id);
      if (p) logSys(`${p.nick} 님이 머리를 맞혔습니다 🎯`);
    }
  } else if (m.a === 'clean') {
    setDirtUI(m.dirt);
    if (m.gone?.length) world.removeSplats(m.gone);
    const a = world.avatars.get(m.id);
    if (a && m.id !== app.myId) a.state = ST.CLEAN;
  } else if (m.a === 'jump') {
    const a = world.avatars.get(m.id);
    if (a) a.state = ST.JUMP;
  } else if (m.a === 'pray') {
    showBubble(m.id, m.m, 'pray');     // 기도 멘트는 말풍선만, 채팅창에는 안 남긴다
    world.avatars.get(m.id)?.wish(1);
  } else if (m.a === 'bull' || m.a === 'bear') {
    world.avatars.get(m.id)?.wish(m.a === 'bull' ? 1 : -1);
  }
});

net.on('wish', (m) => applyWish(m.bull, m.bear));

net.on('event', (m) => {
  if (m.e === 'collapse') {
    app.collapsed = true;
    app.reviveAt = m.reviveAt || Date.now() + 60000;
    world.collapse();
    flash();
    banner('💥 트황상 붕괴!', `${m.by} 님의 마지막 한 방 · 1분 뒤 재건`);
    logSys(`💥 오염도 100% — ${m.by} 님이 트황상을 무너뜨렸습니다`);
    setDirtUI(100);
  } else {
    app.collapsed = false;
    app.reviveAt = 0;
    world.revive();
    world.clearSplats();
    setDirtUI(0);
    banner('✨ 트황상 부활', '깨끗한 몸으로 돌아왔습니다');
    logSys('✨ 트황상이 다시 일어섰습니다');
  }
});

net.on('conf', (m) => {
  renderConfess(m.list);
  if (m.by) logSys(`🕯 ${m.by} 님이 고해했습니다`);
});

net.on('mk', (m) => {
  for (const [sym, q] of Object.entries(m.q)) {
    const d = app.px[sym];
    if (!d) continue;
    const [price, change, changePct, ci, o, h, l, c, v] = q;
    d.price = price; d.change = change; d.changePct = changePct;
    const last = d.candles[d.candles.length - 1];
    if (last && last[0] === ci) d.candles[d.candles.length - 1] = [ci, o, h, l, c, v];
    else {
      d.candles.push([ci, o, h, l, c, v]);
      if (d.candles.length > 60) d.candles.shift();
    }
  }
  applyPanels();
  updateBand(m.b);
});

net.on('slots', (m) => {
  app.reco = m.reco;
  app.nextRotateAt = m.nextRotateAt;
  Object.assign(app.px, m.px);
  app.myVote = null;
  applyPanels();
  renderTally(m.tally);
  renderChips();
  toast('📊 추천 전광판이 교체되었습니다');
  logSys('📊 추천 종목이 교체되었습니다');
});

net.on('tally', (m) => { app.nextRotateAt = m.nextRotateAt; renderTally(m.tally); });
net.on('voted', (m) => { app.myVote = m.sym; renderChips(); toast(`${m.name} 추천 완료 👍`); });
net.on('board', (m) => { renderBoard(m.board); if (m.n) $('#countLabel').textContent = m.n; });
net.on('ranks', (m) => {
  for (const [id, rank] of m.a) {
    const p = app.players.get(id);
    if (p) p.rank = rank;
    const l = app.labels.get(id);
    if (l) setRankBadge(l.el, rank);
    world.avatars.get(id)?.setRank(rank);
    if (id === app.myId) toast(`직위가 «${RANKS[rank]}» (으)로 올랐습니다 🎖`);
  }
});

net.on('me', (m) => {
  app.meAv?.setRank(m.rank);
  const l = app.labels.get(app.myId);
  if (l) setRankBadge(l.el, m.rank);
  const next = RANK_NEED[m.rank + 1];
  $('#myRank').textContent = RANKS[m.rank] || '';
  $('#myScore').textContent = next
    ? `헌신 ${m.score}점 · 다음 «${RANKS[m.rank + 1]}»까지 ${Math.max(0, next - m.score)}점`
    : `헌신 ${m.score}점 · 최고 직위`;
});

net.on('rooms', (m) => fillRoomSelect(m.rooms));
net.on('_close', () => { if (app.joined) toast('연결이 끊어졌습니다. 다시 연결 중…'); });

function addRemote(p) {
  const [id, nick, x, y, z, ry, st, rank, skin] = p;
  const a = world.addAvatar(id, nick, skin);
  a.setPose(x, y, z, ry, st);
  a.setRank(rank || 0);
  a.update(0, true);
  app.players.set(id, { nick, rank });
}

function setDirtUI(v) {
  world.setDirt(v);
  $('#dirtFill').style.width = Math.min(100, v) + '%';
  $('#dirtPct').textContent = Math.round(v) + '%';
}

function applyWish(bull, bear) {
  world.setWish(bull, bear);
  $('#bullN').textContent = bull.toLocaleString('ko-KR');
  $('#bearN').textContent = bear.toLocaleString('ko-KR');
  const d = bull - bear;
  const mid = $('#wishMid');
  if (d === 0) { mid.textContent = '팽팽'; mid.style.color = ''; }
  else {
    mid.textContent = (d > 0 ? '상승 +' : '하락 +') + Math.abs(d).toLocaleString('ko-KR');
    mid.style.color = d > 0 ? 'var(--up)' : 'var(--down)';
  }
}

function applyPanels() {
  const order = [...app.fixed, ...app.reco];
  for (let i = 0; i < world.panels.length; i++) {
    const d = app.px[order[i]];
    if (d) world.panels[i].setData(d);
  }
  app.reco.forEach((sym, i) => world.signs[i]?.set(app.px[sym] || null));
  if (!$('#votePanel').classList.contains('hidden')) renderNow();
}

/* ══════════════════════════════════════════ 상단 띠 */

let bandRefs = null;

function buildBand(bands) {
  const track = $('#bandTrack');
  track.innerHTML = '';
  bandRefs = [];
  for (let rep = 0; rep < 2; rep++) {
    for (const b of bands) {
      const el = document.createElement('div');
      el.className = 'band-item';
      el.innerHTML = `<span class="lb">${b.label}</span><span class="pv"></span><span class="dl"></span>`;
      track.appendChild(el);
      bandRefs.push({ key: b.key, cur: b.cur, dec: b.dec, pv: el.querySelector('.pv'), dl: el.querySelector('.dl'), el });
    }
  }
  updateBand(bands);
}

function updateBand(bands) {
  if (!bandRefs) return buildBand(bands);
  const byKey = new Map(bands.map(b => [b.key, b]));
  for (const r of bandRefs) {
    const b = byKey.get(r.key);
    if (!b) continue;
    const up = b.changePct > 0, dn = b.changePct < 0;
    r.pv.textContent = `${b.cur}${fmtPrice(b.price, b.dec)}`;
    r.pv.className = 'pv ' + (up ? 'up' : dn ? 'down' : 'flat');
    r.dl.textContent = `${up ? '▲' : dn ? '▼' : '—'}${Math.abs(b.changePct).toFixed(2)}%`;
    r.dl.className = 'dl ' + (up ? 'up' : dn ? 'down' : 'flat');
    if (b.live && !r.el.querySelector('.live')) {
      const t = document.createElement('span');
      t.className = 'live';
      t.textContent = 'LIVE';
      r.el.appendChild(t);
    }
  }
}

/* ══════════════════════════════════════════ 라벨 / 말풍선 / 로그 */

function labelOf(id) {
  let l = app.labels.get(id);
  if (!l) {
    const el = document.createElement('div');
    el.className = 'lbl' + (id === app.myId ? ' me' : '');
    const p = app.players.get(id) || { nick: '…', rank: 0 };
    el.innerHTML = `<div class="bub" style="display:none"></div><div class="nick"></div><div class="rk"></div>`;
    el.querySelector('.nick').textContent = p.nick;
    setRankBadge(el, p.rank || 0);
    $('#labels').appendChild(el);
    l = { el, bub: el.querySelector('.bub'), timer: 0 };
    app.labels.set(id, l);
  }
  return l;
}

function setRankBadge(el, rank) {
  const rk = el.querySelector('.rk');
  rk.textContent = RANKS[rank] || '';
  rk.className = 'rk t' + rank;
}

function showBubble(id, text, cls = '') {
  const l = labelOf(id);
  l.bub.textContent = text;
  l.bub.className = 'bub' + (cls ? ' ' + cls : '');
  l.bub.style.display = '';
  clearTimeout(l.timer);
  l.timer = setTimeout(() => { l.bub.style.display = 'none'; }, 5200);
}

const logEl = $('#chatLog');
function addLog(nick, text, cls = '') {
  const ln = document.createElement('div');
  ln.className = 'ln' + (cls ? ' ' + cls : '');
  const w = document.createElement('span');
  w.className = 'who';
  w.textContent = nick + ':';
  ln.appendChild(w);
  ln.appendChild(document.createTextNode(text));
  pushLog(ln);
}

function logSys(text) {
  const ln = document.createElement('div');
  ln.className = 'ln sys';
  ln.textContent = text;
  pushLog(ln);
}

function pushLog(ln) {
  const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 24;
  logEl.appendChild(ln);
  while (logEl.childElementCount > 60) logEl.removeChild(logEl.firstChild);
  if (stick) logEl.scrollTop = logEl.scrollHeight;
}

const tmpV = new THREE.Vector3();
function updateLabels() {
  for (const [id, av] of world.avatars) {
    const l = labelOf(id);
    tmpV.set(av.group.position.x, av.group.position.y + av.headTop + 0.3 + av.pivot.position.y, av.group.position.z);
    const d = world.camera.position.distanceTo(tmpV);
    const p = world.project(tmpV);
    if (!p.vis || d > 32) { l.el.style.display = 'none'; continue; }
    l.el.style.display = '';
    l.el.style.transform = `translate(-50%,-100%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
    l.el.style.opacity = d > 24 ? '0.5' : '1';
  }
}

/* ══════════════════════════════════════════ 입력 */

const keys = new Set();
let dragging = false, lastPt = null, dragId = null;
let joy = null;
const uiSel = '.pill,.panel,.hud-bottom,.hud-top,.gate,.chat-log,button,input,select';

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.code === 'Escape') e.target.blur(); return; }
  if (e.code === 'Space') e.preventDefault();
  if (keys.has(e.code)) return;
  keys.add(e.code);
  if (!app.joined) return;
  if (e.code === 'Space') doJump();
  if (e.code === 'KeyR') startCharge();
  if (e.code === 'KeyE') doPray();
  if (e.code === 'Enter') $('#chatInput').focus();
  if (e.code === 'Escape') closePanels();
});

addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyR') releaseCharge();
});
addEventListener('blur', () => {
  keys.clear();
  charging = false;
  chargeT = 0;
  world.hideAim();
  $('#chargeFill').style.width = '0%';
});

$('#scene').addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('pointerdown', (e) => {
  if (e.target.closest(uiSel)) return;
  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45) {
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    return;
  }
  dragging = true; dragId = e.pointerId; lastPt = { x: e.clientX, y: e.clientY };
});

addEventListener('pointermove', (e) => {
  if (joy && e.pointerId === joy.id) {
    joy.dx = Math.max(-1, Math.min(1, (e.clientX - joy.ox) / 60));
    joy.dy = Math.max(-1, Math.min(1, (e.clientY - joy.oy) / 60));
    return;
  }
  if (!dragging || e.pointerId !== dragId) return;
  const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
  lastPt = { x: e.clientX, y: e.clientY };
  world.camYaw -= dx * 0.005;
  world.camPitch = Math.max(-0.12, Math.min(0.92, world.camPitch + dy * 0.004));
});

addEventListener('pointerup', (e) => {
  if (joy && e.pointerId === joy.id) joy = null;
  if (e.pointerId === dragId) { dragging = false; dragId = null; }
});
addEventListener('pointercancel', () => { joy = null; dragging = false; dragId = null; });

addEventListener('wheel', (e) => {
  if (e.target.closest('.panel,.chat-log')) return;
  world.camDist = Math.max(3.2, Math.min(15, world.camDist + e.deltaY * 0.006));
}, { passive: true });

/* ── 액션 버튼 */
let cleanHeld = false;
let lastCleanSend = 0;
let praying = false;
let charging = false;
let chargeT = 0;

for (const b of document.querySelectorAll('.act')) {
  const a = b.dataset.act;
  if (a === 'clean') {
    b.addEventListener('pointerdown', () => { cleanHeld = true; });
  } else if (a === 'throw') {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startCharge();
      dragging = true; dragId = e.pointerId; lastPt = { x: e.clientX, y: e.clientY };
    });
  } else {
    b.onclick = () => { if (a === 'pray') doPray(); else if (a === 'jump') doJump(); };
  }
}
addEventListener('pointerup', () => { cleanHeld = false; releaseCharge(); });

for (const b of document.querySelectorAll('.wish')) {
  b.onclick = () => {
    if (!app.joined) return;
    net.send({ t: 'act', a: b.dataset.act });
    app.meAv?.wish(b.dataset.act === 'bull' ? 1 : -1);
  };
}

function camForward() {
  return { x: -Math.sin(world.camYaw), z: -Math.cos(world.camYaw) };
}

/** 충전량(0~1)에 따라 몸통 → 머리로 조준이 올라간다 */
function aimDir() {
  const eye = { x: app.me.x, y: app.me.y + EYE, z: app.me.z };
  const flat = Math.max(1.5, Math.hypot(eye.x, eye.z));
  const pBody = Math.atan2(BODY.y - eye.y, flat);
  const pHead = Math.atan2(HEAD.y + 0.3 - eye.y, flat);
  const pitch = pBody + (pHead - pBody) * chargeT;
  const f = camForward();
  const cp = Math.cos(pitch);
  return { eye, dir: { x: f.x * cp, y: Math.sin(pitch), z: f.z * cp } };
}

function startCharge() {
  if (!app.joined || app.collapsed) {
    if (app.collapsed) toast('동상이 쓰러져 있습니다');
    return;
  }
  charging = true;
  chargeT = 0;
}

function releaseCharge() {
  if (!charging) return;
  charging = false;
  world.hideAim();
  $('#chargeFill').style.width = '0%';
  const { dir } = aimDir();
  net.send({ t: 'act', a: 'throw', dx: dir.x, dy: dir.y, dz: dir.z });
  praying = false;
  $('[data-act="pray"]').classList.remove('on');
}

function doJump() {
  if (!app.joined) return;
  if (!app.me.grounded) return;
  app.me.vy = JUMP_V;
  app.me.grounded = false;
  net.send({ t: 'act', a: 'jump' });
}

function doPray() {
  if (!app.joined) return;
  praying = !praying;
  $('[data-act="pray"]').classList.toggle('on', praying);
  if (praying) net.send({ t: 'act', a: 'pray' });
}

/* ── 채팅 */
$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const i = $('#chatInput');
  const v = i.value.trim();
  if (!v) { i.blur(); return; }
  net.send({ t: 'say', m: v });
  i.value = '';
  i.blur();
};

/* ══════════════════════════════════════════ 패널 UI */

function closePanels() {
  for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden');
}
for (const x of document.querySelectorAll('[data-close]')) x.onclick = closePanels;

function togglePanel(sel, onOpen) {
  const p = $(sel);
  const show = p.classList.contains('hidden');
  closePanels();
  if (show) { p.classList.remove('hidden'); onOpen?.(); }
}

$('#btnBoard').onclick = () => togglePanel('#boardPanel', () => net.send({ t: 'board' }));
$('#btnVote').onclick = () => togglePanel('#votePanel', renderNow);
$('#btnConfess').onclick = () => togglePanel('#confessPanel');

// 1/2/3/4 선택 + 끄기
(function buildBgmPicker() {
  const box = $('#bgmPick');
  const pick = async (key) => {
    for (const b of box.children) b.classList.toggle('on', b.dataset.k === (key || ''));
    box.classList.add('busy');
    await app.bgm.play(key);
    box.classList.remove('busy');
    const info = Bgm.info(key);
    $('#bgmName').textContent = info ? `${info.icon} ${info.label}` : '끔';
    if (info) toast(`${info.icon} ${info.label} 재생`);
  };
  for (const t of TRACKS) {
    const b = document.createElement('button');
    b.dataset.k = t.key;
    b.textContent = t.no;
    b.title = `${t.icon} ${t.label}`;
    b.onclick = () => pick(t.key);
    box.appendChild(b);
  }
  const off = document.createElement('button');
  off.dataset.k = '';
  off.className = 'off on';
  off.textContent = '✕';
  off.title = '끄기';
  off.onclick = () => pick(null);
  box.appendChild(off);
})();

function renderBoard(b) {
  if (!b) return;
  const fill = (el, list, unit) => {
    el.innerHTML = '';
    if (!list || !list.length) { el.innerHTML = '<li class="empty">아직 없습니다</li>'; return; }
    list.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="no">${i + 1}</span><span class="nm"></span><span class="rk">${RANKS[p.rank] || ''}</span><span class="vl">${p.n}${unit}</span>`;
      li.querySelector('.nm').textContent = p.nick;
      el.appendChild(li);
    });
  };
  fill($('#boardClean'), b.clean, '회');
  fill($('#boardHit'), b.hit, '발');
  fill($('#boardHead'), b.head, '발');
}

function renderTally(t) {
  const el = $('#tallyList');
  el.innerHTML = '';
  if (!t || !t.length) { el.innerHTML = '<li class="empty">아직 추천이 없습니다</li>'; return; }
  t.forEach((v, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="no">${i + 1}</span><span class="nm"></span><span class="vl">${v.n}표</span>`;
    li.querySelector('.nm').textContent = `${v.name} (${v.sym})`;
    el.appendChild(li);
  });
}

function renderNow() {
  const el = $('#nowList');
  const order = [...app.fixed, ...app.reco];
  el.innerHTML = '';
  order.forEach((sym, i) => {
    const d = app.px[sym];
    const li = document.createElement('li');
    const up = d && d.change >= 0;
    li.innerHTML = `<span class="wall">${WALLS[i]}</span><span class="nm"></span><span class="vl ${d ? (up ? 'up' : 'down') : ''}"></span>`;
    li.querySelector('.nm').textContent = d ? `${d.name}${i >= 4 ? ' ⭐' : ''}` : sym;
    li.querySelector('.vl').textContent = d ? `${up ? '+' : ''}${d.changePct.toFixed(2)}%` : '—';
    el.appendChild(li);
  });
}

function renderChips() {
  const box = $('#voteChips');
  box.innerHTML = '';
  for (const c of app.candidates) {
    const b = document.createElement('button');
    b.className = 'chip' + (app.myVote === c.sym ? ' on' : '');
    b.textContent = c.name;
    b.onclick = () => net.send({ t: 'vote', s: c.sym });
    box.appendChild(b);
  }
}

$('#voteBtn').onclick = () => {
  const v = $('#voteInput').value.trim();
  if (!v) return;
  net.send({ t: 'vote', s: v });
  $('#voteInput').value = '';
};
$('#voteInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#voteBtn').click(); }
});

$('#confessBtn').onclick = () => {
  const v = $('#confessInput').value.trim();
  if (!v) return;
  net.send({ t: 'confess', m: v });
  $('#confessInput').value = '';
};
$('#confessInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#confessBtn').click(); }
});

function renderConfess(list) {
  world.confess.set(list);
  const el = $('#confessList');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<li class="empty">아직 고백이 없습니다</li>'; return; }
  [...list].reverse().forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="who"></span><span class="msg"></span>`;
    li.querySelector('.who').textContent = c.nick;
    li.querySelector('.msg').textContent = c.m;
    el.appendChild(li);
  });
}

setInterval(() => {
  if (!app.nextRotateAt) return;
  const ms = Math.max(0, app.nextRotateAt - Date.now());
  const m = String(Math.floor(ms / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  $('#rotateIn').textContent = `${m}:${s}`;
}, 1000);

function renderLadder() {
  const el = $('#ladderList');
  if (!el) return;
  el.innerHTML = '';
  RANKS.forEach((label, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="no">${i + 1}</span><span class="nm"></span><span class="vl">${RANK_NEED[i]}점</span>`;
    li.querySelector('.nm').textContent = label;
    el.appendChild(li);
  });
}
renderLadder();

setInterval(() => {
  const pct = $('#dirtPct');
  if (app.collapsed && app.reviveAt) {
    const left = Math.max(0, Math.ceil((app.reviveAt - Date.now()) / 1000));
    pct.textContent = `재건 ${left}초`;
  }
}, 500);

/* ══════════════════════════════════════════ 후원 · 보상형 광고 */

const ADS = window.CHURCH_ADS || {};

(function buildBanner() {
  const cfg = ADS.banner || {};
  const box = $('#adBox');
  if (!cfg.enabled) { box.remove(); return; }

  const link = $('#adLink');
  // 제휴 링크는 http(s) 만 허용 (javascript: 같은 건 막는다)
  if (/^https?:\/\//i.test(cfg.href || '')) link.setAttribute('href', cfg.href);
  else { link.removeAttribute('href'); link.classList.add('empty'); }

  if (/^https?:\/\//i.test(cfg.img || '')) {
    const img = $('#adImg');
    img.src = cfg.img;
    img.hidden = false;
  }
  $('#adTitle').textContent = cfg.title || '';
  $('#adText').textContent = cfg.text || '';
  $('#adDisc').textContent = cfg.disclosure || '';
  $('#adClose').onclick = () => box.remove();
})();

let rewardNextAt = 0;

function paintReward() {
  const b = $('#btnReward');
  const left = rewardNextAt - Date.now();
  if (left > 0) {
    b.disabled = true;
    const m = Math.floor(left / 60000);
    const s2 = Math.ceil((left % 60000) / 1000);
    $('#rwSub').textContent = `${m}분 ${s2}초 뒤 다시`;
  } else {
    b.disabled = false;
    $('#rwSub').textContent = '지금 받기';
  }
}
setInterval(paintReward, 1000);

if (!(ADS.rewarded || {}).enabled) $('#btnReward').remove();

$('#btnReward').onclick = async () => {
  if (!app.joined) return toast('먼저 입장해 주세요');
  if (Date.now() < rewardNextAt) return;
  const ok = await showAd();
  if (ok) net.send({ t: 'reward' });
};

/** 광고 재생. provider 가 연결돼 있으면 그쪽에 맡기고, 없으면 자리만 지킨다 */
function showAd() {
  const cfg = ADS.rewarded || {};
  if (typeof cfg.provider === 'function') {
    return Promise.resolve(cfg.provider()).catch(() => false);
  }
  return new Promise((resolve) => {
    const modal = $('#adModal');
    const total = Math.max(3, cfg.seconds || 15);
    let left = total;
    modal.classList.remove('hidden');
    $('#adCount').textContent = left;
    $('#adProgress').style.width = '0%';

    const done = (ok) => {
      clearInterval(iv);
      modal.classList.add('hidden');
      $('#adCancel').onclick = null;
      resolve(ok);
    };
    $('#adCancel').onclick = () => done(false);

    const iv = setInterval(() => {
      left -= 0.1;
      $('#adCount').textContent = Math.max(0, Math.ceil(left));
      $('#adProgress').style.width = ((total - left) / total * 100).toFixed(1) + '%';
      if (left <= 0) done(true);
    }, 100);
  });
}

net.on('reward', (m) => {
  rewardNextAt = m.next || 0;
  paintReward();
  if (m.ok) {
    toast(`직위 점수 +${m.points} 적립 🎁`);
    logSys(`🎁 광고 보상으로 직위 점수 +${m.points}`);
    app.meAv?.setRank(m.rank);
  } else {
    toast('아직 다시 받을 수 없습니다');
  }
});

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

let bannerTimer = 0;
function banner(title, sub) {
  $('#bannerTitle').textContent = title;
  $('#bannerSub').textContent = sub;
  $('#banner').classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('#banner').classList.remove('on'), 3800);
}

function flash() {
  const el = $('#flash');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

/* ══════════════════════════════════════════ 루프 */

let lastSent = 0;
let lastState = -1;

function stepLocal(dt) {
  if (!app.joined || !app.meAv) return;
  const me = app.me;

  let f = 0, r = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
  if (joy) { f += -joy.dy; r += joy.dx; }

  const len = Math.hypot(f, r);
  let moving = false;
  if (len > 0.08) {
    const fw = camForward();
    const rt = { x: Math.cos(world.camYaw), z: -Math.sin(world.camYaw) };
    const mx = (fw.x * f + rt.x * r) / len;
    const mz = (fw.z * f + rt.z * r) / len;
    const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 7.4 : 4.6;

    let nx = me.x + mx * sp * dt;
    let nz = me.z + mz * sp * dt;
    nx = Math.max(-HALF, Math.min(HALF, nx));
    nz = Math.max(-HALF, Math.min(HALF, nz));
    const dr = Math.hypot(nx, nz);
    if (dr < KEEP_R) { const k = KEEP_R / (dr || 1); nx *= k; nz *= k; }

    // 턱이 높으면 막고(점프해야 올라감), 낮으면 그냥 올라선다
    if (world.groundAt(nx, nz) - me.y <= STEP_UP) {
      me.x = nx; me.z = nz;
      moving = true;
    } else if (world.groundAt(nx, me.z) - me.y <= STEP_UP) {
      me.x = nx; moving = true;
    } else if (world.groundAt(me.x, nz) - me.y <= STEP_UP) {
      me.z = nz; moving = true;
    }
    if (moving) {
      me.ry = Math.atan2(mx, mz);
      praying = false;
      $('[data-act="pray"]').classList.remove('on');
    }
  }

  // 중력
  me.vy -= GRAV * dt;
  me.y += me.vy * dt;
  const gh = world.groundAt(me.x, me.z);
  if (me.y <= gh) { me.y = gh; me.vy = 0; me.grounded = true; }
  else me.grounded = false;

  // 조준 충전
  if (charging) {
    chargeT = Math.min(1, chargeT + dt * 0.9);
    $('#chargeFill').style.width = (chargeT * 100).toFixed(0) + '%';
    const { eye, dir } = aimDir();
    world.showAim(new THREE.Vector3(eye.x, eye.y, eye.z), dir);
    me.ry = Math.atan2(-me.x, -me.z);
  }

  // 청소
  const near = Math.hypot(me.x, me.z) < 5.5 && !app.collapsed;
  const cleaning = (cleanHeld || keys.has('KeyC')) && near && !moving;
  $('[data-act="clean"]').disabled = !near;
  if (cleaning && performance.now() - lastCleanSend > 230) {
    lastCleanSend = performance.now();
    net.send({ t: 'act', a: 'clean' });
    me.ry = Math.atan2(-me.x, -me.z);
  }

  me.st = !me.grounded ? ST.JUMP : cleaning ? ST.CLEAN : moving ? ST.WALK : praying ? ST.PRAY : ST.IDLE;

  app.meAv.setPose(me.x, me.y, me.z, me.ry, me.st);
  app.meAv.group.position.set(me.x, me.y, me.z);

  const now = performance.now();
  if (now - lastSent > 100 && (moving || !me.grounded || me.st !== lastState)) {
    lastSent = now;
    lastState = me.st;
    net.send({
      t: 'mv',
      x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2),
      ry: +me.ry.toFixed(2), st: me.st,
    });
  }
}

let prev = performance.now();
let frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;

  stepLocal(dt);
  for (const av of world.avatars.values()) av.update(dt, false);
  world.update(dt);

  const focus = app.meAv ? app.meAv.group.position : new THREE.Vector3(0, 1, 0);
  world.updateCamera(focus, dt);
  world.render();

  if ((frame++ & 1) === 0) updateLabels();
}
requestAnimationFrame(loop);

world.camPos.set(0, 6, 14);
world.updateCamera(new THREE.Vector3(0, 1.4, 0), 1);

// 디버그 핸들은 로컬에서만 — 배포본에서 조작 거리를 줄인다
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  window.__church = { app, world, net };
}
