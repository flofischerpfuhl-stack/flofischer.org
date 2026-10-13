// Copied from the Convert mockup (viewers keep their own copy; formulas are kept as =…). Real (small) readers and writers for spreadsheets and documents, so the mockup downloads open.
// Tables: workbook = { sheets: [{ name, rows: string[][] }] }. Documents: blocks = [{ t: 'h'|'p'|'li'|'code'|'table', level, text, rows }].
// The real build swaps these for SheetJS / mammoth / pdf-lib behind the same shapes.
import { makeZip, readZip, zipText } from './zip.js';

const xmlDoc = (s) => new DOMParser().parseFromString(s, 'application/xml');
const xe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byTag = (el, tag) => [...el.getElementsByTagName(tag)];
const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// ───────────────────────── spreadsheets ─────────────────────────
export async function readXlsx(blob) {
  const zip = await readZip(blob);
  const wb = await zipText(zip, 'xl/workbook.xml'); if (!wb) throw new Error('no workbook inside');
  const rels = xmlDoc(await zipText(zip, 'xl/_rels/workbook.xml.rels') || '<r/>');
  const relMap = Object.fromEntries(byTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const ssXml = await zipText(zip, 'xl/sharedStrings.xml');
  const shared = ssXml ? byTag(xmlDoc(ssXml), 'si').map((si) => byTag(si, 't').map((t) => t.textContent).join('')) : [];
  const sheets = [];
  for (const s of byTag(xmlDoc(wb), 'sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relMap[rid] || ''; target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = await zipText(zip, 'xl/' + target); const rows = [];
    if (xml) for (const r of byTag(xmlDoc(xml), 'row')) {
      const row = [];
      for (const c of byTag(r, 'c')) {
        const t = c.getAttribute('t'); const v = byTag(c, 'v')[0]?.textContent ?? ''; const fx = byTag(c, 'f')[0]?.textContent;
        if (fx) { row[colIdx(c.getAttribute('r') || colName(row.length))] = '=' + fx; continue; }
        const val = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? byTag(c, 't').map((x) => x.textContent).join('') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
        row[colIdx(c.getAttribute('r') || colName(row.length))] = val;
      }
      rows[(+r.getAttribute('r') || rows.length + 1) - 1] = Array.from(row, (x) => x ?? '');
    }
    sheets.push({ name: s.getAttribute('name'), rows: Array.from(rows, (x) => x ?? []) });
  }
  return { sheets };
}
export async function readOds(blob) {
  const zip = await readZip(blob); const xml = await zipText(zip, 'content.xml'); if (!xml) throw new Error('no content inside');
  const doc = xmlDoc(xml); const sheets = [];
  for (const t of byTag(doc, 'table:table')) {
    const rows = [];
    for (const r of byTag(t, 'table:table-row')) {
      const row = [];
      for (const c of byTag(r, 'table:table-cell')) {
        const rep = Math.min(+(c.getAttribute('table:number-columns-repeated') || 1), 64);
        const v = c.getAttribute('office:value') ?? byTag(c, 'text:p').map((p) => p.textContent).join('\n');
        for (let i = 0; i < rep; i++) row.push(v);
      }
      while (row.length && row[row.length - 1] === '') row.pop();
      const rep = Math.min(+(r.getAttribute('table:number-rows-repeated') || 1), 1);
      for (let i = 0; i < rep; i++) rows.push(row);
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    sheets.push({ name: t.getAttribute('table:name'), rows });
  }
  return { sheets };
}
const isNum = (v) => typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(String(v)) && !/^-?0\d/.test(String(v)));
export async function writeXlsx({ sheets }) {
  const ws = sheets.map((s) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' || v == null ? '' : String(v).startsWith('=') ? `<c r="${colName(ci)}${ri + 1}"><f>${xe(String(v).slice(1))}</f></c>` : isNum(v) ? `<c r="${colName(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`);
  return makeZip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    ...ws.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x })),
  ], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const ODF_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"';
