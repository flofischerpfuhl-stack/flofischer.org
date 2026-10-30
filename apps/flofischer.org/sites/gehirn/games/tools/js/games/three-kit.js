/**
 * Fernwork Games · shared Three.js setup: renderer, textures, lights, instanced crowds of part-built characters and
 * instanced particles. Three.js is vendored (tools/vendor/three-0.170.0, MIT); tools/games.html maps the bare
 * specifier "three" to it with an import map.
 */
import * as THREE from 'three';

export { THREE };
const ASSETS = new URL('../../games-assets/', import.meta.url);

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

/**
 * True when WebGL runs in software (SwiftShader, llvmpipe: no GPU, or a blocked driver). Scenes then drop the
 * extras that only a GPU can afford (grass, shadows, far props) so they stay playable.
 */
export const LOW_GPU = (() => {
  try {
    if (new URLSearchParams(location.search).has('lowgpu')) return true;
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch { return false; }
})();

export function createRenderer(canvas, { shadows = true, antialias = window.__noAA ? false : (window.devicePixelRatio || 1) < 1.5 } = {}) {
  // High-density phone screens hide jaggies by themselves; MSAA there mostly costs fill rate.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows && !LOW_GPU;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

/**
 * A soft studio environment (sky-blue top, warm floor, a few bright panels) for reflections, so metals (pins, coins,
 * armour) and water read as shiny instead of black. Built once per renderer with PMREM, no image needed.
 */
export function studioEnvironment(renderer, size = window.__envSize || 64) {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float t = vP.y * .5 + .5; vec3 top = vec3(.75,.86,1.); vec3 mid = vec3(1.,.97,.9); vec3 bot = vec3(.42,.34,.26); vec3 c = t > .5 ? mix(mid, top, (t-.5)*2.) : mix(bot, mid, t*2.); gl_FragColor = vec4(c,1.); }',
  }));
  env.add(dome);
  const panel = (x, y, z, w, h, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.95), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  panel(0, 30, 10, 30, 12, 4); panel(-30, 12, 18, 14, 18, 2.2); panel(28, 8, -20, 12, 14, 1.6);
  // Captured into a small cube first: the environment is soft light and big panels, which 64 px faces hold
  // completely, and the small prefiltered map keeps the per-pixel lookups in the GPU cache (fromScene always uses 256).
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
  cubeCam.update(renderer, env);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromCubemap(cubeRT.texture);
  pm.dispose(); cubeRT.dispose();
  // The capture scene is temporary. Keep only the prefiltered result.
  env.traverse(node => { node.geometry?.dispose(); if (node.material) node.material.dispose(); });
  const texture = rt.texture, disposeTexture = texture.dispose.bind(texture);
  let disposed = false;
  texture.dispose = () => { if (disposed) return; disposed = true; rt.dispose(); disposeTexture(); };
  return texture;
}

/**
 * Image-based light without the texture lookups: for big, rough surfaces (ground, road, trees) the studio
 * environment only adds soft, direction-dependent fill light. This replaces the two cube-map lookups per pixel with
 * the same light as a sky/ground gradient (values measured from studioEnvironment), so these surfaces look the same
 * at a fraction of the cost; shiny things keep the real reflections (pass envMap to them).
 */
// Diffuse irradiance of studioEnvironment for normals pointing up / sideways / down (linear; measured with a white
// rough plane, ~/AgentWork/fernwork-games/calib.mjs).
export const STUDIO_IRRADIANCE = {
  up: new THREE.Color().setRGB(1.265, 1.3235, 1.3617),
  side: new THREE.Color().setRGB(0.8971, 0.8834, 0.8459),
  down: new THREE.Color().setRGB(0.5866, 0.5207, 0.4434),
};
/**
 * Give every standard material under `root` its image-based light: the real environment map (reflections) by
 * default, the cheap gradient for materials listed in `cheap` (big rough surfaces). Call after adding objects.
 */
export function applyIbl(root, env, intensity, cheap = new Set()) {
  root.traverse((o) => {
    const m = o.material;
    if (!m || !m.isMeshStandardMaterial || m.userData.ibl) return;
    m.userData.ibl = true;
    if (cheap.has(m) || m.userData.cheapIbl) cheapIbl(m, intensity);
    else reflectiveIbl(m, env, intensity);
    env?.userData?.shading?.convert(m, o); // cel shading (cel-shading.js) wraps the finished hook chain
  });
}

