"use strict";
// Controlled local App/Gen8 -> actual MZ compressed slot -> fresh Node -> next battle.
// Never launches NW or accepts a player save directory.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { E, T, inputs } = require("../trainer-ai-integration/fixtures.cjs");
const { createHost, sha } = require("../mz-slot-host.cjs");
const { pairHash, digest } = require("../h3-pair-ledger/oracle.cjs");
const ROOT = path.resolve(__dirname, "../../../..");
const clone = value => JSON.parse(JSON.stringify(value));
const [stage, caseId, folderArg, hostRoot, productRoot, planFile] = process.argv.slice(2);

async function main() {
  assert(["producer", "consumer"].includes(stage));
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const c = plan.cases.find(value => value.id === caseId);
  assert(c, "frozen case required");
  const folder = fs.realpathSync(folderArg);
  const marker = JSON.parse(fs.readFileSync(path.join(folder, "OWNED.json")));
  assert.deepEqual(marker, { task: "h3-money-slot-chain", version: plan.version, caseId });
  for (const [relative, expected] of Object.entries(plan.runtime)) {
    assert.equal(sha(fs.readFileSync(path.join(ROOT, relative))), expected, relative);
  }
  assert.deepEqual(E.config.runtimeCapabilities(), {
    allowHeldItemSources: false, allowExperimentalHeldItemBattle: false
  });

  const input = inputs({ moves: ["splash"], party: 1, skill: 0 });
  input.species.find(value => value.id === "snorlax").learnset =
    ["happyhour", "payday", "splash"].map(move => ({ level: 1, move }));
  input.trainers[0].party[0].level = 5;
  input.settings = { ...input.settings, MAX_MONEY: c.cap };
  input.items.push({ id: "amuletcoin", name: "Amulet Coin", namePlural: "Amulet Coins",
    pocket: 1, price: 0, source: "author-placeholder" });
  const compiled = E.contentCompile.compileContent(input);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup());
  assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const h = createHost(hostRoot, productRoot, folder, content, plan.host);
  const g = h.context;
  const slot = path.join(folder, "file1.rmmzsave");
  const fileHash = () => sha(fs.readFileSync(slot));
  const slotBefore = fs.existsSync(slot) ? fileHash() : null;
  let loaded = null;
  if (stage === "producer") {
    assert.equal(slotBefore, null);
    const player = E.memberFactory.createMember({
      id: "H3-MONEY-P1", species: "Snorlax", level: 50, abilityIndex: 1
    }, content, () => 0);
    assert.deepEqual(player.moves.map(move => [move.id, move.pp, move.maxpp]),
      [["happyhour", 30, 30], ["payday", 20, 20], ["splash", 40, 40]]);
    player.item = "amuletcoin";
    g.$gameSystem._psGame = E.state.newGame({
      content, party: [E.speciesKey.toPersistentMember(player, content)], money: c.initialMoney
    });
    g.$gameSystem._psGame.nextMemberOrdinal = "2";
    g.$gameVariables._data = [null, "H3 money synthetic marker", 544];
    g.$gameMap._mapId = 5;
    g.$gamePlayer._x = 3;
    g.$gamePlayer._y = 4;
  } else {
    assert(slotBefore, "consumer must read the producer's actual slot");
    assert.equal(await g.DataManager.loadGame(1), 0);
    assert.equal(g.PSFlow.replacements, 1);
    assert.equal(g.$gameSystem._psSaveError, undefined);
    loaded = clone(g.$gameSystem._psGame);
    assert.equal(g.$gameSystem.constructor.name, "Game_System");
    assert.equal(g.$gameVariables.constructor.name, "Game_Variables");
    assert.deepEqual(clone(g.$gameVariables._data), [null, "H3 money synthetic marker", 544]);
    assert.deepEqual([g.$gameMap._mapId, g.$gamePlayer._x, g.$gamePlayer._y], [5, 3, 4]);
    assert.equal(fileHash(), slotBefore, "loading does not rewrite bytes");
    assert.deepEqual(Object.keys(loaded.appliedBattles), [caseId + ".first"]);
    assert.equal(loaded.money, c.first.money);
    assert.equal(loaded.stats.battle_money_gained, c.first.gained);
  }
  const before = clone(g.$gameSystem._psGame);
  const installs = [];
  const state = {
    read: () => g.$gameSystem._psGame,
    replace: next => { installs.push(clone(next)); g.$gameSystem._psGame = next; }
  };
  const app = new E.app.GameApplication({
    state,
    projection: T.fakes.createRecordingProjection(),
    sessions: E.composition.createBattleSessionFactory({ content: () => content, seed: () => plan.seed }),
    content: () => ({ content, dex: E.dex.createDexLookup() }),
    random: () => 0,
    clock: () => 12345
  }, { capabilities: plan.appCapabilities });
  g.PSFlow._app = app;
  const request = {
    battleId: caseId + (stage === "producer" ? ".first" : ".second"),
    seq: stage === "producer" ? 1 : 2,
    trainer: { id: "c-basic", version: 1 }, canLose: true, expGain: false, moneyGain: true
  };
  const session = await app.startTrainerBattle(request);
  const messages = [...session.take()];
  const initialLive = clone(session.gw.readState("p1")[0]);
  assert.equal(session.party[0].item, "amuletcoin");
  g.PSFlow.running = true;
  try {
    const writesBefore = h.io.length;
    await assert.rejects(g.DataManager.saveGame(1));
    assert.equal(h.io.length, writesBefore);
    assert.deepEqual(state.read(), before);
    for (const move of [1, 2]) {
      const action = await session.chooseMove(move);
      assert.equal(action.ok, true, JSON.stringify(action));
      messages.push(...action.messages);
      assert.deepEqual(state.read(), before, "no persistent write before actual finish");
      assert.equal(installs.length, 0);
      assert.equal(h.io.length, writesBefore);
    }
    assert.equal(session.finished, true, "ordinary Pay Day KO must end battle");
    const result = session.result();
    assert.deepEqual(result.outcome, { kind: "win", winner: "Player" });
    // Observation only: the App still receives facts from its real authenticated factory.
    const context = session._evidence.snapshot().context;
    const binding = { battleId: request.battleId, generation: context.generation,
      rawHash: digest(result), contentIdentity: E.contentRuntime.validatedContentIdentity(content) };
    assert.equal(context.battleId, request.battleId);
    assert.equal(context.contentIdentity, binding.contentIdentity);
    const lineage = T.heldDiagnostics.gatewaySettlementLineage(session.gw);
    assert(lineage);
    const facts = T.heldDiagnostics.gatewaySettlementFacts(session.gw, lineage, binding);
    assert.equal(facts.coverage, "complete");
    assert.deepEqual(facts.binding, binding);
    assert.deepEqual(facts.money, { amuletCoin: true, happyHour: true, payDay: 250 });
    const observed = clone(facts);
    const requiredObservation = { facts, pairHash: pairHash(facts),
      source: "read-only actual Session context and testing journal; unchanged authenticated factory" };
    assert.deepEqual(facts, observed);
    const outcome = app.finishBattle(session, request);
    assert.equal(outcome.commit, "applied", JSON.stringify(outcome));
    assert.equal(installs.length, 1);
    const expected = c[stage === "producer" ? "first" : "second"];
    const final = clone(state.read());
    assert.deepEqual([final.money, final.stats.battle_money_gained],
      [expected.money, expected.gained]);
    assert.equal(outcome.trainerReward.actual, expected.trainerActual);
    assert.deepEqual((outcome.diagnostics || []).filter(value => value.startsWith("聚宝功获得 ")),
      expected.payDayActual ? ["聚宝功获得 " + expected.payDayActual] : []);
    assert.equal(final.party[0].item, "amuletcoin");
    assert.deepEqual(final.party[0].moves.map(move => [move.id, move.pp]),
      before.party[0].moves.map(move => [move.id, move.pp - (move.id === "splash" ? 0 : 1)]));
    assert.deepEqual(final.defeatedTrainers["c-basic@1"], { id: "c-basic", version: 1 });
    assert.equal(final.appliedBattles[request.battleId].hash, digest(result));
    assert.equal(final.appliedBattles[request.battleId].settlement.pairHash, requiredObservation.pairHash);
    assert.equal(app.finishBattle(session, request).commit, "already-applied");
    assert.equal(installs.length, 1);
    assert.deepEqual(state.read(), final, "duplicate result cannot award or mutate again");
    g.PSFlow.running = false;
    assert.equal(await g.DataManager.saveGame(1), 0);
    await h.drain();
    assert.equal(g.PSState.lastSaveError, null);
    assert.equal(h.records().filter(value => value.name === "file1").length, 1);
    const decoded = await g.StorageManager.loadObject("file1");
    const encoded = decoded.system._psGame;
    assert.equal(encoded.encoding, "pokemon-framework-json");
    assert.equal(encoded.version, 1);
    const saved = JSON.parse(encoded.data);
    assert.deepEqual(saved, final);
    assert.deepEqual(state.read(), final);
    const global = await g.StorageManager.loadObject("global");
    assert.equal(global[1].title, "Synthetic MZ Slot Contract");
    assert.equal(h.errors.length, 1, "only the deliberate in-battle save refusal");
    return { scope: plan.scope, id: caseId, stage, pid: process.pid, ppid: process.ppid,
      loaded, before, initialLive, messages, result, resultHash: digest(result), outcome,
      requiredObservation, final, saved,
      savedPairHash: saved.appliedBattles[request.battleId].settlement.pairHash,
      installs: installs.length, slotBefore, slotAfter: fileHash(),
      writes: h.records(), host: h.hashes, NW: 0 };
  } finally {
    g.PSFlow.running = false;
    if (!session.finished) app.abortBattle(request, Error("owned worker cleanup"));
    await h.drain();
  }
}
main().then(result => process.stdout.write(JSON.stringify(result) + "\n"))
  .catch(error => { console.error(error.stack || error); process.exitCode = 1; });
