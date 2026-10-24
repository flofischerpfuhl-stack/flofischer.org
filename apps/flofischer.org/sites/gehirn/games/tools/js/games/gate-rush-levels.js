/**
 * Gate Rush levels. Distances are road units (the squad walks `speed` units per second, the road is 6 units wide).
 * Gate strings: '+5' / '-3' add, 'x2' multiply, '/2' divide, 'r30' fire rate +30 %. Weapons: 0 pistol … 4 laser.
 * Stars: soldiers left at the finish ([for ★★, for ★★★]). test/unit/games/gate-rush.test.mjs plays every level with a
 * simple bot and checks it is winnable and that standing still is not enough on the later ones.
 */
const parse = (s) => (s[0] === 'x' ? { op: 'mul', v: +s.slice(1) } : s[0] === '/' ? { op: 'div', v: +s.slice(1) }
  : s[0] === 'r' ? { op: 'rate', v: +s.slice(1) } : { op: 'add', v: +s });
/** Two gates side by side (null leaves that half of the road open). */
const gate = (d, left, right) => ({ t: 'gate', d, gates: [left && { x0: -3, x1: 0, ...parse(left) }, right && { x0: 0, x1: 3, ...parse(right) }].filter(Boolean) });
/** Three narrow gates. */
const gate3 = (d, a, b, c) => ({ t: 'gate', d, gates: [{ x0: -3, x1: -1, ...parse(a) }, { x0: -1, x1: 1, ...parse(b) }, { x0: 1, x1: 3, ...parse(c) }] });
const wave = (d, kind, n, o = {}) => ({ t: 'wave', d, kind, n, x0: o.x0 ?? -2.4, x1: o.x1 ?? 2.4, cols: o.cols, gap: o.gap, hp: o.hp, speed: o.speed });
const barrel = (d, x, hp = 8) => ({ t: 'barrel', d, x, hp });
const crate = (d, x, hp, weapon) => ({ t: 'crate', d, x, hp, weapon });
const spikes = (d, x0, x1) => ({ t: 'spikes', d, x0, x1 });
const boss = (d, hp, spawn = 0, speed = 1) => ({ t: 'boss', d, hp, spawn, speed });

