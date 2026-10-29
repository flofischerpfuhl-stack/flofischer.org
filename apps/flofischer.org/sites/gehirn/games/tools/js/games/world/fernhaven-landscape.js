/**
 * Fern Rangers overworld, Fernhaven (world 1): the land around the native region, so the map reads as one valley
 * rather than a diorama on a flat colour. The land starts at the region's own rim height and colour (raycast samples
 * in viridis.dressing.json) and eases into meadow hills, wooded ridges, hamlets and windmills; the lake shares the
 * region's water material, so harbour and lake are one surface with a wavy, sandy shore. The region keeps its authored
 * meshes; only its vertex colours get a warmer, more saturated meadow grade (once per geometry).
 *
 * Coordinates are region metres (the caller's group carries the region's unit scale and centre).
 */
import { THREE as T } from '../three-kit.js';
import { loadModel } from '../models.js';
import { modelInstances, mtx, rng, createNoise, smoothstep, Batch, cloud } from './decor.js';

const DRESSING = fetch(new URL('../../../games-assets/fernworld/environments/rangers/viridis.dressing.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const MODELS = Promise.all(['TREE_ROUND', 'BUSH', 'COTTAGE', 'WINDMILL', 'ROCK'].map((n) => loadModel(n, 'lo')));
MODELS.catch(() => {});

/** Lusher meadow greens and warmer stone on the region's own vertex colours. */
export function gradeRegion(root) {
  const c = new T.Color(), hsl = {};
  root.traverse((o) => {
    const col = o.isMesh && o.material?.name !== 'water' && o.geometry?.attributes.color;
    if (!col || o.geometry.userData.fernhavenGrade) return;
    o.geometry.userData.fernhavenGrade = true;
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)); c.getHSL(hsl);
      if (hsl.h > 0.17 && hsl.h < 0.52 && hsl.s > 0.05) { // greens and mint: towards a sunny yellow-green
        hsl.h = hsl.h + (0.27 - hsl.h) * 0.7; hsl.s = Math.min(0.85, hsl.s * 1.7 + 0.12); hsl.l *= 0.9;
      } else if (hsl.s < 0.12 && hsl.l > 0.15) { // grey stone: a touch of warm sandstone
        hsl.h = 0.09; hsl.s = Math.min(0.22, hsl.s + 0.1);
      }
      c.setHSL(hsl.h, hsl.s, hsl.l); col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  });
}

// matte scenery: swap the instanced Standard materials for Lambert (cheaper per pixel; HD 630 budget)
const lambert = (g) => { g.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) { const old = o.material; o.material = new T.MeshLambertMaterial({ vertexColors: true }); old.dispose(); } }); return g; };

