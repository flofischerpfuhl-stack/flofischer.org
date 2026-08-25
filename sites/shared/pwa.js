(() => {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  const localSite = window.location.pathname.match(/^\/(__(?:root|seele|gehirn))(?:\/|$)/);
  const prefix = localSite ? `/${localSite[1]}` : "";
  const serviceWorkerUrl = `${prefix}/sw.js`;
  const scope = `${prefix}/`;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(serviceWorkerUrl, { scope }).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }, { once: true });
})();
