/** Fernling-Arena — naturgebundene Fernlings befreien die Gärten der Abtei.
 * Feste Datenpools, deterministische Level und unveränderte Progress-IDs.
 * Sim (x,y) entspricht Three (x,0,z); nur die Darstellung verwendet echte Modelle.
 */
import { clamp, rng, label, roundRect } from './core.js';
import { LEVELS, WORLDS } from './momo-levels.js';
import { upgradeLevel } from './profile.js';
import { STARTERS, starter, makeWeapon, moveName, moveEffect, ownMove, weaponKey, evolveToLevel, fossilOffer, grantFossil, clearAttackPayload, stampAttackPayload, NATURE_COLORS, TRAITS } from './fernling-canon.js';

import { FREED_RECOIL, FREED_BREAK, FREED_ESCAPE } from './momo-motion.js';

const TAU = Math.PI * 2;
export const MOMO_R = 0.42;
const MOMO_SPEED = 4.4, MOMO_HP = 100, SPAWN_DIST = 16.5, GEN_R = 1.0, BOSS_AT = 32;
const MAX_ENEMIES = 280, MAX_SHOTS = 200, MAX_GEMS = 320, MAX_FOE_SHOTS = 90, MAX_HAZ = 40, MAX_PARTS = 520;
const MAX_MINES = 12, MAX_BOLTS = 6, MAX_FREED = 350, MAX_POPS = 36, MAX_RINGS = 14;
const NUM = Array.from({ length: 1000 }, (_, i) => String(i));
const num = (v) => NUM[Math.min(999, Math.max(0, Math.round(v)))];

/** Enemy kinds; the order is the 3D crowd order (momo-3d.js). */
export const ENEMY = {
  zorbling: { hp: 5, speed: 2.15, r: 0.36, dmg: 7, xp: 1, score: 10, mass: 1, h: 1.0, color: '#a855f7' },
  zipper: { hp: 4, speed: 3.8, r: 0.32, dmg: 6, xp: 1, score: 12, mass: 0.7, h: 1.25, color: '#2dd4bf' },
  klonkbot: { hp: 11, speed: 1.75, r: 0.42, dmg: 9, xp: 2, score: 16, mass: 1.6, h: 1.3, color: '#94a3b8' },
  shield: { hp: 12, speed: 1.5, r: 0.46, dmg: 10, xp: 3, score: 24, mass: 2.2, shield: 20, h: 1.4, color: '#f97316' },
  spitter: { hp: 8, speed: 1.9, r: 0.38, dmg: 6, xp: 2, score: 20, mass: 1, range: 6.2, h: 1.0, color: '#84cc16' },
  blorb: { hp: 34, speed: 1.3, r: 0.75, dmg: 13, xp: 5, score: 40, mass: 4, split: 2, h: 1.5, color: '#7c3aed' },
  buzzbot: { hp: 5, speed: 3.0, r: 0.36, dmg: 6, xp: 1, score: 14, mass: 0.6, fly: true, h: 1.4, color: '#64748b' },
};
export const KINDS = Object.keys(ENEMY);
const KIND = Object.fromEntries(KINDS.map((k, i) => [k, i]));

export const BOSSES = {
  tank: { name: 'THORN GOLEM', hp: 1100, r: 1.55, speed: 1.45, dmg: 22, score: 1500, h: 3.4 },
  drill: { name: 'MORWEN', hp: 1900, r: 1.45, speed: 1.75, dmg: 22, score: 2000, h: 3.6 },
  walker: { name: 'VEIT SORN', hp: 2900, r: 1.6, speed: 1.35, dmg: 24, score: 2500, h: 4.6 },
  mothership: { name: 'SYNTHET', hp: 4200, r: 2.4, speed: 1.6, dmg: 0, score: 3500, h: 4.2, fly: true },
};

// Weapon stats per level (index 0 … 4), index 5 is the evolution.
export const WEAPONS = {
  blaster: { name: 'Ember Shot', color: '#38bdf8', desc: ['Trifft den nächsten verzauberten Fernling', 'Mehr Stärke', '+1 Geschoss', 'Geschosse durchdringen einen Gegner', '+1 Geschoss, schneller'],
    cd: [0.62, 0.58, 0.54, 0.5, 0.45, 0.26], n: [1, 1, 2, 2, 3, 4], dmg: [6, 7.5, 7.5, 8.5, 9.5, 11], pierce: [0, 0, 0, 1, 1, 2] },
  drones: { name: 'Ember Ring', color: '#a3e635', desc: ['Eine Naturkraft kreist um deinen Fernling', '+1 Begleiter', 'Größere Umlaufbahn, mehr Stärke', '+1 Begleiter', '+1 Begleiter, schneller'],
    n: [1, 2, 2, 3, 4, 6], dmg: [4, 4.5, 5.5, 6, 7, 10], rad: [1.8, 1.8, 2.1, 2.2, 2.3, 2.7], spd: [2.6, 2.6, 2.9, 3.1, 3.4, 4.0] },
  wrench: { name: 'Tail Flare', color: '#f59e0b', desc: ['Ein Naturbogen kehrt zu dir zurück', 'Mehr Stärke und Reichweite', '+1 Naturbogen', 'Größere Naturbögen', '+1 Naturbogen'],
    cd: [2.1, 1.95, 1.85, 1.7, 1.55, 1.15], n: [1, 1, 2, 2, 3, 3], dmg: [10, 12.5, 13, 15, 17, 28], range: [5.5, 6.2, 6.2, 6.8, 7.2, 8], size: [0.55, 0.6, 0.62, 0.78, 0.82, 1.3] },
  zap: { name: 'Leaping Flame', color: '#c084fc', desc: ['Springt zwischen nahen Gegnern weiter', '+1 Sprung', 'Mehr Stärke', '+1 Sprung, schneller', '+2 Sprünge'],
    cd: [1.9, 1.8, 1.7, 1.5, 1.35, 0.8], jumps: [2, 3, 3, 4, 6, 8], dmg: [8, 9, 11.5, 12.5, 14, 20], bolts: [1, 1, 1, 1, 1, 2] },
  mines: { name: 'Cinder Traps', color: '#f472b6', desc: ['Hinterlässt eine Falle aus eigener Naturkraft', 'Größerer Wirkungsbereich', 'Mehr Stärke', 'Mehr Fallen', 'Schneller und größer'],
    cd: [2.0, 1.9, 1.8, 1.6, 1.4, 1.1], dmg: [16, 18, 23, 25, 30, 42], rad: [1.7, 2.0, 2.0, 2.2, 2.5, 3.1], max: [4, 5, 5, 7, 8, 10] },
};
export const PASSIVES = {
  boots: { name: 'Quick Paws', color: '#22d3ee', desc: '+8 % Lauftempo' },
  magnet: { name: 'Keen Nose', color: '#60a5fa', desc: '+40 % Sammelradius' },
  armour: { name: 'Thick Hide', color: '#94a3b8', desc: '−8 % erlittener Schaden' },
  snacks: { name: 'Deep Rest', color: '#fb7185', desc: '+0,4 Leben pro Sekunde' },
  overclock: { name: 'Ruhiger Atem', color: '#facc15', desc: '−7 % Wartezeit zwischen Moves' },
};
/** Evolutions: weapon (maxed) + partner passive (maxed). */
export const EVOLUTIONS = {
  blaster: { with: 'overclock', name: 'Firestorm', desc: 'Ein schneller Fächer durchdringender Geschosse' },
  drones: { with: 'magnet', name: 'Ember Crown', desc: 'Sechs Naturkräfte ziehen zusätzlich Funken an' },
  wrench: { with: 'armour', name: 'Tail Flare · Combo', desc: 'Drei große zurückkehrende Naturbögen' },
  zap: { with: 'boots', name: 'Leaping Flame · Combo', desc: 'Zwei Ketten mit je acht Sprüngen' },
  mines: { with: 'snacks', name: 'Cinder Traps · Combo', desc: 'Große Fallen verlangsamen Gegner' },
};
const MAX_WEAPONS = 4, MAX_PASSIVES = 4;
/** Sparks needed for the next level. */
export const xpNeed = (lv) => Math.round(4 + lv * 2.4 + lv * lv * 0.1);

/** Fixed-size object pool: live items are items[0 … n), removal swaps with the last live one (no allocation). */
class Pool {
  constructor(max, make) { this.items = Array.from({ length: max }, make); this.n = 0; this.max = max; }
  spawn() { return this.n < this.max ? this.items[this.n++] : null; }
  removeAt(i) { const it = this.items, last = --this.n, t = it[i]; it[i] = it[last]; it[last] = t; }
}
const blankEnemy = () => ({
  kind: 0, def: null, x: 0, y: 0, kx: 0, ky: 0, hp: 0, maxHp: 0, r: 0, speed: 0, dmg: 0, xp: 1, score: 0, mass: 1,
  elite: false, boss: false, fly: false, dead: false, hidden: false, flash: 0, atk: 0, phase: 0, face: 0, shield: 0,
  toGen: false, shootT: 0, charge: 0, slow: 0, droneCd: 0, droneCd0: 0, droneCd1: 0, droneCd2: 0, droneCd3: 0, hitB: 0, hitW: 0, hitZ: 0, hitH: 0, scale: 1, spawnIn: 0, stride: 0, moving: 0, hitAt: -10, castAt: -10, freedAt: -1,
});
const ENEMY_BLANK = blankEnemy();
/** Reset a pooled enemy in place (no allocation). */
function resetEnemy(e) { for (const k in ENEMY_BLANK) e[k] = ENEMY_BLANK[k]; }
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60), r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; };

