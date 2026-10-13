// Fernwork One · tool registry (DESIGN.md §2). One entry per leaf; the same `name` is used in rail, H1, <title>,
// breadcrumb, command bar and URL. Shell search, the home map, the ToolSwitcher and the drop veil all read this file.
//
// Leaf fields:
//   id        stable id (also ?leaf= on mock pages)       cat     category id
//   name      canonical sentence-case name                 chip    short label for sub-tool chips (tools only)
//   kind      'tool' (has a chip) | 'preset' (SEO alias of a tool, e.g. heic-to-jpg) | 'action' | 'setting'
//   parent    for presets: the tool leaf it presets       desc    one line, shown under the H1 and in search
//   syn       synonyms for search (lower case)             arch    'workbench' | 'queue' | 'instant'
//   icon      icon name (icons.js)                         path    the future real URL (reference only)

export const GROUPS = [
  { id: 'files', label: 'Files' },
  { id: 'quick', label: 'Quick tools' },
];

// `area` = mockup folder under /mockups/ that owns the category (other agents build these).
export const CATEGORIES = [
  { id: 'convert',   label: 'Convert',   group: 'files', icon: 'arrow-left-right', arch: 'queue',     area: 'convert',     blurb: 'Images, video, audio, data, sheets and documents' },
  { id: 'pdf',       label: 'PDF',       group: 'files', icon: 'file-text',        arch: 'workbench', area: 'pdf',         blurb: 'Edit, merge, split, compress, sign' },
  { id: 'images',    label: 'Images',    group: 'files', icon: 'image',            arch: 'workbench', area: 'image-tools', blurb: 'Edit, mark up, inspect and export photos' },
  { id: 'open',      label: 'Open',      group: 'files', icon: 'folder-open',      arch: 'workbench', area: 'viewers',     blurb: 'View any file: Word, Excel, CAD, 3D, data' },
  { id: 'canvas',    label: 'Canvas',    group: 'files', icon: 'pen-tool',         arch: 'workbench', area: 'canvas',      blurb: 'Boards to draw, map and diagram' },
  { id: 'text',      label: 'Text',      group: 'quick', icon: 'type',             arch: 'workbench', area: 'text',        blurb: 'One editor for JSON, diff, regex and counts' },
  { id: 'developer', label: 'Developer', group: 'quick', icon: 'braces',           arch: 'instant',   area: 'security',    blurb: 'Decode, hash, generate, sign, time' },
  { id: 'numbers',   label: 'Numbers',   group: 'quick', icon: 'calculator',       arch: 'instant',   area: 'units',       blurb: 'Calculator with graphs and every unit' },
  { id: 'share',     label: 'Share',     group: 'quick', icon: 'share-2',          arch: 'instant',   area: 'utilities',   blurb: 'Clean links, QR codes, sealed notes' },
  { id: 'color',     label: 'Color',     group: 'quick', icon: 'pipette',          arch: 'instant',   area: 'utilities',   blurb: 'Pick, check contrast, build palettes' },
];

const L = (cat, id, name, o = {}) => ({ cat, id, name, kind: 'tool', syn: [], ...o });
const P = (parent, id, name, syn = [], o = {}) => ({ id, name, kind: 'preset', parent, syn, ...o });

