// Convert mockup · Video Converter and Audio Converter (today's "Video" and "Audio" tabs). Files load as cards; a single
// file opens its trim editor right away (player + filmstrip / waveform, Play selection, draggable handles). Nothing
// encodes until you press Convert (video work is slow and you usually trim first). Encoders are simulated in the mockup.
import { frame, renderRelated, pickFormat, targetBtn, moreBtn, clearBtn, moreOptions, field, select, seg, toggle, Queue, HumanError, describeBroken,
  stickyBar, stickyHtml, intakeHtml, slimIntakeHtml, base, plural, fmtClock, fmtDur, icon, esc, h, $, $$, store, toast, enhance, formatBytes, A } from './common.js';

const VIDEO_FORMATS = [
  { label: 'Video', items: [['mp4', 'MP4', 'Plays everywhere'], ['webm', 'WebM', 'Smaller, for the web'], ['mov', 'MOV', 'Apple apps and editing'], ['mkv', 'MKV', 'Keeps every track'], ['m4v', 'M4V', 'Apple TV and iTunes'], ['ogv', 'OGV', 'Open format, older browsers'], ['avi', 'AVI', 'Old players']] },
  { label: 'Animation', items: [['gif', 'GIF', 'Silent loop from your selection']] },
  { label: 'Sound only', items: [['mp3', 'MP3', 'Audio track, plays everywhere'], ['m4a', 'M4A', 'Audio track, Apple'], ['wav', 'WAV', 'Audio track, uncompressed'], ['flac', 'FLAC', 'Audio track, lossless'], ['ogg', 'OGG', 'Audio track, open format'], ['opus', 'OPUS', 'Audio track, best for speech'], ['aac', 'AAC', 'Audio track, raw AAC']] },
];
const AUDIO_FORMATS = [
  { label: 'Compressed', items: [['mp3', 'MP3', 'Plays everywhere'], ['m4a', 'M4A (AAC)', 'Better quality per MB'], ['ogg', 'OGG', 'Open format'], ['opus', 'OPUS', 'Best for speech'], ['aac', 'AAC', 'Raw AAC stream'], ['weba', 'WebM audio', 'For the web'], ['ac3', 'AC3', 'Home cinema']] },
  { label: 'Lossless', items: [['wav', 'WAV', 'Uncompressed, for editing'], ['flac', 'FLAC', 'About half the size of WAV'], ['aiff', 'AIFF', 'Uncompressed, Apple'], ['alac', 'ALAC (M4A)', 'Lossless, Apple']] },
];
const AUDIO_ONLY = new Set(['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aac', 'weba', 'ac3', 'aiff', 'alac']);
const LOSSLESS = new Set(['wav', 'flac', 'aiff', 'alac']);
const BROWSER_ENC = new Set(['mp4', 'mov', 'm4v', 'mkv', 'webm']); // WebCodecs; everything else needs the one-time FFmpeg download
const OUT_EXT = { alac: 'm4a', weba: 'webm' };
const VIDEO_ACCEPT = '.mp4,.mov,.m4v,.avi,.mkv,.webm,.flv,.wmv,.3gp,.3g2,.ts,.mts,.m2ts,.mpeg,.mpg,.ogv,.vob,.asf,.mxf,.divx,video/*';
const AUDIO_ACCEPT = '.mp3,.wav,.aac,.ogg,.oga,.flac,.m4a,.wma,.aiff,.aif,.opus,.ac3,.alac,.caf,.amr,.ape,.weba,audio/*,' + VIDEO_ACCEPT;
const QUAL = [['very-high', 'Very high · largest file'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['very-low', 'Very low · smallest file']];
const QF = { 'very-high': 1.6, high: 1, medium: 0.7, low: 0.48, 'very-low': 0.3 };
const RES = [['orig', 'Original'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']];
const RF = { orig: 1, 1080: 1, 720: 0.48, 480: 0.24, 360: 0.14 };
const FFMPEG_MB = 31;

export function init(ctx) {
  const video = ctx.tool === 'video';
  const FORMATS = video ? VIDEO_FORMATS : AUDIO_FORMATS;
  const NAME = Object.fromEntries(FORMATS.flatMap((g) => g.items.map(([id, n]) => [id, n])));
  const key = video ? 'video' : 'audio';
  const DEF = video ? { res: 'orig', quality: 'high', fps: '', sound: true, copy: false, abr: '128', asr: '' } : { abr: '128', asr: '44100', ch: '2', normalize: false };
  const o = { ...DEF, ...(store.get(`cv-${key}-opts`) || {}) };
  let target = ctx.preset?.to || store.get(`cv-target-${key}`) || (video ? 'mp4' : 'mp3');
  let picked = !!(ctx.preset || store.get(`cv-target-${key}`));
  let engineReady = !!store.get('cv-ffmpeg-cached');
  const noun = video ? ['video', 'videos'] : ['file', 'files'];
  const accept = video ? VIDEO_ACCEPT : AUDIO_ACCEPT;
  const presetNoun = ctx.preset?.noun;

  $('#cv-tool').innerHTML = `
    <div class="cv-bar"><span class="cv-bar__label"><span class="xs-hide">Convert to</span><span class="xs-show">To</span></span>${targetBtn('cv-target', NAME[target])}<span class="cv-bar__hint" id="cv-hint"></span>
      ${moreBtn()}<span class="fw-spacer"></span>${clearBtn()}</div>
    <div class="cv-opts" id="cv-opts" hidden></div>
    <div id="cv-intake">${intakeHtml({ icon: video ? 'film' : 'music', title: presetNoun ? `Drop ${presetNoun} here` : video ? 'Drop videos here' : 'Drop audio or video files here',
      touch: presetNoun ? `Choose ${presetNoun}` : video ? 'Choose videos' : 'Choose audio or video', accept,
      sub: ctx.preset ? (video ? 'Any video works' : 'Any audio or video works') : video ? 'MP4, MOV, MKV, WebM, AVI, WMV, 3GP, MPEG and more' : 'MP3, WAV, M4A, FLAC, OGG, AAC, OPUS, AIFF, or a video',
      samples: video || ctx.preset?.id === 'mp4-to-mp3' ? `${A}IMG_4040.MOV` : `${A}interview-take-3.m4a` })}</div>
    <div class="fw-items cv-items" id="cv-items" aria-label="${video ? 'Videos' : 'Audio files'}" hidden></div>
    <div id="cv-add" hidden>${slimIntakeHtml(video ? 'Add more videos' : 'Add more files', accept)}</div>
    <div class="cv-run" id="cv-run" hidden><div class="cv-run__sum"><span class="cv-run__line" id="run-line"></span><span class="cv-run__sub" id="run-sub"></span></div>
      <button class="fw-btn fw-btn--primary fw-btn--lg" type="button" id="cv-go">Convert</button></div>`;
  $('#main').insertAdjacentHTML('beforeend', stickyHtml());
  frame(ctx, { accept: video ? ['video'] : ['audio', 'video'], onFiles: (f) => add(f),
    lede: ctx.preset ? `Convert ${presetNoun} to ${NAME[ctx.preset.to]}. ${video ? 'Any video works.' : 'Any audio or video works.'}` : undefined,
    commands: [{ id: 'go', label: 'Convert', icon: 'play', kbd: 'mod+enter', run: () => $('#cv-go').click() }, { id: 'opts', label: 'More options', icon: 'sliders-horizontal', run: () => more.open() }] });
  enhance($('#cv-tool'));
  renderRelated(ctx);

  const q = new Queue({
    list: $('#cv-items'), auto: false, parallel: 1,
    prepare: (it) => { it.probed = probe(it); },
    thumb: (it) => (it.thumbUrl ? `<img alt="" src="${it.thumbUrl}">${it.dur ? `<span class="cv-dur">${fmtDur(it.dur)}</span>` : ''}` : icon(it.status === 'error' ? 'file-question' : it.isVideo ? 'film' : 'music', { size: 20 })),
    meta: (it) => {
      const parts = [`<span>${formatBytes(it.size)}</span>`];
      if (it.dur) parts.push(`<span class="fw-num">${trimmed(it) ? `${fmtClock(it.t1 - it.t0)} of ${fmtDur(it.dur)}` : fmtDur(it.dur)}</span>`);
      if (it.vh) parts.push(`<span>${it.vh}p</span>`);
      if (it.status !== 'error') parts.push(`<span>${esc(it.ext.toUpperCase())} → ${esc(NAME[target])}</span>`);
      return parts.join('<span aria-hidden="true">·</span>');
    },
    readyHtml: (it) => (it.dur ? `<span class="fw-muted fw-num">≈ ${formatBytes(estimate(it))}</span>` : '<span class="fw-faint">Loading…</span>'),
    extraActions: (it) => (it.status === 'error' || !it.dur ? [] : [`<button class="fw-iconbtn fw-iconbtn--sm" type="button" data-act="trim" aria-label="Trim ${esc(it.name)}" aria-pressed="${!!it.open}" data-tip="Trim">${icon('scissors')}</button>`]),
    onAction: (it, a) => { if (a === 'trim') { it.open = !it.open; q.render(it); if (it.open) it.el.querySelector('.cv-trim')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } },
    panel: (it, el) => {
      if (!it.open || it.status === 'error' || !it.dur) return false;
      if (!el.querySelector('.cv-trim')) mountTrim(it, el); else syncTrim(it);
      return true;
    },
    work: (it, { progress, alive }) => encode(it, progress, alive),
    onChange: () => paint(), onProgress: () => paintRun(),
    onBatchDone: () => { const s = q.stats(); if (s.done.length && document.hidden) toast(`Converted ${plural(s.done.length, noun[0], noun[1])}`); },
  });
  const paintBar = stickyBar(q, { noun, zipStem: (done) => (done.length > 1 ? `${base(done[0].name)}-and-${done.length - 1}-more` : base(done[0].name)) });

  function add(files) {
    const ok = files.filter((f) => /^(video|audio)\//.test(f.type) || new RegExp(`\\.(${accept.replace(/[.*/]|video|audio/g, '').split(',').filter(Boolean).join('|')})$`, 'i').test(f.name));
    if (ok.length < files.length) toast(`${plural(files.length - ok.length, 'file', 'files')} skipped: not ${video ? 'a video' : 'audio or video'}`, { type: 'warning' });
    if (!ok.length) return;
    if (!picked && !q.items.length && !video) {
      const exts = ok.map((f) => f.name.split('.').pop().toLowerCase());
      if (exts.every((e) => e === 'mp3')) { target = 'wav'; $('#cv-hint').textContent = 'suggested · for editing'; paintTarget(); }
    }
    const added = q.add(ok);
    if (q.items.length === 1 && added.length === 1) added[0].open = true;
    $('#cv-intake').hidden = true; $('#cv-items').hidden = false; $('#cv-add').hidden = false;
  }

  // ── probe: duration, size, first frame, waveform peaks (real) ──
  async function probe(it) {
    it.isVideo = /^video\//.test(it.file.type) || /\.(mp4|mov|m4v|avi|mkv|webm|flv|wmv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|ogv|vob|asf|mxf|divx)$/i.test(it.name);
    it.url = URL.createObjectURL(it.file);
    const el = document.createElement(it.isVideo ? 'video' : 'audio'); el.muted = true; el.preload = 'auto'; el.src = it.url;
    try {
      await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('decode')); setTimeout(() => rej(new Error('timeout')), 8000); });
      it.dur = el.duration; it.t0 = 0; it.t1 = it.dur;
      if (it.isVideo && el.videoWidth) {
        it.vw = el.videoWidth; it.vh = Math.min(el.videoWidth, el.videoHeight);
        el.currentTime = Math.min(it.dur * 0.3, 2); await new Promise((r) => (el.onseeked = r));
        const c = document.createElement('canvas'); c.width = 88; c.height = 88; const x = c.getContext('2d'); const s = Math.max(88 / el.videoWidth, 88 / el.videoHeight);
        x.drawImage(el, (88 - el.videoWidth * s) / 2, (88 - el.videoHeight * s) / 2, el.videoWidth * s, el.videoHeight * s);
        it.thumbUrl = c.toDataURL('image/jpeg', 0.8); it.probeEl = el; prefetchFrames(it, el);
      }
      it.status = 'ready';
    } catch {
      it.status = 'error';
      it.err = new HumanError(await describeBroken(it.file, video ? 'a video' : 'an audio file'), { detail: `${it.name} · ${it.size} bytes · the browser could not read its header` });
    }
    q.render(it); paint();
  }
  const trimmed = (it) => it.dur && (it.t0 > 0.05 || it.t1 < it.dur - 0.05);
  function estimate(it) {
    const sec = (it.t1 ?? it.dur) - (it.t0 ?? 0) || 1;
    if (AUDIO_ONLY.has(target)) {
      if (LOSSLESS.has(target)) return sec * (target === 'flac' || target === 'alac' ? 105000 : 176400) * (o.ch === '1' ? 0.5 : 1);
      return sec * (+o.abr * 1000 / 8) * (o.ch === '1' && !video ? 0.85 : 1);
    }
    if (o.copy && target !== 'gif') return it.size * (sec / it.dur);
    if (target === 'gif') return sec * 300000 * Math.min(1, RF[o.res] * 2);
    const base = { mp4: 720000, mov: 800000, m4v: 720000, mkv: 720000, webm: 500000, ogv: 560000, avi: 900000 }[target] || 700000;
    const fpsK = o.fps ? Math.min(1, +o.fps / 30) * 0.7 + 0.3 : 1;
    return sec * (base * RF[o.res] * QF[o.quality] * fpsK + (o.sound ? 16000 : 0));
  }

  // ── simulated encode with an honest engine step ──
  async function encode(it, progress, alive) {
    await it.probed;
    const needsFfmpeg = video ? !(BROWSER_ENC.has(target) && !o.copy) : true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (needsFfmpeg && !engineReady) {
      for (let mb = 0; mb <= FFMPEG_MB; mb += 1.5) { if (!alive()) return null; progress((mb / FFMPEG_MB) * 30, `Getting converter ${Math.round(mb)} of ${FFMPEG_MB} MB ·`); await wait(55); }
      engineReady = true; store.set('cv-ffmpeg-cached', true);
    }
    const sec = it.t1 - it.t0; const startP = it.p; const total = Math.min(7000, 900 + sec * (video ? (o.copy ? 30 : 260) : 70));
    const t0 = performance.now();
    while (performance.now() - t0 < total) { if (!alive()) return null; progress(startP + ((performance.now() - t0) / total) * (99 - startP), ''); await wait(80); }
    const bytes = Math.max(2000, Math.round(estimate(it) * (0.92 + ((it.id * 37) % 13) / 100)));
    const ext = OUT_EXT[target] || target;
    const blob = new Blob([it.file.slice(0, Math.min(bytes, it.size)), new Uint8Array(Math.max(0, bytes - it.size))], { type: it.file.type });
    const notes = [];
    if (trimmed(it)) notes.push(`Trimmed to ${fmtClock(it.t0)}–${fmtClock(it.t1)}.`);
    if (needsFfmpeg) notes.push('Encoded with FFmpeg (cached in this browser).');
    return { blob, name: `${base(it.name)}${trimmed(it) ? '-trim' : ''}.${ext}`, note: notes.join(' ') };
  }

  // ── trim editor ──
  function mountTrim(it, panel) {
    const D = it.dur; panel.hidden = false;
    panel.innerHTML = `<div class="cv-trim ${it.isVideo ? '' : 'cv-trim--audio'}" role="group" aria-label="Trim ${esc(it.name)}">
      ${it.isVideo ? `<div class="cv-trim__player"><video controls playsinline preload="metadata" src="${it.url}"></video></div>` : ''}
      <div class="cv-trim__main">
        <div class="cv-trim__top"><button class="fw-btn fw-btn--sm" type="button" data-play>${icon('play')}<span>Play selection</span></button>
          <span class="cv-trim__range fw-mono"></span><span class="fw-spacer"></span><button class="fw-btn fw-btn--ghost fw-btn--sm" type="button" data-reset hidden>Reset</button></div>
        ${it.isVideo ? '' : `<audio controls preload="metadata" src="${it.url}"></audio>`}
        <div class="cv-film ${it.isVideo ? '' : 'cv-film--wave'}">
          ${it.isVideo ? `<div class="cv-film__frames">${Array.from({ length: 10 }, () => '<canvas width="128" height="72"></canvas>').join('')}</div>` : '<canvas class="cv-film__wave" aria-hidden="true"></canvas>'}
          <div class="cv-film__shade cv-film__shade--l"></div><div class="cv-film__shade cv-film__shade--r"></div><div class="cv-film__sel"></div><div class="cv-film__head"></div>
          <button class="cv-film__handle" type="button" data-h="t0" role="slider" aria-label="Start" aria-valuemin="0" aria-valuemax="${D.toFixed(1)}"></button>
          <button class="cv-film__handle" type="button" data-h="t1" role="slider" aria-label="End" aria-valuemin="0" aria-valuemax="${D.toFixed(1)}"></button></div>
        <div class="cv-film__times"><span>0:00</span><span>${fmtDur(D)}</span></div></div></div>`;
    enhance(panel);
    const film = panel.querySelector('.cv-film'); const player = panel.querySelector('video,audio');
    const commit = () => { syncTrim(it); if (it.status === 'done' || it.status === 'cancelled') q.requeue(it); else { q.render(it); paint(); } };
    $$('.cv-film__handle', panel).forEach((hd) => {
      const k = hd.dataset.h;
      const setT = (t) => { const min = 0.5; it[k] = k === 't0' ? Math.max(0, Math.min(t, it.t1 - min)) : Math.min(D, Math.max(t, it.t0 + min)); it[k] = Math.round(it[k] * 10) / 10; syncTrim(it); if (player) { player.pause(); player.currentTime = it[k]; } };
      hd.addEventListener('pointerdown', (e) => {
        e.preventDefault(); hd.setPointerCapture(e.pointerId); hd.focus(); hd.classList.add('is-drag');
        const r = film.getBoundingClientRect();
        const move = (ev) => setT(((ev.clientX - r.left) / r.width) * D);
        const up = () => { hd.removeEventListener('pointermove', move); hd.classList.remove('is-drag'); commit(); };
        hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up, { once: true }); hd.addEventListener('pointercancel', up, { once: true });
      });
      hd.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 1 : 0.1; const m = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
        if (m !== undefined) { e.preventDefault(); setT(it[k] + m); commit(); } else if (e.key === 'Home') { e.preventDefault(); setT(0); commit(); } else if (e.key === 'End') { e.preventDefault(); setT(D); commit(); }
      });
    });
    panel.querySelector('[data-reset]').onclick = () => { it.t0 = 0; it.t1 = D; commit(); };
    const playBtn = panel.querySelector('[data-play]'); const head = panel.querySelector('.cv-film__head');
    playBtn.onclick = () => {
      if (!player) return;
      if (!player.paused) { player.pause(); return; }
      player.muted = false; player.currentTime = it.t0; player.play().catch(() => {});
    };
    if (player) {
      const tick = () => { head.style.left = (player.currentTime / D) * 100 + '%'; head.classList.toggle('is-on', !player.paused); if (!player.paused && player.currentTime >= it.t1) { player.pause(); player.currentTime = it.t1; } if (!player.paused) requestAnimationFrame(tick); };
      player.addEventListener('play', () => { playBtn.querySelector('span').textContent = 'Pause'; playBtn.querySelector('.fw-icon').outerHTML = icon('pause'); tick(); });
      player.addEventListener('pause', () => { playBtn.querySelector('span').textContent = 'Play selection'; const ic = playBtn.querySelector('.fw-icon'); if (ic) ic.outerHTML = icon('play'); head.classList.remove('is-on'); });
    }
    syncTrim(it);
    if (it.isVideo) drawFrames(it, panel); else drawWave(it, panel);
  }
  function syncTrim(it) {
    const p = it.el?.querySelector('.cv-trim'); if (!p) return;
    const D = it.dur; const l = (it.t0 / D) * 100; const r = (it.t1 / D) * 100;
    p.querySelector('.cv-film__shade--l').style.width = l + '%'; p.querySelector('.cv-film__shade--r').style.width = 100 - r + '%';
    Object.assign(p.querySelector('.cv-film__sel').style, { left: l + '%', width: r - l + '%' });
    const [a, b] = $$('.cv-film__handle', p); a.style.left = l + '%'; b.style.left = r + '%';
    a.setAttribute('aria-valuenow', it.t0.toFixed(1)); a.setAttribute('aria-valuetext', fmtClock(it.t0));
    b.setAttribute('aria-valuenow', it.t1.toFixed(1)); b.setAttribute('aria-valuetext', fmtClock(it.t1));
    p.querySelector('.cv-trim__range').innerHTML = `${fmtClock(it.t0)} – ${fmtClock(it.t1)} <span class="fw-faint">· ${(it.t1 - it.t0).toFixed(1)} s</span>`;
    p.querySelector('[data-reset]').hidden = !trimmed(it);
    paintRun();
  }
  /** Filmstrip frames decode once, progressively, right after probing, so the editor fills in as you look at it. */
  function prefetchFrames(it, v) {
    if (it.framesP) return it.framesP;
    it.frameList = [];
    it.framesP = (async () => {
      for (let i = 0; i < 10; i++) {
        v.currentTime = Math.min(it.dur - 0.05, ((i + 0.5) * it.dur) / 10); await new Promise((r) => (v.onseeked = r));
        const c = document.createElement('canvas'); c.width = 128; c.height = 72; const x = c.getContext('2d'); const s = Math.max(128 / v.videoWidth, 72 / v.videoHeight);
        x.drawImage(v, (128 - v.videoWidth * s) / 2, (72 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
        it.frameList[i] = c; it.onFrame?.(i);
      }
    })();
    return it.framesP;
  }
  function drawFrames(it, panel) {
    const paintOne = (i) => { const c = $$('.cv-film__frames canvas', panel)[i]; if (c && it.frameList[i]) { c.getContext('2d').drawImage(it.frameList[i], 0, 0); c.classList.add('is-ready'); } };
    it.onFrame = paintOne;
    (it.frameList || []).forEach((_, i) => paintOne(i));
    if (!it.framesP && it.probeEl) prefetchFrames(it, it.probeEl);
  }
  async function drawWave(it, panel) {
    const c = panel.querySelector('.cv-film__wave'); const r = c.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
    c.width = Math.max(200, Math.round(r.width * dpr)); c.height = Math.round(r.height * dpr);
    if (!it.peaks) {
      it.peaks = (async () => {
        try {
          const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100);
          const buf = await ac.decodeAudioData(await it.file.arrayBuffer()); const d = buf.getChannelData(0); const N = 400; const step = Math.floor(d.length / N); const peaks = [];
          for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(d[j])); peaks.push(m); }
          return peaks;
        } catch { return null; }
      })();
    }
    const peaks = await it.peaks; const x = c.getContext('2d'); const W = c.width; const H = c.height;
    x.clearRect(0, 0, W, H);
    const col = getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim() || '#15803d';
    if (!peaks) { x.fillStyle = col; x.fillRect(0, H / 2 - 1, W, 2); return; }
    const max = Math.max(...peaks) || 1; const bw = W / peaks.length;
    x.fillStyle = col;
    peaks.forEach((p, i) => { const hgt = Math.max(2 * dpr, (p / max) * (H - 12 * dpr)); x.fillRect(i * bw + bw * 0.15, (H - hgt) / 2, bw * 0.7, hgt); });
  }
  addEventListener('fw-theme-change', () => q.items.forEach((it) => it.open && !it.isVideo && it.el && drawWave(it, it.el.querySelector('.cv-panel'))));

  // ── run row: summary + Convert / Cancel ──
  $('#cv-go').onclick = () => {
    if (q.busy) { q.cancelAll(); toast('Cancelled', { type: 'neutral', duration: 1600 }); return; }
    q.runAll();
  };
  function paintRun() {
    const its = q.items.filter((x) => x.status !== 'error'); const run = $('#cv-run');
    const todo = its.filter((x) => ['ready', 'cancelled'].includes(x.status));
    const busy = q.busy;
    run.hidden = !busy && !todo.length;
    if (run.hidden) return;
    const go = $('#cv-go');
    if (busy) {
      const working = its.filter((x) => x.status === 'working' || x.status === 'queued'); const cur = working.find((x) => x.status === 'working');
      const doneN = its.filter((x) => x.status === 'done').length;
      $('#run-line').textContent = cur?.stage?.startsWith('Getting') ? `${cur.stage.replace(/ ·$/, '')} (one time)` : `Converting ${doneN + 1} of ${doneN + working.length} · ${Math.round(cur?.p || 0)} %`;
      $('#run-sub').textContent = cur?.stage?.startsWith('Getting') ? `${NAME[target]} needs FFmpeg; it stays cached in this browser.` : (cur ? `${cur.name} → ${NAME[target]}` : '');
      go.textContent = 'Cancel'; go.className = 'fw-btn fw-btn--lg'; return;
    }
    const sec = todo.reduce((s, x) => s + ((x.t1 ?? 0) - (x.t0 ?? 0)), 0); const est = todo.reduce((s, x) => s + (x.dur ? estimate(x) : 0), 0);
    $('#run-line').textContent = `${plural(todo.length, noun[0], noun[1])}${sec ? ` · ${sec < 60 ? sec.toFixed(1) + ' s' : fmtDur(sec)}` : ''} → ${NAME[target]}${est ? ` · about ${formatBytes(est)}` : ''}`;
    const needs = (video ? !(BROWSER_ENC.has(target) && !o.copy) : true) && !engineReady;
    $('#run-sub').textContent = needs ? `${NAME[target]} needs a one-time ${FFMPEG_MB} MB download.` : todo.some((x) => x.out === null && x.run > 1) ? 'Settings changed · convert again' : '';
    go.textContent = q.items.some((x) => x.status === 'done') ? `Convert ${todo.length === 1 ? 'again' : todo.length}` : 'Convert'; go.className = 'fw-btn fw-btn--primary fw-btn--lg';
  }

  // ── target, More options ──
  function paintTarget() { $('#cv-target [data-l]').textContent = NAME[target]; more.refresh(); q.items.forEach((x) => { if (x.status === 'done' || x.status === 'cancelled') q.requeue(x); else q.render(x); }); paint(); }
  $('#cv-target').onclick = (e) => pickFormat(e.currentTarget, { groups: FORMATS, current: target, onPick: (f) => { if (f === target) return; target = f; picked = true; $('#cv-hint').textContent = ''; store.set(`cv-target-${key}`, f); paintTarget(); } });
  $('#cv-clear').onclick = () => q.clear();
  const changed = () => { store.set(`cv-${key}-opts`, o); more.paint(); q.items.forEach((x) => { if (x.status === 'done' || x.status === 'cancelled') q.requeue(x); else if (x.status === 'ready') q.render(x); }); paint(); };
  const more = moreOptions({
    button: $('.cv-more'), panel: $('#cv-opts'),
    summary: () => {
      const s = [];
      if (video && !AUDIO_ONLY.has(target)) {
        if (o.copy && target !== 'gif') s.push('copy streams');
        else { if (o.res !== 'orig') s.push(o.res + 'p'); if (o.quality !== 'high') s.push(QUAL.find((x) => x[0] === o.quality)[1].split(' ·')[0].toLowerCase() + ' quality'); if (o.fps) s.push(o.fps + ' fps'); }
        if (!o.sound && target !== 'gif') s.push('no sound');
      } else {
        if (!LOSSLESS.has(target) && o.abr !== '128') s.push(o.abr + ' kbps');
        if (o.asr && o.asr !== DEF.asr) s.push(`${+o.asr / 1000} kHz`);
        if (!video && o.ch !== '2') s.push(o.ch === '1' ? 'mono' : 'original channels');
        if (!video && o.normalize) s.push('normalized');
      }
      return s.join(' · ');
    },
    render: (p) => {
      const audioOut = AUDIO_ONLY.has(target);
      if (video && !audioOut) {
        const dis = o.copy && target !== 'gif';
        p.innerHTML = `<div class="cv-opts__grid">
          <div class="cv-opts__group ${dis ? 'cv-disabled' : ''}">${field('Resolution', seg('o-res', 'Resolution', RES, o.res))}
            ${field('Quality', select('o-q', QUAL, o.quality), { id: 'o-q', hint: 'Higher quality keeps more detail and makes larger files.' })}</div>
          <div class="cv-opts__group ${dis ? 'cv-disabled' : ''}">${field('Frame rate', select('o-fps', [['', 'Original'], ['60', '60 fps'], ['30', '30 fps'], ['24', '24 fps'], ['15', '15 fps']], o.fps), { id: 'o-fps' })}</div>
          ${target === 'gif' ? '<div class="cv-opts__group"><span class="fw-muted cv-opts__note">GIFs have no sound. Use the trim handles to pick the loop.</span></div>'
            : `<div class="cv-opts__group">${toggle('o-sound', 'Keep sound', o.sound)}${toggle('o-copy', 'Fast remux (copy streams)', o.copy, 'Same quality, no re-encoding. Resolution, quality and frame rate don’t apply.')}</div>`}</div>`;
      } else {
        p.innerHTML = `<div class="cv-opts__grid">
          <div class="cv-opts__group">${LOSSLESS.has(target) ? `<span class="cv-opts__h">Bitrate</span><span class="fw-muted cv-opts__note">${NAME[target]} is lossless, no bitrate to set.</span>` : field(video ? 'Audio bitrate' : 'Bitrate', select('o-abr', (video ? [96, 128, 192, 256, 320] : [64, 96, 128, 192, 256, 320]).map((v) => [String(v), `${v} kbps`]), o.abr), { id: 'o-abr' })}</div>
          <div class="cv-opts__group">${field('Sample rate', select('o-asr', video ? [['', 'Original'], ['44100', '44100 Hz'], ['48000', '48000 Hz']] : [['', 'Original'], ['22050', '22050 Hz'], ['44100', '44100 Hz'], ['48000', '48000 Hz'], ['96000', '96000 Hz']], o.asr), { id: 'o-asr' })}</div>
          ${video ? '' : `<div class="cv-opts__group">${field('Channels', seg('o-ch', 'Channels', [['', 'Original'], ['1', 'Mono'], ['2', 'Stereo']], o.ch))}${toggle('o-norm', 'Normalize volume', o.normalize, 'Evens out quiet and loud recordings.')}</div>`}</div>`;
      }
      const on = (id, ev, fn) => p.querySelector('#' + id)?.addEventListener(ev, fn);
      p.querySelector('#o-res')?.addEventListener('fw-change', (e) => { o.res = e.detail.value; changed(); });
      p.querySelector('#o-ch')?.addEventListener('fw-change', (e) => { o.ch = e.detail.value; changed(); });
      on('o-q', 'change', (e) => { o.quality = e.target.value; changed(); });
      on('o-fps', 'change', (e) => { o.fps = e.target.value; changed(); });
      on('o-sound', 'change', (e) => { o.sound = e.target.checked; changed(); });
      on('o-copy', 'change', (e) => { o.copy = e.target.checked; more.refresh(); changed(); });
      on('o-abr', 'change', (e) => { o.abr = e.target.value; changed(); });
      on('o-asr', 'change', (e) => { o.asr = e.target.value; changed(); });
      on('o-norm', 'change', (e) => { o.normalize = e.target.checked; changed(); });
    },
  });
  function paint() {
    const n = q.items.length; $('#cv-clear').hidden = !n;
    if (!n) { $('#cv-intake').hidden = false; $('#cv-items').hidden = true; $('#cv-add').hidden = true; }
    paintRun(); paintBar();
  }
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !$('#cv-run').hidden) { e.preventDefault(); $('#cv-go').click(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('#cv-ab').hidden) { e.preventDefault(); $('#ab-primary').click(); }
  });
  paint();
}
