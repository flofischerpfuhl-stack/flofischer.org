/** Prepared workshop adapter for rigid wax machines with one closed Melt target.
 * Keeps real morph geometry and per-node motion, then batches by material.
 * Not imported by any game. Bake an exclusively owned, unattached actor.
 */
import * as T from 'three';
import { bakeRigid } from './baked-rigid.js';

export function bakeRigidMorph(gltf, options = {}) {
  const root = gltf.scene;
  if (root.parent) throw new Error('Bake morph actors before attaching them');
  const originalMeshes = [], saved = [];
  root.traverse(o => {
    saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone(),
      o.morphTargetInfluences?.slice()]);
    if (o.isMesh) originalMeshes.push(o);
  });
  if (!originalMeshes.length) throw new Error('No morph meshes');
  for (const mesh of originalMeshes) {
    const g = mesh.geometry;
    if (mesh.isSkinnedMesh || mesh.isInstancedMesh || g.attributes.tangent) {
      throw new Error('Wax batching requires rigid meshes without tangent-space maps');
    }
    if (g.morphAttributes.position?.length !== 1 || g.morphAttributes.normal?.length !== 1 ||
        mesh.morphTargetInfluences?.length !== 1) {
      throw new Error('Exactly one position/normal morph target is required per mesh');
    }
    if (Object.keys(g.morphAttributes).some(k => !['position', 'normal'].includes(k))) {
      throw new Error('Unsupported additional morph attributes');
    }
  }
  const chosen = gltf.animations.filter(c => !options.clipNames || options.clipNames.includes(c.name));
  for (const clip of chosen) {
    if (clip.tracks.some(t => !/\.(position|quaternion|scale|morphTargetInfluences)$/.test(t.name))) {
      throw new Error('Only rigid TRS and one morph weight can be batched');
    }
  }
  const copy = root.clone(true), temporary = [];
  copy.traverse(o => { if (o.isMesh) temporary.push(o); });
  let atlas;
  try {
    temporary.forEach((mesh, i) => {
      const source = originalMeshes[i].geometry, g = source.clone();
      mesh.geometry = g;
      // The archive retains donor colour/normal provenance as extra colour sets.
      // Standard Three materials read COLOR_0 only; these two diagnostic sets
      // are not render inputs and differ between the recovered metal and wax.
      g.deleteAttribute('color_1'); g.deleteAttribute('color_2');
      for (const [attribute, target] of [['position', 'fwMorphPosition'], ['normal', 'fwMorphNormal']]) {
        const base = source.attributes[attribute], morph = source.morphAttributes[attribute][0];
        if (base.count !== morph.count || morph.itemSize !== 3) throw new Error('Mismatched morph topology');
        const delta = new Float32Array(base.count * 3);
        for (let v = 0; v < base.count; v++) for (let c = 0; c < 3; c++) {
          const value = morph.getComponent(v,c) - (source.morphTargetsRelative ? 0 : base.getComponent(v,c));
          if (!Number.isFinite(value)) throw new Error('Non-finite morph delta');
          delta[v * 3 + c] = value;
        }
        g.setAttribute(target, new T.BufferAttribute(delta, 3));
      }
      g.morphAttributes = {};
      mesh.morphTargetInfluences = undefined;
      mesh.morphTargetDictionary = undefined;
    });
    const rigidClips = chosen.map(c => new T.AnimationClip(c.name, c.duration,
      c.tracks.filter(t => !t.name.endsWith('.morphTargetInfluences')).map(t => t.clone())));
    atlas = bakeRigid({ scene: copy, animations: rigidClips }, options);
  } finally {
    for (const mesh of temporary) if (mesh.geometry !== originalMeshes[temporary.indexOf(mesh)].geometry) mesh.geometry.dispose();
  }
  const data = new Float32Array(atlas.frames * originalMeshes.length * 4);
  const mixer = new T.AnimationMixer(root);
  const restore = () => {
    for (const [o,p,q,s,weights] of saved) {
      o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s);
      if (weights) o.morphTargetInfluences.splice(0, weights.length, ...weights);
    }
    root.updateMatrixWorld(true);
  };
  try {
    for (const sampled of atlas.clips) {
      mixer.stopAllAction(); restore();
      const clip = chosen.find(c => c.name === sampled.name);
      const action = mixer.clipAction(clip).reset().setLoop(T.LoopOnce, 1);
      action.clampWhenFinished = true; action.play();
      for (let f = 0; f < sampled.count; f++) {
        action.paused = false; action.enabled = true; action.time = f / sampled.rate;
        mixer.update(0);
        originalMeshes.forEach((mesh,bone) => {
          const weight = mesh.morphTargetInfluences[0];
          if (!Number.isFinite(weight) || weight < -1e-5 || weight > 1.00001) throw new Error('Invalid Melt weight');
          data[((sampled.start + f) * originalMeshes.length + bone) * 4] = weight;
        });
      }
    }
  } catch (error) {
    atlas.dispose(); throw error;
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(root); restore();
  }
  const morphTexture = new T.DataTexture(data, originalMeshes.length, atlas.frames, T.RGBAFormat, T.FloatType);
  morphTexture.minFilter = morphTexture.magFilter = T.NearestFilter;
  morphTexture.generateMipmaps = false; morphTexture.needsUpdate = true;
  const disposeRigid = atlas.dispose.bind(atlas);
  Object.assign(atlas, { morphTexture, morphData: data, sourceMeshes: originalMeshes,
    bytes: atlas.bytes + data.byteLength,
    dispose() { morphTexture.dispose(); disposeRigid(); } });
  return atlas;
}
