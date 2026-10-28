/**
 * Bounce Brigade — toy tank duels. Captain Hazel's little fern-green tank at the Peace Tournament of Concordia in walled
 * arenas: shells ricochet off walls, shells cancel each other, mines blast crates and tanks. Every enemy colour has
 * its own habit (sits and waits, prowls, fires rockets, lays mines, banks shots off two walls, turns invisible …),
 * each world adds a floor (pits, ice, lava vents) and ends with a boss.
 *
 * One hit ends a tank (bosses take several). The simulation is plain data + update(dt), deterministic per level
 * (seeded), so test/unit/games/tanks.test.mjs plays every level with a bot. Coordinates: the arena is a grid of
 * W × H unit tiles, x to the right, y down the screen; the 3D view (tanks-3d.js) maps (x, y) to three (x − W/2, 0,
 * y − H/2).
 */
import { clamp, rng, label, roundRect } from './core.js';
import { LEVELS, WORLDS, W, H, T } from './tanks-levels.js';
import { TouchPad, MOVE_R, MOVE_DEAD } from './tanks-touch.js';

const TAU = Math.PI * 2;
export const TANK_R = 0.36;
const BARREL = 0.62, SHELL_R = 0.09, MINE_R = 0.22, BLAST_R = 1.7, MINE_FUSE = 9, MINE_ARM = 0.8, TRIGGER_R = 1.15;
const READY = 1.4; // the countdown before anything moves
const GRACE = 1.8; // after GO, a moment before the first enemy shell (time to look around)
const PLAYER = { speed: 3.0, turn: 8, turret: 14, cd: 0.16, maxShells: 5, maxMines: 2, shell: 6.2, bounces: 1 };

/**
 * Enemy tank types. move: 0 stays, 1 slow, 2 normal, 3 fast · keep: preferred path distance to the player ·
 * shell speed (rockets ≥ 9) · bounces · shots alive at once · cd (s) · err: aim error (rad) · react: delay before the
 * first shot after it sees you · bank: also searches ricochet shots · mines: lays mines · dodge · ghost: invisible.
 */
export const TYPES = {
  rookie: { name: 'Rookie', color: 0x9a6b3c, css: '#9a6b3c', move: 0, shell: 4.6, bounces: 1, shells: 1, cd: 2.6, err: 0.1, react: 1.0, turret: 1.6, score: 100 },
  scout: { name: 'Scout', color: 0x8b95a5, css: '#8b95a5', move: 1, keep: 6, shell: 4.8, bounces: 1, shells: 1, cd: 2.2, err: 0.08, react: 0.9, turret: 2.2, dodge: 0.5, score: 150 },
  zip: { name: 'Zipper', color: 0x14b8a6, css: '#14b8a6', move: 1, keep: 7, shell: 8.2, bounces: 0, shells: 1, cd: 2.4, err: 0.05, react: 1.0, turret: 2.6, dodge: 0.6, score: 200 },
  miner: { name: 'Miner', color: 0xeab308, css: '#eab308', move: 3, keep: 6, shell: 4.8, bounces: 1, shells: 1, cd: 3.0, err: 0.14, react: 1.2, turret: 2.4, mines: 2, dodge: 0.8, score: 200 },
  banker: { name: 'Banker', color: 0x16a34a, css: '#16a34a', move: 0, shell: 8.5, bounces: 2, shells: 1, cd: 2.2, err: 0.025, react: 1.1, turret: 2.0, bank: true, score: 300 },
  swarm: { name: 'Swarmer', color: 0x9333ea, css: '#9333ea', move: 2, keep: 5, shell: 5.0, bounces: 1, shells: 3, cd: 0.75, err: 0.12, react: 0.9, turret: 3.2, dodge: 0.7, score: 300 },
  ghost: { name: 'Ghost', color: 0xe2e8f0, css: '#e2e8f0', move: 2, keep: 6, shell: 5.2, bounces: 1, shells: 2, cd: 1.6, err: 0.07, react: 1.0, turret: 2.6, mines: 1, ghost: true, dodge: 0.6, bank: true, score: 400 },
  ace: { name: 'Ace', color: 0x1e293b, css: '#1e293b', move: 3, keep: 6, shell: 8.2, bounces: 0, shells: 2, cd: 1.3, err: 0.04, react: 0.9, turret: 3.6, dodge: 1, score: 500 },
};
export const TYPE_KEYS = Object.keys(TYPES);
export const CLUBS = { rookie: 'Fernhaven Juniors', scout: 'Scout Club', zip: 'Orvan Youth', miner: 'Fossil Mine Dwarfs', banker: 'Firnwatch Observatory', swarm: 'Violet Club', ghost: 'Granny Grausel', ace: 'Teshka Vonn' };
const MOVE_SPEED = [0, 1.35, 2.1, 2.9];

/** Bosses: big tanks (2 × 2 tiles) with several hit points and one signature attack each, always telegraphed. */
export const BOSSES = {
  klonk: { name: 'GANTER’S PARADE TOY', hp: 12, r: 0.85, move: 1.0, shell: 4.6, bounces: 1, cd: 2.6, score: 3000, model: 'TOY_GANTER_PARADE_TANK' },
  drill: { name: 'QUOTA’S TOY DRILL', hp: 14, r: 0.85, move: 1.2, shell: 9, bounces: 0, cd: 2.4, score: 3500, model: 'TOY_QUOTA' },
  walker: { name: 'BRIGADIER’S FROST TOY', hp: 16, r: 0.85, move: 0.9, shell: 5.6, bounces: 2, cd: 2.4, score: 4000, model: 'TOY_BRIGADIER' },
  mothership: { name: 'EQUALITY’S MODULE TOY', hp: 18, r: 0.95, move: 1.4, shell: 5.4, bounces: 1, cd: 2.2, score: 5000, model: 'TOY_EQUALITY', fly: true },
};

const solidT = (t) => t === T.WALL || t === T.CRATE || t === T.PIT; // blocks tanks
const solidS = (t) => t === T.WALL || t === T.CRATE;                 // blocks shells (they fly over pits)

export class TankSession {
  constructor(levelIndex, env = {}) {
    this.index = levelIndex;
    const L = (this.L = LEVELS[levelIndex]);
    this.W = WORLDS[L.world];
    this.sound = env.sound || { play() {} };
    this.preview = !!env.preview;
    this.rand = rng(L.seed);
    this.hint = L.hint;
    this.t = 0; this.result = null; this.score = 0; this.kills = 0; this.shots = 0;
    this.grid = new Uint8Array(W * H);
    this.grid.set(L.grid);
    this.rev = 0; // bumps when a crate breaks (the 3D view rebuilds its blocks)
    this.tanks = []; this.shells = []; this.mines = []; this.fx = []; this.marks = []; this.events = []; this.warn = [];
    this.vents = L.vents.map(([x, y], i) => ({ x, y, phase: (i * 1.7) % 6, state: 0, k: 0 }));
    this.ids = 1;
    this.player = this.addTank({ team: 0, x: L.player[0] + 0.5, y: L.player[1] + 0.5, type: null });
    this.player.ang = this.player.aim = -Math.PI / 2;
    this.player.cd = 0;
    for (const [type, x, y] of L.enemies) this.addTank({ team: 1, x: x + 0.5, y: y + 0.5, type });
    if (L.boss) {
      const b = this.addTank({ team: 1, x: L.boss[0], y: L.boss[1], type: null, boss: L.boss[2] });
      this.boss = b;
    }
    this.total = this.tanks.length - 1;
    // input
    this.keys = { u: false, d: false, l: false, r: false };
    this.mouse = null; this.aimAt = null; this.fireQueued = false; this.mineQueued = false;
    this.botMove = null; this.botAim = null;
    // touch: twin sticks and the mine button (tanks-touch.js); aimAng is an arena angle the turret holds (touch aims
    // by direction, the mouse by a point)
    this.pad = new TouchPad(this); this.aimAng = null; this.mineDenied = 0; this.fireDenied = 0;
    this.touchMode = !this.preview && !!globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
    this.gridW = W; this.gridH = H; this.readyT = READY; this.maxShells = PLAYER.maxShells; this.maxMines = PLAYER.maxMines;
    // path distances to the player (enemy steering) and to mines (danger)
    this.dist = new Int16Array(W * H); this.distT = 0;
    this.queue = new Int32Array(W * H);
  }

