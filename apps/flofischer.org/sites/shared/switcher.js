/** Design switcher for the hub. */
(function () {
  const config = {
    key: "ff-design",
    designs: [
      { id: "1", name: "Atelier", hint: "Lydia · Serif" },
      { id: "2", name: "Producer", hint: "Khegai · Caps" },
      { id: "3", name: "Campus", hint: "Loyalist · Bold" },
      { id: "4", name: "Catalog", hint: "Marlboro · Gallery" },
      { id: "5", name: "Ink", hint: "Journal · Mono" },
    ],
  };

  function boot() {
    const root = document.querySelector("[data-design-switcher]");
    if (!root) return;

    const designs = config.designs;

    function valid(id) {
      return designs.some((design) => design.id === id);
    }

    function apply(id, persist) {
      if (!valid(id)) id = "1";
      document.documentElement.dataset.design = id;
      if (persist) {
        try {
          localStorage.setItem(config.key, id);
        } catch (_) {}
      }

      const selected = designs.find((design) => design.id === id);
      const label = root.querySelector("[data-design-name]");
      if (label) label.textContent = selected.name;
      root.querySelectorAll("[data-design-btn]").forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.designBtn === id ? "true" : "false");
      });
    }

    let current = document.documentElement.dataset.design || "1";
    try {
      current = localStorage.getItem(config.key) || current;
    } catch (_) {}
    if (!valid(current)) current = "1";

    root.innerHTML = [
      '<div class="ds-inner">',
      '<span class="ds-label">Design</span>',
      '<div class="ds-btns" role="group" aria-label="Choose design">',
      designs.map((design) =>
        '<button type="button" data-design-btn="' + design.id +
        '" title="' + design.name + " — " + design.hint +
        '" aria-pressed="false">' + design.id + "</button>"
      ).join(""),
      "</div>",
      '<span class="ds-name" data-design-name></span>',
      "</div>",
    ].join("");

    root.querySelectorAll("[data-design-btn]").forEach((button) => {
      button.addEventListener("click", () => apply(button.dataset.designBtn, true));
    });

    window.addEventListener("keydown", (event) => {
      if (event.target.matches("input, textarea, select, [contenteditable]")) return;
      if (valid(event.key)) apply(event.key, true);
    });

    if (/localhost|127\.0\.0\.1|workers\.dev/.test(location.hostname)) {
      document.querySelectorAll("a[data-local]").forEach((link) => {
        link.href = link.dataset.local;
      });
    }

    apply(current, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
