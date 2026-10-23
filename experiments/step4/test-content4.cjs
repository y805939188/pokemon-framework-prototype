'use strict';
// Step 4 / A: the live content sample (a starter, the two wild species, one starter grant), the creation data the
// assembly adds from the pinned Showdown build, and the located refusals of grants.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const { compileContent, hashInputs } = E.contentCompile;
const { assembleContent, loadCompiled, resolveSpecies } = E.contentRuntime;

const SRC = path.resolve(__dirname, '../../content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const inputs = () => ({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') });
const dex = E.dex.createDexLookup();
const refused = (mutate, pathRe, msgRe) => {
  const i = inputs(); mutate(i); const r = compileContent(i);
  assert.equal(r.ok, false, 'must be refused');
  assert.ok(r.errors.some(e => e.file === 'grants.json' && pathRe.test(e.path) && msgRe.test(e.message)), JSON.stringify(r.errors));
};

test('the live sample compiles and assembles: 8 species, one grant, every reference resolved', () => {
  const r = compileContent(inputs());
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.data.species.length, 8); assert.deepEqual(r.data.grants.map(g => g.id), ['starter']);
  const { content, errors } = assembleContent(r.data, dex);
  assert.deepEqual(errors, []);
  assert.deepEqual(content.grants.starter, { id: 'starter', members: [{ species: 'Charmander', level: 5 }], items: { potion: 5, pokeball: 10, antidote: 2 }, money: 0 });
  assert.equal(content.speciesIds.charmander, 'Charmander');
  assert.equal(resolveSpecies(content, 'pidgey'), 'Pidgey'); assert.equal(resolveSpecies(content, 'Pidgey'), 'Pidgey'); assert.equal(resolveSpecies(content, 'mew'), null);
});

test('creation data comes from the pinned Showdown build: natural abilities, gender rule out of 256, move id and PP', () => {
  const { content } = assembleContent(compileContent(inputs()).data, dex);
  const sp = content.species;
  assert.deepEqual([sp.Charmander.abilities, sp.Charmander.gender], [['Blaze', null], 32]); // 7/8 male = female chance 32 (WP19 3.2)
  assert.deepEqual([sp.Pidgey.abilities, sp.Pidgey.gender], [['Keen Eye', 'Tangled Feet'], 128]);
  assert.deepEqual([sp.Caterpie.abilities, sp.Caterpie.gender], [['Shield Dust', null], 128]);
  assert.equal(dex.species('voltorb').gender, 'N'); assert.equal(dex.species('chansey').gender, 'F'); assert.equal(dex.species('tauros').gender, 'M');
  // every ratio of the WP19 3.2 table, including the two where "out of 255" would round differently (191, 223)
  assert.deepEqual(['bulbasaur', 'growlithe', 'pidgey', 'clefairy', 'pyroar'].map(id => dex.species(id).gender), [32, 64, 128, 192, 224]);
  assert.deepEqual(content.moves.Scratch, { id: 'scratch', name: 'Scratch', pp: 35 });
  assert.deepEqual(content.moves['Sand Attack'], { id: 'sandattack', name: 'Sand Attack', pp: 15 });
  assert.equal(content.moves.Rest.pp, 10, 'Gen 8 data (the battle format), not the newest generation (Rest has 5 PP there)');
  for (const s of Object.values(sp)) for (const names of Object.values(s.learnset)) for (const n of names) assert.ok(content.moves[n], n + ' has creation data');
});

test('learnsets are legal moves; where the pinned build has Gen 8 level-up data the levels agree with it', () => {
  const species = compileContent(inputs()).data.species;
  for (const s of species.filter(x => ['charmander', 'caterpie', 'snorlax', 'gengar'].includes(x.id))) {
    const theirs = dex.levelUpMoves(s.showdownId);
    for (const e of s.learnset) assert.ok((theirs[e.move] || []).includes(e.level), `${s.id} ${e.move} at ${e.level}`);
  }
  // Pidgey is not in the Gen 8 data at all: its entries are author values (recorded as framework-only in the inventory)
  assert.deepEqual(dex.levelUpMoves('pidgey'), {});
  for (const e of species.find(x => x.id === 'pidgey').learnset) assert.ok(dex.move(e.move), e.move);
});

test('grants.json refusals are located', () => {
  refused(i => { i.grants[0].members[0].species = 'mew'; }, /^\[0\]\.members\[0\]\.species$/, /not a species id/);
  refused(i => { i.grants[0].members[0].level = 0; }, /^\[0\]\.members\[0\]$/, /level: 1\.\.100/);
  refused(i => { i.grants[0].items.rarecandy = 1; }, /^\[0\]\.items\.rarecandy$/, /not a bag item/);
  refused(i => { i.grants[0].items.potion = Number.MAX_SAFE_INTEGER + 1; }, /^\[0\]\.items\.potion$/, /safe/);
  refused(i => { i.grants[0].money = 1000000; }, /^\[0\]\.money$/, /0 to 999999/);
  refused(i => { i.grants[0].id = 'thirteenchars'; }, /^\[0\]\.id$/, /1-12 characters/);
  refused(i => { i.grants.push({ ...i.grants[0] }); }, /^\[1\]\.id$/, /duplicate grant id/);
  refused(i => { i.grants[0].members = []; i.grants[0].items = {}; }, /^\[0\]$/, /must give something/);
  refused(i => { i.grants[0].source = 'nowhere'; }, /^\[0\]\.source$/, /must name an entry/);
  refused(i => { i.grants[0].extra = 1; }, /^\[0\]\.extra$/, /unknown field/);
  refused(i => { i.grants[0].members = Array(7).fill({ species: 'pidgey', level: 3 }); }, /^\[0\]\.members$/, /at most 6/);
});

test('content without grants.json keeps its old input hash; compiled documents from before step 4 still load', () => {
  const i = inputs(); delete i.grants;
  const r = compileContent(i);
  assert.ok(r.ok); assert.equal(r.data.grants, undefined);
  assert.equal(hashInputs(i), hashInputs({ ...i, grants: undefined }));
  const old = loadCompiled(JSON.parse(JSON.stringify(r.data)));
  assert.deepEqual(assembleContent(old, dex).content.grants, {});
  assert.throws(() => loadCompiled({ ...r.data, grants: 'x' }), /not a schema 1 document/);
});
