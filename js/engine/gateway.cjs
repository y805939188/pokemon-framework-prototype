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
			this._emit({
				kind: 'end',
				winner: b.winner || null,
				turn: b.turn,
				reason: b.winner ? 'win' : 'tie',
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
