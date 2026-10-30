import assert = require("node:assert/strict");
import fs = require("node:fs");
import path = require("node:path");
import childProcess = require("node:child_process");
import production = require("@pokemon-framework/engine/production");
import core = require("@pokemon-framework/engine/core");
import testing = require("@pokemon-framework/engine/testing");
import legacy = require("@pokemon-framework/engine/legacy");
import legacyStore = require("@pokemon-framework/engine/legacy/game/store.cjs");
import compiledSample = require("@pokemon-framework/engine/content/sample.json");

type GameState = production.state.GameState;
type BattleResult = production.state.BattleResult;

class MemoryState implements production.app.GameStatePort {
  readonly replaced: GameState[] = [];
  failReplace: Error | null = null;
  constructor(private held: GameState) {}
  read(): GameState { return this.held; }
  replace(next: GameState): void {
    if (this.failReplace) throw this.failReplace;
    this.held = next;
    this.replaced.push(next);
  }
}

class RecordingProjection implements production.app.OutcomeProjection {
  readonly outcomes: production.app.BattleOutcome[] = [];
  failures = 0;
  project(outcome: production.app.BattleOutcome): void {
    this.outcomes.push({ ...outcome });
    if (this.failures > 0) {
      this.failures--;
      throw new Error("host projection failed");
    }
  }
}

function lcg(seed: number): production.app.RandomPort {
  let state = seed >>> 0;
  return n => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * n);
  };
}

function result(battleId: string): BattleResult {
  return {
    protocol: 1,
    battleId,
    outcome: { kind: "run", winner: null },
    members: {},
    bag: {},
    captured: [],
    dex: { seen: [], owned: [] },
  };
}

function request(battleId: string): production.app.BattleStartRequest {
  return { battleId, kind: "wild", foes: [{ species: "pidgey", level: 5 }], seq: 1 };
}

const sessions: production.app.BattleSessionFactory<production.app.BattleHandle> = {
  async create(start) {
    return { result: () => result(start.battleId) };
  },
};

function application(state: MemoryState, projection: RecordingProjection) {
  return new production.app.GameApplication({
    state,
    sessions: production.composition.createLegacyNoHeldSessionFactory(sessions),
    projection,
    content: () => ({ content }),
    random: lcg(11),
    clock: () => 1700000000000,
  }, { receivingProfile: { mode: 1, naming: 1 } });
}

const assembled = production.contentRuntime.assembleContent(
  production.contentRuntime.loadCompiled(compiledSample),
  production.dex.createDexLookup(),
);
assert.deepEqual(assembled.errors, []);
const content: core.Content = assembled.content;

