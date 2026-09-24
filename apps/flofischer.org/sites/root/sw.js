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
    "/shared/hub/diorama/utils.js",
    "/shared/hub/diorama/layout.js",
    "/shared/hub/diorama/textures.js",
    "/shared/hub/diorama/materials.js",
    "/shared/hub/diorama/island.js",
    "/shared/hub/diorama/seele.js",
    "/shared/hub/diorama/gehirn.js",
    "/shared/hub/diorama/atmosphere.js",
    "/shared/hub/diorama/signs.js",
    "/shared/hub/art/diorama-preview.webp"
  ]
};
importScripts("/shared/pwa-worker.js");
