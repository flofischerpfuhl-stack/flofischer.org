/**
 * UI copy rules (owner 2026-11-06: „kein Programm hat so lange Erklärungen in Popups. da ist eine
 * kurze Bezeichnung, kein Halbsatz"): a tooltip is a name and its key; menu items are names.
 */

/** The tooltip text of a control: its name, and its key when it has one ("Undo · Ctrl+Z"). */
export function tip(name: string, key?: string): string {
  return key ? `${name} · ${key}` : name;
}

/**
 * A name, not a half-sentence: no dash, no semicolon, at most four words (the key after " · " does
 * not count). The same rule as ui-check `code`.
 */
export function isShortName(text: string): boolean {
  const name = text.split(' · ')[0] ?? '';
  return !/ — |; /.test(name) && name.trim().split(/\s+/).length <= 4;
}
