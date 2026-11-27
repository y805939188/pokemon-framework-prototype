'use strict';
// Two plugins in a Node VM with small MZ stubs (NOT the real MZ host; that is the flow test): PS_SaveState
// migrates a save written by the schema-3 writer to schema 4 through the content mapping, refuses (keeping the original)
// when the content is missing or cannot map a species, and needs no content for a schema 4 save; a load or a new game
// releases a battle the application still held (P4-2); the step counter hook (WP06 §4.1: not on a forced route or
// while an event runs); species names by content id; the ResetGame test aid stores the fixture party by content id.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { types } = require('node:util');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../../..');
const E = require('../../../js/engine/build/engine.cjs');
const SRC = path.join(ROOT, 'content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
const J = x => JSON.parse(JSON.stringify(x));
const schema3 = f => JSON.parse(fs.readFileSync(path.join(__dirname, '../../support/saves/schema-v3', f), 'utf8'));
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };

let dir, stage, stageFailure, stampedEvidence, stampedLogHashes;
const plugins = {};
const stampedLogNames = ['PS_BattleFlow', 'PS_SaveLocation', 'PS_World'].map(name => name + '.isolated-build.log');

function stampedLogSnapshot() {
  assert.equal(typeof process.getuid, 'function', 'stamped log reads require an effective owner check');
  const owner = BigInt(process.getuid());
  const statOptions = { bigint: true };
  const privateEntry = stat => (stat.mode & 0o077n) === 0n && stat.uid === owner;
  // Reading can update atime; bind identity and write timestamps instead.
  const receipt = s => [s.dev, s.ino, s.mode, s.uid, s.nlink, s.size, s.mtimeNs, s.ctimeNs, s.birthtimeNs];
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
  assert(Number.isInteger(O_RDONLY) && O_NOFOLLOW > 0 && O_NONBLOCK > 0, 'stamped log reads require read-only, no-follow and nonblocking open');
  const root = fs.lstatSync(stampedEvidence, statOptions);
  assert(root.isDirectory() && privateEntry(root) && fs.realpathSync(stampedEvidence) === stampedEvidence, 'stamped logs require a private real directory');
  const names = fs.readdirSync(stampedEvidence).sort();
  assert(names.length <= stampedLogNames.length, 'too many stamped build logs');
  return names.map(name => {
    assert(stampedLogNames.includes(name), 'unexpected file in the stamped build log directory');
    const file = path.join(stampedEvidence, name), named = fs.lstatSync(file, statOptions);
    const regular = s => s.isFile() && s.nlink === 1n && privateEntry(s) && s.size >= 0n && s.size <= 2097152n;
    assert(regular(named), 'stamped build log must be a private regular file no larger than 2 MiB');
    const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd, statOptions);
      assert(regular(before), 'opened stamped log must be private, regular and bounded');
      const expected = receipt(before);
      assert.deepEqual(expected, receipt(named), 'stamped log changed during open');
      const bytes = Buffer.alloc(Number(before.size));
      for (let offset = 0; offset < bytes.length;) {
        const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
        assert(read > 0, 'stamped log ended before its recorded size');
        offset += read;
      }
      assert.deepEqual(receipt(fs.fstatSync(fd, statOptions)), expected, 'opened stamped log changed during read');
      assert.deepEqual(receipt(fs.lstatSync(file, statOptions)), expected, 'named stamped log changed during read');
      return [name, createHash('sha256').update(bytes).digest('hex')];
    } finally {
      fs.closeSync(fd);
    }
  });
}

test.before(() => {
  dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'pf-plugin-host5-'));
  const ordinaryEnv = { ...process.env };
  delete ordinaryEnv.RR_ISOLATED_TEST_STAGE;
  for (const name of ['PS_SaveState', 'PS_BattleFlow', 'PS_Management']) {
    const built = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', path.join(dir, name)], { cwd: ROOT, env: { ...ordinaryEnv, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    plugins[name] = fs.readFileSync(path.join(dir, name, `${name}.js`), 'utf8');
    assert.doesNotMatch(plugins[name], /^\/\/ PF-SCOPED-IIFE-v1 /m, 'ordinary plugin build must be unmarked');
  }
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
test.after(() => {
  if (stampedEvidence) {
    const logs = stampedLogSnapshot();
    if (stampedLogHashes) assert.deepEqual(logs, stampedLogHashes, 'stamped build logs stayed identical');
    console.log('host5 stamped build logs retained:', JSON.stringify({ directory: stampedEvidence, files: logs.length }));
  }
  stage?.verify();
});

function host(game, missingTesting = false, scoped = null) {
  const Ctor = () => { function C() {} C.prototype = { initialize() {}, terminate() {} }; return C; };
  const errors = [], warnings = [], writes = [], loads = [];
  // The VM's ordinary business entropy asks Node for an in-place fill, not a PSFlow test override.
  const entropyWord = lcg(1);
  let fills = 0;
  const crypto = {
    randomFillSync(words) {
      assert(types.isUint32Array(words), 'Node entropy receives a Uint32Array from the VM');
      assert.equal(words.length, 2);
      for (let i = 0; i < words.length; i++) words[i] = entropyWord(0x100000000);
      fills++;
      return words;
    },
  };
  function Game_System() {}
  Game_System.prototype.isSaveEnabled = function () { return this._saveEnabled !== false; };
  const sys = Object.assign(new Game_System(), { _psGame: game, _psBattleSeq: 0 });
  const req = p => {
    loads.push(p);
    if (p === 'path' || p === 'fs' || p === 'node:util') return require(p);
    if (p === 'node:crypto') return crypto;
    if (scoped && (p === 'node:fs' || p === 'node:path')) return require(p);
    if (scoped && p === 'os') return { homedir() { throw new Error('host5 never uses an owner save directory'); } };
    if (/production\.cjs$/.test(p)) return require(path.join(ROOT, 'js/engine/build/production.cjs'));
    if (/testing\.cjs$/.test(p)) {
      if (missingTesting) throw new Error('testing dependency unavailable (injected)');
      return require(path.join(ROOT, 'js/engine/build/testing.cjs'));
    }
    throw new Error('unexpected require ' + p);
  };
  req.resolve = p => scoped && p === './js/plugins.js' ? scoped.manifest : path.resolve(ROOT, p);
  function Game_Player() { this._base = 0; this._forcing = false; }
  Game_Player.prototype = { increaseSteps() { this._base++; }, isMoveRouteForcing() { return this._forcing; }, executeEncounter() { return false; }, makeEncounterCount() {}, regionId: () => 0 };
  const map = { running: false, mapId: () => 5, isEventRunning() { return map.running; } };
  const ctx = {
    Error, performance, require: req, console: { log() {}, warn: (...a) => warnings.push(a.map(String).join(' ')), error: (...a) => errors.push(a.map(String).join(' ')) },
    PluginManager: { parameters: () => ({}), registerCommand() {} },
    Game_Interpreter: Ctor(), Window_Base: Ctor(), Window_Command: Ctor(), Scene_MenuBase: Ctor(), Game_Player, Game_System,
    // the base save counts every write that reaches MZ (it never touches a file)
    DataManager: { extractSaveContents() {}, saveGame(id) { writes.push(id); return Promise.resolve(0); }, makeSaveContents: () => ({}), setupNewGame() {} },
    SceneManager: { push() {}, isSceneChanging: () => false }, Graphics: { frameCount: 0 }, Utils: { extractFileName: x => x },
    $gameSystem: sys, $gameVariables: { setValue() {}, value: () => 0 }, $gameMap: map, $gamePlayer: { reserveTransfer() {} }, $dataMapInfos: [], $dataCommonEvents: [],
    $gameMessage: { isBusy: () => false, add() {} },
  };
  require('../../../scripts/tests/legacy-mz-world-host.cjs').install(ctx);
  ctx.window = ctx;
  if (scoped) {
    ctx.nw = { App: { argv: [...scoped.argv], dataPath: scoped.profile, manifest: { name: 'Headless-Host5-Synthetic' } } };
    ctx.process = { platform: process.platform };
    ctx.StorageManager = { fileDirectoryPath() { throw new Error('unbound host5 storage'); } };
  }
  vm.createContext(ctx);
  if (scoped) {
    const file = scoped.artifacts.PS_SaveLocation;
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'PS_SaveLocation.js (stamped)' });
    assert.equal(ctx.StorageManager.fileDirectoryPath(), scoped.saves + path.sep, 'SaveLocation installed this stage storage');
  }
  vm.runInContext(plugins.PS_SaveState, ctx, { filename: 'PS_SaveState.js (built)' });
  const battleFlow = scoped ? fs.readFileSync(scoped.artifacts.PS_BattleFlow, 'utf8') : plugins.PS_BattleFlow;
  vm.runInContext(battleFlow, ctx, { filename: scoped ? 'PS_BattleFlow.js (stamped)' : 'PS_BattleFlow.js (built)' });
  const flow = ctx.PSFlow;
  flow.receiveOptions = { mode: 1, naming: 1 }; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.rng = lcg(1);
  const load = (next) => { if (next !== undefined) sys._psGame = next; ctx.DataManager.extractSaveContents({}); };
  return { ctx, flow, sys, map, errors, warnings, writes, loads, load, entropyFills: () => fills, player: new Game_Player() };
}

