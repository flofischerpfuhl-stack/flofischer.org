// Fernwork One · tool registry. Revision 1: today's fernwork.net information architecture (assets/nav.js).
// One entry per leaf. Shell search (⌘K), the home map, the rail, the ToolSwitcher, sub-tool chips and the drop veil
// all read this file.
//
// Leaf fields:
//   id        stable id (also ?leaf= on mock pages)       cat     category id
//   name      full name: H1, <title>, search result        chip    today's sidebar label: rail leaf, sub-tool chip, home map
//   kind      'tool' (a sub-tool page, has a chip) | 'preset' (SEO landing alias of a tool, e.g. heic-to-jpg)
//   parent    for presets: the tool leaf it presets       desc    one line under the H1 and in search
//   syn       synonyms for search (lower case)             arch    'workbench' | 'queue' | 'instant'
//   icon      icon name (icons.js)                         path    today's real URL (reference only)
//   pair      units presets only: [fromUnit, toUnit] as typed in the Units tool (e.g. ['lb', 'kg'])
//
// Old (round 1) ids still resolve through ALIASES (getLeaf('format-json') → the JSON Formatter leaf).

/** Today's nav has no groups; one group keeps the old API (renderCatalog({ group }), GROUPS) working. */
export const GROUPS = [{ id: 'tools', label: 'Tools' }];

// `area` = mockup folder under /mockups/ that owns the category ('pdf' has no mockup → shell skeleton).
export const CATEGORIES = [
  { id: 'convert',     label: 'Convert',     group: 'tools', icon: 'shuffle',    arch: 'queue',     area: 'convert',     page: 'converters.html',     blurb: 'Images, video, audio, data, tables, documents' },
  { id: 'pdf',         label: 'PDF Tools',   group: 'tools', icon: 'file-text',  arch: 'workbench', area: 'pdf',         page: 'pdf-tools.html',      blurb: 'Edit, merge, split, compress, sign, OCR, redact' },
  { id: 'image-tools', label: 'Image Tools', group: 'tools', icon: 'image',      arch: 'workbench', area: 'image-tools', page: 'image-tools.html',    blurb: 'Crop, resize, adjust, annotate, compress, export' },
  { id: 'viewers',     label: 'Viewers',     group: 'tools', icon: 'eye',        arch: 'workbench', area: 'viewers',     page: 'viewers.html',        blurb: 'Documents, sheets, slides, CAD, 3D, databases' },
  { id: 'units',       label: 'Units',       group: 'tools', icon: 'boxes',      arch: 'instant',   area: 'units',       page: 'unit-converter.html', blurb: 'Length, weight, temperature and 11 more' },
  { id: 'calculator',  label: 'Calculator',  group: 'tools', icon: 'calculator', arch: 'workbench', area: 'calculator',  page: 'calculator.html',     blurb: 'Calculate and graph on one paper' },
  { id: 'text',        label: 'Text',        group: 'tools', icon: 'type',       arch: 'instant',   area: 'text',        page: 'text-tools.html',     blurb: 'JSON, diff, regex, counts, case, cleanup, ASCII' },
  { id: 'security',    label: 'Security',    group: 'tools', icon: 'lock',       arch: 'instant',   area: 'security',    page: 'crypto.html',         blurb: 'Hashes, encoders, encryption, passwords, UUIDs, JWT' },
  { id: 'utilities',   label: 'Utilities',   group: 'tools', icon: 'wrench',     arch: 'instant',   area: 'utilities',   page: 'utilities.html',      blurb: 'QR codes, URL cleaner, timestamps, colours' },
  { id: 'canvas',      label: 'Canvas',      group: 'tools', icon: 'pen-tool',   arch: 'workbench', area: 'canvas',      page: 'canvas.html',         blurb: 'Draw, mind maps and Mermaid on one board' },
];

const L = (cat, id, name, chip, o = {}) => ({ cat, id, name, chip, kind: 'tool', syn: [], ...o });
const P = (parent, id, name, syn = [], o = {}) => ({ id, name, kind: 'preset', parent, syn, ...o });
const U = (parent, id, name, pair, syn = [], o = {}) => P(parent, id, name, syn, { pair, ...o });

