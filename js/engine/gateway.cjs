'use strict';
/**
 * Thin async battle gateway over a pinned Pokemon Showdown build (step 2.1).
 *
 * - Plain CommonJS, no absolute paths: engine root is resolved relative to this file.
 * - Everything crossing the boundary is JSON-serializable: messages out,
 *   choice strings in, snapshots as JSON strings.
 * - Callers never hold Battle/Pokemon objects. `_debugBattle()` is the single
 *   diagnostic escape hatch for experiments.
 */
const path = require('path');

const PROTOCOL_VERSION = 0; // experimental, not frozen

function loadSim(engineRoot) {
	const root = engineRoot || path.join(__dirname, 'showdown');
	const sim = require(path.join(root, 'dist', 'sim'));
	const { extractChannelMessages } = require(path.join(root, 'dist', 'sim', 'battle'));
	return { sim, extractChannelMessages, root };
}

function parseLine(raw) {
	if (!raw.startsWith('|')) return { type: 'text', args: [raw], raw };
	const parts = raw.slice(1).split('|');
	return { type: parts[0], args: parts.slice(1), raw };
}

class BattleGateway {
	/**
	 * @param {object} opts
	 * @param {string} opts.formatid e.g. 'gen8customgame'
	 * @param {number[]|string} [opts.seed] fixed seed, e.g. [1,2,3,4]; omitted => engine default PRNG
	 * @param {{name:string, team:object[]}[]} opts.players
	 * @param {string} [opts.engineRoot]
	 */
	constructor(opts, internal) {
		this._env = internal || loadSim(opts.engineRoot);
		this._queue = [];
		this._waiters = [];
		this._seq = 0;
		this._battle = null;
		this._opts = opts;
		this._closed = false;
	}

	static async create(opts) {
		const gw = new BattleGateway(opts);
		const { sim } = gw._env;
		const battle = new sim.Battle({
			formatid: opts.formatid,
			seed: opts.seed,
			send: (type, data) => gw._onSend(type, data),
		});
		gw._battle = battle;
		for (const [i, p] of opts.players.entries()) {
			battle.setPlayer(`p${i + 1}`, { name: p.name, team: sim.Teams.pack(p.team) });
		}
		// The format's onBegin creates battle.rpg when the second player joins, so flags go after.
		if (opts.wild !== undefined || opts.noBall !== undefined) {
			if (!battle.rpg) throw new Error('wild/noBall need the RPG format (gen8rpgcustomgame)');
			battle.rpg.wild = !!opts.wild;
			if (opts.noBall) battle.rpg.noBall = true;
		}
		gw._pump();
		return gw;
	}

	/** Restore from a snapshot string produced by snapshot(). Emits no events until the next choice. */
	static async restore(snapshot, opts = {}) {
		const gw = new BattleGateway(opts);
		gw._battle = gw._env.sim.Battle.fromJSON(snapshot);
		gw._battle.restart((type, data) => gw._onSend(type, data));
		gw._opts = { ...opts, restored: true };
		return gw;
	}

	snapshot() {
		return JSON.stringify(this._battle.toJSON());
	}

	/** Next structured message, or null if the battle has ended and the queue is empty. */
	next() {
		if (this._queue.length) return Promise.resolve(this._queue.shift());
		if (this._closed) return Promise.resolve(null);
		return new Promise(resolve => this._waiters.push(resolve));
	}

	/** Submit a choice string (Showdown choice syntax) for side 'p1'|'p2'. */
	async choose(side, choice) {
		const ok = this._battle.choose(side, choice);
		this._pump();
		if (!ok) {
			this._emit({ kind: 'error', side, message: 'choice rejected by engine', choice });
		}
		return ok;
	}

	/**
	 * Register a non-move action (item / ball / run) as the whole choice of one active slot.
	 * Singles shorthand for chooseSlots(side, [payload]) (slot 0). See chooseSlots.
	 */
	async act(side, payload, slot = 0) {
		const specs = slot === 0 ? [payload] : [null, payload];
		return this.chooseSlots(side, specs);
	}