function stampedHost(game, missingTesting = false) {
  // Lazy: an ordinary-only selection never builds or loads the stamped variant.
  if (stageFailure) throw stageFailure;
  try {
    if (!stage) {
      stampedEvidence = fs.mkdtempSync(path.join(path.dirname(dir), 'pf-plugin-host5-stamped-logs-'));
      console.log('host5 stamped build log directory:', JSON.stringify(stampedEvidence));
      assert.deepEqual(stampedLogSnapshot(), [], 'stamped log directory starts empty');
      try {
        stage = require('../../../scripts/tests/battle-defeat-f-isolated.cjs').prepare(ROOT, stampedEvidence);
      } finally {
        stampedLogHashes = stampedLogSnapshot();
      }
      assert.deepEqual(stampedLogHashes.map(([name]) => name), stampedLogNames, 'successful stamped build emitted every raw log');
    }
    assert.equal(stage.scope, 'EXPLICIT_ISOLATED_LEGACY_FIXTURE_NOT_ORDINARY');
    stage.verify();
  } catch (error) {
    stageFailure = error;
    throw error;
  }
  return host(game, missingTesting, stage);
}

// Public cold-load contract: do not pre-inject content; use the actual PluginManager contentSource parameter.
function coldHost(mode, missingTesting = false, createHost = host) {
  const h = createHost(E.state.newGame({ content, party: [], money: 0 }), missingTesting);
  h.flow._content = null; h.flow._dex = null;
  h.ctx.PluginManager.parameters = () => ({ contentSource: mode });
  return h;
}

function pendingReception(app, receipt) {
  assert.equal(receipt.status, 'pending', JSON.stringify(receipt));
  const pending = app.pendingReceiving;
  assert.ok(pending, 'pending receipt has an active receiving operation');
  assert.equal(pending.token, receipt.token);
  assert.ok(pending.members.length > 0, 'the operation has a member to receive');
  return pending;
}

function claimInOrdinaryHost(h, grantId) {
  const app = h.flow.app(), before = JSON.stringify(h.sys._psGame);
  const pending = pendingReception(app, h.flow.claim(grantId));
  assert.deepEqual(J(pending.profile), { mode: 0, naming: 0 }, 'direct host retains ordinary receiving policy');
  assert.equal(JSON.stringify(h.sys._psGame), before, 'a pending grant has not installed state');
  const decisions = Object.fromEntries(pending.members.map(({ id }) => [id, { nickname: { kind: 'keep' } }]));
  const done = h.flow.resolveReceiving(pending.token, decisions);
  assert.equal(done.status, 'applied', JSON.stringify(done));
  return done;
}

function assertEncounterPush(h, pushes, expected) {
  const outcome = h.flow.lastEncounter;
  assert.equal(pushes, expected, JSON.stringify({ encounter: outcome?.reason, error: outcome?.error ?? h.flow.lastOutcome?.error }));
}

function assertSessionSeed(h, battleId, expected) {
  const rows = h.flow.logger.entries().filter(row => row.battleId === battleId && row.kind === 'session.create');
  assert.equal(rows.length, 1, 'the real session reported its creation');
  assert.deepEqual(J(rows[0].data.seed), expected);
}

test('a save written by the schema-3 writer loads: migrated to schema 4 with the content mapping, reported in _psSaveInfo', () => {
  const raw = schema3('full.json');
  const h = host(J(raw));
  h.load();
  assert.equal(h.sys._psSaveError, undefined, JSON.stringify(h.sys._psSaveError));
  assert.deepEqual(J(h.sys._psSaveInfo).from, 3); assert.equal(h.sys._psSaveInfo.to, E.state.GAME_SCHEMA); assert.equal(h.sys._psSaveInfo.migrated, true);
  const g = J(h.sys._psGame);
  assert.deepEqual(g.party.map(m => [m.species, m.form]), raw.party.map(m => [E.speciesKey.keyOfBattleName(content, m.species).species, 0]));
  assert.deepEqual(E.saveSchema.validateGame(g), []);
  assert.equal(h.flow.app().claimGrant('starter').status, 'already-claimed', 'the claim survived the migration');
});

test('content that cannot be loaded, or a species it cannot map: the migration is refused and the original state stays as loaded', () => {
  const a = host(schema3('full.json')); const before = JSON.stringify(a.sys._psGame);
  a.flow.speciesKeyResolver = () => { throw new Error('content: cannot read data/framework/content.json'); };
  a.load();
  assert.equal(a.sys._psSaveError.code, 'needs-content');
  assert.match(a.sys._psSaveError.message, /the content could not be loaded.*content: cannot read/);
  assert.equal(JSON.stringify(a.sys._psGame), before, 'the raw document is kept, so saving writes it back unchanged');
  assert.throws(() => a.ctx.DataManager.makeSaveContents(), /state-unusable/); assert.equal(JSON.stringify(a.sys._psGame), before);
  assert.throws(() => a.flow.game(), /not usable \(needs-content\)/, 'no battle or grant runs on it');
  const raw = schema3('full.json'); raw.boxes[0].species = 'Mew';
  const b = host(J(raw)); const b0 = JSON.stringify(b.sys._psGame);
  b.load();
  assert.equal(b.sys._psSaveError.code, 'unmapped-species');
  assert.deepEqual(J(b.sys._psSaveError.problems).map(p => p.path), ['$.boxes[0].species']);
  assert.equal(JSON.stringify(b.sys._psGame), b0);
});

test('current schema7 and empty legacy host both require current content before loading', () => {
  const h = host(E.state.newGame({content, party: [], money: 7}));
  const raw = h.sys._psGame; h.flow.content = () => {throw Error('content unavailable');}; h.load();
  assert.equal(h.sys._psGame,raw); assert.equal(h.sys._psSaveError.code,'needs-content');
  const e = host(undefined); e.load();
  assert.deepEqual([e.sys._psGame.schema,e.sys._psSaveInfo.created],[E.state.GAME_SCHEMA,'empty']);
});

test('P4-2: loading a save (or starting a new game) releases a battle the application still held', async () => {
  const h = host(E.state.newGame({ content, party: [], money: 0 }));
  claimInOrdinaryHost(h, 'starter');
  h.flow.seed = [1, 2, 3, 4];
  await h.flow.app().startBattle({ battleId: 'open#1', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 1 });
  assert.equal(h.flow.app().healParty().reason, 'battle-active');
  h.sys._psGame = J(schema3('defeat.json')); h.load();
  assert.notEqual(h.flow.app().healParty().reason, 'battle-active', 'released by the load');
  await h.flow.app().startBattle({ battleId: 'open#2', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 2 });
  const previous = h.sys._psGame;
  h.ctx.DataManager.setupNewGame();
  assert.equal(h.sys._psInitError, undefined);
  assert.notEqual(h.sys._psGame, previous, 'a new game replaced the loaded state');
  assert.deepEqual(J(h.sys._psGame.party), [], 'the new game installs an empty party');
  assert.equal(claimInOrdinaryHost(h, 'starter').status, 'applied', 'released by the new game, which installed an empty state');
});

