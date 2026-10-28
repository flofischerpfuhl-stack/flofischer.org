/**
 * Fernwork Games · in-game help: the "How to play" card of every game and the one-time mechanic tips.
 *
 * The card (core.js mountHelp) shows a game's goal, its controls for touch and for mouse and keyboard (the device in
 * use first) and a few rules, each with a small drawing (GLYPHS: inline SVG, no files). It opens by itself the first
 * time a game is played and afterwards from the "?" buttons.
 *
 * Tips are data: TIPS[gameId] = [{ id, g, text | { touch, keys }, when(session, ctx), done?(session, ctx) }].
 *   order = priority: when several tips are due together, the earlier one in the list shows first
 *   when  → true once the mechanic is on screen (or about to be); the tip then shows once, ever, as a small banner
 *   done  → true when the player already uses the mechanic; the tip is then retired without showing (no nagging)
 *   ctx   = { t: seconds of play in this level, mode: 'touch' | 'keys', level: level index }
 * core.js checks the predicates four times a second while a level runs. A game can also ask for a tip directly with
 * env.hint(id) (env is the second argument of game.create). Predicates read the session's own fields; a renamed field
 * only silences a tip (every check runs in a try/catch), it never breaks a game.
 *
 * Seen tips and the first-start card are remembered in localStorage (fw:games:help).
 */
// ─────────────────────────────── remembered state ───────────────────────────────
const STORE = 'fw:games:help';
let cache = null; // read once per page (the tips are checked four times a second)
const state = () => {
  if (cache) return cache;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* blocked storage: nothing remembered */ }
  cache = s && typeof s === 'object' ? { intro: {}, tips: {}, off: false, ...s } : { intro: {}, tips: {}, off: false };
  return cache;
};
const save = (s) => { cache = s; try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode: kept for this visit */ } };
export const introSeen = (gameId) => { const s = state(); return !!(s.intro[gameId] || s.intro['*']); };
export function markIntro(gameId) { const s = state(); s.intro[gameId] = Date.now(); save(s); }
export const tipSeen = (gameId, tipId) => !!state().tips[`${gameId}:${tipId}`];
export function markTip(gameId, tipId) { const s = state(); s.tips[`${gameId}:${tipId}`] = Date.now(); save(s); }
export const tipsOn = () => !state().off;
export function setTipsOn(on) { const s = state(); s.off = !on; save(s); }
/** Forget the first-start card and every seen tip (for a game, or all games). */
export function resetHelp(gameId) {
  const s = state();
  if (!gameId) { save({ intro: {}, tips: {}, off: s.off }); return; }
  delete s.intro[gameId];
  for (const k of Object.keys(s.tips)) if (k.startsWith(gameId + ':')) delete s.tips[k];
  save(s);
}

