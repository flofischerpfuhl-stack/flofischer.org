/**
 * Fernwork — Navigation entry point used by every page.
 *
 * Fernwork One: the page chrome (app bar, ToolSwitcher, ⌘K tool search, Recent, theme, ⋯ menu, icon rail with
 * flyouts, mobile switcher sheet, page header with sub-tool chips) is the kit shell in assets/kit/shell.js. This
 * module keeps the public API the pages already call:
 *
 *   initNav()          mount the shell for the current URL (call once, early)
 *   setupTabs(config)  today's #hash tab switching (back/forward and deep links keep working)
 *   getRecentlyUsed()  the legacy per-page recent list (`fernwork_recent`)
 *   getNavItems()      the category/sub-tool table below (ids, labels, pages, hashes, icon markup)
 */

import { showCookieBanner } from './consent-notice.js';
import { initInstallPrompt, installAvailable, triggerInstall } from './install-prompt.js';
import { icon } from './icons.js';
import { installGlobalFilePaste } from './file-paste.js';
import { mountShell, setCurrentLeaf, leafForLocation, getLeaf, addMoreItems, setInstallApi, currentLeaf } from './kit/shell.js';

// ─── Tool Definitions (today's information architecture; mirrored by assets/kit/registry.js) ───
const TOOLS = [
  {
    id: 'converters', label: 'Convert', page: 'converters.html', icon: icon('shuffle'),
    subs: [
      { id: 'image', label: 'Images', hash: '#image' },
      { id: 'video', label: 'Video', hash: '#video' },
      { id: 'audio', label: 'Audio', hash: '#audio' },
      { id: 'data', label: 'Data', hash: '#data' },
      { id: 'table-convert', label: 'Tables', hash: '#table-convert' },
      { id: 'documents', label: 'Documents', hash: '#documents' }
    ]
  },
  { id: 'pdf-tools', label: 'PDF Tools', page: 'pdf-tools.html', icon: icon('file-text'), subs: [] },
  { id: 'image-tools', label: 'Image Tools', page: 'image-tools.html', icon: icon('image'), subs: [] },
  {
    id: 'viewers', label: 'Viewers', page: 'viewers.html', icon: icon('eye'),
    subs: [
      { id: 'markdown', label: 'Markdown', hash: '#markdown' },
      { id: 'svg', label: 'SVG', hash: '#svg' },
      { id: 'table', label: 'Tables / Sheets', hash: '#table' },
      { id: 'docx', label: 'Documents', hash: '#docx' },
      { id: 'pptx', label: 'PowerPoint (PPTX)', hash: '#pptx' },
      { id: 'dxf', label: 'DXF Drawing', hash: '#dxf' },
      { id: 'pointcloud', label: 'Point Cloud', hash: '#pointcloud' },
      { id: 'shape', label: 'Shapefile', hash: '#shape' },
      { id: 'ifc', label: 'IFC Model', hash: '#ifc' },
      { id: 'stl', label: 'STL / OBJ', hash: '#stl' },
      { id: 'database', label: 'Database', hash: '#database' }
    ]
  },
  {
    id: 'unit-converter', label: 'Units', page: 'unit-converter.html', icon: icon('boxes'),
    subs: [
      { id: 'length', label: 'Length', hash: '#length' },
      { id: 'area', label: 'Area', hash: '#area' },
      { id: 'volume', label: 'Volume', hash: '#volume' },
      { id: 'weight', label: 'Weight', hash: '#weight' },
      { id: 'temperature', label: 'Temperature', hash: '#temperature' },
      { id: 'speed', label: 'Speed', hash: '#speed' },
      { id: 'time', label: 'Time', hash: '#time' },
      { id: 'pressure', label: 'Pressure', hash: '#pressure' },
      { id: 'energy', label: 'Energy', hash: '#energy' },
      { id: 'power', label: 'Power', hash: '#power' },
      { id: 'data', label: 'Data', hash: '#data' },
      { id: 'angle', label: 'Angle & Slope', hash: '#angle' },
      { id: 'frequency', label: 'Frequency', hash: '#frequency' },
      { id: 'fuel', label: 'Fuel Economy', hash: '#fuel' }
    ]
  },
  {
    id: 'calculator', label: 'Calculator', page: 'calculator.html', icon: icon('calculator'),
    subs: [
      { id: 'calculate', label: 'Calculate', hash: '#calculate' },
      { id: 'graph', label: 'Grapher', hash: '#graph' }
    ]
  },
  {
    id: 'text-tools', label: 'Text', page: 'text-tools.html', icon: icon('type'),
    subs: [
      { id: 'json', label: 'JSON Formatter', hash: '#json' },
      { id: 'diff', label: 'Text Diff', hash: '#diff' },
      { id: 'regex', label: 'Regex Tester', hash: '#regex' },
      { id: 'wordcount', label: 'Word Count', hash: '#wordcount' },
      { id: 'case', label: 'Case Converter', hash: '#case' },
      { id: 'cleanup', label: 'Text Cleanup', hash: '#cleanup' },
      { id: 'ascii-banner', label: 'ASCII Banner', hash: '#ascii-banner' },
      { id: 'image-ascii', label: 'Image to ASCII', hash: '#image-ascii' }
    ]
  },
  {
    id: 'crypto', label: 'Security', page: 'crypto.html', icon: icon('lock'),
    subs: [
      { id: 'hash', label: 'Hash Generator', hash: '#hash' },
      { id: 'encode', label: 'Encode / Decode', hash: '#encode' },
      { id: 'kdf', label: 'HMAC / KDF', hash: '#kdf' },
      { id: 'encrypt', label: 'Text Encryption', hash: '#encrypt' },
      { id: 'password', label: 'Password Generator', hash: '#password' },
      { id: 'uuid', label: 'UUID Generator', hash: '#uuid' },
      { id: 'jwt', label: 'JWT Decoder', hash: '#jwt' }
    ]
  },
  {
    id: 'utilities', label: 'Utilities', page: 'utilities.html', icon: icon('wrench'),
    subs: [
      { id: 'qr-generate', label: 'QR Code Generator', hash: '#qr-generate' },
      { id: 'qr-scan', label: 'QR Code Reader', hash: '#qr-scan' },
      { id: 'url-cleaner', label: 'URL Cleaner', hash: '#url-cleaner' },
      { id: 'timestamp', label: 'Timestamp', hash: '#timestamp' },
      { id: 'color', label: 'Color Picker', hash: '#color' }
    ]
  },
  {
    id: 'canvas', label: 'Canvas', page: 'canvas.html', icon: icon('pen-tool'),
    subs: [
      { id: 'draw', label: 'Draw', hash: '#draw' },
      { id: 'mindmap', label: 'Mind Map', hash: '#mindmap' },
      { id: 'mermaid', label: 'Mermaid', hash: '#mermaid' }
    ]
  },
  {
    id: 'games', label: 'Games', page: 'games.html', icon: icon('gamepad-2'),
    subs: [
      { id: 'fern-rangers', label: 'Fern Rangers', hash: '#fern-rangers' },
      { id: 'pips-tower', label: 'Pip’s Tower', hash: '#pips-tower' },
      { id: 'momo', label: 'Momo’s Last Stand', hash: '#momo' }
    ]
  }
];

