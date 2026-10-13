// Fernwork kit · file kinds, per-type drop actions, and cross-page handoff (IndexedDB, survives navigation).
// Mirrors what file-capabilities.js should become in the real build.

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
/** 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'slides' | 'sheet' | 'data' | 'text' | 'cad' | 'model' | 'archive' | 'unknown' */
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
  archive: ['archive', 'archives', 'file-archive'], unknown: ['file', 'files', 'file-question'], mixed: ['file', 'files', 'files'],
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

/** Actions offered by the drop veil for these files. Each: { id, label, sub, icon, leaf } (first = default). */
export function actionsFor(files) {
  const s = summarize(files);
  const { n, kind, ext } = s;
  const A = (id, label, sub, icon, leaf) => ({ id, label, sub, icon, leaf });
  switch (kind) {
    case 'image': {
      const to = ext === 'jpg' || ext === 'jpeg' ? 'PNG' : 'JPG';
      const preset = ext === 'heic' || ext === 'heif' ? 'heic-to-jpg' : ext === 'png' ? 'png-to-jpg' : ext === 'webp' ? 'webp-to-png' : 'convert-images';
      return [
        A('convert', n > 1 ? `Convert ${n} images to ${to}` : `Convert to ${to}`, 'Convert · works offline', 'arrow-left-right', preset),
        A('compress', n > 1 ? 'Compress all' : 'Compress', 'Images · smaller files, same look', 'minimize-2', 'compress-image'),
        A('edit', n > 1 ? 'Open in Images' : 'Edit image', 'Images · crop, adjust, mark up', 'sliders-horizontal', 'image-edit'),
        n > 1 ? A('pdf', 'Combine into one PDF', 'PDF · one page per image', 'merge', 'merge-pdf')
              : A('bg', 'Remove background', 'Images · on-device AI', 'scissors', 'remove-background'),
      ];
    }
    case 'video': return [
      A('convert', ext === 'mp4' ? 'Convert to WebM' : 'Convert to MP4', 'Convert · keeps quality', 'arrow-left-right', ext === 'mov' ? 'mov-to-mp4' : 'convert-video'),
      A('mp3', 'Extract audio as MP3', 'Convert · audio only', 'music', 'mp4-to-mp3'),
      A('gif', 'Make a GIF', 'Convert · trim and loop', 'image', 'mp4-to-gif'),
      A('open', 'Play', 'Open · frame by frame', 'play', 'open-file'),
    ];
    case 'audio': return [
      A('convert', ext === 'mp3' ? 'Convert to WAV' : 'Convert to MP3', 'Convert', 'arrow-left-right', 'convert-audio'),
      A('open', 'Play', 'Open · waveform', 'play', 'open-file'),
    ];
    case 'pdf': return n > 1 ? [
      A('merge', `Merge ${n} PDFs`, 'PDF · drag to reorder pages', 'merge', 'merge-pdf'),
      A('compress', 'Compress all', 'PDF · smaller for email', 'minimize-2', 'compress-pdf'),
    ] : [
      A('edit', 'Open & edit', 'PDF · text, images, forms', 'pencil', 'edit-pdf'),
      A('compress', 'Compress', 'PDF · smaller for email', 'minimize-2', 'compress-pdf'),
      A('sign', 'Sign', 'PDF · draw or type', 'signature', 'sign-pdf'),
      A('ocr', 'Make searchable', 'PDF · read text from scans', 'scan-text', 'ocr-pdf'),
    ];
    case 'doc': return [
      A('open', 'Open & edit', 'Open · Word, ODT, RTF', 'folder-open', 'word-viewer'),
      A('pdf', 'Convert to PDF', 'Convert · layout preserved', 'file-text', 'docx-to-pdf'),
      A('text', 'Extract text', 'Text · plain text in Textbench', 'text-cursor', 'docx-to-txt'),
    ];
    case 'slides': return [
      A('open', 'Open', 'Open · slides and notes', 'folder-open', 'powerpoint-viewer'),
      A('pdf', 'Convert to PDF', 'Convert', 'file-text', 'convert-docs'),
    ];
    case 'sheet': return [
      A('open', 'Open', 'Open · sort, filter, search', 'folder-open', ext === 'csv' ? 'csv-viewer' : 'excel-viewer'),
      A('convert', ext === 'csv' ? 'Convert to XLSX' : 'Convert to CSV', 'Convert', 'arrow-left-right', ext === 'csv' ? 'csv-to-xlsx' : 'xlsx-to-csv'),
      ...(ext === 'csv' ? [A('json', 'Convert to JSON', 'Convert · one object per row', 'braces', 'csv-to-json')] : []),
    ];
    case 'data': return ext === 'json' || ext === 'ndjson' || ext === 'geojson' ? [
      A('format', 'Format JSON', 'Text · pretty-print and explore', 'braces', 'format-json'),
      A('csv', 'Convert to CSV', 'Convert', 'sheet', 'json-to-csv'),
      A('open', 'Open as table', 'Open', 'folder-open', 'open-file'),
    ] : [
      A('open', 'Open', 'Open · browse the data', 'folder-open', ext === 'sqlite' || ext === 'db' ? 'sqlite-viewer' : ext === 'parquet' ? 'parquet-viewer' : 'open-file'),
      A('convert', 'Convert', 'Convert · JSON, CSV, YAML', 'arrow-left-right', 'convert-data'),
    ];
    case 'text': return n === 2 ? [
      A('compare', 'Compare the two', 'Text · side by side', 'git-compare', 'compare-text'),
      A('open', 'Open in Textbench', 'Text', 'text-cursor', 'textbench'),
    ] : [
      A('open', 'Open in Textbench', 'Text · edit, count, transform', 'text-cursor', 'textbench'),
      A('count', 'Word count', 'Text', 'list-checks', 'word-count'),
    ];
    case 'cad': return [A('open', 'Open drawing', 'Open · layers, measure', 'box', ext === 'ifc' ? 'ifc-viewer' : 'dxf-viewer')];
    case 'model': return [A('open', 'Open 3D model', 'Open · orbit, measure', 'box', 'stl-viewer')];
    case 'mixed': return [
      A('convert', `Convert ${n} files`, 'Convert · grouped by type', 'arrow-left-right', 'convert-images'),
      A('open', 'Open all', 'Open · one tab each', 'folder-open', 'open-file'),
      A('checksum', 'Checksum all', 'Developer · SHA-256', 'fingerprint', 'checksum'),
    ];
    default: return [
      A('checksum', 'Checksum (SHA-256)', 'Developer · works for any file', 'fingerprint', 'checksum'),
      A('text', 'Try opening as text', 'Text · shows readable parts', 'text-cursor', 'textbench'),
    ];
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
