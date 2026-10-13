// Fernboard mind map: outline tree ⇄ Markdown, balanced two-sided layout, static SVG for the board and exports,
// a live renderer that animates growth, and the keyboard outliner (Enter sibling · Tab child · ⇧Tab out · ⌥↑↓ move).
import { measure, esc, uid } from './scene.js';

// ───────────────────────── tree ⇄ markdown ─────────────────────────
export const node = (text = '', children = []) => ({ id: uid('n'), text, children });
export function fromMarkdown(md) {
  const lines = String(md || '').split('\n').filter((l) => l.trim());
  let root = null; const stack = [];
  for (const raw of lines) {
    const h = raw.match(/^\s*#\s+(.*)$/);
    if (h && !root) { root = node(h[1].trim()); continue; }
    const m = raw.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/) || raw.match(/^(\s*)(.*)$/);
    const indent = m[1].replace(/\t/g, '  ').length, text = m[2].trim();
    if (!root) { root = node(text); continue; }
    const n = node(text);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].n.children : root.children).push(n);
    stack.push({ indent, n });
  }
  return root || node('Central idea');
}
export function toMarkdown(root) {
  let s = `# ${root.text}\n`;
  const walk = (n, d) => { for (const c of n.children) { s += `${'  '.repeat(d)}- ${c.text}\n`; walk(c, d + 1); } };
  walk(root, 0);
  return s;
}
export const countNodes = (n) => 1 + n.children.reduce((a, c) => a + countNodes(c), 0);
export function findPath(root, id, path = []) {
  if (root.id === id) return [...path, root];
  for (const c of root.children) { const p = findPath(c, id, [...path, root]); if (p) return p; }
  return null;
}

// ───────────────────────── layout ─────────────────────────
const STY = [
  { size: 18, weight: 600, padX: 18, h: 44, gap: 0 },
  { size: 15, weight: 600, padX: 6, h: 32, gap: 14 },
  { size: 14, weight: 500, padX: 6, h: 28, gap: 6 },
];
const sty = (d) => STY[Math.min(d, 2)];
const HGAP = [0, 64, 44, 40];
export function layout(root) {
  const nodes = [], links = [];
  const size = (n, d) => { const s = sty(d); n._w = Math.max(d ? 36 : 120, measure(n.text || ' ', s.size, s.weight) + s.padX * 2); n._h = s.h; n._d = d; n.children.forEach((c) => size(c, d + 1)); n._sub = n.children.length ? Math.max(n._h, n.children.reduce((a, c) => a + c._sub, 0) + (n.children.length - 1) * sty(d + 1).gap) : n._h; };
  size(root, 0);
  // balance top-level branches between right and left (keep order: right side first, then left)
  const total = root.children.reduce((a, c) => a + c._sub, 0); let acc = 0; const right = [], left = [];
  root.children.forEach((c, i) => { c._branch = i; if (acc < total / 2 || root.children.length === 1) { right.push(c); acc += c._sub; } else left.push(c); });
  const place = (n, x, cy, side, color) => {
    n._x = x; n._y = cy; n._side = side; n._color = color;
    nodes.push(n);
    if (!n.children.length) return;
    const g = sty(n._d + 1).gap, tot = n.children.reduce((a, c) => a + c._sub, 0) + (n.children.length - 1) * g;
    let y = cy - tot / 2;
    for (const c of n.children) {
      const ccy = y + c._sub / 2, hg = HGAP[Math.min(c._d, 3)];
      const cx = side > 0 ? x + n._w + hg : x - hg - c._w;
      place(c, cx, ccy, side, color);
      links.push({ from: n, to: c });
      y += c._sub + g;
    }
  };
  root._x = -root._w / 2; root._y = 0; root._side = 0; root._color = -1; nodes.push(root);
  const column = (list, side) => {
    const g = sty(1).gap, tot = list.reduce((a, c) => a + c._sub, 0) + Math.max(0, list.length - 1) * g; let y = -tot / 2;
    for (const c of list) { const cx = side > 0 ? root._w / 2 + HGAP[1] : -root._w / 2 - HGAP[1] - c._w; place(c, cx, y + c._sub / 2, side, c._branch); links.push({ from: root, to: c }); y += c._sub + g; }
  };
  column(right, 1); column(left, -1);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) { x1 = Math.min(x1, n._x); x2 = Math.max(x2, n._x + n._w); y1 = Math.min(y1, n._y - n._h / 2); y2 = Math.max(y2, n._y + n._h / 2); }
  return { nodes, links, box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}
