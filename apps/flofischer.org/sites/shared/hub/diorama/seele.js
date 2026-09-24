import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  clamp, createNoise, lerp, matrixFrom, paintVertices, patchMaterial, rng, smoothIcosahedron, smoothstep, taperedTube,
} from "./utils.js";
import { softFoliage } from "./materials.js";
import {
  BANANAS, BRIDGE_Z, CHAPEL, GROTTO, JUNGLE_TREES, PALMS, POND, SEELE_PATH, SEELE_SIGN, SIDE_PATH, WATER_Y,
  WAYSIDE_CROSS, insideIsland, pathDistance, rimDistance, rimFactor, RX, RZ, streamCenter, terrainHeight, waterDistance,
} from "./layout.js";

const noise = createNoise(77);
const UP = new THREE.Vector3(0, 1, 0);

function chapelLocal(x, z) {
  const dx = x - CHAPEL.x;
  const dz = z - CHAPEL.z;
  const cos = Math.cos(-CHAPEL.rotation);
  const sin = Math.sin(-CHAPEL.rotation);
  return [dx * cos + dz * sin, -dx * sin + dz * cos];
}

/** Keeps vegetation off buildings, water, paths and signs. */
function blocked(x, z, { water = 0.06, path = 0.2, chapel = 0.2 } = {}) {
  if (x > -0.12) return true;
  if (waterDistance(x, z) < water) return true;
  if (pathDistance(SEELE_PATH, x, z) < path || pathDistance(SIDE_PATH, x, z) < path * 0.8) return true;
  const [lx, lz] = chapelLocal(x, z);
  if (Math.abs(lx) < 1.32 + chapel && lz > -2.55 - chapel && lz < 2.45 + chapel) return true;
  if (Math.hypot(x - GROTTO.x, z - GROTTO.z) < 1.0) return true;
  if (Math.hypot(x - SEELE_SIGN[0], z - SEELE_SIGN[1]) < 0.5) return true;
  if (Math.hypot(x - WAYSIDE_CROSS[0], z - WAYSIDE_CROSS[1]) < 0.3) return true;
  if (Math.abs(z - BRIDGE_Z) < 0.5 && Math.abs(x - streamCenter(BRIDGE_Z)) < 1.0) return true;
  return false;
}

// ---------------------------------------------------------------- grass ----

export function grassTuft(random, blades = 6) {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const segments = 3;
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = random() * Math.PI * 2;
    const offset = Math.sqrt(random()) * 0.06;
    const ox = Math.cos(angle) * offset;
    const oz = Math.sin(angle) * offset;
    const facing = random() * Math.PI * 2;
    const dirX = Math.cos(facing);
    const dirZ = Math.sin(facing);
    const lean = 0.12 + random() * 0.42;
    const height = 0.72 + random() * 0.5;
    const width = 0.026 + random() * 0.014;
    const base = positions.length / 3;
    const hue = random();
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const cx = ox + dirX * lean * t * t * height;
      const cz = oz + dirZ * lean * t * t * height;
      const cy = height * t * (1 - 0.18 * lean * t);
      const w = width * (1 - t * 0.9);
      const px = -dirZ;
      const pz = dirX;
      const normalX = dirX * 0.35;
      const normalZ = dirZ * 0.35;
      const length = Math.hypot(normalX, 1, normalZ);
      const r = lerp(0.14, 0.4 + hue * 0.12, t);
      const g = lerp(0.24, 0.58, t);
      const b = lerp(0.1, 0.3 + hue * 0.06, t);
      if (segment < segments) {
        positions.push(cx - px * w, cy, cz - pz * w, cx + px * w, cy, cz + pz * w);
        normals.push(normalX / length, 1 / length, normalZ / length, normalX / length, 1 / length, normalZ / length);
        colors.push(r, g, b, r, g, b);
        uvs.push(0, t, 1, t);
      } else {
        positions.push(cx, cy, cz);
        normals.push(normalX / length, 1 / length, normalZ / length);
        colors.push(r, g, b);
        uvs.push(0.5, 1);
      }
    }
    for (let segment = 0; segment < segments - 1; segment += 1) {
      const a = base + segment * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const last = base + (segments - 1) * 2;
    indices.push(last, last + 1, last + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const WIND_PROJECT = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  {
    float bend = uv.y * uv.y;
    vec2 p = mvPosition.xz;
    float gust = sin(uTime * 1.1 + p.x * 0.55 + p.y * 0.35) * 0.6 + sin(uTime * 2.3 + p.x * 1.7 - p.y * 1.1) * 0.25;
    float wave = smoothstep(0.35, 1.0, sin(uTime * 0.55 - p.x * 0.32 - p.y * 0.18) * 0.5 + 0.5);
    vec2 wind = vec2(0.85, 0.45) * (gust * 0.35 + wave * 0.9) * uWind;
    mvPosition.xz += wind * bend * mvPosition.w * 0.12;
    mvPosition.y -= dot(wind, wind) * bend * 0.02;
  }
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

function windMaterial(world, material, { key, translucency = true, tintByPart = false }) {
  const uniforms = { uTime: world.uniforms.time, uWind: world.uniforms.wind, uGlow: world.uniforms.grassGlow };
  return patchMaterial(material, {
    key,
    uniforms,
    vertexHead: `uniform float uTime;\nuniform float uWind;\nvarying float vBlade;${tintByPart ? "\nattribute float aPart;" : ""}`,
    vertex: [
      ["project_vertex", WIND_PROJECT],
      ["color_vertex", `$&\nvBlade = uv.y;${tintByPart ? "\n#ifdef USE_INSTANCING_COLOR\nvColor = mix(color, color * instanceColor, aPart);\n#endif" : ""}`],
    ],
    fragmentHead: "uniform float uGlow;\nvarying float vBlade;",
    fragment: [
      ["normal_fragment_begin", "$&\nnormal = normalize(vNormal);"],
      ...(translucency ? [["emissivemap_fragment", "$&\ntotalEmissiveRadiance += diffuseColor.rgb * vBlade * vBlade * uGlow;"]] : []),
    ],
  });
}

function buildGrass(world) {
  const low = world.quality.low;
  const random = rng(18);
  const variants = [grassTuft(rng(1), 6), grassTuft(rng(2), 7), grassTuft(rng(3), 5)];
  const count = low ? 2800 : 7600;
  const rimCount = low ? 110 : 260;
  const material = windMaterial(world, new THREE.MeshLambertMaterial({ name: "grass", vertexColors: true, side: THREE.DoubleSide }), { key: "grass" });
  const perVariant = Math.ceil((count + rimCount) / variants.length);
  const meshes = variants.map((geometry) => {
    const mesh = new THREE.InstancedMesh(geometry, material, perVariant);
    mesh.count = 0;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = "grass";
    return mesh;
  });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  const place = (x, z, height, tiltAxis = null, tilt = 0) => {
    const mesh = meshes[placed % meshes.length];
    placed += 1;
    dummy.position.set(x, terrainHeight(x, z) - 0.015, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    if (tiltAxis) {
      dummy.quaternion.setFromAxisAngle(tiltAxis, tilt).multiply(new THREE.Quaternion().setFromAxisAngle(UP, random() * Math.PI * 2));
    }
    const width = 0.8 + random() * 0.5;
    dummy.scale.set(width, height, width);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count, dummy.matrix);
    const patch = noise.fbm2(x * 0.5, z * 0.5, 3);
    const dry = smoothstep(0.1, 0.45, noise.n2(x * 0.32 + 7, z * 0.32));
    color.setHSL(0.25 + patch * 0.07 - dry * 0.06, 0.36 + random() * 0.16 - dry * 0.08, 0.4 + random() * 0.1 + dry * 0.06);
    mesh.setColorAt(mesh.count, color);
    mesh.count += 1;
  };

  let attempts = 0;
  let grown = 0;
  while (grown < count && attempts < count * 12) {
    attempts += 1;
    const x = -0.1 - random() * (RX + 0.1);
    const z = (random() * 2 - 1) * RZ;
    if (!insideIsland(x, z, 0.05)) continue;
    if (blocked(x, z, { water: 0.1, path: 0.16, chapel: 0.05 })) continue;
    const bank = smoothstep(0.7, 0.12, waterDistance(x, z));
    const rim = smoothstep(0.9, 0.1, rimDistance(x, z));
    const forecourt = smoothstep(1.3, 0.4, Math.hypot(x - CHAPEL.x, z - (CHAPEL.z + 2.4)));
    const meadow = noise.fbm2(x * 0.4 + 2, z * 0.4, 3) * 0.5 + 0.5;
    const height = (0.17 + meadow * 0.16 + bank * 0.22 + rim * 0.05) * (1 - forecourt * 0.5) * (0.75 + random() * 0.5);
    place(x, z, height);
    grown += 1;
  }
  // Overhanging turf along the rim.
  for (let index = 0; index < rimCount; index += 1) {
    const theta = Math.PI * (0.5 + random());
    const factor = rimFactor(theta);
    const inset = random() * 0.1;
    const x = Math.cos(theta) * (RX * factor - inset);
    const z = Math.sin(theta) * (RZ * factor - inset);
    if (x > -0.2 || waterDistance(x, z) < 0.15) continue;
    const tangent = new THREE.Vector3(-Math.sin(theta) * RX, 0, Math.cos(theta) * RZ).normalize();
    place(x, z, 0.2 + random() * 0.22, tangent, -(0.3 + random() * 0.5));
  }
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    world.scene.add(mesh);
  }
}

// -------------------------------------------------------------- flowers ----

function flowerGeometry(kind) {
  const positions = [];
  const colors = [];
  const parts = [];
  const uvs = [];
  const indices = [];
  const push = (x, y, z, color, part) => {
    positions.push(x, y, z);
    colors.push(...color);
    parts.push(part);
    uvs.push(0.5, clamp(y, 0, 1));
    return positions.length / 3 - 1;
  };
  const stem = [0.24, 0.42, 0.16];
  // Three-sided stem.
  const stemRadius = 0.012;
  const ring = (y) => [0, 1, 2].map((side) => {
    const angle = (side / 3) * Math.PI * 2;
    return push(Math.cos(angle) * stemRadius, y, Math.sin(angle) * stemRadius, stem, 0);
  });
  const bottom = ring(0);
  const top = ring(1);
  for (let side = 0; side < 3; side += 1) {
    const next = (side + 1) % 3;
    indices.push(bottom[side], top[side], bottom[next], bottom[next], top[side], top[next]);
  }
  // Two little leaves on the stem.
  for (const [y, angle] of [[0.28, 0.4], [0.5, 3.4]]) {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const a = push(0, y, 0, stem, 0);
    const b = push(dx * 0.08 - dz * 0.022, y + 0.07, dz * 0.08 + dx * 0.022, [0.3, 0.52, 0.2], 0);
    const c = push(dx * 0.08 + dz * 0.022, y + 0.07, dz * 0.08 - dx * 0.022, [0.3, 0.52, 0.2], 0);
    const d = push(dx * 0.15, y + 0.16, dz * 0.15, [0.34, 0.56, 0.22], 0);
    indices.push(a, b, c, b, d, c);
  }
  const petals = kind === "daisy" ? 9 : 5;
  const length = kind === "daisy" ? 0.05 : 0.045;
  const width = kind === "daisy" ? 0.011 : 0.024;
  const lift = kind === "daisy" ? 0.12 : 0.95;
  for (let petal = 0; petal < petals; petal += 1) {
    const angle = (petal / petals) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const tipY = 1 + Math.sin(lift) * length;
    const reach = Math.cos(lift) * length;
    const a = push(dx * 0.008 - dz * width * 0.4, 1, dz * 0.008 + dx * width * 0.4, [1, 1, 1], 1);
    const b = push(dx * 0.008 + dz * width * 0.4, 1, dz * 0.008 - dx * width * 0.4, [1, 1, 1], 1);
    const c = push(dx * reach * 0.6 - dz * width, lerp(1, tipY, 0.6), dz * reach * 0.6 + dx * width, [1, 1, 1], 1);
    const d = push(dx * reach * 0.6 + dz * width, lerp(1, tipY, 0.6), dz * reach * 0.6 - dx * width, [1, 1, 1], 1);
    const e = push(dx * reach, tipY, dz * reach, [0.92, 0.92, 0.92], 1);
    indices.push(a, c, b, b, c, d, c, e, d);
  }
  const center = kind === "daisy" ? [1.0, 0.78, 0.18] : [0.12, 0.08, 0.06];
  const centerTop = push(0, 1.018, 0, center, 0);
  const rim = [];
  for (let side = 0; side < 6; side += 1) {
    const angle = (side / 6) * Math.PI * 2;
    rim.push(push(Math.cos(angle) * 0.016, 1.004, Math.sin(angle) * 0.016, center, 0));
  }
  for (let side = 0; side < 6; side += 1) indices.push(centerTop, rim[(side + 1) % 6], rim[side]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aPart", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let index = 0; index < normals.count; index += 1) {
    const ny = Math.abs(normals.getY(index));
    normals.setXYZ(index, normals.getX(index) * 0.4, ny + 0.6, normals.getZ(index) * 0.4);
  }
  return geometry;
}

function buildFlowers(world) {
  const low = world.quality.low;
  const random = rng(281);
  const species = [
    { kind: "daisy", color: 0xfffbf2, patch: 0 },
    { kind: "daisy", color: 0xffd23e, patch: 1 },
    { kind: "cup", color: 0xe8352c, patch: 2 },
    { kind: "cup", color: 0x6c7cff, patch: 3 },
    { kind: "daisy", color: 0xc98cff, patch: 4 },
    { kind: "cup", color: 0xff8fc2, patch: 5 },
    { kind: "cup", color: 0xffa23a, patch: 6 },
  ];
  const material = windMaterial(world, new THREE.MeshLambertMaterial({
    name: "flowers",
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: 0x222222,
  }), { key: "flowers", tintByPart: true });
  const geometries = { daisy: flowerGeometry("daisy"), cup: flowerGeometry("cup") };
  const count = low ? 380 : 1100;
  const meshes = {
    daisy: new THREE.InstancedMesh(geometries.daisy, material, count),
    cup: new THREE.InstancedMesh(geometries.cup, material, count),
  };
  Object.values(meshes).forEach((mesh) => { mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 40) {
    attempts += 1;
    const x = -0.3 - random() * RX;
    const z = (random() * 2 - 1) * RZ;
    if (!insideIsland(x, z, 0.3) || blocked(x, z, { water: 0.2, path: 0.3, chapel: 0.25 })) continue;
    // Each species blooms in its own drifts.
    const field = noise.fbm2(x * 0.55 + 31, z * 0.55 - 12, 2) * 0.5 + 0.5;
    const specie = species[Math.floor(clamp(noise.n2(x * 0.38 + 90, z * 0.38) * 0.5 + 0.5, 0, 0.999) * species.length)];
    if (random() > smoothstep(0.42, 0.72, field) && random() > 0.12) continue;
    const mesh = meshes[specie.kind];
    const height = 0.2 + random() * 0.3;
    const head = 0.85 + random() * 0.55;
    dummy.position.set(x, terrainHeight(x, z) - 0.01, z);
    dummy.rotation.set((random() - 0.5) * 0.22, random() * Math.PI * 2, (random() - 0.5) * 0.22);
    dummy.scale.set(head, height, head);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count, dummy.matrix);
    color.set(specie.color).offsetHSL((random() - 0.5) * 0.03, 0, (random() - 0.5) * 0.08);
    mesh.setColorAt(mesh.count, color);
    mesh.count += 1;
    placed += 1;
  }
  Object.values(meshes).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    world.scene.add(mesh);
  });
}

