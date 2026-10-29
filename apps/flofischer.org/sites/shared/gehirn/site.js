(function () {
  "use strict";

  const root = document.documentElement;
  const motion = root.classList.contains("motion");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const lang = () => (root.dataset.language === "de" ? "de" : "en");
  let vh = window.innerHeight;
  let vw = window.innerWidth;

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
        ? "Rotierendes Gehirn als Punktraster"
        : "Rotating brain drawn as a dot screen");
    }
    document.querySelectorAll("[data-video-toggle]").forEach(syncToggleLabel);
    if (persist) window.FFLanguage?.set(language);
  }

  document.querySelectorAll("[data-language-button]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.languageButton, true));
  });

  /* ---------- Elements ---------- */

  const bar = document.querySelector("[data-bar]");
  const progressLine = document.querySelector("[data-progress]");
  const readout = document.querySelector("[data-readout]");
  const sections = [...document.querySelectorAll("[data-section]")];
  const navLinks = [...document.querySelectorAll("[data-nav]")];
  const hero = document.querySelector(".hero");
  const heroStage = document.querySelector("[data-hero-stage]");
  const letters = [...document.querySelectorAll(".wm-line > span")];
  const heroFade = [...document.querySelectorAll(".hero-line, .hud, .hero-marks, .hero-cue")];
  const projects = [...document.querySelectorAll("[data-project]")].map((section) => ({
    section,
    pin: section.querySelector("[data-pin]"),
    screen: section.querySelector("[data-screen]"),
    video: section.querySelector("video"),
    title: section.querySelector("[data-title]"),
    hud: section.querySelector(".project-hud"),
    card: section.querySelector("[data-card]"),
    meter: section.querySelector("[data-meter]"),
    toggle: section.querySelector("[data-video-toggle]"),
  }));

  /* ---------- Menu ---------- */

  const menu = document.querySelector("[data-menu]");
  const menuButton = document.querySelector("[data-menu-button]");

  function setMenu(open) {
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      bar.dataset.theme = "dark";
      menu.querySelector("a")?.focus({ preventScroll: true });
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
  if ("IntersectionObserver" in window && motion) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
    reveals.forEach((element) => revealObserver.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add("is-in"));
  }

  /* ---------- Videos ---------- */

  function videoFor(button) {
    const box = button.closest("[data-video-box]");
    if (box) return box.querySelector("video");
    return button.closest("[data-project]")?.querySelector("[data-screen] video") || null;
  }

  function syncToggleLabel(button) {
    const video = videoFor(button);
    const paused = !video || video.paused;
    button.setAttribute("aria-pressed", paused ? "true" : "false");
    button.querySelectorAll("[data-lang-copy]").forEach((span) => {
      const words = toggleCopy[span.dataset.langCopy] || toggleCopy.en;
      span.textContent = paused ? words.play : words.pause;
    });
  }

  function play(video) {
    if (!video.paused) return;
    const promise = video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  }

  document.querySelectorAll("[data-video-toggle]").forEach((toggle) => {
    const video = videoFor(toggle);
    if (!video) return;
    if (!motion) video.dataset.userPaused = "true";
    video.addEventListener("playing", () => syncToggleLabel(toggle));
    video.addEventListener("pause", () => syncToggleLabel(toggle));
    toggle.addEventListener("click", () => {
      if (video.paused) {
        video.dataset.userPaused = "false";
        play(video);
      } else {
        video.dataset.userPaused = "true";
        video.pause();
      }
    });
    syncToggleLabel(toggle);
  });

  // Videos inside the detail boxes play while they are in view.
  const boxVideos = [...document.querySelectorAll("[data-video-box] video")];
  if ("IntersectionObserver" in window) {
    const boxObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          if (video.dataset.userPaused !== "true") play(video);
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { threshold: [0, 0.4] });
    boxVideos.forEach((video) => boxObserver.observe(video));
  }

  /* ---------- Halftone brain ---------- */

  const brain = (function () {
    const anchor = document.querySelector("[data-brain]");
    const canvas = document.querySelector("[data-brain-canvas]");
    if (!anchor || !canvas || !canvas.getContext) return null;

    const FRAME = 144;
    const COLS = 8;
    const FRAMES = 48;
    const ctx = canvas.getContext("2d");
    const lowPower = window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4;
    const state = {
      lum: null,
      ready: false,
      W: 0,
      H: 0,
      dpr: 1,
      box: { x: 0, y: 0, s: 1 },
      cells: 0,
      scatter: null,
      angle: 0.02,
      speed: 1,
      drag: null,
      pointer: null,
      intro: motion ? 0 : 1,
      introStart: 0,
      explode: 0,
      lastDraw: 0,
      dots: 0,
      onReady: null,
    };

    const sprite = new Image();
    sprite.decoding = "async";
    sprite.src = canvas.dataset.frames || "./assets/brain-frames.webp";
    sprite.addEventListener("load", () => {
      const work = document.createElement("canvas");
      work.width = sprite.naturalWidth;
      work.height = sprite.naturalHeight;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      wctx.drawImage(sprite, 0, 0);
      const data = wctx.getImageData(0, 0, work.width, work.height).data;
      const lum = new Float32Array(FRAMES * FRAME * FRAME);
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
      state.lum = lum;
      state.ready = true;
      resize();
      state.onReady?.();
    });

    function buildScatter() {
      const n = state.cells * state.cells;
      const scatter = new Float32Array(n * 3);
      let seed = 7;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < n; i += 1) {
        const a = rand() * Math.PI * 2;
        const m = 0.35 + Math.pow(rand(), 0.7) * 1.4;
        scatter[i * 3] = Math.cos(a) * m;
        scatter[i * 3 + 1] = Math.sin(a) * m - 0.25;
        scatter[i * 3 + 2] = rand();
      }
      state.scatter = scatter;
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.W = Math.max(1, Math.round(rect.width));
      state.H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(state.W * state.dpr);
      canvas.height = Math.round(state.H * state.dpr);
      state.box = { x: a.left - rect.left, y: a.top - rect.top, s: a.width };
      const cells = state.box.s < 420 ? 92 : 118;
      if (cells !== state.cells || !state.scatter) {
        state.cells = cells;
        buildScatter();
      }
      if (state.ready) draw(true);
    }

    function sample(frame, u, v) {
      const x = Math.min(FRAME - 1, Math.max(0, u * FRAME));
      const y = Math.min(FRAME - 1, Math.max(0, v * FRAME));
      return state.lum[frame * FRAME * FRAME + (y | 0) * FRAME + (x | 0)];
    }

    function draw() {
      const { box, cells, scatter, dpr, pointer } = state;
      const s = box.s;
      const step = s / cells;
      const turn = ((state.angle % 1) + 1) % 1;
      const pos = turn * FRAMES;
      const f0 = Math.floor(pos) % FRAMES;
      const f1 = (f0 + 1) % FRAMES;
      const mix = pos - Math.floor(pos);
      const introE = easeOut(state.intro);
      const burst = Math.max(1 - introE, 0) * 1.6 + Math.pow(state.explode, 1.3) * 1.35;
      const path = new Path2D();
      const maxR = step * 0.5;
      const repelR = s * 0.14;
      let count = 0;

      for (let row = 0; row < cells; row += 1) {
        const v = (row + 0.5) / cells;
        const offset = row % 2 ? step * 0.5 : 0;
        for (let col = 0; col < cells; col += 1) {
          const lx = col * step + step * 0.5 + offset;
          if (lx > s) continue;
          const l = sample(f0, lx / s, v) * (1 - mix) + sample(f1, lx / s, v) * mix;
          if (l < 0.06) continue;
          const i = (row * cells + col) * 3;
          let r = maxR * Math.sqrt(l);
          let x = box.x + lx;
          let y = box.y + row * step + step * 0.5;
          if (burst > 0.001) {
            const k = burst * (0.6 + scatter[i + 2] * 0.8);
            x += scatter[i] * s * k;
            y += scatter[i + 1] * s * k;
            r *= 1 - Math.min(0.55, burst * 0.3);
          }
          if (pointer) {
            const dx = x - pointer.x;
            const dy = y - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < repelR * repelR) {
              const d = Math.sqrt(d2) || 1;
              const push = (1 - d / repelR) ** 2 * repelR * 0.42;
              x += (dx / d) * push;
              y += (dy / d) * push;
            }
          }
          if (x < -10 || y < -10 || x > state.W + 10 || y > state.H + 10) continue;
          path.moveTo((x + r) * dpr, y * dpr);
          path.arc(x * dpr, y * dpr, r * dpr, 0, Math.PI * 2);
          count += 1;
        }
      }
      state.dots = count;

      const shift = (Math.max(0.8, step * 0.14) + state.explode * 22 + (1 - introE) * 14) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alpha = 1 - state.explode * 0.75;
      ctx.globalAlpha = 0.45 * alpha;
      ctx.fillStyle = "#e5294f";
      ctx.setTransform(1, 0, 0, 1, -shift, 0);
      ctx.fill(path);
      ctx.fillStyle = "#00a9c0";
      ctx.setTransform(1, 0, 0, 1, shift, 0);
      ctx.fill(path);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#efede8";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fill(path);
      ctx.globalAlpha = 1;
    }

    function tick(now, dt, visible) {
      if (!state.ready || !visible) return;
      if (state.introStart && state.intro < 1) state.intro = clamp((now - state.introStart) / 1900);
      if (!motion && !state.drag) return;
      if (now - state.lastDraw < 1000 / (lowPower ? 30 : 50)) return;
      state.lastDraw = now;
      if (!state.drag && motion) {
        state.speed += (1 - state.speed) * (1 - Math.exp(-dt * 1.6));
        state.angle += (dt / 24) * state.speed;
      }
      draw();
    }

    function local(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    anchor.addEventListener("pointerdown", (event) => {
      state.drag = { x: event.clientX, angle: state.angle, t: performance.now(), v: 0 };
      anchor.setPointerCapture?.(event.pointerId);
    });
    heroStage.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse" && motion) state.pointer = local(event);
      if (!state.drag) return;
      const now = performance.now();
      const next = state.drag.angle + (event.clientX - state.drag.x) / (state.box.s * 1.6);
      const dtm = Math.max(1, now - state.drag.t);
      state.drag.v = ((next - state.angle) / dtm) * 1000 * 24;
      state.drag.t = now;
      state.angle = next;
      if (!motion) draw();
    });
    const release = () => {
      if (state.drag) state.speed = clamp(state.drag.v || 1, -8, 8);
      state.drag = null;
    };
    anchor.addEventListener("pointerup", release);
    anchor.addEventListener("pointercancel", release);
    heroStage.addEventListener("pointerleave", () => {
      state.pointer = null;
    });

    return {
      state,
      resize,
      tick,
      draw,
      start(now) {
        state.introStart = now;
      },
    };
  })();

  /* ---------- Intro ---------- */

  const loader = document.querySelector("[data-loader]");
  const loaderCount = document.querySelector("[data-loader-count]");
  const loaderLine = document.querySelector("[data-loader-line]");
  const showLoader = motion && !root.classList.contains("intro-seen");
  let introDone = false;
  let lettersFree = false;

  function goLive() {
    if (introDone) return;
    introDone = true;
    hero.classList.add("is-live");
    if (brain) {
      if (motion) brain.start(performance.now());
      else brain.state.intro = 1;
      if (!motion && brain.state.ready) brain.draw();
    }
    // hand the wordmark letters over to the scroll engine once they have risen
    window.setTimeout(() => {
      letters.forEach((letter) => { letter.style.transition = "none"; });
      document.querySelector(".wm-line")?.classList.add("is-free");
      heroFade.forEach((element) => { element.style.transition = "opacity 0.2s linear"; element.style.transform = "none"; });
      lettersFree = true;
    }, 1800);
  }

  if (showLoader) {
    const started = performance.now();
    let shown = 0;
    const step = (now) => {
      const elapsed = now - started;
      const loaded = brain ? brain.state.ready : true;
      let target = Math.min(100, (elapsed / 1100) * 100);
      if (!loaded) target = Math.min(target, 90);
      if (elapsed > 3200) target = 100;
      shown += (target - shown) * 0.25;
      if (target === 100 && shown > 99.4) shown = 100;
      loaderCount.textContent = String(Math.round(shown)).padStart(3, "0");
      loaderLine.style.transform = `scaleX(${shown / 100})`;
      if (shown >= 100) {
        loader.classList.add("is-done");
        try { sessionStorage.setItem("gehirn-intro", "1"); } catch (e) {}
        window.setTimeout(goLive, 250);
        window.setTimeout(() => loader.remove(), 1200);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else if (brain && !brain.state.ready) {
    brain.state.onReady = goLive;
    window.setTimeout(goLive, 1500);
  } else {
    goLive();
  }

  /* ---------- Scroll engine ---------- */

  let lastScroll = -1;
  let layoutDirty = true;
  let heroVisible = true;
  let hudAt = 0;
  const hudRot = document.querySelector("[data-hud-rot]");
  const hudFrame = document.querySelector("[data-hud-frame]");
  const hudDots = document.querySelector("[data-hud-dots]");
  const portrait = window.matchMedia("(max-width: 900px)");

  function measure() {
    vh = window.innerHeight;
    vw = window.innerWidth;
    brain?.resize();
    layoutDirty = false;
  }

  function updateBar() {
    const probe = bar.getBoundingClientRect().bottom + 2;
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= probe) current = section;
    }
    if (menu.hidden) bar.dataset.theme = current.dataset.theme;
    navLinks.forEach((link) => {
      link.setAttribute("aria-current", link.dataset.nav === current.dataset.section ? "true" : "false");
    });
    if (readout && readout.textContent !== current.dataset.label) readout.textContent = current.dataset.label || "";
    const max = document.documentElement.scrollHeight - vh;
    progressLine.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max) : 0})`;
  }

  function updateHero() {
    const rect = hero.getBoundingClientRect();
    heroVisible = rect.bottom > 0;
    if (!motion) return;
    const p = clamp(-rect.top / Math.max(1, rect.height - vh));
    if (brain) brain.state.explode = p;
    if (lettersFree) {
      const order = [3, 1, 4, 0, 5, 2];
      letters.forEach((letter, i) => {
        const y = -p * vh * (0.18 + order[i] * 0.07);
        letter.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) rotate(${(p * (i - 2.5) * 2.2).toFixed(2)}deg)`;
        letter.style.opacity = String(1 - smooth(0.55, 1, p) * 0.7);
      });
    }
    const fade = 1 - smooth(0.05, 0.45, p);
    heroFade.forEach((element) => {
      element.style.opacity = introDone && lettersFree ? fade : "";
    });
  }

  function updateProjects() {
    const small = portrait.matches;
    projects.forEach((project) => {
      const rect = project.pin.getBoundingClientRect();
      const visible = rect.top < vh && rect.bottom > 0;
      if (motion && visible) {
        const p = clamp(-rect.top / Math.max(1, rect.height - vh));
        const e = smooth(0.0, 0.42, p);
        const c = smooth(0.45, 0.72, p);
        const s0 = small ? 0.6 : 0.34;
        const scale = s0 + (1 - s0) * e;
        const tilt = small ? (1 - e) * -4 : 0;
        project.screen.style.transform = `scale(${scale.toFixed(4)}) rotate(${tilt.toFixed(2)}deg)`;
        project.screen.style.borderRadius = `${((1 - e) * (small ? 14 : 24) / scale).toFixed(1)}px`;
        if (!small) {
          project.title.style.transform = `translateY(-50%) scale(${(1 + e * 0.12).toFixed(4)})`;
        }
        project.title.style.opacity = small ? String(1 - c * 0.85) : "";
        const ch = project.card.offsetHeight + 96;
        project.card.style.transform = `translate3d(0, ${((1 - c) * ch).toFixed(1)}px, 0)`;
        project.meter.style.transform = `scaleX(${p.toFixed(4)})`;
        project.hud.style.opacity = String(1 - smooth(0.2, 0.42, p) * 0.85);
      }
      const wantsPlay = visible && project.video.dataset.userPaused !== "true"
        && (!motion || clamp(-rect.top / Math.max(1, rect.height - vh)) > 0 || rect.top < vh * 0.4);
      if (wantsPlay) play(project.video);
      else if (!project.video.paused && !visible) project.video.pause();
    });
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (layoutDirty) measure();
    const y = window.scrollY;
    if (y !== lastScroll) {
      lastScroll = y;
      updateBar();
      updateHero();
      updateProjects();
    }
    if (brain && !document.hidden) {
      brain.tick(now, dt, heroVisible);
      if (now - hudAt > 120 && heroVisible) {
        hudAt = now;
        const deg = ((((brain.state.angle % 1) + 1) % 1) * 360).toFixed(1).padStart(5, "0");
        hudRot.textContent = `${deg}°`;
        const f = Math.floor(((((brain.state.angle % 1) + 1) % 1) * 48)) + 1;
        hudFrame.textContent = `${String(f).padStart(2, "0")}/48`;
        hudDots.textContent = String(brain.state.dots).padStart(4, "0");
      }
    }
  }

  window.addEventListener("resize", () => {
    layoutDirty = true;
    lastScroll = -1;
  });
  document.fonts?.ready.then(() => {
    layoutDirty = true;
  });
  window.addEventListener("load", () => {
    layoutDirty = true;
    lastScroll = -1;
  });

  applyLanguage(window.FFLanguage?.get() || root.dataset.language || "en", false);
  requestAnimationFrame(frame);

  if (!motion) {
    // Reduced motion: still play nothing automatically, but draw the brain once.
    if (brain) brain.state.onReady = () => brain.draw();
  }
})();
