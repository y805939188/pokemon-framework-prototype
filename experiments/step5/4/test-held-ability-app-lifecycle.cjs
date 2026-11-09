'use strict';
// Synthetic author content -> real GameApplication -> production Session/Gen8 -> durable Node store.
// No injected outcomes/facts, seedState, private engine mutation, patched RNG, or source/observer substitution.
// Read-only held diagnostics do not provide settlement authority; the App independently collects its own source.
// App wild creation has no held-item or hidden-ability input. Wild cases therefore use ordinary Trick to lend
// the player's own item before naturally taking it back. They do NOT claim wild-original permanent acquisition.
// This is Node App/disk evidence, not MZ Title/Continue, NW, player-save or original-Ruby equivalence evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const E = require('../../../js/engine/build/production.cjs');
const T = require('../../../js/engine/build/testing.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const events = messages => messages.flatMap(m => m.kind === 'events' ? m.events : []);
const norm = value => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
const capabilities = { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true };
const pinnedSHA = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
assert.equal(fs.readFileSync(path.join(root, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), pinnedSHA);

function assemble(c) {
  const source = path.join(root, 'content/sample');
  const input = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata']
    .filter(n => fs.existsSync(path.join(source, n + '.json')))
    .map(n => [n.replace(/-([a-z])/g, (_, x) => x.toUpperCase()), JSON.parse(fs.readFileSync(path.join(source, n + '.json'), 'utf8'))]));
  const receiverSpecies = c.ability === 'Magician' ? 'delphox' : 'weavile';
  const playerSpecies = c.receiver === 'p1' ? receiverSpecies : 'snorlax';
  const foeSpecies = c.receiver === 'p1' ? 'snorlax' : receiverSpecies;
  const first = c.receiver === 'p1' ? (c.ability === 'Magician' ? 'swift' : 'splash')
    : (c.ability === 'Magician' ? 'splash' : 'falseswipe');
  const playerMoves = [c.wild ? 'trick' : first, c.wild ? first : 'celebrate', 'memento', 'dragonrage'];
  const foeMove = c.receiver === 'p1' ? (c.ability === 'Magician' ? 'splash' : 'tackle')
    : (c.ability === 'Magician' ? 'swift' : 'splash');
  for (const [id, moves] of [[playerSpecies, playerMoves], [foeSpecies, [foeMove]]]) {
    let species = input.species.find(s => s.id === id);
    if (!species) {
      species = { id, showdownId: id, nameKey: 'species.' + id, growth: 'medium', baseExp: 50,
        evYield: {}, catchRate: 45, source: 'author-placeholder' };
      input.species.push(species);
    }
    species.learnset = moves.map(move => ({ level: 1, move }));
  }
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map(item => ({ ...item, source: 'author-placeholder' }));
  if (!input.items.some(i => i.id === 'lightclay')) input.items.push({ id: 'lightclay', name: 'Light Clay',
    namePlural: 'Light Clays', pocket: 1, price: 0, source: 'author-placeholder' });
  input.trainerTypes = [{ id: 'ability-lifecycle', nameKey: 'trainer.ability', gender: 0, baseMoney: 0,
    skillLevel: 0, flags: [], items: [], source: 'author-placeholder' }];
  input.trainers = [{ id: 'ability-foe', type: 'ability-lifecycle', name: 'Ability Foe', version: 1,
    source: 'author-placeholder', party: [{ species: foeSpecies, level: 50, moves: [foeMove],
      abilityIndex: c.receiver === 'p2' ? 2 : 0, ...(c.receiver === 'p1' ? { item: 'lightclay' } : {}) }] }];
  const compiled = E.contentCompile.compileContent(input);
  assert(compiled.ok, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), supplied = E.contentRuntime.assembleContent(compiled.data, dex);
  assert.deepEqual(supplied.errors, []);
  return { content: supplied.content, dex, playerSpecies, playerMoves, foeSpecies, foeMove };
}
function storeAt(file, content) {
  return new E.store.SaveStore(file, {}, E.speciesKey.speciesKeyResolver(content), content);
}
function makeApp(supplied, store, installs, enabled = true) {
  const state = { read: () => store.load(), replace: next => { store.save(next); installs.push(clone(next)); } };
  const app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(),
    sessions: E.composition.createBattleSessionFactory({ content: () => supplied.content, seed: () => [1, 2, 3, 4] }),
    content: () => supplied, random: () => 0, clock: () => 12345 },
    { ...(enabled ? { capabilities } : {}), receivingProfile: { mode: 1, naming: 1 } });
  return { app, state };
}
function inspect(session) {
  return session.gw._debugBattle().sides.map(s => ({ side: s.id, id: s.pokemon[0].set.name,
    item: s.pokemon[0].item, ability: s.pokemon[0].ability, hp: s.pokemon[0].hp,
    state: clone(session.gw.readState(s.id)[0]) }));
}
async function verifyCase(c, folder) {
  fs.mkdirSync(folder, { recursive: false });
  const supplied = assemble(c), content = supplied.content;
  const member = E.memberFactory.createMember({ id: 'A1', species: content.speciesIds[supplied.playerSpecies],
    level: 100, abilityIndex: c.receiver === 'p1' ? 2 : 0 }, content, () => 0);
  assert.equal(member.ability, c.receiver === 'p1' ? c.ability : 'Immunity');
  assert.deepEqual(member.moves.map(m => m.id), supplied.playerMoves);
  member.item = c.wild || c.receiver === 'p2' ? 'lightclay' : '';
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 5000 });
  game.nextMemberOrdinal = '2';
  const file = path.join(folder, 'save.json'), store = storeAt(file, content);
  store.save(game);
  const initial = clone(store.load()), initialBytes = fs.readFileSync(file), installs = [];
  const { app, state } = makeApp(supplied, store, installs);
  const request = { battleId: c.id, seq: 1, canLose: false, expGain: false, moneyGain: false,
    ...(c.wild ? { kind: 'wild', foes: [{ species: supplied.foeSpecies, level: 50 }] }
      : { trainer: { id: 'ability-foe', version: 1 } }) };
  let session;
  const trace = [];
  function untouched() {
    assert.equal(installs.length, 0);
    assert.deepEqual(state.read(), initial, 'whole persistent state unchanged before finish');
    assert.deepEqual(fs.readFileSync(file), initialBytes, 'no disk write before authenticated finish');
    assert.equal(app.saveBlocked, true);
  }
  async function choose(slot) {
    untouched();
    const before = inspect(session), result = await session.chooseMove(slot), after = inspect(session);
    assert(result.ok, JSON.stringify(result));
    const move = supplied.playerMoves[slot - 1];
    assert.equal(after[0].state.pp[move], before[0].state.pp[move] - 1, 'real chosen move spends PP');
    untouched();
    const row = { move, before, after, events: clone(events(result.messages)) };
    trace.push(row);
    return row;
  }
  try {
    session = c.wild ? await app.startBattle(request) : await app.startTrainerBattle(request);
    session.take();
    untouched();
    const before = inspect(session), receiverIndex = c.receiver === 'p1' ? 0 : 1, donorIndex = 1 - receiverIndex;
    assert.equal(before[receiverIndex].ability, norm(c.ability));
    if (c.wild) assert.equal(before[1].item, '', 'wild member is genuinely created empty');
    await choose(1);
    if (c.wild && c.ability === 'Magician') await choose(2);
    assert.equal(session.finished, false, 'transfer happens in a live nonterminal turn');
    const afterTransfer = inspect(session);
    const receipts = trace.flatMap(row => row.events).filter(e => e.type === '-item' && e.args.includes('[from] ability: ' + c.ability));
    assert.equal(receipts.length, 1, 'one genuine ability receipt');
    assert.equal(receipts[0].args[0], c.receiver + 'a: ' + before[receiverIndex].id);
    assert.equal(norm(receipts[0].args[1]), 'lightclay');
    assert(receipts[0].args.includes('[of] ' + before[donorIndex].side + 'a: ' + before[donorIndex].id));
    assert.equal(afterTransfer[receiverIndex].item, 'lightclay');
    assert.equal(afterTransfer[donorIndex].item, '');
    const damaged = c.ability === 'Magician' ? donorIndex : receiverIndex;
    assert(afterTransfer[damaged].hp < before[damaged].hp && afterTransfer[damaged].hp > 0,
      'the real damaging or contact hit reaches a living target');
    if (c.wild) assert(trace.some(row => row.events.some(e => e.type === 'move' && norm(e.args[1]) === 'trick')));
    if (c.loss) await choose(3); // Ordinary Memento naturally faints the sole player member.
    else for (let turns = 0; !session.finished && turns < 12; turns++) await choose(4);
    assert(session.finished && session.gw.ended, 'natural Memento or Dragon Rage reaches terminal');
    const raw = clone(session.result());
    assert.deepEqual(raw.outcome, { kind: 'win', winner: c.loss ? (c.wild ? 'Wild' : 'Trainer') : 'Player' });
    const terminal = inspect(session);
    assert.equal(terminal[c.loss ? 0 : 1].hp, 0);
    const lineage = T.heldDiagnostics.gatewaySettlementLineage(session.gw);
    assert(lineage);
    const binding = { battleId: raw.battleId, generation: 0, rawHash: E.state.resultHash(raw), contentIdentity: 'b'.repeat(64) };
    const facts = T.heldDiagnostics.gatewaySettlementFacts(session.gw, lineage, binding);
    const roster = facts.members.map(({ id, side, initial }) => ({ id, side, initial }));
    assert.equal(E.heldFacts.resolveRequiredFacts(facts, { binding, roster, wild: c.wild }).ok, true);
    assert.equal(facts.events.length, c.wild ? 4 : 2);
    const pair = facts.events.slice(-2);
    assert.deepEqual(pair.map(e => [e.id, e.sourceId, e.reason]), [
      [before[donorIndex].id, before[receiverIndex].id, 'temporary-remove'],
      [before[receiverIndex].id, before[donorIndex].id, 'temporary-receive'],
    ], 'authenticated journal attributes the exact donor and receiver, not ability user guesses');
    const playerFact = facts.members.find(m => m.id === 'A1');
    assert.equal(playerFact.recovery, initial.party[0].item);
    fs.writeFileSync(path.join(folder, "terminal.json"), JSON.stringify({ raw, facts, trace }, null, 2));
    untouched();
    const outcome = app.finishBattle(session, request);
    assert.equal(outcome.commit, 'applied', JSON.stringify(outcome));
    assert.equal(installs.length, 1, 'held item, HP/PP, wallet and result pair install atomically once');
    assert.equal(app.saveBlocked, false);
    const installed = state.read(), installedBytes = fs.readFileSync(file);
    assert.equal(installed.party[0].item, initial.party[0].item);
    assert.equal(installed.appliedBattles[raw.battleId].hash, E.state.resultHash(raw));
    assert.match(installed.appliedBattles[raw.battleId].settlement.pairHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(E.inventory.aggregateBag(installed.inventory), E.inventory.aggregateBag(initial.inventory));
    if (c.loss) {
      assert.equal(installed.money, initial.money - E.defeat.defeatMoneyLoss(initial));
      assert.equal(installed.party[0].hp, initial.party[0].hp);
      assert(installed.party[0].moves.every(m => m.pp === m.maxpp), 'defeat healing shares the same installation');
    } else {
      assert.equal(installed.money, initial.money);
      assert.equal(installed.party[0].hp, raw.members.A1.hp);
      for (const move of installed.party[0].moves) assert.equal(move.pp, raw.members.A1.moves.find(m => m.id === move.id).pp);
    }
    assert.equal(app.finishBattle(session, request).commit, 'already-applied');
    assert.equal(app.commitResult(raw), 'already-applied');
    assert.equal(store.commit(raw).status, 'already-applied');
    assert.equal(installs.length, 1);
    assert.deepEqual(state.read(), installed);
    assert.deepEqual(fs.readFileSync(file), installedBytes);
    const replayInput = path.join(folder, 'replay-input.json');
    fs.writeFileSync(replayInput, JSON.stringify({ c, raw, installed, file }));
    const restart = spawnSync(process.execPath, [__filename, '--read-save', replayInput], { cwd: root, encoding: 'utf8' });
    fs.writeFileSync(path.join(folder, 'restart.stdout'), restart.stdout);
    fs.writeFileSync(path.join(folder, 'restart.stderr'), restart.stderr);
    assert.equal(restart.status, 0, restart.stderr);
    const child = JSON.parse(restart.stdout);
    assert.notEqual(child.pid, process.pid);
    assert.equal(child.diskHash, hash(installedBytes));
    assert.deepEqual(fs.readFileSync(file), installedBytes);
    const report = { c, pid: process.pid, trace, facts, raw, outcome, initial, installed,
      installs: installs.length, child, initialHash: hash(initialBytes), installedHash: hash(installedBytes), NW: 0 };
    fs.writeFileSync(path.join(folder, 'PASS.json'), JSON.stringify(report, null, 2));
    return { id: c.id, turns: trace.length, installs: 1, childPid: child.pid, pairHash: installed.appliedBattles[raw.battleId].settlement.pairHash };
  } catch (error) {
    fs.writeFileSync(path.join(folder, 'FAIL.json'), JSON.stringify({ c, trace, error: String(error.stack ?? error) }, null, 2));
    throw error;
  } finally {
    if (session && !session.finished) app.abortBattle(request, Error('lifecycle test cleanup'));
  }
}

