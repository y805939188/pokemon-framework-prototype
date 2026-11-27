'use strict';
// WP59 §5 / WP12 §5.2 / WP28 §3.3 and WT13–21/27; formal-spec-derived, no reference runtime.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
require('../../../scripts/tests/ts-source-loader.cjs');
const modulePromise = import(pathToFileURL(path.resolve(__dirname, '../../../src/framework/rules/field-moves.ts')).href);
const value = value => ({ status: 'value', value });
const absent = { status: 'absent' };
const unavailable = { status: 'unavailable', reason: 'fixture-provider-offline' };
const copy = value => JSON.parse(JSON.stringify(value));
const event = (name = 'prefix_CutTree_suffix') => ({ mapId: 7, eventId: 3, name, jumping: false, overTrigger: false });
const member = (moveId, extra = {}) => ({ id: 'actor', species: 'fixture', form: 0, level: 5, exp: 0, status: '', item: '', ability: '', nature: 'Hardy', gender: 'N', isEgg: false, hp: 0, moves: [{ id: moveId, pp: 0, maxpp: 10 }], ...extra });
const companion = () => ({ originMapId: 7, originEventId: 9, name: 'fixture', location: { mapId: 7, x: 2, y: 3, direction: 2 }, visible: true, appearance: { characterName: 'fixture', characterIndex: 0, tileId: 0, pattern: 0, opacity: 255, blendMode: 0, walkAnime: true, stepAnime: false } });
function input(moveId = 'cut', entry = 'party', extra = {}) {
  const result = { moveId, entry, memberId: 'actor', context: { party: [member(moveId)], badges: Array(8).fill(true), world: { flashUsed: false, surfing: false, companions: [], weather: { type: 'None', strength: 0, durationFrames: 0 } }, local: { strengthUsed: false }, facts: { mapMetadata: value({ darkMap: true, alwaysBicycle: false }), facingEvent: value(event(moveId === 'rocksmash' ? 'SMASHROCK' : moveId === 'strength' ? 'strengthboulder' : undefined)), facingTerrain: value({ canSurf: true, waterfall: false, waterfallCrest: false }), facingPassable: value(true), facingPoint: value({ mapId: 7, x: 4, y: 5 }), direction: value(6), flashMask: value(true) } } };
  return { ...result, ...extra, context: { ...result.context, ...extra.context, facts: { ...result.context.facts, ...extra.context?.facts }, world: { ...result.context.world, ...extra.context?.world }, local: { ...result.context.local, ...extra.context?.local } } };
}
const actions = plan => plan.steps.map(step => step.kind === 'host' ? step.action : step.kind);
function simulate(plan, failAction, state = { surfing: false, flashUsed: false, strengthUsed: false, stats: {}, resets: 0, surfBase: null, endingSurf: false, hosts: [] }) {
  const reached = [];
  for (const step of plan.steps) {
    if (step.kind === 'host' && step.action === failAction) return { state, reached, failed: true };
    reached.push(step.kind === 'host' ? step.action : step.kind);
    if (step.kind === 'commit') {
      Object.assign(state, step.world, step.local);
      for (const item of step.stats ?? []) state.stats[item.counter] = (state.stats[item.counter] ?? 0) + item.delta;
    } else if (step.kind === 'reset-encounters') state.resets++;
    else if (step.kind === 'runtime') {
      if ('surfBase' in step) state.surfBase = step.surfBase === null ? null : { ...step.surfBase };
      if ('endingSurf' in step) state.endingSurf = step.endingSurf;
    } else if (step.kind === 'host') state.hosts.push(step.action);
  }
  return { state, reached, failed: false };
}

