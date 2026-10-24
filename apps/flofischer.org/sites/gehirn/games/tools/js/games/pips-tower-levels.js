/**
 * Pip’s Tower levels on a 360 × 640 board; the tower's inner walls are at x 46 / 314 and the floor at y 594.
 *   walls / breakable: [x1, y1, x2, y2] segments, 12 px thick (breakable ones are wood a bomb can blow away)
 *   pins:  [x1, y1, x2, y2] — the second point is the handle end; a pulled pin slides out that way
 *   fill:  [material, x0, y0, x1, y1] rectangles packed with gold, water or lava
 *   zone:  the hero's room — gold that lands there is collected
 *   need:  share of the gold the hero needs; stars: [share for ★★, share for ★★★]
 *   solution: [[pin, seconds to wait after pulling it], …] — test/unit/games/pips-tower.test.mjs replays it and checks
 *   that the listed traps (`fails`) really fail.
 */
const OUTER = [[40, 40, 40, 600], [320, 40, 320, 600], [40, 600, 320, 600]];
const level = (o) => ({ need: 0.5, stars: [0.6, 0.85], ...o, walls: [...OUTER, ...(o.walls || [])] });

export const LEVELS = [
  level({
    name: 'First Pull', hint: 'Tap the pin to drop the gold',
    pins: [[40, 262, 340, 262]],
    fill: [['gold', 100, 170, 260, 256]],
    hero: [180, 575], zone: [46, 300, 314, 594],
    solution: [[0, 4]], fails: [],
  }),
  level({
    name: 'Choose Wisely', hint: 'Lava burns. Pull only the pin under the gold',
    walls: [[180, 60, 180, 262]],
    pins: [[180, 268, 10, 268], [180, 268, 350, 268]],
    fill: [['gold', 56, 160, 172, 260], ['lava', 188, 180, 306, 260]],
    hero: [180, 575], zone: [46, 300, 314, 594],
    solution: [[0, 4]], fails: [[1]],
  }),
  level({
    name: 'Cool Down', hint: 'Water turns lava into stone',
    walls: [[180, 60, 180, 214]],
    pins: [[180, 220, 10, 220], [180, 220, 350, 220], [40, 400, 340, 400]],
    fill: [['water', 52, 130, 172, 212], ['gold', 188, 130, 306, 212], ['lava', 52, 370, 308, 394]],
    hero: [180, 575], zone: [46, 410, 314, 594],
    solution: [[0, 3.5], [2, 2.5], [1, 4]], fails: [[2], [1], [1, 0, 2]],
  }),
  level({
    name: 'Bad Neighbour', hint: 'Enemies must go. The hero must stay safe',
    walls: [[180, 60, 180, 200], [186, 330, 186, 394]],
    pins: [[180, 206, 10, 206], [186, 394, 10, 394], [180, 206, 350, 206]],
    fill: [['lava', 56, 140, 172, 198], ['gold', 188, 120, 306, 198]],
    enemies: [[110, 360]],
    hero: [275, 575], zone: [46, 404, 314, 594],
    solution: [[0, 3], [2, 4]], fails: [[1], [2, 1]],
  }),
  level({
    name: 'Rock Bottom', hint: 'A falling boulder flattens whatever is below',
    walls: [[130, 60, 130, 246], [230, 60, 230, 246], [180, 420, 180, 600], [140, 300, 214, 330]],
    pins: [[130, 252, 10, 252], [130, 252, 350, 252], [230, 200, 350, 200]],
    fill: [['gold', 140, 140, 222, 244]],
    boulders: [[88, 210], [272, 160]],
    enemies: [[110, 575]],
    hero: [255, 575], zone: [186, 270, 314, 594],
    solution: [[0, 3], [1, 4]], fails: [[1, 2], [2, 1]],
  }),
  level({
    name: 'Flood First', hint: 'Give the lava something to land on',
    walls: [[180, 60, 180, 230], [250, 150, 250, 230]],
    pins: [[180, 236, 10, 236], [180, 236, 350, 236]],
    fill: [['water', 52, 130, 172, 228], ['gold', 188, 150, 244, 228], ['lava', 258, 140, 308, 228]],
    hero: [150, 575], zone: [46, 280, 314, 594],
    solution: [[0, 3], [1, 5]], fails: [[1]],
  }),
  level({
    name: 'Kaboom', hint: 'Bombs explode in lava and blow wood away',
    walls: [[180, 60, 180, 206], [200, 366, 200, 330], [224, 250, 224, 340], [224, 250, 320, 250]],
    breakable: [[224, 340, 320, 340]],
    pins: [[180, 212, 10, 212], [206, 372, 10, 372]],
    fill: [['lava', 52, 330, 194, 364], ['gold', 232, 262, 310, 332]],
    bombs: [[160, 170]],
    hero: [255, 575], zone: [46, 380, 314, 594], need: 0.4, stars: [0.55, 0.8],
    solution: [[0, 5]], fails: [[1]],
  }),
  level({
    name: 'Two Guards', hint: 'Lava for one, a boulder for the other',
    walls: [[130, 60, 130, 214], [230, 60, 230, 214], [40, 330, 130, 330], [130, 330, 130, 296], [215, 430, 215, 600]],
    pins: [[130, 220, 10, 220], [130, 220, 350, 220], [230, 180, 350, 180]],
    fill: [['lava', 52, 140, 124, 212], ['gold', 238, 100, 308, 176]],
    boulders: [[180, 190]],
    enemies: [[88, 300], [170, 575]],
    hero: [270, 575], zone: [221, 240, 314, 594],
    solution: [[0, 3], [1, 3], [2, 4]], fails: [],
  }),
  level({
    name: 'Double Dip', hint: 'One bucket is not enough for that much lava',
    walls: [[124, 60, 124, 212], [236, 60, 236, 212]],
    pins: [[124, 218, 10, 218], [124, 130, 350, 130], [236, 218, 350, 218], [40, 380, 340, 380]],
    fill: [['water', 52, 110, 118, 212], ['gold', 130, 66, 230, 124], ['water', 244, 140, 308, 212], ['lava', 52, 338, 308, 374]],
    hero: [180, 575], zone: [46, 392, 314, 594],
    solution: [[0, 3], [2, 3.5], [3, 2.5], [1, 4]], fails: [[0, 3], [2, 3], [1]],
  }),
  level({
    name: 'Leave It Hot', hint: 'This time the lava has a job to do',
    walls: [[224, 60, 224, 180], [300, 210, 150, 262], [110, 336, 220, 336], [104, 336, 104, 300], [220, 336, 220, 300], [40, 240, 104, 240], [104, 240, 104, 300]],
    breakable: [[40, 336, 104, 336]],
    pins: [[224, 186, 350, 186], [224, 176, 10, 176]],
    fill: [['water', 116, 96, 216, 168], ['lava', 116, 304, 214, 330], ['gold', 50, 250, 98, 330]],
    bombs: [[270, 150]],
    hero: [250, 575], zone: [46, 350, 314, 594], need: 0.4, stars: [0.6, 0.85],
    solution: [[0, 5]], fails: [[1, 0], [1]],
  }),
  level({
    name: 'In Order', hint: 'Four pins, one safe order',
    walls: [[180, 60, 180, 426], [40, 520, 180, 570]],
    pins: [[186, 176, 10, 176], [186, 296, 10, 296], [186, 426, 10, 426], [186, 600, 186, 432]],
    fill: [['gold', 52, 96, 172, 170], ['water', 52, 196, 172, 290], ['lava', 52, 380, 172, 420]],
    enemies: [[110, 520]],
    hero: [265, 575], zone: [192, 300, 314, 594], need: 0.3, stars: [0.45, 0.65],
    solution: [[2, 2.5], [1, 3], [3, 2.5], [0, 7]], fails: [[3], [2, 3]],
  }),
  level({
    name: 'The Vault', hint: 'Burn the guard, cool the lava, then open the vault',
    walls: [[120, 60, 120, 190], [240, 60, 240, 190], [40, 240, 140, 285], [320, 240, 220, 285], [120, 300, 120, 426], [240, 300, 240, 426]],
    pins: [[120, 196, 10, 196], [120, 110, 350, 110], [240, 196, 350, 196], [114, 426, 350, 426]],
    fill: [['water', 52, 96, 114, 190], ['lava', 126, 66, 234, 104], ['gold', 246, 118, 308, 190]],
    enemies: [[180, 400]],
    hero: [180, 575], zone: [46, 440, 314, 594], need: 0.4, stars: [0.6, 0.85],
    solution: [[1, 3], [0, 4], [3, 3], [2, 5]], fails: [[3], [2, 1], [1, 3]],
  }),
];