	/**
	 * Register this side's choice for every active slot in one go. Each spec is either
	 *   { move: n, target?: loc } | { switch: n }                    -> ordinary engine choice
	 *   { kind: 'item'|'ball'|'run', ... } (JSON payload)           -> RPG action
	 *   null                                                        -> slot is fainted / auto-pass
	 * RPG actions are queued as engine 'event' actions (priority 99: after switches, before every
	 * move) and resolved inside the turn by the RPG format's `onRpgAction`. Nothing is applied
	 * until the turn runs, so cancelling before the other side commits changes no state.
	 */
	async chooseSlots(side, specs) {
		const b = this._battle;
		const s = b.getSide(side);
		if (!b.rpg) throw new Error('battle format has no RPG extension (use gen8rpgcustomgame / gen8rpgdoublescustomgame)');
		if (b.requestState !== 'move' || !s.activeRequest || s.activeRequest.wait) {
			this._emit({ kind: 'error', side, message: 'no move request pending', payload: specs });
			return false;
		}
		s.clearChoice();
		for (const k of Object.keys(b.rpg.pending)) if (k.startsWith(side + ':')) delete b.rpg.pending[k];
		let ok = true;
		for (let i = 0; i < specs.length && ok; i++) {
			const spec = specs[i];
			const idx = s.getChoiceIndex(); // skips fainted slots like the engine does
			if (idx >= s.active.length) break;
			if (spec && spec.kind) {
				b.rpg.pending[`${side}:${idx}`] = JSON.parse(JSON.stringify(spec));
				s.choice.actions.push({ choice: 'event', event: 'RpgAction', pokemon: s.active[idx], priority: 99 });
			} else if (spec && spec.move !== undefined) {
				ok = !!s.chooseMove(spec.move, spec.target || 0);
			} else if (spec && spec.switch !== undefined) {
				ok = !!s.chooseSwitch(spec.switch);
			}
		}
		if (!ok || !s.isChoiceDone()) {
			for (const k of Object.keys(b.rpg.pending)) if (k.startsWith(side + ':')) delete b.rpg.pending[k];
			s.clearChoice();
			this._pump();
			if (ok) this._emit({ kind: 'error', side, message: 'incomplete choice', payload: specs });
			return false;
		}
		if (b.allChoicesDone()) b.commitChoices();
		this._pump();
		return true;
	}

	/**
	 * Menu-layer legality (read-only, nothing consumed). Mirrors the spec's "refuse without
	 * consuming" checks for the cases step 2.2 covers. Returns { allowed, reason }.
	 */
	query(side, what, slot = 0) {
		const b = this._battle;
		const s = b.getSide(side);
		const active = s.active[slot];
		const foes = s.foe.pokemon.filter(p => !p.fainted);
		if (!b.rpg || !b.rpg.wild) return { allowed: what !== 'run' && what !== 'ball', reason: what === 'ball' ? 'trainer' : what === 'run' ? 'trainer' : undefined };
		if (!active || active.fainted) return { allowed: false, reason: 'noactive' };
		if (what === 'run') {
			if (active.trapped || active.volatiles['partiallytrapped']) return { allowed: false, reason: 'trapped' };
			return { allowed: true };
		}
		if (what === 'ball') {
			if (b.rpg.noBall) return { allowed: false, reason: 'ballsdisabled' };
			if (foes.length > 1) return { allowed: false, reason: 'multiplefoes' };
			return { allowed: true };
		}
		return { allowed: true };
	}

	// ------------------------------------------------------------------------------------------
	// State exchange with the game layer (step 2.3). Members are addressed by stable id (= the
	// Showdown nickname we assigned), never by slot, so switches do not matter.
	// ------------------------------------------------------------------------------------------

