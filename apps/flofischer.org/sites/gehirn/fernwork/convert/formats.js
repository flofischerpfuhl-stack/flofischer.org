// Convert mockup · format catalog, smart targets, presets and size estimates (pure, no DOM).

/** Output formats: ext + real mime when the browser can encode it (canvas). Everything else is simulated in the mockup. */
export const FMT = {
  JPG: { ext: 'jpg', mime: 'image/jpeg', kind: 'image', syn: 'jpeg jfif' },
  WebP: { ext: 'webp', mime: 'image/webp', kind: 'image', alpha: true },
  AVIF: { ext: 'avif', kind: 'image', alpha: true, syn: 'av1' },
  PNG: { ext: 'png', mime: 'image/png', kind: 'image', alpha: true, lossless: true },
  GIF: { ext: 'gif', kind: 'image', alpha: true, syn: 'animated animation loop' },
  ICO: { ext: 'ico', kind: 'image', alpha: true, syn: 'favicon icon' },
  TIFF: { ext: 'tiff', kind: 'image', lossless: true, syn: 'tif print' },
  PDF: { ext: 'pdf', kind: 'doc', syn: 'acrobat print' },
  MP4: { ext: 'mp4', kind: 'video', syn: 'h264 h.264 mpeg4' },
  WebM: { ext: 'webm', kind: 'video', syn: 'vp9' },
  MOV: { ext: 'mov', kind: 'video', syn: 'quicktime apple' },
  MP3: { ext: 'mp3', kind: 'audio', syn: 'audio sound music' },
  M4A: { ext: 'm4a', kind: 'audio', syn: 'aac apple audio' },
  WAV: { ext: 'wav', kind: 'audio', lossless: true, syn: 'wave pcm' },
  FLAC: { ext: 'flac', kind: 'audio', lossless: true },
  OGG: { ext: 'ogg', kind: 'audio', syn: 'opus vorbis' },
  XLSX: { ext: 'xlsx', kind: 'sheet', syn: 'excel spreadsheet' },
  ODS: { ext: 'ods', kind: 'sheet', syn: 'libreoffice calc' },
  CSV: { ext: 'csv', kind: 'sheet', syn: 'comma table' },
  TSV: { ext: 'tsv', kind: 'sheet', syn: 'tab table' },
  JSON: { ext: 'json', kind: 'data' },
  YAML: { ext: 'yaml', kind: 'data', syn: 'yml' },
  TOML: { ext: 'toml', kind: 'data' },
  XML: { ext: 'xml', kind: 'data' },
  DOCX: { ext: 'docx', kind: 'doc', syn: 'word' },
  ODT: { ext: 'odt', kind: 'doc', syn: 'libreoffice writer' },
  Markdown: { ext: 'md', kind: 'doc', syn: 'md readme' },
  HTML: { ext: 'html', kind: 'doc', syn: 'web page' },
  TXT: { ext: 'txt', kind: 'doc', syn: 'plain text' },
};

/** Group = what a file *is* after probing (decides default target and palette). */
export const GROUPS = {
  photo: { one: 'photo', many: 'photos', icon: 'image', chip: 'image' },
  graphic: { one: 'transparent image', many: 'transparent images', icon: 'shapes', chip: 'image' },
  video: { one: 'video', many: 'videos', icon: 'film', chip: 'video' },
  audio: { one: 'audio file', many: 'audio files', icon: 'music', chip: 'audio' },
  sheet: { one: 'spreadsheet', many: 'spreadsheets', icon: 'sheet', chip: 'sheet' },
  data: { one: 'data file', many: 'data files', icon: 'braces', chip: 'data' },
  paste: { one: 'pasted text', many: 'pasted texts', icon: 'clipboard-paste', chip: 'data' },
  doc: { one: 'document', many: 'documents', icon: 'file-text', chip: 'doc' },
  text: { one: 'text file', many: 'text files', icon: 'text', chip: 'doc' },
  broken: { one: 'unreadable file', many: 'unreadable files', icon: 'file-question', chip: null },
};

