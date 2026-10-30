/** Region compositions for the four arena slabs. Everything stands outside the playable radius on the slab terrace
 * (back and sides tall, the camera side low so it never hides the field), on islets and in the cloud sea below. */
import { islandLayout } from './arena-slab.js';

const D = Math.PI / 180;
/** Rotation about Y that lays a piece's local x axis along the circle at polar angle `a`. */
export const tangent = (a) => -(a + Math.PI / 2);

/** ids every scene may place (the arena prepares exactly these from the library). */
export const SCENE_MODELS = [
  'fw_cloud_cumulus', 'fw_cloud_weather_wisp', 'fw_fog_low_bank',
  'fw_wall_stone_arch', 'fw_pillar_carved', 'fw_roof_gentle', 'fw_roof_ridge', 'fw_street_light_sporecell', 'fw_fence_oak', 'fw_bench_oak',
  'fw_granite_moss', 'fw_sandstone_bedded', 'fw_basalt_columns', 'fw_ice_crystal_cluster', 'fw_snow_wind_drift', 'fw_lava_fissure',
  'fw_market_stall', 'fw_petra_raw_fossil', 'fw_wayfinding_sign', 'fw_stairs_stone',
  'woodland_oak_old', 'woodland_palm_sahrun', 'woodland_spruce_tiered', 'woodland_birch_young', 'woodland_bush_flowering', 'woodland_bush_hazel', 'woodland_fallen_log', 'woodland_stump_rings',
  'meadow_reed', 'meadow_grass_short', 'meadow_fern_rosette', 'meadow_clover', 'meadow_moss', 'meadow_mushrooms',
];

/** Approximate model heights (metres at size 1): anything taller than a fox-sized screen fraction keeps clear of the field. */
const HEIGHT = { fw_wall_stone_arch: 2.6, fw_pillar_carved: 2.6, fw_street_light_sporecell: 2.5, fw_market_stall: 2.2, fw_sandstone_bedded: 1.2, fw_granite_moss: 1.3, fw_basalt_columns: 1.7, fw_ice_crystal_cluster: 1.6, woodland_oak_old: 3, woodland_palm_sahrun: 2.6, woodland_spruce_tiered: 3.2, woodland_birch_young: 3.1, fw_wayfinding_sign: 1.9 };
const FOOT = [0x3f7d24, 0xa8803f, 0x9db8cf, 0x2a2229];
const WATER = 0x3ab4d0;

/**
 * ctx: place(id, x, y, z, ry, size, tint), patch(x, y, z, radius, colour), rand(), R (playable radius), S (slab radius),
 * cover(x, y, z, count, spread, size) sprinkles the world's low plants.
 */
