/** Open/closed per section, remembered (the lab's key, so the migration keeps the user's state). */
const KEY = 'lab.properties-groups';

function read(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function rememberedOpen(id: string): boolean | undefined {
  return read()[id];
}

export function rememberOpen(id: string, open: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: open }));
  } catch {
    /* the choice is a convenience only */
  }
}
