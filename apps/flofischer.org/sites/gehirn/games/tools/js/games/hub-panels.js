/** Dialogue and panel markup for the three characters. Pure HTML strings; hub.js owns the DOM and the events. */
import { profile, upgradeLevel } from './profile.js';
import { UPGRADES, jobs, TOURNAMENT_RINGS } from './hub-progress.js';

export const FORMS = [
  ['PIP_KESSEL', 'Pip', 'Pickaxe · recovers fossils'], ['PIP_FIRE_THROW', 'Ember', 'Fire throw · glove and ember tool'],
  ['PIP_BUBBLE_FLOAT', 'Bubble', 'Float · bubble tool'], ['PIP_VINE_HOOK', 'Vine', 'Vine hook · grab and swing'],
  ['PIP_STONE_STOMPER', 'Stone', 'Stone stomper · heavy gear'], ['PIP_GALE_GLIDER', 'Gale', 'Glider cape · glide through the air'],
  ['PIP_SPARK_LEAP', 'Spark', 'Spark gloves · an extra jump'], ['PIP_FROST_BRIDGE', 'Frost', 'Frost tool · shapes a bridge'],
];

/** Who says what. `answers` open a panel (topic) or close the bubble. */
export const CHARACTERS = {
  PROFESSOR_OWLBERT: { id: 'PROFESSOR_OWLBERT', name: 'Owlbert', role: 'Workshop', line: 'Need better gear for the road?', answers: [{ label: 'Workshop', topic: 'workshop' }, { label: 'Tournament ring', topic: 'ring' }, { label: 'Not now' }] },
  MAYOR_TORTELLINI: { id: 'MAYOR_TORTELLINI', name: 'Mayor Tortellini', role: 'Quests', line: 'Fernhaven always needs a hand.', answers: [{ label: 'Today’s quests', topic: 'quests' }, { label: 'Not now' }] },
  PIP_KESSEL: { id: 'PIP_KESSEL', name: 'Pip', role: 'Gear', line: 'Want to see my tools?', answers: [{ label: 'Gear', topic: 'gear' }, { label: 'Save game', topic: 'save' }, { label: 'Not now' }] },
};
export const TOPIC_TITLES = { workshop: 'Workshop', ring: 'Tournament ring', quests: 'Today’s quests', gear: 'Gear', save: 'Save game' };

export const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const COIN = '<svg class="hb-coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#e8b93f" stroke="#b98a1c" stroke-width="1.2"/><circle cx="8" cy="8" r="4.2" fill="none" stroke="#b98a1c" stroke-width="1"/></svg>';
export const money = n => `${COIN}<span>${Number(n).toLocaleString('en')} G</span>`;
const pips = (n, max) => `<span class="hb-pips" aria-label="${n} of ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('')}</span>`;

export function askHTML(c) {
  return `<p class="hb-line"><b>${esc(c.name)}</b>${esc(c.line)}</p><div class="hb-answers">${c.answers.map((a, i) => `<button type="button" class="hb-btn ${i === 0 ? 'hb-btn--primary' : i === c.answers.length - 1 ? 'hb-btn--quiet' : 'hb-btn--soft'}" data-answer="${a.topic ?? ''}">${esc(a.label)}</button>`).join('')}</div>`;
}

function head(title) {
  return `<div class="hb-panel__head"><h2 id="hb-panel-title">${esc(title)}</h2><span class="hb-balance" aria-label="${profile().coins} Groschen">${money(profile().coins)}</span><button type="button" class="hb-icon" data-act="close" aria-label="Close">×</button></div>`;
}

export function panelHTML(topic, state) {
  const p = profile();
  let body = '';
  if (topic === 'workshop') {
    body = UPGRADES.map(x => {
      const n = upgradeLevel(x.key), cost = x.cost * (n + 1), maxed = n >= x.max, poor = p.coins < cost;
      return `<article class="hb-row"><div class="hb-row__text"><h3>${esc(x.title)} ${pips(n, x.max)}</h3><p>${esc(x.description)}</p></div><button type="button" class="hb-btn hb-btn--primary" data-buy="${x.key}" data-keep="buy-${x.key}" ${maxed || poor ? 'disabled' : ''}>${maxed ? 'Maxed' : `${COIN}${cost} G`}</button></article>`;
    }).join('');
  } else if (topic === 'ring') {
    const equipped = p.cosmetics.equipped['tournament-ring'] || 'fern';
    body = `<p class="hb-note">The colour of your own marker ring in Bounce Brigade. The rules stay the same.</p><div class="hb-rings">${TOURNAMENT_RINGS.map(r => {
      const own = r.id === 'fern' || p.cosmetics.owned.includes(`tournament-ring:${r.id}`), chosen = equipped === r.id;
      return `<button type="button" class="hb-chip" data-ring="${r.id}" data-keep="ring-${r.id}" aria-pressed="${chosen}" ${!own && p.coins < r.cost ? 'disabled' : ''}><span class="hb-swatch" style="background:${r.color}"></span><span>${esc(r.title)}</span><small>${chosen ? 'Active' : own ? 'Owned' : `${r.cost} G`}</small></button>`;
    }).join('')}</div>`;
  } else if (topic === 'quests') {
    body = `<p class="hb-note">New quests every day. Progress counts from the moment you accept.</p>` + jobs().map(j => {
      const done = j.active && j.progress >= j.target, pct = j.active ? Math.round(100 * j.progress / j.target) : 0;
      const label = j.claimed ? 'Claimed' : j.active ? 'Claim reward' : 'Accept', off = j.claimed || (j.active && !done);
      return `<article class="hb-row hb-row--col"><div class="hb-row__text"><h3>${esc(j.title)} <span class="hb-reward">+${j.reward} G</span></h3><p>${esc(j.description)}</p>${j.active ? `<div class="hb-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${j.target}" aria-valuenow="${j.progress}"><i style="width:${pct}%"></i></div><small>${j.progress} / ${j.target}</small>` : ''}</div><button type="button" class="hb-btn ${j.claimed ? 'hb-btn--soft' : 'hb-btn--primary'}" data-job="${j.id}" data-keep="job-${j.id}" ${off ? 'disabled' : ''}>${label}</button></article>`;
    }).join('');
  } else if (topic === 'gear') {
    body = `<p class="hb-note">Every power-up has its own tool. Pick a form and Pip shows it off.</p><div class="hb-forms">${FORMS.map((f, i) => `<button type="button" class="hb-chip hb-chip--form" data-form="${i}" data-keep="form-${i}" aria-pressed="${i === state.form}">${esc(f[1])}</button>`).join('')}</div><p class="hb-formnote" data-form-note>${esc(FORMS[state.form][2])}</p>`;
  } else if (topic === 'save') {
    body = `<p class="hb-note">Your progress lives in this browser. Copy the code to carry it to another device.</p><textarea class="hb-code" aria-label="Save code" rows="4" spellcheck="false" data-keep="code"></textarea><div class="hb-actions"><button type="button" class="hb-btn hb-btn--primary" data-act="export">Copy code</button><button type="button" class="hb-btn hb-btn--soft" data-act="import">Load code</button></div><p class="hb-status" role="status" data-save-status>${esc(state.status ?? '')}</p><p class="hb-note"><a href="${esc(state.creditsUrl)}" target="_blank" rel="noopener">Asset credits and licences</a></p>`;
  }
  return `${head(TOPIC_TITLES[topic])}<div class="hb-panel__body">${body}</div>`;
}
