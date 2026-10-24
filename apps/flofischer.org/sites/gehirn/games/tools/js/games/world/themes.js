/**
 * The four worlds of the Fernhaven universe (docs/games/UNIVERSE.md): colours, terrain character, the sculpted props
 * that grow on each island (tools/games-assets/models/<NAME>.lo.json, from scripts/games-sculpt/props.js), its liquid
 * (pond, stream and the fall over the rim), grass, sky and landmark.
 */
import { THREE } from '../three-kit.js';

const C = (hex) => new THREE.Color(hex);

export const THEMES = {
  meadow: {
    name: 'Fernhaven Meadows',
    ground: [C(0x5fae42), C(0x86c957), C(0xaedb72)], path: C(0xdcc493), soil: C(0x7a5434), rock: [C(0x9a8a78), C(0x5e5249)], stone: 0xd8d0c2,
    hills: 0.55, dome: 0.5,
    sky: { top: 0x4f9ef0, horizon: 0xdff1ff, fog: 0xcfe7fb, below: 0x9fcdf2 },
    grass: { count: 5200, colour: [0.27, 0.55, 0.3], height: 0.2 },
    flowers: { count: 420, colours: [0xffffff, 0xfff2a8, 0xf2a6c4, 0xb9a6f2] },
    liquid: { colour: 0x4fb7e8, deep: 0x2f7fb8, foam: 0xffffff, glow: false },
    roots: 0x6b4a2e, islets: 'TREE_ROUND',
    props: [
      { name: 'TREE_ROUND', tall: true, count: 22, room: 1.15, shadow: 1.1, scale: [0.85, 1.25], tint: [0x9fe08a, 0xffffff, 0xd8f0a8] },
      { name: 'BUSH', count: 28, room: 0.7, shadow: 0.5, scale: [0.8, 1.2] },
      { name: 'ROCK', count: 10, room: 0.7, shadow: 0.4, scale: [0.6, 1.1] },
      { name: 'COTTAGE', tall: true, count: 5, room: 1.7, shadow: 1.0, scale: [0.95, 1.1], tint: [0xffffff, 0xfff0e0, 0xffe4d8] },
    ],
    landmark: { name: 'WINDMILL', shadow: 2.0, spin: 0.7 },
    particles: { kind: 'butterfly', colour: 0xfff2a8, count: 18 },
  },
  dunes: {
    name: 'Sunbake Dunes',
    ground: [C(0xe2aa62), C(0xefc37f), C(0xf7dca2)], path: C(0xb98a55), soil: C(0xa0583a), rock: [C(0xc4714a), C(0x7a3a26)], stone: 0xd9b07c,
    hills: 0.7, dome: 0.4,
    sky: { top: 0x5f93db, horizon: 0xffd6a0, fog: 0xf6dcb4, below: 0xe8b88a },
    grass: { count: 600, colour: [0.11, 0.42, 0.45], height: 0.2 },
    flowers: null,
    liquid: { colour: 0x3fc4d8, deep: 0x1f8aa8, foam: 0xe8fbff, glow: false },
    roots: null, islets: 'CACTUS',
    props: [
      { name: 'CACTUS', tall: true, count: 16, room: 0.9, shadow: 0.55, scale: [0.8, 1.3] },
      { name: 'DESERT_ROCK', count: 14, room: 0.9, shadow: 0.6, scale: [0.7, 1.4] },
      { name: 'PALM', tall: true, count: 6, room: 1.0, shadow: 0.8, scale: [0.9, 1.2], nearWater: true },
    ],
    landmark: { name: 'MESA', shadow: 2.8 },
    particles: { kind: 'dust', colour: 0xffe7c0, count: 40 },
  },
  frost: {
    name: 'Frostpeak',
    ground: [C(0xe4eef8), C(0xf3f8ff), C(0xffffff)], path: C(0xa9c1d9), soil: C(0x6f7f94), rock: [C(0x8296b0), C(0x4c5a70)], stone: 0xb9cde2,
    hills: 0.8, dome: 0.6,
    sky: { top: 0x3f78c8, horizon: 0xe6f3ff, fog: 0xdcebfa, below: 0xa9c6e6 },
    grass: null,
    flowers: null,
    liquid: { colour: 0xbfe6ff, deep: 0x8cc4ea, foam: 0xffffff, glow: false, frozen: true },
    roots: null, icicles: true, islets: 'PINE_SNOW',
    props: [
      { name: 'PINE_SNOW', tall: true, count: 28, room: 0.95, shadow: 1.0, scale: [0.8, 1.35] },
      { name: 'SNOW_ROCK', count: 10, room: 0.7, shadow: 0.4, scale: [0.7, 1.2] },
      { name: 'ICE_CRYSTAL', count: 10, room: 0.8, shadow: 0.2, scale: [0.8, 1.4] },
    ],
    landmark: { name: 'OBSERVATORY', shadow: 2.0 },
    particles: { kind: 'snow', colour: 0xffffff, count: 140 },
  },
  ember: {
    name: 'Ember Isles',
    ground: [C(0x3a3134), C(0x4a3d3c), C(0x5a4a46)], path: C(0x6e5a50), soil: C(0x2a2022), rock: [C(0x3a3134), C(0x1a1415)], stone: 0x7d6a5e,
    hills: 0.9, dome: 0.5, landmarkHill: 0,
    sky: { top: 0x2a1b40, horizon: 0xe0704a, fog: 0x5a3040, below: 0x3a2034 },
    grass: { count: 500, colour: [0.06, 0.35, 0.22], height: 0.16 },
    flowers: null,
    liquid: { colour: 0xff6a1f, deep: 0xc8300f, foam: 0xffd27a, glow: true },
    roots: null, islets: 'FERNSTONE',
    props: [
      { name: 'BASALT', tall: true, count: 18, room: 0.9, shadow: 0.6, scale: [0.7, 1.3] },
      { name: 'FERNSTONE', count: 12, room: 0.8, shadow: 0.2, scale: [0.8, 1.4] },
    ],
    landmark: { name: 'VOLCANO', shadow: 2.5 },
    particles: { kind: 'ember', colour: 0xff9a4a, count: 60 },
    sky_prop: 'UFO',
  },
};
export const WORLD_ORDER = ['meadow', 'dunes', 'frost', 'ember'];