// ─────────────────────────────── drawings (viewBox 0 0 40 40) ───────────────────────────────
// Lines use currentColor (the card's text colour, so both themes work); fills are mid-tone colours that read on light
// and dark cards alike.
const C = { yellow: '#eab308', orange: '#f97316', red: '#ef4444', blue: '#3b82f6', sky: '#7dd3fc', green: '#22c55e', teal: '#14b8a6', purple: '#a855f7', grey: '#94a3b8', brown: '#a16207', gold: '#f59e0b' };
const finger = (x, y) => `<path d="M${x} ${y}v-9a2.2 2.2 0 0 1 4.4 0v6l5.2 1.1a2.6 2.6 0 0 1 2 3l-1.2 6.4h-9.6l-3.8-5.2a2 2 0 0 1 3-2.6z" fill="var(--surface-overlay, #fff)"/>`;
export const GLYPHS = {
  // input
  stick: `<circle cx="20" cy="20" r="13" stroke-dasharray="3 3"/><circle cx="26" cy="15" r="5.5" fill="${C.blue}" stroke="none"/><path d="M20 20l5-4.2" />`,
  drag: `<path d="M6 10h28M30 6l4 4-4 4M10 6l-4 4 4 4"/>${finger(17, 25)}`,
  tap: `<circle cx="19.2" cy="14" r="6" stroke="${C.blue}"/><circle cx="19.2" cy="14" r="10.5" stroke="${C.blue}" opacity=".45"/>${finger(17, 25)}`,
  hold: `<circle cx="19.2" cy="14" r="7" fill="${C.blue}" opacity=".35" stroke="none"/>${finger(17, 25)}`,
  mouse: `<rect x="11" y="5" width="18" height="30" rx="9"/><path d="M20 5v11M11 16h18"/>`,
  'mouse-l': `<rect x="11" y="5" width="18" height="30" rx="9"/><path d="M20 5v11M11 16h18"/><path d="M20 5.2a9 9 0 0 0-8.8 9V16H20z" fill="${C.blue}" stroke="none"/>`,
  'mouse-r': `<rect x="11" y="5" width="18" height="30" rx="9"/><path d="M20 5v11M11 16h18"/><path d="M20 5.2a9 9 0 0 1 8.8 9V16H20z" fill="${C.yellow}" stroke="none"/>`,
  'mouse-move': `<rect x="14" y="9" width="12" height="20" rx="6"/><path d="M20 9v7M3 19h7M30 19h7M6 16l-3 3 3 3M34 16l3 3-3 3"/>`,
  // shared
  goal: `<path d="M11 35V6"/><path d="M11 7h18l-4 6 4 6H11z" fill="${C.green}"/>`,
  star: `<path d="M20 5l4.4 9 9.6 1.3-7 6.7 1.8 9.6L20 27l-8.8 4.6 1.8-9.6-7-6.7 9.6-1.3z" fill="${C.gold}" stroke="none"/>`,
  boss: `<path d="M8 30l-2-16 8 6 6-11 6 11 8-6-2 16z" fill="${C.red}"/><path d="M8 34h24"/>`,
  warn: `<circle cx="20" cy="20" r="13" fill="${C.red}" opacity=".25" stroke="${C.red}" stroke-dasharray="4 3"/><path d="M20 13v9M20 27v.5" stroke-width="3"/>`,
  // Bounce Brigade
  tank: `<rect x="8" y="16" width="22" height="14" rx="3" fill="${C.green}"/><circle cx="19" cy="23" r="4.5"/><path d="M22 20l12-7"/>`,
  bounce: `<path d="M34 5v30" stroke-width="3"/><path d="M6 31l27-13L8 8" stroke-dasharray="3 3"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/>`,
  mine: `<circle cx="20" cy="22" r="8" fill="${C.yellow}"/><path d="M20 8v4M20 32v4M6 22h4M30 22h4M10 12l3 3M30 12l-3 3"/><circle cx="20" cy="22" r="2.4" fill="${C.red}" stroke="none"/>`,
  clash: `<path d="M5 20h9M26 20h9"/><circle cx="17" cy="20" r="3" fill="currentColor"/><circle cx="23" cy="20" r="3" fill="currentColor"/><path d="M20 9v5M20 26v5M13 12l3 3M27 12l-3 3M13 28l3-3M27 28l-3-3" stroke="${C.orange}"/>`,
  crate: `<rect x="8" y="8" width="24" height="24" rx="2" fill="${C.brown}"/><path d="M8 8l24 24M32 8L8 32"/>`,
  pit: `<ellipse cx="20" cy="22" rx="14" ry="8" fill="currentColor" opacity=".7"/><path d="M5 12q7-6 15 0t15 0" stroke-dasharray="3 3"/>`,
  ice: `<rect x="6" y="10" width="28" height="20" rx="3" fill="${C.sky}"/><path d="M12 24l16-8M20 15l3 3" /><path d="M30 30l6 4" />`,
  vent: `<rect x="8" y="22" width="24" height="12" rx="2" fill="${C.orange}"/><path d="M14 18q-3-5 0-10M20 18q-3-5 0-10M26 18q-3-5 0-10" stroke="${C.red}"/>`,
  rocket: `<path d="M8 28l18-14" stroke-width="3"/><path d="M26 14l6-4-2 7z" fill="${C.teal}"/><path d="M4 31l4-3" stroke="${C.orange}"/>`,
  ghost: `<path d="M10 34V18a10 10 0 0 1 20 0v16l-4-3-3 3-3-3-3 3-3-3z" fill="currentColor" opacity=".18"/><circle cx="16" cy="19" r="1.6" fill="currentColor"/><circle cx="24" cy="19" r="1.6" fill="currentColor"/>`,
  // Fern Rangers
  squad: `<circle cx="13" cy="26" r="4" fill="${C.green}"/><circle cx="20" cy="22" r="4" fill="${C.green}"/><circle cx="27" cy="26" r="4" fill="${C.green}"/><circle cx="20" cy="31" r="4" fill="${C.green}"/><path d="M20 15V5M16 9l4-4 4 4"/>`,
  'gate-plus': `<path d="M7 35V12a13 13 0 0 1 26 0v23" stroke="${C.blue}" stroke-width="3"/><path d="M20 16v12M14 22h12" stroke-width="3"/>`,
  'gate-minus': `<path d="M7 35V12a13 13 0 0 1 26 0v23" stroke="${C.red}" stroke-width="3"/><path d="M14 22h12" stroke-width="3"/><path d="M33 5l-5 5" stroke="${C.orange}"/>`,
  'gate-rate': `<path d="M7 35V12a13 13 0 0 1 26 0v23" stroke="${C.teal}" stroke-width="3"/><path d="M15 27l4-6h-3l4-7M22 27l4-6h-3l4-7" />`,
  grenade: `<circle cx="18" cy="23" r="10" fill="${C.orange}"/><path d="M22 13l3-5h6M28 8l3 4"/>`,
  cage: `<rect x="9" y="8" width="22" height="26" rx="2"/><path d="M15 8v26M20 8v26M25 8v26"/><circle cx="20" cy="22" r="3.5" fill="${C.green}" stroke="none"/>`,
  barrel: `<rect x="11" y="7" width="18" height="27" rx="4" fill="${C.red}"/><path d="M11 15h18M11 26h18"/>`,
  laser: `<path d="M5 8v24M35 8v24"/><path d="M5 20h30" stroke="${C.red}" stroke-width="3" stroke-dasharray="5 3"/>`,
  block: `<rect x="5" y="17" width="30" height="10" rx="2" fill="${C.orange}"/><path d="M10 17l-3 10M18 17l-3 10M26 17l-3 10M34 17l-3 10"/>`,
  geyser: `<ellipse cx="20" cy="31" rx="11" ry="4" fill="${C.orange}"/><path d="M20 27V8M14 24q-2-7 1-12M26 24q2-7-1-12" stroke="${C.red}"/>`,
  fork: `<path d="M20 35V22l-10-14M20 22l10-14" stroke-width="3"/>`,
  // Pip's Tower
  pin: `<path d="M8 20h20" stroke="${C.gold}" stroke-width="4"/><circle cx="31" cy="20" r="4.5" fill="${C.gold}" stroke="none"/><path d="M33 12l4-4M33 28l4 4" stroke-dasharray="2 2"/>`,
  lever: `<path d="M6 30l28-10" stroke-width="4"/><circle cx="12" cy="28" r="3" fill="currentColor"/><path d="M28 21V8" /><circle cx="28" cy="7" r="3.5" fill="${C.red}" stroke="none"/>`,
  flap: `<path d="M6 26l28-12" stroke="${C.blue}" stroke-width="4"/><circle cx="20" cy="20" r="4" fill="${C.blue}" stroke="none"/><path d="M6 12l28 12" stroke-dasharray="3 3" opacity=".5"/>`,
  plate: `<path d="M4 32h14" stroke-width="4"/><path d="M8 26v3M14 26v3" stroke-dasharray="1 2"/><path d="M28 8v24" stroke="${C.red}" stroke-width="4"/><path d="M33 12v16" opacity=".5"/>`,
  water: `<path d="M20 5q11 13 11 19a11 11 0 0 1-22 0q0-6 11-19z" fill="${C.blue}"/>`,
  lava: `<path d="M20 5q11 13 11 19a11 11 0 0 1-22 0q0-6 11-19z" fill="${C.orange}"/>`,
  stone: `<path d="M8 6q8 10 0 14M14 20" stroke="${C.blue}"/><path d="M32 6q-8 10 0 14" stroke="${C.orange}"/><path d="M8 34l4-9 9-3 9 4 2 8z" fill="${C.grey}"/>`,
  gem: `<circle cx="20" cy="20" r="14" fill="${C.gold}"/><circle cx="20" cy="20" r="10"/><path d="M23 14h-5v12h5M18 20h4"/>`,
  zorbling: `<circle cx="20" cy="22" r="11" fill="${C.purple}"/><circle cx="16" cy="20" r="2" fill="#fff" stroke="none"/><circle cx="24" cy="20" r="2" fill="#fff" stroke="none"/><path d="M15 10l-3-5M25 10l3-5"/>`,
  robot: `<rect x="10" y="12" width="20" height="18" rx="3" fill="${C.grey}"/><circle cx="16" cy="20" r="2" fill="currentColor"/><circle cx="24" cy="20" r="2" fill="currentColor"/><path d="M20 12V6M14 35v-5M26 35v-5"/>`,
  drone: `<ellipse cx="20" cy="22" rx="10" ry="6" fill="${C.grey}"/><path d="M6 12h10M24 12h10M11 12v6M29 12v6"/>`,
  sand: `<path d="M8 32q12-16 24 0z" fill="${C.gold}"/><path d="M12 10v.5M18 6v.5M24 12v.5M28 7v.5M20 16v.5" stroke-width="3"/>`,
  bomb: `<circle cx="18" cy="23" r="10" fill="currentColor" opacity=".8"/><path d="M24 14l4-5" /><path d="M29 6l3-2M30 10h3" stroke="${C.orange}"/>`,
  boulder: `<path d="M7 26a13 13 0 0 1 26 0l-3 7H10z" fill="${C.grey}"/><path d="M14 20l5 3 6-4"/>`,
  key: `<circle cx="13" cy="20" r="6" fill="${C.gold}"/><path d="M19 20h15M29 20v5M34 20v4" stroke-width="3"/>`,
  goo: `<path d="M6 30q3-14 14-14t14 14q-4 4-7 0-3 5-7 0-4 5-7 0-4 4-7 0z" fill="${C.green}" opacity=".85"/>`,
  gas: `<circle cx="14" cy="26" r="6" fill="${C.purple}" opacity=".45" stroke="none"/><circle cx="24" cy="18" r="7" fill="${C.purple}" opacity=".45" stroke="none"/><circle cx="19" cy="9" r="4" fill="${C.purple}" opacity=".45" stroke="none"/><path d="M30 34V8M26 12l4-4 4 4"/>`,
  portal: `<ellipse cx="11" cy="20" rx="5" ry="12" stroke="${C.purple}" stroke-width="3"/><ellipse cx="29" cy="20" rx="5" ry="12" stroke="${C.teal}" stroke-width="3"/><path d="M15 20h10M22 17l3 3-3 3"/>`,
  walk: `<circle cx="20" cy="9" r="4"/><path d="M20 13v11l-5 10M20 24l5 10M14 18h12"/>`,
  // Momo's Last Stand
  auto: `<circle cx="20" cy="20" r="12"/><path d="M20 4v8M20 28v8M4 20h8M28 20h8"/><circle cx="20" cy="20" r="3" fill="${C.orange}" stroke="none"/>`,
  spark: `<path d="M22 4l-10 18h8l-2 14 10-18h-8z" fill="${C.yellow}"/>`,
  cards: `<rect x="4" y="11" width="11" height="17" rx="2" transform="rotate(-10 9 20)" fill="${C.blue}"/><rect x="14.5" y="9" width="11" height="17" rx="2" fill="${C.green}"/><rect x="25" y="11" width="11" height="17" rx="2" transform="rotate(10 31 20)" fill="${C.purple}"/>`,
  evo: `<rect x="13" y="8" width="14" height="22" rx="2" fill="${C.gold}"/><path d="M20 13l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" fill="#fff" stroke="none"/><path d="M8 34h24"/>`,
  generator: `<rect x="10" y="10" width="20" height="22" rx="3" fill="${C.teal}"/><path d="M21 13l-5 9h5l-2 7 6-10h-5z" fill="#fff" stroke="none"/>`,
  elite: `<circle cx="20" cy="22" r="11" fill="${C.gold}"/><path d="M12 11l4 4 4-7 4 7 4-4"/>`,
  storm: `<path d="M5 14h22a4 4 0 1 0-4-4M5 21h28a4 4 0 1 1-4 4M5 28h16" stroke="${C.gold}" stroke-width="2.5"/>`,
  heart: `<path d="M20 33S6 25 6 15a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 10-14 18-14 18z" fill="${C.red}"/>`,
};
export const glyph = (name, size = 28) => `<svg class="gm-glyph" width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPHS[name] || GLYPHS.goal}</svg>`;

