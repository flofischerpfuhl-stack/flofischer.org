// Startseite „Auseinandergenommen“: das Projekt als auseinandergezogener Stapel, die App selbst zum Ausprobieren und die Vorführungen von PDF und Image.
import { rng, ridge, poly } from './scene.js';
import { ico, TRUST, mount } from './common.js';

const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement, LIGHT = root.dataset.app === 'light', IMG = LIGHT ? 'img/l-' : 'img/', still = root.classList.contains('static') || matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Inhalte, die Symbole brauchen ---- */
// x: Lage des Reiters im Fenster in %. cuts: Ausschnitt [Datei, x, y, b, h im Fenster 1240×775, dann links, oben, Breite in % der Scheibe].
const TABS = [
  { id: 'files', label: 'Files', ico: 'folder', t: '#ecbf5c', note: 'The project folder', x: [23.47, 31.1], cuts: [['plan', 876, 188, 348, 246, 58, 6, 40], ['row', 538, 128, 313, 55, 4, 8, 40]] },
  { id: 'mail', label: 'Mail', ico: 'mail', t: '#79a8f5', note: 'Sorted into the project', x: [31.2, 38.9], cuts: [['row', 287, 162, 408, 82, 4, 13, 46], ['msg', 730, 374, 482, 166, 4, 32, 40]] },
  { id: 'tasks', label: 'Tasks', ico: 'task', t: '#62c690', note: 'One board per project', x: [39, 47.85], cuts: [['card', 905, 182, 284, 152, 58, 12, 38]] },
  { id: 'chat', label: 'Chat', ico: 'chat', t: '#b690f2', note: 'The project channel', x: [47.95, 54], cuts: [['talk', 297, 486, 470, 138, 4, 12, 46, 'fade']] },
  { id: 'calendar', label: 'Calendar', ico: 'cal', t: '#f2716b', note: 'Only this project’s dates', x: [54.1, 62.5], cuts: [['week', 476, 262, 245, 205, 58, 8, 30]] },
];
// Unscharfes Vorschaubild (64×40) des Grundfensters, damit bei langsamer Leitung kein schwarzer Kasten steht.
const LQIP = LIGHT ? 'data:image/webp;base64,UklGRiwBAABXRUJQVlA4ICABAAAQCQCdASpAACgAPtFYpk6oJKMiKBqriQAaCWkADpfggLjvIiP2CdQckCpxR5khVgY5wuUvD90l63Og3R9CcMhfszhwO1F+sfc3PQHMTffpFIAA/u2IWZUmjFie70cp5YcoEbCvtCz5896gM0kDo0D/vgyAsW3SoKWng7k3OeSfDdL4q61eP+27nJUp2SHWjX07G/YcH0arWoUCmX4KPN/oCZ5uPo6ZeSvb8z+kNY/O3fCXR0ZQjMqVx2itHDX4QcDCUjCxhMcXzhK04/ogaZiakAy6+Ob7wyl0ug/OFsDpNTMpKa7P7bxlHKhsjU2Cg5LDrHoR68eHKwYI8HuSuPLeGfzgkxACMEELbOxYGo4UhxT4m17SXjHmAHNZh03qAAA=' : 'data:image/webp;base64,UklGRlIBAABXRUJQVlA4IEYBAADQCACdASpAACgAPtFYo0uoJSMhrVZtsQAaCWkADpxhUf/SKTTl4i3CgFQztVFSclyEoIRxtlmW96QTi0OvKAtgav5ky/x9ce5R7gQxMf0AAP7yvhc6m1PihhATUWeh7lP+ht24E6FT1EkJ9fNci+eCnzPP2xxMngxiJDieQ983uXP1dt3h2k4Rp1fkBwWqgYj4Lnlx1G5F9Azn1EhttDIDbR577/33lCcWEYkeBuuapGDjlQYHXqx+ByWcJms+70haYTp3HXiZ7XRgoCtkpV0vwa1UkFHnOBgSMlYRNsAyIUDuUTYWoamWctyFCRl+8pQPkIVAFHrhSb6sep9cpYa4kVuKk9MBbei17Mw7jnTYNAL8pK9UdjfwL3knjmjcbjTvZe+xdaGmSwI7bMuKobhpsP4x+LcdYaLjWvNDiiM7q/xeXYAAAA==';
const pct = (v, of) => `${(v / of * 100).toFixed(2)}%`;
$('#prig').innerHTML = `<div class="pane base" style="--z:0px;background-image:url(${LQIP});background-size:cover">${TABS.map((t, i) => `<img ${i ? 'data-src' : 'fetchpriority="high" src'}="${IMG.replace('img/', 'img/h-')}win-${t.id}.webp" alt="berg:work Projects, ${t.label}" data-t="${t.id}" decoding="async"${i ? '' : ' class="on"'}>`).join('')}<div class="cover"></div>${TABS.map((t) => `<button class="hot" data-t="${t.id}" style="left:${t.x[0]}%;width:${(t.x[1] - t.x[0]).toFixed(2)}%" aria-label="${t.label}" tabindex="-1"></button>`).join('')}</div>`
  + TABS.map((t, i) => `<div class="pane glass" data-t="${t.id}" style="--t:${t.t};--z:${(TABS.length - i) * 56}px;--tx:${[22, 37, 52, 66.5, 80][i]}%">${t.cuts.map(([n, x, y, w, h, x1, y1, w1, cls = '']) => `<i class="frag ${cls}" style="--x0:${pct(x, 1240)};--y0:${pct(y, 775)};--w0:${pct(w, 1240)};--x1:${x1}%;--y1:${y1}%;--w1:${w1}%;--ar:${w}/${h};background-image:url(${IMG}f-${t.id}-${n}.webp)"></i>`).join('')}<span class="tab">${ico(t.ico, 18)}${t.label}</span></div>`).join('');
