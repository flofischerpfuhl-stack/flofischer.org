// Fernwork One · tool registry for the real site.
//
// Source of truth for the shell: rail, ToolSwitcher, ⌘K search, home map, sub-tool chips, Recent and the drop
// chooser all read this file. It mirrors today's information architecture (assets/nav.js TOOLS) plus the SEO
// landing pages that exist under tools/*.html. Every leaf has a real URL (page + #hash, or the SEO page).
//
// Category fields:  id · navId (assets/nav.js id) · label · icon · page (tools/<page>) · arch
// Leaf fields:
//   id       stable id                                   cat      category id
//   kind     'tool' (a sub-tool: rail leaf, chip) | 'preset' (an SEO landing page of a tool)
//   name     full name (H1, search)                      chip     today's sidebar label (rail leaf, chip, home map)
//   hash     today's #hash on the category page (tools only); `sub` = nav.js sub id
//   path     page path relative to the site root, e.g. 'tools/heic-to-jpg' (presets) or 'tools/text-tools#json'
//   tool     presets: the tool leaf id they preset (for chips/rail highlight)
//   open     presets whose page is only a landing card: where the working tool lives (file handoff target)
//   syn      search synonyms (lower case)                desc     one line (page header, search meta)
//   icon     icon name (assets/kit/icons.js)             popular  shown in the empty command bar

export const CATEGORIES = [
  { id: 'convert',     navId: 'converters',     label: 'Convert',     icon: 'shuffle',    page: 'converters',     arch: 'queue' },
  { id: 'pdf',         navId: 'pdf-tools',      label: 'PDF Tools',   icon: 'file-text',  page: 'pdf-tools',      arch: 'workbench' },
  { id: 'image-tools', navId: 'image-tools',    label: 'Image Tools', icon: 'image',      page: 'image-tools',    arch: 'workbench' },
  { id: 'viewers',     navId: 'viewers',        label: 'Viewers',     icon: 'eye',        page: 'viewers',        arch: 'workbench' },
  { id: 'units',       navId: 'unit-converter', label: 'Units',       icon: 'boxes',      page: 'unit-converter', arch: 'instant' },
  { id: 'calculator',  navId: 'calculator',     label: 'Calculator',  icon: 'calculator', page: 'calculator',     arch: 'instant' },
  { id: 'text',        navId: 'text-tools',     label: 'Text',        icon: 'type',       page: 'text-tools',     arch: 'instant' },
  { id: 'security',    navId: 'crypto',         label: 'Security',    icon: 'lock',       page: 'crypto',         arch: 'instant' },
  { id: 'utilities',   navId: 'utilities',      label: 'Utilities',   icon: 'wrench',     page: 'utilities',      arch: 'instant' },
  { id: 'canvas',      navId: 'canvas',         label: 'Canvas',      icon: 'pen-tool',   page: 'canvas',         arch: 'workbench' },
  { id: 'games',       navId: 'games',          label: 'Games',       icon: 'gamepad-2',  page: 'games',          arch: 'workbench' },
];

const T = (cat, id, name, chip, hash, o = {}) => ({ cat, id, name, chip, hash, kind: 'tool', syn: [], ...o });
const P = (tool, id, name, syn = [], o = {}) => ({ id, name, kind: 'preset', tool, syn, path: `tools/${id}`, ...o });