/** Palette per group: [{ label, items: [[format, why]] }]. The first group is "Suggested". */
export const PALETTE = {
  photo: [
    { label: 'Best for photos', items: [['JPG', 'Opens everywhere, small files'], ['WebP', 'About 30 % smaller than JPG'], ['AVIF', 'Smallest, newer apps only']] },
    { label: 'Exact pixels', items: [['PNG', 'Lossless, much larger'], ['TIFF', 'Print and archive']] },
    { label: 'Other', items: [['PDF', 'One page per photo'], ['GIF', '256 colours, old apps'], ['ICO', 'Website icon, 16–256 px']] },
  ],
  graphic: [
    { label: 'Keeps transparency', items: [['WebP', 'Small, keeps transparency'], ['PNG', 'Lossless, keeps transparency'], ['AVIF', 'Smallest, newer apps only']] },
    { label: 'Icons', items: [['ICO', 'Favicon, 16–256 px'], ['GIF', 'Simple graphics, 256 colours']] },
    { label: 'No transparency', items: [['JPG', 'Fills see-through areas with white'], ['PDF', 'One page per image']] },
  ],
  video: [
    { label: 'Video', items: [['MP4', 'Plays everywhere (H.264)'], ['WebM', 'Smaller, for the web'], ['MOV', 'Apple apps and editing']] },
    { label: 'Animation', items: [['GIF', 'Silent loop, 480 px, 12 fps']] },
    { label: 'Sound only', items: [['MP3', 'Audio track, plays everywhere'], ['M4A', 'Audio track, Apple'], ['WAV', 'Audio track, lossless']] },
  ],
  audio: [
    { label: 'Compressed', items: [['MP3', 'Plays everywhere'], ['M4A', 'Better quality per MB'], ['OGG', 'Open format (Opus)']] },
    { label: 'Lossless', items: [['WAV', 'Uncompressed, for editing'], ['FLAC', 'Lossless, half the size of WAV']] },
  ],
  sheet: [
    { label: 'Spreadsheet', items: [['XLSX', 'Excel, numbers stay numbers'], ['ODS', 'LibreOffice Calc']] },
    { label: 'Data', items: [['CSV', 'One file per sheet'], ['JSON', 'One object per row'], ['TSV', 'Tabs instead of commas']] },
    { label: 'Document', items: [['PDF', 'Printable table']] },
  ],
  data: [
    { label: 'Data', items: [['JSON', 'Objects with real types'], ['YAML', 'Readable config'], ['TOML', 'Config files'], ['XML', 'Older systems']] },
    { label: 'Table', items: [['CSV', 'Opens in Excel'], ['XLSX', 'Excel, numbers stay numbers'], ['Markdown', 'Table for docs and READMEs']] },
  ],
  doc: [
    { label: 'Document', items: [['PDF', 'Selectable text, prints sharp'], ['DOCX', 'Word, editable'], ['ODT', 'LibreOffice Writer']] },
    { label: 'Plain', items: [['Markdown', 'Headings, lists, tables'], ['HTML', 'For the web'], ['TXT', 'Text only']] },
  ],
};
PALETTE.paste = PALETTE.data;
PALETTE.text = PALETTE.doc;

/** The smart default for a file (audit §4 table). null = ambiguous, ask the user. */
export function smartTarget(group, ext, chip) {
  switch (group) {
    case 'photo': return ext === 'jpg' || ext === 'jpeg' ? 'WebP' : 'JPG';
    case 'graphic': return ext === 'webp' ? 'PNG' : 'WebP';
    case 'video': return chip === 'audio' ? 'MP3' : ext === 'mp4' ? 'WebM' : 'MP4';
    case 'audio': return ['mp3', 'm4a', 'ogg', 'aac', 'opus'].includes(ext) ? 'WAV' : 'MP3';
    case 'sheet': return ext === 'csv' || ext === 'tsv' ? 'XLSX' : 'CSV';
    case 'data': return ext === 'json' ? 'YAML' : 'JSON';
    case 'paste': return 'JSON';
    case 'doc': return 'PDF';
    default: return null;
  }
}