$('#prows').innerHTML = TABS.map((t) => `<button class="lrow" data-t="${t.id}" style="--t:${t.t}"><span class="th">${ico(t.ico, 19)}</span><span><b>${t.label}</b><small>${t.note}</small></span>${ico('arrow', 17).replace('class="ic"', 'class="ic go"')}</button>`).join('');
$('#pmap').innerHTML = [['folder', 'var(--yellow)', 'Files', 'the project folder in SharePoint or OneDrive'], ['mail', 'var(--blue)', 'Mail', 'sorted into projects, still in Outlook'], ['task', 'var(--green)', 'Tasks', 'one board per project, as Planner tasks'], ['chat', 'var(--purple)', 'Chat', 'the project channel in Teams']]
  .map(([i, c, h, t]) => `<div><b style="--t:${c}">${ico(i, 19)}${h}</b>${ico('arrow', 17).replace('class="ic"', 'class="ic ar"')}<span>${t}</span></div>`).join('');
$('#ptools').innerHTML = [['file', 'Pages', 'Append, reorder, delete and rotate.'], ['shield', 'Redaction', 'The characters are deleted from the file, not hidden under a black box.'], ['pen', 'Signatures', 'Draw, type or insert yours, or sign with a certificate.'], ['scan', 'Text recognition', 'Two to four seconds per scanned page, in your browser.']]
  .map(([i, h, t]) => `<div><b>${ico(i, 17)}${h}</b>${t}</div>`).join('');
$('#facts').innerHTML = TRUST.map(([i, h, t], n) => `<div class="rv" style="--d:${n * 0.06}s">${ico(i, 26)}<h3>${h}</h3>${t}</div>`).join('');
$('#logrows').innerHTML = Array.from({ length: 25 }, (_, i) => `<li style="--i:${i}">GET</li>`).join('');
mount();

