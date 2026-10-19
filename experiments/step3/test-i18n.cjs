'use strict';
// Step 3 / B2: text keys, fallback, diagnostics, the second-language sample, and the structured log.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const { createTranslator, checkLocale, BUILTIN_LOCALES, translatorFor } = E.i18n;
const { en, zh } = BUILTIN_LOCALES;
const F = E.fixtures;

test('translator: parameters, fallback chain, missing keys and missing parameters are all visible', () => {
	const tr = createTranslator({ en, zh: { meta: { name: 'zh', font: 'X' }, text: { 'battle.fainted': '{name}倒下了！' } } }, 'zh');
	assert.equal(tr.t('battle.fainted', { name: '波波' }), '波波倒下了！');
	assert.equal(tr.t('battle.crit'), 'A critical hit!', 'falls back to English for a key the language lacks');
	assert.equal(tr.t('no.such.key'), '[missing:no.such.key]');
	assert.equal(tr.t('battle.used_move', { user: 'A' }), 'A used {move}!', 'a missing parameter stays visible');
	assert.deepEqual(tr.diagnostics(), { missingKeys: ['no.such.key'], missingParams: ['battle.used_move:{move}'] });
	assert.equal(tr.tOr('no.such.key', 'raw'), 'raw'); assert.equal(tr.has('battle.crit'), true); assert.equal(tr.has('nope'), false);
	assert.equal(tr.font(), 'X');
	assert.equal(translatorFor('xx').lang, 'en', 'an unknown language gets English, not an error');
});

test('locale check: the Chinese sample covers every English key with the same placeholders', () => {
	const c = checkLocale(en, zh);
	assert.deepEqual(c, { missing: [], extra: [], placeholderMismatch: [] });
});

test('locale check finds missing keys, stale keys and placeholder mistakes', () => {
	const broken = { meta: { name: 'x' }, text: { ...en.text, 'battle.fainted': '{nom} fainted', 'stale.key': 'x' } };
	delete broken.text['battle.crit'];
	const c = checkLocale(en, broken);
	assert.deepEqual(c.missing, ['battle.crit']);
	assert.deepEqual(c.extra, ['stale.key']);
	assert.deepEqual(c.placeholderMismatch, [{ key: 'battle.fainted', expected: ['name'], actual: ['nom'] }]);
});

async function playMessages() {
	const msgs = [];
	const game = F.makeGame(); game.party[0].exp = E.growth.minExp('parabolic', 51) - 1; game.party[0].hp = 70;
	const mk = (foe, id) => E.session.BattleSession.create({ game, battleId: id, content: F.content, seed: [1, 2, 3, 4], foe });
	const s = await mk({ kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5)] }, 'I18N-1');
	msgs.push(...s.take()); msgs.push(...(await s.useItem('potion', 'A-0001')).messages); msgs.push(...(await s.throwBall('pokeball')).messages);
	for (let i = 0; i < 6 && !s.finished; i++) { if (s.pendingLearn) { msgs.push(...await s.decideLearn(null)); continue; } msgs.push(...(await s.chooseMove(1)).messages); }
	const w = await mk({ kind: 'wild', team: [F.foeMember('W1-1', 'Snorlax', 40, { moves: ['protect'] })] }, 'I18N-2');
	msgs.push(...(await w.throwBall('masterball')).messages);
	const r = await mk({ kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5)] }, 'I18N-3');
	msgs.push(...(await r.run()).messages);
	return msgs;
}

test('a whole set of battles can be described in English and in Chinese without a single missing key', async () => {
	const msgs = await playMessages();
	const names = { 'A-0001': 'Charizard', 'T1-1': 'Pidgey', 'W1-1': 'Snorlax' };
	for (const lang of ['en', 'zh']) {
		const tr = translatorFor(lang);
		const D = E.describe.make(names, tr);
		const lines = msgs.flatMap(m => D.message(m));
		assert.ok(lines.length > 10, `${lang}: some text came out`);
		assert.ok(lines.every(l => typeof l === 'string' && l.length && !l.includes('[missing:')), `${lang}: ${lines.filter(l => l.includes('[missing')).join(' | ')}`);
		assert.deepEqual(tr.diagnostics(), { missingKeys: [], missingParams: [] }, lang);
	}
	const zhLines = msgs.flatMap(m => E.describe.make(names, translatorFor('zh')).message(m));
	assert.ok(zhLines.some(l => /倒下了|使用了|获得了/.test(l)), 'the second language really produces Chinese text');
	assert.ok(zhLines.some(l => /伤药/.test(l)) && zhLines.some(l => /大师球/.test(l)), 'item and ball names are translated too');
});

test('logger: redaction and a bounded ring', () => {
	const ring = E.log.createRingLogger(3);
	for (let i = 0; i < 5; i++) ring.sink({ battleId: 'B', level: 'info', kind: 'k' + i, data: { path: '/Users/someone/secret/file.json', winpath: 'C:\\Users\\bob\\x', long: 'x'.repeat(500), list: Array.from({ length: 50 }, (_, j) => j) } });
	const es = ring.entries();
	assert.equal(es.length, 3); assert.deepEqual(es.map(e => e.n), [2, 3, 4], 'numbers keep running when old entries drop out');
	const text = JSON.stringify(es);
	assert.ok(!/\/Users\/someone|C:\\\\Users|bob/.test(text), 'no personal path survives');
	assert.ok(es[0].data.long.length < 220 && es[0].data.list.length <= 21);
});