const odfPackage = (mime, content) => makeZip([
  { name: 'mimetype', data: mime },
  { name: 'META-INF/manifest.xml', data: `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>` },
  { name: 'content.xml', data: content },
], { type: mime });
export function writeOds({ sheets }) {
  const cell = (v) => (v === '' || v == null ? '<table:table-cell/>' : isNum(v) ? `<table:table-cell office:value-type="float" office:value="${v}"><text:p>${v}</text:p></table:table-cell>` : `<table:table-cell office:value-type="string"><text:p>${xe(v)}</text:p></table:table-cell>`);
  return odfPackage('application/vnd.oasis.opendocument.spreadsheet', `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ODF_NS}><office:body><office:spreadsheet>${sheets.map((s) => `<table:table table:name="${xe(s.name)}">${s.rows.map((r) => `<table:table-row>${r.map(cell).join('')}</table:table-row>`).join('')}</table:table>`).join('')}</office:spreadsheet></office:body></office:document-content>`);
}

// ───────────────────────── documents ─────────────────────────
export async function readDocx(blob) {
  const zip = await readZip(blob); const xml = await zipText(zip, 'word/document.xml'); if (!xml) throw new Error('no document inside');
  const doc = xmlDoc(xml); const body = byTag(doc, 'w:body')[0]; const out = [];
  const textOf = (el) => byTag(el, 'w:t').map((t) => t.textContent).join('');
  for (const el of body ? [...body.children] : []) {
    if (el.tagName === 'w:tbl') { out.push({ t: 'table', rows: byTag(el, 'w:tr').map((tr) => byTag(tr, 'w:tc').map(textOf)) }); continue; }
    if (el.tagName !== 'w:p') continue;
    const style = byTag(el, 'w:pStyle')[0]?.getAttribute('w:val') || ''; const text = textOf(el);
    if (!text.trim()) continue;
    const hm = /heading\s*(\d)|^title$/i.exec(style);
    if (hm) out.push({ t: 'h', level: hm[1] ? +hm[1] : 1, text });
    else if (/list/i.test(style) || byTag(el, 'w:numPr').length) out.push({ t: 'li', text });
    else out.push({ t: 'p', text });
  }
  return out;
}
export async function readOdt(blob) {
  const zip = await readZip(blob); const xml = await zipText(zip, 'content.xml'); if (!xml) throw new Error('no content inside');
  const out = [];
  const walk = (el) => { for (const c of el.children) {
    if (c.tagName === 'text:h') out.push({ t: 'h', level: +(c.getAttribute('text:outline-level') || 1), text: c.textContent });
    else if (c.tagName === 'text:p' && c.textContent.trim()) out.push({ t: c.closest?.('text:list-item') ? 'li' : 'p', text: c.textContent });
    else walk(c);
  } };
  walk(xmlDoc(xml).documentElement); return out;
}
export function blocksFromHtml(html) {
  const d = new DOMParser().parseFromString(html, 'text/html'); const out = [];
  d.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,table').forEach((el) => {
    if (el.closest('table') && el.tagName !== 'TABLE') return;
    if (el.tagName === 'TABLE') out.push({ t: 'table', rows: [...el.rows].map((r) => [...r.cells].map((c) => c.textContent.trim())) });
    else if (/^H\d$/.test(el.tagName)) out.push({ t: 'h', level: +el.tagName[1], text: el.textContent.trim() });
    else if (el.tagName === 'LI') out.push({ t: 'li', text: el.textContent.trim() });
    else if (el.tagName === 'PRE') out.push({ t: 'code', text: el.textContent.replace(/\n$/, '') });
    else if (el.textContent.trim() && !el.closest('li')) out.push({ t: 'p', text: el.textContent.trim().replace(/\s+/g, ' ') });
  });
  return out;
}
export function blocksFromMarkdown(md) {
  const out = []; const lines = md.replace(/\r/g, '').split('\n'); let para = []; let code = null;
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/(^|\W)[*_](\S.*?)[*_](?=\W|$)/g, '$1$2');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (code) { if (/^```/.test(l)) { out.push({ t: 'code', text: code.join('\n') }); code = null; } else code.push(l); continue; }
    if (/^```/.test(l)) { flush(); code = []; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); out.push({ t: 'h', level: m[1].length, text: inline(m[2]) }); }
    else if ((m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(l))) { flush(); out.push({ t: 'li', text: inline(m[1]) }); }
    else if (/^\|.*\|\s*$/.test(l)) {
      flush(); const rows = [];
      for (; i < lines.length && /^\|.*\|\s*$/.test(lines[i]); i++) if (!/^\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => inline(c.trim())));
      i--; out.push({ t: 'table', rows });
    } else if (!l.trim()) flush(); else para.push(inline(l.trim()));
  }
  flush(); if (code) out.push({ t: 'code', text: code.join('\n') });
  return out;
}
export const blocksFromText = (txt) => txt.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => (i === 0 && p.length < 80 && !p.includes('\n') ? { t: 'h', level: 1, text: p } : { t: 'p', text: p.replace(/\n/g, ' ') }));
export function blocksFromRtf(rtf) {
  const txt = rtf.replace(/\\par[d]?/g, '\n\n').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
  return blocksFromText(txt);
}
export async function readEpub(blob) {
  const zip = await readZip(blob); const out = [];
  for (const [name, get] of zip) if (/\.x?html?$/i.test(name) && !/nav\./i.test(name)) out.push(...blocksFromHtml(new TextDecoder().decode(await get())));
  return out;
}

