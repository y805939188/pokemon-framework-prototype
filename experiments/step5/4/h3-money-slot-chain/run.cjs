"use strict";
// Explicit local-only, serial, fail-stop driver. No builds, global cleanup or player saves.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const { digest, pairHash, verifyChain } = require("../h3-pair-ledger/oracle.cjs");
const PLAN = require("./plan.json");
const ROOT = path.resolve(__dirname, "../../../..");
const [hostRoot, productRoot, outputArg] = process.argv.slice(2);
assert(hostRoot && productRoot && outputArg, "explicit host, product and empty evidence paths required");
const output = fs.realpathSync(outputArg);
assert.equal(fs.readdirSync(output).length, 0, "never overwrite or reuse an earlier run");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const summary = { status: "RUNNING", scope: PLAN.scope, product: PLAN.product,
  started: new Date().toISOString(), pid: process.pid, node: process.version,
  nodeSHA256: sha(fs.readFileSync(process.execPath)), cases: [], controls: [],
  NW: 0, normalHeldRelease: false };
const save = () => fs.writeFileSync(path.join(output, "RESULT.json"), JSON.stringify(summary, null, 2) + "\n");
const childEnv = { ...process.env };
for (const key of ["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"]) delete childEnv[key];
function runtimeCheck() {
  for (const [relative, expected] of Object.entries({ ...PLAN.runtime, ...PLAN.helpers })) {
    assert.equal(sha(fs.readFileSync(path.join(ROOT, relative))), expected, relative);
  }
}
function verifyMoney(observation, expected) {
  const { result, requiredObservation, final, saved } = observation;
  assert.equal(observation.resultHash, digest(result));
  assert.equal(requiredObservation.facts.binding.battleId, result.battleId);
  assert.equal(requiredObservation.facts.binding.rawHash, observation.resultHash);
  const pair = pairHash(requiredObservation.facts);
  assert.equal(requiredObservation.pairHash, pair);
  assert.equal(final.appliedBattles[result.battleId].settlement.pairHash, pair);
  assert.equal(observation.savedPairHash, pair);
  assert.deepEqual(saved, final, "decoded compressed document");
  assert.deepEqual(requiredObservation.facts.money, { amuletCoin: true, happyHour: true, payDay: 250 });
  assert.deepEqual([final.money, final.stats.battle_money_gained, observation.outcome.trainerReward.actual],
    [expected.money, expected.gained, expected.trainerActual]);
  assert.deepEqual((observation.outcome.diagnostics || []).filter(value => value.startsWith("聚宝功获得 ")),
    expected.payDayActual ? ["聚宝功获得 " + expected.payDayActual] : []);
  assert.equal(observation.installs, 1);
}
function child(stage, c, folder) {
  const args = [path.join(__dirname, "worker.cjs"), stage, c.id, folder, hostRoot,
    productRoot, path.join(__dirname, "plan.json")];
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT, env: childEnv, encoding: "utf8", timeout: 20000,
    killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024
  });
  const prefix = path.join(output, c.id + "-" + stage);
  fs.writeFileSync(prefix + ".stdout.json", result.stdout || "");
  fs.writeFileSync(prefix + ".stderr.log", result.stderr || "");
  fs.writeFileSync(prefix + ".execution.json", JSON.stringify({
    started, ended: new Date().toISOString(), argv: args, pid: result.pid,
    status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
    stdoutSHA256: sha(result.stdout || ""), stderrSHA256: sha(result.stderr || "")
  }, null, 2) + "\n");
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, (result.stdout || "") + (result.stderr || ""));
  const observation = JSON.parse(result.stdout);
  assert.equal(observation.pid, result.pid);
  assert.equal(observation.ppid, process.pid);
  assert.equal(observation.id, c.id);
  assert.equal(observation.stage, stage);
  return observation;
}
try {
  save();
  assert.equal(process.version, "v22.21.1");
  assert.equal(summary.nodeSHA256, PLAN.nodeSHA256);
  summary.testCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim(), "",
    "freeze the test candidate before execution");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: ROOT, encoding: "utf8" }).trim(),
    PLAN.sourceTree, "test-only candidate must preserve production tree");
  runtimeCheck();
  const E = require(path.join(ROOT, "js/engine/build/production.cjs"));
  assert.deepEqual(E.config.runtimeCapabilities(), { allowHeldItemSources: false, allowExperimentalHeldItemBattle: false });
  for (const c of PLAN.cases) {
    const folder = path.join(output, c.id);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "OWNED.json"),
      JSON.stringify({ task: "h3-money-slot-chain", version: PLAN.version, caseId: c.id }));
    const a = child("producer", c, folder);
    const b = child("consumer", c, folder);
    assert.notEqual(a.pid, b.pid);
    const firstPair = verifyChain(a, b);
    verifyMoney(a, c.first);
    verifyMoney(b, c.second);
    assert.deepEqual(Object.keys(b.final.appliedBattles), [c.id + ".first", c.id + ".second"]);
    assert.deepEqual(b.final.appliedBattles[c.id + ".first"], a.final.appliedBattles[c.id + ".first"]);
    assert.notEqual(b.slotAfter, a.slotAfter, "the next completed battle is newly saved");
    // Detached observations only. These do not mutate a live session or actual save.
    for (const [name, mutate] of [
      ["nonzero money facts", (x, y) => { x.requiredObservation.facts.money.payDay++; }],
      ["installed pair", (x, y) => { x.final.appliedBattles[x.result.battleId].settlement.pairHash = "0".repeat(64); }],
      ["decoded save money", (x, y) => { x.saved.money++; }],
      ["fresh loaded money", (x, y) => { y.loaded.money++; }],
      ["next battle statistic", (x, y) => { y.final.stats.battle_money_gained++; }],
      ["slot byte identity", (x, y) => { y.slotBefore = "0".repeat(64); }]
    ]) {
      const x = JSON.parse(JSON.stringify(a)), y = JSON.parse(JSON.stringify(b));
      mutate(x, y);
      assert.throws(() => { verifyChain(x, y); verifyMoney(x, c.first); verifyMoney(y, c.second); }, assert.AssertionError);
      summary.controls.push(c.id + ": rejects changed " + name);
    }
    summary.cases.push({ id: c.id, status: "PASS", firstPair,
      secondPair: pairHash(b.requiredObservation.facts), producerPID: a.pid, consumerPID: b.pid,
      ownedSaveDirectory: folder, firstMoney: a.final.money, secondMoney: b.final.money,
      firstGained: a.final.stats.battle_money_gained, secondGained: b.final.stats.battle_money_gained });
    save();
  }
  runtimeCheck();
  assert.deepEqual(E.config.runtimeCapabilities(), { allowHeldItemSources: false, allowExperimentalHeldItemBattle: false });
  summary.status = "PASS_CONTROLLED_NONZERO_MONEY_CHAIN_ONLY";
  summary.ended = new Date().toISOString();
  save();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.status = "FAIL_STOP";
  summary.error = String(error.stack || error);
  summary.ended = new Date().toISOString();
  save();
  console.error(summary.error);
  process.exitCode = 1;
}
