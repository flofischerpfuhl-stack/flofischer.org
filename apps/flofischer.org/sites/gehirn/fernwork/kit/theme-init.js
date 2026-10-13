/* Fernwork kit · load synchronously in <head> BEFORE the stylesheets to avoid a theme flash:
   <script src="../kit/theme-init.js"></script>
   Reads fw:theme ("light" | "dark" | "system"); URL ?theme=dark|light overrides (handy for screenshots). */
(function () {
  try {
    var q = new URLSearchParams(location.search).get('theme');
    var t = q || localStorage.getItem('fw:theme');
    if (q) localStorage.setItem('fw:theme', q);
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the OS */ }
  document.documentElement.classList.add('fw-js');
})();
