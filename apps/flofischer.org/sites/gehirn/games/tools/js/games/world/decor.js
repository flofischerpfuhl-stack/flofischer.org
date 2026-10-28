/**
 * Scenery kit for the game scenes: procedural detail (grass tufts, flowers, ferns, rocks, ivy, clouds, stones) merged
 * into a few vertex-coloured meshes, and the Baker that renders a static scene once into a colour + depth texture so
 * the game draws all of that detail per frame as one full-screen quad (the cost no longer grows with the detail).
 * Everything here runs while a level is built, never per frame.
 */
import { THREE, furPatch } from '../three-kit.js';
import { rng, createNoise, smoothstep, lerp } from './noise.js';

export { rng, createNoise, smoothstep, lerp };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** Matrix from position, Euler rotation and scale (number or [x, y, z]). */
export function mtx(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  return new THREE.Matrix4().compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(s[0], s[1], s[2]));
}

/**
 * Merges many small geometries (each with a transform and a colour, or its own vertex colours times a tint) into one
 * indexed geometry with position, normal and colour: a whole layer of detail is one draw call.
 */
export class Batch {
  constructor() { this.P = []; this.N = []; this.C = []; this.I = []; this.n = 0; }
  /**
   * geo: BufferGeometry (not modified); m: Matrix4; color: hex/Color (multiplies vertex colours when the geometry
   * has them); shade(i, x, y, z, nx, ny, nz, c) may change the colour per vertex (world space).
   */
  add(geo, m, color = 0xffffff, shade = null) {
    const P = geo.attributes.position, N = geo.attributes.normal, CA = geo.attributes.color;
    const nm = new THREE.Matrix3().getNormalMatrix(m), base = this.n;
    const tint = color instanceof THREE.Color ? color : new THREE.Color(color), c = new THREE.Color(), v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      if (N) nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else nv.set(0, 1, 0);
      if (CA) c.setRGB(CA.getX(i) * tint.r, CA.getY(i) * tint.g, CA.getZ(i) * tint.b); else c.copy(tint);
      if (shade) shade(i, v.x, v.y, v.z, nv.x, nv.y, nv.z, c);
      this.P.push(v.x, v.y, v.z); this.N.push(nv.x, nv.y, nv.z); this.C.push(c.r, c.g, c.b);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.I.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.I.push(base + i);
    this.n += P.count;
    return this;
  }
  get empty() { return this.n === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    return g;
  }
  /** One mesh: matte by default; `glow` makes it self-lit (windows, flames, lava). */
  mesh({ roughness = 0.85, metalness = 0, glow = false, side = THREE.FrontSide, flat = false, shadow = false, fog = true } = {}) {
    const mat = glow
      ? new THREE.MeshBasicMaterial({ vertexColors: true, side, fog })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, side, flatShading: flat, fog });
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = shadow; m.receiveShadow = !glow;
    return m;
  }
}

