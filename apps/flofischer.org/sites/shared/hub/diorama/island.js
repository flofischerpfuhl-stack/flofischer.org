import * as THREE from "three";
import {
  Batch, GLSL_NOISE, clamp, createNoise, lerp, matrixFrom, paintVertices, rng, smoothIcosahedron, smoothstep, taperedTube,
} from "./utils.js";
import { grassTuft } from "./seele.js";
import {
  CHAPEL, JUNGLE_TREES, PALMS, POND, ROAD, RX, RZ, SEELE_PATH, SIDE_PATH, STREAM_START, TOP, WATER_Y,
  insideIsland, pathDistance, rimDistance, rimFactor, streamCenter, streamHalfWidth, terrainHeight, waterDistance,
} from "./layout.js";

const noise = createNoise(31);
export const CLIFF_DEPTH = 8.6;

function cliffDepth(v) {
  return CLIFF_DEPTH * (0.3 * v + 0.7 * v * v);
}

/** Horizontal scale of the rock mass relative to the rim at a given depth. */
function cliffProfile(depth) {
  if (depth < 1.05) return 1 + 0.03 * Math.sin(clamp(depth / 0.55, 0, 1) * Math.PI) - depth * 0.018;
  const t = (depth - 1.05) / (CLIFF_DEPTH - 1.05);
  return (1 - 1.05 * 0.018) * Math.pow(Math.max(0, 1 - t), 0.6);
}

/**
 * The whole floating rock as one continuous displaced surface: soil lip,
 * stratified cliff band, then an eroded, multi-lobed taper that ends in a tip.
 */
