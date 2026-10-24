/**
 * Floating islands for the overworld, built like the flofischer.org diorama: one dense top surface with noise hills,
 * colours and ambient occlusion painted into vertex colours, a layered rock underside that tapers into lobes and a
 * tip with roots or icicles hanging from it, a pond whose stream runs over the rim as a waterfall (lava on the Ember
 * Isles, ice on Frostpeak), wind-blown grass and flowers, the world's sculpted props and landmark, and a few small
 * islets drifting next to it. Everything is merged or instanced, so an island is a few dozen draw calls.
 *
 * buildIsland({ theme, seed, rx, rz, nodes }) → Promise<{ group, heightAt(x, z), nodePositions, curve, landmark,
 *   update(t), uniforms }>
 */
import { THREE, LOW_GPU } from '../three-kit.js';
import { loadModel } from '../models.js';
import { createNoise, rng, smoothstep, lerp } from './noise.js';
import { THEMES } from './themes.js';

const TOP = 0;
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

export async function buildIsland({ theme = 'meadow', seed = 1, rx = 9, rz = 7, nodes = 11 } = {}) {
  const T = THEMES[theme];
  const noise = createNoise(seed);
  const rand = rng(seed * 31 + 7);
  const group = new THREE.Group();
  group.name = `island-${theme}`;
  const uniforms = { uTime: { value: 0 } };
  const animated = [];

  // ── outline, level path, pond and stream ──
  const rimFactor = (theta) => 1 + noise.n2(Math.cos(theta) * 1.3 + seed, Math.sin(theta) * 1.3) * 0.12 + noise.n2(Math.cos(theta) * 3.1, Math.sin(theta) * 3.1 - seed) * 0.05;
  const rimDistance = (x, z) => 1 - Math.hypot(x / (rx * rimFactor(Math.atan2(z / rz, x / rx))), z / (rz * rimFactor(Math.atan2(z / rz, x / rx))));
  const pathPts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    pathPts.push(new THREE.Vector2(lerp(-rx * 0.78, rx * 0.78, t), Math.sin(t * Math.PI * 1.6 + seed) * rz * 0.36 + noise.n2(t * 2, seed) * rz * 0.08));
  }
  const segDist = (x, z, ax, az, bx, bz) => {
    const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
    return Math.hypot(x - (ax + abx * t), z - (az + abz * t));
  };
  const pathDistance = (x, z) => {
    let best = Infinity;
    for (let i = 0; i < pathPts.length - 1; i++) best = Math.min(best, segDist(x, z, pathPts[i].x, pathPts[i].y, pathPts[i + 1].x, pathPts[i + 1].y));
    return best;
  };
  // the pond sits on the front half (towards the camera) where the path leaves the most room; its stream runs
  // straight out to the rim and falls over it
  let pond = { x: 0, z: rz * 0.5, r: 1.1 }, bestRoom = -1;
  for (let i = 0; i < 60; i++) {
    const x = (rand() * 2 - 1) * rx * 0.55, z = rz * (0.3 + rand() * 0.3);
    const room = Math.min(pathDistance(x, z), rimDistance(x, z) * rz * 1.2);
    if (room > bestRoom) { bestRoom = room; pond = { x, z, r: Math.min(1.25, Math.max(0.75, room * 0.55)) }; }
  }
  const fallTheta = Math.atan2(pond.z / rz, pond.x / rx);
  const fall = { x: Math.cos(fallTheta) * rx * rimFactor(fallTheta), z: Math.sin(fallTheta) * rz * rimFactor(fallTheta) };
  const streamHalf = 0.22;
  const waterDistance = (x, z) => Math.min(
    Math.hypot((x - pond.x) / 1.25, z - pond.z) - pond.r,
    segDist(x, z, pond.x, pond.z, fall.x * 1.05, fall.z * 1.05) - streamHalf * (1 + noise.n2(x * 1.3, z * 1.3) * 0.25),
  );
  const landmark = { x: rx * 0.12 * (seed % 2 ? 1 : -1), z: -rz * 0.55 };

  const baseHeight = (x, z) => {
    const rim = rimDistance(x, z);
    let h = TOP + noise.fbm2(x * 0.12, z * 0.12, 4) * T.hills + noise.n2(x * 0.5, z * 0.5) * 0.08;
    h += T.dome * smoothstep(0, 0.8, rim);
    h *= smoothstep(-0.02, 0.18, rim) * 0.85 + 0.15;
    const flat = smoothstep(1.2, 0.35, pathDistance(x, z));
    return lerp(h, TOP + T.dome * 0.55 * smoothstep(0, 0.8, rim) + 0.02, flat * 0.8);
  };
  const waterY = baseHeight(pond.x, pond.z) - 0.12;
  const heightAt = (x, z) => {
    let h = baseHeight(x, z);
    const w = waterDistance(x, z);
    // the water bed: banks slope into a basin below the water line; the stream bed follows it to the rim
    const bed = waterY - 0.22 - smoothstep(0, -0.8, w) * 0.15;
    h = lerp(h, Math.min(h, bed), smoothstep(0.55, -0.05, w));
    h = Math.min(h, lerp(h, waterY + 0.05, smoothstep(1.1, 0.3, w)));
    return h;
  };

  // ── top surface ──
  const RINGS = 76, SEG = 240;
  const pos = [0, heightAt(0, 0), 0];
  for (let r = 1; r <= RINGS; r++) {
    const rad = Math.pow(r / RINGS, 0.92);
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2, f = rimFactor(th);
      const x = Math.cos(th) * rx * f * rad, z = Math.sin(th) * rz * f * rad;
      pos.push(x, heightAt(x, z), z);
    }
  }
  const idx = [];
  const v = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * SEG + (s % SEG));
  for (let s = 0; s < SEG; s++) idx.push(0, v(1, s + 1), v(1, s));
  for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) { const a = v(r, s), b = v(r, s + 1), c = v(r + 1, s), d = v(r + 1, s + 1); idx.push(a, b, c, b, d, c); }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setIndex(idx);
  top.computeVertexNormals();

  // props are placed first: their footprints darken the ground (baked contact shadows) and keep grass away
  // the path's z at a given x (the path runs west to east): tall props keep out of the strip in front of it, where
  // they would hide the level nodes from the overworld camera
  const pathZ = (x) => { const t = Math.max(0, Math.min(pathPts.length - 1.001, ((x + rx * 0.78) / (rx * 1.56)) * (pathPts.length - 1))); const i = Math.floor(t), k = t - i; return lerp(pathPts[i].y, pathPts[i + 1].y, k); };
  const placed = await placeProps(T, { rx, rz, rimDistance, pathDistance, waterDistance, heightAt, rand, landmark, group, animated, pathZ });

  const col = new Float32Array(pos.length);
  const c = new THREE.Color(), wet = T.ground[0].clone().multiplyScalar(0.55), bedC = T.liquid.glow ? new THREE.Color(0x2a1a16) : T.soil.clone().lerp(new THREE.Color(0x6a8a8a), 0.3);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const patch = noise.fbm2(x * 0.3 + 4, z * 0.3, 3) * 0.5 + 0.5, fine = noise.n2(x * 2.7, z * 2.7) * 0.5 + 0.5;
    c.copy(T.ground[0]).lerp(T.ground[1], patch).multiplyScalar(0.9 + fine * 0.18);
    c.lerp(T.ground[2], smoothstep(0.3, 1.2, y - TOP) * 0.6);
    c.lerp(T.path, smoothstep(0.75, 0.3, pathDistance(x, z) + noise.n2(x * 4, z * 4) * 0.12) * 0.92);
    const w = waterDistance(x, z);
    c.lerp(wet, smoothstep(0.45, 0.05, w) * 0.7);
    c.lerp(bedC, smoothstep(0.05, -0.2, w));
    let shade = 1;
    for (const pr of placed.shade) shade *= 1 - pr.s * smoothstep(pr.r, pr.r * 0.2, Math.hypot(x - pr.x, z - pr.z));
    shade *= 1 - 0.22 * smoothstep(0.12, 0, rimDistance(x, z));
    c.multiplyScalar(shade);
    col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
  }
  top.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const topMesh = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  topMesh.receiveShadow = true;
  group.add(topMesh);

  // ── rock underside ──
  const DEPTH = Math.max(rx, rz) * 0.95;
  const cliff = buildCliff(T, { rx, rz, rimFactor, heightAt, noise, DEPTH });
  group.add(cliff.mesh);
  group.add(hangers(T, { rx, rz, rimFactor, noise, rand, DEPTH, fallTheta }));

  // ── water (or lava / ice): pond and stream surface, the fall over the rim, mist at its foot ──
  group.add(waterSurface(T, { pond, fall, waterDistance, rimDistance, waterY, uniforms }));
  const fallGroup = waterfall(T, { fall, pond, rimDistance, streamHalf, waterY, DEPTH, uniforms });
  group.add(fallGroup);

  // ── grass and flowers ──
  const taken = (x, z, r) => placed.spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r * r);
  if (T.grass && !LOW_GPU) group.add(grass(T, { rx, rz, rand, noise, rimDistance, pathDistance, waterDistance, heightAt, taken, uniforms }));
  if (T.flowers && !LOW_GPU) group.add(flowers(T, { rx, rz, rand, noise, rimDistance, pathDistance, waterDistance, heightAt, taken }));

  // ── small islets drifting next to the island ──
  group.add(await islets(T, { rx, rz, rand, noise, animated }));

  // ── level path: nodes and stepping stones ──
  const nodePositions = [];
  const curve = new THREE.CatmullRomCurve3(pathPts.map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.y), p.y)));
  for (let i = 0; i < nodes; i++) {
    const p = curve.getPoint(0.04 + (i / (nodes - 1)) * 0.92);
    p.y = heightAt(p.x, p.z);
    nodePositions.push(p);
  }
  const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.19, 0.07, 9), new THREE.MeshStandardMaterial({ color: T.stone, roughness: 0.85 }), 200);
  let ns = 0;
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 400 && ns < 200; i += 4) {
    const pt = curve.getPoint(0.04 + (i / 400) * 0.92);
    if (nodePositions.some((n) => n.distanceTo(pt) < 0.75)) continue;
    m4.makeRotationY(hash(pt.x, pt.z) * 6).setPosition(pt.x, heightAt(pt.x, pt.z) + 0.02, pt.z);
    stones.setMatrixAt(ns++, m4);
  }
  stones.count = ns; stones.receiveShadow = true;
  group.add(stones);

  return {
    group, heightAt, nodePositions, curve, landmark, uniforms,
    update(t) { uniforms.uTime.value = t; for (const a of animated) a(t); },
  };
}

