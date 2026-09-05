import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CARDS,
  buzzerAction,
  freshState,
  hostAction,
  hydrateState,
  isHost,
  mapAction,
  publicState,
  quizScores,
  voteAction,
} from "../src/game.mjs";

function tokens() {
  let next = 0;
  return () => `${(++next).toString(16).padStart(32, "a")}`;
}

function start(data, id, makeToken = tokens(), now = () => 1_000) {
  const revealedAt = now();
  assert.equal(hostAction(data, { type: "flip", id }, makeToken, () => revealedAt).ok, true);
  assert.equal(data.active, null, "first click only reveals the card");
  assert.equal(hostAction(data, { type: "start", id }, makeToken, () => revealedAt + 700).ok, true);
  if (data.active?.kind === "physical") assert.equal(hostAction(data, { type: "physical:ready" }, makeToken, () => revealedAt + 701).ok, true);
  return data;
}

test("all 20 games have a complete and startable gameplay definition", async () => {
  assert.equal(CARDS.length, 20);
  for (const category of ["Aktion", "Party", "Raten", "Abstimmung"]) {
    assert.equal(CARDS.filter((card) => card.cat === category).length, 5, `${category} must contain five games`);
  }
  for (const card of CARDS) {
    assert.ok(card.id && card.title && card.text && card.stars >= 1 && card.stars <= 5);
    const data = start(freshState(tokens()), card.id, tokens());
    assert.equal(data.active.id, card.id);
    if (card.kind === "physical") {
      assert.ok(card.setup.length >= 3 && card.rules.length >= 3 && card.decision);
      assert.equal(data.challenge.kind, "physical");
    }
    if (card.kind === "quiz") {
      assert.equal(card.rounds.length, 5, `${card.id} must have five main rounds`);
      assert.ok(card.tieBreak.length >= 1);
      assert.equal(data.challenge.kind, "quiz");
    }
    if (card.kind === "map") assert.equal(data.map.roundPlaces.length, 3);
    if (card.kind === "vote") {
      assert.deepEqual(Object.keys(data.vote.tokens), ["guests"]);
      assert.equal(card.guessMode, "percentage", `${card.id} must ask for a percentage only`);
    }
  }
  for (const path of ["../public/media/foto-raten-sprite.png", ...Array.from({ length: 6 }, (_, index) => `../public/media/plate-0${index + 1}.svg`)]) {
    await access(fileURLToPath(new URL(path, import.meta.url)));
  }
  const music = CARDS.find((card) => card.id === "raten-1");
  assert.ok(music.rounds.every((round) => round.media === "melody" && round.melody.notes.length > 5));
});

test("hydrate preserves a running show and migrates the previous schema", () => {
  const makeToken = tokens();
  const original = freshState(makeToken, () => 10_000);
  start(original, "aktion-3", makeToken, () => 10_000);
  hostAction(original, { type: "timer:start" }, makeToken, () => 11_000);
  hostAction(original, { type: "physical:finish", team: "rosa" }, makeToken, () => 12_000);
  hostAction(original, { type: "winner", team: "rosa" }, makeToken, () => 10_000);
  const reloaded = hydrateState(structuredClone(original), makeToken, () => 99_000);
  assert.equal(reloaded.session.id, original.session.id);
  assert.equal(reloaded.session.startedAt, 10_000);
  assert.deepEqual(reloaded.scores, { rosa: 3, blau: 0 });
  assert.equal(reloaded.active.id, "aktion-3");
  assert.ok(reloaded.history.past.length >= 3);

  const migrated = hydrateState({ scores: { rosa: 4, blau: 7 }, flipped: { "party-2": true }, active: null, revision: 12 }, makeToken, () => 20_000);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.session.label, "Bestehende Show");
  assert.deepEqual(migrated.scores, { rosa: 4, blau: 7 });
  assert.equal(migrated.flipped["party-2"], true);

  const legacyMap = hydrateState({
    scores: { rosa: 0, blau: 0 }, flipped: { "raten-4": true },
    active: { id: "raten-4", awarded: null }, revision: 36,
    map: { place: { id: "col", name: "Kolosseum", detail: "Rom, Italien", lat: 41.8902, lng: 12.4922 }, taps: {}, locks: {}, done: true, result: { rosaKm: 100, blauKm: 200 }, tokens: { rosa: makeToken(), blau: makeToken() } },
  }, makeToken, () => 20_000);
  assert.equal(legacyMap.map.roundCount, undefined);
  assert.equal(legacyMap.map.roundPlaces.length, 1, "the currently displayed legacy result is preserved during deploy");
  assert.equal(hostAction(legacyMap, { type: "game:restart" }, makeToken).ok, true);
  assert.equal(legacyMap.map.roundPlaces.length, 3, "an explicit restart adopts the new three-round rules");
});