test('WP06 §4.1 step counter: a normal step counts; a forced move route or a running event does not', async () => {
  // 5.5 counts completed interpolation. Actual pinned Game_Player.increaseSteps
  // remains the native start callback, and must not commit the framework prefix.
  const h=await require('../../support/world/mz-native-frame-support.cjs').fixture(),p=h.player;
  p._base=0;const native=h.G.Game_Character.prototype.increaseSteps;
  h.G.Game_Character.prototype.increaseSteps=function(...args){this._base++;return Reflect.apply(native,this,args);};
  p.directionInput=6;h.tick();p.directionInput=0;
  assert.equal(p._base,1);assert.equal(h.state().steps,0,'start is not completed movement');
  while(p.isMoving())h.tick();await h.settle();assert.equal(h.state().steps,1);
  h.complete();await h.settle();
  assert.deepEqual([p._base,h.state().steps],[2,2],"MZ's own step handling still runs");
  p._forcing=true;p.moveStraight(6);while(p.isMoving())h.tick();h.tick();await h.settle();p._forcing=false;
  h.map.running=true;p.moveStraight(6);while(p.isMoving())h.tick();h.tick();await h.settle();h.map.running=false;
  assert.deepEqual([p._base,h.state().steps],[4,2]);
  h.app.ports.state.replace({...h.state(),steps:2147483647});h.complete();await h.settle();assert.equal(h.state().steps,0,'wraps at 2^31');
  const before=h.state().steps,draws=h.draws.length,nativeDraws=h.nativeDraws.length;
  p.setDirection(8);p.passable=false;h.complete();await h.settle();p.passable=true;
  assert.equal(h.state().steps,before,'turn/wall do not add completed steps');assert.equal(h.draws.length,draws);assert.equal(h.nativeDraws.length,nativeDraws);
});
test('WP06 explicit PSFlow.steps compatibility API reports an unusable state once without pretending native completion',()=>{
 const h=host(E.state.newGame({content,party:[],money:0}));h.sys._psSaveError={code:'invalid',message:'x'};h.flow.steps(1);h.flow.steps(1);
 assert.equal(h.warnings.filter(w=>/steps not counted/.test(w)).length,1,'an unusable state is reported once, not every step');
});

test('species names by content id + form or by battle name; ResetGame stores the fixture party by content id', () => {
  const ordinary = host(E.state.newGame({ content, party: [], money: 0 }));
  const byId = ordinary.flow.speciesName('charmander', 0), byBattle = ordinary.flow.speciesName('Charmander');
  assert.equal(byId, byBattle); assert.notEqual(byId, 'charmander', 'the content text key is used');
  assert.equal(ordinary.flow.speciesName('nope'), 'nope', 'an unknown name is shown as given');
  assert.ok(ordinary.loads.some(p => /production\.cjs$/.test(p)), 'ordinary sample work loads the production entry');
  assert.equal(ordinary.loads.some(p => /testing\.cjs$/.test(p)), false, 'ordinary sample work never eagerly loads testing');

  const h = stampedHost(E.state.newGame({ content, party: [], money: 0 }));
  h.flow.resetGame();
  assert.ok(h.loads.some(p => /testing\.cjs$/.test(p)), 'the explicit ResetGame aid loads testing');
  assert.deepEqual(J(h.sys._psGame).party.map(m => [m.species, m.form]), [['charizard', 0], ['blastoise', 0], ['venusaur', 0]]);
  assert.deepEqual(E.saveSchema.validateGame(J(h.sys._psGame)), []);
});

test('cold explicit fixture content uses testing once and keeps the same cached object', () => {
  const h = coldHost('fixture', false, stampedHost);
  const first = h.flow.content();
  assert.equal(first, E.fixtures.content);
  assert.notEqual(first, content, 'fixture mode must not silently substitute the compiled sample');
  assert.equal(h.loads.filter(p => /testing\.cjs$/.test(p)).length, 1);
  assert.equal(h.flow.content(), first);
  assert.equal(h.flow.content(), first);
  assert.equal(h.loads.filter(p => /testing\.cjs$/.test(p)).length, 1, 'cached content does not reload testing');
  assert.equal(h.loads.some(p => /build\/engine\.cjs|fixtures\/game\.cjs|game\/describe\.cjs/.test(p)), false, 'no legacy fallback');
});

test('cold explicit fixture ResetGame creates the valid fixture party and repeated reset does not duplicate it', () => {
  const h = coldHost('fixture', false, stampedHost);
  h.flow.resetGame();
  assert.equal(h.flow._content, E.fixtures.content);
  assert.equal(h.sys._psGame.party.length, 3);
  assert.deepEqual(E.saveSchema.validateGame(J(h.sys._psGame)), []);
  h.flow.resetGame();
  assert.equal(h.sys._psGame.party.length, 3);
  assert.equal(h.flow.content(), E.fixtures.content);
  assert.equal(h.loads.filter(p => /testing\.cjs$/.test(p)).length, 1);
  assert.deepEqual(E.saveSchema.validateGame(J(h.sys._psGame)), []);
});

test('cold sample and the formal empty new game avoid testing; explicit sample ResetGame loads it once', () => {
  function formalSample(h) {
    const loaded = h.flow.content();
    assert.equal(loaded.meta.id, 'sample');
    assert.equal(h.loads.some(p => /testing\.cjs$/.test(p)), false);
    h.flow.startNewGame();
    assert.equal(h.sys._psInitError, undefined);
    assert.deepEqual(J(h.sys._psGame.party), []);
    assert.equal(h.loads.some(p => /testing\.cjs$/.test(p)), false, 'the formal empty new game does not use fixtures');
    return loaded;
  }
  formalSample(coldHost('sample'));
  const h = coldHost('sample', false, stampedHost);
  const loaded = formalSample(h);
  h.flow.resetGame();
  assert.equal(h.sys._psGame.party.length, 3);
  assert.equal(h.flow.content(), loaded, 'sample ResetGame retains the cached sample content');
  assert.equal(h.loads.filter(p => /testing\.cjs$/.test(p)).length, 1, 'only the explicit test aid loads testing');
  assert.deepEqual(E.saveSchema.validateGame(J(h.sys._psGame)), []);
});

test('missing explicit testing fails accurately for content and ResetGame without sample or state fallback', () => {
  for (const method of ['content', 'resetGame']) {
    const h = coldHost('fixture', true, stampedHost), before = J(h.sys._psGame);
    assert.throws(() => method === 'content' ? h.flow.content() : h.flow.resetGame(), /testing dependency unavailable \(injected\)/);
    assert.equal(h.flow._content, null, `${method}: no sample or other content is fabricated`);
    assert.deepEqual(J(h.sys._psGame), before, `${method}: failure does not invent or replace game state`);
    assert.equal(h.loads.filter(p => /testing\.cjs$/.test(p)).length, 1, `${method}: the explicit dependency was attempted`);
    assert.equal(h.loads.some(p => /build\/engine\.cjs|fixtures\/game\.cjs|game\/describe\.cjs/.test(p)), false, `${method}: no legacy fallback`);
  }
});

// ---- review of 1960b92 (2026-10-22): F01 save refusal, F02 host battle operation, F10 own keys, F11 clock

test('F01: while the loaded state is unusable every save is refused before MZ writes anything (slot named); a good load clears it', async () => {
  const raw = schema3('full.json'); raw.boxes[0].species = 'Mew';
  const h = host(J(raw)); const before = JSON.stringify(h.sys._psGame);
  h.load();
  assert.equal(h.sys._psSaveError.code, 'unmapped-species');
  for (const slot of [15, 3]) {
    await assert.rejects(h.ctx.DataManager.saveGame(slot), e => new RegExp(`slot ${slot} is refused.*unmapped-species.*nothing was written`).test(e.message));
    assert.deepEqual([h.ctx.PSState.lastSaveError.code, h.ctx.PSState.lastSaveError.savefileId], ['state-unusable', slot]);
  }
  assert.deepEqual(h.writes, [], 'nothing reached the MZ save');
  assert.equal(JSON.stringify(h.sys._psGame), before, 'the original framework state is kept');
  assert.equal(h.sys.isSaveEnabled(), false, 'the save menu is masked');
  h.load(J(schema3('defeat.json')));
  assert.equal(h.sys._psSaveError, undefined);
  assert.equal(h.sys.isSaveEnabled(), true);
  await h.ctx.DataManager.saveGame(15);
  assert.deepEqual(h.writes, [15], 'after a good load saving works again');
});