// ─────────────────────────────── cliff ───────────────────────────────

function buildCliff(T, { rx, rz, rimFactor, heightAt, noise, DEPTH }) {
  const CR = 52, CS = 200;
  const cpos = [], ccol = [];
  const c = new THREE.Color();
  for (let r = 0; r <= CR; r++) {
    const vv = r / CR, depth = DEPTH * (0.22 * vv + 0.78 * vv * vv);
    const taper = depth < 0.7 ? 1 + 0.025 * Math.sin(depth * 4.5) : Math.pow(Math.max(0, 1 - (depth - 0.7) / (DEPTH - 0.7)), 0.55);
    const driftX = 0.5 * vv * vv, driftZ = -0.35 * vv * vv;
    for (let s = 0; s <= CS; s++) {
      const th = ((s % CS) / CS) * Math.PI * 2, f = rimFactor(th);
      const rimX = Math.cos(th) * rx * f, rimZ = Math.sin(th) * rz * f;
      const y = r === 0 ? heightAt(rimX * 0.999, rimZ * 0.999) : TOP - 0.05 - depth;
      // a few big lobes towards the bottom, strata ledges near the top, fine erosion everywhere
      const lobe = (noise.n2(Math.cos(th) * 1.4 + vv * 0.8, Math.sin(th) * 1.4) * 0.4 + noise.n2(Math.cos(th) * 3.2, Math.sin(th) * 3.2 + vv) * 0.15) * vv;
      const band = (y * 1.6) - Math.floor(y * 1.6);
      const ledge = (smoothstep(0.65, 0.9, band) - smoothstep(0.9, 1, band) * 0.7) * 0.12 * (1 - vv);
      const radial = (noise.fbm3(rimX * 0.35, y * 0.45, rimZ * 0.35, 4) * lerp(0.2, 0.75, vv) + ledge) * smoothstep(0, 0.25, depth);
      const scale = taper * (1 + lobe) + radial / Math.max(rx, rz);
      // the tip is one point (no fins where the columns meet)
      const jitter = noise.n3(rimX * 0.4, y * 0.3, rimZ * 0.4) * 0.25 * vv * (1 - smoothstep(0.85, 1, vv));
      cpos.push(r === CR ? driftX : rimX * scale + driftX, y + jitter, r === CR ? driftZ : rimZ * scale + driftZ);
      const strata = Math.sin(y * 5.5 + noise.n2(th * 3, y) * 1.2) * 0.5 + 0.5;
      c.copy(T.rock[0]).lerp(T.rock[1], smoothstep(0.05, 1, vv) + noise.n3(rimX * 0.8, y * 0.9, rimZ * 0.8) * 0.15).multiplyScalar(0.88 + strata * 0.2);
      if (r <= 1) c.copy(T.ground[0]).multiplyScalar(0.72); // turf lip
      else if (r <= 4) c.lerp(T.soil, 0.75);
      c.multiplyScalar(lerp(1, 0.5, vv));
      ccol.push(c.r, c.g, c.b);
    }
  }
  const cidx = [];
  for (let r = 0; r < CR; r++) for (let s = 0; s < CS; s++) { const a = r * (CS + 1) + s, b = a + 1, d = a + CS + 1, e = d + 1; cidx.push(a, d, b, b, d, e); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
  geo.setIndex(cidx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  return { mesh };
}

/** Roots and stalactites (or icicles) hanging from the underside, merged into one mesh. */
function hangers(T, { rx, rz, rimFactor, noise, rand, DEPTH, fallTheta }) {
  const parts = [];
  const cone = new THREE.ConeGeometry(1, 1, 7, 1);
  cone.translate(0, -0.5, 0); cone.rotateX(Math.PI); // tip down
  for (let i = 0; i < 46; i++) {
    const th = rand() * Math.PI * 2, k = 0.25 + rand() * 0.6, f = rimFactor(th);
    const x = Math.cos(th) * rx * f * k, z = Math.sin(th) * rz * f * k;
    const y = TOP - 0.3 - DEPTH * Math.pow(1 - k, 1.2) * 0.85;
    const len = 0.5 + rand() * 1.4, r = 0.12 + rand() * 0.2;
    parts.push({ geo: cone, x, y, z, s: [r, len, r], color: T.icicles ? (i % 3 ? 0xd8f0ff : 0xbfe6ff) : T.rock[1].getHex() });
  }
  const geos = parts.map((p) => {
    const g = p.geo.clone();
    g.scale(...p.s); g.translate(p.x, p.y, p.z);
    const col = new THREE.Color(p.color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const shade = 0.8 + 0.2 * (g.attributes.position.getY(i) - p.y + p.s[1]) / p.s[1]; arr[i * 3] = col.r * shade; arr[i * 3 + 1] = col.g * shade; arr[i * 3 + 2] = col.b * shade; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g.toNonIndexed();
  });
  // roots: sagging tubes from the rim down the cliff (meadow)
  if (T.roots) {
    const rc = new THREE.Color(T.roots);
    for (let i = 0; i < 26; i++) {
      let th = rand() * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(th - fallTheta), Math.cos(th - fallTheta))) < 0.25) th += 0.5; // keep the fall clear
      const f = rimFactor(th), x0 = Math.cos(th) * rx * f * 0.995, z0 = Math.sin(th) * rz * f * 0.995;
      const len = 1.2 + rand() * 2.8, pts = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, out = 0.08 + Math.sin(t * Math.PI) * 0.25;
        pts.push(new THREE.Vector3(x0 * (1 + out / rx) + noise.n2(i, t * 3) * 0.15, TOP - 0.1 - t * len, z0 * (1 + out / rz) + noise.n2(t * 3, i) * 0.15));
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.03 + rand() * 0.03, 5, false);
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { arr[k * 3] = rc.r; arr[k * 3 + 1] = rc.g; arr[k * 3 + 2] = rc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      geos.push(g.toNonIndexed());
    }
  }
  for (const g of geos) if (g.attributes.uv) g.deleteAttribute('uv');
  const merged = mergeNonIndexed(geos);
  merged.computeVertexNormals();
  const mat = T.icicles ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0 }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  return new THREE.Mesh(merged, mat);
}