export class MomoSession {
  constructor(levelIndex, env = {}) {
    this.index = levelIndex;
    const L = (this.L = LEVELS[levelIndex]);
    this.W = WORLDS[L.world];
    this.sound = env.sound || { play() {} };
    this.preview = !!env.preview;
    this.rand = rng(L.seed);
    this.fxr = rng(L.seed ^ 0x5bd1e995);
    this.hint = L.hint;
    this.R = L.arena;
    this.t = 0; this.result = null; this.resultAt = 0; this.settlementSeconds = 0;
    const chosen = starter(env.starter); this.starter = chosen.id; this.nature = chosen.nature;
    this.stage = 0; this.model = chosen.models[0]; this.damageScale = 1; this.fossil = null; this.offerIndex = 0;
    this.castAt = -10; this.castSlot = 'blaster'; this.castFace = 0; this.evolvedAt = -10;
    this.fxEvents = new Pool(96, () => ({ id: '', x: 0, y: 0, direction: 0, scale: 1, time: 0 }));
    // Momo
    this.x = 0; this.y = 2.5; this.vx = 0; this.vy = 0; this.face = 0; this.moving = 0; this.walk = 0;
    this.hp = MOMO_HP; this.maxHp = MOMO_HP; this.iframes = 0; this.hurtFlash = 0;
    this.level = 1; this.xp = 0; this.need = xpNeed(1); this.pending = 0; this.choice = null; this.kit = 0; this.kitLeft = 0; this.autoPick = false;
    this.weapons = []; this.passives = { boots: 0, magnet: 0, armour: 0, snacks: 0, overclock: 0 };
    this.addWeapon('blaster');
    this.droneAngle = 0;
    this.kills = 0; this.score = 0; this.spawned = 0; this.elitesKilled = 0; this.elitesSpawned = 0;
    this.ids = 1;
    // input
    this.keys = { u: false, d: false, l: false, r: false };
    this.stick = null; this.mouse = null; this.botMove = null; this.inX = 0; this.inY = 0;
    // pools
    this.en = new Pool(MAX_ENEMIES, blankEnemy);
    this.shots = new Pool(MAX_SHOTS, () => clearAttackPayload({ kind: 0, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, r: 0, life: 0, pierce: 0, id: 0, out: true, speed: 0, decel: 0, spin: 0, age: 0 }));
    this.gems = new Pool(MAX_GEMS, () => ({ kind: 0, x: 0, y: 0, v: 0, pull: false, bob: 0 }));
    this.foeShots = new Pool(MAX_FOE_SHOTS, () => ({ kind: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, dmg: 0, life: 0 }));
    this.haz = new Pool(MAX_HAZ, () => ({ kind: 0, src: 0, x: 0, y: 0, x2: 0, y2: 0, r: 0, warn: 0, warnMax: 0, act: 0, dmg: 0, hit: false, foes: false, id: 0 }));
    this.mines = new Pool(MAX_MINES, () => clearAttackPayload({ x: 0, y: 0, arm: 0, life: 0, dmg: 0, rad: 0 }));
    this.bolts = new Pool(MAX_BOLTS, () => clearAttackPayload({ pts: new Float32Array(40), n: 0, life: 0 }));
    this.parts = new Pool(MAX_PARTS, () => ({ x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, life: 0, max: 1, size: 0.1, color: 0xffffff, grav: 9 }));
    this.rings = new Pool(MAX_RINGS, () => ({ x: 0, y: 0, r: 0, life: 0, max: 1, color: 0xffffff }));
    this.freed = new Pool(MAX_FREED, () => ({ kind: 0, x: 0, y: 0, face: 0, life: 0, age: 0, scale: 1, elite: false, kx: 0, ky: 0, stride: 0, broken: false, visible: true, outside: 0 }));
    this.pops = new Pool(MAX_POPS, () => ({ text: '', x: 0, y: 0, h: 0, life: 0, max: 1, color: '#fff', size: 1 }));
    // spatial grid over the playfield (enemies only; the boss is checked on its own)
    this.gcs = 2; this.gExt = this.R + 16; this.gDim = Math.ceil((2 * this.gExt) / this.gcs);
    this.gHead = new Int32Array(this.gDim * this.gDim); this.gNext = new Int32Array(MAX_ENEMIES);
    this.qbuf = new Int32Array(MAX_ENEMIES);
    // director
    this.spawnAcc = 0; this.swarmT = L.swarm[0]; this.eliteT = 18; this.lavaT = 6; this.bossDue = L.goal === 'boss';
    this.boss = null; this.bossWarned = false;
    this.mixKeys = Object.keys(L.mix); this.mixW = this.mixKeys.map((k) => L.mix[k]); this.mixSum = this.mixW.reduce((a, b) => a + b, 0);
    this.genKick = 0;
    this.gen = L.goal === 'defend' ? { x: 0, y: 0, hp: 100, max: 100, flash: 0, warned: 0, pulse: 3 } : null;
    if (this.gen) this.y = 2.6;
    // arena features
    this.storms = []; this.ice = [];
    if (L.feature === 'storm') {
      const n = 2 + (L.goal === 'boss' ? 0 : Math.min(1, Math.floor((levelIndex % 11) / 5)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + this.rand(), d = this.R * 0.55, sp = 0.6 + this.rand() * 0.4;
        this.storms.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: Math.cos(a + 1.9) * sp, vy: Math.sin(a + 1.9) * sp, r: 3.4 + this.rand() * 0.8, spin: 0 });
      }
    }
    if (L.feature === 'ice') {
      for (let i = 0; i < 8; i++) {
        const a = this.rand() * TAU, d = 5 + this.rand() * (this.R - 7);
        this.ice.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 2.6 + this.rand() * 1.8 });
      }
    }
    this.onIce = false; this.inStorm = false;
    // effects
    this.shake = 0; this.banner = null; this.bannerT = 0; this.levelFlash = 0; this.time = 0;
    this.layout = null; this.projFn = null; this.unproj = null; this.cardRects = null;
    this._p = { x: 0, y: 0, s: 1 };
    this.buildGrid();
    if (this.preview) this.stagePreview();
    else {
      this.say(L.goal === 'boss' ? 'BOSS LEVEL' : this.goalText(true), 2.2);
      // Professor Owlbert's supply crate: one free card per world already conquered, so later worlds start equipped
      this.kit = L.world + (L.goal === 'boss' ? 1 : 0);
      // Permanent workshop benefit is exactly one extra choice before movement.
      // Level/XP and the world's existing supply cards are independent of it.
      if (upgradeLevel('momo-card') > 0) this.openChoice('workshop');
    }
  }

  // ── loadout ──
  addWeapon(id, nature = this.nature, foreign = false) {
    const uid = weaponKey(nature, id); if (this.weapon(uid) || this.weapons.length >= MAX_WEAPONS) return null;
    const w = makeWeapon(nature, id, foreign); w.index = this.weapons.length; this.weapons.push(w); return w;
  }
  weapon(id) { for (const w of this.weapons) if (w.uid === id || (w.id === id && !w.foreign)) return w; return null; }
  grantFossil(nature, slot) { const n = this.weapons.length; if (!grantFossil(this, nature, slot)) return false; this.weapons[n].index = n; this.effect('fossil_pickup', this.x, this.y, this.face); return true; }
  effect(id, x, y, direction = 0, scale = 1) { const f = this.fxEvents.spawn(); if (f) { f.id = id; f.x = x; f.y = y; f.direction = direction; f.scale = scale; f.time = this.time; } }
  evolve() { if (evolveToLevel(this, this.level)) { this.evolvedAt = this.time; this.castAt = -10; this.effect('evolution', this.x, this.y); this.say(this.model.replaceAll('_', ' '), 2.2, NATURE_COLORS[this.nature]); } }
  cast(w, x, y) { this.castAt = this.time; this.castSlot = w.id; this.castFace = Math.atan2(x - this.x, y - this.y); }

  wi(w) { return w.evo ? 5 : w.lv - 1; }
  get cdMul() { return 1 - 0.07 * this.passives.overclock; }
  get magnetR() { return 1.7 * (1 + 0.4 * this.passives.magnet); }

  makeCards() {
    const cards = [], rest = [];
    for (const w of this.weapons) {
      const ev = EVOLUTIONS[w.id];
      if (!w.evo && w.lv >= 5 && this.passives[ev.with] >= 5) cards.push({ type: 'evo', id: w.id, uid: w.uid, nature: w.nature, name: moveName({ ...w, evo: true }), desc: ev.desc, color: NATURE_COLORS[w.nature], lv: 6 });
    }
    // Every option gets a rough worth plus a random share; the best three are offered, the first is the safe pick.
    const R = () => this.rand() * 22;
    for (const w of this.weapons) if (w.lv < 5) rest.push({ type: 'weapon', id: w.id, uid: w.uid, nature: w.nature, name: moveName(w), desc: WEAPONS[w.id].desc[w.lv], color: NATURE_COLORS[w.nature], lv: w.lv + 1, worth: 50 + R() });
    if (this.weapons.length < MAX_WEAPONS) for (const id of Object.keys(WEAPONS)) if (!this.weapon(id)) rest.push({ type: 'weapon', id, uid: weaponKey(this.nature,id), nature: this.nature, name: moveName(makeWeapon(this.nature,id)), desc: WEAPONS[id].desc[0], color: NATURE_COLORS[this.nature], lv: 1, worth: (this.weapons.length < 3 ? 46 : 22) + R() });
    const owned = Object.values(this.passives).filter((v) => v > 0).length;
    for (const [id, p] of Object.entries(PASSIVES)) {
      const lv = this.passives[id];
      if (lv >= 5 || (lv === 0 && owned >= MAX_PASSIVES)) continue;
      const partner = this.weapons.some((w) => EVOLUTIONS[w.id].with === id && w.lv >= 3);
      rest.push({ type: 'passive', id, name: p.name, desc: p.desc, color: p.color, lv: lv + 1, worth: (partner ? 44 : 30) + R() });
    }
    rest.sort((a, b) => b.worth - a.worth);
    while (cards.length < 3 && rest.length) cards.push(rest.shift());
    if (cards.length > 3) cards.length = 3;
    if (!cards.length) cards.push({ type: 'heal', id: 'heal', name: 'Erholung', desc: '+30 Leben und +250 Punkte', color: '#4ade80', lv: 0 });
    const offer = fossilOffer(this, { seed: this.L.seed, level: this.level, offerIndex: this.offerIndex++ });
    if (offer && cards.length && cards[cards.length - 1].type !== 'evo') cards[cards.length - 1] = { ...offer, name: moveName(makeWeapon(offer.nature, offer.slot)), desc: 'Fossilkraft: genau ein fremder Move bis Levelende.', color: NATURE_COLORS[offer.nature], lv: 1 };
    return cards;
  }
  openChoice(reason) {
    if (this.choice || this.result) { if (reason === 'level') this.pending++; return; }
    this.choice = { cards: this.makeCards(), t: 0, sel: 0, reason };
    this.sound.play('upgrade');
    this.stick = null; this.mouse = null;
  }
  /** Take card i of the open choice. */
  pick(i) {
    const c = this.choice?.cards[i];
    if (!c) return false;
    if (c.type === 'evo') { const w = this.weapon(c.uid || c.id); w.evo = true; this.say(c.name.toUpperCase() + '!', 1.8, c.color); this.levelFlash = 1; }
    else if (c.type === 'weapon') { const w = this.weapon(c.uid || c.id); if (w) w.lv++; else this.addWeapon(c.id); }
    else if (c.type === 'fossil') this.grantFossil(c.nature, c.slot);
    else if (c.type === 'passive') this.passives[c.id]++;
    else { this.hp = Math.min(this.maxHp, this.hp + 30); this.score += 250; }
    this.sound.play('good');
    this.choice = null;
    if (this.kitLeft > 0) { this.kitLeft--; this.openChoice('kit'); }
    else if (this.pending > 0) { this.pending--; this.openChoice('level'); }
    return true;
  }

  // ── input ──
  cancelInput() {
    this.keys = { u: false, d: false, l: false, r: false };
    this.stick = null; this.mouse = null;
  }
  pointer(type, x, y, e = {}) {
    if (this.choice) {
      if (type === 'down' && this.choice.t > 0.25 && this.cardRects) {
        for (let i = 0; i < this.cardRects.length; i++) {
          const r = this.cardRects[i];
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.pick(i); return; }
        }
      }
      return;
    }
    if (this.result) { this.stick = null; this.mouse = null; return; }
    if (e.pointerType === 'mouse') {
      if (type === 'down') this.mouse = { x, y };
      else if (type === 'move' && this.mouse) { this.mouse.x = x; this.mouse.y = y; }
      else if (type === 'up') this.mouse = null;
      return;
    }
    if (type === 'down') this.stick = { x0: x, y0: y, x, y };
    else if (type === 'move' && this.stick) {
      const s = this.stick; s.x = x; s.y = y;
      // a floating stick: the base follows a finger that drags far
      const dx = x - s.x0, dy = y - s.y0, d = Math.hypot(dx, dy), max = 56;
      if (d > max) { s.x0 = x - (dx / d) * max; s.y0 = y - (dy / d) * max; }
    } else if (type === 'up') this.stick = null;
  }
  key(code, down) {
    if (this.choice && down) {
      const n = /^(Digit|Numpad)([1-3])$/.exec(code);
      if (n) { if (this.choice.t > 0.15) this.pick(+n[2] - 1); return true; }
      if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') { this.choice.sel = (this.choice.sel + this.choice.cards.length - 1) % this.choice.cards.length; return true; }
      if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') { this.choice.sel = (this.choice.sel + 1) % this.choice.cards.length; return true; }
      if (code === 'Enter' || code === 'Space') { if (this.choice.t > 0.15) this.pick(this.choice.sel); return true; }
    }
    const k = this.keys;
    switch (code) {
      case 'ArrowUp': case 'KeyW': k.u = down; return true;
      case 'ArrowDown': case 'KeyS': k.d = down; return true;
      case 'ArrowLeft': case 'KeyA': k.l = down; return true;
      case 'ArrowRight': case 'KeyD': k.r = down; return true;
      default: return false;
    }
  }
  /** Tests and bots steer with this (a direction, length ≤ 1); null hands control back to the player's input. */
  setMove(mx, my) { if (mx == null) this.botMove = null; else { this.botMove = this.botMove || { x: 0, y: 0 }; this.botMove.x = mx; this.botMove.y = my; } }
  readInput() {
    let mx = 0, my = 0;
    if (this.botMove) { mx = this.botMove.x; my = this.botMove.y; }
    else if (this.stick) {
      const dx = this.stick.x - this.stick.x0, dy = this.stick.y - this.stick.y0, d = Math.hypot(dx, dy);
      if (d > 6) { const m = Math.min(1, (d - 6) / 38); mx = (dx / d) * m; my = (dy / d) * m; }
    } else if (this.mouse) {
      // towards the cursor on the ground (3D) or on screen
      let dx, dy;
      const w = this.unproj ? this.unproj(this.mouse.x, this.mouse.y) : null;
      if (w) { dx = w.x - this.x; dy = w.y - this.y; const d = Math.hypot(dx, dy); if (d > 0.35) { const m = Math.min(1, (d - 0.35) / 1.2); mx = (dx / d) * m; my = (dy / d) * m; } }
      else if (this.layout) {
        const p = this.proj(this.x, this.y, 0.5);
        dx = this.mouse.x - p.x; dy = this.mouse.y - p.y; const d = Math.hypot(dx, dy);
        if (d > 12) { const m = Math.min(1, (d - 12) / 40); mx = (dx / d) * m; my = (dy / d) * m; }
      }
    } else {
      const k = this.keys;
      mx = (k.r ? 1 : 0) - (k.l ? 1 : 0); my = (k.d ? 1 : 0) - (k.u ? 1 : 0);
      const d = Math.hypot(mx, my); if (d > 1) { mx /= d; my /= d; }
    }
    this.inX = mx; this.inY = my;
  }
  hud() {
    const L = this.L;
    let progress;
    if (L.goal === 'elites') progress = this.elitesKilled / L.elites;
    else if (L.goal === 'boss') progress = this.boss ? 1 - Math.max(0, this.boss.hp) / this.boss.maxHp : 0;
    else progress = this.t / L.time;
    return { progress, score: this.score, label: 'Score' };
  }

  // ── simulation ──
  update(dt) {
    this.time += dt;
    this.updateFx(dt);
    if (this.choice) {
      // autoPick (tests, benchmarks, window.__fwGames fast-forward): take the first card and play on
      if (this.autoPick) this.pick(0); else { this.choice.t += dt; return; }
      if (this.choice) return;
    }
    if (this.result) { this.vx *= 0.9; this.vy *= 0.9; return; }
    if (this.kit > 0 && this.time > 0.6) { this.kitLeft = this.kit - 1; this.kit = 0; this.openChoice('kit'); return; }
    this.t += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.readInput();
    this.moveMomo(dt);
    this.buildGrid();
    this.director(dt);
    this.updateEnemies(dt);
    if (this.boss && !this.boss.dead) this.updateBoss(this.boss, dt);
    this.updateWeapons(dt);
    this.updateShots(dt);
    this.updateMines(dt);
    this.updateFoeShots(dt);
    this.updateHazards(dt);
    this.updateFeatures(dt);
    this.updateGems(dt);
    this.compactEnemies();
    if (this.passives.snacks && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + 0.4 * this.passives.snacks * dt);
    if (this.gen) {
      this.gen.flash = Math.max(0, this.gen.flash - dt * 3);
      // the generator shocks whatever clings to it every few seconds (a pulse ring shows it)
      this.gen.pulse -= dt;
      if (this.gen.pulse <= 0) {
        this.gen.pulse = 3;
        const c = this.near(this.gen.x, this.gen.y, GEN_R + 1.6);
        for (let j = 0; j < c; j++) this.damage(this.en.items[this.qbuf[j]], 9 * this.L.hp, this.gen.x, this.gen.y, false, 4);
        this.ring(this.gen.x, this.gen.y, GEN_R + 1.6, 0x7dd3fc, 0.45);
      }
      const near = (this.x - this.gen.x) ** 2 + (this.y - this.gen.y) ** 2 < 2.8 * 2.8;
      if (near && this.gen.hp < this.gen.max) this.gen.hp = Math.min(this.gen.max, this.gen.hp + 5 * dt);
      this.genRepair = near;
    }
    this.checkGoal();
  }

  moveMomo(dt) {
    this.onIce = false; this.inStorm = false;
    for (const p of this.ice) if ((this.x - p.x) ** 2 + (this.y - p.y) ** 2 < p.r * p.r) { this.onIce = true; break; }
    for (const s of this.storms) if ((this.x - s.x) ** 2 + (this.y - s.y) ** 2 < s.r * s.r) { this.inStorm = true; break; }
    const spd = MOMO_SPEED * (1 + 0.08 * this.passives.boots) * (this.inStorm ? 0.55 : 1) * (this.onIce ? 1.12 : 1);
    const tvx = this.inX * spd, tvy = this.inY * spd;
    const k = 1 - Math.exp(-dt * (this.onIce ? 2.2 : 18));
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const d = Math.hypot(this.x, this.y), lim = this.R - 0.6;
    if (d > lim) {
      const nx = this.x / d, ny = this.y / d;
      this.x = nx * lim; this.y = ny * lim;
      const out = this.vx * nx + this.vy * ny; if (out > 0) { this.vx -= nx * out; this.vy -= ny * out; }
    }
    const sp = Math.hypot(this.vx, this.vy);
    this.moving = Math.min(1, sp / MOMO_SPEED);
    this.walk += sp * dt;
    if (sp > 0.4 && Math.hypot(this.inX, this.inY) > 0.1) this.face = turn(this.face, Math.atan2(this.inX, this.inY), dt * 14);
  }

  buildGrid() {
    const head = this.gHead, next = this.gNext, it = this.en.items;
    head.fill(-1);
    for (let i = 0; i < this.en.n; i++) {
      const e = it[i];
      if (e.dead || e.boss) continue;
      const c = this.cell(e.x, e.y);
      next[i] = head[c]; head[c] = i;
    }
  }
  cell(x, y) {
    const d = this.gDim;
    const cx = clamp(Math.floor((x + this.gExt) / this.gcs), 0, d - 1), cy = clamp(Math.floor((y + this.gExt) / this.gcs), 0, d - 1);
    return cy * d + cx;
  }
  /** Indices of live (grid) enemies within rad (+ their radius) of x,y into this.qbuf; returns the count. */
  near(x, y, rad) {
    const d = this.gDim, cs = this.gcs, reach = rad + 1.2;
    const x0 = clamp(Math.floor((x - reach + this.gExt) / cs), 0, d - 1), x1 = clamp(Math.floor((x + reach + this.gExt) / cs), 0, d - 1);
    const y0 = clamp(Math.floor((y - reach + this.gExt) / cs), 0, d - 1), y1 = clamp(Math.floor((y + reach + this.gExt) / cs), 0, d - 1);
    const it = this.en.items, out = this.qbuf;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = this.gHead[cy * d + cx]; i !== -1; i = this.gNext[i]) {
        const e = it[i];
        if (e.dead || e.hidden) continue;
        const rr = rad + e.r;
        if ((e.x - x) ** 2 + (e.y - y) ** 2 < rr * rr) out[n++] = i;
      }
    }
    return n;
  }
  /** Nearest live enemy (boss included) within range of x,y, skipping ones marked with `skipZ` (chain lightning). */
  nearest(x, y, range, skipZ = 0) {
    let best = null, bd = range * range;
    const it = this.en.items;
    for (let i = 0; i < this.en.n; i++) {
      const e = it[i];
      if (e.dead || e.hidden || e.spawnIn > 0 || (skipZ && e.hitZ === skipZ)) continue;
      // elites and the boss are priority targets: they count as a few steps closer
      const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy - (e.boss ? (e.r + 3) ** 2 : e.elite ? 9 : 0);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  // ── director: spawns, waves, elites, boss, features ──
  director(dt) {
    const L = this.L;
    const prog = L.goal === 'survive' || L.goal === 'defend' ? this.t / L.time : Math.min(1, this.t / (L.par || 150));
    const bossFight = this.boss && !this.boss.dead;
    const rate = (L.rate[0] + (L.rate[1] - L.rate[0]) * prog) * (bossFight ? 0.45 : 1);
    const alive = this.en.n;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (alive >= L.cap) break;
      const a = this.rand() * TAU, d = SPAWN_DIST + this.rand() * 2;
      this.spawnEnemy(this.pickKind(), this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, false);
    }
    // a swarm: a ring of fast small enemies closing in, with a gap to slip out through
    this.swarmT -= dt;
    if (this.swarmT <= 0 && !bossFight) {
      this.swarmT = L.swarm[0];
      const n = L.swarm[1], gap = this.rand() * TAU, kind = L.mix.zipper && this.rand() < 0.4 ? 'zipper' : 'zorbling';
      for (let i = 0; i < n; i++) {
        const a = gap + 0.55 + (i / n) * (TAU - 1.1);
        this.spawnEnemy(kind, this.x + Math.cos(a) * 13, this.y + Math.sin(a) * 13, false);
      }
      this.say('HEX-SCHAR!', 1.2, '#fca5a5');
    }
    if (L.goal === 'elites' && this.elitesSpawned < L.elites) {
      this.eliteT -= dt;
      if (this.eliteT <= 0) {
        this.eliteT = Math.max(14, (L.par - 30) / L.elites);
        const a = this.rand() * TAU;
        let kind = this.pickKind(); if (kind === 'zipper' || kind === 'buzzbot') kind = 'klonkbot';
        this.spawnEnemy(kind, this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14, true);
        this.elitesSpawned++;
        this.say('STARKER HEX ERSCHEINT', 1.4, '#fde047');
      }
    }
    if (this.bossDue && !this.boss) {
      if (this.t > BOSS_AT - 3.5 && !this.bossWarned) { this.bossWarned = true; this.say(BOSSES[L.boss].name, 3, '#f87171'); this.sound.play('bad'); }
      if (this.t > BOSS_AT) this.spawnBoss();
    }
  }
  pickKind() {
    let r = this.rand() * this.mixSum;
    for (let i = 0; i < this.mixKeys.length; i++) { r -= this.mixW[i]; if (r <= 0) return this.mixKeys[i]; }
    return this.mixKeys[0];
  }
  spawnEnemy(kind, x, y, elite) {
    const e = this.en.spawn();
    if (!e) return null;
    const def = ENEMY[kind], L = this.L;
    const prog = L.goal === 'survive' || L.goal === 'defend' ? this.t / L.time : Math.min(1, this.t / (L.par || 150));
    const lim = this.R + 12, d = Math.hypot(x, y);
    if (d > lim) { x *= lim / d; y *= lim / d; }
    const hp = def.hp * L.hp * (1 + prog * 0.6) * (elite ? 6 : 1);
    resetEnemy(e);
    e.kind = KIND[kind]; e.def = def; e.x = x; e.y = y; e.hp = hp; e.maxHp = hp; e.r = def.r * (elite ? 1.45 : 1);
    e.speed = def.speed * (elite ? 1.05 : 1) * (0.92 + this.rand() * 0.16); e.dmg = def.dmg * L.dmg * (elite ? 1.3 : 1);
    e.xp = def.xp; e.score = def.score * (elite ? 10 : 1); e.mass = def.mass * (elite ? 4 : 1); e.elite = elite; e.fly = !!def.fly;
    e.shield = def.shield ? def.shield * L.hp * (elite ? 4 : 1) : 0;
    e.phase = this.rand() * TAU; e.face = Math.atan2(this.x - x, this.y - y); e.scale = elite ? 1.45 : 1;
    e.shootT = 1.5 + this.rand() * 2; e.spawnIn = 0.35;
    // defend levels: every fourth enemy goes for the generator
    e.toGen = !!this.gen && this.spawned % 4 === 0;
    this.spawned++;
    return e;
  }
  spawnBoss() {
    const def = BOSSES[this.L.boss];
    const e = this.en.spawn();
    if (!e) return;
    resetEnemy(e);
    const a = this.rand() * TAU;
    e.boss = true; e.kind = -1; e.def = def; e.x = this.x + Math.cos(a) * 11; e.y = this.y + Math.sin(a) * 11;
    const lim = this.R - 2, d = Math.hypot(e.x, e.y); if (d > lim) { e.x *= lim / d; e.y *= lim / d; }
    e.hp = e.maxHp = def.hp; e.r = def.r; e.speed = def.speed; e.dmg = def.dmg * this.L.dmg; e.score = def.score; e.fly = !!def.fly;
    e.mass = 50; e.face = Math.atan2(this.x - e.x, this.y - e.y); e.spawnIn = 1.2;
    e.state = 'walk'; e.st = 0; e.next = 2.5; e.cx = 0; e.cy = 0; e.ct = 0; e.attack = 0; e.summonT = 9; e.phase2 = false;
    this.boss = e;
    this.shake = Math.max(this.shake, 0.8);
    this.ring(e.x, e.y, 3.5, 0xf87171, 0.8);
    this.sound.play('boom');
  }

  updateEnemies(dt) {
    const it = this.en.items, mx = this.x, my = this.y, gen = this.gen;
    for (let i = 0; i < this.en.n; i++) {
      const e = it[i];
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.atk > 0) e.atk -= dt;
      for (const field of DRONE_FIELDS) if (e[field] > 0) e[field] -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.spawnIn > 0) { e.spawnIn -= dt; if (!e.boss) continue; }
      if (e.boss) continue;
      const def = e.def;
      const toGen = e.toGen && gen && gen.hp > 0;
      const tx = toGen ? gen.x : mx, ty = toGen ? gen.y : my;
      let dx = tx - e.x, dy = ty - e.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      dx /= dist; dy /= dist;
      let spd = e.speed * (e.slow > 0 ? 0.45 : 1);
      if (!e.fly && this.storms.length) for (const s of this.storms) if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < s.r * s.r) { spd *= 0.75; break; }
      let vx = dx * spd, vy = dy * spd;
      if (def === ENEMY.spitter) {
        const dm = Math.hypot(mx - e.x, my - e.y);
        if (dm < def.range) {
          vx *= dm < def.range - 2 ? -0.5 : 0; vy *= dm < def.range - 2 ? -0.5 : 0;
          e.shootT -= dt;
          e.charge = e.shootT < 0.7 ? 1 - e.shootT / 0.7 : 0;
          if (e.shootT <= 0) { e.shootT = 3.2 + this.rand(); e.charge = 0; this.spit(e); }
        } else e.charge = 0;
      } else if (def === ENEMY.buzzbot) {
        const w = Math.sin(e.phase * 0.7) * 0.7 * spd;
        vx += -dy * w; vy += dx * w;
      }
      // reached the generator: stop and hit it
      if (toGen && dist < GEN_R + e.r + 0.15) {
        vx = 0; vy = 0;
        if (e.atk <= 0) { e.atk = 1; gen.hp -= e.dmg * 0.3; gen.flash = 1; this.sound.play('hurt', 220); if (this.t - gen.warned > 6) { gen.warned = this.t; this.say('ARCHIV UNTER ANGRIFF', 1.4, '#fca5a5'); } }
      }
      // separation from neighbours (soft, heavier ones push harder)
      const n = this.near(e.x, e.y, e.r);
      let sx = 0, sy = 0;
      for (let k = 0; k < n; k++) {
        const j = this.qbuf[k];
        if (j === i) continue;
        const o = it[j];
        const ox = e.x - o.x, oy = e.y - o.y, rr = e.r + o.r, d2 = ox * ox + oy * oy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = ((rr - d) / d) * (o.mass / (o.mass + e.mass));
        sx += ox * push; sy += oy * push;
      }
      e.kx *= Math.exp(-dt * 7); e.ky *= Math.exp(-dt * 7);
      e.x += (vx + e.kx) * dt + sx * Math.min(1, dt * 10);
      e.y += (vy + e.ky) * dt + sy * Math.min(1, dt * 10);
      e.stride+=Math.hypot(vx,vy)*dt; e.moving=Math.hypot(vx,vy);
      e.face = turn(e.face, Math.atan2(dx, dy), dt * 6);
      e.phase += dt * (1.5 + spd * 3);
      // contact with Momo
      const cx = mx - e.x, cy = my - e.y, rr = e.r + MOMO_R;
      if (cx * cx + cy * cy < rr * rr && e.atk <= 0) {
        e.atk = 0.9;
        this.hurt(e.dmg, e.x, e.y);
        const d = Math.hypot(cx, cy) || 1; e.kx -= (cx / d) * 3 / e.mass; e.ky -= (cy / d) * 3 / e.mass;
      }
    }
  }
  spit(e) {
    e.castAt=this.time;
    const s = this.foeShots.spawn(); if (!s) return;
    const dx = this.x - e.x, dy = this.y - e.y, d = Math.hypot(dx, dy) || 1, sp = 4.4;
    s.kind = 0; s.x = e.x + (dx / d) * 0.5; s.y = e.y + (dy / d) * 0.5; s.vx = (dx / d) * sp; s.vy = (dy / d) * sp;
    s.r = 0.3; s.dmg = 9 * this.L.dmg * (e.elite ? 1.5 : 1); s.life = 4.5;
    this.sound.play('splash', 120);
  }

  // ── bosses: telegraphed patterns ──
  updateBoss(b, dt) {
    if (b.spawnIn > 0) return;
    const L = this.L, kind = L.boss;
    b.st += dt;
    b.phase += dt * 2.4;
    if (!b.phase2 && b.hp < b.maxHp * 0.5) { b.phase2 = true; this.say('DER HEX VERSTÄRKT SICH!', 1.4, '#f87171'); this.shake = Math.max(this.shake, 0.5); }
    const p2 = b.phase2;
    const dx = this.x - b.x, dy = this.y - b.y, dist = Math.hypot(dx, dy) || 0.001;
    // summons
    b.summonT -= dt;
    if (b.summonT <= 0) {
      b.summonT = p2 ? 9 : 12;
      const what = kind === 'tank' ? 'klonkbot' : kind === 'drill' ? 'zipper' : kind === 'walker' ? (this.rand() < 0.5 ? 'blorb' : 'spitter') : (this.rand() < 0.5 ? 'buzzbot' : 'zorbling');
      const n = what === 'blorb' ? 2 : kind === 'mothership' ? 6 : 4;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + this.rand(); this.spawnEnemy(what, b.x + Math.cos(a) * (b.r + 1), b.y + Math.sin(a) * (b.r + 1), false); }
    }
    if (b.state === 'walk') {
      const hover = kind === 'mothership' ? 4 : 0;
      if (dist > b.r + MOMO_R + hover) { b.x += (dx / dist) * b.speed * (p2 ? 1.2 : 1) * dt; b.y += (dy / dist) * b.speed * (p2 ? 1.2 : 1) * dt; }
      b.face = turn(b.face, Math.atan2(dx, dy), dt * 2.5);
      b.next -= dt;
      if (b.next <= 0) this.bossAttack(b, kind, p2, dx / dist, dy / dist);
    } else if (b.state === 'aim') {
      // charge line on the ground; the boss lunges along it when the warning runs out
      b.face = turn(b.face, Math.atan2(b.cx, b.cy), dt * 8);
      if (b.st >= b.ct) { b.state = 'charge'; b.st = 0; this.sound.play('boom'); this.shake = Math.max(this.shake, 0.3); }
    } else if (b.state === 'charge') {
      const sp = 14;
      b.x += b.cx * sp * dt; b.y += b.cy * sp * dt;
      if (this.rand() < 0.5) this.spray(b.x - b.cx * b.r, b.y - b.cy * b.r, 0.2, 0xd6c4a8, 2, 2);
      if (b.st * sp >= b.clen || Math.hypot(b.x, b.y) > this.R + 4) { b.state = 'walk'; b.st = 0; b.next = p2 ? 1.6 : 2.4; }
    } else if (b.state === 'burrow') {
      // the drill is under ground; it surfaces under the circle
      if (b.st >= 1.75) { b.hidden = false; b.x = b.cx; b.y = b.cy; b.state = 'walk'; b.st = 0; b.next = p2 ? 1.8 : 2.6; this.shake = Math.max(this.shake, 0.6); this.boom(b.x, b.y, 2.2, 0xe2b77a); }
    } else if (b.state === 'cast') {
      if (b.st >= b.ct) { b.state = 'walk'; b.st = 0; b.next = p2 ? 1.6 : 2.4; }
    }
    // contact damage (the mothership hovers out of reach)
    if (!b.hidden && b.dmg > 0) {
      const rr = b.r + MOMO_R;
      if (dist < rr && b.atk <= 0) { b.atk = 0.8; this.hurt(b.dmg * (b.state === 'charge' ? 1.3 : 1), b.x, b.y); }
    }
    const lim = this.R + 2, d = Math.hypot(b.x, b.y); if (d > lim) { b.x *= lim / d; b.y *= lim / d; }
  }
  bossAttack(b, kind, p2, nx, ny) {
    b.attack++;
    const dmg = this.L.dmg;
    const pickCharge = (b.attack % 2) === 1;
    if ((kind === 'tank' || kind === 'drill') && pickCharge && !(kind === 'drill' && b.attack % 4 === 3)) {
      b.state = 'aim'; b.st = 0; b.ct = p2 ? 0.9 : 1.15; b.cx = nx; b.cy = ny; b.clen = 15;
      this.hazard(1, 5, b.x, b.y, b.x + nx * 15, b.y + ny * 15, b.r * 2, b.ct, 0, 0, false);
      return;
    }
    if (kind === 'tank') {
      // cannon salvo: shells land on marked circles around Momo
      const n = p2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const a = this.rand() * TAU, r = i === 0 ? 0 : 1.6 + this.rand() * 2.6;
        this.hazard(0, 1, this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, 0, 0, 1.5, 1.25 + i * 0.12, 0.18, 17 * dmg, true);
      }
      b.state = 'cast'; b.st = 0; b.ct = 0.8;
    } else if (kind === 'drill') {
      b.state = 'burrow'; b.st = 0; b.hidden = true;
      b.cx = this.x; b.cy = this.y;
      this.hazard(0, 4, b.cx, b.cy, 0, 0, 2.1, 1.5, 0.2, 24 * dmg, true);
      this.boom(b.x, b.y, 1.6, 0xe2b77a);
      this.sound.play('boom');
    } else if (kind === 'walker') {
      if (b.attack % 2 === 1) {
        this.hazard(0, 3, b.x, b.y, 0, 0, 4.3, p2 ? 0.95 : 1.15, 0.2, 22 * dmg, true);
        b.state = 'cast'; b.st = 0; b.ct = 1.3;
      } else {
        // ice shards in a ring with gaps (rings twice when enraged)
        const rings = p2 ? 2 : 1;
        for (let k = 0; k < rings; k++) {
          const n = 16, off = this.rand() * TAU;
          for (let i = 0; i < n; i++) {
            if (i % 4 === 0) continue;
            const a = off + (i / n) * TAU, s = this.foeShots.spawn(); if (!s) break;
            const sp = 4.6 - k * 1.2;
            s.kind = 1; s.x = b.x + Math.cos(a) * b.r; s.y = b.y + Math.sin(a) * b.r; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.r = 0.3; s.dmg = 10 * dmg; s.life = 6;
          }
        }
        this.sound.play('pin');
        b.state = 'cast'; b.st = 0; b.ct = 0.9;
      }
    } else {
      // the mothership: marked beams through Momo's spot, or a bombardment cross
      if (b.attack % 3 !== 0) {
        const beams = p2 ? 3 : 1, base = Math.atan2(this.y - b.y, this.x - b.x);
        for (let i = 0; i < beams; i++) {
          const a = base + (i - (beams - 1) / 2) * 0.55, len = 30;
          this.hazard(1, 2, b.x, b.y, b.x + Math.cos(a) * len, b.y + Math.sin(a) * len, 1.5, 1.3, 0.75, 20 * dmg, true);
        }
        b.state = 'cast'; b.st = 0; b.ct = 2.0;
      } else {
        for (let i = 0; i < 5; i++) {
          const ox = i === 0 ? 0 : (i % 2 ? 1 : -1) * (i < 3 ? 2.4 : 0), oy = i === 0 ? 0 : (i >= 3 ? (i % 2 ? 2.4 : -2.4) : 0);
          this.hazard(0, 1, this.x + ox, this.y + oy, 0, 0, 1.5, 1.2 + i * 0.1, 0.2, 16 * dmg, true);
        }
        b.state = 'cast'; b.st = 0; b.ct = 1.4;
      }
    }
  }
  hazard(kind, src, x, y, x2, y2, r, warn, act, dmg, foes) {
    const h = this.haz.spawn(); if (!h) return null;
    h.kind = kind; h.src = src; h.x = x; h.y = y; h.x2 = x2; h.y2 = y2; h.r = r; h.warn = warn; h.warnMax = warn; h.act = act; h.dmg = dmg; h.hit = false; h.foes = foes; h.id = this.ids++;
    return h;
  }

  // ── weapons ──
  updateWeapons(dt) {
    const cdm = this.cdMul;
    for (const w of this.weapons) {
      const S = WEAPONS[w.id], i = this.wi(w);
      if (w.id === 'drones') { w.phase += S.spd[i] * dt; if (!w.foreign) this.droneAngle = w.phase; this.drones(w, S, i); continue; }
      w.t -= dt;
      if (w.t > 0) continue;
      if (w.id === 'blaster') {
        const tgt = this.nearest(this.x, this.y, 10);
        if (!tgt) { w.t = 0; continue; }
        w.t = S.cd[i] * cdm; this.cast(w, tgt.x, tgt.y);
        const base = Math.atan2(tgt.y - this.y, tgt.x - this.x), n = S.n[i], spread = w.evo ? 0.22 : 0.13;
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * spread, s = this.shots.spawn(); if (!s) break;
          stampAttackPayload(s, w, this);
          s.kind = 0; s.x = this.x + Math.cos(a) * 0.4; s.y = this.y + Math.sin(a) * 0.4; s.vx = Math.cos(a) * 12; s.vy = Math.sin(a) * 12;
          s.dmg = S.dmg[i] * this.damageScale; s.r = w.evo ? 0.28 : 0.22; s.life = 0.95; s.pierce = S.pierce[i]; s.id = this.ids++; s.age = 0;
        }
        this.sound.play('shot', 90);
      } else if (w.id === 'wrench') {
        const range = S.range[i], tgt = this.nearest(this.x, this.y, range + 2);
        if (!tgt) { w.t = 0; continue; }
        w.t = S.cd[i] * cdm; this.cast(w, tgt.x, tgt.y);
        const base = Math.atan2(tgt.y - this.y, tgt.x - this.x), n = S.n[i];
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * 0.55, s = this.shots.spawn(); if (!s) break;
          const v0 = 13;
          stampAttackPayload(s, w, this);
          s.kind = 1; s.x = this.x; s.y = this.y; s.vx = Math.cos(a); s.vy = Math.sin(a); s.speed = v0; s.decel = (v0 * v0) / (2 * range);
          s.out = true; s.dmg = S.dmg[i] * this.damageScale; s.r = S.size[i]; s.life = 5; s.pierce = 999; s.id = this.ids++; s.spin = 0; s.age = 0;
        }
      } else if (w.id === 'zap') {
        const tgt = this.nearest(this.x, this.y, 7.5);
        if (!tgt) { w.t = 0; continue; }
        w.t = S.cd[i] * cdm;
        this.cast(w, tgt.x, tgt.y);
        for (let k = 0; k < S.bolts[i]; k++) this.zap(k === 0 ? tgt : null, S.jumps[i], S.dmg[i] * this.damageScale, w);
        this.sound.play('pin', 120);
      } else if (w.id === 'mines') {
        w.t = S.cd[i] * cdm;
        let planted = 0; for (let j = 0; j < this.mines.n; j++) if (this.mines.items[j].weaponUid === w.uid) planted++;
        if (planted >= S.max[i]) { w.t = 0.3; continue; }
        const m = this.mines.spawn(); if (!m) continue;
        stampAttackPayload(m, w, this); this.cast(w, this.x + Math.sin(this.face), this.y + Math.cos(this.face));
        m.x = this.x; m.y = this.y; m.arm = 0.6; m.life = 24; m.dmg = S.dmg[i] * this.damageScale; m.rad = S.rad[i];
      }
    }
  }
  drones(w, S, i) {
    const n = S.n[i], rad = S.rad[i], dmg = S.dmg[i] * this.damageScale, cd = DRONE_FIELDS[w.index];
    for (let k = 0; k < n; k++) {
      const a = w.phase + (k / n) * TAU;
      const x = this.x + Math.cos(a) * rad, y = this.y + Math.sin(a) * rad;
      const c = this.near(x, y, 0.42);
      for (let j = 0; j < c; j++) {
        const e = this.en.items[this.qbuf[j]];
        if (e[cd] > 0) continue;
        e[cd] = 0.42;
        this.damage(e, dmg, x, y, true, 1.4);
      }
      const b = this.boss;
      if (b && !b.dead && !b.hidden && b[cd] <= 0 && (b.x - x) ** 2 + (b.y - y) ** 2 < (b.r + 0.42) ** 2) { b[cd] = 0.42; this.damage(b, dmg, x, y, false, 0); }
    }
    if (w.evo) {
      // Ember Crown: sparks inside the orbit drift in
      const g = this.gems.items, r2 = (rad + 1.2) ** 2;
      for (let k = 0; k < this.gems.n; k++) if ((g[k].x - this.x) ** 2 + (g[k].y - this.y) ** 2 < r2) g[k].pull = true;
    }
  }
  zap(first, jumps, dmg, weapon = this.weapon('zap')) {
    const id = this.ids++;
    let cur = first || this.nearest(this.x, this.y, 7.5, id);
    if (!cur) return;
    const bolt = this.bolts.spawn();
    let n = 0;
    if (bolt) { stampAttackPayload(bolt, weapon || makeWeapon(this.nature, 'zap'), this); bolt.pts[0] = this.x; bolt.pts[1] = this.y; n = 1; bolt.life = 0.22; }
    for (let k = 0; k <= jumps && cur; k++) {
      cur.hitZ = id;
      if (bolt && n < 20) { bolt.pts[n * 2] = cur.x; bolt.pts[n * 2 + 1] = cur.y; n++; }
      this.damage(cur, dmg, cur.x, cur.y, false, 0.5);
      const from = cur;
      cur = this.nearest(from.x, from.y, 3.8, id);
    }
    if (bolt) bolt.n = n;
  }
  updateShots(dt) {
    const it = this.shots.items;
    for (let i = this.shots.n - 1; i >= 0; i--) {
      const s = it[i];
      s.age += dt;
      if (s.kind === 0) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
      else {
        s.spin += dt * 18;
        if (s.out) {
          s.x += s.vx * s.speed * dt; s.y += s.vy * s.speed * dt; s.speed -= s.decel * dt;
          if (s.speed <= 0) { s.out = false; s.speed = 0; s.id = this.ids++; }
        } else {
          const dx = this.x - s.x, dy = this.y - s.y, d = Math.hypot(dx, dy) || 0.001;
          s.speed = Math.min(15, s.speed + 28 * dt);
          s.x += (dx / d) * s.speed * dt; s.y += (dy / d) * s.speed * dt;
          if (d < 0.6) s.life = 0;
        }
        s.life -= dt;
      }
      if (s.life > 0) {
        const c = this.near(s.x, s.y, s.r);
        for (let j = 0; j < c && s.life > 0; j++) {
          const e = this.en.items[this.qbuf[j]];
          if (s.kind === 0 ? e.hitB === s.id : e.hitW === s.id) continue;
          if (s.kind === 0) e.hitB = s.id; else e.hitW = s.id;
          const blocked = this.damage(e, s.dmg, s.x, s.y, true, s.kind === 0 ? 1.2 : 2.2);
          if (s.kind === 0) { if (blocked || s.pierce-- <= 0) s.life = 0; }
          else if (blocked) { s.out = false; s.speed = 2; s.id = this.ids++; }
        }
        const b = this.boss;
        if (s.life > 0 && b && !b.dead && !b.hidden && b.spawnIn <= 0 && (s.kind === 0 ? b.hitB !== s.id : b.hitW !== s.id) && (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < (b.r + s.r) ** 2) {
          if (s.kind === 0) { b.hitB = s.id; s.life = 0; } else b.hitW = s.id;
          this.damage(b, s.dmg, s.x, s.y, false, 0);
        }
      }
      if (s.life <= 0) {
        if (s.kind === 0) this.effect(s.nature + '_burst', s.x, s.y, Math.atan2(s.vx,s.vy), .35);
        this.shots.removeAt(i);
      }
    }
  }
  updateMines(dt) {
    const it = this.mines.items;
    for (let i = this.mines.n - 1; i >= 0; i--) {
      const m = it[i], honey = m.combo;
      m.life -= dt;
      if (m.arm > 0) { m.arm -= dt; continue; }
      let boom = m.life <= 0;
      if (!boom) boom = this.near(m.x, m.y, 0.55) > 0 || (this.boss && !this.boss.dead && !this.boss.hidden && (this.boss.x - m.x) ** 2 + (this.boss.y - m.y) ** 2 < (this.boss.r + 0.55) ** 2);
      if (!boom) continue;
      const c = this.near(m.x, m.y, m.rad);
      for (let j = 0; j < c; j++) { const e = this.en.items[this.qbuf[j]]; this.damage(e, m.dmg, m.x, m.y, false, 3); if (honey) e.slow = 2.6; }
      const b = this.boss;
      if (b && !b.dead && !b.hidden && (b.x - m.x) ** 2 + (b.y - m.y) ** 2 < (b.r + m.rad) ** 2) this.damage(b, m.dmg, m.x, m.y, false, 0);
      this.boom(m.x, m.y, m.rad, parseInt(NATURE_COLORS[m.nature].slice(1), 16));
      this.effect(m.nature + '_burst', m.x, m.y, 0, m.rad * .45);
      this.sound.play('boom', 140);
      this.shake = Math.max(this.shake, 0.18);
      this.mines.removeAt(i);
    }
  }
  /** Hit an enemy. Natural guards block hits from the front while their shield holds. Returns true when blocked. */
  damage(e, dmg, fx, fy, blockable, knock) {
    if (e.dead || e.hidden) return false;
    if (blockable && e.shield > 0) {
      const dx = fx - e.x, dy = fy - e.y, d = Math.hypot(dx, dy) || 1;
      if ((dx * Math.sin(e.face) + dy * Math.cos(e.face)) / d > 0.3) {
        e.shield -= dmg;
        this.spray(fx, fy, 0.7, 0xfde68a, 3, 2.2);
        this.sound.play('hit', 80);
        if (e.shield <= 0) { this.popup('NATURSCHUTZ GEBROCHEN', e.x, e.y, 1.9, '#fdba74', 0.7); this.spray(e.x, e.y, 0.8, 0xf97316, 14, 3); }
        return true;
      }
    }
    e.hp -= dmg; e.flash = 0.1; e.hitAt=this.time;
    if (knock && !e.boss) { const dx = e.x - fx, dy = e.y - fy, d = Math.hypot(dx, dy) || 1; e.kx += (dx / d) * knock / e.mass; e.ky += (dy / d) * knock / e.mass; }
    if (this.pops.n < 14 || ((e.boss || e.elite) && this.pops.n < 24)) this.popup(num(dmg), e.x, e.y, (e.boss ? e.def.h : e.def.h * e.scale) + 0.2, e.boss || e.elite ? '#fde047' : '#ffffff', e.boss ? 0.8 : 0.6);
    this.sound.play('hit', 70);
    if (e.hp <= 0) this.kill(e);
    return false;
  }
  kill(e) {
    e.dead = true;
    if (e.boss) { this.bossDown(e); return; }
    this.kills++;
    this.score += e.score;
    const def = e.def;
    this.releaseFernling(e);
    this.sound.play('kill', 60);
    if (e.elite) {
      this.elitesKilled++;
      this.dropGem(e.x, e.y, 3, 0);
      this.popup('BEFREIT!', e.x, e.y, 2.2, '#fde047', 1);
      this.ring(e.x, e.y, 2.5, 0xfde047, 0.6);
      this.shake = Math.max(this.shake, 0.4);
    } else {
      this.dropGem(e.x, e.y, 0, e.xp);
      const r = this.rand();
      if (r < 0.012) this.dropGem(e.x + 0.3, e.y, 1, 0);
      else if (r < 0.016) this.dropGem(e.x - 0.3, e.y, 2, 0);
    }
    // Two separately arriving Fernlings replace the old biological split.
    if (def.split && this.L.world >= 2) {
      for (let k = 0; k < def.split; k++) {
        const a = e.face + (k ? 1.6 : -1.6);
        this.spawnEnemy('zorbling', this.x + Math.sin(a) * SPAWN_DIST, this.y + Math.cos(a) * SPAWN_DIST, false);
      }
    }
  }
  releaseFernling(e) {
    const c=this.freed.spawn();
    if(c){c.kind=e.kind;c.x=e.x;c.y=e.y;c.face=e.face;c.life=30;c.age=0;c.scale=e.scale;c.elite=e.elite;c.kx=e.kx;c.ky=e.ky;c.stride=0;c.broken=false;c.visible=true;c.outside=0;}
    return c;
  }
  bossDown(b) {
    this.kills++;
    this.score += b.score;
    this.shake = 1.4;
    b.defeatedAt = this.time; this.effect(this.L.boss === 'tank' ? 'robot_break' : 'hex_break', b.x, b.y, b.face, 2);
    if (this.L.boss === 'tank') for (let k = 0; k < 4; k++) this.boom(b.x + Math.cos(k * 1.7) * 1.2, b.y + Math.sin(k * 1.7) * 1.2, 3.2, k % 2 ? 0xfacc15 : 0xf97316);
    this.popup(this.L.boss === 'tank' ? 'GOLEM GEBANNT' : 'HEX GELÖST', b.x, b.y, 4, '#fde047', 1.4);
    this.sound.play('boom');
    for (let k = 0; k < 12; k++) this.dropGem(b.x + Math.cos(k) * 1.5, b.y + Math.sin(k) * 1.5, 0, 5);
  }
  dropGem(x, y, kind, v) {
    const g = this.gems.spawn();
    if (!g) {
      // full: fold the value into an existing spark (nothing is lost, nothing allocated)
      if (kind === 0 && this.gems.n) { const o = this.gems.items[(this.ids++) % this.gems.n]; if (o.kind === 0) o.v += v; }
      return;
    }
    g.kind = kind; g.x = x; g.y = y; g.v = v; g.pull = false; g.bob = this.fxr() * TAU;
  }
  updateGems(dt) {
    const it = this.gems.items, mr = this.magnetR, mr2 = mr * mr;
    for (let i = this.gems.n - 1; i >= 0; i--) {
      const g = it[i];
      const dx = this.x - g.x, dy = this.y - g.y, d2 = dx * dx + dy * dy;
      if (!g.pull && d2 < mr2) g.pull = true;
      if (!g.pull) continue;
      const d = Math.sqrt(d2) || 0.001, sp = Math.min(16, 5 + 40 / (d + 1));
      g.x += (dx / d) * sp * dt; g.y += (dy / d) * sp * dt;
      if (d < 0.45) { this.collect(g); this.gems.removeAt(i); }
    }
  }
  collect(g) {
    if (g.kind === 0) {
      this.xp += g.v; this.score += g.v;
      this.sound.play('coin', 45);
      while (this.xp >= this.need) {
        this.xp -= this.need; this.level++; this.need = xpNeed(this.level); this.evolve();
        this.levelFlash = 1;
        this.openChoice('level');
      }
    } else if (g.kind === 1) { this.hp = Math.min(this.maxHp, this.hp + 25); this.popup('+25', this.x, this.y, 1.8, '#86efac', 0.9); this.sound.play('good'); }
    else if (g.kind === 2) { for (let k = 0; k < this.gems.n; k++) this.gems.items[k].pull = true; this.say('MAGNET!', 1, '#93c5fd'); this.sound.play('upgrade'); }
    else { this.hp = Math.min(this.maxHp, this.hp + 20); this.score += 200; this.openChoice('chest'); }
  }
  updateFoeShots(dt) {
    const it = this.foeShots.items;
    for (let i = this.foeShots.n - 1; i >= 0; i--) {
      const s = it[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      const rr = s.r + MOMO_R * 0.8;
      if ((s.x - this.x) ** 2 + (s.y - this.y) ** 2 < rr * rr) { this.hurt(s.dmg, s.x, s.y); s.life = 0; this.spray(s.x, s.y, 0.6, s.kind ? 0xbae6fd : 0xa3e635, 8, 2); }
      if (s.life <= 0) this.foeShots.removeAt(i);
    }
  }
  updateHazards(dt) {
    const it = this.haz.items;
    for (let i = this.haz.n - 1; i >= 0; i--) {
      const h = it[i];
      if (h.warn > 0) {
        h.warn -= dt;
        if (h.warn <= 0) {
          if (h.act <= 0) { this.haz.removeAt(i); continue; }
          // it goes off
          if (h.kind === 0) { this.boom(h.x, h.y, h.r, h.src === 3 ? 0xbae6fd : h.src === 4 ? 0xe2b77a : 0xf97316); this.sound.play('boom', 100); this.shake = Math.max(this.shake, 0.3); }
          else { this.sound.play(h.src === 0 ? 'sizzle' : 'boom', 100); }
        }
        continue;
      }
      if (!h.hit && this.inHazard(h, this.x, this.y, MOMO_R * 0.5)) { h.hit = true; this.hurt(h.dmg, h.x, h.y); }
      if (h.foes) {
        const en = this.en.items;
        for (let k = 0; k < this.en.n; k++) {
          const e = en[k];
          if (e.dead || e.boss || e.fly || e.hitH === h.id) continue;
          if (this.inHazard(h, e.x, e.y, e.r * 0.5)) { e.hitH = h.id; this.damage(e, h.dmg * 0.8, h.x, h.y, false, 2); }
        }
      }
      if (h.src === 0 && this.fxr() < 0.5) {
        const t = this.fxr();
        this.spray(h.x + (h.x2 - h.x) * t, h.y + (h.y2 - h.y) * t, 0.1, this.fxr() < 0.5 ? 0xff7a1f : 0xffd166, 1, 2.6);
      }
      h.act -= dt;
      if (h.act <= 0) this.haz.removeAt(i);
    }
  }
  inHazard(h, x, y, pad) {
    if (h.kind === 0) return (x - h.x) ** 2 + (y - h.y) ** 2 < (h.r + pad) ** 2;
    const ax = h.x2 - h.x, ay = h.y2 - h.y, l2 = ax * ax + ay * ay || 1;
    const t = clamp(((x - h.x) * ax + (y - h.y) * ay) / l2, 0, 1);
    const px = h.x + ax * t - x, py = h.y + ay * t - y;
    return px * px + py * py < (h.r / 2 + pad) ** 2;
  }
  updateFeatures(dt) {
    for (const s of this.storms) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.spin += dt;
      const d = Math.hypot(s.x, s.y), lim = this.R - 2;
      if (d > lim) { const nx = s.x / d, ny = s.y / d, dot = s.vx * nx + s.vy * ny; if (dot > 0) { s.vx -= 2 * dot * nx; s.vy -= 2 * dot * ny; } }
    }
    if (this.L.feature === 'lava') {
      this.lavaT -= dt;
      if (this.lavaT <= 0) {
        const n = this.index % 11;
        this.lavaT = Math.max(3.6, 6.5 - n * 0.25) * (this.boss ? 1.4 : 1);
        const count = 1 + Math.floor(n / 4);
        for (let k = 0; k < count; k++) {
          const a = this.rand() * TAU, r = this.rand() * 4, cx = this.x + Math.cos(a) * r, cy = this.y + Math.sin(a) * r, o = this.rand() * Math.PI, len = 5 + this.rand() * 2;
          this.hazard(1, 0, cx - Math.cos(o) * len / 2, cy - Math.sin(o) * len / 2, cx + Math.cos(o) * len / 2, cy + Math.sin(o) * len / 2, 1.0, 1.5, 1.1, 14 * this.L.dmg, true);
        }
      }
    }
  }
  compactEnemies() {
    const it = this.en.items;
    for (let i = this.en.n - 1; i >= 0; i--) if (it[i].dead && it[i].freedAt < 0) this.en.removeAt(i);
  }

  hurt(amount, fx, fy) {
    if (this.iframes > 0 || this.result || this.hp <= 0) return;
    const dmg = amount * (1 - 0.08 * this.passives.armour);
    this.hp -= dmg; this.iframes = 0.45; this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 0.35);
    this.popup(num(dmg), this.x, this.y, 1.9, '#f87171', 0.75);
    this.sound.play('hurt', 150);
    const dx = this.x - fx, dy = this.y - fy, d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 3; this.vy += (dy / d) * 3;
  }

  // ── goal ──
  goalText(short = false) {
    const L = this.L;
    if (L.goal === 'survive') return short ? `HALTE DURCH ${fmtTime(L.time)}` : `HALTE DURCH  ${fmtTime(L.time - this.t)}`;
    if (L.goal === 'defend') return short ? 'SCHÜTZE DAS ARCHIV' : `ARCHIVSCHUTZ  ${fmtTime(L.time - this.t)}`;
    if (L.goal === 'elites') return short ? `BEFREIE ${L.elites} ELITEN` : `ELITEN  ${this.elitesKilled} / ${L.elites}`;
    return BOSSES[L.boss].name;
  }
  checkGoal() {
    const L = this.L;
    if (this.hp <= 0) { this.hp = 0; this.lose('Dein Fernling braucht eine Pause'); return; }
    if (this.gen && this.gen.hp <= 0) { this.gen.hp = 0; this.boom(this.gen.x, this.gen.y, 3, 0xf97316); this.lose('Das Archiv wurde überrannt'); return; }
    const done = L.goal === 'survive' || L.goal === 'defend' ? this.t >= L.time
      : L.goal === 'elites' ? this.elitesKilled >= L.elites
        : this.boss && this.boss.dead;
    if (done) this.win();
  }
  win() {
    const L = this.L;
    const hpShare = this.hp / this.maxHp, killShare = this.spawned ? this.kills / this.spawned : 1;
    let stars = 1, why;
    if (L.goal === 'defend') {
      const gs = this.gen.hp / this.gen.max;
      stars = gs >= 0.5 ? (hpShare >= 0.4 ? 3 : 2) : 1;
      why = `Archiv ${Math.round(gs * 100)} %, Leben ${Math.round(hpShare * 100)} % (★★ Archiv 50 %, ★★★ zusätzlich Leben 40 %).`;
    } else if (L.goal === 'survive') {
      stars = hpShare >= 0.4 ? (killShare >= 0.7 ? 3 : 2) : 1;
      why = `Leben ${Math.round(hpShare * 100)} %, ${Math.round(killShare * 100)} % der Schar befreit (★★ Leben 40 %, ★★★ zusätzlich 70 % befreit).`;
    } else {
      stars = hpShare >= 0.4 ? (this.t <= L.par ? 3 : 2) : 1;
      why = `Leben ${Math.round(hpShare * 100)} %, ${fmtTime(this.t)} (★★ Leben 40 %, ★★★ zusätzlich unter ${fmtTime(L.par)}).`;
    }
    this.score += 500 + Math.round(this.hp * 5) + (this.gen ? Math.round(this.gen.hp * 3) : 0);
    this.resultAt = this.time; this.settlementSeconds = this.L.boss === 'drill' ? 5.2 : this.L.boss === 'mothership' ? 4.6 : 3.3;
    this.result = { won: true, stars, score: this.score, reason: why, stats: { kills: this.kills } };
    // The remaining Fernlings lose their hex and leave alive.
    const it = this.en.items;
    for(let i=0;i<this.en.n;i++){const e=it[i];if(!e.dead&&!e.boss){
      // Keep the victory crowd in its existing slots: every creature gets the
      // full release without allocating a second victory crowd.
      e.dead=true;e.freedAt=this.time;e.stride=0;
    }}
    this.compactEnemies();
    this.foeShots.n = 0; this.haz.n = 0; this.shots.n = 0; this.mines.n = 0; this.bolts.n = 0;
    this.say('MORGENLICHT!', 2.5, '#fde047');
    this.effect('xp_sparks', this.x, this.y, 0, 1.4);
  }
  lose(reason) {
    this.resultAt = this.time; this.settlementSeconds = 1.4;
    this.result = { won: false, stars: 0, score: this.score, reason, stats: { kills: this.kills } };
    this.shake = 1;
    this.say(reason === 'Das Archiv wurde überrannt' ? 'ARCHIV VERLOREN' : 'ERSCHÖPFT', 2.5, '#f87171');
  }

  // ── effects ──
  say(text, dur, color = '#ffffff') { this.banner = { text, color, dur }; this.bannerT = dur; }
  spray(x, y, h, color, count, speed = 1.6) {
    if (this.preview) return;
    const r = this.fxr;
    for (let i = 0; i < count; i++) {
      const p = this.parts.spawn(); if (!p) return;
      p.x = x; p.y = y; p.h = h; p.vx = (r() - 0.5) * speed * 2; p.vy = (r() - 0.5) * speed * 2; p.vh = r() * speed * 2;
      p.life = p.max = 0.45 + r() * 0.4; p.size = 0.06 + r() * 0.07; p.color = color; p.grav = 9;
    }
  }
  boom(x, y, radius, color) {
    if (this.preview) return;
    this.ring(x, y, radius, color, 0.45);
    const r = this.fxr;
    for (let i = 0; i < 18; i++) {
      const p = this.parts.spawn(); if (!p) return;
      const a = r() * TAU, v = 1.5 + r() * 4;
      p.x = x; p.y = y; p.h = 0.3; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vh = 2 + r() * 4;
      p.life = p.max = 0.5 + r() * 0.4; p.size = 0.1 + r() * 0.1; p.color = i % 3 ? color : 0xfff3c4; p.grav = 8;
    }
  }
  ring(x, y, r, color, life) { if (this.preview) return; const g = this.rings.spawn(); if (!g) return; g.x = x; g.y = y; g.r = r; g.life = g.max = life; g.color = color; }
  confetti() {
    const p = this.parts.spawn(); if (!p) return; const r = this.fxr;
    const colors = [0xf43f5e, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7];
    p.x = this.x + (r() - 0.5) * 6; p.y = this.y + (r() - 0.5) * 5; p.h = 3 + r() * 2; p.vx = (r() - 0.5) * 2; p.vy = (r() - 0.5) * 2; p.vh = r() * 3;
    p.life = p.max = 2.4; p.size = 0.12; p.color = colors[Math.floor(r() * 5)]; p.grav = 3;
  }
  popup(text, x, y, h, color, size) {
    if (this.preview) return;
    const p = this.pops.spawn(); if (!p) return;
    p.text = text; p.x = x + (this.fxr() - 0.5) * 0.3; p.y = y; p.h = h; p.life = p.max = 0.8; p.color = color; p.size = size;
  }
  updateFx(dt) {
    this.shake = Math.max(0, this.shake - dt * 3);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.levelFlash = Math.max(0, this.levelFlash - dt * 2);
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.choice) return;
    const P = this.parts.items;
    for (let i = this.parts.n - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.removeAt(i); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt; p.vh -= p.grav * dt;
      if (p.h < 0) { p.h = 0; p.vh *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    }
    const G = this.rings.items;
    for (let i = this.rings.n - 1; i >= 0; i--) { G[i].life -= dt; if (G[i].life <= 0) this.rings.removeAt(i); }
    const C = this.freed.items;
    for (let i=this.freed.n-1;i>=0;i--) {
      const c=C[i],previous=c.age;c.age+=dt;c.life-=dt;
      // The winning impact carries through; paws then plant while the curse cracks.
      if(previous<FREED_RECOIL){const span=Math.min(dt,FREED_RECOIL-previous),k=(1-Math.exp(-span*9))/9;c.x+=c.kx*k;c.y+=c.ky*k;c.kx*=Math.exp(-span*9);c.ky*=Math.exp(-span*9);}
      if(!c.broken&&c.age>=FREED_BREAK){c.broken=true;this.effect('hex_break',c.x,c.y,c.face,c.elite?1.2:.7);}
      if(c.age>.75&&previous<FREED_ESCAPE)c.face=turn(c.face,Math.atan2(c.x,c.y),Math.min(dt,FREED_ESCAPE-previous)*5);
      if(c.age>FREED_ESCAPE){const span=Math.min(dt,c.age-FREED_ESCAPE),speed=4.6*Math.min(1,(c.age-FREED_ESCAPE)/.4);c.face=turn(c.face,Math.atan2(c.x,c.y),span*5);const travel=span*speed;c.x+=Math.sin(c.face)*travel;c.y+=Math.cos(c.face)*travel;c.stride+=travel;}
      // The renderer reports the entire current pose outside the real camera
      // frustum. Retain for a short margin; 2D fallback uses an off-field exit.
      if(c.age>FREED_ESCAPE)c.outside=c.visible?0:c.outside+dt;
      if(c.outside>.2||(Math.hypot(c.x,c.y)>this.R+18&&Math.hypot(c.x-this.x,c.y-this.y)>24))this.freed.removeAt(i);
    }
    const O = this.pops.items;
    for (let i = this.pops.n - 1; i >= 0; i--) { O[i].life -= dt; O[i].h += dt * 1.4; if (O[i].life <= 0) this.pops.removeAt(i); }
    const B = this.bolts.items;
    for (let i = this.bolts.n - 1; i >= 0; i--) { B[i].life -= dt; if (B[i].life <= 0) this.bolts.removeAt(i); }
  }
  /** Menu backdrop: the selected Fernling faces a ring of hexed creatures. */
  stagePreview() {
    this.y = 0;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + this.rand() * 0.2, d = 3.6 + this.rand() * 5;
      const kinds = this.mixKeys;
      const e = this.spawnEnemy(kinds[i % kinds.length], Math.cos(a) * d, Math.sin(a) * d, false);
      if (e) { e.spawnIn = 0; e.face = Math.atan2(-e.x, -e.y); }
    }
    for (let i = 0; i < 18; i++) this.dropGem((this.rand() - 0.5) * 8, (this.rand() - 0.5) * 6, 0, 1);
    this.addWeapon('drones');
  }

  // ── drawing ──
  /** World point → CSS px on the canvas (shared result object: read it before the next call). */
  proj(x, y, h = 0) {
    if (this.projFn) return this.projFn(x, y, h);
    const L = this.layout, o = this._p;
    o.x = L.cx + (x - L.camX) * L.k; o.y = L.cy + (y - L.camY) * L.k * 0.82 - h * L.k * 0.85; o.s = L.k;
    return o;
  }
  render(g, view) {
    const { w, h } = view;
    if (view.gl) {
      this.projFn = view.gl.projectFn();
      this.unproj = view.gl.groundAt;
      this.layout = { w, h };
    } else {
      this.projFn = null; this.unproj = null;
      const k = Math.min(w, h) / 15;
      this.layout = { w, h, k, cx: w / 2, cy: h / 2, camX: this.x, camY: this.y };
      this.draw2d(g, view);
    }
    this.drawOverlay(g, view);
  }

  /** Plain 2D fallback (no WebGL): a top-down sketch of the arena. */
  draw2d(g, view) {
    const { w, h } = view, L = this.layout;
    const pal = ['#7fbf5a', '#e7c07c', '#e6eef7', '#3b3134'][this.L.world];
    g.fillStyle = view.dark ? '#111827' : '#1f2937'; g.fillRect(0, 0, w, h);
    const c = this.proj(0, 0);
    g.fillStyle = pal; g.beginPath(); g.ellipse(c.x, c.y, this.R * L.k, this.R * L.k * 0.82, 0, 0, TAU); g.fill();
    for (const p of this.ice) { const q = this.proj(p.x, p.y); g.fillStyle = 'rgba(186,230,253,.8)'; g.beginPath(); g.ellipse(q.x, q.y, p.r * L.k, p.r * L.k * 0.82, 0, 0, TAU); g.fill(); }
    for (const s of this.storms) { const q = this.proj(s.x, s.y); g.fillStyle = 'rgba(214,170,110,.45)'; g.beginPath(); g.ellipse(q.x, q.y, s.r * L.k, s.r * L.k * 0.82, 0, 0, TAU); g.fill(); }
    for (let i = 0; i < this.haz.n; i++) {
      const z = this.haz.items[i], hot = z.warn <= 0;
      g.fillStyle = hot ? 'rgba(249,115,22,.75)' : `rgba(239,68,68,${0.2 + 0.25 * (1 - z.warn / z.warnMax)})`;
      g.strokeStyle = g.fillStyle;
      if (z.kind === 0) { const q = this.proj(z.x, z.y); g.beginPath(); g.ellipse(q.x, q.y, z.r * L.k, z.r * L.k * 0.82, 0, 0, TAU); g.fill(); }
      else { const a = this.proj(z.x, z.y), ax = a.x, ay = a.y, b = this.proj(z.x2, z.y2); g.lineWidth = z.r * L.k; g.lineCap = 'round'; g.beginPath(); g.moveTo(ax, ay); g.lineTo(b.x, b.y); g.stroke(); g.lineCap = 'butt'; }
    }
    if (this.gen) { const q = this.proj(this.gen.x, this.gen.y); g.fillStyle = this.gen.flash > 0 ? '#fff' : '#22c55e'; g.beginPath(); g.arc(q.x, q.y - L.k * 0.4, GEN_R * L.k, 0, TAU); g.fill(); }
    for (let i = 0; i < this.gems.n; i++) { const m = this.gems.items[i], q = this.proj(m.x, m.y, 0.2); g.fillStyle = m.kind === 1 ? '#f43f5e' : m.kind === 3 ? '#facc15' : '#67e8f9'; g.fillRect(q.x - 3, q.y - 3, 6, 6); }
    for (let i = 0; i < this.mines.n; i++) { const m = this.mines.items[i], q = this.proj(m.x, m.y); g.fillStyle = NATURE_COLORS[m.nature]; g.beginPath(); g.arc(q.x, q.y, L.k * 0.22, 0, TAU); g.fill(); }
    for (let i = 0; i < this.en.n; i++) {
      const e = this.en.items[i];
      if (e.dead || e.hidden) continue;
      const q = this.proj(e.x, e.y, 0.4), r = e.r * L.k;
      g.fillStyle = e.flash > 0 ? '#fff' : e.boss ? '#b91c1c' : e.elite ? '#facc15' : e.def.color;
      g.beginPath(); g.arc(q.x, q.y, r, 0, TAU); g.fill();
    }
    const m = this.proj(this.x, this.y, 0.45);
    g.fillStyle = this.iframes > 0 ? '#fff' : '#facc15'; g.beginPath(); g.arc(m.x, m.y, MOMO_R * L.k * 1.2, 0, TAU); g.fill();
    g.fillStyle = '#c2410c'; g.beginPath(); g.arc(m.x, m.y - MOMO_R * L.k * 0.9, MOMO_R * L.k * 0.8, 0, TAU); g.fill();
    for (let i = 0; i < this.shots.n; i++) { const s = this.shots.items[i], q = this.proj(s.x, s.y, 0.5); g.fillStyle = NATURE_COLORS[s.nature]; g.beginPath(); g.arc(q.x, q.y, Math.max(2, s.r * L.k), 0, TAU); g.fill(); }
    for (let i = 0; i < this.foeShots.n; i++) { const s = this.foeShots.items[i], q = this.proj(s.x, s.y, 0.5); g.fillStyle = s.kind ? '#bae6fd' : '#a3e635'; g.beginPath(); g.arc(q.x, q.y, s.r * L.k, 0, TAU); g.fill(); }
    for (const wd of this.weapons) if (wd.id === 'drones') {
      const S = WEAPONS.drones, i = this.wi(wd);
      for (let k = 0; k < S.n[i]; k++) { const a = wd.phase + (k / S.n[i]) * TAU, q = this.proj(this.x + Math.cos(a) * S.rad[i], this.y + Math.sin(a) * S.rad[i], 0.7); g.fillStyle = NATURE_COLORS[wd.nature]; g.beginPath(); g.arc(q.x, q.y, L.k * 0.2, 0, TAU); g.fill(); }
    }
    g.strokeStyle = '#e9d5ff'; g.lineWidth = 2;
    for (let i = 0; i < this.bolts.n; i++) {
      const b = this.bolts.items[i]; g.beginPath();
      for (let k = 0; k < b.n; k++) { const q = this.proj(b.pts[k * 2], b.pts[k * 2 + 1], 0.6); if (k) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
      g.stroke();
    }
    for (let i = 0; i < this.parts.n; i++) { const p = this.parts.items[i], q = this.proj(p.x, p.y, p.h); g.fillStyle = '#' + p.color.toString(16).padStart(6, '0'); g.fillRect(q.x - 2, q.y - 2, 4, 4); }
  }

  drawOverlay(g, view) {
    const { w, h } = view;
    // world-anchored labels: Momo's health, the generator, damage numbers
    if (!this.preview) {
      const m = this.proj(this.x, this.y, 1.85);
      const mx = m.x, my = m.y;
      this.bar(g, mx, my, 46, 6, this.hp / this.maxHp, this.hp / this.maxHp > 0.35 ? '#4ade80' : '#f87171');
      if (this.gen) {
        const q = this.proj(this.gen.x, this.gen.y, 2.9);
        this.bar(g, q.x, q.y, 70, 8, this.gen.hp / this.gen.max, '#38bdf8');
        if (this.genRepair && this.gen.hp < this.gen.max) label(g, 'SCHUTZ ERNEUERT', q.x, q.y - 14, 11, '#bae6fd', 'rgba(0,0,0,.6)');
        this.edgeArrow(g, w, h, q.x, q.y + 30, '#38bdf8');
      }
      for (let i = 0; i < this.en.n; i++) {
        const e = this.en.items[i];
        if (e.dead || !e.elite) continue;
        const q = this.proj(e.x, e.y, e.def.h * e.scale + 0.45);
        this.bar(g, q.x, q.y, 40, 5, e.hp / e.maxHp, '#facc15');
        this.edgeArrow(g, w, h, q.x, q.y, '#facc15');
      }
      if (this.boss && !this.boss.dead && !this.boss.hidden) { const q = this.proj(this.boss.x, this.boss.y, 2); this.edgeArrow(g, w, h, q.x, q.y, '#f87171'); }
      const P = this.pops.items;
      for (let i = 0; i < this.pops.n; i++) {
        const p = P[i], q = this.proj(p.x, p.y, p.h), age = 1 - p.life / p.max;
        g.globalAlpha = Math.min(1, p.life * 4);
        label(g, p.text, q.x, q.y, Math.round(20 * p.size * (age < 0.15 ? 0.7 + age * 2 : 1)), p.color, 'rgba(0,0,0,.6)', 900);
      }
      g.globalAlpha = 1;
    }
    // screen flashes
    if (this.hurtFlash > 0) {
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(239,68,68,0)'); v.addColorStop(1, `rgba(239,68,68,${0.45 * this.hurtFlash})`);
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }
    if (this.inStorm) { g.fillStyle = 'rgba(214,170,110,.18)'; g.fillRect(0, 0, w, h); }
    if (this.preview) { g.fillStyle = view.dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.12)'; g.fillRect(0, 0, w, h); return; }
    this.drawTop(g, view);
    this.drawLoadout(g, view);
    if (this.stick && !this.choice) {
      const s = this.stick;
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3; g.beginPath(); g.arc(s.x0, s.y0, 46, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fill();
      const dx = s.x - s.x0, dy = s.y - s.y0, d = Math.hypot(dx, dy), k = d > 46 ? 46 / d : 1;
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(s.x0 + dx * k, s.y0 + dy * k, 20, 0, TAU); g.fill();
    }
    if (this.banner && this.bannerT > 0) {
      const b = this.banner, age = b.dur - this.bannerT;
      g.globalAlpha = Math.min(1, this.bannerT * 2, age * 6);
      const sc = age < 0.15 ? 0.7 + age * 2 : 1;
      label(g, b.text, w / 2, Math.max(160, h * 0.3), Math.round(Math.min(40, w / 14) * sc), b.color, 'rgba(0,0,0,.6)', 900);
      g.globalAlpha = 1;
    }
    if (this.choice) this.drawCards(g, view);
  }
  bar(g, x, y, bw, bh, v, color) {
    g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, x - bw / 2 - 2, y - bh / 2 - 2, bw + 4, bh + 4, (bh + 4) / 2); g.fill();
    g.fillStyle = color; roundRect(g, x - bw / 2, y - bh / 2, Math.max(bh, bw * clamp(v, 0, 1)), bh, bh / 2); g.fill();
  }
  /** A small arrow at the screen edge pointing at something off screen. */
  edgeArrow(g, w, h, x, y, color) {
    const pad = 22, top = 118;
    if (x > pad && x < w - pad && y > top && y < h - pad) return;
    const cx = w / 2, cy = (h + top) / 2;
    const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx);
    const sx = Math.abs(dx) > 1e-3 ? (w / 2 - pad) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 1e-3 ? ((h - top) / 2 - pad) / Math.abs(dy) : Infinity, s = Math.min(sx, sy);
    const px = cx + dx * s, py = cy + dy * s;
    g.save(); g.translate(px, py); g.rotate(a);
    g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-7, -9); g.lineTo(-3, 0); g.lineTo(-7, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  drawTop(g, view) {
    const { w } = view;
    // spark meter with Momo's level
    const y = 66, x0 = 46, x1 = w - 14;
    g.fillStyle = 'rgba(9,9,11,.55)'; roundRect(g, x0 - 2, y - 2, x1 - x0 + 4, 12, 6); g.fill();
    if (!this.xpGrad || this.xpGradW !== w) { this.xpGradW = w; this.xpGrad = g.createLinearGradient(x0, 0, x1, 0); this.xpGrad.addColorStop(0, '#22d3ee'); this.xpGrad.addColorStop(1, '#a3e635'); }
    g.fillStyle = this.xpGrad; roundRect(g, x0, y, Math.max(8, (x1 - x0) * clamp(this.xp / this.need, 0, 1)), 8, 4); g.fill();
    if (this.levelFlash > 0) { g.fillStyle = `rgba(255,255,255,${this.levelFlash * 0.6})`; roundRect(g, x0, y, x1 - x0, 8, 4); g.fill(); }
    g.fillStyle = '#0f172a'; g.beginPath(); g.arc(26, y + 4, 17, 0, TAU); g.fill();
    g.strokeStyle = '#a3e635'; g.lineWidth = 2.5; g.stroke();
    label(g, 'LV', 26, y - 3, 8, '#a3e635', 'rgba(0,0,0,0)', 800);
    label(g, String(this.level), 26, y + 7, 13, '#fff', 'rgba(0,0,0,.4)', 900);
    label(g, this.model.replaceAll('_', ' ') + (this.stage < 2 ? ' · Entwicklung LV ' + (this.stage ? 10 : 5) : ' · Hochform'), w / 2, 121, 11, NATURE_COLORS[this.nature], 'rgba(0,0,0,.65)');
    // goal line
    const L = this.L;
    if (L.goal === 'boss' && this.boss && !this.boss.dead) {
      const bw = Math.min(w - 60, 360), bx = (w - bw) / 2, by = 88;
      g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, bx - 3, by - 3, bw + 6, 20, 8); g.fill();
      g.fillStyle = this.boss.phase2 ? '#f97316' : '#ef4444'; roundRect(g, bx, by, Math.max(0, bw * this.boss.hp / this.boss.maxHp), 14, 6); g.fill();
      label(g, BOSSES[L.boss].name, w / 2, by + 7, 11, '#fff', 'rgba(0,0,0,.7)');
    } else {
      const text = this.result ? (this.result.won ? 'DIE ABTEI IST SICHER' : 'ZEIT ZUM AUSRUHEN') : L.goal === 'boss' ? `BOSS IN ${fmtTime(BOSS_AT - this.t)}` : this.goalText();
      label(g, text, w / 2, 96, 15, '#fff', 'rgba(0,0,0,.65)', 800);
    }
  }
  /** The loadout row at the bottom left: weapons, then passives, with level pips. */
  drawLoadout(g, view) {
    const y = view.h - 34;
    let x = 14;
    for (const wpn of this.weapons) { x = chip(g, x, y, wpn.nature, wpn.lv, wpn.evo, NATURE_COLORS[wpn.nature]); if (wpn.foreign) label(g, 'F', x - 11, y - 5, 9, '#ffe199', '#182231'); }
    x += 6;
    for (const id of PASSIVE_IDS) if (this.passives[id]) x = chip(g, x, y, id, this.passives[id], false, PASSIVES[id].color);
  }
  drawCards(g, view) {
    const { w, h } = view, ch = this.choice, a = Math.min(1, ch.t * 5);
    g.fillStyle = `rgba(4,6,12,${0.55 * a})`; g.fillRect(0, 0, w, h);
    const narrow = w < 640;
    const n = ch.cards.length;
    const cw = narrow ? Math.min(w - 32, 380) : 214, chh = narrow ? 96 : 272, gap = narrow ? 12 : 18;
    const totalW = narrow ? cw : n * cw + (n - 1) * gap, totalH = narrow ? n * chh + (n - 1) * gap : chh;
    const x0 = (w - totalW) / 2, y0 = Math.max(116, (h - totalH) / 2 + 20);
    label(g, ch.reason === 'workshop' ? 'WERKSTATT-HILFE — WÄHLE EINE KARTE' : ch.reason === 'chest' ? 'BEFREIUNG — WÄHLE EINE KARTE' : ch.reason === 'kit' ? 'STARTVORRAT — WÄHLE EINE KARTE' : `LEVEL ${this.level} — WÄHLE EINE KARTE`, w / 2, y0 - 30, narrow ? 18 : 24, '#fde047', 'rgba(0,0,0,.7)', 900);
    const rects = this.cardRects = this.cardRects || [];
    rects.length = n;
    for (let i = 0; i < n; i++) {
      const c = ch.cards[i];
      const pop = Math.min(1, Math.max(0, ch.t * 6 - i * 0.6));
      const x = narrow ? x0 : x0 + i * (cw + gap), y = (narrow ? y0 + i * (chh + gap) : y0) + (1 - pop) * 30;
      rects[i] = { x, y, w: cw, h: chh };
      g.globalAlpha = pop;
      const sel = view.keyboard && ch.sel === i;
      g.fillStyle = c.type === 'evo' ? '#2a1d05' : '#0f172a'; roundRect(g, x, y, cw, chh, 14); g.fill();
      g.lineWidth = sel ? 4 : 2.5; g.strokeStyle = c.type === 'evo' ? '#fde047' : sel ? '#ffffff' : c.color; g.stroke();
      const tag = c.type === 'fossil' ? 'FOSSIL · BIS LEVELENDE' : c.type === 'evo' ? 'COMBO' : c.type === 'heal' ? 'SNACK' : c.lv === 1 ? 'NEW' : `LEVEL ${c.lv}`;
      if (narrow) {
        g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(x + 46, y + chh / 2, 30, 0, TAU); g.fill();
        drawIcon(g, c.nature || c.id, x + 46, y + chh / 2, 17, c.color);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.font = '800 11px Geist, Inter, system-ui, sans-serif'; g.fillStyle = c.type === 'evo' ? '#fde047' : c.color; g.fillText(tag, x + 88, y + 28);
        g.font = '800 17px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(c.name, x + 88, y + 50);
        g.font = '500 13px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#cbd5e1'; wrap(g, c.desc, x + 88, y + 70, cw - 100, 16, 2);
        if (view.keyboard) label(g, String(i + 1), x + cw - 18, y + 18, 12, '#94a3b8', 'rgba(0,0,0,0)', 800);
      } else {
        g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(x + cw / 2, y + 74, 44, 0, TAU); g.fill();
        drawIcon(g, c.nature || c.id, x + cw / 2, y + 74, 25, c.color);
        label(g, tag, x + cw / 2, y + 140, 12, c.type === 'evo' ? '#fde047' : c.color, 'rgba(0,0,0,0)', 800);
        label(g, c.name, x + cw / 2, y + 164, 19, '#fff', 'rgba(0,0,0,0)', 800);
        g.font = '500 14px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#cbd5e1'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        wrap(g, c.desc, x + cw / 2, y + 196, cw - 30, 18, 3);
        if (view.keyboard) { g.fillStyle = 'rgba(255,255,255,.12)'; roundRect(g, x + cw / 2 - 13, y + chh - 36, 26, 24, 6); g.fill(); label(g, String(i + 1), x + cw / 2, y + chh - 24, 13, '#fff', 'rgba(0,0,0,0)', 800); }
      }
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
  }
}

