// Security area router: today's seven tools, one focused page each, reached via the rail, the sub-tool chips and ⌘K.
import { mountShell, renderPageHeader, getLeaf, canonicalId, hrefFor, $ } from '../kit/shell.js';

const TOOLS = {
  'hash-generator': 'tool-hash.js', 'sha256-checksum': 'tool-hash.js',
  'encode-decode': 'tool-encode.js', 'base64-decode': 'tool-encode.js',
  'hmac-kdf': 'tool-hmac.js', 'text-encryption': 'tool-encrypt.js', 'password-generator': 'tool-password.js',
  'uuid-generator': 'tool-uuid.js', 'jwt-decoder': 'tool-jwt.js',
};
// one short line under each title
const LEDE = {
  'hash-generator': 'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 for text and files.',
  'sha256-checksum': 'Check a download against its published checksum.',
  'encode-decode': 'Base64, URL, hex, binary and HTML entities, both ways.',
  'base64-decode': 'Decode Base64 to text or a file, or encode it.',
  'hmac-kdf': 'HMAC signatures and key derivation with PBKDF2 and HKDF.',
  'text-encryption': 'Encrypt text with a password and decrypt it again.',
  'password-generator': 'Strong random passwords and passphrases.',
  'uuid-generator': 'UUID v4, v7 and v1, one or thousands at once. Check any UUID.',
  'jwt-decoder': 'Decode a JSON Web Token, check its expiry and verify the signature.',
};

const params = new URLSearchParams(location.search);
let id = canonicalId(params.get('leaf') || 'hash-generator');
const known = getLeaf(id);
if (known && !TOOLS[id] && known.area && known.area !== 'security') location.replace(hrefFor(id, params.get('q') ? { q: params.get('q') } : {}));
if (!TOOLS[id]) id = 'hash-generator';
const leaf = getLeaf(id);
document.title = `${leaf.name} · Fernwork`;
document.documentElement.dataset.tool = TOOLS[id].replace(/^tool-|\.js$/g, '');

let tool = null; const pending = [];
const mod = await import(`./${TOOLS[id]}`);
const cfg = mod.config || {};
const shell = mountShell({
  leaf: id, archetype: 'instant',
  accept: cfg.accept, acceptLabel: leaf.name,
  onFiles: (files, meta) => (tool ? tool.onFiles?.(files, meta) : pending.push([files, meta])),
  onPasteText: (t) => tool?.onPasteText?.(t) ?? false,
  commands: cfg.commands || [], shortcuts: cfg.shortcuts || [],
  recent: params.get('q') ? { note: params.get('q').slice(0, 40) } : undefined,
});
renderPageHeader($('#page-header'), { leaf, lede: LEDE[id] });
tool = await mod.mount($('#tool'), { leaf, id, params, shell });
pending.forEach(([f, m]) => tool.onFiles?.(f, m));
window.sec = tool;
