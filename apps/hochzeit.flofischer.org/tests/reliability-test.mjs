import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLocalStore } from "../src/local-store.mjs";
import { exportBackup, restoreBackup } from "../src/backup.mjs";
import { hostAction, freshState } from "../src/game.mjs";
import { requestJson, pollDelay, acceptState, actionId } from "../public/transport.mjs";

test("local store survives restart, serializes requests, and does not persist rejected actions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hochzeit-store-"));
  try {
    const file = join(dir, "game.json");
    const store = await openLocalStore(file);
    const session = store.data.session.id;
    const message = { type: "score:set", rosa: 12, blau: 8, actionId: "once", expectedHostRevision: 0 };
    const results = await Promise.all([store.mutate(next => hostAction(next, message)), store.mutate(next => hostAction(next, message))]);
    assert.ok(results.every(r => r.ok));
    assert.equal(store.data.revision, 1);
    const disk = await readFile(file, "utf8");
    await store.mutate(next => { next.scores.rosa = 999; return { ok: false }; });
    assert.equal(await readFile(file, "utf8"), disk);
    assert.equal(store.data.scores.rosa, 12);
    const restarted = await openLocalStore(file);
    assert.equal(restarted.data.session.id, session);
    assert.deepEqual(restarted.data.scores, { rosa: 12, blau: 8 });
    assert.equal(hostAction(restarted.data, message).ok, true);
    assert.equal(restarted.data.revision, 1);
    await writeFile(file, "{broken");
    await assert.rejects(openLocalStore(file), /Spielstand konnte nicht gelesen/);
    assert.equal(await readFile(file, "utf8"), "{broken", "corruption must never silently reset a show");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("backup transfers an active show, scores, tokens and timer", () => {
  const data = freshState();
  hostAction(data, { type: "flip", id: "aktion-4" }, undefined, () => 1000);
  hostAction(data, { type: "start", id: "aktion-4" }, undefined, () => 2000);
  hostAction(data, { type: "physical:ready" });
  hostAction(data, { type: "relay:start" }, undefined, () => 3000);
  hostAction(data, { type: "score:set", rosa: 8, blau: 10 });
  const backup = JSON.parse(JSON.stringify(exportBackup(data)));
  const restored = restoreBackup(backup);
  assert.equal(restored.session.id, data.session.id);
  assert.deepEqual(restored.scores, data.scores);
  assert.deepEqual(restored.challenge.relay, data.challenge.relay);
  assert.equal(restored.history.past.length, 0);
  assert.throws(() => restoreBackup({}), /invalid_backup/);
  backup.state.scores.rosa = -1;
  assert.throws(() => restoreBackup(backup), /invalid_backup/);
});

test("requests time out even when headers arrive but the response body stalls", async t => {
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return { json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
  });
  await assert.rejects(requestJson("/api/state", {}, 20), /aborted/);
  assert.equal(signal.aborted, true);
});

test("guests poll less often and network failures back off; late replies cannot rewind state", () => {
  assert.equal(pollDelay("vote"), 3000);
  assert.ok(pollDelay("vote", 2) > pollDelay("vote"));
  assert.equal(pollDelay("vote", 99), 15000);
  assert.equal(pollDelay("screen", 0, true), 10000);
  assert.equal(acceptState({ revision: 5 }, { access: { valid: true }, revision: 4 }), false);
  assert.equal(acceptState({ revision: 5 }, { access: { valid: false } }), true);
  assert.match(actionId(), /^[a-f0-9]{32}$/);
});
