'use strict';
// Writes js/engine/fixtures/matrix-fingerprints.json from a fresh matrix run. Run it ONLY after an intended
// behaviour change (new engine pin, rule change) and review the diff: the file is the regression baseline that
// test-matrix.cjs and scripts/run-package-tests-mac.sh compare against.
const fs = require('fs');
const path = require('path');
const { runMatrix } = require('../../../js/engine/matrix.cjs');
const FILE = path.resolve(__dirname, '../../../js/engine/fixtures/matrix-fingerprints.json');
(async () => {
	const a = await runMatrix(), b = await runMatrix();
	for (const r of a) if (r.status !== 'pass') { console.error(`${r.id} failed: ${r.error}`); process.exit(1); }
	if (JSON.stringify(a.map(r => r.fingerprint)) !== JSON.stringify(b.map(r => r.fingerprint))) { console.error('fingerprints are not reproducible'); process.exit(1); }
	const out = { note: 'Regenerate with experiments/step2/s5/update-matrix-baseline.cjs after an intended behaviour change; review the diff.', fingerprints: Object.fromEntries(a.map(r => [r.id, r.fingerprint])) };
	fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
	console.log('written', FILE);
})();
