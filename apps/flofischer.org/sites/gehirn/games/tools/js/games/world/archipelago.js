/**
 * The whole map of a game as one scene around the regions the player plays in. Every region of the game is present all the time as
 * its reduced twin (far-regions.js), standing in the same place as the full model that replaces it when you travel there; between
 * and around them stands the land of the game's world (continent, mountain, floating rock, playroom table). Locked regions are hidden
 * by a cloud bank (a dust sheet in the playroom) that parts once when the player first sees the region unlocked. Each region has a
 * real signpost with its name and stars; bridges join neighbours and can be tapped to travel. Nothing here follows the camera.
 * It owns no regions and knows nothing about the game: the caller feeds it state.
 */
import { THREE as T } from '../three-kit.js';
import { createCloudBank } from './cloud-bank.js';
import { createToyCover } from './toy-cover.js';
import { createSignpost } from './signpost.js';
import { buildJoin } from './joins.js';
import { loadFarRegion, disposeFar } from './far-regions.js';
import { rimProfile } from './rim-profile.js';
import { STYLES, signSpot } from './world-styles.js';
import { buildLand } from './lands.js';
import { keel } from './sky-islands.js';
import { SEA_Y } from './sea.js';

/**
 * layout: layoutOf() result; names/biomes per region; keys: [[family, regionKey]] of the far models; sea: createSea() result or null.
 * prepare(index, root): the caller restyles a loaded far model (water, shading). Returns the controller; add `group` to the scene.
 */