function mergeNonIndexed(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}

// ─────────────────────────────── water ───────────────────────────────

function waterSurface(T, { pond, fall, waterDistance, rimDistance, waterY, uniforms }) {
  // a grid over the pond and stream, keeping only cells that are water; the edge fades to the bank colour
  const minX = Math.min(pond.x - pond.r * 1.4, fall.x * 1.08) - 0.4, maxX = Math.max(pond.x + pond.r * 1.4, fall.x * 1.08) + 0.4;
  const minZ = Math.min(pond.z - pond.r * 1.2, fall.z * 1.08) - 0.4, maxZ = Math.max(pond.z + pond.r * 1.2, fall.z * 1.08) + 0.4;
  const step = 0.07, nx = Math.ceil((maxX - minX) / step) + 1, nz = Math.ceil((maxZ - minZ) / step) + 1;
  const pos = [], edge = [], idx = [], id = new Int32Array(nx * nz).fill(-1);
  const LIM = 0.06;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = minX + i * step, z = minZ + j * step, w = waterDistance(x, z);
    // the surface stops at the rim: the stream ends in the notch where the fall begins, nothing hangs over the edge
    if (w > LIM + step || rimDistance(x, z) < 0.002) continue;
    id[i + j * nx] = pos.length / 3;
    pos.push(x, waterY, z); edge.push(smoothstep(-0.25, LIM, w));
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = id[i + j * nx], b = id[i + 1 + j * nx], c = id[i + (j + 1) * nx], d = id[i + 1 + (j + 1) * nx];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  geo.setIndex(idx);
  const L = T.liquid;
  const mat = new THREE.ShaderMaterial({
    transparent: !L.glow && !L.frozen, depthWrite: true,
    uniforms: { uTime: uniforms.uTime, uShallow: { value: new THREE.Color(L.colour) }, uDeep: { value: new THREE.Color(L.deep) }, uFoam: { value: new THREE.Color(L.foam) }, uGlow: { value: L.glow ? 1 : 0 }, uFrozen: { value: L.frozen ? 1 : 0 } },
    vertexShader: /* glsl */`
      attribute float aEdge; varying float vEdge; varying vec3 vWorld;
      void main() { vEdge = aEdge; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uGlow, uFrozen; uniform vec3 uShallow, uDeep, uFoam; varying float vEdge; varying vec3 vWorld;
      float wave(vec2 p) { return sin(p.x * 3.1 + uTime * 1.3) * sin(p.y * 2.7 - uTime * 1.1) + sin((p.x + p.y) * 5.3 - uTime * 2.0) * 0.4; }
      void main() {
        float f = uFrozen > 0.5 ? 0.0 : wave(vWorld.xz);
        vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 0.9, vEdge) + f * 0.06);
        // sparkle on the ripples, a bright rim where the water meets the bank
        col += uFoam * (smoothstep(0.75, 1.0, vEdge) * 0.55 + smoothstep(1.15, 1.4, f) * 0.35 * (1.0 - uGlow));
        if (uFrozen > 0.5) col = mix(col, vec3(1.0), 0.25 + 0.1 * sin(vWorld.x * 7.0 + vWorld.z * 3.0));
        if (uGlow > 0.5) col *= 1.4 + 0.25 * sin(uTime * 2.0 + vWorld.x * 2.0);
        gl_FragColor = vec4(col, uGlow > 0.5 || uFrozen > 0.5 ? 1.0 : mix(0.82, 0.55, smoothstep(0.6, 1.0, vEdge)));
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.ibl = true;
  return new THREE.Mesh(geo, mat);
}

/** The stream's fall over the rim: a curved ribbon with streaks scrolling down, mist (or sparks) at the bottom. */
function waterfall(T, { fall, pond, rimDistance, streamHalf, waterY, DEPTH, uniforms }) {
  const g = new THREE.Group();
  // the fall continues the stream: same direction, same width, starting where the water surface ends at the rim
  const out = new THREE.Vector3(fall.x - pond.x, 0, fall.z - pond.z).normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x);
  let k = 0;
  while (k < 1.2 && rimDistance(fall.x - out.x * k, fall.z - out.z * k) < 0.002) k += 0.01;
  const lip = { x: fall.x - out.x * k, z: fall.z - out.z * k };
  const H = Math.min(DEPTH * 0.8, 6.5), W = streamHalf * 2.3, SEGS = 28;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    // over the lip first (a short curl), then falling and drifting out from the cliff
    const y = waterY - 0.01 - Math.pow(t, 1.35) * H;
    const o = Math.sqrt(t) * 0.75 + t * 0.35;
    const w = W * (1 + t * 0.55);
    for (const s of [-1, 1]) {
      pos.push(lip.x + out.x * o + side.x * s * w / 2, y, lip.z + out.z * o + side.z * s * w / 2);
      uv.push(s < 0 ? 0 : 1, t);
    }
    if (i < SEGS) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const L = T.liquid;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: uniforms.uTime, uCol: { value: new THREE.Color(L.colour) }, uFoam: { value: new THREE.Color(L.foam) }, uGlow: { value: L.glow ? 1 : 0 }, uFrozen: { value: L.frozen ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uGlow, uFrozen; uniform vec3 uCol, uFoam; varying vec2 vUv;
      float h(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float speed = uFrozen > 0.5 ? 0.0 : 1.4;
        float x = vUv.x * 9.0, cell = floor(x), y = vUv.y * 3.0 - uTime * speed * (0.8 + h(cell) * 0.5);
        float streak = smoothstep(0.35, 0.0, abs(fract(x) - 0.5)) * (0.55 + 0.45 * sin(y * 6.2831 + h(cell) * 6.0));
        vec3 col = mix(uCol, uFoam, clamp(streak * 0.8 + vUv.y * 0.3, 0.0, 1.0));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float a = edge * (0.86 + streak * 0.14) * smoothstep(1.0, 0.6, vUv.y);
        col = mix(col, uFoam, smoothstep(0.08, 0.0, vUv.y) * 0.8);
        if (uGlow > 0.5) col *= 1.6;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.ibl = true;
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

// ─────────────────────────────── grass and flowers ───────────────────────────────

export function tuft(random, blades) {
  const P = [], N = [], U = [], I = [];
  for (let b = 0; b < blades; b++) {
    const a = random() * Math.PI * 2, off = Math.sqrt(random()) * 0.06, ox = Math.cos(a) * off, oz = Math.sin(a) * off;
    const face = random() * Math.PI * 2, dx = Math.cos(face), dz = Math.sin(face);
    const lean = 0.12 + random() * 0.4, h = 0.72 + random() * 0.5, w = 0.03 + random() * 0.016, base = P.length / 3;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, cx = ox + dx * lean * t * t * h, cz = oz + dz * lean * t * t * h, cy = h * t * (1 - 0.18 * lean * t), ww = w * (1 - t * 0.9);
      const nl = Math.hypot(dx * 0.35, 1, dz * 0.35);
      if (s < 3) { P.push(cx + dz * ww, cy, cz - dx * ww, cx - dz * ww, cy, cz + dx * ww); N.push(dx * 0.35 / nl, 1 / nl, dz * 0.35 / nl, dx * 0.35 / nl, 1 / nl, dz * 0.35 / nl); U.push(t, t); }
      else { P.push(cx, cy, cz); N.push(dx * 0.35 / nl, 1 / nl, dz * 0.35 / nl); U.push(1); }
    }
    for (let s = 0; s < 2; s++) { const q = base + s * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const q = base + 4; I.push(q, q + 1, q + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(U, 1));
  g.setIndex(I);
  return g;
}

/** Blades sway with a travelling gust; tips are lighter than roots. */
export function windy(material, uniforms) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aTip;\nvarying float vTip;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTip = aTip;
        #ifdef USE_INSTANCING
          vec2 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        #else
          vec2 wp = vec2(0.0);
        #endif
        float gust = sin(uTime * 1.1 + wp.x * 0.55 + wp.y * 0.35) * 0.6 + sin(uTime * 2.3 + wp.x * 1.7 - wp.y * 1.1) * 0.25;
        float bend = aTip * aTip;
        transformed.xz += vec2(0.85, 0.45) * gust * bend * 0.12;`)
      // light every blade like the ground under it: no dark back faces
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = 'varying float vTip;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.62, 1.05, vTip);')
      // back faces keep the up-facing normal too (double-sided lighting would turn them black)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  material.userData.ibl = true;
  return material;
}