// ------------------------------------------------------ rocks & paths ----

function boulderGeometry(seed, { radius = 0.3, flat = 0.6, moss = 0.8, tone = [0.82, 0.78, 0.72] } = {}) {
  const geometry = smoothIcosahedron(1, 2);
  const position = geometry.attributes.position;
  const local = createNoise(seed);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const n = 1 + local.fbm3(x * 1.3, y * 1.3, z * 1.3, 3) * 0.55;
    const squash = y < 0 ? 0.45 : 1;
    position.setXYZ(index, x * n * radius, y * n * radius * flat * squash, z * n * radius * (0.8 + (seed % 7) * 0.05));
  }
  geometry.computeVertexNormals();
  paintVertices(geometry, (color, x, y, z, nx, ny) => {
    const grain = local.n3(x * 9, y * 9, z * 9) * 0.1;
    const mossy = smoothstep(0.25, 0.8, ny + local.n3(x * 5, y * 5, z * 5) * 0.3) * moss;
    color.setRGB(lerp(tone[0] + grain, 0.4, mossy), lerp(tone[1] + grain, 0.55, mossy), lerp(tone[2] + grain, 0.22, mossy));
  });
  return geometry;
}

function buildRocksAndPaths(world) {
  const rock = world.batch("rock");
  const random = rng(53);
  // Pond and stream banks.
  for (let index = 0; index < 34; index += 1) {
    const angle = random() * Math.PI * 2;
    let x = POND.x + Math.cos(angle) * (POND.rx + 0.08 + random() * 0.12);
    let z = POND.z + Math.sin(angle) * (POND.rz + 0.08 + random() * 0.12);
    if (index > 22) {
      z = 2.3 + random() * 2.4;
      x = streamCenter(z) + (random() > 0.5 ? 1 : -1) * (0.46 + random() * 0.1);
    }
    if (pathDistance(SIDE_PATH, x, z) < 0.25 || Math.abs(z - BRIDGE_Z) < 0.35) continue;
    const radius = 0.12 + random() * 0.2;
    rock.add(boulderGeometry(100 + index, { radius, flat: 0.55, moss: 0.9 }), matrixFrom([x, terrainHeight(x, z) - radius * 0.12, z], [0, random() * Math.PI, 0]), null, { worldUV: 1.1 });
  }
  // Big mossy boulders along the Seele rim.
  for (let index = 0; index < (world.quality.low ? 12 : 22); index += 1) {
    const theta = Math.PI * (0.55 + random() * 0.9);
    const factor = rimFactor(theta);
    const inset = 0.25 + random() * 0.45;
    const x = Math.cos(theta) * (RX * factor - inset);
    const z = Math.sin(theta) * (RZ * factor - inset);
    if (blocked(x, z, { water: 0.3, path: 0.35, chapel: 0.3 }) && x < -0.15) continue;
    const radius = 0.2 + random() * 0.38;
    rock.add(boulderGeometry(300 + index, { radius, flat: 0.62, moss: 0.95 }), matrixFrom([x, terrainHeight(x, z) - radius * 0.2, z], [random() * 0.3, random() * Math.PI, 0]), null, { worldUV: 0.9 });
  }
  // Stepping stones.
  const stone = (x, z, seed, size = 1) => {
    const radius = (0.13 + random() * 0.06) * size;
    rock.add(boulderGeometry(seed, { radius, flat: 0.22, moss: 0.25, tone: [0.9, 0.86, 0.8] }), matrixFrom([x, terrainHeight(x, z) + 0.005, z], [0, random() * Math.PI, 0]), null, { worldUV: 1.4 });
  };
  for (const [points, seed, spacing] of [[SEELE_PATH, 700, 0.27], [SIDE_PATH, 760, 0.3]]) {
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) total += Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
    const steps = Math.floor(total / spacing);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      let distance = t * total;
      for (let index = 0; index < points.length - 1; index += 1) {
        const [ax, az] = points[index];
        const [bx, bz] = points[index + 1];
        const length = Math.hypot(bx - ax, bz - az);
        if (distance <= length || index === points.length - 2) {
          const k = clamp(distance / length, 0, 1);
          const side = (step % 2 ? 1 : -1) * 0.07;
          const x = ax + (bx - ax) * k + (-(bz - az) / length) * side;
          const z = az + (bz - az) * k + ((bx - ax) / length) * side;
          if (waterDistance(x, z) > 0.05) stone(x, z, seed + step);
          break;
        }
        distance -= length;
      }
    }
  }
}

