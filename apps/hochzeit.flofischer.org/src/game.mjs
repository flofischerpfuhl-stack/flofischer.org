import { CARDS, PLACES } from "./content.mjs";

export { CARDS, PLACES };
export const ROOM = "KATHI";
export const SCHEMA_VERSION = 4;

const CARD_BY_ID = Object.fromEntries(CARDS.map((card) => [card.id, card]));
const MAX_HISTORY = 40;

export function freshState(makeToken = token, now = () => Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    session: { id: makeToken(), number: 1, label: "Show 1", startedAt: now() },
    scores: { rosa: 0, blau: 0 },
    flipped: {},
    revealedAt: {},
    completed: {},
    view: "board",
    sessionArchive: [],
    active: null,
    challenge: null,
    vote: null,
    map: null,
    revision: 0,
    history: { past: [], future: [] },
  };
}

export function hydrateState(saved, makeToken = token, now = () => Date.now()) {
  if (!saved || typeof saved !== "object") return freshState(makeToken, now);
  const base = freshState(makeToken, now);
  const data = {
    ...base,
    ...structuredClone(saved),
    schemaVersion: SCHEMA_VERSION,
    scores: { rosa: safeScore(saved.scores?.rosa), blau: safeScore(saved.scores?.blau) },
    flipped: saved.flipped && typeof saved.flipped === "object" ? saved.flipped : {},
    revealedAt: saved.revealedAt && typeof saved.revealedAt === "object" ? saved.revealedAt : {},
    completed: saved.completed && typeof saved.completed === "object" ? saved.completed : {},
    view: saved.view === "game" && saved.active ? "game" : "board",
    sessionArchive: Array.isArray(saved.sessionArchive) ? saved.sessionArchive.slice(-12) : [],
    history: {
      past: Array.isArray(saved.history?.past) ? saved.history.past.slice(-MAX_HISTORY) : [],
      future: Array.isArray(saved.history?.future) ? saved.history.future.slice(-MAX_HISTORY) : [],
    },
  };
  if (!saved.session?.id) data.session = { id: makeToken(), number: 1, label: "Bestehende Show", startedAt: now() };
  if (data.active?.id && CARD_BY_ID[data.active.id]) data.active = activeCard(CARD_BY_ID[data.active.id], data.active.awarded || null);
  if (data.active?.awarded && !data.completed[data.active.id]) data.completed[data.active.id] = { result: data.active.awarded, stars: data.active.stars, completedAt: now() };
  if (data.map) data.map = normalizeMap(data.map);
  if (data.vote) {
    data.vote.guesses = { rosa: data.vote.guesses?.rosa || null, blau: data.vote.guesses?.blau || null };
    data.vote.tokens = { guests: data.vote.tokens?.guests || data.vote.token || makeToken() };
    delete data.vote.token;
    const configuredMode = CARD_BY_ID[data.active?.id]?.guessMode || data.vote.guessMode || "percentage";
    if (data.vote.guessMode !== configuredMode && !data.vote.revealed) {
      data.vote.guesses = { rosa: null, blau: null };
    }
    data.vote.guessMode = configuredMode;
    for (const team of ["rosa", "blau"]) {
      const guess = data.vote.guesses[team];
      if (configuredMode === "percentage" && guess && typeof guess === "object") data.vote.guesses[team] = { percent: clamp(Number(guess.percent) || 0, 0, 100) };
    }
    data.vote.minVotes ||= CARD_BY_ID[data.active?.id]?.minVotes || 1;
    data.vote.durationMs ||= CARD_BY_ID[data.active?.id]?.durationMs || 30000;
    data.vote.phase ||= data.vote.revealed ? "revealed" : data.vote.open ? "voting" : "team";
  }
  if (data.active?.kind === "physical" && !data.challenge) data.challenge = newPhysicalChallenge(CARD_BY_ID[data.active.id], makeToken);
  const activeCardDefinition = CARD_BY_ID[data.active?.id];
  if (data.active?.kind === "physical" && data.challenge && activeCardDefinition && data.challenge.mode !== activeCardDefinition.mode && !data.active.awarded) {
    data.challenge = newPhysicalChallenge(activeCardDefinition, makeToken);
  }
  if (data.active?.id === "aktion-5" && data.challenge?.mode !== "pullups") {
    const totals = data.challenge?.counters || { rosa: 0, blau: 0 };
    data.challenge = newPhysicalChallenge(CARD_BY_ID["aktion-5"]);
    data.challenge.ready = true;
    data.challenge.pullups.attempts[0] = { ...data.challenge.pullups.attempts[0], reps: totals.rosa || 0, status: "done" };
    data.challenge.pullups.attempts[1] = { ...data.challenge.pullups.attempts[1], reps: totals.blau || 0, status: "done" };
    data.challenge.pullups.index = 2;
    data.challenge.counters = { rosa: totals.rosa || 0, blau: totals.blau || 0 };
  }
  if (data.challenge?.kind === "physical") {
    if (typeof data.challenge.ready !== "boolean") data.challenge.ready = true;
    if (data.challenge.relay && activeCardDefinition) data.challenge.relay.trackProgress = activeCardDefinition.trackProgress !== false;
    data.challenge.phase ||= data.challenge.timer?.runningSince !== null ? "running" : "setup";
    data.challenge.result ||= null;
    data.challenge.finishedAt ||= null;
  }
  if (data.active?.kind === "quiz" && !data.challenge) data.challenge = newQuizChallenge();
  if (data.active?.kind === "quiz" && !data.challenge.buzzerTokens) data.challenge.buzzerTokens = { rosa: makeToken(), blau: makeToken() };
  if (data.active?.kind === "quiz" && typeof data.challenge.buzzerOpen !== "boolean") data.challenge.buzzerOpen = false;
  return data;
}

export function token() {
  return crypto.randomUUID().replaceAll("-", "");
}

