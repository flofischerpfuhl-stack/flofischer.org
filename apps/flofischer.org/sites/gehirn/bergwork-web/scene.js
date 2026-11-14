// Bergszene über Tage: Himmel, Sonne, drei Gebirgsketten und der Förderturm. Alles aus einem Startwert gerechnet,
// damit die Szene bei jeder Fensterbreite neu gesetzt werden kann und trotzdem dieselben Berge zeigt.

export function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Kammlinie: Stützpunkte, dazwischen Mittelpunktverschiebung bis zur kleinsten Kantenlänge.
export function ridge(ctrl, rough, minSeg, R) {
  let pts = ctrl.map((p) => [p[0], p[1]]);
  for (let pass = 0; pass < 12; pass++) {
    const out = [pts[0]]; let cut = false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0];
      if (dx > minSeg) { out.push([a[0] + dx * (0.36 + R() * 0.28), (a[1] + b[1]) / 2 + (R() - 0.5) * rough * dx]); cut = true; }
      out.push(b);
    }
    pts = out; if (!cut) break;
  }
  return pts;
}
const f1 = (n) => n.toFixed(1);
export const poly = (pts) => pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
export const yAt = (pts, x) => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const a = pts[i - 1], b = pts[i]; return a[1] + ((x - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]); } return pts[pts.length - 1][1]; };

// Gipfel: örtliche Maxima mit genug Fall zur Lichtseite.
function peaks(pts, sunX, minDrop) {
  const out = [];
  for (let i = 2; i < pts.length - 2; i++) {
    if (!(pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1])) continue;
    const dir = pts[i][0] < sunX ? 1 : -1;
    const walk = (d) => { let j = i, low = pts[i][1]; for (let k = i + d; k >= 0 && k < pts.length; k += d) { if (pts[k][1] > low) { low = pts[k][1]; j = k; } else if (pts[k][1] < low - minDrop * 0.35) break; } return j; };
    const j = walk(dir), o = walk(-dir);
    const drop = pts[j][1] - pts[i][1], other = pts[o][1] - pts[i][1];
    if (drop >= minDrop && other >= minDrop * 0.5) out.push({ i, j, o, dir, drop, other });
  }
  return out;
}

