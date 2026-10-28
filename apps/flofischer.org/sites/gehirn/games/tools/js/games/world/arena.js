/** Reviewed Fernworld stone, architecture and vegetation, merged in 12m chunks.
 * The playable abbey courtyard stays open; each region has its own edge flora.
 * Async buildArena requires a prepared ChannelLibrary and owns its merged output.
 */
import { THREE } from '../three-kit.js';
import { Batch, mtx, rng } from './decor.js';


const SIZE = 1024;

export async function buildArena({ world = 0, R = 22, dark = false, low = false, library }) {
  const rand = rng(23 + world * 7 + R);
  const E = R + 18, scale = SIZE / (2 * E);
  const px = (x) => (x + E) * scale;
  // A subtle worn-ground mask under the authored stone and vegetation meshes.
  // The old giant painted emblem/flat flowers no longer replace real detail.
  const c=document.createElement('canvas');c.width=c.height=SIZE;const g=c.getContext('2d');
  const tones=['152,142,110','202,170,124','176,197,212','82,70,76'];
  g.strokeStyle=`rgba(${tones[world]},.34)`;g.lineWidth=1.2*scale;g.lineCap='round';
  g.beginPath();g.arc(px(0),px(0),R*.49*scale,0,Math.PI*2);g.stroke();
  for(let side=0;side<4;side++){const a=side*Math.PI/2;g.beginPath();g.moveTo(px(0),px(0));g.lineTo(px(Math.cos(a)*(R+4)),px(Math.sin(a)*(R+4)));g.stroke();}
  const overlay=new THREE.CanvasTexture(c);overlay.colorSpace=THREE.SRGBColorSpace;const glow=null;

  // Authored Fernworld meshes. Origins stay unchanged; only world placement and
  // explicit architectural/nature scales are applied. Build once per region.
  if (!library) throw new Error('Arena requires the prepared Fernworld library');
  const group = new THREE.Group(); group.name = 'Hohenfarn courtyard';
  const naturals = [
    ['meadow_grass_short','meadow_daisy','meadow_fern_rosette','woodland_bush_flowering','woodland_oak_old'],
    ['meadow_grass_seed','meadow_clover','fw_sandstone_bedded','woodland_palm_sahrun','meadow_reed'],
    ['meadow_moss','meadow_fern_fiddleheads','fw_snow_wind_drift','woodland_spruce_tiered','fw_ice_crystal_cluster'],
    ['meadow_grass_seed','meadow_moss','fw_basalt_columns','fw_lava_fissure','woodland_fallen_log'],
  ][world];
  const ids = ['fw_paving_stone','fw_wall_stone_arch','fw_pillar_carved','fw_railing_stone','fw_stairs_stone','fw_roof_gentle','fw_roof_ridge','fw_street_light_sporecell','fw_bench_oak','fw_planter_terracotta','fw_books_stack','fw_chest_ironbound',...naturals];
  const models = new Map(await Promise.all(ids.map(async id => [id, await library.model(id, 'lo')])));
  const chunks = new Map();
  const place = (id, x, y, z, angle=0, size=1, tint=0xffffff) => {
    const key = Math.floor(x/12)+','+Math.floor(z/12);
    if (!chunks.has(key)) chunks.set(key, {matte:new Batch(),gloss:new Batch(),glow:new Batch()});
    const chunk = chunks.get(key), matrix = mtx([x,y,z],[0,angle,0],size);
    for (const part of models.get(id)) chunk[part.mat].add(part.geometry,matrix,tint);
  };
  // The playable courtyard is actual bevelled fitted stone, batched by 12m
  // sectors. A broad noisy ground illustration no longer competes with actors.
  const floorTone=new THREE.Color([0xe2ddce,0xe8cba6,0xd3e2ed,0xb2a2ac][world]);
  // Fit the authored outer bounds exactly to the 2.55 m placement grid. The
  // previous 0.98 X/Z scale left 2 mm slots exposing dark vertical sidewalls as
  // single-sample dots. Tiles now meet without overlap; Y/bevels stay intact.
  const pavingBounds=new THREE.Box3();
  for(const part of models.get('fw_paving_stone')){part.geometry.computeBoundingBox();pavingBounds.union(part.geometry.boundingBox);}
  const pavingSize=pavingBounds.getSize(new THREE.Vector3()),pavingFit=[2.55/pavingSize.x,.98,2.55/pavingSize.z];
  for(let ix=-9;ix<=9;ix++)for(let iz=-9;iz<=9;iz++){
    const x=ix*2.55,z=iz*2.55;if(Math.hypot(x,z)>R+1.1)continue;
    const tint=floorTone.clone().multiplyScalar(.92+rand()*.08);
    place('fw_paving_stone',x,-.09,z,((ix+iz)&3)*Math.PI/2,pavingFit,tint);
  }
  // Three colonnaded sides, with open gates: this is a courtyard, not an island.
  for (const side of [-1,1]) for(let k=-4;k<=4;k++) {
    const x=side*(R+2.8),z=k*4.4, angle=side*Math.PI/2;
    place('fw_wall_stone_arch',x,0,z,angle,1.35);
    place('fw_roof_gentle',x,3.7,z,angle,[1.8,1.1,1.35]);
    if(k%2===0)place('fw_pillar_carved',x-side*1.3,0,z,0,.95);
  }
  for(let k=-4;k<=4;k++) if(Math.abs(k)>1){
    place('fw_wall_stone_arch',k*4.4,0,-R-2.8,0,1.35);
    place('fw_roof_ridge',k*4.4,3.7,-R-2.8,0,1.35);
  }
  for(let k=0;k<20;k++) {
    const a=k/20*Math.PI*2,x=Math.cos(a)*(R+.8),z=Math.sin(a)*(R+.8);
    if(Math.abs(Math.sin(a))>.91)continue;
    place('fw_railing_stone',x,0,z,-a+Math.PI/2,.95);
    if(k%3===0)place('fw_street_light_sporecell',x,0,z,-a,.85);
  }
  // Momo's fixed Keeper dais is visible at run start and has a clear approach.
  place('fw_stairs_stone',-4.4,0,-2.4,0,[.8,.32,.8]);
  place('fw_planter_terracotta',-5.7,0,-2.7,0,.75);
  place('fw_planter_terracotta',-3.1,0,-2.7,0,.75);
  place('fw_books_stack',-3.9,.82,-3.0,.2,.45);
  place('fw_chest_ironbound',-4.9,.82,-3.0,.1,.55);
  place(naturals[1],-5.7,.55,-2.7,0,.6);place(naturals[0],-3.1,.55,-2.7,0,.7);
  for(const side of [-1,1])place('fw_bench_oak',side*5,0,-R-.5,0,1.15);
  // Detailed vegetation stays on the border; small patches in the field leave
  // projectiles, hazard lines and sparks legible. No billboard substitutions.
  for(let k=0;k<(low?160:260);k++){
    const a=rand()*Math.PI*2, outer=k%4!==0, d=outer?R+1+rand()*9:6+rand()*(R-8);
    const type=outer?k%naturals.length:k%2;
    const size=type===3?(world===0?1.15:1.6):type===2?.65:.4+rand()*.35;
    place(naturals[type],Math.cos(a)*d,0,Math.sin(a)*d,rand()*6,size);
  }
  const materials = {
    matte:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),
    gloss:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.08}),
    glow:new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}),
  };
  for(const m of Object.values(materials))m.userData.cheapIbl=true;
  for(const chunk of chunks.values())for(const [kind,batch] of Object.entries(chunk))if(!batch.empty){
    const mesh=new THREE.Mesh(batch.geometry(),materials[kind]);mesh.receiveShadow=true;group.add(mesh);
  }
  return { group, overlay, glow, torches:[], keeper:[-4.4,.824,-3.0], ext:[-E,-E,1/(2*E)],
    dispose(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const m of Object.values(materials))m.dispose();overlay.dispose();glow?.dispose();} };
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
