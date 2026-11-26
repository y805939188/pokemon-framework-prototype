'use strict';
// C ordinary readonly/synthetic host boundary. The compiled unstamped IIFEs
// still own Flow, token issuance, timing, App and native Map-to-Scene handoff.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const clockOf=G=>G.performance.now();

function ordinaryC({hour,valueForBound}){
 assert(Number.isInteger(hour)&&hour>=0&&hour<=23);
 let current=null,nativeInstalls=0,flowInstalls=0,owner;
 const rows=[],covers=[];
 function assertNoTestFields(flow){
  assert.equal(flow.fast,false);assert.equal(flow.rng,null);assert.equal(flow.clock,null);assert.equal(flow.seed,undefined);
 }
 return {
  crypto:Object.freeze({randomFillSync(words){
   assert(current&&current.fills===0,'C entropy belongs to one original Flow.random invocation');
   assert.equal(Object.prototype.toString.call(words),'[object Uint32Array]');assert.equal(words.length,2);
   assert.strictEqual(Reflect.apply(crypto.randomFillSync,crypto,[words]),words);
   // After the real same-buffer Node fill, provide one known synthetic packet.
   // Production retains the unit conversion and its own floor/unit*bound.
   // Pick the bin centre so the adapter's bit discard cannot change the integer.
   const word=Math.floor((current.value+0.5)/current.bound*0x100000000);
   words[0]=word;words[1]=0;current.fills++;
   return words;
  }}),
  nativeSetup(G){
   assert.equal(nativeInstalls++,0);
   const HostDate=G.Date,at=new HostDate(2026,10,17,hour,0,0,0).getTime();
   G.Date=class CEventVmDate extends HostDate {
    constructor(...args){super(...(args.length?args:[at]));}
    static now(){return at;}
   };
   assert.equal(new G.Date(G.Date.now()).getHours(),hour);
   const text=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_scenes.js'),'utf8');
   const mark='Scene_Map.prototype.isReady',a=text.indexOf(mark+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a);
   vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-C-native:'+mark});
   G.Scene_Message.prototype.isReady=()=>true;
   G.DataManager.isMapLoaded=()=>!!G.$dataMap;

   // Headless rendering ports only. Real Map, receiver, callbacks, frame pump
   // and SceneManager remain intact. Observe precisely the owned 1x1 cover.
   const Bitmap=G.Bitmap;
   G.Bitmap=function CHeadlessBitmap(w,h){
    const bitmap=Reflect.construct(Bitmap,[]);
    Object.assign(bitmap,{width:w,height:h,fillAll(){},destroy(){this.retired=true;}});
    return bitmap;
   };
   G.Bitmap.prototype=Bitmap.prototype;
   G.Sprite=function CHeadlessSprite(bitmap){
    Object.assign(this,{bitmap,scale:{},opacity:255,parent:null,retired:false});
   };
   G.Sprite.prototype.destroy=function(){this.retired=true;};
   const display=G.Scene_Map.prototype.createDisplayObjects;
   G.Scene_Map.prototype.createDisplayObjects=function(...args){
    const result=Reflect.apply(display,this,args);
    this.children=[];this._windowLayer={};this._messageWindow={};
    this._spriteset??={};
    this.addChild=function(sprite){
     this.children.push(sprite);sprite.parent=this;
     if(sprite.bitmap?.width===1&&sprite.bitmap?.height===1)
      covers.push({scene:this,op:G.PSFlow?._op,sprite,bitmap:sprite.bitmap,frame:G.Graphics.frameCount});
     return sprite;
    };
    this.removeChild=function(sprite){
     const at=this.children.indexOf(sprite);assert(at>=0);
     this.children.splice(at,1);sprite.parent=null;return sprite;
    };
    return result;
   };
  },
  installFlow(G,flow,draws){
   assert.equal(nativeInstalls,1);assert.equal(flowInstalls++,0);owner=flow;
   assertNoTestFields(flow);
   const original=flow.random;
   flow.random=function(bound){
    assert.strictEqual(this,flow);assert(!current&&Number.isSafeInteger(bound)&&bound>0&&rows.length<40);
    assert(typeof valueForBound==='function','given member must never draw generation entropy');
    const value=valueForBound(bound);
    assert(Number.isSafeInteger(value)&&0<=value&&value<bound);
    const sample=current={bound,value,fills:0};
    try {
     const observed=Reflect.apply(original,this,[bound]);
     assert.equal(sample.fills,1);assert.equal(observed,value);
     draws.push(bound);rows.push({...sample,frame:G.Graphics.frameCount});return observed;
    } finally {current=null;}
   };
  },
  assertOrdinary(G){
   const F=G.PSFlow;
   assert.strictEqual(F,owner);assert.equal(flowInstalls,1);
   assertNoTestFields(F);
   assert.equal(new G.Date(F.now()).getHours(),hour);
  },
  covers,rows
 };
}

