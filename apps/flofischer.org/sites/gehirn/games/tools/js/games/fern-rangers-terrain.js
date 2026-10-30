/** Fern Rangers route terrain: per-world palette and the terracing of the side slopes (pure, no rendering). */
import { smoothstep } from './world/noise.js';

const PALETTE = {
  dunes: { a: [0xd2, 0xa4, 0x68], b: [0xee, 0xcf, 0x92], riser: [0.62, 0.4, 0.32], far: 0xf3dcb0, tint: [1, 0.98, 0.94] },
  frost: { a: [0x9d, 0xbb, 0xe0], b: [0xf4, 0xf9, 0xff], riser: [0.42, 0.58, 0.8], far: 0xdfecfa, tint: [1, 1, 1] },
  ember: { a: [0x6a, 0x42, 0x50], b: [0x9c, 0x66, 0x62], riser: [0.5, 0.35, 0.4], far: 0x8a4a52, tint: [1, 0.95, 0.95] },
};
export { PALETTE };
export const worldPalette = (w) => PALETTE[w];

/** Terraced side slopes: the smooth hills become flat steps with short steep risers. */
const STEP = { meadow: 2.2, dunes: 1.7, frost: 1.5, ember: 1.9 };
export function terrace(world, h, a) {
  const step = STEP[world] * (0.6 + 0.4 * smoothstep(10, 40, a)), k = h / step, f = k - Math.floor(k);
  return step * (Math.floor(k) + smoothstep(0.55, 0.95, f)) * smoothstep(7.5, 10.5, a);
}

