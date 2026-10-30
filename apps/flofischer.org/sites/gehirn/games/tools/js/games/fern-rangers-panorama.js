/**
 * Ranger-owned authored backdrop, adapted from the pre-port Panorama.
 * A baked horizon for scenes whose camera barely moves (Fern Rangers): the world's painted sky, rolling terrain
 * with trees, houses and the landmark, 3D clouds, all rendered once per world into a texture that a single plane far
 * behind the scene shows each frame (one textured quad instead of a sky dome, ridges and far props).
 *
 * new Panorama() → .build({ world, dark, low, units }) then .bake(renderer, camera); add .mesh to the scene.
 * units: world units per metre of the props (Fern Rangers: 1).
 */
import { THREE } from './three-kit.js';
import { skyMaterial } from './world/sky.js';
import { loadModel } from './models.js';
const WORLD = [
  { // Fernhaven Meadows: sunny morning, rolling green hills, cottages, a windmill, ivy and flowers
    sky: { top: 0x3f8fe6, horizon: 0xe4f3ff, glow: 0xfff1c4, cloud: 0xffffff, shade: 0xb8c8e0 },
    fog: 0xd2e6f4, ground: [0x4f9a35, 0x8cc95a], groundTex: 't-grass', far: [0x6aa860, 0x9cc8a0], rock: [0.6, 0.57, 0.52],
    tuft: [[0.08, 0.2, 0.05], [0.34, 0.6, 0.18]], flowers: [0xffffff, 0xfff2a8, 0xf2a6c4, 0xb9a6f2, 0xff8a5c], ferns: true, ivy: true, moss: 0.8,
    trees: ['old:TREE_ROUND'], small: ['old:BUSH'], houses: ['old:COTTAGE'], landmark: 'old:WINDMILL',
    torch: 0xffb050, window: 0xbfe4ff, banner: [0x3f9b4a, 0xfff4d6], wood: 0x8a5a33, metal: 0x3a3a40, trim: 0xf3ead8,
    ambient: { kind: 'pollen', color: 0xfff2a8 }, smoke: true, hills: 'roll',
  },
  { // Sunbake Dunes: golden hour, mesas, cacti and palms, cloth awnings and clay pots
    sky: { top: 0x4f7fd0, horizon: 0xffd29a, glow: 0xffc070, cloud: 0xfff0dc, shade: 0xd89a7a },
    fog: 0xf2cfa0, ground: [0xd9a05c, 0xf0c888], groundTex: 't-sand', far: [0xd08a58, 0xe8b07a], rock: [0.78, 0.5, 0.34],
    tuft: [[0.32, 0.36, 0.12], [0.62, 0.62, 0.3]], flowers: [0xff7a4a, 0xffd23f], ferns: false, ivy: false, moss: 0.0,
    trees: ['woodland_palm_sahrun'], small: ['fw_sandstone_bedded'], houses: [], landmark: 'fw_wall_stone_arch',
    torch: 0xffa040, window: 0xffe0b0, banner: [0x2aa6a0, 0xffe6b8], wood: 0x9a6a3a, metal: 0x5a4030, trim: 0xf7deb0,
    ambient: { kind: 'dust', color: 0xffe2b0 }, smoke: false, hills: 'mesa',
  },
  { // Frostpeak: crisp blue, snowy pines and peaks, icicles, an observatory and the aurora
    sky: { top: 0x2f63b8, horizon: 0xe2f0ff, glow: 0xd6f0ff, cloud: 0xffffff, shade: 0xa8bcd8 },
    fog: 0xd8e8f8, ground: [0xe6eef8, 0xffffff], groundTex: 't-snow', far: [0xb8cce4, 0xe8f0fa], rock: [0.52, 0.58, 0.68],
    tuft: [[0.16, 0.3, 0.3], [0.5, 0.66, 0.62]], flowers: [], ferns: false, ivy: false, moss: 0.0, snow: true,
    trees: ['woodland_spruce_tiered'], small: ['fw_snow_wind_drift','fw_ice_crystal_cluster'], houses: [], landmark: 'fw_cliff_straight',
    torch: 0xffc070, window: 0xffd890, banner: [0x3566c2, 0xe2f2ff], wood: 0x7a5a40, metal: 0x4a5568, trim: 0xe8f0fa,
    ambient: { kind: 'snow', color: 0xffffff }, smoke: true, hills: 'peaks',
  },
  { // Ember Isles: dramatic dusk, volcanoes, lava, basalt, alien pipes and crystals, the mothership above
    sky: { top: 0x1f1435, horizon: 0xe8784a, glow: 0xff9a4a, cloud: 0x5a3a52, shade: 0x2a1a2a },
    fog: 0x6a3a44, ground: [0x3a2e30, 0x5a4644], groundTex: 't-lavarock', far: [0x3a2430, 0x5a3440], rock: [0.3, 0.26, 0.26],
    tuft: [[0.08, 0.16, 0.12], [0.2, 0.4, 0.3]], flowers: [], ferns: false, ivy: false, moss: 0.0, lava: true,
    trees: ['fw_basalt_columns'], small: ['fw_basalt_columns','fw_petra_raw_fossil'], houses: [], landmark: 'fw_cliff_corner',
    torch: 0xff8030, window: 0xff9a50, banner: [0x7a2a4e, 0xffb27a], wood: 0x4a3030, metal: 0x2a2a34, trim: 0x8a7468,
    ambient: { kind: 'ember', color: 0xff9a4a }, smoke: false, hills: 'volcano',
  },
];


