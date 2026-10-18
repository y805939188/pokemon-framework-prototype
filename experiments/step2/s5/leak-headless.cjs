'use strict';
// Does the engine/session layer retain memory across battles? (Node, forced GC between samples.)
// Run: node --expose-gc experiments/step2/s5/leak-headless.cjs [battles]
const F = require('../../../js/engine/fixtures/game.cjs');
const { BattleSession } = require('../../../js/engine/game/session.cjs');
const N = Number(process.argv[2]) || 100;
const mb = () => { global.gc(); global.gc(); const m = process.memoryUsage(); return { heap: Math.round(m.heapUsed / 1048576 * 10) / 10, rss: Math.round(m.rss / 1048576) }; };
(async () => {
	const samples = [];
	for (let i = 1; i <= N; i++) {
		const game = F.makeGame();
		const s = await BattleSession.create({ game, battleId: 'L-' + i, content: F.content, seed: [1, 2, 3, 4], foe: { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5)] } });
		s.take(); await s.run();
		if (i === 1 || i % 25 === 0) samples.push({ battles: i, ...mb() });
	}
	console.log(JSON.stringify(samples));
})();
