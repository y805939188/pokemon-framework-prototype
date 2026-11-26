'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-package-selection-'));try{return run(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function file(root,rel){const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'selection control, not an image decoder fixture');}
function select(source,target,withTests){
 const script='source "$1"; package_excludes "$2"; rsync -an --out-format="%n" "${EXCLUDES[@]}" "$3/" "$4/"';
 const r=spawnSync('bash',['-c',script,'package-selection',path.join(ROOT,'scripts/package-excludes.sh'),String(withTests),source,target],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 return r.stdout.split('\n').map(x=>x.trim()).filter(x=>x&&!x.endsWith('/')&&x!=='.');
}
for(const withTests of [0,1])test(`packaging ignores interrupted VM scratch withTests=${withTests}, preserving declared and user art`,()=>fixture(dir=>{
 const source=path.join(dir,'img'),target=path.join(dir,'output');fs.mkdirSync(target);
 const wanted=['pokemon/battlebacks/__tests__/pf_corrupt_bg.png','pokemon/battlebacks/__tests__/pf_backdrop_message.png','pokemon/custom/scene-ready-portrait.png','pokemon/battlebacks/scene-ready-user-bg.png'];
 for(const name of wanted)file(source,name);
 const scratch='pokemon/battlebacks/__tests__/scene-ready-interrupted';for(const role of ['bg','message','base0','base1'])file(source,scratch+'/pending_'+role+'.png');
 const dirty=select(source,target,withTests);for(const name of wanted)assert(dirty.includes(name),name);assert(!dirty.some(x=>x.includes('/scene-ready-interrupted/')));
 // A killed process could leave every file above. Selection must be identical
 // to a normal after-hook that removed precisely its own scratch directory.
 fs.rmSync(path.join(source,scratch),{recursive:true});assert.deepEqual(select(source,target,withTests),dirty);assert.deepEqual(fs.readdirSync(target),[],'dry-run writes no deployed assets');
}));
test('existing test-plugin/map exclusions remain separate from image scratch policy',()=>fixture(dir=>{
 const source=path.join(dir,'js'),target=path.join(dir,'output');fs.mkdirSync(target);
 for(const name of ['plugins/PS_BattleFlow.js','plugins/PS_BattleFlowTest.js','plugins/PS_BattleSmoke.js','plugins/PS_BattleFlow.js.map','plugins/.DS_Store'])file(source,name);
 assert.deepEqual(select(source,target,0),['plugins/PS_BattleFlow.js']);assert.deepEqual(select(source,target,1),['plugins/PS_BattleFlow.js','plugins/PS_BattleFlowTest.js','plugins/PS_BattleSmoke.js']);
}));

// Keep public legacy entry points fail-closed even if an old command line
// names a real evidence directory. Use only disposable evidence and HOME.
for (const name of ['run-flow-test-mac.sh', 'run-package-tests-mac.sh', 'run-package-perf-mac.sh', 'run-inventory-test-mac.sh']) {
  test(`${name} refuses before launch, build, or evidence and profile writes`, () => fixture(dir => {
    const fakeHome = path.join(dir, 'home');
    const evidence = path.join(dir, 'evidence');
    const files = [
      'evidence/ps-flow-old.json', 'evidence/ps-matrix-old.json', 'evidence/ps-saveloc.json',
      'evidence/previous.png', 'evidence/saves/file1.rmmzsave', 'evidence/perf/run1.json',
      'home/Library/Application Support/PokemonFrameworkPrototype/save/file1.rmmzsave',
      'project/save/file1.rmmzsave',
    ];
    for (const name of files) file(dir, name);
    // Put launch/build/cleanup tripwires before normal tools on PATH. Copy the
    // runner so even an accidental repo-relative write stays in the fixture.
    const local = path.join(dir, 'project', 'scripts', name);
    fs.mkdirSync(path.dirname(local), {recursive:true});
    fs.copyFileSync(path.join(ROOT, 'scripts', name), local);
    for (const command of ['rm', 'mkdir', 'open', 'nw', 'node', 'pnpm', 'npm', 'python3']) {
      const bin = path.join(dir, 'bin', command);
      fs.mkdirSync(path.dirname(bin), {recursive:true});
      fs.writeFileSync(bin, '#!/bin/sh\nprintf invoked > "$TRIPWIRE"\nexit 98\n', {mode:0o700});
    }
    function snapshot(root) {
      return fs.readdirSync(root, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))
        .map(entry => [entry.name, entry.isDirectory() ? snapshot(path.join(root,entry.name))
          : fs.readFileSync(path.join(root,entry.name)).toString('base64')]);
    }
    const before = snapshot(dir), tripwire = path.join(dir, 'called');
    for (const evidencePath of [evidence, path.join(dir, 'does-not-exist')]) {
      const args = name.includes('-perf-') ? ['3', evidencePath]
        : name.includes('-inventory-') ? [evidencePath, 'verify-save'] : [evidencePath];
      const result = spawnSync('bash', [local, ...args], {
        cwd:path.join(dir,'project'),
        env:{PATH:`${path.join(dir,'bin')}:/usr/bin:/bin`, HOME:fakeHome, TRIPWIRE:tripwire,
          PF_PACKAGE_ARGS:'--with-tests --harden', PF_PERF_ARGS:'--ps-perf-rounds=25',
          PF_OWNED_NW:path.join(dir,'bin','nw'), PF_OWNED_PROJECT:path.join(dir,'project'),
          PF_OWNED_EXPECTED:evidence, PF_OWNED_SAVES:path.join(evidence,'saves')},
        encoding:'utf8', timeout:3000
      });
      assert.ifError(result.error);
      assert.equal(result.status,64,result.stderr);
      assert.match(result.stderr,/^LEGACY_MAC_RUNNER_DISABLED:/);
      assert.equal(result.stdout,'');
      assert.deepEqual(snapshot(dir),before,'no reports, saves, directories or launch/build effects');
    }
  }));
}
