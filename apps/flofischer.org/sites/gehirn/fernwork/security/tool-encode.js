// Encode / Decode (+ preset "Base64 decode"): Base64 · URL · Hex · Binary · HTML entities, both directions, live.
// Codec chains: after decoding, the tool notices when the result is still encoded (URL → Base64 → gzip → JSON …) and
// offers the next step as one click; steps can be added or removed. Binary results get a preview, hexdump and download.
import { openMenu } from '../kit/shell.js';
import { icon, esc, $, $$, enhance, toast, copyText, isCoarse, settings, seg, moreBtn, wireMore, pane, iconBtn, setBar, download, pickFile, fmtBytes, debounce, readClipboard } from './ui.js';
import * as C from './codec.js';

let api = {};
export const config = {
  accept: ['*'],
  commands: [
    { id: 'e-swap', label: 'Use output as input', icon: 'arrow-left-right', run: () => api.swap?.() },
    { id: 'e-dir', label: 'Switch encode / decode', icon: 'arrow-down-up', run: () => api.flip?.() },
    { id: 'e-file', label: 'Encode a file as Base64', icon: 'file', syn: ['image to base64', 'file to base64'], run: () => api.pickFile?.() },
  ],
};

const FMTS = [['base64', 'Base64'], ['url', 'URL'], ['hex', 'Hex'], ['binary', 'Binary'], ['html', 'HTML entities']];
const NAME = Object.fromEntries(FMTS);
const binEncode = (b) => [...b].map((x) => x.toString(2).padStart(8, '0')).join(' ');
function binDecode(s) {
  const t = s.trim(); if (!t) return new Uint8Array();
  const groups = /\s/.test(t) ? t.split(/\s+/) : t.length % 8 === 0 ? t.match(/.{8}/g) : null;
  const bad = !groups ? 'Binary needs groups of 8 bits (e.g. 01001000 01101001).' : groups.find((g) => !/^[01]{8}$/.test(g));
  if (bad) throw new Error(typeof bad === 'string' && bad.length > 8 ? bad : `“${bad}” isn’t 8 bits. Use groups like 01001000.`);
  return Uint8Array.from(groups, (g) => parseInt(g, 2));
}
const htmlEncodeAll = (s) => [...C.htmlEncode(s)].map((ch) => (ch.codePointAt(0) > 126 ? `&#x${ch.codePointAt(0).toString(16).toUpperCase()};` : ch)).join('');

