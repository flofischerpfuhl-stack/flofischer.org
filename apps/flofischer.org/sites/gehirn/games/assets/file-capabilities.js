export const FORMATS = {
  docx: { label: 'Word Document', extensions: ['.docx'], family: 'document' },
  odt: { label: 'OpenDocument Text', extensions: ['.odt', '.fodt'], family: 'document' },
  rtf: { label: 'Rich Text Format', extensions: ['.rtf'], family: 'document' },
  html: { label: 'HTML', extensions: ['.html', '.htm'], family: 'document' },
  md: { label: 'Markdown', extensions: ['.md', '.markdown'], family: 'document' },
  txt: { label: 'Plain Text', extensions: ['.txt'], family: 'document' },
  epub: { label: 'EPUB', extensions: ['.epub'], family: 'document' },
  pdf: { label: 'PDF', extensions: ['.pdf'], family: 'document' },

  xlsx: { label: 'Excel Workbook', extensions: ['.xlsx'], family: 'table' },
  xls: { label: 'Excel 97-2003 Workbook', extensions: ['.xls'], family: 'table' },
  ods: { label: 'OpenDocument Spreadsheet', extensions: ['.ods'], family: 'table' },
  csv: { label: 'CSV', extensions: ['.csv'], family: 'table' },
  tsv: { label: 'TSV', extensions: ['.tsv'], family: 'table' },
  json: { label: 'JSON', extensions: ['.json'], family: 'table' },
  ndjson: { label: 'NDJSON', extensions: ['.ndjson', '.jsonl'], family: 'table' },
  parquet: { label: 'Parquet', extensions: ['.parquet'], family: 'table' },
  arrow: { label: 'Arrow', extensions: ['.arrow'], family: 'table' },
};

export const VIEWER_OWNERS = {
  docx: {
    label: 'Documents',
    formats: ['docx', 'odt', 'rtf', 'html', 'md', 'txt', 'epub'],
  },
  table: {
    label: 'Tables / Sheets',
    formats: ['xlsx', 'xls', 'ods', 'csv', 'tsv', 'json', 'ndjson'],
  },
  database: {
    label: 'Database',
    formats: ['parquet', 'arrow'],
  },
};

export const CONVERSIONS = [
  ...crossProduct(['docx', 'odt', 'rtf', 'html', 'md', 'txt', 'epub'], ['docx', 'odt', 'rtf', 'html', 'md', 'txt', 'pdf', 'epub'], 'document'),
  ...crossProduct(['xlsx', 'xls', 'ods', 'csv', 'tsv', 'json', 'ndjson'], ['xlsx', 'ods', 'csv', 'tsv', 'json', 'ndjson', 'html'], 'table'),
];

function crossProduct(from, to, engine) {
  const routes = [];
  for (const source of from) {
    for (const target of to) {
      if (source === target) continue;
      routes.push({ from: source, to: target, engine });
    }
  }
  return routes;
}

export function normalizeFormat(formatOrExtension) {
  const raw = String(formatOrExtension || '').toLowerCase().replace(/^\./, '');
  if (raw === 'markdown') return 'md';
  if (raw === 'htm') return 'html';
  if (raw === 'fodt') return 'odt';
  if (raw === 'jsonl') return 'ndjson';
  return raw;
}

export function getFormatByExtension(filenameOrExtension) {
  const raw = String(filenameOrExtension || '').toLowerCase();
  const ext = normalizeFormat(raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw);
  return FORMATS[ext] ? ext : null;
}

export function getViewerOwnerForFormat(format) {
  const normalized = normalizeFormat(format);
  for (const [owner, def] of Object.entries(VIEWER_OWNERS)) {
    if (def.formats.includes(normalized)) return owner;
  }
  return null;
}

export function getConversionsFrom(format, engine = null) {
  const normalized = normalizeFormat(format);
  return CONVERSIONS.filter((route) => route.from === normalized && (!engine || route.engine === engine));
}

export function buildExtensionRouter() {
  const out = {};
  for (const [format, meta] of Object.entries(FORMATS)) {
    const owner = getViewerOwnerForFormat(format);
    if (!owner) continue;
    for (const ext of meta.extensions) out[ext.replace(/^\./, '')] = owner;
  }
  return out;
}
