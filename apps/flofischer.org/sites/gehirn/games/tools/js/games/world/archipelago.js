/**
 * The whole map of a game as one scene: every island in a shared sea, laid out along a winding route (like a platformer's world
 * map), the ones that are not under foot reduced to cheap silhouettes, locked ones hidden by a Wind Waker cloud bank that parts
 * once when the player first sees the island unlocked, a signboard with name and stars at each island, and stepping stones
 * suggesting the sea route between neighbours. It owns no regions and knows nothing about the game: the caller feeds it state.
 */
import { THREE as T } from '../three-kit.js';
import { createIslandSilhouette } from './island-silhouette.js';
import { createCloudBank, shadowTex } from './cloud-bank.js';
import { createToyCover } from './toy-cover.js';
import { createLinks } from './route-links.js';
import { createMountain } from './mountain.js';
import { STYLES } from './world-styles.js';
import { SEA_Y } from './sea.js';

const ROOT2 = Math.SQRT2;

/**
 * Island centres from screen-style map coordinates (right, down) for a camera that looks along (-1, -, -1) at `tilt` radians of elevation.
 * elevations: metres each island sits above the sea; the point then names where its top appears on screen, so a terrace higher up lands farther back.
 */
export function layoutFromMap(points, { tilt = 0.57, elevations = null } = {}) {
  const k = Math.sin(tilt), lift = Math.cos(tilt);
  return points.map(([sx, sy], i) => { const d = (sy + (elevations?.[i] ?? 0) * lift) / k; return [(sx + d) / ROOT2, (d - sx) / ROOT2]; });
}

function signTexture(name, line, { locked, here, look }) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 176;
  const g = c.getContext('2d'), board = locked ? look.locked : look.board, rim = here ? '#ffd23f' : locked ? look.lockedRim : look.rim, round = look.shape === 'block' ? 14 : look.shape === 'slate' ? 10 : 26;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.roundRect(14, 42, 488, 132, round); g.fill();
  g.fillStyle = board; g.beginPath(); g.roundRect(8, 34, 488, 132, round); g.fill();
  g.lineWidth = here ? 12 : 8; g.strokeStyle = rim; g.stroke();
  g.fillStyle = board; g.beginPath(); g.moveTo(228, 38); g.lineTo(284, 38); g.lineTo(256, 2); g.closePath(); g.fill();
  if (look.shape === 'block') { g.fillStyle = rim; for (const [x, y] of [[40, 66], [464, 66], [40, 134], [464, 134]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); } }
  if (look.shape === 'slate') { g.fillStyle = rim; for (const [x, y] of [[30, 54], [474, 54], [30, 146], [474, 146]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); } }
  if (look.shape === 'crystal') { g.fillStyle = rim; for (const x of [34, 478]) { g.beginPath(); g.moveTo(x, 70); g.lineTo(x + 9, 100); g.lineTo(x, 130); g.lineTo(x - 9, 100); g.closePath(); g.fill(); } }
  g.fillStyle = look.text; g.textAlign = 'center'; g.textBaseline = 'middle';
  let x = 252;
  if (locked) { // padlock
    g.font = '800 58px system-ui, sans-serif'; const w = Math.min(400, g.measureText(name).width), lx = 252 - (w + 52) / 2; x = lx + 52 + w / 2;
    g.fillRect(lx, 80, 34, 28); g.lineWidth = 6; g.strokeStyle = look.text; g.beginPath(); g.arc(lx + 17, 80, 10, Math.PI, 0); g.stroke();
  }
  g.font = '800 58px system-ui, sans-serif'; g.fillText(name, x, 80, 440);
  g.font = '700 38px system-ui, sans-serif'; g.fillStyle = locked ? '#dbe6ef' : look.sub; g.fillText(line, 252, 130, 440);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/**
 * islands: [{ name, biome, x, z, radius, level }] (level: metres above the sea). sea: createSea() result (receives the silhouettes' shore distances) or null.
 * style: one entry of STYLES. Returns the controller; add `group` to the scene.
 */
