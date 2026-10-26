/** 5.3 G1. Thin learning/reminder/forgetting screens; all writes go through the existing application transaction. */
import { LearningScreen } from './progression/learning-screen.ts';
import { InputLatch } from './management/model.ts';
import type { LearningIntent, LearningParent, LearningOutcome } from '../framework/app/learning-operation.ts';
(() => {
 const G:any=globalThis,W:any=window,NAME='PS_Progression',flow=()=>W.PSFlow,app=()=>flow().app();
 const tr=(key:string,params?:Record<string,string|number>)=>flow().translator().t('progression.'+key,params);
 type Handle={application:any;generation:number;done:boolean;result?:LearningOutcome};
 type Request={intent?:LearningIntent;resume?:boolean;handle:Handle;done?:(o:LearningOutcome)=>void};
 let queued:Request|null=null,reserved:Request|null=null,active:Controller|null=null;
 const waits=new WeakMap<object,Handle>(),notices:{request:Request;result:LearningOutcome}[]=[];
 class Controller {
  model!:LearningScreen;ready=false;closed=false;frame=0;token='';text:string[]=[];latch=new InputLatch();
  private moves=new Map<string,any>();
  constructor(readonly window:any,readonly request:Request,readonly finish:(o:LearningOutcome)=>void){}
  valid(){return !this.closed&&this.request.handle.application===flow()._app&&this.request.handle.generation===this.request.handle.application.stateGeneration;}
  start(parent?:LearningParent){
   if(!this.valid()||this.request.handle.done){this.close({status:'refused',reason:'stale-learning-screen'});return;}
   const r=this.request.resume?(this.request.handle.application.pendingLearning?{status:'pending',view:this.request.handle.application.pendingLearning}:{status:'refused',reason:'no-learning-operation'}):this.request.handle.application.beginLearning(this.request.intent,parent);
   this.token=r.status==='pending'?r.view.token:'';
   this.model=new LearningScreen({resolve:(token,revision,decision)=>{
    if(!this.valid())return {status:'refused',reason:'stale-learning-screen'};
    return this.request.handle.application.resolveLearning(token,revision,decision);
   },text:tr,move:id=>flow().translator().tOr('move.name.'+id,this.move(id)?.name??id),pp:id=>this.move(id)?.pp??0,close:o=>this.close(o),reload:()=>{this.dispose();G.SceneManager.goto(G.Scene_Title);}},r);
   this.boundary();this.draw();
  }
  move(id:string){if(!this.moves.has(id))this.moves.set(id,this.request.handle.application.describeLearningMove(id));return this.moves.get(id);}
  boundary(){this.ready=false;this.frame=G.Graphics.frameCount??0;this.latch.arm(W.PSManagement.inputFrame().pressed);G.Input.clear();G.TouchInput.clear();}
  update(){
   if(!this.valid()){this.close({status:'refused',reason:'stale-learning-screen'});return;}
   const frame=G.Graphics.frameCount??0;if(!this.ready&&(frame<=this.frame||G.SceneManager.isSceneChanging()))return;
   const sample=this.latch.filter(W.PSManagement.inputFrame());if(!this.ready){this.ready=true;return;}
   if(G.$gameMessage?.isBusy?.())return;
   const page=this.model.page;
   if(sample.triggered.back)this.model.back();
   else if(sample.triggered.use)this.model.select(page.rows[page.cursor]?.key??'');
   else if(sample.repeated.up||sample.repeated.down){if(page.rows.length)page.cursor=(page.cursor+(sample.repeated.up?-1:1)+page.rows.length)%page.rows.length;}
   if(this.closed)return;if(this.model.page!==page)this.boundary();this.draw();
  }
  draw(){
   const b=this.window.contents,p=this.model.page,w=b.width,h=b.height;b.clear();b.fontFace=flow().translator().font()||'sans-serif';b.fontSize=20;this.text=[];
   const fit=(value:string,width:number)=>{let s='';for(const c of Array.from(value)){if(this.window.textWidth(s+c)>width){while(s&&this.window.textWidth(s+'…')>width)s=Array.from(s).slice(0,-1).join('');return s+'…';}s+=c;}return s;};
   const line=(s:string,y:number,x=12,width=w-24,color='#fff')=>{s=fit(s,width);this.text.push(s);b.textColor=color;b.drawText(s,x,y,width,30,'left');};
   line(tr('title'),8,12,w-24,'#b8e3ff');
   // Two measured title lines allow long localized prompts without overlapping the selectable rows.
   let current='',n=0;for(const char of Array.from(p.title)){if(this.window.textWidth(current+char)>w-24&&current){line(current,48+n*30);current='';if(++n===2)break;}current+=char;}if(n<2)line(current,48+n*30);
   const selected=p.rows[p.cursor]?.moveId,info=selected?this.move(selected):null,left=selected?Math.floor(w*.46):w;
   const visible=Math.max(1,Math.floor((h-200)/34)),start=Math.max(0,p.cursor-visible+1);
   for(let i=start;i<Math.min(p.rows.length,start+visible);i++){
    const row=p.rows[i]!,y=124+(i-start)*34,detail=row.details??'',right=this.window.textWidth(detail);
    if(i===p.cursor)b.fillRect(8,y,left-16,32,'#435f80');
    if(detail)line(detail,y,left-16-right,right);line((i===p.cursor?'▶ ':'  ')+row.text,y,12,left-40-right);
   }
   if(selected){
    const x=left+14,width=w-x-12;line(tr('details'),122,x,width,'#b8e3ff');
    line(tr('type',{value:info?.type||'—'}),156,x,width);line(tr('category',{value:info?.category||'—'}),190,x,width);
    line(tr('power',{value:info?.power??'—'}),224,x,width);line(tr('accuracy',{value:info?.accuracy===0?'—':info?.accuracy??'—'}),258,x,width);
    const description=flow().translator().tOr('move.description.'+selected,info?.description||tr('noDescription'));
    let part='',y=302;for(const char of Array.from(description as string)){if(this.window.textWidth(part+char)>width&&part){line(part,y,x,width);part='';y+=28;if(y>h-110)break;}part+=char;}if(y<=h-110)line(part,y,x,width);
   }
   if(p.error)line(p.error,h-74,12,w-24,'#ffe09a');line(tr('help'),h-38,12,w-24,'#b8e3ff');
  }
  close(o:LearningOutcome){if(this.closed)return;this.closed=true;this.request.handle.done=true;this.request.handle.result=structuredClone(o);if(active===this)active=null;this.finish(o);}
  dispose(){
   if(this.closed)return;
   if(this.valid()&&this.token&&this.request.handle.application.pendingLearning?.token===this.token){
    const p=this.request.handle.application.pendingLearning;
    this.request.handle.application.resolveLearning(p.token,p.revision,{kind:'technical-terminate'});
   }
   // Indeterminate installations remain guarded by the app. The event/scene can end and the explicit resume command
   // reopens recovery; loading the last complete save is the only safe escape from a truly partial installation.
   this.close({status:'refused',reason:this.valid()&&this.request.handle.application.pendingLearning?.token===this.token?'learning-recovery-required':'presentation-ended'});
  }
 }
 function makeRequest(intent?:LearningIntent,done?:Request['done'],resume=false):Request {const application=app();return {intent,done,resume,handle:{application,generation:application.stateGeneration,done:false}};}
 function open(request:Request){
  if(active||queued||reserved||G.SceneManager.isSceneChanging()||G.$gameMessage?.isBusy?.())return null;
  queued=reserved=request;try{G.SceneManager.push(Scene_PSProgression);}catch(e){if(queued===request)queued=null;if(reserved===request)reserved=null;const created=active as Controller|null;if(created?.request===request)created.dispose();request.handle.done=true;request.handle.result={status:'refused',reason:String(e)};}return request.handle;
 }
 function Scene_PSProgression(this:any){this.initialize(...(arguments as any));}
 const P=Scene_PSProgression.prototype=Object.create(G.Scene_MenuBase.prototype);P.constructor=Scene_PSProgression;
 P.initialize=function(){G.Scene_MenuBase.prototype.initialize.call(this);this._request=queued;queued=null;};
 P.create=function(){G.Scene_MenuBase.prototype.create.call(this);try{
  if(!this._request)throw Error('missing-learning-request');
  const h=this._request.handle;if(h.done||h.application!==flow()._app||h.generation!==h.application.stateGeneration){h.done=true;h.result??={status:'refused',reason:'stale-learning-screen'};if(reserved===this._request)reserved=null;this._finished=true;return;}
  this._window=new G.Window_Base(new G.Rectangle(0,0,G.Graphics.boxWidth,G.Graphics.boxHeight));this.addWindow(this._window);
  if(h.done||h.application!==flow()._app||h.generation!==h.application.stateGeneration){h.done=true;h.result??={status:'refused',reason:'stale-learning-screen'};if(reserved===this._request)reserved=null;this._finished=true;return;}
  this._controller=new Controller(this._window,this._request,(o:LearningOutcome)=>{this._finished=true;if(this._request.done)notices.push({request:this._request,result:structuredClone(o)});});active=this._controller;if(reserved===this._request)reserved=null;this._controller.start();
 }catch(error){if(reserved===this._request)reserved=null;this._failure=String(error);this._controller?.dispose();if(this._request&&!this._request.handle.done){this._request.handle.done=true;this._request.handle.result={status:'refused',reason:this._failure};}try{G.$gameMessage.add(tr('refused',{reason:this._failure}));}catch{console.error(NAME,error);}}};
 P.update=function(){G.Scene_MenuBase.prototype.update.call(this);if(this._finished||this._failure){this.popScene();return;}try{this._controller?.update();}catch(error){this._controller?.dispose();this._failure=String(error);try{G.$gameMessage.add(tr('refused',{reason:this._failure}));}catch{console.error(NAME,error);}}};
 P.popScene=function(){if(this._controller&&!this._controller.closed){this._controller.model.back();this._controller.boundary();this._controller.draw();return;}G.Scene_MenuBase.prototype.popScene.call(this);};
 P.terminate=function(){G.Scene_MenuBase.prototype.terminate.call(this);this._controller?.dispose();};
 const ui:any=W.PSProgression={
  learn:(intent:LearningIntent,done?:Request['done'])=>open(makeRequest(intent,done)),
  resumeLearning:()=>open(makeRequest(undefined,undefined,true)),
  attachLearning:(win:any,intent:LearningIntent,parent:LearningParent,done:Request['done'])=>{
   if(active||queued||reserved)throw Error('learning-screen-active');const request=makeRequest(intent),c=new Controller(win,request,o=>done?.(o));active=c;
   try{c.start(parent);}catch(error){c.dispose();throw error;}return c;
  },
  current:()=>active&&!active.closed?{ready:active.ready,token:active.token,generation:active.request.handle.generation,page:structuredClone(active.model.page),text:[...active.text]}:null,
 };
 const pending=flow().operationPending;flow().operationPending=function(){return (pending?pending.call(this):!!this._app?.saveBlocked)||!!queued||!!reserved||!!active;};
 const register=(name:string,run:(args:any)=>Handle|null)=>G.PluginManager.registerCommand(NAME,name,function(this:any,args:any){try{const h=run(args);if(!h)throw Error('learning-screen-active');waits.set(this,h);this.setWaitMode('psProgression');}catch(error){G.$gameMessage.add(tr('refused',{reason:String(error)}));}});
 register('TeachMove',a=>ui.learn({kind:'teach',memberId:String(a.memberId),source:{kind:a.source==='generic'?'generic':'tutor',moveId:String(a.moveId)}}));
 register('RelearnMove',a=>ui.learn({kind:'relearn',memberId:String(a.memberId)}));register('ForgetMove',a=>ui.learn({kind:'forget',memberId:String(a.memberId)}));register('ResumeLearning',()=>ui.resumeLearning());
 const wait=G.Game_Interpreter.prototype.updateWaitMode;G.Game_Interpreter.prototype.updateWaitMode=function(){if(this._waitMode!=='psProgression')return wait.call(this);const h=waits.get(this);if(h&&!h.done&&h.application===flow()._app&&h.generation===h.application.stateGeneration)return true;this._waitMode='';waits.delete(this);return false;};
 for(const method of ['clear','terminate']){const prior=G.Game_Interpreter.prototype[method];if(typeof prior==='function')G.Game_Interpreter.prototype[method]=function(...args:any[]){const h=waits.get(this);waits.delete(this);if(h&&!h.done){if(active?.request.handle===h)active.dispose();else {if(queued?.handle===h)queued=null;if(reserved?.handle===h)reserved=null;h.done=true;h.result={status:'refused',reason:'event-aborted'};}}return prior.apply(this,args);};}
 const update=G.SceneManager.updateScene;G.SceneManager.updateScene=function(...args:any[]){const value=update.apply(this,args);if(!this.isSceneChanging()&&!G.$gameMessage?.isBusy?.()&&!(this._scene instanceof Scene_PSProgression))while(notices.length){const n=notices.shift()!;if(n.request.handle.application===flow()._app&&n.request.handle.generation===n.request.handle.application.stateGeneration)try{n.request.done?.(n.result);}catch(e){console.error(NAME,e);}}return value;};
})();