function stages(G,op,phase='battle'){
 assert.equal(op.prebattleMode,'default-map');
 const h=op.prebattle.snapshot(),rows=Array.from(h.stages,x=>({...x}));
 assert.equal(h.phase,phase);
 assert.deepEqual(rows.slice(0,4).map(x=>x.phase),['flash','transition','after','battle']);
 assert.deepEqual(rows.slice(0,4).map(x=>x.targetMs),[800,1250,100,0]);
 for(let i=1;i<4;i++) {
  assert(rows[i].frame>rows[i-1].frame);
  assert(rows[i].at-rows[i-1].at>=rows[i-1].targetMs);
 }
 assert.equal(h.cleanupErrors.length,0);
 return h;
}

function assertCoverRetired(ordinary,scene,op){
 const seen=ordinary.covers.filter(x=>x.scene===scene&&x.op===op);
 assert(seen.length>0,'ordinary source Map really displayed an owned prebattle cover');
 for(const {scene,sprite,bitmap} of seen) {
  assert.equal(sprite.parent,null);assert.equal(sprite.bitmap,null);
  assert.equal(scene.children.includes(sprite),false);
  assert.equal(sprite.retired,true);assert.equal(bitmap.retired,true);
 }
}

async function ordinaryStarted(h,op,source,interpreter){
 const {G,app,ordinary}=h,F=G.PSFlow,M=G.SceneManager;
 ordinary.assertOrdinary(G);
 assert.strictEqual(M._scene,source);assert.strictEqual(F._op,op);
 if(interpreter)assert.equal(interpreter._waitMode,'psBattle');
 const first=op.prebattle.snapshot();
 assert(['new','flash'].includes(first.phase));assert.equal(op.session,null);
 const begin=clockOf(G);
 await h.pump(()=>!!F._op?.session&&M._scene instanceof G.Scene_PSBattle,180);
 const hnd=stages(G,op),s=M._scene;
 assert.equal(hnd.primaryError,null);assert.notStrictEqual(s,source);
 assert.strictEqual(F._op,op);assert.strictEqual(s._psOp,op);
 assert.strictEqual(app.op.session,op.session);
 assert.strictEqual(s._session,op.session);
 assert(clockOf(G)-begin>=2150-1000/60,'ordinary Map frame budget was actually consumed');
 if(interpreter)assert.equal(interpreter._waitMode,'psBattle');
 assertCoverRetired(ordinary,source,op);
 return op.session;
}

async function exitToMap(h,oldBattle,interpreter,{aborted=false}={}){
 const {G,app}=h,F=G.PSFlow,M=G.SceneManager;
 assert(M._scene instanceof G.Scene_PSBattle);assert.strictEqual(M._scene,oldBattle);
 assert.equal(F.running,false);
 M.pop();
 await h.pump(()=>M._scene instanceof G.Scene_Map&&M._scene!==oldBattle&&M._scene.isStarted()&&
   !F.operationPending()&&!app.saveBlocked&&(!interpreter||interpreter._waitMode===''),80);
 assert.equal(G.$gameSystem.isSaveEnabled(),true);
 assert.equal(F.running,false);assert.equal(app.op,null);
 assert.equal(F.lastOutcome.aborted===true,aborted);
 if(interpreter)assert.equal(interpreter._psBattleId,undefined);
}

