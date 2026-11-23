'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ROOT = path.resolve(__dirname, '../../../..');

async function loadRule(name) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `pf55-c-rules-${name}-`));
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: out, emptyOutDir: false, minify: false,
    lib: { entry: path.join(ROOT, 'src/framework/rules', name + '.ts'), formats: ['cjs'], fileName: () => 'rule.cjs' } } });
  // Retain this task's isolated compilation until the coordinator's cleanup ledger permits removal.
  process.stderr.write('C_RULES_ARTIFACT ' + out + '\n');
  return require(path.join(out, 'rule.cjs'));
}
function scripted(values) {
  let at = 0;
  const calls = [];
  const random = n => {
    assert(at < values.length, `unexpected random(${n}) after ${JSON.stringify(calls)}`);
    const value = values[at++]; calls.push([n, value]);
    assert(Number.isInteger(value) && value >= 0 && value < n, `bad script value ${value} for ${n}`);
    return value;
  };
  random.calls = calls;
  random.exhausted = () => assert.equal(at, values.length, 'unconsumed scripted draws');
  return random;
}
const lead = extra => ({ level: 20, hp: 10, isEgg: false, ability: '', item: '', ...extra });
const slot = (species = 'a', weight = 100, minLevel = 5, maxLevel = minLevel) => ({ species, weight, minLevel, maxLevel });
const noLevels = () => ({ lowerWildLevel: false, higherWildLevel: false });
const noRates = () => ({ lowerEncounterRate: false, higherEncounterRate: false });
const table = (stepChance = 21, slots = [slot()]) => ({ stepChance, slots });

/** Independent arithmetic oracle: caller supplies the spec's combined multipliers, not ability/item identities. */
function triggerOracle({ base, state, fromStep = true, cycling = false, chanceFactor = 1, graceFactor = 1, repel = false }, rolls) {
  let index = 0, grace = state.graceSteps, accumulator = state.accumulator;
  const chance = (base + (fromStep ? Math.floor(accumulator / 200) : 0)) * (cycling ? .8 : 1) * chanceFactor;
  const minimum = Math.max(0, Math.min(8, 8 - base / 10)) * graceFactor;
  if (fromStep && grace < minimum) {
    grace++;
    const threshold = chance * 5 / (base + Math.floor(accumulator / 200));
    if (rolls[index++] >= threshold) return { triggered: false, reason: 'grace', runtime: { graceSteps: grace, accumulator }, used: index };
  }
  if (rolls[index++] < chance) return { triggered: true, reason: 'triggered', runtime: { graceSteps: grace, accumulator }, used: index };
  if (fromStep) accumulator = repel ? 0 : accumulator + base;
  return { triggered: false, reason: 'miss', runtime: { graceSteps: grace, accumulator }, used: index };
}
module.exports = { loadRule, scripted, lead, slot, noLevels, noRates, table, triggerOracle };