export const LEAVES = [
  // ── Convert (queue) ─────────────────────────────────────────────────────────
  L('convert', 'convert-images', 'Convert images', { chip: 'Images', icon: 'image', desc: 'JPG, PNG, WebP, AVIF, HEIC and more. Batch, offline.', syn: ['image converter', 'photo', 'picture', 'jpeg', 'jpg', 'png', 'webp', 'avif', 'heic', 'tiff', 'bmp', 'gif'] }),
  L('convert', 'convert-video', 'Convert video', { chip: 'Video', icon: 'film', desc: 'MP4, WebM, MOV, MKV, GIF. Trim and shrink.', syn: ['video converter', 'movie', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'gif', 'clip'] }),
  L('convert', 'convert-audio', 'Convert audio', { chip: 'Audio', icon: 'music', desc: 'MP3, WAV, FLAC, OGG, M4A.', syn: ['audio converter', 'sound', 'music', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'podcast'] }),
  L('convert', 'convert-data', 'Convert data', { chip: 'Data', icon: 'braces', desc: 'JSON, YAML, XML, CSV, TOML, Parquet.', syn: ['json', 'yaml', 'xml', 'csv', 'toml', 'parquet'] }),
  L('convert', 'convert-sheets', 'Convert spreadsheets', { chip: 'Sheets', icon: 'sheet', desc: 'XLSX, ODS, CSV.', syn: ['excel', 'xlsx', 'xls', 'ods', 'spreadsheet', 'table'] }),
  L('convert', 'convert-docs', 'Convert documents', { chip: 'Docs', icon: 'file-text', desc: 'Word, ODT, RTF, Markdown, HTML to PDF and back.', syn: ['word', 'docx', 'doc', 'odt', 'rtf', 'markdown', 'md', 'html', 'to pdf'] }),
  P('convert-images', 'heic-to-jpg', 'HEIC to JPG', ['iphone photo', 'heif', 'apple photo', 'heic jpeg'], { desc: 'Turn iPhone photos into JPGs that open everywhere.', popular: 1 }),
  P('convert-images', 'png-to-jpg', 'PNG to JPG', ['png jpeg']),
  P('convert-images', 'jpg-to-png', 'JPG to PNG', ['jpeg to png', 'transparent']),
  P('convert-images', 'webp-to-png', 'WebP to PNG', ['webp']),
  P('convert-images', 'png-to-webp', 'PNG to WebP', ['webp', 'smaller images']),
  P('convert-images', 'avif-to-png', 'AVIF to PNG', ['avif']),
  P('convert-images', 'tiff-to-png', 'TIFF to PNG', ['tif', 'tiff']),
  P('convert-video', 'mov-to-mp4', 'MOV to MP4', ['quicktime', 'iphone video']),
  P('convert-video', 'mkv-to-mp4', 'MKV to MP4', ['matroska']),
  P('convert-video', 'webm-to-mp4', 'WebM to MP4', ['webm']),
  P('convert-video', 'mp4-to-gif', 'MP4 to GIF', ['gif maker', 'animated gif'], { popular: 1 }),
  P('convert-audio', 'mp4-to-mp3', 'MP4 to MP3', ['extract audio', 'video to mp3', 'youtube mp3'], { popular: 1 }),
  P('convert-audio', 'wav-to-mp3', 'WAV to MP3', ['wav']),
  P('convert-audio', 'flac-to-mp3', 'FLAC to MP3', ['flac', 'lossless']),
  P('convert-audio', 'm4a-to-mp3', 'M4A to MP3', ['m4a', 'voice memo', 'aac']),
  P('convert-data', 'csv-to-json', 'CSV to JSON', ['csv json']),
  P('convert-data', 'json-to-csv', 'JSON to CSV', ['json csv', 'json to excel']),
  P('convert-sheets', 'xlsx-to-csv', 'XLSX to CSV', ['excel to csv']),
  P('convert-sheets', 'csv-to-xlsx', 'CSV to XLSX', ['csv to excel']),
  P('convert-sheets', 'ods-to-xlsx', 'ODS to XLSX', ['libreoffice calc']),
  P('convert-docs', 'docx-to-pdf', 'Word to PDF', ['docx to pdf', 'doc to pdf'], { popular: 1 }),
  P('convert-docs', 'odt-to-pdf', 'ODT to PDF', ['libreoffice writer']),
  P('convert-docs', 'markdown-to-pdf', 'Markdown to PDF', ['md to pdf']),
  P('convert-docs', 'html-to-pdf', 'HTML to PDF', ['webpage to pdf']),
  P('convert-docs', 'docx-to-txt', 'Word to text', ['docx to txt', 'extract text']),

  // ── PDF (workbench; out of scope this round, but listed) ────────────────────
  L('pdf', 'edit-pdf', 'Edit PDF', { chip: 'Edit', icon: 'pencil', desc: 'Change text, add images, fill forms.', syn: ['pdf editor', 'annotate', 'fill form', 'change pdf'] }),
  L('pdf', 'merge-pdf', 'Merge PDF', { chip: 'Merge', icon: 'merge', desc: 'Combine PDFs into one, in any order.', syn: ['combine pdf', 'join pdf', 'pdf merge'], popular: 1 }),
  L('pdf', 'split-pdf', 'Split PDF', { chip: 'Split', icon: 'split', desc: 'Pull pages out or split by range.', syn: ['extract pages', 'separate pdf'] }),
  L('pdf', 'compress-pdf', 'Compress PDF', { chip: 'Compress', icon: 'minimize-2', desc: 'Make PDFs small enough to email.', syn: ['reduce pdf size', 'shrink pdf', 'smaller pdf'], popular: 1 }),
  L('pdf', 'sign-pdf', 'Sign PDF', { chip: 'Sign', icon: 'signature', desc: 'Draw or type a signature.', syn: ['signature', 'e-sign'] }),
  L('pdf', 'ocr-pdf', 'OCR PDF', { chip: 'OCR', icon: 'scan-text', desc: 'Make scanned PDFs searchable.', syn: ['searchable pdf', 'text recognition', 'scan'] }),
  L('pdf', 'redact-pdf', 'Redact PDF', { chip: 'Redact', icon: 'eraser', desc: 'Black out text for good.', syn: ['censor', 'blackout', 'hide text'] }),

  // ── Images (workbench "Lightbox") ───────────────────────────────────────────
  L('images', 'image-edit', 'Edit image', { chip: 'Edit', icon: 'sliders-horizontal', desc: 'Crop, rotate, resize, adjust, remove background.', syn: ['photo editor', 'crop', 'rotate', 'resize', 'brightness', 'lightbox'] }),
  L('images', 'image-markup', 'Mark up image', { chip: 'Markup', icon: 'pencil', desc: 'Arrows, boxes, text, blur and highlights.', syn: ['annotate', 'screenshot', 'arrow', 'blur', 'redact image'] }),
  L('images', 'image-inspect', 'Inspect image', { chip: 'Inspect', icon: 'scan', desc: 'Metadata, GPS, colours and text in the picture.', syn: ['exif', 'metadata', 'gps', 'location'] }),
  L('images', 'image-export', 'Export image', { chip: 'Export', icon: 'download', desc: 'Pick format and size, see the result before saving.', syn: ['save as', 'compress', 'optimize'] }),
  P('image-edit', 'compress-image', 'Compress image', ['reduce image size', 'smaller photo', 'optimize jpg', 'tinypng', 'heic photo'], { popular: 1 }),
  P('image-edit', 'resize-image', 'Resize image', ['scale', 'dimensions', 'pixels']),
  P('image-edit', 'crop-image', 'Crop image', ['cut', 'trim photo']),
  P('image-edit', 'remove-background', 'Remove background', ['background remover', 'transparent', 'cut out', 'bg'], { popular: 1 }),
  P('image-inspect', 'image-metadata', 'View image metadata', ['exif viewer', 'photo info', 'camera', 'heic info']),
  P('image-inspect', 'image-ocr', 'Read text in image', ['ocr', 'image to text', 'extract text', 'scan text']),
  P('image-markup', 'blur-image', 'Blur part of an image', ['pixelate', 'hide face', 'redact']),

  // ── Open (universal viewer) ─────────────────────────────────────────────────
  L('open', 'open-file', 'Open file', { chip: 'Any file', icon: 'folder-open', desc: 'Word, Excel, PowerPoint, CAD, 3D, databases. Nothing to install.', syn: ['viewer', 'view', 'reader', 'preview', 'open'] }),
  P('open-file', 'word-viewer', 'Word viewer', ['docx viewer', 'doc', 'open word']),
  P('open-file', 'excel-viewer', 'Excel viewer', ['xlsx viewer', 'xls', 'open excel']),
  P('open-file', 'powerpoint-viewer', 'PowerPoint viewer', ['pptx viewer', 'slides', 'presentation']),
  P('open-file', 'csv-viewer', 'CSV viewer', ['table viewer', 'tsv']),
  P('open-file', 'sqlite-viewer', 'SQLite viewer', ['database', 'db', 'sql']),
  P('open-file', 'parquet-viewer', 'Parquet viewer', ['arrow', 'data lake']),
  P('open-file', 'dxf-viewer', 'DXF viewer', ['cad', 'autocad', 'dwg']),
  P('open-file', 'ifc-viewer', 'IFC viewer', ['bim', 'building model']),
  P('open-file', 'stl-viewer', 'STL viewer', ['3d', '3d print', 'obj']),
  P('open-file', 'svg-viewer', 'SVG viewer', ['vector']),

  // ── Canvas ──────────────────────────────────────────────────────────────────
  L('canvas', 'draw', 'Draw', { chip: 'Draw', icon: 'brush', desc: 'An infinite whiteboard for sketches and notes.', syn: ['whiteboard', 'sketch', 'excalidraw', 'board', 'canvas'] }),
  L('canvas', 'mind-map', 'Mind map', { chip: 'Mind map', icon: 'network', desc: 'Think in branches. Keyboard first.', syn: ['brainstorm', 'mindmap', 'tree'] }),
  L('canvas', 'diagram', 'Diagram', { chip: 'Diagram', icon: 'workflow', desc: 'Flowcharts and Mermaid diagrams.', syn: ['flowchart', 'mermaid', 'uml', 'chart'] }),

  // ── Text (Textbench + lenses) ───────────────────────────────────────────────
  L('text', 'textbench', 'Textbench', { chip: 'Editor', icon: 'text-cursor', desc: 'One editor for any text. Lenses for JSON, diff, regex, counts.', syn: ['text editor', 'notepad', 'scratchpad', 'text tools'] }),
  L('text', 'format-json', 'Format JSON', { chip: 'JSON', icon: 'braces', desc: 'Pretty-print, validate and explore JSON.', syn: ['json formatter', 'json validator', 'beautify', 'prettify', 'minify json', 'json viewer'], popular: 1 }),
  L('text', 'compare-text', 'Compare text', { chip: 'Compare', icon: 'git-compare', desc: 'See what changed between two texts.', syn: ['diff', 'difference', 'compare files', 'diff checker'] }),
  L('text', 'test-regex', 'Test regex', { chip: 'Regex', icon: 'regex', desc: 'Live matches, groups and replace.', syn: ['regular expression', 'regexp', 'pattern'] }),
  L('text', 'word-count', 'Word count', { chip: 'Stats', icon: 'list-checks', desc: 'Words, characters, reading time.', syn: ['character count', 'letter count', 'stats', 'count words'] }),
  L('text', 'transform-text', 'Transform text', { chip: 'Transform', icon: 'replace', desc: 'Case, sort, dedupe, trim, slug.', syn: ['uppercase', 'lowercase', 'sort lines', 'remove duplicates', 'case converter', 'slug'] }),
  L('text', 'ascii-art', 'ASCII art', { chip: 'ASCII art', icon: 'case-sensitive', desc: 'Big letters and pictures from text.', syn: ['figlet', 'banner', 'text art'] }),

  // ── Developer (instant; Checksum is a queue) ────────────────────────────────
  L('developer', 'inspect', 'Inspect', { chip: 'Inspect', icon: 'scan', desc: 'Paste anything: JWT, Base64, URL, hex. See what it is.', syn: ['decode', 'decoder', 'base64', 'jwt', 'jwt decoder', 'url decode', 'hex', 'uuid', 'what is this'] }),
  L('developer', 'checksum', 'Checksum', { chip: 'Checksum', icon: 'fingerprint', arch: 'queue', desc: 'SHA-256, SHA-1, MD5 for files and text. Verify downloads.', syn: ['hash', 'sha256', 'sha-256', 'md5', 'sha1', 'verify download', 'sha256sums'] }),
  L('developer', 'generate', 'Generate', { chip: 'Generate', icon: 'refresh-cw', desc: 'UUIDs, passwords, passphrases, random numbers.', syn: ['uuid', 'guid', 'password', 'passphrase', 'random', 'nanoid'] }),
  L('developer', 'keys-hmac', 'Keys & HMAC', { chip: 'Keys & HMAC', icon: 'key-round', desc: 'Sign and verify with HMAC, make key pairs.', syn: ['hmac', 'signature', 'keypair', 'rsa', 'ed25519', 'sign'] }),
  L('developer', 'time', 'Time', { chip: 'Time', icon: 'calendar-clock', desc: 'Unix timestamps, ISO dates, time zones.', syn: ['timestamp', 'epoch', 'unix time', 'iso 8601', 'date', 'timezone', 'utc'] }),
  P('inspect', 'jwt-decoder', 'Decode JWT', ['jwt', 'json web token', 'bearer']),
  P('inspect', 'base64-decode', 'Base64 decode', ['base64', 'b64', 'atob', 'encode']),
  P('generate', 'uuid-generator', 'UUID generator', ['uuid', 'guid', 'uuid v4', 'uuid v7']),
  P('generate', 'password-generator', 'Password generator', ['strong password', 'passphrase', 'random password']),
  P('checksum', 'sha256', 'SHA-256 checksum', ['sha256sum', 'hash file']),
  P('time', 'unix-timestamp', 'Unix timestamp', ['epoch converter', 'timestamp converter']),

  // ── Numbers ─────────────────────────────────────────────────────────────────
  L('numbers', 'calculator', 'Calculator', { chip: 'Calculator', icon: 'calculator', arch: 'workbench', area: 'calculator', desc: 'A paper that calculates, with graphs and variables.', syn: ['calc', 'math', 'graph', 'plot', 'percent', 'scientific'] }),
  L('numbers', 'units', 'Units', { chip: 'Units', icon: 'ruler', desc: 'Every unit, typed like you say it: "5 ft in cm".', syn: ['unit converter', 'convert units', 'length', 'weight', 'temperature', 'currency', 'metric', 'imperial'] }),
  P('units', 'cm-to-inches', 'cm to inches', ['centimeters inches', 'cm in'], { popular: 1 }),
  P('units', 'kg-to-lb', 'kg to lb', ['kilograms pounds']),
  P('units', 'celsius-to-fahrenheit', 'Celsius to Fahrenheit', ['c to f', 'temperature']),
  P('units', 'km-to-miles', 'km to miles', ['kilometers miles', 'km mi']),
  P('calculator', 'percentage', 'Percentage calculator', ['percent', 'what percent', '% of']),

  // ── Share ───────────────────────────────────────────────────────────────────
  L('share', 'clean-link', 'Clean link', { chip: 'Clean link', icon: 'link', desc: 'Strip trackers from a link before you share it.', syn: ['url cleaner', 'remove tracking', 'utm', 'shortener', 'url shortener', 'untrack', 'fbclid'] }),
  L('share', 'qr-code', 'QR code', { chip: 'QR code', icon: 'qr-code', desc: 'Make and read QR codes: links, Wi-Fi, contacts.', syn: ['qr generator', 'qr reader', 'scan qr', 'barcode'], popular: 1 }),
  L('share', 'seal', 'Seal', { chip: 'Seal', icon: 'stamp', desc: 'Encrypt a note or file and share it with a password.', syn: ['encrypt', 'share secret', 'password protect', 'secure note', 'decrypt'] }),
  P('qr-code', 'wifi-qr', 'Wi-Fi QR code', ['wifi', 'wlan', 'guest network']),

  // ── Color ───────────────────────────────────────────────────────────────────
  L('color', 'pick-color', 'Pick color', { chip: 'Pick', icon: 'pipette', desc: 'HEX, RGB, HSL, OKLCH, from any image.', syn: ['color picker', 'colour', 'hex', 'rgb', 'hsl', 'eyedropper'] }),
  L('color', 'contrast', 'Check contrast', { chip: 'Contrast', icon: 'contrast', desc: 'WCAG AA and AAA for any two colours.', syn: ['wcag', 'accessibility', 'a11y', 'contrast ratio'] }),
  L('color', 'palette', 'Make palette', { chip: 'Palette', icon: 'swatch-book', desc: 'Scales, harmonies and palettes from a photo.', syn: ['color scheme', 'swatches', 'tailwind colors'] }),
];

