'use strict';
// Step 3 / B1: content pipeline. Errors are located, builds are deterministic, stale output never passes, and the
// assembled sample reproduces the step 2 fixture content exactly (so using it in the runtime changes no behaviour).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const E = require('../../js/engine/build/engine.cjs');
const { compileContent, checkFresh, hashInputs, canonicalJson } = E.contentCompile;
const { assembleContent, loadCompiled } = E.contentRuntime;

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'content/sample');
const CLI = path.join(ROOT, 'js/engine/build/content-cli.cjs');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const inputs = () => ({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json') });
const bad = (mutate, file, pathRe, msgRe) => {
	const i = inputs(); mutate(i);
	const r = compileContent(i);
	assert.equal(r.ok, false, 'must be refused');
	const hit = r.errors.find(e => e.file === file && pathRe.test(e.path) && (!msgRe || msgRe.test(e.message)));
	assert.ok(hit, `expected ${file} ${pathRe} ${msgRe || ''}, got ${JSON.stringify(r.errors)}`);
};

test('the sample compiles, deterministically, with every input covered by the hash', () => {
	const a = compileContent(inputs()), b = compileContent(inputs());
	assert.ok(a.ok && b.ok);
	assert.equal(canonicalJson(a.data), canonicalJson(b.data));
	assert.equal(a.data.species.length, 7);
	assert.equal(a.data.inputsHash, hashInputs(inputs()));
	const i = inputs(); i.species[0].baseExp += 1;
	assert.notEqual(hashInputs(i), a.data.inputsHash, 'a changed input changes the hash');
});

test('errors are located by file and path', () => {
	bad(i => { delete i.species[3].baseExp; }, 'species.json', /^\[3\]\.baseExp$/, /missing required field/);
	bad(i => { i.species[1].catchrate = 3; }, 'species.json', /^\[1\]\.catchrate$/, /unknown field/);
	bad(i => { i.species[2].id = i.species[0].id; }, 'species.json', /^\[2\]\.id$/, /duplicate species id/);
	bad(i => { i.species[2].nameKey = i.species[0].nameKey; }, 'species.json', /^\[2\]\.nameKey$/, /already used/);
	bad(i => { i.species[0].growth = 'turbo'; }, 'species.json', /^\[0\]\.growth$/, /must be one of/);
	bad(i => { i.species[0].evYield = { speed: 1 }; }, 'species.json', /^\[0\]\.evYield$/, /unknown stat/);
	bad(i => { i.species[0].learnset[0].level = 101; }, 'species.json', /^\[0\]\.learnset$/, /entry 0/);
	bad(i => { i.species[0].learnset.push(i.species[0].learnset[0]); }, 'species.json', /^\[0\]\.learnset$/, /repeats/);
	bad(i => { i.species[0].catchRate = 256; }, 'species.json', /^\[0\]\.catchRate$/, /0 to 255/);
	bad(i => { i.species[0].source = 'nowhere'; }, 'species.json', /^\[0\]\.source$/, /must name an entry/);
	bad(i => { i.sources[0].status = 'maybe'; }, 'sources.json', /^\[0\]\.status$/);
	bad(i => { i.manifest.schema = 2; }, 'manifest.json', /^\$\.schema$/);
});

test('overlays: applied, and refused when they point nowhere, conflict, or give no reason', () => {
	const i = inputs(); i.overlays = [{ target: 'species/pidgey', set: { catchRate: 200 }, reason: 'test: easier Pidgey' }];
	const r = compileContent(i);
	assert.ok(r.ok);
	assert.equal(r.data.species.find(s => s.id === 'pidgey').catchRate, 200);
	assert.equal(r.data.overlaysApplied, 1);
	assert.notEqual(r.data.inputsHash, compileContent(inputs()).data.inputsHash);
	bad(x => { x.overlays = [{ target: 'species/missingno', set: { catchRate: 1 }, reason: 'x' }]; }, 'overlays.json', /^\[0\]\.target$/, /does not exist/);
	bad(x => { x.overlays = [{ target: 'species/pidgey', set: { catchRate: 1 }, reason: 'a' }, { target: 'species/pidgey', set: { catchRate: 2 }, reason: 'b' }]; }, 'overlays.json', /^\[1\]\.set\.catchRate$/, /conflicts with overlay \[0\]/);
	bad(x => { x.overlays = [{ target: 'species/pidgey', set: { showdownId: 'pidgeot' }, reason: 'a' }]; }, 'overlays.json', /^\[0\]\.set\.showdownId$/, /cannot be overridden/);
	bad(x => { x.overlays = [{ target: 'species/pidgey', set: { catchRate: 1 } }]; }, 'overlays.json', /^\[0\]\.reason$/, /must say why/);
});

test('stale or missing compiled output is detected', () => {
	const i = inputs(); const r = compileContent(i);
	assert.equal(checkFresh(r.data, i), null);
	const changed = inputs(); changed.species[0].baseExp = 1;
	assert.match(checkFresh(r.data, changed).message, /stale/);
	assert.match(checkFresh(undefined, i).message, /missing/);
});

test('the CLI: build writes deterministic output; a failed build REMOVES the old output; check notices staleness', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-content-'));
	try {
		fs.cpSync(SRC, path.join(dir, 'src'), { recursive: true });
		const out = path.join(dir, 'out/content.json');
		const run = (...a) => spawnSync(process.execPath, [CLI, ...a, `--src=${path.join(dir, 'src')}`, `--out=${out}`], { encoding: 'utf8' });
		assert.equal(run('build').status, 0);
		const first = fs.readFileSync(out, 'utf8');
		assert.equal(run('build').status, 0);
		assert.equal(fs.readFileSync(out, 'utf8'), first, 'same inputs, same bytes');
		assert.equal(run('check').status, 0);
		const sp = JSON.parse(fs.readFileSync(path.join(dir, 'src/species.json'), 'utf8')); sp[0].baseExp = 5;
		fs.writeFileSync(path.join(dir, 'src/species.json'), JSON.stringify(sp));
		const stale = run('check');
		assert.equal(stale.status, 1); assert.match(stale.stderr, /stale/);
		delete sp[0].growth; fs.writeFileSync(path.join(dir, 'src/species.json'), JSON.stringify(sp));
		const failed = run('build');
		assert.equal(failed.status, 1); assert.match(failed.stderr, /species\.json \[0\]\.growth: missing required field/);
		assert.equal(fs.existsSync(out), false, 'the stale output must not survive a failed build');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('assembly against the pinned Showdown data reproduces the step 2 fixture content exactly', () => {
	const compiled = compileContent(inputs()).data;
	const dex = E.dex.createDexLookup();
	const { content, errors } = assembleContent(compiled, dex);
	assert.deepEqual(errors, []);
	// the sample adds one thing the fixture does not have: the text key of each display name
	const withoutKeys = Object.fromEntries(Object.entries(content.species).map(([k, v]) => { const { nameKey, ...rest } = v; assert.match(nameKey, /^species\.[a-z]+$/); return [k, rest]; }));
	assert.deepEqual(withoutKeys, E.fixtures.content.species, 'sample content == fixture content (same numbers, same Showdown base stats)');
	assert.equal(content.meta.kind, 'sample'); assert.equal(content.meta.inputsHash, compiled.inputsHash);
	assert.equal(E.fixtures.content.meta.kind, 'fixture', 'the fixture keeps a distinct identity');
	assert.equal(loadCompiled(JSON.parse(JSON.stringify(compiled))).contentId, 'sample');
	assert.throws(() => loadCompiled({ schema: 9 }), /not a schema 1 document/);
});

test('assembly errors name the record and field', () => {
	const dex = E.dex.createDexLookup();
	const a = compileContent(inputs()).data;
	const wrongSpecies = JSON.parse(JSON.stringify(a)); wrongSpecies.species[0].showdownId = 'notapokemon';
	let r = assembleContent(wrongSpecies, dex);
	assert.match(r.errors[0].path, /^species\/[a-z]+\.showdownId$/); assert.match(r.errors[0].message, /not a species in the pinned Showdown data/);
	const wrongMove = JSON.parse(JSON.stringify(a)); wrongMove.species.find(s => s.id === 'charizard').learnset[1].move = 'notamove';
	r = assembleContent(wrongMove, dex);
	assert.equal(r.errors[0].path, 'species/charizard.learnset[1].move');
	const twice = JSON.parse(JSON.stringify(a)); twice.species[1].showdownId = twice.species[0].showdownId;
	r = assembleContent(twice, dex);
	assert.match(r.errors[0].message, /already provided by/);
});

test('a whole battle played with the sample content equals the same battle with the fixture content', async () => {
	const compiled = compileContent(inputs()).data;
	const sample = assembleContent(compiled, E.dex.createDexLookup()).content;
	const F = E.fixtures;
	const play = async content => {
		const game = F.makeGame(); game.party[0].exp = E.growth.minExp('parabolic', 51) - 1;
		const s = await E.session.BattleSession.create({ game, battleId: 'B1-eq', content, seed: [1, 2, 3, 4], foe: { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5), F.foeMember('T1-2', 'Pidgey', 5)] } });
		const lines = [];
		for (let i = 0; i < 20 && !s.finished; i++) {
			if (s.pendingLearn) { await s.decideLearn(null); continue; }
			const req = s.currentRequest();
			const r = req && req.forceSwitch ? await s.chooseForcedSwitch(req.side.pokemon.find(p => !p.active && !/ fnt$/.test(p.condition)).ident.slice(4)) : await s.chooseMove(1);
			for (const m of r.messages || []) if (m.kind === 'events') lines.push(...m.events.map(e => e.raw).filter(l => !l.startsWith('|t:')));
		}
		return { lines, result: s.result() };
	};
	assert.deepEqual(await play(sample), await play(F.content));
});

// ---- R4: cross-record invariants are checked again on the merged records, and located at the overlay
const withOverlays = overlays => { const i = inputs(); i.overlays = overlays; return compileContent(i); };
const ov = (target, nameKey, reason = 'test') => ({ target, set: { nameKey }, reason });

test('R4: an overlay that gives a species the text key of another is refused, located at the overlay entry, naming both entities', () => {
	const r = withOverlays([ov('species/blastoise', 'species.charizard')]);
	assert.equal(r.ok, false);
	const hit = r.errors.find(e => e.file === 'overlays.json' && e.path === '[0].set.nameKey');
	assert.ok(hit, JSON.stringify(r.errors));
	assert.match(hit.message, /species\.charizard/); assert.match(hit.message, /species\/blastoise/); assert.match(hit.message, /species\/charizard \(species\.json \[0\]\)/);
	assert.equal(r.errors.filter(e => e.file === 'species.json').length, 0, 'the base records themselves are fine');
	// the symptom the review found: the compiled sample used to show Blastoise as Charizard; now no document exists
	assert.equal(r.data, undefined);
});

test('R4: two overlays on different targets that pick the same new key conflict with each other', () => {
	const r = withOverlays([ov('species/pidgey', 'species.bird'), ov('species/caterpie', 'species.bird')]);
	assert.equal(r.ok, false);
	const paths = r.errors.filter(e => e.file === 'overlays.json').map(e => e.path).sort();
	assert.deepEqual(paths, ['[0].set.nameKey', '[1].set.nameKey'], 'each overlay is located');
	const first = r.errors.find(e => e.path === '[0].set.nameKey');
	assert.match(first.message, /species\/caterpie \(overlays\.json \[1\]\.set\.nameKey\)/); assert.match(first.message, /species\/pidgey/);
});

test('R4: a valid rename passes, including swapping two keys (the final state is unique) and moving onto a key that was just freed', () => {
	assert.equal(withOverlays([ov('species/pidgey', 'species.birdie')]).ok, true);
	const swap = withOverlays([ov('species/pidgey', 'species.caterpie'), ov('species/caterpie', 'species.pidgey')]);
	assert.equal(swap.ok, true, JSON.stringify(swap.errors));
	const a = assembleContent(swap.data, E.dex.createDexLookup()); assert.deepEqual(a.errors, []);
	assert.equal(a.content.species.Pidgey.nameKey, 'species.caterpie'); assert.equal(a.content.species.Caterpie.nameKey, 'species.pidgey');
	const free = withOverlays([ov('species/pidgey', 'species.birdie'), ov('species/caterpie', 'species.pidgey')]);
	assert.equal(free.ok, true, JSON.stringify(free.errors));
	assert.equal(withOverlays([{ target: 'species/pidgey', set: { catchRate: 10 }, reason: 'unrelated field' }]).ok, true);
});

test('R4: an overlay duplicate does not hide or double-report a plain base duplicate', () => {
	const i = inputs(); i.species[2].nameKey = i.species[0].nameKey; i.overlays = [ov('species/pidgey', 'species.birdie')];
	const r = compileContent(i);
	assert.equal(r.ok, false);
	assert.equal(r.errors.filter(e => /already used/.test(e.message) && e.file === 'species.json').length, 1);
	assert.equal(r.errors.filter(e => e.file === 'overlays.json').length, 0);
});

test('R4: through the CLI a bad overlay fails the build with the overlay location and removes the old output', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-content-r4-'));
	try {
		fs.cpSync(SRC, path.join(dir, 'src'), { recursive: true });
		const out = path.join(dir, 'out/content.json');
		const run = (...a) => spawnSync(process.execPath, [CLI, ...a, `--src=${path.join(dir, 'src')}`, `--out=${out}`], { encoding: 'utf8' });
		assert.equal(run('build').status, 0); assert.equal(fs.existsSync(out), true);
		fs.writeFileSync(path.join(dir, 'src/overlays.json'), JSON.stringify([ov('species/blastoise', 'species.charizard', 'bad')]));
		const failed = run('build');
		assert.equal(failed.status, 1); assert.match(failed.stderr, /overlays\.json \[0\]\.set\.nameKey: .*species\.charizard/);
		assert.equal(fs.existsSync(out), false, 'the old output must not survive');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
