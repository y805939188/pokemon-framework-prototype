'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('./fixtures/wild-member-cache-support.cjs');
const vectors = require('./fixtures/wild-member-cache-vectors.literal.json').vectors;
let W, F;
test.before(async () => { ({ wild: W, factory: F } = await H.modules()); });
const draft = (pid = 128, content = H.content(), input = {}, registration = H.absent, extra = []) => {
  const random = H.tape(H.baseDraws(pid, extra)), result = W.createWildMemberDraft(H.input(input), content, random, registration);
  random.exhausted();
  return result;
};
const blank = { gender: null, abilityIndex: null, ability: null, effectiveAbilityIndex: null, shiny: null, superShiny: null };

for (const v of vectors.filter(v => v.stage === 'pid-packing')) test(v.id + ': literal PID high/low and IV domains', () => {
  const d = draft(v.expected.personalID);
  assert.equal(d.trace().personalID, v.expected.personalID);
  assert.deepEqual(d.trace().ivs, { hp: 31, atk: 0, def: 1, spa: 2, spd: 3, spe: 4 });
});
for (const v of vectors.filter(v => v.stage === 'uncached-color-math')) test(v.id + ': independent ordinary/super first reads', () => {
  const d = draft(v.input.personalID, H.content(), { owner: { id: v.input.ownerId, name: '', gender: 2, language: 2 } });
  assert.equal(d.readShiny(), v.expected.shiny);
  assert.equal(d.trace().caches.superShiny, null);
  assert.equal(d.readSuperShiny(), v.expected.superShiny);
  const other = draft(v.input.personalID, H.content(), { owner: { id: v.input.ownerId, name: '', gender: 2, language: 2 } });
  assert.equal(other.readSuperShiny(), v.expected.superShiny);
  assert.equal(other.trace().caches.shiny, null);
});

test('CI02/05 no handler returns zero without registration; nature already fixed', () => {
  const d = draft();
  assert.deepEqual(d.trace().caches, blank);
  assert.equal(d.trace().nature, 'adamant');
  assert.equal(d.trace().creationFormHandlerRan, false);
  assert.equal(d.trace().registrationRead, false);
  const present = draft(128, H.content(), {}, H.present);
  assert.deepEqual(present.trace().caches, blank);
});
for (const v of vectors.filter(v => v.stage === 'pid-retry-cache')) test(v.id + ': literal cache transition and exact RNG suffix', () => {
  const inp = v.input;
  const form = inp.creationFormRegistrationRead === true;
  const d = draft(inp.initialPersonalID ?? inp.personalID, H.content(form ? 'Unown' : 'Fixture'), {}, form ? H.present : H.absent, form ? [{ n: 28, value: 0 }] : []);
  if (inp.abilityExplicitlyReadBeforeRetry) d.readAbility();
  const random = H.tape(v.draws);
  d.rerollShiny(inp.retries, random); random.exhausted();
  const trace = d.trace(), e = v.expected;
  assert.equal(trace.personalID, e.personalID);
  assert.equal(trace.caches.shiny, e.ordinaryShinyCache);
  assert.equal(trace.caches.superShiny, e.superShinyCache);
  if ('nature' in e) assert.equal(trace.nature, e.nature);
  for (const key of ['gender', 'abilityIndex', 'ability']) if (key + 'Cache' in e) assert.equal(trace.caches[key], e[key + 'Cache']);
  if ('genderAtFinalFirstRead' in e) assert.equal(d.readGender(), e.genderAtFinalFirstRead);
  if ('abilityAtFinalFirstRead' in e) assert.equal(d.readAbility(), e.abilityAtFinalFirstRead);
  if ('superShinyAtFinalFirstRead' in e) assert.equal(d.readSuperShiny(), e.superShinyAtFinalFirstRead);
  if ('ordinaryShinyAtFinalFirstRead' in e) assert.equal(d.readShiny(), e.ordinaryShinyAtFinalFirstRead);
});

test('CI04/26 genuine zero/nonzero handler result reads only with player AND dex', () => {
  for (const form of [0, 1]) for (const playerPresent of [false, true]) for (const dexPresent of [false, true]) {
    const d = draft(128, H.content('Unown'), { withMoves: false }, { playerPresent, dexPresent }, [{ n: 28, value: form }]);
    const yes = playerPresent && dexPresent;
    assert.equal(d.trace().creationFormHandlerRan, true);
    assert.equal(d.trace().registrationRead, yes);
    assert.equal(d.trace().form, form);
    assert.deepEqual(d.trace().caches, { ...blank, gender: yes ? 'M' : null, shiny: yes ? false : null });
    assert.deepEqual(d.materialize().moves, []);
  }
});

