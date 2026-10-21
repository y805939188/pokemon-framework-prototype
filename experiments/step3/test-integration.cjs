'use strict';
// Step 3 / B4: content ids, text keys, versioned saves and the battle session working together on the
// representative paths: missing and dangling references, replayed results, restore-then-retry, a legacy save through a
// whole battle, both languages, and the log that explains it afterwards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const { compileContent } = E.contentCompile;
const { assembleContent, findDanglingReferences } = E.contentRuntime;
const F = E.fixtures;
const clone = x => JSON.parse(JSON.stringify(x));

const SRC = path.resolve(__dirname, '../../content/sample');
const inputs = () => Object.fromEntries(['manifest', 'sources', 'species', 'overlays'].map(k => [k, JSON.parse(fs.readFileSync(path.join(SRC, k + '.json'), 'utf8'))]));
const content = () => assembleContent(compileContent(inputs()).data, E.dex.createDexLookup()).content;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-int-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

async function win(game, id, ring) {
	const s = await E.session.BattleSession.create({ game, battleId: id, content: content(), seed: [1, 2, 3, 4], logger: ring && ring.sink, foe: { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5)] } });
	const msgs = s.take();
	for (let i = 0; i < 8 && !s.finished; i++) { if (s.pendingLearn) { msgs.push(...await s.decideLearn(null)); continue; } msgs.push(...(await s.chooseMove(1)).messages); }
	return { s, msgs };
}

test('a legacy (schema 1) save plays a whole battle with pipeline content; result, replay, restore-then-retry behave', async () => {
	const legacy = clone(require('./fixtures/legacy-v1-flow-state.json'));
	const f = path.join(dir, 'legacy.json'); fs.writeFileSync(f, JSON.stringify(legacy));
	// since step 5.0 the migration maps the legacy Showdown names to the pipeline content's ids (D5-3)
	const store = new E.store.SaveStore(f, {}, E.speciesKey.speciesKeyResolver(content()));
	const info = store.loadInfo();
	assert.deepEqual([info.from, info.to], [1, E.state.GAME_SCHEMA]);
	assert.deepEqual(findDanglingReferences(info.state, content(), E.dex.createDexLookup()), [], 'the legacy save refers only to content that exists');
	const ring = E.log.createRingLogger();
	const { s } = await win(E.speciesKey.battleView(info.state, content()), 'INT-1', ring);
	assert.equal(s.finished, true);
	const result = s.result();
	assert.equal(store.commit(result).status, 'applied');
	assert.equal(store.commit(result).status, 'already-applied', 'a replay changes nothing');
	assert.ok(fs.existsSync(f + '.v1.bak'), 'the legacy file was kept');
	// restore the legacy file (an older save) and retry: the result applies once more, exactly once
	fs.copyFileSync(f + '.v1.bak', f);
	assert.equal(store.commit(result).status, 'applied');
	assert.equal(store.commit(result).status, 'already-applied');
	assert.deepEqual(ring.entries().filter(e => e.kind === 'end').map(e => e.data.reason), ['win']);
	assert.equal(store.load().schema, E.state.GAME_SCHEMA);
});

test('the same battle is described in both languages from content text keys, with no missing key', async () => {
	const { msgs, s } = await win(F.makeGame(), 'INT-2');
	const names = Object.fromEntries([...s.party, ...s.foeTeam].map(m => [m.id, m.species]));
	const tr = { en: E.i18n.translatorFor('en'), zh: E.i18n.translatorFor('zh') };
	const nameFor = (lang, species) => tr[lang].tOr(content().species[species].nameKey, species);
	for (const lang of ['en', 'zh']) {
		const display = Object.fromEntries(Object.entries(names).map(([id, sp]) => [id, nameFor(lang, sp)]));
		const lines = msgs.flatMap(m => E.describe.make(display, tr[lang]).message(m));
		assert.ok(lines.length > 5 && lines.every(l => !l.includes('[missing:')));
		if (lang === 'zh') assert.ok(lines.some(l => l.includes('喷火龙')) && lines.some(l => l.includes('波波')), 'species display names come from the content text keys');
		assert.deepEqual(tr[lang].diagnostics(), { missingKeys: [], missingParams: [] });
	}
});

test('missing and dangling references are explained, not crashed on', async () => {
	// a species the content does not have, in the party / in the foe team
	// (a saved state names content ids since step 5.0: the fixture party is stored the way the sample content keys it)
	const saved = () => { const s = F.makeGame(); s.party = s.party.map(m => E.speciesKey.toPersistentMember(m, content())); return s; };
	const sg = saved(); sg.party[1].species = 'missingno';
	assert.deepEqual(findDanglingReferences(sg, content()).map(d => d.path), ['$.party[1].species']);
	const g = F.makeGame(); g.party[1].species = 'Missingno';
	await assert.rejects(() => E.session.BattleSession.create({ game: g, battleId: 'INT-3', content: content(), seed: [1, 2, 3, 4], foe: { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5)] } }), /species "Missingno" \(member A-0002\) is not in the content "sample"/);
	await assert.rejects(() => E.session.BattleSession.create({ game: F.makeGame(), battleId: 'INT-4', content: content(), seed: [1, 2, 3, 4], foe: { kind: 'wild', team: [{ ...F.foeMember('W1-1', 'Pidgey', 5), species: 'Zzz' }] } }), /species "Zzz" \(member W1-1\)/);
	// a move the battle engine does not know
	const sg2 = saved(); sg2.party[0].moves[0].id = 'notamove';
	assert.deepEqual(findDanglingReferences(sg2, content(), E.dex.createDexLookup()).map(d => d.path), ['$.party[0].moves[0].id']);
	const g2 = F.makeGame(); g2.party[0].moves[0].id = 'notamove';
	await assert.rejects(() => E.session.BattleSession.create({ game: g2, battleId: 'INT-5', content: content(), seed: [1, 2, 3, 4], foe: { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5)] } }), /move "notamove" of member A-0001/);
	// content with a missing required field never produces output that could stand in for it
	const i = inputs(); delete i.species[0].growth;
	const r = compileContent(i);
	assert.equal(r.ok, false); assert.match(r.errors[0].message, /missing required field "growth"/);
});

test('an abandoned or failed battle leaves the state and the ledger exactly as they were', async () => {
	const game = F.makeGame(); const before = JSON.stringify(game);
	const s = await E.session.BattleSession.create({ game, battleId: 'INT-6', content: content(), seed: [1, 2, 3, 4], foe: { kind: 'wild', team: [F.foeMember('W1-1', 'Snorlax', 40, { moves: ['protect'] })] } });
	s.take(); await s.useItem('potion', 'A-0002').catch(() => {}); await s.chooseMove(1);
	assert.throws(() => s.result(), /not finished/);
	assert.equal(JSON.stringify(game), before, 'the persistent state is only ever changed by a committed result');
});