export const LEAVES = [
  // ── Convert (queue; one page per sub-tool, chips switch) ───────────────────
  L('convert', 'convert-images', 'Image Converter', 'Images', { icon: 'image', hash: '#image', desc: 'JPG, PNG, WebP, AVIF, HEIC, TIFF and more, in batches.', syn: ['image converter', 'photo converter', 'picture', 'jpeg', 'jpg', 'png', 'webp', 'avif', 'heic', 'tiff', 'bmp', 'gif'] }),
  L('convert', 'convert-video', 'Video Converter', 'Video', { icon: 'film', hash: '#video', desc: 'MP4, WebM, MOV, MKV and GIF.', syn: ['video converter', 'movie', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'gif', 'clip'] }),
  L('convert', 'convert-audio', 'Audio Converter', 'Audio', { icon: 'music', hash: '#audio', desc: 'MP3, WAV, FLAC, OGG and M4A.', syn: ['audio converter', 'sound', 'music', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'podcast'] }),
  L('convert', 'convert-data', 'Data Converter', 'Data', { icon: 'braces', hash: '#data', desc: 'JSON, YAML, XML, CSV and TOML.', syn: ['data converter', 'json', 'yaml', 'xml', 'csv', 'toml', 'json to yaml', 'yaml to json'] }),
  L('convert', 'convert-tables', 'Table Converter', 'Tables', { icon: 'sheet', hash: '#table-convert', desc: 'XLSX, ODS, CSV and TSV.', syn: ['table converter', 'spreadsheet converter', 'excel', 'xlsx', 'xls', 'ods', 'spreadsheet', 'sheet'] }),
  L('convert', 'convert-documents', 'Document Converter', 'Documents', { icon: 'file-text', hash: '#documents', desc: 'Word, ODT, RTF, Markdown and HTML to PDF and back.', syn: ['document converter', 'word', 'docx', 'doc', 'odt', 'rtf', 'markdown', 'md', 'html', 'to pdf'] }),
  P('convert-images', 'heic-to-jpg', 'HEIC to JPG', ['iphone photo', 'heif', 'apple photo', 'heic jpeg', 'heic converter'], { desc: 'Turn iPhone photos into JPGs that open everywhere.', popular: 1 }),
  P('convert-images', 'png-to-jpg', 'PNG to JPG', ['png jpeg', 'png to jpeg']),
  P('convert-images', 'jpg-to-png', 'JPG to PNG', ['jpeg to png', 'transparent']),
  P('convert-images', 'webp-to-png', 'WebP to PNG', ['webp']),
  P('convert-images', 'png-to-webp', 'PNG to WebP', ['webp', 'smaller images']),
  P('convert-images', 'avif-to-png', 'AVIF to PNG', ['avif']),
  P('convert-images', 'tiff-to-png', 'TIFF to PNG', ['tif', 'tiff']),
  P('convert-video', 'mov-to-mp4', 'MOV to MP4', ['quicktime', 'iphone video']),
  P('convert-video', 'mkv-to-mp4', 'MKV to MP4', ['matroska']),
  P('convert-video', 'webm-to-mp4', 'WebM to MP4', ['webm']),
  P('convert-video', 'mp4-to-gif', 'MP4 to GIF', ['gif maker', 'animated gif', 'video to gif'], { popular: 1 }),
  P('convert-audio', 'mp4-to-mp3', 'MP4 to MP3', ['extract audio', 'video to mp3'], { popular: 1 }),
  P('convert-audio', 'wav-to-mp3', 'WAV to MP3', ['wav']),
  P('convert-audio', 'flac-to-mp3', 'FLAC to MP3', ['flac', 'lossless']),
  P('convert-audio', 'm4a-to-mp3', 'M4A to MP3', ['m4a', 'voice memo', 'aac']),
  P('convert-audio', 'mp3-to-wav', 'MP3 to WAV', ['wav']),
  P('convert-audio', 'mp3-to-ogg', 'MP3 to OGG', ['ogg', 'vorbis']),
  P('convert-data', 'csv-to-json', 'CSV to JSON', ['csv json']),
  P('convert-data', 'json-to-csv', 'JSON to CSV', ['json csv', 'json to excel']),
  P('convert-tables', 'xlsx-to-csv', 'XLSX to CSV', ['excel to csv']),
  P('convert-tables', 'csv-to-xlsx', 'CSV to XLSX', ['csv to excel']),
  P('convert-tables', 'ods-to-xlsx', 'ODS to XLSX', ['libreoffice calc']),
  P('convert-tables', 'xlsx-to-ods', 'XLSX to ODS', ['excel to libreoffice']),
  P('convert-documents', 'docx-to-pdf', 'DOCX to PDF', ['word to pdf', 'doc to pdf'], { popular: 1 }),
  P('convert-documents', 'odt-to-pdf', 'ODT to PDF', ['libreoffice writer']),
  P('convert-documents', 'odt-to-docx', 'ODT to DOCX', ['odt to word']),
  P('convert-documents', 'rtf-to-pdf', 'RTF to PDF', ['rich text']),
  P('convert-documents', 'markdown-to-pdf', 'Markdown to PDF', ['md to pdf']),
  P('convert-documents', 'html-to-pdf', 'HTML to PDF', ['webpage to pdf']),
  P('convert-documents', 'docx-to-txt', 'DOCX to TXT', ['word to text', 'extract text']),

  // ── PDF Tools (one workbench; no mockup this round → shell skeleton) ───────
  L('pdf', 'pdf-tools', 'PDF Tools', 'PDF Tools', { icon: 'file-text', desc: 'Edit, merge, split, compress, sign, OCR and redact PDFs.', syn: ['pdf', 'pdf editor', 'pdf tools'] }),
  P('pdf-tools', 'edit-pdf', 'Edit PDF', ['pdf editor', 'change pdf text', 'fill form', 'annotate pdf'], { path: '/tools/pdf-edit' }),
  P('pdf-tools', 'merge-pdf', 'Merge PDF', ['combine pdf', 'join pdf', 'pdf merge'], { popular: 1, path: '/tools/pdf-merge' }),
  P('pdf-tools', 'split-pdf', 'Split PDF', ['extract pages', 'separate pdf'], { path: '/tools/pdf-split' }),
  P('pdf-tools', 'compress-pdf', 'Compress PDF', ['reduce pdf size', 'shrink pdf', 'smaller pdf'], { popular: 1, path: '/tools/pdf-compress' }),
  P('pdf-tools', 'sign-pdf', 'Sign PDF', ['signature', 'e-sign'], { path: '/tools/pdf-sign' }),
  P('pdf-tools', 'ocr-pdf', 'OCR PDF', ['searchable pdf', 'text recognition', 'scan'], { path: '/tools/pdf-ocr' }),
  P('pdf-tools', 'redact-pdf', 'Redact PDF', ['censor', 'blackout', 'hide text'], { path: '/tools/pdf-redact' }),

  // ── Image Tools (one workbench) ─────────────────────────────────────────────
  L('image-tools', 'image-tools', 'Image Tools', 'Image Tools', { icon: 'image', desc: 'Crop, resize, adjust, annotate, compress and export images.', syn: ['image editor', 'photo editor', 'edit image', 'edit photo', 'lightbox'] }),
  P('image-tools', 'compress-image', 'Compress image', ['reduce image size', 'smaller photo', 'optimize jpg', 'tinypng'], { popular: 1 }),
  P('image-tools', 'resize-image', 'Resize image', ['scale', 'dimensions', 'pixels']),
  P('image-tools', 'crop-image', 'Crop image', ['cut', 'trim photo', 'rotate']),
  P('image-tools', 'remove-background', 'Remove background', ['background remover', 'transparent', 'cut out', 'bg'], { popular: 1 }),
  P('image-tools', 'annotate-image', 'Annotate image', ['markup', 'arrow', 'text on image', 'screenshot']),
  P('image-tools', 'blur-image', 'Blur image', ['pixelate', 'hide face', 'redact image']),
  P('image-tools', 'image-metadata', 'Image metadata', ['exif', 'exif viewer', 'gps', 'remove exif', 'photo info']),

  // ── Viewers (one page per format) ───────────────────────────────────────────
  L('viewers', 'viewer-markdown', 'Markdown Viewer', 'Markdown', { icon: 'file-code', hash: '#markdown', desc: 'Read and preview Markdown files.', syn: ['md', 'markdown preview', 'readme'] }),
  L('viewers', 'viewer-svg', 'SVG Viewer', 'SVG', { icon: 'shapes', hash: '#svg', desc: 'View and inspect SVG graphics.', syn: ['vector', 'svg preview'] }),
  L('viewers', 'viewer-table', 'Table Viewer', 'Tables / Sheets', { icon: 'sheet', hash: '#table', desc: 'Open CSV, Excel, ODS, Parquet and Arrow tables.', syn: ['csv viewer', 'excel viewer', 'xlsx', 'xls', 'ods', 'tsv', 'parquet', 'arrow', 'spreadsheet'] }),
  L('viewers', 'viewer-documents', 'Document Viewer', 'Documents', { icon: 'file-text', hash: '#docx', desc: 'Open Word, ODT and RTF documents.', syn: ['word viewer', 'docx viewer', 'doc', 'odt', 'rtf', 'open word'] }),
  L('viewers', 'viewer-pptx', 'PowerPoint Viewer', 'PowerPoint (PPTX)', { icon: 'presentation', hash: '#pptx', desc: 'Open PowerPoint slides.', syn: ['pptx', 'ppt', 'slides', 'presentation', 'odp'] }),
  L('viewers', 'viewer-dxf', 'DXF Viewer', 'DXF Drawing', { icon: 'compass', hash: '#dxf', desc: 'Open DXF drawings: layers, measure, export.', syn: ['cad', 'autocad', 'dwg', 'drawing'] }),
  L('viewers', 'viewer-pointcloud', 'Point Cloud Viewer', 'Point Cloud', { icon: 'scan', hash: '#pointcloud', desc: 'Open LAS, LAZ, PLY, XYZ and other point clouds.', syn: ['las', 'laz', 'xyz', 'ply', 'e57', 'lidar', 'scan'] }),
  L('viewers', 'viewer-shapefile', 'Shapefile Viewer', 'Shapefile', { icon: 'globe', hash: '#shape', desc: 'Open Shapefiles and GeoJSON on a map.', syn: ['shp', 'gis', 'geojson', 'map'] }),
  L('viewers', 'viewer-ifc', 'IFC Viewer', 'IFC Model', { icon: 'box', hash: '#ifc', desc: 'Open IFC building models.', syn: ['bim', 'building model'] }),
  L('viewers', 'viewer-stl', 'STL / OBJ Viewer', 'STL / OBJ', { icon: 'box', hash: '#stl', desc: 'Open STL and OBJ 3D models.', syn: ['3d', '3d print', 'stl', 'obj', 'mesh'] }),
  L('viewers', 'viewer-database', 'Database Viewer', 'Database', { icon: 'database', hash: '#database', desc: 'Browse SQLite databases.', syn: ['sqlite', 'db', 'sql'] }),
  P('viewer-table', 'csv-viewer', 'CSV Viewer', ['table viewer', 'tsv']),
  P('viewer-table', 'excel-viewer', 'Excel Viewer', ['xlsx viewer', 'xls']),
  P('viewer-table', 'parquet-viewer', 'Parquet Viewer', ['arrow', 'data lake']),
  P('viewer-documents', 'docx-viewer', 'DOCX Viewer', ['word viewer']),
  P('viewer-database', 'sqlite-viewer', 'SQLite Viewer', ['database', 'db']),

  // ── Units (one page per category + conversion-pair landing presets) ────────
  L('units', 'units-length', 'Length Converter', 'Length', { icon: 'ruler', hash: '#length', desc: 'Metres, feet, inches, miles and more.', syn: ['length', 'distance', 'meter', 'feet', 'inch', 'mile', 'cm', 'km', 'unit converter'] }),
  L('units', 'units-area', 'Area Converter', 'Area', { icon: 'square', hash: '#area', desc: 'Square metres, square feet, acres, hectares.', syn: ['area', 'square meter', 'sqm', 'sq ft', 'acre', 'hectare'] }),
  L('units', 'units-volume', 'Volume Converter', 'Volume', { icon: 'beaker', hash: '#volume', desc: 'Litres, gallons, cups, fluid ounces.', syn: ['volume', 'liter', 'litre', 'gallon', 'cup', 'ml', 'fl oz'] }),
  L('units', 'units-weight', 'Weight Converter', 'Weight', { icon: 'weight', hash: '#weight', desc: 'Kilograms, pounds, ounces, stones.', syn: ['weight', 'mass', 'kg', 'pound', 'lb', 'lbs', 'ounce', 'gram', 'stone'] }),
  L('units', 'units-temperature', 'Temperature Converter', 'Temperature', { icon: 'thermometer', hash: '#temperature', desc: 'Celsius, Fahrenheit, Kelvin.', syn: ['temperature', 'celsius', 'fahrenheit', 'kelvin', 'degrees'] }),
  L('units', 'units-speed', 'Speed Converter', 'Speed', { icon: 'gauge', hash: '#speed', desc: 'km/h, mph, m/s, knots.', syn: ['speed', 'velocity', 'kmh', 'mph', 'knots'] }),
  L('units', 'units-time', 'Time Converter', 'Time', { icon: 'timer', hash: '#time', desc: 'Seconds, minutes, hours, days, years.', syn: ['time units', 'duration', 'seconds', 'hours', 'days'] }),
  L('units', 'units-pressure', 'Pressure Converter', 'Pressure', { icon: 'gauge', hash: '#pressure', desc: 'bar, psi, pascal, atmospheres.', syn: ['pressure', 'bar', 'psi', 'pascal', 'atm', 'tire pressure'] }),
  L('units', 'units-energy', 'Energy Converter', 'Energy', { icon: 'zap', hash: '#energy', desc: 'Joules, calories, kWh, BTU.', syn: ['energy', 'joule', 'calorie', 'kcal', 'kwh', 'btu'] }),
  L('units', 'units-power', 'Power Converter', 'Power', { icon: 'zap', hash: '#power', desc: 'Watts, kilowatts, horsepower.', syn: ['power', 'watt', 'kw', 'horsepower', 'hp', 'ps'] }),
  L('units', 'units-data', 'Data Size Converter', 'Data', { icon: 'hard-drive', hash: '#data', desc: 'Bytes, KB, MB, GB, bits.', syn: ['data size', 'storage', 'bytes', 'kb', 'mb', 'gb', 'tb', 'bits', 'mbit'] }),
  L('units', 'units-angle', 'Angle & Slope Converter', 'Angle & Slope', { icon: 'triangle-right', hash: '#angle', desc: 'Degrees, radians, percent slope.', syn: ['angle', 'slope', 'degrees', 'radians', 'gradient', 'percent grade'] }),
  L('units', 'units-frequency', 'Frequency Converter', 'Frequency', { icon: 'activity', hash: '#frequency', desc: 'Hz, kHz, MHz, rpm.', syn: ['frequency', 'hertz', 'hz', 'rpm'] }),
  L('units', 'units-fuel', 'Fuel Economy Converter', 'Fuel Economy', { icon: 'fuel', hash: '#fuel', desc: 'L/100 km, mpg (US and UK), km/L.', syn: ['fuel economy', 'fuel consumption', 'mpg', 'l/100km', 'mileage'] }),
  // conversion-pair landing pages (REVIEW-1, owner answer 3): people google "lbs to kg"
  U('units-weight', 'lbs-to-kg', 'lbs to kg', ['lb', 'kg'], ['lb to kg', 'pounds to kilograms', 'pound to kilogram', 'lbs in kg', 'pfund in kg', 'convert pounds'], { popular: 1 }),
  U('units-weight', 'kg-to-lbs', 'kg to lbs', ['kg', 'lb'], ['kg to lb', 'kilograms to pounds', 'kilogram to pound', 'kg in lbs', 'kg in pfund'], { popular: 1 }),
  U('units-weight', 'oz-to-grams', 'oz to grams', ['oz', 'g'], ['ounces to grams', 'oz to g', 'unzen in gramm'], {}),
  U('units-weight', 'grams-to-oz', 'grams to oz', ['g', 'oz'], ['grams to ounces', 'g to oz', 'gramm in unzen']),
  U('units-length', 'cm-to-inches', 'cm to inches', ['cm', 'in'], ['cm to in', 'centimeters to inches', 'centimetres to inches', 'cm in zoll'], { popular: 1 }),
  U('units-length', 'inches-to-cm', 'inches to cm', ['in', 'cm'], ['in to cm', 'inch to cm', 'inches to centimeters', 'zoll in cm']),
  U('units-length', 'feet-to-meters', 'feet to meters', ['ft', 'm'], ['ft to m', 'feet to metres', 'foot to meter', 'fuss in meter']),
  U('units-length', 'meters-to-feet', 'meters to feet', ['m', 'ft'], ['m to ft', 'metres to feet', 'meter to foot', 'meter in fuss']),
  U('units-length', 'km-to-miles', 'km to miles', ['km', 'mi'], ['km to mi', 'kilometers to miles', 'kilometres to miles', 'km in meilen']),
  U('units-length', 'miles-to-km', 'miles to km', ['mi', 'km'], ['mi to km', 'miles to kilometers', 'mile to km', 'meilen in km']),
  U('units-temperature', 'c-to-f', 'Celsius to Fahrenheit', ['°C', '°F'], ['c to f', '°c to °f', 'celsius in fahrenheit', 'degrees celsius to fahrenheit']),
  U('units-temperature', 'f-to-c', 'Fahrenheit to Celsius', ['°F', '°C'], ['f to c', '°f to °c', 'fahrenheit in celsius', 'degrees fahrenheit to celsius']),
  U('units-speed', 'mph-to-kmh', 'mph to km/h', ['mph', 'km/h'], ['mph to kmh', 'mph to kph', 'miles per hour to kilometers per hour', 'mph in kmh']),
  U('units-speed', 'kmh-to-mph', 'km/h to mph', ['km/h', 'mph'], ['kmh to mph', 'kph to mph', 'kilometers per hour to miles per hour', 'kmh in mph']),
  U('units-volume', 'ml-to-oz', 'ml to oz', ['ml', 'fl oz'], ['ml to fl oz', 'milliliters to ounces', 'ml to fluid ounces', 'ml in unzen']),
  U('units-volume', 'oz-to-ml', 'oz to ml', ['fl oz', 'ml'], ['fl oz to ml', 'ounces to milliliters', 'fluid ounces to ml']),
  U('units-volume', 'liters-to-gallons', 'liters to gallons', ['L', 'gal'], ['l to gal', 'litres to gallons', 'liter to gallon', 'liter in gallonen']),
  U('units-volume', 'gallons-to-liters', 'gallons to liters', ['gal', 'L'], ['gal to l', 'gallons to litres', 'gallon to liter', 'gallonen in liter']),
  U('units-area', 'sqft-to-sqm', 'sq ft to m²', ['ft²', 'm²'], ['sqft to sqm', 'square feet to square meters', 'sq ft to sq m', 'square feet to m2']),
  U('units-data', 'mb-to-gb', 'MB to GB', ['MB', 'GB'], ['megabytes to gigabytes', 'mb in gb']),
  U('units-fuel', 'l100km-to-mpg', 'L/100 km to mpg', ['L/100km', 'mpg'], ['l/100km to mpg', 'liters per 100 km to mpg', 'fuel consumption to mpg', 'verbrauch in mpg']),

  // ── Calculator (one page: Calc Paper = Calculate + Grapher) ────────────────
  L('calculator', 'calculator', 'Calculator', 'Calculator', { icon: 'calculator', desc: 'Calculate and graph on one paper, with variables.', syn: ['calc', 'calculate', 'math', 'scientific calculator', 'calc paper', 'percent'] }),
  P('calculator', 'grapher', 'Grapher', ['graph', 'plot', 'function plotter', 'graphing calculator']),
  P('calculator', 'percentage', 'Percentage calculator', ['percent', 'what percent', '% of']),

  // ── Text (one page per sub-tool) ────────────────────────────────────────────
  L('text', 'json-formatter', 'JSON Formatter', 'JSON Formatter', { icon: 'braces', hash: '#json', desc: 'Format, validate and minify JSON.', syn: ['json', 'json validator', 'beautify', 'prettify', 'minify json', 'json viewer', 'format json'], popular: 1 }),
  L('text', 'text-diff', 'Text Diff', 'Text Diff', { icon: 'git-compare', hash: '#diff', desc: 'See what changed between two texts.', syn: ['diff', 'compare text', 'difference', 'diff checker', 'compare'] }),
  L('text', 'regex-tester', 'Regex Tester', 'Regex Tester', { icon: 'regex', hash: '#regex', desc: 'Test regular expressions with live matches.', syn: ['regex', 'regular expression', 'regexp', 'pattern'] }),
  L('text', 'word-count', 'Word Count', 'Word Count', { icon: 'list-checks', hash: '#wordcount', desc: 'Words, characters, sentences, reading time.', syn: ['word counter', 'character count', 'letter count', 'count words'] }),
  L('text', 'case-converter', 'Case Converter', 'Case Converter', { icon: 'case-sensitive', hash: '#case', desc: 'UPPER, lower, Title, camelCase, snake_case.', syn: ['uppercase', 'lowercase', 'title case', 'camel case', 'snake case', 'slug'] }),
  L('text', 'text-cleanup', 'Text Cleanup', 'Text Cleanup', { icon: 'eraser', hash: '#cleanup', desc: 'Trim spaces, remove blank or duplicate lines, sort.', syn: ['remove duplicates', 'sort lines', 'trim', 'remove empty lines', 'clean text'] }),
  L('text', 'ascii-banner', 'ASCII Banner', 'ASCII Banner', { icon: 'text', hash: '#ascii-banner', desc: 'Big letters from text.', syn: ['figlet', 'banner', 'ascii art', 'text art'] }),
  L('text', 'image-to-ascii', 'Image to ASCII', 'Image to ASCII', { icon: 'image', hash: '#image-ascii', desc: 'Turn a picture into ASCII art.', syn: ['ascii art', 'photo to text', 'image ascii'] }),

  // ── Security (one page per sub-tool) ────────────────────────────────────────
  L('security', 'hash-generator', 'Hash Generator', 'Hash Generator', { icon: 'fingerprint', hash: '#hash', desc: 'SHA-256, SHA-1, MD5 and more for text and files.', syn: ['hash', 'checksum', 'sha256', 'sha-256', 'md5', 'sha1', 'sha512', 'verify download'] }),
  L('security', 'encode-decode', 'Encode / Decode', 'Encode / Decode', { icon: 'binary', hash: '#encode', desc: 'Base64, URL, hex and HTML entities.', syn: ['base64', 'b64', 'url encode', 'url decode', 'hex', 'html entities', 'decoder', 'encoder'] }),
  L('security', 'hmac-kdf', 'HMAC / KDF', 'HMAC / KDF', { icon: 'key-round', hash: '#kdf', desc: 'HMAC signatures and key derivation (PBKDF2).', syn: ['hmac', 'kdf', 'pbkdf2', 'signature', 'sign'] }),
  L('security', 'text-encryption', 'Text Encryption', 'Text Encryption', { icon: 'lock', hash: '#encrypt', desc: 'Encrypt and decrypt text with a password.', syn: ['encrypt', 'decrypt', 'aes', 'password protect', 'secret note'] }),
  L('security', 'password-generator', 'Password Generator', 'Password Generator', { icon: 'key', hash: '#password', desc: 'Strong passwords and passphrases.', syn: ['password', 'passphrase', 'random password', 'strong password'] }),
  L('security', 'uuid-generator', 'UUID Generator', 'UUID Generator', { icon: 'hash', hash: '#uuid', desc: 'UUID v4 and v7, in bulk.', syn: ['uuid', 'guid', 'uuid v4', 'uuid v7'] }),
  L('security', 'jwt-decoder', 'JWT Decoder', 'JWT Decoder', { icon: 'scan-text', hash: '#jwt', desc: 'Decode a JSON Web Token: header, claims, expiry.', syn: ['jwt', 'json web token', 'bearer', 'token'] }),
  P('hash-generator', 'sha256-checksum', 'SHA-256 checksum', ['sha256sum', 'hash file', 'file checksum']),
  P('encode-decode', 'base64-decode', 'Base64 decode', ['base64', 'b64', 'atob', 'base64 encode']),

  // ── Utilities (one page per sub-tool) ───────────────────────────────────────
  L('utilities', 'qr-generator', 'QR Code Generator', 'QR Code Generator', { icon: 'qr-code', hash: '#qr-generate', desc: 'QR codes for links, text, Wi-Fi and contacts.', syn: ['qr', 'qr code', 'qr maker', 'barcode'], popular: 1 }),
  L('utilities', 'qr-reader', 'QR Code Reader', 'QR Code Reader', { icon: 'scan-line', hash: '#qr-scan', desc: 'Read QR codes from the camera or an image.', syn: ['qr scanner', 'scan qr', 'read qr', 'qr decoder'] }),
  L('utilities', 'url-cleaner', 'URL Cleaner', 'URL Cleaner', { icon: 'link', hash: '#url-cleaner', desc: 'Remove tracking parameters from links.', syn: ['clean link', 'remove tracking', 'utm', 'fbclid', 'untrack'] }),
  L('utilities', 'timestamp', 'Timestamp', 'Timestamp', { icon: 'calendar-clock', hash: '#timestamp', desc: 'Unix timestamps and dates, both ways.', syn: ['epoch', 'unix time', 'unix timestamp', 'iso 8601', 'date', 'epoch converter'] }),
  L('utilities', 'color-picker', 'Color Picker', 'Color Picker', { icon: 'pipette', hash: '#color', desc: 'HEX, RGB, HSL, OKLCH, contrast and palettes.', syn: ['colour', 'color', 'hex', 'rgb', 'hsl', 'eyedropper', 'contrast', 'palette'] }),
  P('qr-generator', 'wifi-qr', 'Wi-Fi QR code', ['wifi', 'wlan', 'guest network']),
  P('color-picker', 'contrast-checker', 'Contrast checker', ['wcag', 'contrast ratio', 'accessibility']),

  // ── Canvas (one board app: Fernboard = Draw + Mind Map + Mermaid) ──────────
  L('canvas', 'fernboard', 'Fernboard', 'Fernboard', { icon: 'pen-tool', desc: 'Draw, mind-map and diagram on one board.', syn: ['canvas', 'whiteboard', 'board', 'sketch', 'excalidraw'] }),
  P('fernboard', 'draw', 'Draw', ['whiteboard', 'sketch', 'drawing']),
  P('fernboard', 'mind-map', 'Mind Map', ['mindmap', 'brainstorm', 'tree']),
  P('fernboard', 'mermaid', 'Mermaid', ['diagram', 'flowchart', 'uml', 'sequence diagram']),
];

