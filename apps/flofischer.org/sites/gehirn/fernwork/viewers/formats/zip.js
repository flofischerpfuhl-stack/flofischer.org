// Convert mockup · tiny ZIP writer (store only) and reader (stored + deflate via DecompressionStream). No dependencies.
// Used for "Download all", and to read/write XLSX, ODS and DOCX in the mockup. The real build uses fflate.
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const enc = new TextEncoder();
const bytesOf = async (d) => (d instanceof Uint8Array ? d : typeof d === 'string' ? enc.encode(d) : new Uint8Array(await d.arrayBuffer()));

/** makeZip([{ name, blob | data }], { type }) → Blob. Duplicate names get " (2)". */
export async function makeZip(entries, { type = 'application/zip' } = {}) {
  const parts = []; const central = []; let offset = 0; const seen = new Map();
  const d = new Date(); const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    let name = e.name; const n = seen.get(name) || 0; seen.set(name, n + 1);
    if (n) name = name.replace(/(\.[^.]+)?$/, ` (${n + 1})$1`);
    const data = await bytesOf(e.blob ?? e.data); const nb = enc.encode(name); const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
    parts.push(lh, nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nb.length, true); ch.setUint32(42, offset, true);
    central.push(ch, nb);
    offset += 30 + nb.length + data.length;
  }
  const cSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type });
}

/** readZip(blob) → Map(name → async () => Uint8Array). Throws a human message for non-ZIP input. */
export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()); const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a ZIP container');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = new Map(); const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true); const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true); const xlen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true); const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    out.set(name, async () => {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = buf.subarray(start, start + csize);
      if (method === 0) return raw;
      const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
export const zipText = async (zip, name) => { const f = zip.get(name); return f ? new TextDecoder().decode(await f()) : null; };
