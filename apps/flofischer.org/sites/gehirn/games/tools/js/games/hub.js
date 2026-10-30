/**
 * Fernhaven hub: a gallery room with four arcade cabinets and three characters. Everything is operated in the scene:
 * tap a cabinet to focus it and play, tap a character to talk. HTML only for the Play button, speech bubbles and a
 * few small controls, all anchored to projected 3D points and styled from the Fernwork tokens (tools/games-hub.css).
 */
import { THREE, createRenderer, applyIbl, studioEnvironment, LOW_GPU } from './three-kit.js';
import { bindLoadingStatus, loadingBarHTML } from './loading-status.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { hubProgress } from './hub-progress-view.js';
import { profile, save as saveProfile, game as gameProfile, exportCode, importCode, onChange } from './profile.js';
import { purchaseUpgrade, acceptJob, claimJob, selectTournamentRing } from './hub-progress.js';
import { readPalette, siteIsDark } from './hub-theme.js';
import { createPuffs, createDisc, FORM_COLORS } from './hub-fx.js';
import { fitPoints, fitWidth, viewDirection, isPortrait, cameraBasis } from './hub-camera.js';
import { createCabinet, CABINET } from './hub-cabinet.js';
import { buildRoom, cabinetPose, groundY, ACTOR_SPOTS } from './hub-room.js';
import { CHARACTERS, FORMS, TOPIC_TITLES, askHTML, panelHTML, money, esc } from './hub-panels.js';

