'use strict';
const I6 = require("../2/test-support.cjs");
const test=require('node:test');const assert=require('node:assert/strict');const E=require('../../../js/engine/build/engine.cjs');const T=E.storage;const clone=x=>JSON.parse(JSON.stringify(x));
function setup(options={}){const game=E.fixtures.makeGame();const m=clone(game.party[1]);m.id='BOX1';m.item='leftovers';T.placeInBox(game.storage,m);game.party[0].item='oranberry';game.party[0].ribbons=['R1','R2'];I6.setBag(game, {potion:3,oranberry:1});const state=E.fakes.createMemoryState(game),sessions=E.fakes.createFakeSessions({}),projection=E.fakes.createRecordingProjection();let contentCalls=0;const app=new E.app.GameApplication({state,sessions,projection,content:()=>{contentCalls++;return {content:{...E.fixtures.content,settings:{...E.fixtures.content.settings,BAG_POCKET_SLOTS:[-1,3,-1,-1,-1,-1,-1,-1]},moves:{...E.fixtures.content.moves,Tackle:{id:"tackle",name:"Tackle",pp:35}},species:{...E.fixtures.content.species,Pidgey:{...E.fixtures.content.species.Pidgey,abilities:["Keen Eye"],gender:128,learnset:{1:["Tackle"]}}}}};},random:()=>0,clock:()=>1234567000},{...options,describeHeldItem:id=>['oranberry','leftovers'].includes(id)?{holdable:true}:null});return {app,state,game,sessions,get contentCalls(){return contentCalls;}};}
const ref=(g,id)=>{const x=T.locateMember(g,id);assert.ok(x,id);return {id,position:x.position};};
const box=(b,s)=>({kind:'box',box:b,slot:s});
const party=index=>({kind:'party',index});
function run(f){const x=setup({capabilities:{allowHeldItemSources:true}}),token=x.app.beginManagement();let n=0;const exec=req=>x.app.manage(token,String(++n),req);f(x,token,exec);}