test('the session log correlates choices, refusals, ledger, growth and the end by battle id', async () => {
	const ring = E.log.createRingLogger();
	const game = F.makeGame(); game.party[0].exp = E.growth.minExp('parabolic', 51) - 1; game.party[0].hp = 70;
	const s = await E.session.BattleSession.create({ game, battleId: 'LOG-1', content: F.content, seed: [1, 2, 3, 4], logger: ring.sink, foe: { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5)] } });
	assert.deepEqual(await s.run(), { ok: false, reason: 'trainer' });
	assert.equal((await s.useItem('potion', 'A-0002')).ok, false, 'full-HP target refused');
	await s.useItem('potion', 'A-0001');
	for (let i = 0; i < 6 && !s.finished; i++) { if (s.pendingLearn) { await s.decideLearn(null); continue; } await s.chooseMove(1); }
	const es = ring.entries();
	assert.ok(es.every(e => e.battleId === 'LOG-1'));
	assert.deepEqual(es.map(e => e.n), es.map((_, i) => i), 'one running number');
	const kinds = es.map(e => e.kind);
	for (const k of ['session.create', 'choice', 'refusal', 'ledger', 'turn', 'growth', 'request', 'end']) assert.ok(kinds.includes(k), `log has ${k}`);
	assert.deepEqual(es.filter(e => e.kind === 'refusal').map(e => e.data.reason), ['trainer', 'item-no-effect']);
	assert.deepEqual(es.filter(e => e.kind === 'ledger').map(e => e.data.op), ['reserve', 'consume']);
	assert.equal(es.find(e => e.kind === 'session.create').data.content.kind, 'fixture');
	assert.equal(es.find(e => e.kind === 'end').data.reason, 'win');
	assert.ok(!JSON.stringify(es).includes('/Users/'));
});

test('a logger that throws cannot affect the battle', async () => {
	const game = F.makeGame();
	const s = await E.session.BattleSession.create({ game, battleId: 'LOG-2', content: F.content, seed: [1, 2, 3, 4], logger: () => { throw new Error('sink down'); }, foe: { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5)] } });
	assert.equal((await s.run()).ok, true);
	assert.equal(s.finished, true);
});

// ---- R1: keys and language names that match Object.prototype members are ordinary missing keys
test('keys named like Object.prototype members are missing keys, in English and Chinese; real keys with those names work', () => {
	const PROTO = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'];
	for (const lang of ['en', 'zh']) {
		const tr = translatorFor(lang);
		for (const key of PROTO) {
			assert.equal(tr.has(key), false, `${lang} has(${key})`);
			assert.equal(tr.t(key), `[missing:${key}]`, `${lang} t(${key})`);
			assert.equal(tr.tOr(key, 'caller fallback'), 'caller fallback', `${lang} tOr(${key})`);
		}
		assert.deepEqual(tr.diagnostics().missingKeys, [...PROTO].sort(), `${lang}: every miss is diagnosed (tOr records nothing)`);
	}
	// an explicit translation under such a key is a legitimate key and must resolve, with parameters
	const tr = createTranslator({ en: { meta: { name: 'en' }, text: Object.assign(Object.create(null), { constructor: 'Builder {who}', toString: 'text' }) } }, 'en');
	assert.equal(tr.t('constructor', { who: 'Ann' }), 'Builder Ann'); assert.equal(tr.has('toString'), true);
	const own = JSON.parse('{"meta":{"name":"en"},"text":{"constructor":"own value","__proto__":"own proto value"}}');
	const t2 = createTranslator({ en: own }, 'en');
	assert.equal(t2.t('constructor'), 'own value'); assert.equal(t2.t('__proto__'), 'own proto value');
});

test('the fallback chain only consults own keys: a prototype name never shadows a real translation in the next language', () => {
	const tr = createTranslator({ en, zh: { meta: { name: 'zh' }, text: { 'battle.crit': '击中了要害！' } } }, 'zh');
	assert.equal(tr.t('battle.crit'), '击中了要害！'); assert.equal(tr.t('constructor'), '[missing:constructor]');
	const tr2 = createTranslator({ en: { meta: { name: 'en' }, text: { constructor: 'fallback text' } }, zh: { meta: { name: 'zh' }, text: {} } }, 'zh');
	assert.equal(tr2.t('constructor'), 'fallback text', 'the key is real in English; Chinese lacks it');
});

test('a non-string table value is not a translation, and language names like "constructor" do not break the translator', () => {
	const bad = { meta: { name: 'bad' }, text: { 'battle.crit': 42, 'x.y': null } };
	const tr = createTranslator({ en, bad }, 'bad');
	assert.equal(tr.t('battle.crit'), 'A critical hit!', 'falls through to the next language'); assert.equal(tr.has('x.y'), false);
	for (const name of ['constructor', 'toString', '__proto__']) {
		const t = createTranslator({ en }, name);
		assert.equal(t.t('battle.crit'), 'A critical hit!', name); assert.equal(t.font(), undefined, name); assert.equal(t.has('constructor'), false);
	}
	assert.equal(translatorFor('constructor').lang, 'en', 'an unknown language, even with a prototype name, gets English');
});

test('checkLocale compares own keys only', () => {
	const base = { meta: { name: 'b' }, text: { a: 'x', constructor: '{n}' } };
	const other = { meta: { name: 'o' }, text: { a: 'y' } };
	assert.deepEqual(checkLocale(base, other), { missing: ['constructor'], extra: [], placeholderMismatch: [] }, 'the key exists in the base only, even though every object has a constructor');
	const o2 = { meta: { name: 'o' }, text: { a: 'y', constructor: '{m}' } };
	assert.deepEqual(checkLocale(base, o2).placeholderMismatch, [{ key: 'constructor', expected: ['n'], actual: ['m'] }]);
});