function grass(T, ctx) {
  const { rx, rz, rand, noise, rimDistance, pathDistance, waterDistance, heightAt, taken, uniforms } = ctx;
  const variants = [tuft(rng(1), 6), tuft(rng(2), 7), tuft(rng(3), 5)];
  const material = windy(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), uniforms);
  const per = Math.ceil(T.grass.count / variants.length);
  // no shadow receiving: thin blades only pick up acne, the ground under them carries the baked shade
  const meshes = variants.map((g) => { const m = new THREE.InstancedMesh(g, material, per); m.count = 0; m.frustumCulled = false; return m; });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const [hue, sat, light] = T.grass.colour;
  let n = 0;
  for (let tries = 0; n < T.grass.count && tries < T.grass.count * 10; tries++) {
    const x = (rand() * 2 - 1) * rx, z = (rand() * 2 - 1) * rz;
    if (rimDistance(x, z) < 0.015 || pathDistance(x, z) < 0.42 || waterDistance(x, z) < 0.06 || taken(x, z, 0.55)) continue;
    const meadow = noise.fbm2(x * 0.4 + 2, z * 0.4, 3) * 0.5 + 0.5;
    if (meadow < 0.25 && rand() < 0.6) continue;
    const bank = smoothstep(0.7, 0.1, waterDistance(x, z));
    const m = meshes[n % meshes.length];
    dummy.position.set(x, heightAt(x, z) - 0.015, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const h = T.grass.height * (0.6 + meadow * 0.6 + bank * 0.8) * (0.75 + rand() * 0.5), wd = 0.8 + rand() * 0.5;
    dummy.scale.set(wd, h / 0.95, wd);
    dummy.updateMatrix();
    m.setMatrixAt(m.count, dummy.matrix);
    col.setHSL(hue + (meadow - 0.5) * 0.06, sat + rand() * 0.12, light + rand() * 0.1);
    m.setColorAt(m.count, col);
    m.count++; n++;
  }
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  return g;
}

