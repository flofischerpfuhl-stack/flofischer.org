/** Motion-only opaque visibility pass. Original PBR colour and native baking stay intact. */
export function createHubDepth(THREE) {
 const meshes=[],materials=new Map(),sources=new WeakSet();let enabled=false,released=false;
 const eligible=m=>m&&m.visible&&!m.transparent&&m.depthWrite&&m.depthTest&&!m.displacementMap&&!m.isShaderMaterial;
 function materialFor(original){
  if(materials.has(original))return materials.get(original);
  const m=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:original.depthTest,depthFunc:original.depthFunc,side:original.side,map:original.map??null,alphaMap:original.alphaMap??null,alphaTest:original.alphaTest,opacity:original.opacity,vertexColors:original.vertexColors,alphaToCoverage:original.alphaToCoverage,polygonOffset:original.polygonOffset,polygonOffsetFactor:original.polygonOffsetFactor,polygonOffsetUnits:original.polygonOffsetUnits,clippingPlanes:original.clippingPlanes,clipIntersection:original.clipIntersection});
  m.visible=!!eligible(original);materials.set(original,m);return m;
 }
 function add(root){
  if(released)return;
  const candidates=[];root.traverse(n=>{if(n.isMesh&&!n.userData.hubDepthOnly&&!sources.has(n))candidates.push(n);});
  for(const source of candidates){
   // The helper must never approximate a deformed/specialized vertex shader.
   if(source.isSkinnedMesh||source.morphTargetInfluences||source.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender)continue;
   const originals=Array.isArray(source.material)?source.material:[source.material];
   if(!originals.some(eligible))continue;
   const mapped=originals.map(materialFor),material=Array.isArray(source.material)?mapped:mapped[0];let mesh;
   if(source.isInstancedMesh){mesh=new THREE.InstancedMesh(source.geometry,material,source.count);mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0,source.count*16));mesh.instanceMatrix.needsUpdate=true;}
   else mesh=new THREE.Mesh(source.geometry,material);
   mesh.name=`HubDepth_${source.name}`;mesh.userData.hubDepthOnly=true;
   mesh.renderOrder=-100;mesh.frustumCulled=source.frustumCulled;mesh.layers.mask=source.layers.mask;
   mesh.visible=enabled;mesh.raycast=()=>{}; // Physical picking remains on the original object.
   source.add(mesh);meshes.push(mesh);sources.add(source);
  }
 }
 function setEnabled(value){if(released)return;enabled=value;for(const mesh of meshes)mesh.visible=value;}
 return {add,setEnabled,get count(){return meshes.length;},release(){released=true;for(const mesh of meshes){mesh.removeFromParent();if(mesh.isInstancedMesh)mesh.dispose();}for(const m of materials.values())m.dispose();meshes.length=0;materials.clear();}};
}