  addTank({ team, x, y, type, boss }) {
    const def = boss ? BOSSES[boss] : type ? TYPES[type] : null;
    const tk = {
      id: this.ids++, team, type, boss: boss || null, def, x, y, vx: 0, vy: 0,
      ang: team ? Math.PI / 2 : -Math.PI / 2, aim: team ? Math.PI / 2 : -Math.PI / 2, r: boss ? def.r : TANK_R,
      alive: true, cd: 0.6 + (this.rand ? this.rand() : 0) * 0.8, live: 0, minesLive: 0, hp: boss ? def.hp : 1, maxHp: boss ? def.hp : 1,
      tread: 0, visualTravel: 0, recoil: 0, flash: 0, moving: 0,
      shotAt: -Infinity, hitAt: -Infinity, mineAt: -Infinity, disabledAt: Infinity, underAt: -Infinity, surfaceAt: -Infinity, shotSerial: 0,
      // AI
      wx: x, wy: y, think: 0, aimT: 0, want: null, seen: 0, mineCd: 3, dodgeT: 0, scan: (this.rand ? this.rand() : 0) * TAU,
      special: 4, phase: 0, under: false, spawned: 0, hidden: false, charge: 0,
    };
    this.tanks.push(tk);
    return tk;
  }

  // ── grid helpers ──
  tile(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return T.WALL;
    return this.grid[ty * W + tx];
  }
  floorAt(x, y) { const t = this.tile(x, y); return t; }