async function openedBattle(h, battleId = 'old#1', seq = 1) {
  // These lifecycle cases require an already decided ordinary battle, not a particular RNG seed.
  // Lv5 Charmander is strictly faster than any legal Lv1 Pidgey; the real escape rule is certain.
  const req = { battleId, kind: 'wild', foes: [{ species: 'pidgey', level: 1 }], seq, resultVariable: 7 };
  h.flow.openBattle(req);
  const op = h.flow._op;
  const session = await h.flow.begin();
  return { req, op, session, scene: { _psOp: op, _session: session, popScene() {} } };
}

async function escapeNormally(session) {
  assert.equal(session.finished, false);
  assert.equal((await session.run()).ok, true);
  assert.equal(session.finished, true);
  assert.equal(session.ended?.reason, 'run');
}

test('F02: openBattle -> begin -> a save is loaded: the host operation ends (not running, saving allowed), the next battle opens and saves work', async () => {
  const h = host(E.state.newGame({ content, party: [], money: 0 }));
  claimInOrdinaryHost(h, 'starter');
  const old = await openedBattle(h);
  assert.equal(h.flow.running, true);
  assert.equal(h.sys.isSaveEnabled(), false, 'the battle masks saving');
  await assert.rejects(h.ctx.DataManager.saveGame(1), /battle is running/);
  const loaded = J(schema3('defeat.json'));
  h.load(loaded);
  assert.deepEqual([h.flow.running, h.flow._op, h.flow.request], [false, null, null], 'the host operation is over');
  assert.deepEqual([h.flow.lastOutcome.replaced, h.flow.lastOutcome.commit, h.flow.lastOutcome.battleId], [true, 'none', 'old#1']);
  assert.equal(h.sys.isSaveEnabled(), true);
  await h.ctx.DataManager.saveGame(2);
  assert.deepEqual(h.writes, [2], 'saving works');
  assert.equal(h.flow.app().healParty().reason === 'battle-active', false, 'the application released its lock as well');
  const next = await openedBattle(h, 'next#2', 2);
  assert.equal(h.flow.running, true, 'the next battle opened');
  void old; void next;
});

test('F02: late finish / abort / close of the replaced battle neither commit, nor close, nor project into the next battle', async () => {
  const h = host(E.state.newGame({ content, party: [], money: 0 }));
  claimInOrdinaryHost(h, 'starter');
  const old = await openedBattle(h);
  await escapeNormally(old.session); // the old battle is decided (it ran away) but not ended yet
  h.load(J(schema3('defeat.json')));
  const stateAfterLoad = JSON.stringify(h.sys._psGame);
  const next = await openedBattle(h, 'old#1', 1); // a later battle, even under the same id (the loaded save's counter)
  const vars = []; h.ctx.$gameVariables.setValue = (k, v) => vars.push([k, v]);
  let popped = 0; old.scene.popScene = () => { popped++; };
  // the old scene ends: its finish, its abort and its terminate must not reach the next battle
  h.ctx.Scene_PSBattle.prototype.onEnd.call(old.scene);
  assert.match(h.flow.lastStale.what, /finish/);
  assert.equal(popped, 0, 'a late end must not pop the current scene from the host stack');
  h.flow.finish(old.session, old.op); // the direct host API also needs its own guard
  assert.equal(h.flow.lastStale.what, 'finish');
  h.ctx.Scene_PSBattle.prototype.abort.call({ ...old.scene, _queue: [], refreshStatus() {} }, new Error('old scene failed'));
  assert.equal(h.flow.lastStale.what, 'abort');
  h.ctx.Scene_PSBattle.prototype.terminate.call(old.scene);
  h.flow.close(0, old.op);
  assert.equal(h.flow.lastStale.what, 'close');
  assert.deepEqual([h.flow.running, h.flow._op === next.op], [true, true], 'the next battle is still open');
  assert.deepEqual(vars, [], 'nothing was projected');
  assert.equal(JSON.stringify(h.sys._psGame), stateAfterLoad, 'nothing was committed into the loaded state');
  // the next battle itself ends normally
  await escapeNormally(next.session);
  h.ctx.Scene_PSBattle.prototype.onEnd.call(next.scene);
  assert.deepEqual([h.flow.lastOutcome.code, h.flow.lastOutcome.commit, h.flow.running], [3, 'applied', false]);
  assert.deepEqual(vars, [[7, 3]], 'only the next battle projected its outcome');
});

test('F02: an application session of a replaced state never commits, also when it had finished before', async () => {
  const h = host(E.state.newGame({ content, party: [], money: 0 }));
  claimInOrdinaryHost(h, 'starter');
  const done = await openedBattle(h);
  await escapeNormally(done.session);
  h.ctx.Scene_PSBattle.prototype.onEnd.call(done.scene);
  assert.equal(h.flow.lastOutcome.commit, 'applied');
  h.load(J(schema3('defeat.json')));
  const loaded = JSON.stringify(h.sys._psGame);
  const again = h.flow.app().finishBattle(done.session, done.req);
  assert.deepEqual([again.commit, again.aborted], ['none', true], 'a session of the old state is not committed into the loaded one');
  assert.equal(JSON.stringify(h.sys._psGame), loaded);
});

