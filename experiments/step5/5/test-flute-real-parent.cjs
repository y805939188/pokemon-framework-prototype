'use strict';
// Actual GameApplication + production native MZ atomic slot; rendering/input/357/NW are not exercised here.
require('./regular-field-action-test-runtime.cjs').prepare('parent');
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./field-move-real-parent-fixtures.cjs');
function world(options = {}) {
  const {level=false,bag,editContent,editState,...rest}=options;
  return fixture({ ...rest,bag:{blackflute:2,whiteflute:2,...bag},
    editContent(c){c.settings={...c.settings,FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS:level};editContent?.(c);},
    editState(g){g.inventory.registeredItems=['blackflute','whiteflute'];editState?.(g);}});
}
function prepareBag(h, itemId, id = itemId) {
  const operation = h.app.beginInventoryOperation(), view = h.app.inventorySnapshot(operation);
  const pocket = view.pockets.findIndex(rows => rows.some(row => row.item.id === itemId));
  const row = view.pockets[pocket].find(row => row.item.id === itemId), ticket = h.app.inventoryTicket(operation, pocket + 1, row.index);
  const prepared = h.app.prepareFieldItemHandoff(operation, id, ticket); assert.equal(prepared.status, 'handoff', JSON.stringify(prepared));
  h.app.endInventoryOperation(operation); return prepared.handoff.token;
}
const quantity = (h, id) => h.E.inventory.itemQuantity(h.state.inventory, id, h.content.items);
for(const level of [false,true])for(const entry of ['bag','shortcut'])for(const color of ['black','white'])test('flute real native parent '+(level?'level':'rate')+'/'+entry+'/'+color,async()=>{
 const h=world({level}),id=color+'flute',before=structuredClone(h.state),queries=h.app.fieldShortcutQueries();
 assert.equal(queries.resolve({kind:'item',itemId:id}).status,'available');assert.deepEqual(h.draws,[]);assert.deepEqual(h.state,before);
 let result;
 if(entry==='bag'){const token=prepareBag(h,id);const a=h.app.runFieldItemHandoff(token),b=h.app.runFieldItemHandoff(token);assert.equal(a,b);result=await a;assert.equal((await h.app.runFieldItemHandoff(token)).status,'duplicate');}
 else {const selection=h.app.prepareFieldShortcutSelection('shortcut',{kind:'item',itemId:id});assert.equal(selection.status,'prepared',JSON.stringify(selection));const a=h.app.executeFieldShortcut(selection.request),b=h.app.executeFieldShortcut(selection.request);assert.equal(a,b);result=await a;}
 const flag=level?(color==='black'?'higherWildLevel':'lowerWildLevel'):(color==='black'?'lowerEncounterRate':'higherEncounterRate');assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(h.local[flag],true);assert.equal(quantity(h,id),2);for(const other of ['lowerWildLevel','higherWildLevel','lowerEncounterRate','higherEncounterRate'].filter(v=>v!==flag))assert.equal(h.local[other],false,other);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
for(const level of [false,true])test('flute same/opposite '+(level?'level':'rate')+' target-only and lower-first consumer',async()=>{
 const h=world({level});for(const [at,id]of ['whiteflute','blackflute','whiteflute'].entries())assert.equal((await h.app.runFieldItemHandoff(prepareBag(h,id,'sequence-'+at))).status,'completed');
 if(level){assert.equal(h.local.lowerWildLevel,true);assert.equal(h.local.higherWildLevel,true);const calls=[],rng=n=>{calls.push(n);return n===4?3:0;};assert.equal(h.E.encounterSelection.selectEncounterLevel({species:'A',weight:1,minLevel:50,maxLevel:50},[],h.local,rng),46);assert.deepEqual(calls,[1,4]);assert.equal(h.local.lowerEncounterRate,false);assert.equal(h.local.higherEncounterRate,false);}
 else {assert.equal(h.local.lowerEncounterRate,true);assert.equal(h.local.higherEncounterRate,true);const p=h.E.encounterTrigger.encounterProbability({table:{stepChance:20,slots:[]},runtime:{accumulator:0,graceSteps:0},fromStep:true,cycling:false,local:h.local,party:[],moreAbilities:false,weatherCategory:'None'});assert.equal(p.chance,10);assert.equal(p.minimumSteps,12);assert.equal(h.local.lowerWildLevel,false);assert.equal(h.local.higherWildLevel,false);}assert.deepEqual(h.draws,[]);
});
test('flute mode switch and new owners preserve all other three existing local flags',async()=>{
 const h=world({level:true});let actual=h.content;
 for(const [index,level,color]of [[0,true,'black'],[1,false,'white'],[2,true,'white'],[3,false,'black']]){if(index){actual={...actual,settings:{...actual.settings,FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS:level}};h.actual(actual);}assert.equal((await h.app.runFieldItemHandoff(prepareBag(h,color+'flute','cross-'+index))).status,'completed');}
 for(const flag of ['lowerWildLevel','higherWildLevel','lowerEncounterRate','higherEncounterRate'])assert.equal(h.local[flag],true);assert.deepEqual(h.draws,[]);
});
for(const level of [false,true])test('authored flute '+(level?'level':'rate')+' uses catalog color and consumes inventory/local once atomically',async()=>{
 const h=world({level,bag:{'author-music':2},editContent(c){c.items['author-music']={...c.items.blackflute,id:'author-music',legacyIds:[],consumable:true,effect:{family:'flute',parameters:{color:'white'}}};}}),token=prepareBag(h,'author-music');
 let installs=0;const define=Reflect.defineProperty;Reflect.defineProperty=function(target,key,descriptor){if(target===h.root.$gameSystem&&key==='_psGame')installs++;return define(target,key,descriptor);};let r;try{r=await h.app.runFieldItemHandoff(token);assert.equal((await h.app.runFieldItemHandoff(token)).status,'duplicate');}finally{Reflect.defineProperty=define;}
 assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(r.consumed,true);assert.equal(quantity(h,'author-music'),1);assert.equal(installs,1);assert.equal(h.local[level?'lowerWildLevel':'higherEncounterRate'],true);assert.deepEqual(h.draws,[]);
});
for(const level of [false,true])for(const change of ['content','generation','map'])test('late '+(level?'level':'rate')+'/'+change+' refuses without local/inventory half commit',async()=>{
 const h=world({level}),token=prepareBag(h,'blackflute');if(change==='content')h.actual({...h.content,settings:{...h.content.settings,TIME_SHADING:false}});else if(change==='generation')h.replaceGeneration();else h.root.$gameMap._mapId=99;
 const result=await h.app.runFieldItemHandoff(token);assert.notEqual(result.status,'completed',JSON.stringify(result));assert.equal(h.local.lowerEncounterRate,false);assert.equal(h.local.higherWildLevel,false);assert.equal(quantity(h,'blackflute'),2);assert.deepEqual(h.draws,[]);
});
for(const level of [false,true])test('flute cancelled '+(level?'level':'rate')+' owner cannot commit but new owner can',async()=>{
 const h=world({level}),old=prepareBag(h,'whiteflute','cancel-old');assert.equal(h.app.cancelFieldItemHandoff(old).status,'unchanged');assert.equal((await h.app.runFieldItemHandoff(old)).status,'cancelled');assert.equal(quantity(h,'whiteflute'),2);assert.equal(h.local[level?'lowerWildLevel':'higherEncounterRate'],false);
 assert.equal((await h.app.runFieldItemHandoff(prepareBag(h,'whiteflute','new-owner'))).status,'completed');assert.equal(h.local[level?'lowerWildLevel':'higherEncounterRate'],true);assert.deepEqual(h.draws,[]);
});
test('flute consumable native non-writable install refuses with zero local or inventory half write',async()=>{
 const h=world({level:true,bag:{'author-music':2},editContent(c){c.items['author-music']={...c.items.blackflute,id:'author-music',legacyIds:[],consumable:true,effect:{family:'flute',parameters:{color:'black'}}};}}),token=prepareBag(h,'author-music'),before=h.state;
 Object.defineProperty(h.root.$gameSystem,'_psGame',{value:before,writable:false,configurable:false,enumerable:true});const result=await h.app.runFieldItemHandoff(token);assert.notEqual(result.status,'completed');assert.equal(h.state,before);assert.equal(quantity(h,'author-music'),2);assert.equal(h.local.higherWildLevel,false);assert.deepEqual(h.draws,[]);
});
for(const level of [false,true])test('flute load/new-game invalidation '+(level?'level':'rate')+' clears both semantic flags, inventory remains',async()=>{
 const h=world({level});for(const id of ['blackflute','whiteflute'])await h.app.runFieldItemHandoff(prepareBag(h,id));assert.equal(h.local[level?'higherWildLevel':'lowerEncounterRate'],true);assert.equal(h.local[level?'lowerWildLevel':'higherEncounterRate'],true);h.app.stateReplacedByHost();for(const flag of ['lowerEncounterRate','higherEncounterRate','lowerWildLevel','higherWildLevel'])assert.equal(h.local[flag],false);assert.equal(quantity(h,'blackflute'),2);assert.equal(quantity(h,'whiteflute'),2);
});
for(const level of [false,true])test('flute cross-map entry '+(level?'level':'rate')+' clears local flags while same-map transfer retains them',async()=>{
 const h=world({level,editContent(c){delete c.mapMetadata.maps[8].weather;}});await h.app.runFieldItemHandoff(prepareBag(h,'blackflute'));
 const same=h.app.observeWorldMapEntry({id:'same-map-entry',cause:'transfer',previousMapId:7,mapId:7,rebuilt:true});assert.equal(same.status,'unchanged',JSON.stringify(same));assert.equal(h.local[level?'higherWildLevel':'lowerEncounterRate'],true);
 h.root.$gameMap._mapId=8;const outcome=h.app.observeWorldMapEntry({id:'cross-map-entry',cause:'transfer',previousMapId:7,mapId:8,rebuilt:true});assert.equal(outcome.status,'committed',JSON.stringify(outcome));for(const flag of ['lowerEncounterRate','higherEncounterRate','lowerWildLevel','higherWildLevel'])assert.equal(h.local[flag],false);assert.equal(quantity(h,'blackflute'),2);assert.deepEqual(h.draws,[]);
});
test('field Sweet Scent consumes the same generated form-registration plan through the actual native parent',async()=>{
  const h=fixture({moveId:'sweetscent',editContent(c){
    c.species.B.ruleSpecies='Espurr';c.species.B.contentId='B';c.species.B.form=0;c.species.B.gender='F';
    c.species.B1={...structuredClone(c.species.B),form:1,formName:'Female'};
    c.forms=Object.fromEntries(['A','B','C'].map(id=>[id,{'0':id}]));c.forms.B['1']='B1';
    c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:id==='B1'?'B':id,form:id==='B1'?1:0}]));
    c.world.encounters.tables[0].types.Land.slots[0].species='B';
  }});
  const result=await h.run();assert.equal(result.status,'completed',JSON.stringify(result));assert(result.admission);assert.equal(h.state.dex.seen.includes('B'),true);
  assert.deepEqual(h.state.dex.seenForms.B,[{gender:1,form:1,shiny:true}]);assert.equal(h.state.dex.owned.includes('B'),false);assert.equal(h.state.dex.capturedCounts.B??0,0);
  h.app.abortAdmittedWorldBattle(result.admission,'field registration done');
});
