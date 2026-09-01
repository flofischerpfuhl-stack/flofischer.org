self.PWA_CONFIG = {
  site: "root",
  shell: [
    "/",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/shared/language.js",
    "/shared/hub/hub.css",
    "/shared/hub/diorama.css",
    "/shared/hub/diorama.js",
    "/shared/hub/art/diorama-preview.webp"
  ]
};
importScripts("/shared/pwa-worker.js");
