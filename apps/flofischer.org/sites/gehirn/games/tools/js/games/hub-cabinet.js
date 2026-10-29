/** One arcade cabinet built from rounded primitives, themed from the Fernwork tokens. */
import { RoundedBoxGeometry } from '../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { makeCanvas, headerTexture } from './hub-art.js';
import { mergeStatic } from './hub-merge.js';

export const CABINET = { width: 1.6, height: 2.92, depth: 1.0, screenWidth: 1.28, screenHeight: 0.853, screenY: 1.84, scale: 1.1 };

export function createCabinet({ THREE, own, game, art, env }) {
  const root = new THREE.Group(), { width: W } = CABINET;
  root.name = `Cabinet_${game.id}`; root.userData.canteenGame = game.id; root.scale.setScalar(CABINET.scale);
  const std = (opts) => own.mat(new THREE.MeshStandardMaterial({ envMap: env, ...opts }));
  const body = std({ roughness: .5 }), deckMat = std({ roughness: .5 }), panel = std({ roughness: .6 }), header = std({ roughness: .45 });
  const bezel = std({ color: '#15181b', roughness: .35, metalness: .1 });
  const glow = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const stick = std({ roughness: .3 }), buttonA = std({ roughness: .35 }), buttonB = std({ roughness: .35 });
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(own.geo(geo), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const rbox = (w, h, d, r = .05) => new RoundedBoxGeometry(w, h, d, 3, r);

  add(rbox(W, 1.04, 1.0, .06), body, 0, .52, 0);
  add(rbox(W * .54, .36, .05, .02), panel, 0, .5, .5);
  for (const s of [-1, 1]) add(rbox(.09, .86, .06, .02), glow, s * (W / 2 - .07), .5, .5);
  const deck = new THREE.Group(); deck.position.set(0, 1.1, .3); deck.rotation.x = .2; root.add(deck);
  add(rbox(W, .16, .86, .05), deckMat, 0, 0, 0, deck);
  add(new THREE.CylinderGeometry(.022, .022, .2, 10), stick, -.44, .16, .08, deck);
  add(new THREE.SphereGeometry(.09, 18, 12), stick, -.44, .3, .08, deck);
  [[.1, .0], [.27, -.02], [.44, .0], [.18, .17], [.35, .15]].forEach(([x, z], i) => add(new THREE.CylinderGeometry(.05, .055, .035, 16), i % 2 ? buttonB : buttonA, x, .095, z, deck));
  add(rbox(W - .1, 1.5, .84, .05), body, 0, 1.77, -.09);
  const frame = add(rbox(1.44, 1.02, .09, .03), bezel, 0, CABINET.screenY, .345); frame.rotation.x = -.1;
  for (const s of [-1, 1]) add(rbox(.035, 1.4, .05, .015), glow, s * (W - .1) / 2, 1.78, .31);
  add(rbox(W + .06, .44, .94, .07), header, 0, 2.71, -.04);

  const [headCanvas] = makeCanvas(1024, Math.round(1024 * .42 / (W + .04)));
  const headTex = own.tex(new THREE.CanvasTexture(headCanvas)); headTex.colorSpace = THREE.SRGBColorSpace; headTex.anisotropy = 4;
  const plate = add(new THREE.PlaneGeometry(W + .04, .42), own.mat(new THREE.MeshBasicMaterial({ map: headTex, toneMapped: false })), 0, 2.71, .433);
  plate.name = 'Marquee';

  const cover = own.tex(new THREE.Texture(art)); cover.colorSpace = THREE.SRGBColorSpace; cover.anisotropy = 4; cover.needsUpdate = true;
  const screen = add(new THREE.PlaneGeometry(CABINET.screenWidth, CABINET.screenHeight), own.mat(new THREE.MeshBasicMaterial({ map: cover, toneMapped: false })), 0, CABINET.screenY, .396);
  screen.rotation.x = -.1; screen.name = `Display_${game.id}`;

  const hit = new THREE.Mesh(new THREE.BoxGeometry(W + .1, CABINET.height, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
  own.geo(hit.geometry); own.mat(hit.material);
  hit.position.set(0, CABINET.height / 2, .05); hit.userData.cabinet = game.id; root.add(hit);

  mergeStatic(root, own);

  function retheme(p) {
    const dark = p.dark;
    body.color.set(dark ? p['surface-1'] : p.bg); deckMat.color.set(dark ? p['surface-2'] : p.bg);
    panel.color.set(dark ? p['surface-2'] : p['accent-subtle-bg']); header.color.set(dark ? '#08090a' : p['accent-fill']);
    glow.color.set(p['accent-fill']); stick.color.set(p['accent-fill']);
    buttonA.color.set(p['accent-fill']); buttonB.color.set(dark ? p['accent-fill-hover'] : '#8fd4a8');
    for (const m of [body, deckMat, panel, header]) { m.roughness = dark ? .32 : .52; m.metalness = dark ? .25 : 0; m.envMapIntensity = dark ? .55 : .35; }
    headerTexture(headCanvas, game.title, p); headTex.needsUpdate = true;
  }
  /** Local point just under the screen, where the Play button hangs. */
  const anchor = new THREE.Vector3(0, CABINET.screenY - CABINET.screenHeight / 2, .4);
  return { root, hit, retheme, anchor, screen };
}
