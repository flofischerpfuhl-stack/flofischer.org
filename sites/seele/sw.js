self.PWA_CONFIG = {
  site: "seele",
  shell: [
    "/",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/shared/designs/base.css",
    "/shared/seele/seele.css",
    "/shared/seele/seele.js",
    "/shared/seele/search-index.json",
    "/shared/seele/symbols/botanical-cross.png"
  ]
};
importScripts("/shared/pwa-worker.js");
