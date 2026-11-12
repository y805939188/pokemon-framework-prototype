'use strict';
// Synthetic author content through the real App/Session. Damage, guards and PRNG are compared with native items.
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./trainer-ai-integration/fixtures.cjs'),{E,T}=F;
const sim=require('../../../js/engine/showdown/dist/sim');
const pairs=[['luckyegg','Lucky Egg',30,'lightclay'],['amuletcoin','Amulet Coin',30,'lightclay'],['luckincense','Luck Incense',10,'cloversweet']];
const clone=v=>JSON.parse(JSON.stringify(v));
async function open(item,{guard='',foeMove='splash',ability}={}){
 const input=F.inputs({party:1,moves:[foeMove],skill:0});
 input.species.find(s=>s.id==='snorlax').learnset=['fling','recycle','seismictoss',guard==='magicroom'?'magicroom':'splash'].map(move=>({level:1,move}));
 input.trainers[0].party[0].level=20;
 for(const id of [...pairs.map(p=>p[0]),'lightclay','flowersweet','cloversweet'])if(!input.items.some(i=>i.id===id))input.items.push({id,name:id,namePlural:id,pocket:1,source:'author-placeholder'});
 input.grants=[{id:'rpg-holder',source:'author-placeholder',members:[{species:'snorlax',level:20,item}],items:{},money:0}];
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);const c={content:assembled.content,dex};
 const state=T.fakes.createMemoryState(E.state.newGame({content:c.content,party:[],money:1000}));
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),content:()=>c,random:()=>0,clock:()=>12345,sessions:E.composition.createBattleSessionFactory({content:()=>c.content,seed:()=>[1,2,3,4]})},{receivingProfile:{mode:0,naming:1}});
 assert.equal(app.claimGrant('rpg-holder').status,'applied');const initial=clone(state.read().party[0]),before=clone(state.read());state.replaced.length=0;
 const request={battleId:'rpg-holder',seq:1,canLose:true,trainer:{id:'c-basic',version:1}};
 const s=await app.startTrainerBattle(request);s.take();
 if(ability)s.gw._debugBattle().p1.active[0].ability=ability; // supplementary engine guard only, never saved
 return {s,app,state,request,initial,before,cleanup(){app.abortBattle(request,Error('owned rpg-holder cleanup'));}};
}
async function move(w,slot){const r=await w.s.chooseMove(slot);assert(r.ok,JSON.stringify(r));return r;}
function persistentUnchanged(w){assert.deepEqual(w.state.read(),w.before);assert.equal(w.state.replaced.length,0);}
function live(w){const b=w.s.gw._debugBattle();return {p:b.p1.active[0],f:b.p2.active[0],b};}
async function finish(w){for(let i=0;i<8&&!w.s.finished;i++)await move(w,3);assert(w.s.finished,'natural KO, no diagnostic tie');persistentUnchanged(w);const raw=clone(w.s.result()),out=w.app.finishBattle(w.s,w.request);assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,1);assert.equal(w.app.finishBattle(w.s,w.request).commit,'already-applied');assert.equal(w.state.replaced.length,1);return {member:w.state.read().party[0],state:w.state.read(),raw};}