export const LEAVES = [
  // ── Convert ────────────────────────────────────────────────────────────────
  T('convert', 'convert-images', 'Image Converter', 'Images', '#image', { sub: 'image', icon: 'image', desc: 'JPG, PNG, WebP, AVIF, HEIC, TIFF and more.', syn: ['image converter', 'photo converter', 'picture', 'jpeg', 'jpg', 'png', 'webp', 'avif', 'heic', 'tiff', 'bmp', 'gif', 'ico', 'resize images', 'compress images'] }),
  T('convert', 'convert-video', 'Video Converter', 'Video', '#video', { sub: 'video', icon: 'film', desc: 'MP4, WebM, MOV, MKV and GIF.', syn: ['video converter', 'movie', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'gif', 'clip', 'trim video'] }),
  T('convert', 'convert-audio', 'Audio Converter', 'Audio', '#audio', { sub: 'audio', icon: 'music', desc: 'MP3, WAV, FLAC, OGG and M4A.', syn: ['audio converter', 'sound', 'music', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'podcast', 'trim audio'] }),
  T('convert', 'convert-data', 'Data Converter', 'Data', '#data', { sub: 'data', icon: 'braces', desc: 'JSON, YAML, XML, CSV and TOML.', syn: ['data converter', 'json', 'yaml', 'xml', 'csv', 'toml', 'json to yaml', 'yaml to json'] }),
  T('convert', 'convert-tables', 'Table Converter', 'Tables', '#table-convert', { sub: 'table-convert', icon: 'sheet', desc: 'XLSX, ODS, CSV and TSV.', syn: ['table converter', 'spreadsheet converter', 'excel', 'xlsx', 'xls', 'ods', 'spreadsheet', 'sheet'] }),
  T('convert', 'convert-documents', 'Document Converter', 'Documents', '#documents', { sub: 'documents', icon: 'file-text', desc: 'Word, ODT, RTF, Markdown and HTML to PDF and more.', syn: ['document converter', 'word', 'docx', 'doc', 'odt', 'rtf', 'markdown', 'md', 'html', 'to pdf'] }),
  P('convert-images', 'heic-to-jpg', 'HEIC to JPG', ['iphone photo', 'heif', 'apple photo', 'heic jpeg', 'heic converter'], { popular: 1 }),
  P('convert-images', 'jpeg-to-png', 'JPEG to PNG', ['jpg to png', 'jpg png']),
  P('convert-images', 'png-to-jpeg', 'PNG to JPEG', ['png to jpg', 'png jpg']),
  P('convert-images', 'webp-to-png', 'WebP to PNG', ['webp']),
  P('convert-images', 'png-to-webp', 'PNG to WebP', ['webp', 'smaller images']),
  P('convert-images', 'avif-to-png', 'AVIF to PNG', ['avif']),
  P('convert-images', 'tiff-to-png', 'TIFF to PNG', ['tif', 'tiff']),
  P('convert-images', 'image-converter', 'Image Converter (overview)', ['convert images', 'resize images'], { open: 'tools/converters#image', searchOnly: 1 }),
  P('convert-video', 'mov-to-mp4', 'MOV to MP4', ['quicktime', 'iphone video']),
  P('convert-video', 'mkv-to-mp4', 'MKV to MP4', ['matroska']),
  P('convert-video', 'webm-to-mp4', 'WebM to MP4', ['webm']),
  P('convert-video', 'mp4-to-gif', 'MP4 to GIF', ['gif maker', 'animated gif', 'video to gif']),
  P('convert-video', 'mp4-to-mp3', 'MP4 to MP3', ['extract audio', 'video to mp3'], { popular: 1 }),
  P('convert-video', 'video-converter', 'Video Converter (overview)', ['convert video'], { open: 'tools/converters#video', searchOnly: 1 }),
  P('convert-audio', 'wav-to-mp3', 'WAV to MP3', ['wav']),
  P('convert-audio', 'flac-to-mp3', 'FLAC to MP3', ['flac', 'lossless']),
  P('convert-audio', 'm4a-to-mp3', 'M4A to MP3', ['m4a', 'voice memo', 'aac']),
  P('convert-audio', 'mp3-to-wav', 'MP3 to WAV', ['wav']),
  P('convert-audio', 'mp3-to-ogg', 'MP3 to OGG', ['ogg', 'vorbis']),
  P('convert-audio', 'audio-converter', 'Audio Converter (overview)', ['convert audio'], { open: 'tools/converters#audio', searchOnly: 1 }),
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

  // ── PDF Tools (one workbench) ──────────────────────────────────────────────
  T('pdf', 'pdf-tools', 'PDF Tools', 'PDF Tools', '', { icon: 'file-text', desc: 'Edit, merge, split, compress, sign, OCR and redact PDFs.', syn: ['pdf', 'pdf editor', 'pdf tools', 'annotate pdf', 'fill form', 'pdf metadata', 'watermark', 'page numbers', 'bookmarks', 'rotate pdf', 'protect pdf', 'password pdf', 'compare pdf'] }),
  P('pdf-tools', 'edit-pdf', 'Edit PDF', ['pdf editor', 'change pdf text', 'fill form', 'annotate pdf'], { path: 'tools/pdf-edit', open: 'tools/pdf-tools#document' }),
  P('pdf-tools', 'merge-pdf', 'Merge PDF', ['combine pdf', 'join pdf', 'pdf merge'], { popular: 1, path: 'tools/pdf-merge', open: 'tools/pdf-tools#document' }),
  P('pdf-tools', 'split-pdf', 'Split PDF', ['extract pages', 'separate pdf'], { path: 'tools/pdf-split', open: 'tools/pdf-tools#document' }),
  P('pdf-tools', 'compress-pdf', 'Compress PDF', ['reduce pdf size', 'shrink pdf', 'smaller pdf', 'optimize pdf'], { popular: 1, path: 'tools/pdf-compress', open: 'tools/pdf-tools#optimize' }),
  P('pdf-tools', 'sign-pdf', 'Sign PDF', ['signature', 'e-sign', 'certificate'], { path: 'tools/pdf-sign', open: 'tools/pdf-tools#document' }),
  P('pdf-tools', 'ocr-pdf', 'OCR PDF', ['searchable pdf', 'text recognition', 'scan'], { path: 'tools/pdf-ocr', open: 'tools/pdf-tools#ocr' }),
  P('pdf-tools', 'redact-pdf', 'Redact PDF', ['censor', 'blackout', 'hide text'], { path: 'tools/pdf-redact', open: 'tools/pdf-tools#document' }),

  // ── Image Tools (one workbench) ────────────────────────────────────────────
  T('image-tools', 'image-tools', 'Image Tools', 'Image Tools', '', { icon: 'image', desc: 'Compress, resize, crop, annotate and export images.', syn: ['image editor', 'photo editor', 'edit image', 'edit photo', 'compress image', 'reduce image size', 'resize image', 'crop image', 'rotate image', 'remove background', 'background remover', 'annotate image', 'blur image', 'exif', 'image metadata', 'remove exif', 'ocr image', 'extract colors'], popular: 1 }),

  // ── Viewers (one tab per format) ───────────────────────────────────────────
  T('viewers', 'viewer-markdown', 'Markdown Viewer', 'Markdown', '#markdown', { sub: 'markdown', icon: 'file-code', desc: 'Read, edit and preview Markdown.', syn: ['md', 'markdown preview', 'readme', 'markdown editor'] }),
  T('viewers', 'viewer-svg', 'SVG Viewer', 'SVG', '#svg', { sub: 'svg', icon: 'shapes', desc: 'View and inspect SVG graphics.', syn: ['vector', 'svg preview'] }),
  T('viewers', 'viewer-table', 'Table Viewer', 'Tables / Sheets', '#table', { sub: 'table', icon: 'sheet', desc: 'Open and edit CSV, Excel and ODS tables.', syn: ['csv viewer', 'excel viewer', 'xlsx', 'xls', 'ods', 'tsv', 'spreadsheet', 'spreadsheet editor'] }),
  T('viewers', 'viewer-documents', 'Document Viewer', 'Documents', '#docx', { sub: 'docx', icon: 'file-text', desc: 'Open and edit Word, ODT and RTF documents.', syn: ['word viewer', 'docx viewer', 'doc', 'odt', 'rtf', 'open word', 'word editor'] }),
  T('viewers', 'viewer-pptx', 'PowerPoint Viewer', 'PowerPoint (PPTX)', '#pptx', { sub: 'pptx', icon: 'presentation', desc: 'Open PowerPoint slides.', syn: ['pptx', 'ppt', 'slides', 'presentation', 'odp'] }),
  T('viewers', 'viewer-dxf', 'DXF Viewer', 'DXF Drawing', '#dxf', { sub: 'dxf', icon: 'compass', desc: 'Open DXF drawings: layers, measure, export.', syn: ['cad', 'autocad', 'dwg', 'drawing', 'dxf'] }),
  T('viewers', 'viewer-pointcloud', 'Point Cloud Viewer', 'Point Cloud', '#pointcloud', { sub: 'pointcloud', icon: 'scan', desc: 'Open LAS, LAZ, E57, PLY, XYZ and other point clouds.', syn: ['las', 'laz', 'xyz', 'ply', 'e57', 'pcd', 'pts', 'lidar', 'scan', 'point cloud'] }),
  T('viewers', 'viewer-shapefile', 'Shapefile Viewer', 'Shapefile', '#shape', { sub: 'shape', icon: 'globe', desc: 'Open Shapefiles and GeoJSON on a map.', syn: ['shp', 'gis', 'geojson', 'map', 'kml', 'gpx'] }),
  T('viewers', 'viewer-ifc', 'IFC Viewer', 'IFC Model', '#ifc', { sub: 'ifc', icon: 'box', desc: 'Open IFC building models.', syn: ['bim', 'building model', 'ifc'] }),
  T('viewers', 'viewer-stl', 'STL / OBJ Viewer', 'STL / OBJ', '#stl', { sub: 'stl', icon: 'box', desc: 'Open STL and OBJ 3D models.', syn: ['3d', '3d print', 'stl', 'obj', 'mesh'] }),
  T('viewers', 'viewer-database', 'Database Viewer', 'Database', '#database', { sub: 'database', icon: 'database', desc: 'Browse SQLite, Parquet and Arrow data.', syn: ['sqlite', 'db', 'sql', 'parquet', 'arrow', 'feather', 'duckdb'] }),
  P('viewer-table', 'csv-viewer', 'CSV Viewer', ['table viewer', 'tsv'], { open: 'tools/viewers#table' }),
  P('viewer-table', 'xlsx-viewer', 'XLSX Viewer', ['excel viewer', 'xls viewer'], { open: 'tools/viewers#table' }),
  P('viewer-table', 'ods-viewer', 'ODS Viewer', ['opendocument spreadsheet', 'libreoffice calc'], { open: 'tools/viewers#table' }),
  P('viewer-documents', 'docx-viewer', 'DOCX Viewer', ['word viewer'], { open: 'tools/viewers#docx' }),
  P('viewer-documents', 'odt-viewer', 'ODT Viewer', ['opendocument text', 'libreoffice writer'], { open: 'tools/viewers#docx' }),
  P('viewer-documents', 'rtf-viewer', 'RTF Viewer', ['rich text'], { open: 'tools/viewers#docx' }),
  P('viewer-pptx', 'pptx-viewer', 'PPTX Viewer', ['powerpoint viewer'], { open: 'tools/viewers#pptx' }),
  P('viewer-dxf', 'dxf-viewer', 'DXF Viewer (overview)', ['autocad viewer'], { open: 'tools/viewers#dxf', searchOnly: 1 }),
  P('viewer-ifc', 'ifc-viewer', 'IFC Viewer (overview)', ['bim viewer'], { open: 'tools/viewers#ifc', searchOnly: 1 }),
  P('viewer-stl', 'stl-viewer', 'STL Viewer', ['3d model viewer', 'mesh viewer'], { open: 'tools/viewers#stl' }),
  P('viewer-svg', 'svg-viewer', 'SVG Viewer (overview)', ['svg inspect'], { open: 'tools/viewers#svg', searchOnly: 1 }),
  P('viewer-database', 'sqlite-viewer', 'SQLite Viewer', ['database', 'db'], { open: 'tools/viewers#database' }),
  P('viewer-database', 'parquet-viewer', 'Parquet Viewer', ['data lake'], { open: 'tools/viewers#database' }),
  P('viewer-database', 'arrow-viewer', 'Arrow Viewer', ['apache arrow', 'feather'], { open: 'tools/viewers#database' }),

  // ── Units (one tab per category, plus conversion-pair pages) ───────────────
  T('units', 'units-length', 'Length Converter', 'Length', '#length', { sub: 'length', icon: 'ruler', desc: 'Metres, feet, inches, miles and more.', syn: ['length', 'distance', 'meter', 'metre', 'feet', 'foot', 'inch', 'inches', 'mile', 'miles', 'cm', 'km', 'unit converter', 'cm to inches', 'inches to cm', 'feet to meters', 'meters to feet', 'km to miles', 'miles to km', 'cm in zoll'] }),
  T('units', 'units-area', 'Area Converter', 'Area', '#area', { sub: 'area', icon: 'square', desc: 'Square metres, square feet, acres, hectares.', syn: ['area', 'square meter', 'sqm', 'sq ft', 'acre', 'hectare', 'sqft to sqm', 'square feet to square meters'] }),
  T('units', 'units-volume', 'Volume Converter', 'Volume', '#volume', { sub: 'volume', icon: 'beaker', desc: 'Litres, gallons, cups, fluid ounces.', syn: ['volume', 'liter', 'litre', 'gallon', 'cup', 'ml', 'fl oz', 'ml to oz', 'oz to ml', 'liters to gallons', 'gallons to liters'] }),
  T('units', 'units-weight', 'Weight Converter', 'Weight', '#weight', { sub: 'weight', icon: 'weight', desc: 'Kilograms, pounds, ounces, stones.', syn: ['weight', 'mass', 'kg', 'pound', 'pounds', 'lb', 'lbs', 'ounce', 'gram', 'stone', 'lbs to kg', 'kg to lbs', 'oz to grams', 'grams to oz', 'pfund in kg'], popular: 1 }),
  T('units', 'units-temperature', 'Temperature Converter', 'Temperature', '#temperature', { sub: 'temperature', icon: 'thermometer', desc: 'Celsius, Fahrenheit, Kelvin.', syn: ['temperature', 'celsius', 'fahrenheit', 'kelvin', 'degrees', 'c to f', 'f to c'] }),
  T('units', 'units-speed', 'Speed Converter', 'Speed', '#speed', { sub: 'speed', icon: 'gauge', desc: 'km/h, mph, m/s, knots.', syn: ['speed', 'velocity', 'kmh', 'mph', 'knots', 'mph to kmh', 'kmh to mph'] }),
  T('units', 'units-time', 'Time Converter', 'Time', '#time', { sub: 'time', icon: 'timer', desc: 'Seconds, minutes, hours, days, years.', syn: ['time units', 'duration', 'seconds', 'hours', 'days'] }),
  T('units', 'units-pressure', 'Pressure Converter', 'Pressure', '#pressure', { sub: 'pressure', icon: 'gauge', desc: 'bar, psi, pascal, atmospheres.', syn: ['pressure', 'bar', 'psi', 'pascal', 'atm', 'tire pressure'] }),
  T('units', 'units-energy', 'Energy Converter', 'Energy', '#energy', { sub: 'energy', icon: 'zap', desc: 'Joules, calories, kWh, BTU.', syn: ['energy', 'joule', 'calorie', 'kcal', 'kwh', 'btu'] }),
  T('units', 'units-power', 'Power Converter', 'Power', '#power', { sub: 'power', icon: 'zap', desc: 'Watts, kilowatts, horsepower.', syn: ['power', 'watt', 'kw', 'horsepower', 'hp', 'ps'] }),
  T('units', 'units-data', 'Data Size Converter', 'Data', '#data', { sub: 'data', icon: 'hard-drive', desc: 'Bytes, KB, MB, GB, bits.', syn: ['data size', 'storage', 'bytes', 'kb', 'mb', 'gb', 'tb', 'bits', 'mbit', 'mb to gb'] }),
  T('units', 'units-angle', 'Angle & Slope Converter', 'Angle & Slope', '#angle', { sub: 'angle', icon: 'triangle-right', desc: 'Degrees, radians, percent slope.', syn: ['angle', 'slope', 'degrees', 'radians', 'gradient', 'percent grade', 'dms'] }),
  T('units', 'units-frequency', 'Frequency Converter', 'Frequency', '#frequency', { sub: 'frequency', icon: 'activity', desc: 'Hz, kHz, MHz, rpm.', syn: ['frequency', 'hertz', 'hz', 'rpm'] }),
  T('units', 'units-fuel', 'Fuel Economy Converter', 'Fuel Economy', '#fuel', { sub: 'fuel', icon: 'fuel', desc: 'L/100 km, mpg (US and UK), km/L.', syn: ['fuel economy', 'fuel consumption', 'mpg', 'l/100km', 'mileage', 'l100km to mpg'] }),
  // Units conversion-pair pages (tools/<slug>.html, generated from tools/js/unit-pairs.js)
  P('units-length', 'cm-to-inches', 'cm to inches', ['centimeters to inches', 'cm in inch', 'cm to in', 'cm in zoll'], { desc: 'Centimeters to inches.' }),
  P('units-length', 'inches-to-cm', 'inches to cm', ['inch to cm', 'in to cm', 'inches to centimeters', 'zoll in cm'], { desc: 'Inches to centimeters.' }),
  P('units-length', 'feet-to-meters', 'feet to meters', ['ft to m', 'foot to meter', 'feet to metres', 'fuss in meter'], { desc: 'Feet to meters.' }),
  P('units-length', 'meters-to-feet', 'meters to feet', ['m to ft', 'meter to feet', 'metres to feet'], { desc: 'Meters to feet.' }),
  P('units-length', 'km-to-miles', 'km to miles', ['kilometers to miles', 'km to mi', 'kilometres to miles'], { desc: 'Kilometers to miles.' }),
  P('units-length', 'miles-to-km', 'miles to km', ['mi to km', 'miles to kilometers', 'meilen in km'], { desc: 'Miles to kilometers.' }),
  P('units-area', 'sqft-to-sqm', 'sq ft to m²', ['sqft to sqm', 'square feet to square meters', 'ft2 to m2', 'sq ft to sq m'], { desc: 'Square feet to square meters.' }),
  P('units-area', 'sqm-to-sqft', 'm² to sq ft', ['sqm to sqft', 'square meters to square feet', 'm2 to ft2', 'sq m to sq ft'], { desc: 'Square meters to square feet.' }),
  P('units-volume', 'ml-to-oz', 'ml to oz', ['ml to fl oz', 'milliliters to ounces', 'ml to fluid ounces'], { desc: 'Milliliters to fluid ounces (US).' }),
  P('units-volume', 'oz-to-ml', 'oz to ml', ['fl oz to ml', 'ounces to ml', 'fluid ounces to milliliters'], { desc: 'Fluid ounces (US) to milliliters.' }),
  P('units-volume', 'liters-to-gallons', 'liters to gallons', ['l to gal', 'litres to gallons', 'liters to us gallons'], { desc: 'Liters to gallons (US).' }),
  P('units-volume', 'gallons-to-liters', 'gallons to liters', ['gal to l', 'gallons to litres', 'us gallons to liters'], { desc: 'Gallons (US) to liters.' }),
  P('units-weight', 'lbs-to-kg', 'lbs to kg', ['pounds to kilograms', 'lb to kg', 'pounds to kg', 'pfund in kg'], { desc: 'Pounds to kilograms.' }),
  P('units-weight', 'kg-to-lbs', 'kg to lbs', ['kilograms to pounds', 'kg to lb', 'kg to pounds', 'kg in pfund'], { desc: 'Kilograms to pounds.' }),
  P('units-weight', 'oz-to-grams', 'oz to grams', ['ounces to grams', 'oz to g', 'unze in gramm'], { desc: 'Ounces to grams.' }),
  P('units-weight', 'grams-to-oz', 'grams to oz', ['grams to ounces', 'g to oz', 'gramm in unze'], { desc: 'Grams to ounces.' }),
  P('units-temperature', 'c-to-f', '°C to °F', ['celsius to fahrenheit', 'c to f', 'centigrade to fahrenheit', 'celsius in fahrenheit'], { desc: 'Celsius to fahrenheit.' }),
  P('units-temperature', 'f-to-c', '°F to °C', ['fahrenheit to celsius', 'f to c', 'fahrenheit in celsius'], { desc: 'Fahrenheit to celsius.' }),
  P('units-speed', 'mph-to-kmh', 'mph to km/h', ['mph to kmh', 'mph to kph', 'miles per hour to km/h'], { desc: 'Miles per hour to kilometers per hour.' }),
  P('units-speed', 'kmh-to-mph', 'km/h to mph', ['kmh to mph', 'kph to mph', 'km/h to miles per hour'], { desc: 'Kilometers per hour to miles per hour.' }),
  P('units-data', 'mb-to-gb', 'MB to GB', ['megabytes to gigabytes', 'mb in gb'], { desc: 'Megabytes to gigabytes.' }),
  P('units-data', 'gb-to-mb', 'GB to MB', ['gigabytes to megabytes', 'gb in mb'], { desc: 'Gigabytes to megabytes.' }),
  P('units-fuel', 'l100km-to-mpg', 'L/100 km to mpg', ['l100km to mpg', 'l/100km to mpg', 'liters per 100 km to mpg'], { desc: 'Liters per 100 km to miles per gallon (US).' }),
  P('units-fuel', 'mpg-to-l100km', 'mpg to L/100 km', ['mpg to l100km', 'mpg to l/100km', 'mpg to liters per 100 km'], { desc: 'Miles per gallon (US) to liters per 100 km.' }),

  // ── Calculator ─────────────────────────────────────────────────────────────
  T('calculator', 'calculator', 'Calculator', 'Calculate', '#calculate', { sub: 'calculate', icon: 'calculator', desc: 'Scientific expressions, variables and units.', syn: ['calc', 'calculate', 'math', 'scientific calculator', 'percent', 'percentage'] }),
  T('calculator', 'grapher', 'Grapher', 'Grapher', '#graph', { sub: 'graph', icon: 'chart-line', desc: 'Plot functions and compare graphs.', syn: ['graph', 'plot', 'function plotter', 'graphing calculator'] }),

  // ── Text ───────────────────────────────────────────────────────────────────
  T('text', 'json-formatter', 'JSON Formatter', 'JSON Formatter', '#json', { sub: 'json', icon: 'braces', desc: 'Format, validate and minify JSON.', syn: ['json', 'json validator', 'beautify', 'prettify', 'minify json', 'json viewer', 'format json'], popular: 1 }),
  T('text', 'text-diff', 'Text Diff', 'Text Diff', '#diff', { sub: 'diff', icon: 'git-compare', desc: 'See what changed between two texts.', syn: ['diff', 'compare text', 'difference', 'diff checker', 'compare'] }),
  T('text', 'regex-tester', 'Regex Tester', 'Regex Tester', '#regex', { sub: 'regex', icon: 'regex', desc: 'Test regular expressions with live matches.', syn: ['regex', 'regular expression', 'regexp', 'pattern'] }),
  T('text', 'word-count', 'Word Count', 'Word Count', '#wordcount', { sub: 'wordcount', icon: 'list-checks', desc: 'Words, characters, sentences, reading time.', syn: ['word counter', 'character count', 'letter count', 'count words'] }),
  T('text', 'case-converter', 'Case Converter', 'Case Converter', '#case', { sub: 'case', icon: 'case-sensitive', desc: 'UPPER, lower, Title, camelCase, snake_case.', syn: ['uppercase', 'lowercase', 'title case', 'camel case', 'snake case', 'kebab case', 'slug'] }),
  T('text', 'text-cleanup', 'Text Cleanup', 'Text Cleanup', '#cleanup', { sub: 'cleanup', icon: 'eraser', desc: 'Trim spaces, remove blank or duplicate lines, sort.', syn: ['remove duplicates', 'sort lines', 'trim', 'remove empty lines', 'clean text'] }),
  T('text', 'ascii-banner', 'ASCII Banner', 'ASCII Banner', '#ascii-banner', { sub: 'ascii-banner', icon: 'text', desc: 'Big letters from text.', syn: ['figlet', 'banner', 'ascii art', 'text art'] }),
  T('text', 'image-to-ascii', 'Image to ASCII', 'Image to ASCII', '#image-ascii', { sub: 'image-ascii', icon: 'image', desc: 'Turn a picture into ASCII art.', syn: ['ascii art', 'photo to text', 'image ascii'] }),

  // ── Security ───────────────────────────────────────────────────────────────
  T('security', 'hash-generator', 'Hash Generator', 'Hash Generator', '#hash', { sub: 'hash', icon: 'fingerprint', desc: 'SHA-256, SHA-1, MD5 and more for text and files.', syn: ['hash', 'checksum', 'sha256', 'sha-256', 'md5', 'sha1', 'sha512', 'verify download', 'file hash'] }),
  T('security', 'encode-decode', 'Encode / Decode', 'Encode / Decode', '#encode', { sub: 'encode', icon: 'binary', desc: 'Base64, URL, hex and HTML entities.', syn: ['base64', 'b64', 'url encode', 'url decode', 'hex', 'html entities', 'decoder', 'encoder', 'base64 decode'] }),
  T('security', 'hmac-kdf', 'HMAC / KDF', 'HMAC / KDF', '#kdf', { sub: 'kdf', icon: 'key-round', desc: 'HMAC signatures and key derivation.', syn: ['hmac', 'kdf', 'pbkdf2', 'hkdf', 'signature'] }),
  T('security', 'text-encryption', 'Text Encryption', 'Text Encryption', '#encrypt', { sub: 'encrypt', icon: 'lock', desc: 'Encrypt and decrypt text with a password.', syn: ['encrypt', 'decrypt', 'aes', 'password protect', 'secret note'] }),
  T('security', 'password-generator', 'Password Generator', 'Password Generator', '#password', { sub: 'password', icon: 'key', desc: 'Strong passwords and passphrases.', syn: ['password', 'passphrase', 'random password', 'strong password'] }),
  T('security', 'uuid-generator', 'UUID Generator', 'UUID Generator', '#uuid', { sub: 'uuid', icon: 'hash', desc: 'UUIDs in bulk.', syn: ['uuid', 'guid', 'uuid v4', 'uuid v7'] }),
  T('security', 'jwt-decoder', 'JWT Decoder', 'JWT Decoder', '#jwt', { sub: 'jwt', icon: 'scan-text', desc: 'Decode a JSON Web Token: header, claims, expiry.', syn: ['jwt', 'json web token', 'bearer', 'token'] }),

  // ── Utilities ──────────────────────────────────────────────────────────────
  T('utilities', 'qr-generator', 'QR Code Generator', 'QR Code Generator', '#qr-generate', { sub: 'qr-generate', icon: 'qr-code', desc: 'QR codes for links, text, Wi-Fi and contacts.', syn: ['qr', 'qr code', 'qr maker', 'barcode', 'wifi qr', 'wi-fi qr code', 'vcard qr'], popular: 1 }),
  T('utilities', 'qr-reader', 'QR Code Reader', 'QR Code Reader', '#qr-scan', { sub: 'qr-scan', icon: 'scan-line', desc: 'Read QR codes from the camera or an image.', syn: ['qr scanner', 'scan qr', 'read qr', 'qr decoder'] }),
  T('utilities', 'url-cleaner', 'URL Cleaner', 'URL Cleaner', '#url-cleaner', { sub: 'url-cleaner', icon: 'link', desc: 'Remove tracking parameters from links.', syn: ['clean link', 'remove tracking', 'utm', 'fbclid', 'untrack', 'url shortener'] }),
  T('utilities', 'timestamp', 'Timestamp', 'Timestamp', '#timestamp', { sub: 'timestamp', icon: 'calendar-clock', desc: 'Unix timestamps and dates, both ways.', syn: ['epoch', 'unix time', 'unix timestamp', 'iso 8601', 'date', 'epoch converter'] }),
  T('utilities', 'color-picker', 'Color Picker', 'Color Picker', '#color', { sub: 'color', icon: 'pipette', desc: 'HEX, RGB, HSL, contrast and palettes.', syn: ['colour', 'color', 'hex', 'rgb', 'hsl', 'eyedropper', 'contrast', 'contrast checker', 'palette'] }),

  // ── Canvas ─────────────────────────────────────────────────────────────────
  T('canvas', 'draw', 'Draw', 'Draw', '#draw', { sub: 'draw', icon: 'pen-tool', desc: 'Whiteboard and sketches.', syn: ['canvas', 'whiteboard', 'board', 'sketch', 'excalidraw', 'drawing'] }),
  T('canvas', 'mind-map', 'Mind Map', 'Mind Map', '#mindmap', { sub: 'mindmap', icon: 'network', desc: 'Mind maps from an outline.', syn: ['mindmap', 'brainstorm', 'tree', 'markmap'] }),
  T('canvas', 'mermaid', 'Mermaid', 'Mermaid', '#mermaid', { sub: 'mermaid', icon: 'workflow', desc: 'Diagrams from text.', syn: ['diagram', 'flowchart', 'uml', 'sequence diagram', 'gantt'] }),

  // ── Games ──────────────────────────────────────────────────────────────────
  T('games', 'fern-rangers', 'Fern Rangers', 'Fern Rangers', '#fern-rangers', { sub: 'fern-rangers', icon: 'crosshair', desc: 'Steer your squad through number gates and outgun the horde.', syn: ['game', 'games', 'play', 'shooter', 'arcade', 'zombie', 'gates', 'squad', 'runner'] }),
  T('games', 'pips-tower', 'Pip’s Tower', 'Pip’s Tower', '#pips-tower', { sub: 'pips-tower', icon: 'pin', desc: 'Pull the pins in the right order to save the hero.', syn: ['game', 'games', 'play', 'puzzle', 'pull the pin', 'pin', 'rescue', 'pips tower', 'tower'] }),
  T('games', 'momo', 'Momo’s Last Stand', 'Momo’s Last Stand', '#momo', { sub: 'momo', icon: 'wrench', desc: 'Hold the arena against the alien horde and pick an upgrade card each level-up.', syn: ['game', 'games', 'play', 'arena', 'survivor', 'horde', 'roguelite', 'upgrade', 'cards', 'momo', 'red panda'] }),
  T('games', 'tanks', 'Bounce Brigade', 'Bounce Brigade', '#tanks', { sub: 'tanks', icon: 'crosshair', desc: 'Toy tank duels: bank your shells off the walls, lay mines and beat the Klonkbot tank corps.', syn: ['game', 'games', 'play', 'tank', 'tanks', 'ricochet', 'bounce', 'mines', 'arena', 'hedgehog', 'hazel'] }),
];