// ─────────────────────────────── How to play ───────────────────────────────
/**
 * HELP[gameId] = { goal, touch: [row], keys: [row], rules: [row] }; row = { g: glyph, k: [keys], b: bold lead, t: text }.
 * Controls come from each game's pointer()/key() code; keep them in step when the input changes.
 */
export const HELP = {
  tanks: {
    goal: 'Knock out every enemy tank. One hit ends a tank, yours too.',
    touch: [
      { g: 'stick', b: 'Drive', t: 'drag on the left side' },
      { g: 'tap', b: 'Aim and fire', t: 'drag on the right side, let go; or tap an enemy' },
      { g: 'mine', b: 'Lay a mine', t: 'MINE button' },
    ],
    keys: [
      { k: ['W', 'A', 'S', 'D'], b: 'Drive', t: 'or the arrow keys' },
      { g: 'mouse-l', b: 'Aim and fire', t: 'mouse, click or Space' },
      { g: 'mouse-r', k: ['E'], b: 'Lay a mine', t: 'right-click, E or Shift' },
      { k: ['Esc'], b: 'Pause', t: 'R restarts, F full screen' },
    ],
    rules: [
      { g: 'bounce', t: 'Shells bounce once. The aim line shows where; red means it comes back at you.' },
      { g: 'mine', t: 'Mines blow up when an enemy comes close or after 9 s. Keep clear yourself.' },
      { g: 'clash', t: 'Shells that meet cancel out: shoot incoming ones down.' },
    ],
  },
  'fern-rangers': {
    goal: 'Lead your squad to the end of the road. They fire on their own; you steer.',
    touch: [
      { g: 'drag', b: 'Steer', t: 'drag left and right anywhere' },
      { g: 'grenade', b: 'Grenade', t: 'orange button, bottom right' },
    ],
    keys: [
      { g: 'mouse-move', b: 'Steer', t: 'move the mouse, or hold A / D or ← →' },
      { k: ['Space'], b: 'Grenade', t: 'Space or G' },
      { k: ['Esc'], b: 'Pause', t: 'R restarts, F full screen' },
    ],
    rules: [
      { g: 'gate-plus', t: 'Walk through one gate of a pair: blue adds Rangers, red takes them.' },
      { g: 'gate-minus', t: 'Shooting a gate raises its number. Red can turn blue.' },
      { g: 'squad', t: 'Enemies that reach you cost Rangers. Lose them all and you lose.' },
    ],
  },
  'pips-tower': {
    goal: 'Pull the pins in the right order: gold coins to Pip, nothing deadly.',
    touch: [
      { g: 'tap', b: 'Pull a pin', t: 'tap it' },
      { g: 'flap', b: 'Swing a flap', t: 'tap it, as often as you like' },
    ],
    keys: [
      { g: 'mouse-l', b: 'Pull a pin, swing a flap', t: 'click it' },
      { k: ['1', '…', '9'], b: 'Or by number', t: 'the keys pull the numbered pins' },
      { k: ['R'], b: 'Start over', t: 'Esc pauses' },
    ],
    rules: [
      { g: 'stone', t: 'Water turns lava into stone.' },
      { g: 'lava', t: 'Lava melts gold coins and wax Klonks, and hurts Pip.' },
      { g: 'gem', t: 'Fill the bar at the top with gold coins to win.' },
    ],
  },
  momo: {
    goal: 'Choose your Fernling, steer through the arena and free the hexed creatures. Your Fernling attacks on its own and evolves as you collect sparks.',
    touch: [
      { g: 'stick', b: 'Move', t: 'drag anywhere' },
      { g: 'tap', b: 'Pick a card', t: 'tap it on a level-up' },
    ],
    keys: [
      { k: ['W', 'A', 'S', 'D'], b: 'Move', t: 'or arrows, or hold the mouse' },
      { k: ['1', '2', '3'], b: 'Pick a card', t: 'or click it' },
      { k: ['Esc'], b: 'Pause', t: 'R restarts, F full screen' },
    ],
    rules: [
      { g: 'goal', t: 'Goals: survive, guard the keepstone pedestal, free the elites or subdue the boss.' },
      { g: 'spark', t: 'Walk over the sparks enemies drop; a full meter is a level-up.' },
      { g: 'cards', t: 'Pick moves and traits of your nature. Your Fernling evolves at levels 5 and 10. Rare fossils lend one foreign move.' },
    ],
  },
};