function flowers(T, ctx) {
  const { rx, rz, rand, noise, rimDistance, pathDistance, waterDistance, heightAt, taken } = ctx;
  // five petals round a yellow centre, on a short stem: one small mesh, coloured per instance
  const parts = [];
  const petal = new THREE.SphereGeometry(1, 6, 4);
  const pushPart = (geo, sx, sy, sz, x, y, z, c) => { const g = geo.clone(); g.scale(sx, sy, sz); g.translate(x, y, z); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g.toNonIndexed()); };
  pushPart(new THREE.CylinderGeometry(1, 1, 1, 4), 0.008, 0.16, 0.008, 0, 0.08, 0, [0.3, 0.55, 0.25]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; pushPart(petal, 0.035, 0.012, 0.022, Math.cos(a) * 0.03, 0.165, Math.sin(a) * 0.03, [1, 1, 1]); }
  pushPart(petal, 0.018, 0.016, 0.018, 0, 0.172, 0, [1.6, 1.2, 0.3]);
  const geo = mergeNonIndexed(parts);
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), T.flowers.count);
  mesh.material.userData.ibl = true;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < T.flowers.count && tries < T.flowers.count * 20; tries++) {
    const x = (rand() * 2 - 1) * rx, z = (rand() * 2 - 1) * rz;
    if (rimDistance(x, z) < 0.03 || pathDistance(x, z) < 0.5 || waterDistance(x, z) < 0.15 || taken(x, z, 0.6)) continue;
    if (noise.n2(x * 0.6 + 9, z * 0.6) < 0.1) continue; // flowers grow in patches
    dummy.position.set(x, heightAt(x, z) - 0.01, z); dummy.rotation.set(0, rand() * 6.28, 0); dummy.scale.setScalar(0.8 + rand() * 0.6); dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, col.set(T.flowers.colours[Math.floor(rand() * T.flowers.colours.length)]));
    n++;
  }
  mesh.count = n; mesh.receiveShadow = true;
  return mesh;
}

