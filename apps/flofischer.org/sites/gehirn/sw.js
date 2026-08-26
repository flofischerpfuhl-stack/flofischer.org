self.PWA_CONFIG = {
  site: "gehirn",
  shell: [
    "/",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/shared/designs/base.css",
    "/shared/gehirn/gehirn.css",
    "/shared/gehirn/gehirn.js",
    "/shared/gehirn/gehirn-three.js"
  ]
};
importScripts("/shared/pwa-worker.js");
