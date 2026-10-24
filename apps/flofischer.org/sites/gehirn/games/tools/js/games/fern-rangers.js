/**
 * Fern Rangers — a squad runner shooter in the Fernhaven universe (docs/games/UNIVERSE.md): the Rangers fire non-stop
 * up a road while the Zorb aliens and their Klonkbots come the other way. Steer through number gates (+5, ×2, −3,
 * fire rate) and shoot them to raise their value, pick up items, keep clear of hazards, beat a boss at the end of
 * every world.
 *
 * The simulation is plain data + update(dt) (deterministic per level), so tests and the level composer can play it
 * headless. World: x across the road (−ROAD … ROAD), d along it; z = d − pos is the distance ahead of the squad.
 *
 * Rule for every hazard: it is telegraphed and can be avoided (steer, wait for it, or shoot it). Soldiers are lost to
 * enemies that reach the squad, to gates you chose and to hazards you walked into, never to something unavoidable.
 */
import { clamp, lerp, rng, label, roundRect } from './core.js';
import { LEVELS } from './fern-rangers-levels.js';

export const ROAD = 3;
const CAM_C = 6, VIEW_Z = 64, BULLET_SPEED = 46, WAKE_Z = 40;
export const WEAPONS = [
  { name: 'Bubble pistol', rate: 2.2, dmg: 1, color: '#a5f3fc' },
  { name: 'Bubble rifle', rate: 3.4, dmg: 1.2, color: '#67e8f9' },
  { name: 'Bubble repeater', rate: 5.5, dmg: 1.35, color: '#5eead4' },
  { name: 'Bubble storm', rate: 9, dmg: 1.45, color: '#fde047' },
  { name: 'Sun beam', rate: 11, dmg: 2, color: '#f0abfc' },
];
/** dmg: soldiers lost per point of health the enemy still has when it reaches the squad (at least one). */
export const ENEMY = {
  zorbling: { name: 'Zorbling', hp: 2, speed: 2.2, r: 0.34, dmg: 0.34, score: 10, home: 0.7, h: 0.95 },
  zipper: { name: 'Zipper', hp: 1.5, speed: 5, r: 0.3, dmg: 0.34, score: 15, home: 1.3, h: 1.15 },
  klonk: { name: 'Klonkbot', hp: 5, speed: 1.9, r: 0.38, dmg: 0.3, score: 20, home: 0.6, h: 1.05, metal: true },
  shield: { name: 'Shield-Klonk', hp: 6, speed: 1.5, r: 0.45, dmg: 0.3, score: 35, home: 0.45, h: 1.2, shield: 12, metal: true },
  spitter: { name: 'Spitter', hp: 4, speed: 2.0, r: 0.36, dmg: 0.34, score: 30, home: 0.45, h: 0.95, range: 15 },
  blorb: { name: 'Blorb', hp: 18, speed: 1.6, r: 0.62, dmg: 0.4, score: 60, home: 0.55, h: 1.6 },
  buzz: { name: 'Buzzbot', hp: 3, speed: 3.2, r: 0.32, dmg: 0.34, score: 25, home: 0.9, h: 1.2, fly: true, metal: true },
  boss: { name: 'Boss', hp: 300, speed: 1.4, r: 1.5, dmg: 0, score: 500, home: 0.35, h: 3.2 },
};
/** The four world bosses: how they attack and what they call in. */
export const BOSSES = {
  tank: { name: 'KLONK TANK', r: 1.5, h: 2.6, attack: 'shell', minion: 'klonk', every: 3.4 },
  drill: { name: 'DUNE DRILL MECH', r: 1.4, h: 3.1, attack: 'charge', minion: 'zipper', every: 3.2 },
  walker: { name: 'FROST WALKER', r: 1.5, h: 3.4, attack: 'breath', minion: 'spitter', every: 3.6 },
  mothership: { name: 'ZORB MOTHERSHIP', r: 2.2, h: 4.4, attack: 'beam', minion: 'buzz', every: 3.0, core: true },
};
export const PICKUPS = {
  medkit: { name: 'MEDKIT', color: '#f87171' },
  grenade: { name: 'GRENADE', color: '#fbbf24' },
  freeze: { name: 'FREEZE', color: '#7dd3fc' },
  bubble: { name: 'SHIELD BUBBLE', color: '#c4b5fd' },
  turret: { name: 'TURRET', color: '#94a3b8' },
  double: { name: 'DOUBLE DAMAGE', color: '#f472b6' },
  revive: { name: 'REVIVE', color: '#86efac' },
};
const THEMES = {
  meadow: { sky: ['#7dd3fc', '#e0f2fe'], ground: '#65a30d', ground2: '#4d7c0f', road: '#a1a1aa', edge: '#f4f4f5', stripe: '#ffffff', deco: 'tree' },
  dunes: { sky: ['#fdba74', '#fef3c7'], ground: '#d4a15a', ground2: '#b98543', road: '#a8a29e', edge: '#f5f5f4', stripe: '#fff7ed', deco: 'cactus' },
  frost: { sky: ['#bae6fd', '#f0f9ff'], ground: '#f1f5f9', ground2: '#dbe4ee', road: '#94a3b8', edge: '#ffffff', stripe: '#ffffff', deco: 'pine' },
  ember: { sky: ['#3b0a0a', '#9a3412'], ground: '#292524', ground2: '#1c1917', road: '#57534e', edge: '#f97316', stripe: '#fb923c', deco: 'rock' },
};
export const WORLD_THEME = ['meadow', 'dunes', 'frost', 'ember'];
const DARKEN = { meadow: 0.45, dunes: 0.45, frost: 0.5, ember: 0.1 };

function shade(hex, f) {
  if (!f) return hex;
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * (1 - f) + 10 * f);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
export function gateText(gate) {
  if (gate.op === 'add') return (gate.v >= 0 ? '+' : '−') + Math.abs(gate.v);
  if (gate.op === 'mul') return '×' + gate.v;
  if (gate.op === 'div') return '÷' + gate.v;
  return (gate.v >= 0 ? '+' : '−') + Math.abs(gate.v) + '%';
}
export const gateGood = (gate) => (gate.op === 'add' || gate.op === 'rate' ? gate.v > 0 : gate.op === 'mul');
/** Squad after passing a gate (rate gates leave the count alone). */
export function applyGate(n, gate) {
  if (gate.op === 'add') return n + gate.v;
  if (gate.op === 'mul') return n * gate.v;
  if (gate.op === 'div') return Math.floor(n / gate.v);
  return n;
}
export const squadRadius = (n) => 0.35 * Math.sqrt(Math.min(Math.max(n, 1), 90)) + 0.25;
/** Squad radius when bunched up in front of a hazard: narrower than any lane the hazards leave open. */
const SQUEEZED = 1.15;
/** Is a laser fence burning at time t? (it flickers for 0.5 s before it switches on) */
export const laserOn = (e, t) => ((t + e.phase) % e.period) < e.on;
export const laserWarn = (e, t) => { const k = (t + e.phase) % e.period; return k >= e.period - 0.5; };
/** A geyser's cycle: 'idle' → 'warn' (glowing, 1.2 s) → 'burst' (0.7 s). */
export function geyserState(e, t) {
  const k = (t + e.phase) % e.period;
  return k < e.period - 1.9 ? 'idle' : k < e.period - 0.7 ? 'warn' : 'burst';
}

function makeEnemy(type, d, x, level, o = {}, rand = Math.random) {
  const def = ENEMY[type];
  const hp = def.hp * (o.hp || level.hpMul || 1);
  return {
    kind: 'enemy', type, d, x, hp, maxHp: hp, speed: def.speed * (o.speed || 1) * (0.9 + rand() * 0.2),
    r: def.r, alive: true, active: !!o.active, flash: 0, phase: rand() * 6.28, frozen: 0,
    shield: def.shield ? def.shield * (o.hp || level.hpMul || 1) : 0, split: !!o.split, baseX: x, fire: 1 + rand(),
  };
}