/**
 * Round-1 ids → today's leaves. getLeaf() resolves these, so old links, stored Recent entries and pages that still
 * pass an old id keep working. Do not use them in new code.
 */
export const ALIASES = {
  'convert-sheets': 'convert-tables', 'convert-docs': 'convert-documents', 'word-to-pdf': 'docx-to-pdf',
  'image-edit': 'image-tools', 'image-markup': 'annotate-image', 'image-inspect': 'image-metadata', 'image-export': 'image-tools',
  'image-ocr': 'image-tools',
  'open-file': 'viewer-documents', 'word-viewer': 'docx-viewer', 'powerpoint-viewer': 'viewer-pptx', 'dxf-viewer': 'viewer-dxf',
  'ifc-viewer': 'viewer-ifc', 'stl-viewer': 'viewer-stl', 'svg-viewer': 'viewer-svg',
  units: 'units-length', 'kg-to-lb': 'kg-to-lbs', 'celsius-to-fahrenheit': 'c-to-f',
  textbench: 'text-cleanup', 'format-json': 'json-formatter', 'compare-text': 'text-diff', 'test-regex': 'regex-tester',
  'transform-text': 'case-converter', 'ascii-art': 'ascii-banner',
  inspect: 'encode-decode', checksum: 'hash-generator', sha256: 'sha256-checksum', generate: 'password-generator',
  'keys-hmac': 'hmac-kdf', time: 'timestamp', 'unix-timestamp': 'timestamp', seal: 'text-encryption',
  'clean-link': 'url-cleaner', 'qr-code': 'qr-generator', 'pick-color': 'color-picker', contrast: 'contrast-checker', palette: 'color-picker',
  diagram: 'mermaid',
};

