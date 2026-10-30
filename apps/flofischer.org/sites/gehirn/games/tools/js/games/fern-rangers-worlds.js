/**
 * Fern Rangers: per-world composition of the route scenery (dunes, frost, ember), used by MeadowScenery.create.
 * Each world has its own terraced terrain (earth or rock risers between flat steps), a painted low-frequency ground
 * texture instead of photo noise, and a composed route: framing pieces near the road, groups in the mid-ground,
 * a landmark in every view gap and a clear skyline of big shapes at the back.
 */
import { THREE } from './three-kit.js';
import { PALETTE, terrace, worldPalette } from './fern-rangers-terrain.js';

export { terrace, worldPalette };

/** Painted ground tile (10 units): two soft bands across the road, a light wave, a few flecks, optional glowing veins. */
const cache = new Map();
export function paintedGround(world) {
  if (cache.has(world)) return cache.get(world);
  const { a: A, b: B } = PALETTE[world], S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  let seed = 11 + world.length; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fleck = new Float32Array(S * S); for (let i = 0; i < 1800; i++) { const x = (r() * S) | 0, y = (r() * S) | 0, v = (r() - 0.5) * 0.1; for (let k = 0; k < 3; k++) fleck[((y + k) % S) * S + x] += v; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = y / S + 0.04 * Math.sin((x / S) * Math.PI * 2) + 0.02 * Math.sin((x / S) * Math.PI * 4 + 1);
    const t = 0.5 + 0.5 * Math.sin(v * Math.PI * 2), band = t * t * (3 - 2 * t), f = 1 + fleck[y * S + x], i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, (A[c] + (B[c] - A[c]) * band) * f));
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (world === 'ember') { // a few soft glowing cracks, wrapping the tile
    g.lineCap = 'round';
    for (const [x0, y0, x1, y1] of [[20, 30, 90, 110], [150, 20, 200, 90], [60, 170, 130, 230], [190, 150, 240, 210]]) for (const dx of [0, S, -S]) for (const dy of [0, S, -S]) {
      g.strokeStyle = 'rgba(255,120,40,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + dx, y0 + dy); g.quadraticCurveTo((x0 + x1) / 2 + 14 + dx, (y0 + y1) / 2 - 10 + dy, x1 + dx, y1 + dy); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  cache.set(world, t); return t;
}

const C = (hex) => new THREE.Color(hex);

/**
 * Lay out the route of one world. ctx: put(model, x, z, opts), model(id), old(id), kenney(path), rand, edge, P, H, chunks,
 * NC, tint(), glow(geo, matrix, colour, z), box (unit BoxGeometry), mtx.
 */
export async function composeWorld(world, ctx) {
  const { put, rand, edge, P } = ctx;
  const views = [-40, -88, -136, -184, -232].map((z) => [z - 10, z + 10]);
  const inView = (z, side) => views.some(([a, b], i) => (i % 2 ? 1 : -1) === side && z > a && z < b);
  const lean = () => ctx.tint(world === 'ember' ? [0.9, 0.78, 0.74] : [0.92, 0.92, 0.95], 0.08);
  const spread = (fn, step, jitter = 0) => { for (const side of [-1, 1]) for (let z = -2, i = 0; z > -P; z -= step, i++) { const zz = z - rand() * jitter; if (!inView(zz, side)) fn(side, zz, i); } };
  const ring = (cx, cz, n, rmin, rmax, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rand() * 0.7, r = rmin + rand() * (rmax - rmin); fn(cx + Math.cos(a) * r * 1.2, cz + Math.sin(a) * r, i); } };

  if (world === 'dunes') {
    const [palm, sand, reed, rock, pillar, wall, tent, fire, cart, stall, arch] = await Promise.all([
      ctx.model('woodland_palm_sahrun'), ctx.model('fw_sandstone_bedded'), ctx.model('meadow_reed'), ctx.old('ROCK'),
      ctx.model('fw_pillar_carved'), ctx.model('fw_wall_stone_straight'), ctx.kenney('nature/tent_detailedOpen'), ctx.kenney('nature/campfire_stones'),
      ctx.kenney('town/cart'), ctx.kenney('town/stall-green'), ctx.model('fw_wall_stone_arch'),
    ]);
    // near framing: reed clumps and low sandstone blocks at the road edge, a tall palm every ~20 units, alternating
    spread((side, z) => { if (rand() < 0.75) put(reed, side * (edge + 0.9 + rand() * 1.4), z, { s: 0.85 + rand() * 0.6, yaw: rand() * 6, tufts: 0 }); }, 1.6, 1);
    spread((side, z, i) => { if (i % 4 === 1) put(sand, side * (edge + 2.4 + rand()), z, { s: 0.9 + rand() * 0.8, yaw: rand() * 6.3, tint: lean() }); }, 5, 2);
    spread((side, z, i) => { if ((i + (side > 0 ? 2 : 0)) % 5 === 0) put(palm, side * (edge + 3.2 + rand() * 1.5), z, { s: 1.6 + rand() * 0.5, yaw: rand() * 6.3 }); }, 4.4, 1);
    // mid-ground groups: palms with blocks and reeds at their feet
    for (let z = -14, i = 0; z > -P; z -= 15, i++) {
      const side = i % 2 ? 1 : -1; if (inView(z, side)) continue;
      const cx = side * (edge + 7 + rand() * 5);
      ring(cx, z, 3, 1, 3, (x, zz) => put(palm, x, zz, { s: 2 + rand() * 0.9, yaw: rand() * 6.3 }));
      put(sand, cx + (rand() - 0.5) * 3, z + 2, { s: 1.8 + rand(), yaw: rand() * 6.3, tint: lean() });
      ring(cx, z, 4, 1.5, 3.5, (x, zz) => put(reed, x, zz, { s: 1 + rand() * 0.6, tufts: 0 }));
      if (rand() < 0.5) put(rock, cx + 2, z - 2, { s: 1.4 + rand(), sink: 0.15 });
    }
    // skyline: mesas and tall blocks on the far slopes, palms between
    for (const side of [-1, 1]) for (let z = -4; z > -P; z -= 18) put(sand, side * (24 + rand() * 20), z + rand() * 6, { s: 4 + rand() * 3.5, yaw: rand() * 6.3, tint: lean() });
    for (const side of [-1, 1]) for (let z = -8; z > -P; z -= 7) put(palm, side * (20 + rand() * 24), z + rand() * 3, { s: 2.6 + rand() * 1.6, yaw: rand() * 6.3 });
    const landmark = [
      (z, side) => { // oasis: a pond ringed by palms and reeds
        const x = side * 14; ctx.disc(x, z, 4.2, 0x3ab4d0); ctx.disc(x, z, 4.7, 0xf6e2ae, -0.012);
        ring(x, z, 7, 4.6, 5.8, (px, pz, k) => put(k % 2 ? palm : reed, px, pz, { s: k % 2 ? 2.3 + rand() * 0.7 : 1.2, yaw: rand() * 6.3, tufts: 0 }));
      },
      (z, side) => { // ruined gate: an arch with pillars and fallen walls
        const x = side * 11; put(arch, x, z, { s: 3.4, yaw: side * 1.57 }); for (const dz of [-4, 4]) put(pillar, x, z + dz, { s: 2.2 });
        put(wall, x + side * 2, z - 6, { s: 2.6, yaw: 0.4 }); put(wall, x - side * 1, z + 6.5, { s: 2.4, yaw: -0.3 }); put(palm, x + side * 5, z + 3, { s: 2.6 });
      },
      (z, side) => { // mesa: one huge stacked block with smaller ones around it
        const x = side * 17; put(sand, x, z, { s: 9, yaw: side }); put(sand, x - side * 7, z + 4, { s: 4.4, yaw: 1.2 }); put(sand, x - side * 4, z - 6, { s: 3.2, yaw: 2.4 });
        ring(x - side * 9, z, 3, 2, 4, (px, pz) => put(palm, px, pz, { s: 2.3 }));
      },
      (z, side) => { // caravan camp
        const x = side * 10;
        put(tent, x, z - 1, { s: 3.2, yaw: side * 1.3 }); put(tent, x + side * 3.6, z + 3, { s: 2.8, yaw: side * 0.6 }); put(fire, x - side * 2.3, z + 2, { s: 2.2 });
        put(cart, x - side * 3.4, z - 3, { s: 2, yaw: 0.8 }); put(stall, x + side * 1.5, z + 6, { s: 2.2, yaw: side * 1.6 });
        ctx.glow(new THREE.ConeGeometry(0.35, 0.9, 7), x - side * 2.3, ctx.H(x - side * 2.3, z + 2) + 0.55, z + 2, 0xff9a3a, 1.7);
        ring(x + side * 5, z, 3, 1, 3, (px, pz) => put(palm, px, pz, { s: 2.2 }));
      },
      (z, side) => { // standing stones and a sandstone ridge
        const x = side * 11;
        ring(x, z, 6, 3, 4.5, (px, pz) => put(pillar, px, pz, { s: 1.8 + rand() * 1.2, yaw: rand() * 6.3 }));
        put(sand, x + side * 6, z, { s: 6, yaw: -side * 0.7 }); put(palm, x - side * 2, z + 1, { s: 2.8 });
      },
    ];
    views.forEach(([a, b], i) => landmark[i % landmark.length]((a + b) / 2, i % 2 ? 1 : -1));
  } else if (world === 'frost') {
    const [spruce, drift, crystal, cliff, cottage, rock, tent, fire, logs, fence, tree] = await Promise.all([
      ctx.model('woodland_spruce_tiered'), ctx.model('fw_snow_wind_drift'), ctx.model('fw_ice_crystal_cluster'), ctx.model('fw_cliff_straight'),
      ctx.old('COTTAGE'), ctx.old('ROCK'), ctx.kenney('nature/tent_detailedOpen'), ctx.kenney('nature/campfire_stones'), ctx.kenney('nature/log_stack'),
      ctx.kenney('nature/fence_simple', { recolour: false }), ctx.old('TREE_ROUND'),
    ]);
    const snowy = () => ctx.tint([1.02, 1.04, 1.1], 0.05);
    // near framing: snow drifts along the road edge, small spruces and crystals passing close
    spread((side, z) => { if (rand() < 0.8) put(drift, side * (edge + 1 + rand() * 1.4), z, { s: 0.9 + rand() * 0.7, yaw: rand() * 6.3, tufts: 0, tint: snowy() }); }, 3.2, 2);
    spread((side, z, i) => { if ((i + (side > 0 ? 1 : 0)) % 4 === 0) put(spruce, side * (edge + 2.8 + rand() * 1.2), z, { s: 1.4 + rand() * 0.5, yaw: rand() * 6.3, tufts: 0 }); }, 4.2, 1);
    spread((side, z, i) => { if (i % 6 === 3) put(crystal, side * (edge + 2.2 + rand()), z, { s: 0.8 + rand() * 0.6, yaw: rand() * 6.3, tufts: 0 }); }, 5, 2);
    for (let z = -13, i = 0; z > -P; z -= 14, i++) {
      const side = i % 2 ? -1 : 1; if (inView(z, side)) continue;
      const cx = side * (edge + 6.5 + rand() * 5);
      ring(cx, z, 4, 1, 3.2, (x, zz, k) => put(spruce, x, zz, { s: 1.7 + rand() * 1.1, yaw: rand() * 6.3, tufts: 0 }));
      ring(cx, z, 3, 1.5, 3.5, (x, zz) => put(drift, x, zz, { s: 1.2 + rand() * 0.8, tufts: 0, tint: snowy() }));
      if (rand() < 0.5) put(rock, cx + 2, z + 2, { s: 1.3 + rand(), sink: 0.15, tint: 0xdde6f2 });
    }
    for (const side of [-1, 1]) for (let z = -3; z > -P; z -= 12) put(cliff, side * (28 + rand() * 18), z + rand() * 5, { s: 4 + rand() * 3, yaw: side > 0 ? 1.57 : -1.57, tufts: 0 });
    for (const side of [-1, 1]) for (let z = -5; z > -P; z -= 6) put(spruce, side * (19 + rand() * 26), z + rand() * 3, { s: 2.8 + rand() * 1.8, yaw: rand() * 6.3, tufts: 0 });
    const landmark = [
      (z, side) => { // frozen pond with crystals
        const x = side * 14; ctx.disc(x, z, 5, 0x8fd2f2); ctx.disc(x, z, 5.6, 0xf6fbff, -0.012);
        ring(x, z, 5, 5.2, 6.4, (px, pz) => put(crystal, px, pz, { s: 1.4 + rand() * 0.8, yaw: rand() * 6.3, tufts: 0 }));
      },
      (z, side) => { // trapper cabin with a log stack and spruces
        const x = side * 12; put(cottage, x, z, { s: 3.6, yaw: side * 0.9, tint: 0xc9d6ea }); put(logs, x - side * 4, z + 3, { s: 2.2, yaw: 0.7 });
        put(fence, x - side * 5, z - 5, { s: 2.4 }); ring(x + side * 3, z, 4, 4.5, 7, (px, pz) => put(spruce, px, pz, { s: 2 + rand(), tufts: 0 }));
      },
      (z, side) => { // ice cliff with crystal veins
        const x = side * 18; put(cliff, x, z, { s: 8, yaw: side * 1.57, tufts: 0 }); put(cliff, x - side * 3, z + 7, { s: 5, yaw: side * 1.2, tufts: 0 });
        ring(x - side * 6, z, 4, 1, 4, (px, pz) => put(crystal, px, pz, { s: 2 + rand(), tufts: 0 }));
      },
      (z, side) => { // ranger winter camp
        const x = side * 10;
        put(tent, x, z - 1, { s: 3.2, yaw: side * 1.3, tint: 0xc8d8f0 }); put(tent, x + side * 3.6, z + 3, { s: 2.8, yaw: side * 0.6, tint: 0xf0c8c8 }); put(fire, x - side * 2.3, z + 2, { s: 2.2 });
        put(logs, x - side * 3.8, z + 0.5, { s: 2.2, yaw: 0.7 });
        ctx.glow(new THREE.ConeGeometry(0.35, 0.9, 7), x - side * 2.3, ctx.H(x - side * 2.3, z + 2) + 0.55, z + 2, 0xff9a3a, 1.7);
        ring(x + side * 6, z, 4, 1, 3, (px, pz) => put(spruce, px, pz, { s: 2.2, tufts: 0 }));
      },
      (z, side) => { // grove of round winter trees and drifts
        const x = side * 11;
        ring(x, z, 5, 2, 5, (px, pz) => put(tree, px, pz, { s: 2.2 + rand() * 0.8, tint: 0xdfe8f8, tufts: 0 })); ring(x, z, 4, 1, 5, (px, pz) => put(drift, px, pz, { s: 1.6, tufts: 0, tint: snowy() }));
      },
    ];
    views.forEach(([a, b], i) => landmark[i % landmark.length]((a + b) / 2, i % 2 ? 1 : -1));
  } else {
    const [basalt, fossil, fissure, cliff, rock, tent, fire, pillar] = await Promise.all([
      ctx.model('fw_basalt_columns'), ctx.model('fw_petra_raw_fossil'), ctx.model('fw_lava_fissure'), ctx.model('fw_cliff_corner'),
      ctx.old('ROCK'), ctx.kenney('nature/tent_detailedOpen'), ctx.kenney('nature/campfire_stones'), ctx.model('fw_pillar_carved'),
    ]);
    const char = () => ctx.tint([2.6, 2.0, 2.0], 0.25);
    // near framing: glowing cracks beside the road, small basalt stubs and rocks that pass close
    spread((side, z) => { if (rand() < 0.6) ctx.glowCrack(side * (edge + 1.2 + rand() * 2), z, 1.4 + rand() * 1.8, rand() * 3); }, 2.4, 1);
    spread((side, z, i) => { if (i % 3 === 1) put(basalt, side * (edge + 2.2 + rand() * 1.2), z, { s: 0.7 + rand() * 0.6, yaw: rand() * 6.3, tufts: 0, tint: char() }); }, 4.6, 2);
    spread((side, z, i) => { if (i % 4 === 2) put(rock, side * (edge + 1.4 + rand()), z, { s: 0.9 + rand() * 0.8, yaw: rand() * 6.3, sink: 0.15, tint: 0xb89a9a }); }, 4, 2);
    for (let z = -13, i = 0; z > -P; z -= 14, i++) {
      const side = i % 2 ? 1 : -1; if (inView(z, side)) continue;
      const cx = side * (edge + 6.5 + rand() * 5);
      ring(cx, z, 3, 1, 3, (x, zz) => put(basalt, x, zz, { s: 1.4 + rand() * 1.2, yaw: rand() * 6.3, tufts: 0, tint: char() }));
      put(fossil, cx + (rand() - 0.5) * 3, z + 3, { s: 1.8 + rand(), yaw: rand() * 6.3, tufts: 0 });
      ring(cx, z, 3, 2, 4, (x, zz) => ctx.glowCrack(x, zz, 1.8, rand() * 3));
    }
    for (const side of [-1, 1]) for (let z = -3; z > -P; z -= 14) put(cliff, side * (28 + rand() * 18), z + rand() * 6, { s: 4.5 + rand() * 3.5, yaw: rand() * 6.3, tufts: 0 });
    for (const side of [-1, 1]) for (let z = -6; z > -P; z -= 8) put(basalt, side * (19 + rand() * 24), z + rand() * 4, { s: 2.8 + rand() * 2.4, yaw: rand() * 6.3, tufts: 0, tint: char() });
    const landmark = [
      (z, side) => { // basalt crown: a ring of tall columns around a glowing pool
        const x = side * 15; ctx.disc(x, z, 3, 0xff6a20, 0.01, true); ring(x, z, 8, 3.6, 4.8, (px, pz) => put(basalt, px, pz, { s: 2.2 + rand() * 1.4, yaw: rand() * 6.3, tufts: 0, tint: char() }));
      },
      (z, side) => { // lava stream running beside the road, basalt lips either side
        const x = side * 13; ctx.stream(x, z, 22, 3);
        for (let k = -3; k <= 3; k++) put(rock, x + side * 3, z + k * 3, { s: 1.4 + rand(), sink: 0.15, yaw: rand() * 6, tint: 0x9a7a7a });
        put(basalt, x - side * 4, z, { s: 3, tufts: 0, tint: char() });
      },
      (z, side) => { // fossil dig site: tents, fire, fossils
        const x = side * 10;
        put(tent, x, z - 1, { s: 3.2, yaw: side * 1.3, tint: 0xa8a0a8 }); put(tent, x + side * 3.6, z + 3, { s: 2.8, yaw: side * 0.6, tint: 0xa8a0a8 }); put(fire, x - side * 2.3, z + 2, { s: 2.2 });
        ctx.glow(new THREE.ConeGeometry(0.35, 0.9, 7), x - side * 2.3, ctx.H(x - side * 2.3, z + 2) + 0.55, z + 2, 0xff9a3a, 1.7);
        for (let k = 0; k < 3; k++) put(fossil, x + side * (5 + k * 2.4), z - 3 + k * 3, { s: 2 + rand(), yaw: rand() * 6.3, tufts: 0 });
      },
      (z, side) => { // cliff wall with pillars
        const x = side * 18; put(cliff, x, z, { s: 9, yaw: side * 0.8, tufts: 0 });
        ring(x - side * 6, z, 4, 1, 4, (px, pz) => put(pillar, px, pz, { s: 2 + rand(), tufts: 0, tint: char() }));
      },
      (z, side) => { // fissure field
        const x = side * 11;
        ring(x, z, 7, 1, 6, (px, pz) => ctx.glowCrack(px, pz, 3 + rand() * 2, rand() * 3)); put(fossil, x + side * 5, z, { s: 2.6, tufts: 0 }); put(basalt, x + side * 7, z + 4, { s: 3, tufts: 0, tint: char() });
      },
    ];
    views.forEach(([a, b], i) => landmark[i % landmark.length]((a + b) / 2, i % 2 ? 1 : -1));
  }
}
