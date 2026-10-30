/** Fern Rangers owns these bounded render pools. Authored files stay immutable. */
import { THREE as T, MergedCrowd, BlobShadows, applyIbl } from './three-kit.js';
import { troopId, TROOP_PROFILES } from './fern-rangers-formation.js';
import { legionaryMotion } from './fern-rangers-motion.js';
import { ChannelLibrary } from '../../games-assets/fernworld/runtime/channel-library.js';
import { bakeRigid } from '../../games-assets/fernworld/runtime/baked-rigid.js';
import { BakedCrowd, bakeCrowd } from '../../games-assets/fernworld/runtime/baked-crowd.js';
export const ENEMY_ASSET = { zorbling: 'KLONK', zipper: 'DARTER', klonk: 'KLONKBOT', shield: 'SHIELD_KLONK', spitter: 'SQUIRTER', blorb: 'HULK', buzz: 'BUZZ_DRONE' };
// Screen-height calibration against the current live cast at identical cameras.
export const ENEMY_DRAW_SCALE = {zorbling:1.45,zipper:1.078,klonk:.945,shield:1.017,spitter:1.136,blorb:.939,buzz:1.034};
export const BOSS_ASSET = { tank: 'COMBINE_CRAWLER', drill: 'QUOTA_DRILL_MECH', walker: 'BRIGADIER_FROST_STRIDER', mothership: 'EQUALITY_MODULE_SHIP' };
export const PICKUP_ASSET = { medkit: 'MEDIC_CASE', grenade: 'FERNSTONE_GRENADE', freeze: 'FROST_BOMB', bubble: 'LIGHT_SHIELD_CELL', turret: 'TURRET_DROP', double: 'DAMAGE_CELL', revive: 'REVIVE_TOKEN', magnet: 'MAGNET_PICKUP' };
export const matrix = new T.Matrix4(), position = new T.Vector3(), scale = new T.Vector3(), rotation = new T.Quaternion(), Y = new T.Vector3(0, 1, 0);
export function transform(x, y, z, yaw = 0, size = 1) { return matrix.compose(position.set(x, y, z), rotation.setFromAxisAngle(Y, yaw), scale.setScalar(size)); }
const instanceTint = new T.Color(), tipMatrix = new T.Matrix4();
const materialList = o => Array.isArray(o.material) ? o.material : [o.material];
export function ownMaterials(root) { const clones = new Map(); root.traverse(o => { if (!o.material)
    return; const values = materialList(o).map(m => { if (!clones.has(m))
    clones.set(m, m.clone()); return clones.get(m); }); o.material = Array.isArray(o.material) ? values : values[0]; o.castShadow = false; }); return [...clones.values()]; }
/** Static repeats preserve each source mesh transform and share its geometry. */
export class PropBatch {
    constructor(scene, template, capacity = 128) { this.root = new T.Group(); scene.add(this.root); this.items = []; this.capacity = capacity; this.n = 0; template.scene.updateMatrixWorld(true); template.scene.traverse(o => { if (!o.isMesh)
        return; const mats = materialList(o).map(m => m.clone()), mesh = new T.InstancedMesh(o.geometry, mats.length === 1 ? mats[0] : mats, capacity); mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.root.add(mesh); this.items.push({ mesh, bind: o.matrixWorld.clone() }); }); this.tmp = new T.Matrix4(); }
    begin() { this.n = 0; }
    add(m) { if (this.n >= this.capacity)
        throw new Error('Rangers prop pool exceeded'); for (const p of this.items)
        p.mesh.setMatrixAt(this.n, this.tmp.multiplyMatrices(m, p.bind)); this.n++; }
    end() { for (const p of this.items) {
        p.mesh.count = this.n;
        p.mesh.instanceMatrix.needsUpdate = true;
    } }
    dispose() { this.root.removeFromParent(); for (const p of this.items) {
        for (const m of materialList(p.mesh))
            m.dispose();
        p.mesh.dispose();
    } }
}
/** Rigid batches with a separately continuous wheel/rotor layer. Atlas samples
 * short body states; every wheel keeps its unbounded controller phase. No mixers
 * or independently allocated scene graph per combatant. */