test('creation registration and lazy ability use the created form record', () => {
  const content = H.content('Unown');
  content.species.Fixture1.gender = 255;
  content.species.Fixture1.abilities = ['Form A', 'Form B'];
  const d = draft(128, content, {}, H.present, [{ n: 28, value: 1 }]);
  assert.equal(d.trace().species, 'Fixture1');
  assert.equal(d.trace().caches.gender, 'F');
  assert.equal(d.trace().caches.ability, null);
  assert.equal(d.readAbility(), 'Form A');
  d.rerollShiny(1, H.tape([{ n: 65536, value: 0 }, { n: 65536, value: 1 }]));
  const m = d.materialize();
  assert.equal(m.form, 1); assert.equal(m.species, 'Fixture1');
  assert.equal(m.gender, 'F'); assert.equal(m.ability, 'Form A'); assert.equal(m.nature, 'adamant');
});

test('CI27/28 explicit zero/nonzero form, nonzero initial record, and recheck=false suppress handler', () => {
  for (const input of [{ form: 0 }, { form: 1 }, { recheckForm: false }, { species: 'Fixture1' }]) {
    const d = draft(128, H.content('Unown'), input, H.present);
    assert.equal(d.trace().creationFormHandlerRan, false);
    assert.deepEqual(d.trace().caches, blank);
  }
});

test('all 16 B identities run the real handler; deterministic zero is still registration', () => {
  const cases = [
    ['Unown', 0, { n: 28, value: 0 }], ['Burmy', 0], ['Wormadam', 0], ['Scatterbug', 0], ['Spewpa', 0], ['Vivillon', 0],
    ['Pumpkaboo', 0, { n: 100, value: 99 }], ['Gourgeist', 0, { n: 100, value: 99 }], ['Lycanroc', 0], ['Minior', 7, { n: 7, value: 0 }],
    ['Toxel', 0], ['Toxtricity', 0], ['Sinistea', 0, { n: 100, value: 99 }], ['Polteageist', 0, { n: 100, value: 99 }],
    ['Alcremie', 0, { n: 63, value: 0 }], ['Urshifu', 0, { n: 2, value: 0 }],
  ];
  for (const [family, form, extra] of cases) {
    const d = draft(0, H.content(family), { context: { environment: 'grass', timeOfDay: 'day', playerId: 0 } }, H.present, extra ? [extra] : []);
    assert.equal(d.trace().form, form, family);
    assert.equal(d.trace().registrationRead, true, family);
    assert.deepEqual(d.trace().caches, { ...blank, gender: 'F', shiny: true }, family);
  }
});

test('WP19 fixed genders use the species getter; no fabricated proportional cache', () => {
  for (const gender of ['M', 'F', 'N']) {
    const d = draft(128, H.content('Unown', { gender }), {}, H.present, [{ n: 28, value: 0 }]);
    assert.equal(d.readGender(), gender);
    assert.equal(d.trace().caches.gender, null);
    const random = H.tape([{ n: 65536, value: 0 }, { n: 65536, value: 1 }]);
    d.rerollShiny(1, random); random.exhausted();
    assert.equal(d.materialize().gender, gender);
  }
});

test('ability index and parsed ability are independently lazy; PID writes retain cached values', () => {
  const indexOnly = draft(); assert.equal(indexOnly.readAbilityIndex(), 0);
  assert.equal(indexOnly.trace().caches.ability, null);
  const random = H.tape([{ n: 65536, value: 0 }, { n: 65536, value: 1 }]);
  indexOnly.rerollShiny(1, random); random.exhausted();
  assert.equal(indexOnly.readAbility(), 'A');
  const unread = draft(); unread.rerollShiny(1, H.tape([{ n: 65536, value: 0 }, { n: 65536, value: 1 }]));
  assert.equal(unread.readAbility(), 'B'); assert.equal(unread.trace().caches.abilityIndex, 1);
  const empty = draft(128, H.content('Fixture', { abilities: [null, null] }));
  assert.equal(empty.readAbility(), ''); assert.equal(empty.trace().caches.ability, '');
  assert.equal(empty.trace().caches.effectiveAbilityIndex, null);
});

test('ordinary retries clear only ordinary shiny, preserving gender/ability/nature/super/IV/form', () => {
  const d = draft(); d.readGender(); d.readAbility(); d.readSuperShiny();
  const before = d.trace(), rng = H.tape([{ n: 65536, value: 0 }, { n: 65536, value: 1 }]);
  d.rerollShiny(1, rng); rng.exhausted();
  assert.deepEqual(d.trace(), { ...before, personalID: 1, caches: { ...before.caches, shiny: null } });
  const m = d.materialize();
  assert.equal(m.personalID, 1); assert.equal(m.gender, 'M'); assert.equal(m.ability, 'A');
  assert.equal(m.nature, 'adamant'); assert.equal(m.shiny, true); assert.equal(m.superShiny, false);
  assert.deepEqual(m.ivs, before.ivs);
});