export async function isHost(body, configuredPin) {
  const expectedPin = String(configuredPin || "");
  if (!expectedPin) return false;
  const encoder = new TextEncoder();
  const [provided, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(body?.pin ?? body?.host ?? ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedPin)),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(provided, expected);
  const a = new Uint8Array(provided);
  const b = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function hostAction(data, message, makeToken = token, now = () => Date.now()) {
  if (Number.isInteger(message.expectedRevision) && message.expectedRevision !== data.revision) return fail("stale_revision", 409);
  if (!data.history) data.history = { past: [], future: [] };
  if (message.type === "history:undo") return undo(data);
  if (message.type === "history:redo") return redo(data);
  const before = snapshot(data);
  const previousRevision = Number(data.revision) || 0;
  const result = applyHostAction(data, message, makeToken, now);
  if (!result.ok) return result;
  data.revision = previousRevision + 1;
  data.history.past.push(before);
  if (data.history.past.length > MAX_HISTORY) data.history.past.splice(0, data.history.past.length - MAX_HISTORY);
  data.history.future = [];
  return { ok: true };
}

function applyHostAction(data, message, makeToken, now) {
  switch (message.type) {
    case "flip": {
      const card = CARD_BY_ID[message.id];
      if (!card) return fail("unknown_card");
      if (data.completed[card.id]) return fail("card_completed", 409);
      for (const id of Object.keys(data.flipped)) {
        if (id !== card.id && !data.completed[id] && data.active?.id !== id) {
          delete data.flipped[id];
          delete data.revealedAt[id];
        }
      }
      data.flipped[card.id] = true;
      data.revealedAt[card.id] = now();
      break;
    }
    case "start": {
      const card = CARD_BY_ID[message.id];
      if (!card || !data.flipped[card.id]) return fail("card_not_flipped");
      if (data.completed[card.id]) return fail("card_completed", 409);
      const revealedAt = Number(data.revealedAt[card.id]) || 0;
      if (revealedAt && now() - revealedAt < 650) return fail("card_still_flipping", 409);
      if (data.active?.id === card.id && !data.active.awarded) data.view = "game";
      else if (data.active && !data.active.awarded) return fail("another_game_active", 409);
      else startGame(data, card, makeToken);
      break;
    }
    case "close": data.view = "board"; break;
    case "game:discard":
      if (!data.active || data.active.awarded) return fail("no_active_game", 409);
      clearGame(data);
      data.view = "board";
      break;
    case "winner": {
      if (!data.active || data.active.awarded) return fail("already_awarded");
      const team = message.team;
      if (!isResult(team)) return fail("bad_team");
      const expected = expectedResult(data, now());
      if (!expected.ready) return fail(expected.error || "result_not_ready", 409);
      if (!expected.allowed.includes(team)) return fail("result_mismatch", 409);
      awardGame(data, team, now);
      break;
    }
    case "score:set": {
      for (const team of ["rosa", "blau"]) {
        const value = Number(message[team]);
        if (!Number.isInteger(value) || value < 0 || value > 999) return fail("bad_score");
      }
      data.scores = { rosa: Number(message.rosa), blau: Number(message.blau) };
      break;
    }
    case "scores:zero": data.scores = { rosa: 0, blau: 0 }; break;
    case "board:reset": {
      data.flipped = Object.fromEntries(Object.keys(data.completed).map((id) => [id, true]));
      data.revealedAt = Object.fromEntries(Object.keys(data.completed).map((id) => [id, data.revealedAt[id] || now()]));
      data.view = "board";
      break;
    }
    case "session:new": newSession(data, message.label, makeToken, now); break;
    case "game:restart":
      if (!data.active) return fail("no_active_game");
      if (data.active.awarded || data.completed[data.active.id]) return fail("already_awarded", 409);
      restartGame(data);
      break;
    case "qr:regenerate":
      if (data.map) data.map.tokens = { rosa: makeToken(), blau: makeToken() };
      else if (data.vote) data.vote.tokens = { guests: makeToken() };
      else if (data.challenge?.buzzerTokens) data.challenge.buzzerTokens = { rosa: makeToken(), blau: makeToken() };
      else return fail("no_qr_game");
      break;
    case "map:select": {
      if (!data.map) return fail("no_map_game");
      if (data.map.done || Object.keys(data.map.taps).length) return fail("round_in_progress", 409);
      const place = PLACES.find((item) => item.id === message.placeId);
      if (!place) return fail("unknown_place");
      const oldPlace = data.map.roundPlaces[data.map.round];
      const otherIndex = data.map.roundPlaces.findIndex((id, index) => id === place.id && index !== data.map.round);
      if (otherIndex >= 0) data.map.roundPlaces[otherIndex] = oldPlace;
      data.map.roundPlaces[data.map.round] = place.id;
      data.map.roundResults = data.map.roundResults.slice(0, data.map.round);
      resetMapRound(data.map, place);
      recalculateMapTotals(data.map);
      break;
    }
    case "map:resolve":
      if (!data.map || !data.map.taps.rosa || !data.map.taps.blau) return fail("positions_missing", 409);
      if (data.map.done) return fail("map_already_resolved");
      if (!data.map.locks.rosa || !data.map.locks.blau) return fail("teams_not_locked", 409);
      resolveMap(data.map);
      if (data.map.complete) awardGame(data, mapOverallWinner(data.map), now);
      break;
    case "map:next":
      if (!data.map || !data.map.done) return fail("round_not_resolved");
      if (data.map.complete) return fail("map_complete");
      data.map.round++;
      resetMapRound(data.map, placeById(data.map.roundPlaces[data.map.round]));
      break;
    case "vote:guess":
      if (!data.vote || data.vote.open) return fail("vote_already_open");
      if (message.team !== "rosa" && message.team !== "blau") return fail("bad_team");
      if (data.vote.guessMode === "choice") {
        if (message.choice !== "a" && message.choice !== "b") return fail("bad_choice");
        data.vote.guesses[message.team] = message.choice;
      } else {
        const percent = Number(message.percent);
        if (!Number.isInteger(percent) || percent < 0 || percent > 100) return fail("bad_percentage");
        data.vote.guesses[message.team] = { percent };
      }
      break;
    case "vote:guesses:set": {
      if (!data.vote || data.vote.open) return fail("vote_already_open");
      if (data.vote.guessMode !== "percentage") return fail("wrong_guess_mode");
      const rosa = Number(message.rosaPercent);
      const blau = Number(message.blauPercent);
      if (![rosa, blau].every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) return fail("bad_percentage");
      data.vote.guesses = { rosa: { percent: rosa }, blau: { percent: blau } };
      break;
    }
    case "vote:open":
      if (!data.vote) return fail("no_vote_game");
      if (!data.vote.guesses.rosa || !data.vote.guesses.blau) return fail("guesses_missing", 409);
      data.vote.open = true;
      data.vote.phase = "voting";
      data.vote.openedAt = now();
      data.vote.closesAt = now() + (Number(data.vote.durationMs) || 30000);
      break;
    case "vote:close": {
      if (!data.vote || data.vote.phase !== "voting") return fail("vote_not_open", 409);
      const count = Object.keys(data.vote.votes).length;
      if (count < (data.vote.minVotes || 1) && !message.force) return fail("quorum_missing", 409);
      data.vote.open = false;
      data.vote.phase = "closed";
      data.vote.closedAt = now();
      break;
    }
    case "vote:reveal":
      if (!data.vote || data.vote.phase !== "closed") return fail("vote_not_closed", 409);
      if (!Object.keys(data.vote.votes).length) return fail("no_votes", 409);
      data.vote.revealed = true;
      data.vote.phase = "revealed";
      data.vote.result = calculateVoteResult(data.vote);
      if (data.active?.kind === "physical" && data.challenge) {
        data.challenge.result = data.vote.result;
        data.challenge.phase = "finished";
        data.challenge.finishedAt = now();
      }
      awardGame(data, data.vote.result, now);
      break;
    case "timer:start": return timerStart(data, now);
    case "physical:ready":
      if (data.challenge?.kind !== "physical" || data.challenge.phase !== "setup") return fail("not_in_setup", 409);
      data.challenge.ready = true;
      break;
    case "timer:pause": return timerPause(data, now);
    case "timer:reset": return timerReset(data);
    case "relay:start": return relayStart(data, now);
    case "relay:change": return relayChange(data, message, now);
    case "relay:finish": return relayFinish(data, now);
    case "performance:done": return performanceDone(data, now);
    case "team-round:start": return teamRoundStart(data, now);
    case "team-round:correct": return teamRoundAdvance(data, true, now);
    case "team-round:skip": return teamRoundAdvance(data, false, now);
    case "team-round:finish": return teamRoundFinish(data, now);
    case "counter:change": return counterChange(data, message);
    case "measurement:set": return measurementSet(data, message);
    case "measurement:resolve": return measurementResolve(data, now);
    case "physical:finish": return physicalFinish(data, message, now);
    case "showcase:finish": return showcaseFinish(data, now);
    case "pullups:start": return pullupsStart(data);
    case "pullups:rep": return pullupsRep(data, message);
    case "pullups:finish": return pullupsFinish(data, now);
    case "quiz:reveal": return quizReveal(data);
    case "quiz:ready": return quizReady(data, message);
    case "quiz:mark": return quizMark(data, message);
    case "quiz:next": return quizNext(data, now);
    case "quiz:previous": return quizPrevious(data);
    case "quiz:tiebreak": return quizTieBreak(data, now);
    case "quiz:buzz": return quizBuzz(data, message, now);
    case "quiz:buzz:reset": return quizBuzzReset(data, now);
    case "quiz:buzzer:open": return quizBuzzerOpen(data, now);
    case "quiz:buzzer:close": return quizBuzzerClose(data);
    case "quiz:tiebreak:judge": return quizTieBreakJudge(data, message, now);
    default: return fail("unknown_action");
  }
  return { ok: true };
}

export function mapAction(data, message, now = () => Date.now()) {
  const map = data.map;
  const team = message.team === "rosa" || message.team === "blau" ? message.team : null;
  if (!map || !team || message.token !== map.tokens[team]) return fail("invalid_token", 403);
  if (message.roundId !== map.roundId) return fail("stale_round", 409);
  if (map.done) return message.type === "map:confirm" ? { ok: true } : fail("position_locked", 409);
  if (map.locks[team]) return message.type === "map:confirm" ? { ok: true } : fail("position_locked", 409);
  if (message.type === "map:tap") {
    const lat = Number(message.lat);
    const lng = Number(message.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("bad_position");
    map.taps[team] = { lat: clamp(lat, -90, 90), lng: clamp(lng, -180, 180) };
  } else if (message.type === "map:confirm" || message.type === "map:lock") {
    if (!map.taps[team]) return fail("no_position");
    if (!map.locks[team === "rosa" ? "blau" : "rosa"] && map.locks[team]) return { ok: true };
    if (map.locks[team === "rosa" ? "blau" : "rosa"]) rememberExternalAction(data);
    map.locks[team] = true;
    if (map.locks.rosa && map.locks.blau) {
      resolveMap(map);
      if (map.complete) awardGame(data, mapOverallWinner(map), now);
    }
  } else return fail("unknown_action");
  data.revision++;
  return { ok: true };
}

export function voteAction(data, message) {
  const vote = data.vote;
  if (!vote) return fail("invalid_token", 403);
  if (message.token !== vote.tokens?.guests) return fail("invalid_token", 403);
  if (!vote.open || vote.revealed || vote.phase !== "voting" || (vote.closesAt && Date.now() >= vote.closesAt)) return fail("vote_closed", 409);
  const uid = String(message.uid || "").slice(0, 80);
  if (!uid) return fail("missing_uid");
  if (message.choice !== "a" && message.choice !== "b") return fail("bad_choice");
  if (!Object.hasOwn(vote.votes, uid) && Object.keys(vote.votes).length >= 250) return fail("ballot_limit", 409);
  vote.votes[uid] = message.choice;
  data.revision++;
  return { ok: true };
}

export function buzzerAction(data, message, now = () => Date.now()) {
  const team = message.team === "rosa" || message.team === "blau" ? message.team : null;
  if (!team || !data.challenge?.buzzerTokens || message.token !== data.challenge.buzzerTokens[team]) return fail("invalid_token", 403);
  const result = quizBuzz(data, { team }, now);
  if (!result.ok) return result;
  data.revision++;
  return { ok: true };
}

export function publicState(data, access = {}) {
  const host = access.host === true;
  const team = access.team === "rosa" || access.team === "blau" ? access.team : null;
  const mapValid = Boolean(team && data.map && access.token === data.map.tokens[team]);
  const voteValid = Boolean(data.vote && access.token === data.vote.tokens?.guests);
  if (access.role === "screen") {
    return {
      room: ROOM, session: data.session, scores: data.scores, flipped: data.flipped, completed: data.completed,
      view: data.view, active: data.active, challenge: screenChallenge(data.challenge), map: mapState(data.map, { screen: true }),
      vote: voteState(data.vote, { screen: true }), cards: publicCardsForScreen(data), revision: data.revision, access: { role: "screen", valid: true },
    };
  }
  if (host) {
    return {
      room: ROOM,
      session: data.session,
      scores: data.scores,
      flipped: data.flipped,
      completed: data.completed,
      view: data.view,
      sessionArchive: data.sessionArchive || [],
      active: data.active,
      challenge: data.challenge,
      map: mapState(data.map, { host: true }),
      vote: voteState(data.vote, { host: true }),
      cards: CARDS,
      places: PLACES.map(({ id, name }) => ({ id, name })),
      history: {
        canUndo: Boolean(data.history?.past?.length), canRedo: Boolean(data.history?.future?.length),
        undoCount: data.history?.past?.length || 0, redoCount: data.history?.future?.length || 0,
      },
      revision: data.revision,
      access: { role: "host", valid: true },
    };
  }
  if (access.role === "pad") {
    if (!mapValid) return invalidState("pad", team);
    return { room: ROOM, map: mapState(data.map, { team }), revision: data.revision, access: { role: "pad", team, valid: true } };
  }
  if (access.role === "vote") {
    if (!voteValid) return invalidState("vote");
    return { room: ROOM, vote: voteState(data.vote, { uid: access.uid }), revision: data.revision, access: { role: "vote", valid: true } };
  }
  if (access.role === "buzzer") {
    const buzzerTeam = access.team === "rosa" || access.team === "blau" ? access.team : null;
    if (!buzzerTeam || !data.challenge?.buzzerTokens || access.token !== data.challenge.buzzerTokens[buzzerTeam]) return invalidState("buzzer", buzzerTeam);
    return { room: ROOM, challenge: { phase: data.challenge.phase, buzz: data.challenge.buzz, buzzerOpen: Boolean(data.challenge.buzzerOpen), tieStartedAt: data.challenge.tieStartedAt }, revision: data.revision, access: { role: "buzzer", team: buzzerTeam, valid: true } };
  }
  return invalidState("viewer");
}

function invalidState(role, team = null) {
  return { room: ROOM, access: role === "pad" || role === "buzzer" ? { role, team, valid: false } : { role, valid: false } };
}

function mapState(map, access = {}) {
  if (!map) return null;
  const showAllTeams = map.done;
  const taps = {};
  const locks = {};
  for (const team of ["rosa", "blau"]) {
    if (showAllTeams || access.team === team) {
      if (map.taps[team]) taps[team] = map.taps[team];
    }
    if ((showAllTeams || access.team === team || access.host || access.screen) && map.locks[team]) locks[team] = true;
  }
  return {
    place: {
      id: map.place.id,
      name: map.place.name,
      ...(map.done || access.host ? { detail: map.place.detail } : {}),
      ...(map.done ? { lat: map.place.lat, lng: map.place.lng } : {}),
    },
    round: map.round, roundCount: map.roundPlaces.length, taps, locks, done: map.done, complete: map.complete,
    roundId: map.roundId,
    result: map.done ? map.result : null, totals: map.totals,
    roundResults: map.done || access.host ? map.roundResults : [],
    ...(access.host ? { tokens: map.tokens } : {}),
  };
}

function voteState(vote, access = {}) {
  if (!vote) return null;
  const values = Object.values(vote.votes);
  const counts = { a: values.filter((value) => value === "a").length, b: values.filter((value) => value === "b").length };
  return {
    q: vote.q, a: vote.a, b: vote.b, guessMode: vote.guessMode || "choice", minVotes: vote.minVotes || 1, phase: vote.phase || (vote.revealed ? "revealed" : vote.open ? "voting" : "team"), open: vote.open, revealed: vote.revealed, closesAt: vote.closesAt || null,
    ...(access.host || access.screen || vote.revealed ? { n: values.length, counts: vote.revealed ? counts : null } : {}),
    ...(access.host ? {
      tokens: vote.tokens,
      guessStatus: { rosa: Boolean(vote.guesses.rosa), blau: Boolean(vote.guesses.blau) },
      guesses: vote.guesses,
      ...(vote.revealed ? { result: vote.result } : {}),
    } : {}),
    ...(access.screen && !vote.revealed && vote.tokens?.guests ? { guestToken: vote.tokens.guests } : {}),
    ...(!access.host && access.uid ? { choice: vote.votes[String(access.uid).slice(0, 80)] || null } : {}),
  };
}

function screenChallenge(challenge) {
  if (!challenge) return null;
  const copy = structuredClone(challenge);
  delete copy.buzzerTokens;
  return copy;
}

function publicCardsForScreen(data) {
  return CARDS.map((card) => {
    const copy = structuredClone(card);
    delete copy.termSets;
    if (card.kind !== "quiz") return copy;
    for (const phase of ["main", "tie"]) {
      const section = data.challenge?.[phase];
      const rounds = phase === "main" ? copy.rounds : copy.tieBreak;
      rounds?.forEach((round, index) => { if (!section?.revealed?.[index]) delete round.answer; });
    }
    return copy;
  });
}

function startGame(data, card, makeToken) {
  data.view = "game";
  data.active = activeCard(card);
  data.challenge = null;
  data.map = null;
  data.vote = null;
  if (card.kind === "physical") data.challenge = newPhysicalChallenge(card, makeToken);
  if (card.kind === "quiz") data.challenge = newQuizChallenge(makeToken);
  if (card.kind === "map") data.map = newMap(card, makeToken);
  if (card.kind === "vote") data.vote = { q: card.title, a: card.a, b: card.b, guessMode: card.guessMode || "choice", minVotes: card.minVotes || 1, durationMs: card.durationMs || 30000, phase: "team", open: false, revealed: false, openedAt: null, closesAt: null, closedAt: null, votes: {}, guesses: { rosa: null, blau: null }, tokens: { guests: makeToken() } };
  if (card.kind === "physical" && card.audienceDecision) data.vote = { q: card.voteQuestion || `${card.title}: Welches Team gewinnt?`, a: "Team Kathi", b: "Team Anton", guessMode: "direct", minVotes: 3, durationMs: 30000, phase: "pending", open: false, revealed: false, openedAt: null, closesAt: null, closedAt: null, votes: {}, guesses: { rosa: null, blau: null }, tokens: { guests: makeToken() } };
}

function activeCard(card, awarded = null) {
  return { id: card.id, cat: card.cat, stars: card.stars, kind: card.kind, mode: card.mode || null, title: card.title, text: card.text, awarded };
}

function newPhysicalChallenge(card, makeToken = token) {
  const timer = card.mode === "stopwatch" || card.mode === "countdown" ? { mode: card.mode, durationMs: card.durationMs || null, elapsedMs: 0, runningSince: null } : null;
  const relay = card.mode === "team-relay" ? {
    order: ["rosa", "blau"], index: 0, target: Number(card.target) || 1, unit: card.unit || "Durchgänge", trackProgress: card.trackProgress !== false,
    rounds: {
      rosa: { timer: { mode: "stopwatch", durationMs: null, elapsedMs: 0, runningSince: null }, progress: 0, splits: [], done: false },
      blau: { timer: { mode: "stopwatch", durationMs: null, elapsedMs: 0, runningSince: null }, progress: 0, splits: [], done: false },
    },
  } : null;
  const performance = card.mode === "performance" ? { order: ["rosa", "blau"], index: 0, performed: { rosa: false, blau: false } } : null;
  const teamRounds = card.mode === "team-rounds" ? {
    order: ["rosa", "blau"], index: 0,
    rounds: {
      rosa: { timer: { mode: "countdown", durationMs: card.durationMs || 60000, elapsedMs: 0, runningSince: null }, termIndex: 0, correct: 0, skipped: 0, done: false },
      blau: { timer: { mode: "countdown", durationMs: card.durationMs || 60000, elapsedMs: 0, runningSince: null }, termIndex: 0, correct: 0, skipped: 0, done: false },
    },
  } : null;
  const pullups = card.mode === "pullups" ? { index: 0, attempts: [{ team: "rosa", person: 1, reps: 0, status: "pending" }, { team: "blau", person: 1, reps: 0, status: "pending" }, { team: "rosa", person: 2, reps: 0, status: "pending" }, { team: "blau", person: 2, reps: 0, status: "pending" }] } : null;
  return { kind: "physical", mode: card.mode, phase: "setup", ready: false, result: null, finishedAt: null, timer, relay, performance, teamRounds, pullups, counters: { rosa: 0, blau: 0 }, measurements: { rosa: { left: null, right: null }, blau: { left: null, right: null } } };
}

function newQuizChallenge(makeToken = token) {
  return { kind: "quiz", phase: "main", main: { index: 0, ready: {}, revealed: {}, marks: {}, complete: false }, tie: { index: 0, ready: {}, revealed: {}, marks: {}, complete: false }, buzz: null, buzzerOpen: false, tieStartedAt: null, buzzerTokens: { rosa: makeToken(), blau: makeToken() } };
}

function newMap(card, makeToken) {
  const roundPlaces = shuffledPlaceIds().slice(0, Math.max(1, Math.min(Number(card.roundCount) || 1, PLACES.length)));
  return { roundPlaces, round: 0, roundId: makeToken(), place: placeById(roundPlaces[0]), taps: {}, locks: {}, done: false, complete: false, result: null, roundResults: [], totals: emptyMapTotals(), tokens: { rosa: makeToken(), blau: makeToken() } };
}

function restartGame(data) {
  data.view = "game";
  data.active.awarded = null;
  const card = CARD_BY_ID[data.active.id];
  if (data.challenge?.kind === "physical") data.challenge = newPhysicalChallenge(card);
  if (data.challenge?.kind === "quiz") data.challenge = newQuizChallenge();
  if (data.map) {
    const tokens = data.map.tokens;
    data.map = { ...newMap(card, token), tokens };
  }
  if (data.vote) data.vote = { ...data.vote, phase: data.vote.guessMode === "direct" ? "pending" : "team", open: false, revealed: false, openedAt: null, closesAt: null, closedAt: null, result: null, votes: {}, guesses: { rosa: null, blau: null } };
}

function clearGame(data) { data.active = null; data.challenge = null; data.map = null; data.vote = null; }

function awardGame(data, result, now) {
  if (!data.active || data.active.awarded || data.completed[data.active.id]) return false;
  if (result === "rosa" || result === "blau") data.scores[result] += data.active.stars;
  else if (result === "both") {
    data.scores.rosa += data.active.stars;
    data.scores.blau += data.active.stars;
  }
  data.active.awarded = result;
  data.completed[data.active.id] = { result, stars: data.active.stars, completedAt: now() };
  return true;
}

function newSession(data, label, makeToken, now) {
  const history = data.history;
  const revision = data.revision;
  const number = Math.max(1, Number(data.session?.number) || 1) + 1;
  const next = freshState(makeToken, now);
  next.sessionArchive = [...(data.sessionArchive || []), { ...data.session, endedAt: now(), scores: { ...data.scores }, completed: Object.keys(data.completed || {}).length }].slice(-12);
  next.session.number = number;
  next.session.label = sanitizeLabel(label) || `Show ${number}`;
  next.revision = revision;
  next.history = history;
  replaceData(data, next);
}

function timerStart(data, now) {
  const timer = data.challenge?.timer;
  if (!timer) return fail("no_timer");
  if (!data.challenge.ready) return fail("setup_not_confirmed", 409);
  if (timer.runningSince !== null) return fail("timer_running", 409);
  if (timer.durationMs && timer.elapsedMs >= timer.durationMs) timer.elapsedMs = 0;
  timer.runningSince = now();
  data.challenge.phase = "running";
  return { ok: true };
}

function timerPause(data, now) {
  const timer = data.challenge?.timer;
  if (!timer) return fail("no_timer");
  if (timer.runningSince === null) return fail("timer_not_running", 409);
  timer.elapsedMs += Math.max(0, now() - timer.runningSince);
  timer.runningSince = null;
  data.challenge.phase = "paused";
  return { ok: true };
}

function timerReset(data) {
  const timer = data.challenge?.timer;
  if (!timer) return fail("no_timer");
  timer.elapsedMs = 0;
  timer.runningSince = null;
  data.challenge.phase = "setup";
  data.challenge.result = null;
  data.challenge.finishedAt = null;
  return { ok: true };
}

function relayStart(data, now) {
  const challenge = data.challenge;
  const relay = challenge?.relay;
  if (challenge?.mode !== "team-relay" || !relay) return fail("no_relay");
  if (!challenge.ready) return fail("setup_not_confirmed", 409);
  if (challenge.phase === "finished") return fail("game_finished", 409);
  const team = relay.order[relay.index];
  const round = relay.rounds[team];
  if (!round || round.done || round.timer.runningSince !== null) return fail("timer_running", 409);
  round.timer.runningSince = now();
  challenge.phase = "running";
  return { ok: true };
}

function relayChange(data, message, now) {
  const challenge = data.challenge;
  const relay = challenge?.relay;
  if (challenge?.mode !== "team-relay" || !relay) return fail("no_relay");
  const team = relay.order[relay.index];
  const round = relay.rounds[team];
  if (round?.timer.runningSince === null || round.done) return fail("timer_not_running", 409);
  if (relay.trackProgress === false) return fail("relay_progress_not_tracked", 409);
  const delta = Number(message.delta);
  if (delta !== 1 && delta !== -1) return fail("bad_delta");
  const next = clamp(round.progress + delta, 0, relay.target);
  const changedAt = now();
  if (delta > 0 && next > round.progress) round.splits.push(changedAt);
  if (delta < 0 && next < round.progress) round.splits.pop();
  round.progress = next;
  if (delta > 0 && next >= relay.target) return relayFinish(data, () => changedAt);
  return { ok: true };
}

function relayFinish(data, now) {
  const challenge = data.challenge;
  const relay = challenge?.relay;
  if (challenge?.mode !== "team-relay" || !relay) return fail("no_relay");
  const team = relay.order[relay.index];
  const round = relay.rounds[team];
  if (round?.timer.runningSince === null || round.done) return fail("timer_not_running", 409);
  if (relay.trackProgress !== false && round.progress < relay.target) return fail("relay_incomplete", 409);
  round.timer.elapsedMs = timerElapsed(round.timer, now());
  round.timer.runningSince = null;
  round.done = true;
  if (relay.index === 0) {
    relay.index = 1;
    challenge.phase = "setup";
  } else {
    const rosa = relay.rounds.rosa.timer.elapsedMs;
    const blau = relay.rounds.blau.timer.elapsedMs;
    challenge.result = rosa === blau ? "draw" : rosa < blau ? "rosa" : "blau";
    challenge.phase = "finished";
    challenge.finishedAt = now();
  }
  return { ok: true };
}

function performanceDone(data, now) {
  const card = CARD_BY_ID[data.active?.id];
  const challenge = data.challenge;
  const performance = challenge?.performance;
  if (challenge?.mode !== "performance" || !performance || !data.vote || !card?.audienceDecision) return fail("no_performance");
  if (!challenge.ready) return fail("setup_not_confirmed", 409);
  if (challenge.phase === "judging" || challenge.phase === "finished") return fail("performance_finished", 409);
  const team = performance.order[performance.index];
  performance.performed[team] = true;
  if (performance.index === 0) {
    performance.index = 1;
    challenge.phase = "performing";
  } else {
    challenge.phase = "judging";
    data.vote.phase = "voting";
    data.vote.open = true;
    data.vote.openedAt = now();
    data.vote.closesAt = now() + data.vote.durationMs;
  }
  return { ok: true };
}

function teamRoundStart(data, now) {
  const challenge = data.challenge;
  const teamRounds = challenge?.teamRounds;
  if (challenge?.mode !== "team-rounds" || !teamRounds) return fail("no_team_round");
  if (!challenge.ready) return fail("setup_not_confirmed", 409);
  const team = teamRounds.order[teamRounds.index];
  const round = teamRounds.rounds[team];
  if (!round || round.done || round.timer.runningSince !== null || challenge.phase === "finished") return fail("timer_running", 409);
  round.timer.runningSince = now();
  challenge.phase = "running";
  return { ok: true };
}

function teamRoundAdvance(data, correct, now) {
  const card = CARD_BY_ID[data.active?.id];
  const challenge = data.challenge;
  const teamRounds = challenge?.teamRounds;
  if (challenge?.mode !== "team-rounds" || !teamRounds) return fail("no_team_round");
  const team = teamRounds.order[teamRounds.index];
  const round = teamRounds.rounds[team];
  if (round?.timer.runningSince === null || round.done) return fail("timer_not_running", 409);
  const terms = card?.termSets?.[team] || [];
  if (round.termIndex >= terms.length) return fail("terms_complete", 409);
  if (correct) round.correct++;
  else round.skipped++;
  round.termIndex++;
  if (round.termIndex >= terms.length) return teamRoundFinish(data, now);
  return { ok: true };
}

function teamRoundFinish(data, now) {
  const card = CARD_BY_ID[data.active?.id];
  const challenge = data.challenge;
  const teamRounds = challenge?.teamRounds;
  if (challenge?.mode !== "team-rounds" || !teamRounds) return fail("no_team_round");
  const team = teamRounds.order[teamRounds.index];
  const round = teamRounds.rounds[team];
  if (round?.timer.runningSince === null || round.done) return fail("timer_not_running", 409);
  const elapsed = timerElapsed(round.timer, now());
  const terms = card?.termSets?.[team] || [];
  if (elapsed < round.timer.durationMs && round.termIndex < terms.length) return fail("timer_not_finished", 409);
  round.timer.elapsedMs = Math.min(round.timer.durationMs, elapsed);
  round.timer.runningSince = null;
  round.done = true;
  if (teamRounds.index === 0) {
    teamRounds.index = 1;
    challenge.phase = "setup";
  } else {
    const rosa = teamRounds.rounds.rosa.correct;
    const blau = teamRounds.rounds.blau.correct;
    challenge.result = rosa === blau ? "draw" : rosa > blau ? "rosa" : "blau";
    challenge.phase = "finished";
    challenge.finishedAt = now();
  }
  return { ok: true };
}

function counterChange(data, message) {
  if (data.challenge?.mode !== "counter") return fail("no_counter");
  if (message.team !== "rosa" && message.team !== "blau") return fail("bad_team");
  const delta = Number(message.delta);
  if (!data.challenge.ready) return fail("setup_not_confirmed", 409);
  if (!Number.isInteger(delta) || Math.abs(delta) > 10) return fail("bad_delta");
  const target = Number(CARD_BY_ID[data.active.id]?.target) || 999;
  if (data.active.awarded) return fail("game_finished", 409);
  if (data.challenge.phase === "finished") {
    if (delta >= 0 || message.team !== data.challenge.result) return fail("game_finished", 409);
    data.challenge.phase = "running";
    data.challenge.result = null;
  }
  if (data.challenge.phase === "setup") data.challenge.phase = "running";
  data.challenge.counters[message.team] = clamp(data.challenge.counters[message.team] + delta, 0, target);
  if (CARD_BY_ID[data.active.id]?.target && data.challenge.counters[message.team] >= target) {
    data.challenge.result = message.team;
    data.challenge.phase = "finished";
  }
  return { ok: true };
}

function measurementSet(data, message) {
  if (data.challenge?.mode !== "measurement") return fail("no_measurement");
  if (message.team !== "rosa" && message.team !== "blau") return fail("bad_team");
  if (!data.challenge.ready) return fail("setup_not_confirmed", 409);
  const left = Number(message.left);
  const right = Number(message.right);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0 || left > 10000 || right > 10000) return fail("bad_measurement");
  if (data.challenge.phase === "finished" || data.active.awarded) return fail("game_finished", 409);
  data.challenge.measurements[message.team] = { left, right };
  data.challenge.phase = "measuring";
  return { ok: true };
}

function measurementResolve(data, now) {
  if (data.challenge?.mode !== "measurement") return fail("no_measurement");
  const values = data.challenge.measurements;
  if ([values.rosa.left, values.rosa.right, values.blau.left, values.blau.right].some((value) => !(value > 0))) return fail("measurements_missing", 409);
  const deviation = (team) => Math.abs(values[team].left - values[team].right) / (values[team].left + values[team].right);
  const rosa = deviation("rosa");
  const blau = deviation("blau");
  data.challenge.deviations = { rosa, blau };
  data.challenge.result = Math.abs(rosa - blau) < 1e-9 ? "both" : rosa < blau ? "rosa" : "blau";
  data.challenge.phase = "finished";
  data.challenge.finishedAt = now();
  awardGame(data, data.challenge.result, now);
  return { ok: true };
}

function physicalFinish(data, message, now) {
  const challenge = data.challenge;
  if (!challenge || challenge.kind !== "physical" || challenge.phase === "finished" || data.active?.awarded) return fail("game_finished", 409);
  const result = message.team;
  if (!isResult(result)) return fail("bad_team");
  if (challenge.mode === "countdown") {
    const elapsed = timerElapsed(challenge.timer, now());
    if (elapsed < challenge.timer.durationMs) return fail("timer_not_finished", 409);
    challenge.timer.elapsedMs = challenge.timer.durationMs;
    challenge.timer.runningSince = null;
  } else if (challenge.mode === "stopwatch") {
    if (challenge.timer.runningSince === null) return fail("timer_not_running", 409);
    challenge.timer.elapsedMs = timerElapsed(challenge.timer, now());
    challenge.timer.runningSince = null;
  } else if (challenge.mode === "counter" && !CARD_BY_ID[data.active.id]?.target) {
    if (challenge.counters.rosa === 0 && challenge.counters.blau === 0) return fail("result_not_ready", 409);
    const calculated = challenge.counters.rosa === challenge.counters.blau ? "draw" : challenge.counters.rosa > challenge.counters.blau ? "rosa" : "blau";
    if (result !== calculated) return fail("result_mismatch", 409);
  }
  challenge.result = result;
  challenge.phase = "finished";
  challenge.finishedAt = now();
  return { ok: true };
}

function showcaseFinish(data, now) {
  const card = CARD_BY_ID[data.active?.id];
  const challenge = data.challenge;
  if (!card?.audienceDecision || !data.vote || challenge?.mode !== "countdown") return fail("no_showcase", 409);
  const elapsed = timerElapsed(challenge.timer, now());
  if (elapsed < challenge.timer.durationMs) return fail("timer_not_finished", 409);
  challenge.timer.elapsedMs = challenge.timer.durationMs;
  challenge.timer.runningSince = null;
  challenge.phase = "judging";
  data.vote.phase = "voting";
  data.vote.open = true;
  data.vote.openedAt = now();
  data.vote.closesAt = now() + data.vote.durationMs;
  return { ok: true };
}

function pullupsStart(data) {
  const challenge = data.challenge;
  if (challenge?.mode !== "pullups" || !challenge.ready || challenge.phase === "finished") return fail(challenge?.ready ? "no_pullups" : "setup_not_confirmed", 409);
  const attempt = challenge.pullups.attempts[challenge.pullups.index];
  if (!attempt || attempt.status !== "pending") return fail("attempt_not_ready", 409);
  attempt.status = "active";
  challenge.phase = "running";
  return { ok: true };
}

function pullupsRep(data, message) {
  const challenge = data.challenge;
  const attempt = challenge?.pullups?.attempts?.[challenge.pullups.index];
  if (challenge?.mode !== "pullups" || attempt?.status !== "active") return fail("attempt_not_active", 409);
  const delta = Number(message.delta);
  if (delta !== 1 && delta !== -1) return fail("bad_delta");
  attempt.reps = clamp(attempt.reps + delta, 0, 99);
  challenge.counters[attempt.team] = challenge.pullups.attempts.filter((item) => item.team === attempt.team).reduce((sum, item) => sum + item.reps, 0);
  return { ok: true };
}

function pullupsFinish(data, now) {
  const challenge = data.challenge;
  const attempt = challenge?.pullups?.attempts?.[challenge.pullups.index];
  if (challenge?.mode !== "pullups" || attempt?.status !== "active") return fail("attempt_not_active", 409);
  attempt.status = "done";
  if (challenge.pullups.index < challenge.pullups.attempts.length - 1) {
    challenge.pullups.index++;
    challenge.phase = "setup";
  } else {
    const { rosa, blau } = challenge.counters;
    challenge.result = rosa === blau ? "draw" : rosa > blau ? "rosa" : "blau";
    challenge.phase = "finished";
    challenge.finishedAt = now();
  }
  return { ok: true };
}

function timerElapsed(timer, now) {
  return timer.elapsedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
}

function quizReveal(data) {
  const context = quizContext(data);
  if (!context) return fail("no_quiz");
  if (data.challenge.phase === "main") {
    const ready = context.section.ready?.[context.section.index];
    if (!ready?.rosa || !ready?.blau) return fail("answers_not_locked", 409);
  } else if (!data.challenge.buzz) return fail("buzzer_missing", 409);
  context.section.revealed[context.section.index] = true;
  return { ok: true };
}

function quizReady(data, message) {
  const context = quizContext(data);
  if (!context || data.challenge.phase !== "main") return fail("no_quiz");
  if (message.team !== "rosa" && message.team !== "blau") return fail("bad_team");
  if (context.section.revealed[context.section.index]) return fail("round_revealed", 409);
  context.section.ready ||= {};
  context.section.ready[context.section.index] ||= { rosa: false, blau: false };
  context.section.ready[context.section.index][message.team] = true;
  return { ok: true };
}

function quizMark(data, message) {
  const context = quizContext(data);
  if (!context) return fail("no_quiz");
  if (message.team !== "rosa" && message.team !== "blau") return fail("bad_team");
  if (!context.section.revealed[context.section.index]) return fail("round_not_revealed", 409);
  context.section.marks[context.section.index] ||= { rosa: null, blau: null };
  context.section.marks[context.section.index][message.team] = Boolean(message.correct);
  return { ok: true };
}

function quizNext(data, now) {
  const context = quizContext(data);
  if (!context) return fail("no_quiz");
  if (!context.section.revealed[context.section.index]) return fail("round_not_revealed", 409);
  const mark = context.section.marks[context.section.index];
  if (!mark || typeof mark.rosa !== "boolean" || typeof mark.blau !== "boolean") return fail("round_not_scored", 409);
  if (context.section.index >= context.rounds.length - 1) {
    context.section.complete = true;
    if (data.challenge.phase === "main") {
      const scores = quizScores(data.challenge);
      if (scores.rosa !== scores.blau) awardGame(data, scores.rosa > scores.blau ? "rosa" : "blau", now);
    } else {
      const tieMark = context.section.marks[context.section.index];
      let result = "draw";
      if (tieMark.rosa !== tieMark.blau) result = tieMark.rosa ? "rosa" : "blau";
      else if (tieMark.rosa && tieMark.blau && data.challenge.buzz) result = data.challenge.buzz.team;
      awardGame(data, result, now);
    }
  }
  else {
    context.section.index++;
    if (data.challenge.phase === "tie") {
      data.challenge.buzz = null;
      data.challenge.tieStartedAt = now();
    }
  }
  return { ok: true };
}

function quizPrevious(data) {
  const context = quizContext(data);
  if (!context || context.section.index <= 0) return fail("first_round", 409);
  context.section.complete = false;
  context.section.index--;
  return { ok: true };
}

function quizTieBreak(data, now) {
  const card = CARD_BY_ID[data.active?.id];
  if (data.challenge?.kind !== "quiz" || !data.challenge.main.complete || !card?.tieBreak?.length) return fail("tiebreak_unavailable", 409);
  const scores = quizScores(data.challenge);
  if (scores.rosa !== scores.blau) return fail("tiebreak_not_needed", 409);
  data.challenge.phase = "tie";
  data.challenge.tie = { index: 0, ready: {}, revealed: {}, marks: {}, complete: false };
  data.challenge.buzz = null;
  data.challenge.buzzerOpen = false;
  data.challenge.tieStartedAt = null;
  return { ok: true };
}

function quizBuzz(data, message, now) {
  if (data.challenge?.kind !== "quiz" || data.challenge.phase !== "tie") return fail("no_tiebreak", 409);
  if (message.team !== "rosa" && message.team !== "blau") return fail("bad_team");
  if (data.challenge.buzz) return fail("already_buzzed", 409);
  if (!data.challenge.buzzerOpen || data.challenge.tieStartedAt === null) return fail("buzzer_closed", 409);
  data.challenge.buzz = { team: message.team, elapsedMs: Math.max(0, now() - data.challenge.tieStartedAt) };
  data.challenge.buzzerOpen = false;
  return { ok: true };
}

function quizBuzzerOpen(data, now) {
  if (data.challenge?.kind !== "quiz" || data.challenge.phase !== "tie" || data.challenge.buzz) return fail("no_tiebreak", 409);
  data.challenge.buzzerOpen = true;
  data.challenge.tieStartedAt = now();
  return { ok: true };
}

function quizBuzzerClose(data) {
  if (data.challenge?.kind !== "quiz" || data.challenge.phase !== "tie") return fail("no_tiebreak", 409);
  data.challenge.buzzerOpen = false;
  return { ok: true };
}

function quizTieBreakJudge(data, message, now) {
  const challenge = data.challenge;
  if (challenge?.kind !== "quiz" || challenge.phase !== "tie" || !challenge.buzz) return fail("buzzer_missing", 409);
  const context = quizContext(data);
  if (!context?.section.revealed?.[context.section.index]) return fail("round_not_revealed", 409);
  const correct = Boolean(message.correct);
  const winner = correct ? challenge.buzz.team : challenge.buzz.team === "rosa" ? "blau" : "rosa";
  context.section.marks[context.section.index] = {
    rosa: winner === "rosa",
    blau: winner === "blau",
  };
  context.section.complete = true;
  challenge.buzzerOpen = false;
  awardGame(data, winner, now);
  return { ok: true };
}

function expectedResult(data, now) {
  if (data.active?.kind !== "physical") return { ready: false, error: "automatic_result" };
  const challenge = data.challenge;
  if (!challenge?.result || challenge.phase !== "finished") return { ready: false, error: "result_not_ready" };
  return { ready: true, allowed: [challenge.result] };
}

function calculateVoteResult(vote) {
  const values = Object.values(vote.votes);
  const a = values.filter((value) => value === "a").length;
  const b = values.filter((value) => value === "b").length;
  if (vote.guessMode === "direct") {
    if (a === b) return "draw";
    return a > b ? "rosa" : "blau";
  }
  if (vote.guessMode === "choice") {
    if (a === b) return "draw";
    const majority = a > b ? "a" : "b";
    const rosa = vote.guesses.rosa === majority;
    const blau = vote.guesses.blau === majority;
    return rosa && blau ? "both" : rosa ? "rosa" : blau ? "blau" : "draw";
  }
  const actual = a + b ? a / (a + b) * 100 : 0;
  const rosaDiff = Math.abs(vote.guesses.rosa.percent - actual);
  const blauDiff = Math.abs(vote.guesses.blau.percent - actual);
  if (Math.abs(rosaDiff - blauDiff) > 1e-9) return rosaDiff < blauDiff ? "rosa" : "blau";
  return "both";
}

function quizBuzzReset(data, now) {
  if (data.challenge?.kind !== "quiz" || data.challenge.phase !== "tie") return fail("no_tiebreak", 409);
  data.challenge.buzz = null;
  data.challenge.buzzerOpen = false;
  data.challenge.tieStartedAt = null;
  return { ok: true };
}

function quizContext(data) {
  if (data.challenge?.kind !== "quiz") return null;
  const card = CARD_BY_ID[data.active?.id];
  if (!card) return null;
  const phase = data.challenge.phase;
  return { section: phase === "tie" ? data.challenge.tie : data.challenge.main, rounds: phase === "tie" ? card.tieBreak : card.rounds };
}

export function quizScores(challenge) {
  const scores = { rosa: 0, blau: 0 };
  for (const mark of Object.values(challenge?.main?.marks || {})) {
    if (mark.rosa) scores.rosa++;
    if (mark.blau) scores.blau++;
  }
  return scores;
}

function normalizeMap(map) {
  if (Array.isArray(map.roundPlaces) && Number.isInteger(map.round)) return { ...map, roundId: map.roundId || token(), roundResults: Array.isArray(map.roundResults) ? map.roundResults : [], totals: map.totals || emptyMapTotals(), complete: Boolean(map.complete) };
  const roundPlaces = [map.place?.id || PLACES[0].id];
  const normalized = { roundPlaces, round: 0, roundId: token(), place: placeById(roundPlaces[0]), taps: map.taps || {}, locks: map.locks || {}, done: Boolean(map.done), complete: Boolean(map.done), result: map.result || null, roundResults: [], totals: emptyMapTotals(), tokens: map.tokens || { rosa: token(), blau: token() } };
  if (normalized.done && normalized.result) {
    normalized.roundResults[0] = { place: normalized.place, result: normalized.result, winner: resultWinner(normalized.result) };
    recalculateMapTotals(normalized);
  }
  return normalized;
}

function resetMapRound(map, place) { map.place = place; map.roundId = token(); map.taps = {}; map.locks = {}; map.done = false; map.complete = false; map.result = null; }

function resolveMap(map) {
  map.done = true;
  map.locks.rosa = Boolean(map.taps.rosa);
  map.locks.blau = Boolean(map.taps.blau);
  map.result = { rosaKm: map.taps.rosa ? haversine(map.place, map.taps.rosa) : null, blauKm: map.taps.blau ? haversine(map.place, map.taps.blau) : null };
  map.roundResults[map.round] = { place: map.place, result: map.result, winner: resultWinner(map.result) };
  map.complete = map.round >= map.roundPlaces.length - 1;
  recalculateMapTotals(map);
}

function resultWinner(result) {
  if (result.rosaKm === null && result.blauKm === null) return "draw";
  if (result.blauKm === null) return "rosa";
  if (result.rosaKm === null) return "blau";
  if (result.rosaKm === result.blauKm) return "draw";
  return result.rosaKm < result.blauKm ? "rosa" : "blau";
}

function recalculateMapTotals(map) {
  const totals = emptyMapTotals();
  for (const item of map.roundResults.filter(Boolean)) {
    if (item.result.rosaKm !== null) totals.rosaKm += item.result.rosaKm;
    if (item.result.blauKm !== null) totals.blauKm += item.result.blauKm;
    if (item.winner === "rosa") totals.rosaWins++;
    else if (item.winner === "blau") totals.blauWins++;
    else totals.draws++;
  }
  map.totals = totals;
}

function mapOverallWinner(map) {
  if (map.totals.rosaWins !== map.totals.blauWins) return map.totals.rosaWins > map.totals.blauWins ? "rosa" : "blau";
  if (map.totals.rosaKm !== map.totals.blauKm) return map.totals.rosaKm < map.totals.blauKm ? "rosa" : "blau";
  return "draw";
}

function emptyMapTotals() { return { rosaKm: 0, blauKm: 0, rosaWins: 0, blauWins: 0, draws: 0 }; }

function undo(data) {
  if (!data.history?.past?.length) return fail("nothing_to_undo", 409);
  const revision = Number(data.revision) || 0;
  const current = snapshot(data);
  const previous = data.history.past.pop();
  data.history.future.push(current);
  if (data.history.future.length > MAX_HISTORY) data.history.future.shift();
  const history = data.history;
  replaceData(data, structuredClone(previous));
  data.history = history;
  data.revision = revision + 1;
  return { ok: true };
}

function redo(data) {
  if (!data.history?.future?.length) return fail("nothing_to_redo", 409);
  const revision = Number(data.revision) || 0;
  const current = snapshot(data);
  const next = data.history.future.pop();
  data.history.past.push(current);
  if (data.history.past.length > MAX_HISTORY) data.history.past.shift();
  const history = data.history;
  replaceData(data, structuredClone(next));
  data.history = history;
  data.revision = revision + 1;
  return { ok: true };
}

function snapshot(data) { const value = structuredClone(data); delete value.history; return value; }
function replaceData(target, source) { for (const key of Object.keys(target)) delete target[key]; Object.assign(target, source); }
function rememberExternalAction(data) {
  data.history ||= { past: [], future: [] };
  data.history.past.push(snapshot(data));
  if (data.history.past.length > MAX_HISTORY) data.history.past.shift();
  data.history.future = [];
}

function shuffledPlaceIds() {
  const ids = PLACES.map((place) => place.id);
  for (let index = ids.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  return ids;
}

function placeById(id) { return PLACES.find((place) => place.id === id) || PLACES[0]; }

function haversine(a, b) {
  const radius = 6371;
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(value)));
}

function sanitizeLabel(value) { return String(value || "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40); }
function safeScore(value) { const score = Number(value); return Number.isInteger(score) && score >= 0 && score <= 999 ? score : 0; }
function isResult(value) { return value === "rosa" || value === "blau" || value === "both" || value === "draw"; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function fail(error, status = 400) { return { ok: false, error, status }; }
