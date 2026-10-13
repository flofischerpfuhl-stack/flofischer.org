// Utilities · five separate tools (today's structure), one focused page each: ?leaf=<id>[&q=<value>].
// QR Code Generator (+ Wi-Fi QR code) · QR Code Reader · URL Cleaner · Timestamp · Color Picker (+ Contrast checker).
import './lib/icons-extra.js';
import { mountShell, getLeaf, canonicalId, $, renderPageHeader, enhance } from '../kit/shell.js';

const params = new URLSearchParams(location.search);
const MOD = { 'qr-generator': 'qr-make', 'wifi-qr': 'qr-make', 'qr-reader': 'qr-read', 'url-cleaner': 'url', timestamp: 'time', 'color-picker': 'color', 'contrast-checker': 'color' };
let id = params.get('leaf') || '';
if (id === 'qr-code' && params.get('mode') === 'read') id = 'qr-reader';
id = MOD[id] ? id : canonicalId(id);
if (!MOD[id]) id = 'qr-generator';
const leaf = getLeaf(id);
const mod = MOD[id];
const routes = Object.fromEntries(Object.keys(MOD).map((k) => [k, `./?leaf=${k}`]));

const hooks = {};
const imagePage = mod === 'qr-read' || mod === 'color';
const shell = mountShell({
  leaf: leaf.id,
  archetype: 'instant',
  routes,
  accept: imagePage ? ['image'] : undefined,
  acceptLabel: mod === 'qr-read' ? 'QR Code Reader' : 'Color Picker · pick from image',
  onFiles: (files, o) => (hooks.onFiles ? hooks.onFiles(files, o) : (hooks.pending ||= []).push([files, o])),
  onPasteText: (t) => hooks.onPaste?.(t) ?? false,
  dropActions: imagePage ? undefined : (sum) => (sum.kinds?.includes?.('image') || sum.kind === 'image' ? [{ id: 'qr-read', label: 'Read QR code', sub: 'Utilities · QR Code Reader', icon: 'scan-line', leaf: 'qr-reader' }] : []),
  shortcuts: mod === 'qr-make' ? [{ label: 'Download PNG', keys: 'mod+s' }]
    : mod === 'color' ? [{ label: 'Copy HEX', keys: 'mod+shift+c' }, { label: 'Pick from screen', keys: 'i' }]
      : mod === 'time' ? [{ label: 'Set to now', keys: 'n' }, { label: 'Copy main result', keys: 'mod+shift+c' }]
        : mod === 'url' ? [{ label: 'Copy clean link', keys: 'mod+shift+c' }] : [],
  recent: params.get('q') ? { note: params.get('q').slice(0, 40) } : undefined,
});
document.title = `${leaf.name} · Fernwork`;
document.documentElement.dataset.tool = mod;

const ctx = {
  leaf, id, params, hooks, shell, root: $('#tool'),
  renderHeader: (o = {}) => { renderPageHeader($('#page-header'), { leaf, ...o }); enhance($('#page-header')); },
  mbar: {
    set({ line = '', sub = '', actions = '' } = {}) {
      $('#mbar').hidden = !line && !actions; $('#mbar-line').textContent = line; $('#mbar-sub').textContent = sub; $('#mbar-sub').hidden = !sub;
      $('#mbar-actions').innerHTML = actions; enhance($('#mbar-actions'));
      document.body.style.setProperty('--toast-offset', $('#mbar').hidden ? '0px' : '76px');
      return $('#mbar-actions');
    },
    hide() { $('#mbar').hidden = true; document.body.style.removeProperty('--toast-offset'); },
  },
};
const m = await import(`./tool-${mod}.js`);
await m.mount(ctx);
for (const [f, o] of hooks.pending || []) hooks.onFiles?.(f, o);
