import { clamp, lerp, label, roundRect } from './core.js';
import { STURMBASTION_LEVELS } from './fern-rangers-sturmbastion-levels.js';
export const CORRIDOR = 5, STURM_STEP = 1 / 60;
export const gateX = (gate, t) => gate.x + (gate.move ? Math.sin(t * gate.move.speed) * gate.move.amp : 0);
export class SturmbastionSession {
    constructor(index, env = {}) { this.index = index + 44; this.L = env.level || STURMBASTION_LEVELS[index]; this.mode = 'sturmbastion'; this.world = 4; this.themeName = 'meadow'; this.sound = env.sound || { play() { } }; this.preview = !!env.preview; this.t = 0; this.acc = 0; this.px = 0; this.tx = 0; this.keys = { l: false, r: false }; this.drag = null; this.layout = null; this.groups = []; this.free = []; this.sequence = 0; this.emit = 0; this.wave = 0; this.reserve = this.L.reserve; this.base = this.L.base; this.core = this.L.core; this.barrier = this.L.barrier ? { ...this.L.barrier, max: this.L.barrier.hp } : null; this.score = 0; this.kills = 0; this.result = null; this.settlementSeconds = 2.4; this.visualEvents = []; this.hint = this.L.hint; this.reinforcements = 0; this.recalled = 0; this.n = 0; this.enemyMass = 0; this.warning = ''; this.grid = new Map(); this.gateActivations = 0; this.gateLast = new Float64Array(this.L.gates.length); this.peak = 0; this.spawned = 0; this.completedGates = 0; this.timeLimit = 150; }
    add(side, x, z, n, mask = 0, heavy = false) { if (!Number.isFinite(n) || n <= 0)
        return null; n = Math.floor(n); if (!Number.isSafeInteger(n))
        throw new Error('Invalid reinforcement strength'); const g = this.free.pop() || {}; Object.assign(g, { id: ++this.sequence, side, x: clamp(x, -4.5, 4.5), z, n, mask, heavy, redirected: false, redirectX: null }); this.groups.push(g); if (side === 1)
        this.spawned += n; return g; }
    effect(event) { if (this.visualEvents.length >= 64)
        this.visualEvents.shift(); this.visualEvents.push(event); }
    resultReady() { return this.finishedAt == null || this.t - this.finishedAt >= 2.2; }
    key(code, down) { if (code === 'ArrowLeft' || code === 'KeyA')
        this.keys.l = down;
    else if (code === 'ArrowRight' || code === 'KeyD')
        this.keys.r = down;
    else
        return false; return true; }
    pointer(type, x, y, e = {}) { if (!this.layout || this.result)
        return; const ppu = this.layout.ppu || 50; if (e.pointerType === 'mouse') {
        if (type !== 'up')
            this.tx = clamp(this.layout.toWorldX?.(x) ?? (x - this.layout.cx) / ppu, -4.1, 4.1);
        return;
    } if (type === 'down')
        this.drag = { x, tx: this.tx }; if (type === 'move' && this.drag)
        this.tx = clamp(this.drag.tx + (x - this.drag.x) / ppu, -4.1, 4.1); if (type === 'up')
        this.drag = null; }
    hud() { return { progress: 1 - this.core / this.L.core, score: this.score, label: 'Groschen' }; }
    get coreShielded() { return this.wave < this.L.waves.length || this.enemyMass > 0; }
    update(dt) { if (!(dt >= 0) || !Number.isFinite(dt))
        return; this.acc += Math.min(dt, .25); while (this.acc + 1e-10 >= STURM_STEP) {
        this.acc -= STURM_STEP;
        this.step(STURM_STEP);
    } }
    step(dt) {
        this.t += dt;
        this.visualEvents = this.visualEvents.filter(v => this.t - v.time < 3);
        if (this.result || this.preview)
            return;
        this.tx = clamp(this.tx + (Number(this.keys.r) - Number(this.keys.l)) * 6 * dt, -4.1, 4.1);
        this.px = lerp(this.px, this.tx, 1 - Math.exp(-dt * 14));
        this.emit += dt;
        while (this.reserve > 0 && this.emit >= this.L.emitEvery) {
            this.emit -= this.L.emitEvery;
            this.reserve--;
            this.add(1, this.px, 1, 1);
        }
        this.warning = '';
        const next = this.L.waves[this.wave];
        if (next && next.at - this.t < 3 && next.at > this.t)
            this.warning = `${next.heavy ? 'Schwere ' : ''}Automatenwelle in ${Math.ceil(next.at - this.t)} s`;
        while (this.wave < this.L.waves.length && this.t >= this.L.waves[this.wave].at) {
            const w = this.L.waves[this.wave++];
            const packets = Math.min(12, Math.ceil(w.strength / 12));
            for (let i = 0, left = w.strength; i < packets; i++) {
                const n = Math.min(left, Math.ceil(w.strength / packets));
                left -= n;
                this.add(-1, w.x + (i % 3 - 1) * .32, this.L.length - 2 + Math.floor(i / 3) * .4, n, 0, !!w.heavy);
            }
        }
        // enemyMass is settled at the end of the step. Include this step's
        // newly spawned defenders before consuming any attackers at the core.
        const shielded = this.coreShielded || this.groups.some(g => g.side === -1 && g.n > 0);
        this.grid.clear();
        for (const g of this.groups) {
            if (g.n <= 0)
                continue;
            const previous = g.z;
            let speed = this.L.speed * (g.side === 1 ? 1 : g.heavy ? .64 : .9);
            const tempo = this.L.tempo;
            if (tempo && g.side === 1 && Math.abs(g.x - tempo.x) < tempo.width / 2 && g.z >= tempo.z && g.z < tempo.z + tempo.length)
                speed *= tempo.mul;
            g.z += g.side * speed * dt;
            if (g.redirectX != null)
                g.x = lerp(g.x, g.redirectX, Math.min(1, dt * 7));
            for (const b of this.L.blocks || []) {
                const bx = gateX(b, this.t);
                if (g.side === 1 && previous <= b.z && g.z > b.z && Math.abs(g.x - bx) < b.width / 2 + .15) {
                    g.x = clamp(bx + (g.x < bx ? -1 : 1) * (b.width / 2 + .4), -4.4, 4.4);
                }
            }
            const def = this.L.deflector;
            if (def && g.side === 1 && !g.redirected) {
                const angle = Math.sin(this.t * def.speed) * Math.PI / 6, co = Math.cos(angle), si = Math.sin(angle), dx = g.x + 2, dz = g.z - def.z, u = co * dx + si * dz, v = -si * dx + co * dz;
                if (u >= -.2 && u <= 4.29 && Math.abs(v) < .48) {
                    g.redirected = true;
                    g.redirectX = angle < 0 ? -def.amp : def.amp;
                }
            }
            if (g.side === 1) {
                for (let i = 0; i < this.L.gates.length; i++) {
                    const gate = this.L.gates[i], bit = 1 << i;
                    if (g.mask & bit)
                        continue;
                    if (previous <= gate.z && g.z > gate.z) {
                        g.mask |= bit;
                        if (Math.abs(g.x - gateX(gate, this.t)) <= gate.width / 2) {
                            const after = gate.op === 'mul' ? g.n * gate.v : g.n + gate.v;
                            if (!Number.isSafeInteger(after))
                                throw new Error('Gate strength exceeds exact integer range');
                            const added = Math.max(0, after - g.n);
                            g.n = Math.max(0, after);
                            this.reinforcements += added;
                            this.spawned += added;
                            this.gateActivations++;
                            this.gateLast[i] = this.t;
                            this.effect({ type: 'landing', time: this.t, x: g.x, z: g.z, count: added });
                        }
                    }
                }
                if (this.barrier?.hp > 0 && g.z >= this.barrier.z && Math.abs(g.x - this.barrier.x) < this.barrier.width / 2) {
                    const hit = Math.min(g.n, this.barrier.hp);
                    this.barrier.hp -= hit;
                    g.n -= hit;
                    this.score += hit;
                    if (!this.barrier.hp)
                        this.barrier.openedAt = this.t;
                }
                if (g.z >= this.L.length) {
                    if (shielded)
                        g.z = this.L.length;
                    else {
                        const hit = Math.min(g.n, this.core);
                        this.core -= hit;
                        this.score += hit * 2;
                        g.n = 0;
                    }
                }
            }
            else if (g.z <= 1) {
                this.base -= g.n;
                this.recalled += g.n;
                g.n = 0;
            }
            if (g.n > 0 && g.side === -1) {
                const cell = Math.floor(g.z / 1.2), a = this.grid.get(cell) || [];
                a.push(g);
                this.grid.set(cell, a);
            }
        }
        // Front cells resolve aggregate strength, never all living people pairwise.
        for (const p of this.groups) {
            if (p.side !== 1 || p.n <= 0)
                continue;
            const cell = Math.floor(p.z / 1.2);
            for (let dz = -1; dz <= 1 && p.n > 0; dz++)
                for (const e of this.grid.get(cell + dz) || []) {
                    if (e.n <= 0 || Math.abs(p.z - e.z) > 1.15)
                        continue;
                    const difference = Math.abs(p.x - e.x);
                    if (difference > 1.4) {
                        e.x = lerp(e.x, p.x, Math.min(1, dt * 2));
                        continue;
                    }
                    const hit = Math.min(p.n, e.n);
                    p.n -= hit;
                    e.n -= hit;
                    this.kills += hit;
                    this.score += hit;
                    this.recalled += hit;
                    if (hit)
                        this.effect({ type: 'recall', time: this.t, x: p.x, z: p.z, count: hit });
                }
        }
        // Coalesce same exact gate history and cell; a render pool never limits logic.
        const merged = new Map();
        let write = 0;
        this.n = 0;
        this.enemyMass = 0;
        for (const g of this.groups) {
            if (g.n <= 0) {
                this.free.push(g);
                continue;
            }
            const key = `${g.side}:${Math.round(g.x * 4)}:${Math.floor(g.z * 3)}:${g.mask}:${g.redirected ? 1 : 0}:${g.heavy ? 1 : 0}`;
            const prior = merged.get(key);
            if (prior) {
                prior.n += g.n;
                this.free.push(g);
            }
            else {
                merged.set(key, g);
                this.groups[write++] = g;
            }
            if (g.side === 1)
                this.n += g.n;
            else
                this.enemyMass += g.n;
        }
        this.groups.length = write;
        this.peak = Math.max(this.peak, this.n);
        this.base = Math.max(0, this.base);
        if (this.base <= 0)
            this.finish(false, 'Der Sender wurde abgeschaltet. Dein Trupp ist sicher zurückgerufen.');
        else if (this.core <= 0 && this.wave >= this.L.waves.length && this.enemyMass <= 0)
            this.finish(true, 'Bastionskern abgeschaltet. Die Bucht ist frei!');
        else if (this.reserve <= 0 && this.n <= 0)
            this.finish(false, 'Die Verstärkung ist erschöpft. Versuche eine stärkere Torkette.');
        else if (this.t > this.timeLimit)
            this.finish(false, 'Der Einsatz wird sicher abgebrochen. Versuche eine andere Route.');
    }
    finish(won, reason) { if (this.result)
        return; this.finishedAt = this.t; this.result = { won, stars: won ? (this.base >= this.L.base * .7 ? 3 : this.base > 0 ? 2 : 1) : 0, score: this.score, reason, stats: { kills: this.kills, rangers: won ? this.n : 0, reinforcements: this.reinforcements } }; this.sound.play(won ? 'win' : 'bad'); }
    render(g, view) {
        const projection = view.gl?.projectFn();
        if (view.gl)
            this.layout = view.gl.layoutFor();
        const w = view.w, h = view.h, headY=projection?78:32;
        g.clearRect(0, 0, w, h);
        if (!projection) {
            g.fillStyle = '#173441';
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#859b9d';
            g.fillRect(w * .1, h * .08, w * .8, h * .8);
            const ppu = w * .08;
            this.layout = { ppu, cx: w / 2, toWorldX: x => (x - w / 2) / ppu };
            for (const gate of this.L.gates) {
                const y = h * .8 - gate.z / this.L.length * h * .65;
                g.fillStyle = '#267cac';
                g.fillRect(w / 2 + (gateX(gate, this.t) - gate.width / 2) * ppu, y, gate.width * ppu, 14);
                label(g, (gate.op === 'mul' ? '×' : '+') + gate.v, w / 2 + gateX(gate, this.t) * ppu, y - 8, 16, '#fff');
            }
            for (const a of this.groups) {
                g.fillStyle = a.side === 1 ? '#5bc6f5' : '#dc8b46';
                g.beginPath();
                g.arc(w / 2 + a.x * ppu, h * .8 - a.z / this.L.length * h * .65, Math.min(10, 3 + Math.sqrt(a.n)), 0, 7);
                g.fill();
            }
            g.fillStyle = '#e4b649';
            roundRect(g, w / 2 + this.px * ppu - 15, h * .82, 30, 23, 6);
            g.fill();
        }
        if(projection)for(const [i,gate] of this.L.gates.entries()){const p=projection(gateX(gate,this.t),gate.z-.258,2.93);label(g,(gate.op==='mul'?'×':'+')+gate.v,p.x,p.y,Math.max(14,Math.min(22,p.s*.5)),this.t-this.gateLast[i]<.3?'#ffe78f':'#fff','rgba(10,25,35,.9)');}
        label(g, `Verstärkung ${this.n}  ·  Vorrat ${this.reserve}`, w / 2, headY, Math.min(22, w * .045), '#fff', 'rgba(10,25,35,.8)');
        label(g, `Sender ${this.base}  ·  Kern ${Math.ceil(this.core)}${this.coreShielded ? ' · geschützt' : ''}`, w / 2, headY+27, Math.min(17, w * .038), '#ffe3a3', 'rgba(10,25,35,.8)');
        if (this.warning)
            label(g, this.warning, w / 2, headY+55, 19, '#ffd180', 'rgba(50,20,10,.9)');
        if (this.barrier?.hp > 0)
            label(g, `Ladungssperre: ${this.barrier.hp}`, w / 2, h - 62, 18, '#fff');
        label(g, 'Ziehen oder A / D zum Steuern', w / 2, h - 28, 14, '#dfedf3');
    }
}
/** Input-only planning bot used for deterministic balancing and regression checks. */
export function sturmTarget(session) { let best = 0, bestScore = -1; for (const x of [-2.4, 0, 2.4]) {
    let n = 1;
    for (const gate of session.L.gates) {
        const time = session.t + gate.z / session.L.speed;
        if (Math.abs(x - gateX(gate, time)) < gate.width / 2)
            n = gate.op === 'mul' ? n * gate.v : n + gate.v;
    }
    if (n > bestScore) {
        bestScore = n;
        best = x;
    }
} return best; }
