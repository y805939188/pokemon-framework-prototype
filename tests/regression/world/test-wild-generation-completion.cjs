'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('../../support/world/wild-generation-support.cjs');
const L = require('../../support/world/fixtures/wild-generation-completion.literal.json');
let G;
test.before(async () => { G = await H.moduleUnderTest(); });
const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const lookup = id => ['oranberry', 'leftovers', 'sitrusberry', 'leppaberry', 'choiceband'].includes(id) ? { id, holdable: true, mail: false } : null;
const poolPatch = pools => Object.fromEntries(['wildItemCommon', 'wildItemUncommon', 'wildItemRare'].map((field, i) => [field, pools[i]]));
const prefix = ivs => [...H.baseDraws().slice(0, 2), ...ivs.map(value => ({ n: 32, value }))];
function run(content, facts, draws, input = H.input(), descriptor = lookup) {
  const random = H.tape(draws), result = G.createWildSpecies(input, content, facts, random, descriptor);
  random.exhausted(); return result;
}
const tuples = draws => draws.map(([n, value]) => ({ n, value }));
for (const v of L.policyVectors.filter(v => ['P01', 'P02', 'P04'].includes(v.policy))) test('accepted literal ' + v.id, () => {
  if (v.policy === 'P01' || v.policy === 'P02') {
    const pools = v.input.pools ?? [v.input.selectedPool, [], []];
    const c = H.content(poolPatch(pools)), facts = H.facts({ party: v.input.improved ? [H.lead({ ability: 'Compound Eyes' })] : [] });
    const draws = v.policy === 'P02' ? [{ n: 100, value: 0 }, ...tuples(v.draws)] : tuples(v.draws);
    const before = structuredClone(c), result = run(c, facts, [...H.baseDraws(), ...draws]);
    assert.equal(result.status, 'created'); assert.equal(result.member.item, v.output.item); assert.deepEqual(c, before);
  } else {
    const result = run(H.content({ flags: ['Legendary'] }), H.facts(), [...prefix(v.input.ivs), ...tuples(v.draws)]);
    assert.equal(result.status, 'created');
    assert.deepEqual(KEYS.map(key => result.member.ivs[key]), v.output.ivs);
    assert.equal(KEYS.filter(key => result.member.ivs[key] === 31).length, v.output.perfectCount);
    assert.equal(result.member.hp, Math.floor((90 + v.output.ivs[0]) * 5 / 100) + 15);
  }
});

test('P03 same ordered pool guarantees an item; other orders and multiplicities keep the tier gate', () => {
  const pools = [['oranberry', 'oranberry', 'leftovers'], ['oranberry', 'oranberry', 'leftovers'], ['oranberry', 'oranberry', 'leftovers']];
  for (const [value, expected] of [[0, 'oranberry'], [1, 'oranberry'], [2, 'leftovers']]) assert.equal(run(H.content(poolPatch(pools)), H.facts(), [...H.baseDraws(), { n: 3, value }]).member.item, expected);
  for (const pools of [
    [['oranberry', 'leftovers'], ['leftovers', 'oranberry'], ['oranberry', 'leftovers']],
    [['oranberry', 'oranberry', 'leftovers'], ['oranberry', 'leftovers'], ['leftovers', 'oranberry']],
  ]) assert.equal(run(H.content(poolPatch(pools)), H.facts(), [...H.baseDraws(), { n: 100, value: 56 }]).member.item, '');
  assert.equal(run(H.content(), H.facts(), H.baseDraws()).member.item, '');
  assert.equal(run(H.content(H.samePools), H.facts(), H.baseDraws()).member.item, 'leftovers');
});

test('all tier values retain partial-pool probability mass; no fallback or empty draw', () => {
  const c = H.content({ wildItemCommon: ['oranberry'] });
  for (const improved of [false, true]) {
    const counts = { oranberry: 0, '': 0 }, commonCount = improved ? 60 : 50;
    for (let roll = 0; roll < 100; roll++) {
      const item = roll < commonCount ? 'oranberry' : '';
      const draws = [...H.baseDraws(), { n: 100, value: roll }, ...(item ? [{ n: 1, value: 0 }] : [])];
      const result = run(c, H.facts({ party: improved ? [H.lead({ ability: 'Compound Eyes', hp: 0 })] : [] }), draws);
      assert.equal(result.status, 'created'); assert.equal(result.member.item, item); counts[item]++;
    }
    assert.deepEqual(counts, { oranberry: commonCount, '': 100 - commonCount });
  }
});

