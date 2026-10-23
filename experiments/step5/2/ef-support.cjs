'use strict';
const E=require('../../../js/engine/build/engine.cjs'),clone=structuredClone;
function setup({bag={},settings={},edit=()=>{},world={},variables,...ports}={}){
 const content=clone(E.fixtures.content);content.items=E.itemCatalog.legacyCatalog();content.settings=settings;
 for(const sp of Object.values(content.species))sp.learnset={};
 content.species.Charizard.abilities=['Blaze','Solar Power'];content.species.Charizard.hiddenAbilities=['Hidden Power'];
 const game=E.fixtures.makeGame();game.inventory=E.inventory.inventoryFromBag(bag,content.items);game.party[0].abilityIndex=0;game.party[0].effectiveAbilityIndex=0;
 edit(game,content);const state=E.fakes.createMemoryState(game);let draws=0;
 const app=new E.app.GameApplication({state,content:()=>({content}),projection:E.fakes.createRecordingProjection(),sessions:E.fakes.createFakeSessions({}),random:()=>{draws++;return 0;},clock:()=>1000,itemWorld:()=>world,variables,...ports});
 return {app,state,game,content,world,get draws(){return draws;}};
}
const maxHp=(m,c)=>E.growth.computeStats(E.speciesKey.speciesDataOf(c,m).base,m.ivs,m.evs,m.level,E.memberMetadata.computedNature(m)).hp;
function plan(x,id,quantity=1,answers={},memberId=x.game.party[0].id){return E.itemEffects.planItemUse(x.game,x.content,{itemId:id,quantity,memberId},answers,x.world);}
const count=(game,id,c)=>E.inventory.itemQuantity(game.inventory,id,c.items);
module.exports={E,clone,setup,maxHp,plan,count};
