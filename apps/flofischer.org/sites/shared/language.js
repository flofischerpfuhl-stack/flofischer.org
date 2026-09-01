(function (global) {
  "use strict";

  const KEY = "ff-language";
  const COOKIE = "ff-language";
  const COOKIE_AGE = 60 * 60 * 24 * 365;
  const SUPPORTED = new Set(["de", "en"]);

  function normalize(value) {
    const language = String(value || "").trim().toLowerCase().split("-")[0];
    return SUPPORTED.has(language) ? language : null;
  }

  function cookieLanguage() {
    const prefix = `${COOKIE}=`;
    const value = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return normalize(value?.slice(prefix.length));
  }

  function browserLanguage() {
    const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
    return preferences.map(normalize).find(Boolean) || "en";
  }

  function writeCookie(language) {
    const production = location.hostname === "flofischer.org" || location.hostname.endsWith(".flofischer.org");
    const domain = production ? "; Domain=flofischer.org" : "";
    const secure = production ? "; Secure" : "";
    document.cookie = `${COOKIE}=${language}; Path=/; Max-Age=${COOKIE_AGE}; SameSite=Lax${domain}${secure}`;
  }

  function set(language) {
    const normalized = normalize(language) || "en";
    try { localStorage.setItem(KEY, normalized); } catch (_) {}
    writeCookie(normalized);
    return normalized;
  }

  function get() {
    const fromCookie = cookieLanguage();
    if (fromCookie) return fromCookie;

    try {
      const legacy = normalize(localStorage.getItem(KEY));
      if (legacy) {
        writeCookie(legacy);
        return legacy;
      }
    } catch (_) {}

    return browserLanguage();
  }

  const language = get();
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;

  global.FFLanguage = Object.freeze({ get, set, normalize });
})(window);
