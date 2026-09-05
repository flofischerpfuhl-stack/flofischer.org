import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { freshState, hydrateState } from "./game.mjs";

export async function openLocalStore(file) {
  let data;
  try { data = hydrateState(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Spielstand konnte nicht gelesen werden: ${file}. Datei sichern und prüfen.`, { cause: error });
    data = freshState();
  }
  let tail = Promise.resolve();
  const save = async next => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  };
  await save(data);
  return {
    get data() { return data; },
    mutate(mutator) {
      const run = tail.then(async () => {
        const next = structuredClone(data);
        const result = mutator(next);
        if (!result.ok) return result;
        await save(next);
        data = next;
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}