async function main() {
  const digest: string = core.digest.sha256Hex("abc");
  assert.equal(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(digest, production.digest.sha256Hex("abc"));
  const coreGame: core.state.GameState = core.state.newGame({ party: [], content });
  assert.deepEqual(production.saveSchema.validateGame(coreGame), []);
  assert.deepEqual(core.saveSchema.validateGame(testing.fixtures.makeGame()), []);

  // production/testing/legacy and a historical facade share nominal identity in this external installation.
  assert.equal(production.app.GameApplication, legacy.app.GameApplication);
  assert.equal(production.store.SaveError, legacyStore.SaveError);
  assert.equal(production.gateway.GatewayCheckpoint, legacy.gateway.GatewayCheckpoint);
  assert.equal(Object.hasOwn(production, "fixtures"), false);
  assert.throws(
    () => require("@pokemon-framework/engine/js/engine/build/production.cjs"),
    (error: unknown) => {
      assert.equal((error as NodeJS.ErrnoException).code, "ERR_PACKAGE_PATH_NOT_EXPORTED");
      return true;
    },
  );

  // Consumer-owned ports: one-time grant and exact replay.
  const state = new MemoryState(production.state.newGame({ party: [], content }));
  const projection = new RecordingProjection();
  const app = application(state, projection);
  const claim = app.claimGrant("starter");
  assert.equal(claim.status, "applied");
  assert.equal(state.replaced.length, 1);
  assert.equal(app.claimGrant("starter").status, "already-claimed");
  assert.equal(state.replaced.length, 1);

  // A refused replacement installs nothing; the public recovery token resumes exactly once.
  const refusedState = new MemoryState(production.state.newGame({ party: [], content }));
  const refusedApp = application(refusedState, new RecordingProjection());
  const beforeRefusal = JSON.stringify(refusedState.read());
  refusedState.failReplace = new Error("store refused");
  const refused = refusedApp.claimGrant("starter");
  assert.deepEqual([refused.status, refused.reason], ["pending", "commit-failed"]);
  assert.equal(JSON.stringify(refusedState.read()), beforeRefusal);
  assert.equal(refusedState.replaced.length, 0);
  assert.equal(typeof refused.token, "string");
  refusedState.failReplace = null;
  const recovered = refusedApp.resolveReceiving(refused.token!, {});
  assert.ok("status" in recovered && recovered.status === "applied");
  assert.equal(refusedApp.claimGrant("starter").status, "already-claimed");
  assert.equal(refusedState.replaced.length, 1);

  // Battle write refusal, retry and duplicate use the same consumer-written session port.
  const battleRequest = request("external-refusal#1");
  const handle = await app.startBattle(battleRequest);
  const beforeBattle = JSON.stringify(state.read());
  const writesBeforeBattle = state.replaced.length;
  state.failReplace = new Error("store refused");
  const blocked = app.finishBattle(handle, battleRequest);
  assert.deepEqual([blocked.commit, blocked.pending, blocked.error], ["none", true, "commit-failed: store refused"]);
  assert.equal(JSON.stringify(state.read()), beforeBattle);
  assert.equal(state.replaced.length, writesBeforeBattle);
  state.failReplace = null;
  assert.equal(typeof blocked.receivingToken, "string");
  const recoveredBattle = app.resolveReceiving(blocked.receivingToken!, {});
  assert.ok("commit" in recoveredBattle && recoveredBattle.commit === "applied");
  assert.equal(state.replaced.length, writesBeforeBattle + 1);
  assert.equal(app.finishBattle(handle, battleRequest).commit, "already-applied");
  assert.equal(state.replaced.length, writesBeforeBattle + 1);

  // Projection failure never rolls back an installed commit, and the retry does not settle again.
  const projectionRequest = request("external-projection#1");
  const projectionHandle = await app.startBattle(projectionRequest);
  const writesBeforeProjection = state.replaced.length;
  projection.failures = 1;
  const projected = app.finishBattle(projectionHandle, projectionRequest);
  assert.deepEqual([projected.commit, projected.projection, projected.projectionError], ["applied", "failed", "host projection failed"]);
  assert.equal(state.replaced.length, writesBeforeProjection + 1);
  const projectedRetry = app.finishBattle(projectionHandle, projectionRequest);
  assert.deepEqual([projectedRetry.commit, projectedRetry.projection], ["already-applied", "ok"]);
  assert.equal(state.replaced.length, writesBeforeProjection + 1);

  // Public composition + the delivered pinned Showdown, with no test session or fixture party.
  const realState = new MemoryState(production.state.newGame({ party: [], content }));
  const realProjection = new RecordingProjection();
  const realApp = new production.app.GameApplication({
    state: realState,
    sessions: production.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4] }),
    projection: realProjection,
    content: () => ({ content }),
    random: lcg(19),
    clock: () => 1700000000000,
  }, { receivingProfile: { mode: 1, naming: 1 } });
  assert.equal(realApp.claimGrant("starter").status, "applied");
  const realRequest = request("external-showdown#1");
  const realSession = await realApp.startBattle(realRequest);
  assert.equal((await realSession.run()).ok, true);
  assert.deepEqual([realApp.finishBattle(realSession, realRequest).commit, realApp.finishBattle(realSession, realRequest).commit], ["applied", "already-applied"]);

  // Public migration uses an application-owned opaque preview and a real local Store adapter.
  const migrationFile = path.join(process.cwd(), "consumer-output/friendship.json");
  fs.mkdirSync(path.dirname(migrationFile), {recursive:true});
  const migrationGame = JSON.parse(JSON.stringify(state.read())) as GameState;
  migrationGame.party[0]!.friendship = 256;
  const migrationState = new MemoryState(migrationGame);
  const migrationStore = new production.store.SaveStore(migrationFile, {}, production.speciesKey.speciesKeyResolver(content), content);
  migrationStore.save(migrationGame);
  const migrationApp = new production.app.GameApplication({state:migrationState,content:()=>({content}),sessions:production.composition.createBattleSessionFactory({content:()=>content}),projection:{project(){}}});
  const migrationPreview = await migrationApp.previewFriendshipMigration(migrationStore.friendshipMigration());
  if (migrationPreview.status !== "ready") throw Error(JSON.stringify(migrationPreview));
  assert.equal((await migrationApp.confirmFriendshipMigration(migrationPreview.handle)).status,"applied");
  assert.equal((await migrationApp.confirmFriendshipMigration(migrationPreview.handle)).status,"already-applied");
  assert.equal(migrationState.read().party[0]!.friendship,255);

  // The author CLI is resolved through package exports and runs from this external cwd.
  const cli = require.resolve("@pokemon-framework/engine/content-cli");
  const output = path.join(process.cwd(), "consumer-output/progression.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  for (const command of ["build", "check"]) {
    const run = childProcess.spawnSync(process.execPath, [cli, command, "--src=content/examples/progression", `--out=${output}`], { cwd: process.cwd(), encoding: "utf8", env: process.env });
    assert.equal(run.status, 0, `${command}\n${run.stdout}${run.stderr}`);
  }
  const progression = JSON.parse(fs.readFileSync(output, "utf8")) as { contentId: string; species: unknown[] };
  assert.equal(progression.contentId, "progression-example");
  assert.ok(progression.species.length > 0);

  console.log(JSON.stringify({
    ok: true,
    digest,
    claimWrites: state.replaced.length,
    recoveryWrites: refusedState.replaced.length,
    projection: projectedRetry.projection,
    realShowdown: "run/applied/already-applied",
    cli: progression.contentId,
    nominalIdentity: "production/testing/legacy",
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