export function toHtml(blocks, title = 'Document') {
  let html = ''; let inList = false;
  for (const b of blocks) {
    if (b.t === 'li' && !inList) { html += '<ul>\n'; inList = true; } else if (b.t !== 'li' && inList) { html += '</ul>\n'; inList = false; }
    if (b.t === 'h') html += `<h${b.level}>${xe(b.text)}</h${b.level}>\n`;
    else if (b.t === 'li') html += `  <li>${xe(b.text)}</li>\n`;
    else if (b.t === 'code') html += `<pre><code>${xe(b.text)}</code></pre>\n`;
    else if (b.t === 'table') html += `<table>\n${b.rows.map((r, i) => `  <tr>${r.map((c) => (i ? `<td>${xe(c)}</td>` : `<th>${xe(c)}</th>`)).join('')}</tr>`).join('\n')}\n</table>\n`;
    else html += `<p>${xe(b.text)}</p>\n`;
  }
  if (inList) html += '</ul>\n';
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${xe(title)}</title>\n</head>\n<body>\n${html}</body>\n</html>\n`;
}
export function toMarkdown(blocks) {
  return blocks.map((b, i) => {
    if (b.t === 'h') return `${'#'.repeat(b.level)} ${b.text}`;
    if (b.t === 'li') return `- ${b.text}` + (blocks[i + 1]?.t === 'li' ? '' : '');
    if (b.t === 'code') return '```\n' + b.text + '\n```';
    if (b.t === 'table') return [b.rows[0], b.rows[0].map(() => '---'), ...b.rows.slice(1)].map((r) => `| ${r.join(' | ')} |`).join('\n');
    return b.text;
  }).join('\n\n').replace(/(^- .*)\n\n(?=- )/gm, '$1\n') + '\n';
}
export const toText = (blocks) => blocks.map((b) => (b.t === 'li' ? `• ${b.text}` : b.t === 'table' ? b.rows.map((r) => r.join('\t')).join('\n') : b.text)).join('\n\n') + '\n';
export function toRtf(blocks) {
  const r = (s) => String(s).replace(/[\\{}]/g, (c) => '\\' + c).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0)}?`);
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs22\n${blocks.map((b) => (b.t === 'h' ? `{\\b\\fs${[0, 36, 30, 26, 24, 22, 22][b.level]} ${r(b.text)}}\\par` : b.t === 'li' ? `\\bullet  ${r(b.text)}\\par` : b.t === 'table' ? b.rows.map((x) => r(x.join('\t')) + '\\par').join('\n') : `${r(b.text)}\\par`)).join('\n')}\n}`;
}
export function writeDocx(blocks) {
  const run = (t, sz, b) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${sz ? `<w:sz w:val="${sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const body = blocks.map((b) => (b.t === 'h' ? `<w:p><w:pPr><w:pStyle w:val="Heading${b.level}"/></w:pPr>${run(b.text, [0, 36, 30, 26, 24, 22, 22][b.level], true)}</w:p>`
    : b.t === 'table' ? `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${b.rows.map((r, i) => `<w:tr>${r.map((c) => `<w:tc><w:p>${run(c, 0, i === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
      : `<w:p>${run((b.t === 'li' ? '• ' : '') + b.text)}</w:p>`)).join('');
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` },
  ], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