/** Turn the level script into live entities. */
function build(level, rand) {
  const ents = [];
  let group = 0;
  for (const ev of level.events) {
    if (ev.t === 'gate') {
      group++;
      for (const gate of ev.gates) ents.push({ kind: 'gate', d: ev.d, group, ...gate, bx0: gate.x0, bx1: gate.x1, move: ev.move || null, shot: 0, pulse: 0, alive: true });
    } else if (ev.t === 'wave') {
      const cols = ev.cols || Math.min(ev.n, 4);
      for (let i = 0; i < ev.n; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const span = ev.x1 - ev.x0;
        const x = cols === 1 ? (ev.x0 + ev.x1) / 2 : ev.x0 + (span * col) / (cols - 1);
        ents.push(makeEnemy(ev.kind, ev.d + row * (ev.gap || 1.3) + rand() * 0.4, clamp(x + (rand() - 0.5) * 0.35, -ROAD + 0.3, ROAD - 0.3), level, ev, rand));
      }
    } else if (ev.t === 'boss') {
      const B = BOSSES[ev.kind || 'tank'];
      ents.push({
        kind: 'enemy', type: 'boss', boss: ev.kind || 'tank', d: ev.d, x: 0, hp: ev.hp, maxHp: ev.hp, speed: ENEMY.boss.speed, r: B.r,
        alive: true, active: false, flash: 0, phase: 0, frozen: 0, spawn: ev.spawn || 0, spawnT: 3, attackT: 2.2, shield: 0, coreOpen: 0, fought: 0, volley: 0,
      });
    } else if (ev.t === 'barrel') ents.push({ kind: 'barrel', d: ev.d, x: ev.x, hp: ev.hp, maxHp: ev.hp, alive: true, flash: 0 });
    else if (ev.t === 'crate') ents.push({ kind: 'crate', d: ev.d, x: ev.x, hp: ev.hp, maxHp: ev.hp, alive: true, flash: 0, weapon: ev.weapon });
    else if (ev.t === 'cage') ents.push({ kind: 'cage', d: ev.d, x: ev.x, hp: ev.hp, maxHp: ev.hp, v: ev.v, alive: true, flash: 0 });
    else if (ev.t === 'block' || ev.t === 'spikes') ents.push({ kind: 'block', d: ev.d, x0: ev.x0, x1: ev.x1, alive: true, hit: false });
    else if (ev.t === 'laser') ents.push({ kind: 'laser', d: ev.d, x0: ev.x0, x1: ev.x1, period: ev.period || 2.4, on: ev.on || 1.1, phase: ev.phase || 0, alive: true, hit: false });
    else if (ev.t === 'ice') ents.push({ kind: 'ice', d: ev.d, len: ev.len, x0: ev.x0 ?? -ROAD, x1: ev.x1 ?? ROAD, alive: true });
    else if (ev.t === 'fork') ents.push({ kind: 'fork', d: ev.d, len: ev.len, x: ev.x || 0, alive: true, side: 0 });
    else if (ev.t === 'geyser') ents.push({ kind: 'geyser', d: ev.d, x: ev.x, r: ev.r || 0.9, period: ev.period || 3.4, phase: ev.phase || 0, alive: true, lastBurst: -1 });
    else if (ev.t === 'strike') ents.push({ kind: 'strike', d: ev.d, alive: true, armed: false });
    else if (ev.t === 'pickup') ents.push({ kind: 'pickup', type: ev.type, d: ev.d, x: ev.x, v: ev.v || 0, alive: true });
  }
  return ents;
}

export class FernRangersSession {
  constructor(levelIndex, env = {}) {
    this.index = levelIndex;
    this.L = env.level || LEVELS[levelIndex];
    this.sound = env.sound || { play() {} };
    this.preview = !!env.preview;
    this.rand = rng(levelIndex * 7919 + 13);
    this.world = this.L.world ?? 0;
    this.themeName = this.L.theme || WORLD_THEME[this.world];
    this.theme = THEMES[this.themeName] || THEMES.meadow;
    this.pos = 0; this.speed = this.L.speed; this.t = 0;
    this.n = this.L.start.soldiers + (env.bonusSoldiers || 0); this.weapon = this.L.start.weapon; this.rateMul = 1;
    this.px = 0; this.tx = 0; this.keyDir = 0; this.drag = null;
    this.score = 0; this.kills = 0; this.result = null; this.peak = this.n;
    this.grenades = this.L.start.grenades || 0; this.grenadeCd = 0; this.throws = [];
    this.buffs = { bubble: 0, double: 0, turret: 0, freeze: 0 }; this.revives = 0; this.turretX = 0; this.turretAcc = 0;
    this.ents = build(this.L, this.rand);
    this.boss = this.ents.find((e) => e.type === 'boss') || null;
    this.bullets = []; this.parts = []; this.popups = []; this.goo = []; this.warnings = [];
    this.fireAcc = 0; this.shake = 0; this.flash = 0; this.goodFlash = 0; this.countPop = 0; this.muzzle = 0;
    this.slots = [];
    this.hint = this.L.hint;
    this.layout = null;
    this.onIce = false; this.forkSide = 0;
    this.hurtLog = []; // every loss with its cause, for the level audit
    this.syncSlots(true);
    if (!this.preview) this.popup('GO!', 0, 1.6, '#ffffff', 1.25);
  }

