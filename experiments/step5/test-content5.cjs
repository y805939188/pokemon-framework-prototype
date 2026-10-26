'use strict';
// Step 5.0 / D5-2, content: the pre-use gate of the source registry (roadmap DETAILED-PLAN §280: the terms of a source
// are checked BEFORE its data is used) and the import subset of author-provided PBS species data (WP04 §4.2 reading
// rules, WP03 §4.3 defaults, §5.3 named EV pairs; r8 FR-000396, FR-000402, FR-000406). The PBS texts here are written
// for the test (invented numbers), not copied from any data set.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const E = require('../../js/engine/build/engine.cjs');
const { compileContent } = E.contentCompile;
const { importPbsSpecies } = E.pbsImport;

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const inputs = () => ({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') });
const CHECK = { checkedOn: '2026-10-21', checkedBy: 'test', conditions: 'test data written for this test', decision: 'use-allowed' };
const authorData = (usageCheck) => ({ id: 'author-pbs', kind: 'author-data', description: 'the author\'s own PBS files', license: 'the author\'s own data', ref: 'test', status: 'confirmed', usedFor: ['species'], ...(usageCheck ? { usageCheck } : {}) });
const errorsOf = i => { const r = compileContent(i); assert.equal(r.ok, false); return r.errors; };

test('pre-use gate: a record may only use a source whose terms were checked first; an explicit author placeholder is exempt', () => {
  const sample = inputs();
  assert.equal(compileContent(sample).ok, true, 'the sample uses only the placeholder source');
  const showdown = sample.sources.find(s => s.id === 'showdown');
  assert.deepEqual([showdown.usageCheck.decision, showdown.usageCheck.checkedOn], ['internal-use', '2026-10-21'], 'the Showdown data in use has its check recorded');
  const unchecked = inputs(); unchecked.sources.push(authorData(null)); unchecked.species[0].source = 'author-pbs';
  const e1 = errorsOf(unchecked).find(e => e.path === '[0].source');
  assert.match(e1.message, /source "author-pbs" has no recorded pre-use check \(usageCheck\): its data may not be used yet/);
  const refused = inputs(); refused.sources.push(authorData({ ...CHECK, decision: 'not-allowed', conditions: 'no permission' })); refused.grants[0].source = 'author-pbs';
  assert.match(errorsOf(refused).find(e => e.file === 'grants.json').message, /was checked and may not be used \(no permission\)/);
  const checked = inputs(); checked.sources.push(authorData(CHECK)); checked.species[0].source = 'author-pbs';
  assert.equal(compileContent(checked).ok, true);
  const listedOnly = inputs(); listedOnly.sources.push(authorData(null));
  assert.equal(compileContent(listedOnly).ok, true, 'a registered, still unchecked source may be listed; it just cannot be used');
  const deniedPlaceholder = inputs(); deniedPlaceholder.sources.find(s => s.id === 'author-placeholder').usageCheck = { ...CHECK, decision: 'not-allowed' };
  assert.ok(errorsOf(deniedPlaceholder).some(e => e.file === 'species.json' && /was checked and may not be used/.test(e.message)), 'the author-placeholder label cannot override an explicit denial');
});

test('pre-use gate: a malformed check record is located; the registry keeps its other rules', () => {
  const bad = (u, pathRe, msgRe) => { const i = inputs(); i.sources.push(authorData(u)); assert.ok(errorsOf(i).some(e => e.file === 'sources.json' && pathRe.test(e.path) && msgRe.test(e.message)), JSON.stringify(errorsOf(i))); };
  bad({ ...CHECK, checkedOn: '21.10.2026' }, /usageCheck\.checkedOn$/, /YYYY-MM-DD/);
  bad({ ...CHECK, decision: 'probably' }, /usageCheck\.decision$/, /use-allowed\|internal-use\|not-allowed/);
  bad({ ...CHECK, conditions: '' }, /usageCheck\.conditions$/, /non-empty/);
  bad({ ...CHECK, extra: 1 }, /usageCheck\.extra$/, /unknown field/);
  bad('yes', /usageCheck$/, /checkedOn, checkedBy, conditions, decision/);
});

const PBS = `# author test data (invented numbers)
[RATTATA]
Name = Rattata
Types = NORMAL
BaseStats = 1,2,3,4,5,6
GrowthRate = Medium
BaseExp = 51
EVs = SPEED,1
CatchRate = 200 # trailing comment
Moves = 1,TACKLE,4,TAILWHIP,7,QUICKATTACK
Evolutions = RATICATE,Level,20
WildItemCommon = CHILANBERRY
Happiness = 70
SomethingNew = 3
[SPEAROW]
GrowthRate = Fast
GrowthRate = Medium
BaseExp = 52
EVs = SPEED,1,ATTACK,1
Moves = 1,PECK,1,GROWL
[RATICATE]
GrowthRate = Medium
BaseExp = 145
EVs = SPEED,2
Moves = 1,TACKLE
`;

test('PBS import: framework fields carried over; battle data, later fields and unknown keys reported per record', () => {
  const r = importPbsSpecies(PBS, 'author-pbs');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.species.map(s => [s.id, s.showdownId, s.growth, s.baseExp, s.evYield, s.catchRate, s.learnset.length, s.source, s.nameKey]), [
    ['rattata', 'rattata', 'medium', 51, { spe: 1 }, 200, 3, 'author-pbs', 'species.rattata'],
    ['spearow', 'spearow', 'medium', 52, { spe: 1, atk: 1 }, 255, 2, 'author-pbs', 'species.spearow'],
    ['raticate', 'raticate', 'medium', 145, { spe: 2 }, 255, 1, 'author-pbs', 'species.raticate'],
  ]);
  const [rat, spe] = r.records;
  assert.deepEqual(rat.showdown, ['Name', 'BaseStats'], 'Showdown still provides names and base stats');
  assert.deepEqual(r.species[0].types, ['normal'], 'explicit author types are imported and validated against the pinned directory');
  assert.deepEqual(r.species[0].evolutions, [{ target: 'raticate', method: 'Level', parameter: 20 }], 'step 5.3 consumes ordered typed evolution entries');
  assert.deepEqual(rat.later.map(x => x.field), ['WildItemCommon']);
  assert.match(rat.later[0].batch, /5\.5/);
  assert.deepEqual(rat.ignored, ['SomethingNew'], 'outside the schema: not consumed, no error (WP04 §4.2)');
  assert.deepEqual(spe.overridden, ['GrowthRate'], 'a repeated property: the later value wins (WP04 §4.2)');
  assert.deepEqual(spe.defaults, ['CatchRate = 255 (WP03 §4.3 class default)']);
  assert.equal(r.species[0].learnset[2].move, 'quickattack');
});

test('PBS import: the imported records compile with the content (checked source) and assemble against the pinned Showdown data', () => {
  const r = importPbsSpecies(PBS, 'author-pbs');
  const i = inputs(); i.sources.push(authorData(CHECK)); i.species.push(...r.species);
  const c = compileContent(i); assert.equal(c.ok, true, JSON.stringify(c.errors));
  const a = E.contentRuntime.assembleContent(c.data, E.dex.createDexLookup());
  assert.deepEqual(a.errors, []);
  assert.deepEqual(E.speciesKey.keyOfBattleName(a.content, 'Rattata'), { species: 'rattata', form: 0 });
  const unchecked = inputs(); unchecked.sources.push(authorData(null)); unchecked.species.push(...r.species);
  assert.ok(errorsOf(unchecked).some(e => /author-pbs" has no recorded pre-use check/.test(e.message)), 'without the check the import cannot be used');
});

test('PBS import: reading errors are located by line (WP04 §4.2) and a bad record is not produced', () => {
  const lines = (text) => importPbsSpecies(text, 'x');
  const one = (text, lineNo, msgRe) => { const r = lines(text); assert.equal(r.ok, false); assert.ok(r.errors.some(e => e.line === lineNo && msgRe.test(e.message)), JSON.stringify(r.errors)); return r; };
  one('BaseExp = 5\n[A]\n', 1, /missing initial section/);
  one('[RATTATA]\n # indented comment\nGrowthRate = Medium\n', 2, /indented comment is not a comment/);
  one('[RATTATA]\nGrowthRate = Medium\n[RATTATA]\n', 3, /used twice/);
  one('[RATTATA]\nName = "Rat"\n', 2, /quoted values are outside this import subset/);
  one('[RATTATA]\nnot a property\n', 2, /invalid property syntax/);
  const missing = one('[RATTATA]\nCatchRate = 3\n', 1, /^missing: /);
  assert.deepEqual(missing.species, [], 'nothing is produced for an incomplete record');
  assert.deepEqual(missing.errors.map(e => e.path).sort(), ['[RATTATA].BaseExp', '[RATTATA].EVs', '[RATTATA].GrowthRate', '[RATTATA].Moves'].sort());
  one('[RATTATA]\nGrowthRate = Turbo\nBaseExp = 5\nEVs = SPEED,1\nMoves = 1,TACKLE\n', 2, /"Turbo" is not a growth rate/);
  one('[RATTATA]\nGrowthRate = Fast\nBaseExp = 5\nEVs = SPEED\nMoves = 1,TACKLE\n', 4, /pairs of STAT,amount/);
  one('[RATTATA]\nGrowthRate = Fast\nBaseExp = 5\nEVs = LUCK,1\nMoves = 1,TACKLE\n', 4, /must be a stat/);
  one('[RATTATA]\nGrowthRate = Fast\nBaseExp = 5\nEVs = SPEED,1\nMoves = 101,TACKLE\n', 5, /level 0\.\.100/);
  const evolutionMove = lines('[RATTATA]\nGrowthRate = Fast\nBaseExp = 5\nEVs = SPEED,1\nMoves = 0,TACKLE\n');
  assert.equal(evolutionMove.ok, true); assert.deepEqual(evolutionMove.species[0].learnset, [{ level: 0, move: 'tackle' }]);
  one('[RATTATA]\nGrowthRate = Fast\nBaseExp = 5\nEVs = SPEED,1\nCatchRate = 300\nMoves = 1,TACKLE\n', 5, /0 to 255/);
  const ok = lines('#c\n\n[RATTATA]\nGrowthRate = Fast\nBaseExp = 5\nEVs = SPEED,1\nMoves = 1,TACKLE\n');
  assert.equal(ok.ok, true, 'a first-column comment and a blank line are skipped');
});

test('PBS import CLI: refused without a checked source (nothing written); with one it writes the report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pbs-'));
  try {
    for (const f of ['manifest.json', 'species.json', 'overlays.json', 'grants.json']) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    const sources = read('sources.json');
    fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify([...sources, authorData(null)]));
    // This temporary src supplies source/config context for a standalone proposal, with no unrelated starter grant.
    fs.writeFileSync(path.join(dir, 'grants.json'), '[]');
    fs.writeFileSync(path.join(dir, 'pokemon.txt'), PBS);
    const cli = (src) => spawnSync(process.execPath, [path.join(ROOT, 'js/engine/build/content-cli.cjs'), 'import-pbs', `--src=${src}`, `--file=${path.join(dir, 'pokemon.txt')}`, '--source=author-pbs', `--report=${path.join(dir, 'out.json')}`], { encoding: 'utf8' });
    const refused = cli(dir);
    assert.equal(refused.status, 1); assert.match(refused.stderr, /no recorded pre-use check/); assert.equal(fs.existsSync(path.join(dir, 'out.json')), false);
    fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify([...sources, authorData(CHECK)]));
    const done = cli(dir);
    assert.equal(done.status, 0, done.stderr);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'));
    assert.deepEqual([out.ok, out.species.length, out.records.length, out.source], [true, 3, 3, 'author-pbs']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('FR-000388/389 rule configuration (WP02 subset): Gen 8 defaults, validated overrides through settings.json, the capacities they give', () => {
  const C = E.config;
  const cfg=C.resolveConfig();assert.deepEqual(Object.fromEntries(["MECHANICS_GENERATION","MAX_MONEY","MAX_PARTY_SIZE","NUM_STORAGE_BOXES","BAG_MAX_PER_SLOT"].map(k=>[k,cfg[k]])), { MECHANICS_GENERATION: 8, MAX_MONEY: 999999, MAX_PARTY_SIZE: 6, NUM_STORAGE_BOXES: 40, BAG_MAX_PER_SLOT: 999 });
  assert.deepEqual(C.limitsOf(C.resolveConfig()), E.limits.DEFAULT_LIMITS, 'the defaults give the step 4 capacities (40 x 30 boxes)');
  assert.deepEqual(C.limitsOf(C.resolveConfig({ NUM_STORAGE_BOXES: 40, MAX_PARTY_SIZE: 3 })), { party: 3, boxes: 1200, bagPerItem: 999, money: 999999 });
  const has = (o, pathRe, msgRe) => assert.ok(C.checkOverrides(o).some(p => pathRe.test(p.path) && msgRe.test(p.message)), JSON.stringify(C.checkOverrides(o)));
  has({ MECHANICS_GENERATION: 7 }, /MECHANICS_GENERATION/, /generation 8 only/);
  has({ NUM_STORAGE_BOXES: 2 }, /NUM_STORAGE_BOXES/, /supports NUM_STORAGE_BOXES=40 only/);
  has({ MAX_PARTY_SIZE: 7 }, /MAX_PARTY_SIZE/, /1 to 6/);
  has({ MAX_MONEY: -1 }, /MAX_MONEY/, /integer from 0/);
  has({ BAG_MAX_PER_SLOT: 1.5 }, /BAG_MAX_PER_SLOT/, /integer/);
  has({ SHINY_POKEMON_CHANCE: 16 }, /SHINY_POKEMON_CHANCE/, /unknown or unsupported setting/);
  has([], /^\$$/, /object/);
  assert.throws(() => C.resolveConfig({ MAX_PARTY_SIZE: 0 }), /rule configuration: \$\.MAX_PARTY_SIZE/);
  // through the content pipeline: located in settings.json, carried to the assembled content, hash unchanged without it
  const base = inputs();
  const withSettings = { ...inputs(), settings: { NUM_STORAGE_BOXES: 40 } };
  const c = compileContent(withSettings); assert.equal(c.ok, true, JSON.stringify(c.errors));
  assert.deepEqual(c.data.settings, { NUM_STORAGE_BOXES: 40 });
  assert.notEqual(c.data.inputsHash, compileContent(base).data.inputsHash);
  assert.equal(compileContent(base).data.settings, undefined);
  assert.deepEqual(E.contentRuntime.assembleContent(c.data, E.dex.createDexLookup()).content.settings, { NUM_STORAGE_BOXES: 40 });
  const bad = compileContent({ ...inputs(), settings: { MAX_PARTY_SIZE: 9 } });
  assert.equal(bad.ok, false); assert.deepEqual([bad.errors[0].file, bad.errors[0].path], ['settings.json', '$.MAX_PARTY_SIZE']);
});

// ---- review of 1960b92 (2026-10-22): F04 section ids, F05 one pre-use gate (CLI, compiler, Showdown), F06 own keys
const REC = 'GrowthRate = Medium\nBaseExp = 50\nEVs = SPEED,1\nMoves = 1,TACKLE\n';

test('F04: a form section or a section id that is not a symbol is refused at its line, never read as another species', () => {
  for (const [section, re] of [['PORYGON,2', /form section.*explicit formFiles bundle group.*not imported/], ['PIKA!CHU', /is not a symbol/], ['1ABC', /is not a symbol/], ['RAT TATA', /is not a symbol/]]) {
    const r = importPbsSpecies(`[${section}]\n${REC}[RATTATA]\n${REC}`, 'x');
    assert.equal(r.ok, false, section);
    assert.ok(r.errors.some(e => e.line === 1 && re.test(e.message)), `${section}: ${JSON.stringify(r.errors)}`);
    assert.deepEqual(r.species.map(s => s.id), ['rattata'], `${section}: nothing invented; the next valid section is still read`);
    assert.equal(r.errors.length, 1, `${section}: the refused section's own lines are skipped with it`);
  }
  const mime = importPbsSpecies(`[MR_MIME]\n${REC}`, 'x');
  assert.deepEqual(mime.species.map(s => [s.id, s.showdownId]), [['mr-mime', 'mrmime']], 'an underscore is part of a symbol: a hyphen in the content id, dropped in the Showdown id');
});

test('F05: the CLI applies the full registry validation before it reads the PBS file: an incomplete check (decision only) refuses, nothing is read or written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pbs-f05-'));
  try {
    for (const f of ['manifest.json', 'species.json', 'overlays.json', 'grants.json']) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    const cli = (file) => spawnSync(process.execPath, [path.join(ROOT, 'js/engine/build/content-cli.cjs'), 'import-pbs', `--src=${dir}`, `--file=${file}`, '--source=author-pbs', `--report=${path.join(dir, 'out.json')}`], { encoding: 'utf8' });
    const missingFile = path.join(dir, 'does-not-exist.txt');
    for (const [usageCheck, re] of [[{ decision: 'use-allowed' }, /usageCheck\.checkedOn.*YYYY-MM-DD/s], [{ ...CHECK, checkedBy: '' }, /usageCheck\.checkedBy/], [{ ...CHECK, conditions: undefined }, /usageCheck\.conditions/]]) {
      fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify([...read('sources.json'), authorData(JSON.parse(JSON.stringify(usageCheck)))]));
      const r = cli(missingFile);
      assert.equal(r.status, 1); assert.match(r.stderr, re); assert.match(r.stderr, /sources\.json author-pbs:.*incomplete pre-use check/);
      assert.doesNotMatch(r.stderr, /cannot read/, 'refused before the PBS file is even opened');
      assert.equal(fs.existsSync(path.join(dir, 'out.json')), false, 'no report');
    }
    fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify([...read('sources.json'), authorData({ ...CHECK, decision: 'not-allowed' })]));
    const denied = cli(missingFile);
    assert.equal(denied.status, 1); assert.match(denied.stderr, /was checked and may not be used/);
    fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify([...read('sources.json'), { ...authorData({ ...CHECK, decision: 'not-allowed' }), kind: 'author-placeholder', status: 'placeholder' }]));
    const deniedPlaceholder = cli(missingFile);
    assert.equal(deniedPlaceholder.status, 1); assert.match(deniedPlaceholder.stderr, /was checked and may not be used/);
    assert.doesNotMatch(deniedPlaceholder.stderr, /cannot read/, 'an explicit denial applies even to a placeholder, before opening PBS');
    assert.equal(fs.existsSync(path.join(dir, 'out.json')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F05: the Showdown data the content is read against passes the same gate (missing entry, missing or incomplete check, not-allowed): compiler and assembly refuse', () => {
  const variants = [
    ['no showdown entry', i => { i.sources = i.sources.filter(s => s.kind !== 'showdown'); }, /registers no source of kind "showdown"/],
    ['no check', i => { delete i.sources.find(s => s.kind === 'showdown').usageCheck; }, /source "showdown" has no recorded pre-use check/],
    ['not-allowed', i => { i.sources.find(s => s.kind === 'showdown').usageCheck = { ...CHECK, decision: 'not-allowed', conditions: 'denied for the test' }; }, /may not be used \(denied for the test\)/],
    ['two allowed dependencies', i => { i.sources.push({ ...i.sources.find(s => s.kind === 'showdown'), id: 'other-showdown', usageCheck: CHECK }); }, /Showdown source is ambiguous/],
    ['allowed entry alongside denied dependency', i => { i.sources.find(s => s.kind === 'showdown').usageCheck.decision = 'not-allowed'; i.sources.push({ ...i.sources.find(s => s.kind === 'showdown'), id: 'other-showdown', usageCheck: CHECK }); }, /Showdown source is ambiguous/],
  ];
  for (const [label, mutate, re] of variants) {
    const i = inputs(); mutate(i);
    const r = compileContent(i);
    assert.equal(r.ok, false, label);
    assert.ok(r.errors.some(e => e.file === 'sources.json' && e.path === '$' && re.test(e.message)), `${label}: ${JSON.stringify(r.errors)}`);
  }
  const incomplete = inputs(); incomplete.sources.find(s => s.kind === 'showdown').usageCheck = { decision: 'internal-use' };
  assert.equal(compileContent(incomplete).ok, false, 'an incomplete check record is refused (located in sources.json)');
  // the placeholder exemption covers the records' own numbers, not the Showdown data under them
  assert.ok(inputs().species.every(s => s.source === 'author-placeholder'));
  // a compiled document edited (or produced) without the check is refused where the data is used
  const ok = compileContent(inputs()); assert.equal(ok.ok, true);
  const edited = JSON.parse(JSON.stringify(ok.data)); edited.sources.find(s => s.kind === 'showdown').usageCheck.decision = 'not-allowed';
  const a = E.contentRuntime.assembleContent(edited, E.dex.createDexLookup());
  assert.deepEqual([a.errors[0].file, a.errors[0].path, Object.keys(a.content.species).length], ['assembly', 'sources', 0]);
  assert.match(a.errors[0].message, /may not be used/);
});