test('P51-09: move/withdraw/swap is one replacement; source/target stale and last able cannot partially apply',()=>run((x,token,exec)=>{
 const id=x.game.party[1].id;const source=ref(x.state.current(),id);const before=clone(x.state.current());const writes=x.state.replaced.length;
 assert.equal(exec({kind:'move',source,target:box(1,0),expectedTargetId:null}).status,'applied');assert.equal(x.state.replaced.length,writes+1);assert.equal(T.locateMember(x.state.current(),id).position.box,1);
 const snapshot=clone(x.state.current());assert.equal(exec({kind:'move',source,target:box(1,1),expectedTargetId:null}).reason,'stale-source');assert.deepEqual(x.state.current(),snapshot);
 assert.equal(exec({kind:'move',source:ref(x.state.current(),id),target:party(2),expectedTargetId:null}).status,'applied');assert.equal(x.state.current().party[2].id,id);
 const one=clone(x.state.current());one.party.slice(1).forEach(m=>m.hp=0);x.state.replace(one);const first=ref(x.state.current(),one.party[0].id);
 assert.equal(exec({kind:'move',source:first,target:box(1,2),expectedTargetId:null}).reason,'last-able');assert.equal(exec({kind:'pick-up',source:first}).reason,'last-able');
 assert.equal(exec({kind:'move',source:first,target:box(0,0),expectedTargetId:'BOX1'}).status,'applied','last able may swap with an able boxed member');
}));
for(const ending of ['place','cancel','stale'])test(`P51-10a: held intent retains independent box/member/item/move/ribbon edits on ${ending}`,()=>run((x,token,exec)=>{
 const id=x.game.party[0].id,other=x.game.party[1].id;const original=ref(x.state.current(),id);const ids=T.allMembers(x.state.current()).map(m=>m.id).sort();
 assert.equal(exec({kind:'pick-up',source:original}).status,'held');assert.equal(x.app.saveBlocked,true);assert.equal(x.state.replaced.length,0);
 assert.equal(exec({kind:'current-box',box:3}).status,'applied');assert.equal(exec({kind:'box-name',box:3,name:'交叉盒'}).status,'applied');assert.equal(exec({kind:'wallpaper',box:3,wallpaper:5}).status,'applied');
 assert.equal(exec({kind:'markings',source:ref(x.state.current(),other),markings:[2]}).status,'applied');assert.equal(exec({kind:'take-item',source:ref(x.state.current(),'BOX1')}).status,'applied');
 assert.equal(exec({kind:'markings',source:x.app.heldMemberReference(token),markings:[1,0,2]}).status,'applied');
 assert.equal(exec({kind:'sort-ribbons',source:x.app.heldMemberReference(token),from:0,to:1}).status,'applied');
 const moves=clone(T.locateMember(x.state.current(),id).member.moves);assert.equal(exec({kind:'sort-moves',source:x.app.heldMemberReference(token),from:0,to:1}).status,'applied');
 assert.equal(exec({kind:'take-item',source:x.app.heldMemberReference(token)}).status,'applied');
 const beforeEnd=clone(x.state.current());
 if(ending==='cancel')assert.equal(exec({kind:'cancel-held'}).status,'cancelled');
 else if(ending==='place')assert.equal(exec({kind:'place-held',target:box(3,4),expectedTargetId:null}).status,'applied');
 else {const changed=clone(x.state.current());changed.storage.boxes[3].slots[4]={...clone(changed.party[2]),id:'INTRUDER'};x.state.replace(changed);assert.equal(exec({kind:'place-held',target:box(3,4),expectedTargetId:null}).reason,'stale-target');assert.equal(x.app.saveBlocked,true);assert.deepEqual(x.state.current(),changed);exec({kind:'cancel-held'});}
 const now=x.state.current();assert.equal(now.storage.currentBox,3);assert.equal(now.storage.boxes[3].name,'交叉盒');assert.equal(now.storage.boxes[3].wallpaper,5);assert.deepEqual(T.locateMember(now,other).member.markings,[2]);
 const held=T.locateMember(now,id).member;assert.deepEqual(held.markings,[1,0,2]);assert.equal(held.item,'');assert.deepEqual(held.ribbons,['R2','R1']);assert.deepEqual(held.moves,[moves[1],moves[0],...moves.slice(2)]);assert.equal(I6.bagOf(now).oranberry,2);assert.equal(I6.bagOf(now).leftovers,1);
 assert.equal(T.allMembers(now).filter(m=>m.id===id).length,1);if(ending!=='stale')assert.deepEqual(T.allMembers(now).map(m=>m.id).sort(),ids);
 if(ending==='cancel')assert.deepEqual(T.locateMember(now,id).position,original.position);
 assert.equal(x.app.saveBlocked,false);
}));
test('P51-10: exchange chains commit once, preserve latest records, cancellation writes no old snapshot',()=>run((x,token,exec)=>{
 const first=x.game.party[0].id;assert.equal(exec({kind:'pick-up',source:ref(x.state.current(),first)}).status,'held');
 assert.equal(exec({kind:'place-held',target:box(0,0),expectedTargetId:'BOX1'}).heldId,'BOX1');assert.equal(x.state.replaced.length,0);
 assert.equal(exec({kind:'markings',source:x.app.heldMemberReference(token),markings:[3]}).status,'applied');const writes=x.state.replaced.length;
 assert.equal(exec({kind:'place-held',target:box(2,2),expectedTargetId:null}).status,'applied');assert.equal(x.state.replaced.length,writes+1);
 assert.equal(T.locateMember(x.state.current(),first).position.box,0);assert.deepEqual(T.locateMember(x.state.current(),'BOX1').member.markings,[3]);
}));
test('P51-10/11: release guards, confirmation, duplicate receipt, failed replace and stale generation',()=>run((x,token,exec)=>{
 const source=ref(x.state.current(),'BOX1');const before=clone(x.state.current());assert.equal(exec({kind:'release',source,confirmed:false}).status,'cancelled');assert.deepEqual(x.state.current(),before);
 const req={kind:'release',source,confirmed:true};const writes=x.state.replaced.length;assert.equal(x.app.manage(token,'release-once',req).status,'applied');assert.equal(x.app.manage(token,'release-once',req).status,'applied');assert.equal(x.state.replaced.length,writes+1);assert.equal(I6.bagOf(x.state.current()).leftovers,undefined,'released held item is not given to bag');
 const src=ref(x.state.current(),x.game.party[0].id);x.state.failReplace=Error('disk/host refused');const snap=clone(x.state.current());assert.equal(exec({kind:'markings',source:src,markings:[1]}).status,'refused');assert.deepEqual(x.state.current(),snap);x.state.failReplace=null;
 exec({kind:'pick-up',source:src});x.app.stateReplacedByHost();assert.equal(x.app.saveBlocked,false);assert.equal(exec({kind:'place-held',target:box(1,1),expectedTargetId:null}).reason,'stale-operation');
 for(const flag of ['isEgg','mail','cannotRelease']){const s=clone(x.state.current());s.party[1][flag]=flag==='mail'?'letter':true;x.state.replace(s);const fresh=x.app.beginManagement();const r=x.app.manage(fresh,'r',{kind:'release',source:ref(s,s.party[1].id),confirmed:true});assert.ok(['egg','mail','cannot-release'].includes(r.reason));x.app.endManagement(fresh);}
}));
test('P51-11: give/take/swap items is atomic, capacity checked after spending, closed gate permits take only',()=>run((x,token,exec)=>{
 const src=ref(x.state.current(),x.game.party[0].id);assert.equal(exec({kind:'give-item',source:src,item:'leftovers'}).reason,'no-item');
 assert.equal(exec({kind:'give-item',source:src,item:'oranberry'}).status,'unchanged','giving same item spends and returns one, no copy');
 const target=ref(x.state.current(),'BOX1');assert.equal(exec({kind:'swap-items',source:src,target}).status,'applied');assert.equal(T.locateMember(x.state.current(),src.id).member.item,'leftovers');
 const s=clone(x.state.current());I6.setItemCount(s, "leftovers", 999);x.state.replace(s);const before=clone(s);assert.equal(exec({kind:'take-item',source:src}).reason,'bag-full');assert.deepEqual(x.state.current(),before);
 const closed=setup();const t=closed.app.beginManagement(),r=ref(closed.state.current(),closed.game.party[0].id);assert.equal(closed.app.manage(t,'g',{kind:'give-item',source:r,item:'oranberry'}).reason,'held-item-source-disabled');assert.equal(closed.contentCalls,0,'closed source refuses before content load');assert.equal(closed.app.manage(t,'t',{kind:'take-item',source:r}).status,'applied');
}));
test('P51-12: independent runtime capabilities, no capability in state, battle gate precedes content/session load',async()=>{
 for(const source of [false,true])for(const battle of [false,true]){const x=setup({capabilities:{allowHeldItemSources:source,allowExperimentalHeldItemBattle:battle}});const token=x.app.beginManagement(),r=ref(x.state.current(),x.game.party[0].id);assert.equal(x.app.manage(token,'g',{kind:'give-item',source:r,item:'oranberry'}).status,source?'unchanged':'refused');x.app.endManagement(token);const before=x.contentCalls;
 const start=x.app.startBattle({battleId:'held-probe',kind:'wild',foes:[{species:'Pidgey',level:3}],seq:1});if(battle){await assert.rejects(start,/legacy-no-held-source-gate/);assert.equal(x.sessions.created.length,0,'the old synthetic legacy root may not open held battles; normal required positive is in test-held-app');}else{await assert.rejects(start,/held-item-battle-disabled/);assert.equal(x.contentCalls,before);assert.equal(x.sessions.created.length,0);}assert.equal(JSON.stringify(x.state.current()).includes('allowHeldItem'),false);
 }
 assert.throws(()=>E.config.developmentCapabilities({allowHeldItemSources:1}),/invalid/);assert.ok(E.config.checkOverrides({allowHeldItemSources:true}).length);
});
test('P51-20: deposit healing only after success; HealParty and RecoverAll differ by configuration',()=>{
 const x=setup({depositHeal:true});const g=clone(x.state.current());g.party[1].hp=1;g.party[1].readyToEvolve=true;g.storage.boxes[0].slots[0].hp=1;x.state.replace(g);const t=x.app.beginManagement();const source=ref(g,g.party[1].id);
 assert.equal(x.app.manage(t,'bad',{kind:'move',source,target:box(0,0),expectedTargetId:null}).status,'refused');assert.equal(T.locateMember(x.state.current(),source.id).member.hp,1);
 assert.equal(x.app.manage(t,'good',{kind:'move',source,target:box(1,0),expectedTargetId:null}).status,'applied');const deposited=T.locateMember(x.state.current(),source.id).member;assert.ok(deposited.hp>1);assert.equal(deposited.readyToEvolve,true);x.app.endManagement(t);
 assert.equal(x.app.recoverAll().status,'unchanged');assert.equal(x.state.current().storage.boxes[0].slots[0].hp,1,'depositHeal on: RecoverAll party only');
 const off=setup();const damaged=clone(off.state.current());damaged.storage.boxes[0].slots[0].hp=1;off.state.replace(damaged);off.app.healParty();assert.equal(off.state.current().storage.boxes[0].slots[0].hp,1);assert.equal(off.app.recoverAll().status,'healed');assert.ok(off.state.current().storage.boxes[0].slots[0].hp>1);
});
test('P51-12: direct session boundary refuses held members before driver/data work',async()=>{
 const game=E.fixtures.makeGame({charizard:{item:'leftovers'}});let calls=0;const driver={moveNames:async()=>{calls++;throw Error('must not read engine');},create:async()=>{calls++;throw Error('must not create');}};
 await assert.rejects(E.session.BattleSession.create({game,battleId:'direct-held',content:E.fixtures.content,foe:{kind:'wild',team:[E.fixtures.foeMember('direct','Pidgey',3)]},driver}),/held-item-battle-disabled/);assert.equal(calls,0);
});
test('P51-11: taking a trusted legacy item with a prototype-like ID uses own bag keys, no loss/prototype mutation',()=>{
 const x=setup();const game=clone(x.state.current());game.party[0].item='__proto__';x.state.replace(game);const token=x.app.beginManagement();assert.equal(x.app.manage(token,'take-proto',{kind:'take-item',source:ref(game,game.party[0].id)}).status,'applied');const bag=I6.bagOf(x.state.current());assert.equal(Object.hasOwn(bag,'__proto__'),true);assert.equal(bag.__proto__,1);assert.equal(Object.getPrototypeOf(bag),Object.prototype);assert.equal(x.state.current().party[0].item,'');
});