export function createArchipelago({ layout, names, keys, style = STYLES.rangers, sea = null, mobile = false, prepare = null }) {
  const group = new T.Group(); group.name = 'Archipelago';
  const seaTop = SEA_Y + (style.sea?.level ?? 0), n = layout.centers.length;
  const entries = layout.centers.map(([x, z], i) => {
    const y = layout.levels[i], [hx, hz] = layout.halves[i], radius = Math.max(hx, hz) * 1.05;
    const bank = style.cover === 'dust' ? createToyCover({ hx, hz, seed: i + 1, level: style.base ?? y }) : createCloudBank({ radius, seed: i + 1, baseY: y, shadowY: seaTop + 0.25, tint: style.coverTint, shadowOn: style.ground === 'continent' });
    bank.group.position.set(x, 0, z); group.add(bank.group);
    const foot = style.ground === 'floating' ? (() => { const g = keel({ hx: 3.3, hz: 2.2, depth: 7, seed: i + 30, earth: '#a07a52', rock: '#8a6fa8' }), m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide })), top = new T.Mesh(new T.CylinderGeometry(3.4, 3.5, 0.4, 16), new T.MeshStandardMaterial({ color: '#8fcf6a', roughness: 0.9 })); top.scale.set(1, 1, 0.68); top.position.y = -0.1; m.add(top); m.userData.owOwned = true; return m; })() : null;
    const sign = createSignpost({ look: style.sign, foot }); group.add(sign.group);
    return { name: names[i], biome: style.biomes[i], x, y, z, hx, hz, level: y, radius, bank, sign, far: null, open: false, revealed: false, stars: 0, total: 0, full: false, parted: false };
  });
  let land = null, joins = [], built = false, current = -1, destroyed = false;
  const box = new T.Box3(), hit = new T.Vector3(), tmpRay = new T.Ray();

  function visibility(e) { if (e.far) e.far.visible = e.open && e.revealed && !e.full; }
  function place(e) {
    const [sx, sz] = signSpot([e.x, e.z], [e.hx, e.hz]), ground = land?.heightAt?.(sx, sz) ?? e.y;
    e.sign.group.position.set(sx, Math.max(ground, SEA_Y), sz);
  }
  function label(e, here) { const locked = !e.open; e.sign.set(e.name, locked ? 'Locked' : `★ ${e.stars} / ${e.total}`, { locked, here }); }
  const refreshJoins = () => { for (const j of joins) j.group.visible = true; };

  const ready = (async () => {
    const roots = await Promise.all(keys.map(([family, key]) => loadFarRegion(family, key)));
    if (destroyed) { for (const r of roots) if (r) disposeFar(r); return; }
    const rims = roots.map((root, i) => (root ? rimProfile(root, entries[i].hx, entries[i].hz) : null));
    land = await buildLand(style.ground, { layout, biomes: style.biomes, rims, sea, style, mobile });
    if (destroyed) { land?.release?.(); for (const r of roots) if (r) disposeFar(r); return; }
    if (land) group.add(land.group);
    roots.forEach((root, i) => {
      const e = entries[i]; if (!root) return;
      root.position.set(e.x, e.y, e.z); e.far = root; prepare?.(i, root); group.add(root); visibility(e);
    });
    for (const link of layout.links) {
      const kind = { floating: 'gangway', playroom: 'track' }[style.ground] ?? (link.strait ? 'bridge' : style.ground === 'continent' || style.ground === 'mountain' ? 'stones' : null);
      if (!kind) continue;
      const j = buildJoin(link, { kind, deck: (x, z) => land?.heightAt?.(x, z) ?? Math.min(layout.levels[link.a], layout.levels[link.b]) + 0.5, lift: kind === 'gangway' ? 0.1 : kind === 'track' ? 0.05 : 0.25 }); joins.push(j); group.add(j.group);
    }
    for (const e of entries) place(e);
    built = true; refreshJoins();
    await land?.ready;
  })();

  return {
    group, entries, land: () => land, ready,
    fitPoints() { return land?.fitPoints?.() ?? []; },
    centre(i) { return new T.Vector3(entries[i].x, entries[i].y, entries[i].z); },
    /** Feed the game state of region i. `revealed` false keeps an open region under its clouds until reveal() runs. */
    setIsland(i, { open, revealed = true, stars = 0, total = 0 }) {
      const e = entries[i]; e.open = open; e.revealed = revealed; e.stars = stars; e.total = total;
      if (!e.bank.parting) { const closed = !(open && revealed); if (closed !== e.bank.covered) e.bank.setCover(closed ? 1 : 0); }
      visibility(e); label(e, i === current);
    },
    setCurrent(i) { current = i; for (let k = 0; k < n; k++) label(entries[k], k === i); },
    /** The region whose full model is showing hides its twin. */
    setFull(i, on) { const e = entries[i]; e.full = on; visibility(e); },
    /** Parts the clouds over an open region once; the caller persists that it happened. */
    reveal(i, { reduced = false, done = null } = {}) {
      const e = entries[i]; e.revealed = true; visibility(e);
      e.bank.part(() => { done?.(); }, reduced ? 0 : 2300);
    },
    veil() { return false; },
    unveil() {},
    /** Region under the pointer: its signpost, a join (to the region on the far side of the one we stand on), then the slab itself. -1 for open sea. */
    pick(raycaster, { except = -1 } = {}) {
      for (let i = 0; i < n; i++) if (i !== except && raycaster.intersectObject(entries[i].sign.hit, false).length) return i;
      let best = -1, bestDistance = Infinity;
      for (const j of joins) { const h = raycaster.intersectObject(j.mesh, false)[0]; if (h && h.distance < bestDistance) { bestDistance = h.distance; const l = j.group.userData.link; best = l.a === current ? l.b : l.b === current ? l.a : (l.b !== except ? l.b : l.a); } }
      if (best >= 0 && best !== except) return best;
      best = -1; bestDistance = Infinity;
      for (let i = 0; i < n; i++) {
        if (i === except) continue;
        const e = entries[i]; box.min.set(e.x - e.hx - 1, e.y - 2, e.z - e.hz - 1); box.max.set(e.x + e.hx + 1, e.y + 9, e.z + e.hz + 1);
        tmpRay.copy(raycaster.ray); if (tmpRay.intersectBox(box, hit)) { const d = tmpRay.origin.distanceTo(hit); if (d < bestDistance) { bestDistance = d; best = i; } }
      }
      return best;
    },
    update(time, { showCurrent = true } = {}) {
      entries.forEach((e, i) => { e.sign.group.visible = i !== current || showCurrent; });
      for (const e of entries) { e.bank.update(time); e.bank.group.visible = e.bank.covered || e.bank.parting; }
      land?.update?.(time);
    },
    debug() { return entries.map((e, i) => ({ i, name: e.name, open: e.open, revealed: e.revealed, far: !!e.far?.visible, silhouette: !!e.far?.visible, cloud: e.bank.group.visible && e.bank.covered, parting: e.bank.parting, label: true, x: e.x, z: e.z, level: e.y, sign: e.sign.group.position.clone().add(new T.Vector3(0, 3.6, 0)).toArray(), signVisible: e.sign.group.visible })); },
    joinPoints() { return joins.map((j) => { const l = j.group.userData.link, p = l.path[Math.floor(l.path.length / 2)]; return { a: l.a, b: l.b, x: p[0], z: p[1], y: (land?.heightAt?.(p[0], p[1]) ?? 0) + 1 }; }); },
    dispose() {
      destroyed = true;
      for (const e of entries) { if (e.far) disposeFar(e.far); e.bank.dispose(); e.sign.dispose(); if (e.sign.foot) { e.sign.foot.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); } }
      for (const j of joins) j.dispose();
      land?.release?.(); group.removeFromParent();
    },
    get built() { return built; },
  };
}
