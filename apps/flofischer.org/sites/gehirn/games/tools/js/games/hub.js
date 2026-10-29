/**
 * Fernhaven hub: a gallery room with four arcade cabinets and three characters. Everything is operated in the scene:
 * tap a cabinet to focus it and play, tap a character to talk. HTML only for the Play button, speech bubbles and a
 * few small controls, all anchored to projected 3D points and styled from the Fernwork tokens (tools/games-hub.css).
 */
import { THREE, createRenderer, applyIbl, studioEnvironment, LOW_GPU } from './three-kit.js';
import { bindLoadingStatus, loadingBarHTML } from './loading-status.js';
import { formatLoadProgress } from '../../games-assets/fernworld/runtime/loading-cache.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { hubProgress } from './hub-progress-view.js';
import { profile, game as gameProfile, exportCode, importCode, onChange } from './profile.js';
import { purchaseUpgrade, acceptJob, claimJob, selectTournamentRing } from './hub-progress.js';
import { readPalette } from './hub-theme.js';
import { fitPoints, fitWidth, viewDirection, isPortrait } from './hub-camera.js';
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
const TWEEN = .6, FOV = 32, PITCH = 12;
const loadImage = (url, label) => new Promise((resolve, reject) => { const image = new Image(); image.decoding = 'async'; image.onload = () => resolve(image); image.onerror = () => reject(new Error(`${label} failed to load`)); image.src = url; });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function mountHub(host, { onPlay }) {
  host.classList.add('gm-hub', 'hb-root');
  host.innerHTML = `<div class="gm-hub__stage hb-stage"><canvas class="gm-hub__canvas" aria-hidden="true"></canvas>${loadingBarHTML()}
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
  let palette = readPalette(themeMedia);
  let mode = 'overview', index = 0, dialog = null /* {id, topic} */, formIndex = 0, formActor = null, formLibrary = null, formSerial = 0, restoreFocus = null, saveStatus = '';
  let room = null; const cabinets = [], actors = new Map(); const backdrops = {};
  let tween = null, cam = { pos: new THREE.Vector3(0, 5, 14), target: new THREE.Vector3(0, 1.6, -2), fov: FOV }, framingKey = '', aspect = 1.6, bubbleSize = [0, 0];
  const reduced = () => motionMedia.matches, portrait = () => isPortrait(aspect);

  const diagnostics = {
    renderer, scene, camera,
    get ready() { return ready; }, get moving() { return !!tween; }, get overview() { return mode === 'overview' && !portrait(); },
    get focus() { return GAMES[index].id; }, get focused() { return mode === 'focus' || portrait(); }, get cabinetCount() { return cabinets.length; },
    get sourceScene() { return scene; }, get dialog() { return dialog ? { ...dialog } : null; }, get form() { return formActor?.id; }, get palette() { return palette; },
    get service() { return dialog?.topic ?? ''; }, get portrait() { return portrait(); },
    /** Screen-space boxes (CSS px relative to the canvas) of everything tappable; used by tests. */
    project(kind, key) { return screenBox(kind, key); },
    focusCabinet: i => focusCabinet(i), showOverview: () => showOverview(),
  };
  window.__hubView = diagnostics;

  // ───────────── theme ─────────────
  function theme() {
    if (disposed) return;
    palette = readPalette(themeMedia);
    const dark = palette.dark;
    scene.background = new THREE.Color(dark ? '#1a1530' : '#cfe4f4');
    renderer.toneMappingExposure = dark ? 1.05 : 1;
    room?.retheme(palette);
    for (const c of cabinets) c.retheme(palette);
    setBackdrop(dark ? 'dusk' : 'day');
    for (const a of actors.values()) applyIbl(a.scene, env, dark ? .55 : .75);
    host.dataset.hubTheme = dark ? 'dark' : 'light';
  }
  async function setBackdrop(name) {
    if (!room) return;
    try {
      backdrops[name] ||= loadImage(new URL(BACKDROPS[name], ASSETS).href, 'Backdrop').then(image => { const t = own.tex(new THREE.Texture(image)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; });
      const wanted = palette.dark ? 'dusk' : 'day', tex = await backdrops[name];
      if (disposed || name !== wanted) return;
      room.backdropMat.map = tex; room.backdropMat.needsUpdate = true;
    } catch (error) { console.error('[hub backdrop]', error); }
  }
  const themeObserver = new MutationObserver(theme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  themeMedia.addEventListener('change', theme);

  // ───────────── camera ─────────────
  const boxPoints = (x, y, z, hw, h, hd, yaw = 0) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [[-hw, 0, -hd], [hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], [-hw, 0, hd], [hw, 0, hd], [-hw, h, hd], [hw, h, hd]].map(([a, b, d]) => [x + a * c + d * s, y + b, z - a * s + d * c]); };
  function roomPoints() {
    const pts = [];
    for (let i = 0; i < GAMES.length; i++) { const p = cabinetPose(i); pts.push(...boxPoints(p.x, p.y, p.z, CABINET.width * CABINET.scale / 2 + .05, CABINET.height * CABINET.scale + .05, .6, p.yaw)); }
    for (const id of ACTOR_IDS) { const s = ACTOR_SPOTS[id]; pts.push(...boxPoints(s.x, 0, s.z, .65, s.height + .35, .4)); }
    return pts;
  }
  function framing() {
    const p = cabinetPose(index), yawDeg = -p.yaw * 180 / Math.PI, base = { fovDeg: FOV, aspect };
    if (portrait()) {
      const width = Math.max(2.4, CABINET.height * CABINET.scale / .66 * aspect);
      const f = fitWidth([p.x, p.y + 1.5, p.z], width, { ...base, dir: viewDirection(yawDeg * .8, 5), ndcY: .17 });
      return f;
    }
    if (mode === 'focus') {
      return fitPoints(boxPoints(p.x, p.y, p.z, CABINET.width * CABINET.scale / 2 + .45, CABINET.height * CABINET.scale + .15, .6, p.yaw), { ...base, dir: viewDirection(yawDeg * .75, 5), margin: .8, lift: .02 });
    }
    return fitPoints(roomPoints(), { ...base, dir: viewDirection(0, PITCH), margin: .96, lift: .02 });
  }
  function currentKey() { return `${mode}|${index}|${portrait()}|${aspect.toFixed(3)}`; }
  function syncCamera({ snap = false } = {}) {
    const key = currentKey(); if (key === framingKey && !snap) return; framingKey = key;
    const f = framing(), to = { pos: new THREE.Vector3(...f.position), target: new THREE.Vector3(...f.target), fov: f.fovDeg };
    if (snap || reduced() || !ready) { cam = to; tween = null; applyCamera(); }
    else tween = { from: { pos: cam.pos.clone(), target: cam.target.clone(), fov: cam.fov }, to, t: 0 };
    layoutActors(snap || reduced() || !ready);
  }
  function applyCamera() { camera.position.copy(cam.pos); camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.lookAt(cam.target); camera.updateMatrixWorld(true); }
  function stepCamera(dt) {
    if (!tween) return;
    tween.t = Math.min(1, tween.t + dt / TWEEN); const k = ease(tween.t);
    cam = { pos: tween.from.pos.clone().lerp(tween.to.pos, k), target: tween.from.target.clone().lerp(tween.to.target, k), fov: tween.from.fov + (tween.to.fov - tween.from.fov) * k };
    if (tween.t >= 1) { cam = tween.to; tween = null; }
    applyCamera();
  }

  // ───────────── actors ─────────────
  function layoutActors(snap) {
    for (const a of actors.values()) {
      const s = ACTOR_SPOTS[a.id];
      if (portrait()) {
        const p = cabinetPose(index), slot = { PROFESSOR_OWLBERT: -.68, PIP_KESSEL: 0, MAYOR_TORTELLINI: .68 }[a.id];
        { const gx = p.x + slot * Math.cos(p.yaw) + Math.sin(p.yaw) * 2.6, gz = p.z + 2.6 * Math.cos(p.yaw) + (a.id === 'PIP_KESSEL' ? .3 : 0) - slot * Math.sin(p.yaw); a.goal.set(gx, groundY(gx, gz), gz); } a.goalScale = .46; a.goalYaw = a.id === 'PROFESSOR_OWLBERT' ? .25 : a.id === 'MAYOR_TORTELLINI' ? -.25 : 0;
      } else { a.goal.set(s.x, groundY(s.x, s.z), s.z); a.goalScale = 1; a.goalYaw = s.yaw; }
      if (snap) { a.wrapper.position.copy(a.goal); a.wrapper.scale.setScalar(a.goalScale); a.wrapper.rotation.y = a.goalYaw; }
    }
  }
  async function loadActor(id) {
    const { definition } = await library.definition(id), actor = await library.create(id, definition.lods?.lo ? 'lo' : undefined);
    if (disposed) { actor.release(); return; }
    const wrapper = new THREE.Group(), mixer = new THREE.AnimationMixer(actor.scene), idle = actor.animations.find(x => /^idle$/i.test(x.name)) ?? actor.animations.find(x => /idle/i.test(x.name)) ?? actor.animations[0];
    if (idle) mixer.clipAction(idle).play();
    mixer.update(.3 + Math.random());
    const spot = ACTOR_SPOTS[id], box = new THREE.Box3().setFromObject(actor.scene), k = spot.height / (box.max.y - box.min.y);
    actor.scene.scale.setScalar(k); actor.scene.position.y = -box.min.y * k; wrapper.add(actor.scene);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, spot.height + .2, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (spot.height + .2) / 2; hit.userData.actor = id; own.geo(hit.geometry); own.mat(hit.material); wrapper.add(hit);
    wrapper.position.set(spot.x, 0, spot.z); wrapper.rotation.y = spot.yaw; scene.add(wrapper);
    applyIbl(actor.scene, env, .7);
    actors.set(id, { id, wrapper, mixer, scene: actor.scene, actor, hit, height: spot.height, goal: new THREE.Vector3(spot.x, 0, spot.z), goalScale: 1, goalYaw: spot.yaw, blob: room.blobAt(spot.x, 0, spot.z, 1.5, 1.2) });
  }
  const headPoint = a => new THREE.Vector3(a.wrapper.position.x, a.wrapper.position.y + (a.height + .12) * a.wrapper.scale.y, a.wrapper.position.z);

  // ───────────── gear form model next to Pip ─────────────
  function releaseForm() {
    if (formActor) { formActor.mixer.stopAllAction(); formActor.mixer.uncacheRoot(formActor.scene); scene.remove(formActor.holder); formActor.release(); formActor = null; }
    formLibrary?.dispose(); formLibrary = null;
  }
  async function loadForm(i) {
    formIndex = i; const serial = ++formSerial; releaseForm();
    const note = () => bubble.querySelector('[data-form-note]'), lib = new ChannelLibrary({ onProgress: e => { if (serial === formSerial && note()) note().textContent = formatLoadProgress(e); } }); formLibrary = lib;
    try {
      const { definition } = await lib.definition(FORMS[i][0]), actor = await lib.create(FORMS[i][0], definition.lods?.lo ? 'lo' : undefined);
      if (serial !== formSerial || disposed) { actor.release(); lib.dispose(); return; }
      const mixer = new THREE.AnimationMixer(actor.scene), idle = actor.animations.find(x => /^(Idle|Ground_Idle)$/i.test(x.name)); if (idle) mixer.clipAction(idle).play(); mixer.update(.2);
      const box = new THREE.Box3().setFromObject(actor.scene), k = 1.45 / (box.max.y - box.min.y), holder = new THREE.Group();
      actor.scene.scale.setScalar(k); actor.scene.position.y = -box.min.y * k; holder.add(actor.scene);
      const pip = actors.get('PIP_KESSEL'); holder.position.set((pip?.goal.x ?? .15) + (portrait() ? .78 : 1.55), 0, (pip?.goal.z ?? 1.75) + (portrait() ? .1 : .15)); holder.rotation.y = -.35; holder.scale.setScalar(portrait() ? .5 : 1);
      scene.add(holder); applyIbl(actor.scene, env, .7); formActor = { ...actor, mixer, holder };
      if (note()) note().textContent = FORMS[i][2];
    } catch (error) { if (serial !== formSerial || disposed) return; console.error('[hub gear]', error); if (note()) note().textContent = error.code === 'ASSET_VERSION_MISMATCH' ? 'The game was updated. Reload the page.' : 'That tool could not be loaded. Try again.'; }
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
    playBox.hidden = !(ready && focused && !(dialog?.topic)); bubble.hidden = !dialog;
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
    if (!portrait() && mode === 'focus') { mode = 'overview'; syncCamera(); }
    if (!dialog) restoreFocus = document.activeElement;
    if (dialog?.topic === 'gear' && topic !== 'gear') { ++formSerial; releaseForm(); }
    saveStatus = ''; dialog = { id, topic }; renderBubble(); syncUi();
    if (topic === 'gear') loadForm(formIndex);
    requestAnimationFrame(() => bubble.querySelector('[data-keep], button')?.focus({ preventScroll: true }));
  }
  function closeDialog({ silent = false } = {}) {
    if (!dialog) return; const was = dialog; dialog = null; ++formSerial; releaseForm(); bubble.hidden = true;
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
      const s = toScreen(headPoint(a)), bw = bubble.offsetWidth, margin = 8, tail = 12, below = s.y < Math.min(230, H * .45) && !!(dialog.topic ? false : true) && s.y < 190;
      const cap = Math.min(H * .6, dialog.topic ? (below ? H - s.y - 24 : s.y - tail - 22) : H);
      bubbleInner.style.maxHeight = `${Math.max(150, cap)}px`;
      const bh = bubble.offsetHeight, left = Math.min(Math.max(s.x - bw / 2, margin), Math.max(margin, W - bw - margin));
      let top = below ? s.y + tail + 6 : s.y - bh - tail; top = Math.min(Math.max(top, margin), Math.max(margin, H - bh - margin));
      bubble.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`; bubble.classList.toggle('is-below', below);
      bubbleTail.style.left = `${Math.min(Math.max(s.x - left, 26), Math.max(26, bw - 26)).toFixed(1)}px`;
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
    if (hit?.actor) { if (dialog?.id === hit.actor && !dialog.topic) return; openDialog(hit.actor); return; }
    if (hit && hit.cabinet >= 0) { if (dialog) closeDialog({ silent: true }); if (!(mode === 'focus' && index === hit.cabinet) || portrait() && index !== hit.cabinet) focusCabinet(hit.cabinet); else syncUi(); return; }
    if (dialog) { closeDialog(); return; }
    if (mode === 'focus' && !portrait()) showOverview();
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch' || press) return; canvas.style.cursor = pick(e) ? 'pointer' : ''; });

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
    if (d.form !== undefined) { loadForm(Number(d.form)); renderBubble(); return; }
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
      a.blob.position.set(a.wrapper.position.x, a.wrapper.position.y + .012, a.wrapper.position.z); a.blob.scale.set(1.5 * sc, 1, 1.2 * sc);
    }
    formActor?.mixer.update(dt);
    if (ready) { anchor(); renderer.render(scene, camera); adaptResolution(dt); }
    raf = requestAnimationFrame(frame);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  new ResizeObserver(() => { if (dialog) { bubbleSize = [bubble.offsetWidth, bubble.offsetHeight]; anchor(); } }).observe(bubble);

  // ───────────── prepare ─────────────
  async function prepare() {
    loadingStatus.update({ phase: 'prepare', stage: 'Setting up Fernhaven …' });
    palette = readPalette(themeMedia); const dark = palette.dark;
    const [fernModels, arts] = await Promise.all([
      Promise.all(FERNS.map(id => library.model(id, 'lo'))),
      Promise.all(GAMES.map(g => loadImage(new URL(`covers/${g.cover}.webp`, ASSETS).href, `Cover ${g.id}`))),
      (backdrops[dark ? 'dusk' : 'day'] = loadImage(new URL(BACKDROPS[dark ? 'dusk' : 'day'], ASSETS).href, 'Backdrop').then(image => { const t = own.tex(new THREE.Texture(image)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; })),
    ]);
    if (disposed) return;
    const ferns = fernModels.map(parts => { const box = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); } return { parts, height: Math.max(.05, box.max.y - box.min.y), minY: box.min.y }; });
    room = buildRoom({ THREE, own, env, ferns }); scene.add(room.group);
    GAMES.forEach((g, i) => {
      const c = createCabinet({ THREE, own, game: g, art: arts[i], env }), p = cabinetPose(i);
      c.root.position.set(p.x, p.y, p.z); c.root.rotation.y = p.yaw; scene.add(c.root); cabinets.push(c);
    });
    await Promise.all(ACTOR_IDS.map(loadActor));
    if (disposed) return;
    loadingStatus.update({ phase: 'prepare', stage: 'Lighting …' });
    await document.fonts?.ready; if (disposed) return;
    theme();
    for (const t of owned.textures) renderer.initTexture(t);
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
      ++formSerial; releaseForm(); themeObserver.disconnect(); resizeObserver.disconnect(); themeMedia.removeEventListener('change', theme); unsubscribe(); window.removeEventListener('keydown', onKey);
      for (const a of actors.values()) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.scene); a.actor.release?.(); }
      library.dispose(); for (const m of owned.materials) m.dispose(); for (const t of owned.textures) t.dispose(); for (const g of owned.geometries) g.dispose();
      env.dispose?.(); renderer.dispose();
    },
  };
}
