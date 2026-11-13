'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');let work,parse;
test.before(async()=>{
 work=fs.mkdtempSync(path.join(os.tmpdir(),'pf-request-contract-'));
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,logLevel:'error',build:{outDir:work,minify:false,lib:{entry:path.join(ROOT,'src/framework/battle/request.ts'),formats:['cjs'],fileName:()=> 'request.cjs'}}});
 parse=require(path.join(work,'request.cjs')).parseBattleRequest;
});
test.after(()=>{if(work)fs.rmSync(work,{recursive:true,force:true});});
const member={ident:'p1: P1',details:'Pikachu, L50',condition:'80/100',active:true};
const side={id:'p1',name:'Player',pokemon:[member]};
const move={id:'tackle',move:'Tackle',pp:10,maxpp:35,target:'normal',disabled:false};
const normal=()=>({active:[{moves:[{...move}]}],side:structuredClone(side)});
for(const [name,value]of[
 ['normal',normal()],['forced replacement',{forceSwitch:[true],side}],['waiting',{wait:true,side}],
 ['team preview',{teamPreview:true,maxChosenTeamSize:6,side}],['empty',{}],['null',null],
 ['Struggle',{active:[{moves:[{id:'struggle',move:'Struggle',target:'randomNormal'}]}],side}],
 ['locked move',{active:[{moves:[{id:'outrage',move:'Outrage'}]}],side}],
 ['empty doubles seat',{active:[null,{moves:[move]}],side:{...side,pokemon:[{...member,condition:'0 fnt'},member]}}],
 ['optional public fields',{...normal(),noCancel:true,update:true,rqid:7,active:[{moves:[{...move,disabled:'locked',disabledSource:'taunt'}],maybeTrapped:true}],ally:side,opaqueEngineField:{future:[1,'kept']}}],
])test(`request boundary preserves ${name} without inventing fields`,()=>{
 const before=JSON.stringify(value);assert.equal(parse(value),value);assert.equal(JSON.stringify(value),before);
});
for(const [name,mutate]of[
 ['move PP',r=>{r.active[0].moves[0].pp='10';}],['move max PP',r=>{r.active[0].moves[0].maxpp=Infinity;}],
 ['move target',r=>{r.active[0].moves[0].target=2;}],['move disabled',r=>{r.active[0].moves[0].disabled=1;}],
 ['move disabled source',r=>{r.active[0].moves[0].disabledSource=1;}],['side name',r=>{r.side.name=1;}],
 ['member condition',r=>{r.side.pokemon[0].condition=2;}],['member active',r=>{r.side.pokemon[0].active='yes';}],
 ['member stats',r=>{r.side.pokemon[0].stats={atk:'bad',def:1,spa:1,spd:1,spe:1};}],
 ['member moves',r=>{r.side.pokemon[0].moves=[4];}],['member ability',r=>{r.side.pokemon[0].ability=4;}],
 ['member held item',r=>{r.side.pokemon[0].item={id:'potion'};}],['member flags',r=>{r.side.pokemon[0].reviving=1;}],
 ['active trapped',r=>{r.active[0].trapped='yes';}],['active tera',r=>{r.active[0].canTerastallize=2;}],
 ['conflicting modes',r=>{r.wait=true;}],['force-switch entries',r=>{delete r.active;r.forceSwitch=['yes'];}],
 ['wait marker',r=>{delete r.active;r.wait=false;}],['team preview marker',r=>{delete r.active;r.teamPreview='yes';}],
])test(`request boundary rejects invalid ${name}`,()=>{
 const input=normal();mutate(input);assert.throws(()=>parse(input),/invalid battle request payload/);
});
test('invalid outer payloads cannot cross into the request DTO',()=>{
 for(const input of [undefined,42,'move',[],{active:[]},{side},{forceSwitch:[],side:{}}])assert.throws(()=>parse(input),/invalid battle request payload/);
});
