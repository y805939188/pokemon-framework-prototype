'use strict';
// Ordinary Node-host input artifact. Compile and mount one private author file;
// do not pre-seed PSFlow's cache, switch factories, or enable developer mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sources = ['manifest', 'sources', 'species'];
const moves = ['cut', 'rocksmash', 'surf', 'flash', 'sweetscent'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
function ownDirectory(dir) {
  assert(path.isAbsolute(dir));
  const st = fs.lstatSync(dir);
  assert(st.isDirectory() && !st.isSymbolicLink() && fs.realpathSync(dir) === dir);
}
function ownFile(file, privateRole = false) {
  const st = fs.lstatSync(file);
  assert(st.isFile() && !st.isSymbolicLink() && fs.realpathSync(file) === file);
  if (privateRole) assert(st.uid === process.getuid() && st.nlink === 1 && (st.mode & 0o777) === 0o600);
  return fs.readFileSync(file);
}

function prepare(runtime, move) {
  const {root, E, files, parentBindingSHA256, identity} = runtime;
  const family = process.env.PF_FINAL_PRODUCTION_FAMILY;
  const roleMoves = new Map([
    ['field-presentation-terminal',['cut','flash','strength']],
    ['field-presentation-i18n',[...moves,'strength','fly','dig','teleport']],
    ['travel-presentation-initial',['cut','strength','dig','teleport']],
    ['travel-presentation-source-controls',['dig','teleport']],
  ]);
  const published=roleMoves.has(family);
  assert(published || ['e2-current-frontends','e2-party-surf-guards'].includes(family));
  assert((roleMoves.get(family)??moves).includes(move),'move not admitted by this test family');
  const scope = process.env.PF_E2_FRONT_ROOT;
  const run = process.env.PF_FINAL_PRODUCTION_RUN;
  const selector = process.env.PF_FINAL_PRODUCTION_SELECTOR;
  if (published) {
    const record = require('../../../../scripts/tests/final-production-inputs.json').families[family];
    assert(record.cases.includes(selector), 'unregistered presentation selector');
    assert.equal(process.env[record.selectorEnv], record.selectorValues[selector]);
    const caseRoot = path.join(run, selector);
    assert.equal(process.env[record.scopeEnv], caseRoot);
    assert.equal(path.dirname(scope), caseRoot, 'fixture belongs to this registered case');
    assert.match(path.basename(scope), /^fixture-[1-9][0-9]*$/);
    ownDirectory(caseRoot);
  } else {
    assert.equal(selector, process.env.PF_E2_FRONT_CASE);
    assert.match(selector, /^E2-[A-Z]+(?:-[A-Z]+)?$/);
    assert.equal(scope, path.join(run, selector));
  }
  assert.equal(path.dirname(run), path.join(root, 'build/headless-final-production'));
  assert(path.basename(run).startsWith(family + '-'));
  for (const dir of [root, path.dirname(run), run, scope]) ownDirectory(dir);

  const sourceHashes = {};
  const read = Object.fromEntries(sources.map(name => {
    const leaf = 'content/sample/' + name + '.json';
    const raw = ownFile(path.join(root, leaf));
    sourceHashes[leaf] = sha(raw);
    assert.equal(sourceHashes[leaf], files[leaf], 'author input must match the parent binding');
    return [name, JSON.parse(raw.toString("utf8"))];
  }));
  assert.equal(read.manifest.schema, 2);
  const species = read.species.filter(row => ['snorlax', 'pidgey'].includes(row.id))
    .map(row => ({...row, abilities: [row.id === 'snorlax' ? 'immunity' : 'keeneye'],
      hiddenAbilities: [], wildItemCommon: [], wildItemUncommon: [], wildItemRare: [],
      learnset: (row.id === 'snorlax' ? [move, 'tackle'] : ['tackle']).map(id => ({level: 1, move: id})),
      evolutions: []}));
  assert.deepEqual(species.map(row => row.id).sort(), ['pidgey', 'snorlax']);
  const slots = [{species: 'pidgey', weight: 1, minLevel: 5, maxLevel: 5}];
  const marker = 'e2-ordinary-' + move;
  const inputs = {manifest: {...read.manifest, id: marker, title: 'Ordinary E2 Node-host author control: ' + move},
    sources: read.sources, species, overlays: [], settings: {AFFECTION_EFFECTS: false},
    regionalDex: {source: 'author-placeholder', national: ['snorlax', 'pidgey'], regions: []},
    mapMetadata: {source: 'author-placeholder', maps: {
      5: {outdoor: ['teleport','fly'].includes(move), environment: 'grass', darkMap: move === 'flash'}, 6: {outdoor: true}, 7: {outdoor: true},
    }},
    ...(move==='fly'?{regionMaps:{source:'author-placeholder',regions:[{id:0,nameKey:'region.home',points:[{x:1,y:1,healingSpot:{mapId:6,x:1,y:2}}]}]}}:{}),
    encounters: {source: 'author-placeholder', tables: [{mapId: 5, version: 0, types: {
      Land: {stepChance: 1, slots}, RockSmash: {stepChance: 100, slots},
      ...(move === 'surf' ? {Water: {stepChance: 1, slots}} : {}),
    }}]},
  };
  const compiled = E.contentCompile.compileContent(inputs, {}, {showdownSha: identity.showdownSHA});
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const raw = json(compiled.data), compiledSHA256 = sha(raw);
  const checked = E.contentRuntime.loadCompiled(JSON.parse(raw.toString("utf8")));
  const inputsHash = E.contentCompile.hashInputs(inputs);
  assert.equal(checked.inputsHash, inputsHash);
  assert.equal(checked.showdownSha, identity.showdownSHA);
  assert.equal(checked.contentId, marker);
  const seedContent = E.contentRuntime.assembleContent(checked, E.dex.createDexLookup());
  assert.deepEqual(seedContent.errors, []);
  const contentIdentity = E.contentRuntime.validatedContentIdentity(seedContent.content);
  assert.equal(contentIdentity, checked.contentIdentity);
  assert.match(contentIdentity, /^[0-9a-f]{64}$/);

  const mount = fs.mkdtempSync(path.join(scope, 'e2-author-'));
  ownDirectory(mount);
  const dataDir = path.join(mount, 'data', 'framework');
  fs.mkdirSync(dataDir, {recursive: true, mode: 0o700});
  const compiledFile = path.join(dataDir, 'content.json');
  const inputFile = path.join(mount, 'AUTHOR-INPUTS.json'), inputBytes = json(inputs);
  const inputFileSHA256 = sha(inputBytes);
  fs.writeFileSync(compiledFile, raw, {flag: 'wx', mode: 0o600});
  fs.writeFileSync(inputFile, inputBytes, {flag: 'wx', mode: 0o600});

  // A normal host sees this relative data leaf, never the main project's sample
  // cache. The IIFE still owns the read, validation, assembly and freeze.
  let reads = 0, pulse = null;
  const entropyRows = [];
  const scopedFs = Object.freeze({readFileSync(file, encoding) {
    assert.equal(file, compiledFile, 'ordinary author mount has no fallback path');
    assert.equal(encoding, 'utf8');
    const before = ownFile(file, true);
    assert.equal(sha(before), compiledSHA256);
    reads++;
    return before.toString('utf8');
  }});
  const scopedCrypto = Object.freeze({randomFillSync(target) {
    assert(pulse && pulse.fills === 0, 'business entropy is issued only through the real Flow.random call');
    assert.equal(Object.prototype.toString.call(target), '[object Uint32Array]');
    assert.equal(target.length, 2);
    assert.strictEqual(Reflect.apply(crypto.randomFillSync, crypto, [target]), target);
    // Per-VM pulse for the formerly injected 99/0 decisions, not a new RNG
    // implementation or feature privilege. The production code still makes
    // the actual conversion, call order and affected domain observable.
    const word = move === 'surf' && pulse.bound === 100 ? 0xffffffff : 0;
    target[0] = target[1] = word;
    pulse.fills++;
    entropyRows.push({bound: pulse.bound, words: [target[0], target[1]]});
    return target;
  }});
  const evidence = {schema: 'e2-ordinary-compiled-input-v1', selector, role: path.basename(mount),
    marker, sourceHashes, inputsHash, inputFileSHA256, compiledSHA256, contentIdentity,
    showdown: checked.showdownSha, parentBindingSHA256};
  return {root: mount, fs: scopedFs, crypto: scopedCrypto, initialContent: seedContent.content,
    get reads() { return reads; }, evidence, entropyRows,
    install(G, flow, draws) {
      const HostDate = G.Date;
      G.Date = class E2AuthorVmDate extends HostDate { static now() { return 0; } };
      const original = flow.random;
      flow.random = function(bound) {
        assert(!pulse && Number.isSafeInteger(bound) && bound > 0);
        assert(entropyRows.length < 128, 'unexpected unbounded E2 entropy');
        const request = pulse = {bound, fills: 0};
        try {
          const value = Reflect.apply(original, this, [bound]);
          assert.equal(request.fills, 1, 'ordinary Flow must draw from the actual business entropy channel');
          assert.equal(value, move === 'surf' && bound === 100 ? 99 : 0);
          draws.push(bound);
          return value;
        } finally { pulse = null; }
      };
    },
    confirm(loaded, game) {
      assert.equal(reads, 1);
      assert.equal(sha(ownFile(inputFile, true)), inputFileSHA256);
      assert.notStrictEqual(loaded, seedContent.content, 'the IIFE loads and owns its own immutable snapshot');
      assert.equal(loaded.meta.id, marker);
      assert.equal(E.contentRuntime.validatedContentIdentity(loaded), contentIdentity);
      assert.equal(E.semantic.ownedImmutableFingerprint(loaded), E.semantic.semanticFingerprint(seedContent.content));
      assert.deepEqual(E.saveSchema.validateGameContent(game, loaded), []);
      fs.writeFileSync(path.join(mount, 'CONSUMED.json'), json({...evidence, actualCompiledReadCount: reads}),
        {flag: 'wx', mode: 0o600});
    },
  };
}
module.exports = {prepare};
