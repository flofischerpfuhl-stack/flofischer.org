// Fernwork kit · file kinds, per-type drop actions, and cross-page handoff (IndexedDB, survives navigation).
// Used by the home drop area / file chooser; tools keep their own dropzones.

const EXT = {
  image: 'jpg jpeg png webp avif heic heif gif bmp tif tiff svg ico jxl',
  video: 'mp4 mov mkv webm avi m4v wmv',
  audio: 'mp3 wav flac ogg oga m4a aac opus wma',
  pdf: 'pdf',
  doc: 'docx doc odt rtf md markdown html htm pages epub',
  slides: 'pptx ppt odp key',
  sheet: 'xlsx xls ods csv tsv numbers',
  data: 'json yaml yml xml toml parquet arrow feather sqlite sqlite3 db geojson ndjson',
  text: 'txt log ini conf cfg env srt vtt',
  cad: 'dxf dwg ifc',
  points: 'las laz e57 pcd pts xyz',
  geo: 'shp shx kml gpx',
  model: 'stl obj gltf glb ply 3mf',
  archive: 'zip 7z tar gz rar',
};
const BY_EXT = {};
for (const [k, list] of Object.entries(EXT)) for (const e of list.split(' ')) BY_EXT[e] = k;

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heic',
  'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/tiff': 'tiff', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'application/pdf': 'pdf', 'application/json': 'json', 'text/csv': 'csv', 'text/plain': 'txt',
  'text/markdown': 'md', 'text/html': 'html', 'application/zip': 'zip', 'application/xml': 'xml', 'text/xml': 'xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.oasis.opendocument.text': 'odt', 'application/rtf': 'rtf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/vnd.ms-powerpoint': 'ppt',
};
/** MIME type for an extension (used by the recorder and samples). */
export const mimeFor = (ext) => Object.keys(MIME_EXT).find((m) => MIME_EXT[m] === String(ext).toLowerCase()) || '';

export const extOf = (f) => {
  const n = (f && f.name) || '';
  const m = /\.([a-z0-9]+)$/i.exec(n);
  return m ? m[1].toLowerCase() : MIME_EXT[(f && f.type) || ''] || '';
};
/** 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'slides' | 'sheet' | 'data' | 'text' | 'cad' | 'model' | 'points' | 'geo' | 'archive' | 'unknown' */
export function fileKind(f) {
  const e = extOf(f);
  if (BY_EXT[e]) return BY_EXT[e];
  const t = (f && f.type) || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('text/')) return 'text';
  return 'unknown';
}