/** world: the loaded region; returns { group, release } like landscape(); onChange redraws when the land arrives. */
export function fernhaven(world, onChange) {
  const group = new T.Group(), u = world.unitScale, center = world.bounds.getCenter(new T.Vector3());
  group.position.set(center.x, 0, center.z); group.scale.setScalar(u);
  const geometries = [], materials = [], instances = [];
  const half = world.bounds.getSize(new T.Vector3()).multiplyScalar(0.5 / u);
  const hx = half.x, hz = half.z, floorY = -0.24, noise = createNoise(77), rand = rng(907);
  const ox = ((world.root?.position.x ?? center.x) - center.x) / u, oz = ((world.root?.position.z ?? center.z) - center.z) / u, oy = (world.root?.position.y ?? 0) / u;
  // the lake on the region's harbour side: the shared outline, with its two long open shores made wavy
  const wavy = (a, b, n, amp) => {
    const out = [], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    for (let k = 1; k < n; k++) { const f = k / n, w = noise.fbm2(f * 9, a[0] * 0.1, 2) * amp * Math.sin(f * Math.PI); out.push([a[0] + (b[0] - a[0]) * f + nx * w, a[1] + (b[1] - a[1]) * f + nz * w]); }
    return out;
  };
  const lake = [[-90, 3.2], ...wavy([-90, 3.2], [-11.99, 3.2], 40, 6), [-11.99, 3.2], [-11.99, 10], [-6.4, 10], ...wavy([-6.4, 10], [-20, 90], 40, 7), [-20, 90], [-90, 90]];
  const inPolygon = (X, Z) => {
    let inside = false;
    for (let i = 0, j = lake.length - 1; i < lake.length; j = i++) { const [xi, zi] = lake[i], [xj, zj] = lake[j]; if ((zi > Z) !== (zj > Z) && X < ((xj - xi) * (Z - zi)) / (zj - zi) + xi) inside = !inside; }
    return inside;
  };
  // the outline rasterised once at 0.5 m (terrain and props ask hundreds of thousands of times)
  const LX0 = Math.min(...lake.map((p) => p[0])) - 1, LX1 = Math.max(...lake.map((p) => p[0])) + 1, LZ0 = Math.min(...lake.map((p) => p[1])) - 1, LZ1 = Math.max(...lake.map((p) => p[1])) + 1, CELL = 0.5;
  const LW = Math.ceil((LX1 - LX0) / CELL), LH = Math.ceil((LZ1 - LZ0) / CELL), lakeMask = new Uint8Array(LW * LH);
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) lakeMask[j * LW + i] = inPolygon(LX0 + (i + 0.5) * CELL, LZ0 + (j + 0.5) * CELL) ? 1 : 0;
  const inLake = (x, z) => {
    const i = Math.floor((x - ox - LX0) / CELL), j = Math.floor((z - oz - LZ0) / CELL);
    return i >= 0 && j >= 0 && i < LW && j < LH && lakeMask[j * LW + i] === 1;
  };
  const nearLake = (x, z, r) => inLake(x + r, z) || inLake(x - r, z) || inLake(x, z + r) || inLake(x, z - r);
  const outside = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - hx), Math.max(0, Math.abs(z) - hz));
  // the region's rim: the land starts at the rim's height and colour, then eases into the valley
  let rim = [];
  const rimAt = (x, z) => {
    const px = Math.max(-hx, Math.min(hx, x)), pz = Math.max(-hz, Math.min(hz, z));
    if ((x - px) ** 2 + (z - pz) ** 2 > 100) return null; // only the first 10 m beyond the rim blend with it
    let best = null, bd = 1e9;
    for (const r of rim) { const d = (r.X - px) ** 2 + (r.Z - pz) ** 2; if (d < bd) { bd = d; best = r; } }
    return best;
  };
  const MEADOW = 0.35;
  let waterLevel = 0.13; // set from the region's own water below
  const H = (x, z) => {
    const d = outside(x, z);
    const r = rimAt(x, z);
    if (d === 0) { // under the region (its own ground covers this): dip away from the rim height at once
      const inside = Math.min(hx - Math.abs(x), hz - Math.abs(z));
      // keep the rim height a little way under the region's edge, so no gap opens between two grid rows
      return Math.max(floorY - 2, (r ? r.Y : MEADOW) - 0.05 - Math.max(0, inside - 0.9) * 2);
    }
    // the lake bed stays just under the surface near the shore and falls away further out
    if (inLake(x, z)) {
      // shore distance: how far until a neighbour is dry land
      let shore = 6; for (const r of [0.8, 1.6, 3, 4.5]) if (!inLake(x + r, z) || !inLake(x - r, z) || !inLake(x, z + r) || !inLake(x, z - r)) { shore = r; break; }
      return waterLevel - 0.18 - smoothstep(0.8, 6, shore) * 0.7;
    }
    const roll = noise.fbm2(x * 0.035, z * 0.035, 4) * 0.5 + 0.5, ridge = Math.pow(1 - Math.abs(noise.fbm2(x * 0.012 + 3, z * 0.012, 3)), 2);
    const hills = smoothstep(6, 26, d) * (0.3 + roll * 2.4) + smoothstep(24, 80, d) * (4 + ridge * 16 + roll * 4) + smoothstep(80, 150, d) * 18;
    const base = r ? r.Y + (MEADOW - r.Y) * smoothstep(0, 9, d) : MEADOW;
    // land never dips under the water level, so no lake surface can hang above dry ground
    const h = base + hills * (nearLake(x, z, 2.5) ? 0.55 : 1);
    return nearLake(x, z, 3) ? Math.max(h, waterLevel + 0.12) : h;
  };
  // flat-shaded vertex colours like the region itself (no texture), so both read as one landscape
  const terrainMaterial = new T.MeshLambertMaterial({ vertexColors: true }); materials.push(terrainMaterial);
  function buildTerrain() {
    const R = 170, N = 160, pos = [], col = [], idx = [], c = new T.Color(), rc = new T.Color();
    const near = new T.Color(0x7fbd47), mid = new T.Color(0x67a83a), forest = new T.Color(0x447f35), far = new T.Color(0x9fc7b8), sand = new T.Color(0xd9c58f);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      // denser rows close to the region
      const fx = (i / N) * 2 - 1, fz = (j / N) * 2 - 1, x = Math.sign(fx) * Math.pow(Math.abs(fx), 1.6) * R, z = Math.sign(fz) * Math.pow(Math.abs(fz), 1.6) * R;
      const y = H(x, z), d = outside(x, z), n = noise.fbm2(x * 0.15, z * 0.15, 3) * 0.5 + 0.5, r = rimAt(x, z);
      pos.push(x, y, z);
      c.copy(near).lerp(mid, n * 0.5).lerp(forest, smoothstep(25, 60, d) * 0.45).lerp(far, smoothstep(50, 150, d) * 0.75);
      if (r?.c) c.lerp(rc.setRGB(...r.c), 1 - smoothstep(0, 7, d)); // start in the region's own colour
      // sand only on the low beach right at the water, never up a slope
      if (inLake(x, z)) c.lerp(sand, 0.8); else if (nearLake(x, z, 1.6)) c.lerp(sand, 0.65 * (1 - smoothstep(waterLevel + 0.2, waterLevel + 0.6, y)));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new T.BufferGeometry(); geometries.push(g);
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const terrain = new T.Mesh(g, terrainMaterial); terrain.receiveShadow = true; group.add(terrain);
  }
  // the lake: the region's own water material and one flat water colour, so harbour water and lake are one surface
  {
    let regionWater = null; world.root?.traverse((o) => { if (!regionWater && o.isMesh && o.material?.name === 'water') regionWater = o; });
    const shore = new T.Shape(); lake.forEach(([x, z], i) => shore[i ? 'lineTo' : 'moveTo'](x, -z)); shore.closePath();
    const g = new T.ShapeGeometry(shore, 4); geometries.push(g);
    let m, waterY = 0.13;
    if (regionWater) {
      m = regionWater.material.clone(); m.side = T.DoubleSide; materials.push(m);
      const rc = regionWater.geometry.attributes.color;
      if (rc && m.vertexColors) {
        // the authored harbour gradient would otherwise end in a seam against the lake
        let r = 0, gg = 0, b = 0; for (let i = 0; i < rc.count; i++) { r += rc.getX(i); gg += rc.getY(i); b += rc.getZ(i); }
        r /= rc.count; gg /= rc.count; b /= rc.count;
        if (!regionWater.geometry.userData.fernhavenWater) { for (let i = 0; i < rc.count; i++) rc.setXYZ(i, r, gg, b); rc.needsUpdate = true; regionWater.geometry.userData.fernhavenWater = true; }
        const cols = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < cols.length; i += 3) { cols[i] = r; cols[i + 1] = gg; cols[i + 2] = b; }
        g.setAttribute('color', new T.BufferAttribute(cols, 3));
      }
      // the lake sits just under the region's own water level
      regionWater.geometry.computeBoundingBox();
      const top = new T.Vector3(0, regionWater.geometry.boundingBox.max.y, 0); regionWater.localToWorld(top);
      waterY = (top.y - group.position.y) / u - 0.004; waterLevel = waterY;
    } else { m = new T.MeshStandardMaterial({ color: 0x3483a3, roughness: 0.55, side: T.DoubleSide }); materials.push(m); }
    const water = new T.Mesh(g, m); water.rotation.x = -Math.PI / 2; water.position.set(ox, waterY, oz); group.add(water);
  }
  // clouds far round the valley, seen when the view tilts towards the horizon
  {
    const b = new Batch(), crand = rng(55);
    for (let k = 0; k < 18; k++) { const a = crand() * 6.3, r = 115 + crand() * 70, s = 9 + crand() * 10; b.add(cloud(crand, 6, [0.78, 0.84, 0.95]), mtx([Math.cos(a) * r, 26 + crand() * 22, Math.sin(a) * r], [0, crand() * 3, 0], [s * 1.7, s * 0.6, s])); }
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35 }); materials.push(m);
    const g = b.geometry(); geometries.push(g); group.add(new T.Mesh(g, m));
  }
  Promise.all([MODELS, DRESSING]).then(([[tree, bush, cottage, windmill, rock], d]) => {
    if (group.userData.released) return;
    rim = (d?.rim || []).filter((r) => r.y > -0.5).map((r) => ({ X: r.x + ox, Z: r.z + oz, Y: r.y + oy, c: r.c }));
    buildTerrain();
    const trees = [], treeTint = [], bushes = [], bushTint = [], tint = (k = 1) => new T.Color().setRGB((0.86 + rand() * 0.22) * k, (0.9 + rand() * 0.18) * k, (0.78 + rand() * 0.2) * k);
    const free = (x, z) => !inLake(x, z) && !nearLake(x, z, 1) && outside(x, z) > 1.2;
    // groves near the region rim, then woods on the ridges
    for (let k = 0; k < 900 && trees.length < 115; k++) {
      const a = rand() * 6.3, dd = 1.6 + Math.pow(rand(), 1.6) * 60, x = Math.cos(a) * (hx + dd), z = Math.sin(a) * (hz + dd);
      if (!free(x, z)) continue;
      const clump = noise.fbm2(x * 0.06, z * 0.06, 2) * 0.5 + 0.5; if (clump < 0.45 && dd < 40) continue;
      const s = (dd < 12 ? 1.4 : 2.2) + rand() * 1.4;
      trees.push(mtx([x, H(x, z) - 0.08 * s, z], [0, rand() * 6.3, 0], s)); treeTint.push(tint(dd > 50 ? 0.85 : 1));
      if (dd < 30 && rand() < 0.6) { const bx = x + (rand() - 0.5) * 3, bz = z + (rand() - 0.5) * 3; if (free(bx, bz)) { bushes.push(mtx([bx, H(bx, bz) - 0.05, bz], [0, rand() * 6.3, 0], 1.2 + rand())); bushTint.push(tint()); } }
    }
    // loose bushes just outside the rim, so trees and shrubs continue across it
    for (let k = 0; k < 140; k++) { const a = rand() * 6.3, dd = 1.3 + rand() * 4, x = Math.cos(a) * (hx + dd), z = Math.sin(a) * (hz + dd); if (free(x, z) && rand() < 0.6) { bushes.push(mtx([x, H(x, z) - 0.05, z], [0, rand() * 6.3, 0], 0.9 + rand() * 0.9)); bushTint.push(tint()); } }
    // a hedgerow belt straddling the region's rim: the seam between authored region and valley disappears under it
    const per = 2 * (2 * hx + 2 * hz);
    for (let t = 0; t < per; t += 0.75) {
      let x, z, along = t;
      if (along < 2 * hx) { x = -hx + along; z = -hz; } else if ((along -= 2 * hx) < 2 * hz) { x = hx; z = -hz + along; }
      else if ((along -= 2 * hz) < 2 * hx) { x = hx - along; z = hz; } else { along -= 2 * hx; x = -hx; z = hz - along; }
      const nx = Math.sign(x) * (Math.abs(x) >= hx - 1e-6 ? 1 : 0), nz = Math.sign(z) * (Math.abs(z) >= hz - 1e-6 ? 1 : 0);
      const px = x + nx * (0.15 + rand() * 0.5), pz = z + nz * (0.15 + rand() * 0.5);
      if (nearLake(px, pz, 2.2) || rand() < 0.15) continue;
      const r = rimAt(px, pz), y = r ? Math.min(r.Y, H(px + nx * 0.6, pz + nz * 0.6)) : H(px, pz);
      if ((t | 0) % 4 === 0 && rand() < 0.5) { trees.push(mtx([px, y - 0.1, pz], [0, rand() * 6.3, 0], 1.3 + rand())); treeTint.push(tint()); }
      else { bushes.push(mtx([px, y - 0.06, pz], [0, rand() * 6.3, 0], 1.1 + rand() * 0.8)); bushTint.push(tint()); }
    }
    instances.push(modelInstances(tree, trees, { tints: treeTint }), modelInstances(bush, bushes, { tints: bushTint }));
    // hamlets and windmills on the slopes, the landmarks of the valley
    const homes = [[-24, -20, 0.4], [-28, -15, 1.6], [-20, -26, -0.6], [26, 16, 2.2], [31, 12, 3.1], [6, -32, 0.1], [10, -35, 1.1]];
    instances.push(modelInstances(cottage, homes.filter(([x, z]) => free(x, z)).map(([x, z, yaw]) => mtx([x, H(x, z) - 0.1, z], [0, yaw, 0], 3.2))));
    const mills = [[22, -24, -0.5, 4.6], [-34, 26, 0.8, 5.2]].filter(([x, z]) => free(x, z));
    instances.push(modelInstances(windmill.filter((p) => p.ch !== 'spin'), mills.map(([x, z, yaw, s]) => mtx([x, H(x, z) - 0.15, z], [0, yaw, 0], s))));
    for (const [x, z, yaw, s] of mills) for (const p of windmill.filter((q) => q.ch === 'spin')) {
      const holder = new T.Group(), pivot = new T.Group(), m = new T.Mesh(p.geometry, new T.MeshLambertMaterial({ vertexColors: true }));
      materials.push(m.material); holder.position.set(x, H(x, z) - 0.15, z); holder.rotation.y = yaw; holder.scale.setScalar(s);
      pivot.position.set(...p.pivot); pivot.rotation.z = rand() * 6.3; m.position.set(-p.pivot[0], -p.pivot[1], -p.pivot[2]); pivot.add(m); holder.add(pivot); group.add(holder);
    }
    // inside the region: round trees and bushes on free grass, precomputed by a raycast (viridis.dressing.json)
    if (d) {
      const at = (o, s) => mtx([o.x + ox, o.y + oy - 0.05 * s, o.z + oz], [0, o.yaw, 0], s);
      instances.push(modelInstances(tree, d.trees.map((o) => at(o, o.s * 1.25)), { tints: d.trees.map(() => tint()) }), modelInstances(bush, d.bushes.map((o) => at(o, o.s * 1.3)), { tints: d.bushes.map(() => tint()) }));
    }
    // reeds of bushes and stones along the wavy shores
    {
      const shoreB = [], shoreT = [], shoreR = [];
      for (let k = 0; k < lake.length; k++) {
        const [lx, lz] = lake[k], x = lx + ox + (rand() - 0.5) * 2.5, z = lz + oz + (rand() - 0.5) * 2.5;
        if (inLake(x, z) || outside(x, z) < 1 || Math.abs(lx) > 60 || Math.abs(lz) > 60) continue;
        shoreB.push(mtx([x, H(x, z) - 0.05, z], [0, rand() * 6.3, 0], 0.9 + rand() * 0.8)); shoreT.push(tint());
        if (k % 3 === 0) shoreR.push(mtx([lx + ox, floorY + 0.1, lz + oz], [0, rand() * 6.3, 0], 0.6 + rand()));
      }
      instances.push(modelInstances(bush, shoreB, { tints: shoreT }), modelInstances(rock, shoreR));
    }
    const rocks = []; for (let k = 0; k < 40; k++) { const a = rand() * 6.3, dd = 2 + rand() * 30, x = Math.cos(a) * (hx + dd), z = Math.sin(a) * (hz + dd); if (free(x, z)) rocks.push(mtx([x, H(x, z) - 0.2, z], [0, rand() * 6.3, 0], 0.8 + rand() * 1.6)); }
    instances.push(modelInstances(rock, rocks));
    for (const g of instances) { lambert(g); group.add(g); g.traverse((o) => { if (o.material) materials.push(o.material); }); }
    onChange?.();
  });
  return {
    group,
    release() {
      group.userData.released = true; group.removeFromParent();
      for (const g of instances) g.traverse((o) => o.isInstancedMesh && o.dispose());
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
    },
  };
}