/* ---- Anfang: das Projekt auseinandernehmen und wieder zusammensetzen ---- */
{
  const stack = $('#pstack'), rig = $('#prig'), rows = $('#prows'), hint = $('#phint'), flatBtn = $('#pflat'); let flat = true, turn = 0, used = false;
  // Bei schlechter Verbindung zuerst nur das sichtbare Fenster laden, die anderen vier danach.
  const load = (im) => { if (im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; } };
  const show = (id) => { $$('.base img', rig).forEach((im) => { if (im.dataset.t === id) load(im); im.classList.toggle('on', im.dataset.t === id); }); $$('.lrow', rows).forEach((r) => r.classList.toggle('on', flat && r.dataset.t === id)); stack.dataset.tab = id; };
  const hl = (id) => { if (flat) id = ''; stack.classList.toggle('dim', !!id); $$('.glass', rig).forEach((s) => s.classList.toggle('hl', s.dataset.t === id)); $$('.lrow', rows).forEach((r) => r.classList.toggle('hl', r.dataset.t === id)); };
  const setFlat = (f, quiet) => { flat = f; hl(''); stack.classList.toggle('flat', f); stack.style.setProperty('--k', f ? 0 : 1); flatBtn.textContent = f ? 'Take apart' : 'Put together'; hint.classList.toggle('off', !f || quiet || used); $$('.hot', rig).forEach((b) => { b.tabIndex = f ? 0 : -1; }); show(stack.dataset.tab || 'files'); };
  rows.addEventListener('pointerover', (e) => { const r = e.target.closest('.lrow'); if (r) hl(r.dataset.t); });
  rows.addEventListener('pointerleave', () => hl(''));
  rows.addEventListener('click', (e) => { const r = e.target.closest('.lrow'); if (!r) return; stack.dataset.tab = r.dataset.t; used = true; setFlat(true); });
  rig.addEventListener('pointerover', (e) => { const s = e.target.closest('.glass'); if (s) hl(s.dataset.t); }); rig.addEventListener('pointerleave', () => hl(''));
  rig.addEventListener('click', (e) => { const b = e.target.closest('.hot'), s = e.target.closest('.glass'); if (b) { used = true; hint.classList.add('off'); show(b.dataset.t); } else if (s && !flat) { stack.dataset.tab = s.dataset.t; setFlat(true); } });
  flatBtn.onclick = () => setFlat(!flat);
  $('#pspin').onclick = () => { turn = (turn + 1) % 3; stack.style.setProperty('--rz', ['-32deg', '28deg', '-10deg'][turn]); if (flat) setFlat(false); };
  // Der Stapel soll auf den ersten Bildschirm passen: Maßstab aus der freien Höhe und der Spaltenbreite.
  const fit = () => { if (innerWidth < 720) { stack.style.removeProperty('--as'); stack.style.removeProperty('--fs'); return; } const top = stack.getBoundingClientRect().top + scrollY, s = Math.max(.72, Math.min(1.16, innerWidth < 1021 ? 1 : (innerHeight - top - 16) / 620, stack.clientWidth / 740)); stack.style.setProperty('--as', s.toFixed(3)); stack.style.setProperty('--fs', Math.min(1.28, 1.28 * s, stack.clientWidth / 620).toFixed(3)); };
  fit(); addEventListener('resize', fit); document.fonts.ready.then(fit);
  // Erst auseinanderziehen, wenn Schrift und Grundfenster da sind – sonst fliegen auf langsamen Leitungen leere Scheiben.
  const first = $('.base img', rig), ready = Promise.all([document.fonts.ready, first.decode().catch(() => {})]);
  addEventListener('load', () => (window.requestIdleCallback ?? setTimeout)(() => $$('.base img', rig).forEach(load)), { once: true });
  if (still) setFlat(false); else { setFlat(true, true); ready.then(() => setTimeout(() => { if (flat && !used) setFlat(false); }, 900)); }
}

/* ---- Rahmen der Vorführungen auf Breite bringen ---- */
function fitFrames() { for (const f of $$('.frame[data-w]')) { const w = +f.dataset.w, h = +f.dataset.h, s = f.clientWidth / w; f.style.height = `${h * s}px`; for (const el of $$(':scope > iframe, :scope > img', f)) { el.style.width = `${w}px`; el.style.height = `${h}px`; el.style.transform = `scale(${s})`; } } }
let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fitFrames, 100); });

