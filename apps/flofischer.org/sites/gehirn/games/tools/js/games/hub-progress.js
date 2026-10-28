/** Shared canteen progression. Purchases are atomic and capped, jobs are claimed once. */
import { profile, save, upgradeLevel, dailyKey, starsTotal } from './profile.js';
export const UPGRADES = [
  { key: 'rangers-squad', title: 'Verstärkung', description: 'Ein zusätzlicher Legionär zu Beginn eines Rangers-Kampagnenlevels pro Stufe.', cost: 120, max: 3 },
  { key: 'rangers-rate', title: 'Sporenzelle', description: '5 % höhere Feuerrate pro Stufe in der Rangers-Kampagne.', cost: 160, max: 3 },
  { key: 'pip-hint', title: 'Owlberts Notizbuch', description: 'Ein optionaler Lösungshinweis pro Versuch in Pips Turm.', cost: 100, max: 1 },
  { key: 'momo-card', title: 'Keepstone-Übung', description: 'Wähle zu Beginn eines Laufs in Hexennacht eine zusätzliche Karte deiner Natur.', cost: 180, max: 1 },
];
export function purchaseUpgrade(key) {
  const item = UPGRADES.find(x => x.key === key), level = upgradeLevel(key), p = profile();
  if (!item || level >= item.max || p.coins < item.cost * (level + 1)) return false;
  p.coins -= item.cost * (level + 1); p.upgrades[key] = level + 1; save(); return true;
}
const games = ['fern-rangers', 'pips-tower', 'momo', 'tanks'];
const JOBS = [
  { id: 'stars', title: 'Ein guter Anfang', description: 'Verdiene drei neue Kampagnensterne.', target: 3, reward: 50, measure: () => games.reduce((n, id) => n + starsTotal(id), 0) },
  { id: 'score', title: 'Für Fernhaven', description: 'Verbessere deine Kampagnen-Bestwerte um insgesamt 1.000 Punkte.', target: 1000, reward: 70, measure: () => games.reduce((n,id) => n + Object.values(profile().games[id]?.best ?? {}).reduce((a,b)=>a+b,0),0) },
  { id: 'boss', title: 'Freie Wege', description: 'Schließe einen bisher unbesiegten Kampagnenboss ab.', target: 1, reward: 100, measure: () => games.reduce((n,id) => n + Object.entries(profile().games[id]?.stars ?? {}).filter(([k,v]) => k.endsWith('boss') && v > 0).length,0) },
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
 {id:'fern',title:'Farn-Grün',color:'#55b582',cost:0},
 {id:'gold',title:'Sonnengold',color:'#e5bc55',cost:50},
 {id:'sky',title:'Himmelblau',color:'#6ab9dc',cost:50},
 {id:'violet',title:'Abendviolett',color:'#ae89ce',cost:50},
];
export function selectTournamentRing(id) {
 const item=TOURNAMENT_RINGS.find(x=>x.id===id),p=profile();if(!item)return false;
 const key=`tournament-ring:${id}`,owned=id==='fern'||p.cosmetics.owned.includes(key);
 if(!owned){if(p.coins<item.cost)return false;p.coins-=item.cost;p.cosmetics.owned.push(key);}
 p.cosmetics.equipped['tournament-ring']=id;save();return true;
}