  // ── input ──
  pointer(type, x, y, e = {}) {
    if (this.result) { this.pad.reset(); return; }
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || !e.pointerType) {
      this.touchMode = false; this.aimAng = null; this.pad.reset();
      const w = this.screenPoint(x, y);
      if (w) this.aimAt = w;
      if (type === 'down') { if (e.button === 2) this.mineQueued = true; else this.fireQueued = true; }
      return;
    }
    // touch: tanks-touch.js sorts thumbs into the move stick, the aim stick, the mine button and taps
    this.touchMode = true; this.aimAt = null;
    const id = e.pointerId ?? 1, now = e.timeStamp || performance.now();
    if (type === 'down') this.pad.down(x, y, id, now);
    else if (type === 'move') this.pad.moveTo(x, y, id);
    else this.pad.up(x, y, id, e.type === 'pointercancel', now);
  }
  /** Screen point (CSS px on the canvas) → arena point at turret height, or null above the horizon. */
  screenPoint(x, y) {
    const w = this.unproj ? this.unproj(x, y) : this.screenToWorld(x, y);
    return w ? { x: w.x, y: w.y } : null;
  }
  /** A direction on screen (from the tank) → the arena angle it points along (the camera is tilted, maybe turned). */
  screenAngle(dx, dy) {
    const d = Math.hypot(dx, dy); if (d < 1e-6) return null;
    const p = this.player, q = this.proj(p.x, p.y, 0.3), sx = q.x + (dx / d) * 80, sy = q.y + (dy / d) * 80;
    const w = this.screenPoint(sx, sy);
    return w ? Math.atan2(w.y - p.y, w.x - p.x) : null;
  }
  /** Where to aim at an enemy tank: ahead of it by the shell's travel time (as the enemies aim at you). */
  leadAt(e) {
    const p = this.player, t = Math.hypot(e.x - p.x, e.y - p.y) / PLAYER.shell;
    return Math.atan2(e.y + e.vy * t * 0.8 - p.y, e.x + e.vx * t * 0.8 - p.x);
  }
  /** Visible enemies the turret could hit straight on: [{ e, ang }]. */
  cleanShots() {
    const p = this.player, out = [];
    for (const e of this.tanks) {
      if (e.team !== 1 || !e.alive || e.under || (e.def?.ghost && !this.ghostVisible(e))) continue;
      const ang = this.leadAt(e);
      if (this.traceShot(p, ang, 0, PLAYER.shell, 24).hit === e) out.push({ e, ang });
    }
    return out;
  }
  /** Aim help for a thumb: within ~3° of a clean straight shot at an enemy, the stick settles on it. */
  magnet(ang) {
    let best = ang, bd = 0.055;
    for (const c of this.cleanShots()) { const d = Math.abs(angDiff(c.ang, ang)); if (d < bd) { bd = d; best = c.ang; } }
    return best;
  }
  fireStick(dx, dy) { const a = this.screenAngle(dx, dy); if (a != null) { this.aimAng = this.magnet(a); this.fireQueued = true; } }
  /** A tap on the arena fires at that spot; a tap close to an enemy tank fires at the tank. */
  tapFire(x, y) {
    const w = this.screenPoint(x, y), p = this.player; if (!w) return;
    let ang = Math.atan2(w.y - p.y, w.x - p.x), bd = 1.15;
    for (const e of this.tanks) {
      if (e.team !== 1 || !e.alive || e.under || (e.def?.ghost && !this.ghostVisible(e))) continue;
      const d = Math.hypot(e.x - w.x, e.y - w.y) - e.r;
      if (d < bd) { bd = d; ang = this.leadAt(e); }
    }
    this.aimAng = ang; this.fireQueued = true;
  }
  /** A tap beside the arena: the nearest enemy in a clear straight line, else along the turret. */
  quickFire() {
    const p = this.player;
    const c = this.cleanShots().sort((a, b) => Math.hypot(a.e.x - p.x, a.e.y - p.y) - Math.hypot(b.e.x - p.x, b.e.y - p.y))[0];
    this.aimAng = c ? c.ang : p.aim; this.fireQueued = true;
  }
  /** A short buzz on phones that have one (Android; iOS Safari has no vibration API). Touch play only. */
  buzz(pattern) {
    if (!this.touchMode || this.preview) return;
    try { globalThis.navigator?.vibrate?.(pattern); } catch { /* not allowed before the first tap */ }
  }
  shellsReady() { return PLAYER.maxShells - this.player.live; }
  /** The player's live mines, fuse left as 0..1, soonest first (the mine button's cooldown pips). */
  ownMineFuses() { return this.mines.filter((m) => m.alive && m.owner === this.player.id).map((m) => clamp(m.fuse / MINE_FUSE, 0, 1)).sort((a, b) => a - b); }
  key(code, down) {
    const k = this.keys;
    switch (code) {
      case 'ArrowUp': case 'KeyW': k.u = down; return true;
      case 'ArrowDown': case 'KeyS': k.d = down; return true;
      case 'ArrowLeft': case 'KeyA': k.l = down; return true;
      case 'ArrowRight': case 'KeyD': k.r = down; return true;
      case 'Space': case 'Enter': if (down) this.fireQueued = true; return true;
      case 'KeyE': case 'KeyQ': case 'ShiftLeft': case 'ShiftRight': if (down) this.mineQueued = true; return true;
      default: return false;
    }
  }
  /** Bots and tests steer with these. */
  setMove(mx, my) { if (mx == null) this.botMove = null; else this.botMove = { x: mx, y: my }; }
  setAim(x, y) { this.aimAt = { x, y }; }
  fire() { this.fireQueued = true; }
  layMine() { this.mineQueued = true; }

  readMove() {
    if (this.botMove) return this.botMove;
    let mx = 0, my = 0;
    const st = this.pad.move;
    if (st) {
      // radial dead zone, then full speed at 4/5 of the knob's travel; screen directions map onto the arena below
      const dx = st.x - st.x0, dy = st.y - st.y0, d = Math.hypot(dx, dy);
      if (d > MOVE_DEAD) { const m = Math.min(1, (d - MOVE_DEAD) / (MOVE_R * 0.8 - MOVE_DEAD)); mx = (dx / d) * m; my = (dy / d) * m; }
    } else {
      const k = this.keys;
      mx = (k.r ? 1 : 0) - (k.l ? 1 : 0); my = (k.d ? 1 : 0) - (k.u ? 1 : 0);
      const d = Math.hypot(mx, my); if (d > 1) { mx /= d; my /= d; }
    }
    if (this.dirFn && (mx || my)) { const w = this.dirFn(mx, my); return { x: w.x, y: w.y }; }
    return { x: mx, y: my };
  }

  hud() {
    const left = this.tanks.filter((t) => t.team === 1 && t.alive).length;
    return { progress: 1 - left / Math.max(1, this.total), score: this.score, label: 'Score' };
  }

  // ── simulation ──
  update(dt) {
    this.t += dt;
    this.updateFx(dt);
    if (this.result) { for (const s of this.shells) this.moveShell(s, dt); this.shells = this.shells.filter((s) => s.alive); return; }
    if (this.t < READY) { this.fireQueued = false; this.mineQueued = false; return; }
    this.distT -= dt;
    if (this.distT <= 0) { this.distT = 0.3; this.computeDist(); }
    this.updateVents(dt);
    for (const tk of this.tanks) {
      if (!tk.alive) continue;
      tk.cd -= dt; tk.mineCd -= dt; tk.flash = Math.max(0, tk.flash - dt); tk.armour = Math.max(0, (tk.armour || 0) - dt); tk.recoil = Math.max(0, tk.recoil - dt * 4);
      if (tk.team === 0) this.updatePlayer(tk, dt);
      else if (tk.boss) this.updateBoss(tk, dt);
      else this.updateEnemy(tk, dt);
    }
    this.separate();
    for (const s of this.shells) this.moveShell(s, dt);
    this.shellsVsShells();
    this.shells = this.shells.filter((s) => s.alive);
    this.updateMines(dt);
    this.updateWarnings(dt);
    // the end
    if (!this.player.alive) this.end(false, this.loseReason || 'Your tank was hit');
    else if (this.tanks.every((t) => t.team === 0 || !t.alive)) this.end(true);
  }

  end(won, reason = '') {
    if (this.result) return;
    const par = this.L.par;
    const stars = !won ? 0 : this.t <= par ? 3 : this.t <= par * 1.8 ? 2 : 1;
    if (won) this.score += Math.max(0, Math.round((par * 1.8 - this.t) * 20));
    this.result = { won, stars, score: this.score, reason: won ? (stars === 3 ? `All tanks down in ${Math.round(this.t)} s` : `Cleared in ${Math.round(this.t)} s · 3 ★ under ${par} s`) : reason, stats: { kills: this.kills, shots: this.shots } };
    this.sound.play(won ? 'good' : 'bad');
  }

  updatePlayer(tk, dt) {
    const m = this.readMove();
    this.drive(tk, m.x, m.y, PLAYER.speed, PLAYER.turn, dt);
    this.mineDenied = Math.max(0, this.mineDenied - dt); this.fireDenied = Math.max(0, this.fireDenied - dt);
    // turret: the aim stick while it is pulled (and the angle it last fired along, held), else the cursor or the last
    // click, else the keys alone aim along the hull
    const pull = this.pad.aimVector();
    if (pull) { const a = this.screenAngle(pull[0], pull[1]); if (a != null) this.aimAng = this.magnet(a); }
    let want = tk.aim;
    if (this.aimAng != null) want = this.aimAng;
    else if (this.aimAt) want = Math.atan2(this.aimAt.y - tk.y, this.aimAt.x - tk.x);
    else if (m.x || m.y) want = Math.atan2(m.y, m.x);
    tk.aim = turnTo(tk.aim, want, PLAYER.turret * dt);
    if (this.fireQueued) {
      // a click during the short reload is kept for a moment, not lost
      this.fireAge = (this.fireAge || 0) + dt;
      if (this.aimAt || this.aimAng != null) tk.aim = want; // a click fires where it points, even before the turret caught up
      if (tk.live < PLAYER.maxShells && tk.cd <= 0) { this.fireShell(tk, tk.aim, PLAYER.shell, PLAYER.bounces); tk.cd = PLAYER.cd; this.fireQueued = false; this.fireAge = 0; }
      else if (this.fireAge > 0.25 || tk.live >= PLAYER.maxShells) {
        if (tk.live >= PLAYER.maxShells) { this.fireDenied = 0.4; this.buzz([8, 50, 8]); }
        this.fireQueued = false; this.fireAge = 0;
      }
    }
    if (this.mineQueued) {
      this.mineQueued = false;
      if (tk.minesLive < PLAYER.maxMines && !this.mines.some((mi) => Math.hypot(mi.x - tk.x, mi.y - tk.y) < 0.9)) { this.layMineAt(tk); this.buzz(25); }
      else { this.mineDenied = 0.45; this.buzz([8, 50, 8]); }
    }
  }

  /** Tank drive: the hull turns towards the stick (or drives backwards when that is the shorter way), then rolls. */
  drive(tk, mx, my, speed, turn, dt) {
    const mag = Math.hypot(mx, my);
    const ice = this.tile(tk.x, tk.y) === T.ICE;
    let tvx = 0, tvy = 0;
    if (mag > 0.05) {
      const want = Math.atan2(my, mx);
      let d = angDiff(want, tk.ang);
      let back = false;
      if (Math.abs(d) > Math.PI / 2 + 0.1) { d = angDiff(want + Math.PI, tk.ang); back = true; }
      tk.ang += clamp(d, -turn * dt, turn * dt);
      const align = Math.max(0, Math.cos(angDiff(back ? want + Math.PI : want, tk.ang)));
      const v = speed * Math.min(1, mag) * (align > 0.85 ? 1 : align * align * 0.6);
      tvx = Math.cos(tk.ang) * v * (back ? -1 : 1); tvy = Math.sin(tk.ang) * v * (back ? -1 : 1);
    }
    // ice: the hull keeps sliding and only slowly takes the new direction
    const k = ice ? 1 - Math.exp(-dt * 1.6) : 1 - Math.exp(-dt * 18);
    tk.vx += (tvx - tk.vx) * k; tk.vy += (tvy - tk.vy) * k;
    const beforeX=tk.x,beforeY=tk.y;
    tk.x += tk.vx * dt; tk.y += tk.vy * dt;
    const sp = Math.hypot(tk.vx, tk.vy);
    tk.moving = sp; tk.tread += sp * dt;
    this.collideGrid(tk);
    tk.visualTravel += (tk.x-beforeX)*Math.cos(tk.ang)+(tk.y-beforeY)*Math.sin(tk.ang);
    if (sp > 0.4 && (this.marks.length === 0 || Math.hypot(this.marks[this.marks.length - 1].x - tk.x, this.marks[this.marks.length - 1].y - tk.y) > 0.32 || this.marks[this.marks.length - 1].id !== tk.id)) {
      // tread marks (the only thing a ghost tank leaves visible)
      const last = this.lastMark?.[tk.id];
      if (!last || Math.hypot(last.x - tk.x, last.y - tk.y) > 0.3) {
        const mk = { id: tk.id, x: tk.x, y: tk.y, ang: tk.ang, life: 10 };
        this.marks.push(mk); (this.lastMark = this.lastMark || {})[tk.id] = mk;
        if (this.marks.length > 360) this.marks.shift();
      }
    }
  }

  collideGrid(tk) {
    if (tk.boss && tk.def.fly) { tk.x = clamp(tk.x, tk.r, W - tk.r); tk.y = clamp(tk.y, tk.r, H - tk.r); return; }
    const r = tk.r;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor(tk.x - r), x1 = Math.floor(tk.x + r), y0 = Math.floor(tk.y - r), y1 = Math.floor(tk.y + r);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const t = tx < 0 || ty < 0 || tx >= W || ty >= H ? T.WALL : this.grid[ty * W + tx];
        if (!solidT(t)) continue;
        const cx = clamp(tk.x, tx, tx + 1), cy = clamp(tk.y, ty, ty + 1);
        let dx = tk.x - cx, dy = tk.y - cy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d < 1e-6) { dx = tk.x - (tx + 0.5); dy = tk.y - (ty + 0.5); d = Math.hypot(dx, dy) || 1; }
        const push = r - d;
        tk.x += (dx / d) * push; tk.y += (dy / d) * push;
        // sliding along the wall: drop the velocity into it
        const nx = dx / d, ny = dy / d, vn = tk.vx * nx + tk.vy * ny;
        if (vn < 0) { tk.vx -= vn * nx; tk.vy -= vn * ny; }
      }
    }
  }

  separate() {
    const ts = this.tanks;
    for (let i = 0; i < ts.length; i++) {
      const a = ts[i]; if (!a.alive || a.under) continue;
      for (let j = i + 1; j < ts.length; j++) {
        const b = ts[j]; if (!b.alive || b.under || (a.def?.fly) || (b.def?.fly)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min || d < 1e-6) continue;
        const p = (min - d) / 2, nx = dx / d, ny = dy / d;
        const wa = a.boss ? 0.15 : b.boss ? 1.85 : 1, wb = 2 - wa;
        a.x -= nx * p * wa; a.y -= ny * p * wa; b.x += nx * p * wb; b.y += ny * p * wb;
        this.collideGrid(a); this.collideGrid(b);
      }
    }
  }

  fireShell(tk, ang, speed, bounces, { x = tk.x, y = tk.y, kind = speed >= 8 ? 1 : 0 } = {}) {
    const renderFrom = this.visualMuzzle?.(tk, ang) ?? null;
    const s = { renderFrom, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed, bounces, owner: tk.id, team: tk.team, age: 0, alive: true, kind, trail: 0 };
    // the shell leaves from the muzzle; a muzzle inside a wall bounces it straight away
    this.moveShell(s, (tk.boss ? tk.r + 0.2 : BARREL) / speed, true);
    if (!s.alive) { this.puff(s.x, s.y, 0.6); return null; }
    this.shells.push(s);
    tk.live++; tk.recoil = 1; tk.shotAt = this.t; tk.shotSerial++; this.shots += tk.team === 0 ? 1 : 0;
    this.events.push({ e: 'shot', x: s.x, y: s.y, ang, team: tk.team });
    if (tk.team === 0) this.buzz(8);
    this.sound.play('shot', 40);
    return s;
  }

  moveShell(s, dt, launch = false) {
    if (!s.alive) return;
    s.age += launch ? 0 : dt;
    let left = s.speed * dt;
    while (left > 1e-6 && s.alive) {
      const step = Math.min(0.1, left); left -= step;
      const h = step / s.speed;
      const nx = s.x + s.vx * h, ny = s.y + s.vy * h;
      if (solidS(this.tile(nx, ny))) {
        let hx = solidS(this.tile(nx, s.y)), hy = solidS(this.tile(s.x, ny));
        if (!hx && !hy) hx = hy = true;
        if (hx) s.vx = -s.vx; if (hy) s.vy = -s.vy;
        s.bounces--; s.renderFrom = null; // A ricochet immediately ends the cosmetic muzzle-to-path join.
        if (s.bounces < 0) { this.killShell(s, true); return; }
        this.events.push({ e: 'bounce', x: s.x, y: s.y });
        if (!launch) this.sound.play('hit', 30);
        continue;
      }
      s.x = nx; s.y = ny;
      if (launch) continue;
      // tanks
      for (const tk of this.tanks) {
        if (!tk.alive || tk.under) continue;
        if (tk.id === s.owner && s.age < 0.25) continue;
        const rr = tk.r + SHELL_R;
        if ((tk.x - s.x) ** 2 + (tk.y - s.y) ** 2 < rr * rr) { this.hitTank(tk, s); this.killShell(s, false); return; }
      }
      // mines
      for (const m of this.mines) {
        if (m.alive && (m.x - s.x) ** 2 + (m.y - s.y) ** 2 < (MINE_R + SHELL_R) ** 2) { this.killShell(s, false); this.detonate(m); return; }
      }
    }
  }
  killShell(s, puff) {
    if (!s.alive) return;
    s.alive = false;
    const o = this.tanks.find((t) => t.id === s.owner); if (o) o.live = Math.max(0, o.live - 1);
    if (puff) this.puff(s.x, s.y, 0.5);
  }
  shellsVsShells() {
    const a = this.shells;
    for (let i = 0; i < a.length; i++) {
      const s = a[i]; if (!s.alive) continue;
      for (let j = i + 1; j < a.length; j++) {
        const q = a[j]; if (!q.alive) continue;
        if ((s.x - q.x) ** 2 + (s.y - q.y) ** 2 < 0.24 * 0.24) {
          this.killShell(s, false); this.killShell(q, false);
          this.spark(s.x / 2 + q.x / 2, s.y / 2 + q.y / 2);
          this.sound.play('pin', 60);
          break;
        }
      }
    }
  }

  hitTank(tk, src) {
    if (!tk.alive || tk.under) return;
    // a boss's armour rings after every hit: for a moment more shells just clank off
    if (tk.boss && tk.armour > 0) { this.spark(tk.x, tk.y); this.sound.play('hit', 50); return; }
    tk.hp -= src?.blast ? 3 : 1; tk.flash = 0.25; tk.hitAt = this.t;
    if (tk.boss) tk.armour = 1.1;
    if (tk.hp > 0) { this.spark(tk.x, tk.y); this.sound.play('hit'); return; }
    tk.alive = false; tk.disabledAt = this.t;
    this.events.push({ e: 'kill', x: tk.x, y: tk.y, id: tk.id, boss: !!tk.boss });
    this.fx.push({ kind: 'boom', x: tk.x, y: tk.y, t: 0, max: tk.boss ? 1.4 : 0.9, r: tk.boss ? 2.2 : 1.2 });
    this.wrecks = this.wrecks || []; this.wrecks.push({ x: tk.x, y: tk.y, ang: tk.ang, type: tk.type, boss: tk.boss, team: tk.team });
    this.sound.play(tk.boss ? 'boom' : 'kill');
    this.buzz(tk.team === 0 ? [70, 40, 140] : 30);
    if (tk.team === 1) {
      this.kills++; this.score += tk.def.score;
      this.fx.push({ kind: 'pop', x: tk.x, y: tk.y, t: 0, max: 1, text: `+${tk.def.score}` });
    } else {
      const o = src && src.owner ? this.tanks.find((t) => t.id === src.owner) : null;
      this.killer = { by: o ? (o.boss || o.type || 'self') : src?.blast ? 'blast' : src?.lava ? 'lava' : src?.beam ? 'beam' : '?', kind: src?.kind, age: src?.age, bounces: src?.bounces, dist: o ? Math.hypot(o.x - tk.x, o.y - tk.y) : 0, t: this.t };
      this.loseReason = src?.blast ? (src.own ? 'Caught in your own mine blast' : 'Caught in a mine blast') : src?.lava ? 'The toy lava bumper caught you' : src?.owner === tk.id ? 'Your own shell bounced back' : 'Your tank was hit';
    }
  }

  layMineAt(tk) {
    tk.mineAt = this.t;
    const renderFrom = this.visualMine?.(tk) ?? null;
    const m = { renderFrom, x: tk.x, y: tk.y, owner: tk.id, team: tk.team, fuse: MINE_FUSE, age: 0, trig: -1, alive: true };
    this.mines.push(m); tk.minesLive++;
    this.events.push({ e: 'mine', x: m.x, y: m.y });
    this.sound.play('click');
  }
  updateMines(dt) {
    for (const m of this.mines) {
      if (!m.alive) continue;
      m.age += dt; m.fuse -= dt;
      if (m.trig < 0 && m.age > MINE_ARM) {
        for (const tk of this.tanks) {
          if (!tk.alive || tk.team === m.team || tk.under || tk.def?.fly) continue;
          if (Math.hypot(tk.x - m.x, tk.y - m.y) < TRIGGER_R) { m.trig = 0.35; break; }
        }
      }
      if (m.trig >= 0) { m.trig -= dt; if (m.trig <= 0) this.detonate(m); }
      else if (m.fuse <= 0) this.detonate(m);
    }
    this.mines = this.mines.filter((m) => m.alive);
  }
  detonate(m) {
    if (!m.alive) return;
    m.alive = false;
    const o = this.tanks.find((t) => t.id === m.owner); if (o) o.minesLive = Math.max(0, o.minesLive - 1);
    this.blast(m.x, m.y, BLAST_R, { own: m.team === 0 });
  }
  blast(x, y, r, { own = false } = {}) {
    this.fx.push({ kind: 'blast', x, y, t: 0, max: 0.8, r });
    this.events.push({ e: 'blast', x, y, r });
    this.sound.play('boom');
    for (const tk of this.tanks) if (tk.alive && !tk.under && !tk.def?.fly && Math.hypot(tk.x - x, tk.y - y) < r + tk.r * 0.5) this.hitTank(tk, { blast: true, own });
    for (const s of this.shells) if (s.alive && Math.hypot(s.x - x, s.y - y) < r) this.killShell(s, true);
    for (const m of this.mines) if (m.alive && Math.hypot(m.x - x, m.y - y) < r) m.trig = m.trig < 0 ? 0.12 : Math.min(m.trig, 0.12);
    // crates in reach break
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H || this.grid[ty * W + tx] !== T.CRATE) continue;
      if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < r + 0.25) { this.grid[ty * W + tx] = T.FLOOR; this.rev++; this.fx.push({ kind: 'crate', x: tx + 0.5, y: ty + 0.5, t: 0, max: 0.9 }); }
    }
  }

  updateVents(dt) {
    for (const v of this.vents) {
      // 4.5 s quiet, 1.6 s glowing (the warning), 1 s eruption
      v.phase = (v.phase + dt) % 7.1;
      const st = v.phase < 4.5 ? 0 : v.phase < 6.1 ? 1 : 2;
      v.k = st === 1 ? (v.phase - 4.5) / 1.6 : st === 2 ? 1 : 0;
      if (st === 2 && v.state !== 2) { this.events.push({ e: 'erupt', x: v.x + 0.5, y: v.y + 0.5 }); this.sound.play('sizzle'); }
      v.state = st;
      if (st === 2) for (const tk of this.tanks) if (tk.alive && !tk.def?.fly && Math.abs(tk.x - v.x - 0.5) < 0.5 + tk.r * 0.6 && Math.abs(tk.y - v.y - 0.5) < 0.5 + tk.r * 0.6) this.hitTank(tk, { lava: true });
    }
  }

  /** Telegraphed boss strikes: a mark on the ground, then the hit. */
  updateWarnings(dt) {
    for (const w of this.warn) {
      w.t -= dt;
      if (w.t <= 0 && !w.done) {
        w.done = true;
        if (w.kind === 'shell') this.blast(w.x, w.y, w.r);
        else if (w.kind === 'beam') {
          this.fx.push({ kind: 'beam', x: w.x, y: w.y, x2: w.x2, y2: w.y2, t: 0, max: 0.5 });
          this.sound.play('boom');
          for (const tk of this.tanks) if (tk.alive && tk.team === 0 && segDist(tk.x, tk.y, w.x, w.y, w.x2, w.y2) < w.r + tk.r * 0.5) this.hitTank(tk, { beam: true });
          for (const s of this.shells) if (s.alive && segDist(s.x, s.y, w.x, w.y, w.x2, w.y2) < w.r) this.killShell(s, true);
        }
      }
    }
    this.warn = this.warn.filter((w) => !w.done || w.t > -0.6);
  }

  // ── enemy brains ──
  computeDist() {
    const d = this.dist; d.fill(-1);
    const p = this.player, q = this.queue;
    const start = Math.floor(p.y) * W + Math.floor(p.x);
    let h = 0, tl = 0;
    if (start >= 0 && start < W * H) { d[start] = 0; q[tl++] = start; }
    while (h < tl) {
      const c = q[h++], cx = c % W, cy = (c / W) | 0;
      for (const [ox, oy] of N4) {
        const x = cx + ox, y = cy + oy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const n = y * W + x;
        if (d[n] >= 0 || solidT(this.grid[n])) continue;
        d[n] = d[c] + 1; q[tl++] = n;
      }
    }
  }
  danger(x, y) {
    let k = 0;
    for (const m of this.mines) { const dd = Math.hypot(m.x - x, m.y - y); if (dd < BLAST_R + 0.6) k += 3 * (1 - dd / (BLAST_R + 0.6)) + 1; }
    for (const v of this.vents) if (Math.floor(x) === v.x && Math.floor(y) === v.y) k += v.state ? 6 : 1.5;
    for (const w of this.warn) if (!w.done && w.kind === 'shell' && Math.hypot(w.x - x, w.y - y) < w.r + 0.5) k += 6;
    return k;
  }

  updateEnemy(tk, dt) {
    const D = tk.def, p = this.player;
    // movement: pick a neighbouring tile every think, scored by path distance (near the preferred range), danger,
    // incoming shells and a little noise
    let mx = 0, my = 0;
    if (D.move) {
      tk.think -= dt;
      const atWp = Math.hypot(tk.wx - tk.x, tk.wy - tk.y) < 0.18;
      const threat = D.dodge ? this.threatTo(tk, 0.75) : null;
      if (threat && tk.dodgeT <= 0 && this.rand() < D.dodge) { this.dodgeFrom(tk, threat); tk.dodgeT = 0.45; }
      tk.dodgeT -= dt;
      if ((atWp || tk.think <= 0) && tk.dodgeT <= 0) { this.pickWaypoint(tk); tk.think = 0.5 + this.rand() * 0.5; }
      const dx = tk.wx - tk.x, dy = tk.wy - tk.y, dd = Math.hypot(dx, dy);
      if (dd > 0.08) { mx = dx / dd; my = dy / dd; }
    }
    this.drive(tk, mx, my, MOVE_SPEED[D.move] || 0, 6, dt);
    // mines (miners and ghosts drop them when the player is a few steps away, then move off)
    if (D.mines && tk.minesLive < D.mines && tk.mineCd <= 0) {
      const pd = this.distAt(tk.x, tk.y);
      if (pd >= 0 && pd <= 7 && !this.mines.some((m) => Math.hypot(m.x - tk.x, m.y - tk.y) < 2.2)) { this.layMineAt(tk); tk.mineCd = 4 + this.rand() * 3; this.pickWaypoint(tk, true); }
    }
    // aiming: every 0.2 s look for a clean shot (straight, or banked for the types that can)
    tk.aimT -= dt;
    if (tk.aimT <= 0) { tk.aimT = 0.2; tk.want = this.findShot(tk, D.shell, D.bounces, D.bank ? 48 : 0); }
    if (tk.charge > 0) {
      // rocket tanks wind up: the turret holds still and the eye flares, then the rocket goes
      tk.charge -= dt;
      if (tk.charge <= 0) { this.fireShell(tk, tk.aim + (this.rand() * 2 - 1) * D.err, D.shell, D.bounces); tk.cd = D.cd * (0.85 + this.rand() * 0.3); }
    } else if (tk.want != null) {
      tk.seen += dt;
      tk.aim = turnTo(tk.aim, tk.want, D.turret * dt);
      if (tk.seen > D.react && this.t > READY + GRACE && tk.cd <= 0 && tk.live < D.shells && Math.abs(angDiff(tk.aim, tk.want)) < 0.06) {
        if (D.shell >= 8) { tk.charge = 0.45; this.events.push({ e: 'charge', x: tk.x, y: tk.y }); }
        else {
          this.fireShell(tk, tk.aim + (this.rand() * 2 - 1) * D.err, D.shell, D.bounces);
          tk.cd = D.cd * (0.85 + this.rand() * 0.3);
        }
      }
    } else {
      tk.seen = Math.max(0, tk.seen - dt * 0.5);
      // idle: the turret sweeps slowly towards where the player was
      tk.scan += dt * 0.6;
      const toP = Math.atan2(p.y - tk.y, p.x - tk.x) + Math.sin(tk.scan) * 0.8;
      tk.aim = turnTo(tk.aim, toP, D.turret * 0.5 * dt);
    }
  }
  distAt(x, y) { const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= W || ty >= H ? -1 : this.dist[ty * W + tx]; }

  pickWaypoint(tk, flee = false) {
    const D = tk.def, cx = Math.floor(tk.x), cy = Math.floor(tk.y);
    const keep = flee ? 9 : D.keep ?? 6;
    let best = null, bestS = Infinity;
    for (const [ox, oy] of N8) {
      const x = cx + ox, y = cy + oy;
      if (x < 0 || y < 0 || x >= W || y >= H || solidT(this.grid[y * W + x])) continue;
      if (ox && oy && (solidT(this.grid[cy * W + x]) || solidT(this.grid[y * W + cx]))) continue; // no corner cutting
      const d = this.dist[y * W + x];
      let s = d < 0 ? 30 : Math.abs(d - keep) * 1.2;
      s += this.danger(x + 0.5, y + 0.5) * 4;
      for (const o of this.tanks) if (o !== tk && o.alive && Math.hypot(o.x - x - 0.5, o.y - y - 0.5) < 0.9) s += 3;
      s += this.rand() * 1.4;
      if (s < bestS) { bestS = s; best = [x, y]; }
    }
    if (best) { tk.wx = best[0] + 0.5; tk.wy = best[1] + 0.5; }
  }
  /** The nearest shell (not its own fresh one) that passes close by within `time` seconds. */
  threatTo(tk, time) {
    let worst = null, wt = time;
    for (const s of this.shells) {
      if (!s.alive || (s.owner === tk.id && s.age < 0.3)) continue;
      const rx = tk.x - s.x, ry = tk.y - s.y, v2 = s.vx * s.vx + s.vy * s.vy;
      const t = (rx * s.vx + ry * s.vy) / v2;
      if (t < 0 || t > wt) continue;
      const cx = s.x + s.vx * t - tk.x, cy = s.y + s.vy * t - tk.y;
      if (cx * cx + cy * cy < (tk.r + 0.45) ** 2) { worst = s; wt = t; }
    }
    return worst;
  }
  dodgeFrom(tk, s) {
    // step sideways off the shell's line, to whichever side is open
    const v = Math.hypot(s.vx, s.vy), px = -s.vy / v, py = s.vx / v;
    const side = (tk.x - s.x) * px + (tk.y - s.y) * py >= 0 ? 1 : -1;
    for (const sg of [side, -side]) {
      const x = tk.x + px * sg * 1.0, y = tk.y + py * sg * 1.0;
      if (!solidT(this.tile(x, y)) && this.danger(x, y) < 2) { tk.wx = x; tk.wy = y; return; }
    }
  }

  /**
   * The angle of a shot from `tk` that hits the player first (lead included), or null. Straight shots first; banked
   * types also try `fan` angles around the circle and keep the shortest path that reaches the player.
   */
  findShot(tk, speed, bounces, fan) {
    const p = this.player;
    if (!p.alive) return null;
    const lead = Math.hypot(p.x - tk.x, p.y - tk.y) / speed;
    const px = p.x + p.vx * lead * 0.7, py = p.y + p.vy * lead * 0.7;
    let ang = Math.atan2(py - tk.y, px - tk.x);
    const direct = this.traceShot(tk, ang, bounces, speed, 18);
    if (direct.hit === p) return ang;
    if (!fan || bounces < 1) return null;
    let best = null, bestLen = Infinity;
    const off = this.rand() * TAU / fan;
    for (let i = 0; i < fan; i++) {
      const a = off + (i / fan) * TAU;
      const r = this.traceShot(tk, a, bounces, speed, 22);
      if (r.hit === p && r.len < bestLen) { bestLen = r.len; best = a; }
    }
    // refine around the best ray
    if (best != null) {
      for (const d of [-0.05, -0.025, 0.025, 0.05]) {
        const r = this.traceShot(tk, best + d, bounces, speed, 22);
        if (r.hit === p && r.len < bestLen) { bestLen = r.len; ang = best + d; }
      }
      return bestLen < Infinity ? (ang === Math.atan2(py - tk.y, px - tk.x) ? best : ang) : null;
    }
    return null;
  }
  /** Follows a shell's path without spawning it: → { hit: tank | null, len }. */
  traceShot(tk, ang, bounces, speed, maxLen) {
    let x = tk.x, y = tk.y, vx = Math.cos(ang), vy = Math.sin(ang), len = 0, b = bounces;
    const out = this._trace || (this._trace = { hit: null, len: 0 });
    out.hit = null;
    const start = tk.boss ? tk.r + 0.2 : BARREL;
    while (len < maxLen) {
      const st = 0.1, nx = x + vx * st, ny = y + vy * st;
      if (solidS(this.tile(nx, ny))) {
        let hx = solidS(this.tile(nx, y)), hy = solidS(this.tile(x, ny));
        if (!hx && !hy) hx = hy = true;
        if (hx) vx = -vx; if (hy) vy = -vy;
        if (--b < 0) break;
        continue;
      }
      x = nx; y = ny; len += st;
      if (len < start) continue;
      for (const o of this.tanks) {
        if (!o.alive || o.under) continue;
        if (o === tk && len < start + 0.6) continue;
        // its own side counts wide (never risk a friend or itself), the other side narrow (only sure hits)
        const rr = o.r + SHELL_R + (o.team === tk.team ? 0.15 : -0.05);
        if ((o.x - x) ** 2 + (o.y - y) ** 2 < rr * rr) { out.hit = o; out.len = len; return out; }
      }
    }
    out.len = len;
    return out;
  }

  // ── bosses ──
  updateBoss(tk, dt) {
    const D = tk.def, p = this.player;
    tk.special -= dt;
    // movement: towards a waypoint near the player's path distance 5 (the mothership drifts freely)
    let mx = 0, my = 0;
    if (!tk.under) {
      tk.think -= dt;
      if (tk.think <= 0 || Math.hypot(tk.wx - tk.x, tk.wy - tk.y) < 0.25) {
        tk.think = 1.2 + this.rand();
        if (D.fly) { tk.wx = clamp(p.x + (this.rand() * 2 - 1) * 5, 1.5, W - 1.5); tk.wy = clamp(p.y - 3 - this.rand() * 3, 1.5, H - 1.5); }
        else this.pickWaypoint(tk);
      }
      const dx = tk.wx - tk.x, dy = tk.wy - tk.y, dd = Math.hypot(dx, dy);
      if (dd > 0.1) { mx = dx / dd; my = dy / dd; }
      this.drive(tk, mx, my, D.move, 2.5, dt);
    }
    const hpFrac = tk.hp / tk.maxHp;
    if (tk.boss === 'klonk') {
      // three-shell fan; reinforcements at half health
      this.bossAim(tk, dt, () => { for (const d of [-0.28, 0, 0.28]) this.fireShell(tk, tk.aim + d, D.shell, D.bounces); });
      if (hpFrac <= 0.5 && tk.spawned < 2) { tk.spawned = 2; this.reinforce(['rookie', 'scout']); }
    } else if (tk.boss === 'drill') {
      // burrows (can't be hit), a dust ring marks where it comes up 1.3 s later, then a ring of slow shells
      if (!tk.under && tk.special <= 0) {
        tk.under = true; tk.special = 1.6; tk.underAt = this.t;
        const spot = this.openSpotNear(p.x, p.y, 4.5, 7);
        tk.wx = spot[0]; tk.wy = spot[1];
        this.warn.push({ kind: 'surface', x: spot[0], y: spot[1], r: 1.2, t: 1.6, max: 1.6 });
        this.events.push({ e: 'burrow', x: tk.x, y: tk.y });
      } else if (tk.under) {
        tk.x += (tk.wx - tk.x) * Math.min(1, dt * 3); tk.y += (tk.wy - tk.y) * Math.min(1, dt * 3);
        if (tk.special <= 0) {
          tk.under = false; tk.surfaceAt = this.t; tk.x = tk.wx; tk.y = tk.wy; tk.special = 5.5 + this.rand() * 1.5; tk.cd = 1.0;
          this.events.push({ e: 'surface', x: tk.x, y: tk.y });
          for (let i = 0; i < 8; i++) this.fireShell(tk, (i / 8) * TAU + 0.2, 3.2, 0);
        }
      } else this.bossAim(tk, dt, () => this.fireShell(tk, tk.aim, D.shell, D.bounces));
      if (hpFrac <= 0.5 && tk.spawned < 1) { tk.spawned = 1; this.reinforce(['miner']); }
    } else if (tk.boss === 'walker') {
      // mortar: lobbed shells land on a marked circle where you were (1.5 s to leave it)
      this.bossAim(tk, dt, () => this.fireShell(tk, tk.aim, D.shell, D.bounces));
      if (tk.special <= 0 && tk.live === 0) {
        tk.special = hpFrac > 0.5 ? 3.6 : 2.6;
        const n = hpFrac > 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const ox = i ? (this.rand() * 2 - 1) * 2.5 : 0, oy = i ? (this.rand() * 2 - 1) * 2.5 : 0;
          this.warn.push({ kind: 'shell', x: clamp(p.x + ox, 0.5, W - 0.5), y: clamp(p.y + oy, 0.5, H - 0.5), r: 1.15, t: 1.5, max: 1.5, from: [tk.x, tk.y] });
        }
        this.events.push({ e: 'mortar', x: tk.x, y: tk.y });
      }
      if (hpFrac <= 0.5 && tk.spawned < 1) { tk.spawned = 1; this.reinforce(['banker']); }
    } else if (tk.boss === 'mothership') {
      // a beam sweeps a whole row or column through you after a 1.5 s warning; aces join at 2/3 and 1/3 health
      this.bossAim(tk, dt, () => { for (const d of [-0.2, 0.2]) this.fireShell(tk, tk.aim + d, D.shell, D.bounces); });
      if (tk.special <= 0 && tk.live === 0) {
        tk.special = hpFrac > 0.5 ? 4.2 : 3.2;
        const row = this.rand() < 0.5;
        const w = row ? { x: 0, y: p.y, x2: W, y2: p.y } : { x: p.x, y: 0, x2: p.x, y2: H };
        this.warn.push({ kind: 'beam', ...w, r: 0.45, t: 1.5, max: 1.5 });
      }
      if (hpFrac <= 0.67 && tk.spawned < 1) { tk.spawned = 1; this.reinforce(['ace']); }
      if (hpFrac <= 0.34 && tk.spawned < 2) { tk.spawned = 2; this.reinforce(['ghost']); }
    }
  }
  bossAim(tk, dt, shoot) {
    if (tk.under) return;
    // one danger at a time: while its own strike is marked on the ground, a boss holds its fire
    const marked = this.warn.some((w) => !w.done && (w.kind === 'shell' || w.kind === 'beam'));
    tk.aimT -= dt;
    if (tk.aimT <= 0) { tk.aimT = 0.25; tk.want = this.findShot(tk, tk.def.shell, tk.def.bounces, tk.def.bounces ? 36 : 0); }
    const p = this.player;
    const want = tk.want ?? Math.atan2(p.y - tk.y, p.x - tk.x);
    tk.aim = turnTo(tk.aim, want, 1.8 * dt);
    if (tk.want != null) tk.seen += dt;
    if (!marked && tk.want != null && tk.seen > 1 && this.t > READY + GRACE && tk.cd <= 0 && Math.abs(angDiff(tk.aim, tk.want)) < 0.08) { shoot(); tk.cd = tk.def.cd; }
  }
  reinforce(types) {
    // they roll in from the far corners, away from the player
    const p = this.player;
    const corners = [[1.5, 1.5], [W - 1.5, 1.5], [1.5, H - 1.5], [W - 1.5, H - 1.5]].sort((a, b) => Math.hypot(b[0] - p.x, b[1] - p.y) - Math.hypot(a[0] - p.x, a[1] - p.y));
    types.forEach((ty, i) => {
      const s = this.openSpotNear(corners[i][0], corners[i][1], 0, 2.5);
      const tk = this.addTank({ team: 1, x: s[0], y: s[1], type: ty });
      tk.cd = 2; this.total++;
      this.fx.push({ kind: 'blast', x: s[0], y: s[1], t: 0, max: 0.6, r: 0.8, spawn: true });
    });
  }
  /** A free tile centre between `min` and `max` from (x, y), preferring one the player can't be crushed into. */
  openSpotNear(x, y, min, max) {
    let best = null, bs = Infinity;
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (solidT(this.grid[ty * W + tx])) continue;
      const cx = tx + 0.5, cy = ty + 0.5, d = Math.hypot(cx - x, cy - y);
      if (d < min || d > max + 3) continue;
      let s = Math.abs(d - (min + max) / 2) + this.rand() * 1.5 + this.danger(cx, cy) * 3;
      // keep a 2 × 2 boss clear of walls
      for (const [ox, oy] of N8) if (solidT(this.tile(cx + ox * 0.9, cy + oy * 0.9))) s += 0.8;
      if (s < bs) { bs = s; best = [cx, cy]; }
    }
    return best || [x, y];
  }

  // ── effects ──
  puff(x, y, k = 1) { this.fx.push({ kind: 'puff', x, y, t: 0, max: 0.45 * k + 0.2 }); }
  spark(x, y) { this.fx.push({ kind: 'spark', x, y, t: 0, max: 0.35 }); }
  updateFx(dt) {
    for (const f of this.fx) f.t += dt;
    if (this.fx.length) this.fx = this.fx.filter((f) => f.t < f.max);
    for (const m of this.marks) m.life -= dt;
    while (this.marks.length && this.marks[0].life <= 0) this.marks.shift();
  }

  // ── drawing (2D fallback and overlay) ──
  proj(x, y, h = 0) {
    if (this.projFn) return this.projFn(x, y, h);
    const L = this.layout, o = (this._p = this._p || { x: 0, y: 0, s: 1 });
    o.x = L.ox + x * L.k; o.y = L.oy + y * L.k - h * L.k * 0.5; o.s = L.k;
    return o;
  }
  screenToWorld(sx, sy) {
    const L = this.layout; if (!L || !L.k) return null;
    return { x: (sx - L.ox) / L.k, y: (sy - L.oy) / L.k };
  }
  render(g, view) {
    const { w, h } = view;
    if (view.gl) {
      this.projFn = view.gl.projectFn();
      this.unproj = view.gl.groundAt;
      this.dirFn = view.gl.dirFn;
      this.layout = { w, h };
    } else {
      this.projFn = null; this.unproj = null; this.dirFn = null;
      const k = Math.min((w - 24) / W, (h - 70) / H);
      this.layout = { w, h, k, ox: (w - W * k) / 2, oy: (h - H * k) / 2 + 14 };
      this.draw2d(g, view);
    }
    this.drawOverlay(g, view);
  }

  draw2d(g, view) {
    const L = this.layout, k = L.k;
    const pal = [['#c9e6a0', '#8a6a44', '#c08a52'], ['#f1d39b', '#b07a45', '#c79a5a'], ['#e6f0fa', '#8aa4c4', '#b8c7da'], ['#4a3f40', '#2a2224', '#6b4a3a']][this.L.world];
    g.fillStyle = view.dark ? '#0f1412' : '#e9eee6'; g.fillRect(0, 0, view.w, view.h);
    g.fillStyle = pal[0]; g.fillRect(L.ox, L.oy, W * k, H * k);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = this.grid[y * W + x];
      if (t === T.FLOOR) continue;
      g.fillStyle = t === T.WALL ? pal[1] : t === T.CRATE ? pal[2] : t === T.PIT ? '#1f1a17' : t === T.ICE ? '#bfe3fb' : t === T.VENT ? '#7c2d12' : pal[0];
      g.fillRect(L.ox + x * k, L.oy + y * k, k + 0.5, k + 0.5);
    }
    for (const v of this.vents) if (v.state) { g.fillStyle = v.state === 2 ? 'rgba(251,146,60,.95)' : `rgba(249,115,22,${0.25 + v.k * 0.5})`; g.fillRect(L.ox + v.x * k, L.oy + v.y * k, k, k); }
    for (const m of this.marks) { const tk = this.tanks.find((t) => t.id === m.id); g.fillStyle = `rgba(0,0,0,${0.12 * Math.min(1, m.life / 3)})`; const q = this.proj(m.x, m.y); g.fillRect(q.x - 2, q.y - 2, 4, 4); if (!tk) continue; }
    for (const m of this.mines) { const q = this.proj(m.x, m.y); g.fillStyle = m.fuse < 2 && (this.t * 8) % 2 < 1 ? '#ef4444' : '#facc15'; g.beginPath(); g.arc(q.x, q.y, MINE_R * k, 0, TAU); g.fill(); }
    for (const tk of this.tanks) {
      if (!tk.alive || tk.under) continue;
      if (tk.def?.ghost && !this.ghostVisible(tk)) continue;
      const q = this.proj(tk.x, tk.y);
      g.save(); g.translate(q.x, q.y); g.rotate(tk.ang);
      g.fillStyle = tk.flash > 0 ? '#fff' : tk.team === 0 ? '#3f8a2e' : tk.boss ? '#7f1d1d' : tk.def.css;
      g.fillRect(-tk.r * k, -tk.r * 0.8 * k, tk.r * 2 * k, tk.r * 1.6 * k);
      g.rotate(tk.aim - tk.ang); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, -0.07 * k, BARREL * k, 0.14 * k);
      g.restore();
    }
    for (const s of this.shells) { const q = this.proj(s.x, s.y); g.fillStyle = s.kind ? '#f97316' : '#fff'; g.beginPath(); g.arc(q.x, q.y, Math.max(2, SHELL_R * k * 1.3), 0, TAU); g.fill(); }
    for (const f of this.fx) if (f.kind === 'blast' || f.kind === 'boom') { const q = this.proj(f.x, f.y), a = 1 - f.t / f.max; g.fillStyle = `rgba(251,146,60,${a * 0.6})`; g.beginPath(); g.arc(q.x, q.y, (f.r || 1) * k * (0.5 + f.t / f.max * 0.6), 0, TAU); g.fill(); }
  }
  ghostVisible(tk) { return tk.flash > 0 || tk.recoil > 0.2 || (this.player && Math.hypot(tk.x - this.player.x, tk.y - this.player.y) < 1.6); }

  drawOverlay(g, view) {
    const { w, h } = view;
    // telegraphs on the ground (drawn here so the 2D and 3D views share them)
    for (const wn of this.warn) {
      if (wn.done) continue;
      const a = 1 - wn.t / wn.max;
      if (wn.kind === 'beam') {
        const p1 = this.proj(wn.x, wn.y, 0.02), x1 = p1.x, y1 = p1.y, p2 = this.proj(wn.x2, wn.y2, 0.02);
        g.strokeStyle = `rgba(239,68,68,${0.25 + 0.5 * a})`; g.lineWidth = Math.max(3, (wn.r * 2) * (p1.s || 30) * (0.4 + 0.6 * a)); g.setLineDash([10, 8]);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(p2.x, p2.y); g.stroke(); g.setLineDash([]);
      } else {
        this.ring(g, wn.x, wn.y, wn.r, `rgba(239,68,68,${0.35 + 0.5 * a})`, a);
      }
    }
    // mines about to blow: their blast radius
    for (const m of this.mines) if (m.trig >= 0 || m.fuse < 2) this.ring(g, m.x, m.y, BLAST_R, 'rgba(250,204,21,.7)', 0.3);
    if (this.preview) return;
    const p = this.player, touch = this.touchMode;
    const dt = Math.min(0.1, Math.max(0, (view.time || 0) - (this.lastDraw ?? view.time ?? 0))); this.lastDraw = view.time || 0;
    this.pad.layout(w, h); // also before the first touch: a thumb may land on the mine button straight away
    // aim line: from the muzzle to the first wall, the bounce, and what the shell would hit first. Mouse: always;
    // touch: bright while the aim stick is pulled, faint along the held aim otherwise.
    if (p.alive && !this.result && this.t > READY && !this.botMove) {
      const pulled = touch && !!this.pad.aimVector();
      const show = touch ? this.aimAng != null : !!this.aimAt;
      if (show) this.drawAimLine(g, p, touch && !pulled ? 0.4 : 1, touch);
      if (!touch && this.aimAt) {
        const q = this.proj(this.aimAt.x, this.aimAt.y, 0);
        g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, 9, 0, TAU); g.moveTo(q.x - 14, q.y); g.lineTo(q.x - 5, q.y); g.moveTo(q.x + 5, q.y); g.lineTo(q.x + 14, q.y); g.stroke();
      }
    }
    // small screens: a team ring on the ground under every tank (Hazel mint, rival clubs coral: the green Banker and the
    // black Ace on dark basalt read apart), and a dark rim plus a team ring around every shell
    if (touch || this.proj(W / 2, H / 2, 0).s < 30) {
      for (const tk of this.tanks) {
        if (!tk.alive || tk.under || (tk.def?.ghost && !this.ghostVisible(tk))) continue;
        this.ring(g, tk.x, tk.y, tk.r * 1.2, tk.team === 0 ? (this.tournamentRingColor || '#55b582') : 'rgba(248,113,113,.8)');
      }
      for (const s of this.shells) {
        const q = this.proj(s.x, s.y, 0.42), r = Math.max(3.5, q.s * 0.14);
        g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(q.x, q.y, r + 1.5, 0, TAU); g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = s.team === 0 ? 'rgba(190,242,100,.95)' : 'rgba(248,113,113,.95)'; g.beginPath(); g.arc(q.x, q.y, r + 3, 0, TAU); g.stroke();
      }
    }
    // floating score pops
    for (const f of this.fx) if (f.kind === 'pop') { const q = this.proj(f.x, f.y, 1 + f.t * 1.2); label(g, f.text, q.x, q.y, 15, '#fde047'); }
    // status: enemies left, shells ready, mines (touch: out from under the thumbs; the mine button shows the mines)
    const left = this.tanks.filter((t) => t.team === 1 && t.alive);
    const ready = PLAYER.maxShells - p.live;
    g.save();
    if (touch) {
      if (this.fireDenied > 0) g.globalAlpha = 0.5 + 0.5 * Math.sin(this.fireDenied * 40);
      this.pad.drawRows(g, left, ready, PLAYER.maxShells);
      g.globalAlpha = 1;
      this.pad.draw(g, dt);
    } else {
      const y = h - 22;
      let x = 14;
      for (const tk of left.slice(0, 14)) {
        g.fillStyle = tk.boss ? '#b91c1c' : tk.def.css; roundRect(g, x, y - 8, 20, 14, 4); g.fill();
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 9, y - 5, 12, 3); x += 25;
      }
      let rx = w - 14;
      for (let i = 0; i < PLAYER.maxMines; i++) { rx -= 18; g.fillStyle = i < PLAYER.maxMines - p.minesLive ? '#facc15' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(rx + 7, y - 1, 6, 0, TAU); g.fill(); }
      rx -= 10;
      for (let i = 0; i < PLAYER.maxShells; i++) { rx -= 11; g.fillStyle = i < ready ? '#fff' : 'rgba(255,255,255,.25)'; roundRect(g, rx, y - 7, 7, 12, 3); g.fill(); }
    }
    g.restore();
    // start banner and boss bar
    if (this.t < READY + 0.5) {
      const a = this.t < READY ? 1 : 1 - (this.t - READY) / 0.5;
      g.globalAlpha = Math.max(0, a);
      label(g, this.t < READY ? `${this.L.name}` : 'GO!', w / 2, h * 0.42, Math.min(46, w / 12), '#fff');
      if (this.t < READY) {
        const clubs=[...new Set(this.tanks.filter(t=>t.type).map(t=>CLUBS[t.type]))];
        const caption=this.boss?'Concordia · An evening of peace':`${clubs.length===1?clubs[0]:clubs.length+' rival clubs'} · ${this.total} toy${this.total===1?'':'s'}`;
        label(g, caption, w / 2, h * 0.42 + 38, Math.min(17,w/24), '#fde68a');
      }
      g.globalAlpha = 1;
    }
    if (this.boss && this.boss.alive) {
      const bw = Math.min(360, w - 120), bx = (w - bw) / 2, by = 54;
      g.fillStyle = 'rgba(15,23,42,.6)'; roundRect(g, bx - 4, by - 4, bw + 8, 16, 8); g.fill();
      g.fillStyle = '#ef4444'; roundRect(g, bx, by, bw * (this.boss.hp / this.boss.maxHp), 8, 4); g.fill();
      label(g, this.boss.def.name, w / 2, by + 24, 13);
    }
  }
  ring(g, x, y, r, color, fill = 0) {
    const n = 28;
    g.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, q = this.proj(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.03); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
    g.strokeStyle = color; g.lineWidth = 2.5; g.stroke();
    if (fill) { g.fillStyle = color.replace(/[\d.]+\)$/, `${0.12 + 0.18 * fill})`); g.fill(); }
  }
  /**
   * A shell's path for the aim line: points up to `bounces` reflections, and the first tank it would hit (`self` when
   * it would come back into the shooter).
   */
  aimTrace(tk, ang, bounces) {
    const pts = [];
    let x = tk.x + Math.cos(ang) * BARREL, y = tk.y + Math.sin(ang) * BARREL, vx = Math.cos(ang), vy = Math.sin(ang), b = bounces, len = 0, bounceAt = -1, hit = null;
    walk: while (len < 18 && pts.length < 70) {
      const st = 0.1, nx = x + vx * st, ny = y + vy * st;
      if (solidS(this.tile(nx, ny))) {
        let hx = solidS(this.tile(nx, y)), hy = solidS(this.tile(x, ny));
        if (!hx && !hy) hx = hy = true;
        if (hx) vx = -vx; if (hy) vy = -vy;
        if (--b < 0) break;
        if (bounceAt < 0) bounceAt = pts.length;
        continue;
      }
      x = nx; y = ny; len += st;
      for (const o of this.tanks) {
        if (!o.alive || o.under || (o === tk && len < 0.9) || (o.def?.ghost && !this.ghostVisible(o))) continue;
        if ((o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + SHELL_R) ** 2) { hit = o; pts.push([x, y]); break walk; }
      }
      if (Math.round(len * 10) % 4 === 0) pts.push([x, y]);
    }
    return { pts, hit, self: hit === tk, bounceAt };
  }
  aimPath(tk, ang, bounces) { return this.aimTrace(tk, ang, bounces).pts; }
  drawAimLine(g, p, alpha, big) {
    const tr = this.aimTrace(p, p.aim, PLAYER.bounces);
    const r1 = big ? 3.2 : 2.4, r2 = big ? 2.3 : 1.6;
    g.save(); g.globalAlpha = alpha;
    for (let i = 0; i < tr.pts.length; i++) {
      const q = this.proj(tr.pts[i][0], tr.pts[i][1], 0.35), after = tr.bounceAt >= 0 && i >= tr.bounceAt;
      g.beginPath(); g.arc(q.x, q.y, after ? r2 : r1, 0, TAU);
      g.fillStyle = tr.self && after ? 'rgba(248,113,113,.95)' : 'rgba(255,255,255,.92)'; g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.4)'; g.stroke();
    }
    // what it hits: a target ring on an enemy, a warning on Hazel's own tank
    if (tr.hit) {
      const o = tr.hit, q = this.proj(o.x, o.y, 0.3), r = Math.max(12, o.r * q.s * 1.35);
      g.lineWidth = 2.5; g.strokeStyle = tr.self ? 'rgba(248,113,113,.95)' : 'rgba(253,224,71,.95)';
      g.beginPath(); g.arc(q.x, q.y, r, 0, TAU); g.stroke();
      if (!tr.self) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(q.x + Math.cos(a) * (r - 4), q.y + Math.sin(a) * (r - 4)); g.lineTo(q.x + Math.cos(a) * (r + 5), q.y + Math.sin(a) * (r + 5)); g.stroke(); }
      else label(g, '!', q.x, q.y - r - 8, 14, '#fecaca');
    }
    g.restore();
  }
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function turnTo(a, want, max) { return a + clamp(angDiff(want, a), -max, max); }
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - x1 - dx * t, py - y1 - dy * t);
}

export const tanks = {
  id: 'tanks',
  title: 'Bounce Brigade',
  tagline: 'Toy tank duels with Captain Hazel: bank your shells off the walls, lay mines, challenge eight rival clubs for an evening of peace.',
  howTo: 'Drive with WASD / arrow keys, aim with the mouse, click or Space fires; shells bounce once. Right-click, E or Shift lays a mine. Touch: drag on the left to drive, drag on the right to aim and let go to fire (slide back to cancel), tap the arena to fire there, MINE button for mines. Esc pauses, R restarts.',
  levels: LEVELS,
  hero: 'TOY_HAZEL',
  // The legacy cover depicts an unrelated crewed tank. Canonical 3D stages supply the art.
  art: new URL('../../games-assets/covers/cover-tanks.webp', import.meta.url).href,
  create: (i, env) => new TankSession(i, env),
  view3d: () => import('./tanks-3d.js'),
};
