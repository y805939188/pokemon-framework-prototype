'use strict';
const assert=require('node:assert/strict');
const active=row=>row.after.p1.find(m=>m.id===row.after.active),card=row=>row.cards.views.find(v=>v.side==='p1'&&v.visible);
function linked(row){const p=active(row),v=card(row);assert(v,'one visible current player card');assert.equal(v.id,p.id);assert.equal(v.hp.numbers.current,p.hp);assert.equal(v.hp.numbers.total,p.maxhp);return v;}
function verify(c,o){
 if(c.kind==='toxic'||c.kind==='abort'){
  const first=o.rows[0],v=linked(first),p=active(first),label=c.lang==='zh'?'剧毒':'Bad poison';assert.equal(p.status,'tox');assert.equal(v.condition.kind,'tox');assert.equal(v.condition.label,label);assert(first.cards.text.some(t=>t.value===label));
  if(c.kind==='toxic'){
   const switched=o.rows[1],newCard=linked(switched);assert.equal(switched.after.active,'SCENE-P2');assert.equal(active(switched).status,'');assert.equal(newCard.condition.kind,'none');assert.equal(newCard.condition.label,null);assert(!switched.cards.text.some(t=>t.value===label));
   const back=o.rows[2];assert.equal(back.after.active,'SCENE-P1');assert.equal(linked(back).condition.kind,'tox');assert.equal(active(back).status,'tox');
  }else{assert.deepEqual(o.retiredCards,[]);assert.equal(o.fresh.card.condition.kind,'none');assert.equal(o.fresh.card.hp.numbers.current,o.initial.party[0].hp);assert.equal(o.final.installs,0);assert(o.final.outcome.aborted);return;}
 }else if(c.kind==='protect'){
  const a=o.rows[0],b=o.rows[1];assert.equal(active(a).hp,active(a).maxhp);linked(a);assert(active(b).hp<active(b).maxhp);linked(b);assert.equal(active(a).pp.protect,9);assert.equal(active(b).pp.splash,39);assert(o.lines.includes(o.expectedProtectMoveText));
  const ev=a.result.messages.flatMap(m=>m.kind==='events'?m.events:[]);assert(ev.some(e=>e.type==='-activate'&&e.args.some(v=>/Protect/.test(v))));
 }else if(c.kind==='ko'){
  const a=o.rows[0],before=a.before.p1.find(m=>m.id==='SCENE-P1'),after=active(a);assert.equal(before.pp.iciclespear-after.pp.iciclespear,1);assert.equal(a.after.p2[0].hp,0);
  const foe=a.after.p2[0].id,ev=a.result.messages.flatMap(m=>m.kind==='events'?m.events:[]),target=e=>new RegExp('^p2(?:a)?: '+foe+'$').test(e.args[0]);
  assert.equal(ev.filter(e=>e.type==='-damage'&&target(e)).length,1);assert(ev.some(e=>e.type==='faint'&&target(e)));assert.equal(a.after.p2[0].pp.splash,a.before.p2[0].pp.splash);
  for(const hit of ev.filter(e=>e.type==='-hitcount'&&target(e)))assert.equal(Number(hit.args[1]),1);
  assert(!a.cards.views.some(v=>v.side==='p2'&&v.visible));linked(a);
 }else assert.fail('unfrozen case');
 assert.equal(o.preCommitInstalls,0);assert.equal(o.final.installs,1);assert.equal(o.final.outcome.commit,'applied');
}
module.exports={verify};
