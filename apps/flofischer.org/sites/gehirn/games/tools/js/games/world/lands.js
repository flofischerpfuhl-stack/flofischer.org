/** The land of each kind of world map; every builder returns { group, heightAt, ready, update?, release } or null. */
import { buildContinent } from './continent.js';
import { buildPlayroom } from './playroom.js';
import { buildMountain } from './mountain-body.js';
import { buildSkyIslands } from './sky-islands.js';

export async function buildLand(kind, ctx) {
  if (kind === 'continent') return buildContinent(ctx);
  if (kind === 'floating') return buildSkyIslands(ctx);
  if (kind === 'mountain') return buildMountain(ctx);
  if (kind === 'playroom') return buildPlayroom(ctx);
  return null;
}
