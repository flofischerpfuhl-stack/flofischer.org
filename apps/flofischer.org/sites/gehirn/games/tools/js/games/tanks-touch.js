/**
 * Bounce Brigade on a touch screen: twin sticks that appear where a thumb lands, a mine button, taps that fire.
 *
 *   left half      drag: drive (floating stick, radial dead zone, the base follows a thumb that runs past its rim)
 *   right half     drag: aim (floating stick; the aim line shows the path with its bounce and what it hits),
 *                  release: fire · slide back to the centre before releasing: cancel
 *   tap the arena  fire at that spot (either half; a tap next to an enemy fires at the enemy; on the left half only a
 *                  short tap, so a resting drive thumb never fires)
 *   tap beside the arena on the right: quick shot at the nearest enemy in a clear line, else along the turret
 *   MINE button    lays a mine; its two charge pips fill back up while the laid mines tick down
 *
 * Why release-to-fire and not fire-while-held: shells bounce back, and five live shells are the cap, so a held stick that
 * kept firing would empty the magazine into the walls and often into Hazel herself. Aim, check the line, commit.
 * The pad only handles screen space; the session (tanks.js) turns screen directions into arena angles.
 */
import { label, roundRect } from './core.js';

const TAU = Math.PI * 2;
export const MOVE_R = 56, MOVE_DEAD = 8;   // px: knob travel, radial dead zone (~14 % of the travel)
export const AIM_R = 64, AIM_DEAD = 16;    // the aim stick wants a clear pull before it aims; less is a tap
const TAP_MS = 380, TAP_PX = 14;
const HINT_S = 7;                          // the ghost sticks show for the first seconds of a level until used

/** The screen's safe-area insets (notch, home bar) in CSS px, read through a hidden probe; zeros outside a browser. */
let probe = null;
export function safeArea() {
  if (typeof document === 'undefined' || !document.body) return { t: 0, r: 0, b: 0, l: 0 };
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe), n = (v) => parseFloat(v) || 0;
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}
/** Sideways phones keep this much (plus the safe area) free on each side of the arena: room for a thumb and the button. */
export const SIDE_MARGIN = 72;

export class TouchPad {
  constructor(session) {
    this.s = session;
    this.move = null; this.aim = null; this.btn = null; this.btnDown = 0;
    this.used = { move: false, aim: false };
    this.w = 800; this.h = 600; this.rect = null; this.portrait = false;
  }

  /** Where things go this frame: the arena's screen box, the mine button, the ghost sticks, the status rows. */
  layout(w, h) {
    const s = this.s, W = s.gridW, H = s.gridH;
    this.w = w; this.h = h; this.portrait = h > w * 1.08;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of [[-1, -1], [W + 1, -1], [-1, H + 1], [W + 1, H + 1]]) for (const hh of [0, 0.9]) {
      const q = s.proj(x, y, hh);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    const r = (this.rect = { x0, y0, x1, y1 });
    const R = 32, sa = (this.safe = this.w === this.safeW && this.h === this.safeH && this.safe ? this.safe : safeArea());
    this.safeW = w; this.safeH = h;
    if (this.portrait) {
      // a phone held upright: the arena sits under the HUD, the thumbs work in the band below it
      const band = Math.max(110, h - r.y1);
      const by = h - band / 2;
      this.btn = { x: w - sa.r - 18 - R, y: Math.max(h - band + R + 4, by - 26), r: R };
      this.ghost = { move: [w * 0.22, by + 8], aim: [w * 0.6, by + 8] };
      this.rows = { y: Math.min(h - 14, r.y1 + 16), left: 14, right: this.btn.x - R - 12 };
    } else {
      // sideways: the thumbs sit in the margins beside the arena
      const ml = Math.max(0, r.x0), mr = Math.max(0, w - r.x1);
      this.btn = { x: Math.min(w - sa.r - 8 - R, Math.max(r.x1 + 8 + R, r.x1 + mr * 0.5)), y: Math.max(Math.round(h * 0.45), 114 + sa.t + 20 + R), r: R };
      this.ghost = { move: [ml > 140 ? ml * 0.5 : 90, h * 0.72], aim: [mr > 140 ? w - mr * 0.45 : w - 110, h * 0.76] };
      this.rows = { y: 78 + sa.t, yr: 114 + sa.t, left: 14 + sa.l, right: w - 14 - sa.r, side: true, ml, mr };
    }
  }
  onArena(x, y) {
    const w = this.s.screenPoint(x, y);
    return !!w && w.x >= 0 && w.y >= 0 && w.x <= this.s.gridW && w.y <= this.s.gridH;
  }
  hitBtn(x, y) { const b = this.btn; return !!b && Math.hypot(x - b.x, y - b.y) < b.r + 14; }

