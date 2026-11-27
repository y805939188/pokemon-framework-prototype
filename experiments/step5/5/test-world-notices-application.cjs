'use strict';
// Real GameApplication + notice FIFO; the production 236 adapter is loaded from actual TS source.
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
const E = require(process.env.PF55_B_ENGINE || '../../../js/engine/build/production.cjs'), F = require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
require('../../../scripts/tests/ts-source-loader.cjs');
let weatherAdapter; test.before(async () => { weatherAdapter = await import(pathToFileURL(path.resolve(__dirname, '../../../src/plugins/world/world-weather-mz.ts'))); });
const copy = value => structuredClone(value), value = v => ({ status: 'value', value: v });
const tick = () => new Promise(setImmediate);
function fixture(options = {}) {
  const content = F.content(E); content.mapMetadata = { source: 'fixture', maps: {
    1: { darkMap: true }, 2: { darkMap: false, healingSpot: { mapId: 2, x: 4, y: 5 }, weather: { type: 'Rain', chance: 100 } },
    3: { darkMap: false }, 4: { darkMap: false, weather: { type: 'Rain', chance: 100 } },
  } };
  let app, mapId = 1, held = F.freeze(E.state.newGame({ content, party: [], bag: options.bag || { honey: 2 }, money: 100 })), contentView = content, hook = null, onMap = null;
  const writes = [], draws = [];
  const state = { read: () => held, current: () => held, replace(next) { writes.push(copy(next)); held = F.freeze(copy(next)); },
    external(change) { const next = copy(held); change(next); held = F.freeze(next); } };
  app = new E.app.GameApplication({ state, content: () => { const replacement = hook?.({ app, state, content }); return { content: replacement || contentView }; },
    sessions: { async create() { throw Error('not used'); } }, projection: { project() {} }, random: n => { draws.push(n); return options.random ? options.random(n, app) : 0; },
    worldHost: { read: () => { onMap?.(); return { mapId: value(mapId), hour: value(12), cycling: { status: 'unavailable' }, diving: { status: 'unavailable' } }; } },
    ...(options.handler ? { fieldItems: { execute: options.handler } } : {}),
  });
  const enter = (id, from, to, cause = 'transfer') => ({ id, cause, previousMapId: from, mapId: to, rebuilt: true });
  const observe = (id, from, to, cause = 'transfer') => { mapId = to; return app.observeWorldMapEntry(enter(id, from, to, cause)); };
  return { app, state, content, writes, draws, enter, observe, map: id => { mapId = id; }, hook: fn => { hook = fn; }, onMap: fn => { onMap = fn; }, contentView: next => { contentView = next; } };
}
function prepare(w) {
  const inventory = w.app.beginInventoryOperation(), snap = w.app.inventorySnapshot(inventory), pocket = snap.pockets.findIndex(rows => rows.some(row => row.item.id === 'honey'));
  const row = snap.pockets[pocket].find(row => row.item.id === 'honey'), ticket = w.app.inventoryTicket(inventory, pocket + 1, row.index);
  const result = w.app.prepareFieldItemHandoff(inventory, 'honey', ticket); assert.equal(result.status, 'handoff'); w.app.endInventoryOperation(inventory); return result.handoff.token;
}
function initial(w) { assert.equal(w.observe('initial', null, 1, 'new-game').status, 'committed'); w.app.flushWorldNotices(); w.writes.length = 0; }
const rain = { type: 'Rain', strength: 36, durationFrames: 40 }, storm = { type: 'Storm', strength: 42, durationFrames: 12 }, snow = { type: 'Snow', strength: 18, durationFrames: 3 };

