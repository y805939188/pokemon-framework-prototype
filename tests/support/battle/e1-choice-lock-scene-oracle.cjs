'use strict';
const assert=require('node:assert/strict');
const player=v=>v.p1.find(m=>m.id==='SCENE-P1');
function verify(c,o){
 const first=o.rows[0],move=c.player.moves[c.setupSlot-1];assert.equal(player(first.after).pp[move],player(first.before).pp[move]-1);
 if(c.kind==='disable'||c.kind==='taunt'){
  const rejectedId=c.player.moves[c.rejectedSlot-1];assert(first.after.request.active[0].moves.find(m=>m.id===rejectedId).disabled,'real opponent effect publishes disabled request');
  assert.equal(o.rejected.result.ok,false);assert.equal(o.rejected.result.reason,'choice-rejected');assert.deepEqual(o.rejected.before,o.rejected.after,'refusal must not advance live state or PP');
  assert.equal(o.rejected.mode,'moves');assert.equal(o.rejected.cursor,c.rejectedSlot-1);assert.equal(o.rejected.names[c.rejectedSlot-1].includes('undefined'),false);
  assert(o.rejected.lines.includes(c.lang==='zh'?'现在不能选择这个。':"That choice isn't available right now."));
  const legal=o.rows[1],id=c.player.moves[c.legalSlot-1];assert.equal(legal.result.ok,true);assert.equal(player(legal.after).pp[id],player(legal.before).pp[id]-1);
  assert.equal(o.actualMoveCalls,3,'one setup, one real refusal, one legal resubmission');
 }else{
  const req=first.after.request.active[0].moves;assert.equal(req.length,1);assert.equal(req[0].id,c.lockedId);assert.equal(req[0].pp,undefined);
  const entry=o.lockedEntry;assert.deepEqual(entry.automatic,{allowed:true,moveSlot:1});assert.equal(entry.calls,1);assert.equal(entry.phase,'messages');assert.equal(entry.ready,false);assert.equal(entry.automaticEncore.allowed,false);
  assert.equal(entry.request.active[0].moves.length,1);assert.equal(entry.request.active[0].moves[0].move,c.lockedName);assert.equal(entry.request.active[0].moves[0].id,c.lockedId);assert.equal(entry.request.active[0].moves[0].pp,undefined);
  const locked=o.rows[1];assert.equal(player(locked.after).pp[move],player(first.after).pp[move],'locked continuation does not spend a second permanent PP');
  const b=locked.before.p2[0],a=locked.after.p2[0];
  if(c.kind==='dig'){assert.equal(first.after.p2[0].hp,first.before.p2[0].hp);assert(a.hp<b.hp&&a.hp>0);}
  else{assert(first.after.p2[0].hp<first.before.p2[0].hp);assert.equal(a.hp,b.hp,'recharge does not cause a second attack');}
  assert.deepEqual(locked.after.request.active[0].moves.map(m=>m.id),c.player.moves);
  const normal=o.rows[2];assert.equal(player(normal.after).pp.splash,player(normal.before).pp.splash-1);assert.equal(o.actualMoveCalls,3);
 }
 assert.equal(o.final.installs,1);assert.equal(o.final.outcome.commit,'applied');assert.equal(o.preCommitInstalls,0);
}
module.exports={verify};
