'use strict';
// Reverse probes for step 5.0: put ONE guarantee back to a plausible wrong version, rebuild, run the suites meant to
// catch it, restore. "caught" = a targeted suite failed; "MISSED" = all passed. Restores every file afterwards.
// Usage: node experiments/step5/probes/unfix5.cjs [ids...] > <out.json>   (from the repository root)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const FW = 'src/framework';
const T = f => `experiments/step5/${f}.cjs`;
const U = [
  { id: 'migr-partial', what: 'the 3 -> 4 migration skips unmappable names instead of refusing the whole save', edits: [[`${FW}/rules/save-schema.ts`, '    if (problems.length) throw new MigrationRefused("unmapped-species"', '    if (false) throw new MigrationRefused("unmapped-species"']], tests: [T('test-species-key5'), T('test-migration5')] },
  { id: 'migr-no-content', what: 'without the content mapping the migration keeps Showdown names (identity) instead of refusing', edits: [[`${FW}/rules/save-schema.ts`, '    const key = options.speciesKey;\n    if (!key) throw', '    const key = options.speciesKey ?? ((n: string) => ({ species: n, form: 0 }));\n    if (!key) throw']], tests: [T('test-species-key5')] },
  { id: 'apply-identity', what: 'the application commits without the content mapping (captures stored by Showdown name)', edits: [[`${FW}/app/game-application.ts`, 'applyBattleResult(this.ports.state.read(), result, this.limits, speciesKeyResolver(content))', 'applyBattleResult(this.ports.state.read(), result, this.limits)']], tests: [T('test-app5')] },
  { id: 'no-battle-view', what: 'sessions get the stored state (content ids) instead of the battle view', edits: [[`${FW}/app/game-application.ts`, 'try { session = await this.ports.sessions.create(request, view, setup); }', 'try { session = await this.ports.sessions.create(request, game, setup); }']], tests: [T('test-app5'), 'experiments/step3/test-application.cjs'] },
  { id: 'hash-mapped', what: 'the ledger hashes the result after mapping (pre-schema-4 ledger entries no longer recognised)', edits: [[`${FW}/rules/state.ts`, '  const h = resultHash(result);', '  const h = resultHash({ ...result, dex: { seen: (result.dex?.seen || []).map((n) => keys(n)?.species ?? n), owned: (result.dex?.owned || []).map((n) => keys(n)?.species ?? n) } });']], tests: [T('test-migration5'), T('test-species-key5')] },
  { id: 'p42-no-release', what: 'stateReplacedByHost does not release the open operation', edits: [[`${FW}/app/game-application.ts`, '    if (this.op && this.op.session) this.detached.add(this.op.session);\n    this.op = null;', '    if (this.op && this.op.session) this.detached.add(this.op.session);']], tests: [T('test-app5'), T('test-plugin-host5')] },
  { id: 'p42-late-commit', what: 'a session of a replaced state still commits when it finishes', edits: [[`${FW}/app/game-application.ts`, '    if (this.detached.has(handle)) {', '    if (false) {']], tests: [T('test-app5')] },
  { id: 'stats-canlose', what: 'a defeat the author allowed (canLose) is counted as a blackout', edits: [[`${FW}/app/game-application.ts`, '    if (!facts.canLose) next = bumpStat(next, "blacked_out_count");', '    next = bumpStat(next, "blacked_out_count");']], tests: [T('test-app5')] },
  { id: 'stats-split', what: 'a wild catch is counted as lost (the WP53 1/4 vs 2/3/5 split broken)', edits: [[`${FW}/app/game-application.ts`, 'const won = facts.kind === "wild" ? code === 1 || code === 2 : code === 1;', 'const won = code === 1;']], tests: [T('test-app5')] },
  { id: 'steps-saturate', what: 'the step counter saturates at 2^31 - 1 instead of wrapping to 0', edits: [[`${FW}/rules/stats.ts`, '  return (steps + n) % STEP_MODULUS;', '  return Math.min(steps + n, STEP_MODULUS - 1);']], tests: [T('test-app5'), T('test-plugin-host5')] },
  { id: 'steps-guard', what: 'steps on a forced move route or while an event runs are counted', edits: [['src/plugins/PS_BattleFlow.ts', '    if (this.isMoveRouteForcing() || G.$gameMap.isEventRunning()) return;\n', '']], tests: [T('test-plugin-host5')] },
  { id: 'gate-open', what: 'a record may use a source with no recorded pre-use check', edits: [[`${FW}/content/compile.ts`, '    if (!src.usageCheck) return `source', '    if (false) return `source']], tests: [T('test-content5')] },
  { id: 'load-no-content', what: 'PS_SaveState migrates without giving the content mapping', edits: [['src/plugins/PS_SaveState.ts', 'const r = schema().migrateGame(sys._psGame, speciesKey ? { speciesKey } : {});', 'const r = schema().migrateGame(sys._psGame, {});']], tests: [T('test-plugin-host5')] },
  { id: 'load-no-release', what: 'loading a save does not release a battle the application held', edits: [['src/plugins/PS_SaveState.ts', '      if (W.PSFlow) W.PSFlow.stateReplaced();\n      const r = schema()', '      const r = schema()']], tests: [T('test-plugin-host5')] },
  { id: 'form-fallback', what: 'a form the content lacks is dangling instead of falling back to the base form (WP03 §3.2)', edits: [[`${FW}/rules/species-key.ts`, '    return own(forms, String(key.form)) ?? own(forms, "0") ?? null;', '    return own(forms, String(key.form)) ?? null;']], tests: [T('test-species-key5')] },
  { id: 'config-range', what: 'a party size above 6 is accepted', edits: [[`${FW}/rules/config.ts`, '  MAX_PARTY_SIZE: [1, 6, "a party holds 1 to 6 members (one battle side)"],', '  MAX_PARTY_SIZE: [1, 99],']], tests: [T('test-content5')] },
];
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
const want = process.argv.slice(2), out = [];
for (const u of U) {
  if (want.length && !want.includes(u.id)) continue;
  const files = [...new Set(u.edits.map(e => e[0]))];
  const saved = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  try {
    for (const [f, a, b] of u.edits) { const p = path.join(ROOT, f); const s = fs.readFileSync(p, 'utf8'); const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${u.id}: ${n} matches in ${f}`); fs.writeFileSync(p, s.replace(a, b)); }
    const b = sh('pnpm', ['--dir', 'src', 'build:engine']);
    if (b.status !== 0) { out.push({ id: u.id, what: u.what, verdict: 'BUILD-FAILED', detail: (b.stdout + b.stderr).slice(-400) }); continue; }
    const results = u.tests.map(t => { const r = sh('node', ['--test', t], { timeout: 300000 }); return { test: path.basename(t), status: r.status, fail: Number((r.stdout.match(/^# fail (\d+)/m) || [])[1]), cancelled: Number((r.stdout.match(/^# cancelled (\d+)/m) || [])[1] || 0), failing: [...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map(x => x[1].slice(0, 120)) }; });
    out.push({ id: u.id, what: u.what, verdict: results.some(r => r.fail > 0 || r.cancelled > 0 || r.status !== 0) ? 'caught' : 'MISSED', results });
  } catch (e) { out.push({ id: u.id, what: u.what, verdict: 'NOT-APPLIED', detail: String(e.message) }); }
  finally { for (const f of files) fs.writeFileSync(path.join(ROOT, f), saved[f]); }
}
sh('pnpm', ['--dir', 'src', 'build:engine']);
console.log(JSON.stringify({ at: new Date().toISOString(), head: sh('git', ['rev-parse', 'HEAD']).stdout.trim(), dirty: sh('git', ['status', '--short']).stdout, probes: out }, null, 1));
for (const o of out) console.error(`${o.id} ${o.verdict}${o.results ? '  <- ' + o.results.map(r => `${r.test} fail=${r.fail}`).join(', ') : ''}${o.detail ? ' ' + o.detail : ''}`);
