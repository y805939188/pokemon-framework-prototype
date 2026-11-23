'use strict';
const path = require('node:path'), { pathToFileURL } = require('node:url');
const H = require('./wild-member-cache-support.cjs');
async function moduleUnderTest() {
  if (process.env.PF_WILD_GENERATION_BUNDLE_DIR) return require(path.join(process.env.PF_WILD_GENERATION_BUNDLE_DIR, 'wild-generation.cjs'));
  require(path.join(H.ROOT, 'scripts/tests/ts-source-loader.cjs'));
  return import(pathToFileURL(path.join(H.ROOT, 'src/framework/rules/wild-generation.ts')));
}
const lead = patch => ({ isEgg: false, hp: 10, level: 5, ability: '', gender: 'M', nature: 'modest', ...patch });
const facts = patch => ({ source: 'step', session: 'ordinary', registration: { ...H.present }, party: [], shinyCharm: false,
  higherShinyByBattled: false, battledCount: 0, moreAbilities: true, roamer: false, legendaryPerfectIVs: true,
  scaleWildLevels: false, allowHeldItemSources: true, ...structuredClone(patch || {}) });
function content(patch = {}, family = 'Fixture') {
  const c = H.content(family, patch);
  for (const sp of Object.values(c.species)) sp.learnset = { 1: ['tackle'], 3: ['growl'], 5: ['tackle'], 10: ['ember'], 20: ['swift'] };
  c.moves.ember = { id: 'ember', pp: 25 }; c.moves.swift = { id: 'swift', pp: 20 };
  c.meta = { kind: 'fixture', id: 'wild-generation', showdownSourceChecked: true };
  return c;
}
const singletonPools = { wildItemCommon: ['leftovers'], wildItemUncommon: ['oranberry'], wildItemRare: ['sitrusberry'] };
const samePools = { wildItemCommon: ['leftovers'], wildItemUncommon: ['leftovers'], wildItemRare: ['leftovers'] };
const lookup = id => ['leftovers', 'oranberry', 'sitrusberry'].includes(id) ? { id, holdable: true, mail: false } : null;
module.exports = { ...H, moduleUnderTest, lead, facts, content, singletonPools, samePools, lookup };
