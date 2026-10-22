'use strict';
// Step 3 / B3: versioned game state. Declared legacy versions migrate on a copy, everything else is refused with a
// diagnosis and left untouched, the store never overwrites what it cannot read, and the replay ledger keeps its guarantees.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const E = require('../../js/engine/build/engine.cjs');
const { validateGame, ledgerStats } = E.saveSchema;
// Since step 5.0 the chain ends at schema 4, whose step from 3 needs the content's species mapping (D5-3). These states
// come from the step 2 fixture world, whose content ids are the Showdown names: the identity mapping is that content's.
const migrateGame = (raw, o = { speciesKey: E.speciesKey.identityKeys }) => E.saveSchema.migrateGame(raw, o);
/** What schemas 3 and 4 add to an older document: the claims ledger, statistics, the step counter, a form per member. */
const addedByNewerSchemas = s => ['claims', 'schema', 'stats', 'steps', ...['party', 'boxes'].flatMap(k => s[k].map((_, i) => `${k}.${i}.form`))].sort();
const { SaveStore, SaveError } = E.store;
// the fixture world (content ids = Showdown names) is chosen explicitly: the store guesses no species keys (step 5.0 review F03)
const store = (f, hooks = {}) => new SaveStore(f, hooks, E.speciesKey.identityKeys);
const S = E.state;
const F = E.fixtures;

const clone = x => JSON.parse(JSON.stringify(x));
const realV1 = () => clone(require('./fixtures/legacy-v1-flow-state.json')); // captured from the MZ run at step2-closed
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pf-save-'));
const done = [];
test.after(() => { for (const d of done) fs.rmSync(d, { recursive: true, force: true }); });
const dirOf = () => { const d = tmp(); done.push(d); return d; };

/** the oldest prototype shape: no statusCount at all, a sleeper, a badly poisoned member */
function oldestV1() {
	const s = realV1();
	for (const m of s.party) delete m.statusCount;
	s.party[1].status = 'tox'; s.party[2].status = 'slp';
	return s;
}

test('the current state is valid, also after results were applied', () => {
	const g = F.makeGame();
	assert.equal(g.schema, S.GAME_SCHEMA); assert.deepEqual(validateGame(g), []);
});

test('the real step 2 state (schema 1, captured from a real MZ run) migrates; only the version and nothing else changes', () => {
	const raw = realV1(); const pristine = clone(raw);
	const r = migrateGame(raw);
	assert.equal(r.ok, true);
	assert.deepEqual([r.from, r.to, r.migrated], [1, S.GAME_SCHEMA, true]);
	assert.deepEqual(raw, pristine, 'the input document is never mutated');
	assert.deepEqual(S.diffPaths(raw, r.state).sort(), addedByNewerSchemas(raw), 'schema 3 adds an empty claims ledger, schema 4 statistics, the step counter and form 0');
	assert.deepEqual(validateGame(r.state), []);
	assert.equal(S.applyBattleResult(r.state, { protocol: 1, battleId: 'after-migration', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } }).status, 'applied');
	const again = migrateGame(r.state);
	assert.deepEqual([again.ok, again.migrated, again.from], [true, false, S.GAME_SCHEMA], 'migrating a current document is a no-op');
});

test('the oldest prototype shape: counters are added, bad poison becomes plain poison, an unknown sleep counter is reported', () => {
	const raw = oldestV1(); const pristine = clone(raw);
	const r = migrateGame(raw);
	assert.equal(r.ok, true);
	assert.deepEqual(raw, pristine);
	const [a, b, c] = r.state.party;
	assert.deepEqual([a.status, a.statusCount], ['', 0]);
	assert.deepEqual([b.status, b.statusCount], ['psn', 0]);
	assert.deepEqual([c.status, c.statusCount], ['slp', undefined], 'no number is invented for a sleeper');
	assert.equal(r.notes.length, 4); assert.match(r.notes.join('|'), /claims ledger/); assert.match(r.notes.join('|'), /schema 4/); assert.match(r.notes.join('|'), /badly poisoned stored as plain poison/); assert.match(r.notes.join('|'), /sleep counter unknown/);
	assert.deepEqual(validateGame(r.state), []);
});

test('what cannot be understood is refused with a diagnosis (never reset), and the input is untouched', () => {
	const cases = [
		[null, 'corrupt'], ['text', 'corrupt'], [[1, 2], 'corrupt'], [{ party: [] }, 'corrupt'],
		[{ ...realV1(), schema: 99 }, 'unknown-version'], [{ ...realV1(), schema: 0 }, 'unknown-version'], [{ ...realV1(), schema: -1 }, 'unknown-version'],
		[{ ...realV1(), schema: 1.5 }, 'unknown-version'], [{ ...realV1(), schema: '2' }, 'unknown-version'],
	];
	for (const [raw, code] of cases) {
		const before = JSON.stringify(raw);
		const r = migrateGame(raw);
		assert.equal(r.ok, false, JSON.stringify(raw)); assert.equal(r.error.code, code, JSON.stringify(raw)); assert.ok(r.error.message.length > 10);
		assert.equal(JSON.stringify(raw), before);
	}
	assert.match(migrateGame({ ...realV1(), schema: 99 }).error.message, /newer version.*Nothing was changed/);
});