function buildCliff(world) {
  const low = world.quality.low;
  const SEG = low ? 168 : 240;
  const RINGS = low ? 52 : 84;
  const cols = SEG + 1;
  const count = (RINGS + 1) * cols;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const depths = new Float32Array(RINGS + 1);
  const rimGround = new Float32Array(cols);

  for (let ring = 0; ring <= RINGS; ring += 1) depths[ring] = cliffDepth(ring / RINGS);

  for (let ring = 0; ring <= RINGS; ring += 1) {
    const depth = depths[ring];
    const t = clamp((depth - 1.05) / (CLIFF_DEPTH - 1.05), 0, 1);
    const profile = cliffProfile(depth);
    const driftX = 0.55 * t * t;
    const driftZ = -0.3 * t * t;
    for (let col = 0; col <= SEG; col += 1) {
      const theta = ((col % SEG) / SEG) * Math.PI * 2;
      const factor = rimFactor(theta);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const rimX = cos * RX * factor;
      const rimZ = sin * RZ * factor;
      if (ring === 0) rimGround[col] = terrainHeight(rimX, rimZ);
      const offset = (ring * cols + col) * 3;
      if (ring === 0) {
        positions[offset] = rimX;
        positions[offset + 1] = rimGround[col];
        positions[offset + 2] = rimZ;
      } else {
        const outward = new THREE.Vector2(cos * RZ, sin * RX).normalize();
        const notch = Math.max(0, TOP - rimGround[col]);
        let y = TOP - depth - notch * Math.exp(-depth / 0.7);
        const lobe = noise.n2(cos * 1.7 + t * 0.9, sin * 1.7 - t * 0.4);
        const scale = profile * (1 + t * 0.34 * lobe + t * t * 0.12 * noise.n2(cos * 4.1, sin * 4.1 + 9));
        let px = rimX * scale;
        let pz = rimZ * scale;
        // Stratified ledges: warped horizontal bands that step outward.
        const warpedY = y + noise.fbm3(px * 0.16, y * 0.08, pz * 0.16, 2) * 0.9;
        const band = warpedY * 0.95 - Math.floor(warpedY * 0.95);
        const ledge = smoothstep(0.72, 0.94, band) - smoothstep(0.94, 1.0, band) * 0.6;
        const lipDamp = smoothstep(0.08, 0.6, depth);
        let radial = noise.fbm3(px * 0.38, y * 0.34, pz * 0.38, 4) * lerp(0.28, 0.9, t) * lipDamp
          + noise.n3(px * 1.7, y * 1.3, pz * 1.7) * 0.07 * lipDamp
          + ledge * 0.12 * (1 - t * 0.6) * lipDamp;
        radial += noise.n2(theta * 22, y * 0.2) * 0.03 * lipDamp;
        px += outward.x * radial;
        pz += outward.y * radial;
        y += noise.n3(px * 0.5, y * 0.2, pz * 0.5) * 0.14 * smoothstep(1.2, 2.5, depth);
        positions[offset] = px + driftX;
        positions[offset + 1] = y;
        positions[offset + 2] = pz + driftZ;
      }
      uvs[(ring * cols + col) * 2] = (col / SEG) * 18;
      uvs[(ring * cols + col) * 2 + 1] = positions[offset + 1] * 0.4;
    }
  }

  const indices = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let col = 0; col < SEG; col += 1) {
      const a = ring * cols + col;
      const b = (ring + 1) * cols + col;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  if (normals.getX(Math.floor(RINGS / 3) * cols) < 0) {
    // Ensure outward facing winding (column 0 sits on +x).
    const index = geometry.index.array;
    for (let item = 0; item < index.length; item += 3) [index[item + 1], index[item + 2]] = [index[item + 2], index[item + 1]];
    geometry.computeVertexNormals();
  }
  // Weld the seam normals.
  for (let ring = 0; ring <= RINGS; ring += 1) {
    const a = ring * cols;
    const b = ring * cols + SEG;
    const nx = normals.getX(a) + normals.getX(b);
    const ny = normals.getY(a) + normals.getY(b);
    const nz = normals.getZ(a) + normals.getZ(b);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.setXYZ(a, nx / length, ny / length, nz / length);
    normals.setXYZ(b, nx / length, ny / length, nz / length);
  }

  const waterfallTheta = world.waterfall.theta;
  paintVertices(geometry, (color, x, y, z, nx, ny, nz) => {
    const depth = TOP - y;
    const seele = x < 0;
    const t = clamp((depth - 1.05) / (CLIFF_DEPTH - 1.05), 0, 1);
    const grain = noise.n3(x * 2.2, y * 2.2, z * 2.2) * 0.5 + 0.5;
    // Strata palette.
    const bandNoise = noise.n2(y * 1.35 + noise.n3(x * 0.2, y * 0.3, z * 0.2) * 1.4, 3.3) * 0.5 + 0.5;
    const sand = [0.93, 0.8, 0.64];
    const grey = [0.66, 0.64, 0.62];
    const rust = [0.84, 0.6, 0.46];
    let r; let g; let b;
    if (bandNoise < 0.45) {
      const k = bandNoise / 0.45;
      r = lerp(grey[0], sand[0], k); g = lerp(grey[1], sand[1], k); b = lerp(grey[2], sand[2], k);
    } else {
      const k = (bandNoise - 0.45) / 0.55;
      r = lerp(sand[0], rust[0], k); g = lerp(sand[1], rust[1], k); b = lerp(sand[2], rust[2], k);
    }
    const shade = 0.78 + grain * 0.32;
    r *= shade; g *= shade; b *= shade;
    // Soil band with roots under the turf.
    const soil = 1 - smoothstep(0.32, 0.62, depth + noise.n2(x * 3, z * 3) * 0.08);
    const soilColor = seele ? [0.34, 0.24, 0.16] : [0.3, 0.28, 0.27];
    r = lerp(r, soilColor[0], soil); g = lerp(g, soilColor[1], soil); b = lerp(b, soilColor[2], soil);
    // Turf / curb lip.
    const lip = 1 - smoothstep(0.03, 0.11, depth);
    const lipColor = seele ? [0.36, 0.52, 0.2] : [0.46, 0.46, 0.47];
    r = lerp(r, lipColor[0], lip); g = lerp(g, lipColor[1], lip); b = lerp(b, lipColor[2], lip);
    // Moss on ledges that face the sky.
    const moss = smoothstep(0.2, 0.7, ny) * (seele ? 0.9 : 0.35) * (1 - lip) * smoothstep(0.1, 0.8, depth);
    r = lerp(r, 0.42, moss); g = lerp(g, 0.55, moss); b = lerp(b, 0.24, moss);
    // Dark wet streak below the waterfall.
    const theta = Math.atan2(z / RZ, x / RX);
    const wet = smoothstep(0.12, 0.02, Math.abs(theta - waterfallTheta)) * smoothstep(0.05, 0.3, depth);
    r = lerp(r, 0.28, wet * 0.8); g = lerp(g, 0.36, wet * 0.8); b = lerp(b, 0.26, wet * 0.8);
    // Gehirn half: cooler, stained stone.
    if (!seele) { r *= 0.8; g *= 0.82; b *= 0.9; }
    // Ambient occlusion towards the tip and in overhangs.
    const occlusion = lerp(1, 0.46, Math.pow(t, 0.8)) * (0.8 + 0.2 * smoothstep(-0.6, 0.2, ny));
    color.setRGB(r * occlusion, g * occlusion, b * occlusion);
  });

  const sample = (theta, depth) => {
    const wrapped = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
    const colFloat = wrapped * SEG;
    const col = Math.floor(colFloat);
    const fc = colFloat - col;
    let ring = 0;
    while (ring < RINGS - 1 && depths[ring + 1] < depth) ring += 1;
    const fr = clamp((depth - depths[ring]) / (depths[ring + 1] - depths[ring]), 0, 1);
    const out = { position: new THREE.Vector3(), normal: new THREE.Vector3() };
    const corners = [[ring, col, (1 - fr) * (1 - fc)], [ring, col + 1, (1 - fr) * fc], [ring + 1, col, fr * (1 - fc)], [ring + 1, col + 1, fr * fc]];
    for (const [r, c, w] of corners) {
      const index = r * cols + c;
      out.position.x += positions[index * 3] * w;
      out.position.y += positions[index * 3 + 1] * w;
      out.position.z += positions[index * 3 + 2] * w;
      out.normal.x += normals.getX(index) * w;
      out.normal.y += normals.getY(index) * w;
      out.normal.z += normals.getZ(index) * w;
    }
    out.normal.normalize();
    return out;
  };

  return { geometry, sample };
}

