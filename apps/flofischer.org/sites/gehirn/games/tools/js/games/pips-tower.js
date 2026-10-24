/**
 * Pip’s Tower — a pull-the-pin physics puzzle game in four worlds. Golden pins (and, from Frostpeak on, levers) hold back
 * Fernstones, water, lava, sand, goo, gas, boulders and bombs; pull them in the right order so the Fernstones reach Pip
 * and nothing deadly does.
 *
 *   World 1 Fernhaven Meadows  Fernstones, water, lava (water turns it into stone), Zorblings (burn in lava)
 *   World 2 Sunbake Dunes      sand (granular; it smothers a whole lava pool), boulders, bombs, wooden walls, Klonkbots (lava-proof,
 *                              short out in water)
 *   World 3 Frostpeak          ice (lava melts it to water, bombs shatter it), keys that open the gate they fall on,
 *                              levers that tip platforms, Pip walks to Fernstones on his floor when the way is clear
 *   World 4 Ember Isles        alien goo (eats Fernstones, water dissolves it, lava burns it), teleport pads,
 *                              rising gas (deadly to Pip, escapes upwards, burns off on lava), Buzzbots (fly, short out)
 *   Bosses                     a big Zorb boss that must take hazards in a fixed order (lava, crush, water, bomb)
 *
 * A small position-based particle simulation on a fixed 360 × 640 board (deterministic, no DOM), so tests can solve
 * levels headless. Bodies (Pip, enemies) are feet circles for the floor plus a box for contacts.
 */
import { clamp, label, roundRect } from './core.js';
import { LEVELS } from './pips-tower-levels.js';

