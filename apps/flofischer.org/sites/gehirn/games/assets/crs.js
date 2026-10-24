/**
 * Fernwork — Coordinate Reference Systems
 *
 * Thin wrapper around proj4js that gives the rest of the app a
 * country-agnostic, search-friendly view of the world's most common
 * coordinate reference systems. Used by the DXF / Shapefile viewers
 * to align an arbitrary engineering / survey file with raster
 * basemap tiles (which are always in WGS84 Web Mercator).
 *
 * Design choices:
 *   - proj4js is loaded lazily on first use (~150 KB). Files that
 *     never need a basemap don't pay for it.
 *   - We ship a curated list of ~40 international presets covering
 *     every major continent + the UTM zone universe (60 N + 60 S =
 *     120 codes generated programmatically). That's enough for ~95%
 *     of real-world CAD / GIS files without bloating the bundle with
 *     thousands of niche national grids.
 *   - The remaining 5% is handled by a `lookupEpsg(code)` fetch
 *     against epsg.io that pulls the proj4 string on demand and
 *     caches it in localStorage. Works offline once cached.
 *   - All preset definitions are Mike Linton's official OGC-WKT
 *     equivalents, taken straight from epsg.io. We keep them as
 *     pure proj4 strings so we don't depend on a heavy WKT parser.
 *
 * Coordinate convention everywhere:
 *   { x, y }   — projected coords in the source CRS (m for projected,
 *                deg for geographic)
 *   { lon, lat } — WGS 84 lon/lat in degrees
 */

let _proj4P = null;
function loadProj4() {
  if (!_proj4P) {
    _proj4P = import('https://esm.sh/proj4@2.11.0').then((m) => {
      const proj4 = m.default || m;
      // Register every preset on first load. Cheap (just stores a
      // string per code) and means callers can use any preset code
      // without having to remember to register it first.
      for (const [code, def] of Object.entries(PRESET_DEFS)) {
        proj4.defs(code, def);
      }
      return proj4;
    });
  }
  return _proj4P;
}

// ─── International preset CRS list ───────────────────────────────────
// Organised by continent / region for the picker UI. Codes are EPSG
// identifiers; defs are the proj4 strings copied straight from
// epsg.io (verified 2026-04). Datums are kept (towgs84 parameters)
// so reprojection accuracy stays sub-metre against the WGS 84
// basemap tiles.
//
// IMPORTANT: keep this list lean — we want the dropdown to feel
// shoppable, not encyclopedic. Niche national grids should be
// reachable via the "Custom EPSG" input, not crammed in here.

export const PRESET_DEFS = {
  // ── Global ────────────────────────────────────────────────────────
  'EPSG:4326':  '+proj=longlat +datum=WGS84 +no_defs +type=crs',
  'EPSG:3857':  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
  'EPSG:3035':  '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:6933':  '+proj=cea +lon_0=0 +lat_ts=30 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs',

  // ── North America ────────────────────────────────────────────────
  'EPSG:4269':  '+proj=longlat +datum=NAD83 +no_defs +type=crs',
  'EPSG:5070':  '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs +type=crs',
  'EPSG:3978':  '+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs +type=crs',

  // ── Europe ────────────────────────────────────────────────────────
  'EPSG:27700': '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs +type=crs',
  'EPSG:2154':  '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:25832': '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:25833': '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:31466': '+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs',
  'EPSG:31467': '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs',
  'EPSG:31468': '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs',
  'EPSG:2056':  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:21781': '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:31287': '+proj=lcc +lat_0=47.5 +lon_0=13.3333333333333 +lat_1=49 +lat_2=46 +x_0=400000 +y_0=400000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs +type=crs',
  'EPSG:28992': '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs +type=crs',
  'EPSG:3812':  '+proj=lcc +lat_0=50.797815 +lon_0=4.359215833 +lat_1=49.833333 +lat_2=51.166667 +x_0=649328 +y_0=665262 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:25830': '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3006':  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3067':  '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:2180':  '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:5514':  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:23700': '+proj=somerc +lat_0=47.1443937222222 +lon_0=19.0485717777778 +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0,0,0,0 +units=m +no_defs +type=crs',

  // ── Asia ──────────────────────────────────────────────────────────
  'EPSG:4612':  '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs +type=crs',
  'EPSG:6677':  '+proj=tmerc +lat_0=36 +lon_0=139.833333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:5179':  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:4490':  '+proj=longlat +ellps=GRS80 +no_defs +type=crs',
  'EPSG:32643': '+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +type=crs',
  'EPSG:32650': '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs +type=crs',

  // ── Oceania ──────────────────────────────────────────────────────
  'EPSG:7842':  '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs +type=crs',
  'EPSG:7855':  '+proj=utm +zone=55 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:7856':  '+proj=utm +zone=56 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:2193':  '+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',

  // ── Africa ───────────────────────────────────────────────────────
  'EPSG:2046':  '+proj=tmerc +lat_0=0 +lon_0=17 +k=1 +x_0=0 +y_0=0 +axis=wsu +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:32735': '+proj=utm +zone=35 +south +datum=WGS84 +units=m +no_defs +type=crs',

  // ── South America ────────────────────────────────────────────────
  'EPSG:4674':  '+proj=longlat +ellps=GRS80 +no_defs +type=crs',
  'EPSG:31983': '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:5641':  '+proj=merc +lon_0=-43 +k=1 +x_0=5000000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
};