// Settings and shell actions available in the command bar (handled by shell.js).
export const ACTIONS = [
  { id: 'theme-dark', name: 'Dark theme', kind: 'setting', icon: 'moon', syn: ['dark mode', 'night', 'theme'] },
  { id: 'theme-light', name: 'Light theme', kind: 'setting', icon: 'sun', syn: ['light mode', 'day', 'theme'] },
  { id: 'theme-system', name: 'Match system theme', kind: 'setting', icon: 'monitor', syn: ['auto theme', 'os theme'] },
  { id: 'shortcuts', name: 'Keyboard shortcuts', kind: 'action', icon: 'keyboard', syn: ['hotkeys', 'keys', 'help', '?'] },
  { id: 'go-home', name: 'Go to home', kind: 'action', icon: 'house', syn: ['start', 'all tools', 'homepage'] },
  { id: 'install', name: 'Install Fernwork', kind: 'setting', icon: 'download', syn: ['pwa', 'app', 'offline'] },
  { id: 'clear-recent', name: 'Clear recent tools', kind: 'setting', icon: 'trash-2', syn: ['history', 'forget'] },
];

// ── Derived helpers ───────────────────────────────────────────────────────────
const byId = new Map(LEAVES.map((l) => [l.id, l]));
for (const l of LEAVES) {               // tools first: category defaults
  if (l.kind !== 'tool') continue;
  const c = CATEGORIES.find((x) => x.id === l.cat);
  l.arch = l.arch || c.arch; l.area = c.area; l.icon = l.icon || c.icon;
  l.path = l.path || `/tools/${c.page.replace('.html', '')}${l.hash || ''}`;
}
for (const p of LEAVES) {               // presets inherit category/arch/icon/area from their parent tool
  if (p.kind !== 'preset') continue;
  const t = byId.get(p.parent);
  p.cat = t.cat; p.icon = p.icon || t.icon; p.arch = p.arch || t.arch; p.area = t.area;
  p.path = p.path || `/tools/${p.id}`;
  if (!p.desc) { p.desc = t.desc; p.descInherited = true; }
}