export const BOARD_W = 360, BOARD_H = 640;
const PR = 5;            // particle radius
const WALL_T = 12;       // wall / pin thickness
const G = 900;           // gravity, px/s²
const SUB = 3;           // substeps per 1/60 s
const CELL = 16;          // spatial grid cell = fluid interaction radius
const GRID_PAD = 64;      // the grid reaches a little past the board on every side
const GW = Math.ceil((BOARD_W + GRID_PAD * 2) / CELL), GH = Math.ceil((BOARD_H + GRID_PAD * 2) / CELL);
const cellX = (x) => clamp(((x + GRID_PAD) / CELL) | 0, 0, GW - 1), cellY = (y) => clamp(((y + GRID_PAD) / CELL) | 0, 0, GH - 1);
const PULL_TIME = 0.32, LEVER_TIME = 0.5;
export const BODY = {
  hero: { r: 13, h: 52, w: 28 },
  zorbling: { r: 12, h: 42, w: 28, speed: 70 },
  klonkbot: { r: 13, h: 50, w: 30, speed: 55 },
  buzzbot: { r: 12, h: 36, w: 34, speed: 62, fly: true },
  chief: { r: 26, h: 92, w: 66 },
};
const FRICTION = { water: 0.02, lava: 0.08, gem: 0.1, stone: 0.4, sand: 0.55, goo: 0.3, gas: 0 };
const MASS = { water: 1.6, lava: 1, gem: 3, stone: 2.2, sand: 2.6, goo: 1.3, gas: 0.25 };
// Fluid pressure (double density relaxation, Clavet et al. 2005) makes water, lava, goo and gas level out instead of piling.
export const FLUID = { h: 16, rho0: 0.9, k: 40, kNear: 80 };
const FLUIDS = new Set(['water', 'lava', 'goo', 'gas']);
const DEADLY = { lava: 'lava', goo: 'goo', gas: 'gas' };
const NEIGHBOURS = new Array(48).fill(null), NEIGHBOUR_Q = new Float64Array(48), NEIGHBOUR_X = new Float64Array(48), NEIGHBOUR_Y = new Float64Array(48);
const WEAK_LABEL = { lava: 'LAVA', crush: 'BOULDER', water: 'WATER', bomb: 'BOMB' };
const ENEMY_NAME = { zorbling: 'A Zorbling', klonkbot: 'A Klonkbot', buzzbot: 'A Buzzbot', chief: 'The Zorb boss' };

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return [px - cx, py - cy];
};
const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
/** Distance between segments ab and cd (0 when they cross). */
function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay), d2 = cross(cx, cy, dx, dy, bx, by), d3 = cross(ax, ay, bx, by, cx, cy), d4 = cross(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const h = (px, py, qx, qy, rx, ry) => Math.hypot(...segDist(px, py, qx, qy, rx, ry));
  return Math.min(h(ax, ay, cx, cy, dx, dy), h(bx, by, cx, cy, dx, dy), h(cx, cy, ax, ay, bx, by), h(dx, dy, ax, ay, bx, by));
}
/** A rectangle [x0, y0, x1, y1] as a capsule segment (for ice blocks). */
function capsule([x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0;
  if (w >= h) return { ax: x0 + h / 2, ay: (y0 + y1) / 2, bx: x1 - h / 2, by: (y0 + y1) / 2, r: h / 2 };
  return { ax: (x0 + x1) / 2, ay: y0 + w / 2, bx: (x0 + x1) / 2, by: y1 - w / 2, r: w / 2 };
}
const ease = (q) => q * q * (3 - 2 * q);

export class PipsTowerSession {
  constructor(levelIndex, env = {}) {
    this.index = levelIndex;
    const L = (this.L = LEVELS[levelIndex]);
    this.world = L.world ?? 0;
    this.sound = env.sound || { play() {} };
    this.preview = !!env.preview;
    this.t = 0; this.result = null; this.pending = null; this.calm = 0; this.idle = 0;
    const seg = ([ax, ay, bx, by]) => ({ ax, ay, bx, by, r: WALL_T / 2 });
    this.walls = L.walls.map(seg);
    this.breakables = (L.wood || []).map((s) => ({ ...seg(s), alive: true, kind: 'wood' }));
    this.gates = (L.gates || []).map((s) => ({ ...seg(s), alive: true, kind: 'gate', openT: 0 }));
    this.ice = (L.ice || []).map((rect) => ({ ...capsule(rect), rect, alive: true, kind: 'ice', melt: false, heat: 0 }));
    this.pins = L.pins.map(([ax, ay, bx, by], i) => {
      const len = Math.hypot(bx - ax, by - ay);
      return { i, kind: 'pin', ax, ay, bx, by, len, dx: (bx - ax) / len, dy: (by - ay) / len, off: 0, state: 'in', r: 5, pullT: 0 };
    });
    this.levers = (L.levers || []).map(({ at, plat, turn }, k) => ({
      i: this.pins.length + k, kind: 'lever', at, base: plat, ang: 0, turn: (turn * Math.PI) / 180, state: 'in', pullT: 0,
      plat: { ax: plat[0], ay: plat[1], bx: plat[2], by: plat[3], r: WALL_T / 2, kind: 'plat' },
    }));
    this.controls = [...this.pins, ...this.levers];
    this.portals = (L.portals || []).map(({ from, to }) => ({ from, to, cx: (from[0] + from[2]) / 2, cy: (from[1] + from[3]) / 2, pulse: 0 }));
    this.parts = [];
    const solid = this.segments();
    for (const f of L.fill) this.fillRect(f[0], f[1], f[2], f[3], f[4], solid);
    this.totalGems = this.parts.filter((p) => p.t === 'gem').length;
    this.need = Math.max(1, Math.round(this.totalGems * (L.need ?? 0.5)));
    this.collected = 0; this.melted = 0; this.eaten = 0;
    const [hx, hy] = L.hero;
    this.hero = { kind: 'hero', type: 'hero', x: hx, y: hy, vx: 0, vy: 0, ...BODY.hero, dead: false, mood: 'idle', cause: '', walk: 0 };
    this.enemies = (L.enemies || []).map(([x, y, type = 'zorbling']) => this.body(type, x, y));
    if (L.chief) {
      const c = this.body('chief', L.chief.at[0], L.chief.at[1]);
      c.weak = L.chief.weak.slice(); c.phase = 0; c.immune = 0; c.hitT = -9;
      this.chief = c; this.enemies.push(c);
    }
    this.rocks = [
      ...(L.boulders || []).map(([x, y]) => ({ kind: 'boulder', x, y, vx: 0, vy: 0, r: 17, rot: 0, alive: true })),
      ...(L.bombs || []).map(([x, y]) => ({ kind: 'bomb', x, y, vx: 0, vy: 0, r: 12, rot: 0, alive: true })),
      ...(L.keys || []).map(([x, y]) => ({ kind: 'key', x, y, vx: 0, vy: 0, r: 9, rot: 0, alive: true })),
    ];
    this.zone = L.zone || null;
    this.walking = !!L.walk;
    this.fx = []; this.coins = []; this.popups = []; this.shake = 0; this.flash = 0;
    this.hover = -1; this.layout = null; this.pulled = 0;
    this.hint = L.hint;
    this.segs = this.segments();
  }

  body(type, x, y) {
    const d = BODY[type];
    return { kind: 'enemy', type, x, y, hx: x, hy: y, vx: 0, vy: 0, r: d.r, h: d.h, w: d.w, speed: d.speed || 0, fly: !!d.fly, dead: false, deathT: 0, charging: false, wet: 0 };
  }

  /** Packs a rectangle with particles, leaving out spots inside walls or pins (`solid`). */
  fillRect(t, x0, y0, x1, y1, solid = []) {
    const step = PR * 1.9;
    for (let y = y0 + PR; y <= y1 - PR + 0.01; y += step) {
      for (let x = x0 + PR + ((Math.round((y - y0) / step) % 2) * step) / 2; x <= x1 - PR + 0.01; x += step) {
        if (solid.some((sg) => Math.hypot(...segDist(x, y, sg.ax, sg.ay, sg.bx, sg.by)) < sg.r + PR)) continue;
        this.parts.push({ x, y, px: x, py: y, vx: 0, vy: 0, t, fixed: false, dead: false, cn: 0, cnx: 0, cny: 0, cool: 0 });
      }
    }
  }

  get score() { return this.collected * 10 + this.enemies.reduce((n, e) => n + (e.dead ? (e.type === 'chief' ? 500 : 100) : 0), 0); }
  hud() { return { progress: Math.min(1, this.collected / this.need), score: this.score, label: 'Score' }; }

  // ── input ──
  toBoard(x, y) { const L = this.layout; return L ? [(x - L.ox) / L.s, (y - L.oy) / L.s] : [x, y]; }
  pinAt(bx, by, reach = 26) {
    let best = -1, bestD = reach;
    for (const pin of this.pins) {
      if (pin.state !== 'in') continue;
      const [ax, ay, ex, ey] = this.pinSeg(pin);
      const [dx, dy] = segDist(bx, by, ax, ay, ex + pin.dx * 14, ey + pin.dy * 14);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = pin.i; }
    }
    for (const lv of this.levers) {
      if (lv.state !== 'in') continue;
      const d = Math.hypot(bx - lv.at[0], by - lv.at[1] + 10);
      if (d < bestD + 4) { bestD = d; best = lv.i; }
    }
    return best;
  }
  pointer(type, x, y) {
    if (this.result || this.pending?.lose) return;
    const [bx, by] = this.toBoard(x, y);
    if (type === 'move') this.hover = this.pinAt(bx, by);
    if (type === 'down') {
      const i = this.pinAt(bx, by, this.layout && this.layout.s < 1 ? 26 / this.layout.s : 26);
      if (i >= 0) this.pull(i);
    }
  }
  key(code, down) {
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (!m) return false;
    if (down) {
      const c = this.controls[Number(m[1]) - 1];
      if (c) this.pull(c.i);
    }
    return true;
  }
  /** Pull pin i, or throw lever i (controls are numbered pins first, then levers). */
  pull(i) {
    const c = this.controls[i];
    if (!c || c.state !== 'in' || this.result) return false;
    c.state = 'pulling'; c.pullT = 0; this.pulled++;
    this.sound.play(c.kind === 'lever' ? 'click' : 'pin');
    return true;
  }
  pinSeg(pin) { return [pin.ax + pin.dx * pin.off, pin.ay + pin.dy * pin.off, pin.bx + pin.dx * pin.off, pin.by + pin.dy * pin.off]; }
  leverSeg(lv) {
    const [ax, ay, bx, by] = lv.base, c = Math.cos(lv.ang), s = Math.sin(lv.ang);
    const ex = bx - ax, ey = by - ay;
    return [ax, ay, ax + ex * c - ey * s, ay + ex * s + ey * c];
  }

  // ── simulation ──
  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 3); this.flash = Math.max(0, this.flash - dt * 2);
    for (const pin of this.pins) {
      if (pin.state !== 'pulling') continue;
      pin.pullT += dt;
      const q = Math.min(1, pin.pullT / PULL_TIME);
      pin.off = (pin.len + 20) * q * q;
      if (q >= 1) { pin.state = 'out'; this.calm = 0; }
    }
    for (const lv of this.levers) {
      if (lv.state !== 'pulling') continue;
      lv.pullT += dt;
      const q = Math.min(1, lv.pullT / LEVER_TIME);
      lv.ang = lv.turn * ease(q);
      const [ax, ay, bx, by] = this.leverSeg(lv);
      Object.assign(lv.plat, { ax, ay, bx, by });
      if (q >= 1) { lv.state = 'out'; this.calm = 0; }
    }
    for (const g of this.gates) if (!g.alive) g.openT += dt;
    if (this.walking) this.planWalk();
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) this.substep(h);
    for (const ic of this.ice) if (ic.alive && ic.melt) this.meltIce(ic);
    if (this.smothering) this.spreadSmother();
    this.updateFx(dt);
    this.checkRules(dt);
  }

  segments() {
    const segs = this.walls.slice();
    for (const b of this.breakables) if (b.alive) segs.push(b);
    for (const g of this.gates) if (g.alive) segs.push(g);
    for (const ic of this.ice) if (ic.alive) segs.push(ic);
    for (const lv of this.levers) segs.push(lv.plat);
    for (const pin of this.pins) {
      if (pin.state === 'out') continue;
      const [ax, ay, bx, by] = this.pinSeg(pin);
      segs.push({ ax, ay, bx, by, r: pin.r });
    }
    return segs;
  }

  collideSegs(o, rad, segs, friction) {
    let hit = null;
    for (const sg of segs) {
      const minx = Math.min(sg.ax, sg.bx) - sg.r - rad, maxx = Math.max(sg.ax, sg.bx) + sg.r + rad;
      if (o.x < minx || o.x > maxx) continue;
      const miny = Math.min(sg.ay, sg.by) - sg.r - rad, maxy = Math.max(sg.ay, sg.by) + sg.r + rad;
      if (o.y < miny || o.y > maxy) continue;
      const [dx, dy] = segDist(o.x, o.y, sg.ax, sg.ay, sg.bx, sg.by);
      const d = Math.hypot(dx, dy), min = sg.r + rad;
      if (d >= min) continue;
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
      o.x += nx * (min - d); o.y += ny * (min - d);
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; }
      const tx = -ny, ty = nx, vt = o.vx * tx + o.vy * ty;
      o.vx -= vt * tx * friction; o.vy -= vt * ty * friction;
      hit = sg;
    }
    return hit;
  }

  substep(h) {
    const segs = (this.segs = this.segments());
    const parts = this.parts;
    // Position-based: predict, resolve contacts as position corrections, then derive velocities from the motion.
    // That keeps resting piles still (no jitter) and stable at three substeps.
    for (const p of parts) {
      if (p.fixed || p.dead) continue;
      p.px = p.x; p.py = p.y; p.cn = 0;
      if (p.t === 'gas') { p.vy -= G * 0.4 * h; p.vx *= 0.99; p.vy *= 0.99; }
      else {
        p.vy += G * h;
        if (p.t === 'lava') { p.vx *= 0.995; p.vy *= 0.997; }
        else if (p.t === 'goo') { p.vx *= 0.97; p.vy *= 0.985; }
      }
      p.x += p.vx * h; p.y += p.vy * h;
    }
    const grid = this.buildGrid(parts);
    for (let iter = 0; iter < 2; iter++) this.solvePairs(parts, grid);
    this.relax(parts, grid, h);
    for (const p of parts) {
      if (p.fixed || p.dead) continue;
      this.pushOut(p, PR, segs);
      if (p.y > BOARD_H + 40 || p.y < -60 || p.x < -40 || p.x > BOARD_W + 40) p.dead = true;
    }
    if (this.portals.length) this.teleportParts();
    for (const b of this.enemies) if (!b.dead) this.bodyVsParts(b);
    if (!this.hero.dead || this.hero.cause !== 'lava') this.bodyVsParts(this.hero);
    for (const r of this.rocks) if (r.alive) this.rockVsParts(r);
    for (const p of parts) {
      if (p.fixed || p.dead) continue;
      p.vx = (p.x - p.px) / h; p.vy = (p.y - p.py) / h;
      if (p.cn) {
        // friction along the wall it touches
        const tx = -p.cny, ty = p.cnx, vt = p.vx * tx + p.vy * ty, f = FRICTION[p.t];
        p.vx -= vt * tx * f; p.vy -= vt * ty * f;
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 900) { p.vx *= 900 / sp; p.vy *= 900 / sp; }
    }
    // bodies
    const hero = this.hero;
    if (!hero.dead || hero.cause !== 'lava') {
      hero.vy += G * h;
      if (hero.walk && !hero.dead && !this.pending) hero.vx = hero.walk * 64;
      hero.x += hero.vx * h; hero.y += hero.vy * h;
      this.collideSegs(hero, hero.r, segs, hero.walk ? 0 : 0.6);
      if (!hero.walk) hero.vx *= 0.9;
    }
    for (const b of this.enemies) {
      if (b.dead && b.deathT > 1) continue;
      if (b.fly && !b.dead) {
        // Buzzbots hover: towards Pip while they see him, back home otherwise
        const tx = b.charging ? hero.x : b.hx, ty = b.charging ? hero.y - 16 : b.hy;
        const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
        const v = d > 3 ? (b.charging ? b.speed : 40) : 0;
        b.vx = d > 0.01 ? (dx / d) * v : 0; b.vy = d > 0.01 ? (dy / d) * v : 0;
      } else {
        if (!b.dead) b.vx = b.charging ? Math.sign(hero.x - b.x) * b.speed : 0;
        b.vy += G * h;
      }
      b.x += b.vx * h; b.y += b.vy * h;
      this.collideSegs(b, b.r, segs, b.charging ? 0 : 0.6);
      if (b.dead) b.vx *= 0.9;
    }
    for (const r of this.rocks) {
      if (!r.alive) continue;
      r.vy += G * h;
      r.x += r.vx * h; r.y += r.vy * h;
      this.collideSegs(r, r.r, segs, r.kind === 'key' ? 0.06 : 0.04);
      r.rot += (r.vx * h) / r.r;
      if (r.kind === 'key') this.keyVsGates(r);
      if (r.y > BOARD_H + 60) r.alive = false;
    }
    if (this.portals.length) this.teleportBodies();
    this.rockVsBodies();
  }

  /** Counting-sort spatial grid in reused typed arrays (no per-frame allocations). */
  buildGrid(parts) {
    const n = parts.length;
    if (!this.grid || this.grid.cellOf.length < n) {
      this.grid = { start: new Int32Array(GW * GH + 1), items: new Int32Array(n + 64), cellOf: new Int32Array(n + 64) };
    }
    const { start, items, cellOf } = this.grid;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      if (p.dead) { cellOf[i] = -1; continue; }
      const c = cellY(p.y) * GW + cellX(p.x);
      cellOf[i] = c; start[c + 1]++;
    }
    for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c];
    const fill = this.gridFill || (this.gridFill = new Int32Array(GW * GH));
    fill.set(start.subarray(0, GW * GH));
    for (let i = 0; i < n; i++) { const c = cellOf[i]; if (c >= 0) items[fill[c]++] = i; }
    this.gridN = n;
    return this.grid;
  }

  /** Calls fn(p) for every live particle whose grid cell overlaps the box (cells as of the last grid build). */
  near(x0, y0, x1, y1, fn) {
    const { start, items } = this.grid;
    const gx0 = cellX(x0 - CELL), gx1 = cellX(x1 + CELL), gy0 = cellY(y0 - CELL), gy1 = cellY(y1 + CELL);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let k = start[gy * GW + gx0], end = start[gy * GW + gx1 + 1]; k < end; k++) {
        const j = items[k];
        if (j >= this.gridN) continue;
        const p = this.parts[j];
        if (!p.dead && fn(p) === false) return;
      }
    }
  }

  solvePairs(parts, grid) {
    const min = PR * 2, min2 = min * min;
    const { start, items } = grid;
    const n = this.gridN;
    for (let i = 0; i < n; i++) {
      const a = parts[i];
      if (a.dead) continue;
      const cx = cellX(a.x), cy = cellY(a.y);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(GH - 1, cy + 1); gy++) {
        const row = gy * GW;
        for (let k = start[row + Math.max(0, cx - 1)], end = start[row + Math.min(GW - 1, cx + 1) + 1]; k < end; k++) {
          const j = items[k];
          if (j <= i) continue;
          const b = parts[j];
          if (b.dead || a.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= min2) continue;
          if ((a.t !== b.t || a.t === 'stone') && this.react(a, b)) continue;
          if (a.fixed && b.fixed) continue;
          // Fresh stone is porous: water and lava seep through it, so a crust cannot seal lava away from water.
          const porous = (a.t === 'stone' && FLUIDS.has(b.t)) || (b.t === 'stone' && FLUIDS.has(a.t));
          const reach = porous ? PR : min;
          if (porous && d2 >= reach * reach) continue;
          // fresh crust grains packed as tightly as the fluid was ease apart instead of popping out
          const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, over = a.t === 'stone' && b.t === 'stone' ? Math.min(reach - d, 0.8) : reach - d;
          const wa = a.fixed ? 0 : b.fixed ? 1 : MASS[b.t] / (MASS[a.t] + MASS[b.t]), wb = 1 - wa;
          a.x -= nx * over * wa; a.y -= ny * over * wa; b.x += nx * over * wb; b.y += ny * over * wb;
          if (a.t === 'sand' && b.t === 'sand') {
            // grain friction: damp the sideways slip of touching grains so sand piles up in slopes
            const rx = (a.x - a.px) - (b.x - b.px), ry = (a.y - a.py) - (b.y - b.py);
            const slip = (rx * -ny + ry * nx) * 0.22;
            a.x -= -ny * slip; a.y -= nx * slip; b.x += -ny * slip; b.y += nx * slip;
          }
        }
      }
    }
  }

  /** Particle vs walls and pins, as a position correction; remembers the contact normal for friction. */
  pushOut(o, rad, segs) {
    for (const sg of segs) {
      const minx = Math.min(sg.ax, sg.bx) - sg.r - rad, maxx = Math.max(sg.ax, sg.bx) + sg.r + rad;
      if (o.x < minx || o.x > maxx) continue;
      const miny = Math.min(sg.ay, sg.by) - sg.r - rad, maxy = Math.max(sg.ay, sg.by) + sg.r + rad;
      if (o.y < miny || o.y > maxy) continue;
      const [dx, dy] = segDist(o.x, o.y, sg.ax, sg.ay, sg.bx, sg.by);
      const d = Math.hypot(dx, dy), min = sg.r + rad;
      if (d >= min) continue;
      if (sg.kind === 'ice' && o.t === 'lava') { if (++sg.heat >= 3) sg.melt = true; o.t = 'stone'; o.vx *= 0.2; o.vy *= 0.2; this.steam(o.x, o.y); }
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
      o.x += nx * (min - d); o.y += ny * (min - d);
      o.cn = 1; o.cnx = nx; o.cny = ny;
    }
  }

  /** Fluid pressure: pushes crowded water/lava/goo/gas particles apart so pools flatten and flow over edges. */
  relax(parts, grid, h) {
    const { h: H, rho0, k, kNear } = FLUID;
    const scale = h * h * 3600 * 0.25; // 1 at 60 Hz with one substep; each side of a pair moves half
    const nb = NEIGHBOURS, nq = NEIGHBOUR_Q, nx = NEIGHBOUR_X, ny = NEIGHBOUR_Y;
    const { start, items } = grid;
    for (let i = 0; i < this.gridN; i++) {
      const a = parts[i];
      if (a.dead || !FLUIDS.has(a.t)) continue;
      const cx = cellX(a.x), cy = cellY(a.y);
      let count = 0, rho = 0, rhoN = 0;
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(GH - 1, cy + 1); gy++) {
        const row = gy * GW;
        for (let kk = start[row + Math.max(0, cx - 1)], end = start[row + Math.min(GW - 1, cx + 1) + 1]; kk < end; kk++) {
          const j = items[kk];
          if (j === i || count >= nb.length) continue;
          const b = parts[j];
          if (b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= H * H || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), q = 1 - d / H;
          rho += q * q; rhoN += q * q * q;
          nb[count] = b; nq[count] = q; nx[count] = dx / d; ny[count] = dy / d; count++;
        }
      }
      const P = k * (rho - rho0), PN = kNear * rhoN;
      let ax = 0, ay = 0;
      for (let n = 0; n < count; n++) {
        const q = nq[n], D = (P * q + PN * q * q) * scale;
        if (D <= 0) continue;
        const b = nb[n];
        if (FLUIDS.has(b.t) && !b.fixed) { b.x += nx[n] * D; b.y += ny[n] * D; }
        ax -= nx[n] * D; ay -= ny[n] * D;
      }
      a.x += ax; a.y += ay;
      nb.fill(null, 0, count);
    }
  }

  /** Material reactions; returns true when the pair no longer needs separating. */
  react(a, b) {
    const pair = a.t < b.t ? a.t + b.t : b.t + a.t;
    const of = (t) => (a.t === t ? a : b);
    switch (pair) {
      case 'lavawater': {
        for (const p of [a, b]) { p.t = 'stone'; p.vx *= 0.2; p.vy *= 0.2; }
        this.steam(a.x, a.y);
        this.sound.play('sizzle', 160);
        return true;
      }
      // Water soaking a crust keeps cooling the lava underneath (one water particle per lava particle).
      case 'stonewater': of('stone').wetBy = of('water'); return false;
      case 'lavastone': {
        const stone = of('stone'), lava = of('lava'), water = stone.wetBy;
        if (!water || water.dead || water.t !== 'water') return false;
        lava.t = 'stone'; water.t = 'stone'; stone.wetBy = null;
        lava.vx *= 0.2; lava.vy *= 0.2;
        this.steam(lava.x, lava.y);
        this.sound.play('sizzle', 160);
        return true;
      }
      case 'lavasand': {
        // sand smothers lava: it crusts over, the sand stays
        const lava = of('lava');
        lava.t = 'stone'; lava.smother = this.t + 0.06; lava.vx *= 0.2; lava.vy *= 0.2; this.smothering = true;
        this.smoke(lava.x, lava.y, '#a8a29e');
        this.sound.play('sizzle', 200);
        return true;
      }
      case 'gemlava': {
        const gem = of('gem');
        gem.dead = true; this.melted++;
        this.smoke(gem.x, gem.y, '#78716c');
        this.sound.play('sizzle', 200);
        return true;
      }
      case 'gemgoo': {
        // goo eats Fernstones and grows (each blob once in a while)
        const goo = of('goo'), gem = of('gem');
        if (this.t < goo.cool) return false;
        gem.t = 'goo'; gem.cool = this.t + 0.5; goo.cool = this.t + 0.5; this.eaten++;
        this.smoke(gem.x, gem.y, '#a855f7');
        this.sound.play('splash', 200);
        return true;
      }
      case 'goowater': {
        a.dead = true; b.dead = true;
        this.smoke(a.x, a.y, 'rgba(216,180,254,.8)');
        this.sound.play('splash', 160);
        return true;
      }
      case 'goolava': { of('goo').dead = true; this.smoke(a.x, a.y, '#57534e'); this.sound.play('sizzle', 200); return true; }
      case 'gaslava': {
        const gas = of('gas');
        gas.dead = true;
        if (!this.preview && this.fx.length < 500) this.fx.push({ x: gas.x, y: gas.y, vx: 0, vy: -60, life: 0.5, max: 0.5, color: '#fb923c', size: 5, puff: true });
        this.sound.play('sizzle', 200);
        return true;
      }
      case 'stonestone': {
        // wetness soaks through a thick crust
        const wa = a.wetBy && !a.wetBy.dead && a.wetBy.t === 'water', wb = b.wetBy && !b.wetBy.dead && b.wetBy.t === 'water';
        if (wa && !wb) b.wetBy = a.wetBy; else if (wb && !wa) a.wetBy = b.wetBy;
        return false;
      }
      default: return false;
    }
  }

  /** Sand's crust creeps through the lava pool it lies on: each fresh crust grain crusts the lava next to it. */
  spreadSmother() {
    let active = false;
    for (const p of this.parts) {
      if (p.dead || !p.smother) continue;
      if (p.t !== 'stone') { p.smother = 0; continue; }
      active = true;
      if (this.t < p.smother) continue;
      p.smother = 0; p.smothered = true;
      this.near(p.x - 13, p.y - 13, p.x + 13, p.y + 13, (q) => {
        if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 > 13 * 13) return;
        // it creeps through older crust too, so a patch cooled by water does not stop it
        if (q.t === 'lava') { q.t = 'stone'; q.vx *= 0.2; q.vy *= 0.2; } else if (q.t !== 'stone' || q.smothered || q.smother) return;
        q.smother = this.t + 0.06;
      });
      if ((p.x * 7 + p.y) % 6 < 1) this.smoke(p.x, p.y, '#a8a29e');
    }
    this.smothering = active;
  }

  meltIce(ic) {
    ic.alive = false;
    const [x0, y0, x1, y1] = ic.rect;
    // water fills the block's space, except where something already moved in (no overlaps, no splash)
    const taken = this.parts.filter((p) => !p.dead && p.x > x0 - PR && p.x < x1 + PR && p.y > y0 - PR && p.y < y1 + PR);
    const n = this.parts.length;
    this.fillRect('water', x0 + 1, y0 + 1, x1 - 1, y1 - 1, this.segments());
    for (let i = this.parts.length - 1; i >= n; i--) {
      const w = this.parts[i];
      if (taken.some((p) => (p.x - w.x) ** 2 + (p.y - w.y) ** 2 < 81)) this.parts.splice(i, 1);
    }
    this.sound.play('splash');
    if (!this.preview) for (let i = 0; i < 6; i++) this.steam(x0 + ((x1 - x0) * (i + 0.5)) / 6, (y0 + y1) / 2);
  }

  teleportParts() {
    for (const pt of this.portals) {
      const [x0, y0, x1, y1] = pt.from;
      this.near(x0, y0, x1, y1, (p) => {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return;
        const nx = pt.to[0] + (p.x - pt.cx) * 0.5, ny = pt.to[1] + (p.y - pt.cy) * 0.3;
        p.px += nx - p.x; p.py += ny - p.y; p.x = nx; p.y = ny;
        pt.pulse = 1;
      });
    }
  }
  teleportBodies() {
    for (const pt of this.portals) {
      const [x0, y0, x1, y1] = pt.from;
      for (const o of [...this.rocks, ...this.enemies]) {
        if (o.dead || o.alive === false || o.type === 'chief') continue;
        if (o.x < x0 - o.r || o.x > x1 + o.r || o.y < y0 - o.r || o.y > y1 + o.r) continue;
        o.x = pt.to[0]; o.y = pt.to[1]; pt.pulse = 1;
        if (o.kind === 'enemy') { o.hx = o.x; o.hy = o.y; }
        this.sound.play('upgrade', 200);
      }
    }
  }

  bodyVsParts(b) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y1 = b.y + b.r, y0 = y1 - b.h;
    const isHero = b.kind === 'hero';
    let wet = 0, lava = 0, under = 0;
    this.near(x0 - PR, y0 - PR, x1 + PR, y1 + PR, (p) => {
      if (b.dead && !isHero) return false;
      if (p.x < x0 - PR || p.x > x1 + PR || p.y < y0 - PR || p.y > y1 + PR) return;
      if (isHero) {
        if (DEADLY[p.t]) { this.kill(b, DEADLY[p.t]); if (p.t === 'lava') return false; }
        else if (p.t === 'gem' && !b.dead) { this.collect(p); return; }
      } else if (p.t === 'lava') {
        if (b.type === 'zorbling') { this.kill(b, 'lava'); return false; }
        lava++;
      } else if (p.t === 'water') wet++;
      if (p.fixed || p.t === 'gas') return;
      if (p.y > y1 - 16) under++;
      // push the particle out through the nearest side (never down: that would press it through the floor)
      const dl = p.x - (x0 - PR), dr = x1 + PR - p.x, dt = p.y - (y0 - PR);
      // A few px per substep and without adding speed, so a body landing in a pool displaces it instead of
      // splashing it over the walls.
      const m = p.y > b.y ? Math.min(dl, dr) : Math.min(dl, dr, dt); // around the feet: sideways only
      const step = Math.min(m, 2.5);
      if (m === dl) { p.x -= step; p.px -= step; }
      else if (m === dr) { p.x += step; p.px += step; }
      else { p.y -= step; p.py -= step; }
    });
    if (b.dead || isHero) return;
    if (b.type === 'chief') {
      // the big boss sinks slowly into a pool instead of splashing it all out; a stray drop does not count
      if (under > 4 && b.vy > 40) b.vy = 40;
      if (lava >= 3) this.hurtChief(b, 'lava');
      if (wet >= 3) this.hurtChief(b, 'water');
      return;
    }
    if (wet && (b.type === 'klonkbot' || b.type === 'buzzbot')) {
      b.wet += wet;
      if (b.wet >= 3) this.kill(b, 'water');
    }
  }

  rockVsParts(r) {
    const min = r.r + PR, min2 = min * min;
    this.near(r.x - min, r.y - min, r.x + min, r.y + min, (p) => {
      const dx = p.x - r.x, dy = p.y - r.y, d2 = dx * dx + dy * dy;
      if (d2 >= min2) return;
      if (r.kind === 'bomb' && p.t === 'lava') { this.explode(r); return false; }
      if (p.t === 'gas') return;
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, over = min - d;
      if (p.fixed) { r.x -= nx * over; r.y -= ny * over; const vn = r.vx * nx + r.vy * ny; if (vn > 0) { r.vx -= vn * nx; r.vy -= vn * ny; } return; }
      p.x += nx * over * 0.85; p.y += ny * over * 0.85; r.x -= nx * over * 0.15; r.y -= ny * over * 0.15;
      const rv = (p.vx - r.vx) * nx + (p.vy - r.vy) * ny;
      if (rv < 0) { p.vx -= rv * nx * 0.9; p.vy -= rv * ny * 0.9; r.vx += rv * nx * 0.1; r.vy += rv * ny * 0.1; }
    });
  }

  keyVsGates(k) {
    for (const g of this.gates) {
      if (!g.alive) continue;
      const [dx, dy] = segDist(k.x, k.y, g.ax, g.ay, g.bx, g.by);
      if (Math.hypot(dx, dy) > g.r + k.r + 3) continue;
      g.alive = false; k.alive = false;
      this.sound.play('upgrade');
      this.popups.push({ text: 'CLICK!', x: (g.ax + g.bx) / 2, y: Math.min(g.ay, g.by) - 14, life: 0.9, max: 0.9, color: '#fde047' });
      this.burst((g.ax + g.bx) / 2, (g.ay + g.by) / 2, ['#facc15', '#fef08a'], 16, 160);
      return;
    }
  }

  rockVsBodies() {
    for (const r of this.rocks) {
      if (!r.alive) continue;
      for (const b of [this.hero, ...this.enemies]) {
        if (b.dead) continue;
        const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y1 = b.y + b.r, y0 = y1 - b.h;
        const cx = clamp(r.x, x0, x1), cy = clamp(r.y, y0, y1);
        const dx = r.x - cx, dy = r.y - cy, d = Math.hypot(dx, dy);
        if (d >= r.r) continue;
        const speed = Math.hypot(r.vx, r.vy);
        if (r.kind === 'boulder' && speed > 70) {
          if (b.type === 'chief') this.hurtChief(b, 'crush');
          else { this.kill(b, 'boulder'); continue; }
        }
        // resting contact: the body holds the rock
        const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1;
        r.x += nx * (r.r - d); r.y += ny * (r.r - d);
        const vn = r.vx * nx + r.vy * ny;
        if (vn < 0) { r.vx -= vn * nx; r.vy -= vn * ny; }
        if (b.type === 'chief' && ny < -0.5) r.vx += (r.x < b.x ? -1 : 1) * 4; // rocks roll off the boss's round top
      }
    }
  }

  explode(bomb) {
    bomb.alive = false;
    this.shake = 1; this.flash = 1;
    this.sound.play('boom');
    this.burst(bomb.x, bomb.y, ['#f97316', '#facc15', '#78716c'], 46, 380);
    this.fx.push({ ring: true, x: bomb.x, y: bomb.y, life: 0.45, max: 0.45, r: 90 });
    const R = 90;
    for (const b of [this.hero, ...this.enemies]) {
      if (b.dead) continue;
      const cy = clamp(bomb.y, b.y + b.r - b.h, b.y + b.r);
      if (Math.hypot(b.x - bomb.x, cy - bomb.y) - b.w / 2 >= R * 0.82) continue;
      if (b.type === 'chief') this.hurtChief(b, 'bomb'); else this.kill(b, 'bomb');
    }
    for (const w of [...this.breakables, ...this.ice]) {
      if (!w.alive) continue;
      const [dx, dy] = segDist(bomb.x, bomb.y, w.ax, w.ay, w.bx, w.by);
      if (Math.hypot(dx, dy) >= R) continue;
      if (w.kind === 'ice') { this.meltIce(w); continue; }
      w.alive = false; this.burst((w.ax + w.bx) / 2, (w.ay + w.by) / 2, ['#92400e', '#b45309'], 18, 240);
    }
    for (const p of this.parts) {
      const dx = p.x - bomb.x, dy = p.y - bomb.y, d = Math.hypot(dx, dy);
      if (p.dead || d > R || d < 0.01) continue;
      if (p.t === 'stone') { p.dead = true; continue; }
      const k = (1 - d / R) * 700;
      p.vx += (dx / d) * k; p.vy += (dy / d) * k;
    }
    for (const r of this.rocks) {
      if (!r.alive) continue;
      const dx = r.x - bomb.x, dy = r.y - bomb.y, d = Math.hypot(dx, dy);
      if (d < R && d > 0.01) { r.vx += (dx / d) * 500 * (1 - d / R); r.vy += (dy / d) * 500 * (1 - d / R); }
    }
  }

  hurtChief(c, kind) {
    if (c.dead || this.t < c.immune) return;
    if (c.weak[c.phase] !== kind) {
      if (this.t - (c.clangT || -9) > 1.5 && (kind === 'crush' || kind === 'bomb')) { // a pool it sits in does not nag
        c.clangT = this.t;
        this.popups.push({ text: `needs ${WEAK_LABEL[c.weak[c.phase]]}`, x: c.x, y: c.y - c.h - 6, life: 1, max: 1, color: '#e9d5ff' });
      }
      return;
    }
    c.phase++; c.immune = this.t + 1; c.hitT = this.t;
    this.shake = Math.max(this.shake, 0.6);
    this.burst(c.x, c.y - c.h / 2, kind === 'lava' ? ['#f97316', '#facc15'] : kind === 'water' ? ['#60a5fa', '#e0f2fe'] : ['#a855f7', '#e9d5ff'], 26, 220);
    if (c.phase >= c.weak.length) { this.kill(c, kind); return; }
    this.sound.play('hit');
    this.popups.push({ text: 'HIT!', x: c.x, y: c.y - c.h - 6, life: 1, max: 1, color: '#fde047', big: true });
  }

  kill(b, cause) {
    if (b.dead) return;
    b.dead = true; b.cause = cause; b.deathT = 0;
    if (b.kind === 'hero') {
      b.mood = 'dead';
      this.shake = Math.max(this.shake, 0.7);
      this.burst(b.x, b.y - 20, cause === 'lava' ? ['#f97316', '#1c1917'] : cause === 'goo' ? ['#a855f7', '#2dd4bf'] : ['#fca5a5', '#ef4444'], 24, 200);
      const reasons = {
        lava: 'The lava reached Pip.', boulder: 'The boulder fell on Pip.', bomb: 'Pip was too close to the bomb.',
        goo: 'The alien goo got Pip.', gas: 'Pip breathed the gas.',
      };
      this.failNow(reasons[cause] || `${ENEMY_NAME[cause] || 'An enemy'} got to Pip.`);
    } else {
      this.sound.play('kill');
      const robot = b.type === 'klonkbot' || b.type === 'buzzbot';
      this.burst(b.x, b.y - 18, cause === 'lava' ? ['#f97316', '#422006'] : robot ? ['#94a3b8', '#facc15'] : ['#a855f7', '#2dd4bf'], b.type === 'chief' ? 60 : 20, 180);
      if (cause === 'water' && robot) this.popups.push({ text: 'ZAP!', x: b.x, y: b.y - 64, life: 0.8, max: 0.8, color: '#93c5fd', big: true });
      this.popups.push({ text: b.type === 'chief' ? '+500' : '+100', x: b.x, y: b.y - 50, life: 1, max: 1, color: '#fde047', big: b.type === 'chief' });
      if (b.type === 'chief') { this.shake = 1.2; this.flash = 0.8; this.sound.play('boom'); }
    }
  }

  collect(p) {
    p.dead = true;
    this.collected++;
    this.coins.push({ x: p.x, y: p.y, life: 0.45, max: 0.45 });
    this.sound.play('coin', 45);
    if (this.collected === this.need) { this.hero.mood = 'happy'; this.popups.push({ text: 'ENOUGH FERNSTONES!', x: clamp(this.hero.x, 130, 230), y: this.hero.y - 70, life: 1.2, max: 1.2, color: '#5eead4', big: true }); }
  }

  failNow(reason) {
    if (this.result || this.pending?.lose) return;
    this.pending = { lose: true, reason, t: 0.5 };
    this.popups.push({ text: 'FAIL!', x: BOARD_W / 2, y: 200, life: 1.6, max: 1.6, color: '#f87171', big: true });
  }

  /** Nothing solid between two points (walls, closed pins, gates, ice, platforms). */
  clearLine(ax, ay, bx, by, pad = 3) {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    for (const sg of this.segs) {
      const m = sg.r + pad;
      if (Math.max(sg.ax, sg.bx) + m < x0 || Math.min(sg.ax, sg.bx) - m > x1 || Math.max(sg.ay, sg.by) + m < y0 || Math.min(sg.ay, sg.by) - m > y1) continue;
      if (segSeg(ax, ay, bx, by, sg.ax, sg.ay, sg.bx, sg.by) < m) return false;
    }
    return true;
  }
  /** An enemy sees Pip: walkers on his floor with nothing in between, Buzzbots in any direction. */
  sees(e) {
    const h = this.hero;
    if (e.fly) return Math.hypot(e.x - h.x, e.y - h.y) < 460 && this.clearLine(e.x, e.y - 10, h.x, h.y - 16, 2);
    if (Math.abs(e.y - h.y) > 60) return false;
    return this.clearLine(e.x, e.y - 14, h.x, h.y - 14);
  }

  /** Walking levels: Pip heads for the nearest Fernstone on his floor while the way there is clear and safe. */
  planWalk() {
    const h = this.hero;
    h.walk = 0;
    if (h.dead || this.pending || this.result || Math.abs(h.vy) > 60) return;
    let best = null, bestD = Infinity;
    for (const p of this.parts) {
      if (p.dead || p.t !== 'gem' || p.y < h.y - 34 || p.y > h.y + 16) continue;
      const d = Math.abs(p.x - h.x);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best || bestD < 8) return;
    const x0 = Math.min(h.x, best.x), x1 = Math.max(h.x, best.x);
    if (!this.clearLine(h.x, h.y - 14, best.x, h.y - 14)) return;
    for (const p of this.parts) if (!p.dead && DEADLY[p.t] && p.x > x0 - 24 && p.x < x1 + 24 && p.y > h.y - 60 && p.y < h.y + 20) return;
    for (const e of this.enemies) if (!e.dead && e.x > x0 - 30 && e.x < x1 + 30 && Math.abs(e.y - h.y) < 70) return;
    h.walk = Math.sign(best.x - h.x);
  }

  checkRules(dt) {
    if (this.result) return;
    const hero = this.hero;
    for (const e of this.enemies) {
      if (e.dead) { e.deathT += dt; e.charging = false; continue; }
      if (hero.dead || e.type === 'chief') { e.charging = false; continue; }
      const was = e.charging;
      e.charging = this.sees(e);
      if (e.charging && !was) this.popups.push({ text: '!', x: e.x, y: e.y - 56, life: 0.8, max: 0.8, color: '#f87171', big: true });
    }
    // enemies reaching Pip
    if (!hero.dead) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const reach = (e.w + hero.w) / 2 - 2;
        const ey = e.fly ? e.y + 16 : e.y;
        if (Math.abs(e.x - hero.x) < reach && Math.abs(ey - hero.y) < (e.type === 'chief' ? 60 : 30)) { this.kill(hero, e.type); break; }
      }
    }
    // Fernstones that land in Pip's room fly to him
    if (!hero.dead && this.zone) {
      const [zx0, zy0, zx1, zy1] = this.zone;
      for (const p of this.parts) {
        // landed (or slow) Fernstones only: one falling through the room into lava is not saved yet
        if (!p.dead && p.t === 'gem' && p.x > zx0 && p.x < zx1 && p.y > zy0 && p.y < zy1 && p.vx * p.vx + p.vy * p.vy < 160 * 160) this.collect(p);
      }
    }
    for (const pt of this.portals) pt.pulse = Math.max(0, pt.pulse - dt * 2);
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        if (this.pending.lose) this.result = { won: false, stars: 0, score: this.score, reason: this.pending.reason };
        else this.win();
      }
      return;
    }
    const enemiesLeft = this.enemies.filter((e) => !e.dead).length;
    const gemsLeft = this.parts.reduce((n, p) => n + (!p.dead && p.t === 'gem' ? 1 : 0), 0);
    if (this.collected + gemsLeft < this.need) {
      this.failNow(this.eaten > this.melted ? 'The goo ate the Fernstones.' : this.melted ? 'The lava melted the Fernstones.' : 'Too many Fernstones were lost.');
      return;
    }
    if (this.collected >= this.need && enemiesLeft === 0) {
      this.pending = { lose: false, t: this.L.settle ?? 1.2 };
      return;
    }
    // Stuck: every control is used and nothing moves any more.
    const moving = hero.walk !== 0 || this.parts.some((p) => !p.dead && p.t !== 'gas' && Math.abs(p.vx) + Math.abs(p.vy) > 25)
      || this.rocks.some((r) => r.alive && Math.abs(r.vx) + Math.abs(r.vy) > 25)
      || this.enemies.some((e) => !e.dead && e.charging);
    this.calm = moving ? 0 : this.calm + dt;
    const allOut = this.controls.every((c) => c.state === 'out');
    this.idle = allOut ? this.idle + dt : 0;
    if (allOut && (this.calm > 1.2 || this.idle > 10)) {
      this.failNow(enemiesLeft ? (this.chief && !this.chief.dead ? 'The Zorb boss is still standing.' : 'An invader is still standing.') : `Only ${this.collected} of ${this.need} Fernstones reached Pip.`);
    }
  }

  win() {
    const frac = this.collected / Math.max(1, this.totalGems);
    const [two, three] = this.L.stars;
    const stars = frac >= three ? 3 : frac >= two ? 2 : 1;
    this.hero.mood = 'happy';
    this.result = { won: true, stars, score: this.score, reason: `${this.collected} of ${this.totalGems} Fernstones saved (${Math.round(two * 100)} % for ★★, ${Math.round(three * 100)} % for ★★★).` };
    this.sound.play('good');
    this.burst(this.hero.x, this.hero.y - 60, ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7'], 50, 260);
  }

  // ── effects ──
  burst(x, y, colors, n, speed) {
    if (this.preview) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0.6 + Math.random() * 0.6, max: 1.2, color: colors[i % colors.length], size: 2 + Math.random() * 3 });
    }
  }
  steam(x, y) {
    if (this.preview || this.fx.length > 500) return;
    this.fx.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: 0.9, max: 0.9, color: 'rgba(241,245,249,.75)', size: 6, puff: true });
  }
  smoke(x, y, color) { if (!this.preview && this.fx.length < 500) this.fx.push({ x, y, vx: 0, vy: -50, life: 0.7, max: 0.7, color, size: 5, puff: true }); }
  updateFx(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      if (f.ring) continue;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (!f.puff) f.vy += 600 * dt; else f.size += dt * 10;
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const c of this.coins) c.life -= dt;
    this.coins = this.coins.filter((c) => c.life > 0);
    for (const p of this.popups) { p.life -= dt; p.y -= dt * 30; }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  // ── drawing ──
  /** Labels drawn on top of either view in board space: control numbers, the boss's next weakness, popups. */
  drawOverlay(g, view, labels) {
    if (view.keyboard && labels) {
      for (const pin of this.pins) {
        if (pin.state !== 'in') continue;
        const [, , bx, by] = this.pinSeg(pin);
        label(g, String(pin.i + 1), bx + pin.dx * 12, by + pin.dy * 12 + 0.5, 10, '#422006', 'rgba(255,255,255,.75)', 800);
      }
      for (const lv of this.levers) if (lv.state === 'in') label(g, String(lv.i + 1), lv.at[0], lv.at[1] - 22, 10, '#422006', 'rgba(255,255,255,.75)', 800);
    }
    const c = this.chief;
    if (c && !c.dead) {
      const left = c.weak.length - c.phase;
      label(g, `${'♥'.repeat(left)}  next: ${WEAK_LABEL[c.weak[c.phase]]}`, clamp(c.x, 110, 250), c.y + c.r - c.h - 16, 12, '#f5d0fe', 'rgba(30,10,50,.75)', 900);
    }
    for (const p of this.popups) {
      g.globalAlpha = Math.min(1, p.life * 2);
      label(g, p.text, p.x, p.y, p.big ? (p.text.length > 10 ? 22 : 34) : 18, p.color, 'rgba(0,0,0,.6)', 900);
    }
    g.globalAlpha = 1;
  }
  render(g, view) {
    if (view.gl) {
      // The 3D view drew the tower; control numbers, popups and flashes go on top in board space.
      const { s, ox, oy } = (this.layout = view.gl.layoutFor());
      g.save(); g.translate(ox, oy); g.scale(s, s);
      this.drawOverlay(g, view, true);
      g.restore();
      this.drawFlash(g, view);
      return;
    }
    const { w, h } = view;
    // The top 56 px belong to the HUD; the board (roof included) fits below it.
    const top = 56, avail = h - top - 4;
    const s = Math.min(w / BOARD_W, avail / (BOARD_H - 6));
    const ox = (w - BOARD_W * s) / 2, oy = top + Math.max(0, (avail - BOARD_H * s) / 2) - 6 * s;
    this.layout = { s, ox, oy };
    const pal = PALETTE2D[this.world] || PALETTE2D[0];
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, view.dark ? '#0f172a' : pal.sky[0]); sky.addColorStop(1, view.dark ? '#1e1b4b' : pal.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = view.dark ? '#1c1917' : pal.ground;
    g.beginPath(); g.ellipse(w / 2, h + h * 0.05, w * 0.9, h * 0.16, 0, 0, Math.PI * 2); g.fill();

    g.save();
    const amp = view.reduced ? 0.3 : 1;
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 12 * this.shake * amp, (Math.random() - 0.5) * 12 * this.shake * amp);
    g.translate(ox, oy); g.scale(s, s);
    this.drawTower(g, view, pal);
    const COL = { water: ['#3b82f6', '#60a5fa'], lava: ['#ea580c', '#fbbf24'], stone: ['#57534e', '#78716c'], sand: ['#d6a35c', '#f0c987'], goo: ['#7e22ce', '#c084fc'], gas: ['rgba(163,230,53,.35)', 'rgba(217,249,157,.45)'], gem: ['#0f766e', '#5eead4'] };
    for (const p of this.parts) {
      if (p.dead) continue;
      const c = COL[p.t];
      g.fillStyle = c[0]; g.beginPath(); g.arc(p.x, p.y, PR * (p.t === 'gas' ? 1.9 : p.t === 'gem' ? 1.1 : 1.4), 0, 6.283); g.fill();
      g.fillStyle = c[1]; g.beginPath(); g.arc(p.x - 1, p.y - 1, PR * 0.8, 0, 6.283); g.fill();
    }
    for (const pt of this.portals) {
      const [x0, y0, x1, y1] = pt.from;
      g.fillStyle = `rgba(168,85,247,${0.35 + pt.pulse * 0.4})`; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = '#c084fc'; g.lineWidth = 3; g.beginPath(); g.arc(pt.to[0], pt.to[1], 12 + Math.sin(this.t * 5) * 2, 0, 6.283); g.stroke();
    }
    for (const r of this.rocks) if (r.alive) this.drawRock(g, r);
    for (const pin of this.pins) if (pin.state !== 'out') this.drawPin(g, pin);
    for (const e of this.enemies) this.drawEnemy(g, e);
    this.drawHero(g, this.hero);
    for (const c of this.coins) {
      const q = 1 - c.life / c.max;
      const x = c.x + (this.hero.x - c.x) * q, y = c.y + (this.hero.y - 40 - c.y) * q - Math.sin(q * Math.PI) * 30;
      g.fillStyle = '#5eead4'; g.beginPath(); g.arc(x, y, PR * (1.2 - q * 0.5), 0, 6.283); g.fill();
    }
    for (const f of this.fx) {
      if (f.ring) {
        const q = 1 - f.life / f.max;
        g.strokeStyle = `rgba(253,224,71,${1 - q})`; g.lineWidth = 8 * (1 - q) + 1;
        g.beginPath(); g.arc(f.x, f.y, f.r * q, 0, 6.283); g.stroke();
        continue;
      }
      g.globalAlpha = Math.max(0, Math.min(1, f.life / f.max * 1.5));
      g.fillStyle = f.color;
      g.beginPath(); g.arc(f.x, f.y, f.size, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
    this.drawOverlay(g, view, false);
    g.restore();
    this.drawFlash(g, view);
  }
  drawFlash(g, view) {
    if (this.flash > 0) { g.fillStyle = `rgba(255,237,213,${this.flash * 0.5})`; g.fillRect(0, 0, view.w, view.h); }
    if (this.preview) { g.fillStyle = view.dark ? 'rgba(0,0,0,.3)' : 'rgba(255,255,255,.1)'; g.fillRect(0, 0, view.w, view.h); }
  }

  drawTower(g, view, pal) {
    const b = this.L.bounds || [40, 40, 320, 600];
    g.fillStyle = view.dark ? '#2a2420' : pal.inside;
    g.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    if (this.zone) {
      const [zx0, zy0, zx1, zy1] = this.zone;
      g.fillStyle = 'rgba(94, 234, 212, .12)'; g.fillRect(zx0, zy0, zx1 - zx0, zy1 - zy0);
    }
    const line = (s, w, c, dash) => { g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke(); if (dash) g.setLineDash([]); };
    g.lineCap = 'round';
    for (const wl of this.walls) line(wl, WALL_T + 3, pal.wall[0]);
    for (const wl of this.walls) line(wl, WALL_T - 3, pal.wall[1]);
    for (const wl of this.breakables) if (wl.alive) { line(wl, WALL_T + 2, '#78350f'); line(wl, WALL_T - 4, '#b45309', [10, 4]); }
    for (const gt of this.gates) if (gt.alive) { line(gt, WALL_T + 2, '#854d0e'); line(gt, WALL_T - 4, '#facc15', [4, 6]); }
    for (const ic of this.ice) if (ic.alive) { const [x0, y0, x1, y1] = ic.rect; g.fillStyle = 'rgba(186,230,253,.9)'; roundRect(g, x0, y0, x1 - x0, y1 - y0, 5); g.fill(); g.strokeStyle = '#e0f2fe'; g.lineWidth = 2; g.stroke(); }
    for (const lv of this.levers) {
      line(lv.plat, WALL_T, '#7c2d12'); line(lv.plat, WALL_T - 5, '#c2410c');
      const [x, y] = lv.at, a = -0.6 + (lv.ang / (lv.turn || 1)) * 1.2;
      g.strokeStyle = '#475569'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 18, y - Math.cos(a) * 18); g.stroke();
      g.fillStyle = lv.i === this.hover ? '#fde047' : '#ef4444'; g.beginPath(); g.arc(x + Math.sin(a) * 18, y - Math.cos(a) * 18, 6, 0, 6.283); g.fill();
      g.fillStyle = '#334155'; g.fillRect(x - 9, y - 3, 18, 7);
    }
    g.lineCap = 'butt';
    g.fillStyle = view.dark ? '#44403c' : pal.roof;
    g.beginPath(); g.moveTo(b[0] - 18, b[1] + 2); g.lineTo((b[0] + b[2]) / 2, b[1] - 34); g.lineTo(b[2] + 18, b[1] + 2); g.closePath(); g.fill();
  }

  drawPin(g, pin) {
    const [ax, ay, bx, by] = this.pinSeg(pin);
    const hot = pin.i === this.hover;
    g.lineCap = 'round';
    if (hot) { g.strokeStyle = 'rgba(253, 224, 71, .55)'; g.lineWidth = 18; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    g.strokeStyle = '#a16207'; g.lineWidth = 11; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = '#facc15'; g.lineWidth = 7; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    const hx = bx + pin.dx * 12, hy = by + pin.dy * 12;
    g.strokeStyle = '#a16207'; g.lineWidth = 7; g.beginPath(); g.arc(hx, hy, 10, 0, 6.283); g.stroke();
    g.strokeStyle = '#facc15'; g.lineWidth = 4; g.beginPath(); g.arc(hx, hy, 10, 0, 6.283); g.stroke();
    g.lineCap = 'butt';
  }

  drawHero(g, b) {
    const x = b.x, feet = b.y + b.r;
    const bob = b.mood === 'happy' ? -Math.abs(Math.sin(this.t * 10)) * 6 : b.walk ? -Math.abs(Math.sin(this.t * 12)) * 2 : 0;
    const y = feet + bob, burnt = b.dead && b.cause === 'lava';
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x, feet, 14, 4, 0, 0, 6.283); g.fill();
    g.fillStyle = burnt ? '#1c1917' : '#3f6212'; g.fillRect(x - 9, y - 16, 7, 16); g.fillRect(x + 2, y - 16, 7, 16);
    g.fillStyle = burnt ? '#292524' : '#65a30d'; roundRect(g, x - 12, y - 36, 24, 22, 6); g.fill();
    g.fillStyle = burnt ? '#292524' : '#f97316'; g.fillRect(x - 12, y - 36, 24, 5);
    g.fillStyle = burnt ? '#292524' : '#fcd9b6'; g.beginPath(); g.arc(x, y - 46, 11, 0, 6.283); g.fill();
    g.fillStyle = burnt ? '#0c0a09' : '#78350f'; g.beginPath(); g.arc(x, y - 50, 11, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.fillStyle = '#1f2937';
    if (!b.dead) { g.beginPath(); g.arc(x - 4, y - 47, 1.6, 0, 6.283); g.arc(x + 4, y - 47, 1.6, 0, 6.283); g.fill(); }
  }

  drawEnemy(g, e) {
    if (e.dead && e.deathT > 0.6) return;
    const x = e.x, feet = e.y + e.r;
    g.globalAlpha = e.dead ? Math.max(0, 1 - e.deathT / 0.6) : 1;
    const burnt = e.dead && e.cause === 'lava';
    g.save(); g.translate(x, feet); g.scale(e.type === 'chief' ? 2.2 : 1, (e.dead && e.cause === 'boulder' ? 0.35 : 1) * (e.type === 'chief' ? 2.2 : 1));
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(0, 0, 14, 4, 0, 0, 6.283); g.fill();
    if (e.type === 'klonkbot' || e.type === 'buzzbot') {
      const hover = e.type === 'buzzbot' ? -16 : 0;
      g.fillStyle = burnt ? '#292524' : '#94a3b8'; roundRect(g, -13, hover - 40, 26, 30, 5); g.fill();
      g.fillStyle = '#22d3ee'; g.fillRect(-8, hover - 33, 16, 6);
      if (e.type === 'buzzbot') { g.fillStyle = '#475569'; g.fillRect(-16, hover - 46, 32, 3); }
      else { g.fillStyle = '#475569'; g.fillRect(-9, -10, 7, 10); g.fillRect(2, -10, 7, 10); }
    } else {
      g.fillStyle = burnt ? '#292524' : e.type === 'chief' ? '#7e22ce' : '#a855f7';
      g.beginPath(); g.ellipse(0, -18, 14, 18, 0, 0, 6.283); g.fill();
      g.fillStyle = '#ecfeff'; g.beginPath(); g.arc(0, -22, 6, 0, 6.283); g.fill();
      g.fillStyle = '#134e4a'; g.beginPath(); g.arc(0, -22, 3, 0, 6.283); g.fill();
      g.strokeStyle = '#2dd4bf'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -36); g.lineTo(0, -44); g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  drawRock(g, r) {
    g.save(); g.translate(r.x, r.y); g.rotate(r.rot);
    if (r.kind === 'boulder') {
      g.fillStyle = '#57534e'; g.beginPath(); g.arc(0, 0, r.r, 0, 6.283); g.fill();
      g.fillStyle = '#78716c'; g.beginPath(); g.arc(-4, -5, r.r * 0.7, 0, 6.283); g.fill();
    } else if (r.kind === 'key') {
      g.strokeStyle = '#facc15'; g.lineWidth = 3.5; g.beginPath(); g.arc(-3, 0, 5, 0, 6.283); g.stroke();
      g.beginPath(); g.moveTo(2, 0); g.lineTo(11, 0); g.moveTo(8, 0); g.lineTo(8, 4); g.stroke();
    } else {
      g.fillStyle = '#18181b'; g.beginPath(); g.arc(0, 0, r.r, 0, 6.283); g.fill();
      g.strokeStyle = '#a16207'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -r.r); g.quadraticCurveTo(6, -r.r - 8, 2, -r.r - 12); g.stroke();
      g.fillStyle = (Math.floor(this.t * 12) % 2) ? '#fde047' : '#f97316'; g.beginPath(); g.arc(2, -r.r - 13, 3, 0, 6.283); g.fill();
    }
    g.restore();
  }
}

