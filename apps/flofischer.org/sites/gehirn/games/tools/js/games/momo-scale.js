/** Fernling-Arena display scale: one table. Visual only; hitboxes (MOMO_R, ENEMY r) and gameplay are untouched.
 * Scale comes from visual MASS, not height: a slim upright form and a long bulky one of the same stage must feel equally heavy.
 * NATIVE_MASS is the visual-hull volume (m^3 at scale 1, idle bind pose, from front, side and top silhouettes) of each model,
 * measured with scripts/fernling-mass.mjs. A form's scale is cbrt(target mass / native mass). Targets: every stage carries
 * STAGE_FACTOR times the mass of the one before, and all three species have the same mass at the same stage.
 */
export const NATIVE_MASS = Object.freeze({ GLIMMO: 0.0525, COALBEAR: 1.2997, EMBERWARD: 0.8329, MOSSEL: 0.0229, MOORGRIM: 0.7581, GROVEPRINCE: 1.436, PLASHLING: 0.0103, SPRAYCOUNT: 0.2298, TIDEDUKE: 1.8423, GUSTGLIDER: 1.0934 });
export const STAGE_OF = Object.freeze({ MOSSEL: 0, PLASHLING: 0, GLIMMO: 0, MOORGRIM: 1, SPRAYCOUNT: 1, COALBEAR: 1, TIDEDUKE: 2, EMBERWARD: 2, GROVEPRINCE: 2 });
/** Hero mass of a young form in m^3 (a 1.1 m Glimmo), and the factor per stage. */
export const YOUNG_MASS = 0.2;
export const STAGE_FACTOR = 2.25;
/** Wild specimens of the same form are smaller than a bonded, well-kept Fernling (linear ratio). */
export const WILD_RATIO = 0.78;
export const heroMass = (id) => YOUNG_MASS * STAGE_FACTOR ** STAGE_OF[id];
export const wildMass = (id) => (id === 'GUSTGLIDER' ? YOUNG_MASS * WILD_RATIO ** 3 : heroMass(id) * WILD_RATIO ** 3);
const scaleFor = (id, mass) => Math.cbrt(mass / NATIVE_MASS[id]);
export const heroScale = (id) => scaleFor(id, heroMass(id));
/** The flying Gustglider is no starter line: it weighs like a wild young form. */
export const wildScale = (id) => scaleFor(id, wildMass(id));
export const PLAYER_SCALE = Object.freeze(Object.fromEntries(Object.keys(STAGE_OF).map((id) => [id, heroScale(id)])));
export const ENEMY_SCALE = Object.freeze(Object.fromEntries(Object.keys(NATIVE_MASS).map((id) => [id, wildScale(id)])));
