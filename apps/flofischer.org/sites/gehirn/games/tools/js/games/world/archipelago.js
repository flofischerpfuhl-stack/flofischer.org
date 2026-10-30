/**
 * The whole map of a game as one scene: every island in a shared sea, laid out along a winding route (like a platformer's world
 * map), the ones that are not under foot reduced to cheap silhouettes, locked ones hidden by a Wind Waker cloud bank that parts
 * once when the player first sees the island unlocked, a signboard with name and stars at each island, and stepping stones
 * suggesting the sea route between neighbours. It owns no regions and knows nothing about the game: the caller feeds it state.
 */
import { THREE as T } from '../three-kit.js';
import { createIslandSilhouette } from './island-silhouette.js';
import { createCloudBank } from './cloud-bank.js';
import { Batch, mtx, rng } from './decor.js';
import { SEA_Y } from './sea.js';

const ROOT2 = Math.SQRT2;

/** Island centres from screen-style map coordinates (right, down) for a camera that looks along (-1, -, -1) at `tilt` radians of elevation. */
export function layoutFromMap(points, { tilt = 0.6 } = {}) {
  const k = Math.sin(tilt);
  return points.map(([sx, sy]) => { const d = sy / k; return [(sx + d) / ROOT2, (d - sx) / ROOT2]; });
}

function signTexture(name, line, { locked, here }) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 176;
  const g = c.getContext('2d'), board = locked ? '#5f7384' : '#8e6540', rim = here ? '#ffd23f' : locked ? '#c9d7e3' : '#e3c985';
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.roundRect(14, 42, 488, 132, 26); g.fill();
  g.fillStyle = board; g.beginPath(); g.roundRect(8, 34, 488, 132, 26); g.fill();
  g.lineWidth = here ? 12 : 8; g.strokeStyle = rim; g.stroke();
  g.fillStyle = board; g.beginPath(); g.moveTo(228, 38); g.lineTo(284, 38); g.lineTo(256, 2); g.closePath(); g.fill();
  g.fillStyle = '#fff6d8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let x = 252;
  if (locked) { // padlock
    g.font = '800 58px system-ui, sans-serif'; const w = Math.min(400, g.measureText(name).width), lx = 252 - (w + 52) / 2; x = lx + 52 + w / 2;
    g.fillRect(lx, 80, 34, 28); g.lineWidth = 6; g.strokeStyle = '#fff6d8'; g.beginPath(); g.arc(lx + 17, 80, 10, Math.PI, 0); g.stroke();
  }
  g.font = '800 58px system-ui, sans-serif'; g.fillText(name, x, 80, 440);
  g.font = '700 38px system-ui, sans-serif'; g.fillStyle = locked ? '#dbe6ef' : '#ffe38a'; g.fillText(line, 252, 130, 440);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/**
 * islands: [{ name, biome, x, z, radius }]. sea: createSea() result (receives the silhouettes' shore distances) or null.
 * Returns the controller; add `group` to the scene.
 */
