/**
 * Fern Rangers roadside dressing per world, built once as merged, vertex-coloured geometry that repeats every `P`
 * units of road: fences or barriers, hedges and snow banks, lamp posts with lit lanterns, signposts, flower clumps,
 * stones, ruins, crystals, the gravel shoulders and the solid edge lines. Scrolling is a single offset of the group
 * (`update(pos)`), so it costs no work per frame beyond its few draw calls; nothing here casts shadows.
 */
import { THREE } from '../three-kit.js';
import { Batch, mtx, rock, tuft, flower, fern, blob, rng } from './decor.js';
const WORLD = [
 {tuft:[[.08,.2,.05],[.34,.6,.18]],flowers:[0xffffff,0xfff2a8,0xf2a6c4],ferns:true,moss:.8,rock:[.6,.57,.52],wood:0x8a5a33,metal:0x3a3a40,torch:0xffb050},
 {tuft:[[.32,.36,.12],[.62,.62,.3]],flowers:[0xff7a4a,0xffd23f],moss:0,rock:[.78,.5,.34],wood:0x9a6a3a,metal:0x5a4030,torch:0xffa040},
 {tuft:[[.16,.3,.3],[.5,.66,.62]],flowers:[],moss:0,rock:[.52,.58,.68],wood:0x7a5a40,metal:0x4a5568,torch:0xffc070},
 {tuft:[[.08,.16,.12],[.2,.4,.3]],flowers:[],moss:0,rock:[.3,.26,.26],wood:0x4a3030,metal:0x2a2a34,torch:0xff8030},
];