test("a new session is explicit, resets the show, and can be undone and redone", () => {
  const makeToken = tokens();
  const data = start(freshState(makeToken, () => 1_000), "party-5", makeToken, () => 1_000);
  hostAction(data, { type: "timer:start" }, makeToken, () => 2_000);
  hostAction(data, { type: "physical:finish", team: "blau" }, makeToken, () => 182_000);
  hostAction(data, { type: "winner", team: "blau" }, makeToken, () => 182_001);
  const oldSession = data.session.id;
  assert.equal(hostAction(data, { type: "session:new", label: "Abendrunde" }, makeToken, () => 3_000).ok, true);
  assert.notEqual(data.session.id, oldSession);
  assert.equal(data.session.label, "Abendrunde");
  assert.deepEqual(data.scores, { rosa: 0, blau: 0 });
  assert.deepEqual(data.flipped, {});
  assert.equal(data.active, null);
  const newSession = data.session.id;
  assert.equal(hostAction(data, { type: "history:undo" }).ok, true);
  assert.equal(data.session.id, oldSession);
  assert.deepEqual(data.scores, { rosa: 0, blau: 5 });
  assert.equal(data.active.id, "party-5");
  assert.equal(hostAction(data, { type: "history:redo" }).ok, true);
  assert.equal(data.session.id, newSession);
  assert.deepEqual(data.scores, { rosa: 0, blau: 0 });
});

test("undo and redo restore complete game snapshots with monotonic revisions", () => {
  const data = freshState(tokens());
  const initialRevision = data.revision;
  hostAction(data, { type: "score:set", rosa: 8, blau: 5 });
  hostAction(data, { type: "flip", id: "aktion-1" });
  const revisionBeforeUndo = data.revision;
  hostAction(data, { type: "history:undo" });
  assert.deepEqual(data.flipped, {});
  assert.deepEqual(data.scores, { rosa: 8, blau: 5 });
  assert.ok(data.revision > revisionBeforeUndo && data.revision > initialRevision);
  hostAction(data, { type: "history:redo" });
  assert.equal(data.flipped["aktion-1"], true);
});

test("leaving the game suspends it and reopening resumes the exact state", () => {
  const data = start(freshState(tokens()), "aktion-2", tokens(), () => 1_000);
  hostAction(data, { type: "relay:start" }, tokens(), () => 2_000);
  const runningSince = data.challenge.relay.rounds.rosa.timer.runningSince;
  assert.equal(hostAction(data, { type: "close" }).ok, true);
  assert.equal(data.view, "board");
  assert.equal(data.active.id, "aktion-2");
  assert.equal(data.challenge.relay.rounds.rosa.timer.runningSince, runningSince);
  assert.equal(hostAction(data, { type: "start", id: "aktion-2" }, tokens(), () => 4_000).ok, true);
  assert.equal(data.view, "game");
  assert.equal(data.challenge.relay.rounds.rosa.timer.runningSince, runningSince);
  assert.equal(hostAction(data, { type: "start", id: "aktion-1" }, tokens(), () => 4_000).error, "card_not_flipped");
});

test("stale host revisions are rejected before mutation", () => {
  const data = freshState(tokens());
  assert.equal(hostAction(data, { type: "score:set", rosa: 1, blau: 0, expectedRevision: 0 }).ok, true);
  assert.equal(hostAction(data, { type: "score:set", rosa: 9, blau: 9, expectedRevision: 0 }).error, "stale_revision");
  assert.deepEqual(data.scores, { rosa: 1, blau: 0 });
});

test("physical controls stay server-locked until setup and safety are confirmed", () => {
  const data = freshState(tokens());
  hostAction(data, { type: "flip", id: "aktion-1" }, tokens(), () => 1_000);
  hostAction(data, { type: "start", id: "aktion-1" }, tokens(), () => 1_700);
  assert.equal(hostAction(data, { type: "timer:start" }).error, "setup_not_confirmed");
  assert.equal(hostAction(data, { type: "physical:ready" }).ok, true);
  assert.equal(hostAction(data, { type: "timer:start" }).ok, true);
});

test("cards progress from hidden to revealed to completed and cannot reopen", () => {
  const data = freshState(tokens(), () => 1_000);
  assert.deepEqual(data.flipped, {});
  assert.equal(hostAction(data, { type: "flip", id: "aktion-1" }, tokens(), () => 2_000).ok, true);
  assert.equal(data.flipped["aktion-1"], true);
  assert.equal(data.active, null);
  assert.equal(hostAction(data, { type: "start", id: "aktion-1" }, tokens(), () => 2_300).error, "card_still_flipping");
  assert.equal(hostAction(data, { type: "start", id: "aktion-1" }, tokens(), () => 2_700).ok, true);
  assert.equal(hostAction(data, { type: "physical:ready" }, tokens(), () => 2_750).ok, true);
  assert.equal(hostAction(data, { type: "timer:start" }, tokens(), () => 2_800).ok, true);
  assert.equal(hostAction(data, { type: "physical:finish", team: "rosa" }, tokens(), () => 2_900).ok, true);
  assert.equal(hostAction(data, { type: "winner", team: "rosa" }, tokens(), () => 3_000).ok, true);
  assert.deepEqual(data.completed["aktion-1"], { result: "rosa", stars: 1, completedAt: 3_000 });
  hostAction(data, { type: "close" });
  assert.equal(data.flipped["aktion-1"], true);
  assert.equal(hostAction(data, { type: "start", id: "aktion-1" }, tokens(), () => 5_000).error, "card_completed");
  assert.equal(hostAction(data, { type: "flip", id: "aktion-1" }, tokens(), () => 5_000).error, "card_completed");
  assert.equal(hostAction(data, { type: "board:reset" }).ok, true);
  assert.deepEqual(data.flipped, { "aktion-1": true }, "completed cards stay face-up when open cards are reset");
});