/* ---- Projects: die App selbst, erst laden, wenn sie in Sicht kommt ---- */
{
  const frame = $('#liveframe'), app = $('iframe', frame), hint = $('#livehint'), wide = matchMedia('(min-width: 720px)').matches;
  const ready = () => frame.classList.add('ready');
  if (LIGHT) $('img', frame).src = 'img/l-win-files.webp';
  if (!wide) hint.textContent = 'Tap to open the app';
  app.addEventListener('load', () => {
    try {                                                  // Wortmarke schon in Metadannye, wie beschlossen
      const d = app.contentDocument, st = d.createElement('style');
      st.textContent = `@font-face{font-family:Meta;src:url(${new URL('metadannye.ttf', location.href)})}.sidebar-brand strong,.brand strong{font-family:Meta,var(--ui-font)!important;font-size:19px!important;letter-spacing:.02em!important}`;
      d.head.append(st);
      if (LIGHT) { d.documentElement.classList.add('hc-theme-light'); d.documentElement.classList.remove('hc-theme-dark'); }
      let n = 0; const wait = setInterval(() => { if (d.querySelector('[role=tab]') || ++n > 40) { clearInterval(wait); setTimeout(ready, 350); } }, 200);
    } catch { setTimeout(ready, 2500); }
  });
  $('#liveshield').onclick = () => { if (!wide) { open(app.dataset.src, '_blank', 'noopener'); return; } frame.classList.add('live'); hint.classList.add('off'); if (!app.src) app.src = app.dataset.src; };
  if (wide && !root.classList.contains('static')) new IntersectionObserver(([e]) => { if (e.isIntersecting) { if (!app.src) app.src = app.dataset.src; } else frame.classList.remove('live'); }, { rootMargin: '500px 0px' }).observe(frame);
}
if (LIGHT) { $('#pdfframe iframe').src = 'pdf/demo.html?theme=light'; $('.appwin').classList.remove('dark'); }
addEventListener('message', (e) => { if (e.data === 'bergwork-pdf-drag') $('#pdfhint').classList.add('off'); });

