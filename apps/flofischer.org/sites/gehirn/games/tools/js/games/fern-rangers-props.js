/** Native interactive props. Motion is evaluated in bounded GPU batches; only
 * boss/escape capsules retain a scene graph for live authored socket queries. */
import { THREE as T, TextPlane, applyIbl } from './three-kit.js';
import { gateGood, gateText, laserOn, laserWarn, geyserState } from './fern-rangers.js';
import { RANGER_SCALE } from './fern-rangers-formation.js';
import { PICKUP_ASSET, transform, ownMaterials } from './fern-rangers-art.js';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function propClips(template) {
    const idle = new T.AnimationClip('Rest', 1, [new T.VectorKeyframeTrack('.position', [0, 1], [...template.scene.position, ...template.scene.position])]);
    const clips = [idle, ...template.animations];
    const node = template.id === 'MINER_CAGE' ? 'DoorPivot' : template.id === 'FERNSTONE_WEAPON_CASE' ? 'LidPivot' : template.id === 'LANDING_POD' ? 'HatchPivot' : null;
    if (node) {
        const o = template.scene.getObjectByName(node);
        if (!o)
            throw new Error(`Missing authored ${template.id}/${node}`);
        const axis = new T.Vector3(template.id === 'FERNSTONE_WEAPON_CASE' ? 1 : 0, template.id === 'FERNSTONE_WEAPON_CASE' ? 0 : 1, 0), q = o.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(axis, -110 * Math.PI / 180));
        clips.push(new T.AnimationClip('Open', .65, [new T.QuaternionKeyframeTrack(node + '.quaternion', [0, .65], [...o.quaternion, ...q])]));
    }
    return clips;
}
export class RangerProps {
    constructor(scene, art, env) { this.scene = scene; this.art = art; this.env = env; this.batches = new Map(); this.labels = []; this.labelIndex = 0; this.v = new T.Vector3(); this.q = new T.Quaternion(); this.scale = new T.Vector3(); this.m = new T.Matrix4(); this.temp = new T.Matrix4(); this.fx = []; this.lastTurret = false; this.hazard = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ transparent: true, opacity: .65, depthWrite: false }), 96); this.hazard.instanceMatrix.setUsage(T.DynamicDrawUsage); this.hazard.frustumCulled = false; this.scene.add(this.hazard); this.hazardCount = 0; this.color = new T.Color(); }
    async prepare(s,{onProgress,signal}={}) {
        const check=()=>signal?.throwIfAborted();check();
        const ids = new Set(['LANDING_POD', 'ESCAPE_POD', 'FERNSTONE_GRENADE']);
        for (const e of s.ents) {
            const id = this.id(e);
            if (id)
                ids.add(id);
            if (e.kind === 'gate')
                for (const g of ['LANDING_GATE_FRAME', 'JAMMER_GATE_FRAME', 'FIRE_RATE_CELL_GATE'])
                    ids.add(g);
        }
        if (s.ents.some(e => e.kind === 'pickup' && e.type === 'turret'))
            ids.add('TURRET_DROP');
        for (const id of ids) {
            check();if(this.batches.has(id))continue;onProgress?.({phase:'prepare',stage:'Feldausrüstung vorbereiten …',id,done:false});
            const t = await this.art.template(id, 'lo');
            this.batches.set(id, await this.art.batch(id, 100, 'lo', propClips(t)));
        }
        if (s.ents.some(e => e.kind === 'cage'))
            for (const id of ['MINER_HUMAN', 'MINER_HALFGROWN', 'MINER_DWARF'])
                await this.art.batch(id, 16, 'lo');
        if(s.ents.some(e=>e.kind==='fork'))await this.art.channel('fw_wall_stone_straight',320);
        if(!this.escapePod){
        const escape = await this.art.library.create('ESCAPE_POD', 'lo');
        escape.materials = ownMaterials(escape.scene);
        this.scene.add(escape.scene);
        escape.scene.visible = false;
        applyIbl(escape.scene, this.env, .55);
        this.escapePod = escape;
        }
        if (ids.has('TURRET_DROP')&&!this.turretActor)
            this.turretActor = await this.art.actor('TURRET_DROP', 'lo');
        for (let i = this.labels.length; i < 40; i++) {
            const p = new TextPlane(2.2, .46, 256);
            p.mesh.visible = false;
            this.scene.add(p.mesh);
            this.labels.push(p);
        }
        if(!this.fx.length){
        const glow = new T.MeshBasicMaterial({ color: 0x7ee7ff, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending });
        for (let i = 0; i < 12; i++) {
            const o = new T.Mesh(new T.CylinderGeometry(.3, .6, 3, 12, 1, true), glow);
            o.visible = false;
            this.scene.add(o);
            this.fx.push(o);
        }
        }check();this.reset();
    }
    reset(){this.begin();this.lastTurret=false;this.escapeFor=null;this.escapeStart=null;this.turretAt=undefined;this.hazard.count=0;}
    id(e) { return e.kind === 'gate' ? (e.op === 'rate' ? 'FIRE_RATE_CELL_GATE' : gateGood(e) ? 'LANDING_GATE_FRAME' : 'JAMMER_GATE_FRAME') : e.kind === 'pickup' ? PICKUP_ASSET[e.type] : ({ barrel: 'FUEL_BARREL', crate: 'FERNSTONE_WEAPON_CASE', cage: 'MINER_CAGE', block: 'ROAD_BLOCK', laser: 'LASER_FENCE_PYLON', fork: null, geyser: 'LAVA_GEYSER_RIM' })[e.kind]; }
    begin() { this.labelIndex = 0; this.hazardCount = 0; for (const p of this.labels)
        p.mesh.visible = false; for (const f of this.fx)
        f.visible = false; if (this.escapePod)
        this.escapePod.scene.visible = false; if (this.turretActor)
        this.turretActor.scene.visible = false; }
    put(id, x, y, z, { yaw = 0, size = 1, clip = 'Rest', time = 0, loop = false, width = 1, height = 1 } = {}) { const b = this.batches.get(id); if (!b)
        throw new Error(`Unprepared native prop ${id}`); const m = transform(x, y, z, yaw, size); m.scale(new T.Vector3(width, height, 1)); b.add(m, clip, time, { loop }); }
    text(text, x, y, z, width = 2.2, fill = '#fff') { const label = this.labels[this.labelIndex++]; if (!label)
        return; label.set(text, { fill }); label.mesh.visible = true; label.mesh.position.set(x, y, z); label.mesh.scale.x = width / 2.2; }
    entity(e, s, z, age) {
        if (!e.alive && age > (e.kind==='cage'?4.5:3))
            return;
        const x = e.x ?? ((e.x0 + e.x1) / 2), id = this.id(e);
        if (e.kind === 'gate') {
            if (!e.alive)
                return;
            const width = e.x1 - e.x0, scale = width / (e.op === 'rate' ? 3.2 : 4.4);
            this.put(id, x, 0, -z, { width: scale, height: .78 });
            // Large, camera-projected decision text is drawn by session.drawLabels.
        }
        else if (e.kind === 'cage') {
            this.put(id,x,0,-z,{size:RANGER_SCALE,clip:e.alive?'Rest':'Open',time:age});
            for (let i = 0; i < 3; i++) {
                const name = ['MINER_HUMAN', 'MINER_HALFGROWN', 'MINER_DWARF'][i];
                const elapsed=Math.max(0,age-.72), out=!e.alive&&age>.72;
                // Human stays genuinely crouched until the back of the swept
                // capsule clears the roof. Locomotion time matches translation.
                const crouchExit=1.3, crouchSpeed=.198*4;
                const distance=!out?.12:i===0?.12+Math.min(elapsed,1.18/crouchSpeed)*crouchSpeed+Math.max(0,elapsed-1.18/crouchSpeed)*.924:.12+elapsed;
                const crouched=i===0&&distance<crouchExit, cheering=distance>2.4;
                const clip=crouched?'Duck_Crouch':!out?'Idle':cheering?'Rescue_Cheer':'Walk';
                const time=crouched?(out?elapsed*4:s.t):!out?s.t:cheering?elapsed-2.2:elapsed/[.924,.588,.168][i];
                const floor=.305*(1-clamp((distance-crouchExit)/.35));
                this.art.batches.get(name+':lo').add(transform(x+(i-1)*.65*RANGER_SCALE,floor*RANGER_SCALE,-z+Math.min(2.5,distance)*RANGER_SCALE,0,RANGER_SCALE),clip,time,{loop:!cheering});
            }
        }
        else if (e.kind === 'crate') {
            this.put(id, x, 0, -z, { clip: e.alive ? 'Rest' : 'Open', time: age });
        }
        else if (e.kind === 'block') {
            const width = e.x1 - e.x0;
            this.put(id, x, 0, -z, { size: width / 2.01 });
        }
        else if (e.kind === 'fork') {
            for(let d=0;d<e.len;d+=.65)this.art.channels.get('fw_wall_stone_straight').add(x,0,-z-d,Math.PI/2,.25);
        }
        else if (e.kind === 'laser') {
            this.put(id, e.x0, 0, -z);
            this.put(id, e.x1, 0, -z);
            if (laserOn(e, s.t) || (laserWarn(e, s.t) && Math.sin(s.t * 40) > 0))
                for (const y of [.35, .7, 1.05])
                    this.hazardBox(x, y, -z, e.x1 - e.x0, .045, .045, 0xff3e55);
        }
        else if (e.kind === 'ice')
            this.hazardBox(x, .025, -z - e.len / 2, e.x1 - e.x0, .025, e.len, 0xb6e5fa);
        else if (e.kind === 'geyser') {
            this.put(id, x, 0, -z);
            const st = geyserState(e, s.t);
            if (st === 'burst')
                this.hazardBox(x, 1.3, -z, .6, 2.6, .6, 0xff9a32);
            if (st === 'warn')
                this.hazardBox(x, .03, -z, 1.2, .03, 1.2, 0xffdb65);
        }
        else if (id && e.alive)
            this.put(id, x, e.kind === 'pickup' ? .16 + Math.sin(s.t * 3) * .06 : 0, -z, { yaw: e.kind === 'pickup' ? s.t * .5 : 0 });
    }
    events(s) {
        for (const g of s.throws || [])
            if (!g.done) {
                const k = Math.min(1, g.t / g.dur);
                this.put('FERNSTONE_GRENADE', g.x0 + (g.tx - g.x0) * k, .6 + Math.sin(k * Math.PI) * 2.6, -(g.d0 + (g.td - g.d0) * k - s.pos), { yaw: s.t * 5 });
            }
        let f = 0, pods = 0;
        for (const e of [...(s.visualEvents || [])].reverse()) {
            const age = s.t - e.time, z = -(e.d - s.pos);
            if (e.type === 'recall' && age < .7 && f < this.fx.length) {
                const beam = this.fx[f++];
                beam.visible = true;
                beam.position.set(e.x, 1.4 + age * 3, z);
                beam.scale.setScalar(1 - age * .6);
            }
            if (e.type === 'reinforcement' && age < 4 && pods++ < 2) {
                const x = e.x >= 0 ? -4.8 : 4.8, y = age < .55 ? (1 - age / .55) ** 2 * 5 : age > 3 ? (age - 3) ** 2 * 6 : 0;
                // Human doorway contract requires uniform 3.97x pod. It lands beside the
                // road and opens only on the ground; personnel exit after .72 seconds.
                this.put('LANDING_POD', x, y*RANGER_SCALE, z, { size: 3.97*RANGER_SCALE, clip: age > .55 ? 'Open' : 'Rest', time: age - .55 });
                if (age > 1.27 && age < 3) {
                    const exit = clamp((age - 1.27) / .65), walk = clamp((age - 1.92) / .85);
                    this.art.troop(2, x + Math.sign(-x) * walk * 2.3*RANGER_SCALE, z + (0.51 + exit * .4) * 3.97*RANGER_SCALE, s.t, { size:RANGER_SCALE,y: .215 * 3.97*RANGER_SCALE * (1 - clamp((exit - .65) / .35)), yaw: walk ? Math.sign(-x) * Math.PI / 2 : 0 });
                }
            }
        }
    }
    turret(s) {
        if (!this.turretActor)
            return;
        const on = s.buffs.turret > 0 && !(s.result && !s.result.won), a = this.turretActor;
        if (on && !this.lastTurret)
            this.turretAt = s.turretAt ?? s.t;
        this.lastTurret = on;
        a.scene.visible = on;
        if (!on)
            return;
        const age = s.t - this.turretAt, unfold = clamp(age / .45);
        a.scene.position.set(s.turretX, age < .45 ? .55 : Math.max(0, 1 - (age - .45) / .4) * .55, -1.2);
        for (const name of ['Leg0', 'Leg1', 'Leg2']) {
            const b = a.scene.getObjectByName(name);
            if (!b)
                throw new Error('Turret leg bone missing');
            b.userData.restQ ??= b.quaternion.clone();
            b.quaternion.copy(b.userData.restQ).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 3 * (1 - unfold)));
        }
        a.scene.rotation.y = Math.PI;
        // Legs are authored deployed. Landing is complete before its first shot;
        // only the independent yaw/recoil pivots move afterwards.
        const yaw = a.scene.getObjectByName('TurretYaw'), recoil = a.scene.getObjectByName('RecoilPivot');
        if (yaw)
            yaw.rotation.y = Math.sin(s.t * 2) * .12;
        if (recoil) {
            recoil.userData.restZ ??= recoil.position.z;
            recoil.position.z = recoil.userData.restZ - Math.max(0, s.muzzle || 0) * .06;
        }
    }
    escape(actor, e, s, age) {
        const release = { tank: .85, drill: 1.05, walker: 1.1, mothership: .8 }[e.boss];
        if (age < release || age > 4.5)
            return;
        const pod = this.escapePod.scene, dock = actor.scene.getObjectByName({ tank: 'escapePodSocket', drill: 'escapePodDock', walker: 'PodDock', mothership: 'EscapePodDock' }[e.boss]);
        if (!dock)
            throw new Error('Boss escape dock missing');
        const factor = { tank: .854841305603081, drill: 1, walker: .7021910724596737, mothership: 1 }[e.boss];
        if (this.escapeFor !== e) {
            this.escapeFor = e;
            actor.pose('EscapeHatch', release);
            dock.updateWorldMatrix(true, false);
            this.escapeStart = dock.matrixWorld.clone();
            actor.pose('EscapeHatch', age);
        }
        this.escapeStart.decompose(this.v, this.q, this.scale);
        this.scale.multiplyScalar(factor);
        const lift = age - release;
        pod.visible = true;
        pod.quaternion.copy(this.q);
        pod.scale.copy(this.scale);
        pod.position.copy(this.v);
        const localDock = pod.getObjectByName('StartDock').position.clone().multiply(this.scale).applyQuaternion(this.q);
        pod.position.sub(localDock);
        // All hulls first receive a straight upright clearance. Equality's required
        // 1.2m lift is completed before any turn; capsules stay closed throughout.
        const rise = Math.min(1, lift / .8) * 1.5;
        pod.position.y += rise;
        if (lift > .8) {
            const t = lift - .8;
            pod.position.x += t * t * 8;
            pod.position.y += t * 4;
            pod.position.z -= t * t * 5;
            pod.rotateZ(-Math.min(.5, t * .5));
        }
        pod.updateMatrixWorld(true);
    }
    hazardBox(x, y, z, w, h, d, color) { const n = this.hazardCount++; if (n >= 96)
        throw new Error('Hazard pool exceeded'); this.m.makeScale(w, h, d).setPosition(x, y, z); this.hazard.setMatrixAt(n, this.m); this.hazard.setColorAt(n, this.color.setHex(color)); }
    end() { this.hazard.count = this.hazardCount; this.hazard.instanceMatrix.needsUpdate = true; if (this.hazard.instanceColor)
        this.hazard.instanceColor.needsUpdate = true; }
    dispose() { this.hazard.removeFromParent(); this.hazard.geometry.dispose(); this.hazard.material.dispose(); for (const p of this.labels) {
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        p.mesh.material.map?.dispose();
        p.mesh.material.dispose();
    } for (const f of this.fx) {
        f.removeFromParent();
        f.geometry.dispose();
        f.material.dispose();
    } if (this.escapePod) {
        for (const m of this.escapePod.materials)
            m.dispose();
        this.escapePod.release();
    } }
}
