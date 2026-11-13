'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,M;
test.before(()=>{temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-move-choice-'));const source=path.join(ROOT,'src/plugins/battleflow/move-choice.ts');fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:path.dirname(source),outDir:temp,noEmitOnError:true},files:[source]}));const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);M=require(path.join(temp,'move-choice.js'));});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test('PP zero is red, positive quarter orange, half yellow and above half dark',()=>{
 for(const [pp,maxpp,colour]of[[0,40,'#bd2929'],[1,40,'#b35d00'],[10,40,'#b35d00'],[11,40,'#8b7300'],[20,40,'#8b7300'],[21,40,'#202028'],[40,40,'#202028']])assert.deepEqual(M.movePP(pp,maxpp),{pp:`PP ${pp}/${maxpp}`,ppColour:colour});
});
test('PP colours use exact ratios for odd totals instead of rounding the threshold up',()=>{
 assert.equal(M.movePP(6,25).ppColour,'#b35d00');assert.equal(M.movePP(7,25).ppColour,'#8b7300');assert.equal(M.movePP(12,25).ppColour,'#8b7300');assert.equal(M.movePP(13,25).ppColour,'#202028');
});
test('unlimited and PP-less requests omit graphical PP rather than printing a placeholder',()=>{
 for(const [pp,total]of[[0,0],[0,-1],[undefined,undefined],[undefined,5],[1,undefined]])assert.equal(M.movePP(pp,total).pp,null);
});
test('all eighteen Gen8 type labels have a coloured replaceable badge',()=>{
 const names=['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark','Fairy'],seen=new Set();
 for(const type of names){const v=M.moveChoice('Move',type,'localized '+type,1,5);assert.equal(v.type,type);assert.equal(v.typeLabel,'localized '+type);assert.match(v.typeColour,/^#[0-9a-f]{6}$/);seen.add(v.typeColour);}assert.equal(seen.size,18);
});
test('missing or unsupported metadata remains an explicit neutral badge without blocking selection',()=>{
 for(const type of[null,'FutureType','toString']){const v=M.moveChoice('Recharge',type,'ignored',undefined,undefined);assert.equal(v.name,'Recharge');assert.equal(v.type,null);assert.equal(v.typeLabel,'?');assert.equal(v.typeColour,'#707781');assert.equal(v.pp,null);}
});
test('returned display values are detached and retain the whole published name and supplied language label',()=>{
 const a=M.moveChoice('A long authored move name','Water','水',12,25),b=M.moveChoice('A long authored move name','Water','Water',12,25);a.typeColour='BAD';assert.equal(b.typeColour,'#4d7cbd');assert.equal(a.name,'A long authored move name');assert.equal(a.typeLabel,'水');assert.equal(b.typeLabel,'Water');
});
test('bright Electric and dark Ghost badges use readable contrasting label ink',()=>{
 assert.equal(M.moveChoice('Move','Electric','电',1,5).typeTextColour,'#000000');
 assert.equal(M.moveChoice('Move','Ghost','幽灵',1,5).typeTextColour,'#ffffff');
});
