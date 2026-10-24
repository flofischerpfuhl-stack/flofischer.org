/**
 * Fernwork Arcade — the games landing view (the bare tools/games URL): the three games as 3D boxes on a stage that
 * fills the content area, in Fernwork's light or dark look. Drag or swipe a box to spin it (front, spine, back), tap one
 * to bring it forward; the big arcade button (or a tap on the front box) opens the game. A plaque at the podium's
 * front edge shows the game and the player's progress from profile.js; a visually hidden panel carries the same for
 * screen readers and keyboards, and a small corner menu holds the save export.
 */
import { THREE, createRenderer, addLights, studioEnvironment, applyIbl, Particles, LOW_GPU } from './three-kit.js';
import { Baker } from './world/decor.js';
import { loadModel } from './models.js';
import { buildStage } from './world/stage.js';
import { figure } from './world/figure.js';
import { propsReady } from './world/tower-scenery.js';
import { profile, game as gameProfile, starsTotal, exportCode, importCode, onChange, ACHIEVEMENTS } from './profile.js';
import { icon } from '../../../assets/kit/icons.js';

const ASSETS = new URL('../../games-assets/', import.meta.url);
export const GAMES = [
  {
    id: 'fern-rangers', title: 'Fern Rangers', color: '#5f7f34', accent: '#f2c94c', cover: 'cover-fern-rangers',
    tagline: 'Hold the road. Grow the squad. Bubble the invasion.',
    blurb: 'The Zorb have landed and their Klonkbots are marching on Fernhaven. Lead the Fern Rangers down the roads of four worlds, steer through number gates, shoot them higher and never stop firing.',
    levels: 44,
  },
  {
    id: 'pips-tower', title: 'Pip’s Tower', color: '#c2752c', accent: '#4af0c4', cover: 'cover-pips-tower',
    tagline: 'Pull the right pin. Save the Fernstones.',
    blurb: 'The aliens locked Fernhaven’s Fernstones in tall vault towers. Pip and Biscuit pull golden pins in just the right order: water cools lava, boulders crush robots and the treasure must reach Pip.',
    levels: 44,
  },
  {
    id: 'momo', title: 'Momo’s Last Stand', color: '#c94a2c', accent: '#ffd23f', cover: 'cover-momo',
    tagline: 'One panda. One wrench. A thousand aliens.',
    blurb: 'When the arenas of Fernhaven fill with aliens, Momo grabs her wrench and holds them off alone. Level up, pick your gadgets and build the perfect combo before the boss arrives.',
    levels: 44,
  },
];

const BOX = { w: 1.3, h: 1.68, d: 0.14 };
const fmtTime = (s) => (s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

function loadImage(name) {
  return new Promise((res) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = new URL(`covers/${name}.webp`, ASSETS).href; });
}

