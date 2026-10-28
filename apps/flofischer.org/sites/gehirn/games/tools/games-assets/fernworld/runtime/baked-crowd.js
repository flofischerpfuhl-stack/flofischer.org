/** Asset-workshop prototype. Not imported by any game. Three.js 0.170.0. */
import * as T from 'three';

const finite = (v) => Number.isFinite(v);

/** Bake an exclusively owned GLTF scene. Source files are never modified.
 * Matrices already include mesh-to-asset space, so instanceMatrix is actor-to-world.
 * Hero characters retain normal skeletal playback; this atlas is for distant crowds.
 */
export function bakeCrowd(gltf, { fps = 24, clipNames } = {}) {
  if (!(fps >= 1 && fps <= 60)) throw new Error('Invalid crowd sampling rate');
  const root = gltf.scene, meshes = [], clips = [], frameTimes = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    if (!o.isSkinnedMesh) throw new Error(`Unskinned attachment requires its own batch: ${o.name}`);
    if (Object.values(o.geometry.morphAttributes).some(a => a.length)) throw new Error(`Morph geometry requires explicit baking: ${o.name}`);
    meshes.push(o);
  });
  if (!meshes.length) throw new Error('No skinned mesh');
  const chosen = gltf.animations.filter(c => !clipNames || clipNames.includes(c.name));
  if (!chosen.length) throw new Error('No selected animation');
  if (clipNames?.some(name => !chosen.some(c => c.name === name))) throw new Error('Unknown selected animation');
  for (const clip of chosen) {
    if (!(clip.duration > 0) || !finite(clip.duration)) throw new Error(`Invalid clip ${clip.name}`);
    if (clip.tracks.some(t => t.name.includes('morphTargetInfluences'))) throw new Error('Morph animation requires an explicit alternative');
    const intervals = Math.max(1, Math.ceil(clip.duration * fps));
    const entry = { name: clip.name, start: frameTimes.length, count: intervals + 1, duration: clip.duration, rate: intervals / clip.duration };
    clips.push(entry);
    for (let f = 0; f <= intervals; f++) frameTimes.push({ clip, time: f / intervals * clip.duration });
  }
  const parts = meshes.map(mesh => {
    const bones = mesh.skeleton.bones.length;
    if (!bones || bones > 256) throw new Error(`Unexpected bone count: ${bones}`);
    return { source: mesh, bones, width: bones * 4, height: frameTimes.length,
      data: new Float32Array(frameTimes.length * bones * 16) };
  });
  const mixer = new T.AnimationMixer(root), bone = new T.Matrix4(), prefix = new T.Matrix4(), result = new T.Matrix4();
  let action, previous;
  for (let f = 0; f < frameTimes.length; f++) {
    const sample = frameTimes[f];
    if (sample.clip !== previous) {
      mixer.stopAllAction();
      action = mixer.clipAction(sample.clip); action.reset().setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      previous = sample.clip;
    }
    action.paused = false; action.enabled = true; action.time = sample.time;
    mixer.update(0); root.updateMatrixWorld(true);
    for (const part of parts) {
      const mesh = part.source; mesh.skeleton.update();
      prefix.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
      for (let b = 0; b < part.bones; b++) {
        bone.fromArray(mesh.skeleton.boneMatrices, b * 16);
        result.multiplyMatrices(prefix, bone).multiply(mesh.bindMatrix);
        result.toArray(part.data, (f * part.bones + b) * 16);
      }
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root); root.updateMatrixWorld(true);
  for (const part of parts) {
    if (!part.data.every(finite)) throw new Error('Non-finite motion atlas');
    part.texture = new T.DataTexture(part.data, part.width, part.height, T.RGBAFormat, T.FloatType);
    part.texture.minFilter = part.texture.magFilter = T.NearestFilter;
    part.texture.generateMipmaps = false; part.texture.needsUpdate = true;
  }
  return { parts, clips, fps, frames: frameTimes.length,
    bytes: parts.reduce((sum, p) => sum + p.data.byteLength, 0),
    dispose() { for (const part of parts) part.texture.dispose(); } };
}

const vertexHeader = `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 fwMotion;
uniform sampler2D fwBones;
mat4 fwReadBone(float frame, float bone) {
  ivec2 p = ivec2(int(bone) * 4, int(frame));
  return mat4(texelFetch(fwBones,p,0), texelFetch(fwBones,p+ivec2(1,0),0),
              texelFetch(fwBones,p+ivec2(2,0),0), texelFetch(fwBones,p+ivec2(3,0),0));
}
mat4 fwPose(float frame) {
  // Authored crowd vertices usually use one or two bones. A zero weight
  // contributes exactly zero; avoid its four texture reads entirely. This
  // also makes rigid atlases (weight 1,0,0,0) a single-matrix lookup.
  mat4 pose = skinWeight.x * fwReadBone(frame,skinIndex.x);
  if (skinWeight.y != 0.0) pose += skinWeight.y * fwReadBone(frame,skinIndex.y);
  if (skinWeight.z != 0.0) pose += skinWeight.z * fwReadBone(frame,skinIndex.z);
  if (skinWeight.w != 0.0) pose += skinWeight.w * fwReadBone(frame,skinIndex.w);
  return pose;
}
`;