test('all tiers and occurrence indices preserve ordered duplicates across distinct nonempty pools', () => {
  const pools = [['oranberry', 'oranberry', 'leftovers'], ['sitrusberry', 'leppaberry'], ['choiceband']];
  const c = H.content(poolPatch(pools));
  for (const improved of [false, true]) {
    const a = improved ? 60 : 50, b = a + (improved ? 20 : 5), d = b + (improved ? 5 : 1);
    const mass = { oranberry: 0, leftovers: 0, sitrusberry: 0, leppaberry: 0, choiceband: 0, '': 0 };
    for (let roll = 0; roll < 100; roll++) {
      const pool = roll < a ? pools[0] : roll < b ? pools[1] : roll < d ? pools[2] : [];
      for (let at = 0; at < Math.max(1, pool.length); at++) {
        const item = pool[at] ?? '', result = run(c, H.facts({ party: improved ? [H.lead({ ability: 'Compound Eyes' })] : [] }), [...H.baseDraws(), { n: 100, value: roll }, ...(pool.length ? [{ n: pool.length, value: at }] : [])]);
        assert.equal(result.status, 'created'); assert.equal(result.member.item, item);
        mass[item] += pool.length ? 6 / pool.length : 6;
      }
    }
    assert.deepEqual(Object.values(mass), improved ? [240,120,60,60,30,90] : [200,100,15,15,6,264]);
  }
});

test('partial multi occurrence [A,A,B]/[]/[] has exact A/B/NoItem mass', () => {
  const c = H.content({ wildItemCommon: ['oranberry', 'oranberry', 'leftovers'] });
  for (const improved of [false, true]) {
    const common = improved ? 60 : 50, mass = { oranberry: 0, leftovers: 0, '': 0 };
    for (let roll = 0; roll < 100; roll++) for (let at = 0; at < (roll < common ? 3 : 1); at++) {
      const chosen = roll < common, expected = chosen ? ['oranberry', 'oranberry', 'leftovers'][at] : '';
      const r = run(c, H.facts({ party: improved ? [H.lead({ ability: 'Super Luck' })] : [] }), [...H.baseDraws(), { n: 100, value: roll }, ...(chosen ? [{ n: 3, value: at }] : [])]);
      assert.equal(r.status, 'created'); assert.equal(r.member.item, expected); mass[expected] += chosen ? 1 : 3;
    }
    assert.deepEqual(Object.values(mass), improved ? [120,60,120] : [100,50,150]);
  }
});

test('every nonempty candidate source is checked before C even when the would-be tier is empty/none', () => {
  const c = H.content(poolPatch([['oranberry', 'leftovers'], [], ['choiceband']]));
  const seen = [];
  assert.deepEqual(run(c, H.facts(), [], H.input(), id => { seen.push(id); return id === 'choiceband' ? null : lookup(id); }), { status: 'unsupported', reason: 'held-item-descriptor' });
  assert.deepEqual(seen, ['oranberry', 'leftovers', 'choiceband']);
  const noLookup = () => { throw Error('source-gated lookup must stay cold'); };
  assert.deepEqual(run(c, H.facts({ allowHeldItemSources: false }), [], H.input(), noLookup), { status: 'unsupported', reason: 'held-item-source-disabled' });
  const unchecked = H.content({ wildItemCommon: ['oranberry'] }); delete unchecked.meta.showdownSourceChecked;
  assert.deepEqual(run(unchecked, H.facts(), [], H.input(), noLookup), { status: 'unsupported', reason: 'held-item-source-unchecked' });
});