test('NEW-A actual1->2->3 queued entries replay captured map2 metadata and R08 once, never current map3 metadata', async () => {
  const w = fixture(); initial(w); const token = prepare(w);
  assert.equal(w.observe('two', 1, 2).status, 'queued'); assert.equal(w.observe('three', 2, 3).status, 'queued'); assert.equal(w.app.saveBlocked, true);
  assert.deepEqual(w.state.current().world.visitedMaps, [1]); assert.deepEqual(w.draws, []);
  assert.equal((await w.app.runFieldItemHandoff(token)).reason, 'field-map-changed');
  assert.deepEqual(w.writes.map(game => ({ visits: game.world.visitedMaps, healing: game.world.healingSpot, weather: game.world.weather.type })), [
    { visits: [1, 2], healing: { mapId: 2, x: 4, y: 5 }, weather: 'Rain' }, { visits: [1, 2, 3], healing: { mapId: 2, x: 4, y: 5 }, weather: 'None' },
  ]);
  assert.deepEqual(w.draws, [100]); assert.equal(w.app.world.encounterRuntime.currentMapId, 3); assert.equal(w.app.saveBlocked, false);
  const out = w.app.flushWorldNotices(); assert.equal(out.status, 'drained'); assert.deepEqual(out.receipts.map(r => [r.mapId, r.weather.type, r.weatherChanged]), [[2, 'Rain', true], [3, 'None', true]]);
  assert.deepEqual(w.app.flushWorldNotices().receipts, []); assert.equal(w.app.observeWorldMapEntry(w.enter('two', 1, 2)).status, 'duplicate'); assert.deepEqual(w.draws, [100]);
});
test('NEW-A running handler multiple crossings retain bag result then append both fresh map prefixes', async () => {
  let release; const w = fixture({ handler: async () => await new Promise(done => { release = done; }) }); initial(w); const token = prepare(w), running = w.app.runFieldItemHandoff(token); await tick();
  w.observe('two', 1, 2); w.observe('three', 2, 3); release({ status: 'completed' }); assert.equal((await running).status, 'completed');
  assert.deepEqual(w.state.current().world.visitedMaps, [1, 2, 3]); assert.deepEqual(w.draws, [100]); assert.equal(E.inventory.itemQuantity(w.state.current().inventory, 'honey', w.content.items), 1);
  assert.equal(w.writes[0].world.visitedMaps.length, 1); assert.deepEqual(w.writes.at(-1).world.visitedMaps, [1, 2, 3]);
});
test('NEW-A same-map reload positive control and duplicate/conflicting ids do not double roll', () => {
  const w = fixture(); initial(w); const token = prepare(w), two = w.enter('two', 1, 2); w.map(2);
  assert.equal(w.app.observeWorldMapEntry(two).status, 'queued'); assert.equal(w.app.observeWorldMapEntry(two).status, 'queued');
  assert.equal(w.app.observeWorldMapEntry({ ...two, rebuilt: false }).reason, 'map-entry-conflict'); w.app.cancelFieldItemHandoff(token);
  assert.equal(w.app.observeWorldMapEntry(two).status, 'duplicate'); assert.deepEqual(w.state.current().world.visitedMaps, [1, 2]); assert.deepEqual(w.draws, [100]);
  assert.equal(w.observe('load-two', 2, 2, 'load').status, 'committed'); assert.deepEqual(w.draws, [100]);
  assert.equal(w.observe('same-transfer', 2, 2).status, 'unchanged'); assert.deepEqual(w.draws, [100]);
});
test('captured entry Weather field draws once at p0/p100/p>100, while load/duplicate/command draw zero', () => {
  for (const chance of [0, 100, 150]) {
    const w = fixture(); w.content.mapMetadata.maps[2].weather.chance = chance; initial(w); const token = prepare(w);
    w.observe('two', 1, 2); w.app.cancelFieldItemHandoff(token); assert.deepEqual(w.draws, [100]); assert.equal(w.state.current().world.weather.type, chance ? 'Rain' : 'None');
    w.app.observeWorldMapEntry(w.enter('two', 1, 2)); w.observe('load', 2, 2, 'load'); w.app.setWorldWeather(storm); assert.deepEqual(w.draws, [100]);
  }
});
test('NEW-B production236 preserves original display/return/wait and deferred business applies after cancel without diagnosis', () => {
  const w = fixture(); initial(w); const token = prepare(w), diagnostics = [], native = []; let waitFrames = 0;
  const port = { inBattle: () => false, changeBusiness: intent => w.app.setWorldWeather(intent), diagnose: s => diagnostics.push(s) };
  const result = weatherAdapter.runWeatherCommand(port, ['rain', 5, 40, true], () => { native.push(['rain', 5, 40]); waitFrames = 40; return 'native-result'; });
  assert.equal(result, 'native-result'); assert.equal(waitFrames, 40); assert.deepEqual(native, [['rain', 5, 40]]); assert.deepEqual(diagnostics, []); assert.equal(w.state.current().world.weather.type, 'None');
  w.app.cancelFieldItemHandoff(token); assert.deepEqual(w.state.current().world.weather, rain);
  const out = w.app.flushWorldNotices(); assert.equal(out.status, 'drained'); assert.equal(out.receipts.at(-1).kind, 'weather-command'); assert.deepEqual(out.receipts.at(-1).weather, rain);
});
test('NEW-B continuous busy weather takes latest intent but never compresses across a map barrier', () => {
  for (const commandLast of [false, true]) {
    const w = fixture(); initial(w); const token = prepare(w); w.observe('two', 1, 2); w.app.setWorldWeather(rain); w.app.setWorldWeather(storm);
    w.observe('three', 2, 3); if (commandLast) w.app.setWorldWeather(snow);
    assert.equal(w.app.flushWorldNotices().status, 'pending'); assert.equal(w.state.current().world.weather.type, 'None'); w.app.cancelFieldItemHandoff(token);
    const out = w.app.flushWorldNotices(); assert.equal(out.status, 'drained');
    assert.deepEqual(out.receipts.map(r => r.kind), commandLast ? ['map-entry', 'weather-command', 'map-entry', 'weather-command'] : ['map-entry', 'weather-command', 'map-entry']);
    assert.deepEqual(w.writes.map(s => s.world.weather.type), commandLast ? ['Rain', 'Storm', 'None', 'Snow'] : ['Rain', 'Storm', 'None']);
    assert.equal(w.state.current().world.weather.type, commandLast ? 'Snow' : 'None'); assert.deepEqual(w.draws, [100]);
  }
});
test('NEW-B same-type map receipt does not restart native fade; later command is retained as outbox projection barrier', () => {
  const w = fixture(); initial(w); const token = prepare(w); w.observe('two', 1, 2); w.observe('four', 2, 4); w.app.cancelFieldItemHandoff(token);
  w.app.setWorldWeather(rain); const out = w.app.flushWorldNotices();
  assert.deepEqual(out.receipts.map(r => [r.kind, r.weatherChanged]), [['map-entry', true], ['map-entry', false], ['weather-command', false]]);
  assert.deepEqual(w.state.current().world.weather, rain); assert.deepEqual(w.draws, [100, 100]); assert.ok(out.receipts.every(Object.isFrozen)); assert.ok(out.receipts.every(r => Object.isFrozen(r.weather)));
});
test('queued effects use fresh state after held Inventory writes and cannot overwrite bag or money', () => {
  const w = fixture(); initial(w); const inventory = w.app.beginInventoryOperation();
  assert.equal(w.observe('two', 1, 2).status, 'queued'); assert.equal(w.app.setWorldWeather(storm).status, 'queued'); assert.equal(w.app.saveBlocked, true);
  assert.equal(w.app.inventoryRequest(inventory, 'money', { kind: 'change-money', amount: 37 }).status, 'committed');
  assert.equal(w.app.inventoryRequest(inventory, 'bag', { kind: 'add-items', itemId: 'potion', quantity: 3 }).status, 'committed');
  w.app.endInventoryOperation(inventory); assert.equal(w.state.current().money, 137); assert.equal(E.inventory.itemQuantity(w.state.current().inventory, 'potion', w.content.items), 3);
  assert.deepEqual(w.state.current().world.visitedMaps, [1, 2]); assert.deepEqual(w.state.current().world.weather, storm); assert.equal(w.app.saveBlocked, false);
});
test('other non-world management owner blocks notice writes until safe explicit flush', () => {
  const w = fixture(); initial(w); const token = w.app.beginManagement(); w.observe('two', 1, 2); w.app.setWorldWeather(storm);
  assert.equal(w.app.flushWorldNotices().status, 'pending'); assert.deepEqual(w.state.current().world.visitedMaps, [1]);
  w.app.endManagement(token); assert.deepEqual(w.state.current().world.visitedMaps, [1, 2]); assert.deepEqual(w.state.current().world.weather, storm);
});
test('state replacement invalidates pending notices and undelivered outbox without replaying old map or command', () => {
  const w = fixture(); initial(w); const token = prepare(w); w.observe('two', 1, 2); w.app.setWorldWeather(storm);
  w.app.stateReplacedByHost(); const fresh = E.state.newGame({ content: w.content, party: [], money: 777 }); w.state.replace(fresh); w.map(3);
  assert.equal(w.app.cancelFieldItemHandoff(token).status, 'refused'); assert.deepEqual(w.app.flushWorldNotices().receipts, []); assert.deepEqual(w.state.current(), fresh); assert.deepEqual(w.draws, []);
  assert.equal(w.observe('new-load', 3, 3, 'load').status, 'committed'); assert.deepEqual(w.state.current().world.visitedMaps, [3]); assert.deepEqual(w.draws, []);
});
test('capture validates actual map after content callback and never captures currentmap3 as historicalmap2', () => {
  const w = fixture(); initial(w); const token = prepare(w); let armed = true;
  w.hook(() => { if (armed) { armed = false; w.map(3); } }); w.map(2);
  assert.equal(w.app.observeWorldMapEntry(w.enter('two', 1, 2)).reason, 'current-map-unavailable'); w.app.cancelFieldItemHandoff(token);
  assert.deepEqual(w.state.current().world.visitedMaps, [1]); assert.deepEqual(w.draws, []);
});
test('capture content semantic change or parent cancellation refuses old observation', () => {
  for (const mode of ['content', 'cancel']) {
    const w = fixture(); initial(w); const token = prepare(w); let armed = true;
    w.hook(({ app, content }) => { if (!armed) return; armed = false; if (mode === 'cancel') app.cancelFieldItemHandoff(token); else return { ...content, settings: { POISON_IN_FIELD: true } }; });
    assert.equal(w.observe('two', 1, 2).status, 'refused'); if (mode === 'content') w.app.cancelFieldItemHandoff(token);
    assert.deepEqual(w.state.current().world.visitedMaps, [1]); assert.deepEqual(w.draws, []);
  }
});
test('same-semantic returned content copies remain valid; changed queued content is explicitly retained as blocked', () => {
  const w = fixture(); initial(w); const token = prepare(w); w.hook(({ content }) => copy(content)); assert.equal(w.observe('two', 1, 2).status, 'queued');
  w.hook(null); w.app.cancelFieldItemHandoff(token); assert.deepEqual(w.state.current().world.visitedMaps, [1, 2]);
  const bad = fixture(); initial(bad); const held = prepare(bad); bad.observe('two', 1, 2); bad.contentView({ ...bad.content, settings: { POISON_IN_FIELD: true } }); bad.app.cancelFieldItemHandoff(held);
  const out = bad.app.flushWorldNotices(); assert.equal(out.status, 'refused'); assert.equal(out.reason, 'world-content-changed'); assert.equal(out.pending, 1); assert.deepEqual(out.receipts, []); assert.equal(bad.app.saveBlocked, true); assert.deepEqual(bad.state.current().world.visitedMaps, [1]);
});
test('reentrant later weather during final map install stays ordered and cannot be cleared by the old receipt', () => {
  const w = fixture(); initial(w); const token = prepare(w); w.observe('two', 1, 2); let armed = true;
  w.hook(({ app }) => { if (armed && (new Error().stack || '').includes('at GameApplication.install (')) { armed = false; assert.equal(app.setWorldWeather(storm).status, 'queued'); } });
  w.app.cancelFieldItemHandoff(token); assert.deepEqual(w.writes.map(s => s.world.weather.type), ['Rain', 'Storm']);
  const old = w.app.flushWorldNotices(); assert.deepEqual(old.receipts.map(r => r.kind), ['map-entry', 'weather-command']); w.hook(null); w.app.setWorldWeather(snow);
  assert.equal(w.app.flushWorldNotices().receipts.at(-1).weather.type, 'Snow'); assert.deepEqual(old.receipts.at(-1).weather, storm);
});
for (const kind of ['map', 'weather']) for (const boundary of ['at GameApplication.install (', 'at replaceState (']) for (const mode of ['content', 'state', 'generation']) {
  test(`notice terminal ${kind}/${boundary}/${mode} guard keeps new data and rejects stale installation`, () => {
    const w = fixture(); initial(w); const token = prepare(w); if (kind === 'map') w.observe('two', 1, 2); else w.app.setWorldWeather(storm);
    let armed = true, injected = false, fresh;
    w.hook(({ app, content, state }) => { if (!armed || !(new Error().stack || '').includes(boundary)) return; armed = false; injected = true;
      if (mode === 'content') return { ...content, settings: { POISON_IN_FIELD: true } };
      if (mode === 'state') { state.external(g => { g.money = 999; }); return; }
      app.stateReplacedByHost(); fresh = E.state.newGame({ content, party: [], money: 777 }); state.replace(fresh); w.map(3); assert.equal(w.observe('new-load', 3, 3, 'load').status, 'committed');
    });
    w.app.cancelFieldItemHandoff(token); assert.equal(injected, true);
    if (mode === 'generation') { assert.deepEqual(w.state.current().world.visitedMaps, [3]); assert.equal(w.state.current().money, 777); const receipts = w.app.flushWorldNotices().receipts; assert.deepEqual(receipts.map(r => r.entryId), ['new-load']); }
    else { assert.deepEqual(w.state.current().world.visitedMaps, [1]); assert.equal(w.state.current().world.weather.type, 'None'); assert.equal(w.state.current().money, mode === 'state' ? 999 : 100); assert.equal(w.app.flushWorldNotices().status, 'refused'); }
  });
}
test('capture generation replacement cannot remove successor observation or clear its outbox', () => {
  const w = fixture(); initial(w); prepare(w); let armed = true;
  w.hook(({ app, state, content }) => { if (!armed) return; armed = false; app.stateReplacedByHost(); state.replace(E.state.newGame({ content, party: [], money: 777 })); w.map(3); assert.equal(w.observe('new-load', 3, 3, 'load').status, 'committed'); });
  assert.equal(w.observe('old-two', 1, 2).status, 'refused'); assert.deepEqual(w.state.current().world.visitedMaps, [3]); assert.deepEqual(w.app.flushWorldNotices().receipts.map(r => r.entryId), ['new-load']); assert.deepEqual(w.draws, []);
});

