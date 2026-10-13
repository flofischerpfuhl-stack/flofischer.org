# Fernwork One kit

## Revision 1 (2026-10-13) — read this first

Owner review (`design/REVIEW-1.md`) changed the information architecture and the command bar. Summary for area agents:

**1. Registry = today's fernwork.net nav (`registry.js`).** Ten categories in today's order, one flat list (no groups):
Convert · PDF Tools · Image Tools · Viewers · Units · Calculator · Text · Security · Utilities · Canvas.
Removed: Open, Developer, Numbers, Share, Color. Category ids → mockup folder (`area`):
`convert`→convert, `pdf`→pdf (no mockup: shell skeleton), `image-tools`→image-tools, `viewers`→viewers, `units`→units,
`calculator`→calculator, `text`→text, `security`→security, `utilities`→utilities, `canvas`→canvas.

Leaf fields: `name` = full name (H1, `<title>`, search: "JSON Formatter", "Length Converter", "DXF Viewer"); `chip` = today's
sidebar label (rail leaves, sub-tool chips, home map: "Length", "DXF Drawing", "Tables / Sheets"); `hash` = today's
`#hash`; `pair` (units presets) = `[from, to]`, e.g. `['lb', 'kg']`.

| Category | Sub-tools (`kind: 'tool'`, one page each) | Presets (`kind: 'preset'`, SEO landings) |
|---|---|---|
| Convert | `convert-images` `convert-video` `convert-audio` `convert-data` `convert-tables` `convert-documents` | heic-to-jpg, png-to-jpg, jpg-to-png, webp-to-png, png-to-webp, avif-to-png, tiff-to-png, mov/mkv/webm-to-mp4, mp4-to-gif, mp4/wav/flac/m4a-to-mp3, mp3-to-wav, mp3-to-ogg, csv-to-json, json-to-csv, xlsx-to-csv, csv-to-xlsx, ods-to-xlsx, xlsx-to-ods, docx-to-pdf, odt-to-pdf, odt-to-docx, rtf-to-pdf, markdown-to-pdf, html-to-pdf, docx-to-txt |
| PDF Tools | `pdf-tools` (one workbench) | edit-pdf, merge-pdf, split-pdf, compress-pdf, sign-pdf, ocr-pdf, redact-pdf |
| Image Tools | `image-tools` (one workbench) | compress-image, resize-image, crop-image, remove-background, annotate-image, blur-image, image-metadata |
| Viewers | `viewer-markdown` `viewer-svg` `viewer-table` `viewer-documents` `viewer-pptx` `viewer-dxf` `viewer-pointcloud` `viewer-shapefile` `viewer-ifc` `viewer-stl` `viewer-database` | csv-viewer, excel-viewer, parquet-viewer (→ table), docx-viewer (→ documents), sqlite-viewer (→ database) |
| Units | `units-length` `units-area` `units-volume` `units-weight` `units-temperature` `units-speed` `units-time` `units-pressure` `units-energy` `units-power` `units-data` `units-angle` `units-frequency` `units-fuel` | conversion pairs (REVIEW-1 answer 3): lbs-to-kg, kg-to-lbs, oz-to-grams, grams-to-oz, cm-to-inches, inches-to-cm, feet-to-meters, meters-to-feet, km-to-miles, miles-to-km, c-to-f, f-to-c, mph-to-kmh, kmh-to-mph, ml-to-oz, oz-to-ml, liters-to-gallons, gallons-to-liters, sqft-to-sqm, mb-to-gb, l100km-to-mpg |
| Calculator | `calculator` (one page, Calc Paper = Calculate + Grapher) | grapher, percentage |
| Text | `json-formatter` `text-diff` `regex-tester` `word-count` `case-converter` `text-cleanup` `ascii-banner` `image-to-ascii` | — |
| Security | `hash-generator` `encode-decode` `hmac-kdf` `text-encryption` `password-generator` `uuid-generator` `jwt-decoder` | sha256-checksum, base64-decode |
| Utilities | `qr-generator` `qr-reader` `url-cleaner` `timestamp` `color-picker` | wifi-qr, contrast-checker |
| Canvas | `fernboard` (one board app) | draw, mind-map, mermaid |

