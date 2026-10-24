/**
 * The overworld: a game's four worlds as floating islands in one sky (world/island.js). Level nodes sit on each
 * island's path; the game's hero stands on the current node and hops along the path to the one you pick; a card
 * shows the level (stars, best score) with Play. Worlds open with stars (profile.js STAR_GATES); a locked island is
 * shown under a haze with what it needs. Swipe, the arrows or the arrow keys switch worlds.
 *
 * mountOverworld(host, { levels, hero, companion, state, onPlay }) → { activate(), deactivate(), refresh(), focus(i) }
 *   levels: [{ name, world, boss }]     state: { stars(i), best(i), open(i), worldOpen(w), need(w), current() }
 */
import { THREE, createRenderer, addLights, studioEnvironment, applyIbl, LOW_GPU } from './three-kit.js';
import { loadModel } from './models.js';
import { buildIsland } from './world/island.js';
import { THEMES, WORLD_ORDER } from './world/themes.js';
import { Batch, mtx } from './world/decor.js';
import { icon } from '../../../assets/kit/icons.js';

const SPACING = 30;          // distance between islands
const NODE_Y = 0.05;
const MATS = {
  matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02 }),
  gloss: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.04 }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

/** A figure from the baked cast as one group, with handles for the hop animation. */
function figure(model) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs = [];
  for (const g of model) {
    const mesh = new THREE.Mesh(g.geometry, MATS[g.mat]());
    mesh.castShadow = g.mat !== 'glow';
    if (g.ch === 'legL' || g.ch === 'legR') {
      const pivot = new THREE.Group(); pivot.position.set(...g.pivot);
      mesh.position.set(-g.pivot[0], -g.pivot[1], -g.pivot[2]);
      pivot.add(mesh); body.add(pivot); legs.push({ pivot, side: g.ch === 'legL' ? 1 : -1 });
    } else body.add(mesh);
  }
  return { root, body, legs };
}

