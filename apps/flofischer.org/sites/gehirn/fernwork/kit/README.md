# Fernwork One kit

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
| `registry.js` | Categories and leaves (DESIGN §2): one name per leaf, synonyms, archetype, icon, mock area. |
| `eval.js` | Inline answers (math, units, time, colour) and paste detectors (URL, JWT, hash, UUID, Base64, epoch/ISO, colour, `WIFI:`, vCard, JSON), `cleanUrl()`. Pure functions. |
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

`mountShell` wraps `<main>` and adds: skip link ("Skip to tool"), app bar, icon rail, footer (not on workbenches), toast
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
| `onPasteText(text)` | fn → `true` | Paste outside inputs. Return `true` if handled; otherwise the command bar opens prefilled (detectors run). |
| `dropActions(summary, files)` | fn → actions | Extra veil actions, prepended: `{ id, label, sub, icon, leaf }` or `{ …, run(files) }`. |
| `pageHeader` | selector/el | Render the standard PageHeader (H1 = leaf name, one line, sub-tool chips) into it. |
| `footer` | bool | Default: on, except workbench. `wide: true` aligns it to 1200 px. |
| `rail` | bool | `false` hides the rail (home, 404). |
| `routing` | `'auto'│'shell'` | `auto` (default): links to other leaves go to `/<area>/?leaf=<id>` when that mockup folder exists, else to the shell skeletons. |
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

### Search, answers, detectors
- `search(q, { limit, kinds: ['leaf','action'] })` → ranked `{ item, kind, score, marks }` (fuzzy + synonyms).
- `answer(q)` → `{ kind: 'math'│'unit'│'time'│'color', q, value, unit?, copy, sub?, open, openLabel, swatch? }` or `null`. E.g. `answer('5 ft in cm').value === '152.4'`.
- `detect(text)` → `[{ type: 'url'│'jwt'│'uuid'│'hash'│'time'│'color'│'wifi'│'vcard'│'json'│'base64', label, detail, value, actions: [{ leaf, label, sub, primary }] }]`.
- Also exported: `convertUnits`, `evalMath`, `parseColor`, `toHex`, `toHsl`, `relTime`, `fmtNum`, `cleanUrl`.
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
`#fw-theme-toggle` · `#fw-recent` · `#fw-privacy` · `#fw-search-mobile` · `#fw-more` · `#fw-rail-pin` · `.fw-rail__item[data-leaf]` ·
`.fw-veil` · `.fw-veil__action[data-action="pdf"]` (ids from `actionsFor`: `convert compress edit pdf bg mp3 gif open merge sign ocr text json format csv compare count checksum`) ·
`.fw-toast` · `.fw-subchips .fw-chip[data-leaf="convert-video"]` · `.fw-tslist__cat`, `.fw-tslist__leaf` (mobile switcher sheet).

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

Handoffs ("Open in…", "Send to…"): `navigate('qr-code', { query: { q: value } })` or with `files`.

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