  // ── squad formation (sunflower pattern) ──
  slotTarget(i) {
    const a = i * 2.39996, r = 0.36 * Math.sqrt(i + 0.35);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.75 };
  }
  /** The squad bunches up in front of hazards so it fits through the gaps (squeeze 0 … 1). */
  get fullRadius() { return squadRadius(this.n); }
  get radius() { return lerp(this.fullRadius, Math.min(this.fullRadius, SQUEEZED), this.squeeze || 0); }
  syncSlots(snap = false) {
    const want = Math.min(Math.max(this.n, 0), 90);
    while (this.slots.length < want) { const t = this.slotTarget(this.slots.length); this.slots.push(snap ? { ...t } : { x: 0, z: 0 }); }
    if (this.slots.length > want) this.slots.length = want;
  }

  // ── input ──
  pointer(type, x, y, e = {}) {
    const lay = this.layout;
    if (!lay || this.result) { if (type === 'up') this.drag = null; return; }
    // the grenade button (bottom right) takes taps before steering does
    if (type === 'down' && this.grenadeButton && Math.hypot(x - this.grenadeButton.x, y - this.grenadeButton.y) < this.grenadeButton.r + 8) { this.throwGrenade(); return; }
    const ppu = lay.ppu || lay.k / CAM_C;
    if (e.pointerType === 'mouse') {
      // Mouse: the squad follows the cursor across the road.
      if (type !== 'up') this.tx = clamp(lay.toWorldX ? lay.toWorldX(x) : (x - lay.cx) / ppu + lay.camX, -ROAD, ROAD);
      return;
    }
    if (type === 'down') this.drag = { x0: x, tx0: this.tx };
    else if (type === 'move' && this.drag) this.tx = clamp(this.drag.tx0 + ((x - this.drag.x0) / ppu) * 1.15, -ROAD, ROAD);
    else if (type === 'up') this.drag = null;
  }
  key(code, down) {
    if (code === 'Space' || code === 'KeyG') { if (down) this.throwGrenade(); return true; }
    const left = code === 'ArrowLeft' || code === 'KeyA', right = code === 'ArrowRight' || code === 'KeyD';
    if (!left && !right) return false;
    this.keys = this.keys || { l: false, r: false };
    if (left) this.keys.l = down; else this.keys.r = down;
    this.keyDir = (this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0);
    return true;
  }
  hud() { return { progress: Math.min(1, this.pos / this.L.length), score: this.score, label: 'Score' }; }

  // ── simulation ──
  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 3); this.flash = Math.max(0, this.flash - dt * 2.5);
    this.goodFlash = Math.max(0, this.goodFlash - dt * 2.5); this.countPop = Math.max(0, this.countPop - dt * 4);
    this.muzzle = Math.max(0, this.muzzle - dt * 10);
    for (const k in this.buffs) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    this.updateParticles(dt);
    if (this.result && !this.result.won) return;

    if (this.keyDir) this.tx = clamp(this.tx + this.keyDir * 8 * dt, -ROAD, ROAD);
    const lim = ROAD - Math.min(this.radius, ROAD) * 0.6;
    let lo = -lim, hi = lim;
    // a fork's median wall keeps the squad on the side it entered
    const fork = this.ents.find((e) => e.kind === 'fork' && e.d - this.pos < 0.5 && e.d + e.len - this.pos > -0.5);
    if (fork) {
      if (!fork.side) fork.side = this.px < fork.x ? -1 : 1;
      const edge = Math.min(this.radius, 1.2) * 0.6 + 0.25;
      if (fork.side < 0) hi = Math.min(hi, fork.x - edge); else lo = Math.max(lo, fork.x + edge);
    }
    const target = clamp(this.tx, lo, hi);
    // ice: steering barely grips, the squad slides on
    this.onIce = this.ents.some((e) => e.kind === 'ice' && e.d - this.pos < 0 && e.d + e.len - this.pos > 0 && this.px > e.x0 - 0.5 && this.px < e.x1 + 0.5);
    this.px = clamp(lerp(this.px, target, 1 - Math.exp(-dt * (this.onIce ? 2.2 : 16))), lo, hi);

    // Boss fights hold the squad in place.
    const bossNear = this.boss && this.boss.alive && this.boss.d - this.pos < 24;
    this.speed = lerp(this.speed, bossNear || (this.result && this.pos > this.L.length + 12) ? 0 : this.L.speed, 1 - Math.exp(-dt * 3));
    this.pos += this.speed * dt;

    // bunch up while a hazard, a goo blob or a boss strike is close; spread out again after
    const tight = this.ents.some((e) => e.alive && (e.kind === 'block' || e.kind === 'laser' || e.kind === 'geyser' || e.kind === 'barrel') && e.d - this.pos > -1.5 && e.d - this.pos < 9)
      || this.goo.length > 0 || this.warnings.some((w) => !w.done);
    this.squeeze = clamp((this.squeeze || 0) + (tight ? dt * 4 : -dt * 1.5), 0, 1);
    const k = this.radius / this.fullRadius;
    for (const s of this.slots.keys()) {
      const slot = this.slots[s], tgt = this.slotTarget(s);
      slot.x = lerp(slot.x, tgt.x * k, 1 - Math.exp(-dt * 10)); slot.z = lerp(slot.z, tgt.z * (0.6 + 0.4 * k), 1 - Math.exp(-dt * 10));
    }
    if (this.result) return; // won: keep walking and celebrating, nothing can hurt the squad any more

    this.updateGates(dt);
    this.updateEnemies(dt);
    this.updateHazards(dt);
    this.fire(dt);
    this.updateBullets(dt);
    this.updateThrows(dt);
    this.checkContacts();
    this.ents = this.ents.filter((e) => e.alive || e.fade > 0);
    this.peak = Math.max(this.peak, this.n);

    if (this.n <= 0 && this.revives > 0) {
      this.revives--; this.n = 8; this.syncSlots(true); this.buffs.bubble = 3;
      this.popup('REVIVED!', 0, 2, '#86efac', 1.3); this.sound.play('upgrade'); this.goodFlash = 1;
    }
    if (this.n <= 0) this.lose(this.loseReason || 'The aliens overran your squad');
    else if (this.pos >= this.L.length && !(this.boss && this.boss.alive)) this.win();
  }

  updateGates() {
    for (const e of this.ents) {
      if (e.kind !== 'gate' || !e.move || !e.alive) continue;
      // moving gates slide across the road and back
      const off = Math.sin(this.t * e.move.speed + (e.move.phase || 0)) * e.move.amp;
      const w = e.bx1 - e.bx0;
      e.x0 = clamp(e.bx0 + off, -ROAD, ROAD - w); e.x1 = e.x0 + w;
    }
  }

  updateEnemies(dt) {
    for (const e of this.ents) {
      if (e.fade > 0) e.fade -= dt * 3;
      if (e.flash > 0) e.flash -= dt;
      if (e.kind !== 'enemy' || !e.alive) continue;
      const z = e.d - this.pos;
      if (!e.active && z < WAKE_Z) e.active = true;
      if (!e.active) continue;
      if (e.frozen > 0) { e.frozen -= dt; continue; }
      if (e.type === 'boss') { this.updateBoss(e, dt, z); continue; }
      const def = ENEMY[e.type];
      if (e.type === 'spitter' && z < def.range) {
        // spitters keep their distance and lob goo at where the squad is now
        e.d = this.pos + def.range;
        e.fire -= dt;
        if (e.fire <= 0) { e.fire = 2.6; this.spit(e); }
      } else e.d -= e.speed * dt;
      e.phase += dt * e.speed * 3;
      if (e.type === 'buzz') e.x = clamp(e.baseX + Math.sin(this.t * 1.7 + e.phase * 0.2) * 1.4, -ROAD + 0.2, ROAD - 0.2);
      else if (z < 30) e.x = clamp(e.x + clamp(this.px - e.x, -1, 1) * def.home * dt, -ROAD + 0.2, ROAD - 0.2);
      if (e.type === 'buzz') e.baseX = clamp(e.baseX + clamp(this.px - e.baseX, -1, 1) * def.home * 0.6 * dt, -ROAD + 1, ROAD - 1);
    }
    // goo blobs fly towards the squad's row
    for (const g of this.goo) {
      g.d -= g.speed * dt;
      g.x = lerp(g.x0, g.tx, clamp(1 - (g.d - this.pos) / g.dist, 0, 1));
      g.h = 0.4 + Math.sin(clamp(1 - (g.d - this.pos) / g.dist, 0, 1) * Math.PI) * 1.6;
      if (g.d - this.pos <= 0.2 && g.alive) {
        g.alive = false;
        this.spray(g.x, this.pos + 0.2, 0.3, '#84cc16', 14, 2.4);
        if (Math.abs(g.x - this.px) < this.radius * 0.75 + 0.3) {
          const lost = Math.max(2, Math.ceil(this.n * 0.12));
          if (this.hurt(lost, 'Spitter goo hit your squad')) this.popup('−' + lost, 0, 1.6, '#a3e635', 1);
        }
      }
    }
    this.goo = this.goo.filter((g) => g.alive);
  }

  spit(e) {
    const dist = e.d - this.pos;
    this.goo.push({ x0: e.x, x: e.x, tx: this.px, d: e.d, dist, speed: 9, h: 0.4, alive: true, hp: 1 });
    this.sound.play('hit', 120);
  }

  /** Bosses stop at a distance, call in helpers and attack with telegraphed strikes that always leave a safe lane. */
  updateBoss(e, dt, z) {
    const B = BOSSES[e.boss];
    e.phase += dt * 1.2;
    if (z > 15) e.d -= e.speed * dt * 3; else e.fought += dt;
    e.x = lerp(e.x, clamp(this.px * 0.35, -1.2, 1.2), 1 - Math.exp(-dt * 0.8));
    if (e.coreOpen > 0) e.coreOpen -= dt;
    if (z > 26) return;
    const rage = e.hp < e.maxHp * 0.5 ? 0.72 : 1;
    const enrage = e.fought > 70 ? 0.6 : 1;
    e.attackT -= dt;
    if (e.attackT <= 0) {
      e.attackT = B.every * rage * enrage;
      this.bossAttack(e, B, rage < 1);
    }
    if (e.spawn) {
      e.spawnT -= dt;
      if (e.spawnT <= 0) {
        e.spawnT = 4.2 * rage;
        for (let i = 0; i < e.spawn; i++) {
          const m = makeEnemy(B.minion, e.d - 1.5, clamp(e.x + (i - (e.spawn - 1) / 2) * 1.1, -ROAD + 0.3, ROAD - 0.3), this.L, { hp: this.L.minionHp || 1, active: true }, this.rand);
          this.ents.push(m);
        }
      }
    }
  }
  bossAttack(e, B, angry) {
    // lanes: thirds of the road; one lane is always left safe
    const lanes = [[-ROAD, -1], [-1, 1], [1, ROAD]];
    const sq = this.px < -1 ? 0 : this.px > 1 ? 2 : 1;
    if (B.attack === 'shell' || B.attack === 'charge') {
      const hit = [sq];
      if (angry) hit.push((sq + 1 + (this.rand() < 0.5 ? 0 : 1)) % 3);
      for (const l of hit) this.warnings.push({ kind: B.attack, x0: lanes[l][0], x1: lanes[l][1], t: 1.35, dur: 1.35, frac: 0.2, boss: e });
    } else if (B.attack === 'breath') {
      // half the road (the half the squad is on), frost slows and hurts
      const left = this.px < 0;
      this.warnings.push({ kind: 'breath', x0: left ? -ROAD : 0.2, x1: left ? -0.2 : ROAD, t: 1.5, dur: 1.5, frac: 0.15, boss: e });
    } else if (B.attack === 'beam') {
      // one beam locks onto the squad's spot, then fires (angry: more often, see `rage`); the core opens after it
      this.warnings.push({ kind: 'beam', x: clamp(this.px, -ROAD + 0.8, ROAD - 0.8), r: 1.1, t: 1.6, dur: 1.6, track: 0.8, frac: 0.25, boss: e });
      e.volley++;
    }
    this.sound.play('bad', 200);
  }

  updateHazards(dt) {
    for (const w of this.warnings) {
      w.t -= dt;
      if (w.kind === 'beam' && w.track > 0) { w.track -= dt; w.x = lerp(w.x, this.px, 1 - Math.exp(-dt * 4)); }
      if (w.t <= 0 && !w.done) {
        w.done = true;
        const R = this.radius * 0.7;
        const hitBox = w.kind === 'beam' ? Math.abs(this.px - w.x) < w.r + R * 0.6 : this.px + R * 0.6 > w.x0 && this.px - R * 0.6 < w.x1;
        this.shake = Math.max(this.shake, 0.5);
        if (w.kind === 'beam') { this.boom(w.x, this.pos + 0.5, w.r * 1.4); if (w.boss) w.boss.coreOpen = 3.5; }
        else this.boom((w.x0 + w.x1) / 2, this.pos + 0.5, 1.6);
        this.sound.play('boom');
        if (hitBox) {
          const lost = Math.max(2, Math.ceil(this.n * w.frac));
          const why = { shell: 'A tank shell hit your squad', charge: 'The drill mech ran your squad down', breath: 'Frost breath froze your squad', beam: 'The mothership beam hit your squad', strike: 'The mothership beam hit your squad' }[w.kind];
          if (this.hurt(lost, why)) this.popup('−' + lost, 0, 1.6, '#f87171', 1);
        }
      }
    }
    this.warnings = this.warnings.filter((w) => w.t > -0.4);
    for (const e of this.ents) {
      if (!e.alive) continue;
      const z = e.d - this.pos;
      if (e.kind === 'strike' && !e.armed && z < 9) {
        // a mothership strike: the shadow follows the squad, then locks on and fires
        e.armed = true; e.alive = false;
        this.warnings.push({ kind: 'strike', x: this.px, r: 1.0, t: 1.7, dur: 1.7, track: 0.9, frac: 0.25 });
        this.sound.play('bad', 200);
      }
    }
  }

  fire(dt) {
    const w = WEAPONS[this.weapon];
    const shooters = Math.min(this.n, 12);
    if (shooters <= 0) return;
    const dmgMul = this.buffs.double > 0 ? 2 : 1;
    this.fireAcc += dt * w.rate * this.rateMul;
    let fired = false;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      const per = (w.dmg * this.n * dmgMul) / shooters;
      // Spread the shooters across the squad's width: the outermost soldiers fire too.
      for (let i = 0; i < shooters; i++) {
        const off = shooters === 1 ? 0 : (i / (shooters - 1) - 0.5) * 2 * Math.min(this.radius * 0.85, ROAD);
        this.bullets.push({ x: this.px + off, d: this.pos + 0.5 + this.rand() * 0.3, prev: this.pos + 0.5, dmg: per, life: this.L.range || 34 });
      }
      fired = true;
    }
    // the turret drop: an extra gun beside the squad that tracks the nearest enemy
    if (this.buffs.turret > 0) {
      const foe = this.ents.find((e) => e.kind === 'enemy' && e.alive && e.active && e.d - this.pos > 0 && e.d - this.pos < 26);
      this.turretX = lerp(this.turretX, foe ? foe.x : this.px, 1 - Math.exp(-dt * 6));
      this.turretAcc += dt * 7;
      while (this.turretAcc >= 1) { this.turretAcc -= 1; this.bullets.push({ x: this.turretX, d: this.pos + 1, prev: this.pos + 1, dmg: w.dmg * 3 * dmgMul, life: 34, turret: true }); }
    }
    if (fired) { this.muzzle = 1; this.sound.play('shot', 75); }
  }

  updateBullets(dt) {
    const step = BULLET_SPEED * dt;
    const targets = this.ents.filter((e) => e.alive && (e.kind === 'enemy' ? e.active : e.kind === 'gate' || e.kind === 'barrel' || e.kind === 'crate' || e.kind === 'cage'));
    for (const b of this.bullets) {
      b.prev = b.d; b.d += step; b.life -= step;
      let best = null, bestD = Infinity;
      for (const e of targets) {
        if (!e.alive) continue;
        if (e.kind === 'gate') {
          if (b.x < e.x0 || b.x > e.x1) continue;
          if (e.d < b.prev || e.d > b.d) continue;
        } else {
          const r = e.kind === 'enemy' ? e.r : 0.5;
          if (Math.abs(b.x - e.x) > r + 0.06) continue;
          if (e.d + r * 0.6 < b.prev || e.d - r * 0.6 > b.d) continue;
        }
        if (e.d < bestD) { bestD = e.d; best = e; }
      }
      // goo blobs can be shot out of the air
      for (const g of this.goo) {
        if (!g.alive || Math.abs(b.x - g.x) > 0.35 || g.d < b.prev - 0.3 || g.d > b.d + 0.3 || g.d >= bestD) continue;
        best = g; bestD = g.d;
      }
      if (best && best.speed && best.dist) { best.alive = false; this.spray(best.x, best.d, best.h, '#a3e635', 8, 2); this.score += 5; b.life = 0; continue; }
      if (best) { this.hit(best, b); b.life = 0; }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  hit(e, b) {
    if (e.kind === 'gate') {
      e.pulse = 1;
      if (e.op !== 'add' && e.op !== 'rate') return;
      e.shot += b.dmg;
      // Damage per +1 grows with the squad, so a gate climbs at about the same pace whatever its size (a ×2 gate
      // already rewards big squads); better guns and fire-rate gates still raise it faster.
      const per = (e.per || this.L.gatePer || 3) * Math.max(1, this.n);
      while (e.shot >= per) {
        e.shot -= per; e.v += e.op === 'rate' ? 5 : 1;
        if (e.op === 'add' && e.v === 0) e.v = 1;
      }
      return;
    }
    let dmg = b.dmg;
    if (e.kind === 'enemy') {
      if (e.frozen > 0) dmg *= 1.5;
      if (e.type === 'boss' && BOSSES[e.boss].core && !(e.coreOpen > 0)) dmg *= 0.3;
      if (e.shield > 0) {
        // the shield plate soaks up bullets first
        e.shield -= dmg; e.flash = 0.06;
        if (e.shield <= 0) { e.shield = 0; this.spray(e.x, e.d, 0.8, '#cbd5e1', 14, 2.6); this.popupWorld('SHIELD DOWN', e.x, e.d, 1.6, '#e2e8f0', 0.7); this.sound.play('boom', 200); }
        else this.spray(e.x, e.d, 0.7, '#fde68a', 1, 2);
        return;
      }
    }
    e.hp -= dmg; e.flash = 0.08;
    if (e.kind === 'enemy') {
      if (e.type !== 'boss') e.d += 0.06 * dmg / (e.type === 'blorb' ? 4 : 1);
      this.spray(e.x, e.d, ENEMY[e.type].h * 0.6, ENEMY[e.type].metal ? '#fbbf24' : '#c084fc', 2);
      this.sound.play('hit', 60);
    }
    if (e.hp > 0) return;
    e.alive = false; e.fade = 1;
    if (e.kind === 'enemy') {
      const def = ENEMY[e.type];
      this.kills++; this.score += def.score;
      this.spray(e.x, e.d, def.h * 0.5, def.metal ? '#94a3b8' : '#a855f7', e.type === 'boss' ? 80 : e.type === 'blorb' ? 26 : 10, 3);
      this.sound.play('kill', 50);
      if (e.type === 'boss') {
        this.shake = 1.2; this.boom(e.x, e.d, 4); this.popupWorld('BOSS DOWN!', e.x, e.d, 3, '#fde047', 1.3);
        this.warnings.length = 0; this.goo.length = 0;
        for (const o of this.ents) if (o.kind === 'enemy' && o.alive) { o.alive = false; o.fade = 1; }
      } else if (e.type === 'blorb') {
        this.popupWorld('+' + def.score, e.x, e.d, def.h + 0.4, '#fde047', 0.75);
        if (e.split) for (const dx of [-0.45, 0.45]) this.ents.push(makeEnemy('zorbling', e.d, clamp(e.x + dx, -ROAD + 0.3, ROAD - 0.3), this.L, { active: true }, this.rand));
      }
    } else if (e.kind === 'barrel') {
      this.score += 20;
      this.explode(e.x, e.d, 2.6);
    } else if (e.kind === 'crate') {
      this.score += 50;
      const next = e.weapon != null ? Math.max(this.weapon, e.weapon) : Math.min(this.weapon + 1, WEAPONS.length - 1);
      this.weapon = next;
      this.goodFlash = 1; this.countPop = 1;
      this.spray(e.x, e.d, 0.5, '#f59e0b', 18, 3);
      this.popup(WEAPONS[next].name.toUpperCase() + '!', 0, 2.3, '#fde047', 1.1);
      this.sound.play('upgrade');
    } else if (e.kind === 'cage') {
      // freed Rangers run to the squad
      this.score += 40;
      this.n = Math.min(500, this.n + e.v); this.countPop = 1; this.goodFlash = 1;
      this.spray(e.x, e.d, 0.6, '#86efac', 16, 2.4);
      this.popupWorld('+' + e.v + ' RANGERS', e.x, e.d, 1.8, '#86efac', 0.9);
      this.sound.play('good');
      this.syncSlots();
    }
  }

  explode(x, d, radius, dmg = 40) {
    this.boom(x, d, radius);
    this.shake = Math.max(this.shake, 0.8);
    this.sound.play('boom');
    for (const e of this.ents) {
      if (!e.alive || e.kind !== 'enemy') continue;
      if (Math.hypot(e.x - x, e.d - d) < radius + e.r) { const s = e.shield; e.shield = 0; this.hit(e, { dmg: e.type === 'boss' ? dmg * 0.6 : dmg }); if (e.alive && s > dmg) e.shield = s - dmg; }
    }
  }

  // ── grenades ──
  throwGrenade() {
    if (this.grenades <= 0 || this.grenadeCd > 0 || this.result) return false;
    // aim at the densest group of enemies ahead
    const foes = this.ents.filter((e) => e.kind === 'enemy' && e.alive && e.active && e.d - this.pos > 3 && e.d - this.pos < 22);
    let best = null, bestN = 0;
    for (const f of foes) {
      let k = f.type === 'boss' ? 6 : 0;
      for (const o of foes) if (Math.hypot(o.x - f.x, o.d - f.d) < 2.5) k++;
      if (k > bestN) { bestN = k; best = f; }
    }
    const tx = best ? best.x : this.px, td = best ? best.d : this.pos + 12;
    this.grenades--; this.grenadeCd = 1.2;
    this.throws.push({ x0: this.px, d0: this.pos + 0.5, tx, td, t: 0, dur: 0.65 });
    this.sound.play('shot', 0);
    return true;
  }
  updateThrows(dt) {
    for (const g of this.throws) {
      g.t += dt;
      if (g.t >= g.dur && !g.done) { g.done = true; this.explode(g.tx, g.td, 2.8, 55); }
    }
    this.throws = this.throws.filter((g) => !g.done);
  }

  /** Lose soldiers unless the shield bubble is up; returns whether it hurt. */
  hurt(k, reason) {
    if (this.buffs.bubble > 0) { this.popup('BLOCKED', 0, 1.6, '#c4b5fd', 0.9); this.sound.play('good', 150); return false; }
    this.hurtLog.push({ reason, k: Math.min(k, this.n), d: Math.round(this.pos), t: +this.t.toFixed(2) });
    this.loseSoldiers(Math.min(k, this.n), reason);
    return true;
  }

  checkContacts() {
    const R = this.radius;
    for (const e of this.ents) {
      if (!e.alive) continue;
      const z = e.d - this.pos;
      if (e.kind === 'gate') {
        if (z > 0) continue;
        // The gate whose span holds the squad's centre counts; its partners close.
        const pair = this.ents.filter((o) => o.kind === 'gate' && o.group === e.group && o.alive);
        const taken = pair.find((o) => this.px >= o.x0 && this.px <= o.x1);
        for (const o of pair) { o.alive = false; o.fade = 1; }
        if (taken) this.passGate(taken);
      } else if (e.kind === 'block') {
        if (e.hit || z > 0.3 || z < -0.6) continue;
        const overlap = Math.min(this.px + R * 0.8, e.x1) - Math.max(this.px - R * 0.8, e.x0);
        if (overlap > 0) {
          e.hit = true;
          const lost = Math.max(2, Math.ceil(this.n * 0.3));
          if (this.hurt(lost, 'Your squad ran into an alien barricade')) this.popup('−' + lost, 0, 1.6, '#f87171', 1);
        }
      } else if (e.kind === 'laser') {
        if (e.hit || z > 0.2 || z < -0.4) continue;
        const overlap = Math.min(this.px + R * 0.8, e.x1) - Math.max(this.px - R * 0.8, e.x0);
        if (overlap > 0 && laserOn(e, this.t)) {
          e.hit = true;
          const lost = Math.max(2, Math.ceil(this.n * 0.25));
          if (this.hurt(lost, 'A laser fence zapped your squad')) this.popup('−' + lost, 0, 1.6, '#f87171', 1);
        }
        if (z < -0.3) e.alive = false;
      } else if (e.kind === 'geyser') {
        if (z < -2) { e.alive = false; continue; }
        if (geyserState(e, this.t) !== 'burst') continue;
        const cycle = Math.floor((this.t + e.phase) / e.period);
        if (e.lastBurst === cycle) continue;
        if (Math.abs(z) < e.r + 0.3 && Math.abs(e.x - this.px) < e.r + R * 0.7) {
          e.lastBurst = cycle;
          const lost = Math.max(2, Math.ceil(this.n * 0.25));
          if (this.hurt(lost, 'A lava geyser burst under your squad')) this.popup('−' + lost, 0, 1.6, '#fb923c', 1);
        }
      } else if (e.kind === 'pickup') {
        if (z < -1) { e.alive = false; continue; }
        if (z > 0.6 || Math.abs(e.x - this.px) > R + 0.4) continue;
        e.alive = false; e.fade = 1;
        this.collect(e);
      } else if (e.kind === 'barrel') {
        if (z > R * 0.6 + 0.4 || z < -1) continue;
        if (Math.abs(e.x - this.px) < R + 0.35) {
          e.alive = false; e.fade = 1;
          this.explode(e.x, e.d, 2.2);
          const lost = Math.max(3, Math.ceil(this.n * 0.25));
          if (this.hurt(lost, 'You ran into a fuel barrel')) this.popup('−' + lost, 0, 1.6, '#f87171', 1);
        }
      } else if (e.kind === 'crate' || e.kind === 'cage') {
        if (z < -1) e.alive = false;
      } else if (e.kind === 'ice' || e.kind === 'fork') {
        if (e.d + e.len - this.pos < -3) e.alive = false;
      } else if (e.kind === 'enemy') {
        if (!e.active || e.type === 'boss') continue;
        if (z < -2.5) { e.alive = false; continue; }
        if (z > R * 0.75 + e.r * 0.5) continue;
        if (Math.abs(e.x - this.px) > R + e.r - 0.15) continue;
        e.alive = false; e.fade = 1;
        const dmg = Math.max(1, Math.ceil((e.hp + e.shield * 0.5) * ENEMY[e.type].dmg));
        this.spray(e.x, e.d, 0.5, '#a855f7', 8, 2);
        this.hurt(Math.min(dmg, this.n), 'The aliens overran your squad');
      }
    }
  }

  collect(e) {
    const P = PICKUPS[e.type];
    this.score += 25;
    this.goodFlash = 1; this.sound.play('upgrade');
    if (e.type === 'medkit') { this.n = Math.min(500, this.n + e.v); this.countPop = 1; this.syncSlots(); this.popup('+' + e.v, 0, 1.8, '#86efac', 1.3); return; }
    if (e.type === 'grenade') this.grenades += e.v || 1;
    else if (e.type === 'freeze') { this.buffs.freeze = 3.5; for (const o of this.ents) if (o.kind === 'enemy' && o.alive && o.d - this.pos < 45) o.frozen = 3.5; for (const g of this.goo) g.alive = false; }
    else if (e.type === 'bubble') this.buffs.bubble = 6;
    else if (e.type === 'turret') { this.buffs.turret = 9; this.turretX = this.px; }
    else if (e.type === 'double') this.buffs.double = 7;
    else if (e.type === 'revive') this.revives++;
    this.popup(P.name + '!', 0, 2.2, P.color, 1);
  }

  passGate(gate) {
    const before = this.n;
    if (gate.op === 'rate') {
      this.rateMul = Math.max(0.4, this.rateMul * (1 + gate.v / 100));
      this.popup(`FIRE RATE ${gateText(gate)}`, 0, 2, gate.v >= 0 ? '#67e8f9' : '#f87171', 1);
      this.sound.play(gate.v >= 0 ? 'upgrade' : 'bad');
      this.goodFlash = gate.v >= 0 ? 1 : 0; if (gate.v < 0) this.flash = 0.6;
      return;
    }
    this.n = Math.max(0, Math.min(500, Math.round(applyGate(this.n, gate))));
    const diff = this.n - before;
    this.countPop = 1;
    if (diff >= 0) { this.goodFlash = 1; this.sound.play('good'); this.popup(gateText(gate), 0, 1.8, '#86efac', 1.3); }
    else { this.flash = 0.8; this.shake = Math.max(this.shake, 0.4); this.sound.play('bad'); this.popup(gateText(gate), 0, 1.8, '#f87171', 1.3); this.burstSquad(-diff); }
    if (this.n <= 0) this.loseReason = 'A minus gate wiped out your squad';
    this.syncSlots();
  }

  loseSoldiers(k, reason) {
    if (k <= 0) return;
    this.burstSquad(k);
    this.n = Math.max(0, this.n - k);
    this.flash = Math.max(this.flash, 0.7); this.shake = Math.max(this.shake, 0.5); this.countPop = 1;
    this.sound.play('hurt', 90);
    if (this.n <= 0) this.loseReason = reason;
    this.syncSlots();
  }
  burstSquad(k) {
    for (let i = 0; i < Math.min(k, 20); i++) {
      const s = this.slots[this.slots.length - 1 - i] || { x: 0, z: 0 };
      this.spray(this.px + s.x, this.pos + s.z, 0.5, '#4ade80', 6, 2.5);
    }
  }

  win() {
    const [two, three] = this.L.stars;
    const stars = this.n >= three ? 3 : this.n >= two ? 2 : 1;
    this.score += this.n * 20;
    this.result = { won: true, stars, score: this.score, soldiers: this.n, reason: `${this.n} Ranger${this.n === 1 ? '' : 's'} made it home (${two} for ★★, ${three} for ★★★).`, stats: { kills: this.kills, rangers: this.n } };
    this.popup('VICTORY!', 0, 2.4, '#fde047', 1.4);
    for (let i = 0; i < 60; i++) {
      const colors = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
      this.parts.push({ x: this.px + (Math.random() - 0.5) * 6, d: this.pos + 2 + Math.random() * 6, h: 3 + Math.random() * 2, vx: (Math.random() - 0.5) * 2, vd: (Math.random() - 0.5) * 2, vh: Math.random() * 3, life: 2.5, max: 2.5, color: colors[i % 5], size: 0.12, grav: 3 });
    }
  }
  lose(reason) {
    this.result = { won: false, stars: 0, score: this.score, soldiers: 0, reason, stats: { kills: this.kills } };
    this.shake = 1;
  }

  // ── effects ──
  spray(x, d, h, color, count, speed = 1.6) {
    if (this.preview) return;
    for (let i = 0; i < count && this.parts.length < 700; i++) {
      this.parts.push({ x, d, h, vx: (Math.random() - 0.5) * speed * 2, vd: (Math.random() - 0.3) * speed * 2, vh: Math.random() * speed * 2, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 0.07 + Math.random() * 0.06, grav: 9 });
    }
  }
  boom(x, d, radius) {
    if (this.preview) return;
    this.parts.push({ ring: true, x, d, h: 0.1, life: 0.45, max: 0.45, radius });
    for (let i = 0; i < 40 && this.parts.length < 760; i++) {
      const a = Math.random() * 6.28, v = 2 + Math.random() * 5;
      this.parts.push({ x, d, h: 0.4, vx: Math.cos(a) * v, vd: Math.sin(a) * v, vh: 2 + Math.random() * 5, life: 0.6 + Math.random() * 0.5, max: 1.1, color: i % 3 ? '#f97316' : '#facc15', size: 0.12 + Math.random() * 0.12, grav: 8 });
    }
  }
  popup(text, x, h, color, size) { this.popups.push({ text, x, z: 0.6, h, color, size, life: 1.1, max: 1.1, squad: true }); }
  popupWorld(text, x, d, h, color, size) { this.popups.push({ text, x, d, h, color, size, life: 1.1, max: 1.1 }); }
  updateParticles(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      if (p.ring) continue;
      p.x += p.vx * dt; p.d += p.vd * dt; p.h += p.vh * dt; p.vh -= p.grav * dt;
      if (p.h < 0) { p.h = 0; p.vh *= -0.3; p.vx *= 0.6; p.vd *= 0.6; }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.popups) { p.life -= dt; p.h += dt * 0.9; }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  // ── drawing ──
  render(g, view) {
    if (view.gl) {
      // The 3D view drew the world; labels, popups and flashes go on top, projected through its camera.
      this.projFn = view.gl.projectFn();
      this.layout = view.gl.layoutFor();
      g.save();
      this.drawLabels(g);
      this.drawOverlay(g, view);
      return;
    }
    this.projFn = null;
    const { w, h } = view;
    const horizon = Math.round(h * 0.2);
    const colW = Math.min(w, h * 0.78);
    const k = (colW * 0.46 * CAM_C) / ROAD;
    const camH = ((h * 0.84 - horizon) * CAM_C) / k;
    const camX = this.px * 0.3;
    const cx = w / 2;
    const lay = (this.layout = { horizon, k, camH, camX, cx, w, h });
    const dark = view.dark ? DARKEN[this.themeName] ?? 0.4 : 0;
    const th = this.theme;
    const amp = view.reduced ? 0.25 : 1;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 14 * amp : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 * amp : 0;
    g.save();
    g.translate(sx, sy);
    void lay;

    // sky and ground
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, shade(th.sky[0], dark)); sky.addColorStop(1, shade(th.sky[1], dark));
    g.fillStyle = sky; g.fillRect(-20, -20, w + 40, horizon + 21);
    g.fillStyle = shade(th.ground, dark); g.fillRect(-20, horizon, w + 40, h - horizon + 20);
    g.fillStyle = shade(th.ground2, dark);
    for (let i = 0; i < 18; i++) {
      const d0 = Math.floor(this.pos / 8) * 8 + i * 8;
      const z0 = d0 - this.pos, z1 = z0 + 4;
      if (z1 < -CAM_C + 0.5 || z0 > VIEW_Z) continue;
      const y0 = this.proj(0, Math.max(z0, -CAM_C + 0.6)).y, y1 = this.proj(0, z1).y;
      g.fillRect(-20, y1, w + 40, y0 - y1);
    }
    const near = -CAM_C + 0.6;
    const quad = (x0, z0, x1, z1, fill) => {
      const p0 = this.proj(x0, z0), p1 = this.proj(x1, z0), p2 = this.proj(x1, z1), p3 = this.proj(x0, z1);
      g.fillStyle = fill; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.fill();
    };
    const a = this.proj(-ROAD, VIEW_Z), b = this.proj(ROAD, VIEW_Z), c = this.proj(ROAD, near), dd = this.proj(-ROAD, near);
    g.fillStyle = shade(th.road, dark);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(dd.x, dd.y); g.closePath(); g.fill();
    g.strokeStyle = shade(th.edge, dark); g.lineWidth = 3;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(dd.x, dd.y); g.moveTo(b.x, b.y); g.lineTo(c.x, c.y); g.stroke();
    for (let i = 0; i < 22; i++) {
      const d0 = Math.floor(this.pos / 4) * 4 + i * 4 - 4;
      const z0 = d0 - this.pos;
      if (z0 < near || z0 > VIEW_Z) continue;
      quad(-0.07, z0, 0.07, z0 + 1.8, shade(th.stripe, dark));
    }
    // ground hazards and warnings
    for (const e of this.ents) {
      const z = e.d - this.pos;
      if (e.kind === 'ice' && z < VIEW_Z && z + e.len > near) quad(e.x0, Math.max(z, near), e.x1, Math.min(z + e.len, VIEW_Z), 'rgba(186,230,253,.75)');
      if (e.kind === 'fork' && z < VIEW_Z && z + e.len > near) quad(e.x - 0.15, Math.max(z, near), e.x + 0.15, Math.min(z + e.len, VIEW_Z), '#64748b');
      if (e.kind === 'geyser' && z < VIEW_Z && z > near) {
        const st = geyserState(e, this.t), p = this.proj(e.x, z);
        g.fillStyle = st === 'burst' ? 'rgba(251,146,60,.95)' : st === 'warn' ? `rgba(251,146,60,${0.35 + Math.sin(this.t * 20) * 0.2})` : 'rgba(68,64,60,.8)';
        g.beginPath(); g.ellipse(p.x, p.y, e.r * p.s, e.r * p.s * 0.4, 0, 0, 6.28); g.fill();
      }
    }
    for (const wv of this.warnings) this.drawWarning2d(g, wv, quad);
    const fz = this.L.length - this.pos;
    if (fz > near && fz < VIEW_Z) {
      const cells = 12;
      for (let row = 0; row < 2; row++) for (let i = 0; i < cells; i++) {
        const x0 = -ROAD + (i * 2 * ROAD) / cells;
        quad(x0, fz + row * 0.5, x0 + (2 * ROAD) / cells, fz + row * 0.5 + 0.5, (i + row) % 2 ? '#111' : '#fff');
      }
    }

    // drawables, far to near
    const list = [];
    for (let i = 0; i < 16; i++) {
      const d0 = Math.floor(this.pos / 7) * 7 + i * 7;
      const z = d0 - this.pos;
      if (z < near + 0.5 || z > VIEW_Z) continue;
      const side = (Math.floor(d0 / 7) % 2) ? 1 : -1;
      list.push({ z, draw: () => this.drawDeco(g, side * (ROAD + 1.4 + ((d0 * 13) % 7) / 7), z, dark) });
      list.push({ z: z + 3.5, draw: () => this.drawDeco(g, -side * (ROAD + 1.6 + ((d0 * 7) % 5) / 5), z + 3.5, dark) });
    }
    for (const e of this.ents) {
      const z = e.d - this.pos;
      if (z > VIEW_Z || z < near + 0.3) continue;
      list.push({ z, draw: () => this.drawEnt(g, e, z, view) });
    }
    for (const gb of this.goo) {
      const z = gb.d - this.pos;
      list.push({ z, draw: () => { const p = this.proj(gb.x, z, gb.h); g.fillStyle = '#a3e635'; g.beginPath(); g.arc(p.x, p.y, Math.max(3, p.s * 0.22), 0, 6.28); g.fill(); } });
    }
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      list.push({ z: s.z, draw: () => this.drawSoldier(g, this.px + s.x, s.z, i, view) });
    }
    list.sort((p, q) => q.z - p.z);
    for (const item of list) item.draw();

    const wcol = WEAPONS[this.weapon].color;
    g.strokeStyle = wcol; g.lineCap = 'round';
    for (const bl of this.bullets) {
      const z = bl.d - this.pos;
      if (z > VIEW_Z) continue;
      const p0 = this.proj(bl.x, z, 0.55), p1 = this.proj(bl.x, z + 1.3, 0.55);
      g.lineWidth = Math.max(2, p0.s * 0.09);
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    }
    g.lineCap = 'butt';
    for (const p of this.parts) {
      const z = p.d - this.pos;
      if (z < near || z > VIEW_Z) continue;
      if (p.ring) {
        const q = 1 - p.life / p.max, c0 = this.proj(p.x, z);
        g.strokeStyle = `rgba(253, 224, 71, ${1 - q})`; g.lineWidth = 6 * (1 - q) + 1;
        g.beginPath(); g.ellipse(c0.x, c0.y, p.radius * c0.s * q, p.radius * c0.s * q * 0.45, 0, 0, Math.PI * 2); g.stroke();
        continue;
      }
      const pp = this.proj(p.x, z, p.h);
      g.globalAlpha = Math.min(1, p.life / p.max * 2);
      g.fillStyle = p.color;
      const r = Math.max(1.2, p.size * pp.s);
      g.fillRect(pp.x - r, pp.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    this.drawOverlay(g, view);
  }

  drawWarning2d(g, wv, quad) {
    const k = clamp(1 - wv.t / wv.dur, 0, 1);
    const a = 0.25 + k * 0.45 + Math.sin(this.t * 24) * 0.08;
    if (wv.kind === 'beam' || wv.kind === 'strike') {
      const p = this.proj(wv.x, 0.4);
      g.fillStyle = `rgba(168,85,247,${a})`; g.beginPath(); g.ellipse(p.x, p.y, wv.r * p.s, wv.r * p.s * 0.4, 0, 0, 6.28); g.fill();
    } else quad(wv.x0, -2, wv.x1, 22, wv.kind === 'breath' ? `rgba(125,211,252,${a * 0.7})` : `rgba(239,68,68,${a * 0.6})`);
  }

  /** Health numbers and crate labels (the 2D world draws them with the sprites). */
  drawLabels(g) {
    for (const e of this.ents) {
      if (!e.alive) continue;
      const z = e.d - this.pos;
      if (z > VIEW_Z || z < -1) continue;
      if (e.kind === 'enemy' && (e.type === 'blorb' || e.type === 'boss' || e.shield > 0)) {
        const top = this.proj(e.x, z, e.type === 'boss' ? BOSSES[e.boss].h + 0.9 : e.type === 'blorb' ? 2.25 : 1.75);
        const txt = e.shield > 0 ? `${Math.ceil(e.shield)}⛨` : String(Math.ceil(e.hp));
        label(g, txt, top.x, top.y, Math.round(Math.max(11, Math.min(26, top.s * (e.type === 'boss' ? 0.5 : 0.36)))), e.shield > 0 ? '#e2e8f0' : '#fff', 'rgba(0,0,0,.65)');
      } else if (e.kind === 'barrel' || e.kind === 'crate' || e.kind === 'cage') {
        const top = this.proj(e.x, z, e.kind === 'barrel' ? 1.25 : 1.4);
        label(g, String(Math.ceil(e.hp)), top.x, top.y, Math.round(Math.max(11, Math.min(24, top.s * 0.34))), '#fff', 'rgba(0,0,0,.65)');
        const sub = e.kind === 'crate' ? WEAPONS[e.weapon != null ? e.weapon : Math.min(this.weapon + 1, WEAPONS.length - 1)].name.toUpperCase() : e.kind === 'cage' ? `+${e.v} RANGERS` : null;
        if (sub) label(g, sub, top.x, top.y - Math.max(14, top.s * 0.36), Math.round(Math.max(10, Math.min(18, top.s * 0.22))), e.kind === 'cage' ? '#86efac' : '#fde047', 'rgba(0,0,0,.7)');
      } else if (e.kind === 'pickup' && z < 40) {
        const top = this.proj(e.x, z, 1.3);
        label(g, e.type === 'medkit' ? `+${e.v}` : PICKUPS[e.type].name, top.x, top.y, Math.round(Math.max(10, Math.min(18, top.s * 0.24))), PICKUPS[e.type].color, 'rgba(0,0,0,.7)');
      }
    }
  }

  drawOverlay(g, view) {
    const { w, h } = view;
    // squad count bubble
    if (this.n > 0 && !(this.result && !this.result.won)) {
      const top = this.proj(this.px, -0.4, 1.2 + this.radius * 0.5);
      const sc = 1 + this.countPop * 0.35;
      const txt = String(this.n);
      const size = Math.round(Math.max(18, Math.min(30, top.s * 0.42)) * sc);
      g.font = `800 ${size}px Geist, Inter, system-ui, sans-serif`;
      const tw = g.measureText(txt).width + size * 0.9;
      g.fillStyle = this.buffs.bubble > 0 ? '#7c3aed' : '#16a34a'; roundRect(g, top.x - tw / 2, top.y - size * 0.75, tw, size * 1.5, size * 0.75); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      label(g, txt, top.x, top.y + 1, size, '#fff', 'rgba(0,0,0,.25)');
    }
    for (const p of this.popups) {
      const z = p.squad ? p.z : p.d - this.pos;
      const pp = this.proj(p.squad ? this.px : p.x, z, p.h);
      const age = 1 - p.life / p.max;
      const sc = age < 0.15 ? 0.6 + age / 0.15 * 0.5 : 1.1 - Math.min(0.1, (age - 0.15));
      g.globalAlpha = Math.min(1, p.life * 3);
      label(g, p.text, pp.x, pp.y, Math.round(26 * p.size * sc), p.color, 'rgba(0,0,0,.6)', 900);
    }
    g.globalAlpha = 1;
    g.restore();

    // boss bar
    if (this.boss && this.boss.alive && this.boss.d - this.pos < WAKE_Z) {
      const B = BOSSES[this.boss.boss];
      const bw = Math.min(w - 48, 320), bx = (w - bw) / 2, by = 112;
      g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, bx - 3, by - 3, bw + 6, 20, 8); g.fill();
      g.fillStyle = B.core && this.boss.coreOpen > 0 ? '#f472b6' : '#ef4444'; roundRect(g, bx, by, Math.max(0, bw * this.boss.hp / this.boss.maxHp), 14, 6); g.fill();
      label(g, B.core && this.boss.coreOpen > 0 ? `${B.name} · CORE OPEN!` : B.name, w / 2, by + 7, 12, '#fff', 'rgba(0,0,0,.7)');
    }
    // active items (bottom left) and the grenade button (bottom right)
    let bx = 14;
    const chips = [['bubble', 'SHIELD'], ['double', '2× DMG'], ['turret', 'TURRET'], ['freeze', 'FREEZE']];
    for (const [k, name] of chips) {
      if (!(this.buffs[k] > 0)) continue;
      const txt = `${name} ${Math.ceil(this.buffs[k])}s`;
      g.font = '700 12px Geist, Inter, system-ui, sans-serif';
      const tw = g.measureText(txt).width + 16;
      g.fillStyle = 'rgba(9,9,11,.6)'; roundRect(g, bx, h - 40, tw, 24, 12); g.fill();
      label(g, txt, bx + tw / 2, h - 28, 12, PICKUPS[k === 'freeze' ? 'freeze' : k].color, 'rgba(0,0,0,0)');
      bx += tw + 6;
    }
    if (this.revives > 0) { g.fillStyle = 'rgba(9,9,11,.6)'; roundRect(g, bx, h - 40, 74, 24, 12); g.fill(); label(g, `REVIVE ×${this.revives}`, bx + 37, h - 28, 12, '#86efac', 'rgba(0,0,0,0)'); }
    this.grenadeButton = null;
    if (this.grenades > 0 && !this.result) {
      const r = 30, x = w - r - 18, y = h - r - 18;
      this.grenadeButton = { x, y, r };
      g.fillStyle = this.grenadeCd > 0 ? 'rgba(9,9,11,.45)' : 'rgba(234,88,12,.92)'; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
      label(g, '💣', x, y - 2, 22, '#fff', 'rgba(0,0,0,0)');
      label(g, `×${this.grenades}`, x + r * 0.7, y + r * 0.7, 13, '#fff', 'rgba(0,0,0,.7)');
      if (view.keyboard) label(g, 'SPACE', x, y - r - 10, 10, '#fff', 'rgba(0,0,0,.6)');
    }
    // screen flashes
    if (this.flash > 0) {
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(239,68,68,0)'); v.addColorStop(1, `rgba(239,68,68,${0.5 * this.flash})`);
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }
    if (this.goodFlash > 0) {
      const v = g.createRadialGradient(w / 2, h, 10, w / 2, h, Math.max(w, h) * 0.8);
      v.addColorStop(0, `rgba(134,239,172,${0.35 * this.goodFlash})`); v.addColorStop(1, 'rgba(134,239,172,0)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }
    if (this.preview) { g.fillStyle = view.dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.15)'; g.fillRect(0, 0, w, h); }
  }

  proj(x, z, hgt = 0) {
    if (this.projFn) return this.projFn(x, z, hgt);
    const L = this.layout;
    const s = L.k / Math.max(0.35, z + CAM_C);
    return { x: L.cx + (x - L.camX) * s, y: L.horizon + (L.camH - hgt) * s, s };
  }

  drawShadow(g, x, z, r) {
    const p = this.proj(x, z);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(p.x, p.y, r * p.s, r * p.s * 0.4, 0, 0, Math.PI * 2); g.fill();
  }

  drawSoldier(g, x, z, i) {
    const p = this.proj(x, z), s = p.s;
    const u = s * 0.24;
    const bob = Math.sin(this.t * 14 + i) * u * 0.08;
    this.drawShadow(g, x, z, 0.24);
    const y = p.y + bob;
    g.fillStyle = '#41552a';
    const step = Math.sin(this.t * 14 + i) * u * 0.25;
    g.fillRect(p.x - u * 0.45, y - u * 1.2 + step, u * 0.35, u * 1.2 - step);
    g.fillRect(p.x + u * 0.1, y - u * 1.2 - step, u * 0.35, u * 1.2 + step);
    g.fillStyle = '#5d7a35'; roundRect(g, p.x - u * 0.6, y - u * 2.6, u * 1.2, u * 1.6, u * 0.35); g.fill();
    g.fillStyle = '#f1f4f6'; g.fillRect(p.x + u * 0.25, y - u * 3.5, u * 0.28, u * 1.6);
    if (this.muzzle > 0.4 && i < 12) { g.fillStyle = WEAPONS[this.weapon].color; g.beginPath(); g.arc(p.x + u * 0.39, y - u * 3.7, u * 0.38 * this.muzzle, 0, 6.28); g.fill(); }
    g.fillStyle = ['#f6efe7', '#e8752c', '#d9b38a', '#9a9aa0'][i & 3]; g.beginPath(); g.arc(p.x, y - u * 3, u * 0.55, 0, 6.28); g.fill();
    g.fillStyle = '#5d7a35'; g.beginPath(); g.arc(p.x, y - u * 3.15, u * 0.6, Math.PI, 0); g.fill();
  }

  drawEnt(g, e, z) {
    const fade = e.alive ? 1 : Math.max(0, e.fade);
    if (fade <= 0) return;
    g.globalAlpha = fade;
    if (e.kind === 'gate') this.drawGate(g, e, z);
    else if (e.kind === 'enemy') this.drawEnemy(g, e, z);
    else if (e.kind === 'barrel') this.drawBarrel(g, e, z);
    else if (e.kind === 'crate' || e.kind === 'cage') this.drawCrate(g, e, z);
    else if (e.kind === 'block' || e.kind === 'laser') this.drawFence(g, e, z);
    else if (e.kind === 'pickup') this.drawPickup(g, e, z);
    g.globalAlpha = 1;
  }

  drawGate(g, e, z) {
    const H = 1.7;
    const p0 = this.proj(e.x0 + 0.08, z), p1 = this.proj(e.x1 - 0.08, z);
    const t0 = this.proj(e.x0 + 0.08, z, H), t1 = this.proj(e.x1 - 0.08, z, H);
    const good = gateGood(e);
    const pulse = e.pulse > 0 ? (e.pulse -= 0.08, e.pulse) : 0;
    const base = good ? (e.op === 'rate' ? '34, 211, 238' : '59, 130, 246') : '239, 68, 68';
    g.fillStyle = `rgba(${base}, ${0.42 + pulse * 0.25})`;
    g.fillRect(t0.x, t0.y, p1.x - p0.x, p0.y - t0.y);
    g.strokeStyle = `rgba(${base}, 1)`; g.lineWidth = Math.max(2, p0.s * 0.06);
    g.strokeRect(t0.x, t0.y, p1.x - p0.x, p0.y - t0.y);
    g.fillStyle = good ? '#1d4ed8' : '#b91c1c';
    const pw = Math.max(3, p0.s * 0.12);
    g.fillRect(p0.x - pw / 2, t0.y, pw, p0.y - t0.y); g.fillRect(p1.x - pw / 2, t1.y, pw, p1.y - t1.y);
    const mid = this.proj((e.x0 + e.x1) / 2, z, H * 0.55);
    const size = Math.max(10, mid.s * (e.op === 'rate' ? 0.48 : 0.62)) * (1 + pulse * 0.25);
    label(g, gateText(e), mid.x, mid.y, Math.round(size), '#fff', 'rgba(0,0,0,.45)', 900);
    if (e.op === 'rate') label(g, 'FIRE RATE', mid.x, mid.y - size * 0.85, Math.round(size * 0.4), '#fff', 'rgba(0,0,0,.45)');
  }

  drawEnemy(g, e, z) {
    const p = this.proj(e.x, z, ENEMY[e.type].fly ? 0.8 : 0), s = p.s;
    const big = e.type === 'blorb' ? 1.8 : e.type === 'boss' ? 4 : 1;
    const u = s * 0.24 * big;
    this.drawShadow(g, e.x, z, e.r);
    const metal = ENEMY[e.type].metal;
    const body = e.flash > 0 ? '#fff' : e.frozen > 0 ? '#bae6fd' : metal ? '#e07a2c' : '#8f4fe6';
    g.fillStyle = body;
    if (metal) { roundRect(g, p.x - u * 0.7, p.y - u * 3, u * 1.4, u * 2.6, u * 0.3); g.fill(); }
    else { g.beginPath(); g.ellipse(p.x, p.y - u * 1.4, u * 1.1, u * 1.4, 0, 0, 6.28); g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y - u * (metal ? 2.3 : 1.7), u * 0.45, 0, 6.28); g.fill();
    g.fillStyle = metal ? '#ffd23a' : '#4c1d95'; g.beginPath(); g.arc(p.x, p.y - u * (metal ? 2.3 : 1.7), u * 0.22, 0, 6.28); g.fill();
    if (e.shield > 0) { g.fillStyle = '#e07a2c'; g.strokeStyle = '#8f959e'; g.lineWidth = Math.max(2, u * 0.15); roundRect(g, p.x - u * 1.1, p.y - u * 2.4, u * 2.2, u * 2.2, u * 0.2); g.fill(); g.stroke(); }
    if (e.type === 'spitter') { g.fillStyle = '#84cc16'; g.fillRect(p.x + u * 0.5, p.y - u * 1.3, u * 0.9, u * 0.35); }
  }

  drawBarrel(g, e, z) {
    const p = this.proj(e.x, z), u = p.s * 0.3;
    this.drawShadow(g, e.x, z, 0.4);
    g.fillStyle = e.flash > 0 ? '#fff' : '#dc2626';
    roundRect(g, p.x - u, p.y - u * 2.6, u * 2, u * 2.6, u * 0.4); g.fill();
    g.fillStyle = '#991b1b'; g.fillRect(p.x - u, p.y - u * 1.9, u * 2, u * 0.22); g.fillRect(p.x - u, p.y - u * 0.9, u * 2, u * 0.22);
    g.fillStyle = '#fde047'; g.beginPath(); g.moveTo(p.x, p.y - u * 1.75); g.lineTo(p.x - u * 0.45, p.y - u * 1.0); g.lineTo(p.x + u * 0.45, p.y - u * 1.0); g.fill();
    if (e.flash > 0) e.flash -= 0.016;
  }

  drawCrate(g, e, z) {
    const p = this.proj(e.x, z), u = p.s * 0.34;
    this.drawShadow(g, e.x, z, 0.5);
    const glow = 0.5 + Math.sin(this.t * 6) * 0.5;
    g.fillStyle = e.kind === 'cage' ? `rgba(134, 239, 172, ${0.2 + glow * 0.2})` : `rgba(250, 204, 21, ${0.25 + glow * 0.25})`;
    g.beginPath(); g.arc(p.x, p.y - u * 1.1, u * 1.9, 0, 6.28); g.fill();
    g.fillStyle = e.flash > 0 ? '#fff' : e.kind === 'cage' ? '#64748b' : '#b45309';
    g.fillRect(p.x - u, p.y - u * 2, u * 2, u * 2);
    g.strokeStyle = e.kind === 'cage' ? '#1e293b' : '#78350f'; g.lineWidth = Math.max(1.5, u * 0.15); g.strokeRect(p.x - u, p.y - u * 2, u * 2, u * 2);
    if (e.kind === 'cage') for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(p.x - u + (i * u) / 2, p.y - u * 2); g.lineTo(p.x - u + (i * u) / 2, p.y); g.stroke(); }
    else { g.beginPath(); g.moveTo(p.x - u, p.y - u * 2); g.lineTo(p.x + u, p.y); g.moveTo(p.x + u, p.y - u * 2); g.lineTo(p.x - u, p.y); g.stroke(); }
    if (e.flash > 0) e.flash -= 0.016;
  }

  drawFence(g, e, z) {
    const on = e.kind === 'block' || laserOn(e, this.t), warn = e.kind === 'laser' && laserWarn(e, this.t);
    const base0 = this.proj(e.x0, z), base1 = this.proj(e.x1, z), top0 = this.proj(e.x0, z, 1.1);
    g.fillStyle = e.kind === 'block' ? '#e07a2c' : on ? 'rgba(244,63,94,.75)' : warn ? `rgba(244,63,94,${0.2 + Math.sin(this.t * 30) * 0.15})` : 'rgba(148,163,184,.25)';
    g.fillRect(base0.x, top0.y, base1.x - base0.x, base0.y - top0.y);
    g.fillStyle = '#334155'; const pw = Math.max(3, base0.s * 0.1);
    g.fillRect(base0.x - pw / 2, top0.y, pw, base0.y - top0.y); g.fillRect(base1.x - pw / 2, top0.y, pw, base0.y - top0.y);
  }

  drawPickup(g, e, z) {
    const p = this.proj(e.x, z, 0.6 + Math.sin(this.t * 3 + e.x) * 0.1), u = p.s * 0.3;
    this.drawShadow(g, e.x, z, 0.35);
    g.fillStyle = PICKUPS[e.type].color; g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, u * 0.12);
    g.beginPath(); g.arc(p.x, p.y, u, 0, 6.28); g.fill(); g.stroke();
  }

  drawDeco(g, x, z, dark) {
    const p = this.proj(x, z), s = p.s;
    const kind = this.theme.deco;
    if (kind === 'tree' || kind === 'pine') {
      g.fillStyle = shade('#78350f', dark); g.fillRect(p.x - s * 0.08, p.y - s * 0.7, s * 0.16, s * 0.7);
      g.fillStyle = shade(kind === 'pine' ? '#166534' : '#15803d', dark);
      if (kind === 'pine') { g.beginPath(); g.moveTo(p.x, p.y - s * 2.2); g.lineTo(p.x - s * 0.6, p.y - s * 0.5); g.lineTo(p.x + s * 0.6, p.y - s * 0.5); g.fill(); }
      else { g.beginPath(); g.arc(p.x, p.y - s * 1.1, s * 0.55, 0, 6.28); g.fill(); }
    } else if (kind === 'cactus') {
      g.fillStyle = shade('#15803d', dark);
      roundRect(g, p.x - s * 0.12, p.y - s * 1.3, s * 0.24, s * 1.3, s * 0.12); g.fill();
    } else {
      g.fillStyle = '#44403c'; g.beginPath(); g.ellipse(p.x, p.y - s * 0.3, s * 0.6, s * 0.4, 0, 0, 6.28); g.fill();
    }
  }
}

export const fernRangers = {
  id: 'fern-rangers',
  title: 'Fern Rangers',
  tagline: 'Hold the road. Grow the squad. Bubble the invasion.',
  howTo: 'Drag (touch), move the mouse or hold ← → / A D to steer. Shoot red gates to raise their number. Space throws a grenade. Esc pauses, R restarts.',
  levels: LEVELS,
  hero: 'RANGER_BUNNY',
  art: new URL('../../games-assets/k-fern-rangers.webp', import.meta.url).href,
  create: (i, env) => new FernRangersSession(i, env),
  view3d: () => import('./fern-rangers-3d.js'),
};