test('P51-11/F: eggs reject new holders and a stale frozen item reference cannot redirect a swap',()=>run((x,t,exec)=>{
 const state=clone(x.state.current());state.party[1].isEgg=true;x.state.replace(state);const egg=ref(state,state.party[1].id),source=ref(state,state.party[0].id);
 assert.equal(exec({kind:'give-item',source:egg,item:'oranberry'}).reason,'egg');assert.equal(exec({kind:'swap-items',source,target:egg}).reason,'egg');
 assert.equal(exec({kind:'swap-items',source,target:ref(state,'BOX1'),expectedSourceItem:'gone',expectedTargetItem:'leftovers'}).reason,'stale-item');assert.deepEqual(x.state.current(),state);
}));
test('P51-16/F: ribbon swap with empty display slot compacts without persistent holes; moves still require a real target',()=>run((x,t,exec)=>{
 const source=ref(x.state.current(),x.game.party[0].id);assert.equal(exec({kind:'sort-ribbons',source,from:0,to:11}).status,'applied');assert.deepEqual(x.state.current().party[0].ribbons,['R2','R1']);assert.equal(exec({kind:'sort-moves',source,from:0,to:11}).reason,'invalid-index');
}));
test('P51-12/F: experimental moving revalidates holdability and mail instead of creating a new holder for an unsupported legacy item',()=>run((x,t,exec)=>{
 const game=clone(x.state.current());game.party[0].item='not-an-item';x.state.replace(game);const source=ref(game,game.party[0].id),target=ref(game,'BOX1');const before=clone(game);assert.equal(exec({kind:'swap-items',source,target}).reason,'invalid-held-item');assert.deepEqual(x.state.current(),before);assert.equal(exec({kind:'take-item',source}).status,'applied','trusted existing item can still be removed safely');assert.equal(I6.bagOf(x.state.current())['not-an-item'],1);
}));
