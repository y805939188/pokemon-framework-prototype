'use strict';
// Synthetic author content and fixed Showdown seed; no reference execution, NW or player data.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const E = require(process.env.PF55_CAPTURE_ENGINE || '../../../js/engine/build/production.cjs');
const value = value => ({ status: 'value', value });
const protocol = [];
let content;
test.before(() => {
  const source = path.resolve(__dirname, '../../../content/sample');
  const names = ['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata'];
  const input = Object.fromEntries(names.filter(name => fs.existsSync(path.join(source, name + '.json'))).map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), JSON.parse(fs.readFileSync(path.join(source, name + '.json'), 'utf8'))]));
  // In-memory test author data only: catchRate30 at full HP gives literal x=10/30/50.
  const pidgey = input.species.find(species => species.id === 'pidgey');
  Object.assign(pidgey, { catchRate: 30, learnset: [{ level: 1, move: 'splash' }], wildItemCommon: [], wildItemUncommon: [], wildItemRare: [] });
  input.species.find(species => species.id === 'snorlax').learnset = [{ level: 1, move: 'splash' }];
  input.encounters = { source: 'author-placeholder', tables: [{ mapId: 5, version: 0, types: { Land: { stepChance: 100, slots: [{ species: 'pidgey', weight: 100, minLevel: 10, maxLevel: 10 }] } } }] };
  const compiled = E.contentCompile.compileContent(input); assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.deepEqual(assembled.errors, []); content = assembled.content;
});
test.after(() => { if (process.env.PF55_CAPTURE_PROTOCOL) fs.writeFileSync(process.env.PF55_CAPTURE_PROTOCOL, JSON.stringify(protocol, null, 2) + '\n'); });

function projection({ hour = 12, cave = false, source = 'Land', visualDayNight = false, battleTime = 'day' } = {}) {
  const result = E.worldBattleContext.projectWorldBattleContext({
    facts: { hour: value(hour), weather: value({ type: 'None', category: 'None' }), mapMetadata: cave ? value({ environment: 'cave' }) : { status: 'absent' } },
    source, groundEnvironment: value('grass'), facingEnvironment: value('movingwater'), weatherSetsTerrain: true,
    visualDayNight, battleTime,
  });
  assert.equal(result.status, 'value', result.reason); return result.value.capture;
}
function inputs(worldCapture, options = {}) {
  const game = E.state.newGame({ content, party: [], bag: { lureball: 4, duskball: 4, diveball: 2, netball: 2, pokeball: 2 } });
  game.party = [E.memberFactory.createMember({ id: 'P1', species: 'Snorlax', level: 50 }, content, () => 0)];
  const foe = E.memberFactory.createMember({ id: 'F1', species: 'Pidgey', level: 10 }, content, () => 0);
  if (options.sleep) { foe.status = 'slp'; foe.statusCount = 2; }
  const request = { battleId: 'world-capture-consumer', kind: 'wild', foes: [], seq: 1 };
  const setup = { foes: [foe], noRun: false, noBall: false, expGain: false,
    evidenceContext: { battleId: request.battleId, generation: 1, contentIdentity: E.contentRuntime.validatedContentIdentity(content), playerIds: ['P1'], initialLevels: { P1: 50 } },
    ...(options.absent ? {} : { worldCapture }), ...(options.initialField ? { initialField: options.initialField } : {}),
  };
  return { game, request, setup };
}
function factory(options = {}) { return E.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4], ...options }); }
async function open(worldCapture, options = {}) {
  const data = inputs(worldCapture, options), producer = options.factory || factory();
  const session = await producer.create(data.request, data.game, data.setup); session.take();
  return { ...data, session, producer };
}
async function throwAndRead(session, ball, entry, expectedX, label) {
  const result = entry === 'throwBall' ? await session.throwBall(ball) : await session.chooseDoubles([{ kind: 'ball', ball, target: session.gw.activeId('p2'), catchRate: 255, ctx: { fishing: true, timeOfDay: 2, underwater: true, targetTypes: ['Water'], targetLevel: 1 } }]);
  assert.equal(result.ok, true, JSON.stringify(result));
  const event = result.messages.flatMap(message => message.events || []).find(event => event.type === 'rpg' && event.args[0] === 'ball');
  assert.ok(event, 'must read actual Showdown ball resolution');
  protocol.push({ label, entry, args: event.args });
  assert.equal(Number(event.args[7]), expectedX, label);
  assert.equal(Number(event.args[8]), Math.floor(65536 / Math.pow(255 / expectedX, 0.1875)), 'literal HP/rate oracle for actual y');
  assert.ok(['caught', 'escaped'].includes(event.args[4]));
  assert.equal(session.bag[ball], 3 - (ball === 'diveball' || ball === 'netball' ? 2 : 0));
  return event;
}
async function close(session) { if (!session.finished && !session.broken) await session.run(); }

