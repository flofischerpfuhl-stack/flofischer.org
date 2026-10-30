/** Fernworld fossil vaults: real authored assets, original board physics, one static colour/depth bake. */
import {
  THREE,
  studioEnvironment,
  createRenderer,
  addLights,
  Particles,
  LOW_GPU,
  compileReady,
} from "./three-kit.js";
import { createShading, shadeFromUrl } from "./cel-shading.js";
import { BOARD_W, BOARD_H } from "./pips-tower.js";
import { Baker } from "./world/decor.js";
import {
  buildTowerScenery,
  prepareTowerScenery,
} from "./world/tower-scenery.js";
import { AssetLibrary } from "../../games-assets/fernworld/runtime/asset-library.js";
import { ChannelLibrary } from "../../games-assets/fernworld/runtime/channel-library.js";
import { createEffectInstances } from "../../games-assets/fernworld/effects.js";
import {
  BX,
  BY,
  GOLEMS,
  ENEMIES,
  TowerActor,
  named,
  pinTransform,
  socketTransform,
  doorTransform,
  configureFlap,
  updateFlap,
  leverTransform,
  clamp01,
} from "./pips-tower-assets.js";
const HUD = 56,
  PR = 5;
// Region lighting is shared by the baked excavation and its live actors.
const LOOKS = [
  {
    sun: 0xfff1d6,
    intensity: 2.5,
    ambient: 1.25,
    sky: 0xe8f0ff,
    ground: 0x8a6a48,
    exposure: 1.05,
  },
  {
    sun: 0xffcf96,
    intensity: 2.7,
    ambient: 1.1,
    sky: 0xffe3c2,
    ground: 0x9a6b3a,
    exposure: 1.05,
  },
  {
    sun: 0xe8f2ff,
    intensity: 2.4,
    ambient: 1.3,
    sky: 0xdcecff,
    ground: 0x7d8fa8,
    exposure: 1.0,
  },
  {
    sun: 0xffb27a,
    intensity: 2.6,
    ambient: 1.3,
    sky: 0xffc2a0,
    ground: 0x4a2a30,
    exposure: 1.08,
  },
];

/** Saturated cel gold for the instanced Groschen: flat colour, a warm emissive floor so the shaded side stays golden,
 *  and a screen-aligned hard glint (light crescent and dot upper left, dark crescent and inner ring) drawn after tone
 *  mapping, so it holds for every coin however it tumbles. */
function coinMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xf9ad0b, roughness: 0.7, metalness: 0, emissive: 0x5a3000, emissiveIntensity: 0.26 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCoinC; varying vec3 vCoinV; varying float vCoinR;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        mat4 coinMV = modelViewMatrix * instanceMatrix;
        vCoinC = (coinMV * vec4(0., 0., 0., 1.)).xyz; vCoinV = (coinMV * vec4(position, 1.)).xyz; vCoinR = 5.5 * length(coinMV[0].xyz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCoinC; varying vec3 vCoinV; varying float vCoinR;")
      .replace("#include <dithering_fragment>", `{
        vec2 cq = (vCoinV.xy - vCoinC.xy) / vCoinR; float cr = length(cq); vec2 cd = cq / max(cr, .001);
        float arcL = step(.7, dot(cd, vec2(-.707, .707))) * step(.5, cr) * step(cr, .88);
        float dotH = step(length(cq - vec2(-.28, .4)), .13);
        float arcD = step(.55, dot(cd, vec2(.707, -.707))) * step(.74, cr) * step(cr, 1.);
        vec3 gc = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(.72, .42, .3), arcD);
        gc = mix(gc, vec3(1., .98, .8), max(arcL, dotH));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gc, step(.5, normal.z));
      }
      #include <dithering_fragment>`);
  };
  m.customProgramCacheKey = () => "tower-coin";
  return m;
}

