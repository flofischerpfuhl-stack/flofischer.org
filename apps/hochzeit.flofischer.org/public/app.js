import { requestJson, pollDelay, acceptState, actionId } from "./transport.mjs";

const app = document.querySelector("#app");
const scoreDialog = document.querySelector("#score-dialog");
const scoreForm = document.querySelector("#score-form");
const sessionDialog = document.querySelector("#session-dialog");
const sessionForm = document.querySelector("#session-form");
const params = new URLSearchParams(location.search);
const path = location.pathname.replace(/\/+$/, "") || "/";
const context = path.startsWith("/pad/rosa")
  ? { role: "pad", team: "rosa", token: params.get("t") || "" }
  : path.startsWith("/pad/blau")
    ? { role: "pad", team: "blau", token: params.get("t") || "" }
    : path.startsWith("/buzzer/rosa")
          ? { role: "buzzer", team: "rosa", token: params.get("t") || "" }
          : path.startsWith("/buzzer/blau")
            ? { role: "buzzer", team: "blau", token: params.get("t") || "" }
    : path.startsWith("/vote")
      ? { role: "vote", token: params.get("t") || "" }
      : path.startsWith("/screen")
        ? { role: "screen" }
      : { role: "host", pin: sessionStorage.getItem("hochzeit-host") ? "authenticated" : "" };

let state = null;
let polling = false;
let voteChoice = null;
let toastTimer;
let boardReady = false;
let mapPointerActive = false;
let deferredRender = false;
let mapPositionQueue = Promise.resolve();
let mapPositionSaved = true;
let mapPendingSends = 0;
let pendingHostMessage = null;
try { pendingHostMessage = JSON.parse(sessionStorage.getItem("hochzeit-pending") || "null"); } catch {}
let hostSending = false;
let clientSending = false;
let pollTimeout;
let networkFailures = 0;
let clockOffset = 0;
let bestClockRtt = Infinity;
let backupBusy = false;
let lastBackupAt = 0;
let lastBackupRevision = -1;
let cachedBackup = null;
try { cachedBackup = JSON.parse(localStorage.getItem("hochzeit-backup") || "null"); } catch {}
const serverTime = () => performance.timeOrigin + performance.now() + clockOffset;
let mapCamera = { key: "", scale: 1, x: 0, y: 0 };
let timerFrame = 0;
let audioContext = null;
let audioStopTimer = 0;
const MAP_MAX_SCALE = 8;
const TEAM_NAMES = { rosa: "Kathi", blau: "Anton" };
const knownFlips = new Set();
const pendingTiles = new Set();

scoreForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return scoreDialog.close();
  const rosa = Number(document.querySelector("#score-rosa").value);
  const blau = Number(document.querySelector("#score-blau").value);
  if (await hostSend({ type: "score:set", rosa, blau })) scoreDialog.close();
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return sessionDialog.close();
  const confirmation = document.querySelector("#session-confirm").value.trim().toUpperCase();
  if (confirmation !== "NEU") return showToast("Zum Zurücksetzen bitte NEU eingeben.");
  const label = document.querySelector("#session-label").value.trim();
  if (await hostSend({ type: "session:new", label })) sessionDialog.close();
});

app.addEventListener("submit", async (event) => {
  const pullupsForm = event.target.closest("[data-pullups-result]");
  if (pullupsForm) {
    event.preventDefault();
    return hostSend({ type: "pullups:finish", reps: Number(new FormData(pullupsForm).get("reps")) });
  }
  const voteGuess = event.target.closest("[data-host-vote-guesses]");
  if (voteGuess) {
    event.preventDefault();
    const fields = new FormData(voteGuess);
    return hostSend({ type: "vote:guesses:set", rosaPercent: Number(fields.get("rosaPercent")), blauPercent: Number(fields.get("blauPercent")) });
  }
  const form = event.target.closest("[data-measurement]");
  if (!form) return;
  event.preventDefault();
  const fields = new FormData(form);
  await hostSend({ type: "measurement:set", team: form.dataset.measurement, left: Number(fields.get("left")), right: Number(fields.get("right")) });
});

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled || button.classList.contains("revealing")) return;
  const action = button.dataset.action;
  if (action === "login") return login();
  if (action === "backup") return downloadBackup();
  if (action === "restore") return document.querySelector("#backup-file").click();
  if (action === "flip") return activateTile(button);
  if (action === "close") return hostSend({ type: "close" });
  if (action === "discard") return confirm("Laufendes Spiel wirklich verwerfen? Der bisherige Spielstand dieses Spiels geht verloren.") && hostSend({ type: "game:discard" });
  if (action === "winner") return hostSend({ type: "winner", team: button.dataset.team });
  if (action === "restart") return confirm("Dieses Spiel wirklich auf den Anfang zurücksetzen?") && hostSend({ type: "game:restart" });
  if (action === "qr") return confirm(state.vote ? "Der bisherige Gäste-QR wird sofort ungültig. Fortfahren?" : "Die bisherigen QR-Codes werden sofort ungültig. Fortfahren?") && hostSend({ type: "qr:regenerate" });
  if (action === "undo") return hostSend({ type: "history:undo" });
  if (action === "redo") return hostSend({ type: "history:redo" });
  if (action === "new-session") return openSessionDialog();
  if (action === "map-next") return hostSend({ type: "map:next" });
  if (action === "vote-open") return hostSend({ type: "vote:open" });
  if (action === "vote-extend") return hostSend({ type: "vote:extend" });
  if (action === "vote-close") return button.dataset.force !== "true" || confirm("Mindestbeteiligung nicht erreicht. Abstimmung wirklich vorzeitig schließen?") ? hostSend({ type: "vote:close", force: button.dataset.force === "true" }) : false;
  if (action === "vote-reveal") return hostSend({ type: "vote:reveal" });
  if (action === "score-dialog") return openScoreDialog();
  if (action === "board-reset") return confirm("Alle Karten wieder zudecken? Der Punktestand bleibt erhalten.") && hostSend({ type: "board:reset" });
  if (action === "timer") return hostSend({ type: `timer:${button.dataset.timer}` });
  if (action === "relay-start") return hostSend({ type: "relay:start" });
  if (action === "relay-change") return hostSend({ type: "relay:change", delta: Number(button.dataset.delta) });
  if (action === "relay-finish") return hostSend({ type: "relay:finish" });
  if (action === "performance-done") return hostSend({ type: "performance:done" });
  if (action === "team-round-start") return hostSend({ type: "team-round:start" });
  if (action === "team-round-correct") return hostSend({ type: "team-round:correct" });
  if (action === "team-round-skip") return hostSend({ type: "team-round:skip" });
  if (action === "team-round-finish") return hostSend({ type: "team-round:finish" });
  if (action === "physical-finish") return hostSend({ type: "physical:finish", team: button.dataset.team });
  if (action === "physical-tiebreak") return hostSend({ type: "physical:tiebreak", team: button.dataset.team });
  if (action === "showcase-finish") return hostSend({ type: "showcase:finish" });
  if (action === "physical-ready") return hostSend({ type: "physical:ready" });
  if (action === "pullups-start") return hostSend({ type: "pullups:start" });
  if (action === "pullups-rep") return hostSend({ type: "pullups:rep", delta: Number(button.dataset.delta) });
  if (action === "pullups-finish") return hostSend({ type: "pullups:finish" });
  if (action === "measurement-resolve") return hostSend({ type: "measurement:resolve" });
  if (action === "counter") return hostSend({ type: "counter:change", team: button.dataset.team, delta: Number(button.dataset.delta) });
  if (action === "quiz-reveal") return hostSend({ type: "quiz:reveal" });
  if (action === "quiz-ready") return hostSend({ type: "quiz:ready", team: button.dataset.team });
  if (action === "quiz-mark") return hostSend({ type: "quiz:mark", team: button.dataset.team, correct: button.dataset.correct === "true" });
  if (action === "quiz-next") return hostSend({ type: "quiz:next" });
  if (action === "quiz-previous") return hostSend({ type: "quiz:previous" });
  if (action === "quiz-tiebreak") return hostSend({ type: "quiz:tiebreak" });
  if (action === "quiz-call") { await stopAudio(); return hostSend({ type: "quiz:call", team: button.dataset.team }); }
  if (action === "quiz-tie-draw") return hostSend({ type: "quiz:tiebreak:draw" });
  if (action === "quiz-buzz-reset") return hostSend({ type: "quiz:buzz:reset" });
  if (action === "quiz-buzzer-open") return hostSend({ type: "quiz:buzzer:open" });
  if (action === "quiz-tiebreak-judge") return hostSend({ type: "quiz:tiebreak:judge", correct: button.dataset.correct === "true" });
  if (action === "play-melody") return playMelody(currentQuizRound()?.melody).catch(() => showToast("Audio konnte nicht starten. Lautsprecher prüfen und erneut antippen."));
  if (action === "map-confirm") return confirmMapPosition();
  if (action === "vote") {
    voteChoice = button.dataset.choice;
    return clientSend("/api/vote", { token: context.token, choice: voteChoice });
  }
  if (action === "vote-guess") return hostSend({ type: "vote:guess", team: button.dataset.team, choice: button.dataset.choice });
  if (action === "team-buzz") return clientSend("/api/buzzer", { team: context.team, token: context.token });
});

app.addEventListener("change", (event) => {
  if (event.target.id === "backup-file" && event.target.files[0]) return importBackupFile(event.target.files[0]);
  if (event.target.matches("[data-place]")) hostSend({ type: "map:select", placeId: event.target.value });
});

function loginMarkup(error = "") {
  cancelAnimationFrame(timerFrame);
  app.innerHTML = `<main class="login"><section class="login-card spotlight">
    <p class="eyebrow">ANTON &amp; KATHI PRÄSENTIEREN</p>${showLogoMarkup("hero-logo")}
    <p class="room">MODERATION · HOCHZEITSSHOW</p><input class="pin-input" id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" aria-label="Host-PIN" placeholder="••••">
    <p class="error">${escapeHtml(error)}</p><button class="button gold big" data-action="login">SHOW ÖFFNEN</button>
  </section></main>`;
  document.querySelector("#pin")?.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  document.querySelector("#pin")?.focus();
}

