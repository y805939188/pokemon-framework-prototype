// Compile and optionally install caller-owned content. There is no default source or install target.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const {checkShowdownStaging} = require('./check-showdown-staging.cjs');
const root = fs.realpathSync.native(path.join(__dirname, '..'));
const cli = path.join(root, 'js/engine/build/content-cli.cjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const usage = 'node scripts/author-content.cjs --src=/path/to/content --stage=/path/to/new-stage --expect-id=ID [--game=/path/to/game]';
function fail(reason) { throw new Error(reason); }
function options(argv) {
  const opt = Object.create(null);
  for (const arg of argv) {
    const m = /^--(src|stage|expect-id|game)=(.+)$/.exec(arg);
    if (!m || Object.hasOwn(opt, m[1])) fail('unknown, empty or duplicate option; ' + usage);
    opt[m[1]] = m[2];
  }
  if (!opt.src || !opt.stage || !opt['expect-id']) fail(usage);
  for (const name of ['src', 'stage', 'game']) {
    if (opt[name] && (!path.isAbsolute(opt[name]) || opt[name].split(path.sep).includes('..'))) {
      fail(name + ' must be an absolute path without ..');
    }
  }
  return opt;
}
function entry(p) { return fs.lstatSync(p, { throwIfNoEntry: false }); }
function directory(p) {
  if (!entry(p)?.isDirectory()) fail('expected a directory (not a symlink): ' + p);
  // Darwin may accept alternate case or normalization; the native call returns the on-disk spelling.
  return fs.realpathSync.native(p);
}
function file(p) {
  if (!entry(p)?.isFile()) fail('expected a regular file (not a symlink): ' + p);
  return p;
}
function contains(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}
function disjoint(a, b) {
  if (contains(a, b) || contains(b, a)) fail('paths must not contain each other: ' + a + ', ' + b);
}
function targetFor(game) {
  const markers = fs.readdirSync(game).filter(name => /.+\.rmmzproject$/i.test(name));
  if (markers.length !== 1) fail('expected exactly one MZ project marker');
  const marker = file(path.join(game, markers[0]));
  if (fs.statSync(marker).size > 128 || !/^RPGMZ \d+\.\d+\.\d+$/.test(fs.readFileSync(marker, 'utf8').trimEnd())) {
    fail('invalid MZ project marker');
  }
  const data = directory(path.join(game, 'data'));
  file(path.join(data, 'System.json'));
  const dir = path.join(data, 'framework');
  if (entry(dir)) directory(dir);
  const target = path.join(dir, 'content.json');
  if (entry(target)) fail('install target already exists: ' + target);
  return {dir, target};
}
function run(command, src, flag, dest) {
  execFileSync(process.execPath, [cli, command, '--src=' + src, '--' + flag + '=' + dest], {stdio: 'inherit'});
}
// Same-directory hard link publishes only a complete file and atomically refuses an existing target.
function install(game, bytes) {
  const {dir, target} = targetFor(game);
  if (!entry(dir)) fs.mkdirSync(dir);
  const scratch = fs.mkdtempSync(path.join(dir, '.author-install-'));
  const tmp = path.join(scratch, 'content.json');
  try {
    fs.writeFileSync(tmp, bytes, {flag: 'wx', mode: 0o644});
    fs.linkSync(tmp, target);
  } finally {
    if (entry(tmp)) fs.unlinkSync(tmp);
    fs.rmdirSync(scratch);
  }
  if (!fs.readFileSync(file(target)).equals(bytes)) fail('installed bytes differ');
}
function compareFresh(src, stage, bytes, report) {
  // check alone binds its input hash, not every byte. Independently regenerate both outputs before installing.
  const verify = fs.mkdtempSync(path.join(stage, '.compare-'));
  try {
    const fresh = path.join(verify, 'content.json'), freshReport = path.join(verify, 'inventory.json');
    run('build', src, 'out', fresh);
    run('inventory', src, 'report', freshReport);
    if (!fs.readFileSync(file(fresh)).equals(bytes) || !fs.readFileSync(file(freshReport)).equals(report)) {
      fail('independent rebuild differs');
    }
  } finally { fs.rmSync(verify, {recursive: true}); }
}
function main(argv) {
  const o = options(argv), src = directory(o.src), expected = o['expect-id'];
  // Canonicalize the existing parent once (macOS /tmp is itself a symlink).
  const stageParent = directory(fs.realpathSync(path.dirname(o.stage)));
  const stage = path.join(stageParent, path.basename(o.stage));
  if (entry(stage)) fail('stage already exists: ' + stage);
  disjoint(root, stage);
  disjoint(stage, src);
  const game = o.game ? directory(o.game) : undefined;
  if (game) {
    disjoint(stage, game);
    disjoint(root, game);
    const {dir} = targetFor(game);
    disjoint(src, dir);
  }
  for (const name of fs.readdirSync(src)) if (name.endsWith('.json')) file(path.join(src, name));
  if (JSON.parse(fs.readFileSync(file(path.join(src, 'manifest.json')))).id !== expected) fail('unexpected source content ID');
  file(cli);
  const pin = checkShowdownStaging(root);
  fs.mkdirSync(stage, {mode: 0o700});
  const build = path.join(stage, 'content.json'), inventory = path.join(stage, 'inventory.json');
  run('build', src, 'out', build);
  run('check', src, 'out', build);
  run('inventory', src, 'report', inventory);
  const bytes = fs.readFileSync(file(build)), report = fs.readFileSync(file(inventory));
  const content = JSON.parse(bytes), summary = JSON.parse(report), species = content.species.length;
  if (!Number.isSafeInteger(content.schema) || content.schema < 1 || content.contentId !== expected ||
      !/^[0-9a-f]{64}$/.test(content.inputsHash) || !/^[0-9a-f]{64}$/.test(content.contentIdentity) ||
      content.showdownSha !== pin || summary.schema !== 1 || summary.contentId !== expected ||
      summary.inputsHash !== content.inputsHash || summary.summary?.species !== species ||
      summary.showdownSha !== (species ? content.showdownSha : null)) fail('compiled content or inventory identity differs');
  compareFresh(src, stage, bytes, report);
  if (game) install(game, bytes);
  console.log(JSON.stringify({contentId: expected, schema: content.schema, inputsHash: content.inputsHash,
    contentSha256: sha256(bytes), inventorySha256: sha256(report), installed: Boolean(game)}));
}
module.exports = {compareFresh};
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('author-content: ' + error.message); process.exitCode = 1; }
}