  // `now` is the event's own timestamp: a janky frame between finger down and up must not turn a tap into a hold
  down(x, y, id, now = performance.now()) {
    if (this.hitBtn(x, y)) { this.s.layMine(); this.btnDown = 0.18; return; }
    if (x < this.w * 0.5) {
      if (!this.move) { this.move = { id, x0: x, y0: y, x, y, t: now, sx: x, sy: y }; }
      return;
    }
    if (!this.aim) this.aim = { id, x0: x, y0: y, x, y, t: now, out: false, cancel: false };
  }
  moveTo(x, y, id) {
    const m = this.move;
    if (m && m.id === id) {
      m.x = x; m.y = y;
      const dx = x - m.x0, dy = y - m.y0, d = Math.hypot(dx, dy);
      if (d > MOVE_DEAD) this.used.move = true;
      if (d > MOVE_R) { m.x0 = x - (dx / d) * MOVE_R; m.y0 = y - (dy / d) * MOVE_R; }
      return;
    }
    const a = this.aim;
    if (a && a.id === id) {
      a.x = x; a.y = y;
      const d = Math.hypot(x - a.x0, y - a.y0);
      if (d > AIM_DEAD) { if (!a.out) this.s.buzz(6); a.out = true; a.cancel = false; this.used.aim = true; }
      else if (a.out && !a.cancel) { a.cancel = true; this.s.buzz(4); }
    }
  }
  up(x, y, id, cancelled, now = performance.now()) {
    const m = this.move;
    if (m && m.id === id) {
      this.move = null;
      const tap = !cancelled && now - m.t < TAP_MS && Math.hypot(x - m.sx, y - m.sy) < TAP_PX;
      if (tap && this.onArena(x, y)) this.s.tapFire(x, y);
      return;
    }
    const a = this.aim;
    if (a && a.id === id) {
      this.aim = null;
      if (cancelled) return;
      if (a.out) { if (!a.cancel) this.s.fireStick(a.x - a.x0, a.y - a.y0); return; }
      // never pulled: a tap (however long the thumb rested; that is the right thumb's job anyway)
      if (this.onArena(x, y)) this.s.tapFire(x, y); else this.s.quickFire();
    }
  }
  reset() { this.move = null; this.aim = null; }
  /** The aim stick's pull, when it is aiming (not inside its dead zone, not cancelled). */
  aimVector() { const a = this.aim; return a && a.out && !a.cancel ? [a.x - a.x0, a.y - a.y0] : null; }