// ---------------------------------------------------------------- bridge ----

function buildBridge(world) {
  const wood = world.batch("wood");
  const random = rng(640);
  const cx = streamCenter(BRIDGE_Z);
  const half = 0.92;
  const base = WATER_Y + 0.1;
  const arch = (x) => base + 0.3 * (1 - (x / half) ** 2);
  const plank = new THREE.BoxGeometry(0.11, 0.05, 0.64);
  for (let index = 0; index <= 16; index += 1) {
    const x = -half + (index / 16) * half * 2;
    const slope = Math.atan(-0.6 * x / (half * half));
    const tone = 0.75 + random() * 0.3;
    wood.add(plank, matrixFrom([cx + x, arch(x), BRIDGE_Z], [0, (random() - 0.5) * 0.04, slope]), new THREE.Color(0.62 * tone, 0.45 * tone, 0.3 * tone), { worldUV: 1.6 });
  }
  for (const side of [-1, 1]) {
    const beam = [];
    const rail = [];
    for (let step = 0; step <= 10; step += 1) {
      const x = -half - 0.08 + (step / 10) * (half + 0.08) * 2;
      beam.push(new THREE.Vector3(cx + x, arch(clamp(x, -half, half)) - 0.06, BRIDGE_Z + side * 0.27));
      rail.push(new THREE.Vector3(cx + x * 0.97, arch(clamp(x, -half, half)) + 0.42, BRIDGE_Z + side * 0.3));
    }
    wood.add(taperedTube(beam, 0.04, 0.04, { radial: 5, segments: 20 }), null, 0x5a3c26);
    wood.add(taperedTube(rail, 0.026, 0.026, { radial: 6, segments: 20 }), null, 0x7a5436);
    for (let post = 0; post <= 4; post += 1) {
      const x = -half * 0.97 + (post / 4) * half * 1.94;
      const y0 = arch(x) - 0.08;
      wood.add(new THREE.CylinderGeometry(0.028, 0.034, 0.52, 6), matrixFrom([cx + x * 0.97, y0 + 0.26, BRIDGE_Z + side * 0.3]), 0x5c3e28);
    }
  }
}

// ---------------------------------------------------------------- chapel ----

function arched(width, height) {
  const shape = new THREE.Shape();
  const r = width / 2;
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, height - r);
  shape.absarc(0, height - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const geometry = new THREE.ShapeGeometry(shape, 10);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(index, (position.getX(index) + r) / width, position.getY(index) / height);
  }
  return geometry;
}

function grime(geometry, y0, y1, strength = 0.42) {
  const local = createNoise(9);
  return paintVertices(geometry, (color, x, y, z) => {
    const k = smoothstep(y0, y1, y);
    const n = local.n3(x * 4, y * 4, z * 4) * 0.06;
    color.setScalar(1 - strength * (1 - k) + n);
  });
}

