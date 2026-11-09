'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,acquire,E,T,clone,capabilities}=require('./support.cjs');
function unchanged(w,b,n){assert.deepEqual(w.state.read(),b);assert.equal(w.state.replaced.length,n);}
test('H3 give: leaving management before issuing give preserves source and inventory',()=>{
 const w=fixture('give'),before=clone(w.state.read()),n=w.state.replaced.length;
 const token=w.app.beginManagement();w.app.endManagement(token);unchanged(w,before,n);assert(!w.app.saveBlocked);
 assert.equal(w.app.manage(token,'late-give',{kind:'give-item',source:{id:'P1',position:{kind:'party',index:0}},item:'lumberry'}).status,'refused');unchanged(w,before,n);
});
for(const source of ['gift','grant'])test('H3 '+source+' pending nickname technical termination is zero-write and stale resume refuses',()=>{
 const w=fixture(source),before=clone(w.state.read()),n=w.state.replaced.length;
 const opts={profile:{mode:1,naming:0}},out=source==='gift'?w.app.receiveGift({kind:'normal',member:{species:'snorlax',level:50,item:'lumberry'}},opts):w.app.claimGrant('h3-held',opts);
 assert.equal(out.status,'pending',JSON.stringify(out));const token=w.app.pendingReceiving.token;unchanged(w,before,n);
 assert.equal(w.app.terminateAcquisition(token).status,'aborted');unchanged(w,before,n);assert(!w.app.saveBlocked);
 assert.equal(w.app.resolveReceiving(token).status,'refused');unchanged(w,before,n);
});
for(const stage of ['offer','presented'])test('H3 held trade '+stage+' cancellation keeps original source, dex, counters and ordinal',()=>{
 const w=fixture('trade'),before=clone(w.state.read()),n=w.state.replaced.length;
 let out=w.app.beginTrade('H3-cancel-trade',{outgoingId:'P1',incoming:{species:'snorlax',item:'lumberry'}});assert.equal(out.status,'pending');
 const act=decision=>{const pending=w.app.pendingTrade;return w.app.resolveTrade(pending.token,pending.revision,decision);};
 if(stage==='presented'){assert.equal(act({kind:'confirm',accept:true}).status,'pending');assert.equal(act({kind:'presented'}).status,'pending');assert.equal(act({kind:'cancel'}).reason,'trade-cannot-cancel');unchanged(w,before,n);}
 const p=w.app.pendingTrade;assert.equal(act({kind:stage==='offer'?'cancel':'technical-terminate'}).status,stage==='offer'?'cancelled':'technically-terminated');unchanged(w,before,n);assert(!w.app.saveBlocked);
 assert.equal(w.app.resolveTrade(p.token,p.revision,{kind:'commit'}).status,'refused');unchanged(w,before,n);
});
for(const source of ['capture-party','capture-box','capture-replace'])test('H3 '+source+' completed capture pending reception technical termination is zero-write',async()=>{
 const w=fixture(source);assert.equal(acquire(w).status,'applied');
 w.app=new E.app.GameApplication({state:w.state,content:()=>({content:w.content,dex:w.dex}),sessions:E.composition.createBattleSessionFactory({content:()=>w.content,seed:()=>[1,2,3,4]}),projection:T.fakes.createRecordingProjection(),random:()=>0,clock:()=>12345},{receivingProfile:{mode:source==='capture-replace'?2:1,naming:0}});
 const before=clone(w.state.read()),n=w.state.replaced.length;
 const request={battleId:'H3-cancel-'+source,kind:'wild',seq:1,canLose:true,expGain:false,moneyGain:false,foes:[{species:'snorlax',level:50,moves:['splash','rest','payday']}],...(source==='capture-replace'?{forceParty:true}:{})};let h;
 try{
 h=await w.app.startBattle(request);assert((await h.chooseMove(4)).ok);assert((await h.throwBall('masterball')).ok);assert(h.finished);
 const out=w.app.finishBattle(h,request);assert.equal(out.pending,true,JSON.stringify(out));unchanged(w,before,n);
 const token=out.receivingToken;assert.equal(w.app.terminateBattleCommit(token).status,'aborted');unchanged(w,before,n);assert(!w.app.saveBlocked);
 assert.equal(w.app.resolveReceiving(token).status,'refused');assert.equal(w.app.finishBattle(h,request).commit,'none');unchanged(w,before,n);
 }finally{if(h&&!h.finished)w.app.abortBattle(request,Error('owned H3 source cancel cleanup'));}
});
