/** G2a: owned evolution/Info/learning continuation. Domain authority remains in GameApplication. */
import { EvolutionTimeline } from './progression/evolution-timeline.ts';
import { LearningScreen } from './progression/learning-screen.ts';
import { drawLearningPage } from './progression/learning-draw.ts';
import { InputLatch } from './management/model.ts';
import type { LearningOutcome } from '../framework/app/learning-operation.ts';
(() => {
 const G:any=globalThis,W:any=window,NAME='PS_Evolution',flow=()=>W.PSFlow,app=()=>flow().app();
 const tr=(key:string,p?:Record<string,string|number>)=>flow().translator().t('evolution.'+key,p);
 type Request={scene?:any;constructing?:boolean;application:any;generation:number;owner:string;trigger:boolean;battleId?:string;done:boolean;result?:string;outcome?:any;event?:{event:number;memberId?:string}};
 let queued:Request|null=null,reserved:Request|null=null,active:Controller|null=null,recoveryChoice:{request:Request;title:boolean}|null=null;
 const waits=new WeakMap<object,Request>(),outcomes=new WeakMap<object,any>(),suppressed=new Set<string>();
 const suppress=(r:Request)=>{suppressed.add(r.generation+':'+r.owner);if(suppressed.size>32)suppressed.delete(suppressed.values().next().value!);};
 function retire(r:Request,reason:string){if(queued===r)queued=null;if(reserved===r)reserved=null;if(!r.done){r.done=true;r.result=reason;}}
 function retireOrphan(){const r=reserved??queued;if(!r||r.constructing)return;const m=G.SceneManager;if(r.done||r.application!==flow()._app||r.generation!==r.application.stateGeneration)retire(r,'stale');else if(r.scene&&'_nextScene'in m&&r.scene!==m._scene&&r.scene!==m._nextScene)retire(r,'scene-replaced');}
 const clock=()=>G.performance?.now?.()??Date.now();
 function reportFailure(error:unknown,r:Request|null|undefined){
  try{G.$gameMessage.add(tr('failed',{reason:String(error)}));
   if(r&&G.$gameMessage.setChoices&&G.$gameMessage.setChoiceCallback){G.$gameMessage.setChoices([tr('retry'),tr('reload')],0,1);G.$gameMessage.setChoiceCallback((choice:number)=>{recoveryChoice={request:r,title:choice===1};});}
  }catch{console.error(NAME,error);}
 }

 const root=(a:any)=>a.pendingTrade?null:a.pendingTriggeredEvolution?{owner:a.pendingTriggeredEvolution.token,trigger:true}:a.pendingPokedex?.parentToken?{owner:a.pendingPokedex.parentToken,trigger:false}:a.pendingEvolution?{owner:a.pendingEvolution.token,trigger:false}:null;
 class Controller {
  closed=false;ready=false;frame=0;latch=new InputLatch();timeline:EvolutionTimeline|null=null;selection:any=null;lesson:LearningScreen|null=null;
  layer='';key='';error='';cursor=0;backRequested=false;text:string[]=[];knownTokens=new Set<string>();moves=new Map<string,any>();savedBgm:any;audioCaptured=false;learned:string[]=[];deferredClose:{code:number;op:any}|null=null;
  constructor(readonly window:any,readonly request:Request,readonly finish:()=>void){}
  valid(){return active===this&&!this.closed&&!this.request.done&&this.request.application===flow()._app&&this.request.generation===this.request.application.stateGeneration;}
  views(){
   const a=this.request.application;if(!this.valid())return {e:null,d:null,t:null};
   const t=a.pendingTriggeredEvolution?.token===this.request.owner?a.pendingTriggeredEvolution:null;
   if(this.request.trigger&&!t)return {e:null,d:null,t:null};
   const e=a.pendingEvolution;
   if(e&&(e.token===this.request.owner||t?.evolution?.token===e.token))this.knownTokens.add(e.token);
   const d=a.pendingPokedex;
   return {e:e&&this.knownTokens.has(e.token)?e:null,d:d&&(d.parentToken===this.request.owner||this.knownTokens.has(d.parentToken))?d:null,t};
  }
  boundary(){this.ready=false;this.frame=G.Graphics.frameCount??0;this.latch.arm(W.PSManagement.inputFrame().pressed);G.Input.clear();G.TouchInput.clear();}
  start(){if(!this.valid()){this.close('stale');return;}this.savedBgm=G.AudioManager?.saveBgm?.();this.audioCaptured=true;this.sync();}
  move(id:string){if(!this.moves.has(id))this.moves.set(id,this.request.application.describeLearningMove(id));return this.moves.get(id);}
  dispatch(kind:'e'|'d'|'t',decision:any){
   if(!this.valid()){this.close('stale');return null;}
   const p=this.views()[kind];if(!p){this.error='stale-continuation';return null;}
   const before=this.views().e,memberId=before?.memberId,oldMoves=memberId?new Set(flow().game().party.find((m:any)=>m.id===memberId)?.moves.map((m:any)=>m.id)??[]):null;
   const result=kind==='e'?flow().resolveEvolution(p.token,p.revision,decision):kind==='d'?flow().resolvePokedex(p.token,p.revision,decision):flow().resolveTriggeredEvolution(p.token,p.revision,decision);
   this.request.outcome=structuredClone(result?.continuation??result);
   if(oldMoves&&decision.kind!=='learn'){const member=flow().game().party.find((m:any)=>m.id===memberId);for(const move of member?.moves??[])if(!oldMoves.has(move.id)&&!this.learned.includes(move.id))this.learned.push(move.id);}
   return result;
  }
  resolve(kind:'e'|'d'|'t',decision:any){const result=this.dispatch(kind,decision);if(result?.status==='refused'){this.error=result.reason;this.layer='recovery';this.key=kind;this.cursor=0;this.boundary();this.draw();return;}this.sync();}
  sync(){
   if(!this.valid()){this.close('stale');return;}
   const {e,d,t}=this.views();this.error='';this.lesson=null;this.timeline=null;
   if(this.learned.length){this.layer='learned';this.boundary();this.draw();return;}
   if(d){this.key='d';this.layer=d.phase==='failed'?'recovery':d.phase==='entry'?'entry':'dex-message';this.error=d.error??'';}
   else if(e){this.key='e';if(e.phase==='failed'){this.layer='recovery';this.error=e.error??'';}
    else if(e.phase==='learning'&&e.learning){this.layer='learning';this.mountLesson(e);}
    else if(e.phase==='after-evolution'){this.layer='recovery';this.error='post-evolution-entry-owner-missing';}
    else if(e.selection){this.selection=structuredClone(e.selection);this.timeline=new EvolutionTimeline(e.selection.cancellable,clock());this.layer='animation';G.AudioManager?.stopBgm?.();}
    else {this.layer='recovery';this.error='missing-evolution-selection';}}
   else if(t){this.key='t';this.layer='recovery';this.error=t.error??'growth-selection-belongs-to-item-parent';}
   else {this.close('complete');return;}
   this.cursor=0;this.boundary();this.draw();
  }
  mountLesson(view:any){
   const convert=(p:any):LearningOutcome=>({status:'pending',view:{token:p.token,revision:p.revision,memberId:p.memberId,kind:'teach',selection:p.learning}});
   this.lesson=new LearningScreen({text:(key,p)=>flow().translator().t('progression.'+key,p),move:id=>flow().translator().tOr('move.name.'+id,this.move(id)?.name??id),pp:id=>this.move(id)?.pp??0,
    reload:()=>{this.dispose();G.SceneManager.goto(G.Scene_Title);},close:()=>this.sync(),
    resolve:(_token,_revision,decision)=>{
     // The lesson is a projection of this owned continuation; it cannot start a separate teaching transaction.
     const before=this.views().e;if(!before||before.token!==_token||before.revision!==_revision)return {status:'refused',reason:'stale-evolution-lesson'};
     const result=this.dispatch('e',decision.kind==='learn'?{kind:'learn',answer:decision.answer}:decision);
     if(result?.status==='refused')return result;
     const next=this.views().e;
     if(next?.phase==='failed')return {status:'pending',view:{token:next.token,revision:next.revision,memberId:next.memberId??view.memberId,kind:'teach',error:next.error,reloadRequired:next.reloadRequired}};
     if(next?.phase==='learning'&&next.learning&&next.learning.move.id===before.learning.move.id&&!(decision.kind==='learn'&&decision.answer.kind==='decline'&&decision.answer.giveUp===true))return convert(next);
     return {status:decision.kind==='learn'&&decision.answer.kind==='decline'?'unchanged':'committed',token:_token,revision:_revision};
    }},convert(view));
  }
  update(){
   if(!this.valid()){this.close('stale');return;}
   const frame=G.Graphics.frameCount??0;if(!this.ready&&(frame<=this.frame||G.SceneManager.isSceneChanging()))return;
   const input=this.latch.filter(W.PSManagement.inputFrame());if(!this.ready){this.ready=true;return;} // Messages queued by the completed host are displayed on Map after our final ACK.
   const use=!!input.triggered.use,back=!!input.triggered.back||this.backRequested;this.backRequested=false;
   if(this.layer==='animation'&&this.timeline){
    if(this.timeline.phase==='cancelled'){if(use||back)this.sync();else this.draw();return;}
    const before=this.timeline.phase,decision=this.timeline.update(clock(),{use,back});
    if(before!==this.timeline.phase){if(before==='animation'&&this.timeline.cancelled)G.SoundManager?.playCancel?.();this.boundary();}
    if(decision){const result=this.dispatch('e',{kind:decision});if(result?.status==='refused'){this.error=result.reason;this.layer='recovery';this.key='e';this.boundary();}
     else if(decision==='complete'){this.sync();return;}}
   }else if(this.layer==='learning'&&this.lesson){
    const page=this.lesson.page;
    if(back)this.lesson.back();else if(use)this.lesson.select(page.rows[page.cursor]?.key??'');else if(input.repeated.up||input.repeated.down)page.cursor=(page.cursor+(input.repeated.up?-1:1)+page.rows.length)%page.rows.length;
    if(this.lesson?.page!==page)this.boundary();
   }else if(this.layer==='learned'&&(use||back)){this.learned.shift();this.sync();return;}else if(this.layer==='dex-message'&&(use||back)){this.resolve('d',{kind:'message-complete'});return;}
   else if(this.layer==='entry'&&(use||back)){this.resolve('d',{kind:'close-entry'});return;}
   else if(this.layer==='recovery'){
    if(input.repeated.up||input.repeated.down)this.cursor=(this.cursor+(input.repeated.up?2:1))%3;
    if(back)this.resolve(this.key as 'e'|'d'|'t',{kind:'technical-terminate'});
    else if(use){if(this.cursor===2){this.dispose();G.SceneManager.goto(G.Scene_Title);return;}this.resolve(this.key as 'e'|'d'|'t',{kind:this.cursor===0?'retry':'technical-terminate'});}
   }
   if(!this.closed)this.draw();
  }
  draw(){
   if(this.layer==='learning'&&this.lesson){this.text=drawLearningPage(this.window,this.lesson.page,{font:flow().translator().font(),text:(key,p)=>flow().translator().t('progression.'+key,p),textOr:(key,fallback)=>flow().translator().tOr(key,fallback),move:id=>this.move(id)});return;}
   const b=this.window.contents,w=b.width,h=b.height;b.clear();b.fontFace=flow().translator().font()||'sans-serif';b.fontSize=22;this.text=[];
   const line=(text:string,y:number,color='#fff')=>{const raw=String(text);let value='';for(const c of raw){if(this.window.textWidth(value+c+'…')>w-32){value+='…';break;}value+=c;}this.text.push(value);b.textColor=color;b.drawText(value,16,y,w-32,32,'left');};
   if(this.layer==='animation'&&this.timeline){
    const t=this.timeline,s=this.selection,old=flow().speciesName(s.source.species,s.source.form),target=flow().speciesName(s.target.species,s.target.form),p=t.picture;
    line(tr('title'),8,'#b8e3ff');const caption=t.phase==='what'?tr('what'):t.phase==='cancelled'?tr('cancelled',{name:old}):['success','ended'].includes(t.phase)?tr('success',{name:old,target}):tr('evolving',{name:old});line(caption,58);
    const silhouette=(scale:number,x:number,color:string,label:string)=>{if(scale<=0)return;const size=148*scale;b.fillRect(x-size/2,h/2-size/2,size,size,color);b.textColor='#111';b.drawText(label,x-size/2,h/2-16,size,32,'center');};
    silhouette(p.oldScale,w*.3,'#86bbde',old);if(p.targetVisible)silhouette(p.targetScale,w*.7,p.targetWhite?'#fff':'#a6df99',target);
    if(p.white)b.fillRect(0,112,w,h-210,'rgba(255,255,255,'+p.white+')');
    line(tr('placeholder'),h-112,'#b7bdc6');line(t.phase==='animation'?tr(s.cancellable?'cancelHelp':'cannotCancel'):t.phase==='success'&&!t.successReady?tr('wait'):tr('continue'),h-55);
   }else if(this.layer==='learned'){line(tr('learned',{move:this.move(this.learned[0]!)?.name??this.learned[0]!}),80);line(tr('continue'),h-55);}
   else if(this.layer==='dex-message'||this.layer==='entry'){
    const d=this.views().d,entry=d?.entry,name=entry?flow().speciesName(entry.species,entry.appearance.form):'—';
    line(tr('dexTitle'),10,'#b8e3ff');if(this.layer==='dex-message')line(tr('added',{name}),80);
    else {const a=this.request.application,info=a.describePokedexEntry(entry.species,flow().translator().lang??'en');line((info?.number.text??'???')+'  '+name,70);line(info?.types?.join(' / ')||'—',115);line(info?.measurements?info.measurements.height+'  '+info.measurements.weight:'—',160);
     const text=info?.entryKey?flow().translator().tOr(info.entryKey,tr('entryPlaceholder')):tr('entryPlaceholder');line(text,212);line(tr('captured',{count:info?.counts.captured??0}),258);line(tr('defeated',{count:info?.counts.defeated??0}),302);line(tr('placeholder'),h-110,'#b7bdc6');}
    line(tr('continue'),h-55);
   }else if(this.layer==='recovery'){
    line(tr('recovery'),15,'#ffe09a');line(this.error,65,'#ffe09a');['retry','terminate','reload'].forEach((key,i)=>line((this.cursor===i?'▶ ':'  ')+tr(key),145+i*48));
   }
  }
  stopOwned(){const v=this.views();if(v.d)this.dispatch('d',{kind:'technical-terminate'});else if(v.e)this.dispatch('e',{kind:'technical-terminate'});else if(v.t)this.dispatch('t',{kind:'technical-terminate'});}
  close(result:string){if(this.closed)return;const restore=this.valid();this.closed=true;this.request.done=true;this.request.result=result;if(active===this)active=null;if(restore&&this.audioCaptured&&this.savedBgm)try{G.AudioManager?.replayBgm?.(this.savedBgm);}catch(error){console.error(NAME,'music restore failed',error);}this.finish();if(this.deferredClose){const held=this.deferredClose;this.deferredClose=null;originalClose.call(flow(),held.code,held.op);}}
  dispose(){if(this.closed)return;if(this.valid())this.stopOwned();if(this.views().e||this.views().d||this.views().t)suppress(this.request);this.close('presentation-ended');}
 }
 function request(event?:Request['event']):Request|null{const application=app(),r=root(application);if(event&&(r||application.encounterBlocked))return null;if(!event&&!r)return null;return {application,generation:application.stateGeneration,owner:r?.owner??'',trigger:r?.trigger??!!event,...(flow().running&&flow().request?.battleId?{battleId:flow().request.battleId}:{}),done:false,...(event?{event}:{})};}
 function open(r:Request|null){retireOrphan();if(!r||active||reserved||queued||G.SceneManager.isSceneChanging()||G.$gameMessage?.isBusy?.())return null;queued=reserved=r;r.constructing=true;try{G.SceneManager.push(Scene_PSEvolution);}catch(error){if(queued===r)queued=null;if(reserved===r)reserved=null;const created=active as Controller|null;if(created?.request===r)created.dispose();r.done=true;r.result=String(error);}finally{r.constructing=false;}return r;}
 function Scene_PSEvolution(this:any){this.initialize(...(arguments as any));}
 const P=Scene_PSEvolution.prototype=Object.create(G.Scene_MenuBase.prototype);P.constructor=Scene_PSEvolution;
 P.initialize=function(){G.Scene_MenuBase.prototype.initialize.call(this);this._request=queued;if(this._request)this._request.scene=this;queued=null;};
 P.create=function(){let r:Request|null=this._request;try{
  G.Scene_MenuBase.prototype.create.call(this);if(!r){r=request();this._request=r;}
  if(!r)throw Error('missing-evolution-request');const owned=r;const valid=()=>!owned.done&&owned.application===flow()._app&&owned.generation===owned.application.stateGeneration;
  if(!valid()){r.done=true;this._finished=true;if(reserved===r)reserved=null;return;}
  this._window=new G.Window_Base(new G.Rectangle(0,0,G.Graphics.boxWidth,G.Graphics.boxHeight));this.addWindow(this._window);
  if(!valid()){r.done=true;this._finished=true;if(reserved===r)reserved=null;return;}
  if(r.event){const out=flow().beginEventEvolution(r.event);if(out.status==='refused')throw Error(out.reason);const selected=root(r.application);if(!selected){r.outcome=structuredClone(out);r.result='no-target';G.$gameMessage?.add(tr('noTarget'));r.done=true;this._finished=true;if(reserved===r)reserved=null;return;}r.owner=selected.owner;r.trigger=selected.trigger;}
  this._controller=new Controller(this._window,r,()=>{this._finished=true;});active=this._controller;if(reserved===r)reserved=null;this._controller.start();
 }catch(error){if(reserved===r)reserved=null;this._controller?.dispose();if(r){r.done=true;r.result=String(error);suppress(r);}this._failure=String(error);reportFailure(error,this._request);}};
 P.update=function(){if(G.SceneManager._scene!==this)return;G.Scene_MenuBase.prototype.update.call(this);if(this._finished||this._failure){if(!G.SceneManager.isSceneChanging())this.popScene();return;}try{this._controller?.update();}catch(error){this._controller?.dispose();this._failure=String(error);reportFailure(error,this._request);}};
 P.popScene=function(){if(this._controller&&!this._controller.closed){if(this._controller.ready)this._controller.backRequested=true;return;}G.Scene_MenuBase.prototype.popScene.call(this);};
 P.terminate=function(){G.Scene_MenuBase.prototype.terminate.call(this);if(this._controller)this._controller.dispose();else if(this._request)retire(this._request,'presentation-ended');};
 const ui:any=W.PSEvolution={automatic:true,show:()=>open(request()),event:(event=0,memberId?:string)=>open(request({event,...(memberId?{memberId}:{})})),current:()=>active&&!active.closed?{ready:active.ready,owner:active.request.owner,generation:active.request.generation,layer:active.layer,timeline:active.timeline?{phase:active.timeline.phase,successReady:active.timeline.successReady,picture:active.timeline.picture}:null,lesson:active.lesson?structuredClone(active.lesson.page):null,error:active.error,text:[...active.text]}:null};
 const originalClose=flow().close;if(typeof originalClose==='function')flow().close=function(code:number,op:any){if(op&&active?.valid()&&active.request.battleId===op.request?.battleId){active.deferredClose={code,op};return;}return originalClose.call(this,code,op);};
 const pending=flow().operationPending;flow().operationPending=function(){retireOrphan();return pending.call(this)||!!reserved||!!queued||!!active;};
 const prior=G.SceneManager.updateScene;G.SceneManager.updateScene=function(...args:any[]){retireOrphan();const value=prior.apply(this,args);retireOrphan();const scene=this._scene;
  if(recoveryChoice&&!this.isSceneChanging()&&!G.$gameMessage?.isBusy?.()){
   const choice=recoveryChoice;recoveryChoice=null;const r=choice.request;
   if(r&&r.application===flow()._app&&r.generation===r.application.stateGeneration){
    if(choice.title){this.goto(G.Scene_Title);return value;}
    const current=root(r.application);if(current?.owner===r.owner)open(request());else if(!r.owner&&r.event&&!current)open(request(r.event));else G.$gameMessage?.add(tr('ended'));
   }
  }
  if(ui.automatic&&scene instanceof G.Scene_Map&&scene.isStarted()&&!active&&!reserved&&!queued&&!this.isSceneChanging()&&!G.$gameMessage?.isBusy?.()&&!W.PSInventory?.current()&&!W.PSManagement?.current()&&!W.PSProgression?.current()){
   const r=request();if(r&&!suppressed.has(r.generation+':'+r.owner))open(r);
  }return value;
 };
 for(const [name,begin]of [['ShowEvolution',()=>ui.show()],['EventEvolution',(args:any)=>{const n=Number(args.event??0);if(!Number.isSafeInteger(n)||n<0)throw Error('invalid-evolution-event');return ui.event(n,args.memberId||undefined);}]]as const)G.PluginManager.registerCommand(NAME,name,function(this:any,args:any){try{const r=begin(args);if(r){waits.set(this,r);this.setWaitMode('psEvolutionUI');}}catch(error){G.$gameMessage.add(tr('failed',{reason:String(error)}));}});
 Object.defineProperty(G.Game_Interpreter.prototype,'_psEvolutionOutcome',{configurable:true,enumerable:false,get(){const value=outcomes.get(this);return value?structuredClone(value):undefined;}});
 const wait=G.Game_Interpreter.prototype.updateWaitMode;G.Game_Interpreter.prototype.updateWaitMode=function(){if(this._waitMode!=='psEvolutionUI')return wait.call(this);const r=waits.get(this);if(r&&!r.done&&r.application===flow()._app&&r.generation===r.application.stateGeneration)return true;if(r&&r.application===flow()._app&&r.generation===r.application.stateGeneration)outcomes.set(this,structuredClone(r.outcome??{status:'refused',reason:r.result??'presentation-ended'}));waits.delete(this);this._waitMode='';return false;};
 for(const method of ['clear','terminate']){const original=G.Game_Interpreter.prototype[method];if(typeof original==='function')G.Game_Interpreter.prototype[method]=function(...args:any[]){const r=waits.get(this);waits.delete(this);outcomes.delete(this);if(r&&!r.done){if(active?.request===r)active.dispose();else{r.done=true;if(queued===r)queued=null;if(reserved===r)reserved=null;}}return original.apply(this,args);};}
})();
