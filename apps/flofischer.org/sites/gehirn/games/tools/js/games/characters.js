/**
 * Fernwork Games · our own characters, modelled from primitives (no external model files):
 *   Fern Ranger — chunky squad soldier in fern-green armour, cyan visor, blaster (Fern Rangers)
 *   Rotling     — hunched mauve mutant with a spotted mushroom cap and glowing eyes (Fern Rangers enemy; runner = orange cap)
 *   Moss Brute  — stone-and-moss golem with mushrooms on its shoulders (Fern Rangers heavy; tinted purple + crown = Rot King)
 *   Pip         — small adventurer with leather cap, goggles, orange scarf and a lantern (Pip’s Tower hero)
 *   Grumble     — stubby moss goblin with rock armour and a spiked club (Pip’s Tower enemy)
 * Each export is a part list for three-kit's Crowd. Characters face +z and stand on y = 0, about 1 unit tall.
 */
import { THREE } from './three-kit.js';

const capsule = (r, len, seg = 10) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
/** Mushroom cap: a lathe dome with a slightly rolled rim. */
function cap(r, h) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(Math.sin(t * Math.PI / 2) * r, Math.cos(t * Math.PI / 2) * h)); }
  pts.push(new THREE.Vector2(r * 0.96, -h * 0.12), new THREE.Vector2(r * 0.5, -h * 0.1), new THREE.Vector2(0.001, -h * 0.08));
  return new THREE.LatheGeometry(pts, 18);
}
/** Front half of a sphere shell (visors, goggles glass). */
const visor = (r) => new THREE.SphereGeometry(r, 18, 10, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.32, Math.PI * 0.26);

const P = (geo, color, o = {}) => ({ geo, color, ...o });

// ── Fern Ranger ──
const GREEN = 0x3f9b4a, GREEN_D = 0x2c6e35, GREEN_L = 0x8fd694, DARK = 0x2b2f36, CYAN = 0x41e3ff;
export const FERN_RANGER = [
  P(box(0.13, 0.1, 0.2), DARK, { pos: [-0.09, 0.05, 0.02], anim: 'legL', pivot: [0, 0.32, 0] }),
  P(box(0.13, 0.1, 0.2), DARK, { pos: [0.09, 0.05, 0.02], anim: 'legR', pivot: [0, 0.32, 0] }),
  P(capsule(0.065, 0.14), GREEN_D, { pos: [-0.09, 0.2, 0], anim: 'legL', pivot: [0, 0.32, 0] }),
  P(capsule(0.065, 0.14), GREEN_D, { pos: [0.09, 0.2, 0], anim: 'legR', pivot: [0, 0.32, 0] }),
  P(capsule(0.17, 0.1), GREEN, { pos: [0, 0.5, 0], scale: [1, 1, 0.82], anim: 'body', tintable: true }),
  P(cyl(0.165, 0.165, 0.05, 14), DARK, { pos: [0, 0.33, 0], anim: 'body' }),
  P(sphere(0.15, 14, 10), GREEN_L, { pos: [0, 0.53, 0.09], scale: [1, 0.85, 0.5], anim: 'body' }),
  P(sphere(0.045, 10, 8), 0xffffff, { pos: [0, 0.56, 0.165], scale: [0.7, 1, 0.3], anim: 'body', emissive: 0x7ee08a, emissiveIntensity: 0.6 }),
  P(box(0.3, 0.3, 0.16), 0x2f7a3a, { pos: [0, 0.53, -0.17], anim: 'body', roughness: 0.6 }),
  P(box(0.32, 0.06, 0.18), DARK, { pos: [0, 0.4, -0.17], anim: 'body' }),
  P(sphere(0.07, 10, 8), GREEN_L, { pos: [0, 0.56, -0.255], scale: [0.75, 1.15, 0.25], rot: [0, 0, 0.5], anim: 'body', emissive: 0x7ee08a, emissiveIntensity: 0.35 }),
  P(sphere(0.09, 12, 8), GREEN_L, { pos: [-0.2, 0.66, 0], scale: [1, 0.7, 1], anim: 'body' }),
  P(sphere(0.09, 12, 8), GREEN_L, { pos: [0.2, 0.66, 0], scale: [1, 0.7, 1], anim: 'body' }),
  P(capsule(0.052, 0.16), GREEN, { pos: [-0.17, 0.5, 0.12], rot: [-1.15, 0, 0.15], anim: 'recoil' }),
  P(capsule(0.052, 0.16), GREEN, { pos: [0.17, 0.5, 0.12], rot: [-1.15, 0, -0.15], anim: 'recoil' }),
  P(box(0.08, 0.09, 0.4), DARK, { pos: [0.06, 0.47, 0.32], anim: 'recoil', metalness: 0.4, roughness: 0.35 }),
  P(box(0.084, 0.022, 0.3), 0xffffff, { pos: [0.06, 0.525, 0.3], anim: 'recoil', emissive: CYAN, emissiveIntensity: 1.6, noShadow: true }),
  P(sphere(0.055, 10, 8), DARK, { pos: [-0.02, 0.45, 0.24], anim: 'recoil' }),
  P(sphere(0.165, 18, 14), 0x2f7d3a, { pos: [0, 0.82, 0], anim: 'head', tintable: true, roughness: 0.35 }),
  P(new THREE.TorusGeometry(0.12, 0.022, 6, 20), GREEN_L, { pos: [0, 0.93, 0], rot: [Math.PI / 2, 0, 0], anim: 'head' }),
  P(new THREE.TorusGeometry(0.163, 0.026, 6, 20), DARK, { pos: [0, 0.8, 0], rot: [Math.PI / 2, 0, 0], anim: 'head' }),
  P(visor(0.17), 0xffffff, { pos: [0, 0.81, 0], anim: 'head', emissive: CYAN, emissiveIntensity: 1.3, roughness: 0.15, noShadow: true }),
];

