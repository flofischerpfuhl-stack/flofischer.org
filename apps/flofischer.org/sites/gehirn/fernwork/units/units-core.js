// Fernwork Units · units-core.js
// One parser + converter + formatter for Units, the ⌘K answer row and the Calculator ("5 ft in cm" works the same
// everywhere). Pure ES module, no DOM. Kit-addition candidate: replaces kit/eval.js convertUnits().
//
//   parse('5\'3" in cm')            → result object (see parse() below)
//   format(x, { prec, fmt })         → display string ("1,600.2"), copyNum() → raw string ("1600.2")
//   answerFor('100 km/h in mph')     → kit-compatible answer row { kind: 'unit', q, value, unit, copy, open }
//
// Parser features: EN + DE aliases, case-aware symbols (Mb ≠ MB, Cal = kcal), Unicode minus/primes/fractions,
// 1e3, 1,234.5 / 1.234,5 / 1 234,5 with an ambiguity hint for 1.000, feet-inch notation (5'3", 5ft3in, 5 ft 3),
// unit arithmetic (5 m − 2 m), mixed numbers (1 1/2 cup), h:min[:s], slope ratios (1:50), DMS (48° 8′ 12″),
// compound targets (ft+in, st+lb, h:min:s, °′″) and category resolution by the other side (oz → fl oz in ml).

const PI = Math.PI;
const DEG = PI / 180;

