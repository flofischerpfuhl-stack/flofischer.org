/**
 * Everything that makes one game's world map different from the others, in one place: where the regions sit in the one shared scene
 * (a chain of slabs that touch, or fixed spots), what the land between and around them is, what hides a locked region, the backdrop
 * and the words. The overworld, the archipelago and the land builders only read this; they know no family.
 * All regions are authored slabs of the same size, so layouts are in metres.
 */

const SEA = {
  water: { flavour: 0, level: 0 },
  cloud: { flavour: 1, level: 0 },
  floor: { flavour: 2, level: 0 },
};

/** Half extents (metres) of the authored region slabs; the Sturmbastion is bigger. */
export const SLAB = { x: 12, z: 10 };
export const SLAB_OF = { 4: { x: 16, z: 15 } };

/**
 * chain: each region touches the previous one along the given axis (+x is towards the camera's right and down, -z to its right and up),
 * `gaps` metres of land or `straits` of water between them. at: fixed centres [x, z] instead. levels: metres above the sea.
 */
export const STYLES = {
  rangers: {
    // one continent like a platformer's world map: lands that border each other, a bridge over every strait
    layout: {
      landscape: { chain: ['+x', '-z', '+x', '-z'], gaps: [13, 9, 9, 13], straits: [0, 3] },
      portrait: { chain: ['-z', '-x', '-z', '-x'], gaps: [13, 9, 9, 13], straits: [0, 3] },
    },
    levels: [0, 0, 4, 0, 3],
    biomes: ['meadow', 'sand', 'snow', 'basalt', 'stone'],
    ground: 'continent', cover: 'cloud',
    sea: { ...SEA.water }, harbour: [true, false, false, false, true],
    sky: ['#78b4ea', '#e3c393', '#c5dce9', '#b698ab', '#a8b2c4'], backdrop: 'sea',
    sign: { board: '#8e6540', locked: '#5f7384', rim: '#e3c985', lockedRim: '#c9d7e3', text: '#fff6d8', sub: '#ffe38a', shape: 'plank' },
    verb: 'Sail to', place: 'island',
  },
  pip: {
    // one great rock mountain: the terraces sit on its flanks and the way winds up around it
    layout: {
      landscape: { at: [[4, 34], [34, 4], [-4, -34], [-34, -4]], via: 15 },
      portrait: { at: [[4, 34], [34, 4], [-4, -34], [-34, -4]], via: 15 },
    },
    levels: [5, 15, 25, 35],
    biomes: ['crag-moss', 'crag-sand', 'crag-frost', 'crag-basalt'],
    ground: 'mountain', cover: 'cloud', view: { phi: 1.1 },
    sea: { ...SEA.cloud, palette: { shallow: '#ffffff', mid: '#f3f7fd', deep: '#e2ebf8', foam: '#ffffff', haze: '#e9f1fb', skyLow: '#e8f1fc', skyTop: '#6c9ee0' } },
    sky: ['#6aa6e6', '#6aa6e6', '#6aa6e6', '#6aa6e6'], backdrop: 'peaks',
    sign: { board: '#59616b', locked: '#4b5560', rim: '#cfd8df', lockedRim: '#a4b2bf', text: '#f4f8fb', sub: '#ffdc7a', shape: 'slate' },
    verb: 'Climb to', place: 'terrace',
  },
  momo: {
    // arenas floating close together at different heights, joined by bridges of light
    layout: {
      landscape: { chain: ['+x', '-z', '+x'], gaps: [8, 8, 8] },
      portrait: { chain: ['-z', '-x', '-z'], gaps: [8, 8, 8] },
    },
    levels: [0, 5, 2, 8],
    biomes: ['meadow', 'sand', 'snow', 'basalt'],
    ground: 'floating', cover: 'cloud',
    sea: { ...SEA.cloud, level: -19, palette: { shallow: '#fff6f3', mid: '#ffe6e8', deep: '#f6c8da', foam: '#ffffff', haze: '#ffd7d0', skyLow: '#ffd7a8', skyTop: '#b87bd6' } },
    sky: ['#f6a98b', '#f6a98b', '#f6a98b', '#f6a98b'], backdrop: 'dusk',
    sign: { board: '#5c3d8a', locked: '#5d5578', rim: '#ffd98a', lockedRim: '#c9c1e0', text: '#fff7e6', sub: '#ffe38a', shape: 'crystal' },
    verb: 'Fly to', place: 'island',
  },
  bounce: {
    // a toy tournament in a playroom: play sets side by side on one big table, toy tracks between them, dust sheets over the locked ones
    layout: {
      landscape: { chain: ['+x', '-z', '-x'], gaps: [11, 11, 11] },
      portrait: { chain: ['-z', '-x', '+z'], gaps: [11, 11, 11] },
    },
    levels: [0, 0, 0, 0],
    biomes: ['meadow', 'sand', 'snow', 'basalt'],
    ground: 'playroom', cover: 'dust', base: -1.8, fitPad: 0, view: { phi: 1.1 },
    sea: { ...SEA.floor, level: -42, palette: { shallow: '#c8935a', mid: '#b97f48', deep: '#a76e3c', foam: '#5a3a22', haze: '#c9a070', skyLow: '#e4cfa2', skyTop: '#f1dcae' } },
    sky: ['#efd9ae', '#efd9ae', '#efd9ae', '#efd9ae'], backdrop: 'playroom',
    sign: { board: '#d5483f', locked: '#7a8794', rim: '#ffe7a8', lockedRim: '#d5dde4', text: '#ffffff', sub: '#ffe7a8', shape: 'block' },
    verb: 'Roll to', place: 'set',
  },
};