test('F10: a content id that is also an Object.prototype name ("constructor") is shown by its translated name, also in the grant message', () => {
  const src = { manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') };
  src.species.find(sp => sp.id === 'charmander').id = 'constructor';
  src.grants[0].id = 'constructor'; src.grants[0].members[0].species = 'constructor';
  const ct = E.contentRuntime.assembleContent(E.contentCompile.compileContent(src).data, E.dex.createDexLookup()).content;
  const h = host(E.state.newGame({ content: ct, party: [], money: 0 }));
  h.flow._content = ct;
  const grant = claimInOrdinaryHost(h, 'constructor');
  assert.equal(grant.status, 'applied');
  const shown = h.flow.speciesName('constructor', 0);
  assert.equal(shown, h.flow.speciesName('Charmander'));
  assert.notEqual(shown, 'constructor');
  assert.ok(h.flow.claimLines(grant).some(l => l.includes(shown)) && !h.flow.claimLines(grant).some(l => l.includes('constructor')), JSON.stringify(h.flow.claimLines(grant)));
  assert.equal(h.flow.speciesName('toString'), 'toString', 'an inherited name is not a species');
});

test('F11: the application reads the time from the injected clock; the plugin wires the host clock and tests may pin it', () => {
  const game = () => E.state.newGame({ content, party: [], money: 0 });
  const ordinary = host(game());
  const t0 = Date.now(); const t = ordinary.flow.app().now(); const t1 = Date.now();
  assert.ok(t >= t0 && t <= t1, 'by default the host clock');
  ordinary.flow.clock = () => { throw new Error('ordinary VM unexpectedly used a test clock'); };
  const before = Date.now(), actual = ordinary.flow.app().now();
  assert.ok(actual >= before && actual <= Date.now(), 'ordinary mode ignores the test clock');

  const h = stampedHost(game()), draws = [];
  h.flow.clock = () => 1234567890123;
  h.flow.rng = n => { draws.push(n); return 7; };
  const app = h.flow.app(), fills = h.entropyFills();
  assert.equal(app.now(), 1234567890123, 'a pinned clock');
  assert.equal(app.startNewGame().status, 'started');
  assert.deepEqual(draws, [65536, 65536], 'the real App uses the stamped RNG for both trainer ID words');
  assert.equal(h.sys._psGame.player.id, 7 * 65536 + 7);
  assert.equal(h.entropyFills(), fills, 'a stamped RNG does not draw from ordinary entropy');
});

for (const id of ['old#1', 'different#2']) test(`R01: default and explicit finish reject a replaced session while ${id} keeps both save locks`, async () => {
  const h = host(E.state.newGame({ content, party: [], money: 0 })); claimInOrdinaryHost(h, 'starter');
  const old = await openedBattle(h); await escapeNormally(old.session);
  h.load(J(schema3('defeat.json')));
  const next = await openedBattle(h, id, 2);
  const before = JSON.stringify(h.sys._psGame), outcome = h.flow.lastOutcome, result = h.flow.lastResult;
  const vars = []; h.ctx.$gameVariables.setValue = (k, v) => vars.push([k, v]);
  for (const finish of [() => h.flow.finish(old.session), () => h.flow.finish(old.session, next.op), () => h.flow.finish(old.session, old.op)]) {
    assert.equal(finish().commit, 'none');
    assert.deepEqual([h.flow.running, h.flow._op === next.op, h.sys.isSaveEnabled()], [true, true, false]);
    assert.equal(h.flow.app().healParty().reason, 'battle-active', 'application and host still agree');
    assert.equal(h.flow.lastOutcome, outcome); assert.equal(h.flow.lastResult, result);
    assert.equal(JSON.stringify(h.sys._psGame), before); assert.deepEqual(vars, []);
    await assert.rejects(h.ctx.DataManager.saveGame(17), /battle is running/);
    assert.deepEqual(h.writes, [], 'zero underlying saves after every rejected late call');
  }
  await escapeNormally(next.session);
  const done = h.flow.finish(next.session); // retain the supported one-argument API
  assert.deepEqual([done.code, done.commit, h.flow.running, h.sys.isSaveEnabled()], [3, 'applied', false, true]);
  assert.deepEqual(vars, [[7, 3]]);
  const settled = JSON.stringify(h.sys._psGame);
  assert.equal(h.flow.finish(next.session).commit, 'already-applied');
  assert.equal(JSON.stringify(h.sys._psGame), settled);
  await h.ctx.DataManager.saveGame(17); assert.deepEqual(h.writes, [17]);
});

for (const replacement of ['load', 'new-game', 'none']) test(`R02: failed defeat return belongs to its timeline (${replacement})`, async () => {
  const m = E.memberFactory.createMember({ id: 'S-1', species: 'Snorlax', level: 2 }, content, lcg(3)); m.hp = 1;
  const h = stampedHost(E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(m, content)], money: 1000 }));
  h.ctx.PluginManager.parameters = () => ({ homeMapId: '5', homeX: '8', homeY: '9' }); h.ctx.$dataMapInfos[5] = {};
  const transfers = []; h.ctx.$gamePlayer.reserveTransfer = (...a) => transfers.push(a);
  h.flow.seed = [1, 2, 3, 4];
  h.flow.openBattle({ kind: 'wild', foes: [{ species: 'pidgey', level: 30 }], seq: 1, battleId: 'lost#1' });
  const session = await h.flow.begin(); await session.chooseMove(1);
  h.flow.debug.failReturn = true;
  const lost = h.flow.finish(session);
  assert.deepEqual([lost.code, lost.commit, h.sys._psGame.money], [4, 'applied', 984], JSON.stringify({ returnStatus: h.flow.lastReturn?.status, error: lost.error }));
  assert.ok(h.sys._psGame.party[0].hp > 1, 'defeat already healed the party');
  assert.equal(lost.blackout, true);
  assert.equal(h.flow.app().isBattleBlackoutRouted(session, lost.battleId), false, 'R02 legacy retry coverage is unresolved if the App owns this defeat through the F route');
  assert.equal(h.flow.pendingReturn?.status, 'failed');
  assert.equal(h.flow.pendingReturn.error, 'injected return failure');
  assert.equal(h.flow.debug.failReturn, false, 'the selected legacy route consumed the fault');
  assert.deepEqual(transfers, [], 'failed legacy return made no native transfer');
  const diagnostic = h.flow.lastReturn;
  if (replacement === 'load') h.load(J(schema3('defeat.json')));
  if (replacement === 'new-game') h.ctx.DataManager.setupNewGame();
  const before = JSON.stringify(h.sys._psGame);
  if (replacement !== 'none') {
    assert.equal(h.flow.pendingReturn, null); assert.equal(h.flow.request, null);
    assert.equal(h.flow.lastReturn, diagnostic, 'historical diagnostic can remain, executable request cannot');
  }
  assert.equal(h.flow.retryReturnHome().status, replacement === 'none' ? 'requested' : 'none');
  assert.deepEqual(transfers, replacement === 'none' ? [[5, 8, 9, 2, 0]] : []);
  assert.equal(h.flow.retryReturnHome().status, 'none');
  assert.equal(transfers.length, replacement === 'none' ? 1 : 0);
  assert.equal(JSON.stringify(h.sys._psGame), before, 'retry never settles money/heal again');
});

// 5.1 intermediate C/D/E host boundaries; actual UI presentation belongs to F after M review.
test('P51-07: schema4 1201 capacity failure keeps raw state and blocks all host save slots', async()=>{
  const H=require('../../support/application/legacy-test-support.cjs');const raw=H.legacyGame(E.fixtures.savedFor(E.fixtures.makeGame(),content),4);
  raw.boxes=Array.from({length:1201},(_,i)=>({...J(raw.party[0]),id:`B-${i}`}));const before=JSON.stringify(raw);const h=host(raw);h.load();
  assert.equal(h.sys._psSaveError.code,'capacity-exceeded');assert.deepEqual([h.sys._psSaveError.found,h.sys._psSaveError.boxMemberCount,h.sys._psSaveError.limit,h.sys._psSaveError.recovery],[4,1201,1200,'none-in-5.1']);assert.equal(JSON.stringify(h.sys._psGame),before);
  for(const slot of [1,2,17])await assert.rejects(h.ctx.DataManager.saveGame(slot),/not usable/);assert.deepEqual(h.writes,[]);assert.equal(h.sys.isSaveEnabled(),false);
});
test('P51-10a/21/22: held management masks menu/direct saves; cancel preserves committed edits; load invalidates old token',async()=>{
  const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));const app=h.flow.app(),token=app.beginManagement();const id=h.sys._psGame.party[0].id;
  assert.equal(app.manage(token,'pick',{kind:'pick-up',source:{id,position:{kind:'party',index:0}}}).status,'held');assert.equal(h.sys.isSaveEnabled(),false);
  await assert.rejects(h.ctx.DataManager.saveGame(3),/not allowed/);assert.deepEqual(h.writes,[]);
  assert.equal(app.manage(token,'mark',{kind:'markings',source:{id,position:{kind:'party',index:0}},markings:[2]}).status,'applied');assert.equal(app.manage(token,'cancel',{kind:'cancel-held'}).status,'cancelled');assert.equal(h.sys.isSaveEnabled(),true);assert.deepEqual(J(h.sys._psGame.party[0].markings),[2]);
  assert.equal(app.manage(token,'again',{kind:'pick-up',source:{id,position:{kind:'party',index:0}}}).status,'held');h.load();assert.equal(h.sys.isSaveEnabled(),true);assert.equal(app.manage(token,'old-place',{kind:'place-held',target:{kind:'box',box:0,slot:0},expectedTargetId:null}).reason,'stale-operation');
  const fresh=app.beginManagement();app.manage(fresh,'new-pick',{kind:'pick-up',source:{id,position:{kind:'party',index:0}}});assert.equal(app.manage(token,'old-cancel',{kind:'cancel-held'}).reason,'stale-operation');assert.equal(h.sys.isSaveEnabled(),false);app.manage(fresh,'new-cancel',{kind:'cancel-held'});app.endManagement(fresh);await h.ctx.DataManager.saveGame(3);assert.deepEqual(h.writes,[3]);
});
test('P51-14: real Showdown capture waits in host operation until decisions; duplicate resolve writes once',async()=>{
  const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.flow.receiveOptions={mode:1,naming:1};h.flow.seed=[1,2,3,4];const request={battleId:'host-receive#1',kind:'wild',seq:1,foes:[{species:'pidgey',level:3}],resultVariable:16};h.flow.openBattle(request);const session=await h.flow.begin();
  assertSessionSeed(h,request.battleId,null);
  assert.equal((await session.throwBall('masterball')).ok,true);const result=session.result();const before=JSON.stringify(h.sys._psGame);
  const pending=h.flow.finish(session);assert.equal(pending.pending,true);assert.equal(h.flow.running,true);assert.equal(h.sys.isSaveEnabled(),false);assert.equal(JSON.stringify(h.sys._psGame),before);await assert.rejects(h.ctx.DataManager.saveGame(5),/battle is running/);
  assert.deepEqual(J(h.flow.app().pendingReceiving.profile),{mode:0,naming:0},'ordinary capture ignores automatic test receiving options');
  const id=result.captured[0].id;const done=h.flow.resolveReceiving(pending.receivingToken,{[id]:{nickname:{kind:'keep'}}});assert.equal(done.commit,'applied');assert.equal(h.flow.running,false);assert.equal(h.sys.isSaveEnabled(),true);const committed=JSON.stringify(h.sys._psGame);assert.equal(h.flow.resolveReceiving(pending.receivingToken,{}).commit,'applied');assert.equal(JSON.stringify(h.sys._psGame),committed);assert.equal(h.sys._psGame.appliedBattles[request.battleId].hash,E.state.resultHash(result));assert.deepEqual(h.writes,[]);
});
test('P51-12: normal held entry opens without prematurely loading content',async()=>{
  const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.sys._psGame.party[0].item='leftovers';let loads=0;h.flow.content=()=>{loads++;throw Error('must not load content');};const request={battleId:'held#1',kind:'wild',seq:1,foes:[{species:'pidgey',level:3}]};assert.doesNotThrow(()=>h.flow.openBattle(request));assert.equal(loads,0);assert.equal(h.flow.running,true);assert(h.flow._op);h.flow.stateReplaced();
});

