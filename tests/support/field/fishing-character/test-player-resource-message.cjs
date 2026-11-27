'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('../fishing-presentation/fixture.cjs');
const root=process.env.PF_E1_CASE_ROOT;assert(root);
function recovery(h){return h.windows.filter(w=>!w.destroyed&&w.visible).flatMap(w=>w.drawn).some(t=>['Operation unfinished','Travel unfinished','操作尚未完成','移动尚未完成'].includes(t));}
for(const entry of ['bag','357'])for(const lang of ['zh','en'])test('POSE09 '+entry+' '+lang+' failed default resource shows localized unavailable without recovery',async()=>{
 const scope=path.join(root,entry+'-'+lang);fs.mkdirSync(scope);const h=await fixture({scope,lang,parameters:{FishingCharacter:''}}),normal=[h.G.$gamePlayer.characterName(),h.G.$gamePlayer.characterIndex()];
 try{await(entry==='bag'?h.bag():h.shortcut());for(let i=0;i<15;i++){h.tick();await flush();}const visible=h.messages.map(m=>m.text);assert(visible.includes(lang==='zh'?'现在无法钓鱼，请稍后再试。':'Fishing is unavailable right now. Please try again later.'),JSON.stringify({visible,windows:h.windows.map(w=>w.drawn),outcomes:h.outcomes}));assert.equal(recovery(h),false);assert(!visible.some(t=>/host-failed|fishing-character|request-unavailable/.test(t)));assert.deepEqual([h.G.$gamePlayer.characterName(),h.G.$gamePlayer.characterIndex()],normal);assert.equal(h.state().stats.fishing_count,1);assert.equal(h.state().stats.fishing_battles,0);assert.equal(h.business.length,0);assert.equal(h.observed.sessions.length,0);assert.equal(h.app.saveBlocked,false);assert.equal(h.app.encounterBlocked,false);fs.writeFileSync(path.join(scope,'VISIBLE.json'),JSON.stringify({entry,lang,visible,recovery:recovery(h),outcomes:h.outcomes,snapshot:h.snapshot()},null,2)+'\n',{flag:'wx'});}finally{h.restore();}
});

test('POSE09 357 translator reentry preserves actual successor and retires only old unavailable observer',async()=>{
 const scope=path.join(root,'successor');fs.mkdirSync(scope);const h=await fixture({scope,lang:'en',parameters:{FishingCharacter:''}});let token=null;
 const original=h.G.PSFlow.translator;h.G.PSFlow.translator=function(){const tr=Reflect.apply(original,this,[]);const wrapped=Object.create(tr);wrapped.t=function(key,...args){if(key==='world.fishing.unavailable'&&!token)token=h.app.beginManagement();return tr.t(key,...args);};return wrapped;};
 try{await h.shortcut();for(let i=0;i<12;i++){h.tick();await flush();}assert(token);assert(h.app.managementSnapshot(token).party.length);assert.equal(h.app.encounterBlocked,true,'genuine management successor owns encounter barrier');assert.equal(recovery(h),false);assert(!h.messages.some(m=>m.text==='Fishing is unavailable right now. Please try again later.'));assert.equal(h.app.endManagement(token).status,'unchanged');for(let i=0;i<8;i++){h.tick();await flush();}assert.equal(recovery(h),false);assert.equal(h.state().stats.fishing_count,1);assert.equal(h.state().stats.fishing_battles,0);}finally{h.restore();}
});