// Eine Kette: Grundfläche, der Sonne zugewandte Flanken, Schneekappen.
function range(id, pts, H, o, R, sun) {
  const defs = [], parts = [];
  parts.push(`<polygon points="${poly([[pts[0][0], H + 4], ...pts, [pts[pts.length - 1][0], H + 4]])}" fill="url(#g-${id})"/>`);
  const top = Math.min(...pts.map((p) => p[1]));
  defs.push(`<linearGradient id="g-${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(top)}" x2="0" y2="${f1(top + o.fade)}"><stop offset="0" stop-color="${o.base}"/><stop offset="1" stop-color="${o.foot}"/></linearGradient>`);
  peaks(pts, sun.x, o.minDrop).forEach((p, n) => {
    const S = pts[p.i], Hs = Math.min(p.drop * 1.5 + 30, o.fade);
    const edge = []; for (let k = p.i; k !== p.j + p.dir; k += p.dir) edge.push(pts[k]);
    const steps = Math.max(3, Math.round(Hs / 20)), spine = [];
    for (let s = steps; s >= 1; s--) { const t = s / steps; spine.push([S[0] - p.dir * t * Hs * o.lean + (s % 2 ? 1 : -1) * (3 + R() * 9) * (0.4 + t), S[1] + t * Hs]); }
    const last = edge[edge.length - 1];
    const near = Math.max(0, 1 - Math.abs(S[0] - sun.x) / (sun.r * 2.4));
    const gid = `l-${id}-${n}`;
    defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(S[1])}" x2="0" y2="${f1(S[1] + Hs)}"><stop offset="0" stop-color="${o.lit}" stop-opacity="${f1(0.55 + 0.45 * near)}"/><stop offset=".55" stop-color="${o.lit}" stop-opacity="${f1(0.3 + 0.3 * near)}"/><stop offset="1" stop-color="${o.lit}" stop-opacity="0"/></linearGradient>`);
    parts.push(`<polygon points="${poly([...edge, [last[0], S[1] + Hs], ...spine])}" fill="url(#${gid})"/>`);
    if (o.rim && near > 0.05) parts.push(`<polyline points="${poly(edge.slice(0, Math.max(2, Math.ceil(edge.length * 0.8))))}" fill="none" stroke="${o.rim}" stroke-opacity="${f1(near)}" stroke-width="${o.rimW}" stroke-linejoin="round"/>`);
    if (o.snow && p.drop > o.snowDrop) {
      const capH = Math.min(p.drop, p.other) * (0.3 + R() * 0.16);
      const side = (d) => { const a = [S]; for (let k = p.i + d; k >= 0 && k < pts.length; k += d) { const q = pts[k], pr = a[a.length - 1]; if (q[1] - S[1] >= capH || q[1] < pr[1]) { if (q[1] > pr[1]) { const t = (S[1] + capH - pr[1]) / (q[1] - pr[1]); a.push([pr[0] + (q[0] - pr[0]) * Math.min(1, Math.max(0, t)), pr[1] + (q[1] - pr[1]) * Math.min(1, Math.max(0, t))]); } break; } a.push(q); } return a; };
      const lit = side(p.dir), dark = side(-p.dir), A = lit[lit.length - 1], B = dark[dark.length - 1];
      const teeth = Math.max(2, Math.round(Math.abs(A[0] - B[0]) / 11)), hem = [];
      for (let t = 1; t < teeth; t++) { const u = t / teeth; hem.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u + (t % 2 ? -1 : 1) * capH * (0.22 + R() * 0.2)]); }
      const mid = hem[Math.floor(hem.length / 2)] ?? [S[0], S[1] + capH];
      parts.push(`<polygon points="${poly([...lit.slice().reverse(), ...dark.slice(1), ...hem.slice().reverse()])}" fill="${o.snow}"/>`);
      parts.push(`<polygon points="${poly([S, ...dark.slice(1), ...hem.slice(Math.floor(hem.length / 2)).reverse(), [S[0] - p.dir * 2, mid[1] - capH * 0.2]])}" fill="${o.base}" fill-opacity=".5"/>`);
    }
  });
  return `<defs>${defs.join('')}</defs>${parts.join('')}`;
}

function trees(pts, R, x0, x1, fill) {
  let s = '';
  for (let x = x0; x < x1; x += 5 + R() * 13) {
    if (R() < 0.3) { x += 30 + R() * 90; continue; }
    const y = yAt(pts, x) + 2, h = 9 + R() * 17, w = h * 0.42;
    s += `<path d="M${f1(x)} ${f1(y - h)}l${f1(w * 0.55)} ${f1(h * 0.45)}h${f1(-w * 0.25)}l${f1(w * 0.5)} ${f1(h * 0.55)}h${f1(-w * 1.6)}l${f1(w * 0.5)} ${f1(-h * 0.55)}h${f1(-w * 0.25)}z" fill="${fill}"/>`;
  }
  return s;
}