**Old ids still resolve** (`ALIASES`): `getLeaf('format-json')` returns a copy of the JSON Formatter leaf that keeps
`id: 'format-json'` and adds `aliasOf: 'json-formatter'`, so round-1 pages that key tables by id keep working. `hrefFor`,
Recent and the rail use today's id (`canonicalId(id)`). Don't use old ids in new code.

**2. Command bar = pure tool search** (owner decision). Searches tools, sub-tools, SEO presets (names + synonyms incl.
"pfund in kg"), page commands and settings. No inline answers, no paste detectors, no "Open in …" rows. The home search and
the 404 search use the same engine. `shell.js` no longer imports or re-exports `eval.js` (`answer`, `detect`,
`convertUnits`, `evalMath`, `parseColor`, `toHex`, `toHsl`, `relTime`, `fmtNum`, `cleanUrl`): import them from
`../kit/eval.js` directly if your page needs them (Calculator does). Detection may still help *inside* a tool. Pasting text
outside inputs now does nothing unless your page handles it via `onPasteText`.

**3. Declutter.** No trust/marketing lines anywhere in the kit: the ⌘K footer line, the veil's "stays on this device",
the privacy popover, `.fw-veil__foot`, `.fw-footer__trust`, `.fw-privacy-chip` are gone; `.fw-intake__privacy` is now
`display:none` (remove it from your markup). Footer only on home (legal links). The ⋯ menu (`#fw-more`) is now shown on
all widths: theme (phones), keyboard shortcuts (desktop), install, **Legal: Imprint · Privacy · Terms**. App bar background
is solid (no blur).

**4. Rail and sub-tool navigation.** The rail is one flat list. On ≥ 1280 px it is open by default (unless the user
collapsed it; workbenches stay 56 px) and the current category lists its sub-tools (`chip` labels). In the collapsed rail
and on workbenches, hovering/focusing a category with sub-tools opens a **flyout** with them (→ opens it from the keyboard,
↑/↓ move, ← / Esc close). Sub-tool chips under the H1 (`pageHeader`) show `chip` labels and are 44 px on touch.
`mountShell({ railOpen })` overrides the default. Single-tool categories (PDF, Image Tools, Calculator, Canvas) show no
leaves/chips; their presets appear on the home map and in search.

**5. New/changed API**
- `mountShell({ commands: [{ id, label, sub, icon, kbd, syn, run, searchOnly, hidden() }] })` → page commands in ⌘K
  ("On this page": the first 4 when the query is empty, all when they match). Change them later with `setCommands(list)`
  (exported, and on the `mountShell` return value). Replaces the MutationObserver/injection shims.
- `canonicalId(id)`, `ALIASES` exported from `shell.js`/`registry.js`.
- `renderCatalog({ compact, current, max = 8 })`: flat; `group` is accepted but ignored.
- `openDialog({ size })` now sets `--dlg-w`, so below 600 px the bottom sheet is full width again (drop your `!important` workaround).
- `.fw-stage--fill` (new modifier): children fill the stage instead of being centred (Calculator's `place-items: normal` workaround).
- `.fw-pointer-copy` / `.fw-touch-copy` work everywhere (not only inside `.fw-intake`).
- `.fw-intake--slim` keeps its slim height on phones.
- Touch (`pointer: coarse`) targets are 44 px: `.fw-chip` / sub-chips, `.fw-seg__opt` (also `--sm`), `.fw-iconbtn--sm`,
  `.fw-input`/`.fw-select`, toast action + close; `.fw-detect button` gets a 44 px hit area.
- `.fw-chip`, `.fw-chips`, `.fw-subchips` are `position: relative` (a `.fw-sr` inside a scrolling chip row no longer widens the page).
- Drop veil: no `backdrop-filter` (it cost ~70 ms/frame in software rendering); a denser solid veil instead. No blur left in the kit.
- `files.js`: veil actions point at today's tools (`sub` = "Category · Sub-tool"); new kinds `points` (las laz e57 pcd pts →
  Point Cloud) and `geo` (shp shx kml gpx → Shapefile). Video/audio "Play" actions removed (no player today). Action ids unchanged.
