self.PWA_CONFIG = {
  site: "gehirn",
  shell: [
    "/",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/favicon.svg",
    "/shared/language.js",
    "/shared/gehirn/site.css?v=1",
    "/shared/gehirn/site.js?v=1",
    "/shared/gehirn/assets/brain-frames.webp",
    "/shared/gehirn/assets/geist.woff2",
    "/shared/gehirn/assets/geist-mono.woff2"
  ]
};
importScripts("/shared/pwa-worker.js");