/* ---- „Move anything“: die Überschrift lässt sich selbst greifen ---- */
for (const el of $$('.grab')) {
  let d = null, x = 0, y = 0;
  el.addEventListener('pointerdown', (e) => { d = { px: e.clientX - x, py: e.clientY - y }; el.setPointerCapture(e.pointerId); el.classList.add('held'); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (!d) return; x = e.clientX - d.px; y = e.clientY - d.py; el.style.transform = `translate(${x}px, ${y}px)`; el.classList.add('moved'); });
  const up = () => { if (!d) return; d = null; el.classList.remove('held'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('dblclick', () => { x = y = 0; el.style.transform = ''; el.classList.remove('moved'); });
}

/* ---- Vorführung Image ---- */
{
  const W = 640, H = 400, R = rng(42), X = (f) => f * W;
  const far = ridge([[-0.05, 210], [0.16, 150], [0.3, 196], [0.47, 120], [0.62, 186], [0.8, 138], [1.05, 200]].map(([x, y]) => [X(x), y]), 0.45, 12, R);
  const mid = ridge([[-0.05, 262], [0.14, 226], [0.33, 270], [0.55, 214], [0.74, 268], [0.9, 232], [1.05, 262]].map(([x, y]) => [X(x), y]), 0.4, 12, R);
  const hill = ridge([[-0.05, 318], [0.3, 300], [0.6, 330], [1.05, 296]].map(([x, y]) => [X(x), y]), 0.12, 20, R);
  const fill = (p, c) => `<polygon points="${poly([[p[0][0], H], ...p, [p[p.length - 1][0], H]])}" fill="${c}"/>`;
  $('.s-bg').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="isk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b6fb5"/><stop offset=".5" stop-color="#e9a27c"/><stop offset=".72" stop-color="#f6d7a4"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#isk)"/><circle cx="452" cy="176" r="46" fill="#fff3d6"/>${fill(far, '#8f7fa6')}${fill(mid, '#4f5a7d')}${fill(hill, '#27402f')}<rect y="352" width="${W}" height="48" fill="#1d3024"/></svg>`;
  $('.s-curve').insertAdjacentHTML('beforeend', `<svg viewBox="0 0 100 100"><rect x="1" y="1" width="98" height="98" rx="6" fill="rgba(6,6,5,.72)" stroke="rgba(255,253,248,.3)"/><path d="M25 1v98M50 1v98M75 1v98M1 25h98M1 50h98M1 75h98" stroke="rgba(255,253,248,.12)"/><path d="M6 94C34 90 40 62 50 50S70 12 94 6" fill="none" stroke="#62c690" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="4" fill="#62c690"/></svg>`);
  const L = [['curve', 'Curves', 'Adjustment', '<span data-c></span>'], ['text', 'Into the hills', 'Text · Inter 800', 'T'], ['pack', 'Backpack', 'Cut out on this machine', '<img src="img/backpack.webp" alt="" loading="lazy" decoding="async">'], ['bg', 'Mountains', 'Photo', '']];
  const eye = ico('see', 17), rows = $('#lrows'), stack = $('#stack'), rig = $('#rig');
  rows.innerHTML = L.map(([id, n, s, th]) => `<div class="lrow" data-l="${id}" tabindex="0"><span class="th" ${id === 'bg' ? 'style="background:linear-gradient(#3b6fb5,#e9a27c 60%,#27402f 61%)"' : id === 'curve' ? 'style="background:linear-gradient(135deg,#ef955a55,#79a8f555)"' : ''}>${th}</span><span><b>${n}</b><small>${s}</small></span><span class="eye" role="button" aria-label="Show or hide ${n}">${eye}</span></div>`).join('');
  const sheet = (id) => $(`.sheet[data-l="${id}"]`, rig);
  const hl = (id) => { stack.classList.toggle('dim', !!id); $$('.sheet', rig).forEach((s) => s.classList.toggle('hl', s.dataset.l === id)); $$('.lrow', rows).forEach((r) => r.classList.toggle('hl', r.dataset.l === id)); };
  rows.addEventListener('pointerover', (e) => { const r = e.target.closest('.lrow'); if (r) hl(r.dataset.l); });
  rows.addEventListener('pointerleave', () => hl(''));
  rows.addEventListener('click', (e) => { const r = e.target.closest('.lrow'); if (!r) return; if (e.target.closest('.eye')) { r.classList.toggle('hid'); sheet(r.dataset.l).classList.toggle('off', r.classList.contains('hid')); } else hl(r.classList.contains('hl') && e.pointerType !== 'mouse' ? '' : r.dataset.l); });
  rig.addEventListener('pointerover', (e) => { const s = e.target.closest('.sheet'); if (s) hl(s.dataset.l); }); rig.addEventListener('pointerleave', () => hl(''));
  let k = 1, turn = 0;
  $('#flat').onclick = (e) => { k = k ? 0 : 1; stack.style.setProperty('--k', k); e.currentTarget.textContent = k ? 'Flatten' : 'Pull apart'; };
  $('#spin').onclick = () => { turn = (turn + 1) % 3; stack.style.setProperty('--rz', ['-32deg', '28deg', '-10deg'][turn]); };
}

/* ---- Auftritt und Reiter der Kopfleiste ---- */
const levels = $$('main .level');
function spy() { const vh = innerHeight; let on = ''; for (const l of levels) if (l.getBoundingClientRect().top < vh * 0.5) on = l.id; if (levels[levels.length - 1].getBoundingClientRect().bottom < vh * 0.4) on = ''; $$('.nav [data-spy]').forEach((a) => a.classList.toggle('on', a.dataset.spy === on)); }
let raf = 0; addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(); }); }, { passive: true });
if (still) $$('.rv').forEach((el) => el.classList.add('in'));
else { const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); $$('.rv').forEach((el) => io.observe(el)); }
fitFrames(); spy(); addEventListener('load', fitFrames);

// Entwurf: Platzhalter-Links springen nicht nach oben.
document.addEventListener('click', (e) => { if (e.target.closest('a[href="#"]')) e.preventDefault(); });
