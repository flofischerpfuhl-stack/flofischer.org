/**
 * Fernwork Games page (tools/games.html): the Arcade hub (3D game boxes, progress) plus one tab per game. A tab's
 * module loads the first time it opens; switching tabs pauses the one you leave.
 */
import { mountGame } from './core.js';

const LOADERS = {
  arcade: () => import('./hub.js').then((m) => ({ hub: m.mountHub })),
  'fern-rangers': () => import('./fern-rangers.js').then((m) => m.fernRangers),
  'pips-tower': () => import('./pips-tower.js').then((m) => m.pipsTower),
  momo: () => import('./momo.js').then((m) => m.momo),
};

export function mountGames() {
  const mounted = new Map();
  let current = null;
  async function show(id) {
    if (current && current !== id) mounted.get(current)?.then((c) => c?.deactivate());
    current = id;
    if (!LOADERS[id]) return;
    if (!mounted.has(id)) {
      const host = document.querySelector(`.gm-host[data-game="${id}"]`);
      mounted.set(id, LOADERS[id]().then((game) => (game.hub ? game.hub(host, { onPlay: (gid) => { window.location.hash = gid; } }) : mountGame(host, game))).catch((err) => {
        console.error('[games] failed to load', id, err);
        host.innerHTML = '<p class="fw-alert fw-alert--danger">This game failed to load. Reload the page to try again.</p>';
        return null;
      }));
    }
    const controller = await mounted.get(id);
    if (current === id) controller?.activate();
  }
  return { show };
}
