'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('../../support/world/wild-generation-support.cjs');
const oracle = require('../../support/world/fixtures/wild-generation-oracle.literal.json');
const stageVectors = require('../../support/world/fixtures/wild-generation-stage-vectors.literal.json').vectors;
let G;
test.before(async () => { G = await H.moduleUnderTest(); });
const create = (content = H.content(), facts = H.facts(), draws = H.baseDraws(), input = H.input(), lookup = H.lookup) => {
  const random = H.tape(draws), result = G.createWildSpecies(input, content, facts, random, lookup);
  random.exhausted(); return result;
};
for (const v of oracle.cases) test('full independent literal ' + v.id, () => {
  const patch = v.pools === 'same' ? H.samePools : v.pools === 'singletons' ? H.singletonPools : {};
  const c = H.content(patch), facts = H.facts(v.factsPatch), input = H.input(), before = structuredClone({ c, facts, input });
  const result = create(c, facts, v.draws, input);
  assert.deepEqual(result, { status: 'created', member: v.expected });
  assert.deepEqual({ c, facts, input }, before);
});

for (const v of stageVectors.filter(v => v.stage === 'lead-gender' || v.stage === 'lead-nature')) test('stage literal ' + v.id, () => {
  const i = v.input, rng = H.tape(v.draws), party = [H.lead({ ability: i.leadAbility, gender: i.leadGender ?? 'M', nature: i.leadNature ?? 'modest', hp: i.leadFainted ? 0 : 10 })];
  const result = G.wildLeadOverrides(i.targetGenderRule ?? 128, party, i.expanded ?? true, i.roamer ?? false, rng);
  rng.exhausted();
  if (v.stage === 'lead-gender') assert.deepEqual(result, { gender: v.expected.gender ?? v.expected.genderOverride, nature: null });
  else assert.equal(result.nature ?? i.oldNature, v.expected.nature);
});
for (const v of stageVectors.filter(v => v.stage === 'balanced-level-scaling' && v.id !== 'SCALE-DISABLED')) test('stage literal ' + v.id, () => {
  assert.equal(G.balancedPartyLevel(v.input.partyLevels, v.input.maxLevel), v.expected.balancedLevel);
  const rng = H.tape(v.draws);
  assert.equal(G.scaledWildLevel(v.input.partyLevels, rng), v.expected.scaledLevel); rng.exhausted();
});

test('source labels share the approved generation stage but grant no source permission', () => {
  for (const source of ['step', 'event', 'fishing', 'sweet-scent', 'rock-smash']) assert.deepEqual(create(H.content(), H.facts({ source })), { status: 'created', member: oracle.cases[0].expected });
  for (const source of ['trainer', 'native', '', null]) assert.deepEqual(create(H.content(), H.facts({ source }), []), { status: 'unsupported', reason: 'source' });
  assert.deepEqual(create(H.content(H.samePools), H.facts({ source: 'event', allowHeldItemSources: false }), []), { status: 'unsupported', reason: 'held-item-source-disabled' });
});

test('unsupported sessions/rule identities/handlers stay zero RNG; accepted legend gate uses exactly three draws', () => {
  for (const session of ['safari', 'contest', 'facility']) assert.deepEqual(create(H.content(), H.facts({ session }), []), { status: 'unsupported', reason: 'session-hooks' });
  const missing = H.content(); delete missing.species.Fixture.ruleSpecies;
  assert.deepEqual(create(missing, H.facts(), []), { status: 'unsupported', reason: 'rule-family-unavailable' });
  for (const flag of ['Legendary', 'Mythical', 'UltraBeast']) {
    const legend = create(H.content({ flags: [flag] }), H.facts(), [...H.baseDraws(), { n: 6, value: 0 }, { n: 5, value: 0 }, { n: 4, value: 0 }]);
    assert.equal(legend.status, 'created');
    assert.deepEqual(legend.member.ivs, { hp: 31, atk: 31, def: 31, spa: 2, spd: 3, spe: 4 });
    assert.equal(create(H.content({ flags: [flag] }), H.facts({ legendaryPerfectIVs: false })).status, 'created');
  }
  // All formal handler identities now have timing-specific initial support; later battle/image/egg hooks do not run here.
  const registered = ['Giratina','Shaymin','Arceus','Deerling','Sawsbuck','Keldeo','Genesect','Furfrou','Hoopa','Espurr','Meowstic','Rockruff','Silvally','Milcery','Indeedee','Pikachu','Exeggcute','Cubone','Koffing','Mime Jr',
    'Unown','Burmy','Wormadam','Scatterbug','Spewpa','Vivillon','Pumpkaboo','Gourgeist','Lycanroc','Minior','Toxel','Toxtricity','Sinistea','Polteageist','Alcremie','Urshifu',
    'Rotom','Kyurem','Necrozma','Calyrex','Xerneas','Zacian','Zamazenta','Castform','Cherrim','Darmanitan','Meloetta','Greninja','Aegislash','Zygarde','Wishiwashi','Mimikyu','Cramorant','Eiscue','Morpeko',
    'Rattata','Sandshrew','Vulpix','Diglett','Meowth','Geodude','Grimer','Ponyta',"Farfetch'd",'Corsola','Zigzagoon','Darumaka','Yamask','Stunfisk','Slowpoke','Articuno','Zapdos','Moltres','Spinda','Groudon','Kyogre'];
  assert.equal(new Set(registered).size, 76);
  for (const family of registered) assert.equal(create(H.content({}, family), H.facts(), H.baseDraws(), H.input({ form: 0, context: { hour: 12, month: 1, regionId: 0, distortionWorld: false } })).status, 'created', family);

});

