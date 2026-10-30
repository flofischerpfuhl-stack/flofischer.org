/**
 * Everything that makes one game's world map different from the others, in one place: where the regions sit on the map, what the
 * ground around a region is made of, what the "sea" is, what hides a locked region, what joins two regions, the backdrop and the
 * words. The overworld, the archipelago, the sea and the silhouettes only read this; they know no family.
 */

/** Screen-style map coordinates (right, down) for a landscape, an ultra-wide and a portrait screen, one point per region. */
const rangersMap = {
  landscape: [[-126, 104], [-62, 150], [4, 100], [66, 52], [128, 8]],
  wide: [[-176, 66], [-88, 106], [0, 70], [88, 36], [176, 4]],
  portrait: [[-40, 165], [40, 97], [-40, 29], [40, -39], [0, -109]],
};

const SEA = {
  water: { flavour: 0, level: 0 },
  cloud: { flavour: 1, level: 0 },
  floor: { flavour: 2, level: 0 },
};

export const STYLES = {
  rangers: {
    map: rangersMap, radius: 44, elevations: null,
    biomes: ['meadow', 'sand', 'snow', 'basalt', 'stone'],
    ground: 'island', silhouette: 'island', link: 'stones', cover: 'cloud', horizon: 'islet', skyClouds: true,
    sea: { ...SEA.water }, harbour: [true, false, false, false, true],
    sky: ['#78b4ea', '#e3c393', '#c5dce9', '#b698ab', '#a8b2c4'], backdrop: 'sea',
    sign: { board: '#8e6540', locked: '#5f7384', rim: '#e3c985', lockedRim: '#c9d7e3', text: '#fff6d8', sub: '#ffe38a', shape: 'plank' },
    verb: 'Sail to', hint: 'Tap a stop · start at the glowing gate · tap another island to sail there', place: 'island',
  },
  pip: {
    // a great mountain: the terraces climb from the cloud sea, colder and barer the higher they sit
    map: {
      landscape: [[-96, 150], [58, 96], [-52, 36], [44, -26]],
      wide: [[-150, 110], [-50, 74], [50, 38], [150, 2]],
      portrait: [[-30, 176], [32, 100], [-30, 24], [26, -52]],
    },
    radius: 40, elevations: [0, 12, 25, 38],
    biomes: ['crag-moss', 'crag-sand', 'crag-frost', 'crag-basalt'],
    ground: 'terrace', silhouette: 'terrace', link: 'steps', mountain: true, cover: 'cloud', horizon: 'peak', skyClouds: true,
    sea: { ...SEA.cloud, palette: { shallow: '#ffffff', mid: '#f3f7fd', deep: '#e2ebf8', foam: '#ffffff', haze: '#e9f1fb', skyLow: '#e8f1fc', skyTop: '#6c9ee0' } },
    sky: ['#6aa6e6', '#6aa6e6', '#6aa6e6', '#6aa6e6'], backdrop: 'peaks',
    sign: { board: '#59616b', locked: '#4b5560', rim: '#cfd8df', lockedRim: '#a4b2bf', text: '#f4f8fb', sub: '#ffdc7a', shape: 'slate' },
    verb: 'Climb to', hint: 'Tap a stop · start at the glowing gate · tap another terrace to climb there', place: 'terrace',
  },
  momo: {
    // arena islands floating above the clouds, joined by bridges of light
    map: {
      landscape: [[-118, 112], [-24, 148], [58, 76], [124, 16]],
      wide: [[-170, 90], [-62, 112], [48, 64], [160, 14]],
      portrait: [[-36, 170], [38, 98], [-38, 26], [30, -48]],
    },
    radius: 42, elevations: null,
    biomes: ['meadow', 'sand', 'snow', 'basalt'],
    ground: 'floating', silhouette: 'floating', link: 'light', cover: 'cloud', horizon: 'floating', skyClouds: true,
    sea: { ...SEA.cloud, level: -19, palette: { shallow: '#fff6f3', mid: '#ffe6e8', deep: '#f6c8da', foam: '#ffffff', haze: '#ffd7d0', skyLow: '#ffd7a8', skyTop: '#b87bd6' } },
    sky: ['#f6a98b', '#f6a98b', '#f6a98b', '#f6a98b'], backdrop: 'dusk',
    sign: { board: '#5c3d8a', locked: '#5d5578', rim: '#ffd98a', lockedRim: '#c9c1e0', text: '#fff7e6', sub: '#ffe38a', shape: 'crystal' },
    verb: 'Fly to', hint: 'Tap a Fernling to choose · tap a stop to travel · tap another island to fly there', place: 'island',
  },
  bounce: {
    // a toy tournament on a playroom floor: play sets on a rug, joined by toy tracks, under dust sheets until they are unlocked
    map: {
      landscape: [[-84, 100], [-12, 128], [50, 70], [100, 20]],
      wide: [[-130, 80], [-44, 100], [44, 56], [130, 14]],
      portrait: [[-30, 150], [32, 90], [-32, 30], [26, -30]],
    },
    radius: 30, elevations: null,
    biomes: ['meadow', 'sand', 'snow', 'basalt'],
    ground: 'playset', silhouette: 'playset', link: 'track', cover: 'dust', horizon: 'toys', skyClouds: false,
    sea: { ...SEA.floor, palette: { shallow: '#c8935a', mid: '#b97f48', deep: '#a76e3c', foam: '#5a3a22', haze: '#c9a070', skyLow: '#e4cfa2', skyTop: '#f1dcae' } },
    sky: ['#efd9ae', '#efd9ae', '#efd9ae', '#efd9ae'], backdrop: 'playroom',
    sign: { board: '#d5483f', locked: '#7a8794', rim: '#ffe7a8', lockedRim: '#d5dde4', text: '#ffffff', sub: '#ffe7a8', shape: 'block' },
    verb: 'Roll to', hint: 'Tap a stop · start at the glowing gate · tap another play set to roll there', place: 'set',
  },
};

export const styleOf = (family) => STYLES[family] ?? STYLES.rangers;
