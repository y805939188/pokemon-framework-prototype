'use strict';
// Protocol v1 contract. The frozen file records what the session API actually produces:
//  - message and result key sets are OBSERVED from several scenarios (singles win with level-up/learn/forced switch,
//    capture, run, defeat, doubles), not typed in;
//  - the session call list is derived from BattleSession itself;
//  - end/refusal reason codes are the exported vocabularies (END_REASONS/REFUSAL_REASONS), and the test also checks
//    that every value actually observed is declared and every declared value was provoked (or is explicitly listed
//    as not provokable here).
// Regenerate ONLY with a deliberate version decision: node experiments/step2/s5/protocol-freeze.cjs --update
const fs = require('fs');
const path = require('path');
const F = require('../../../js/engine/fixtures/game.cjs');
const G = require('../../../js/engine/game/growth.cjs');
const S = require('../../../js/engine/game/state.cjs');
const { BattleSession, END_REASONS, REFUSAL_REASONS } = require('../../../js/engine/game/session.cjs');

const FILE = path.resolve(__dirname, '../../../docs/step2/protocol-v1.frozen.json');
/** Declared reasons that no scenario here can provoke; keep this list short and justified. */
const NOT_PROVOKED = { tie: 'only a Showdown draw produces it (no fixture reaches one); the code path is `b.winner ? win : tie` in gateway.cjs' };
const keys = o => Object.keys(o).sort();
const merge = (acc, k, ks) => { acc[k] = acc[k] ? [...new Set([...acc[k], ...ks])].sort() : ks; };

async function make(game, foe, o = {}) {
	const s = await BattleSession.create({ game, battleId: o.id, content: F.content, seed: o.seed || [1, 2, 3, 4], foe, doubles: !!o.doubles });
	s.take();
	return s;
}
const wildOf = (sp, lv, extra = {}, moves) => ({ kind: 'wild', ...extra, team: [F.foeMember('W1-1', sp, lv, moves ? { moves } : undefined)] });

