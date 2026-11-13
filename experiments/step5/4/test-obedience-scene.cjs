
'use strict';
// Rebuilt formal Scene + production App/Session/Gen8. Only renderer/input/time ports are controlled; NW is not run.
const test=require('node:test'),H=require('./e2-status-feedback-scene-host.cjs');
const{assert,clone}=H;test.before(H.prepare);test.after(H.cleanup);
for(const lang of ['en','zh'])test(`${lang} real foreign-member obedience branches reach normal Scene text exactly once`,async()=>{
 const seen=new Set();
 for(let seed=1;seed<=50&&seen.size<4;seed++){
  const h=await H.open({id:'OBEDIENCE-SCENE-'+lang+'-'+seed,lang,seed:[seed,22,33,44],badges:0,owner:{id:1,name:'Other',gender:0,language:7},
   player:{species:'snorlax',abilityIndex:1,level:60,moves:['tackle','scratch']},foe:{species:'shuckle',level:100,moves:['splash']}});
  try{
   assert.equal(h.initial.badges.filter(Boolean).length,0);assert.notEqual(h.initial.party[0].owner.name,h.initial.player.name);
   const row=await H.move(h,1),raw=JSON.stringify(row.result.messages),events=row.result.messages.flatMap(m=>m.kind==='events'?m.events:[]),obedience=events.filter(e=>e.type==='rpg'&&e.args[0]==='obedience');
   for(const e of obedience){const result=e.args[3];assert(['change','self-sleep','self-hit','refuse'].includes(result));seen.add(result);const texts=h.s._D.event(e);assert.equal(texts.length,1);assert.equal(h.lines.filter(line=>line===texts[0]).length,1);assert(!texts[0].includes('battle.obedience.'));}
   assert.deepEqual(h.lines,events.flatMap(e=>h.s._D.event(e)),'formal presenter keeps the actual event order');assert.equal(JSON.stringify(row.result.messages),raw);H.unchanged(h);assert(h.s.inputState().ready);assert.equal(h.installs,0);
  }finally{h.cleanup();}
 }
 assert.deepEqual([...seen].sort(),['change','refuse','self-hit','self-sleep']);
});