export const LEVELS = [
  {
    name: 'Boot Camp', theme: 'meadow', speed: 6, length: 240, start: { soldiers: 4, weapon: 1 }, stars: [28, 46],
    hint: 'Steer through the blue gates to grow your squad',
    events: [
      gate(22, '+3', '+1'), wave(45, 'zombie', 8), gate(70, '+5', '-2'), wave(95, 'zombie', 12),
      gate(120, 'x2', '+3'), wave(150, 'zombie', 16), wave(172, 'zombie', 12, { x0: -1, x1: 1 }),
      gate(195, '+5', '+2'), wave(215, 'zombie', 20),
    ],
  },
  {
    name: 'Minus Signs', theme: 'meadow', speed: 6, length: 250, start: { soldiers: 5, weapon: 1 }, stars: [22, 36],
    hint: 'Red gates cost soldiers. Shoot them to raise the number!',
    events: [
      gate(25, '-4', '+2'), wave(50, 'zombie', 14), gate(80, '-8', '-2'), wave(105, 'zombie', 18),
      gate(135, 'x2', '-6'), wave(160, 'zombie', 20, { hp: 1.5 }), gate(190, '+4', '-10'), wave(215, 'zombie', 24, { hp: 1.5 }),
    ],
  },
  {
    name: 'Fire at Will', theme: 'desert', speed: 6, length: 265, start: { soldiers: 6, weapon: 1 }, stars: [30, 48],
    hint: 'Runners are fast. Fire-rate gates make everyone shoot faster',
    events: [
      gate(25, 'r30', '+3'), wave(55, 'runner', 8), gate(75, '+6', 'r40'), wave(100, 'zombie', 16, { hp: 1.5 }),
      wave(115, 'runner', 12, { hp: 2 }), gate(145, '-8', 'x2'), wave(175, 'zombie', 22, { hp: 2 }), wave(190, 'runner', 16, { hp: 3 }),
      gate(215, '-5', '+8'), wave(235, 'zombie', 26, { hp: 3.5 }),
    ],
  },
  {
    name: 'Armory', theme: 'desert', speed: 6, length: 255, start: { soldiers: 6, weapon: 0 }, stars: [28, 44],
    hint: 'Shoot crates open to unlock better guns',
    events: [
      crate(30, -1.5, 30), gate(45, '+5', '+2'), wave(70, 'zombie', 16, { hp: 1.5 }), crate(95, 1.5, 70, 2),
      gate(110, '-3', 'x2'), wave(140, 'zombie', 24, { hp: 2 }), barrel(146, 0, 6), gate(175, '+10', 'r30'),
      wave(205, 'zombie', 30, { hp: 4 }), barrel(208, -1.5, 8), wave(222, 'runner', 12, { hp: 3 }),
    ],
  },
  {
    name: 'Spike Road', theme: 'city', speed: 6, length: 262, start: { soldiers: 8, weapon: 1 }, stars: [28, 44],
    hint: 'Spikes cost a third of your squad. Steer around them',
    events: [
      spikes(25, -3, -0.6), gate(40, '+5', '+3'), spikes(60, 0.6, 3), wave(75, 'zombie', 16, { x0: -2.4, x1: 0, hp: 1.5 }),
      gate(95, 'x2', '+6'), spikes(115, -1.2, 1.2), wave(130, 'runner', 14, { hp: 2 }), gate(150, '-5', '+8'),
      spikes(170, -3, -0.9), spikes(170, 0.9, 3), wave(190, 'zombie', 26, { hp: 3 }), gate(215, 'x2', '+10'),
      wave(237, 'zombie', 32, { hp: 4 }),
    ],
  },
  {
    name: 'Big Boys', theme: 'city', speed: 6, length: 270, start: { soldiers: 10, weapon: 1 }, stars: [60, 100],
    hint: 'Brutes take a lot of bullets and crush six soldiers',
    events: [
      gate(25, '+6', 'r30'), wave(50, 'zombie', 16, { hp: 2 }), wave(68, 'brute', 3, { hp: 2 }), crate(85, 0, 90, 2),
      gate(100, '+5', 'x2'), wave(125, 'brute', 4, { hp: 3.5 }), wave(132, 'zombie', 20, { hp: 4 }), gate(155, '-6', '+10'),
      wave(180, 'brute', 5, { hp: 5 }), barrel(190, -1.5, 10), barrel(190, 1.5, 10), wave(194, 'zombie', 24, { hp: 6 }),
      gate(220, '+15', 'x2'), wave(245, 'brute', 5, { hp: 7 }),
    ],
  },
  {
    name: 'Barrel Alley', theme: 'snow', speed: 6, length: 270, start: { soldiers: 12, weapon: 2 }, stars: [55, 90],
    hint: 'Shoot the barrels when the horde is close',
    events: [
      wave(35, 'zombie', 24, { hp: 3, cols: 6 }), barrel(37, 0, 10), gate(60, '+8', 'x2'),
      wave(85, 'zombie', 30, { hp: 4, cols: 6 }), barrel(84, -1.5, 12), barrel(84, 1.5, 12), gate(110, '-10', '+5'),
      wave(135, 'runner', 20, { hp: 4 }), barrel(140, 0, 14), gate(160, 'r40', 'x2'),
      wave(185, 'zombie', 40, { hp: 6, cols: 6 }), barrel(184, -2, 15), barrel(184, 0, 15), barrel(184, 2, 15),
      gate(215, '+20', '-15'), wave(240, 'brute', 4, { hp: 3 }), wave(244, 'zombie', 30, { hp: 7, cols: 6 }), barrel(243, 0, 16),
    ],
  },
  {
    name: 'Narrow Bridge', theme: 'snow', speed: 6.5, length: 280, start: { soldiers: 12, weapon: 2 }, stars: [32, 52],
    hint: 'Three lanes, one right answer',
    events: [
      gate3(25, '+5', '-5', '+2'), spikes(45, -3, -1), spikes(45, 1, 3), wave(60, 'zombie', 18, { x0: -0.8, x1: 0.8, cols: 3, hp: 3 }),
      gate3(85, 'x2', '+8', '-10'), wave(110, 'runner', 16, { hp: 4 }), spikes(130, -1, 1),
      gate3(150, '-6', 'x2', '+10'), spikes(170, -3, -1), spikes(170, 1, 3), wave(185, 'zombie', 30, { x0: -0.8, x1: 0.8, cols: 3, hp: 6 }),
      gate3(210, '+15', '/2', 'x2'), wave(235, 'brute', 4, { hp: 3 }), wave(240, 'runner', 24, { hp: 6 }),
    ],
  },
  {
    name: 'Minigun', theme: 'desert', speed: 6, length: 290, start: { soldiers: 15, weapon: 2 }, stars: [65, 110],
    hint: 'A minigun is waiting in the crate. Get it before the big wave',
    events: [
      gate(25, '+10', '-4'), wave(45, 'zombie', 30, { hp: 5, cols: 6 }), crate(70, 0, 220, 3), gate(90, 'x2', 'r30'),
      wave(115, 'zombie', 40, { hp: 7, cols: 6 }), wave(130, 'runner', 20, { hp: 6 }), gate(155, '+20', 'x2'),
      wave(180, 'brute', 5, { hp: 4 }), barrel(186, -1.5, 25), barrel(186, 1.5, 25), wave(190, 'zombie', 40, { hp: 9, cols: 6 }),
      gate(220, '-20', '+10'), wave(245, 'zombie', 60, { hp: 10, cols: 6, gap: 1 }), wave(262, 'brute', 6, { hp: 5 }),
    ],
  },
  {
    name: 'Night Shift', theme: 'night', speed: 6.5, length: 300, start: { soldiers: 15, weapon: 2 }, stars: [55, 90],
    hint: 'They come faster in the dark',
    events: [
      gate(25, 'r40', '+10'), wave(60, 'runner', 20, { hp: 4 }), gate(70, 'x2', '-10'), wave(95, 'runner', 30, { hp: 8, speed: 1.15 }),
      crate(110, -1.5, 250, 3), wave(130, 'brute', 5, { hp: 5 }), gate(150, '+25', 'r50'), spikes(170, -1, 1),
      wave(185, 'runner', 40, { hp: 10, speed: 1.2 }), barrel(190, 0, 30), gate(215, 'x2', '+30'),
      wave(240, 'zombie', 50, { hp: 14, cols: 6 }), wave(255, 'brute', 6, { hp: 7 }), wave(270, 'runner', 30, { hp: 12, speed: 1.25 }),
    ],
  },
  {
    name: 'Gauntlet', theme: 'lava', speed: 7, length: 320, start: { soldiers: 20, weapon: 3 }, stars: [55, 95],
    hint: 'Everything at once. Keep moving',
    events: [
      gate3(25, '+10', '-15', 'x2'), wave(55, 'zombie', 36, { hp: 7, cols: 6 }), spikes(60, -3, -1), barrel(62, 1.5, 30),
      wave(78, 'runner', 24, { hp: 6 }), gate(100, '-25', 'r40'), wave(120, 'brute', 6, { hp: 7 }), spikes(140, 0.8, 3),
      gate(155, 'x2', '+20'), wave(175, 'zombie', 60, { hp: 11, cols: 6, gap: 1 }), barrel(178, -1.5, 40), barrel(178, 1.5, 40),
      gate3(205, '/2', '+40', 'r50'), spikes(222, -1, 1), wave(235, 'runner', 40, { hp: 8, speed: 1.2 }), wave(250, 'brute', 8, { hp: 7 }),
      gate(275, 'x2', '-30'), wave(295, 'zombie', 70, { hp: 13, cols: 7, gap: 0.9 }),
    ],
  },
  {
    name: 'The Titan', theme: 'lava', speed: 6.5, length: 250, start: { soldiers: 20, weapon: 3 }, stars: [150, 250],
    hint: 'Grow your army, then bring down the Titan',
    events: [
      gate(25, '+15', 'r30'), wave(45, 'zombie', 30, { hp: 10, cols: 6 }), gate(70, '+10', 'x2'), crate(90, 0, 300, 4),
      wave(105, 'runner', 30, { hp: 12 }), gate(130, '-20', '+30'), wave(150, 'brute', 6, { hp: 8 }), barrel(158, 0, 40),
      gate(175, 'r50', 'x2'), wave(195, 'zombie', 40, { hp: 16, cols: 6 }), boss(240, 30000, 4, 1.2),
    ],
  },
];
