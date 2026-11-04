import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* 서버(server/index.js)의 판정 구와 반드시 같은 값 */
export const HEAD = { y: 5.23, r: 0.68 };
export const BODY = { y: 3.62, r: 1.05 };
export const HALF = 14.4;
export const STEP_UP = 0.45;      // 이보다 높으면 점프해야 올라간다
export const EYE = 1.45;
export const AV_SCALE = 1.35;     // 아바타를 큼직하게

const UP = '#ff4d5e';
const DOWN = '#2f7bff';
const GOLD = '#e8b949';

export function fmtPrice(v, dec) {
  return v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** 광선 vs 구 — 서버와 같은 판정 (조준선 미리보기에 쓴다) */
export function rayHitSphere(ex, ey, ez, dx, dy, dz, target) {
  const tx = -ex, ty = target.y - ey, tz = -ez;
  const proj = tx * dx + ty * dy + tz * dz;
  if (proj <= 0.5) return null;
  const cx = ex + dx * proj, cy = ey + dy * proj, cz = ez + dz * proj;
  let nx = cx, ny = cy - target.y, nz = cz;
  const d = Math.hypot(nx, ny, nz);
  if (d > target.r) return null;
  if (d < 0.02) { nx = -dx; ny = -dy; nz = -dz; }
  else { nx /= d; ny /= d; nz /= d; }
  const k = target.r * 0.9;
  return { x: nx * k, y: target.y + ny * k, z: nz * k, dist: proj };
}

/** 던지기 궤적 — 미리보기와 실제 투사체가 같은 곡선을 쓴다 */
function arcAt(start, end, u, lift, out) {
  out.lerpVectors(start, end, u);
  out.y += Math.sin(u * Math.PI) * lift;
  return out;
}
function liftFor(dist) { return 0.5 + dist * 0.055; }

/* ══════════════════════════════════════════════════ 전광판 */

class Panel {
  constructor(world, pos, rotY, w = 10.4, h = 5.9) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 768;
    this.canvas.height = 432;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.data = null;

    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rotY;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.5, roughness: 0.55 }),
    );
    frame.position.z = -0.2;
    g.add(frame);

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.62, h + 0.62, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x6d5420, metalness: 0.85, roughness: 0.35 }),
    );
    edge.position.z = -0.32;
    g.add(edge);

    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }),
    );
    this.screen.position.z = 0.06;
    g.add(this.screen);

    const glow = new THREE.PointLight(0x4a74ff, 24, 16, 2);
    glow.position.z = 1.6;
    g.add(glow);
    this.glow = glow;

    this.group = g;
    world.scene.add(g);
    this.drawEmpty();
  }

  drawEmpty() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2b3140';
    ctx.font = '700 28px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SIGNAL…', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    this.tex.needsUpdate = true;
  }

  setData(d) { this.data = d; this.draw(); }

  draw() {
    const d = this.data;
    if (!d || !d.candles || !d.candles.length) return;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const rising = d.change >= 0;
    const col = rising ? UP : DOWN;

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#0c0f17';
    ctx.fillRect(0, 0, W, 96);
    ctx.fillStyle = GOLD;
    ctx.font = '900 30px "Noto Sans KR", sans-serif';
    ctx.fillText(d.name, 22, 40);
    ctx.fillStyle = '#5a6376';
    ctx.font = '600 15px "Noto Sans KR", sans-serif';
    ctx.fillText(`${d.sym}${d.sub ? '  ·  ' + d.sub : ''}`, 22, 66);

    ctx.textAlign = 'right';
    ctx.fillStyle = col;
    ctx.font = '900 40px "Noto Sans KR", sans-serif';
    ctx.fillText(`${d.cur}${fmtPrice(d.price, d.dec)}`, W - 22, 48);
    ctx.font = '800 19px "Noto Sans KR", sans-serif';
    ctx.fillText(`${rising ? '▲' : '▼'} ${fmtPrice(Math.abs(d.change), d.dec)}  ${rising ? '+' : '-'}${Math.abs(d.changePct).toFixed(2)}%`, W - 22, 76);
    ctx.textAlign = 'left';

    const top = 112, bot = H - 74, left = 22, right = W - 108;
    const cs = d.candles;
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (const c of cs) { if (c[2] > hi) hi = c[2]; if (c[3] < lo) lo = c[3]; if (c[5] > vmax) vmax = c[5]; }
    const pad = (hi - lo) * 0.12 || hi * 0.004 || 1;
    hi += pad; lo -= pad;
    const yOf = (p) => bot - ((p - lo) / (hi - lo)) * (bot - top);

    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.fillStyle = '#4c5466';
    ctx.font = '600 13px "Noto Sans KR", sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = lo + ((hi - lo) * i) / 4;
      const y = Math.round(yOf(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.fillText(fmtPrice(p, d.dec), right + 10, y + 4);
    }

    const n = cs.length;
    const slot = (right - left) / n;
    const bw = Math.max(2, Math.min(9, slot * 0.62));
    for (let i = 0; i < n; i++) {
      const [, o, h, l, c, v] = cs[i];
      const x = left + slot * (i + 0.5);
      ctx.strokeStyle = ctx.fillStyle = c >= o ? UP : DOWN;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, yOf(h)); ctx.lineTo(x, yOf(l)); ctx.stroke();
      const y1 = yOf(Math.max(o, c)), y2 = yOf(Math.min(o, c));
      ctx.fillRect(x - bw / 2, y1, bw, Math.max(1.4, y2 - y1));
      const vh = vmax ? (v / vmax) * 52 : 0;
      ctx.globalAlpha = 0.38;
      ctx.fillRect(x - bw / 2, H - 16 - vh, bw, vh);
      ctx.globalAlpha = 1;
    }

    const cy = Math.round(yOf(d.price)) + 0.5;
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(left, cy); ctx.lineTo(right, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.fillRect(right + 4, cy - 11, 100, 22);
    ctx.fillStyle = '#07090f';
    ctx.font = '800 13px "Noto Sans KR", sans-serif';
    ctx.fillText(fmtPrice(d.price, d.dec), right + 10, cy + 5);

    ctx.fillStyle = '#39404f';
    ctx.font = '600 12px "Noto Sans KR", sans-serif';
    ctx.fillText('1분봉 · 모의 데이터', left, H - 4);

    this.glow.color.set(rising ? 0xff4d5e : 0x2f7bff);
    this.tex.needsUpdate = true;
  }
}

/* ══════════════════════════════════════════════════ 피라미드 꼭대기 간판 */

class Sign {
  constructor(world, x, z, y) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 224;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-x, -z);     // 중앙을 바라보게

    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.8 });
    for (const sx of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), wood);
      post.position.set(sx, -0.55, 0);
      g.add(post);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.25, 0.12), wood);
    g.add(back);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.1),
      new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }),
    );
    face.position.z = 0.13;
    g.add(face);

    world.scene.add(g);
    this.set(null);
  }

  set(d) {
    const { ctx } = this;
    const W = 512, H = 224;
    ctx.fillStyle = '#120d06';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8a6a28';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.textAlign = 'center';
    if (!d) {
      ctx.fillStyle = '#4a4336';
      ctx.font = '800 40px "Noto Sans KR", sans-serif';
      ctx.fillText('기도단', W / 2, H / 2 + 14);
    } else {
      const rising = d.change >= 0;
      ctx.fillStyle = GOLD;
      ctx.font = '900 54px "Noto Sans KR", sans-serif';
      ctx.fillText(d.name.slice(0, 9), W / 2, 76);
      ctx.fillStyle = rising ? UP : DOWN;
      ctx.font = '900 44px "Noto Sans KR", sans-serif';
      ctx.fillText(`${d.cur}${fmtPrice(d.price, d.dec)}`, W / 2, 134);
      ctx.font = '800 30px "Noto Sans KR", sans-serif';
      ctx.fillText(`${rising ? '▲' : '▼'} ${Math.abs(d.changePct).toFixed(2)}%`, W / 2, 178);
    }
    ctx.textAlign = 'left';
    this.tex.needsUpdate = true;
  }
}

/* ══════════════════════════════════════════════════ 고해 기록판 */

class ConfessBoard {
  constructor(world, x, z, ry) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1100;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;

    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d1f, roughness: 0.85 });
    for (const sx of [-3.2, 3.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.8, 0.22), wood);
      post.position.set(sx, 2.4, 0);
      g.add(post);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(6.9, 4.1, 0.2), wood);
    back.position.y = 2.75;
    g.add(back);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 3.84),
      new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }),
    );
    face.position.set(0, 2.75, 0.17);
    g.add(face);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.2, 0.9), wood);
    roof.position.set(0, 4.95, 0.2);
    g.add(roof);

    world.scene.add(g);
    this.set([]);
  }

  set(list) {
    const { ctx } = this;
    const W = 1100, H = 640;
    ctx.fillStyle = '#efe7d2';
    ctx.fillRect(0, 0, W, H);

    if (!list.length) {
      ctx.fillStyle = '#a89a7c';
      ctx.font = '700 28px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('아직 고백한 사람이 없습니다', W / 2, H / 2);
      ctx.textAlign = 'left';
      this.tex.needsUpdate = true;
      return;
    }

    const rows = 10;
    const colW = (W - 60) / 2;
    list.slice(-20).forEach((c, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = 24 + col * (colW + 12);
      const y = 22 + row * 60;

      // 말풍선
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x, y, colW, 44, 12);
      ctx.fill();
      ctx.strokeStyle = '#cdbf9f';
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, colW, 44, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 22, y + 44);
      ctx.lineTo(x + 32, y + 52);
      ctx.lineTo(x + 38, y + 44);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.fillStyle = '#8a6a28';
      ctx.font = '800 17px "Noto Sans KR", sans-serif';
      const who = c.nick.length > 8 ? c.nick.slice(0, 8) + '…' : c.nick;
      ctx.fillText(who, x + 14, y + 28);
      const wOff = ctx.measureText(who).width + 24;

      ctx.fillStyle = '#23201a';
      ctx.font = '600 19px "Noto Sans KR", sans-serif';
      let text = c.m;
      while (ctx.measureText(text).width > colW - wOff - 20 && text.length > 1) text = text.slice(0, -1);
      if (text !== c.m) text += '…';
      ctx.fillText(text, x + wOff, y + 29);
    });

    this.tex.needsUpdate = true;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ══════════════════════════════════════════════════ 아바타 */

