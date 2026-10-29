/** Hub-only history of unchanged, finished colour/depth bakes. Camera matrices
 * remain exact: a near match is a miss, never a differently framed image. */
import {THREE} from './three-kit.js';
export function createHubBakeCache(baker,{maxEntries=4,maxBytes=32*1024*1024}={}){
 const entries=new Map(),size=new THREE.Vector2();let bytes=0,hits=0,misses=0;
 const release=target=>{target.depthTexture?.dispose();target.dispose();};
 function clear(){
  // The cache owns every retained final target, including the current one.
  // Detach it before Baker.dispose/bake can dispose it a second time.
  baker.final=null;baker.mat.uniforms.tColor.value=null;baker.mat.uniforms.tDepth.value=null;baker.quad.visible=false;
  for(const {target}of entries.values())release(target);entries.clear();bytes=0;
 }
 function bake(renderer,scene,camera,ss){
  renderer.getDrawingBufferSize(size);
  const key=[scene.uuid,size.x,size.y,ss,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join('/'),cached=entries.get(key);
  if(cached){
   entries.delete(key);entries.set(key,cached);hits++;
   baker.final=cached.target;baker.mat.uniforms.tColor.value=cached.target.texture;baker.mat.uniforms.tDepth.value=cached.target.depthTexture;baker.quad.visible=true;renderer.shadowMap.needsUpdate=true;return;
  }
  misses++;const previous=baker.final;baker.final=null;
  try{baker.bake(renderer,scene,camera,ss);}catch(error){if(baker.final)release(baker.final);baker.final=previous;throw error;}
  const target=baker.final,entry={target,bytes:target.width*target.height*8};entries.set(key,entry);bytes+=entry.bytes;
  // A single oversized current target is the ordinary Baker footprint. Never
  // retain additional history above the byte limit, even on a very large display.
  while(entries.size>1&&(entries.size>maxEntries||bytes>maxBytes)){
   const oldest=entries.keys().next().value,held=entries.get(oldest);entries.delete(oldest);bytes-=held.bytes;release(held.target);
  }
 }
 return{bake,clear,get stats(){return{entries:entries.size,bytes,hits,misses};}};
}