test('ST42/43 super setter and ordinary setter can preserve each independent cache combination', () => {
  const d = draft(16);
  d.setSuperShiny(true); assert.equal(d.trace().caches.shiny, true);
  d.setShiny(null); assert.equal(d.readShiny(), false); assert.equal(d.readSuperShiny(), true);
  d.setSuperShiny(false); assert.equal(d.readShiny(), false);
  d.setShiny(true); d.setSuperShiny(false); assert.equal(d.readShiny(), true);
  d.setSuperShiny(null); assert.equal(d.trace().caches.shiny, true); assert.equal(d.trace().caches.superShiny, null);
  d.setSuperShiny(true); d.setShiny(false);
  d.rerollShiny(1, H.tape([{ n: 65536, value: 0 }, { n: 65536, value: 17 }]));
  assert.equal(d.trace().caches.superShiny, true); assert.equal(d.trace().caches.shiny, null);
});

for (const v of vectors.filter(v => v.stage === 'battle-shiny-bonus')) test(v.id + ': literal battle tier prefix', () => {
  const rng = H.tape(v.draws);
  assert.equal(W.wildShinyRetries({ shinyCharm: v.input.shinyCharm, higherShinyByBattled: v.input.enabled, battledCount: v.input.battledCount }, rng), v.expected.totalRetries);
  rng.exhausted();
});

test('TIER-BEFORE-EARLY-SHINY tier draw occurs even when retry loop immediately stops', () => {
  const d = draft(0), rng = H.tape([{ n: 1000, value: 29 }]);
  const count = W.wildShinyRetries({ shinyCharm: true, higherShinyByBattled: true, battledCount: 500 }, rng);
  assert.equal(count, 7); d.rerollShiny(count, rng); rng.exhausted();
  assert.equal(d.trace().caches.shiny, true); assert.equal(d.trace().caches.superShiny, null);
});

test('full 1000-value tier enumeration matches formal counts with/without charm', () => {
  for (const [count, threshold, bonus] of [[50, 15, 1], [100, 20, 2], [200, 25, 3], [300, 30, 4], [500, 30, 5]]) {
    for (const shinyCharm of [false, true]) {
      let hits = 0;
      for (let roll = 0; roll < 1000; roll++) {
        const rng = H.tape([{ n: 1000, value: roll }]);
        const result = W.wildShinyRetries({ shinyCharm, higherShinyByBattled: true, battledCount: count }, rng);
        rng.exhausted(); assert.equal(result, (shinyCharm ? 2 : 0) + (roll < threshold ? bonus : 0));
        hits += Number(result > (shinyCharm ? 2 : 0));
      }
      assert.equal(hits, threshold);
    }
  }
});

test('trace/materialized results and caller metadata are detached, caches never enter Member', () => {
  const owner = { id: 0, name: 'Original', gender: 2, language: 2 }, context = { map: 9, receivedAt: 123 };
  const d = draft(128, H.content(), { owner, context });
  owner.id = 128; owner.name = 'Changed'; context.map = 44;
  const observed = d.trace(); observed.ivs.hp = 0; observed.caches.gender = 'N';
  assert.equal(d.trace().ivs.hp, 31); assert.equal(d.trace().caches.gender, null);
  const m = d.materialize(), again = d.materialize();
  m.owner.id = 1; m.ivs.hp = 0; m.moves[0].pp = 0;
  assert.equal(again.owner.id, 0); assert.equal(again.owner.name, 'Original'); assert.equal(again.origin.map, 9);
  assert.equal(again.ivs.hp, 31); assert.equal(again.moves[0].pp, 40);
  for (const key of ['caches', 'creationFormHandlerRan', 'registrationRead']) assert.equal(key in again, false);
});

test('invalid facts/creation inputs fail before RNG; bad retry RNG retains original evidence prefix', () => {
  for (const registration of [undefined, {}, { playerPresent: false, dexPresent: 0 }]) assert.throws(() => W.createWildMemberDraft(H.input(), H.content(), H.tape([]), registration), /presence facts/);
  for (const input of [{ id: '' }, { level: 0 }, { species: 'Missing' }, { owner: { id: -1, name: '', gender: 2, language: 2 } }]) assert.throws(() => W.createWildMemberDraft(H.input(input), H.content(), H.tape([]), H.absent));
  for (const n of [-1, 1.5, NaN, Infinity]) assert.throws(() => draft().rerollShiny(n, H.tape([])), /retries/);
  for (const facts of [{ shinyCharm: 0, higherShinyByBattled: true, battledCount: 5 }, { shinyCharm: true, higherShinyByBattled: true, battledCount: -1 }]) assert.throws(() => W.wildShinyRetries(facts, H.tape([])), /facts/);
  for (const value of [-1, 1000, .5, NaN]) assert.throws(() => W.wildShinyRetries({ shinyCharm: false, higherShinyByBattled: true, battledCount: 50 }, () => value), /random/);
  for (const value of [-1, 65536, .5, NaN]) assert.throws(() => draft().rerollShiny(1, () => value), /random/);
});

const compatibility = require('./fixtures/wild-member-ordinary-compat.literal.json');
for (const v of compatibility.cases) test('ordinary compatibility ' + v.id, () => {
  const rng = H.tape(v.draws), content = H.content(v.family, v.speciesPatch, v.forms);
  assert.deepEqual(F.createMember(H.input(v.input), content, rng), v.expected);
  rng.exhausted();
});
