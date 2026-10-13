// Viewers · page config per viewer leaf (registry ids). Each page is one format plugin in the shared viewer frame.
import MD from './md.js';
import SVG from './svg.js';
import TABLE from './table.js';
import DOCS from './docs.js';
import SLIDES from './slides.js';
import DXF from './dxf.js';
import POINTS from './points.js';
import SHAPE from './shape.js';
import IFC from './ifc.js';
import MESH from './mesh.js';
import DB from './db.js';

const md = (name, body) => new File([body], name, { type: 'text/markdown' });

export const VIEWERS = {
  'viewer-markdown': {
    fmt: MD, icon: 'file-code', kindLabel: 'Markdown file', kindShort: 'Markdown file',
    exts: ['md', 'markdown', 'mdx', 'txt'], acceptExtra: ',image/*', kinds: ['doc', 'text', 'image'], multiple: true,
    dropTitle: 'Drop a Markdown file', tapTitle: 'Open a Markdown file', reads: 'Reads .md, .markdown, .mdx and .txt · add the images it links to',
    lede: 'Read, edit and preview Markdown with tables, code and task lists.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['projektbericht.md'] },
    newDoc: { label: 'New blank', make: () => md('Untitled.md', '# Untitled\n\n'), after: (d, ctx) => ctx.setMode(d, ctx.isMobile() ? 'source' : 'split') },
  },
  'viewer-svg': {
    fmt: SVG, icon: 'shapes', kindLabel: 'SVG graphic', kindShort: 'SVG',
    exts: ['svg'], kinds: ['image'],
    dropTitle: 'Drop an SVG file', tapTitle: 'Open an SVG file', reads: 'Reads .svg · view, edit the source, export PNG',
    lede: 'View, inspect and edit SVG graphics. Export as SVG or PNG.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['baustelle.svg'] },
  },
  'viewer-table': {
    fmt: TABLE, icon: 'sheet', kindLabel: 'Table', kindShort: 'table',
    exts: ['csv', 'tsv', 'xlsx', 'xls', 'ods', 'json', 'ndjson', 'jsonl', 'parquet', 'arrow'], kinds: ['sheet', 'data', 'text'],
    dropTitle: 'Drop a spreadsheet or CSV', tapTitle: 'Open a spreadsheet or CSV', reads: 'Reads Excel (.xlsx), ODS, CSV/TSV, JSON, Parquet and Arrow',
    lede: 'Open Excel, ODS, CSV, JSON and Parquet tables. Sort, filter, edit and export.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['umsatz-2026.xlsx'] },
    samples: { 'csv-viewer': { label: 'Open sample CSV', icon: 'sparkles', files: ['messpunkte.csv'] }, 'parquet-viewer': { label: 'Open sample Parquet', icon: 'sparkles', files: ['messwerte.parquet'] } },
    newDoc: { label: 'New blank', make: () => new File(['A;B;C\n'], 'Untitled.csv', { type: 'text/csv' }), after: (d, ctx) => ctx.setMode(d, 'edit') },
  },
  'viewer-documents': {
    fmt: DOCS, icon: 'file-text', kindLabel: 'Document', kindShort: 'document',
    exts: ['docx', 'odt', 'rtf', 'epub', 'html', 'htm', 'md', 'txt'], kinds: ['doc', 'text'],
    dropTitle: 'Drop a document', tapTitle: 'Open a document', reads: 'Reads Word (.docx), ODT, RTF, EPUB, HTML, Markdown and text',
    lede: 'Open Word, ODT and RTF documents as pages. Edit and export.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['angebot.docx'] },
    newDoc: { label: 'New blank', make: () => new File(['<h1>Untitled</h1><p></p>'], 'Untitled.html', { type: 'text/html' }), after: (d, ctx) => ctx.setMode(d, 'edit') },
  },
  'viewer-pptx': {
    fmt: SLIDES, icon: 'presentation', kindLabel: 'Presentation', kindShort: 'presentation',
    exts: ['pptx'], kinds: ['slides'],
    dropTitle: 'Drop a PowerPoint file', tapTitle: 'Open a PowerPoint file', reads: 'Reads .pptx · slides stay on white paper in dark mode',
    lede: 'Flip through PowerPoint slides. Print to PDF or save the text.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['status.pptx'] },
  },
  'viewer-dxf': {
    fmt: DXF, icon: 'compass', kindLabel: 'DXF drawing', kindShort: 'DXF drawing',
    exts: ['dxf'], kinds: ['cad'],
    dropTitle: 'Drop a DXF drawing', tapTitle: 'Open a DXF drawing', reads: 'Reads .dxf (AutoCAD R12 to 2018) with text, dimensions and layers',
    lede: 'Open DXF drawings: layers, measure, coordinates, export.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['grundriss.dxf'] },
  },
  'viewer-pointcloud': {
    fmt: POINTS, icon: 'scan', kindLabel: 'Point cloud', kindShort: 'point cloud',
    exts: ['las', 'laz', 'e57', 'ply', 'pcd', 'xyz', 'pts', 'txt'], kinds: ['points', 'model', 'text'],
    dropTitle: 'Drop a point cloud', tapTitle: 'Open a point cloud', reads: 'Reads LAS, LAZ, E57, PLY, PCD, XYZ and PTS',
    lede: 'Open laser scans and point clouds. Orbit, clip and measure.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['gelaende.las'] },
  },
  'viewer-shapefile': {
    fmt: SHAPE, icon: 'globe', kindLabel: 'Shapefile', kindShort: 'shapefile',
    exts: ['zip', 'shp', 'geojson', 'kml', 'gpx'], acceptExtra: ',.shx,.dbf,.prj,.cpg,.json', kinds: ['geo', 'archive', 'data'], multiple: true,
    dropTitle: 'Drop a shapefile', tapTitle: 'Open a shapefile', reads: 'Reads zipped shapefiles (.shp + .dbf + .prj), GeoJSON, KML and GPX',
    lede: 'See shapefiles and GeoJSON on a map, with their attribute table.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['flurstuecke.zip'] },
  },
  'viewer-ifc': {
    fmt: IFC, icon: 'building', kindLabel: 'IFC model', kindShort: 'IFC model',
    exts: ['ifc'], kinds: ['cad'],
    dropTitle: 'Drop an IFC model', tapTitle: 'Open an IFC model', reads: 'Reads .ifc (IFC2x3 and IFC4) with storeys and properties',
    lede: 'Explore IFC building models by storey, element and property.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['einfamilienhaus.ifc'] },
  },
  'viewer-stl': {
    fmt: MESH, icon: 'box', kindLabel: '3D model', kindShort: '3D model',
    exts: ['stl', 'obj', 'ply', '3mf'], kinds: ['model'],
    dropTitle: 'Drop an STL or OBJ file', tapTitle: 'Open an STL or OBJ file', reads: 'Reads STL (binary and ASCII), OBJ, PLY meshes and 3MF',
    lede: 'Open STL and OBJ 3D models. Size, volume, section and measure.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['flansch.stl'] },
  },
  'viewer-database': {
    fmt: DB, icon: 'database', kindLabel: 'Database', kindShort: 'database',
    exts: ['sqlite', 'sqlite3', 'db', 'csv', 'tsv', 'json', 'ndjson', 'parquet', 'arrow'], kinds: ['data', 'sheet'], multiple: true,
    dropTitle: 'Drop a database', tapTitle: 'Open a database', reads: 'Reads SQLite (.sqlite, .db) · add CSV, JSON or Parquet files to query them together',
    lede: 'Browse SQLite databases and query CSV, JSON or Parquet with SQL.',
    sample: { label: 'Open sample', icon: 'sparkles', files: ['kunden.sqlite'] },
  },
};
