/** Isolated library preparation. No game imports this module yet.
 * One library owns its loaded GLTF resources; actors share only immutable geometry,
 * materials and clips. Each actor gets independent nodes, morph weights and bones.
 * No implicit centering, fitting, placement, shadow or lighting policy is applied.
 */
import { loadBytes, loadJSON, invalidateDownload, expectBytes } from './loading-cache.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';
import { recipeClips } from './rigid-clips.js';
import { articulatedClips, inPlaceWalkRoll } from './articulated-clips.js';

const DEFAULT_BASE = new URL('../../../../tools/games-assets/fernworld/', import.meta.url);

function cloneScene(source) {
  const root = source.clone(true), lookup = new Map();
  function pair(a, b) {
    lookup.set(a, b);
    a.children.forEach((child, i) => pair(child, b.children[i]));
  }
  pair(source, root);
  source.traverse(original => {
    const copy = lookup.get(original);
    if (original.morphTargetInfluences) copy.morphTargetInfluences = original.morphTargetInfluences.slice();
    if (!original.isSkinnedMesh) return;
    const skeleton = original.skeleton.clone();
    skeleton.bones = original.skeleton.bones.map(bone => {
      const clone = lookup.get(bone);
      if (!clone) throw new Error(`Bone outside asset root: ${bone.name}`);
      return clone;
    });
    copy.bind(skeleton, original.bindMatrix);
    copy.bindMatrixInverse.copy(original.bindMatrixInverse);
  });
  return root;
}

export function disposeScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  const images = new Set();
  for (const texture of textures) { if (texture.image) images.add(texture.image); texture.dispose(); }
  for (const image of images) image.close?.();
}

export class AssetLibrary {
  constructor({ base = DEFAULT_BASE, onProgress = null, signal = null } = {}) {
    this.base = new URL(base, import.meta.url);
    this.onProgress = onProgress; this.signal = signal;this.lifetime=new AbortController();
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.jsonCache = new Map();
    this.templates = new Map();
    this.resources = new Set();
    this.actors = new Set();
    this.disposed = false;
  }

  assertAlive() { if (this.disposed) throw new Error('Asset library has been disposed'); }

  loadSignal(signal=this.signal) { return signal ? AbortSignal.any([signal,this.lifetime.signal]) : this.lifetime.signal; }
  setProgressListener(onProgress, signal = null) { this.onProgress = onProgress; this.signal = signal; }
  progress(event) { this.onProgress?.(event); }

  json(file) {
    this.assertAlive();
    if (!this.jsonCache.has(file)) {
      const promise = loadJSON(new URL(file, this.base), { onProgress: event => this.progress(event), signal: this.loadSignal() })
        .then(data => { this.assertAlive(); return data; }).catch(error => {
          this.jsonCache.delete(file); throw error;
        });
      this.jsonCache.set(file, promise);
    }
    return this.jsonCache.get(file);
  }

  /** One small file per asset (defs/<ID>.json, built by package-defs.py); the big catalogs are the fallback for a library without shards. */
  async definition(id) {
    try {
      const shard = await this.json(`defs/${id}.json`);
      return { entry: shard.entry, definition: shard.definition, catalog: { motionLibraries: shard.motionLibraries ?? [] } };
    } catch (error) { if (error?.name === 'AbortError' || this.disposed || error?.code === 'ASSET_VERSION_MISMATCH') throw error; }
    const selection = await this.json('selected-assets.json');
    const entry = selection.assets.find(asset => asset.id === id);
    if (!entry) throw new Error(`Unknown selected Fernworld asset: ${id}`);
    const catalog = await this.json(entry.catalog);
    const definition = catalog.assets.find(asset => asset.id === id);
    if (!definition) throw new Error(`Missing selected definition: ${id}`);
    return { entry, definition, catalog };
  }

  async contract(id, field = 'motionContract') {
    const { definition } = await this.definition(id), value = definition[field];
    return value?.file ? this.json(value.file) : value ?? null;
  }

  async _gltf(file) {
    this.assertAlive();
    const url = new URL(file, this.base);
    const bytes = await loadBytes(url, { onProgress: event => this.progress(event), signal: this.loadSignal() });
    this.assertAlive();
    const started = performance.now(); this.progress({ phase: 'parse', url: url.href, done: false });
    let data;
    try { data = await this.loader.parseAsync(bytes, new URL('.', url).href); }
    catch(error) { invalidateDownload(url); throw error; }
    this.progress({ phase: 'parse', url: url.href, done: true, milliseconds: performance.now() - started });
    if (this.disposed) { disposeScene(data.scene); throw new Error('Asset library disposed during load'); }
    this.resources.add(data.scene);
    return data;
  }