// Förderturm über dem Schacht: Strebengerüst mit Seilscheibe, Maschinenhaus, rote Lampe.
function headframe(x, y, k) {
  const h = 96 * k, w = 9 * k, top = y - h, st = `fill="none" stroke="var(--frame)" stroke-width="${f1(1.4 * k)}" stroke-linejoin="round" stroke-linecap="round"`;
  let brace = '';
  for (let i = 0; i < 4; i++) { const a = top + (h / 4) * i, b = a + h / 4; brace += `M${f1(x - w)} ${f1(a)}L${f1(x + w)} ${f1(b)}M${f1(x + w)} ${f1(a)}L${f1(x - w)} ${f1(b)}M${f1(x - w)} ${f1(b)}H${f1(x + w)}`; }
  const hx = x + 78 * k, r = 12 * k, wy = top - r - 2 * k;
  let spokes = ''; for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI; spokes += `M${f1(x - Math.cos(t) * r)} ${f1(wy - Math.sin(t) * r)}L${f1(x + Math.cos(t) * r)} ${f1(wy + Math.sin(t) * r)}`; }
  const gy = yAt.g ?? y;
  return `<g class="frame">
    <path ${st} d="M${f1(x - w)} ${f1(y + 4)}V${f1(top)}H${f1(x + w)}V${f1(y + 4)}${brace}"/>
    <path ${st} d="M${f1(x + w)} ${f1(top + 6 * k)}L${f1(hx - 14 * k)} ${f1(gy)}M${f1(x + w)} ${f1(top + h * 0.46)}L${f1(x + w + (hx - 14 * k - x - w) * 0.5)} ${f1(top + 6 * k + (gy - top - 6 * k) * 0.5)}"/>
    <path ${st} d="M${f1(x - w - 7 * k)} ${f1(top)}H${f1(x + w + 7 * k)}"/>
    <circle cx="${f1(x)}" cy="${f1(wy)}" r="${f1(r)}" ${st}/><path ${st} stroke-width="${f1(0.9 * k)}" d="${spokes}"/>
    <path ${st} d="M${f1(x + r)} ${f1(wy)}L${f1(hx)} ${f1(gy - 20 * k)}"/>
    <path fill="var(--house)" stroke="var(--frame)" stroke-width="${f1(1.2 * k)}" stroke-linejoin="round" d="M${f1(hx - 12 * k)} ${f1(gy + 4)}V${f1(gy - 24 * k)}L${f1(hx + 12 * k)} ${f1(gy - 38 * k)}L${f1(hx + 36 * k)} ${f1(gy - 24 * k)}V${f1(gy + 4)}z"/>
    <rect x="${f1(hx + 4 * k)}" y="${f1(gy - 18 * k)}" width="${f1(7 * k)}" height="${f1(9 * k)}" fill="var(--lamp-warm)"/>
    <circle class="beacon" cx="${f1(x)}" cy="${f1(wy - r - 5 * k)}" r="${f1(2.6 * k)}" fill="var(--red-hi)"/>
  </g>`;
}

