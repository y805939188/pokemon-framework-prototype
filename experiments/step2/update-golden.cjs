'use strict';
// Deliberately regenerate the fixed-seed golden. Golden = engine regression baseline only
// (not verified against the Ruby reference).
const fs = require('fs');
const { fixture, create, drive, summarize, GOLDEN_FILE } = require('../../js/engine/harness.cjs');
(async () => {
	const s = summarize((await drive(await create())).msgs);
	fs.writeFileSync(GOLDEN_FILE, JSON.stringify({ fixtureId: fixture.fixtureId, seed: fixture.seed, ...s }, null, 2) + '\n');
	console.log('golden written', s);
})();
