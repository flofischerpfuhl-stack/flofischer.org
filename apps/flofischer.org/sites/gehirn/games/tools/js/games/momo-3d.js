/** Fernling-Arena: selected authored Fernlings, gardens and living boss outcomes.
 * Simulation owns every damage body. Crowds use fixed baked-pose instance batches.
 * SMAA replaces low-DPR MSAA; high-DPR displays keep the existing direct path.
 */
import { createShading, shadeFromUrl } from './cel-shading.js';
import { THREE, studioEnvironment, applyIbl, createRenderer, texture, mat, addLights, Particles, BlobShadows, LOW_GPU } from './three-kit.js';
import { buildArena, overlayGround } from './world/arena.js';
import { paintedGround } from './world/arena-ground.js';
import { KINDS, WEAPONS } from './momo.js';
import { STARTERS, ENEMY_MODELS, BOSS_MODELS, moveEffect } from './fernling-canon.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { bakeCrowd, BakedCrowd } from '../../games-assets/fernworld/runtime/baked-crowd.js';
import { createEffectPool, createEffectInstances } from '../../games-assets/fernworld/effects.js';
import { followHeading, wrappedAngle, strideTime, releaseTime, castClip, castTrack, FREED_BREAK, FREED_ESCAPE } from './momo-motion.js';
import { SMAAPass } from '../../vendor/three-0.170.0/postprocessing/SMAAPass.js';
import { OutputPass } from '../../vendor/three-0.170.0/postprocessing/OutputPass.js';
const DAWN = new THREE.Color(0xffe2ac), WHITE = new THREE.Color(1,1,1), TAU=Math.PI*2;
// Explicit gameplay display scales preserve authored origin, anatomy and floor.
const PLAYER_SCALE={GLIMMO:1.8,COALBEAR:.85,EMBERWARD:.74,MOSSEL:2.65,MOORGRIM:1.02,GROVEPRINCE:.79,PLASHLING:3.6,SPRAYCOUNT:.95,TIDEDUKE:1.0};
const ENEMY_SCALE={GLIMMO:1.6,COALBEAR:1.1,EMBERWARD:.95,MOSSEL:2.3,MOORGRIM:.95,GROVEPRINCE:.72,PLASHLING:2.8,SPRAYCOUNT:.8,TIDEDUKE:.78,GUSTGLIDER:.58};

const THEMES=[
 {ground:'t-grass',tint:0xffffff,fog:0x78899d,sun:0xffe8ba,sky:0xbbd5ed,soil:0x3c5547},
 {ground:'t-sand',tint:0xd6bd99,fog:0xaa8e98,sun:0xffd5a2,sky:0xd8d7ef,soil:0x816047},
 {ground:'t-snow',tint:0xd4e4e8,fog:0x788da9,sun:0xe3efff,sky:0xbbd7ff,soil:0x667891},
 {ground:'t-lavarock',tint:0xa59692,fog:0x725a70,sun:0xffc498,sky:0xe2bfd1,soil:0x4d3242},
];
/** Ground decals (hazard warnings, storms): a flat quad per instance with colour, alpha and a fill progress. */
function decalMaterial(shape) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute float aAlpha; attribute float aProg; varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
      void main() { vUv = uv; vC = instanceColor; vA = aAlpha; vP = aProg; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: shape === 'disc'
      ? `varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
        void main() { float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
          float rim = smoothstep(0.84, 0.94, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float fill = (1.0 - smoothstep(vP - 0.04, vP, r)) * 0.5;
          gl_FragColor = vec4(vC, max(rim, fill + 0.16 * (1.0 - r * 0.5)) * vA); }`
      : shape === 'soft'
        ? `varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
          void main() { float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
            float n = 0.75 + 0.25 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 6.0 + r * 9.0 - vP * 3.0);
            gl_FragColor = vec4(vC, (1.0 - smoothstep(0.55, 1.0, r)) * n * vA); }`
        : `varying vec2 vUv; varying vec3 vC; varying float vA; varying float vP;
          void main() { float e = min(vUv.y, 1.0 - vUv.y); float rim = 1.0 - smoothstep(0.06, 0.16, e);
            float stripe = step(0.5, fract(vUv.x * 9.0 - abs(vUv.y - 0.5) * 2.0 - vP * 3.0)) * 0.22;
            float fill = (1.0 - smoothstep(vP - 0.02, vP, vUv.x)) * 0.5;
            float a = vP >= 0.999 ? 0.95 : max(rim * 0.9, fill + 0.12 + stripe);
            gl_FragColor = vec4(vC, a * vA); }`,
  });
}
class Decals {
  constructor(scene, max, shape) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.prog = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.prog.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha); geo.setAttribute('aProg', this.prog);
    this.mesh = new THREE.InstancedMesh(geo, decalMaterial(shape), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, WHITE);
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  /** x, z centre; sx along the rotation's x (length), sz across; rot about y. */
  add(x, z, sx, sz, rot, color, alpha, prog, y = 0.03) {
    if (this.n >= this.max) return;
    this._q.setFromAxisAngle(this._up, rot);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(color));
    this.alpha.array[this.n] = alpha; this.prog.array[this.n] = prog;
    this.n++;
  }
  end() { const m = this.mesh; m.count = this.n; m.visible = this.n > 0; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true; this.prog.needsUpdate = true; }
}