// ── Rotling ──
const MAUVE = 0xa06aa8, RAG = 0x2f8f8a, CAPRED = 0xe8552d, CREAM = 0xfff1d0, EYE = 0xffe14a;
export const ROTLING = [
  P(capsule(0.06, 0.16), 0x3c3446, { pos: [-0.09, 0.17, 0], anim: 'legL', pivot: [0, 0.32, 0] }),
  P(capsule(0.06, 0.16), 0x3c3446, { pos: [0.09, 0.17, 0], anim: 'legR', pivot: [0, 0.32, 0] }),
  P(cyl(0.17, 0.23, 0.2, 10), RAG, { pos: [0, 0.38, 0], anim: 'body', tintable: true, flat: true }),
  P(capsule(0.17, 0.12), MAUVE, { pos: [0, 0.55, 0.03], rot: [0.35, 0, 0], anim: 'body' }),
  P(capsule(0.048, 0.24), MAUVE, { pos: [-0.17, 0.6, 0.16], rot: [-1.35, 0, 0.1], anim: 'armL', pivot: [-0.17, 0.66, 0], armBase: 0 }),
  P(capsule(0.048, 0.24), MAUVE, { pos: [0.17, 0.6, 0.16], rot: [-1.35, 0, -0.1], anim: 'armR', pivot: [0.17, 0.66, 0], armBase: 0 }),
  P(sphere(0.155, 16, 12), MAUVE, { pos: [0, 0.83, 0.1], anim: 'head' }),
  P(sphere(0.035, 8, 6), 0xffffff, { pos: [-0.06, 0.85, 0.23], anim: 'head', emissive: EYE, emissiveIntensity: 2, noShadow: true }),
  P(sphere(0.035, 8, 6), 0xffffff, { pos: [0.06, 0.85, 0.23], anim: 'head', emissive: EYE, emissiveIntensity: 2, noShadow: true }),
  P(box(0.14, 0.05, 0.02), 0x2a1530, { pos: [0, 0.76, 0.235], anim: 'head', noShadow: true }),
  P(new THREE.ConeGeometry(0.014, 0.04, 4), 0xfffbe8, { pos: [-0.035, 0.775, 0.245], rot: [Math.PI, 0, 0], anim: 'head', noShadow: true }),
  P(new THREE.ConeGeometry(0.014, 0.04, 4), 0xfffbe8, { pos: [0.035, 0.775, 0.245], rot: [Math.PI, 0, 0], anim: 'head', noShadow: true }),
  P(cap(0.27, 0.17), CAPRED, { pos: [0, 0.94, 0.08], rot: [0.15, 0, 0], anim: 'head', tintable: true, roughness: 0.45 }),
  P(sphere(0.045, 8, 6), CREAM, { pos: [0.09, 1.07, 0.1], scale: [1, 0.45, 1], anim: 'head', noShadow: true }),
  P(sphere(0.035, 8, 6), CREAM, { pos: [-0.11, 1.04, 0.0], scale: [1, 0.45, 1], anim: 'head', noShadow: true }),
  P(sphere(0.03, 8, 6), CREAM, { pos: [0.0, 1.06, -0.12], scale: [1, 0.45, 1], anim: 'head', noShadow: true }),
  P(sphere(0.032, 8, 6), CREAM, { pos: [-0.04, 1.04, 0.2], scale: [1, 0.45, 1], anim: 'head', noShadow: true }),
];
export const ROTLING_CAP = { zombie: new THREE.Color(CAPRED), runner: new THREE.Color(0xf6a21c) };