/** Colour every vertex: fn(color, x, y, z, nx, ny, nz) in the geometry's own space. */
export function paint(geo, fn) {
  const P = geo.attributes.position, N = geo.attributes.normal, a = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    c.setRGB(1, 1, 1);
    fn(c, P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** A smooth icosphere (merged vertices, so noise displacement keeps it closed). */
export function blob(detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVerts(g);
  m.computeVertexNormals();
  return m;
}
function mergeVerts(g) {
  const P = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const key = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(P.getX(i), P.getY(i), P.getZ(i)); }
    idx.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

/** A lumpy boulder (unit radius), grey-brown with moss on top. */
export function rock(seed, { flat = 0.65, moss = 0.7, tone = [0.62, 0.58, 0.54], mossC = [0.3, 0.46, 0.16], detail = 1 } = {}) {
  const g = blob(detail), P = g.attributes.position, nz = createNoise(seed);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 1 + nz.fbm3(x * 1.3, y * 1.3, z * 1.3, 3) * 0.5;
    P.setXYZ(i, x * n, y * n * flat * (y < 0 ? 0.5 : 1), z * n * 0.85);
  }
  g.computeVertexNormals();
  return paint(g, (c, x, y, z, nx, ny) => {
    const grain = nz.n3(x * 6, y * 6, z * 6) * 0.08, m = smoothstep(0.35, 0.85, ny + nz.n3(x * 4, y * 4, z * 4) * 0.35) * moss;
    const ao = lerp(0.55, 1, smoothstep(-0.4, 0.3, y));
    c.setRGB(lerp(tone[0] + grain, mossC[0], m) * ao, lerp(tone[1] + grain, mossC[1], m) * ao, lerp(tone[2] + grain, mossC[2], m) * ao);
  });
}

/** A tuft of grass blades (about 1 unit tall), dark at the root, `tip` colour at the top. */
export function tuft(random, blades = 7, root = [0.12, 0.24, 0.08], tip = [0.42, 0.66, 0.24]) {
  const P = [], C = [], I = [];
  for (let b = 0; b < blades; b++) {
    const a = random() * Math.PI * 2, off = Math.sqrt(random()) * 0.12, ox = Math.cos(a) * off, oz = Math.sin(a) * off;
    const face = random() * Math.PI * 2, dx = Math.cos(face), dz = Math.sin(face);
    const lean = 0.15 + random() * 0.45, h = 0.6 + random() * 0.55, w = 0.035 + random() * 0.02, base = P.length / 3, hue = random() * 0.1;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, cx = ox + dx * lean * t * t * h, cz = oz + dz * lean * t * t * h, cy = h * t * (1 - 0.18 * lean * t), ww = w * (1 - t * 0.9);
      const r = lerp(root[0], tip[0] + hue, t), g = lerp(root[1], tip[1], t), bb = lerp(root[2], tip[2], t);
      if (s < 3) { P.push(cx + dz * ww, cy, cz - dx * ww, cx - dz * ww, cy, cz + dx * ww); C.push(r, g, bb, r, g, bb); }
      else { P.push(cx, cy, cz); C.push(r, g, bb); }
    }
    for (let s = 0; s < 2; s++) { const q = base + s * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const q = base + 4; I.push(q, q + 1, q + 2);
  }
  return upGeo(P, C, I);
}
/** Geometry whose normals all point up (thin foliage lit like the ground under it, no black back faces). */
function upGeo(P, C, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  return g;
}

/** A flower (about 1 unit tall): stem, two leaves, a ring of petals in `petal` colour round a centre. */
export function flower(petal = 0xffffff, center = 0xffd23f, petals = 5) {
  const P = [], C = [], I = [];
  const pc = new THREE.Color(petal), cc = new THREE.Color(center), stem = [0.2, 0.42, 0.14];
  const push = (x, y, z, c) => { P.push(x, y, z); C.push(c[0], c[1], c[2]); return P.length / 3 - 1; };
  const r = 0.025;
  const a0 = push(-r, 0, 0, stem), a1 = push(r, 0, 0, stem), a2 = push(r * 0.6, 0.95, 0, stem), a3 = push(-r * 0.6, 0.95, 0, stem);
  I.push(a0, a1, a2, a0, a2, a3);
  for (const [y, d] of [[0.3, 1], [0.5, -1]]) { const a = push(0, y, 0, stem), b = push(d * 0.2, y + 0.12, 0.05, [0.3, 0.55, 0.2]), c = push(d * 0.1, y + 0.2, -0.04, [0.32, 0.58, 0.22]); I.push(a, b, c); }
  const ctr = push(0, 1.04, 0.02, [cc.r, cc.g, cc.b]);
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    const b = push(dx * 0.05 - dy * 0.06, 1 + dy * 0.05 + dx * 0.06, 0, [pc.r, pc.g, pc.b]);
    const t = push(dx * 0.2, 1 + dy * 0.2, -0.02, [pc.r * 0.92, pc.g * 0.92, pc.b * 0.92]);
    const e = push(dx * 0.05 + dy * 0.06, 1 + dy * 0.05 - dx * 0.06, 0, [pc.r, pc.g, pc.b]);
    I.push(ctr, b, t, ctr, t, e);
  }
  return upGeo(P, C, I);
}

/** A fern (about 1 unit tall): curved fronds with paired leaflets, darker inside. */
export function fern(random, fronds = 7, color = [0.24, 0.52, 0.2]) {
  const P = [], C = [], I = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + random() * 0.5, dx = Math.cos(a), dz = Math.sin(a);
    const len = 0.8 + random() * 0.4, rise = 0.55 + random() * 0.35, n = 9;
    const pt = (t) => [dx * len * t, rise * Math.sin(t * Math.PI * 0.75) * (1 - t * 0.2), dz * len * t];
    for (let s = 1; s < n; s++) {
      const t = s / n, [x, y, z] = pt(t), w = 0.16 * Math.sin(t * Math.PI) * (1 - t * 0.3), k = 0.6 + t * 0.5;
      const c = [color[0] * k, color[1] * k, color[2] * k];
      for (const side of [-1, 1]) {
        const b = P.length / 3, [x2, y2, z2] = pt(t + 0.06);
        P.push(x, y, z, x2, y2, z2, x - dz * w * side + dx * 0.04, y - 0.03, z + dx * w * side + dz * 0.04);
        C.push(...c, ...c, ...c);
        I.push(b, b + 1, b + 2);
      }
    }
  }
  return upGeo(P, C, I);
}