  draw(g, dt) {
    const s = this.s, p = s.player;
    this.btnDown = Math.max(0, this.btnDown - dt);
    // ghost sticks: where the thumbs go, until each one has been used
    const hintA = s.t < s.readyT + HINT_S ? Math.min(1, (s.readyT + HINT_S - s.t) / 1.2) : 0;
    if (hintA > 0) {
      g.save(); g.globalAlpha = hintA;
      if (!this.used.move && !this.move) this.ghostStick(g, this.ghost.move, MOVE_R, 'MOVE', 'drag');
      if (!this.used.aim && !this.aim) this.ghostStick(g, this.ghost.aim, AIM_R, 'AIM', 'drag, release fires');
      g.restore();
    }
    // the move stick
    const m = this.move;
    if (m) {
      this.ring(g, m.x0, m.y0, MOVE_R, 'rgba(255,255,255,.16)', 'rgba(255,255,255,.55)');
      const dx = m.x - m.x0, dy = m.y - m.y0, d = Math.hypot(dx, dy), k = d > MOVE_R ? MOVE_R / d : 1;
      this.knob(g, m.x0 + dx * k, m.y0 + dy * k, 24, 'rgba(255,255,255,.85)');
    }
    // the aim stick: grows a pointer while it aims, turns red over its centre (release there to cancel)
    const a = this.aim;
    if (a) {
      const cancel = a.cancel;
      this.ring(g, a.x0, a.y0, AIM_R, cancel ? 'rgba(239,68,68,.22)' : 'rgba(255,255,255,.14)', cancel ? 'rgba(248,113,113,.9)' : 'rgba(253,224,71,.75)');
      const dx = a.x - a.x0, dy = a.y - a.y0, d = Math.hypot(dx, dy), k = d > AIM_R ? AIM_R / d : 1;
      const kx = a.x0 + dx * k, ky = a.y0 + dy * k;
      if (a.out && !cancel) {
        g.strokeStyle = 'rgba(253,224,71,.9)'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(a.x0, a.y0); g.lineTo(kx, ky); g.stroke();
      }
      this.knob(g, kx, ky, 24, cancel ? 'rgba(248,113,113,.95)' : a.out ? 'rgba(253,224,71,.95)' : 'rgba(255,255,255,.8)');
      if (cancel) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(kx - 7, ky - 7); g.lineTo(kx + 7, ky + 7); g.moveTo(kx + 7, ky - 7); g.lineTo(kx - 7, ky + 7); g.stroke(); }
      // the magazine on the stick's rim, on the side facing the middle of the screen (away from the edge and the button)
      const ready = s.shellsReady(), mid = Math.atan2(this.h / 2 - a.y0, this.w / 2 - a.x0);
      for (let i = 0; i < s.maxShells; i++) {
        const an = mid + (i - (s.maxShells - 1) / 2) * 0.28, rx = a.x0 + Math.cos(an) * (AIM_R + 14), ry = a.y0 + Math.sin(an) * (AIM_R + 14);
        g.fillStyle = i < ready ? '#fff' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(rx, ry, 4, 0, TAU); g.fill();
      }
    }
    this.drawMineButton(g, p);
  }

  drawMineButton(g, p) {
    const b = this.btn; if (!b) return;
    const s = this.s, free = s.maxMines - p.minesLive, deny = s.mineDenied > 0;
    const press = this.btnDown > 0 ? 0.92 : 1;
    g.save(); g.translate(b.x, b.y); g.scale(press, press);
    g.fillStyle = deny ? 'rgba(127,29,29,.75)' : 'rgba(15,23,42,.6)';
    g.beginPath(); g.arc(0, 0, b.r, 0, TAU); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = free > 0 ? 'rgba(250,204,21,.9)' : 'rgba(148,163,184,.6)'; g.stroke();
    // the mine: a dome with a light
    g.fillStyle = free > 0 ? '#facc15' : '#64748b';
    g.beginPath(); g.ellipse(0, 3, 14, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, 2, 11, Math.PI, TAU); g.fill();
    g.fillStyle = free > 0 ? '#ef4444' : '#94a3b8'; g.beginPath(); g.arc(0, -5, 3, 0, TAU); g.fill();
    // charges: one pip per mine, a used one fills back up as its mine ticks down (the cooldown)
    const fuses = s.ownMineFuses();
    for (let i = 0; i < s.maxMines; i++) {
      const px = (i - (s.maxMines - 1) / 2) * 16, py = b.r - 11;
      g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(px, py, 6, 0, TAU); g.fill();
      const k = i < free ? 1 : 1 - (fuses[i - free] ?? 1);
      if (k > 0) { g.fillStyle = i < free ? '#facc15' : 'rgba(250,204,21,.65)'; g.beginPath(); g.moveTo(px, py); g.arc(px, py, 5, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.closePath(); g.fill(); }
    }
    g.restore();
    label(g, 'MINE', b.x, b.y + b.r + 11, 11, '#fff');
  }

  ghostStick(g, [x, y], r, title, sub) {
    g.setLineDash([6, 6]);
    this.ring(g, x, y, r, 'rgba(255,255,255,.1)', 'rgba(255,255,255,.6)');
    g.setLineDash([]);
    label(g, title, x, y - 6, 15, '#fff');
    label(g, sub, x, y + 12, 11, 'rgba(255,255,255,.9)');
  }
  ring(g, x, y, r, fill, stroke) {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    g.fillStyle = fill; g.fill();
    g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
  }
  knob(g, x, y, r, fill) {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x, y + 2, r, 0, TAU); g.fill();
    g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }

  /** Enemies left and the magazine, out from under the thumbs: under the arena (upright) or top left / right (sideways). */
  drawRows(g, left, ready, maxShells) {
    const R = this.rows; if (!R) return;
    let x = R.left;
    const cap = R.side ? Math.max(2, Math.floor((R.ml - 24) / 25)) : 14;
    for (const tk of left.slice(0, cap)) {
      g.fillStyle = tk.boss ? '#b91c1c' : tk.def.css; roundRect(g, x, R.y - 8, 20, 14, 4); g.fill();
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 9, R.y - 5, 12, 3); x += 25;
    }
    if (left.length > cap) label(g, `+${left.length - cap}`, x + 8, R.y - 1, 12);
    let rx = R.right;
    const yr = R.yr ?? R.y;
    for (let i = 0; i < maxShells; i++) { rx -= 11; g.fillStyle = i < ready ? '#fff' : 'rgba(255,255,255,.25)'; roundRect(g, rx, yr - 7, 7, 12, 3); g.fill(); }
  }
}
