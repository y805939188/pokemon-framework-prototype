/** H1 default MZ dex; the application owns all persistent viewing edits. */
import { PokedexScreen } from './pokedex/screen.ts';
import { semantic } from '../framework/rules/index.ts';
import { InputLatch } from './management/model.ts';
(() => {
 const G:any=globalThis,W:any=window,NAME='PS_Pokedex',flow=()=>W.PSFlow;
 const text=(key:string,p?:Record<string,string|number>)=>flow().translator().t('pokedex.'+key,p);
 type Request={application:any;generation:number;scene?:any;constructing:boolean;done:boolean;status:string;fingerprint:string};
 let reserved:Request|null=null,active:Controller|null=null;const waits=new WeakMap<object,Request>();
 const valid=(r:Request)=>!r.done&&r.application===flow()._app&&r.generation===r.application.stateGeneration;
 const retire=(r:Request)=>{r.done=true;if(reserved===r)reserved=null;};
 function reap(){const r=reserved;if(!r||r.constructing)return;const m=G.SceneManager;if(!valid(r)||r.scene&&r.scene!==m._scene&&r.scene!==m._nextScene)retire(r);}
 const busy=()=>{reap();if(active&&!valid(active.request))active.retireStale();return !!reserved||!!active&&!active.closed;};
 const previousPending=flow().operationPending;flow().operationPending=function(){return busy()||previousPending.call(this);};
 function dictionary(content:any){const t=flow().translator(),keys=new Set<string>();for(const data of Object.values(content.species)as any[])for(const k of ['nameKey','formNameKey','categoryKey','entryKey'])if(data[k])keys.add(data[k]);for(const r of content.regionalDex?.regions??[])keys.add(r.nameKey);return Object.fromEntries([...keys].map(k=>[k,t.tOr(k,k)]));}
 function region(){const maps=flow().content().mapMetadata?.maps,id=G.$gameMap?.mapId?.();return maps&&Object.hasOwn(maps,String(id))?maps[String(id)].region??null:null;}
 class Controller {
  closed=false;ready=false;frame=0;latch=new InputLatch();screen!:PokedexScreen;text:string[]=[];
  constructor(readonly scene:any,readonly request:Request,readonly window:any){}
  boundary(){this.ready=false;this.frame=G.Graphics.frameCount??0;this.latch.arm(W.PSManagement.inputFrame().pressed);G.Input.clear();G.TouchInput.clear();}
  start(){const r=this.request,application=r.application;const check=()=>{if(!valid(r)||active!==this)throw Error('stale-pokedex-ui');if(application.encounterBlocked&&application.pendingPokedex?.purpose!=='edit')throw Error('operation-active');const c=flow().content();if(semantic.semanticFingerprint(c)!==r.fingerprint||!valid(r))throw Error('stale-pokedex-ui-content');};
   this.screen=new PokedexScreen({snapshot:()=>{check();const s=application.pokedexSnapshot(dictionary(flow().content()),region());check();return s;},content:()=>{check();const c=flow().content();check();return c;},locale:flow().translator().lang,text:dictionary(flow().content()),currentRegion:region(),edit:command=>{check();const result=application.updatePokedex(command);check();return result;},resolve:(token,revision,decision)=>{check();const result=application.resolvePokedex(token,revision,decision);check();return result;},...(application.pendingPokedex?.purpose==='edit'?{pending:{status:'pending' as const,view:application.pendingPokedex}}:{}),finish:()=>this.finish(),reload:()=>{this.retireStale();G.SceneManager.goto(G.Scene_Title);},stopCry:()=>G.AudioManager?.stopSe?.(),cry:()=>{ /* Placeholder media. No audio/resource-success claim. */ }});
   if(this.screen.done){this.finish();return;}this.boundary();this.draw();
  }
  update(){if(!valid(this.request)){this.retireStale();return;}if(this.screen?.done){this.finish();return;}if(!this.ready){if((G.Graphics.frameCount??0)<=this.frame||G.SceneManager.isSceneChanging())return;this.ready=true;this.latch.filter(W.PSManagement.inputFrame());return;}
   const input=this.latch.filter(W.PSManagement.inputFrame()),before=JSON.stringify(this.screen.view),v=this.screen.view;
   const directions=['up','down','left','right']as const;const direction=directions.find(d=>input.repeated[d]&&(v.kind!=='forms'||G.Input.isTriggered(d)));
   const action=direction??(input.triggered.back?'back':input.triggered.use?'use':input.triggered.action?'action':undefined);
   if(action){if(this.request.application.encounterBlocked&&this.request.application.pendingPokedex?.purpose!=='edit')throw Error('operation-active');const c=flow().content();if(semantic.semanticFingerprint(c)!==this.request.fingerprint||!valid(this.request)){this.request.status='stale-content';throw Error('stale-pokedex-ui-content');}this.screen.action(action);if(!this.closed){if(before!==JSON.stringify(this.screen.view))this.boundary();this.draw();}}
  }
  get view(){return this.screen?.view;}
  retireStale(){this.closed=true;retire(this.request);if(active===this)active=null;}
  finish(){if(this.closed)return;this.closed=true;if(this.request.status==='queued')this.request.status='complete';retire(this.request);if(active===this)active=null;if(G.SceneManager._scene===this.scene)this.scene.popScene();}
  dispose(){if(this.closed)return;if(this.request.status==='queued')this.request.status='technically-terminated';try{if(valid(this.request))this.screen?.close();}catch(e){console.error(NAME,e);}this.retireStale();}
  draw(){const b=this.window.contents;b.clear();this.text=[];const width=b.width;let y=0;
   const line=(s:string,color='#ffffff')=>{s=String(s);this.text.push(s);b.textColor=color;b.fontSize=22;let value=s;if(this.window.textWidth(value)>width-24){const chars=Array.from(s);while(chars.length&&this.window.textWidth(chars.join('')+'…')>width-24)chars.pop();value=chars.join('')+'…';}b.drawText(value,12,y,width-24,30,'left');y+=32;};
   const v=this.view;line(text('title'));if(!v)return;
   const cursor=(rows:any[],row:(r:any)=>string)=>{const start=Math.max(0,v.cursor-10);for(let i=start;i<Math.min(rows.length,start+13);i++)line((i===v.cursor?'▶ ':'  ')+row(rows[i]));};
   if(v.kind==='regions'){cursor(v.rows,r=>r.region===null?text('exit'):(r.region===-1?text('national'):dictionary(flow().content())[flow().content().regionalDex.regions[r.region].nameKey])+`  ${text('seen')}: ${r.counts.seen}${r.counts.allSeen?' ✓':''}  ${text('owned')}: ${r.counts.owned}${r.counts.allOwned?' ✓':''}`);}
   else if(v.kind==='list'){cursor(v.rows,r=>String(r.number).padStart(3,'0')+'  '+r.name+(r.owned?' ●':''));if(!v.rows.length)line(text('empty'));line(text('orderHelp'),'#b8e3ff');if(v.diagnostics.length)line(text('sortKeyMissing'),'#ffe29a');}
   else if(v.kind==='order')cursor(Array.from({length:6},(_,i)=>i),n=>text('order'+n));
   else if(v.kind==='entry'){
    const i=v.info;line((i?.number.text??'???')+'  '+(i?.name??v.species));line(text(['info','area','forms'][v.page]!));
    if(v.page===0){if(v.battled)line(text('battled')+': '+i.counts.battled);else line(text('measurements')+': '+(v.measurements?v.measurements.height+' / '+v.measurements.weight:'???'));
     line(text('types')+': '+(i.types.join(' / ')||'???'));line(i.categoryKey?flow().translator().tOr(i.categoryKey,i.categoryKey):'???');line(i.entryKey?flow().translator().tOr(i.entryKey,i.entryKey):'???');line(text('spritePlaceholder'));if(i.footprint)line(text('footprintPlaceholder'));
    }else if(v.page===1)line(text('areaUnknown'));else{line(text('spritePlaceholder'));line(text('formCount',{count:v.forms.length}));for(const f of v.forms.slice(0,5))line(f.label||text('oneForm'));}
   }else if(v.kind==='forms'){cursor(v.rows,r=>r.label||text('oneForm'));line(text('formHelp'));}
   else if(v.kind==='recovery'){line(text('writeFailed'));line(v.error,'#ffb5b5');line(text(v.reloadRequired?'reloadRequired':'retryHelp'));}
   else if(v.kind==='error'){line(v.text,'#ffb5b5');line(text('exitHelp'));}else line(text('empty'));
   line(text('help'),'#b8e3ff');
  }
 }
 function Window_PSPokedex(this:any){this.initialize(...(arguments as any));}Window_PSPokedex.prototype=Object.create(G.Window_Base.prototype);Window_PSPokedex.prototype.constructor=Window_PSPokedex;Window_PSPokedex.prototype.initialize=function(rect:any){G.Window_Base.prototype.initialize.call(this,rect);this.activate();};
 function Scene_PSPokedex(this:any){this.initialize(...(arguments as any));}Scene_PSPokedex.prototype=Object.create(G.Scene_MenuBase.prototype);Scene_PSPokedex.prototype.constructor=Scene_PSPokedex;const P=Scene_PSPokedex.prototype;
 P.initialize=function(){G.Scene_MenuBase.prototype.initialize.call(this);this._request=reserved;};
 P.create=function(){const r=this._request;if(!r||!valid(r))return;try{r.constructing=true;G.Scene_MenuBase.prototype.create.call(this);const win=new(Window_PSPokedex as any)(new G.Rectangle(0,0,G.Graphics.boxWidth,G.Graphics.boxHeight));this._window=win;this.addWindow(win);if(!valid(r))return;this._controller=new Controller(this,r,win);active=this._controller;this._controller.start();}catch(e){this._failure=String(e);G.$gameMessage?.add(text('failed',{reason:String(e)}));this._controller?.dispose();retire(r);}finally{r.constructing=false;}};
 P.update=function(){G.Scene_MenuBase.prototype.update.call(this);if(this._failure||!this._request||!valid(this._request)){this._controller?.retireStale();if(!G.SceneManager.isSceneChanging())this.popScene();return;}try{this._controller?.update();}catch(e){this._failure=String(e);G.$gameMessage?.add(text('failed',{reason:String(e)}));this._controller?.dispose();}};
 P.terminate=function(){this._controller?.dispose();if(this._request)retire(this._request);this._window?.destroy?.();G.Scene_MenuBase.prototype.terminate.call(this);};
 function open(){reap();if(busy()||G.SceneManager.isSceneChanging())return{status:'refused',reason:'operation-active'};
  const r:Request={application:null,generation:-1,constructing:true,done:false,status:'queued',fingerprint:''};reserved=r;
  try{const application=flow().app();r.application=application;r.generation=application.stateGeneration;const recovering=application.pendingPokedex?.purpose==='edit'&&!application.pendingPokedex.parentToken;if(flow().running||!recovering&&(previousPending.call(flow())||application.encounterBlocked))throw Error('operation-active');r.fingerprint=semantic.semanticFingerprint(flow().content());const s=application.pokedexSnapshot(dictionary(flow().content()),region());if(!valid(r)||semantic.semanticFingerprint(flow().content())!==r.fingerprint)throw Error('stale-pokedex-ui');if(application.encounterBlocked&&!recovering)throw Error('operation-active');if(s.menu==='hidden'&&!recovering){retire(r);return{status:'refused',reason:'pokedex-not-accessible'};}G.SceneManager.push(Scene_PSPokedex);r.scene=G.SceneManager._nextScene??G.SceneManager._scene;r.constructing=false;return{status:'opened',request:r};}catch(e){r.constructing=false;retire(r);return{status:'refused',reason:String(e)};}
 }
 W.PSPokedex={open,busy,current:()=>active&&!active.closed?{ready:active.ready,view:structuredClone(active.view),text:[...active.text]}:null};W.Scene_PSPokedex=Scene_PSPokedex;
 const orig=G.Window_MenuCommand.prototype.addOriginalCommands;G.Window_MenuCommand.prototype.addOriginalCommands=function(){orig.call(this);try{const a=flow().app(),s=a.pokedexSnapshot(dictionary(flow().content()),region());if(s.menu!=='hidden')this.addCommand(text('title'),'psPokedex',!flow().operationPending());}catch{}};
 const create=G.Scene_Menu.prototype.createCommandWindow;G.Scene_Menu.prototype.createCommandWindow=function(){create.call(this);this._commandWindow.setHandler('psPokedex',()=>{const r=open();if(r.status==='refused'){G.$gameMessage.add(text('failed',{reason:String(r.reason)}));this._commandWindow.activate();}});};
 G.PluginManager.registerCommand(NAME,'ShowPokedex',function(this:any){const result=open();if(result.status==='opened'){waits.set(this,result.request!);this.setWaitMode('psPokedex');}else G.$gameMessage.add(text('failed',{reason:String(result.reason)}));});
 const waitMode=G.Game_Interpreter.prototype.updateWaitMode;G.Game_Interpreter.prototype.updateWaitMode=function(){if(this._waitMode!=='psPokedex')return waitMode.call(this);const r=waits.get(this);if(r&&!r.done&&valid(r))return true;waits.delete(this);this._waitMode='';return false;};
 for(const name of ['clear','terminate']){const original=G.Game_Interpreter.prototype[name];if(typeof original==='function')G.Game_Interpreter.prototype[name]=function(...args:any[]){const r=waits.get(this);waits.delete(this);if(r&&!r.done){if(active?.request===r)active.dispose();else retire(r);}return original.apply(this,args);};}

 G.PluginManager.registerCommand(NAME,'SetPokedex',function(args:any){if(busy()||previousPending.call(flow())){G.$gameMessage.add(text('failed',{reason:'operation-active'}));return;}const r=flow().app().updatePokedex({kind:'entitlement',value:args.enabled==='true'});if(r.status==='refused'||r.status==='pending')G.$gameMessage.add(text('writeFailed'));});
 G.PluginManager.registerCommand(NAME,'UnlockRegion',function(args:any){if(busy()||previousPending.call(flow())){G.$gameMessage.add(text('failed',{reason:'operation-active'}));return;}const r=flow().app().updatePokedex({kind:'unlock',region:Number(args.region),unlocked:args.enabled==='true'});if(r.status==='refused'||r.status==='pending')G.$gameMessage.add(text('writeFailed'));});
})();