function buildChapel(world) {
  const { materials } = world;
  const stone = world.batch("stone");
  const plaster = world.batch("plaster");
  const wood = world.batch("wood");
  const metal = world.batch("metal");
  const tiles = world.batch("roofTiles");
  const copper = world.batch("copper");
  const glass = world.batch("stainedGlass");
  const glow = world.batch("warmGlow");
  const base = terrainHeight(CHAPEL.x, CHAPEL.z);
  const root = matrixFrom([CHAPEL.x, base, CHAPEL.z], [0, CHAPEL.rotation, 0]);
  const put = (batch, geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, color = null, options = {}) => {
    batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation, scale)), color, options);
  };
  const plasterColor = 0xf1e9da;
  const W = 2.2;
  const D = 3.05;
  const wallBottom = 0.12;
  const wallHeight = 1.48;
  const wallTop = wallBottom + wallHeight;

  // Plinth, walls, apse.
  put(stone, grime(new THREE.BoxGeometry(W + 0.2, 0.26, D + 0.18), 0, 0.2, 0.3), [0, 0.02, 0], [0, 0, 0], 1, 0x9c948a, { worldUV: 0.95 });
  put(stone, grime(new THREE.BoxGeometry(W, wallHeight, D, 1, 4, 1), -0.74, -0.2), [0, wallBottom + wallHeight / 2, 0], [0, 0, 0], 1, null, { worldUV: 0.95 });
  const apse = grime(new THREE.CylinderGeometry(0.86, 0.9, wallHeight - 0.12, 18, 3, true, Math.PI / 2, Math.PI), -0.6, -0.1);
  put(stone, apse, [0, wallBottom + (wallHeight - 0.12) / 2, -D / 2], [0, 0, 0], 1, null, { worldUV: 0.95 });
  put(tiles, new THREE.ConeGeometry(0.99, 0.62, 18, 1, true, Math.PI / 2, Math.PI), [0, wallTop - 0.12 + 0.31, -D / 2], [0, 0, 0], 1, 0xe0b4a6, { worldUV: 1.0 });
  put(plaster, new THREE.CylinderGeometry(0.93, 0.93, 0.08, 18, 1, false, Math.PI / 2, Math.PI), [0, wallTop - 0.12, -D / 2], [0, 0, 0], 1, plasterColor);

  // Buttresses.
  for (const side of [-1, 1]) {
    for (const z of [-0.95, 0.15]) {
      put(stone, grime(new THREE.BoxGeometry(0.2, 0.92, 0.26, 1, 2, 1), -0.46, 0), [side * (W / 2 + 0.09), wallBottom + 0.46, z], [0, 0, 0], 1, 0xd8d0c4, { worldUV: 0.95 });
      put(plaster, new THREE.BoxGeometry(0.24, 0.07, 0.3), [side * (W / 2 + 0.1), wallBottom + 0.95, z], [0, 0, side * 0.35], 1, plasterColor);
    }
  }
  // Quoins at nave corners.
  const quoinA = new THREE.BoxGeometry(0.21, 0.13, 0.12);
  const quoinB = new THREE.BoxGeometry(0.12, 0.13, 0.21);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (sz < 0) continue;
      for (let row = 0; row < 8; row += 1) {
        const y = wallBottom + 0.1 + row * 0.175;
        const long = row % 2 === 0;
        put(plaster, long ? quoinA : quoinB, [sx * (W / 2 - (long ? 0.1 : 0.045)), y, sz * (D / 2 - (long ? 0.045 : 0.1))], [0, 0, 0], 1.02, plasterColor);
      }
    }
  }
  // Eave cornice.
  for (const side of [-1, 1]) put(plaster, new THREE.BoxGeometry(0.1, 0.1, D + 0.12), [side * (W / 2 + 0.02), wallTop - 0.04, 0], [0, 0, 0], 1, plasterColor);

  // Gabled roof with thickness and a tiled ridge.
  const roofHalf = W / 2 + 0.2;
  const rise = 1.05;
  const slopeLength = Math.hypot(roofHalf, rise);
  const slopeAngle = Math.atan2(rise, roofHalf);
  for (const side of [-1, 1]) {
    const slab = new THREE.BoxGeometry(slopeLength, 0.08, D + 0.36, 1, 1, 1);
    const position = slab.attributes.position;
    const uv = slab.attributes.uv;
    for (let index = 0; index < position.count; index += 1) uv.setXY(index, position.getZ(index) * 0.95, position.getX(index) * 0.95);
    put(tiles, slab, [side * roofHalf / 2, wallTop + rise / 2 - 0.02, 0], [0, 0, -side * slopeAngle], 1, 0xffffff);
    // Barge boards along the gables.
    for (const end of [-1, 1]) {
      put(wood, new THREE.BoxGeometry(slopeLength + 0.04, 0.12, 0.05), [side * roofHalf / 2, wallTop + rise / 2 - 0.06, end * (D / 2 + 0.19)], [0, 0, -side * slopeAngle], 1, 0x3a2618);
    }
  }
  put(tiles, new THREE.CylinderGeometry(0.075, 0.075, D + 0.4, 8), [0, wallTop + rise + 0.02, 0], [Math.PI / 2, 0, 0], 1, 0xb78a7c, { worldUV: 1.2 });
  // Stone gable triangles.
  const gable = new THREE.Shape();
  gable.moveTo(-W / 2, 0);
  gable.lineTo(W / 2, 0);
  gable.lineTo(0, rise * (W / 2) / roofHalf + 0.05);
  gable.lineTo(-W / 2, 0);
  const gableGeometry = new THREE.ExtrudeGeometry(gable, { depth: 0.08, bevelEnabled: false });
  put(stone, gableGeometry, [0, wallTop, D / 2 - 0.08], [0, 0, 0], 1, null, { worldUV: 0.95 });
  put(stone, gableGeometry, [0, wallTop, -D / 2], [0, 0, 0], 1, null, { worldUV: 0.95 });

  // Nave windows with plaster surrounds.
  const windowGlass = arched(0.26, 0.58);
  const windowFrame = arched(0.38, 0.7);
  for (const side of [-1, 1]) {
    for (const z of [-0.45, 0.65]) {
      const rotation = [0, side * Math.PI / 2, 0];
      put(plaster, windowFrame, [side * (W / 2 + 0.006), wallBottom + 0.46, z], rotation, 1, plasterColor);
      put(glass, windowGlass, [side * (W / 2 + 0.012), wallBottom + 0.52, z], rotation);
    }
  }
  for (const angle of [-0.7, 0.7]) {
    const x = Math.sin(angle) * 0.9;
    const z = -D / 2 - Math.cos(angle) * 0.9;
    put(plaster, arched(0.3, 0.52), [x, wallBottom + 0.42, z], [0, Math.PI - angle, 0], 1, plasterColor);
    put(glass, arched(0.2, 0.42), [x * 1.007, wallBottom + 0.47, z - Math.cos(angle) * 0.006], [0, Math.PI - angle, 0]);
  }

  // Bell tower with an open belfry and Bavarian onion dome.
  const towerZ = D / 2 - 0.1;
  const towerSize = 1.0;
  const shaftHeight = 2.08;
  const tz = towerZ;
  put(stone, grime(new THREE.BoxGeometry(towerSize, shaftHeight, towerSize, 1, 6, 1), -1.04, -0.6), [0, wallBottom + shaftHeight / 2, tz], [0, 0, 0], 1, null, { worldUV: 0.95 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let row = 0; row < 11; row += 1) {
        const long = row % 2 === 0;
        put(plaster, long ? quoinA : quoinB, [sx * (towerSize / 2 - (long ? 0.1 : 0.045)), wallBottom + 0.1 + row * 0.18, tz + sz * (towerSize / 2 - (long ? 0.045 : 0.1))], [0, 0, 0], 1.02, plasterColor);
      }
    }
  }
  const belfryBase = wallBottom + shaftHeight;
  put(plaster, new THREE.BoxGeometry(towerSize + 0.12, 0.1, towerSize + 0.12), [0, belfryBase + 0.05, tz], [0, 0, 0], 1, plasterColor);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(stone, new THREE.BoxGeometry(0.22, 0.62, 0.22), [sx * 0.37, belfryBase + 0.41, tz + sz * 0.37], [0, 0, 0], 1, 0xe6ddd0, { worldUV: 0.95 });
    }
  }
  for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const torus = new THREE.TorusGeometry(0.26, 0.05, 6, 10, Math.PI);
    const dx = Math.sin(rotation) * 0.45;
    const dz = Math.cos(rotation) * 0.45;
    put(plaster, torus, [dx, belfryBase + 0.46, tz + dz], [0, rotation, 0], 1, plasterColor);
  }
  put(plaster, new THREE.BoxGeometry(towerSize + 0.14, 0.12, towerSize + 0.14), [0, belfryBase + 0.78, tz], [0, 0, 0], 1, plasterColor);
  const bell = new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0.26), new THREE.Vector2(0.08, 0.26), new THREE.Vector2(0.11, 0.2), new THREE.Vector2(0.12, 0.1),
    new THREE.Vector2(0.16, 0.02), new THREE.Vector2(0.18, 0.0), new THREE.Vector2(0.15, 0.0),
  ], 14);
  put(metal, bell, [0, belfryBase + 0.28, tz], [0, 0, 0], 1, 0xb08a4a);
  put(wood, new THREE.BoxGeometry(0.78, 0.07, 0.08), [0, belfryBase + 0.58, tz], [0, 0, 0], 1, 0x3a2618);
  // Onion dome.
  const onion = new THREE.LatheGeometry([
    [0.0, 0.0], [0.5, 0.0], [0.52, 0.06], [0.46, 0.12], [0.54, 0.24], [0.6, 0.38], [0.56, 0.52], [0.42, 0.66],
    [0.24, 0.78], [0.12, 0.88], [0.08, 0.98], [0.13, 1.03], [0.15, 1.1], [0.12, 1.17], [0.05, 1.22], [0.04, 1.3], [0.0, 1.3],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const domeBase = belfryBase + 0.84;
  put(copper, onion, [0, domeBase, tz], [0, 0, 0], 1, 0xffffff);
  put(metal, new THREE.SphereGeometry(0.065, 12, 8), [0, domeBase + 1.36, tz], [0, 0, 0], 1, 0xe2b857);
  put(metal, new THREE.BoxGeometry(0.035, 0.42, 0.035), [0, domeBase + 1.6, tz], [0, 0, 0], 1, 0xe2b857);
  put(metal, new THREE.BoxGeometry(0.22, 0.035, 0.035), [0, domeBase + 1.68, tz], [0, 0, 0], 1, 0xe2b857);
  // Clock faces.
  const clock = new THREE.CircleGeometry(0.19, 24);
  for (const [rotation, dx, dz] of [[0, 0, 0.502], [Math.PI / 2, 0.502, 0], [-Math.PI / 2, -0.502, 0]]) {
    world.batch("clock").add(clock, root.clone().multiply(matrixFrom([dx, wallBottom + 1.72, tz + dz], [0, rotation, 0])));
    put(plaster, new THREE.TorusGeometry(0.2, 0.025, 6, 24), [dx * 1.01, wallBottom + 1.72, tz + dz * 1.01], [0, rotation, 0], 1, 0xe7c46a);
  }
  // Door, portal and steps.
  const front = tz + towerSize / 2;
  const door = arched(0.46, 0.84);
  world.batch("door").add(door, root.clone().multiply(matrixFrom([0, wallBottom + 0.02, front + 0.012])));
  put(plaster, new THREE.TorusGeometry(0.265, 0.06, 6, 14, Math.PI), [0, wallBottom + 0.63, front + 0.02], [0, 0, 0], 1, plasterColor);
  for (const side of [-1, 1]) put(plaster, new THREE.BoxGeometry(0.1, 0.62, 0.08), [side * 0.28, wallBottom + 0.32, front + 0.02], [0, 0, 0], 1, plasterColor);
  put(stone, new THREE.BoxGeometry(0.9, 0.08, 0.36), [0, 0.06, front + 0.18], [0, 0, 0], 1, 0xbdb4a6, { worldUV: 1.2 });
  put(stone, new THREE.BoxGeometry(0.74, 0.08, 0.22), [0, 0.13, front + 0.1], [0, 0, 0], 1, 0xc6bdb0, { worldUV: 1.2 });
  // Oculus above the door.
  put(glass, new THREE.CircleGeometry(0.13, 18), [0, wallBottom + 1.18, front + 0.012]);
  put(plaster, new THREE.TorusGeometry(0.14, 0.035, 6, 20), [0, wallBottom + 1.18, front + 0.018], [0, 0, 0], 1, plasterColor);
  // Wall lantern beside the door.
  put(metal, new THREE.BoxGeometry(0.1, 0.14, 0.1), [0.42, wallBottom + 0.82, front + 0.08], [0, 0, 0], 1, 0x2a221c);
  put(glow, new THREE.BoxGeometry(0.07, 0.1, 0.07), [0.42, wallBottom + 0.8, front + 0.08]);
  // Cross on the rear gable.
  put(metal, new THREE.BoxGeometry(0.04, 0.3, 0.04), [0, wallTop + rise + 0.2, -D / 2 - 0.12], [0, 0, 0], 1, 0x2c2622);
  put(metal, new THREE.BoxGeometry(0.18, 0.04, 0.04), [0, wallTop + rise + 0.25, -D / 2 - 0.12], [0, 0, 0], 1, 0x2c2622);

  // Little churchyard: two iron crosses and a bench.
  for (const [x, z, r] of [[-1.55, -0.9, 0.2], [-1.6, -1.6, -0.15]]) {
    put(metal, new THREE.BoxGeometry(0.035, 0.42, 0.035), [x, 0.21, z], [0, r, 0], 1, 0x26221f);
    put(metal, new THREE.BoxGeometry(0.2, 0.035, 0.035), [x, 0.32, z], [0, r, 0], 1, 0x26221f);
    put(stone, new THREE.BoxGeometry(0.24, 0.05, 0.4), [x, 0.03, z + 0.18], [0, r, 0], 1, 0x8a8278, { worldUV: 1.5 });
  }
  put(wood, new THREE.BoxGeometry(0.62, 0.04, 0.18), [1.5, 0.26, 1.1], [0, -0.2, 0], 1, 0x7a5436);
  for (const dx of [-0.24, 0.24]) put(wood, new THREE.BoxGeometry(0.05, 0.24, 0.16), [1.5 + dx, 0.12, 1.1 + dx * 0.2], [0, -0.2, 0], 1, 0x5a3c26);

  materials.clock = new THREE.MeshStandardMaterial({ name: "clock", map: world.textures.clock, roughness: 0.4, emissive: 0xffffff, emissiveMap: world.textures.clock, emissiveIntensity: 0.08 });
  materials.door = new THREE.MeshStandardMaterial({ name: "door", map: world.textures.door, roughness: 0.75 });
  materials.stainedGlass = new THREE.MeshStandardMaterial({
    name: "stainedGlass",
    map: world.textures.stainedGlass,
    emissive: 0xffffff,
    emissiveMap: world.textures.stainedGlass,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  materials.roofTiles = new THREE.MeshStandardMaterial({ name: "roofTiles", map: world.textures.chapelRoofTiles, vertexColors: true, roughness: 0.82 });
  materials.copper = new THREE.MeshStandardMaterial({ name: "copper", color: 0x6fb09a, roughness: 0.48, metalness: 0.35, vertexColors: true });
  const doorStep = new THREE.Vector3(CHAPEL.x, 0, CHAPEL.z).add(new THREE.Vector3(Math.sin(CHAPEL.rotation), 0, Math.cos(CHAPEL.rotation)).multiplyScalar(front + 0.45));
  world.addLightPool(doorStep.x, terrainHeight(doorStep.x, doorStep.z), doorStep.z, 1.0, new THREE.Color(0.7, 0.4, 0.18));
  world.chapelDoor = new THREE.Vector3(CHAPEL.x, base + 0.9, CHAPEL.z).add(new THREE.Vector3(Math.sin(CHAPEL.rotation), 0, Math.cos(CHAPEL.rotation)).multiplyScalar(front + 0.5));
}

// ----------------------------------------------------------------- palms ----

function buildPalm(world, [x, z, scale, seed]) {
  const random = rng(seed);
  const roots = world.batch("roots");
  const foliage = world.batch("foliage");
  const paint = world.batch("paint");
  const base = new THREE.Vector3(x, terrainHeight(x, z) - 0.05, z);
  const height = 3.1 * scale;
  const leanAngle = random() * Math.PI * 2;
  const lean = new THREE.Vector3(Math.cos(leanAngle), 0, Math.sin(leanAngle)).multiplyScalar((0.35 + random() * 0.5) * scale);
  const points = [];
  for (let step = 0; step <= 6; step += 1) {
    const t = step / 6;
    points.push(base.clone().addScaledVector(lean, t * t).add(new THREE.Vector3(0, height * t, 0)));
  }
  const trunk = taperedTube(points, 0, 0, {
    radial: 10,
    segments: 44,
    uvScale: [2, 2.4],
    radiusFn: (t) => (0.13 * (1 - 0.38 * t) + 0.09 * smoothstep(0.1, 0, t)) * scale * (1 + 0.1 * Math.abs(Math.sin(t * height * 11))),
  });
  paintVertices(trunk, (color, px, py) => {
    const ringShade = 0.78 + 0.22 * Math.abs(Math.sin((py - base.y) * 11 / scale * scale));
    color.setRGB(1.25 * ringShade, 1.12 * ringShade, 0.98 * ringShade);
  });
  roots.add(trunk);
  const crown = points[points.length - 1];
  // Coconuts.
  for (let nut = 0; nut < 4; nut += 1) {
    const angle = random() * Math.PI * 2;
    paint.add(new THREE.SphereGeometry(0.075 * scale, 8, 6), matrixFrom([crown.x + Math.cos(angle) * 0.1 * scale, crown.y - 0.1 * scale, crown.z + Math.sin(angle) * 0.1 * scale]), 0x5b4a26);
  }
  const frondCount = 16;
  for (let frond = 0; frond < frondCount; frond += 1) {
    const dead = frond >= frondCount - 3;
    const angle = (frond / frondCount) * Math.PI * 2 + random() * 0.4;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const length = (dead ? 1.0 : 1.35 + random() * 0.45) * scale;
    const elevation = dead ? -1.2 : 0.75 - random() * 0.8;
    const droop = dead ? 0.2 : 0.85 + random() * 0.45;
    const side = new THREE.Vector3().crossVectors(UP, direction).normalize();
    const spine = [];
    const steps = 22;
    for (let step = 0; step <= steps; step += 1) {
      const s = step / steps;
      spine.push(crown.clone()
        .addScaledVector(direction, length * s * (dead ? 0.35 : 1))
        .add(new THREE.Vector3(0, length * (elevation * s - droop * s * s), 0)));
    }
    const positions = [];
    const colors = [];
    const baseColor = dead ? [0.42, 0.3, 0.16] : [0.2, 0.36, 0.12];
    const tipColor = dead ? [0.55, 0.42, 0.24] : [0.42, 0.56, 0.18];
    const vertex = (p, c) => {
      positions.push(p.x, p.y, p.z);
      colors.push(...c);
    };
    for (let step = 1; step < steps; step += 1) {
      const s = step / steps;
      const p = spine[step];
      const tangent = spine[step + 1].clone().sub(spine[step - 1]).normalize();
      const localSide = new THREE.Vector3().crossVectors(tangent, UP).normalize();
      const leafletLength = length * 0.32 * Math.pow(Math.sin(Math.PI * (0.08 + 0.86 * s)), 0.7);
      const shade = 0.85 + random() * 0.3;
      const c = [lerp(baseColor[0], tipColor[0], s) * shade, lerp(baseColor[1], tipColor[1], s) * shade, lerp(baseColor[2], tipColor[2], s) * shade];
      const tipShade = [c[0] * 1.2, c[1] * 1.15, c[2] * 1.1];
      for (const hand of [-1, 1]) {
        const reach = localSide.clone().multiplyScalar(hand * 0.95).addScaledVector(tangent, 0.32).add(new THREE.Vector3(0, 0.12 - s * 0.25, 0)).normalize();
        const mid = p.clone().addScaledVector(reach, leafletLength * 0.5);
        mid.y -= leafletLength * 0.08;
        const tip = p.clone().addScaledVector(reach, leafletLength);
        tip.y -= leafletLength * 0.28;
        const width = tangent.clone().multiplyScalar(0.022 * scale);
        const a = p.clone().sub(width);
        const b = p.clone().add(width);
        const m1 = mid.clone().sub(width);
        const m2 = mid.clone().add(width);
        vertex(a, c); vertex(m1, c); vertex(b, c);
        vertex(b, c); vertex(m1, c); vertex(m2, c);
        vertex(m1, c); vertex(tip, tipShade); vertex(m2, c);
      }
    }
    const leaflets = new THREE.BufferGeometry();
    leaflets.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    leaflets.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    leaflets.computeVertexNormals();
    foliage.add(leaflets);
    const rachis = taperedTube(spine, 0.022 * scale, 0.006 * scale, { radial: 4, segments: 16 });
    foliage.add(rachis, null, dead ? 0x5a4428 : 0x4a5a26);
    side.set(0, 0, 0);
  }
}

function buildBanana(world, [x, z], seed) {
  const random = rng(seed);
  const foliage = world.batch("foliage");
  const y = terrainHeight(x, z) - 0.03;
  const stemHeight = 0.7 + random() * 0.35;
  foliage.add(taperedTube([[x, y, z], [x + 0.02, y + stemHeight * 0.5, z], [x + 0.03, y + stemHeight, z + 0.02]], 0.075, 0.05, { radial: 7, segments: 6 }), null, 0x5e7a34);
  const leaves = 7 + Math.floor(random() * 3);
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const angle = (leaf / leaves) * Math.PI * 2 + random() * 0.5;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const length = 0.9 + random() * 0.55;
    const rise = 0.9 + random() * 0.5;
    const droop = 1.1 + random() * 0.6;
    const origin = new THREE.Vector3(x + 0.03, y + stemHeight - 0.05 - random() * 0.2, z + 0.02);
    const segments = 12;
    const positions = [];
    const colors = [];
    const indices = [];
    const side = new THREE.Vector3().crossVectors(UP, direction).normalize();
    const hue = random();
    const torn = new Set(Array.from({ length: 3 }, () => 2 + Math.floor(random() * (segments - 3))));
    for (let step = 0; step <= segments; step += 1) {
      const s = step / segments;
      const center = origin.clone().addScaledVector(direction, length * s).add(new THREE.Vector3(0, length * (rise * s - droop * s * s) * 0.75, 0));
      const width = 0.24 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05 + 0.02)), 0.6) * (step < 2 ? s * 4 : 1);
      const fold = width * 0.35;
      const left = center.clone().addScaledVector(side, -width).add(new THREE.Vector3(0, -fold, 0));
      const right = center.clone().addScaledVector(side, width).add(new THREE.Vector3(0, -fold, 0));
      positions.push(left.x, left.y, left.z, center.x, center.y, center.z, right.x, right.y, right.z);
      const g = 0.4 + hue * 0.1;
      const brown = s > 0.8 && hue > 0.7 ? 0.5 : 0;
      colors.push(0.12 + brown * 0.3, g - 0.12 - brown * 0.1, 0.05, 0.3, 0.44, 0.12, 0.12 + brown * 0.3, g - 0.12 - brown * 0.1, 0.05);
      if (step < segments) {
        const a = step * 3;
        const b = a + 3;
        if (!torn.has(step)) indices.push(a, b, a + 1, a + 1, b, b + 1);
        indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    foliage.add(geometry);
  }
}

// ------------------------------------------------------------- understory ----

function buildBushes(world) {
  const texture = world.textures.tropicalLeaf;
  if (!texture) return;
  const random = rng(625);
  const centers = [];
  const candidates = [
    [-2.1, -3.7, 1.1], [-4.6, -0.75, 0.9], [-2.05, -1.05, 0.8], [-5.9, -3.9, 1.1], [-7.35, 0.1, 0.9], [-3.1, 1.05, 0.7],
    [-6.0, 2.6, 0.9], [-0.7, -3.1, 0.8], [-1.2, 1.9, 0.6], [-4.35, -3.95, 1.0], [-7.4, 2.2, 0.8], [-5.8, -1.8, 0.8],
    [-0.6, 3.9, 0.7], [-3.6, 4.7, 0.6], [-6.6, -0.95, 0.7],
  ];
  for (const [x, z, s] of candidates) if (insideIsland(x, z, 0.2) && waterDistance(x, z) > 0.2) centers.push([x, z, s]);
  const perBush = world.quality.low ? 26 : 52;
  const geometry = new THREE.PlaneGeometry(0.2, 0.5, 1, 3);
  geometry.translate(0, 0.25, 0);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    position.setZ(index, Math.sin((y / 0.5) * Math.PI) * 0.03 + (y / 0.5) ** 2 * 0.06);
  }
  geometry.computeVertexNormals();
  const material = softFoliage(new THREE.MeshLambertMaterial({
    name: "bushLeaves",
    map: texture,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
  }), { time: world.uniforms.time, upWeight: 0.55, wind: 0.01, translucency: 0.1, key: "bushLeaves" });
  const mesh = new THREE.InstancedMesh(geometry, material, centers.length * perBush);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (const [x, z, s] of centers) {
    const ground = terrainHeight(x, z);
    for (let leaf = 0; leaf < perBush; leaf += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.28 * s;
      dummy.position.set(x + Math.cos(angle) * radius, ground + random() * 0.18 * s, z + Math.sin(angle) * radius);
      dummy.rotation.set(0, 0, 0);
      dummy.rotateY(-angle + Math.PI / 2);
      dummy.rotateX(0.25 + random() * 1.05);
      dummy.rotateZ((random() - 0.5) * 0.6);
      dummy.scale.setScalar((0.8 + random() * 0.7) * s);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setHSL(0.24 + random() * 0.06, 0.35 + random() * 0.25, 0.62 + random() * 0.3);
      mesh.setColorAt(index, color);
      index += 1;
    }
  }
  mesh.count = index;
  mesh.castShadow = !world.quality.low;
  mesh.receiveShadow = true;
  mesh.name = "bushes";
  world.scene.add(mesh);
}

