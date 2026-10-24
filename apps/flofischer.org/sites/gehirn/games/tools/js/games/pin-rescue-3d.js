/**
 * Pin Rescue in 3D (Three.js): a stone tower with depth, golden pins, glossy water, glowing lava, real coins, and the
 * characters Pip and the Grumbles. The simulation stays 2D (board x right, y down, 360 × 640); here board (x, y) maps
 * to three (x − 180, 320 − y) on the z = 0 plane, which faces the camera head-on so the overlay can use a plain
 * scale + offset.
 */
import { THREE, studioEnvironment, createRenderer, texture, mat, addLights, Crowd, Particles } from './three-kit.js';
import { PIP, GRUMBLE } from './characters.js';
import { BOARD_W, BOARD_H } from './pin-rescue.js';

const DEPTH = 64;          // wall depth (z from −32 to +32)
const HUD = 56;            // CSS px the HUD covers at the top
const BX = (x) => x - BOARD_W / 2, BY = (y) => BOARD_H / 2 - y;
const PR = 5;

export class PinRescue3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.8;
    this.camera = new THREE.PerspectiveCamera(28, 1, 10, 6000);
    this.level = null; this.w = 1; this.h = 1;
    this.build();
  }

  build() {
    const s = this.scene;
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }));
    this.backdrop.position.z = -1600; this.backdrop.renderOrder = -1;
    s.add(this.backdrop);
    this.lights = addLights(s, { dir: [-260, 520, 620], shadowBox: 420, mapSize: 2048, intensity: 2.5, ambient: 1.25, sky: 0xe8f0ff, ground: 0x8a6a48 });
    this.lights.light.shadow.camera.far = 2000;
    this.lights.light.shadow.bias = -0.0004;
    // materials
    this.mWater = new THREE.MeshPhysicalMaterial({ color: 0x2b8af5, roughness: 0.05, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x0b47a8, emissiveIntensity: 0.45, transparent: true, opacity: 0.9 });
    this.mLava = new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.4, emissive: 0xe83200, emissiveIntensity: 0.85 });
    this.mStone = new THREE.MeshStandardMaterial({ color: 0x6b6460, roughness: 0.9, flatShading: true });
    this.mGold = new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.22, metalness: 0.85, emissive: 0x5a3a00, emissiveIntensity: 0.25 });
    const max = 520;
    const inst = (g, m, shadow = true) => { const im = new THREE.InstancedMesh(g, m, max); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true; im.count = 0; s.add(im); return im; };
    this.iWater = inst(new THREE.SphereGeometry(PR * 1.85, 12, 10), this.mWater, false);
    this.iLava = inst(new THREE.SphereGeometry(PR * 1.8, 12, 10), this.mLava, false);
    this.iStone = inst(new THREE.IcosahedronGeometry(PR * 1.4, 0), this.mStone);
    this.iGold = inst(new THREE.CylinderGeometry(PR * 1.2, PR * 1.2, 2.4, 14), this.mGold);
    this.pip = new Crowd(s, PIP, 1);
    this.grumbles = new Crowd(s, GRUMBLE, 6);
    this.fx = new Particles(s, 700);
    this.glow = new Particles(s, 200, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.visible = false; s.add(this.ring);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3();
  }

  /** Static tower geometry for a level (rebuilt when the level changes). */
  buildLevel(sess, dark) {
    if (this.tower) { this.scene.remove(this.tower); this.tower.traverse((o) => { o.geometry?.dispose(); }); }
    this.tower = new THREE.Group();
    const L = sess.L;
    const b = L.bounds || [40, 40, 320, 600];
    const brick = texture('t-brick', { repeat: [3, 6] });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(b[2] - b[0], b[3] - b[1]), mat(dark ? 0xb9a58c : 0xffffff, { map: brick, roughness: 0.9 }));
    back.position.set(BX((b[0] + b[2]) / 2), BY((b[1] + b[3]) / 2), -DEPTH / 2);
    back.receiveShadow = true; this.tower.add(back);
    // the hero's room glows warmly
    const [zx0, zy0, zx1, zy1] = sess.zone;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(zx1 - zx0, zy1 - zy0), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.position.set(BX((zx0 + zx1) / 2), BY((zy0 + zy1) / 2), -DEPTH / 2 + 0.5); this.tower.add(glow);
    const stoneTex = texture('t-stone', { repeat: [1, 1] });
    const wall = (seg, m) => {
      const [ax, ay, bx2, by2] = seg;
      const len = Math.hypot(bx2 - ax, by2 - ay) + 14;
      const g = new THREE.BoxGeometry(len, 14, DEPTH);
      const uv = g.attributes.uv; // stretch the stone pattern by length, not squash it
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 64);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(BX((ax + bx2) / 2), BY((ay + by2) / 2), 0);
      mesh.rotation.z = -Math.atan2(by2 - ay, bx2 - ax);
      mesh.castShadow = true; mesh.receiveShadow = true;
      return mesh;
    };
    const mWall = mat(dark ? 0xc9c3bb : 0xffffff, { map: stoneTex, roughness: 0.85 });
    for (const sg of L.walls) this.tower.add(wall(sg, mWall));
    this.breakables = (L.breakable || []).map((sg) => {
      const m = wall(sg, mat(0xffffff, { map: texture('t-wood', { repeat: [1, 1] }), roughness: 0.8 }));
      this.tower.add(m); return m;
    });
    // battlements and roof
    const roofShape = new THREE.Shape();
    roofShape.moveTo(BX(b[0] - 22), BY(b[1] - 2)); roofShape.lineTo(BX((b[0] + b[2]) / 2), BY(b[1] - 54)); roofShape.lineTo(BX(b[2] + 22), BY(b[1] - 2)); roofShape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: DEPTH + 24, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 2 }), mat(0xc2412d, { roughness: 0.6 }));
    roof.position.z = -(DEPTH + 24) / 2; roof.castShadow = true; this.tower.add(roof);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 46, 8), mat(0x6b4a2a));
    flagPole.position.set(BX((b[0] + b[2]) / 2), BY(b[1] - 54) + 22, 0); this.tower.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), mat(0x3f9b4a, { side: THREE.DoubleSide }));
    flag.position.set(BX((b[0] + b[2]) / 2) + 15, BY(b[1] - 54) + 36, 0); this.flag = flag; this.tower.add(flag);
    // ground mound
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(330, 380, 60, 40, 1), mat(dark ? 0x2f6b3a : 0x5fae4a, { roughness: 0.95, map: texture('t-grass', { repeat: [6, 1] }) }));
    mound.position.set(0, BY(b[3]) - 37, -60); mound.receiveShadow = true; this.tower.add(mound);
    // pins
    this.pinMeshes = sess.pins.map((pin) => {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, pin.len, 16), this.mPin || (this.mPin = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.22, emissive: 0x000000 })));
      bar.rotation.z = Math.PI / 2; bar.position.x = pin.len / 2; bar.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 3.6, 12, 28), this.mPin);
      ring.position.x = pin.len + 12;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 10), this.mPin); cap.position.x = 0;
      g.add(bar, ring, cap);
      g.rotation.z = -Math.atan2(pin.dy, pin.dx);
      g.userData.mat = this.mPin;
      this.tower.add(g);
      return g;
    });
    this.hoverMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, metalness: 0.8, roughness: 0.2, emissive: 0xffb300, emissiveIntensity: 0.6 });
    // rocks
    this.rockMeshes = sess.rocks.map((r) => {
      let m;
      if (r.kind === 'boulder') {
        m = new THREE.Mesh(new THREE.IcosahedronGeometry(r.r, 1), mat(0xffffff, { map: stoneTex, flat: true, roughness: 0.9 }));
      } else {
        m = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r.r, 18, 14), mat(0x1c1c22, { roughness: 0.25, metalness: 0.3 }));
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 10, 6), mat(0xa16207)); fuse.position.y = r.r + 3;
        const spark = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false }));
        spark.position.y = r.r + 9; m.add(ball, fuse, spark); m.userData.spark = spark;
      }
      m.castShadow = true; m.traverse?.((o) => { o.castShadow = true; });
      this.tower.add(m); return m;
    });
    this.scene.add(this.tower);
    this.level = sess;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the board (with roof) below the HUD; the z = 0 plane fills `fit` of the free height.
    const boardH = BOARD_H + 70, boardW = BOARD_W + 40;
    const availH = Math.max(80, h - HUD - 6);
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const distH = (boardH / 2) / tanH * (h / availH);
    const distW = (boardW / 2) / (tanH * this.camera.aspect);
    this.dist = Math.max(distH, distW);
    // shift the camera so the board's centre sits in the middle of the free area under the HUD
    const pxPerUnit = h / (2 * this.dist * tanH);
    const centreY = BY(BOARD_H / 2 - 35);
    this.camY = centreY + (HUD / 2) / pxPerUnit;
    this.camera.position.set(0, this.camY, this.dist);
    this.camera.lookAt(0, this.camY, 0);
    this.camera.near = this.dist * 0.1; this.camera.far = this.dist + 3000;
    this.camera.updateProjectionMatrix();
    // backdrop covers the view at its depth
    const bd = this.dist + 1600, vh = 2 * bd * tanH, vw = vh * this.camera.aspect;
    const imgAspect = 1024 / 1536;
    const bh = Math.max(vh, vw / imgAspect) * 1.02;
    this.backdrop.scale.set(bh * imgAspect, bh, 1);
    this.backdrop.position.set(0, this.camY, -1600);
  }

  layoutFor() {
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const s = this.h / (2 * this.dist * tanH); // px per board unit on the z = 0 plane
    const ox = this.w / 2 + (BX(0)) * s, oy = this.h / 2 - (BY(0) - this.camY) * s;
    return { s, ox, oy };
  }

  render(sess, view) {
    if (this.level !== sess || this.dark !== view.dark) { this.dark = view.dark; this.buildLevel(sess, view.dark); this.resize(this.w, this.h, this.renderer.getPixelRatio()); }
    this.backdrop.material.map = texture(view.dark ? 's-valley-night' : 's-valley', { clamp: true });
    this.lights.light.intensity = view.dark ? 1.8 : 2.5;
    this.lights.hemi.intensity = view.dark ? 0.9 : 1.25;
    const shake = sess.shake > 0 && !view.reduced ? sess.shake * 6 : 0;
    this.camera.position.set((Math.random() - 0.5) * shake, this.camY + (Math.random() - 0.5) * shake, this.dist);
    if (this.flag) this.flag.rotation.y = Math.sin(sess.t * 3) * 0.25;

    // pins
    sess.pins.forEach((pin, i) => {
      const g = this.pinMeshes[i];
      g.visible = pin.state !== 'out';
      const [ax, ay] = sess.pinSeg(pin);
      g.position.set(BX(ax), BY(ay), 0);
      const hot = pin.i === sess.hover && pin.state === 'in';
      for (const c of g.children) c.material = hot ? this.hoverMat : this.mPin;
    });
    this.breakables.forEach((m, i) => { m.visible = sess.breakables[i].alive; });
    // rocks
    sess.rocks.forEach((r, i) => {
      const m = this.rockMeshes[i];
      m.visible = r.alive;
      m.position.set(BX(r.x), BY(r.y), 0);
      if (r.kind === 'boulder') m.rotation.z = -r.rot;
      else if (m.userData.spark) m.userData.spark.scale.setScalar(0.7 + Math.random() * 0.6);
    });
    this.drawParticles(sess);
    this.drawCharacters(sess);
    this.drawFx(sess);
    this.renderer.render(this.scene, this.camera);
  }

  drawParticles(sess) {
    const counts = { water: 0, lava: 0, stone: 0, gold: 0 };
    const meshes = { water: this.iWater, lava: this.iLava, stone: this.iStone, gold: this.iGold };
    const { m4, q, e, v, sc } = this;
    for (let i = 0; i < sess.parts.length; i++) {
      const p = sess.parts[i];
      if (p.dead) continue;
      const mesh = meshes[p.t], n = counts[p.t]++;
      if (n >= mesh.instanceMatrix.count) continue;
      // a little depth jitter per particle so piles read as 3D
      const z = ((i * 7919) % 17) - 8;
      if (p.t === 'gold') q.setFromEuler(e.set(Math.PI / 2 + ((i * 37) % 10) * 0.12, (i % 7) * 0.4, ((i * 13) % 9) * 0.3 + p.x * 0.02));
      else if (p.t === 'stone') q.setFromEuler(e.set(i, i * 0.7, 0));
      else q.identity();
      const bob = p.t === 'lava' ? 1 + Math.sin(sess.t * 6 + i) * 0.08 : 1;
      m4.compose(v.set(BX(p.x), BY(p.y), p.t === 'water' || p.t === 'lava' ? z * 1.4 : z), q, sc.set(bob, bob, bob));
      mesh.setMatrixAt(n, m4);
    }
    for (const [t, mesh] of Object.entries(meshes)) { mesh.count = counts[t]; mesh.instanceMatrix.needsUpdate = true; }
  }

  drawCharacters(sess) {
    const h = sess.hero;
    this.pip.begin();
    const happy = h.mood === 'happy';
    const burnt = h.dead && h.cause === 'lava';
    this.pip.add(BX(h.x), BY(h.y + h.r) + (happy ? Math.abs(Math.sin(sess.t * 10)) * 8 : 0), 4, 0, 66, {
      phase: sess.t * 2, swing: 0.15, armsUp: happy || (h.dead && !burnt),
      tint: burnt ? BURNT : null, squash: h.dead && h.cause === 'boulder' ? 0.8 : 0, lean: h.dead && !burnt ? 0.4 : 0,
    });
    this.pip.end();
    this.grumbles.begin();
    for (const en of sess.enemies) {
      if (en.dead && en.deathT > 0.6) continue;
      const fade = en.dead ? 1 - en.deathT / 0.6 : 1;
      this.grumbles.add(BX(en.x), BY(en.y + en.r), 4, en.charging ? Math.sign(h.x - en.x) * 0.9 : 0, 60 * (en.dead ? Math.max(0.2, fade) : 1), {
        phase: sess.t * (en.charging ? 14 : 3), swing: en.charging ? 1 : 0.2,
        tint: en.dead && en.cause === 'lava' ? BURNT : null, squash: en.dead && en.cause === 'boulder' ? 0.85 : 0,
      });
    }
    this.grumbles.end();
  }

  drawFx(sess) {
    const fx = this.fx, gl = this.glow; fx.begin(); gl.begin();
    this.ring.visible = false;
    for (const f of sess.fx) {
      if (f.ring) {
        const q = 1 - f.life / f.max;
        this.ring.visible = true; this.ring.position.set(BX(f.x), BY(f.y), 10);
        this.ring.scale.setScalar(Math.max(0.01, f.r * q)); this.ring.material.opacity = 1 - q;
        continue;
      }
      const life = Math.max(0, Math.min(1, (f.life / f.max) * 1.5));
      if (f.puff) gl.add(BX(f.x), BY(f.y), 20, f.size * 1.2 * (0.4 + life), f.color.startsWith('rgba(241') ? 0x8a8f99 : 0x3a3530);
      else fx.add(BX(f.x), BY(f.y), 14, f.size * 0.9 * life + 0.3, f.color, f.life * 8);
    }
    // coins flying to the hero
    for (const c of sess.coins) {
      const q = 1 - c.life / c.max;
      const x = c.x + (sess.hero.x - c.x) * q, y = c.y + (sess.hero.y - 40 - c.y) * q - Math.sin(q * Math.PI) * 30;
      gl.add(BX(x), BY(y), 24, PR * (1.3 - q * 0.6), 0xffd34d);
    }
    // lava glow
    for (let i = 0; i < sess.parts.length; i += 3) {
      const p = sess.parts[i];
      if (!p.dead && p.t === 'lava') gl.add(BX(p.x), BY(p.y), 18, 9 + Math.sin(sess.t * 5 + i) * 2, 0x5a1800);
    }
    fx.end(); gl.end();
  }

  dispose() { this.renderer.dispose(); }
}
const BURNT = new THREE.Color(0x2a2522);

export const create = (canvas) => new PinRescue3D(canvas);