export function writeOdt(blocks) {
  const body = blocks.map((b) => (b.t === 'h' ? `<text:h text:outline-level="${b.level}">${xe(b.text)}</text:h>` : `<text:p>${xe((b.t === 'li' ? '• ' : '') + (b.t === 'table' ? b.rows.map((r) => r.join('  ')).join(' / ') : b.text))}</text:p>`)).join('');
  return odfPackage('application/vnd.oasis.opendocument.text', `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ODF_NS}><office:body><office:text>${body}</office:text></office:body></office:document-content>`);
}
export function writeEpub(blocks, title = 'Document') {
  const xhtml = toHtml(blocks, title).replace('<!doctype html>\n<html lang="en">', '<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml">').replace('<meta charset="utf-8">', '<meta charset="utf-8"/>');
  return makeZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'content.opf', data: `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">fernwork-${Date.now()}</dc:identifier><dc:title>${xe(title)}</dc:title><dc:language>en</dc:language></metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="c"/></spine></package>` },
    { name: 'nav.xhtml', data: `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${xe(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">${xe(title)}</a></li></ol></nav></body></html>` },
    { name: 'chapter.xhtml', data: xhtml },
  ], { type: 'application/epub+zip' });
}

/** A real (simple) PDF: A4, Helvetica, wrapped text, headings, bullets, tables as tab rows. Selectable text. */
export function writePdf(blocks) {
  const W = 595, H = 842, M = 64; const pages = []; let cur = []; let y = H - M;
  const width = (s, size) => s.length * size * 0.5;
  const wrap = (s, size, max) => { const words = String(s).split(/\s+/); const lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (width(t, size) > max && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; };
  const asc = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => ({ '–': '-', '—': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '•': '-', 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', '€': 'EUR' }[c] || '?')).replace(/[\\()]/g, '\\$&');
  const put = (text, size, font, x = M) => { if (y < M + size) { pages.push(cur); cur = []; y = H - M; } cur.push(`BT /${font} ${size} Tf ${x} ${y} Td (${asc(text)}) Tj ET`); y -= size * 1.45; };
  for (const b of blocks) {
    if (b.t === 'h') { y -= 6; const sz = [0, 22, 17, 14, 12, 11, 11][b.level]; wrap(b.text, sz, W - 2 * M).forEach((l) => put(l, sz, 'F2')); y -= 2; }
    else if (b.t === 'li') wrap(b.text, 11, W - 2 * M - 14).forEach((l, i) => { if (!i) put('-', 11, 'F1'); if (!i) y += 11 * 1.45; put(l, 11, 'F1', M + 14); });
    else if (b.t === 'code') b.text.split('\n').forEach((l) => put(l, 9.5, 'F3'));
    else if (b.t === 'table') b.rows.forEach((r, i) => put(r.join('    '), 10.5, i ? 'F1' : 'F2'));
    else { wrap(b.text, 11, W - 2 * M).forEach((l) => put(l, 11, 'F1')); y -= 5; }
  }
  pages.push(cur);
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const fonts = [add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'), add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'), add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')];
  const pagesId = objs.length + 1 + pages.length * 2; const kids = [];
  for (const p of pages) { const s = p.join('\n'); const c = add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`); kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> /Contents ${c} 0 R >>`)); }
  add(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
