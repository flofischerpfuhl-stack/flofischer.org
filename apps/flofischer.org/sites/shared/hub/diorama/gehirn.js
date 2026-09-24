import * as THREE from "three";
import { GLSL_NOISE, lerp, matrixFrom, patchMaterial, rng, taperedTube } from "./utils.js";
import { softFoliage } from "./materials.js";
import {
  GEHIRN_SIGN, PAGODA, POLES, ROAD, RZ, SAKURA, TOP, TORII_PATH, TOWERS, VENDING, insideIsland, samplePath,
} from "./layout.js";

const LACQUER = 0xa3221c;

/**
 * Pyramidal hip roof whose eaves sweep up at the corners (Japanese style).
 * `rise` is the apex height, `lift` the corner upsweep.
 */
function hipRoof(half, rise, lift, thickness = 0.07, { segA = 12, segB = 8, uvScale = 1.6 } = {}) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const cols = segA + 1;
  const sample = (a, b, face, under) => {
    const corner = Math.pow(Math.abs(a), 4) * Math.pow(b, 3);
    let px = a * b * half + Math.sign(a) * corner * lift * 0.3;
    let pz = b * half + corner * lift * 0.3;
    let y = rise * Math.pow(1 - b, 1.6) + corner * lift;
    if (under) y -= thickness * (1 + (1 - b) * 1.5);
    const angle = face * Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [px * cos + pz * sin, y, -px * sin + pz * cos];
  };
  for (const under of [false, true]) {
    for (let face = 0; face < 4; face += 1) {
      const base = positions.length / 3;
      for (let ib = 0; ib <= segB; ib += 1) {
        const b = ib / segB;
        for (let ia = 0; ia <= segA; ia += 1) {
          const a = -1 + (2 * ia) / segA;
          positions.push(...sample(a, b, face, under));
          uvs.push(a * b * half * uvScale, b * Math.hypot(half, rise) * uvScale);
          const shade = under ? 0.32 : 1;
          colors.push(shade, shade, shade);
        }
      }
      for (let ib = 0; ib < segB; ib += 1) {
        for (let ia = 0; ia < segA; ia += 1) {
          const a = base + ib * cols + ia;
          const c = a + cols;
          if (under) indices.push(a, a + 1, c, a + 1, c + 1, c);
          else indices.push(a, c, a + 1, a + 1, c, c + 1);
        }
      }
    }
  }
  // Eave fascia joining the top and bottom skins.
  for (let face = 0; face < 4; face += 1) {
    const base = positions.length / 3;
    for (let ia = 0; ia <= segA; ia += 1) {
      const a = -1 + (2 * ia) / segA;
      positions.push(...sample(a, 1, face, false), ...sample(a, 1, face, true));
      uvs.push(ia / segA, 0, ia / segA, 0.1);
      colors.push(0.22, 0.2, 0.2, 0.22, 0.2, 0.2);
    }
    for (let ia = 0; ia < segA; ia += 1) {
      const a = base + ia * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const hips = [];
  for (let face = 0; face < 4; face += 1) {
    const points = [];
    for (let ib = 1; ib <= 8; ib += 1) {
      const p = sample(1, ib / 8, face, false);
      points.push(new THREE.Vector3(p[0], p[1] + 0.025, p[2]));
    }
    hips.push(points);
  }
  return { geometry, hips };
}

function lanternGeometry() {
  return new THREE.LatheGeometry([
    [0.0, -0.14], [0.05, -0.135], [0.085, -0.09], [0.1, -0.02], [0.1, 0.02], [0.085, 0.09], [0.05, 0.135], [0.0, 0.14],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 14);
}

function buildStreet(world) {
  const tiles = world.batch("tiles");
  const markings = world.batch("markings");
  const concrete = world.batch("concrete");
  const random = rng(3131);
  // Left sidewalk along the seam and right sidewalk beside the road.
  const zMax = RZ * 0.985;
  const sidewalk = (x0, x1) => {
    const steps = 44;
    for (let step = 0; step < steps; step += 1) {
      const z0 = -zMax + (step / steps) * zMax * 2;
      const z1 = -zMax + ((step + 1) / steps) * zMax * 2;
      const zc = (z0 + z1) / 2;
      if (!insideIsland(x1, zc, 0.04) || !insideIsland(x0, zc, 0.04)) continue;
      tiles.add(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0 + 0.002), matrixFrom([(x0 + x1) / 2, TOP + 0.025, zc]), new THREE.Color().setScalar(0.85 + random() * 0.15), { worldUV: 1.1 });
      concrete.add(new THREE.BoxGeometry(0.06, 0.075, z1 - z0 + 0.002), matrixFrom([x1 - 0.03, TOP + 0.03, zc]), 0xbfc0c4, { worldUV: 2 });
      if (x0 > 0.2) concrete.add(new THREE.BoxGeometry(0.06, 0.075, z1 - z0 + 0.002), matrixFrom([x0 + 0.03, TOP + 0.03, zc]), 0xbfc0c4, { worldUV: 2 });
    }
  };
  sidewalk(0.09, ROAD.x0);
  sidewalk(ROAD.x1, ROAD.x1 + 0.52);
  // Seam threshold: a row of cut granite blocks.
  for (let step = 0; step < 36; step += 1) {
    const z = -zMax + ((step + 0.5) / 36) * zMax * 2;
    if (!insideIsland(0, z, 0.08)) continue;
    world.batch("stone").add(new THREE.BoxGeometry(0.17, 0.1, zMax * 2 / 36 - 0.012), matrixFrom([0, TOP + 0.02, z], [0, (random() - 0.5) * 0.02, 0]), new THREE.Color().setScalar(0.72 + random() * 0.12), { worldUV: 1.3 });
  }
  // Road markings.
  const centerX = (ROAD.x0 + ROAD.x1) / 2;
  for (let z = -zMax + 0.3; z < zMax - 0.3; z += 0.62) {
    if (!insideIsland(centerX, z, 0.25) || (z > 2.6 && z < 3.6)) continue;
    markings.add(new THREE.PlaneGeometry(0.05, 0.32), matrixFrom([centerX, TOP + 0.004, z], [-Math.PI / 2, 0, 0]), 0xe8e4d8);
  }
  for (let stripe = 0; stripe < 6; stripe += 1) {
    const x = ROAD.x0 + 0.14 + stripe * 0.23;
    markings.add(new THREE.PlaneGeometry(0.12, 0.7), matrixFrom([x, TOP + 0.004, 3.1], [-Math.PI / 2, 0, 0]), 0xf2efe6);
  }
  for (const z of [2.62, 3.58]) markings.add(new THREE.PlaneGeometry(ROAD.x1 - ROAD.x0 - 0.1, 0.05), matrixFrom([centerX, TOP + 0.004, z], [-Math.PI / 2, 0, 0]), 0xf2efe6);
  // Manholes and drain grates.
  for (const [x, z] of [[1.05, -0.6], [1.5, 1.9], [3.1, 3.3]]) {
    world.batch("metal").add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), matrixFrom([x, TOP + 0.004, z]), 0x3a3c40);
  }
  for (let z = -4.6; z < 4.6; z += 1.7) {
    if (!insideIsland(ROAD.x1 - 0.08, z, 0.2)) continue;
    world.batch("metal").add(new THREE.BoxGeometry(0.1, 0.012, 0.3), matrixFrom([ROAD.x1 - 0.1, TOP + 0.004, z]), 0x202226);
  }
  world.steam.push(new THREE.Vector3(1.05, TOP + 0.05, -0.6), new THREE.Vector3(1.5, TOP + 0.05, 1.9));
}