test("revealing a different unstarted card automatically closes the previous preview", () => {
  const data = freshState(tokens(), () => 1_000);
  assert.equal(hostAction(data, { type: "flip", id: "aktion-1" }, tokens(), () => 2_000).ok, true);
  assert.deepEqual(data.flipped, { "aktion-1": true });
  assert.equal(hostAction(data, { type: "flip", id: "party-1" }, tokens(), () => 3_000).ok, true);
  assert.deepEqual(data.flipped, { "party-1": true });
  assert.equal(data.revealedAt["aktion-1"], undefined);
  assert.equal(hostAction(data, { type: "start", id: "aktion-1" }, tokens(), () => 4_000).error, "card_not_flipped");
  assert.equal(hostAction(data, { type: "history:undo" }).ok, true);
  assert.deepEqual(data.flipped, { "aktion-1": true }, "undo restores the previous open preview");
});

test("timers, relays, and measurement games keep their live state", () => {
  const watch = start(freshState(tokens()), "aktion-1", tokens(), () => 1_000);
  assert.equal(hostAction(watch, { type: "timer:start" }, tokens(), () => 2_000).ok, true);
  const reloaded = hydrateState(structuredClone(watch), tokens(), () => 9_000);
  assert.equal(reloaded.challenge.timer.runningSince, 2_000);
  assert.equal(hostAction(reloaded, { type: "timer:pause" }, tokens(), () => 4_750).ok, true);
  assert.equal(reloaded.challenge.timer.elapsedMs, 2_750);
  assert.equal(hostAction(reloaded, { type: "timer:reset" }).ok, true);
  assert.equal(reloaded.challenge.timer.elapsedMs, 0);

  const relay = start(freshState(tokens()), "aktion-4");
  assert.equal(relay.challenge.relay.rounds.rosa.timer.elapsedMs, 0);
  hostAction(relay, { type: "relay:start" }, tokens(), () => 10_000);
  assert.equal(hostAction(relay, { type: "relay:change", delta: 1 }, tokens(), () => 10_100).error, "relay_progress_not_tracked");
  assert.equal(hostAction(relay, { type: "relay:finish" }, tokens(), () => 11_000).ok, true);
  assert.equal(relay.challenge.relay.rounds.rosa.timer.elapsedMs, 1_000);

  const measure = start(freshState(tokens()), "party-3");
  assert.equal(hostAction(measure, { type: "measurement:set", team: "rosa", left: 102.5, right: 101.2 }).ok, true);
  assert.deepEqual(measure.challenge.measurements.rosa, { left: 102.5, right: 101.2 });
  assert.equal(hostAction(measure, { type: "measurement:set", team: "blau", left: -1, right: 4 }).error, "bad_measurement");
});

test("wedding pantomime runs two isolated timed rounds and derives the higher-score winner", () => {
  const data = start(freshState(tokens()), "party-2", tokens());
  assert.equal(data.challenge.teamRounds.order[0], "rosa");
  hostAction(data, { type: "team-round:start" }, tokens(), () => 1_000);
  hostAction(data, { type: "team-round:correct" }, tokens(), () => 2_000);
  hostAction(data, { type: "team-round:correct" }, tokens(), () => 3_000);
  hostAction(data, { type: "team-round:finish" }, tokens(), () => 61_000);
  assert.equal(data.challenge.teamRounds.rounds.rosa.done, true);
  assert.equal(data.challenge.teamRounds.index, 1);
  hostAction(data, { type: "team-round:start" }, tokens(), () => 62_000);
  hostAction(data, { type: "team-round:correct" }, tokens(), () => 63_000);
  hostAction(data, { type: "team-round:finish" }, tokens(), () => 122_000);
  assert.equal(data.challenge.result, "rosa");
  assert.equal(hostAction(data, { type: "winner", team: "blau" }).error, "result_mismatch");
  assert.equal(hostAction(data, { type: "winner", team: "rosa" }).ok, true);
});

test("pull-ups enforce four alternating individual attempts and derive totals", () => {
  const data = start(freshState(tokens()), "aktion-5", tokens());
  const reps = [3, 2, 4, 3];
  for (let index = 0; index < reps.length; index++) {
    assert.equal(hostAction(data, { type: "pullups:start" }).ok, true);
    for (let rep = 0; rep < reps[index]; rep++) hostAction(data, { type: "pullups:rep", delta: 1 });
    assert.equal(hostAction(data, { type: "pullups:finish" }).ok, true);
  }
  assert.deepEqual(data.challenge.counters, { rosa: 7, blau: 5 });
  assert.equal(data.challenge.result, "rosa");
  assert.equal(hostAction(data, { type: "pullups:rep", delta: 1 }).error, "attempt_not_active");
  assert.equal(hostAction(data, { type: "winner", team: "rosa" }).ok, true);
});

