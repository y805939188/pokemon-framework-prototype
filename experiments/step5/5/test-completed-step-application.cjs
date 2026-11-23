'use strict';
// Actual built GameApplication -> WorldOperation -> InventorySession and the production field-passive plans.
// Host event/presentation adapters are synthetic; no MZ, NW, player save or reference implementation is loaded.
const { test } = require('node:test'), assert = require('node:assert/strict');
const E = require(process.env.PF55_B_ENGINE || '../../../js/engine/build/production.cjs');
const F = require('../3/fixtures-migration7/fixtures.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture(options = {}) {
  let app, held, contentCalls = 0, failReplace = false;
  const content = F.content(E), trace = [], writes = [], draws = [];
  if (options.unflagged) for (const id of ['repel', 'superrepel', 'maxrepel']) content.items[id].flags = [];
  content.abilities.immunity = { id: 'immunity', name: 'Immunity' };
  content.settings = { POISON_IN_FIELD: !!options.poison, POISON_FAINT_IN_FIELD: !!options.faint, AFFECTION_EFFECTS: false };
  let actualContent = content;
  const party = options.party || [F.member('M1', { hp: 12, friendship: 70 })];
  held = F.freeze(E.state.newGame({ party, bag: options.bag || {}, money: 123, content }));
  if (options.state) { const next = clone(held); options.state(next); held = F.freeze(next); }
  const state = {
    read() { options.onStateRead?.({ app, state, content }); return held; },
    current() { return held; },
    replace(next) { if (failReplace) throw Error('synthetic-install-failed'); writes.push(clone(next)); trace.push('install'); held = F.freeze(clone(next)); },
    external(change) { const next = clone(held); change(next); held = F.freeze(next); },
    fail(value) { failReplace = value; },
  };
  const here = { hostOwner: {}, generation: 3, map: {}, player: {}, mapId: 7, x: 4, y: 6 };
  const step = extra => ({ ...here, id: 'step-1', ice: false, regionId: 0, terrainTag: 0, sceneActive: true, ...extra });
  const host = {
    current() { options.onCurrent?.({ app, state, here }); return { ...here }; },
    async openRepelSelection(request) { trace.push('repel-selection'); return options.choose ? await options.choose({ app, state, content, request, here }) : { status: 'cancelled' }; },
    async present(request) { trace.push(request.effect.kind + (request.effect.memberId ? ':' + request.effect.memberId : '')); return options.present ? await options.present({ app, state, content, request, here }) : { status: 'completed', id: request.effect.id }; },
    dispatchArrival(request) { trace.push('arrival'); return options.arrival ? options.arrival({ app, state, content, request, here }) : { status: 'event-dispatched' }; },
  };
  app = new E.app.GameApplication({ state, content: () => { contentCalls++; const replacement = options.onContent?.({ app, state, content, calls: contentCalls }); return { content: replacement || actualContent }; },
    sessions: { async create() { throw Error('no-session-expected'); } }, projection: { project() {} },
    random: n => { draws.push(n); trace.push('random:' + n); return options.random ? options.random(n) : 0; },
    ...(options.noHost ? {} : { completedSteps: host }),
  });
  return { app, state, content, here, step, host, trace, writes, draws, replaceContent: c => { actualContent = c; },
    quantity: id => E.inventory.itemQuantity(held.inventory, id, content.items) };
}
function select(app, request, id = 'repel') {
  const selection = request.selection, view = app.itemSelectionView(selection.inventoryToken, selection.selectionId);
  const pocket = view.pockets.findIndex(rows => rows.some(row => row.item.id === id));
  assert.ok(pocket >= 0, `filtered item ${id}`);
  const index = view.pockets[pocket].find(row => row.item.id === id).index;
  return { status: 'selected', ticket: app.inventoryTicket(selection.inventoryToken, pocket + 1, index) };
}

