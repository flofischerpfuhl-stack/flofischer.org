/** The hub room: stone floor, round platform, tall windows with a backdrop panorama, banners, planters, lights. */
import { stoneTexture, rugTexture, bannerTexture, blobTexture, glowTexture } from './hub-art.js';
import { mix } from './hub-theme.js';
import { mergeStatic } from './hub-merge.js';

export const CAB_STEP = 2.05, CAB_ARC = 8, PLATFORM = { x: 0, z: -3.4, rx: 5.7, rz: 2.95, h: .3 };
export const cabinetPose = i => { const a = (i - 1.5) * CAB_STEP / CAB_ARC; return { x: CAB_ARC * Math.sin(a), y: PLATFORM.h, z: 3.9 - CAB_ARC * Math.cos(a), yaw: -a }; };
/** Height of the floor at (x, z): the platform top inside its ellipse, else the stone floor. */
export const groundY = (x, z) => (((x - PLATFORM.x) / (PLATFORM.rx - .5)) ** 2 + ((z - PLATFORM.z) / (PLATFORM.rz - .25)) ** 2 < 1 ? PLATFORM.h : 0);
export const ACTOR_SPOTS = {
  PROFESSOR_OWLBERT: { x: -3.15, z: 1.15, yaw: .3, height: 1.75 },
  PIP_KESSEL: { x: .15, z: 1.6, yaw: 0, height: 1.8 },
  MAYOR_TORTELLINI: { x: 3.2, z: 1.15, yaw: -.3, height: 1.7 },
};
const WALL_Z = -8.4;

