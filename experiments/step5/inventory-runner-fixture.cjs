'use strict';

// Historical Step 5 launcher contract exercised with a fixed synthetic Node
// child. This is not an NW/MZ launcher and does not accept an executable,
// game checkout, profile, environment source or evidence root from callers.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const modes = new Set(['all', 'verify-save', 'driver-selftest', 'closeout-lifecycle', 'inventory', 'perf']);
const acceptedOptions = new Set([
  'PF_OWNED_EXPECTED', 'PF_OWNED_SAVES', 'PF_OWNED_LIFECYCLE_GROUPS', 'PF_OWNED_LIFECYCLE_CYCLES',
  'PF_OWNED_PERF_ROUNDS', 'STUB_OVERALL', 'STUB_DS99',
]);
const groups = new Set(['learning', 'evolution', 'trade', 'inventory', 'pokedex', 'summary-pokedex', 'summary-only']);
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const expectedFiles = dir => fs.readdirSync(dir).filter(name => /^ps-flow-expected.*\.json$/.test(name)).sort();
const SYNTHETIC_CHILD = `
const fs = require('node:fs'), path = require('node:path');
const argv = process.argv.slice(1), arg = name => argv.find(s => s.startsWith('--' + name + '=')).slice(name.length + 3);
const report = arg('ps-flow-out'), mode = arg('ps-flow-test'), saves = arg('ps-save-dir');
if (mode === 'all') {
  fs.mkdirSync(saves);
  fs.writeFileSync(path.join(saves, 'file14.rmmzsave'), 'synthetic save');
  for (const n of ['ps-flow-expected.json', 'ps-flow-expected-t31.json']) {
    fs.writeFileSync(path.join(path.dirname(report), n), JSON.stringify({n}));
  }
}
const overall = mode === 'driver-selftest' ? 'fail' : process.env.STUB_OVERALL ?? 'pass';
const results = mode === 'driver-selftest'
  ? [{id:'DS-01/x injected',status:'fail'}, {id:'DS-99 control',status:process.env.STUB_DS99 ?? 'pass'}]
  : [{id:'stub',status:overall}];
fs.writeFileSync(report, JSON.stringify({overall,results,argv}));
`;

