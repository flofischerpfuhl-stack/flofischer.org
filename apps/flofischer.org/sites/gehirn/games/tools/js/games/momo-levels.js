/**
 * Fernling-Arena levels: four worlds × (10 levels + a boss), 2–4 minutes each.
 *
 *   goal:   'survive' (last `time` seconds) · 'defend' (keep the generator alive for `time` seconds)
 *           · 'elites' (defeat `elites` golden elites, they arrive on a schedule) · 'boss' (beat the world's boss)
 *   mix:    spawn weights per enemy kind (momo.js ENEMY); each world adds new kinds
 *   rate:   enemies per second at the start and at the end of the level; `cap` limits how many are alive at once
 *   hp:     enemy health multiplier; `swarm`: a ring of enemies closes in every `swarm[0]` seconds (`swarm[1]` of them)
 *   feature (from the world): 'storm' (drifting sand storms slow you), 'ice' (ice floor: you slide), 'lava' (cracks
 *           glow, then erupt)
 *   par:    for elite and boss levels, finishing within `par` seconds earns the third star
 *
 * test/unit/games/momo.test.mjs plays every level with a simple bot (it must win) and checks that standing still
 * loses the later ones.
 */
export const WORLDS = [
  { key: 'meadow', name: 'Hohenfarn · Viridis', feature: null, arena: 21, boss: 'tank' },
  { key: 'dunes', name: 'Sonnenkloster · Sahrun', feature: 'storm', arena: 22, boss: 'drill' },
  { key: 'frost', name: 'Frostarchiv · Hibern', feature: 'ice', arena: 22, boss: 'walker' },
  { key: 'ember', name: 'Aschenabtei · Vulkara', feature: 'lava', arena: 23, boss: 'mothership' },
];

// enemy kinds each world brings in (stable mechanical roles; Fernling models in fernling-canon.js)
const MIX = [
  { zorbling: 6, klonkbot: 2 },
  { zorbling: 5, klonkbot: 2, zipper: 3, shield: 1.4 },
  { zorbling: 4, klonkbot: 2, zipper: 2, shield: 1.2, blorb: 1.1, spitter: 1.4 },
  { zorbling: 4, klonkbot: 2, zipper: 2, shield: 1.2, blorb: 1.1, spitter: 1.4, buzzbot: 2.6 },
];

/**
 * One level. `g` is the global level index (0…43): health, spawn rate and the crowd cap all rise with it, the time
 * rises within a world (shorter early).
 */
function level(world, n, name, goal, o = {}) {
  const g = world * 11 + n;            // n: 0…9, the boss is 10
  const base = { ...MIX[world] };
  // new kinds are introduced gently: only from the level that names them, and lighter at first
  for (const [k, from] of Object.entries(o.intro || {})) if (n < from) delete base[k];
  return {
    name, world, goal, boss: goal === 'boss' ? WORLDS[world].boss : undefined,
    time: o.time ?? 120,
    elites: o.elites ?? 0,
    par: o.par ?? null,
    mix: { ...base, ...(o.mix || {}) },
    rate: o.rate ?? [0.85 + g * 0.012, 2.0 + g * 0.045],
    cap: o.cap ?? Math.min(190, 60 + g * 3.2),
    hp: o.hp ?? 1 + g * 0.022,
    dmg: o.dmg ?? 1 + g * 0.006,
    swarm: o.swarm ?? [38 - Math.min(14, g * 0.3), Math.round(10 + g * 0.5)],
    feature: WORLDS[world].feature,
    arena: WORLDS[world].arena,
    hint: o.hint,
    seed: 1000 + g * 7919,
  };
}

