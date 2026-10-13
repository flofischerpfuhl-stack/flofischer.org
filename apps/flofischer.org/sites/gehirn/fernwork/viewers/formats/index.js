// Open · format registry. The format (extension + magic bytes in each plugin's steps) decides the canvas plugin.
import DXF from './dxf.js';
import DB from './db.js';
import SLIDES from './slides.js';
import MESH from './mesh.js';
import MD from './md.js';
import { TEXT, HEX } from './text.js';

export { TEXT, HEX };
export const FORMATS = [DXF, DB, SLIDES, MESH, MD, TEXT, HEX];
export function formatFor(file) {
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name || '')?.[1] || '').toLowerCase();
  return FORMATS.find((f) => f.exts?.includes(ext)) || TEXT;
}
