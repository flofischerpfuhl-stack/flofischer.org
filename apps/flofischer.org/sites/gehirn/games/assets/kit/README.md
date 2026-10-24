# Fernwork One kit (real site)

The shell, tokens and shared components for every page of fernwork.net. Area agents restyle tool bodies on top of
this; tool engines (parsers, renderers, workers, exports, persistence) stay as they are.

Visual reference: the mockups in `/home/flo/AgentWork/fernwork-ux/mockups/` (look only — never port mockup engine
code). Binding rules: `design/REVIEW-1.md` > `design/DESIGN.md`.

## 1. Files

| File | What |
|---|---|
| `tokens.css` | Design tokens (DESIGN §6), light + dark via `[data-theme]` on `<html>` (set by `assets/theme.js`) or any subtree. Geist Mono `@font-face`. |
| `components.css` | Every kit component (`fw-` prefix), the shell layout, home/404/legal pages, progress overlay. Loaded **after** `assets/style.css`. |
| `shell.js` | `mountShell()` and every shell behaviour/helper (overlays, toasts, search, rail, Recent, theme…). |
| `registry.js` | Categories and leaves = today's `assets/nav.js` TOOLS + the SEO pages under `tools/*.html`. Real URLs only. |
| `icons.js` | Lucide subset (ISC, `LICENSE-lucide.txt`), stroke 1.75: `icon(name, { size })`, `<span data-icon="name">`. |
| `files.js` | `fileKind()`, `summarize()`, `actionsFor()` (home file chooser), `handoff()/consumeHandoff()`, `formatBytes()`. |
| `progress.js` | G3 helper: `showProgress()`, `withProgress()`, `spinnerHtml()`. |
| `stable-resize.js` | G1 helper: `stableResize()` keeps the last frame during continuous resizes, redraws once settled. |

Every page head loads, in this order:
```html
<script src="../assets/theme.js?v=…"></script>                  <!-- theme before first paint (key `oo-theme`) -->
<link rel="stylesheet" href="../assets/kit/tokens.css?v=…">
<link rel="stylesheet" href="../assets/style.css?v=…">           <!-- legacy classes, mapped onto the tokens -->
<link rel="stylesheet" href="../assets/kit/components.css?v=…">
```
New pages must do the same. `assets/kit/*` is precached by `sw.js` (bump `CACHE_VERSION` when you add files).

## 2. How a page gets the shell

Nothing changes for pages: they keep calling `initNav()` (and `setupTabs()` on category pages) from
`assets/nav.js`. `initNav()` derives the current leaf from the URL (`leafForLocation(path, hash)`), then calls
`mountShell()`, which wraps the page like this (tool CSS that targets these wrappers keeps working):

```
body.fw-shell
  a.fw-skip                     "Skip to tool"
  header.fw-appbar              brand · ToolSwitcher (#fw-switcher) · ⌘K pill (#fw-cmdpill) · Recent (#fw-recent) · theme (#fw-theme-toggle) · ⋯ (#fw-more)
  div.app-container.fw-body
    nav.fw-rail                 categories; pinned open (≥1280 px, remembered `fw:rail-pinned`) lists the current category's sub-tools
    main.main-content#main      the page's own <main> (unchanged)
```

- App bar height is **56 px** on all widths (`--appbar-h`; the mockups used 48). The PDF Tools and Image Tools
  bundles position their chrome against a 56 px site header (`calc(100dvh - 56px)`, `top: 56px`…). When you
  migrate those bundles to `var(--appbar-h)` you may lower it.
- Rail: Image Tools and Canvas start collapsed (56 px, flyouts on hover/→); other pages are open on ≥1280 px
  unless the user collapsed it. Hidden < 768 px (the ToolSwitcher sheet replaces it), and on Image Tools < 1024 px.
  **The PDF Tools editor page has no rail** (`mountShell({ rail: false })` from nav.js): its engine specs (drag and
  nudge rasters, export oracles) are bound to today's full-width canvas. Add it back only after re-running the PDF suite.