for (const entry of ['throwBall', 'chooseSlots']) {
  for (const source of ['OldRod', 'GoodRod', 'SuperRod', 'Land', 'event']) test('C2 real factory ' + entry + ' Lure ' + source, async () => {
    const w = await open(projection({ source }));
    try { await throwAndRead(w.session, 'lureball', entry, source.endsWith('Rod') ? 50 : 10, source); } finally { await close(w.session); }
  });
  for (const row of [
    { name: 'day with visual night', hour: 12, battleTime: 'night', x: 10 },
    { name: 'evening', hour: 17, x: 10 },
    { name: 'night visuals off', hour: 20, visualDayNight: false, x: 30 },
    { name: 'night visuals on', hour: 20, visualDayNight: true, x: 30 },
    { name: 'cave at noon visuals off', hour: 12, cave: true, x: 30 },
    { name: 'Cave table alone is not cave metadata', hour: 12, source: 'Cave', x: 10 },
  ]) test('C2 real factory ' + entry + ' Dusk ' + row.name, async () => {
    const w = await open(projection(row));
    try { await throwAndRead(w.session, 'duskball', entry, row.x, row.name); } finally { await close(w.session); }
  });
  test('C2 ' + entry + ' sequential rod -> false/day -> absent has no sticky world context', async () => {
    const producer = factory();
    for (const row of [{ facts: { timeOfDay: 2, fishing: true }, x: 50 }, { facts: { timeOfDay: 0, fishing: false }, x: 10 }, { absent: true, x: 10 }]) {
      const w = await open(row.facts, { factory: producer, absent: row.absent });
      try { await throwAndRead(w.session, 'lureball', entry, row.x, 'sequential'); } finally { await close(w.session); }
    }
  });
  test('C2 ' + entry + ' snapshot survives caller mutation before/after await and replacement of setup', async () => {
    const facts = { timeOfDay: 2, fishing: true }, data = inputs(facts), promise = factory().create(data.request, data.game, data.setup);
    facts.timeOfDay = 0; facts.fishing = false; data.setup.worldCapture = { timeOfDay: 0, fishing: false };
    const session = await promise; session.take();
    try { await throwAndRead(session, 'lureball', entry, 50, 'caller-mutation'); } finally { await close(session); }
  });
  test('C2 ' + entry + ' engine underwater and target status/types remain authoritative', async () => {
    for (const row of [
      { ball: 'diveball', initialField: { environment: 'underwater' }, x: 35 },
      { ball: 'diveball', initialField: { environment: 'grass' }, x: 10 },
      { ball: 'netball', x: 10 },
      { ball: 'duskball', sleep: true, x: 75 },
    ]) {
      const w = await open({ timeOfDay: 2, fishing: true }, row);
      try { await throwAndRead(w.session, row.ball, entry, row.x, 'engine-owned ' + row.ball); } finally { await close(w.session); }
    }
  });
}