test('invalid structure is located, including battle-only fields that must never be saved', () => {
	const mk = f => { const s = F.makeGame(); f(s); return s; };
	const expectProblem = (s, pathRe, msgRe) => {
		const r = migrateGame(s);
		assert.equal(r.ok, false); assert.equal(r.error.code, 'invalid');
		assert.ok(r.error.problems.some(p => pathRe.test(p.path) && msgRe.test(p.message)), JSON.stringify(r.error.problems));
	};
	expectProblem(mk(s => { s.party[0].boosts = { atk: 2 }; }), /^\$\.party\[0\]\.boosts$/, /battle-only or temporary/);
	expectProblem(mk(s => { s.party[0].volatiles = {}; }), /\.volatiles$/, /unknown field/);
	expectProblem(mk(s => { s.activeNow = []; }), /^\$\.activeNow$/, /unknown top-level field/);
	expectProblem(mk(s => { s.party[0].level = 0; }), /\.level$/, /1 to 100/);
	expectProblem(mk(s => { s.party[1].id = s.party[0].id; }), /\.id$/, /duplicate member id/);
	expectProblem(mk(s => { s.party[0].moves[0].pp = 99; }), /moves\[0\]$/, /pp <= maxpp/);
	expectProblem(mk(s => { s.party[0].status = 'xyz'; }), /\.status$/, /must be one of/);
	expectProblem(mk(s => { s.bag.potion = -1; }), /^\$\.bag\.potion$/, />= 1/);
	expectProblem(mk(s => { s.money = -5; }), /^\$\.money$/, />= 0/);
	expectProblem(mk(s => { s.appliedBattles.x = { hash: 'nothex' }; }), /appliedBattles/, /64 hex/);
	expectProblem(mk(s => { s.party[0].status = 'tox'; }), /\.status$/, /plain poison/);
	expectProblem(mk(s => { s.party[0].evs.hp = 300; }), /evs\.hp$/, /0 to 252/);
});

test('a result cannot be applied to an un-migrated state', () => {
	assert.throws(() => S.applyBattleResult(realV1(), { protocol: 1, battleId: 'x', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } }), /schema 1.*migrate it first/);
});

const resultFor = id => ({ protocol: 1, battleId: id, outcome: { kind: 'run', winner: null }, members: { 'A-0001': { hp: 50 } }, bag: { potion: -1 }, captured: [], dex: { seen: ['Pidgey'], owned: [] } });

test('the store upgrades a legacy file on commit, keeps the original bytes, and a second commit changes nothing', () => {
	const dir = dirOf(); const f = path.join(dir, 'save.json');
	fs.writeFileSync(f, JSON.stringify(realV1()));
	const original = fs.readFileSync(f);
	const info = store(f).loadInfo();
	assert.deepEqual([info.from, info.migrated], [1, true]);
	assert.ok(original.equals(fs.readFileSync(f)), 'reading migrates in memory only');
	const r = store(f).commit(resultFor('B-legacy'));
	assert.deepEqual(r, { status: 'applied', migratedFrom: 1 });
	assert.ok(original.equals(fs.readFileSync(f + '.v1.bak')), 'the legacy file is kept byte for byte');
	const now = store(f).load();
	assert.equal(now.schema, S.GAME_SCHEMA); assert.equal(now.party[0].hp, 50); assert.equal(now.bag.potion, 2); assert.ok(now.appliedBattles['B-legacy']);
	assert.equal(store(f).commit(resultFor('B-legacy')).status, 'already-applied');
	assert.equal(store(f).load().bag.potion, 2, 'applied once');
});

test('the store never overwrites a save it cannot read', () => {
	const dir = dirOf();
	const attempts = [
		['garbage', Buffer.from('{ this is not json'), 'corrupt'],
		['truncated', Buffer.from(JSON.stringify(realV1()).slice(0, 200)), 'corrupt'],
		['newer', Buffer.from(JSON.stringify({ ...realV1(), schema: 7 })), 'unknown-version'],
		['invalid', Buffer.from(JSON.stringify({ ...realV1(), money: -1 })), 'invalid'],
	];
	for (const [name, bytes, code] of attempts) {
		const f = path.join(dir, name + '.json'); fs.writeFileSync(f, bytes);
		assert.throws(() => store(f).commit(resultFor('B-x')), e => e instanceof SaveError && e.info.code === code, name);
		assert.ok(bytes.equals(fs.readFileSync(f)), `${name}: file untouched`);
		assert.ok(!fs.existsSync(f + '.tmp') && !fs.existsSync(f + '.v1.bak'), `${name}: nothing else written`);
	}
});

