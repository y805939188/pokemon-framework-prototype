'use strict';
// The seven independent M findings, with end-to-end content and real-session controls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const E = require('../../../js/engine/build/engine.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const auto = { mode: 1, naming: 1 };

if (process.argv[2] === '--cold-held') {
  const game = E.fixtures.makeGame(), template = clone(game.party[0]);
  template.id = 'NEW'; template.item = 'leftovers';
  const raw = { protocol: 1, battleId: 'cold-held', outcome: { kind: 'caught', winner: null }, members: {}, captured: [E.state.protocolMember(template)], bag: {}, dex: { seen: [], owned: [] } };
  const state = E.fakes.createMemoryState(game); let loads = 0;
  const app = new E.app.GameApplication({ state, sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(), content: () => { loads++; throw Error('unexpected content load'); } });
  let expected = /held-item-source-disabled/;
  if (process.argv[3]) {
    const src = path.resolve(__dirname, '../../../content/sample');
    const read = n => JSON.parse(fs.readFileSync(path.join(src, n + '.json'), 'utf8'));
    const built = E.contentCompile.compileContent({ manifest: read('manifest'), sources: read('sources'), species: [], overlays: [], grants: [] });
    const compiled = built.data, mode = process.argv[3], sd = compiled.sources.find(s => s.kind === 'showdown');
    if (mode === 'denied') sd.usageCheck.decision = 'not-allowed';
    if (mode === 'missing') delete sd.usageCheck;
    if (mode === 'unregistered') compiled.sources = compiled.sources.filter(s => s !== sd);
    if (mode === 'malformed') sd.usageCheck = { decision: 'internal-use' };
    const dex = E.dex.createDexLookup(), assembled = E.contentRuntime.assembleContent(compiled, dex);
    const controlled = new E.app.GameApplication({ state, sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(), content: () => ({ content: assembled.content, dex }) }, { capabilities: { allowHeldItemSources: true } });
    assert.throws(() => controlled.commitResult(raw, { templates: { NEW: template }, profile: auto }), /held-item-source-unchecked/);
  } else assert.throws(() => app.commitResult(raw, { templates: { NEW: template }, profile: auto }), expected);
  assert.equal(loads, 0); assert.equal(state.replaced.length, 0);
  assert.equal(Object.keys(require.cache).filter(p => p.includes('/showdown/dist/data/')).length, 0);
} else {
  const SRC = path.resolve(__dirname, '../../../content/sample');
  const read = name => JSON.parse(fs.readFileSync(path.join(SRC, name + '.json'), 'utf8'));
  const base = read('species').find(s => s.id === 'snorlax');
  function assemble(species = read('species')) {
    const built = E.contentCompile.compileContent({ manifest: read('manifest'), sources: read('sources'), species: species.map(sp => ({ ...sp, nameKey: `species.${sp.id}.${sp.form ?? 0}` })), overlays: [], grants: [] });
    assert.equal(built.ok, true, JSON.stringify(built.errors));
    const result = E.contentRuntime.assembleContent(built.data, E.dex.createDexLookup());
    assert.deepEqual(result.errors, []); return result.content;
  }
  const content = assemble();
  const member = (id, c = content, species = 'Pidgey') => E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id, species, level: 5 }, c, () => 0), c);
  function setup(game = E.state.newGame({ party: [member('A')], bag: { masterball: 2 } }), options = {}, ports = {}) {
    const state = E.fakes.createMemoryState(game), sessions = E.fakes.createFakeSessions({});
    const app = new E.app.GameApplication({ state, sessions, projection: E.fakes.createRecordingProjection(), content: () => ({ content, dex: E.dex.createDexLookup() }), random: () => 0, clock: () => 1000, ...ports }, options);
    return { state, sessions, app };
  }
  function capture(id = 'NEW', item = 'leftovers') {
    const template = member(id); template.item = item;
    const raw = { protocol: 1, battleId: 'capture-' + id, outcome: { kind: 'caught', winner: null }, members: {}, captured: [E.state.protocolMember(E.speciesKey.toBattleMember(template, content))], bag: { masterball: -1 }, dex: { seen: ['Pidgey'], owned: ['Pidgey'] } };
    return { template, raw, options: { templates: { [id]: template }, profile: auto } };
  }
  const ref = (id, index = 0) => ({ id, position: { kind: 'party', index } });

  test('M01: full pipeline B-family aliases use rule identity, exact content form and ninth draw', () => {
    const c = assemble([{ ...base, id: 'letters', showdownId: 'unown' }, { ...base, id: 'letters', form: 27, showdownId: 'unownquestion' }]);
    const draws = [], values = [0, 0, 0, 0, 0, 0, 0, 0, 27];
    const m = E.memberFactory.createMember({ id: 'U', species: 'Unown', level: 5 }, c, n => { draws.push(n); return values.shift(); });
    assert.equal(m.form, 27); assert.equal(m.species, 'Unown-Question'); assert.deepEqual(draws, [65536, 65536, 32, 32, 32, 32, 32, 32, 28]);
    assert.deepEqual(E.speciesKey.memberKey(E.speciesKey.toPersistentMember(m, c)), { species: 'letters', form: 27 });
    let calls = 0;
    assert.equal(E.memberFactory.createMember({ id: 'Z', species: 'Unown', form: 0, level: 5 }, c, () => { calls++; return 0; }).form, 0); assert.equal(calls, 8);
    const missing = assemble([{ ...base, id: 'letters', showdownId: 'unown' }]); let count = 0;
    assert.throws(() => E.memberFactory.createMember({ id: 'X', species: 'Unown', level: 5 }, missing, () => ++count === 9 ? 27 : 0), /missing creation form/); assert.equal(count, 9);
    const impostor = assemble([{ ...base, id: 'unown', showdownId: 'pidgey' }]); calls = 0;
    assert.equal(E.memberFactory.createMember({ id: 'P', species: 'Pidgey', level: 5 }, impostor, () => { calls++; return 0; }).form, 0); assert.equal(calls, 8);
  });

  test('M02: public and pure capture consumption default refuse held sources without changing any state', () => {
    const x = setup(), { raw, options } = capture(), before = clone(x.state.current());
    assert.throws(() => x.app.commitResult(raw, { ...options, heldItemSource: { allowed: true, describe: () => ({ holdable: true }) } }), /held-item-source-disabled/); assert.equal(x.state.replaced.length, 0); assert.deepEqual(x.state.current(), before);
    assert.throws(() => E.state.applyBattleResult(before, raw, E.limits.DEFAULT_LIMITS, E.speciesKey.speciesKeyResolver(content), { ...options, content }), /held-item-source-disabled/); assert.deepEqual(x.state.current(), before);
  });
  test('M02: closed capture source rejects in a cold process before content or external data loads', () => {
    const r = spawnSync(process.execPath, [__filename, '--cold-held'], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  test('M02: enabled capture checks denied/missing/unregistered/malformed source in cold empty content', () => {
    for (const mode of ['denied', 'missing', 'unregistered', 'malformed']) {
      const r = spawnSync(process.execPath, [__filename, '--cold-held', mode], { encoding: 'utf8' }); assert.equal(r.status, 0, mode + '\n' + r.stdout + r.stderr);
    }
  });
  test('M02: explicit source capability permits checked held item, independently of battle capability', async () => {
    const x = setup(undefined, { capabilities: { allowHeldItemSources: true } }), { raw, options } = capture();
    assert.equal(x.app.commitResult(raw, options), 'applied'); assert.equal(x.state.current().party[1].item, 'leftovers');
    assert.equal(x.state.current().appliedBattles[raw.battleId].hash, E.state.resultHash(raw)); assert.equal(x.state.replaced.length, 1);
    await assert.rejects(x.app.startBattle({ battleId: 'held', kind: 'wild', seq: 1, foes: [{ species: 'pidgey', level: 3 }] }), /held-item-battle-disabled/);
    const core = setup(), source = { allowed: true, describe: id => id === 'leftovers' ? { holdable: true, mail: false } : null };
    assert.equal(E.state.applyBattleResult(core.state.current(), raw, E.limits.DEFAULT_LIMITS, E.speciesKey.speciesKeyResolver(content), { ...options, content, heldItemSource: source }).state.party[1].item, 'leftovers');
  });
  test('M02: controlled capture still rejects unknown/nonholdable/mail and unchecked external source before data', () => {
    for (const [item, descriptor, mail] of [['unknown', null, null], ['key', { holdable: false }, null], ['letter', { holdable: true, mail: true }, null], ['leftovers', { holdable: true }, 'letter']]) {
      const x = setup(undefined, { capabilities: { allowHeldItemSources: true }, describeHeldItem: () => descriptor }); const c = capture('NEW', item); c.template.mail = mail;
      const before = clone(x.state.current()); assert.throws(() => x.app.commitResult(c.raw, c.options), /invalid-held-item|mail-not-supported/); assert.equal(x.state.replaced.length, 0); assert.deepEqual(x.state.current(), before);
    }
    const c = capture(); let dataCalls = 0; const unchecked = clone(content); delete unchecked.meta.showdownSourceChecked;
    const x = setup(undefined, { capabilities: { allowHeldItemSources: true } }, { content: () => ({ content: unchecked, dex: { heldItem() { dataCalls++; throw Error('unexpected external data'); } } }) });
    assert.throws(() => x.app.commitResult(c.raw, c.options), /held-item-source-unchecked/); assert.equal(dataCalls, 0); assert.equal(x.state.replaced.length, 0);
  });
  test('M02: finish rejects anomalous raw held capture; pending resume revalidates held source', async () => {
    const x = setup(undefined, { receivingProfile: auto }); const request = { battleId: 'finish-held', kind: 'wild', seq: 1, foes: [{ species: 'pidgey', level: 3 }] };
    let ended; x.sessions.next = () => ended; const handle = await x.app.startBattle(request), foe = x.sessions.created[0].setup.foes[0]; const raw = capture(foe.id).raw; raw.battleId = request.battleId;
    ended = raw; const outcome = x.app.finishBattle(handle, request); assert.equal(outcome.aborted, true); assert.match(outcome.error, /held-item-source-disabled/); assert.equal(x.state.replaced.length, 0); assert.equal(x.app.saveBlocked, false);
    let allowed = true; const y = setup(undefined, { capabilities: { allowHeldItemSources: true }, describeHeldItem: () => allowed ? { holdable: true } : null }); const c = capture();
    assert.equal(y.app.commitResult(c.raw, { templates: c.options.templates }), 'pending'); const token = y.app.pendingReceiving.token; allowed = false;
    assert.throws(() => y.app.resolveReceiving(token, { NEW: { nickname: { kind: 'keep' } } }), /invalid-held-item/); assert.equal(y.state.replaced.length, 0); assert.equal(y.app.saveBlocked, true);
    allowed = true; assert.equal(y.app.resolveReceiving(token, {}).status, 'applied'); assert.equal(y.state.replaced.length, 1);
  });

  test('M04: every present legacy metadata field is checked before defaults, strings never become char lists', () => {
    const H = require('./legacy-test-support.cjs'); const baseRaw = H.legacyGame(E.state.newGame({ party: [member('A')] }), 4), opts = { content, speciesKey: E.speciesKey.speciesKeyResolver(content) };
    const bad = { personalID: null, owner: null, ownerCompatibilityDefault: null, origin: null, abilityIndex: '1', effectiveAbilityIndex: -1, shiny: null, superShiny: 0, firstMoves: 'cut', markings: null, ribbons: 'Champion', cannotStore: null, cannotRelease: 1, isEgg: 'false', mail: 1, readyToEvolve: null };
    for (const [field, value] of Object.entries(bad)) {
      const raw = clone(baseRaw); raw.party[0][field] = value; const before = JSON.stringify(raw), r = E.saveSchema.migrateGame(raw, opts);
      assert.equal(r.ok, false, field); assert.equal(r.error.code, 'invalid', field); assert.ok(r.error.problems.some(p => p.path.startsWith('$.party[0].' + field)), field); assert.equal(JSON.stringify(raw), before);
    }
    for (const schema of [1, 2, 3, 4]) {
      const raw = H.legacyGame(E.state.newGame({ party: [member('A')] }), schema); raw.party[0].ribbons = 'Champion'; assert.equal(E.saveSchema.migrateGame(raw, opts).ok, false, schema);
    }
    const raw = clone(baseRaw), trusted = member('A');
    for (const field of Object.keys(bad)) raw.party[0][field] = clone(trusted[field]); raw.party[0].shiny = false; raw.party[0].firstMoves = []; raw.party[0].ribbons = ['Champion']; raw.party[0].markings = [];
    const valid = E.saveSchema.migrateGame(raw, opts); assert.equal(valid.ok, true, JSON.stringify(valid));
    for (const field of Object.keys(bad)) assert.deepEqual(valid.state.party[0][field], raw.party[0][field], field);
    assert.equal(E.saveSchema.migrateGame(baseRaw, opts).ok, true, 'genuinely absent fields still default');
  });

  test('M04: malformed legacy metadata load/commit leaves all original slot files and hashes unchanged', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p51-malformed-'));
    try {
      const H = require('./legacy-test-support.cjs'), file = path.join(dir, 'slot1.json');
      const snapshot = () => Object.fromEntries(fs.readdirSync(dir).map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')]));
      for (const [field, value] of [['firstMoves', 'cut'], ['ribbons', 'Champion'], ['shiny', null], ['owner', null], ['markings', null], ['origin', null]]) {
        const raw = H.legacyGame(E.state.newGame({ party: [member('A')] }), 4); raw.party[0][field] = value;
        fs.writeFileSync(file, JSON.stringify(raw)); fs.writeFileSync(path.join(dir, 'slot2.json'), 'unrelated slot'); const before = snapshot();
        const store = new E.store.SaveStore(file, {}, E.speciesKey.speciesKeyResolver(content), content);
        assert.throws(() => store.load(), e => e.info.code === 'invalid'); assert.throws(() => store.commit({}), e => e.info.code === 'invalid'); assert.deepEqual(snapshot(), before, field);
      }
    } finally { fs.rmSync(dir, { recursive: true }); }
  });

  test('M03: legacy parties above p may reorder/return held members, while actual additions still refuse', () => {
    for (const [p, size] of [[1, 3], [3, 5]]) {
      const game = E.state.newGame({ party: Array.from({ length: size }, (_, i) => member('P' + i)) }); E.storage.placeInBox(game.storage, member('BOX'));
      const x = setup(game, { limits: { ...E.limits.DEFAULT_LIMITS, party: p } }), token = x.app.beginManagement();
      assert.equal(x.app.manage(token, 'reorder', { kind: 'move', source: ref('P0'), target: { kind: 'party', index: size }, expectedTargetId: null }).status, 'applied');
      assert.deepEqual(x.state.current().party.map(m => m.id), [...game.party.slice(1).map(m => m.id), 'P0']); assert.equal(x.state.replaced.length, 1);
      assert.equal(x.app.manage(token, 'pick', { kind: 'pick-up', source: ref('P1') }).status, 'held');
      assert.equal(x.app.manage(token, 'swap', { kind: 'place-held', target: { kind: 'party', index: 0 }, expectedTargetId: 'P2' }).status, 'held');
      assert.equal(x.app.manage(token, 'return', { kind: 'withdraw-held' }).status, 'applied'); assert.equal(x.state.current().party.length, size); assert.equal(x.state.replaced.length, 2);
      const before = clone(x.state.current()); assert.equal(x.app.manage(token, 'add', { kind: 'move', source: { id: 'BOX', position: { kind: 'box', box: 0, slot: 0 } }, target: { kind: 'party', index: size }, expectedTargetId: null }).reason, 'party-full'); assert.deepEqual(x.state.current(), before);
    }
  });

  test('M06: full pipeline form Happiness inherits omitted base, explicit 0/256 survives every record order', () => {
    for (const initial of [undefined, 256]) for (const override of [undefined, 0, 256]) for (const reversed of [false, true]) {
      const records = [{ ...base, id: 'cloak', showdownId: 'burmy', ...(initial !== undefined ? { happiness: initial } : {}) }, { ...base, id: 'cloak', form: 1, showdownId: 'burmysandy', ...(override !== undefined ? { happiness: override } : {}) }];
      const c = assemble(reversed ? records.reverse() : records); const m = E.memberFactory.createMember({ id: 'B', species: 'Burmy', form: 1, level: 5 }, c, () => 0);
      assert.equal(m.friendship, override ?? initial ?? 70, JSON.stringify({ initial, override, reversed }));
      assert.equal(E.memberFactory.createMember({ id: 'D', species: 'Burmy-Sandy', level: 5 }, c, () => 0).friendship, override ?? initial ?? 70);
    }
  });

  test('N01: cancel held survives failing state/content ports, preserves independent edits and writes nothing', () => {
    let failContent = false, failState = false; const state = E.fakes.createMemoryState(E.state.newGame({ party: [member('A'), member('B')] }));
    const x = setup(undefined, {}, { state: { read() { if (failState) throw Error('state failure'); return state.current(); }, replace(next) { state.replace(next); } }, content: () => { if (failContent) throw Error('content failure'); return { content }; } });
    const token = x.app.beginManagement(); assert.equal(x.app.manage(token, 'pick', { kind: 'pick-up', source: ref('A') }).status, 'held');
    assert.equal(x.app.manage(token, 'rename', { kind: 'box-name', box: 0, name: '保留' }).status, 'applied'); const before = clone(state.current()), writes = state.replaced.length;
    failContent = true; failState = true; assert.equal(x.app.manage(token, 'cancel', { kind: 'cancel-held' }).status, 'cancelled'); assert.equal(x.app.saveBlocked, false); assert.equal(x.app.endManagement(token).status, 'unchanged'); assert.equal(state.replaced.length, writes); assert.deepEqual(state.current(), before);
  });

  test('M05: force-party full parties with no legal target disable balls; a legal target and party room remain usable', async () => {
    for (const p of [1, 3, 6]) for (const guard of ['cannotStore', 'mail', 'legal']) {
      const game = E.state.newGame({ party: Array.from({ length: p }, (_, i) => member('P' + i)) });
      for (const m of game.party) { m.cannotStore = guard !== 'mail'; m.mail = guard === 'mail' ? 'letter' : null; }
      if (guard === 'legal') game.party[p - 1].cannotStore = false;
      const x = setup(game, { limits: { ...E.limits.DEFAULT_LIMITS, party: p }, receivingProfile: auto }); const req = { battleId: 'force-' + p + guard, kind: 'wild', seq: 1, forceParty: true, foes: [{ species: 'pidgey', level: 3 }] };
      let ended; x.sessions.next = () => ended; const h = await x.app.startBattle(req); assert.equal(x.sessions.created[0].setup.noBall, guard !== 'legal', p + guard); assert.equal(x.state.replaced.length, 0);
      if (guard === 'legal') {
        const foe = x.sessions.created[0].setup.foes[0], c = capture(foe.id, ''); c.raw.battleId = req.battleId; c.raw.bag = {}; ended = c.raw;
        const pending = x.app.finishBattle(h, req); const done = x.app.resolveReceiving(pending.receivingToken, {}, 'scene-aborted'); assert.equal(done.commit, 'applied'); assert.equal(x.app.saveBlocked, false); assert.equal(x.state.current().party[p - 1].id, foe.id);
      } else x.app.abortBattle(req, 'no capture attempted');
    }
    const game = E.state.newGame({ party: [member('A')] }); for (let i = 0; i < 1200; i++) E.storage.placeInBox(game.storage, { ...member('B' + i) });
    const x = setup(game); await x.app.startBattle({ battleId: 'room', kind: 'wild', seq: 1, forceParty: true, foes: [{ species: 'pidgey', level: 3 }] }); assert.equal(x.sessions.created[0].setup.noBall, false);
  });
  test('M05: unexpected later target loss retains pending/template instead of dropping or boxing the capture', async () => {
    const x = setup(undefined, { limits: { ...E.limits.DEFAULT_LIMITS, party: 1 } }); let ended; x.sessions.next = () => ended;
    const req = { battleId: 'later-loss', kind: 'wild', seq: 1, forceParty: true, foes: [{ species: 'pidgey', level: 3 }] }, handle = await x.app.startBattle(req);
    assert.equal(x.sessions.created[0].setup.noBall, false);
    const c = capture(x.sessions.created[0].setup.foes[0].id, ''); ended = { ...c.raw, battleId: req.battleId };
    const changed = clone(x.state.current()); changed.party[0].cannotStore = true; x.state.replace(changed); const before = clone(x.state.current());
    const pending = x.app.finishBattle(handle, req), recovered = x.app.resolveReceiving(pending.receivingToken, {}, 'scene-aborted');
    assert.equal(recovered.status, 'pending'); assert.match(recovered.reason, /no legal forced-party/); assert.equal(x.app.saveBlocked, true); assert.deepEqual(x.state.current(), before); assert.equal(x.app.pendingReceiving.members[0].id, c.template.id);
  });
  test('M05: real Showdown no-target battle refuses balls without spending one', async () => {
    const game = E.state.newGame({ party: [member('A')], bag: { masterball: 2 } }); game.party[0].cannotStore = true;
    const state = E.fakes.createMemoryState(game); const app = new E.app.GameApplication({ state, sessions: E.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4] }), projection: E.fakes.createRecordingProjection(), content: () => ({ content }), random: () => 0, clock: () => 1000 }, { limits: { ...E.limits.DEFAULT_LIMITS, party: 1 } });
    const session = await app.startBattle({ battleId: 'actual-no-target', kind: 'wild', seq: 1, forceParty: true, foes: [{ species: 'pidgey', level: 3 }] });
    assert.deepEqual(await session.throwBall('masterball'), { ok: false, reason: 'ballsdisabled' }); assert.equal(state.current().bag.masterball, 2); assert.equal(state.replaced.length, 0); app.abortBattle({ battleId: 'actual-no-target' }, 'test ended');
  });
  test('M01: real Minior-Meteor base identity reaches creation through the full pipeline at both draw boundaries', () => {
    const c = assemble([{ ...base, id: 'meteor', showdownId: 'miniormeteor' }, { ...base, id: 'meteor', form: 7, showdownId: 'minior' }, { ...base, id: 'meteor', form: 13, showdownId: 'miniorviolet' }]);
    for (const [roll, form, species] of [[0, 7, 'Minior'], [6, 13, 'Minior-Violet']]) {
      const draws = []; const m = E.memberFactory.createMember({ id: 'M3', species: 'Minior-Meteor', level: 5 }, c, n => { draws.push(n); return draws.length === 9 ? roll : 0; });
      assert.equal(m.form, form); assert.equal(m.species, species); assert.deepEqual(draws, [65536, 65536, 32, 32, 32, 32, 32, 32, 7]);
      assert.deepEqual(E.speciesKey.memberKey(E.speciesKey.toPersistentMember(m, c)), { species: 'meteor', form });
    }
    assert.equal(c.species['Minior-Meteor'].ruleSpecies, 'Minior');
    for (const input of [{ species: 'Minior-Meteor', form: 0 }, { species: 'Minior-Meteor', form: 7 }, { species: 'Minior' }, { species: 'Minior-Violet' }]) {
      let draws = 0; const m = E.memberFactory.createMember({ id: 'S', level: 5, ...input }, c, () => { draws++; return 0; });
      assert.equal(draws, 8, JSON.stringify(input)); assert.equal(m.form, input.form ?? (input.species === 'Minior' ? 7 : 13));
    }
  });
  test('M01: Minior missing target forms refuse after exactly nine draws, independent of author ID', () => {
    for (const [id, roll, missing] of [['meteor', 0, 7], ['unown', 6, 13]]) {
      const records = [{ ...base, id, showdownId: 'miniormeteor' }, { ...base, id, form: 7, showdownId: 'minior' }, { ...base, id, form: 13, showdownId: 'miniorviolet' }].filter(sp => sp.form !== missing);
      const c = assemble(records); let draws = 0;
      assert.throws(() => E.memberFactory.createMember({ id: 'M4', species: 'Minior-Meteor', level: 5 }, c, () => ++draws === 9 ? roll : 0), new RegExp('form ' + missing + ': missing creation form'));
      assert.equal(draws, 9);
    }
  });

}