function buildReedsAndLilies(world) {
  const foliage = world.batch("foliage");
  const paint = world.batch("paint");
  const random = rng(912);
  const blade = new THREE.PlaneGeometry(0.03, 1, 1, 3);
  blade.translate(0, 0.5, 0);
  const position = blade.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    position.setX(index, position.getX(index) * (1 - y * 0.85));
    position.setZ(index, y * y * 0.12);
  }
  blade.computeVertexNormals();
  paintVertices(blade, (color, x, y) => color.setRGB(lerp(0.2, 0.5, y), lerp(0.32, 0.62, y), lerp(0.12, 0.22, y)));
  const clumps = world.quality.low ? 10 : 20;
  for (let clump = 0; clump < clumps; clump += 1) {
    const angle = random() * Math.PI * 2;
    let x = POND.x + Math.cos(angle) * (POND.rx - 0.05);
    let z = POND.z + Math.sin(angle) * (POND.rz - 0.05);
    if (clump % 4 === 3) {
      z = 2.4 + random() * 2.1;
      x = streamCenter(z) + (random() > 0.5 ? 1 : -1) * 0.36;
    }
    if (pathDistance(SIDE_PATH, x, z) < 0.35 || Math.abs(z - BRIDGE_Z) < 0.4) continue;
    const ground = Math.max(terrainHeight(x, z), WATER_Y - 0.08);
    for (let item = 0; item < 9; item += 1) {
      const px = x + (random() - 0.5) * 0.24;
      const pz = z + (random() - 0.5) * 0.24;
      const height = 0.45 + random() * 0.5;
      foliage.add(blade, matrixFrom([px, ground - 0.03, pz], [(random() - 0.5) * 0.3, random() * Math.PI * 2, (random() - 0.5) * 0.3], [1, height, 1]));
      if (item < 2) {
        const top = ground + height * 0.9;
        paint.add(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), matrixFrom([px, top, pz]), 0x5a3a1c);
        foliage.add(new THREE.CylinderGeometry(0.004, 0.004, height, 3), matrixFrom([px, ground + height / 2, pz]), 0x4a6a2a);
      }
    }
  }
  // Water lilies.
  for (let pad = 0; pad < 16; pad += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 0.25 + Math.sqrt(random()) * 0.7;
    const x = POND.x + Math.cos(angle) * radius * POND.rx * 0.9;
    const z = POND.z + Math.sin(angle) * radius * POND.rz * 0.9;
    const size = 0.09 + random() * 0.09;
    const leaf = new THREE.CircleGeometry(size, 16, 0.2, Math.PI * 2 - 0.4);
    leaf.rotateX(-Math.PI / 2);
    foliage.add(leaf, matrixFrom([x, WATER_Y + 0.006, z], [0, random() * Math.PI * 2, 0]), new THREE.Color().setHSL(0.26 + random() * 0.05, 0.5, 0.3 + random() * 0.1));
    if (pad % 4 === 0) {
      for (let petal = 0; petal < 8; petal += 1) {
        const petalGeometry = new THREE.SphereGeometry(0.035, 6, 4);
        petalGeometry.scale(0.5, 0.35, 1);
        petalGeometry.translate(0, 0.012, 0.03);
        petalGeometry.rotateX(-0.5);
        petalGeometry.rotateY((petal / 8) * Math.PI * 2);
        paint.add(petalGeometry, matrixFrom([x + 0.02, WATER_Y + 0.015, z]), random() > 0.5 ? 0xfff2f6 : 0xffb3cf);
      }
      paint.add(new THREE.SphereGeometry(0.014, 6, 4), matrixFrom([x + 0.02, WATER_Y + 0.035, z]), 0xffd24a);
    }
  }
}

