import { THREE as T, addLights, applyIbl, projector, TextPlane, Particles } from './three-kit.js';
import { RangersArt, transform } from './fern-rangers-art.js';
import { propClips } from './fern-rangers-props.js';
import { gateX } from './fern-rangers-sturmbastion.js';
import { Batch, mtx } from './world/decor.js';
/** A fixed corridor shares the game's WebGL context. Logical group strength is
 * independent of this 160-person visual sample. All source scales are metres. */
export class Sturmbastion3D {
    constructor(renderer, env) { this.renderer = renderer; this.env = env; this.scene = new T.Scene(); this.scene.background = new T.Color(0xa3c4ce); this.scene.fog = new T.Fog(0xa3c4ce, 65, 100); this.camera = new T.PerspectiveCamera(54, 1, .1, 140); this.camera.position.set(0, 22, 15); this.camera.lookAt(0, 0, -17); addLights(this.scene, { shadowBox: 20, mapSize: 1024 }); this.art = new RangersArt(this.scene, env); this.props = new Map(); this.labels = []; this.static = new T.Group(); this.scene.add(this.static); this.w = 1; this.h = 1; }
    async prepare(s) {
        if (!this.loaded) {
            await this.art.prepareTroops();
            for (const id of ['KLONK', 'HULK'])
                await this.art.batch(id, 160, 'far');
            for (const id of ['STURMBASTION_CORRIDOR_TILE', 'STURMBASTION_GATE_FRAME', 'STURMBASTION_DEFLECTOR', 'ROAD_BLOCK']) {
                const t = await this.art.template(id, 'lo');
                this.props.set(id, await this.art.batch(id, 60, 'lo', propClips(t)));
            }
            this.sender = await this.art.actor('STURMBASTION_SENDER', 'lo');
            this.barrier = await this.art.actor('STURMBASTION_NUMBER_BARRIER', 'lo');
            this.core = await this.art.actor('STURMBASTION_NUMBER_BARRIER', 'lo');
            const base = new Batch(), glow = new Batch();
            // Harbour wall, quay lamps and vegetation are shared authored channel assets.
            for (const id of ['fw_wall_stone_straight', 'fw_street_light_sporecell', 'fw_basalt_columns', 'meadow_reed', 'fw_bridge_wood']) {
                const groups = await this.art.library.model(id, 'lo');
                for (let k = 0; k < (id === 'fw_bridge_wood' ? 2 : 5); k++)
                    for (const side of [-1, 1]) {
                        const x = side * ({ fw_wall_stone_straight: 8, fw_street_light_sporecell: 6.2, fw_basalt_columns: 14, meadow_reed: 10.5, fw_bridge_wood: 9 }[id]), z = -k * (id === 'fw_bridge_wood' ? 28 : 12) - 4;
                        for (const g of groups)
                            (g.mat === 'glow' ? glow : base).add(g.geometry, mtx([x, id === 'fw_basalt_columns' ? -.45 : -.05, z], [0, id === 'fw_wall_stone_straight' ? Math.PI / 2 : side * .3, 0], 1));
                    }
            }
            this.static.add(base.mesh(), glow.mesh({ glow: true }));
            for (const side of [-1, 1]) {
                const quay = new T.Mesh(new T.BoxGeometry(6, 1.2, 64), new T.MeshStandardMaterial({ color: 0x657879, roughness: .9 }));
                quay.position.set(side * 8, -.65, -28);
                this.static.add(quay);
            }
            const water = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshStandardMaterial({ color: 0x377e92, roughness: .22, metalness: .2 }));
            water.rotation.x = -Math.PI / 2;
            water.position.set(0, -.15, -30);
            this.static.add(water);
            for (let i = 0; i < 36; i++) {
                const p = new TextPlane(2.5, .65, 256);
                this.scene.add(p.mesh);
                this.labels.push(p);
            }
            this.transport = new Particles(this.scene, 24, new T.OctahedronGeometry(.14), new T.MeshBasicMaterial({ color: 0x85e4ff }));
            this.tempo = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x53d8da, transparent: true, opacity: .32, depthWrite: false }));
            this.tempo.rotation.x = -Math.PI / 2;
            this.scene.add(this.tempo);
            applyIbl(this.scene, this.env, .55);
            this.loaded = true;
        }
        this.session = s;
        this.render(s);
        await this.renderer.compileAsync(this.scene, this.camera);
    }
    resize(w, h) { this.w = w; this.h = h; this.camera.aspect = w / h; this.camera.fov = w < h ? 63 : 48; this.camera.updateProjectionMatrix(); }
    put(id, x, z, { y = 0, clip = 'Rest', time = 0, yaw = 0, width = 1 } = {}) { const m = transform(x, y, -z, yaw).clone(); m.scale(new T.Vector3(width, 1, 1)); this.props.get(id).add(m, clip, time, { loop: false }); }
    text(text, x, y, z, width = 2.5, fill = '#fff') { const p = this.labels[this.labelCount++]; if (!p)
        return; p.set(text, { fill }); p.mesh.visible = true; p.mesh.position.set(x, y, -z + .55); p.mesh.material.depthTest = false; p.mesh.renderOrder = 5; p.mesh.scale.x = width / 2.5; p.mesh.quaternion.copy(this.camera.quaternion); }
    render(s) {
        if (!this.loaded)
            return;
        this.art.begin();
        this.labelCount = 0;
        for (const p of this.labels)
            p.mesh.visible = false;
        for (let z = 0; z <= 56; z += 8)
            this.put('STURMBASTION_CORRIDOR_TILE', 0, z);
        for (const [i, g] of s.L.gates.entries()) {
            const x = gateX(g, s.t);
            this.put('STURMBASTION_GATE_FRAME', x, g.z, { width: g.width / 2.2 });
        }
        for (const b of s.L.blocks || [])
            this.put('ROAD_BLOCK', gateX(b, s.t), b.z, { width: b.width / 2.01 });
        this.barrier.scene.visible = !!s.barrier;
        if (s.barrier) {
            const b = s.barrier;
            this.barrier.scene.position.set(b.x, 0, -b.z);
            this.barrier.pose(b.hp ? 'Idle' : 'Deplete', b.hp ? 0 : s.t - b.openedAt);
            this.text(String(b.hp), b.x, 2.65, b.z);
        }
        this.core.scene.visible = true;
        this.core.scene.position.set(0, 0, -s.L.length - 1);
        this.core.scene.scale.set(2, 1, 1);
        this.core.pose(s.core ? 'Idle' : 'Deplete', s.result ? s.t - (this.resultAt ?? s.t) : 0);
        if (s.result && this.resultAt == null)
            this.resultAt = s.t;
        if (!s.result)
            this.resultAt = null;
        if (s.L.deflector) {
            const d = s.L.deflector, phase = Math.sin(s.t * d.speed);
            this.put('STURMBASTION_DEFLECTOR', -2, d.z, { clip: phase < 0 ? 'MotionLeft' : 'MotionRight', time: Math.abs(phase) * .5 });
        }
        this.sender.scene.visible = true;
        this.sender.scene.position.set(s.px, 0, 0);
        this.sender.scene.rotation.y = Math.PI;
        this.sender.pose(s.reserve > 0 ? 'Release' : 'Idle', s.reserve > 0 ? (s.t % s.L.emitEvery) / s.L.emitEvery * .4 : 0, false);
        const head = this.sender.scene.getObjectByName('HeadPivot');
        if (head)
            head.rotation.y = Math.max(-.349, Math.min(.349, (s.tx - s.px) * .12));
        this.tempo.visible = !!s.L.tempo;
        if (s.L.tempo) {
            const t = s.L.tempo;
            this.tempo.position.set(t.x, .035, -t.z - t.length / 2);
            this.tempo.scale.set(t.width, t.length, 1);
        }
        // Sample across the full front, instead of truncating the first groups. Labels
        // expose exact aggregate strength even when one figure represents many people.
        const cells = new Map();
        for (const g of s.groups) {
            if (g.n <= 0)
                continue;
            const key = `${g.side}:${Math.round(g.x * 2)}:${Math.floor(g.z / 1.5)}:${g.heavy}`;
            let c = cells.get(key);
            if (!c) {
                c = { ...g };
                cells.set(key, c);
            }
            else
                c.n += g.n;
        }
        const alive = [...cells.values()], budget = 128, per = Math.max(1, Math.floor(budget / Math.max(1, alive.length))), stride = Math.max(1, Math.ceil(alive.length / budget));
        let used = 0;
        for (let k = 0; k < alive.length && used < budget; k += stride) {
            const g = alive[k], n = Math.min(g.n, per, budget - used, 6);
            for (let i = 0; i < n; i++) {
                const x = g.x + (i % 3 - 1) * .56, z = g.z - Math.floor(i / 3) * .45;
                if (g.side === 1) {
                    let species = (g.id + i) % 15 + 1;
                    this.art.troop(species, x, -z, s.t, { yaw: Math.PI });
                }
                else
                    this.art.machine(g.heavy ? 'blorb' : 'zorbling', x, -z, s.t, { active: true, speed: s.L.speed, phase: g.id * .1 });
                used++;
            }
            if (g.n > 6 && this.labelCount < 33 && k % Math.max(1, Math.ceil(alive.length / 10)) === 0)
                this.text(String(g.n), g.x, 2.1, g.z, 1.5, g.side === 1 ? '#d7f7ff' : '#ffca95');
        }
        this.art.troop(0, Math.min(4.2, s.px + 1.1), -.6, s.t, { yaw: Math.PI });
        this.transport.begin();
        for (const e of s.visualEvents.slice(-20)) {
            const age = s.t - e.time;
            if (age < .5)
                this.transport.add(e.x, 1 + age * 3, -e.z, .4, 0x8ff0ff, age * 6);
        }
        this.transport.end();
        this.art.end();
        this.renderer.render(this.scene, this.camera);
    }
    projectFn() { const pr = projector(this.camera, this.w, this.h); return (x, z, h = 0) => { const a = pr(x, h, -z), b = pr(x + 1, h, -z); return { x: a.x, y: a.y, s: Math.hypot(b.x - a.x, b.y - a.y) }; }; }
    layoutFor() { const p = this.projectFn(), a = p(0, 0), b = p(1, 0); return { ppu: b.x - a.x, cx: a.x, toWorldX: x => (x - a.x) / (b.x - a.x) }; }
    dispose() { this.art.dispose(); const geometries = new Set(), materials = new Set(); this.scene.traverse(o => { if (o.geometry)
        geometries.add(o.geometry); for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
        materials.add(m); }); for (const g of geometries)
        g.dispose(); for (const m of materials) {
        m.map?.dispose();
        m.dispose();
    } }
}
