// Text area router: one focused page per sub-tool (today's eight tools), reached via rail, chips and ⌘K.
import { mountShell, renderPageHeader, getLeaf, canonicalId, $ } from '../kit/shell.js';

const TOOLS = { 'json-formatter': 'tool-json.js', 'text-diff': 'tool-diff.js', 'regex-tester': 'tool-regex.js', 'word-count': 'tool-count.js',
  'case-converter': 'tool-case.js', 'text-cleanup': 'tool-cleanup.js', 'ascii-banner': 'tool-banner.js', 'image-to-ascii': 'tool-image.js' };
// one short line under each title (shorter than the registry blurb where that helps)
const LEDE = {
  'json-formatter': 'Format, validate and minify JSON.',
  'text-diff': 'Compare two texts and see every change.',
  'regex-tester': 'Test a regular expression with live matches.',
  'word-count': 'Words, characters, sentences and reading time.',
  'case-converter': 'UPPER, lower, Title, camelCase, snake_case and more.',
  'text-cleanup': 'Fix pasted text, find & replace, sort, remove duplicates.',
  'ascii-banner': 'Big letters from text, in 22 fonts.',
  'image-to-ascii': 'Turn a picture into ASCII art.',
};

const params = new URLSearchParams(location.search);
let id = canonicalId(params.get('leaf') || 'json-formatter');
if (!TOOLS[id]) id = 'json-formatter';
const leaf = getLeaf(id);
document.title = `${leaf.name} · Fernwork`;
document.documentElement.dataset.tool = id;

let tool = null; const pending = [];
const mod = await import(`./${TOOLS[id]}`);
const cfg = mod.config || {};
const shell = mountShell({ leaf: id, archetype: 'instant', accept: cfg.accept || ['text', 'data'], acceptLabel: leaf.name,
  onFiles: (files, meta) => (tool ? tool.onFiles?.(files, meta) : pending.push([files, meta])), onPasteText: (t) => tool?.onPasteText?.(t) ?? false, commands: cfg.commands || [] });
renderPageHeader($('#page-header'), { leaf, lede: LEDE[id] });
tool = await mod.mount($('#tool'), { leaf, params, shell });
pending.forEach(([f, m]) => tool.onFiles?.(f, m));
window.tx = tool;
