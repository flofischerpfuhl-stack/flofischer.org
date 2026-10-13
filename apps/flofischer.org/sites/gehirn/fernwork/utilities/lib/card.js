// Printable cards for Wi-Fi and contact codes: A6 card or A5 table tent (two halves, top one upside down).
// drawCard(canvas, opts) draws at 300 dpi and returns the QR module rectangles in PDF points for a vector overlay.
import { drawQR, logoBox } from './qrlib.js';

const MM = 300 / 25.4;               // px per mm at 300 dpi
const PT = 72 / 25.4;                // pt per mm
export const FORMATS = {
  a6: { label: 'A6 card', w: 105, h: 148, note: '105 × 148 mm' },
  tent: { label: 'Table tent', w: 148, h: 210, note: 'A5, fold in the middle' },
};

function fitText(g, text, max, size, weight, family) {
  let s = size; g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > max && s > size * 0.45) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  return s;
}
function wrapLines(g, text, max) {
  const out = []; let line = '';
  for (const ch of [...text]) { if (g.measureText(line + ch).width > max && line) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out.map((l) => l.trim());
}

/** One card face in a box (x, y, w, h in px). Returns the QR square { x, y, s } in px. */
function face(g, box, o, landscape) {
  const { x, y, w, h } = box; const m = 9 * MM;
  const UI = 'Geist, system-ui, sans-serif', MONO = '"Geist Mono", ui-monospace, monospace';
  g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
  const ink = '#111111', mute = '#5b5b63', acc = o.accent || '#15803d';
  const isWifi = o.type === 'wifi';
  const title = o.caption || (isWifi ? 'Scan to join our Wi-Fi' : 'Scan to save my contact');
  let qx, qy, qs;
  if (!landscape) {
    // eyebrow
    g.fillStyle = acc; g.font = `600 ${4.2 * MM}px ${UI}`; g.textBaseline = 'alphabetic';
    g.fillText(isWifi ? 'WI-FI' : 'CONTACT', x + m, y + m + 4 * MM);
    const ts = fitText(g, title, w - 2 * m, 8.4 * MM, 600, UI); g.fillStyle = ink; g.font = `600 ${ts}px ${UI}`;
    g.fillText(title, x + m, y + m + 4 * MM + 11 * MM);
    qs = Math.min(w - 2 * m, 62 * MM); qx = x + (w - qs) / 2; qy = y + m + 20 * MM;
    let ty = qy + qs + 8 * MM;
    const rows = isWifi ? [['Network', o.fields.ssid, false], ...(o.fields.sec !== 'nopass' && o.showPass !== false ? [['Password', o.fields.pass, true]] : [])]
      : [['Name', [o.fields.first, o.fields.last].filter(Boolean).join(' '), false], ['Phone', o.fields.tel, true], ['Email', o.fields.email, true]].filter((r) => r[1]);
    for (const [lab, val, mono] of rows) {
      g.fillStyle = mute; g.font = `500 ${3.6 * MM}px ${UI}`; g.fillText(lab, x + m, ty);
      const fam = mono ? MONO : UI; let s = fitText(g, val, w - 2 * m, 6.6 * MM, 600, fam);
      g.fillStyle = ink; g.font = `600 ${s}px ${fam}`;
      const lines = s <= 6.6 * MM * 0.5 ? wrapLines(g, val, w - 2 * m) : [val];
      lines.forEach((ln, i) => g.fillText(ln, x + m, ty + 7.4 * MM + i * s * 1.15));
      ty += 7.4 * MM + (lines.length - 1) * s * 1.15 + 7.2 * MM;
    }
    g.fillStyle = mute; g.font = `400 ${3.2 * MM}px ${UI}`;
    const foot = isWifi ? (o.fields.sec === 'nopass' ? 'Open network · no password needed' : `Point your phone camera at the code, or type the password. ${o.fields.sec === 'WEP' ? 'WEP' : 'WPA2/WPA3'}.`) : 'Point your phone camera at the code.';
    wrapLines(g, foot, w - 2 * m).forEach((ln, i) => g.fillText(ln, x + m, y + h - m - (wrapLines(g, foot, w - 2 * m).length - 1 - i) * 4.4 * MM));
  } else {
    qs = h - 2 * m - 2 * MM; qx = x + m; qy = y + (h - qs) / 2;
    const tx = qx + qs + 8 * MM, tw = x + w - m - tx;
    g.fillStyle = acc; g.font = `600 ${3.8 * MM}px ${UI}`; g.textBaseline = 'alphabetic';
    g.fillText(isWifi ? 'WI-FI' : 'CONTACT', tx, y + m + 4 * MM);
    const t2 = isWifi ? 'Scan to join' : 'Scan to save';
    let s = fitText(g, t2, tw, 7.4 * MM, 600, UI); g.fillStyle = ink; g.font = `600 ${s}px ${UI}`; g.fillText(t2, tx, y + m + 14 * MM);
    let ty = y + m + 28 * MM;
    const rows = isWifi ? [['Network', o.fields.ssid, false], ...(o.fields.sec !== 'nopass' && o.showPass !== false ? [['Password', o.fields.pass, true]] : [])] : [['Name', [o.fields.first, o.fields.last].filter(Boolean).join(' '), false], ['Phone', o.fields.tel, true]];
    for (const [lab, val, mono] of rows) {
      g.fillStyle = mute; g.font = `500 ${3.3 * MM}px ${UI}`; g.fillText(lab, tx, ty);
      const fam = mono ? MONO : UI; s = fitText(g, val, tw, 5.6 * MM, 600, fam); g.fillStyle = ink; g.font = `600 ${s}px ${fam}`; g.fillText(val, tx, ty + 7 * MM);
      ty += 16 * MM;
    }
  }
  const W = drawQR(o.qrCanvas, o.qr, { fg: o.fg, bg: o.bg, scale: Math.max(1, Math.floor(qs / (o.qr.size + 8))), margin: 4, logo: o.logo });
  const s2 = Math.floor(qs / (o.qr.size + 8)) * (o.qr.size + 8);
  const ox = qx + (qs - s2) / 2, oy = qy + (qs - s2) / 2;
  g.imageSmoothingEnabled = false; g.drawImage(o.qrCanvas, ox, oy, s2, s2);
  return { x: ox, y: oy, s: s2, W };
}

/** drawCard(canvas, { format, type, fields, qr, fg, bg, logo, caption, showPass }) → { wPt, hPt, rects: [[x,y,w,h]] in pt } */
export function drawCard(canvas, o) {
  const F = FORMATS[o.format] || FORMATS.a6;
  const W = Math.round(F.w * MM), H = Math.round(F.h * MM);
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  o.qrCanvas = o.qrCanvas || document.createElement('canvas');
  const quads = [];
  if (o.format === 'tent') {
    const half = H / 2;
    // bottom half (front), top half upside down (back), dashed fold line
    quads.push({ ...face(g, { x: 0, y: half, w: W, h: half }, o, true), flip: false });
    g.save(); g.translate(W, half); g.rotate(Math.PI);
    const q = face(g, { x: 0, y: 0, w: W, h: half }, o, true); g.restore();
    quads.push({ x: W - q.x - q.s, y: half - q.y - q.s, s: q.s, flip: true });
    g.strokeStyle = '#b8b8bf'; g.lineWidth = 0.35 * MM; g.setLineDash([2.2 * MM, 1.6 * MM]); g.beginPath(); g.moveTo(0, half); g.lineTo(W, half); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#8e8e96'; g.font = `400 ${2.6 * MM}px Geist, sans-serif`; g.fillText('fold', W - 12 * MM, half - 1.4 * MM);
  } else quads.push({ ...face(g, { x: 0, y: 0, w: W, h: H }, o, false), flip: false });
  // vector rectangles for the PDF (same modules, in points)
  const k = PT / MM; const rects = []; const n = o.qr.size;
  const lb = o.logo ? logoBox(o.qr) : null;
  for (const q of quads) {
    const mod = q.s / (n + 8);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!o.qr.get(r, c)) continue;
      if (lb && c >= lb.x && c < lb.x + lb.s && r >= lb.y && r < lb.y + lb.s) continue;
      const rr = q.flip ? n - 1 - r : r, cc = q.flip ? n - 1 - c : c;
      rects.push([(q.x + (cc + 4) * mod) * k, (q.y + (rr + 4) * mod) * k, mod * k + 0.02, mod * k + 0.02]);
    }
  }
  return { wPt: F.w * PT, hPt: F.h * PT, rects, fill: o.fg };
}