test('REAL process kill while upgrading a legacy file: old or new at every point, always readable, retry applies exactly once', () => {
	for (const point of ['start', 'afterBackup', 'beforeSave', 'afterTmpWrite', 'beforeRename', 'afterRename']) {
		const dir = dirOf(); const f = path.join(dir, 'save.json'); const rf = path.join(dir, 'result.json');
		fs.writeFileSync(f, JSON.stringify(oldestV1())); fs.writeFileSync(rf, JSON.stringify(resultFor('B-kill')));
		const original = fs.readFileSync(f);
		const child = spawnSync(process.execPath, [path.join(__dirname, 'crash-child-legacy.cjs'), f, rf], { env: { ...process.env, CRASH_AT: point }, encoding: 'utf8' });
		assert.equal(child.signal, 'SIGKILL', `the child really dies at ${point}`);
		const info = store(f).loadInfo(); // never throws: either the legacy file or the new one
		const committed = point === 'afterRename';
		assert.deepEqual([info.migrated, !!info.state.appliedBattles['B-kill']], committed ? [false, true] : [true, false], `state after kill at ${point}`);
		if (!committed) assert.ok(original.equals(fs.readFileSync(f)), `legacy bytes intact after kill at ${point}`);
		assert.ok(!fs.existsSync(f + '.tmp'), 'an interrupted temp file is discarded on load');
		const retry = store(f).commit(resultFor('B-kill'));
		assert.equal(retry.status, committed ? 'already-applied' : 'applied');
		const fin = store(f).load();
		assert.equal(fin.bag.potion, 2, `deducted exactly once (${point})`); assert.equal(Object.keys(fin.appliedBattles).length, 1 + Object.keys(oldestV1().appliedBattles).length);
	}
});

// ---------------------------------------------------------------------------------------------- the replay ledger
const mkResult = (id, hp = 50) => ({ ...resultFor(id), members: { 'A-0001': { hp } }, bag: {} });

test('ledger policy: every identity is kept; a replay is a no-op, different content for the same id is refused, at any age', () => {
	let st = F.makeGame();
	for (let i = 0; i < 500; i++) st = S.applyBattleResult(st, mkResult('old#' + i, 10 + (i % 40))).state;
	assert.equal(Object.keys(st.appliedBattles).length, 500);
	const before = JSON.stringify(st);
	assert.equal(S.applyBattleResult(st, mkResult('old#0', 10)).status, 'already-applied', 'the oldest result replayed after 500 others');
	assert.throws(() => S.applyBattleResult(st, mkResult('old#0', 49)), /already applied with a different result/);
	assert.equal(JSON.stringify(st), before, 'refusals and replays change nothing');
});

test('ledger policy: out-of-order commits, aborted battles and restore-then-retry cannot double or lose a reward', () => {
	const base = F.makeGame();
	const A = mkResult('A', 40), B = mkResult('B', 41);
	const ab = S.applyBattleResult(S.applyBattleResult(base, A).state, B).state;
	const ba = S.applyBattleResult(S.applyBattleResult(base, B).state, A).state;
	assert.deepEqual(Object.keys(ab.appliedBattles).sort(), ['A', 'B']); assert.deepEqual(Object.keys(ba.appliedBattles).sort(), ['A', 'B']);
	assert.equal(S.applyBattleResult(ba, A).status, 'already-applied'); assert.equal(S.applyBattleResult(ba, B).status, 'already-applied');
	// a battle that never produced a result leaves no trace and does not block its id
	assert.ok(!('C' in ab.appliedBattles));
	assert.equal(S.applyBattleResult(ab, mkResult('C', 30)).status, 'applied');
	// restoring an older save rolls the ledger back WITH the state (same document), so the retry applies once, again
	const snapshot = clone(ab);
	const later = S.applyBattleResult(ab, mkResult('D', 20)).state;
	assert.ok(later.appliedBattles.D);
	const restored = S.applyBattleResult(snapshot, mkResult('D', 20));
	assert.equal(restored.status, 'applied'); assert.equal(restored.state.party[0].hp, 20);
	assert.equal(S.applyBattleResult(restored.state, mkResult('D', 20)).status, 'already-applied');
});

test('ledger growth is measured: linear, about a hundred bytes per entry, visible through ledgerStats', () => {
	let st = F.makeGame();
	const ids = 10000;
	for (let i = 0; i < ids; i++) st.appliedBattles['wild-pidgey#' + i] = { hash: 'a'.repeat(64) };
	const stats = ledgerStats(st);
	const perEntry = stats.jsonBytes / stats.entries;
	assert.equal(stats.entries, ids);
	assert.ok(perEntry > 80 && perEntry < 130, `bytes per entry ${perEntry}`);
	const gz = zlib.gzipSync(JSON.stringify(st.appliedBattles)).length;
	console.log(`# ledger growth: ${ids} entries = ${stats.jsonBytes} bytes JSON (${perEntry.toFixed(1)} per entry), ${gz} bytes gzip (hashes here are repetitive, real ones compress less)`);
});
