/**
 * Fernwork Games page (tools/games.html): one tab per game. A game's module loads the first time its tab opens;
 * switching tabs pauses the game you leave.
 */
import { mountGame } from './core.js';

const LOADERS = {
  'gate-rush': () => import('./gate-rush.js').then((m) => m.gateRush),
  'pin-rescue': () => import('./pin-rescue.js').then((m) => m.pinRescue),
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
      mounted.set(id, LOADERS[id]().then((game) => mountGame(host, game)).catch((err) => {
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
