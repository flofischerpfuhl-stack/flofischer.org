/** Preserve the original 44 campaign IDs; unlock and persist Sturmbastion separately. */
export const MAIN_ID = 'fern-rangers', BONUS_ID = 'fern-rangers-sturmbastion';
export function createRangersProgress(Profile, levels) {
    const counts = new Map();
    const keys = levels.map((level, index) => {
        if (level.mode === 'sturmbastion') {
            const n = index - 44 + 1;
            if (n < 1 || n > 11 || level.world !== 4 || level.progressId !== `sb-${String(n).padStart(2, '0')}`)
                throw new Error('Invalid Sturmbastion progress metadata');
            return { world: 5, n, id: level.progressId, gameId: BONUS_ID, bonus: true };
        }
        if (index >= 44 || !Number.isInteger(level.world) || level.world < 0 || level.world > 3)
            throw new Error('Invalid Rangers campaign metadata');
        const world = level.world + 1;
        const n = level.boss ? 'boss' : (counts.get(world) ?? 0) + 1;
        if (!level.boss)
            counts.set(world, n);
        return { world, n, id: Profile.levelId(world, n), gameId: MAIN_ID, bonus: false };
    });
    const keyOf = index => { if (!Number.isInteger(index) || !keys[index])
        throw new Error('Invalid Rangers level index'); return keys[index]; };
    const unlocked = () => (Profile.game(MAIN_ID).stars['w4-boss'] ?? 0) > 0;
    const star = index => { const key = keyOf(index); return Profile.game(key.gameId).stars[key.id] ?? 0; };
    const bestOf = index => { const key = keyOf(index); return Profile.game(key.gameId).best[key.id] ?? 0; };
    function open(index) {
        if (!Number.isInteger(index) || !keys[index])
            return false;
        const key = keys[index];
        if (!key.bonus)
            return Profile.levelOpen(MAIN_ID, key.world, key.n);
        return unlocked() && (key.n === 1 || (Profile.game(BONUS_ID).stars[`sb-${String(key.n - 1).padStart(2, '0')}`] ?? 0) > 0);
    }
    return {
        keys, star, bestOf, open, bonusUnlocked: unlocked,
        get stars() { return keys.map((_, i) => star(i)); },
        get best() { return keys.map((_, i) => bestOf(i)); },
        worldOpen: world => world === 4 ? unlocked() : Number.isInteger(world) && world >= 0 && world < 4 && Profile.worldOpen(MAIN_ID, world + 1),
        need: world => world === 4 ? 'Finish the main campaign to unlock the Sturmbastion.' : `Beat the boss of world ${world} and collect ${Profile.STAR_GATES[world]} stars.`,
        finish(index, result) {
            const key = keyOf(index);
            // UI state is not the authority: reject directly invoked locked bonus runs too.
            if (key.bonus && !open(index))
                throw new Error('Sturmbastion level is locked');
            const wasUnlocked = unlocked();
            const out = Profile.finishLevel(key.gameId, key.id, result);
            out.bonusUnlocked = false;
            if (!wasUnlocked && unlocked() && !Profile.game(BONUS_ID).unlockNotified) {
                Profile.game(BONUS_ID).unlockNotified = true;
                Profile.save();
                out.bonusUnlocked = true;
            }
            return out;
        },
    };
}