test('M04: present bad legacy metadata keeps raw hash and blocks menu plus every direct host save', async()=>{
  const H=require('../../support/application/legacy-test-support.cjs'); const hash=x=>require('node:crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex');
  for(const [field,value] of [['firstMoves','cut'],['ribbons','Champion'],['shiny',null],['owner',null],['markings',null],['origin',null]]){
    const raw=H.legacyGame(E.fixtures.savedFor(E.fixtures.makeGame(),content),4);raw.party[0][field]=value;const before=hash(raw),h=host(raw);h.load();
    assert.equal(h.sys._psSaveError.code,'invalid',field);assert.equal(hash(h.sys._psGame),before,field);assert.equal(h.sys.isSaveEnabled(),false);
    for(const slot of [1,3,17])await assert.rejects(h.ctx.DataManager.saveGame(slot),/not usable/);assert.deepEqual(h.writes,[]);assert.equal(hash(h.sys._psGame),before);
  }
});

test('P51-21/F: an unusable save opens the contained failure scene; begin/abort reports diagnosis without crashing the map interpreter',async()=>{
 const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.load({...h.sys._psGame,schema:E.state.GAME_SCHEMA+1});const before=JSON.stringify(h.sys._psGame),request={kind:'wild',foes:[{species:'pidgey',level:3}],seq:1,battleId:'unusable-host#1',resultVariable:7};
 assert.doesNotThrow(()=>h.flow.openBattle(request));assert.equal(h.flow.running,true);let failure;try{await h.flow.begin();}catch(e){failure=e;}assert.match(String(failure),/unknown-version/);h.flow.abort(failure,h.flow._op);assert.equal(h.flow.lastOutcome.aborted,true);assert.match(h.flow.lastOutcome.error,/unknown-version/);assert.equal(h.flow.running,false);assert.equal(JSON.stringify(h.sys._psGame),before);assert.equal(h.sys.isSaveEnabled(),false,'unusable save remains blocked after battle root closes');
});
test('P51-12/F: player-facing normal held entry opens without an obsolete refusal',()=>{
 const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.sys._psGame.party[0].item='leftovers';let loads=0;const messages=[],values=[];h.flow.content=()=>{loads++;throw Error('must not load content')};h.ctx.$gameMessage.add=s=>messages.push(s);h.ctx.$gameVariables.setValue=(id,value)=>values.push([id,value]);const request={battleId:'player-held#1',kind:'wild',foes:[{species:'pidgey',level:3}],seq:1,resultVariable:12};assert.equal(h.flow.tryOpenBattle(request),true);assert.equal(loads,0);assert.equal(h.flow.running,true);assert(h.flow._op);assert.deepEqual(values,[]);assert.equal(messages.length,0);h.flow.stateReplaced();
});


test('P51-14/F: full-party caught ending does not claim a box destination before the receiving decision',()=>{
 const game=E.fixtures.savedFor(E.fixtures.makeGame(),content);while(game.party.length<6){const m=J(game.party[0]);m.id='END-FILL-'+game.party.length;game.party.push(m);}const h=host(game),lines=[];
 const scene={_session:{ended:{reason:'caught',outcome:{target:'CAUGHT'}},foeTeam:[{id:'CAUGHT',species:'Pidgey'}]},_log:{add:s=>lines.push(s),fitText:s=>s},show(){}};h.ctx.Scene_PSBattle.prototype.showEnd.call(scene,false);assert.equal(lines.length,1);assert.match(lines[0],/Receive/);assert.doesNotMatch(lines[0],/sent to the boxes|cannot be opened/);
});
test('P51-14/F: automatic full-party capture announces its committed box once and resets notification ownership on load',async()=>{
 const game=E.fixtures.savedFor(E.fixtures.makeGame(),content);
 while(game.party.length<6){const m=J(game.party[0]);m.id='NOTICE-'+game.party.length;game.party.push(m);}
 const h=stampedHost(game),messages=[],seed=[1,2,3,4];
 h.ctx.$gameMessage.add=s=>messages.push(s);h.flow.seed=seed;h.flow.receiveOptions={mode:1,naming:1};
 const req={kind:'wild',foes:[{species:'pidgey',level:3}],seq:1,battleId:'box-notice#1'};
 h.flow.openBattle(req);const session=await h.flow.begin();
 assertSessionSeed(h,req.battleId,seed);
 assert.equal((await session.throwBall('masterball')).ok,true);assert.equal(messages.length,0);
 const result=h.flow.finish(session);assert.equal(result.commit,'applied');
 const id=h.flow.lastResult.captured[0].id;assert.match(messages[0],/Box 1/);
 assert.equal(h.flow.lastReceivingNotice.placements[0].id,id);
 assert.equal(h.flow.lastReceivingNotice.placements[0].to,'boxes');
 h.flow.notifyReceived([id],req.battleId);assert.equal(messages.length,1);
 h.flow.stateReplaced();h.flow.notifyReceived([id],req.battleId);assert.equal(messages.length,2);
});

