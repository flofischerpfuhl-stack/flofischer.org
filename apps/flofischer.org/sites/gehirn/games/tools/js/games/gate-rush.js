/**
 * Gate Rush — the gameplay from the Last War: Survival ads ("Frontline" runs): your squad fires non-stop up a road,
 * zombies run at you, and you steer through number gates (+5, x2, −3, fire rate) that you can also shoot to raise
 * their value. Barrels explode, crates hold better guns, spikes cost soldiers, some levels end in a boss.
 *
 * The simulation is plain data + update(dt) (deterministic per level), so tests can play it headless.
 * World: x across the road (−ROAD … ROAD), d along it; z = d − pos is the distance ahead of the squad.
 */
import { clamp, lerp, rng, label, roundRect } from './core.js';
import { LEVELS } from './gate-rush-levels.js';

export const ROAD = 3;
const CAM_C = 6, VIEW_Z = 64, BULLET_SPEED = 46, WAKE_Z = 40;
export const WEAPONS = [
  { name: 'Pistol', rate: 2.2, dmg: 1, color: '#a5f3fc' },
  { name: 'Rifle', rate: 3.4, dmg: 1.2, color: '#67e8f9' },
  { name: 'Machine gun', rate: 5.5, dmg: 1.35, color: '#5eead4' },
  { name: 'Minigun', rate: 9, dmg: 1.45, color: '#fde047' },
  { name: 'Laser', rate: 11, dmg: 2, color: '#f0abfc' },
];
export const ENEMY = {
  // dmg: soldiers lost per point of health the enemy still has when it reaches the squad (at least one).
  zombie: { hp: 2, speed: 2.2, r: 0.34, dmg: 0.34, score: 10, home: 0.7, h: 0.95 },
  runner: { hp: 1.5, speed: 5, r: 0.3, dmg: 0.34, score: 15, home: 1.3, h: 0.9 },
  brute: { hp: 18, speed: 1.6, r: 0.62, dmg: 0.4, score: 60, home: 0.55, h: 1.6 },
  boss: { hp: 300, speed: 0.9, r: 1.35, dmg: Infinity, score: 500, home: 0.45, h: 3.2 },
};
const THEMES = {
  meadow: { sky: ['#7dd3fc', '#e0f2fe'], ground: '#65a30d', ground2: '#4d7c0f', road: '#a1a1aa', edge: '#f4f4f5', stripe: '#ffffff', deco: 'tree' },
  desert: { sky: ['#fdba74', '#fef3c7'], ground: '#d4a15a', ground2: '#b98543', road: '#a8a29e', edge: '#f5f5f4', stripe: '#fff7ed', deco: 'cactus' },
  city: { sky: ['#94a3b8', '#e2e8f0'], ground: '#6b7280', ground2: '#4b5563', road: '#3f3f46', edge: '#a1a1aa', stripe: '#fde047', deco: 'building' },
  snow: { sky: ['#bae6fd', '#f0f9ff'], ground: '#f1f5f9', ground2: '#dbe4ee', road: '#94a3b8', edge: '#ffffff', stripe: '#ffffff', deco: 'pine' },
  night: { sky: ['#0b1023', '#312e81'], ground: '#1e293b', ground2: '#162032', road: '#334155', edge: '#64748b', stripe: '#facc15', deco: 'lamp' },
  lava: { sky: ['#3b0a0a', '#9a3412'], ground: '#292524', ground2: '#1c1917', road: '#57534e', edge: '#f97316', stripe: '#fb923c', deco: 'rock' },
};
const DARKEN = { meadow: 0.45, desert: 0.45, city: 0.45, snow: 0.5, night: 0, lava: 0.1 };

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

