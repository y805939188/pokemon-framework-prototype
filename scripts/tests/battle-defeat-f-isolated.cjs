'use strict';
// Only this explicit legacy fixture suite uses these scoped plugin bytes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {createHash, randomBytes} = require('node:crypto'), {spawnSync} = require('node:child_process');
const names = ['PS_SaveLocation', 'PS_BattleFlow', 'PS_World'];
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function prepare(root, evidence) {
  const parent = path.join(root, 'build', 'isolated-launch');
  fs.mkdirSync(parent, {recursive:true, mode:0o700});
  assert.equal(fs.realpathSync(parent),parent,'scope parent must not be linked');
  assert.equal(fs.lstatSync(parent).mode & 0o077, 0, 'scope parent must be private');
  const stage = fs.mkdtempSync(path.join(parent, 'battle-defeat-f-'));
  const game = path.join(stage,'game'), profile = path.join(stage,'profile'), saves = path.join(stage,'saves');
  for (const dir of ['game','game/js','game/js/plugins','profile','saves']) fs.mkdirSync(path.join(stage,dir),{mode:0o700});
  const marker = path.join(stage,'.pf-isolated-stage'), manifest = path.join(game,'js/plugins.js');
  fs.writeFileSync(marker, randomBytes(32).toString('hex') + '\n', {flag:'wx',mode:0o600});
  fs.writeFileSync(manifest,'var $plugins = [];\n',{flag:'wx',mode:0o600}); // command harness supplies native plugin order
  const artifacts = {};
  for (const name of names) {
    const result = spawnSync(process.execPath, [path.join(root,'src/node_modules/vite/bin/vite.js'),'build'], {
      cwd: path.join(root,'src'), env:{...process.env,RR_PLUGIN:name,RR_ISOLATED_TEST_STAGE:stage}, encoding:'utf8',timeout:30_000,
    });
    fs.writeFileSync(path.join(evidence,name+'.isolated-build.log'),(result.stdout ?? '') + (result.stderr ?? ''),{flag:'wx',mode:0o600});
    assert.ifError(result.error);
    assert.equal(result.status,0,'isolated plugin bundle did not build: '+name);
    artifacts[name] = path.join(game,'js/plugins',name+'.js');
  }
  const files = Object.fromEntries([marker,manifest,...Object.values(artifacts)].map(file=>[file,sha(file)]));
  const verify = () => {
    for (const [file, expected] of Object.entries(files)) {
      assert.equal(fs.realpathSync(file),file,'linked stage artifact');
      assert.equal(sha(file),expected,'different scoped test artifact');
    }
    assert.deepEqual(fs.readdirSync(saves), [], 'the preexisting native save call counter must not write disk');
  };
  verify();
  const argv = ['--ps-isolated-test', '--user-data-dir='+profile, '--ps-save-dir='+saves];
  return {scope:'EXPLICIT_ISOLATED_LEGACY_FIXTURE_NOT_ORDINARY',game,profile,saves,argv,manifest,artifacts,files,verify};
}
module.exports = {prepare};
