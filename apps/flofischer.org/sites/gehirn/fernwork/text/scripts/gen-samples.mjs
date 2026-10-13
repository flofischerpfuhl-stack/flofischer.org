// Generates the realistic sample files for the Textbench mockup (deterministic).
//   node mockups/text/scripts/gen-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'samples');
let seed = 20261013;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const FIRST = ['Lena', 'Jonas', 'Mia', 'Paul', 'Emma', 'Felix', 'Hannah', 'Lukas', 'Sophie', 'Ben', 'Marie', 'Noah', 'Clara', 'Elias', 'Anna', 'Leon', 'Greta', 'Moritz', 'Ida', 'Henry'];
const LAST = ['Hoffmann', 'Schäfer', 'Becker', 'Wagner', 'Krüger', 'Neumann', 'Schmitt', 'Fischer', 'Weber', 'Meyer', 'Koch', 'Richter', 'Wolf', 'Braun', 'Zimmermann', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Vogel'];
const CITY = [['34117', 'Kassel'], ['34225', 'Baunatal'], ['34277', 'Fuldabrück'], ['34233', 'Fuldatal'], ['37269', 'Eschwege'], ['36037', 'Fulda'], ['35037', 'Marburg'], ['34560', 'Fritzlar'], ['34346', 'Hann. Münden'], ['34613', 'Schwalmstadt']];
const STREET = ['Wilhelmshöher Allee', 'Friedrich-Ebert-Straße', 'Am Weinberg', 'Lindenstraße', 'Gartenweg', 'Hauptstraße', 'Mühlenweg', 'Schulstraße', 'Bahnhofstraße', 'Ahornweg'];
const PRODUCTS = [['Feldbuch A5 wetterfest', 12.9], ['Fluchtstab 2 m rot/weiß', 34.5], ['Grenzstein-Markierung 50 Stk.', 19.9], ['Prismenstab Carbon', 189], ['Messband 50 m Glasfaser', 42], ['Signalfarbe Spray neon', 7.49], ['Holzpflock 40 cm, 25 Stk.', 22.75], ['Lotstock-Libelle', 15.2], ['Stativ Aluminium', 129], ['Akku GEB 242', 98.6]];
const STATUS = ['shipped', 'shipped', 'shipped', 'paid', 'open', 'returned'];

function order(i) {
  const fn = pick(FIRST), ln = pick(LAST); const [zip, city] = pick(CITY);
  const n = 1 + Math.floor(rnd() * 3);
  const items = Array.from({ length: n }, (_, k) => { const [name, price] = pick(PRODUCTS); return { sku: `SKU-${i}-${k}`, name, qty: 1 + Math.floor(rnd() * 3), price }; });
  const total = Math.round(items.reduce((s, x) => s + x.qty * x.price, 0) * 100) / 100;
  const d = new Date(Date.UTC(2026, 6, 1) + Math.floor(i * 8.1e5 + rnd() * 6e5));
  return {
    id: `ORD-2026-${String(i).padStart(5, '0')}`,
    created: d.toISOString().replace(/\.\d+Z$/, 'Z'),
    status: pick(STATUS),
    channel: pick(['web', 'web', 'app', 'phone']),
    customer: { id: `C-${10000 + Math.floor(rnd() * 9000)}`, name: `${fn} ${ln}`, email: `${fn}.${ln}`.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue') + '@example.de' },
    shipping: { street: `${pick(STREET)} ${1 + Math.floor(rnd() * 140)}`, zip, city, country: 'DE' },
    items, total, currency: 'EUR', paid: rnd() > 0.12,
  };
}
const N = 11000;
const data = { meta: { source: 'shop-api v3', exported: '2026-10-12T06:00:00Z', count: N, currency: 'EUR' }, orders: Array.from({ length: N }, (_, i) => order(i)) };
const min = JSON.stringify(data);
fs.writeFileSync(path.join(OUT, 'orders-api.json'), min);
// broken export: pretty-printed, one missing comma deep inside
const pretty = JSON.stringify(data, null, 2).split('\n');
const target = pretty.findIndex((l, idx) => idx > 200000 && /^\s+"sku": "SKU-\d+-0",$/.test(l));
pretty[target] = pretty[target].replace(/,$/, '');
fs.writeFileSync(path.join(OUT, 'orders-export.json'), pretty.join('\n') + '\n');
console.log('orders-api.json', (min.length / 1e6).toFixed(2), 'MB; export lines', pretty.length, 'broken line', target + 1, pretty[target]);

// ── PDF paste: hard-wrapped report with hyphenation, NBSP, zero-width spaces, soft hyphens, ligatures, page header ──
const NB = ' ', ZW = '​', SH = '­';
const paras = [
  'Bericht zur Grenzfeststellung – Flurstück 112/4, Gemarkung Dörnhagen',
  '1. Anlass und Auftrag',
  `Die Gemeinde Fuldabrück hat das Ingenieurbüro Fischer Vermessung am 28.${NB}September 2026 mit der Grenzfeststellung und der Teilungsvermessung des Flurstücks 112/4 beauftragt. Ziel ist die Bildung von zwei Baugrundstücken für das Neubaugebiet „Am Mühlberg“, das die Gemeinde noch in diesem Jahr ofﬁziell ausweisen möchte.`,
  '2. Grundlagen',
  `Grundlage der Vermessung sind die Nachweise des Liegenschaftskatasters, insbesondere die Fortführungs${SH}risse aus den Jahren 1968 und 1994, sowie die amtlichen Koordinaten der Grenzpunkte im Bezugssystem ETRS89/UTM, die beim Amt für Bodenmanagement angefordert und vor Beginn der örtlichen Arbeiten vollständig ausgewertet wurden.`,
  '3. Örtliche Arbeiten',
  `Die Messungen fanden am 13.${NB}Oktober 2026 bei trockenem Wetter statt.${ZW} Zum Einsatz kamen ein GNSS-Empfänger mit SAPOS-Korrekturdaten und ein Tachymeter für die Kontroll${SH}messungen. Von den acht vorgefundenen Grenzsteinen stimmten sieben innerhalb der zulässigen Abweichung von 3${NB}cm mit den Katasterkoordinaten überein.${ZW} Ein Grenzstein an der nordöstlichen Ecke des Flurstücks war oﬀensichtlich durch Bauarbeiten verschoben worden und wurde deshalb nach der Wiederherstellung aus den Katasterzahlen neu abgemarkt.`,
  '4. Ergebnis',
  `Die Grundstücksﬂäche beträgt nach der Teilung 612${NB}m² für das westliche und 587${NB}m² für das östliche Baugrundstück. Die Grenzfeststellung wurde von allen Beteiligten im Grenztermin anerkannt. Die Fortführungsunterlagen werden in der kommenden Woche beim Amt für Bodenmanagement eingereicht.`,
];
const HYPH = { Grenzfeststellung: 'Grenz-', Teilungsvermessung: 'Teilungs-', Baugrundstücken: 'Bau-', Baugrundstück: 'Bau-', Liegenschaftskatasters: 'Liegenschafts-', Katasterkoordinaten: 'Kataster-', Wiederherstellung: 'Wieder-', Bodenmanagement: 'Boden-', Fortführungsunterlagen: 'Fortführungs-', 'SAPOS-Korrekturdaten': 'SAPOS-Korrektur-', nordöstlichen: 'nord-', Grundstücksﬂäche: 'Grundstücks-', Vermessung: 'Vermes-', Ingenieurbüro: 'Ingenieur-', ausgewertet: 'ausge-', vorgefundenen: 'vorge-', beauftragt: 'beauf-', Katasterzahlen: 'Kataster-', Beteiligten: 'Beteilig-' };
function wrap(p, width = 70) {
  const words = p.split(' '); const lines = []; let cur = '';
  for (const w of words) {
    const bare = w.replace(/[.,;:!?“„]/g, '');
    if ((cur + ' ' + w).trim().length > width) {
      const pre = HYPH[bare];
      if (pre && (cur + ' ' + pre).trim().length <= width) { lines.push((cur + ' ' + pre).trim()); cur = w.slice(pre.length - 1); continue; }
      lines.push(cur.trim()); cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
let out = [];
paras.forEach((p) => { out.push(...(p.length < 80 ? [p] : wrap(p))); out.push(''); });
// PDF page breaks land mid-paragraph: running header + page number lines
const brk = (re, n) => { const i = out.findIndex((l) => re.test(l)); out.splice(i + 1, 0, `- ${n - 1} -`, `Ingenieurbüro Fischer Vermessung · Bericht 2026-118 · Seite ${n} von 3`); };
brk(/^Tachymeter/, 2); brk(/^und 587/, 3);
fs.writeFileSync(path.join(OUT, 'bericht-pdf-paste.txt'), out.join('\n').replace(/\n+$/, '\n'));
console.log(out.join('\n'));