const ROBE_COLORS = [0x3d5a99, 0x8c3b3b, 0x3f7d55, 0x6a4b8c, 0x9c6b2f, 0x2f6d7d, 0xa14f78, 0x4a4a55];
const ANT_COLORS = [0xc98b6a, 0x8a7f78, 0xd7b48a, 0x6f635c, 0xb9826b, 0xa58d7d, 0x7d6a5e, 0xcfa184];
const matCache = new Map();
function mat(key, opts) {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(opts));
  return matCache.get(key);
}

let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = {
    shadow: new THREE.CircleGeometry(0.45, 14),
    muck: new THREE.IcosahedronGeometry(0.15, 0),
    ball: new THREE.SphereGeometry(1, 14, 12),
    limb: new THREE.CapsuleGeometry(0.075, 0.3, 4, 10),     // 길이 0.45
    limbThin: new THREE.CapsuleGeometry(0.042, 0.32, 4, 8),  // 개미용
    foot: new THREE.SphereGeometry(0.1, 10, 8),
    hand: new THREE.SphereGeometry(0.085, 10, 8),
    antenna: new THREE.CylinderGeometry(0.018, 0.018, 0.36, 5),
  };
  return GEO;
}

/**
 * 공통 이족 리그. 다리/팔을 Group 으로 달아서 걸을 때 흔들 수 있게 한다.
 *   hip   : 고관절 높이
 *   stride: 보폭 배수
 */
function makeLimbs(g, opt) {
  const G = geos();
  const geo = opt.thin ? G.limbThin : G.limb;
  const rig = {};

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * opt.legGap, opt.hip, 0);
    const m = new THREE.Mesh(geo, opt.legMat);
    m.position.y = -0.225;
    m.scale.y = opt.legLen / 0.45;
    leg.add(m);
    if (opt.footMat) {
      const f = new THREE.Mesh(G.foot, opt.footMat);
      f.scale.set(1, 0.62, 1.35);
      f.position.set(0, -opt.legLen + 0.02, 0.05);
      leg.add(f);
    }
    g.add(leg);
    rig[side < 0 ? 'legL' : 'legR'] = leg;

    const arm = new THREE.Group();
    arm.position.set(side * opt.armGap, opt.shoulder, 0);
    arm.rotation.z = side * 0.14;
    const a = new THREE.Mesh(geo, opt.armMat);
    a.position.y = -0.21;
    a.scale.y = opt.armLen / 0.45;
    arm.add(a);
    const h = new THREE.Mesh(G.hand, opt.handMat || opt.armMat);
    h.position.y = -opt.armLen - 0.02;
    arm.add(h);
    const anchor = new THREE.Group();
    anchor.position.y = -opt.armLen - 0.06;
    arm.add(anchor);
    g.add(arm);
    rig[side < 0 ? 'armL' : 'armR'] = arm;
    rig[side < 0 ? 'handL' : 'handR'] = anchor;
  }
  return rig;
}

/* ══════════════════════════════════════════════════ 직위 소품 · 오라 */

const RANK_TINT = [
  0x9aa3b2, 0x9aa3b2, 0x5fbf7a, 0x5fbf7a,
  0x4f9bff, 0x4f9bff, 0xb06bff, 0xb06bff,
  0xffc14d, 0xffe066,
];

/** 직위에 따라 손에 쥐는 물건 */
function buildRankItem(tier) {
  const g = new THREE.Group();
  const wood = mat('it_wood', { color: 0x6b4a24, roughness: 0.85 });
  const gold = mat('it_gold', { color: 0xe8b949, metalness: 0.85, roughness: 0.28 });
  const flame = mat('it_flame', { color: 0xffd089 });

  if (tier <= 1) return null;

  if (tier <= 3) {                       // 성경책
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.23, 0.06), mat('it_book', { color: 0x5c1c20, roughness: 0.8 }));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.21, 0.065), mat('it_page', { color: 0xf0e8d2, roughness: 0.9 }));
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.01), gold);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.01), gold);
    cv.position.set(0, 0, 0.035);
    ch.position.set(0, 0.02, 0.035);
    book.rotation.z = 0.35;
    pages.rotation.z = 0.35;
    cv.rotation.z = 0.35;
    ch.rotation.z = 0.35;
    g.add(book, pages, cv, ch);
    return g;
  }

  if (tier <= 5) {                       // 등불
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), gold);
    handle.position.y = 0.17;
    handle.rotation.y = Math.PI / 2;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.19, 8, 1, true), gold);
    cage.position.y = 0.03;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), flame);
    core.position.y = 0.03;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.06, 8), gold);
    cap.position.y = 0.15;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 8), gold);
    base.position.y = -0.07;
    g.add(handle, cage, core, cap, base);
    g.userData.glow = core;
    return g;
  }

  if (tier <= 7) {                       // 나무 지팡이
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.15, 8), wood);
    staff.position.y = -0.25;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), gold);
    knob.position.y = 0.34;
    g.add(staff, knob);
    return g;
  }

  // 목사 이상 — 빛나는 십자가 홀
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 1.3, 10), gold);
  staff.position.y = -0.28;
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), gold);
  cv.position.y = 0.5;
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.05, 0.05), gold);
  ch.position.y = 0.55;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffd98a, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(0.85);
  halo.position.y = 0.53;
  g.add(staff, cv, ch, halo);
  g.userData.glow = halo;
  return g;
}

let AURORA_TEX = null;
function auroraTexture() {
  if (AURORA_TEX) return AURORA_TEX;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 32, 128);
  AURORA_TEX = new THREE.CanvasTexture(c);
  AURORA_TEX.colorSpace = THREE.SRGBColorSpace;
  return AURORA_TEX;
}

/** 장로 이상 오로라, 목사 이상은 슈퍼사이어인식 황금 불꽃 */
class Aura {
  constructor(tier) {
    this.tier = tier;
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    const ADD = THREE.AdditiveBlending;

    // 오로라 리본
    this.ribbons = [];
    const cols = tier >= 8 ? [0xffd46a, 0xffa23a, 0xfff0b0] : [0x8affd8, 0xb06bff, 0x6bc8ff];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const rb = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 2.9),
        new THREE.MeshBasicMaterial({
          map: auroraTexture(), color: cols[i % cols.length], transparent: true,
          opacity: 0.4, depthWrite: false, blending: ADD, side: THREE.DoubleSide,
        }),
      );
      rb.position.set(Math.cos(a) * 0.52, 1.25, Math.sin(a) * 0.52);
      rb.rotation.y = -a;
      this.group.add(rb);
      this.ribbons.push({ m: rb, a, p: Math.random() * 6.28 });
    }

    // 발밑 고리
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.72, 28),
      new THREE.MeshBasicMaterial({
        color: tier >= 8 ? 0xffcf6a : 0xa98bff, transparent: true,
        opacity: 0.5, depthWrite: false, blending: ADD, side: THREE.DoubleSide,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.group.add(this.ring);

    // 황금 불꽃 (목사 이상)
    if (tier >= 8) {
      const N = 46;
      this.parts = [];
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        this.parts.push({
          a: Math.random() * 6.28,
          r: 0.18 + Math.random() * 0.42,
          y: Math.random() * 2.4,
          sp: 1.3 + Math.random() * 1.9,
        });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.flame = new THREE.Points(geo, new THREE.PointsMaterial({
        map: makeGlowTexture(), color: 0xffd36a, size: 0.34, sizeAttenuation: true,
        transparent: true, opacity: 0.9, depthWrite: false, blending: ADD,
      }));
      this.group.add(this.flame);

      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(), color: 0xffc247, transparent: true,
        opacity: 0.4, depthWrite: false, blending: ADD,
      }));
      this.halo.scale.setScalar(2.6);
      this.halo.position.y = 1.2;
      this.group.add(this.halo);
    }
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.group.rotation.y += dt * (this.tier >= 8 ? 1.1 : 0.55);

    for (const rb of this.ribbons) {
      rb.m.material.opacity = 0.22 + Math.abs(Math.sin(t * 1.7 + rb.p)) * 0.5;
      rb.m.scale.y = 0.85 + Math.sin(t * 2.3 + rb.p) * 0.18;
    }
    this.ring.scale.setScalar(1 + Math.sin(t * 2.6) * 0.1);
    this.ring.material.opacity = 0.35 + Math.abs(Math.sin(t * 2.6)) * 0.35;

    if (this.flame) {
      const pos = this.flame.geometry.attributes.position;
      this.parts.forEach((p, i) => {
        p.y += p.sp * dt;
        if (p.y > 2.6) { p.y = 0; p.a = Math.random() * 6.28; p.r = 0.18 + Math.random() * 0.42; }
        const taper = 1 - (p.y / 2.6) * 0.72;
        const wob = Math.sin(t * 6 + i) * 0.05;
        pos.setXYZ(i, Math.cos(p.a) * p.r * taper + wob, p.y, Math.sin(p.a) * p.r * taper);
      });
      pos.needsUpdate = true;
      this.flame.geometry.computeBoundingSphere();
      this.flame.material.size = 0.3 + Math.sin(t * 11) * 0.06;
      this.halo.material.opacity = 0.3 + Math.abs(Math.sin(t * 3.2)) * 0.28;
      this.halo.scale.setScalar(2.4 + Math.sin(t * 3.2) * 0.3);
    }
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group.removeFromParent();
  }
}

const SKIN_TONE = 0xf0c9a4;