function buildTowers(world) {
  const concrete = world.batch("concrete");
  const neonPink = world.batch("neonPink");
  const neonCyan = world.batch("neonCyan");
  const blink = world.batch("blink");
  const metal = world.batch("metal");
  const random = rng(77);
  const facadePlane = (width, height, u0, v0) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let index = 0; index < position.count; index += 1) {
      uv.setXY(index, u0 + (position.getX(index) + width / 2) / 1.15, v0 + (position.getY(index) + height / 2) / 2.05);
    }
    return geometry;
  };
  const shell = (batch, root, w, d, h, y0) => {
    const u0 = random();
    const v0 = random();
    const faces = [
      [w, [0, y0 + h / 2, d / 2], 0],
      [w, [0, y0 + h / 2, -d / 2], Math.PI],
      [d, [w / 2, y0 + h / 2, 0], Math.PI / 2],
      [d, [-w / 2, y0 + h / 2, 0], -Math.PI / 2],
    ];
    faces.forEach(([width, position, rotation], index) => {
      batch.add(facadePlane(width, h, u0 + index * 0.37, v0), root.clone().multiply(matrixFrom(position, [0, rotation, 0])));
    });
    concrete.add(new THREE.BoxGeometry(w + 0.06, 0.1, d + 0.06), root.clone().multiply(matrixFrom([0, y0 + h + 0.05, 0])), 0x55575e, { worldUV: 1.5 });
    concrete.add(new THREE.BoxGeometry(w - 0.02, 0.02, d - 0.02), root.clone().multiply(matrixFrom([0, y0 + 0.01, 0])), 0x2a2b30);
  };
  const signs = [];
  TOWERS.forEach((spec, index) => {
    const root = matrixFrom([spec.x, TOP, spec.z], [0, spec.rotation, 0]);
    const put = (batch, geometry, position, rotation = [0, 0, 0], scale = 1, color = null, options = {}) => {
      batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation, scale)), color, options);
    };
    const facade = world.batch(spec.facade ? "facadeB" : "facadeA");
    let top = spec.h;
    let w = spec.w;
    let d = spec.d;
    shell(facade, root, w, d, spec.h, 0);
    if (spec.h > 4.4) {
      const upper = 1.3;
      shell(facade, root, w * 0.72, d * 0.72, upper, spec.h + 0.1);
      put(neonCyan, new THREE.BoxGeometry(w * 0.74, 0.035, 0.035), [0, spec.h + 0.1 + upper * 0.55, d * 0.36 + 0.02]);
      top = spec.h + 0.1 + upper;
      w *= 0.72;
      d *= 0.72;
    }
    // Neon edge lines and a lit band under the roof.
    put(index % 2 ? neonPink : neonCyan, new THREE.BoxGeometry(0.03, spec.h * 0.86, 0.03), [spec.w / 2 + 0.01, spec.h * 0.45, spec.d / 2 + 0.01]);
    put(index % 2 ? neonCyan : neonPink, new THREE.BoxGeometry(spec.w + 0.04, 0.04, 0.03), [0, spec.h - 0.2, spec.d / 2 + 0.02]);
    // Rooftop clutter.
    for (let unit = 0; unit < 3; unit += 1) {
      put(metal, new THREE.BoxGeometry(0.16, 0.12, 0.2), [(random() - 0.5) * (w - 0.25), top + 0.16, (random() - 0.5) * (d - 0.25)], [0, random(), 0], 1, 0x6d7076);
    }
    if (index % 2 === 0) {
      const tx = (random() - 0.5) * (w - 0.3);
      const tz = (random() - 0.5) * (d - 0.3);
      put(concrete, new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12), [tx, top + 0.33, tz], [0, 0, 0], 1, 0x8a7a66, { worldUV: 3 });
      for (const [lx, lz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) put(metal, new THREE.BoxGeometry(0.015, 0.14, 0.015), [tx + lx, top + 0.17, tz + lz], [0, 0, 0], 1, 0x2a2c30);
    }
    const mastHeight = 0.6 + random() * 1.0;
    const mx = (random() - 0.5) * w * 0.4;
    const mz = (random() - 0.5) * d * 0.4;
    put(metal, new THREE.CylinderGeometry(0.012, 0.024, mastHeight, 5), [mx, top + 0.1 + mastHeight / 2, mz], [0, 0, 0], 1, 0x3a3d44);
    put(blink, new THREE.SphereGeometry(0.035, 8, 6), [mx, top + 0.12 + mastHeight, mz]);
    put(blink, new THREE.SphereGeometry(0.03, 8, 6), [w / 2 - 0.05, top + 0.13, d / 2 - 0.05]);
    // Protruding vertical kanji sign.
    if (spec.sign !== undefined) {
      const signHeight = Math.min(1.4, spec.h * 0.34);
      const y = spec.h * 0.52;
      const sx = (index % 2 ? -1 : 1) * (spec.w / 2 + 0.02);
      const geometry = new THREE.PlaneGeometry(0.26, signHeight);
      const uv = geometry.attributes.uv;
      for (let item = 0; item < uv.count; item += 1) uv.setX(item, (spec.sign + 0.05 + uv.getX(item) * 0.9) / 4);
      signs.push([geometry, root.clone().multiply(matrixFrom([sx, y, spec.d / 2 - 0.22], [0, Math.PI / 2 * (index % 2 ? -1 : 1) + Math.PI / 2, 0]))]);
      put(metal, new THREE.BoxGeometry(0.3, signHeight + 0.04, 0.035), [sx, y, spec.d / 2 - 0.22], [0, 0, 0], 1, 0x1b1c20);
      put(metal, new THREE.BoxGeometry(0.2, 0.025, 0.025), [sx - (index % 2 ? -0.1 : 0.1), y + signHeight / 2 - 0.1, spec.d / 2 - 0.22], [0, 0, 0], 1, 0x1b1c20);
    }
    if (spec.billboard) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), world.materials.billboard);
      board.applyMatrix4(root.clone().multiply(matrixFrom([0, spec.h - 1.05, spec.d / 2 + 0.06])));
      board.name = "billboard";
      world.scene.add(board);
      const boardFoot = new THREE.Vector3().setFromMatrixPosition(root.clone().multiply(matrixFrom([0, 0, spec.d / 2 + 1.1])));
      world.addLightPool(boardFoot.x, TOP, boardFoot.z, 1.3, new THREE.Color(0.3, 0.14, 0.42));
      put(metal, new THREE.BoxGeometry(1.58, 0.83, 0.06), [0, spec.h - 1.05, spec.d / 2 + 0.02], [0, 0, 0], 1, 0x17181c);
    }
  });
  const kanji = world.batch("kanji");
  for (const [geometry, matrix] of signs) {
    kanji.add(geometry, matrix);
    const back = geometry.clone();
    back.rotateY(Math.PI);
    kanji.add(back, matrix);
  }
}

