/** Merge static meshes that share a material into one draw call (the hub has ~100 small parts otherwise). */
import { THREE } from './three-kit.js';
import { mergeGeometries } from '../../vendor/three-0.170.0/BufferGeometryUtils.js';

/**
 * Meshes under `root` with the same material become one mesh in `root`'s space. A mesh is left alone when its
 * `userData.keep` is set, when its material is transparent or invisible, or when a group cannot be merged
 * (different vertex attributes). `own.geo` receives the new geometries so they are disposed with the hub.
 */
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
    const geometries = nodes.map(n => { const g = n.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, n.matrixWorld)); return g; });
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(own.geo(merged), material);
    for (const n of nodes) n.parent.remove(n);
    root.add(mesh);
  }
}
