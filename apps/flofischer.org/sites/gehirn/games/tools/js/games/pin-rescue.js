/**
 * Pin Rescue — the "pull the pin" puzzles from the Homescapes / Hero Wars ads, the way the ads show them (the real
 * games are match-3 and an idle RPG). Golden pins hold back gold, water, lava, boulders and bombs; pull them in the
 * right order so the gold reaches the hero and nothing deadly does. Water turns lava into stone, lava melts gold and
 * burns enemies, boulders crush, bombs go off in lava.
 *
 * A small position-based particle simulation on a fixed 360 × 640 board (deterministic, no DOM), so tests can solve
 * levels headless. Bodies (hero, enemies) are feet circles for the floor plus a box for contacts.
 */
import { clamp, label, roundRect } from './core.js';
import { LEVELS } from './pin-rescue-levels.js';

export const BOARD_W = 360, BOARD_H = 640;
const PR = 5;            // particle radius
const WALL_T = 12;       // wall / pin thickness
const G = 900;           // gravity, px/s²
const SUB = 3;           // substeps per 1/60 s
const CELL = 16;          // spatial grid cell = fluid interaction radius
const GRID_PAD = 64;      // the grid reaches a little past the board on every side
const GW = Math.ceil((BOARD_W + GRID_PAD * 2) / CELL), GH = Math.ceil((BOARD_H + GRID_PAD * 2) / CELL);
const cellIndex = (x, y) => clamp(((y + GRID_PAD) / CELL) | 0, 0, GH - 1) * GW + clamp(((x + GRID_PAD) / CELL) | 0, 0, GW - 1);
const PULL_TIME = 0.32;
const BODY = { hero: { r: 13, h: 52, w: 28 }, enemy: { r: 13, h: 46, w: 28 } };
const FRICTION = { water: 0.02, lava: 0.08, gold: 0.1, stone: 0.4 };
const MASS = { water: 1.6, lava: 1, gold: 3, stone: 2.2 };
// Fluid pressure (double density relaxation, Clavet et al. 2005) makes water and lava level out instead of piling.
export const FLUID = { h: 16, rho0: 0.9, k: 40, kNear: 80 };
const FLUIDS = new Set(['water', 'lava']);
const NEIGHBOURS = new Array(48).fill(null), NEIGHBOUR_Q = new Float64Array(48), NEIGHBOUR_X = new Float64Array(48), NEIGHBOUR_Y = new Float64Array(48);

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return [px - cx, py - cy];
};

export class PinRescueSession {
  constructor(levelIndex, env = {}) {
    this.index = levelIndex;
    this.L = LEVELS[levelIndex];
    this.sound = env.sound || { play() {} };
    this.preview = !!env.preview;
    this.t = 0; this.result = null; this.pending = null; this.calm = 0;
    this.walls = this.L.walls.map(([ax, ay, bx, by]) => ({ ax, ay, bx, by, r: WALL_T / 2 }));
    this.breakables = (this.L.breakable || []).map(([ax, ay, bx, by]) => ({ ax, ay, bx, by, r: WALL_T / 2, alive: true }));
    this.pins = this.L.pins.map(([ax, ay, bx, by], i) => {
      const len = Math.hypot(bx - ax, by - ay);
      return { i, ax, ay, bx, by, len, dx: (bx - ax) / len, dy: (by - ay) / len, off: 0, state: 'in', r: 5, pullT: 0 };
    });
    this.parts = [];
    for (const f of this.L.fill) {
      const step = PR * 1.9;
      for (let y = f[2] + PR; y <= f[4] - PR + 0.01; y += step) {
        for (let x = f[1] + PR + ((Math.round((y - f[2]) / step) % 2) * step) / 2; x <= f[3] - PR + 0.01; x += step) {
          this.parts.push({ x, y, vx: 0, vy: 0, t: f[0], fixed: false, dead: false });
        }
      }
    }
    this.totalGold = this.parts.filter((p) => p.t === 'gold').length;
    this.need = Math.max(1, Math.round(this.totalGold * (this.L.need ?? 0.5)));
    this.collected = 0; this.melted = 0;
    const [hx, hy] = this.L.hero;
    this.hero = { kind: 'hero', x: hx, y: hy, vx: 0, vy: 0, ...BODY.hero, dead: false, mood: 'idle', cause: '' };
    this.enemies = (this.L.enemies || []).map(([x, y]) => ({ kind: 'enemy', x, y, vx: 0, vy: 0, ...BODY.enemy, dead: false, deathT: 0 }));
    this.rocks = [
      ...(this.L.boulders || []).map(([x, y]) => ({ kind: 'boulder', x, y, vx: 0, vy: 0, r: 17, rot: 0, alive: true })),
      ...(this.L.bombs || []).map(([x, y]) => ({ kind: 'bomb', x, y, vx: 0, vy: 0, r: 12, rot: 0, alive: true })),
    ];
    this.zone = this.L.zone;
    this.fx = []; this.coins = []; this.popups = []; this.shake = 0; this.flash = 0;
    this.hover = -1; this.layout = null; this.pulled = 0;
    this.hint = this.L.hint;
  }

