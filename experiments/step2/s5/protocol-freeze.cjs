'use strict';
// Protocol v1 contract: observed message/result shapes must equal docs/step2/protocol-v1.frozen.json.
// Regenerate ONLY with a deliberate version decision: node experiments/step2/s5/protocol-freeze.cjs --update
const fs = require('fs');
const path = require('path');
const F = require('../../../js/engine/fixtures/game.cjs');
const G = require('../../../js/engine/game/growth.cjs');
const S = require('../../../js/engine/game/state.cjs');
const { BattleSession } = require('../../../js/engine/game/session.cjs');

const FILE = path.resolve(__dirname, '../../../docs/step2/protocol-v1.frozen.json');
const keys = o => Object.keys(o).sort();

async function observe() {
	const shapes = {};
	const note = (m) => { const k = m.kind; const ks = keys(m); shapes[k] = shapes[k] ? [...new Set([...shapes[k], ...ks])].sort() : ks; };
	const mk = async (game, foe, o = {}) => { const s = await BattleSession.create({ game, battleId: o.id, content: F.content, seed: [1, 2, 3, 4], foe, doubles: !!o.doubles }); s.take(); return s; };
	// level-up + learn prompt + forced switch of the foe + win + a rejected choice
	const game = F.makeGame(); game.party[0].exp = G.minExp('parabolic', 51) - 1;
	const s = await mk(game, { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5), F.foeMember('T1-2', 'Pidgey', 5)] }, { id: 'P-1' });
	let all = [];
	await s.chooseMove(99); // refused by the engine: an `error` message follows on the next turn
	let r = await s.chooseMove(1); all.push(...r.messages);
	all.push(...await s.decideLearn(3));
	r = await s.chooseMove(4); all.push(...r.messages);
	while (!s.finished) { r = await s.chooseMove(1); all.push(...(r.messages || [])); if (s.pendingLearn) all.push(...await s.decideLearn(null)); }
	for (const m of all) note(m);
	const result = s.result();
	// capture hand-over for the `captured` member shape
	const c = await mk(F.makeGame(), { kind: 'wild', team: [F.foeMember('W1-1', 'Snorlax', 40, { moves: ['protect'] })] }, { id: 'P-2' });
	await c.throwBall('masterball');
	const cres = c.result();
	const out = {
		protocol: S.PROTOCOL_VERSION,
		validatedScope: 'singles text-UI flow in NW.js 0.117.0 / RPGReactor 0.98.8; doubles verified at engine/session level only',
		messageKeys: Object.fromEntries(Object.entries(shapes).sort()),
		resultKeys: keys(result),
		outcomeKeys: { win: keys(result.outcome), caught: keys(cres.outcome) },
		memberPatchKeys: keys(Object.values(result.members)[0]),
		capturedMemberKeys: keys(cres.captured[0]),
		moveKeys: keys(result.members['A-0001'].moves[0]),
		dexKeys: keys(result.dex),
		writeSet: S.MEMBER_WRITE_SET.slice().sort(),
		sessionCalls: ['cancel', 'chooseDoubles', 'chooseForcedSwitch', 'chooseMove', 'chooseSwitch', 'commitTurn', 'decideLearn', 'result', 'run', 'take', 'throwBall', 'useItem'],
		endReasons: ['caught', 'run', 'tie', 'win'],
		refusalReasons: ['ballsdisabled', 'choice-rejected', 'multiplefoes', 'noactive', 'none-left', 'not-registered', 'trainer', 'trapped', 'unknown-item'],
	};
	return out;
}

if (require.main === module) {
	observe().then(o => {
		if (process.argv.includes('--update')) { fs.writeFileSync(FILE, JSON.stringify(o, null, 2) + '\n'); console.log('frozen file written'); }
		else console.log(JSON.stringify(o, null, 2));
	});
}
module.exports = { observe, FILE };