test("shirt and push-up relays require their complete target and compare two times from zero", () => {
  const shirt = start(freshState(tokens()), "aktion-2", tokens());
  assert.equal(hostAction(shirt, { type: "relay:start" }, tokens(), () => 1_000).ok, true);
  for (let person = 0; person < 9; person++) hostAction(shirt, { type: "relay:change", delta: 1 }, tokens(), () => 2_000 + person);
  assert.equal(hostAction(shirt, { type: "relay:finish" }, tokens(), () => 20_000).error, "relay_incomplete");
  assert.equal(hostAction(shirt, { type: "relay:change", delta: 1 }, tokens(), () => 20_000).ok, true);
  assert.equal(shirt.challenge.relay.rounds.rosa.done, true, "person ten automatically stops the team clock");
  assert.equal(shirt.challenge.relay.rounds.rosa.timer.elapsedMs, 19_000);
  assert.equal(shirt.challenge.relay.rounds.blau.timer.elapsedMs, 0);

  const data = start(freshState(tokens()), "aktion-4", tokens());
  for (const [team, startedAt, finishedAt] of [["rosa", 1_000, 31_000], ["blau", 40_000, 65_000]]) {
    assert.equal(data.challenge.relay.order[data.challenge.relay.index], team);
    assert.equal(hostAction(data, { type: "relay:start" }, tokens(), () => startedAt).ok, true);
    assert.equal(hostAction(data, { type: "relay:finish" }, tokens(), () => finishedAt).ok, true);
  }
  assert.equal(data.challenge.result, "blau");
  assert.equal(data.challenge.judgeTokens, undefined);
});

test("five-round quizzes require reveal, record both teams, and only tie-break on a tie", () => {
  const data = start(freshState(tokens()), "raten-3");
  for (let round = 0; round < 5; round++) {
    assert.equal(hostAction(data, { type: "quiz:next" }).error, "round_not_revealed");
    hostAction(data, { type: "quiz:ready", team: "rosa" });
    hostAction(data, { type: "quiz:ready", team: "blau" });
    hostAction(data, { type: "quiz:reveal" });
    hostAction(data, { type: "quiz:mark", team: round < 3 ? "rosa" : "blau", correct: true });
    hostAction(data, { type: "quiz:mark", team: round < 3 ? "blau" : "rosa", correct: false });
    hostAction(data, { type: "quiz:next" });
  }
  assert.equal(data.challenge.main.complete, true);
  assert.deepEqual(quizScores(data.challenge), { rosa: 3, blau: 2 });
  assert.equal(hostAction(data, { type: "quiz:tiebreak" }).error, "tiebreak_not_needed");
});

test("quiz tie-break only accepts an enabled buzzer and a wrong answer immediately awards the opponent", () => {
  const data = start(freshState(tokens()), "raten-1");
  for (let round = 0; round < 5; round++) {
    hostAction(data, { type: "quiz:ready", team: "rosa" });
    hostAction(data, { type: "quiz:ready", team: "blau" });
    hostAction(data, { type: "quiz:reveal" });
    hostAction(data, { type: "quiz:mark", team: "rosa", correct: true });
    hostAction(data, { type: "quiz:mark", team: "blau", correct: true });
    hostAction(data, { type: "quiz:next" });
  }
  assert.deepEqual(quizScores(data.challenge), { rosa: 5, blau: 5 });
  assert.equal(hostAction(data, { type: "quiz:tiebreak" }, tokens(), () => 5_000).ok, true);
  assert.equal(buzzerAction(data, { team: "blau", token: data.challenge.buzzerTokens.blau }, () => 5_200).error, "buzzer_closed");
  assert.equal(hostAction(data, { type: "quiz:buzzer:open" }, tokens(), () => 5_500).ok, true);
  assert.equal(buzzerAction(data, { team: "blau", token: data.challenge.buzzerTokens.blau }, () => 5_640).ok, true);
  assert.deepEqual(data.challenge.buzz, { team: "blau", elapsedMs: 140 });
  assert.equal(buzzerAction(data, { team: "rosa", token: data.challenge.buzzerTokens.rosa }, () => 5_700).error, "already_buzzed");
  hostAction(data, { type: "quiz:reveal" });
  assert.equal(hostAction(data, { type: "quiz:tiebreak:judge", correct: false }, tokens(), () => 6_000).ok, true);
  assert.equal(data.challenge.tie.complete, true);
  assert.equal(data.active.awarded, "rosa", "a wrong blue answer immediately awards pink/Kathi");
});

