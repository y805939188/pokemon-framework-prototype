'use strict';
// Step 5.0 review of 1960b92, F03: the headless SaveStore knows no content, so it guesses no species keys. A save
// written by the step 4 code (the P-1 sample) is refused without the content mapping (file untouched, no backup),
// migrated with it (the original kept byte for byte as .v3.bak), and a result naming a species is refused when the store
// was given no mapping; the fixture world's identity mapping is only used when chosen explicitly. r8 FR-000394/428.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const H = require('./1/legacy-test-support.cjs');
const { SaveStore, SaveError } = E.store;

const P1 = path.join(__dirname, 'fixtures/step4-saves');
const results = JSON.parse(fs.readFileSync(path.join(P1, 'results.json'), 'utf8'));
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '../../content/sample', f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
const keys = E.speciesKey.speciesKeyResolver(content);
const dirs = [];
test.after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
/** A copy of a P-1 file in its own temporary folder. */
function copy(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-store5-')); dirs.push(d);
  const f = path.join(d, 'save.json'); fs.copyFileSync(path.join(P1, name), f);
  return f;
}
const ls = f => fs.readdirSync(path.dirname(f)).sort();

test('without a species mapping a step 4 save is refused (needs-content): nothing is upgraded, written or backed up', () => {
  const f = copy('full.json'); const bytes = fs.readFileSync(f);
  assert.throws(() => new SaveStore(f).loadInfo(), e => e instanceof SaveError && e.info.code === 'needs-content');
  const someResult = results[Object.keys(results)[0]];
  assert.throws(() => new SaveStore(f).commit(someResult), e => e instanceof SaveError && e.info.code === 'needs-content');
  assert.ok(fs.readFileSync(f).equals(bytes), 'the file is byte for byte unchanged');
  assert.deepEqual(ls(f), ['save.json'], 'no backup, no temp file');
});

test('with the content mapping it migrates: content id + form, the original kept as .v3.bak, and every committed result is still a repeat', () => {
  const f = copy('full.json'); const bytes = fs.readFileSync(f);
  const store = new SaveStore(f, {}, keys, content);
  const info = store.loadInfo();
  assert.deepEqual([info.from, info.to, info.migrated], [3, 7, true]);
  assert.ok(info.state.party.every(m => E.speciesKey.battleNameOf(content, m) !== null), 'every member resolves in the content');
  assert.ok(fs.readFileSync(f).equals(bytes), 'loading migrates in memory only');
  const committed = JSON.parse(bytes).appliedBattles;
  const first = Object.keys(committed)[0];
  assert.deepEqual(store.commit(results[first], H.templatesFor(info.state, results[first])), { status: 'already-applied', migratedFrom: 3 });
  assert.ok(fs.readFileSync(f + '.v3.bak').equals(bytes), 'the step 4 file is kept byte for byte');
  const now = store.loadInfo();
  assert.deepEqual([now.from, now.migrated, now.state.party.map(m => m.species)], [7, false, info.state.party.map(m => m.species)]);
  for (const id of Object.keys(committed)) assert.equal(store.commit(results[id], H.templatesFor(info.state, results[id])).status, 'already-applied', id);
});

test('a current store requires content; content without a result mapping refuses named species while species-free results apply', () => {
  const f = copy('full.json');
  const initial = new SaveStore(f, {}, keys, content); const migrated = initial.loadInfo().state; const prior = results[Object.keys(results)[0]]; initial.commit(prior, H.templatesFor(migrated, prior)); // now a current schema 7 file
  const bytes = fs.readFileSync(f);
  assert.throws(() => new SaveStore(f).loadInfo(), e => e instanceof SaveError && e.info.code === 'needs-content');
  assert.ok(fs.readFileSync(f).equals(bytes), 'missing current content writes nothing');
  const store = new SaveStore(f, {}, undefined, content); // current content is required; a result mapping remains a separate explicit capability
  assert.equal(store.loadInfo().from, 7);
  const caught = Object.values(results).find(r => r.captured && r.captured.length);
  assert.throws(() => store.commit({ ...caught, battleId: 'new#1' }), /names species \(.*\) and the store was given no species mapping/);
  assert.ok(fs.readFileSync(f).equals(bytes), 'nothing was written');
  const run = { protocol: 1, battleId: 'run#1', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } };
  assert.equal(store.commit(run).status, 'applied');
  assert.throws(() => store.commit({ ...run, battleId: 'dex-without-mapping', dex: {seen:['Pidgey'],owned:[]} }), /names species .*no species mapping/);
});

test('the fixture world chooses the identity mapping explicitly; with it, the step 4 save would NOT resolve in the real content', () => {
  const f = copy('full.json');
  const bytes = fs.readFileSync(f);
  assert.throws(() => new SaveStore(f, {}, E.speciesKey.identityKeys, E.fixtures.content).loadInfo(), e => e.info.code === 'unmapped-species', '5.1 additionally rejects unknown individual content during 4→5');
  assert.ok(fs.readFileSync(f).equals(bytes));
  fs.writeFileSync(f, JSON.stringify(H.legacyGame(E.fixtures.makeGame(), 3)));
  const fixtureView = new SaveStore(f, {}, E.speciesKey.identityKeys, E.fixtures.content).loadInfo().state;
  assert.ok(fixtureView.party.every(m => E.speciesKey.battleNameOf(content, m) === null), 'Showdown names kept as content ids: unusable with the sample content');
});
