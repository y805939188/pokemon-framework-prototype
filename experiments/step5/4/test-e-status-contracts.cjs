'use strict';
// Test-only bounded continuation samples on actual pinned Gen8, with no App/save/native claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gateway:{BattleGateway}}=require('../../../js/engine/build/production.cjs'),plan=require('./e-status-contracts.json'),contract=require('./e-status-engine-contracts.json');
const crypto=require('node:crypto');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'e-status-contracts.json'))).digest('hex'),contract.originalVectorSHA256,'original inputs and reference oracle must remain byte-identical');
assert.equal(plan.schema,1);assert.equal(plan.format,'gen8rpgcustomgame');assert.deepEqual(plan.seed,[1,2,3,4]);
assert.deepEqual(plan.cases.map(c=>c.id),Array.from({length:6},(_,i)=>'ESTAT-'+String(i+1).padStart(2,'0')));
assert.equal(plan.heading.featureId,'FR-000545');assert.equal(plan.heading.completeHeading,false);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
// This is one explicitly bound comparison, never a tolerance or generic waiver.
function compareStatusHP(c, i, actualHP, context = plan) {
 assert.equal(contract.schema,1);assert(Number.isSafeInteger(actualHP)&&actualHP>=0);
 const referenceHP=c.expected.hpA[i];assert(Number.isSafeInteger(referenceHP));
 if(c.id!=='ESTAT-02'){assert.equal(actualHP,referenceHP,'fixed HP after actual round '+(i+1));return{engineExpectedHP:referenceHP,actualHP,referenceExpectedHP:referenceHP,referenceMatches:true,differenceId:null};}
 assert.equal(c.check,'toxic-switch-reset');assert.equal(context.showdownSHA,contract.showdownSHA);assert.equal(context.format,contract.format);assert.equal(context.initialHP,contract.initialHP);assert.deepEqual(context.seed,contract.seed);
 assert.equal(contract.difference.id,'E-WP44-TOXIC-ROUNDING-01');assert.equal(contract.difference.caseId,c.id);assert.equal(contract.difference.featureId,'FR-000545');
 assert.deepEqual(c.expected.hpA,[404,351,351,325],'do not rewrite the reference expectation');
 assert.deepEqual(contract.difference.referenceExpectedHP,c.expected.hpA);assert.deepEqual(contract.difference.engineExpectedHP,[404,352,352,326]);assert.deepEqual(contract.difference.actualMinusReference,[0,1,1,1]);
 const engineExpectedHP=contract.difference.engineExpectedHP[i];assert(Number.isSafeInteger(engineExpectedHP));assert.equal(actualHP,engineExpectedHP,'exact pinned Gen8 HP after actual round '+(i+1));
 const delta=actualHP-referenceHP;assert.equal(delta,contract.difference.actualMinusReference[i]);
 return{engineExpectedHP,actualHP,referenceExpectedHP:referenceHP,referenceMatches:delta===0,actualMinusReference:delta,differenceId:delta===0?null:contract.difference.id,classification:delta===0?'REFERENCE_EQUAL':contract.difference.classification};
}
function statusChoice(c, i, request) {
 const target=contract.switchTargets[c.id]?.[i];
 if(target===undefined||target===null)return c.playerChoices[i];
 const candidates=request?.side?.pokemon;assert(Array.isArray(candidates),'switch target requires the current request');
 const matches=candidates.map((p,index)=>({p,index})).filter(({p})=>p.ident==='p1: '+target);
 assert.equal(matches.length,1,'stable switch target must occur once');assert.equal(matches[0].p.active,false,'do not select the active member');
 return 'switch '+(matches[0].index+1);
}
const toxic=plan.cases.find(c=>c.id==='ESTAT-02');
test('ECOMP01 known engine conformity retains the unequal reference values and difference ID',()=>{
 const rows=contract.difference.engineExpectedHP.map((hp,i)=>compareStatusHP(toxic,i,hp));assert.deepEqual(rows.map(r=>r.referenceMatches),[true,false,false,false]);assert.deepEqual(rows.map(r=>r.referenceExpectedHP),[404,351,351,325]);assert.deepEqual(rows.map(r=>r.actualMinusReference),[0,1,1,1]);assert.deepEqual(rows.map(r=>r.differenceId),[null,...Array(3).fill('E-WP44-TOXIC-ROUNDING-01')]);
});
test('ECOMP02 unexpected toxic or ordinary HP is never waived',()=>{
 assert.throws(()=>compareStatusHP(toxic,1,351),/exact pinned Gen8 HP/);assert.throws(()=>compareStatusHP(toxic,1,353),/exact pinned Gen8 HP/);assert.throws(()=>compareStatusHP(plan.cases[0],0,378),/fixed HP/);
});
test('ECOMP03 edited reference expectation is rejected',()=>{
 const changed=structuredClone(toxic);changed.expected.hpA[1]=352;assert.throws(()=>compareStatusHP(changed,1,352),/reference expectation/);
});
test('ECOMP04 the difference cannot migrate to a different engine, format, HP or seed',()=>{
 for(const patch of [{showdownSHA:'different'},{format:'gen9rpgcustomgame'},{initialHP:432},{seed:[4,3,2,1]}])assert.throws(()=>compareStatusHP(toxic,1,352,{...plan,...patch}));
});
test('ECOMP05 switch targets follow stable IDs in the current request, including its reordered roster',()=>{
 const first={side:{pokemon:[{ident:'p1: A',active:true},{ident:'p1: R',active:false}]}},next={side:{pokemon:[{ident:'p1: R',active:true},{ident:'p1: A',active:false}]}};
 assert.equal(statusChoice(toxic,2,first),'switch 2');assert.equal(statusChoice(toxic,3,next),'switch 2');assert.equal(toxic.playerChoices[3],'switch 1','the original raw vector is preserved');
 assert.throws(()=>statusChoice(toxic,3,first),/active member/);assert.throws(()=>statusChoice(toxic,3,{side:{pokemon:[]}}),/occur once/);
});
const read=gw=>({p1:structuredClone(gw.readState('p1')),p2:structuredClone(gw.readState('p2'))});
const member=(state,side,id)=>state[side].find(m=>m.id===id);
function drain(gw){const messages=gw.drain();assert(!messages.some(m=>m.kind==='error'),JSON.stringify(messages));return{messages,events:messages.flatMap(m=>m.kind==='events'?m.events:[])};}
async function open(c){
 const gw=await BattleGateway.create({formatid:plan.format,seed:[...plan.seed],players:[{name:'Player',team:structuredClone(c.player)},{name:'Foe',team:structuredClone(c.foe)}]});
 assert.equal(await gw.choose('p1','team '+c.player.map((_,i)=>i+1).join('')),true);assert.equal(await gw.choose('p2','team 1'),true);drain(gw);
 // Public import happens AFTER team initialization, avoiding the old EACT faint-roster fixture limitation.
 for(const [side,team]of [['p1',c.player],['p2',c.foe]]){
  const live=gw.readState(side);gw.seedState(side,team.map(m=>({id:m.name,hp:live.find(v=>v.id===m.name).maxhp,...(side==='p1'&&m.name==='A'?{status:c.initialStatus,statusCount:c.initialStatusCount}:{}),moves:m.moves.map(id=>({id,pp:plan.ppSetup[id],maxpp:plan.ppSetup[id]}))})));
 }
 const initial=read(gw);assert.equal(member(initial,'p1','A').maxhp,plan.initialHP);assert.equal(member(initial,'p1','A').hp,plan.initialHP);assert(initial.p1.every(m=>m.hp>0&&!m.fainted));assert.equal(gw.activeId('p1'),'A');
 assert.equal(member(initial,'p1','A').status,c.initialStatus==='psn'&&c.initialStatusCount===1?'tox':c.initialStatus);assert.equal(member(initial,'p1','A').statusCount,c.initialStatusCount);return{gw,initial};
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 assert(c.featureIds.length&&c.featureIds.every(id=>id===plan.heading.featureId));assert.equal(c.playerChoices.length,c.foeChoices.length);
 const{gw,initial}=await open(c),trace=[],moveId=c.player[0].moves[0];
 for(let i=0;i<c.playerChoices.length;i++){
  const before=read(gw),playerChoice=statusChoice(c,i,gw.awaitingChoice('p1'));assert.equal(await gw.choose('p1',playerChoice),true);assert.deepEqual(read(gw),before,'registration does not execute an action or a residual');assert.equal(await gw.choose('p2',c.foeChoices[i]),true);const wire=drain(gw),after=read(gw),a=member(after,'p1','A');
  const comparison=compareStatusHP(c,i,a.hp);assert.equal(a.status,c.expected.statusA[i]);assert.equal(a.statusCount,c.expected.countA[i]);
  if(c.expected.ppA)assert.equal(a.pp[moveId],c.expected.ppA[i]);
  assert.equal(member(after,'p2','B').pp.splash,40-i-1,'foe really acts each round');
  if(c.expected.active)assert.equal(gw.activeId('p1'),c.expected.active[i]);
  if(c.check==='ordinary-poison'||c.check==='burn-residual'){
   assert.equal(wire.events.filter(e=>e.type==='move'&&e.args[0]==='p1a: A').length,1,'status does not randomly block ordinary action');assert(wire.events.some(e=>e.type==='-damage'&&e.args[0]==='p1a: A'&&e.args.some(a=>a==='[from] '+c.initialStatus)));
  }
  if(c.check==='sleep-countdown'){
   const asleep=c.expected.cantRounds.includes(i+1);assert.equal(wire.events.filter(e=>e.type==='cant'&&e.args[0]==='p1a: A'&&e.args[1]==='slp').length,asleep?1:0);assert.equal(wire.events.filter(e=>e.type==='move'&&e.args[0]==='p1a: A').length,asleep?0:1);assert.equal(wire.events.some(e=>e.type==='-curestatus'&&e.args[0]==='p1a: A'&&e.args[1]==='slp'),i+1===c.expected.wakeRound);
  }
  if(c.check==='self-thaw'){
   assert(wire.events.some(e=>e.type==='-curestatus'&&e.args[0]==='p1a: A'&&e.args[1]===c.expected.cureStatus));assert(wire.events.some(e=>e.type==='move'&&e.args[0]==='p1a: A'&&e.args[1]===c.expected.executedMove));assert(member(after,'p2','B').hp<member(before,'p2','B').hp,'actual thawing move damages its target');
  }
  if(c.check==='paralysis-order'){
   assert.equal(member(initial,'p1','A').stats.spe,c.expected.baseSpeedA);assert.equal(member(initial,'p2','B').stats.spe,c.expected.baseSpeedB);assert(c.expected.baseSpeedA>c.expected.baseSpeedB&&Math.floor(c.expected.baseSpeedA/2)<c.expected.baseSpeedB);
   const actions=wire.events.filter(e=>e.type==='move'||e.type==='cant');assert.equal(actions[0].args[0],c.expected.firstActor,'ordinary speed order changes with paralysis');const own=actions.filter(e=>e.args[0]==='p1a: A');assert.equal(own.length,1);assert(own[0].type==='move'||own[0].type==='cant'&&own[0].args[1]==='par');assert.equal(a.pp.splash,40-Number(own[0].type==='move'),'a blocked move does not spend PP');
  }
  if(c.check==='toxic-switch-reset'){
   assert.equal(a.statusCount,1,'persistent toxic flag is not the increasing residual stage');assert.equal(member(after,'p1','R').hp,plan.initialHP);assert.equal(member(after,'p1','R').status,'');assert.equal(member(after,'p1','R').pp.splash,40);assert.equal(wire.events.some(e=>e.type==='switch'&&e.args[0]==='p1a: '+c.expected.active[i]),i>=2);assert.equal(wire.events.filter(e=>e.type==='-damage'&&e.args[0]==='p1a: A'&&e.args.includes('[from] psn')).length,i===2?0:1,'actual toxic residual, absent while A is benched');
  }
  trace.push({round:i+1,choices:[playerChoice,c.foeChoices[i]],originalVectorChoices:[c.playerChoices[i],c.foeChoices[i]],comparison,before,after,...wire});
 }
 const referenceConformant=trace.every(row=>row.comparison.referenceMatches),differenceIds=[...new Set(trace.map(row=>row.comparison.differenceId).filter(Boolean))];
 console.log('E_STATUS_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial,trace,seed:plan.seed,format:plan.format,scope:plan.scope,engineConformant:true,referenceConformant,differenceIds,completeHeading:false}));
});