export function createArchipelago({ islands, sea = null, mobile = false, style = STYLES.rangers }) {
  const group = new T.Group(); group.name = 'Archipelago';
  const seaTop = SEA_Y + (style.sea?.level ?? 0), shores = style.ground === 'island' || style.ground === 'playset', hover = style.ground === 'floating' || style.ground === 'terrace';
  const blobMaterial = hover ? new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, opacity: 0.6 }) : null, blobGeometry = hover ? new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) : null;
  const entries = islands.map((isl, i) => {
    const level = isl.level ?? 0;
    const silhouette = createIslandSilhouette({ biome: isl.biome, radius: isl.radius * 0.88, seed: i + 2, kind: style.silhouette, level, bottom: (style.sea?.level ?? 0) - 4 });
    silhouette.group.position.set(isl.x, level, isl.z); group.add(silhouette.group);
    const t = silhouette.shoreTile, shore = [isl.x - t.half * t.cell, isl.z - t.half * t.cell];
    if (shores) sea?.paint(t.data, t.size, t.size, shore[0], shore[1], t.cell);
    const bank = style.cover === 'dust' ? createToyCover({ radius: isl.radius * 0.78, seed: i + 1, level: 0, shadowY: seaTop + 0.25 }) : createCloudBank({ radius: isl.radius * 0.78, seed: i + 1, baseY: level, shadowY: seaTop + 0.25, tint: style.coverTint });
    bank.group.position.set(isl.x, 0, isl.z); group.add(bank.group);
    if (blobMaterial) { const blob = new T.Mesh(blobGeometry, blobMaterial); blob.position.set(isl.x, seaTop + 0.22, isl.z); blob.scale.setScalar(isl.radius * 2.7); blob.renderOrder = -1; blob.frustumCulled = false; group.add(blob); }
    const sprite = new T.Sprite(new T.SpriteMaterial({ depthTest: false, transparent: true })); sprite.renderOrder = 6; sprite.visible = false; sprite.frustumCulled = false; group.add(sprite);
    sprite.position.set(isl.x + isl.radius * 0.74, SEA_Y + level + 0.2, isl.z + isl.radius * 0.74);
    return { ...isl, level, silhouette, shore, bank, sprite, open: false, revealed: false, stars: 0, total: 0, full: false, veiled: false, parted: false, labelKey: '', texture: null };
  });
  const links = createLinks({ entries, kind: style.link }); group.add(links.group);
  const mountain = style.mountain ? createMountain({ entries }) : null; if (mountain) group.add(mountain.group);
  const sphere = new T.Sphere(), hit = new T.Vector3();

  const refreshStones = () => links.refresh((h) => entries[h + 1].open && entries[h + 1].revealed);
  function visibility(e) {
    e.silhouette.group.visible = e.open && e.revealed && !e.full;
    e.sprite.visible = true;
  }
  function label(e, here) {
    const locked = !e.open, line = locked ? 'Locked' : `★ ${e.stars} / ${e.total}`, key = `${e.name}|${line}|${locked}|${here}`;
    if (key === e.labelKey) return;
    e.labelKey = key; e.texture?.dispose(); e.texture = signTexture(e.name, line, { locked, here, look: style.sign }); e.sprite.material.map = e.texture; e.sprite.material.needsUpdate = true;
  }
  let current = -1;
  refreshStones();
  return {
    group, entries, stoneMesh: links.meshes[0], links,
    /** Resolves once the landmark models of every silhouette are in (the caller restyles `group` then). */
    ready: Promise.all(entries.map((e) => e.silhouette.ready)),
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
        sphere.set(hit.set(e.x, e.level + 6, e.z), e.radius * 0.86);
        const p = raycaster.ray.intersectSphere(sphere, new T.Vector3());
        if (p) { const d = raycaster.ray.origin.distanceTo(p); if (d < bestDistance) { bestDistance = d; best = i; } }
      }
      return best;
    },
    /** pxScale: pixels per metre of the orthographic view. showCurrent: also label the island the camera is on. */
    update(time, { pxScale = 10, showCurrent = false, signWidth = 0 } = {}) {
      links.update(time);
      const width = signWidth ? Math.min(signWidth, mobile ? 96 : 118) : (mobile ? 96 : 118), height = width * 176 / 512;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        e.sprite.visible = showCurrent || i !== current;
        e.sprite.scale.set(width / pxScale, height / pxScale, 1);
        e.sprite.center.set(0.5, 0.99);
        e.bank.update(time);
        e.bank.group.visible = e.bank.covered && (i !== current || showCurrent || e.veiled || e.bank.parting);
      }
    },
    debug() { return entries.map((e, i) => ({ i, name: e.name, open: e.open, revealed: e.revealed, silhouette: e.silhouette.group.visible, cloud: e.bank.group.visible && e.bank.covered, parting: e.bank.parting, label: e.sprite.visible, x: e.x, z: e.z, level: e.level })); },
    dispose() {
      for (const e of entries) { e.silhouette.release(); e.bank.dispose(); e.sprite.material.map?.dispose(); e.sprite.material.dispose(); }
      links.dispose(); mountain?.dispose(); blobMaterial?.dispose(); blobGeometry?.dispose(); group.removeFromParent();
    },
  };
}
