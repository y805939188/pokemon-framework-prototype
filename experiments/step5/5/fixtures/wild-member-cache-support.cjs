'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../../../..');

async function modules() {
  if (process.env.PF_WILD_CACHE_BUNDLE_DIR) {
    const dir = process.env.PF_WILD_CACHE_BUNDLE_DIR;
    return { wild: require(path.join(dir, 'wild-member.cjs')), factory: require(path.join(dir, 'member-factory.cjs')) };
  }
  require(path.join(ROOT, 'scripts/tests/ts-source-loader.cjs'));
  const [wild, factory] = await Promise.all(['wild-member', 'member-factory'].map(name => import(pathToFileURL(path.join(ROOT, 'src/framework/rules', name + '.ts')))));
  return { wild, factory };
}

// An author fixture, deliberately not the biological data for the named rule family.
// In particular UNOWN with gender=128 witnesses a numeric-returning creation handler and proportional cache.
function content(family = 'Fixture', patch = {}, forms = Array.from({ length: 64 }, (_, i) => i)) {
  const base = { base: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 }, growth: 'medium', baseExp: 64,
    evYield: {}, catchRate: 255, learnset: { 1: ['tackle'], 3: ['growl'], 5: ['tackle'] },
    abilities: ['A', 'B'], hiddenAbilities: [null, 'Hidden'], gender: 128, happiness: 256,
    ruleSpecies: family, contentId: 'fixture', ...patch };
  return { species: Object.fromEntries(forms.map(form => [form ? 'Fixture' + form : 'Fixture', { ...structuredClone(base), form }])),
    forms: { fixture: Object.fromEntries(forms.map(form => [String(form), form ? 'Fixture' + form : 'Fixture'])) },
    speciesIds: { fixture: 'Fixture' },
    moves: { tackle: { id: 'tackle', pp: 35 }, growl: { id: 'growl', pp: 40 } } };
}
const input = patch => ({ id: 'W1', species: 'Fixture', level: 5, owner: { id: 0, name: 'Player', gender: 2, language: 2 }, context: { map: 9, receivedAt: 123 }, ...patch });
const baseDraws = (pid = 128, extra = []) => [
  { n: 65536, value: Math.floor(pid / 65536) }, { n: 65536, value: pid % 65536 },
  ...[31, 0, 1, 2, 3, 4].map(value => ({ n: 32, value })), ...extra,
];
function tape(draws) {
  let at = 0;
  const calls = [];
  const random = n => {
    assert(at < draws.length, 'unexpected draw(' + n + ') after ' + JSON.stringify(calls));
    const next = draws[at++];
    assert.equal(n, next.n, 'RNG domain at call ' + at);
    calls.push({ n, value: next.value });
    return next.value;
  };
  random.calls = calls;
  random.exhausted = () => assert.equal(at, draws.length, 'unconsumed RNG suffix');
  return random;
}
const absent = { playerPresent: false, dexPresent: false };
const present = { playerPresent: true, dexPresent: true };
module.exports = { ROOT, modules, content, input, baseDraws, tape, absent, present };