function patchMaterial(source, texture, morphTexture = null) {
  if (source.onBeforeCompile !== T.Material.prototype.onBeforeCompile) {
    throw new Error('Bake plain imported materials before applying lighting hooks');
  }
  const material = source.clone();
  const compile = shader => {
    shader.uniforms.fwBones = { value: texture };
    shader.vertexShader = vertexHeader + shader.vertexShader;
    if (morphTexture) {
      shader.uniforms.fwMorphWeights = { value: morphTexture };
      shader.vertexShader = `attribute vec3 fwMorphPosition;
attribute vec3 fwMorphNormal;
uniform sampler2D fwMorphWeights;
float fwWeight(float frame, float bone) {
  return texelFetch(fwMorphWeights, ivec2(int(bone), int(frame)), 0).r;
}
` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `void main() {
          mat4 fwSkinA = fwPose(fwMotion.x), fwSkinB = fwPose(fwMotion.y);
          float fwWeightA = fwWeight(fwMotion.x, skinIndex.x), fwWeightB = fwWeight(fwMotion.y, skinIndex.x);`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          objectNormal = mix((fwSkinA * vec4(objectNormal + fwWeightA * fwMorphNormal, 0.0)).xyz,
            (fwSkinB * vec4(objectNormal + fwWeightB * fwMorphNormal, 0.0)).xyz, fwMotion.z);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed = mix((fwSkinA * vec4(transformed + fwWeightA * fwMorphPosition, 1.0)).xyz,
            (fwSkinB * vec4(transformed + fwWeightB * fwMorphPosition, 1.0)).xyz, fwMotion.z);`);
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `void main() {
        mat4 fwSkin = fwPose(fwMotion.x);
        if (fwMotion.z > 0.0001) fwSkin = (1.0-fwMotion.z)*fwSkin + fwMotion.z*fwPose(fwMotion.y);`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = (fwSkin * vec4(objectNormal,0.0)).xyz;
        #ifdef USE_TANGENT
          objectTangent = (fwSkin * vec4(objectTangent,0.0)).xyz;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = (fwSkin * vec4(transformed,1.0)).xyz;`);
  };
  // three-kit applies its IBL hook later and explicitly composes extraCompile.
  // Keep the same patch for unlit workshop previews and the game lighting path.
  material.onBeforeCompile = compile;
  material.userData.extraCompile = compile;
  const key = morphTexture ? 'fernworld-baked-rigid-morph-v2' : 'fernworld-baked-crowd-v2';
  material.userData.extraKey = key;
  material.customProgramCacheKey = () => key;
  return material;
}

/** One instanced draw per source material, independent animation phase per actor.
 * No per-actor skeletons or AnimationMixers, no per-frame object allocation.
 * Call setPose/setMatrix for active slots, setCount, then flush once per frame.
 * Atlas ownership stays with caller and may be shared across batches.
 */
export class BakedCrowd {
  constructor(atlas, capacity, { shadows = false } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid capacity');
    this.atlas = atlas; this.capacity = capacity; this.root = new T.Group(); this.parts = [];
    this.motion = new T.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage);
    this.clipByName = new Map(atlas.clips.map(c => [c.name, c]));
    for (const part of atlas.parts) {
      const geometry = part.source.geometry.clone(); geometry.setAttribute('fwMotion', this.motion);
      const sources = Array.isArray(part.source.material) ? part.source.material : [part.source.material];
      const materials = sources.map(m => patchMaterial(m, part.texture, atlas.morphTexture));
      const mesh = new T.InstancedMesh(geometry, materials.length === 1 ? materials[0] : materials, capacity);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = shadows; mesh.receiveShadow = false; mesh.visible = false;
      mesh.customDepthMaterial = patchMaterial(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), part.texture, atlas.morphTexture);
      mesh.customDistanceMaterial = patchMaterial(new T.MeshDistanceMaterial(), part.texture, atlas.morphTexture);
      this.root.add(mesh); this.parts.push(mesh);
    }
  }
  frame(name, time, loop = true) {
    const clip = this.clipByName.get(name);
    if (!clip || !finite(time)) throw new Error('Invalid clip/time');
    const t = loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(clip.duration, Math.max(0, time));
    return clip.start + Math.round(t * clip.rate);
  }
  setPose(index, name, time, options) {
    const loop = options?.loop ?? true, next = options?.next ?? name,
      nextTime = options?.nextTime ?? time, blend = options?.blend ?? 0,
      nextLoop = options?.nextLoop ?? loop;
    if (!Number.isInteger(index) || index < 0 || index >= this.capacity) throw new Error('Instance outside capacity');
    if (!(blend >= 0 && blend <= 1)) throw new Error('Invalid transition weight');
    const a = this.frame(name, time, loop), b = blend > 0 ? this.frame(next, nextTime, nextLoop) : a;
    this.motion.setXYZ(index, a, b, blend);
  }
  setMatrix(index, matrix) {
    if (!Number.isInteger(index) || index < 0 || index >= this.capacity) throw new Error('Instance outside capacity');
    for (const mesh of this.parts) mesh.setMatrixAt(index, matrix);
  }
  setCount(count) {
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) throw new Error('Invalid instance count');
    for (const mesh of this.parts) { mesh.count = count; mesh.visible = count > 0; }
  }
  flush() { if (!this.parts[0]?.count) return; this.motion.needsUpdate = true; for (const mesh of this.parts) mesh.instanceMatrix.needsUpdate = true; }
  dispose() {
    this.root.removeFromParent();
    for (const mesh of this.parts) {
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      mesh.customDepthMaterial.dispose(); mesh.customDistanceMaterial.dispose(); mesh.dispose();
    }
    this.root.clear();
  }
}