test('F06: setting names and PBS enumerations are own keys only: "constructor", "toString", "__proto__" get located errors, never a crash or a lost field', () => {
  for (const key of ['constructor', 'toString', '__proto__']) {
    const problems = E.config.checkOverrides(JSON.parse(`{"${key}": 1}`));
    assert.deepEqual(problems.map(p => p.path), [`$.${key}`], key); assert.match(problems[0].message, /unknown or unsupported setting/);
    const c = compileContent({ ...inputs(), settings: JSON.parse(`{"${key}": 1}`) });
    assert.equal(c.ok, false); assert.deepEqual([c.errors[0].file, c.errors[0].path], ['settings.json', `$.${key}`]);
    const growth = importPbsSpecies('[RATTATA]\n' + REC.replace('Medium', key), 'x');
    assert.equal(growth.ok, false); assert.match(growth.errors[0].message, /is not a growth rate/);
    assert.equal(growth.errors[0].path, '[RATTATA].GrowthRate');
    const stat = importPbsSpecies('[RATTATA]\n' + REC.replace('SPEED,1', `${key},1`), 'x');
    assert.equal(stat.ok, false); assert.match(stat.errors[0].message, /must be a stat/);
    assert.equal(stat.errors[0].path, '[RATTATA].EVs');
  }
  const later = importPbsSpecies('[RATTATA]\n' + REC + 'constructor = 3\ntoString = 4\n__proto__ = 5\n', 'x');
  assert.equal(later.ok, true); assert.deepEqual(later.records[0].later, []); assert.deepEqual(later.records[0].ignored, ['constructor', 'toString', '__proto__'], 'unknown keys, not later-batch fields');
  // every produced record survives serialization complete and compiles
  const roundTrip = JSON.parse(JSON.stringify(importPbsSpecies(PBS, 'author-pbs').species));
  for (const sp of roundTrip) for (const f of ['id', 'showdownId', 'nameKey', 'growth', 'baseExp', 'evYield', 'catchRate', 'learnset', 'source']) assert.ok(sp[f] !== undefined, `${sp.id}.${f}`);
});

