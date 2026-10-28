/** Isolated workshop adapter: rigid GLB animation -> material-batched motion atlas.
 * No game imports. Source scene must be exclusively owned during baking.
 */
import * as T from 'three';

function texture(data, bones, frames) {
  const t = new T.DataTexture(data, bones * 4, frames, T.RGBAFormat, T.FloatType);
  t.minFilter = t.magFilter = T.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Compatible with BakedCrowd. A rigid node becomes one virtual bone.
 * Geometry keeps local positions/UV/colours; its atlas matrix contains its entire
 * animated parent chain. Matching material and attribute layouts share a draw.
 * Unsupported deformation/material hooks fail explicitly instead of disappearing.
 */
export function bakeRigid(gltf, { fps = 24, clipNames } = {}) {
  if (!(fps >= 1 && fps <= 60)) throw new Error('Invalid rigid sampling rate');
  const root = gltf.scene, meshes = [], saved = [];
  if (root.parent) throw new Error('Bake before attaching the asset to a game scene');
  root.traverse(o => {
    saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (!p.visible) throw new Error('Hidden authoring geometry must not enter a rigid batch');
    if (o.isSkinnedMesh || o.isInstancedMesh) throw new Error('Rigid bake requires ordinary meshes');
    if (Object.values(o.geometry.morphAttributes).some(a => a.length)) throw new Error('Rigid bake cannot discard morph targets');
    if (!o.geometry.attributes.position || !o.geometry.attributes.normal) throw new Error('Position and normals required');
    meshes.push(o);
  });
  if (!meshes.length || meshes.length > 256) throw new Error('Rigid node count outside 1..256');
  const chosen = gltf.animations.filter(c => !clipNames || clipNames.includes(c.name));
  if (!chosen.length || clipNames?.some(n => !chosen.some(c => c.name === n))) throw new Error('Missing rigid clips');
  const clips = [], frames = [];
  for (const clip of chosen) {
    if (!(clip.duration > 0) || !Number.isFinite(clip.duration)) throw new Error('Invalid clip duration');
    if (clip.tracks.some(t => !/\.(position|quaternion|scale)$/.test(t.name))) throw new Error('Only rigid TRS tracks can be baked');
    const steps = Math.ceil(clip.duration * fps);
    clips.push({ name: clip.name, duration: clip.duration, start: frames.length, count: steps + 1, rate: steps / clip.duration });
    for (let n = 0; n <= steps; n++) frames.push([clip, n / steps * clip.duration]);
  }
  const data = new Float32Array(frames.length * meshes.length * 16), mixer = new T.AnimationMixer(root);
  const restore = () => { for (const [o,p,q,s] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); } root.updateMatrixWorld(true); };
  let previous, action;
  try {
    for (let f = 0; f < frames.length; f++) {
      const [clip, time] = frames[f];
      if (clip !== previous) {
        mixer.stopAllAction(); restore();
        action = mixer.clipAction(clip).reset().setLoop(T.LoopOnce, 1);
        action.clampWhenFinished = true; action.play(); previous = clip;
      }
      action.paused = false; action.enabled = true; action.time = time;
      mixer.update(0); root.updateMatrixWorld(true);
      meshes.forEach((mesh, b) => {
        const m = mesh.matrixWorld, e = m.elements;
        const scale = [Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])];
        const shear = Math.max(Math.abs(e[0]*e[4]+e[1]*e[5]+e[2]*e[6]),Math.abs(e[0]*e[8]+e[1]*e[9]+e[2]*e[10]),Math.abs(e[4]*e[8]+e[5]*e[9]+e[6]*e[10]));
        if (!e.every(Number.isFinite) || m.determinant() <= 0 || Math.max(...scale)-Math.min(...scale) > 1e-5 || shear > 1e-5) throw new Error(`Non-rigid/mirrored transform: ${mesh.name}`);
        m.toArray(data, (f * meshes.length + b) * 16);
      });
    }
  } finally { mixer.stopAllAction(); mixer.uncacheRoot(root); restore(); }

  const groups = new Map();
  meshes.forEach((mesh, bone) => {
    const g = mesh.geometry, materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const ranges = Array.isArray(mesh.material) ? g.groups : [{start:0,count:g.index?.count??g.attributes.position.count,materialIndex:0}];
    if (g.drawRange.start !== 0 || Number.isFinite(g.drawRange.count)) throw new Error('Custom draw ranges require an explicit adapter');
    for (const range of ranges) {
      const material = materials[range.materialIndex];
      if (!material || material.isShaderMaterial || material.onBeforeCompile !== T.Material.prototype.onBeforeCompile) throw new Error('Only plain imported materials can be batched');
      if (material.transparent || material.transmission > 0) throw new Error('Transparent objects need an explicit sorting strategy');
      // Imported primitives can share a material while only some carry UVs.
      // Keep those layouts separate rather than discarding authored attributes
      // or inventing UVs that could change how a later material is rendered.
      const layout = Object.keys(g.attributes).filter(k => k !== 'skinIndex' && k !== 'skinWeight')
        .sort().map(k => `${k}:${g.attributes[k].itemSize}`).join(',');
      const key = `${material.uuid}|${layout}`;
      if (!groups.has(key)) groups.set(key, { material, chunks: [] });
      groups.get(key).chunks.push({ mesh, bone, range });
    }
  });
  const parts = [];
  try {
    for (const {material, chunks} of groups.values()) {
      const names = Object.keys(chunks[0].mesh.geometry.attributes).filter(k => k !== 'skinIndex' && k !== 'skinWeight');
      const types = Object.fromEntries(names.map(k => [k, chunks[0].mesh.geometry.attributes[k].itemSize]));
      const arrays = Object.fromEntries(names.map(k => [k, []]));
      const indices = [], skinIndex = [], skinWeight = [];
      for (const {mesh, bone, range} of chunks) {
        const g = mesh.geometry, keys = Object.keys(g.attributes).filter(k => k !== 'skinIndex' && k !== 'skinWeight');
        if (keys.length !== names.length || names.some(k => g.attributes[k]?.itemSize !== types[k])) throw new Error('Different attribute layouts under one material');
        if (range.count % 3) throw new Error('Incomplete triangle range');
        const remap = new Map();
        for (let i = range.start; i < range.start + range.count; i++) {
          const original = g.index ? g.index.getX(i) : i;
          if (!remap.has(original)) {
            const index = skinIndex.length / 4; remap.set(original,index);
            for (const k of names) {
              const a = g.attributes[k];
              if (a.itemSize > 4) throw new Error('Unsupported attribute width');
              for (let c = 0; c < a.itemSize; c++) arrays[k].push(a.getComponent(original,c));
            }
            skinIndex.push(bone,0,0,0); skinWeight.push(1,0,0,0);
          }
          indices.push(remap.get(original));
        }
      }
      const geometry = new T.BufferGeometry();
      for (const k of names) geometry.setAttribute(k,new T.Float32BufferAttribute(arrays[k],types[k]));
      geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndex,4));
      geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeight,4));
      geometry.setIndex(indices);
      parts.push({source:new T.Mesh(geometry,material),bones:meshes.length,width:meshes.length*4,height:frames.length,data});
    }
  } catch (e) { for (const p of parts) p.source.geometry.dispose(); throw e; }
  const atlasTexture = texture(data,meshes.length,frames.length);
  for (const p of parts) p.texture = atlasTexture;
  return {parts,clips,fps,frames:frames.length,bytes:data.byteLength,sourceMeshes:meshes,
    rigidNodes:meshes.length,drawGroups:parts.length,
    dispose() {atlasTexture.dispose();for(const p of parts)p.source.geometry.dispose();}};
}