function failedPush(h,trigger,{beforeNativePush,retired,onOldMusic}={}){
 const {G,app,ordinary}=h,F=G.PSFlow,M=G.SceneManager,source=M._scene,push=M.push,abort=app.abortAdmittedWorldBattleForHost,music=F._closeBattleMusic;
 const generation=app.stateGeneration; let old,pushError,returned=null,counts={push:0,abort:0,music:0};
 M.push=function(C,...args){
  if(C!==G.Scene_PSBattle||F._op!==old)return Reflect.apply(push,this,[C,...args]);
  assert.strictEqual(this,M);assert.strictEqual(M._scene,source);stages(G,old);counts.push++;
  try { beforeNativePush();return Reflect.apply(push,this,[C,...args]); }
  catch(error){pushError=error;throw error;}
 };
 if(onOldMusic) F._closeBattleMusic=function(op,...args){
  const result=Reflect.apply(music,this,[op,...args]);
  if(old&&op===old&&counts.push===1&&counts.abort===0){
   counts.music++;onOldMusic({source,op,error:pushError});
  }
  return result;
 };
 app.abortAdmittedWorldBattleForHost=function(admission,error,...args){
  if(!old||admission!==old.worldAdmission)return Reflect.apply(abort,this,[admission,error,...args]);
  assert.strictEqual(this,app);assert.strictEqual(error,pushError);
  counts.abort++;returned=Reflect.apply(abort,this,[admission,error,...args]);
  assert.equal(app.op,null);assert.equal(app.saveBlocked,false);
  assert.equal(returned.code,0);assert.equal(returned.commit,'none');assert.equal(returned.aborted,true);
  assert.equal(returned.battleId,old.request.battleId);
  if(retired){
   // Deliberate reentry after the actual old App retirement. The old
   // outer Flow waiter may not project/close over the genuine successor.
   M.push=push;if(onOldMusic)F._closeBattleMusic=music;
   F.close(0,old,false);retired({source,old,error:pushError});
  }
  return returned;
 };
 return (async()=>{
  try {
   ordinary.assertOrdinary(G);
   trigger();old=F._op;
   assert(old);assert.equal(counts.push,0,'ordinary live Map may not push synchronously');
   assert.equal(old.session,null);assert.equal(F.running,true);
   await h.pump(()=>counts.abort===1,180);
   assert(pushError);assert.equal(counts.push,1);assert.equal(counts.abort,1);
   assert.equal(counts.music,onOldMusic?1:0);assert.equal(app.stateGeneration,generation);
   const hnd=stages(G,old,'failed');assert(hnd.primaryError?.includes(String(pushError.message??pushError)));
   assertCoverRetired(ordinary,source,old);
   assert.strictEqual(M._scene,source);assert(!(M._nextScene instanceof G.Scene_PSBattle));
   if(!retired){
    assert.strictEqual(F._op,old,'historical aborted operation kept without authority');
    assert.strictEqual(F.request,old.request);
    assert.equal(F.running,false);assert.equal(F.operationPending(),false);
    assert.equal(F.lastOutcome.battleId,returned.battleId);
    assert.equal(F.lastOutcome.code,0);assert.equal(F.lastOutcome.commit,'none');
    assert.equal(F.lastOutcome.aborted,true);assert.equal(G.$gameSystem.isSaveEnabled(),true);
   }
   return{old,source,error:pushError,counts};
  } finally {
   M.push=push;app.abortAdmittedWorldBattleForHost=abort;if(onOldMusic)F._closeBattleMusic=music;
  }
 })();
}
module.exports={ordinaryC,ordinaryStarted,exitToMap,failedPush};