class RotaryBatch {
    constructor(scene, template, capacity) {
        this.id = template.id;
        this.capacity = capacity;
        this.n = 0;
        this.root = new T.Group();
        scene.add(this.root);
        const rotary = this.id === 'BUZZ_DRONE' ? ['Rotor_L', 'Rotor_R'] : ['WheelL', 'WheelR'];
        const clips = template.animations.filter(c => !c.userData?.animationRole?.includes('layer')).map(c => { const out = c.clone(); out.tracks = out.tracks.filter(t => !rotary.some(n => t.name.startsWith(n + '.'))); return out; });
        this.atlas = bakeRigid({ ...template, animations: clips }, { fps: 24 });
        this.clips = new Map(this.atlas.clips.map(c => [c.name, c]));
        this.items = [];
        this.a = new T.Matrix4();
        this.b = new T.Matrix4();
        this.c = new T.Matrix4();
        this.r = new T.Matrix4();
        template.scene.updateMatrixWorld(true);
        this.atlas.sourceMeshes.forEach((source, bone) => { const mats = materialList(source).map(m => m.clone()), mesh = new T.InstancedMesh(source.geometry, mats.length === 1 ? mats[0] : mats, capacity); mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.root.add(mesh); let wheel = source; while (wheel && !rotary.includes(wheel.name))
            wheel = wheel.parent; const child = wheel ? new T.Matrix4().copy(wheel.matrixWorld).invert().multiply(source.matrixWorld) : null; this.items.push({ mesh, bone, child, inverse: child?.clone().invert(), sign: wheel?.name.endsWith('_R') ? -1 : 1 }); });
    }
    begin() { this.n = 0; }
    add(m, name, time, { speed = 1, phase = time, loop = true, tint } = {}) {
        if (this.n >= this.capacity)
            throw new Error('Rangers machine pool exceeded');
        const clip = this.clips.get(name) || this.clips.values().next().value, t = loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(Math.max(0, time), clip.duration), frame = clip.start + Math.round(t * clip.rate), rate = this.id === 'BUZZ_DRONE' ? Math.PI * 6.6 : speed / (this.id === 'HULK' ? .24858 : .215);
        for (const p of this.items) {
            this.a.fromArray(this.atlas.parts[0].data, (frame * this.atlas.rigidNodes + p.bone) * 16);
            if (p.child) {
                if (this.id === 'BUZZ_DRONE')
                    this.r.makeRotationY(phase * rate * p.sign);
                else
                    this.r.makeRotationX(phase * rate);
                this.b.multiplyMatrices(p.inverse, this.r).multiply(p.child);
                this.a.multiply(this.b);
            }
            this.c.multiplyMatrices(m, this.a);
            p.mesh.setMatrixAt(this.n, this.c);
            if(tint) p.mesh.setColorAt(this.n,tint);
        }
        this.n++;
    }
    end() { for (const p of this.items) {
        p.mesh.count = this.n;
        p.mesh.instanceMatrix.needsUpdate = true;
        if(p.mesh.instanceColor)p.mesh.instanceColor.needsUpdate=true;
    } }
    dispose() { this.root.removeFromParent(); for (const p of this.items) {
        for (const m of materialList(p.mesh))
            m.dispose();
        p.mesh.dispose();
    } this.atlas.dispose(); }
}
class AtlasBatch {
    constructor(scene, template, capacity) { this.template=template; let skinned = false; template.scene.traverse(o => { if (o.isSkinnedMesh)
        skinned = true; }); this.atlas = (skinned ? bakeCrowd : bakeRigid)(template, { fps: template.motionFps || (template.lod === 'far' ? 12 : 24) }); this.batch = new BakedCrowd(this.atlas, capacity); this.root = this.batch.root; scene.add(this.root); this.n = 0; this.capacity = capacity; }
    begin() { this.n = 0; }
    add(m, clip, time, options = {}) { if (this.n >= this.capacity)
        throw new Error('Rangers crowd pool exceeded'); this.batch.setMatrix(this.n, m);
        if(options.tint)for(const mesh of this.batch.parts)mesh.setColorAt(this.n,options.tint);
        if (!(options.blend > 0)) {
            const c = this.batch.clipByName.get(clip), t = options.loop === false ? Math.max(0,Math.min(c.duration,time)) : ((time % c.duration)+c.duration)%c.duration;
            const frame = t*c.rate, a = Math.floor(frame), b = Math.min(c.count-1,a+1);
            this.batch.motion.setXYZ(this.n++,c.start+a,c.start+b,frame-a);
        } else this.batch.setPose(this.n++, clip, time, options); }
    end() { this.batch.setCount(this.n); this.batch.flush(); for(const mesh of this.batch.parts)if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true; }
    dispose() { this.batch.dispose(); this.atlas.dispose(); }
}
export class RangersArt {
    constructor(scene, env) { this.scene = scene; this.env = env; this.library = new ChannelLibrary(); this.batches = new Map(); this.channels = new Map(); this.templates = new Map(); this.actors = []; this.troopTemplates = []; this.shadows = new BlobShadows(scene, 680, .22); }
    async template(id, lod = 'lo') { const k = id + ':' + lod; if (!this.templates.has(k))
        this.templates.set(k, await this.library.template(id, lod)); return this.templates.get(k); }
    async batch(id, capacity = 320, lod = 'far', animations) {
        const key = id + ':' + lod;
        if (this.batches.has(key))
            return this.batches.get(key);
        const original = await this.template(id, lod);
        if(id === 'SHIELD_KLONK') {
            animations = [...original.animations, ...original.animations.map(clip=>{
                const c=clip.clone();c.name += '_Unshielded';c.tracks=c.tracks.filter(t=>t.name!=='shield.scale');
                c.tracks.push(new T.VectorKeyframeTrack('shield.scale',[0,c.duration],[.0001,.0001,.0001,.0001,.0001,.0001]));return c;
            })];
        }
        this.library.signal?.throwIfAborted();const bakeStarted=performance.now();this.library.progress({phase:'bake',id,lod,done:false});
        const template = animations ? { ...original, animations } : original, batch = id === 'TURRET_DROP' ? new PropBatch(this.scene, template, capacity) : ['BUZZ_DRONE', 'HULK', 'SQUIRTER'].includes(id) ? new RotaryBatch(this.scene, template, capacity) : new AtlasBatch(this.scene, template, capacity);
        applyIbl(batch.root, this.env, .55);
        this.batches.set(key,batch);this.library.progress({phase:'bake',id,lod,done:true,milliseconds:performance.now()-bakeStarted});
        return batch;
    }
    async channel(id, capacity = 96) { if (this.channels.has(id))
        return this.channels.get(id); const model = await this.library.model(id, 'lo'), c = new MergedCrowd(this.scene, null, capacity, { model }); this.channels.set(id, c); applyIbl(this.scene, this.env, .55); return c; }
    async actor(id, lod = 'lo') { const a = await this.library.create(id, lod); a.ownedMaterials = ownMaterials(a.scene); this.scene.add(a.scene); a.scene.visible = false; a.mixer = a.animations.length ? new T.AnimationMixer(a.scene) : null; a.actions = new Map(); a.pose = (name, time, loop = false) => { const clip = a.animations.find(c => c.name === name); if (!clip)
        throw new Error(`Missing Rangers clip ${id}/${name}`); if (a.current !== name) {
        a.mixer.stopAllAction();
        a.current = name;
        let action = a.actions.get(name);
        if (!action) {
            action = a.mixer.clipAction(clip);
            a.actions.set(name, action);
        }
        a.action = action.reset().setLoop(T.LoopOnce, 1);
        a.action.clampWhenFinished = true;
        a.action.play();
    } a.action.enabled = true; a.action.paused = false; a.action.time = loop ? time % clip.duration : Math.min(clip.duration, Math.max(0, time)); a.mixer.update(0); a.scene.updateMatrixWorld(true); }; this.actors.push(a); applyIbl(a.scene, this.env, .55); this.env.userData.shading?.apply(a.scene, { outline: 'skinned', all: true }); return a; }
    begin() { this.shadows.begin(); for (const b of this.batches.values())
        b.begin(); for (const c of this.channels.values())
        c.begin(); }
    end() { this.shadows.end(); for (const b of this.batches.values())
        b.end(); for (const c of this.channels.values())
        c.end(); }
    troop(i, x, z, time, { y = 0, yaw = Math.PI, recall = false, speed = 6, firing = 0, size = 1, lean = 0 } = {}) {
        const id = troopId(i);
        const b = this.batches.get(id + ':lo');
        if (!b) throw new Error('Unprepared Legionary ' + id);
        const phase=time+i*1.7/11, walking=speed>.5, base=recall?'Retreat':walking?'Walk':'Idle';
        const poseMatrix=transform(x,y,z,yaw,size);
        if(lean){this.leanEuler??=new T.Euler();rotation.setFromEuler(this.leanEuler.set(lean,yaw,0));poseMatrix.compose(position.set(x,y,z),rotation,scale.setScalar(size));}
        b.add(poseMatrix,base,phase,{next:walking?'WalkFire':'IdleFire',nextTime:phase,blend:recall?0:Math.max(0,Math.min(1,firing))});
        this.shadows.add(x,z,(id==='GIANT_LEGIONARY'?.7:.32)*size);
        const socket=b.muzzleSocket;if(!socket)return null;
        const o=(b.n-1)*3,frame=b.batch.motion.array[o],next=b.batch.motion.array[o+1],blend=b.batch.motion.array[o+2],data=b.atlas.parts[0].data,stride=b.atlas.rigidNodes;
        const m=this.muzzleMatrix||(this.muzzleMatrix=new T.Matrix4()),v=this.muzzlePoint||(this.muzzlePoint=new T.Vector3());
        const offset=(frame*stride+socket.bone)*16,other=(next*stride+socket.bone)*16;for(let j=0;j<16;j++)m.elements[j]=data[offset+j]*(1-blend)+data[other+j]*blend;
        return v.copy(socket.local).applyMatrix4(m).applyMatrix4(poseMatrix);
    }
    machine(type, x, z, time, { active = true, speed = 1, phase = 0, disabled = false, age = 0, near = false, split = false, hitAge = 99, fireAge = 99, wheelPhase = time, alert = 0, shield = true, frozen = false } = {}) {
        const id = ENEMY_ASSET[type], lod = near ? 'lo' : 'far', b = this.batches.get(id + ':' + lod) || this.batches.get(id + ':far');
        if (!b)
            throw new Error(`Unprepared Rangers machine ${id}`);
        let clip, t = active ? phase / 3 : time;
        if (id === 'HULK') {
            clip = disabled ? (split ? 'Disassembly' : 'Disabled') : 'WalkRoll';
            t = disabled ? age : t;
        }
        else if (id === 'SQUIRTER') {
            clip = disabled ? 'Disabled' : 'WalkRoll';
            t = disabled ? age : t;
        }
        else if (id === 'DARTER' || id === 'BUZZ_DRONE') {
            clip = disabled ? 'Disabled' : active ? (id === 'DARTER' ? 'Bank' : 'FlightTilt') : 'Hover';
            t = disabled ? age : t;
        }
        else {
            clip = disabled ? 'deactivated' : active ? 'wheel_roll_travel' : 'idle_balance';
            t = disabled ? age : active ? phase / (3 * Math.max(.1,speed)) : time;
        }
        const names = b.clipNames || (b.clipNames = b.atlas.clips.map(c => c.name));
        if (!disabled && fireAge < .32) {
            const fire = id === 'SQUIRTER' ? 'RigidFire' : id === 'DARTER' || id === 'BUZZ_DRONE' ? 'Fire' : 'weapon_recoil';
            if (names.includes(fire)) {
                clip = fire;
                t = fireAge;
            }
        }
        else if (!disabled && hitAge < .26) {
            const hit = names.includes('Hit') ? 'Hit' : 'hit_twitch';
            if (names.includes(hit)) {
                clip = hit;
                t = hitAge;
            }
        }
        if(id === 'SHIELD_KLONK' && !shield)clip += '_Unshielded';
        if(frozen && !disabled)t=phase;
        if(disabled)instanceTint.setRGB(.22,.27,.25);else if(frozen)instanceTint.setRGB(.45,.8,1);else if(hitAge<.09)instanceTint.setRGB(2.4,2.1,1.4);else instanceTint.setRGB(1,1,1);
        const settle = disabled ? Math.max(0,Math.min(1,(age-.65)/1.35)) : 0;
        const hop = !disabled && alert > 0 ? Math.abs(Math.sin(alert*14))*.35 : 0;
        const m = transform(x, hop - settle*settle*2.4, z, disabled ? Math.min(1,age/.45)*.26 : 0, ENEMY_DRAW_SCALE[type]);
        // An unmistakable tip-over starts immediately, followed by the authored
        // broken pose and a slow clean-up below the road, rather than a pop.
        if(disabled && !split) m.multiply(tipMatrix.makeRotationZ(Math.min(1,age/.5)*.52));
        b.add(m, clip, t, { loop: !disabled && hitAge >= .26 && fireAge >= .32, speed, tint:instanceTint, phase: id === 'BUZZ_DRONE' ? (disabled ? time - age + Math.min(age, 1.8) - Math.min(age, 1.8) ** 2 / 3.6 : frozen ? phase : time) : wheelPhase });
        if (settle < .8) this.shadows.add(x, z, id === 'HULK' ? .65 : .35);
    }
    async prepareHulkSockets() { if(this.hulkSockets)return; const t = await this.template('HULK', 'lo'), root = t.scene.clone(true), mixer = new T.AnimationMixer(root), action = mixer.clipAction(t.animations.find(c => c.name === 'Disassembly')); action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play(); action.time = 1.2; mixer.update(0); root.updateMatrixWorld(true); this.hulkSockets = [-1, 1].map(side => root.getObjectByName(side < 0 ? 'spawnKlonkSocketL' : 'spawnKlonkSocketR').getWorldPosition(new T.Vector3()).multiplyScalar(ENEMY_DRAW_SCALE.blorb)); mixer.stopAllAction(); mixer.uncacheRoot(root); }
    async prepareTroops() {
        if(this.troopsPrepared)return;
        for (const id of ['CAPTAIN_HAZEL','HUMAN_LEGIONARY','HALFGROWN_LEGIONARY','GIANT_LEGIONARY','DUCK_LEGIONARY']) {
            const template = legionaryMotion(id, id==='DUCK_LEGIONARY'?await this.template(id,'lo'):await this.library.model(id,'lo'));
            this.troopTemplates.push(template);
            this.library.signal?.throwIfAborted();const started=performance.now();this.library.progress({phase:'bake',id,lod:'lo',done:false});
            const b = new AtlasBatch(this.scene,template,id==='DUCK_LEGIONARY'?160:96);this.library.progress({phase:'bake',id,lod:'lo',done:true,milliseconds:performance.now()-started}); applyIbl(b.root,this.env,.55); this.batches.set(id+':lo',b);
        }
        for(const [id,profile] of Object.entries(TROOP_PROFILES)) {
            const b=this.batches.get(id+':lo');b.template.scene.updateMatrixWorld(true);
            const bone=b.atlas.sourceMeshes.findIndex(mesh=>{for(let p=mesh;p;p=p.parent)if(p.name===profile.owner)return true;return false;});
            if(bone<0)continue;const source=b.atlas.sourceMeshes[bone];
            b.muzzleSocket={bone,local:new T.Vector3(...profile.muzzle).applyMatrix4(source.matrixWorld.clone().invert())};
        }
        this.troopsPrepared=true;
    }
    reset(){this.begin();this.end();for(const a of this.actors){a.mixer?.stopAllAction();a.current=null;a.scene.visible=false;}}
    dispose() { for (const t of this.troopTemplates) for (const m of t.ownedMaterials) m.dispose(); for (const b of this.batches.values())
        b.dispose(); for (const c of this.channels.values())
        for (const ch of c.channels) {
            ch.mesh.removeFromParent();
            ch.shadow?.removeFromParent();
            ch.mesh.material.dispose();
            ch.mesh.dispose();
        } for (const a of this.actors) {
        a.mixer?.stopAllAction();
        a.mixer?.uncacheRoot(a.scene);
        for (const m of a.ownedMaterials)
            m.dispose();
        this.env.userData.shading?.release(a.scene); a.release();
    } this.shadows.mesh.removeFromParent(); this.shadows.mesh.geometry.dispose(); this.shadows.mesh.material.map?.dispose(); this.shadows.mesh.material.dispose(); this.library.dispose(); }
}