- Icons added: shuffle, boxes, wrench, weight, thermometer, beaker, square, gauge, fuel, zap, triangle-right, activity,
  arrow-down-up, sparkles, presentation, hard-drive (drop your runtime copies when convenient; yours still override).
- `eval.js` answers/detectors now point at today's leaves (units → `units-<dimension>`, time → `timestamp`, colour →
  `color-picker`, URL → `url-cleaner`, JWT → `jwt-decoder`, hash → `hash-generator`, Base64 → `encode-decode`,
  Wi-Fi/vCard → `qr-generator`). Not used by the shell.

---

Shared tokens, components, shell and recorder for every Fernwork One mockup. Live style guide (every component, light
and dark side by side): **http://127.0.0.1:8790/kit/**. Reference pages that use everything below:
**http://127.0.0.1:8790/shell/** (home), `shell/queue.html`, `shell/instant.html`, `shell/workbench.html`, `shell/404.html`.

Rules: build on the kit, never edit it (report needed changes as "Kit additions"). Static HTML + vanilla ES modules, no
build step, no CDN. Everything binding is in `design/DESIGN.md`; this file only says how to use it.

## 1. Files

| File | What |
|---|---|
| `theme-init.js` | Sync script for `<head>`: applies `fw:theme` before paint (no flash). `?theme=dark|light` overrides (handy for screenshots). |
| `tokens.css` | All DESIGN §6 tokens, light + dark (`[data-theme]` on `<html>` or **any subtree**, OS preference otherwise), reduced motion. |
| `components.css` | Every DESIGN §5 component, prefixed `fw-`. |
| `shell.js` | ES module: `mountShell()` + every shell behaviour and helper (re-exports everything below). |
| `registry.js` | Categories and leaves (today's nav, Revision 1): name, chip, synonyms, archetype, icon, mock area, aliases. |
| `eval.js` | Math, units, time, colour helpers and value detectors, `cleanUrl()`. Pure functions. Not used by the shell (Revision 1); import directly. |
| `files.js` | `fileKind()`, `summarize()`, `actionsFor()` (drop-veil actions per type), `handoff()` / `consumeHandoff()`, `formatBytes()`. |
| `icons.js` | Lucide subset (ISC), stroke 1.75: `icon(name, { size })`, `<span data-icon="name" data-size="20">`. |
| `fonts/` | Geist 400/500/600 (latin + latin-ext) and Geist Mono 400/500/600 (OFL). Loaded by `tokens.css`. |
| `img/logo.svg` | Fernwork fern mark (transparent). `img/app-icon.svg` = rounded app icon. |
| `samples/` | Real sample files: `IMG_2041/2042/2043.jpg` (~3 MB photos), `report.docx`, `contract.pdf`, `data.json`, `notes.txt`, `clip.mp4`, `scan.xyz` (unknown type). |

## 2. Page skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Units · Fernwork</title>
<link rel="icon" href="../kit/img/logo.svg" type="image/svg+xml">
<script src="../kit/theme-init.js"></script>
<link rel="stylesheet" href="../kit/tokens.css">
<link rel="stylesheet" href="../kit/components.css">
<link rel="stylesheet" href="units.css"><!-- your area styles, tokens only -->
</head>
<body>
<main id="main">
  <div class="fw-page">                      <!-- B/C pages; workbenches put .fw-workbench here instead -->
    <div id="page-header"></div>
    …your tool…
  </div>
</main>
<script type="module">
import { mountShell, toast } from '../kit/shell.js';
const shell = mountShell({ leaf: 'units', archetype: 'instant', pageHeader: '#page-header' });
</script>
</body>
</html>
```

`mountShell` wraps `<main>` and adds: skip link ("Skip to tool"), app bar, icon rail, footer (home only), toast
region, tooltip, drop veil, global keys, Escape stack. **Call it before rendering anything that uses kit helpers**
(intakes, `hrefFor`, chips), then render.

## 3. Kit API (`shell.js`)

### mountShell(options) → api
| option | type | meaning |
|---|---|---|
| `leaf` | leaf id | Current leaf (registry). Sets title, rail/chip state, Recent. |
| `category` | id | Only needed when there is no leaf. |
| `archetype` | `'workbench'│'queue'│'instant'│'home'│'doc'` | Layout mode. Workbench: no page scroll, no footer, rail stays 56 px. `doc` = no rail (legal, 404). |
| `accept` | `['image']`, `['*']` or `(summary) => bool` | File kinds this page takes directly. Kinds: `image video audio pdf doc slides sheet data text cad model archive unknown`. |
| `acceptLabel` | string | Shown in the direct veil: "Drop to add 3 images · to **HEIC to JPG**". |
| `onFiles(files, {source})` | fn | Called for drops, pastes, picker, samples and handoffs. `source`: `drop│paste│picker│sample│handoff`. |
| `onPasteText(text)` | fn → `true` | Paste outside inputs. Return `true` if handled (the default paste is then prevented); otherwise nothing happens. |
| `dropActions(summary, files)` | fn → actions | Extra veil actions, prepended: `{ id, label, sub, icon, leaf }` or `{ …, run(files) }`. |
| `pageHeader` | selector/el | Render the standard PageHeader (H1 = leaf name, one line, sub-tool chips) into it. |
| `footer` | bool | Default: home only (legal links). `wide: true` aligns it to 1200 px. |
| `commands` | array | Page commands in ⌘K (Revision 1, see top). |
| `railOpen` | bool | Override the default rail state (open ≥ 1280 px). |
| `rail` | bool | `false` hides the rail (home, 404). |
| `routing` | `'auto'│'shell'` | `auto` (default): links to other leaves go to `<area>/?leaf=<id>` (all areas except `pdf`), else to the shell skeletons. |
| `routes` | `{ leafId: href }` | Point leaves at **your** pages (e.g. `{ 'cm-to-inches': './?q=180+cm+in+in' }`). |
| `searchInput` | selector | `/` focuses this instead of opening the command bar. |
| `shortcuts` | `[{ label, keys: 'mod+shift+e' }]` | Added to the `?` sheet. |
| `handoff` | bool | Default `true`: files dropped on another page and routed here arrive via `onFiles(files, { source: 'handoff', leaf, action })`. |
| `recent` | `{ file?, note? }` | Detail shown in Recent/Continue for this visit. |

### Overlays (all: top layer, Escape stack, focus trap/return)
- `toast(message, { type: 'success'│'info'│'warning'│'danger'│'neutral', action: { label: 'Undo', onClick }, duration })` → `{ close }`. Max 2, dismissible, dedupes. Only for background results and undoable actions.
- `openDialog({ title, body, actions: [{ label, primary│danger│ghost, onClick, close }], size, sheetOnMobile = true, initialFocus })` → `{ el, close }`. Native `<dialog>`; bottom sheet below 600 px.
- `openSheet({ title, body, height: 'auto'│'peek'│'half'│'full', onClose })` → `{ el, close }`. Grab handle drags down to close. Use `peek` (≤45 %) while editing.
- `openPopover(anchor, content, { placement: 'bottom-start'│'bottom-end'│'bottom-center', className, width, focus })` → `{ el, close, reposition }`.
- `openMenu(anchor, items, opts)` — items `[{ label, icon, kbd: 'mod+s', hint, sub, checked, danger, onSelect }]` or groups `[{ group, items }]`. Arrows, Home/End, typeahead.
- `openCommandBar(query?)`, `closeCommandBar()`, `openShortcuts()`, `openChooser(files)` (the post-drop action list).
- `pushLayer(closeFn)` → `pop()`: put **your own** closable layers (editor search panel, inline popups) on the one Escape stack. Never add a document-level Escape listener.

### Search
- `search(q, { limit, kinds: ['leaf','action','command'] })` → ranked `{ item, kind, score, marks }` (fuzzy + synonyms).
- `answer()`, `detect()` and the other `eval.js` helpers are **not** exported by `shell.js` any more (Revision 1): import `../kit/eval.js`.
- `attachSearch(input)` — inline results dropdown under any input (same engine as ⌘K).
- `createResults(listEl, { input, onDone })` — the raw results list if you build your own palette.

### Files
- `mountIntake(el, { onFiles, accept: 'image/*,.heic', multiple })` — or just mark `.fw-intake[data-intake]` and `enhance()` does it. Children `[data-pick]` open the picker; `[data-sample="IMG_2041.jpg>IMG_2041.HEIC|report.docx"]` loads real samples from `kit/samples` (`>` renames).
- `loadSamples(spec)` → `File[]`. `fileKind(file)`, `summarize(files)`, `actionsFor(files)`, `formatBytes(n)`, `extOf(file)`.
- `navigate(leafId, { query, files, newTab })` — files travel to the next page via IndexedDB (`consumeHandoff()`; `mountShell` does it for you).
- `hrefFor(leafId, query)` and `refreshLeafLinks()` for links you render (`<a data-leaf="units">`).

### Misc
- `enhance(root)` — after inserting HTML: icons, segmented controls, roving rows, `[data-copy]`/`[data-copy-target]` buttons, sliders, intakes.
- `roving(container, itemSelector)` — one tab stop + arrows for any composite (keypads, toolbars). Add `data-roving="a"` for automatic wiring.
- `copyText(text, el?, { toastLabel })` — inline "Copied ✓" on `el` for 1.5 s.
- `setTheme('light'│'dark'│'system')`, `toggleTheme()`, `effectiveTheme()`; listen to `fw-theme-change` on `window` (`oo-theme-change` on `document` too) to redraw canvases.
- `store.get/set/del(key)` — the `fw:*` localStorage helper (try/catch). `getRecent()`, `addRecent({ leaf, file, note })`, `clearRecent()` → undo fn.
- `icon(name, { size })`, `kbd('mod+shift+z')` (⌘ on Mac, Ctrl elsewhere), `h(html)`, `$`, `$$`, `esc`, `isMobile()`, `isTyping()`.

### Stable selectors (for recordings and tests)
`#fw-cmdpill` (search pill) · `.fw-cmd__input` · `.fw-cmd__answer` · `.fw-cmd__item[data-leaf-id="units"]` · `#fw-switcher` ·
`#fw-theme-toggle` · `#fw-recent` · `#fw-search-mobile` · `#fw-more` · `.fw-rail-flyout` · `#fw-rail-pin` · `.fw-rail__item[data-leaf]` ·
`.fw-veil` · `.fw-veil__action[data-action="pdf"]` (ids from `actionsFor`: `convert compress edit pdf bg mp3 gif open merge sign ocr text json format csv compare count checksum`) ·
`.fw-toast` · `.fw-subchips .fw-chip[data-leaf="convert-video"]` · `.fw-rail__item[data-cat="units"]` · `.fw-tslist__cat`, `.fw-tslist__leaf` (mobile switcher sheet).

## 4. Class reference (components.css)

| Component | Classes |
|---|---|
| Layout | `.fw-page` (form pages, max 1040 + gutters) `.fw-page--wide` · `.fw-stack` (`--gap`) · `.fw-row-flex` · `.fw-spacer` · `.fw-divider(-v)` |
| PageHeader | `.fw-page-header > .fw-page-header__top > .fw-page-header__titles > h1.fw-h1 + p.fw-lede` · `.fw-page-header__aside` · `nav.fw-subchips > a.fw-chip[aria-current=page]` |
| Buttons | `.fw-btn` + `--primary --ghost --subtle --danger --sm --lg --block` · states `[disabled] .is-busy .is-copied` · `.fw-btn-group` · `.fw-iconbtn` (+ `--sm --outline`, `aria-pressed`) — always `aria-label` + `data-tip` |
| Kbd / Tooltip | `<kbd class="fw-kbd">` or `kbd('mod+k')` · any element `data-tip="Copy" data-tip-kbd="mod+c" data-tip-place="right"` |
| Inputs | `.fw-field > .fw-field__label + .fw-input│.fw-select│.fw-textarea + .fw-field__hint│.fw-field__error` · `aria-invalid="true"` · `.fw-input--mono` (values only) · `.fw-inputwrap` (leading icon, `.fw-inputwrap__end`) |
| QueryInput | `.fw-query > [data-icon] + input.fw-query__input` (`.fw-query--mono`) — 56 px |
| PasteIntake | `.fw-paste > .fw-paste__box > textarea.fw-paste__field + .fw-paste__actions` · `.fw-paste__meta` with `.fw-detect` ("Detected: … · change") |
| Choice | `.fw-toggle > input[type=checkbox]` · `.fw-check`, `.fw-radio` · `.fw-slider > label.fw-slider__label + output.fw-slider__value + input[type=range][data-unit=" %"]` · `.fw-stepper` |
| Segmented | `.fw-seg[aria-label] > button.fw-seg__opt[aria-checked][data-value]` (`--sm`); emits `fw-change` `{ value }` |
| Chips / Tabs | `.fw-chips`, `.fw-chip` (`aria-current│aria-pressed│.is-active`, `--sample`, `.fw-chip__x`) · `.fw-tabs > .fw-tab[role=tab][aria-selected]` · `.fw-doctabs > .fw-doctab[aria-selected] > .fw-doctab__name + .fw-doctab__dirty` |
| Menus | `.fw-popover` · `.fw-menu > .fw-menu__group > .fw-menu__label + .fw-menu__item (.fw-menu__hint, .fw-menu__sub, --danger)` · ExportMenu = menu with groups Original / Image / Data + `.fw-export__file` filename row |
| TargetChip + FormatPalette | `button.fw-target` (`--lg`) · `.fw-popover.fw-palette > .fw-palette__search + .fw-palette__group > .fw-palette__label + button.fw-palette__opt > .fw-palette__fmt + .fw-palette__why` |
| Dialog / Sheet | via `openDialog` / `openSheet` (`.fw-dialog__head/__title/__body/__foot`, `.fw-sheet__grab/__head/__body`) |
| Toast | via `toast()` (`.fw-toasts > .fw-toast--success│info│warning│danger│neutral`). Mobile: set `--toast-offset` (px) on `<body>` if a sticky bar sits at the bottom. |
| FileIntake | `.fw-intake[data-intake] > .fw-intake__icon + .fw-intake__title + .fw-intake__actions + .fw-intake__sub + .fw-intake__samples + .fw-intake__privacy` · `.fw-intake--slim` (after items exist) · `.is-over` · touch copy: `.fw-pointer-copy` / `.fw-touch-copy` |
| Queue | `.fw-queue` · `.fw-groupbar > .fw-groupbar__text` · `.fw-items > .fw-item > .fw-item__thumb(--icon) + .fw-item__main(.fw-item__name, .fw-item__meta) + .fw-item__status + .fw-item__actions + .fw-item__progress` · `.is-error` · `.fw-delta` · `.fw-actionbar-wrap > .fw-actionbar > .fw-actionbar__summary(.fw-actionbar__line, __sub) + .fw-actionbar__actions` |
| Progress | `.fw-progress > .fw-progress__row(.fw-progress__label, __eta) + .fw-progress__track > .fw-progress__bar` (`--value: 40%`; `--indeterminate`, `--thin`) · `.fw-ring` (`--value: 0-100`) · `.fw-spinner` · `.fw-skel` |
| Instant | `.fw-hero > .fw-hero__label + .fw-hero__value(<small>unit</small>, --mono) + .fw-hero__sub + .fw-hero__actions` (`--empty`) · `.fw-rows > .fw-vrow > .fw-vrow__label + .fw-vrow__value(--sans) + .fw-iconbtn[data-copy]` · `.fw-output > .fw-output__value + .fw-output__copy` (`--empty`) · `.fw-recent > a.fw-recent__item` |
| Verdicts / alerts | `.fw-verdict--ok│bad│warn` (badge) · `.fw-banner--ok│bad│warn > .fw-banner__icon + .fw-banner__text` · `.fw-alert--info│warning│danger > .fw-alert__icon + .fw-alert__body(.fw-alert__actions, details)` · `.fw-badge(--accent│info│warning│danger│mono)` |
| Workbench | `.fw-workbench > .fw-framebar + .fw-wb-main(.has-list .has-inspector) > (.fw-wb-list + .fw-stage + .fw-inspector) + .fw-statusbar + .fw-bottombar` · `.fw-filechip` · `.fw-zoom` (inside `.fw-stage`) · `.fw-insp-section > .fw-insp-section__head + dl.fw-insp-kv` · `.fw-thumb-btn[aria-current]` · `.fw-framebar .fw-hide-compact` |
| Misc | `.fw-card(__head/__title/__body)` · `.fw-section(__head/__title/__more)` · `.fw-empty(__icon/__title/__text)` · `.fw-table-wrap > table.fw-table (.is-num, .is-mono)` · `renderCatalog({ group, compact })` |
| Helpers | `.fw-mono .fw-num .fw-muted .fw-faint .fw-ellipsis .fw-sr .fw-label .fw-t-xs…display .fw-hide-mobile .fw-show-mobile .fw-kbd-hint` |

Spacing, colour, radius, z-index, motion: use the tokens (`var(--space-4)`, `var(--text-2)`, `var(--radius-md)`, `var(--z-sheet)`,
`var(--dur-2) var(--ease-out)`). No raw colours; content surfaces (a PDF page, a slide) may use their own isolated palette.

## 5. Patterns per archetype

**A · Workbench** (Images, Open, Canvas, Calculator, Textbench): `archetype: 'workbench'`, `accept: [...]`. Markup = `.fw-workbench`
(see `shell/workbench.html`). Frame bar order: file chip / doc tabs · mode `.fw-seg` · spacer · undo/redo · view toggles ·
**Primary** · ⋯. Panels push the stage (toggle `.has-list` / `.has-inspector`). Empty state = `.fw-intake` centred in the stage +
recents. Mobile (<768): list/inspector/status hide automatically, `.fw-bottombar` (4 slots) opens `openSheet({ height: 'peek' })`.
Scope your tool letters (V H C B T U I M E F 1) to the stage, ignore them while `isTyping()`.

**B · Queue** (Convert, Checksum): `archetype: 'queue'`, `accept` = the chip's kinds, `onFiles` adds cards and starts work
immediately. Big `.fw-intake` → `.fw-intake--slim` once items exist; `.fw-groupbar` with `.fw-target` per group; `.fw-items`;
sticky `.fw-actionbar-wrap` (full-bleed on mobile). Errors inline on the card (`.is-error` + action). See `shell/queue.html`.

**C · Instant** (Units, Inspect, Time, Clean link, Color, Generate, QR): `archetype: 'instant'`, `onPasteText: (t) => { fill(t); return true; }`,
read `?q=` (the command bar and detectors send values there). `.fw-paste` or `.fw-query` (autofocus on pointer devices) →
`.fw-hero` (+ one primary Copy) → `.fw-rows` → Recent. Mobile: sticky Copy in `.fw-actionbar-wrap`. See `shell/instant.html`.

Handoffs ("Open in…", "Send to…"): `navigate('qr-generator', { query: { q: value } })` or with `files`.

## 6. Recorder (`/home/flo/AgentWork/fernwork-ux/video/rec.mjs`)

Headless Playwright with a visible cursor, human-speed input, real drag-and-drop and a compose step to one mp4.
Default engine = CDP screencast (JPEG q92 at device pixels, re-timed to constant 30 fps → crisp text). `engine: 'recordVideo'`
uses Playwright's VP8 recorder instead (softer). Everything is selector-driven; no pixel calibration.

```js
import { Recorder, compose, verify, still } from '/home/flo/AgentWork/fernwork-ux/video/rec.mjs';
const OUT = '/home/flo/AgentWork/fernwork-ux/video/units';
const rec = await Recorder.launch({ outDir: OUT + '/raw' });
const d = await rec.segment('desktop', { device: 'desktop', theme: 'light', url: 'http://127.0.0.1:8790/units/' });
await d.caption('Type it like you say it');          // chapter label, burned in bottom-left at compose time
await d.click('.fw-query__input');                    // human mouse path + click ripple
await d.type('5 ft in cm');                           // ~11 chars/s with jitter
await d.press('Meta+K');                              // keycast bubble "⌘ K" (Mac glyphs: the page sees a Mac)
await d.paste('https://example.com/?utm_source=x');   // real ClipboardEvent, shows ⌘ V
await d.drop(['kit/samples/IMG_2041.jpg>IMG_2041.HEIC', 'kit/samples/report.docx'], '.fw-veil__action[data-action="pdf"]',
             { via: 'main', hold: 600 });             // drag in from the window edge, linger, release on a selector
await d.theme('dark');                                // clicks #fw-theme-toggle
await d.scrollTo('#all-tools');  await d.pause(800);
await d.waitForURL(/queue/);                          // after a navigation (cursor + caption persist)
await d.end();
const m = await rec.segment('mobile', { device: 'mobile', theme: 'light', url: '…' });   // 390×844 @2x, touch dot
await m.tap('#fw-switcher'); …; await m.end();
await rec.close();
await compose([d, m], OUT + '/units.mp4');            // desktop 1440×900; mobile centred on a neutral canvas; cross-fades
const info = await verify(OUT + '/units.mp4', { frames: 8 });   // full decode + ffprobe + 8 PNG frames in OUT/frames
still(OUT + '/units.mp4', 12.5, OUT + '/stills/desktop-light.png');
```

Segment API: `moveTo(target, { duration, at: { x: 0.2, y: 0.5 } })`, `click`, `tap`, `hover(target, { dwell })`, `type(text, { into, cps })`,
`press(keys, { show })`, `paste(text)`, `clear()`, `drop(files, target, { via, from: 'right'│'left'│'top'│'bottom', hold, cancel })`,
`scrollBy(dy)`, `scrollTo(selector)`, `caption(text, { ms })`, `endCaption()`, `theme(mode)`, `goto(url)`, `waitFor(sel)`, `waitForURL(re)`,
`pause(ms)`, `screenshot(file)`, `now()`, `page` (raw Playwright page). Targets are selectors, locators or `{ x, y }`.
`compose(segments, out, { fade = 0.45, crf = 20 })` → H.264 High, yuv420p, 30 fps, +faststart. `verify()` returns
`{ duration, fps, size, mb, faststart, stills }`. Run long recordings with a timeout; one browser per Recorder.
Headless only (never the real display); the recorder launches `/usr/bin/chromium` headless itself.

### Revision 1b (coordinator)
- When the rail is pinned open (≥ 768 px), the page header's sub-tool chips are hidden — the rail already lists the
  sub-tools, so the page shows no duplicate navigation. Chips remain when the rail is collapsed, on workbench pages and
  on mobile.
