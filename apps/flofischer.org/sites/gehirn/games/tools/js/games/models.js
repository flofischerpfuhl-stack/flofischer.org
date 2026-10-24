/**
 * Loads the baked cast meshes (tools/games-assets/models/<NAME>.<lod>.json, made by
 * scripts/games-sculpt/build-models.mjs) into Three.js geometries, one per motion channel and material.
 */
import { THREE } from './three-kit.js';

const BASE = new URL('../../games-assets/models/', import.meta.url);
const cache = new Map();
// ?nofur leaves the fur strands out (A/B performance checks)
const NO_FUR = (() => { try { return new URLSearchParams(location.search).has('nofur'); } catch { return false; } })();
const unb64 = (s, Type) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Type(u8.buffer); };

/** → Promise<[{ ch, mat, pivot, armBase, geometry }]> */
export function loadModel(name, lod = 'lo') {
  const key = `${name}.${lod}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(new URL(`${key}.json`, BASE)).then((r) => { if (!r.ok) throw new Error(`model ${key}: ${r.status}`); return r.json(); }).then((data) => data.groups.map((g) => {
      const q = unb64(g.pos, Int16Array), n = unb64(g.nor, Int8Array), c = unb64(g.col, Uint8Array);
      const pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) { const a = i % 3; pos[i] = g.bmin[a] + ((q[i] + 32768) / 65535) * (g.bmax[a] - g.bmin[a]); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(n, 3, true));
      // vertex colours were baked in sRGB terms by the sculpt; convert to the linear working space
      const lin = new Float32Array(c.length);
      for (let i = 0; i < c.length; i++) { const v = c[i] / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
      geo.setAttribute('color', new THREE.BufferAttribute(lin, 3));
      geo.setIndex(new THREE.BufferAttribute(g.idx32 ? unb64(g.idx, Uint32Array) : unb64(g.idx, Uint16Array), 1));
      // fur strands: growth direction + strength per vertex (int8 × 4), only where the bake has fur
      if (g.fur && !NO_FUR) geo.setAttribute('aFur', new THREE.BufferAttribute(unb64(g.fur, Int8Array), 4, true));
      geo.computeBoundingSphere();
      return { ch: g.ch, mat: g.mat, pivot: g.pivot || [0, 0, 0], armBase: g.armBase || 0, geometry: geo };
    })));
  }
  return cache.get(key);
}
