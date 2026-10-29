(function () {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Language ---------- */

  const toggleCopy = {
    en: { pause: "Pause", play: "Play" },
    de: { pause: "Pause", play: "Abspielen" },
  };

  function applyLanguage(language, persist) {
    if (language !== "de") language = "en";
    root.lang = language;
    root.dataset.language = language;
    document.querySelectorAll("[data-language-button]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.languageButton === language ? "true" : "false");
    });
    const body = document.body;
    document.title = language === "de" ? body.dataset.titleDe : body.dataset.titleEn;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content = language === "de" ? description.dataset.descriptionDe : description.dataset.descriptionEn;
    }
    const canvas = document.querySelector("[data-brain-canvas]");
    if (canvas) {
      canvas.setAttribute("aria-label", language === "de"
        ? "Langsam rotierendes Gehirn als Punktraster"
        : "Slowly rotating brain drawn as a dot screen");
    }
    document.querySelectorAll("[data-video-toggle]").forEach(syncToggleLabel);
    if (persist) window.FFLanguage?.set(language);
  }

  document.querySelectorAll("[data-language-button]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.languageButton, true));
  });

  /* ---------- Bar theme + active section ---------- */

  const bar = document.querySelector("[data-bar]");
  const sections = [...document.querySelectorAll("[data-section]")];
  const navLinks = [...document.querySelectorAll("[data-nav]")];

  function updateBar() {
    const probe = bar.getBoundingClientRect().bottom + 2;
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= probe) current = section;
    }
    bar.dataset.theme = current.dataset.theme;
    navLinks.forEach((link) => {
      link.setAttribute("aria-current", link.dataset.nav === current.dataset.section ? "true" : "false");
    });
  }

  let barTicking = false;
  window.addEventListener("scroll", () => {
    if (barTicking) return;
    barTicking = true;
    requestAnimationFrame(() => {
      barTicking = false;
      updateBar();
    });
  }, { passive: true });
  window.addEventListener("resize", updateBar);

  /* ---------- Mobile menu ---------- */

  const menu = document.querySelector("[data-menu]");
  const menuButton = document.querySelector("[data-menu-button]");

  function setMenu(open) {
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      bar.dataset.theme = "dark";
      menu.querySelector("a")?.focus({ preventScroll: true });
    } else {
      updateBar();
    }
  }

  menuButton.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setMenu(false);
      menuButton.focus();
    }
  });
  window.matchMedia("(min-width: 641px)").addEventListener("change", (event) => {
    if (event.matches && !menu.hidden) setMenu(false);
  });

  /* ---------- Reveal ---------- */

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach((element) => revealObserver.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add("is-in"));
  }

  /* ---------- Preview videos ---------- */

  const screens = [...document.querySelectorAll("[data-screen]")];

  function syncToggleLabel(button) {
    const screen = button.closest("[data-screen]");
    const paused = screen?.dataset.userPaused === "true" || !screen?.classList.contains("is-playing");
    const copy = toggleCopy[root.dataset.language === "de" ? "de" : "en"];
    button.setAttribute("aria-pressed", paused ? "true" : "false");
    button.querySelectorAll("[data-lang-copy]").forEach((span) => {
      const words = toggleCopy[span.dataset.langCopy] || copy;
      span.textContent = paused ? words.play : words.pause;
    });
  }

  function play(screen) {
    const video = screen.querySelector("video");
    const promise = video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  }

  screens.forEach((screen) => {
    const video = screen.querySelector("video");
    const toggle = screen.querySelector("[data-video-toggle]");
    if (reducedMotion.matches) screen.dataset.userPaused = "true";
    video.addEventListener("playing", () => {
      screen.classList.add("is-playing");
      syncToggleLabel(toggle);
    });
    video.addEventListener("pause", () => {
      screen.classList.remove("is-playing");
      syncToggleLabel(toggle);
    });
    toggle.addEventListener("click", () => {
      if (video.paused) {
        screen.dataset.userPaused = "false";
        play(screen);
      } else {
        screen.dataset.userPaused = "true";
        video.pause();
      }
    });
    syncToggleLabel(toggle);
  });

  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const screen = entry.target;
        const video = screen.querySelector("video");
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          if (screen.dataset.userPaused !== "true") play(screen);
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { threshold: [0, 0.35, 0.6] });
    screens.forEach((screen) => videoObserver.observe(screen));
  }

  /* ---------- Halftone brain ---------- */

  const stage = document.querySelector("[data-brain]");
  const canvas = stage?.querySelector("[data-brain-canvas]");
  if (stage && canvas && canvas.getContext) {
    const FRAME = 144;
    const COLS = 8;
    const FRAMES = 48;
    const ctx = canvas.getContext("2d");
    const lowPower = window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4;
    let lum = null;
    let size = 0;
    let dpr = 1;
    let visible = true;
    let angle = 0.02;
    let speed = 1;
    let drag = null;
    let pointer = null;
    let last = 0;
    let lastDraw = 0;

    const sprite = new Image();
    sprite.decoding = "async";
    sprite.src = "./assets/brain-frames.webp";
    sprite.addEventListener("load", () => {
      const work = document.createElement("canvas");
      work.width = sprite.naturalWidth;
      work.height = sprite.naturalHeight;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      wctx.drawImage(sprite, 0, 0);
      const data = wctx.getImageData(0, 0, work.width, work.height).data;
      lum = new Float32Array(FRAMES * FRAME * FRAME);
      for (let f = 0; f < FRAMES; f += 1) {
        const ox = (f % COLS) * FRAME;
        const oy = Math.floor(f / COLS) * FRAME;
        for (let y = 0; y < FRAME; y += 1) {
          for (let x = 0; x < FRAME; x += 1) {
            const v = data[((oy + y) * work.width + ox + x) * 4] / 255;
            lum[f * FRAME * FRAME + y * FRAME + x] = v < 0.04 ? 0 : Math.pow(v, 1.15);
          }
        }
      }
      resize();
      draw(performance.now(), true);
      stage.classList.add("is-ready");
      if (!reducedMotion.matches) requestAnimationFrame(loop);
    });

    function resize() {
      const rect = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.max(1, Math.round(rect.width));
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      if (lum) draw(performance.now(), true);
    }

    function sample(frame, u, v) {
      const x = Math.min(FRAME - 1, Math.max(0, u * FRAME));
      const y = Math.min(FRAME - 1, Math.max(0, v * FRAME));
      return lum[frame * FRAME * FRAME + (y | 0) * FRAME + (x | 0)];
    }

    function draw() {
      const cells = size < 420 ? 92 : 118;
      const step = size / cells;
      const turn = ((angle % 1) + 1) % 1;
      const pos = turn * FRAMES;
      const f0 = Math.floor(pos) % FRAMES;
      const f1 = (f0 + 1) % FRAMES;
      const mix = pos - Math.floor(pos);
      const path = new Path2D();
      const maxR = step * 0.5;
      const lensR = size * 0.16;

      for (let row = 0; row < cells; row += 1) {
        const v = (row + 0.5) / cells;
        const offset = row % 2 ? step * 0.5 : 0;
        for (let col = 0; col < cells; col += 1) {
          const cx = col * step + step * 0.5 + offset;
          if (cx > size) continue;
          const u = cx / size;
          const l = sample(f0, u, v) * (1 - mix) + sample(f1, u, v) * mix;
          if (l < 0.06) continue;
          let r = maxR * Math.sqrt(l);
          const cy = row * step + step * 0.5;
          if (pointer) {
            const dx = cx - pointer.x;
            const dy = cy - pointer.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < lensR) r *= 1 + 0.38 * (1 - d / lensR) ** 2;
          }
          path.moveTo((cx + r) * dpr, cy * dpr);
          path.arc(cx * dpr, cy * dpr, r * dpr, 0, Math.PI * 2);
        }
      }

      const shift = Math.max(0.8, step * 0.14) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "#e5294f";
      ctx.setTransform(1, 0, 0, 1, -shift, 0);
      ctx.fill(path);
      ctx.fillStyle = "#00a9c0";
      ctx.setTransform(1, 0, 0, 1, shift, 0);
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#efede8";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fill(path);
    }

    function loop(now) {
      requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      if (now - lastDraw < 1000 / (lowPower ? 24 : 40)) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      lastDraw = now;
      if (!drag) {
        speed += (1 - speed) * (1 - Math.exp(-dt * 1.6));
        angle += (dt / 26) * speed;
      }
      draw();
    }

    function local(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    stage.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, angle, t: performance.now(), v: 0 };
      stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse") pointer = local(event);
      if (!drag) return;
      const now = performance.now();
      const next = drag.angle + (event.clientX - drag.x) / (size * 1.6);
      const dtm = Math.max(1, now - drag.t);
      drag.v = ((next - angle) / dtm) * 1000 * 26;
      drag.t = now;
      angle = next;
      if (reducedMotion.matches) draw();
    });
    const release = () => {
      if (drag) speed = Math.max(-6, Math.min(6, drag.v || 1));
      drag = null;
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    stage.addEventListener("pointerleave", () => {
      pointer = null;
      if (reducedMotion.matches && lum) draw();
    });

    new ResizeObserver(resize).observe(stage);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      }).observe(stage);
    }
  }

  applyLanguage(window.FFLanguage?.get() || root.dataset.language || "en", false);
  updateBar();
})();