/** A hanging vine: a chain of leaves along a wavy line from (0,0,0) down `len` units; leaves face +z. */
export function vine(random, len = 1, leaves = 10, color = [0.22, 0.46, 0.16]) {
  const P = [], C = [], I = [];
  let x = 0;
  for (let k = 0; k < leaves; k++) {
    const t = k / leaves, y = -t * len; x += (random() - 0.5) * 0.08;
    const s = 0.07 + random() * 0.05, a = random() * Math.PI * 2, ca = Math.cos(a) * s, sa = Math.sin(a) * s, sh = 0.75 + random() * 0.45;
    const b = P.length / 3;
    P.push(x, y, 0.01, x + ca * 1.6 - sa * 0.6, y + sa * 1.6 + ca * 0.6, 0.02, x + ca * 2.6, y + sa * 2.6, 0.03, x + ca * 1.6 + sa * 0.6, y + sa * 1.6 - ca * 0.6, 0.02);
    const c = [color[0] * sh, color[1] * sh, color[2] * sh];
    C.push(...c, ...c, c[0] * 1.15, c[1] * 1.15, c[2] * 1.1, ...c);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  return g;
}

/** A soft cloud: overlapping blobs, white on top, `under` colour below. Unit size about 2 × 0.8. */
export function cloud(random, puffs = 7, under = [0.72, 0.78, 0.9]) {
  const b = new Batch(), ball = blob(1);
  for (let k = 0; k < puffs; k++) {
    const t = puffs > 1 ? k / (puffs - 1) : 0.5, r = 0.35 + Math.sin(t * Math.PI) * 0.35 + random() * 0.15;
    b.add(ball, mtx([(t - 0.5) * 2 + (random() - 0.5) * 0.2, r * 0.45 + random() * 0.1, (random() - 0.5) * 0.3], [0, 0, 0], [r, r * 0.8, r * 0.7]), 0xffffff);
  }
  const g = b.geometry(), P = g.attributes.position, Cc = g.attributes.color;
  for (let i = 0; i < P.count; i++) { const k = smoothstep(0.0, 0.7, P.getY(i)); Cc.setXYZ(i, lerp(under[0], 1, k), lerp(under[1], 1, k), lerp(under[2], 1, k)); }
  return g;
}

/** Soft radial glow texture (white centre, transparent rim) for light pools, halos and flames. */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** An additive glow quad (light pool, halo) of radius r, colour and strength. */
export function glowQuad(r, color, strength = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({
    map: glowTexture(), color: new THREE.Color(color).multiplyScalar(strength), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  m.renderOrder = 5;
  return m;
}

/** Instanced copies of a baked model (models.js) with per-instance matrices; matte/gloss/glow as in the cast. */
export function modelInstances(model, matrices, { shadow = false, tints = null, fog = true } = {}) {
  const g = new THREE.Group();
  if (!matrices.length) return g;
  for (const part of model) {
    const mat = part.mat === 'glow'
      ? new THREE.MeshBasicMaterial({ vertexColors: true, fog })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: part.mat === 'gloss' ? 0.25 : 0.7, metalness: 0.02, fog });
    if (part.geometry.attributes.aFur && part.mat !== 'glow') furPatch(mat);
    const im = new THREE.InstancedMesh(part.geometry, mat, matrices.length);
    matrices.forEach((m, i) => { im.setMatrixAt(i, m); if (tints) im.setColorAt(i, tints[i]); });
    im.castShadow = shadow && part.mat !== 'glow'; im.receiveShadow = part.mat !== 'glow';
    g.add(im);
  }
  return g;
}

// ─────────────────────────────── the baker ───────────────────────────────
const BAKE_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
// Each frame: the resolved bake (display-ready colour, 1:1 with the screen) and its depth.
const BAKE_FS = `
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 shift;
void main(){
  vec2 uv = clamp(vUv - shift * .5, vec2(.0005), vec2(.9995));
  gl_FragColor = vec4(texture2D(tColor, uv).rgb, 1.);
  gl_FragDepth = texture2D(tDepth, uv).x;
}`;
// Once per bake: average the supersampled HDR image down to screen size, tone-map and encode it (as the screen would),
// and keep the nearest depth of each 2 × 2 block.
const RESOLVE_FS = `
#include <tonemapping_pars_fragment>
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float tone;
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  c = tone > .5 ? ACESFilmicToneMapping(c) : c * toneMappingExposure; // (ACES applies the exposure itself)
  gl_FragColor = sRGBTransferOETF(vec4(c, 1.));
  float d = texture2D(tDepth, vUv + texel * vec2(-.25, -.25)).x;
  d = min(d, texture2D(tDepth, vUv + texel * vec2(.25, -.25)).x);
  d = min(d, texture2D(tDepth, vUv + texel * vec2(-.25, .25)).x);
  d = min(d, texture2D(tDepth, vUv + texel * vec2(.25, .25)).x);
  gl_FragDepth = d;
}`;

/**
 * Renders a static scene once (on level change or resize) and puts it back each frame with one full-screen quad that
 * also writes the depth, so the live objects (pins, liquids, figures) sort against the baked tower and scenery as if
 * it were real geometry. The bake is supersampled (anti-aliasing all that detail), then resolved once to a
 * screen-sized, tone-mapped 8-bit image plus depth: per frame that is two cache-friendly texture reads per pixel.
 * Camera shake: shift(), a screen-space offset applied to both the quad and the live camera, so they stay together.
 */
export class Baker {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VS, fragmentShader: BAKE_FS, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false, // (depth writes need the test on)
      uniforms: { tColor: { value: null }, tDepth: { value: null }, shift: { value: new THREE.Vector2() } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false; this.quad.renderOrder = -1000;
    this.quad.visible = false;
    this.resolveMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VS, fragmentShader: RESOLVE_FS, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false, // (depth writes need the test on)
      uniforms: { tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() }, tone: { value: 1 } },
    });
    this.resolveScene = new THREE.Scene();
    const rq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.resolveMat); rq.frustumCulled = false;
    this.resolveScene.add(rq);
    this.resolveCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.final = null;
  }
  bake(renderer, scene, camera, ss = 2) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const max = Math.min(renderer.capabilities.maxTextureSize, 4096);
    const k = Math.max(1, Math.min(ss, max / size.x, max / size.y));
    const w = Math.round(size.x * k), h = Math.round(size.y * k);
    const big = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    big.depthTexture.minFilter = big.depthTexture.magFilter = THREE.NearestFilter;
    if (!this.final || this.final.width !== size.x || this.final.height !== size.y) {
      this.final?.dispose(); this.final?.depthTexture?.dispose();
      this.final = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType), minFilter: THREE.NearestFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      this.final.depthTexture.minFilter = this.final.depthTexture.magFilter = THREE.NearestFilter;
    }
    const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(big);
    renderer.setClearColor(0x000000, 1); renderer.clear(true, true, true);
    renderer.render(scene, camera);
    const u = this.resolveMat.uniforms;
    u.tColor.value = big.texture; u.tDepth.value = big.depthTexture; u.texel.value.set(1 / size.x, 1 / size.y);
    u.tone.value = renderer.toneMapping === THREE.ACESFilmicToneMapping ? 1 : 0;
    renderer.setRenderTarget(this.final); renderer.clear(true, true, true);
    renderer.render(this.resolveScene, this.resolveCam);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(clear, alpha);
    renderer.shadowMap.needsUpdate = true; // the live scene's shadows next frame
    big.depthTexture.dispose(); big.dispose();
    this.mat.uniforms.tColor.value = this.final.texture; this.mat.uniforms.tDepth.value = this.final.depthTexture;
    this.quad.visible = true;
  }
  /** Shift the baked image and the live camera by (dx, dy) in NDC. */
  shift(camera, dx, dy) {
    this.mat.uniforms.shift.value.set(dx, dy);
    const e = camera.projectionMatrix.elements;
    e[8] = -dx; e[9] = -dy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  dispose() { this.final?.dispose(); this.final?.depthTexture?.dispose(); this.quad.geometry.dispose(); this.resolveScene.traverse(node => node.geometry?.dispose()); this.mat.dispose(); this.resolveMat.dispose(); }
}