export function buildRoom({ THREE, own, env, ferns }) {
  const group = new THREE.Group(), tinted = [];
  const std = (o = {}) => own.mat(new THREE.MeshStandardMaterial({ roughness: .8, ...o }));
  const mesh = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(own.geo(geo), mat); m.position.set(x, y, z); parent.add(m); return m; };

  // Floor
  const stone = own.tex(new THREE.CanvasTexture(stoneTexture())); stone.wrapS = stone.wrapT = THREE.RepeatWrapping; stone.repeat.set(16, 12); stone.colorSpace = THREE.SRGBColorSpace; stone.anisotropy = 8;
  const floorMat = std({ map: stone, roughness: .7 });
  const floor = mesh(new THREE.PlaneGeometry(44, 33), floorMat, 0, 0, 2); floor.rotation.x = -Math.PI / 2; floor.name = 'Floor';

  // Rug
  const rugCanvas = rugTexture({ dark: false, 'accent-fill': '#15803d' }); const rugTex = own.tex(new THREE.CanvasTexture(rugCanvas)); rugTex.colorSpace = THREE.SRGBColorSpace; rugTex.anisotropy = 8;
  const rugMat = own.mat(new THREE.MeshBasicMaterial({ map: rugTex, transparent: true, toneMapped: false, depthWrite: false }));
  const rug = mesh(new THREE.PlaneGeometry(5.6, 5.6), rugMat, 0, .012, 3.3, group); rug.rotation.x = -Math.PI / 2;

  // Platform: white base tier, accent band, warm top
  const ell = (rx, rz, h, y, mat) => { const m = mesh(new THREE.CylinderGeometry(1, 1, h, 72), mat, PLATFORM.x, y, PLATFORM.z); m.scale.set(rx, 1, rz); return m; };
  const baseMat = std({ roughness: .45 }), bandMat = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false })), topMat = std({ roughness: .55 });
  ell(PLATFORM.rx, PLATFORM.rz, .12, .06, baseMat);
  ell(PLATFORM.rx - .04, PLATFORM.rz - .02, .06, .15, bandMat);
  ell(PLATFORM.rx - .1, PLATFORM.rz - .05, .12, .24, baseMat);
  ell(PLATFORM.rx - .45, PLATFORM.rz - .22, .06, .285, topMat);
  // a soft glow on the floor around the platform (dark only)
  const glowTex = own.tex(new THREE.CanvasTexture(glowTexture())); glowTex.colorSpace = THREE.SRGBColorSpace;
  const glowMat = own.mat(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: .5 }));
  const platGlow = mesh(new THREE.PlaneGeometry(1, 1), glowMat, PLATFORM.x, .02, PLATFORM.z + .35); platGlow.rotation.x = -Math.PI / 2; platGlow.scale.set(PLATFORM.rx * 2.5, PLATFORM.rz * 2.7, 1);
  // thin light ring on the floor around the rug (reads as an accent line in light mode too)
  const ringMat = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const ring = mesh(new THREE.TorusGeometry(2.95, .022, 6, 96), ringMat, 0, .02, 3.3); ring.rotation.x = Math.PI / 2; ring.scale.set(1.45, 1, 1);

  // Back wall with three tall bays, mullions, a lintel and the backdrop behind
  const wallMat = std({ roughness: .75 }), trimMat = std({ roughness: .6 });
  const bayX = [-4.5, 0, 4.5], pillarX = [-6.75, -2.25, 2.25, 6.75];
  const WH = 7.4;
  pillarX.forEach((x, i) => mesh(new THREE.BoxGeometry(i === 0 || i === 3 ? .9 : .6, WH, .7), wallMat, x, WH / 2, WALL_Z));
  mesh(new THREE.BoxGeometry(15.6, .9, .8), wallMat, 0, WH - .45, WALL_Z);
  mesh(new THREE.BoxGeometry(15.6, .12, .9), trimMat, 0, WH - .96, WALL_Z + .05);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(14, WH + 3, 1), wallMat, s * (7.2 + 7), WH / 2 + 1, WALL_Z);
  mesh(new THREE.BoxGeometry(60, 4, 22), wallMat, 0, WH + 2.4, WALL_Z - 2);
  for (const bx of bayX) for (const mx of [-.98, .98]) mesh(new THREE.BoxGeometry(.05, WH - .95, .08), trimMat, bx + mx, (WH - .95) / 2, WALL_Z - .05);
  for (const bx of bayX) mesh(new THREE.BoxGeometry(3.9, .05, .08), trimMat, bx, 3.9, WALL_Z - .05);
  const backdropMat = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false, color: '#ffffff' }));
  const backdrop = mesh(new THREE.PlaneGeometry(20, 20 / 2.4), backdropMat, 0, 3.05, WALL_Z - 1.8);

  // Banners on the outer pillars
  const bannerTex = own.tex(new THREE.CanvasTexture(bannerTexture({ dark: false, 'accent-fill': '#15803d', 'accent-on': '#fff' }))); bannerTex.colorSpace = THREE.SRGBColorSpace; bannerTex.anisotropy = 4;
  const bannerMat = own.mat(new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, toneMapped: false }));
  const banners = [-6.75, 6.75].map(x => { const b = mesh(new THREE.PlaneGeometry(1.35, 1.35 * 576 / 256), bannerMat, x, 4.25, WALL_Z + .42); mesh(new THREE.BoxGeometry(1.5, .08, .08), trimMat, x, 5.62, WALL_Z + .4); return b; });

  // Soft contact shadows
  const blob = own.tex(new THREE.CanvasTexture(blobTexture(.42)));
  const blobMat = own.mat(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false }));
  const blobGeo = own.geo(new THREE.PlaneGeometry(1, 1)); blobGeo.rotateX(-Math.PI / 2);
  const blobAt = (x, y, z, w, d) => { const m = new THREE.Mesh(blobGeo, blobMat); m.position.set(x, y + .005, z); m.scale.set(w, 1, d); m.renderOrder = 1; group.add(m); return m; };

  // Planters with ferns
  const potMat = std({ roughness: .5 }), soilMat = std({ color: '#2b2118', roughness: 1 }), cushionMat = std({ roughness: .8 }), woodMat = std({ roughness: .6 });
  const fernMat = own.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide }));
  const planter = (x, z, size, fern = 'fern') => {
    const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
    mesh(new THREE.CylinderGeometry(.5 * size, .4 * size, .55 * size, 28), potMat, 0, .275 * size, 0, g);
    mesh(new THREE.CylinderGeometry(.46 * size, .46 * size, .04, 28), soilMat, 0, .55 * size, 0, g);
    for (let k = 0; k < 6; k++) {
      const src = ferns[(k + (fern === 'fern' ? 0 : 1)) % ferns.length], f = new THREE.Group();
      for (const part of src.parts) { const m = new THREE.Mesh(part.geometry, fernMat); f.add(m); }
      const k2 = size * (1.15 + (k % 3) * .22) / src.height; f.scale.setScalar(k2); f.position.set(Math.cos(k * 1.1) * .16 * size, .56 * size - src.minY * k2, Math.sin(k * 1.1) * .16 * size); f.rotation.y = k * 1.05; g.add(f);
    }
    blobAt(x, 0, z, size * 1.5, size * 1.5);
    return g;
  };
  const planters = [planter(-6.4, -1.4, 1.35), planter(6.5, -1.2, 1.35, 'b'), planter(-6.7, 3.4, 1.7), planter(6.9, 3.7, 1.9, 'b'), planter(-4.6, -6.7, 1.1), planter(4.6, -6.8, 1.1, 'b'), planter(-1.0, -6.9, .9, 'b'), planter(1.2, -6.9, .9)];
  // low round seats with green cushions at the sides
  const seat = (x, z) => { const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g); mesh(new THREE.CylinderGeometry(.72, .72, .3, 32), woodMat, 0, .15, 0, g); mesh(new THREE.CylinderGeometry(.66, .66, .16, 32), cushionMat, 0, .38, 0, g); blobAt(x, 0, z, 2.2, 2.2); };
  seat(-6.6, 0.8); seat(6.7, 1.0);

  // Lamps (visible in the dark scene)
  const lampMat = own.mat(new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false })), cordMat = std({ color: '#6b6b72', roughness: .9 });
  const lamps = [-3.9, 3.9].map(x => { const g = new THREE.Group(); g.position.set(x, 0, -6.2); mesh(new THREE.SphereGeometry(.22, 20, 14), lampMat, 0, 5.3, 0, g).userData.keep = true; mesh(new THREE.CylinderGeometry(.03, .03, 3, 6), cordMat, 0, 7.0, 0, g).userData.keep = true; group.add(g); return g; });

  // Lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#d9d0c0', 1.4); group.add(hemi);
  const key = new THREE.DirectionalLight('#fff4e0', 1.6); key.position.set(-5, 9, 8); group.add(key, key.target); key.target.position.set(0, 0, -1);
  const lampLights = [-3.9, 3.9].map(x => { const l = new THREE.PointLight('#ffc88a', 0, 14, 2); l.position.set(x, 4.8, -4.2); group.add(l); return l; });

  // contact blobs for the cabinets and actors (positions fixed; actors register their own)
  for (let i = 0; i < 4; i++) { const p = cabinetPose(i); blobAt(p.x, p.y, p.z, 2.4, 1.8); }

  mergeStatic(group, own);

  function retheme(p) {
    const dark = p.dark;
    floorMat.color.set(dark ? mix(p['surface-2'], '#7a7a86', .75) : mix(p['surface-2'], '#d8cfbd', .6));
    floorMat.roughness = dark ? .5 : .75;
    wallMat.color.set(dark ? mix(p['surface-2'], '#3c3c46', .7) : mix(p.bg, '#efeadc', .5)); trimMat.color.set(dark ? '#34343a' : '#ffffff');
    baseMat.color.set(dark ? p['surface-1'] : p.bg); topMat.color.set(dark ? mix(p['surface-2'], '#3a3a44', .6) : '#d8b98c');
    bandMat.color.set(p['accent-fill']); ringMat.color.set(p['accent-fill']); ringMat.opacity = 1;
    potMat.color.set(dark ? p['surface-2'] : p.bg); cushionMat.color.set(dark ? '#17362a' : mix(p['accent-fill'], '#ffffff', .1)); woodMat.color.set(dark ? '#4a3524' : '#c9a574');
    fernMat.color.set(dark ? '#9fd3a6' : '#ffffff');
    glowMat.color.set(p['accent-fill']); platGlow.visible = dark; glowMat.opacity = .55;
    lamps.forEach(l => { l.visible = dark; }); lampLights.forEach(l => { l.visible = dark; l.intensity = 22; });
    hemi.color.set(dark ? '#b4bfe0' : '#ffffff'); hemi.groundColor.set(dark ? '#3a3a46' : '#dcd3c3'); hemi.intensity = dark ? 1.35 : 1.45;
    key.color.set(dark ? '#ffe3c2' : '#fff4e0'); key.intensity = dark ? 1.7 : 1.7;
    rugCanvasRedraw(p);
    bannerRedraw(p);
    for (const [m] of tinted) m.needsUpdate = true;
  }
  const rugCtx = rugCanvas.getContext('2d');
  function rugCanvasRedraw(p) { const c = rugTexture(p); rugCtx.clearRect(0, 0, 1024, 1024); rugCtx.drawImage(c, 0, 0); rugTex.needsUpdate = true; }
  function bannerRedraw(p) { const c = bannerTexture(p), t = bannerTex.image.getContext('2d'); t.clearRect(0, 0, 256, 576); t.drawImage(c, 0, 0); bannerTex.needsUpdate = true; }

  return { group, retheme, backdrop, backdropMat, banners, blobAt, key, lampLights, hemi };
}