// ── Moss Brute ──
const STONE = 0x7c8571, MOSS = 0x4e9a3c;
export const MOSS_BRUTE = [
  P(capsule(0.13, 0.18), 0x5a6253, { pos: [-0.2, 0.22, 0], anim: 'legL', pivot: [0, 0.45, 0], flat: true }),
  P(capsule(0.13, 0.18), 0x5a6253, { pos: [0.2, 0.22, 0], anim: 'legR', pivot: [0, 0.45, 0], flat: true }),
  P(new THREE.IcosahedronGeometry(0.5, 1), STONE, { pos: [0, 0.92, 0], scale: [1.1, 0.95, 0.85], anim: 'body', tintable: true, flat: true }),
  P(new THREE.IcosahedronGeometry(0.22, 1), MOSS, { pos: [-0.38, 1.22, 0], scale: [1, 0.6, 1], anim: 'body', flat: true }),
  P(new THREE.IcosahedronGeometry(0.22, 1), MOSS, { pos: [0.38, 1.22, 0], scale: [1, 0.6, 1], anim: 'body', flat: true }),
  P(capsule(0.12, 0.42), STONE, { pos: [-0.56, 0.78, 0.12], rot: [-0.5, 0, 0.2], anim: 'armL', pivot: [-0.5, 1.1, 0], armBase: 0, tintable: true, flat: true }),
  P(capsule(0.12, 0.42), STONE, { pos: [0.56, 0.78, 0.12], rot: [-0.5, 0, -0.2], anim: 'armR', pivot: [0.5, 1.1, 0], armBase: 0, tintable: true, flat: true }),
  P(new THREE.IcosahedronGeometry(0.17, 1), 0x5a6253, { pos: [-0.62, 0.5, 0.32], anim: 'armL', pivot: [-0.5, 1.1, 0], flat: true }),
  P(new THREE.IcosahedronGeometry(0.17, 1), 0x5a6253, { pos: [0.62, 0.5, 0.32], anim: 'armR', pivot: [0.5, 1.1, 0], flat: true }),
  P(sphere(0.2, 14, 10), STONE, { pos: [0, 1.42, 0.18], anim: 'head', tintable: true }),
  P(sphere(0.045, 8, 6), 0xffffff, { pos: [-0.08, 1.45, 0.36], anim: 'head', emissive: EYE, emissiveIntensity: 2.2, noShadow: true }),
  P(sphere(0.045, 8, 6), 0xffffff, { pos: [0.08, 1.45, 0.36], anim: 'head', emissive: EYE, emissiveIntensity: 2.2, noShadow: true }),
  P(cap(0.16, 0.1), CAPRED, { pos: [-0.38, 1.36, 0.05], anim: 'body' }),
  P(cap(0.12, 0.08), 0xf6a21c, { pos: [0.42, 1.34, -0.05], anim: 'body' }),
  P(cap(0.1, 0.07), CAPRED, { pos: [0.25, 1.38, 0.15], anim: 'body' }),
];
export const ROT_KING_TINT = new THREE.Color(0x7a4fa8);