function buildPagoda(world) {
  const lacquer = world.batch("lacquer");
  const plaster = world.batch("plaster");
  const roofs = world.batch("roofJP");
  const metal = world.batch("metal");
  const concrete = world.batch("concrete");
  const shoji = world.batch("shoji");
  const lanterns = world.batch("lanternPaper");
  const wood = world.batch("wood");
  const root = matrixFrom([PAGODA.x, TOP, PAGODA.z], [0, -0.06, 0]);
  const put = (batch, geometry, position, rotation = [0, 0, 0], scale = 1, color = null, options = {}) => {
    batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation, scale)), color, options);
  };
  // Stone podium with steps.
  put(concrete, new THREE.BoxGeometry(2.9, 0.32, 2.8), [0, 0.16, 0], [0, 0, 0], 1, 0x9c9a96, { worldUV: 1.2 });
  for (let step = 0; step < 3; step += 1) {
    put(concrete, new THREE.BoxGeometry(1.0, 0.1, 0.16), [0, 0.05 + step * 0.1, 1.64 - step * 0.14], [0, 0, 0], 1, 0xa8a6a2, { worldUV: 1.2 });
  }
  const tiers = [
    { size: 1.75, height: 1.0, roof: 1.55, rise: 0.62, lift: 0.26 },
    { size: 1.3, height: 0.6, roof: 1.25, rise: 0.5, lift: 0.22 },
    { size: 0.98, height: 0.52, roof: 1.02, rise: 0.92, lift: 0.2 },
  ];
  let y = 0.32;
  const lantern = lanternGeometry();
  tiers.forEach((tier, index) => {
    const half = tier.size / 2;
    put(plaster, new THREE.BoxGeometry(tier.size, tier.height, tier.size), [0, y + tier.height / 2, 0], [0, 0, 0], 1, 0xf3eee4);
    // Posts, beams and lattice.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) put(lacquer, new THREE.CylinderGeometry(0.06, 0.07, tier.height, 8), [sx * half, y + tier.height / 2, sz * half]);
    }
    for (const [dy, t] of [[0.05, 0.1], [tier.height - 0.06, 0.12]]) {
      for (const rotation of [0, Math.PI / 2]) {
        for (const side of [-1, 1]) {
          const along = rotation === 0;
          put(lacquer, new THREE.BoxGeometry(along ? tier.size + 0.12 : 0.09, t, along ? 0.09 : tier.size + 0.12), [along ? 0 : side * half, y + dy, along ? side * half : 0]);
        }
      }
    }
    for (let face = 0; face < 4; face += 1) {
      const rotation = face * Math.PI / 2;
      const dx = Math.sin(rotation) * (half + 0.012);
      const dz = Math.cos(rotation) * (half + 0.012);
      const panelWidth = tier.size * (index === 0 ? 0.32 : 0.5);
      const panelHeight = tier.height * 0.62;
      if (index === 0 && face === 0) {
        for (const offset of [-0.2, 0.2]) {
          const tangentX = Math.cos(rotation) * offset;
          const tangentZ = -Math.sin(rotation) * offset;
          put(shoji, new THREE.PlaneGeometry(0.36, 0.7), [dx + tangentX, y + 0.44, dz + tangentZ], [0, rotation, 0]);
        }
      } else {
        put(shoji, new THREE.PlaneGeometry(panelWidth, panelHeight), [dx, y + tier.height * 0.5, dz], [0, rotation, 0]);
      }
    }
    // Bracket sets under the eaves.
    const roofY = y + tier.height + 0.08;
    for (let face = 0; face < 4; face += 1) {
      const rotation = face * Math.PI / 2;
      for (let bracket = -2; bracket <= 2; bracket += 1) {
        const along = bracket * half * 0.45;
        const x = Math.sin(rotation) * (half + 0.12) + Math.cos(rotation) * along;
        const z = Math.cos(rotation) * (half + 0.12) - Math.sin(rotation) * along;
        put(wood, new THREE.BoxGeometry(0.07, 0.07, 0.26), [x, roofY - 0.04, z], [0, rotation, 0], 1, 0x5a1d18);
      }
    }
    if (index === 1) {
      // Balcony railing.
      const railHalf = half + 0.18;
      for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        put(lacquer, new THREE.BoxGeometry(railHalf * 2, 0.035, 0.035), [Math.sin(rotation) * railHalf, y + 0.24, Math.cos(rotation) * railHalf], [0, rotation, 0]);
        for (let post = -3; post <= 3; post += 1) {
          const along = (post / 3) * railHalf;
          put(lacquer, new THREE.BoxGeometry(0.03, 0.24, 0.03), [Math.sin(rotation) * railHalf + Math.cos(rotation) * along, y + 0.12, Math.cos(rotation) * railHalf - Math.sin(rotation) * along]);
        }
      }
      put(wood, new THREE.BoxGeometry(railHalf * 2, 0.04, railHalf * 2), [0, y + 0.01, 0], [0, 0, 0], 1, 0x3a1a14);
    }
    const roof = hipRoof(tier.roof, tier.rise, tier.lift, 0.07);
    put(roofs, roof.geometry, [0, roofY, 0]);
    for (const hip of roof.hips) {
      const tube = taperedTube(hip, 0.035, 0.03, { radial: 5, segments: 10 });
      put(roofs, tube, [0, roofY, 0], [0, 0, 0], 1, 0x3a3f46);
      const end = hip[hip.length - 1];
      put(metal, new THREE.SphereGeometry(0.045, 8, 6), [end.x, roofY + end.y + 0.02, end.z], [0, 0, 0], 1, 0xc59a45);
      if (index === 0) {
        put(lanterns, lantern, [end.x * 0.93, roofY + end.y - 0.36, end.z * 0.93], [0, 0, 0], 0.9);
        put(metal, new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3), [end.x * 0.93, roofY + end.y - 0.13, end.z * 0.93], [0, 0, 0], 1, 0x111111);
      } else {
        put(metal, new THREE.ConeGeometry(0.035, 0.07, 8, 1, true), [end.x * 0.96, roofY + end.y - 0.1, end.z * 0.96], [0, 0, 0], 1, 0x9c7a3c);
      }
    }
    y = roofY + (index < 2 ? 0.18 : 0);
    if (index === 2) {
      // Sōrin spire with nine rings and a flaming jewel.
      const apex = roofY + tier.rise - 0.05;
      put(metal, new THREE.BoxGeometry(0.16, 0.08, 0.16), [0, apex + 0.04, 0], [0, 0, 0], 1, 0x8e6c32);
      put(metal, new THREE.CylinderGeometry(0.025, 0.03, 1.15, 8), [0, apex + 0.6, 0], [0, 0, 0], 1, 0xb88d44);
      for (let ring = 0; ring < 9; ring += 1) {
        put(metal, new THREE.TorusGeometry(0.075 - ring * 0.003, 0.012, 6, 16), [0, apex + 0.22 + ring * 0.085, 0], [Math.PI / 2, 0, 0], 1, 0xc9a04e);
      }
      put(metal, new THREE.ConeGeometry(0.07, 0.16, 8), [0, apex + 1.08, 0], [0, 0, 0], 1, 0xd9b25c);
      put(metal, new THREE.SphereGeometry(0.05, 10, 8), [0, apex + 1.2, 0], [0, 0, 0], 1, 0xf0c866);
    }
  });
  world.pagodaGlow = new THREE.Vector3().setFromMatrixPosition(root.clone().multiply(matrixFrom([0, 0.9, 1.3])));
  world.addLightPool(world.pagodaGlow.x, TOP, world.pagodaGlow.z + 0.55, 1.2, new THREE.Color(0.6, 0.34, 0.15));
}

