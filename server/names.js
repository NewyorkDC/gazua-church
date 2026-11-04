'use strict';

const CTRL_RE = new RegExp('[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]', 'g');

const ADJ = [
  '물린', '존버하는', '물타는', '익절한', '손절 못한', '풀매수', '단타 치는',
  '야수의', '침착한', '설레는', '배고픈', '성실한', '꼼꼼한', '느긋한',
  '독실한', '회개한', '기도하는', '헌금한', '새벽기도', '통성기도',
  '반대매매', '상폐 직전', '평단 높은', '물려 있는', '영끌한',
];

const NOUN = [
  '개미', '성도', '집사', '권사', '청년', '형제', '자매', '사슴', '나무',
  '구름', '바람', '거북', '돌멩이', '다람쥐', '소나무', '양떼', '비둘기',
];

/**
 * 헌신 점수에 따라 올라가는 직위 10단계.
 * 점수 = 청소×2 + 오물명중 + 머리명중×3 + 기도×2 + 체류분
 */
const RANKS = [
  { label: '구도자', need: 0 },
  { label: '새신자', need: 8 },
  { label: '성도', need: 20 },
  { label: '서리집사', need: 45 },
  { label: '안수집사', need: 85 },
  { label: '권사', need: 140 },
  { label: '장로', need: 220 },
  { label: '전도사', need: 340 },
  { label: '목사', need: 520 },
  { label: '담임목사 ✝', need: 800 },
];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function randomNick() {
  const n = `${pick(ADJ)} ${pick(NOUN)}`;
  return Math.random() < 0.75 ? `${n} ${Math.floor(Math.random() * 900) + 100}` : n;
}

/** 사용자 입력 닉네임 정리: 제어문자 제거, 길이 제한 */
function sanitizeNick(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CTRL_RE, '').trim();
  if (!s) return null;
  return s.slice(0, 12);
}

function rankFor(score) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].need) r = i;
  return r;
}

module.exports = { randomNick, sanitizeNick, rankFor, RANKS };