// ─────────────────────────────── mechanic tips ───────────────────────────────
// tile codes from tanks-levels.js (T)
const TK = { CRATE: 2, PIT: 3, ICE: 4 };
const hasTile = (s, t) => !!s.grid && s.grid.includes(t);
const tankType = (type) => (s) => s.tanks.some((t) => t.alive && t.team === 1 && t.type === type);
const ENEMY_TIPS = {
  rookie: 'Brown Rookies sit still and fire slow shells. A good first target.',
  scout: 'Grey Scouts drive around. Shoot their shells down with yours.',
  zip: 'Teal Zippers fire fast rockets that don’t bounce. Keep a wall between you.',
  miner: 'Yellow Miners drop mines. Shoot a mine from afar to set it off.',
  banker: 'Green Bankers bounce shells off two walls. Cover is not always safe.',
  swarm: 'Purple Swarmers fire three shells at a time. Shoot them down or take cover.',
  ghost: 'White Ghosts turn invisible. Watch for their tracks.',
  ace: 'Black Aces are fast and fire rockets. Fight them from cover.',
};
const ENEMY_GLYPH = { zip: 'rocket', ghost: 'ghost', miner: 'mine' };

// Fern Rangers: something of `kind` within `dist` road units ahead
const ahead = (s, test, dist = 18) => s.ents.some((e) => e.alive && test(e) && e.d - s.pos < dist && e.d - s.pos > -1);
const badGate = (e) => e.kind === 'gate' && ((e.op === 'add' || e.op === 'rate') ? e.v < 0 : e.op === 'div');

