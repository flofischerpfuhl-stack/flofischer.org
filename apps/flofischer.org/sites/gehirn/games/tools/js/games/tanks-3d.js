/** Bounce Brigade: authored remote-controlled toys on a Concordia tournament tabletop. */
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, Particles, LOW_GPU } from './three-kit.js';
import { RoundedBoxGeometry } from '../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { BounceArt, ToyInstances } from './tanks-art.js';
import { TabletopWorld } from './tanks-tabletop.js';
import { SMAAPass } from '../../vendor/three-0.170.0/postprocessing/SMAAPass.js';
import * as Profile from './profile.js';
import { W, H, T } from './tanks-levels.js';
import { safeArea, SIDE_MARGIN } from './tanks-touch.js';

const THEMES = [
  { // Fernhaven Meadows: oak blocks on a mown lawn
    ground: 't-grass', floor: 0x9ccf6a, floorAlt: 0x8cc25c, wall: 0xc9925a, wallMap: 't-wood', crate: 0xb07a45, fog: 0xcfe7f5, sky: 0xd6ecff, sun: 0xfff1d6, hemiG: 0x4f6e2c, exposure: 1.05,
  },
  { // Sunbake Dunes: sandstone blocks, canyon cracks
    ground: 't-sand', floor: 0xecc98c, floorAlt: 0xe2bb7a, wall: 0xd9a45f, wallMap: 't-stone', crate: 0xa86e3a, fog: 0xf3d6a8, sky: 0xffe3c2, sun: 0xffd29a, hemiG: 0x9a6b3a, exposure: 1.05,
  },
  { // Frostpeak: ice blocks on packed snow
    ground: 't-snow', floor: 0xe6eef8, floorAlt: 0xdbe6f3, wall: 0x6fb2e8, wallMap: null, crate: 0x8a6a4a, fog: 0xd8e8f8, sky: 0xe0f0ff, sun: 0xffffff, hemiG: 0xb0c4d8, exposure: 0.96, glossyWall: true,
  },
  { // Ember Isles: basalt blocks, lava pools, vents
    ground: 't-lavarock', floor: 0x5d4f4f, floorAlt: 0x524444, wall: 0x3b3236, wallMap: 't-stone', crate: 0x5a3a2a, fog: 0x4a2a36, sky: 0xff9a6a, sun: 0xffb27a, hemiG: 0x3a1408, exposure: 1.1, lava: true,
  },
];

const TAU = Math.PI * 2;
const v3 = new THREE.Vector3();

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
/** Ice tile: pale blue with frosty streaks. */
const iceTex = () => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#cfeaf9'; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { g.beginPath(); const y = Math.random() * w; g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 60); g.stroke(); }
  g.strokeStyle = 'rgba(120,170,210,.35)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, w - 2);
});