const ASSETS = new URL('../../games-assets/', import.meta.url);
export const GAMES = [
  { id: 'fern-rangers', title: 'Fern Rangers', color: '#567553', accent: '#edc76b', cover: 'cover-fern-rangers', tagline: 'Together we keep Fernhaven free.', blurb: 'Lead Captain Hazel and her legion through four regions. Grow your squad, free the prisoners and stop Orvan’s machines. After the finale the Storm Bastion awaits.', levels: 55 },
  { id: 'pips-tower', title: 'Pip’s Tower', color: '#be682b', accent: '#ffd48b', cover: 'cover-pips-tower', tagline: 'One move changes everything.', blurb: 'Pip and Biscuit explore sealed fossil vaults. Solve the mechanisms, steer water and lava, and collect gold and Groschen. Fernstones give Pip new abilities.', levels: 44 },
  { id: 'momo', title: 'Fernling-Arena', color: '#37745e', accent: '#b6e6c1', cover: 'cover-momo', tagline: 'Your Fernling. Your evolution. Your arena.', blurb: 'Choose Glimmo, Mossel or Plashling. Evolve your Fernling, combine its abilities and prove yourself in the arenas of the four regions.', levels: 44 },
  { id: 'tanks', title: 'Bounce Brigade', color: '#487a9d', accent: '#f1c166', cover: 'cover-tanks', tagline: 'The best path is rarely straight.', blurb: 'Hazel enters the big tournament in her toy tank. Use the walls, dodge the rubber shells and take on the rival clubs.', levels: 44 },
];
const ACTOR_IDS = ['PROFESSOR_OWLBERT', 'PIP_KESSEL', 'MAYOR_TORTELLINI'];
const FERNS = ['meadow_fern_arching', 'meadow_fern_rosette', 'meadow_fern_fiddleheads'];
const BACKDROPS = { day: 'hub/backdrop-day.webp', dusk: 'hub/backdrop-dusk.webp' };
const TWEEN = .6, TALK_TWEEN = .72, FOV = 32, PITCH = 17;
const loadImage = (url, label) => new Promise((resolve, reject) => { const image = new Image(); image.decoding = 'async'; image.onload = () => resolve(image); image.onerror = () => reject(new Error(`${label} failed to load`)); image.src = url; });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function mountHub(host, { onPlay }) {
  host.classList.add('gm-hub', 'hb-root');
  host.innerHTML = `<div class="gm-hub__stage hb-stage"><canvas class="gm-hub__canvas" aria-hidden="true"></canvas><canvas class="hb-wipe" aria-hidden="true" hidden></canvas>${loadingBarHTML()}
<header class="sr-only"><h1>Fernhaven</h1><p>The Fern Rangers’ canteen. Pick a cabinet to play or talk to someone.</p></header>
<div class="hb-hud"><button type="button" class="hb-back" data-act="back" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Back</button><span class="hb-coins" aria-label="Your Groschen"></span></div>
<div class="hb-play" hidden><button type="button" class="hb-btn hb-btn--primary hb-btn--play" data-act="play"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg><span>Play</span></button><p class="hb-play__progress"></p></div>
<div class="hb-bubble" hidden role="group"><div class="hb-bubble__inner"></div><span class="hb-bubble__tail" aria-hidden="true"></span></div>
<nav class="hb-dots" aria-label="Choose a game" hidden>${GAMES.map((g, i) => `<button type="button" data-dot="${i}" aria-label="${esc(g.title)}"><i></i></button>`).join('')}</nav>
<section class="sr-only hb-sr" aria-live="polite"><h2 data-sr="title"></h2><p data-sr="progress"></p></section>
<ul class="sr-only hb-sr-list" aria-label="Games and people">${GAMES.map((g, i) => `<li><button type="button" data-sr-game="${i}">${esc(g.title)}: ${esc(g.tagline)} Play</button></li>`).join('')}${ACTOR_IDS.map(id => `<li><button type="button" data-sr-actor="${id}">Talk to ${esc(CHARACTERS[id].name)} (${esc(CHARACTERS[id].role)})</button></li>`).join('')}</ul></div>`;
  const $ = s => host.querySelector(s);
  const stage = $('.hb-stage'), canvas = $('canvas'), backBtn = $('.hb-back'), coinsEl = $('.hb-coins'), playBox = $('.hb-play'), playBtn = $('.hb-btn--play'), playProgress = $('.hb-play__progress'),
    bubble = $('.hb-bubble'), bubbleInner = $('.hb-bubble__inner'), bubbleTail = $('.hb-bubble__tail'), dots = $('.hb-dots'), srTitle = $('[data-sr="title"]'), srProgress = $('[data-sr="progress"]');
  const loadingStatus = bindLoadingStatus(host);
  loadingStatus.begin('Fernhaven');

  const renderer = createRenderer(canvas, { shadows: false });
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, .1, 120), env = studioEnvironment(renderer);
  const library = new ChannelLibrary({ onProgress: event => loadingStatus.update(event) });
  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const own = { geo: g => (owned.geometries.add(g), g), mat: m => (owned.materials.add(m), m), tex: t => (owned.textures.add(t), t) };
  const themeMedia = matchMedia('(prefers-color-scheme: dark)'), motionMedia = matchMedia('(prefers-reduced-motion: reduce)');

  let active = false, disposed = false, ready = false, raf = 0, last = 0, clock = 0, pixelRatio = 1, pixelRatioSet = false, slow = { sum: 0, n: 0, skip: 120 };
  const palettes = { false: null, true: null }; let applied = null, palette = readPalette(themeMedia);
  let mode = 'overview', index = 0, dialog = null /* {id, topic} */, formIndex = Math.max(0, FORMS.findIndex(f => f[0] === profile().cosmetics.equipped['pip-form'])), pendingForm = -1, restoreFocus = null, saveStatus = '';
  let room = null, puffs = null; const cabinets = [], actors = new Map(); const backdrops = {};
  let tween = null, cam = { pos: new THREE.Vector3(0, 5, 14), target: new THREE.Vector3(0, 1.6, -2), fov: FOV }, framingKey = '', aspect = 1.6, bubbleSize = [0, 0];
  const timings = { theme: null, swap: null };
  const reduced = () => motionMedia.matches, portrait = () => isPortrait(aspect);
  const wipe = $('.hb-wipe'), wipeCtx = wipe.getContext('2d');

  const diagnostics = {
    renderer, scene, camera,
    get ready() { return ready; }, get moving() { return !!tween || [...actors.values()].some(a => Math.abs(a.wrapper.scale.x - a.goalScale) > .02 || a.wrapper.position.distanceTo(a.goal) > .02); }, get overview() { return mode === 'overview' && !portrait() && !dialog; },
    get focus() { return GAMES[index].id; }, get focused() { return mode === 'focus' || portrait(); }, get cabinetCount() { return cabinets.length; },
    get sourceScene() { return scene; }, get dialog() { return dialog ? { ...dialog } : null; }, get form() { return FORMS[formIndex][0]; }, get palette() { return palette; },
    get formBusy() { return !!actors.get('PIP_KESSEL')?.fx || pendingForm >= 0; }, get timings() { return timings; }, get wiping() { return !wipe.hidden; },
    get service() { return dialog?.topic ?? ''; }, get portrait() { return portrait(); },
    /** Screen-space boxes (CSS px relative to the canvas) of everything tappable; used by tests. */
    project(kind, key) { return screenBox(kind, key); },
    focusCabinet: i => focusCabinet(i), showOverview: () => showOverview(),
    /** Test hooks: force a theme without touching the page, report the current Pip outfit model. */
    holdFx: null, holdWipe: null,
    get pipModels() { return actors.get('PIP_KESSEL')?.modelId; }, actorsMap: actors,
  };
  window.__hubView = diagnostics;

  // ───────────── theme ─────────────
  /** Palette for either theme, read once (the other one by flipping the site attribute for a moment). */
  function paletteFor(dark) {
    if (palettes[dark]) return palettes[dark];
    const root = document.documentElement, was = root.dataset.theme, current = siteIsDark(themeMedia);
    if (current !== dark) root.dataset.theme = dark ? 'dark' : 'light';
    const p = readPalette(themeMedia);
    if (current !== dark) { if (was === undefined) delete root.dataset.theme; else root.dataset.theme = was; themeObserver.takeRecords(); }
    return (palettes[dark] = p);
  }
  /** Only colours, light values and two texture swaps: no geometry, no new shader (light counts are constant). */
  function applyTheme(dark) {
    palette = paletteFor(dark); applied = dark;
    (scene.background ||= new THREE.Color()).set(dark ? '#241c4a' : '#bfe2fb');
    renderer.toneMappingExposure = dark ? 1.05 : 1;
    room?.retheme(palette);
    for (const c of cabinets) c.retheme(palette);
    if (room && backdrops[dark ? 'dusk' : 'day']) { room.backdropMat.map = backdrops[dark ? 'dusk' : 'day']; }
    for (const a of actors.values()) { a.iblK = dark ? .6 : .8; applyIbl(a.scene, env, a.iblK); a.disc.material.color.set(dark ? '#ffbf6e' : '#fff1b8'); a.disc.material.opacity = dark ? .7 : .6; }
    host.dataset.hubTheme = dark ? 'dark' : 'light';
  }
  /** Overlay the last frame, re-theme, then fade the overlay out with a soft radial wipe (350 ms). */
  function theme() {
    if (disposed) return;
    const dark = siteIsDark(themeMedia); if (dark === applied) return;
    const t0 = performance.now(), live = ready && active && !reduced() && !!room;
    if (live) {
      renderer.render(scene, camera);
      if (wipe.width !== canvas.width || wipe.height !== canvas.height) { wipe.width = canvas.width; wipe.height = canvas.height; }
      wipeCtx.drawImage(canvas, 0, 0); wipe.hidden = false; wipe.style.opacity = '1'; wipe.style.setProperty('--wr', '0px');
    }
    const t1 = performance.now();
    applyTheme(dark);
    const t2 = performance.now();
    if (ready) renderer.render(scene, camera);
    const t3 = performance.now();
    timings.theme = { capture: +(t1 - t0).toFixed(1), apply: +(t2 - t1).toFixed(1), render: +(t3 - t2).toFixed(1), total: +(t3 - t0).toFixed(1) };
    if (live) runWipe();
  }
  let wipeRun = 0;
  function runWipe() {
    const id = ++wipeRun, start = performance.now(), diag = Math.hypot(stage.clientWidth, stage.clientHeight) * 1.05;
    wipe.style.setProperty('--wx', '50%'); wipe.style.setProperty('--wy', '42%');
    const step = now => {
      if (id !== wipeRun) return;
      const k = Math.min(diagnostics.holdWipe ?? 1, (now - start) / 350), e = k * k * (3 - 2 * k);
      if (diagnostics.holdWipe != null) { wipe.style.setProperty('--wr', `${(e * diag).toFixed(0)}px`); wipe.style.opacity = String(1 - e * e); requestAnimationFrame(step); return; }
      wipe.style.setProperty('--wr', `${(e * diag).toFixed(0)}px`); wipe.style.opacity = String(1 - e * e);
      if (k < 1) requestAnimationFrame(step); else wipe.hidden = true;
    };
    requestAnimationFrame(step);
  }
  const loadBackdrop = name => (backdrops[`${name}Promise`] ||= loadImage(new URL(BACKDROPS[name], ASSETS).href, 'Backdrop').then(image => { const t = own.tex(new THREE.Texture(image)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; backdrops[name] = t; return t; }));
  const themeObserver = new MutationObserver(theme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  themeMedia.addEventListener('change', theme);

  // ───────────── camera ─────────────
  const boxPoints = (x, y, z, hw, h, hd, yaw = 0) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [[-hw, 0, -hd], [hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], [-hw, 0, hd], [hw, 0, hd], [-hw, h, hd], [hw, h, hd]].map(([a, b, d]) => [x + a * c + d * s, y + b, z - a * s + d * c]); };
  function roomPoints() {
    const pts = [];
    for (let i = 0; i < GAMES.length; i++) { const p = cabinetPose(i); pts.push(...boxPoints(p.x, p.y, p.z, CABINET.width * CABINET.scale / 2 + .05, CABINET.height * CABINET.scale + .05, .6, p.yaw)); }
    for (const id of ACTOR_IDS) { const s = ACTOR_SPOTS[id]; pts.push(...boxPoints(s.x, 0, s.z, .7, s.height * .93, .4)); }
    return pts;
  }
  const SIDE = 17;
  /** Yaw an actor turns to while talking: a good way towards the conversation camera, never all the way. */
  const talkYaw = a => a.baseYaw - SIDE * Math.PI / 180 * .75;
  /** Close two-shot: camera in front of the character at chest height, character on the left third (desktop) or the lower part (portrait). */
  function talkFrame(a) {
    const gear = dialog?.topic === 'gear', H = a.height * a.goalScale, g = a.goal, t = Math.tan(FOV * Math.PI / 360);
    const yawDeg = -a.baseYaw * 180 / Math.PI + SIDE, dir = viewDirection(yawDeg, portrait() ? 11 : 3), { right, up } = cameraBasis(dir);
    const port = portrait();
    const span = port ? H * (gear ? 2.6 : 2.4) : H * (gear ? 1.5 : dialog?.topic ? 1.4 : 1.3), dist = span / 2 / t;
    const chest = [g.x, g.y + H * (gear ? .5 : .6), g.z], ndcX = port ? 0 : -.36 * Math.min(1, aspect / 1.4), ndcY = port ? (gear ? -.4 : -.42) : -.04;
    const target = chest.map((v, i) => v - right[i] * ndcX * t * aspect * dist - up[i] * ndcY * t * dist);
    return { target, position: target.map((v, i) => v - dir[i] * dist), distance: dist, fovDeg: FOV };
  }
  function framing() {
    const p = cabinetPose(index), yawDeg = -p.yaw * 180 / Math.PI, base = { fovDeg: FOV, aspect };
    if (dialog && actors.has(dialog.id)) return talkFrame(actors.get(dialog.id));
    if (portrait()) {
      const width = Math.max(2.4, CABINET.height * CABINET.scale / .66 * aspect);
      return fitWidth([p.x, p.y + 1.5, p.z], width, { ...base, dir: viewDirection(yawDeg * .8, 5), ndcY: .17 });
    }
    if (mode === 'focus') {
      return fitPoints(boxPoints(p.x, p.y, p.z, CABINET.width * CABINET.scale / 2 + .45, CABINET.height * CABINET.scale + .15, .6, p.yaw), { ...base, dir: viewDirection(yawDeg * .75, 5), margin: .8, lift: .02 });
    }
    return fitPoints(roomPoints(), { ...base, dir: viewDirection(0, PITCH), margin: .96, lift: .02 });
  }
  function currentKey() { return `${mode}|${index}|${portrait()}|${aspect.toFixed(3)}|${dialog ? `${dialog.id}:${dialog.topic === 'gear' ? 'g' : dialog.topic ? 'p' : 'a'}` : ''}`; }
  function syncCamera({ snap = false } = {}) {
    const key = currentKey(); if (key === framingKey && !snap) return; framingKey = key;
    const f = framing(), to = { pos: new THREE.Vector3(...f.position), target: new THREE.Vector3(...f.target), fov: f.fovDeg };
    if (snap || reduced() || !ready) { cam = to; tween = null; applyCamera(); }
    else tween = { from: { pos: cam.pos.clone(), target: cam.target.clone(), fov: cam.fov }, to, t: 0, dur: dialog || tween?.talk ? TALK_TWEEN : TWEEN, talk: !!dialog, arc: Math.min(1.2, cam.pos.distanceTo(to.pos) * .1) };
    layoutActors(snap || reduced() || !ready);
  }
  function applyCamera() { camera.position.copy(cam.pos); camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.lookAt(cam.target); camera.updateMatrixWorld(true); }
  function stepCamera(dt) {
    if (!tween) return;
    tween.t = Math.min(1, tween.t + dt / tween.dur); const k = ease(tween.t);
    cam = { pos: tween.from.pos.clone().lerp(tween.to.pos, k), target: tween.from.target.clone().lerp(tween.to.target, k), fov: tween.from.fov + (tween.to.fov - tween.from.fov) * k };
    cam.pos.y += Math.sin(Math.PI * k) * tween.arc;
    if (tween.t >= 1) { cam = tween.to; tween = null; }
    applyCamera();
  }

  // ───────────── actors ─────────────
  function layoutActors(snap) {
    for (const a of actors.values()) {
      const s = ACTOR_SPOTS[a.id];
      if (portrait()) {
        const p = cabinetPose(index), slot = { PROFESSOR_OWLBERT: -.8, PIP_KESSEL: 0, MAYOR_TORTELLINI: .8 }[a.id];
        { const gx = p.x + slot * Math.cos(p.yaw) + Math.sin(p.yaw) * 2.6, gz = p.z + 2.6 * Math.cos(p.yaw) + (a.id === 'PIP_KESSEL' ? .35 : 0) - slot * Math.sin(p.yaw); a.goal.set(gx, groundY(gx, gz), gz); } a.goalScale = .5; a.baseYaw = a.id === 'PROFESSOR_OWLBERT' ? .25 : a.id === 'MAYOR_TORTELLINI' ? -.25 : 0;
      } else { a.goal.set(s.x, groundY(s.x, s.z), s.z); a.goalScale = 1; a.baseYaw = s.yaw; }
      a.goalYaw = dialog?.id === a.id ? talkYaw(a) : a.baseYaw;
      if (dialog && dialog.id !== a.id && !portrait()) a.goalScale = .02;
      if (snap) { a.wrapper.position.copy(a.goal); a.wrapper.scale.setScalar(a.goalScale); a.wrapper.rotation.y = a.goalYaw; }
    }
  }
  /** Fit a freshly loaded model onto Pip's (or any actor's) standing spot: feet on the ground, fixed scale `k`. */
  function fitModel(model, height, k = null) {
    const box = new THREE.Box3().setFromObject(model); k ??= height / (box.max.y - box.min.y);
    model.scale.setScalar(k); model.position.y = -box.min.y * k; return k;
  }
  const clipOf = (actor, re) => actor.animations.find(x => re.test(x.name));
  function setupModel(actor, mixer) {
    const idle = clipOf(actor, /^idle$/i) ?? clipOf(actor, /idle/i) ?? actor.animations[0], cheer = clipOf(actor, /celebrate|cheer|victory|happy|wave/i);
    return { idle, cheer: cheer !== idle ? cheer : null };
  }
  async function loadActor(id) {
    const modelId = id === 'PIP_KESSEL' ? FORMS[formIndex][0] : id;
    const { definition } = await library.definition(modelId), actor = await library.create(modelId, definition.lods?.lo ? 'lo' : undefined);
    if (disposed) { actor.release(); return; }
    const wrapper = new THREE.Group(), inner = new THREE.Group(), mixer = new THREE.AnimationMixer(actor.scene), clips = setupModel(actor, mixer);
    if (clips.idle) mixer.clipAction(clips.idle).play();
    mixer.update(.3 + Math.random());
    const spot = ACTOR_SPOTS[id], k = fitModel(actor.scene, spot.height); inner.add(actor.scene); wrapper.add(inner);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, spot.height + .2, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (spot.height + .2) / 2; hit.userData.actor = id; own.geo(hit.geometry); own.mat(hit.material); wrapper.add(hit);
    wrapper.position.set(spot.x, 0, spot.z); wrapper.rotation.y = spot.yaw; scene.add(wrapper);
    applyIbl(actor.scene, env, .7);
    const disc = createDisc({ THREE, own, diameter: 3.4 }); scene.add(disc);
    actors.set(id, { id, wrapper, inner, mixer, scene: actor.scene, actor, modelId, k, clips, hit, disc, height: spot.height, goal: new THREE.Vector3(spot.x, 0, spot.z), goalScale: 1, goalYaw: spot.yaw, baseYaw: spot.yaw, iblK: .7,
      blob: room.blobAt(spot.x, 0, spot.z, 1.9, 1.5), phase: Math.random() * 6, look: { next: 2 + Math.random() * 4, t: -1, dir: 1, yaw: 0 }, hop: 9, fx: null, talk: 0 });
  }
  const headPoint = a => new THREE.Vector3(a.wrapper.position.x, a.wrapper.position.y + (a.height + .12) * a.wrapper.scale.y, a.wrapper.position.z);
  const chestPoint = a => new THREE.Vector3(a.wrapper.position.x, a.wrapper.position.y + a.height * .6 * a.wrapper.scale.y, a.wrapper.position.z);

  // ───────────── Pip changes outfit in place ─────────────
    /** Preload the form's model (spinner on its button), then run the hop-and-spin; the puff hides the model swap. */
  async function selectForm(i) {
    const a = actors.get('PIP_KESSEL'); if (!a || i === formIndex && !a.fx) return;
    if (a.fx || a.loading) { pendingForm = i; return; }
    if (i === formIndex) return;
    a.loading = true; const btn = () => bubble.querySelector(`[data-form="${i}"]`);
    btn()?.classList.add('is-loading'); btn()?.setAttribute('aria-busy', 'true');
    const note = bubble.querySelector('[data-form-note]'); if (note) note.textContent = 'Fetching the new gear …';
    const t0 = performance.now();
    try {
      const id = FORMS[i][0], { definition } = await library.definition(id), actor = await library.create(id, definition.lods?.lo ? 'lo' : undefined);
      if (disposed) { actor.release(); return; }
      const mixer = new THREE.AnimationMixer(actor.scene), clips = setupModel(actor, mixer);
      if (clips.idle) mixer.clipAction(clips.idle).play(); mixer.update(.2);
      fitModel(actor.scene, a.height, a.k); applyIbl(actor.scene, env, a.iblK);
      actor.scene.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      try { await renderer.compileAsync(actor.scene, camera, scene); } catch { /* compile is an optimisation only */ }
      actor.scene.traverse(o => { for (const m of [].concat(o.material ?? [])) for (const key of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap']) if (m[key]) renderer.initTexture(m[key]); });
      if (disposed) { actor.release(); return; }
      timings.swap = { preload: +(performance.now() - t0).toFixed(0) };
      formIndex = i; const eq = profile().cosmetics.equipped; eq['pip-form'] = id; saveProfile();
      a.next = { actor, mixer, clips, id, scene: actor.scene };
      if (reduced()) { doSwap(a); }
      else a.fx = { t: 0, swapped: false };
    } catch (error) {
      console.error('[hub gear]', error); const n = bubble.querySelector('[data-form-note]');
      if (n) n.textContent = error.code === 'ASSET_VERSION_MISMATCH' ? 'The game was updated. Reload the page.' : 'That tool could not be loaded. Try again.';
    } finally { a.loading = false; btn()?.classList.remove('is-loading'); btn()?.removeAttribute('aria-busy'); if (dialog?.topic === 'gear') renderBubble(); }
  }
  /** Replace the standing model by the preloaded one and release the old model's resources. */
  function doSwap(a) {
    const n = a.next; if (!n) return; a.next = null;
    const old = { scene: a.scene, mixer: a.mixer, actor: a.actor };
    a.inner.remove(old.scene); old.mixer.stopAllAction(); old.mixer.uncacheRoot(old.scene); old.actor.release?.();
    a.inner.add(n.scene); a.scene = n.scene; a.mixer = n.mixer; a.actor = n.actor; a.clips = n.clips; a.modelId = n.id;
    n.scene.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    puffs.burst(new THREE.Vector3(a.wrapper.position.x, a.wrapper.position.y + a.height * a.wrapper.scale.y * .55, a.wrapper.position.z + .15), FORM_COLORS[n.id] ?? '#2fd16a');
    if (n.clips.cheer && !reduced()) { const act = a.mixer.clipAction(n.clips.cheer); act.reset().setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; if (n.clips.idle) a.mixer.clipAction(n.clips.idle).stop(); act.play(); a.cheerEnd = act; }
    const note = bubble.querySelector('[data-form-note]'); if (note) note.textContent = FORMS[formIndex][2];
  }
  /** One actor's body motion this frame: breathing, look-arounds, tap hop, outfit-change spin. Composes onto `inner`. */
  function animateActor(a, dt, t) {
    const still = reduced();
    let y = 0, sx = 1, sy = 1, yaw = 0;
    if (!still) {
      const br = Math.sin(t * 1.9 + a.phase); sy += .017 * br; sx -= .009 * br;
      const L = a.look; L.next -= dt;
      if (L.t < 0 && L.next <= 0 && !dialog) { L.t = 0; L.dir = Math.random() > .5 ? 1 : -1; L.next = 4 + Math.random() * 5; }
      if (L.t >= 0) { L.t += dt; const u = L.t / 1.6; yaw += L.dir * .38 * Math.sin(Math.PI * Math.min(1, u)) ** 2; if (u >= 1) L.t = -1; }
      if (a.hop < .6) { a.hop += dt; const u = a.hop / .6, h = Math.abs(Math.sin(u * Math.PI * 1.5)) * Math.exp(-u * 2.2); y += h * .2; const sq = Math.max(0, Math.cos(u * Math.PI * 3)) * Math.exp(-u * 3) * .08 * (h < .02 ? 1 : 0); sy -= sq; sx += sq * .8; }
      const fx = a.fx;
      if (fx) {
        fx.t += dt; if (diagnostics.holdFx != null) fx.t = Math.min(fx.t, diagnostics.holdFx); const T = fx.t;
        if (T < .12) { const u = ease(T / .12); sy *= 1 - .2 * u; sx *= 1 + .12 * u; }
        else if (T < .47) {
          const u = (T - .12) / .35, e = ease(u);
          yaw += Math.PI * 2 * e; y += Math.sin(Math.PI * u) * .55 * (a.height / 2.4); const st = Math.sin(Math.PI * u) * .12; sy *= 1 + st; sx *= 1 - st * .6;
          if (u >= .5 && !fx.swapped) { fx.swapped = true; doSwap(a); }
        } else {
          if (!fx.swapped) { fx.swapped = true; doSwap(a); }
          const u = T - .47, s = Math.exp(-u * 7) * Math.cos(u * 17); sy *= 1 - .2 * s; sx *= 1 + .12 * s;
          if (u > .5) { a.fx = null; if (pendingForm >= 0) { const p = pendingForm; pendingForm = -1; selectForm(p); } }
        }
      }
    } else if (a.fx) a.fx = null;
    if (a.cheerEnd && a.cheerEnd.time >= a.cheerEnd.getClip().duration - .05) { const idle = a.clips.idle && a.mixer.clipAction(a.clips.idle); if (idle) { a.cheerEnd.crossFadeTo(idle.reset().play(), .25, false); } a.cheerEnd = null; }
    a.inner.position.y = y; a.inner.scale.set(sx, sy, sx); a.inner.rotation.y = yaw;
  }

  // ───────────── DOM state ─────────────
  const progressFor = g => hubProgress(g.id, gameProfile(g.id), g.id === 'fern-rangers' ? profile().games['fern-rangers-sturmbastion'] : undefined);
  function renderHud() {
    const g = GAMES[index], t = progressFor(g), p = gameProfile(g.id);
    coinsEl.innerHTML = money(profile().coins);
    playBtn.querySelector('span').textContent = p.plays ? 'Continue' : 'Play';
    playBtn.setAttribute('aria-label', `${p.plays ? 'Continue' : 'Play'} ${g.title}`);
    playProgress.innerHTML = `<span>★ ${t.stars} / ${t.maxStars}</span><span aria-hidden="true">·</span><span>${t.cleared} / ${t.levels} levels cleared</span>`;
    srTitle.textContent = g.title; srProgress.textContent = `${g.tagline} Stars ${t.stars} of ${t.maxStars}, ${t.cleared} of ${t.levels} levels cleared.`;
    dots.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
  }
  function syncUi() {
    const port = portrait(), focused = port || mode === 'focus';
    host.classList.toggle('is-portrait', port); host.classList.toggle('is-focus', focused);
    backBtn.hidden = !(mode === 'focus' && !port) ; dots.hidden = !port;
    playBox.hidden = !(ready && focused && !dialog); bubble.hidden = !dialog;
    renderHud(); anchor();
  }
  function focusCabinet(i) {
    index = (i + GAMES.length) % GAMES.length; mode = 'focus';
    if (dialog && !portrait()) closeDialog({ silent: true });
    syncCamera(); syncUi();
  }
  function showOverview() { if (portrait()) return; mode = 'overview'; syncCamera(); syncUi(); }
  function openDialog(id, topic = null) {
    if (!actors.has(id)) return;
    if (!dialog) restoreFocus = document.activeElement;
    if (!dialog || dialog.id !== id) actors.get(id).hop = 0;
    saveStatus = ''; dialog = { id, topic }; renderBubble(); syncCamera(); syncUi();
    requestAnimationFrame(() => bubble.querySelector('[data-keep], button')?.focus({ preventScroll: true }));
  }
  function closeDialog({ silent = false } = {}) {
    if (!dialog) return; const was = dialog; dialog = null; bubble.hidden = true; syncCamera();
    if (!silent) { syncUi(); const back = restoreFocus && document.contains(restoreFocus) ? restoreFocus : host.querySelector(`[data-sr-actor="${was.id}"]`); back?.focus?.({ preventScroll: true }); }
    restoreFocus = null;
  }
  function renderBubble() {
    if (!dialog) return;
    const keep = document.activeElement?.closest?.('.hb-bubble') ? document.activeElement.dataset.keep : null, scroll = bubbleInner.querySelector('.hb-panel__body')?.scrollTop ?? 0, code = bubbleInner.querySelector('textarea')?.value;
    const c = CHARACTERS[dialog.id];
    bubble.classList.toggle('is-panel', !!dialog.topic);
    bubble.setAttribute('aria-label', dialog.topic ? TOPIC_TITLES[dialog.topic] : `${c.name} says`);
    bubble.setAttribute('role', dialog.topic ? 'dialog' : 'group');
    bubbleInner.innerHTML = dialog.topic ? panelHTML(dialog.topic, { form: formIndex, status: saveStatus, creditsUrl: new URL('fernworld/credits.html', ASSETS).href }) : askHTML(c);
    const body = bubbleInner.querySelector('.hb-panel__body'); if (body) body.scrollTop = scroll;
    const ta = bubbleInner.querySelector('textarea'); if (ta && code) ta.value = code;
    if (keep) bubbleInner.querySelector(`[data-keep="${keep}"]`)?.focus({ preventScroll: true });
    bubbleSize = [bubble.offsetWidth, bubble.offsetHeight];
  }

  // ───────────── projection / anchoring ─────────────
  const v = new THREE.Vector3();
  function toScreen(point) { v.copy(point).project(camera); return { x: (v.x * .5 + .5) * stage.clientWidth, y: (-v.y * .5 + .5) * stage.clientHeight, z: v.z }; }
  function screenBox(kind, key) {
    camera.updateMatrixWorld(true); const r = canvas.getBoundingClientRect();
    let pts = null;
    if (kind === 'cabinet') { const c = cabinets[key], b = new THREE.Box3().setFromObject(c.hit); pts = [b.min, b.max, new THREE.Vector3(b.min.x, b.max.y, b.min.z), new THREE.Vector3(b.max.x, b.min.y, b.max.z)]; }
    else if (kind === 'actor') { const a = actors.get(key); pts = [new THREE.Vector3(a.wrapper.position.x - .3, .2, a.wrapper.position.z), headPoint(a).setY(a.height * a.wrapper.scale.y * .6)]; }
    else if (kind === 'head') pts = [headPoint(actors.get(key))];
    else if (kind === 'screen') { const c = cabinets[key], p = c.screen.getWorldPosition(new THREE.Vector3()); pts = [p]; }
    const s = pts.map(toScreen), xs = s.map(p => p.x), ys = s.map(p => p.y);
    return { x: r.left + (Math.min(...xs) + Math.max(...xs)) / 2, y: r.top + (Math.min(...ys) + Math.max(...ys)) / 2, left: r.left + Math.min(...xs), right: r.left + Math.max(...xs), top: r.top + Math.min(...ys), bottom: r.top + Math.max(...ys) };
  }
  function anchor() {
    if (!ready) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!playBox.hidden) {
      const c = cabinets[index], p = c.root.localToWorld(c.anchor.clone()), s = toScreen(p), w = playBox.offsetWidth || 160;
      const x = Math.min(Math.max(s.x, w / 2 + 8), W - w / 2 - 8), y = Math.min(s.y + 10, H - (playBox.offsetHeight || 90) - 8);
      playBox.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translateX(-50%)`;
    }
    if (dialog && !bubble.hidden) {
      const a = actors.get(dialog.id); if (!a) return;
      const sh = toScreen(headPoint(a)), sc = toScreen(chestPoint(a)), bw = bubble.offsetWidth, margin = 8, tail = 12;
      if (!portrait()) {
        // desktop: the character stands on the left third, the bubble or panel fills the free two thirds beside it
        const cap = Math.min(H - 2 * margin, dialog.topic ? H * .84 : H * .6);
        bubbleInner.style.maxHeight = `${Math.max(150, cap)}px`;
        const bh = bubble.offsetHeight, left = Math.min(Math.max(W * .39, sc.x + H * .26), Math.max(margin, W - bw - margin));
        let top = H * .46 - bh / 2; top = Math.min(Math.max(top, margin), Math.max(margin, H - bh - margin));
        bubble.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`; bubble.classList.remove('is-below'); bubble.classList.add('is-side');
        bubbleTail.style.left = ''; bubbleTail.style.top = `${Math.min(Math.max(sh.y + H * .08 - top, 26), Math.max(26, bh - 26)).toFixed(1)}px`;
      } else {
        const s = sh, below = false;
        const cap = Math.min(H * .6, dialog.topic ? s.y - tail - 22 : H);
        bubbleInner.style.maxHeight = `${Math.max(150, cap)}px`; bubble.classList.remove('is-side'); bubbleTail.style.top = '';
        const bh = bubble.offsetHeight, left = Math.min(Math.max(s.x - bw / 2, margin), Math.max(margin, W - bw - margin));
        let top = s.y - bh - tail; top = Math.min(Math.max(top, margin), Math.max(margin, H - bh - margin));
        bubble.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`; bubble.classList.toggle('is-below', below);
        bubbleTail.style.left = `${Math.min(Math.max(s.x - left, 26), Math.max(26, bw - 26)).toFixed(1)}px`;
      }
    }
  }

  // ───────────── input ─────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(true); raycaster.setFromCamera(ndc, camera);
    const targets = [...cabinets.map(c => c.hit), ...[...actors.values()].map(a => a.hit)], hit = raycaster.intersectObjects(targets, false)[0]?.object;
    if (!hit) return null;
    return hit.userData.actor ? { actor: hit.userData.actor } : { cabinet: GAMES.findIndex(g => g.id === hit.userData.cabinet) };
  }
  let press = null;
  canvas.addEventListener('pointerdown', e => { if (e.button > 0) return; press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointercancel', () => { press = null; });
  canvas.addEventListener('pointerup', e => {
    if (!press || press.id !== e.pointerId) return; const p = press; press = null;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4 && (portrait() || mode === 'focus')) { if (dialog) closeDialog({ silent: true }); focusCabinet(index + (dx < 0 ? 1 : -1)); return; }
    if (Math.hypot(dx, dy) > 12) return;
    const hit = pick(e);
    if (hit?.actor) { if (dialog?.id === hit.actor && !dialog.topic) { actors.get(hit.actor).hop = 0; return; } openDialog(hit.actor); return; }
    if (hit && hit.cabinet >= 0) { cabinets[hit.cabinet].bounce(); if (dialog) closeDialog({ silent: true }); if (!(mode === 'focus' && index === hit.cabinet) || portrait() && index !== hit.cabinet) focusCabinet(hit.cabinet); else syncUi(); return; }
    if (dialog) { closeDialog(); return; }
    if (mode === 'focus' && !portrait()) showOverview();
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch' || press) return; const h = pick(e); canvas.style.cursor = h ? 'pointer' : ''; cabinets.forEach((c, i) => c.hover(h?.cabinet === i)); });
  canvas.addEventListener('pointerleave', () => cabinets.forEach(c => c.hover(false)));

  const setStatus = text => { saveStatus = text; const el = bubble.querySelector('[data-save-status]'); if (el) el.textContent = text; };
  host.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    const d = b.dataset;
    if (d.dot !== undefined) { if (dialog) closeDialog({ silent: true }); focusCabinet(Number(d.dot)); return; }
    if (d.srGame !== undefined) { focusCabinet(Number(d.srGame)); onPlay(GAMES[index].id); return; }
    if (d.srActor) { openDialog(d.srActor); return; }
    if (d.answer !== undefined) { if (d.answer) openDialog(dialog.id, d.answer); else closeDialog(); return; }
    if (d.buy) { purchaseUpgrade(d.buy); return; }
    if (d.ring) { selectTournamentRing(d.ring); return; }
    if (d.job) { const j = (await import('./hub-progress.js')).jobs().find(x => x.id === d.job); if (j) (j.active ? claimJob : acceptJob)(j.id); return; }
    if (d.form !== undefined) { selectForm(Number(d.form)); return; }
    const act = d.act;
    if (act === 'play') onPlay(GAMES[index].id);
    else if (act === 'back') { if (dialog) closeDialog(); else showOverview(); }
    else if (act === 'close') closeDialog();
    else if (act === 'export') { const code = exportCode(), ta = bubble.querySelector('textarea'); ta.value = code; ta.select(); try { await navigator.clipboard.writeText(code); setStatus('Code copied.'); } catch { setStatus('Your code is ready to copy.'); } }
    else if (act === 'import') { try { importCode(bubble.querySelector('textarea').value); setStatus('Save loaded.'); } catch (error) { setStatus(error.message); } }
  });
  host.addEventListener('focusin', e => { const b = e.target.closest?.('[data-sr-game]'); if (b && !dialog) focusCabinet(Number(b.dataset.srGame)); });
  const onKey = e => {
    if (!active || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const inField = e.target.closest?.('input,textarea,select');
    if (e.key === 'Escape') { if (dialog) { closeDialog(); e.preventDefault(); } else if (mode === 'focus' && !portrait()) { showOverview(); e.preventDefault(); } return; }
    if (inField) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (dialog && e.target.closest?.('.hb-bubble')) return; if (dialog) closeDialog({ silent: true }); const first = mode === 'overview' && !portrait(); focusCabinet(first ? index : index + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault(); }
    else if (e.key === 'Enter' && !e.target.closest?.('button,a,summary')) { if (mode === 'focus' || portrait()) { onPlay(GAMES[index].id); e.preventDefault(); } }
  };
  window.addEventListener('keydown', onKey);
  const unsubscribe = onChange(() => { renderHud(); if (dialog?.topic) renderBubble(); });

  // ───────────── loop / resize ─────────────
  function resize() {
    if (disposed) return; const r = canvas.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    pixelRatio = Math.min(pixelRatio, LOW_GPU ? .6 : Math.min(devicePixelRatio || 1, 1.75)); if (!pixelRatioSet) { pixelRatio = LOW_GPU ? .6 : Math.min(devicePixelRatio || 1, 1.75); pixelRatioSet = true; }
    renderer.setPixelRatio(pixelRatio); renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; aspect = camera.aspect;
    const wasPortrait = host.classList.contains('is-portrait'); if (portrait() && mode !== 'focus') mode = 'focus';
    if (wasPortrait && !portrait()) mode = 'overview';
    syncCamera({ snap: true }); syncUi();
  }
  /** Dynamic resolution: when frames average slower than ~55 fps, render fewer pixels (Intel iGPUs) down to 0.7x. */
  function adaptResolution(dt) {
    if (tween || dt >= .05) { slow.sum = 0; slow.n = 0; return; }
    if (slow.skip > 0) { slow.skip--; return; }
    slow.sum += dt; if (++slow.n < 60) return;
    const avg = slow.sum / slow.n; slow.sum = 0; slow.n = 0;
    if (avg > .0182 && pixelRatio > .7) { pixelRatio = Math.max(.7, pixelRatio * .88); renderer.setPixelRatio(pixelRatio); const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); slow.skip = 30; }
  }
  function frame(now) {
    if (!active || disposed) return;
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; clock += dt;
    stepCamera(dt);
    const k = 1 - Math.exp(-dt * (reduced() ? 100 : 7));
    for (const a of actors.values()) {
      a.mixer.update(dt);
      a.wrapper.position.lerp(a.goal, k); const sc = a.wrapper.scale.x + (a.goalScale - a.wrapper.scale.x) * k; a.wrapper.scale.setScalar(sc); a.wrapper.rotation.y += (a.goalYaw - a.wrapper.rotation.y) * k;
      animateActor(a, dt, clock);
      a.blob.position.set(a.wrapper.position.x, a.wrapper.position.y + .012, a.wrapper.position.z); a.blob.scale.set(1.9 * sc * (1 - a.inner.position.y * .35), 1, 1.5 * sc * (1 - a.inner.position.y * .35));
      a.disc.position.set(a.wrapper.position.x, a.wrapper.position.y + .02, a.wrapper.position.z); a.disc.scale.set(3.4 * sc, 1, 3.4 * sc);
    }
    const still = reduced(); room?.update(clock, still); puffs?.update(dt);
    cabinets.forEach(c => c.update(dt, clock, still));
    if (ready) { anchor(); renderer.render(scene, camera); adaptResolution(dt); }
    raf = requestAnimationFrame(frame);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  new ResizeObserver(() => { if (dialog) { bubbleSize = [bubble.offsetWidth, bubble.offsetHeight]; anchor(); } }).observe(bubble);

  // ───────────── prepare ─────────────
  async function prepare() {
    loadingStatus.update({ phase: 'prepare', stage: 'Setting up Fernhaven …' });
    const dark = siteIsDark(themeMedia);
    const [fernModels, arts] = await Promise.all([
      Promise.all(FERNS.map(id => library.model(id, 'lo'))),
      Promise.all(GAMES.map(g => loadImage(new URL(`covers/${g.cover}.webp`, ASSETS).href, `Cover ${g.id}`))),
      loadBackdrop(dark ? 'dusk' : 'day'),
    ]);
    if (disposed) return;
    paletteFor(false); paletteFor(true);
    const ferns = fernModels.map(parts => { const box = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); } return { parts, height: Math.max(.05, box.max.y - box.min.y), minY: box.min.y }; });
    room = buildRoom({ THREE, own, env, ferns, palettes }); scene.add(room.group);
    puffs = createPuffs({ THREE, own, scene });
    GAMES.forEach((g, i) => {
      const c = createCabinet({ THREE, own, game: g, art: arts[i], env, palettes }), p = cabinetPose(i);
      c.root.position.set(p.x, p.y, p.z); c.root.userData.baseY = p.y; c.root.rotation.y = p.yaw; scene.add(c.root); cabinets.push(c);
    });
    await Promise.all(ACTOR_IDS.map(loadActor));
    if (disposed) return;
    loadingStatus.update({ phase: 'prepare', stage: 'Lighting …' });
    await document.fonts?.ready; if (disposed) return;
    // both backdrops resident, both theme states compiled before the first frame: a later switch is only uniforms
    await Promise.all([loadBackdrop('day'), loadBackdrop('dusk')]); if (disposed) return;
    for (const t of owned.textures) renderer.initTexture(t);
    const now = () => siteIsDark(themeMedia);
    applyTheme(!now()); try { await renderer.compileAsync(scene, camera); } catch { /* optional */ }
    applyTheme(now()); try { await renderer.compileAsync(scene, camera); } catch { /* optional */ }
    if (applied !== now()) applyTheme(now());
    ready = true; framingKey = ''; syncCamera({ snap: true }); layoutActors(true); syncUi(); applyCamera();
    loadingStatus.finish();
  }
  const prepared = prepare().catch(error => {
    if (disposed) return; console.error('[hub]', error); const stale = error.code === 'ASSET_VERSION_MISMATCH';
    loadingStatus.fail(stale ? 'The game was updated. Reload the page.' : 'Fernhaven could not be loaded.', { action: () => location.reload(), label: 'Reload' }); throw error;
  });
  prepared.catch(() => {});
  renderHud();

  return {
    activate() { if (active) return; active = true; resize(); last = 0; raf = requestAnimationFrame(frame); },
    deactivate() { active = false; cancelAnimationFrame(raf); press = null; if (dialog) closeDialog({ silent: true }); },
    get focus() { return GAMES[index].id; }, get ready() { return prepared; }, boxes: cabinets,
    destroy() {
      loadingStatus.finish(); disposed = true; if (window.__hubView === diagnostics) delete window.__hubView; active = false; cancelAnimationFrame(raf);
      themeObserver.disconnect(); resizeObserver.disconnect(); themeMedia.removeEventListener('change', theme); unsubscribe(); window.removeEventListener('keydown', onKey);
      for (const a of actors.values()) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.scene); a.actor.release?.(); if (a.next) a.next.actor.release?.(); }
      library.dispose(); for (const m of owned.materials) m.dispose(); for (const t of owned.textures) t.dispose(); for (const g of owned.geometries) g.dispose();
      env.dispose?.(); renderer.dispose();
    },
  };
}