function buildStalactites(world, rockBatch, sample) {
  const random = rng(8841);
  const count = world.quality.low ? 9 : 16;
  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const depth = 2.6 + random() * 4.2;
    const anchor = sample(theta, depth);
    const length = 1.1 + random() * 2.6 * (1 - depth / 12);
    const radius = 0.22 + random() * 0.38;
    const geometry = new THREE.ConeGeometry(radius, length, 9, 6, true);
    geometry.translate(0, -length / 2, 0);
    const position = geometry.attributes.position;
    for (let item = 0; item < position.count; item += 1) {
      const x = position.getX(item);
      const y = position.getY(item);
      const z = position.getZ(item);
      const n = noise.n3(x * 3 + index, y * 1.4, z * 3) * 0.3 + 1;
      position.setXYZ(item, x * n + Math.sin(y * 1.3 + index) * 0.08, y, z * n);
    }
    geometry.computeVertexNormals();
    paintVertices(geometry, (color, x, y) => {
      const k = smoothstep(0, -length, y);
      color.setRGB(lerp(0.55, 0.3, k), lerp(0.5, 0.28, k), lerp(0.46, 0.28, k));
    });
    const inward = anchor.normal.clone().multiplyScalar(-radius * 0.9);
    rockBatch.add(geometry, matrixFrom(
      [anchor.position.x + inward.x, anchor.position.y + 0.2, anchor.position.z + inward.z],
      [(random() - 0.5) * 0.2, random() * Math.PI, (random() - 0.5) * 0.2],
    ), null, { worldUV: 0 });
  }
}

