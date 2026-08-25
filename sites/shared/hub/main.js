const KEY = "ff-language";
const MUTE_KEY = "ff-hub-mute";
const isLocal = /localhost|127\.0\.0\.1|workers\.dev/.test(location.hostname);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const copy = {
  seele: {
    kicker: { en: "Apologetics", de: "Apologetik" },
    action: { en: "Click or press E", de: "Klicken oder E" },
  },
  gehirn: {
    kicker: { en: "Projects", de: "Projekte" },
    action: { en: "Click or press E", de: "Klicken oder E" },
  },
};

function applyLanguage(language, persist) {
  if (language !== "de") language = "en";
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  document.querySelectorAll("[data-language-button]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.languageButton === language ? "true" : "false");
  });
  const body = document.body;
  if (body?.dataset.titleEn) {
    document.title = language === "de" ? body.dataset.titleDe : body.dataset.titleEn;
  }
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.content = language === "de" ? description.dataset.descriptionDe : description.dataset.descriptionEn;
  }
  if (persist) {
    try { localStorage.setItem(KEY, language); } catch (_) {}
  }
  return language;
}

function rewriteLocalLinks() {
  if (!isLocal) return;
  document.querySelectorAll("[data-local]").forEach((link) => {
    link.href = link.dataset.local;
  });
}

function portalUrl(portal) {
  return isLocal ? portal.local : portal.url;
}

function createAmbience() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const wind = ctx.createBiquadFilter();
  wind.type = "lowpass";
  wind.frequency.value = 780;
  const rain = ctx.createBiquadFilter();
  rain.type = "highpass";
  rain.frequency.value = 1700;
  const gWind = ctx.createGain();
  const gRain = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = 0;
  src.connect(wind).connect(gWind).connect(master);
  src.connect(rain).connect(gRain).connect(master);
  master.connect(ctx.destination);
  src.start();
  return {
    ctx,
    setSide(t) {
      gWind.gain.value = 0.85 * (1 - t);
      gRain.gain.value = 0.7 * t;
    },
    setMuted(muted) {
      master.gain.value = muted ? 0 : 0.042;
    },
  };
}

async function boot() {
  rewriteLocalLinks();
  let language = document.documentElement.dataset.language || "en";
  try { language = localStorage.getItem(KEY) || language; } catch (_) {}
  language = applyLanguage(language, false);

  const fade = document.querySelector("[data-fade]");
  const bootFade = document.querySelector("[data-boot]");
  const hint = document.querySelector("[data-hint]");
  const prompt = document.querySelector("[data-prompt]");
  const zoneEl = document.querySelector("[data-zone]");
  const muteBtn = document.querySelector("[data-mute]");
  const canvas = document.querySelector("#hub-world");

  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (_) {}
  muteBtn?.setAttribute("aria-pressed", muted ? "false" : "true");

  let ambience = null;
  let hub = null;
  let leaving = false;
  let nearest = null;

  document.querySelectorAll("[data-language-button]").forEach((button) => {
    button.addEventListener("click", () => {
      language = applyLanguage(button.dataset.languageButton, true);
      hub?.setLanguage(language);
    });
  });

  function go(portal) {
    if (!portal || leaving) return;
    leaving = true;
    fade.classList.toggle("is-gehirn", portal.id === "gehirn");
    fade.classList.toggle("is-seele", portal.id === "seele");
    fade.classList.add("is-on");
    window.setTimeout(() => {
      window.location.href = portalUrl(portal);
    }, 680);
  }

  function armAudio() {
    if (ambience) return;
    try {
      ambience = createAmbience();
      ambience.setMuted(muted);
    } catch (_) {}
  }

  try {
    const { startHub } = await import("./world.js");
    hub = await startHub({
      canvas,
      reducedMotion,
      onFrame({ side, portal, clickPortal, zoneName }) {
        document.body.classList.toggle("side-gehirn", side > 0.58);
        document.body.classList.toggle("side-seele", side < 0.42);
        if (zoneEl) zoneEl.textContent = zoneName;
        ambience?.setSide(side);
        nearest = portal;
        if (prompt) {
          if (portal) {
            prompt.hidden = false;
            prompt.dataset.kind = portal.id;
            prompt.querySelector("[data-prompt-kicker]").textContent = copy[portal.id].kicker[language];
            prompt.querySelector("[data-prompt-title]").textContent = portal.id === "seele" ? "Seele" : "Gehirn";
            prompt.querySelector("[data-prompt-action]").textContent = copy[portal.id].action[language];
          } else {
            prompt.hidden = true;
          }
        }
        if (clickPortal) {
          const match = hub.PORTALS.find((item) => item.id === clickPortal);
          if (match) go(match);
        }
      },
    });
    hub.setLanguage(language);
    bootFade?.classList.add("is-off");
    window.setTimeout(() => hint?.classList.add("is-fading"), 5200);
  } catch (error) {
    console.error(error);
    bootFade?.classList.add("is-off");
    if (hint) {
      hint.textContent = language === "de"
        ? "3D nicht verfügbar — nutze die Links oben."
        : "3D unavailable — use the links above.";
    }
    return;
  }

  window.addEventListener("pointerdown", armAudio, { once: true });
  muteBtn?.addEventListener("click", () => {
    armAudio();
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", muted ? "false" : "true");
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (_) {}
    ambience?.setMuted(muted);
  });

  prompt?.addEventListener("click", () => {
    if (nearest) go(nearest);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyE" || event.code === "Enter") {
      if (nearest) go(nearest);
    }
  });
}

boot();
