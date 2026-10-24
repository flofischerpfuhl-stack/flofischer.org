/**
 * Momo's Last Stand levels: four worlds × (10 levels + a boss), 2–4 minutes each.
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
  { key: 'meadow', name: 'Fernhaven Meadows', feature: null, arena: 21, boss: 'tank' },
  { key: 'dunes', name: 'Sunbake Dunes', feature: 'storm', arena: 22, boss: 'drill' },
  { key: 'frost', name: 'Frostpeak', feature: 'ice', arena: 22, boss: 'walker' },
  { key: 'ember', name: 'Ember Isles', feature: 'lava', arena: 23, boss: 'mothership' },
];

// enemy kinds each world brings in (Zorb aliens and Klonkbots, docs/games/UNIVERSE.md)
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
  level(0, 0, 'Picnic Panic', 'survive', { time: 105, hint: 'Drag anywhere to move. Momo fires on her own', intro: { klonkbot: 2 } }),
  level(0, 1, 'Clover Patch', 'survive', { time: 120, hint: 'Pick up the sparks. A full meter means a new card', intro: { klonkbot: 2 } }),
  level(0, 2, 'Tin Can Alley', 'survive', { time: 130, hint: 'Klonkbots are tougher. Keep moving' }),
  level(0, 3, 'Power to the Mill', 'defend', { time: 130, hint: 'Keep the generator alive. Stand next to it to repair it' }),
  level(0, 4, 'Big Shiny Ones', 'elites', { elites: 3, par: 110, hint: 'Defeat the golden elites. Each drops a free card' }),
  level(0, 5, 'Harbour Wall', 'survive', { time: 150 }),
  level(0, 6, 'Hold the Lights', 'defend', { time: 150 }),
  level(0, 7, 'Meadow Mayhem', 'survive', { time: 160 }),
  level(0, 8, 'Scrap Captains', 'elites', { elites: 4, par: 140 }),
  level(0, 9, 'Last Light at the Mill', 'defend', { time: 170 }),
  level(0, 10, 'Klonk Tank', 'boss', { par: 150, hint: 'Step out of the red marks. The tank charges along its line' }),

  // ── World 2 · Sunbake Dunes: Zippers and Shield-Klonks, sand storms ──
  level(1, 0, 'Dust Devils', 'survive', { time: 140, hint: 'Sand storms slow you down. Walk around them', intro: { shield: 1 } }),
  level(1, 1, 'Shield Wall', 'survive', { time: 150, hint: 'Shields block shots from the front. Mines and lightning go around' }),
  level(1, 2, 'Oasis Watch', 'defend', { time: 150 }),
  level(1, 3, 'Sandstorm Season', 'survive', { time: 160 }),
  level(1, 4, 'Mesa Bosses', 'elites', { elites: 4, par: 140 }),
  level(1, 5, 'Old Railway', 'survive', { time: 170 }),
  level(1, 6, 'Water Pump', 'defend', { time: 170 }),
  level(1, 7, 'Canyon Run', 'survive', { time: 180 }),
  level(1, 8, 'Golden Hour', 'elites', { elites: 5, par: 165 }),
  level(1, 9, 'Dune Sea', 'survive', { time: 190 }),
  level(1, 10, 'Dune Drill Mech', 'boss', { par: 170, hint: 'The drill digs under you. Move when the ground cracks' }),

  // ── World 3 · Frostpeak: Blorbs that split, Spitters, ice floors ──
  level(2, 0, 'Slippery Start', 'survive', { time: 150, hint: 'Ice is slippery: Momo slides. Plan your turns', intro: { blorb: 2, spitter: 1 } }),
  level(2, 1, 'Goo Season', 'survive', { time: 160, hint: 'Spitters glow before they shoot. Step aside', intro: { blorb: 2 } }),
  level(2, 2, 'Blorb Thaw', 'survive', { time: 170, hint: 'Blorbs split in two when they pop' }),
  level(2, 3, 'Observatory Power', 'defend', { time: 170 }),
  level(2, 4, 'Frozen Lake', 'survive', { time: 180 }),
  level(2, 5, 'Snow Giants', 'elites', { elites: 5, par: 165 }),
  level(2, 6, 'Aurora Night', 'survive', { time: 190 }),
  level(2, 7, 'Heater Duty', 'defend', { time: 190 }),
  level(2, 8, 'Pine Pass', 'survive', { time: 200 }),
  level(2, 9, 'Avalanche', 'elites', { elites: 6, par: 185 }),
  level(2, 10, 'Frost Walker', 'boss', { par: 190, hint: 'Leave the ring before the Walker stomps' }),

  // ── World 4 · Ember Isles: Buzzbots, lava cracks ──
  level(3, 0, 'Hot Feet', 'survive', { time: 170, hint: 'Glowing cracks erupt a moment later. Step off them', intro: { buzzbot: 1 } }),
  level(3, 1, 'Buzz Off', 'survive', { time: 180, hint: 'Buzzbots fly over the lava' }),
  level(3, 2, 'Cracked Earth', 'survive', { time: 190 }),
  level(3, 3, 'Forge Core', 'defend', { time: 190 }),
  level(3, 4, 'Magma Captains', 'elites', { elites: 6, par: 185 }),
  level(3, 5, 'Ash Rain', 'survive', { time: 200 }),
  level(3, 6, 'Last Generator', 'defend', { time: 210 }),
  level(3, 7, 'Mothership Shadow', 'survive', { time: 220 }),
  level(3, 8, 'Elite Armada', 'elites', { elites: 7, par: 210 }),
  level(3, 9, "Fernhaven's Last Stand", 'survive', { time: 240 }),
  level(3, 10, "The Zorb Queen", 'boss', { par: 210, hint: 'The mothership marks its beams. Keep out of the lines' }),
];