test('E2 exports only the six approved local families and their badge defaults', async () => {
  const m = await modulePromise;
  assert.deepEqual(m.FIELD_MOVE_IDS, ['cut', 'rocksmash', 'strength', 'surf', 'flash', 'sweetscent']);
  for (const [move, badge] of [['cut', 1], ['flash', 2], ['rocksmash', 3], ['surf', 4], ['strength', 6]]) {
    const good = input(move, 'party', { context: { badges: Array(badge).fill(true) } });
    assert.equal(m.qualifyFieldMove(good).status, 'ready');
    good.context.badges.pop(); assert.equal(m.qualifyFieldMove(good).reason, 'badge-required');
  }
});
test('T25 count/index, debug and negative badge rules preserve zero-based positions', async () => {
  const m = await modulePromise;
  assert.equal(m.fieldMoveBadgeAllowed([true], 1, true), true);
  assert.equal(m.fieldMoveBadgeAllowed([true], 1, false), false);
  assert.equal(m.fieldMoveBadgeAllowed([false, true], 1, false), true);
  assert.equal(m.fieldMoveBadgeAllowed([], -1, false), true);
  assert.equal(m.fieldMoveBadgeAllowed([], 6, false, true), true);
  assert.equal(m.fieldMoveBadgeAllowed([], Number.MAX_SAFE_INTEGER, false), false);
  assert.throws(() => m.fieldMoveBadgeAllowed([], 0.5, true));
  const i = input('cut', 'party', { context: { badges: [true], content: { settings: { FIELD_MOVES_COUNT_BADGES: false } } } });
  assert.equal(m.qualifyFieldMove(i).reason, 'badge-required');
});
for (const moveId of ['cut', 'rocksmash', 'strength', 'surf', 'flash', 'sweetscent']) {
  test(`T25 ${moveId}: fainted non-egg with zero PP qualifies; egg/unknown member/missing move refuse even DEBUG`, async () => {
    const m = await modulePromise;
    assert.equal(m.qualifyFieldMove(input(moveId)).status, 'ready');
    for (const actor of [member(moveId, { isEgg: true }), member('tackle'), member(moveId, { id: 'other' })]) {
      const result = m.qualifyFieldMove(input(moveId, 'shortcut', { context: { debug: true, party: [actor] } }));
      assert.equal(result.reason, 'move-member-required');
    }
  });
}
test('T25 direct DEBUG bypasses member/badge while menu always requires an actual learned move', async () => {
  const m = await modulePromise;
  const i = input('cut', 'direct', { memberId: undefined, context: { debug: true, badges: [], party: [], facts: { facingEvent: absent } } });
  assert.equal(m.qualifyFieldMove(i).status, 'ready');
  i.entry = 'party'; assert.equal(m.qualifyFieldMove(i).reason, 'move-member-required');
  assert.equal(m.qualifyFieldMove(input('flash', 'direct')).reason, 'entry-not-supported');
  assert.equal(m.qualifyFieldMove(input('surf', 'honey')).reason, 'entry-not-supported');
});
for (const [moveId, marker] of [['cut', 'cuttree'], ['rocksmash', 'smashrock']]) {
  test(`T25 ${moveId}: full case-insensitive substring, face predicates and direct no-target distinction`, async () => {
    const m = await modulePromise;
    assert.equal(m.qualifyFieldMove(input(moveId, 'party', { context: { facts: { facingEvent: value(event('x' + marker.toUpperCase() + 'y')) } } })).status, 'ready');
    for (const f of [absent, value(event('tree')), value({ ...event(marker), jumping: true }), value({ ...event(marker), overTrigger: true })]) {
      assert.equal(m.qualifyFieldMove(input(moveId, 'party', { context: { facts: { facingEvent: f } } })).status, 'refused');
      assert.equal(m.qualifyFieldMove(input(moveId, 'direct', { context: { facts: { facingEvent: f } } })).status, 'ready');
    }
    assert.equal(m.qualifyFieldMove(input(moveId, 'party', { context: { facts: { facingEvent: unavailable } } })).status, 'unavailable');
  });
  test(`T25 ${moveId}: direct confirmation and menu event changes have different stage prefixes`, async () => {
    const m = await modulePromise, direct = m.planFieldMove(input(moveId, 'direct')), menu = m.planFieldMove(input(moveId));
    assert.deepEqual(actions(direct), ['confirm-direct', 'animate', 'commit']);
    assert.deepEqual(actions(menu).slice(0, 5), ['animate', 'commit', 'sound', 'erase-event', 'register-erasure']);
    assert.equal(actions(menu).includes('confirm-direct'), false);
    assert.deepEqual(simulate(direct, 'confirm-direct').state.stats, {});
    assert.equal(simulate(menu, 'sound').state.stats[moveId === 'cut' ? 'cut_count' : 'rock_smash_count'], 1);
  });
}
test('T25 companions gate Surf only; Cut/RockSmash/Strength/Flash/SweetScent stay available', async () => {
  const m = await modulePromise;
  for (const moveId of m.FIELD_MOVE_IDS) assert.equal(m.qualifyFieldMove(input(moveId, 'party', { context: { world: { companions: [companion()] } } })).status, moveId === 'surf' ? 'refused' : 'ready');
});
test('T25 Strength activation is separate from exact boulder interaction and push statistics', async () => {
  const m = await modulePromise;
  assert.equal(m.qualifyFieldMove(input('strength', 'party', { context: { facts: { facingEvent: absent } } })).status, 'ready');
  assert.equal(m.qualifyFieldMove(input('strength', 'interaction', { context: { facts: { facingEvent: value(event('boulder')) } } })).status, 'refused');
  assert.equal(m.qualifyFieldMove(input('strength', 'interaction', { context: { facts: { facingEvent: value(event('xSTRENGTHBOULDER2')) } } })).status, 'ready');
  assert.equal(m.qualifyFieldMove(input('strength', 'direct', { context: { local: { strengthUsed: true } } })).reason, 'strength-already-used');
  const plan = m.planFieldMove(input('strength'));
  assert.deepEqual(actions(plan), ['animate', 'commit']);
  assert.deepEqual(simulate(plan).state.stats, {}); assert.equal(simulate(plan).state.strengthUsed, true);
});
test('T25 Strength strict rejection is zero writes; accepted move attempts count even if no displacement', async () => {
  const m = await modulePromise, common = { strengthUsed: true, target: value(event('strengthboulder')), direction: value(4), strictPassable: value(true) };
  assert.equal(m.planStrengthPush({ ...common, strictPassable: value(false) }).status, 'refused');
  assert.equal(m.planStrengthPush({ ...common, strictPassable: unavailable }).status, 'unavailable');
  const start = m.planStrengthPush(common); assert.deepEqual(actions(start), ['commit', 'move-event-step']);
  assert.equal(start.steps[1].direction, 4);
  assert.equal(simulate(start, 'move-event-step').state.stats.strength_push_count, 1);
  assert.deepEqual(actions(m.planStrengthPushCompletion({ target: common.target, moved: value(false), recordAvailable: value(true), playSound: false })), ['record-event-position']);
  assert.deepEqual(actions(m.planStrengthPushCompletion({ target: common.target, moved: value(true), recordAvailable: value(true), playSound: true })), ['record-event-position', 'sound', 'wait-event-movement']);
  assert.deepEqual(actions(m.planStrengthPushCompletion({ target: common.target, moved: value(true), recordAvailable: value(false), playSound: false })), ['wait-event-movement']);
  assert.deepEqual(actions(m.planStrengthPush({ ...common, strengthUsed: false, strictPassable: unavailable })), []);
});
test('T25 Surf direct checks differ from party/interaction terrain, bicycle, state and passability gates', async () => {
  const m = await modulePromise;
  for (const patch of [{ world: { surfing: true } }, { facts: { mapMetadata: value({ alwaysBicycle: true }) } }, { facts: { facingTerrain: value({ canSurf: false, waterfall: false, waterfallCrest: false }) } }, { facts: { facingTerrain: value({ canSurf: true, waterfall: true, waterfallCrest: false }) } }, { facts: { facingTerrain: value({ canSurf: true, waterfall: false, waterfallCrest: true }) } }, { facts: { facingPassable: value(false) } }]) {
    assert.equal(m.qualifyFieldMove(input('surf', 'party', { context: patch })).status, 'refused');
    assert.equal(m.qualifyFieldMove(input('surf', 'interaction', { context: patch })).status, 'refused');
    assert.equal(m.qualifyFieldMove(input('surf', 'direct', { context: patch })).status, 'ready');
  }
});
test('T25 Surf starts once before attempted nonordinary jump; failed jump preserves committed prefix', async () => {
  const m = await modulePromise, plan = m.planFieldMove(input('surf'));
  assert.deepEqual(actions(plan), ['animate', 'commit', 'cancel-vehicles', 'reset-encounters', 'commit', 'project-surfing', 'runtime', 'jump-forward']);
  const fail = simulate(plan, 'jump-forward');
  assert.equal(fail.state.surfing, true); assert.equal(fail.state.stats.surf_count, 1); assert.equal(fail.state.resets, 1);
  assert.equal(plan.steps.at(-1).movement, 'surf-transition');
  assert.equal(plan.steps.at(-1).direction, 6);
  assert.equal(plan.steps.some(step => step.kind === 'ordinary-step'), false);
  assert.equal(m.planFieldMove(input('surf', 'direct', { context: { facts: { facingPoint: unavailable } } })).status, 'unavailable');
});
test('T25 Surf landing begins only on actual successful land jump; cleanup requires scene/player/base', async () => {
  const m = await modulePromise;
  const departure = { mapId: 7, x: 4, y: 5 }, active = { surfing: true, endingSurf: false, departure };
  assert.equal(m.qualifySurfLanding({ surfing: true, facingSurfable: value(false), departure: value(departure) }).status, 'ready');
  assert.equal(m.qualifySurfLanding({ surfing: false, facingSurfable: unavailable, departure: value(departure) }).status, 'refused');
  assert.equal(m.qualifySurfLanding({ surfing: true, facingSurfable: value(true), departure: value(departure) }).status, 'refused');
  assert.deepEqual(actions(m.planSurfLandingCompletion(value(false), active)), []);
  const completed = m.planSurfLandingCompletion(value(true), active); assert.equal(completed.steps[0].endingSurf, true); assert.equal(completed.steps.length, 1);
  const c = { mapScene: value(true), playerNotification: value(true), surfBase: { mapId: 7, x: 4, y: 5 }, endingSurf: true };
  assert.deepEqual(actions(m.planSurfStepCleanup(c)), ['runtime', 'commit', 'cancel-vehicles', 'reset-encounters', 'restore-map-bgm', 'runtime']);
  for (const patch of [{ mapScene: value(false) }, { playerNotification: value(false) }, { surfBase: null }]) assert.deepEqual(actions(m.planSurfStepCleanup({ ...c, ...patch })), []);
  assert.deepEqual(actions(m.planSurfStepCleanup({ ...c, endingSurf: false })), ['runtime']);
});
test('T18 Flash requires dark metadata and unused flag; missing metadata means nondark while unavailable stays unavailable', async () => {
  const m = await modulePromise;
  assert.equal(m.qualifyFieldMove(input('flash', 'party', { context: { facts: { mapMetadata: absent } } })).reason, 'not-dark-map');
  assert.equal(m.qualifyFieldMove(input('flash', 'party', { context: { facts: { mapMetadata: unavailable } } })).status, 'unavailable');
  assert.equal(m.qualifyFieldMove(input('flash', 'party', { context: { world: { flashUsed: true } } })).reason, 'flash-already-used');
  assert.equal(m.qualifyFieldMove(input('flash', 'party', { context: { facts: { mapMetadata: value({ darkMap: 'yes' }) } } })).status, 'invalid');
});
test('T18 Flash mask/prelude failures write zero; expansion failure retains flag and one count', async () => {
  const m = await modulePromise;
  assert.equal(m.planFieldMove(input('flash', 'party', { context: { facts: { flashMask: value(false) } } })).reason, 'flash-mask-required');
  assert.equal(m.planFieldMove(input('flash', 'party', { context: { facts: { flashMask: unavailable } } })).status, 'unavailable');
  const plan = m.planFieldMove(input('flash'));
  assert.deepEqual(actions(plan), ['animate', 'flash-text', 'commit', 'expand-flash-mask']);
  for (const fail of ['animate', 'flash-text']) { const r = simulate(plan, fail); assert.equal(r.state.flashUsed, false); assert.deepEqual(r.state.stats, {}); }
  const after = simulate(plan, 'expand-flash-mask'); assert.equal(after.state.flashUsed, true); assert.equal(after.state.stats.flash_count, 1);
});
test('T25/R11 SweetScent weather blocks before red screen/type/RNG; menu and Honey still report effect success', async () => {
  const m = await modulePromise;
  for (const type of ['Rain', 'Storm', 'Snow', 'Blizzard', 'Sandstorm', 'HeavyRain', 'Sun', 'Fog']) for (const entry of ['party', 'direct', 'honey']) {
    const p = m.planFieldMove(input('sweetscent', entry, { context: { world: { weather: { type, strength: 6, durationFrames: 0 } } } }));
    assert.equal(p.status, 'planned'); assert.equal(p.outcome, 'weather-blocked'); assert.deepEqual(p.steps, []); assert.equal(p.effectSuccess, entry === 'direct' ? null : true);
  }
});
test('T25/IU35 SweetScent None requests active current type without probability/admission; Honey has no inventory write', async () => {
  const m = await modulePromise;
  for (const entry of ['party', 'direct', 'honey']) {
    const p = m.planFieldMove(input('sweetscent', entry));
    assert.equal(p.effectSuccess, entry === 'direct' ? null : true);
    const request = p.steps.at(-1); assert.equal(request.kind, 'request-encounter'); assert.equal(request.source, 'sweet-scent'); assert.equal(request.trigger, 'skip'); assert.equal(request.allowance, 'skip'); assert.equal(request.type, 'current');
    assert.equal(p.steps.some(s => s.kind === 'commit'), false);
  }
  assert.equal(m.qualifyFieldMove(input('sweetscent', 'honey', { context: { party: [], badges: [] } })).status, 'ready');
});
test('R11 RockSmash effect uses an explicit active request; battle count is deferred until actual start', async () => {
  const m = await modulePromise, p = m.planFieldMove(input('rocksmash')), request = p.steps.at(-1);
  assert.deepEqual(request, { kind: 'request-encounter', source: 'rock-smash', type: 'RockSmash', trigger: 'rock-smash', allowance: 'skip', onBattleStartedStat: 'rock_smash_battles' });
  assert.equal(simulate(p).state.stats.rock_smash_battles, undefined);
  assert.equal(actions(m.planFieldMove(input('rocksmash', 'direct'))).includes('request-encounter'), false);
});
test('R11 RockSmash delegates C probability exactly once at 49/50 and preserves active counters', async () => {
  const m = await modulePromise, base = { table: { stepChance: 50, slots: [{ species: 'a', weight: 1, minLevel: 2, maxLevel: 2 }] }, runtime: { graceSteps: 1, accumulator: 999 }, party: [], local: { lowerEncounterRate: false, higherEncounterRate: false }, weatherCategory: 'None', moreAbilities: true, disabled: false, playerPresent: true, debugControl: false, cycling: false };
  for (const roll of [49, 50]) { const trace = [], r = m.checkRockSmashTrigger(base, n => { trace.push(n); return roll; }); assert.deepEqual(trace, [100]); assert.equal(r.triggered, roll === 49); assert.deepEqual(r.runtime, base.runtime); }
  for (const patch of [{ disabled: true }, { playerPresent: false }, { debugControl: true }, { table: undefined }, { table: { stepChance: 50, slots: [] } }]) { const trace = []; m.checkRockSmashTrigger({ ...base, ...patch }, n => { trace.push(n); return 0; }); assert.deepEqual(trace, []); }
  const low = { ...base, local: { lowerEncounterRate: true, higherEncounterRate: false } };
  assert.equal(m.checkRockSmashTrigger(low, () => 24).triggered, true); assert.equal(m.checkRockSmashTrigger(low, () => 25).triggered, false);
  const bicycle = { ...base, cycling: true }; assert.equal(m.checkRockSmashTrigger(bicycle, () => 39).triggered, true); assert.equal(m.checkRockSmashTrigger(bicycle, () => 40).triggered, false);
  assert.throws(() => m.checkRockSmashTrigger(base, () => { throw new Error('injected-rng'); }), /injected-rng/);
});
test('E2 host facts validate unknown data, reject accessors without execution, and do not mutate inputs', async () => {
  const m = await modulePromise;
  for (const f of [undefined, unavailable, { status: 'invalid', reason: 'bad-provider' }, { status: 'value', value: { canSurf: 'yes', waterfall: false, waterfallCrest: false } }]) {
    const r = m.qualifyFieldMove(input('surf', 'party', { context: { facts: { facingTerrain: f } } }));
    assert.ok(['unavailable', 'invalid'].includes(r.status));
  }
  let calls = 0; const raw = { status: 'value' }; Object.defineProperty(raw, 'value', { enumerable: true, get() { calls++; return event(); } });
  assert.equal(m.qualifyFieldMove(input('cut', 'party', { context: { facts: { facingEvent: raw } } })).status, 'invalid'); assert.equal(calls, 0);
  const i = input('surf'), before = copy(i); m.qualifyFieldMove(i); const p = m.planFieldMove(i); p.steps.find(s => s.kind === 'runtime').surfBase.x = 88; assert.deepEqual(i, before);
});
test('T25 optional field animation false requests text fallback; Flash alone requires animation success', async () => {
  const m = await modulePromise;
  const debug = m.planFieldMove(input('cut', 'direct', { context: { debug: true, party: [] } }));
  assert.equal(debug.steps[1].memberId, null); assert.equal(debug.steps[1].onFalse, 'used-move-text');
  assert.equal(m.planFieldMove(input('flash')).steps[0].onFalse, 'stop');
});
test('R11 RockSmash keeps C held-item/lead/weather/flute modifier thresholds and zero-draw early exits', async () => {
  const m = await modulePromise;
  const b = { table: { stepChance: 50, slots: [{ species: 'a', weight: 1, minLevel: 2, maxLevel: 2 }] }, runtime: { graceSteps: 0, accumulator: -20 }, party: [], local: { lowerEncounterRate: false, higherEncounterRate: false }, weatherCategory: 'None', moreAbilities: true, disabled: false, playerPresent: true, debugControl: false, cycling: false };
  const lead = (ability = '', item = '') => [{ hp: 0, level: 100, isEgg: false, ability, item }];
  for (const [patch, pass, miss] of [[{ party: lead('', 'cleansetag') }, 33, 34], [{ party: lead('stench') }, 24, 25], [{ party: lead('swarm') }, 74, 75], [{ party: lead('snowcloak'), weatherCategory: 'Hail' }, 24, 25], [{ party: lead('snowcloak') }, 49, 50], [{ local: { lowerEncounterRate: true, higherEncounterRate: true } }, 24, 25]]) {
    for (const roll of [pass, miss]) { const trace = []; const r = m.checkRockSmashTrigger({ ...b, ...patch }, n => { trace.push(n); return roll; }); assert.equal(r.triggered, roll === pass); assert.deepEqual(trace, [100]); assert.deepEqual(r.runtime, b.runtime); }
  }
  const trace = []; m.checkRockSmashTrigger({ ...b, table: { ...b.table, stepChance: 0 } }, n => { trace.push(n); return 0; }); assert.deepEqual(trace, []);
});
test('E2 unknown nested facts and explicit missing values reject without inventing world false', async () => {
  const m = await modulePromise;
  for (const bad of [value({ canSurf: true }), value({ canSurf: true, waterfall: false, waterfallCrest: 'false' }), Object.create({ status: 'value', value: { canSurf: true, waterfall: false, waterfallCrest: false } }), { status: 'value' }]) {
    assert.equal(m.qualifyFieldMove(input('surf', 'party', { context: { facts: { facingTerrain: bad } } })).status, 'invalid');
  }
  let calls = 0; const e = event(); Object.defineProperty(e, 'name', { enumerable: true, get() { calls++; return 'cuttree'; } });
  assert.equal(m.qualifyFieldMove(input('cut', 'party', { context: { facts: { facingEvent: value(e) } } })).status, 'invalid'); assert.equal(calls, 0);
  assert.equal(m.planSurfLandingCompletion(unavailable, { departure: { mapId: 7, x: 4, y: 5 }, surfing: true, endingSurf: false }).status, 'unavailable');
  assert.equal(m.planSurfStepCleanup({ mapScene: value(true), playerNotification: unavailable, surfBase: { mapId: 7, x: 4, y: 5 }, endingSurf: true }).status, 'unavailable');
});
test('T25 direction is latched into Surf and Strength plans; missing/diagonal facts do not commit', async () => {
  const m = await modulePromise;
  for (const bad of [unavailable, value(1), value('6')]) {
    const surf = m.planFieldMove(input('surf', 'party', { context: { facts: { direction: bad } } }));
    assert.ok(['unavailable', 'invalid'].includes(surf.status));
    const strength = m.planStrengthPush({ strengthUsed: true, target: value(event('strengthboulder')), direction: bad, strictPassable: value(true) });
    assert.ok(['unavailable', 'invalid'].includes(strength.status));
  }
});
test('E2 unsupported deferred families remain refused, and throwing unknown fact objects become invalid', async () => {
  const m = await modulePromise;
  for (const moveId of ['headbutt', 'dive', 'waterfall', 'defog']) assert.equal(m.qualifyFieldMove(input(moveId)).reason, 'move-not-supported');
  const bad = new Proxy({}, { getPrototypeOf() { throw new Error('injected-host-inspection'); } });
  assert.equal(m.qualifyFieldMove(input('cut', 'party', { context: { facts: { facingEvent: bad } } })).reason, 'fact-inspection-failed');
});
test('R1/GR4-SF06 complete start-step cleanup then successful landing restores departure base and ends Surf', async () => {
  const m = await modulePromise, s = simulate(m.planFieldMove(input('surf'))).state;
  const cleanup = () => m.planSurfStepCleanup({ mapScene: value(true), playerNotification: value(true), surfBase: s.surfBase, endingSurf: s.endingSurf });
  simulate(cleanup(), undefined, s);
  assert.equal(s.surfBase, null); assert.equal(s.surfing, true); assert.equal(s.endingSurf, false);
  const departure = { mapId: 7, x: 0, y: 0 };
  const landing = m.qualifySurfLanding({ surfing: s.surfing, facingSurfable: value(false), departure: value(departure) });
  assert.equal(landing.status, 'ready'); departure.x = 999; // Actual host may now be at the new land position.
  const completion = m.planSurfLandingCompletion(value(true), { departure: landing.departure, surfing: s.surfing, endingSurf: s.endingSurf });
  simulate(completion, undefined, s);
  assert.deepEqual(s.surfBase, { mapId: 7, x: 0, y: 0 }); assert.equal(s.endingSurf, true);
  simulate(cleanup(), undefined, s);
  assert.equal(s.surfing, false); assert.equal(s.endingSurf, false); assert.equal(s.surfBase, null);
  assert.equal(s.resets, 2); assert.equal(s.stats.surf_count, 1);
  assert.equal(s.hosts.filter(action => action === 'restore-map-bgm').length, 1);
  assert.equal(completion.steps.some(step => step.kind === 'reset-encounters' || step.kind === 'commit'), false);
});
test('R1 landing departure is strictly validated before jump and cloned, including valid coordinate zero', async () => {
  const m = await modulePromise;
  const q = departure => m.qualifySurfLanding({ surfing: true, facingSurfable: value(false), departure });
  assert.deepEqual(q(value({ mapId: 1, x: 0, y: 0 })).departure, { mapId: 1, x: 0, y: 0 });
  for (const point of [{ mapId: 0, x: 0, y: 0 }, { mapId: 1, x: -1, y: 0 }, { mapId: 1, x: 0, y: -1 }, { mapId: 1, x: NaN, y: 0 }, { mapId: 1, x: 0, y: 0.5 }, { mapId: 1, x: 0 }, { mapId: '1', x: 0, y: 0 }]) {
    assert.equal(q(value(point)).status, 'invalid');
    assert.equal(m.planSurfLandingCompletion(value(true), { departure: point, surfing: true, endingSurf: false }).status, 'invalid');
  }
  assert.equal(q(unavailable).status, 'unavailable');
  let reads = 0; const raw = { mapId: 1, y: 0 }; Object.defineProperty(raw, 'x', { enumerable: true, get() { reads++; return 0; } });
  assert.equal(q(value(raw)).status, 'invalid'); assert.equal(reads, 0);
});
test('R1 failed and duplicate landing completions write no base, no count, no reset', async () => {
  const m = await modulePromise, departure = { mapId: 7, x: 4, y: 5 };
  const s = simulate(m.planFieldMove(input('surf'))).state;
  const cleanup = () => m.planSurfStepCleanup({ mapScene: value(true), playerNotification: value(true), surfBase: s.surfBase, endingSurf: s.endingSurf });
  simulate(cleanup(), undefined, s); const before = copy(s);
  const failed = m.planSurfLandingCompletion(value(false), { departure, surfing: s.surfing, endingSurf: s.endingSurf });
  assert.deepEqual(failed.steps, []); simulate(failed, undefined, s); assert.deepEqual(s, before);
  const success = m.planSurfLandingCompletion(value(true), { departure, surfing: s.surfing, endingSurf: s.endingSurf });
  simulate(success, undefined, s); const afterSuccess = copy(s);
  const duplicate = m.planSurfLandingCompletion(value(true), { departure, surfing: s.surfing, endingSurf: s.endingSurf });
  assert.deepEqual(duplicate.steps, []); simulate(duplicate, undefined, s); assert.deepEqual(s, afterSuccess);
  simulate(cleanup(), undefined, s); const afterEnd = copy(s);
  const late = m.planSurfLandingCompletion(value(true), { departure, surfing: s.surfing, endingSurf: s.endingSurf });
  assert.deepEqual(late.steps, []); simulate(late, undefined, s); simulate(cleanup(), undefined, s); assert.deepEqual(s, afterEnd);
});