// Setzt die Szene in das Element und meldet Maße zurück, die der Rest der Seite braucht (Boden am Schacht).
export function buildScene(el, { shaftX = 56, seed = 1987 } = {}) {
  const W = el.clientWidth, H = el.clientHeight, tall = W < 720, k = Math.min(1.15, Math.max(0.62, H / 900));
  const pad = tall ? 20 : Math.max(40, W * 0.05);
  const fs = tall ? (W - 2 * pad) / 1.688 : Math.min((W - 2 * pad) / 3.376, H * 0.5), cap = fs * 0.625;
  const y0 = tall ? 84 : 76 + H * 0.045, lineGap = cap * 0.16;
  const base = tall ? y0 + cap * 2 + lineGap : y0 + cap;                 // Grundlinie der (letzten) Zeile
  const sun = { r: tall ? W * 0.4 : H * 0.265, x: W * (tall ? 0.66 : 0.705) }; sun.y = base + sun.r * (tall ? 0.5 : 0.42);
  const R = rng(seed), s = (v) => v * k, X = (f) => f * W;
  const far = ridge([[-0.06, 30], [0.06, -40], [0.17, 26], [0.29, -96], [0.4, 10], [0.5, -40], [0.6, 30], [0.71, -20], [0.81, -84], [0.92, 6], [1.06, -50]].map(([x, y]) => [X(x), base + H * 0.03 + s(y) * (tall ? 0.6 : 1)]), 0.42, tall ? 12 : 17, R);
  const mid = ridge([[-0.06, 40], [0.08, -30], [0.18, 62], [0.29, -112], [0.4, 60], [0.52, -168], [0.63, 70], [0.74, 6], [0.86, -124], [0.95, 44], [1.06, -20]].map(([x, y]) => [X(x), base + H * 0.1 + s(y) * (tall ? 0.6 : 1)]), 0.5, tall ? 11 : 15, R);
  const groundY = tall ? H * 0.8 : H * 0.665;
  const hills = ridge([[-0.06, -70], [0.12, -26], [0.27, -58], [0.45, -14], [0.6, -44], [0.78, -18], [0.9, -66], [1.06, -96]].map(([x, y]) => [X(x), groundY + s(y)]), 0.2, 20, R);
  const near = ridge([[-0.06, -40], [0.1, 6], [0.3, 40], [0.5, 58], [0.72, 32], [0.88, -10], [1.06, -56]].map(([x, y]) => [X(x), groundY + s(y)]), 0.11, 22, R);
  const sx = Math.min(shaftX, W * 0.14), gy = yAt(near, sx); yAt.g = yAt(near, sx + 78 * k);
  const svg = (inner) => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">${inner}</svg>`;
  const under = (pts, c) => `<polygon points="${poly([[pts[0][0], H + 4], ...pts, [pts[pts.length - 1][0], H + 4]])}" fill="${c}"/>`;
  el.querySelector('.lay-far').innerHTML = svg(range('far', far, H, { base: 'var(--m-far)', foot: 'var(--m-far-foot)', fade: s(230), lit: 'var(--m-far-lit)', lean: 0.1, minDrop: s(16), snow: 'var(--snow-far)', snowDrop: s(30) }, R, sun));
  el.querySelector('.lay-mid').innerHTML = svg(range('mid', mid, H, { base: 'var(--m-mid)', foot: 'var(--m-mid-foot)', fade: s(300), lit: 'var(--m-mid-lit)', lean: 0.12, minDrop: s(20), snow: 'var(--snow)', snowDrop: s(46), rim: 'var(--rim)', rimW: 1.6 }, R, sun));
  // Boden: Waldkuppen im Dunst, davor die Kante mit Fichten, darunter die ersten Schichten.
  let soil = '';
  for (let i = 1; i <= 5; i++) { const d = s(16) * i * (1 + i * 0.28), R2 = rng(seed + i); soil += `<polyline points="${poly(near.filter((_, n) => n % 2 === 0).map((p) => [p[0], p[1] + d + (R2() - 0.5) * 7]))}" fill="none" stroke="#fffdf8" stroke-opacity="${f1(0.11 - i * 0.016)}" stroke-width="1"${i % 2 ? '' : ' stroke-dasharray="1 6"'}/>`; }
  el.querySelector('.lay-near').innerHTML = svg(`<defs><linearGradient id="g-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--haze)" stop-opacity="0"/><stop offset="1" stop-color="var(--haze)" stop-opacity=".5"/></linearGradient></defs>
    <rect x="0" y="${f1(groundY - s(190))}" width="${W}" height="${f1(s(190) + 70)}" fill="url(#g-haze)"/>
    ${under(hills, 'var(--hill)')}${trees(hills, R, -20, W + 20, 'var(--hill)')}
    ${under(near, 'var(--ground)')}${trees(near, R, sx + 150 * k, W + 20, 'var(--ground)')}${trees(near, R, -20, sx - 30 * k, 'var(--ground)')}${soil}${headframe(sx, gy, k)}`);
  const stars = el.querySelector('.stars'), dpr = Math.min(2, devicePixelRatio || 1), c = stars.getContext('2d');
  stars.width = W * dpr; stars.height = H * dpr; c.scale(dpr, dpr);
  for (let i = 0; i < (tall ? 70 : 150); i++) { const x = R() * W, y = Math.pow(R(), 1.6) * (base + H * 0.06), d = Math.hypot(x - sun.x, y - sun.y); if (d < sun.r * 1.5) continue; c.globalAlpha = (0.12 + R() * 0.5) * Math.min(1, (d - sun.r * 1.5) / (sun.r * 1.2) + 0.25); c.fillStyle = '#f2f1ed'; const q = R() < 0.08 ? 1.6 : R() < 0.35 ? 1.1 : 0.7; c.fillRect(x, y, q, q); }
  const st = el.style;
  st.setProperty('--fs', `${f1(fs)}px`); st.setProperty('--wm-top', `${f1(base - (tall ? cap * 2 + lineGap : cap))}px`); st.setProperty('--wm-lh', `${f1(cap + lineGap)}px`); st.setProperty('--wm-pad', `${f1(pad)}px`);
  st.setProperty('--sun-x', `${f1(sun.x)}px`); st.setProperty('--sun-y', `${f1(sun.y)}px`); st.setProperty('--sun-r', `${f1(sun.r)}px`);
  return { W, H, shaftX: sx, groundY: gy, tall };
}