test("all three map rounds hide the other team until the second confirmation auto-resolves", () => {
  const data = start(freshState(tokens()), "raten-4", tokens());
  const { rosa: rosaToken, blau: blauToken } = data.map.tokens;
  for (let round = 0; round < 3; round++) {
    const roundId = data.map.roundId;
    assert.equal(mapAction(data, { type: "map:tap", team: "rosa", token: rosaToken, roundId, lat: 48 + round, lng: 11 }).ok, true);
    let rosa = publicState(data, { role: "pad", team: "rosa", token: rosaToken });
    let blau = publicState(data, { role: "pad", team: "blau", token: blauToken });
    assert.deepEqual(Object.keys(rosa.map.taps), ["rosa"]);
    assert.deepEqual(blau.map.taps, {}, `blue must not receive pink pin in round ${round + 1}`);
    assert.equal(rosa.map.place.detail, undefined);
    assert.equal(mapAction(data, { type: "map:tap", team: "blau", token: blauToken, roundId, lat: -34, lng: 151 - round }).ok, true);
    rosa = publicState(data, { role: "pad", team: "rosa", token: rosaToken });
    assert.deepEqual(Object.keys(rosa.map.taps), ["rosa"], `pink must not receive blue pin in round ${round + 1}`);
    assert.equal(mapAction(data, { type: "map:confirm", team: "rosa", token: rosaToken, roundId }).ok, true);
    rosa = publicState(data, { role: "pad", team: "rosa", token: rosaToken });
    assert.deepEqual(Object.keys(rosa.map.taps), ["rosa"], "one confirmed pin remains private");
    assert.equal(rosa.map.place.lat, undefined);
    assert.equal(mapAction(data, { type: "map:confirm", team: "blau", token: blauToken, roundId }).ok, true);
    rosa = publicState(data, { role: "pad", team: "rosa", token: rosaToken });
    assert.deepEqual(Object.keys(rosa.map.taps).sort(), ["blau", "rosa"]);
    assert.equal(typeof rosa.map.place.detail, "string");
    assert.equal(Number.isFinite(rosa.map.place.lat), true, "revealed target coordinates render the actual-position marker");
    if (round < 2) {
      assert.equal(data.map.complete, false);
      assert.equal(hostAction(data, { type: "map:next" }).ok, true);
    }
  }
  assert.equal(data.map.complete, true);
  assert.equal(data.map.roundResults.length, 3);
  assert.equal(data.map.totals.rosaWins + data.map.totals.blauWins + data.map.totals.draws, 3);
  assert.ok(data.active.awarded, "the final map round must automatically award a result");
  assert.deepEqual(data.completed["raten-4"].result, data.active.awarded);
  assert.equal(data.scores.rosa + data.scores.blau <= 4, true, "one winner gets four points, or a draw gets none");
});

test("map tokens are team-bound and regenerated codes expose no state", () => {
  const makeToken = tokens();
  const data = start(freshState(makeToken), "raten-4", makeToken);
  const oldRosa = data.map.tokens.rosa;
  assert.equal(mapAction(data, { type: "map:tap", team: "blau", token: oldRosa, roundId: data.map.roundId, lat: 0, lng: 0 }).status, 403);
  hostAction(data, { type: "qr:regenerate" }, makeToken);
  assert.notEqual(data.map.tokens.rosa, oldRosa);
  assert.deepEqual(publicState(data, { role: "pad", team: "rosa", token: oldRosa }), { room: "KATHI", access: { role: "pad", team: "rosa", valid: false } });
});

test("map confirmation is automatic, idempotent, undoable, and places remain unique", () => {
  const data = start(freshState(tokens()), "raten-4", tokens());
  const { rosa, blau } = data.map.tokens;
  const roundId = data.map.roundId;
  assert.equal(hostAction(data, { type: "map:resolve" }).error, "positions_missing");
  mapAction(data, { type: "map:tap", team: "rosa", token: rosa, roundId, lat: 1, lng: 1 });
  mapAction(data, { type: "map:tap", team: "blau", token: blau, roundId, lat: 2, lng: 2 });
  assert.equal(hostAction(data, { type: "map:resolve" }).error, "teams_not_locked");
  assert.equal(hostAction(data, { type: "map:select", placeId: "col" }).error, "round_in_progress");
  mapAction(data, { type: "map:confirm", team: "rosa", token: rosa, roundId });
  assert.equal(data.map.done, false);
  mapAction(data, { type: "map:confirm", team: "blau", token: blau, roundId });
  assert.equal(data.map.done, true);
  assert.equal(mapAction(data, { type: "map:confirm", team: "blau", token: blau, roundId }).ok, true);
  assert.equal(data.map.roundResults.length, 1);
  assert.equal(hostAction(data, { type: "history:undo" }).ok, true);
  assert.equal(data.map.done, false);
  assert.equal(data.map.locks.blau, undefined);
  assert.equal(hostAction(data, { type: "history:redo" }).ok, true);
  assert.equal(data.map.done, true);
  assert.equal(new Set(data.map.roundPlaces).size, 3);
});

test("screen state never contains live map pins, private QR tokens, or hidden quiz answers", () => {
  const mapData = start(freshState(tokens()), "raten-4", tokens());
  const roundId = mapData.map.roundId;
  mapAction(mapData, { type: "map:tap", team: "rosa", token: mapData.map.tokens.rosa, roundId, lat: 10, lng: 20 });
  const screenMap = publicState(mapData, { role: "screen" });
  assert.deepEqual(screenMap.map.taps, {});
  assert.equal(screenMap.map.tokens, undefined);
  assert.equal(publicState(mapData, { host: true }).map.taps.rosa, undefined, "even private host view does not project live pin coordinates");
  assert.equal(screenMap.map.place.lat, undefined, "target coordinates stay secret before reveal");
  assert.equal(publicState(mapData, { host: true }).map.place.lat, undefined);

  const quizData = start(freshState(tokens()), "raten-5", tokens());
  const screenQuiz = publicState(quizData, { role: "screen" });
  assert.equal(screenQuiz.cards.find((card) => card.id === "raten-5").rounds[0].answer, undefined);
  hostAction(quizData, { type: "quiz:ready", team: "rosa" });
  hostAction(quizData, { type: "quiz:ready", team: "blau" });
  hostAction(quizData, { type: "quiz:reveal" });
  assert.ok(publicState(quizData, { role: "screen" }).cards.find((card) => card.id === "raten-5").rounds[0].answer);

  const voteData = start(freshState(tokens()), "vote-1", tokens());
  const screenVote = publicState(voteData, { role: "screen" }).vote;
  assert.equal(screenVote.tokens, undefined);
  assert.equal(screenVote.guesses, undefined);
  assert.equal(screenVote.guestToken, voteData.vote.tokens.guests, "the intentionally public guest QR must be renderable on the projector");
  const cookieAuthenticatedScreen = publicState(voteData, { host: true, role: "screen" });
  assert.equal(cookieAuthenticatedScreen.access.role, "screen");
  assert.equal(cookieAuthenticatedScreen.vote.tokens, undefined, "host cookies must never upgrade the public projector projection");
  assert.equal(cookieAuthenticatedScreen.vote.guestToken, voteData.vote.tokens.guests);
});

