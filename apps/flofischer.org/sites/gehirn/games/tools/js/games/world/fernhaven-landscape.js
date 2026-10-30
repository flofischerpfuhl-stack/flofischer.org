/**
 * Fernhaven (Viridis) colour grade for the overworld. The land around the region is built by island-terrain.js for every
 * region; only the region's own vertex colours get a warmer, more saturated meadow grade here (once per geometry).
 */
import { THREE as T } from '../three-kit.js';

/** Lusher meadow greens and warmer stone on the region's own vertex colours.
 * With `pause` (an async yield) the work is cut into slices of `budget` ms so a 100k-vertex model never holds the main thread. */
export async function gradeRegion(root, { pause = null, budget = 6 } = {}) {
  const c = new T.Color(), hsl = {}, colours = [];
  root.traverse((o) => {
    const col = o.isMesh && o.material?.name !== 'water' && o.geometry?.attributes.color;
    if (!col || o.geometry.userData.fernhavenGrade) return;
    o.geometry.userData.fernhavenGrade = true; colours.push(col);
  });
  let sliceStart = performance.now();
  for (const col of colours) {
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)); c.getHSL(hsl);
      if (hsl.h > 0.17 && hsl.h < 0.52 && hsl.s > 0.05) { // greens and mint: towards a sunny yellow-green
        hsl.h = hsl.h + (0.27 - hsl.h) * 0.7; hsl.s = Math.min(0.85, hsl.s * 1.7 + 0.12); hsl.l *= 0.9;
      } else if (hsl.s < 0.12 && hsl.l > 0.15) { // grey stone: a touch of warm sandstone
        hsl.h = 0.09; hsl.s = Math.min(0.22, hsl.s + 0.1);
      }
      c.setHSL(hsl.h, hsl.s, hsl.l); col.setXYZ(i, c.r, c.g, c.b);
      if (pause && !(i & 1023) && performance.now() - sliceStart > budget) { await pause(); sliceStart = performance.now(); }
    }
    col.needsUpdate = true;
  }
}
