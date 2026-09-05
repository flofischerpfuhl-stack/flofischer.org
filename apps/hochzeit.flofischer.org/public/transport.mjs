export async function requestJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

export function pollDelay(role, failures = 0, hidden = false) {
  const normal = role === "vote" ? 3000 : 1200;
  return Math.min(15000, Math.max(normal, hidden ? 10000 : 0) * 2 ** Math.min(failures, 4));
}

export function acceptState(current, next) {
  return !current || !next.access?.valid || Number(next.revision) >= Number(current.revision);
}

// randomUUID is unavailable on plain HTTP LAN addresses on some browsers.
export function actionId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, "0")).join("");
}
