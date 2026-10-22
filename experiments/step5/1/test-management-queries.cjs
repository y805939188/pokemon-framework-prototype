'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../../../js/engine/build/engine.cjs');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../../content/sample',n+'.json'),'utf8'));
const content=E.contentRuntime.assembleContent(E.contentCompile.compileContent(Object.fromEntries(['manifest','sources','species','overlays','grants'].map(n=>[n,read(n)]))).data,E.dex.createDexLookup()).content;
function setup(){const state=E.fakes.createMemoryState(E.fixtures.savedFor(E.fixtures.makeGame(),content));const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),content:()=>({content,dex:E.dex.createDexLookup()}),projection:E.fakes.createRecordingProjection()});return {state,app};}
test('P51-17: management/individual copies expose stored identity, stats, source/owner, descriptions and complete PP without writes',()=>{
 const {state,app}=setup(),before=JSON.stringify(state.current()),snap=app.managementSnapshot(),id=snap.party[0].id,view=app.describeIndividual(id);
 assert.ok(view.stats.hp>0);assert.equal(view.member.personalID,state.current().party[0].personalID);assert.equal(view.publicId,'00000');assert.ok(view.ability.description);assert.ok(view.moves[0].description);assert.ok(view.types.length);assert.equal(view.moves[0].pp,state.current().party[0].moves[0].pp);
 snap.party[0].hp=0;view.member.markings.push(1);assert.equal(JSON.stringify(state.current()),before);assert.equal(state.replaced.length,0);
});
test('P51-10a: held read model uses virtual slots, keeps authoritative edit refs, and does not mutate or duplicate',()=>{
 const {state,app}=setup(),token=app.beginManagement(),before=app.managementSnapshot(),source=before.references[before.party[0].id];app.manage(token,'pick',{kind:'pick-up',source});const snap=app.managementSnapshot(token);
 assert.equal(snap.held.id,source.id);assert.equal(snap.party.length,before.party.length-1);assert.deepEqual(snap.references[source.id],source);assert.equal(state.current().party.length,before.party.length);assert.equal(state.replaced.length,0);app.manage(token,'cancel',{kind:'cancel-held'});
});
test('P51-19: storage search preserves same-species identities and slots, handles Chinese/text/form/marks, never mutates',()=>{
 const {state,app}=setup(),next=E.state.clone(state.current());for(let i=0;i<1200;i++){const m=E.state.clone(next.party[0]);m.id='BOX'+i;m.nickname=i===1199?'蓝色朋友':'';m.markings=i===1199?[2]:[];E.storage.placeInBox(next.storage,m);}state.replace(next);const writes=state.replaced.length;
 assert.equal(app.searchStorage({},m=>m.species).length,1200);const r=app.searchStorage({text:'蓝色',form:0,markings:[{index:0,value:2}]},()=> '喷火龙');assert.equal(r.length,1);assert.deepEqual(r[0].position,{kind:'box',box:39,slot:29});assert.equal(app.searchStorage({text:'no-match'},()=> '').length,0);assert.equal(app.searchStorage({text:'喷火龙'},()=> '喷火龙').length,1200);assert.equal(state.replaced.length,writes);
});
test('P51-17/F05: missing species never authorizes external details; read model reports content error',()=>{
 const {state}=setup();let loads=0;const dex=new Proxy({}, {get(){return()=>{loads++;throw Error('must not query');}}});const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),content:()=>({content:{species:{},meta:{kind:'sample',id:'empty'}},dex}),projection:E.fakes.createRecordingProjection()});const view=app.describeIndividual(state.current().party[0].id);assert.deepEqual(view.diagnostics,['member-content-unavailable']);assert.equal(view.stats,null);assert.equal(loads,0);
});
