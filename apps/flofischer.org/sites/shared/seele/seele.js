(function () {
  const KEY = "ff-language";
  const LANGUAGES = ["en", "de"];
  const contentCache = new Map();
  let articleRequest = 0;
  let activeTag = "all";
  let searchIndex = null;
  let searchIndexPromise = null;
  let filterTimer = 0;
  let tocCleanup = null;

  function romanYear(year) {
    const values = [
      [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
      [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
      [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
    ];
    let result = "";
    for (const [value, glyph] of values) {
      while (year >= value) {
        result += glyph;
        year -= value;
      }
    }
    return result;
  }

  function applyLanguage(language, persist) {
    if (!LANGUAGES.includes(language)) language = "en";

    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;

    document.querySelectorAll("[data-language-button]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.languageButton === language ? "true" : "false");
    });

    const body = document.body;
    if (body) {
      document.title = language === "de" ? body.dataset.titleDe : body.dataset.titleEn;
    }

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content = language === "de"
        ? description.dataset.descriptionDe
        : description.dataset.descriptionEn;
    }

    document.querySelectorAll("[data-alt-en]").forEach((image) => {
      image.alt = language === "de" ? image.dataset.altDe : image.dataset.altEn;
    });

    document.querySelectorAll("[data-placeholder-en]").forEach((field) => {
      field.placeholder = language === "de" ? field.dataset.placeholderDe : field.dataset.placeholderEn;
    });

    document.querySelectorAll("[data-label-en]").forEach((element) => {
      const label = language === "de" ? element.dataset.labelDe : element.dataset.labelEn;
      if (element.matches("option")) element.textContent = label;
      else element.setAttribute("aria-label", label);
    });

    loadArticleContent(language);
    filterArticles(language);

    if (persist) {
      try {
        localStorage.setItem(KEY, language);
      } catch (_) {}
    }
  }

  function loadMath() {
    if (!document.querySelector(".article-content .math")) return;
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([document.querySelector(".article-content")]);
      return;
    }
    if (document.querySelector("[data-mathjax-loader]")) return;

    window.MathJax = {
      tex: {
        inlineMath: [["\\(", "\\)"]],
        displayMath: [["\\[", "\\]"]],
      },
      options: {
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      },
    };
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";
    script.async = true;
    script.dataset.mathjaxLoader = "";
    document.head.append(script);
  }

  function buildArticleToc(host) {
    const toc = document.querySelector("[data-article-toc]");
    if (!toc) return;

    if (tocCleanup) tocCleanup();

    const headings = [...host.querySelectorAll(
      "section[id] > h1, section[id] > h2, section[id] > h3, section[id] > h4, section[id] > h5, section[id] > h6"
    )].slice(1);

    const root = { level: 0, children: [] };
    const stack = [root];
    headings.forEach((heading) => {
      const section = heading.parentElement;
      const level = Number(heading.tagName.slice(1));
      const node = { heading, section, level, children: [] };
      while (stack.length > 1 && stack.at(-1).level >= level) stack.pop();
      stack.at(-1).children.push(node);
      stack.push(node);
    });

    toc.innerHTML = "";
    const childListFor = (item) => [...item.children].find((child) => child.matches("ol"));
    const toggleFor = (item) => item.querySelector(":scope > .toc-row > .toc-toggle");

    const setBranch = (item, expanded, collapseDescendants = false) => {
      const children = childListFor(item);
      const toggle = toggleFor(item);
      if (!children || !toggle) return;

      children.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute(
        "aria-label",
        expanded
          ? "Hide subsections / Unterkapitel ausblenden"
          : "Show subsections / Unterkapitel anzeigen"
      );

      if (!expanded && collapseDescendants) {
        children.querySelectorAll(":scope .toc-toggle").forEach((descendantToggle) => {
          descendantToggle.setAttribute("aria-expanded", "false");
          descendantToggle.setAttribute("aria-label", "Show subsections / Unterkapitel anzeigen");
        });
        children.querySelectorAll(":scope ol").forEach((descendantList) => {
          descendantList.hidden = true;
        });
      }
    };

    const closeSiblingBranches = (item) => {
      const siblings = [...item.parentElement.children];
      siblings.forEach((sibling) => {
        if (sibling !== item) setBranch(sibling, false, true);
      });
    };

    const renderNodes = (nodes, depth = 0) => {
      const list = document.createElement("ol");
      nodes.forEach((node) => {
        const item = document.createElement("li");
        const row = document.createElement("div");
        row.className = "toc-row";
        row.style.setProperty("--toc-depth", depth);

        let toggle;
        if (node.children.length) {
          toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "toc-toggle";
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", "Show subsections / Unterkapitel anzeigen");
        } else {
          toggle = document.createElement("span");
          toggle.className = "toc-spacer";
        }

        const link = document.createElement("a");
        link.href = "#" + node.section.id;
        link.textContent = node.heading.textContent.trim();
        link.dataset.tocTarget = node.section.id;
        row.append(link, toggle);
        item.append(row);

        if (node.children.length) {
          const children = renderNodes(node.children, depth + 1);
          children.id = `toc-branch-${node.section.id}`;
          children.hidden = true;
          toggle.setAttribute("aria-controls", children.id);
          toggle.addEventListener("click", () => {
            const expanded = toggle.getAttribute("aria-expanded") === "true";
            if (expanded) {
              setBranch(item, false, true);
            } else {
              closeSiblingBranches(item);
              setBranch(item, true);
            }
          });
          item.append(children);
        }
        list.append(item);
      });
      return list;
    };
    toc.append(renderNodes(root.children));

    const sections = headings.map((heading) => heading.parentElement);
    let positions = [];
    let frame = 0;
    let activeId = "";

    const measure = () => {
      positions = sections.map((section) => section.getBoundingClientRect().top + window.scrollY);
    };

    const setCurrent = (section) => {
      if (!section || activeId === section.id) return;
      activeId = section.id;
      toc.querySelector("a.is-current")?.classList.remove("is-current");

      const current = toc.querySelector(`[data-toc-target="${CSS.escape(section.id)}"]`);
      if (!current) return;
      current.classList.add("is-current");

      const path = [];
      let pathItem = current.closest("li");
      while (pathItem && toc.contains(pathItem)) {
        path.unshift(pathItem);
        const parentList = pathItem.parentElement;
        if (parentList === toc.firstElementChild) break;
        pathItem = parentList.parentElement;
      }
      path.forEach((item, position) => {
        closeSiblingBranches(item);
        if (position < path.length - 1) setBranch(item, true);
      });

      let parentList = current.closest("ol");
      while (parentList && parentList !== toc.firstElementChild) {
        parentList.hidden = false;
        parentList = parentList.parentElement?.closest("ol");
      }

      const scroller = toc.closest(".article-toc");
      const linkRect = current.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      if (linkRect.top < scrollerRect.top) {
        scroller.scrollTop -= scrollerRect.top - linkRect.top;
      } else if (linkRect.bottom > scrollerRect.bottom) {
        scroller.scrollTop += linkRect.bottom - scrollerRect.bottom;
      }
    };

    const update = () => {
      frame = 0;
      const marker = window.scrollY + Math.min(180, window.innerHeight * 0.22);
      let low = 0;
      let high = positions.length - 1;
      let current = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (positions[middle] <= marker) {
          current = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      setCurrent(sections[Math.max(0, current)]);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const resizeObserver = new ResizeObserver(() => {
      measure();
      scheduleUpdate();
    });
    resizeObserver.observe(host);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    measure();
    update();

    tocCleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", measure);
    };
  }

  async function loadArticleContent(language) {
    const host = document.querySelector("[data-content-host]");
    if (!host) return;
    if (host.dataset.loadedLanguage === language) return;

    const source = language === "de" ? host.dataset.contentSrcDe : host.dataset.contentSrcEn;
    const request = ++articleRequest;
    host.setAttribute("aria-busy", "true");

    try {
      if (!contentCache.has(source)) {
        contentCache.set(source, fetch(source).then((response) => {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.text();
        }));
      }
      const html = await contentCache.get(source);
      if (request !== articleRequest) return;
      host.innerHTML = html;
      host.dataset.loadedLanguage = language;
      buildArticleToc(host);
      loadMath();
    } catch (_) {
      if (request !== articleRequest) return;
      host.innerHTML = language === "de"
        ? "<p>Der Artikel konnte nicht geladen werden.</p>"
        : "<p>The article could not be loaded.</p>";
    } finally {
      if (request === articleRequest) host.removeAttribute("aria-busy");
    }
  }

  function normalizeSearch(value, language = "en") {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(language)
      .replace(/ß/g, "ss")
      .replace(/\s+/g, " ")
      .trim();
  }

  function loadSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch("/shared/seele/search-index.json")
        .then((response) => {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then((index) => {
          searchIndex = index;
          return index;
        })
        .catch(() => (searchIndex = {}));
    }
    return searchIndexPromise;
  }

  function filterArticles(language) {
    const input = document.querySelector("[data-article-search]");
    const cards = [...document.querySelectorAll("[data-article-card]")];
    if (!input || !cards.length) return;

    const query = normalizeSearch(input.value, language);
    if (query && !searchIndex) {
      loadSearchIndex().then(() => filterArticles(language));
    }
    let visible = 0;
    cards.forEach((card) => {
      const fallback = language === "de" ? card.dataset.searchDe : card.dataset.searchEn;
      const indexed = searchIndex?.[card.dataset.slug]?.[language];
      const haystack = indexed || normalizeSearch(fallback, language);
      const tags = (card.dataset.tags || "").split(/\s+/);
      const matchesQuery = !query || haystack.includes(query);
      const matchesTag = activeTag === "all" || tags.includes(activeTag);
      card.hidden = !(matchesQuery && matchesTag);
      if (!card.hidden) visible += 1;
    });

    const count = document.querySelector("[data-results-count]");
    if (count) {
      count.textContent = language === "de"
        ? visible + " Artikel"
        : visible + (visible === 1 ? " article" : " articles");
    }
  }

  function bootArchiveTools() {
    const input = document.querySelector("[data-article-search]");
    if (!input) return;
    input.addEventListener("focus", loadSearchIndex, { once: true });
    input.addEventListener("input", () => {
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(() => {
        filterArticles(document.documentElement.dataset.language || "en");
      }, 80);
    });

    document.querySelectorAll("[data-tag-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTag = button.dataset.tagFilter;
        document.querySelectorAll("[data-tag-filter]").forEach((candidate) => {
          candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
        });
        filterArticles(document.documentElement.dataset.language || "en");
      });
    });

    window.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.matches("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.focus();
    });
  }

  function bootBotanicalCarousel() {
    const plate = document.querySelector("[data-botanical-carousel]");
    const symbols = [...(plate?.querySelectorAll("[data-botanical-symbol]") || [])];
    if (!plate || symbols.length < 2) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let index = Math.max(0, symbols.findIndex((symbol) => symbol.classList.contains("is-active")));
    let hoverTimer = 0;
    let transitionTimer = 0;
    let transitioning = false;
    let queuedIndex = null;

    symbols.forEach((symbol) => {
      symbol.loading = "eager";
      symbol.decode?.().catch(() => {});
    });

    const finishTransition = () => {
      window.clearTimeout(transitionTimer);
      transitionTimer = 0;
      transitioning = false;
      if (queuedIndex !== null && queuedIndex !== index) {
        const next = queuedIndex;
        queuedIndex = null;
        swapTo(next);
      } else {
        queuedIndex = null;
      }
    };

    const swapTo = (next) => {
      if (next === index) return;
      if (transitioning) {
        queuedIndex = next;
        return;
      }

      transitioning = true;
      symbols[next].classList.add("is-active");
      symbols[index].classList.remove("is-active");
      index = next;
      plate.dataset.botanicalIndex = String(index + 1);

      if (reducedMotion.matches) {
        finishTransition();
      } else {
        transitionTimer = window.setTimeout(finishTransition, 1050);
      }
    };

    const advance = () => swapTo((index + 1) % symbols.length);
    const retreat = () => swapTo((index - 1 + symbols.length) % symbols.length);
    const cancelHover = () => {
      window.clearTimeout(hoverTimer);
      hoverTimer = 0;
    };

    plate.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      cancelHover();
      hoverTimer = window.setTimeout(() => {
        hoverTimer = 0;
        if (plate.matches(":hover")) advance();
      }, 120);
    });
    plate.addEventListener("pointerleave", cancelHover);
    plate.addEventListener("pointercancel", cancelHover);
    plate.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") advance();
    });
    plate.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", " ", "Enter"].includes(event.key)) return;
      event.preventDefault();
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
        retreat();
      } else {
        advance();
      }
    });
  }

  function bootVersionSwitcher() {
    const select = document.querySelector("[data-version-select]");
    const host = document.querySelector("[data-content-host]");
    if (!select || !host) return;

    const latest = select.querySelector("option[data-latest]") || select.options[0];
    const requested = new URLSearchParams(location.search).get("version") || latest.value;
    select.value = [...select.options].some((option) => option.value === requested) ? requested : latest.value;

    const applyVersion = (updateUrl) => {
      const option = select.selectedOptions[0];
      host.dataset.contentSrcEn = option.dataset.srcEn;
      host.dataset.contentSrcDe = option.dataset.srcDe;
      delete host.dataset.loadedLanguage;

      if (updateUrl) {
        const url = new URL(location.href);
        if (option.hasAttribute("data-latest")) url.searchParams.delete("version");
        else url.searchParams.set("version", option.value);
        history.replaceState(null, "", url);
      }
    };

    applyVersion(false);
    select.addEventListener("change", () => {
      applyVersion(true);
      loadArticleContent(document.documentElement.dataset.language || "en");
    });
  }

  function boot() {
    if (/localhost|127\.0\.0\.1|workers\.dev/.test(location.hostname)) {
      document.querySelectorAll("[data-local]").forEach((link) => {
        link.href = link.dataset.local;
      });
    }

    const year = new Date().getFullYear();
    document.querySelectorAll("[data-roman-year]").forEach((time) => {
      time.dateTime = String(year);
      time.textContent = romanYear(year);
    });

    document.querySelectorAll("[data-language-button]").forEach((button) => {
      button.addEventListener("click", () => applyLanguage(button.dataset.languageButton, true));
    });

    bootArchiveTools();
    bootBotanicalCarousel();
    bootVersionSwitcher();

    let language = document.documentElement.dataset.language || "en";
    try {
      language = localStorage.getItem(KEY) || language;
    } catch (_) {}
    applyLanguage(language, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