/** Turn the level script into live entities. */
function build(level, rand) {
  const ents = [];
  let group = 0;
  for (const ev of level.events) {
    if (ev.t === 'gate') {
      group++;
      for (const gate of ev.gates) ents.push({ kind: 'gate', d: ev.d, group, ...gate, shot: 0, pulse: 0, alive: true });
    } else if (ev.t === 'wave') {
      const def = ENEMY[ev.kind];
      const cols = ev.cols || Math.min(ev.n, 4);
      for (let i = 0; i < ev.n; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const span = ev.x1 - ev.x0;
        const x = cols === 1 ? (ev.x0 + ev.x1) / 2 : ev.x0 + (span * col) / (cols - 1);
        ents.push({
          kind: 'enemy', type: ev.kind, d: ev.d + row * (ev.gap || 1.3) + rand() * 0.4, x: clamp(x + (rand() - 0.5) * 0.35, -ROAD + 0.3, ROAD - 0.3),
          hp: def.hp * (ev.hp || level.hpMul || 1), maxHp: def.hp * (ev.hp || level.hpMul || 1), speed: def.speed * (ev.speed || 1) * (0.9 + rand() * 0.2),
          r: def.r, alive: true, active: false, flash: 0, phase: rand() * 6.28,
        });
      }
    } else if (ev.t === 'boss') {
      const def = ENEMY.boss;
      ents.push({ kind: 'enemy', type: 'boss', d: ev.d, x: 0, hp: ev.hp, maxHp: ev.hp, speed: def.speed * (ev.speed || 1), r: def.r, alive: true, active: false, flash: 0, phase: 0, spawn: ev.spawn || 0, spawnT: 2 });
    } else if (ev.t === 'barrel') {
      ents.push({ kind: 'barrel', d: ev.d, x: ev.x, hp: ev.hp, maxHp: ev.hp, alive: true, flash: 0 });
    } else if (ev.t === 'crate') {
      ents.push({ kind: 'crate', d: ev.d, x: ev.x, hp: ev.hp, maxHp: ev.hp, alive: true, flash: 0, weapon: ev.weapon });
    } else if (ev.t === 'spikes') {
      ents.push({ kind: 'spikes', d: ev.d, x0: ev.x0, x1: ev.x1, alive: true, hit: false });
    }
  }
  return ents;
}

export class GateRushSession {
  constructor(levelIndex, env = {}) {
    this.index = levelIndex;
    this.L = LEVELS[levelIndex];
    this.sound = env.sound || { play() {} };
    this.preview = !!env.preview;
    this.rand = rng(levelIndex * 7919 + 13);
    this.theme = THEMES[this.L.theme] || THEMES.meadow;
    this.pos = 0; this.speed = this.L.speed; this.t = 0;
    this.n = this.L.start.soldiers; this.weapon = this.L.start.weapon; this.rateMul = 1;
    this.px = 0; this.tx = 0; this.keyDir = 0; this.drag = null;
    this.score = 0; this.kills = 0; this.result = null;
    this.ents = build(this.L, this.rand);
    this.boss = this.ents.find((e) => e.type === 'boss') || null;
    this.bullets = []; this.parts = []; this.popups = [];
    this.fireAcc = 0; this.shake = 0; this.flash = 0; this.goodFlash = 0; this.countPop = 0; this.muzzle = 0;
    this.slots = [];
    this.hint = this.L.hint;
    this.layout = null;
    this.syncSlots(true);
    if (!this.preview) this.popup('GO!', 0, 1.6, '#ffffff', 1.25);
  }

