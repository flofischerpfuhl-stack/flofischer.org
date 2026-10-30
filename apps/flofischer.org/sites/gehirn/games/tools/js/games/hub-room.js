/** The hub room: diamond-tiled floor, a thick rounded platform with scalloped trim, arched windows with a backdrop, banners, shelves, planters, lights. */
import { rugTexture, bannerTexture, blobTexture, floorTexture } from './hub-art.js';
import { mix } from './hub-theme.js';
import { mergeStatic } from './hub-merge.js';
import { createDisc, createHalo, createMotes } from './hub-fx.js';

export const CAB_STEP = 2.05, CAB_ARC = 8, PLATFORM = { x: 0, z: -3.4, rx: 5.7, rz: 2.95, h: .42 };
export const cabinetPose = i => { const a = (i - 1.5) * CAB_STEP / CAB_ARC; return { x: CAB_ARC * Math.sin(a), y: PLATFORM.h, z: 3.9 - CAB_ARC * Math.cos(a), yaw: -a }; };
/** Height of the floor at (x, z): the platform top inside its ellipse, else the stone floor. */
export const groundY = (x, z) => (((x - PLATFORM.x) / (PLATFORM.rx - .5)) ** 2 + ((z - PLATFORM.z) / (PLATFORM.rz - .25)) ** 2 < 1 ? PLATFORM.h : 0);
/** Where the three characters stand: big and central, in front of the platform on the rug. */
export const ACTOR_SPOTS = {
  PROFESSOR_OWLBERT: { x: -2.9, z: 2.3, yaw: .32, height: 2.2 },
  PIP_KESSEL: { x: .1, z: 2.75, yaw: 0, height: 2.25 },
  MAYOR_TORTELLINI: { x: 3.0, z: 2.3, yaw: -.32, height: 2.15 },
};
const WALL_Z = -8.4;