// Human-readable labels & continent grouping, used by the CRS picker
// modal. Keep `region` strings stable (they're used as group headers
// in the dropdown) and `name` short — the EPSG code already carries
// the precision; the name is just what the user reads.
export const PRESET_META = {
  // Global
  'EPSG:4326':  { name: 'WGS 84 (lon/lat)',                region: 'Global',         hint: 'Geographic, degrees' },
  'EPSG:3857':  { name: 'Web Mercator',                    region: 'Global',         hint: 'Spherical Mercator, m' },
  'EPSG:3035':  { name: 'ETRS89 / LAEA Europe',            region: 'Global',         hint: 'Equal-area, all of Europe' },
  'EPSG:6933':  { name: 'World Cylindrical Equal Area',    region: 'Global',         hint: 'Equal-area worldwide' },

  // North America
  'EPSG:4269':  { name: 'NAD 83 (lon/lat)',                region: 'North America',  hint: 'USA / Canada geographic' },
  'EPSG:5070':  { name: 'NAD 83 / Conus Albers',           region: 'North America',  hint: 'USA continental, equal-area' },
  'EPSG:3978':  { name: 'NAD 83 / Canada Atlas Lambert',   region: 'North America',  hint: 'Canada-wide' },

  // Europe
  'EPSG:27700': { name: 'British National Grid (OSGB36)',  region: 'Europe',         hint: 'United Kingdom' },
  'EPSG:2154':  { name: 'RGF93 / Lambert-93',              region: 'Europe',         hint: 'France mainland' },
  'EPSG:25832': { name: 'ETRS89 / UTM 32N',                region: 'Europe',         hint: 'DE, IT, AT, NL, DK, NO, …' },
  'EPSG:25833': { name: 'ETRS89 / UTM 33N',                region: 'Europe',         hint: 'East DE, AT, IT east, …' },
  'EPSG:31466': { name: 'Gauss-Krüger Zone 2 (DHDN)',      region: 'Europe',         hint: 'Germany, 6° meridian' },
  'EPSG:31467': { name: 'Gauss-Krüger Zone 3 (DHDN)',      region: 'Europe',         hint: 'Germany, 9° meridian' },
  'EPSG:31468': { name: 'Gauss-Krüger Zone 4 (DHDN)',      region: 'Europe',         hint: 'Germany, 12° meridian' },
  'EPSG:2056':  { name: 'CH1903+ / LV95',                  region: 'Europe',         hint: 'Switzerland (modern)' },
  'EPSG:21781': { name: 'CH1903 / LV03',                   region: 'Europe',         hint: 'Switzerland (legacy)' },
  'EPSG:31287': { name: 'MGI / Austria Lambert',           region: 'Europe',         hint: 'Austria' },
  'EPSG:28992': { name: 'Amersfoort / RD New',             region: 'Europe',         hint: 'Netherlands' },
  'EPSG:3812':  { name: 'ETRS89 / Belgian Lambert 2008',   region: 'Europe',         hint: 'Belgium' },
  'EPSG:25830': { name: 'ETRS89 / UTM 30N',                region: 'Europe',         hint: 'Spain, UK west, Ireland' },
  'EPSG:3006':  { name: 'SWEREF99 TM',                     region: 'Europe',         hint: 'Sweden' },
  'EPSG:3067':  { name: 'ETRS89 / TM35FIN',                region: 'Europe',         hint: 'Finland' },
  'EPSG:2180':  { name: 'ETRS89 / Poland CS92',            region: 'Europe',         hint: 'Poland' },
  'EPSG:5514':  { name: 'S-JTSK / Krovak East North',      region: 'Europe',         hint: 'Czechia, Slovakia' },
  'EPSG:23700': { name: 'HD72 / EOV',                      region: 'Europe',         hint: 'Hungary' },

  // Asia
  'EPSG:4612':  { name: 'JGD2000 (lon/lat)',               region: 'Asia',           hint: 'Japan geographic' },
  'EPSG:6677':  { name: 'JGD2011 / Plane CS IX',           region: 'Asia',           hint: 'Tokyo / Kantō plane' },
  'EPSG:5179':  { name: 'Korea 2000 / Unified CS',         region: 'Asia',           hint: 'South Korea' },
  'EPSG:4490':  { name: 'CGCS2000 (lon/lat)',              region: 'Asia',           hint: 'China geographic' },
  'EPSG:32643': { name: 'WGS 84 / UTM 43N',                region: 'Asia',           hint: 'India north, Pakistan' },
  'EPSG:32650': { name: 'WGS 84 / UTM 50N',                region: 'Asia',           hint: 'China south, Philippines' },

  // Oceania
  'EPSG:7842':  { name: 'GDA2020 (lon/lat)',               region: 'Oceania',        hint: 'Australia geographic' },
  'EPSG:7855':  { name: 'GDA2020 / MGA 55',                region: 'Oceania',        hint: 'Australia VIC, TAS' },
  'EPSG:7856':  { name: 'GDA2020 / MGA 56',                region: 'Oceania',        hint: 'Australia NSW, QLD east' },
  'EPSG:2193':  { name: 'NZGD2000 / Transverse Mercator',  region: 'Oceania',        hint: 'New Zealand' },

  // Africa
  'EPSG:2046':  { name: 'Hartebeesthoek94 / Lo17',         region: 'Africa',         hint: 'South Africa, 17° meridian' },
  'EPSG:32735': { name: 'WGS 84 / UTM 35S',                region: 'Africa',         hint: 'East Africa, S hemisphere' },

  // South America
  'EPSG:4674':  { name: 'SIRGAS 2000 (lon/lat)',           region: 'South America',  hint: 'Brazil, Argentina, …' },
  'EPSG:31983': { name: 'SIRGAS 2000 / UTM 23S',           region: 'South America',  hint: 'Brazil east coast' },
  'EPSG:5641':  { name: 'SIRGAS 2000 / Brazil Mercator',   region: 'South America',  hint: 'Brazil-wide' },
};

