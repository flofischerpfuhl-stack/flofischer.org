/** Fossil-vault excavations. All authored detail is baked once with real scene depth.
 * Runtime collision segments and the camera's board mapping remain unchanged.
 */
import { THREE as T } from "../three-kit.js";
import { Batch, mtx, rng } from "./decor.js";
import { skyMaterial } from "./sky.js";
import { RoundedBoxGeometry } from "../../../vendor/three-0.170.0/RoundedBoxGeometry.js";
import { STYLE, masonry, shingles, archShape, hipRoofGeometry, windowSpots } from "./tower-dressing.js";

const BX = (x) => x - 180,
  BY = (y) => 320 - y;
export const WORLD = [
  {
    name: "Viridis · Fernhaven fossil vaults",
    sky: {
      top: 0x477d82,
      horizon: 0xc6d8ba,
      glow: 0xffedbb,
      cloud: 0xf2eee0,
      shade: 0x8fa9a4,
    },
    rock: 0x7b8370,
    inside: 0xd3c8a4,
    edge: 0x9caa87,
    ground: 0x526e48,
    light: 0xffe4b3,
    ambient: { kind: "pollen" },
    channel: [
      "fw_granite_moss",
      "woodland_oak_old",
      "woodland_bush_hazel",
      "woodland_exposed_roots",
      "woodland_ivy_hanging",
      "meadow_fern_arching",
      "meadow_moss",
      "meadow_grass_short",
      "meadow_daisy",
    ],
    plant: ["CUSHION_MOSS"],
  },
  {
    name: "Sahrun · Sandstone archive",
    sky: {
      top: 0x677e94,
      horizon: 0xe5cba6,
      glow: 0xffdab0,
      cloud: 0xf6e5c7,
      shade: 0xb49785,
    },
    rock: 0xb58c66,
    inside: 0xe4c49c,
    edge: 0xcaa77a,
    ground: 0xc2a279,
    light: 0xffd29f,
    ambient: { kind: "dust" },
    channel: [
      "fw_sandstone_bedded",
      "woodland_palm_sahrun",
      "fw_market_stall",
      "fw_planter_terracotta",
      "fw_river_pebble_strip",
    ],
    plant: [
      "DESERT_FERN",
      "SAND_GRASS_CLUMP",
      "DESERT_BLOOM",
      "SUCCULENT_ROSETTE",
    ],
  },
  {
    name: "Hibern · Glacial fossil vaults",
    sky: {
      top: 0x547b98,
      horizon: 0xd4e6eb,
      glow: 0xe3f5ef,
      cloud: 0xe9f0ee,
      shade: 0x90acbd,
    },
    rock: 0x8199a4,
    inside: 0xc5d5d6,
    edge: 0xc5dbdf,
    ground: 0x9aafb7,
    light: 0xe7f3fb,
    ambient: { kind: "snow" },
    channel: [
      "fw_granite_moss",
      "woodland_spruce_tiered",
      "fw_snow_wind_drift",
      "fw_ice_crystal_cluster",
    ],
    plant: ["ALPINE_DWARF_PINE", "ALPINE_FERN", "FROST_GRASS", "ALPINE_BLOOM"],
  },
  {
    name: "Vulkara · Basalt fossil vaults",
    sky: {
      top: 0x363144,
      horizon: 0x9c6d60,
      glow: 0xe5a06e,
      cloud: 0x8f7a78,
      shade: 0x514854,
    },
    rock: 0x5e5b62,
    inside: 0x97928a,
    edge: 0x83787c,
    ground: 0x514e52,
    light: 0xffc795,
    ambient: { kind: "ember" },
    channel: ["fw_basalt_columns", "fw_lava_fissure", "fw_petra_raw_fossil"],
    plant: [
      "ASH_GRASS_CLUMP",
      "BASALT_ROOT_SHRUB",
      "CHAR_FERN",
      "EMBER_BLOOM",
      "LAVA_EDGE_LICHEN",
    ],
  },
];
const COMMON = [
  "fw_cliff_straight",
  "fw_cliff_corner",
  "fw_wall_stone_arch",
  "fw_wall_stone_straight",
  "fw_pillar_carved",
  "fw_petra_raw_fossil",
  "fw_floor_timber",
  "fw_stairs_wood",
  "fw_railing_stone",
  "fw_shelves_oak",
  "fw_books_stack",
  "fw_crates_stack",
  "fw_barrel_oak",
  "fw_handcart_oak",
  "fw_tools_garden",
  "fw_street_light_sporecell",
  "fw_cloud_cumulus",
];

