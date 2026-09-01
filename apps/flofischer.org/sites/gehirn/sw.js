self.PWA_CONFIG = {
  site: "gehirn",
  shell: [
    "/",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/shared/language.js",
    "/shared/designs/base.css",
    "/shared/gehirn/gehirn.css?v=2",
    "/shared/gehirn/gehirn.js?v=2",
    "/shared/gehirn/gehirn-three.js?v=2"
  ]
};
importScripts("/shared/pwa-worker.js");