/** Number badge for a node, drawn once into a small canvas texture. */
function badge(text, { bg, fg }) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(64, 68, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = bg; g.beginPath(); g.arc(64, 62, 52, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = fg; g.font = `800 ${text.length > 2 ? 40 : 58}px Geist, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mountOverworld(host, { levels, hero = 'RANGER_BUNNY', companion = null, state, onPlay, title = '' }) {
  host.classList.add('gm-ow');
  host.innerHTML = `
    <canvas class="gm-ow__canvas" aria-hidden="true"></canvas>
    <div class="gm-ow__top">
      <div class="gm-ow__world"><span class="gm-ow__kicker" data-ow="kicker"></span><strong data-ow="world"></strong></div>
      <div class="gm-ow__stars">${icon('star', { size: 16 })}<span class="fw-num" data-ow="stars"></span></div>
    </div>
    <div class="gm-ow__nav">
      <button type="button" class="fw-iconbtn gm-hud__btn" data-ow="prev" aria-label="Previous world">${icon('chevron-left', { size: 22 })}</button>
      <button type="button" class="fw-iconbtn gm-hud__btn" data-ow="next" aria-label="Next world">${icon('chevron-right', { size: 22 })}</button>
    </div>
    <div class="gm-ow__lock" data-ow="lock" hidden></div>
    <section class="gm-ow__card" data-ow="card" aria-live="polite" hidden></section>
    <ol class="gm-ow__list sr-only" data-ow="list" aria-label="${title} levels"></ol>`;
  const canvas = host.querySelector('canvas');
  const $ = (k) => host.querySelector(`[data-ow="${k}"]`);
  const worlds = WORLD_ORDER.map((theme, w) => ({ theme, index: w, levels: levels.map((lv, i) => ({ ...lv, i })).filter((lv) => lv.world === w) }));

  const renderer = createRenderer(canvas);
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const env = studioEnvironment(renderer);
  scene.fog = new THREE.Fog(0xcfe7fb, 40, 120);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  window.__owView = { renderer, scene, camera }; // test/bench hook (the overworld last mounted)
  const lights = addLights(scene, { dir: [-10, 16, 9], shadowBox: 13, mapSize: 2048, intensity: 2.4, ambient: 1.1 });
  const fogC = new THREE.Color();
  // sky dome: horizon colour below, the world's sky colour overhead, a warm glow where the sun is
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBelow: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(-0.45, 0.35, -0.8).normalize() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    // soft cloud banks above the horizon and a sea of clouds below the islands: three octaves of value noise on the
    // sky plane (a few dozen ALU per pixel, no textures), plus the sun's disc
    fragmentShader: `uniform vec3 uTop, uHorizon, uBelow, uSun; varying vec3 vDir;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 1.8 + 0.1, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.7));
        col = mix(col, uBelow, smoothstep(0.0, -0.45, d.y));
        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.9, 0.7) * (pow(sd, 24.0) * 0.5 + smoothstep(0.9991, 0.9996, sd) * 0.8);
        vec2 q = d.xz / (abs(d.y) + 0.22);
        float c = n2(q * 1.1) * 0.55 + n2(q * 2.3 + 3.1) * 0.3 + n2(q * 5.1 + 7.7) * 0.15;
        float up = smoothstep(0.02, 0.14, d.y) * smoothstep(0.62, 0.22, d.y), down = smoothstep(-0.06, -0.2, d.y);
        float m = smoothstep(0.52, 0.74, c) * (up * 0.75 + down * 0.9);
        vec3 cloud = mix(uHorizon, vec3(1.0), 0.72) * (0.86 + 0.14 * smoothstep(0.5, 0.8, n2(q * 1.1 + vec2(0.0, 0.4))));
        col = mix(col, cloud, m);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat);
  // drawn after the opaque scene at the far plane, so only the pixels the islands leave free pay for the sky
  skyDome.frustumCulled = false; skyDome.renderOrder = 999;
  scene.add(skyDome);

  // clouds: soft sprites drifting below and between the islands
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    for (const [x, y, r] of [[64, 70, 40], [40, 76, 28], [88, 78, 30], [60, 56, 30]]) {
      const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
    s.position.set(-15 + Math.random() * (SPACING * 4 + 10), -8 - Math.random() * 10, -16 + Math.random() * 26);
    s.scale.setScalar(8 + Math.random() * 10);
    scene.add(s); clouds.push(s);
  }

  // a few birds wheeling over the islands (one instanced mesh of two-triangle wings)
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.5, 0.12, -0.05, 0, 0, -0.1, 0, 0, 0.12, 0.5, 0.12, -0.05, 0, 0, -0.1], 3));
  birdGeo.computeVertexNormals();
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x3a3a4a, side: THREE.DoubleSide, fog: true }), 12);
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); birds.frustumCulled = false; scene.add(birds);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), be = new THREE.Euler(), bv = new THREE.Vector3(), bs = new THREE.Vector3();

  // per world: island (built lazily), node pads, badges
  const padGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.18, 32);
  const ringGeo = new THREE.TorusGeometry(0.66, 0.05, 8, 40);
  const padMat = { open: new THREE.MeshStandardMaterial({ color: 0xfff6dc, roughness: 0.45 }), done: new THREE.MeshStandardMaterial({ color: 0x8fd16a, roughness: 0.45 }), locked: new THREE.MeshStandardMaterial({ color: 0xc9ccd3, roughness: 0.7 }), boss: new THREE.MeshStandardMaterial({ color: 0xe0574a, roughness: 0.4 }) };
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false, transparent: true });
  const W = worlds.map((wd, w) => ({ ...wd, group: new THREE.Group(), island: null, building: null, nodes: [], x: w * SPACING, y: Math.sin(w * 1.7) * 1.2, z: w % 2 ? -3 : 0 }));
  for (const wd of W) { wd.group.position.set(wd.x, wd.y, wd.z); wd.group.rotation.y = wd.index % 2 ? -0.12 : 0.1; scene.add(wd.group); }

  async function ensureIsland(wd) {
    if (wd.island || wd.building) return wd.building;
    wd.building = buildIsland({ theme: wd.theme, seed: 3 + wd.index * 5, nodes: Math.max(2, wd.levels.length) }).then((isl) => {
      wd.island = isl;
      wd.padMat = new THREE.MeshStandardMaterial({ color: THEMES[wd.theme].stone, roughness: 0.6 });
      wd.group.add(isl.group);
      applyIbl(isl.group, env, 0.55);
      wd.levels.forEach((lv, k) => {
        const p = isl.nodePositions[k];
        const pad = new THREE.Mesh(padGeo, padMat.open);
        pad.position.set(p.x, p.y + NODE_Y, p.z); pad.castShadow = true; pad.receiveShadow = true;
        pad.scale.setScalar(lv.boss ? 1.35 : 1);
        pad.userData.level = lv.i;
        const txt = lv.boss ? '★' : String(k + 1);
        const maps = Object.fromEntries(Object.entries(BADGE).map(([key, c]) => [key, badge(txt, c)]));
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: maps.open, depthTest: true }));
        label.userData.maps = maps;
        label.position.set(p.x, p.y + 1.25, p.z); label.scale.setScalar(0.7);
        const stars = new THREE.Group();
        for (let s = 0; s < 3; s++) {
          const st = new THREE.Mesh(STAR_GEO, STAR_MAT); st.position.set((s - 1) * 0.34, 0.62 + (s === 1 ? 0.07 : 0), 0); st.scale.setScalar(0.13); stars.add(st);
        }
        stars.position.set(p.x, p.y, p.z);
        const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, p.y + NODE_Y + 0.1, p.z); ring.visible = false;
        wd.group.add(pad, label, stars, ring);
        wd.nodes.push({ lv, pad, label, stars, ring, pos: new THREE.Vector3(p.x, p.y + NODE_Y + 0.08, p.z), t: 0.04 + (k / Math.max(1, wd.levels.length - 1)) * 0.92 });
      });
      wd.group.add(pathLamps(isl, wd.theme));
      paintNodes();
      lights.light.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
      return isl;
    });
    return wd.building;
  }

  // hero (and companion) as single figures
  let heroFig = null, compFig = null;
  const heroLoad = Promise.all([loadModel(hero, 'lo'), companion ? loadModel(companion, 'lo') : null]).then(([hm, cm]) => {
    heroFig = figure(hm); heroFig.root.scale.setScalar(1.05); scene.add(heroFig.root);
    if (cm) { compFig = figure(cm); compFig.root.scale.setScalar(1.05); scene.add(compFig.root); }
    applyIbl(heroFig.root, env, 0.7); if (compFig) applyIbl(compFig.root, env, 0.7);
    placeHero(true);
  });

  // ── state ──
  let lastList = '';
  let world = 0, sel = 0, active = false, raf = 0, last = 0, hop = null, camX = 0, drag = null, followX = 0, followZ = 0;
  const camTarget = new THREE.Vector3();

  function worldOf(i) { return levels[i]?.world ?? 0; }
  function paintNodes() {
    for (const wd of W) for (const n of wd.nodes) {
      const i = n.lv.i, open = state.open(i), st = state.stars(i);
      n.pad.material = n.lv.boss ? padMat.boss : wd.padMat;
      n.stars.children.forEach((s, k) => { s.visible = open && st > 0; s.material = k < st ? STAR_MAT : STAR_DIM; });
      const look = !open ? 'locked' : i === sel ? 'here' : st > 0 ? 'done' : n.lv.boss ? 'boss' : 'open';
      n.label.material.map = n.label.userData.maps[look]; n.label.material.needsUpdate = true;
      n.ring.visible = i === sel;
    }
  }
  function syncDom() {
    const wd = W[world], T = THEMES[wd.theme];
    $('kicker').textContent = `World ${world + 1}`;
    $('world').textContent = T.name;
    let total = 0; levels.forEach((_, i) => { total += state.stars(i); });
    $('stars').textContent = `${total} / ${levels.length * 3}`;
    $('prev').disabled = world === 0; $('next').disabled = world === W.length - 1;
    const lock = $('lock');
    if (!state.worldOpen(world)) {
      lock.hidden = false;
      lock.innerHTML = `${icon('lock', { size: 20 })}<span>${state.need(world)}</span>`;
    } else lock.hidden = true;
    renderCard();
    const listHtml = levels.map((lv, i) => `<li><button type="button" data-ow-level="${i}" ${state.open(i) ? '' : 'disabled'}>World ${lv.world + 1}, ${lv.boss ? 'boss' : `level ${i + 1}`}: ${lv.name}, ${state.stars(i)} of 3 stars</button></li>`).join('');
    if (listHtml !== lastList) { $('list').innerHTML = listHtml; lastList = listHtml; }
  }
  function renderCard() {
    const card = $('card'), lv = levels[sel];
    if (!lv || worldOf(sel) !== world || !state.worldOpen(world)) { card.hidden = true; return; }
    const open = state.open(sel), st = state.stars(sel), best = state.best(sel);
    const n = W[world].levels.findIndex((l) => l.i === sel) + 1;
    card.hidden = false;
    card.innerHTML = `
      <div class="gm-ow__cardhead"><span class="gm-ow__kicker">${lv.boss ? 'Boss' : `Level ${world + 1}-${n}`}</span><strong>${lv.name}</strong></div>
      <div class="gm-ow__cardstars" aria-label="${st} of 3 stars">${[0, 1, 2].map((k) => `<span class="${k < st ? 'is-on' : ''}">${icon('star', { size: 18 })}</span>`).join('')}</div>
      ${best ? `<div class="gm-ow__best">Best <span class="fw-num">${best.toLocaleString('en')}</span></div>` : ''}
      <button type="button" class="fw-btn fw-btn--primary gm-ow__play" data-ow="play" ${open ? '' : 'disabled'}>${icon(open ? 'play' : 'lock', { size: 16 })}${open ? (st ? 'Play again' : 'Play') : 'Locked'}</button>`;
  }

  function nodeOf(i) { const wd = W[worldOf(i)]; return wd.nodes.find((n) => n.lv.i === i); }
  function placeHero(snap) {
    if (!heroFig) return;
    const n = nodeOf(sel);
    if (!n) return;
    const wd = W[worldOf(sel)];
    const p = n.pos.clone().applyMatrix4(wd.group.matrixWorld);
    if (snap) { heroFig.root.position.copy(p); heroFig.root.rotation.y = 0.4; }
    if (compFig) { compFig.root.position.set(p.x - 0.55, p.y, p.z + 0.25); compFig.root.rotation.y = 0.6; }
  }
  /** Walk along the island path from the current node to node i (same world), else teleport. */
  function moveTo(i) {
    if (i === sel) return;
    const from = nodeOf(sel), to = nodeOf(i);
    const same = from && to && worldOf(sel) === worldOf(i) && W[worldOf(i)].island;
    const prev = sel;
    sel = i;
    paintNodes(); renderCard();
    if (!same || !heroFig) { placeHero(true); return; }
    hop = { t0: performance.now(), a: from.t, b: to.t, wd: W[worldOf(i)], dur: Math.min(1600, 350 + Math.abs(to.t - from.t) * 2600), prev };
  }
  function setWorld(w, { keepSel = false } = {}) {
    world = Math.max(0, Math.min(W.length - 1, w));
    ensureIsland(W[world]).then(() => { if (!keepSel) { const cur = state.current(); const first = W[world].levels.find((l) => state.open(l.i) && (worldOf(cur) !== world ? true : l.i === cur)); if (first && worldOf(sel) !== world) moveTo(first.i); } placeHero(true); syncDom(); kick(); });
    // build the neighbours in the background so switching is instant
    for (const k of [world + 1, world - 1]) if (W[k]) setTimeout(() => ensureIsland(W[k]), 300);
    syncDom(); kick();
  }

  // ── sky per world ──
  const SKY = W.map((wd) => THEMES[wd.theme].sky);
  function tintSky(f) {
    const a = Math.floor(f), b = Math.min(W.length - 1, a + 1), k = f - a;
    skyMat.uniforms.uHorizon.value.set(SKY[a].horizon).lerp(new THREE.Color(SKY[b].horizon), k);
    skyMat.uniforms.uTop.value.set(SKY[a].top).lerp(new THREE.Color(SKY[b].top), k);
    skyMat.uniforms.uBelow.value.set(SKY[a].below ?? SKY[a].fog).lerp(new THREE.Color(SKY[b].below ?? SKY[b].fog), k);
    fogC.set(SKY[a].fog).lerp(new THREE.Color(SKY[b].fog), k);
    scene.fog.color.copy(fogC);
    for (const c of clouds) c.material.color.copy(fogC).lerp(new THREE.Color(0xffffff), 0.6);
  }

  // ── loop ──
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setPixelRatio(LOW_GPU ? 0.6 : Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function kick() { if (active && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const time = t / 1000;
    // camera glides to the current world; on narrow screens it backs off to fit the island
    const wd = W[world];
    camX += (wd.x - camX) * (1 - Math.exp(-dt * 3.2));
    const f = camX / SPACING;
    tintSky(Math.max(0, Math.min(W.length - 1, f)));
    // wide screens frame the whole island; tall ones come closer and follow the hero along the path
    const tall = camera.aspect < 1;
    const fit = Math.max(1, 1.25 / Math.min(1.25, camera.aspect));
    let focusX = 0;
    if (tall && heroFig && worldOf(sel) === world) focusX = Math.max(-5, Math.min(5, heroFig.root.position.x - wd.x));
    followX += (focusX - followX) * (1 - Math.exp(-dt * 2.5));
    if (tall) {
      // phones: steeper and closer, centred on the hero's stretch of path
      const hz = heroFig && worldOf(sel) === world ? heroFig.root.position.z : wd.z;
      followZ += (hz - followZ) * (1 - Math.exp(-dt * 2.5));
      camTarget.set(camX + followX, wd.y - 0.3, followZ + 0.6);
      camera.position.set(camTarget.x + 1.2, camTarget.y + 17, camTarget.z + 13);
    } else {
      camTarget.set(camX + 0.4, wd.y - 1.2, wd.z);
      camera.position.set(camX + 3.2 * fit, wd.y + 10.5 * fit, wd.z + 17 * fit);
    }
    camera.lookAt(camTarget);
    skyDome.position.copy(camera.position);
    lights.light.position.set(camX - 10, 16, 9); lights.light.target.position.set(camX, 0, 0); lights.light.target.updateMatrixWorld();
    for (const w2 of W) if (w2.island) w2.island.update(time);
    for (const c of clouds) { c.position.x += dt * 0.3; if (c.position.x > SPACING * 4 + 5) c.position.x = -15; }
    if (!LOW_GPU) for (let i = 0; i < birds.count; i++) {
      const a = time * (0.18 + (i % 3) * 0.03) + i * 0.52, r = 9 + (i % 4) * 1.6, flap = Math.sin(time * 9 + i * 1.7);
      bv.set(camX + Math.cos(a) * r, wd.y + 5.5 + Math.sin(a * 1.7 + i) * 0.8 + (i % 2) * 0.9, wd.z - 3 + Math.sin(a) * r * 0.55);
      bq.setFromEuler(be.set(0, -a, 0)); bm.compose(bv, bq, bs.set(0.5, 0.5 * (0.35 + 0.65 * Math.abs(flap)) * Math.sign(flap || 1), 0.5));
      birds.setMatrixAt(i, bm);
    }
    birds.instanceMatrix.needsUpdate = true;
    // node rings pulse; the selected node's badge bobs
    ringMat.opacity = 0.55 + Math.sin(time * 4) * 0.35;
    // hero: hop along the path, idle bob otherwise
    if (heroFig) {
      if (hop) {
        const k = Math.min(1, (performance.now() - hop.t0) / hop.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const tt = hop.a + (hop.b - hop.a) * e;
        const isl = hop.wd.island;
        const p = isl.curve.getPoint(tt); p.y = isl.heightAt(p.x, p.z) + NODE_Y + 0.08;
        const ahead = isl.curve.getPoint(Math.min(0.999, Math.max(0.001, tt + Math.sign(hop.b - hop.a) * 0.01)));
        p.applyMatrix4(hop.wd.group.matrixWorld); ahead.applyMatrix4(hop.wd.group.matrixWorld);
        heroFig.root.position.copy(p);
        heroFig.root.position.y += Math.abs(Math.sin(k * Math.PI * Math.max(2, Math.round(hop.dur / 220)))) * 0.25;
        heroFig.root.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
        heroFig.legs.forEach((l) => { l.pivot.rotation.x = Math.sin(time * 16) * 0.6 * l.side; });
        if (compFig) { compFig.root.position.lerp(new THREE.Vector3(p.x - 0.5, p.y, p.z + 0.3), 1 - Math.exp(-dt * 5)); compFig.root.rotation.y = heroFig.root.rotation.y; }
        renderer.shadowMap.needsUpdate = true;
        if (k >= 1) { hop = null; heroFig.legs.forEach((l) => { l.pivot.rotation.x = 0; }); heroFig.root.rotation.y = 0.4; placeHero(false); }
      } else {
        heroFig.body.position.y = Math.abs(Math.sin(time * 2.2)) * 0.04;
        if (compFig) compFig.body.position.y = Math.abs(Math.sin(time * 3.1 + 1)) * 0.03;
      }
    }
    if (renderer.shadowMap.needsUpdate === false && (t | 0) % 2 === 0) renderer.shadowMap.needsUpdate = !!hop;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  // ── input ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const pads = W[world].nodes.map((n) => n.pad);
    const hit = ray.intersectObjects(pads, false)[0];
    if (hit) return hit.object.userData.level;
    // generous tap targets: the nearest node badge on screen within 34 px
    let best = -1, bd = 34;
    for (const n of W[world].nodes) {
      const p = n.pos.clone().applyMatrix4(W[world].group.matrixWorld).project(camera);
      const d = Math.hypot((p.x * 0.5 + 0.5) * r.width - (e.clientX - r.left), (-p.y * 0.5 + 0.5) * r.height - (e.clientY - r.top));
      if (d < bd) { bd = d; best = n.lv.i; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  canvas.addEventListener('pointermove', (e) => { if (drag) drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x)); });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, moved = drag.moved;
    drag = null;
    if (moved > 40 && Math.abs(dx) > 40) { setWorld(world + (dx < 0 ? 1 : -1)); return; }
    if (moved < 8 && state.worldOpen(world)) {
      const i = pick(e);
      if (i >= 0 && state.open(i)) { if (i === sel && !hop) onPlay(i); else moveTo(i); }
      else if (i >= 0) { sel = i; paintNodes(); renderCard(); }
    }
  });
  canvas.style.touchAction = 'pan-y';
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ow], [data-ow-level]');
    if (!b) return;
    if (b.dataset.owLevel) { const i = Number(b.dataset.owLevel); setWorld(worldOf(i), { keepSel: true }); moveTo(i); return; }
    const act = b.dataset.ow;
    if (act === 'prev') setWorld(world - 1);
    else if (act === 'next') setWorld(world + 1);
    else if (act === 'play' && state.open(sel)) onPlay(sel);
  });
  function key(e) {
    if (!active) return false;
    const wl = W[world].levels.filter((l) => state.open(l.i));
    const k = wl.findIndex((l) => l.i === sel);
    if (e.key === 'ArrowRight' && k >= 0 && k < wl.length - 1) moveTo(wl[k + 1].i);
    else if (e.key === 'ArrowLeft' && k > 0) moveTo(wl[k - 1].i);
    else if (e.key === 'PageDown' || (e.key === 'ArrowRight' && e.shiftKey)) setWorld(world + 1);
    else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && e.shiftKey)) setWorld(world - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && state.open(sel) && !e.target.closest?.('button')) onPlay(sel);
    else return false;
    return true;
  }
  new ResizeObserver(() => { if (active) resize(); }).observe(canvas);

  return {
    activate() {
      if (active) return;
      active = true; resize();
      sel = state.current(); world = worldOf(sel); camX = W[world].x;
      setWorld(world, { keepSel: true });
      heroLoad.then(() => placeHero(true));
      kick();
    },
    deactivate() { active = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    refresh() { sel = state.current(); paintNodes(); syncDom(); if (worldOf(sel) !== world) setWorld(worldOf(sel), { keepSel: true }); else placeHero(true); },
    key,
    get selected() { return sel; },
    get world() { return world; },
  };
}

