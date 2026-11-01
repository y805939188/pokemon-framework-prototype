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
