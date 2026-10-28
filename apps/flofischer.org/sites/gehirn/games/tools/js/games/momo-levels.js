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
  level(0, 0, 'Am Kreuzgang', 'survive', { time: 105, hint: 'Bewege deinen Fernling mit WASD, Pfeiltasten oder Ziehen. Er greift selbst an', intro: { klonkbot: 2 } }),
  level(0, 1, 'Novizengarten', 'survive', { time: 120, hint: 'Sammle die Funken. Ein voller Balken gibt dir eine neue Karte', intro: { klonkbot: 2 } }),
  level(0, 2, 'Steinerne Schritte', 'survive', { time: 130, hint: 'Moorgrim ist widerstandsfähig. Bleib in Bewegung' }),
  level(0, 3, 'Das erste Archiv', 'defend', { time: 130, hint: 'Schütze das Archiv. Erneuere seinen Schutz, indem du daneben stehst' }),
  level(0, 4, 'Im Bann der Hexen', 'elites', { elites: 3, par: 110, hint: 'Befreie die goldenen Anführer. Jeder gibt dir eine zusätzliche Karte' }),
  level(0, 5, 'Klostermauer', 'survive', { time: 150 }),
  level(0, 6, 'Wache am Keepstone', 'defend', { time: 150 }),
  level(0, 7, 'Kräutergarten', 'survive', { time: 160 }),
  level(0, 8, 'Dornensiegel', 'elites', { elites: 4, par: 140 }),
  level(0, 9, 'Die letzte Laterne', 'defend', { time: 170 }),
  level(0, 10, 'Der Thorn Golem', 'boss', { par: 150, hint: 'Verlasse die roten Markierungen. Der Golem stürmt entlang seiner Markierung' }),

  // ── World 2 · Sunbake Dunes: Zippers and Shield-Klonks, sand storms ──
  level(1, 0, 'Wind aus Sahrun', 'survive', { time: 140, hint: 'Sandstürme bremsen dich. Laufe um sie herum', intro: { shield: 1 } }),
  level(1, 1, 'Schutz aus Blättern', 'survive', { time: 150, hint: 'Schutzschilde blocken von vorn. Fallen und Kettenangriffe umgehen den Schutz' }),
  level(1, 2, 'Oasenarchiv', 'defend', { time: 150 }),
  level(1, 3, 'Wandernder Sand', 'survive', { time: 160 }),
  level(1, 4, 'Die hohen Terrassen', 'elites', { elites: 4, par: 140 }),
  level(1, 5, 'Unter den Bögen', 'survive', { time: 170 }),
  level(1, 6, 'Wasser der Novizen', 'defend', { time: 170 }),
  level(1, 7, 'Sandsteintor', 'survive', { time: 180 }),
  level(1, 8, 'Goldene Dämmerung', 'elites', { elites: 5, par: 165 }),
  level(1, 9, 'Vor den Dünen', 'survive', { time: 190 }),
  level(1, 10, 'Morwen und die Sandschlange', 'boss', { par: 170, hint: 'Die Sandschlange taucht unter dir auf. Verlasse den markierten Boden' }),

  // ── World 3 · Frostpeak: Blorbs that split, Spitters, ice floors ──
  level(2, 0, 'Frost auf den Stufen', 'survive', { time: 150, hint: 'Auf Eis rutscht dein Fernling weiter. Plane deine Kurven', intro: { blorb: 2, spitter: 1 } }),
  level(2, 1, 'Wellen im Schnee', 'survive', { time: 160, hint: 'Spraycount kündigt seinen Angriff an. Weiche den Blasen aus', intro: { blorb: 2 } }),
  level(2, 2, 'Ruf aus der Ferne', 'survive', { time: 170, hint: 'Nach einer Befreiung nähert sich weitere Hex-Verstärkung vom Rand' }),
  level(2, 3, 'Das Frostarchiv', 'defend', { time: 170 }),
  level(2, 4, 'Gefrorener Kreuzgang', 'survive', { time: 180 }),
  level(2, 5, 'Hüter im Schneesturm', 'elites', { elites: 5, par: 165 }),
  level(2, 6, 'Unter dem Nordlicht', 'survive', { time: 190 }),
  level(2, 7, 'Wärme im Archiv', 'defend', { time: 190 }),
  level(2, 8, 'Der stille Pass', 'survive', { time: 200 }),
  level(2, 9, 'Siegel im Eis', 'elites', { elites: 6, par: 185 }),
  level(2, 10, 'Veit Sorns Frostmal', 'boss', { par: 190, hint: 'Verlasse Veits Frostkreis vor dem Ausbruch' }),

  // ── World 4 · Ember Isles: Buzzbots, lava cracks ──
  level(3, 0, 'Glut unter Stein', 'survive', { time: 170, hint: 'Glühende Risse brechen gleich auf. Verlasse die Markierungen', intro: { buzzbot: 1 } }),
  level(3, 1, 'Flügel im Ascheregen', 'survive', { time: 180, hint: 'Gustglider schwebt über den Glutrissen' }),
  level(3, 2, 'Risse im Hof', 'survive', { time: 190 }),
  level(3, 3, 'Das Glutarchiv', 'defend', { time: 190 }),
  level(3, 4, 'Schwarze Siegel', 'elites', { elites: 6, par: 185 }),
  level(3, 5, 'Asche auf den Dächern', 'survive', { time: 200 }),
  level(3, 6, 'Die letzte Archivwache', 'defend', { time: 210 }),
  level(3, 7, 'Ein künstlicher Funke', 'survive', { time: 220 }),
  level(3, 8, 'Der äußere Ring', 'elites', { elites: 7, par: 210 }),
  level(3, 9, 'Bis zum Morgen', 'survive', { time: 240 }),
  level(3, 10, 'Der Synthet', 'boss', { par: 210, hint: 'Der Synthet kündigt seine Funkenbahnen an. Halte dich von ihnen fern' }),
];
