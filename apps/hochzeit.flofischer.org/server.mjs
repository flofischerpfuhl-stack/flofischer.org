import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROOM,
  buzzerAction,
  freshState,
  hostAction,
  isHost,
  mapAction,
  publicState,
  voteAction,
} from "./src/game.mjs";
import { qrMatchesGame, qrResponse } from "./src/qr.mjs";

const PORT = Number(process.env.PORT || 8787);
const HOST_PIN = process.env.HOST_PIN || "0000";
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const data = freshState();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    setSecurityHeaders(response);

    if (request.method === "GET" && url.pathname === "/api/qr") {
      const qr = await qrResponse(new Request(url.href), (target) => qrMatchesGame(data, target));
      response.writeHead(qr.status, Object.fromEntries(qr.headers));
      return response.end(Buffer.from(await qr.arrayBuffer()));
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      const host = await isHost({ pin: url.searchParams.get("pin") || "" }, HOST_PIN) || await validHostCookie(request, data.session.id);
      const ballot = ballotCredential(request, url);
      response.setHeader("set-cookie", ballot.cookie);
      return sendJson(response, publicState(data, {
        host,
        role: url.searchParams.get("role") || "",
        team: url.searchParams.get("team") || "",
        token: url.searchParams.get("token") || "",
        uid: ballot.id,
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/host") {
      const body = await readJson(request);
      if (!(await isHost(body, HOST_PIN))) return sendJson(response, { ok: false, error: "wrong_pin" }, 401);
      response.setHeader("set-cookie", await makeHostCookie(data.session.id, url));
      return sendJson(response, { ok: true, room: ROOM });
    }

    if (request.method === "POST" && url.pathname === "/api/action") {
      const body = await readJson(request);
      if (!(await isHost(body, HOST_PIN)) && !(await validHostCookie(request, data.session.id))) return sendJson(response, { ok: false, error: "forbidden" }, 403);
      const result = hostAction(data, body);
      if (!result.ok) return sendJson(response, result, result.status);
      response.setHeader("set-cookie", await makeHostCookie(data.session.id, url));
      return sendJson(response, { ok: true, state: publicState(data, { host: true }) });
    }

    if (request.method === "POST" && url.pathname === "/api/map") {
      const body = await readJson(request);
      const result = mapAction(data, body);
      if (!result.ok) return sendJson(response, result, result.status);
      return sendJson(response, { ok: true, state: publicState(data, { role: "pad", team: body.team, token: body.token }) });
    }

    if (request.method === "POST" && url.pathname === "/api/buzzer") {
      const body = await readJson(request);
      const result = buzzerAction(data, body);
      if (!result.ok) return sendJson(response, result, result.status);
      return sendJson(response, { ok: true, state: publicState(data, { role: "buzzer", team: body.team, token: body.token }) });
    }

    if (request.method === "POST" && url.pathname === "/api/vote") {
      const body = await readJson(request);
      if (!sameOriginJson(request, url)) return sendJson(response, { ok: false, error: "bad_request_origin" }, 403);
      const ballot = ballotCredential(request, url);
      body.uid = ballot.id;
      response.setHeader("set-cookie", ballot.cookie);
      const result = voteAction(data, body);
      if (!result.ok) return sendJson(response, result, result.status);
      return sendJson(response, { ok: true, state: publicState(data, { role: "vote", token: body.token, uid: body.uid }) });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return serveStatic(url.pathname, request.method === "HEAD", response);
    }

    return sendJson(response, { ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error(error);
    return sendJson(response, { ok: false, error: "server_error" }, 500);
  }
});

async function serveStatic(pathname, headOnly, response) {
  const assetMatch = pathname.match(/^\/(world\.jpg|app\.js|styles\.css|media\/[a-z0-9-]+\.(?:svg|png))$/i);
  const fileName = assetMatch ? assetMatch[1] : "index.html";
  const body = await readFile(join(PUBLIC_DIR, fileName));
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
  };
  response.writeHead(200, {
    "content-type": types[extname(fileName)] || "application/octet-stream",
    "cache-control": fileName === "index.html" ? "no-store" : "public, max-age=3600",
  });
  response.end(headOnly ? undefined : body);
}

function ballotCredential(request, url) {
  const existing = /(?:^|;\s*)hochzeit_ballot=([a-f0-9]{32})/.exec(request.headers.cookie || "")?.[1];
  const id = existing || crypto.randomUUID().replaceAll("-", "");
  return { id, cookie: `hochzeit_ballot=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}` };
}

function sameOriginJson(request, url) {
  if (!(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return false;
  return !request.headers.origin || request.headers.origin === url.origin;
}

async function hostToken(sessionId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${HOST_PIN}:${sessionId}:hochzeit-host`));
  return Buffer.from(digest).toString("hex");
}

async function validHostCookie(request, sessionId) {
  const value = /(?:^|;\s*)hochzeit_host=([a-f0-9]{64})/.exec(request.headers.cookie || "")?.[1];
  return Boolean(value && value === await hostToken(sessionId));
}

async function makeHostCookie(sessionId, url) {
  return `hochzeit_host=${await hostToken(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}`;
}

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("x-frame-options", "SAMEORIGIN");
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      if (body.length < 100_000) body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`READY http://127.0.0.1:${PORT} · Hochzeitsshow`);
});