// ─────────────────────────────── props, landmark, islets ───────────────────────────────

const MATS = {
  matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
  gloss: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.02 }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

/** One sculpted prop, instanced at `list` ({ x, y, z, s, ry, tint }); spin groups get a pivot object to turn. */
function instanceProp(model, list, { castShadow = true } = {}) {
  const out = new THREE.Group(), spinners = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
  for (const g of model) {
    if (g.ch === 'spin') {
      // spinning parts (windmill sails) are single objects: a pivot per instance
      for (const it of list) {
        const holder = new THREE.Group();
        holder.position.set(it.x, it.y, it.z); holder.rotation.y = it.ry; holder.scale.setScalar(it.s);
        const pivot = new THREE.Group(); pivot.position.set(...g.pivot);
        const mesh = new THREE.Mesh(g.geometry, MATS[g.mat]()); mesh.position.set(-g.pivot[0], -g.pivot[1], -g.pivot[2]); mesh.castShadow = castShadow;
        pivot.add(mesh); holder.add(pivot); out.add(holder); spinners.push(pivot);
      }
      continue;
    }
    const mesh = new THREE.InstancedMesh(g.geometry, MATS[g.mat](), Math.max(1, list.length));
    list.forEach((it, i) => {
      m.compose(pv.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.ry, 0)), sv.setScalar(it.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(it.tint ?? 0xffffff));
    });
    mesh.count = list.length;
    mesh.castShadow = castShadow && g.mat !== 'glow'; mesh.receiveShadow = g.mat !== 'glow';
    out.add(mesh);
  }
  return { group: out, spinners };
}