// ─── Current page ───────────────────────────────────────────────────
// Cloudflare strips `.html` (307 from `/tools/viewers.html` → `/tools/viewers`), so match both forms.
function pageSlug() {
  const last = window.location.pathname.split('/').pop() || '';
  return last.replace(/\.html$/, '');
}

function getCurrentTool() {
  const override = window.__fernworkNavParent;
  if (override) {
    const forced = TOOLS.find((tool) => tool.id === override);
    if (forced) return forced;
  }
  const slug = pageSlug();
  return TOOLS.find((tool) => tool.page.replace(/\.html$/, '') === slug) || null;
}

function isHomePage() {
  const slug = pageSlug();
  return !window.location.pathname.includes('/tools/') && !window.location.pathname.includes('/legal/') && (!slug || slug === 'index');
}

function currentLeaf_() {
  return leafForLocation(window.location.pathname, window.location.hash);
}

// ─── Initialize Navigation ─────────────────────────────────────────
let navMounted = false;
export function initNav() {
  if (navMounted) return;
  navMounted = true;
  installGlobalFilePaste();
  const home = isHomePage();
  const legal = window.location.pathname.includes('/legal/');
  const notFound = document.body.classList.contains('fw-404');
  const tool = getCurrentTool();
  const leaf = currentLeaf_();
  // The category pages (one #hash tab per sub-tool) render the page header into their `.page-header`.
  const headerHost = tool && tool.subs.length && document.querySelector('.page-header #breadcrumb')
    ? document.querySelector('.page-header')
    : null;

  mountShell({
    leaf,
    archetype: home ? 'home' : legal || notFound ? 'doc' : 'tool',
    pageHeader: headerHost,
    // Workbench-like category pages keep their stage tall: one-row header (title + chips), no description line.
    compactHeader: Boolean(tool && ['viewers', 'calculator', 'canvas', 'games'].includes(tool.id)),
    // The PDF editor keeps today's full-width workbench geometry (its engine specs are pixel-bound to it);
    // navigation there is the app-bar ToolSwitcher and ⌘K. Its SEO landing pages keep the rail.
    rail: !(tool && tool.id === 'pdf-tools'),
    footer: home,
    dropChooser: home,
    searchInput: home ? '#home-search' : notFound ? '#nf-search' : null,
  });

  // PDF workspace actions live in the ⋯ menu on the PDF Tools page (they act on the open PDF editor).
  addMoreItems(() => {
    if (!document.body.classList.contains('oo-pdf-workbench-route') && !document.querySelector('.oo-pdf-shell, #pdf-workbench-root')) return [];
    return [{ group: 'PDF workspace', items: [
      ...(document.querySelector('.oo-pdf-shell') ? [{
        label: 'Save PDF workspace', icon: 'save', id: 'oo-save-pdf-workspace',
        onSelect: () => window.dispatchEvent(new Event('oo-save-pdf-workspace')),
      }] : []),
      {
        label: 'Reset PDF workspace', icon: 'rotate-ccw', id: 'oo-reset-pdf-workspace', danger: true,
        onSelect: () => {
          if (window.confirm('Reset the PDF workspace? This closes every open PDF and discards saved recovery changes.')) {
            window.dispatchEvent(new Event('oo-reset-pdf-workspace'));
          }
        },
      },
    ] }];
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (tool) activateTabContent(hash);
    // Only real sub-tool hashes change the current tool (e.g. not #main or an in-page anchor).
    const next = leafForLocation(window.location.pathname, window.location.hash, { strict: true });
    if (next && next.kind === 'tool' && next !== currentLeaf()) setCurrentLeaf(next);
  });

  trackRecentlyUsed();
  showCookieBanner();
  initInstallPrompt();
  setInstallApi({ available: installAvailable, trigger: triggerInstall });
}

