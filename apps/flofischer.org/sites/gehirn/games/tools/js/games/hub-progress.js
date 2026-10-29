/** Shared canteen progression. Purchases are atomic and capped, jobs are claimed once. */
import { profile, save, upgradeLevel, dailyKey, starsTotal } from './profile.js';
export const UPGRADES = [
  { key: 'rangers-squad', title: 'Reinforcements', description: 'One extra legionary at the start of every Fern Rangers campaign level, per rank.', cost: 120, max: 3 },
  { key: 'rangers-rate', title: 'Spore cell', description: '5 % higher fire rate per rank in the Fern Rangers campaign.', cost: 160, max: 3 },
  { key: 'pip-hint', title: 'Owlbert’s notebook', description: 'One optional solution hint per attempt in Pip’s Tower.', cost: 100, max: 1 },
  { key: 'momo-card', title: 'Keepstone training', description: 'Pick one extra card of your nature at the start of a Fernling-Arena run.', cost: 180, max: 1 },
];
export function purchaseUpgrade(key) {
  const item = UPGRADES.find(x => x.key === key), level = upgradeLevel(key), p = profile();
  if (!item || level >= item.max || p.coins < item.cost * (level + 1)) return false;
  p.coins -= item.cost * (level + 1); p.upgrades[key] = level + 1; save(); return true;
}
const games = ['fern-rangers', 'pips-tower', 'momo', 'tanks'];
const JOBS = [
  { id: 'stars', title: 'A good start', description: 'Earn three new campaign stars.', target: 3, reward: 50, measure: () => games.reduce((n, id) => n + starsTotal(id), 0) },
  { id: 'score', title: 'For Fernhaven', description: 'Improve your campaign best scores by 1,000 points in total.', target: 1000, reward: 70, measure: () => games.reduce((n,id) => n + Object.values(profile().games[id]?.best ?? {}).reduce((a,b)=>a+b,0),0) },
  { id: 'boss', title: 'Open roads', description: 'Defeat a campaign boss you have not beaten yet.', target: 1, reward: 100, measure: () => games.reduce((n,id) => n + Object.entries(profile().games[id]?.stars ?? {}).filter(([k,v]) => k.endsWith('boss') && v > 0).length,0) },
];
export function jobs() {
  const today = dailyKey(), p = profile();
  return JOBS.map(j => { const entry = p.daily?.canteenJobs?.[today]?.[j.id]; return { ...j, active: !!entry, claimed: !!entry?.claimed, progress: entry ? Math.max(0, Math.min(j.target, j.measure() - entry.start)) : 0 }; });
}
export function acceptJob(id) {
  const job = JOBS.find(j => j.id === id), p = profile(), today = dailyKey(); if (!job) return false;
  p.daily.canteenJobs ||= {}; p.daily.canteenJobs[today] ||= {};
  if (p.daily.canteenJobs[today][id]) return false;
  p.daily.canteenJobs[today][id] = { start: job.measure(), claimed: false }; save(); return true;
}
export function claimJob(id) {
  const job = jobs().find(j => j.id === id); if (!job?.active || job.claimed || job.progress < job.target) return false;
  const p = profile(); p.daily.canteenJobs[dailyKey()][id].claimed = true; p.coins += job.reward; save(); return true;
}

export const TOURNAMENT_RINGS = [
 {id:'fern',title:'Fern green',color:'#55b582',cost:0},
 {id:'gold',title:'Sun gold',color:'#e5bc55',cost:50},
 {id:'sky',title:'Sky blue',color:'#6ab9dc',cost:50},
 {id:'violet',title:'Dusk violet',color:'#ae89ce',cost:50},
];
export function selectTournamentRing(id) {
 const item=TOURNAMENT_RINGS.find(x=>x.id===id),p=profile();if(!item)return false;
 const key=`tournament-ring:${id}`,owned=id==='fern'||p.cosmetics.owned.includes(key);
 if(!owned){if(p.coins<item.cost)return false;p.coins-=item.cost;p.cosmetics.owned.push(key);}
 p.cosmetics.equipped['tournament-ring']=id;save();return true;
}