function torii(world, x, z, angle, scale, { plaque = false } = {}) {
  const lacquer = world.batch("lacquer");
  const paint = world.batch("paint");
  const root = matrixFrom([x, TOP, z], [0, angle, 0], scale);
  const put = (batch, geometry, position, rotation = [0, 0, 0], s = 1, color = null) => {
    batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation, s)), color);
  };
  for (const side of [-1, 1]) {
    put(lacquer, new THREE.CylinderGeometry(0.085, 0.1, 2.3, 10), [side * 0.88, 1.15, 0], [0, 0, side * 0.03]);
    put(paint, new THREE.CylinderGeometry(0.13, 0.14, 0.16, 10), [side * 0.9, 0.08, 0], [0, 0, 0], 1, 0x151515);
  }
  put(lacquer, new THREE.BoxGeometry(2.25, 0.12, 0.09), [0, 1.82, 0]);
  put(lacquer, new THREE.BoxGeometry(0.1, 0.34, 0.08), [0, 2.02, 0]);
  put(lacquer, new THREE.BoxGeometry(2.55, 0.12, 0.15), [0, 2.24, 0]);
  const kasagi = new THREE.BoxGeometry(2.95, 0.13, 0.22, 16, 1, 1);
  const position = kasagi.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index) / 1.475;
    position.setY(index, position.getY(index) * (1 + px * px * 0.5) + px * px * 0.13);
  }
  kasagi.computeVertexNormals();
  put(paint, kasagi, [0, 2.36, 0], [0, 0, 0], 1, 0x121214);
  if (plaque) {
    put(paint, new THREE.BoxGeometry(0.26, 0.34, 0.03), [0, 2.02, 0.06], [0, 0, 0], 1, 0x151515);
    put(world.batch("metal"), new THREE.BoxGeometry(0.2, 0.28, 0.01), [0, 2.02, 0.078], [0, 0, 0], 1, 0xc9a04e);
  }
}