/** Front cover: the art plus the brand band and the game logo lettering. */
function drawFront(g, W, H, info, art) {
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, info.color); grd.addColorStop(1, '#111');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (art) { const s = Math.max(W / art.width, H / art.height); g.drawImage(art, (W - art.width * s) / 2, (H - art.height * s) / 2, art.width * s, art.height * s); }
  // top brand band
  g.fillStyle = '#0d0f12'; g.fillRect(0, 0, W, H * 0.055);
  g.fillStyle = '#fff'; g.font = `700 ${Math.round(H * 0.026)}px Geist, system-ui, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText('FERNWORK ARCADE', W * 0.05, H * 0.028);
  // logo: soft shade behind, then the extruded lettering
  const shade = g.createLinearGradient(0, H * 0.055, 0, H * 0.3); shade.addColorStop(0, 'rgba(0,0,0,.5)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade; g.fillRect(0, H * 0.055, W, H * 0.25);
  drawLogo(g, W, H, info);
  // bottom strip
  g.fillStyle = 'rgba(13,15,18,.82)'; g.fillRect(0, H * 0.94, W, H * 0.06);
  g.fillStyle = '#fff'; g.font = `600 ${Math.round(H * 0.022)}px Geist, system-ui, sans-serif`; g.textAlign = 'left';
  g.fillText('Fernwork Games', W * 0.05, H * 0.97);
  g.textAlign = 'right'; g.fillText('1 PLAYER · TOUCH · KEYBOARD', W * 0.95, H * 0.97);
}

/**
 * The game logo: chunky lettering with an extruded side, a dark outline, a white rim and a glossy top half, the way
 * console box logos are lettered. Long titles break into a small top line and a big bottom line.
 */
function drawLogo(g, W, H, info) {
  const words = info.title.toUpperCase().split(' ');
  const lines = words.length > 2 ? [{ t: words.slice(0, -2).join(' '), s: 0.6 }, { t: words.slice(-2).join(' '), s: 1 }] : [{ t: words.join(' '), s: 1 }];
  const c = document.createElement('canvas'); c.width = W; c.height = Math.round(H * 0.32);
  const l = c.getContext('2d');
  let y = H * 0.05;
  for (const line of lines) {
    let size = H * 0.1 * line.s;
    l.font = `900 ${size}px Geist, system-ui, sans-serif`;
    const fit = (W * 0.86) / l.measureText(line.t).width;
    if (fit < 1) { size *= fit; l.font = `900 ${size}px Geist, system-ui, sans-serif`; }
    y += size * 0.62;
    l.textAlign = 'center'; l.textBaseline = 'middle'; l.lineJoin = 'round';
    const depth = Math.max(4, Math.round(size * 0.1));
    // extrusion: stacked copies in the game's dark colour
    l.fillStyle = '#16100a'; l.strokeStyle = '#16100a'; l.lineWidth = size * 0.2;
    for (let d = depth; d > 0; d--) { l.strokeText(line.t, W / 2, y + d); l.fillText(line.t, W / 2, y + d); }
    l.lineWidth = size * 0.12; l.strokeStyle = '#fff'; l.strokeText(line.t, W / 2, y);
    const fill = l.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    fill.addColorStop(0, '#fff7d6'); fill.addColorStop(0.35, info.accent); fill.addColorStop(1, info.color);
    l.fillStyle = fill; l.fillText(line.t, W / 2, y);
    // gloss on the upper half of the letters only
    l.save(); l.globalCompositeOperation = 'source-atop';
    const gloss = l.createLinearGradient(0, y - size / 2, 0, y); gloss.addColorStop(0, 'rgba(255,255,255,.55)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
    l.fillStyle = gloss; l.fillRect(0, y - size / 2, W, size / 2);
    l.restore();
    y += size * 0.5;
  }
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = H * 0.02; g.shadowOffsetY = H * 0.006;
  g.drawImage(c, 0, H * 0.05); g.restore();
}

/** The plaque in front of the focused box: the game's name and the player's progress. */
function drawPlaque(g, W, H, info, dark) {
  if (!info) return;
  // Fernwork card colours: light card with dark ink in the light theme, near-black card in the dark one
  const K = dark ? { a: '#121514', b: '#0b0d0c', edge: 'rgba(74,222,128,.45)', title: info.accent, sub: 'rgba(237,237,237,.75)', key: '#4ade80', val: '#ededed' }
    : { a: '#ffffff', b: '#f4f6f3', edge: 'rgba(21,128,61,.35)', title: '#111111', sub: '#52525b', key: '#15803d', val: '#111111' };
  const gp = gameProfile(info.id), p = profile();
  const stars = starsTotal(info.id), cleared = Object.values(gp.stars).filter((v) => v > 0).length;
  const best = Object.values(gp.best).reduce((a, b) => Math.max(a, b), 0);
  const where = gp.last ? gp.last.replace(/^w(\d)-(\d+|boss)$/, (_, wd, n) => `World ${wd} · ${n === 'boss' ? 'Boss' : `Level ${Number(n)}`}`) : 'Not started yet';
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, K.a); grd.addColorStop(1, K.b);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = K.edge; g.lineWidth = 4; g.strokeRect(14, 14, W - 28, H - 28);
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillStyle = K.title; g.font = '800 62px Geist, system-ui, sans-serif'; g.fillText(info.title, 44, 96);
  g.fillStyle = K.sub; g.font = '500 30px Geist, system-ui, sans-serif'; g.fillText(info.soon ? 'Coming soon' : info.tagline, 44, 142);
  const rows = [['★ STARS', `${stars} / ${info.levels * 3}`], ['PROGRESS', where], ['LEVELS', `${cleared} / ${info.levels}`], ['BEST', best ? best.toLocaleString('en') : '—'], ['PLAY TIME', gp.seconds ? fmtTime(gp.seconds) : '—'], ['COINS', p.coins.toLocaleString('en')]];
  rows.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2), x = 44 + col * 480, y = 212 + row * 62;
    g.fillStyle = K.key; g.font = '700 22px Geist, system-ui, sans-serif'; g.fillText(k, x, y);
    g.fillStyle = K.val; g.font = '700 34px Geist, system-ui, sans-serif'; g.fillText(v, x + 170, y + 2);
  });
}

/** Back cover: blurb, live progress, feature list. Redrawn whenever the profile changes. */
function drawBack(g, W, H, info, art) {
  g.fillStyle = '#121418'; g.fillRect(0, 0, W, H);
  if (art) { g.globalAlpha = 0.28; const s = Math.max(W / art.width, H / art.height); g.drawImage(art, (W - art.width * s) / 2, 0, art.width * s, art.height * s); g.globalAlpha = 1; }
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, 'rgba(18,20,24,.4)'); grd.addColorStop(0.45, 'rgba(18,20,24,.92)'); grd.addColorStop(1, '#121418');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const pad = W * 0.07;
  g.fillStyle = info.accent; g.font = `900 ${Math.round(H * 0.045)}px Geist, system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(info.title.toUpperCase(), pad, H * 0.06);
  g.fillStyle = '#fff'; g.font = `600 ${Math.round(H * 0.024)}px Geist, system-ui, sans-serif`;
  g.fillText(info.tagline, pad, H * 0.12);
  g.fillStyle = 'rgba(255,255,255,.82)'; g.font = `400 ${Math.round(H * 0.022)}px Geist, system-ui, sans-serif`;
  wrap(g, info.blurb, pad, H * 0.17, W - pad * 2, H * 0.031);
  // progress block
  const gp = gameProfile(info.id), stars = starsTotal(info.id);
  const cleared = Object.values(gp.stars).filter((v) => v > 0).length;
  const best = Object.values(gp.best).reduce((a, b) => a + b, 0);
  const rows = [['STARS', `${stars} / ${info.levels * 3}`], ['LEVELS CLEARED', `${cleared} / ${info.levels}`], ['TOTAL SCORE', best.toLocaleString('en')], ['PLAY TIME', gp.seconds ? fmtTime(gp.seconds) : '—']];
  const y0 = H * 0.48;
  g.fillStyle = 'rgba(255,255,255,.06)'; roundRect(g, pad, y0, W - pad * 2, H * 0.27, H * 0.02); g.fill();
  g.font = `700 ${Math.round(H * 0.02)}px Geist, system-ui, sans-serif`;
  rows.forEach(([k, v], i) => {
    const y = y0 + H * 0.03 + i * H * 0.058;
    g.fillStyle = 'rgba(255,255,255,.55)'; g.textAlign = 'left'; g.fillText(k, pad * 1.5, y);
    g.fillStyle = '#fff'; g.textAlign = 'right'; g.font = `800 ${Math.round(H * 0.03)}px Geist, system-ui, sans-serif`; g.fillText(v, W - pad * 1.5, y - H * 0.004);
    g.font = `700 ${Math.round(H * 0.02)}px Geist, system-ui, sans-serif`;
  });
  // features
  const feats = ['4 worlds · 44 levels', 'Boss fights in every world', 'Workshop upgrades & outfits', 'Daily challenge'];
  g.textAlign = 'left'; g.font = `600 ${Math.round(H * 0.021)}px Geist, system-ui, sans-serif`;
  feats.forEach((f, i) => { g.fillStyle = info.accent; g.fillRect(pad, H * 0.79 + i * H * 0.04 + H * 0.007, H * 0.012, H * 0.012); g.fillStyle = '#fff'; g.fillText(f, pad + H * 0.025, H * 0.79 + i * H * 0.04); });
  g.fillStyle = 'rgba(255,255,255,.4)'; g.font = `500 ${Math.round(H * 0.016)}px Geist, system-ui, sans-serif`;
  g.fillText('Runs in your browser. No account, no download, saves on this device.', pad, H * 0.955);
}