test("old map requests cannot affect the next round", () => {
  const data = start(freshState(tokens()), "raten-4", tokens());
  const oldRound = data.map.roundId;
  for (const team of ["rosa", "blau"]) {
    mapAction(data, { type: "map:tap", team, token: data.map.tokens[team], roundId: oldRound, lat: 1, lng: 1 });
    mapAction(data, { type: "map:confirm", team, token: data.map.tokens[team], roundId: oldRound });
  }
  hostAction(data, { type: "map:next" });
  assert.notEqual(data.map.roundId, oldRound);
  assert.equal(mapAction(data, { type: "map:tap", team: "rosa", token: data.map.tokens.rosa, roundId: oldRound, lat: 8, lng: 8 }).error, "stale_round");
  assert.deepEqual(data.map.taps, {});
});

test("measurement result uses relative deviation and awards automatically", () => {
  const data = start(freshState(tokens()), "party-3", tokens());
  hostAction(data, { type: "measurement:set", team: "rosa", left: 45, right: 55 });
  hostAction(data, { type: "measurement:set", team: "blau", left: 94, right: 106 });
  assert.equal(hostAction(data, { type: "measurement:resolve" }, tokens(), () => 9_000).ok, true);
  assert.equal(data.active.awarded, "blau", "6% beats 10% even though absolute grams are larger");
  assert.deepEqual(data.scores, { rosa: 0, blau: 3 });
});

test("percentage voting closes before reveal and awards the nearest estimate", () => {
  const data = start(freshState(tokens()), "vote-4", tokens());
  const { guests } = data.vote.tokens;
  hostAction(data, { type: "vote:guess", team: "rosa", percent: 60 });
  hostAction(data, { type: "vote:guess", team: "blau", percent: 30 });
  hostAction(data, { type: "vote:open" });
  voteAction(data, { token: guests, uid: "a", choice: "a" });
  voteAction(data, { token: guests, uid: "b", choice: "a" });
  voteAction(data, { token: guests, uid: "c", choice: "b" });
  assert.equal(hostAction(data, { type: "vote:reveal" }).error, "vote_not_closed");
  hostAction(data, { type: "vote:close" }, tokens(), () => 2_000);
  hostAction(data, { type: "vote:reveal" }, tokens(), () => 3_000);
  assert.equal(data.active.awarded, "rosa");
  assert.deepEqual(data.scores, { rosa: 4, blau: 0 });
});

test("the joke duel opens a direct secret guest vote only after both performances", () => {
  const data = start(freshState(tokens()), "party-4", tokens());
  const base = Date.now();
  assert.equal(data.vote.phase, "pending");
  assert.equal(voteAction(data, { token: data.vote.tokens.guests, uid: "early", choice: "a" }).error, "vote_closed");
  assert.equal(hostAction(data, { type: "performance:done" }, tokens(), () => base).ok, true);
  assert.equal(data.vote.phase, "pending");
  assert.equal(hostAction(data, { type: "performance:done" }, tokens(), () => base + 1_000).ok, true);
  assert.equal(data.challenge.phase, "judging");
  assert.equal(hostAction(data, { type: "winner", team: "rosa" }).error, "result_not_ready");
  for (const [uid, choice] of [["1", "a"], ["2", "a"], ["3", "b"]]) voteAction(data, { token: data.vote.tokens.guests, uid, choice });
  hostAction(data, { type: "vote:close" });
  hostAction(data, { type: "vote:reveal" }, tokens(), () => base + 70_000);
  assert.equal(data.active.awarded, "rosa");
  assert.deepEqual(data.scores, { rosa: 4, blau: 0 });
});

test("moderator atomically records both percentage guesses and only guests receive a public voting token", () => {
  const data = start(freshState(tokens()), "vote-2", tokens());
  const { guests } = data.vote.tokens;
  assert.deepEqual(Object.keys(data.vote.tokens), ["guests"]);
  assert.equal(hostAction(data, { type: "vote:open" }).error, "guesses_missing");
  assert.equal(hostAction(data, { type: "vote:guesses:set", rosaPercent: 40, blauPercent: 70 }).ok, true);
  assert.equal(hostAction(data, { type: "vote:guesses:set", rosaPercent: 41, blauPercent: 70 }).ok, true, "changing one field preserves the other atomically");
  assert.equal(hostAction(data, { type: "vote:guesses:set", rosaPercent: 110, blauPercent: 20 }).error, "bad_percentage");
  let host = publicState(data, { host: true });
  assert.deepEqual(host.vote.guessStatus, { rosa: true, blau: true });
  assert.deepEqual(host.vote.guesses, { rosa: { percent: 41 }, blau: { percent: 70 } });
  const screen = publicState(data, { role: "screen" });
  assert.equal(screen.vote.guesses, undefined, "team guesses stay off the public projector");
  assert.equal(screen.vote.guestToken, guests);
  assert.equal(hostAction(data, { type: "vote:open" }).ok, true);
  assert.equal(hostAction(data, { type: "vote:guesses:set", rosaPercent: 30, blauPercent: 30 }).status, 400);
  assert.equal(voteAction(data, { token: guests, uid: "guest-1", choice: "a" }).ok, true);
  assert.equal(voteAction(data, { token: guests, uid: "guest-2", choice: "b" }).ok, true);
  let guest = publicState(data, { role: "vote", token: guests, uid: "guest-1" });
  assert.equal(guest.vote.choice, "a");
  assert.equal(guest.vote.n, undefined);
  assert.equal(hostAction(data, { type: "vote:close", force: true }).ok, true);
  assert.equal(hostAction(data, { type: "vote:reveal" }).ok, true);
  host = publicState(data, { host: true });
  assert.deepEqual(host.vote.counts, { a: 1, b: 1 });
  assert.deepEqual(host.vote.guesses, { rosa: { percent: 41 }, blau: { percent: 70 } });
});

