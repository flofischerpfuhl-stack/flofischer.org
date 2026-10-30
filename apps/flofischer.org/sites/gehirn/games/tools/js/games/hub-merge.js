/** Merge static meshes that share a material into one draw call (the hub has ~100 small parts otherwise). */
import { THREE } from './three-kit.js';
import { mergeGeometries } from '../../vendor/three-0.170.0/BufferGeometryUtils.js';

/**
 * Meshes under `root` with the same material become one mesh in `root`'s space. A mesh is left alone when its
 * `userData.keep` is set, when its material is transparent or invisible, or when a group cannot be merged
 * (different vertex attributes). `own.geo` receives the new geometries so they are disposed with the hub.
 */
/** Copy every attribute to plain float32 (a quantised GLB stores colours/uvs/normals as normalized ints; mixing them with floats breaks or darkens the merge). */
function floatify(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    const a = geometry.attributes[name];
    if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = [a.getX, a.getY, a.getZ, a.getW][c].call(a, i);
      geometry.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
  }
  return geometry;
}
/** Keep only the attributes every geometry has, so mixed props (some with colours, some without) still merge. */
function commonAttributes(list) {
  const names = Object.keys(list[0].attributes).filter(n => list.every(g => g.attributes[n]));
  for (const g of list) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  return list;
}

export function mergeStatic(root, own) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map();
  root.traverse(node => {
    if (!node.isMesh || node.isSkinnedMesh || node.userData.keep || node.material.transparent || node.material.visible === false) return;
    if (!groups.has(node.material)) groups.set(node.material, []);
    groups.get(node.material).push(node);
  });
  for (const [material, nodes] of groups) {
    if (nodes.length < 2) continue;
    const geometries = nodes.map(n => { const g = floatify(n.geometry.clone()); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, n.matrixWorld)); return g; });
    commonAttributes(geometries); for (const g of geometries) { if (!g.attributes.color) continue; if (material.vertexColors !== true) g.deleteAttribute('color'); }
    const mixed = geometries.some(g => !g.index) && geometries.some(g => g.index);
    const merged = mergeGeometries(mixed ? geometries.map(g => g.index ? g.toNonIndexed() : g) : geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) { console.warn('[hub merge] could not merge', nodes.length, 'meshes; left separate'); continue; }
    const mesh = new THREE.Mesh(own.geo(merged), material);
    for (const n of nodes) n.parent.remove(n);
    root.add(mesh);
  }
}