export function composeScenery(world, ctx) {
  const { place, rand, R, S } = ctx, polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  const at = (id, a, r, size, { y = 0, spin = null, foot = 0.55, tint = 0xffffff, cover = 3 } = {}) => {
    if ((HEIGHT[id] ?? 0) * size > 1.5 && Math.sin(a) < 0.45) r = Math.max(r, R + 5.4);
    const [x, z] = polar(a, r);
    if (foot) ctx.patch(x, y, z, size * foot, FOOT[world]);
    place(id, x, y, z, spin ?? rand() * 6.28, size, tint);
    if (cover) ctx.cover(x, y, z, Math.min(cover, 1), size * foot * 1.25, 0.8);
  };
  const arc = (from, to, n, fn) => { n = n > 3 ? Math.ceil(n * 0.75) : n; for (let i = 0; i < n; i++) fn(from * D + (n === 1 ? 0 : (i / (n - 1)) * (to - from) * D), i); };
  const back = [-165, -15], front = [25, 155];
  // every slab: carved wayfinding sign at the road end of the foreground, a few low lamps on the terrace
  at('fw_wayfinding_sign', 90 * D, R + 2.6, 1.0, { spin: tangent(90 * D), foot: 0.5, cover: 0 });
  arc(back[0], back[1], 7, (a, i) => { if (i % 2 === 0 && world !== 3) at('fw_street_light_sporecell', a, R + 1.6, 1.0, { spin: -a, foot: 0.3, cover: 0 }); });

  if (world === 0) {
    // cloister: an arcaded wall with a roof behind the back half, flanked by old oaks; low hedge and fence in front
    arc(-148, -32, 6, (a) => {
      const [x, z] = polar(a, R + 6.2);
      place('fw_wall_stone_arch', x, 0, z, tangent(a), 1.5, 0xffffff);
      place('fw_roof_gentle', x, 3.9, z, tangent(a), [1.6, 0.9, 1.1], 0xffffff);
      ctx.patch(x, 0, z, 1.7, FOOT[0]);
    });
    arc(-143, -37, 5, (a) => at('fw_pillar_carved', a, R + 3.4, 1.15, { foot: 0.9, cover: 4 }));
    for (const a of [-132, -48]) at('woodland_oak_old', a * D, R + 7.6, 2.9, { foot: 0.6, cover: 6 });
    for (const a of [-12, 192]) at('woodland_oak_old', a * D, R + 6.6, 2.4, { foot: 0.6, cover: 6 });
    arc(-20, 20, 5, (a, i) => at(i % 2 ? 'fw_granite_moss' : 'woodland_bush_flowering', a, R + 3.6 + (i % 2) * 1.4, i % 2 ? 1.8 : 1.5, { cover: 5 }));
    arc(160, 200, 5, (a, i) => at(i % 2 ? 'fw_granite_moss' : 'woodland_bush_flowering', a, R + 3.6 + (i % 2) * 1.4, i % 2 ? 1.8 : 1.5, { cover: 5 }));
    arc(front[0], front[1], 12, (a, i) => at(i % 3 === 1 ? 'woodland_bush_hazel' : 'woodland_bush_flowering', a, R + 2.8 + rand() * 1.1, 0.95 + rand() * 0.3, { foot: 0.5, cover: 3 }));
    arc(40, 140, 7, (a) => { const [x, z] = polar(a, R + 1.9); place('fw_fence_oak', x, 0, z, tangent(a), 1.0, 0xffffff); });
  } else if (world === 1) {
    // oasis ruin: sandstone mesas behind, a broken colonnade and arch, palms and an oasis pond on the east side, stalls on the west
    arc(-160, -20, 7, (a, i) => at('fw_sandstone_bedded', a, R + 7 + (i % 2) * 0.8, 3.9 + (i % 3) * 1.3, { foot: 0.85, cover: 2, tint: i % 2 ? 0xf2dcb4 : 0xe4c493 }));
    arc(-120, -60, 3, (a, i) => at('fw_sandstone_bedded', a, R + 8.2, 4.6 - i * 0.5, { y: 0, foot: 0.8, cover: 0, tint: 0xeed3a2 }));
    at('fw_wall_stone_arch', -90 * D, R + 4.2, 2.2, { spin: tangent(-90 * D), foot: 1.1, cover: 4, tint: 0xf2d7ac });
    for (const a of [-104, -76]) at('fw_pillar_carved', a * D, R + 4.3, 1.5, { foot: 0.8, cover: 3, tint: 0xf2d7ac });
    arc(-140, -112, 3, (a) => at('fw_pillar_carved', a, R + 3.8, 1.2, { foot: 0.7, cover: 3, tint: 0xf2d7ac }));
    arc(-68, -40, 3, (a) => at('fw_pillar_carved', a, R + 3.8, 1.2, { foot: 0.7, cover: 3, tint: 0xf2d7ac }));
    const [px, pz] = polar(12 * D, R + 6.2);
    ctx.patch(px, 0, pz, 4.2, 0xf6e2ae); ctx.patch(px, 0.002, pz, 3.2, WATER);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; place(k % 2 ? 'woodland_palm_sahrun' : 'meadow_reed', px + Math.cos(a) * 3.9, 0, pz + Math.sin(a) * 3.9, a, k % 2 ? 2.4 + rand() * 0.5 : 1.5, 0xffffff); }
    arc(-30, 5, 3, (a) => at('woodland_palm_sahrun', a, R + 4.6, 2.5, { foot: 0.5, cover: 3 }));
    arc(175, 205, 3, (a) => at('woodland_palm_sahrun', a, R + 4.6, 2.5, { foot: 0.5, cover: 3 }));
    at('fw_market_stall', 168 * D, R + 4.6, 1.7, { spin: tangent(168 * D), foot: 0.9, cover: 2 });
    at('fw_market_stall', 192 * D, R + 4.9, 1.7, { spin: tangent(192 * D), foot: 0.9, cover: 2 });
    arc(front[0], front[1], 10, (a, i) => at(i % 3 === 0 ? 'fw_petra_raw_fossil' : 'meadow_reed', a, R + 2.8 + rand() * 1.1, i % 3 === 0 ? 1.1 : 1.1, { foot: 0.4, cover: 2 }));
  } else if (world === 2) {
    // frost archive: crystal clusters and snow-laden spruces behind, drifts at every foot, a ruined arch at the road end
    arc(-165, -15, 8, (a, i) => at('fw_ice_crystal_cluster', a, R + 5 + (i % 2) * 2.2, 3.2 + (i % 3) * 1.1, { foot: 0.9, cover: 0 }));
    arc(-170, -10, 9, (a, i) => at('woodland_spruce_tiered', a, R + 7.4 + (i % 3) * 0.9, 2.5 + (i % 2) * 0.6, { foot: 0.6, cover: 0, tint: 0xe3eef5 }));
    arc(-150, -30, 7, (a, i) => at('fw_snow_wind_drift', a, R + 3.2 + (i % 2) * 1.0, 1.7, { foot: 0, cover: 0 }));
    at('fw_wall_stone_arch', -90 * D, R + 3.6, 2.0, { spin: tangent(-90 * D), foot: 1.0, cover: 0, tint: 0xdce8ee });
    for (const a of [-98, -82]) at('fw_pillar_carved', a * D, R + 3.7, 1.3, { foot: 0.8, cover: 0, tint: 0xdce8ee });
    for (const a of [-5, 185]) at('woodland_birch_young', a * D, R + 4.4, 2.1, { foot: 0.6, cover: 0, tint: 0xe3eef5 });
    arc(-22, 22, 5, (a, i) => at(i % 2 ? 'fw_ice_crystal_cluster' : 'fw_snow_wind_drift', a, R + 3.4 + (i % 2) * 1.2, i % 2 ? 1.6 : 1.9, { foot: i % 2 ? 0.8 : 0, cover: 0 }));
    arc(158, 202, 5, (a, i) => at(i % 2 ? 'fw_ice_crystal_cluster' : 'fw_snow_wind_drift', a, R + 3.4 + (i % 2) * 1.2, i % 2 ? 1.6 : 1.9, { foot: i % 2 ? 0.8 : 0, cover: 0 }));
    arc(front[0], front[1], 10, (a, i) => at(i % 3 === 1 ? 'fw_ice_crystal_cluster' : 'fw_snow_wind_drift', a, R + 2.8 + rand() * 1.1, i % 3 === 1 ? 0.8 : 1.3, { foot: i % 3 === 1 ? 0.5 : 0, cover: 0 }));
  } else {
    // ash abbey: basalt organ behind, lava seams across the terrace, broken pillars, charred logs
    arc(-165, -15, 9, (a, i) => at('fw_basalt_columns', a, R + 5 + (i % 3) * 1.2, 3.2 + (i % 3) * 1.2, { foot: 0.9, cover: 2, tint: i % 2 ? 0xbfb2ae : 0xa99a98 }));
    arc(-150, -30, 5, (a, i) => at('fw_lava_fissure', a + 0.12, R + 3.0 + (i % 2) * 2.4, 2.1, { foot: 0, cover: 0, tint: 0xffa24a }));
    at('fw_wall_stone_arch', -90 * D, R + 4.2, 2.0, { spin: tangent(-90 * D), foot: 1.0, cover: 2, tint: 0x8d8590 });
    for (const a of [-104, -76]) at('fw_pillar_carved', a * D, R + 4.3, 1.4, { foot: 0.8, cover: 2, tint: 0x8d8590 });
    arc(-30, 22, 4, (a, i) => at(i % 2 ? 'woodland_fallen_log' : 'fw_basalt_columns', a, R + 3.8, i % 2 ? 1.5 : 2.2, { foot: 0.8, cover: 2, tint: i % 2 ? 0x4a3d3a : 0xa99a98 }));
    arc(158, 205, 4, (a, i) => at(i % 2 ? 'woodland_stump_rings' : 'fw_basalt_columns', a, R + 3.8, i % 2 ? 1.5 : 2.2, { foot: 0.8, cover: 2, tint: i % 2 ? 0x4a3d3a : 0xa99a98 }));
    arc(front[0], front[1], 9, (a, i) => at(i % 3 === 1 ? 'fw_lava_fissure' : 'fw_basalt_columns', a, R + 2.8 + rand() * 1.1, i % 3 === 1 ? 1.1 : 0.9, { foot: i % 3 === 1 ? 0 : 0.6, cover: 0, tint: i % 3 === 1 ? 0xffa24a : 0xa99a98 }));
  }

  // islets drifting beside the slab, each with one landmark, and the cloud sea far below
  const kit = [['woodland_oak_old', 'woodland_bush_flowering', 'fw_granite_moss'], ['woodland_palm_sahrun', 'fw_sandstone_bedded', 'meadow_reed'], ['woodland_spruce_tiered', 'fw_ice_crystal_cluster', 'fw_snow_wind_drift'], ['fw_basalt_columns', 'fw_lava_fissure', 'fw_basalt_columns']][world];
  const isles = islandLayout(world, S, ctx.seed);
  isles.forEach((isle, k) => {
    ctx.islet(isle);
    place(kit[k % 3], isle.x, isle.y + 0.02, isle.z, rand() * 6.28, (k % 3 === 0 ? 1.9 : 1.6) * Math.min(1.4, isle.radius / 3), 0xffffff);
    if (false) place(kit[(k + 1) % 3], isle.x + isle.radius * 0.45, isle.y + 0.02, isle.z - isle.radius * 0.2, rand() * 6.28, 1.2, 0xffffff);
  });
  for (let k = 0; k < 16; k++) {
    const a = rand() * 6.283, r = S * (1.2 + rand() * 2.6), id = k % 6 === 0 ? 'fw_cloud_weather_wisp' : 'fw_cloud_cumulus';
    place(id, Math.cos(a) * r, -9 - rand() * 9, Math.sin(a) * r, rand() * 6.28, 4 + rand() * 5, ctx.cloudTint);
  }
}
