/**
 * Fernwork Games · the player's profile, shared by all games and the hub: coins, stars and best scores per level,
 * play time, workshop upgrades, cosmetics, achievements, the daily challenge. Stored in this browser only
 * (localStorage, no account, no server); exportCode()/importCode() move it to another device.
 *
 * Level ids are "w<world>-<nn>" (w1-01 … w4-10) and "w<world>-boss".
 */
const KEY = 'fw:games:profile:v1';
const listeners = new Set();

function blank() {
  return { v: 1, created: Date.now(), coins: 0, games: {}, upgrades: {}, cosmetics: { owned: [], equipped: {} }, achievements: {}, daily: {}, stats: {} };
}

let cache = null;
export function profile() {
  if (cache) return cache;
  try { cache = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) }; } catch { cache = blank(); }
  return cache;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile())); } catch { /* private mode: kept in memory */ }
  for (const fn of listeners) fn(profile());
}
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function game(id) {
  const p = profile();
  return (p.games[id] ||= { stars: {}, best: {}, plays: 0, seconds: 0, last: null });
}

/** World / level helpers */
export const levelId = (world, n) => `w${world}-${n === 'boss' ? 'boss' : String(n).padStart(2, '0')}`;
export const STAR_GATES = [0, 15, 40, 70]; // stars needed to open worlds 1–4 (plus beating the previous boss)
export function starsTotal(id) { return Object.values(game(id).stars).reduce((a, b) => a + b, 0); }
export function worldOpen(id, world) {
  if (world === 1) return true;
  const g = game(id);
  return (g.stars[levelId(world - 1, 'boss')] || 0) > 0 && starsTotal(id) >= STAR_GATES[world - 1];
}
/** A level is playable when its world is open and the level before it (in the world) is won. */
export function levelOpen(id, world, n) {
  if (!worldOpen(id, world)) return false;
  if (n === 1) return true;
  const prev = n === 'boss' ? levelId(world, 10) : levelId(world, n - 1);
  return (game(id).stars[prev] || 0) > 0;
}

/**
 * Record a finished level. Returns { coins, newBest, firstClear, newStars } for the result screen.
 * Coins: 10 per star gained for the first time + score/100, doubled on a first clear of a boss.
 */
export function finishLevel(id, lvl, { won, stars = 0, score = 0, seconds = 0, stats = {} }) {
  const g = game(id);
  g.plays++; g.seconds += seconds; g.last = lvl;
  for (const [k, v] of Object.entries(stats)) profile().stats[k] = (profile().stats[k] || 0) + v;
  const out = { coins: 0, newBest: false, firstClear: false, newStars: 0 };
  if (won) {
    const before = g.stars[lvl] || 0;
    out.firstClear = before === 0;
    out.newStars = Math.max(0, stars - before);
    g.stars[lvl] = Math.max(before, stars);
    out.newBest = score > (g.best[lvl] || 0);
    if (out.newBest) g.best[lvl] = score;
    out.coins = out.newStars * 10 + Math.round(score / 100) * (lvl.endsWith('boss') && out.firstClear ? 2 : 1);
    profile().coins += out.coins;
  }
  save();
  checkAchievements();
  return out;
}

export function spend(coins) {
  const p = profile();
  if (p.coins < coins) return false;
  p.coins -= coins; save(); return true;
}
export const upgradeLevel = (key) => profile().upgrades[key] || 0;
export function buyUpgrade(key, cost) { if (!spend(cost)) return false; profile().upgrades[key] = upgradeLevel(key) + 1; save(); return true; }

// ── achievements ──
export const ACHIEVEMENTS = [];
/** Games register theirs: { id, name, desc, test(profile) } */
export function registerAchievements(list) { for (const a of list) if (!ACHIEVEMENTS.some((b) => b.id === a.id)) ACHIEVEMENTS.push(a); }
const unlockedListeners = new Set();
export const onAchievement = (fn) => { unlockedListeners.add(fn); return () => unlockedListeners.delete(fn); };
export function checkAchievements() {
  const p = profile();
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test(p); } catch { ok = false; }
    if (ok) { p.achievements[a.id] = Date.now(); save(); for (const fn of unlockedListeners) fn(a); }
  }
}

// ── daily challenge: one seeded level a day, rotating through the games ──
export function dailyKey(date = new Date()) { return date.toISOString().slice(0, 10); }
export function dailySeed(date = new Date()) { const k = dailyKey(date); let h = 2166136261; for (const c of k) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ── export / import ──
export function exportCode() {
  const json = JSON.stringify(profile());
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return 'FWG1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function importCode(code) {
  const m = /^FWG1\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
  if (!m) throw new Error('That is not a Fernwork Games save code.');
  const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  if (!data || data.v !== 1 || typeof data.games !== 'object') throw new Error('This save code is damaged.');
  cache = { ...blank(), ...data };
  save();
  return cache;
}
/** For tests: forget everything. */
export function resetProfile() { cache = blank(); save(); }