const PASSIVE_IDS = Object.keys(PASSIVES);
const DRONE_FIELDS = ['droneCd0','droneCd1','droneCd2','droneCd3'];
function chip(g, x, y, id, lv, evo, color) {
  const size = 26;
  g.fillStyle = 'rgba(9,9,11,.55)'; roundRect(g, x, y, size, size, 7); g.fill();
  if (evo) { g.strokeStyle = '#fde047'; g.lineWidth = 2; g.stroke(); }
  drawIcon(g, id, x + size / 2, y + size / 2, size * 0.36, color);
  g.fillStyle = evo ? '#fde047' : '#fff';
  for (let k = 0; k < Math.min(5, lv); k++) g.fillRect(x + 3 + k * 4.2, y + size + 2, 3, 3);
  return x + size + 5;
}
/** Shortest turn from angle a towards b by at most `step`. */
function turn(a, b, step) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + clamp(d, -step, step);
}
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); n++; line = word; if (n >= maxLines) return; }
    else line = t;
  }
  if (line) g.fillText(line, x, y + n * lh);
}
/** Small vector glyphs for cards and the loadout row. */
export function drawIcon(g, id, x, y, r, color) {
  g.save(); g.translate(x, y);
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = Math.max(2, r * 0.18); g.lineCap = 'round'; g.lineJoin = 'round';
  const circle = (cx, cy, rr, fill = true) => { g.beginPath(); g.arc(cx, cy, rr, 0, TAU); if (fill) g.fill(); else g.stroke(); };
  switch (id) {
    case 'green': g.beginPath(); g.moveTo(0,r); g.bezierCurveTo(-r,-r*.1,-r*.4,-r*.9,r*.7,-r); g.bezierCurveTo(r,r*.2,r*.4,r*.6,0,r); g.fill(); g.strokeStyle='#eff5cf'; g.beginPath();g.moveTo(-r*.1,r*.5);g.lineTo(r*.45,-r*.6);g.stroke();break;
    case 'ember': g.beginPath();g.moveTo(0,-r);g.bezierCurveTo(-r*.2,-r*.1,-r*.9,-r*.2,-r*.7,r*.35);g.bezierCurveTo(-r*.5,r,r*.7,r,r*.7,r*.2);g.quadraticCurveTo(r*.7,-r*.3,r*.3,-r*.45);g.quadraticCurveTo(r*.2,r*.1,0,-r);g.fill();break;
    case 'tide': circle(-r*.2,r*.1,r*.65,false);circle(r*.55,-r*.5,r*.28,false);g.fillStyle='#fff';circle(-r*.4,-r*.1,r*.13);break;
    case 'wind':case 'chime': for(let k=0;k<3;k++){g.beginPath();g.arc(-r*.15,(k-1)*r*.5,r*.6,-1.6,1);g.stroke();}break;
    case 'frost':for(let k=0;k<3;k++){g.save();g.rotate(k*Math.PI/3);g.beginPath();g.moveTo(-r,0);g.lineTo(r,0);g.stroke();g.restore();}break;
    case 'rock':case 'ore':g.beginPath();for(let k=0;k<6;k++){const a=k/6*TAU;g[k?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r*.8);}g.closePath();g.fill();break;
    case 'spark':case 'light':case 'star':g.beginPath();for(let k=0;k<10;k++){const a=k/10*TAU-Math.PI/2,rr=k%2?r*.4:r;g[k?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}g.closePath();g.fill();break;
    case 'night':g.beginPath();g.arc(0,0,r,-1,4.8);g.quadraticCurveTo(-r*.1,0,Math.cos(-1)*r,Math.sin(-1)*r);g.fill();break;
    case 'blaster': circle(-r * 0.3, r * 0.2, r * 0.5, false); circle(r * 0.45, -r * 0.35, r * 0.32, false); circle(r * 0.35, r * 0.55, r * 0.18); break;
    case 'drones': circle(0, 0, r * 0.32); circle(0, 0, r * 0.85, false); circle(r * 0.85, 0, r * 0.2); circle(-r * 0.6, -r * 0.6, r * 0.2); break;
    case 'wrench': g.rotate(-0.8); g.fillRect(-r * 0.14, -r * 0.55, r * 0.28, r * 1.3); g.beginPath(); g.arc(0, -r * 0.62, r * 0.38, 0.25 * Math.PI, 2.75 * Math.PI); g.lineWidth = r * 0.26; g.stroke(); break;
    case 'zap': g.beginPath(); g.moveTo(r * 0.25, -r); g.lineTo(-r * 0.45, r * 0.1); g.lineTo(r * 0.05, r * 0.1); g.lineTo(-r * 0.25, r); g.lineTo(r * 0.5, -r * 0.15); g.lineTo(0, -r * 0.15); g.closePath(); g.fill(); break;
    case 'mines': for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke(); } circle(0, 0, r * 0.55); break;
    case 'boots': circle(0,r*.32,r*.5);for(const [a,b]of[[-.65,-.3],[-.22,-.65],[.25,-.65],[.7,-.25]])circle(a*r,b*r,r*.23);break;
    case 'magnet': g.beginPath();g.moveTo(-r*.7,-r*.35);g.quadraticCurveTo(0,-r*.8,r*.7,-r*.35);g.quadraticCurveTo(r*.3,r*.6,0,r*.6);g.quadraticCurveTo(-r*.3,r*.6,-r*.7,-r*.35);g.fill();g.beginPath();g.moveTo(0,r*.55);g.lineTo(0,r);g.stroke();break;
    case 'armour': g.beginPath(); g.moveTo(0, -r * 0.95); g.lineTo(r * 0.8, -r * 0.6); g.quadraticCurveTo(r * 0.75, r * 0.6, 0, r); g.quadraticCurveTo(-r * 0.75, r * 0.6, -r * 0.8, -r * 0.6); g.closePath(); g.fill(); break;
    case 'snacks': case 'heal': g.beginPath(); g.moveTo(0, r * 0.85); g.bezierCurveTo(-r * 1.2, 0, -r * 0.6, -r * 1.0, 0, -r * 0.35); g.bezierCurveTo(r * 0.6, -r * 1.0, r * 1.2, 0, 0, r * 0.85); g.fill(); break;
    case 'overclock':for(let k=0;k<3;k++){g.beginPath();g.arc(-r*.7,0,r*(.45+k*.35),-.8,.8);g.stroke();}break;
    default: circle(0, 0, r * 0.6);
  }
  g.restore();
}

