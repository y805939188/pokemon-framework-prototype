#!/usr/bin/env node
'use strict';
// Compare a package perf summary (scripts/run-package-perf-mac.sh -> perf-summary.json) with the performance budget
// (docs/step5/perf-budget.json, decision D5-8: baseline median + 20%, memory by the growth over 100 battles).
// Warnings only: the exit status is 0 unless the files cannot be read. A row without a measurement or a baseline is
// listed as such, never as "within budget".
//   node scripts/perf-budget.cjs <perf-summary.json> [--memory100=<perf-summary.json of a 25-round run>] [--out=<report.json>]
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const summaryFile = args.find(a => !a.startsWith('--'));
if (!summaryFile) { console.error('usage: perf-budget.cjs <perf-summary.json> [--memory100=<summary>] [--out=<file>]'); process.exit(2); }
const budget = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/step5/perf-budget.json'), 'utf8'));
const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
const byLabel = Object.fromEntries(summary.rows.map(r => [r.label, r]));
const rows = budget.rows.map(b => {
  const m = byLabel[b.label];
  const median = m ? m.median : null;
  const status = median === null || median === undefined ? 'not measured' : median > b.warnAbove ? 'WARN' : 'within';
  return { label: b.label, baselineMedian: b.baselineMedian, warnAbove: b.warnAbove, median, status };
});
let memory = { label: budget.memory100.label, warnAbove: budget.memory100.warnAbove, baselineGrowth: budget.memory100.baseline.growth, status: 'not measured' };
const mfile = opt('memory100');
if (mfile) {
  const ms = JSON.parse(fs.readFileSync(mfile, 'utf8'));
  const r = Object.fromEntries(ms.rows.map(x => [x.label, x.median]));
  const after4 = r['memory: app RSS after 4 battles (MB)'], last = r['memory: app RSS after the last round (MB)'], battles = r['battles in the rounds (4 per round; the last memory sample follows them)'];
  if (after4 != null && last != null && battles === 100) memory = { ...memory, rssAfter4: after4, rssAfter100: last, growth: last - after4, status: last - after4 > budget.memory100.warnAbove ? 'WARN' : 'within' };
  else memory = { ...memory, status: `not comparable (battles ${battles}, samples ${after4}/${last})` };
}
const report = { budget: 'docs/step5/perf-budget.json', summary: summaryFile, gitHead: summary.env && summary.env.gitHead, baselineGitHead: budget.baseline.gitHead, rows, memory, warnings: rows.filter(r => r.status === 'WARN').length + (memory.status === 'WARN' ? 1 : 0) };
for (const r of rows) console.log(`${r.status.padEnd(12)} ${String(r.median).padStart(8)} (warn above ${r.warnAbove}; baseline ${r.baselineMedian})  ${r.label}`);
console.log(`${memory.status.padEnd(12)} ${String(memory.growth ?? '-').padStart(8)} (warn above ${memory.warnAbove}; baseline ${memory.baselineGrowth})  ${memory.label}`);
console.log(`warnings: ${report.warnings} (warnings do not block, D5-8)`);
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(report, null, 1) + '\n');