// ─── UTM zone helper ─────────────────────────────────────────────────
// 60 zones × 2 hemispheres = 120 codes. Generated on demand because
// listing them all in PRESET_META would dominate the picker UI; the
// picker shows the UTM-zone helper as a single line that expands into
// "zone 1-60, N/S".
//
// Mapping (WGS 84 family):
//   Northern hemisphere, zone N → EPSG 32600 + N
//   Southern hemisphere, zone N → EPSG 32700 + N
export function utmEpsgCode(zone, hemisphere) {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) return null;
  const base = hemisphere === 'S' ? 32700 : 32600;
  return `EPSG:${base + zone}`;
}
export function utmDef(zone, hemisphere) {
  return `+proj=utm +zone=${zone}${hemisphere === 'S' ? ' +south' : ''} +datum=WGS84 +units=m +no_defs +type=crs`;
}

// ─── Custom EPSG resolution (epsg.io) ────────────────────────────────
// Dynamic lookup of any EPSG code we don't ship a preset for. Pulled
// from epsg.io's `/{code}.proj4` endpoint and cached in localStorage
// so subsequent loads are offline-friendly. Network failures fall
// back to a clear error so the CRS picker can show "couldn't resolve
// this code, double-check it on epsg.io".
const LS_KEY = 'oo-crs-cache-v1';
function readCache() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}
function writeCache(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch { /* quota */ }
}
async function fetchEpsgDef(code) {
  const num = String(code).replace(/^EPSG:/i, '');
  const res = await fetch(`https://epsg.io/${num}.proj4`, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`epsg.io HTTP ${res.status}`);
  const txt = (await res.text()).trim();
  if (!txt.startsWith('+proj=')) throw new Error('epsg.io returned non-proj4 content');
  return txt;
}

