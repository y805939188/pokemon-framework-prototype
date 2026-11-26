'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const digest = b => createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'author-content-test-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const src = path.join(temp, 'author inputs'), stage = path.join(temp, 'build outputs'), game = path.join(temp, 'empty project');
  fs.mkdirSync(src); fs.mkdirSync(path.join(game, 'data'), {recursive: true});
  fs.writeFileSync(path.join(game, 'game.rmmzproject'), 'RPGMZ 1.10.0');
  fs.writeFileSync(path.join(game, 'data/System.json'), '{}');
  const write = (name, value) => fs.writeFileSync(path.join(src, name + '.json'), JSON.stringify(value));
  const id = 'demo-' + digest(Buffer.from(temp)).slice(0, 9);
  write('manifest', {schema: 2, id, title: 'Temporary authored content'});
  for (const name of ['sources','species','overlays']) write(name, []);
  const args = ['--src=' + src, '--stage=' + stage, '--expect-id=' + id, '--game=' + game];
  const run = argv => spawnSync(process.execPath, [path.join(root,'scripts/author-content.cjs'), ...argv],
    {cwd: temp, encoding: 'utf8', timeout: 120000});
  const target = path.join(game, 'data/framework/content.json');
  return {temp, src, stage, game, id, args, run, write, target};
}
function refused(result, match) {
  assert.equal(result.status, 1, result.stderr); assert.match(result.stderr, match);
}
test('build and install a distinct authored species through the production CLI and verify the installed bytes', t => {
  const x = fixture(t);
  x.write('sources', [
    {id:'pin',kind:'showdown',description:'Pinned lookup exercised only by this test',license:'See upstream',ref:'scripts/showdown.env',
      status:'confirmed',usedFor:['species.showdownId'],usageCheck:{checkedOn:'2026-01-01',checkedBy:'test',conditions:'Test lookup only',decision:'internal-use'}},
    {id:'temporary',kind:'author-placeholder',description:'Ephemeral test input',license:'Test only',ref:'this test',status:'placeholder',usedFor:['test field values']}
  ]);
  x.write('species', [{id:'marker',showdownId:'ditto',nameKey:'species.marker',growth:'parabolic',baseExp:6,evYield:{},
    catchRate:7,learnset:[],source:'temporary'}]);
  const result = x.run(x.args);
  assert.equal(result.status, 0, result.stderr);
  const emitted = JSON.parse(result.stdout.trim().split('\n').at(-1));
  const bytes = fs.readFileSync(x.target), reportBytes = fs.readFileSync(path.join(x.stage,'inventory.json'));
  const compiled = JSON.parse(bytes), report = JSON.parse(reportBytes);
  assert.equal(compiled.contentId, x.id); assert.equal(compiled.species[0].id,'marker');
  assert.equal(report.contentId, x.id); assert.equal(report.summary.species, 1);
  assert.equal(report.species[0].showdownId, 'ditto'); assert.equal(report.showdownSha, compiled.showdownSha);
  assert.equal(compiled.inputsHash, report.inputsHash);
  assert.deepEqual(bytes, fs.readFileSync(path.join(x.stage,'content.json')));
  assert.equal(emitted.contentSha256,digest(bytes)); assert.equal(emitted.inventorySha256,digest(reportBytes));
  assert.equal(emitted.installed,true); assert.deepEqual(fs.readdirSync(x.stage).sort(),['content.json','inventory.json']);
  const other = path.join(x.temp,'second-stage');
  refused(x.run(x.args.map(a=>a.startsWith('--stage=')?'--stage='+other:a)), /install target already exists/);
  assert.equal(fs.existsSync(other),false); assert.deepEqual(fs.readFileSync(x.target),bytes);
});
test('explicit stage-only compilation supports empty content without installing', t => {
  const x = fixture(t), result = x.run(x.args.slice(0,-1));
  assert.equal(result.status,0,result.stderr); assert.equal(fs.existsSync(x.target), false);
  assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)).installed,false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(x.stage,'inventory.json'))).showdownSha,null);
});
test('missing, misspelled, duplicate and relative arguments cannot fall back to framework defaults', t=>{
  const x=fixture(t);
  for(const argv of [x.args.slice(1),x.args.filter(a=>!a.startsWith('--stage=')),x.args.filter(a=>!a.startsWith('--expect-id=')),
    [...x.args,'--report=x'],[...x.args,'--src='+x.temp],x.args.map(a=>a.startsWith('--src=')?'--src=content/sample':a)]){
    refused(x.run(argv),/author-content:/); assert.equal(fs.existsSync(x.stage),false);
  }
  assert.equal(fs.existsSync(x.target),false);
});
test('an existing public sample with a different ID cannot stand in for the author',t=>{
  const x=fixture(t);
  refused(x.run(x.args.map(a=>a.startsWith('--src=')?'--src='+path.join(root,'content/sample'):a)),/unexpected source content ID/);
  assert.equal(fs.existsSync(x.stage),false);
});
test('reject stage inside project before writing, including an alias to the project root',t=>{
  const x=fixture(t), link=path.join(x.temp,'alias');
  fs.symlinkSync(x.game,link,'dir');
  for(const parent of [x.game,path.join(link,'data')]){
    const stage=path.join(parent,'stage');
    refused(x.run(x.args.map(a=>a.startsWith('--stage=')?'--stage='+stage:a)),/paths must not contain/);
    assert.equal(fs.existsSync(stage),false); assert.equal(fs.existsSync(x.target),false);
  }
});
test('use a canonical stage parent when the supplied parent is a directory alias', t => {
  const x = fixture(t), parent = path.join(x.temp, 'storage'), alias = path.join(x.temp, 'work-alias');
  fs.mkdirSync(parent);
  fs.symlinkSync(parent, alias, 'dir');
  const stage = path.join(alias, 'separate-output');
  const result = x.run(x.args.slice(0, -1).map(a => a.startsWith('--stage=') ? '--stage=' + stage : a));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(parent, 'separate-output/content.json'))).contentId, x.id);
  assert.equal(fs.existsSync(x.target), false);
});
test('refuse reused stage (including one containing the game), even with a convincing existing build',t=>{
  const x=fixture(t);
  fs.mkdirSync(x.stage); const prior=path.join(x.stage,'content.json'); fs.writeFileSync(prior,'keep');
  for(const stage of [x.stage,x.temp]) refused(x.run(x.args.map(a=>a.startsWith('--stage=')?'--stage='+stage:a)),/stage already exists/);
  assert.equal(fs.readFileSync(prior,'utf8'),'keep'); assert.equal(fs.existsSync(x.target),false);
});
test('a symlinked framework destination, even a dangling one, cannot redirect an install',t=>{
  const x=fixture(t), dir=path.dirname(x.target);
  const elsewhere=path.join(x.temp,'elsewhere'); fs.mkdirSync(elsewhere); fs.symlinkSync(elsewhere,dir,'dir');
  refused(x.run(x.args), /not a symlink/); assert.deepEqual(fs.readdirSync(elsewhere),[]);
  fs.unlinkSync(dir); fs.mkdirSync(dir); fs.symlinkSync(path.join(elsewhere,'absent'),x.target);
  refused(x.run(x.args),/already exists/); assert.equal(fs.existsSync(x.stage),false);
});
test('a failed real compiler run cannot install a stale document or modify a game',t=>{
  const x=fixture(t); x.write('species','bad');
  refused(x.run(x.args),/content build FAILED/); assert.equal(fs.existsSync(x.target),false);
  assert.equal(fs.existsSync(path.join(x.stage,'content.json')),false);
});
test('byte verification rejects modified content and inventory even with intact identity fields',t=>{
  const {compareFresh}=require('../author-content.cjs');
  const x=fixture(t), result=x.run(x.args.slice(0,-1));
  assert.equal(result.status,0,result.stderr);
  const bytes=fs.readFileSync(path.join(x.stage,'content.json'));
  const report=fs.readFileSync(path.join(x.stage,'inventory.json'));
  const content=JSON.parse(bytes), summary=JSON.parse(report);
  const tamper=(obj,changes)=>Buffer.from(JSON.stringify({...obj,...changes},null,2)+'\n');
  assert.throws(()=>compareFresh(x.src,x.stage,tamper(content,{grants:[{id:'fake'}]}),report),/independent rebuild differs/);
  assert.throws(()=>compareFresh(x.src,x.stage,bytes,tamper(summary,{note:'unverified'})),/independent rebuild differs/);
  assert.equal(fs.existsSync(x.target),false);
});
function toolCopy(x) {
  const tool = path.join(x.temp, 'tool'), script = path.join(tool,'scripts/author-content.cjs');
  fs.mkdirSync(path.dirname(script), {recursive:true});
  for (const name of ['author-content.cjs','check-showdown-staging.cjs','showdown.env']) {
    fs.copyFileSync(path.join(root,'scripts',name),path.join(tool,'scripts',name));
  }
  const run = args => spawnSync(process.execPath,[script,...args],{cwd:x.temp,encoding:'utf8'});
  return {tool, run};
}
test('a renamed genuine MZ marker works; ambiguous or invalid markers fail before producing output',t=>{
  const x=fixture(t), named=path.join(x.game,'Quest.RMMZPROJECT');
  fs.renameSync(path.join(x.game,'game.rmmzproject'),named);
  const second=path.join(x.game,'also.rmmzproject'); fs.writeFileSync(second,'RPGMZ 1.10.0');
  refused(x.run(x.args),/exactly one MZ/); assert.equal(fs.existsSync(x.stage),false); fs.unlinkSync(second);
  fs.writeFileSync(named,'not a MZ project'); refused(x.run(x.args),/invalid MZ project marker/);
  assert.equal(fs.existsSync(x.stage),false);
  fs.writeFileSync(named,'RPGMZ 1.10.0'); const result=x.run(x.args);
  assert.equal(result.status,0,result.stderr); assert.equal(fs.existsSync(x.target),true);
});
test('forbid game or stage inside an isolated tool checkout including alternate filesystem case',t=>{
  const x=fixture(t), {run,tool}=toolCopy(x);
  fs.mkdirSync(path.join(tool,'nested')); fs.mkdirSync(path.join(tool,'nested','data'));
  fs.writeFileSync(path.join(tool,'nested','game.rmmzproject'),'RPGMZ 1.10.0');
  const names=[tool], alternate=path.join(x.temp,'tOOl');
  if(fs.existsSync(alternate)) names.push(alternate); // case-sensitive volumes have no alias
  for(const name of names){
    refused(run(x.args.map(a=>a.startsWith('--game=')?'--game='+path.join(name,'nested'):a)),/paths must not contain/);
    const dest=path.join(name,'new-output');
    refused(run(x.args.map(a=>a.startsWith('--stage=')?'--stage='+dest:a)),/paths must not contain/);
    assert.equal(fs.existsSync(dest),false); assert.equal(fs.existsSync(x.stage),false);
  }
});
test('missing dependency staging and an incorrect custom format both stop even an empty author before writes',t=>{
  const x=fixture(t), {run,tool}=toolCopy(x), engine=path.join(tool,'js/engine');
  fs.mkdirSync(path.join(engine,'build'),{recursive:true});
  fs.copyFileSync(path.join(root,'js/engine/build/content-cli.cjs'),path.join(engine,'build/content-cli.cjs'));
  refused(run(x.args),/staged Showdown is incomplete/);
  assert.equal(fs.existsSync(x.stage),false); assert.equal(fs.existsSync(x.target),false);
  const stage=path.join(engine,'showdown');
  for(const dir of ['dist/sim','dist/data','dist/lib','dist/config','node_modules/ts-chacha20']) fs.mkdirSync(path.join(stage,dir),{recursive:true});
  for(const name of ['SOURCE_SHA','LICENSE']) fs.copyFileSync(path.join(root,'js/engine/showdown',name),path.join(stage,name));
  fs.copyFileSync(path.join(root,'js/engine/build/custom-formats.cjs'),path.join(engine,'build/custom-formats.cjs'));
  fs.writeFileSync(path.join(stage,'dist/config/custom-formats.js'),'different build');
  refused(run(x.args),/custom-formats.js differs/);
  assert.equal(fs.existsSync(x.stage),false); assert.equal(fs.existsSync(x.target),false);
});
