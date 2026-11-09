/**
 * The groups of a field's `>` menu (Trimble Access, BUILDER-BEHAVIOR §12; owner 2026-11-06:
 * „hinter jedem Feld … ein ‚>'-Button … von wo man einen Wert übernehmen will"), always in this
 * order: what the value means (one checked), where it can be taken from, what can be calculated
 * from it, recent values.
 */
export type FieldMenuKind = 'meaning' | 'take' | 'calculate' | 'recent';

export const FIELD_MENU_ORDER: readonly FieldMenuKind[] = [
  'meaning',
  'take',
  'calculate',
  'recent',
];

/** Fixed headings; the meaning group is titled by what it chooses (its `title`). */
export const FIELD_MENU_TITLE: Readonly<Record<FieldMenuKind, string>> = {
  meaning: 'Meaning',
  take: 'Take from',
  calculate: 'Calculate',
  recent: 'Recent',
};

export interface FieldMenuItem {
  readonly id: string;
  /** A name, not a half-sentence. */
  readonly label: string;
  /** Meaning group only: the current meaning. */
  readonly checked?: boolean | undefined;
  /** Why it does nothing right now (it stays, disabled). */
  readonly disabled?: string | undefined;
  /** Quiet text at the row's end (a recent value's unit). */
  readonly hint?: string | undefined;
  /** A name for what the label abbreviates („Right angle" for +100 gon). */
  readonly tip?: string | undefined;
  readonly onSelect?: (() => void) | undefined;
}

export interface FieldMenuGroup {
  readonly kind: FieldMenuKind;
  /** The meaning group's heading (e.g. "Direction"); the others have fixed headings. */
  readonly title?: string | undefined;
  readonly items: readonly FieldMenuItem[];
}