async function placeProps(T, ctx) {
  const { rx, rz, rimDistance, pathDistance, waterDistance, heightAt, rand, landmark, group, animated, pathZ } = ctx;
  const shade = [], spots = [];
  const hides = (x, z, tall) => tall && Math.abs(x) < rx * 0.86 && z > pathZ(x) - 0.9 && z < pathZ(x) + 3.4;
  const lmRoom = 3.0;
  const free = (x, z, room, nearWater) => rimDistance(x, z) > 0.1 && pathDistance(x, z) > room * 0.9 && Math.hypot(x - landmark.x, z - landmark.z) > lmRoom
    && (nearWater ? waterDistance(x, z) > 0.35 && waterDistance(x, z) < 1.6 : waterDistance(x, z) > room * 0.7);
  const models = await Promise.all([...T.props.map((p) => loadModel(p.name, 'lo')), loadModel(T.landmark.name, 'lo')]);
  T.props.forEach((kind, k) => {
    const list = [];
    for (let tries = 0; list.length < kind.count && tries < kind.count * 40; tries++) {
      const x = (rand() * 2 - 1) * rx, z = (rand() * 2 - 1) * rz;
      if (!free(x, z, kind.room, kind.nearWater) || hides(x, z, kind.tall) || spots.some((o) => Math.hypot(o.x - x, o.z - z) < Math.max(o.r, kind.room) * 0.85)) continue;
      const s = lerp(kind.scale[0], kind.scale[1], rand());
      const tint = kind.tint ? kind.tint[Math.floor(rand() * kind.tint.length)] : null;
      list.push({ x, z, y: heightAt(x, z) - 0.02, s, ry: rand() * 6.28, tint });
      spots.push({ x, z, r: kind.room });
      shade.push({ x: x + 0.22 * s, z: z + 0.18 * s, r: kind.shadow * s, s: 0.35 });
    }
    group.add(instanceProp(models[k], list).group);
  });
  // the landmark on its own spot behind the path
  const ly = heightAt(landmark.x, landmark.z);
  const lm = instanceProp(models[T.props.length], [{ x: landmark.x, y: ly - 0.05, z: landmark.z, s: 1, ry: 0.25 }]);
  group.add(lm.group);
  for (const p of lm.spinners) animated.push((t) => { p.rotation.z = -t * (T.landmark.spin || 0.7); });
  spots.push({ x: landmark.x, z: landmark.z, r: lmRoom });
  shade.push({ x: landmark.x + 0.4, z: landmark.z + 0.3, r: T.landmark.shadow, s: 0.45 });
  return { shade, spots };
}

