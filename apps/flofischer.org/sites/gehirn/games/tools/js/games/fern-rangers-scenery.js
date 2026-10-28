import { THREE as T, applyIbl } from './three-kit.js';
import { Batch, mtx } from './world/decor.js';
/** Small authored settlements/terraces, merged per 32m visibility chunk. */
export class RangerSettlements {
    static async create(library, scene, world, env) {
        const self = new RangerSettlements();
        self.group = new T.Group();
        scene.add(self.group);
        self.chunks = [];
        const ids = ['fw_wall_stone_straight', 'fw_door_oak_iron', 'fw_window_shutters', 'fw_roof_gentle', 'fw_paving_stone', world === 3 ? 'fw_cloud_storm_anvil' : 'fw_cloud_cumulus', world === 0 ? 'fw_terrain_grass_profile' : world === 1 ? 'fw_terrain_sand_profile' : world === 2 ? 'fw_snow_wind_drift' : 'fw_basalt_columns'];
        const models = new Map(await Promise.all(ids.map(async (id) => [id, await library.model(id, 'lo')])));
        const bins = Array.from({ length: 8 }, () => ({ matte: new Batch(), glow: new Batch() }));
        const add = (id, x, y, z, rot = 0, scale = 1) => { const k = Math.max(0, Math.min(7, Math.floor(-z / 32))), b = bins[k], matrix = mtx([x, y, z], [0, rot, 0], scale); for (const g of models.get(id))
            (g.mat === 'glow' ? b.glow : b.matte).add(g.geometry, matrix); };
        for (const off of [0, -128])
            for (const side of [-1, 1]) {
                for (const baseZ of [-20, -83]) {
                    const x = side * (baseZ === -20 ? 9 : 13), z = baseZ + off, yaw = -side * Math.PI / 2;
                    const place = (id, dx, dy, dz, rot = 0) => { const c = Math.cos(yaw), s = Math.sin(yaw); add(id, x + dx * c + dz * s, dy, z - dx * s + dz * c, yaw + rot); };
                    place('fw_paving_stone', 0, 0, 0);
                    place('fw_door_oak_iron', 0, .05, 1.3);
                    place('fw_wall_stone_straight', 0, .05, -1.3, Math.PI);
                    place('fw_window_shutters', 1.3, .05, 0, Math.PI / 2);
                    place('fw_window_shutters', -1.3, .05, 0, -Math.PI / 2);
                    place('fw_roof_gentle', 0, 2.65, 0);
                }
                const terrain = ids.at(-1);
                for (let i = 0; i < 4; i++)
                    add(terrain, side * (17 + i % 2 * 10), world === 0 || world === 1 ? -.3 : 0, off - i * 32 - 9, side * .6, world === 2 ? 3 : 2.8);
                add(ids.at(-2), side * 26, 16, off - 70, 0, 2.4);
            }
        bins.forEach((b, i) => { const g = new T.Group(); if (!b.matte.empty)
            g.add(b.matte.mesh()); if (!b.glow.empty)
            g.add(b.glow.mesh({ glow: true })); g.userData.z = -(i + .5) * 32; self.chunks.push(g); self.group.add(g); });
        applyIbl(self.group, env, .55);
        return self;
    }
    update(pos) { const offset = ((pos % 128) + 128) % 128; this.group.position.z = offset; for (const c of this.chunks)
        c.visible = c.userData.z + offset > -150 && c.userData.z + offset < 32; }
    dispose() { this.group.removeFromParent(); this.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
}