const BADGE = {
  open: { bg: '#1f2937', fg: '#fff' }, done: { bg: '#2f9e44', fg: '#fff' }, here: { bg: '#f08c00', fg: '#fff' },
  boss: { bg: '#c92a2a', fg: '#fff' }, locked: { bg: '#9aa1ad', fg: '#e9ecef' },
};
// a soft five-point star for the node star rows
const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.45 : 1; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, -Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
  g.center();
  return g;
})();
const STAR_MAT = new THREE.MeshStandardMaterial({ color: 0xffcf3a, roughness: 0.3, metalness: 0.2, emissive: 0x6b4a00, emissiveIntensity: 0.4 });
const STAR_DIM = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.6 });

/** Lamp posts with lit lanterns beside the island path, one merged mesh plus one self-lit mesh per island. */
function pathLamps(isl, theme) {
  const g = new THREE.Group(), base = new Batch(), glow = new Batch();
  const post = new THREE.CylinderGeometry(1, 1, 1, 6), box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 4);
  const metal = theme === 'ember' ? 0x2a2a34 : theme === 'dunes' ? 0x6a4a30 : 0x3a3f4a;
  const lamp = new THREE.Color(theme === 'ember' ? 0x6ff0d8 : 0xffc870).multiplyScalar(1.8);
  const n = 9;
  for (let k = 0; k < n; k++) {
    const t = 0.08 + (k / (n - 1)) * 0.84, p = isl.curve.getPoint(t), tan = isl.curve.getTangent(t);
    const side = k % 2 ? 1 : -1, x = p.x - tan.z * 0.62 * side, z = p.z + tan.x * 0.62 * side, y = isl.heightAt(x, z);
    base.add(post, mtx([x, y + 0.32, z], [0, 0, 0], [0.025, 0.64, 0.025]), metal);
    base.add(box, mtx([x, y + 0.66, z], [0, 0, 0], [0.11, 0.025, 0.11]), metal);
    base.add(cone, mtx([x, y + 0.76, z], [0, Math.PI / 4, 0], [0.1, 0.07, 0.1]), metal);
    glow.add(box, mtx([x, y + 0.705, z], [0, 0, 0], [0.07, 0.07, 0.07]), lamp);
  }
  const m = base.mesh({ roughness: 0.6 }); m.castShadow = false; m.receiveShadow = false;
  g.add(m, glow.mesh({ glow: true }));
  return g;
}