export function buildRoom({ THREE, own, env, ferns, palettes }) {
  const group = new THREE.Group();
  const std = (o = {}) => own.mat(new THREE.MeshStandardMaterial({ roughness: .8, ...o }));
  const mesh = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(own.geo(geo), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const tex = (canvas, aniso = 4) => { const t = own.tex(new THREE.CanvasTexture(canvas)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };

  // Floor: big diamond pattern, one texture per theme (both resident, swapped on re-theme)
  const floorTex = {};
  for (const d of [false, true]) { const t = floorTex[d] = tex(floorTexture(d), 8); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 7.5); }
  const floorMat = std({ map: floorTex[false], roughness: .85 });
  const floor = mesh(new THREE.PlaneGeometry(44, 33), floorMat, 0, 0, 2); floor.rotation.x = -Math.PI / 2; floor.name = 'Floor';

  // Rug (two textures, swapped)
  const rugTex = {}; for (const d of [false, true]) rugTex[d] = tex(rugTexture(palettes[d]), 8);
  const rugMat = own.mat(new THREE.MeshBasicMaterial({ map: rugTex[false], transparent: true, toneMapped: false, depthWrite: false }));
  const rug = mesh(new THREE.PlaneGeometry(6.6, 6.6), rugMat, 0, .012, 3.4, group); rug.rotation.x = -Math.PI / 2;

  // Platform: thick rounded lip (a tube along the ellipse), scalloped trim below it, sunny top
  const ell = (rx, rz, h, y, mat) => { const m = mesh(new THREE.CylinderGeometry(1, 1, h, 80), mat, PLATFORM.x, y, PLATFORM.z); m.scale.set(rx, 1, rz); return m; };
  const baseMat = std({ roughness: .4 }), bandMat = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false })), topMat = std({ roughness: .5 }), lipMat = std({ roughness: .3 });
  const ellipseCurve = (rx, rz, y, n = 96) => new THREE.CatmullRomCurve3(Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return new THREE.Vector3(PLATFORM.x + Math.cos(a) * rx, y, PLATFORM.z + Math.sin(a) * rz); }), true);
  ell(PLATFORM.rx + .05, PLATFORM.rz + .03, .22, .11, baseMat);
  ell(PLATFORM.rx - .12, PLATFORM.rz - .1, .34, .17, bandMat);
  const lipTube = mesh(new THREE.TubeGeometry(ellipseCurve(PLATFORM.rx - .1, PLATFORM.rz - .08, PLATFORM.h - .1), 160, .2, 12, true), lipMat, 0, 0, 0);
  ell(PLATFORM.rx - .3, PLATFORM.rz - .2, .08, PLATFORM.h - .04, topMat);
  // scalloped trim: green beads along the outer face of the band
  const beadGeo = new THREE.SphereGeometry(.17, 10, 8), beadMat = std({ roughness: .35 });
  for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2 + .03; mesh(beadGeo, beadMat, PLATFORM.x + Math.cos(a) * (PLATFORM.rx + .06), .15, PLATFORM.z + Math.sin(a) * (PLATFORM.rz + .05)).scale.set(1, .85, 1); }
  // soft glows (dark): the platform edge and two warm pools under the lamps
  const platGlow = createDisc({ THREE, own, diameter: 1 }); platGlow.position.set(PLATFORM.x, .02, PLATFORM.z + .35); platGlow.scale.set(PLATFORM.rx * 2.5, 1, PLATFORM.rz * 2.9); group.add(platGlow);
  const pools = [-3.9, 3.9].map(x => { const d = createDisc({ THREE, own, diameter: 4.6 }); d.position.set(x, PLATFORM.h + .02, -4.6); d.renderOrder = 3; group.add(d); return d; });
  const ringMat = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const ring = mesh(new THREE.TorusGeometry(3.25, .03, 6, 96), ringMat, 0, .02, 3.4); ring.rotation.x = Math.PI / 2; ring.scale.set(1.4, 1, 1);

  // Back wall: three arched bays, mullions, a lintel and the backdrop behind
  const wallMat = std({ roughness: .75 }), trimMat = std({ roughness: .5 });
  const bayX = [-4.5, 0, 4.5], pillarX = [-6.75, -2.25, 2.25, 6.75];
  const WH = 7.4, SPRING = 4.55, R = 1.95;
  pillarX.forEach((x, i) => mesh(new THREE.BoxGeometry(i === 0 || i === 3 ? .9 : .6, WH, .7), wallMat, x, WH / 2, WALL_Z));
  mesh(new THREE.BoxGeometry(15.6, .9, .8), wallMat, 0, WH - .45, WALL_Z);
  mesh(new THREE.BoxGeometry(15.6, .14, .95), trimMat, 0, WH - .96, WALL_Z + .05);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(14, WH + 3, 1), wallMat, s * (7.2 + 7), WH / 2 + 1, WALL_Z);
  mesh(new THREE.BoxGeometry(60, 4, 22), wallMat, 0, WH + 2.4, WALL_Z - 2);
  // arch spandrels: a block above each bay with a round hole
  const corner = s => {
    const shape = new THREE.Shape(); shape.moveTo(s * R, SPRING); shape.lineTo(s * R, SPRING + R + .02); shape.lineTo(0, SPRING + R + .02); shape.absarc(0, SPRING, R, Math.PI / 2, s > 0 ? 0 : Math.PI, s > 0);
    return new THREE.ExtrudeGeometry(shape, { depth: .6, bevelEnabled: false, curveSegments: 28 });
  };
  const corners = [corner(1), corner(-1)];
  const archRing = new THREE.TorusGeometry(R + .04, .07, 8, 40, Math.PI);
  for (const bx of bayX) { for (const c of corners) mesh(c, wallMat, bx, 0, WALL_Z - .3); mesh(archRing, trimMat, bx, SPRING, WALL_Z + .33); }
  for (const bx of bayX) for (const mx of [-.98, .98]) mesh(new THREE.BoxGeometry(.05, SPRING - .2 + Math.sqrt(R * R - .98 * .98), .08), trimMat, bx + mx, (SPRING - .2 + Math.sqrt(R * R - .98 * .98)) / 2, WALL_Z - .05);
  for (const bx of bayX) mesh(new THREE.BoxGeometry(3.9, .05, .08), trimMat, bx, 3.9, WALL_Z - .05);
  const backdropMat = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false, color: '#ffffff' }));
  const backdrop = mesh(new THREE.PlaneGeometry(20, 20 / 2.4), backdropMat, 0, 3.05, WALL_Z - 1.8);

  // Banners on the outer pillars (waving: a few segments moved on the CPU)
  const bannerTex = {}; for (const d of [false, true]) bannerTex[d] = tex(bannerTexture(palettes[d]));
  const bannerMat = own.mat(new THREE.MeshBasicMaterial({ map: bannerTex[false], transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  const BW = 1.35, BH = 1.35 * 576 / 256;
  const banners = [-6.75, 6.75].map((x, n) => {
    const geo = own.geo(new THREE.PlaneGeometry(BW, BH, 2, 10)), b = new THREE.Mesh(geo, bannerMat); b.position.set(x, 4.25, WALL_Z + .42); group.add(b);
    mesh(new THREE.BoxGeometry(1.5, .1, .1), trimMat, x, 4.25 + BH / 2 + .05, WALL_Z + .4);
    b.userData.base = Float32Array.from(geo.attributes.position.array); b.userData.n = n; return b;
  });

  // Soft contact shadows
  const blob = own.tex(new THREE.CanvasTexture(blobTexture(.45)));
  const blobMat = own.mat(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false }));
  const blobGeo = own.geo(new THREE.PlaneGeometry(1, 1)); blobGeo.rotateX(-Math.PI / 2);
  const blobAt = (x, y, z, w, d) => { const m = new THREE.Mesh(blobGeo, blobMat); m.position.set(x, y + .005, z); m.scale.set(w, 1, d); m.renderOrder = 1; group.add(m); return m; };

  // Ferns sway in the vertex shader (uniform time), so they stay merged
  const sway = { value: 0 };
  const fernMat = own.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide }));
  fernMat.onBeforeCompile = shader => {
    shader.uniforms.uSway = sway;
    shader.vertexShader = 'uniform float uSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sw = max(0., position.y - .5) * .06; transformed.x += sin(uSway * 1.7 + position.z * 1.4 + position.x) * sw; transformed.z += cos(uSway * 1.3 + position.x * 1.1) * sw * .7;');
  };
  const potMat = std({ roughness: .4 }), soilMat = std({ color: '#3a2a1c', roughness: 1 }), cushionMat = std({ roughness: .7 }), woodMat = std({ roughness: .5 });
  const addFern = (g, k, size, base, spread = .16) => {
    const src = ferns[k % ferns.length], f = new THREE.Group();
    for (const part of src.parts) { const m = new THREE.Mesh(part.geometry, fernMat); f.add(m); }
    const k2 = size * (1.15 + (k % 3) * .22) / src.height; f.scale.setScalar(k2); f.position.set(Math.cos(k * 1.1) * spread * size, base - src.minY * k2, Math.sin(k * 1.1) * spread * size); f.rotation.y = k * 1.05; g.add(f); return f;
  };
  const planter = (x, z, size, shift = 0) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
    mesh(new THREE.CylinderGeometry(.52 * size, .4 * size, .55 * size, 28), potMat, 0, .275 * size, 0, g);
    mesh(new THREE.TorusGeometry(.5 * size, .06 * size, 8, 28), potMat, 0, .55 * size, 0, g).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(.46 * size, .46 * size, .04, 28), soilMat, 0, .55 * size, 0, g);
    for (let k = 0; k < (size > 1.5 ? 5 : size > 1 ? 4 : 3); k++) addFern(g, k + shift, size, .56 * size);
    blobAt(x, 0, z, size * 1.5, size * 1.5);
  };
  [[-6.4, -1.4, 1.35, 0], [6.5, -1.2, 1.35, 1], [-6.9, 3.4, 1.7, 0], [7.0, 3.7, 1.9, 1], [-4.6, -6.7, 1.1, 0], [4.6, -6.8, 1.1, 1], [-1.0, -6.9, .9, 1], [1.2, -6.9, .9, 0]].forEach(([x, z, s, sh]) => planter(x, z, s, sh));
  // low round seats with cushions at the sides
  const seat = (x, z) => { const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g); mesh(new THREE.CylinderGeometry(.72, .72, .3, 32), woodMat, 0, .15, 0, g); mesh(new THREE.CylinderGeometry(.66, .68, .2, 32), cushionMat, 0, .4, 0, g); blobAt(x, 0, z, 2.2, 2.2); };
  seat(-6.6, 0.8); seat(6.7, 1.0);

  // Bookcases at both ends of the back wall: rounded frame, shelves, rows of books, a plant on top
  const bookColors = ['#e8473f', '#f2a81d', '#2f8fe0', '#3dbb6a', '#8e5bd6', '#ff7aa8', '#1fb6a8'];
  const bookGeo = new THREE.BoxGeometry(1, 1, 1), bookMats = bookColors.map(c => std({ color: c, roughness: .6 }));
  const shelfMat = std({ roughness: .55 }), shelfIn = std({ roughness: .8 });
  const bookcase = x => {
    const g = new THREE.Group(); g.position.set(x, 0, WALL_Z + 1.0); group.add(g);
    const W = 1.9, H = 3.3, D = .55;
    mesh(new THREE.BoxGeometry(W, H, .06), shelfIn, 0, H / 2, -D / 2, g);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(.1, H, D), shelfMat, s * (W / 2 - .05), H / 2, 0, g);
    for (let r = 0; r <= 3; r++) mesh(new THREE.BoxGeometry(W, .1, D), shelfMat, 0, .05 + r * (H - .1) / 3, 0, g);
    let seed = Math.round(x * 10) + 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = 0; r < 3; r++) { let bx = -W / 2 + .2; while (bx < W / 2 - .3) { const w = .09 + rnd() * .1, h = .5 + rnd() * .3; mesh(bookGeo, bookMats[Math.floor(rnd() * bookMats.length)], bx + w / 2, .1 + r * (H - .1) / 3 + h / 2, -.02, g).scale.set(w, h, .34); bx += w + .01; if (rnd() > .86) bx += .25; } }
    for (let k = 0; k < 2; k++) addFern(g, k + 1, .6, H + .12, .1);
    mesh(new THREE.CylinderGeometry(.3, .24, .3, 20), potMat, 0, H + .15, 0, g);
    blobAt(x, 0, WALL_Z + 1.0, 2.4, 1.2);
  };
  bookcase(-8.2); bookcase(8.2);

  // Hanging plants under the lintel (sway)
  const cordMat = std({ color: '#d9c9a8', roughness: .9 });
  const hangers = [-2.25, 2.25].map((x, n) => {
    const g = new THREE.Group(); g.position.set(x, WH - 1.0, WALL_Z + 1.2); group.add(g);
    for (const s of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(.012, .012, 1.2, 4), cordMat, s * .22, -.55, 0, g); c.userData.keep = true; }
    const pot = mesh(new THREE.SphereGeometry(.38, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), potMat, 0, -1.2, 0, g); pot.userData.keep = true;
    for (let k = 0; k < 3; k++) { const f = addFern(g, k + n, .75, -1.18, .12); f.children.forEach(m => { m.userData.keep = true; }); f.userData.keep = true; f.rotation.z = (k - 1.5) * .35; }
    g.userData.n = n; return g;
  });

  // Lamps (visible in the dark scene) with halos
  const lampMat = own.mat(new THREE.MeshBasicMaterial({ color: '#ffd28a', toneMapped: false }));
  const lamps = [-3.9, 3.9].map(x => { const g = new THREE.Group(); g.position.set(x, 0, -6.2); mesh(new THREE.SphereGeometry(.26, 20, 14), lampMat, 0, 5.3, 0, g).userData.keep = true; mesh(new THREE.CylinderGeometry(.03, .03, 3, 6), cordMat, 0, 7.0, 0, g).userData.keep = true; const h = createHalo({ THREE, own, size: 2.6, opacity: .75 }); h.position.set(0, 5.3, .1); g.add(h); g.userData.halo = h; group.add(g); return g; });

  // Lights: warm key, cool fill, back rim for the characters. Counts never change (no shader rebuild on re-theme).
  const hemi = new THREE.HemisphereLight('#ffffff', '#ffe9c8', 1.35); group.add(hemi);
  const key = new THREE.DirectionalLight('#fff0d0', 1.8); key.position.set(-5, 9, 8); group.add(key, key.target); key.target.position.set(0, 0, -1);
  const fill = new THREE.DirectionalLight('#a9cfff', .55); fill.position.set(8, 4, 7); group.add(fill, fill.target); fill.target.position.set(0, 1, 1);
  const rim = new THREE.DirectionalLight('#ffe7b0', 1.4); rim.position.set(1.5, 4.5, -9); group.add(rim, rim.target); rim.target.position.set(0, 1.2, 2.5);
  const lampLights = [-3.9, 3.9].map(x => { const l = new THREE.PointLight('#ffb86b', 0, 16, 1.6); l.position.set(x, 4.6, -3.2); group.add(l); return l; });

  // contact blobs for the cabinets (actors register their own)
  for (let i = 0; i < 4; i++) { const p = cabinetPose(i); blobAt(p.x, p.y, p.z, 2.6, 2); }

  const motes = createMotes({ THREE, own }); group.add(motes.points);

  mergeStatic(group, own);

  const rugMatHolder = rugMat, bannerHolder = bannerMat;
  function retheme(p) {
    const dark = p.dark;
    floorMat.map = floorTex[dark]; floorMat.color.set('#ffffff'); floorMat.roughness = dark ? .6 : .85;
    wallMat.color.set(dark ? '#3b4a8a' : '#fff4de'); trimMat.color.set(dark ? '#f3d59a' : '#ffffff');
    baseMat.color.set(dark ? '#f1ead8' : '#ffffff'); topMat.color.set(dark ? '#e9a94a' : '#ffd36b'); lipMat.color.set(dark ? '#fff1d0' : '#ffffff'); beadMat.color.set(dark ? '#3ee47a' : '#22b258');
    bandMat.color.set(dark ? '#2fe06f' : '#1db954'); ringMat.color.set(p['accent-fill']);
    potMat.color.set(dark ? '#ffd9a8' : '#ff9d5c'); cushionMat.color.set(dark ? '#1f9a6a' : '#31c27c'); woodMat.color.set(dark ? '#d9923f' : '#ffc46b'); shelfMat.color.set(dark ? '#e9a94a' : '#ffcf7a'); shelfIn.color.set(dark ? '#3b2a63' : '#fff0cf');
    fernMat.color.set(dark ? '#a8f0a8' : '#ffffff');
    rugMatHolder.map = rugTex[dark]; bannerHolder.map = bannerTex[dark];
    platGlow.material.color.set(dark ? '#ffb36b' : '#fff0c0'); platGlow.material.opacity = dark ? .5 : .0; platGlow.visible = dark;
    pools.forEach(d => { d.material.color.set('#ffb25a'); d.material.opacity = dark ? .55 : 0; d.visible = dark; });
    lamps.forEach(l => { l.visible = dark; }); lampLights.forEach(l => { l.intensity = dark ? 26 : 0; });
    hemi.color.set(dark ? '#9fb0ff' : '#ffffff'); hemi.groundColor.set(dark ? '#6b4fb0' : '#ffe2b8'); hemi.intensity = dark ? 1.15 : 1.35;
    key.color.set(dark ? '#ffd29a' : '#fff0d0'); key.intensity = dark ? 1.7 : 1.8;
    fill.color.set(dark ? '#6aa8ff' : '#a9cfff'); fill.intensity = dark ? .7 : .55;
    rim.color.set(dark ? '#7fe9c8' : '#ffe7b0'); rim.intensity = dark ? 2.0 : 1.4;
    motes.setDark(dark);
  }

  const tmpV = new THREE.Vector3();
  function update(t, still = false) {
    sway.value = still ? 0 : t;
    if (!still) {
      for (const b of banners) {
        const pos = b.geometry.attributes.position, base = b.userData.base;
        for (let i = 0; i < pos.count; i++) { const y0 = base[i * 3 + 1], depth = (BH / 2 - y0) / BH; pos.setZ(i, Math.sin(t * 1.9 + depth * 3.2 + b.userData.n * 1.7) * .07 * depth); }
        pos.needsUpdate = true;
      }
      hangers.forEach(g => { g.rotation.z = Math.sin(t * .9 + g.userData.n * 2) * .035; g.rotation.x = Math.cos(t * .7 + g.userData.n) * .02; });
      lamps.forEach((l, i) => { l.userData.halo.material.opacity = .65 + Math.sin(t * 1.4 + i) * .08; });
    }
    motes.update(t, still);
  }
  void tmpV;
  return { group, retheme, update, backdrop, backdropMat, banners, blobAt, key, lampLights, hemi, rim, motes };
}
