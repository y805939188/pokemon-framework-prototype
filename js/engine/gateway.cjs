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
	 * Register a non-move action (item / ball / run) as this side's whole choice for the turn.
	 * It is queued as an engine 'event' action (priority above every move, after switches) and
	 * resolved inside the turn by the RPG format's `onRpgAction`. Nothing is applied until the
	 * turn runs, so cancelling before the other side commits changes no state.
	 * Singles only (step 2.2); `payload` must be JSON-serializable.
	 */
	async act(side, payload) {
		const b = this._battle;
		const s = b.getSide(side);
		if (!b.rpg) throw new Error('battle format has no RPG extension (use formatid gen8rpgcustomgame)');
		if (b.requestState !== 'move' || !s.activeRequest || s.activeRequest.wait) {
			this._emit({ kind: 'error', side, message: 'no move request pending', payload });
			return false;
		}
		s.clearChoice();
		b.rpg.pending[s.id] = JSON.parse(JSON.stringify(payload));
		s.choice.actions.push({ choice: 'event', event: 'RpgAction', pokemon: s.active[0], priority: 99 });
		if (b.allChoicesDone()) b.commitChoices();
		this._pump();
		return true;
	}

	/**
	 * Menu-layer legality (read-only, nothing consumed). Mirrors the spec's "refuse without
	 * consuming" checks for the cases step 2.2 covers. Returns { allowed, reason }.
	 */
	query(side, what) {
		const b = this._battle;
		const s = b.getSide(side);
		const active = s.active[0];
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

	/** Drop this side's registered choice (engine undo) and any pending RPG payload. */
	async cancel(side) {
		const b = this._battle;
		if (b.rpg) delete b.rpg.pending[side];
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
