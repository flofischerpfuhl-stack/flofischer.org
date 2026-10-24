/**
 * Momo's arena per world: a painted ground overlay (one canvas texture over the whole arena: worn paths, a plaza with
 * the Fernhaven leaf, stepping stones, flowers, sand ripples, ice, lava cracks), a broken ring of low stone walls with
 * pillars, torches and banners at the edge, and low clutter scattered over the floor (grass tufts, flowers, pebbles,
 * dry tufts, snow lumps, crystals). Static and merged into a few chunked meshes; the ground overlay costs one texture
 * lookup per ground pixel.
 *
 * buildArena({ world, R, dark, low }) → { group, overlay, glow, ext: [x0, z0, 1 / size], torches, dispose() }
 */
import { THREE } from '../three-kit.js';
import { Batch, mtx, rock, tuft, flower, blob, rng, createNoise } from './decor.js';
import { WORLD } from './tower-scenery.js';

const SIZE = 1024;

export function buildArena({ world = 0, R = 22, dark = false, low = false }) {
  const W = WORLD[world] || WORLD[0], rand = rng(23 + world * 7 + R), noise = createNoise(3 + world);
  const E = R + 18, scale = SIZE / (2 * E);
  const px = (x) => (x + E) * scale;
  // ── the ground overlay: rgb = colour, alpha = how much of it replaces the ground texture ──
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const gc = world === 3 ? document.createElement('canvas') : null;
  const gg = gc ? (gc.width = gc.height = 512, gc.getContext('2d')) : null;
  const blobAt = (x, z, r, col, a) => { const gr = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), r * scale); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(px(x) - r * scale, px(z) - r * scale, 2 * r * scale, 2 * r * scale); };
  const P = [ // per world: mottle dark, mottle light, path, stone, plaza, accent
    { dark: '40,90,30', light: '170,200,90', path: '168,132,92', stone: '196,190,176', plaza: '206,198,182', accent: ['255,255,255', '255,236,140', '244,170,200', '190,170,240'] },
    { dark: '190,120,60', light: '255,226,170', path: '200,150,96', stone: '226,196,150', plaza: '232,206,160', accent: ['150,110,80', '120,90,70'] },
    { dark: '170,196,228', light: '255,255,255', path: '196,220,240', stone: '170,190,214', plaza: '200,216,236', accent: ['220,240,255'] },
    { dark: '30,22,24', light: '96,80,78', path: '70,56,54', stone: '58,50,52', plaza: '44,38,42', accent: ['120,110,110'] },
  ][world];
  for (let k = 0; k < 260; k++) { const x = (rand() * 2 - 1) * E, z = (rand() * 2 - 1) * E; blobAt(x, z, 1.5 + rand() * 4, rand() < 0.55 ? P.dark : P.light, 0.12 + rand() * 0.14); }
  // worn ring path and spokes
  g.lineCap = 'round';
  const pathStroke = (draw, w, a) => { g.strokeStyle = `rgba(${P.path},${a})`; g.lineWidth = w * scale; g.beginPath(); draw(); g.stroke(); };
  const ringR = R * 0.48;
  for (const [w, a] of [[2.6, 0.25], [1.7, 0.5], [1.1, 0.6]]) {
    pathStroke(() => { for (let t = 0; t <= 1.001; t += 0.01) { const an = t * Math.PI * 2, r = ringR + noise.n2(Math.cos(an) * 2, Math.sin(an) * 2) * 0.8; const fn = t ? 'lineTo' : 'moveTo'; g[fn](px(Math.cos(an) * r), px(Math.sin(an) * r)); } }, w, a);
    for (let s = 0; s < 4; s++) { const an = s * Math.PI / 2 + 0.4; pathStroke(() => { g.moveTo(px(Math.cos(an) * 3.6), px(Math.sin(an) * 3.6)); for (let r = 3.6; r <= R + 4; r += 1) { const wob = noise.n2(r * 0.2, s) * 0.8; g.lineTo(px(Math.cos(an) * r - Math.sin(an) * wob), px(Math.sin(an) * r + Math.cos(an) * wob)); } }, w, a); }
  }
  // stepping stones along the ring and the spokes
  const stone = (x, z, r, a = 1) => {
    g.fillStyle = `rgba(0,0,0,${0.25 * a})`; g.beginPath(); g.ellipse(px(x) + 0.08 * scale, px(z) + 0.1 * scale, r * scale, r * 0.78 * scale, rand() * 3, 0, 7); g.fill();
    g.fillStyle = `rgba(${P.stone},${a})`; g.beginPath(); g.ellipse(px(x), px(z), r * scale, r * 0.78 * scale, rand() * 3, 0, 7); g.fill();
  };
  for (let t = 0; t < 1; t += 0.018) { const an = t * Math.PI * 2; stone(Math.cos(an) * ringR + (rand() - 0.5) * 0.5, Math.sin(an) * ringR + (rand() - 0.5) * 0.5, 0.3 + rand() * 0.18); }
  // the plaza: a disc of fitted stones with the Fernhaven leaf in the middle
  g.fillStyle = `rgba(${P.plaza},0.95)`; g.beginPath(); g.arc(px(0), px(0), 3.8 * scale, 0, 7); g.fill();
  g.strokeStyle = `rgba(0,0,0,0.22)`; g.lineWidth = 0.06 * scale;
  for (let r = 1.3; r < 3.8; r += 0.8) { g.beginPath(); g.arc(px(0), px(0), r * scale, 0, 7); g.stroke(); const n = Math.round(r * 5); for (let k = 0; k < n; k++) { const an = (k + (r * 3) % 1) / n * Math.PI * 2; g.beginPath(); g.moveTo(px(Math.cos(an) * r), px(Math.sin(an) * r)); g.lineTo(px(Math.cos(an) * (r + 0.8)), px(Math.sin(an) * (r + 0.8))); g.stroke(); } }
  g.strokeStyle = `rgba(${P.stone},1)`; g.lineWidth = 0.22 * scale; g.beginPath(); g.arc(px(0), px(0), 3.85 * scale, 0, 7); g.stroke();
  const leaf = world === 3 ? '120,230,210' : world === 2 ? '120,160,220' : '90,150,70';
  g.save(); g.translate(px(0), px(0)); g.rotate(-0.5); g.scale(scale, scale);
  g.fillStyle = `rgba(${leaf},0.9)`; g.beginPath(); g.moveTo(0, -1.1); g.bezierCurveTo(0.8, -0.6, 0.8, 0.5, 0, 1.1); g.bezierCurveTo(-0.8, 0.5, -0.8, -0.6, 0, -1.1); g.fill();
  g.strokeStyle = `rgba(255,255,255,0.7)`; g.lineWidth = 0.06; g.beginPath(); g.moveTo(0, -0.9); g.lineTo(0, 1.3); for (let k = -2; k <= 2; k++) { g.moveTo(0, k * 0.3); g.lineTo(0.45, k * 0.3 - 0.3); g.moveTo(0, k * 0.3); g.lineTo(-0.45, k * 0.3 - 0.3); } g.stroke();
  g.restore();
  if (gg) { // a faint rune ring round the plaza on the Ember Isles
    const gs = 512 / (2 * E), gp = (x) => (x + E) * gs;
    gg.fillStyle = '#000'; gg.fillRect(0, 0, 512, 512);
    gg.strokeStyle = 'rgba(80,255,220,0.5)'; gg.lineWidth = 0.08 * gs; gg.beginPath(); gg.arc(gp(0), gp(0), 4.2 * gs, 0, 7); gg.stroke();
  }
  // world details
  if (world === 0) for (let k = 0; k < 900; k++) { const x = (rand() * 2 - 1) * E, z = (rand() * 2 - 1) * E; g.fillStyle = `rgba(${P.accent[(rand() * 4) | 0]},0.9)`; g.beginPath(); g.arc(px(x), px(z), (0.05 + rand() * 0.05) * scale, 0, 7); g.fill(); }
  if (world === 1) { g.strokeStyle = `rgba(${P.dark},0.16)`; g.lineWidth = 0.08 * scale; for (let k = 0; k < 70; k++) { const z0 = (rand() * 2 - 1) * E, x0 = (rand() * 2 - 1) * E, len = 2 + rand() * 5; g.beginPath(); for (let t = 0; t <= 1; t += 0.1) g[t ? 'lineTo' : 'moveTo'](px(x0 + t * len), px(z0 + Math.sin(t * 6 + k) * 0.3)); g.stroke(); } }
  if (world === 2) for (let k = 0; k < 9; k++) blobAt((rand() * 2 - 1) * R, (rand() * 2 - 1) * R, 2 + rand() * 3, '170,214,250', 0.45);
  if (world === 3) { // lava cracks: dark seams on the ground, glowing in the emissive mask
    const gs = 512 / (2 * E), gp = (x) => (x + E) * gs;
    for (let k = 0; k < 46; k++) {
      let x = (rand() * 2 - 1) * (R + 6), z = (rand() * 2 - 1) * (R + 6);
      if (Math.hypot(x, z) < 4.5) continue;
      g.strokeStyle = 'rgba(20,8,6,0.9)'; g.lineWidth = 0.16 * scale; g.beginPath(); g.moveTo(px(x), px(z));
      gg.strokeStyle = 'rgba(255,255,255,0.9)'; gg.lineWidth = 0.07 * gs; gg.beginPath(); gg.moveTo(gp(x), gp(z));
      for (let s = 0; s < 6; s++) { x += (rand() - 0.5) * 2.2; z += (rand() - 0.5) * 2.2; g.lineTo(px(x), px(z)); gg.lineTo(gp(x), gp(z)); }
      g.stroke(); gg.stroke();
    }
  }
  // the edge: a worn band where the wall stands
  g.strokeStyle = `rgba(${P.path},0.45)`; g.lineWidth = 1.6 * scale; g.beginPath(); g.arc(px(0), px(0), (R + 0.9) * scale, 0, 7); g.stroke();
  const overlay = new THREE.CanvasTexture(c); overlay.colorSpace = THREE.SRGBColorSpace; // (magnified: no anisotropic filtering needed)
  const glow = gc ? new THREE.CanvasTexture(gc) : null;

  // ── 3D: the broken wall ring, pillars with torches and banners, clutter on the floor ──
  const group = new THREE.Group();
  const CH = 8, chunks = new Map();
  const chunk = (x, z) => { const k = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; if (!chunks.has(k)) chunks.set(k, { base: new Batch(), glow: new Batch() }); return chunks.get(k); };
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10), ball = blob(1);
  const rocks = [0, 1, 2].map((k) => rock(80 + k * 3 + world, { moss: W.moss, tone: W.rock, flat: 0.5 }));
  const wallC = new THREE.Color(W.trim).lerp(new THREE.Color().setRGB(...W.rock), 0.45).multiplyScalar(dark ? 0.7 : 1);
  const torches = [];
  const n = Math.round((2 * Math.PI * (R + 0.9)) / 1.25);
  for (let k = 0; k < n; k++) {
    const an = (k / n) * Math.PI * 2, x = Math.cos(an) * (R + 0.9), z = Math.sin(an) * (R + 0.9), ch = chunk(x, z);
    const pillar = k % 9 === 0, broken = !pillar && noise.n2(Math.cos(an) * 3, Math.sin(an) * 3) < -0.25;
    if (pillar) {
      ch.base.add(cyl, mtx([x, 0.8, z], [0, an, 0], [0.38, 1.6, 0.38]), wallC);
      ch.base.add(cyl, mtx([x, 1.66, z], [0, an, 0], [0.48, 0.14, 0.48]), wallC.clone().multiplyScalar(0.85));
      ch.base.add(cyl, mtx([x, 0.08, z], [0, an, 0], [0.5, 0.16, 0.5]), wallC.clone().multiplyScalar(0.8));
      // a torch bowl on top and a banner facing the arena
      ch.base.add(cyl, mtx([x, 1.82, z], [0, 0, 0], [0.26, 0.18, 0.26]), W.metal);
      ch.glow.add(ball, mtx([x, 2.02, z], [0, 0, 0], [0.18, 0.3, 0.18]), new THREE.Color(W.torch).multiplyScalar(2));
      torches.push({ x, y: 2.05, z });
      const bx = x - Math.cos(an) * 0.4, bz = z - Math.sin(an) * 0.4;
      ch.base.add(box, mtx([bx, 1.1, bz], [0, -an + Math.PI / 2, 0], [0.5, 0.9, 0.03]), new THREE.Color(W.banner[0]).multiplyScalar(dark ? 0.7 : 1));
      ch.base.add(box, mtx([bx - Math.cos(an) * 0.02, 1.2, bz - Math.sin(an) * 0.02], [0, -an + Math.PI / 2, 0], [0.18, 0.18, 0.03]), W.banner[1]);
    } else if (!broken) {
      const h = 0.32 + rand() * 0.22;
      ch.base.add(box, mtx([x, h / 2, z], [0, -an + Math.PI / 2 + (rand() - 0.5) * 0.08, 0], [1.18, h, 0.42]), wallC.clone().multiplyScalar(0.85 + rand() * 0.2));
      if (W.snow) ch.base.add(box, mtx([x, h + 0.03, z], [0, -an + Math.PI / 2, 0], [1.2, 0.06, 0.46]), 0xffffff);
      if (W.moss && rand() < 0.4) ch.base.add(ball, mtx([x, h, z], [0, an, 0], [0.4, 0.08, 0.22]), 0x5a8a3a);
    } else if (rand() < 0.6) {
      ch.base.add(rocks[k % 3], mtx([x, 0.1, z], [0, rand() * 6, 0], [0.4, 0.3, 0.35]));
    }
  }
  // floor clutter, kept low (aliens and sparks stay readable over it)
  const tufts = [0, 1].map((k) => tuft(rng(70 + k), 6, ...W.tuft));
  const flowers = W.flowers.map((col) => flower(col, col === 0xffd23f ? 0xff8a3d : 0xffd23f));
  const crystal = new THREE.OctahedronGeometry(1, 0);
  for (let k = 0; k < (low ? 100 : 340); k++) {
    const an = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (R + 6);
    if (d < 4.3) continue;
    const x = Math.cos(an) * d, z = Math.sin(an) * d, ch = chunk(x, z), r = rand();
    if (world === 0) {
      if (r < 0.55) ch.base.add(tufts[k & 1], mtx([x, 0, z], [0, rand() * 6, 0], [0.45, 0.22 + rand() * 0.14, 0.45]));
      else if (r < 0.85) for (let f = 0; f < 3; f++) ch.base.add(flowers[(rand() * flowers.length) | 0], mtx([x + (rand() - 0.5) * 0.5, 0, z + (rand() - 0.5) * 0.5], [0, rand() * 6, 0], 0.2 + rand() * 0.08));
      else ch.base.add(rocks[k % 3], mtx([x, 0.03, z], [0, rand() * 6, 0], 0.12 + rand() * 0.12));
    } else if (world === 1) {
      if (r < 0.5) ch.base.add(tufts[k & 1], mtx([x, 0, z], [0, rand() * 6, 0], [0.4, 0.2 + rand() * 0.12, 0.4]));
      else ch.base.add(rocks[k % 3], mtx([x, 0.03, z], [0, rand() * 6, 0], 0.1 + rand() * 0.16));
    } else if (world === 2) {
      if (r < 0.3) ch.base.add(ball, mtx([x, 0, z], [0, rand() * 6, 0], [0.16 + rand() * 0.18, 0.07 + rand() * 0.04, 0.14 + rand() * 0.14]), 0xf4f8ff);
      else if (r < 0.7) ch.glow.add(crystal, mtx([x, 0.12, z], [rand(), rand() * 6, 0.3], [0.07, 0.22 + rand() * 0.15, 0.07]), new THREE.Color(0xbfe8ff).multiplyScalar(dark ? 0.6 : 0.95));
      else ch.base.add(rocks[k % 3], mtx([x, 0.03, z], [0, rand() * 6, 0], 0.1 + rand() * 0.14), 0xdde8f4);
    } else {
      if (r < 0.35) ch.base.add(tufts[k & 1], mtx([x, 0, z], [0, rand() * 6, 0], [0.4, 0.18 + rand() * 0.1, 0.4]), 0x8a6a6a);
      else if (r < 0.6) ch.glow.add(crystal, mtx([x, 0.12, z], [rand(), rand() * 6, 0.3], [0.07, 0.2 + rand() * 0.18, 0.07]), new THREE.Color(rand() < 0.5 ? 0x9a4af0 : 0x2ad8c0).multiplyScalar(1.3));
      else ch.base.add(rocks[k % 3], mtx([x, 0.03, z], [0, rand() * 6, 0], 0.12 + rand() * 0.16), 0x9a8a88);
    }
  }
  const matte = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const { base, glow: gl } of chunks.values()) {
    if (!base.empty) { const m = new THREE.Mesh(base.geometry(), matte); m.receiveShadow = false; group.add(m); }
    if (!gl.empty) group.add(new THREE.Mesh(gl.geometry(), lit));
  }
  return {
    group, overlay, glow, torches, ext: [-E, -E, 1 / (2 * E)],
    dispose() { group.traverse((o) => o.geometry?.dispose()); matte.dispose(); lit.dispose(); overlay.dispose(); glow?.dispose(); },
  };
}

/**
 * Patch a ground material (after applyIbl) to blend in the arena overlay by world position, plus an emissive mask.
 * Returns the uniforms to update when the arena changes.
 */
export function overlayGround(material) {
  const uniforms = { uOver: { value: null }, uOverExt: { value: new THREE.Vector3() }, uGlowMap: { value: null }, uGlowC: { value: new THREE.Color(0, 0, 0) } };
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey?.() || '';
  material.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform vec3 uOverExt;\nvarying vec2 vOverUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vOverUv = ((modelMatrix * vec4(transformed, 1.0)).xz - uOverExt.xy) * uOverExt.z;`);
    sh.fragmentShader = 'uniform sampler2D uOver; uniform sampler2D uGlowMap; uniform vec3 uGlowC;\nvarying vec2 vOverUv;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec4 ovr = texture2D(uOver, vOverUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, ovr.rgb, ovr.a);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uGlowC * texture2D(uGlowMap, vOverUv).r;`);
  };
  material.customProgramCacheKey = () => prevKey + '+overlay';
  material.needsUpdate = true;
  return uniforms;
}