test('accepted partial/distinct and same ordered multi pools preserve occurrence weight', () => {
  const same = { wildItemCommon: ['leftovers', 'oranberry'], wildItemUncommon: ['leftovers', 'oranberry'], wildItemRare: ['leftovers', 'oranberry'] };
  assert.equal(create(H.content(same), H.facts(), [...H.baseDraws(), { n: 2, value: 1 }]).member.item, 'oranberry');
  for (const patch of [
    { wildItemCommon: ['leftovers'] }, { wildItemUncommon: ['oranberry'] }, { ...H.singletonPools, wildItemRare: [] },
  ]) assert.equal(create(H.content(patch), H.facts(), [...H.baseDraws(), { n: 100, value: 55 }]).member.item, '');
  for (const [pool, roll] of [['wildItemCommon', 0], ['wildItemUncommon', 50], ['wildItemRare', 55]]) {
    const result = create(H.content({ ...H.singletonPools, [pool]: ['leftovers', 'oranberry'] }), H.facts(), [...H.baseDraws(), { n: 100, value: roll }, { n: 2, value: 1 }]);
    assert.equal(result.status, 'created'); assert.equal(result.member.item, 'oranberry');
  }
});

test('ordinary held source and canonical descriptor gates run before generation; empty pools need no gate access', () => {
  const c = H.content(H.samePools), noRng = H.tape([]);
  for (const bad of [() => null, id => ({ id, holdable: false, mail: false }), id => ({ id, holdable: true, mail: true }), () => ({ id: 'other', holdable: true, mail: false })]) assert.deepEqual(G.createWildSpecies(H.input(), c, H.facts(), noRng, bad), { status: 'unsupported', reason: 'held-item-descriptor' });
  const unchecked = H.content(H.samePools); delete unchecked.meta.showdownSourceChecked;
  assert.deepEqual(G.createWildSpecies(H.input(), unchecked, H.facts(), noRng, () => { throw Error('must not call'); }), { status: 'unsupported', reason: 'held-item-source-unchecked' });
  assert.deepEqual(G.createWildSpecies(H.input(), c, H.facts(), noRng), { status: 'unsupported', reason: 'held-item-data-unavailable' });
  const forbidden = H.content(H.samePools);
  forbidden.items = { leftovers: { id: 'leftovers', flags: ['KeyItem'], fieldUse: 'none' } };
  assert.deepEqual(G.createWildSpecies(H.input(), forbidden, H.facts(), noRng, () => { throw Error('unholdable author item must reject first'); }), { status: 'unsupported', reason: 'held-item-descriptor' });
  const calls = [];
  assert.equal(create(c, H.facts(), H.baseDraws(), H.input(), id => { calls.push(id); return H.lookup(id); }).member.item, 'leftovers');
  assert.deepEqual(calls, ['leftovers']);
  assert.equal(create(H.content(), H.facts({ allowHeldItemSources: false }), H.baseDraws(), H.input(), () => { throw Error('empty-pool lookup must remain cold'); }).member.item, '');
});

