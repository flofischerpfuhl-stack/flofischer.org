// Open · fallback views: plain text (with line numbers) and hex. Used for "Open as …" and unknown files.
import { formatBytes } from '../../kit/shell.js';

function isBinary(bytes) { let bad = 0; const n = Math.min(bytes.length, 4096); for (let i = 0; i < n; i++) { const c = bytes[i]; if (c === 0 || (c < 9) || (c > 13 && c < 32)) bad++; } return n && bad / n > 0.1; }

export const TEXT = {
  id: 'text', label: 'Text', asLabel: 'text', icon: 'file-text', exts: ['txt', 'log', 'csv', 'json', 'xml', 'ini', 'yaml', 'yml'],
  selHint: 'Select text to see its length.', measureLabel: 'Counts', measureIcon: 'sigma',
  steps(d) { return [{ label: `Reading ${formatBytes(d.size)}`, ms: 220, run: async () => { d.bytes = new Uint8Array(await d.file.arrayBuffer()); d.binary = isBinary(d.bytes); d.textBody = new TextDecoder('utf-8', { fatal: false }).decode(d.bytes.slice(0, 2e6)); } }]; },
  mount(d, el, ctx) {
    el.classList.add('tx');
    if (d.binary) {
      const zeros = d.bytes.every((b) => b === 0);
      el.innerHTML = `<div class="tx-note fw-alert fw-alert--info">${ctx.icon('info')}<div class="fw-alert__body">This file is binary${zeros ? `: all ${d.bytes.length} bytes are zero, so it is probably an unfinished download or an empty placeholder` : ''}. Showing it as hex instead.</div></div>${hexHtml(d.bytes, ctx)}`;
      return {};
    }
    const lines = d.textBody.split('\n');
    el.innerHTML = `<div class="tx-wrap"><pre class="tx-pre" tabindex="0" aria-label="${ctx.esc(d.name)} as text">${lines.map((l, i) => `<span class="tx-line"><span class="tx-ln" aria-hidden="true">${i + 1}</span>${ctx.esc(l) || ' '}</span>`).join('')}</pre></div>`;
    return {};
  },
  inspector(d, ctx) {
    const t = d.textBody || '';
    return { info: ctx.kv([['File', ctx.esc(d.name)], ['Size', formatBytes(d.size)], ['Looks like', d.binary ? 'Binary data' : 'Plain text · UTF-8']]),
      selection: null, measure: d.binary ? ctx.kv([['Bytes', ctx.nf(d.bytes.length)]]) : ctx.kv([['Lines', ctx.nf(t.split('\n').length)], ['Words', ctx.nf((t.match(/\S+/g) || []).length)], ['Characters', ctx.nf(t.length)]]) };
  },
  status(d) { return [d.binary ? 'Hex view' : 'Plain text', formatBytes(d.size)]; },
  exports(d, ctx) { return [{ group: 'Data', items: [{ label: 'Copy all text', icon: 'copy', file: 'Clipboard', onSelect: () => { ctx.copyText(d.textBody); ctx.toast('Copied the whole file'); } }] }]; },
  mobileSlots() { return [{ id: 'info', label: 'Info', icon: 'info' }, { id: 'measure', label: 'Counts', icon: 'sigma' }, { id: 'find', label: 'Open as', icon: 'replace', run: (d, ctx, b) => ctx.openAs(d, 'hex') }, { id: 'export', label: 'Export', icon: 'download' }]; },
};
export const HEX = {
  id: 'hex', label: 'Hex', asLabel: 'hex', icon: 'binary', exts: [], hidden: false,
  steps: TEXT.steps,
  mount(d, el, ctx) { el.classList.add('tx'); el.innerHTML = hexHtml(d.bytes, ctx); return {}; },
  inspector: TEXT.inspector,
  status(d) { return ['Hex view', formatBytes(d.size)]; },
  exports: () => [],
};
function hexHtml(bytes, ctx) {
  const rows = []; const n = Math.min(bytes.length, 4096);
  for (let o = 0; o < n; o += 16) {
    const chunk = [...bytes.slice(o, o + 16)];
    rows.push(`<span class="tx-hexrow"><span class="tx-ln">${o.toString(16).padStart(8, '0')}</span><span class="tx-hex">${chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ')}</span><span class="tx-ascii">${ctx.esc(chunk.map((b) => (b > 31 && b < 127 ? String.fromCharCode(b) : '·')).join(''))}</span></span>`);
  }
  return `<div class="tx-wrap"><pre class="tx-pre tx-pre--hex" tabindex="0" aria-label="Hex view">${rows.join('')}</pre></div>`;
}