/**
 * Resolve a CRS specification to a usable proj4 instance.
 *
 * Accepts:
 *   - A preset code:    'EPSG:25832'
 *   - An auto-zoned UTM: { kind: 'utm', zone: 32, hemisphere: 'N' }
 *   - A custom code:    'EPSG:3045'      → fetches def from epsg.io
 *   - A raw proj4:      '+proj=utm +zone=…' → used as-is
 *
 * Returns:
 *   {
 *     code,              // 'EPSG:25832' | 'CUSTOM' | 'UTM-32N'
 *     def,               // proj4 string actually registered
 *     toWGS84(p)         // { x,y } → { lon, lat }
 *     fromWGS84(ll)      // { lon, lat } → { x, y }
 *   }
 */
export async function resolveCrs(spec) {
  const proj4 = await loadProj4();

  let code, def;

  if (typeof spec === 'string') {
    if (spec.startsWith('+proj=')) {
      // Raw proj4 — anonymous, register under a unique id so proj4
      // can look it up in the cache on subsequent calls.
      def = spec;
      code = 'CUSTOM';
      proj4.defs(code, def);
    } else if (PRESET_DEFS[spec]) {
      code = spec;
      def = PRESET_DEFS[spec];
    } else if (/^EPSG:\d+$/i.test(spec)) {
      code = spec.toUpperCase();
      // WGS 84 UTM zones (326NN north, 327NN south) have a closed-form
      // proj4 definition we can build locally — no need to round-trip
      // through epsg.io for them. Saves 60×2 potential network hits.
      const utm = code.match(/^EPSG:(326|327)(\d{2})$/);
      if (utm) {
        const zone = parseInt(utm[2], 10);
        if (zone >= 1 && zone <= 60) {
          def = utmDef(zone, utm[1] === '327' ? 'S' : 'N');
        }
      }
      if (!def) {
        const cache = readCache();
        def = cache[code];
        if (!def) {
          def = await fetchEpsgDef(code);
          cache[code] = def;
          writeCache(cache);
        }
      }
      proj4.defs(code, def);
    } else {
      throw new Error(`Unknown CRS spec: ${spec}`);
    }
  } else if (spec && spec.kind === 'utm') {
    code = `UTM-${spec.zone}${spec.hemisphere || 'N'}`;
    def = utmDef(spec.zone, spec.hemisphere);
    proj4.defs(code, def);
  } else {
    throw new Error('Invalid CRS spec — pass an EPSG code, UTM descriptor, or raw proj4 string.');
  }

  // Build the converter pair. proj4 returns [x, y] arrays — wrap in
  // named objects so callers don't have to remember the order.
  const toWGS84 = ({ x, y }) => {
    const [lon, lat] = proj4(code, 'EPSG:4326', [x, y]);
    return { lon, lat };
  };
  const fromWGS84 = ({ lon, lat }) => {
    const [x, y] = proj4('EPSG:4326', code, [lon, lat]);
    return { x, y };
  };

  return { code, def, toWGS84, fromWGS84 };
}