/** 몸통 종류별 메시 구성 — 머리 꼭대기 높이와 팔다리 리그를 돌려준다 */
function buildSkin(skin, idx) {
  const G = geos();
  const g = new THREE.Group();
  const skinM = mat('skin', { color: SKIN_TONE, roughness: 0.75 });

  // ─────────────────────────────── 개미
  if (skin === 'ant') {
    const shell = ANT_COLORS[idx % ANT_COLORS.length];
    const bodyM = mat('ant' + (idx % ANT_COLORS.length), { color: shell, roughness: 0.5, metalness: 0.05 });
    const darkM = mat('antDark', { color: 0x2a211c, roughness: 0.7 });

    const rig = makeLimbs(g, {
      hip: 0.52, legGap: 0.12, legLen: 0.5, shoulder: 0.92, armGap: 0.22, armLen: 0.34,
      legMat: darkM, armMat: darkM, handMat: bodyM, thin: true,
    });

    const abdomen = new THREE.Mesh(G.ball, bodyM);
    abdomen.scale.set(0.33, 0.3, 0.4);
    abdomen.position.set(0, 0.82, -0.26);
    const thorax = new THREE.Mesh(G.ball, bodyM);
    thorax.scale.set(0.22, 0.21, 0.24);
    thorax.position.set(0, 0.98, 0.02);
    const head = new THREE.Mesh(G.ball, bodyM);
    head.scale.set(0.27, 0.26, 0.28);
    head.position.set(0, 1.3, 0.08);
    g.add(abdomen, thorax, head);

    const eyeW = mat('eyeW', { color: 0xf6f3ec, roughness: 0.4 });
    const eyeB = mat('eyeB', { color: 0x171310, roughness: 0.35 });
    for (const sx of [-0.11, 0.11]) {
      const e = new THREE.Mesh(G.ball, eyeW);
      e.scale.set(0.075, 0.095, 0.05);
      e.position.set(sx, 1.33, 0.32);
      const p = new THREE.Mesh(G.ball, eyeB);
      p.scale.setScalar(0.04);
      p.position.set(sx, 1.32, 0.35);
      g.add(e, p);
      const ant = new THREE.Mesh(G.antenna, darkM);
      ant.position.set(sx * 0.7, 1.55, 0.0);
      ant.rotation.z = sx > 0 ? -0.42 : 0.42;
      ant.rotation.x = -0.25;
      g.add(ant);
      const tip = new THREE.Mesh(G.ball, bodyM);
      tip.scale.setScalar(0.045);
      tip.position.set(sx * 1.25, 1.72, -0.05);
      g.add(tip);
    }
    return { group: g, headTop: 1.78, rig };
  }

  // ─────────────────────────────── 트럼프
  if (skin === 'trump') {
    const suitM = mat('t_suit', { color: 0x273350, roughness: 0.85, metalness: 0 });
    const shirtM = mat('t_shirt', { color: 0xf2f2ee, roughness: 0.8, metalness: 0 });
    const tieM = mat('t_tie', { color: 0xc0252f, roughness: 0.7, metalness: 0 });
    const hairM = mat('t_hair', { color: 0xdcc07a, roughness: 0.75, metalness: 0 });
    const shoeM = mat('t_shoe', { color: 0x16181f, roughness: 0.6 });

    const rig = makeLimbs(g, {
      hip: 0.56, legGap: 0.15, legLen: 0.52, shoulder: 1.06, armGap: 0.27, armLen: 0.42,
      legMat: suitM, armMat: suitM, handMat: skinM, footMat: shoeM,
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.62, 16), suitM);
    torso.position.y = 0.87;
    g.add(torso);
    const shoulders = new THREE.Mesh(G.ball, suitM);
    shoulders.scale.set(0.33, 0.14, 0.2);
    shoulders.position.y = 1.13;
    g.add(shoulders);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.05), shirtM);
    shirt.position.set(0, 1.0, 0.24);
    g.add(shirt);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.04), tieM);
    tie.position.set(0, 0.9, 0.27);
    g.add(tie);

    const head = new THREE.Mesh(G.ball, skinM);
    head.scale.set(0.29, 0.3, 0.27);
    head.position.y = 1.44;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 11, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    hair.scale.set(1.04, 0.92, 1.0);
    hair.position.set(0.01, 1.45, -0.01);
    g.add(hair);
    const swoop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.19), hairM);
    swoop.position.set(0.02, 1.63, 0.1);
    swoop.rotation.z = -0.16;
    g.add(swoop);

    // 얼굴에 새긴 황금 달러
    const buck = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.25),
      new THREE.MeshBasicMaterial({ map: emblemTexture('$', '#ffd24a', '#8a5f12'), transparent: true, depthWrite: false }),
    );
    buck.position.set(0, 1.42, 0.275);
    g.add(buck);
    return { group: g, headTop: 1.8, rig };
  }

  // ─────────────────────────────── 머스크
  if (skin === 'musk') {
    const jacketM = mat('m_jacket', { color: 0x1d1f26, roughness: 0.82, metalness: 0 });
    const hairM = mat('m_hair', { color: 0x2a2320, roughness: 0.8, metalness: 0 });
    const shoeM = mat('m_shoe', { color: 0x101217, roughness: 0.6 });

    const rig = makeLimbs(g, {
      hip: 0.56, legGap: 0.15, legLen: 0.52, shoulder: 1.06, armGap: 0.26, armLen: 0.42,
      legMat: jacketM, armMat: jacketM, handMat: skinM, footMat: shoeM,
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.62, 16), jacketM);
    torso.position.y = 0.87;
    g.add(torso);
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ map: emblemTexture('X', '#f2f2f2', '#000000'), transparent: true, depthWrite: false }),
    );
    logo.position.set(0, 0.95, 0.265);
    g.add(logo);

    const head = new THREE.Mesh(G.ball, skinM);
    head.scale.set(0.28, 0.3, 0.27);
    head.position.y = 1.44;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 11, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM);
    hair.scale.set(1.02, 0.84, 1.0);
    hair.position.set(0, 1.47, -0.02);
    g.add(hair);

    // 머리 위 빨간 테슬라 마크
    const teslaM = mat('m_tesla', { color: 0xe31937, roughness: 0.4, metalness: 0.1, emissive: 0x7a0c1c, emissiveIntensity: 0.8 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.05), teslaM);
    bar.position.set(0, 1.92, 0);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.05), teslaM);
    stem.position.set(0, 1.81, 0);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.042, 0.05), teslaM);
    wingL.position.set(-0.15, 1.88, 0);
    wingL.rotation.z = 0.55;
    const wingR = wingL.clone();
    wingR.position.x = 0.15;
    wingR.rotation.z = -0.55;
    g.add(bar, stem, wingL, wingR);
    return { group: g, headTop: 2.04, rig };
  }

  // ─────────────────────────────── 일반 신자
  const robeM = mat('robe' + idx, { color: ROBE_COLORS[idx], roughness: 0.82, metalness: 0.02 });
  const trouserM = mat('trouser' + idx, { color: shade(ROBE_COLORS[idx], 0.62), roughness: 0.85 });
  const shoeM = mat('b_shoe', { color: 0x2a211c, roughness: 0.7 });

  const rig = makeLimbs(g, {
    hip: 0.56, legGap: 0.14, legLen: 0.52, shoulder: 1.04, armGap: 0.25, armLen: 0.4,
    legMat: trouserM, armMat: robeM, handMat: skinM, footMat: shoeM,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.6, 16), robeM);
  body.position.y = 0.86;
  g.add(body);
  const shoulders = new THREE.Mesh(G.ball, robeM);
  shoulders.scale.set(0.3, 0.13, 0.19);
  shoulders.position.y = 1.11;
  g.add(shoulders);
  // 목도리 모양 스톨
  const stole = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.26), mat('stole', { color: 0xe3d2a4, roughness: 0.85 }));
  stole.position.y = 1.15;
  g.add(stole);

  const head = new THREE.Mesh(G.ball, skinM);
  head.scale.set(0.28, 0.29, 0.27);
  head.position.y = 1.42;
  g.add(head);
  const hairM = mat('b_hair' + idx, { color: 0x30271f, roughness: 0.85 });
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 11, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM);
  hair.scale.set(1.02, 0.8, 1.0);
  hair.position.set(0, 1.44, -0.01);
  g.add(hair);
  const eyeB = mat('eyeB', { color: 0x171310, roughness: 0.35 });
  for (const sx of [-0.1, 0.1]) {
    const e = new THREE.Mesh(G.ball, eyeB);
    e.scale.set(0.028, 0.04, 0.02);
    e.position.set(sx, 1.43, 0.265);
    g.add(e);
  }

  return { group: g, headTop: 1.76, rig };
}

/** 색을 어둡게 */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

let shadowMat;