export const LEVELS = [
  // ── World 1 · Fernhaven Meadows: Zorblings, then Klonkbots ──
  level(0, 0, 'At the Cloister Crossing', 'survive', { time: 105, hint: 'Move your Fernling with WASD, arrow keys or by dragging. It attacks on its own', intro: { klonkbot: 2 } }),
  level(0, 1, 'Novice Garden', 'survive', { time: 120, hint: 'Collect the sparks. A full bar gives you a new card', intro: { klonkbot: 2 } }),
  level(0, 2, 'Stone Steps', 'survive', { time: 130, hint: 'Moorgrim is tough. Keep moving' }),
  level(0, 3, 'The First Archive', 'defend', { time: 130, hint: 'Guard the archive. Renew its shield by standing next to it' }),
  level(0, 4, 'Under the Hex', 'elites', { elites: 3, par: 110, hint: 'Free the golden leaders. Each one gives you an extra card' }),
  level(0, 5, 'Cloister Wall', 'survive', { time: 150 }),
  level(0, 6, 'Watch at the Keepstone', 'defend', { time: 150 }),
  level(0, 7, 'Herb Garden', 'survive', { time: 160 }),
  level(0, 8, 'Thorn Seal', 'elites', { elites: 4, par: 140 }),
  level(0, 9, 'The Last Lantern', 'defend', { time: 170 }),
  level(0, 10, 'The Thorn Golem', 'boss', { par: 150, hint: 'Step out of the red markings. The golem charges along its marking' }),

  // ── World 2 · Sunbake Dunes: Zippers and Shield-Klonks, sand storms ──
  level(1, 0, 'Wind from Sahrun', 'survive', { time: 140, hint: 'Sand storms slow you down. Run around them', intro: { shield: 1 } }),
  level(1, 1, 'Shelter of Leaves', 'survive', { time: 150, hint: 'Shields block from the front. Traps and chain attacks bypass them' }),
  level(1, 2, 'Oasis Archive', 'defend', { time: 150 }),
  level(1, 3, 'Drifting Sand', 'survive', { time: 160 }),
  level(1, 4, 'The High Terraces', 'elites', { elites: 4, par: 140 }),
  level(1, 5, 'Under the Arches', 'survive', { time: 170 }),
  level(1, 6, 'Water of the Novices', 'defend', { time: 170 }),
  level(1, 7, 'Sandstone Gate', 'survive', { time: 180 }),
  level(1, 8, 'Golden Dusk', 'elites', { elites: 5, par: 165 }),
  level(1, 9, 'Before the Dunes', 'survive', { time: 190 }),
  level(1, 10, 'Morwen and the Sand Serpent', 'boss', { par: 170, hint: 'The sand serpent surfaces beneath you. Leave the marked ground' }),

  // ── World 3 · Frostpeak: Blorbs that split, Spitters, ice floors ──
  level(2, 0, 'Frost on the Steps', 'survive', { time: 150, hint: 'On ice your Fernling keeps sliding. Plan your turns', intro: { blorb: 2, spitter: 1 } }),
  level(2, 1, 'Waves in the Snow', 'survive', { time: 160, hint: 'Spraycount warns before it attacks. Dodge the bubbles', intro: { blorb: 2 } }),
  level(2, 2, 'Echo of the Hex', 'survive', { time: 170, hint: 'After a rescue the hex calls two new enemies to that spot' }),
  level(2, 3, 'The Frost Archive', 'defend', { time: 170 }),
  level(2, 4, 'Frozen Cloister', 'survive', { time: 180 }),
  level(2, 5, 'Keepers in the Blizzard', 'elites', { elites: 5, par: 165 }),
  level(2, 6, 'Under the Northern Lights', 'survive', { time: 190 }),
  level(2, 7, 'Warmth in the Archive', 'defend', { time: 190 }),
  level(2, 8, 'The Quiet Pass', 'survive', { time: 200 }),
  level(2, 9, 'Seal in the Ice', 'elites', { elites: 6, par: 185 }),
  level(2, 10, 'Veit Sorn\'s Frost Mark', 'boss', { par: 190, hint: 'Leave Veit\'s frost circle before it bursts' }),

  // ── World 4 · Ember Isles: Buzzbots, lava cracks ──
  level(3, 0, 'Embers under Stone', 'survive', { time: 170, hint: 'Glowing cracks are about to erupt. Leave the markings', intro: { buzzbot: 1 } }),
  level(3, 1, 'Wings in the Ash Rain', 'survive', { time: 180, hint: 'Gustglider hovers over the ember cracks' }),
  level(3, 2, 'Cracks in the Courtyard', 'survive', { time: 190 }),
  level(3, 3, 'The Ember Archive', 'defend', { time: 190 }),
  level(3, 4, 'Black Seals', 'elites', { elites: 6, par: 185 }),
  level(3, 5, 'Ash on the Roofs', 'survive', { time: 200 }),
  level(3, 6, 'The Last Archive Watch', 'defend', { time: 210 }),
  level(3, 7, 'An Artificial Spark', 'survive', { time: 220 }),
  level(3, 8, 'The Outer Ring', 'elites', { elites: 7, par: 210 }),
  level(3, 9, 'Until Morning', 'survive', { time: 240 }),
  level(3, 10, 'The Synthet', 'boss', { par: 210, hint: 'The Synthet warns before its spark lanes. Stay clear of them' }),
];