// Pip's Tower: what the board holds
const fluid = (s, t) => s.parts.some((p) => !p.dead && p.t === t);
const pipEnemy = (type) => (s) => s.enemies.some((e) => !e.dead && e.type === type);
/** Lever kinds (a lever's `type`, none = a platform that tips). Other kinds get their own entry here. */
export const LEVER_TIPS = {
  tip: { touch: 'Levers tip a platform. Tap the handle to throw it; it can’t be undone.', keys: 'Levers tip a platform. Click the handle (or press its number) to throw it; it can’t be undone.' },
};

// Momo: the enemy pool
const momoFoe = (s, test) => { for (let i = 0; i < s.en.n; i++) { const e = s.en.items[i]; if (!e.dead && test(e)) return true; } return false; };

export const TIPS = {
  tanks: [
    {
      id: 'mines', g: 'mine',
      keys: 'Lay a mine: right-click, E or Shift, then drive away. It blasts nearby enemies and crates.',
      touch: 'Lay a mine with the yellow MINE button, then drive away. It blasts nearby enemies and crates.',
      // crates on the map, or a while into a fight without a single mine laid
      when: (s, c) => (hasTile(s, TK.CRATE) && c.t > 0.5) || c.t > 10,
      done: (s) => s.mines.some((m) => m.team === 0),
    },
    {
      id: 'bounce', g: 'bounce', text: 'Your shells bounce off a wall once. Bank shots around cover, and mind the ones coming back.',
      when: (s, c) => s.shells.some((sh) => sh.team === 0 && sh.bounces < 1) || (c.level > 0 && c.t > 3),
    },
    { id: 'clash', g: 'clash', text: 'Shells that meet cancel each other out. Shoot an incoming shell to stop it.', when: (s, c) => c.level > 1 && c.t > 6 },
    { id: 'crates', g: 'crate', text: 'Crates stop shells and tanks. A mine blast breaks them.', when: (s, c) => hasTile(s, TK.CRATE) && c.t > 1 },
    { id: 'pits', g: 'pit', text: 'Shells fly over canyons; tanks can’t cross them.', when: (s, c) => hasTile(s, TK.PIT) && c.t > 1 },
    { id: 'ice', g: 'ice', text: 'Ice: your tank slides. Ease off early to stop where you want.', when: (s, c) => hasTile(s, TK.ICE) && c.t > 1 },
    { id: 'vents', g: 'vent', text: 'Vents glow, then erupt. Keep off a glowing vent.', when: (s) => s.vents.some((v) => v.state > 0) },
    ...Object.entries(ENEMY_TIPS).map(([type, text]) => ({ id: `enemy-${type}`, g: ENEMY_GLYPH[type] || 'tank', text, when: (s, c) => c.t > 1 && tankType(type)(s) })),
    { id: 'boss', g: 'boss', text: 'Bosses take many hits. After each hit their armour shrugs off shells for a moment, so time your shots.', when: (s, c) => !!s.boss && c.t > 1 },
    { id: 'boss-klonk', g: 'boss', text: 'General Ganter fires three rubber shells in a fan and calls for teammates at half health.', when: (s, c) => s.boss?.boss === 'klonk' && c.t > 6 },
    { id: 'boss-drill', g: 'warn', text: 'Bergbauer Blitz burrows. The dust ring shows where he comes up: get away from it.', when: (s) => s.warn.some((w) => w.kind === 'surface') },
    { id: 'boss-walker', g: 'warn', text: 'Mortar! Leave the red circle before the shell lands.', when: (s) => s.warn.some((w) => w.kind === 'shell') },
    { id: 'boss-mothership', g: 'warn', text: 'Beam! Leave the red stripe: it sweeps the whole row or column.', when: (s) => s.warn.some((w) => w.kind === 'beam') },
  ],
  'fern-rangers': [
    { id: 'gates', g: 'gate-plus', text: 'Steer through one gate of each pair. Blue gates add Rangers, ×2 doubles them.', when: (s) => ahead(s, (e) => e.kind === 'gate', 20) },
    { id: 'gate-red', g: 'gate-minus', text: 'Red gates cost Rangers. Keep shooting one: its number rises until it helps you.', when: (s) => ahead(s, badGate, 20) },
    { id: 'gate-rate', g: 'gate-rate', text: 'Fire-rate gates make the whole squad shoot faster.', when: (s) => ahead(s, (e) => e.kind === 'gate' && e.op === 'rate') },
    {
      id: 'grenade', g: 'grenade',
      keys: 'Grenade: press Space or G. It lands on the thickest crowd ahead.',
      touch: 'Grenade: tap the orange button, bottom right. It lands on the thickest crowd ahead.',
      when: (s) => s.grenades > 0,
      done: (s) => s.throws.length > 0,
    },
    { id: 'crate', g: 'crate', text: 'Shoot the weapon crate open for a better gun.', when: (s) => ahead(s, (e) => e.kind === 'crate') },
    { id: 'cage', g: 'cage', text: 'Shoot a cage open: the Rangers inside join your squad.', when: (s) => ahead(s, (e) => e.kind === 'cage') },
    { id: 'barrel', g: 'barrel', text: 'Fuel barrels explode when shot, and hurt your squad if you walk into one.', when: (s) => ahead(s, (e) => e.kind === 'barrel') },
    { id: 'block', g: 'block', text: 'Road block ahead: steer around it.', when: (s) => ahead(s, (e) => e.kind === 'block', 14) },
    { id: 'laser', g: 'laser', text: 'Laser fences switch on and off. They flicker first: pass while they are dark.', when: (s) => ahead(s, (e) => e.kind === 'laser', 16) },
    { id: 'ice', g: 'ice', text: 'Ice: your squad slides. Steer early.', when: (s) => ahead(s, (e) => e.kind === 'ice', 12) },
    { id: 'fork', g: 'fork', text: 'The road splits. Pick a side early.', when: (s) => ahead(s, (e) => e.kind === 'fork', 16) },
    { id: 'geyser', g: 'geyser', text: 'Lava geysers glow before they burst. Steer clear of a glowing one.', when: (s) => ahead(s, (e) => e.kind === 'geyser', 16) },
    { id: 'strike', g: 'warn', text: 'A shadow on the road marks a strike from above. Get out of it.', when: (s) => ahead(s, (e) => e.kind === 'strike', 14) },
    { id: 'boss', g: 'boss', text: 'Boss! Keep shooting it and dodge its attacks. It calls in more enemies.', when: (s) => !!s.boss && s.boss.active },
  ],
  'pips-tower': [
    {
      id: 'pins', g: 'pin',
      touch: 'Tap a golden pin to pull it. Think first: what falls where?', keys: 'Click a golden pin to pull it, or press its number. Think first: what falls where?',
      when: (s) => s.pins.length > 0, done: (s) => s.pulled > 0,
    },
    { id: 'lava-water', g: 'stone', text: 'Water turns lava into stone. Cool the lava before it reaches Pip or the gold coins.', when: (s) => fluid(s, 'lava') && fluid(s, 'water') },
    { id: 'lava', g: 'lava', text: 'Lava melts gold coins and hurts Pip. Keep it away from both.', when: (s) => fluid(s, 'lava') },
    { id: 'enemy-zorbling', g: 'zorbling', text: 'Wax Klonks go for Pip. Lava melts their wax bodies.', when: pipEnemy('zorbling') },
    { id: 'enemy-klonkbot', g: 'robot', text: 'Klonkbots don’t mind lava, but water shorts them out.', when: pipEnemy('klonkbot') },
    { id: 'enemy-buzzbot', g: 'drone', text: 'Buzzbots fly over everything. Water shorts them out.', when: pipEnemy('buzzbot') },
    { id: 'chief', g: 'boss', text: 'The boss needs its hazards in a fixed order. The label above it says what comes next.', when: (s) => !!s.chief },
    ...Object.entries(LEVER_TIPS).map(([type, text]) => ({
      id: type === 'tip' ? 'lever' : `lever-${type}`, g: 'lever', ...text,
      when: (s) => s.levers.some((lv) => lv.kind !== 'flap' && (lv.type || 'tip') === type),
    })),
    { id: 'flap', g: 'flap', text: 'Blue flaps swing over on every tap. What lands on one slides to its low side: route lava, water or gold coins.', when: (s) => s.flaps.length > 0 },
    { id: 'plate', g: 'plate', text: 'Enough weight on a plate opens the doors of its colour, and they shut once it lifts. Water, sand, stones, enemies and Pip all press.', when: (s) => s.doors.some((d) => !d.inv) },
    { id: 'plate-shut', g: 'plate', text: 'Some doors stand open and shut while their plate is pressed. A guard on the plate keeps it shut until he steps off.', when: (s) => s.doors.some((d) => d.inv) },
    { id: 'sand', g: 'sand', text: 'Sand pours like grain and smothers a whole lava pool.', when: (s) => fluid(s, 'sand') },
    { id: 'boulder', g: 'boulder', text: 'Boulders crush what they fall on, enemies included.', when: (s) => s.rocks.some((r) => r.kind === 'boulder') },
    { id: 'bomb', g: 'bomb', text: 'Bombs blow up in lava and break wooden walls nearby.', when: (s) => s.rocks.some((r) => r.kind === 'bomb') },
    { id: 'key', g: 'key', text: 'A key opens the gate it falls on.', when: (s) => s.rocks.some((r) => r.kind === 'key') },
    { id: 'ice', g: 'ice', text: 'Lava melts ice into water; bombs shatter it.', when: (s) => s.ice.length > 0 },
    { id: 'goo', g: 'goo', text: 'Goo eats gold coins. Water dissolves it and lava burns it.', when: (s) => fluid(s, 'goo') },
    { id: 'gas', g: 'gas', text: 'Gas rises and is deadly to Pip. Keep a lid on it or burn it off on lava.', when: (s) => fluid(s, 'gas') },
    { id: 'portal', g: 'portal', text: 'Teleport pads: whatever falls into one comes out of its partner.', when: (s) => s.portals.length > 0 },
    { id: 'walk', g: 'walk', text: 'Pip walks to gold coins on his floor once the way is clear.', when: (s) => s.walking },
  ],
  momo: [
    { id: 'sparks', g: 'spark', text: 'Walk over the sparks enemies drop. A full spark meter is a level-up.', when: (s) => s.gems.n > 0 },
    {
      id: 'cards', g: 'cards',
      touch: 'Level-up! Tap a card to take it: a nature move, an upgrade or a trait.',
      keys: 'Level-up! Press 1–3 or click a card: a nature move, an upgrade or a trait.',
      when: (s) => !!s.choice,
    },
    { id: 'evo', g: 'evo', text: 'Combo card! A maxed nature move and its matching trait combine into a stronger ability.', when: (s) => !!s.choice?.cards?.some((c) => c.type === 'evo') },
    { id: 'kit', g: 'cards', text: 'Professor Owlbert’s supply crate: one free card for every world you have beaten.', when: (s) => s.choice?.reason === 'kit' },
    { id: 'defend', g: 'generator', text: 'Guard the keepstone pedestal: hexed Fernlings approach it too. Stay close and free them.', when: (s) => s.L.goal === 'defend' },
    { id: 'elites', g: 'elite', text: 'Golden elites are tough and drop lots of sparks. Beat them all to win.', when: (s) => s.L.goal === 'elites' || momoFoe(s, (e) => e.elite) },
    { id: 'spitter', g: 'zorbling', text: 'Spitters shoot slow blobs from afar. Step aside.', when: (s) => momoFoe(s, (e) => e.def?.range) },
    { id: 'blorb', g: 'zorbling', text: 'Some hexed Fernlings call reinforcements. Watch the arena edges after freeing them.', when: (s) => momoFoe(s, (e) => e.def?.split) },
    { id: 'storm', g: 'storm', text: 'Sand storms slow you down. Walk around them.', when: (s) => s.L.feature === 'storm' && s.t > 2 },
    { id: 'ice', g: 'ice', text: 'Ice floor: your Fernling slides. Change direction early.', when: (s) => s.L.feature === 'ice' && s.t > 2 },
    { id: 'lava', g: 'vent', text: 'Glowing cracks erupt a moment later. Step off them.', when: (s) => s.L.feature === 'lava' && s.t > 2 },
    { id: 'boss', g: 'boss', text: 'Boss! Marks on the ground show where it strikes next: step out of them.', when: (s) => !!s.boss && !s.boss.dead },
  ],
};

/** A tip's text for the input in use. */
export const tipText = (tip, mode) => tip.text || tip[mode] || tip.keys || tip.touch || '';