function buildKoi(world) {
  const profile = [[0, 0], [0.018, 0.02], [0.032, 0.06], [0.04, 0.12], [0.034, 0.18], [0.02, 0.24], [0.008, 0.28], [0, 0.3]];
  const body = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 8);
  body.rotateZ(-Math.PI / 2);
  body.scale(1, 0.62, 1);
  body.translate(-0.14, 0, 0);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute([0.13, 0, 0, 0.22, 0.012, 0.055, 0.22, 0.012, -0.055], 3));
  tail.computeVertexNormals();
  const fish = new THREE.BufferGeometry();
  const merged = [body.toNonIndexed(), tail];
  const positions = [];
  const normals = [];
  for (const part of merged) {
    positions.push(...part.attributes.position.array);
    normals.push(...part.attributes.normal.array);
  }
  fish.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  fish.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  const material = new THREE.MeshStandardMaterial({ name: "koi", roughness: 0.35, side: THREE.DoubleSide });
  const count = 7;
  const mesh = new THREE.InstancedMesh(fish, material, count);
  const palette = [0xff6a1f, 0xfff4ea, 0xffb21f, 0xe23a1a, 0xfff4ea, 0xff8a3c, 0x1c1c1c];
  const color = new THREE.Color();
  const fishState = palette.map((hex, index) => {
    mesh.setColorAt(index, color.set(hex));
    return { radius: 0.35 + index * 0.08, speed: (0.18 + (index % 3) * 0.05) * (index % 2 ? 1 : -1), phase: index * 1.3, depth: 0.06 + (index % 3) * 0.03 };
  });
  mesh.frustumCulled = false;
  mesh.name = "koi";
  world.scene.add(mesh);
  const dummy = new THREE.Object3D();
  world.updates.push((elapsed) => {
    fishState.forEach((state, index) => {
      const angle = state.phase + elapsed * state.speed;
      const wobble = Math.sin(elapsed * 0.7 + state.phase) * 0.12;
      dummy.position.set(
        POND.x + Math.cos(angle) * (state.radius + wobble) * 1.55,
        WATER_Y - state.depth,
        POND.z + Math.sin(angle) * (state.radius + wobble) * 0.82,
      );
      const direction = Math.sign(state.speed);
      const vx = -Math.sin(angle) * 1.55 * direction;
      const vz = Math.cos(angle) * 0.82 * direction;
      dummy.rotation.set(0, Math.atan2(vz, -vx) + Math.sin(elapsed * 6 + index) * 0.16, 0);
      dummy.scale.setScalar(0.9 + (index % 3) * 0.15);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ------------------------------------------------------ grotto & cross ----

function buildGrotto(world) {
  const rock = world.batch("rock");
  const plaster = world.batch("plaster");
  const paint = world.batch("paint");
  const glow = world.batch("warmGlow");
  const base = terrainHeight(GROTTO.x, GROTTO.z);
  const root = matrixFrom([GROTTO.x, base, GROTTO.z], [0, GROTTO.rotation, 0]);
  const put = (batch, geometry, position, rotation = [0, 0, 0], scale = 1, color = null, options = {}) => {
    batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation, scale)), color, options);
  };
  const random = rng(1858);
  // Rough arch of boulders.
  for (let index = 0; index < 17; index += 1) {
    const t = index / 16;
    const angle = Math.PI * t;
    const radius = 0.26 + random() * 0.16;
    const x = Math.cos(angle) * 0.72;
    const y = Math.sin(angle) * 1.05 + 0.1;
    put(rock, boulderGeometry(1900 + index, { radius, flat: 0.9, moss: 0.7, tone: [0.74, 0.7, 0.64] }), [x, y, -0.1 + random() * 0.12], [random(), random(), random()], 1, null, { worldUV: 1.1 });
  }
  put(rock, boulderGeometry(1950, { radius: 0.62, flat: 0.95, moss: 0.4, tone: [0.5, 0.47, 0.44] }), [0, 0.58, -0.42], [0, 0, 0], [1.1, 1, 0.6], null, { worldUV: 1.1 });
  // Madonna in the niche.
  const robe = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.085, 0.1], [0.07, 0.22], [0.055, 0.3], [0.045, 0.34], [0, 0.35]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  put(plaster, robe, [0, 0.62, -0.05], [0, 0, 0], 1, 0xf6f3ee);
  put(plaster, new THREE.SphereGeometry(0.04, 10, 8), [0, 1.0, -0.05], [0, 0, 0], 1, 0xf4e6d8);
  put(paint, new THREE.TorusGeometry(0.065, 0.012, 6, 14), [0, 0.82, -0.05], [Math.PI / 2, 0, 0], 1, 0x3c6fd0);
  put(paint, new THREE.SphereGeometry(0.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), [0, 1.0, -0.06], [0.2, 0, 0], [1, 1.2, 1], 0xffffff);
  put(glow, new THREE.TorusGeometry(0.07, 0.006, 4, 20), [0, 1.02, -0.1], [0, 0, 0], 1, 0xffd780);
  put(rock, boulderGeometry(1960, { radius: 0.16, flat: 1.4, moss: 0.2, tone: [0.7, 0.66, 0.6] }), [0, 0.5, -0.05], [0, 0, 0], [1, 0.8, 1], null, { worldUV: 1.2 });
  // Candle stand.
  put(world.batch("metal"), new THREE.BoxGeometry(0.62, 0.04, 0.16), [0, 0.26, 0.55], [0, 0, 0], 1, 0x2a241f);
  for (const dx of [-0.26, 0.26]) put(world.batch("metal"), new THREE.BoxGeometry(0.03, 0.26, 0.03), [dx, 0.13, 0.55], [0, 0, 0], 1, 0x2a241f);
  for (let candle = 0; candle < 9; candle += 1) {
    const x = -0.26 + (candle / 8) * 0.52;
    const z = 0.52 + (candle % 2) * 0.06;
    const height = 0.05 + random() * 0.06;
    put(plaster, new THREE.CylinderGeometry(0.014, 0.014, height, 6), [x, 0.28 + height / 2, z], [0, 0, 0], 1, candle % 3 ? 0xf8f1e2 : 0xd83c3c);
    put(glow, new THREE.ConeGeometry(0.009, 0.03, 5), [x, 0.3 + height + 0.012, z]);
  }
  world.grottoLight = new THREE.Vector3().setFromMatrixPosition(root.clone().multiply(matrixFrom([0, 0.5, 0.5])));
  world.addLightPool(world.grottoLight.x, terrainHeight(world.grottoLight.x, world.grottoLight.z), world.grottoLight.z, 0.8, new THREE.Color(0.7, 0.38, 0.15));
}