/** SEO presets: same tool, target preset for matching inputs, everything else accepted. */
export const PRESETS = {
  'heic-to-jpg': { from: ['heic', 'heif'], to: 'JPG', noun: 'photos', lede: 'Turn iPhone photos into JPGs that open everywhere.', sample: 'heic' },
  'png-to-jpg': { from: ['png'], to: 'JPG', noun: 'images', lede: 'Smaller files that open everywhere.', sample: 'logo' },
  'jpg-to-png': { from: ['jpg', 'jpeg'], to: 'PNG', noun: 'images', lede: 'Lossless PNGs from your JPGs.', sample: 'jpg' },
  'webp-to-png': { from: ['webp'], to: 'PNG', noun: 'images', lede: 'Open WebP images in any app.', sample: 'jpg' },
  'png-to-webp': { from: ['png', 'jpg', 'jpeg'], to: 'WebP', noun: 'images', lede: 'Smaller images for the web, transparency kept.', sample: 'logo' },
  'avif-to-png': { from: ['avif'], to: 'PNG', noun: 'images', lede: 'Open AVIF images in any app.', sample: 'jpg' },
  'tiff-to-png': { from: ['tif', 'tiff'], to: 'PNG', noun: 'images', lede: 'Smaller lossless images from scans.', sample: 'jpg' },
  'mov-to-mp4': { from: ['mov'], to: 'MP4', noun: 'videos', lede: 'iPhone videos that play everywhere.', sample: 'mov' },
  'mkv-to-mp4': { from: ['mkv'], to: 'MP4', noun: 'videos', lede: 'Videos that play on every device.', sample: 'mov' },
  'webm-to-mp4': { from: ['webm'], to: 'MP4', noun: 'videos', lede: 'Web videos that play everywhere.', sample: 'mov' },
  'mp4-to-gif': { from: ['mp4', 'mov', 'webm', 'mkv'], to: 'GIF', noun: 'videos', lede: 'Trim a clip, loop it, share it.', sample: 'mov' },
  'mp4-to-mp3': { from: ['mp4', 'mov', 'webm', 'mkv', 'm4v'], to: 'MP3', noun: 'videos', lede: 'Keep just the sound of any video.', sample: 'mov' },
  'wav-to-mp3': { from: ['wav'], to: 'MP3', noun: 'audio files', lede: 'A tenth of the size, plays everywhere.', sample: 'csv' },
  'flac-to-mp3': { from: ['flac'], to: 'MP3', noun: 'audio files', lede: 'Lossless to plays-everywhere.', sample: 'csv' },
  'm4a-to-mp3': { from: ['m4a', 'aac'], to: 'MP3', noun: 'audio files', lede: 'Voice memos that play everywhere.', sample: 'csv' },
  'csv-to-json': { from: ['csv', 'tsv', 'paste'], to: 'JSON', noun: 'CSV files or text', lede: 'Typed JSON: numbers stay numbers.', sample: 'csv' },
  'json-to-csv': { from: ['json'], to: 'CSV', noun: 'JSON files', lede: 'Flat tables from JSON arrays.', sample: 'csv' },
  'xlsx-to-csv': { from: ['xlsx', 'xls', 'ods'], to: 'CSV', noun: 'spreadsheets', lede: 'Every sheet, one CSV each.', sample: 'csv' },
  'csv-to-xlsx': { from: ['csv', 'tsv'], to: 'XLSX', noun: 'CSV files', lede: 'Real numbers, not "number stored as text".', sample: 'csv' },
  'ods-to-xlsx': { from: ['ods'], to: 'XLSX', noun: 'spreadsheets', lede: 'LibreOffice sheets for Excel.', sample: 'csv' },
  'docx-to-pdf': { from: ['docx', 'doc'], to: 'PDF', noun: 'documents', lede: 'Sharp PDFs with selectable text.', sample: 'docx' },
  'odt-to-pdf': { from: ['odt'], to: 'PDF', noun: 'documents', lede: 'Sharp PDFs with selectable text.', sample: 'docx' },
  'markdown-to-pdf': { from: ['md', 'markdown', 'paste'], to: 'PDF', noun: 'Markdown files', lede: 'Headings, lists and tables, printed nicely.', sample: 'docx' },
  'html-to-pdf': { from: ['html', 'htm'], to: 'PDF', noun: 'web pages', lede: 'Save a page as a clean PDF.', sample: 'docx' },
  'docx-to-txt': { from: ['docx', 'doc', 'odt', 'rtf'], to: 'TXT', noun: 'documents', lede: 'Just the words, no layout.', sample: 'docx' },
};