export const momo = {
  id: 'momo',
  title: 'Fernling-Arena',
  starters: Object.values(STARTERS).map(s => ({ id: s.id, label: s.label, description: ({ ember: 'Feuer und Wärme · entwickelt sich zu Coalbear und Emberward', green: 'Samen und Ranken · entwickelt sich zu Moorgrim und Groveprince', tide: 'Blasen und Wellen · entwickelt sich zu Spraycount und Tideduke' })[s.nature] })),
  defaultStarter: 'glimmo',
  tagline: 'Wähle deinen Fernling, entwickle seine Naturkräfte und halte bis zum Morgen durch. Brich den Bann der verzauberten Schar.',
  howTo: 'Bewege deinen Fernling per Touch, gedrückter Maustaste oder WASD/Pfeiltasten. Er greift selbst an. Bei einem Levelaufstieg wählst du mit 1–3 eine Karte. Entwicklung auf Level 5 und 10. Seltene Fossilkarten geben einen fremden Move bis Levelende. Esc pausiert, R startet neu.',
  levels: LEVELS,
  hero: 'GLIMMO',
  art: new URL('../../games-assets/covers/cover-momo.webp', import.meta.url).href,
  create: (i, env) => new MomoSession(i, env),
  view3d: () => import('./momo-3d.js'),
};