export class RoadLoop {
  /** world 0–3; road: half width of the asphalt; P: repeat length (longer than the visible road). */
  constructor({ world = 0, road = 3, P = 128, low = false, dark = false }) {
    const W = WORLD[world] || WORLD[0], rand = rng(17 + world * 13);
    this.P = P;
    this.group = new THREE.Group();
    // chunks of CH units along the road, so the ones behind the camera or past the fog are skipped
    const CH = 32, NC = Math.ceil((2 * P) / CH);
    const chunks = Array.from({ length: NC }, () => ({ base: new Batch(), glow: new Batch() }));
    const ci = (z) => Math.max(0, Math.min(NC - 1, Math.floor(-z / CH)));
    const B = (z) => chunks[ci(z)].base, G = (z) => chunks[ci(z)].glow;
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 8), rbox = new THREE.BoxGeometry(1, 1, 1), ball = blob(1);
    const tufts = [0, 1].map((k) => tuft(rng(50 + k), 7, ...W.tuft));
    const flowers = W.flowers.map((c) => flower(c, c === 0xffd23f ? 0xff8a3d : 0xffd23f, c === 0xffffff ? 8 : 5));
    const rocks = [0, 1, 2].map((k) => rock(60 + k * 5 + world, { moss: W.moss, tone: W.rock }));
    const ferns = W.ferns ? [fern(rng(9))] : [];
    const wood = new THREE.Color(W.wood), metal = new THREE.Color(W.metal), lampC = new THREE.Color(W.torch).multiplyScalar(dark ? 2.4 : 1.8);
    // every item is laid out for local z in (−2P, 0], repeating with period P (two copies)
    // (random choices inside an item come from R(), reseeded per copy, so both copies match)
    let R = rand;
    const at = (fn) => { const seed = (rand() * 1e9) | 0; for (const off of [0, -P]) { R = rng(seed); fn(off); } R = rand; };
    const edge = road + 0.35;
    for (const side of [-1, 1]) {
      // fences / barriers in runs with gaps
      for (let z = 0; z > -P; z -= 2.5) {
        const run = Math.sin(z * 0.11 + side * 2) > -0.35;
        if (!run) continue;
        const x = side * (edge + 0.95);
        at((o) => {
          if (world === 0 || world === 2) {
            B(z + o).add(rbox, mtx([x, 0.42, z + o], [0, 0, 0], [0.13, 0.84, 0.13]), wood);
            for (const h of [0.34, 0.66]) B(z + o).add(box, mtx([x, h, z + o - 1.25], [0, 0, 0], [0.06, 0.09, 2.5]), wood.clone().multiplyScalar(1.12));
            if (world === 2) B(z + o).add(rbox, mtx([x, 0.88, z + o], [0, 0, 0], [0.2, 0.08, 0.2]), 0xffffff);
          } else if (world === 1) {
            B(z + o).add(rbox, mtx([x, 0.35, z + o], [0, 0, 0], [0.14, 0.7, 0.14]), wood);
            B(z + o).add(cyl, mtx([x, 0.58, z + o - 1.25], [Math.PI / 2, 0, 0], [0.025, 2.5, 0.025]), 0xd8c08a);
          } else {
            B(z + o).add(box, mtx([x, 0.3, z + o], [0, 0, 0], [0.12, 0.6, 0.12]), metal);
            B(z + o).add(box, mtx([x, 0.5, z + o - 1.25], [0, 0, 0], [0.08, 0.18, 2.5]), 0x3a3a46);
            G(z + o).add(box, mtx([x + side * 0.05, 0.5, z + o - 1.25], [0, 0, 0], [0.02, 0.04, 2.3]), new THREE.Color(0x2ad8c0).multiplyScalar(1.4));
          }
        });
      }
      // lamp posts every 24 units, alternating sides
      for (let z = side > 0 ? -12 : 0; z > -P; z -= 24) {
        const x = side * (edge + 0.55);
        at((o) => {
          const pole = metal.clone().lerp(new THREE.Color(0x6a7080), 0.5);
          B(z + o).add(cyl, mtx([x, 1.1, z + o], [0, 0, 0], [0.05, 2.2, 0.05]), pole);
          B(z + o).add(cyl, mtx([x, 0.1, z + o], [0, 0, 0], [0.1, 0.2, 0.1]), pole);
          B(z + o).add(box, mtx([x - side * 0.22, 2.15, z + o], [0, 0, 0], [0.5, 0.05, 0.05]), pole);
          B(z + o).add(box, mtx([x - side * 0.42, 1.86, z + o], [0, 0, 0], [0.26, 0.05, 0.26]), pole);
          B(z + o).add(new THREE.ConeGeometry(0.22, 0.16, 4), mtx([x - side * 0.42, 2.12, z + o], [0, Math.PI / 4, 0], 1), pole);
          G(z + o).add(box, mtx([x - side * 0.42, 1.98, z + o], [0, 0, 0], [0.18, 0.2, 0.18]), lampC);
        });
      }
      // flower clumps, grass and ferns on the verge, stones and the occasional boulder
      for (let k = 0; k < (low ? 24 : 90); k++) {
        const z = -rand() * P, x = side * (edge + 0.4 + Math.pow(rand(), 1.3) * 9);
        at((o) => {
          if (flowers.length && R() < 0.6) for (let f = 0; f < 3; f++) B(z + o).add(flowers[(R() * flowers.length) | 0], mtx([x + (R() - 0.5) * 0.6, 0, z + o + (R() - 0.5) * 0.6], [0, R() * 6, 0], 0.22 + R() * 0.12));
          else B(z + o).add(tufts[k & 1], mtx([x, 0, z + o], [0, R() * 6, 0], [0.5, 0.32 + R() * 0.2, 0.5]), world === 3 ? 0x8a6a6a : 0xffffff);
          if (ferns.length && R() < 0.15) B(z + o).add(ferns[0], mtx([x, 0, z + o], [0, R() * 6, 0], 0.6));
        });
      }
      for (let k = 0; k < (low ? 8 : 26); k++) {
        const z = -rand() * P, x = side * (edge + 0.5 + rand() * 10), s = 0.12 + rand() * (rand() < 0.15 ? 0.6 : 0.2);
        at((o) => B(z + o).add(rocks[k % 3], mtx([x, s * 0.2, z + o], [0, R() * 6, 0], [s * 1.3, s, s])));
      }
      // world features along the verge
      for (let k = 0; k < 7; k++) {
        const z = -((k + 0.3 + rand() * 0.4) / 7) * P, x = side * (edge + 2.2 + rand() * 4);
        at((o) => {
          if (world === 0) { // hedge rows and hay bales
            if (k % 2) B(z + o).add(ball, mtx([x, 0.45, z + o], [0, 0, 0], [0.8, 0.55, 2.6]), new THREE.Color(0x3f8a34).multiplyScalar(0.9 + R() * 0.2));
            else { B(z + o).add(cyl, mtx([x, 0.42, z + o], [0, 0, Math.PI / 2], [0.42, 0.9, 0.42]), 0xe0c070); B(z + o).add(cyl, mtx([x, 0.42, z + o], [0, 0, Math.PI / 2], [0.3, 0.92, 0.3]), 0xc8a050); }
          } else if (world === 1) { // broken columns and clay pots
            const h = 0.6 + R() * 1.6;
            B(z + o).add(cyl, mtx([x, h / 2, z + o], [0, 0, (R() - 0.5) * 0.1], [0.26, h, 0.26]), 0xe8c898);
            B(z + o).add(rbox, mtx([x, 0.08, z + o], [0, 0, 0], [0.7, 0.16, 0.7]), 0xd8b080);
            B(z + o).add(ball, mtx([x + side * 0.7, 0.25, z + o + 0.6], [0, 0, 0], [0.24, 0.28, 0.24]), 0xc06a3a);
          } else if (world === 2) { // snow banks and a snowman now and then
            B(z + o).add(ball, mtx([side * (edge + 0.3), 0.05, z + o], [0, 0, 0], [0.5, 0.25, 3]), 0xf4f8ff);
            if (k % 3 === 0) { B(z + o).add(ball, mtx([x, 0.35, z + o], [0, 0, 0], 0.38), 0xffffff); B(z + o).add(ball, mtx([x, 0.85, z + o], [0, 0, 0], 0.26), 0xffffff); B(z + o).add(new THREE.ConeGeometry(0.05, 0.25, 6), mtx([x, 0.88, z + o + 0.25], [Math.PI / 2, 0, 0], 1), 0xff8a3d); }
          } else { // Fernstone crystals and glowing cracks
            for (let c = 0; c < 3; c++) G(z + o).add(new THREE.OctahedronGeometry(1, 0), mtx([x + (R() - 0.5) * 0.8, 0.3, z + o + (R() - 0.5) * 0.8], [0, R(), (R() - 0.5) * 0.6], [0.12, 0.35 + R() * 0.4, 0.12]), new THREE.Color(R() < 0.5 ? 0x9a4af0 : 0x2ad8c0).multiplyScalar(1.3));
            G(z + o).add(box, mtx([x * 0.8, 0.012, z + o], [0, R() * 3, 0], [0.06, 0.01, 1.4 + R()]), new THREE.Color(0xff6a20).multiplyScalar(1.2));
          }
        });
      }
      // a signpost
      at((o) => {
        const x = side * (edge + 1.6), z = side > 0 ? -P * 0.4 : -P * 0.85;
        B(z + o).add(rbox, mtx([x, 0.7, z + o], [0, 0, 0], [0.09, 1.4, 0.09]), wood);
        B(z + o).add(rbox, mtx([x - side * 0.25, 1.2, z + o], [0, 0.3 * side, -0.05], [0.7, 0.22, 0.05]), 0xe8d2a6);
      });
    }
    const matte = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.chunks = chunks.map((c, k) => {
      const g = new THREE.Group(); g.userData.z = -(k + 0.5) * CH;
      if (!c.base.empty) g.add(new THREE.Mesh(c.base.geometry(), matte));
      if (!c.glow.empty) g.add(new THREE.Mesh(c.glow.geometry(), lit));
      this.group.add(g); return g;
    });
    // gravel shoulders and solid edge lines (they look the same everywhere, so they need not scroll)
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 260), new THREE.MeshStandardMaterial({ color: new THREE.Color(W.rock[0], W.rock[1], W.rock[2]).multiplyScalar(world === 2 ? 1.3 : 0.95), roughness: 1 }));
    shoulder.material.userData.cheapIbl = true;
    this.static = new THREE.Group();
    for (const side of [-1, 1]) {
      const sh = shoulder.clone(); sh.rotation.x = -Math.PI / 2; sh.position.set(side * (road + 0.55), 0.004, -110); this.static.add(sh);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 260), new THREE.MeshBasicMaterial({ color: dark ? 0xb8b8b8 : 0xf2f2f2 }));
      line.rotation.x = -Math.PI / 2; line.position.set(side * (road - 0.22), 0.009, -110); this.static.add(line);
    }
  }
  /** Scroll to road distance `pos`. */
  update(pos) {
    const off = ((pos % this.P) + this.P) % this.P;
    this.group.position.z = off;
    // the ground fades out 142 ahead: chunks past that (or behind the camera) are skipped
    for (const c of this.chunks) { const z = c.userData.z + off; c.visible = z > -150 && z < 26; }
  }
  dispose() { for (const g of [this.group, this.static]) g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
}