function buildShrinePath(world) {
  const concrete = world.batch("concrete");
  const glow = world.batch("warmGlow");
  const random = rng(391);
  // Stone slabs.
  for (let index = 0; index <= 26; index += 1) {
    const { x, z, angle } = samplePath(TORII_PATH, index / 26);
    concrete.add(new THREE.BoxGeometry(0.62 + random() * 0.14, 0.05, 0.3 + random() * 0.08), matrixFrom([x, TOP + 0.02, z], [0, angle + (random() - 0.5) * 0.12, 0]), new THREE.Color().setScalar(0.62 + random() * 0.14), { worldUV: 1.4 });
  }
  // Senbon torii tunnel.
  const gates = world.quality.low ? 5 : 8;
  for (let gate = 0; gate < gates; gate += 1) {
    const t = 0.1 + (gate / (gates - 1)) * 0.62;
    const { x, z, angle } = samplePath(TORII_PATH, t);
    torii(world, x, z, angle, gate === 0 ? 0.84 : 0.6, { plaque: gate === 0 });
  }
  // Stone tōrō lanterns.
  const toro = (x, z, rotation) => {
    world.addLightPool(x, TOP, z, 0.62, new THREE.Color(0.62, 0.38, 0.18));
    const root = matrixFrom([x, TOP, z], [0, rotation, 0]);
    const put = (batch, geometry, position, color = 0x8f8d88) => batch.add(geometry, root.clone().multiply(matrixFrom(position)), color, { worldUV: 1.8 });
    put(concrete, new THREE.CylinderGeometry(0.16, 0.19, 0.1, 6), [0, 0.05, 0]);
    put(concrete, new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), [0, 0.35, 0]);
    put(concrete, new THREE.CylinderGeometry(0.17, 0.12, 0.08, 6), [0, 0.64, 0]);
    put(concrete, new THREE.BoxGeometry(0.2, 0.2, 0.2), [0, 0.78, 0], 0x7d7b77);
    put(glow, new THREE.BoxGeometry(0.21, 0.12, 0.12), [0, 0.78, 0], 0xffd9a0);
    put(concrete, new THREE.ConeGeometry(0.26, 0.2, 6), [0, 0.98, 0]);
    put(concrete, new THREE.SphereGeometry(0.045, 8, 6), [0, 1.1, 0]);
  };
  toro(PAGODA.x - 0.75, PAGODA.z + 2.0, 0.2);
  toro(PAGODA.x + 0.75, PAGODA.z + 2.0, -0.2);
  toro(4.25, 4.35, 0.4);
  toro(5.35, 3.75, -0.3);
}