	_mon(sideId, id) {
		const p = this._battle.getSide(sideId).pokemon.find(x => x.name === id);
		if (!p) throw new Error(`no pokemon with stable id ${id} on ${sideId}`);
		return p;
	}

	/** Seed persistent dynamic state (hp/status/pp) from game records into the fresh battle. */
	seedState(sideId, records) {
		for (const r of records) {
			const p = this._mon(sideId, r.id);
			p.hp = Math.min(r.hp, p.maxhp);
			if (p.hp <= 0) { p.hp = 0; p.fainted = true; p.status = 'fnt'; }
			else if (r.status) { p.status = r.status; p.statusState = { id: r.status }; }
			for (const m of r.moves || []) {
				const slot = p.moveSlots.find(x => x.id === m.id);
				if (slot) slot.pp = Math.min(m.pp, slot.maxpp);
			}
			const base = p.baseMoveSlots.find(x => (r.moves || []).some(m => m.id === x.id));
			void base;
			for (const bs of p.baseMoveSlots) { const m = (r.moves || []).find(x => x.id === bs.id); if (m) bs.pp = Math.min(m.pp, bs.maxpp); }
		}
	}

	/** Read back the engine-owned dynamic state per member: hp, persistent status, pp per move. */
	readState(sideId) {
		return this._battle.getSide(sideId).pokemon.map(p => ({
			id: p.name, hp: p.hp, maxhp: p.maxhp, level: p.level, fainted: !!p.fainted,
			status: p.fainted ? '' : p.status || '',
			pp: Object.fromEntries(p.baseMoveSlots.map(m => [m.id, m.pp])),
			stats: { ...p.baseStoredStats }, active: !!p.isActive,
		}));
	}

	/**
	 * Push a growth result into the engine: new level/EVs, recomputed stats, HP rule and learned
	 * moves. `expect.stats` (from the game rules) is cross-checked against the engine's own
	 * computation; a mismatch throws instead of silently diverging.
	 */
	applyGrowth(sideId, id, { level, evs, expect, newMoves = [], replaceSlot } = {}) {
		const b = this._battle;
		const p = this._mon(sideId, id);
		const before = { level: p.level, maxhp: p.maxhp, hp: p.hp };
		p.set.level = level; p.level = level;
		if (evs) p.set.evs = { ...evs };
		const stats = b.spreadModify(p.species.baseStats, p.set);
		p.baseStoredStats = stats;
		for (const k of Object.keys(p.storedStats)) p.storedStats[k] = stats[k];
		p.speed = p.storedStats.spe;
		p.updateMaxHp(); // engine's own HP rule: current HP keeps its distance from max
		p.details = p.getUpdatedDetails ? p.getUpdatedDetails() : p.details;
		if (expect && expect.stats) {
			for (const k of Object.keys(expect.stats)) {
				if (stats[k] !== expect.stats[k]) throw new Error(`stat mismatch for ${id}.${k}: engine ${stats[k]} vs game ${expect.stats[k]}`);
			}
		}
		for (const mv of newMoves) {
			const dm = b.dex.moves.get(mv);
			const slot = { move: dm.name, id: dm.id, pp: dm.pp, maxpp: dm.pp, target: dm.target, disabled: false, disabledSource: '', used: false };
			if (replaceSlot !== undefined && replaceSlot !== null) {
				p.baseMoveSlots[replaceSlot] = slot; p.moveSlots[replaceSlot] = { ...slot }; p.set.moves[replaceSlot] = dm.name;
			} else {
				p.baseMoveSlots.push(slot); p.moveSlots.push({ ...slot }); p.set.moves.push(dm.name);
			}
		}
		return { before, after: { level: p.level, maxhp: p.maxhp, hp: p.hp }, stats };
	}