/** Run the scenarios; returns everything observed (shapes, outcomes, reasons) without any hard-coded expectation. */
async function observeAll() {
	const shapes = {}, endReasons = new Set(), refusals = new Set(), outcomes = {};
	const msgs = list => { for (const m of list || []) { merge(shapes, m.kind, keys(m)); if (m.kind === 'end') endReasons.add(m.reason); } };
	const refusal = r => { if (r && r.ok === false && r.reason) refusals.add(r.reason); return r; };
	const done = (name, s) => { outcomes[name] = s.result(); return outcomes[name]; };

	// 1. singles trainer win: rejected choice, level-up, learn prompt, forced switch of the foe
	const game = F.makeGame(); game.party[0].exp = G.minExp('parabolic', 51) - 1;
	const win = await make(game, { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5), F.foeMember('T1-2', 'Pidgey', 5)] }, { id: 'P-1' });
	refusal(await win.chooseMove(99));
	let r = await win.chooseMove(1); msgs(r.messages);
	msgs(await win.decideLearn(3));
	r = await win.chooseMove(4); msgs(r.messages);
	while (!win.finished) { r = await win.chooseMove(1); msgs(r.messages); if (win.pendingLearn) msgs(await win.decideLearn(null)); }
	done('win', win);

	// 2. capture and 3. run
	const cap = await make(F.makeGame(), wildOf('Snorlax', 40, {}, ['protect']), { id: 'P-2' });
	r = await cap.throwBall('masterball'); msgs(r.messages); done('caught', cap);
	const run = await make(F.makeGame(), wildOf('Pidgey', 5), { id: 'P-3' });
	r = await run.run(); msgs(r.messages); done('run', run);

	// 4. defeat: the only party member is at 1 HP and slower than the foe (the foe wins)
	const dg = F.makeGame(); dg.party = [dg.party[1]]; dg.party[0].hp = 1;
	const lose = await make(dg, { kind: 'trainer', team: [F.foeMember('T1-1', 'Gengar', 100, { moves: ['tackle'] })] }, { id: 'P-4' });
	// fainted active: no run/ball/item possible until the forced switch (none left here: the battle ends instead)
	r = await lose.chooseMove(3); msgs(r.messages); done('defeat', lose);

	// 5. refusals (each consumes nothing); every call is a plain session call
	const fx = (g, f, o) => make(g, f, o);
	const tr = await fx(F.makeGame(), { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5), F.foeMember('T1-2', 'Pidgey', 5)] });
	refusal(await tr.run()); refusal(await tr.throwBall('pokeball'));
	const nb = await fx(F.makeGame(), wildOf('Snorlax', 40, { noBall: true, noRun: true }, ['protect']));
	refusal(await nb.throwBall('pokeball')); refusal(await nb.run());
	const tp = await fx(F.makeGame(), wildOf('Snorlax', 40, {}, ['protect']));
	tp.gw._debugBattle().getSide('p1').active[0].trapped = true; refusal(await tp.run());
	refusal(await tp.useItem('nope', 'A-0001')); refusal(await tp.useItem('potion', 'A-0001')); refusal(await tp.useItem('potion', 'ZZZ'));
	const iv = await fx(F.makeGame(), wildOf('Snorlax', 40, {}, ['protect']));
	const foeMon = iv.gw._debugBattle().getSide('p2').active[0]; foeMon.volatiles.fly = { id: 'fly', target: foeMon };
	refusal(await iv.throwBall('pokeball'));
	const two = await fx(F.makeGame(), { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5), F.foeMember('W1-2', 'Pidgey', 5)] });
	refusal(await two.throwBall('pokeball'));
	const nl = await fx(F.makeGame({ bag: { pokeball: 0 } }), wildOf('Snorlax', 40, {}, ['protect']));
	refusal(await nl.throwBall('pokeball'));
	// a fainted active mon waits for the forced switch: run/ball/item are refused (item: engine has no move request)
	const fg = F.makeGame(); fg.party[0].hp = 1; fg.party[1].hp = 50;
	const fs = await fx(fg, wildOf('Snorlax', 100, {}, ['bodyslam']));
	msgs((await fs.chooseMove(1)).messages);
	refusal(await fs.run()); refusal(await fs.throwBall('pokeball')); refusal(await fs.useItem('potion', 'A-0002'));
	const dbl = await fx(F.makeGame(), { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5), F.foeMember('W1-2', 'Pidgey', 5)] }, { doubles: true });
	refusal(await dbl.chooseDoubles([{ move: 1, target: 1 }, { kind: 'ball', ball: 'pokeball' }]));
	r = await dbl.chooseDoubles([{ move: 1, target: 1 }, { move: 1, target: 2 }]); msgs(r.messages);
	return { shapes, endReasons, refusals, outcomes };
}

async function observe() {
	const o = await observeAll();
	const proto = Object.getOwnPropertyNames(BattleSession.prototype).filter(n => n !== 'constructor' && !n.startsWith('_') && typeof BattleSession.prototype[n] === 'function').sort();
	const statics = Object.getOwnPropertyNames(BattleSession).filter(n => typeof BattleSession[n] === 'function' && !n.startsWith('default')).sort();
	const first = x => Object.values(x.members)[0];
	return {
		protocol: S.PROTOCOL_VERSION,
		validatedScope: 'singles text-UI flow in NW.js 0.117.0 / RPGReactor 0.98.8; doubles verified at engine/session level only',
		messageKeys: Object.fromEntries(Object.entries(o.shapes).sort()),
		resultKeys: keys(o.outcomes.win),
		outcomeKeys: Object.fromEntries(Object.entries(o.outcomes).map(([k, v]) => [k, keys(v.outcome)]).sort()),
		memberPatchKeys: keys(first(o.outcomes.win)),
		capturedMemberKeys: keys(o.outcomes.caught.captured[0]),
		moveKeys: keys(o.outcomes.win.members['A-0001'].moves[0]),
		dexKeys: keys(o.outcomes.win.dex),
		writeSet: S.MEMBER_WRITE_SET.slice().sort(),
		sessionCalls: proto,
		sessionStatics: statics,
		endReasons: END_REASONS.slice().sort(),
		refusalReasons: REFUSAL_REASONS.slice().sort(),
		notProvoked: NOT_PROVOKED,
	};
}

if (require.main === module) {
	observe().then(o => {
		if (process.argv.includes('--update')) { fs.writeFileSync(FILE, JSON.stringify(o, null, 2) + '\n'); console.log('frozen file written'); }
		else console.log(JSON.stringify(o, null, 2));
	});
}
module.exports = { observe, observeAll, FILE, NOT_PROVOKED };