test('exhaustive held integer maps preserve basic and improved probabilities including none', () => {
  const c = H.content(H.singletonPools);
  for (const [ability, moreAbilities, expectedCounts] of [['', true, [50,5,1,44]], ['Compound Eyes', false, [60,20,5,15]], ['Super Luck', true, [60,20,5,15]], ['Super Luck', false, [50,5,1,44]]]) {
    const counts = { leftovers: 0, oranberry: 0, sitrusberry: 0, '': 0 }, improved = expectedCounts[0] === 60;
    for (let roll = 0; roll < 100; roll++) {
      const expected = roll < expectedCounts[0] ? 'leftovers' : roll < expectedCounts[0] + expectedCounts[1] ? 'oranberry' : roll < expectedCounts[0] + expectedCounts[1] + expectedCounts[2] ? 'sitrusberry' : '';
      const draws = [...H.baseDraws(), { n: 100, value: roll }, ...(expected ? [{ n: 1, value: 0 }] : [])];
      const result = create(c, H.facts({ party: [H.lead({ isEgg: true, ability: 'Compound Eyes' }), H.lead({ ability, hp: 0 }), H.lead({ ability: 'Compound Eyes' })], moreAbilities }), draws);
      assert.equal(result.member.item, expected, ability + '/' + moreAbilities + '/' + roll); counts[expected]++;
    }
    assert.deepEqual(Object.values(counts), expectedCounts, String(improved));
  }
});

test('Cute Charm third branch forces same gender; first non-egg may be fainted and later members are ignored', () => {
  for (const gender of ['M', 'F']) {
    const count = { M: 0, F: 0 };
    for (let roll = 0; roll < 3; roll++) {
      const rng = H.tape([{ n: 3, value: roll }]);
      const result = G.wildLeadOverrides(128, [H.lead({ isEgg: true, gender: 'N' }), H.lead({ ability: 'Cute Charm', gender, hp: 0 }), H.lead({ ability: 'Synchronize' })], false, true, rng);
      rng.exhausted(); count[result.gender]++;
    }
    assert.deepEqual(count, gender === 'M' ? { M: 1, F: 2 } : { M: 2, F: 1 });
  }
  assert.deepEqual(G.wildLeadOverrides(128, [H.lead(), H.lead({ ability: 'Cute Charm' })], true, false, H.tape([])), { gender: null, nature: null });
  assert.deepEqual(G.wildLeadOverrides(128, [H.lead({ isEgg: true, ability: 'Cute Charm' })], true, false, H.tape([])), { gender: null, nature: null });
});

test('Synchronize exhaustive 50% mapping and roamer/config early prefixes', () => {
  let changed = 0;
  for (let roll = 0; roll < 100; roll++) {
    const rng = H.tape([{ n: 100, value: roll }]);
    changed += Number(G.wildLeadOverrides(128, [H.lead({ ability: 'Synchronize' })], false, false, rng).nature === 'modest'); rng.exhausted();
  }
  assert.equal(changed, 50);
  for (const more of [true, false]) assert.equal(G.wildLeadOverrides(128, [H.lead({ ability: 'Synchronize' })], more, true, H.tape([])).nature, null);
  assert.equal(G.wildLeadOverrides(128, [H.lead({ ability: 'Synchronize', nature: 'MODEST' })], true, false, H.tape([])).nature, 'modest');
});

test('level formula: all levels, population deviation, positive half rounding and exactly one clamped draw', () => {
  assert.equal(G.balancedPartyLevel([5, 6]), 8);
  assert.equal(G.balancedPartyLevel([10, 50]), 52);
  assert.equal(G.balancedPartyLevel([10, 20, 30]), 27); // population σ gives 27; sample σ incorrectly gives 28
  for (const level of [0, 1, 5, 50, 100]) for (let roll = 0; roll < 5; roll++) {
    const rng = H.tape([{ n: 5, value: roll }]);
    const balanced = level === 0 ? 1 : Math.min(level + 2, 100);
    assert.equal(G.scaledWildLevel([level, level], rng), Math.max(1, Math.min(100, balanced - 4 + roll))); rng.exhausted();
  }
});

test('static authored form uses its own pools/base/gender/ability; no per-pool base fallback or form RNG', () => {
  const c = H.content({ wildItemCommon: ['leftovers'] });
  const sp = c.species.Fixture1;
  sp.wildItemCommon = ['sitrusberry']; sp.wildItemUncommon = ['sitrusberry']; sp.wildItemRare = ['sitrusberry'];
  sp.base.hp = 90; sp.gender = 'F'; sp.abilities = ['Form A', 'Form B'];
  const result = create(c, H.facts(), H.baseDraws(), H.input({ form: 1 }));
  assert.equal(result.status, 'created'); assert.equal(result.member.species, 'Fixture1'); assert.equal(result.member.form, 1);
  assert.equal(result.member.item, 'sitrusberry'); assert.equal(result.member.hp, 25); assert.equal(result.member.gender, 'F'); assert.equal(result.member.ability, 'Form A');
  sp.wildItemRare = [];
  const emptyRare = create(c, H.facts(), [...H.baseDraws(), { n: 100, value: 55 }], H.input({ form: 1 }));
  assert.equal(emptyRare.status, 'created'); assert.equal(emptyRare.member.item, '');
});

