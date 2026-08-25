(function () {
  const KEY = "ff-language";
  const reel = document.querySelector("[data-reel]");
  const cuts = [...document.querySelectorAll("[data-cut]")];
  const mediaStacks = [...document.querySelectorAll(".project-media")];
  let activeMedia = null;

  function applyLanguage(language, persist) {
    if (language !== "de") language = "en";
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;

    document.querySelectorAll("[data-language-button]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.languageButton === language ? "true" : "false");
    });

    const body = document.body;
    if (body) document.title = language === "de" ? body.dataset.titleDe : body.dataset.titleEn;

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content = language === "de" ? description.dataset.descriptionDe : description.dataset.descriptionEn;
    }

    if (persist) {
      try { localStorage.setItem(KEY, language); } catch (_) {}
    }
  }

  function setActiveCut(section) {
    if (!section) return;
    const label = document.querySelector("[data-cut-label]");
    if (label) label.textContent = section.dataset.cut;
    document.querySelectorAll("[data-cut-link]").forEach((link) => {
      link.setAttribute("aria-current", link.dataset.cutLink === section.id ? "true" : "false");
    });
    setActiveMedia(section.querySelector(".project-media"));
  }

  function playVideo(video) {
    const promise = video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  }

  function syncVideoStack(stack) {
    if (!stack) return;
    const videos = [...stack.querySelectorAll("video")];
    const source = videos[0];
    if (!source || !Number.isFinite(source.currentTime)) return;
    videos.slice(1).forEach((video) => {
      if (Math.abs(video.currentTime - source.currentTime) > 0.065) {
        video.currentTime = source.currentTime;
      }
    });
  }

  function setActiveMedia(nextMedia) {
    if (activeMedia === nextMedia) return;
    mediaStacks.forEach((stack) => {
      stack.querySelectorAll("video").forEach((video) => video.pause());
    });
    activeMedia = nextMedia || null;
    if (!activeMedia || document.hidden) return;

    const videos = [...activeMedia.querySelectorAll("video")];
    if (!videos.length) return;
    const startAt = videos[0].currentTime || 0;
    videos.forEach((video, index) => {
      if (index && video.readyState >= 1) video.currentTime = startAt;
      playVideo(video);
    });
  }

  function bootCuts() {
    if (!reel || !cuts.length) return;
    if (!("IntersectionObserver" in window)) {
      setActiveCut(cuts[0]);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (active) setActiveCut(active.target);
    }, { root: reel, threshold: [0.35, 0.55, 0.75] });
    cuts.forEach((cut) => observer.observe(cut));
  }

  function boot() {
    if (/localhost|127\.0\.0\.1|workers\.dev/.test(location.hostname)) {
      document.querySelectorAll("[data-local]").forEach((link) => { link.href = link.dataset.local; });
    }

    document.querySelectorAll("[data-language-button]").forEach((button) => {
      button.addEventListener("click", () => applyLanguage(button.dataset.languageButton, true));
    });

    let language = document.documentElement.dataset.language || "en";
    try { language = localStorage.getItem(KEY) || language; } catch (_) {}
    applyLanguage(language, false);

    mediaStacks.forEach((stack) => {
      const source = stack.querySelector(".video-main");
      stack.querySelectorAll("video").forEach((video) => video.pause());
      if (source) {
        source.addEventListener("timeupdate", () => {
          if (stack === activeMedia) syncVideoStack(stack);
        });
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!activeMedia) return;
      if (document.hidden) {
        activeMedia.querySelectorAll("video").forEach((video) => video.pause());
      } else {
        syncVideoStack(activeMedia);
        activeMedia.querySelectorAll("video").forEach(playVideo);
      }
    });

    bootCuts();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
