'use strict';
// Public-core C/D composition only; no application resource installation, F consumer or persistent transaction claim.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),K=require('../../../js/engine/build/core.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
function input(){
 const content=clone(E.fixtures.content),game=E.fixtures.makeGame(),member=game.party[0];
 content.moves=Object.fromEntries(Object.values(content.moves).map(m=>{const name=m.id==='heatwave'?'Heat Wave':m.id==='rest'?'Rest':m.name;return [name,{...m,name}];}));
 Object.assign(content.species.Charizard,{growth:'medium',abilities:['Blaze'],evolutions:[{method:'Level',parameter:30,target:'Venusaur'}]});
 Object.assign(content.species.Venusaur,{growth:'slow',abilities:['Overgrow'],learnset:{0:['Heat Wave'],27:['Rest','Heat Wave']}});
 Object.assign(member,{level:30,exp:27000,hp:40,abilityIndex:0,effectiveAbilityIndex:0,readyToEvolve:true,evolutionReadiness:'known'});
 assert.deepEqual(K.saveSchema.validateGameContent(game,content),[]);
 return {content,game,member};
}
// SpeciesData.learnset uses display names; do not pretend D already resolved canonical move IDs/PP.
function learningInput(content,intent){return intent.moves.map(name=>{assert(Object.hasOwn(content.moves,name));const m=content.moves[name];return {id:m.id,pp:m.pp,name:m.name};});}
const options={shadow:false,hmMoves:[],keepMachinePp:false};
function evolve(runtime,x,member=x.member){
 const selection=runtime.evolution.scanEvolution({member,content:x.content,trigger:{family:'level'}});assert.equal(selection.kind,'target');
 const body=runtime.evolutionSuccess.planEvolutionSuccess({member,content:x.content,selection});assert.equal(body.kind,'ready');return body;
}

test('CD public core and engine expose the same accepted modules and value results',()=>{
 for(const name of ['friendship','learning','evolution','evolutionSuccess']){assert.ok(E[name]);assert.deepEqual(Object.keys(E[name]).sort(),Object.keys(K[name]).sort());}
 const x=input();assert.deepEqual(evolve(E,x),evolve(K,x));assert.deepEqual(K.friendship.planFriendshipChange(x.member,'machine',{AFFECTION_EFFECTS:false}),E.friendship.planFriendshipChange(x.member,'machine',{AFFECTION_EFFECTS:false}));
});
test('CD real public composition resolves display-name intents, releveled member, ordered learning and B shape',()=>{
 const x=input(),before=clone(x);freeze(x);const body=evolve(K,x);
 assert.equal(body.member.level,27);assert.equal(body.member.exp,27000);assert.equal(body.member.ability,'Overgrow');assert.equal(body.member.id,x.member.id);
 assert.deepEqual(body.learning,{source:'evolution',moves:['Heat Wave','Rest','Heat Wave']});
 const resolved=learningInput(x.content,body.learning);assert.deepEqual(resolved.map(m=>m.id),['heatwave','rest','heatwave']);
 const plan=K.learning.planLearningQueue(body.member,resolved,{kind:body.learning.source},options,[{kind:'replace',slot:0},{kind:'decline',giveUp:true}]);
 assert.equal(plan.status,'ready');assert.deepEqual(plan.outcomes.map(x=>x.outcome),['learned','gave-up','already-known']);assert.deepEqual(plan.patch.moves[0],{id:'heatwave',pp:10,maxpp:10,ppUps:0});assert.deepEqual(plan.effects.itemsToConsume,[]);
 const draft=clone(x.game);draft.party[0]={...body.member,...plan.patch};assert.deepEqual(K.saveSchema.validateGameContent(draft,x.content),[]);assert.equal(draft.party[0].readyToEvolve,false);assert.equal(draft.party[0].evolutionReadiness,'known');
 assert.deepEqual(draft.inventory,x.game.inventory);assert.deepEqual(draft.stats,x.game.stats);assert.deepEqual(x,before);
});
test('CD HP0 remains0 through target curve and pending learning never exposes an installable partial patch',()=>{
 const x=input();x.member.hp=0;const before=clone(x);freeze(x);const body=evolve(E,x);assert.equal(body.member.hp,0);assert.equal(body.member.level,27);
 const pending=E.learning.planLearningQueue(body.member,learningInput(x.content,body.learning),{kind:'evolution'},options);assert.equal(pending.status,'pending');assert.equal(pending.selection.move.id,'heatwave');assert.equal(Object.hasOwn(pending,'patch'),false);assert.equal(Object.hasOwn(pending,'effects'),false);assert.deepEqual(x,before);
});
test('CD public ordinary HM protection retains the formal debug selection exception',()=>{
 const x=input(),move=learningInput(x.content,{moves:['Heat Wave']})[0],hm={...options,hmMoves:[x.member.moves[0].id]};freeze(x);
 for(const runtime of [E,K]){
  const ordinary=runtime.learning.planMoveLearning(x.member,move,{kind:'evolution'},hm,[{kind:'replace',slot:0}]);assert.equal(ordinary.status,'pending');assert.equal(ordinary.selection.reason,'hm-protected');
  const debug=runtime.learning.planMoveLearning(x.member,move,{kind:'evolution'},{...hm,debug:true},[{kind:'replace',slot:0}]);assert.equal(debug.status,'ready');assert.equal(debug.patch.moves[0].id,'heatwave');
 }
});
