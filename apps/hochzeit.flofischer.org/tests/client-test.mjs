import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { CARDS, freshState, hostAction, publicState, voteAction } from "../src/game.mjs";
import { acceptState, pollDelay } from "../public/transport.mjs";

// Exercise the real rendering and request orchestration with a small DOM stub.
// This is not a substitute for visual browser QA.
const source = (await readFile(new URL("../public/app.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/, "").split('if (context.role === "host" || context.role === "screen") {')[0];

function client(requestJson = async () => { throw new Error("Unexpected request"); }) {
  const storage = new Map();
  const element = () => ({ innerHTML: "", textContent: "", hidden: true, dataset: {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const elements = Object.fromEntries(["#app", "#score-dialog", "#score-form", "#session-dialog", "#session-form", "#toast", "#connection-status"].map(key => [key, element()]));
  const c = vm.createContext({
    document: { querySelector: key => elements[key] || null, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    location: { pathname: "/", search: "", origin: "http://192.168.1.10:8787" },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, URL, performance, crypto, console, requestJson, acceptState, pollDelay,
    actionId: () => crypto.randomUUID(), setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, window: {},
  });
  vm.runInContext(source, c);
  return { run: code => vm.runInContext(code, c), set: s => { c.next = s; vm.runInContext("state = next;", c); }, c, storage, elements };
}

function open(id) {
  const s = freshState();
  hostAction(s, { type: "flip", id }, undefined, () => 1000);
  hostAction(s, { type: "start", id }, undefined, () => 2000);
  if (s.challenge?.kind === "physical") hostAction(s, { type: "physical:ready" });
  return s;
}

test("all 20 host and screen game views render; manual tiebreak has no device QR", () => {
  const ui = client();
  for (const card of CARDS) {
    const s = open(card.id);
    ui.set(publicState(s, { host: true }));
    assert.ok(ui.run("gameMarkup()").includes(card.title));
    ui.set(publicState(s, { role: "screen" }));
    assert.ok(ui.run("screenGameMarkup()").includes(card.title));
  }
  const tie = open("raten-1");
  tie.challenge.main.complete = true;
  hostAction(tie, { type: "quiz:tiebreak" });
  ui.set(publicState(tie, { host: true }));
  const html = ui.run("gameMarkup()");
  assert.ok(html.includes("KATHI WAR ZUERST"));
  assert.ok(html.includes("NIEMAND WEISS ES"));
  assert.equal(html.includes("/buzzer/"), false);
  assert.equal(html.includes("/api/qr"), false);
  const shirt = open("aktion-2");
  hostAction(shirt, { type: "timer:start" });
  ui.set(publicState(shirt, { host: true }));
  assert.ok(ui.run("gameMarkup()").includes('data-action="physical-finish"'));
  assert.equal(ui.run("gameMarkup()").includes('data-action="relay-change"'), false);
});

test("lost host response retries the same request once; another click is blocked until confirmed", async () => {
  const s = open("aktion-5");
  hostAction(s, { type: "pullups:start" });
  let calls = 0;
  const ids = [];
  const ui = client(async (_url, options) => {
    calls++;
    const message = JSON.parse(options.body);
    ids.push(message.actionId);
    assert.equal(hostAction(s, message).ok, true);
    if (calls === 1) throw new Error("response lost after commit");
    return { response: { ok: true, status: 200 }, body: { state: publicState(s, { host: true }) } };
  });
  ui.set(publicState(s, { host: true }));
  ui.run("render = () => {}; refreshBackup = async () => false;");
  assert.equal(await ui.run('hostSend({type:"pullups:rep",delta:1})'), false);
  assert.equal(s.challenge.counters.rosa, 1);
  assert.ok(ui.storage.has("hochzeit-pending"));
  assert.equal(await ui.run('hostSend({type:"pullups:rep",delta:1})'), false);
  assert.equal(calls, 1);
  assert.equal(await ui.run("deliverHostMessage()"), true);
  assert.equal(ids[0], ids[1]);
  assert.equal(s.challenge.counters.rosa, 1);
  assert.equal(ui.storage.has("hochzeit-pending"), false);
});

test("an unsaved map position cannot confirm the previously saved pin", async () => {
  let calls = 0;
  const ui = client(async () => { calls++; });
  ui.run("mapPositionSaved = false; mapPositionQueue = Promise.resolve(false);");
  assert.equal(await ui.run("confirmMapPosition()"), false);
  assert.equal(calls, 0);
});

test("vote deadline removes voting buttons without waiting for another server revision", () => {
  const ui = client();
  ui.elements["[data-vote-deadline]"] = { dataset: { voteDeadline: 1 }, classList: { toggle() {} } };
  ui.set({ vote: { open: true, phase: "voting" } });
  ui.run("let renderCount = 0; render = () => { renderCount++; }; wireTimer();");
  assert.equal(ui.run("state.vote.open"), false);
  assert.equal(ui.run("state.vote.phase"), "closed");
  assert.equal(ui.run("renderCount"), 1);
});

test("percentage predictions and dress vote result render publicly after reveal", () => {
  const ui = client();
  for (const id of ["vote-1", "party-5"]) {
    const s = open(id);
    if (id === "vote-1") {
      hostAction(s, { type: "vote:guesses:set", rosaPercent: 40, blauPercent: 60 });
      hostAction(s, { type: "vote:open" });
    } else {
      hostAction(s, { type: "timer:start" }, undefined, () => Date.now() - 180001);
      hostAction(s, { type: "showcase:finish" });
    }
    voteAction(s, { token: s.vote.tokens.guests, uid: "one", choice: "b" });
    hostAction(s, { type: "vote:close", force: true });
    hostAction(s, { type: "vote:reveal" });
    ui.set(publicState(s, { role: "screen" }));
    const screen = ui.run("screenGameMarkup()");
    assert.ok(screen.includes('class="bars"'));
    if (id === "vote-1") assert.ok(screen.includes("40 % Hund") && screen.includes("60 % Hund"));
    ui.set(publicState(s, { host: true }));
    assert.ok(ui.run("gameMarkup()").includes('class="bars"'));
  }
});

test("cutting projector hides unannounced weights, explains the next cut and shows the final winner", () => {
  const ui = client();
  const data = open("party-3");
  for (let turn = 0; turn < 6; turn++) {
    hostAction(data, { type: "cut:guess", guess: "left" });
    hostAction(data, { type: "cut:weigh", left: 73.2, right: 22.9 });
    ui.set(publicState(data, { role: "screen" }));
    const before = ui.run("screenGameMarkup()");
    assert.equal(before.includes("73,2"), false);
    assert.equal(before.includes("73.2"), false);
    assert.equal(before.includes("data-cut-weights"), false);
    hostAction(data, { type: "cut:reveal" });
    ui.set(publicState(data, { role: "screen" }));
    const after = ui.run("screenGameMarkup()");
    assert.ok(after.includes("73,2"));
    assert.equal(after.includes('data-action="cut-next"'), false);
    if (turn % 2 === 0) assert.ok(after.includes("Anton nimmt das linke Stück"));
    if (turn < 5) hostAction(data, { type: "cut:next" });
  }
  assert.ok(ui.run("screenGameMarkup()").includes("5 Showpunkte je Team"));
});

test("projector shows a physical winner and never receives pantomime terms", () => {
  const ui = client();
  const data = open("aktion-2");
  hostAction(data, { type: "timer:start" });
  hostAction(data, { type: "physical:finish", team: "rosa" });
  hostAction(data, { type: "winner", team: "rosa" });
  ui.set(publicState(data, { role: "screen" }));
  assert.ok(ui.run("screenGameMarkup()").includes("Team Kathi gewinnt"));
  const pantomime = open("party-2");
  hostAction(pantomime, { type: "team-round:start" });
  const screen = publicState(pantomime, { role: "screen" });
  assert.equal(JSON.stringify(screen).includes("Zähne putzen"), false);
  ui.set(screen);
  assert.equal(ui.run("screenGameMarkup()").includes("Zähne putzen"), false);
  ui.set(publicState(pantomime, { host: true }));
  assert.ok(ui.run("gameMarkup()").includes("Zähne putzen"));
});
