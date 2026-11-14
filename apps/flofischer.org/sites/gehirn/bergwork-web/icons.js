// Icon-Vorschläge berg:work: jede Familie verbindet die Webseite (Bergschrift-Geometrie, Tinte, Creme, Rot, Hartschatten)
// mit Projects/Schliff (Steingrau, Haarlinie, Datenfarben). 256er-Raster; tile=false liefert nur das Zeichen.
const CREAM = '#f3f0e6', RED = '#c81e1e';
const DATA = { bergwork: '#f2716b', projects: '#79a8f5', pdf: '#f2716b', image: '#62c690' }; // Schliff-Datenfarben dunkel
const svg = (inner) => `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const plate = (fill, edge) => `<rect x="4" y="4" width="248" height="248" rx="56" fill="${fill}"/><rect x="4.5" y="4.5" width="247" height="247" rx="55.5" fill="none" stroke="${edge}"/>`;
const STONE = '#21201e', INK = '#0a0a0a';

// 1 „Werkzeichen auf Stein“: Formen aus der Bergschrift (Webseite) auf der Steinkachel von Projects, Hartschatten in Tinte,
// je App ein Teil in ihrer Datenfarbe.
const W = {
  // „b:“ in der Bergschrift wie im freigegebenen Werkzeichen, als Umriss (keine Schrift laden): Größe 150, mittig auf 128, Grundlinie 176.
  bergwork: (a) => `<g transform="translate(17.7 176) scale(.15 -.15)"><path fill="${CREAM}" d="M0 570V700H375V550L1020 470V0H405L355 50L304 0H125V570ZM375 130H770V375L375 425Z"/><path fill="${a}" transform="translate(1110 0)" d="M50 0V162H311V0ZM50 538V700H311V538Z"/></g>`,
  projects: (a) => `<path fill="${CREAM}" d="M44 52h112l20 20v20H44z"/><path fill="${a}" d="M84 112h128v40H104l-20-20z"/><path fill="${CREAM}" d="M44 172h84l20 20v20H44z"/>`,
  pdf: (a) => `<path fill="${CREAM}" fill-rule="evenodd" d="M60 32h96l44 44v148H60zM88 160v20h56v-20z"/><path fill="${a}" d="M88 116h84v20H88z"/><path d="M156 32v44h44" fill="none" stroke="${STONE}" stroke-width="10"/>`,
  image: (a) => `<path fill="${CREAM}" fill-rule="evenodd" d="M32 56h192v148H32zM56 80v100h144V80z"/><path fill="${a}" d="M56 180l48-48 28 28 28-28 40 40v8z"/><path fill="${CREAM}" d="M160 92h24v24h-24z"/>`,
};
const shadowOf = (s) => s.replace(/fill="[^"]+"/g, `fill="${INK}"`).replace(/stroke="[^"]+"/g, 'stroke="none"');
export function werkzeichen(id, tile = true) {
  const a = id === 'bergwork' ? RED : DATA[id];
  const body = W[id](a);
  const g = `<g transform="translate(10 10)">${shadowOf(body)}</g>${body}`;
  return tile ? svg(`${plate(STONE, 'rgba(255,253,248,.12)')}<g transform="translate(128 128) scale(.76) translate(-133 -133)">${g}</g>`)
    : svg(`<g transform="translate(-4 -4)">${body}</g>`);
}

// 2 „Linie, kantig“: Strich der UI-Symbole von Projects, aber mit eckigen Enden und 45°-Fasen der Bergschrift,
// auf der Tinte der Webseite, je App eine Fläche in ihrer Datenfarbe.
const L = {
  bergwork: `<path d="M68 200 188 80"/><path d="M188 200 68 80"/><path d="M36 92 76 52l32 32-40 40z" fill="var(--a)"/><path d="M150 50q56 4 68 66"/>`,
  projects: `<path d="M64 44h128l20 20v128l-20 20H64l-20-20V64z"/><path d="M92 84v92"/><path d="M128 84v52"/><path d="M156 84h24v68h-24z" fill="var(--a)" stroke="none"/>`,
  pdf: `<path d="M64 36h88l48 48v136H64z"/><path d="M152 36v48h48z" fill="var(--a)"/><path d="M96 132h64"/><path d="M96 172h40"/>`,
  image: `<path d="M36 52h184v152H36z"/><path d="M36 188l60-60 40 40 28-28 56 56" fill="none"/><path d="M48 192l48-56 40 40 28-28 44 44z" fill="var(--a)" stroke="none"/><path d="M160 84h24v24h-24z"/>`,
};
export function linieKantig(id, tile = true) {
  const a = id === 'bergwork' ? RED : DATA[id];
  const body = `<g style="--a:${a}" fill="none" stroke="#f2f1ed" stroke-width="20" stroke-linecap="square" stroke-linejoin="miter">${L[id]}</g>`;
  return tile ? svg(`${plate(INK, 'rgba(243,240,230,.14)')}<g transform="translate(128 128) scale(.70) translate(-128 -128)">${body}</g>`)
    : svg(body);
}

// 3 „Granit flach“: die freigegebenen Low-Poly-Marken (25.09.2026) auf drei Steintöne von Schliff reduziert, Rot der Webseite
// als einziger Akzent; Projects bekommt einen Steinmann mit Wegmarke.
const SRC = {};
export async function load() {
  for (const id of ['bergwork', 'pdf', 'image']) SRC[id] = await (await fetch(id === 'bergwork' ? 'bergwork.svg' : `bergwork-${id}.svg`)).text();
}
const tone = (hex) => {
  const v = parseInt(hex.slice(1, 3), 16);
  if (/^#(c|d)[0-9a-f]1[0-9a-f]1/i.test(hex) || hex.toUpperCase() === '#C81E1E' || hex.toUpperCase() === '#D32F2F') return RED;
  return v >= 0xc8 ? '#f2f1ed' : v >= 0x80 ? '#a9a6a0' : '#55534e';
};
const CAIRN = [
  ['#CDCBC6', '52 196 76 166 128 184'], ['#F4F3F0', '76 166 140 160 128 184'], ['#B2B0AB', '140 160 198 170 128 184'],
  ['#7A7874', '198 170 208 200 128 184'], ['#5F5D5A', '208 200 172 216 84 216 52 196 128 184'],
  ['#E3E2DE', '80 148 98 120 130 138'], ['#F4F3F0', '98 120 152 114 130 138'], ['#96948F', '152 114 184 128 178 152 130 138'],
  ['#5F5D5A', '178 152 122 160 86 158 80 148 130 138'],
  ['#C81E1E', '100 100 112 84 132 92 126 102'], ['#F4F3F0', '112 84 136 74 132 92'], ['#C81E1E', '136 74 156 80 132 92'],
  ['#CDCBC6', '100 100 126 102 120 112 104 110'], ['#7A7874', '126 102 132 92 156 80 164 94 154 108 120 112'],
];
function granitSym(id) {
  if (id === 'projects') return CAIRN.map(([f, p]) => `<polygon fill="${tone(f)}" points="${p}"/>`).join('');
  const inner = SRC[id].replace(/^[\s\S]*?<g[^>]*>/, '').replace(/<\/g>\s*<\/svg>\s*$/, '');
  return inner.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (_, h) => `fill="${tone(h)}"`).replace(/<title>[\s\S]*?<\/title>/, '');
}
export function granitFlach(id, tile = true) {
  const sym = `<g>${granitSym(id)}</g>`;
  return tile ? svg(`${plate(INK, 'rgba(243,240,230,.12)')}<g transform="translate(128 128) scale(.74) translate(-128 -128)">${sym}</g>`) : svg(sym);
}

export const families = [
  { key: 'werkzeichen', fn: werkzeichen, name: 'Werkzeichen auf Stein', web: 'Formen aus der Bergschrift, Hartschatten', proj: 'Steinkachel mit Haarlinie, Datenfarben je App' },
  { key: 'linie', fn: linieKantig, name: 'Linie, kantig', web: 'Tinte, eckige Enden und 45°-Fasen der Bergschrift', proj: 'Strich der UI-Symbole, Datenfarben je App' },
  { key: 'granit', fn: granitFlach, name: 'Granit flach', web: 'Rot als einziger Akzent, flach wie die Seite', proj: 'drei Steintöne aus Schliff; Projects als Steinmann' },
];
export const apps = [['bergwork', 'berg:work'], ['projects', 'Projects'], ['pdf', 'PDF'], ['image', 'Image']];
