/** One chunky arcade cabinet built from rounded primitives: fat rounded marquee, lean-back screen with moving glass highlight. */
import { RoundedBoxGeometry } from '../../vendor/three-0.170.0/RoundedBoxGeometry.js';
import { makeCanvas, headerTexture } from './hub-art.js';
import { mergeStatic } from './hub-merge.js';
import { createHalo, glassTexture } from './hub-fx.js';

export const CABINET = { width: 1.78, height: 3.05, depth: 1.1, screenWidth: 1.38, screenHeight: 0.92, screenY: 1.86, scale: 1.1 };
/** Saturated toy colours per game (shell trim, marquee and glow). */
export const SHELL = { 'fern-rangers': '#1fbf62', 'pips-tower': '#ff8a1f', momo: '#12c7b0', tanks: '#3b8cf2' };

export function createCabinet({ THREE, own, game, art, env, palettes }) {
  const root = new THREE.Group(), { width: W } = CABINET, shell = SHELL[game.id] ?? '#1fbf62';
  root.name = `Cabinet_${game.id}`; root.userData.canteenGame = game.id; root.scale.setScalar(CABINET.scale);
  const std = opts => own.mat(new THREE.MeshStandardMaterial({ envMap: env, ...opts }));
  const body = std({ roughness: .4 }), deckMat = std({ roughness: .4 }), panel = std({ roughness: .5 }), header = std({ roughness: .35 });
  const bezel = std({ color: '#171b22', roughness: .3, metalness: .1 });
  const glow = own.mat(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const stick = std({ roughness: .25 }), buttonA = std({ roughness: .3 }), buttonB = std({ roughness: .3 });
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(own.geo(geo), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const rbox = (w, h, d, r = .05) => new RoundedBoxGeometry(w, h, d, r > .1 ? 3 : 2, r);

  add(rbox(W, 1.12, 1.1, .18), body, 0, .56, 0);
  add(rbox(W * .56, .4, .06, .03), panel, 0, .52, .55);
  for (const s of [-1, 1]) add(rbox(.1, .86, .07, .035), glow, s * (W / 2 - .08), .54, .56);
  const deck = new THREE.Group(); deck.position.set(0, 1.18, .34); deck.rotation.x = .2; root.add(deck);
  add(rbox(W, .2, .92, .09), deckMat, 0, 0, 0, deck);
  add(new THREE.CylinderGeometry(.026, .026, .22, 10), stick, -.46, .18, .08, deck);
  add(new THREE.SphereGeometry(.11, 18, 12), stick, -.46, .33, .08, deck);
  [[.1, .0], [.28, -.02], [.46, .0], [.19, .18], [.37, .16]].forEach(([x, z], i) => add(new THREE.CylinderGeometry(.06, .066, .04, 16), i % 2 ? buttonB : buttonA, x, .115, z, deck));
  // upper body leans back a little
  const upper = new THREE.Group(); upper.position.set(0, 1.2, -.04); upper.rotation.x = -.05; root.add(upper);
  add(rbox(W - .1, 1.62, .94, .14), body, 0, .78, 0, upper);
  const frame = add(rbox(1.54, 1.1, .1, .05), bezel, 0, CABINET.screenY - 1.2, .49, upper); frame.rotation.x = -.1;
  for (const s of [-1, 1]) add(rbox(.05, 1.5, .06, .025), glow, s * (W - .1) / 2, .78, .46, upper);
  const marquee = add(rbox(W + .14, .56, 1.04, .22), header, 0, 1.76, 0, upper);

  const heads = {};
  for (const d of [false, true]) { const [c] = makeCanvas(1024, Math.round(1024 * .44 / (W + .1))); headerTexture(c, game.title, { ...palettes[d], shell }); const t = own.tex(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; heads[d] = t; }
  const plateMat = own.mat(new THREE.MeshBasicMaterial({ map: heads[false], toneMapped: false }));
  const plate = add(new THREE.PlaneGeometry(W + .1, .44), plateMat, 0, 1.76, .545, upper); plate.name = 'Marquee';
  const halo = createHalo({ THREE, own, color: shell, size: 3.4, opacity: .35 }); halo.position.set(0, 1.76, .75); upper.add(halo);

  const cover = own.tex(new THREE.Texture(art)); cover.colorSpace = THREE.SRGBColorSpace; cover.anisotropy = 4; cover.needsUpdate = true;
  const screenMat = own.mat(new THREE.MeshBasicMaterial({ map: cover, toneMapped: false }));
  const screen = add(new THREE.PlaneGeometry(CABINET.screenWidth, CABINET.screenHeight), screenMat, 0, CABINET.screenY - 1.2, .56, upper);
  screen.rotation.x = -.1; screen.name = `Display_${game.id}`;
  // glossy glass: an additive streak that sweeps across now and then
  const glassTex = own.tex(new THREE.CanvasTexture(glassTexture())); glassTex.repeat.set(.55, 1); glassTex.wrapS = glassTex.wrapT = THREE.ClampToEdgeWrapping;
  const glass = add(new THREE.PlaneGeometry(CABINET.screenWidth, CABINET.screenHeight), own.mat(new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), 0, CABINET.screenY - 1.2, .568, upper);
  glass.rotation.x = -.1; glass.renderOrder = 3; glass.userData.keep = true;

  const hit = new THREE.Mesh(new THREE.BoxGeometry(W + .1, CABINET.height, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
  own.geo(hit.geometry); own.mat(hit.material);
  hit.position.set(0, CABINET.height / 2, .05); hit.userData.cabinet = game.id; root.add(hit);

  mergeStatic(root, own);

  function retheme(p) {
    const dark = p.dark;
    body.color.set(dark ? '#2b3046' : '#ffffff'); deckMat.color.set(shell); panel.color.set(dark ? '#3a4162' : '#e9f7ee'); header.color.set(dark ? '#161a2c' : shell);
    glow.color.set(shell); stick.color.set(dark ? '#ffffff' : '#ff4f5e'); buttonA.color.set('#ffd23f'); buttonB.color.set(dark ? shell : '#ffffff');
    for (const m of [body, deckMat, panel, header]) { m.metalness = dark ? .2 : 0; m.envMapIntensity = dark ? .5 : .4; }
    root.userData.dark = dark; plateMat.map = heads[dark]; halo.material.opacity = dark ? .5 : .28;
  }
  /** Local point just under the screen, where the Play button hangs. */
  const anchor = new THREE.Vector3(0, CABINET.screenY - CABINET.screenHeight / 2 - .05, .45);

  const anim = { hover: 0, hoverGoal: 0, bounce: 9, phase: Math.random() * 6, sweep: Math.random() * 6 };
  /** Per frame: marquee pulse, glass sweep, hover/tap squash and bounce, screen brightening. */
  function update(dt, t, still = false) {
    anim.hover += (anim.hoverGoal - anim.hover) * (1 - Math.exp(-dt * 12));
    if (anim.bounce < 1.2) anim.bounce += dt;
    const b = anim.bounce < 1.2 ? Math.exp(-anim.bounce * 5) * Math.sin(anim.bounce * 17) : 0;
    const sy = 1 + (still ? 0 : b * .07) + anim.hover * .015, sxz = 1 - (still ? 0 : b * .035) + anim.hover * .01;
    root.scale.set(CABINET.scale * sxz, CABINET.scale * sy, CABINET.scale * sxz);
    root.position.y = root.userData.baseY + (still ? 0 : Math.max(0, b) * .05);
    const pulse = still ? 1 : .86 + .14 * Math.sin(t * 2.1 + anim.phase);
    halo.material.opacity = (palettes && root.userData.dark ? .5 : .28) * pulse + anim.hover * .15; plate.material.color.setScalar(pulse + .04);
    screenMat.color.setScalar(1 + anim.hover * .22);
    const cycle = (t * .18 + anim.sweep) % 1, k = still ? .5 : Math.min(1, cycle * 2.2);
    glassTex.offset.x = -.55 + k * 1.55;
  }
  return { root, hit, retheme, anchor, screen, update, hover(on) { anim.hoverGoal = on ? 1 : 0; }, bounce() { anim.bounce = 0; }, setDark(d) { root.userData.dark = d; } };
}