function buildWaysideCross(world) {
  const [x, z] = WAYSIDE_CROSS;
  const base = terrainHeight(x, z);
  const wood = world.batch("wood");
  const tiles = world.batch("roofTiles");
  const plaster = world.batch("plaster");
  const root = matrixFrom([x, base, z], [0, -0.35, 0]);
  const put = (batch, geometry, position, rotation = [0, 0, 0], scale = 1, color = null, options = {}) => {
    batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation, scale)), color, options);
  };
  put(wood, new THREE.BoxGeometry(0.08, 1.35, 0.08), [0, 0.67, 0], [0, 0, 0], 1, 0x5a3a24);
  put(wood, new THREE.BoxGeometry(0.62, 0.07, 0.07), [0, 1.05, 0], [0, 0, 0], 1, 0x5a3a24);
  // Corpus.
  put(plaster, new THREE.CylinderGeometry(0.025, 0.018, 0.26, 6), [0, 0.96, 0.05], [0, 0, 0], 1, 0xe9dccb);
  put(plaster, new THREE.BoxGeometry(0.4, 0.022, 0.022), [0, 1.06, 0.05], [0, 0, 0], 1, 0xe9dccb);
  put(plaster, new THREE.SphereGeometry(0.026, 8, 6), [0, 1.11, 0.055], [0, 0, 0], 1, 0xe9dccb);
  // Little gable roof.
  for (const side of [-1, 1]) {
    const slab = new THREE.BoxGeometry(0.3, 0.025, 0.24);
    const uv = slab.attributes.uv;
    const position = slab.attributes.position;
    for (let index = 0; index < position.count; index += 1) uv.setXY(index, position.getZ(index) * 1.4, position.getX(index) * 1.4);
    put(tiles, slab, [side * 0.12, 1.38, 0.02], [0, 0, -side * 0.72], 1, 0xffffff);
  }
  put(world.batch("paint"), new THREE.CylinderGeometry(0.06, 0.045, 0.1, 8), [0, 0.05, 0.16], [0, 0, 0], 1, 0x9b4a2c);
}

// ---------------------------------------------------- birds & butterflies ----

function buildFlyers(world) {
  const flap = (key) => patchMaterial(new THREE.MeshLambertMaterial({ name: key, side: THREE.DoubleSide, emissive: key === "butterflies" ? 0x331a00 : 0x000000 }), {
    key,
    uniforms: { uTime: world.uniforms.time },
    vertexHead: "uniform float uTime;",
    vertex: [["begin_vertex", `$&
      #ifdef USE_INSTANCING
        float seed = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
      #else
        float seed = 0.0;
      #endif
      float beat = sin(uTime * ${key === "butterflies" ? "15.0" : "8.0"} + seed) * ${key === "butterflies" ? "1.0" : "0.7"};
      float wing = abs(position.x);
      transformed.y += wing * beat * ${key === "butterflies" ? "1.1" : "0.85"};
      transformed.x *= 1.0 - abs(beat) * ${key === "butterflies" ? "0.35" : "0.12"};`]],
  });

  const butterflyGeometry = new THREE.BufferGeometry();
  butterflyGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.02, 0.07, 0, 0.05, 0.06, 0, -0.01, 0, 0, 0.02, -0.06, 0, -0.01, -0.07, 0, 0.05,
    0, 0, -0.005, 0.05, 0, -0.01, 0.035, 0, -0.06, 0, 0, -0.005, -0.035, 0, -0.06, -0.05, 0, -0.01,
  ], 3));
  butterflyGeometry.computeVertexNormals();
  const butterflies = new THREE.InstancedMesh(butterflyGeometry, flap("butterflies"), world.quality.low ? 6 : 12);
  const butterflyColors = [0xff9a1f, 0xffffff, 0x4aa8ff, 0xffe14a, 0xff6ab0, 0xb98cff];
  const color = new THREE.Color();
  for (let index = 0; index < butterflies.count; index += 1) butterflies.setColorAt(index, color.set(butterflyColors[index % butterflyColors.length]));
  butterflies.frustumCulled = false;
  world.scene.add(butterflies);

  const birdGeometry = new THREE.BufferGeometry();
  birdGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.09, 0.02, 0, -0.06, -0.02, 0, -0.06,
    0, 0, 0.03, 0.2, 0.02, -0.04, 0, 0, -0.03,
    0, 0, 0.03, 0, 0, -0.03, -0.2, 0.02, -0.04,
    0, 0, -0.05, 0.05, 0, -0.14, -0.05, 0, -0.14,
  ], 3));
  birdGeometry.computeVertexNormals();
  const birds = new THREE.InstancedMesh(birdGeometry, flap("birds"), world.quality.low ? 5 : 9);
  for (let index = 0; index < birds.count; index += 1) birds.setColorAt(index, color.set(0x1d1b22));
  birds.frustumCulled = false;
  world.scene.add(birds);

  const dummy = new THREE.Object3D();
  const random = rng(77);
  const butterflyPaths = Array.from({ length: butterflies.count }, () => ({
    x: -1.2 - random() * 5.8, z: -3.5 + random() * 7, rx: 0.4 + random() * 0.8, rz: 0.3 + random() * 0.7, speed: 0.25 + random() * 0.35, phase: random() * 10,
  }));
  const birdPaths = Array.from({ length: birds.count }, (_, index) => ({
    radius: 4.2 + random() * 3.2, height: 5.2 + random() * 2.2, speed: 0.22 + random() * 0.12, phase: index * 0.55 + random() * 0.4,
  }));
  world.updates.push((elapsed, delta, side) => {
    const dayVisible = side < 0.85;
    butterflies.visible = dayVisible;
    birds.visible = side < 0.92;
    if (dayVisible) {
      butterflyPaths.forEach((path, index) => {
        const t = elapsed * path.speed + path.phase;
        const x = path.x + Math.sin(t) * path.rx + Math.sin(t * 2.3) * 0.12;
        const z = path.z + Math.cos(t * 0.8) * path.rz;
        const vx = Math.cos(t) * path.rx;
        const vz = -Math.sin(t * 0.8) * path.rz;
        dummy.position.set(x, terrainHeight(Math.min(x, -0.2), z) + 0.55 + Math.sin(t * 3.1) * 0.18, z);
        dummy.rotation.set(0, Math.atan2(vx, vz), 0);
        dummy.scale.setScalar(1.1);
        dummy.updateMatrix();
        butterflies.setMatrixAt(index, dummy.matrix);
      });
      butterflies.instanceMatrix.needsUpdate = true;
    }
    birdPaths.forEach((path, index) => {
      const angle = elapsed * path.speed + path.phase;
      dummy.position.set(-3.6 + Math.cos(angle) * path.radius, path.height + Math.sin(angle * 2.1) * 0.3, Math.sin(angle) * path.radius * 0.75);
      dummy.rotation.set(0, Math.atan2(-Math.sin(angle), Math.cos(angle) * 0.75), Math.sin(angle * 1.3) * 0.25);
      dummy.scale.setScalar(1.3);
      dummy.updateMatrix();
      birds.setMatrixAt(index, dummy.matrix);
    });
    birds.instanceMatrix.needsUpdate = true;
  });
}

