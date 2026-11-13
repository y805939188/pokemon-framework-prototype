'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {E, T, world, clone, directOptions} = require('./contracts/fixtures.cjs');

function scripted() {
  return T.scripted.createScriptedFactory({turns: [{events: [], end: {winner: null, reason: 'run', outcome: {kind: 'run', winner: null}}}]});
}

test('FC01 the custom driver satisfies the complete TypeScript base interface', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-formal-driver-types-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const root = path.resolve(__dirname, '../..'), config = path.join(directory, 'tsconfig.json');
  fs.writeFileSync(config, JSON.stringify({compilerOptions: {strict: true, noEmit: true, skipLibCheck: false,
    target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', lib: ['ES2022'], types: []},
    files: [path.join(__dirname, 'contracts/structural-driver.ts')]}));
  const result = spawnSync(process.execPath, [path.join(root, 'src/node_modules/typescript/bin/tsc'), '-p', config], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const forged of [false, true]) test(`FC02 base custom driver works, but required settlement refuses; forged supported=${forged}`, async () => {
  const w = world(), driver = scripted();
  if (forged) {
    Object.assign(driver, {supported: {requiredSettlement: true, trainerAi: true, replacementOffers: true}});
    const create = driver.create.bind(driver);
    driver.create = async options => Object.assign(await create(options), {supported: true, requiredSettlement: true});
  }
  const session = await E.session.BattleSession.create(directOptions(w, driver));
  assert.equal((await session.chooseMove(1)).ok, true);
  assert.equal(session.result().outcome.kind, 'run');
  assert.equal(T.heldDiagnostics.gatewaySettlementLineage(session.gw), null);
  await assert.rejects(E.session.BattleSession.create(directOptions(w, driver, {requiredSettlement: true})), /required-settlement-driver-unavailable/);
  assert.equal(w.state.replaced.length, 0);
});

test('FC03 a structurally complete real-driver wrapper still needs explicit legacy admission; public flags cannot register it', async () => {
  let creates = 0;
  const actual = E.gateway.showdownDriverFactory;
  const wrapper = {create: options => {creates++; return actual.create(options);},
    fromCheckpoint: token => actual.fromCheckpoint(token), moveNames: (...args) => actual.moveNames(...args),
    supported: {requiredSettlement: true, trainerAi: true, replacementOffers: true}};
  assert.throws(() => E.composition.createBattleSessionFactory({content: () => null, driver: wrapper, replacementOffers: true}), /replacement-offers-require-formal-factory/);
  assert.equal(creates, 0);
  const w = world();
  const unknown = E.composition.createBattleSessionFactory({content: () => w.content, seed: () => [1, 2, 3, 4], driver: wrapper});
  Object.assign(unknown, {required: true, mode: 'required', supported: true});
  const makeApp = sessions => new E.app.GameApplication({state: w.state, sessions, content: () => ({content: w.content, dex: w.dex}),
    projection: w.projection, random: () => 0, clock: () => 1000});
  const unregistered = makeApp(unknown), before = clone(w.state.read());
  const first = await unregistered.startBattle(w.request);
  assert.equal((await first.run()).ok, true);
  const refused = unregistered.finishBattle(first, w.request);
  assert.equal(refused.commit, 'none');
  assert.match(refused.error, /battle-settlement-source-unknown-or-retired/);
  assert.deepEqual(w.state.read(), before);
  assert.equal(w.state.replaced.length, 0);
  const legacy = makeApp(E.composition.createLegacyNoHeldSessionFactory(unknown));
  const second = await legacy.startBattle({...w.request, battleId: 'contract-explicit-legacy'});
  assert.equal((await second.run()).ok, true);
  const done = legacy.finishBattle(second, {battleId: 'contract-explicit-legacy'});
  assert.equal(done.commit, 'applied', JSON.stringify(done));
  assert.equal(w.state.read().appliedBattles['contract-explicit-legacy'].settlement, undefined);
  assert.equal(w.state.replaced.length, 1);
});

test('FC04 one owned rollback restores held settlement, AI prepared choice and replacement offer together', async () => {
  let decisions = 0;
  const registry = E.composition.createTrainerAiStrategyRegistry();
  registry.register({id: 'contract', version: '1', implementationIdentity: 'test/formal-contract/1', validateParameters() {},
    create() { return {decide(snapshot) {
      decisions++;
      const candidate = (snapshot.request.kind === 'force-switch' ? snapshot.request.legalSwitches : snapshot.request.legalMoves)[0];
      return {kind: 'choose', binding: snapshot.binding, candidateId: candidate.candidateId, retryOrder: [candidate.candidateId], diagnostics: []};
    }}; }});
  const w = world({moves: ['fling', 'tackle'], held: 'oranberry', replacementOffers: true, registry,
    strategy: {id: 'contract', version: '1', parameters: {}}});
  const request = {...w.request, trainer: {id: 'c-basic', version: 1}};
  const session = await w.app.startTrainerBattle(request), before = clone(w.state.read());
  assert.equal((await session.chooseMove(1)).ok, true);
  const original = E.session.readTrainerReplacement(session);
  assert(original, 'real Fling KO prepares a replacement offer');
  const checkpoint = session._checkpoint(), calls = decisions;
  assert.equal((await E.session.resolveTrainerReplacement(session, original.offerId, null)).ok, true);
  await session._restoreCheckpoint(checkpoint);
  const restored = E.session.readTrainerReplacement(session);
  assert(restored); assert.notEqual(restored.offerId, original.offerId);
  assert.equal((await E.session.resolveTrainerReplacement(session, original.offerId, 'P2')).ok, false);
  assert.equal((await E.session.resolveTrainerReplacement(session, restored.offerId, 'P2')).ok, true);
  assert.equal(decisions, calls, 'owned prepared AI choice is replayed without a second inference');
  assert.deepEqual(w.state.read(), before);
  assert.equal((await session.chooseMove(2)).ok, true);
  assert(session.finished);
  const done = w.app.finishBattle(session, request);
  assert.equal(done.commit, 'applied', JSON.stringify(done));
  assert.equal(w.state.read().party.find(member => member.id === 'P1').item, '', 'actual Fling consumption survives restoration and player replacement');
  assert.match(w.state.read().appliedBattles[request.battleId].settlement.pairHash, /^[a-f0-9]{64}$/);
  assert.equal(w.app.finishBattle(session, request).commit, 'already-applied');
  assert.equal(w.state.replaced.length, 1);
  assert.equal(w.app.saveBlocked, false);
});
