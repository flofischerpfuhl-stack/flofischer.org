/**
 * Fernwork Games · shared frame for every game on tools/games.html.
 *
 * mountGame(root, game) builds the kit-styled screens around a game's canvas: the menu with level select and saved
 * stars, the HUD (pause, level, progress, score), pause and result screens, and runs a fixed-step loop (60 Hz) while a
 * level is playing. Games only implement the simulation and drawing:
 *
 *   game = { id, title, tagline, howTo, levels: [{ name }], create(levelIndex, env) → session }
 *   session.update(dt)                    advance the simulation; set session.result = { won, score, stars, reason }
 *   session.render(g, view)               draw (view: { w, h, dpr, dark, reduced, time })
 *   session.pointer(type, x, y)           'down' | 'move' | 'up' in CSS px relative to the canvas
 *   session.key(code, down)               return true when handled
 *   session.hud()                         { progress: 0..1 | null, score, label }
 *   env = { sound, preview }              preview: built only to draw the menu backdrop (no input, no updates)
 *
 * Tests reach the running game through window.__fwGames[game.id] (state, fast-forward, finish).
 */
import { icon } from '../../../assets/kit/icons.js';

const KEY = 'fw:games:';
export function readJSON(key, fallback) {
  try { const raw = localStorage.getItem(KEY + key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
}
export function writeJSON(key, value) {
  try { localStorage.setItem(KEY + key, JSON.stringify(value)); } catch { /* private mode: progress stays in memory */ }
}

export function loadProgress(gameId, count) {
  const saved = readJSON(gameId, null) || {};
  const pad = (list) => Array.from({ length: count }, (_, i) => (Array.isArray(list) && Number(list[i])) || 0);
  return { stars: pad(saved.stars), best: pad(saved.best) };
}
export function saveResult(gameId, progress, level, stars, score) {
  progress.stars[level] = Math.max(progress.stars[level] || 0, stars);
  progress.best[level] = Math.max(progress.best[level] || 0, score);
  writeJSON(gameId, progress);
}
/** A level is open when it is the first one or the one before it has at least one star. */
export const isUnlocked = (progress, level) => level === 0 || progress.stars[level - 1] > 0;

// ─────────────────────────────── sound (synthesised, no files) ───────────────────────────────
export class Sound {
  constructor() { this.on = readJSON('sound', true) !== false; this.ctx = null; this.last = new Map(); }
  unlock() {
    if (!this.on) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.master = this.ctx.createGain(); this.master.gain.value = 0.22; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  toggle() { this.on = !this.on; writeJSON('sound', this.on); if (this.on) this.unlock(); else this.ctx?.suspend?.().catch(() => {}); return this.on; }
  tone(freq, dur, { type = 'square', vol = 0.3, to = null, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.3, freq = 1200, type = 'lowpass', delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  /** Named effects; `gap` (ms) throttles rapid repeats such as gunfire. */
  play(name, gap = 0) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (gap && now - (this.last.get(name) || 0) < gap) return;
    this.last.set(name, now);
    const fx = SFX[name]; if (fx) fx(this);
  }
}
const SFX = {
  shot: (s) => s.noise(0.05, { vol: 0.12, freq: 2600, type: 'bandpass' }),
  hit: (s) => s.tone(320, 0.05, { vol: 0.08, to: 180 }),
  kill: (s) => { s.noise(0.12, { vol: 0.18, freq: 700 }); s.tone(200, 0.12, { vol: 0.1, to: 70, type: 'sawtooth' }); },
  good: (s) => [523, 659, 784].forEach((f, i) => s.tone(f, 0.12, { vol: 0.16, type: 'triangle', delay: i * 0.06 })),
  bad: (s) => [392, 311, 233].forEach((f, i) => s.tone(f, 0.14, { vol: 0.14, type: 'sawtooth', delay: i * 0.07 })),
  upgrade: (s) => [440, 554, 659, 880].forEach((f, i) => s.tone(f, 0.1, { vol: 0.15, type: 'square', delay: i * 0.05 })),
  hurt: (s) => s.tone(160, 0.16, { vol: 0.16, to: 60, type: 'sawtooth' }),
  boom: (s) => { s.noise(0.5, { vol: 0.5, freq: 380 }); s.tone(90, 0.4, { vol: 0.3, to: 30, type: 'sine' }); },
  coin: (s) => { s.tone(988, 0.06, { vol: 0.1, type: 'square' }); s.tone(1319, 0.12, { vol: 0.1, type: 'square', delay: 0.05 }); },
  pin: (s) => { s.noise(0.18, { vol: 0.16, freq: 3200, type: 'highpass' }); s.tone(600, 0.15, { vol: 0.08, to: 1400, type: 'triangle' }); },
  sizzle: (s) => s.noise(0.35, { vol: 0.16, freq: 4200, type: 'highpass' }),
  splash: (s) => s.noise(0.2, { vol: 0.12, freq: 900, type: 'bandpass' }),
  win: (s) => [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.22, { vol: 0.18, type: 'triangle', delay: i * 0.1 })),
  lose: (s) => [392, 349, 311, 262].forEach((f, i) => s.tone(f, 0.26, { vol: 0.16, type: 'sawtooth', delay: i * 0.13 })),
  click: (s) => s.tone(880, 0.04, { vol: 0.08, type: 'triangle' }),
};

// ─────────────────────────────── small shared helpers ───────────────────────────────
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Deterministic PRNG (mulberry32) so levels and tests replay the same way. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const FONT = '"Geist", "Inter", ui-sans-serif, system-ui, sans-serif';
/** Canvas text with an outline, the ad look. Size is in canvas units (not a CSS font-size). */
export function label(g, text, x, y, size, fill = '#fff', stroke = 'rgba(0,0,0,.55)', weight = 800) {
  g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.18); g.strokeStyle = stroke; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}
const starsHtml = (n, cls = '') => [0, 1, 2].map((i) => `<span class="gm-star${i < n ? ' is-on' : ''}${cls}">${icon('star', { size: 16 })}</span>`).join('');

// ─────────────────────────────── host ───────────────────────────────
const STEP = 1 / 60;
const hasWebGL = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
};

export function mountGame(root, game) {
  const sound = new Sound();
  const progress = loadProgress(game.id, game.levels.length);
  root.classList.add('gm-game');
  root.dataset.game = game.id;
  root.innerHTML = `
    <div class="gm-stage" data-screen="menu">
      <canvas class="gm-canvas gm-canvas--gl" aria-hidden="true"></canvas>
      <canvas class="gm-canvas" aria-label="${game.title} playfield" role="img"></canvas>
      <div class="gm-hud" hidden>
        <button type="button" class="fw-iconbtn gm-hud__btn" data-act="pause" aria-label="Pause" data-tip="Pause (Esc)">${icon('pause', { size: 20 })}</button>
        <div class="gm-hud__mid">
          <div class="gm-hud__level" data-ref="level"></div>
          <div class="gm-hud__bar"><span data-ref="bar"></span></div>
        </div>
        <div class="gm-hud__score"><span class="gm-hud__label" data-ref="label"></span><span class="fw-num" data-ref="score">0</span></div>
      </div>
      <div class="gm-hint" data-ref="hint" hidden></div>
      <section class="gm-screen gm-menu" aria-label="${game.title} menu">
        <div class="gm-card">
          ${game.art ? `<img class="gm-art" src="${game.art}" alt="" decoding="async">` : ''}
          <header class="gm-menu__head">
            <h2 class="gm-title">${game.title}</h2>
            <p class="gm-tagline">${game.tagline}</p>
          </header>
          <button type="button" class="fw-btn fw-btn--primary fw-btn--lg gm-play" data-act="play">${icon('play', { size: 18 })}<span data-ref="playlabel">Play</span></button>
          <div class="gm-levels" role="list" aria-label="Levels" data-ref="levels"></div>
          <p class="gm-howto">${game.howTo}</p>
          ${game.credit ? `<p class="gm-credit">${game.credit}</p>` : ''}
          <div class="gm-menu__foot">
            <span class="gm-total" data-ref="total"></span>
            <button type="button" class="fw-btn fw-btn--ghost fw-btn--sm" data-act="sound" aria-pressed="true"></button>
          </div>
        </div>
      </section>
      <section class="gm-screen gm-pause" aria-label="Paused" hidden>
        <div class="gm-card gm-card--small">
          <h2 class="gm-title">Paused</h2>
          <button type="button" class="fw-btn fw-btn--primary fw-btn--lg" data-act="resume">${icon('play', { size: 18 })}Resume</button>
          <button type="button" class="fw-btn" data-act="restart">${icon('rotate-ccw', { size: 16 })}Restart level</button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="menu">${icon('layout-grid', { size: 16 })}All levels</button>
        </div>
      </section>
      <section class="gm-screen gm-result" aria-label="Result" aria-live="polite" hidden>
        <div class="gm-card gm-card--small">
          <p class="gm-result__kicker" data-ref="kicker"></p>
          <h2 class="gm-title" data-ref="rtitle"></h2>
          <div class="gm-result__stars" data-ref="rstars"></div>
          <p class="gm-result__reason" data-ref="reason"></p>
          <dl class="gm-result__score"><div><dt>Score</dt><dd class="fw-num" data-ref="rscore"></dd></div><div><dt>Best</dt><dd class="fw-num" data-ref="rbest"></dd></div></dl>
          <button type="button" class="fw-btn fw-btn--primary fw-btn--lg" data-act="next">Next level${icon('arrow-right', { size: 18 })}</button>
          <button type="button" class="fw-btn" data-act="retry">${icon('rotate-ccw', { size: 16 })}Try again</button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="menu">${icon('layout-grid', { size: 16 })}All levels</button>
        </div>
      </section>
    </div>`;
  const stage = root.querySelector('.gm-stage');
  const canvas = root.querySelector('canvas:not(.gm-canvas--gl)');
  const glCanvas = root.querySelector('.gm-canvas--gl');
  const g = canvas.getContext('2d');
  // The 3D view (Three.js) loads on first activation; until then, or without WebGL, the 2D renderer draws everything.
  let gl = null, glLoading = false, glScale = 1, slowFrames = 0;
  // 3D renders at up to 1.5× (the crisp 2D overlay keeps the full ratio); slow devices step down to 1× and lose shadows.
  const glDpr = () => Math.min(view.dpr, 1.5) * glScale;
  function adapt(frameMs) {
    if (!gl || glScale < 1) return;
    slowFrames = frameMs > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 45) {
      glScale = Math.max(0.67, 1 / Math.min(view.dpr, 1.5));
      gl.renderer.shadowMap.enabled = false;
      gl.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      gl.resize(view.w, view.h, glDpr());
    }
  }
  function loadGl() {
    if (glLoading || !game.view3d || !hasWebGL()) return;
    glLoading = true;
    game.view3d().then((mod) => {
      gl = mod.create(glCanvas);
      gl.resize(view.w, view.h, glDpr());
      stage.classList.add('is-3d');
      draw();
    }).catch((err) => { console.warn('[games] 3D view unavailable, using 2D', err); gl = null; });
  }
  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const screens = { menu: root.querySelector('.gm-menu'), pause: root.querySelector('.gm-pause'), result: root.querySelector('.gm-result') };
  const hud = root.querySelector('.gm-hud');
  const view = { w: 1, h: 1, dpr: 1, dark: isDark(), reduced: reducedMotion(), time: 0 };

  let session = null, level = 0, screen = 'menu', active = false, raf = 0, lastT = 0, acc = 0, endTimer = 0, hintTimer = 0, resultAt = 0;
  let preview = null;

  function setScreen(name) {
    screen = name;
    stage.dataset.screen = name;
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    hud.hidden = !(name === 'play' || name === 'pause');
    document.body.classList.toggle('gm-playing', name === 'play' || name === 'pause');
    const focusEl = name === 'menu' ? root.querySelector('[data-act="play"]') : name === 'pause' ? root.querySelector('[data-act="resume"]')
      : name === 'result' ? root.querySelector('.gm-result [data-act]:not([hidden])') : null;
    if (focusEl && active) focusEl.focus({ preventScroll: true });
    if (name === 'play') canvas.focus?.({ preventScroll: true });
  }

  function nextOpenLevel() {
    const firstUnplayed = progress.stars.findIndex((s) => s === 0);
    return firstUnplayed === -1 ? game.levels.length - 1 : firstUnplayed;
  }

  function renderMenu() {
    const list = ref('levels');
    list.innerHTML = game.levels.map((lv, i) => {
      const open = isUnlocked(progress, i), stars = progress.stars[i];
      const name = `Level ${i + 1}: ${lv.name}` + (open ? `, ${stars} of 3 stars` : ', locked');
      return `<button type="button" role="listitem" class="gm-level${open ? '' : ' is-locked'}${i === nextOpenLevel() ? ' is-next' : ''}" data-level="${i}" ${open ? '' : 'disabled'} aria-label="${name}" title="${lv.name}">
        <span class="gm-level__n">${open ? i + 1 : icon('lock', { size: 16 })}</span><span class="gm-level__stars">${starsHtml(stars)}</span></button>`;
    }).join('');
    const total = progress.stars.reduce((a, b) => a + b, 0);
    ref('total').innerHTML = `${icon('star', { size: 14 })}<span class="fw-num">${total}</span> / ${game.levels.length * 3}`;
    const n = nextOpenLevel();
    ref('playlabel').textContent = progress.stars.some((s) => s) ? `Play level ${n + 1}` : 'Play';
    syncSoundButton();
  }
  function syncSoundButton() {
    const b = root.querySelector('[data-act="sound"]');
    b.innerHTML = `${icon(sound.on ? 'volume-2' : 'volume-x', { size: 16 })}${sound.on ? 'Sound on' : 'Sound off'}`;
    b.setAttribute('aria-pressed', String(sound.on));
  }

  // ── sizing and drawing ──
  function resize() {
    const r = stage.getBoundingClientRect();
    view.w = Math.max(1, Math.round(r.width)); view.h = Math.max(1, Math.round(r.height));
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
    if (gl) gl.resize(view.w, view.h, glDpr());
    draw();
  }
  function draw() {
    const s = session || preview || (preview = game.create(screen === 'menu' ? nextOpenLevel() : level, { sound, preview: true }));
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    if (gl) {
      try { gl.render(s, view); } catch (err) { console.error('[games] 3D render failed, using 2D', err); gl = null; stage.classList.remove('is-3d'); }
    }
    view.gl = gl;
    s.render(g, view);
    view.gl = null;
  }
  function syncHud() {
    if (!session) return;
    const h = session.hud();
    ref('score').textContent = String(Math.round(h.score || 0));
    ref('label').textContent = h.label || '';
    const bar = ref('bar');
    bar.parentElement.hidden = h.progress == null;
    if (h.progress != null) bar.style.transform = `scaleX(${clamp(h.progress, 0, 1)})`;
  }

  // ── loop ──
  function frame(t) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
    if (screen === 'play') adapt(dt * 1000);
    // The level keeps animating behind the result card for a few seconds (confetti, the squad walking on).
    const animate = screen === 'play' || (screen === 'result' && performance.now() - resultAt < 6000);
    if (animate && session) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) { step(); acc -= STEP; steps++; }
      if (steps === 6) acc = 0;
      syncHud();
    }
    view.time = t / 1000;
    draw();
    if (animate) raf = requestAnimationFrame(frame);
  }
  function step() {
    session.update(STEP);
    if (session.result && !endTimer) endTimer = performance.now();
    if (session.result && performance.now() - endTimer > (session.result.won ? 900 : 1100)) finish(session.result);
  }
  function startLoop() { if (!raf && active) { lastT = 0; raf = requestAnimationFrame(frame); } }

  function startLevel(i) {
    sound.unlock();
    level = i; endTimer = 0; acc = 0;
    session = game.create(i, { sound, preview: false });
    preview = null;
    ref('level').textContent = `${i + 1} · ${game.levels[i].name}`;
    setScreen('play');
    const hint = ref('hint');
    const text = session.hint || game.levels[i].hint;
    clearTimeout(hintTimer);
    hint.hidden = !text; hint.textContent = text || '';
    if (text) hintTimer = setTimeout(() => { hint.hidden = true; }, 3200);
    syncHud();
    if (active) draw(); // lay the board out now, so input in the very first frame lands where it is drawn
    startLoop();
  }
  function finish(result) {
    if (screen !== 'play') return;
    const stars = result.won ? clamp(result.stars | 0, 1, 3) : 0;
    const before = progress.best[level] || 0;
    if (result.won) saveResult(game.id, progress, level, stars, result.score | 0);
    sound.play(result.won ? 'win' : 'lose');
    ref('kicker').textContent = `Level ${level + 1}`;
    ref('rtitle').textContent = result.won ? (stars === 3 ? 'Perfect!' : 'Level complete') : 'Failed';
    ref('rstars').innerHTML = starsHtml(stars, ' gm-star--pop');
    ref('rstars').setAttribute('aria-label', `${stars} of 3 stars`);
    ref('reason').textContent = result.reason || '';
    ref('rscore').textContent = String(result.score | 0);
    ref('rbest').textContent = String(Math.max(before, result.won ? result.score | 0 : 0));
    root.querySelector('.gm-result').dataset.won = String(!!result.won);
    const next = root.querySelector('[data-act="next"]');
    next.hidden = !result.won || level >= game.levels.length - 1;
    root.querySelector('[data-act="retry"]').classList.toggle('fw-btn--primary', !result.won || level >= game.levels.length - 1);
    resultAt = performance.now();
    setScreen('result');
    startLoop();
  }
  function pause() { if (screen === 'play') { setScreen('pause'); draw(); } }
  function resume() { if (screen === 'pause') { setScreen('play'); startLoop(); } }
  function toMenu() { session = null; preview = null; renderMenu(); setScreen('menu'); draw(); }

  // ── input ──
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => {
    if (screen !== 'play' || !session) return;
    sound.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    session.pointer('down', ...pos(e), e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => { if (screen === 'play' && session) session.pointer('move', ...pos(e), e); });
  const up = (e) => { if (session) session.pointer('up', ...pos(e), e); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS: no page scroll or double-tap zoom while playing.
  stage.addEventListener('touchmove', (e) => { if (screen === 'play') e.preventDefault(); }, { passive: false });

  root.addEventListener('click', (e) => {
    const lv = e.target.closest('.gm-level[data-level]');
    if (lv && !lv.disabled) { sound.unlock(); sound.play('click'); startLevel(Number(lv.dataset.level)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sound.unlock();
    if (act !== 'pause') sound.play('click');
    if (act === 'play') startLevel(nextOpenLevel());
    else if (act === 'pause') pause();
    else if (act === 'resume') resume();
    else if (act === 'restart' || act === 'retry') startLevel(level);
    else if (act === 'next') startLevel(Math.min(level + 1, game.levels.length - 1));
    else if (act === 'menu') toMenu();
    else if (act === 'sound') { sound.toggle(); syncSoundButton(); }
  });
  window.addEventListener('keydown', (e) => {
    if (!active || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (screen === 'play' && session) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { pause(); e.preventDefault(); return; }
      if (e.key === 'r' || e.key === 'R') { startLevel(level); e.preventDefault(); return; }
      if (session.key(e.code, true, e)) e.preventDefault();
    } else if (screen === 'pause' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) { resume(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (active && screen === 'play' && session && session.key(e.code, false, e)) e.preventDefault(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => pause());
  window.addEventListener('fw-games-texture', () => { if (active && !raf) draw(); });
  const ro = new ResizeObserver(() => { if (active) resize(); });
  ro.observe(stage);
  const retheme = () => { view.dark = isDark(); if (active) draw(); };
  document.addEventListener('oo-theme-change', retheme);
  window.addEventListener('fw-theme-change', retheme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', retheme);

  renderMenu();
  setScreen('menu');

  const controller = {
    activate() { if (active) return; active = true; resize(); loadGl(); if (screen === 'play' || screen === 'result') startLoop(); },
    deactivate() { pause(); active = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
  // Test hooks (also handy from the console): state, deterministic fast-forward, jump to a result.
  window.__fwGames = window.__fwGames || {};
  window.__fwGames[game.id] = {
    get screen() { return screen; },
    get gl() { return !!gl; },
    get level() { return level; },
    get session() { return session; },
    progress: () => JSON.parse(JSON.stringify(progress)),
    start: (i) => startLevel(i),
    /** Run the simulation for `seconds` of game time right now (no rendering); stops at a result. */
    fastForward(seconds) {
      if (!session) return null;
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n && screen === 'play'; i++) { session.update(STEP); if (session.result) break; }
      if (session.result) finish(session.result);
      syncHud(); draw();
      return session.result || null;
    },
    finish: (result) => finish(result),
    reset() { writeJSON(game.id, {}); const fresh = loadProgress(game.id, game.levels.length); progress.stars = fresh.stars; progress.best = fresh.best; toMenu(); },
  };
  return controller;
}