if (process.argv[2] === '--read-save') {
  const { c, raw, installed, file } = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const supplied = assemble(c), store = storeAt(file, supplied.content), before = fs.readFileSync(file), installs = [];
  const { app, state } = makeApp(supplied, store, installs, false);
  assert.deepEqual(state.read(), installed, 'fresh process reconstructs all installed state and pair ledger');
  assert.equal(app.heldItemSourcesEnabled(), true, 'normal released capability is available without loading developer overrides');
  assert.equal(app.commitResult(raw), 'already-applied');
  assert.equal(store.commit(raw).status, 'already-applied');
  assert.equal(installs.length, 0);
  assert.deepEqual(state.read(), installed);
  assert.deepEqual(fs.readFileSync(file), before, 'fresh-process replay is read-only');
  console.log(JSON.stringify({ pid: process.pid, appReplay: 'already-applied', storeReplay: 'already-applied', installs: 0,
    diskHash: hash(before), pairHash: installed.appliedBattles[raw.battleId].settlement.pairHash }));
} else {
  const test = require('node:test');
  test('held ability natural App settlement, durable save, and fresh-process replay', async t => {
    const directory = process.env.PF_HELD_APP_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'pf-held-ability-app-'));
    fs.mkdirSync(directory, { recursive: true });
    t.diagnostic('Evidence: ' + directory);
    const cases = [];
    for (const ability of ['Magician', 'Pickpocket']) for (const receiver of ['p1', 'p2']) for (const loss of [false, true])
      cases.push({ id: `${ability}-${receiver}-${loss ? 'loss' : 'win'}`, ability, receiver, loss, wild: false });
    for (const ability of ['Magician', 'Pickpocket']) for (const loss of [false, true])
      cases.push({ id: `${ability}-wild-${loss ? 'loss' : 'win'}`, ability, receiver: 'p1', loss, wild: true });
    for (const c of cases) {
      let failure;
      await t.test(c.id, async () => {
        try { const result = await verifyCase(c, path.join(directory, c.id)); t.diagnostic(JSON.stringify(result)); }
        catch (error) { failure = error; throw error; }
      });
      if (failure) throw failure; // Preserve first failure and stop; never retry a failed business case automatically.
    }
  });
}