function drawSpine(g, W, H, info) {
  g.fillStyle = '#0d0f12'; g.fillRect(0, 0, W, H);
  g.fillStyle = info.color; g.fillRect(0, H * 0.12, W, H * 0.76);
  g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 2);
  g.fillStyle = '#fff'; g.font = `900 ${Math.round(W * 0.55)}px Geist, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(info.title.toUpperCase(), 0, 0);
  g.restore();
  g.fillStyle = info.accent; g.fillRect(W * 0.2, H * 0.03, W * 0.6, H * 0.06);
}

function wrap(g, text, x, y, maxW, lh) {
  let line = '';
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  if (line) g.fillText(line, x, y);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** Screen backdrop: a warm spotlight glow behind the boxes fading into a deep night blue. */
function stageBackdrop() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 512); base.addColorStop(0, '#1b2233'); base.addColorStop(1, '#0b0d14');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  const glow = g.createRadialGradient(256, 210, 10, 256, 210, 300); glow.addColorStop(0, 'rgba(255,214,150,.38)'); glow.addColorStop(0.5, 'rgba(120,140,255,.12)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.redraw = (...args) => { draw(c.getContext('2d'), w, h, ...args); t.needsUpdate = true; };
  return t;
}

// A still of the finished scene from the last visit (Cache Storage, per theme and view size) is shown before the 3D
// set-up blocks the page for a moment; the live canvas fades in over it once stage, heroes and covers are complete.
// The service worker drops this cache with every release (sw.js activate), so a poster never outlives its scene.
const POSTER_CACHE = 'fw-games-hub-poster-v1';
const siteDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches; };
const posterKey = (dark, w, h) => `/__fw-hub-poster/${dark ? 'dark' : 'light'}/${Math.round(w / 40)}x${Math.round(h / 40)}`;
async function findPoster(host) {
  const r = host.getBoundingClientRect();
  if (!window.caches || r.width < 50 || r.height < 50) return '';
  try {
    const hit = await (await caches.open(POSTER_CACHE)).match(posterKey(siteDark(), r.width, r.height));
    return hit ? URL.createObjectURL(await hit.blob()) : '';
  } catch { return ''; /* no Cache Storage (private mode, plain http): the scene simply builds in view */ }
}

/** → Promise<controller>: the poster paints first, then the scene is set up. */
export async function mountHub(host, opts) {
  const poster = await findPoster(host);
  if (poster) {
    host.style.background = `center / cover no-repeat url("${poster}")`;
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  }
  return buildHub(host, opts, poster);
}

function buildHub(host, { onPlay }, poster) {
  host.classList.add('gm-hub');
  host.innerHTML = `
    <div class="gm-hub__stage">
      <canvas class="gm-hub__canvas" aria-hidden="true"></canvas>
      <details class="gm-hub__save"><summary class="fw-iconbtn gm-hud__btn" aria-label="Move your progress" title="Move your progress">${icon('upload', { size: 18 })}</summary>
        <div class="gm-hub__savebody">
          <p class="gm-hub__small">Progress is saved in this browser. Copy the code to continue on another device.</p>
          <div class="gm-hub__saverow"><button type="button" class="fw-btn fw-btn--sm" data-hub="export">${icon('copy', { size: 14 })}Copy save code</button>
          <button type="button" class="fw-btn fw-btn--sm fw-btn--ghost" data-hub="import">${icon('upload', { size: 14 })}Load a code</button></div>
        </div>
      </details>
    </div>
    <!-- the plaque and the button in the scene show this; screen readers and keyboards use it here -->
    <aside class="gm-hub__panel sr-only" aria-live="polite"></aside>`;
  const canvas = host.querySelector('canvas');
  const stageEl = host.querySelector('.gm-hub__stage');
  if (poster) { stageEl.style.backgroundImage = `url("${poster}")`; stageEl.classList.add('has-poster'); host.style.background = ''; }
  const panel = host.querySelector('.gm-hub__panel');
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const env = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  window.__hubView = { renderer, scene, camera }; // test/bench hook
  const lights = addLights(scene, { dir: [-3, 5, 6], shadowBox: 4, mapSize: 1024, intensity: 2.2, ambient: 1.0 });
  scene.background = stageBackdrop();
  // The stage (world/stage.js: podium, curtains, sign, lights, ferns, Fernstones) is baked into one image with depth
  // whenever the view's size changes; live are only the boxes, their shadows on the podium and drifting motes.
  const baker = new Baker();
  scene.add(baker.quad);
  let stage = null, bakeDirty = true, texReady = -1;
  // the heroes on the stage: a Ranger pair on the left, Pip with Biscuit and Momo on the right
  const HEROES = [['RANGER_FOX', [-2.1, -0.965, 1.2], 0.45, 0.95], ['RANGER_BUNNY', [-2.6, -0.965, 0.45], 0.65, 0.9],
    ['PIP', [2.1, -0.965, 1.2], -0.45, 0.95], ['BISCUIT', [1.65, -0.965, 1.65], -0.3, 0.95], ['MOMO', [2.6, -0.965, 0.45], -0.65, 0.9]];
  // the stage follows the site theme (light or dark Fernwork look); a theme switch rebuilds and rebakes it
  let dark = siteDark(), heroModels = null;
  // the heroes are live (the stage bakes only their pools of light), so they can breathe, look around, wave and hop
  const heroes = [];
  const rebuild = () => {
    if (!heroModels) return;
    stage = buildStage({ env, dark, figures: HEROES.map(([, pos, rot, scale]) => ({ pos, rot, scale })) });
    bakeDirty = true;
  };
  Promise.all([propsReady, ...HEROES.map(([n]) => loadModel(n, 'lo').catch(() => null))]).then(([, ...models]) => {
    heroModels = models;
    models.forEach((m, k) => {
      if (!m) return;
      const [name, pos, rot, scale] = HEROES[k], f = figure(m);
      f.root.position.set(...pos); f.root.rotation.y = rot; f.root.scale.setScalar(scale);
      applyIbl(f.root, env, 0.7); scene.add(f.root);
      // each hero has its own rhythm; the next wave or hop comes after a random pause
      heroes.push({ ...f, name, rot, phase: k * 1.7, next: 2 + k * 1.3 + Math.random() * 2, act: null, actT: 0 });
    });
    rebuild();
  });
  const actFor = (hero) => (hero.arms.length && hero.name !== 'BISCUIT' && Math.random() < 0.6 ? 'wave' : 'hop');
  function animateHeroes(time, dt) {
    for (const hr of heroes) {
      const t = time + hr.phase;
      hr.next -= dt;
      if (!hr.act && hr.next <= 0) { hr.act = actFor(hr); hr.actT = 0; }
      // idle: breathing, a slow look around, arms hanging loose
      hr.body.scale.y = 1 + Math.sin(t * 2.1) * 0.012;
      let turn = Math.sin(t * 0.45) * 0.22 + Math.sin(t * 1.3) * 0.05, lift = 0, armZ = 0.05 + Math.sin(t * 2.1) * 0.03;
      let legs = 0, wave = 0;
      if (hr.act) {
        hr.actT += dt;
        const D = hr.act === 'wave' ? 1.6 : 0.9, k = Math.min(1, hr.actT / D);
        if (hr.act === 'hop') { lift = Math.abs(Math.sin(k * Math.PI * 2)) * 0.16; legs = Math.sin(k * Math.PI * 4) * 0.45; turn *= 0.3; }
        else { wave = Math.sin(k * Math.PI); turn = turn * (1 - wave) + 0.25 * wave * -Math.sign(hr.rot || 1); }
        if (k >= 1) { hr.act = null; hr.next = 3.5 + Math.random() * 5; }
      }
      hr.root.rotation.y = hr.rot + turn;
      hr.body.position.y = lift;
      for (const l of hr.legs) l.pivot.rotation.x = legs * l.side;
      for (const a of hr.arms) {
        const waving = wave > 0 && a.ch === 'armR';
        a.pivot.rotation.z = a.side * (waving ? wave * (2.2 + Math.sin(t * 14) * 0.3) : armZ);
      }
    }
  }
  const onTheme = () => { const d = siteDark(); if (d !== dark) { dark = d; rebuild(); plaque.userData.tint?.(); renderPanel(); } };
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', onTheme);
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.ShadowMaterial({ opacity: 0.38, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = -0.962; catcher.receiveShadow = true; catcher.renderOrder = -900; catcher.visible = !LOW_GPU; scene.add(catcher);
  const motes = new Particles(scene, 40, new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  function bake() {
    if (!stage) return;
    const ready = stage.textures.filter((t) => t.image && (t.image.width || t.image.naturalWidth)).length;
    if (!bakeDirty && ready === texReady) return;
    bakeDirty = false; texReady = ready;
    baker.bake(renderer, stage.scene, camera, LOW_GPU ? 1 : renderer.getPixelRatio() >= 1.4 ? 1.5 : 2);
    scene.background = null;
    stage.scene.traverse((o) => { if (o.isLight && o.shadow?.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
    performance.mark?.('fw-hub-baked');
    bakedAt = performance.now();
  }

  // the poster for the next visit: taken once the scene is complete, once per theme and view size
  const posters = new Set();
  let bakedAt = 0;
  const settled = () => stage && bakedAt && heroes.length && GAMES.every((g) => 'art' in g) && performance.now() - bakedAt > 500;
  // right after a render, while the drawing buffer still holds the frame
  function savePoster() {
    const key = posterKey(dark, w, h);
    if (posters.has(key) || !window.caches) return;
    posters.add(key);
    canvas.toBlob((blob) => { if (blob) caches.open(POSTER_CACHE).then((c) => c.put(key, new Response(blob, { headers: { 'content-type': blob.type } }))).catch(() => {}); }, 'image/webp', 0.82);
  }

  const boxes = GAMES.map((info, i) => {
    const front = canvasTexture(1024, 1322, (g, W, H, art) => drawFront(g, W, H, info, art));
    const back = canvasTexture(1024, 1322, (g, W, H, art) => drawBack(g, W, H, info, art));
    const spine = canvasTexture(128, 1322, (g, W, H) => drawSpine(g, W, H, info));
    front.redraw(null); back.redraw(null); spine.redraw();
    const plastic = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18 });
    const edge = new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.35, clearcoat: 0.6 });
    const mats = [edge, plastic(spine), edge, edge, plastic(front), plastic(back)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), mats);
    mesh.castShadow = true;
    const group = new THREE.Group(); group.add(mesh); scene.add(group);
    // the lettering needs the web font, so draw once it is in
    Promise.all([loadImage(info.cover), document.fonts?.ready]).then(([art]) => { front.redraw(art); back.redraw(art); spine.redraw(); info.art = art; });
    return { info, group, mesh, front, back, spin: 0, spinVel: 0, target: 0, x: 0 };
  });
  // the plaque in front of the focused box (title, stats) and the big arcade button that starts the game
  const plaqueTex = canvasTexture(1024, 400, (g, W, H, info) => drawPlaque(g, W, H, info, dark));
  const plaque = new THREE.Group();
  {
    const wood = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    const brassM = new THREE.MeshStandardMaterial({ roughness: 0.3 });
    plaque.userData.tint = () => { wood.color.set(dark ? 0x241a12 : 0xefe9df); brassM.color.set(dark ? 0xd8a84a : 0x16a34a); brassM.metalness = dark ? 0.9 : 0.25; };
    plaque.userData.tint();
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.92, 0.08), wood); board.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 0.8), new THREE.MeshBasicMaterial({ map: plaqueTex, toneMapped: false }));
    face.position.z = 0.041;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.98, 0.05), brassM); frame.position.z = -0.02;
    // two short brass feet hold the tilted board on the podium
    const feet = [-0.8, 0.8].map((x) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.36), brassM); f.position.set(x, -0.5, -0.12); return f; });
    plaque.add(frame, board, face, ...feet);
    plaque.rotation.x = -0.82;
    scene.add(plaque);
  }
  const button = new THREE.Group();
  const capMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.05 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 40), capMat);
  {
    const brassM = new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 0.9, roughness: 0.28 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4 }));
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 10, 48), brassM); ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.065;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 20), brassM); post.position.y = -0.3;
    cap.position.y = 0.1;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(512, 112, (g, W, H, txt) => { g.clearRect(0, 0, W, H); g.font = `900 ${H * 0.55}px Geist, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(txt || 'PLAY', W / 2, H / 2); g.fillStyle = '#fff'; g.fillText(txt || 'PLAY', W / 2, H / 2); }) }));
    label.scale.set(0.62, 0.14, 1); label.position.set(0, 0.33, 0.05); button.userData.label = label;
    button.add(post, base, ringM, cap, label);
    button.traverse((o) => { o.castShadow = true; });
        scene.add(button);
  }
  applyIbl(scene, env, 0.7);

  let focus = 0, active = false, raf = 0, last = 0, w = 1, h = 1, drag = null;
  const layoutFor = (i) => {
    const d = i - focus;
    return { x: d * 1.75, z: d === 0 ? 0.6 : -0.35 - Math.abs(d) * 0.2, ry: d === 0 ? 0 : -d * 0.42, s: d === 0 ? 1.06 : 0.86 };
  };

  function renderPanel() {
    const info = GAMES[focus], gp = gameProfile(info.id), p = profile();
    plaqueTex.redraw(info);
    capMat.color.set(info.soon ? 0x6b7280 : info.color); capMat.emissive.set(info.soon ? 0x111111 : info.color).multiplyScalar(0.55);
    button.userData.label.material.map.redraw(info.soon ? 'SOON' : gp.plays ? 'CONTINUE' : 'PLAY');
    const stars = starsTotal(info.id), cleared = Object.values(gp.stars).filter((v) => v > 0).length;
    const last = gp.last ? gp.last.replace(/^w(\d)-(\d+|boss)$/, (_, wd, n) => `World ${wd} · ${n === 'boss' ? 'Boss' : `Level ${Number(n)}`}`) : 'Not started yet';
    const bestEntry = Object.entries(gp.best).sort((a, b) => b[1] - a[1])[0];
    const unlocked = Object.keys(p.achievements).length;
    panel.innerHTML = `
      <p class="gm-hub__kicker">${info.soon ? 'Coming soon' : 'Fernwork Games'}</p>
      <h2 class="gm-hub__title">${info.title}</h2>
      <p class="gm-hub__tag">${info.tagline}</p>
      <dl class="gm-hub__stats">
        <div><dt>${icon('star', { size: 14 })} Stars</dt><dd class="fw-num">${stars} / ${info.levels * 3}</dd></div>
        <div><dt>Progress</dt><dd>${last}</dd></div>
        <div><dt>Levels cleared</dt><dd class="fw-num">${cleared} / ${info.levels}</dd></div>
        <div><dt>Best level score</dt><dd class="fw-num">${bestEntry ? bestEntry[1].toLocaleString('en') : '—'}</dd></div>
        <div><dt>Play time</dt><dd class="fw-num">${gp.seconds ? fmtTime(gp.seconds) : '—'}</dd></div>
      </dl>
      <button type="button" class="fw-btn" data-hub="prev">Previous game</button>
      <button type="button" class="fw-btn" data-hub="next">Next game</button>
      <button type="button" class="fw-btn fw-btn--primary fw-btn--lg gm-hub__play" data-hub="play" ${info.soon ? 'disabled' : ''}>${icon('play', { size: 18 })}${info.soon ? 'In development' : gp.plays ? 'Continue' : 'Play'}</button>
      <div class="gm-hub__profile">
        <div class="gm-hub__chip">${icon('sparkles', { size: 14 })}<span class="fw-num">${p.coins.toLocaleString('en')}</span> coins</div>
        <div class="gm-hub__chip">${icon('check', { size: 14 })}<span class="fw-num">${unlocked}</span> / ${Math.max(unlocked, ACHIEVEMENTS.length)} achievements</div>
      </div>
`;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(w, h, false);
    // the whole scene is the menu: wide screens show the heroes at the sides, phones frame box, plaque and button
    camera.fov = 30; camera.aspect = w / h;
    const wide = camera.aspect > 1;
    const fitW = (wide ? 7.4 : 2.9) / camera.aspect, fitH = 3.6;
    const dist = Math.max(fitW, fitH) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.position.set(0, 0.55, dist + 0.6); camera.lookAt(0, -0.12, 0);
    // plaque and button stand at the podium's front edge, close to the camera, so the focused cover stays whole
    plaque.position.set(wide ? -0.38 : -0.28, -0.74, 3.35); plaque.scale.setScalar(wide ? 0.58 : 0.5);
    button.position.set(wide ? 0.78 : 0.66, -0.8, 3.2); button.scale.setScalar(wide ? 0.8 : 0.7);
    camera.updateProjectionMatrix();
    bakeDirty = true;
  }

  function frame(t) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    boxes.forEach((b, i) => {
      const L = layoutFor(i);
      const k = 1 - Math.exp(-dt * 6);
      b.group.position.x += (L.x - b.group.position.x) * k;
      b.group.position.z += (L.z - b.group.position.z) * k;
      b.group.scale.setScalar(b.group.scale.x + (L.s - b.group.scale.x) * k);
      b.group.position.y = Math.sin(t / 900 + i) * 0.03;
      if (i === focus && drag) { /* follows the finger */ }
      else if (Math.abs(b.spinVel) > 0.05) { b.spin += b.spinVel * dt; b.spinVel *= Math.exp(-dt * 2.2); }
      else {
        // settle on the nearest face (front or back), plus a slow idle sway on the front
        const target = Math.round(b.spin / Math.PI) * Math.PI;
        b.spin += (target - b.spin) * (1 - Math.exp(-dt * 3));
      }
      const idle = i === focus && !drag ? Math.sin(t / 1400) * 0.12 : 0;
      b.group.rotation.y = L.ry + b.spin + idle;
    });
    // the button breathes softly and sinks when pressed
    const since = (performance.now() - pressed) / 1000;
    cap.position.y = 0.1 - (since < 0.3 ? Math.sin((since / 0.3) * Math.PI) * 0.07 : 0);
    capMat.emissiveIntensity = 0.45 + Math.sin(t / 450) * 0.2;
    animateHeroes(t / 1000, dt);
    bake();
    motes.begin();
    if (stage && !LOW_GPU && dark) for (const m of stage.motes) {
      const tt = t / 1000;
      motes.add(m.x + Math.sin(tt * 0.3 + m.s * 9) * 0.3, m.y + Math.sin(tt * 0.2 + m.s * 5) * 0.25, m.z, 0.005 + m.s * 0.007, 0xffe2b0);
    }
    motes.end();
    renderer.render(scene, camera);
    if (settled()) {
      if (!canvas.classList.contains('is-ready')) canvas.classList.add('is-ready');
      else savePoster();
    }
    raf = requestAnimationFrame(frame);
  }

  // input: drag to spin the focused box, tap a side box to focus it
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const onButton = (e) => { aim(e); return ray.intersectObject(button, true).length > 0; };
  const play = () => {
    if (GAMES[focus].soon) return;
    pressed = performance.now();
    setTimeout(() => onPlay(GAMES[focus].id), 160);
  };
  let pressed = 0;
  const hit = (e) => {
    aim(e);
    const hits = ray.intersectObjects(boxes.map((b) => b.mesh));
    return hits.length ? boxes.findIndex((b) => b.mesh === hits[0].object) : -1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    // a drag on the front box spins it; a swipe anywhere else brings the next or previous game forward
    drag = { x: e.clientX, t: performance.now(), moved: 0, start: boxes[focus].spin, spin: hit(e) === focus };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { if (e.pointerType === 'mouse') canvas.style.cursor = onButton(e) || hit(e) >= 0 || ray.intersectObjects(heroes.map((x) => x.root), true).length ? 'pointer' : 'grab'; return; }
    const dx = e.clientX - drag.x;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    if (!drag.spin) return;
    const b = boxes[focus];
    const prev = b.spin;
    b.spin = drag.start + dx * 0.012;
    b.spinVel = (b.spin - prev) / Math.max(0.008, (performance.now() - drag.t) / 1000); drag.t = performance.now();
  });
  const end = (e) => {
    if (!drag) return;
    const tap = drag.moved < 6, swipe = !drag.spin && Math.abs(e.clientX - drag.x) > 50 ? Math.sign(e.clientX - drag.x) : 0;
    drag = null;
    if (swipe) { setFocus(focus - swipe); return; }
    if (tap) {
      if (onButton(e)) { play(); return; }
      // a tap on a hero makes it hop or wave
      const hh = ray.intersectObjects(heroes.map((x) => x.root), true)[0];
      if (hh) { const hr = heroes.find((x) => x.root.getObjectById(hh.object.id)); if (hr && !hr.act) { hr.act = actFor(hr); hr.actT = 0; } return; }
      const i = hit(e);
      if (i >= 0 && i !== focus) setFocus(i);
      else if (i === focus) play();
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.style.touchAction = 'pan-y';

  function setFocus(i) { focus = (i + GAMES.length) % GAMES.length; renderPanel(); }
  host.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-hub]')?.dataset.hub;
    if (act === 'prev') setFocus(focus - 1);
    else if (act === 'next') setFocus(focus + 1);
    else if (act === 'play') play();
    else if (act === 'export') {
      const code = exportCode();
      try { await navigator.clipboard.writeText(code); e.target.closest('button').lastChild.textContent = 'Copied'; }
      catch { window.prompt('Your save code:', code); }
    } else if (act === 'import') {
      const code = window.prompt('Paste a Fernwork Games save code:');
      if (code) { try { importCode(code); } catch (err) { window.alert(err.message); } }
    }
  });
  window.addEventListener('keydown', (e) => {
    if (!active || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowLeft') { setFocus(focus - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setFocus(focus + 1); e.preventDefault(); }
    else if (e.key === 'Enter' && !e.target.closest?.('button, summary, a')) { play(); e.preventDefault(); }
  });
  onChange(() => { renderPanel(); for (const b of boxes) b.back.redraw(b.info.art || null); });
  new ResizeObserver(() => { if (active) resize(); }).observe(canvas);

  renderPanel();
  return {
    activate() { if (active) return; active = true; resize(); last = 0; raf = requestAnimationFrame(frame); },
    deactivate() { active = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    get focus() { return GAMES[focus].id; },
    boxes,
  };
}