export class Avatar {
  constructor(world, id, nick, skin) {
    shadowMat ||= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });

    this.id = id;
    this.nick = nick;
    this.skin = skin || 'believer';
    this.group = new THREE.Group();

    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

    const built = buildSkin(this.skin, h % ROBE_COLORS.length);
    this.pivot = built.group;
    this.pivot.scale.setScalar(AV_SCALE);
    this.headTop = built.headTop * AV_SCALE;
    this.rig = built.rig || {};
    this.group.add(this.pivot);

    this.shadow = new THREE.Mesh(geos().shadow, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.scale.setScalar(AV_SCALE);
    this.group.add(this.shadow);

    this.target = new THREE.Vector3();
    this.targetRy = 0;
    this.state = 0;
    this.rank = -1;
    this.item = null;
    this.aura = null;
    this.actT = -1;         // 상승/하락 기원 절하기
    this.actDir = 1;
    this.phase = Math.random() * 6.28;
    world.scene.add(this.group);
  }

  setPose(x, y, z, ry, st) {
    this.target.set(x, y, z);
    this.targetRy = ry;
    this.state = st;
    if ((st === 5 || st === 6) && this.actT < 0) { this.actT = 0; this.actDir = st === 5 ? 1 : -1; }
  }

  wish(dir) { this.actT = 0; this.actDir = dir; }

  /** 직위가 바뀌면 손에 든 물건과 오라를 갈아 끼운다 */
  setRank(tier) {
    tier = Math.max(0, Math.min(9, tier | 0));
    if (tier === this.rank) return;
    this.rank = tier;

    if (this.item) { this.item.removeFromParent(); this.item = null; }
    const hand = this.rig?.handR;
    if (hand) {
      const it = buildRankItem(tier);
      if (it) { hand.add(it); this.item = it; }
    }

    if (this.aura) { this.aura.dispose(); this.aura = null; }
    if (tier >= 6) {
      this.aura = new Aura(tier);
      this.pivot.add(this.aura.group);
    }
  }

  update(dt, snap = false) {
    const g = this.group;
    if (snap) g.position.copy(this.target);
    else g.position.lerp(this.target, Math.min(1, dt * 12));

    let dr = this.targetRy - g.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    g.rotation.y += dr * Math.min(1, dt * 12);

    const walking = this.state === 1;
    const airborne = this.state === 2;
    this.phase += dt * (walking ? 11 : 2.2);
    const bob = walking ? Math.abs(Math.sin(this.phase)) * 0.07 : 0;
    this.pivot.position.y = bob;
    this.pivot.rotation.z = walking ? Math.sin(this.phase) * 0.05 : 0;

    // 팔다리 스윙
    const r = this.rig;
    if (r.legL) {
      const k = Math.min(1, dt * 14);
      let ll = 0, lr = 0, al = 0, ar = 0;
      if (airborne) { ll = -0.55; lr = 0.3; al = -0.9; ar = -0.9; }
      else if (walking) {
        const sw = Math.sin(this.phase) * 0.62;
        ll = sw; lr = -sw; al = -sw * 0.8; ar = sw * 0.8;
      } else if (this.state === 4) {              // 청소: 팔만 문지르기
        al = ar = -1.1 + Math.sin(this.phase * 3.4) * 0.35;
      } else if (this.state === 3) {              // 기도: 두 손 모으기
        al = ar = -1.25;
      } else {
        const idle = Math.sin(this.phase) * 0.05;
        al = idle; ar = -idle;
      }
      r.legL.rotation.x += (ll - r.legL.rotation.x) * k;
      r.legR.rotation.x += (lr - r.legR.rotation.x) * k;
      r.armL.rotation.x += (al - r.armL.rotation.x) * k;
      r.armR.rotation.x += (ar - r.armR.rotation.x) * k;
    }

    if (this.aura) this.aura.update(dt);
    if (this.item?.userData.glow) {
      const gl = this.item.userData.glow;
      const f = 0.8 + Math.sin(this.phase * 1.7) * 0.2;
      if (gl.material.opacity !== undefined) gl.material.opacity = 0.55 + f * 0.35;
      gl.scale.setScalar((gl.isSprite ? 0.8 : 1) * f + (gl.isSprite ? 0 : 0.1));
    }

    // 기원 절하기 (상승=앞으로 깊게, 하락=뒤로 젖힘)
    let bow = 0;
    if (this.actT >= 0) {
      this.actT += dt;
      const T = 0.55;
      if (this.actT >= T) this.actT = -1;
      else bow = Math.sin((this.actT / T) * Math.PI) * 0.95 * this.actDir;
    }

    let want = bow;
    if (this.state === 3) want = 0.55;
    else if (this.state === 4) want = 0.22 + Math.sin(this.phase * 1.6) * 0.14;
    this.pivot.rotation.x += (want - this.pivot.rotation.x) * Math.min(1, dt * (bow ? 16 : 7));
  }

  dispose(scene) {
    if (this.aura) this.aura.dispose();
    scene.remove(this.group);
  }
}

