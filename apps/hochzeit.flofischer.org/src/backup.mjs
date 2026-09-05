import { hydrateState, SCHEMA_VERSION, CARDS } from "./game.mjs";

export function exportBackup(data) {
  const state = structuredClone(data);
  delete state.history;
  return { format: "hochzeit-show-backup", version: 1, savedAt: Date.now(), state };
}

export function restoreBackup(backup) {
  const s = backup?.state;
  if (backup?.format !== "hochzeit-show-backup" || backup.version !== 1 || !s || s.schemaVersion !== SCHEMA_VERSION || !/^[a-f0-9]{32}$/i.test(s.session?.id || "") || ![s.scores?.rosa, s.scores?.blau].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) throw new Error("invalid_backup");
  if (s.active && !CARDS.some(c => c.id === s.active.id)) throw new Error("invalid_backup");
  if (s.active?.kind === "physical" && !s.challenge || s.active?.kind === "quiz" && !s.challenge || s.active?.kind === "map" && !s.map || s.active?.kind === "vote" && !s.vote) throw new Error("invalid_backup");
  return hydrateState({ ...s, history: { past: [], future: [] } });
}
