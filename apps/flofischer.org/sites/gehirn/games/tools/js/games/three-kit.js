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

export function createRenderer(canvas, { shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

/**
 * A soft studio environment (sky-blue top, warm floor, a few bright panels) for reflections, so metals (pins, coins,
 * armour) and water read as shiny instead of black. Built once per renderer with PMREM, no image needed.
 */
export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float t = vP.y * .5 + .5; vec3 top = vec3(.75,.86,1.); vec3 mid = vec3(1.,.97,.9); vec3 bot = vec3(.42,.34,.26); vec3 c = t > .5 ? mix(mid, top, (t-.5)*2.) : mix(bot, mid, t*2.); gl_FragColor = vec4(c,1.); }',
  }));
  env.add(dome);
  const panel = (x, y, z, w, h, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.95), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  panel(0, 30, 10, 30, 12, 4); panel(-30, 12, 18, 14, 18, 2.2); panel(28, 8, -20, 12, 14, 1.6);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.03);
  pm.dispose();
  return rt.texture;
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