import { Batch, mtx, cloud, modelInstances, rng, createNoise, smoothstep } from './world/decor.js';

const PAN_FS = `
#include <common>
varying vec2 vUv; uniform sampler2D tPan;
void main(){
  gl_FragColor = vec4(texture2D(tPan, vUv).rgb, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class RangerPanorama {
  constructor() {
    this.mat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: PAN_FS, uniforms: { tPan: { value: null } }, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 50; this.mesh.visible = false;
    this.margin = 1.3; this.dist = 420;
  }

  /** The panorama scene of a world (fern-scale: road at the origin, horizon 150–700 units ahead). */
  async build({ world = 0, dark = false, low = false, fog = 0xd2e8fa, light = null, library }) {
    this.scene?.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    const W = WORLD[world] || WORLD[0], rand = rng(5 + world * 31), noise = createNoise(11 + world);
    const PROPS = Object.fromEntries(await Promise.all([...new Set([...W.trees,...W.small,...W.houses,W.landmark])].map(async id=>[id,await (id.startsWith('old:')?loadModel(id.slice(4),'lo'):library.model(id,'lo'))])));
    const nativeHeight = name => Math.max(.1, ...PROPS[name].map(part=>{part.geometry.computeBoundingBox();return part.geometry.boundingBox.max.y;}));
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(new THREE.Color(fog).multiplyScalar(dark ? 0.55 : 1), 120, 760);
    const L = light || { sun: 0xfff1d6, sky: 0xd6ecff, ground: 0x4f6e2c, intensity: 2.6, ambient: 1.2 };
    const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.ambient * (dark ? 0.6 : 1));
    const sun = new THREE.DirectionalLight(L.sun, L.intensity * (dark ? 0.5 : 1)); sun.position.set(-300, 400, 200);
    scene.add(hemi, sun);
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMaterial(W.sky, world, dark ? 1 : 0));
    this.sky.renderOrder = -10; scene.add(this.sky);
    // terrain: flat near the road's end, hills rising behind
    const hAt = (x, z) => {
      const far = smoothstep(-150, -300, z), d = Math.min(1, (-z - 150) / 600);
      let h;
      if (W.hills === 'roll') h = (noise.fbm2(x * 0.006, z * 0.008, 4) * 0.5 + 0.55) * (16 + d * 70);
      else if (W.hills === 'mesa') { const n = noise.fbm2(x * 0.005, z * 0.006, 4) * 0.5 + 0.5; h = (smoothstep(0.5, 0.56, n) * 0.75 + smoothstep(0.66, 0.7, n) * 0.35) * (28 + d * 60) + n * 6; }
      else if (W.hills === 'peaks') { const r = 1 - Math.abs(noise.fbm2(x * 0.003, z * 0.004, 4)); h = Math.pow(r, 2.4) * (30 + d * 150); }
      else { const c = Math.max(0, 1 - Math.abs(((x + 400) % 260 + 260) % 260 - 130) / 70); h = (noise.fbm2(x * 0.006, z * 0.007, 4) * 0.5 + 0.5) * (14 + d * 30) + c * d * 110; }
      return -0.05 + h * far;
    };
    {
      const nx = low ? 80 : 160, nz = low ? 30 : 60, g = new THREE.PlaneGeometry(1, 1, nx, nz); g.rotateX(-Math.PI / 2);
      const P = g.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
      const c0 = new THREE.Color(W.ground[0]), c1 = new THREE.Color(W.ground[1]), f0 = new THREE.Color(W.far[0]), f1 = new THREE.Color(W.far[1]), rk = new THREE.Color().setRGB(...W.rock);
      for (let i = 0; i < P.count; i++) {
        const u = P.getX(i) + 0.5, v = 0.5 - P.getZ(i), z = -40 - Math.pow(v, 1.5) * 820, x = (u - 0.5) * 2 * (120 + v * 1100);
        P.setXYZ(i, x, hAt(x, z), z);
      }
      g.computeVertexNormals();
      const N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = noise.fbm2(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
        c.copy(c0).lerp(c1, n).lerp(f0.clone().lerp(f1, n), smoothstep(-160, -500, z)).lerp(rk, smoothstep(0.85, 0.6, N.getY(i)) * 0.7);
        if (W.hills === 'peaks') c.lerp(new THREE.Color(0xf6f9ff), smoothstep(40, 90, y) * 0.9);
        if (W.lava && y > 90) c.lerp(new THREE.Color(0xff6a2a), 0.5);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    }
    const put = (names, count, zMin, zMax, xMax, scale, xAvoid = 0) => {
      const out = {}, tints = {};
      for (let k = 0; k < count * 4 && count > 0; k++) {
        const x = (rand() * 2 - 1) * xMax, z = zMin + rand() * (zMax - zMin);
        if (Math.abs(x) < xAvoid) continue;
        const name = names[(rand() * names.length) | 0];
        if (!PROPS[name]) continue;
        const s = (scale[0] + rand() * (scale[1] - scale[0])) / nativeHeight(name), r = s * 0.3;
        const y = Math.min(hAt(x, z), hAt(x + r, z), hAt(x - r, z), hAt(x, z + r), hAt(x, z - r));
        (out[name] ||= []).push(mtx([x, y - 0.1 * s, z], [0, rand() * 6.3, 0], s));
        (tints[name] ||= []).push(new THREE.Color().setRGB(0.82 + rand() * 0.3, 0.86 + rand() * 0.26, 0.8 + rand() * 0.25));
        count--;
      }
      for (const [name, list] of Object.entries(out)) scene.add(modelInstances(PROPS[name], list, { tints: tints[name] }));
    };
    put(W.trees, low ? 40 : 220, -620, -150, 700, [4, 9], 30);
    put(W.small, low ? 10 : 60, -320, -120, 300, [1.2, 2.4], 25);
    if (W.houses.length) put(W.houses, low ? 3 : 10, -520, -170, 520, [5, 8], 40);
    if (PROPS[W.landmark]) {
      const lm = [[-150, -330, world === 3 ? 20 : 11], [260, -520, world === 3 ? 26 : 14]];
      scene.add(modelInstances(PROPS[W.landmark], lm.map(([x, z, s]) => mtx([x, hAt(x, z) - s * 0.3, z], [0, rand() * 6, 0], s / nativeHeight(W.landmark)))));
    }
    if (world === 3 && PROPS.UFO) scene.add(modelInstances(PROPS.UFO, [mtx([90, 150, -560], [0.15, 0.4, -0.05], 60)], { fog: false }));
    if (world !== 3 && !low) {
      const cb = new Batch();
      for (let k = 0; k < 10; k++) { const s = 18 + rand() * 26; cb.add(cloud(rand, 6, new THREE.Color(W.sky.shade).toArray()), mtx([(rand() * 2 - 1) * 700, 70 + rand() * 120, -500 - rand() * 200], [0, 0, 0], [s * 1.7, s * 0.7, s])); }
      const m = cb.mesh({ roughness: 1 }); m.material.emissive = new THREE.Color(W.sky.cloud).multiplyScalar(0.35);
      scene.add(m);
    }
  }

  /** The off-screen target bake() draws into, for the current drawing buffer size. */
  targetFor(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.min(4096, Math.round(size.x * this.margin)), h = Math.min(4096, size.y);
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: false });
    }
    return this.target;
  }

  /** Render the panorama from `camera` (with a wider horizontal margin) and place the plane to match. */
  bake(renderer, camera) {
    this.targetFor(renderer);
    const h = this.target.height;
    const cam = camera.clone(); cam.aspect = camera.aspect * this.margin; cam.far = 2000; cam.updateProjectionMatrix();
    const tanH = Math.tan((cam.fov * Math.PI) / 360), D = 700, vh = 2 * D * tanH, vw = vh * cam.aspect;
    this.sky.position.copy(cam.position).add(new THREE.Vector3(0, 0, -D).applyQuaternion(cam.quaternion));
    this.sky.quaternion.copy(cam.quaternion); this.sky.scale.set(vw * 1.02, vh * 1.02, 1);
    this.sky.material.uniforms.aspect.value = vw / vh; this.sky.material.uniforms.res.value = h;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target); renderer.clear(true, true, true);
    renderer.render(this.scene, cam);
    renderer.setRenderTarget(prev);
    // the plane: same view, at `dist` in front of the camera
    const dv = 2 * this.dist * tanH;
    this.mesh.position.copy(cam.position).add(new THREE.Vector3(0, 0, -this.dist).applyQuaternion(cam.quaternion));
    this.mesh.quaternion.copy(cam.quaternion); this.mesh.scale.set(dv * cam.aspect, dv, 1);
    this.base = this.mesh.position.clone();
    this.mat.uniforms.tPan.value = this.target.texture; this.mesh.visible = true;
  }
}