/** Chip filters of the Convert page (registry leaf → item chip key). */
export const CHIPS = [
  { key: 'all', label: 'All', leaf: null },
  { key: 'image', label: 'Images', leaf: 'convert-images' },
  { key: 'video', label: 'Video', leaf: 'convert-video' },
  { key: 'audio', label: 'Audio', leaf: 'convert-audio' },
  { key: 'data', label: 'Data', leaf: 'convert-data' },
  { key: 'sheet', label: 'Sheets', leaf: 'convert-sheets' },
  { key: 'doc', label: 'Docs', leaf: 'convert-docs' },
];

// ── estimates ────────────────────────────────────────────────────────────
const bppPhoto = { JPG: 0.19, WebP: 0.13, AVIF: 0.085, PNG: 1.55, TIFF: 3.0, GIF: 0.55, PDF: 0.2, ICO: 0 };
const qCurve = (q) => Math.exp((q - 85) / 16);
/** Bytes for an image output (pixels after resize). graphic = flat logo art, compresses far better. */
export function estimateImage({ w, h, fmt, q = 85, edge = 0, graphic = false }) {
  if (fmt === 'ICO') return 15400;
  let s = 1; if (edge && Math.max(w, h) > edge) s = edge / Math.max(w, h);
  const px = w * h * s * s;
  const lossy = !FMT[fmt]?.lossless && fmt !== 'GIF';
  let b = px * (bppPhoto[fmt] ?? 0.3) * (lossy ? qCurve(q) : 1);
  if (graphic) b *= fmt === 'PNG' ? 0.05 : fmt === 'JPG' ? 0.35 : 0.3;
  return Math.max(1200, Math.round(b));
}
/** Scale a real measured output to new settings: keeps estimates honest once one real encode exists. */
export function rescaleImage(real, from, to) { return Math.round(real * (estimateImage(to) / estimateImage(from))); }

const vRate = { orig: 1, 1080: 1, 720: 0.48, 480: 0.24 };
const vQual = { small: 0.6, balanced: 1, best: 1.6 };
/** Bytes for a video/audio output of `sec` seconds. */
export function estimateMedia({ fmt, sec, res = 'orig', vq = 'balanced', sound = true }) {
  const audio = sound ? 16000 : 0; // ~128 kbps AAC
  switch (fmt) {
    case 'MP4': return Math.round(sec * (720000 * vRate[res] * vQual[vq] + audio));
    case 'WebM': return Math.round(sec * (500000 * vRate[res] * vQual[vq] + audio * 0.8));
    case 'MOV': return Math.round(sec * (800000 * vRate[res] * vQual[vq] + audio));
    case 'GIF': return Math.round(sec * 310000 * (res === '480' || res === 'orig' ? 1 : vRate[res] * 2));
    case 'MP3': return Math.round(sec * 24000);
    case 'M4A': return Math.round(sec * 20000);
    case 'OGG': return Math.round(sec * 16000);
    case 'WAV': return Math.round(sec * 192000);
    case 'FLAC': return Math.round(sec * 105000);
    default: return Math.round(sec * 400000);
  }
}
/** Rough ratio for documents/sheets/data in the mockup. */
export function estimateOther(size, fmt) {
  const r = { PDF: 1.4, DOCX: 0.6, ODT: 0.55, Markdown: 0.35, HTML: 0.8, TXT: 0.3, CSV: 0.7, XLSX: 0.45, ODS: 0.4, JSON: 1.6, YAML: 1.2, TOML: 1.2, XML: 2.1, TSV: 0.7 }[fmt] ?? 1;
  return Math.max(200, Math.round(size * r));
}

export const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, '0')}`; };
export const fmtClock = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