for(const [id,name,power,native]of pairs){
 test('RHI01 canonical author grant has an actual native Item identity only in this RPG battle: '+id,async()=>{
  const shared=sim.Dex.forGen(8),original=shared.items.getByID(id),get=shared.items.getByID,all=shared.items.all();assert.equal(original.exists,false);
  const w=await open(id);try{
   assert.equal(w.initial.item,id);assert.deepEqual(E.dex.createDexLookup().heldItem(id),{id,holdable:true,mail:false});assert.equal(E.dex.createDexLookup().heldItem(id.replace(/egg|coin|incense/,m=>'-'+m)),null);
   const {p,b}=live(w),item=p.getItem();assert(b.dex!==shared,'RPG battle needs a local Dex view');assert(b.dex.items!==shared.items,'RPG battle needs a local item port');assert.equal(item instanceof shared.Item,true);assert.equal(item.id,id);assert.equal(item.name,name);assert.equal(item.effectType,'Item');assert.equal(item.exists,true);assert.equal(item.fling.basePower,power);
   assert.equal(b.dex.items.get(id),item);assert.equal(b.dex.items.get(name),item);assert.equal(b.dex.items.get(item),item);assert.equal(b.dex.items.all().filter(row=>row.id===id).length,1);assert.equal(b.dex.items.all().find(row=>row.id===id),item);assert.equal(b.dex.items.getByID('constructor'),shared.items.getByID('constructor'));assert.equal(b.dex.items.getByID('not-an-item').exists,false);
   assert(Object.isFrozen(item));assert(Object.isFrozen(item.fling));assert.throws(()=>{item.fling.basePower=999;},TypeError);
   assert.equal(b.dex.items.get(native),shared.items.get(native),'native data remains the exact pinned object');assert.equal(shared.items.getByID,get);assert.equal(shared.items.getByID(id).exists,false);assert.equal(shared.items.all(),all);
  }finally{w.cleanup();}
 });
 test('RHI02 normal Fling/native damage and PP -> natural result -> exactly-once installation: '+id,async()=>{
  const w=await open(id),control=await open(native);try{
   const hp=live(w).f.hp,base=live(control).f.hp;assert.equal(hp,base);const pp=live(w).p.moveSlots[0].pp;
   const r=await move(w,1);await move(control,1);assert(live(w).f.hp<hp,'ordinary Fling must damage');assert.equal(hp-live(w).f.hp,base-live(control).f.hp,'native BP control');assert.equal(live(w).p.moveSlots[0].pp,pp-1);assert.equal(live(w).p.item,'');assert.equal(live(w).p.lastItem,id);assert.match(JSON.stringify(r.messages),/-enditem/);assert.equal(live(w).b.prng.getSeed(),live(control).b.prng.getSeed());persistentUnchanged(w);
   const actual=await finish(w),expected=await finish(control);assert.equal(actual.member.item,'');assert.equal(actual.member.exp-w.initial.exp,expected.member.exp-control.initial.exp,'consumed Lucky Egg cannot boost later growth');assert.deepEqual(actual.member.evs,expected.member.evs);assert.equal(actual.state.money,id==='luckyegg'?expected.state.money:1000+2*(expected.state.money-1000),'money entry flag survives consumption, but does not stack');
  }finally{w.cleanup();control.cleanup();}
 });
 for(const guard of ['magicroom','protect','klutz'])test('RHI03 native suppression/protect behavior and PRNG are retained: '+id+'/'+guard,async()=>{
  const options=guard==='magicroom'?{guard}:guard==='protect'?{foeMove:'protect'}:{ability:'klutz'};
  const w=await open(id,options),control=await open(native,options);try{
   if(guard==='magicroom'){await move(w,4);await move(control,4);assert(live(w).b.field.pseudoWeather.magicroom);}
   const hp=live(w).f.hp,pp=live(w).p.moveSlots[0].pp;await move(w,1);await move(control,1);
   assert.equal(live(w).f.hp,hp);assert.equal(live(w).p.moveSlots[0].pp,pp-1);assert.equal(live(w).p.item,live(control).p.item? id:'');assert.equal(live(w).p.lastItem,live(control).p.lastItem?id:'');assert.equal(live(w).b.prng.getSeed(),live(control).b.prng.getSeed());persistentUnchanged(w);
  }finally{w.cleanup();control.cleanup();}
 });
 test('RHI04 checkpoint rebinds the item view before native restore; Recycle/Fling remain native: '+id,async()=>{
  const w=await open(id);try{
   const before=w.s._checkpoint();await move(w,1);const loss=live(w).f.maxhp-live(w).f.hp,seed=live(w).b.prng.getSeed();assert(loss>0);await w.s._restoreCheckpoint(before);assert.equal(live(w).p.getItem().fling.basePower,power);assert.equal(live(w).p.item,id);await move(w,1);assert.equal(live(w).f.maxhp-live(w).f.hp,loss);assert.equal(live(w).b.prng.getSeed(),seed);
   const consumed=w.s._checkpoint();await move(w,2);assert.equal(live(w).p.item,id);assert.equal(live(w).p.getItem().name,name);await w.s._restoreCheckpoint(consumed);assert.equal(live(w).p.item,'');assert.equal(live(w).p.lastItem,id);await move(w,2);assert.equal(live(w).p.getItem().fling.basePower,power);await move(w,1);assert.equal(live(w).p.item,'');const result=await finish(w);assert.equal(result.member.item,'');
  }finally{w.cleanup();}
 });
 test('RHI05 abort after ordinary consumption never changes saved item, growth or wallet: '+id,async()=>{
  const w=await open(id);await move(w,1);assert.equal(live(w).p.item,'');persistentUnchanged(w);w.cleanup();persistentUnchanged(w);assert.equal(w.state.read().party[0].item,id);
 });
}
test('RHI06 existing Flower Sweet behavior remains the pinned native result and unrelated formats stay unextended',async()=>{
 const w=await open('flowersweet'),control=await open('cloversweet');try{
  const hp=live(w).f.hp,base=live(control).f.hp;assert.equal(live(w).p.getItem(),sim.Dex.forGen(8).items.get('flowersweet'));assert.equal(live(w).p.getItem().fling.basePower,0);await move(w,1);await move(control,1);assert.equal(live(w).f.hp,hp);assert(live(control).f.hp<base);assert.equal(live(w).p.item,'');
  const b=new sim.Battle({formatid:'gen8customgame',seed:[1,2,3,4]});const shared=sim.Dex.forGen(8);assert.equal(b.dex,shared);for(const [id]of pairs)assert.equal(b.dex.items.get(id).exists,false);b.destroy();
 }finally{w.cleanup();control.cleanup();}
});