function activateTabContent(tabId) {
  if (!tabId || !document.getElementById(`tab-${tabId}`)) return;
  document.querySelectorAll('.tab-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

/**
 * Hash-based tab switching for the category pages. The rail, its flyouts and the sub-tool chips are plain links to
 * `#<tab>`; this keeps the visible panel, the <title> and the shell's current sub-tool in sync with the hash
 * (rail/chip click, back button, direct URL edit).
 */
export function setupTabs(config) {
  // `home`: an optional landing view for the bare page URL (no hash, not listed as a tab or in the sidebar)
  const { containerId, pageTitle, tabs, onChange, showInlineTabs = false, home = null } = config;
  const views = home ? [home, ...tabs] : tabs;

  const container = document.getElementById(containerId);
  if (container) {
    if (showInlineTabs) {
      container.style.display = '';
      container.setAttribute('role', 'tablist');
      container.innerHTML = tabs.map(tab => `
        <button type="button" class="tab-btn" role="tab" data-tab="${tab.id}">${tab.label}</button>
      `).join('');
      container.addEventListener('click', (event) => {
        const button = event.target.closest('.tab-btn[data-tab]');
        if (!button) return;
        window.location.hash = button.dataset.tab;
      });
    } else {
      container.style.display = 'none';
      container.removeAttribute('role');
    }
  }

  const hash = window.location.hash.replace('#', '');
  const activeTab = views.find(t => t.id === hash) ? hash : (home ? home.id : tabs[0].id);

  function activateTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });

    if (container && showInlineTabs) {
      container.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tabId);
        button.setAttribute('aria-selected', String(button.dataset.tab === tabId));
      });
    }

    const tabDef = views.find(t => t.id === tabId);
    const label = tabDef ? tabDef.label : tabId;
    document.title = home && tabId === home.id ? `${pageTitle} | Fernwork` : `${label} — ${pageTitle} | Fernwork`;
    if (home && tabId === home.id) {
      // the landing view is the category itself: no sub-tool is current (the registry would default to the first)
      document.querySelectorAll('.fw-rail__leaf[aria-current], .fw-rail-flyout__leaf[aria-current], .fw-subchips .fw-chip[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
    } else {
      const leaf = leafForLocation(window.location.pathname, '#' + tabId);
      if (leaf && leaf.kind === 'tool') setCurrentLeaf(leaf);
    }

    if (onChange) onChange(tabId);
  }

  activateTab(activeTab);

  if (!hash && !home) {
    window.location.hash = activeTab;
  }

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (!h) { if (home) activateTab(home.id); return; }
    if (!views.find(t => t.id === h)) return;
    activateTab(h);
  });

  return activeTab;
}

function trackRecentlyUsed() {
  // Normalize the trailing slug to `<name>.html` so the comparison matches the TOOLS table regardless of whether
  // the host strips the extension (Cloudflare does by default).
  const last = window.location.pathname.split('/').pop() || '';
  if (!last) return;
  const page = /\.html$/.test(last) ? last : last + '.html';
  if (page === 'index.html' || page === '404.html' || window.location.pathname.includes('/legal/')) return;

  const key = 'fernwork_recent';
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  if (!Array.isArray(recent)) recent = [];

  recent = recent.filter(r => r.page !== page);

  let label = page.replace('.html', '').replace(/-/g, ' ');
  label = label.charAt(0).toUpperCase() + label.slice(1);
  for (const tool of TOOLS) {
    if (tool.page === page) { label = tool.label; break; }
  }

  recent.unshift({ page, label, time: Date.now() });
  recent = recent.slice(0, 8);

  try { localStorage.setItem(key, JSON.stringify(recent)); } catch {}
}

export function getRecentlyUsed() {
  try { return JSON.parse(localStorage.getItem('fernwork_recent') || '[]'); } catch { return []; }
}

export function getNavItems() { return TOOLS; }