/** Plain instanced mesh with per-instance colour (shots, sparks, drones, beams). */
class Inst {
  constructor(scene, geo, material, max, { shadow = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = shadow;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, WHITE);
    scene.add(this.mesh);
    this.max = max; this.n = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sy, sz, rx, ry, rz, color = null) {
    if (this.n >= this.max) return;
    this._q.setFromEuler(this._e.set(rx, ry, rz));
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, this._m);
    if (color != null) this.mesh.setColorAt(this.n, this._c.set(color));
    this.n++;
  }
  /** A box stretched from (x1,y1,z1) to (x2,y2,z2) with thickness t. */
  seg(x1, y1, z1, x2, y2, z2, t, color) {
    if (this.n >= this.max) return;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, len = Math.hypot(dx, dy, dz) || 0.001;
    this._v.set(dx / len, dy / len, dz / len);
    this._q.setFromUnitVectors(Inst.X, this._v);
    this._m.compose(this._s.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), this._q, Inst.tmp.set(len, t, t));
    this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(color));
    this.n++;
  }
  end() { const m = this.mesh; m.count = this.n; m.visible = this.n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
Inst.X = new THREE.Vector3(1, 0, 0); Inst.tmp = new THREE.Vector3();

/** A spark: an elongated octahedron with baked facet shading (bright top, darker sides), self-lit. */
function facetGem() {
  const g = new THREE.OctahedronGeometry(0.17, 0); // polyhedra are already non-indexed
  g.scale(1, 1.5, 1);
  const P = g.attributes.position, col = new Float32Array(P.count * 3);
  for (let f = 0; f < P.count / 3; f++) {
    const y = (P.getY(f * 3) + P.getY(f * 3 + 1) + P.getY(f * 3 + 2)) / 3, x = (P.getX(f * 3) + P.getX(f * 3 + 1) + P.getX(f * 3 + 2)) / 3;
    const k = y > 0 ? (x > 0 ? 1.0 : 0.82) : (x > 0 ? 0.62 : 0.48);
    for (let v = 0; v < 3; v++) col.set([k, k, k], (f * 3 + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** Ice: pale blue with a few white cracks and streaks (drawn once). */
function iceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#e9f7ff'); gr.addColorStop(0.8, '#cdeaff'); gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
  let seed = 3; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9; i++) { let x = 128 + (r() - 0.5) * 120, y = 128 + (r() - 0.5) * 120; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 7;
  for (let i = 0; i < 4; i++) { const x = 40 + r() * 170; g.beginPath(); g.moveTo(x, 60 + r() * 40); g.lineTo(x + 40, 20 + r() * 30); g.stroke(); }
  g.strokeStyle = 'rgba(120,180,230,.8)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** The old low-DPR MSAA path is replaced by full-resolution SMAA. Following
 * Three r170's example, antialias HDR linear scene colour, then apply the
 * standard ACES/sRGB chunks at the end of SMAA's final blend (one output step). */
class MomoPostAA {
  constructor(){
    this.mode='SMAA 1x Medium / Three 0.170.0 / fused ACES+sRGB';
    this.meta={passes:['HDR scene','SMAA edges','SMAA weights','SMAA blend + ACES + sRGB'],toneMapping:'ACESFilmicToneMapping',colorSpace:'SRGBColorSpace',exposure:'renderer.toneMappingExposure',fullResolution:true};
    this.mainColorTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,samples:0});
    this.smaaPass=new SMAAPass(1,1);this.smaaPass.renderToScreen=true;
    const blend=this.smaaPass.materialBlend,statement='gl_FragColor = SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse );';
    if(!blend.fragmentShader.includes(statement))throw Error('Pinned SMAA blend contract changed');
    blend.fragmentShader=blend.fragmentShader.replace(statement,statement+'\n#include <tonemapping_fragment>\n#include <colorspace_fragment>');
    blend.toneMapped=true;blend.depthTest=false;blend.depthWrite=false;
    this.lookupReady=Promise.all([this.smaaPass.areaTexture,this.smaaPass.searchTexture].map(texture=>new Promise((resolve,reject)=>{
      const image=texture.image,done=()=>{texture.needsUpdate=true;resolve();};
      if(image.complete&&image.naturalWidth)done();else{image.addEventListener('load',done,{once:true});image.addEventListener('error',()=>reject(Error('SMAA lookup image failed')),{once:true});}
    })));
    this.size=new THREE.Vector2();
  }
  resize(renderer){
    renderer.getDrawingBufferSize(this.size);const {x:w,y:h}=this.size;
    this.mainColorTarget.setSize(w,h);this.smaaPass.setSize(w,h);
  }
  render(renderer,scene,camera){
    renderer.setRenderTarget(this.mainColorTarget);renderer.render(scene,camera);
    if(this.smaaPass.enabled)this.smaaPass.render(renderer,null,this.mainColorTarget);
    else{this.outputPass??=new OutputPass();this.outputPass.renderToScreen=true;this.outputPass.render(renderer,null,this.mainColorTarget);}
    renderer.setRenderTarget(null);
  }
  dispose(){this.mainColorTarget.dispose();this.smaaPass.dispose();this.outputPass?.dispose();}
}

/** Reorder only whole opaque triangles inside each existing material group.
 * Attribute arrays, triangle winding, material groups and exact vertices are
 * unchanged. Caller must supply an exclusively owned BufferGeometry clone.
 * Returns cache estimates. No native asset or shared source geometry is edited.
 */
function reorderOpaqueTriangles(geometry, cacheSize = 32) {
  if (!geometry.index) return { indexed: false };
  const original = geometry.index.array, output = original.slice();
  const ranges = geometry.groups.length ? geometry.groups : [{start:0,count:original.length}];
  const scoreAt = Float64Array.from({length:cacheSize},(_,i)=>i<3?.75:Math.pow(1-(i-3)/(cacheSize-3),1.5));
  for (const {start,count} of ranges) {
    if(start%3||count%3||start+count>original.length)throw Error('Triangle index range required');
    const n=count/3, emitted=new Uint8Array(n), stamp=new Int32Array(n), vertexCount=geometry.attributes.position.count;
    const adjacent=Array.from({length:vertexCount},()=>[]),live=new Int32Array(vertexCount),positions=new Int32Array(vertexCount).fill(-1),bonus=new Float64Array(vertexCount);
    for(let t=0;t<n;t++)for(let k=0;k<3;k++){const v=original[start+t*3+k];adjacent[v].push(t);live[v]++;}
    for(let v=0;v<vertexCount;v++)if(live[v])bonus[v]=2/Math.sqrt(live[v]);
    const cache=[];let next=0;
    const score=v=>(positions[v]<0?0:scoreAt[positions[v]])+bonus[v];
    for(let written=0;written<n;written++){
      let best=-1,bestScore=-Infinity;const mark=written+1;
      for(const v of cache)for(const t of adjacent[v]){
        if(emitted[t]||stamp[t]===mark)continue;stamp[t]=mark;
        const p=start+t*3,s=score(original[p])+score(original[p+1])+score(original[p+2]);
        if(s>bestScore||(s===bestScore&&t<best)){best=t;bestScore=s;}
      }
      if(best<0){while(emitted[next])next++;best=next;}
      emitted[best]=1;
      for(const v of cache)positions[v]=-1;
      for(let k=0;k<3;k++){
        const v=original[start+best*3+k];output[start+written*3+k]=v;
        live[v]--;bonus[v]=live[v]>0?2/Math.sqrt(live[v]):0;
        const at=cache.indexOf(v);if(at>=0)cache.splice(at,1);cache.unshift(v);
      }
      cache.length=Math.min(cacheSize,cache.length);
      for(let i=0;i<cache.length;i++)positions[cache[i]]=i;
    }
  }
  const estimate=(indices,size)=>{const cache=[];let misses=0;for(const v of indices){const at=cache.indexOf(v);if(at<0)misses++;else cache.splice(at,1);cache.unshift(v);if(cache.length>size)cache.pop();}return misses;};
  const stats={indexed:true,vertices:geometry.attributes.position.count,triangles:original.length/3,before:{},after:{}};
  for(const size of [16,24,32]){stats.before[size]=estimate(original,size);stats.after[size]=estimate(output,size);}
  // Exact triangle multiset and within-triangle winding are preserved by construction.
  geometry.index.array.set(output);geometry.index.needsUpdate=true;
  return stats;
}

/** Bounds of each actual sampled pose, in the same asset space as its bake.
 * Prepared once; a sphere enclosing the exact vertex AABB conservatively
 * rejects only actors whose complete current pose is outside the camera. */
function crowdPoseBounds(atlas){
  const bounds=Array.from({length:atlas.frames},()=>({min:new THREE.Vector3(Infinity,Infinity,Infinity),max:new THREE.Vector3(-Infinity,-Infinity,-Infinity)}));
  for(const part of atlas.parts){
    const g=part.source.geometry,P=g.attributes.position,I=g.attributes.skinIndex,W=g.attributes.skinWeight,bones=part.data;
    for(let f=0;f<atlas.frames;f++){
      const boundsAt=bounds[f],lo=boundsAt.min,hi=boundsAt.max;
      for(let v=0;v<P.count;v++){
        const x=P.getX(v),y=P.getY(v),z=P.getZ(v);let px=0,py=0,pz=0;
        for(let k=0;k<4;k++){
          const w=W.getComponent(v,k);if(w===0)continue;const b=(f*part.bones+I.getComponent(v,k))*16;
          px+=w*(bones[b]*x+bones[b+4]*y+bones[b+8]*z+bones[b+12]);
          py+=w*(bones[b+1]*x+bones[b+5]*y+bones[b+9]*z+bones[b+13]);
          pz+=w*(bones[b+2]*x+bones[b+6]*y+bones[b+10]*z+bones[b+14]);
        }
        lo.x=Math.min(lo.x,px);lo.y=Math.min(lo.y,py);lo.z=Math.min(lo.z,pz);hi.x=Math.max(hi.x,px);hi.y=Math.max(hi.y,py);hi.z=Math.max(hi.z,pz);
      }
    }
  }
  return bounds.map(({min,max})=>({center:min.clone().add(max).multiplyScalar(.5),radius:max.distanceTo(min)*.5+.03}));
}

/** Resolve the visible crowd surface before running its lit fragment shader.
 * Dense opaque crowds overlap heavily. The depth-only pass preserves their
 * exact geometry/material result while hidden fragments fail early depth.
 */
function crowdDepthPrepass(batch) {
  const depth=[];
  for(const source of batch.parts){
    const skin=source.customDepthMaterial,material=new THREE.MeshBasicMaterial({colorWrite:false,side:THREE.FrontSide});
    material.onBeforeCompile=skin.onBeforeCompile;material.customProgramCacheKey=()=>skin.customProgramCacheKey()+'momo-basic-prepass';
    const mesh=new THREE.InstancedMesh(source.geometry,material,batch.capacity);
    mesh.instanceMatrix=source.instanceMatrix;mesh.count=0;mesh.frustumCulled=false;
    mesh.renderOrder=-1;batch.root.add(mesh);depth.push(mesh);
  }
  const setCount=batch.setCount.bind(batch);batch.setCount=count=>{setCount(count);for(const mesh of depth){mesh.count=count;mesh.visible=count>0;}};
  const dispose=batch.dispose.bind(batch);batch.dispose=()=>{for(const mesh of depth){mesh.material.dispose();mesh.dispose();}dispose();};
}

export class Momo3D {
  constructor(canvas) {
    this.renderer=createRenderer(canvas,{antialias:false});this.postAA=!window.__noAA&&(window.devicePixelRatio||1)<1.5?new MomoPostAA():null;this.renderer.info.autoReset=false;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();this.env=studioEnvironment(this.renderer);const variant=shadeFromUrl();this.shading=variant?createShading(variant,{ambient:.7}):null;if(this.shading)this.env.userData.shading=this.shading;this.camera=new THREE.PerspectiveCamera(36,1,.5,220);
    this.w=1;this.h=1;this.frame=0;this.camDist=23;this.tilt=.98;this.camPos=new THREE.Vector3();this.camInit=false;this.disposed=false;
    this.M=new THREE.Matrix4();this.P=new THREE.Vector3();this.Q=new THREE.Quaternion();this.S=new THREE.Vector3();this.E=new THREE.Euler();this.delta=new THREE.Vector3();this.other=new THREE.Vector3();
    this.crowdFrustum=new THREE.Frustum();this.crowdProjection=new THREE.Matrix4();this.crowdSphere=new THREE.Sphere();
    this.owned=new THREE.Group();this.scene.add(this.owned);const root=this.owned;
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160).rotateX(-Math.PI/2),mat(0xffffff,{roughness:.95}));this.ground.material.userData.cheapIbl=true;this.ground.position.y=-.012;this.ground.receiveShadow=true;this.ground.renderOrder=1;root.add(this.ground);
    this.lights=addLights(this.scene,{shadowBox:15,mapSize:2048,dir:[-6,14,8]});this.lights.light.shadow.camera.far=60;
    this.rim=new THREE.Mesh(new THREE.RingGeometry(.993,1.007,128),new THREE.MeshBasicMaterial({color:0xb8d4bc,transparent:true,opacity:.5,depthWrite:false}));this.rim.rotation.x=-Math.PI/2;this.rim.position.y=.025;root.add(this.rim);
    this.blobs=new BlobShadows(root,355,.3);
    this.gemsM=new Inst(root,facetGem(),new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}),340);
    this.hazDisc=new Decals(root,40,'disc');this.hazLine=new Decals(root,40,'line');this.soft=new Decals(root,16,'soft');
    this.ice=new THREE.InstancedMesh(new THREE.CircleGeometry(1,40).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x8ccfff,map:iceTexture(),roughness:.05,metalness:.2,transparent:true,opacity:.92,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),12);this.ice.count=0;this.ice.receiveShadow=true;this.ice.frustumCulled=false;root.add(this.ice);
    this.sparks=new Particles(root,600);this.sparks.mesh.material.userData.cheapIbl=true;
    this.dust=new Particles(root,160,new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:0xe4c9a7,transparent:true,opacity:.6,depthWrite:false}));
    this.rings=Array.from({length:14},()=>{const r=new THREE.Mesh(new THREE.TorusGeometry(1,.045,4,40),new THREE.MeshBasicMaterial({color:0xc5a1eb,transparent:true,toneMapped:false,depthWrite:false}));r.rotation.x=-Math.PI/2;r.visible=false;root.add(r);return r;});
    // 200 player shots +90 hostile +12 traps +12 orbits +114 chain links =428.
    // A 512-slot fixed pool covers every damaging body; cosmetics are separate.
    this.primary=createEffectInstances(THREE,this.scene,{capacity:512});this.effects=createEffectPool(THREE,this.scene,{capacity:384});
    this.hex=new Inst(root,new THREE.TorusGeometry(1,.035,4,16).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,depthWrite:false}),280);
    applyIbl(root,this.env,.55);this.overlay=overlayGround(this.ground.material);
    const v=new THREE.Vector3(),out={x:0,y:0,s:1};this._proj=(x,y,h=0)=>{v.set(x,h,y).project(this.camera);const sx=(v.x+1)/2*this.w,sy=(1-v.y)/2*this.h;v.set(x+1,h,y).project(this.camera);out.s=Math.abs((v.x+1)/2*this.w-sx);out.x=sx;out.y=sy;return out;};
    const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3(),gp={x:0,y:0};
    this.groundAt=(x,y)=>{ndc.set(x/this.w*2-1,-y/this.h*2+1);ray.setFromCamera(ndc,this.camera);if(!ray.ray.intersectPlane(plane,hit))return null;gp.x=hit.x;gp.y=hit.z;return gp;};
  }
  projectFn(){return this._proj;}
  async prefetch(session,{signal}={}){
    const library=new ChannelLibrary();
    try {
      const models=STARTERS[session.starter].models.map(id=>({id,lod:'hero'}));
      const regional=ENEMY_MODELS[session.L.world];
      for(const kind of Object.keys(session.L.mix)){
        const id=regional[KINDS.indexOf(kind)];
        if(id)for(const lod of ['crowd','far'])models.push({id,lod});
      }
      await library.prefetch(models,{signal});
    } finally {library.dispose();}
  }
  async prepare(session,{onProgress,signal}={}){
    const prepareStarted=performance.now();
    if(this.disposed)throw Error('Fernling-Arena renderer disposed');
    await this.postAA?.lookupReady;
    // Keep only the current biome's resource family. Level/session IDs are not cache keys.
    if(this.assetWorld!==session.L.world){this.clearAssets();this.assetWorld=session.L.world;}
    if(!this.library){this.library=new ChannelLibrary();this.actors=[];this.actorCache=new Map();this.crowds=new Map();this.atlases=[];this.arenaCache=new Map();this.indexCacheStats=[];}
    this.library.setProgressListener(onProgress,signal);this.session=null;
    for(const a of this.actors){a.root.visible=false;a.mixer.stopAllAction();a.current=null;delete a.visualFace;delete a.gait;delete a.aimOffset;}
    for(const tiers of this.crowds.values())for(const t of tiers){t.n=0;t.batch.root.visible=false;}
    for(const arena of this.arenaCache.values())arena.group.removeFromParent();
    const stage=(name,extra={})=>{if(signal?.aborted)throw new DOMException('Loading cancelled','AbortError');onProgress?.({phase:'prepare',stage:name,done:false,...extra});};
    stage('Preparing Fernlings …');
    this.primary.clear();this.effects.clear();this.captureStamp=null;this.captureAnchor=new THREE.Vector3();this.camInit=false;this.lastTime=session.time;this.lastBossAttack=-1;
    try{
      const line=STARTERS[session.starter].models;
      this.players=await Promise.all(line.map(id=>this.actor(id,'hero',true)));
      for(const a of this.players)for(const name of ['Attack_Cast','Attack_Sweep','GroundPulse']){if(a.actions.has(name+'_Upper'))continue;const clip=a.actions.get(name).getClip().clone();clip.name=name+'_Upper';clip.tracks=clip.tracks.filter(t=>castTrack(t.name));a.actions.set(clip.name,a.mixer.clipAction(clip));}
      this.pedestal=await this.actor('KEEPER_PEDESTAL','lo',true);
      const kinds=new Set(Object.keys(session.L.mix));
      const summons={tank:['klonkbot'],drill:['zipper'],walker:['blorb','spitter'],mothership:['buzzbot','zorbling']}[session.L.boss]||[];
      for(const k of summons)kinds.add(k);if(session.L.world>=2)kinds.add('zorbling');
      this.kindModels=ENEMY_MODELS[session.L.world];
      for(const kind of kinds){
        const id=this.kindModels[KINDS.indexOf(kind)];if(this.crowds.has(id))continue;
        stage('Preparing moves …');
        const tiers=[];this.crowds.set(id,tiers);
        for(const lod of ['crowd','far']){
          const source=await this.library.create(id,lod),fly=id==='GUSTGLIDER';
          // Yield between expensive authored atlas builds so Back/cancel and real stage text can paint.
          await new Promise(resolve=>setTimeout(resolve,0));stage('Preparing moves …',{phase:'bake'});const bakeStarted=performance.now();
          const clips=fly?['Idle_Glide','Flap','Dive_Attack','Hit_Recover','Freed']:['Idle','Locomotion','Attack_Cast','Hit_Recover','Freed'];
          // Baking gets an exclusive plain actor; only its resulting batch gets IBL.
          const atlas=bakeCrowd(source,{fps:24,clipNames:clips}),batch=new BakedCrowd(atlas,350);
          for(const mesh of batch.parts){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(materials.every(m=>!m.transparent&&m.depthWrite))this.indexCacheStats.push({id,lod,...reorderOpaqueTriangles(mesh.geometry)});}
          atlas.poseBounds=crowdPoseBounds(atlas);crowdDepthPrepass(batch);this.atlases.push(atlas);source.release();batch.root.traverse(o=>{if(o.material){o.material.userData.cheapIbl=true;if(o.material.emissiveMap&&o.material.emissive?.r===0&&o.material.emissive.g===0&&o.material.emissive.b===0){o.material.emissiveMap=null;o.material.needsUpdate=true;}}});
          applyIbl(batch.root,this.env,.55);this.scene.add(batch.root);tiers.push({batch,n:0});onProgress?.({phase:'bake',done:true,milliseconds:performance.now()-bakeStarted,id,lod});
        }
      }
      stage('Preparing the arena …');
      this.bossActor=session.L.boss?await this.actor(BOSS_MODELS[session.L.boss],'lo',true):null;
      this.serpent=session.L.boss==='drill'?await this.actor('MORWEN_SAND_SERPENT','lo',true):null;
      const arenaKey=`${session.R}:${LOW_GPU}`;
      let arena=this.arenaCache.get(arenaKey);
      if(!arena){arena=await buildArena({world:session.L.world,R:session.R,low:LOW_GPU,library:this.library});applyIbl(arena.group,this.env,.55);this.shading?.apply(arena.group,{outline:false,ink:true});}
      this.arenaCache.delete(arenaKey);this.arenaCache.set(arenaKey,arena);
      while(this.arenaCache.size>2){const key=this.arenaCache.keys().next().value;this.arenaCache.get(key).dispose();this.arenaCache.delete(key);}
      this.arena=arena;this.scene.add(arena.group);this.ground.geometry=arena.ground;
      // Cached batches outside this level remain hidden and have no stale instances.
      for(const kind of kinds){const tiers=this.crowds.get(this.kindModels[KINDS.indexOf(kind)]);if(tiers)for(const t of tiers)t.batch.root.visible=true;}
      this.pedestal.root.visible=!!session.gen;this.pedestal.root.scale.setScalar(1.2);
      const ov=this.overlay;ov.uOver.value=this.arena.overlay;ov.uOverExt.value.set(...this.arena.ext);ov.uGlowMap.value=this.arena.glow;ov.uGlowC.value.setRGB(...(this.arena.glow?[.8,.23,.08]:[0,0,0]));
      const theme=THEMES[session.L.world];this.ground.material.map=paintedGround(session.L.world);this.ground.material.color.set(0xffffff);this.ground.material.needsUpdate=true;
      this.scene.background=new THREE.Color(theme.fog);this.scene.fog=new THREE.Fog(theme.fog,26,62);this.lights.light.color.set(theme.sun);this.lights.light.intensity=2.4;this.lights.hemi.color.set(theme.sky);this.lights.hemi.groundColor.set(theme.soil);this.lights.hemi.intensity=1.1;this.renderer.toneMappingExposure=1.0;
      this.rim.scale.setScalar(session.R);this.ice.count=session.ice.length;this.ice.visible=this.ice.count>0;session.ice.forEach((p,i)=>{this.M.makeScale(p.r,1,p.r).setPosition(p.x,.015,p.y);this.ice.setMatrixAt(i,this.M)});this.ice.instanceMatrix.needsUpdate=true;
      stage('Preparing light and surfaces …',{phase:'compile'});const compileStarted=performance.now();
      this.session=session;this.renderer.shadowMap.needsUpdate=true;
      this.render(session,{dark:false,reduced:true});if(this.postAA)this.renderer.setRenderTarget(this.postAA.mainColorTarget);await this.renderer.compileAsync(this.scene,this.camera);this.renderer.setRenderTarget(null);onProgress?.({phase:'compile',done:true,milliseconds:performance.now()-compileStarted});this.library.setProgressListener(null);this.prepareMetrics={milliseconds:performance.now()-prepareStarted,cachedActors:this.actors.length,cachedCrowds:this.crowds.size,cachedArenas:this.arenaCache.size,aa:this.postAA?.mode??'DPR-native-no-MSAA'};
    }catch(error){this.clearAssets();throw error;}
  }
  async actor(id,lod,outline=false){
    const key=`${id}:${lod}`;if(this.actorCache.has(key))return this.actorCache.get(key);
    const a=await this.library.create(id,lod);a.root=new THREE.Group();a.root.name=id;a.root.add(a.scene);this.scene.add(a.root);a.root.visible=false;
    a.mixer=new THREE.AnimationMixer(a.scene);a.actions=new Map(a.animations.map(c=>[c.name,a.mixer.clipAction(c)]));a.current=null;
    a.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});applyIbl(a.scene,this.env,.55);if(outline)this.shading?.apply(a.scene,{outline:'skinned',all:true});this.actors.push(a);this.actorCache.set(key,a);return a;
  }
  pose(a,name,time,loop=true){
    const action=a.actions.get(name);if(!action)throw Error(`Missing animation ${a.id}/${name}`);
    if(a.current!==action){a.mixer.stopAllAction();action.reset();action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);action.clampWhenFinished=true;action.play();a.current=action;}
    action.paused=false;action.enabled=true;const duration=action.getClip().duration;action.time=loop?Math.max(0,time)%duration:Math.min(duration,Math.max(0,time));a.mixer.update(0);a.root.updateMatrixWorld(true);
  }
  resize(w,h,dpr){this.w=w;this.h=h;this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);this.postAA?.resize(this.renderer);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();const half=Math.tan(this.camera.fov*Math.PI/360);this.camDist=Math.min(40,Math.max(6.6*Math.sin(this.tilt)/half,(w>=h?6.6:4.6)/(half*this.camera.aspect)));}
  render(s,view){
    if(this.session!==s)return;
    this.renderer.info.reset();
    const dt=s.choice?0:Math.min(.1,Math.max(0,s.time-this.lastTime));this.lastTime=s.time;
    const tx=s.x+s.vx*.25,tz=s.y+s.vy*.2-.6;if(!this.camInit){this.camPos.set(tx,0,tz);this.camInit=true;}this.camPos.x+=(tx-this.camPos.x)*.12;this.camPos.z+=(tz-this.camPos.z)*.12;
    // near the rim the camera leans outward and pulls back a little, so the lip, cliff side and islets of the slab frame the field
    const reach=Math.hypot(this.camPos.x,this.camPos.z),lean=Math.min(1,Math.max(0,(reach-(s.R-9))/8));this.lean=(this.lean??0)+(lean-(this.lean??0))*.06;const push=this.lean*this.lean*(3-2*this.lean)*(2.2+1.6*Math.max(0,this.camPos.z)/Math.max(1,reach))/Math.max(1,reach);
    const shake=s.shake>0&&!view.reduced?s.shake*.35:0,sx=(Math.random()-.5)*shake+this.camPos.x*push,sz=(Math.random()-.5)*shake+this.camPos.z*push,d=this.camDist*(1+.16*this.lean);
    this.scene.fog.near=d+4;this.scene.fog.far=d+34;this.camera.position.set(this.camPos.x+sx,Math.sin(this.tilt)*d,this.camPos.z+Math.cos(this.tilt)*d+sz);this.camera.lookAt(this.camPos.x+sx,0,this.camPos.z+sz);this.camera.updateMatrixWorld();
    const light=this.lights.light;light.position.set(this.camPos.x-6,14,this.camPos.z+8);light.target.position.set(this.camPos.x,0,this.camPos.z);
    const dawn=s.result?.won?Math.min(1,(s.time-s.resultAt)/2):0;this.renderer.toneMappingExposure=1+.1*dawn;this.lights.light.color.set(THEMES[s.L.world].sun).lerp(DAWN,dawn*.35);
    this.motionDt=dt;this.drawPlayer(s);this.drawCrowds(s);this.drawBoss(s);this.drawMoves(s);this.drawGround(s);this.drawFx(s);
    this.sparks.mesh.visible=this.sparks.n>0;this.dust.mesh.visible=this.dust.n>0;
    for(let i=0;i<s.fxEvents.n;i++){const f=s.fxEvents.items[i];if(s.time-f.time>.25)continue;this.P.set(f.x,.08,f.y);this.delta.set(Math.sin(f.direction),0,Math.cos(f.direction));this.effects.emit(f.id,this.P,this.delta,f.scale);}s.fxEvents.n=0;this.effects.update(dt);
    if(this.frame++%2===0)this.renderer.shadowMap.needsUpdate=true;if(this.postAA)this.postAA.render(this.renderer,this.scene,this.camera);else this.renderer.render(this.scene,this.camera);
  }
  blendPose(a,layers){
    for(const action of a.actions.values())action.setEffectiveWeight(0);
    for(const [name,time,weight,loop=true] of layers){
      if(weight<=0)continue;const action=a.actions.get(name);if(!action)throw Error(`Missing animation ${a.id}/${name}`);
      action.enabled=true;action.paused=false;action.clampWhenFinished=true;action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);action.play();
      const duration=action.getClip().duration;action.time=loop?Math.max(0,time)%duration:Math.min(duration,Math.max(0,time));action.setEffectiveWeight(weight);
    }
    a.mixer.update(0);a.root.updateMatrixWorld(true);
  }
  drawPlayer(s){
    for(const actor of this.players)actor.root.visible=false;
    const a=this.players[s.stage],dt=this.motionDt;a.root.visible=true;a.root.position.set(s.x,.012,s.y);a.root.scale.setScalar(PLAYER_SCALE[s.model]);
    // Predict only the visual wind-up. The simulation still releases every move
    // at its original cooldown, position and logical aim, including combos.
    const age=s.time-s.castAt;let slot=s.castSlot,clock=releaseTime(s.model,slot)+age,attack=age>=0&&age<.42,predictive=false;
    let target=s.castFace;
    if(!attack&&!s.result){
      const next=s.weapons.filter(w=>w.id!=='drones'&&w.t>=0&&w.t<.16).sort((a,b)=>a.t-b.t)[0];
      if(next){const foe=s.nearest(s.x,s.y,12);if(foe||next.id==='mines'){slot=next.id;clock=releaseTime(s.model,slot)*(1-next.t/.16);attack=true;predictive=true;target=foe?Math.atan2(foe.x-s.x,foe.y-s.y):s.face;}}
    }
    const travel=Math.hypot(s.vx,s.vy),heading=travel>.35?Math.atan2(s.vx,s.vy):attack?target:s.face;
    a.visualFace=followHeading(a.visualFace??s.face,heading,dt,travel>.35?9:7);a.root.rotation.y=a.visualFace;
    a.gait=(a.gait??0)+(Math.min(1,s.moving*3)-(a.gait??0))*(1-Math.exp(-dt*16));
    const walkClip=a.actions.get('Locomotion').getClip(),walk=strideTime(s.model,s.walk,walkClip.duration),gait=a.gait;
    if(s.result&&!s.result.won)this.blendPose(a,[['Hit_Recover',Math.min(.62,s.time-s.resultAt),1,false]]);
    else{
      const envelope=attack?Math.min(1,Math.max(0,clock/releaseTime(s.model,slot)),predictive?1:Math.max(0,(.42-age)/.14)):0;
      this.blendPose(a,[['Idle',s.t,1-gait],['Locomotion',walk,gait],...(attack?[[castClip(slot)+'_Upper',clock,envelope*.82,false]]:[])]);
      // Gentle head tracking follows the separate shot direction without turning
      // the entire running body backwards or resetting its contact phase.
      const head=a.scene.getObjectByName('head');if(head&&attack){a.aimOffset=followHeading(a.aimOffset??0,Math.max(-.55,Math.min(.55,wrappedAngle(target-a.visualFace))),dt,4);head.quaternion.multiply(this.Q.setFromAxisAngle(UP,a.aimOffset));}
    }
    if(s.gen){this.pedestal.root.visible=true;this.pedestal.root.position.set(s.gen.x,0,s.gen.y);}
  }
  drawCrowds(s){
    this.crowdProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.crowdFrustum.setFromProjectionMatrix(this.crowdProjection);this.crowdCulled=0;
    for(const tiers of this.crowds.values())for(const t of tiers)t.n=0;this.blobs.begin();this.hex.begin();this.blobs.add(s.x,s.y,.57);this.hex.add(s.x,.025,s.y,.55,1,.55,0,0,0,0xa2e7ca);
    const put=(id,x,y,face,scale,clip,time,loop=true,transition=null)=>{const tiers=this.crowds.get(id);if(!tiers)throw Error(`Unprepared regional Fernling ${id}`);const far=(x-s.x)**2+(y-s.y)**2>144,t=tiers[far?1:0];this.M.compose(this.P.set(x,id==='GUSTGLIDER'?.4:.008,y),this.Q.setFromEuler(this.E.set(0,face,0)),this.S.setScalar(scale));const bounds=t.batch.atlas.poseBounds[t.batch.frame(clip,time,loop)];this.crowdSphere.center.copy(bounds.center).applyMatrix4(this.M);this.crowdSphere.radius=bounds.radius*scale;if(transition?.blend>0){const other=t.batch.atlas.poseBounds[t.batch.frame(transition.next,transition.nextTime,false)];this.other.copy(other.center).applyMatrix4(this.M);this.crowdSphere.radius=Math.max(this.crowdSphere.radius,other.radius*scale+this.other.distanceTo(this.crowdSphere.center));}if(!this.crowdFrustum.intersectsSphere(this.crowdSphere)){this.crowdCulled++;return false;}if(t.n>=350)throw Error('Fernling crowd capacity');t.batch.setMatrix(t.n,this.M);t.batch.setPose(t.n,clip,time,{...transition,loop});t.n++;return true;};
    // Instanced opaque draws keep their input order. Draw nearer actors first
    // so overlapping crowd surfaces can fail the GPU's early depth test.
    const order=this.crowdOrder??(this.crowdOrder=[]);order.length=0;
    for(let i=0;i<s.en.n;i++)if(!s.en.items[i].dead&&!s.en.items[i].boss)order.push(i);
    order.sort((a,b)=>s.en.items[b].y-s.en.items[a].y);
    for(const i of order){
      const e=s.en.items[i];const id=this.kindModels[e.kind],fly=id==='GUSTGLIDER',scale=ENEMY_SCALE[id]*e.scale;
      const locomotion=fly?'Flap':e.moving>.05?'Locomotion':'Idle',tiers=this.crowds.get(id),duration=tiers[0].batch.clipByName.get(locomotion).duration;
      const time=fly?s.t:locomotion==='Idle'?s.t:strideTime(id,e.stride,duration,e.scale),hitAge=s.time-e.hitAt,castAge=s.time-e.castAt;
      let transition=null;
      if(hitAge<.38)transition={next:'Hit_Recover',nextTime:hitAge,nextLoop:false,blend:Math.max(0,Math.min(1,hitAge/.06,(.38-hitAge)/.14))};
      else if(e.charge>.05)transition={next:fly?'Dive_Attack':'Attack_Cast',nextTime:e.charge*.475,nextLoop:false,blend:Math.min(1,e.charge*4)*(e.moving>.05?.65:1)};
      else if(castAge<.35)transition={next:fly?'Dive_Attack':'Attack_Cast',nextTime:.475+castAge,nextLoop:false,blend:Math.max(0,(.35-castAge)/.35)*(e.moving>.05?.65:1)};
      const visible=put(id,e.x,e.y,e.face,scale,locomotion,time,true,transition);if(visible)this.blobs.add(e.x,e.y,e.r*1.18);
      if(visible)this.hex.add(e.x,.25,e.y,e.r*1.12,1,e.r*1.12,0,s.t*.7+e.phase,0,e.elite?0xcdb071:0xa384da);
    }
    for(let i=0;i<s.freed.n;i++){
      const f=s.freed.items[i],id=this.kindModels[f.kind],fly=id==='GUSTGLIDER',escape=f.age>=FREED_ESCAPE,clip=escape?(fly?'Flap':'Locomotion'):'Freed';
      const duration=this.crowds.get(id)[0].batch.clipByName.get(clip).duration;
      f.visible=put(id,f.x,f.y,f.face,ENEMY_SCALE[id]*f.scale,clip,escape?(fly?f.age:strideTime(id,f.stride,duration,f.scale)):f.age,escape);if(f.visible)this.blobs.add(f.x,f.y,.4*f.scale);
      if(f.visible&&f.age<FREED_BREAK)this.hex.add(f.x,.25,f.y,.5*f.scale,1,.5*f.scale,0,s.t*.7,0,0xc2a3e8);
    }
    // Victory releases use the existing enemy slots, avoiding both a full
    // secondary crowd allocation and the old 70-creature truncation.
    if(s.result?.won)for(let i=0;i<s.en.n;i++){
      const e=s.en.items[i];if(e.freedAt<0||e.boss)continue;
      const id=this.kindModels[e.kind],age=s.time-e.freedAt,travel=Math.max(0,age-FREED_ESCAPE)*4.6,face=Math.atan2(e.x,e.y),x=e.x+Math.sin(face)*travel,y=e.y+Math.cos(face)*travel;
      const clip=age<FREED_ESCAPE?'Freed':id==='GUSTGLIDER'?'Flap':'Locomotion',duration=this.crowds.get(id)[0].batch.clipByName.get(clip).duration;
      put(id,x,y,followHeading(e.face,face,Math.min(age,1),5),ENEMY_SCALE[id]*e.scale,clip,age<FREED_ESCAPE?age:strideTime(id,travel,duration,e.scale),age>=FREED_ESCAPE);this.blobs.add(x,y,e.r);
      if(age<FREED_BREAK)this.hex.add(x,.25,y,e.r,1,e.r,0,s.t*.7,0,0xc2a3e8);
    }
    for(const tiers of this.crowds.values())for(const t of tiers){t.batch.setCount(t.n);t.batch.flush();}this.hex.end();this.blobs.end();
  }
  drawBoss(s){
    const b=s.boss,a=this.bossActor;if(!a)return;a.root.visible=!!b;if(this.serpent)this.serpent.root.visible=!!b;if(!b)return;
    const elapsed=b.dead?s.time-b.defeatedAt:0,kind=s.L.boss,sc={tank:1.15,drill:1.6,walker:1.65,mothership:1.4}[kind];
    a.root.position.set(b.x,0,b.y);a.root.rotation.y=b.face;a.root.scale.setScalar(sc);
    if(kind==='drill'){
      const serpent=this.serpent;serpent.root.position.set(b.x,0,b.y);serpent.root.rotation.y=b.face;serpent.root.scale.setScalar(sc);
      if(b.dead){
        this.pose(serpent,elapsed<2?'Idle_Coil':'Freed',elapsed<2?0:elapsed-2,false);
        this.pose(a,elapsed<2?'Dismount':'Surrender_Captured',elapsed<2?elapsed:elapsed-2,false);
        if(this.captureStamp!==b.defeatedAt){serpent.root.updateMatrixWorld(true);serpent.scene.getObjectByName('DismountAnchor').getWorldPosition(this.captureAnchor);this.captureAnchor.y=0;this.captureStamp=b.defeatedAt;}
        const progress=Math.min(1,Math.max(0,(elapsed/2-.35)/.4)),k=progress*progress*(3-2*progress);
        a.root.position.lerp(this.captureAnchor,k);
        if(elapsed>2){this.delta.set(0,0,(elapsed-2)*.9*sc).applyAxisAngle(UP,b.face);serpent.root.position.add(this.delta);}
      }else{
        const casting=b.state==='aim'||b.state==='charge'||b.state==='cast',clock=casting?(b.state==='charge'?b.ct+b.st:b.st):s.t;
        if(casting){this.pose(a,'Ride_Cast',clock,false);this.pose(serpent,clock<.9166667?'Bite_Tell':'Bite_Strike',clock<.9166667?clock:clock-.9166667,false);}
        else{this.pose(a,'Idle_Riding',clock);this.pose(serpent,'Slither',clock);}
        // Use the live sockets at the SAME absolute clock, not a spine parent.
        a.root.updateMatrixWorld(true);serpent.root.updateMatrixWorld(true);serpent.scene.getObjectByName('MountSocket').getWorldPosition(this.delta);a.scene.getObjectByName('ReiterMount').getWorldPosition(this.other);a.root.position.add(this.delta.sub(this.other));
        if(b.hidden){const k=Math.min(1,b.st/.25);a.root.position.y-=k*3.6;serpent.root.position.y-=k*3.6;}
      }
    }else if(b.dead)this.pose(a,{tank:'Disabled',walker:'Surrender_Captured',mothership:'Stabilized'}[kind],elapsed,false);
    else{
      let clip={tank:'Travel',walker:'Walk',mothership:'Heavy_Locomotion'}[kind],time=s.t*.9;
      if(b.state!=='walk'){clip=kind==='tank'?(b.state==='cast'?'Attack_RootCast':'Attack_Sweep'):kind==='walker'?(b.attack%2?'GroundFrost':'FrostCast_Left'):(b.state==='cast'?'Spark_Charge':'Sweep');time=b.st;}
      // The preserved ring spawns at cast start. Anticipate the palm wind-up
      // during the last .8s of walking; ground frost releases at its real warning.
      const frostRelease=b.attack%2?(b.phase2?.95:1.15):0;
      if(kind==='walker'){
        if(b.state==='walk'&&(b.attack+1)%2===0&&b.next<.8){clip='FrostCast_Left';time=.8-Math.max(0,b.next);}
        else if(b.state==='cast')time=b.attack%2?b.st*.8/frostRelease:.8+b.st;
      }
      this.pose(a,clip,time,!['cast','aim','charge'].includes(b.state)&&clip!=='FrostCast_Left');
      if(kind==='walker'&&b.state==='cast'&&b.st>=frostRelease&&this.lastBossAttack!==b.attack){this.lastBossAttack=b.attack;a.root.updateMatrixWorld(true);const socket=a.scene.getObjectByName(b.attack%2?'ground':'frost_palm_l');socket.getWorldPosition(this.P);if(b.attack%2)this.P.y=.025;this.delta.set(Math.sin(b.face),0,Math.cos(b.face));this.effects.emit(b.attack%2?'frost_trap':'frost_burst',this.P,this.delta,1.5);}
    }
  }
  drawMoves(s){
    const primary=this.primary;primary.begin();
    const add=(id,x,height,z,angle,sx,sy=sx,sz=sx,alpha=1)=>{this.M.compose(this.P.set(x,height,z),this.Q.setFromEuler(this.E.set(0,angle,0)),this.S.set(sx,sy,sz));if(!primary.add(id,this.M,alpha)&&alpha>=.015)throw Error('Damage-effect pool exhausted');};
    for(let i=0;i<s.shots.n;i++){const p=s.shots.items[i],scale=p.kind?p.r*.8:p.r*1.45;add(p.move,p.x,.6,p.y,p.kind?p.spin:Math.atan2(p.vx,p.vy),scale);}
    for(const w of s.weapons)if(!s.result&&w.id==='drones'){const i=s.wi(w),n=WEAPONS.drones.n[i],r=WEAPONS.drones.rad[i];for(let k=0;k<n;k++){const angle=w.phase+k/n*TAU;add(moveEffect(w),s.x+Math.cos(angle)*r,.65,s.y+Math.sin(angle)*r,-angle,.34);}}
    for(let i=0;i<s.mines.n;i++){const m=s.mines.items[i];add(m.move,m.x,.04,m.y,0,.46,m.arm>0?.35:.6,.46);}
    for(let i=0;i<s.bolts.n;i++){const b=s.bolts.items[i],bounds=primary.describe(b.move);for(let k=0;k+1<b.n;k++){const x=b.pts[k*2],z=b.pts[k*2+1],dx=b.pts[k*2+2]-x,dz=b.pts[k*2+3]-z,len=Math.hypot(dx,dz);if(len<.001)continue;const angle=Math.atan2(dx,dz),sz=len/bounds.size[2],center=(bounds.min[2]+bounds.max[2])*.5*sz;add(b.move,x+dx*.5-Math.sin(angle)*center,b.nature==='green'?.05:.42,z+dz*.5-Math.cos(angle)*center,angle,.32,.45,sz,Math.min(1,b.life/.12));}}
    for(let i=0;i<s.foeShots.n;i++){const p=s.foeShots.items[i];add(p.kind?'frost_shot':'bubble_shot',p.x,.55,p.y,Math.atan2(p.vx,p.vy),p.r*1.3);}
    primary.flush();this.gemsM.begin();for(let i=0;i<s.gems.n;i++){const g=s.gems.items[i],v=g.kind?1.9:g.v>4?1.4:1;this.gemsM.add(g.x,.3+Math.sin(s.time*4+g.bob)*.06,g.y,v,v*1.4,v,.3,s.time*2+g.bob,.2,g.kind===1?0xefaa9d:g.kind===2?0xa0e2dd:g.kind===3?0xffde83:0xc0a3eb);}this.gemsM.end();
  }
  drawGround(s) {
    const hd = this.hazDisc, hl = this.hazLine, so = this.soft;
    hd.begin(); hl.begin(); so.begin();
    for (let i = 0; i < s.haz.n; i++) {
      const h = s.haz.items[i];
      const prog = h.warn > 0 ? 1 - h.warn / h.warnMax : 1;
      const lava = h.src === 0;
      const color = h.warn > 0 ? (lava ? 0xff6a1f : 0xff3b3b) : (lava ? 0xffc04a : 0xffe08a);
      const alpha = h.warn > 0 ? 0.55 + 0.3 * Math.abs(Math.sin(s.time * (6 + prog * 10))) : 0.95;
      if (h.kind === 0) hd.add(h.x, h.y, h.r * 2, h.r * 2, 0, color, alpha, h.warn > 0 ? prog : 1);
      else {
        const dx = h.x2 - h.x, dz = h.y2 - h.y, len = Math.hypot(dx, dz);
        hl.add((h.x + h.x2) / 2, (h.y + h.y2) / 2, len, h.r, -Math.atan2(dz, dx), color, alpha, h.warn > 0 ? prog : 1);
      }
    }
    if(s.boss?.hidden)so.add(s.boss.cx,s.boss.cy,4.2,4.2,0,0xc59b73,.8,s.boss.st);
    // sand storms: a swirling dust disc
    for (const st of s.storms) so.add(st.x, st.y, st.r * 2.2, st.r * 2.2, st.spin * 0.8, 0xc8925a, 0.9, s.time, 0.05);
    hd.end(); hl.end(); so.end();
    const du = this.dust; du.begin();
    for (let k = 0; k < s.storms.length; k++) {
      const st = s.storms[k];
      for (let i = 0; i < 52; i++) {
        const a = st.spin * (1.8 + (i % 3) * 0.4) + i * 2.399, r = st.r * Math.sqrt(((i * 0.618) % 1)) * 0.95;
        du.add(st.x + Math.cos(a) * r, 0.2 + ((i * 0.37 + s.time * 0.3) % 1) * 2.2, st.y + Math.sin(a) * r, 0.07 + (i % 4) * 0.03, i % 3 ? 0xe9c38c : 0xb07a48, a);
      }
    }
    du.end();
  }

  drawFx(s) {
    const sp = this.sparks; sp.begin();
    const P = s.parts.items;
    for (let i = 0; i < s.parts.n; i++) {
      const p = P[i], life = Math.min(1, (p.life / p.max) * 2);
      sp.add(p.x, p.h + 0.05, p.y, Math.max(0.02, p.size * 1.4 * life), p.color, p.life * 7);
    }
    sp.end();
    for (const r of this.rings) r.visible = false;
    const G = s.rings.items;
    for (let i = 0; i < s.rings.n && i < this.rings.length; i++) {
      const g = G[i], r = this.rings[i], q = 1 - g.life / g.max;
      r.visible = true; r.position.set(g.x, 0.15, g.y); r.scale.setScalar(Math.max(0.01, g.r * (0.3 + 0.7 * q))); r.material.opacity = 1 - q; r.material.color.set(g.color);
    }
  }
  clearAssets(){
    if(this.arenaCache)for(const arena of this.arenaCache.values())arena.dispose();
    this.arenaCache=new Map();this.arena=null;
    if(this.crowds)for(const tiers of this.crowds.values())for(const t of tiers)t.batch.dispose();
    if(this.atlases)for(const atlas of this.atlases)atlas.dispose();
    if(this.actors)for(const a of this.actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.scene);a.root.removeFromParent();a.release();}
    this.library?.dispose();this.library=null;this.actors=[];this.actorCache=new Map();this.atlases=[];this.crowds=new Map();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.clearAssets();this.primary.dispose();this.effects.dispose();
    const geometries=new Set(),materials=new Set(),textures=new Set();this.owned.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)o.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);if(m.map&&o!==this.ground)textures.add(m.map);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();this.postAA?.dispose();this.shading?.dispose();this.env.dispose();this.lights.light.shadow.map?.dispose();this.renderer.dispose();
  }
}
const UP=new THREE.Vector3(0,1,0);
export const create=canvas=>new Momo3D(canvas);

function readyTexture(map){
  if(map.image?.complete)return Promise.resolve();
  return new Promise((resolve,reject)=>{const done=()=>{if(!map.image?.complete)return;clearTimeout(timer);window.removeEventListener('fw-games-texture',done);resolve();};const timer=setTimeout(()=>{window.removeEventListener('fw-games-texture',done);reject(new Error('Courtyard ground texture did not load'));},15000);window.addEventListener('fw-games-texture',done);done();});
}