function buildSakura(world) {
  const bark = world.batch("sakuraBark");
  const carpet = world.batch("paint");
  const random = rng(515);
  const cards = [];
  const trees = world.quality.low ? SAKURA.slice(0, 3) : SAKURA;
  for (const [x, z, scale, seed] of trees) {
    const local = rng(seed);
    const ends = [];
    const branch = (from, direction, length, radius, depth) => {
      const bend = new THREE.Vector3(local() - 0.5, local() * 0.3, local() - 0.5).multiplyScalar(length * 0.35);
      const mid = from.clone().addScaledVector(direction, length * 0.5).add(bend);
      const end = from.clone().addScaledVector(direction, length).add(bend.multiplyScalar(0.6));
      bark.add(taperedTube([from, mid, end], radius, radius * 0.66, { radial: depth < 2 ? 7 : 5, segments: 6, uvScale: [1, 1.8] }), null, 0x7a6060);
      if (depth >= 3) {
        ends.push(end);
        return;
      }
      if (depth >= 1) ends.push(mid);
      const children = depth === 0 ? 3 : 2 + (local() > 0.5 ? 1 : 0);
      for (let child = 0; child < children; child += 1) {
        const angle = (child / children) * Math.PI * 2 + local() * 1.2;
        const spread = 0.55 + local() * 0.5;
        const next = direction.clone().multiplyScalar(Math.cos(spread))
          .add(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(Math.sin(spread)))
          .add(new THREE.Vector3(0, 0.12, 0)).normalize();
        branch(end, next, length * (0.62 + local() * 0.18), radius * 0.62, depth + 1);
      }
    };
    const base = new THREE.Vector3(x, TOP - 0.05, z);
    const lean = new THREE.Vector3(local() - 0.5, 1.6, local() - 0.5).normalize();
    branch(base, lean, 1.25 * scale, 0.12 * scale, 0);
    // Root flare.
    for (let root = 0; root < 4; root += 1) {
      const angle = (root / 4) * Math.PI * 2 + local();
      bark.add(taperedTube([[x, TOP + 0.25 * scale, z], [x + Math.cos(angle) * 0.22 * scale, TOP + 0.02, z + Math.sin(angle) * 0.22 * scale]], 0.06 * scale, 0.015, { radial: 5, segments: 4 }), null, 0x6a5050);
    }
    for (const end of ends) {
      const clusterSize = (0.34 + local() * 0.2) * scale * 1.3;
      const count = world.quality.low ? 11 : 22;
      for (let card = 0; card < count; card += 1) {
        const direction = new THREE.Vector3(local() - 0.5, (local() - 0.3) * 0.8, local() - 0.5).normalize();
        const offset = direction.clone().multiplyScalar(Math.cbrt(local()) * clusterSize);
        cards.push({ position: end.clone().add(offset), direction, size: (0.24 + local() * 0.14) * scale * 1.2, tint: local() });
      }
    }
    // Petal carpet around the trunk.
    for (let petal = 0; petal < (world.quality.low ? 120 : 280); petal += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.pow(random(), 0.6) * 1.35 * scale * 1.2;
      const px = x + Math.cos(angle) * distance;
      const pz = z + Math.sin(angle) * distance;
      if (!insideIsland(px, pz, 0.05)) continue;
      carpet.add(new THREE.CircleGeometry(0.018 + random() * 0.012, 5), matrixFrom([px, TOP + 0.006 + random() * 0.004, pz], [-Math.PI / 2, 0, random() * 6]), new THREE.Color().setHSL(0.94 + random() * 0.03, 0.7, 0.8 + random() * 0.12));
    }
  }
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = softFoliage(new THREE.MeshLambertMaterial({
    name: "blossoms",
    map: world.textures.blossom,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    emissive: 0x4a1830,
  }), { time: world.uniforms.time, upWeight: 1.3, wind: 0.01, translucency: 0.2, key: "blossoms" });
  const mesh = new THREE.InstancedMesh(geometry, material, cards.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  cards.forEach((card, index) => {
    dummy.position.copy(card.position);
    dummy.lookAt(card.position.clone().add(card.direction));
    dummy.rotateZ(random() * Math.PI * 2);
    dummy.rotateX((random() - 0.5) * 0.9);
    dummy.scale.setScalar(card.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.94 + card.tint * 0.03, 0.3 + card.tint * 0.25, 0.9 - card.tint * 0.06);
    mesh.setColorAt(index, color);
  });
  mesh.castShadow = !world.quality.low;
  mesh.receiveShadow = true;
  mesh.name = "sakura";
  world.scene.add(mesh);
  world.sakuraClusters = cards.filter((_, index) => index % 23 === 0).map((card) => card.position);
}

function buildStreetFurniture(world) {
  const concrete = world.batch("concrete");
  const metal = world.batch("metal");
  const paint = world.batch("paint");
  const cables = world.batch("cables");
  const lanterns = world.batch("lanternPaper");
  const cool = world.batch("coolGlow");
  const random = rng(4242);
  const tops = [];
  // Utility poles.
  POLES.forEach(([x, z], index) => {
    concrete.add(new THREE.CylinderGeometry(0.05, 0.075, 3.1, 10), matrixFrom([x, TOP + 1.55, z]), 0xa9a8a4, { worldUV: 2 });
    for (const [y, width] of [[2.85, 0.9], [2.55, 0.7]]) {
      metal.add(new THREE.BoxGeometry(width, 0.05, 0.05), matrixFrom([x, TOP + y, z], [0, Math.PI / 2, 0]), 0x3a3c40);
      for (const offset of [-width / 2 + 0.06, width / 2 - 0.06]) {
        paint.add(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 6), matrixFrom([x, TOP + y + 0.05, z + offset]), 0xe8e6e0);
      }
    }
    if (index === 1) {
      metal.add(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 12), matrixFrom([x + 0.16, TOP + 2.2, z]), 0x6e7278);
    }
    // Street light arm over the road.
    const arm = [[x, TOP + 2.35, z], [x - 0.25, TOP + 2.5, z], [x - 0.6, TOP + 2.48, z]];
    metal.add(taperedTube(arm, 0.02, 0.018, { radial: 5, segments: 6 }), null, 0x4a4d52);
    metal.add(new THREE.BoxGeometry(0.2, 0.04, 0.1), matrixFrom([x - 0.62, TOP + 2.46, z]), 0x2a2c30);
    cool.add(new THREE.BoxGeometry(0.16, 0.012, 0.07), matrixFrom([x - 0.62, TOP + 2.435, z]));
    world.addLightPool(x - 0.62, TOP, z, 0.9, new THREE.Color(0.34, 0.4, 0.5));
    tops.push([x, z]);
  });
  // Sagging wires between poles and into the city.
  const wire = (a, b, sag) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const q1 = a.clone().lerp(mid, 0.5);
    q1.y = lerp(a.y, mid.y, 0.72);
    const q3 = b.clone().lerp(mid, 0.5);
    q3.y = lerp(b.y, mid.y, 0.72);
    cables.add(taperedTube([a, q1, mid, q3, b], 0.007, 0.007, { radial: 3, segments: 14 }));
  };
  for (let index = 0; index < tops.length - 1; index += 1) {
    const [ax, az] = tops[index];
    const [bx, bz] = tops[index + 1];
    for (const [y, offset] of [[2.9, -0.39], [2.9, 0.39], [2.6, -0.29], [2.6, 0.29], [2.3, 0.1]]) {
      wire(new THREE.Vector3(ax, TOP + y, az + offset), new THREE.Vector3(bx, TOP + y, bz + offset), 0.18 + random() * 0.15);
    }
  }
  for (const [target, height] of [[[4.72, -3.1], 3.4], [[5.6, -1.0], 2.9], [[5.55, 0.2], 2.6], [[6.1, -2.1], 3.1]]) {
    const [px, pz] = tops[tops.length - 1];
    wire(new THREE.Vector3(px, TOP + 2.8, pz + (random() - 0.5) * 0.5), new THREE.Vector3(target[0], TOP + height, target[1]), 0.3 + random() * 0.3);
  }
  wire(new THREE.Vector3(tops[0][0], TOP + 2.7, tops[0][1]), new THREE.Vector3(0.3, TOP + 2.0, 4.6), 0.25);
  // Festival lanterns strung between the first two poles.
  const a = new THREE.Vector3(tops[0][0] + 0.02, TOP + 2.25, tops[0][1] - 0.1);
  const b = new THREE.Vector3(tops[1][0] + 0.02, TOP + 2.25, tops[1][1] + 0.1);
  wire(a, b, 0.45);
  const lantern = lanternGeometry();
  for (let item = 1; item <= 7; item += 1) {
    const t = item / 8;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * 0.45 * 0.92 + 0.2;
    lanterns.add(lantern, matrixFrom([p.x, p.y, p.z], [0, random(), 0], 0.85));
    if (item % 2) world.addLightPool(p.x, TOP, p.z, 0.55, new THREE.Color(0.55, 0.15, 0.07));
    paint.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), matrixFrom([p.x, p.y + 0.125, p.z]), 0x1a1a1a);
    paint.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), matrixFrom([p.x, p.y - 0.125, p.z]), 0x1a1a1a);
  }
  // Vending machines facing the road.
  const bodies = [0xd8262e, 0x2c6bd6, 0xf2f2f0];
  bodies.forEach((body, index) => {
    const z = VENDING.z - 0.5 + index * 0.47;
    const root = matrixFrom([VENDING.x, TOP + 0.06, z], [0, -Math.PI / 2, 0]);
    paint.add(new THREE.BoxGeometry(0.44, 0.82, 0.32), root.clone().multiply(matrixFrom([0, 0.41, 0])), body);
    world.batch("vending").add(new THREE.PlaneGeometry(0.36, 0.62), root.clone().multiply(matrixFrom([0, 0.45, 0.161])));
    cool.add(new THREE.BoxGeometry(0.38, 0.05, 0.01), root.clone().multiply(matrixFrom([0, 0.79, 0.162])));
  });
  world.vendingLight = new THREE.Vector3(VENDING.x - 0.5, TOP + 0.6, VENDING.z);
  world.addLightPool(VENDING.x - 0.45, TOP + 0.06, VENDING.z - 0.03, 0.9, new THREE.Color(0.3, 0.42, 0.6));
}