/**
 * Resolve a leaf id. Old round-1 ids (ALIASES) return a copy of today's leaf that keeps the OLD id and sets
 * `aliasOf` to the new one, so round-1 pages that key their own tables by id keep working. Use canonicalId() /
 * `l.aliasOf || l.id` when you need today's id.
 */
const aliasCache = new Map();
export const leaf = (id) => {
  if (byId.has(id)) return byId.get(id);
  const t = byId.get(ALIASES[id]); if (!t) return undefined;
  if (!aliasCache.has(id)) aliasCache.set(id, { ...t, id, aliasOf: t.id });
  return aliasCache.get(id);
};
/** Today's id for any id (alias or current); undefined if unknown. */
export const canonicalId = (id) => (byId.has(id) ? id : byId.has(ALIASES[id]) ? ALIASES[id] : undefined);
export const category = (id) => CATEGORIES.find((c) => c.id === id);
/** Sub-tools (kind 'tool') of a category, in today's nav order. */
export const toolsOf = (catId) => LEAVES.filter((l) => l.cat === catId && l.kind === 'tool');
export const presetsOf = (toolId) => LEAVES.filter((l) => l.parent === (leaf(toolId)?.id || toolId));
/** The sub-tool (chip) a leaf belongs to: itself for tools, its parent for presets. */
export const chipOf = (l) => (!l ? l : l.kind === 'preset' ? byId.get(l.parent) : l.aliasOf ? byId.get(l.aliasOf) : l);
/** Popular landings, used for the empty command bar and the 404 suggestions. */
export const POPULAR = ['heic-to-jpg', 'merge-pdf', 'compress-pdf', 'json-formatter', 'qr-generator', 'lbs-to-kg', 'mp4-to-mp3', 'remove-background'];