test("a physical result is gated, constrained, and awarded exactly once", () => {
  const data = start(freshState(tokens()), "aktion-1", tokens());
  assert.equal(hostAction(data, { type: "winner", team: "both" }).error, "result_not_ready");
  hostAction(data, { type: "timer:start" }, tokens(), () => 1_000);
  hostAction(data, { type: "physical:finish", team: "rosa" }, tokens(), () => 2_000);
  assert.equal(hostAction(data, { type: "winner", team: "blau" }).error, "result_mismatch");
  assert.equal(hostAction(data, { type: "winner", team: "rosa" }).ok, true);
  assert.deepEqual(data.scores, { rosa: 1, blau: 0 });
  assert.equal(hostAction(data, { type: "winner", team: "rosa" }).error, "already_awarded");
  assert.equal(hostAction(data, { type: "game:restart" }).error, "already_awarded");
  assert.deepEqual(data.scores, { rosa: 1, blau: 0 });
});

test("anonymous state is minimal and PIN accepts only the configured value", async () => {
  const configuredPin = "test-only-pin";
  assert.deepEqual(publicState(freshState()), { room: "KATHI", access: { role: "viewer", valid: false } });
  assert.equal(await isHost({ pin: configuredPin }, configuredPin), true);
  assert.equal(await isHost({ pin: "wrong" }, configuredPin), false);
  assert.equal(await isHost({}, configuredPin), false);
  assert.equal(await isHost({ pin: configuredPin }), false, "missing server configuration must fail closed");
});

test("guest traffic does not invalidate moderator actions, another moderator does", () => {
  const data = start(freshState(), "vote-1");
  hostAction(data, { type: "vote:guesses:set", rosaPercent: 40, blauPercent: 60 });
  hostAction(data, { type: "vote:open" });
  const expectedHostRevision = data.hostRevision;
  for (let n = 0; n < 100; n++) assert.equal(voteAction(data, { token: data.vote.tokens.guests, uid: String(n), choice: "a" }).ok, true);
  assert.equal(hostAction(data, { type: "vote:close", expectedHostRevision }).ok, true);
  assert.equal(hostAction(data, { type: "vote:reveal", expectedHostRevision }).error, "stale_revision");
});

test("retries are idempotent even after undo and new-session cookie recovery", () => {
  const data = start(freshState(), "aktion-5");
  hostAction(data, { type: "pullups:start" });
  const message = { type: "pullups:rep", delta: 1, actionId: "rep-1", sessionId: data.session.id, expectedHostRevision: data.hostRevision };
  assert.equal(hostAction(data, message).ok, true);
  assert.equal(hostAction(data, message).ok, true);
  assert.equal(data.challenge.counters.rosa, 1);
  hostAction(data, { type: "history:undo" });
  assert.equal(hostAction(data, message).ok, true);
  assert.equal(data.challenge.counters.rosa, 0, "retry must not undo an intentional undo");
  const newShow = { type: "session:new", actionId: "new-show", sessionId: data.session.id };
  hostAction(data, newShow);
  const sessionId = data.session.id;
  assert.equal(hostAction(data, newShow).ok, true);
  assert.equal(data.session.id, sessionId);
  assert.equal(hostAction(data, { type: "close", sessionId: newShow.sessionId }).error, "stale_session");
});

test("relay time uses captured clicks despite unequal request latency", () => {
  const data = start(freshState(), "aktion-4");
  assert.equal(hostAction(data, { type: "relay:start", occurredAt: 10000 }, undefined, () => 13000).ok, true);
  assert.equal(hostAction(data, { type: "relay:finish", occurredAt: 40000 }, undefined, () => 48000).ok, true);
  assert.equal(data.challenge.relay.rounds.rosa.timer.elapsedMs, 30000);
  assert.equal(hostAction(data, { type: "relay:start", occurredAt: 999999 }, undefined, () => 49000).error, "invalid_action_time");
});