/** A boxy Tokyo taxi idling at the kerb, "空車" lamp glowing. */
function buildTaxi(world, x, z, heading) {
  const paint = world.batch("paint");
  const metal = world.batch("metal");
  const glow = world.batch("warmGlow");
  const pink = world.batch("neonPink");
  const root = matrixFrom([x, TOP, z], [0, heading, 0]);
  const put = (batch, geometry, position, color = null, rotation = [0, 0, 0]) => batch.add(geometry, root.clone().multiply(matrixFrom(position, rotation)), color);
  put(paint, new THREE.BoxGeometry(0.3, 0.13, 0.66), [0, 0.125, 0], 0x14161b);
  put(paint, new THREE.BoxGeometry(0.3, 0.04, 0.66), [0, 0.07, 0], 0xd8b23a);
  put(paint, new THREE.BoxGeometry(0.27, 0.12, 0.34), [0, 0.25, -0.03], 0x14161b);
  put(metal, new THREE.BoxGeometry(0.275, 0.085, 0.3), [0, 0.255, -0.03], 0x1a2330);
  put(metal, new THREE.BoxGeometry(0.31, 0.02, 0.68), [0, 0.056, 0], 0x9aa0a8);
  for (const sx of [-0.14, 0.14]) {
    for (const sz of [-0.21, 0.21]) put(paint, new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), [sx, 0.055, sz], 0x0c0c0e, [0, 0, Math.PI / 2]);
    put(glow, new THREE.BoxGeometry(0.06, 0.03, 0.01), [sx * 0.8, 0.13, 0.333], new THREE.Color(1.3, 1.25, 1.1));
    put(pink, new THREE.BoxGeometry(0.06, 0.03, 0.01), [sx * 0.8, 0.13, -0.333]);
  }
  put(glow, new THREE.BoxGeometry(0.1, 0.05, 0.05), [0, 0.335, -0.02], new THREE.Color(1.2, 1.0, 0.35));
  put(pink, new THREE.BoxGeometry(0.05, 0.022, 0.004), [0.07, 0.27, 0.132]);
  world.addLightPool(x + Math.sin(heading) * 0.55, TOP, z + Math.cos(heading) * 0.55, 0.45, new THREE.Color(0.45, 0.42, 0.35));
}

