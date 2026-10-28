/**
 * Fernwork Games · shared frame for every game on tools/games.html.
 *
 * mountGame(root, game) builds the kit-styled screens around a game's canvas: the menu with level select and saved
 * stars, the HUD (pause, level, progress, score), pause and result screens, and runs a fixed-step loop (60 Hz) while a
 * level is playing. Games only implement the simulation and drawing:
 *
 *   game = { id, title, tagline, howTo, levels: [{ name, world, boss }], create(levelIndex, env) → session, hero }
 *     levels with a `world` (0–3) get the 3D overworld as their menu (overworld.js); progress, stars, best scores
 *     and coins live in the shared profile (profile.js) under level ids w<world>-<nn> / w<world>-boss.
 *   session.update(dt)                    advance the simulation; set session.result = { won, score, stars, reason }
 *   session.render(g, view)               draw (view: { w, h, dpr, dark, reduced, time })
 *   session.pointer(type, x, y)           'down' | 'move' | 'up' in CSS px relative to the canvas
 *   session.key(code, down)               return true when handled
 *   session.hud()                         { progress: 0..1 | null, score, label }
 *   env = { sound, preview, hint }        preview: built only to draw the menu backdrop (no input, no updates);
 *                                         hint(id) asks for a one-time mechanic tip (games-help.js TIPS)
 *
 * Help: a "How to play" card per game (games-help.js HELP) opens from the "?" buttons (menu corner, HUD, pause card,
 * H key), by itself on a game's very first level, and pauses the level while it is open. Mechanic tips show once each
 * as a small banner when their mechanic first turns up.
 *
 * Tests reach the running game through window.__fwGames[game.id] (state, fast-forward, finish).
 */
import { formatLoadProgress, loadingCacheStats } from '../../games-assets/fernworld/runtime/loading-cache.js';
import { icon } from '../../../assets/kit/icons.js';
import * as Profile from './profile.js';
import { HELP, TIPS, glyph, introSeen, markIntro, tipSeen, markTip, tipsOn, setTipsOn, tipText } from './games-help.js';