/** Three small rocks with a tuft of the world on top, bobbing slowly next to the island. */
async function islets(T, { rx, rz, rand, noise, animated }) {
  const g = new THREE.Group();
  const prop = await loadModel(T.islets, 'lo');
  const spots = [[-rx * 1.18, -1.2, -rz * 0.35, 1.1], [rx * 1.22, -0.6, rz * 0.1, 0.9], [rx * 0.55, -2.4, -rz * 1.15, 0.75]];
  spots.forEach(([x, y, z, s], i) => {
    const rock = new THREE.IcosahedronGeometry(1, 3);
    const p = rock.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      const d = 1 + noise.n3(vx * 1.7 + i, vy * 1.7, vz * 1.7) * 0.18;
      const yy = vy > 0 ? vy * 0.25 : vy * 1.25;
      p.setXYZ(k, vx * d, yy * d, vz * d);
      c.copy(vy > 0.55 ? T.ground[1] : T.rock[0]).lerp(T.rock[1], Math.max(0, -vy) * 0.8);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    rock.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rock.computeVertexNormals();
    const holder = new THREE.Group(); holder.position.set(x, y, z); holder.scale.setScalar(s);
    const mesh = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    holder.add(mesh);
    holder.add(instanceProp(prop, [{ x: 0, y: 0.2, z: 0, s: 0.7, ry: rand() * 6 }]).group);
    g.add(holder);
    const y0 = y, ph = rand() * 6;
    animated.push((t) => { holder.position.y = y0 + Math.sin(t * 0.6 + ph) * 0.12; });
  });
  return g;
}
