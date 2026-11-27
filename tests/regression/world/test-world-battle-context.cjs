'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('../../support/world/fixtures/c-rules-support.cjs');
let R;
test.before(async () => { R = await H.loadRule('world-battle-context'); });
const value = value => ({ status: 'value', value });
const facts = extra => ({ hour: value(12), weather: value({ type: 'None', category: 'None' }), mapMetadata: { status: 'absent' }, ...extra });
const input = extra => ({ facts: facts(), source: 'Land', groundEnvironment: value('none'), facingEnvironment: value('movingwater'), weatherSetsTerrain: true, ...extra });
function projected(extra) { const result = R.projectWorldBattleContext(input(extra)); assert.equal(result.status, 'value', result.reason); return result.value; }

test('T09 parsing retains legacy blank/none and new inherit independently for all three fields', () => {
  assert.deepEqual(R.parseWorldFieldChoices('', '', '', 'none'), { weather: 'none', terrain: 'none', environment: 'none' });
  assert.deepEqual(R.parseWorldFieldChoices(undefined, undefined, undefined, 'inherit'), { weather: 'inherit', terrain: 'inherit', environment: 'inherit' });
  assert.deepEqual(R.parseWorldFieldChoices('none', 'inherit', 'cave', 'inherit'), { weather: 'none', terrain: 'inherit', environment: 'cave' });
  assert.deepEqual(R.parseWorldFieldChoices('inherit', 'none', 'inherit', 'none'), { weather: 'inherit', terrain: 'none', environment: 'inherit' });
  for (const raw of [null, false, 1, {}, [], 'Rain', 'unknown']) {
    assert.throws(() => R.parseWorldFieldChoices(raw, 'none', 'none', 'none'), /weather/);
    assert.throws(() => R.parseWorldFieldChoices('none', raw, 'none', 'none'), /terrain/);
    assert.throws(() => R.parseWorldFieldChoices('none', 'none', raw, 'none'), /environment/);
  }
});

const weatherRows = [['None', 'None', 'none', 'none'], ['Rain', 'Rain', 'rain', 'none'], ['Storm', 'Rain', 'rain', 'electric'], ['Snow', 'Hail', 'hail', 'none'], ['Blizzard', 'Hail', 'hail', 'none'], ['Sandstorm', 'Sandstorm', 'sandstorm', 'none'], ['HeavyRain', 'Rain', 'rain', 'none'], ['Sun', 'Sun', 'sun', 'none'], ['Fog', 'Fog', 'none', 'misty']];
for (const [type, category, weather, terrain] of weatherRows) test('T09 exact world weather projection: ' + type, () => {
  const mapped = projected({ facts: facts({ weather: value({ type, category }) }) });
  if (weather === 'none' && terrain === 'none') assert.equal(mapped.initialField, undefined);
  else assert.deepEqual(mapped.initialField, { weather, terrain, environment: 'none' });
  const disabled = projected({ facts: facts({ weather: value({ type, category }) }), weatherSetsTerrain: false });
  assert.equal(disabled.initialField?.terrain ?? 'none', 'none');
  assert.notEqual(mapped.initialField?.weather, 'heavyrain', 'world HeavyRain is ordinary rain, never Primordial Sea');
});

test('T09 per-field explicit overrides win, including none, without erasing another inherited field', () => {
  const storm = facts({ weather: value({ type: 'Storm', category: 'Rain' }) });
  assert.deepEqual(projected({ facts: storm, choices: R.parseWorldFieldChoices('none', 'inherit', 'grass', 'none') }).initialField, { weather: 'none', terrain: 'electric', environment: 'grass' });
  assert.deepEqual(projected({ facts: storm, choices: R.parseWorldFieldChoices('sun', 'none', 'inherit', 'none'), groundEnvironment: value('cave') }).initialField, { weather: 'sun', terrain: 'none', environment: 'cave' });
  assert.deepEqual(projected({ facts: storm, choices: R.parseWorldFieldChoices('heavyrain', 'none', 'none', 'none') }).initialField, { weather: 'heavyrain', terrain: 'none', environment: 'none' }, 'explicit battle weather identity remains compatible');
});

test('T09 legacy all-none succeeds without world weather inference, while explicit inherit reports unavailable', () => {
  const broken = facts({ weather: { status: 'unavailable', reason: 'provider failed' } });
  assert.equal(projected({ facts: broken, choices: R.parseWorldFieldChoices('', '', '', 'none') }).initialField, undefined);
  assert.deepEqual(R.projectWorldBattleContext(input({ facts: broken })), { status: 'unavailable', reason: 'world weather: provider failed' });
  for (const weather of [value({ type: 'HeavyRain', category: 'Sun' }), value({ type: 'bad', category: 'Rain' })]) assert.equal(R.projectWorldBattleContext(input({ facts: facts({ weather }) })).status, 'invalid');
  assert.equal(R.projectWorldBattleContext(input({ facts: facts({ weather: { status: 'absent' } }) })).status, 'unavailable');
});