// ── Pip ──
const SKIN = 0xffd2a8, TEAL = 0x1f9e9a, LEATHER = 0x8a5a33, SCARF = 0xff7a2f;
export const PIP = [
  P(box(0.12, 0.09, 0.17), LEATHER, { pos: [-0.08, 0.045, 0.02], anim: 'legL', pivot: [0, 0.26, 0] }),
  P(box(0.12, 0.09, 0.17), LEATHER, { pos: [0.08, 0.045, 0.02], anim: 'legR', pivot: [0, 0.26, 0] }),
  P(capsule(0.055, 0.1), 0x3b3a5a, { pos: [-0.08, 0.17, 0], anim: 'legL', pivot: [0, 0.26, 0] }),
  P(capsule(0.055, 0.1), 0x3b3a5a, { pos: [0.08, 0.17, 0], anim: 'legR', pivot: [0, 0.26, 0] }),
  P(capsule(0.15, 0.1), TEAL, { pos: [0, 0.4, 0], scale: [1, 1, 0.85], anim: 'body', tintable: true }),
  P(cyl(0.155, 0.155, 0.04, 14), LEATHER, { pos: [0, 0.3, 0], anim: 'body' }),
  P(capsule(0.045, 0.16), TEAL, { pos: [-0.19, 0.4, 0], rot: [0, 0, 0.25], anim: 'armL', pivot: [-0.15, 0.5, 0], armBase: 0, tintable: true }),
  P(capsule(0.045, 0.16), TEAL, { pos: [0.19, 0.4, 0], rot: [0, 0, -0.25], anim: 'armR', pivot: [0.15, 0.5, 0], armBase: 0, tintable: true }),
  P(sphere(0.05, 10, 8), SKIN, { pos: [-0.23, 0.27, 0], anim: 'armL', pivot: [-0.15, 0.5, 0] }),
  P(cyl(0.05, 0.05, 0.1, 10), 0xffffff, { pos: [0.24, 0.19, 0.02], anim: 'armR', pivot: [0.15, 0.5, 0], emissive: 0xffc43d, emissiveIntensity: 2.2, noShadow: true }),
  P(new THREE.TorusGeometry(0.14, 0.05, 8, 18), SCARF, { pos: [0, 0.55, 0], rot: [Math.PI / 2, 0, 0], anim: 'body' }),
  P(box(0.08, 0.2, 0.04), SCARF, { pos: [0.08, 0.45, -0.13], rot: [0.3, 0, 0.2], anim: 'body' }),
  P(sphere(0.25, 20, 16), SKIN, { pos: [0, 0.8, 0], anim: 'head', tintable: true }),
  P(sphere(0.262, 20, 12), LEATHER, { pos: [0, 0.84, -0.02], scale: [1, 0.85, 1], rot: [-0.25, 0, 0], anim: 'head', tintable: true }),
  P(sphere(0.04, 8, 6), 0x1d1d24, { pos: [-0.085, 0.8, 0.225], anim: 'head', noShadow: true }),
  P(sphere(0.04, 8, 6), 0x1d1d24, { pos: [0.085, 0.8, 0.225], anim: 'head', noShadow: true }),
  P(sphere(0.035, 8, 6), 0xff9aa2, { pos: [-0.14, 0.74, 0.2], scale: [1, 0.6, 0.4], anim: 'head', noShadow: true }),
  P(sphere(0.035, 8, 6), 0xff9aa2, { pos: [0.14, 0.74, 0.2], scale: [1, 0.6, 0.4], anim: 'head', noShadow: true }),
  P(new THREE.TorusGeometry(0.06, 0.018, 6, 14), 0x6b4a2a, { pos: [-0.08, 0.98, 0.17], rot: [-0.5, 0, 0], anim: 'head' }),
  P(new THREE.TorusGeometry(0.06, 0.018, 6, 14), 0x6b4a2a, { pos: [0.08, 0.98, 0.17], rot: [-0.5, 0, 0], anim: 'head' }),
  P(sphere(0.05, 10, 8), 0x9ff1ff, { pos: [-0.08, 0.98, 0.17], scale: [1, 1, 0.4], rot: [-0.5, 0, 0], anim: 'head', roughness: 0.1, emissive: 0x2aa9c9, emissiveIntensity: 0.4 }),
  P(sphere(0.05, 10, 8), 0x9ff1ff, { pos: [0.08, 0.98, 0.17], scale: [1, 1, 0.4], rot: [-0.5, 0, 0], anim: 'head', roughness: 0.1, emissive: 0x2aa9c9, emissiveIntensity: 0.4 }),
];