/** Explicit preparation: no silent missing-prop paths, only the selected region is loaded. */
export async function prepareTowerScenery(library, channels, world) {
  const W = WORLD[world] || WORLD[0],
    models = new Map(),
    plants = new Map();
  await Promise.all(
    [...new Set([...COMMON, ...W.channel])].map(async (id) =>
      models.set(id, await channels.model(id, "hi")),
    ),
  );
  await Promise.all(
    W.plant.map(async (id) => plants.set(id, await library.template(id, "hi"))),
  );
  return { models, plants };
}

export function buildTowerScenery({
  L,
  world = 0,
  dark = false,
  low = false,
  look,
  prepared,
}) {
  if (!prepared)
    throw new Error(
      "Fossil-vault assets must finish loading before the level starts",
    );
  const W = WORLD[world],
    S = STYLE[world],
    scene = new T.Scene(),
    seed = 97 * world + L.walls.length * 13 + L.pins.length * 7 + 1,
    random = rng(seed),
    variant = (L.walls.length + L.pins.length * 2 + world) % 3;
  const ownedGeometry = new Set(),
    ownedMaterial = new Set(),
    ownedTexture = new Set(),
    batches = new Map();
  const batch = (key) => {
    if (!batches.has(key)) batches.set(key, new Batch());
    return batches.get(key);
  };
  const add = (id, pos, scale, rot = [0, 0, 0], color = 0xffffff) => {
    const model = prepared.models.get(id);
    if (!model) throw new Error(`Unprepared vault scenery: ${id}`);
    const matrix = mtx(pos, rot, scale);
    for (const part of model) batch(part.mat).add(part.geometry, matrix, color);
  };
  const plant = (id, pos, scale, rot = [0, 0, 0]) => {
    const template = prepared.plants.get(id);
    if (!template) throw new Error(`Unprepared vault plant: ${id}`);
    // These authored plants use an atlas, not vertex colours. Keep their UVs/materials
    // intact for the one-time bake; cloning nodes shares library-owned resources.
    const instance = template.scene.clone(true),
      parent = new T.Group();
    parent.matrixAutoUpdate = false;
    parent.matrix.copy(mtx(pos, rot, scale));
    instance.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    parent.add(instance);
    scene.add(parent);
  };
  const material = (color, roughness = 0.9, extras = {}) => {
    const m = new T.MeshStandardMaterial({ color, roughness, ...extras });
    ownedMaterial.add(m);
    return m;
  };
  const glowMaterial = (color) => {
    const m = new T.MeshBasicMaterial({ color });
    ownedMaterial.add(m);
    return m;
  };
  const geometry = (g) => {
    ownedGeometry.add(g);
    return g;
  };
  const texture = (t) => {
    ownedTexture.add(t);
    return t;
  };
  const masonryTex = (kind, base, mortar, sd, repeat) => {
    const { map, emissive } = masonry(kind, base, mortar, sd);
    texture(map);
    if (emissive) texture(emissive);
    for (const t of [map, emissive])
      if (t && repeat) {
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
      }
    return { map, emissive };
  };
  const slabMat = material(S.slab, 0.85),
    lipMat = material(S.lip, 0.8),
    frameMat = material(S.frame, 0.9),
    groundMat = material(W.ground);
  const backTex = masonryTex(S.wall, S.back, S.mortar, seed + 1),
    pierTex = masonryTex(S.wall, S.pier, S.mortar, seed + 2, [1, 2.2]);
  const withGlow = (t, k) =>
    t.emissive
      ? { emissive: 0xffffff, emissiveMap: t.emissive, emissiveIntensity: k }
      : {};
  const backMat = material(0xffffff, 0.95, { map: backTex.map, ...withGlow(backTex, 0.9) });
  const pierMat = material(0xffffff, 0.95, { map: pierTex.map, ...withGlow(pierTex, 0.7) });
  const box = (x, y, z, w, h, d, mat, round = 0) => {
    const geo = geometry(
      round
        ? new RoundedBoxGeometry(w, h, d, 2, round)
        : new T.BoxGeometry(w, h, d),
    );
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const glow = (geo, color, x, y, z) => {
    const m = new T.Mesh(geometry(geo), glowMaterial(color));
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  const horizon = new T.Color(W.sky.horizon).multiplyScalar(dark ? 0.42 : 1);
  scene.background = horizon;
  const hemi = new T.HemisphereLight(
    look.sky,
    look.ground,
    look.ambient * (dark ? 0.8 : 1),
  );
  const sun = new T.DirectionalLight(
    look.sun,
    look.intensity * (dark ? 0.72 : 1),
  );
  sun.position.set(-550, 900, 1000);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -680;
  sun.shadow.camera.right = 680;
  sun.shadow.camera.top = 600;
  sun.shadow.camera.bottom = -550;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2500;
  sun.shadow.bias = -0.0004;
  scene.add(hemi, sun, sun.target);
  const sky = new T.Mesh(
    geometry(new T.PlaneGeometry(6000, 5000)),
    skyMaterial(W.sky, world, dark ? 1 : 0),
  );
  ownedMaterial.add(sky.material);
  sky.position.set(0, 600, -2100);
  scene.add(sky);
  // A continuous ground excavation, not a floating island or the same map as another game.
  box(0, -336, -250, 2600, 100, 1500, groundMat, 12);
  const rocks = W.channel[0];

  // Backdrop with depth: three layers of hills, dunes or peaks that fade into the sky (the renderer adds the fog).
  const layerColor = (i) =>
    new T.Color(S.hills[i]).lerp(horizon, i * 0.18).multiplyScalar(dark ? 0.5 : 1);
  const mound = (x, z, w, h, color) => {
    const m = new T.Mesh(
      geometry(new T.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
      material(color, 1),
    );
    m.scale.set(w, h, w * 0.55);
    m.position.set(x, -286, z);
    scene.add(m);
  };
  const peak = (x, z, w, h, color, cap) => {
    const m = new T.Mesh(geometry(new T.ConeGeometry(1, 1, 7, 1)), material(color, 1));
    m.scale.set(w, h, w * 0.8);
    m.position.set(x, -286 + h / 2, z);
    scene.add(m);
    if (cap) {
      const c = new T.Mesh(geometry(new T.ConeGeometry(1, 1, 7, 1)), material(cap, 1));
      c.scale.set(w * 0.36, h * 0.36, w * 0.8 * 0.36);
      c.position.set(x, -286 + h * 0.82, z);
      scene.add(c);
    }
    return m;
  };
  const shiftX = (random() - 0.5) * 240;
  for (let layer = 2; layer >= 0; layer--) {
    const z = -520 - layer * 520,
      col = layerColor(layer);
    for (let i = -4; i <= 4; i++) {
      const x = i * 330 + shiftX + (random() - 0.5) * 120,
        w = 260 + random() * 200 + layer * 70,
        h = 70 + random() * 90 + layer * 60;
      if (S.peak === "snow")
        peak(x, z, w * 0.8, h * 1.9, col, layer < 2 ? 0xffffff : 0xf4fbff);
      else if (S.peak === "mesa" && (i + layer) % 2 === 0)
        box(x, -286 + h * 0.45, z, w * 0.9, h * 0.9, w * 0.5, material(col, 1), 10);
      else if (S.peak === "volcano" && i === (layer === 0 ? -1 : layer === 1 ? 2 : 0)) {
        peak(x, z, w * 1.3, h * 2.6, col);
        glow(new T.CircleGeometry(w * 0.1, 16), 0xff8a3a, x, -286 + h * 2.6 - 4, z + w * 0.12).scale.y = 0.45;
        glow(new T.PlaneGeometry(w * 0.05, h * 1.3), 0xff6a1a, x, -286 + h * 1.9, z + w * 0.33);
      } else mound(x, z, w, h, col);
    }
  }
  const tree =
    world === 0
      ? "woodland_oak_old"
      : world === 1
        ? "woodland_palm_sahrun"
        : world === 2
          ? "woodland_spruce_tiered"
          : null;
  if (tree)
    for (let i = 0; i < 9; i++)
      add(
        tree,
        [(i - 4) * 230 + shiftX * 0.5 + (random() - 0.5) * 80, -286, -420 - random() * 260],
        95 + random() * 40,
        [0, random() * 6, 0],
      );
  for (let i = 0; i < 4; i++)
    add(
      "fw_cloud_cumulus",
      [(i - 1.5) * 580, 650 + random() * 250, -1700],
      95,
      [0, random() * 6, 0],
    );

  // Side piers: textured masonry in the world's colour, boulders and plants in front.
  for (let side of [-1, 1]) {
    box(side * 255, 5, -115, 172, 662, 106, pierMat, 12);
    box(side * 168, 5, -60, 8, 640, 20, frameMat, 2);
    for (let i = 0; i < 7; i++) {
      const y = -290 + i * 98;
      if ((i + (side > 0 ? 1 : 0) + variant) % (world === 3 ? 2 : 3) === 0) continue;
      add(
        rocks,
        [side * (250 + random() * 22), y, -70 - random() * 14],
        50 + random() * 16,
        [0, random() * 2, side * 0.1],
        S.rockTint,
      );
    }
    add("fw_cliff_corner", [side * 268, -323, -70], 45, [0, side > 0 ? Math.PI / 2 : 0, 0], S.rockTint);
    for (let i = 0; i < 12; i++) {
      const y = -290 + i * 50,
        x = side * (223 + random() * 55);
      if (W.plant.length)
        plant(W.plant[i % W.plant.length], [x, y, 16], 18 + random() * 22, [0, random() * 6, 0]);
      if (world === 0)
        add(i % 2 ? "meadow_fern_arching" : "meadow_moss", [x, y, 6], 14 + random() * 13, [0, random() * 6, 0]);
    }
  }
  for (let i = 0; i < 6; i++)
    add(
      rocks,
      [(i - 2.5) * 300 + shiftX, -315, -420 - random() * 230],
      150 + random() * 90,
      [0, random() * 6, 0],
      S.rockTint,
    );

  // Recessed back wall (the world's masonry) and the exact puzzle walls as slabs with a lip.
  box(0, 0, -46, 286, 568, 22, backMat, 7);
  const seamMat = material(new T.Color(S.mortar).multiplyScalar(0.9));
  const lips = [];
  for (const [ax, ay, bx, by] of L.walls) {
    const len = Math.hypot(bx - ax, by - ay),
      angle = -Math.atan2(by - ay, bx - ax),
      flat = Math.abs(by - ay) < Math.abs(bx - ax) * 0.8 && len > 28,
      cx = BX((ax + bx) / 2),
      cy = BY((ay + by) / 2),
      sn = Math.sin(angle),
      cs = Math.cos(angle);
    // slab body 7 high plus a 5 high lip: the same 12 px collision thickness as before, never changed
    const beam = box(
      flat ? cx + sn * 2.5 : cx,
      flat ? cy - cs * 2.5 : cy,
      0,
      len + 12,
      flat ? 7 : 12,
      64,
      slabMat,
      2,
    );
    beam.rotation.z = angle;
    if (flat) {
      const lip = box(cx - sn * 3.5, cy + cs * 3.5, 1, len + 14, 5, 68, lipMat, 2);
      lip.rotation.z = angle;
      lips.push([ax, ay, bx, by, len]);
    }
    // Shallow stone joints, merged once; all remain on the wall itself.
    for (let k = 25; k < len - 15; k += 38) {
      const u = k / len,
        x = BX(ax + (bx - ax) * u),
        y = BY(ay + (by - ay) * u);
      const joint = box(x, y, 32.2, 1, flat ? 6 : 10, 0.6, seamMat);
      joint.rotation.z = angle;
    }
  }
  // tufts, flowers or crystals growing out of the lips
  let tufts = 0;
  for (const [ax, ay, bx, by, len] of lips) {
    if (len < 60) continue;
    for (let k = 20 + random() * 20; k < len - 14 && tufts < 18; k += 46 + random() * 44) {
      const u = k / len,
        p = [BX(ax + (bx - ax) * u), BY(ay + (by - ay) * u) + 9, 26 + random() * 12];
      if (world === 0 && random() < 0.6) add("meadow_grass_short", p, 10 + random() * 6, [0, random() * 6, 0]);
      else if (W.plant.length) plant(W.plant[tufts % W.plant.length], p, 9 + random() * 6, [0, random() * 6, 0]);
      tufts++;
    }
  }
  // glowing ember edge on the basalt slabs
  if (world === 3)
    for (const [ax, ay, bx, by, len] of lips) {
      const m = glow(new T.BoxGeometry(len + 6, 1.8, 1), 0xff8a2a, BX((ax + bx) / 2), BY((ay + by) / 2) + 9.5, 34);
      m.rotation.z = -Math.atan2(by - ay, bx - ax);
    }

  // Arched windows on the back wall, wherever the level leaves room.
  const windows = windowSpots(L, random, world === 3 ? 4 : 5);
  const mullion = material(new T.Color(S.frame).multiplyScalar(0.55));
  for (const [wx, wy] of windows) {
    const x = BX(wx),
      y = BY(wy) - 38,
      ww = 30,
      hh = 52;
    const frame = new T.Mesh(
      geometry(new T.ExtrudeGeometry(archShape(ww + 10, hh + 7), { depth: 4, bevelEnabled: false })),
      frameMat,
    );
    frame.position.set(x, y - 3, -35);
    frame.castShadow = true;
    scene.add(frame);
    glow(new T.ShapeGeometry(archShape(ww, hh)), S.glass, x, y, -30.6);
    box(x, y + hh * 0.42, -30, ww, 2, 1.4, mullion).castShadow = false;
    box(x, y + hh * 0.5 - 4, -30, 2, hh - 8, 1.4, mullion).castShadow = false;
    box(x, y - 4, -33, ww + 14, 5, 12, slabMat, 1.5);
  }

  // The roof: a hipped roof with a round window, a finial with a flag and a banner pair.
  const roofTex = texture(shingles(S.roof, S.roofLip, world === 2, seed + 3));
  const hip = new T.Mesh(geometry(hipRoofGeometry(158, 52, 86, 46)), material(0xffffff, 0.85, { map: roofTex }));
  hip.position.set(0, 290, -4);
  hip.castShadow = true;
  hip.receiveShadow = true;
  scene.add(hip);
  box(0, 286, 0, 328, 8, 112, frameMat, 2);
  box(0, 281.5, 30, 330, 3, 30, lipMat, 1);
  for (let i = -7; i <= 7; i++) box(i * 21, 280, 44, 9, 9, 18, slabMat, 2);
  const roundWin = glow(new T.CircleGeometry(11, 20), S.glass, 0, 308, 35);
  roundWin.rotation.x = -0.5;
  const ring = new T.Mesh(geometry(new T.TorusGeometry(12, 2.4, 6, 24)), frameMat);
  ring.position.set(0, 308, 35.4);
  ring.rotation.x = -0.5;
  scene.add(ring);
  const poleX = variant === 1 ? -70 : variant === 2 ? 70 : 0;
  box(poleX, 345, -6, 2.4, 52, 2.4, frameMat);
  const flag = new T.Mesh(geometry(new T.PlaneGeometry(30, 17)), material(S.banner, 0.9, { side: T.DoubleSide }));
  flag.position.set(poleX + 16, 360, -6);
  scene.add(flag);
  for (const side of [-1, 1]) {
    const bn = new T.Shape(),
      by0 = 250 - (variant === (side > 0 ? 0 : 1) ? 40 : 0);
    bn.moveTo(-9, 0);
    bn.lineTo(9, 0);
    bn.lineTo(9, -64);
    bn.lineTo(0, -52);
    bn.lineTo(-9, -64);
    bn.closePath();
    const cloth = new T.Mesh(geometry(new T.ShapeGeometry(bn)), material(S.banner, 0.9, { side: T.DoubleSide }));
    cloth.position.set(side * 205, by0, -58);
    cloth.castShadow = true;
    scene.add(cloth);
    glow(new T.CircleGeometry(4, 12), S.emblem, side * 205, by0 - 26, -57.5);
    box(side * 205, by0 + 2, -58, 28, 3, 3, frameMat);
  }

  // pillars and props at the foot, mirrored in some levels
  const flip = variant === 1 ? -1 : 1;
  for (const side of [-1, 1]) {
    for (let j = 0; j < 5; j++) add("fw_pillar_carved", [side * 155, -287 + j * 112, -18], [14, 43, 17]);
    add("fw_crates_stack", [side * flip * 239, -286, 45], 33, [0, side * 0.3, 0]);
    add("fw_barrel_oak", [side * flip * 291, -286, 17], 28, [0, 0.2, 0]);
  }
  add("fw_handcart_oak", [-256 * flip, -286, 74], 40, [0, 0.6 * flip, 0]);
  add("fw_tools_garden", [-226 * flip, -285, 92], 30, [0, -0.5, 0.1]);
  add("fw_shelves_oak", [253 * flip, -283, -18], 48, [0, -0.2, 0]);
  add("fw_books_stack", [254 * flip, -232, 8], 22);
  // Excavated fossils and roots are on the recessed face, behind all fluid/characters.
  for (let i = 0; i < 5; i++) {
    add(
      "fw_petra_raw_fossil",
      [(i % 2 ? 1 : -1) * (79 + random() * 25), 250 - i * 112, -31],
      8 + random() * 3,
      [Math.PI / 2, 0, random() * 0.5],
      new T.Color(S.mortar).multiplyScalar(1.4),
    );
    if (world === 0)
      add("woodland_ivy_hanging", [(i % 2 ? 1 : -1) * 166, 225 - i * 103, 10], 25, [0, i * 0.9, 0]);
    if (world === 2)
      add("fw_ice_crystal_cluster", [(i % 2 ? 1 : -1) * 192, -240 + i * 115, 9], 24, [0, i, 0]);
    if (world === 3)
      add("fw_lava_fissure", [(i % 2 ? 1 : -1) * 200, -270 + i * 105, -14], 28, [0, i * 0.7, 0]);
  }
  const torches = [];
  for (const side of [-1, 1])
    for (const y of [-270, 10, 265]) {
      add("fw_street_light_sporecell", [side * 176, y, 22], 25);
      torches.push({ x: side * 176, y: y + 36, z: 24, size: 8, color: S.lamp });
    }
  for (const [key, b] of batches)
    if (!b.empty) {
      const mesh = b.mesh({
        roughness: key === "gloss" ? 0.35 : 0.85,
        glow: key === "glow",
        shadow: true,
      });
      ownedGeometry.add(mesh.geometry);
      ownedMaterial.add(mesh.material);
      scene.add(mesh);
    }
  return {
    scene,
    torches,
    ambient: W.ambient,
    textures: [],
    fogColor: horizon.clone().lerp(new T.Color(W.sky.top), 0.12),
    fit() {},
    dispose() {
      scene.clear();
      for (const g of ownedGeometry) g.dispose();
      for (const m of ownedMaterial) m.dispose();
      for (const t of ownedTexture) t.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