export const KIND_LABEL = {
  image: ['image', 'images', 'image'], video: ['video', 'videos', 'film'], audio: ['audio file', 'audio files', 'music'],
  pdf: ['PDF', 'PDFs', 'file-text'], doc: ['document', 'documents', 'file-text'], slides: ['presentation', 'presentations', 'file-text'],
  sheet: ['spreadsheet', 'spreadsheets', 'file-spreadsheet'], data: ['data file', 'data files', 'file-json'],
  text: ['text file', 'text files', 'file-text'], cad: ['CAD drawing', 'CAD drawings', 'box'], model: ['3D model', '3D models', 'box'],
  archive: ['archive', 'archives', 'file-archive'], points: ['point cloud', 'point clouds', 'scan'], geo: ['map file', 'map files', 'globe'], unknown: ['file', 'files', 'file-question'], mixed: ['file', 'files', 'files'],
};
const pretty = { jpg: 'JPG', jpeg: 'JPG', heic: 'HEIC', png: 'PNG', webp: 'WebP', docx: 'Word', doc: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', mp4: 'MP4', mov: 'MOV', pdf: 'PDF' };

/** Summarise files (File objects or {name?, type}) → { n, kind, ext, label, icon, names }. Works during drag (types only). */
export function summarize(files) {
  const list = [...files];
  const kinds = [...new Set(list.map(fileKind))];
  const kind = kinds.length === 1 ? kinds[0] : 'mixed';
  const n = list.length;
  const ext = extOf(list[0] || {});
  const [one, many, icon] = KIND_LABEL[kind] || KIND_LABEL.unknown;
  const named = list.every((f) => f.name);
  let label;
  if (n === 1 && named) label = list[0].name;
  else if (n === 1) label = `1 ${pretty[ext] && kind !== 'image' ? pretty[ext] + ' ' : ''}${one}`;
  else label = `${n} ${many}`;
  const sizes = list.reduce((s, f) => s + (f.size || 0), 0);
  return { n, kind, kinds, ext, label, icon, names: named ? list.map((f) => f.name) : [], size: sizes };
}

/** Actions offered by the drop chooser for these files. Each: { id, label, sub, icon, leaf } (first = default).
 *  Leaves are real pages (assets/kit/registry.js); the file is handed over to that tool's own file input. */
export function actionsFor(files) {
  const s = summarize(files);
  const { n, kind, ext } = s;
  const A = (id, label, sub, icon, leaf) => ({ id, label, sub, icon, leaf });
  switch (kind) {
    case 'image': {
      const preset = ext === 'heic' || ext === 'heif' ? 'heic-to-jpg' : ext === 'png' ? 'png-to-jpeg' : ext === 'webp' ? 'webp-to-png'
        : ext === 'avif' ? 'avif-to-png' : ext === 'tif' || ext === 'tiff' ? 'tiff-to-png' : ext === 'jpg' || ext === 'jpeg' ? 'jpeg-to-png' : 'convert-images';
      return [
        A('edit', n > 1 ? 'Open in Image Tools' : 'Edit image', 'Image Tools · compress, resize, crop, annotate', 'sliders-horizontal', 'image-tools'),
        A('convert', n > 1 ? `Convert ${n} images` : 'Convert format', 'Convert · Images', 'shuffle', preset),
        ...(ext === 'svg' ? [A('open', 'View SVG', 'Viewers · SVG', 'eye', 'viewer-svg')] : []),
      ];
    }
    case 'video': return [
      A('convert', 'Convert video', 'Convert · Video', 'shuffle', ext === 'mov' ? 'mov-to-mp4' : ext === 'mkv' ? 'mkv-to-mp4' : ext === 'webm' ? 'webm-to-mp4' : 'convert-video'),
      A('mp3', 'Extract audio as MP3', 'Convert · Video', 'music', 'mp4-to-mp3'),
      A('gif', 'Make a GIF', 'Convert · Video', 'image', 'mp4-to-gif'),
    ];
    case 'audio': return [
      A('convert', 'Convert audio', 'Convert · Audio', 'shuffle', ext === 'mp3' ? 'mp3-to-wav' : ext === 'wav' ? 'wav-to-mp3' : ext === 'flac' ? 'flac-to-mp3' : ext === 'm4a' ? 'm4a-to-mp3' : 'convert-audio'),
    ];
    case 'pdf': return [A('open', n > 1 ? `Open ${n} PDFs` : 'Open in PDF Tools', 'PDF Tools · edit, merge, split, compress, sign', 'file-text', 'pdf-tools')];
    case 'doc': return ext === 'md' || ext === 'markdown' ? [
      A('open', 'Open', 'Viewers · Markdown', 'eye', 'viewer-markdown'),
      A('pdf', 'Convert to PDF', 'Convert · Documents', 'file-text', 'markdown-to-pdf'),
    ] : ext === 'html' || ext === 'htm' ? [
      A('pdf', 'Convert to PDF', 'Convert · Documents', 'file-text', 'html-to-pdf'),
    ] : [
      A('open', 'Open', 'Viewers · Documents', 'eye', 'viewer-documents'),
      A('pdf', 'Convert to PDF', 'Convert · Documents', 'file-text', ext === 'odt' ? 'odt-to-pdf' : ext === 'rtf' ? 'rtf-to-pdf' : 'docx-to-pdf'),
      ...(ext === 'docx' ? [A('text', 'Extract text', 'Convert · Documents', 'text-cursor', 'docx-to-txt')] : []),
    ];
    case 'slides': return [A('open', 'Open', 'Viewers · PowerPoint', 'eye', 'viewer-pptx')];
    case 'sheet': return [
      A('open', 'Open', 'Viewers · Tables / Sheets', 'eye', 'viewer-table'),
      A('convert', 'Convert table', 'Convert · Tables', 'shuffle', ext === 'csv' ? 'csv-to-xlsx' : ext === 'ods' ? 'ods-to-xlsx' : 'xlsx-to-csv'),
      ...(ext === 'csv' ? [A('json', 'Convert to JSON', 'Convert · Data', 'braces', 'csv-to-json')] : []),
    ];
    case 'data': return ext === 'json' || ext === 'ndjson' ? [
      A('format', 'Format JSON', 'Text · JSON Formatter', 'braces', 'json-formatter'),
      A('convert', 'Convert data', 'Convert · Data', 'shuffle', 'convert-data'),
    ] : ext === 'geojson' ? [
      A('open', 'Open on a map', 'Viewers · Shapefile', 'eye', 'viewer-shapefile'),
    ] : ext === 'sqlite' || ext === 'sqlite3' || ext === 'db' || ext === 'parquet' || ext === 'arrow' || ext === 'feather' ? [
      A('open', 'Open', 'Viewers · Database', 'eye', 'viewer-database'),
    ] : [
      A('convert', 'Convert data', 'Convert · Data', 'shuffle', 'convert-data'),
    ];
    case 'text': return n === 2 ? [
      A('compare', 'Compare the two', 'Text · Text Diff', 'git-compare', 'text-diff'),
      A('count', 'Word count', 'Text · Word Count', 'list-checks', 'word-count'),
    ] : [
      A('count', 'Word count', 'Text · Word Count', 'list-checks', 'word-count'),
      A('checksum', 'Hash this file', 'Security · Hash Generator', 'fingerprint', 'hash-generator'),
    ];
    case 'cad': return [ext === 'ifc' ? A('open', 'Open model', 'Viewers · IFC Model', 'eye', 'viewer-ifc') : A('open', 'Open drawing', 'Viewers · DXF Drawing', 'eye', 'viewer-dxf')];
    case 'model': return [ext === 'ply' ? A('open', 'Open point cloud', 'Viewers · Point Cloud', 'eye', 'viewer-pointcloud') : A('open', 'Open 3D model', 'Viewers · STL / OBJ', 'eye', 'viewer-stl')];
    case 'points': return [A('open', 'Open point cloud', 'Viewers · Point Cloud', 'eye', 'viewer-pointcloud')];
    case 'geo': return [A('open', 'Open on a map', 'Viewers · Shapefile', 'eye', 'viewer-shapefile')];
    case 'mixed': return [A('checksum', 'Hash all files', 'Security · Hash Generator', 'fingerprint', 'hash-generator')];
    default: return [A('checksum', 'Hash this file', 'Security · Hash Generator', 'fingerprint', 'hash-generator')];
  }
}

// ── handoff: pass dropped files to the next page (IndexedDB keeps real Blobs) ─────────────────
const DB = 'fw-handoff';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
/** Store files for the next page: await handoff(files, { leaf, action }). */
export async function handoff(files, meta = {}) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('h', 'readwrite');
      tx.objectStore('h').put({ files: [...files], meta, t: Date.now() }, 'last');
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[fw] handoff failed', e); }
}
/** On the destination page: const h = await consumeHandoff(); → { files: File[], meta } | null (one-shot, max 2 min old). */
export async function consumeHandoff() {
  try {
    const d = await db();
    return await new Promise((res) => {
      const tx = d.transaction('h', 'readwrite'); const st = tx.objectStore('h'); const g = st.get('last');
      g.onsuccess = () => { const v = g.result; st.delete('last'); res(v && Date.now() - v.t < 120000 ? v : null); };
      g.onerror = () => res(null);
    });
  } catch { return null; }
}

export function formatBytes(b) {
  if (!b && b !== 0) return '';
  if (b < 1000) return `${b} B`;
  const u = ['kB', 'MB', 'GB', 'TB']; let i = -1;
  do { b /= 1000; i++; } while (b >= 1000 && i < u.length - 1);
  return `${b.toFixed(b >= 100 ? 0 : 1)} ${u[i]}`;
}
