/** Decode the reviewed channel-mesh assets without changing the legacy loader.
 * Groups use the existing figure/MergedCrowd interface. This library owns the
 * immutable geometries; callers own their figure materials and transforms.
 */
import * as T from 'three';
import { AssetLibrary } from './asset-library.js';

function decode(base64, Type) {
  const binary = atob(base64), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Type(bytes.buffer);
}

export class ChannelLibrary extends AssetLibrary {
  constructor(options) { super(options); this.models = new Map(); this.geometries = new Set(); }

  model(id, lod = 'lo') {
    this.assertAlive();
    const tier = lod === 'shadow' ? 'sh' : lod, key = `${id}:${tier}`;
    if (!this.models.has(key)) {
      this.models.set(key, this._model(id, tier).catch(error => { this.models.delete(key); throw error; }));
    }
    return this.models.get(key);
  }

  async _model(id, lod) {
    const { entry } = await this.definition(id);
    if (entry.pipeline !== 'channel-mesh-v1') throw new Error(`${id} is not a channel-mesh asset`);
    const file = entry.files[`${lod}.json`];
    if (!file) throw new Error(`Missing authored channel LOD ${id}/${lod}`);
    const data = await this.json(file), groups = [];
    if (!Array.isArray(data.groups) || !data.groups.length) throw new Error(`Empty channel mesh ${id}`);
    try {
      for (const group of data.groups) {
        const q = decode(group.pos, Int16Array), normals = decode(group.nor, Int8Array), colours = decode(group.col, Uint8Array);
        const indices = decode(group.idx, group.idx32 ? Uint32Array : Uint16Array);
        if (!q.length || q.length % 3 || normals.length !== q.length || colours.length !== q.length || indices.length % 3
          || !['matte', 'gloss', 'glow'].includes(group.mat)
          || ![group.bmin, group.bmax, group.pivot ?? [0, 0, 0]].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) {
          throw new Error(`Invalid channel buffers ${id}/${group.ch}`);
        }
        for (const index of indices) if (index >= q.length / 3) throw new Error(`Invalid channel index ${id}`);
        const positions = new Float32Array(q.length), linear = new Float32Array(colours.length);
        for (let i = 0; i < q.length; i++) {
          const axis = i % 3;
          positions[i] = group.bmin[axis] + (q[i] + 32768) / 65535 * (group.bmax[axis] - group.bmin[axis]);
          const value = colours[i] / 255;
          linear[i] = value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        }
        const geometry = new T.BufferGeometry();
        groups.push({ ch: group.ch, mat: group.mat, pivot: group.pivot ?? [0, 0, 0], armBase: group.armBase ?? 0, geometry });
        geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new T.BufferAttribute(normals, 3, true));
        geometry.setAttribute('color', new T.BufferAttribute(linear, 3));
        geometry.setIndex(new T.BufferAttribute(indices, 1));
        if (group.fur) {
          const fur = decode(group.fur, Int8Array);
          if (fur.length !== q.length / 3 * 4) throw new Error(`Invalid fur channel ${id}`);
          geometry.setAttribute('aFur', new T.BufferAttribute(fur, 4, true));
        }
        geometry.computeBoundingSphere();
      }
      this.assertAlive();
      for (const group of groups) this.geometries.add(group.geometry);
      return groups;
    } catch (error) { for (const group of groups) group.geometry.dispose(); throw error; }
  }

  dispose() {
    super.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear(); this.models.clear();
  }
}