  async _template(id, requestedLod) {
    const { entry, definition, catalog } = await this.definition(id);
    if (entry.pipeline === 'channel-mesh-v1') throw new Error(`${id} requires the channel mesh loader`);
    const lod = requestedLod ?? definition.defaultLod ?? entry.defaultLod;
    const primary = entry.pipeline === 'skinned-gltf' && ['hi', 'hero', undefined].includes(lod);
    const file = definition.lods?.[lod]?.file ?? (primary ? definition.file : undefined);
    // Older solo characters have one prepared file and no reduced tiers.
    const single = definition.file && !Object.keys(definition.lods ?? {}).length;
    const selectedFile = file ?? (single && !requestedLod ? definition.file : undefined);
    if (!selectedFile) throw new Error(`Missing authored LOD ${id}/${lod}`);
    expectBytes(new URL(selectedFile, this.base), (file ? definition.lods?.[lod]?.bytes : undefined) ?? definition.bytes);
    const data = await this._gltf(selectedFile);
    try {
      let animations = data.animations;
      if (definition.motionMode === 'absoluteTRSRecipe') {
        const recipe = await this.json(definition.motion.file);
        animations = recipeClips(data.scene, recipe);
      } else if (['DUCK_LEGIONARY', 'KLONK', 'KLONKBOT', 'SHIELD_KLONK', 'DARTER', 'BUZZ_DRONE'].includes(id)) {
        const recipe = await this.json(definition.motion.file);
        const mobileMotion = definition.motionScript
          ? (await import(new URL(definition.motionScript.file, this.base).href)).createMachineMotion : undefined;
        animations = articulatedClips(data.scene, recipe, { asset: id, lod, mobileMotion });
      } else if (['HULK', 'SQUIRTER'].includes(id)) {
        animations = inPlaceWalkRoll(data.scene, animations, { asset: id });
      }
      if (definition.motionLibrary) {
        const library = catalog.motionLibraries.find(item => item.id === definition.motionLibrary);
        if (!library?.compatibleIds.includes(id)) throw new Error(`Incompatible motion library: ${id}`);
        const motion = await this._motionLibrary(library.file);
        animations = [...animations, ...motion];
      }
      const origin = definition.clipNormalization;
      if (origin) {
        const start = origin.sourceStartSeconds;
        if (!(start >= 0)) throw new Error(`Invalid clip time origin: ${id}`);
        animations = animations.map(clip => {
          const copy = clip.clone();
          for (const track of copy.tracks) {
            if (Math.abs(track.times[0] - start) > 1e-6) throw new Error(`Nonuniform clip origin: ${id}/${clip.name}`);
            track.shift(-start);
            track.times[0] = 0;
          }
          copy.resetDuration();
          return copy;
        });
      }
      this.assertAlive();
      return { id, lod, entry, definition, file: selectedFile, scene: data.scene, animations };
    } catch (error) {
      if (this.resources.delete(data.scene)) disposeScene(data.scene);
      throw error;
    }
  }

  _motionLibrary(file) {
    const key = `motion:${file}`;
    if (!this.templates.has(key)) {
      this.templates.set(key, this._gltf(file).then(data => data.animations).catch(error => {
        this.templates.delete(key); throw error;
      }));
    }
    return this.templates.get(key);
  }

  template(id, lod) {
    this.assertAlive();
    const key = `${id}:${lod ?? 'default'}`;
    if (!this.templates.has(key)) {
      this.templates.set(key, this._template(id, lod).catch(error => {
        this.templates.delete(key); throw error;
      }));
    }
    return this.templates.get(key);
  }

  /** Caller owns its mixer/controllers; release them before releasing the actor. */
  async create(id, lod) {
    const template = await this.template(id, lod);
    this.assertAlive();
    const scene = cloneScene(template.scene);
    let released = false;
    const actor = { ...template, scene, release: () => {
      if (released) return;
      released = true; scene.removeFromParent();
      const skeletons = new Set();
      scene.traverse(node => { if (node.skeleton) skeletons.add(node.skeleton); });
      for (const skeleton of skeletons) skeleton.dispose();
      this.actors.delete(actor);
    } };
    this.actors.add(actor);
    return actor;
  }

  /** Network-only speculation. No mutable nodes or GPU allocation. */
  async prefetch(ids, { signal, onProgress } = {}) {
    for (const item of ids) {
      if (signal?.aborted) throw new DOMException('Laden abgebrochen', 'AbortError');
      const id=typeof item === 'string'?item:item.id;
      // Prefetch has an independent subscriber signal, even while a prepare runs.
      const options={signal:this.loadSignal(signal),onProgress};
      const {entry,definition}=await this.definition(id);
      const lod = item.lod ?? definition.defaultLod ?? entry.defaultLod;
      const file = entry.pipeline === 'channel-mesh-v1' ? entry.files[`${lod === 'shadow' ? 'sh' : lod}.json`]
        : definition.lods?.[lod]?.file ?? definition.file;
      if (file) await loadBytes(new URL(file, this.base), options);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;this.lifetime.abort();
    for (const actor of this.actors) actor.release();
    for (const scene of this.resources) disposeScene(scene);
    this.resources.clear(); this.templates.clear(); this.jsonCache.clear();
  }
}