/** One mesh for both halves of the top surface, split into two material groups. */
function buildGround(world) {
  const low = world.quality.low;
  const RINGS = low ? 46 : 74;
  const SEG = low ? 176 : 264;
  const positions = [0, terrainHeight(0, 0), 0];
  const uvs = [0, 0];
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const radius = ring / RINGS;
    for (let seg = 0; seg < SEG; seg += 1) {
      const theta = (seg / SEG) * Math.PI * 2;
      const factor = rimFactor(theta);
      const x = Math.cos(theta) * RX * factor * radius;
      const z = Math.sin(theta) * RZ * factor * radius;
      positions.push(x, terrainHeight(x, z), z);
      uvs.push(x, z);
    }
  }
  const seele = [];
  const gehirn = [];
  const vertex = (ring, seg) => (ring === 0 ? 0 : 1 + (ring - 1) * SEG + (seg % SEG));
  const push = (a, b, c) => {
    const centroidX = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
    (centroidX < 0 ? seele : gehirn).push(a, c, b);
  };
  for (let seg = 0; seg < SEG; seg += 1) push(0, vertex(1, seg), vertex(1, seg + 1));
  for (let ring = 1; ring < RINGS; ring += 1) {
    for (let seg = 0; seg < SEG; seg += 1) {
      const a = vertex(ring, seg);
      const b = vertex(ring, seg + 1);
      const c = vertex(ring + 1, seg);
      const d = vertex(ring + 1, seg + 1);
      push(a, c, b);
      push(b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([...seele, ...gehirn]);
  geometry.addGroup(0, seele.length, 0);
  geometry.addGroup(seele.length, gehirn.length, 1);
  geometry.computeVertexNormals();
  if (geometry.attributes.normal.getY(0) < 0) {
    const index = geometry.index.array;
    for (let item = 0; item < index.length; item += 3) [index[item + 1], index[item + 2]] = [index[item + 2], index[item + 1]];
    geometry.computeVertexNormals();
  }

  const shadeTargets = [
    ...JUNGLE_TREES.map(([x, z, s]) => [x, z, 1.5 * s + 0.4, 0.45]),
    ...PALMS.map(([x, z]) => [x, z, 0.9, 0.3]),
    [CHAPEL.x, CHAPEL.z, 2.4, 0.25],
  ];
  paintVertices(geometry, (color, x, y, z) => {
    if (x >= 0) {
      const onRoad = x > ROAD.x0 && x < ROAD.x1 ? 0.82 : 1;
      const stain = 0.86 + noise.fbm2(x * 0.8, z * 0.8, 3) * 0.3;
      color.setScalar(stain * onRoad);
      return;
    }
    const patch = noise.fbm2(x * 0.45 + 4, z * 0.45, 3) * 0.5 + 0.5;
    const fine = noise.n2(x * 3.1, z * 3.1) * 0.5 + 0.5;
    let r = lerp(0.46, 0.7, patch) * (0.88 + fine * 0.2);
    let g = lerp(0.68, 0.78, patch) * (0.9 + fine * 0.16);
    let b = lerp(0.26, 0.3, patch);
    const height = y - TOP;
    r += height * 0.2; g += height * 0.08;
    const water = waterDistance(x, z);
    const bank = smoothstep(0.42, 0.02, water);
    r = lerp(r, 0.42, bank); g = lerp(g, 0.4, bank); b = lerp(b, 0.24, bank);
    if (water < 0.02) {
      const deep = smoothstep(0.02, -0.4, water);
      r = lerp(0.6, 0.3, deep); g = lerp(0.54, 0.32, deep); b = lerp(0.38, 0.24, deep);
    }
    const path = smoothstep(0.42, 0.18, Math.min(pathDistance(SEELE_PATH, x, z), pathDistance(SIDE_PATH, x, z) + 0.08) + noise.n2(x * 5, z * 5) * 0.08);
    r = lerp(r, 0.62, path); g = lerp(g, 0.5, path); b = lerp(b, 0.34, path);
    const forecourt = smoothstep(0.95, 0.55, Math.hypot(x - (CHAPEL.x + 0.02), z - (CHAPEL.z + 2.35)));
    r = lerp(r, 0.74, forecourt); g = lerp(g, 0.68, forecourt); b = lerp(b, 0.56, forecourt);
    let shade = 1;
    for (const [sx, sz, radius, strength] of shadeTargets) {
      shade *= 1 - strength * smoothstep(radius, radius * 0.25, Math.hypot(x - sx, z - sz));
    }
    const rim = 1 - 0.18 * smoothstep(0.5, 0.0, rimDistance(x, z));
    color.setRGB(r * shade * rim, g * shade * rim, b * shade * rim);
  });
  return geometry;
}

function buildWater(world) {
  const step = world.quality.low ? 0.1 : 0.065;
  const x0 = POND.x - POND.rx - 0.45;
  const x1 = POND.x + POND.rx + 0.45;
  const z0 = POND.z - POND.rz - 0.45;
  const z1 = RZ + 0.2;
  const nx = Math.ceil((x1 - x0) / step);
  const nz = Math.ceil((z1 - z0) / step);
  const positions = [];
  const depth = [];
  const flow = [];
  const keep = [];
  for (let iz = 0; iz <= nz; iz += 1) {
    for (let ix = 0; ix <= nx; ix += 1) {
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      positions.push(x, WATER_Y, z);
      const ground = terrainHeight(x, z);
      depth.push(clamp((WATER_Y - ground) / 0.2, 0, 1));
      flow.push(smoothstep(STREAM_START - 0.35, STREAM_START + 0.5, z) * smoothstep(0.2, -0.1, waterDistance(x, z) - 0.0));
      keep.push(waterDistance(x, z) < 0.26 && insideIsland(x, z, 0.03));
    }
  }
  const indices = [];
  const row = nx + 1;
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (keep[a] && keep[b] && keep[c]) indices.push(a, c, b);
      if (keep[b] && keep[c] && keep[d]) indices.push(b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
  geometry.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uEnv: { value: null },
        uNormals: { value: world.textures.waterNormals },
        uSunDir: { value: new THREE.Vector3(-0.6, 0.62, 0.45).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.78, 0.5) },
        uDeep: { value: new THREE.Color(0x0b3a3c) },
        uShallow: { value: new THREE.Color(0x3f8f7c) },
        uEnvIntensity: { value: 1 },
        uLight: { value: 1 },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float aDepth;
      attribute float aFlow;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vFlow;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vDepth = aDepth;
        vFlow = aFlow;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform samplerCube uEnv;
      uniform sampler2D uNormals;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uEnvIntensity;
      uniform float uLight;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vFlow;
      #include <common>
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main() {
        vec2 uv = vWorld.xz;
        vec2 flow = vec2(0.02, -1.0) * vFlow;
        vec3 n1 = texture2D(uNormals, uv * 0.42 + vec2(uTime * 0.018, uTime * 0.012) + flow * uTime * 0.55).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormals, uv * 1.15 - vec2(uTime * 0.026, -uTime * 0.021) + flow * uTime * 0.9).xyz * 2.0 - 1.0;
        vec3 normal = normalize(vec3(n1.x + n2.x, 3.2 - vFlow * 1.2, n1.y + n2.y));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float facing = max(dot(normal, viewDir), 0.0);
        float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);
        vec3 reflected = reflect(-viewDir, normal);
        vec3 env = textureCube(uEnv, reflected).rgb * uEnvIntensity;
        float depth = smoothstep(0.0, 1.0, vDepth);
        vec3 body = mix(uShallow, uDeep, depth) * uLight;
        float caustic = ffNoise2(uv * 6.0 + vec2(uTime * 0.4, -uTime * 0.3)) * ffNoise2(uv * 4.3 - vec2(uTime * 0.25, uTime * 0.2));
        body += uShallow * caustic * (1.0 - depth) * 0.6 * uLight;
        vec3 color = mix(body, env, fresnel);
        float sun = pow(max(dot(reflected, uSunDir), 0.0), 380.0);
        color += uSunColor * sun * 6.0;
        float rapids = vFlow * smoothstep(0.55, 0.85, ffNoise2(vec2(uv.x * 7.0, uv.y * 2.4 - uTime * 2.6)));
        float shore = 1.0 - smoothstep(0.0, 0.22, vDepth);
        float foamNoise = ffNoise2(uv * 18.0 + uTime * 0.3);
        float foam = max(rapids * 0.8, shore * smoothstep(0.35, 0.8, foamNoise) * 0.7);
        color = mix(color, vec3(0.92, 0.96, 0.95) * uLight, foam);
        float alpha = mix(0.55, 0.93, depth);
        alpha = max(alpha, fresnel * 0.9);
        alpha *= smoothstep(0.0, 0.08, vDepth + 0.02);
        alpha = max(alpha, foam);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.uniforms.uTime = world.uniforms.time;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.name = "water";
  return mesh;
}

function findWaterfall() {
  let best = null;
  for (let step = 0; step <= 400; step += 1) {
    const theta = Math.PI * 0.5 + (step / 400) * Math.PI * 0.5;
    const factor = rimFactor(theta);
    const x = Math.cos(theta) * RX * factor;
    const z = Math.sin(theta) * RZ * factor;
    const miss = Math.abs(x - streamCenter(z));
    if (!best || miss < best.miss) best = { theta, x, z, miss };
  }
  const outward = new THREE.Vector3(Math.cos(best.theta) * RZ, 0, Math.sin(best.theta) * RX).normalize();
  return { ...best, outward, width: streamHalfWidth(best.z) * 2 };
}

function buildWaterfall(world) {
  const fall = world.waterfall;
  const layers = world.quality.low ? 1 : 2;
  const rows = 56;
  const cols = 8;
  const length = 7.6;
  const positions = [];
  const uvs = [];
  const fades = [];
  const layerAttr = [];
  const indices = [];
  const side = new THREE.Vector3(fall.outward.z, 0, -fall.outward.x);
  const start = new THREE.Vector3(fall.x, WATER_Y, fall.z).addScaledVector(fall.outward, -0.2);
  for (let layer = 0; layer < layers; layer += 1) {
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row += 1) {
      const s = row / rows;
      const drop = length * Math.pow(s, 1.55);
      const out = 0.2 * smoothstep(0, 0.06, drop) + 0.95 * Math.sqrt((2 * drop) / 9.8) + layer * 0.06 * smoothstep(0, 0.5, drop);
      const width = (fall.width * 0.92 + drop * 0.11) * (1 + layer * 0.45);
      const wobble = Math.sin(drop * 0.8) * 0.08;
      for (let col = 0; col <= cols; col += 1) {
        const across = col / cols - 0.5;
        const p = start.clone()
          .addScaledVector(fall.outward, out - across * across * 0.18 * smoothstep(0, 0.4, drop))
          .addScaledVector(side, across * width + wobble);
        p.y -= drop + (drop < 0.02 ? 0 : 0.01);
        positions.push(p.x, p.y, p.z);
        uvs.push(col / cols, drop);
        fades.push(drop / length);
        layerAttr.push(layer);
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const a = base + row * (cols + 1) + col;
        const b = a + cols + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aFade", new THREE.Float32BufferAttribute(fades, 1));
  geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layerAttr, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTint: { value: new THREE.Color(0xcfe9e6) },
      uLight: { value: 1 },
    }]),
    vertexShader: /* glsl */ `
      attribute float aFade;
      attribute float aLayer;
      varying vec2 vUv;
      varying float vFade;
      varying float vLayer;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vFade = aFade;
        vLayer = aLayer;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTint;
      uniform float uLight;
      varying vec2 vUv;
      varying float vFade;
      varying float vLayer;
      #include <common>
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main() {
        float speed = 3.4 + vLayer * 0.8;
        float streak = ffNoise2(vec2(vUv.x * (13.0 + vLayer * 9.0), vUv.y * 0.9 - uTime * speed));
        float fine = ffNoise2(vec2(vUv.x * 37.0, vUv.y * 2.6 - uTime * speed * 1.4));
        float foam = smoothstep(0.32, 0.92, streak * 0.62 + fine * 0.48);
        float ragged = ffNoise2(vec2(vUv.y * 2.3 - uTime * 2.0, vLayer * 7.0)) * 0.22;
        float edge = smoothstep(0.0, 0.16 + ragged, vUv.x) * smoothstep(1.0, 0.84 - ragged, vUv.x);
        float fade = 1.0 - smoothstep(0.35, 1.0, vFade);
        float breakup = smoothstep(0.1, 0.55, ffNoise2(vec2(vUv.x * 6.0, vUv.y * 0.7 - uTime * 2.2)) + (1.0 - vFade) * 0.5);
        float alpha = edge * fade * breakup * mix(0.42, 0.96, foam) * (vLayer > 0.5 ? 0.42 : 0.9);
        vec3 color = mix(uTint * 0.72, vec3(1.0), foam) * uLight;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.uniforms.uTime = world.uniforms.time;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;
  mesh.name = "waterfall";
  world.mist.push(
    { position: start.clone().addScaledVector(fall.outward, 0.3).setY(WATER_Y - 0.25), size: 1.3, alpha: 0.55 },
    { position: start.clone().addScaledVector(fall.outward, 1.2).setY(-3.8), size: 2.6, alpha: 0.4 },
    { position: start.clone().addScaledVector(fall.outward, 1.5).setY(-5.8), size: 3.6, alpha: 0.55 },
    { position: start.clone().addScaledVector(fall.outward, 1.7).addScaledVector(side, 0.9).setY(-6.9), size: 4.2, alpha: 0.45 },
  );
  return mesh;
}

/** Roots and vines on Seele's side, pipes and cables on Gehirn's side. */
function buildUndersideDetails(world, sample) {
  const random = rng(5151);
  const roots = world.batch("roots");
  const foliage = world.batch("foliage");
  const low = world.quality.low;
  // Small pointed leaf (two triangles), hanging from the vine.
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.03, -0.05, 0.01, 0, -0.11, 0, 0, 0, 0, 0, -0.11, 0, -0.03, -0.05, 0.01], 3));
  leaf.computeVertexNormals();
  const rootCount = low ? 26 : 46;
  for (let index = 0; index < rootCount; index += 1) {
    const theta = Math.PI * (0.52 + random() * 0.96);
    if (Math.abs(theta - world.waterfall.theta) < 0.07) continue;
    const startDepth = 0.18 + random() * 0.4;
    const anchor = sample(theta, startDepth);
    const length = 0.6 + Math.pow(random(), 1.6) * 3.4;
    const vine = random() < 0.32;
    const points = [];
    const drift = new THREE.Vector3((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3);
    const steps = 7;
    for (let step = 0; step <= steps; step += 1) {
      const k = step / steps;
      const depth = startDepth + k * length;
      const wall = sample(theta, depth);
      const p = anchor.position.clone().addScaledVector(anchor.normal, 0.02).addScaledVector(drift, k * k);
      p.y = TOP - depth - (vine ? 0 : 0.05);
      const wallRadius = Math.hypot(wall.position.x, wall.position.z);
      const rootRadius = Math.hypot(p.x, p.z);
      if (rootRadius < wallRadius + 0.04) {
        const pushOut = wallRadius + 0.04 - rootRadius;
        p.x += (p.x / rootRadius) * pushOut;
        p.z += (p.z / rootRadius) * pushOut;
      }
      if (step > 0 && step < steps) {
        p.x += Math.sin(step * 1.7 + index) * 0.05;
        p.z += Math.cos(step * 1.3 + index) * 0.05;
      }
      points.push(p);
    }
    const thickness = vine ? 0.02 : 0.018 + random() * 0.03;
    const tube = taperedTube(points, thickness, vine ? 0.01 : 0.003, { radial: 5, segments: 14 });
    roots.add(tube, null, vine ? 0x4f6a36 : new THREE.Color().setHSL(0.07 + random() * 0.03, 0.3, 0.3 + random() * 0.14));
    if (vine) {
      const curve = new THREE.CatmullRomCurve3(points);
      const leaves = Math.floor(length * 16);
      for (let item = 0; item < leaves; item += 1) {
        const t = (item + random() * 0.5) / leaves;
        const p = curve.getPointAt(Math.min(t, 1));
        const color = new THREE.Color().setHSL(0.25 + random() * 0.07, 0.42 + random() * 0.2, 0.2 + random() * 0.12);
        foliage.add(leaf, matrixFrom([p.x, p.y, p.z], [(random() - 0.5) * 0.8, random() * Math.PI * 2, (random() - 0.5) * 0.8], 0.8 + random() * 0.6), color);
      }
    }
  }

  // Gehirn: infrastructure bored into the rock.
  const metal = world.batch("pipes");
  const neonPink = world.batch("neonPink");
  const neonCyan = world.batch("neonCyan");
  const pipeCount = low ? 5 : 8;
  for (let index = 0; index < pipeCount; index += 1) {
    const theta = -Math.PI * 0.42 + random() * Math.PI * 0.84;
    const depth = 0.9 + random() * 2.2;
    const anchor = sample(theta, depth);
    const out = anchor.normal.clone().setY(0).normalize();
    const drop = 0.7 + random() * 2.2;
    const radius = 0.05 + random() * 0.05;
    const p0 = anchor.position.clone().addScaledVector(out, -0.2);
    const p1 = anchor.position.clone().addScaledVector(out, 0.28);
    const p2 = anchor.position.clone().addScaledVector(out, 0.5).add(new THREE.Vector3(0, -0.22, 0));
    const p3 = anchor.position.clone().addScaledVector(out, 0.56).add(new THREE.Vector3(0, -drop, 0));
    metal.add(taperedTube([p0, p1, p2, p3], radius, radius, { radial: 8, segments: 18 }), null, random() < 0.5 ? 0x5a4c44 : 0x3c4148);
    const flange = new THREE.TorusGeometry(radius * 1.25, radius * 0.35, 6, 12);
    metal.add(flange, matrixFrom([p3.x, p3.y + 0.04, p3.z], [Math.PI / 2, 0, 0]), 0x2b2e33);
    metal.add(flange, matrixFrom([p1.x, p1.y, p1.z], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)), 0x2b2e33);
  }
  const cableCount = low ? 7 : 13;
  for (let index = 0; index < cableCount; index += 1) {
    const theta = -Math.PI * 0.45 + random() * Math.PI * 0.9;
    const depthA = 0.5 + random() * 2.4;
    const a = sample(theta, depthA);
    const b = sample(theta + 0.12 + random() * 0.35, depthA + (random() - 0.5) * 0.8);
    const sag = 0.35 + random() * 1.1;
    const mid = a.position.clone().lerp(b.position, 0.5).addScaledVector(a.normal.clone().add(b.normal).normalize(), 0.18);
    mid.y -= sag;
    const points = [a.position.clone().addScaledVector(a.normal, -0.05), a.position.clone().lerp(mid, 0.5).setY(lerp(a.position.y, mid.y, 0.7)), mid, b.position.clone().lerp(mid, 0.5).setY(lerp(b.position.y, mid.y, 0.7)), b.position.clone().addScaledVector(b.normal, -0.05)];
    metal.add(taperedTube(points, 0.016, 0.016, { radial: 4, segments: 16 }), null, 0x16171b);
  }
  const strip = new THREE.BoxGeometry(0.62, 0.045, 0.05);
  const stripCount = low ? 6 : 12;
  for (let index = 0; index < stripCount; index += 1) {
    const theta = -Math.PI * 0.46 + random() * Math.PI * 0.92;
    const anchor = sample(theta, 0.8 + random() * 3.2);
    const out = anchor.normal.clone().setY(0).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
    const p = anchor.position.clone().addScaledVector(out, 0.02);
    (index % 2 ? neonPink : neonCyan).add(strip, matrixFrom([p.x, p.y, p.z], quaternion, [0.5 + random() * 0.9, 1, 1]));
  }
}

/** Tiny stories on the floating rocks: a wind-bent tree, a lonely torii, a vending machine. */
function decorateIslet(world, group, spec, index) {
  const random = rng(700 + index);
  const deco = new Batch("isletDeco");
  const glow = new Batch("isletGlow");
  const size = spec.size;
  if (spec.seele) {
    const lean = (random() - 0.5) * 0.5;
    const height = 0.7 + size * 0.9;
    deco.add(taperedTube([[0, -0.05, 0], [lean * 0.3, height * 0.5, 0.05], [lean, height, 0]], 0.06 * size + 0.02, 0.02, { radial: 6, segments: 8 }), null, 0x5a4230);
    for (let blob = 0; blob < 9; blob += 1) {
      const leaf = smoothIcosahedron(0.2 + random() * 0.13, 2);
      const position = leaf.attributes.position;
      for (let item = 0; item < position.count; item += 1) {
        const n = 1 + noise.n3(position.getX(item) * 6 + blob, position.getY(item) * 6, position.getZ(item) * 6) * 0.25;
        position.setXYZ(item, position.getX(item) * n, position.getY(item) * n * 0.8, position.getZ(item) * n);
      }
      leaf.computeVertexNormals();
      paintVertices(leaf, (color, x, y) => {
        const shade = 0.55 + smoothstep(-0.25, 0.25, y) * 0.45;
        color.setScalar(shade);
      });
      deco.add(leaf, matrixFrom([lean + (random() - 0.5) * 0.55, height + (random() - 0.3) * 0.32, (random() - 0.5) * 0.5]), new THREE.Color().setHSL(0.26 + random() * 0.05, 0.42, 0.22 + random() * 0.08));
    }
    const tuft = grassTuft(rng(40 + index), 6);
    for (let item = 0; item < 26; item += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * size * 0.9;
      deco.add(tuft, matrixFrom([Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius * 0.8], [0, random() * 6, 0], [1, 0.18 + random() * 0.1, 1]), new THREE.Color().setHSL(0.25, 0.4, 0.55));
    }
  } else if (index % 3 === 1) {
    // A lonely vending machine glowing in the void.
    deco.add(new THREE.BoxGeometry(0.34, 0.66, 0.26), matrixFrom([0, 0.33, 0]), 0xd8262e);
    glow.add(new THREE.PlaneGeometry(0.28, 0.46), matrixFrom([0, 0.36, 0.131]), new THREE.Color(1.6, 1.7, 1.8));
  } else if (index % 3 === 2) {
    deco.add(new THREE.CylinderGeometry(0.015, 0.03, 1.4, 5), matrixFrom([0, 0.7, 0]), 0x3a3d44);
    for (const y of [0.45, 0.85]) deco.add(new THREE.BoxGeometry(0.3, 0.02, 0.02), matrixFrom([0, y, 0]), 0x3a3d44);
    glow.add(new THREE.SphereGeometry(0.04, 8, 6), matrixFrom([0, 1.42, 0]), new THREE.Color(4.5, 0.4, 0.3));
  } else {
    for (const side of [-1, 1]) {
      deco.add(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 8), matrixFrom([side * 0.3, 0.4, 0]), 0xa3221c);
    }
    deco.add(new THREE.BoxGeometry(0.8, 0.05, 0.05), matrixFrom([0, 0.64, 0]), 0xa3221c);
    deco.add(new THREE.BoxGeometry(0.95, 0.06, 0.08), matrixFrom([0, 0.8, 0]), 0x151515);
    glow.add(new THREE.BoxGeometry(0.08, 0.1, 0.08), matrixFrom([0.45, 0.28, 0.2]), new THREE.Color(3.2, 1.9, 0.9));
    deco.add(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 6), matrixFrom([0.45, 0.11, 0.2]), 0x8f8d88);
  }
  const decoMesh = deco.mesh(world.materials.isletDeco, { castShadow: false });
  if (decoMesh) group.add(decoMesh);
  const glowMesh = glow.mesh(world.materials.isletGlow, { castShadow: false, receiveShadow: false });
  if (glowMesh) group.add(glowMesh);
}

function buildIslets(world) {
  world.materials.isletDeco = new THREE.MeshStandardMaterial({ name: "isletDeco", vertexColors: true, roughness: 0.8 });
  world.materials.isletGlow = new THREE.MeshBasicMaterial({ name: "isletGlow", vertexColors: true });
  const random = rng(4040);
  const specs = [
    { angle: 2.55, radius: 11.4, y: -1.2, size: 1.05, seele: true },
    { angle: 3.55, radius: 12.2, y: 1.6, size: 0.7, seele: true },
    { angle: 1.85, radius: 10.4, y: -4.4, size: 0.55, seele: true },
    { angle: 4.1, radius: 10.8, y: -3.2, size: 0.8, seele: true },
    { angle: 0.35, radius: 11.6, y: -0.6, size: 0.95, seele: false },
    { angle: 5.6, radius: 12.3, y: 2.0, size: 0.62, seele: false },
    { angle: 1.1, radius: 10.2, y: -4.8, size: 0.5, seele: false },
  ].slice(0, world.quality.low ? 4 : 7);
  const islets = [];
  for (const spec of specs) {
    const size = spec.size;
    const seg = 26;
    const rings = 12;
    const positions = [];
    const indices = [];
    const cols = seg + 1;
    positions.push(0, 0.06 * size, 0);
    for (let ring = 0; ring <= rings; ring += 1) {
      const v = ring / rings;
      for (let col = 0; col <= seg; col += 1) {
        const theta = ((col % seg) / seg) * Math.PI * 2;
        const top = ring === 0;
        const depth = top ? 0 : size * 2.4 * Math.pow(v, 1.15);
        const profile = top ? 1 : Math.pow(Math.max(0, 1 - v), 0.7) * (1 + 0.06 * Math.sin(v * Math.PI));
        const n = noise.n3(Math.cos(theta) * 1.6 + spec.angle * 3, depth * 0.9, Math.sin(theta) * 1.6) * 0.35 * (top ? 0.25 : 1);
        const radius = size * (1 + n) * profile;
        positions.push(Math.cos(theta) * radius, -depth, Math.sin(theta) * radius * 0.82);
      }
    }
    for (let col = 0; col < seg; col += 1) indices.push(0, 1 + col + 1, 1 + col);
    for (let ring = 0; ring < rings; ring += 1) {
      for (let col = 0; col < seg; col += 1) {
        const a = 1 + ring * cols + col;
        const b = a + cols;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    paintVertices(geometry, (color, x, y, z, nx, ny) => {
      const k = clamp(-y / (size * 2.4), 0, 1);
      if (ny > 0.55 && y > -0.12 * size) {
        if (spec.seele) color.setRGB(0.42, 0.62, 0.24);
        else color.setRGB(0.4, 0.4, 0.42);
      } else {
        const grain = noise.n3(x * 3, y * 3, z * 3) * 0.15;
        color.setRGB((0.78 + grain) * (1 - k * 0.5), (0.68 + grain) * (1 - k * 0.52), (0.58 + grain) * (1 - k * 0.5));
        if (!spec.seele) color.multiplyScalar(0.8);
      }
    });
    const uv = new Float32Array((positions.length / 3) * 2);
    for (let item = 0; item < positions.length / 3; item += 1) {
      uv[item * 2] = Math.atan2(positions[item * 3 + 2], positions[item * 3]) * 0.9;
      uv[item * 2 + 1] = positions[item * 3 + 1] * 0.45;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const group = new THREE.Group();
    const rock = new THREE.Mesh(geometry, world.materials.rock);
    group.add(rock);
    group.position.set(Math.cos(spec.angle) * spec.radius, spec.y, Math.sin(spec.angle) * spec.radius * 0.78);
    group.rotation.y = random() * Math.PI * 2;
    group.userData = { ...spec, baseY: spec.y, phase: random() * Math.PI * 2 };
    decorateIslet(world, group, spec, islets.length);
    world.scene.add(group);
    islets.push(group);
  }
  world.islets = islets;
  world.updates.push((elapsed) => {
    for (const islet of islets) {
      const { baseY, phase } = islet.userData;
      islet.position.y = baseY + Math.sin(elapsed * 0.42 + phase) * 0.16;
      islet.rotation.z = Math.sin(elapsed * 0.3 + phase) * 0.018;
    }
  });
}

export function buildIsland(world) {
  const { textures, quality } = world;
  world.waterfall = findWaterfall();

  const rockMaterial = new THREE.MeshStandardMaterial({
    name: "rock",
    color: 0xffffff,
    map: textures.rock,
    normalMap: textures.rockNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.94,
    vertexColors: true,
  });
  world.materials.rock = rockMaterial;
  const rockBatch = world.batch("rock", rockMaterial, { castShadow: !quality.low });

  const cliff = buildCliff(world);
  world.cliffSample = cliff.sample;
  rockBatch.add(cliff.geometry);
  buildStalactites(world, rockBatch, cliff.sample);

  // Ground: meadow on the Seele half, wet asphalt on the Gehirn half.
  const groundGeometry = buildGround(world);
  const seeleGround = new THREE.MeshStandardMaterial({
    name: "seeleGround",
    map: textures.meadow,
    normalMap: textures.forestNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.95,
    vertexColors: true,
  });
  const ground = new THREE.Mesh(groundGeometry, [seeleGround, world.materials.street]);
  ground.name = "ground";
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false;
  world.scene.add(ground);
  world.ground = ground;

  const water = buildWater(world);
  world.scene.add(water);
  world.water = water;
  world.scene.add(buildWaterfall(world));
  buildUndersideDetails(world, cliff.sample);
  buildIslets(world);
}