/* ══════════════════════════════════════════════════ 월드 */

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.85));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f18);
    this.scene.fog = new THREE.Fog(0x0d0f18, 40, 78);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.35, 120);
    this.camYaw = 0;
    this.camPitch = 0.3;
    this.camDist = 7.6;
    this.camPos = new THREE.Vector3(0, 5, 13);

    this.panels = [];
    this.signs = [];
    this.avatars = new Map();
    this.mucks = [];
    this.splats = new Map();
    this.platforms = [];
    this.flames = [];
    this.dirt = 0;
    this.shake = 0;

    this._buildLights();
    this._buildRoom();
    this._buildStatue();
    this._buildPanels();
    this._buildPews();
    this._buildPyramids();
    this._buildConfessional();
    this._buildFurniture();
    this._buildAim();

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  addPlatform(cx, cz, w, d, top) {
    this.platforms.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, top });
  }

  /** (x,z) 에서 발이 닿는 높이 */
  groundAt(x, z) {
    let g = 0;
    if (Math.hypot(x, z) < 4.95) g = 0.34;                // 중앙 단
    for (const p of this.platforms) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top > g) g = p.top;
    }
    return g;
  }

  /* ───────── 조명 */
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xc3cdff, 0x3a2d1e, 0.8));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const spot = new THREE.SpotLight(0xffe9c0, 320, 26, 0.6, 0.6, 1.5);
    spot.position.set(0, 13.5, 0.6);
    spot.target.position.set(0, 2.4, 0);
    this.scene.add(spot, spot.target);

    const key = new THREE.SpotLight(0xfff0d2, 160, 22, 0.75, 0.8, 1.4);
    key.position.set(2.5, 7, 7.5);
    key.target.position.set(0, 2.6, 0);
    this.scene.add(key, key.target);

    const rim = new THREE.PointLight(0x9bb8ff, 45, 18, 2);
    rim.position.set(-3.5, 5.5, -5);
    this.scene.add(rim);

    for (const [x, z] of [[-10.6, -10.6], [10.6, -10.6], [-10.6, 10.6], [10.6, 10.6]]) {
      const p = new THREE.PointLight(0xffc877, 55, 22, 2);
      p.position.set(x, 8.4, z);
      this.scene.add(p);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd79a }));
      bulb.position.copy(p.position);
      this.scene.add(bulb);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 5), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
      wire.position.set(x, 10.5, z);
      this.scene.add(wire);
    }
  }

  /* ───────── 예배당 */
  _buildRoom() {
    const S = 32, HGT = 13;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a1d13, transparent: true, opacity: 0.8 });
    const pts = [];
    for (let i = -S / 2; i <= S / 2; i += 1.6) pts.push(i, 0.012, -S / 2, i, 0.012, S / 2);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(lg, lineMat));

    const dais = new THREE.Mesh(
      new THREE.CylinderGeometry(4.0, 4.4, 0.34, 40),
      new THREE.MeshStandardMaterial({ color: 0x53402c, roughness: 0.85 }),
    );
    dais.position.y = 0.17;
    this.scene.add(dais);
    const carpet = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 40),
      new THREE.MeshStandardMaterial({ color: 0x6e1f24, roughness: 0.95 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.37;
    this.scene.add(carpet);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x343341, roughness: 0.95, side: THREE.DoubleSide });
    const half = S / 2;
    const walls = [
      [0, HGT / 2, -half, 0],
      [0, HGT / 2, half, Math.PI],
      [-half, HGT / 2, 0, Math.PI / 2],
      [half, HGT / 2, 0, -Math.PI / 2],
    ];
    for (const [x, y, z, ry] of walls) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(S, HGT), wallMat);
      w.position.set(x, y, z);
      w.rotation.y = ry;
      this.scene.add(w);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(S, 1.7, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.88 }),
      );
      base.position.set(x, 0.85, z);
      base.rotation.y = ry;
      base.translateZ(0.16);
      this.scene.add(base);
    }

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 1 }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = HGT;
    this.scene.add(ceil);

    const beamMat = new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 0.9 });
    for (let i = -3; i <= 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(S, 0.5, 0.42), beamMat);
      b.position.set(0, HGT - 0.4, i * 4);
      this.scene.add(b);
    }

    const glassColors = [0xd94f4f, 0x4f7fd9, 0x51b06a, 0xd9ad4f, 0x9a5fd9];
    let gi = 0;
    for (const [x, , z, ry] of walls) {
      for (const off of [-12, 12]) {
        const g = new THREE.Group();
        g.position.set(x, 7.0, z);
        g.rotation.y = ry;
        g.translateX(off);
        g.translateZ(0.25);
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 2; c++) {
            const q = new THREE.Mesh(
              new THREE.PlaneGeometry(0.85, 0.85),
              new THREE.MeshBasicMaterial({ color: glassColors[(gi++) % glassColors.length], transparent: true, opacity: 0.85 }),
            );
            q.position.set((c - 0.5) * 0.95, (1.5 - r) * 0.95, 0);
            g.add(q);
          }
        }
        const arch = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xf2d98a }));
        arch.position.y = 1.95;
        g.add(arch);
        this.scene.add(g);
        const lamp = new THREE.PointLight(glassColors[gi % glassColors.length], 22, 13, 2);
        lamp.position.set(g.position.x, 6.6, g.position.z);
        this.scene.add(lamp);
      }
    }

    const crossMat = new THREE.MeshStandardMaterial({
      color: 0xe8b949, emissive: 0x7a5a16, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3,
    });
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.6, 0.26), crossMat);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.26), crossMat);
    cv.position.set(0, 10.6, -15.7);
    ch.position.set(0, 11.4, -15.7);
    this.scene.add(cv, ch);
  }

  /* ───────── 트럼프 동상 */
  _buildStatue() {
    const g = new THREE.Group();
    this.statueMats = [];
    const gold = (c = 0xd9ab45, rough = 0.34) => {
      const m = new THREE.MeshStandardMaterial({ color: c, metalness: 0.66, roughness: rough, envMapIntensity: 1.05 });
      m.userData.base = new THREE.Color(c);
      this.statueMats.push(m);
      return m;
    };

    // 좌대 — 넓으면 낮은 시점에서 다리를 가려서 좁고 낮게
    const marble = new THREE.MeshStandardMaterial({ color: 0xd6cebb, roughness: 0.5, metalness: 0.08 });
    const p0 = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.68, 0.26, 32), marble); p0.position.y = 0.47;
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.44, 0.4, 32), marble); p1.position.y = 0.8;
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.22, 32), marble); p2.position.y = 1.11;
    g.add(p0, p1, p2);
    const BASE = 1.22;

    const nameplate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.36),
      new THREE.MeshStandardMaterial({ map: makePlateTexture('트 황 상', 'TRUMP HWANG'), metalness: 0.72, roughness: 0.34, envMapIntensity: 1.1 }),
    );
    nameplate.position.set(0, 0.84, 1.38);
    g.add(nameplate);

    const bodyG = new THREE.Group();
    bodyG.position.y = BASE;

    const suit = gold(0xc99c3c, 0.38);
    const skin = gold(0xe0b964, 0.44);
    const hair = gold(0xeed287, 0.36);
    const shirtM = gold(0xeee0bd, 0.5);
    const tieM = gold(0xb4702a, 0.4);
    const darkM = gold(0x66480f, 0.55);
    const shoeM = gold(0x7a581b, 0.45);

    for (const sx of [-0.27, 0.27]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.2, 1.42, 16), suit);
      leg.position.set(sx, 0.86, 0);
      bodyG.add(leg);
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.26, 5, 12), shoeM);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1, 1, 0.6);
      shoe.position.set(sx, 0.15, 0.11);
      bodyG.add(shoe);
    }

    // 상의 — 어깨 넓고 허리 좁은 실루엣을 뽑아 모서리를 둥글린다
    const sh = new THREE.Shape();
    sh.moveTo(-0.58, 0);
    sh.lineTo(-0.63, 0.5);
    sh.quadraticCurveTo(-0.8, 0.95, -0.82, 1.28);
    sh.quadraticCurveTo(-0.83, 1.5, -0.6, 1.53);
    sh.lineTo(-0.27, 1.57);
    sh.quadraticCurveTo(0, 1.63, 0.27, 1.57);
    sh.lineTo(0.6, 1.53);
    sh.quadraticCurveTo(0.83, 1.5, 0.82, 1.28);
    sh.quadraticCurveTo(0.8, 0.95, 0.63, 0.5);
    sh.lineTo(0.58, 0);
    sh.closePath();
    const jacketGeo = new THREE.ExtrudeGeometry(sh, {
      depth: 0.5, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.1, bevelSegments: 4, curveSegments: 14,
    });
    jacketGeo.translate(0, 0, -0.25);
    const jacket = new THREE.Mesh(jacketGeo, suit);
    jacket.position.y = 1.4;
    bodyG.add(jacket);
    const FRONT = 0.34;

    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.92, 0.08), shirtM);
    shirt.position.set(0, 2.52, FRONT + 0.03);
    bodyG.add(shirt);
    for (const sx of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.96, 0.07), suit);
      lapel.position.set(sx * 0.27, 2.54, FRONT + 0.05);
      lapel.rotation.z = sx * 0.2;
      bodyG.add(lapel);
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.15, 16), shirtM);
    collar.position.set(0, 3.0, 0.03);
    bodyG.add(collar);

    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.1), tieM);
    knot.position.set(0, 2.93, FRONT + 0.09);
    bodyG.add(knot);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.72, 4), tieM);
    tie.rotation.y = Math.PI / 4;
    tie.scale.z = 0.42;
    tie.position.set(0, 2.5, FRONT + 0.09);
    bodyG.add(tie);
    const tieTip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 4), tieM);
    tieTip.rotation.set(Math.PI, Math.PI / 4, 0);
    tieTip.scale.z = 0.42;
    tieTip.position.set(0, 2.03, FRONT + 0.09);
    bodyG.add(tieTip);

    // 가슴 명판 「트황」
    const plateFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.48, 0.07), gold(0x8b6820, 0.4));
    plateFrame.position.set(0, 1.78, FRONT + 0.03);
    bodyG.add(plateFrame);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.4),
      new THREE.MeshStandardMaterial({ map: makePlateTexture('트황'), metalness: 0.78, roughness: 0.3, envMapIntensity: 1.2 }),
    );
    plate.position.set(0, 1.78, FRONT + 0.095);
    bodyG.add(plate);

    const mkArm = () => {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.5, 5, 12), suit);
      upper.position.y = -0.33;
      const fore = new THREE.Group();
      fore.position.y = -0.64;
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.44, 5, 12), suit);
      f.position.y = -0.3;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.07, 14), shirtM);
      cuff.position.y = -0.55;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
      hand.position.y = -0.68;
      fore.add(f, cuff, hand);
      arm.add(upper, fore);
      arm.userData = { fore };
      return arm;
    };

    const armL = mkArm();
    armL.position.set(-0.74, 2.8, 0.02);
    armL.rotation.z = -0.16;
    armL.userData.fore.rotation.z = -0.1;
    bodyG.add(armL);

    const armR = mkArm();
    armR.position.set(0.74, 2.8, 0.04);
    armR.rotation.z = 2.5;
    armR.userData.fore.rotation.z = -0.45;
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.17, 4, 10), skin);
    thumb.position.y = -0.86;
    armR.userData.fore.add(thumb);
    bodyG.add(armR);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.26, 16), skin);
    neck.position.y = 3.07;
    bodyG.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 26, 20), skin);
    head.scale.set(1.0, 1.05, 0.93);
    head.position.y = 3.52;
    bodyG.add(head);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 14), skin);
    jaw.scale.set(1.09, 0.74, 0.96);
    jaw.position.set(0, 3.27, 0.05);
    bodyG.add(jaw);

    for (const sx of [-0.17, 0.17]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.038, 0.03), darkM);
      eye.position.set(sx, 3.57, 0.4);
      bodyG.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.042, 0.03), darkM);
      brow.position.set(sx, 3.66, 0.4);
      brow.rotation.z = sx > 0 ? -0.12 : 0.12;
      bodyG.add(brow);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), darkM);
    mouth.scale.set(1.4, 0.72, 0.5);
    mouth.position.set(0, 3.26, 0.38);
    bodyG.add(mouth);

    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairBack.scale.set(1.08, 0.88, 1.07);
    hairBack.position.set(0, 3.5, -0.04);
    bodyG.add(hairBack);
    const swoop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    swoop.scale.set(1.2, 0.52, 0.92);
    swoop.position.set(0.04, 3.74, 0.1);
    swoop.rotation.set(-0.2, 0, -0.16);
    bodyG.add(swoop);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.16, 0.3), hair);
    fringe.position.set(0.03, 3.72, 0.26);
    fringe.rotation.set(0.24, 0, -0.14);
    bodyG.add(fringe);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), hair);
      wing.scale.set(0.55, 1.0, 1.1);
      wing.position.set(sx * 0.42, 3.5, -0.02);
      bodyG.add(wing);
    }

    bodyG.scale.setScalar(1.14);
    g.add(bodyG);
    this.statue = g;
    this.statueBody = bodyG;
    this.statueHome = { x: 0, y: BASE, rz: 0 };
    this.fall = null;
    this.fallen = false;
    this.scene.add(g);

    this._buildFilth();
    this._buildSun();

    for (const sx of [-3.1, 3.1]) {
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.22, 1.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x7b6128, metalness: 0.8, roughness: 0.4 }),
      );
      stand.position.set(sx, 1.1, 1.4);
      this.scene.add(stand);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd089 }));
      flame.position.set(sx, 1.95, 1.4);
      flame.scale.y = 1.7;
      this.scene.add(flame);
      const fl = new THREE.PointLight(0xffb15c, 26, 9, 2);
      fl.position.copy(flame.position);
      this.scene.add(fl);
      this.flames.push({ mesh: flame, light: fl, p: Math.random() * 6 });
    }
  }

  /* ───────── 오염 연출: 덩어리 · 바닥 더미 · 머리 위 똥 · 파리 */
  _buildFilth() {
    const G = geos();
    const poo = new THREE.MeshStandardMaterial({ color: 0x4a3015, roughness: 1, metalness: 0 });
    const poo2 = new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 1, metalness: 0 });

    // 몸에 들러붙는 덩어리 22개 (고정 난수로 배치)
    this.blobs = [];
    let seed = 1337;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 1.9 + rnd() * 3.6;
      const r = y > 4.7 ? 0.52 : 0.95;
      const m = new THREE.Mesh(G.ball, i % 2 ? poo : poo2);
      m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      m.scale.set(0.2 + rnd() * 0.17, 0.14 + rnd() * 0.12, 0.2 + rnd() * 0.17);
      m.visible = false;
      this.statue.add(m);
      this.blobs.push(m);
    }

    // 좌대 둘레 더미
    this.pile = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(G.ball, i % 2 ? poo : poo2);
      m.position.set(Math.cos(a) * (1.15 + Math.random() * 0.4), 0.42 + Math.random() * 0.2, Math.sin(a) * (1.15 + Math.random() * 0.4));
      m.scale.set(0.42, 0.26, 0.42);
      this.pile.add(m);
    }
    this.pile.visible = false;
    this.statue.add(this.pile);

    // 머리 위 똥 (소프트아이스크림)
    this.poopHat = new THREE.Group();
    const tiers = [[0.52, 0.2, 5.62], [0.38, 0.17, 5.82], [0.24, 0.14, 5.98]];
    for (const [r, h, y] of tiers) {
      const m = new THREE.Mesh(G.ball, poo);
      m.scale.set(r, h, r);
      m.position.y = y;
      this.poopHat.add(m);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 10), poo);
    tip.position.y = 6.16;
    this.poopHat.add(tip);
    this.poopHat.visible = false;
    this.statue.add(this.poopHat);

    // 무너진 뒤 남는 거대한 똥더미
    this.ruin = new THREE.Group();
    const ruinTiers = [[2.1, 0.46, 0.62], [1.62, 0.42, 1.38], [1.15, 0.38, 2.0], [0.7, 0.3, 2.5]];
    for (const [r, h, y] of ruinTiers) {
      const m = new THREE.Mesh(G.ball, poo);
      m.scale.set(r, h, r);
      m.position.y = y;
      this.ruin.add(m);
    }
    const swirl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 12), poo);
    swirl.position.y = 3.0;
    this.ruin.add(swirl);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const d = 2.1 + Math.random() * 1.1;
      const m = new THREE.Mesh(G.ball, i % 2 ? poo : poo2);
      m.position.set(Math.cos(a) * d, 0.18 + Math.random() * 0.16, Math.sin(a) * d);
      m.scale.set(0.3 + Math.random() * 0.3, 0.16, 0.3 + Math.random() * 0.3);
      this.ruin.add(m);
    }
    this.ruin.visible = false;
    this.scene.add(this.ruin);

    // 파리
    this.flies = [];
    const flyMat = new THREE.MeshBasicMaterial({ color: 0x15110a });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(G.ball, flyMat);
      m.scale.setScalar(0.045);
      m.visible = false;
      this.statue.add(m);
      this.flies.push({ mesh: m, a: Math.random() * 6.28, y: 2 + Math.random() * 3.4, r: 1.3 + Math.random() * 0.8, sp: 1.6 + Math.random() * 1.8 });
    }
  }

  /* ───────── 머리 위 기원 태양 (수치가 오를수록 나이트처럼 번쩍인다) */
  _buildSun() {
    const g = new THREE.Group();
    g.position.set(0, 7.0, 0);
    const tex = makeGlowTexture();
    const ADD = THREE.AdditiveBlending;

    this.sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 22, 18),
      new THREE.MeshBasicMaterial({ color: 0x9aa0ad, transparent: true, opacity: 0.55 }),
    );
    g.add(this.sunCore);

    this.sunGlowIn = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0x9aa0ad, transparent: true, opacity: 0.4, depthWrite: false, blending: ADD,
    }));
    this.sunGlowOut = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0x9aa0ad, transparent: true, opacity: 0.18, depthWrite: false, blending: ADD,
    }));
    g.add(this.sunGlowIn, this.sunGlowOut);

    // 후광 고리 2개 (서로 반대로 돈다)
    this.sunRings = [];
    for (const [r, tb, tilt] of [[1.0, 0.035, 0.35], [1.45, 0.025, -0.6]]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, tb, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0x9aa0ad, transparent: true, opacity: 0.35, blending: ADD, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2 + tilt;
      g.add(ring);
      this.sunRings.push(ring);
    }

    // 뾰족한 빛살
    this.sunRays = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const long = i % 2 === 0;
      const ray = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, long ? 0.95 : 0.55, 4),
        new THREE.MeshBasicMaterial({ color: 0x9aa0ad, transparent: true, opacity: 0.5, blending: ADD, depthWrite: false }),
      );
      const d = 0.55 + (long ? 0.48 : 0.28);
      ray.position.set(Math.cos(a) * d, Math.sin(a) * d, 0);
      ray.rotation.z = a - Math.PI / 2;
      this.sunRays.add(ray);
    }
    g.add(this.sunRays);

    // 클럽 조명 빔 — 수치가 높을 때만 켜진다
    this.sunBeams = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 16, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x9aa0ad, transparent: true, opacity: 0.1, blending: ADD, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.set(0, -8, 0);
      beam.rotation.z = Math.sin(a) * 0.5;
      beam.rotation.x = Math.cos(a) * 0.5;
      const holder = new THREE.Group();
      holder.rotation.y = a;
      holder.add(beam);
      this.sunBeams.add(holder);
    }
    this.sunBeams.visible = false;
    g.add(this.sunBeams);

    // 반짝이는 입자
    const N = 60;
    const pos = new Float32Array(N * 3);
    this.sparkSeed = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const r = 1.3 + Math.random() * 1.6;
      this.sparkSeed.push({ a, b, r, p: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6 });
      pos[i * 3] = Math.sin(b) * Math.cos(a) * r;
      pos[i * 3 + 1] = Math.cos(b) * r;
      pos[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      map: tex, color: 0xffffff, size: 0.3, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, blending: ADD,
    }));
    g.add(this.sparks);

    this.sunLight = new THREE.PointLight(0xffffff, 0, 26, 2);
    g.add(this.sunLight);

    this.sun = g;
    this.sunMag = 0;
    this.sunColor = new THREE.Color(0x9aa0ad);
    this.scene.add(g);
  }

  setWish(bull, bear) {
    const diff = bull - bear;
    const mag = Math.min(1, Math.abs(diff) / 120);
    this.sunMag = mag;
    const col = new THREE.Color(diff > 0 ? 0xff2d20 : diff < 0 ? 0x2f7bff : 0x9aa0ad);
    this.sunColor.copy(col);

    this.sunCore.material.color.copy(col);
    this.sunCore.scale.setScalar(0.8 + mag * 0.9);
    this.sunGlowIn.material.color.copy(col);
    this.sunGlowOut.material.color.copy(col);
    for (const r of this.sunRings) {
      r.material.color.copy(col);
      r.material.opacity = 0.2 + mag * 0.65;
    }
    for (const r of this.sunRays.children) {
      r.material.color.copy(col);
      r.material.opacity = 0.3 + mag * 0.7;
      r.scale.setScalar(0.8 + mag * 0.7);
    }
    for (const h of this.sunBeams.children) h.children[0].material.color.copy(col);
    this.sunBeams.visible = mag > 0.25;
    this.sparks.material.color.copy(col).lerp(new THREE.Color(0xffffff), 0.45);
    this.sunLight.color.copy(col);
  }

  _updateSun(dt) {
    const m = this.sunMag;
    const t = performance.now() / 1000;

    // 수치가 높을수록 빠르게 번쩍
    const strobe = m > 0.5 ? (Math.sin(t * (8 + m * 26)) > 0.1 ? 1 : 0.35) : 1;
    const pulse = 1 + Math.sin(t * (1.8 + m * 5)) * (0.05 + m * 0.14);

    this.sunGlowIn.scale.setScalar((1.5 + m * 2.6) * pulse);
    this.sunGlowIn.material.opacity = (0.3 + m * 0.6) * strobe;
    this.sunGlowOut.scale.setScalar((2.8 + m * 6.2) * pulse);
    this.sunGlowOut.material.opacity = (0.12 + m * 0.42) * strobe;
    this.sunCore.material.opacity = (0.5 + m * 0.5) * strobe;

    this.sunRings[0].rotation.z += dt * (0.5 + m * 3.2);
    this.sunRings[1].rotation.z -= dt * (0.35 + m * 2.4);
    this.sunRays.rotation.z += dt * (0.3 + m * 2.6);

    if (this.sunBeams.visible) {
      this.sunBeams.rotation.y += dt * (0.5 + m * 2.6);
      const o = (0.04 + m * 0.16) * strobe;
      for (const h of this.sunBeams.children) h.children[0].material.opacity = o;
    }

    this.sparks.material.opacity = Math.max(0, (m - 0.15)) * 1.3;
    this.sparks.rotation.y += dt * (0.4 + m * 1.8);
    this.sparks.material.size = 0.22 + Math.sin(t * 9) * 0.07 + m * 0.14;

    this.sunLight.intensity = (18 + m * 300) * strobe;
  }

  /* ───────── 전광판 8개 */
  _buildPanels() {
    const Y = 6.5, D = 15.7, OFF = 5.2;
    const spots = [
      [new THREE.Vector3(-OFF, Y, -D), 0],
      [new THREE.Vector3(OFF, Y, -D), 0],
      [new THREE.Vector3(OFF, Y, D), Math.PI],
      [new THREE.Vector3(-OFF, Y, D), Math.PI],
      [new THREE.Vector3(D, Y, OFF), -Math.PI / 2],
      [new THREE.Vector3(D, Y, -OFF), -Math.PI / 2],
      [new THREE.Vector3(-D, Y, -OFF), Math.PI / 2],
      [new THREE.Vector3(-D, Y, OFF), Math.PI / 2],
    ];
    for (const [pos, ry] of spots) this.panels.push(new Panel(this, pos, ry, 8.8, 5.0));
  }

  /* ───────── 장의자 (점프해서 올라갈 수 있다) */
  _buildPews() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3c22, roughness: 0.85 });
    const mk = (len) => {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.7), wood);
      seat.position.y = 0.58;
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.72, 0.14), wood);
      back.position.set(0, 0.94, -0.3);
      g.add(seat, back);
      for (const sx of [-len / 2 + 0.3, 0, len / 2 - 0.3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.56), wood);
        leg.position.set(sx, 0.29, 0);
        g.add(leg);
      }
      return g;
    };
    for (let r = 0; r < 3; r++) {
      for (const side of [-1, 1]) {
        const cx = side * (6.3 + r * 1.9);
        const p = mk(7.4);
        p.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        p.position.set(cx, 0, 0);
        this.scene.add(p);
        this.addPlatform(cx, 0, 0.8, 7.4, 0.66);     // 앉는 판 위에 설 수 있다
      }
    }
  }

  /* ───────── 네 구석 피라미드 기도단 */
  _buildPyramids() {
    const stone = new THREE.MeshStandardMaterial({ color: 0xa89a7e, roughness: 0.9 });
    const stone2 = new THREE.MeshStandardMaterial({ color: 0x8e8168, roughness: 0.92 });
    const levels = [
      { half: 2.5, top: 0.8 },
      { half: 1.9, top: 1.6 },
      { half: 1.35, top: 2.4 },
      { half: 0.85, top: 3.2 },
    ];

    for (const [cx, cz] of [[-10.6, -10.6], [10.6, -10.6], [-10.6, 10.6], [10.6, 10.6]]) {
      levels.forEach((lv, i) => {
        const h = 0.8;
        const m = new THREE.Mesh(new THREE.BoxGeometry(lv.half * 2, h, lv.half * 2), i % 2 ? stone2 : stone);
        m.position.set(cx, lv.top - h / 2, cz);
        this.scene.add(m);
        this.addPlatform(cx, cz, lv.half * 2, lv.half * 2, lv.top);
      });
      this.signs.push(new Sign(this, cx, cz, 4.35));
    }
  }

  /* ───────── 고해소 + 기록판 */
  _buildConfessional() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4e3317, roughness: 0.88 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14100b, roughness: 1 });

    const bx = -12.6, bz = -3.8;
    const booth = new THREE.Group();
    booth.position.set(bx, 0, bz);
    booth.rotation.y = Math.PI / 2;

    const shell = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.1, 2.2), wood);
    shell.position.y = 1.55;
    booth.add(shell);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), dark);
    door.position.set(0, 1.15, 1.11);
    booth.add(door);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x6e1f24, roughness: 0.95 }));
    curtain.position.set(0, 1.15, 1.13);
    curtain.scale.x = 0.9;
    booth.add(curtain);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 2.6), wood);
    roof.position.y = 3.2;
    booth.add(roof);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xe8b949, metalness: 0.7, roughness: 0.35 });
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), crossMat);
    cv.position.y = 3.65;
    const chh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), crossMat);
    chh.position.y = 3.78;
    booth.add(cv, chh);
    this.scene.add(booth);
    this.addPlatform(bx, bz, 2.3, 2.7, 3.1);      // 통과 불가

    const lamp = new THREE.PointLight(0xffb15c, 24, 10, 2);
    lamp.position.set(bx + 1.6, 2.4, bz);
    this.scene.add(lamp);

    this.confess = new ConfessBoard(this, -12.6, 2.6, Math.PI / 2);
    this.addPlatform(-12.6, 2.6, 0.5, 6.9, 4.9);
  }

  /* ───────── 예배당 집기 */
  _buildFurniture() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d1f, roughness: 0.85 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3d2813, roughness: 0.88 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xcdc4b0, roughness: 0.75 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a32, metalness: 0.85, roughness: 0.35 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x6e1f24, roughness: 0.95 });

    // ── 기둥 4개
    for (const [cx, cz] of [[-14.3, -7.6], [14.3, -7.6], [-14.3, 7.6], [14.3, 7.6]]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 10, 14), stone);
      col.position.set(cx, 5, cz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), stone);
      cap.position.set(cx, 10.1, cz);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), stone);
      foot.position.set(cx, 0.25, cz);
      this.scene.add(col, cap, foot);
      this.addPlatform(cx, cz, 1.0, 1.0, 10);
    }

    // ── 파이프오르간 (동상 뒤 북쪽 벽)
    const organ = new THREE.Group();
    organ.position.set(0, 0, -15.1);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.2, 1.1), darkWood);
    cab.position.y = 1.1;
    organ.add(cab);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.2, 1.4), wood);
    ledge.position.y = 2.3;
    organ.add(ledge);
    for (let i = 0; i < 15; i++) {
      const t = Math.abs(i - 7) / 7;
      const h = 5.4 - t * 2.6;
      const r = 0.2 - t * 0.055;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), brass);
      pipe.position.set((i - 7) * 0.47, 2.4 + h / 2, 0);
      organ.add(pipe);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.6, 12), brass);
      tip.position.set((i - 7) * 0.47, 2.4 + h + r * 0.8, 0);
      organ.add(tip);
    }
    this.scene.add(organ);
    this.addPlatform(0, -15.1, 7.2, 1.4, 2.4);

    // ── 강대상
    const pulpit = new THREE.Group();
    pulpit.position.set(-3.4, 0, 3.4);
    pulpit.rotation.y = 0.5;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.46, 1.1, 12), wood);
    stem.position.y = 0.55;
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.76), wood);
    deskTop.position.y = 1.18;
    deskTop.rotation.x = -0.22;
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.07, 0.4), new THREE.MeshStandardMaterial({ color: 0xf0e9d6, roughness: 0.9 }));
    book.position.set(0, 1.28, 0.02);
    book.rotation.x = -0.22;
    pulpit.add(stem, deskTop, book);
    this.scene.add(pulpit);
    this.addPlatform(-3.4, 3.4, 1.1, 1.0, 1.25);

    // ── 성찬대 + 촛대 + 잔
    const table = new THREE.Group();
    table.position.set(3.4, 0, 3.4);
    table.rotation.y = -0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.9), wood);
    top.position.y = 0.92;
    table.add(top);
    const drape = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 0.86), cloth);
    drape.position.y = 0.55;
    table.add(drape);
    for (const sx of [-0.85, 0.85]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.42, 10), brass);
      c.position.set(sx, 1.2, 0);
      table.add(c);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd089 }));
      fl.position.set(sx, 1.46, 0);
      fl.scale.y = 1.7;
      table.add(fl);
      this.flames.push({ mesh: fl, light: { intensity: 0 }, p: Math.random() * 6 });
    }
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.2, 12), brass);
    cup.position.set(0, 1.09, 0);
    table.add(cup);
    this.scene.add(table);
    this.addPlatform(3.4, 3.4, 2.2, 1.0, 1.0);

    // ── 성가대석 (동상 뒤 계단식)
    for (let i = 0; i < 2; i++) {
      const z = -7.2 - i * 1.5;
      const riser = new THREE.Mesh(new THREE.BoxGeometry(9, 0.34 + i * 0.34, 1.4), darkWood);
      riser.position.set(0, (0.34 + i * 0.34) / 2, z);
      this.scene.add(riser);
      this.addPlatform(0, z, 9, 1.4, 0.34 + i * 0.34);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 0.5), wood);
      bench.position.set(0, 0.34 + i * 0.34 + 0.52, z - 0.3);
      this.scene.add(bench);
    }

    // ── 천장 현수막
    const banners = [['가 즈 아', 0xa31d24], ['존 버', 0x1d3aa3]];
    banners.forEach(([text, col], i) => {
      const sx = i === 0 ? -8.6 : 8.6;
      const b = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 4.4),
        new THREE.MeshStandardMaterial({ map: makeBannerTexture(text, col), roughness: 0.95, side: THREE.DoubleSide }),
      );
      b.position.set(sx, 7.6, 0);
      b.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(b);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), brass);
      rod.position.set(sx, 9.85, 0);
      rod.rotation.x = Math.PI / 2;
      this.scene.add(rod);
    });

    // ── 샹들리에 2개
    for (const cz of [-4.5, 4.5]) {
      const ch = new THREE.Group();
      ch.position.set(0, 9.2, cz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.07, 8, 28), brass);
      ring.rotation.x = Math.PI / 2;
      ch.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.9 }));
        c.position.set(Math.cos(a) * 1.25, 0.2, Math.sin(a) * 1.25);
        ch.add(c);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd089 }));
        fl.position.set(Math.cos(a) * 1.25, 0.42, Math.sin(a) * 1.25);
        fl.scale.y = 1.6;
        ch.add(fl);
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 4), new THREE.MeshBasicMaterial({ color: 0x241c10 }));
        w.position.set(Math.cos(a) * 0.9, 1.7, Math.sin(a) * 0.9);
        w.rotation.z = Math.cos(a) * 0.25;
        w.rotation.x = -Math.sin(a) * 0.25;
        ch.add(w);
      }
      const lt = new THREE.PointLight(0xffc98a, 55, 18, 2);
      ch.add(lt);
      this.scene.add(ch);
    }

    // ── 화분
    for (const [cx, cz] of [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.9 }));
      pot.position.set(cx, 0.3, cz);
      this.scene.add(pot);
      const leafM = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.9, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.5), leafM);
        leaf.position.set(cx + Math.cos(a) * 0.24, 1.25, cz + Math.sin(a) * 0.24);
        leaf.rotation.set(Math.cos(a) * 0.45, -a, Math.sin(a) * 0.45);
        this.scene.add(leaf);
      }
      this.addPlatform(cx, cz, 0.8, 0.8, 0.62);
    }

    // ── 남쪽 입구 문 + 카펫 러너
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 11), cloth);
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, 0.05, 9.6);
    this.scene.add(runner);

    for (const sx of [-0.85, 0.85]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 0.18), darkWood);
      door.position.set(sx, 1.8, 15.8);
      this.scene.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), brass);
      knob.position.set(sx - Math.sign(sx) * 0.55, 1.8, 15.66);
      this.scene.add(knob);
    }
    const arch = new THREE.Mesh(new THREE.CircleGeometry(1.7, 22, 0, Math.PI), darkWood);
    arch.position.set(0, 3.6, 15.78);
    arch.rotation.y = Math.PI;
    this.scene.add(arch);

    // ── 헌금함
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), darkWood);
    box.position.set(2.9, 0.45, 12.4);
    this.scene.add(box);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
    slot.position.set(2.9, 0.91, 12.4);
    this.scene.add(slot);
    this.addPlatform(2.9, 12.4, 0.8, 0.8, 0.92);
  }

  /* ───────── 조준 포물선 */
  _buildAim() {
    const N = 22;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.aimLine = new THREE.Points(geo, new THREE.PointsMaterial({
      map: makeGlowTexture(), color: 0xffd36a, size: 0.42, sizeAttenuation: true,
      transparent: true, opacity: 0.95, depthTest: false, depthWrite: false,
    }));
    this.aimLine.renderOrder = 5;
    this.aimLine.frustumCulled = false;
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);
    this.aimN = N;

    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }),
    );
    this.aimRing.renderOrder = 6;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);
  }

  /** 조준점을 풀고 포물선을 갱신한다. dir 은 정규화된 3D 벡터 */
  showAim(eye, dir) {
    const r = this.solveAim(eye, dir);
    const col = r.part === 'head' ? 0xff4d5e : r.part === 'body' ? 0xffd36a : 0x7d8694;

    const pos = this.aimLine.geometry.attributes.position;
    const tmp = new THREE.Vector3();
    const lift = liftFor(r.dist);
    for (let i = 0; i < this.aimN; i++) {
      arcAt(eye, r.end, i / (this.aimN - 1), lift, tmp);
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    pos.needsUpdate = true;
    this.aimLine.geometry.computeBoundingSphere();
    this.aimLine.material.color.setHex(col);
    this.aimLine.visible = true;

    this.aimRing.position.copy(r.end);
    this.aimRing.lookAt(this.camera.position);
    this.aimRing.material.color.setHex(col);
    this.aimRing.scale.setScalar(r.part === 'head' ? 1.4 : 1);
    this.aimRing.visible = true;
    return r;
  }

  hideAim() {
    this.aimLine.visible = false;
    this.aimRing.visible = false;
  }

  solveAim(eye, dir) {
    let part = 'head';
    let p = rayHitSphere(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, HEAD);
    if (!p) { part = 'body'; p = rayHitSphere(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, BODY); }
    if (p) return { end: new THREE.Vector3(p.x, p.y, p.z), part, dist: p.dist };
    const far = Math.hypot(eye.x, eye.z) + 7;
    const end = new THREE.Vector3(eye.x + dir.x * far, Math.max(0.2, eye.y + dir.y * far), eye.z + dir.z * far);
    return { end, part: null, dist: far };
  }

  /* ───────── 오염도 */
  setDirt(v) {
    this.dirt = v;
    const t = Math.min(1, v / 100);
    const mud = new THREE.Color(0x3f2a10);
    for (const m of this.statueMats) {
      m.color.copy(m.userData.base).lerp(mud, Math.min(0.92, t * 1.05));
      m.roughness = Math.min(1, 0.34 + t * 0.66);
      m.metalness = 0.66 * (1 - t * 0.95);
    }
    if (this.ruin?.visible) return;          // 무너져 있는 동안은 더미만 보인다
    const nb = Math.round(t * this.blobs.length);
    this.blobs.forEach((b, i) => { b.visible = i < nb; });
    this.pile.visible = v >= 70;
    if (this.pile.visible) this.pile.scale.setScalar(0.6 + (v - 70) / 30 * 0.6);
    this.poopHat.visible = v >= 88;
    const showFlies = v >= 45;
    for (const f of this.flies) f.mesh.visible = showFlies;
  }

  addSplat(s) {
    if (this.splats.has(s.k)) return;
    if (!this._splatTex) this._splatTex = makeSplatTexture();
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._splatTex, color: 0x3d2710, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    m.position.set(s.x, s.y, s.z);
    m.scale.setScalar(0.42 + Math.random() * 0.3);
    this.scene.add(m);
    this.splats.set(s.k, m);
  }

  removeSplats(keys) {
    for (const k of keys) {
      const s = this.splats.get(k);
      if (s) { this.scene.remove(s); s.material.dispose(); this.splats.delete(k); }
    }
  }

  clearSplats() { this.removeSplats([...this.splats.keys()]); }

  /* ───────── 오물 투척 */
  throwMuck(eye, dir, dist, hit, splat) {
    const mat0 = mat('muck', { color: 0x4a3015, roughness: 1, flatShading: true });
    const mesh = new THREE.Mesh(geos().muck, mat0);
    const start = new THREE.Vector3(eye.x + dir.x * 0.6, eye.y + dir.y * 0.6, eye.z + dir.z * 0.6);
    const end = hit && splat
      ? new THREE.Vector3(splat.x, splat.y, splat.z)
      : new THREE.Vector3(eye.x + dir.x * dist, Math.max(0.2, eye.y + dir.y * dist), eye.z + dir.z * dist);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.mucks.push({
      mesh, start, end, hit, splat,
      t: 0, dur: 0.18 + dist * 0.04, lift: liftFor(dist),
      spin: new THREE.Vector3(Math.random() * 11, Math.random() * 11, Math.random() * 11),
    });
  }

  _updateMucks(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.mucks.length - 1; i >= 0; i--) {
      const r = this.mucks[i];
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      arcAt(r.start, r.end, u, r.lift, tmp);
      r.mesh.position.copy(tmp);
      r.mesh.rotation.x += r.spin.x * dt;
      r.mesh.rotation.y += r.spin.y * dt;
      if (u >= 1) {
        if (r.hit && r.splat) { this.addSplat(r.splat); this.shake = 0.16; }
        this.scene.remove(r.mesh);
        this.mucks.splice(i, 1);
      }
    }
  }

  /* ───────── 동상 붕괴 → 똥더미 → 재건 */
  setRuin(on) {
    this.ruin.visible = on;
    this.statueBody.visible = !on;
    this.pile.visible = false;
    this.poopHat.visible = false;
    for (const b of this.blobs) b.visible = false;
    for (const f of this.flies) f.mesh.visible = on;
    if (on) {
      this.ruin.scale.set(0.2, 0.1, 0.2);
      this.ruinT = 0;
    }
  }

  collapse(instant = false) {
    if (instant) {
      this._applyFall(1);
      this.fallen = true;
      this.fall = null;
      this.setRuin(true);
      this.ruin.scale.set(1, 1, 1);
      return;
    }
    this.fall = { t: 0, dur: 1.5, mode: 'fall' };
    this.shake = 1.5;
  }

  revive() {
    this.setRuin(false);
    this.statueBody.visible = true;
    const b = this.statueBody;
    this.fallFrom = { x: b.position.x, y: b.position.y, rz: b.rotation.z };
    this.fall = { t: 0, dur: 1.2, mode: 'rise' };
  }

  _applyFall(e) {
    const b = this.statueBody;
    b.rotation.z = -1.5 * e;
    b.position.x = -1.65 * e;
    b.position.y = this.statueHome.y - 0.95 * e;
  }

  _updateFall(dt) {
    if (!this.fall) return;
    const f = this.fall;
    f.t += dt;
    const u = Math.min(1, f.t / f.dur);
    if (f.mode === 'fall') {
      const e = u * u * (3 - 2 * u);
      this._applyFall(e);
      if (u > 0.82) this.statueBody.rotation.z += Math.sin(((u - 0.82) / 0.18) * Math.PI) * 0.09;
      if (u >= 1) {
        this.fallen = true;
        this.fall = null;
        this.setRuin(true);     // 쓰러진 자리에 똥더미가 솟는다
        this.shake = 0.5;
      }
    } else {
      const e = 1 - Math.pow(1 - u, 3);
      const s = this.fallFrom, h = this.statueHome, b = this.statueBody;
      b.rotation.z = s.rz + (h.rz - s.rz) * e;
      b.position.x = s.x + (h.x - s.x) * e;
      b.position.y = s.y + (h.y - s.y) * e;
      if (u >= 1) { this.fallen = false; this.fall = null; }
    }
  }

  /* ───────── 아바타 */
  addAvatar(id, nick, skin) {
    let a = this.avatars.get(id);
    if (!a) { a = new Avatar(this, id, nick, skin); this.avatars.set(id, a); }
    return a;
  }

  removeAvatar(id) {
    const a = this.avatars.get(id);
    if (a) { a.dispose(this.scene); this.avatars.delete(id); }
  }

  /* ───────── 카메라 */
  updateCamera(target, dt) {
    const d = this.camDist;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const want = new THREE.Vector3(
      target.x + Math.sin(this.camYaw) * d * cp,
      target.y + 1.5 + sp * d,
      target.z + Math.cos(this.camYaw) * d * cp,
    );
    want.x = THREE.MathUtils.clamp(want.x, -15.3, 15.3);
    want.z = THREE.MathUtils.clamp(want.z, -15.3, 15.3);
    want.y = THREE.MathUtils.clamp(want.y, 1.2, 11.8);

    // 기둥·피라미드 안으로 파고들지 않게 카메라를 앞으로 당긴다
    const ox = want.x - target.x, oy = want.y - (target.y + 1.5), oz = want.z - target.z;
    for (let s = 1; s >= 0.25; s -= 0.08) {
      const px = target.x + ox * s, py = target.y + 1.5 + oy * s, pz = target.z + oz * s;
      if (this.groundAt(px, pz) <= py - 0.25) {
        want.set(px, py, pz);
        break;
      }
    }

    this.camPos.lerp(want, Math.min(1, dt * 9));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake -= dt;
      const s = Math.max(0, this.shake) * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(target.x, target.y + 2.0, target.z);
  }

  update(dt) {
    this._updateMucks(dt);
    this._updateFall(dt);

    for (const f of this.flames) {
      f.p += dt * 9;
      const s = 1 + Math.sin(f.p) * 0.2;
      f.mesh.scale.set(s, 1.7 * s, s);
      f.light.intensity = 24 + Math.sin(f.p * 1.3) * 8;
    }

    // 똥더미가 부풀어 오르는 연출
    if (this.ruin.visible && this.ruinT < 1) {
      this.ruinT = Math.min(1, this.ruinT + dt * 1.6);
      const e = 1 - Math.pow(1 - this.ruinT, 3);
      this.ruin.scale.set(0.2 + e * 0.8, 0.1 + e * 0.9, 0.2 + e * 0.8);
    }

    if (this.flies[0]?.mesh.visible) {
      for (const f of this.flies) {
        f.a += dt * f.sp;
        f.mesh.position.set(Math.cos(f.a) * f.r, f.y + Math.sin(f.a * 2.7) * 0.22, Math.sin(f.a) * f.r);
      }
    }

    this._updateSun(dt);

    // 발밑 그림자를 지면에 붙인다
    for (const a of this.avatars.values()) {
      const g = this.groundAt(a.group.position.x, a.group.position.z);
      const air = Math.max(0, a.group.position.y - g);
      a.shadow.position.y = -air + 0.02;
      a.shadow.scale.setScalar(AV_SCALE * Math.max(0.35, 1 - air * 0.3));
      a.shadow.material.opacity = 0.26;
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, vis: p.z < 1 };
  }
}