/** Older (mockup round) ids → today's leaves, so stored Recent entries and links keep resolving. */
export const ALIASES = {
  'convert-sheets': 'convert-tables', 'convert-docs': 'convert-documents', 'word-to-pdf': 'docx-to-pdf',
  'png-to-jpg': 'png-to-jpeg', 'jpg-to-png': 'jpeg-to-png', 'excel-viewer': 'xlsx-viewer',
  'image-edit': 'image-tools', 'image-markup': 'image-tools', 'image-inspect': 'image-tools', 'image-export': 'image-tools',
  'compress-image': 'image-tools', 'resize-image': 'image-tools', 'crop-image': 'image-tools', 'remove-background': 'image-tools',
  'annotate-image': 'image-tools', 'blur-image': 'image-tools', 'image-metadata': 'image-tools',
  'open-file': 'viewer-documents', 'word-viewer': 'docx-viewer', 'powerpoint-viewer': 'viewer-pptx',
  units: 'units-length',
  textbench: 'text-cleanup', 'format-json': 'json-formatter', 'compare-text': 'text-diff', 'test-regex': 'regex-tester',
  'transform-text': 'case-converter', 'ascii-art': 'ascii-banner',
  inspect: 'encode-decode', checksum: 'hash-generator', 'sha256-checksum': 'hash-generator', 'base64-decode': 'encode-decode',
  generate: 'password-generator', 'keys-hmac': 'hmac-kdf', time: 'timestamp', 'unix-timestamp': 'timestamp', seal: 'text-encryption',
  'clean-link': 'url-cleaner', 'qr-code': 'qr-generator', 'wifi-qr': 'qr-generator', 'pick-color': 'color-picker', contrast: 'color-picker',
  'contrast-checker': 'color-picker', palette: 'color-picker',
  fernboard: 'draw', diagram: 'mermaid', percentage: 'calculator',
};