test("pantomime rejects late points but accepts an on-time click delivered late", () => {
  const data = start(freshState(), "party-2");
  hostAction(data, { type: "team-round:start" }, undefined, () => 10000);
  assert.equal(hostAction(data, { type: "team-round:correct", occurredAt: 69999 }, undefined, () => 75000).ok, true);
  assert.equal(hostAction(data, { type: "team-round:correct" }, undefined, () => 70000).error, "timer_finished");
  assert.equal(hostAction(data, { type: "team-round:skip" }, undefined, () => 130000).error, "timer_finished");
  assert.equal(data.challenge.teamRounds.rounds.rosa.correct, 1);
  assert.equal(hostAction(data, { type: "team-round:finish" }, undefined, () => 130000).ok, true);
});

test("physical tiebreaks and whole-attempt pull-up counts preserve the main results", () => {
  const data = start(freshState(), "aktion-5");
  for (let i = 0; i < 4; i++) {
    hostAction(data, { type: "pullups:start" });
    assert.equal(hostAction(data, { type: "pullups:finish", reps: -1 }).error, "bad_reps");
    assert.equal(hostAction(data, { type: "pullups:finish", reps: 3 }).ok, true);
  }
  assert.equal(data.challenge.result, "draw");
  assert.deepEqual(data.challenge.counters, { rosa: 6, blau: 6 });
  assert.equal(hostAction(data, { type: "physical:tiebreak", team: "blau" }).ok, true);
  assert.equal(hostAction(data, { type: "winner", team: "blau" }).ok, true);
  assert.equal(data.scores.blau, 5);
  assert.equal(hostAction(data, { type: "physical:tiebreak", team: "rosa" }).error, "tiebreak_unavailable");
});

test("quiz tiebreak uses a moderator-selected call without devices or timing", () => {
  const data = start(freshState(), "raten-1");
  data.challenge.main.complete = true;
  assert.equal(hostAction(data, { type: "quiz:tiebreak" }).ok, true);
  assert.equal(hostAction(data, { type: "quiz:call", team: "blau" }).ok, true);
  assert.equal(data.challenge.buzz.team, "blau");
  assert.equal(data.challenge.buzz.elapsedMs, undefined);
  assert.equal(hostAction(data, { type: "quiz:call", team: "rosa" }).error, "already_buzzed");
  hostAction(data, { type: "quiz:buzz:reset" });
  hostAction(data, { type: "quiz:call", team: "rosa" });
  hostAction(data, { type: "quiz:reveal" });
  assert.equal(hostAction(data, { type: "quiz:tiebreak:judge", correct: true }).ok, true);
  assert.equal(data.active.awarded, "rosa");
  const noAnswer = start(freshState(), "raten-5");
  noAnswer.challenge.main.complete = true;
  hostAction(noAnswer, { type: "quiz:tiebreak" });
  assert.equal(hostAction(noAnswer, { type: "quiz:tiebreak:draw" }).ok, true);
  assert.equal(noAnswer.active.awarded, "draw");
});

test("all other quiz answers stay hidden after revealing the active quiz", () => {
  const data = start(freshState(), "raten-1");
  hostAction(data, { type: "quiz:ready", team: "rosa" });
  hostAction(data, { type: "quiz:ready", team: "blau" });
  hostAction(data, { type: "quiz:reveal" });
  const screen = publicState(data, { role: "screen" });
  for (const card of screen.cards.filter(c => c.kind === "quiz")) {
    assert.equal(Boolean(card.rounds[0].answer), card.id === "raten-1");
    assert.equal(card.rounds[1].answer, undefined);
    assert.equal(card.tieBreak[0].answer, undefined);
  }
});

test("expired voting closes on every client and can extend without losing votes", () => {
  const data = start(freshState(), "vote-1");
  hostAction(data, { type: "vote:guesses:set", rosaPercent: 40, blauPercent: 60 });
  hostAction(data, { type: "vote:open" });
  voteAction(data, { token: data.vote.tokens.guests, uid: "1", choice: "a" });
  data.vote.closesAt = Date.now() - 1;
  for (const access of [{ host: true }, { role: "screen" }, { role: "vote", token: data.vote.tokens.guests }]) {
    assert.equal(publicState(data, access).vote.open, false);
    assert.equal(publicState(data, access).vote.phase, "closed");
  }
  assert.equal(hostAction(data, { type: "vote:extend" }).ok, true);
  assert.equal(Object.keys(data.vote.votes).length, 1);
  assert.equal(publicState(data, { role: "screen" }).vote.open, true);
  data.vote.closesAt = Date.now() - 1;
  assert.equal(hostAction(data, { type: "vote:reveal" }).ok, true);
  const screen = publicState(data, { role: "screen" }).vote;
  assert.deepEqual(screen.guesses, data.vote.guesses);
  assert.deepEqual(screen.counts, { a: 1, b: 0 });
  assert.equal(hostAction(data, { type: "vote:extend" }).error, "vote_not_open");
});

test("zero-vote joke voting can reopen and finish without repeating performances", () => {
  const data = start(freshState(), "party-4");
  hostAction(data, { type: "performance:done" });
  hostAction(data, { type: "performance:done" });
  hostAction(data, { type: "vote:close", force: true });
  assert.equal(hostAction(data, { type: "vote:reveal" }).error, "no_votes");
  assert.equal(hostAction(data, { type: "vote:extend" }).ok, true);
  voteAction(data, { token: data.vote.tokens.guests, uid: "1", choice: "b" });
  hostAction(data, { type: "vote:close", force: true });
  assert.equal(hostAction(data, { type: "vote:reveal" }).ok, true);
  assert.equal(data.active.awarded, "blau");
});
