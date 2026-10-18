'use strict';
/**
 * Minimal durable store for step 2.3: one JSON file replaced atomically (write temp, fsync, rename).
 * Atomicity claim is limited to what is implemented and tested here: a crash/throw at any point of
 * commit() leaves either the complete old file or the complete new file, and a re-submitted result
 * is applied at most once (appliedBattles). No claim about power loss beyond fsync+rename semantics.
 */
const fs = require('fs');
const path = require('path');
const { applyBattleResult } = require('./state.cjs');

class SaveStore {
	constructor(file, hooks = {}) {
		this.file = file;
		this.hooks = hooks; // test-only fault injection: hooks.at(point) may throw or exit the process
	}
	_at(point) { if (this.hooks.at) this.hooks.at(point); }

	load() {
		// A leftover temp file is an interrupted commit: the committed file is authoritative.
		try { fs.unlinkSync(this.file + '.tmp'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
		return JSON.parse(fs.readFileSync(this.file, 'utf8'));
	}

	save(state) {
		const tmp = this.file + '.tmp';
		const fd = fs.openSync(tmp, 'w');
		try {
			fs.writeSync(fd, JSON.stringify(state));
			this._at('afterTmpWrite');
			fs.fsyncSync(fd);
		} finally { fs.closeSync(fd); }
		this._at('beforeRename');
		fs.renameSync(tmp, this.file);
		this._at('afterRename');
	}

	/** Apply a battle result durably and idempotently. Returns {status}. */
	commit(result) {
		this._at('start');
		const state = this.load();
		const r = applyBattleResult(state, result);
		if (r.status === 'already-applied') return { status: r.status };
		this._at('beforeSave');
		this.save(r.state);
		return { status: r.status };
	}
}

module.exports = { SaveStore };