test('F06: a build that fails (also on such a setting) removes the previous output, so a stale file never passes for current', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-build-f06-'));
  try {
    fs.cpSync(SRC, path.join(dir, 'src'), { recursive: true });
    const out = path.join(dir, 'out/content.json');
    const run = () => spawnSync(process.execPath, [path.join(ROOT, 'js/engine/build/content-cli.cjs'), 'build', `--src=${path.join(dir, 'src')}`, `--out=${out}`], { encoding: 'utf8' });
    assert.equal(run().status, 0); assert.ok(fs.existsSync(out));
    fs.writeFileSync(path.join(dir, 'src/settings.json'), '{"constructor": 1}');
    const failed = run();
    assert.equal(failed.status, 1); assert.match(failed.stderr, /settings\.json \$\.constructor/); assert.doesNotMatch(failed.stderr, /TypeError/);
    assert.equal(fs.existsSync(out), false, 'the old output was removed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F05: assembly validates the complete registry and every consumed source before any Dex call', () => {
  const TEST_SHA = 'a'.repeat(40);
  const compiled = compileContent(inputs(), {}, { showdownSha: TEST_SHA }); assert.equal(compiled.ok, true);
  assert.equal(compiled.data.schema, 3); assert.equal(compiled.data.showdownSha, TEST_SHA);
  const lookup = E.dex.createDexLookup();
  const counted = calls => Object.fromEntries(['sha', 'species', 'move', 'type', 'levelUpMoves', 'allAbilities', 'allMoves', 'abilityInfo', 'heldItem'].map(k => [k, (...args) => { calls.push(k); return k === 'sha' ? TEST_SHA : lookup[k](...args); }]));
  const validCalls = [];
  assert.deepEqual(E.contentRuntime.assembleContent(compiled.data, counted(validCalls)).errors, []);
  assert.ok(validCalls.includes('sha') && validCalls.includes('species'), 'the matching compiled identity passes the source gate and actually queries the dependency');
  const variants = [
    ['malformed entry', d => { d.sources.push(null); }, 'sources.json', /must be an object/],
    ['missing description', d => { delete d.sources.find(s => s.kind === 'showdown').description; }, 'sources.json', /non-empty string/],
    ['invalid status', d => { d.sources.find(s => s.kind === 'showdown').status = 'allowed'; }, 'sources.json', /confirmed\|placeholder\|pending/],
    ['duplicate registration', d => { d.sources.push({ ...d.sources.find(s => s.kind === 'showdown') }); }, 'sources.json', /duplicate source id/],
    ['incomplete dependency check', d => { d.sources.find(s => s.kind === 'showdown').usageCheck = { decision: 'internal-use' }; }, 'sources.json', /YYYY-MM-DD/],
    ['missing dependency', d => { d.sources = d.sources.filter(s => s.kind !== 'showdown'); }, 'assembly', /registers no source/],
    ['denied dependency', d => { d.sources.find(s => s.kind === 'showdown').usageCheck.decision = 'not-allowed'; }, 'assembly', /may not be used/],
    ['ambiguous dependency', d => { d.sources.push({ ...d.sources.find(s => s.kind === 'showdown'), id: 'other-showdown', usageCheck: CHECK }); }, 'assembly', /Showdown source is ambiguous/],
    ['denied placeholder', d => { d.sources.find(s => s.id === 'author-placeholder').usageCheck = { ...CHECK, decision: 'not-allowed' }; }, 'assembly', /may not be used/],
    ['unknown species source', d => { d.species[0].source = 'not-registered'; }, 'assembly', /must name an entry/],
    ['unchecked species source', d => { d.sources.push(authorData(null)); d.species[0].source = 'author-pbs'; }, 'assembly', /no recorded pre-use check/],
    ['denied grant source', d => { d.sources.push(authorData({ ...CHECK, decision: 'not-allowed' })); d.grants[0].source = 'author-pbs'; }, 'assembly', /may not be used/],
  ];
  for (const [label, mutate, file, re] of variants) {
    const d = JSON.parse(JSON.stringify(compiled.data)); mutate(d);
    const calls = [];
    const result = E.contentRuntime.assembleContent(d, counted(calls));
    // Cache validation now diagnoses malformed registries/species sources before the assembly source gate.
    const cacheRejects = file === 'sources.json' || ['denied placeholder', 'unknown species source', 'unchecked species source'].includes(label);
    const actualFile = cacheRejects ? 'compiled' : file;
    assert.ok(result.errors.some(e => e.file === actualFile && re.test(e.message)), `${label}: ${JSON.stringify(result.errors)}`);
    if (file === 'sources.json') assert.ok(result.errors.some(e => /sources\.json \[\d+\]/.test(e.message)), `${label}: original registry location is retained`);
    assert.deepEqual(calls, [], `${label}: refuse before any dependency query`);
    assert.deepEqual(Object.keys(result.content.species), [], `${label}: no partial content`);
  }
});

test('F06: output write errors remove the previous build and report the failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-build-write-f06-'));
  try {
    const src = path.join(dir, 'src'), out = path.join(dir, 'content.json');
    fs.cpSync(SRC, src, { recursive: true });
    const cliArgs = [path.join(ROOT, 'js/engine/build/content-cli.cjs'), 'build', `--src=${src}`, `--out=${out}`];
    assert.equal(spawnSync(process.execPath, cliArgs, { encoding: 'utf8' }).status, 0);
    fs.writeFileSync(path.join(src, 'settings.json'), '{"MAX_MONEY":12345}');
    // Simulate a disk write failure only for the output, after the successful earlier build.
    const preload = path.join(dir, 'fail-output.cjs');
    fs.writeFileSync(preload, `const fs = require('node:fs'); const write = fs.writeFileSync; fs.writeFileSync = function(file, ...args) { if (file === ${JSON.stringify(out)}) throw Object.assign(new Error('injected output write failure'), { code: 'EIO' }); return write.call(this, file, ...args); };`);
    const failed = spawnSync(process.execPath, ['--require', preload, ...cliArgs], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /content build FAILED/);
    assert.match(failed.stderr, /injected output write failure/);
    assert.equal(fs.existsSync(out), false, 'the old output cannot stand in for this failed build');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