	/**
	 * Attach a synchronous callback fired inside the turn when a Pokemon faints (mid-turn sync point).
	 * Not serialized: re-attach after restore(). The callback may call applyGrowth(); it must not
	 * choose or commit anything.
	 */
	setFaintHook(fn) {
		const mod = require(path.join(this._env.root, 'dist', 'config', 'custom-formats.js'));
		mod.hooks.set(this._battle, fn);
	}

	/** Static move facts the game layer needs (name/id/pp) without holding engine objects. */
	moveInfo(nameOrId) {
		const m = this._battle.dex.moves.get(nameOrId);
		if (!m.exists) throw new Error(`unknown move ${nameOrId}`);
		return { id: m.id, name: m.name, pp: m.pp };
	}

	/**
	 * Re-issue move/switch requests after state changes between turns (growth). Returns the
	 * fresh requests per side and queues nothing else.
	 */
	refreshRequests() {
		const b = this._battle;
		const saved = this._queue.splice(0);
		b.makeRequest(b.requestState);
		// sendUpdates() only flushes requests when the log grew; a growth step may add no log line
		if (!b.sentRequests) { for (const side of b.sides) side.emitRequest(); b.sentRequests = true; }
		b.sendUpdates();
		const fresh = this._queue.splice(0);
		this._queue.push(...saved.filter(m => m.kind !== 'request'), ...fresh);
		return fresh.filter(m => m.kind === 'request');
	}

	/** Drop this side's registered choice (engine undo) and any pending RPG payload. */
	async cancel(side) {
		const b = this._battle;
		if (b.rpg) for (const k of Object.keys(b.rpg.pending)) if (k.startsWith(side + ':')) delete b.rpg.pending[k];
		b.undoChoice(side);
		this._pump();
	}

	_pump() {
		// Showdown batches output until sendUpdates(); BattleStream does this after each write.
		this._battle.sendUpdates();
	}

	_emit(msg) {
		msg.seq = this._seq++;
		const w = this._waiters.shift();
		if (w) w(msg);
		else this._queue.push(msg);
	}

	_onSend(type, data) {
		const text = Array.isArray(data) ? data.join('\n') : data;
		if (type === 'update') {
			const { extractChannelMessages } = this._env;
			const ch = extractChannelMessages(text, [0]);
			const lines = ch[0].filter(l => l !== '');
			this._emit({ kind: 'events', events: lines.map(parseLine) });
		} else if (type === 'sideupdate') {
			const nl = text.indexOf('\n');
			const side = text.slice(0, nl);
			const body = text.slice(nl + 1);
			for (const line of body.split('\n')) {
				if (line.startsWith('|request|')) {
					this._emit({ kind: 'request', side, request: JSON.parse(line.slice('|request|'.length)) });
				} else if (line.startsWith('|error|')) {
					this._emit({ kind: 'error', side, message: line.slice('|error|'.length) });
				}
			}
		} else if (type === 'end') {
			const b = this._battle;
			const outcome = b.rpg && b.rpg.outcome; // RPG outcomes (run/caught) are not engine wins
			this._emit({
				kind: 'end',
				winner: outcome ? null : b.winner || null,
				turn: b.turn,
				reason: outcome ? outcome.kind : b.winner ? 'win' : 'tie',
				...(outcome ? { outcome } : {}),
			});
			this._closed = true;
			for (const w of this._waiters.splice(0)) w(null);
		}
	}

	/** Active (non-wait) requests per side; lets a restored session resume without replaying. */
	pendingRequests() {
		return this._battle.sides
			.map(side => ({ side: side.id, request: side.activeRequest }))
			.filter(r => r.request && !r.request.wait);
	}

	/** Seed the PRNG was created with (string or array), for reproducing a default-random run. */
	prngSeed() {
		return this._battle.prngSeed;
	}

	get ended() {
		return this._battle.ended;
	}

	/** Diagnostic-only access for experiments. Not part of the protocol. */
	_debugBattle() {
		return this._battle;
	}
}

module.exports = { BattleGateway, PROTOCOL_VERSION };