const colorVar = (i) => (i < 0 ? 'var(--k-ink)' : `var(--m-${i % 7})`);
const f = (n) => Math.round(n * 10) / 10;
function anchorOut(n) { // where links leave a node
  if (n._d === 0) return [n._x + n._w / 2 + (n._side >= 0 ? 0 : 0), n._y];
  const yb = n._y + n._h / 2 - 1;
  return n._side > 0 ? [n._x + n._w, yb] : [n._x, yb];
}
function linkPath(a, b) {
  const p0 = a._d === 0 ? [b._side > 0 ? a._x + a._w - 6 : a._x + 6, a._y] : anchorOut(a);
  const yb = b._y + b._h / 2 - 1, p1 = b._side > 0 ? [b._x, yb] : [b._x + b._w, yb];
  const mx = (p0[0] + p1[0]) / 2;
  return `M${f(p0[0])} ${f(p0[1])}C${f(mx)} ${f(p0[1])} ${f(mx)} ${f(p1[1])} ${f(p1[0])} ${f(p1[1])}`;
}
function underline(n) { const yb = n._y + n._h / 2 - 1; return `M${f(n._x)} ${f(yb)}H${f(n._x + n._w)}`; }
const LW = (d) => (d <= 1 ? 3 : d === 2 ? 2 : 1.5);
function nodeLabel(n) {
  const s = sty(n._d);
  if (n._d === 0) return `<rect x="${f(n._x)}" y="${f(n._y - n._h / 2)}" width="${f(n._w)}" height="${n._h}" rx="${n._h / 2}" style="fill:var(--k-ink)"/><text x="${f(n._x + n._w / 2)}" y="${f(n._y)}" text-anchor="middle" dominant-baseline="central" font-size="${s.size}" font-weight="${s.weight}" class="k-ui" style="fill:var(--k-on-ink)">${esc(n.text)}</text>`;
  const tx = n._side > 0 ? n._x + s.padX : n._x + n._w - s.padX;
  return `<text x="${f(tx)}" y="${f(n._y + n._h / 2 - 9)}" text-anchor="${n._side > 0 ? 'start' : 'end'}" font-size="${s.size}" font-weight="${s.weight}" class="k-ui" style="fill:var(--k-ink)">${esc(n.text || ' ')}</text>`;
}
/** Static SVG string (used inside board blocks, thumbnails and exports). */
export function staticSvg(root, pad = 16) {
  const L = layout(root), b = L.box;
  let s = '';
  for (const l of L.links) s += `<path d="${linkPath(l.from, l.to)}" fill="none" stroke-linecap="round" stroke-width="${LW(l.to._d)}" style="stroke:${colorVar(l.to._color)}"/>`;
  for (const n of L.nodes) if (n._d) s += `<path d="${underline(n)}" fill="none" stroke-linecap="round" stroke-width="${LW(n._d)}" style="stroke:${colorVar(n._color)}"/>`;
  for (const n of L.nodes) s += nodeLabel(n);
  const vx = b.x - pad, vy = b.y - pad, vw = b.w + pad * 2, vh = b.h + pad * 2;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" width="${f(vw)}" height="${f(vh)}">${s}</svg>`, w: vw, h: vh };
}