  // ── squad formation (sunflower pattern) ──
  slotTarget(i) {
    const a = i * 2.39996, r = 0.36 * Math.sqrt(i + 0.35);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.75 };
  }
  syncSlots(snap = false) {
    const want = Math.min(Math.max(this.n, 0), 90);
    while (this.slots.length < want) { const t = this.slotTarget(this.slots.length); this.slots.push(snap ? { ...t } : { x: 0, z: 0 }); }
    if (this.slots.length > want) this.slots.length = want;
  }
  get radius() { return squadRadius(this.n); }

  // ── input ──
  pointer(type, x, y, e = {}) {
    const lay = this.layout;
    if (!lay || this.result) { if (type === 'up') this.drag = null; return; }
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
    this.updateParticles(dt);
    if (this.result && !this.result.won) return;

    if (this.keyDir) this.tx = clamp(this.tx + this.keyDir * 8 * dt, -ROAD, ROAD);
    const lim = ROAD - Math.min(this.radius, ROAD) * 0.6;
    const target = clamp(this.tx, -lim, lim);
    this.px = lerp(this.px, target, 1 - Math.exp(-dt * 16));

    // Boss fights hold the squad in place.
    const bossNear = this.boss && this.boss.alive && this.boss.d - this.pos < 22;
    this.speed = lerp(this.speed, bossNear || (this.result && this.pos > this.L.length + 12) ? 0 : this.L.speed, 1 - Math.exp(-dt * 3));
    this.pos += this.speed * dt;

    for (const s of this.slots.keys()) {
      const slot = this.slots[s], tgt = this.slotTarget(s);
      slot.x = lerp(slot.x, tgt.x, 1 - Math.exp(-dt * 10)); slot.z = lerp(slot.z, tgt.z, 1 - Math.exp(-dt * 10));
    }
    if (this.result) return; // won: keep walking and celebrating, nothing can hurt the squad any more

    this.updateEnemies(dt);
    this.fire(dt);
    this.updateBullets(dt);
    this.checkContacts();
    this.ents = this.ents.filter((e) => e.alive || e.fade > 0);

    if (this.n <= 0) this.lose(this.loseReason || 'The horde overran your squad');
    else if (this.pos >= this.L.length && !(this.boss && this.boss.alive)) this.win();
  }

  updateEnemies(dt) {
    for (const e of this.ents) {
      if (e.fade > 0) e.fade -= dt * 3;
      if (e.flash > 0) e.flash -= dt;
      if (e.kind !== 'enemy' || !e.alive) continue;
      const z = e.d - this.pos;
      if (!e.active && z < WAKE_Z) e.active = true;
      if (!e.active) continue;
      e.d -= e.speed * dt;
      e.phase += dt * e.speed * 3;
      if (z < 30) e.x = clamp(e.x + clamp(this.px - e.x, -1, 1) * ENEMY[e.type].home * dt, -ROAD + 0.2, ROAD - 0.2);
      if (e.type === 'boss') {
        if (Math.floor(this.t * 1.2) !== Math.floor((this.t - dt) * 1.2)) { this.shake = Math.max(this.shake, 0.25); this.sound.play('hurt', 400); }
        if (e.spawn && z < 30) {
          e.spawnT -= dt;
          if (e.spawnT <= 0) {
            e.spawnT = 2.4;
            for (let i = 0; i < e.spawn; i++) {
              const def = ENEMY.zombie;
              this.ents.push({ kind: 'enemy', type: 'zombie', d: e.d - 1.2, x: clamp(e.x + (i - (e.spawn - 1) / 2) * 0.9, -ROAD + 0.3, ROAD - 0.3), hp: def.hp * (this.L.hpMul || 1), maxHp: def.hp, speed: def.speed * 1.1, r: def.r, alive: true, active: true, flash: 0, phase: this.rand() * 6 });
            }
          }
        }
      }
    }
  }

  fire(dt) {
    const w = WEAPONS[this.weapon];
    const shooters = Math.min(this.n, 12);
    if (shooters <= 0) return;
    this.fireAcc += dt * w.rate * this.rateMul;
    let fired = false;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      const per = (w.dmg * this.n) / shooters;
      // Spread the shooters across the squad's width: the outermost soldiers fire too.
      for (let i = 0; i < shooters; i++) {
        const off = shooters === 1 ? 0 : (i / (shooters - 1) - 0.5) * 2 * Math.min(this.radius * 0.85, ROAD);
        this.bullets.push({ x: this.px + off, d: this.pos + 0.5 + this.rand() * 0.3, prev: this.pos + 0.5, dmg: per, life: this.L.range || 34 });
      }
      fired = true;
    }
    if (fired) { this.muzzle = 1; this.sound.play('shot', 75); }
  }

  updateBullets(dt) {
    const step = BULLET_SPEED * dt;
    const targets = this.ents.filter((e) => e.alive && (e.kind === 'enemy' ? e.active : e.kind !== 'spikes'));
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
    e.hp -= b.dmg; e.flash = 0.08;
    if (e.kind === 'enemy') {
      if (e.type !== 'boss') e.d += 0.06 * b.dmg / (e.type === 'brute' ? 4 : 1);
      this.spray(e.x, e.d, ENEMY[e.type].h * 0.6, '#84cc16', 2);
      this.sound.play('hit', 60);
    }
    if (e.hp > 0) return;
    e.alive = false; e.fade = 1;
    if (e.kind === 'enemy') {
      const def = ENEMY[e.type];
      this.kills++; this.score += def.score;
      this.spray(e.x, e.d, def.h * 0.5, '#65a30d', e.type === 'boss' ? 80 : e.type === 'brute' ? 26 : 10, 3);
      this.sound.play('kill', 50);
      if (e.type === 'boss') { this.shake = 1.2; this.boom(e.x, e.d, 4); this.popupWorld('BOSS DOWN!', e.x, e.d, 3, '#fde047', 1.3); }
      else if (e.type === 'brute') this.popupWorld('+' + def.score, e.x, e.d, def.h + 0.4, '#fde047', 0.75);
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
    }
  }

  explode(x, d, radius) {
    this.boom(x, d, radius);
    this.shake = Math.max(this.shake, 0.8);
    this.sound.play('boom');
    for (const e of this.ents) {
      if (!e.alive || e.kind !== 'enemy') continue;
      if (Math.hypot(e.x - x, e.d - d) < radius + e.r) this.hit(e, { dmg: e.type === 'boss' ? 25 : 40 });
    }
  }

  checkContacts() {
    const R = this.radius;
    for (const e of this.ents) {
      if (!e.alive) continue;
      const z = e.d - this.pos;
      if (e.kind === 'gate') {
        if (z > 0) continue;
        // The gate whose span holds the squad's centre counts; its partner closes.
        const pair = this.ents.filter((o) => o.kind === 'gate' && o.group === e.group && o.alive);
        const taken = pair.find((o) => this.px >= o.x0 && this.px <= o.x1);
        for (const o of pair) { o.alive = false; o.fade = 1; }
        if (taken) this.passGate(taken);
      } else if (e.kind === 'spikes') {
        if (e.hit || z > 0.3 || z < -0.6) continue;
        const overlap = Math.min(this.px + R * 0.8, e.x1) - Math.max(this.px - R * 0.8, e.x0);
        if (overlap > 0) {
          e.hit = true;
          const lost = Math.max(2, Math.ceil(this.n * 0.3));
          this.loseSoldiers(lost, 'Spikes shredded your squad');
          this.popup('−' + lost, 0, 1.6, '#f87171', 1);
        }
      } else if (e.kind === 'barrel') {
        if (z > R * 0.6 + 0.4 || z < -1) continue;
        if (Math.abs(e.x - this.px) < R + 0.35) {
          e.alive = false; e.fade = 1;
          this.explode(e.x, e.d, 2.2);
          const lost = Math.max(3, Math.ceil(this.n * 0.25));
          this.loseSoldiers(lost, 'You ran into a barrel');
          this.popup('−' + lost, 0, 1.6, '#f87171', 1);
        }
      } else if (e.kind === 'crate') {
        if (z < -1) { e.alive = false; }
      } else if (e.kind === 'enemy') {
        if (!e.active) continue;
        if (z < -2.5) { e.alive = false; continue; }
        if (z > R * 0.75 + e.r * 0.5) continue;
        if (Math.abs(e.x - this.px) > R + e.r - 0.15) continue;
        e.alive = false; e.fade = 1;
        const dmg = Math.max(1, Math.ceil(e.hp * ENEMY[e.type].dmg));
        this.spray(e.x, e.d, 0.5, '#65a30d', 8, 2);
        if (e.type === 'boss') this.loseSoldiers(this.n, 'The titan crushed your squad');
        else this.loseSoldiers(Math.min(dmg, this.n), 'The horde overran your squad');
      }
    }
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
      this.spray(this.px + s.x, this.pos + s.z, 0.5, '#3b82f6', 6, 2.5);
    }
  }

  win() {
    const [two, three] = this.L.stars;
    const stars = this.n >= three ? 3 : this.n >= two ? 2 : 1;
    this.score += this.n * 20;
    this.result = { won: true, stars, score: this.score, soldiers: this.n, reason: `${this.n} soldier${this.n === 1 ? '' : 's'} crossed the finish line (${two} for ★★, ${three} for ★★★).` };
    this.popup('VICTORY!', 0, 2.4, '#fde047', 1.4);
    for (let i = 0; i < 60; i++) {
      const colors = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
      this.parts.push({ x: this.px + (Math.random() - 0.5) * 6, d: this.pos + 2 + Math.random() * 6, h: 3 + Math.random() * 2, vx: (Math.random() - 0.5) * 2, vd: (Math.random() - 0.5) * 2, vh: Math.random() * 3, life: 2.5, max: 2.5, color: colors[i % 5], size: 0.12, grav: 3 });
    }
  }
  lose(reason) {
    this.result = { won: false, stars: 0, score: this.score, soldiers: 0, reason };
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
    const dark = view.dark ? DARKEN[this.L.theme] ?? 0.4 : 0;
    const th = this.theme;
    const amp = view.reduced ? 0.25 : 1;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 14 * amp : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 * amp : 0;
    g.save();
    g.translate(sx, sy);

    // sky and ground
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, shade(th.sky[0], dark)); sky.addColorStop(1, shade(th.sky[1], dark));
    g.fillStyle = sky; g.fillRect(-20, -20, w + 40, horizon + 21);
    g.fillStyle = shade(th.ground, dark); g.fillRect(-20, horizon, w + 40, h - horizon + 20);
    // ground bands for speed
    g.fillStyle = shade(th.ground2, dark);
    for (let i = 0; i < 18; i++) {
      const d0 = Math.floor(this.pos / 8) * 8 + i * 8;
      const z0 = d0 - this.pos, z1 = z0 + 4;
      if (z1 < -CAM_C + 0.5 || z0 > VIEW_Z) continue;
      const y0 = this.proj(0, Math.max(z0, -CAM_C + 0.6)).y, y1 = this.proj(0, z1).y;
      g.fillRect(-20, y1, w + 40, y0 - y1);
    }
    // road
    const near = -CAM_C + 0.6;
    const a = this.proj(-ROAD, VIEW_Z), b = this.proj(ROAD, VIEW_Z), c = this.proj(ROAD, near), dd = this.proj(-ROAD, near);
    g.fillStyle = shade(th.road, dark);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(dd.x, dd.y); g.closePath(); g.fill();
    g.strokeStyle = shade(th.edge, dark); g.lineWidth = 3;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(dd.x, dd.y); g.moveTo(b.x, b.y); g.lineTo(c.x, c.y); g.stroke();
    // centre dashes
    g.fillStyle = shade(th.stripe, dark);
    for (let i = 0; i < 22; i++) {
      const d0 = Math.floor(this.pos / 4) * 4 + i * 4 - 4;
      const z0 = d0 - this.pos, z1 = z0 + 1.8;
      if (z0 < near || z0 > VIEW_Z) continue;
      const p0 = this.proj(-0.07, z0), p1 = this.proj(0.07, z0), p2 = this.proj(0.07, z1), p3 = this.proj(-0.07, z1);
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.fill();
    }
    // finish line
    const fz = this.L.length - this.pos;
    if (fz > near && fz < VIEW_Z) {
      const cells = 12;
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < cells; i++) {
          const x0 = -ROAD + (i * 2 * ROAD) / cells, x1 = x0 + (2 * ROAD) / cells;
          const z0 = fz + row * 0.5, z1 = z0 + 0.5;
          const p0 = this.proj(x0, z0), p1 = this.proj(x1, z0), p2 = this.proj(x1, z1), p3 = this.proj(x0, z1);
          g.fillStyle = (i + row) % 2 ? '#111' : '#fff';
          g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.fill();
        }
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
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      list.push({ z: s.z, draw: () => this.drawSoldier(g, this.px + s.x, s.z, i, view) });
    }
    list.sort((p, q) => q.z - p.z);
    for (const item of list) item.draw();

    // bullets
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
    // particles
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

  /** Health numbers and crate labels (the 2D world draws them with the sprites). */
  drawLabels(g) {
    for (const e of this.ents) {
      if (!e.alive) continue;
      const z = e.d - this.pos;
      if (z > VIEW_Z || z < -1) continue;
      if (e.kind === 'enemy' && (e.type === 'brute' || e.type === 'boss')) {
        const top = this.proj(e.x, z, e.type === 'boss' ? 5.3 : 2.25);
        label(g, String(Math.ceil(e.hp)), top.x, top.y, Math.round(Math.max(11, Math.min(26, top.s * (e.type === 'boss' ? 0.5 : 0.36)))), '#fff', 'rgba(0,0,0,.65)');
      } else if (e.kind === 'barrel' || e.kind === 'crate') {
        const top = this.proj(e.x, z, e.kind === 'crate' ? 1.35 : 1.25);
        label(g, String(Math.ceil(e.hp)), top.x, top.y, Math.round(Math.max(11, Math.min(24, top.s * 0.34))), '#fff', 'rgba(0,0,0,.65)');
        if (e.kind === 'crate') {
          const next = e.weapon != null ? e.weapon : Math.min(this.weapon + 1, WEAPONS.length - 1);
          label(g, WEAPONS[next].name.toUpperCase(), top.x, top.y - Math.max(14, top.s * 0.36), Math.round(Math.max(10, Math.min(18, top.s * 0.22))), '#fde047', 'rgba(0,0,0,.7)');
        }
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
      g.fillStyle = '#2563eb'; roundRect(g, top.x - tw / 2, top.y - size * 0.75, tw, size * 1.5, size * 0.75); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      label(g, txt, top.x, top.y + 1, size, '#fff', 'rgba(0,0,0,.25)');
    }
    // popups
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
      const bw = Math.min(w - 48, 320), bx = (w - bw) / 2, by = 112;
      g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, bx - 3, by - 3, bw + 6, 20, 8); g.fill();
      g.fillStyle = '#ef4444'; roundRect(g, bx, by, Math.max(0, bw * this.boss.hp / this.boss.maxHp), 14, 6); g.fill();
      label(g, 'TITAN', w / 2, by + 7, 12, '#fff', 'rgba(0,0,0,.7)');
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

  drawSoldier(g, x, z, i, view) {
    const p = this.proj(x, z), s = p.s;
    const u = s * 0.24; // body unit
    const bob = Math.sin(this.t * 14 + i) * u * 0.08;
    this.drawShadow(g, x, z, 0.24);
    const y = p.y + bob;
    // legs
    g.fillStyle = '#1e3a8a';
    const step = Math.sin(this.t * 14 + i) * u * 0.25;
    g.fillRect(p.x - u * 0.45, y - u * 1.2 + step, u * 0.35, u * 1.2 - step);
    g.fillRect(p.x + u * 0.1, y - u * 1.2 - step, u * 0.35, u * 1.2 + step);
    // body
    g.fillStyle = '#2563eb'; roundRect(g, p.x - u * 0.6, y - u * 2.6, u * 1.2, u * 1.6, u * 0.35); g.fill();
    // gun (pointing up the road) + muzzle flash
    g.fillStyle = '#18181b'; g.fillRect(p.x + u * 0.25, y - u * 3.5, u * 0.28, u * 1.6);
    if (this.muzzle > 0.4 && i < 12) { g.fillStyle = WEAPONS[this.weapon].color; g.beginPath(); g.arc(p.x + u * 0.39, y - u * 3.7, u * 0.38 * this.muzzle, 0, 6.28); g.fill(); }
    // head + helmet
    g.fillStyle = '#fcd9b6'; g.beginPath(); g.arc(p.x, y - u * 3, u * 0.5, 0, 6.28); g.fill();
    g.fillStyle = '#3f6212'; g.beginPath(); g.arc(p.x, y - u * 3.1, u * 0.55, Math.PI, 0); g.fill();
  }

  drawEnt(g, e, z, view) {
    const fade = e.alive ? 1 : Math.max(0, e.fade);
    if (fade <= 0) return;
    g.globalAlpha = fade;
    if (e.kind === 'gate') this.drawGate(g, e, z);
    else if (e.kind === 'enemy') this.drawEnemy(g, e, z);
    else if (e.kind === 'barrel') this.drawBarrel(g, e, z);
    else if (e.kind === 'crate') this.drawCrate(g, e, z);
    else if (e.kind === 'spikes') this.drawSpikes(g, e, z);
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
    // posts
    g.fillStyle = good ? '#1d4ed8' : '#b91c1c';
    const pw = Math.max(3, p0.s * 0.12);
    g.fillRect(p0.x - pw / 2, t0.y, pw, p0.y - t0.y); g.fillRect(p1.x - pw / 2, t1.y, pw, p1.y - t1.y);
    const mid = this.proj((e.x0 + e.x1) / 2, z, H * 0.55);
    const size = Math.max(10, mid.s * (e.op === 'rate' ? 0.48 : 0.62)) * (1 + pulse * 0.25);
    label(g, gateText(e), mid.x, mid.y, Math.round(size), '#fff', 'rgba(0,0,0,.45)', 900);
    if (e.op === 'rate') label(g, 'FIRE RATE', mid.x, mid.y - size * 0.85, Math.round(size * 0.4), '#fff', 'rgba(0,0,0,.45)');
  }

  drawEnemy(g, e, z) {
    const def = ENEMY[e.type];
    const p = this.proj(e.x, z), s = p.s;
    const big = e.type === 'brute' ? 1.8 : e.type === 'boss' ? 4 : e.type === 'runner' ? 0.95 : 1;
    const u = s * 0.24 * big;
    this.drawShadow(g, e.x, z, e.r);
    const sway = Math.sin(e.phase) * u * 0.15;
    const y = p.y;
    const skin = e.type === 'boss' ? '#7c3aed' : e.type === 'brute' ? '#4d7c0f' : '#84cc16';
    const shirt = e.type === 'runner' ? '#ea580c' : e.type === 'brute' ? '#57534e' : e.type === 'boss' ? '#3b0764' : '#7e22ce';
    const hitFlash = e.flash > 0;
    // legs
    g.fillStyle = hitFlash ? '#fff' : '#3f3f46';
    const st = Math.sin(e.phase) * u * 0.3;
    g.fillRect(p.x - u * 0.5, y - u * 1.3 + st, u * 0.38, u * 1.3 - st);
    g.fillRect(p.x + u * 0.12, y - u * 1.3 - st, u * 0.38, u * 1.3 + st);
    // body
    g.fillStyle = hitFlash ? '#fff' : shirt;
    roundRect(g, p.x - u * 0.7 + sway, y - u * 2.8, u * 1.4, u * 1.7, u * 0.4); g.fill();
    // arms reaching forward
    g.strokeStyle = hitFlash ? '#fff' : skin; g.lineWidth = u * 0.32; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(p.x - u * 0.6 + sway, y - u * 2.5); g.lineTo(p.x - u * 0.95 + sway, y - u * 1.7 + Math.sin(e.phase * 1.3) * u * 0.2);
    g.moveTo(p.x + u * 0.6 + sway, y - u * 2.5); g.lineTo(p.x + u * 0.95 + sway, y - u * 1.7 - Math.sin(e.phase * 1.3) * u * 0.2);
    g.stroke(); g.lineCap = 'butt';
    // head
    g.fillStyle = hitFlash ? '#fff' : skin;
    g.beginPath(); g.arc(p.x + sway, y - u * 3.25, u * 0.6, 0, 6.28); g.fill();
    g.fillStyle = '#ef4444';
    g.fillRect(p.x + sway - u * 0.3, y - u * 3.35, u * 0.18, u * 0.14); g.fillRect(p.x + sway + u * 0.12, y - u * 3.35, u * 0.18, u * 0.14);
    if (e.type === 'boss') {
      g.fillStyle = '#facc15';
      g.beginPath(); g.moveTo(p.x - u * 0.5, y - u * 3.7); g.lineTo(p.x - u * 0.35, y - u * 4.3); g.lineTo(p.x - u * 0.1, y - u * 3.85);
      g.lineTo(p.x + u * 0.1, y - u * 4.35); g.lineTo(p.x + u * 0.3, y - u * 3.85); g.lineTo(p.x + u * 0.5, y - u * 4.3); g.lineTo(p.x + u * 0.55, y - u * 3.7); g.fill();
    }
    if ((e.type === 'brute' || e.type === 'boss') && e.alive) {
      label(g, String(Math.ceil(e.hp)), p.x, y - u * (e.type === 'boss' ? 4.8 : 4.3), Math.round(Math.max(10, s * 0.3 * (e.type === 'boss' ? 1.6 : 1))), '#fff', 'rgba(0,0,0,.6)');
    }
  }

  drawBarrel(g, e, z) {
    const p = this.proj(e.x, z), u = p.s * 0.3;
    this.drawShadow(g, e.x, z, 0.4);
    g.fillStyle = e.flash > 0 ? '#fff' : '#dc2626';
    roundRect(g, p.x - u, p.y - u * 2.6, u * 2, u * 2.6, u * 0.4); g.fill();
    g.fillStyle = '#991b1b'; g.fillRect(p.x - u, p.y - u * 1.9, u * 2, u * 0.22); g.fillRect(p.x - u, p.y - u * 0.9, u * 2, u * 0.22);
    g.fillStyle = '#fde047'; g.beginPath(); g.moveTo(p.x, p.y - u * 1.75); g.lineTo(p.x - u * 0.45, p.y - u * 1.0); g.lineTo(p.x + u * 0.45, p.y - u * 1.0); g.fill();
    if (e.alive) label(g, String(Math.ceil(e.hp)), p.x, p.y - u * 3.2, Math.round(Math.max(10, p.s * 0.32)), '#fff', 'rgba(0,0,0,.6)');
    if (e.flash > 0) e.flash -= 0.016;
  }

  drawCrate(g, e, z) {
    const p = this.proj(e.x, z), u = p.s * 0.34;
    this.drawShadow(g, e.x, z, 0.5);
    const glow = 0.5 + Math.sin(this.t * 6) * 0.5;
    g.fillStyle = `rgba(250, 204, 21, ${0.25 + glow * 0.25})`;
    g.beginPath(); g.arc(p.x, p.y - u * 1.1, u * 1.9, 0, 6.28); g.fill();
    g.fillStyle = e.flash > 0 ? '#fff' : '#b45309';
    g.fillRect(p.x - u, p.y - u * 2, u * 2, u * 2);
    g.strokeStyle = '#78350f'; g.lineWidth = Math.max(1.5, u * 0.15); g.strokeRect(p.x - u, p.y - u * 2, u * 2, u * 2);
    g.beginPath(); g.moveTo(p.x - u, p.y - u * 2); g.lineTo(p.x + u, p.y); g.moveTo(p.x + u, p.y - u * 2); g.lineTo(p.x - u, p.y); g.stroke();
    const next = e.weapon != null ? e.weapon : Math.min(this.weapon + 1, WEAPONS.length - 1);
    label(g, WEAPONS[next].name.toUpperCase(), p.x, p.y - u * 3.2, Math.round(Math.max(9, p.s * 0.2)), '#fde047', 'rgba(0,0,0,.7)');
    if (e.alive) label(g, String(Math.ceil(e.hp)), p.x, p.y - u * 1, Math.round(Math.max(10, p.s * 0.32)), '#fff', 'rgba(0,0,0,.6)');
    if (e.flash > 0) e.flash -= 0.016;
  }

  drawSpikes(g, e, z) {
    const n = Math.max(2, Math.round((e.x1 - e.x0) / 0.5));
    const base0 = this.proj(e.x0, z), base1 = this.proj(e.x1, z);
    g.fillStyle = '#52525b'; g.fillRect(base0.x, base0.y - base0.s * 0.18, base1.x - base0.x, base0.s * 0.18);
    g.fillStyle = '#d4d4d8'; g.strokeStyle = '#3f3f46'; g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const x0 = e.x0 + (i * (e.x1 - e.x0)) / n, x1 = x0 + (e.x1 - e.x0) / n;
      const a = this.proj(x0, z, 0.15), b = this.proj(x1, z, 0.15), tip = this.proj((x0 + x1) / 2, z, 0.85);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(tip.x, tip.y); g.lineTo(b.x, b.y); g.closePath(); g.fill(); g.stroke();
    }
  }

  drawDeco(g, x, z, dark) {
    const p = this.proj(x, z), s = p.s;
    const kind = this.theme.deco;
    if (kind === 'tree' || kind === 'pine') {
      g.fillStyle = shade('#78350f', dark); g.fillRect(p.x - s * 0.08, p.y - s * 0.7, s * 0.16, s * 0.7);
      g.fillStyle = shade(kind === 'pine' ? '#166534' : '#15803d', dark);
      if (kind === 'pine') { g.beginPath(); g.moveTo(p.x, p.y - s * 2.2); g.lineTo(p.x - s * 0.6, p.y - s * 0.5); g.lineTo(p.x + s * 0.6, p.y - s * 0.5); g.fill();
        g.fillStyle = shade('#ffffff', dark); g.beginPath(); g.moveTo(p.x, p.y - s * 2.2); g.lineTo(p.x - s * 0.25, p.y - s * 1.5); g.lineTo(p.x + s * 0.25, p.y - s * 1.5); g.fill(); }
      else { g.beginPath(); g.arc(p.x, p.y - s * 1.1, s * 0.55, 0, 6.28); g.fill(); }
    } else if (kind === 'cactus') {
      g.fillStyle = shade('#15803d', dark);
      roundRect(g, p.x - s * 0.12, p.y - s * 1.3, s * 0.24, s * 1.3, s * 0.12); g.fill();
      roundRect(g, p.x - s * 0.42, p.y - s * 0.95, s * 0.18, s * 0.5, s * 0.09); g.fill();
      roundRect(g, p.x + s * 0.24, p.y - s * 1.1, s * 0.18, s * 0.45, s * 0.09); g.fill();
    } else if (kind === 'building') {
      const hgt = s * (2.4 + ((Math.abs(x) * 17) % 3));
      g.fillStyle = shade('#94a3b8', dark); g.fillRect(p.x - s * 0.7, p.y - hgt, s * 1.4, hgt);
      g.fillStyle = shade('#e2e8f0', dark);
      for (let yy = p.y - hgt + s * 0.25; yy < p.y - s * 0.4; yy += s * 0.5) { g.fillRect(p.x - s * 0.5, yy, s * 0.3, s * 0.25); g.fillRect(p.x + s * 0.2, yy, s * 0.3, s * 0.25); }
    } else if (kind === 'lamp') {
      g.fillStyle = '#475569'; g.fillRect(p.x - s * 0.05, p.y - s * 2, s * 0.1, s * 2);
      const glow = g.createRadialGradient(p.x, p.y - s * 2, 1, p.x, p.y - s * 2, s * 1.4);
      glow.addColorStop(0, 'rgba(253,224,71,.65)'); glow.addColorStop(1, 'rgba(253,224,71,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(p.x, p.y - s * 2, s * 1.4, 0, 6.28); g.fill();
    } else {
      g.fillStyle = '#44403c'; g.beginPath(); g.ellipse(p.x, p.y - s * 0.3, s * 0.6, s * 0.4, 0, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(249,115,22,.7)'; g.beginPath(); g.ellipse(p.x, p.y, s * 0.7, s * 0.15, 0, 0, 6.28); g.fill();
    }
  }
}

export const gateRush = {
  id: 'gate-rush',
  title: 'Gate Rush',
  tagline: 'Your squad never stops shooting. Steer through the right gates, shoot the numbers up and survive the horde.',
  howTo: 'Drag (touch), move the mouse or hold ← → / A D to steer. Shoot red gates to raise their number. Esc pauses, R restarts.',
  credit: 'A fan-made take on the "squad and gates" gameplay from the Last War: Survival ads. Not affiliated with its publisher.',
  levels: LEVELS,
  art: new URL('../../games-assets/k-gate-rush.webp', import.meta.url).href,
  create: (i, env) => new GateRushSession(i, env),
  view3d: () => import('./gate-rush-3d.js'),
};