// ───────────────────────────── categories ─────────────────────────────
export const CATS = [
  { id: 'length', label: 'Length', icon: 'ruler', example: '5 ft 3 in in cm', groups: [['metric', 'Metric'], ['imperial', 'Imperial'], ['other', 'Other']] },
  { id: 'mass', label: 'Weight', icon: 'weight', example: '70 kg in lb', groups: [['metric', 'Metric'], ['imperial', 'Imperial'], ['other', 'Other']] },
  { id: 'temperature', label: 'Temperature', icon: 'thermometer', example: '20 °C in °F', groups: [['metric', 'Metric'], ['imperial', 'Imperial']] },
  { id: 'volume', label: 'Volume', icon: 'beaker', example: '2 l in cups', groups: [['metric', 'Metric'], ['us', 'US'], ['uk', 'Imperial (UK)']] },
  { id: 'area', label: 'Area', icon: 'square', example: '80 m² in sq ft', groups: [['metric', 'Metric'], ['imperial', 'Imperial']] },
  { id: 'speed', label: 'Speed', icon: 'gauge', example: '100 km/h in mph', groups: [['metric', 'Metric'], ['imperial', 'Imperial'], ['other', 'Other']] },
  { id: 'time', label: 'Time', icon: 'timer', example: '90 min in h', groups: [['si', 'Clock'], ['cal', 'Calendar']] },
  { id: 'fuel', label: 'Fuel', icon: 'fuel', example: '7 l/100km in mpg', groups: [['metric', 'Metric'], ['imperial', 'Imperial']] },
  { id: 'data', label: 'Data', icon: 'database', example: '1 GB in MiB', groups: [['si', 'Bytes (SI)'], ['iec', 'Binary (IEC)'], ['bits', 'Bits']] },
  { id: 'rate', label: 'Data rate', icon: 'wifi', example: '100 Mbit/s in MB/s', groups: [['bits', 'Bits per second'], ['bytes', 'Bytes per second']] },
  { id: 'pressure', label: 'Pressure', icon: 'gauge', example: '2.2 bar in psi', groups: [['metric', 'Metric'], ['imperial', 'Imperial'], ['other', 'Other']] },
  { id: 'energy', label: 'Energy', icon: 'zap', example: '250 kcal in kJ', groups: [['metric', 'Metric'], ['cal', 'Calories'], ['imperial', 'Imperial'], ['other', 'Other']] },
  { id: 'power', label: 'Power', icon: 'zap', example: '150 PS in kW', groups: [['metric', 'Metric'], ['hp', 'Horsepower'], ['imperial', 'Imperial']] },
  { id: 'angle', label: 'Angle & slope', icon: 'triangle-right', example: '12 % in °', groups: [['angle', 'Angle'], ['slope', 'Slope']] },
  { id: 'frequency', label: 'Frequency', icon: 'activity', example: '3000 rpm in Hz', groups: [['si', 'Frequency'], ['rot', 'Rotation']] },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

// ───────────────────────────── units ─────────────────────────────
// f: factor to the category base unit (m, kg, L, m², m/s, s, Pa, J, W, B, B/s, rad, Hz, km/L).
// Non-linear units have to(x) → base and from(base) → x. exact:false = the definition itself is rounded.
export const UNITS = {};
const ORDER = [];
const CI = new Map(); // normalised lower-case alias → [ids]
const CS = new Map(); // case-sensitive alias → [ids]
function add(map, key, ids) { const cur = map.get(key) || []; for (const id of ids) if (!cur.includes(id)) cur.push(id); map.set(key, cur); }
const nk = (s) => s.replace(/\s+/g, '').toLowerCase();
const nks = (s) => s.replace(/\s+/g, '');
const SPACED = new Map(); // normalised key → original spelling with spaces ("floz" → "fl oz") for the match patterns
function noteSpaced(a) { if (/\s/.test(String(a).trim())) { SPACED.set(nk(a), a.trim()); SPACED.set(nks(a), a.trim()); } }
function U(cat, id, sym, name, f, o = {}) {
  const u = { cat, id, sym, name, plural: o.plural || name + 's', f: typeof f === 'number' ? f : null, sys: o.sys || 'metric', exact: o.exact !== false,
    to: o.to, from: o.from, note: o.note || '', de: o.de || '', short: o.short || sym, hidden: !!o.hidden, smaller: o.smaller, nice: o.nice };
  UNITS[id] = u; ORDER.push(id);
  for (const a of o.cs || []) { add(CS, nks(a), [id]); noteSpaced(a); }
  const ci = [...(o.csSym ? [] : [sym]), name, u.plural, ...(o.ci || [])];
  if (o.csSym) { add(CS, nks(sym), [id]); noteSpaced(sym); }
  for (const a of ci) { add(CI, nk(a), [id]); noteSpaced(a); }
  return u;
}
// explicit ambiguous aliases (first = default reading)
const AMBIG_CI = [];
const AMBIG_CS = [];
const amb = (alias, ids, cs = false) => { noteSpaced(alias); (cs ? AMBIG_CS : AMBIG_CI).push([alias, ids]); };

// Length (m)
U('length', 'nm', 'nm', 'nanometer', 1e-9, { ci: ['nanometre', 'nanometres', 'Nanometer'] });
U('length', 'um', 'µm', 'micrometer', 1e-6, { ci: ['μm', 'um', 'micron', 'microns', 'micrometre', 'micrometres', 'Mikrometer', 'mikron'] });
U('length', 'mm', 'mm', 'millimeter', 1e-3, { ci: ['millimetre', 'millimetres', 'Millimeter'] });
U('length', 'cm', 'cm', 'centimeter', 1e-2, { ci: ['centimetre', 'centimetres', 'Zentimeter', 'cms'] });
U('length', 'dm', 'dm', 'decimeter', 0.1, { ci: ['decimetre', 'Dezimeter'] });
U('length', 'm', 'm', 'meter', 1, { ci: ['metre', 'metres', 'Meter', 'mtr'], smaller: 'cm' });
U('length', 'km', 'km', 'kilometer', 1000, { ci: ['kilometre', 'kilometres', 'Kilometer', 'kms', 'klicks'] });
U('length', 'in', 'in', 'inch', 0.0254, { sys: 'imperial', plural: 'inches', ci: ['"', '″', "''", 'Zoll', 'inch.', 'ins'] });
U('length', 'ft', 'ft', 'foot', 0.3048, { sys: 'imperial', plural: 'feet', ci: ["'", '′', 'feet', 'Fuß', 'Fuss', 'foots'], smaller: 'in' });
U('length', 'yd', 'yd', 'yard', 0.9144, { sys: 'imperial', ci: ['yds', 'Yard'], smaller: 'ft' });
U('length', 'mi', 'mi', 'mile', 1609.344, { sys: 'imperial', ci: ['Meile', 'Meilen', 'statute mile', 'statute miles'] });
U('length', 'mil', 'mil', 'mil', 2.54e-5, { sys: 'imperial', ci: ['thou', 'thous', 'mils'], note: '1/1000 inch' });
U('length', 'nmi', 'nmi', 'nautical mile', 1852, { sys: 'other', cs: ['NM', 'sm'], ci: ['Seemeile', 'Seemeilen', 'nautical miles'] });
U('length', 'au', 'au', 'astronomical unit', 149597870700, { sys: 'other', ci: ['AE'] });
U('length', 'ly', 'ly', 'light-year', 9460730472580800, { sys: 'other', ci: ['light year', 'light years', 'lightyear', 'lightyears', 'Lichtjahr', 'Lichtjahre'] });
amb('nm', ['nm', 'nmi']);

// Mass (kg)
U('mass', 'ug', 'µg', 'microgram', 1e-9, { ci: ['μg', 'ug', 'mcg', 'Mikrogramm'] });
U('mass', 'mg', 'mg', 'milligram', 1e-6, { ci: ['milligramme', 'Milligramm'] });
U('mass', 'g', 'g', 'gram', 1e-3, { ci: ['gramme', 'grammes', 'Gramm', 'gr', 'grams'] });
U('mass', 'kg', 'kg', 'kilogram', 1, { ci: ['kilo', 'kilos', 'kgs', 'kilogramme', 'Kilogramm'], smaller: 'g' });
U('mass', 't', 't', 'tonne', 1000, { ci: ['metric ton', 'metric tons', 'Tonne', 'Tonnen'], csSym: true });
U('mass', 'oz', 'oz', 'ounce', 0.028349523125, { sys: 'imperial', ci: ['Unze', 'Unzen', 'ozs'] });
U('mass', 'lb', 'lb', 'pound', 0.45359237, { sys: 'imperial', ci: ['lbs', 'pounds', 'lb.'], smaller: 'oz' });
U('mass', 'st', 'st', 'stone', 6.35029318, { sys: 'imperial', plural: 'stone', ci: ['stones'], smaller: 'lb' });
U('mass', 'tonus', 'US ton', 'short ton', 907.18474, { sys: 'imperial', ci: ['short tons', 'us ton', 'us tons', 'ton (US)'] });
U('mass', 'tonuk', 'UK ton', 'long ton', 1016.0469088, { sys: 'imperial', ci: ['long tons', 'uk ton', 'uk tons', 'ton (UK)'] });
U('mass', 'ct', 'ct', 'carat', 2e-4, { sys: 'other', ci: ['Karat', 'carats'] });
U('mass', 'ozt', 'oz t', 'troy ounce', 0.0311034768, { sys: 'other', ci: ['ozt', 'troy oz', 'Feinunze'] });
U('mass', 'pfund', 'Pfund', 'German pound', 0.5, { sys: 'other', plural: 'German pounds', ci: ['Pfund (DE)'], note: '500 g', hidden: true });
amb('ton', ['t', 'tonus', 'tonuk']); amb('tons', ['t', 'tonus', 'tonuk']);
amb('pfund', ['lb', 'pfund']);

// Temperature (K)
const T = (to, from) => ({ to, from });
U('temperature', 'c', '°C', 'degree Celsius', null, { ...T((x) => x + 273.15, (k) => k - 273.15), plural: 'degrees Celsius', short: '°C',
  ci: ['℃', 'celsius', 'degC', 'deg C', 'degrees C', 'degree C', 'Grad Celsius', '° C', 'centigrade'], cs: ['C', 'c'] });
U('temperature', 'f', '°F', 'degree Fahrenheit', null, { sys: 'imperial', ...T((x) => (x - 32) * 5 / 9 + 273.15, (k) => (k - 273.15) * 9 / 5 + 32), plural: 'degrees Fahrenheit',
  ci: ['℉', 'fahrenheit', 'degF', 'deg F', 'degrees F', 'degree F', '° F'], cs: ['F', 'f'] });
U('temperature', 'k', 'K', 'kelvin', null, { ...T((x) => x, (k) => k), plural: 'kelvin', ci: ['kelvins', '°K'], csSym: true });
U('temperature', 'r', '°R', 'degree Rankine', null, { sys: 'imperial', ...T((x) => x * 5 / 9, (k) => k * 9 / 5), plural: 'degrees Rankine', ci: ['rankine', '° R'] });
amb('grad', ['c', 'deg', 'gon']);

// Volume (L)
U('volume', 'ml', 'ml', 'milliliter', 1e-3, { ci: ['mL', 'millilitre', 'millilitres', 'Milliliter'] });
U('volume', 'cl', 'cl', 'centiliter', 1e-2, { ci: ['cL', 'centilitre', 'Zentiliter'] });
U('volume', 'dl', 'dl', 'deciliter', 0.1, { ci: ['dL', 'decilitre', 'Deziliter'] });
U('volume', 'l', 'L', 'liter', 1, { ci: ['l', 'litre', 'litres', 'Liter', 'ltr', 'lt'] });
U('volume', 'hl', 'hl', 'hectoliter', 100, { ci: ['hL', 'Hektoliter'] });
U('volume', 'cm3', 'cm³', 'cubic centimeter', 1e-3, { ci: ['cm3', 'cc', 'ccm', 'cm^3', 'cubic centimeters', 'Kubikzentimeter'] });
U('volume', 'm3', 'm³', 'cubic meter', 1000, { ci: ['m3', 'm^3', 'cbm', 'cubic meters', 'cubic metre', 'cubic metres', 'Kubikmeter'] });
U('volume', 'tsp', 'tsp', 'teaspoon', 0.00492892159375, { sys: 'us', ci: ['teaspoons', 'TL', 'Teelöffel', 'tsps'] });
U('volume', 'tbsp', 'tbsp', 'tablespoon', 0.01478676478125, { sys: 'us', ci: ['tablespoons', 'EL', 'Esslöffel', 'tbsps', 'tbs'] });
U('volume', 'flozus', 'fl oz', 'US fluid ounce', 0.0295735295625, { sys: 'us', ci: ['floz', 'fl. oz.', 'fl.oz', 'fluid ounce', 'fluid ounces', 'us fl oz', 'fl oz (US)'] });
U('volume', 'cup', 'cup', 'US cup', 0.2365882365, { sys: 'us', plural: 'US cups', ci: ['cups', 'Tasse', 'Tassen'] });
U('volume', 'ptus', 'pt', 'US pint', 0.473176473, { sys: 'us', ci: ['pints', 'pint', 'us pt', 'pt (US)'] });
U('volume', 'qtus', 'qt', 'US quart', 0.946352946, { sys: 'us', ci: ['quarts', 'quart', 'us qt', 'qt (US)'] });
U('volume', 'galus', 'gal', 'US gallon', 3.785411784, { sys: 'us', ci: ['gallons', 'gallon', 'us gal', 'gal (US)', 'gal us', 'Gallone', 'Gallonen'] });
U('volume', 'in3', 'in³', 'cubic inch', 0.016387064, { sys: 'us', plural: 'cubic inches', ci: ['in3', 'cu in', 'in^3'] });
U('volume', 'ft3', 'ft³', 'cubic foot', 28.316846592, { sys: 'us', plural: 'cubic feet', ci: ['ft3', 'cu ft', 'ft^3', 'cubic feet'] });
U('volume', 'bbl', 'bbl', 'oil barrel', 158.987294928, { sys: 'us', ci: ['barrel', 'barrels', 'Barrel'] });
U('volume', 'flozuk', 'fl oz (UK)', 'UK fluid ounce', 0.0284130625, { sys: 'uk', ci: ['uk fl oz', 'imp fl oz', 'fl oz uk'] });
U('volume', 'ptuk', 'pt (UK)', 'UK pint', 0.56826125, { sys: 'uk', ci: ['uk pt', 'uk pint', 'imperial pint', 'imp pt', 'pt uk', 'pint uk'] });
U('volume', 'qtuk', 'qt (UK)', 'UK quart', 1.1365225, { sys: 'uk', ci: ['uk qt', 'imp qt', 'qt uk'] });
U('volume', 'galuk', 'gal (UK)', 'UK gallon', 4.54609, { sys: 'uk', ci: ['uk gal', 'imp gal', 'imperial gallon', 'imperial gallons', 'gal uk', 'uk gallon', 'uk gallons'] });
amb('gal', ['galus', 'galuk']); amb('gallon', ['galus', 'galuk']); amb('gallons', ['galus', 'galuk']);
amb('pt', ['ptus', 'ptuk']); amb('pint', ['ptus', 'ptuk']); amb('pints', ['ptus', 'ptuk']);
amb('qt', ['qtus', 'qtuk']); amb('fl oz', ['flozus', 'flozuk']); amb('floz', ['flozus', 'flozuk']);
amb('oz', ['oz', 'flozus', 'flozuk']); amb('ounce', ['oz', 'flozus']); amb('ounces', ['oz', 'flozus']);

// Area (m²)
U('area', 'mm2', 'mm²', 'square millimeter', 1e-6, { ci: ['mm2', 'mm^2', 'sq mm', 'Quadratmillimeter'] });
U('area', 'cm2', 'cm²', 'square centimeter', 1e-4, { ci: ['cm2', 'cm^2', 'sq cm', 'qcm', 'Quadratzentimeter'] });
U('area', 'm2', 'm²', 'square meter', 1, { ci: ['m2', 'm^2', 'sqm', 'sq m', 'qm', 'square meters', 'square metre', 'square metres', 'Quadratmeter'] });
U('area', 'a', 'a', 'are', 100, { ci: ['ares', 'Ar'], hidden: false });
U('area', 'ha', 'ha', 'hectare', 1e4, { ci: ['hectares', 'Hektar'] });
U('area', 'km2', 'km²', 'square kilometer', 1e6, { ci: ['km2', 'km^2', 'sq km', 'qkm', 'square kilometers', 'Quadratkilometer'] });
U('area', 'in2', 'in²', 'square inch', 0.00064516, { sys: 'imperial', plural: 'square inches', ci: ['in2', 'in^2', 'sq in', 'sqin'] });
U('area', 'ft2', 'ft²', 'square foot', 0.09290304, { sys: 'imperial', plural: 'square feet', ci: ['ft2', 'ft^2', 'sq ft', 'sqft', 'sq. ft.', 'sq.ft', 'square feet'] });
U('area', 'yd2', 'yd²', 'square yard', 0.83612736, { sys: 'imperial', ci: ['yd2', 'yd^2', 'sq yd'] });
U('area', 'acre', 'acre', 'acre', 4046.8564224, { sys: 'imperial', ci: ['acres', 'ac'] });
U('area', 'mi2', 'mi²', 'square mile', 2589988.110336, { sys: 'imperial', ci: ['mi2', 'mi^2', 'sq mi'] });

// Speed (m/s)
U('speed', 'mps', 'm/s', 'meter per second', 1, { plural: 'meters per second', ci: ['mps', 'm/sec', 'meters per second', 'metres per second'] });
U('speed', 'kmh', 'km/h', 'kilometer per hour', 1 / 3.6, { plural: 'kilometers per hour', ci: ['kmh', 'kph', 'kmph', 'km/hr', 'km/std', 'kilometers per hour', 'kilometres per hour', 'Stundenkilometer', 'km per hour'] });
U('speed', 'mph', 'mph', 'mile per hour', 0.44704, { sys: 'imperial', plural: 'miles per hour', ci: ['mi/h', 'miles per hour', 'mi/hr'] });
U('speed', 'fps', 'ft/s', 'foot per second', 0.3048, { sys: 'imperial', plural: 'feet per second', ci: ['fps', 'ft/sec', 'feet per second'] });
U('speed', 'kn', 'kn', 'knot', 1852 / 3600, { sys: 'other', ci: ['knots', 'kt', 'kts', 'Knoten'] });
U('speed', 'mach', 'Mach', 'Mach', 340.29, { sys: 'other', plural: 'Mach', exact: false, note: 'at sea level, 15 °C' });

// Time (s)
U('time', 'ns', 'ns', 'nanosecond', 1e-9, { sys: 'si', ci: ['nanoseconds', 'Nanosekunde', 'Nanosekunden'] });
U('time', 'us', 'µs', 'microsecond', 1e-6, { sys: 'si', ci: ['μs', 'us', 'microseconds', 'Mikrosekunde', 'Mikrosekunden'] });
U('time', 'ms', 'ms', 'millisecond', 1e-3, { sys: 'si', ci: ['milliseconds', 'msec', 'Millisekunde', 'Millisekunden'] });
U('time', 's', 's', 'second', 1, { sys: 'si', ci: ['sec', 'secs', 'seconds', 'Sekunde', 'Sekunden', 'sek'] });
U('time', 'min', 'min', 'minute', 60, { sys: 'si', ci: ['mins', 'minutes', 'Minute', 'Minuten'], smaller: 's' });
U('time', 'h', 'h', 'hour', 3600, { sys: 'si', ci: ['hr', 'hrs', 'hours', 'Stunde', 'Stunden', 'std'], smaller: 'min' });
U('time', 'd', 'd', 'day', 86400, { sys: 'cal', ci: ['days', 'Tag', 'Tage', 'Tagen'], smaller: 'h' });
U('time', 'wk', 'wk', 'week', 604800, { sys: 'cal', ci: ['weeks', 'wks', 'Woche', 'Wochen'] });
U('time', 'mo', 'mo', 'month', 2629746, { sys: 'cal', ci: ['months', 'Monat', 'Monate', 'mon', 'mos'], note: 'average, 30.44 d' });
U('time', 'yr', 'yr', 'year', 31556952, { sys: 'cal', ci: ['years', 'yrs', 'y', 'Jahr', 'Jahre', 'Jahren'], note: 'average, 365.2425 d' });

// Pressure (Pa)
U('pressure', 'pa', 'Pa', 'pascal', 1, { ci: ['pascals'] });
U('pressure', 'hpa', 'hPa', 'hectopascal', 100, { ci: ['hectopascals', 'Hektopascal'] });
U('pressure', 'kpa', 'kPa', 'kilopascal', 1000, { ci: ['kilopascals'] });
U('pressure', 'mpa', 'MPa', 'megapascal', 1e6, { csSym: true, ci: ['megapascals'] });
U('pressure', 'bar', 'bar', 'bar', 1e5, { plural: 'bar', ci: ['bars'] });
U('pressure', 'mbar', 'mbar', 'millibar', 100, { ci: ['millibars'] });
U('pressure', 'psi', 'psi', 'pound per square inch', 6894.757293168361, { sys: 'imperial', plural: 'pounds per square inch', ci: ['lbf/in²', 'lb/in2'] });
U('pressure', 'inhg', 'inHg', 'inch of mercury', 3386.389, { sys: 'imperial', plural: 'inches of mercury', exact: false, ci: ['in hg'] });
U('pressure', 'atm', 'atm', 'atmosphere', 101325, { sys: 'other', ci: ['atmospheres', 'Atmosphäre'] });
U('pressure', 'mmhg', 'mmHg', 'millimeter of mercury', 133.322387415, { sys: 'other', plural: 'millimeters of mercury', ci: ['mm hg'] });
U('pressure', 'torr', 'Torr', 'torr', 101325 / 760, { sys: 'other', plural: 'torr' });

// Energy (J)
U('energy', 'j', 'J', 'joule', 1, { ci: ['joules'], csSym: true, cs: ['j'] });
U('energy', 'kj', 'kJ', 'kilojoule', 1e3, { ci: ['kilojoules', 'kj'] });
U('energy', 'mj', 'MJ', 'megajoule', 1e6, { csSym: true, ci: ['megajoules'] });
U('energy', 'wh', 'Wh', 'watt-hour', 3600, { ci: ['watt hour', 'watt hours', 'Wattstunde', 'Wattstunden'] });
U('energy', 'kwh', 'kWh', 'kilowatt-hour', 3.6e6, { ci: ['kilowatt hour', 'kilowatt hours', 'Kilowattstunde', 'Kilowattstunden'] });
U('energy', 'cal', 'cal', 'calorie', 4.184, { sys: 'cal', csSym: true, note: 'small calorie' });
U('energy', 'kcal', 'kcal', 'kilocalorie', 4184, { sys: 'cal', ci: ['kilocalories', 'Kilokalorie', 'Kilokalorien', 'kcals'], note: '= food Calorie (Cal)' });
U('energy', 'btu', 'BTU', 'British thermal unit', 1055.05585262, { sys: 'imperial', ci: ['btus'] });
U('energy', 'ftlbf', 'ft·lbf', 'foot-pound', 1.3558179483314004, { sys: 'imperial', ci: ['ft lbf', 'ft-lb', 'ftlb', 'foot pound', 'foot pounds'] });
U('energy', 'ev', 'eV', 'electronvolt', 1.602176634e-19, { sys: 'other', ci: ['electron volt', 'electronvolts'] });
amb('Cal', ['kcal', 'cal'], true); amb('cal', ['cal', 'kcal'], true);
amb('calorie', ['kcal', 'cal']); amb('calories', ['kcal', 'cal']); amb('Kalorien', ['kcal', 'cal']); amb('CAL', ['kcal', 'cal']);

// Power (W)
U('power', 'mw', 'mW', 'milliwatt', 1e-3, { csSym: true, ci: ['milliwatts'] });
U('power', 'w', 'W', 'watt', 1, { ci: ['watts', 'Watt'] });
U('power', 'kw', 'kW', 'kilowatt', 1e3, { ci: ['kilowatts', 'Kilowatt'] });
U('power', 'megaw', 'MW', 'megawatt', 1e6, { csSym: true, ci: ['megawatts', 'Megawatt'] });
U('power', 'hp', 'hp', 'horsepower', 745.69987158227022, { sys: 'hp', plural: 'horsepower', ci: ['bhp'], note: 'mechanical' });
U('power', 'ps', 'PS', 'metric horsepower', 735.49875, { sys: 'hp', plural: 'metric horsepower', csSym: true, cs: ['ps', 'Ps'], ci: ['Pferdestärke', 'Pferdestärken', 'cv'] });
U('power', 'btuh', 'BTU/h', 'BTU per hour', 0.29307107017222, { sys: 'imperial', plural: 'BTU per hour', ci: ['btu/hr'] });
amb('hp', ['hp', 'ps']);

// Data (B)
U('data', 'B', 'B', 'byte', 1, { sys: 'si', csSym: true, ci: ['bytes', 'Byte'] });
U('data', 'kB', 'kB', 'kilobyte', 1e3, { sys: 'si', csSym: true, ci: ['kilobytes', 'kbyte'] });
U('data', 'MB', 'MB', 'megabyte', 1e6, { sys: 'si', csSym: true, ci: ['megabytes', 'mbyte'] });
U('data', 'GB', 'GB', 'gigabyte', 1e9, { sys: 'si', csSym: true, ci: ['gigabytes', 'gbyte'] });
U('data', 'TB', 'TB', 'terabyte', 1e12, { sys: 'si', csSym: true, ci: ['terabytes'] });
U('data', 'PB', 'PB', 'petabyte', 1e15, { sys: 'si', csSym: true, ci: ['petabytes'] });
U('data', 'KiB', 'KiB', 'kibibyte', 1024, { sys: 'iec', ci: ['kibibytes'] });
U('data', 'MiB', 'MiB', 'mebibyte', 1048576, { sys: 'iec', ci: ['mebibytes'] });
U('data', 'GiB', 'GiB', 'gibibyte', 1073741824, { sys: 'iec', ci: ['gibibytes'] });
U('data', 'TiB', 'TiB', 'tebibyte', 1099511627776, { sys: 'iec', ci: ['tebibytes'] });
U('data', 'bit', 'bit', 'bit', 0.125, { sys: 'bits', ci: ['bits'] });
U('data', 'kbit', 'kbit', 'kilobit', 125, { sys: 'bits', ci: ['kilobits'] });
U('data', 'Mbit', 'Mbit', 'megabit', 125000, { sys: 'bits', ci: ['megabits'] });
U('data', 'Gbit', 'Gbit', 'gigabit', 1.25e8, { sys: 'bits', ci: ['gigabits'] });
U('data', 'Tbit', 'Tbit', 'terabit', 1.25e11, { sys: 'bits', ci: ['terabits'] });
// case-aware readings: capital B = bytes, lower-case b = bits; KB is the common misspelling of kB
amb('Mb', ['Mbit', 'MB'], true); amb('Kb', ['kbit', 'kB'], true); amb('kb', ['kbit', 'kB'], true); amb('Gb', ['Gbit', 'GB'], true); amb('Tb', ['Tbit', 'TB'], true);
amb('KB', ['kB', 'KiB'], true); amb('b', ['bit', 'B'], true);
amb('mb', ['MB', 'Mbit', 'mbar']); amb('gb', ['GB', 'Gbit']); amb('tb', ['TB', 'Tbit']);

// Data rate (B/s)
U('rate', 'bps', 'bit/s', 'bit per second', 0.125, { sys: 'bits', plural: 'bits per second', ci: ['bps', 'b/s'] });
U('rate', 'kbps', 'kbit/s', 'kilobit per second', 125, { sys: 'bits', plural: 'kilobits per second', ci: ['kbps', 'kb/s', 'kbit/sec'] });
U('rate', 'mbps', 'Mbit/s', 'megabit per second', 125000, { sys: 'bits', plural: 'megabits per second', ci: ['mbps', 'mbit/sec'], cs: ['Mb/s'] });
U('rate', 'gbps', 'Gbit/s', 'gigabit per second', 1.25e8, { sys: 'bits', plural: 'gigabits per second', ci: ['gbps', 'gbit/sec'], cs: ['Gb/s'] });
U('rate', 'Bps', 'B/s', 'byte per second', 1, { sys: 'bytes', plural: 'bytes per second', csSym: true });
U('rate', 'kBps', 'kB/s', 'kilobyte per second', 1e3, { sys: 'bytes', plural: 'kilobytes per second', csSym: true, cs: ['KB/s', 'kBps', 'KBps'] });
U('rate', 'MBps', 'MB/s', 'megabyte per second', 1e6, { sys: 'bytes', plural: 'megabytes per second', csSym: true, cs: ['MBps'] });
U('rate', 'GBps', 'GB/s', 'gigabyte per second', 1e9, { sys: 'bytes', plural: 'gigabytes per second', csSym: true, cs: ['GBps'] });
U('rate', 'MiBps', 'MiB/s', 'mebibyte per second', 1048576, { sys: 'bytes', plural: 'mebibytes per second' });
amb('mb/s', ['MBps', 'mbps']); amb('gb/s', ['GBps', 'gbps']);

// Angle & slope (rad)
U('angle', 'deg', '°', 'degree', DEG, { sys: 'angle', ci: ['deg', 'degs', 'degree', 'degrees', 'Winkelgrad'], smaller: 'arcmin' });
U('angle', 'arcmin', '′', 'arcminute', DEG / 60, { sys: 'angle', ci: ['arcmin', 'arcminutes', 'arc minute', 'arc minutes', 'Winkelminute'], smaller: 'arcsec' });
U('angle', 'arcsec', '″', 'arcsecond', DEG / 3600, { sys: 'angle', ci: ['arcsec', 'arcseconds', 'arc second', 'arc seconds'] });
U('angle', 'rad', 'rad', 'radian', 1, { sys: 'angle', ci: ['radians', 'Radiant'] });
U('angle', 'gon', 'gon', 'gradian', PI / 200, { sys: 'angle', ci: ['gradians', 'grads', 'Neugrad'] });
U('angle', 'turn', 'turn', 'turn', 2 * PI, { sys: 'angle', ci: ['turns', 'rev', 'revolution', 'revolutions', 'Umdrehung', 'Umdrehungen'] });
U('angle', 'pct', '%', 'percent grade', null, { sys: 'slope', plural: 'percent grade', to: (x) => Math.atan(x / 100), from: (r) => Math.tan(r) * 100, ci: ['percent', 'pct', 'Prozent', '% grade', '% slope'] });
U('angle', 'permil', '‰', 'per mille grade', null, { sys: 'slope', plural: 'per mille grade', to: (x) => Math.atan(x / 1000), from: (r) => Math.tan(r) * 1000, ci: ['permille', 'per mille', 'Promille'] });
U('angle', 'ratio', '1:n', 'slope ratio', null, { sys: 'slope', plural: 'slope ratio', to: (n) => Math.atan(1 / n), from: (r) => 1 / Math.tan(r), ci: ['ratio', '1:x', 'Verhältnis'] });
amb('°', ['deg', 'c']); amb("'", ['ft', 'arcmin']); amb('′', ['ft', 'arcmin']); amb('"', ['in', 'arcsec']); amb('″', ['in', 'arcsec']); amb("''", ['in', 'arcsec']);

// Frequency (Hz)
U('frequency', 'hz', 'Hz', 'hertz', 1, { sys: 'si', plural: 'hertz' });
U('frequency', 'khz', 'kHz', 'kilohertz', 1e3, { sys: 'si', plural: 'kilohertz' });
U('frequency', 'mhz', 'MHz', 'megahertz', 1e6, { sys: 'si', plural: 'megahertz' });
U('frequency', 'ghz', 'GHz', 'gigahertz', 1e9, { sys: 'si', plural: 'gigahertz' });
U('frequency', 'rpm', 'rpm', 'revolution per minute', 1 / 60, { sys: 'rot', plural: 'revolutions per minute', ci: ['U/min', 'r/min', 'bpm', 'rev/min', 'revolutions per minute', 'Umdrehungen pro Minute'] });

// Fuel economy (km/L)
const MPGUS = 1.609344 / 3.785411784, MPGUK = 1.609344 / 4.54609;
U('fuel', 'l100km', 'L/100km', 'liters per 100 km', null, { plural: 'liters per 100 km', to: (x) => 100 / x, from: (k) => 100 / k,
  ci: ['l/100km', 'l/100 km', 'l per 100km', 'l per 100 km', 'liter/100km', 'liters per 100km', 'litres per 100 km', 'Liter pro 100 km', 'Liter auf 100 km', 'l/100', 'lp100k'] });
U('fuel', 'kml', 'km/L', 'kilometers per liter', 1, { plural: 'kilometers per liter', ci: ['km/l', 'kmpl', 'km per liter', 'km per litre'] });
U('fuel', 'mpgus', 'mpg (US)', 'miles per US gallon', MPGUS, { sys: 'imperial', plural: 'miles per US gallon', ci: ['mpg us', 'us mpg', 'mpgus', 'mpg(us)'] });
U('fuel', 'mpguk', 'mpg (UK)', 'miles per UK gallon', MPGUK, { sys: 'imperial', plural: 'miles per UK gallon', ci: ['mpg uk', 'uk mpg', 'mpguk', 'mpg imp', 'imperial mpg', 'mpg(uk)'] });
amb('mpg', ['mpgus', 'mpguk']); amb('miles per gallon', ['mpgus', 'mpguk']);

for (const [a, ids] of AMBIG_CI) { CI.set(nk(a), [...ids]); }
for (const [a, ids] of AMBIG_CS) { CS.set(nks(a), [...ids]); }
// 'm' in a time context means minutes ("90 m in h"); listed after meter so length wins by default
add(CI, 'm', ['min']);

// default counterparts ("70 kg" → lb)
const PAIR = {
  nm: 'um', um: 'mm', mm: 'in', cm: 'in', dm: 'in', m: 'ft', km: 'mi', mil: 'mm', in: 'cm', ft: 'm', yd: 'm', mi: 'km', nmi: 'km', au: 'km', ly: 'km',
  ug: 'mg', mg: 'g', g: 'oz', kg: 'lb', t: 'tonus', oz: 'g', lb: 'kg', st: 'kg', tonus: 't', tonuk: 't', ct: 'g', ozt: 'g', pfund: 'kg',
  c: 'f', f: 'c', k: 'c', r: 'f',
  ml: 'flozus', cl: 'flozus', dl: 'cup', l: 'galus', hl: 'galus', cm3: 'ml', m3: 'ft3', tsp: 'ml', tbsp: 'ml', flozus: 'ml', cup: 'ml', ptus: 'l', qtus: 'l', galus: 'l', in3: 'cm3', ft3: 'l', bbl: 'l', flozuk: 'ml', ptuk: 'l', qtuk: 'l', galuk: 'l',
  mm2: 'in2', cm2: 'in2', m2: 'ft2', a: 'm2', ha: 'acre', km2: 'mi2', in2: 'cm2', ft2: 'm2', yd2: 'm2', acre: 'ha', mi2: 'km2',
  mps: 'kmh', kmh: 'mph', mph: 'kmh', fps: 'mps', kn: 'kmh', mach: 'kmh',
  ns: 'us', us: 'ms', ms: 's', s: 'min', min: 'h', h: 'min', d: 'h', wk: 'd', mo: 'd', yr: 'd',
  pa: 'hpa', hpa: 'inhg', kpa: 'psi', mpa: 'psi', bar: 'psi', mbar: 'inhg', psi: 'bar', inhg: 'hpa', atm: 'bar', mmhg: 'hpa', torr: 'hpa',
  j: 'cal', kj: 'kcal', mj: 'kwh', wh: 'j', kwh: 'mj', cal: 'j', kcal: 'kj', btu: 'kj', ftlbf: 'j', ev: 'j',
  mw: 'w', w: 'hp', kw: 'hp', megaw: 'hp', hp: 'kw', ps: 'kw', btuh: 'w',
  B: 'bit', kB: 'KiB', MB: 'MiB', GB: 'GiB', TB: 'TiB', PB: 'TB', KiB: 'kB', MiB: 'MB', GiB: 'GB', TiB: 'TB', bit: 'B', kbit: 'kB', Mbit: 'MB', Gbit: 'GB', Tbit: 'TB',
  bps: 'Bps', kbps: 'kBps', mbps: 'MBps', gbps: 'MBps', Bps: 'bps', kBps: 'kbps', MBps: 'mbps', GBps: 'gbps', MiBps: 'mbps',
  deg: 'rad', arcmin: 'deg', arcsec: 'deg', rad: 'deg', gon: 'deg', turn: 'deg', pct: 'deg', permil: 'deg', ratio: 'pct',
  hz: 'rpm', khz: 'hz', mhz: 'khz', ghz: 'mhz', rpm: 'hz',
  l100km: 'mpgus', kml: 'l100km', mpgus: 'l100km', mpguk: 'l100km',
};
// families for best-fit target sizes
const FAM = [['mm', 'cm', 'm', 'km'], ['in', 'ft', 'yd', 'mi'], ['mg', 'g', 'kg', 't'], ['ml', 'l', 'm3'], ['ns', 'us', 'ms', 's', 'min', 'h', 'd'],
  ['B', 'kB', 'MB', 'GB', 'TB', 'PB'], ['KiB', 'MiB', 'GiB', 'TiB'], ['bit', 'kbit', 'Mbit', 'Gbit', 'Tbit'], ['bps', 'kbps', 'mbps', 'gbps'], ['Bps', 'kBps', 'MBps', 'GBps'],
  ['j', 'kj', 'mj'], ['wh', 'kwh'], ['mw', 'w', 'kw', 'megaw'], ['hz', 'khz', 'mhz', 'ghz'], ['pa', 'hpa', 'kpa', 'mpa'], ['mm2', 'cm2', 'm2', 'ha', 'km2'], ['in2', 'ft2', 'acre', 'mi2']];
// compound outputs per category (key = ids joined by '+')
export const COMPOUNDS = {
  length: [['ft', 'in']], mass: [['st', 'lb'], ['lb', 'oz']], time: [['h', 'min', 's'], ['d', 'h', 'min']], angle: [['deg', 'arcmin', 'arcsec']],
};
export const FREQUENT = {
  length: ['cm', 'm', 'km', 'in', 'ft', 'mi'], mass: ['g', 'kg', 'lb', 'oz', 'st'], temperature: ['c', 'f', 'k'], volume: ['ml', 'l', 'cup', 'flozus', 'galus'],
  area: ['m2', 'ha', 'ft2', 'acre'], speed: ['kmh', 'mph', 'mps', 'kn'], time: ['s', 'min', 'h', 'd'], fuel: ['l100km', 'mpgus', 'mpguk', 'kml'],
  data: ['MB', 'GB', 'MiB', 'GiB', 'Mbit'], rate: ['mbps', 'MBps'], pressure: ['bar', 'psi', 'hpa', 'atm'], energy: ['kj', 'kcal', 'kwh', 'j'],
  power: ['kw', 'hp', 'ps', 'w'], angle: ['deg', 'rad', 'pct'], frequency: ['hz', 'rpm'],
};
export const unitsOf = (cat) => ORDER.filter((id) => UNITS[id].cat === cat && !UNITS[id].hidden);
export const allUnits = () => ORDER.map((id) => UNITS[id]);
export const isLinear = (u) => u.f != null;

// ───────────────────────────── base conversion ─────────────────────────────
export const toBase = (u, x) => (u.f != null ? x * u.f : u.to(x));
export const fromBase = (u, b) => (u.f != null ? b / u.f : u.from(b));
export function convert(x, fromId, toId) { return fromBase(UNITS[toId], toBase(UNITS[fromId], x)); }

// ───────────────────────────── alias matching ─────────────────────────────
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function aliasPattern(a) {
  let p = reEsc(a).replace(/\//g, '\\s*/\\s*').replace(/ +/g, '\\s*');
  if (/\p{L}$/u.test(a)) p += '(?!\\p{L})';
  return p;
}
function buildRe(map, flags, src) {
  const list = [...src].sort((a, b) => b.length - a.length);
  return new RegExp('(?:' + list.map(aliasPattern).join('|') + ')', flags);
}
const srcCI = [...CI.keys()].map((k) => SPACED.get(k) || k);
const srcCS = [...CS.keys()].map((k) => SPACED.get(k) || k);
const RE_CI = buildRe(CI, 'iuy', srcCI);
const RE_CS = buildRe(CS, 'uy', srcCS);
const RE_SEP = /(?:into|to|as|nach|zu|in)(?!\p{L})|->|→|=>|=/iuy;
const RE_JOIN = /(?:and|und|plus)(?!\p{L})/iuy;
const RE_NUM = /(?:\d{1,3}(?:[    ]\d{3})+(?![\d])(?:[.,]\d+)?|\d+(?:[.,]\d+)*|[.,]\d+)(?:[eE][+-]?\d+(?![\d]))?/y;
const FRAC = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

/** Interpret a raw number literal. fmt 'de' or 'si' reads ambiguous "1.000" as a thousands group. */
export function readNumber(raw, fmt = 'en') {
  let s = raw.replace(/[    ]/g, (m, i) => (i === 0 ? '' : '\u0001'));
  let exp = 0; const em = /[eE]([+-]?\d+)$/.exec(s); if (em) { exp = +em[1]; s = s.slice(0, em.index); }
  const spaced = s.includes('\u0001'); s = s.replace(/\u0001/g, '');
  const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
  let v, amb = null;
  const deLike = fmt === 'de' || fmt === 'si';
  if (dots && commas) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const dec = s[last]; const grp = dec === '.' ? ',' : '.';
    v = parseFloat(s.slice(0, last).split(grp).join('') + '.' + s.slice(last + 1));
  } else if (dots > 1 || commas > 1) {
    v = parseFloat(s.replace(/[.,]/g, ''));
  } else if (dots === 1 || commas === 1) {
    const sep = dots ? '.' : ',';
    const [a, b] = s.split(sep);
    const groupLike = b.length === 3 && a.length >= 1 && a.length <= 3 && a !== '0' && !spaced && (sep === ',' || deLike || /0$/.test(b));
    if (spaced) v = parseFloat(a + '.' + b);
    else if (groupLike) {
      const asGroup = parseFloat(a + b), asDec = parseFloat(a + '.' + b);
      const readGroup = sep === ',' ? !deLike : deLike;
      v = readGroup ? asGroup : asDec;
      amb = { raw, read: v, alt: readGroup ? asDec : asGroup, sep, as: readGroup ? 'group' : 'decimal' };
    } else v = parseFloat((a || '0') + '.' + b);
  } else v = parseFloat(s);
  if (exp) v *= Math.pow(10, exp);
  return { v, amb };
}

// ───────────────────────────── tokenizer ─────────────────────────────
function normalize(q) {
  return String(q)
    .replace(/[−‒–—﹣－]/g, '-')  // Unicode minus and dashes
    .replace(/[×✕✖⋅·](?=\s*\d|\s*\()/g, '*').replace(/÷/g, '/')
    .replace(/[‘’ʼ´`]/g, "'").replace(/[“”„]/g, '"')
    .replace(/µ/g, 'µ').replace(/μ/g, 'µ')
    .replace(/\s+/g, ' ');
}
function tokenize(src, fmt) {
  const toks = []; let i = 0;
  const at = (re) => { re.lastIndex = i; const m = re.exec(src); return m && m.index === i ? m[0] : null; };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (FRAC[c] != null) { toks.push({ t: 'num', v: FRAC[c], raw: c, i, j: i + 1 }); i++; continue; }
    if (/[\d]/.test(c) || ((c === '.' || c === ',') && /\d/.test(src[i + 1] || '') && !(toks.at(-1)?.t === 'num'))) {
      const m = at(RE_NUM);
      if (m) { const r = readNumber(m, fmt); toks.push({ t: 'num', v: r.v, amb: r.amb, raw: m, i, j: i + m.length }); i += m.length; continue; }
    }
    // separators (except "in", which is also a unit)
    let m = at(RE_SEP);
    if (m && m.toLowerCase() !== 'in') { toks.push({ t: 'sep', raw: m, i, j: i + m.length }); i += m.length; continue; }
    m = at(RE_JOIN);
    if (m) { toks.push({ t: 'join', raw: m, i, j: i + m.length }); i += m.length; continue; }
    // units: case-sensitive and case-insensitive, longest wins; tie → case-sensitive reading
    const cs = at(RE_CS), ci = at(RE_CI);
    if (cs || ci) {
      let raw, ids;
      if (cs && (!ci || cs.length >= ci.length)) { raw = cs; ids = CS.get(nks(cs)); }
      else { raw = ci; ids = CI.get(nk(ci)); }
      // "5ft3in": ft3 (cubic foot) glued to a following unit is really ft + 3
      if (/[23]$/.test(raw) && /\p{L}/u.test(src[i + raw.length] || '')) {
        const short = raw.slice(0, -1); const sid = CS.get(nks(short)) || CI.get(nk(short));
        if (sid) { raw = short; ids = sid; }
      }
      if (ids) {
        let j = i + raw.length;
        if (src[j] === '.' && !/\d/.test(src[j + 1] || '')) j++; // "5 ft. 3 in."
        toks.push({ t: 'unit', raw, ids: [...ids], sep: raw.toLowerCase() === 'in', i, j }); i = j; continue;
      }
    }
    if ('+-*/^():,'.includes(c)) { toks.push({ t: 'op', v: c, raw: c, i, j: i + 1 }); i++; continue; }
    if (c === '?' || c === '!') { i++; continue; }
    const w = /[\p{L}\p{M}°'"%‰²³_$€£]+/uy; w.lastIndex = i; const wm = w.exec(src);
    const word = wm ? wm[0] : c;
    toks.push({ t: 'unknown', raw: word, i, j: i + word.length }); i += word.length;
  }
  return toks;
}

// ───────────────────────────── arithmetic (plain numbers) ─────────────────────────────
function evalNum(ex) {
  // insert implicit '+' between adjacent numbers ("1 1/2"), shunting-yard
  const t = []; for (const x of ex) { const p = t.at(-1); if (x.t === 'num' && p && (p.t === 'num' || p.v === ')')) t.push({ t: 'op', v: '+' }); t.push(x); }
  const out = [], st = [], P = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4 };
  let prev = null;
  for (const x of t) {
    if (x.t === 'num') out.push(x.v);
    else if (x.v === '(') st.push('(');
    else if (x.v === ')') { while (st.length && st.at(-1) !== '(') out.push(st.pop()); if (!st.length) throw new Error('paren'); st.pop(); }
    else {
      let op = x.v;
      if ((op === '-' || op === '+') && (!prev || (prev.t === 'op' && prev.v !== ')'))) { if (op === '+') { prev = x; continue; } op = 'neg'; }
      while (st.length && st.at(-1) !== '(') { const top = st.at(-1); const right = op === '^' || op === 'neg'; if ((right && P[top] > P[op]) || (!right && P[top] >= P[op])) out.push(st.pop()); else break; }
      st.push(op);
    }
    prev = x;
  }
  while (st.length) { const o = st.pop(); if (o === '(') throw new Error('paren'); out.push(o); }
  const s = [];
  for (const o of out) {
    if (typeof o === 'number') { s.push(o); continue; }
    if (o === 'neg') { if (!s.length) throw new Error('arity'); s.push(-s.pop()); continue; }
    const b = s.pop(), a = s.pop(); if (a === undefined || b === undefined) throw new Error('arity');
    s.push(o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : o === '/' ? a / b : Math.pow(a, b));
  }
  if (s.length !== 1 || !Number.isFinite(s[0])) throw new Error('num');
  return s[0];
}

// ───────────────────────────── parse ─────────────────────────────
const catLabel = (c) => (CAT[c]?.label || c).toLowerCase();
const RE_HOWMANY = /^(?:how many|how much|wie ?viele?|wieviel)\s+(.+?)\s+(?:are |sind )?(?:in|ist|sind|hat|has|make)\s+(.+?)\s*\??$/i;
const RE_CLOCK = /^\s*(-)?(\d{1,3}):([0-5]?\d)(?::([0-5]?\d(?:[.,]\d+)?))?\s*(h|hrs?|hours?|std|min|mins?|minutes?)?\s*$/i;

/**
 * parse(query, { from, to, fmt, over }) → {
 *   ok, error?: { code, msg, token?, suggest? }, cat, terms: [{ v, u }], target: { units: [u], explicit }, base, value,
 *   leftText, sepText, rightText, amb: [{ raw, chosen, options }], numAmb: [{ raw, read, alt }], notes: [], bare
 * }
 * ctx.from / ctx.to: unit ids used for a bare number ("82") and as the preferred target.
 * ctx.over: { raw alias → unit id } chosen readings for ambiguous tokens.
 */
export function parse(query, ctx = {}) {
  const fmt = ctx.fmt || 'en', over = ctx.over || {};
  let q = normalize(query).trim().replace(/^(?:convert|umrechnen|rechne)\s+/i, '').replace(/[?=]\s*$/, '').trim();
  const hm = RE_HOWMANY.exec(q); if (hm && /\d/.test(hm[2]) && !/\d/.test(hm[1])) q = `${hm[2]} in ${hm[1]}`;
  const res = { ok: false, q, amb: [], numAmb: [], notes: [], terms: [], target: null };
  if (!q) { res.error = { code: 'empty' }; return res; }
  const toks = tokenize(q, fmt);
  for (const t of toks) if (t.amb) res.numAmb.push(t.amb);

  // try separator positions from the right: right side must be a target, left side a quantity
  const seps = toks.map((t, k) => (t.t === 'sep' || (t.t === 'unit' && t.sep) ? k : -1)).filter((k) => k > 0);
  let split = null;
  for (let s = seps.length - 1; s >= 0; s--) {
    const k = seps[s]; const right = toks.slice(k + 1);
    const tgt = parseTarget(right, q);
    if (!tgt) continue;
    const left = toks.slice(0, k);
    split = { k, left, tgt };
    break;
  }
  const left = split ? [...split.left] : [...toks];
  // a dangling separator ("70 kg in", "70 kg to") = still typing the target: convert to the default for now
  const last = left.at(-1), prev = left.at(-2);
  if (!split && last && prev && (last.t === 'sep' || (last.t === 'unit' && last.sep && prev.t === 'unit'))) { left.pop(); res.pendingTarget = true; }
  // unknown words outside a valid target: name them (and suggest close units)
  if (!split) {
    const u = left.find((t) => t.t === 'unknown');
    if (u) { res.error = { code: 'unknown', token: u.raw, msg: `Fernwork doesn’t know “${u.raw}” yet.`, suggest: suggestUnits(u.raw) }; return res; }
  }
  res.leftText = left.length ? q.slice(left[0].i, left.at(-1).j).trim() : '';
  res.sepText = split ? toks[split.k].raw : '';
  res.rightText = split ? q.slice(toks[split.k].j).trim() : '';

  // clock / ratio syntax on the left: 1:30 (h:min), 3:45 min (min:s), 1:30:15, 1:50 (slope, when the target is an angle)
  let terms = null;
  const cm = RE_CLOCK.exec(res.leftText);
  if (cm) {
    const neg = cm[1] ? -1 : 1, a = +cm[2], b = +cm[3], c = cm[4] != null ? readNumber(cm[4], fmt).v : null, suf = (cm[5] || '').toLowerCase();
    const tgtCats = split ? split.tgt.cands[0].map((id) => UNITS[id].cat) : [];
    const wantsSlope = c == null && !suf && a > 0 && (over[res.leftText] === 'ratio' || (tgtCats.includes('angle') && !tgtCats.includes('time')));
    if (wantsSlope) terms = [{ v: b / a, ids: ['ratio'], raw: '1:n' }];
    else if (/^m/.test(suf)) terms = [{ v: neg * a, ids: ['min'], raw: 'min' }, { v: neg * b, ids: ['s'], raw: 's' }];
    else terms = [{ v: neg * a, ids: ['h'], raw: 'h' }, { v: neg * b, ids: ['min'], raw: 'min' }, ...(c != null ? [{ v: neg * c, ids: ['s'], raw: 's' }] : [])];
    if (c == null && !suf && a === 1 && b >= 2 && !tgtCats.length) res.clockAlt = { raw: res.leftText, ratio: wantsSlope };
  }
  if (!terms) {
    const pq = parseQuantity(left, ctx);
    if (pq.error) { res.error = pq.error; if (pq.partial) res.partial = pq.partial; return res; }
    terms = pq.terms; res.bare = pq.bare; res.implicitOne = pq.implicitOne;
  }

  // apply chosen readings
  const prefer = (ids, raw) => { const o = over[raw]; return o && ids.includes(o) ? [o, ...ids.filter((x) => x !== o)] : ids; };
  const orig = {};
  terms.forEach((t) => { if (t.ids) { orig[t.raw] = t.ids; t.ids = prefer(t.ids, t.raw); } });
  if (split) split.tgt.cands.forEach((ids, k) => { orig[split.tgt.raws[k]] ||= ids; });
  const tgtC = split ? split.tgt.cands.map((ids, k) => prefer(ids, split.tgt.raws[k])) : null;

  // category resolution: the first category every token can agree on
  const order = [];
  const pushCats = (ids) => ids.forEach((id) => { const c = UNITS[id].cat; if (!order.includes(c)) order.push(c); });
  terms.forEach((t) => t.ids && pushCats(t.ids));
  if (tgtC) tgtC.forEach(pushCats);
  if (!terms.some((t) => t.ids) && ctx.from) pushCats([ctx.from]);
  let cat = null;
  for (const c of order) {
    const okS = terms.every((t) => !t.ids || t.ids.some((id) => UNITS[id].cat === c));
    const okT = !tgtC || tgtC.every((ids) => ids.some((id) => UNITS[id].cat === c));
    if (okS && okT) { cat = c; break; }
  }
  if (!cat) {
    const sId = terms.find((t) => t.ids)?.ids[0], tId = tgtC?.[0]?.[0];
    const su = UNITS[sId], tu = UNITS[tId];
    const sugg = su ? suggestTargets(su.cat, 4) : [];
    res.error = { code: 'incompatible', msg: su && tu ? `${su.sym} is ${catLabel(su.cat)}, ${tu.sym} is ${catLabel(tu.cat)}. They can’t be converted.` : 'Those units can’t be converted into each other.', from: sId, to: tId, suggest: sugg };
    return res;
  }
  res.cat = cat;
  // pick units within the category, note ambiguities
  const pick = (ids, raw) => {
    const inCat = ids.filter((id) => UNITS[id].cat === cat);
    const stable = (orig[raw] || ids).filter((id) => UNITS[id].cat === cat); // option order never changes when a reading is chosen
    if (inCat.length > 1 && !res.amb.some((a) => a.raw === raw)) res.amb.push({ raw, chosen: inCat[0], options: stable });
    return UNITS[inCat[0]];
  };
  const T2 = [];
  for (let k = 0; k < terms.length; k++) {
    const t = terms[k];
    if (t.smallerOf != null) continue;
    let u = t.ids ? pick(t.ids, t.raw) : null;
    if (!u && ctx.from && UNITS[ctx.from]?.cat === cat) u = UNITS[ctx.from];
    T2.push({ v: t.v, u, raw: t.raw });
  }
  // trailing unit-less number after a unit: next smaller unit ("5 ft 3", "1 h 30")
  const trail = terms.find((t) => t.smallerOf != null);
  if (trail) {
    const prev = T2.at(-1)?.u; const sm = prev && prev.smaller ? UNITS[prev.smaller] : null;
    if (!sm) { res.error = { code: 'nounit', msg: `Add a unit after ${fmtPlain(trail.v, fmt)}.`, partial: true }; return res; }
    T2.push({ v: trail.v, u: sm, raw: '' });
  }
  if (T2.some((t) => !t.u)) { res.error = { code: 'nounit', msg: 'Add a unit, like “5 ft” or “20 °C”.', value: T2[0]?.v }; return res; }
  if (T2.length > 1 && T2.some((t) => !isLinear(t.u))) { res.error = { code: 'compound', msg: `${CAT[cat].label} values can’t be added up. Use one value.` }; return res; }
  res.terms = T2;

  // base value
  let base = 0;
  for (const t of T2) base += toBase(t.u, t.v);
  res.base = base;
  if (cat === 'temperature' && base < -1e-9) {
    const u = T2[0].u; const zero = fromBase(u, 0);
    res.error = { code: 'abszero', msg: `${fmtPlain(T2[0].v, fmt)} ${u.sym} is below absolute zero (${fmtPlain(+zero.toPrecision(6), fmt)} ${u.sym}).` };
    return res;
  }
  if (cat === 'fuel' && !(T2[0].v > 0)) { res.error = { code: 'range', msg: 'Fuel economy needs a value above 0.' }; return res; }
  if (!Number.isFinite(base)) { res.error = { code: 'range', msg: 'That number is too large to convert.' }; return res; }

  // target
  let units;
  if (tgtC) units = tgtC.map((ids, k) => pick(ids, split.tgt.raws[k]));
  else units = defaultTarget(T2, cat, ctx);
  // compound targets must be the same units in descending order; single targets may be anything linear/non-linear
  if (units.length > 1) {
    if (units.some((u) => !isLinear(u))) { res.error = { code: 'compound', msg: 'That target can’t be split into parts.' }; return res; }
    units.sort((a, b) => b.f - a.f);
  }
  res.target = { units, explicit: !!tgtC, key: units.map((u) => u.id).join('+') };
  res.value = units.length === 1 ? fromBase(units[0], base) : null;
  res.ok = true;
  res.exactUnits = [...T2.map((t) => t.u), ...units].every((u) => u.exact);
  return res;
}

function parseQuantity(toks, ctx) {
  const terms = []; let ex = [], sign = 1, closed = false, implicitOne = false;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'num') { ex.push(t); closed = false; continue; }
    if (t.t === 'op') {
      if ((t.v === '+' || t.v === '-') && !ex.length && terms.length) { sign = t.v === '-' ? -1 : 1; continue; }
      if ((t.v === '*' || t.v === '/') && !ex.length && closed && toks[k + 1]?.t === 'num') { const n = toks[++k].v; const last = terms.at(-1); last.v = t.v === '*' ? last.v * n : last.v / n; continue; }
      if (t.v === ',' ) { if (ex.length) return { error: { code: 'syntax', msg: 'Check the number: “,” in the wrong place.' } }; continue; }
      if (t.v === ':') return { error: { code: 'syntax', msg: 'Use 1:30 for hours and minutes, or 1:50 for a slope.' } };
      ex.push(t); closed = false; continue;
    }
    if (t.t === 'join') { if (ex.length) return { error: { code: 'syntax', msg: 'Add a unit before “and”.' } }; continue; }
    if (t.t === 'unit') {
      let v;
      if (ex.length) { try { v = evalNum(ex); } catch { return { error: { code: 'syntax', msg: 'Check the number: it doesn’t add up.' } }; } }
      else if (!terms.length) { v = 1; implicitOne = true; }
      else return { error: { code: 'syntax', msg: `Add a number before ${t.raw}.` } };
      terms.push({ v: sign * v, ids: t.ids, raw: t.raw }); ex = []; sign = 1; closed = true; continue;
    }
    if (t.t === 'sep') return { error: { code: 'syntax', msg: 'Add a unit to convert to, like “in cm”.' } };
    if (t.t === 'unknown') return { error: { code: 'unknown', token: t.raw, msg: `Fernwork doesn’t know “${t.raw}” yet.`, suggest: suggestUnits(t.raw) } };
  }
  if (ex.length) {
    let v; try { v = evalNum(ex); } catch { return { error: { code: 'syntax', msg: 'Keep typing: the number isn’t complete.', partial: true } }; }
    if (terms.length) terms.push({ v: sign * v, smallerOf: terms.length - 1 });
    else if (ctx.from) terms.push({ v, ids: null, bare: true });
    else return { error: { code: 'nounit', msg: 'Add a unit, like “5 ft” or “20 °C”.', value: v }, partial: { v } };
    return { terms, bare: !terms[0].ids, implicitOne };
  }
  if (!terms.length) return { error: { code: 'empty' } };
  return { terms, implicitOne };
}

function parseTarget(toks, q) {
  if (!toks.length) return null;
  const cands = [], raws = [];
  for (const t of toks) {
    if (t.t === 'unit') { cands.push(t.ids); raws.push(t.raw); continue; }
    if ((t.t === 'op' && (t.v === '+' || t.v === ':' || t.v === ',')) || t.t === 'join') continue;
    if (t.t === 'unknown' && /^(?:hms|dms)$/i.test(t.raw)) {
      const ids = t.raw.toLowerCase() === 'hms' ? [['h'], ['min'], ['s']] : [['deg'], ['arcmin'], ['arcsec']];
      ids.forEach((x) => { cands.push(x); raws.push(x[0]); }); continue;
    }
    return null;
  }
  return cands.length ? { cands, raws } : null;
}

function defaultTarget(terms, cat, ctx) {
  const src = terms[terms.length > 1 ? 0 : 0].u;
  if (ctx.to && UNITS[ctx.to]?.cat === cat && ctx.to !== src.id) return [UNITS[ctx.to]];
  // compound sources default to the metric counterpart of the largest part
  let id = PAIR[src.id] || unitsOf(cat).find((x) => x !== src.id);
  // best fit within the counterpart's family (keeps 6 ft → 182.88 cm, 600 ft → 182.88 m)
  const fam = FAM.find((f) => f.includes(id));
  if (fam && isLinear(UNITS[id])) {
    const base = terms.reduce((s, t) => s + toBase(t.u, t.v), 0);
    const val = Math.abs(fromBase(UNITS[id], base));
    if (val && (val < 0.1 || val >= 10000)) {
      const fit = [...fam].reverse().find((x) => Math.abs(fromBase(UNITS[x], base)) >= 1) || fam[0];
      if (fit !== src.id) id = fit;
    }
  }
  return [UNITS[id]];
}

/** Ranked unit search (picker, "did you mean"). */
export function searchUnits(q, { cat, limit = 50 } = {}) {
  const s = nk(normalize(q || ''));
  const out = [];
  for (const id of ORDER) {
    const u = UNITS[id]; if (u.hidden) continue;
    if (cat && u.cat !== cat) continue;
    if (!s) { out.push({ u, score: 0 }); continue; }
    const names = [u.sym, u.name, u.plural, ...aliasesOf(id)].map(nk);
    let b = 0;
    for (const n of names) {
      if (n === s) b = Math.max(b, 100);
      else if (n.startsWith(s)) b = Math.max(b, 80 - Math.min(20, n.length - s.length));
      else if (s.length >= 2 && n.includes(s)) b = Math.max(b, 45);
      else if (s.length >= 3 && isSubseq(s, n)) b = Math.max(b, 15);
    }
    if (b) out.push({ u, score: b + (u.sys === 'metric' ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.u);
}
function isSubseq(a, b) { let i = 0; for (const c of b) if (c === a[i]) i++; return i === a.length; }
const ALIAS_CACHE = {};
export function aliasesOf(id) {
  if (ALIAS_CACHE[id]) return ALIAS_CACHE[id];
  const out = [];
  for (const [k, ids] of CI) if (ids[0] === id || ids.includes(id)) out.push(SPACED.get(k) || k);
  for (const [k, ids] of CS) if (ids.includes(id)) out.push(SPACED.get(k) || k);
  return (ALIAS_CACHE[id] = [...new Set(out)]);
}
function suggestUnits(word) {
  const s = nk(word); if (!s) return [];
  // edit distance ≤ 2 against names/aliases, then prefix matches
  const scored = [];
  for (const id of ORDER) {
    const u = UNITS[id]; if (u.hidden) continue;
    let best = 9;
    for (const n of [u.sym, u.name, u.plural, ...aliasesOf(id)].map(nk)) { if (Math.abs(n.length - s.length) > 2) continue; best = Math.min(best, lev(s, n)); }
    if (best <= 2 && s.length > 2) scored.push([best, u]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1].id);
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function suggestTargets(cat, n = 4) { return (FREQUENT[cat] || unitsOf(cat)).slice(0, n); }

// ───────────────────────────── number formatting ─────────────────────────────
// prec: 'auto' | 3 | 6 | 10 | 'max';  fmt: 'en' 1,234.5 · 'de' 1.234,5 · 'si' 1 234.5 · 'plain' 1234.5
export const FORMATS = [
  { id: 'en', label: '1,234.5', name: 'Comma groups, decimal point' },
  { id: 'de', label: '1.234,5', name: 'Point groups, decimal comma' },
  { id: 'si', label: '1 234.5', name: 'Thin-space groups (SI)' },
  { id: 'plain', label: '1234.5', name: 'No grouping' },
];
const SEPS = { en: [',', '.'], de: ['.', ','], si: [' ', '.'], plain: ['', '.'] };
const sigOf = (x) => { const s = String(Math.abs(x)).replace(/e.*$/, '').replace('.', '').replace(/^0+/, ''); return s.length; };
export function roundAuto(x) {
  if (!x) return 0;
  const clean = +x.toPrecision(12);
  if (sigOf(clean) <= 7 && Math.abs(clean) >= 1e-6) return clean;
  const a = Math.abs(x);
  if (a >= 10) return Math.round(x * 100) / 100;
  return +x.toPrecision(5);
}
export function roundTo(x, prec = 'auto') {
  if (!Number.isFinite(x) || x === 0) return x;
  if (prec === 'auto') return roundAuto(x);
  if (prec === 'max') return +x.toPrecision(15);
  return +x.toPrecision(+prec);
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function digits(r) { // exact decimal string of an already-rounded double without exponent
  let s = String(Math.abs(r));
  if (/e/.test(s)) s = Math.abs(r).toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
/** Display string: grouped, locale decimal, Unicode minus, × 10ⁿ for huge/tiny values. */
export function format(x, { prec = 'auto', fmt = 'en', groupDecimals = true } = {}) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x), [g, d] = SEPS[fmt] || SEPS.en;
  const neg = x < 0 ? '−' : '';
  if (a >= 1e15 || a < 1e-6) {
    const p = prec === 'auto' ? 5 : prec === 'max' ? 15 : +prec;
    const [m, e] = (+x.toPrecision(p)).toExponential().split('e');
    const mant = digits(+m).replace('.', d);
    return `${neg}${mant} × 10${String(+e).split('').map((c) => SUP[c]).join('')}`;
  }
  const r = roundTo(x, prec);
  const [ip, fp = ''] = digits(r).split('.');
  const intG = g ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, g) : ip;
  let frac = fp;
  if (groupDecimals && fmt !== 'plain' && fp.length > 4) frac = fp.replace(/(\d{3})(?=\d)/g, '$1 ');
  return neg + intG + (frac ? d + frac : '');
}
/** Raw copy string: no grouping, locale decimal, ASCII minus, e-notation for huge/tiny. */
export function copyNum(x, { prec = 'auto', fmt = 'en' } = {}) {
  if (!Number.isFinite(x)) return '';
  const d = (SEPS[fmt] || SEPS.en)[1];
  const a = Math.abs(x);
  if (a && (a >= 1e15 || a < 1e-6)) { const p = prec === 'auto' ? 5 : prec === 'max' ? 15 : +prec; return (+x.toPrecision(p)).toExponential().replace('e+', 'e').replace('.', d); }
  const r = roundTo(x, prec);
  return (r < 0 ? '-' : '') + digits(r).replace('.', d);
}
export function fmtPlain(x, fmt = 'en') { return copyNum(x, { prec: 'max', fmt }).replace(/^-/, '−'); }
/** Does the rounded display equal the true value? */
export function isExactDisplay(x, prec = 'auto') {
  if (!Number.isFinite(x)) return false;
  const a = Math.abs(x);
  if (a && (a >= 1e15 || a < 1e-6)) { const p = prec === 'auto' ? 5 : prec === 'max' ? 15 : +prec; return +x.toPrecision(p) === +x.toPrecision(12); }
  return roundTo(x, prec) === +x.toPrecision(12);
}

// ───────────────────────────── compound + fraction output ─────────────────────────────
/** Split a base value into descending units: [{ u, v }] (last part rounded, carries handled). */
export function splitCompound(base, units, { prec = 'auto' } = {}) {
  const sign = base < 0 ? -1 : 1; let rem = Math.abs(base);
  const parts = [];
  for (let k = 0; k < units.length - 1; k++) {
    const q = Math.floor(fromBase(units[k], rem) + 1e-9);
    parts.push({ u: units[k], v: q }); rem -= toBase(units[k], q);
    if (rem < 0) rem = 0;
  }
  const lastU = units.at(-1); const raw = fromBase(lastU, rem);
  const lv = prec === 'auto' ? Math.round(raw * 10) / 10 : roundTo(raw, prec);
  const exact = Math.abs(lv - raw) < 1e-9 * Math.max(1, Math.abs(raw));
  parts.push({ u: lastU, v: lv });
  // carry (5 ft 12 in → 6 ft 0 in)
  for (let k = parts.length - 1; k > 0; k--) {
    const ratio = Math.round(parts[k - 1].u.f / parts[k].u.f);
    if (parts[k].v >= ratio - 1e-9) { parts[k].v = +(parts[k].v - ratio).toPrecision(12); parts[k - 1].v += 1; }
  }
  return { sign, parts, exact };
}
const SYMJOIN = { deg: '°', arcmin: '′', arcsec: '″' };
export function formatCompound(base, units, opts = {}) {
  const { sign, parts, exact } = splitCompound(base, units, opts);
  const isTime = units[0].cat === 'time';
  let shown = parts;
  if (isTime) { shown = parts.filter((p, k) => p.v !== 0 || (k === parts.length - 1 && parts.every((x) => x.v === 0))); }
  const text = shown.map((p) => `${format(p.v, { fmt: opts.fmt, prec: 'max' })}${SYMJOIN[p.u.id] || ' ' + p.u.sym}`).join(' ');
  const copy = shown.map((p) => `${copyNum(p.v, { fmt: opts.fmt, prec: 'max' })}${SYMJOIN[p.u.id] || ' ' + p.u.sym}`).join(' ');
  return { text: (sign < 0 ? '−' : '') + text, copy: (sign < 0 ? '-' : '') + copy, parts: shown, exact };
}
const VULGAR = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
/** 62.992 in → "63 in" ; 2.3125 → "2 ⁵⁄₁₆" (nearest 1/16) */
export function inchFraction(x) {
  const sign = x < 0 ? '−' : ''; const n = Math.round(Math.abs(x) * 16);
  const whole = Math.floor(n / 16); let num = n % 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  const exact = Math.abs(Math.abs(x) * 16 - n) < 1e-9;
  if (!num) return { text: `${sign}${whole}`, exact };
  const f = VULGAR[`${num}/${den}`] || `${String(num).split('').map((c) => SUP[c]).join('')}⁄${String(den).split('').map((c) => SUB[c]).join('')}`;
  return { text: `${sign}${whole ? whole + ' ' : ''}${f}`, exact };
}

// ───────────────────────────── formulas ─────────────────────────────
const TEMP_F = {
  'c>f': '°F = °C × 9/5 + 32', 'f>c': '°C = (°F − 32) × 5/9', 'c>k': 'K = °C + 273.15', 'k>c': '°C = K − 273.15',
  'f>k': 'K = (°F − 32) × 5/9 + 273.15', 'k>f': '°F = (K − 273.15) × 9/5 + 32', 'f>r': '°R = °F + 459.67', 'r>f': '°F = °R − 459.67',
  'c>r': '°R = (°C + 273.15) × 9/5', 'r>c': '°C = °R × 5/9 − 273.15', 'k>r': '°R = K × 9/5', 'r>k': 'K = °R × 5/9',
};
function nice(k, fmt) { return fmtPlain(+k.toPrecision(10), fmt); }
function linearFormula(a, b, fmt) {
  const k = a.f / b.f; if (Math.abs(k - 1) < 1e-12) return `${b.sym} = ${a.sym}`;
  const mul = nice(k, fmt), div = nice(1 / k, fmt);
  return div.length < mul.length ? `${b.sym} = ${a.sym} ÷ ${div}` : `${b.sym} = ${a.sym} × ${mul}`;
}
const SLOPE_F = {
  'pct>deg': '° = atan(% ÷ 100)', 'deg>pct': '% = tan(°) × 100', 'permil>deg': '° = atan(‰ ÷ 1000)', 'deg>permil': '‰ = tan(°) × 1000',
  'ratio>deg': '° = atan(1 ÷ n)', 'deg>ratio': 'n = 1 ÷ tan(°)', 'pct>ratio': 'n = 100 ÷ %', 'ratio>pct': '% = 100 ÷ n', 'permil>pct': '% = ‰ ÷ 10', 'pct>permil': '‰ = % × 10',
  'ratio>permil': '‰ = 1000 ÷ n', 'permil>ratio': 'n = 1000 ÷ ‰',
};
/** Human formula for a parse result: { main, step } */
export function formulaFor(r, { fmt = 'en' } = {}) {
  if (!r?.ok) return null;
  const src = r.terms, tg = r.target.units;
  const a = src.length > 1 ? src.reduce((m, t) => (t.u.f < m.f ? t.u : m), src[0].u) : src[0].u;
  const b = tg.length > 1 ? tg.at(-1) : tg[0];
  let main = '', step = '';
  if (src.length > 1) {
    const total = r.base / a.f;
    step = `${src.map((t) => `${fmtPlain(t.v, fmt)} ${t.u.sym}`).join(' ')} = ${fmtPlain(+total.toPrecision(12), fmt)} ${a.sym}`;
  }
  if (a.id === b.id) {
    if (src.length > 1 && tg.length === 1) main = `${b.sym} = ${src.map((t) => (t.u.id === b.id ? b.sym : `${t.u.sym} × ${fmtPlain(+(t.u.f / b.f).toPrecision(10), fmt)}`)).join(' + ')}`;
    else main = tg.length > 1 ? `${b.sym} → ${tg.map((u) => u.sym).join(' + ')}` : 'Same unit';
  }
  else if (r.cat === 'temperature') main = TEMP_F[`${a.id}>${b.id}`] || '';
  else if (isLinear(a) && isLinear(b)) main = linearFormula(a, b, fmt);
  else if (r.cat === 'fuel') {
    if (!isLinear(a) && isLinear(b)) main = `${b.sym} = ${fmtPlain(+(100 / b.f).toPrecision(6), fmt)} ÷ (${a.sym})`;
    else if (isLinear(a) && !isLinear(b)) main = `${b.sym} = ${fmtPlain(+(100 / a.f).toPrecision(6), fmt)} ÷ (${a.sym})`;
  } else if (r.cat === 'angle') {
    const ka = isLinear(a) ? (a.id === 'deg' ? 'deg' : null) : a.id, kb = isLinear(b) ? (b.id === 'deg' ? 'deg' : null) : b.id;
    main = SLOPE_F[`${ka}>${kb}`] || '';
  }
  if (tg.length > 1 && a.id !== b.id) step = (step ? step + ' · ' : '') + `${tg.map((u) => u.sym).join(' + ')}`;
  return { main, step };
}

// ───────────────────────────── result rendering helpers ─────────────────────────────
/** Format the target value of a parse result. → { text, unitText, copy, exact, parts? } */
export function resultText(r, opts = {}) {
  const tg = r.target.units;
  if (tg.length > 1) { const c = formatCompound(r.base, tg, opts); return { text: c.text, copy: c.copy, exact: c.exact && r.exactUnits, parts: c.parts }; }
  const u = tg[0];
  if (u.id === 'ratio') { const n = r.value; return { text: `1:${format(n, opts)}`, unitText: '', copy: `1:${copyNum(n, opts)}`, exact: r.exactUnits && isExactDisplay(n, opts.prec) }; }
  return { text: format(r.value, opts), unitText: u.sym, copy: `${copyNum(r.value, opts)} ${u.sym}`, exact: r.exactUnits && isExactDisplay(r.value, opts.prec) };
}
/** Source text like "5 ft 3 in" (as typed values, not rounded). */
export function sourceText(r, fmt = 'en') {
  return r.terms.map((t) => (t.u.id === 'ratio' ? `1:${fmtPlain(t.v, fmt)}` : `${fmtPlain(t.v, fmt)}${SYMJOIN[t.u.id] || ' ' + t.u.sym}`)).join(' ');
}
/** Query-safe symbol for a unit (round-trips through parse). */
export function querySym(u) { return u.id === 'ratio' ? 'ratio' : u.sym; }
export function targetQuery(units) {
  if (units.length === 1) return querySym(units[0]);
  if (units[0].id === 'h') return units.map((u) => u.sym).join(':');
  if (units[0].id === 'deg') return 'dms';
  return units.map((u) => u.sym).join('+');
}

// ───────────────────────────── ⌘K / Calculator answer ─────────────────────────────
/** Kit-compatible answer row (drop-in for eval.js answer() units branch). */
export function answerFor(q, opts = {}) {
  const r = parse(q, opts);
  if (!r.ok || !r.target.explicit) return null;
  const t = resultText(r, opts);
  return { kind: 'unit', q: `${sourceText(r, opts.fmt)} =`, value: t.text, unit: t.unitText || '', copy: t.copy, exact: t.exact, open: 'units', openLabel: 'Units' };
}