test('J05: invalid nature/gender in schema4/5 keeps exact raw state and masks every host slot',async()=>{
 const H=require('../../support/application/legacy-test-support.cjs');for(const schema of [4,5])for(const [field,value]of [['nature','constructor'],['nature','__proto__'],['nature','toString'],['nature','not-a-nature'],['gender','alien']]){
 const good=E.fixtures.savedFor(E.fixtures.makeGame(),content),raw=schema===4?H.legacyGame(good,4):good;raw.party[0][field]=value;const before=JSON.stringify(raw),h=host(raw);h.load();assert.equal(h.sys._psSaveError.code,'invalid');assert.equal(JSON.stringify(h.sys._psGame),before);assert.equal(h.sys.isSaveEnabled(),false);for(const slot of [0,1,2,17,20])await assert.rejects(h.ctx.DataManager.saveGame(slot),/not usable/);assert.deepEqual(h.writes,[]);assert.equal(JSON.stringify(h.sys._psGame),before);
 }
});
test('J11: normal held map encounter proceeds with either explicit developer value',()=>{
 for(const allowed of [false,true]){
  const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.sys._psGame.party[0].item='leftovers';h.flow.developerCapabilities={allowExperimentalHeldItemBattle:allowed};
  let loads=0,stepDraws=0,pushes=0;const original=h.flow.content;
  h.flow.content=()=>{loads++;return original()};h.player.makeEncounterCount=()=>stepDraws++;h.flow.mapEncounters=()=>({data:{table:{regions:[],slots:[{species:'pidgey',weight:1,minLevel:5,maxLevel:5}]}}});h.player._encounterCount=0;h.ctx.SceneManager.push=()=>pushes++;
  const before=h.entropyFills();
  assert.doesNotThrow(()=>h.player.executeEncounter());assertEncounterPush(h,pushes,1);
  assert.ok(loads>0);assert.ok(h.entropyFills()>before);assert.equal(stepDraws,1);h.flow.stateReplaced();
 }
});
test('O51-1: 120 held-map frames do not create repeated encounters while a normal battle owns the map',()=>{
 const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.sys._psGame.party[0].item='leftovers';let loads=0,counts=0,pushes=0,map=1;
 const load=h.flow.content;h.flow.content=()=>{loads++;return load();};h.player.makeEncounterCount=()=>counts++;h.flow.mapEncounters=()=>({data:{table:{regions:[],slots:[{species:'pidgey',weight:1,minLevel:5,maxLevel:5}]}}});h.player._encounterCount=0;h.ctx.$gameMap.mapId=()=>map;h.ctx.SceneManager.push=()=>pushes++;
 const before=h.entropyFills(), snapshot=()=>[loads,h.entropyFills(),counts,pushes];
 h.player.executeEncounter();assertEncounterPush(h,pushes,1);assert.equal(counts,1);assert(loads>0&&h.entropyFills()>before);
 const first=snapshot();for(let i=1;i<120;i++)h.player.executeEncounter();assert.deepEqual(snapshot(),first);
 h.flow.stateReplaced();map=2;h.player._encounterCount=0;h.player.executeEncounter();assertEncounterPush(h,pushes,2);assert.equal(counts,2);h.flow.stateReplaced();
});
test('P52-28: every inventory root and management browse refuse automatic encounters before counter RNG or content',()=>{
 for(const kind of ['bag','shop','item','management']){
  const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content)),app=h.flow.app();const token=kind==='management'?app.beginManagement():app.beginInventoryOperation(kind);
  let counts=0,loads=0;const original=h.flow.content,before=h.entropyFills();h.flow.content=()=>{loads++;return original();};h.player.makeEncounterCount=()=>counts++;h.flow.mapEncounters=()=>({data:{table:{regions:[],slots:[{species:'pidgey',weight:1,minLevel:3,maxLevel:3}]}}});h.player._encounterCount=0;
  assert.equal(h.player.executeEncounter(),false);assert.deepEqual([counts,h.entropyFills()-before,loads,h.player._encounterCount],[0,0,0,0],kind);kind==='management'?app.endManagement(token):app.endInventoryOperation(token);
 }
});

test('HF-04 PSFlow.commit grants no fresh authority from legacy/required booleans or detached raw after abort',async()=>{
 const h=host(E.fixtures.savedFor(E.fixtures.makeGame(),content));h.load();const before=J(h.sys._psGame),raw={protocol:1,battleId:'HF04',outcome:{kind:'win',winner:'Player'},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}};
 for(const options of [{},{legacy:true,required:false},{heldFactsRequired:false}]){
   assert.throws(()=>h.flow.commit(raw,options),/source-unknown-or-retired/);assert.deepEqual(J(h.sys._psGame),before);assert.deepEqual(h.writes,[]);
 }
 const request={battleId:'HF04-owned',kind:'wild',seq:1,foes:[{species:'caterpie',level:5}]},app=h.flow.app(),session=await app.startBattle(request);
 await session.run();const received=session.result();app.abortBattle(request,Error('retired control'));
 assert.throws(()=>h.flow.commit(received,{legacy:true,required:false}),/source-unknown-or-retired/);assert.deepEqual(J(h.sys._psGame),before);assert.deepEqual(h.writes,[]);
});

function messageEscapeHost() {
  const source = fs.readFileSync(path.join(ROOT, 'js/reactor_windows.js'), 'utf8');
  const methods = ['Window_Base.prototype.convertEscapeCharacters', 'Window_Message.prototype.processEscapeCharacter'];
  const G = { Window_Base: function() {}, Window_Message: function() {}, $gameVariables: { value: () => 'INJECTED_VARIABLE' }, TextManager: { currencyUnit: 'G' } };
  vm.createContext(G);
  for (const name of methods) {
    const a = source.indexOf(name + ' = function'), b = source.indexOf('\n};', a);
    assert(a >= 0 && b > a, name); vm.runInContext(source.slice(a, b + 3), G);
  }
  G.Window_Base.prototype.processEscapeCharacter = () => {};
  return { G, convert: text => G.Window_Base.prototype.convertEscapeCharacters.call({ actorName: () => 'ACTOR', partyMemberName: () => 'PARTY' }, text),
    pauseSkip(text) { const converted = this.convert(text), window = { _pauseSkip: false, _showFast: false, startPause() {}, startWait() {}, startPage() {} };
      for (const match of converted.matchAll(/\x1b([\^.!|><$])/g)) G.Window_Message.prototype.processEscapeCharacter.call(window, match[1], {});
      return window._pauseSkip; } };
}
for (const lang of ['en', 'zh']) for (const destination of ['party', 'box']) for (const raw of ['\\^Nick', '\\V[1]', '\\C[2]', '\x1b^Nick']) test('receiving ' + lang + ' ' + destination + ' safely displays literal user name ' + JSON.stringify(raw), () => {
  const game = E.fixtures.savedFor(E.fixtures.makeGame(), content);
  if (destination === 'box') while (game.party.length < 6) { const m = J(game.party[0]); m.id = 'LITERAL-' + game.party.length; game.party.push(m); }
  const h = host(game), messages = []; h.ctx.$gameMessage.add = text => messages.push(text); h.flow.receiveOptions = { mode: 0, naming: 0 }; h.flow.translator = () => E.i18n.translatorFor(lang);
  const app = h.flow.app();
  if (destination === 'box') {
    const token = app.beginManagement(); const renamed = app.manage(token, 'literal-box-name', { kind: 'box-name', box: 0, name: raw });
    assert.equal(renamed.status, 'applied'); app.endManagement(token);
  }
  const pending = app.receiveGift({ kind: 'normal', member: { species: 'pidgey', level: 3 } });
  const id = pendingReception(app, pending).members[0].id;
  const done = app.resolveReceiving(pending.token, { [id]: { nickname: { kind: 'set', value: destination === 'party' ? raw : 'Review' }, ...(destination === 'box' ? { placement: { kind: 'box' } } : {}) } });
  assert.equal(done.status, 'applied');
  h.flow.notifyReceived([id], 'literal-' + destination); assert.equal(messages.length, 1);
  const parser = messageEscapeHost(), converted = parser.convert(messages[0]), visible = raw.replace(/\x1b/g, '␛');
  assert(converted.includes(visible), 'literal user text survives native MZ conversion: ' + converted);
  assert(!converted.includes('INJECTED_VARIABLE')); assert(!converted.includes('\x1b'), 'user text never becomes a native message control'); assert.equal(parser.pauseSkip(messages[0]), false);
  const saved = h.flow.game();
  assert.equal(destination === 'party' ? saved.party.at(-1).nickname : saved.storage.boxes[0].name, raw, 'stored user input remains unchanged');
  h.flow.notifyReceived([id], 'literal-' + destination); assert.equal(messages.length, 1, 'notice remains idempotent');
  // User-only escaping must never disable authored MZ controls globally.
  h.ctx.$gameMessage.add('Author\\^'); assert.equal(parser.pauseSkip(messages[1]), true);
});