async function login() {
  const pin = document.querySelector("#pin")?.value.trim() || "";
  try {
    const { response } = await requestJson("/api/host", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
    if (!response.ok) return loginMarkup(response.status === 401 ? "Falsche PIN – bitte erneut versuchen." : "Server nicht erreichbar. Bitte erneut versuchen.");
    context.pin = "authenticated";
    sessionStorage.setItem("hochzeit-host", "1");
    await poll();
  } catch { loginMarkup("Keine Verbindung. Bitte erneut versuchen."); }
}

async function activateTile(button) {
  const id = button.dataset.id;
  if (!id || pendingTiles.has(id)) return false;
  pendingTiles.add(id); button.disabled = true; button.setAttribute("aria-busy", "true");
  try { return await hostSend({ type: state.flipped[id] ? "start" : "flip", id }); }
  finally { pendingTiles.delete(id); if (button.isConnected) { button.disabled = false; button.removeAttribute("aria-busy"); } }
}

async function refreshBackup() {
  if (backupBusy || context.role !== "host" || !context.pin) return false;
  backupBusy = true;
  try {
    const { response, body } = await requestJson("/api/backup", { cache: "no-store" });
    if (!response.ok || body.format !== "hochzeit-show-backup") return false;
    cachedBackup = body;
    lastBackupAt = Date.now();
    lastBackupRevision = body.state.hostRevision;
    try { localStorage.setItem("hochzeit-backup", JSON.stringify(body)); } catch {}
    return true;
  } catch { return false; }
  finally { backupBusy = false; }
}

async function downloadBackup() {
  await refreshBackup();
  if (!cachedBackup) return showToast("Noch keine Sicherung vorhanden. Bitte einmal mit dem Server verbinden.");
  const blob = new Blob([JSON.stringify(cachedBackup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hochzeit-sicherung-${new Date(cachedBackup.savedAt).toISOString().replaceAll(":", "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast(`Sicherung vom ${new Date(cachedBackup.savedAt).toLocaleTimeString("de-DE")} gespeichert.`);
}

async function importBackupFile(file) {
  if (pendingHostMessage || hostSending) return showToast("Bitte zuerst die letzte Aktion bestätigen lassen.");
  try {
    if (file.size > 2000000) throw new Error("too_large");
    const backup = JSON.parse(await file.text());
    if (backup.format !== "hochzeit-show-backup") throw new Error("invalid_backup");
    if (!confirm(`Sicherung vom ${new Date(backup.savedAt).toLocaleString("de-DE")} laden? Der aktuelle lokale Spielstand wird ersetzt. Alle Geräte müssen danach die lokalen Links verwenden.`)) return;
    hostSending = true;
    const { response, body } = await requestJson("/api/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ backup, expectedHostRevision: state.hostRevision }) });
    if (!response.ok) return showToast(body.error === "stale_revision" ? errorMessage(body.error) : "Sicherung konnte nicht geladen werden.");
    if (acceptState(state, body.state)) state = body.state;
    lastBackupRevision = -1;
    await stopAudio();
    render();
    void refreshBackup();
    showToast("Spielstand übernommen. Teamgeräte bitte die lokalen QR-Codes scannen lassen.");
  } catch { showToast("Laden nicht bestätigt. Verbindung und Sicherungsdatei prüfen."); }
  finally { hostSending = false; }
}

function connectionStatus(message = "") {
  const element = document.querySelector("#connection-status");
  if (element) { element.textContent = message; element.hidden = !message; }
}

function schedulePoll() {
  clearTimeout(pollTimeout);
  pollTimeout = setTimeout(poll, pollDelay(context.role, networkFailures, document.hidden));
}

async function poll() {
  if (polling) return;
  if (context.role === "host" && !context.pin) return schedulePoll();
  polling = true;
  try {
    const query = new URLSearchParams();
    if (context.role !== "host") query.set("role", context.role);
    if (context.team) query.set("team", context.team);
    if (context.token) query.set("token", context.token);
    const started = performance.timeOrigin + performance.now();
    const { response, body: nextState } = await requestJson(`/api/state?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finished = performance.timeOrigin + performance.now();
    const rtt = finished - started;
    const liveTimers = [state?.challenge?.timer, ...Object.values(state?.challenge?.relay?.rounds || {}).map(r => r.timer), ...Object.values(state?.challenge?.teamRounds?.rounds || {}).map(r => r.timer)];
    if (!liveTimers.some(timer => timer?.runningSince != null) && Number.isFinite(nextState.serverNow) && rtt < bestClockRtt * 1.3) {
      clockOffset = nextState.serverNow - (started + finished) / 2;
      bestClockRtt = Math.min(bestClockRtt, rtt);
    }
    networkFailures = 0;
    if (context.role === "host" && !nextState.access?.valid) { context.pin = ""; sessionStorage.removeItem("hochzeit-host"); state = null; loginMarkup("Bitte erneut anmelden."); return; }
    if (!acceptState(state, nextState)) return;
    const changed = !state || nextState.revision !== state.revision || nextState.access?.valid !== state.access?.valid || nextState.vote?.phase !== state.vote?.phase;
    state = nextState;
    if (context.role === "vote") voteChoice = state.vote?.choice || null;
    if (changed || deferredRender) {
      if (mapPointerActive || mapPendingSends) deferredRender = true;
      else { deferredRender = false; render(); }
    }
    connectionStatus(pendingHostMessage ? "Aktion wird noch bestätigt …" : "");
    if (context.role === "host" && (state.hostRevision !== lastBackupRevision || Date.now() - lastBackupAt > 30000)) void refreshBackup();
    if (context.role === "host" && pendingHostMessage && !hostSending) await deliverHostMessage();
  } catch {
    networkFailures++;
    connectionStatus(pendingHostMessage ? "Verbindung unterbrochen · Deine letzte Aktion bleibt gespeichert und wird erneut gesendet." : "Verbindung unterbrochen · Letzter bestätigter Stand. Verbindung wird erneut geprüft.");
  } finally { polling = false; schedulePoll(); }
}

async function hostSend(message) {
  if (pendingHostMessage || hostSending) { showToast("Bitte die Bestätigung der letzten Aktion abwarten."); return false; }
  pendingHostMessage = { ...message, actionId: actionId(), sessionId: state?.session.id, expectedHostRevision: state?.hostRevision, occurredAt: serverTime() };
  sessionStorage.setItem("hochzeit-pending", JSON.stringify(pendingHostMessage));
  if (["close", "game:discard", "game:restart", "quiz:next", "quiz:previous", "quiz:tiebreak:draw", "session:new"].includes(message.type)) await stopAudio();
  return deliverHostMessage();
}

async function deliverHostMessage() {
  if (!pendingHostMessage || hostSending) return false;
  hostSending = true;
  connectionStatus("Aktion wird gespeichert …");
  try {
    const { response, body } = await requestJson("/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pendingHostMessage) });
    if (response.status >= 500) throw new Error("Server unavailable");
    pendingHostMessage = null;
    sessionStorage.removeItem("hochzeit-pending");
    connectionStatus("");
    if (!response.ok) { showToast(errorMessage(body.error)); void poll(); return false; }
    if (acceptState(state, body.state)) state = body.state;
    render();
    void refreshBackup();
    return true;
  } catch {
    connectionStatus("Noch nicht bestätigt · Bitte warten. Die Aktion wird mit ihrem ursprünglichen Klickzeitpunkt erneut gesendet.");
    return false;
  } finally { hostSending = false; }
}

async function clientSend(endpoint, message) {
  if (clientSending) return false;
  clientSending = true;
  try {
    const { response, body } = await requestJson(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(message) });
    if (!response.ok) {
      if (body.error === "invalid_token") { state.access.valid = false; render(); }
      else showToast(errorMessage(body.error));
      return false;
    }
    if (acceptState(state, body.state)) state = body.state;
    if (context.role === "vote") voteChoice = state.vote?.choice || null;
    render();
    return true;
  } catch { showToast("Nicht bestätigt – Verbindung prüfen und erneut versuchen.", true); return false; }
  finally { clientSending = false; }
}

async function confirmMapPosition() {
  await mapPositionQueue;
  if (!mapPositionSaved) { showToast("Die letzte Position wurde nicht gespeichert. Bitte erneut auf die Karte tippen."); return false; }
  return clientSend("/api/map", { type: "map:confirm", team: context.team, token: context.token, roundId: state.map.roundId });
}

function render() {
  cancelAnimationFrame(timerFrame);
  if (!state) return;
  if (context.role === "host") return renderHost();
  if (context.role === "screen") return renderScreen();
  if (context.role === "buzzer") return renderBuzzer();
  if (!state.access?.valid) return renderInvalidToken();
  if (context.role === "pad") return renderPad();
  renderVoteClient();
  wireTimer();
}

function renderHost() {
  app.innerHTML = `<main class="shell"><div class="private-banner">${state.localMode ? "LOKAL · Spielstand wird auf diesem Laptop gespeichert" : "PRIVATE MODERATION"} · Beameransicht: <a href="/screen" target="hochzeit-screen">/screen öffnen</a></div>${hostHeader()}${state.view === "game" && state.active ? gameMarkup() : boardMarkup()}</main>`;
  if (state.view !== "game") {
    const flippedNow = new Set(Object.keys(state.flipped).filter((id) => state.flipped[id]));
    for (const id of knownFlips) if (!flippedNow.has(id)) knownFlips.delete(id);
    for (const id of flippedNow) knownFlips.add(id);
    boardReady = true;
    document.querySelectorAll(".tile.revealing").forEach((tile) => { const release = () => { tile.classList.remove("revealing"); tile.removeAttribute("aria-disabled"); }; tile.addEventListener("animationend", release, { once: true }); setTimeout(release, 700); });
  }
  wireMap(false); wireTimer();
}

function renderScreen() {
  const content = state.view === "game" && state.active ? screenGameMarkup() : boardMarkup(true);
  app.innerHTML = `<main class="shell screen-shell">${screenHeader()}${content}</main>`;
  boardReady = true;
  wireMap(false); wireTimer();
}

function screenHeader() {
  return `<header class="host-header screen-header"><div class="brand"><p class="eyebrow">ANTON &amp; KATHI</p>${showLogoMarkup("header-logo")}</div><div class="scoreboard"><div class="score rosa"><small>TEAM KATHI</small><strong>${state.scores.rosa}</strong></div><div class="score blau"><small>TEAM ANTON</small><strong>${state.scores.blau}</strong></div></div><div class="live-pill">LIVE · ${escapeHtml(state.session.label)}</div></header>`;
}

function screenGameMarkup() {
  const active = state.active;
  let content = `<p class="screen-wait">Die Moderation bereitet das Spiel vor.</p>`;
  if (active.kind === "map") content = state.map.done ? `${mapView(state.map, false)}${resultMarkup(state.map)}` : `<section class="screen-map-target"><p class="eyebrow">GESUCHTER ORT</p><h3 class="target-name">${escapeHtml(state.map.place.name)}</h3>${teamStatusMarkup(state.map)}<p class="screen-wait">Beide Teams setzen und bestätigen ihren Pin verdeckt. Danach löst die Karte automatisch auf.</p></section>`;
  else if (active.kind === "vote" || active.kind === "physical" && state.vote && (state.challenge.phase === "judging" || state.challenge.mode === "performance" || state.vote.revealed)) content = screenVoteMarkup();
  else if (active.kind === "physical") content = physicalMarkup(true);
  else if (active.kind === "quiz") content = quizMarkup(true);
  return `<section class="game-stage screen-game"><div class="game-content"><p class="game-kicker">${escapeHtml(active.cat)} · ${active.stars} SHOWPUNKTE</p><h2 class="game-title">${escapeHtml(active.title)}</h2><p class="game-description">${escapeHtml(active.text)}</p>${content}${active.kind === "physical" && state.vote && !state.vote.revealed && state.challenge.mode === "countdown" && state.challenge.phase !== "judging" ? screenVoteMarkup() : ""}</div></section>`;
}

function screenVoteMarkup() {
  const vote = state.vote;
  const question = voteQuestionMarkup(vote, "screen-vote-question");
  if (vote.revealed) return `<section class="screen-vote-phase revealed">${question}${barsMarkup(vote)}${revealedGuessesMarkup(vote)}<p class="recommendation">${escapeHtml(resultLabel(state.active.awarded))}</p></section>`;
  const guestUrl = vote.guestToken ? `${location.origin}/vote?t=${encodeURIComponent(vote.guestToken)}` : "";
  if (vote.phase === "closed") return `<section class="screen-vote-phase closed">${question}<div class="vote-count"><strong>${vote.n || 0}</strong><span>GÜLTIGE STIMMEN</span></div><h3 class="screen-vote-heading">ABSTIMMUNG GESCHLOSSEN</h3><p class="screen-wait">Keine weiteren Stimmen. Das Ergebnis wird gleich aufgelöst.</p></section>`;
  const preparing = vote.phase === "team" || vote.phase === "pending";
  const waitingText = vote.phase === "pending" ? "Zuerst beide Beiträge ansehen – die Abstimmung wird danach automatisch freigeschaltet." : "Die Teams geben zuerst ihre geheimen Prozenttipps ab. Auf dem Handy öffnet sich die Abstimmung automatisch.";
  return `<section class="screen-vote-phase ${preparing ? "preparing" : "voting"}">${question}<div class="screen-vote-layout">${guestUrl ? `<div class="qr-grid one screen-guest-qr">${qrCard("vote-qr", preparing ? "Jetzt scannen · Startet gleich" : "Jetzt abstimmen", guestUrl)}</div>` : `<p class="screen-wait">Abstimmungslink wird vorbereitet …</p>`}<div class="screen-vote-status"><p class="eyebrow">${preparing ? "GLEICH GEHT ES LOS" : "ABSTIMMUNG LÄUFT"}</p><h3 class="screen-vote-heading">${preparing ? "JETZT QR-CODE SCANNEN" : "JETZT ABSTIMMEN"}</h3>${preparing ? `<p>${waitingText}</p>` : `<div class="vote-count"><strong>${vote.n || 0}</strong><span>STIMMEN</span></div><output class="vote-deadline" data-vote-deadline="${vote.closesAt || ""}">30 SEKUNDEN</output>`}<p class="privacy-note">Zwischenstand und Teamtipps bleiben bis zur Auflösung geheim.</p></div></div></section>`;
}

function hostHeader() {
  const started = new Date(state.session.startedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  return `<header class="host-header"><div class="brand"><p class="eyebrow">ANTON &amp; KATHI</p>${showLogoMarkup("header-logo")}<div class="session-pill"><strong>${escapeHtml(state.session.label)}</strong><span>seit ${escapeHtml(started)}</span></div></div>
    <div class="scoreboard" aria-label="Spielstand"><div class="score rosa"><small>TEAM KATHI</small><strong>${state.scores.rosa}</strong></div><div class="score blau"><small>TEAM ANTON</small><strong>${state.scores.blau}</strong></div></div>
    <nav class="global-actions" aria-label="Show-Steuerung"><button class="icon-button" data-action="undo" ${state.history.canUndo ? "" : "disabled"} title="Letzte Moderator-Aktion rückgängig">↶ <span>Rückgängig</span></button><button class="icon-button" data-action="redo" ${state.history.canRedo ? "" : "disabled"} title="Aktion wiederholen">↷ <span>Wiederholen</span></button><button class="button secondary" data-action="score-dialog">Punktestand</button><button class="button secondary" data-action="backup">Sicherung speichern</button>${state.localMode ? `<button class="button secondary" data-action="restore">Sicherung laden</button><input id="backup-file" type="file" accept="application/json,.json" hidden>` : ""}<button class="button gold" data-action="new-session">Neue Show</button></nav></header>`;
}

function showLogoMarkup(className = "") {
  return `<div class="show-logo ${escapeHtml(className)}" role="img" aria-label="Schlag den Ehepartner"><span class="show-logo-wings" aria-hidden="true"></span><span class="show-logo-lockup"><span class="show-logo-small">Schlag den</span><span class="show-logo-title">Ehepartner</span></span><span class="show-logo-rings" aria-hidden="true"><i></i><i></i></span></div>`;
}

function boardMarkup(readOnly = false) {
  const categories = ["Aktion", "Party", "Raten", "Abstimmung"];
  return `<section class="board" aria-label="Spieltafel">${categories.map((category) => `<div class="category"><h2 class="category-title">${category}</h2>${state.cards.filter((card) => card.cat === category).map((card) => {
    const flipped = Boolean(state.flipped[card.id]); const completed = state.completed?.[card.id]; const running = state.active?.id === card.id && !completed; const revealing = flipped && !completed && !running && boardReady && !knownFlips.has(card.id);
    const label = completed ? `${card.title}, erledigt: ${resultLabel(completed.result)}` : running ? `${card.title}, läuft, fortsetzen` : flipped ? `${card.title} starten` : `${card.stars} Punkte aufdecken`;
    const resultClass = completed ? `completed-${completed.result}` : "";
    return `<button class="tile ${flipped ? "flipped" : ""} ${completed ? "completed" : ""} ${resultClass} ${running ? "running" : ""} ${revealing ? "revealing" : ""}" ${readOnly || completed ? "disabled" : 'data-action="flip"'} data-id="${card.id}" ${revealing ? 'aria-disabled="true"' : ""} aria-label="${escapeHtml(label)}"><span class="tile-inner"><span class="tile-face tile-front"><span class="points">${card.stars}</span></span><span class="tile-face tile-back"><span class="tile-title">${escapeHtml(card.title)}</span>${completed ? `<span class="completed-badge">✓ ERLEDIGT · ${escapeHtml(resultLabel(completed.result))}</span>` : running ? `<span class="running-badge">● LÄUFT · FORTSETZEN</span>` : `<span class="open-badge">ANTIPPEN ZUM STARTEN</span>`}</span></span></button>`;
  }).join("")}</div>`).join("")}</section>${readOnly ? "" : `<div class="board-footer"><p>ERSTER KLICK: AUFDECKEN · ANDERE KARTE: VORHERIGE KLAPPT ZU · ZWEITER KLICK: STARTEN · ERLEDIGTE KARTEN BLEIBEN OFFEN</p><button class="button secondary compact" data-action="board-reset">Nur ungespielte Karten zudecken</button></div>`}`;
}

function gameMarkup() {
  const active = state.active;
  const content = active.kind === "map" ? hostMapMarkup() : active.kind === "vote" ? hostVoteMarkup() : active.kind === "quiz" ? quizMarkup() : physicalMarkup();
  return `<section class="game-stage"><div class="game-content"><div class="game-toolbar"><button class="button secondary" data-action="close">← Spieltafel · Stand bleibt gespeichert</button><button class="button secondary" data-action="restart" ${active.awarded ? "disabled" : ""}>Spiel neu starten</button>${!active.awarded ? `<button class="button danger" data-action="discard">Spiel verwerfen</button>` : ""}${state.map || state.vote ? `<button class="button secondary" data-action="qr">${state.vote ? "Gäste-QR erneuern" : "QR-Codes erneuern"}</button>` : ""}</div><p class="game-kicker">${escapeHtml(active.cat)} · ${active.stars} ${active.stars === 1 ? "SHOWPUNKT" : "SHOWPUNKTE"}</p><h2 class="game-title">${escapeHtml(active.title)}</h2><p class="game-description">${escapeHtml(active.text)}</p>${content}${winnerMarkup()}</div></section>`;
}

function physicalMarkup(readOnly = false) {
  const card = activeCardDefinition(); const challenge = state.challenge; let controls = "";
  if (!readOnly && card.audienceDecision && (challenge.phase === "judging" || state.vote?.revealed)) return hostVoteMarkup();
  if (challenge.mode === "stopwatch" || challenge.mode === "countdown") controls = timerMarkup(challenge.timer, readOnly || challenge.phase === "finished");
  if (challenge.mode === "team-relay") controls = relayMarkup(card, challenge, readOnly);
  if (challenge.mode === "performance") controls = performanceMarkup(challenge, readOnly);
  if (challenge.mode === "team-rounds") controls = teamRoundsMarkup(card, challenge, readOnly);
  if (challenge.mode === "pullups") controls = pullupsMarkup(challenge, readOnly);
  if (challenge.mode === "counter") controls = counterMarkup(card, challenge, readOnly);
  if (challenge.mode === "measurement") controls = measurementMarkup(challenge, readOnly);
  const gate = !challenge.ready ? readOnly ? `<p class="screen-wait">Material-, Fairness- und Sicherheitscheck läuft.</p>` : `<section class="setup-gate"><p class="eyebrow">PFLICHTCHECK VOR DEM START</p><p>Material identisch, Regeln erklärt, sichere Fläche geprüft und alle Teilnehmenden freiwillig bereit?</p><button class="button gold big" data-action="physical-ready">✓ SETUP &amp; SICHERHEIT BESTÄTIGEN</button></section>` : `<p class="ready-banner">✓ SETUP UND SICHERHEIT BESTÄTIGT</p>`;
  return `<div class="brief-grid"><article class="brief-card"><p class="eyebrow">VORBEREITUNG</p>${listMarkup(card.setup)}</article><article class="brief-card"><p class="eyebrow">REGELN</p>${listMarkup(card.rules)}</article></div>${gate}${challenge.ready ? controls : ""}<article class="decision-card"><p class="eyebrow">ENTSCHEIDUNG</p><p>${escapeHtml(card.decision)}</p></article>`;
}

function relayMarkup(card, challenge, readOnly = false) {
  const relay = challenge.relay;
  const team = relay.order[relay.index];
  const round = relay.rounds[team];
  const tracked = relay.trackProgress !== false;
  const progress = `<div class="relay-summary">${["rosa", "blau"].map((candidate) => { const item = relay.rounds[candidate]; const waiting = item.timer.runningSince !== null ? "ZEIT LÄUFT" : "BEREIT"; return `<span class="${candidate}"><b>Team ${teamName(candidate)}</b><strong>${item.done ? formatTime(item.timer.elapsedMs) : tracked ? `${item.progress} / ${relay.target} ${escapeHtml(relay.unit)}` : waiting}</strong></span>`; }).join("")}</div>`;
  if (challenge.phase === "finished") return `<section class="control-arena"><p class="eyebrow">BEIDE TEAMLÄUFE BEENDET</p>${progress}<h3>${escapeHtml(resultLabel(challenge.result))}</h3></section>`;
  const running = round.timer.runningSince !== null;
  const unitLabel = card.id === "aktion-2" ? `PERSON ${Math.min(relay.target, round.progress + 1)} VON ${relay.target}` : `${round.progress} VON ${relay.target} GÜLTIG`;
  const progressMeter = tracked ? `<div class="relay-progress"><strong>${unitLabel}</strong><div style="--progress:${round.progress / relay.target * 100}%"><i></i></div></div>` : `<div class="relay-progress relay-stop-note"><strong>NEUTRALE PERSON ZÄHLT LAUT BIS ${relay.target}</strong><p>Die Moderation stoppt hier exakt bei der ${relay.target}. gültigen Wiederholung.</p></div>`;
  const runningControls = tracked
    ? `<div class="button-row centered"><button class="counter-button" data-action="relay-change" data-delta="-1" ${round.progress <= 0 ? "disabled" : ""}>−</button><button class="button ${team} big" data-action="relay-change" data-delta="1">PERSON HAT DAS HEMD AN- UND WIEDER AUSGEZOGEN${round.progress + 1 >= relay.target ? " · ZEIT STOPPEN" : ""}</button></div>`
    : `<button class="button gold big" data-action="relay-finish">BEI DER ${relay.target}. GÜLTIGEN WIEDERHOLUNG STOPPEN</button>`;
  return `<section class="control-arena relay-arena"><p class="eyebrow">TEAMLAUF ${relay.index + 1} VON 2</p><h3 class="active-team ${team}">TEAM ${teamName(team).toUpperCase()}</h3>${timerMarkup(round.timer, true)}${progress}${progressMeter}${readOnly ? `<p class="screen-wait">${running ? tracked ? "Die Teamzeit läuft. Person für Person, bis alle zehn das Hemd vollständig an- und wieder ausgezogen haben." : `Die Teamzeit läuft bis zur ${relay.target}. gültigen Wiederholung.` : "Die Moderation startet den Lauf gleich bei 00:00.0."}</p>` : running ? runningControls : `<button class="button gold big" data-action="relay-start">STOPPUHR FÜR TEAM ${teamName(team).toUpperCase()} BEI 00:00.0 STARTEN</button>`}</section>`;
}

function performanceMarkup(challenge, readOnly = false) {
  const performance = challenge.performance;
  const team = performance.order[performance.index];
  const status = `<div class="relay-summary">${["rosa", "blau"].map((candidate) => `<span class="${candidate}"><b>Team ${teamName(candidate)}</b><strong>${performance.performed[candidate] ? "✓ Witz erzählt" : "wartet"}</strong></span>`).join("")}</div>`;
  return `<section class="control-arena performance-arena"><p class="eyebrow">WITZ ${performance.index + 1} VON 2</p><h3 class="active-team ${team}">TEAM ${teamName(team).toUpperCase()} IST DRAN</h3>${status}${readOnly ? `<p class="screen-wait">Erst beide Witze anhören. Der öffentliche QR-Code kann schon jetzt gescannt werden.</p>` : `<button class="button ${team} big" data-action="performance-done">WITZ VOLLSTÄNDIG ERZÄHLT ${performance.index === 1 ? "· ABSTIMMUNG ÖFFNEN" : ""}</button>`}</section>`;
}

function teamRoundsMarkup(card, challenge, readOnly = false) {
  const game = challenge.teamRounds;
  const team = game.order[game.index];
  const round = game.rounds[team];
  const running = round.timer.runningSince !== null;
  const terms = card.termSets?.[team] || [];
  const currentTerm = terms[round.termIndex] || "Alle Begriffe gespielt";
  const summary = `<div class="relay-summary">${["rosa", "blau"].map((candidate) => `<span class="${candidate}"><b>Team ${teamName(candidate)}</b><strong>${game.rounds[candidate].correct} richtig${game.rounds[candidate].done ? " ✓" : ""}</strong></span>`).join("")}</div>`;
  if (challenge.phase === "finished") return `<section class="control-arena"><p class="eyebrow">BEIDE PANTOMIME-RUNDEN BEENDET</p>${summary}<h3>${escapeHtml(resultLabel(challenge.result))}</h3></section>`;
  return `<section class="control-arena team-round-arena"><p class="eyebrow">TEAMRUNDE ${game.index + 1} VON 2</p><h3 class="active-team ${team}">TEAM ${teamName(team).toUpperCase()}</h3>${timerMarkup(round.timer, true)}${summary}${readOnly ? `<p class="screen-wait">Der aktuelle Begriff bleibt nur bei der Moderation sichtbar.</p>` : running ? `<div class="secret-term"><span>AKTUELLER GEHEIMER BEGRIFF</span><strong>${escapeHtml(currentTerm)}</strong><small>${round.termIndex + 1} / ${terms.length}</small></div><div class="button-row centered"><button class="button ${team} big" data-action="team-round-correct">✓ RICHTIG</button><button class="button secondary big" data-action="team-round-skip">ÜBERSPRINGEN</button><button class="button gold" data-action="team-round-finish">RUNDE NACH 60 SEKUNDEN BEENDEN</button></div>` : `<button class="button gold big" data-action="team-round-start">60-SEKUNDEN-RUNDE FÜR TEAM ${teamName(team).toUpperCase()} STARTEN</button>`}</section>`;
}

function pullupsMarkup(challenge, readOnly = false) {
  const pullups = challenge.pullups; const attempt = pullups.attempts[pullups.index];
  const progress = `<div class="attempt-progress">${pullups.attempts.map((item, index) => `<span class="${item.team} ${item.status}">${index + 1}. ${teamName(item.team)} ${item.person}: <strong>${item.reps}</strong></span>`).join("")}</div>`;
  if (challenge.phase === "finished") return `<section class="control-arena"><p class="eyebrow">VIER VERSUCHE BEENDET</p>${progress}<h3 class="pullup-total">Kathi ${challenge.counters.rosa} : ${challenge.counters.blau} Anton</h3></section>`;
  return `<section class="control-arena pullup-arena"><p class="eyebrow">VERSUCH ${pullups.index + 1} VON ${pullups.attempts.length}</p><h3 class="active-team ${attempt.team}">TEAM ${teamName(attempt.team).toUpperCase()} · PERSON ${attempt.person}</h3><strong class="attempt-reps">${attempt.reps}</strong>${progress}${readOnly ? "" : attempt.status === "active" ? `<form class="pullup-actions" data-pullups-result><label>Gültige Klimmzüge dieses Versuchs<input name="reps" type="number" inputmode="numeric" min="0" max="99" step="1" required value="${attempt.reps || ""}"></label><button class="button gold big" type="submit">ANZAHL SPEICHERN · VERSUCH BEENDEN</button></form><p>Eine Person zählt laut. Die Gesamtzahl erst nach dem Versuch eintragen; null ist möglich.</p>` : `<button class="button gold big" data-action="pullups-start">SPOTTER BEREIT · VERSUCH STARTEN</button>`}</section>`;
}

function timerMarkup(timer, readOnly = false) {
  const running = timer.runningSince !== null;
  const audienceDecision = activeCardDefinition()?.audienceDecision;
  const finish = !readOnly && !state.challenge.result ? timer.mode === "stopwatch" && running ? resultButtons("ZIEL BESTÄTIGEN", "physical-finish") : timer.mode === "countdown" ? `<div class="countdown-finish" data-countdown-finish>${audienceDecision ? `<button class="button gold big" data-action="showcase-finish">ZEIT BEENDET · GÄSTEVOTING ÖFFNEN</button>` : resultButtons("ERGEBNIS FESTLEGEN", "physical-finish")}</div>` : "" : "";
  return `<section class="control-arena"><p class="eyebrow">${timer.mode === "countdown" ? "COUNTDOWN" : "STOPPUHR"}</p><output class="show-timer" data-timer-display data-mode="${timer.mode}" data-elapsed="${timer.elapsedMs}" data-running="${timer.runningSince ?? ""}" data-duration="${timer.durationMs ?? ""}">00:00.0</output>${readOnly ? "" : `<div class="button-row centered"><button class="button gold big" data-action="timer" data-timer="${running ? "pause" : "start"}">${running ? "PAUSE" : timer.elapsedMs ? "WEITER" : "STOPPUHR STARTEN"}</button><button class="button secondary big" data-action="timer" data-timer="reset">ZURÜCKSETZEN</button></div>${finish}`}</section>`;
}

function resultButtons(title, action) {
  return `<p class="eyebrow result-heading">${title}</p><div class="button-row centered"><button class="button rosa big" data-action="${action}" data-team="rosa">Kathi</button><button class="button blau big" data-action="${action}" data-team="blau">Anton</button><button class="button secondary big" data-action="${action}" data-team="draw">Gleichstand</button></div>`;
}

function counterMarkup(card, challenge, readOnly = false) {
  const target = card.target ? `<span class="target-chip">Ziel: ${card.target}</span>` : `<span class="target-chip">Höchste Summe</span>`;
  const calculated = challenge.counters.rosa === challenge.counters.blau ? "draw" : challenge.counters.rosa > challenge.counters.blau ? "rosa" : "blau";
  return `<section class="control-arena"><div class="control-heading"><p class="eyebrow">GÜLTIGE WIEDERHOLUNGEN</p>${target}</div><div class="team-control-grid">${["rosa", "blau"].map((team) => `<article class="team-counter ${team}"><span>TEAM ${teamName(team).toUpperCase()}</span><strong>${challenge.counters[team]}</strong>${readOnly ? "" : `<div><button class="counter-button" data-action="counter" data-team="${team}" data-delta="-1" aria-label="Eins abziehen">−</button><button class="counter-button primary" data-action="counter" data-team="${team}" data-delta="1" ${challenge.phase === "finished" || card.target && challenge.counters[team] >= card.target ? "disabled" : ""} aria-label="Gültige Wiederholung hinzufügen">+</button></div>`}</article>`).join("")}</div>${!readOnly && !card.target && !challenge.result && (challenge.counters.rosa || challenge.counters.blau) ? `<button class="button gold big finish-count" data-action="physical-finish" data-team="${calculated}">ALLE VERSUCHE BEENDET · AUSWERTEN</button>` : ""}</section>`;
}

function measurementMarkup(challenge, readOnly = false) {
  return `<section class="control-arena"><p class="eyebrow">GEWICHTE EINTRAGEN</p><div class="team-control-grid">${["rosa", "blau"].map((team) => {
    const value = challenge.measurements[team]; const difference = value.left !== null && value.right !== null ? `${formatNumber(Math.abs(value.left - value.right))} g Unterschied` : "Noch nicht gewogen";
    return `<form class="measure-card ${team}" data-measurement="${team}"><h3>Team ${teamName(team)}</h3><div class="measure-inputs"><label>Hälfte 1<input name="left" type="number" min="0.1" max="10000" step="0.1" required value="${value.left ?? ""}" ${readOnly || challenge.phase === "finished" ? "disabled" : ""}><span>g</span></label><label>Hälfte 2<input name="right" type="number" min="0.1" max="10000" step="0.1" required value="${value.right ?? ""}" ${readOnly || challenge.phase === "finished" ? "disabled" : ""}><span>g</span></label></div><strong>${difference}</strong>${readOnly ? "" : `<button class="button secondary" type="submit" ${challenge.phase === "finished" ? "disabled" : ""}>Messung speichern</button>`}</form>`;
  }).join("")}</div>${!readOnly && [challenge.measurements.rosa.left, challenge.measurements.rosa.right, challenge.measurements.blau.left, challenge.measurements.blau.right].every((value) => value > 0) && challenge.phase !== "finished" ? `<button class="button gold big" data-action="measurement-resolve">VERDECKTE MESSUNGEN AUFLÖSEN &amp; WERTEN</button>` : ""}</section>`;
}

function quizMarkup(readOnly = false) {
  const card = activeCardDefinition(); const challenge = state.challenge; const phase = challenge.phase; const section = phase === "tie" ? challenge.tie : challenge.main; const rounds = phase === "tie" ? card.tieBreak : card.rounds; const round = rounds[section.index]; const revealed = Boolean(section.revealed[section.index]); const mark = section.marks[section.index] || { rosa: null, blau: null }; const scores = quizScores();
  if (section.complete) return quizSummaryMarkup(card, challenge, scores, readOnly);
  const scored = typeof mark.rosa === "boolean" && typeof mark.blau === "boolean";
  const marking = readOnly ? "" : phase === "tie" ? tieJudgeMarkup(challenge) : `<div class="mark-grid">${["rosa", "blau"].map((team) => `<div class="mark-team ${team}"><b>Team ${teamName(team)}</b><div class="mark-actions"><button class="mark-button ${mark[team] === true ? "selected correct" : ""}" data-action="quiz-mark" data-team="${team}" data-correct="true">✓ Richtig</button><button class="mark-button ${mark[team] === false ? "selected wrong" : ""}" data-action="quiz-mark" data-team="${team}" data-correct="false">✕ Falsch</button></div></div>`).join("")}</div>`;
  const ready = section.ready?.[section.index] || { rosa: false, blau: false };
  const lockControls = phase === "main" ? `<p class="privacy-note">Antworten verdeckt notieren. Erst wenn beide feststehen, gemeinsam aufdecken.</p><div class="guess-status">${["rosa", "blau"].map((team) => `<span class="${team}">Team ${teamName(team)}: <button class="mark-button ${ready[team] ? "selected" : ""}" data-action="quiz-ready" data-team="${team}" ${ready[team] ? "disabled" : ""}>${ready[team] ? "✓ Antwort liegt fest" : "Antwort liegt fest"}</button></span>`).join("")}</div><button class="button gold big reveal-answer" data-action="quiz-reveal" ${ready.rosa && ready.blau ? "" : "disabled"}>BEIDE ANTWORTEN AUFDECKEN</button>` : `${buzzMarkup(challenge, round)}${challenge.buzz ? `<button class="button gold big reveal-answer" data-action="quiz-reveal">STECHANTWORT AUFDECKEN</button>` : ""}`;
  const navigation = phase === "main" ? `<div class="round-navigation"><button class="button secondary" data-action="quiz-previous" ${section.index === 0 ? "disabled" : ""}>← Vorherige</button><button class="button gold" data-action="quiz-next" ${revealed && scored ? "" : "disabled"}>${section.index === rounds.length - 1 ? "Auswertung" : "Nächste Runde →"}</button></div>` : "";
  return `<section class="quiz-arena"><header class="round-header"><div><p class="eyebrow">${phase === "tie" ? "STECHEN PER ZURUF" : `RUNDE ${section.index + 1} VON ${rounds.length}`}</p><div class="round-dots">${rounds.map((_, index) => `<span class="${index < section.index ? "done" : index === section.index ? "current" : ""}"></span>`).join("")}</div></div><div class="mini-score"><span class="rosa">Kathi <strong>${scores.rosa}</strong></span><span class="blau">Anton <strong>${scores.blau}</strong></span></div></header>${quizMediaMarkup(round, revealed, readOnly)}<h3 class="quiz-prompt">${escapeHtml(round.prompt)}</h3>${revealed ? `<div class="answer-reveal"><span>RICHTIGE ANTWORT</span><strong>${escapeHtml(round.answer)}</strong></div>${marking}` : readOnly ? `<p class="screen-wait">${phase === "tie" ? "Antwort ausrufen. Die Moderation entscheidet, wer zuerst dran war." : "Beide Teams legen ihre Antwort verdeckt fest."}</p>` : lockControls}${readOnly ? "" : navigation}</section>`;
}

function tieJudgeMarkup(challenge) {
  if (!challenge.buzz) return "";
  const buzzing = challenge.buzz.team;
  const other = buzzing === "rosa" ? "blau" : "rosa";
  return `<section class="tie-judge"><p class="eyebrow">ANTWORT VON TEAM ${teamName(buzzing).toUpperCase()}</p><div class="button-row centered"><button class="button ${buzzing} big" data-action="quiz-tiebreak-judge" data-correct="true">✓ RICHTIG · ${teamName(buzzing).toUpperCase()} GEWINNT</button><button class="button ${other} big" data-action="quiz-tiebreak-judge" data-correct="false">✕ FALSCH · ${teamName(other).toUpperCase()} GEWINNT</button></div></section>`;
}

function quizSummaryMarkup(card, challenge, scores, readOnly = false) {
  const tie = scores.rosa === scores.blau;
  if (challenge.phase === "main" && tie) return `<section class="result-card"><p class="eyebrow">NACH ${card.rounds.length} RUNDEN</p><h3>${scores.rosa} : ${scores.blau} – Gleichstand</h3><p>Im Stechen die Antwort ausrufen. Die Moderation entscheidet, wer zuerst dran war. Bei falscher Antwort gewinnt das andere Team.</p>${readOnly ? "" : `<button class="button gold big" data-action="quiz-tiebreak">STECHFRAGE ZEIGEN</button>`}</section>`;
  const recommendation = quizRecommendation();
  return `<section class="result-card"><p class="eyebrow">SPIELERGEBNIS</p><h3>Kathi ${scores.rosa} : ${scores.blau} Anton</h3><p>${escapeHtml(recommendation.text)}</p></section>`;
}

function quizMediaMarkup(round, revealed, readOnly = false) {
  if (round.media === "melody") return `<div class="media-stage melody-stage"><div class="sound-bars" aria-hidden="true">${Array.from({ length: 12 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}</div>${readOnly ? `<p>Die Hörprobe wird von der Moderation abgespielt.</p>` : `<button class="button gold big" data-action="play-melody">▶ HÖRPROBE ABSPIELEN</button><p>Lautsprecher vor der Runde testen. Beim Rundenwechsel stoppt die Hörprobe.</p>`}</div>`;
  if (round.media === "plate") return `<div class="media-stage plate-stage"><img src="${escapeHtml(round.asset)}" alt="Deutsches Nummernschild für diese Raterunde"></div>`;
  if (round.media === "photo") { const x = round.sprite.column * 50; const y = round.sprite.row * 100; const detail = round.detail || { scale: 4.8, x: 50, y: 50 }; return `<div class="media-stage photo-stage"><div class="photo-window"><div class="photo-sprite ${revealed ? "revealed" : "zoomed"}" style="background-position:${x}% ${y}%;--detail-scale:${detail.scale};--detail-x:${detail.x}%;--detail-y:${detail.y}%"></div></div><span>${revealed ? "GANZES MOTIV" : "MIKRO-AUSSCHNITT"}</span></div>`; }
  return `<div class="media-stage question-stage"><span>?</span></div>`;
}

function buzzMarkup(challenge) {
  if (challenge.buzz) return `<div class="buzz-result ${challenge.buzz.team}"><span>ZUERST DRAN</span><strong>TEAM ${teamName(challenge.buzz.team).toUpperCase()}</strong><p>Antwort erst laut nennen lassen, dann aufdecken und werten.</p><button class="button secondary" data-action="quiz-buzz-reset">Team-Auswahl korrigieren</button></div>`;
  return `<p class="privacy-note">Antwort ausrufen! Du entscheidest, wer zuerst dran war. Erst die Antwort anhören, dann das Team auswählen.</p><div class="buzz-grid"><button class="button rosa big" data-action="quiz-call" data-team="rosa">KATHI WAR ZUERST</button><button class="button blau big" data-action="quiz-call" data-team="blau">ANTON WAR ZUERST</button></div><button class="button secondary" data-action="quiz-tie-draw">NIEMAND WEISS ES · KEINE PUNKTE</button>`;
}

function winnerMarkup() {
  if (state.active.awarded) { const labels = { draw: "Unentschieden – keine Punkte", both: `Beide Teams · je +${state.active.stars}`, rosa: `Team Kathi gewinnt · +${state.active.stars}`, blau: `Team Anton gewinnt · +${state.active.stars}` }; return `<div class="winner-panel"><p class="awarded">✓ ${labels[state.active.awarded]}</p></div>`; }
  const readiness = resultReadiness();
  if (!readiness.ready) return `<div class="winner-panel locked"><p class="eyebrow">PUNKTEVERGABE</p><p>${escapeHtml(readiness.text)}</p></div>`;
  if (state.active.kind !== "physical") return `<div class="winner-panel locked"><p class="eyebrow">AUTOMATISCHE WERTUNG</p><p>Das Ergebnis wird aus dem Spielablauf berechnet und automatisch vergeben.</p></div>`;
  const result = state.challenge.result;
  if (result === "draw" && ["stopwatch", "team-relay", "pullups"].includes(state.challenge.mode)) return `<div class="winner-panel"><p class="eyebrow">GLEICHSTAND · KURZES STECHEN</p><p>Stechen nach der Spielregel durchführen und den Sieger eintragen.</p><div class="button-row centered"><button class="button rosa big" data-action="physical-tiebreak" data-team="rosa">KATHI GEWINNT DAS STECHEN</button><button class="button blau big" data-action="physical-tiebreak" data-team="blau">ANTON GEWINNT DAS STECHEN</button><button class="button secondary" data-action="winner" data-team="draw">OHNE PUNKTE ABSCHLIESSEN</button></div></div>`;
  const buttonClass = result === "rosa" ? "rosa" : result === "blau" ? "blau" : result === "both" ? "both" : "secondary";
  return `<div class="winner-panel"><p class="eyebrow">ERGEBNIS BESTÄTIGEN</p><p class="recommendation"><strong>${escapeHtml(resultLabel(result))}</strong> wurde aus dem abgeschlossenen Ablauf ermittelt.</p><button class="button ${buttonClass} big" data-action="winner" data-team="${result}">ERGEBNIS ÜBERNEHMEN${result === "draw" ? " · KEINE PUNKTE" : ` · +${state.active.stars}`}</button></div>`;
}

function resultReadiness() {
  if (state.active.kind === "physical") return state.challenge.result && state.challenge.phase === "finished" ? { ready: true, recommendation: resultLabel(state.challenge.result) } : { ready: false, text: "Erst den geführten Spielablauf abschließen; vorher können keine Punkte vergeben werden." };
  if (state.active.kind === "map") return state.map.complete ? { ready: true, recommendation: mapRecommendation().label } : { ready: false, text: `Erst alle ${state.map.roundCount} Kartenrunden abschließen.` };
  if (state.active.kind === "vote") return state.vote.revealed ? { ready: true, recommendation: voteRecommendation().label } : { ready: false, text: "Erst Teamtipps, Gästestimmen und Auflösung abschließen." };
  if (!state.challenge.main.complete) return { ready: false, text: "Erst alle fünf Runden werten." };
  const scores = quizScores();
  if (scores.rosa !== scores.blau) return { ready: true, recommendation: scores.rosa > scores.blau ? "Team Kathi" : "Team Anton" };
  if (state.challenge.phase !== "tie" || !state.challenge.tie.complete) return { ready: false, text: "Bei Gleichstand erst das Stechen abschließen." };
  return { ready: true, recommendation: quizRecommendation().label };
}

function physicalRecommendation() {
  const challenge = state.challenge;
  if (challenge.mode === "counter") { if (challenge.counters.rosa === challenge.counters.blau) return challenge.counters.rosa ? "Aktuell Gleichstand" : "Werte während des Spiels mitzählen"; return challenge.counters.rosa > challenge.counters.blau ? "Aktuell Team Kathi" : "Aktuell Team Anton"; }
  if (challenge.mode === "measurement") { const r = measurementDifference("rosa"); const b = measurementDifference("blau"); if (r === null || b === null) return "Erst beide Messungen speichern"; if (r === b) return "Gleichstand"; return r < b ? "Team Kathi" : "Team Anton"; }
  return "Nach den angegebenen Entscheidungsregeln werten";
}

function quizRecommendation() {
  const scores = quizScores();
  if (scores.rosa !== scores.blau) return { label: scores.rosa > scores.blau ? "Team Kathi" : "Team Anton", text: `${Math.max(scores.rosa, scores.blau)} richtige Antworten entscheiden das Spiel.` };
  let rosa = 0; let blau = 0; for (const mark of Object.values(state.challenge.tie.marks || {})) { if (mark.rosa) rosa++; if (mark.blau) blau++; }
  if (rosa !== blau) return { label: rosa > blau ? "Team Kathi" : "Team Anton", text: "Das Stechen entscheidet das Spiel." };
  if (rosa > 0 && blau > 0 && state.challenge.buzz) return { label: `Team ${teamName(state.challenge.buzz.team)}`, text: `Beide Antworten waren richtig; der erste Buzzer kam nach ${formatTime(state.challenge.buzz.elapsedMs)}.` };
  return { label: "Keine Punkte", text: "Auch das Stechen endete ohne eindeutige richtige Antwort." };
}

function hostMapMarkup() {
  const map = state.map; const rosaUrl = `${location.origin}/pad/rosa?t=${encodeURIComponent(map.tokens.rosa)}`; const blauUrl = `${location.origin}/pad/blau?t=${encodeURIComponent(map.tokens.blau)}`;
  return `<div class="round-banner"><strong>RUNDE ${map.round + 1} / ${map.roundCount}</strong><span>Rundensiege: Kathi ${map.totals.rosaWins} · Anton ${map.totals.blauWins}${map.totals.draws ? ` · ${map.totals.draws} unentschieden` : ""}</span></div><div class="map-panel"><div>${mapView(map, false)}${map.done ? resultMarkup(map) : ""}</div><aside class="map-side"><p class="eyebrow">GESUCHTER ORT</p><h3 class="target-name">${escapeHtml(map.place.name)}</h3><label class="select-label">Ort dieser Runde<select class="place-picker" data-place aria-label="Ort auswählen" ${map.hasTaps || map.done ? "disabled" : ""}>${state.places.map((place) => `<option value="${place.id}" ${place.id === map.place.id ? "selected" : ""}>${escapeHtml(place.name)}</option>`).join("")}</select></label>${teamStatusMarkup(map)}${map.done && !map.complete ? `<button class="button gold" data-action="map-next">NÄCHSTE RUNDE →</button>` : !map.done ? `<p class="auto-resolve-note">Die Runde löst automatisch auf, sobald beide Teams bestätigt haben.</p>` : ""}</aside></div><div class="qr-grid">${qrCard("rosa", "iPad Team Kathi", rosaUrl)}${qrCard("blau", "iPad Team Anton", blauUrl)}</div>`;
}

function mapView(map, interactive) {
  const markers = ["rosa", "blau"].map((team) => map.taps[team] ? pinMarkup(map.taps[team], team) : "").join(""); const target = map.done ? pinMarkup(map.place, "target") : "";
  return `<div class="map-shell" data-map-key="${escapeHtml(`${map.place.id}-${map.round}-${map.done ? "result" : "guess"}`)}"><div class="map-viewport" id="map-viewport"><div class="map-wrap ${interactive ? "interactive" : ""}" id="world-map" aria-label="Zoombare unbeschriftete Weltkarte">${markers}${target}</div></div><div class="map-zoom-controls" aria-label="Kartenzoom"><button type="button" data-map-zoom="out" aria-label="Herauszoomen">−</button><output data-map-zoom-label>100%</output><button type="button" data-map-zoom="in" aria-label="Hineinzoomen">+</button><button type="button" data-map-zoom="fit">ANPASSEN</button></div></div>`;
}

function pinMarkup(point, team) {
  const left = (Number(point.lng) + 180) / 360 * 100; const top = (90 - Number(point.lat)) / 180 * 100;
  return `<span class="map-pin ${team}" style="left:${left}%;top:${top}%" aria-label="${team === "target" ? "Ziel" : `Position Team ${team}`}"></span>`;
}

function teamStatusMarkup(map) {
  return `<div class="status-list">${["rosa", "blau"].map((team) => `<div class="team-status ${team}"><span>TEAM ${teamName(team).toUpperCase()}</span><strong>${map.done ? formatDistance(map.result[`${team}Km`]) : map.locks[team] ? "BESTÄTIGT" : map.taps[team] ? "POSITIONIERT" : "WARTET"}</strong></div>`).join("")}</div>`;
}

function resultMarkup(map) {
  const winner = map.result.rosaKm === map.result.blauKm ? "Runde unentschieden" : map.result.rosaKm === null ? "Anton gewinnt die Runde" : map.result.blauKm === null ? "Kathi gewinnt die Runde" : map.result.rosaKm < map.result.blauKm ? "Kathi gewinnt die Runde" : "Anton gewinnt die Runde";
  return `<div class="map-result"><p class="eyebrow">TATSÄCHLICHE POSITION · ${escapeHtml(map.place.detail)}</p><h3>${winner}</h3><div class="distance-grid"><span class="rosa">Kathi <strong>${formatDistance(map.result.rosaKm)}</strong></span><span class="blau">Anton <strong>${formatDistance(map.result.blauKm)}</strong></span></div>${map.complete ? `<p>${escapeHtml(mapRecommendation().text)}</p>` : ""}</div>`;
}

function mapRecommendation() {
  const totals = state.map.totals;
  if (totals.rosaWins !== totals.blauWins) return totals.rosaWins > totals.blauWins ? { label: "Team Kathi", text: `Kathi gewinnt ${totals.rosaWins}:${totals.blauWins} Runden.` } : { label: "Team Anton", text: `Anton gewinnt ${totals.blauWins}:${totals.rosaWins} Runden.` };
  if (totals.rosaKm !== totals.blauKm) return totals.rosaKm < totals.blauKm ? { label: "Team Kathi", text: `Bei gleichen Rundensiegen entscheidet die kleinere Gesamtdistanz: ${totals.rosaKm} km.` } : { label: "Team Anton", text: `Bei gleichen Rundensiegen entscheidet die kleinere Gesamtdistanz: ${totals.blauKm} km.` };
  return { label: "Keine Punkte", text: "Rundensiege und Gesamtdistanz sind gleich." };
}

function hostVoteMarkup() {
  const vote = state.vote; const guestUrl = `${location.origin}/vote?t=${encodeURIComponent(vote.tokens.guests)}`;
  const question = voteQuestionMarkup(vote);
  if (vote.phase === "team") return `<section class="vote-host">${question}<p class="eyebrow">1 · BEIDE PROZENTTIPPS BEI DER MODERATION</p><p class="privacy-note">🔒 Beide Teams nennen ausschließlich den geschätzten Prozentanteil für Antwort A. Beide Eingaben werden gemeinsam gespeichert und bleiben bis zur Auflösung geheim.</p>${hostVoteGuessesMarkup(vote)}<button class="button gold big" data-action="vote-open" ${vote.guessStatus.rosa && vote.guessStatus.blau ? "" : "disabled"}>30-SEKUNDEN-GÄSTEVOTING ÖFFNEN</button></section>`;
  if (vote.phase === "voting") return `<section class="vote-host">${question}<p class="eyebrow">2 · GÄSTE STIMMEN AB</p><div class="vote-count"><strong>${vote.n}</strong><span>STIMMEN</span></div><output class="vote-deadline" data-vote-deadline="${vote.closesAt || ""}">00:30</output><div class="qr-grid one">${qrCard("vote-qr", "Gäste-Abstimmung", guestUrl)}</div><button class="button secondary" data-action="vote-extend">WEITERE 30 SEKUNDEN AB JETZT</button><p>Mindestens ${vote.minVotes} Stimmen. Nach 30 Sekunden schließt die Abstimmung automatisch.</p>${vote.n >= vote.minVotes ? `<button class="button gold big" data-action="vote-close">ABSTIMMUNG SCHLIESSEN</button>` : `<button class="button danger" data-action="vote-close" data-force="true">Vorzeitig schließen (${vote.n}/${vote.minVotes})</button>`}</section>`;
  if (vote.phase === "closed") return `<section class="vote-host">${question}<p class="eyebrow">3 · ABSTIMMUNG GESCHLOSSEN</p><div class="vote-count"><strong>${vote.n}</strong><span>GÜLTIGE STIMMEN</span></div><p>Keine weiteren Stimmen werden angenommen. Teamtipps und Verteilung sind noch verdeckt.</p><button class="button gold big" data-action="vote-reveal" ${vote.n ? "" : "disabled"}>ERGEBNIS AUFLÖSEN &amp; AUTOMATISCH WERTEN</button><button class="button secondary" data-action="vote-extend">${vote.n ? "NOCHMALS 30 SEKUNDEN ÖFFNEN" : "NOCH KEINE STIMMEN · ERNEUT 30 SEKUNDEN ÖFFNEN"}</button></section>`;
  return `<section class="vote-host">${question}<p class="eyebrow">4 · ERGEBNIS</p>${barsMarkup(vote)}${vote.guessMode === "direct" ? "" : `<div class="guess-reveal"><span class="rosa">Kathi: <strong>${escapeHtml(formatVoteGuess(vote, vote.guesses.rosa))}</strong></span><span class="blau">Anton: <strong>${escapeHtml(formatVoteGuess(vote, vote.guesses.blau))}</strong></span></div>`}<p class="recommendation"><strong>${escapeHtml(resultLabel(state.active.awarded))}</strong> · automatisch aus ${vote.n} Stimmen berechnet.</p></section>`;
}

function hostVoteGuessesMarkup(vote) {
  return `<form class="prediction-form combined-predictions" data-host-vote-guesses><div class="host-guess-grid">${["rosa", "blau"].map((team) => { const saved = vote.guesses?.[team]; return `<section class="host-guess-panel ${team}"><p>Team ${teamName(team)}</p><label>Anteil für „${escapeHtml(vote.a)}“<input name="${team}Percent" type="number" min="0" max="100" inputmode="numeric" value="${saved?.percent ?? ""}" required><span>%</span></label><small>${saved ? "✓ gemeinsam gespeichert · bis zum Öffnen änderbar" : "noch nicht gespeichert"}</small></section>`; }).join("")}</div><button class="button gold big" type="submit">BEIDE PROZENTTIPPS GEMEINSAM SPEICHERN</button></form>`;
}

function voteRecommendation() {
  const vote = state.vote;
  if (vote.result) return { label: resultLabel(vote.result), text: "Automatisch aus den gesperrten Teamtipps und dem geschlossenen Voting berechnet." };
  if (vote.counts.a === vote.counts.b) return { label: "Keine Punkte", text: "Die Gäste stimmen unentschieden." };
  const majority = vote.counts.a > vote.counts.b ? "a" : "b"; const rosa = vote.guesses.rosa === majority; const blau = vote.guesses.blau === majority;
  if (rosa && blau) return { label: "Beide Teams", text: "Beide Tipps treffen die Mehrheit." };
  if (rosa) return { label: "Team Kathi", text: "Kathis Tipp trifft die Mehrheit." };
  if (blau) return { label: "Team Anton", text: "Antons Tipp trifft die Mehrheit." };
  return { label: "Keine Punkte", text: "Kein Tipp trifft die Mehrheit." };
}

function revealedGuessesMarkup(vote) {
  if (!vote.revealed || vote.guessMode !== "percentage" || !vote.guesses) return "";
  const total = vote.counts.a + vote.counts.b;
  const actual = total ? vote.counts.a / total * 100 : 0;
  return `<div class="guess-reveal"><span>Kathi: <strong>${formatVoteGuess(vote, vote.guesses.rosa)}</strong></span><span>Anton: <strong>${formatVoteGuess(vote, vote.guesses.blau)}</strong></span><span>Tatsächlich: <strong>${formatNumber(actual)} % ${escapeHtml(vote.a)}</strong></span></div>`;
}

function formatVoteGuess(vote, guess) {
  if (!guess) return "–";
  if (vote.guessMode === "choice") return guess === "a" ? vote.a : vote.b;
  return `${guess.percent} % ${vote.a}`;
}

function voteQuestionMarkup(vote, className = "") {
  return `<section class="vote-prompt ${escapeHtml(className)}"><p class="eyebrow">GESUCHT</p><h3>${escapeHtml(vote.q)}</h3><div class="vote-question"><span>A</span><strong>${escapeHtml(vote.a)}</strong><span>B</span><strong>${escapeHtml(vote.b)}</strong></div></section>`;
}

function qrCard(kind, label, url) {
  const image = `/api/qr?u=${encodeURIComponent(url.replace(location.origin, ""))}`;
  return `<article class="qr-card ${kind}"><img src="${image}" alt="QR-Code ${escapeHtml(label)}"><strong>${escapeHtml(label)}</strong><span>Mit dem passenden Gerät scannen</span></article>`;
}

function barsMarkup(vote) { const total = Math.max(1, vote.counts.a + vote.counts.b); return `<div class="bars">${barRow(vote.a, vote.counts.a, total, "a")}${barRow(vote.b, vote.counts.b, total, "b")}</div>`; }
function barRow(label, count, total, choice) { return `<div class="bar-row"><span>${choice.toUpperCase()} · ${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${count / total * 100}%"></div></div><strong>${count}</strong></div>`; }

function renderInvalidToken() { app.innerHTML = `<main class="client-shell"><section class="scan-again"><p class="eyebrow">VERBINDUNG ABGELAUFEN</p><h1>Bitte neu scannen</h1><p>Die Moderation hat einen neuen QR-Code erzeugt oder das Spiel beendet.</p></section></main>`; }

function renderBuzzer() {
  app.innerHTML = `<main class="client-shell"><section class="client-stage"><h1>Wir spielen per Zuruf</h1><p>Kein Handy-Buzzer nötig. Die Moderation entscheidet, wer zuerst dran war.</p></section></main>`;
}

function renderPad() {
  const map = state.map; const locked = Boolean(map.locks[context.team]);
  app.innerHTML = `<main class="client-shell"><section class="client-stage"><header class="client-head"><div><p class="eyebrow">RUNDE ${map.round + 1} / ${map.roundCount} · WO LIEGT DAS?</p><h1 class="client-title">${escapeHtml(map.place.name)}</h1></div><span class="team-badge ${context.team}">TEAM ${teamName(context.team).toUpperCase()}</span></header>${mapView(map, !locked && !map.done)}${map.done ? `${resultMarkup(map)}${!map.complete ? `<p class="client-wait">Wartet auf die nächste Runde …</p>` : `<p class="client-wait">Alle Runden abgeschlossen.</p>`}` : `<button class="button ${context.team} big pad-lock" data-action="map-confirm" ${!map.taps[context.team] || locked ? "disabled" : ""}>${locked ? "✓ POSITION BESTÄTIGT" : "POSITION BESTÄTIGEN"}</button><p class="room centered-text">${locked ? "POSITION BESTÄTIGT · WARTET AUF DAS ANDERE TEAM" : "ANTIPPEN: PIN SETZEN · BEI ZOOM ZIEHEN: KARTE VERSCHIEBEN · DAS ANDERE TEAM SIEHT DEN PIN ERST NACH DER AUFLÖSUNG"}</p>`}</section></main>`;
  wireMap(true);
}

function wireMap(interactive) {
  const viewport = document.querySelector("#map-viewport");
  const map = document.querySelector("#world-map");
  const shell = document.querySelector(".map-shell");
  if (!viewport || !map || !shell) return;
  const cameraKey = shell.dataset.mapKey || "map";
  if (mapCamera.key !== cameraKey) mapCamera = { key: cameraKey, scale: 1, x: 0, y: 0 };
  const canPlace = Boolean(interactive && context.role === "pad" && !state.map.done && !state.map.locks[context.team]);
  const pointers = new Map();
  let gesture = null;

  const clampCamera = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    mapCamera.scale = Math.max(1, Math.min(MAP_MAX_SCALE, mapCamera.scale));
    mapCamera.x = Math.max(width * (1 - mapCamera.scale), Math.min(0, mapCamera.x));
    mapCamera.y = Math.max(height * (1 - mapCamera.scale), Math.min(0, mapCamera.y));
  };
  const applyCamera = () => {
    clampCamera();
    map.style.transform = `translate3d(${mapCamera.x}px, ${mapCamera.y}px, 0) scale(${mapCamera.scale})`;
    map.style.setProperty("--pin-scale", String(1 / mapCamera.scale));
    document.querySelector("[data-map-zoom-label]").textContent = `${Math.round(mapCamera.scale * 100)}%`;
    shell.classList.toggle("zoomed", mapCamera.scale > 1.01);
  };
  const zoomAt = (nextScale, clientX, clientY) => {
    const rect = viewport.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const baseX = (pointX - mapCamera.x) / mapCamera.scale;
    const baseY = (pointY - mapCamera.y) / mapCamera.scale;
    mapCamera.scale = Math.max(1, Math.min(MAP_MAX_SCALE, nextScale));
    mapCamera.x = pointX - baseX * mapCamera.scale;
    mapCamera.y = pointY - baseY * mapCamera.scale;
    applyCamera();
  };

  const queuePosition = (point) => {
    const roundId = state.map.roundId;
    const token = context.token;
    mapPositionSaved = false;
    mapPendingSends++;
    mapPositionQueue = mapPositionQueue.then(async () => {
      const { response, body } = await requestJson("/api/map", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "map:tap", team: context.team, token, roundId, ...point }) });
      if (!response.ok) { mapPositionSaved = false; if (body.error === "invalid_token") { state = { access: { role: "pad", team: context.team, valid: false } }; render(); } else showToast("Position konnte nicht gespeichert werden. Bitte erneut tippen."); return false; }
      if (acceptState(state, body.state)) state = body.state;
      mapPositionSaved = true;
      return true;
    }).catch(() => { mapPositionSaved = false; showToast("Position nicht gespeichert. Bitte erneut tippen.", true); return false; }).finally(() => { mapPendingSends--; });
    return mapPositionQueue;
  };
  const place = (clientX, clientY) => {
    if (!canPlace) return;
    const rect = viewport.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, (clientX - rect.left - mapCamera.x) / mapCamera.scale));
    const y = Math.max(0, Math.min(rect.height, (clientY - rect.top - mapCamera.y) / mapCamera.scale));
    const point = { lat: 90 - y / rect.height * 180, lng: x / rect.width * 360 - 180 };
    map.querySelector(`.map-pin.${context.team}`)?.remove(); map.insertAdjacentHTML("beforeend", pinMarkup(point, context.team)); document.querySelector(".pad-lock")?.removeAttribute("disabled");
    queuePosition(point);
  };
  const finishInteraction = () => {
    if (pointers.size) return;
    gesture = null;
    void mapPositionQueue.finally(() => {
      mapPointerActive = false;
      if (deferredRender) { deferredRender = false; void poll(); }
    });
  };
  const pointerPoint = (event) => ({ x: event.clientX, y: event.clientY });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  viewport.addEventListener("pointerdown", (event) => {
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, pointerPoint(event));
    mapPointerActive = true;
    if (pointers.size === 1) {
      gesture = { type: "single", start: pointerPoint(event), cameraX: mapCamera.x, cameraY: mapCamera.y, moved: false };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", distance: Math.max(1, distance(a, b)), midpoint: midpoint(a, b), scale: mapCamera.scale, cameraX: mapCamera.x, cameraY: mapCamera.y };
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointerPoint(event));
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      if (gesture?.type !== "pinch") gesture = { type: "pinch", distance: Math.max(1, distance(a, b)), midpoint: midpoint(a, b), scale: mapCamera.scale, cameraX: mapCamera.x, cameraY: mapCamera.y };
      const currentMid = midpoint(a, b);
      const nextScale = Math.max(1, Math.min(MAP_MAX_SCALE, gesture.scale * distance(a, b) / gesture.distance));
      const rect = viewport.getBoundingClientRect();
      const startX = gesture.midpoint.x - rect.left;
      const startY = gesture.midpoint.y - rect.top;
      const baseX = (startX - gesture.cameraX) / gesture.scale;
      const baseY = (startY - gesture.cameraY) / gesture.scale;
      mapCamera.scale = nextScale;
      mapCamera.x = currentMid.x - rect.left - baseX * nextScale;
      mapCamera.y = currentMid.y - rect.top - baseY * nextScale;
      applyCamera();
      return;
    }
    if (gesture?.type === "single") {
      const dx = event.clientX - gesture.start.x;
      const dy = event.clientY - gesture.start.y;
      if (Math.hypot(dx, dy) > 7) gesture.moved = true;
      if (gesture.moved && mapCamera.scale > 1) {
        mapCamera.x = gesture.cameraX + dx;
        mapCamera.y = gesture.cameraY + dy;
        applyCamera();
      }
    }
  });
  const endPointer = (event, cancelled = false) => {
    if (!pointers.has(event.pointerId)) return;
    const wasPinch = pointers.size > 1 || gesture?.type === "pinch";
    const shouldPlace = !cancelled && !wasPinch && gesture?.type === "single" && !gesture.moved;
    pointers.delete(event.pointerId);
    if (shouldPlace) place(event.clientX, event.clientY);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      gesture = { type: "single", start: remaining, cameraX: mapCamera.x, cameraY: mapCamera.y, moved: true };
    }
    finishInteraction();
  };
  viewport.addEventListener("pointerup", (event) => endPointer(event));
  viewport.addEventListener("pointercancel", (event) => endPointer(event, true));
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(mapCamera.scale * (event.deltaY < 0 ? 1.22 : 1 / 1.22), event.clientX, event.clientY);
  }, { passive: false });
  shell.querySelectorAll("[data-map-zoom]").forEach((button) => button.addEventListener("click", () => {
    const command = button.dataset.mapZoom;
    if (command === "fit") { mapCamera.scale = 1; mapCamera.x = 0; mapCamera.y = 0; applyCamera(); return; }
    const rect = viewport.getBoundingClientRect();
    zoomAt(mapCamera.scale * (command === "in" ? 1.35 : 1 / 1.35), rect.left + rect.width / 2, rect.top + rect.height / 2);
  }));
  applyCamera();
}

function renderVoteClient() {
  const vote = state.vote;
  const waiting = vote.guessMode === "direct" ? "Erst beide Beiträge ansehen. Danach wird die Abstimmung hier automatisch freigeschaltet." : "Die Teams geben zuerst ihre geheimen Prozenttipps ab. Gleich geht es los.";
  app.innerHTML = `<main class="client-shell"><section class="client-stage"><header class="client-head"><div><p class="eyebrow">GÄSTE-ABSTIMMUNG</p><h1 class="client-title">${escapeHtml(vote.q)}</h1></div></header>${vote.open && !vote.revealed ? `<output class="vote-deadline" data-vote-deadline="${vote.closesAt}"></output><div class="vote-buttons"><button class="vote-choice ${voteChoice === "a" ? "selected" : ""}" data-action="vote" data-choice="a"><small>A</small>${escapeHtml(vote.a)}</button><button class="vote-choice ${voteChoice === "b" ? "selected" : ""}" data-action="vote" data-choice="b"><small>B</small>${escapeHtml(vote.b)}</button></div><p class="room centered-text">DEINE STIMME KANN BIS ZUM ENDE DER ABSTIMMUNG GEÄNDERT WERDEN</p>` : vote.revealed ? `<p class="awarded">ABSTIMMUNG BEENDET</p>${barsMarkup(vote)}` : `<div class="vote-count"><strong>${vote.phase === "closed" ? "✓" : "?"}</strong><span>${vote.phase === "closed" ? "ABSTIMMUNG GESCHLOSSEN" : "WARTET AUF START"}</span></div><p class="game-description">${vote.phase === "closed" ? "Die Moderation zeigt gleich das Ergebnis oder öffnet die Abstimmung erneut." : waiting}</p>`}</section></main>`;
}

function wireTimer() {
  const deadline = document.querySelector("[data-vote-deadline]");
  if (deadline) {
    const updateDeadline = () => { const left = Math.max(0, Number(deadline.dataset.voteDeadline) - serverTime()); deadline.textContent = `${String(Math.ceil(left / 1000)).padStart(2, "0")} SEKUNDEN`; deadline.classList.toggle("finished", left <= 0); if (left <= 0 && state.vote?.open) { state.vote.open = false; state.vote.phase = "closed"; render(); return; } timerFrame = requestAnimationFrame(updateDeadline); };
    updateDeadline(); return;
  }
  const output = document.querySelector("[data-timer-display]"); if (!output) return;
  const update = () => { const elapsedBase = Number(output.dataset.elapsed); const runningSince = Number(output.dataset.running); const duration = Number(output.dataset.duration); const elapsed = elapsedBase + (runningSince ? Math.max(0, serverTime() - runningSince) : 0); const value = output.dataset.mode === "countdown" ? Math.max(0, duration - elapsed) : elapsed; const finished = output.dataset.mode === "countdown" && value <= 0; output.textContent = formatTime(value); output.classList.toggle("finished", finished); document.querySelector("[data-countdown-finish]")?.classList.toggle("ready", finished); if (runningSince) timerFrame = requestAnimationFrame(update); };
  update();
}

async function playMelody(melody) {
  if (!melody?.notes) return;
  if (audioContext) await audioContext.close().catch(() => {});
  const AudioContext = window.AudioContext || window.webkitAudioContext; audioContext = new AudioContext(); await audioContext.resume(); const beat = 60 / melody.tempo; let cursor = audioContext.currentTime + 0.08; const master = audioContext.createGain(); master.gain.value = 0.17; master.connect(audioContext.destination);
  for (const [note, beats] of melody.notes) { const duration = beat * beats; if (note !== "R") { const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.type = "triangle"; oscillator.frequency.value = noteFrequency(note); oscillator.connect(gain); gain.connect(master); gain.gain.setValueAtTime(0.001, cursor); gain.gain.exponentialRampToValueAtTime(0.72, cursor + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, cursor + Math.max(0.06, duration - 0.035)); oscillator.start(cursor); oscillator.stop(cursor + duration); } cursor += duration; }
  showToast("Melodie läuft …");
  clearTimeout(audioStopTimer);
  const durationMs = Math.max(100, Math.ceil((cursor - audioContext.currentTime) * 1000));
  audioStopTimer = setTimeout(async () => {
    await stopAudio();
  }, durationMs);
}

async function stopAudio() {
  clearTimeout(audioStopTimer);
  audioStopTimer = 0;
  if (!audioContext) return;
  await audioContext.close().catch(() => {});
  audioContext = null;
}

function noteFrequency(note) {
  const match = /^([A-G])([#b]?)(\d)$/.exec(note); if (!match) return 440; const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }; let midi = (Number(match[3]) + 1) * 12 + semitones[match[1]]; if (match[2] === "#") midi++; if (match[2] === "b") midi--; return 440 * 2 ** ((midi - 69) / 12);
}

function activeCardDefinition() { return state.cards.find((card) => card.id === state.active.id); }
function currentQuizRound() { const card = activeCardDefinition(); const section = state.challenge.phase === "tie" ? state.challenge.tie : state.challenge.main; return (state.challenge.phase === "tie" ? card.tieBreak : card.rounds)[section.index]; }
function quizScores() { const scores = { rosa: 0, blau: 0 }; for (const mark of Object.values(state.challenge.main.marks || {})) { if (mark.rosa) scores.rosa++; if (mark.blau) scores.blau++; } return scores; }
function measurementDifference(team) { const item = state.challenge.measurements[team]; return item.left === null || item.right === null ? null : Math.abs(item.left - item.right); }
function resultLabel(result) { return ({ rosa: "Team Kathi gewinnt", blau: "Team Anton gewinnt", both: "Beide Teams gewinnen", draw: "Keine Punkte" })[result] || "Erledigt"; }
function teamName(team) { return TEAM_NAMES[team] || team; }
function listMarkup(items = []) { return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`; }
function formatDistance(value) { return value === null ? "–" : `${Number(value).toLocaleString("de-DE", { maximumFractionDigits: Number(value) < 100 ? 1 : 0 })} km`; }
function formatNumber(value) { return Number(value).toLocaleString("de-DE", { maximumFractionDigits: 1 }); }
function formatTime(value) { const total = Math.max(0, Number(value) || 0); const minutes = Math.floor(total / 60000); const seconds = Math.floor(total % 60000 / 1000); const tenths = Math.floor(total % 1000 / 100); return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`; }
function openScoreDialog() { document.querySelector("#score-rosa").value = state.scores.rosa; document.querySelector("#score-blau").value = state.scores.blau; scoreDialog.showModal(); }
function openSessionDialog() { document.querySelector("#session-label").value = `Show ${state.session.number + 1}`; document.querySelector("#session-confirm").value = ""; sessionDialog.showModal(); }
function errorMessage(error) { return ({ stale_session: "Diese Aktion gehört zu einer früheren Show. Bitte neu laden.", invalid_action_time: "Gerätezeit stimmt nicht. Bitte neu laden und erneut versuchen.", timer_finished: "Die 60 Sekunden sind vorbei. Bitte die Runde beenden.", no_votes: "Noch keine Stimmen. Bitte die Abstimmung erneut öffnen.", bad_reps: "Bitte eine ganze Zahl von 0 bis 99 eingeben.", already_awarded: "Dieses Spiel ist bereits gewertet. Zum Ändern bitte Rückgängig verwenden.", card_completed: "Diese Karte ist bereits erledigt und bleibt gesperrt.", card_still_flipping: "Die Karte klappt noch um – danach erneut antippen.", another_game_active: "Ein anderes Spiel läuft noch. Bitte zuerst fortsetzen oder ausdrücklich verwerfen.", setup_not_confirmed: "Bitte zuerst Setup und Sicherheit bestätigen.", result_not_ready: "Das Spiel ist noch nicht regelkonform abgeschlossen.", result_mismatch: "Dieses Ergebnis passt nicht zum gespeicherten Spielverlauf.", guesses_missing: "Bitte zuerst die beiden angesagten Teamtipps speichern.", answers_not_locked: "Beide Teamantworten müssen zuerst feststehen.", round_not_scored: "Bitte beide Teams ausdrücklich als richtig oder falsch werten.", nothing_to_undo: "Es gibt nichts rückgängig zu machen.", nothing_to_redo: "Es gibt nichts zu wiederholen.", round_not_revealed: "Bitte zuerst die Antwort aufdecken.", tiebreak_not_needed: "Das Stechen ist nur bei Gleichstand nötig.", position_locked: "Diese Position ist bereits gesperrt.", stale_round: "Diese Eingabe gehört zu einer früheren Kartenrunde.", stale_revision: "Der Stand wurde inzwischen auf einem anderen Gerät geändert. Bitte erneut versuchen.", vote_closed: "Diese Abstimmung ist bereits geschlossen.", vote_not_closed: "Bitte die Abstimmung zuerst verbindlich schließen.", quorum_missing: "Noch nicht genug Stimmen. Falls wirklich nötig, bewusst vorzeitig schließen." })[error] || "Aktion gerade nicht möglich."; }
function showToast(message, sticky = false) { const toast = document.querySelector("#toast"); if (!toast) return; toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); if (!sticky) toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

if (context.role === "host" || context.role === "screen") {
  for (const src of ["/world.jpg", "/media/foto-raten-sprite.png"]) { const preload = new Image(); preload.src = src; }
}
if (context.role === "host" && !context.pin) loginMarkup(); else poll();
schedulePoll();
window.addEventListener("online", () => { networkFailures = 0; void poll(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) void poll(); });