test('120 ordered paths form 20 uniform subsets and preserve exact k0..6 distributions for all 64 masks', () => {
  const c = H.content({ flags: ['Legendary'] }), subsetCounts = new Map();
  for (const path of L.orderedIVPaths) {
    assert.equal(new Set(path.selected).size, 3);
    const key = [...path.selected].sort().join(','); subsetCounts.set(key, (subsetCounts.get(key) || 0) + 1);
  }
  assert.equal(subsetCounts.size, 20); for (const count of subsetCounts.values()) assert.equal(count, 6);
  for (let mask = 0; mask < 64; mask++) {
    const initial = KEYS.map((_, i) => mask & (1 << i) ? 31 : 0), k = initial.filter(v => v === 31).length, finalCounts = {};
    for (const path of L.orderedIVPaths) {
      const expected = initial.map((value, index) => path.selected.includes(KEYS[index]) ? 31 : value);
      const result = run(c, H.facts(), [...prefix(initial), ...tuples(path.draws)]);
      assert.equal(result.status, 'created'); assert.deepEqual(KEYS.map(key => result.member.ivs[key]), expected);
      assert.equal(result.member.hp, Math.floor((90 + expected[0]) * 5 / 100) + 15);
      assert.deepEqual([result.member.personalID, result.member.nature, result.member.gender, result.member.ability, result.member.abilityIndex, result.member.shiny, result.member.superShiny], [128,'adamant','M','A',0,false,false]);
      const count = expected.filter(v => v === 31).length; finalCounts[count] = (finalCounts[count] || 0) + 1;
    }
    assert.deepEqual(finalCounts, L.expectedPerfectCountMultiplicityPer120[String(k)], 'mask ' + mask);
  }
});

test('legend config/flags control exactly zero or three draws, including already-perfect initial IVs', () => {
  for (const flag of ['Legendary', 'Mythical', 'UltraBeast']) {
    const c = H.content({ flags: [flag] });
    const off = run(c, H.facts({ legendaryPerfectIVs: false }), prefix([0,0,0,0,0,0]));
    assert.equal(off.status, 'created'); assert.deepEqual(KEYS.map(k => off.member.ivs[k]), [0,0,0,0,0,0]);
    const on = run(c, H.facts(), [...prefix([31,31,31,31,31,31]), { n: 6, value: 5 }, { n: 5, value: 4 }, { n: 4, value: 3 }]);
    assert.equal(on.status, 'created'); assert.deepEqual(KEYS.map(k => on.member.ivs[k]), [31,31,31,31,31,31]);
  }
  assert.equal(run(H.content(), H.facts(), H.baseDraws()).status, 'created');
});

test('legend alone preserves initial move policy, experience, origin and complete identity', () => {
  const c = H.content({ flags: ['Legendary'] }), input = H.input({ withMoves: false });
  const r = run(c, H.facts(), [...prefix([0,0,0,0,0,0]), { n: 6, value: 0 }, { n: 5, value: 0 }, { n: 4, value: 0 }], input);
  assert.equal(r.status, 'created'); assert.deepEqual(r.member.moves, []); assert.deepEqual(r.member.firstMoves, []);
  assert.deepEqual([r.member.level,r.member.exp,r.member.origin.level,r.member.origin.map,r.member.origin.receivedAt,r.member.owner,r.member.personalID,r.member.nature,r.member.gender,r.member.ability,r.member.abilityIndex,r.member.shiny,r.member.superShiny],
    [5,125,5,9,123,input.owner,128,'adamant','M','A',0,false,false]);
  assert.equal(r.member.hp, 21);
});

test('held→tier→PID→lead→legend→scale has a literal joint prefix and full-HP projection', () => {
  const c = H.content({ wildItemCommon: ['oranberry'], flags: ['Legendary'] });
  const facts = H.facts({ higherShinyByBattled: true, battledCount: 500, moreAbilities: false, party: [H.lead({ level: 10, hp: 0, ability: 'Synchronize' }), H.lead({ isEgg: true, level: 50 })], scaleWildLevels: true });
  const draws = [...prefix([0,0,0,0,0,0]), { n: 100, value: 0 }, { n: 1, value: 0 }, { n: 1000, value: 29 }, { n: 65536, value: 0 }, { n: 65536, value: 1 }, { n: 100, value: 49 }, { n: 6, value: 0 }, { n: 5, value: 0 }, { n: 4, value: 0 }, { n: 5, value: 0 }];
  const r = run(c, facts, draws);
  assert.equal(r.status, 'created'); assert.deepEqual(KEYS.map(k => r.member.ivs[k]), [31,31,31,0,0,0]);
  assert.deepEqual([r.member.item,r.member.personalID,r.member.gender,r.member.ability,r.member.nature,r.member.level,r.member.hp,r.member.exp,r.member.origin.level], ['oranberry',1,'F','B','modest',48,116,110592,5]);
  assert.deepEqual(r.member.moves.map(m => m.id), ['growl','tackle','ember','swift']);
});