test('D-App T01 actual completed prefix installs once before actual arrival; concurrent/repeated same identity never recount', async () => {
  const w = fixture(), step = w.step(), a = w.app.completeWorldStep(step), b = w.app.completeWorldStep(step);
  assert.equal(a, b); assert.equal(w.app.saveBlocked, true);
  const result = await a; assert.equal(result.status, 'completed'); assert.equal(result.prefix.stepCommitted, true);
  assert.equal(w.state.current().steps, 1); assert.equal(w.state.current().world.happinessSteps, 1);
  assert.deepEqual(w.trace, ['install', 'arrival']); assert.equal(w.writes.length, 1); assert.equal(w.app.saveBlocked, false);
  assert.equal((await w.app.completeWorldStep(step)).status, 'duplicate'); assert.equal(w.writes.length, 1);
  assert.equal((await w.app.completeWorldStep({ ...step, x: 9 })).reason, 'completed-step-conflict');
});
test('D-App T02/T08 no completed host call means zero steps/RNG; missing host explicitly refuses', async () => {
  const w = fixture({ noHost: true }); assert.equal(w.state.current().steps, 0); assert.deepEqual(w.draws, []);
  assert.equal((await w.app.completeWorldStep(w.step())).reason, 'completed-step-host-unavailable'); assert.equal(w.writes.length, 0);
});
for (const extra of [{ sceneActive: false }, { id: '' }, { mapId: 0 }, { x: -1 }, { ice: 1 }, { generation: -1 }]) {
  test('D-App invalid/inactive completion refuses before install or RNG ' + JSON.stringify(extra), async () => {
    const w = fixture({ state: g => { g.world.happinessSteps = 127; } });
    const result = await w.app.completeWorldStep(w.step(extra)); assert.equal(result.status, 'refused'); assert.equal(w.writes.length, 0); assert.deepEqual(w.draws, []); assert.equal(w.app.saveBlocked, false);
  });
}
test('D-App R09 actual consumer draws per usable member in order, including friendship255, before install/arrival', async () => {
  const w = fixture({ party: [F.member('M1', { hp: 12, friendship: 70 }), F.member('M2', { hp: 0, friendship: 80 }), F.member('M3', { hp: 12, friendship: 255 }), F.member('M4', { hp: 12, friendship: 90, isEgg: true })], state: g => { g.world.happinessSteps = 127; } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'completed');
  assert.deepEqual(w.draws, [2, 2]); assert.deepEqual(w.trace, ['random:2', 'random:2', 'install', 'arrival']);
  assert.deepEqual(w.state.current().party.map(m => m.friendship), [72, 80, 255, 90]); assert.equal(w.state.current().world.happinessSteps, 0);
});
test('D-App R09 happiness126 zero RNG and invalid walking RNG leaves whole prefix uninstalled', async () => {
  const w = fixture({ state: g => { g.world.happinessSteps = 126; } }); await w.app.completeWorldStep(w.step()); assert.deepEqual(w.draws, []);
  const bad = fixture({ state: g => { g.world.happinessSteps = 127; }, random: () => 2 });
  assert.equal((await bad.app.completeWorldStep(bad.step())).status, 'failed'); assert.equal(bad.writes.length, 0); assert.equal(bad.state.current().steps, 0);
});
test('D-App T03 arrival ack preserves event/action/blocked distinctions; ordinary is explicitly unhandled with zero encounter RNG', async () => {
  for (const arrival of [{ status: 'event-dispatched' }, { status: 'action-dispatched' }, { status: 'blocked', reason: 'event-running' }, { status: 'ordinary-opportunity' }]) {
    const w = fixture({ arrival: () => arrival }), result = await w.app.completeWorldStep(w.step());
    assert.equal(result.status, arrival.status === 'ordinary-opportunity' ? 'ordinary-unhandled' : 'completed');
    if (result.status === 'completed') assert.deepEqual(result.arrival, arrival);
    else assert.equal(result.reason, 'ordinary-encounter-handler-unavailable');
    assert.equal(w.trace.filter(s => s === 'arrival').length, 1); assert.deepEqual(w.draws, []);
  }
});
test('D-App T04 repel1->0 keeps starting protection; renewal stock/count/effect are one atomic second install', async () => {
  const w = fixture({ bag: { repel: 2, potion: 3 }, state: g => { g.world.repelSteps = 1; }, choose: ({ app, request }) => select(app, request) });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'completed');
  assert.equal(result.prefix.repelActiveAtStart, true); assert.equal(result.prefix.repelRenewed, true);
  assert.equal(w.writes.length, 2); assert.equal(w.writes[0].world.repelSteps, 0); assert.equal(w.writes[0].stats.repel_count, 0);
  assert.equal(E.inventory.itemQuantity(w.writes[0].inventory, 'repel', w.content.items), 2);
  assert.equal(w.writes[1].world.repelSteps, 100); assert.equal(w.writes[1].stats.repel_count, 1); assert.equal(w.quantity('repel'), 1);
  await w.app.completeWorldStep(w.step()); assert.equal(w.quantity('repel'), 1); assert.equal(w.state.current().stats.repel_count, 1);
});
test('D-App T04 cancellation retains prefix, runs poison and arrival; ice neither decrements nor opens renewal', async () => {
  const w = fixture({ bag: { repel: 2 }, state: g => { g.world.repelSteps = 1; } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'completed'); assert.equal(w.state.current().world.repelSteps, 0); assert.equal(w.quantity('repel'), 2);
  assert.deepEqual(w.trace, ['install', 'repel-selection', 'arrival']); assert.equal(result.prefix.repelActiveAtStart, true);
  const ice = fixture({ bag: { repel: 1 }, state: g => { g.world.repelSteps = 1; } }); await ice.app.completeWorldStep(ice.step({ ice: true }));
  assert.equal(ice.state.current().world.repelSteps, 1); assert.equal(ice.trace.includes('repel-selection'), false);
});
test('D-App T04 expiry without remaining repel awaits one exact presentation ack before arrival', async () => {
  const wait = deferred(), w = fixture({ state: g => { g.world.repelSteps = 1; }, present: () => wait.promise });
  const pending = w.app.completeWorldStep(w.step()); await tick(); assert.equal(w.app.saveBlocked, true); assert.equal(w.trace.includes('arrival'), false);
  wait.resolve({ status: 'completed', id: 1 }); assert.equal((await pending).status, 'completed'); assert.deepEqual(w.trace, ['install', 'repel-expired', 'arrival']);
});
test('D-App legacy repel flags cover all three defaults; effect family alone never enters renewal selection', async () => {
  const catalog = E.itemCatalog.legacyCatalog();
  for (const id of ['repel', 'superrepel', 'maxrepel']) assert.equal(E.itemCatalog.hasFlag(catalog[id], 'Repel'), true);
  assert.equal(E.itemCatalog.hasFlag(catalog.potion, 'Repel'), false);
  const w = fixture({ bag: { repel: 2 }, unflagged: true, state: g => { g.world.repelSteps = 1; } });
  assert.equal((await w.app.completeWorldStep(w.step())).status, 'completed');
  assert.deepEqual(w.trace, ['install', 'repel-expired', 'arrival']); assert.equal(w.quantity('repel'), 2);
});
test('D-App O1 fixed Repel filter and actual issued parent/child identity open only read-only selection', async () => {
  const w = fixture({ bag: { repel: 2, superrepel: 1, potion: 3 }, state: g => { g.world.repelSteps = 1; }, choose: async ({ app, request }) => {
    const s = request.selection, token = s.inventoryToken;
    assert.equal(app.isOwnedRepelSelection(request.owner, s), true);
    assert.equal(app.isOwnedRepelSelection({ ...request.owner }, s), false);
    assert.equal(app.isOwnedRepelSelection(request.owner, { ...s }), false);
    assert.equal(app.isOwnedRepelSelection(request.owner, { ...s, child: { ...s.child } }), false);
    const view = app.itemSelectionView(token, s.selectionId); assert.deepEqual(view.pockets.flat().map(row => row.item.id).sort(), ['repel', 'superrepel']);
    assert.deepEqual(app.inventorySnapshot(token).pockets.flat().map(row => row.item.id).sort(), ['repel', 'superrepel']);
    assert.throws(() => app.inventorySnapshot(token, () => true), /filter-fixed/);
    app.browseItemSelection(token, s.selectionId, 1, 0);
    assert.equal(app.inventoryRequest(token, 'steal', { kind: 'remove-items', itemId: 'repel', quantity: 1 }).reason, 'world-selection-owned');
    assert.equal(app.finishItemSelection(token, s.selectionId, 'wrong-finish', 'repel').reason, 'world-selection-owned');
    assert.equal(app.endInventoryOperation(token).reason, 'world-selection-owned');
    assert.equal(app.beginInventorySort(token, 1, 0).status, 'refused');
    assert.throws(() => app.beginInventoryOperation(), /active/);
    assert.equal(app.healParty().status, 'refused'); assert.equal(app.recordSteps().status, 'refused');
    assert.equal(app.setWorldWeather({ type: 'Rain', strength: 60, durationFrames: 0 }).status, 'queued');
    assert.equal(w.state.current().world.weather.type, 'None');
    await assert.rejects(app.startBattle({ battleId: 'other', kind: 'wild', foes: [{ species: 'A', level: 5 }], seq: 1 }), /active/);
    return select(app, request, 'superrepel');
  } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'completed', JSON.stringify(result)); assert.equal(w.state.current().world.repelSteps, 200); assert.equal(w.quantity('superrepel'), 0); assert.equal(w.quantity('repel'), 2); assert.equal(w.state.current().world.weather.type, 'Rain');
});
for (const edit of [ticket => { ticket.generation++; }, ticket => { ticket.revision += '-old'; }, ticket => { ticket.contentRevision = 'forged'; }, ticket => { ticket.quantity++; }, ticket => { ticket.itemId = 'potion'; }, ticket => { ticket.index++; }, ticket => { ticket.token += '-other'; }]) {
  test('D-App T11 forged/stale formal ticket cannot renew or consume ' + edit.toString(), async () => {
    const w = fixture({ bag: { repel: 2, potion: 1 }, state: g => { g.world.repelSteps = 1; }, choose: ({ app, request }) => { const reply = select(app, request); edit(reply.ticket); return reply; } });
    const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'failed'); assert.equal(result.prefix.stepCommitted, true); assert.equal(result.prefix.repelRenewed, false);
    assert.equal(w.quantity('repel'), 2); assert.equal(w.state.current().world.repelSteps, 0); assert.equal(w.state.current().stats.repel_count, 0); assert.equal(w.trace.includes('arrival'), false); assert.equal(w.app.saveBlocked, false);
  });
}
test('D-App T05 cancelled old owner releases immediately; late reply cannot consume or release new owner', async () => {
  const first = deferred(), second = deferred(); let calls = 0, firstRequest;
  const w = fixture({ bag: { repel: 2 }, state: g => { g.world.repelSteps = 1; }, choose: ({ request }) => { firstRequest = request; return first.promise; },
    present: () => { calls++; return second.promise; } });
  const old = w.app.completeWorldStep(w.step()); await tick(); const saved = firstRequest;
  assert.equal(w.app.cancelCompletedWorldStep('step-1').status, 'unchanged'); assert.equal(w.app.saveBlocked, false);
  assert.equal(w.app.isOwnedRepelSelection(saved.owner, saved.selection), false);
  w.state.external(g => { g.world.repelSteps = 1; g.inventory = E.inventory.removeItems(g.inventory, 'repel', 2, w.content.items); });
  const fresh = w.app.completeWorldStep(w.step({ id: 'step-2' })); await tick(); assert.equal(calls, 1); assert.equal(w.app.saveBlocked, true);
  first.resolve({ status: 'cancelled' }); assert.equal((await old).status, 'cancelled'); assert.equal(w.app.saveBlocked, true);
  assert.equal(w.app.cancelCompletedWorldStep('step-1').status, 'duplicate'); assert.equal(w.app.saveBlocked, true);
  second.resolve({ status: 'completed', id: 1 }); assert.equal((await fresh).status, 'completed'); assert.equal(w.state.current().steps, 2);
});
for (const change of ['generation', 'map', 'player', 'hostOwner', 'x', 'party', 'inventory', 'content']) {
  test('D-App T05 late continuation after ' + change + ' change cannot continue or consume', async () => {
    const wait = deferred(); let request;
    const w = fixture({ bag: { repel: 2 }, state: g => { g.world.repelSteps = 1; }, choose: context => { request = context.request; return wait.promise; } });
    const pending = w.app.completeWorldStep(w.step()); await tick(); const reply = select(w.app, request);
    if (change === 'generation') w.app.stateReplacedByHost();
    else if (['map', 'player', 'hostOwner'].includes(change)) w.here[change] = {};
    else if (change === 'x') w.here.x++;
    else if (change === 'party') w.state.external(g => { g.party[0].friendship++; });
    else if (change === 'inventory') w.state.external(g => { g.inventory.pockets.flat().find(slot => slot.itemId === 'repel').quantity++; });
    else w.replaceContent({ ...w.content, settings: { ...w.content.settings, POISON_IN_FIELD: true } });
    const before = clone(w.state.current()); wait.resolve(reply); const result = await pending;
    assert.ok(['failed', 'cancelled'].includes(result.status), JSON.stringify(result)); assert.deepEqual(w.state.current(), before); assert.equal(w.trace.includes('arrival'), false); assert.equal(w.app.saveBlocked, false);
  });
}
test('D-App observed content ABA cannot revive child or step', async () => {
  const wait = deferred(); let request;
  const w = fixture({ bag: { repel: 2 }, state: g => { g.world.repelSteps = 1; }, choose: c => { request = c.request; return wait.promise; } });
  const pending = w.app.completeWorldStep(w.step()); await tick(); const reply = select(w.app, request);
  w.replaceContent({ ...w.content, settings: { ...w.content.settings, POISON_IN_FIELD: true } });
  assert.equal(w.app.isOwnedRepelSelection(request.owner, request.selection), false); w.replaceContent(w.content);
  assert.equal(w.app.isOwnedRepelSelection(request.owner, request.selection), false); wait.resolve(reply);
  assert.equal((await pending).status, 'failed'); assert.equal(w.quantity('repel'), 2);
});
for (const [poison, faint] of [[false, false], [false, true], [true, false], [true, true]]) {
  test(`D-App poison actual consumer switches ${poison}/${faint}, feedback once and per-member commits`, async () => {
    const w = fixture({ poison, faint, party: [F.member('M1', { hp: 2, friendship: 70, status: 'psn', statusCount: 0 }), F.member('M2', { hp: 1, friendship: 80, status: 'psn', statusCount: 1 }), F.member('M3', { hp: 12, friendship: 90, status: 'psn', ability: 'Immunity' })], state: g => { g.steps = 3; } });
    const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.deepEqual(w.state.current().party.map(m => m.hp), poison ? [1, faint ? 0 : 1, 12] : [2, 1, 12]);
    assert.equal(result.prefix.poisonMembersCommitted, poison ? 2 : 0); assert.equal(w.trace.filter(s => s === 'poison-feedback').length, poison ? 1 : 0);
    assert.equal(w.writes.length, poison ? 3 : 1); assert.equal(w.state.current().money, 123); assert.equal(w.trace.at(-1), 'arrival');
  });
}
test('D-App poison full-party faint returns explicit F handoff after message, with no money/false return completion', async () => {
  const w = fixture({ poison: true, faint: true, party: [F.member('M1', { hp: 1, friendship: 70, status: 'psn' })], state: g => { g.steps = 3; } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'blackout-required'); assert.equal(result.prefix.poisonMembersCommitted, 1);
  assert.deepEqual(w.trace, ['install', 'poison-feedback', 'install', 'poison-message:M1']); assert.equal(w.state.current().party[0].hp, 0); assert.equal(w.state.current().party[0].friendship, 69); assert.equal(w.state.current().money, 123); assert.equal(w.state.current().stats.blacked_out_count, 0);
});
test('D-App poison non-fourth step and feedback failure never install member damage', async () => {
  const w = fixture({ poison: true, party: [F.member('M1', { hp: 5, friendship: 70, status: 'psn' })], state: g => { g.steps = 2; } });
  await w.app.completeWorldStep(w.step()); assert.equal(w.state.current().party[0].hp, 5); assert.equal(w.trace.includes('poison-feedback'), false);
  const failed = fixture({ poison: true, party: [F.member('M1', { hp: 5, friendship: 70, status: 'psn' })], state: g => { g.steps = 3; }, present: ({ request }) => ({ id: request.effect.id, status: 'failed', reason: 'synthetic-feedback-failure' }) });
  assert.equal((await failed.app.completeWorldStep(failed.step())).reason, 'synthetic-feedback-failure'); assert.equal(failed.writes.length, 1); assert.equal(failed.state.current().party[0].hp, 5); assert.equal(failed.state.current().steps, 4);
});
test('D-App poison message waits with owner retained; changed party order stops later member instead of stale snapshot damage', async () => {
  const wait = deferred(), w = fixture({ poison: true, party: [F.member('M1', { hp: 2, friendship: 70, status: 'psn' }), F.member('M2', { hp: 5, friendship: 80, status: 'psn' })], state: g => { g.steps = 3; },
    present: ({ request }) => request.effect.kind === 'poison-message' ? wait.promise : { id: request.effect.id, status: 'completed' } });
  const pending = w.app.completeWorldStep(w.step()); await tick(); assert.equal(w.app.saveBlocked, true); assert.equal(w.state.current().party[0].hp, 1); assert.equal(w.state.current().party[1].hp, 5);
  w.state.external(g => { g.party.reverse(); }); wait.resolve({ id: 2, status: 'completed' }); assert.equal((await pending).status, 'failed'); assert.equal(w.state.current().party.find(m => m.id === 'M2').hp, 5); assert.equal(w.trace.includes('arrival'), false);
});
test('D-App failed renewal install retains prefix without partial stock/count/repel write', async () => {
  const w = fixture({ bag: { repel: 2 }, state: g => { g.world.repelSteps = 1; }, choose: ({ app, request, state }) => { const reply = select(app, request); state.fail(true); return reply; } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'failed'); assert.equal(result.prefix.stepCommitted, true); assert.equal(result.prefix.repelRenewed, false); assert.equal(w.quantity('repel'), 2); assert.equal(w.state.current().world.repelSteps, 0); assert.equal(w.state.current().stats.repel_count, 0);
});
test('D-App terminal R4 guards reject content swap/cancel/replacement at both actual install validation callbacks', async () => {
  for (const stage of ['prefix', 'renewal', 'poison-member']) for (const boundary of [1, 2]) for (const mode of ['content', 'cancel', 'generation']) {
    let armed = false, count = 0, injected = false;
    const options = { bag: stage === 'renewal' ? { repel: 2 } : {}, poison: stage === 'poison-member',
      party: [F.member('M1', { hp: 5, friendship: 70, status: stage === 'poison-member' ? 'psn' : '' })],
      state: g => { if (stage === 'renewal') g.world.repelSteps = 1; if (stage === 'poison-member') g.steps = 3; },
      choose: ({ app, request }) => { const reply = select(app, request); armed = true; count = 0; return reply; },
      present: ({ request }) => { if (stage === 'poison-member') { armed = true; count = 0; } return { id: request.effect.id, status: 'completed' }; },
      onContent: ({ app, content }) => {
        // Inject at each real final validation read, rather than a guessed earlier content-read count.
        const target = boundary === 1 ? 'at GameApplication.install (' : 'at replaceState (';
        if (!armed || !(new Error().stack || '').includes(target)) return;
        armed = false; injected = true; count++;
        if (mode === 'content') return { ...content, settings: { ...content.settings, POISON_FAINT_IN_FIELD: !content.settings.POISON_FAINT_IN_FIELD } };
        if (mode === 'cancel') app.cancelCompletedWorldStep('step-1'); else app.stateReplacedByHost();
      },
    };
    const w = fixture(options); if (stage === 'prefix') armed = true;
    const result = await w.app.completeWorldStep(w.step());
    assert.equal(injected, true, `${stage}/${boundary}/${mode} target injection reached`);
    assert.ok(['failed', 'cancelled'].includes(result.status), `${stage}/${boundary}/${mode}: ${JSON.stringify(result)} content=${count}`);
    const expectedWrites = stage === 'prefix' ? 0 : 1; assert.equal(w.writes.length, expectedWrites, `${stage}/${boundary}/${mode}`);
    assert.equal(result.prefix.repelRenewed, false); assert.equal(result.prefix.poisonMembersCommitted, 0);
  }
});