test('C2 composition snapshots world values before content/seed callbacks can mutate the DTO', async () => {
  const facts = { timeOfDay: 2, fishing: true };
  const producer = factory({ content() { facts.timeOfDay = 0; return content; }, seed() { facts.fishing = false; return [1, 2, 3, 4]; } });
  const w = await open(facts, { factory: producer });
  try { await throwAndRead(w.session, 'lureball', 'throwBall', 50, 'callback-mutation'); } finally { await close(w.session); }
});
test('C2 zero/false snapshot survives later mutation to night/fishing', async () => {
  const facts = { timeOfDay: 0, fishing: false }, data = inputs(facts), pending = factory().create(data.request, data.game, data.setup);
  facts.timeOfDay = 2; facts.fishing = true;
  const session = await pending; session.take();
  try { await throwAndRead(session, 'lureball', 'chooseSlots', 10, 'zero-false'); } finally { await close(session); }
});
test('C2 direct Session entry has identical snapshot behavior and absent values preserve legacy semantics', async () => {
  for (const row of [{ facts: { timeOfDay: 2, fishing: true }, x: 50 }, { x: 10 }]) {
    const data = inputs(row.facts), options = { game: data.game, battleId: data.request.battleId, content, foe: { kind: 'wild', team: data.setup.foes }, seed: [1, 2, 3, 4], expGain: false, worldCapture: row.facts };
    const promise = E.session.BattleSession.create(options);
    if (row.facts) { row.facts.fishing = false; row.facts.timeOfDay = 0; }
    const session = await promise; session.take();
    try { await throwAndRead(session, 'lureball', 'throwBall', row.x, 'direct-session'); } finally { await close(session); }
  }
});
test('C2 malformed world facts are rejected before direct engine work or composition callbacks', async () => {
  const malformed = [null, false, 0, [], {}, { timeOfDay: 0 }, { fishing: false }, { timeOfDay: '2', fishing: true }, { timeOfDay: 3, fishing: true }, { timeOfDay: NaN, fishing: true }, { timeOfDay: 0, fishing: 0 }, { timeOfDay: 0, fishing: 'false' }, { timeOfDay: 0, fishing: false, underwater: true }, Object.create({ timeOfDay: 0, fishing: false })];
  let calls = 0;
  for (const worldCapture of malformed) {
    await assert.rejects(E.session.BattleSession.create({ worldCapture, driver: { async moveNames() { calls++; throw Error('engine-called'); } } }), /worldCapture/);
    const data = inputs(worldCapture);
    assert.throws(() => factory({ content() { calls++; return content; } }).create(data.request, data.game, data.setup), /worldCapture/);
  }
  assert.equal(calls, 0);
});
test('C2 accessors/inherited outer property are not executed and symbols/nonenumerable data rejected', async () => {
  let reads = 0;
  const getter = { timeOfDay: 2, get fishing() { reads++; return true; } };
  const outer = {}; Object.defineProperty(outer, 'worldCapture', { get() { reads++; return { timeOfDay: 2, fishing: true }; } });
  const hidden = { timeOfDay: 0 }; Object.defineProperty(hidden, 'fishing', { value: false });
  for (const options of [outer, Object.create({ worldCapture: { timeOfDay: 0, fishing: false } }), { worldCapture: getter }, { worldCapture: hidden }, { worldCapture: { timeOfDay: 0, fishing: false, [Symbol('extra')]: 0 } }]) {
    await assert.rejects(E.session.BattleSession.create(options), /worldCapture/);
    assert.throws(() => factory({ content() { reads++; return content; } }).create({}, {}, options), /worldCapture/);
  }
  assert.equal(reads, 0);
});
test('C2 valid cross-realm and null-prototype own scalar DTOs are accepted', async () => {
  for (const facts of [vm.runInNewContext('({timeOfDay:2,fishing:true})'), Object.assign(Object.create(null), { timeOfDay: 2, fishing: true })]) {
    const w = await open(facts);
    try { await throwAndRead(w.session, 'lureball', 'throwBall', 50, 'record-realm'); } finally { await close(w.session); }
  }
});
test('C2 staged slots cancellation and restore retain the same per-session world snapshot', async () => {
  const facts = { timeOfDay: 2, fishing: true }, w = await open(facts), s = w.session;
  try {
    const cp = s._checkpoint();
    assert.deepEqual(await s.chooseDoubles([{ kind: 'ball', ball: 'lureball', target: 'F1' }], { commit: false }), { ok: true, staged: true });
    await s.cancel(); assert.equal(s.bag.lureball, 4);
    facts.fishing = false; facts.timeOfDay = 0;
    const first = await throwAndRead(s, 'lureball', 'chooseSlots', 50, 'after-cancel');
    await s._restoreCheckpoint(cp);
    const replay = await throwAndRead(s, 'lureball', 'throwBall', 50, 'after-restore');
    assert.deepEqual(replay.args, first.args, 'restored seed and frozen world produce same actual protocol');
  } finally { await close(s); }
});
test('C2 actual App completed step -> admitted factory -> Showdown Dusk uses business night with no extra RNG', async () => {
  const dex = E.dex.createDexLookup(), player = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: 'P1', species: 'Snorlax', level: 50 }, content, () => 0), content);
  let game = E.state.newGame({ content, party: [player], bag: { duskball: 4 } }), hour = 20;
  const draws = [], owner = {}, actual = {}, map = {};
  const here = { hostOwner: owner, generation: 1, player: actual, map, mapId: 5, x: 2, y: 2 };
  const app = new E.app.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})}, state: { read: () => game, replace: next => { game = next; } }, content: () => ({ content, dex }), sessions: factory(), projection: { project() {} }, random(n) { draws.push(n); return 0; }, clock: () => 1000,
    worldHost: { read: () => ({ mapId: value(5), hour: value(hour), cycling: value(false), diving: value(false) }) },
    completedSteps: { current: () => ({ ...here }), async openRepelSelection() { return { status: 'cancelled' }; }, async present({ effect }) { return { id: effect.id, status: 'completed' }; }, dispatchArrival() { return { status: 'ordinary-opportunity' }; } },
    ordinaryEncounters: { read: () => ({ landAllowed: value(true), encountersDisabled: value(false), debugControl: value(false), groundEnvironment: value('grass') }) },
  });
  const result = await app.completeWorldStep({ ...here, id: 'capture-ordinary', sceneActive: true, ice: false, regionId: 0, terrainTag: 0 });
  assert.equal(result.status, 'battle-admitted', JSON.stringify(result)); hour = 12;
  const before = [...draws], session = await app.startAdmittedWorldBattle(result.admission); session.take();
  try { await throwAndRead(session, 'duskball', 'throwBall', 30, 'real-app'); assert.deepEqual(draws, before); }
  finally { app.abortAdmittedWorldBattle(result.admission, 'owned test completed'); }
});