test('receiving escapes only user substitutions while the same authored message retains its native controls', () => {
  const h = host(E.fixtures.savedFor(E.fixtures.makeGame(), content)), messages = [];
  h.flow.receiveOptions = { mode: 0, naming: 0 }; h.ctx.$gameMessage.add = text => messages.push(text);
  const app = h.flow.app(), pending = app.receiveGift({ kind: 'normal', member: { species: 'pidgey', level: 3 } });
  const id = pendingReception(app, pending).members[0].id, nickname = '\\V[1]';
  assert.equal(app.resolveReceiving(pending.token, { [id]: { nickname: { kind: 'set', value: nickname } } }).status, 'applied');
  const translator = h.flow.translator();
  h.flow.translator = () => ({ t(key, args) { const text = translator.t(key, args); return key === 'management.received' ? '\\C[2]' + text + '\\^' : text; } });
  h.flow.notifyReceived([id], 'literal-authored-controls');
  const parser = messageEscapeHost(), converted = parser.convert(messages[0]);
  assert(converted.startsWith('\x1bC[2]')); assert(converted.includes(nickname));
  assert(!converted.includes('INJECTED_VARIABLE')); assert.equal(parser.pauseSkip(messages[0]), true, 'authored pause-skip is still effective');
});


function recoveryMessageHost({ lang = 'en', name = '', destination = 'box', signal = 'scene-aborted' } = {}) {
  const game = E.fixtures.savedFor(E.fixtures.makeGame(), content);
  if (destination === 'box') while (game.party.length < 6) { const m = J(game.party[0]); m.id = 'RECOVER-' + game.party.length; game.party.push(m); }
  const h = host(game), messages = [];
  h.flow.translator = () => E.i18n.translatorFor(lang); h.flow.receiveOptions = { mode: 0, naming: 0 };
  const app = h.flow.app();
  if (name) { const token = app.beginManagement(); assert.equal(app.manage(token, 'recovery-box-name', { kind: 'box-name', box: 0, name }).status, 'applied'); app.endManagement(token); }
  const pending = app.receiveGift({ kind: 'normal', member: { species: 'pidgey', level: 3 } });
  const id = pendingReception(app, pending).members[0].id;
  assert.equal(app.resolveReceiving(pending.token, {}, signal).status, 'applied'); assert.equal(app.receivingNotifications.length, 1);
  const Input = { keyMapper: {}, isTriggered: () => false, isRepeated: () => false };
  h.ctx.Input = Input; h.ctx.document = { addEventListener() {} }; h.ctx.addEventListener = () => {};
  let mapStarts = 0; h.ctx.Scene_Map = function() {}; h.ctx.Scene_Map.prototype.start = () => { mapStarts++; };
  vm.runInContext(plugins.PS_Management, h.ctx, { filename: 'PS_Management.js (built)' });
  h.ctx.$gameMessage.add = text => messages.push(text);
  const mapStart = () => h.ctx.Scene_Map.prototype.start.call({});
  return { ...h, app, id, pending, messages, mapStart, mapStarts: () => mapStarts };
}
for (const lang of ['en', 'zh']) for (const signal of ['scene-aborted', 'rebuild-failed']) for (const raw of ['\\^Nick', '\\V[1]', '\\C[2]', '\x1b^Nick']) test('map recovered ' + lang + ' ' + signal + ' safely displays literal box name ' + JSON.stringify(raw), () => {
  const h = recoveryMessageHost({ lang, name: raw, signal }), before = J(h.flow.game());
  h.flow.notifyReceived([h.id], 'recovered-normal-control'); assert.equal(h.messages.length, 0, 'ordinary notice yields to pending recovered notice');
  h.mapStart(); assert.equal(h.mapStarts(), 1); assert.equal(h.messages.length, 1);
  const parser = messageEscapeHost(), converted = parser.convert(h.messages[0]), visible = raw.replace(/\x1b/g, '␛');
  assert(converted.includes(visible), 'literal user box name survives native MZ conversion: ' + converted);
  assert(!converted.includes('INJECTED_VARIABLE')); assert(!converted.includes('\x1b'), 'user box name cannot become a native message control'); assert.equal(parser.pauseSkip(h.messages[0]), false);
  assert.equal(h.app.receivingNotifications.length, 0); assert.deepEqual(J(h.flow.game()), before, 'message boundary does not rewrite the saved name or member');
  h.mapStart(); assert.equal(h.messages.length, 1, 'acknowledged recovery is not repeated');
});
for (const lang of ['en', 'zh']) for (const name of ['旧中文盒名', '\\\\V[1]', '']) test('map recovered ' + lang + ' preserves legacy/default box title ' + JSON.stringify(name), () => {
  const h = recoveryMessageHost({ lang, name }), before = J(h.flow.game()); h.mapStart();
  const dest = name || h.flow.translator().t('management.box', { n: 1 });
  assert.equal(messageEscapeHost().convert(h.messages[0]), h.flow.translator().t('management.recovered', { dest }));
  assert.deepEqual(J(h.flow.game()), before); assert.equal(h.flow.game().storage.boxes[0].name, name);
});
for (const lang of ['en', 'zh']) for (const destination of ['party', 'box']) test('map recovered ' + lang + ' keeps authored message and fallback destination controls for ' + destination, () => {
  const h = recoveryMessageHost({ lang, destination }), original = h.flow.translator();
  h.flow.translator = () => ({ t(key, args) { const text = original.t(key, args); return ['management.recovered', 'management.party', 'management.box'].includes(key) ? '\\C[2]' + text + '\\^' : text; } });
  h.mapStart(); const parser = messageEscapeHost(), converted = parser.convert(h.messages[0]);
  assert.equal((converted.match(/\x1bC\[2\]/g) || []).length, 2, 'both authored template and destination controls remain active');
  assert.equal(parser.pauseSkip(h.messages[0]), true); assert.equal(h.app.receivingNotifications.length, 0);
});
test('map recovered custom box name is escaped inside an otherwise active authored message', () => {
  const h = recoveryMessageHost({ name: '\\V[1]' }), original = h.flow.translator();
  h.flow.translator = () => ({ t(key, args) { const text = original.t(key, args); return key === 'management.recovered' ? '\\C[2]' + text + '\\^' : text; } });
  h.mapStart(); const parser = messageEscapeHost(), converted = parser.convert(h.messages[0]);
  assert(converted.startsWith('\x1bC[2]')); assert(converted.includes('\\V[1]')); assert(!converted.includes('INJECTED_VARIABLE')); assert.equal(parser.pauseSkip(h.messages[0]), true);
});
test('map recovered message queue failure keeps its notice and unchanged save for the next map entry', () => {
  const h = recoveryMessageHost({ name: '\\^Nick' }), before = J(h.flow.game());
  h.ctx.$gameMessage.add = () => { throw Error('injected message queue failure'); }; h.mapStart();
  assert.equal(h.app.receivingNotifications.length, 1); assert.deepEqual(J(h.flow.game()), before);
  h.ctx.$gameMessage.add = text => h.messages.push(text); h.mapStart();
  assert.equal(h.messages.length, 1); assert.equal(messageEscapeHost().pauseSkip(h.messages[0]), false);
  assert.equal(h.app.receivingNotifications.length, 0); assert.deepEqual(J(h.flow.game()), before);
});

test('ordinary VM refuses fixture and ResetGame without loading testing or changing state', () => {
  const h = coldHost('fixture'), state = h.sys._psGame, before = JSON.stringify(state);
  assert.throws(() => h.flow.content(), /TEST-CONTENT-DISABLED/);
  assert.throws(() => h.flow.resetGame(), /TEST-RESET-DISABLED/);
  assert.equal(h.flow._content, null);
  assert.equal(h.sys._psGame, state);
  assert.equal(JSON.stringify(h.sys._psGame), before);
  assert.equal(h.loads.some(p => /testing\.cjs$/.test(p)), false);
  assert.deepEqual(h.writes, []);

  h.flow.rng = () => { throw new Error('ordinary VM unexpectedly used a test RNG'); };
  const fills = h.entropyFills();
  const draw = h.flow.random(10);
  assert.ok(Number.isInteger(draw) && draw >= 0 && draw < 10);
  assert.equal(h.entropyFills(), fills + 1, 'ordinary random uses the Node fill boundary');
});
