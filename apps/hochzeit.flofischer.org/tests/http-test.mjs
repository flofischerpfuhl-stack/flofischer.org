import assert from "node:assert/strict";

const origin = process.env.BASE_URL || "http://127.0.0.1:8787";
const hostPin = process.env.HOST_PIN || "0000";
const results = [];

async function request(path, options = {}) {
  const response = await fetch(origin + path, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

async function post(path, body) {
  return request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function host(type, extra = {}) {
  const result = await post("/api/action", { type, pin: hostPin, ...extra });
  assert.equal(result.response.status, 200, `${type}: ${JSON.stringify(result.body)}`);
  return result.body.state;
}

async function openGame(id) {
  let state = (await request(`/api/state?pin=${encodeURIComponent(hostPin)}`)).body;
  if (state.active && !state.active.awarded) await host("game:discard");
  else if (state.active) await host("close");
  state = (await request(`/api/state?pin=${encodeURIComponent(hostPin)}`)).body;
  if (!state.flipped[id]) {
    await host("flip", { id });
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  state = await host("start", { id });
  if (state.active.kind === "physical") state = await host("physical:ready");
  return state;
}

function pass(name) { results.push(name); console.log(`PASS ${name}`); }

let result = await post("/api/host", { pin: `${hostPin}-wrong` });
assert.equal(result.response.status, 401);
result = await post("/api/host", { pin: hostPin });
assert.equal(result.response.status, 200);
assert.equal(result.body.room, "KATHI");
pass("Host PIN wrong/right");

let state = await host("session:new", { label: "HTTP Testshow" });
const sessionId = state.session.id;
assert.equal(state.session.label, "HTTP Testshow");
assert.deepEqual(state.scores, { rosa: 0, blau: 0 });
assert.deepEqual(state.flipped, {});
result = await request(`/api/state?pin=${encodeURIComponent(hostPin)}`);
assert.equal(result.body.session.id, sessionId);
result = await request(`/api/state?pin=${encodeURIComponent(hostPin)}`);
assert.equal(result.body.session.id, sessionId, "ordinary page/API reloads must keep the same show");
pass("Explicit session start and reload persistence");

state = await openGame("aktion-2");
assert.equal(state.active.kind, "physical");
assert.equal(state.challenge.timer.mode, "stopwatch");
assert.equal(state.challenge.timer.elapsedMs, 0);
state = await host("timer:start");
assert.equal(typeof state.challenge.timer.runningSince, "number");
result = await request(`/api/state?pin=${encodeURIComponent(hostPin)}`);
assert.equal(result.body.challenge.timer.runningSince, state.challenge.timer.runningSince);
pass("Shirt race uses a shared stopwatch that survives API reload");

state = await openGame("aktion-4");
assert.equal(state.challenge.judgeTokens, undefined);
state = await host("relay:start");
result = await post("/api/action", { pin: hostPin, type: "relay:change", delta: 1 });
assert.equal(result.response.status, 409);
assert.equal(result.body.error, "relay_progress_not_tracked");
state = await host("relay:finish");
assert.equal(state.challenge.relay.rounds.rosa.done, true);
result = await request(`/api/qr?u=${encodeURIComponent(`/judge/rosa?t=${"a".repeat(32)}`)}`);
assert.equal(result.response.status, 400, "obsolete push-up judge QR is gone");
state = await openGame("party-3");
state = await host("cut:guess", { guess: "left" });
state = await host("cut:weigh", { left: 101.2, right: 99.8 });
assert.equal((await request("/api/state?role=screen")).body.challenge.cutting.current.weights, undefined);
assert.deepEqual(state.challenge.cutting.current.weights, { left: 101.2, right: 99.8 });
pass("Sequential push-up relay and private cutting-game weights over HTTP");

state = await openGame("raten-3");
assert.equal(state.cards.find((card) => card.id === "raten-3").rounds.length, 5);
for (let round = 0; round < 5; round++) {
  state = await host("quiz:ready", { team: "rosa" });
  state = await host("quiz:ready", { team: "blau" });
  state = await host("quiz:reveal");
  state = await host("quiz:mark", { team: round < 4 ? "rosa" : "blau", correct: true });
  state = await host("quiz:mark", { team: round < 4 ? "blau" : "rosa", correct: false });
  state = await host("quiz:next");
}
assert.equal(state.challenge.main.complete, true);
assert.equal(Object.keys(state.challenge.main.marks).length, 5);
for (const asset of Array.from({ length: 6 }, (_, index) => `/media/plate-0${index + 1}.svg`)) {
  result = await request(asset);
  assert.equal(result.response.status, 200, asset);
  assert.match(result.response.headers.get("content-type"), /^image\/svg\+xml/);
  assert.match(result.body, /<svg/);
}
pass("Five license-plate rounds and six styled plate graphics");

state = await openGame("raten-1");
const musicCard = state.cards.find((card) => card.id === "raten-1");
assert.equal(musicCard.rounds.length, 5);
assert.equal(musicCard.answerMode, "call");
for (const round of musicCard.rounds) {
  assert.equal(round.media, "audio");
  result = await request(round.asset);
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get("content-type"), /^audio\/mpeg/);
  assert.ok(Number(result.response.headers.get("content-length")) > 300000);
}
result = await request("/audio.mjs");
assert.equal(result.response.status, 200);
assert.match(result.body, /createObjectURL/);
state = await host("quiz:call", { team: "rosa" });
state = await host("quiz:call:judge", { correct: false });
const musicScreen = (await request("/api/state?role=screen")).body;
assert.equal(musicScreen.cards.find(card => card.id === "raten-1").rounds[0].answer, undefined);
state = await host("quiz:call:opponent", { correct: true });
assert.equal(state.challenge.main.roundPoints[0].blau, 2);
pass("Five complete MP3 clips and weighted calls with hidden counteranswer");

state = await openGame("raten-2");
assert.equal(state.cards.find((card) => card.id === "raten-2").rounds.length, 5);
result = await request("/media/foto-raten-sprite.png");
assert.equal(result.response.status, 200);
assert.equal(result.response.headers.get("content-type"), "image/png");
assert.ok(result.body.length > 1_000_000);
pass("Five photo rounds and local high-resolution image sprite");

state = await host("score:set", { rosa: 0, blau: 0 });
state = await openGame("raten-4");
assert.equal(state.map.roundCount, 3);
let rosaToken = state.map.tokens.rosa;
let blauToken = state.map.tokens.blau;
const qrTarget = `/pad/rosa?t=${rosaToken}`;
result = await request(`/api/qr?u=${encodeURIComponent(qrTarget)}`);
assert.equal(result.response.status, 200);
assert.match(result.response.headers.get("content-type"), /^image\/svg\+xml/);
result = await request(`/api/qr?u=${encodeURIComponent(`/pad/rosa?t=${"a".repeat(32)}`)}`);
assert.equal(result.response.status, 400);
for (let round = 0; round < 3; round++) {
  const roundId = state.map.roundId;
  result = await post("/api/map", { type: "map:tap", team: "rosa", token: rosaToken, roundId, lat: 48 + round, lng: 11 });
  assert.equal(result.response.status, 200);
  assert.deepEqual(Object.keys(result.body.state.map.taps), ["rosa"]);
  result = await request(`/api/state?role=pad&team=blau&token=${blauToken}`);
  assert.deepEqual(result.body.map.taps, {}, `round ${round + 1}: blue must not receive pink pin`);
  result = await post("/api/map", { type: "map:tap", team: "blau", token: blauToken, roundId, lat: -34, lng: 151 - round });
  assert.equal(result.response.status, 200);
  result = await request(`/api/state?role=pad&team=rosa&token=${rosaToken}`);
  assert.deepEqual(Object.keys(result.body.map.taps), ["rosa"], `round ${round + 1}: pink must not receive blue pin`);
  if (round === 1) {
    const confirmations = await Promise.all([
      post("/api/map", { type: "map:confirm", team: "rosa", token: rosaToken, roundId }),
      post("/api/map", { type: "map:confirm", team: "blau", token: blauToken, roundId }),
    ]);
    assert.ok(confirmations.every((confirmation) => confirmation.response.status === 200));
    assert.deepEqual(confirmations.map((confirmation) => confirmation.body.state.map.done).sort(), [false, true], "simultaneous confirmations must serialize without losing either team");
    result = confirmations.find((confirmation) => confirmation.body.state.map.done);
  } else {
    result = await post("/api/map", { type: "map:confirm", team: "rosa", token: rosaToken, roundId });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.map.done, false);
    assert.deepEqual(Object.keys(result.body.state.map.taps), ["rosa"], "the first confirmed pad stays private");
    result = await post("/api/map", { type: "map:confirm", team: "blau", token: blauToken, roundId });
    assert.equal(result.response.status, 200);
  }
  assert.equal(result.body.state.map.done, true, "the second confirmation auto-resolves");
  assert.deepEqual(Object.keys(result.body.state.map.taps).sort(), ["blau", "rosa"]);
  assert.equal(Number.isFinite(result.body.state.map.place.lat), true);
  result = await request(`/api/state?role=pad&team=blau&token=${blauToken}`);
  assert.deepEqual(Object.keys(result.body.map.taps).sort(), ["blau", "rosa"]);
  assert.equal(result.body.map.done, true);
  if (round < 2) state = await host("map:next");
}
state = (await request(`/api/state?pin=${encodeURIComponent(hostPin)}`)).body;
assert.equal(state.map.complete, true);
assert.equal(state.map.roundResults.length, 3);
assert.ok(state.active.awarded, "map winner must be awarded automatically");
assert.equal(state.completed["raten-4"].result, state.active.awarded);
assert.ok(state.scores.rosa === 4 || state.scores.blau === 4 || (state.scores.rosa === 0 && state.scores.blau === 0));
pass("Three map rounds, privacy, concurrent confirmations, actual target and automatic points");

state = await host("qr:regenerate");
assert.notEqual(state.map.tokens.rosa, rosaToken);
result = await request(`/api/state?role=pad&team=rosa&token=${rosaToken}`);
assert.deepEqual(result.body, { room: "KATHI", access: { role: "pad", team: "rosa", valid: false } });
result = await request(`/api/qr?u=${encodeURIComponent(qrTarget)}`);
assert.equal(result.response.status, 400);
pass("QR regeneration invalidates old map access");

state = await host("score:set", { rosa: 0, blau: 0 });

state = await openGame("vote-2");
const voteTokens = state.vote.tokens;
assert.deepEqual(Object.keys(voteTokens), ["guests"]);
result = await request("/api/state?role=screen");
assert.equal(result.body.vote.guestToken, voteTokens.guests);
assert.equal(result.body.vote.tokens, undefined);
assert.equal(result.body.vote.guesses, undefined);
result = await request(`/api/qr?u=${encodeURIComponent(`/vote?t=${result.body.vote.guestToken}`)}`);
assert.equal(result.response.status, 200, "projector guest QR must be renderable before voting opens");
result = await request(`/api/qr?u=${encodeURIComponent(`/vote?t=${voteTokens.guests}`)}`);
assert.equal(result.response.status, 200);
result = await post("/api/action", { type: "vote:open", pin: hostPin });
assert.equal(result.response.status, 409);
result = await post("/api/action", { type: "vote:guesses:set", pin: hostPin, rosaPercent: 40, blauPercent: 70 });
assert.equal(result.response.status, 200);
result = await request(`/api/state?pin=${encodeURIComponent(hostPin)}`);
assert.deepEqual(result.body.vote.guessStatus, { rosa: true, blau: true });
assert.deepEqual(result.body.vote.guesses, { rosa: { percent: 40 }, blau: { percent: 70 } });
const roleCheckLogin = await post("/api/host", { pin: hostPin });
const roleCheckCookie = roleCheckLogin.response.headers.get("set-cookie").split(";")[0];
const roleCheck = await request(`/api/state?role=vote&token=${voteTokens.guests}`, { headers: { cookie: roleCheckCookie } });
assert.equal(roleCheck.body.access.role, "vote");
assert.equal(roleCheck.body.vote.guesses, undefined, "a host opening a guest URL must still see only guest information");
result = await request("/api/state?role=screen");
assert.equal(result.body.vote.guesses, undefined);
state = await host("vote:open");
result = await request("/api/state?role=screen");
assert.equal(result.body.vote.phase, "voting");
assert.equal(result.body.vote.guestToken, voteTokens.guests);
result = await post("/api/vote", { token: voteTokens.guests, uid: "ignored", choice: "a" });
assert.equal(result.response.status, 200);
const guestCookie = result.response.headers.get("set-cookie").split(";")[0];
result = await post("/api/vote", { token: voteTokens.guests, uid: "also-ignored", choice: "b" });
assert.equal(result.response.status, 200);
result = await request(`/api/state?role=vote&token=${voteTokens.guests}`, { headers: { cookie: guestCookie } });
assert.equal(result.body.vote.choice, "a");
assert.equal(result.body.vote.counts, undefined);
state = await host("vote:close", { force: true });
state = await host("vote:reveal");
assert.deepEqual(state.vote.counts, { a: 1, b: 1 });
assert.deepEqual(state.vote.guesses, { rosa: { percent: 40 }, blau: { percent: 70 } });
assert.equal(state.active.awarded, "rosa");
pass("Moderator-recorded team guesses, public guest QR, close gate, and automatic result");

const awardedRevision = state.revision;
state = await host("history:undo");
assert.deepEqual(state.scores, { rosa: 0, blau: 0 });
assert.equal(state.active.awarded, null);
assert.ok(state.revision > awardedRevision);
state = await host("history:redo");
assert.deepEqual(state.scores, { rosa: 2, blau: 0 });
assert.equal(state.active.awarded, "rosa");
pass("Undo and redo of complete score/game snapshot");

state = await host("close");
result = await post("/api/action", { type: "start", pin: hostPin, id: "vote-2" });
assert.equal(result.response.status, 409);
assert.equal(result.body.error, "card_completed");
assert.equal(state.flipped["vote-2"], true);
pass("Completed card stays face-up and cannot reopen");

const previousSession = state.session.id;
state = await host("session:new", { label: "Neue Runde" });
assert.notEqual(state.session.id, previousSession);
assert.deepEqual(state.scores, { rosa: 0, blau: 0 });
assert.deepEqual(state.flipped, {});
state = await host("history:undo");
assert.equal(state.session.id, previousSession);
assert.deepEqual(state.scores, { rosa: 2, blau: 0 });
pass("New session reset is explicit and recoverable");

result = await request("/api/state");
assert.deepEqual(result.body, { room: "KATHI", access: { role: "viewer", valid: false } });
result = await request("/api/state?role=screen");
assert.equal(result.body.access.role, "screen");
assert.equal(result.body.vote.tokens, undefined);
assert.deepEqual(result.body.vote.guesses, { rosa: { percent: 40 }, blau: { percent: 70 } }, "revealed predictions belong on the projector");
result = await request("/api/state?role=pad&team=rosa&token=wrong");
assert.deepEqual(result.body, { room: "KATHI", access: { role: "pad", team: "rosa", valid: false } });
pass("Anonymous and invalid-token state stays minimal");

for (const asset of ["/", "/styles.css", "/app.js", "/transport.mjs", "/world.jpg"]) {
  result = await request(asset);
  assert.equal(result.response.status, 200, asset);
}
result = await request("/");
assert.match(result.body, /session-dialog/);
assert.match(result.body, /Schlag den Ehepartner/);
result = await request("/styles.css");
assert.match(result.body, /overflow-wrap/);
assert.match(result.body, /@media \(max-width: 460px\)/);
assert.match(result.body, /map-zoom-controls/);
assert.match(result.body, /show-logo-lockup/);
assert.match(result.body, /\.tile-inner\s*\{[^}]*display:\s*block/);
result = await request("/app.js");
assert.match(result.body, /data-map-zoom/);
assert.match(result.body, /completed-badge/);
assert.match(result.body, /aria-label="Schlag den Ehepartner"/);
assert.doesNotMatch(result.body, /Schlag das Team/i);
assert.match(result.body, /screen-guest-qr/);
pass("HTML, gameshow styles, responsive overflow rules, and map asset");

result = await post("/api/buzzer", { team: "rosa", token: "obsolete" });
assert.equal(result.response.status, 410, "old device links cannot interfere with spoken tiebreaks");
result = await request("/api/backup");
assert.equal(result.response.status, 403);
const login = await post("/api/host", { pin: hostPin });
const cookie = login.response.headers.get("set-cookie").split(";")[0];
result = await request("/api/backup", { headers: { cookie } });
assert.equal(result.response.status, 200);
const backup = result.body;
assert.equal(backup.format, "hochzeit-show-backup");
assert.equal(backup.state.history, undefined);
assert.deepEqual(backup.state.scores, { rosa: 2, blau: 0 });
pass("Authenticated show backup and retired device buzzer");

const current = (await request("/api/state", { headers: { cookie } })).body;
assert.ok(Number.isFinite(current.serverNow));
if (current.localMode) {
  state = await host("score:set", { rosa: 99, blau: 99 });
  result = await request("/api/restore", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ backup, expectedHostRevision: state.hostRevision }) });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.state.scores, { rosa: 2, blau: 0 });
  assert.equal(result.body.state.localMode, true);
  assert.ok(result.body.state.revision > state.revision);
  result = await request("/api/restore", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ backup, expectedHostRevision: state.hostRevision }) });
  assert.equal(result.response.status, 409, "an old import cannot overwrite intervening state");
  pass("Local backup restore with conflict protection");
}

console.log(`\n${results.length} HTTP test groups passed at ${origin}`);