/** Shell actions/settings offered in the command bar (handled by shell.js runAction). */
export const ACTIONS = [
  { id: 'theme-dark', name: 'Dark theme', kind: 'setting', icon: 'moon', syn: ['dark mode', 'night', 'theme'] },
  { id: 'theme-light', name: 'Light theme', kind: 'setting', icon: 'sun', syn: ['light mode', 'day', 'theme'] },
  { id: 'theme-system', name: 'Match system theme', kind: 'setting', icon: 'monitor', syn: ['auto theme', 'os theme', 'system default'] },
  { id: 'shortcuts', name: 'Keyboard shortcuts', kind: 'action', icon: 'keyboard', syn: ['hotkeys', 'keys', 'help'] },
  { id: 'go-home', name: 'Go to home', kind: 'action', icon: 'house', syn: ['start', 'all tools', 'homepage'] },
  { id: 'clear-recent', name: 'Clear recent tools', kind: 'setting', icon: 'trash-2', syn: ['history', 'forget'] },
];

// ── Derived data ──────────────────────────────────────────────────────────────
const byId = new Map(LEAVES.map((l) => [l.id, l]));
for (const l of LEAVES) {
  if (l.kind !== 'tool') continue;
  const c = CATEGORIES.find((x) => x.id === l.cat);
  l.arch = c.arch; l.icon = l.icon || c.icon;
  l.path = `tools/${c.page}${l.hash || ''}`;
}
for (const p of LEAVES) {
  if (p.kind !== 'preset') continue;
  const t = byId.get(p.tool);
  p.cat = t.cat; p.icon = p.icon || t.icon; p.arch = t.arch;
  if (!p.desc) { p.desc = t.desc; p.descInherited = true; }
}