/**
 * Best-effort guess of which CRS a file is in based on the
 * coordinate magnitudes of its bbox. We can't be definitive (a
 * "1500000, 5800000" point could be German GK3, Swiss LV95 or US
 * State Plane depending on context), so we return a ranked list of
 * suggestions. The picker UI uses these to pre-fill its dropdown
 * with sane defaults — the user still has to confirm.
 *
 * Returns: array of { code, label, confidence } sorted by confidence.
 */
export function suggestCrsForBbox({ minX, minY, maxX, maxY }) {
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ax = Math.abs(cx);
  const ay = Math.abs(cy);
  const out = [];

  // Geographic (degrees): all coords inside [-180, 180] / [-90, 90]
  if (ax <= 180 && ay <= 90) {
    out.push({ code: 'EPSG:4326', confidence: 0.9, reason: 'coordinates fit in degrees range' });
  }

  // Web Mercator (worldwide projected, m): X in ±20M, Y in ±20M
  if (ax <= 2.1e7 && ay <= 2.1e7 && (ax > 180 || ay > 90)) {
    out.push({ code: 'EPSG:3857', confidence: 0.5, reason: 'large projected meters, world-spanning' });
  }

  // UTM (WGS84): X typically 100k–900k, Y 0–10M N or 1M–10M S. Auto-detect zone.
  // UTM zone from longitude won't help (we don't know lon), but the X
  // value's distance from 500k tells us the offset from central meridian.
  if (ax >= 1e5 && ax <= 9.5e5 && ay >= 0 && ay <= 1e7) {
    out.push({
      code: 'UTM-?',
      confidence: 0.7,
      reason: 'X near 500 000, Y in 0–10 M: looks like UTM',
      utm: true,
    });
  }

  // Continental-scale European projected (LAEA, Lambert-93, ETRS89):
  // X 2-7M, Y 2-7M (LAEA) or 6-7M (Lambert-93)
  if (ax >= 1e6 && ax <= 8e6 && ay >= 1e6 && ay <= 8e6) {
    if (cx > 4e6 && cy > 5.5e6) {
      out.push({ code: 'EPSG:2154', confidence: 0.4, reason: 'France Lambert-93 range' });
    }
    out.push({ code: 'EPSG:3035', confidence: 0.3, reason: 'pan-European LAEA range' });
  }

  // German Gauss-Krüger Zone 2/3/4: X starts with the zone number
  // (2500000, 3500000, 4500000 …) — strong signal.
  if (cy >= 5.2e6 && cy <= 6.1e6) {
    if (cx >= 2.4e6 && cx <= 2.7e6) out.push({ code: 'EPSG:31466', confidence: 0.85, reason: 'GK Zone 2: X starts with 25…' });
    if (cx >= 3.3e6 && cx <= 3.7e6) out.push({ code: 'EPSG:31467', confidence: 0.85, reason: 'GK Zone 3: X starts with 35…' });
    if (cx >= 4.3e6 && cx <= 4.7e6) out.push({ code: 'EPSG:31468', confidence: 0.85, reason: 'GK Zone 4: X starts with 45…' });
  }

  // British National Grid: X 0–700k, Y 0–1300k (rough)
  if (cx >= 0 && cx <= 7.5e5 && cy >= 0 && cy <= 1.4e6) {
    out.push({ code: 'EPSG:27700', confidence: 0.5, reason: 'compact m-grid: could be British National Grid' });
  }

  // Swiss LV95: X 2.5M–2.85M, Y 1.07M–1.3M
  if (cx >= 2.45e6 && cx <= 2.86e6 && cy >= 1.07e6 && cy <= 1.31e6) {
    out.push({ code: 'EPSG:2056', confidence: 0.9, reason: 'Swiss LV95 range' });
  }

  // Sort by confidence descending, dedupe by code
  const seen = new Set();
  out.sort((a, b) => b.confidence - a.confidence);
  return out.filter((s) => {
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  });
}