test('T10 capture night comes from business hour/cave metadata, independent of table, visual tone and battleTime', () => {
  for (const source of ['Land', 'Cave', 'OldRod', 'event']) for (const hour of [4, 5, 17, 19, 20]) for (const cave of [false, true]) {
    const metadata = cave ? value({ environment: 'cave' }) : { status: 'absent' };
    const result = projected({ source, facts: facts({ hour: value(hour), mapMetadata: metadata }), battleTime: 'day', visualDayNight: false });
    assert.equal(result.capture.timeOfDay, cave || hour < 5 || hour >= 20 ? 2 : hour >= 17 ? 1 : 0);
    assert.equal(result.capture.fishing, source === 'OldRod');
  }
  assert.equal(projected({ choices: R.parseWorldFieldChoices('none', 'none', 'cave', 'none') }).capture.timeOfDay, 0, 'author battle environment override does not invent map cave metadata');
});

test('T10 actual rod sources alone set fishing and select the facing environment', () => {
  for (const source of ['OldRod', 'GoodRod', 'SuperRod']) {
    const result = projected({ source, groundEnvironment: value('grass'), facingEnvironment: value('movingwater') });
    assert.equal(result.capture.fishing, true); assert.equal(result.initialField.environment, 'movingwater');
  }
  const ordinary = input({ source: 'Water', groundEnvironment: value('movingwater') });
  Object.defineProperty(ordinary, 'facingEnvironment', { get() { throw Error('unused facing input read'); } });
  const result = R.projectWorldBattleContext(ordinary);
  assert.equal(result.status, 'value'); assert.equal(result.value.capture.fishing, false);
  assert.equal(projected({ source: 'event', groundEnvironment: value('movingwater') }).capture.fishing, false);
});

test('T09 map environment takes precedence, ForestGrass uses the selected fishing/standing terrain', () => {
  assert.equal(projected({ facts: facts({ mapMetadata: value({ environment: 'cave' }) }), groundEnvironment: { status: 'unavailable' } }).initialField.environment, 'cave');
  const forest = facts({ mapMetadata: value({ environment: 'forest' }) });
  assert.equal(projected({ facts: forest, groundEnvironment: value('grass') }).initialField.environment, 'forestgrass');
  assert.equal(projected({ facts: forest, groundEnvironment: value('tallgrass') }).initialField.environment, 'forestgrass');
  assert.equal(projected({ facts: forest, groundEnvironment: value('rock') }).initialField.environment, 'forest');
  assert.equal(projected({ facts: forest, source: 'OldRod', groundEnvironment: value('grass'), facingEnvironment: value('movingwater') }).initialField.environment, 'forest');
  assert.equal(projected({ facts: facts({ mapMetadata: value({ environment: 'none' }) }), groundEnvironment: value('grass') }).initialField, undefined, 'explicit map None is a value');
});

test('T10 unavailable/invalid business facts remain failures; an observed absent metadata entry is valid', () => {
  assert.equal(projected({ facts: facts({ mapMetadata: { status: 'absent' } }) }).capture.timeOfDay, 0);
  for (const status of ['unavailable', 'invalid']) {
    assert.equal(R.projectWorldBattleContext(input({ facts: facts({ mapMetadata: { status, reason: 'lookup failed' } }) })).status, status);
    assert.equal(R.projectWorldBattleContext(input({ facts: facts({ hour: { status, reason: 'clock failed' } }) })).status, status);
    assert.equal(R.projectWorldBattleContext(input({ facingEnvironment: { status }, source: 'GoodRod' })).status, status);
  }
  for (const hour of [-1, 24, .5, NaN]) assert.equal(R.captureWorldBallFacts(facts({ hour: value(hour) }), 'Land').status, 'invalid');
  assert.equal(R.captureWorldBallFacts(facts(), 'bad').status, 'invalid');
  assert.equal(R.projectWorldBattleContext(input({ groundEnvironment: value('bad') })).status, 'invalid');
  assert.equal(R.captureWorldBallFacts(facts({ mapMetadata: value({ environment: 'bad' }) }), 'Land').status, 'invalid');
});

test('T09/T10 captured concrete values remain frozen when world facts change later', () => {
  const current = facts({ hour: value(20), weather: value({ type: 'Storm', category: 'Rain' }), mapMetadata: value({ environment: 'cave' }) });
  const result = projected({ facts: current, source: 'OldRod' });
  current.hour.value = 12; current.weather.value.type = 'Sun'; current.weather.value.category = 'Sun'; current.mapMetadata.value.environment = 'grass';
  assert.deepEqual(result.initialField, { weather: 'rain', terrain: 'electric', environment: 'cave' });
  assert.deepEqual(result.capture, { timeOfDay: 2, fishing: true });
  assert(Object.isFrozen(result) && Object.isFrozen(result.initialField) && Object.isFrozen(result.capture));
});