export class PipsTower3D {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.8;
    // shared Wind Waker cel look (cel-shading.js); ?shade=none keeps the old look
    const variant = shadeFromUrl();
    this.shading = variant ? createShading(variant, { ambient: 0.6 }) : null;
    this.camera = new THREE.PerspectiveCamera(28, 1, 10, 6000);
    this.w = 1;
    this.h = 1;
    this.library = new AssetLibrary();
    this.channels = new ChannelLibrary();
    this.actors = [];
    this.level = null;
    this.preparing = Promise.resolve();
    this.disposed = false;
    this.geometry = new Set();
    this.materials = new Set();
    this.build();
  }
  build() {
    const s = this.scene,
      ownG = (g) => {
        this.geometry.add(g);
        return g;
      },
      ownM = (m) => {
        this.materials.add(m);
        return m;
      };
    this.baker = new Baker();
    s.add(this.baker.quad);
    this.catcher = new THREE.Mesh(
      ownG(new THREE.PlaneGeometry(1, 1)),
      ownM(new THREE.ShadowMaterial({ opacity: 0.27, depthWrite: false })),
    );
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = -900;
    this.catcher.visible = !LOW_GPU;
    s.add(this.catcher);
    this.lights = addLights(s, {
      dir: [-260, 520, 620],
      shadowBox: 420,
      mapSize: 2048,
      intensity: 2.5,
      ambient: 1.25,
      sky: 0xe8f0ff,
      ground: 0x8a6a48,
    });
    this.lights.light.shadow.camera.far = 2000;
    this.lights.light.shadow.bias = -0.0004;
    const mat = (color, extras = {}) =>
      ownM(
        new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extras }),
      );
    const specs = {
      water: [
        new THREE.SphereGeometry(PR * 1.85, 12, 10),
        ownM(
          new THREE.MeshPhysicalMaterial({
            color: 0x438fc0,
            roughness: 0.09,
            clearcoat: 1,
            emissive: 0x17476b,
            emissiveIntensity: 0.22,
            transparent: true,
            opacity: 0.86,
          }),
        ),
        false,
      ],
      lava: [
        new THREE.SphereGeometry(PR * 1.8, 12, 10),
        mat(0xf36a2a, { emissive: 0xc33d0d, emissiveIntensity: 0.6 }),
        false,
      ],
      stone: [
        new THREE.IcosahedronGeometry(PR * 1.4, 1),
        mat(0x797573, { flatShading: true }),
        false,
      ],
      gem: [
        new THREE.OctahedronGeometry(PR * 1.35, 0),
        mat(0xe8b84a, { emissive: 0x6b3906, emissiveIntensity: 0.2 }),
        false,
      ],
      sand: [
        new THREE.IcosahedronGeometry(PR * 1.25, 0),
        mat(0xdab785, { roughness: 1 }),
        false,
      ],
      goo: [
        new THREE.SphereGeometry(PR * 1.75, 12, 8),
        mat(0x8f4bb4, {
          roughness: 0.21,
          emissive: 0x421359,
          emissiveIntensity: 0.34,
        }),
        false,
      ],
      gas: [
        new THREE.IcosahedronGeometry(PR * 2.6, 1),
        mat(0xb3c591, {
          emissive: 0x425a19,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.26,
          depthWrite: false,
        }),
        false,
      ],
    };
    this.parts = {};
    for (const [id, [g, m, shadow]] of Object.entries(specs)) {
      const mesh = new THREE.InstancedMesh(ownG(g), m, 520);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      s.add(mesh);
      this.parts[id] = mesh;
      if (id !== "gem") this.shading?.convert(m, mesh);
    }
    this.parts.gas.renderOrder = 2;
    this.flapGuide = new THREE.InstancedMesh(
      ownG(new THREE.BoxGeometry(1, 1, 1)),
      ownM(
        new THREE.MeshBasicMaterial({
          color: 0x69b8c5,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      ),
      2,
    );
    this.flapGuide.count = 0;
    this.flapGuide.renderOrder = 3;
    s.add(this.flapGuide);
    this.controlHalo = new THREE.Mesh(
      ownG(new THREE.TorusGeometry(12, 1.5, 6, 28)),
      ownM(
        new THREE.MeshBasicMaterial({
          color: 0xffdf8c,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    this.controlHalo.visible = false;
    s.add(this.controlHalo);
    // four-point sparkle that twinkles on single coins (one instanced draw, no extra lights)
    const starShape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, r = i % 2 ? 0.2 : 1;
      starShape[i ? "lineTo" : "moveTo"](Math.sin(a) * r, Math.cos(a) * r);
    }
    this.sparkle = new THREE.InstancedMesh(
      ownG(new THREE.ShapeGeometry(starShape)),
      ownM(new THREE.MeshBasicMaterial({ color: 0xfffbe0, toneMapped: false, depthWrite: false, transparent: true })),
      64,
    );
    this.sparkle.count = 0;
    this.sparkle.frustumCulled = false;
    this.sparkle.renderOrder = 4;
    s.add(this.sparkle);
    this.fx = new Particles(s, 700);
    this.glow = new Particles(
      s,
      200,
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.amb = new Particles(
      s,
      140,
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.ambGlow = new Particles(
      s,
      90,
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.smoke = new Particles(
      s,
      24,
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    for (const p of [this.amb, this.ambGlow, this.smoke])
      p.mesh.renderOrder = 3;
    this.ring = new THREE.Mesh(
      ownG(new THREE.TorusGeometry(1, 0.06, 6, 40)),
      ownM(
        new THREE.MeshBasicMaterial({
          color: 0xffd36b,
          transparent: true,
          toneMapped: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    this.ring.visible = false;
    s.add(this.ring);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.ac = new THREE.Color();
    this.effects = createEffectInstances(THREE, s, { capacity: 64 });
    this.reactions = Array.from({ length: 32 }, () => ({
      start: -99,
      x: 0,
      y: 0,
      type: "star_arc",
    }));
    this.reactionSlot = 0;
  }
  /** Cel shading hook: converts the lit materials under `root` and adds outline hulls (call after every material tweak). */
  cel(root, opts) {
    this.shading?.apply(root, opts);
  }
  prepare(sess, options = {}) {
    this.preparing = this.preparing
      .then(() => this._prepare(sess, options))
      .catch((error) => {
        this.releaseLevel();
        throw error;
      });
    // Permit an explicit UI retry after a failed download while returning the original rejection.
    const job = this.preparing;
    this.preparing = job.catch(() => undefined);
    return job;
  }
  async _prepare(sess, { onProgress, signal } = {}) {
    signal?.throwIfAborted();
    this.library.setProgressListener(onProgress, signal);
    this.channels.setProgressListener(onProgress, signal);
    if (this.disposed) throw new Error("Pip renderer disposed");
    if (this.level === sess && this.ready) return;
    const ids = new Set([
      "PIP_KESSEL",
      "BISCUIT_GLEAMPUP",
      "PULL_PIN",
      "PIN_SOCKET",
      "GROSCHEN_COIN",
      "FERNSTONE_CACHE",
    ]);
    for (const en of sess.enemies)
      ids.add(en.type === "chief" ? GOLEMS[sess.world] : ENEMIES[en.type]);
    if (sess.chief) {
      ids.add("GRANNY_GRAUSEL");
      ids.add("GRAUSEL_BROOM_GLIDER");
    }
    if (sess.levers.length) {
      ids.add("HINGED_FLAP");
      ids.add("VAULT_LEVER");
    }
    if (sess.plates.length) ids.add("PRESSURE_PLATE");
    if (sess.doors.length) ids.add("LINKED_DOOR");
    if (sess.gates.length) ids.add("KEYED_GATE");
    if (sess.ice.length) ids.add("ICE_BLOCK");
    if (sess.breakables.length) ids.add("TIMBER_BREAK_WALL");
    if (sess.portals.length) ids.add("STAR_TELEPORT_PAD");
    for (const r of sess.rocks)
      ids.add(
        { boulder: "VAULT_BOULDER", bomb: "VAULT_BOMB", key: "VAULT_KEY" }[
          r.kind
        ],
      );
    for (const [kind] of sess.L.fill)
      if (["water", "lava", "gas"].includes(kind))
        ids.add(
          { water: "WATER_SPOUT", lava: "LAVA_SPOUT", gas: "SWAMP_GAS_VENT" }[
            kind
          ],
        );
    const lod = (id) =>
      ["PIP_KESSEL", "BISCUIT_GLEAMPUP"].includes(id) ? undefined : "lo";
    const [prepared] = await Promise.all([
      prepareTowerScenery(this.library, this.channels, sess.world),
      ...Array.from(ids, (id) => this.library.template(id, lod(id))),
    ]);
    if (this.disposed)
      throw new Error("Pip renderer disposed during preparation");
    signal?.throwIfAborted();
    onProgress?.({phase: "prepare", stage: "Schatzkammer vorbereiten …", done: false});
    this.releaseLevel();
    this.ready = false;
    this.prepared = prepared;
    this.level = sess;
    this.look = LOOKS[sess.world];
    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    const make = async (id, scale = 1) => {
      const a = new TowerActor(await this.library.create(id, lod(id)), scale);
      this.actors.push(a);
      this.stage.add(a.root);
      return a;
    };
    this.hero = await make("PIP_KESSEL", 28);
    this.biscuit = await make("BISCUIT_GLEAMPUP", 46);
    this.heroStart = sess.t;
    this.enemyActors = [];
    for (const en of sess.enemies) {
      const id = en.type === "chief" ? GOLEMS[sess.world] : ENEMIES[en.type];
      const scale =
        en.type === "chief"
          ? 43
          : en.type === "zorbling"
            ? 57
            : en.type === "klonkbot"
              ? 50
              : 35;
      const a = await make(id, scale);
      a.distance = 0;
      a.lastX = en.x;
      a.lamps = a.material((m) => /lamp|lens|hex/i.test(m.name));
      a.lampOriginal = a.lamps.map((m) => ({
        emissive: m.emissive?.clone(),
        color: m.color.clone(),
      }));
      this.enemyActors.push(a);
      if (en.type === "buzzbot")
        a.rotors = ["Rotor_L", "Rotor_R"].map((n) => {
          const o = named(a.handle.scene, n);
          return { node: o, rest: o.quaternion.clone() };
        });
      if (en.type === "klonkbot") {
        a.wheel = named(a.handle.scene, "wheel");
        a.wheelRest = a.wheel.quaternion.clone();
      }
    }
    this.pinActors = [];
    this.socketActors = [];
    for (const p of sess.pins) {
      const a = await make("PULL_PIN");
      // Warm, readable metal marks the physical grip in every region, without
      // marking a correct move or changing the pin's collider/touch target.
      for (const m of a.material((_, o) => o.name === "Grip_Mesh")) {
        m.emissive.set(0xe6a52b);
        m.emissiveIntensity = 0.35;
        m.roughness = 0.38;
      }
      // a bright, thicker shaft stands out against every wall colour (visual only; the collider is the pin's segment)
      for (const m of a.material((_, o) => o.name === "ShaftStretch_Mesh")) {
        m.vertexColors = false;
        m.color.set(0xf6f8ff);
        m.emissive.set(0x6f7f9f);
        m.emissiveIntensity = 0.3;
        m.roughness = 0.45;
      }
      named(a.handle.scene, "ShaftStretch").scale.set(1.35, 1.35, 1);
      const inset = pinTransform(a.root, p);
      this.pinActors.push(a);
      const b = await make("PIN_SOCKET");
      socketTransform(b.root, p, inset);
      this.socketActors.push(b);
    }
    this.flapActors = [];
    this.leverActors = [];
    for (const lv of sess.levers) {
      const a = await make("HINGED_FLAP");
      configureFlap(a, lv);
      this.flapActors.push(a);
      const b = await make("VAULT_LEVER");
      leverTransform(b, lv);
      this.leverActors.push(b);
    }
    this.plateActors = [];
    for (const pl of sess.plates) {
      const a = await make("PRESSURE_PLATE");
      a.root.scale.set((pl.x1 - pl.x0) / 1.3, 24, 40);
      a.root.position.set(
        BX((pl.x0 + pl.x1) / 2),
        BY(pl.y - 6) - 0.2765 * 24,
        0,
      );
      a.plate = named(a.handle.scene, "PlateTravel");
      a.tint = a.material(() => true);
      for (const m of a.tint)
        m.color.set(pl.color).lerp(new THREE.Color(0xffffff), 0.55);
      this.plateActors.push(a);
    }
    this.doorActors = [];
    for (const d of sess.doors) {
      const a = await make("LINKED_DOOR");
      a.material((m, o) => o.name === "SignSurface_Mesh").forEach((m) =>
        m.color.set(d.color),
      );
      doorTransform(a, d, d.open);
      this.doorActors.push(a);
    }
    this.gateActors = [];
    for (const g of sess.gates) {
      const a = await make("KEYED_GATE");
      doorTransform(a, g, 0);
      this.gateActors.push(a);
    }
    this.iceActors = [];
    for (const ic of sess.ice) {
      const [x0, y0, x1, y1] = ic.rect,
        a = await make("ICE_BLOCK");
      a.root.scale.set((x1 - x0) / 0.94, (y1 - y0) / 1.02, 48 / 0.84);
      a.root.position.set(BX((x0 + x1) / 2), BY(y1), 0);
      this.iceActors.push(a);
    }
    this.woodActors = [];
    for (const w of sess.breakables) {
      const a = await make("TIMBER_BREAK_WALL"),
        angle = -Math.atan2(w.by - w.ay, w.bx - w.ax),
        len = Math.hypot(w.bx - w.ax, w.by - w.ay);
      a.root.scale.set(len / 1.426, 12 / 1.52, 180);
      a.root.rotation.z = angle;
      this.v
        .set(0, 0.8 * a.root.scale.y, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), angle);
      a.root.position.set(
        BX((w.ax + w.bx) / 2) - this.v.x,
        BY((w.ay + w.by) / 2) - this.v.y,
        0,
      );
      a.fragments = Array.from({ length: 5 }, (_, i) => {
        const n = named(a.handle.scene, "BreakGroup" + i);
        return { node: n, rest: n.position.clone() };
      });
      this.woodActors.push(a);
    }
    this.rockActors = [];
    for (const r of sess.rocks) {
      const a = await make(
        { boulder: "VAULT_BOULDER", bomb: "VAULT_BOMB", key: "VAULT_KEY" }[
          r.kind
        ],
        r.kind === "boulder" ? r.r / 0.58 : r.kind === "bomb" ? r.r / 0.33 : 21,
      );
      if (r.kind === "bomb") a.handle.scene.position.y = -0.33;
      this.rockActors.push(a);
    }
    this.portalActors = [];
    for (const pt of sess.portals) {
      const a = await make(
        "STAR_TELEPORT_PAD",
        (pt.from[2] - pt.from[0]) / 0.98,
      );
      a.place((pt.from[0] + pt.from[2]) / 2, pt.from[3] + 0.22 * a.scale, 0, 0);
      const b = await make("STAR_TELEPORT_PAD", 25);
      b.place(pt.to[0], pt.to[1] + 0.22 * 25, -7, 0);
      this.portalActors.push([a, b]);
    }
    for (const [type, x0, y0, x1] of sess.L.fill) {
      if (!["water", "lava", "gas"].includes(type)) continue;
      const a = await make(
        { water: "WATER_SPOUT", lava: "LAVA_SPOUT", gas: "SWAMP_GAS_VENT" }[
          type
        ],
        21,
      );
      a.place((x0 + x1) / 2, y0 + 8, -25, 0);
    }
    const cache = await make("FERNSTONE_CACHE", 19);
    cache.place(
      Math.max(66, Math.min(294, sess.hero.x - 39)),
      sess.hero.y + sess.hero.r,
      -10,
      0,
    );
    // The chest keeps its authored shape; only its green stone inlays become gold.
    this.goldChestGeometry ||= new Map();
    cache.handle.scene.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.color) return;
      if (this.goldChestGeometry.has(o.geometry)) { o.geometry = this.goldChestGeometry.get(o.geometry); return; }
      const source = o.geometry, g = source.clone(), colors = g.attributes.color;
      for (let i = 0; i < colors.count; i++) {
        const r = colors.getX(i), green = colors.getY(i), b = colors.getZ(i);
        if (green > r * 1.4 && green > b * 1.2) colors.setXYZ(i, Math.min(1, green * 1.65), green, 0.035);
      }
      this.goldChestGeometry.set(source, g); o.geometry = g; this.geometry.add(g);
    });
    this.cache = cache;
    this.granny = null;
    this.glider = null;
    this.escape = null;
    if (sess.chief) {
      this.granny = await make("GRANNY_GRAUSEL", 36);
      this.glider = await make("GRAUSEL_BROOM_GLIDER", 36);
      this.escape = new THREE.Group();
      this.stage.add(this.escape);
      this.escape.add(this.granny.root, this.glider.root);
      this.granny.root.position.set(0, 0, 0);
      this.glider.root.position.set(0, 0, 0);
      this.escape.visible = false;
    }
    if (!this.nativeGem) {
      const template = await this.library.template("GROSCHEN_COIN", "lo");
      template.scene.updateMatrixWorld(true);
      const pieces = [];
      template.scene.traverse((o) => {
        if (o.isMesh) pieces.push(o);
      });
      if (pieces.length !== 1)
        throw new Error("Groschen particle expects one authored primitive");
      const src = pieces[0],
        g = src.geometry.clone().applyMatrix4(src.matrixWorld);
      // Keep the authored mesh-to-asset rotation: its detailed face already faces +Z.
      g.translate(0, 0, -0.00675);
      g.scale(47, 47, 47);
      this.geometry.add(g);
      this.parts.gem.geometry = g;
      this.parts.gem.material = coinMaterial();
      this.materials.add(this.parts.gem.material);
      this.shading?.convert(this.parts.gem.material, this.parts.gem);
      this.nativeGem = true;
    }
    for (const a of this.actors) this.cel(a.root, { outline: "skinned", all: true });
    this.deadParts = new Uint8Array(Math.max(520, sess.parts.length));
    for (const r of this.reactions) r.start = -99;
    this.effects.clear();
    this.bakeDirty = true;
    this.sceneryFor = null;
    signal?.throwIfAborted();
    this.ready = true;
    onProgress?.({phase: "prepare", stage: "Schatzkammer bereit", done: true});
  }
  /** After prepare(): build the level's scenery and link its programs in parallel, so the first frame finds both done. */
  async precompile(sess, view) {
    if (this.level !== sess || !this.ready || this.disposed) return;
    if (this.sceneryFor !== sess.L || this.dark !== view.dark) {
      this.buildLevel(sess, view.dark);
      this.resize(this.w, this.h, this.renderer.getPixelRatio());
    }
    // the diorama is baked into a half-float target from its own scene (with distance fog): link those programs too
    const sc = this.scenery, probe = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    sc.scene.fog ??= new THREE.Fog(sc.fogColor, this.dist * 1.06, this.dist * 2.8);
    await Promise.all([compileReady(this.renderer, this.scene, this.camera), compileReady(this.renderer, sc.scene, this.camera, null, 4000, probe)]);
    probe.dispose();
  }
  releaseLevel() {
    this.scenery?.dispose();
    this.scenery = null;
    this.stage?.removeFromParent();
    for (const actor of this.actors) {
      this.shading?.release(actor.root);
      actor.dispose();
    }
    this.actors = [];
    this.level = null;
    this.ready = false;
  }
  buildLevel(sess, dark) {
    if (this.level !== sess)
      throw new Error("Pip level must be prepared before rendering");
    const L = sess.L,
      b = L.bounds || [40, 40, 320, 600],
      look = this.look;
    this.dark = dark;
    this.renderer.toneMappingExposure = look.exposure * (dark ? 0.92 : 1);
    this.scenery?.dispose();
    this.scenery = buildTowerScenery({
      L,
      world: sess.world,
      dark,
      low: LOW_GPU,
      look,
      prepared: this.prepared,
    });
    this.shading?.setDark(dark, { dim: 0.88 });
    this.cel(this.scenery.scene, { outline: false });
    this.sceneryFor = L;
    this.sceneryDark = dark;
    this.bakeDirty = true;
    this.texReady = -1;
    this.catcher.scale.set(b[2] - b[0], b[3] - b[1], 1);
    this.catcher.position.set(
      BX((b[0] + b[2]) / 2),
      BY((b[1] + b[3]) / 2),
      -32 + 0.5,
    );
    const li = this.lights;
    li.light.color.set(look.sun);
    li.hemi.color.set(look.sky);
    li.hemi.groundColor.set(look.ground);
    li.light.intensity = look.intensity * (dark ? 0.7 : 1);
    li.hemi.intensity = look.ambient * (dark ? 0.72 : 1);
  }
  render(sess, view) {
    if (this.level !== sess || !this.ready) return; // core owns loading/error UI; no old-character fallback
    if (this.sceneryFor !== sess.L || this.dark !== view.dark) {
      this.buildLevel(sess, view.dark);
      this.resize(this.w, this.h, this.renderer.getPixelRatio());
    }
    this.bake();
    const shake = sess.shake > 0 && !view.reduced ? sess.shake * 6 : 0;
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360),
      k = shake / (this.dist * tanH);
    this.baker.shift(
      this.camera,
      ((Math.random() - 0.5) * k) / this.camera.aspect,
      (Math.random() - 0.5) * k,
    );
    sess.pins.forEach((p, i) => pinTransform(this.pinActors[i].root, p));
    sess.levers.forEach((lv, i) => {
      updateFlap(this.flapActors[i], lv);
      leverTransform(this.leverActors[i], lv);
    });
    sess.doors.forEach((d, i) => doorTransform(this.doorActors[i], d, d.open));
    sess.gates.forEach((g, i) =>
      doorTransform(
        this.gateActors[i],
        g,
        g.alive ? 0 : clamp01(g.openT / 0.22),
      ),
    );
    sess.plates.forEach(
      (p, i) => (this.plateActors[i].plate.position.y = p.down ? -0.075 : 0),
    );
    sess.ice.forEach((ic, i) => (this.iceActors[i].root.visible = ic.alive));
    sess.breakables.forEach((w, i) => {
      const a = this.woodActors[i];
      if (!w.alive && a.deadAt == null) a.deadAt = sess.t;
      const age = a.deadAt == null ? 0 : sess.t - a.deadAt;
      a.root.visible = age < 0.7;
      for (let j = 0; j < 5; j++) {
        const f = a.fragments[j];
        f.node.position.copy(f.rest);
        if (age) {
          f.node.position.x += (j - 2) * age * 0.8;
          f.node.position.y += age * 0.3 - age * age;
          f.node.rotation.z = (j - 2) * age * 0.5;
        }
      }
    });
    sess.rocks.forEach((r, i) => {
      const a = this.rockActors[i];
      a.root.visible = r.alive;
      a.root.position.set(BX(r.x), BY(r.y), 0);
      a.root.rotation.z = -r.rot;
    });
    named(this.cache.handle.scene, "LidPivot").rotation.x =
      (-Math.PI / 180) *
      105 *
      Math.min(1, sess.collected / Math.max(1, sess.need));
    this.drawGuides(sess);
    this.drawCharacters(sess, view);
    this.drawParticles(sess, view);
    this.drawFx(sess);
    this.drawReactions(sess);
    this.drawAmbient(sess, view);
    // A zero-count InstancedMesh still makes Three prepare its material/program.
    // Hide empty particle batches before submission; every live instance is unchanged.
    for (const p of [this.fx, this.glow, this.amb, this.ambGlow, this.smoke])
      p.mesh.visible = p.mesh.count > 0;
    this.renderer.render(this.scene, this.camera);
  }
  drawGuides(sess) {
    let count = 0;
    for (const lv of sess.flaps) {
      if (lv.state !== "in" || count >= 2) continue;
      const [ax, ay, bx, by] = sess.leverSeg(lv, (1 - lv.pos) * lv.turn),
        len = Math.hypot(bx - ax, by - ay);
      this.m4.compose(
        this.v.set(BX((ax + bx) / 2), BY((ay + by) / 2), 5),
        this.q.setFromEuler(this.e.set(0, 0, -Math.atan2(by - ay, bx - ax))),
        this.sc.set(len, 9, 2),
      );
      this.flapGuide.setMatrixAt(count++, this.m4);
    }
    this.flapGuide.count = count;
    this.flapGuide.visible = count > 0;
    this.flapGuide.instanceMatrix.needsUpdate = count > 0;
    const c = sess.controls[sess.hover >= 0 ? sess.hover : sess.hintControl];
    this.controlHalo.visible = !!c && c.state === "in";
    if (this.controlHalo.visible)
      this.controlHalo.position.set(
        BX(c.kind === "pin" ? c.bx + c.dx * 12 : c.at[0]),
        BY(c.kind === "pin" ? c.by + c.dy * 12 : c.at[1] - 8),
        34,
      );
  }
  drawCharacters(sess, view) {
    const t = sess.t,
      h = sess.hero,
      happy = h.mood === "happy";
    if (h.dead && this.hero.deadAt == null) this.hero.deadAt = h.diedAt ?? t;
    if (happy && this.hero.happyAt == null) this.hero.happyAt = t;
    this.hero.place(h.x, h.y + h.r, 4, h.walk ? h.walk * 1.15 : 0.2);
    this.hero.pose(
      h.dead ? "Hit_Recover" : happy ? "Celebrate" : h.walk ? "Walk" : "Idle",
      h.dead ? t - this.hero.deadAt : happy ? t - this.hero.happyAt : t,
      !h.dead && !happy,
    );
    const side = h.x > 180 ? -1 : 1;
    this.biscuit.place(h.x + side * 29, h.y + h.r, -8, -side * 0.5);
    this.biscuit.pose(
      happy
        ? "Cheer"
        : h.walk
          ? "Run"
          : h.dead
            ? "Idle"
            : Math.floor(t / 5) % 3 === 1
              ? "Sniff"
              : "Idle",
      h.walk ? (t * 64) / (46 * 0.349206349) : t,
      true,
    );
    sess.enemies.forEach((en, i) => {
      const a = this.enemyActors[i];
      a.distance += Math.abs(en.x - a.lastX);
      a.lastX = en.x;
      if (en.dead && a.deadAt == null) {
        a.deadAt = en.diedAt ?? t;
        a.brakePhase = a.deadAt * Math.PI * 2 * 3.3;
      }
      const age = a.deadAt == null ? 0 : t - a.deadAt;
      a.place(
        en.x,
        en.y + en.r,
        en.type === "chief" ? -4 : 4,
        en.charging ? Math.sign(h.x - en.x) * 1.2 : 0.2,
      );
      a.root.visible =
        !en.dead ||
        age <
          (en.type === "chief"
            ? 3.2
            : en.type === "zorbling" && en.cause === "lava"
              ? 5
              : 2.2);
      if (en.type === "zorbling") {
        a.pose(
          en.dead
            ? en.cause === "lava"
              ? "Melt"
              : "Hit"
            : en.charging
              ? "Walk_InPlace"
              : "Idle",
          en.dead
            ? age
            : en.charging
              ? a.distance / (a.scale * 0.222222222)
              : t,
          !en.dead,
        );
        if (en.dead && en.cause === "lava")
          a.lamps.forEach((m, j) => {
            m.emissive
              ?.copy(a.lampOriginal[j].emissive)
              .multiplyScalar(1 - clamp01(age / 0.45));
            m.color
              .copy(a.lampOriginal[j].color)
              .lerp(this.ac.set(0x0a0906), clamp01(age / 0.45));
          });
      } else if (en.type === "klonkbot") {
        a.pose(
          en.dead
            ? "deactivated"
            : en.charging
              ? "wheel_roll_travel"
              : "idle_balance",
          en.dead ? age : en.charging ? a.distance / a.scale : t,
          !en.dead,
        );
        a.wheel.quaternion
          .copy(a.wheelRest)
          .multiply(
            this.q.setFromAxisAngle(
              this.v.set(1, 0, 0),
              a.distance / (a.scale * 0.208),
            ),
          );
        if (en.dead) {
          // Authored deactivated recipe: lens strength 2.6 -> .4 -> 0 at 0/.4/.9s.
          const fade =
            age < 0.4
              ? 1 - (age / 0.4) * (1 - 0.4 / 2.6)
              : (0.4 / 2.6) * (1 - clamp01((age - 0.4) / 0.5));
          a.lamps.forEach((m, j) =>
            m.emissive?.copy(a.lampOriginal[j].emissive).multiplyScalar(fade),
          );
        }
      } else if (en.type === "buzzbot") {
        // Source hover is .871m above its root; align the delivered visible body with the physics body.
        a.root.position.y -= 0.871 * a.scale;
        a.pose(
          en.dead ? "Disabled" : en.charging ? "FlightTilt" : "Hover",
          en.dead ? age : t,
          !en.dead,
        );
        const u = clamp01(age / 1.8),
          phase = en.dead
            ? a.brakePhase +
              Math.PI * 2 * 3.3 * 1.8 * (u - u * u + (u * u * u) / 3)
            : t * Math.PI * 2 * 3.3;
        a.rotors.forEach((r, j) =>
          r.node.quaternion
            .copy(r.rest)
            .multiply(
              this.q.setFromAxisAngle(
                this.v.set(0, 1, 0),
                (j ? -1 : 1) * phase,
              ),
            ),
        );
      } else {
        const hit = t - en.hitT;
        a.pose(
          en.dead ? "Disabled" : hit < 1 ? "Hit_Recover" : "Idle",
          en.dead ? age : hit < 1 ? hit : t,
          !en.dead && hit >= 1,
        );
        if (en.dead)
          a.lamps.forEach((m, j) =>
            m.emissive
              ?.copy(a.lampOriginal[j].emissive)
              .multiplyScalar(1 - clamp01(age / 0.5)),
          );
      }
    });
    if (this.escape) {
      const chiefIndex = sess.enemies.indexOf(sess.chief),
        a = this.enemyActors[chiefIndex];
      this.escape.visible = !!sess.chief.dead;
      if (this.escape.visible) {
        const age = t - a.deadAt,
          u = clamp01(age / 3);
        this.escape.position.set(
          BX(sess.chief.x) + u * 340,
          BY(sess.chief.y + sess.chief.r) + 35 + u * u * 390,
          18,
        );
        this.escape.rotation.y = 0.25 + u * 0.6;
        this.escape.rotation.z = -u * 0.12;
        this.granny.pose("Mounted_Escape", age, true);
      }
    }
  }
  drawReactions(sess) {
    for (let i = 0; i < sess.parts.length; i++) {
      const p = sess.parts[i];
      if (p.dead && !this.deadParts[i] && p.t === "goo") {
        const r = this.reactions[this.reactionSlot++ % 32];
        Object.assign(r, { start: sess.t, x: p.x, y: p.y, type: "star_arc" });
      }
      this.deadParts[i] = p.dead ? 1 : 0;
    }
    this.effects.begin();
    for (const r of this.reactions) {
      const age = sess.t - r.start;
      if (age < 0 || age > 0.55) continue;
      const s = 5 + age * 12;
      this.m4.compose(
        this.v.set(BX(r.x), BY(r.y) + age * 10, 12),
        this.q.setFromEuler(this.e.set(0, 0, age * 3)),
        this.sc.set(s, s, s),
      );
      this.effects.add(r.type, this.m4, 1 - age / 0.55);
    }
    for (let i = 0; i < sess.enemies.length; i++) {
      const en = sess.enemies[i],
        a = this.enemyActors[i];
      if (!en.dead || en.cause !== "water" || en.type === "zorbling") continue;
      const age = sess.t - a.deadAt;
      if (age > 1) continue;
      this.m4.compose(
        this.v.set(BX(en.x), BY(en.y - 20), 15),
        this.q.setFromEuler(this.e.set(0, 0, age * 10)),
        this.sc.set(23, 23, 23),
      );
      this.effects.add("spark_chain", this.m4, 1 - age);
    }
    this.effects.flush();
  }
  /** Bake the static diorama for the current level and view (again when a texture finishes loading). */
  bake() {
    const sc = this.scenery;
    const ready = sc.textures.filter(
      (t) => t.image && (t.image.width || t.image.naturalWidth),
    ).length;
    if (!this.bakeDirty && ready === this.texReady) return;
    this.bakeDirty = false;
    this.texReady = ready;
    this.baker.shift(this.camera, 0, 0);
    this.camera.position.set(0, this.camY, this.dist);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // supersampled (the bake is also the anti-aliasing of all that detail); dense screens need less
    const ss = LOW_GPU
      ? 1
      : size.x * size.y > 2.6e6 || this.renderer.getPixelRatio() >= 1.4
        ? 1.5
        : 2;
    sc.fit(this.camera, size.y * ss);
    // distance haze: the tower (z = 0) stays clear, the backdrop layers fade into the sky
    sc.scene.fog = new THREE.Fog(sc.fogColor, this.dist * 1.06, this.dist * 2.8);
    this.baker.bake(this.renderer, sc.scene, this.camera, ss);
    // the bake's shadow map is only needed while baking
    sc.scene.traverse((o) => {
      if (o.isDirectionalLight && o.shadow.map) {
        o.shadow.map.dispose();
        o.shadow.map = null;
      }
    });
  }

  resize(w, h, dpr) {
    if (w !== this.w || h !== this.h || dpr !== this.renderer.getPixelRatio())
      this.bakeDirty = true;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the board (with roof) below the HUD; the z = 0 plane fills `fit` of the free height.
    const boardH = BOARD_H + 70,
      boardW = BOARD_W + 40;
    const availH = Math.max(80, h - HUD - 6);
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const distH = (boardH / 2 / tanH) * (h / availH);
    const distW = boardW / 2 / (tanH * this.camera.aspect);
    this.dist = Math.max(distH, distW);
    // shift the camera so the board's centre sits in the middle of the free area under the HUD
    const pxPerUnit = h / (2 * this.dist * tanH);
    const centreY = BY(BOARD_H / 2 - 35);
    this.camY = centreY + HUD / 2 / pxPerUnit;
    this.camera.position.set(0, this.camY, this.dist);
    this.camera.lookAt(0, this.camY, 0);
    this.camera.near = this.dist * 0.1;
    this.camera.far = this.dist + 7000;
    this.camera.updateProjectionMatrix();
  }

  layoutFor() {
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const s = this.h / (2 * this.dist * tanH); // px per board unit on the z = 0 plane
    const ox = this.w / 2 + BX(0) * s,
      oy = this.h / 2 - (BY(0) - this.camY) * s;
    return { s, ox, oy };
  }

  drawParticles(sess, view) {
    const counts = {
      water: 0,
      lava: 0,
      stone: 0,
      gem: 0,
      sand: 0,
      goo: 0,
      gas: 0,
    };
    const meshes = this.parts;
    const { m4, q, e, v, sc } = this;
    let sparks = 0;
    for (let i = 0; i < sess.parts.length; i++) {
      const p = sess.parts[i];
      if (p.dead) continue;
      const mesh = meshes[p.t],
        n = counts[p.t]++;
      if (n >= mesh.instanceMatrix.count) continue;
      // a little depth jitter per particle so piles read as 3D
      const z = ((i * 7919) % 17) - 8;
      let k = 1;
      if (p.t === "gem")
        q.setFromEuler(
          e.set(
            Math.sin(sess.t * 1.2 + i) * 0.16,
            Math.sin(sess.t * 1.6 + i * 0.9) * 0.3,
            sess.t * 0.45 + i * 0.9,
          ),
        );
      else if (p.t === "stone" || p.t === "sand")
        q.setFromEuler(e.set(i, i * 0.7, 0));
      else {
        q.identity();
        if (p.t === "lava" || p.t === "goo")
          k = 1 + Math.sin(sess.t * 6 + i) * 0.08;
        else if (p.t === "gas") k = 0.85 + Math.sin(sess.t * 3 + i) * 0.15;
      }
      m4.compose(
        v.set(
          BX(p.x),
          BY(p.y),
          p.t === "water" || p.t === "lava" || p.t === "goo"
            ? z * 1.4
            : p.t === "gas"
              ? z * 2
              : z,
        ),
        q,
        sc.set(k, k, k),
      );
      mesh.setMatrixAt(n, m4);
      // a coin catches the light now and then: a quick 4-point glint in front of it
      if (p.t === "gem" && sparks < 64 && !view?.reduced) {
        const period = 2.2 + (((i * 37) % 11) / 11) * 1.8,
          ph = (sess.t / period + i * 0.618034) % 1;
        if (ph < 0.13) {
          const k = Math.sin((ph / 0.13) * Math.PI) * PR * 2.5;
          m4.compose(v.set(BX(p.x) + PR * 0.3, BY(p.y) + PR * 0.35, z + 12), q.identity(), sc.set(k, k, 1));
          this.sparkle.setMatrixAt(sparks++, m4);
        }
      }
    }
    // Reuse the same native coin batch for collection; coins visibly enter the chest.
    for (const c of sess.coins) {
      const n = counts.gem++;
      if (n >= meshes.gem.instanceMatrix.count) break;
      const f = 1 - c.life / c.max, target = this.cache.root.position;
      q.setFromEuler(e.set(0, Math.sin(f * Math.PI) * 0.35, f * 4));
      m4.compose(v.set(BX(c.x) + (target.x - BX(c.x)) * f,
        BY(c.y) + (target.y + 12 - BY(c.y)) * f + Math.sin(f * Math.PI) * 30, 24),
        q, sc.setScalar(1 - f * 0.45));
      meshes.gem.setMatrixAt(n, m4);
    }
    this.sparkle.count = sparks;
    this.sparkle.visible = sparks > 0;
    this.sparkle.instanceMatrix.needsUpdate = sparks > 0;
    for (const [t, mesh] of Object.entries(meshes)) {
      mesh.count = Math.min(counts[t], mesh.instanceMatrix.count);
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = mesh.visible;
    }
  }

  drawFx(sess) {
    const fx = this.fx,
      gl = this.glow;
    fx.begin();
    gl.begin();
    this.ring.visible = false;
    for (const f of sess.fx) {
      if (f.ring) {
        const q = 1 - f.life / f.max;
        this.ring.visible = true;
        this.ring.position.set(BX(f.x), BY(f.y), 10);
        this.ring.scale.setScalar(Math.max(0.01, f.r * q));
        this.ring.material.opacity = 1 - q;
        continue;
      }
      const life = Math.max(0, Math.min(1, (f.life / f.max) * 1.5));
      if (f.puff)
        gl.add(
          BX(f.x),
          BY(f.y),
          20,
          f.size * 1.2 * (0.4 + life),
          f.color.startsWith("rgba(241")
            ? 0x8a8f99
            : f.color.startsWith("#a855f7") || f.color.startsWith("rgba(216")
              ? 0x4a1a6a
              : 0x3a3530,
        );
      else
        fx.add(
          BX(f.x),
          BY(f.y),
          14,
          f.size * 0.9 * life + 0.3,
          f.color,
          f.life * 8,
        );
    }
    // Golden collection glint follows the native coin into the chest
    for (const c of sess.coins) {
      const q = 1 - c.life / c.max;
      const target = this.cache.root.position;
      const x = BX(c.x) + (target.x - BX(c.x)) * q,
        y = BY(c.y) + (target.y + 12 - BY(c.y)) * q + Math.sin(q * Math.PI) * 30;
      gl.add(x, y, 25, PR * (0.8 - q * 0.4), 0xffce62);
    }
    // lava glow
    for (let i = 0; i < sess.parts.length; i += 3) {
      const p = sess.parts[i];
      if (!p.dead && p.t === "lava")
        gl.add(
          BX(p.x),
          BY(p.y),
          18,
          9 + Math.sin(sess.t * 5 + i) * 2,
          0x5a1800,
        );
    }
    fx.end();
    gl.end();
  }

  /** The world's ambient life (cheap: one instanced draw each); none on software WebGL. */
  drawAmbient(sess, view) {
    const a = this.amb,
      g = this.ambGlow,
      sm = this.smoke,
      c = this.ac;
    a.begin();
    g.begin();
    sm.begin();
    const sc = this.scenery;
    if (!LOW_GPU && sc && !view.reduced) {
      const t = sess.t,
        kind = sc.ambient.kind,
        dark = this.dark;
      const h = (i, k) => {
        const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      const wrap = (v, lo, hi) =>
        lo + ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));
      const n =
        kind === "snow"
          ? 110
          : kind === "ember"
            ? 60
            : kind === "dust"
              ? 60
              : dark
                ? 50
                : 36;
      for (let i = 0; i < n; i++) {
        const x0 = (h(i, 1) * 2 - 1) * 640,
          z = -170 + h(i, 2) * 260,
          sp = 0.5 + h(i, 3);
        if (kind === "snow") {
          const y = wrap(380 - t * 26 * sp - h(i, 4) * 760, -360, 400),
            x = x0 + Math.sin(t * 0.9 * sp + i) * 16 + t * 6;
          a.add(
            wrap(x, -660, 660),
            y,
            z,
            1.1 + h(i, 5) * 1.6,
            c.setRGB(1, 1, 1),
          );
        } else if (kind === "dust") {
          const x = wrap(x0 + t * 18 * sp, -660, 660),
            y = -320 + h(i, 4) * 300 + Math.sin(t * 0.7 + i) * 12;
          a.add(x, y, z, 0.7 + h(i, 5) * 0.9, c.setRGB(1, 0.86, 0.62));
        } else if (kind === "ember") {
          const y = wrap(-330 + t * 30 * sp + h(i, 4) * 700, -340, 380),
            x = x0 + Math.sin(t * 1.3 * sp + i) * 14;
          if (i % 3)
            g.add(
              x,
              y,
              z,
              0.8 + h(i, 5) * 1.1,
              c.setRGB(1.6, 0.55 + h(i, 6) * 0.3, 0.12),
            );
          else
            a.add(
              x,
              wrap(380 - t * 12 * sp - h(i, 4) * 700, -340, 380),
              z,
              1 + h(i, 5),
              c.setRGB(0.45, 0.4, 0.42),
            );
        } else {
          // pollen by day, fireflies at night
          const x = x0 + Math.sin(t * 0.4 * sp + i * 2) * 40,
            y =
              -300 +
              h(i, 4) * (dark ? 520 : 380) +
              Math.sin(t * 0.8 * sp + i) * 20;
          const pulse = dark ? 0.6 + 0.4 * Math.sin(t * 3 * sp + i * 5) : 1;
          g.add(
            x,
            y,
            z,
            (dark ? 1.6 : 0.9 + h(i, 5) * 0.7) * pulse,
            dark ? c.setRGB(0.9, 1.4, 0.45) : c.setRGB(1, 0.95, 0.55),
          );
        }
      }
      // torch and lantern flames flicker over their baked glow
      sc.torches.forEach((tr, i) => {
        if (tr.smoke) {
          for (let k = 0; k < 10; k++) {
            const ph = (t * 0.28 + k / 10) % 1,
              s = (5 + ph * 16) * Math.min(1, (1 - ph) * 4);
            sm.add(
              tr.x + ph * 34 + Math.sin(t + k) * 4,
              tr.y + 6 + ph * 110,
              tr.z,
              s,
              c.setRGB(0.92, 0.92, 0.95),
              k,
            );
          }
          return;
        }
        const f =
          0.75 +
          0.18 * Math.sin(t * 11 + i * 1.7) +
          0.1 * Math.sin(t * 23 + i * 3.1);
        g.add(
          tr.x,
          tr.y + 1,
          tr.z + 2,
          tr.size * 0.42 * f,
          c.set(tr.color).multiplyScalar(0.5),
        );
      });
    }
    a.end();
    g.end();
    sm.end();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseLevel();
    this.effects.dispose();
    this.baker.dispose();
    for (const p of [this.fx, this.glow, this.amb, this.ambGlow, this.smoke]) {
      p.mesh.removeFromParent();
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      p.mesh.dispose?.();
    }
    for (const g of this.geometry) g.dispose();
    for (const m of this.materials) m.dispose();
    this.shading?.dispose();
    this.lights.light.shadow.map?.dispose();
    this.scene.environment?.dispose();
    this.library.dispose();
    this.channels.dispose();
    this.renderer.dispose();
  }
}
export const create = (canvas) => new PipsTower3D(canvas);