// ── Grumble ──
const GOB = 0x6f9a2d, ROCK = 0x8b8f96;
export const GRUMBLE = [
  P(capsule(0.07, 0.08), 0x4a3b2a, { pos: [-0.1, 0.12, 0], anim: 'legL', pivot: [0, 0.22, 0] }),
  P(capsule(0.07, 0.08), 0x4a3b2a, { pos: [0.1, 0.12, 0], anim: 'legR', pivot: [0, 0.22, 0] }),
  P(sphere(0.23, 16, 12), GOB, { pos: [0, 0.42, 0], scale: [1, 0.95, 0.9], anim: 'body', tintable: true }),
  P(new THREE.IcosahedronGeometry(0.11, 0), ROCK, { pos: [-0.2, 0.55, 0.02], anim: 'body', flat: true }),
  P(new THREE.IcosahedronGeometry(0.11, 0), ROCK, { pos: [0.2, 0.55, 0.02], anim: 'body', flat: true }),
  P(new THREE.IcosahedronGeometry(0.1, 0), ROCK, { pos: [0, 0.4, 0.2], scale: [1.3, 0.9, 0.5], anim: 'body', flat: true }),
  P(capsule(0.05, 0.14), GOB, { pos: [-0.24, 0.36, 0.05], rot: [0, 0, 0.5], anim: 'armL', pivot: [-0.2, 0.48, 0], armBase: 0, tintable: true }),
  P(capsule(0.05, 0.14), GOB, { pos: [0.24, 0.4, 0.08], rot: [-0.6, 0, -0.4], anim: 'armR', pivot: [0.2, 0.48, 0], armBase: 0, tintable: true }),
  P(cyl(0.035, 0.05, 0.42, 8), 0x7a4b25, { pos: [0.3, 0.6, 0.2], rot: [0.3, 0, -0.3], anim: 'armR', pivot: [0.2, 0.48, 0] }),
  P(new THREE.IcosahedronGeometry(0.08, 0), 0x5b5f66, { pos: [0.37, 0.8, 0.27], anim: 'armR', pivot: [0.2, 0.48, 0], flat: true }),
  P(sphere(0.2, 16, 12), GOB, { pos: [0, 0.78, 0.04], anim: 'head', tintable: true }),
  P(new THREE.ConeGeometry(0.07, 0.26, 6), GOB, { pos: [-0.24, 0.84, 0], rot: [0, 0, 1.25], anim: 'head', tintable: true }),
  P(new THREE.ConeGeometry(0.07, 0.26, 6), GOB, { pos: [0.24, 0.84, 0], rot: [0, 0, -1.25], anim: 'head', tintable: true }),
  P(sphere(0.04, 8, 6), 0xffffff, { pos: [-0.07, 0.82, 0.2], anim: 'head', emissive: EYE, emissiveIntensity: 1.8, noShadow: true }),
  P(sphere(0.04, 8, 6), 0xffffff, { pos: [0.07, 0.82, 0.2], anim: 'head', emissive: EYE, emissiveIntensity: 1.8, noShadow: true }),
  P(box(0.03, 0.05, 0.02), 0xfffbe8, { pos: [-0.05, 0.69, 0.22], anim: 'head', noShadow: true }),
  P(box(0.03, 0.05, 0.02), 0xfffbe8, { pos: [0.05, 0.69, 0.22], anim: 'head', noShadow: true }),
];