for (const kind of ['map','weather']) for (const boundary of ['at GameApplication.install (','at replaceState (']) for (const mode of ['content','state','generation','cancel']) {
 test(`prepared consumer notice terminal ${kind}/${boundary}/${mode} preserves the final guard`, async () => {
  let calls=0;const w=fixture({handler:async()=>{calls++;return{status:'completed'};}});initial(w);const token=prepare(w);if(kind==='map')w.observe('two',1,2);else w.app.setWorldWeather(rain);
  let armed=true,injected=false;
  w.hook(({app,content,state})=>{if(!armed||!(new Error().stack||'').includes(boundary))return;armed=false;injected=true;
   if(mode==='content')return {...content,settings:{POISON_IN_FIELD:true}};
   if(mode==='state'){state.external(g=>{g.money=999;});return;}
   if(mode==='cancel'){app.cancelFieldItemHandoff(token);return;}
   app.stateReplacedByHost();state.replace(E.state.newGame({content,party:[],money:777}));w.map(3);assert.equal(w.observe('new-load',3,3,'load').status,'committed');
  });
  const result=await w.app.runFieldItemHandoff(token);assert(injected);assert.equal(calls,0);assert.notEqual(result.status,'completed');
  if(mode==='generation'){assert.deepEqual(w.state.current().world.visitedMaps,[3]);assert.equal(w.state.current().money,777);assert.deepEqual(w.app.flushWorldNotices().receipts.map(r=>r.entryId),['new-load']);}
  else if(mode==='cancel'){assert.equal(result.status,'cancelled');assert.equal(w.app.saveBlocked,false);assert.equal(w.app.flushWorldNotices().status,'drained');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),2);assert.equal(w.state.current().world.weather.type,'Rain');}
  else {assert.deepEqual(w.state.current().world.visitedMaps,[1]);assert.equal(w.state.current().world.weather.type,'None');assert.equal(w.state.current().money,mode==='state'?999:100);assert.equal(w.app.flushWorldNotices().status,'refused');assert.equal(w.app.saveBlocked,true);}
 });
}
test('prepared consumer final fact read reentry drains a new notice before the handler reads business weather',async()=>{
 let observed;const w=fixture({handler:async()=>{observed=w.app.worldFacts().weather;return{status:'completed'};}});initial(w);const token=prepare(w);let armed=true;w.onMap(()=>{if(armed){armed=false;assert.equal(w.app.setWorldWeather(snow).status,'queued');}});
 assert.equal((await w.app.runFieldItemHandoff(token)).status,'completed');assert.equal(observed.value.type,'Snow');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);
});
test('prepared owner remains exclusive while its earlier notice installs and repeated run shares the original promise',async()=>{
 let calls=0,repeat,blocked=false,run;const w=fixture({handler:async()=>{calls++;return{status:'completed'};}});initial(w);const token=prepare(w);w.app.setWorldWeather(rain);let armed=true;
 w.hook(({app})=>{if(!armed||!(new Error().stack||'').includes('at replaceState ('))return;armed=false;repeat=app.runFieldItemHandoff(token);assert.equal(app.flushWorldNotices().status,'pending');assert.throws(()=>app.beginManagement(),/operation-active/);blocked=app.saveBlocked;});
 run=w.app.runFieldItemHandoff(token);assert.equal((await run).status,'completed');assert.equal(repeat,run);assert.equal(calls,1);assert.equal(blocked,true);assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),1);
});
test('prepared run cancelled or superseded before its microtask never consumes pending old weather or inventory',async()=>{
 for(const replace of [false,true]){let calls=0;const w=fixture({handler:async()=>{calls++;return{status:'completed'};}});initial(w);const token=prepare(w);w.app.setWorldWeather(rain);const run=w.app.runFieldItemHandoff(token);
  if(replace){w.app.stateReplacedByHost();w.state.replace(E.state.newGame({content:w.content,party:[],bag:{honey:3},money:777}));w.observe('new-load',1,1,'load');}else w.app.cancelFieldItemHandoff(token);
  const result=await run;assert.notEqual(result.status,'completed');assert.equal(calls,0);assert.equal(w.state.current().world.weather.type,replace?'None':'Rain');assert.equal(E.inventory.itemQuantity(w.state.current().inventory,'honey',w.content.items),replace?3:2);assert.equal(w.app.saveBlocked,false);
 }
});