export function buildGehirn(world) {
  const { materials, textures } = world;
  const facade = (map) => {
    const texture = map.clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.38,
      metalness: 0.2,
      envMapIntensity: 0.6,
    });
  };
  materials.facadeA = facade(textures.facadeA);
  materials.facadeB = facade(textures.facadeB);
  materials.lacquer = new THREE.MeshStandardMaterial({ name: "lacquer", color: LACQUER, roughness: 0.42, vertexColors: true });
  materials.roofJP = new THREE.MeshStandardMaterial({ name: "roofJP", map: textures.japaneseRoof, roughness: 0.46, metalness: 0.3, vertexColors: true });
  materials.shoji = new THREE.MeshStandardMaterial({ name: "shoji", map: textures.shoji, emissive: 0xffffff, emissiveMap: textures.shoji, emissiveIntensity: 1.1, roughness: 0.8 });
  materials.lanternPaper = new THREE.MeshStandardMaterial({ name: "lanternPaper", map: textures.lantern, emissive: 0xffffff, emissiveMap: textures.lantern, emissiveIntensity: 2.2, roughness: 0.7 });
  materials.kanji = new THREE.MeshBasicMaterial({ name: "kanji", map: textures.kanji, color: new THREE.Color(2.2, 2.2, 2.2) });
  materials.vending = new THREE.MeshBasicMaterial({ name: "vending", map: textures.vending, color: new THREE.Color(1.6, 1.65, 1.7) });
  materials.coolGlow = new THREE.MeshBasicMaterial({ name: "coolGlow", color: new THREE.Color(2.4, 2.8, 3.2) });
  materials.cables = new THREE.MeshStandardMaterial({ name: "cables", color: 0x0d0e11, roughness: 0.5, metalness: 0.3 });
  materials.markings = new THREE.MeshStandardMaterial({ name: "markings", vertexColors: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  materials.tiles = new THREE.MeshStandardMaterial({ name: "tiles", map: textures.cobble, color: 0x8d8f96, vertexColors: true, roughness: 0.34, envMapIntensity: 0.9 });
  materials.sakuraBark = new THREE.MeshStandardMaterial({ name: "sakuraBark", map: textures.bark, vertexColors: true, roughness: 0.7 });
  materials.blink = patchMaterial(new THREE.MeshBasicMaterial({ name: "blink", color: new THREE.Color(5, 0.35, 0.3) }), {
    key: "blink",
    uniforms: { uTime: world.uniforms.time },
    vertexHead: "varying float vBlinkSeed;",
    vertex: [["project_vertex", "$&\nvBlinkSeed = dot(modelMatrix[3].xyz + position, vec3(3.1, 1.7, 2.3));"]],
    fragmentHead: "uniform float uTime;\nvarying float vBlinkSeed;",
    fragment: [["color_fragment", "$&\ndiffuseColor.rgb *= 0.08 + 0.92 * smoothstep(0.55, 0.62, fract(uTime * 0.55 + fract(vBlinkSeed * 0.37)));"]],
  });
  materials.billboard = new THREE.ShaderMaterial({
    name: "billboard",
    uniforms: { uTime: world.uniforms.time, uMap: { value: textures.billboard } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMap;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        float glitch = step(0.93, ffHash12(vec2(floor(uTime * 7.0), floor(vUv.y * 18.0)))) * 0.03;
        vec2 uv = vUv + vec2(glitch, 0.0);
        float shift = 0.006 + 0.004 * sin(uTime * 2.0);
        float r = texture2D(uMap, uv + vec2(shift, 0.0)).r;
        float g = texture2D(uMap, uv).r;
        float b = texture2D(uMap, uv - vec2(shift, 0.0)).r;
        vec3 gradient = mix(vec3(1.0, 0.18, 0.42), vec3(0.1, 0.85, 1.0), 0.5 + 0.5 * sin(uTime * 0.6 + vUv.x * 2.5));
        vec3 color = vec3(r * 1.0, g * 0.95, b * 1.05) * 2.4 + gradient * (0.16 + 0.06 * sin(vUv.y * 180.0 + uTime * 8.0));
        color *= 0.85 + 0.15 * sin(vUv.y * 420.0);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  buildStreet(world);
  buildTowers(world);
  buildPagoda(world);
  buildShrinePath(world);
  buildSakura(world);
  buildStreetFurniture(world);
  buildTaxi(world, 1.62, -0.35, Math.PI);
  world.gehirnSign = GEHIRN_SIGN;
}