// ───────────────────────── live renderer (focus mode) ─────────────────────────
const NS = 'http://www.w3.org/2000/svg';
export class MapView {
  constructor(svg) {
    this.svg = svg; this.g = document.createElementNS(NS, 'g'); this.g.classList.add('mm-world'); svg.append(this.g);
    this.links = document.createElementNS(NS, 'g'); this.unders = document.createElementNS(NS, 'g'); this.labels = document.createElementNS(NS, 'g');
    this.g.append(this.links, this.unders, this.labels);
    this.items = new Map(); this.view = { x: 0, y: 0, k: 1 }; this.auto = true; this.focusId = null;
    this.onNodeClick = null;
    this._pan();
  }
  update(root) {
    const L = layout(root); this.box = L.box;
    const seen = new Set();
    const parentOf = new Map(); L.links.forEach((l) => parentOf.set(l.to.id, l.from));
    for (const n of L.nodes) {
      seen.add(n.id);
      let it = this.items.get(n.id);
      const fresh = !it;
      if (fresh) {
        it = { label: document.createElementNS(NS, 'g') };
        it.label.classList.add('mm-node'); it.label.dataset.id = n.id;
        it.label.addEventListener('click', () => this.onNodeClick?.(n.id));
        if (n._d) { it.link = document.createElementNS(NS, 'path'); it.under = document.createElementNS(NS, 'path'); for (const p of [it.link, it.under]) { p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round'); p.classList.add('mm-path'); } this.links.append(it.link); this.unders.append(it.under); }
        this.labels.append(it.label); this.items.set(n.id, it);
      }
      const key = `${n.text}|${n._d}|${n._side}|${n._color}|${f(n._w)}`;
      const ox = n._x, oy = n._y;
      if (it.key !== key) { it.key = key; it.label.innerHTML = nodeLabel({ ...n, _x: 0, _y: 0 }); }
      it.label.classList.toggle('is-focus', n.id === this.focusId);
      const tr = `translate(${f(ox)}px, ${f(oy)}px)`;
      if (fresh) {
        const p = parentOf.get(n.id);
        const from = p ? `translate(${f(p._x + (n._side > 0 ? p._w : 0))}px, ${f(p._y)}px) scale(.4)` : tr;
        it.label.style.transition = 'none'; it.label.style.transform = from; it.label.style.opacity = '0';
        if (it.link) { const pd = p ? `M${f(anchorOut(p)[0])} ${f(p._y)}H${f(anchorOut(p)[0] + 0.1)}` : ''; it.link.style.transition = 'none'; it.under.style.transition = 'none'; it.link.style.d = `path("${pd}")`; it.under.style.d = `path("${pd}")`; }
        it.label.getBoundingClientRect();
        it.label.style.transition = ''; if (it.link) { it.link.style.transition = ''; it.under.style.transition = ''; }
      }
      it.label.style.transform = tr; it.label.style.opacity = '1';
      if (it.link) {
        const p = parentOf.get(n.id);
        it.link.style.d = `path("${linkPath(p, n)}")`; it.under.style.d = `path("${underline(n)}")`;
        for (const el of [it.link, it.under]) { el.style.stroke = colorVar(n._color); el.style.strokeWidth = LW(n._d); }
      }
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this.items.delete(id); for (const el of [it.label, it.link, it.under]) if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 260); } }
    if (this.auto) this.fit(true);
  }
  setFocus(id) { this.focusId = id; for (const [k, it] of this.items) it.label.classList.toggle('is-focus', k === id); }
  fit(animate = true) {
    if (!this.box) return;
    const r = this.svg.getBoundingClientRect(); if (!r.width) return;
    const pad = 40, b = this.box;
    const k = Math.max(0.35, Math.min(1.25, (r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h));
    this.view = { k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k };
    this._apply(animate);
  }
  zoomBy(m) { const r = this.svg.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, m); }
  zoomAt(cx, cy, m) { const v = this.view, k = Math.max(0.25, Math.min(3, v.k * m)); this.view = { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }; this.auto = false; this._apply(false); }
  _apply(animate) { this.g.style.transition = animate ? '' : 'none'; this.g.style.transform = `translate(${f(this.view.x)}px, ${f(this.view.y)}px) scale(${this.view.k.toFixed(4)})`; this.onView?.(this.view); }
  _pan() {
    let s = null;
    this.svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.mm-node')) return; s = { x: e.clientX, y: e.clientY, v: { ...this.view } }; this.svg.setPointerCapture(e.pointerId); });
    this.svg.addEventListener('pointermove', (e) => { if (!s) return; this.view = { ...s.v, x: s.v.x + e.clientX - s.x, y: s.v.y + e.clientY - s.y }; this.auto = false; this._apply(false); });
    this.svg.addEventListener('pointerup', () => { s = null; });
    this.svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = this.svg.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01)); else { this.view = { ...this.view, x: this.view.x - e.deltaX, y: this.view.y - e.deltaY }; this.auto = false; this._apply(false); } }, { passive: false });
  }
}

// ───────────────────────── outliner ─────────────────────────
/**
 * new Outliner(el, root, { onChange(root, { structural }), onFocus(id) })
 * One row per node: Enter adds a sibling (a child on the root), Tab indents, ⇧Tab outdents, ⌥↑/⌥↓ move,
 * ↑/↓ move focus, ⌫ on an empty row deletes it, pasting a list adds every line.
 */
