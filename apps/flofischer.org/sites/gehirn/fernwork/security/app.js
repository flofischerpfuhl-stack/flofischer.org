// Developer category · router. One page, one leaf per visit (?leaf=), chips under the H1 switch leaves.
import { mountShell, getLeaf, $, renderPageHeader } from '../kit/shell.js';

const params = new URLSearchParams(location.search);
const TOOL = {
  inspect: 'inspect', 'jwt-decoder': 'inspect', 'base64-decode': 'inspect',
  checksum: 'checksum', sha256: 'checksum',
  generate: 'generate', 'uuid-generator': 'generate', 'password-generator': 'generate',
  'keys-hmac': 'keys', time: 'time', 'unix-timestamp': 'time',
};
const leaf = getLeaf(params.get('leaf')) && TOOL[params.get('leaf')] ? getLeaf(params.get('leaf')) : getLeaf('inspect');
const tool = TOOL[leaf.id];
const here = (id) => `./?leaf=${id}`;
const routes = Object.fromEntries(Object.keys(TOOL).map((id) => [id, here(id)]));

const hooks = {};
const shell = mountShell({
  leaf: leaf.id,
  archetype: tool === 'checksum' ? 'queue' : 'instant',
  routes,
  accept: tool === 'checksum' || tool === 'inspect' ? ['*'] : undefined,
  acceptLabel: tool === 'checksum' ? 'Checksum' : 'Inspect',
  onFiles: (files, o) => (hooks.onFiles ? hooks.onFiles(files, o) : (hooks.pending ||= []).push([files, o])),
  onPasteText: (t) => hooks.onPaste?.(t) ?? false,
  dropActions: tool === 'checksum' || tool === 'inspect' ? undefined : () => [{ id: 'checksum', label: 'Checksum', sub: 'SHA-256 on this device, verify a download', icon: 'fingerprint', leaf: 'checksum' }],
  shortcuts: tool === 'generate' ? [{ label: 'New password / UUIDs', keys: 'r' }, { label: 'Copy result', keys: 'mod+shift+c' }] : tool === 'time' ? [{ label: 'Now', keys: 'n' }] : [],
  recent: params.get('q') ? { note: params.get('q').slice(0, 40) } : undefined,
});
document.title = `${leaf.name} · Fernwork`;
document.documentElement.dataset.tool = tool;
$('#page').classList.toggle('fw-page--wide', tool === 'inspect' || tool === 'time');

const ctx = { leaf, tool, params, hooks, shell, root: $('#tool'), header: $('#page-header'), renderHeader: (o) => renderPageHeader($('#page-header'), { leaf, ...o }) };
const mod = await import(`./${tool}.js`);
await mod.mount(ctx);
for (const [f, o] of hooks.pending || []) hooks.onFiles?.(f, o);
