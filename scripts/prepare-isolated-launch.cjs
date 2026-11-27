#!/usr/bin/env node
'use strict';

// Assembly only. This script never starts NW, prepares assets, reads an old save,
// or uses the ordinary install as a fallback. A native supervisor owns those gates.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = fs.realpathSync(path.join(__dirname, '..'));
const MANIFEST = 'js/plugins.js';
const BRIDGE = 'js/reactor_plugins.js';
const MARKER = '.pf-isolated-stage';
const PROFILE_MARKER = '.pf-native-launch-profile';
const NATIVE_PROFILE = 'darwin-arm64-nw0.117.0-chromium154.0.8037.58-profile-default-v1';
const nativeAppName = epoch => 'pf-step6d-launch-' + epoch.slice(0, 24);
const PLAN = 'launch-plan.json';
const REPORT = 'evidence/report.json';
const SCOPED = ['PS_SaveLocation', 'PS_RuntimeFixes', 'PS_BattleSmoke', 'PS_BattleFlow', 'PS_World', 'PS_BattleFlowTest'];
const KNOWN = new Set([...SCOPED, 'RR_Pixi8Particles', 'PS_SaveState', 'PS_Management', 'PS_Inventory', 'PS_Progression', 'PS_Evolution', 'PS_Pokedex']);
const RUNTIME = ['index.html', 'package.json', 'js/engine/build/production.cjs', 'data/System.json', 'data/MapInfos.json', 'data/framework/content.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const requireThat = (ok, code) => { if (!ok) throw Error(code); };
function read(file, code, privateFile = false) {
  try {
    const st = fs.lstatSync(file);
    if (st.isFile() && st.nlink === 1 && (!privateFile || ((st.mode & 0o077) === 0 && st.uid === process.getuid?.())) && fs.realpathSync(file) === file) return fs.readFileSync(file);
  } catch { /* Output uses a fixed refusal, not an OS error. */ }
  throw Error(code);
}
function dir(file, code, empty = false) {
  try {
    const st = fs.lstatSync(file);
    if (st.isDirectory() && st.uid === process.getuid?.() && (st.mode & 0o077) === 0 && fs.realpathSync(file) === file &&
      (!empty || fs.readdirSync(file).length === 0)) return;
  } catch { /* See read(). */ }
  throw Error(code);
}
function absent(file, code) {
  try { fs.lstatSync(file); } catch (error) { if (error?.code === 'ENOENT') return; }
  throw Error(code);
}
function parentOf(root) { return path.join(root, 'build', 'isolated-launch'); }
function createStage(root = ROOT) {
  const parent = parentOf(root);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  dir(parent, 'isolated-parent-not-private');
  const epoch = randomBytes(32).toString('hex');
  const projected = nativePackage(root, epoch);
  const stage = fs.mkdtempSync(path.join(parent, 'launch-'));
  for (const leaf of ['game', 'game/js', 'game/js/plugins', 'profile', 'saves', 'home', 'tmp', 'evidence', 'build-logs'])
    fs.mkdirSync(path.join(stage, leaf), { mode: 0o700 });
  fs.writeFileSync(path.join(stage, MARKER), epoch + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(stage, PROFILE_MARKER), NATIVE_PROFILE + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(stage, 'game/package.json'), projected, { flag: 'wx', mode: 0o600 });
  return stage;
}
function stageInputs(root, stage) {
  requireThat(path.isAbsolute(stage) && path.normalize(stage) === stage && path.dirname(stage) === parentOf(root) &&
    /^launch-[A-Za-z0-9]+$/.test(path.basename(stage)), 'isolated-stage-not-owned-child');
  dir(parentOf(root), 'isolated-parent-not-private');
  for (const leaf of ['', 'game', 'game/js', 'game/js/plugins', 'build-logs']) dir(path.join(stage, leaf), 'isolated-directory-not-private');
  for (const leaf of ['profile', 'saves', 'home', 'tmp', 'evidence']) dir(path.join(stage, leaf), 'isolated-output-not-private-or-empty', true);
  const marker = read(path.join(stage, MARKER), 'isolated-stamp-unavailable', true).toString();
  requireThat(/^[a-f0-9]{64}\n$/.test(marker), 'isolated-stamp-invalid');
  requireThat(read(path.join(stage, PROFILE_MARKER), 'isolated-native-profile-unavailable', true).toString() === NATIVE_PROFILE + '\n',
    'isolated-native-profile-invalid');
  absent(path.join(stage, 'game', 'save'), 'isolated-game-has-project-save');
  return marker.trimEnd();
}
function parseManifest(bytes) {
  const payload = /^(?:[ \t]*\/\/[^\r\n]*(?:\r?\n))*\s*var\s+\$plugins\s*=\s*(\[[\s\S]*\])\s*;\s*$/.exec(bytes.toString())?.[1];
  requireThat(payload, 'isolated-manifest-not-generated-json');
  let rows;
  try { rows = JSON.parse(payload); } catch { throw Error('isolated-manifest-not-generated-json'); }
  requireThat(rows.length === KNOWN.size, 'isolated-manifest-unexpected-plugins');
  const seen = new Set();
  for (const row of rows) {
    requireThat(row && typeof row === 'object' && !Array.isArray(row) &&
      KNOWN.has(row.name) && !seen.has(row.name) && typeof row.status === 'boolean' && typeof row.description === 'string' &&
      row.parameters && typeof row.parameters === 'object' && !Array.isArray(row.parameters) && Object.keys(row).length === 4 &&
      Object.values(row.parameters).every(value => typeof value === 'string'), 'isolated-manifest-invalid-row');
    seen.add(row.name);
  }
  return rows;
}
function stagedManifest(ordinary) {
  const rows = parseManifest(ordinary);
  const enabled = rows.filter(row => row.status).map(row => row.name);
  requireThat(SCOPED.every(name => enabled.includes(name)), 'isolated-manifest-missing-consumer');
  requireThat(enabled.indexOf('PS_BattleFlow') < enabled.indexOf('PS_BattleFlowTest'), 'isolated-manifest-driver-before-flow');
  requireThat(rows.find(row => row.name === 'PS_BattleSmoke').parameters.runOnBoot === 'false' &&
    rows.find(row => row.name === 'PS_BattleFlow').parameters.contentSource !== 'fixture', 'isolated-manifest-unexpected-test-behavior');
  const location = rows.find(row => row.name === 'PS_SaveLocation');
  const ordered = rows.filter(row => row !== location);
  const consumer = ordered.findIndex(row => row.status && SCOPED.includes(row.name));
  ordered.splice(consumer, 0, location);
  const bytes = Buffer.from('// Generated for one private isolated Flow canary.\nvar $plugins =\n[\n' +
    ordered.map(row => JSON.stringify(row)).join(',\n') + '\n];\n');
  return { ordered, bytes };
}
function scopedTag(plugin, stage, epoch, nativeProfile) {
  return '// PF-SCOPED-IIFE-v1 ' + plugin + ' ' + hash(JSON.stringify([plugin, stage, epoch, ...(nativeProfile ? [nativeProfile] : [])]));
}
function artifactMode(bytes, name, stage, epoch) {
  const tags = bytes.toString().split(/\r?\n/).filter(line => line.startsWith('// PF-SCOPED-IIFE-'));
  const scoped = SCOPED.includes(name);
  requireThat(scoped ? tags.length === 1 && tags[0] === scopedTag(name, stage, epoch, NATIVE_PROFILE) : tags.length === 0,
    'isolated-artifact-wrong-build-scope');
}
function planArguments(stage, scene) {
  return [path.join(stage, 'game'), '--mute-audio', '--ps-isolated-test',
    '--user-data-dir=' + path.join(stage, 'profile'), '--ps-save-dir=' + path.join(stage, 'saves'),
    '--ps-flow-test=launcher-canary', '--ps-flow-out=' + path.join(stage, REPORT), '--ps-flow-quit',
    ...(scene ? ['--ps-fix=scene'] : [])];
}
function nativePackage(root, epoch) {
  const baseline = JSON.parse(read(path.join(root, 'package.json'), 'isolated-workspace-package-unavailable'));
  const name = nativeAppName(epoch);
  const userHome = os.userInfo().homedir; // do not trust the supplied HOME as the owner-default root
  for (const parent of ['Application Support', 'Caches'])
    absent(path.join(userHome, 'Library', parent, name), 'isolated-native-app-name-in-use');
  requireThat(baseline.main === 'index.html' && baseline['chromium-args'] === '--force-color-profile=srgb', 'isolated-workspace-package-changed');
  return Buffer.from(json({ ...baseline, name }));
}
function runtimeInputs(root, stage, epoch) {
  const checks = {};
  const game = path.join(stage, 'game');
  const packageBytes = nativePackage(root, epoch);
  const pins = JSON.parse(read(path.join(root, 'scripts/reactor-source-manifest.json'), 'isolated-reactor-pins-unavailable')).runtime;
  requireThat(typeof pins?.['runtime/reactor_main.js'] === 'string', 'isolated-reactor-pins-unavailable');
  const pinLeaves = Object.keys(pins).map(key => {
    requireThat(/^runtime\/(?:reactor_[a-z0-9_]+\.js|libs\/[A-Za-z0-9_.-]+)$/.test(key), 'isolated-reactor-pin-invalid');
    return 'js/' + key.slice('runtime/'.length);
  });
  requireThat(!fs.readdirSync(path.join(game, 'js')).some(name => name === 'main.js' || /^rmmz_.*\.js$/.test(name)),
    'isolated-stock-and-reactor-mixed');
  for (const leaf of [...RUNTIME, ...pinLeaves]) {
    const data = read(path.join(game, leaf), 'isolated-hydrated-input-unavailable');
    const sha = hash(data);
    if (leaf === 'package.json') requireThat(data.equals(packageBytes), 'isolated-package-settings-changed');
    if (leaf === 'index.html') {
      const scripts = data.toString().match(/<script\b/gi) ?? [];
      requireThat(scripts.length === 1 &&
        /<script\s+type="text\/javascript"\s+src="js\/reactor_main\.js"\s*>\s*<\/script>/i.test(data.toString()),
        'isolated-index-not-reactor-entry');
    }
    if (pinLeaves.includes(leaf))
      requireThat(sha === pins['runtime/' + leaf.slice('js/'.length)], 'isolated-reactor-input-not-pinned');
    checks[leaf] = sha;
  }
  return checks;
}
function sealedPlan(root, stage, scene) {
  const epoch = stageInputs(root, stage);
  const ordinary = read(path.join(root, MANIFEST), 'isolated-ordinary-manifest-unavailable');
  const { ordered, bytes } = stagedManifest(ordinary);
  const gameManifest = read(path.join(stage, 'game', MANIFEST), 'isolated-staged-manifest-unavailable', true);
  requireThat(gameManifest.equals(bytes), 'isolated-staged-manifest-mismatch');
  const bridge = path.join(stage, 'game', BRIDGE);
  try {
    requireThat(fs.lstatSync(bridge).isSymbolicLink() && fs.readlinkSync(bridge) === 'plugins.js' &&
      fs.realpathSync(bridge) === path.join(stage, 'game', MANIFEST), 'isolated-reactor-manifest-bridge-mismatch');
  } catch { throw Error('isolated-reactor-manifest-bridge-mismatch'); }
  const artifacts = {};
  for (const { name, status } of ordered) {
    if (!status) continue;
    const leaf = 'js/plugins/' + name + '.js';
    const data = read(path.join(stage, 'game', leaf), 'isolated-plugin-artifact-unavailable');
    artifactMode(data, name, stage, epoch);
    if (!SCOPED.includes(name))
      requireThat(data.equals(read(path.join(root, leaf), 'isolated-ordinary-artifact-unavailable')), 'isolated-ordinary-artifact-changed');
    artifacts[leaf] = hash(data);
  }
  return {
    schema: 2, scope: 'ISOLATED_LAUNCH_CANARY_NO_NATIVE_EXECUTION', scene,
    profile: {
      contract: NATIVE_PROFILE, appName: nativeAppName(epoch), dataPath: path.join(stage, 'profile', 'Default'),
      home: path.join(stage, 'home'), temporary: path.join(stage, 'tmp'),
    },
    ordinaryPackageSHA256: hash(read(path.join(root, 'package.json'), 'isolated-workspace-package-unavailable')),
    ordinaryManifestSHA256: hash(ordinary), stagedManifestSHA256: hash(gameManifest), manifestBridge: { [BRIDGE]: MANIFEST },
    enabled: ordered.filter(row => row.status).map(row => row.name),
    runtime: runtimeInputs(root, stage, epoch), artifacts, argv: planArguments(stage, scene),
  };
}
function viteBuild(root, stage, name) {
  const result = spawnSync(process.execPath, [path.join(root, 'src/node_modules/vite/bin/vite.js'), 'build'], {
    cwd: path.join(root, 'src'), env: { ...process.env, RR_PLUGIN: name, RR_ISOLATED_TEST_STAGE: stage },
    encoding: 'utf8', timeout: 45000,
  });
  fs.writeFileSync(path.join(stage, 'build-logs', name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''), { flag: 'wx', mode: 0o600 });
  requireThat(!result.error && result.status === 0, 'isolated-plugin-build-failed');
}
function assemble(root, stage, scene, build = viteBuild) {
  const epoch = stageInputs(root, stage);
  requireThat(typeof scene === 'boolean', 'isolated-scene-selection-invalid');
  absent(path.join(stage, PLAN), 'isolated-plan-already-exists');
  absent(path.join(stage, 'game', MANIFEST), 'isolated-game-manifest-already-exists');
  absent(path.join(stage, 'game', BRIDGE), 'isolated-reactor-manifest-bridge-already-exists');
  dir(path.join(stage, 'game/js/plugins'), 'isolated-plugin-directory-not-empty', true);
  runtimeInputs(root, stage, epoch); // Refuse before emit/write on missing hydration or mismatched settings.
  const { ordered, bytes } = stagedManifest(read(path.join(root, MANIFEST), 'isolated-ordinary-manifest-unavailable'));
  fs.writeFileSync(path.join(stage, 'game', MANIFEST), bytes, { flag: 'wx', mode: 0o600 });
  fs.symlinkSync('plugins.js', path.join(stage, 'game', BRIDGE));
  for (const { name, status } of ordered) {
    if (!status) continue;
    if (SCOPED.includes(name)) build(root, stage, name);
    else {
      const leaf = 'js/plugins/' + name + '.js';
      fs.writeFileSync(path.join(stage, 'game', leaf), read(path.join(root, leaf), 'isolated-ordinary-artifact-unavailable'), { flag: 'wx', mode: 0o600 });
    }
  }
  const plan = sealedPlan(root, stage, scene);
  fs.writeFileSync(path.join(stage, PLAN), json(plan), { flag: 'wx', mode: 0o600 });
  return plan;
}
function verify(root, stage, expectedSHA) {
  stageInputs(root, stage);
  const bytes = read(path.join(stage, PLAN), 'isolated-plan-unavailable', true);
  requireThat(typeof expectedSHA === 'string' && /^[a-f0-9]{64}$/.test(expectedSHA) && hash(bytes) === expectedSHA, 'isolated-plan-seal-mismatch');
  const parsed = JSON.parse(bytes);
  requireThat(typeof parsed.scene === 'boolean' && bytes.toString() === json(sealedPlan(root, stage, parsed.scene)), 'isolated-plan-changed');
  return parsed;
}

module.exports = { createStage, stagedManifest, scopedTag, assemble, verify, hash, SCOPED, NATIVE_PROFILE, PROFILE_MARKER };
if (require.main === module) {
  const [mode, stage, detail, ...rest] = process.argv.slice(2);
  try {
    requireThat(rest.length === 0, 'isolated-unexpected-arguments');
    if (mode === 'new' && stage === undefined) console.log(createStage());
    else if (mode === 'assemble' && stage && ['default', 'scene'].includes(detail)) {
      assemble(ROOT, stage, detail === 'scene');
      console.log(hash(read(path.join(stage, PLAN), 'isolated-plan-unavailable', true)));
    } else if (mode === 'verify' && stage && detail) {
      verify(ROOT, stage, detail);
      console.log('verified private canary envelope; NW not started');
    } else throw Error('isolated-usage: new | assemble <stage> default|scene | verify <stage> <sha256>');
  } catch (error) {
    const reason = /^isolated-[a-z-]+(?:: new \| assemble <stage> default\|scene \| verify <stage> <sha256>)?$/.test(error?.message)
      ? error.message : 'isolated-launch-preflight-refused';
    console.error(reason);
    process.exitCode = 2;
  }
}