/**
 * Real reflections (one environment lookup per pixel for the mirror direction) with the diffuse part from the
 * measured gradient instead of a second lookup — the diffuse light of this environment is that gradient.
 */
export function reflectiveIbl(material, env, intensity) {
  material.envMap = env; material.envMapIntensity = intensity;
  const chunk = THREE.ShaderChunk.lights_fragment_maps.replace('getIBLIrradiance( geometryNormal )', 'iblGradient( geometryNormal )');
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uIblUp = { value: STUDIO_IRRADIANCE.up };
    sh.uniforms.uIblSide = { value: STUDIO_IRRADIANCE.side };
    sh.uniforms.uIblDown = { value: STUDIO_IRRADIANCE.down };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_fragment_maps>', chunk)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      uniform vec3 uIblUp; uniform vec3 uIblSide; uniform vec3 uIblDown;
      vec3 iblGradient( const in vec3 normal ) {
        float ny = inverseTransformDirection( normal, viewMatrix ).y;
        vec3 e = ny > 0.0 ? mix( uIblSide, uIblUp, ny ) : mix( uIblSide, uIblDown, -ny );
        return PI * e * envMapIntensity;
      }`);
    material.userData.extraCompile?.(sh);
  };
  material.customProgramCacheKey = () => 'reflective-ibl' + (material.userData.extraKey || '');
  material.needsUpdate = true;
  return material;
}
export function cheapIbl(material, intensity) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uIblUp = { value: STUDIO_IRRADIANCE.up };
    sh.uniforms.uIblSide = { value: STUDIO_IRRADIANCE.side };
    sh.uniforms.uIblDown = { value: STUDIO_IRRADIANCE.down };
    sh.uniforms.uIblInt = { value: intensity };
    sh.fragmentShader = 'uniform vec3 uIblUp; uniform vec3 uIblSide; uniform vec3 uIblDown; uniform float uIblInt;\n' + sh.fragmentShader.replace(
      '#include <lights_fragment_maps>',
      `#include <lights_fragment_maps>
      {
        float ny = inverseTransformDirection( geometryNormal, viewMatrix ).y;
        vec3 e = ny > 0.0 ? mix( uIblSide, uIblUp, ny ) : mix( uIblSide, uIblDown, -ny );
        iblIrradiance += PI * e * uIblInt;
      }`);
    material.userData.extraCompile?.(sh);
  };
  material.customProgramCacheKey = () => 'cheap-ibl' + (material.userData.extraKey || '');
  material.needsUpdate = true;
  return material;
}

/**
 * Fur strands: a small tiling strand texture laid along each vertex's growth direction (attribute aFur: xyz
 * direction in the surface, w strength; baked by scripts/games-blender/export.py). One texture lookup per pixel on fur;
 * mipmapping averages it out to the plain colour at a distance, so small figures do not shimmer.
 */
let furTex = null;
function furTexture() {
  if (furTex) return furTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // short, thin strands in clumps that share a lean, running along y (the growth direction): dark at the root,
  // light at the tip; drawn wrapped so the tile repeats without seams
  for (let k = 0; k < 90; k++) {
    const cx = r() * S, cy = r() * S, lean = (r() - 0.5) * 0.5;
    for (let i = 0; i < 12; i++) {
      const x = cx + (r() - 0.5) * 12, y = cy + (r() - 0.5) * 10, len = 6 + r() * 9, w = 0.6 + r() * 0.7;
      const dx = Math.sin(lean + (r() - 0.5) * 0.15) * len, dy = Math.cos(lean) * len;
      const grad = g.createLinearGradient(x, y, x + dx, y + dy);
      grad.addColorStop(0, 'rgba(25,25,25,0.75)');
      grad.addColorStop(0.6, 'rgba(225,225,225,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0.15)');
      g.strokeStyle = grad; g.lineWidth = w; g.lineCap = 'round';
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + dx * 0.3 + lean * 2, y + oy + dy * 0.5, x + ox + dx, y + oy + dy); g.stroke();
      }
    }
  }
  // keep the average at mid grey: at a distance the fur looks exactly like before
  const d = g.getImageData(0, 0, S, S), px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i];
  const k = 128 / (sum / (px.length / 4));
  for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = Math.min(255, px[i] * k);
  g.putImageData(d, 0, 0);
  furTex = new THREE.CanvasTexture(c);
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping;
  furTex.colorSpace = THREE.NoColorSpace;
  furTex.anisotropy = 4;
  return furTex;
}
/** Adds the fur strands to a material whose geometry carries `aFur`; works with and without the IBL patches. */
export function furPatch(material, { amount = 0.7, across = 26, along = 20 } = {}) {
  const tex = furTexture();
  const patch = (sh) => {
    sh.uniforms.uFurTex = { value: tex };
    sh.vertexShader = 'attribute vec4 aFur;\nvarying vec3 vFurUV;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 fFlow = aFur.xyz;
        vec3 fPerp = normalize(cross(fFlow, normal) + vec3(1e-5));
        vFurUV = vec3(dot(position, fPerp) * ${across.toFixed(1)}, dot(position, fFlow) * ${along.toFixed(1)}, aFur.w);
      }`);
    sh.fragmentShader = 'uniform sampler2D uFurTex;\nvarying vec3 vFurUV;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vFurUV.z > 0.01) {
        float fs = texture2D(uFurTex, vFurUV.xy).r;
        diffuseColor.rgb *= mix(1.0, 0.45 + 1.1 * fs, vFurUV.z * ${amount.toFixed(2)});
      }`);
  };
  material.userData.extraCompile = patch;
  material.userData.extraKey = ':fur';
  // without an IBL patch (yet), the fur patch is the whole onBeforeCompile
  if (!material.userData.ibl) { material.onBeforeCompile = patch; material.customProgramCacheKey = () => 'fur'; }
  material.needsUpdate = true;
  return material;
}

const textures = new Map();
const loader = new THREE.TextureLoader();
/** Cached texture from tools/games-assets/<name>.webp; repeat-wrapped unless `clamp`. */
export function texture(name, { repeat = null, clamp = false, color = true } = {}) {
  const key = name + (repeat ? repeat.join('x') : '') + (clamp ? 'c' : '');
  if (textures.has(key)) return textures.get(key);
  // A finished texture asks the page to redraw (menus are drawn once, not every frame).
  const t = loader.load(new URL(`${name}.webp`, ASSETS).href, () => window.dispatchEvent(new Event('fw-games-texture')));
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (!clamp) { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

/** Standard lit material in the house style (soft, slightly glossy). */
export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.55, metalness: o.metalness ?? 0.05, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, map: o.map ?? null, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true, flatShading: !!o.flat });
}

export function addLights(scene, { sun = 0xffffff, sky = 0xcfe8ff, ground = 0x6b5a3a, intensity = 2.4, ambient = 1.1, dir = [-4, 10, 6], shadowBox = 12, mapSize = 1024 } = {}) {
  const hemi = new THREE.HemisphereLight(sky, ground, ambient);
  scene.add(hemi);
  const light = new THREE.DirectionalLight(sun, intensity);
  light.position.set(...dir);
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  const c = light.shadow.camera;
  c.left = -shadowBox; c.right = shadowBox; c.top = shadowBox; c.bottom = -shadowBox; c.near = 0.5; c.far = 80;
  light.shadow.bias = -0.0006; light.shadow.normalBias = 0.02;
  light.shadow.camera.layers.enable(SHADOW_LAYER);
  scene.add(light); scene.add(light.target);
  return { hemi, light };
}

// ─────────────────────────────── part-built characters ───────────────────────────────
/**
 * A character is a list of parts: { geo, color, emissive, pos, rot, scale, pivot, anim }. `anim` names a motion
 * ('legL', 'legR', 'armL', 'armR', 'head', 'body') applied around `pivot` (character space).
 * A Crowd draws many characters with one InstancedMesh per part, so a squad of 100 is a dozen draw calls.
 */
export class Crowd {
  constructor(scene, parts, max, { shadows = true } = {}) {
    this.parts = parts; this.max = max; this.count = 0;
    this.meshes = parts.map((p) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: p.roughness ?? 0.55, metalness: p.metalness ?? 0.05, emissive: p.emissive ?? 0x000000, emissiveIntensity: p.emissiveIntensity ?? 1, flatShading: !!p.flat, map: p.map ? texture(p.map, { repeat: [1, 2] }) : null });
      const mesh = new THREE.InstancedMesh(p.geo, m, max);
      mesh.castShadow = shadows && !p.noShadow; mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      const col = new THREE.Color(p.color);
      for (let i = 0; i < max; i++) mesh.setColorAt(i, col);
      scene.add(mesh);
      return mesh;
    });
    this.local = parts.map((p) => {
      const m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]))), new THREE.Vector3(...(p.scale || [1, 1, 1])));
      return m;
    });
    this.baseColor = parts.map((p) => new THREE.Color(p.color));
    this._root = new THREE.Matrix4(); this._anim = new THREE.Matrix4(); this._tmp = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._c = new THREE.Color(); this._p = new THREE.Vector3();
  }
  begin() { this.count = 0; }
  /**
   * Add one character. pose: { phase (walk cycle, radians), swing (0..1 stride), lean, flash (0..1 white), tint
   * (THREE.Color or null), squash (0..1), armsUp }.
   */
  add(x, y, z, rotY, scale, pose = {}) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const sq = pose.squash || 0;
    this._q.setFromEuler(this._e.set(pose.lean || 0, rotY, pose.roll || 0));
    this._root.compose(this._v.set(x, y, z), this._q, this._s.set(scale * (1 + sq * 0.6), scale * (1 - sq * 0.8), scale * (1 + sq * 0.6)));
    const ph = pose.phase || 0, sw = pose.swing ?? 1;
    for (let k = 0; k < this.parts.length; k++) {
      const p = this.parts[k];
      let ax = 0, ay = 0, az = 0, oy = 0;
      switch (p.anim) {
        case 'legL': ax = Math.sin(ph) * 0.7 * sw; break;
        case 'legR': ax = -Math.sin(ph) * 0.7 * sw; break;
        case 'armL': ax = pose.armsUp ? -2.6 : -Math.sin(ph) * 0.5 * sw + (p.armBase || 0); break;
        case 'armR': ax = pose.armsUp ? -2.6 : Math.sin(ph) * 0.5 * sw + (p.armBase || 0); break;
        case 'body': oy = Math.abs(Math.sin(ph)) * 0.04 * sw; break;
        case 'head': oy = Math.abs(Math.sin(ph)) * 0.04 * sw; az = Math.sin(ph * 0.5) * 0.08 * sw; break;
        case 'recoil': oy = Math.abs(Math.sin(ph)) * 0.04 * sw; az = 0; break;
        default: break;
      }
      if (p.anim === 'recoil') this._p.set(0, oy, (pose.recoil || 0) * 0.06); else this._p.set(0, oy, 0);
      if (ax || ay || az) {
        const pv = p.pivot || [0, 0, 0];
        this._anim.makeTranslation(pv[0], pv[1] + oy, pv[2]);
        this._tmp.makeRotationFromEuler(this._e.set(ax, ay, az));
        this._anim.multiply(this._tmp);
        this._tmp.makeTranslation(-pv[0], -pv[1], -pv[2]);
        this._anim.multiply(this._tmp);
      } else this._anim.makeTranslation(this._p.x, this._p.y, this._p.z);
      this._tmp.multiplyMatrices(this._root, this._anim).multiply(this.local[k]);
      this.meshes[k].setMatrixAt(i, this._tmp);
      const base = pose.tint && p.tintable ? pose.tint : this.baseColor[k];
      if (pose.flash) this.meshes[k].setColorAt(i, this._c.copy(base).lerp(WHITE, pose.flash));
      else this.meshes[k].setColorAt(i, base);
    }
  }
  end() {
    for (const m of this.meshes) {
      m.count = this.count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  dispose(scene) { for (const m of this.meshes) { scene.remove(m); m.geometry.dispose?.(); m.material.dispose(); } }
}
const WHITE = new THREE.Color(0xffffff);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** Depth-only material for crowd pre-passes (writes depth, no colour). */
const PREPASS = new THREE.MeshBasicMaterial({ colorWrite: false });

/**
 * The fast crowd: a character's parts are merged (with their colours baked into vertex colours) into one mesh per
 * motion channel (body, legL, legR, armL, armR, recoil) plus a self-lit "glow" mesh per channel for visors and eyes.
 * A Fern Ranger becomes 7 draw calls instead of 23 and 7 matrices per soldier instead of 23.
 * `recolor` swaps the colour of tintable parts at build time (runner caps, the Rot King).
 */
export class MergedCrowd {
  constructor(scene, parts, max, { recolor = null, castShadow = false, model = null, shadowModel = null, prepass = false } = {}) {
    this.max = max; this.count = 0;
    if (model) { this.fromModel(scene, model, shadowModel, max, prepass); return; }
    // Shadows are cast by coarser stand-ins on layer SHADOW_LAYER that only the light's shadow camera sees: a soft
    // shadow cannot show 18 vs 8 segments, but the shadow pass gets a fraction of the vertices.
    if (castShadow) parts = parts.map((p) => ({ ...p, shadowGeo: lowPoly(p.geo) }));
    const channels = new Map();
    for (const p of parts) {
      const ch = p.anim === 'head' ? 'body' : (p.anim || 'body');
      const glow = !!p.emissive && p.emissive !== 0x000000;
      const gloss = !glow && !!p.gloss;
      const key = ch + (glow ? ':glow' : gloss ? ':gloss' : '');
      if (!channels.has(key)) channels.set(key, { ch, glow, gloss, pivot: p.pivot || [0, 0, 0], armBase: p.armBase || 0, parts: [] });
      channels.get(key).parts.push(p);
    }
    this.channels = [...channels.values()].map((c) => {
      const geo = mergeParts(c.parts, recolor, c.glow);
      // three materials per figure: matte (fur, cloth), gloss (eyes, jelly, metal), self-lit glow (visors, antennas)
      const material = c.glow
        ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
        : c.gloss
          ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.08 })
          : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
      const mesh = new THREE.InstancedMesh(geo, material, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false;
      for (let i = 0; i < max; i++) mesh.setColorAt(i, WHITE);
      scene.add(mesh);
      let shadow = null;
      if (castShadow && !c.glow) {
        const sg = mergeParts(c.parts.map((p) => ({ ...p, geo: p.shadowGeo, flat: false })), null, false);
        shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ colorWrite: false }), max);
        shadow.instanceMatrix = mesh.instanceMatrix; // same transforms, no extra uploads
        shadow.frustumCulled = false; shadow.count = 0; shadow.castShadow = true;
        shadow.layers.set(SHADOW_LAYER);
        scene.add(shadow);
      }
      return { ...c, mesh, shadow };
    });
    this._root = new THREE.Matrix4(); this._a = new THREE.Matrix4(); this._t = new THREE.Matrix4(); this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }
  /**
   * Baked sculpt (models.js loadModel): one mesh per channel; shadows from the low-detail bake on SHADOW_LAYER.
   * `prepass`: draw the crowd's depth first with an empty shader, so the lit pass shades every pixel once. Several
   * crowds that stand mixed together (the four Ranger species) cannot be sorted front to back as one; without the
   * pre-pass their overlapping figures get shaded two or three times.
   */
  fromModel(scene, model, shadowModel, max, prepass) {
    const mats = {
      matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02 }),
      gloss: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.04 }),
      glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    this.channels = model.map((g) => {
      const m = mats[g.mat]();
      if (g.geometry.attributes.aFur && g.mat !== 'glow') furPatch(m);
      const mesh = new THREE.InstancedMesh(g.geometry, m, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false;
      for (let i = 0; i < max; i++) mesh.setColorAt(i, WHITE);
      scene.add(mesh);
      let shadow = null;
      const sg = shadowModel && g.mat !== 'glow' ? shadowModel.find((s) => s.ch === g.ch && s.mat === g.mat) : null;
      if (sg) {
        shadow = new THREE.InstancedMesh(sg.geometry, new THREE.MeshBasicMaterial({ colorWrite: false }), max);
        shadow.instanceMatrix = mesh.instanceMatrix;
        shadow.frustumCulled = false; shadow.count = 0; shadow.castShadow = true; shadow.layers.set(SHADOW_LAYER);
        scene.add(shadow);
      }
      let depth = null;
      if (prepass && g.mat !== 'glow') {
        depth = new THREE.InstancedMesh(g.geometry, PREPASS, max);
        depth.instanceMatrix = mesh.instanceMatrix;
        depth.frustumCulled = false; depth.count = 0; depth.renderOrder = -1;
        scene.add(depth);
      }
      return { ch: g.ch, glow: g.mat === 'glow', gloss: g.mat === 'gloss', pivot: g.pivot, armBase: g.armBase, mesh, shadow, depth };
    });
    this._root = new THREE.Matrix4(); this._a = new THREE.Matrix4(); this._t = new THREE.Matrix4(); this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }
  begin() { this.count = 0; }
  add(x, y, z, rotY, scale, pose = {}) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const sq = pose.squash || 0, ph = pose.phase || 0, sw = pose.swing ?? 1;
    this._q.setFromEuler(this._e.set(pose.lean || 0, rotY, 0));
    this._root.compose(this._v.set(x, y, z), this._q, this._s.set(scale * (1 + sq * 0.6), scale * (1 - sq * 0.8), scale * (1 + sq * 0.6)));
    const bob = Math.abs(Math.sin(ph)) * 0.04 * sw;
    const flash = pose.flash ? 1 + pose.flash * 2.5 : 1;
    // tint (frozen aliens turn icy) multiplies the vertex colours; flash brightens over it
    if (pose.tint) this._c.copy(pose.tint).multiplyScalar(flash); else this._c.setRGB(flash, flash, flash);
    for (const c of this.channels) {
      if (pose.hide === c.ch) {
        // a channel switched off for this figure (a Shield-Klonk that lost its shield)
        c.mesh.setMatrixAt(i, ZERO); continue;
      }
      let ax = 0;
      switch (c.ch) {
        case 'legL': ax = Math.sin(ph) * 0.7 * sw; break;
        case 'legR': ax = -Math.sin(ph) * 0.7 * sw; break;
        case 'armL': ax = pose.armsUp ? -2.6 : -Math.sin(ph) * 0.5 * sw + c.armBase; break;
        case 'armR': ax = pose.armsUp ? -2.6 : Math.sin(ph) * 0.5 * sw + c.armBase; break;
        default: break;
      }
      if (c.ch === 'spin') {
        const pv = c.pivot;
        this._a.makeTranslation(pv[0], pv[1] + bob, pv[2]);
        this._a.multiply(this._t.makeRotationY(pose.spin || 0));
        this._a.multiply(this._t.makeTranslation(-pv[0], -pv[1], -pv[2]));
      } else if (ax) {
        const pv = c.pivot;
        this._a.makeTranslation(pv[0], pv[1], pv[2]);
        this._a.multiply(this._t.makeRotationX(ax));
        this._a.multiply(this._t.makeTranslation(-pv[0], -pv[1], -pv[2]));
      } else if (c.ch === 'body' || c.ch === 'recoil') {
        this._a.makeTranslation(0, bob, c.ch === 'recoil' ? (pose.recoil || 0) * 0.06 : 0);
      } else this._a.identity();
      this._m.multiplyMatrices(this._root, this._a);
      c.mesh.setMatrixAt(i, this._m);
      c.mesh.setColorAt(i, this._c);
    }
  }
  end() {
    for (const c of this.channels) {
      c.mesh.count = this.count;
      if (c.shadow) c.shadow.count = this.count;
      if (c.depth) c.depth.count = this.count;
      c.mesh.instanceMatrix.needsUpdate = true;
      if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
    }
  }
}

/** Layer of the shadow-only stand-ins; enable it on the shadow camera (addLights does). */
export const SHADOW_LAYER = 1;

/** The same primitive with fewer segments (used only for casting shadows). */
export function lowPoly(geo) {
  const p = geo.parameters || {};
  switch (geo.type) {
    case 'SphereGeometry': return new THREE.SphereGeometry(p.radius, Math.max(6, Math.round(p.widthSegments / 2)), Math.max(4, Math.round(p.heightSegments / 2)), p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    case 'CapsuleGeometry': return new THREE.CapsuleGeometry(p.radius, p.length, 2, 6);
    case 'CylinderGeometry': return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, Math.min(p.radialSegments, 6));
    case 'ConeGeometry': return new THREE.ConeGeometry(p.radius, p.height, Math.min(p.radialSegments, 6));
    case 'TorusGeometry': return new THREE.TorusGeometry(p.radius, p.tube, 4, Math.min(p.tubularSegments, 10));
    case 'IcosahedronGeometry': return new THREE.IcosahedronGeometry(p.radius, Math.min(p.detail, 1));
    case 'LatheGeometry': return new THREE.LatheGeometry(p.points, Math.min(p.segments, 8));
    default: return geo;
  }
}

/**
 * Bake parts (local transform + colour) into one indexed geometry with position, normal and colour. Indexed, so shared
 * vertices are shaded once (the same triangles, a third of the vertex work).
 */
function mergeParts(parts, recolor, glow) {
  const pos = [], nor = [], col = [], idx = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), c = new THREE.Color(), v = new THREE.Vector3();
  for (const p of parts) {
    let g = p.geo.clone();
    if (p.flat) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('normal'); g.computeVertexNormals(); }
    m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]))), new THREE.Vector3(...(p.scale || [1, 1, 1])));
    nm.getNormalMatrix(m);
    // Color.set() already converts sRGB hex into the linear working space vertex colours use.
    c.set(recolor && p.tintable ? recolor : glow ? p.emissive : p.color);
    if (glow) c.multiplyScalar(Math.max(1, p.emissiveIntensity || 1));
    const P = g.attributes.position, N = g.attributes.normal, base = pos.length / 3;
    // optional vertical gradient (color at the top, color2 at the bottom of the part), e.g. glowing jelly bellies
    let y0 = 0, y1 = 1;
    const c2 = p.color2 != null ? new THREE.Color(p.color2) : null;
    if (c2) { g.computeBoundingBox(); y0 = g.boundingBox.min.y; y1 = g.boundingBox.max.y; }
    const cc = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const ly = P.getY(i);
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      if (c2) { const t = Math.min(1, Math.max(0, (ly - y0) / (y1 - y0 || 1))); cc.copy(c2).lerp(c, 1 - Math.pow(1 - t, p.grad || 1)); col.push(cc.r, cc.g, cc.b); }
      else col.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

/** Soft round contact shadows under many objects in one draw call (instead of shadow maps). */
export class BlobShadows {
  constructor(scene, max, opacity = 0.32) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, color: 0x000000 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4();
  }
  begin() { this.n = 0; }
  add(x, z, r, y = 0.012) {
    if (this.n >= this.max) return;
    this._m.makeScale(r, 1, r * 0.9).setPosition(x, y, z);
    this.mesh.setMatrixAt(this.n++, this._m);
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}

/** Instanced particles: small lit cubes/spheres with per-instance colour and scale. */
export class Particles {
  constructor(scene, max, geo = new THREE.IcosahedronGeometry(1, 0), material = null) {
    this.mesh = new THREE.InstancedMesh(geo, material || new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x000000 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, WHITE);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color();
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, size, color, rot = 0, sy = null) {
    if (this.n >= this.max) return;
    this._q.setFromEuler(this._e.set(rot, rot * 1.3, 0));
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(size, sy ?? size, size));
    this.mesh.setMatrixAt(this.n, this._m);
    this.mesh.setColorAt(this.n, typeof color === 'number' || typeof color === 'string' ? this._c.set(color) : color);
    this.n++;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

/** A plane with text drawn on a canvas (gate numbers, signs). Call .set(text, colors) to redraw. */
export class TextPlane {
  constructor(w, h, px = 256) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px; this.canvas.height = Math.round(px * (h / w));
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.text = null;
  }
  set(text, { fill = '#fff', stroke = 'rgba(0,0,0,.45)', sub = '' } = {}) {
    const key = text + fill + sub;
    if (key === this.text) return;
    this.text = key;
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const size = Math.round(H * (sub ? 0.5 : 0.62));
    g.font = `900 ${size}px "Geist", "Inter", system-ui, sans-serif`;
    g.lineWidth = size * 0.16; g.strokeStyle = stroke; g.strokeText(text, W / 2, H * (sub ? 0.58 : 0.52));
    g.fillStyle = fill; g.fillText(text, W / 2, H * (sub ? 0.58 : 0.52));
    if (sub) {
      g.font = `800 ${Math.round(H * 0.18)}px "Geist", "Inter", system-ui, sans-serif`;
      g.lineWidth = H * 0.03; g.strokeText(sub, W / 2, H * 0.2); g.fillText(sub, W / 2, H * 0.2);
    }
    this.tex.needsUpdate = true;
  }
}

/** Project a world point to CSS pixels of a w × h view. */
export function projector(camera, w, h) {
  const v = new THREE.Vector3();
  return (x, y, z) => {
    v.set(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, behind: v.z > 1 };
  };
}