for (const chance of [0, 100, 150]) for (const cancellation of ['none', 'before-run', 'before-draw', 'after-draw']) {
  test(`R08 notice draw is once per entry at chance=${chance}, cancellation=${cancellation}`, async () => {
    let token, once = true, calls = 0;
    const w = fixture({ handler: async () => { calls++; return { status: 'completed' }; }, random: (_n, app) => {
      if (cancellation === 'after-draw' && once) { once = false; app.cancelFieldItemHandoff(token); }
      return 0;
    } });
    w.content.mapMetadata.maps[2].weather.chance = chance; initial(w); token = prepare(w); w.observe('two', 1, 2);
    if (cancellation === 'before-run') w.app.cancelFieldItemHandoff(token);
    if (cancellation === 'before-draw') w.hook(({ app }) => { if (once) { once = false; app.cancelFieldItemHandoff(token); } });
    const result = await w.app.runFieldItemHandoff(token);
    assert.equal(result.status, cancellation === 'none' ? 'failed' : 'cancelled');
    assert.equal(calls, 0); assert.deepEqual(w.draws, [100]); assert.deepEqual(w.state.current().world.visitedMaps, [1, 2]);
    assert.equal(w.state.current().world.weather.type, chance === 0 ? 'None' : 'Rain');
    assert.deepEqual(w.state.current().world.healingSpot, { mapId: 2, x: 4, y: 5 });
    assert.equal(E.inventory.itemQuantity(w.state.current().inventory, 'honey', w.content.items), 2);
    assert.equal(w.app.saveBlocked, false); const receipts = w.app.flushWorldNotices().receipts;
    assert.deepEqual(receipts.map(r => r.entryId), ['two']); assert.equal(w.app.observeWorldMapEntry(w.enter('two', 1, 2)).status, 'duplicate');
    assert.equal(w.observe('load-two', 2, 2, 'load').status, 'committed'); assert.equal(w.observe('same-two', 2, 2).status, 'unchanged'); assert.deepEqual(w.draws, [100]);
  });
}
for (const boundary of ['at GameApplication.install (', 'at replaceState (']) {
  test(`R08 terminal Content cancellation retains first roll and replans fresh state at ${boundary}`, async () => {
    const values = [0, 99]; let calls = 0;
    const w = fixture({ handler: async () => { calls++; return { status: 'completed' }; }, random: () => values.shift() });
    w.content.mapMetadata.maps[2].weather.chance = 50; initial(w); const token = prepare(w); w.observe('two', 1, 2); let once = true;
    w.hook(({ app, state }) => { if (once && (new Error().stack || '').includes(boundary)) { once = false; state.external(g => { g.money = 999; }); app.cancelFieldItemHandoff(token); } });
    const result = await w.app.runFieldItemHandoff(token); assert.equal(once, false); assert.equal(result.status, 'cancelled');
    assert.deepEqual(w.draws, [100]); assert.deepEqual(values, [99]); assert.equal(w.state.current().world.weather.type, 'Rain'); assert.equal(w.state.current().money, 999);
    assert.equal(calls, 0); assert.equal(E.inventory.itemQuantity(w.state.current().inventory, 'honey', w.content.items), 2);
    assert.equal(w.writes.length, 1); assert.deepEqual(w.app.flushWorldNotices().receipts.map(r => r.entryId), ['two']);
  });
}
test('R08 cancel and reentrant map capture retain each historical roll across mixed FIFO notices', async () => {
  const values = [0, 99]; let token, once = true;
  const w = fixture({ random: (_n, app) => {
    if (once) { once = false; w.state.external(g => { g.money = 999; }); app.cancelFieldItemHandoff(token); assert.equal(w.observe('three', 4, 3).status, 'queued'); }
    return values.shift();
  } });
  w.content.mapMetadata.maps[2].weather.chance = 50; w.content.mapMetadata.maps[4].weather.chance = 50;
  initial(w); token = prepare(w); w.observe('two', 1, 2); w.app.setWorldWeather(storm); w.observe('four', 2, 4);
  assert.equal((await w.app.runFieldItemHandoff(token)).status, 'cancelled');
  assert.deepEqual(w.draws, [100, 100]); assert.deepEqual(values, []);
  assert.deepEqual(w.writes.map(s => s.world.weather.type), ['Rain', 'Storm', 'None', 'None']);
  assert.deepEqual(w.writes.map(s => s.money), [999, 999, 999, 999]);
  assert.deepEqual(w.state.current().world.visitedMaps, [1, 2, 4, 3]); assert.deepEqual(w.state.current().world.healingSpot, { mapId: 2, x: 4, y: 5 });
  assert.deepEqual(w.app.flushWorldNotices().receipts.map(r => r.entryId ?? r.kind), ['two', 'weather-command', 'four', 'three']);
  assert.equal(w.app.world.encounterRuntime.currentMapId, 3); assert.equal(w.app.saveBlocked, false);
});
for (const boundary of ['before-draw', 'after-draw']) {
  test(`R08 generation replacement at ${boundary} retires old draw and leaves successor receipt intact`, async () => {
    const values = [0, 99]; let once = true, switched = false;
    const replace = () => { once = false; switched = true; w.app.stateReplacedByHost(); w.state.replace(E.state.newGame({ content: w.content, party: [], bag: { honey: 3 }, money: 777 })); assert.equal(w.observe('fresh', 3, 3, 'load').status, 'committed'); };
    const w = fixture({ random: () => { const value = values.shift(); if (once && boundary === 'after-draw') replace(); return value; } });
    w.content.mapMetadata.maps[2].weather.chance = 50; initial(w); const token = prepare(w); w.observe('old-two', 1, 2);
    if (boundary === 'before-draw') w.hook(() => { if (once) replace(); });
    assert.equal((await w.app.runFieldItemHandoff(token)).status, 'failed'); assert(switched);
    assert.deepEqual(w.draws, boundary === 'before-draw' ? [] : [100]); assert.deepEqual(w.state.current().world.visitedMaps, [3]); assert.equal(w.state.current().world.weather.type, 'None'); assert.equal(w.state.current().money, 777);
    assert.deepEqual(w.app.flushWorldNotices().receipts.map(r => r.entryId), ['fresh']);
    assert.equal(w.observe('successor-two', 3, 2).status, 'committed');
    assert.equal(w.state.current().world.weather.type, boundary === 'before-draw' ? 'Rain' : 'None'); assert.deepEqual(w.draws, boundary === 'before-draw' ? [100] : [100, 100]);
  });
}
for (const failure of ['invalid', 'throw']) {
  test(`R08 cancelled random ${failure} remains refused without reroll or fake map commit`, async () => {
    let token, calls = 0;
    const w = fixture({ random: (_n, app) => { calls++; app.cancelFieldItemHandoff(token); if (failure === 'throw') throw Error('random-failed'); return 100; } });
    initial(w); token = prepare(w); w.observe('two', 1, 2);
    assert.equal((await w.app.runFieldItemHandoff(token)).status, 'cancelled');
    for (let i = 0; i < 2; i++) { const out = w.app.flushWorldNotices(); assert.equal(out.status, 'refused'); assert.equal(out.reason, failure === 'throw' ? 'random-failed' : 'invalid-world-random'); assert.deepEqual(out.receipts, []); }
    assert.equal(calls, 1); assert.deepEqual(w.draws, [100]); assert.equal(w.writes.length, 0); assert.deepEqual(w.state.current().world.visitedMaps, [1]); assert.equal(w.state.current().world.weather.type, 'None'); assert.equal(w.app.saveBlocked, true);
    assert.equal(E.inventory.itemQuantity(w.state.current().inventory, 'honey', w.content.items), 2);
    w.app.stateReplacedByHost(); assert.equal(w.app.flushWorldNotices().status, 'drained'); assert.equal(w.app.saveBlocked, false);
  });
}
test('R08 cached same-type success preserves existing weather intent; missing map weather draws zero', async () => {
  let token, once = true; const w = fixture({ random: (_n, app) => { if (once) { once = false; app.cancelFieldItemHandoff(token); } return 0; } });
  initial(w); w.app.setWorldWeather(rain); w.app.flushWorldNotices(); token = prepare(w); w.observe('two', 1, 2);
  assert.equal((await w.app.runFieldItemHandoff(token)).status, 'cancelled'); assert.deepEqual(w.state.current().world.weather, rain); assert.deepEqual(w.draws, [100]);
  w.observe('three', 2, 3); assert.deepEqual(w.draws, [100]); assert.equal(w.state.current().world.weather.type, 'None');
});
