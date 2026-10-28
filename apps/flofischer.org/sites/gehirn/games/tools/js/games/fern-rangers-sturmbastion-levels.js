/** Eleven authored bonus challenges. Main-campaign recipes and IDs are separate. */
const gate = (z, x, op, v, extra = {}) => ({ z, x, op, v, width: 2.2, ...extra });
const chain = (x, n = 6, start = 8) => Array.from({ length: n }, (_, i) => gate(start + i * 4, x, 'add', 1));
const wave = (at, strength, x = 0, extra = {}) => ({ at, strength, x, ...extra });
const data = [
    ['Die Zufahrt', 'Ziehe den Sender seitlich. Jede +1-Landezone ruft Verstärkung.', chain(0, 7), [wave(4, 34)], { core: 140 }],
    ['Zwei Wege', 'Links die lange +1-Kette, rechts eine einzelne +8-Landezone.', [...chain(-2.4, 7), gate(21, 2.4, 'add', 8)], [wave(6, 68, -2.4), wave(13, 58, 2.4)], { core: 190 }],
    ['Erst sammeln, dann verdoppeln', '+3 vor ×2 holt mehr Verstärkung. Meide den gesperrten Weg.', [gate(10, 0, 'add', 3), gate(21, 0, 'mul', 2), gate(32, 0, 'add', 2)], [wave(7, 70), wave(17, 80)], { blocks: [{ x: 2.6, z: 17, width: 2 }], core: 210 }],
    ['Wanderndes Landetor', 'Plane die Laufzeit ein: Das Tor bewegt sich, deine Truppe läuft weiter.', [gate(10, 0, 'add', 6, { move: { amp: 2.4, speed: .32 } }), gate(28, 0, 'mul', 2, { width: 8 })], [wave(10, 76), wave(22, 90)], { core: 180 }],
    ['Die beiden Schleusen', 'Zwei Automatenzuflüsse. Der bewegliche Schutzblock lenkt die Front.', [gate(10, -2.4, 'add', 6), gate(10, 2.4, 'add', 6), gate(30, 0, 'mul', 2, { width: 8 })], [wave(6, 65, -2.4), wave(6, 65, 2.4), wave(22, 90, 0)], { blocks: [{ x: 0, z: 24, width: 2, move: { amp: 2.8, speed: .4 } }], core: 210 }],
    ['Ein kurzes Zeitfenster', 'Das Tempofeld beschleunigt deine Verstärkung im Engpass.', [gate(9, 0, 'add', 6), gate(31, 0, 'mul', 2)], [wave(7, 90), wave(21, 115)], { tempo: { x: 0, z: 18, width: 2.4, length: 9, mul: 1.8 }, blocks: [{ x: -3.5, z: 26, width: 2 }, { x: 3.5, z: 26, width: 2 }], core: 230 }],
    ['Die Ladungssperre', 'Die sichtbare Restladung sinkt durch ankommende Verstärkung auf null.', [gate(9, 0, 'add', 8), gate(19, 0, 'mul', 2)], [wave(9, 105), wave(26, 120)], { barrier: { x: 0, z: 29, width: 2.8, hp: 190 }, core: 240 }],
    ['Zwei Fronten', 'Die schwere Welle wird angekündigt. Nutze eine vollständige Torkette.', [gate(9, -2.4, 'add', 5), gate(20, -2.4, 'mul', 2), gate(9, 2.4, 'add', 3), gate(20, 2.4, 'mul', 3)], [wave(8, 80, -2.4), wave(8, 80, 2.4), wave(27, 180, 0, { heavy: true })], { core: 260 }],
    ['Der Dammsteg', 'Die Umlenkklappe führt Einheiten zur anderen Seite. Nutze die Ruhe zwischen Wellen.', [gate(9, 0, 'add', 8), gate(32, -2.4, 'mul', 2), gate(32, 2.4, 'mul', 2)], [wave(9, 95), wave(26, 145), wave(42, 120)], { deflector: { x: 0, z: 23, amp: 2.4, speed: .35 }, core: 250 }],
    ['Die Werft', 'Wechselnde Landetore und schwere Automaten: Verbinde die gelernten Regeln.', [gate(8, -2.4, 'add', 7), gate(8, 2.4, 'add', 4), gate(20, -2.4, 'mul', 2), gate(20, 2.4, 'mul', 3), gate(34, 0, 'add', 2, { width: 8 })], [wave(7, 110, -2.4), wave(18, 120, 2.4), wave(32, 210, 0, { heavy: true })], { core: 300 }],
    ['Der Bastionskern', 'Drei angekündigte Fronten. Sobald sie gefallen sind, wird der Kern frei.', [gate(8, 0, 'add', 7), gate(18, 0, 'mul', 2), gate(29, 0, 'add', 3)], [wave(7, 130, -2.4), wave(23, 190, 2.4, { heavy: true }), wave(39, 280, 0, { heavy: true })], { core: 430, reserve: 210 }],
];
export const STURMBASTION_LEVELS = data.map(([name, hint, gates, waves, options], index) => ({ name, hint, world: 4, mode: 'sturmbastion', progressId: `sb-${String(index + 1).padStart(2, '0')}`, speed: 3.4, length: 52, reserve: 170, emitEvery: .24, core: 200, base: 55, stars: [1, 2], gates, waves, ...options }));
