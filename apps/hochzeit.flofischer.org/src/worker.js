import { DurableObject } from "cloudflare:workers";
import {
  ROOM,
  buzzerAction,
  hydrateState,
  hostAction,
  isHost,
  judgeAction,
  mapAction,
  publicState,
  voteAction,
} from "./game.mjs";
import { qrMatchesGame, qrResponse } from "./qr.mjs";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        return await env.ROOM.getByName(ROOM).fetch(request);
      }
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({
        message: "request_failed",
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ ok: false, error: "server_error" }, 500);
    }
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hostPin = String(env.HOST_PIN || "");
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("game");
      this.data = hydrateState(saved);
      await ctx.storage.put("game", this.data);
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/qr") {
      return qrResponse(request, (target) => qrMatchesGame(this.data, target));
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      const host = await isHost({ pin: url.searchParams.get("pin") || "" }, this.hostPin) || await validHostCookie(request, this.data.session.id, this.hostPin);
      const ballot = ballotCredential(request);
      return json(publicState(this.data, {
        host,
        role: url.searchParams.get("role") || "",
        team: url.searchParams.get("team") || "",
        token: url.searchParams.get("token") || "",
        uid: ballot.id,
      }), 200, url.searchParams.get("role") === "vote" ? { "set-cookie": ballot.cookie } : {});
    }

    if (request.method === "POST" && url.pathname === "/api/host") {
      const body = await readJson(request);
      if (!(await isHost(body, this.hostPin))) return json({ ok: false, error: "wrong_pin" }, 401);
      return json({ ok: true, room: ROOM }, 200, { "set-cookie": await makeHostCookie(this.data.session.id, request.url, this.hostPin) });
    }

    if (request.method === "POST" && url.pathname === "/api/action") {
      const body = await readJson(request);
      if (!(await isHost(body, this.hostPin)) && !(await validHostCookie(request, this.data.session.id, this.hostPin))) return json({ ok: false, error: "forbidden" }, 403);
      const next = structuredClone(this.data);
      const result = hostAction(next, body);
      if (!result.ok) return json(result, result.status);
      await this.persist(next);
      this.data = next;
      return json({ ok: true, state: publicState(this.data, { host: true }) }, 200, { "set-cookie": await makeHostCookie(this.data.session.id, request.url, this.hostPin) });
    }

    if (request.method === "POST" && url.pathname === "/api/map") {
      const body = await readJson(request);
      const next = structuredClone(this.data);
      const result = mapAction(next, body);
      if (!result.ok) return json(result, result.status);
      await this.persist(next);
      this.data = next;
      return json({ ok: true, state: publicState(this.data, { role: "pad", team: body.team, token: body.token }) });
    }

    if (request.method === "POST" && url.pathname === "/api/judge") {
      const body = await readJson(request);
      const next = structuredClone(this.data);
      const result = judgeAction(next, body);
      if (!result.ok) return json(result, result.status);
      await this.persist(next);
      this.data = next;
      return json({ ok: true, state: publicState(this.data, { role: "judge", team: body.team, token: body.token }) });
    }

    if (request.method === "POST" && url.pathname === "/api/buzzer") {
      const body = await readJson(request);
      const next = structuredClone(this.data);
      const result = buzzerAction(next, body);
      if (!result.ok) return json(result, result.status);
      await this.persist(next);
      this.data = next;
      return json({ ok: true, state: publicState(this.data, { role: "buzzer", team: body.team, token: body.token }) });
    }

    if (request.method === "POST" && url.pathname === "/api/vote") {
      const body = await readJson(request);
      if (!sameOriginJson(request)) return json({ ok: false, error: "bad_request_origin" }, 403);
      const ballot = ballotCredential(request);
      body.uid = ballot.id;
      const next = structuredClone(this.data);
      const result = voteAction(next, body);
      if (!result.ok) return json(result, result.status);
      await this.persist(next);
      this.data = next;
      return json({ ok: true, state: publicState(this.data, { role: "vote", token: body.token, uid: ballot.id }) }, 200, { "set-cookie": ballot.cookie });
    }

    return json({ ok: false, error: "not_found" }, 404);
  }

  async persist(next) {
    await this.ctx.storage.put("game", next);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(value, status = 200, extraHeaders = {}) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function ballotCredential(request) {
  const existing = /(?:^|;\s*)hochzeit_ballot=([a-f0-9]{32})/.exec(request.headers.get("cookie") || "")?.[1];
  const id = existing || crypto.randomUUID().replaceAll("-", "");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { id, cookie: `hochzeit_ballot=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}` };
}

function sameOriginJson(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function hostToken(sessionId, hostPin) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${hostPin}:${sessionId}:hochzeit-host`));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function validHostCookie(request, sessionId, hostPin) {
  const value = /(?:^|;\s*)hochzeit_host=([a-f0-9]{64})/.exec(request.headers.get("cookie") || "")?.[1];
  return Boolean(hostPin && value && value === await hostToken(sessionId, hostPin));
}

async function makeHostCookie(sessionId, requestUrl, hostPin) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `hochzeit_host=${await hostToken(sessionId, hostPin)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`;
}