// ------------------------------------------------------ jungle & ferns ----

function buildFallbackTrees(world) {
  const roots = world.batch("fallbackBark", world.materials.roots, { castShadow: !world.quality.low });
  const leaves = world.batch("fallbackLeaves", world.materials.foliage, { castShadow: !world.quality.low });
  const leaf = smoothIcosahedron(0.42, 1);
  JUNGLE_TREES.forEach(([x, z, scale], index) => {
    const random = rng(61 + index * 17);
    const ground = terrainHeight(x, z);
    const top = new THREE.Vector3(x + (random() - 0.5) * 0.3, ground + 2.4 * scale, z);
    roots.add(taperedTube([[x, ground - 0.1, z], [x, ground + 1.2 * scale, z], top], 0.16 * scale, 0.08 * scale, { radial: 8 }), null, 0xa89078);
    for (let cluster = 0; cluster < 14; cluster += 1) {
      const angle = random() * Math.PI * 2;
      leaves.add(leaf, matrixFrom([top.x + Math.cos(angle) * random() * 1.1 * scale, top.y + (random() - 0.2) * 0.8 * scale, top.z + Math.sin(angle) * random() * 1.1 * scale], [random(), random(), random()], 0.8 + random() * 0.6), new THREE.Color().setHSL(0.26 + random() * 0.06, 0.45, 0.28 + random() * 0.12));
    }
  });
  world.fallbackTreeBatches = [roots, leaves];
}

function buildTreeRoots(world) {
  const roots = world.batch("roots");
  JUNGLE_TREES.forEach(([x, z, scale], index) => {
    const random = rng(900 + index);
    const ground = terrainHeight(x, z);
    const count = 5 + Math.floor(random() * 3);
    for (let root = 0; root < count; root += 1) {
      const angle = (root / count) * Math.PI * 2 + random() * 0.5;
      const reach = (0.45 + random() * 0.4) * scale;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const end = [x + dx * reach, terrainHeight(x + dx * reach, z + dz * reach) - 0.06, z + dz * reach];
      roots.add(taperedTube([
        [x + dx * 0.05, ground + 0.45 * scale, z + dz * 0.05],
        [x + dx * reach * 0.35, ground + 0.12 * scale, z + dz * reach * 0.35],
        end,
      ], 0.075 * scale, 0.012, { radial: 5, segments: 10, radiusFn: (t) => lerp(0.09, 0.012, t) * scale * (1 + 0.6 * (1 - t) * (1 - t)) }), null, 0xb89c80);
    }
  });
}

export function loadDetailedPlants(world, onSettled) {
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/");
  draco.setDecoderConfig({ type: "wasm" });
  let pending = 2;
  const settle = () => {
    pending -= 1;
    if (pending === 0) {
      draco.dispose();
      onSettled?.();
    }
  };

  const fernLoader = new GLTFLoader();
  fernLoader.setDRACOLoader(draco);
  fernLoader.load("/shared/hub/models/fern_02/fern_02_draco.glb", (gltf) => {
    const random = rng(923);
    const placements = [];
    let attempts = 0;
    const target = world.quality.low ? 22 : 64;
    while (placements.length < target && attempts < 4000) {
      attempts += 1;
      const x = -0.6 - random() * 7.2;
      const z = (random() * 2 - 1) * RZ;
      if (!insideIsland(x, z, 0.45) || blocked(x, z, { water: 0.35, path: 0.4, chapel: 0.35 })) continue;
      const shade = JUNGLE_TREES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 1.7) || rimDistance(x, z) < 1.0;
      if (!shade && random() > 0.18) continue;
      placements.push(matrixFrom([x, terrainHeight(x, z) - 0.02, z], [0, random() * Math.PI * 2, 0], 0.32 + random() * 0.4));
    }
    // The model holds four fern variants side by side; each spot gets one of them.
    gltf.scene.updateMatrixWorld(true);
    const variants = [];
    gltf.scene.traverse((child) => { if (child.isMesh) variants.push(child); });
    const offset = new THREE.Matrix4();
    variants.forEach((child, variantIndex) => {
      const mine = placements.filter((_, index) => index % variants.length === variantIndex);
      if (!mine.length) return;
      child.material.side = THREE.DoubleSide;
      child.material.alphaTest = Math.max(child.material.alphaTest || 0, 0.3);
      const instanced = new THREE.InstancedMesh(child.geometry, child.material, mine.length);
      offset.copy(child.matrixWorld).setPosition(0, 0, 0);
      mine.forEach((matrix, index) => instanced.setMatrixAt(index, matrix.clone().multiply(offset)));
      instanced.castShadow = !world.quality.low;
      instanced.receiveShadow = true;
      instanced.name = "ferns";
      world.scene.add(instanced);
    });
    settle();
  }, undefined, settle);

  const treeLoader = new GLTFLoader();
  treeLoader.setDRACOLoader(draco);
  Promise.all([
    treeLoader.loadAsync("/shared/hub/models/polyhaven/pachira_aquatica_01/pachira_aquatica_01_draco.glb"),
    new Promise((resolve) => new THREE.TextureLoader().load(
      "/shared/hub/models/polyhaven/pachira_aquatica_01/textures/pachira_aquatica_01_leaves_alpha_1k.webp",
      resolve,
      undefined,
      () => resolve(null),
    )),
  ]).then(([treeModel, treeAlpha]) => {
    document.body.dataset.detailedPlants = "ready";
    const variants = [0, 1, 2, 3].map((index) => {
      const variant = new THREE.Group();
      variant.add(treeModel.scene.children[index].clone(true));
      variant.add(treeModel.scene.children[index + 4].clone(true));
      variant.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = !world.quality.low;
        child.receiveShadow = true;
        child.material.side = THREE.DoubleSide;
        if (treeAlpha && child.name.includes("leaves")) {
          child.material.alphaMap = treeAlpha;
          child.material.alphaTest = 0.34;
          child.material.transparent = false;
          child.material.needsUpdate = true;
        }
      });
      return variant;
    });
    JUNGLE_TREES.forEach(([x, z, scale], index) => {
      const clone = variants[index % variants.length].clone(true);
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const height = 3.4 + scale * 1.25;
      const factor = height / Math.max(size.y, 0.001);
      clone.scale.setScalar(factor);
      clone.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor);
      const holder = new THREE.Group();
      holder.add(clone);
      holder.position.set(x, terrainHeight(x, z) - 0.04, z);
      holder.rotation.y = index * 1.37;
      world.scene.add(holder);
    });
    for (const batch of world.fallbackTreeBatches || []) if (batch.meshObject) batch.meshObject.visible = false;
    settle();
  }).catch((error) => {
    document.body.dataset.detailedPlants = "failed";
    console.error("Detailed diorama plants failed to load", error);
    settle();
  });
}

export function buildSeele(world) {
  buildGrass(world);
  buildFlowers(world);
  buildRocksAndPaths(world);
  buildBridge(world);
  buildChapel(world);
  PALMS.forEach((palm) => buildPalm(world, palm));
  BANANAS.forEach((banana, index) => buildBanana(world, banana, 1200 + index * 7));
  buildBushes(world);
  buildReedsAndLilies(world);
  buildKoi(world);
  buildGrotto(world);
  buildWaysideCross(world);
  buildFlyers(world);
  buildFallbackTrees(world);
  buildTreeRoots(world);
}

