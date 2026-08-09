/**
 * Design switcher — 5 themes, persisted, keyboard 1–5
 */
(function () {
  const DESIGNS = [
    { id: "1", name: "Atelier", hint: "Lydia · Serif" },
    { id: "2", name: "Producer", hint: "Khegai · Caps" },
    { id: "3", name: "Campus", hint: "Loyalist · Bold" },
    { id: "4", name: "Catalog", hint: "Marlboro · Gallery" },
    { id: "5", name: "Ink", hint: "Journal · Mono" },
  ];
  const KEY = "ff-design";

  function current() {
    return document.documentElement.getAttribute("data-design") || "1";
  }

  function apply(id) {
    if (!DESIGNS.some((d) => d.id === id)) id = "1";
    document.documentElement.setAttribute("data-design", id);
    try {
      localStorage.setItem(KEY, id);
    } catch (_) {}
    const label = document.querySelector("[data-design-name]");
    const d = DESIGNS.find((x) => x.id === id);
    if (label && d) label.textContent = d.name;
    document.querySelectorAll("[data-design-btn]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.designBtn === id ? "true" : "false");
    });
  }

  function boot() {
    let id = "1";
    try {
      id = localStorage.getItem(KEY) || "1";
    } catch (_) {}
    apply(id);

    // Local path overrides for subdomains
    if (/localhost|127\.0\.0\.1|workers\.dev/.test(location.hostname)) {
      document.querySelectorAll("a[data-local]").forEach((a) => {
        a.href = a.dataset.local;
      });
    }

    const root = document.querySelector("[data-design-switcher]");
    if (!root) return;

    root.innerHTML = `
      <div class="ds-inner">
        <span class="ds-label">Design</span>
        <div class="ds-btns" role="group" aria-label="Design wählen">
          ${DESIGNS.map(
            (d) =>
              `<button type="button" data-design-btn="${d.id}" title="${d.name} — ${d.hint}" aria-pressed="false">${d.id}</button>`
          ).join("")}
        </div>
        <span class="ds-name" data-design-name></span>
      </div>
    `;
    root.querySelectorAll("[data-design-btn]").forEach((btn) => {
      btn.addEventListener("click", () => apply(btn.dataset.designBtn));
    });
    apply(id);

    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea,select,[contenteditable]")) return;
      if (e.key >= "1" && e.key <= "5") apply(e.key);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