/* ══════════════════════════════════════════════════ 텍스처 */

function makePlateTexture(main, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 200;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#7a5a1c');
  g.addColorStop(0.42, '#d2a951');
  g.addColorStop(0.56, '#9a7628');
  g.addColorStop(1, '#5d4414');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 200);

  x.strokeStyle = '#f6dfa4';
  x.lineWidth = 7;
  x.strokeRect(13, 13, 486, 174);
  x.strokeStyle = '#3d2c0a';
  x.lineWidth = 3;
  x.strokeRect(25, 25, 462, 150);

  const cy = sub ? 92 : 104;
  x.strokeStyle = '#f6dfa4';
  x.lineWidth = 6;
  for (const [sx, dx] of [[62, 1], [450, -1]]) {
    x.beginPath();
    x.moveTo(sx + dx * 26, cy - 44);
    x.lineTo(sx, cy - 44);
    x.lineTo(sx, cy + 44);
    x.lineTo(sx + dx * 26, cy + 44);
    x.stroke();
  }

  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '900 ' + (sub ? 84 : 104) + 'px "Noto Sans KR", serif';
  x.fillStyle = 'rgba(42,29,6,.9)';
  x.fillText(main, 256, cy + 5);
  x.fillStyle = '#ffeec0';
  x.fillText(main, 256, cy);

  if (sub) {
    x.font = '700 26px "Noto Sans KR", sans-serif';
    x.fillStyle = 'rgba(42,29,6,.75)';
    x.fillText(sub, 256, 158);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const emblemCache = new Map();
function emblemTexture(ch, fill, shadow) {
  const key = ch + fill;
  if (emblemCache.has(key)) return emblemCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '900 104px "Noto Sans KR", serif';
  x.fillStyle = shadow;
  x.fillText(ch, 64, 70);
  x.fillStyle = fill;
  x.fillText(ch, 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  emblemCache.set(key, t);
  return t;
}

function makeBannerTexture(text, col) {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 540;
  const x = c.getContext('2d');
  x.fillStyle = '#' + col.toString(16).padStart(6, '0');
  x.fillRect(0, 0, 220, 540);
  x.strokeStyle = '#e8c977';
  x.lineWidth = 7;
  x.strokeRect(14, 14, 192, 512);
  x.fillStyle = '#f6e3a8';
  x.font = '900 54px "Noto Sans KR", serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const chars = [...text.replace(/\s/g, '')];
  chars.forEach((ch, i) => x.fillText(ch, 110, 120 + i * 90));
  // 아래 술
  x.fillStyle = '#e8c977';
  for (let i = 0; i < 7; i++) x.fillRect(26 + i * 26, 500, 8, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSplatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 16 + Math.random() * 11;
    x.ellipse(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6, r * 0.55, r * 0.45, a, 0, Math.PI * 2);
  }
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
