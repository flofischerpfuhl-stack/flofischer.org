self.PWA_CONFIG = {
  site: "seele",
  shell: [
    "/",
    "/manifest.webmanifest",
    "/icons/icon-192.png?v=2",
    "/icons/icon-512.png?v=2",
    "/shared/language.js",
    "/shared/designs/base.css",
    "/shared/seele/seele.css",
    "/shared/seele/seele.js",
    "/shared/seele/search-index.json",
    "/shared/seele/symbols/botanical-cross.webp"
  ]
};
importScripts("/shared/pwa-worker.js");
