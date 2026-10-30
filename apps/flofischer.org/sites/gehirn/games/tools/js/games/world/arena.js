/** Native Fernworld gardens around a flat, fully walkable arena. Static geometry
 * is merged by 12m chunk/material; authored foliage and architecture stay intact.
 * Arena resources remain compatible with the renderer's two-entry arena LRU.
 */
import { THREE } from '../three-kit.js';
import { Batch, mtx, rng, createNoise } from './decor.js';
import { clipStoneSurface } from './arena-mesh.js';
import { SLAB_PAD, SLAB_PALETTE, slabGeometry, slabGround } from './arena-slab.js';
import { composeScenery, SCENE_MODELS } from './arena-scenes.js';
import { BIOMES, PLAZA_RADIUS, ringRadius, pathDistance, gardenCenters } from './arena-layout.js';

const SIZE=1024,TAU=Math.PI*2;
export async function buildArena({world=0,R=22,dark=false,low=false,library}){
 if(!library)throw Error('Arena requires the prepared Fernworld library');
 const theme=BIOMES[world],rand=rng(23+world*7+R),noise=createNoise(31+world),E=R+18,scale=SIZE/(2*E),px=x=>(x+E)*scale;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const g=canvas.getContext('2d');
 if(world===0){g.fillStyle='rgba(70,106,46,.16)';g.fillRect(0,0,SIZE,SIZE);}
 if(world===3){g.fillStyle='rgba(57,52,60,.40)';g.fillRect(0,0,SIZE,SIZE);}
 const patch=(x,z,r,color,alpha)=>{const gradient=g.createRadialGradient(px(x),px(z),0,px(x),px(z),r*scale);gradient.addColorStop(0,`rgba(${color},${alpha})`);gradient.addColorStop(1,`rgba(${color},0)`);g.fillStyle=gradient;g.fillRect(px(x-r),px(z-r),r*2*scale,r*2*scale);};
 // Broad soil/ground-cover variation is continuous under the native plants.
 // Fine detail remains in the repeating ground texture, not this 1024px mask.
 for(let k=0;k<180;k++)patch((rand()*2-1)*E,(rand()*2-1)*E,2+rand()*5,k%3?theme.shade:theme.light,.08+rand()*.13);
 const gardens=gardenCenters(R);
 for(const bed of gardens){patch(bed.x,bed.z,bed.radius*1.8,theme.shade,world===0?.24:.17);patch(bed.x+.35,bed.z-.4,bed.radius,theme.light,.15);}
 // Worn paths: four gently curved routes and a continuous garden circuit.
 const stroke=(width,alpha,draw)=>{g.strokeStyle=`rgba(${theme.path},${alpha})`;g.lineWidth=width*scale;g.lineCap='round';g.lineJoin='round';g.beginPath();draw();g.stroke();};
 for(const [width,alpha]of [[2.6,.13],[2.05,.23],[1.45,.48]]){
  stroke(width,alpha,()=>{for(let k=0;k<=160;k++){const a=k/160*TAU,r=ringRadius(a,R);g[k?'lineTo':'moveTo'](px(Math.cos(a)*r),px(Math.sin(a)*r));}});
  for(let side=0;side<4;side++)stroke(width,alpha,()=>{const a=.36+side*Math.PI/2;for(let k=0;k<=30;k++){const u=2.8+k/30*(R+.6),v=Math.sin(u*.28+side)*.33;g[k?'lineTo':'moveTo'](px(Math.cos(a)*u-Math.sin(a)*v),px(Math.sin(a)*u+Math.cos(a)*v));}});
 }
 const stone=new THREE.Color(theme.stone),groundStone=new THREE.Color(0x958d84).multiply(stone),rgb=`${Math.round(groundStone.r**(1/2.2)*255)},${Math.round(groundStone.g**(1/2.2)*255)},${Math.round(groundStone.b**(1/2.2)*255)}`;
 // The central place is bounded and set into nature, not paving to the horizon.
 const plaza=g.createRadialGradient(px(0),px(0),PLAZA_RADIUS*.93*scale,px(0),px(0),PLAZA_RADIUS*1.035*scale);plaza.addColorStop(0,`rgba(${rgb},.98)`);plaza.addColorStop(.6,`rgba(${rgb},.94)`);plaza.addColorStop(1,`rgba(${rgb},0)`);g.fillStyle=plaza;g.beginPath();g.arc(px(0),px(0),PLAZA_RADIUS*1.1*scale,0,TAU);g.fill();
 g.strokeStyle=`rgba(${rgb},.8)`;g.lineWidth=.18*scale;g.beginPath();g.arc(px(0),px(0),PLAZA_RADIUS*scale,0,TAU);g.stroke();
 // Hibern's wind-swept blue edges and Vulkara's cooled seams stay quiet. Only
 // real gameplay hazards use bright red/orange warning discs and fissures.
 if(world===2)for(let k=0;k<18;k++)patch((rand()*2-1)*(R+5),(rand()*2-1)*(R+5),1.4+rand()*2.3,'196,221,237',.15);
 if(world===3){g.strokeStyle='rgba(28,25,34,.22)';g.lineWidth=.06*scale;for(let k=0;k<16;k++){const a=k/16*TAU,r=7+rand()*R*.7;g.beginPath();g.moveTo(px(Math.cos(a)*r),px(Math.sin(a)*r));for(let j=0;j<5;j++)g.lineTo(px(Math.cos(a)*r+j*.45),px(Math.sin(a)*r+noise.n2(j,k)*.5));g.stroke();}}
 const overlay=new THREE.CanvasTexture(canvas);overlay.colorSpace=THREE.SRGBColorSpace;overlay.flipY=false;const glow=null;
 const group=new THREE.Group();group.name=theme.name;const chunks=new Map(),placements=[];
 const architectural=['fw_paving_stone','fw_wall_stone_arch','fw_pillar_carved','fw_railing_stone','fw_roof_gentle','fw_roof_ridge','fw_street_light_sporecell','fw_bench_oak'];
 const ids=[...new Set([...architectural,...theme.plants,...theme.edge])],models=new Map(await Promise.all(ids.map(async id=>[id,await library.model(id,'lo')])));
 const place=(id,x,y,z,angle=0,size=1,tint=0xffffff,role='border')=>{
  const key=Math.floor(x/12)+','+Math.floor(z/12);if(!chunks.has(key))chunks.set(key,{matte:new Batch(),gloss:new Batch(),glow:new Batch()});const chunk=chunks.get(key),matrix=mtx([x,y,z],[0,angle,0],size);
  for(const part of models.get(id)){
   if(role==='plaza'||role==='path'){const clipped=clipStoneSurface(part.geometry,matrix,{x:role==='plaza'?0:x,z:role==='plaza'?0:z,radius:role==='plaza'?3.65:.255,sides:role==='plaza'?48:9});chunk[part.mat].add(clipped,mtx(),tint);clipped.dispose();}
   else chunk[part.mat].add(part.geometry,matrix,tint);
  }
  placements.push({id,x,y,z,size,role});
 };
 // Authored bevelled stones define a compact practice plaza and irregular
 // stepping stones along the earth paths. Their real height stays below paws.
 const bounds=new THREE.Box3();for(const part of models.get('fw_paving_stone')){part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox);}const pavingSize=bounds.getSize(new THREE.Vector3()),cell=1.12,fit=[cell/pavingSize.x,.58,cell/pavingSize.z];
 for(let ix=-3;ix<=3;ix++)for(let iz=-3;iz<=3;iz++){const x=ix*cell,z=iz*cell;if(Math.hypot(x,z)>4.2)continue;place('fw_paving_stone',x,-.05,z,((ix+iz)&3)*Math.PI/2,fit,stone.clone().multiplyScalar(.96+rand()*.04),'plaza');}
 for(let k=0;k<48;k++){const a=k/48*TAU,r=ringRadius(a,R),size=.18+rand()*.055;place('fw_paving_stone',Math.cos(a)*r,-.052,Math.sin(a)*r,a,[size,.58,size],theme.stone,'path');}
 for(let side=0;side<4;side++)for(let k=0;k<9;k++){const a=.36+side*Math.PI/2,u=4.8+k*1.8,v=Math.sin(u*.28+side)*.33;place('fw_paving_stone',Math.cos(a)*u-Math.sin(a)*v,-.052,Math.sin(a)*u+Math.cos(a)*v,a,[.19,.58,.19],theme.stone,'path');}
 // The low fern-inlay marks the player's central meeting place; no prop or
 // invisible collider occupies the clear plaza or any route through the garden.
 const leaf=new THREE.Shape();leaf.moveTo(0,-.92);leaf.bezierCurveTo(.7,-.5,.72,.35,0,.97);leaf.bezierCurveTo(-.68,.34,-.6,-.55,0,-.92);const leafGeometry=new THREE.ShapeGeometry(leaf,12);leafGeometry.rotateX(-Math.PI/2);const leafMaterial=new THREE.MeshBasicMaterial({color:[0x5d9255,0xb18b50,0x729ead,0x7da89a][world]});const inlay=new THREE.Mesh(leafGeometry,leafMaterial);inlay.position.y=.0125;inlay.rotation.y=-.38;group.add(inlay);
 // Pale veins are flush stone inlay, merged into the existing material batch.
 const vein=new THREE.PlaneGeometry(.035,1);vein.rotateX(-Math.PI/2);const inlayBatch=chunks.get('0,0').matte,veinColor=[0xdbe8cf,0xf5e5c5,0xe0f2f5,0xc7d4ce][world];
 const stripe=(x1,z1,x2,z2)=>{const angle=-.38,c=Math.cos(angle),sn=Math.sin(angle),x=(x1+x2)/2,z=(z1+z2)/2;inlayBatch.add(vein,mtx([x*c+z*sn,.0145,-x*sn+z*c],[0,angle+Math.atan2(x2-x1,z2-z1),0],[1,1,Math.hypot(x2-x1,z2-z1)]),veinColor);};stripe(0,-.78,0,.82);for(let k=-2;k<=2;k++)for(const side of [-1,1])stripe(0,k*.25,side*(.36-Math.abs(k)*.04),k*.25-.22);vein.dispose();
 // Low authored foliage lives in coherent beds, away from the clear plaza and
 // routes. All foliage inside the playable radius remains at most 0.34m high.
 const target=low?160:260,inner=low?108:180;
 for(let k=0;k<inner;k++){
  const bed=gardens[k%gardens.length],a=rand()*TAU,d=Math.sqrt(rand())*bed.radius,x=bed.x+Math.cos(a)*d,z=bed.z+Math.sin(a)*d;
  if(Math.hypot(x,z)<4.15||Math.hypot(x,z)>R-.8||pathDistance(x,z,R)<1.25)continue;
  const type=k%9===0?3:k%4===0?2:k%3===0?1:0,id=theme.plants[type];const modelBounds=new THREE.Box3();for(const part of models.get(id))modelBounds.union(part.geometry.boundingBox??(part.geometry.computeBoundingBox(),part.geometry.boundingBox));const height=modelBounds.max.y-modelBounds.min.y,desired=type===3?.25:type===2?.24:.16+rand()*.09,size=Math.min(1.05,desired/Math.max(.01,height));
  place(id,x,0,z,rand()*TAU,size,theme.tint,'groundcover');
 }
 // The slab: playfield disc, lip, layered cliff side and tip; scenery stands on its terrace, on islets and in the cloud sea.
 const S=R+SLAB_PAD,slab=SLAB_PALETTE[world],cloudTint=new THREE.Color(slab.cloud),disc=new THREE.CircleGeometry(1,20).rotateX(-Math.PI/2);
 const ground=slabGround(S,{seed:world+1}),rim=slabGeometry(world,S,{seed:world+1});
 const batchOf=(x,z)=>{const far=Math.hypot(x,z)>S+1,key=far?'far':Math.floor(x/12)+','+Math.floor(z/12);if(!chunks.has(key))chunks.set(key,{matte:new Batch(),gloss:new Batch(),glow:new Batch()});return chunks.get(key);};
 const sceneModels=new Map(await Promise.all(SCENE_MODELS.filter(id=>!models.has(id)).map(async id=>[id,await library.model(id,'lo')])));for(const [id,parts]of sceneModels)models.set(id,parts);
 const scene={R,S,rand,seed:world+1,cloudTint,
  place:(id,x,y,z,angle,size,tint=0xffffff)=>{const chunk=batchOf(x,z),matrix=mtx([x,y,z],[0,angle,0],size),colour=tint instanceof THREE.Color?tint:new THREE.Color(tint);for(const part of models.get(id))chunk[part.mat].add(part.geometry,matrix,colour);placements.push({id,x,y,z,size,role:'border'});},
  patch:(x,y,z,radius,colour)=>batchOf(x,z).matte.add(disc,mtx([x,y+.012,z],[0,rand()*6.28,0],[radius,1,radius*(.85+rand()*.3)]),colour),
  cover:(x,y,z,count,spread,size)=>{for(let k=0;k<count;k++){const a=rand()*TAU,d=Math.sqrt(rand())*spread,type=k%3,id=theme.plants[type],part=models.get(id);const box=new THREE.Box3();for(const p of part)box.union(p.geometry.boundingBox??(p.geometry.computeBoundingBox(),p.geometry.boundingBox));scene.place(id,x+Math.cos(a)*d,y,z+Math.sin(a)*d,rand()*TAU,Math.min(1.4,Math.max(.15,.2*size)/Math.max(.02,box.max.y-box.min.y)),theme.tint);}},
  islet:(isle)=>{const g=slabGeometry(world,isle.radius,{seed:isle.seed,segments:36,cap:true});batchOf(isle.x,isle.z).matte.add(g,mtx([isle.x,isle.y,isle.z]));g.dispose();}};
 composeScenery(world,scene);
 const materials={matte:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),gloss:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.08}),glow:new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false})};
 for(const material of Object.values(materials))material.userData.cheapIbl=true;
 for(const chunk of chunks.values())for(const [kind,batch]of Object.entries(chunk))if(!batch.empty){const mesh=new THREE.Mesh(batch.geometry(),materials[kind]);mesh.receiveShadow=true;group.add(mesh);}
 const rimMesh=new THREE.Mesh(rim,materials.matte);rimMesh.receiveShadow=true;group.add(rimMesh);
 disc.dispose();
 group.userData.arenaArt={world,name:theme.name,plazaRadius:PLAZA_RADIUS,playableRadius:R-.6,placements,groundcoverHeightLimit:.34};
 return{group,overlay,glow,ground,torches:[],ext:[-E,-E,1/(2*E)],dispose(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());ground.dispose();for(const material of Object.values(materials))material.dispose();leafMaterial.dispose();overlay.dispose();}};
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
