// Minimal PDF writer: pages with a JPEG background image and vector rectangles (QR modules stay razor sharp).
// pdf([{ w, h (pt), jpeg: Uint8Array, jpegW, jpegH, rects: [[x,y,w,h]] (pt, origin top-left), fill: [r,g,b] 0..1 }]) → Blob

const te = new TextEncoder();
export async function canvasJpeg(canvas, q = 0.92) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
  return new Uint8Array(await blob.arrayBuffer());
}
export function pdf(pages, { title = 'Fernwork' } = {}) {
  const chunks = []; let len = 0; const offs = [];
  const push = (x) => { const b = typeof x === 'string' ? te.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body, stream) => {
    offs[n] = len; push(`${n} 0 obj\n`);
    if (stream) { push(body.replace('%LEN%', String(stream.length))); push('\nstream\n'); push(stream); push('\nendstream'); } else push(body);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length; // objects: 1 catalog, 2 pages, 3 info, then per page: page, content, image
  const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  obj(3, `<< /Title (${title.replace(/[()\\]/g, '')}) /Producer (Fernwork, on this device) >>`);
  pages.forEach((p, i) => {
    const po = 4 + i * 3, co = po + 1, io = po + 2;
    const f = (v) => (+v).toFixed(3).replace(/\.?0+$/, '');
    let ops = `q ${f(p.w)} 0 0 ${f(p.h)} 0 0 cm /Im0 Do Q\n`;
    if (p.rects?.length) {
      const [r, g, b] = p.fill || [0, 0, 0];
      ops += `${f(r)} ${f(g)} ${f(b)} rg\n` + p.rects.map(([x, y, w, h]) => `${f(x)} ${f(p.h - y - h)} ${f(w)} ${f(h)} re`).join('\n') + '\nf\n';
    }
    const content = te.encode(ops);
    obj(po, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.w)} ${f(p.h)}] /Resources << /XObject << /Im0 ${io} 0 R >> >> /Contents ${co} 0 R >>`);
    obj(co, '<< /Length %LEN% >>', content);
    obj(io, `<< /Type /XObject /Subtype /Image /Width ${p.jpegW} /Height ${p.jpegH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %LEN% >>`, p.jpeg);
  });
  const total = 4 + n * 3; const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