/** Instanced flat quads on the ground with colour and alpha per instance (tread marks, scorch, rings). */
class Decals {
  constructor(scene, max, frag) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying vec3 vC; varying float vA; void main() { vUv = uv; vC = instanceColor; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vA; void main() { ${frag} }`,
    }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  add(x, z, sx, sz, rot, color, alpha, y = 0.012) {
    if (this.n >= this.max) return;
    this._q.setFromAxisAngle(this._up, rot);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(color));
    this.alpha.array[this.n] = alpha; this.n++;
  }
  end() { const m = this.mesh; m.count = this.n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true; }
}

/** Full-resolution SMAA replaces the old low-DPR hardware MSAA path.
 * This display-colour target uses r170's XR-target output contract: the scene
 * receives the same per-material ACES/sRGB output as the default framebuffer.
 * In particular, toneMapped:false toy effects and custom shaders stay intact.
 * r170 stores this XR-style target in RGBA8: display-encoded samples go
 * straight through SMAA, with no second tone map or sRGB encoding.
 * No XR session, renderer size, pixel ratio, geometry or shadow policy changes.
 */
class BouncePostAA {
  constructor(){
    this.mode='SMAA 1x Medium / Three 0.170.0 / display-colour';
    this.meta={passes:['per-material ACES + sRGB scene','SMAA edges','SMAA weights','SMAA display-colour blend'],toneMapping:'per-material ACESFilmicToneMapping',colorSpace:'SRGBColorSpace',exposure:'renderer.toneMappingExposure',fullResolution:true};
    this.mainColorTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,depthBuffer:true,samples:0,colorSpace:THREE.SRGBColorSpace});
    this.mainColorTarget.isXRRenderTarget=true;
    this.smaaPass=new SMAAPass(1,1);this.smaaPass.renderToScreen=true;
    const blend=this.smaaPass.materialBlend;
    blend.toneMapped=false;blend.depthTest=false;blend.depthWrite=false;
    this.lookupReady=Promise.all([this.smaaPass.areaTexture,this.smaaPass.searchTexture].map(texture=>new Promise((resolve,reject)=>{
      const image=texture.image,done=()=>{texture.needsUpdate=true;resolve();};
      if(image.complete&&image.naturalWidth)done();else{image.addEventListener('load',done,{once:true});image.addEventListener('error',()=>reject(Error('Bounce SMAA lookup image failed')),{once:true});}
    })));
    this.size=new THREE.Vector2();
  }
  resize(renderer){
    renderer.getDrawingBufferSize(this.size);const {x:w,y:h}=this.size;
    this.mainColorTarget.setSize(w,h);this.smaaPass.setSize(w,h);
  }
  render(renderer,scene,camera){
    renderer.setRenderTarget(this.mainColorTarget);renderer.render(scene,camera);
    this.smaaPass.render(renderer,null,this.mainColorTarget);
    renderer.setRenderTarget(null);
  }
  dispose(){this.mainColorTarget.dispose();this.smaaPass.dispose();}
}

export class Tanks3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas,{antialias:false});
    this.postAA=!window.__noAA&&(window.devicePixelRatio||1)<1.5?new BouncePostAA():null;
    this.renderer.info.autoReset=false;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.env = studioEnvironment(this.renderer);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
    this.w = 1; this.h = 1; this.frame = 0; this.session = null; this.themeKey = null; this.rev = -1; this.portrait = false;
    this.time = 0;
    this.build();
    this.prepared=null;this.disposed=false;this.prepareEpoch=0;
    const v = new THREE.Vector3(), out = { x: 0, y: 0, s: 1 };
    this._proj = (x, y, h = 0) => {
      v.set(x - W / 2, h, y - H / 2).project(this.camera);
      const sx = (v.x + 1) / 2 * this.w, sy = (1 - v.y) / 2 * this.h;
      v.set(x - W / 2 + 1, h, y - H / 2).project(this.camera);
      out.s = Math.hypot((v.x + 1) / 2 * this.w - sx, (1 - v.y) / 2 * this.h - sy); out.x = sx; out.y = sy;
      return out;
    };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), hit = new THREE.Vector3(), gp = { x: 0, y: 0 };
    // the cursor is read at turret height, so aiming feels right on the tilted view
    this.groundAt = (sx, sy) => {
      ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      gp.x = hit.x + W / 2; gp.y = hit.z + H / 2; return gp;
    };
    // screen directions (right, down) → arena directions, for the stick and the keys on a turned camera
    const dir = { x: 0, y: 0 };
    this.dirFn = (mx, my) => {
      if (!this.portrait) { dir.x = mx; dir.y = my; return dir; }
      dir.x = -my; dir.y = mx; return dir;
    };
  }
  projectFn() { return this._proj; }

  build() {
    const s = this.scene;
    this.lights = addLights(s, { intensity: 2.5, ambient: 1.1, dir: [-6, 14, 8], shadowBox: 13, mapSize: LOW_GPU ? 1024 : 2048 });
    this.lights.light.shadow.bias = -0.0008;
    this.geo = {
      rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.18),
      block: new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
      dome: (() => { const g = new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2); return g; })(),
      tube: new THREE.CylinderGeometry(1, 1, 1, 14),
      wheel: new THREE.CylinderGeometry(1, 1, 1, 16),
      ball: new THREE.SphereGeometry(1, 14, 10),
      ring: new THREE.TorusGeometry(1, 0.22, 8, 18),
      plane: new THREE.PlaneGeometry(1, 1),
    };
    // the world around the arena and the arena floor
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat(0xffffff, { roughness: 0.95 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -2.65; this.ground.receiveShadow = true; this.ground.renderOrder=1; s.add(this.ground);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat(0xffffff, { roughness: 0.9 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.floor.renderOrder=1; s.add(this.floor);
    // blocks (walls and the border ring) and crates: one instanced mesh each
    const maxBlocks = W * H + 2 * (W + H) + 8;
    this.walls = new THREE.InstancedMesh(this.geo.block, mat(0xffffff, { roughness: 0.6 }), maxBlocks);
    this.walls.castShadow = this.walls.receiveShadow = true; s.add(this.walls);
    this.wallCaps = new THREE.InstancedMesh(this.geo.block, mat(0xffffff, { roughness: 0.75 }), maxBlocks);
    this.wallCaps.receiveShadow = true; s.add(this.wallCaps);
    // ice, pits / lava, vents
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.ice = new THREE.InstancedMesh(flat, mat(0xffffff, { map: iceTex(), roughness: 0.12, metalness: 0.05 }), W * H);
    this.ice.receiveShadow = true; s.add(this.ice);
    this.lavaU = { uTime: { value: 0 }, uLava: { value: 0 } };
    this.pits = new THREE.InstancedMesh(flat, new THREE.ShaderMaterial({
      uniforms: this.lavaU,
      vertexShader: 'attribute vec4 aEdge; varying vec2 vUv; varying vec3 vW; varying vec4 vEdge; void main() { vUv = uv; vEdge = aEdge; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime, uLava; varying vec2 vUv; varying vec3 vW; varying vec4 vEdge;
        float n(vec2 p) { return sin(p.x * 2.1 + uTime * 0.7) * sin(p.y * 1.7 - uTime * 0.5) + sin((p.x - p.y) * 3.3 + uTime) * 0.5; }
        void main() {
          // only sides that border solid ground get a rim, so neighbouring pit tiles read as one canyon
          float d = 1.0;
          if (vEdge.x > 0.5) d = min(d, vUv.x); if (vEdge.y > 0.5) d = min(d, 1.0 - vUv.x);
          if (vEdge.z > 0.5) d = min(d, 1.0 - vUv.y); if (vEdge.w > 0.5) d = min(d, vUv.y);
          float edge = smoothstep(0.0, 0.28, d);
          vec3 col;
          if (uLava > 0.5) { float f = n(vW.xz * 1.6) * 0.5 + 0.5; col = mix(vec3(1.0, 0.24, 0.02), vec3(1.0, 0.75, 0.2), f) * (1.25 + 0.25 * sin(uTime * 2.0 + vW.x)); col = mix(vec3(0.15, 0.05, 0.03), col, edge * 0.9 + 0.1); }
          else { col = mix(vec3(0.42, 0.27, 0.15), vec3(0.06, 0.04, 0.03), edge); }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }), W * H);
    this.pits.position.y = 0.006; s.add(this.pits);
    this.pitEdge = new THREE.InstancedBufferAttribute(new Float32Array(W * H * 4), 4);
    this.pits.geometry = flat.clone(); this.pits.geometry.setAttribute('aEdge', this.pitEdge);
    this.vents = new THREE.InstancedMesh(flat, new THREE.ShaderMaterial({
      uniforms: { uTime: this.lavaU.uTime },
      vertexShader: 'attribute float aK; varying vec2 vUv; varying float vK; void main() { vUv = uv; vK = aK; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vK;
        void main() { vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
          float crack = smoothstep(0.08, 0.0, abs(sin(atan(p.y, p.x) * 5.0) * r - 0.05)) * step(0.2, r);
          vec3 dark = vec3(0.12, 0.08, 0.08); vec3 hot = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.85, 0.3), vK);
          float glow = vK * (0.6 + 0.4 * sin(uTime * 14.0)) * (1.0 - r * 0.6);
          vec3 col = mix(dark, hot, max(crack * (0.35 + vK), glow));
          gl_FragColor = vec4(col * (1.0 + vK * 1.5), smoothstep(1.0, 0.85, r));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    }), 32);
    this.ventK = new THREE.InstancedBufferAttribute(new Float32Array(32), 1); this.ventK.setUsage(THREE.DynamicDrawUsage);
    this.vents.geometry = flat.clone(); this.vents.geometry.setAttribute('aK', this.ventK);
    this.vents.position.y = 0.008; s.add(this.vents);
    // decals: tread marks, scorch marks under wrecks and blasts
    this.treads = new Decals(s, 420, 'float e = smoothstep(0.0, 0.25, min(vUv.y, 1.0 - vUv.y)) * step(0.5, fract(vUv.x * 3.0)); gl_FragColor = vec4(vC, vA * e);');
    this.scorch = new Decals(s, 48, 'float r = length(vUv - 0.5) * 2.0; float n = 0.75 + 0.25 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 7.0 + r * 5.0); gl_FragColor = vec4(vC, vA * (1.0 - smoothstep(0.35, 1.0, r)) * n);');
    // Pooled toy flashes, confetti and soft puffs; imported projectiles are prepared below.
    this.flames = new Particles(s, 160, this.geo.ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.smoke = new Particles(s, 320, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }));
    this.sparks = new Particles(s, 200, new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.mineLight = new Particles(s, 32, this.geo.ball, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.shadows = new Decals(s, 40, 'float r = length(vUv - .5) * 2.0; gl_FragColor = vec4(vC, vA * (1.0 - smoothstep(.2, 1.0, r)));');
    this.teamMarks = new Decals(s, 1, 'float r = length(vUv - .5) * 2.0; gl_FragColor = vec4(vC, vA * smoothstep(.72,.78,r) * (1.0-smoothstep(.9,.97,r)));');
  }

  async prepare(session) {
    await this.postAA?.lookupReady;
    const epoch=++this.prepareEpoch;
    const art=new BounceArt();let tabletop;
    try {
      await art.prepare(session);
      const [shell,mine,crate]=await Promise.all(['RUBBER_SHELL','TOURNAMENT_MINE','FERNSTONE_CACHE'].map(id=>art.library.template(id,'lo')));
      tabletop=await TabletopWorld.create(art.library,session.L.world,this.env);
      if(this.disposed||epoch!==this.prepareEpoch)throw new Error('Bounce preparation superseded');
      this.clearAssets();this.art=art;this.tabletop=tabletop;this.scene.add(tabletop.root);
      this.shellBatch=new ToyInstances(shell,this.scene,96);this.mineBatch=new ToyInstances(mine,this.scene,32);this.crateBatch=new ToyInstances(crate,this.scene,W*H);
      this.session=this.prepared=session;this.rev=-1;this.themeKey=null;
      const ringKey=Profile.profile().cosmetics?.equipped?.['tournament-ring']||'fern';
      this.ringColor=({fern:0x55b582,gold:0xe5bc55,sky:0x6ab9dc,violet:0xae89ce})[ringKey]??0x55b582;
      session.tournamentRingColor='#'+this.ringColor.toString(16).padStart(6,'0');
      session.visualMuzzle=(tk,angle)=>{
        const actor=this.art.actor(tk,this.scene),v=actor.muzzle(tk,angle,session);
        const x=v.x+W/2,y=v.z+H/2;
        // Never cosmetically launch through a wall or across another tank. The
        // unchanged simulation still decides the launch collision and every hit.
        const d=Math.hypot(x-tk.x,y-tk.y),steps=Math.max(1,Math.ceil(d/.06));
        for(let i=1;i<=steps;i++){const xx=tk.x+(x-tk.x)*i/steps,yy=tk.y+(y-tk.y)*i/steps,t=session.tile(xx,yy);if(t===T.WALL||t===T.CRATE)return null;}
        return {x:v.x,y:v.y,z:v.z};
      };
      session.visualMine=tk=>{const actor=this.art.actor(tk,this.scene);actor.pose(tk,session);const node=actor.nodes.get('RearMineSocket');if(!node)return null;const v=node.getWorldPosition(new THREE.Vector3());const t=session.tile(v.x+W/2,v.z+H/2);return t===T.WALL||t===T.CRATE?null:{x:v.x,y:v.y,z:v.z};};
      for(const tk of session.tanks){const actor=art.actor(tk,this.scene);applyIbl(actor.root,this.env,.7);actor.pose(tk,session);}
      applyIbl(this.scene,this.env,.65);
      this.setTheme(session,false);this.layout(session);this.rev=session.rev;
    } catch(error) {if(this.art!==art){tabletop?.dispose();art.dispose();}else this.clearAssets();throw error;}
  }

  clearAssets(){
    if(this.session){delete this.session.visualMuzzle;delete this.session.visualMine;}
    this.tabletop?.dispose();this.tabletop=null;
    this.shellBatch?.dispose();this.mineBatch?.dispose();this.crateBatch?.dispose();
    this.shellBatch=this.mineBatch=this.crateBatch=null;
    this.art?.dispose();this.art=null;this.prepared=null;
  }

  setTheme(sess, dark) {
    const key = sess.L.world + (dark ? ':d' : '');
    if (key === this.themeKey) return;
    this.themeKey = key;
    const th = THEMES[sess.L.world];
    this.ground.material.map = texture(th.ground, { repeat: [28, 28] }); this.ground.material.color.set(0xffffff).multiplyScalar(0.92); this.ground.material.needsUpdate = true;
    const fog = new THREE.Color(th.fog); if (dark) fog.multiplyScalar(0.62);
    this.scene.background = fog; this.scene.fog = new THREE.Fog(fog, (this.camDist || 28) * 1.05, (this.camDist || 28) * 2.6);
    const L = this.lights;
    L.light.color.set(th.sun); L.hemi.color.set(th.sky); L.hemi.groundColor.set(th.hemiG);
    this.renderer.toneMappingExposure = th.exposure * (dark ? 0.88 : 1);
    this.walls.material.map = th.wallMap ? texture(th.wallMap, { repeat: [1, 1] }) : null;
    this.walls.material.color.set(th.wall);
    this.walls.material.roughness = th.glossyWall ? 0.18 : 0.62; this.walls.material.metalness = th.glossyWall ? 0.1 : 0.02;
    this.walls.material.needsUpdate = true;
    this.wallCaps.material.color.set(th.wall).offsetHSL(0, -0.05, 0.08);
    this.lavaU.uLava.value = th.lava ? 1 : 0;
    this.rev = -1; // repaint the floor in this world's look
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The static map: blocks, crates, ice, pits, vents (again whenever a crate breaks). */
  layout(sess) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    let nw = 0, ni = 0, np = 0;
    this.crateBatch.begin();
    const th = THEMES[sess.L.world];
    const rand = ((seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; })(sess.L.seed % 2147483646 + 1);
    const wall = (x, y, h = 0.82) => {
      const j = (rand() - 0.5) * 0.06;
      m.compose(p.set(x - W / 2 + 0.5, h / 2, y - H / 2 + 0.5), q.setFromAxisAngle(v3.set(0, 1, 0), j), sc.set(0.98, h, 0.98));
      this.walls.setMatrixAt(nw, m); this.walls.setColorAt(nw, c.set(0xffffff).multiplyScalar(0.9 + rand() * 0.16));
      m.compose(p.set(x - W / 2 + 0.5, h + 0.015, y - H / 2 + 0.5), q, sc.set(0.86, 0.04, 0.86));
      this.wallCaps.setMatrixAt(nw, m); this.wallCaps.setColorAt(nw, c.set(0xffffff));
      nw++;
    };
    for (let x = -1; x <= W; x++) { wall(x, -1, 1.0); wall(x, H, 0.62); }
    for (let y = 0; y < H; y++) { wall(-1, y, 0.9); wall(W, y, 0.9); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = sess.grid[y * W + x], cx = x - W / 2 + 0.5, cz = y - H / 2 + 0.5;
      if (t === T.WALL) wall(x, y);
      else if (t === T.CRATE) {
        m.compose(p.set(cx, 0, cz), q.setFromAxisAngle(v3.set(0, 1, 0), (rand() - 0.5) * 0.12), sc.setScalar(.56));
        this.crateBatch.add(m); rand();
      } else if (t === T.ICE) { m.compose(p.set(cx, 0.004, cz), q.identity(), sc.set(1, 1, 1)); this.ice.setMatrixAt(ni++, m); }
      else if (t === T.PIT) {
        m.compose(p.set(cx, 0, cz), q.identity(), sc.set(1, 1, 1));
        const open = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H || sess.grid[yy * W + xx] !== T.PIT ? 1 : 0);
        this.pitEdge.setXYZW(np, open(x - 1, y), open(x + 1, y), open(x, y - 1), open(x, y + 1));
        this.pits.setMatrixAt(np++, m);
      }
    }
    this.walls.count = nw; this.wallCaps.count = nw; this.ice.count = ni; this.pits.count = np;
    for (const im of [this.walls, this.wallCaps, this.ice, this.pits]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.crateBatch.end();
    this.pitEdge.needsUpdate = true;
    this.vents.count = sess.vents.length;
    sess.vents.forEach((v, i) => { m.compose(p.set(v.x - W / 2 + 0.5, 0, v.y - H / 2 + 0.5), q.identity(), sc.set(0.96, 1, 0.96)); this.vents.setMatrixAt(i, m); });
    this.vents.instanceMatrix.needsUpdate = true;
    // ambient occlusion along the blocks, painted into the floor's light: a canvas of the arena
    const px = 48, cv = document.createElement('canvas'); cv.width = W * px; cv.height = H * px;
    const g = cv.getContext('2d');
    const base = new THREE.Color(th.floor), alt = new THREE.Color(th.floorAlt), hex = (c, k = 1) => `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
    const world = sess.L.world;
    g.fillStyle = hex(base); g.fillRect(0, 0, cv.width, cv.height);
    if (world === 0) {
      // a mown lawn: broad stripes, clover speckles
      for (let x = 0; x < W; x += 2) { g.fillStyle = hex(alt); g.fillRect(x * px, 0, px, cv.height); }
      for (let i = 0; i < 2600; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(40,90,20,.22)' : 'rgba(230,250,170,.22)'; g.fillRect(rand() * cv.width, rand() * cv.height, 2 + rand() * 3, 2 + rand() * 3); }
      for (let i = 0; i < 70; i++) { g.fillStyle = rand() < 0.7 ? 'rgba(255,255,255,.85)' : 'rgba(255,230,120,.9)'; g.beginPath(); g.arc(rand() * cv.width, rand() * cv.height, 2.2, 0, TAU); g.fill(); }
    } else if (world === 1) {
      // packed sand with wind ripples
      g.strokeStyle = hex(alt, 0.93); g.lineWidth = 3;
      for (let y = 6; y < cv.height; y += 14) { g.beginPath(); for (let x = 0; x <= cv.width; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 4); g.stroke(); }
      for (let i = 0; i < 1800; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(150,100,50,.18)' : 'rgba(255,240,200,.25)'; g.fillRect(rand() * cv.width, rand() * cv.height, 2, 2); }
    } else if (world === 2) {
      // packed snow with blue shadows and sparkle
      for (let i = 0; i < 160; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40); const x = rand() * cv.width, y = rand() * cv.height; g.save(); g.translate(x, y); gr.addColorStop(0, 'rgba(160,190,225,.18)'); gr.addColorStop(1, 'rgba(160,190,225,0)'); g.fillStyle = gr; g.fillRect(-40, -40, 80, 80); g.restore(); }
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(rand() * cv.width, rand() * cv.height, 1.5, 1.5); }
    } else {
      // basalt slabs with glowing seams
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = hex((x * 7 + y * 3) % 3 ? base : alt, 0.92 + rand() * 0.16); g.fillRect(x * px + 2, y * px + 2, px - 4, px - 4); }
      g.strokeStyle = 'rgba(255,110,30,.35)'; g.lineWidth = 2;
      for (let i = 0; i < 26; i++) { g.beginPath(); let x = rand() * cv.width, y = rand() * cv.height; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    }
    // a fine tile grid, so ricochet angles are easy to read
    g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1;
    for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, cv.height); g.stroke(); }
    for (let y = 1; y < H; y++) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(cv.width, y * px); g.stroke(); }
    g.filter = 'blur(10px)';
    g.fillStyle = 'rgba(0,0,0,.34)';
    for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
      const t = x < 0 || y < 0 || x >= W || y >= H ? T.WALL : sess.grid[y * W + x];
      if (t === T.WALL || t === T.CRATE) g.fillRect(x * px - 10, y * px - 6, px + 20, px + 20);
    }
    g.filter = 'none';
    if (this.floorTex) this.floorTex.dispose();
    this.floorTex = new THREE.CanvasTexture(cv); this.floorTex.colorSpace = THREE.SRGBColorSpace; this.floorTex.anisotropy = 4;
    this.floor.material.emissiveMap = null;
    this.floor.material.color.set(0xffffff);
    this.floor.material.map = this.floorTex;
    this.floor.material.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(LOW_GPU ? Math.min(1, dpr) : dpr); this.renderer.setSize(w, h, false);
    this.postAA?.resize(this.renderer);
    this.camera.aspect = w / h;
    this.portrait = h > w * 1.08;
    // Phones (a short side under 560 px) get a longer lens, so the far side of the arena is nearly as big as the near
    // side (bigger tiles, tanks and shells), and a steeper camera when upright, where height is plentiful.
    const compact = Math.min(w, h) < 560;
    this.compact = compact;
    this.camera.fov = compact ? 21 : 30;
    const tilt = compact && this.portrait ? 1.13 : 1.02, yaw = this.portrait ? -Math.PI / 2 : 0;
    // the free box the arena (with its border ring) must fit in, in px: under the HUD; upright phones keep a band for
    // the thumbs below the arena; sideways phones have the HUD in the margins, the thumbs beside the arena
    const sa = compact ? safeArea() : { t: 0, r: 0, b: 0, l: 0 };
    const ins = !compact ? { t: h * 0.07, b: h * 0.03, l: w * 0.015, r: w * 0.015 }
      : this.portrait ? { t: 62 + sa.t, b: Math.max(116, h * 0.16) + sa.b, l: 6 + sa.l, r: 6 + sa.r }
        : { t: 8 + sa.t, b: 6 + sa.b, l: SIDE_MARGIN + sa.l, r: SIDE_MARGIN + sa.r };
    const corners = [];
    for (const x of [-W / 2 - 1, W / 2 + 1]) for (const z of [-H / 2 - 1, H / 2 + 1]) for (const y of [0, 1]) corners.push(new THREE.Vector3(x, y, z));
    this.camera.clearViewOffset();
    const box = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const place = (d) => {
      this.camera.position.set(Math.sin(yaw) * Math.cos(tilt) * d, Math.sin(tilt) * d, Math.cos(yaw) * Math.cos(tilt) * d);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
      box.x0 = box.y0 = Infinity; box.x1 = box.y1 = -Infinity;
      for (const c of corners) {
        v3.copy(c).project(this.camera);
        const sx = (v3.x + 1) / 2 * w, sy = (1 - v3.y) / 2 * h;
        box.x0 = Math.min(box.x0, sx); box.x1 = Math.max(box.x1, sx); box.y0 = Math.min(box.y0, sy); box.y1 = Math.max(box.y1, sy);
      }
    };
    const aw = Math.max(40, w - ins.l - ins.r), ah = Math.max(40, h - ins.t - ins.b);
    let lo = 8, hi = 160;
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2; place(d);
      if (box.x1 - box.x0 <= aw && box.y1 - box.y0 <= ah) hi = d; else lo = d;
    }
    place(hi);
    // slide the picture (not the camera) so the arena sits in its box: centred, or at the top of it on upright phones
    const tx = ins.l + aw / 2, ty = compact && this.portrait ? ins.t + (box.y1 - box.y0) / 2 : ins.t + ah / 2;
    this.camera.setViewOffset(w, h, (box.x0 + box.x1) / 2 - tx, (box.y0 + box.y1) / 2 - ty, w, h);
    this.camera.updateProjectionMatrix();
    // shells are a few pixels on a phone: bigger there (the overlay adds a rim)
    this.shellK = compact ? 1.5 : 1;
    this.camDist = hi;
    if (this.scene.fog) { this.scene.fog.near = hi * 1.05; this.scene.fog.far = hi * 2.6; }
    this.lights.light.position.set(-7, 15, 9); this.lights.light.target.position.set(0, 0, 0);
    this.renderer.shadowMap.needsUpdate = true;
  }

  render(s, view) {
    if (this.prepared !== s) throw new Error('Bounce assets not prepared');
    this.setTheme(s, view.dark);
    if (this.rev !== s.rev) { this.rev = s.rev; this.layout(s); }
    this.time = view.time || this.time + 1 / 60;
    this.lavaU.uTime.value = this.time;
    for (let i = 0; i < s.vents.length; i++) this.ventK.array[i] = s.vents[i].state === 2 ? 1 : s.vents[i].k * 0.8;
    this.ventK.needsUpdate = true;
    this.drawTanks(s);
    this.drawShells(s);
    this.drawGround(s);
    this.drawFx(s);
    this.frame++; // Only static board pieces cast shadows; layout/resize/theme invalidate the map.
    this.renderer.info.reset();
    if(this.postAA)this.postAA.render(this.renderer,this.scene,this.camera);else this.renderer.render(this.scene,this.camera);
  }

  drawTanks(s) {
    this.shadows.begin();this.teamMarks.begin();
    for (const tk of s.tanks) {
      const actor=this.art.actor(tk,this.scene);if(!actor.lit){applyIbl(actor.root,this.env,.7);actor.lit=true;}actor.pose(tk,s);
      if(!actor.root.visible)continue;
      const anchor=actor.shadow?.getWorldPosition(v3)||v3.set(tk.x-W/2,0,tk.y-H/2);
      const opacity=tk.def?.ghost&&!s.ghostVisible(tk)?.035:.22;
      this.shadows.add(anchor.x,anchor.z,tk.r*3,tk.r*2.6,0,0x203f49,opacity,.012);
      if(tk.team===0&&tk.alive)this.teamMarks.add(tk.x-W/2,tk.y-H/2,1.12,1.12,0,this.ringColor,.8,.025);
    }
    this.shadows.end();this.teamMarks.end();
    this.tabletop.update(s.t,!!s.result?.won);
  }

  drawShells(s) {
    const m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
    this.flames.begin();this.mineLight.begin();this.shellBatch.begin();this.mineBatch.begin();
    for(const sh of s.shells){
      if(!sh.alive)continue;
      const a=Math.atan2(sh.vy,sh.vx),k=this.shellK||1;
      p.set(sh.x-W/2,.42,sh.y-H/2);
      if(sh.renderFrom&&sh.age<.055){
        const join=1-sh.age/.055,from=sh.renderFrom;
        // A cosmetic join is valid only while the whole short segment is clear.
        const steps=Math.max(1,Math.ceil(Math.hypot(from.x-p.x,from.z-p.z)/.06));let clear=true;
        for(let i=0;i<=steps;i++){const t=s.tile(W/2+from.x+(p.x-from.x)*i/steps,H/2+from.z+(p.z-from.z)*i/steps);if(t===T.WALL||t===T.CRATE){clear=false;break;}}
        if(clear)p.lerp(v3.set(from.x,from.y,from.z),join);
      }
      this.shellBatch.add(m.compose(p,q.setFromAxisAngle(up,Math.PI/2-a),sc.setScalar(1.6*k)));
      this.flames.add(p.x,p.y+.03,p.z,.06*k,sh.team===0?0xb8f1bd:0xffb486);
    }
    // The existing mortar warning owns the falling projectile; no second shot is spawned.
    for(const w of s.warn)if(w.kind==='shell'&&!w.done){const k=1-w.t/w.max;p.set(w.x-W/2,.18+(1-k)*6,w.y-H/2);this.shellBatch.add(m.compose(p,q.setFromAxisAngle(v3.set(1,0,0),Math.PI/2),sc.setScalar(2)));}
    this.shellBatch.end();
    for(const mi of s.mines){
      if(!mi.alive)continue;p.set(mi.x-W/2,.02,mi.y-H/2);
      if(mi.renderFrom&&mi.age<.15)p.lerp(v3.set(mi.renderFrom.x,mi.renderFrom.y,mi.renderFrom.z),1-mi.age/.15);
      this.mineBatch.add(m.compose(p,q.identity(),sc.setScalar(1.8)));
      const rate=mi.trig>=0?24:mi.fuse<2?12:3;
      if(Math.sin(this.time*rate)>0)this.mineLight.add(p.x,.3,p.z,.045,mi.trig>=0||mi.fuse<2?0xff8563:0xffedab);
    }
    this.mineBatch.end();this.mineLight.end();
    // Flash is sampled at the live authored muzzle, separate from physics.
    for(const tk of s.tanks)if(tk.alive&&s.t-tk.shotAt<.08){const actor=this.art.actor(tk,this.scene);const names=tk.boss==='klonk'?['MuzzleSocket_Left','MuzzleSocket_Center','MuzzleSocket_Right']:tk.boss==='mothership'?['MuzzleSocket_L','MuzzleSocket_R']:tk.type==='swarm'?[`MuzzleSocket_${(tk.shotSerial+2)%3+1}`]:['MuzzleSocket'];for(const name of names){const point=actor.socket(name,v3);this.flames.add(point.x,point.y,point.z,.1,0xffe5a4);}}
  }

  drawGround(s) {
    this.treads.begin();
    for(const mk of s.marks)this.treads.add(mk.x-W/2,mk.y-H/2,.56,.52,mk.ang,0x425c48,Math.min(.13,mk.life*.025));
    this.treads.end();this.scorch.begin();this.scorch.end();
  }

  drawFx(s) {
    this.smoke.begin(); this.sparks.begin();
    const t = this.time;
    for (const f of s.fx) {
      const k = f.t / f.max, x = f.x - W / 2, z = f.y - H / 2;
      if (f.kind === 'boom' || f.kind === 'blast') {
        const R = (f.r || 1) * (f.kind === 'blast' ? 1 : 0.8);
        // Harmless toy pop: coloured confetti and a short pale puff.
        if (k < 0.45) this.flames.add(x, 0.3 + k, z, R * (0.35 + k * 1.1), k < 0.2 ? 0xfff0bc : 0xa6e3cd);
        for (let i = 0; i < 8; i++) {
          const a = i * 0.785 + f.x, rr = R * (0.2 + k * 0.7);
          this.smoke.add(x + Math.cos(a) * rr, 0.25 + k * 1.6 + (i % 3) * 0.15, z + Math.sin(a) * rr, R * 0.22 * (0.6 + k), k < 0.25 ? 0xe6f4e6 : 0xdbe9e8, a);
        }
        if (k < 0.5) for (let i = 0; i < 10; i++) { const a = i * 0.63 + f.y, rr = R * k * 2.2; this.sparks.add(x + Math.cos(a) * rr, 0.3 + Math.sin(k * 3.1) * 0.6 * (i % 2 + 0.5), z + Math.sin(a) * rr, 0.05 * (1 - k), [0xe5bc55,0x6ab9dc,0xae89ce,0x55b582][i%4], a); }
      } else if (f.kind === 'puff') {
        for (let i = 0; i < 3; i++) this.smoke.add(x + (i - 1) * 0.08, 0.42 + k * 0.4, z, 0.08 + k * 0.1, 0xd8d2c8, i);
      } else if (f.kind === 'spark') {
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + f.x * 3, rr = 0.1 + k * 0.5; this.sparks.add(x + Math.cos(a) * rr, 0.45 + k * 0.2, z + Math.sin(a) * rr, 0.035 * (1 - k), 0xfff1a0, a); }
      } else if (f.kind === 'crate') {
        for (let i = 0; i < 8; i++) { const a = i * 0.79 + f.x, rr = 0.2 + k * 1.1; this.smoke.add(x + Math.cos(a) * rr, Math.max(0.05, 0.6 * Math.sin(k * 3.1)) , z + Math.sin(a) * rr, 0.09, THEMES[s.L.world].crate, a * 3 + k * 9); }
      }
    }
    // Toy lava bumpers send up bright game particles
    for (const v of s.vents) if (v.state === 2) for (let i = 0; i < 6; i++) { const ph = (t * 1.8 + i / 6) % 1; this.sparks.add(v.x - W / 2 + 0.5 + Math.sin(i * 2.1 + t) * 0.25, ph * 1.8, v.y - H / 2 + 0.5 + Math.cos(i * 1.7) * 0.25, 0.05 * (1 - ph), 0xffa13d, i + t); }
    this.smoke.end(); this.sparks.end(); this.flames.end();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.prepareEpoch++;this.clearAssets();
    const geos=new Set(),mats=new Set(),textures=new Set();
    this.scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.isInstancedMesh)o.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){mats.add(m);if(m.map&&m.map!==this.ground.material.map&&m.map!==this.walls.material.map)textures.add(m.map);}});
    for(const g of Object.values(this.geo))if(g?.isBufferGeometry)geos.add(g);
    for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const t of textures)t.dispose();
    this.lights.light.shadow.map?.dispose();this.env.dispose();this.postAA?.dispose();this.renderer.dispose();this.scene.clear();
  }

}

export const create = (canvas) => new Tanks3D(canvas);
