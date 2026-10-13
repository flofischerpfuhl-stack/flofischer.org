// Share + Color · one app, one leaf per URL (?leaf=), sub-tool chips under the H1.
import './lib/icons-extra.js';
import { mountShell, getLeaf, $, $$, renderPageHeader, enhance } from '../kit/shell.js';
import { cleanLink } from './lib/rules.js';

const params = new URLSearchParams(location.search);
const TOOL = { 'clean-link': 'clean', 'qr-code': 'qr', 'wifi-qr': 'qr', seal: 'seal', 'pick-color': 'color', contrast: 'color', palette: 'color' };
let id = params.get('leaf');
if (/^#FWENC1/.test(location.hash) && !TOOL[id]) id = 'seal';
if (!TOOL[id]) id = 'clean-link';
const leaf = getLeaf(id);
const tool = TOOL[id];
const routes = Object.fromEntries(Object.keys(TOOL).map((k) => [k, `./?leaf=${k}`]));

const hooks = {};
const accept = tool === 'qr' || tool === 'color' ? ['image'] : undefined;
const shell = mountShell({
  leaf: leaf.id,
  archetype: 'instant',
  routes,
  accept,
  acceptLabel: tool === 'qr' ? 'QR code · read' : 'Color · pick from image',
  onFiles: (files, o) => (hooks.onFiles ? hooks.onFiles(files, o) : (hooks.pending ||= []).push([files, o])),
  onPasteText: (t) => hooks.onPaste?.(t) ?? false,
  dropActions: tool === 'qr' || tool === 'color' ? undefined : (sum) => (sum.kinds?.includes?.('image') || sum.kind === 'image' ? [{ id: 'qr-read', label: 'Read QR code', sub: 'Find codes in this image', icon: 'scan-line', leaf: 'qr-code' }] : []),
  shortcuts: tool === 'color' ? [{ label: 'New palette (unlocked colours)', keys: 'space' }, { label: 'Copy HEX', keys: 'mod+shift+c' }, { label: 'Pick from screen', keys: 'i' }]
    : tool === 'qr' ? [{ label: 'Download PNG', keys: 'mod+s' }, { label: 'Make / Read', keys: 'mod+shift+m' }] : [{ label: 'Copy result', keys: 'mod+shift+c' }],
  recent: params.get('q') ? { note: params.get('q').slice(0, 40) } : undefined,
});
document.title = `${leaf.name} · Fernwork`;
document.documentElement.dataset.tool = tool;
$('#page').classList.toggle('fw-page--wide', tool === 'color' || tool === 'qr');

const ctx = {
  leaf, tool, params, hooks, shell, root: $('#tool'), header: $('#page-header'),
  renderHeader: (o = {}) => { renderPageHeader($('#page-header'), { leaf: o.leaf || ctx.leaf, ...o }); enhance($('#page-header')); },
  mbar: {
    set({ line = '', sub = '', actions = '' } = {}) { $('#mbar').hidden = !line && !actions; $('#mbar-line').textContent = line; $('#mbar-sub').textContent = sub; $('#mbar-sub').hidden = !sub; $('#mbar-actions').innerHTML = actions; enhance($('#mbar-actions')); document.body.style.setProperty('--toast-offset', $('#mbar').hidden ? '0px' : '76px'); return $('#mbar-actions'); },
    hide() { $('#mbar').hidden = true; document.body.style.removeProperty('--toast-offset'); },
  },
};
const mod = await import(`./ui-${tool}.js`);
await mod.mount(ctx);
for (const [f, o] of hooks.pending || []) hooks.onFiles?.(f, o);

// In-place leaf switching inside one workspace (Color chips): URL updates, state stays.
document.addEventListener('click', (e) => {
  const a = e.target.closest('.fw-subchips a[data-leaf]');
  if (!a || !hooks.switchLeaf || e.metaKey || e.ctrlKey) return;
  const next = getLeaf(a.dataset.leaf); if (!next || TOOL[next.id] !== tool) return;
  e.preventDefault();
  const u = new URL(location.href); u.searchParams.set('leaf', next.id); history.pushState({ leaf: next.id }, '', u);
  ctx.leaf = next; document.title = `${next.name} · Fernwork`; hooks.switchLeaf(next);
});
window.addEventListener('popstate', () => { const n = getLeaf(new URLSearchParams(location.search).get('leaf')); if (n && TOOL[n.id] === tool && hooks.switchLeaf) { ctx.leaf = n; document.title = `${n.name} · Fernwork`; hooks.switchLeaf(n); } });

// ⌘K: the command bar's link detector counts trackers with the real ruleset (kit uses a short list; see report).
const fixCmd = () => {
  const inp = $('.fw-cmd__input'); if (!inp) return;
  const v = inp.value.trim(); if (!/^(https?:\/\/|www\.)\S+$/i.test(v)) return;
  const r = cleanLink(v); if (!r.ok) return;
  const n = r.removedCount; const T = `${n} tracker${n === 1 ? '' : 's'}`;
  const grp = $$('.fw-cmd__group').find((g) => g.textContent.startsWith('Detected · Link'));
  const want = `Detected · ${n ? `Link with ${T}` : 'Link'} · ${r.host.replace(/^www\./, '')}${r.unwrapped ? ' (redirect)' : ''}`;
  if (grp && grp.textContent !== want) grp.textContent = want;
  const item = $('.fw-cmd__item[data-leaf-id="clean-link"]');
  if (item) {
    const name = $('.fw-cmd__name', item), meta = $('.fw-cmd__meta', item);
    const nm = r.short ? 'Clean link (short link)' : n ? `Clean link (${T})` : 'Clean link';
    const mt = r.short ? 'Can’t expand offline: open it once, paste the full link' : n ? `${r.lenBefore} → ${r.lenAfter} characters${r.unwrapped ? ' · redirect unwrapped' : ''}` : 'No trackers we know of';
    if (name.textContent !== nm) name.textContent = nm;
    if (meta.textContent !== mt) meta.textContent = mt;
  }
};
new MutationObserver(fixCmd).observe(document.body, { childList: true, subtree: true });