- Viewers, Calculator and Canvas use the compact page header (one row: title + chips, no description line) so
  their stage keeps its height.
- Mobile (< 768 px): brand mark · ToolSwitcher (bottom sheet with search, Recent and all tools) · search · ⋯.
- Global keys: Ctrl/Cmd+K (command bar, toggles), and — only while focus is on the page itself or the shell
  chrome, and never on PDF/Image Tools/Canvas/Viewers — `/` (search), `?` (shortcuts), `g h` (home). The handler runs
  on `window` in the bubble phase: if your tool handles a key and calls `preventDefault()`, the shell ignores it
  (Excalidraw's Ctrl+K and `?` keep working).

### Page header and sub-tool chips

Category pages with a `.page-header #breadcrumb` get the kit page header rendered into `.page-header`: the current
sub-tool name (`#fw-page-title`, styled H1 — the static SEO `<h1>` stays), one line (`desc` from the registry) and
the sub-tool chips (`nav.fw-subchips > a.fw-chip[aria-current=page]`). Chips are hidden while the rail is pinned
open (the rail lists the same sub-tools). Rail leaves, flyout links, chips and the switcher are plain links to
`#<tab>`, so `setupTabs()` handles them like any hash change (back/forward, deep links). On a hash change
`setCurrentLeaf()` updates rail, chips, title, switcher label and Recent.

Want a different header? Render your own and call `renderPageHeader(el, { title, lede, chips })` or skip it; to
change the current sub-tool from code call `setCurrentLeaf('regex-tester')`.

### Registry ids (use these, not mockup ids)

Tools (`kind: 'tool'`, one per today's `#hash` tab): `convert-images|video|audio|data|tables|documents`, `pdf-tools`,
`image-tools`, `viewer-markdown|svg|table|documents|pptx|dxf|pointcloud|shapefile|ifc|stl|database`,
`units-length` … `units-fuel` (14), `calculator` (#calculate), `grapher` (#graph), `json-formatter`, `text-diff`,
`regex-tester`, `word-count`, `case-converter`, `text-cleanup`, `ascii-banner`, `image-to-ascii`, `hash-generator`,
`encode-decode`, `hmac-kdf`, `text-encryption`, `password-generator`, `uuid-generator`, `jwt-decoder`, `qr-generator`,
`qr-reader`, `url-cleaner`, `timestamp`, `color-picker`, `draw`, `mind-map`, `mermaid`.

Presets (`kind: 'preset'`) = the SEO pages that exist: `heic-to-jpg`, `jpeg-to-png`, … (all conversion intents),
`edit-pdf` → `tools/pdf-edit`, `merge-pdf`, `split-pdf`, `compress-pdf`, `sign-pdf`, `ocr-pdf`, `redact-pdf`,
`csv-viewer`, `xlsx-viewer`, `ods-viewer`, `docx-viewer`, `odt-viewer`, `rtf-viewer`, `pptx-viewer`, `stl-viewer`,
`sqlite-viewer`, `parquet-viewer`, `arrow-viewer`, plus search-only overview pages (`image-converter`, …). A preset's
`open` names the working tool when its page is only a landing card. Units pairs (lbs→kg …) are synonyms of the
category tools until real pair pages exist; add a preset only together with its page. Mockup ids resolve via
`ALIASES`.

If you add a page or a tab: add it to `assets/nav.js` TOOLS **and** `registry.js`, plus `sitemap.xml`.

## 3. Shell API (`import … from '../assets/kit/shell.js'`)

Overlays (top layer, one Escape stack, focus return, `aria-expanded` sync):
- `openPopover(anchor, content, { placement, className, width, label, onClose })` → `{ el, close, reposition, closed }`.
  **Calling it again for the same anchor while open closes it** (G4 toggle). Outside click / Escape / focus leaving close.
- `openMenu(anchor, items | groups, { label, placement })` — items `{ label, icon, kbd, hint, checked, danger, href, external, id, onSelect }`; arrows, Home/End, typeahead; toggles like `openPopover`. Use it for export menus.
- `isOpenFor(anchor)` — true while that anchor's popover/menu is open.
- `openDialog({ title, body, actions, size, sheetOnMobile, initialFocus, onClose })`, `openSheet({ title, body, height })`.
- `pushLayer(closeFn, el)` → `pop()`: put your own closable layer on the shared Escape stack (never add a second global Escape listener that closes several things).
- `toast(message, { type, action: { label, onClick }, duration })` (kit toasts; `assets/toast.js` `showToast` keeps working and looks alike).

Navigation/search: `hrefFor(leaf)`, `catHref(cat)`, `navigate(leafId, { files, newTab })`, `search(q)`,
`openCommandBar(q)`, `attachSearch(input, { showEmpty })`, `setCommands([{ id, label, sub, icon, kbd, syn, run }])`
(page commands in ⌘K, "On this page"), `registerShortcuts([{ label, keys }])` (rows in the `?` sheet),
`addMoreItems(() => [{ group, items }])` (entries in the ⋯ menu, e.g. the PDF workspace actions).

Misc: `enhance(root)` (icons, `.fw-seg`, roving rows, `[data-copy]`, sliders, `.fw-intake[data-intake]`), `roving()`,
`copyText(text, el)`, `setTheme('light'|'dark'|'system')`, `toggleTheme()`, `effectiveTheme()` — listen to
`oo-theme-change` (document) or `fw-theme-change` (window) to redraw canvases. `store.get/set/del` (`fw:*` keys),
`getRecent()`, `addRecent()`, `clearRecent()` (→ undo).

Files: tool pages keep their own dropzones (today's behaviour — no page-wide drop veil on tools). Only the home
page has the drop area + chooser; it hands files to the chosen tool through IndexedDB and `mountShell` feeds them
into that page's visible `<input type=file>` once it has stayed in place for 400 ms (same path as
`assets/file-paste.js`). If your tool needs more than a
file input, call `consumeHandoff()` yourself and pass `mountShell({ handoff: false })` — or keep an input around.

## 4. Helpers for area agents

### Progress (G3) — `assets/kit/progress.js`
```js
import { showProgress, withProgress, spinnerHtml } from '../../assets/kit/progress.js';
const p = showProgress(previewEl, { label: 'Rendering preview…' });   // indeterminate, appears after 150 ms
p.set(0.4); p.label('Page 2 of 5'); p.done();
await withProgress(stageEl, (report) => decode(file, { onProgress: (f) => report(f) }), 'Opening scan.e57', { cancel: () => ac.abort() });
button.innerHTML = `${spinnerHtml('Exporting')}Exporting…`;
```
The overlay covers only the container (its old content stays visible, dimmed), has `role=status`, an optional Cancel
and `aria-busy` on the container. `mode: 'inline'` renders the card inside instead of over the container;
`compact: true` is a one-row spinner pill. Engine downloads (WASM, FFmpeg) should report bytes as determinate.

### Stable resize (G1) — `assets/kit/stable-resize.js`
```js
import { stableResize } from '../../assets/kit/stable-resize.js';
const sr = stableResize(canvas, { observe: stage, onSettle: ({ width, height }) => renderAt(width, height), fit: 'none', anchor: 'center' });
divider.addEventListener('pointerdown', () => sr.hold());
window.addEventListener('pointerup', () => sr.release());
```
Replace your per-frame ResizeObserver redraw with this. Canvas/img/video are frozen with `object-fit` (bitmap
untouched); other elements get their pixel size pinned (pass `inner` if the observed box and the drawn element
differ) and, with `fit: 'contain' | 'fill'`, a CSS scale. Redraw happens once, rAF + `settle` (120 ms) after the last
size change, or on `release()`.

## 5. Class reference (components.css)

Layout `.fw-page` (`--wide`) · `.fw-stack` · `.fw-row-flex` · `.fw-spacer` · `.fw-divider(-v)` ·
Page header `.fw-page-header > .fw-page-header__titles > .fw-h1 + .fw-lede` · `nav.fw-subchips > a.fw-chip` ·
Buttons `.fw-btn` (`--primary --ghost --subtle --danger --sm --lg --block`), `.fw-iconbtn` (`--sm --outline`, needs `aria-label` + `data-tip`) ·
`<kbd class="fw-kbd">` / `kbd('mod+k')` · tooltips `data-tip="…" data-tip-kbd="mod+c" data-tip-place="right"` ·
Inputs `.fw-field > .fw-field__label + .fw-input|.fw-select|.fw-textarea + .fw-field__hint|.fw-field__error`, `.fw-inputwrap`, `.fw-query`, `.fw-paste` ·
Choice `.fw-toggle`, `.fw-slider`, `.fw-stepper` (never inside a `<label>`: Safari then clicks its first button on every click; use `label[for]`), `.fw-seg > .fw-seg__opt` (emits `fw-change`) · Chips/tabs `.fw-chips .fw-chip`, `.fw-tabs .fw-tab`, `.fw-doctabs` ·
Menus `.fw-popover`, `.fw-menu` (via `openMenu`) · Format palette `.fw-target`, `.fw-palette` ·
Feedback `.fw-progress` (`--indeterminate --thin`), `.fw-ring`, `.fw-spinner`, `.fw-skel`, `.fw-verdict--ok|bad|warn`, `.fw-banner--…`, `.fw-alert--info|warning|danger`, `.fw-badge`, `.fw-empty` ·
Queue `.fw-intake`, `.fw-queue`, `.fw-groupbar`, `.fw-items > .fw-item`, `.fw-actionbar-wrap` ·
Instant `.fw-hero`, `.fw-rows > .fw-vrow`, `.fw-output`, `.fw-recent` ·
Workbench `.fw-workbench > .fw-framebar + .fw-wb-main(.fw-wb-list, .fw-stage, .fw-inspector) + .fw-statusbar + .fw-bottombar`, `.fw-zoom` ·
Misc `.fw-card`, `.fw-section`, `.fw-table-wrap > table.fw-table` · helpers `.fw-mono .fw-num .fw-muted .fw-faint .fw-ellipsis .fw-sr .fw-hide-mobile .fw-show-mobile .fw-pointer-copy .fw-touch-copy`.

Use tokens only: `var(--space-4)`, `var(--text-2)`, `var(--surface-sunken)`, `var(--radius-md)`, `var(--dur-2) var(--ease-out)`.
Kit form controls win over the legacy `input[type=…]` rules (they are written as `:is(input, select, textarea).fw-input`).

## 6. What is still legacy

- `assets/style.css`: `.btn*`, `.card*`, `.tab-content`, `.dropzone`, legacy inputs/tables/toasts/dialogs/modals,
  `.conversion-intent-*` and `.landing-*` (SEO pages). Its old variables (`--bg-color`, `--surface-color`,
  `--text-main`, `--text-muted`, `--text-faint`, `--border-color`, `--hover-bg`, …) are aliases of the kit tokens;
  `--accent-color` stays the fern green fill in both themes (legacy buttons put white text on it), links use
  `--accent-text`.
- `assets/toast.js`, `assets/dialog.js`, `assets/dropzone.js` (its "Processed locally" badge is now off by default),
  `assets/icons.js` (tool-body icon set) — all still used by tool bodies.
- Tool bodies themselves (every area), the SEO landing pages and the conversion-intent hero/breadcrumb.
- The storage notice (`assets/consent-notice.js`) stays (the privacy policy refers to it) as a small card.
