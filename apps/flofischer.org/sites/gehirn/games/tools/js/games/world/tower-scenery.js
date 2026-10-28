/** Fossil-vault excavations. All authored detail is baked once with real scene depth.
 * Runtime collision segments and the camera's board mapping remain unchanged.
 */
import { THREE as T } from "../three-kit.js";
import { Batch, mtx, rng } from "./decor.js";
import { skyMaterial } from "./sky.js";
import { RoundedBoxGeometry } from "../../../vendor/three-0.170.0/RoundedBoxGeometry.js";

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
    scene = new T.Scene(),
    random = rng(97 * world + L.walls.length * 13 + L.pins.length * 7 + 1);
  const ownedGeometry = new Set(),
    ownedMaterial = new Set(),
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
  const material = (color, roughness = 0.9) => {
    const m = new T.MeshStandardMaterial({ color, roughness });
    ownedMaterial.add(m);
    return m;
  };
  const geometry = (g) => {
    ownedGeometry.add(g);
    return g;
  };
  const wallMat = material(W.edge),
    backMat = material(W.inside),
    groundMat = material(W.ground),
    cliffMat = material(W.rock);
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
  scene.background = new T.Color(W.sky.horizon).multiplyScalar(dark ? 0.42 : 1);
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
  for (let side of [-1, 1]) {
    box(side * 255, 5, -115, 172, 662, 106, cliffMat, 12);
    for (let i = 0; i < 8; i++) {
      const y = -300 + i * 91;
      add(
        rocks,
        [side * (242 + random() * 18), y, -84 - random() * 12],
        57 + random() * 17,
        [0, random() * 2, side * 0.1],
      );
      add(
        "fw_cliff_straight",
        [side * (355 + i * 12), y - 20, -220],
        65,
        [0, (side * Math.PI) / 2, 0],
        W.rock,
      );
    }
    add("fw_cliff_corner", [side * 268, -323, -70], 45, [
      0,
      side > 0 ? Math.PI / 2 : 0,
      0,
    ]);
    for (let i = 0; i < 12; i++) {
      const y = -290 + i * 50,
        x = side * (223 + random() * 55);
      if (W.plant.length)
        plant(W.plant[i % W.plant.length], [x, y, 16], 18 + random() * 22, [
          0,
          random() * 6,
          0,
        ]);
      if (world === 0)
        add(
          i % 2 ? "meadow_fern_arching" : "meadow_moss",
          [x, y, 6],
          14 + random() * 13,
          [0, random() * 6, 0],
        );
    }
  }
  for (let i = 0; i < 10; i++)
    add(
      rocks,
      [(i - 4.5) * 240, -315, -700 - random() * 230],
      170 + random() * 100,
      [0, random() * 6, 0],
    );
  const tree =
    world === 0
      ? "woodland_oak_old"
      : world === 1
        ? "woodland_palm_sahrun"
        : world === 2
          ? "woodland_spruce_tiered"
          : null;
  if (tree)
    for (let i = 0; i < 7; i++)
      add(
        tree,
        [(i - 3) * 250, -290, -520 - random() * 240],
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
  // Recessed excavation face and exact puzzle walls. Rounded dressing never changes collision.
  box(0, 0, -46, 286, 568, 22, backMat, 7);
  const seamMat = material(new T.Color(W.rock).multiplyScalar(0.88));
  for (let y = -265; y < 290; y += 58) box(0, y, -33.6, 269, 1.2, 0.5, seamMat);
  for (const [ax, ay, bx, by] of L.walls) {
    const len = Math.hypot(bx - ax, by - ay),
      angle = -Math.atan2(by - ay, bx - ax);
    const beam = box(
      BX((ax + bx) / 2),
      BY((ay + by) / 2),
      0,
      len + 12,
      12,
      64,
      wallMat,
      2,
    );
    beam.rotation.z = angle;
    // Shallow stone joints and keyed caps, merged once; all remain on the wall itself.
    for (let k = 25; k < len - 15; k += 38) {
      const u = k / len,
        x = BX(ax + (bx - ax) * u),
        y = BY(ay + (by - ay) * u);
      const joint = box(x, y, 32.2, 1, 10, 0.6, seamMat);
      joint.rotation.z = angle;
    }
  }
  // The open top is an excavation gantry with a fossil guild arch in the far wall.
  box(0, 274, -57, 114, 10, 96, wallMat, 2);
  add("fw_wall_stone_arch", [0, 279, -65], 30);
  for (const side of [-1, 1]) {
    for (let j = 0; j < 5; j++)
      add("fw_pillar_carved", [side * 155, -287 + j * 112, -18], [14, 43, 17]);
    add("fw_crates_stack", [side * 239, -286, 45], 33, [0, side * 0.3, 0]);
    add("fw_barrel_oak", [side * 291, -286, 17], 28, [0, 0.2, 0]);
  }
  add("fw_handcart_oak", [-256, -286, 74], 40, [0, 0.6, 0]);
  add("fw_tools_garden", [-226, -285, 92], 30, [0, -0.5, 0.1]);
  add("fw_shelves_oak", [253, -283, -18], 48, [0, -0.2, 0]);
  add("fw_books_stack", [254, -232, 8], 22);
  add("fw_petra_raw_fossil", [0, 301, -16], 12, [Math.PI / 2, 0, 0], W.rock);
  // Excavated fossils and roots are on the recessed face, behind all fluid/characters.
  for (let i = 0; i < 5; i++) {
    add(
      "fw_petra_raw_fossil",
      [(i % 2 ? 1 : -1) * (79 + random() * 25), 250 - i * 112, -31],
      8 + random() * 3,
      [Math.PI / 2, 0, random() * 0.5],
      new T.Color(W.rock).multiplyScalar(0.75),
    );
    if (world === 0)
      add(
        "woodland_ivy_hanging",
        [(i % 2 ? 1 : -1) * 166, 225 - i * 103, 10],
        25,
        [0, i * 0.9, 0],
      );
    if (world === 2)
      add(
        "fw_ice_crystal_cluster",
        [(i % 2 ? 1 : -1) * 192, -240 + i * 115, 9],
        24,
        [0, i, 0],
      );
    if (world === 3)
      add(
        "fw_lava_fissure",
        [(i % 2 ? 1 : -1) * 200, -270 + i * 105, -14],
        28,
        [0, i * 0.7, 0],
      );
  }
  const torches = [];
  for (const side of [-1, 1])
    for (const y of [-270, 10, 265]) {
      add("fw_street_light_sporecell", [side * 176, y, 22], 25);
      torches.push({
        x: side * 176,
        y: y + 36,
        z: 24,
        size: 8,
        color: 0xffc47a,
      });
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
    fit() {},
    dispose() {
      scene.clear();
      for (const g of ownedGeometry) g.dispose();
      for (const m of ownedMaterial) m.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