export function createArchipelago({ islands, sea = null, mobile = false }) {
  const group = new T.Group(); group.name = 'Archipelago';
  const entries = islands.map((isl, i) => {
    const silhouette = createIslandSilhouette({ biome: isl.biome, radius: isl.radius * 0.88, seed: i + 2 });
    silhouette.group.position.set(isl.x, 0, isl.z); group.add(silhouette.group);
    const t = silhouette.shoreTile, shore = [isl.x - t.half * t.cell, isl.z - t.half * t.cell];
    sea?.paint(t.data, t.size, t.size, shore[0], shore[1], t.cell);
    const bank = createCloudBank({ radius: isl.radius * 0.78, seed: i + 1 }); bank.group.position.set(isl.x, 0, isl.z); group.add(bank.group);
    const sprite = new T.Sprite(new T.SpriteMaterial({ depthTest: false, transparent: true })); sprite.renderOrder = 6; sprite.visible = false; sprite.frustumCulled = false; group.add(sprite);
    sprite.position.set(isl.x + isl.radius * 0.6, 1, isl.z + isl.radius * 0.6);
    return { ...isl, silhouette, shore, bank, sprite, open: false, revealed: false, stars: 0, total: 0, full: false, veiled: false, parted: false, labelKey: '', texture: null };
  });
  // stepping stones along each hop, one instanced mesh; their colour says whether the next island is open
  const rand = rng(77), stoneGeo = new T.SphereGeometry(1, 8, 5), stones = [], hops = [];
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i], b = entries[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const from = a.radius * 0.93, to = len - b.radius * 0.93, n = Math.max(3, Math.floor((to - from) / 6.5)), bend = (i % 2 ? 1 : -1) * 7;
    const first = stones.length;
    for (let s = 0; s < n; s++) {
      const t = n === 1 ? 0.5 : s / (n - 1), d = from + (to - from) * t, side = Math.sin(t * Math.PI) * bend;
      stones.push({ x: a.x + ux * d - uz * side, z: a.z + uz * d + ux * side, r: 1.15 + rand() * 0.45 });
    }
    hops.push({ first, count: n, to: i + 1 });
  }
  const stoneMesh = new T.InstancedMesh(stoneGeo, new T.MeshLambertMaterial(), Math.max(1, stones.length)); stoneMesh.name = 'RouteStones';
  stones.forEach((s, k) => stoneMesh.setMatrixAt(k, mtx([s.x, SEA_Y + 0.02, s.z], [0, rand() * 6, 0], [s.r * 1.25, 0.34, s.r])));
  stoneMesh.instanceMatrix.needsUpdate = true; stoneMesh.count = stones.length; group.add(stoneMesh);
  const sphere = new T.Sphere(), hit = new T.Vector3();

  function refreshStones() {
    const c = new T.Color();
    for (const h of hops) for (let s = 0; s < h.count; s++) stoneMesh.setColorAt(h.first + s, c.set(entries[h.to].open && entries[h.to].revealed ? '#f1dd9c' : '#b9ccdb'));
    if (stoneMesh.instanceColor) stoneMesh.instanceColor.needsUpdate = true;
  }
  function visibility(e) {
    e.silhouette.group.visible = e.open && e.revealed && !e.full;
    e.sprite.visible = true;
  }
  function label(e, here) {
    const locked = !e.open, line = locked ? 'Locked' : `★ ${e.stars} / ${e.total}`, key = `${e.name}|${line}|${locked}|${here}`;
    if (key === e.labelKey) return;
    e.labelKey = key; e.texture?.dispose(); e.texture = signTexture(e.name, line, { locked, here }); e.sprite.material.map = e.texture; e.sprite.material.needsUpdate = true;
  }
  let current = -1;
  refreshStones();
  return {
    group, entries, stoneMesh,
    centre(i) { return new T.Vector3(entries[i].x, 0, entries[i].z); },
    /** Feed the game state of island i. `revealed` false keeps an open island under its clouds until reveal() runs. */
    setIsland(i, { open, revealed = true, stars = 0, total = 0 }) {
      const e = entries[i]; e.open = open; e.revealed = revealed; e.stars = stars; e.total = total;
      if (!e.veiled && !e.bank.parting) { const closed = !(open && revealed); if (closed !== e.bank.covered) e.bank.setCover(closed ? 1 : 0); }
      visibility(e); label(e, i === current); refreshStones();
    },
    setCurrent(i) { current = i; for (let k = 0; k < entries.length; k++) label(entries[k], k === i); },
    /** The island whose full terrain is showing hides its silhouette. */
    setFull(i, on) {
      const e = entries[i], t = e.silhouette.shoreTile;
      if (e.full !== on && sea) { if (on) sea.clear(e.shore[0], e.shore[1], t.size, t.size, t.cell); else sea.paint(t.data, t.size, t.size, e.shore[0], e.shore[1], t.cell); }
      e.full = on; visibility(e);
    },
    /** Parts the clouds over an open island once; the caller persists that it happened. */
    reveal(i, { reduced = false, done = null } = {}) {
      const e = entries[i]; e.revealed = true; e.veiled = false; e.silhouette.group.visible = e.open && !e.full; refreshStones();
      e.bank.part(() => { done?.(); }, reduced ? 0 : 2300);
    },
    /** A short cloud veil over island i, so the full terrain can swap in unseen. */
    veil(i, { reduced = false } = {}) { if (reduced) return false; const e = entries[i]; if (e.veiled || !e.open || !e.revealed) return false; e.veiled = true; e.bank.form(320); return true; },
    unveil(i, { reduced = false } = {}) { const e = entries[i]; if (!e.veiled) return; e.veiled = false; e.bank.part(null, reduced ? 0 : 1000); },
    /** Island under the pointer: its signboard first, then the body (a sphere around the island). Returns -1 for open sea. */
    pick(raycaster, { except = -1 } = {}) {
      let best = -1, bestDistance = Infinity;
      // an orthographic ray starts at the camera plane; the zoomed-out map has islands in front of it
      raycaster.ray.origin.addScaledVector(raycaster.ray.direction, -1500);
      for (let i = 0; i < entries.length; i++) {
        if (i === except) continue;
        const e = entries[i];
        if (e.sprite.visible && raycaster.intersectObject(e.sprite, false).length) return i;
        sphere.set(hit.set(e.x, 5, e.z), e.radius * 0.82);
        const p = raycaster.ray.intersectSphere(sphere, new T.Vector3());
        if (p) { const d = raycaster.ray.origin.distanceTo(p); if (d < bestDistance) { bestDistance = d; best = i; } }
      }
      return best;
    },
    /** pxScale: pixels per metre of the orthographic view. showCurrent: also label the island the camera is on. */
    update(time, { pxScale = 10, showCurrent = false } = {}) {
      const width = (mobile ? 128 : 160), height = width * 176 / 512;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        e.sprite.visible = showCurrent || i !== current;
        e.sprite.scale.set(width / pxScale, height / pxScale, 1);
        e.sprite.center.set(0.5, 0.99);
        e.bank.update(time);
        e.bank.group.visible = e.bank.covered && (i !== current || showCurrent || e.veiled || e.bank.parting);
      }
    },
    debug() { return entries.map((e, i) => ({ i, name: e.name, open: e.open, revealed: e.revealed, silhouette: e.silhouette.group.visible, cloud: e.bank.group.visible && e.bank.covered, parting: e.bank.parting, label: e.sprite.visible, x: e.x, z: e.z })); },
    dispose() {
      for (const e of entries) { e.silhouette.release(); e.bank.dispose(); e.sprite.material.map?.dispose(); e.sprite.material.dispose(); }
      stoneGeo.dispose(); stoneMesh.material.dispose(); stoneMesh.dispose(); group.removeFromParent();
    },
  };
}
