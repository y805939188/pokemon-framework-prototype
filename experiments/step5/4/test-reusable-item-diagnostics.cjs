'use strict';
// Author warnings only: no new reusable families, trainer policy or persisted data.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {E,inputs}=require('./trainer-ai-integration/fixtures.cjs');
const compile=input=>{const before=JSON.stringify(input),r=E.contentCompile.compileContent(input);assert(r.ok,JSON.stringify(r.errors));assert.equal(JSON.stringify(input),before);return r;};
const warnings=(r,code)=>r.warnings.filter(w=>w.message.startsWith(code+':'));
const trainerCode='trainer-reusable-healing',unsupportedCode='nonconsumable-battle-item-unsupported';
function reusable(input,id){const item=input.items.find(i=>i.id===id);assert(item,id);item.consumable=false;return item;}
test('type and record resources report exact author paths, including Full Restore and aliases',()=>{
 const input=inputs({items:[{item:'superpotion',count:1}]});reusable(input,'superpotion');const full=reusable(input,'fullrestore');full.id='workshop-restore';full.legacyIds=[];
 input.trainers[0].items=[{item:'workshop-restore',count:2}];const r=compile(input),ws=warnings(r,trainerCode);
 assert.deepEqual(ws.map(w=>[w.file,w.path]),[['trainer-types.json','$[0].items[0].item'],['trainers.json','$[0].items[0].item']]);
 assert.match(ws[0].message,/c-trainer.*superpotion/);assert.match(ws[1].message,/c-basic.*workshop-restore/);
 for(const w of ws){assert.match(w.message,/returns.*successful use/);assert.match(w.message,/repeatedly/);assert.match(w.message,/balance/);assert.match(w.message,/consumable:true/);}
 assert.deepEqual(r.data.trainerTypes,input.trainerTypes);assert.deepEqual(r.data.trainers,input.trainers);assert.equal(r.data.items.find(i=>i.id==='workshop-restore').consumable,false);
 assert.deepEqual(warnings(r,unsupportedCode),[]);
});
test('consumable, unlisted reusable, field-only and held-only items do not emit trainer balance warnings',()=>{
 const input=inputs({items:[{item:'potion',count:1}]});reusable(input,'superpotion');reusable(input,'leftovers');
 input.trainers[0].items=[{item:'leftovers',count:1}];assert.deepEqual(warnings(compile(input),trainerCode),[]);
 input.trainerTypes[0].items=[{item:'superpotion',count:1}];input.items.find(i=>i.id==='superpotion').battleUse='none';
 assert.deepEqual(warnings(compile(input),trainerCode),[]);assert.deepEqual(warnings(compile(input),unsupportedCode),[]);
});
for(const id of ['ether','revive','antidote','xattack','pokeball','poketoy'])test(`unsupported reusable ${id} warns without changing the author flag`,()=>{
 const input=inputs({items:[{item:id,count:1}]}),item=reusable(input,id),index=input.items.indexOf(item),r=compile(input),ws=warnings(r,unsupportedCode);
 assert.equal(ws.length,1);assert.equal(ws[0].file,'items.json');assert.equal(ws[0].path,`$[${index}].consumable`);
 assert(ws[0].message.includes(id));assert.match(ws[0].message,/player.*consume/);assert.match(ws[0].message,/unavailable.*trainer AI/);assert.match(ws[0].message,/battleUse:none/);
 assert.equal(r.data.items[index].consumable,false);assert.deepEqual(warnings(r,trainerCode),[]);
});
test('unknown IDs and mismatched battle use warn about unsupported reuse without promising an available action',()=>{
 for(const edit of [i=>{i.battleId='unregistered-tonic';},i=>{i.battleUse='active';},i=>{delete i.battleId;}]){
  const input=inputs(),item=reusable(input,'superpotion');edit(item);const ws=warnings(compile(input),unsupportedCode);assert.equal(ws.length,1);assert.match(ws[0].message,/where supported/);assert.match(ws[0].message,/does not enable/);
 }
});
test('invalid trainer resources remain errors, without warning processing on malformed input',()=>{
 const input=inputs();reusable(input,'superpotion');input.trainerTypes[0].items=[null];const r=E.contentCompile.compileContent(input);assert.equal(r.ok,false);assert(r.errors.some(e=>e.file==='trainer-types.json'));
});
test('CLI emits both warnings on build while check preserves canonical output bytes',()=>{
 const input=inputs({items:[{item:'superpotion',count:1}]});reusable(input,'superpotion');reusable(input,'ether');const expected=compile(input);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-reusable-diagnostics-'));
 try{
  for(const [key,value]of Object.entries(input))fs.writeFileSync(path.join(dir,key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'.json'),JSON.stringify(value));
  const output=path.join(dir,'compiled.json'),cli=path.resolve(__dirname,'../../../js/engine/build/content-cli.cjs');
  for(const cmd of ['build','check','build']){
   const r=spawnSync(process.execPath,[cli,cmd,`--src=${dir}`,`--out=${output}`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);if(cmd==='build'){assert(r.stderr.includes(trainerCode+':'));assert(r.stderr.includes(unsupportedCode+':'));}
   assert.equal(fs.readFileSync(output,'utf8'),E.contentCompile.canonicalJson(expected.data,2)+'\n');
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

for(const id of ['ether','revive','antidote','xattack','pokeball','poketoy'])test(`real player ${id} use still consumes a copy despite consumable:false`,async()=>{
 const F=require('../../../js/engine/fixtures/game.cjs'),content=structuredClone(F.content);content.items=E.itemCatalog.legacyCatalog();content.items[id].consumable=false;
 const party=['A','R'].map(name=>F.member(name,'Snorlax',50,{moves:['splash','tackle'],ability:'Thick Fat'}));
 for(const mon of party){mon.moves[0].maxpp=40;mon.moves[0].pp=id==='ether'?0:40;}
 if(id==='revive')party[1].hp=0;if(id==='antidote')party[0].status='psn';
 const game=E.state.newGame({content,party,bag:{[id]:1},money:0}),before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'unsupported-reuse-'+id,seed:[1,2,3,4],foe:{kind:'wild',team:[F.foeMember('B','Pidgey',3,{moves:['protect'],ability:'Keen Eye'})]}});s.take();
 const r=id==='pokeball'?await s.throwBall(id):await s.useItem(id,id==='revive'?'R':'A',id==='ether'?{moveSlot:0}:{});
 assert(r.ok,JSON.stringify(r));assert.equal(s.bag[id],0);assert.equal(s.ledger[0].state,'consumed');assert.equal(JSON.stringify(game),before,'persistent inventory is still owned by battle commit');
});
test('real trainer AI ignores unsupported nonconsumable resources while consumable status medicine remains eligible',async()=>{
 const F=require('./trainer-ai-integration/fixtures.cjs');
 for(const consumable of [false,true]){
  const ids=['ether','revive','antidote','xattack','pokeball','poketoy'],input=inputs({items:ids.map(item=>({item,count:1})),party:1,moves:['splash']});
  for(const id of ids)input.items.find(i=>i.id===id).consumable=consumable;
  const assembled=E.contentRuntime.assembleContent(compile(input).data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);
  const w=await F.fixture({content:assembled.content}),p=w.gw._debugBattle().sides[1].active[0];p.setStatus('psn');w.gw.refreshRequests();
  const legal=F.D.captureTrainerAiRequest(w.session,w.gw).snapshot.request.legalItems;
  assert.deepEqual(legal.map(i=>i.itemId),consumable?['antidote']:[]);
 }
});