// Settings and shell actions available in the command bar (handled by shell.js).
export const ACTIONS = [
  { id: 'theme-dark', name: 'Dark theme', kind: 'setting', icon: 'moon', syn: ['dark mode', 'night', 'theme'] },
  { id: 'theme-light', name: 'Light theme', kind: 'setting', icon: 'sun', syn: ['light mode', 'day', 'theme'] },
  { id: 'theme-system', name: 'Match system theme', kind: 'setting', icon: 'monitor', syn: ['auto theme', 'os theme'] },
  { id: 'shortcuts', name: 'Keyboard shortcuts', kind: 'action', icon: 'keyboard', syn: ['hotkeys', 'keys', 'help', '?'] },
  { id: 'go-home', name: 'Go to home', kind: 'action', icon: 'house', syn: ['start', 'all tools', 'homepage'] },
  { id: 'install', name: 'Install Fernwork', kind: 'setting', icon: 'download', syn: ['pwa', 'app', 'offline'] },
  { id: 'clear-recent', name: 'Clear recent tools', kind: 'setting', icon: 'trash-2', syn: ['history', 'privacy', 'forget'] },
];

// ── Derived helpers ───────────────────────────────────────────────────────────
const byId = new Map(LEAVES.map((l) => [l.id, l]));
for (const p of LEAVES) {               // presets inherit category/arch/icon from their parent tool
  if (p.kind !== 'preset') continue;
  const t = byId.get(p.parent);
  p.cat = t.cat; p.icon = p.icon || t.icon; p.arch = p.arch || t.arch; p.area = p.area || t.area;
  if (!p.desc) { p.desc = t.desc; p.descInherited = true; }
}
for (const l of LEAVES) {
  const c = CATEGORIES.find((x) => x.id === l.cat);
  l.arch = l.arch || c.arch; l.area = l.area || c.area; l.icon = l.icon || c.icon;
  l.path = l.path || `/${l.cat}/${l.id}`;
}

export const leaf = (id) => byId.get(id);
export const category = (id) => CATEGORIES.find((c) => c.id === id);
export const toolsOf = (catId) => LEAVES.filter((l) => l.cat === catId && l.kind === 'tool');
export const presetsOf = (toolId) => LEAVES.filter((l) => l.parent === toolId);
/** The chip (tool) a leaf belongs to: itself for tools, its parent for presets. */
export const chipOf = (l) => (l.kind === 'preset' ? byId.get(l.parent) : l);
export const POPULAR = ['heic-to-jpg', 'compress-pdf', 'merge-pdf', 'remove-background', 'mp4-to-mp3', 'format-json', 'qr-code', 'cm-to-inches'];
