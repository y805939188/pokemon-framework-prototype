'use strict';
const assert = require('node:assert/strict');
const { types } = require('node:util');
const F = require('../saves/legacy-migration/fixtures.cjs');
const { surfHost } = require('../field/application-lifecycle-surf-host.cjs');
const clone = value => structuredClone(value), value = value => ({ status: 'value', value });
function fixture(P, options = {}) {
  const content = F.content(P); content.moves.tackle = content.moves.Tackle;
  for (const [name, species] of Object.entries(content.species)) {
    species.ruleSpecies = 'Fixture' + name; species.types = ['Normal'];
    species.wildItemCommon = []; species.wildItemUncommon = []; species.wildItemRare = [];
  }
  content.settings = { AFFECTION_EFFECTS: false, POISON_IN_FIELD: false };
  content.mapMetadata = { source: 'p5-app-lifecycle-literal-fixture', maps: {
    7: { environment: 'grass' },
    8: { environment: 'cave', weather: { type: 'Rain', chance: 50 }, healingSpot: { mapId: 8, x: 1, y: 2 } },
  } };
  content.world = { encounters: { source: 'p5-app-lifecycle-literal-fixture', tables: [
    { mapId: 7, version: 0, types: { Land: { stepChance: 21, slots: [{ species: 'B', weight: 100, minLevel: 2, maxLevel: 2 }] } } },
    { mapId: 8, version: 0, types: { Land: { stepChance: 21, slots: [{ species: 'C', weight: 100, minLevel: 3, maxLevel: 3 }] }, Water: { stepChance: 2, slots: [{ species: 'B', weight: 100, minLevel: 2, maxLevel: 2 }] } } },
    { mapId: 8, version: 1, types: { Land: { stepChance: 5, slots: [{ species: 'B', weight: 100, minLevel: 4, maxLevel: 4 }] } } },
  ] } };
  content.moves.surf = { id: 'surf', name: 'Surf', pp: 15 };
  const initialGame = P.state.newGame({ content, party: [F.member('P1', { hp: 20, friendship: 70, moves: [{ id: 'tackle', pp: 7, maxpp: 35, ppUps: 0 }, { id: 'surf', pp: 15, maxpp: 15, ppUps: 0 }] })], bag: { repel: 1 } });
  initialGame.badges = [true, true, true, true, false, false, false, false];
  const native = typeof P.createFieldMoveHost === 'function' && options.runtimePath ? surfHost(P, options.runtimePath) : null;
  const root = native?.root ?? { $gameMap: { _mapId: 7 }, $gamePlayer: {}, SceneManager: { _scene: {} } };
  root.$gameSystem = { _psGame: F.freeze(initialGame) };
  const hostOwner = {}, sessions = [], projections = [], installs = [], draws = [];
  const legacy = { read: () => root.$gameSystem._psGame, replace(next) { installs.push(clone(next)); root.$gameSystem._psGame = F.freeze(clone(next)); } };
  let app;const loadedContent={current:content};root.PSFlow={_app:null,_content:content};
  const nativeStart=native?require('../field/field-parent-native-start.cjs').prepare(root,null,()=>({application:app,game:legacy.read(),content:loadedContent.current}),{runtimePath:options.runtimePath,createWorldTravelMZ:P.createWorldTravelMZ}):null;
  const state = P.createMZAtomicStatePort(root, legacy, types.isProxy,{owner:loadedContent,key:'current'},nativeStart?.travel.host.nativeLeaseSource);
  if(native)native.ports.nativeJump=(player,x,y)=>nativeStart.movement.ownedFieldJump(native.lastHostOperation,player,x,y);
  let action = null, cursor = 0, admission = null, handle = null;
  app = new P.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})}, state,...(nativeStart?{worldTravel:nativeStart.travel.host}:{}), content: () => ({ content }), projection: { project(outcome) { projections.push(clone(outcome)); } },
    sessions: P.createLegacyNoHeldSessionFactory({ async create(request, game, setup) {
      // Explicit synthetic session port. Real App admission/start/finish and primary commit remain production.
      const result = { protocol: 1, battleId: request.battleId, outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } };
      handle = { result: () => clone(result) }; sessions.push({ request: clone(request), game: clone(game), setup: clone(setup), result }); return handle;
    } }), clock: () => 1000,
    random(n) {
      assert(action, 'draw outside registered action'); const row = action.tape[cursor++];
      assert(row, 'unexpected extra draw ' + n + ' for ' + action.id); assert.equal(n, row.n, action.id + ' request domain');
      assert(Number.isSafeInteger(row.value) && row.value >= 0 && row.value < n); draws.push({ action: action.id, n, value: row.value }); return row.value;
    },
    worldHost: { read: () => ({ mapId: value(root.$gameMap._mapId), hour: value(20), cycling: value(false), diving: value(false) }) },
    completedSteps: { current: () => location(), async openRepelSelection() { return { status: 'cancelled' }; },
      async present({ effect }) { return { status: 'completed', id: effect.id }; }, dispatchArrival: () => ({ status: 'ordinary-opportunity' }) },
    ordinaryEncounters: { read: () => ({ landAllowed: value(true), encountersDisabled: value(false), debugControl: value(false), groundEnvironment: value('grass') }) },
    ...(native ? { fieldMoves: native.fieldMoves } : {}),
  });
  root.PSFlow._app=app;
  let x = 0;
  function location() { return { hostOwner, generation: 1, player: root.$gamePlayer, map: root.$gameMap, mapId: root.$gameMap._mapId, x: native ? root.$gamePlayer.x : x, y: native ? root.$gamePlayer.y : 0 }; }
  function runtime() {
    if (typeof app.worldEncounterRuntime === 'function') return { observation: 'public GameApplication.worldEncounterRuntime()', value: clone(app.worldEncounterRuntime()) };
    // Read-only observation of a TS-private JS object on the fixed source; no private writes or monkeypatches.
    return { observation: 'READ_ONLY private JS App.world.encounterRuntime getter; no writes', value: clone(Reflect.get(app, 'world').encounterRuntime) };
  }
  async function perform(next) {
    action = next; cursor = 0; let result;
    if (next.kind === 'enter') {
      root.$gameMap._mapId = next.mapId; x = 0; native?.locate(0, 0);nativeStart?.enter();
      result = app.enterWorldMap({ id: next.id, cause: next.cause, previousMapId: next.previousMapId, mapId: next.mapId, rebuilt: next.rebuilt });
    } else if (next.kind === 'step') {
      x++; native?.step(); result = await app.completeWorldStep({ ...location(), id: next.id, ice: false, regionId: 0, terrainTag: 0, sceneActive: true });
      if (result.status === 'battle-admitted') admission = result.admission;
    } else if (next.kind === 'session-start') { assert(admission); await app.startAdmittedWorldBattle(admission); result = { status: 'started' }; }
    else if (next.kind === 'session-finish') { assert(handle && sessions.length); result = app.finishBattle(handle, { battleId: sessions[sessions.length - 1].request.battleId }); }
    else if (next.kind === 'event-start') {
      await app.startBattle({ battleId: next.id, kind: 'wild', foes: [{ species: 'B', level: 2 }], seq: 0 }); result = { status: 'completed' };
    }
    else if (next.kind === 'duplicate-step') result = await app.completeWorldStep({ ...location(), id: next.stepId, ice: false, regionId: 0, terrainTag: 0, sceneActive: true });
    else if (next.kind === 'repel-item') {
      const token = app.beginInventoryOperation(), pockets = app.inventorySnapshot(token).pockets;
      const pocket = pockets.findIndex(rows => rows.some(row => row.item.id === 'repel')); assert(pocket >= 0);
      const row = pockets[pocket].find(row => row.item.id === 'repel');
      const ticket = app.inventoryTicket(token, pocket + 1, row.index), handoff = app.prepareFieldItemHandoff(token, next.id, ticket, 'bag');
      assert.equal(handoff.status, 'handoff'); app.endInventoryOperation(token); result = await app.runFieldItemHandoff(handoff.handoff.token);
    } else if (next.kind === 'version') {
      if (typeof app.setEncounterVersion !== 'function') return { status: 'NOT_READY', reason: 'public atomic setEncounterVersion unavailable on fixed candidate' };
      result = app.setEncounterVersion(next.version);
    } else if (['surf-start', 'surf-start-cleanup', 'surf-land', 'surf-end'].includes(next.kind)) {
      if (!native || typeof app.runFieldMove !== 'function') return { status: 'NOT_READY', reason: 'real E2 parent + production field host not bound on fixed candidate' };
      if (next.kind === 'surf-land') native.facingSurfable(false);
      result = await app.runFieldMove(next.id, next.action);
    }
    else throw Error('unknown App action ' + next.kind);
    assert.equal(cursor, next.tape.length, next.id + ' unused literal draw'); action = null;
    return { status: 'EXECUTED', result, draws: draws.filter(row => row.action === next.id) };
  }
  return { app, content, root, runtime, perform, sessions, projections, installs, draws, hostTrace: native?.trace ?? null,
    initialGame: clone(initialGame), state: () => clone(root.$gameSystem._psGame) };
}
module.exports = { fixture };