export const styleOf = (family) => STYLES[family] ?? STYLES.rangers;

const AXES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

/**
 * Region centres, heights and joins for a screen shape: { centers: [[x, z]], levels, halves: [[hx, hz]], links: [{ a, b, axis, gap, strait, from, to }], bounds }.
 * Region 0 sits at the origin. `from` and `to` are the points on the two slab edges the join runs between.
 */
export function layoutOf(style, portrait = false) {
  const spec = portrait ? style.layout.portrait : style.layout.landscape, n = style.biomes.length;
  const halves = Array.from({ length: n }, (_, i) => { const s = SLAB_OF[i] ?? SLAB; return [s.x, s.z]; });
  const centers = [], links = [];
  if (spec.at) { const o = spec.at[0]; for (const p of spec.at) centers.push([p[0] - o[0], p[1] - o[1]]); }
  else {
    centers.push([0, 0]);
    for (let i = 1; i < n; i++) {
      const [dx, dz] = AXES[spec.chain[i - 1]], gap = spec.gaps[i - 1], [px, pz] = centers[i - 1];
      const along = (k) => (dx ? halves[k][0] : halves[k][1]);
      const d = along(i - 1) + along(i) + gap;
      centers.push([px + dx * d, pz + dz * d]);
      links.push({ a: i - 1, b: i, axis: spec.chain[i - 1], gap, strait: !!spec.straits?.includes(i - 1) });
    }
  }
  for (let i = 1; i < n; i++) if (!links[i - 1]) links.push({ a: i - 1, b: i, axis: null, gap: 0, strait: false });
  for (const l of links) {
    const [ax, az] = centers[l.a], [bx, bz] = centers[l.b], len = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / len, uz = (bz - az) / len;
    const reach = (k, s) => { const [hx, hz] = halves[k], t = Math.min(ux ? hx / Math.abs(ux) : Infinity, uz ? hz / Math.abs(uz) : Infinity); return t * s; };
    l.from = [ax + ux * reach(l.a, 1), az + uz * reach(l.a, 1)]; l.to = [bx - ux * reach(l.b, 1), bz - uz * reach(l.b, 1)];
  }
  const mean = centers.reduce((m, c) => [m[0] + c[0] / n, m[1] + c[1] / n], [0, 0]);
  for (const l of links) {
    const [mx, mz] = [(l.from[0] + l.to[0]) / 2, (l.from[1] + l.to[1]) / 2], dx = mx - mean[0], dz = mz - mean[1], len = Math.hypot(dx, dz) || 1, push = spec.via ?? 0, cx = mx + (dx / len) * push, cz = mz + (dz / len) * push;
    l.path = Array.from({ length: 25 }, (_, k) => { const t = k / 24, u = 1 - t; return [u * u * l.from[0] + 2 * u * t * cx + t * t * l.to[0], u * u * l.from[1] + 2 * u * t * cz + t * t * l.to[1]]; });
  }
  const levels = style.levels.slice(0, n), xs = centers.map((c, i) => [c[0] - halves[i][0], c[0] + halves[i][0]]).flat(), zs = centers.map((c, i) => [c[1] - halves[i][1], c[1] + halves[i][1]]).flat();
  return { centers, levels, halves, links, bounds: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) } };
}

/** Where a region's signpost stands: just outside the slab's left corner, a little in front of its middle. */
export const signSpot = ([x, z], [hx, hz]) => [x - hx - 4.5, z + hz * 0.6];