const PALETTE2D = [
  { sky: ['#93c5fd', '#e0f2fe'], ground: '#4ade80', inside: '#e7d8bf', wall: ['#78716c', '#a8a29e'], roof: '#dc2626' },
  { sky: ['#fdba74', '#fef3c7'], ground: '#f59e0b', inside: '#f2d3a2', wall: ['#b45309', '#e0a96d'], roof: '#c2410c' },
  { sky: ['#93c5fd', '#f0f9ff'], ground: '#e0f2fe', inside: '#dbe7f3', wall: ['#64748b', '#b8cbe0'], roof: '#1d4ed8' },
  { sky: ['#4c1d95', '#fb923c'], ground: '#292524', inside: '#4a3d3c', wall: ['#1c1917', '#57534e'], roof: '#7f1d1d' },
];

export const pipsTower = {
  id: 'pips-tower',
  title: 'Pip’s Tower',
  tagline: 'Pull the pins in the right order: Fernstones to Pip, lava and Zorb invaders anywhere else.',
  howTo: 'Tap or click a pin or lever to pull it (with a keyboard, keys 1–9 use the numbered ones). Water turns lava into stone, lava melts Fernstones and burns Zorblings, Klonkbots short out in water. Esc pauses, R restarts.',
  hero: 'PIP',
  companion: 'BISCUIT',
  levels: LEVELS,
  art: new URL('../../games-assets/k-pips-tower.webp', import.meta.url).href,
  create: (i, env) => new PipsTowerSession(i, env),
  view3d: () => import('./pips-tower-3d.js'),
};