const KEY = 'fw:games:';
export function readJSON(key, fallback) {
  try { const raw = localStorage.getItem(KEY + key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
}
export function writeJSON(key, value) {
  try { localStorage.setItem(KEY + key, JSON.stringify(value)); } catch { /* private mode: progress stays in memory */ }
}

/**
 * A game's levels mapped onto the shared profile: level i → { world (1-based), n (1… or 'boss'), id }. Levels without
 * a world count as world 1 in order.
 */
export function levelKeys(levels) {
  const seen = new Map();
  return levels.map((lv) => {
    const w = (lv.world ?? 0) + 1;
    const n = lv.boss ? 'boss' : (seen.get(w) ?? 0) + 1;
    if (!lv.boss) seen.set(w, n);
    return { world: w, n, id: Profile.levelId(w, n) };
  });
}
/** Progress view of one game: stars and best per level index, which levels and worlds are open. */
export function gameProgress(gameId, levels) {
  const keys = levelKeys(levels);
  const g = () => Profile.game(gameId);
  return {
    keys,
    get stars() { return keys.map((k) => g().stars[k.id] || 0); },
    get best() { return keys.map((k) => g().best[k.id] || 0); },
    star: (i) => g().stars[keys[i].id] || 0,
    bestOf: (i) => g().best[keys[i].id] || 0,
    open: (i) => Profile.levelOpen(gameId, keys[i].world, keys[i].n),
    worldOpen: (w) => Profile.worldOpen(gameId, w + 1),
    finish: (i, result) => Profile.finishLevel(gameId, keys[i].id, result),
  };
}

// ─────────────────────────────── sound (synthesised, no files) ───────────────────────────────
const soundChannels = new Set();
export class Sound {
  constructor() { this.on = readJSON('sound', true) !== false; this.ctx = null; this.last = new Map(); soundChannels.add(this); }
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
  toggle() {
    const enabled = !this.on;
    writeJSON('sound', enabled);
    // All four games share the saved preference, including already mounted games.
    for (const channel of soundChannels) {
      channel.on = enabled;
      if (!enabled) channel.ctx?.suspend?.().catch(() => {});
      channel.onChange?.();
    }
    if (enabled) this.unlock();
    return enabled;
  }
  dispose() { soundChannels.delete(this); this.ctx?.close?.().catch(() => {}); }
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
// asked once per page; the probe's context is released right away (browsers cap the live WebGL contexts)
let webgl = null;
const hasWebGL = () => {
  if (webgl === null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      webgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { webgl = false; }
  }
  return webgl;
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
};

export function mountGame(root, game) {
  const sound = new Sound();
  const progress = game.createProgress?.(Profile, game.levels) ?? gameProgress(game.id, game.levels);
  const starters = game.starters ?? [];
  let selectedStarter = readJSON(`starter:${game.id}`, starters[0]?.id);
  if (!starters.some(s => s.id === selectedStarter)) selectedStarter = starters[0]?.id;
  let runStarter = selectedStarter;
  const worlds = game.levels.some((lv) => lv.world != null);
  root.classList.add('gm-game');
  root.dataset.game = game.id;
  root.innerHTML = `
    <div class="gm-stage" data-screen="menu">
      <canvas class="gm-canvas gm-canvas--gl" aria-hidden="true"></canvas>
      <canvas class="gm-canvas" aria-label="${game.title} playfield" role="img"></canvas>
      <div class="gm-hud" hidden>
        <button type="button" class="fw-iconbtn gm-hud__btn" data-act="pause" aria-label="Pause" data-tip="Pause (Esc)">${icon('pause', { size: 20 })}</button>
        <button type="button" class="fw-iconbtn gm-hud__btn" data-act="restart" aria-label="Restart level" title="Restart level (R)" data-tip="Restart level (R)">${icon('rotate-ccw', { size: 20 })}</button>
        <button type="button" class="fw-iconbtn gm-hud__btn" data-act="help" aria-label="How to play" data-tip="How to play (H)">${icon('circle-help', { size: 20 })}</button>
        <button type="button" class="fw-iconbtn gm-hud__btn" data-act="puzzle-hint" aria-label="Owlberts Rätselhinweis" title="Owlberts Rätselhinweis" hidden>?</button>
        <div class="gm-hud__status">
        <div class="gm-hud__mid">
          <div class="gm-hud__level" data-ref="level"></div>
          <div class="gm-hud__bar"><span data-ref="bar"></span></div>
        </div>
        <div class="gm-hud__score"><span class="gm-hud__label" data-ref="label"></span><span class="fw-num" data-ref="score">0</span></div>
        </div>
        <button type="button" class="fw-iconbtn gm-hud__btn" data-act="fullscreen" aria-label="Full screen" data-tip="Full screen (F)">${icon('maximize', { size: 20 })}</button>
      </div>
      <button type="button" class="fw-iconbtn gm-hud__btn gm-fs" data-act="fullscreen" aria-label="Full screen" data-tip="Full screen (F)">${icon('maximize', { size: 20 })}</button>
      <button type="button" class="fw-iconbtn gm-hud__btn gm-helpbtn" data-act="help" aria-label="How to play" data-tip="How to play (H)">${icon('circle-help', { size: 20 })}</button>
      <div class="gm-hint" data-ref="hint" hidden></div>
      <div class="gm-tip" role="status" aria-live="polite" hidden>
        <span class="gm-tip__icon" data-ref="tipicon"></span><span class="gm-tip__text" data-ref="tiptext"></span>
        <button type="button" class="gm-tip__close" data-act="tip-close" aria-label="Dismiss tip">${icon('x', { size: 18 })}</button>
      </div>
      <section class="gm-screen gm-menu" aria-label="${game.title} menu">
        <div class="gm-owhost" hidden></div>
        ${starters.length ? `<label class="gm-starter-picker">Dein Fernling
          <select data-ref="starter" aria-label="Deinen Fernling wählen">${starters.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
          <span data-ref="starter-description"></span></label>` : ''}
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
      <section class="gm-screen gm-loading" aria-live="polite" hidden>
        <div class="gm-card gm-card--small">
          <h2 class="gm-title" data-ref="loading-title">Dein Abenteuer wird vorbereitet</h2>
          <p data-ref="loading-message">Spieldaten laden …</p>
          <progress class="gm-loading__progress" data-ref="loading-progress" aria-label="Aktueller Ladeschritt"></progress>
          <small data-ref="loading-detail">Modelle · Bewegungen · Licht</small>
          <button type="button" class="fw-btn fw-btn--primary" data-act="load-retry" hidden>Erneut versuchen</button>
          <button type="button" class="fw-btn fw-btn--primary" data-act="load-reload" hidden>Seite neu laden</button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="menu">Zur Karte</button>
        </div>
      </section>
      <section class="gm-screen gm-pause" aria-label="Paused" hidden>
        <div class="gm-card gm-card--small">
          <h2 class="gm-title">Paused</h2>
          <button type="button" class="fw-btn fw-btn--primary fw-btn--lg" data-act="resume">${icon('play', { size: 18 })}Resume</button>
          <button type="button" class="fw-btn" data-act="restart">${icon('rotate-ccw', { size: 16 })}Restart level</button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="help">${icon('circle-help', { size: 16 })}How to play</button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="sound" aria-pressed="true"></button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="menu">${icon('layout-grid', { size: 16 })}All levels</button>
        </div>
      </section>
      <section class="gm-screen gm-result" aria-label="Result" aria-live="polite" hidden>
        <div class="gm-card gm-card--small">
          <p class="gm-result__kicker" data-ref="kicker"></p>
          <h2 class="gm-title" data-ref="rtitle"></h2>
          <div class="gm-result__stars" data-ref="rstars"></div>
          <p class="gm-result__reason" data-ref="reason"></p>
          <dl class="gm-result__score"><div><dt>Score</dt><dd class="fw-num" data-ref="rscore"></dd></div><div><dt>Best</dt><dd class="fw-num" data-ref="rbest"></dd></div><div data-ref="rcoinsbox" hidden><dt>Coins</dt><dd class="fw-num" data-ref="rcoins"></dd></div></dl>
          <button type="button" class="fw-btn fw-btn--primary fw-btn--lg" data-act="next">Next level${icon('arrow-right', { size: 18 })}</button>
          <button type="button" class="fw-btn" data-act="retry">${icon('rotate-ccw', { size: 16 })}Restart level</button>
          <button type="button" class="fw-btn fw-btn--ghost" data-act="menu">${icon('layout-grid', { size: 16 })}All levels</button>
        </div>
      </section>
      <section class="gm-help" role="dialog" aria-modal="true" aria-labelledby="gm-help-${game.id}-title" hidden>
        <div class="gm-help__card">
          <header class="gm-help__head">
            <div><p class="gm-help__kicker">How to play</p><h2 class="gm-help__title" id="gm-help-${game.id}-title">${game.title}</h2></div>
            <button type="button" class="fw-iconbtn gm-help__close" data-act="help-close" aria-label="Close">${icon('x', { size: 20 })}</button>
          </header>
          <p class="gm-help__goal"><span class="gm-help__icon">${glyph('goal')}</span><span data-ref="helpgoal"></span></p>
          <div class="fw-seg gm-help__tabs" role="tablist" aria-label="Controls">
            <button type="button" role="tab" class="fw-seg__opt" id="gm-help-${game.id}-touch" data-act="help-tab" data-mode="touch" aria-controls="gm-help-${game.id}-panel">${icon('hand', { size: 18 })}Touch</button>
            <button type="button" role="tab" class="fw-seg__opt" id="gm-help-${game.id}-keys" data-act="help-tab" data-mode="keys" aria-controls="gm-help-${game.id}-panel">${icon('keyboard', { size: 18 })}Mouse &amp; keys</button>
          </div>
          <ul class="gm-help__list" role="tabpanel" id="gm-help-${game.id}-panel" data-ref="helpcontrols"></ul>
          <ul class="gm-help__list gm-help__rules" aria-label="Rules" data-ref="helprules"></ul>
          <div class="gm-help__foot">
            <label class="fw-check gm-help__opt"><input type="checkbox" data-ref="helptips">Tips while playing</label>
            <button type="button" class="fw-btn fw-btn--primary gm-help__done" data-act="help-close">Got it</button>
          </div>
        </div>
      </section>
    </div>`;
  const stage = root.querySelector('.gm-stage');
  const canvas = root.querySelector('canvas:not(.gm-canvas--gl)');
  const glCanvas = root.querySelector('.gm-canvas--gl');
  const g = canvas.getContext('2d');
  // The 3D view (Three.js) loads on first activation; until then, or without WebGL, the 2D renderer draws everything.
  let gl = null, glLoading = null, glScale = 1, slowFrames = 0;
  let levelRequest = 0, preparedSession = null, prepareQueue = Promise.resolve();
  let loadController = null, prefetchController = null, prefetchTimer = 0, loadingMap = false;
  const loadHistory = []; let currentLoad = null;
  function cancelPrefetch() { clearTimeout(prefetchTimer); prefetchController?.abort(); prefetchController = null; }
  function reportProgress(event, request = levelRequest) {
    if (request !== levelRequest || screen !== 'loading' || currentLoad?.error) return;
    ref('loading-message').textContent = formatLoadProgress(event);
    const bar = ref('loading-progress');
    if (event.phase === 'download' && event.total > 0 && !event.done) { bar.max = event.total; bar.value = Math.min(event.loaded, event.total); }
    else bar.removeAttribute('value');
    if (currentLoad) {
      if(event.done&&Number.isFinite(event.milliseconds))currentLoad.millisecondsByPhase[event.phase]=(currentLoad.millisecondsByPhase[event.phase]??0)+event.milliseconds;
      currentLoad.events.push({ at: performance.now() - currentLoad.started, ...event });
      if (currentLoad.events.length > 256) currentLoad.events.shift();
      if (event.phase === 'download' && event.url && !event.cacheHit) currentLoad.bytes.set(event.url, event.loaded ?? 0);
      const count = currentLoad.bytes.size, total = [...currentLoad.bytes.values()].reduce((a,b)=>a+b,0);
      ref('loading-detail').textContent = count ? `${count} Dateien · ${(total/1048576).toLocaleString('de',{maximumFractionDigits:1})} MB geladen · danach Modelle und Licht` : 'Modelle · Bewegungen · Licht';
    }
  }
  function schedulePrefetch(i) {
    cancelPrefetch();
    if (!active || screen !== 'menu' || !progress.open(i)) return;
    // Selection debounce, never a simulated loading percentage or eager world sweep.
    prefetchTimer = setTimeout(async () => {
      const controller = new AbortController(); prefetchController = controller;
      try {
        await ow?.ready;
        if (controller.signal.aborted || !active || screen !== 'menu') return;
        const renderer = await loadGl();
        if (controller.signal.aborted || !active || screen !== 'menu' || !renderer?.prefetch) return;
        const candidate = game.create(i, { sound, preview: true, starter: selectedStarter, hint: () => false });
        await renderer.prefetch(candidate, { signal: controller.signal });
      } catch (error) { if (error.name !== 'AbortError') console.warn('[games] selected level prefetch deferred', error); }
    }, 700);
  }
  // 3D renders at up to 1.5× (the crisp 2D overlay keeps the full ratio). Only a device that keeps missing frames
  // steps its 3D resolution down (85 %, then 70 %); everything else, shadows included, stays as it is.
  const glDpr = () => Math.min(view.dpr, 1.5) * glScale;
  function adapt(frameMs) {
    if (!gl || glScale <= 0.7) return;
    slowFrames = frameMs > 24 ? slowFrames + 1 : Math.max(0, slowFrames - 0.5);
    if (slowFrames > 90) {
      slowFrames = 0;
      glScale = glScale > 0.9 ? 0.85 : 0.7;
      gl.resize(view.w, view.h, glDpr());
    }
  }
  // Rolling frame cost in ms (exponential average) for the test hook and tuning.
  const perf = { update: 0, gl: 0, overlay: 0, frame: 0 };
  const avg = (k, v) => { perf[k] = perf[k] * 0.9 + v * 0.1; };
  function loadGl() {
    if (!game.view3d || !hasWebGL()) return Promise.resolve(null);
    if (gl) return Promise.resolve(gl);
    if (glLoading) return glLoading;
    glLoading = game.view3d().then((mod) => {
      gl = mod.create(glCanvas);
      window.__glView = gl;
      gl.resize(view.w, view.h, glDpr());
      stage.classList.add('is-3d');
      return gl;
    }).catch((err) => { gl = null; glLoading = null; throw err; });
    return glLoading;
  }
  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const screens = { menu: root.querySelector('.gm-menu'), pause: root.querySelector('.gm-pause'), result: root.querySelector('.gm-result'), loading: root.querySelector('.gm-loading') };
  const hud = root.querySelector('.gm-hud');
  // keyboard: a mouse-and-keyboard device, or someone who pressed a key; games show key hints only then
  const view = { w: 1, h: 1, dpr: 1, dark: isDark(), reduced: reducedMotion(), time: 0, keyboard: !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches };

  let startedAt = 0;
  let session = null, level = 0, screen = 'menu', active = false, raf = 0, lastT = 0, acc = 0, settlementTime = 0, hintTimer = 0, hintAt = 0, resultAt = 0;
  let preview = null;
  const starterSelect = ref('starter');
  function syncStarter() {
    if (!starterSelect) return;
    starterSelect.value = selectedStarter;
    ref('starter-description').textContent = starters.find(s => s.id === selectedStarter)?.description ?? '';
  }
  function chooseStarter(id) {
    if (screen !== 'menu' || !starters.some(s => s.id === id)) return;
    selectedStarter = id;
    writeJSON(`starter:${game.id}`, selectedStarter);
    preview = null;
    syncStarter();
    ow?.refreshHero?.();
    schedulePrefetch(lastPicked ?? nextOpenLevel());
  }
  starterSelect?.addEventListener('change', () => chooseStarter(starterSelect.value));
  syncStarter();

  function setScreen(name) {
    if(screen==='play'&&name!=='play')session?.cancelInput?.();
    screen = name;
    stage.dataset.screen = name;
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name && !(key === 'menu' && name === 'loading' && loadingMap);
    screens.menu.inert = name === 'loading';
    if (ow) { if (name === 'menu' && active) { ow.refresh(); ow.activate(); } else ow.deactivate(); }
    hud.hidden = !(name === 'play' || name === 'pause');
    if (active) document.body.classList.toggle('gm-playing', name === 'play' || name === 'pause');
    const focusEl = helpOpen ? null : name === 'menu' ? root.querySelector('[data-act="play"]') : name === 'pause' ? root.querySelector('[data-act="resume"]')
      : name === 'result' ? root.querySelector('.gm-result [data-act]:not([hidden])') : null;
    if (focusEl && active) focusEl.focus({ preventScroll: true });
    if (name === 'play' && !helpOpen) canvas.focus?.({ preventScroll: true });
    if (name !== 'play') clearTips();
  }

  function nextOpenLevel() {
    const stars = progress.stars;
    let last = 0;
    for (let i = 0; i < stars.length; i++) {
      if (!progress.open(i)) continue;
      if (stars[i] === 0) return i;
      last = i;
    }
    return last;
  }

  // the overworld replaces the level grid once WebGL is there; it loads with the first activation
  let ow = null, owLoading = null;
  function loadOverworld() {
    if (!worlds || owLoading || !hasWebGL()) return owLoading;
    const host = root.querySelector('.gm-owhost');
    owLoading = import('./overworld.js').then((m) => {
      ow = m.mountOverworld(host, {
        gameId: game.id, levels: game.levels, hero: game.hero, companion: game.companion, title: game.title,
        getHero: starters.length ? () => selectedStarter.toUpperCase() : undefined,
        starters, onStarter: chooseStarter,
        getSound: () => sound.on, onSound: () => sound.toggle(),
        state: {
          stars: progress.star, best: progress.bestOf, open: progress.open, worldOpen: progress.worldOpen,
          need: (w) => game.worldRequirement?.(w) ?? (w === 4
            ? 'Complete the Vulkara campaign to unlock Sturmbastion.'
            : `Beat the World ${w} boss and collect ${Profile.STAR_GATES[w]} stars`),
          current: () => lastPicked ?? nextOpenLevel(),
        },
        onSelect: (i) => schedulePrefetch(i),
        onProgress: (event) => { if (screen === 'loading') reportProgress(event); },
        onPlay: (i) => { lastPicked = i; sound.unlock(); sound.play('click'); startLevel(i); },
      });
      host.hidden = false;
      screens.menu.classList.add('has-ow');
      if (screen === 'menu' && active) ow.activate();
      ow.ready?.then(() => schedulePrefetch(ow.selected ?? lastPicked ?? nextOpenLevel()));
      return ow;
    }).catch((err) => {
      console.warn('[games] overworld unavailable, using the level grid', err); ow = null;
      host.hidden = true; screens.menu.classList.remove('has-ow');
    });
    return owLoading;
  }
  let lastPicked = null;

  function renderMenu() {
    const list = ref('levels');
    list.innerHTML = game.levels.map((lv, i) => {
      const open = progress.open(i), stars = progress.stars[i];
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
    for (const b of root.querySelectorAll('[data-act="sound"]')) {
      b.innerHTML = `${icon(sound.on ? 'volume-2' : 'volume-x', { size: 16 })}${sound.on ? 'Ton an' : 'Ton aus'}`;
      b.setAttribute('aria-pressed', String(sound.on));
    }
  }
  sound.onChange = () => { syncSoundButton(); ow?.syncSound?.(); };

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
    if (screen === 'loading') return;
    if (ow && screen === 'menu') { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); return; }
    const s = session || preview || (preview = game.create(screen === 'menu' ? nextOpenLevel() : level, { sound, preview: true, starter: selectedStarter, hint: () => false }));
    if (s === session && Number.isFinite(s.levelHintUntil) && s.t >= s.levelHintUntil) ref('hint').hidden = true;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    let t0 = performance.now();
    if (gl && preparedSession === s) {
      try { gl.render(s, view); } catch (err) { showLoadError(err); return; }
    }
    const t1 = performance.now(); avg('gl', t1 - t0); t0 = t1;
    view.gl = preparedSession === s ? gl : null;
    s.render(g, view);
    view.gl = null;
    avg('overlay', performance.now() - t0);
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
    if (!active || helpOpen) return; // the help card pauses everything; closing it restarts the loop
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
    if (screen === 'play') { adapt(dt * 1000); avg('frame', dt * 1000); }
    // The level keeps animating behind the result card for a few seconds (confetti, the squad walking on).
    const animate = screen === 'play' || (screen === 'result' && performance.now() - resultAt < 6000);
    if (animate && session) {
      acc += dt;
      let steps = 0;
      const tu = performance.now();
      while (acc >= STEP && steps < 6) { step(); acc -= STEP; steps++; }
      if (steps) avg('update', (performance.now() - tu) / steps);
      if (steps === 6) acc = 0;
      syncHud();
    }
    view.time = t / 1000;
    draw();
    if (animate) raf = requestAnimationFrame(frame);
  }
  function step() {
    session.update(STEP);
    tipTick();
    if (session.result) settlementTime += STEP;
    const resultReady = !session.result || (typeof session.resultReady === 'function' ? session.resultReady() : session.resultReady !== false);
    const settlement = Math.max(session.result?.won ? .9 : 1.1, Number(session.settlementSeconds) || 0);
    if (session.result && resultReady && settlementTime >= settlement) finish(session.result);
  }
  function startLoop() { if (!raf && active) { lastT = 0; raf = requestAnimationFrame(frame); } }

  function showLoadError(error) {
    console.error('[games] region could not be prepared', error);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    setScreen('loading');
    ref('loading-title').textContent = 'Das Abenteuer konnte nicht geladen werden';
    const updated=error?.code==='ASSET_VERSION_MISMATCH';
    ref('loading-message').textContent = updated ? 'Das Spiel wurde aktualisiert. Lade die Seite neu.' : 'Versuche es erneut. Dein Spielstand bleibt erhalten.';
    root.querySelector('[data-act="load-reload"]').hidden = !updated;
    ref('loading-progress').removeAttribute('value');
    ref('loading-progress').hidden = true;
    if (currentLoad) currentLoad.error = String(error);
    root.querySelector('[data-act="load-retry"]').hidden = updated;
  }

  async function startLevel(i, { retry = false } = {}) {
    if (!Number.isInteger(i) || i < 0 || i >= game.levels.length) return;
    const request = ++levelRequest;
    loadingMap = screen === 'menu' || (screen === 'loading' && loadingMap);
    cancelPrefetch();loadController?.abort();loadController = new AbortController();
    const signal = loadController.signal;
    currentLoad = { level:i, started:performance.now(), bytes:new Map(), millisecondsByPhase:{}, events:[] };
    loadHistory.push(currentLoad);if(loadHistory.length>12)loadHistory.shift();
    sound.unlock();
    session?.cancelInput?.();
    level = i; settlementTime = 0; acc = 0;
    if (!retry) runStarter = selectedStarter;
    session = game.create(i, { sound, preview: false, starter: runStarter, hint: requestTip });
    const preparing = session;
    preparedSession = null;
    preview = null;
    playT = 0; tickN = 0; clearTips();
    ref('loading-title').textContent = 'Dein Abenteuer wird vorbereitet';
    ref('loading-progress').hidden = false;ref('loading-progress').removeAttribute('value');
    ref('loading-message').textContent = 'Szene vorbereiten …';
    ref('loading-detail').textContent = 'Modelle · Bewegungen · Licht';
    root.querySelector('[data-act="load-retry"]').hidden = true;
    root.querySelector('[data-act="load-reload"]').hidden = true;
    setScreen('loading');
    // A cancelled load cannot overwrite a newer renderer preparation.
    const work = prepareQueue.catch(() => {}).then(async () => {
      if (request !== levelRequest) return;
      const renderer = await loadGl();
      if (request !== levelRequest) return;
      await renderer?.prepare?.(preparing, { signal, onProgress: event => reportProgress(event, request) });
      if (request === levelRequest) preparedSession = preparing;
    });
    prepareQueue = work;
    try { await work; } catch (error) { if (request === levelRequest) showLoadError(error); return; }
    if (request !== levelRequest) return;
    startedAt = performance.now();
    currentLoad.milliseconds = startedAt-currentLoad.started;currentLoad.complete = true;
    const k = progress.keys[i];
    ref('level').textContent = worlds ? `${k.n === 'boss' ? `World ${k.world} boss` : `${k.world}-${k.n}`} · ${game.levels[i].name}` : `${i + 1} · ${game.levels[i].name}`;
    setScreen(active ? 'play' : 'pause');
    const text = session.hint || game.levels[i].hint;
    // a game's very first level opens the help card first; the level's own hint follows when it closes
    root.querySelector('[data-act="puzzle-hint"]').hidden = !session?.puzzleHintAvailable;
    if (active && HELP[game.id] && !introSeen(game.id)) { markIntro(game.id); showLevelHint(''); hintAfterHelp = text; openHelp(); }
    else showLevelHint(text);
    syncHud();
    if (active) draw(); // lay the board out now, so input in the very first frame lands where it is drawn
    startLoop();
  }
  function showLevelHint(text) {
    const hint = ref('hint');
    clearTimeout(hintTimer);
    hint.hidden = !text; hint.textContent = text || '';
    hintAt = text ? performance.now() : 0;
    if (text) hintTimer = setTimeout(() => { hint.hidden = true; hintAt = 0; }, 3200);
  }
  function finish(result) {
    if (screen !== 'play') return;
    const stars = result.won ? clamp(result.stars | 0, 1, 3) : 0;
    const before = progress.bestOf(level);
    const out = progress.finish(level, { won: !!result.won, stars, score: result.score | 0, seconds: Math.round((performance.now() - startedAt) / 1000), stats: result.stats || {} });
    ref('rcoinsbox').hidden = !out.coins;
    ref('rcoins').textContent = `+${out.coins}`;
    lastPicked = result.won ? Math.min(level + 1, game.levels.length - 1) : level;
    if (!progress.open(lastPicked)) lastPicked = level;
    sound.play(result.won ? 'win' : 'lose');
    const key = progress.keys[level];
    ref('kicker').textContent = worlds ? (key.n === 'boss' ? `World ${key.world} boss` : `Level ${key.world}-${key.n}`) : `Level ${level + 1}`;
    ref('rtitle').textContent = result.won ? (stars === 3 ? 'Perfect!' : 'Level complete') : 'Failed';
    ref('rstars').innerHTML = starsHtml(stars, ' gm-star--pop');
    ref('rstars').setAttribute('aria-label', `${stars} of 3 stars`);
    ref('reason').textContent = (result.reason || '') + (out.bonusUnlocked ? ' Sturmbastion freigeschaltet! In der neuen Sonderwelt warten elf weitere Einsätze.' : '');
    ref('rscore').textContent = String(result.score | 0);
    ref('rbest').textContent = String(Math.max(before, result.won ? result.score | 0 : 0));
    root.querySelector('.gm-result').dataset.won = String(!!result.won);
    const next = root.querySelector('[data-act="next"]');
    next.hidden = !result.won || level >= game.levels.length - 1 || !progress.open(level + 1);
    root.querySelector('[data-act="retry"]').classList.toggle('fw-btn--primary', !result.won || level >= game.levels.length - 1);
    resultAt = performance.now();
    setScreen('result');
    startLoop();
  }
  function pause() { if (screen === 'play') { setScreen('pause'); draw(); } }
  function resume() { if (screen === 'pause') { setScreen('play'); startLoop(); } }
  function toMenu() { levelRequest++;loadController?.abort();cancelPrefetch(); session = null; preparedSession = null; preview = null; renderMenu(); setScreen('menu'); draw();schedulePrefetch(lastPicked ?? nextOpenLevel()); }

  // ── help: the How to play card ──
  const helpData = HELP[game.id] || null;
  const tips = TIPS[game.id] || [];
  const helpEl = root.querySelector('.gm-help'), tipEl = root.querySelector('.gm-tip');
  let helpOpen = false, helpReturn = null, helpMode = 'keys', hintAfterHelp = null;
  // which controls to explain first: the last input used, else the device (a coarse pointer without hover is touch)
  let inputMode = view.keyboard || !window.matchMedia?.('(pointer: coarse)').matches ? 'keys' : 'touch';
  // view.touch: on-screen buttons (Bounce Brigade's MINE button) show from the start on touch screens, not only
  // while a finger is down
  view.touch = inputMode === 'touch';
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const keyCaps = (k) => (k.join('') === 'WASD'
    ? `<span class="gm-help__wasd"><kbd class="fw-kbd">W</kbd><kbd class="fw-kbd">A</kbd><kbd class="fw-kbd">S</kbd><kbd class="fw-kbd">D</kbd></span>`
    : k.map((c) => (c === '…' ? '<span class="gm-help__dots">…</span>' : `<kbd class="fw-kbd">${esc(c)}</kbd>`)).join(''));
  const row = (r) => `<li class="gm-help__row"><span class="gm-help__icon">${r.g ? glyph(r.g, r.k ? 28 : 32) : ''}${r.k ? keyCaps(r.k) : ''}</span>`
    + `<span class="gm-help__text">${r.b ? `<b>${esc(r.b)}:</b> ` : ''}${esc(r.t)}</span></li>`;
  function renderHelp(mode) {
    helpMode = mode;
    ref('helpgoal').textContent = helpData.goal;
    ref('helpcontrols').innerHTML = (helpData[mode] || []).map(row).join('');
    ref('helpcontrols').setAttribute('aria-labelledby', `gm-help-${game.id}-${mode}`);
    ref('helprules').innerHTML = (helpData.rules || []).map(row).join('');
    for (const b of helpEl.querySelectorAll('[role="tab"]')) {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    }
    ref('helptips').checked = tipsOn();
  }
  function openHelp() {
    if (!helpData || helpOpen) return;
    session?.cancelInput?.();
    helpReturn = document.activeElement;
    helpOpen = true;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    renderHelp(inputMode);
    helpEl.hidden = false;
    stage.classList.add('has-help');
    root.querySelector('.gm-help__done').focus({ preventScroll: true });
  }
  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    helpEl.hidden = true;
    stage.classList.remove('has-help');
    if (hintAfterHelp != null && screen === 'play') showLevelHint(hintAfterHelp);
    hintAfterHelp = null;
    const back = helpReturn && root.contains(helpReturn) && helpReturn.offsetParent ? helpReturn : screen === 'play' ? canvas : null;
    back?.focus?.({ preventScroll: true });
    helpReturn = null;
    if (screen === 'play' || screen === 'result') startLoop();
    pumpTips();
  }
  /** Keys while the card is open: Esc closes, Tab stays inside, arrows switch the controls tab. Nothing reaches the game. */
  function helpKey(e) {
    if (e.key === 'Escape' || ((e.code === 'KeyH') && !e.target.closest?.('input'))) { closeHelp(); e.preventDefault(); return; }
    if (e.key === 'Tab') {
      const items = [...helpEl.querySelectorAll('button, input')].filter((el) => el.offsetParent && el.tabIndex >= 0);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i === items.length - 1 ? 0 : i + 1);
      items[next].focus(); e.preventDefault(); return;
    }
    const tab = e.target.closest?.('[role="tab"]');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
      renderHelp(helpMode === 'touch' ? 'keys' : 'touch');
      helpEl.querySelector(`[role="tab"][data-mode="${helpMode}"]`).focus();
      e.preventDefault();
    }
  }
  ref('helptips').addEventListener('change', (e) => { setTipsOn(e.target.checked); if (!e.target.checked) clearTips(); });
  helpEl.addEventListener('pointerdown', (e) => { if (e.target === helpEl) e.preventDefault(); }); // a tap beside the card does nothing

  // ── mechanic tips: once each, a small banner while playing (games-help.js TIPS) ──
  let tipQueue = [], tipShown = null, tipTimer = 0, playT = 0, tickN = 0;
  /** Called after every simulation step: play time, and a look at the tips four times a second. */
  function tipTick() {
    playT += STEP;
    if (++tickN >= 15) { tickN = 0; checkTips(); }
  }
  function checkTips() {
    if (!session || session.result || !tips.length || !tipsOn()) return;
    const ctx = { t: playT, mode: inputMode, level };
    for (const tip of tips) {
      if (tip === tipShown || tipQueue.includes(tip) || tipSeen(game.id, tip.id)) continue;
      try {
        if (tip.done?.(session, ctx)) { markTip(game.id, tip.id); continue; }
        if (tip.when(session, ctx)) tipQueue.push(tip);
      } catch { /* a field the tip reads is gone: it stays quiet */ }
    }
    tipQueue.sort((a, b) => tips.indexOf(a) - tips.indexOf(b)); // the list order is the priority
    pumpTips();
  }
  /** env.hint(id): a game asks for one of its tips now. */
  function requestTip(id) {
    const tip = tips.find((t) => t.id === id);
    if (!tip || !tipsOn() || tip === tipShown || tipQueue.includes(tip) || tipSeen(game.id, id)) return false;
    tipQueue.push(tip); pumpTips();
    return true;
  }
  function pumpTips() {
    if (tipShown || !tipQueue.length || helpOpen || screen !== 'play') return;
    // the level's own hint gets a moment first, then a tip takes its place
    const wait = hintAt ? 1600 - (performance.now() - hintAt) : 0;
    clearTimeout(tipTimer);
    if (wait > 0) { tipTimer = setTimeout(pumpTips, wait + 20); return; }
    const tip = tipQueue.shift();
    tipShown = tip;
    markTip(game.id, tip.id);
    clearTimeout(hintTimer); ref('hint').hidden = true; hintAt = 0;
    const text = tipText(tip, inputMode);
    ref('tipicon').innerHTML = glyph(tip.g, 32);
    ref('tiptext').textContent = text;
    tipEl.dataset.tip = tip.id;
    tipEl.hidden = false;
    tipTimer = setTimeout(hideTip, clamp(2000 + text.length * 55, 4500, 9000));
  }
  function hideTip() {
    clearTimeout(tipTimer);
    tipEl.hidden = true; tipShown = null;
    if (tipQueue.length) tipTimer = setTimeout(pumpTips, 600);
  }
  /** Leaving a level: the banner goes; tips still waiting come back when their mechanic does. */
  function clearTips() {
    clearTimeout(tipTimer); tipQueue = [];
    if (tipEl) { tipEl.hidden = true; }
    tipShown = null;
  }

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
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType) { inputMode = e.pointerType === 'mouse' ? 'keys' : 'touch'; view.touch = inputMode === 'touch'; } }, true);
  // iOS: no page scroll or double-tap zoom while playing.
  stage.addEventListener('touchmove', (e) => { if (screen === 'play') e.preventDefault(); }, { passive: false });

  root.addEventListener('click', (e) => {
    const lv = e.target.closest('.gm-level[data-level]');
    if (lv && !lv.disabled) { sound.unlock(); sound.play('click'); startLevel(Number(lv.dataset.level)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sound.unlock();
    if (act !== 'pause') sound.play('click');
    if (act === 'load-reload') { location.reload(); return; }
    if (act === 'play') startLevel(nextOpenLevel());
    else if (act === 'pause') pause();
    else if (act === 'resume') resume();
    else if (act === 'restart') { if (screen === 'play' || screen === 'pause') startLevel(level, { retry: true }); }
    else if (act === 'retry' || act === 'load-retry') startLevel(level, { retry: true });
    else if (act === 'next') startLevel(Math.min(level + 1, game.levels.length - 1));
    else if (act === 'menu') toMenu();
    else if (act === 'sound') { sound.toggle(); syncSoundButton(); }
    else if (act === 'fullscreen') toggleFullscreen();
    else if (act === 'puzzle-hint' && screen === 'play') { const hint = session?.takePuzzleHint?.(); if (hint) showLevelHint(hint); root.querySelector('[data-act="puzzle-hint"]').hidden = !session?.puzzleHintAvailable; }
    else if (act === 'help') openHelp();
    else if (act === 'help-close') closeHelp();
    else if (act === 'help-tab') renderHelp(e.target.closest('[data-mode]').dataset.mode);
    else if (act === 'tip-close') hideTip();
  });

  // Full screen: the real Fullscreen API where there is one; iPhone Safari has none for elements, so there the
  // stage simply covers the viewport.
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function syncFullscreen() {
    const on = fsElement() === stage || stage.classList.contains('is-max');
    stage.classList.toggle('is-fullscreen', on);
    document.documentElement.classList.toggle('gm-max-open', stage.classList.contains('is-max'));
    for (const b of root.querySelectorAll('[data-act="fullscreen"]')) {
      b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      b.innerHTML = icon(on ? 'minimize-2' : 'maximize', { size: 20 });
    }
  }
  function toggleFullscreen() {
    if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (stage.classList.contains('is-max')) { stage.classList.remove('is-max'); syncFullscreen(); return; }
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    const fallback = () => { stage.classList.add('is-max'); syncFullscreen(); };
    if (!req) { fallback(); return; }
    try { Promise.resolve(req.call(stage, { navigationUI: 'hide' })).catch(fallback); } catch { fallback(); }
  }
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  window.addEventListener('keydown', (e) => {
    if (!active || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (helpOpen) { helpKey(e); return; }
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (/^(Digit|Numpad)[0-9]$/.test(e.code) || e.key.startsWith('Arrow')) view.keyboard = true;
    if (!/^(Shift|Control|Alt|Meta)/.test(e.key)) { inputMode = 'keys'; view.touch = false; }
    if (e.code === 'KeyH' && screen !== 'result') { openHelp(); e.preventDefault(); return; }
    if (e.code === 'KeyF') { toggleFullscreen(); e.preventDefault(); return; }
    if (e.code === 'KeyM') { sound.toggle(); ow?.syncSound?.(); e.preventDefault(); return; }
    if (e.key === 'Escape' && stage.classList.contains('is-max') && screen !== 'play') { toggleFullscreen(); e.preventDefault(); return; }
    if (screen === 'menu' && ow && ow.key(e)) { e.preventDefault(); return; }
    if (screen === 'play' && session) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { pause(); e.preventDefault(); return; }
      if (e.key === 'r' || e.key === 'R') { startLevel(level, { retry: true }); e.preventDefault(); return; }
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
  // with WebGL the overworld is the menu: its sky covers the stage from the start, so neither the level grid nor the
  // last level shows while it loads (the grid comes back only if the overworld fails)
  if (worlds && hasWebGL()) { root.querySelector('.gm-owhost').hidden = false; screens.menu.classList.add('has-ow'); }

  const controller = {
    activate() { if (active) return; active = true; resize(); loadOverworld();if(!worlds)schedulePrefetch(lastPicked ?? nextOpenLevel()); if (ow && screen === 'menu') { ow.refresh(); ow.activate(); } if (screen === 'play' || screen === 'result') startLoop(); },
    deactivate() { cancelPrefetch();loadController?.abort();if(screen==='loading'){levelRequest++;session=null;preparedSession=null;setScreen('menu');}pause(); active = false; if (raf) cancelAnimationFrame(raf); raf = 0; ow?.deactivate(); },
  };
  // Test hooks (also handy from the console): state, deterministic fast-forward, jump to a result.
  window.__fwGames = window.__fwGames || {};
  window.__fwGames[game.id] = {
    get screen() { return screen; },
    get gl() { return !!gl; },
    loading: () => ({ cache:loadingCacheStats(), history:loadHistory.map(item=>({...item,bytes:Object.fromEntries(item.bytes)})) }),
    perf: () => ({ ...perf, glScale, shadows: !!gl?.renderer?.shadowMap?.enabled }),
    get level() { return level; },
    get session() { return session; },
    progress: () => ({ stars: progress.stars, best: progress.best }),
    get overworld() { return ow; },
    start: (i) => startLevel(i),
    /** Run the simulation for `seconds` of game time right now (no rendering); stops at a result. */
    fastForward(seconds) {
      if (!session) return null;
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n && screen === 'play'; i++) { session.update(STEP); tipTick(); if (session.result) break; }
      if (session.result) finish(session.result);
      syncHud(); draw();
      return session.result || null;
    },
    finish: (result) => finish(result),
    get helpOpen() { return helpOpen; },
    get tip() { return tipShown?.id || null; },
    get playTime() { return playT; },
    openHelp: () => openHelp(),
    closeHelp: () => closeHelp(),
    hint: (id) => requestTip(id),
    reset() { delete Profile.profile().games[game.id]; Profile.save(); toMenu(); },
  };
  return controller;
}