/** Resolve a leaf id (aliases return today's leaf). */
export const leaf = (id) => byId.get(id) || byId.get(ALIASES[id]);
export const canonicalId = (id) => (byId.has(id) ? id : byId.has(ALIASES[id]) ? ALIASES[id] : undefined);
export const category = (id) => CATEGORIES.find((c) => c.id === id || c.navId === id);
/** Sub-tools of a category in today's nav order. */
export const toolsOf = (catId) => LEAVES.filter((l) => l.cat === catId && l.kind === 'tool');
/** SEO presets of a tool (excluding search-only overview pages unless asked). */
export const presetsOf = (toolId, { all = false } = {}) => LEAVES.filter((l) => l.tool === toolId && (all || !l.searchOnly));
/** The sub-tool a leaf belongs to: itself for tools, its tool for presets. */
export const chipOf = (l) => (!l ? l : l.kind === 'preset' ? byId.get(l.tool) : l);
export const POPULAR = ['heic-to-jpg', 'merge-pdf', 'compress-pdf', 'json-formatter', 'qr-generator', 'mp4-to-mp3', 'image-tools', 'units-weight'];

/**
 * Leaf for a page path ('tools/text-tools', 'tools/heic-to-jpg', …) and hash ('#json'). An unknown or empty hash
 * resolves to the page's first tool; pass { strict: true } to get null instead (hash changes that are not tabs).
 */
export function leafForLocation(pathname, hash = '', { strict = false } = {}) {
  const last = (pathname.split('/').pop() || '').replace(/\.html$/, '');
  if (!last || last === 'index') return null;
  const preset = LEAVES.find((l) => l.kind === 'preset' && l.path === `tools/${last}`);
  if (preset) return preset;
  const cat = CATEGORIES.find((c) => c.page === last);
  if (!cat) return null;
  const h = String(hash || '').replace(/^#/, '');
  const tools = toolsOf(cat.id);
  const hit = tools.find((t) => t.hash && t.hash.slice(1) === h) || tools.find((t) => t.sub === h);
  if (hit) return hit;
  return strict && h ? null : tools[0];
}
