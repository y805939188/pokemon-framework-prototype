'use strict';
// Step 5.0 core timings without a window (plan §3 5.0 item 7): a full save (party 6, every box slot used, every known
// bag item at the cap) through the operations that touch all of it. Node, this machine; a measurement, not a test.
//   node experiments/step5/perf-core5.cjs [repeats] > out.json
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const E = require('../../js/engine/build/engine.cjs');
const N = Number(process.argv[2]) || 30;
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '../../content/sample', f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
const keys = E.speciesKey.speciesKeyResolver(content);
const step4 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/step4-saves/full.json'), 'utf8'));
const L = E.limits.DEFAULT_LIMITS;
// schema 3 full save: the step 4 sample with every box slot used and every known bag item at 999
const full3 = JSON.parse(JSON.stringify(step4));
full3.boxes = Array.from({ length: L.boxes }, (_, i) => ({ ...JSON.parse(JSON.stringify(step4.party[1])), id: `BX-${i}` }));
for (const item of E.items.BAG_ITEMS) full3.bag[item] = 999;
const full4 = E.saveSchema.migrateGame(full3, { speciesKey: keys }).state;
const capture = { protocol: 1, battleId: 'perf#1', outcome: { kind: 'run', winner: null }, members: { 'G-starter-1': { hp: 10 } }, bag: { potion: -1 }, captured: [], dex: { seen: ['Pidgey'], owned: [] } };
function time(label, fn) {
  for (let i = 0; i < 3; i++) fn(); // warm-up
  const ms = [];
  for (let i = 0; i < N; i++) { const t = process.hrtime.bigint(); fn(); ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
  ms.sort((a, b) => a - b);
  return { label, n: N, p50: +ms[Math.floor(N / 2)].toFixed(3), p95: +ms[Math.floor(N * 0.95) - 1 < 0 ? 0 : Math.floor(N * 0.95) - 1].toFixed(3), max: +ms[N - 1].toFixed(3) };
}
const out = {
  at: new Date().toISOString(), node: process.version, cpu: os.cpus()[0] && os.cpus()[0].model, platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  state: { party: full4.party.length, boxes: full4.boxes.length, bagItems: Object.keys(full4.bag).length, jsonBytes: JSON.stringify(full4).length },
  timings: [
    time('migrate 3 -> 4 (full save)', () => E.saveSchema.migrateGame(full3, { speciesKey: keys })),
    time('validate schema 4 (full save)', () => E.saveSchema.validateGame(full4)),
    time('battle view (full save)', () => E.speciesKey.battleView(full4, content)),
    time('apply a result (full save, clone included)', () => E.state.applyBattleResult(full4, { ...capture, battleId: `perf#${Math.random()}` }, L, keys)),
    time('JSON round trip (full save)', () => JSON.parse(JSON.stringify(full4))),
  ],
};
console.log(JSON.stringify(out, null, 1));