export async function mount(root, { id, params }) {
  const S = settings('encode', { fmt: 'base64', dir: 'encode', b64url: false, nopad: false, plus: false, hexSep: ' ', hexUpper: false, htmlAll: false, dataUri: false });
  if (id === 'base64-decode') { S.fmt = 'base64'; S.dir = 'decode'; }
  const st = { input: '', file: null, steps: [], result: null, run: 0 };

  // value = { text } | { bytes }
  const textOf = (v) => { if (v.text != null) return v.text; const t = C.tryUtf8(v.bytes); if (t == null) throw new Error('These bytes aren’t text (not valid UTF-8).'); return t; };
  const bytesOf = (v) => v.bytes ?? C.utf8Bytes(v.text);
  const STEP = {
    'base64:encode': { label: 'Base64 encode', run: (v) => ({ text: C.b64encode(bytesOf(v), { url: S.b64url, pad: !S.nopad }) }) },
    'base64:decode': { label: 'Base64 decode', run: (v) => { const t = textOf(v); const i = C.b64Info(t); return { bytes: C.b64decode(t), note: i ? `${i.alphabet}${i.padded ? '' : ' · no padding'}${i.wrapped ? ' · line breaks removed' : ''}` : '' }; } },
    'url:encode': { label: 'URL encode', run: (v) => { let s = C.urlEncode(textOf(v)); if (S.plus) s = s.replace(/%20/g, '+'); return { text: s }; } },
    'url:decode': { label: 'URL decode', run: (v) => ({ bytes: C.urlDecodeBytes(textOf(v), { plus: S.plus }) }) },
    'hex:encode': { label: 'Hex encode', run: (v) => { const s = C.toHex(bytesOf(v), S.hexSep); return { text: S.hexUpper ? s.toUpperCase() : s }; } },
    'hex:decode': { label: 'Hex decode', run: (v) => { const b = C.parseHex(textOf(v)); if (!b) throw new Error('Not hex. Use byte pairs like 48 69, 0x48 0x69 or 48:69.'); return { bytes: b }; } },
    'binary:encode': { label: 'Binary encode', run: (v) => ({ text: binEncode(bytesOf(v)) }) },
    'binary:decode': { label: 'Binary decode', run: (v) => ({ bytes: binDecode(textOf(v)) }) },
    'html:encode': { label: 'HTML encode', run: (v) => ({ text: S.htmlAll ? htmlEncodeAll(textOf(v)) : C.htmlEncode(textOf(v)) }) },
    'html:decode': { label: 'HTML decode', run: (v) => ({ text: C.htmlDecode(textOf(v)) }) },
    gunzip: { label: 'Gunzip', run: async (v) => ({ bytes: await C.inflate(bytesOf(v), 'gzip') }) },
    inflate: { label: 'Inflate (zlib)', run: async (v) => ({ bytes: await C.inflate(bytesOf(v), 'deflate') }) },
    gzip: { label: 'Gzip', run: async (v) => ({ bytes: await C.deflate(bytesOf(v)) }) },
    datauri: { label: 'Data URI', run: (v) => {
      const m = /^data:([^,;]*)((?:;[^,;]*)*?)(;base64)?,(.*)$/is.exec(textOf(v).trim()); if (!m) throw new Error('Not a data: URI.');
      return { bytes: m[3] ? C.b64decode(decodeURIComponent(m[4])) : C.urlDecodeBytes(m[4]), mime: m[1] || 'text/plain', note: m[1] || 'text/plain' };
    } },
    json: { label: 'Format JSON', run: (v) => { const j = C.tryJson(textOf(v)); if (j === undefined) throw new Error('Not JSON.'); return { text: JSON.stringify(j, null, 2), json: j }; } },
  };
  const chain = () => [`${S.fmt}:${S.dir}`, ...st.steps];

  /** What would a person do next with this value? (detection inside the tool, never a jump to another tool) */
  function suggest(v, last) {
    if (v.bytes) {
      const m = C.sniff(v.bytes);
      if (m?.gzip) return 'gunzip';
      if (m?.zlib) return 'inflate';
      const t = C.tryUtf8(v.bytes); if (t == null || !C.looksPrintable(t)) return null;
      v = { text: t };
    }
    const t = v.text.trim(); if (!t || t.length < 4) return null;
    let s = null;
    if (/^data:[\w.+-]*\/?[\w.+-]*[;,]/i.test(t)) s = 'datauri';
    else if (C.hasPercent(t)) { try { C.urlDecodeBytes(t); s = 'url:decode'; } catch { /* */ } }
    if (!s && C.tryJson(t) !== undefined && last !== 'json' && /\n/.test(t) === false) s = 'json';
    if (!s && C.hasEntities(t)) s = 'html:decode';
    if (!s && C.looksHexBytes(t)) s = 'hex:decode';
    if (!s && looksB64(t)) s = 'base64:decode';
    return s === last ? null : s;
  }
  function looksB64(t) {
    const i = C.b64Info(t); if (!i) return false;
    const c = i.clean; if (c.length < 8) return false;
    if (/^[a-z]+$/i.test(c) || /^\d+$/.test(c)) return false;
    if (!(i.padded || /[+/_-]/.test(c) || (c.length % 4 === 0 && /[A-Z]/.test(c) && /[a-z]/.test(c) && /\d/.test(c)))) return false;
    try { const b = C.b64decode(c); const tx = C.tryUtf8(b); return (tx != null && C.looksPrintable(tx)) || !!C.sniff(b); } catch { return false; }
  }
  /** In Encode mode: does the input already look encoded in the chosen format? → offer "Decode instead". */
  function looksEncoded(t) {
    if (!t.trim()) return false;
    return { base64: () => looksB64(t), url: () => C.hasPercent(t), hex: () => C.looksHexBytes(t) || /^([0-9a-f]{2}){4,}$/i.test(t.trim()), binary: () => /^([01]{8}\s*){2,}$/.test(t.trim()), html: () => C.hasEntities(t) }[S.fmt]();
  }

  // ───────── layout ─────────
  root.innerHTML = `
    <div class="sec-toolbar">
      ${seg('e-fmt', 'Format', FMTS.map(([v, l]) => [v, v === 'html' ? 'HTML<span class="sec-long"> entities</span>' : l]), S.fmt, { cls: 'sec-fmtseg', raw: true })}
      ${seg('e-dir', 'Direction', [['encode', 'Encode'], ['decode', 'Decode']], S.dir)}
      <span class="fw-spacer"></span>${moreBtn('e-more')}
    </div>
    <div class="sec-more" id="e-more-panel" hidden></div>
    <div class="sec-io">
      <div id="e-inpane"></div>
      ${pane({ id: 'e-outpane', label: 'Output', actions: iconBtn('e-swap', 'arrow-left-right', 'Use as input') + iconBtn('e-dl', 'download', 'Download') + `<button class="fw-btn fw-btn--primary fw-btn--sm sec-desk" type="button" id="e-copy">${icon('copy')}<span>Copy</span></button>`, body: '<div id="e-chain"></div><div id="e-out" aria-live="polite"></div>' })}
    </div>`;
  enhance(root);
  wireMore($('#e-more'), $('#e-more-panel'));
  $('#e-fmt').addEventListener('fw-change', (e) => { S.fmt = e.detail.value; st.steps = []; S.save(); renderMore(); renderIn(); update(); });
  $('#e-dir').addEventListener('fw-change', (e) => { S.dir = e.detail.value; st.steps = []; if (S.dir === 'decode' && st.file) st.file = null; if (id !== 'base64-decode') S.save(); renderIn(); update(); });
  $('#e-swap').onclick = () => swap();
  $('#e-copy').onclick = (e) => copyOut(e.currentTarget);
  $('#e-dl').onclick = () => dlOut();

  function setSeg(sel, v) { $$(`${sel} .fw-seg__opt`).forEach((o) => o.setAttribute('aria-checked', String(o.dataset.value === v))); }
  function renderMore() {
    const p = $('#e-more-panel');
    const opt = {
      base64: `<label class="fw-toggle"><input type="checkbox" data-opt="b64url" ${S.b64url ? 'checked' : ''}>URL-safe alphabet (Base64URL, - and _)</label><label class="fw-toggle"><input type="checkbox" data-opt="nopad" ${S.nopad ? 'checked' : ''}>No = padding</label><label class="fw-toggle"><input type="checkbox" data-opt="dataUri" ${S.dataUri ? 'checked' : ''}>Files as data: URI</label><span class="fw-faint fw-t-sm">Decoding accepts both alphabets, with or without padding and line breaks.</span>`,
      url: `<label class="fw-toggle"><input type="checkbox" data-opt="plus" ${S.plus ? 'checked' : ''}>Spaces as + (form encoding)</label>`,
      hex: `<div class="sec-more__row"><span class="sec-more__label">Separator</span>${seg('e-hexsep', 'Separator', [[' ', 'Space'], ['', 'None'], [':', 'Colon']], S.hexSep, { sm: true })}</div><label class="fw-toggle"><input type="checkbox" data-opt="hexUpper" ${S.hexUpper ? 'checked' : ''}>Uppercase</label><span class="fw-faint fw-t-sm">Decoding accepts 48 69, 0x48 0x69, 48:69 and \\x48\\x69.</span>`,
      binary: '<span class="fw-faint fw-t-sm">8-bit groups separated by spaces. Decoding also accepts one long run of bits.</span>',
      html: `<label class="fw-toggle"><input type="checkbox" data-opt="htmlAll" ${S.htmlAll ? 'checked' : ''}>Also encode non-ASCII characters (&amp;#xE9;)</label><span class="fw-faint fw-t-sm">Decoded markup is shown as text and never run.</span>`,
    }[S.fmt];
    p.innerHTML = opt; enhance(p);
    $$('[data-opt]', p).forEach((c) => c.onchange = () => { S[c.dataset.opt] = c.checked; S.save(); update(); });
    $('#e-hexsep', p)?.addEventListener('fw-change', (e) => { S.hexSep = e.detail.value; S.save(); update(); });
  }
  const inLabel = () => (S.dir === 'encode' ? 'Text' : NAME[S.fmt]);
  const outLabel = () => (S.dir === 'encode' ? NAME[S.fmt] : 'Decoded');
  function renderIn() {
    const box = $('#e-inpane');
    box.innerHTML = pane({ label: inLabel(), labelFor: st.file ? null : 'e-in', actions: iconBtn('e-open', 'folder-open', S.dir === 'encode' ? 'Encode a file' : 'Open a text file') + iconBtn('e-paste', 'clipboard-paste', 'Paste') + iconBtn('e-clear', 'x', 'Clear'),
      body: st.file ? `<div class="sec-filechip">${icon('file', { size: 20 })}<div><b>${esc(st.file.name)}</b><span class="fw-faint">${fmtBytes(st.file.bytes.length)} · encoding the file’s bytes</span></div><button class="fw-iconbtn fw-iconbtn--sm" type="button" id="e-unfile" aria-label="Remove file" data-tip="Remove file">${icon('x')}</button></div>`
        : `<textarea class="sec-area fw-input--mono" id="e-in" rows="8" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="${S.dir === 'encode' ? 'Type or paste text' : `Paste ${esc(NAME[S.fmt])} to decode`}">${esc(st.input)}</textarea><div id="e-inhint"></div>` });
    enhance(box);
    $('#e-in')?.addEventListener('input', (e) => { st.input = e.target.value; st.steps = []; schedule(); });
    $('#e-unfile')?.addEventListener('click', () => { st.file = null; renderIn(); update(); });
    $('#e-open').onclick = () => openFile();
    $('#e-paste').onclick = async () => { const t = await readClipboard(); if (t != null) setInput(t); };
    $('#e-clear').onclick = () => { const old = st.input, f = st.file; st.file = null; setInput(''); $('#e-in')?.focus(); if (old || f) toast('Cleared', { type: 'neutral', action: { label: 'Undo', onClick: () => { st.file = f; setInput(old); } } }); };
    $('#e-outpane .sec-pane__label').textContent = outLabel();
  }
  function setInput(t) { st.input = t; st.steps = []; renderIn(); update(); }
  async function openFile() {
    const [f] = await pickFile(); if (!f) return;
    if (S.dir === 'encode') { st.file = { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }; st.steps = []; renderIn(); update(); }
    else setInput(await f.text());
  }

  // ───────── run ─────────
  const schedule = debounce(() => update(), 40);
  async function update() {
    const run = ++st.run;
    const src = st.file ? { bytes: st.file.bytes } : { text: st.input };
    const empty = !st.file && !st.input;
    const stages = []; let v = src; let error = null, failedAt = -1;
    if (!empty) {
      for (const [i, sid] of chain().entries()) {
        try { v = await STEP[sid].run(v); stages.push({ sid, note: v.note }); } catch (e) { error = e.message; failedAt = i; break; }
      }
    }
    if (run !== st.run) return;
    st.result = { v, stages, error, failedAt, empty };
    renderChain(); renderOut(); renderHint();
  }
  function finalText(v) { if (v.text != null) return v.text; const t = C.tryUtf8(v.bytes); return t != null && C.looksPrintable(t) ? t : null; }
  function renderHint() {
    const el = $('#e-inhint'); if (!el) return;
    el.innerHTML = S.dir === 'encode' && !st.file && looksEncoded(st.input) ? `<span class="fw-detect sec-hint">${icon('scan', { size: 14 })}<span>This already looks like ${esc(NAME[S.fmt])}</span><button type="button" id="e-todecode">Decode instead</button></span>` : '';
    $('#e-todecode')?.addEventListener('click', () => { S.dir = 'decode'; S.save(); setSeg('#e-dir', 'decode'); renderIn(); update(); });
  }
  function renderChain() {
    const el = $('#e-chain'); const r = st.result;
    const next = !r.empty && !r.error && S.dir === 'decode' ? suggest(r.v, chain().at(-1)) : null;
    if (chain().length < 2 && !next) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="sec-chain" role="list" aria-label="Steps">${chain().map((sid, i) => `${i ? `<span class="sec-chain__arrow" aria-hidden="true">${icon('arrow-right', { size: 14 })}</span>` : ''}<span class="sec-chain__step ${i === r.failedAt ? 'is-bad' : ''}" role="listitem"><span>${esc(STEP[sid].label)}</span>${i ? `<button type="button" data-rm="${i - 1}" aria-label="Remove ${esc(STEP[sid].label)}" data-tip="Remove step">${icon('x', { size: 12 })}</button>` : ''}</span>`).join('')}
      ${next ? `<button type="button" class="fw-chip sec-chain__next" id="e-next">${icon('plus', { size: 14 })}${esc(STEP[next].label)}<span class="fw-faint">· looks like the next step</span></button>` : ''}
      <button type="button" class="fw-btn fw-btn--ghost fw-btn--sm" id="e-addstep" aria-haspopup="menu">${icon('plus')}Step</button></div>`;
    enhance(el);
    $$('[data-rm]', el).forEach((b) => b.onclick = () => { st.steps.splice(+b.dataset.rm, 1); update(); });
    $('#e-next')?.addEventListener('click', () => { st.steps.push(next); update(); });
    $('#e-addstep').onclick = (e) => stepMenu(e.currentTarget);
  }
  function stepMenu(anchor) {
    const d = ['base64:decode', 'url:decode', 'hex:decode', 'binary:decode', 'html:decode', 'gunzip', 'inflate', 'datauri', 'json'];
    const en = ['base64:encode', 'url:encode', 'hex:encode', 'binary:encode', 'html:encode', 'gzip'];
    openMenu(anchor, [{ group: 'Decode', items: d.map((s) => ({ label: STEP[s].label, onSelect: () => { st.steps.push(s); update(); } })) },
      { group: 'Encode', items: en.map((s) => ({ label: STEP[s].label, onSelect: () => { st.steps.push(s); update(); } })) }], { placement: 'bottom-start' });
  }
  function renderOut() {
    const out = $('#e-out'); const r = st.result; const meta = $('#e-outpane .sec-pane__meta');
    $('#e-copy').disabled = $('#e-dl').disabled = $('#e-swap').disabled = true;
    if (r.empty) {
      meta.textContent = '';
      out.innerHTML = `<div class="sec-placeholder">${S.dir === 'encode' ? `The ${esc(NAME[S.fmt])} appears here as you type.` : 'The decoded text appears here.'}${S.dir === 'decode' && S.fmt === 'base64' ? ' <button type="button" class="sec-link" id="e-sample">Try a sample</button>' : ''}</div>`;
      $('#e-sample')?.addEventListener('click', () => setInput(SAMPLE_B64));
      setBar(null); return;
    }
    if (r.error) {
      meta.textContent = '';
      const fix = fixFor(r);
      out.innerHTML = `<div class="fw-alert fw-alert--danger sec-outalert"><span class="fw-alert__icon">${icon('circle-alert')}</span><div class="fw-alert__body"><span><b>${esc(STEP[chain()[r.failedAt]].label)} didn’t work.</b> ${esc(r.error)}</span>${fix ? `<div class="fw-alert__actions"><button class="fw-btn fw-btn--sm" type="button" id="e-fix">${esc(fix.label)}</button></div>` : ''}</div></div>`;
      $('#e-fix')?.addEventListener('click', fix?.run);
      setBar(null); return;
    }
    const t = finalText(r.v);
    if (t != null) {
      const bytes = C.utf8Bytes(t).length;
      meta.textContent = `${fmtN(t.length)} characters${bytes !== t.length ? ` · ${fmtN(bytes)} bytes` : ''}`;
      const markup = S.dir === 'decode' && /<\s*[a-z!/]/i.test(t) && chain().some((s) => s === 'html:decode');
      out.innerHTML = `${markup ? `<p class="sec-safe">${icon('shield-check', { size: 14 })}Contains HTML markup. It’s shown as text and never run.</p>` : ''}<textarea class="sec-area sec-area--out fw-input--mono" id="e-outtext" rows="8" readonly spellcheck="false" aria-label="Output">${esc(t)}</textarea>`;
      $('#e-copy').disabled = $('#e-dl').disabled = $('#e-swap').disabled = false;
      st.outText = t; st.outBytes = null;
      setBar({ line: `${outLabel()} · ${fmtN(t.length)} characters`, actions: [{ label: 'Use as input', icon: 'arrow-left-right', iconOnly: true, onClick: swap }, { label: 'Copy', icon: 'copy', primary: true, onClick: (b) => copyOut(b) }] });
      return;
    }
    // binary result
    const b = r.v.bytes; const m = C.sniff(b); const mime = m?.mime || r.v.mime || 'application/octet-stream';
    if (st.blobUrl) URL.revokeObjectURL(st.blobUrl);
    st.blobUrl = URL.createObjectURL(new Blob([b], { type: mime }));
    st.outText = null; st.outBytes = b; st.outName = `decoded.${m?.ext || 'bin'}`; st.outMime = mime;
    const dim = m?.ext === 'png' ? C.pngSize(b) : null;
    meta.textContent = `${fmtBytes(b.length)} · binary`;
    out.innerHTML = `<div class="sec-bin">
        ${m?.image ? `<div class="sec-bin__preview"><img src="${st.blobUrl}" alt="Decoded image preview"></div>` : `<div class="sec-bin__preview sec-bin__preview--icon">${icon('file', { size: 28 })}</div>`}
        <div class="sec-bin__info"><b>${esc(m ? m.type : 'Binary data')}</b><span class="fw-faint">${fmtBytes(b.length)}${dim ? ` · ${dim.w} × ${dim.h} px` : ''} · not text</span>
          <div class="sec-bin__actions"><button class="fw-btn fw-btn--primary fw-btn--sm" type="button" id="e-bindl">${icon('download')}Download ${esc(st.outName)}</button><button class="fw-btn fw-btn--sm" type="button" id="e-binhex">${icon('copy')}Copy as hex</button></div></div>
      </div>
      <pre class="sec-hexdump" aria-label="First bytes as hex">${C.hexdump(b, 256).map((l) => `<span class="hd-off">${l.off}</span>  ${esc(l.hex)}  <span class="hd-asc">${esc(l.ascii)}</span>`).join('\n')}${b.length > 256 ? `\n<span class="hd-off">… ${fmtN(b.length - 256)} more bytes</span>` : ''}</pre>`;
    $('#e-dl').disabled = false;
    $('#e-bindl').onclick = () => dlOut();
    $('#e-binhex').onclick = (e) => copyText(C.toHex(b, ' '), e.currentTarget);
    setBar({ line: `${m ? m.type : 'Binary'} · ${fmtBytes(b.length)}`, actions: [{ label: 'Download', icon: 'download', primary: true, onClick: () => dlOut() }] });
  }
  /** A one-click recovery when decoding fails because the input is wrapped in another encoding. */
  function fixFor(r) {
    if (r.failedAt !== 0 || S.dir !== 'decode' || st.file) return null;
    const t = st.input.trim();
    if (S.fmt !== 'url' && C.hasPercent(t)) return { label: 'It’s URL-encoded: decode the URL first', run: () => { st.steps = [`${S.fmt}:decode`]; S.fmt = 'url'; setSeg('#e-fmt', 'url'); renderMore(); update(); } };
    if (S.fmt !== 'base64' && looksB64(t)) return { label: 'Decode as Base64 instead', run: () => { S.fmt = 'base64'; setSeg('#e-fmt', 'base64'); renderMore(); renderIn(); update(); } };
    if (S.fmt !== 'hex' && C.parseHex(t)) return { label: 'Decode as hex instead', run: () => { S.fmt = 'hex'; setSeg('#e-fmt', 'hex'); renderMore(); renderIn(); update(); } };
    return null;
  }
  function copyOut(btn) {
    if (st.outText != null) return copyText(st.outText, btn);
    if (st.outBytes) return copyText(C.b64encode(st.outBytes), btn, { toastLabel: 'Base64' });
  }
  function dlOut() {
    if (st.outText != null) {
      return download(st.outText, S.dir === 'encode' ? `${st.file ? st.file.name : 'text'}.${S.fmt === 'base64' ? 'b64' : S.fmt}.txt` : 'decoded.txt');
    }
    if (st.outBytes) download(new Blob([st.outBytes], { type: st.outMime }), st.outName);
  }
  function swap() {
    if (st.outText == null) return;
    const t = st.outText; st.file = null; S.dir = S.dir === 'encode' ? 'decode' : 'encode'; S.save(); setSeg('#e-dir', S.dir); setInput(t);
  }
  const fmtN = (n) => n.toLocaleString('en-US');

  api = { swap, flip: () => { S.dir = S.dir === 'encode' ? 'decode' : 'encode'; setSeg('#e-dir', S.dir); st.steps = []; renderIn(); update(); }, pickFile: () => { S.fmt = 'base64'; S.dir = 'encode'; setSeg('#e-fmt', 'base64'); setSeg('#e-dir', 'encode'); renderMore(); openFile(); } };
  // data: URI output for files (Base64 encode)
  const origFinal = STEP['base64:encode'].run;
  STEP['base64:encode'].run = (v) => { const r = origFinal(v); if (st.file && S.dataUri && st.steps.length === 0) r.text = `data:${st.file.type || 'application/octet-stream'};base64,${r.text}`; return r; };

  renderMore(); renderIn();
  const q = params.get('q'); if (q) st.input = q;
  renderIn(); update();
  if (!isCoarse() && !q) $('#e-in')?.focus();

  return {
    onFiles: async (files) => {
      const f = files[0]; if (!f) return;
      if (S.dir === 'decode' && f.size < 8 * 1024 * 1024 && /^(text\/|application\/(json|xml))/.test(f.type || 'text/')) { setInput(await f.text()); return; }
      if (S.dir !== 'encode') { S.dir = 'encode'; setSeg('#e-dir', 'encode'); }
      st.file = { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }; st.steps = []; renderIn(); update();
    },
    onPasteText: (t) => { st.file = null; setInput(t); return true; },
  };
}

// A gzipped, Base64-encoded log line set (decodes Base64 → gunzip → text): shows the chain on first use.
const SAMPLE_B64 = 'H4sIAAAAAAAC/23OMQuDMBQE4N1f8XBX8qJto5ChYAtdFGxLwS3EQKXVSHwW/PeNQ+nienDfHWd8HyGLMLkxkeMuZzxGTBu4lOcKQD+NftmZAKxrjZNVXUR8rTAhkANZUm+JPIszBqd7HfANLkXWwONYlwCjWnozeA2cIbdIhNHZT7fKWrnWp2qygwyT4grU9cYvhxtmGmfi8Lv4NydSNE9eGml2pg2+0yCVddwAAAA=';