function createInventoryRunnerFixture() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-inventory-fixture-')));
  fs.mkdirSync(path.join(dir, 'game')); // a directory sentinel only, never opened as a game

  // Containment applies even to missing paths and forged symlinks. There is
  // no path override for the Node child, and no inherited environment.
  function fixturePath(value) {
    const file = path.resolve(dir, value);
    const relative = path.relative(dir, file);
    const parts = relative.split(path.sep);
    if (!relative || path.isAbsolute(relative) || parts[0] === '..') throw Error('path outside synthetic fixture');
    let current = dir;
    for (const part of parts) {
      current = path.join(current, part);
      if (fs.lstatSync(current, {throwIfNoEntry:false})?.isSymbolicLink()) throw Error('symlink outside synthetic fixture contract');
    }
    return file;
  }
  function run(evidenceName, mode, options = {}) {
    const rejected = out => ({exit:2, out, launch:null, report:null});
    const denied = Object.keys(options).find(name => !acceptedOptions.has(name));
    if (denied) return rejected(`unsupported fixture option: ${denied}`);
    if (!modes.has(mode)) return rejected(`unsupported mode: ${mode}`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(evidenceName)) return rejected('invalid fixture evidence name');
    if (options.PF_OWNED_LIFECYCLE_GROUPS !== undefined) {
      const value = options.PF_OWNED_LIFECYCLE_GROUPS.split(',');
      if (mode !== 'closeout-lifecycle' || new Set(value).size !== value.length || value.some(name => !groups.has(name))) {
        return rejected('PF_OWNED_LIFECYCLE_GROUPS requires distinct known groups and closeout-lifecycle');
      }
    }
    if (options.PF_OWNED_LIFECYCLE_CYCLES !== undefined &&
        (mode !== 'closeout-lifecycle' || !['100','200'].includes(options.PF_OWNED_LIFECYCLE_CYCLES))) {
      return rejected('PF_OWNED_LIFECYCLE_CYCLES requires closeout-lifecycle and 100 or 200');
    }
    if (options.PF_OWNED_PERF_ROUNDS !== undefined) {
      const rounds = options.PF_OWNED_PERF_ROUNDS;
      if (mode !== 'perf' || !/^\d+$/.test(rounds) || Number(rounds) < 1 || Number(rounds) > 25) {
        return rejected('PF_OWNED_PERF_ROUNDS requires perf and integer 1..25');
      }
    }
    if (mode === 'verify-save' && (!options.PF_OWNED_EXPECTED || !options.PF_OWNED_SAVES)) {
      return rejected('verify-save needs PF_OWNED_EXPECTED=<producing evidence dir> and PF_OWNED_SAVES=<its saves dir>');
    }
    let evidence, saves, source;
    try {
      evidence = fixturePath(evidenceName);
      saves = fixturePath(options.PF_OWNED_SAVES ?? path.join(evidence, 'saves'));
      if (mode === 'verify-save') source = fixturePath(options.PF_OWNED_EXPECTED);
      fs.mkdirSync(evidence); // never reuse a previous report directory
    } catch (error) { return rejected(String(error.message)); }
    const launchPath = path.join(evidence, 'launch.json');
    const reportPath = path.join(evidence, 'report.json');
    const record = result => (fs.writeFileSync(launchPath, JSON.stringify(result)), result);
    const refuse = reason => ({
      exit:2, out:reason, report:null,
      launch:record({status:'preflight-refused', reason, expectedSource:source, saves}),
    });

    const argv = [`--ps-flow-test=${mode}`, `--ps-save-dir=${saves}`, `--ps-flow-out=${reportPath}`];
    const launch = {};
    if (mode === 'verify-save') {
      if (source === evidence) return refuse('the producing evidence directory must differ from this verify-save directory');
      let prior;
      try { prior = readJson(fixturePath(path.join(source, 'launch.json'))); }
      catch (error) { return refuse(`no readable producing record: ${error.message}`); }
      if (!prior || typeof prior !== 'object' || Array.isArray(prior)) return refuse('producing record is not an object');
      if (prior.exit !== 0 || prior.timedOut !== false || prior.overall !== 'pass') return refuse('the producing run did not pass');
      const produced = prior.producedExpected;
      if (!produced || typeof produced !== 'object' || Array.isArray(produced) || !Object.keys(produced).length) {
        return refuse('producing run recorded no expected-state files');
      }
      if (Object.entries(produced).some(([name, hash]) => !/^ps-flow-expected[A-Za-z0-9._-]*\.json$/.test(name) || typeof hash !== 'string')) return refuse('recorded expected-state entries must be plain ps-flow-expected*.json names with a digest');
      if (JSON.stringify(expectedFiles(source)) !== JSON.stringify(Object.keys(produced).sort())) return refuse('expected-state files present differ from the recorded files');
      try {
        for (const [name, hash] of Object.entries(produced)) {
          const file = fixturePath(path.join(source, name));
          if (!fs.statSync(file).isFile()) return refuse(`expected-state file missing: ${name}`);
          if (digest(file) !== hash) return refuse(`expected-state file changed since it was produced: ${name}`);
        }
        const saveFiles = fs.existsSync(saves) && fs.statSync(saves).isDirectory() ? fs.readdirSync(saves).sort() : [];
        if (!saveFiles.length) return refuse('saves directory missing or empty');
        const candidates = saveFiles.map(name => [name, fixturePath(path.join(saves,name))]);
        launch.savesBefore = Object.fromEntries(candidates.filter(([,file]) => fs.statSync(file).isFile()).map(([name,file]) => [name,digest(file)]));
      } catch (error) { return refuse(`invalid synthetic restart inputs: ${error.message}`); }
      launch.expectedSource = {dir:source,files:produced};
      argv.push(`--ps-flow-expected-dir=${source}`);
    }
    const child = spawnSync(process.execPath, ['-e', SYNTHETIC_CHILD, '--', ...argv], {
      cwd:dir, timeout:5000, encoding:'utf8',
      env:{STUB_OVERALL:options.STUB_OVERALL ?? 'pass', STUB_DS99:options.STUB_DS99 ?? 'pass'},
    });
    const report = fs.existsSync(reportPath) ? readJson(reportPath) : null;
    let passed = report?.overall === 'pass';
    if (mode === 'driver-selftest') {
      const control = report?.results.filter(result => result.id.startsWith('DS-99 ')) ?? [];
      launch.selftestControl = control.length === 1 ? control[0].status : 'missing';
      passed = launch.selftestControl === 'pass';
    }
    const status = {
      ...launch, exit:child.status, timedOut:child.error?.code === 'ETIMEDOUT',
      overall:report?.overall, results:report?.results, reportExists:!!report,
      producedExpected:Object.fromEntries(expectedFiles(evidence).map(name => [name,digest(path.join(evidence,name))])),
    };
    return {exit:child.status === 0 && passed ? 0 : 1, out:(child.stdout ?? '') + (child.stderr ?? ''), launch:record(status), report};
  }

  return {dir, run, cleanup:() => fs.rmSync(dir, {recursive:true, force:true})};
}

module.exports = {createInventoryRunnerFixture};
