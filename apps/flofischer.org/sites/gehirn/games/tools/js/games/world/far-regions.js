/**
 * The reduced twin of every authored region (about 7 % of the triangles of the real model, built offline by
 * tools/games-assets/worldmap/build-far.mjs): the same slab, the same colours, only coarser. The world map shows these for every
 * region that is not the one under foot, so the whole world is the real world seen from farther away.
 */
import { THREE as T } from '../three-kit.js';
import { GLTFLoader } from '../../../games-assets/fernworld/vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../../../games-assets/fernworld/vendor/meshopt_decoder.module.js';

const BASE = new URL('../../../games-assets/worldmap/', import.meta.url);
let loader = null;

/** → Promise<Group> with the region's own origin at the group's origin; null when the file is missing. */
export async function loadFarRegion(family, key) {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  try {
    const data = await loader.loadAsync(new URL(`${family}/${key}.far.glb`, BASE).href), root = new T.Group();
    root.name = `Far_${family}_${key}`; root.add(data.scene);
    root.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; n.userData.owFar = true; } });
    return root;
  } catch (error) { console.error('[games] far region failed', family, key, error); return null; }
}

export function disposeFar(root) {
  root.traverse((n) => { if (!n.isMesh) return; n.geometry?.dispose(); for (const m of [n.material].flat()) m?.dispose?.(); });
  root.removeFromParent();
}