  get score() { return this.collected * 10 + this.enemies.filter((e) => e.dead).length * 100; }
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
      const pin = this.pins[Number(m[1]) - 1];
      if (pin) this.pull(pin.i);
    }
    return true;
  }
  pull(i) {
    const pin = this.pins[i];
    if (!pin || pin.state !== 'in' || this.result) return false;
    pin.state = 'pulling'; pin.pullT = 0; this.pulled++;
    this.sound.play('pin');
    return true;
  }
  pinSeg(pin) { return [pin.ax + pin.dx * pin.off, pin.ay + pin.dy * pin.off, pin.bx + pin.dx * pin.off, pin.by + pin.dy * pin.off]; }

  // ── simulation ──
  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 3); this.flash = Math.max(0, this.flash - dt * 2);
    for (const pin of this.pins) {
      if (pin.state !== 'pulling') continue;
      pin.pullT += dt;
      const q = Math.min(1, pin.pullT / PULL_TIME);
      pin.off = (pin.len + 20) * q * q;
      if (q >= 1) pin.state = 'out';
    }
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) this.substep(h);
    this.updateFx(dt);
    this.checkRules(dt);
  }

  segments() {
    const segs = this.walls.slice();
    for (const b of this.breakables) if (b.alive) segs.push(b);
    for (const pin of this.pins) {
      if (pin.state === 'out') continue;
      const [ax, ay, bx, by] = this.pinSeg(pin);
      segs.push({ ax, ay, bx, by, r: pin.r });
    }
    return segs;
  }

  collideSegs(o, rad, segs, friction) {
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
    }
  }

  substep(h) {
    const segs = this.segments();
    const parts = this.parts;
    // Position-based: predict, resolve contacts as position corrections, then derive velocities from the motion.
    // That keeps resting piles still (no jitter) and stable at three substeps.
    for (const p of parts) {
      if (p.fixed || p.dead) continue;
      p.px = p.x; p.py = p.y; p.cn = 0;
      p.vy += G * h;
      if (p.t === 'lava') { p.vx *= 0.995; p.vy *= 0.997; }
      p.x += p.vx * h; p.y += p.vy * h;
    }
    const grid = this.buildGrid(parts);
    for (let iter = 0; iter < 2; iter++) this.solvePairs(parts, grid);
    this.relax(parts, grid, h);
    for (const p of parts) {
      if (p.fixed || p.dead) continue;
      this.pushOut(p, PR, segs);
      if (p.y > BOARD_H + 40 || p.x < -40 || p.x > BOARD_W + 40) p.dead = true;
    }
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
    for (const b of [this.hero, ...this.enemies]) {
      if (b.dead && b.kind === 'enemy') continue;
      if (b.kind === 'enemy') b.vx = b.charging ? Math.sign(this.hero.x - b.x) * 70 : 0;
      b.vy += G * h;
      b.x += b.vx * h; b.y += b.vy * h;
      this.collideSegs(b, b.r, segs, b.kind === 'enemy' && b.charging ? 0 : 0.6);
      if (b.kind === 'hero') b.vx *= 0.9;
    }
    for (const r of this.rocks) {
      if (!r.alive) continue;
      r.vy += G * h;
      r.x += r.vx * h; r.y += r.vy * h;
      this.collideSegs(r, r.r, segs, 0.04);
      r.rot += (r.vx * h) / r.r;
    }
    this.rockVsBodies();
  }

  /** Counting-sort spatial grid in reused typed arrays (no per-frame allocations). */
  buildGrid(parts) {
    const n = parts.length;
    if (!this.grid || this.grid.cellOf.length < n) {
      this.grid = { start: new Int32Array(GW * GH + 1), items: new Int32Array(n), cellOf: new Int32Array(n) };
    }
    const { start, items, cellOf } = this.grid;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      if (p.dead) { cellOf[i] = -1; continue; }
      const c = cellIndex(p.x, p.y);
      cellOf[i] = c; start[c + 1]++;
    }
    for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c];
    const fill = this.gridFill && this.gridFill.length >= GW * GH ? this.gridFill : (this.gridFill = new Int32Array(GW * GH));
    fill.set(start.subarray(0, GW * GH));
    for (let i = 0; i < n; i++) { const c = cellOf[i]; if (c >= 0) items[fill[c]++] = i; }
    return this.grid;
  }

  solvePairs(parts, grid) {
    const min = PR * 2, min2 = min * min;
    const { start, items } = grid;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      if (a.dead) continue;
      const cx = clamp(((a.x + GRID_PAD) / CELL) | 0, 0, GW - 1), cy = clamp(((a.y + GRID_PAD) / CELL) | 0, 0, GH - 1);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(GH - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(GW - 1, cx + 1); gx++) {
          const c = gy * GW + gx;
          for (let k = start[c], end = start[c + 1]; k < end; k++) {
            const j = items[k];
            if (j <= i) continue;
            const b = parts[j];
            if (b.dead || a.dead) continue;
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 >= min2) continue;
            if (this.react(a, b)) continue;
            if (a.fixed && b.fixed) continue;
            // Fresh stone is porous: water and lava seep through it, so a crust cannot seal lava away from water.
            const porous = (a.t === 'stone' && FLUIDS.has(b.t)) || (b.t === 'stone' && FLUIDS.has(a.t));
            const reach = porous ? PR : min;
            if (porous && d2 >= reach * reach) continue;
            const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, over = reach - d;
            const wa = a.fixed ? 0 : b.fixed ? 1 : MASS[b.t] / (MASS[a.t] + MASS[b.t]), wb = 1 - wa;
            a.x -= nx * over * wa; a.y -= ny * over * wa; b.x += nx * over * wb; b.y += ny * over * wb;
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
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
      o.x += nx * (min - d); o.y += ny * (min - d);
      o.cn = 1; o.cnx = nx; o.cny = ny;
    }
  }

  /** Fluid pressure: pushes crowded water/lava particles apart so pools flatten and flow over edges. */
  relax(parts, grid, h) {
    const { h: H, rho0, k, kNear } = FLUID;
    const scale = h * h * 3600 * 0.25; // 1 at 60 Hz with one substep; each side of a pair moves half
    const nb = NEIGHBOURS, nq = NEIGHBOUR_Q, nx = NEIGHBOUR_X, ny = NEIGHBOUR_Y;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      if (a.dead || !FLUIDS.has(a.t)) continue;
      const cx = clamp(((a.x + GRID_PAD) / CELL) | 0, 0, GW - 1), cy = clamp(((a.y + GRID_PAD) / CELL) | 0, 0, GH - 1);
      let count = 0, rho = 0, rhoN = 0;
      const { start, items } = grid;
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(GH - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(GW - 1, cx + 1); gx++) {
          const c = gy * GW + gx;
          for (let kk = start[c], end = start[c + 1]; kk < end; kk++) {
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
    if (pair === 'lavawater') {
      for (const p of [a, b]) { p.t = 'stone'; p.vx *= 0.2; p.vy *= 0.2; }
      this.steam(a.x, a.y);
      this.sound.play('sizzle', 160);
      return true;
    }
    // Water soaking a crust keeps cooling the lava underneath (one water particle per lava particle).
    if (pair === 'stonewater') { (a.t === 'stone' ? a : b).wetBy = a.t === 'water' ? a : b; return false; }
    if (pair === 'stonestone') {
      // wetness soaks through a thick crust
      const wa = a.wetBy && !a.wetBy.dead && a.wetBy.t === 'water', wb = b.wetBy && !b.wetBy.dead && b.wetBy.t === 'water';
      if (wa && !wb) b.wetBy = a.wetBy; else if (wb && !wa) a.wetBy = b.wetBy;
      return false;
    }
    if (pair === 'lavastone') {
      const stone = a.t === 'stone' ? a : b, lava = a.t === 'lava' ? a : b, water = stone.wetBy;
      if (!water || water.dead || water.t !== 'water') return false;
      lava.t = 'stone'; water.t = 'stone'; stone.wetBy = null;
      lava.vx *= 0.2; lava.vy *= 0.2;
      this.steam(lava.x, lava.y);
      this.sound.play('sizzle', 160);
      return true;
    }
    if (pair === 'goldlava') {
      const gold = a.t === 'gold' ? a : b;
      gold.dead = true; this.melted++;
      this.smoke(gold.x, gold.y, '#78716c');
      this.sound.play('sizzle', 200);
      return true;
    }
    return false;
  }

  bodyVsParts(b) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y1 = b.y + b.r, y0 = y1 - b.h;
    for (const p of this.parts) {
      if (p.dead || p.x < x0 - PR || p.x > x1 + PR || p.y < y0 - PR || p.y > y1 + PR) continue;
      if (p.t === 'lava') { this.kill(b, 'lava'); continue; }
      if (b.kind === 'hero' && p.t === 'gold' && !b.dead) { this.collect(p); continue; }
      if (p.fixed) continue;
      // push the particle out through the nearest side
      const dl = p.x - (x0 - PR), dr = x1 + PR - p.x, dt = p.y - (y0 - PR), db = y1 + PR - p.y;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) { p.x = x0 - PR; p.vx = Math.min(p.vx, 0); }
      else if (m === dr) { p.x = x1 + PR; p.vx = Math.max(p.vx, 0); }
      else if (m === dt) { p.y = y0 - PR; p.vy = Math.min(p.vy, 0); }
      else { p.y = y1 + PR; p.vy = Math.max(p.vy, 0); }
    }
  }

  rockVsParts(r) {
    const min = r.r + PR, min2 = min * min;
    for (const p of this.parts) {
      if (p.dead) continue;
      const dx = p.x - r.x, dy = p.y - r.y, d2 = dx * dx + dy * dy;
      if (d2 >= min2) continue;
      if (r.kind === 'bomb' && p.t === 'lava') { this.explode(r); return; }
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, over = min - d;
      if (p.fixed) { r.x -= nx * over; r.y -= ny * over; const vn = r.vx * nx + r.vy * ny; if (vn > 0) { r.vx -= vn * nx; r.vy -= vn * ny; } continue; }
      p.x += nx * over * 0.85; p.y += ny * over * 0.85; r.x -= nx * over * 0.15; r.y -= ny * over * 0.15;
      const rv = (p.vx - r.vx) * nx + (p.vy - r.vy) * ny;
      if (rv < 0) { p.vx -= rv * nx * 0.9; p.vy -= rv * ny * 0.9; r.vx += rv * nx * 0.1; r.vy += rv * ny * 0.1; }
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
        if (r.kind === 'boulder' && speed > 70) { this.kill(b, 'boulder'); continue; }
        // resting contact: the body holds the rock
        const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1;
        r.x += nx * (r.r - d); r.y += ny * (r.r - d);
        const vn = r.vx * nx + r.vy * ny;
        if (vn < 0) { r.vx -= vn * nx; r.vy -= vn * ny; }
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
      if (!b.dead && Math.hypot(b.x - bomb.x, b.y - b.h / 2 - bomb.y) < R) this.kill(b, 'bomb');
    }
    for (const w of this.breakables) {
      if (!w.alive) continue;
      const [dx, dy] = segDist(bomb.x, bomb.y, w.ax, w.ay, w.bx, w.by);
      if (Math.hypot(dx, dy) < R) { w.alive = false; this.burst((w.ax + w.bx) / 2, (w.ay + w.by) / 2, ['#92400e', '#b45309'], 18, 240); }
    }
    for (const p of this.parts) {
      const dx = p.x - bomb.x, dy = p.y - bomb.y, d = Math.hypot(dx, dy);
      if (d > R || d < 0.01) continue;
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

  kill(b, cause) {
    if (b.dead) return;
    b.dead = true; b.cause = cause; b.deathT = this.t;
    if (b.kind === 'hero') {
      b.mood = 'dead';
      this.shake = Math.max(this.shake, 0.7);
      this.burst(b.x, b.y - 20, cause === 'lava' ? ['#f97316', '#1c1917'] : ['#fca5a5', '#ef4444'], 24, 200);
      const reasons = { lava: 'The lava reached the hero.', enemy: 'An enemy got to the hero.', boulder: 'The boulder fell on the hero.', bomb: 'The hero was too close to the bomb.' };
      this.failNow(reasons[cause] || 'The hero did not make it.');
    } else {
      this.sound.play('kill');
      this.burst(b.x, b.y - 18, cause === 'lava' ? ['#f97316', '#422006'] : ['#4d7c0f', '#84cc16'], 20, 180);
      this.popups.push({ text: '+100', x: b.x, y: b.y - 50, life: 1, max: 1, color: '#fde047' });
    }
  }

  collect(p) {
    p.dead = true;
    this.collected++;
    this.coins.push({ x: p.x, y: p.y, life: 0.45, max: 0.45 });
    this.sound.play('coin', 45);
    if (this.collected === this.need) { this.hero.mood = 'happy'; this.popups.push({ text: 'ENOUGH GOLD!', x: this.hero.x, y: this.hero.y - 70, life: 1.2, max: 1.2, color: '#fde047', big: true }); }
  }

  failNow(reason) {
    if (this.result || this.pending?.lose) return;
    this.pending = { lose: true, reason, t: 0.5 };
    this.popups.push({ text: 'FAIL!', x: BOARD_W / 2, y: 200, life: 1.6, max: 1.6, color: '#f87171', big: true });
  }

  /** An enemy on the hero's floor with nothing in between charges at him (like in the ads). */
  sees(e) {
    const h = this.hero;
    if (Math.abs(e.y - h.y) > 70) return false;
    const ay = (e.y + h.y) / 2 - 12;
    for (const sg of this.segments()) {
      const lo = Math.min(sg.ax, sg.bx) - sg.r, hi = Math.max(sg.ax, sg.bx) + sg.r;
      const x0 = Math.min(e.x, h.x), x1 = Math.max(e.x, h.x);
      if (hi < x0 || lo > x1) continue;
      // a wall or pin crossing the line of sight at chest height
      const [, dy] = segDist(clamp((lo + hi) / 2, x0, x1), ay, sg.ax, sg.ay, sg.bx, sg.by);
      if (Math.abs(dy) < sg.r + 6 && Math.abs(sg.ax - sg.bx) < Math.abs(sg.ay - sg.by) + 1) return false;
    }
    return true;
  }

  checkRules(dt) {
    if (this.result) return;
    const hero = this.hero;
    for (const e of this.enemies) {
      if (e.dead || hero.dead) { e.charging = false; continue; }
      const was = e.charging;
      e.charging = this.sees(e);
      if (e.charging && !was) this.popups.push({ text: '!', x: e.x, y: e.y - 56, life: 0.8, max: 0.8, color: '#f87171', big: true });
    }
    // enemies reaching the hero
    if (!hero.dead) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - hero.x) < (e.w + hero.w) / 2 - 2 && Math.abs(e.y - hero.y) < 30) { this.kill(hero, 'enemy'); break; }
      }
    }
    // gold that lands in the hero's room flies to him
    const [zx0, zy0, zx1, zy1] = this.zone;
    if (!hero.dead) {
      for (const p of this.parts) {
        if (!p.dead && p.t === 'gold' && p.x > zx0 && p.x < zx1 && p.y > zy0 && p.y < zy1) this.collect(p);
      }
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        if (this.pending.lose) this.result = { won: false, stars: 0, score: this.score, reason: this.pending.reason };
        else this.win();
      }
      return;
    }
    const enemiesLeft = this.enemies.filter((e) => !e.dead).length;
    const goldLeft = this.parts.reduce((n, p) => n + (!p.dead && p.t === 'gold' ? 1 : 0), 0);
    if (this.collected + goldLeft < this.need) { this.failNow(this.melted ? 'The lava melted the gold.' : 'Too much gold was lost.'); return; }
    if (this.collected >= this.need && enemiesLeft === 0) {
      this.pending = { lose: false, t: this.L.settle ?? 1.2 };
      return;
    }
    // Stuck: every pin is out and nothing moves any more.
    const moving = this.parts.some((p) => !p.dead && !p.fixed && Math.abs(p.vx) + Math.abs(p.vy) > 25)
      || this.rocks.some((r) => r.alive && Math.abs(r.vx) + Math.abs(r.vy) > 25);
    this.calm = moving ? 0 : this.calm + dt;
    const allOut = this.pins.every((p) => p.state === 'out');
    this.idle = allOut ? (this.idle || 0) + dt : 0;
    if (allOut && (this.calm > 1.2 || this.idle > 10)) {
      this.failNow(enemiesLeft ? 'An enemy is still standing.' : `Only ${this.collected} of ${this.need} coins reached the hero.`);
    }
  }

  win() {
    const frac = this.collected / Math.max(1, this.totalGold);
    const [two, three] = this.L.stars;
    const stars = frac >= three ? 3 : frac >= two ? 2 : 1;
    this.hero.mood = 'happy';
    this.result = { won: true, stars, score: this.score, reason: `${this.collected} of ${this.totalGold} coins saved (${Math.round(two * 100)} % for ★★, ${Math.round(three * 100)} % for ★★★).` };
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
  smoke(x, y, color) { if (!this.preview) this.fx.push({ x, y, vx: 0, vy: -50, life: 0.7, max: 0.7, color, size: 5, puff: true }); }
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
    for (const e of this.enemies) if (e.dead) e.deathT += dt;
  }

  // ── drawing ──
  render(g, view) {
    if (view.gl) {
      // The 3D view drew the tower; pin numbers, popups and flashes go on top in board space.
      const { s, ox, oy } = (this.layout = view.gl.layoutFor());
      g.save(); g.translate(ox, oy); g.scale(s, s);
      for (const pin of this.pins) {
        if (pin.state !== 'in') continue;
        const [, , bx, by] = this.pinSeg(pin);
        label(g, String(pin.i + 1), bx + pin.dx * 12, by + pin.dy * 12 + 0.5, 10, '#422006', 'rgba(255,255,255,.75)', 800);
      }
      this.drawPopups(g);
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
    // backdrop
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (view.dark) { sky.addColorStop(0, '#0f172a'); sky.addColorStop(1, '#1e1b4b'); }
    else { sky.addColorStop(0, '#93c5fd'); sky.addColorStop(1, '#e0f2fe'); }
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = view.dark ? '#14532d' : '#4ade80';
    g.beginPath(); g.ellipse(w / 2, h + h * 0.05, w * 0.9, h * 0.16, 0, 0, Math.PI * 2); g.fill();

    g.save();
    const amp = view.reduced ? 0.3 : 1;
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 12 * this.shake * amp, (Math.random() - 0.5) * 12 * this.shake * amp);
    g.translate(ox, oy); g.scale(s, s);
    this.drawTower(g, view);
    // particles
    for (const p of this.parts) {
      if (p.dead) continue;
      if (p.t === 'water') { g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(p.x, p.y, PR * 1.45, 0, 6.283); g.fill(); }
      else if (p.t === 'lava') { g.fillStyle = '#ea580c'; g.beginPath(); g.arc(p.x, p.y, PR * 1.45, 0, 6.283); g.fill(); }
      else if (p.t === 'stone') { g.fillStyle = '#57534e'; g.beginPath(); g.arc(p.x, p.y, PR * 1.35, 0, 6.283); g.fill(); }
    }
    for (const p of this.parts) {
      if (p.dead) continue;
      if (p.t === 'water') { g.fillStyle = '#60a5fa'; g.beginPath(); g.arc(p.x - 1, p.y - 1.5, PR * 0.8, 0, 6.283); g.fill(); }
      else if (p.t === 'lava') { g.fillStyle = (Math.floor(p.x + p.y + this.t * 8) % 3) ? '#f97316' : '#fbbf24'; g.beginPath(); g.arc(p.x, p.y - 1, PR * 0.85, 0, 6.283); g.fill(); }
      else if (p.t === 'stone') { g.fillStyle = '#78716c'; g.beginPath(); g.arc(p.x - 1, p.y - 1, PR * 0.85, 0, 6.283); g.fill(); }
      else if (p.t === 'gold') {
        g.fillStyle = '#b45309'; g.beginPath(); g.arc(p.x, p.y + 0.6, PR * 1.1, 0, 6.283); g.fill();
        g.fillStyle = '#facc15'; g.beginPath(); g.arc(p.x, p.y, PR * 1.02, 0, 6.283); g.fill();
        g.fillStyle = '#fef9c3'; g.fillRect(p.x - 2, p.y - 2.5, 1.6, 1.6);
      }
    }
    for (const r of this.rocks) if (r.alive) this.drawRock(g, r);
    for (const pin of this.pins) if (pin.state !== 'out') this.drawPin(g, pin, view);
    for (const e of this.enemies) this.drawEnemy(g, e);
    this.drawHero(g, this.hero);
    // flying coins
    for (const c of this.coins) {
      const q = 1 - c.life / c.max;
      const x = c.x + (this.hero.x - c.x) * q, y = c.y + (this.hero.y - 40 - c.y) * q - Math.sin(q * Math.PI) * 30;
      g.fillStyle = '#facc15'; g.beginPath(); g.arc(x, y, PR * (1.2 - q * 0.5), 0, 6.283); g.fill();
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
    this.drawPopups(g);
    g.restore();
    this.drawFlash(g, view);
  }
  drawPopups(g) {
    for (const p of this.popups) {
      g.globalAlpha = Math.min(1, p.life * 2);
      label(g, p.text, p.x, p.y, p.big ? 34 : 18, p.color, 'rgba(0,0,0,.6)', 900);
    }
    g.globalAlpha = 1;
  }
  drawFlash(g, view) {
    if (this.flash > 0) { g.fillStyle = `rgba(255,237,213,${this.flash * 0.5})`; g.fillRect(0, 0, view.w, view.h); }
    if (this.preview) { g.fillStyle = view.dark ? 'rgba(0,0,0,.3)' : 'rgba(255,255,255,.1)'; g.fillRect(0, 0, view.w, view.h); }
  }

  drawTower(g, view) {
    const b = this.L.bounds || [40, 40, 320, 600];
    // interior
    g.fillStyle = view.dark ? '#3f2f22' : '#e7c9a0';
    g.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    g.strokeStyle = view.dark ? 'rgba(0,0,0,.25)' : 'rgba(146,98,57,.25)'; g.lineWidth = 1;
    for (let y = b[1] + 16, row = 0; y < b[3]; y += 16, row++) {
      g.beginPath(); g.moveTo(b[0], y); g.lineTo(b[2], y); g.stroke();
      for (let x = b[0] + (row % 2 ? 16 : 0); x < b[2]; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
    }
    // the hero's room glows softly
    const [zx0, zy0, zx1, zy1] = this.zone;
    g.fillStyle = 'rgba(250, 204, 21, .14)'; g.fillRect(zx0, zy0, zx1 - zx0, zy1 - zy0);
    // walls
    g.lineCap = 'round';
    g.strokeStyle = view.dark ? '#57534e' : '#78716c'; g.lineWidth = WALL_T + 3;
    for (const wl of this.walls) { g.beginPath(); g.moveTo(wl.ax, wl.ay); g.lineTo(wl.bx, wl.by); g.stroke(); }
    g.strokeStyle = view.dark ? '#78716c' : '#a8a29e'; g.lineWidth = WALL_T - 3;
    for (const wl of this.walls) { g.beginPath(); g.moveTo(wl.ax, wl.ay); g.lineTo(wl.bx, wl.by); g.stroke(); }
    for (const wl of this.breakables) {
      if (!wl.alive) continue;
      g.strokeStyle = '#78350f'; g.lineWidth = WALL_T + 2; g.beginPath(); g.moveTo(wl.ax, wl.ay); g.lineTo(wl.bx, wl.by); g.stroke();
      g.strokeStyle = '#b45309'; g.lineWidth = WALL_T - 4; g.setLineDash([10, 4]); g.beginPath(); g.moveTo(wl.ax, wl.ay); g.lineTo(wl.bx, wl.by); g.stroke(); g.setLineDash([]);
    }
    g.lineCap = 'butt';
    // roof
    g.fillStyle = view.dark ? '#7f1d1d' : '#dc2626';
    g.beginPath(); g.moveTo(b[0] - 18, b[1] + 2); g.lineTo((b[0] + b[2]) / 2, b[1] - 34); g.lineTo(b[2] + 18, b[1] + 2); g.closePath(); g.fill();
  }

  drawPin(g, pin, view) {
    const [ax, ay, bx, by] = this.pinSeg(pin);
    const hot = pin.i === this.hover;
    g.lineCap = 'round';
    if (hot) { g.strokeStyle = 'rgba(253, 224, 71, .55)'; g.lineWidth = 18; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    g.strokeStyle = '#a16207'; g.lineWidth = 11; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = '#facc15'; g.lineWidth = 7; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = '#fef08a'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax - pin.dy * 1.5, ay + pin.dx * 1.5); g.lineTo(bx - pin.dy * 1.5, by + pin.dx * 1.5); g.stroke();
    // ring handle
    const hx = bx + pin.dx * 12, hy = by + pin.dy * 12;
    g.strokeStyle = '#a16207'; g.lineWidth = 7; g.beginPath(); g.arc(hx, hy, 10, 0, 6.283); g.stroke();
    g.strokeStyle = '#facc15'; g.lineWidth = 4; g.beginPath(); g.arc(hx, hy, 10, 0, 6.283); g.stroke();
    g.lineCap = 'butt';
    if (pin.state === 'in') {
      const pulse = (Math.sin(this.t * 4 + pin.i) + 1) / 2;
      g.fillStyle = `rgba(255,255,255,${0.15 + pulse * 0.2})`; g.beginPath(); g.arc(hx, hy, 6, 0, 6.283); g.fill();
      label(g, String(pin.i + 1), hx, hy + 0.5, 10, '#422006', 'rgba(255,255,255,.7)', 800);
    }
  }

  drawHero(g, b) {
    const x = b.x, feet = b.y + b.r;
    const bob = b.mood === 'happy' ? -Math.abs(Math.sin(this.t * 10)) * 6 : Math.sin(this.t * 2) * 1;
    const burnt = b.dead && b.cause === 'lava';
    const y = feet + bob;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x, feet, 14, 4, 0, 0, 6.283); g.fill();
    // legs
    g.fillStyle = burnt ? '#1c1917' : '#1e3a8a';
    g.fillRect(x - 9, y - 16, 7, 16); g.fillRect(x + 2, y - 16, 7, 16);
    // body
    g.fillStyle = burnt ? '#292524' : '#2563eb'; roundRect(g, x - 12, y - 36, 24, 22, 6); g.fill();
    g.fillStyle = burnt ? '#292524' : '#facc15'; g.fillRect(x - 12, y - 20, 24, 4);
    // arms
    g.strokeStyle = burnt ? '#1c1917' : '#fcd9b6'; g.lineWidth = 5; g.lineCap = 'round';
    const up = b.mood === 'happy' || (b.dead && !burnt);
    g.beginPath();
    g.moveTo(x - 11, y - 32); g.lineTo(x - 18, up ? y - 46 : y - 20);
    g.moveTo(x + 11, y - 32); g.lineTo(x + 18, up ? y - 46 : y - 20);
    g.stroke(); g.lineCap = 'butt';
    // head
    g.fillStyle = burnt ? '#292524' : '#fcd9b6'; g.beginPath(); g.arc(x, y - 46, 11, 0, 6.283); g.fill();
    g.fillStyle = burnt ? '#0c0a09' : '#f59e0b'; g.beginPath(); g.arc(x, y - 50, 11, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    // face
    g.strokeStyle = '#1f2937'; g.fillStyle = '#1f2937'; g.lineWidth = 1.6;
    if (b.dead) {
      for (const ex of [-4, 4]) { g.beginPath(); g.moveTo(x + ex - 2.5, y - 49); g.lineTo(x + ex + 2.5, y - 44); g.moveTo(x + ex + 2.5, y - 49); g.lineTo(x + ex - 2.5, y - 44); g.stroke(); }
      g.beginPath(); g.arc(x, y - 38, 3, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    } else {
      g.beginPath(); g.arc(x - 4, y - 47, 1.6, 0, 6.283); g.arc(x + 4, y - 47, 1.6, 0, 6.283); g.fill();
      const danger = this.danger();
      if (b.mood === 'happy') { g.beginPath(); g.arc(x, y - 43, 4, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
      else if (danger) { g.beginPath(); g.ellipse(x, y - 40, 2.5, 3.2, 0, 0, 6.283); g.stroke(); this.sweat(g, x + 11, y - 52); }
      else { g.beginPath(); g.moveTo(x - 3, y - 41); g.lineTo(x + 3, y - 41); g.stroke(); }
    }
  }
  sweat(g, x, y) { g.fillStyle = '#7dd3fc'; g.beginPath(); g.ellipse(x, y + Math.sin(this.t * 6) * 1.5, 2, 3, 0, 0, 6.283); g.fill(); }
  /** Lava or an enemy close to the hero: the face turns scared. */
  danger() {
    const h = this.hero;
    if (this.enemies.some((e) => !e.dead && Math.hypot(e.x - h.x, e.y - h.y) < 110)) return true;
    for (const p of this.parts) if (!p.dead && p.t === 'lava' && Math.abs(p.x - h.x) < 70 && Math.abs(p.y - h.y) < 110) return true;
    return false;
  }

  drawEnemy(g, e) {
    if (e.dead && e.deathT > 0.6) return;
    const x = e.x, feet = e.y + e.r;
    g.globalAlpha = e.dead ? Math.max(0, 1 - e.deathT / 0.6) : 1;
    const burnt = e.dead && e.cause === 'lava';
    const squash = e.dead && e.cause === 'boulder' ? 0.35 : 1;
    g.save(); g.translate(x, feet); g.scale(1, squash);
    const y = Math.sin(this.t * 3 + x) * 1.2;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(0, 0, 14, 4, 0, 0, 6.283); g.fill();
    g.fillStyle = burnt ? '#1c1917' : '#3f6212'; g.fillRect(-9, y - 14, 7, 14); g.fillRect(2, y - 14, 7, 14);
    g.fillStyle = burnt ? '#292524' : '#7c2d12'; roundRect(g, -13, y - 32, 26, 20, 6); g.fill();
    g.fillStyle = burnt ? '#292524' : '#65a30d'; g.beginPath(); g.arc(0, y - 40, 12, 0, 6.283); g.fill();
    // ears
    g.beginPath(); g.moveTo(-10, y - 44); g.lineTo(-20, y - 50); g.lineTo(-9, y - 38); g.moveTo(10, y - 44); g.lineTo(20, y - 50); g.lineTo(9, y - 38); g.fill();
    g.fillStyle = '#fef08a'; g.fillRect(-6, y - 43, 4, 3); g.fillRect(2, y - 43, 4, 3);
    g.fillStyle = '#7f1d1d'; g.fillRect(-4, y - 35, 8, 2);
    // club
    g.strokeStyle = '#78350f'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(13, y - 26); g.lineTo(20, y - 46); g.stroke(); g.lineCap = 'butt';
    g.restore();
    g.globalAlpha = 1;
  }

  drawRock(g, r) {
    g.save(); g.translate(r.x, r.y); g.rotate(r.rot);
    if (r.kind === 'boulder') {
      g.fillStyle = '#57534e'; g.beginPath(); g.arc(0, 0, r.r, 0, 6.283); g.fill();
      g.fillStyle = '#78716c'; g.beginPath(); g.arc(-4, -5, r.r * 0.7, 0, 6.283); g.fill();
      g.strokeStyle = '#44403c'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 2); g.lineTo(2, 6); g.lineTo(8, 0); g.stroke();
    } else {
      g.fillStyle = '#18181b'; g.beginPath(); g.arc(0, 0, r.r, 0, 6.283); g.fill();
      g.fillStyle = '#52525b'; g.beginPath(); g.arc(-4, -4, 4, 0, 6.283); g.fill();
      g.strokeStyle = '#a16207'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -r.r); g.quadraticCurveTo(6, -r.r - 8, 2, -r.r - 12); g.stroke();
      g.fillStyle = (Math.floor(this.t * 12) % 2) ? '#fde047' : '#f97316'; g.beginPath(); g.arc(2, -r.r - 13, 3, 0, 6.283); g.fill();
    }
    g.restore();
  }
}

export const pinRescue = {
  id: 'pin-rescue',
  title: 'Pin Rescue',
  tagline: 'Pull the pins in the right order: gold to the hero, lava and enemies anywhere else.',
  howTo: 'Tap or click a pin to pull it (keys 1–9 work too). Water turns lava into stone, lava melts gold and burns enemies, bombs explode in lava. Esc pauses, R restarts.',
  credit: 'A fan-made take on the "pull the pin" ads for Homescapes and Hero Wars, built like the ads, not the real games. Not affiliated with their publishers.',
  levels: LEVELS,
  art: new URL('../../games-assets/k-pin-rescue.webp', import.meta.url).href,
  create: (i, env) => new PinRescueSession(i, env),
  view3d: () => import('./pin-rescue-3d.js'),
};
