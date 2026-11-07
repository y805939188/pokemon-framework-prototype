'use strict';
const {assert,events,member,targets,verifyPP}=require('./e-position-entry-common.cjs');
function verify(c,rows){
 const first=rows[0];assert(first);verifyPP(first,'POS-P1',c.moves[0]);
 if(c.id==='EPE-01'||c.id==='EPE-02'){
  assert.equal(member(first.after,'POS-P1').hp,55,'Wish is delayed');
  assert(!events(first).some(e=>e.type==='-heal'&&targets(e,'POS-P1')));
  const entry=rows[1];assert.equal(entry.after.active,'POS-P2');
  assert.equal(member(entry.after,'POS-P1').hp,55,'Wish belongs to the position, not its creator');
  const heals=events(entry).filter(e=>e.type==='-heal'&&targets(e,'POS-P2'));
  if(c.id==='EPE-01'){assert.equal(member(entry.after,'POS-P2').hp,165);assert.equal(heals.length,1);}
  else{
   assert.equal(member(entry.after,'POS-P2').hp,220);assert.equal(heals.length,0);
   const later=rows[2];verifyPP(later,'POS-P2','substitute');
   assert.equal(member(later.after,'POS-P2').hp,165,'expired full-HP Wish cannot heal a later real Substitute cost');
   assert(!events(later).some(e=>e.type==='-heal'&&targets(e,'POS-P2')));
  }
 }else if(c.id==='EPE-03'||c.id==='EPE-04'){
  assert.equal(member(first.after,'POS-P1').hp,0,'actual self-faint establishes the position effect');
  assert(events(first).some(e=>e.type==='faint'&&targets(e,'POS-P1')));
  const entry=rows[1],receiver=member(entry.after,'POS-P2');assert.equal(entry.after.active,'POS-P2');
  assert.equal(receiver.hp,220);assert.equal(receiver.status,'');
  const old=member(entry.before,'POS-P2');
  for(const [id,value]of Object.entries(receiver.pp))assert.equal(value,c.id==='EPE-03'?old.pp[id]:entry.after.caps['POS-P2'][id],id+' correct position PP policy');
  assert(events(entry).some(e=>e.type==='-heal'&&targets(e,'POS-P2')),'actual position restoration feedback');
 }else if(c.id==='EPE-05'){
  assert.equal(member(first.after,'POS-P1').hp,55);const fresh=rows[1];
  assert.equal(member(fresh.before,'POS-P1').hp,55);assert.equal(member(fresh.after,'POS-P1').hp,55);
  assert(!events(fresh).some(e=>e.type==='-heal'));
 }else assert.fail('unfrozen position case');
}
module.exports={verify};