export class Outliner {
  constructor(el, root, { onChange, onFocus } = {}) {
    this.el = el; this.root = root; this.onChange = onChange; this.onFocus = onFocus;
    el.classList.add('ol'); el.setAttribute('role', 'tree'); el.setAttribute('aria-label', 'Mind map outline');
    this.render();
  }
  flat() { const out = []; const walk = (n, d, color) => { out.push({ n, d, color }); n.children.forEach((c, i) => walk(c, d + 1, d === 0 ? i : color)); }; walk(this.root, 0, -1); return out; }
  render(focusId, caret) {
    const rows = this.flat();
    this.el.innerHTML = rows.map(({ n, d, color }) => `<div class="ol-row" role="treeitem" aria-level="${d + 1}" data-id="${n.id}" style="--d:${d};--c:${colorVar(color)}">
      <span class="ol-bullet ${d === 0 ? 'is-root' : ''}" aria-hidden="true"></span>
      <input class="ol-input ${d === 0 ? 'is-root' : ''}" type="text" value="${esc(n.text)}" aria-label="${d === 0 ? 'Central idea' : `Level ${d} idea`}" placeholder="${d === 0 ? 'Central idea' : 'Idea'}" spellcheck="false" autocomplete="off"></div>`).join('');
    this.el.querySelectorAll('.ol-input').forEach((inp) => {
      const id = inp.closest('.ol-row').dataset.id;
      inp.addEventListener('input', () => { const p = findPath(this.root, id); p.at(-1).text = inp.value; this.onChange?.(this.root, { structural: false }); });
      inp.addEventListener('keydown', (e) => this.key(e, id, inp));
      inp.addEventListener('focus', () => { this.el.querySelectorAll('.ol-row').forEach((r) => r.classList.toggle('is-current', r.dataset.id === id)); this.onFocus?.(id); });
      inp.addEventListener('paste', (e) => this.paste(e, id));
    });
    if (focusId) this.focus(focusId, caret);
  }
  focus(id, caret) {
    const inp = this.el.querySelector(`.ol-row[data-id="${id}"] .ol-input`); if (!inp) return;
    inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: 'nearest' });
    const c = caret == null ? inp.value.length : caret; inp.setSelectionRange(c, c);
  }
  structural(focusId, caret) { this.render(focusId, caret); this.onChange?.(this.root, { structural: true }); }
  key(e, id, inp) {
    const path = findPath(this.root, id), n = path.at(-1), parent = path.at(-2);
    const sibs = parent ? parent.children : null, i = sibs ? sibs.indexOf(n) : -1;
    const rows = this.flat(), ri = rows.findIndex((r) => r.n.id === id);
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const m = node('');
      if (!parent) n.children.unshift(m);
      else if (inp.selectionStart === 0 && inp.value) sibs.splice(i, 0, m);
      else sibs.splice(i + 1, 0, m);
      this.structural(m.id);
    } else if (e.key === 'Tab' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const caret = inp.selectionStart;
      if (!e.shiftKey) { if (!parent || i <= 0) return this.nudge(inp); sibs.splice(i, 1); sibs[i - 1].children.push(n); }
      else { const gp = path.at(-3); if (!gp) return this.nudge(inp); sibs.splice(i, 1); const pi = gp.children.indexOf(parent); gp.children.splice(pi + 1, 0, n); }
      this.structural(id, caret);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault(); if (!parent) return;
      const j = e.key === 'ArrowUp' ? i - 1 : i + 1; if (j < 0 || j >= sibs.length) return this.nudge(inp);
      [sibs[i], sibs[j]] = [sibs[j], sibs[i]]; this.structural(id, inp.selectionStart);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); const r = rows[ri + (e.key === 'ArrowUp' ? -1 : 1)]; if (r) this.focus(r.n.id);
    } else if (e.key === 'Backspace' && !inp.value && parent && !n.children.length) {
      e.preventDefault(); sibs.splice(i, 1); this.structural(rows[ri - 1].n.id);
    }
  }
  nudge(inp) { inp.closest('.ol-row').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 160 }); }
  paste(e, id) {
    const t = e.clipboardData?.getData('text/plain') || ''; if (!t.includes('\n')) return;
    e.preventDefault();
    const sub = fromMarkdown('# x\n' + t.split('\n').filter((l) => l.trim()).map((l) => (/^\s*([-*+]|\d+\.)\s/.test(l) ? l : '- ' + l.trim())).join('\n'));
    const path = findPath(this.root, id), n = path.at(-1), parent = path.at(-2);
    if (!parent || !n.text) { (parent && !n.text ? parent.children : n.children).push(...sub.children); if (parent && !n.text) parent.children.splice(parent.children.indexOf(n), 1); }
    else { const sibs = parent.children; sibs.splice(sibs.indexOf(n) + 1, 0, ...sub.children); }
    this.structural(sub.children.at(-1)?.id || id);
  }
}