test('scaling resets moves/PP and level experience even when level is unchanged or initial withMoves=false', () => {
  const result = create(H.content(), H.facts({ scaleWildLevels: true, party: [H.lead({ level: 5 }), H.lead({ level: 5 })] }), [...H.baseDraws(), { n: 5, value: 2 }], H.input({ withMoves: false }));
  assert.equal(result.member.level, 5); assert.equal(result.member.exp, 125);
  assert.deepEqual(result.member.moves, [{ id: 'growl', pp: 40, maxpp: 40, ppUps: 0 }, { id: 'tackle', pp: 35, maxpp: 35, ppUps: 0 }]);
  assert.equal(result.member.origin.level, 5);
});

test('canonical wild item survives existing persistent and battle views without becoming a source ticket', async () => {
  require(require('node:path').join(H.ROOT, 'scripts/tests/ts-source-loader.cjs'));
  const { pathToFileURL } = require('node:url');
  const K = await import(pathToFileURL(require('node:path').join(H.ROOT, 'src/framework/rules/species-key.ts')));
  const c = H.content(H.samePools);
  c.speciesKeys = { Fixture: { species: 'fixture', form: 0 } };
  const member = create(c).member;
  const persistent = K.toPersistentMember(member, c), battle = K.toBattleMember(G.copyProvidedWildMember(persistent), c);
  assert.equal(persistent.species, 'fixture'); assert.equal(battle.species, 'Fixture');
  for (const view of [member, persistent, battle]) {
    assert.equal(view.item, 'leftovers'); assert.equal(view.personalID, 128);
    assert.equal('sourceTicket' in view, false); assert.equal('heldSettlement' in view, false);
  }
});

test('provided member preserves complete trusted fields with no factory or stage parameter/RNG', () => {
  const given = structuredClone(oracle.cases[27].expected);
  given.id = 'Given'; given.personalID = 0xffffffff; given.hp = 1; given.status = 'slp'; given.statusCount = 3;
  given.nature = 'timid'; given.statNature = 'modest'; given.gender = 'N'; given.ability = 'Trusted Override'; given.abilityIndex = null; given.effectiveAbilityIndex = null;
  given.shiny = false; given.superShiny = true; given.item = 'leftovers'; given.owner.id = 444; given.form = 63;
  given.moves[0].pp = 1; given.markings = [2,1]; given.ribbons = ['Champion']; given.isEgg = true;
  const before = structuredClone(given), copied = G.copyProvidedWildMember(given, () => { throw Error('must not draw'); });
  assert.deepEqual(copied, before); assert.notEqual(copied, given);
  copied.owner.id = 0; copied.ivs.hp = 0; copied.moves[0].pp = 0; copied.markings.push(1);
  assert.deepEqual(given, before);
});

test('invalid generation/lead/scale facts and broken RNG reject without hidden default values', () => {
  const noRng = H.tape([]);
  for (const patch of [{ shinyCharm: undefined }, { moreAbilities: 1 }, { battledCount: -1 }, { registration: {} }, { party: [{ ...H.lead(), isEgg: undefined }] }]) assert.throws(() => G.createWildSpecies(H.input(), H.content(), H.facts(patch), noRng), /fact|projection|battled/);
  for (const patch of [{ level: 0 }, { id: '' }, { owner: { id: -1, name: '', gender: 2, language: 2 } }]) assert.throws(() => G.createWildSpecies(H.input(patch), H.content(), H.facts(), noRng));
  for (const levels of [[-1], [101], [1.5], [NaN]]) assert.throws(() => G.balancedPartyLevel(levels), /level/);
  for (const max of [0, 101, 1.5]) assert.throws(() => G.balancedPartyLevel([1], max), /level/);
  assert.throws(() => G.wildLeadOverrides(0, [], true, false, noRng), /gender/);
  for (const value of [-1, 3, .5, NaN]) assert.throws(() => G.wildLeadOverrides(128, [H.lead({ ability: 'Cute Charm' })], true, false, () => value), /random/);
});
