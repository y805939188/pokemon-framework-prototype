/** 5.1 management adapter. The application owns all records; this scene owns focus and decisions only. */
import { boxCursor, boxLinkAvailable, editMark, InputLatch, inputIntent, markCursor, panelCursor, partyCursor, ribbonCursor, summaryCursor } from './management/model.ts';
import type { Action, Direction, InputFrame } from './management/model.ts';
import type { ManagementRequest } from '../framework/app/management.ts';
import type { ManagementSnapshot, IndividualView, StorageSearch } from '../framework/app/management-query.ts';
import type { Member } from '../framework/rules/types.ts';
import type { MemberPosition } from '../framework/rules/storage.ts';
import type { MemberReference } from '../framework/rules/storage-operations.ts';
import type { ReceivingDecision } from '../framework/rules/receiving.ts';
(() => {
 const G:any=globalThis,W:any=window,NAME='PS_Management';
 const flow=()=>W.PSFlow,app=()=>flow().app();
 const tr=(key:string,params?:Record<string,string|number>)=>flow().translator().t('management.'+key,params);
 const memberName=(m:Member)=>m.nickname||flow().speciesName(m.species,m.form);
 const pending=(o:any)=>!!o&&(o.pending===true||o.status==='pending');
 type MenuItem={key:string;label:string;enabled?:boolean;run:()=>void};
 type View={kind:string;cursor:number;[key:string]:any};
 type OpenRequest={kind:'party'|'pc'|'summary'|'selector'|'receiving';id?:string;qualifier?:(m:Member)=>boolean;done?:(result:any)=>void};
 const KEY:Record<string,Action|Direction>={Enter:'use',Space:'use',KeyZ:'use',Escape:'back',KeyX:'back',Numpad0:'back',ShiftLeft:'action',ShiftRight:'action',ControlLeft:'special',ControlRight:'special',KeyA:'jumpup',PageUp:'jumpup',KeyS:'jumpdown',PageDown:'jumpdown',ArrowUp:'up',ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down'};
 const ALIAS:Record<Action|Direction,string>={use:'ok',back:'cancel',action:'shift',special:'control',jumpup:'pageup',jumpdown:'pagedown',up:'up',left:'left',right:'right',down:'down'};
 const LEGACY_KEY:Record<number,Action|Direction>={13:'use',32:'use',90:'use',27:'back',88:'back',96:'back',16:'action',17:'special',33:'jumpup',65:'jumpup',34:'jumpdown',83:'jumpdown',38:'up',37:'left',39:'right',40:'down'};
 const eventKey=(e:any):Action|Direction|undefined=>KEY[e.code]||LEGACY_KEY[e.keyCode];
 // A/S are adapter bindings for the specification's abstract JUMPUP/JUMPDOWN actions.
 G.Input.keyMapper[65]='pageup';G.Input.keyMapper[83]='pagedown';
 let nextRequest:OpenRequest|null=null,sequence=0,current:any=null,queuedScene:any=null,initializingScene:any=null;
 function presentationPending():boolean {const s=queuedScene,m=G.SceneManager;if(s&&s!==initializingScene){const stale=s._psQueuedApp&&(s._psQueuedApp!==flow()._app||s._psQueuedGeneration!==s._psQueuedApp.stateGeneration),orphan=('_scene'in m)&&('_nextScene'in m)&&s!==m._scene&&s!==m._nextScene;if(stale||orphan){s._invalid=true;if(queuedScene===s)queuedScene=null;}}return !!nextRequest||!!queuedScene;}

 // Native inputs stop propagation before MZ sees their initial keydown. Keep that consumed action blocked
 // until the real keyup, including after the input or its entire scene has been removed.
 const nativeConsumed=new Map<string,Action|Direction>();
 // Only actual DOM keys enter this registry. Service/gamepad state is sampled separately each frame.
 const keyboardKeys=new Map<string,Action|Direction>();
 const physicalCode=(e:any)=>e.code||String(e.keyCode??e.key);
 document.addEventListener('keydown',(e:any)=>{const key=eventKey(e);if(key)keyboardKeys.set(physicalCode(e),key);});
 const nativeKey=(e:any):string=>e.code||(['Enter','Escape'].includes(e.key)?e.key:e.keyCode===13?'Enter':e.keyCode===27?'Escape':'');
 for(const method of ['isTriggered','isRepeated']){const original=G.Input[method];G.Input[method]=function(button:string){const key=button==='ok'?'use':['cancel','menu','escape'].includes(button)?'back':undefined;if(key)for(const consumed of nativeConsumed.values())if(consumed===key)return false;return original.call(this,button);};}
 document.addEventListener('keyup',(e:any)=>{nativeConsumed.delete(nativeKey(e));keyboardKeys.delete(physicalCode(e));});
 window.addEventListener('blur',()=>{nativeConsumed.clear();keyboardKeys.clear();if(current){current.physical.clear();for(const key of Object.keys(ALIAS))current.latch.release(key);}});
 const debugFrames:any[]=[];
 let inventorySampleFrame=-1,inventorySample:InputFrame={pressed:{},triggered:{},repeated:{}};
 const inventoryDomStarts=new Map<Action|Direction,number>();
 function inventoryInputFrame():InputFrame {
  const frame=G.Graphics.frameCount??0;
  if(frame!==inventorySampleFrame){
   inventorySampleFrame=frame;const sample:InputFrame={pressed:{},triggered:{},repeated:{}},dom=new Set([...keyboardKeys.values(),...nativeConsumed.values()]);
   for(const key of Object.keys(ALIAS)as(Action|Direction)[]){
    const was=inventoryDomStarts.has(key);if(dom.has(key)&&!was)inventoryDomStarts.set(key,frame);else if(!dom.has(key))inventoryDomStarts.delete(key);
    const edge=dom.has(key)&&!was,age=frame-(inventoryDomStarts.get(key)??frame),repeat=edge||dom.has(key)&&age>=(G.Input.keyRepeatWait??24)&&(age-(G.Input.keyRepeatWait??24))%(G.Input.keyRepeatInterval??6)===0;
    sample.pressed[key]=dom.has(key)||G.Input.isPressed(ALIAS[key]);
    if(['up','left','right','down'].includes(key))sample.repeated[key as Direction]=repeat||G.Input.isRepeated(ALIAS[key]);else sample.triggered[key as Action]=edge||G.Input.isTriggered(ALIAS[key]);
   }
   if(G.TouchInput.isCancelled())sample.triggered.back=true;inventorySample=sample;
  }
  return {pressed:{...inventorySample.pressed},triggered:{...inventorySample.triggered},repeated:{...inventorySample.repeated}};
 }
 function record(data:any){debugFrames.push(data);if(debugFrames.length>256)debugFrames.shift();}
 function open(request:OpenRequest):boolean {if(current||presentationPending())return false;nextRequest=request;try{G.SceneManager.push(Scene_PSManagement);return true;}catch(error){if(nextRequest===request)nextRequest=null;presentationPending();throw error;}}
 function boxTitle(s:ManagementSnapshot,box:number):string{return s.storage.boxes[box]?.name||tr('box',{n:box+1});}
 const ui:any=W.PSManagement={
  openParty:()=>open({kind:'party'}),openStorage:()=>open({kind:'pc'}),openSummary:(id:string)=>open({kind:'summary',id}),
  selectMember:(qualifier:(m:Member)=>boolean,done:(result:any)=>void)=>open({kind:'selector',qualifier,done}),
  openReceiving:(done?:(result:any)=>void)=>open({kind:'receiving',done}),
  presentationPending,
  replaceBattleWithReceiving:()=>{if(current||presentationPending())return false;nextRequest={kind:'receiving'};G.SceneManager.goto(Scene_PSManagement);return true;},
  current:()=>current&&!current.closed&&current.top()?{token:current.token,generation:current.generation,ready:current.ready,text:[...current.renderedText],view:{...current.top(),items:current.top().items?.map((x:MenuItem)=>({key:x.key,label:x.label,enabled:x.enabled}))},heldId:current.snapshot?.held?.id??null,frames:[...debugFrames]}:null,
  inputFrame:inventoryInputFrame,
  hasBoxLink:()=>app().hasBoxLink?.()??false, // default reads authoritative inventory; explicit developer override stays process-local
  retryReceiving:()=>{if(!app().pendingReceiving)return false;return open({kind:'receiving'});},
 };
 class Controller {
  scene:any;window:any;request:OpenRequest;application:any;token='';generation:number;ready=false;started=false;closed=false;frame=0;serial=0;
  renderedText:string[]=[];snapshot!:ManagementSnapshot;stack:View[]=[];latch=new InputLatch();physical=new Set<Action|Direction>();input:any=null;composition=false;error='';qualified=new Set<string>();
  storageQuick=false;inventoryChild:any=null;
  reception:any=null;decisions:Record<string,ReceivingDecision>={};receiveIndex=0;readonly=false;completion:any=null;
  onKeyDown=(e:any)=>{const key=eventKey(e);if(key)this.physical.add(key);};
  // keyup clears only its DOM source. The next merged frame releases the latch after gamepad polling.
  onKeyUp=(e:any)=>{const key=eventKey(e);if(key&&!Array.from(keyboardKeys.values()).includes(key)&&!Array.from(nativeConsumed.values()).includes(key)){this.physical.delete(key);}};
  constructor(scene:any,request:OpenRequest){this.scene=scene;this.request=request;this.application=app();this.generation=this.application.stateGeneration;this.token='ui:'+this.generation+':'+(++sequence);}
  valid(){try{return !this.closed&&this.application===app()&&this.generation===this.application.stateGeneration&&current===this;}catch{return false;}}
  top():View{return this.stack[this.stack.length-1]!;}
  refresh(){this.snapshot=this.reception&&app().pendingReceiving?.token===this.reception.token?app().previewReceiving(this.reception.token,this.decisions,this.receiveIndex):app().managementSnapshot(this.readonly?undefined:this.managementToken);for(const view of this.stack)if(view.kind==='party'&&view.cursor!==6&&view.cursor>=this.snapshot.party.length)view.cursor=this.snapshot.party.length?this.snapshot.party.length-1:6;this.draw();}
  managementToken='';
  start(win:any){
   const manager=G.SceneManager;
   // Window/attachment hooks may have loaded another game or queued a replacement after construction.
   // Do not acquire a token from that new game on behalf of this old presenter.
   if(this.closed||this.application!==flow()._app||this.generation!==this.application.stateGeneration||
    ('_scene'in manager&&manager._scene!==this.scene)||manager._nextScene&&manager._nextScene!==this.scene){this.closed=true;this.scene._invalid=true;return;}
   this.window=win;this.started=false;current=this;
   for(const key of keyboardKeys.values())this.physical.add(key);
   document.addEventListener('keydown',this.onKeyDown);document.addEventListener('keyup',this.onKeyUp);
   if(this.request.kind==='receiving'){
    this.readonly=true;this.reception=app().pendingReceiving;if(!this.reception){this.close(null);return;}
    this.snapshot=app().managementSnapshot();this.nextReceive();
   }else{
    this.managementToken=app().beginManagement();this.snapshot=app().managementSnapshot(this.managementToken);
    if(this.request.kind==='selector'){this.readonly=true;for(const m of this.snapshot.party)if(this.request.qualifier?.(structuredClone(m)))this.qualified.add(m.id);}
    this.stack=[{kind:this.request.kind==='pc'?'pc':'party',cursor:0,selecting:this.request.kind==='selector'}];
    if(this.request.kind==='summary'){const id=this.request.id!,m=this.find(id);if(!m)throw Error('unknown-member');this.stack=[];this.summary([id],0);}
    if(this.request.kind==='pc')this.pc();
   }
   this.boundary();this.draw();this.started=true;
  }
  resetInitialization(){
   this.ready=false;this.started=false;this.stack=[];this.removeInput();
   document.removeEventListener('keydown',this.onKeyDown);document.removeEventListener('keyup',this.onKeyUp);
   if(this.managementToken&&this.generation===this.application.stateGeneration){this.application.manage(this.managementToken,'cleanup-'+(++this.serial),{kind:'cancel-held'});this.application.endManagement(this.managementToken);}
   this.managementToken='';
  }
  boundary(){this.ready=false;this.frame=G.Graphics.frameCount??this.frame;this.latch.arm(Object.fromEntries((Object.keys(ALIAS)as(Action|Direction)[]).map(k=>[k,this.physical.has(k)||G.Input.isPressed(ALIAS[k])])));G.Input.clear();G.TouchInput.clear();record({token:this.token,event:'boundary',frame:this.frame,view:this.top()?.kind,pressed:[...this.physical]});}
  push(view:View){this.stack.push(view);this.error='';this.boundary();this.draw();}
  back(){if(this.stack.length>1){const previous=this.stack.pop()!;this.error='';this.boundary();this.refresh();if(previous.kind==='summary'&&!previous.held){const parent=this.top(),id=previous.ids[previous.cursor],ref=this.snapshot.references[id];if(ref?.position.kind==='box'&&parent.kind==='box'){parent.box=ref.position.box;parent.cursor=ref.position.slot;}else if(ref?.position.kind==='party'&&['party','panel'].includes(parent.kind))parent.cursor=ref.position.index;this.draw();}}else this.close(null);}
  dismiss(){if(this.stack.length>1)this.back();else {this.stack.pop();this.error='';this.boundary();}}
  find(id:string):Member|null{return this.snapshot.held?.id===id?this.snapshot.held:this.snapshot.party.find(m=>m.id===id)??this.snapshot.storage.boxes.flatMap(b=>b.slots).find(m=>m?.id===id)??this.reception?.members.find((m:Member)=>m.id===id)??null;}
  reference(id:string):MemberReference {const ref=this.snapshot.references[id];if(!ref)throw Error('stale-source');return structuredClone(ref);}
  operate(request:ManagementRequest):boolean {
   if(!this.valid()||this.readonly){this.fail('read-only');return false;}
   const out=app().manage(this.managementToken,'ui-'+(++this.serial),request);record({token:this.token,event:'operation',kind:request.kind,status:out.status,reason:out.reason});
   if(out.status==='refused'){this.fail(out.reason||out.error);return false;}this.refresh();return true;
  }
  fail(reason:string){this.error=tr('refused',{reason:String(reason)});G.SoundManager.playBuzzer();this.draw();}
  menu(title:string,items:MenuItem[],cursor=0,cancel?:()=>void){this.push({kind:'menu',title,items,cursor,cancel});}
  confirm(title:string,yes:()=>void,defaultYes=false,no?:()=>void){this.menu(title,[{key:'yes',label:tr('yes'),run:()=>{this.dismiss();yes();}},{key:'no',label:tr('no'),run:()=>{this.dismiss();no?.();}}],defaultYes?0:1,()=>{this.dismiss();no?.();});}
  pc(){
   const able=this.snapshot.party.filter(m=>!m.isEgg&&m.hp>0).length;
   this.stack=[];this.menu(tr('pc'),[
    {key:'organize',label:tr('organize'),run:()=>this.storage('organize')},
    {key:'withdraw',label:tr('withdraw'),enabled:this.snapshot.party.length<this.snapshot.limits.party,run:()=>this.storage('withdraw')},
    {key:'deposit',label:tr('deposit'),enabled:able>1,run:()=>this.storage('deposit')},
    {key:'close',label:tr('close'),run:()=>this.close(null)}],0,()=>this.close(null));
  }
  storage(mode:string){this.storageQuick=false;this.push({kind:mode==='deposit'?'panel':'box',cursor:0,mode,box:this.snapshot.storage.currentBox});}
  boxLink(){const v=this.top();return boxLinkAvailable(ui.hasBoxLink?.(),G.$gameSwitches&&G.$dataSystem?.switches?.length>35?!!G.$gameSwitches.value(35):undefined,G.$dataMap?.meta?!!G.$dataMap.meta.DisableBoxLink:undefined,v.quick===true);}
  nameInput(title:string,value:string,max:number,escapeEmpty:boolean,done:(value:string|null)=>void){
   const view:View={kind:'text',cursor:0,title,max,done,escapeEmpty};this.push(view);
   const element=document.createElement('input');this.input=element;element.type='text';element.value=value;element.setAttribute('aria-label',title);
   Object.assign(element.style,{position:'fixed',left:'15%',top:'40%',width:'70%',fontSize:'24px',zIndex:'99999',background:'#fff',color:'#111',padding:'12px'});document.body.appendChild(element);
   const token=this.token,finish=(text:string|null)=>{if(!this.valid()||this.token!==token||this.top()!==view||this.composition)return;this.removeInput();this.dismiss();done(text===null?null:Array.from(text).slice(0,max).join(''));};
   element.addEventListener('compositionstart',()=>{if(this.valid())this.composition=true;});element.addEventListener('compositionend',()=>{if(this.valid())this.composition=false;});
   element.addEventListener('keydown',(e:any)=>{e.stopPropagation();if(!this.valid()||e.isComposing||this.composition||e.keyCode===229)return;if(e.key==='Enter'||e.key==='Escape'){const key=e.key==='Enter'?'use':'back';nativeConsumed.set(nativeKey(e),key);this.physical.add(key);e.preventDefault();finish(e.key==='Enter'?element.value:escapeEmpty?'':null);}});element.focus();
  }
  removeInput(){this.input?.remove();this.input=null;this.composition=false;}
  summary(ids:(string|null)[],index:number,held=false){this.push({kind:'summary',cursor:index,ids,page:0,held,detail:null,selected:null,detailCursor:0});}
  marking(id:string,summary:boolean){const m=this.find(id);if(m)this.push({kind:'marks',cursor:0,id,marks:[...(m.markings??[])],original:[...(m.markings??[])],summary});}
  memberMenu(id:string){
   const v=this.top(),m=this.find(id);if(!m)return;const held=this.snapshot.held?.id===id,source=()=>this.reference(id),items:MenuItem[]=[{key:'summary',label:tr('summary'),run:()=>{this.back();const ids=held?[id]:v.kind==='box'?this.snapshot.storage.boxes[v.box]!.slots.map(m=>m?.id??null):this.snapshot.party.map(m=>m.id);this.summary(ids,ids.indexOf(id),held);}}];
   if(!this.readonly){
    if(v.kind==='party')items.push({key:'switch',label:tr('switch'),enabled:this.snapshot.party.length>1,run:()=>{this.back();v.switchSource=source();v.quick=false;this.boundary();this.draw();}});
    if(v.mode==='organize')items.push({key:held?'place':'pick',label:tr(held?'store':'switch'),run:()=>{this.back();if(!held)this.operate({kind:'pick-up',source:source()});}});
    if(v.kind!=='party')items.push({key:'transfer',label:tr(v.kind==='panel'?'store':'withdraw'),run:()=>{this.back();if(held)this.operate({kind:v.kind==='panel'?'store-held':'withdraw-held'});else {let target:MemberPosition|undefined;if(v.kind==='panel'){for(let b=0;b<40&&!target;b++){const slot=this.snapshot.storage.boxes[(this.snapshot.storage.currentBox+b)%40]!.slots.findIndex(x=>!x);if(slot>=0)target={kind:'box',box:(this.snapshot.storage.currentBox+b)%40,slot};}}else target={kind:'party',index:this.snapshot.party.length};if(target)this.operate({kind:'move',source:source(),target,expectedTargetId:null});else this.fail('boxes-full');}}});
    items.push({key:'item',label:tr('item'),enabled:!m.isEgg,run:()=>{this.back();this.itemMenu(id);}},
     {key:'mark',label:tr('mark'),run:()=>{this.back();this.marking(id,false);}});
    if(v.kind!=='party')items.push({key:'release',label:tr('release'),enabled:!m.isEgg&&!m.mail&&!m.cannotRelease,run:()=>{this.back();this.refresh();const target=this.find(id);if(!held&&this.snapshot.references[id]?.position.kind==='party'&&target&&!target.isEgg&&target.hp>0&&!this.snapshot.party.some(other=>other.id!==id&&!other.isEgg&&other.hp>0)){this.fail(tr('lastAble'));return;}this.confirm(tr('confirmRelease',{name:memberName(m)}),()=>this.confirm(tr('confirmRelease2',{name:memberName(m)}),()=>{this.operate(held?{kind:'release-held',confirmed:true}:{kind:'release',source:source(),confirmed:true});}));}});
   }
   items.push({key:'cancel',label:tr('cancel'),run:()=>this.back()});this.menu(memberName(m),items);
  }
  itemMenu(id:string){const m=this.find(id);if(!m)return;const source=this.reference(id);this.menu(tr('item'),[
   {key:'use',label:tr('use'),enabled:!!W.PSInventory&&source.position.kind==='party'&&!m.isEgg&&!this.snapshot.held,run:()=>{this.back();this.inventoryChild=W.PSInventory.attach(this.window,{token:this.managementToken,memberId:id},()=>{this.inventoryChild=null;if(this.valid()){this.boundary();this.refresh();}});}},
   {key:'give',label:tr('give'),enabled:this.snapshot.heldSourcesEnabled&&!m.isEgg,run:()=>{this.back();const items=app().holdableBagItems().map((it:any)=>({key:it.id,label:it.id+' ×'+it.count,run:()=>{this.back();if(m.item)this.confirm(tr('give')+' '+it.id+' → '+memberName(m),()=>this.operate({kind:'give-item',source,item:it.id}));else this.operate({kind:'give-item',source,item:it.id});}}));this.menu(tr('give'),[...items,{key:'cancel',label:tr('cancel'),run:()=>this.back()}]);}},
   {key:'take',label:tr('take'),enabled:!!m.item&&!m.mail,run:()=>{this.back();this.operate({kind:'take-item',source});}},
   {key:'move',label:tr('move'),enabled:this.snapshot.heldSourcesEnabled&&!!m.item&&!m.mail,run:()=>{this.back();const v=this.top();v.itemSource={source,item:m.item};this.boundary();this.draw();}},
   {key:'cancel',label:tr('cancel'),run:()=>this.back()}]);if(!this.snapshot.heldSourcesEnabled)this.error=tr('sourceOff');this.draw();}
  switchBox(delta:number){const v=this.top(),box=(v.box+delta+40)%40;if(this.operate({kind:'current-box',box})){v.box=box;this.boundary();this.draw();}}
  boxMenu(){const v=this.top(),box=v.box;this.menu(boxTitle(this.snapshot,box),[
   {key:'jump',label:tr('box'),run:()=>{this.back();this.menu(tr('box'),this.snapshot.storage.boxes.map((_,n)=>({key:String(n),label:boxTitle(this.snapshot,n),run:()=>{this.back();if(this.operate({kind:'current-box',box:n})){v.box=n;this.draw();}}})),box);}},
   {key:'name',label:tr('boxName'),run:()=>{this.back();this.nameInput(tr('boxName'),this.snapshot.storage.boxes[box]!.name,12,false,text=>{if(text)this.operate({kind:'box-name',box,name:text});});}},
   {key:'wallpaper',label:tr('wallpaper'),run:()=>{this.back();const ids=Array.from({length:16},(_,i)=>i).concat(this.snapshot.storage.unlockedWallpapers);this.menu(tr('wallpaper'),ids.map(n=>({key:String(n),label:tr('wallpaper')+' '+(n+1),run:()=>{this.back();this.operate({kind:'wallpaper',box,wallpaper:n});}})));}},
   {key:'search',label:tr('search'),run:()=>{this.back();this.searchMenu({});}},
   {key:'cancel',label:tr('cancel'),run:()=>this.back()}]);}
  searchMenu(filters:StorageSearch){this.menu(tr('search'),[
   {key:'text',label:tr('query')+': '+(filters.text||tr('all')),run:()=>{this.back();this.nameInput(tr('query'),filters.text||'',80,false,text=>{if(text!==null)filters.text=text;this.searchMenu(filters);});}},
   {key:'form',label:tr('form')+': '+(filters.form??tr('all')),run:()=>{this.back();this.nameInput(tr('formFilter'),filters.form==null?'':String(filters.form),3,false,text=>{if(text!==null){if(text===''||/^\d{1,3}$/.test(text))filters.form=text===''?null:Number(text);else this.fail('invalid-search-form');}this.searchMenu(filters);});}},
   {key:'marks',label:tr('marksFilter'),run:()=>{this.back();this.menu(tr('marksFilter'),Array.from({length:6},(_,i)=>({key:String(i),label:tr('mark')+' '+(i+1),run:()=>{this.back();this.menu(tr('mark'),[0,1,2].map(n=>({key:String(n),label:String(n),run:()=>{this.back();filters.markings=[{index:i,value:n}];this.searchMenu(filters);}})));}})));}},
   {key:'clear',label:tr('clear'),run:()=>{this.back();this.searchMenu({});}},
   {key:'find',label:tr('find'),run:()=>{this.back();const found=app().searchStorage(filters,(m:Member)=>flow().speciesName(m.species,m.form));this.push({kind:'results',cursor:0,filters,matches:found});}},
   {key:'cancel',label:tr('cancel'),run:()=>this.back()}]);}
  nextReceive(){
   if(!this.valid())return;const members:Member[]=this.reception.members;
   try{this.snapshot=app().previewReceiving(this.reception.token,this.decisions,this.receiveIndex);}catch(e){this.receiveIndex=Math.max(0,this.receiveIndex-1);this.snapshot=app().previewReceiving(this.reception.token,this.decisions,this.receiveIndex);this.error=String(e);}
   if(this.receiveIndex>=members.length){this.resolveReceive();return;}
   const m=members[this.receiveIndex]!;this.stack=[];
   const place=()=>this.receivePlacement(m);
   if(this.reception.profile.naming===0&&!this.decisions[m.id]?.nickname){this.confirm(tr('rename',{name:memberName(m)}),()=>this.nameInput(tr('rename',{name:memberName(m)}),m.nickname||'',10,true,text=>{if(!this.valid())return;const value=text||'';this.decisions[m.id]={nickname:{kind:'set',value:value===flow().speciesName(m.species,m.form)||value===m.species?'':value}};place();}),false,()=>{this.decisions[m.id]={nickname:{kind:'keep'}};place();});}
   else {this.decisions[m.id]??={nickname:{kind:'keep'}};place();}
  }
  receivePlacement(m:Member){
   this.stack=[];const count=this.snapshot.party.length,profile=this.reception.profile;
   if(count<this.snapshot.limits.party||profile.mode===1){this.receiveIndex++;this.nextReceive();return;}
   this.menu(tr('receiving',{name:memberName(m)}),[
    {key:'party',label:tr('join'),run:()=>{this.push({kind:'party',cursor:0,receiveReplace:m.id});}},
    ...(profile.mode===2?[]:[{key:'box',label:tr('sendBox'),run:()=>this.receiveChoice(m.id,{kind:'box'})}]),
    {key:'summary',label:tr('summary'),run:()=>this.summary([m.id],0,true)},
    {key:'party-view',label:tr('party'),run:()=>this.push({kind:'party',cursor:0,receiveView:true})}],0,()=>{if(profile.mode===2){G.SoundManager.playBuzzer();this.draw();}else this.receiveChoice(m.id,{kind:'box'});});
  }
  receiveChoice(id:string,placement:ReceivingDecision['placement']){this.decisions[id]={...this.decisions[id],placement};this.receiveIndex++;this.nextReceive();}
  resolveReceive(){const token=this.reception.token,result=flow().resolveReceiving(token,this.decisions);if(!this.valid())return;if(result?.continuationToken){this.completion=result;this.close(result);return;}if(pending(result)||result.status==='refused'){this.stack=[];this.menu(tr('saveFailed'),[{key:'retry',label:tr('recover'),run:()=>this.resolveReceive()}]);this.fail(result.reason||result.error||'pending');return;}const ids=this.reception.members.map((m:Member)=>m.id);for(const decision of Object.values(this.decisions))if(decision.placement?.kind==='replace')ids.push(decision.placement.target.id);try{flow().notifyReceived?.(ids,result.battleId??token);}catch(e){console.error(NAME,'committed placement message failed',e);}this.completion=result;this.close(result);}
  update(){
   if(!this.valid()){if(!this.closed){this.closed=true;this.removeInput();this.scene._invalid=true;}return;}
   if(this.inventoryChild){this.inventoryChild.update();return;}
   if(!this.top()||!this.started||this.top()?.kind==='text')return;
   const frame=G.Graphics.frameCount??++this.frame;if(!this.ready&&(frame<=this.frame||G.SceneManager.isSceneChanging()))return;
   const sample:InputFrame={repeated:{},triggered:{},pressed:{}};
   for(const key of Object.keys(ALIAS)as(Action|Direction)[]){sample.pressed[key]=this.physical.has(key)||G.Input.isPressed(ALIAS[key]);if(['up','left','right','down'].includes(key))sample.repeated[key as Direction]=G.Input.isRepeated(ALIAS[key]);else sample.triggered[key as Action]=G.Input.isTriggered(ALIAS[key]);}
   if(G.TouchInput.isCancelled())sample.triggered.back=true;
   const filtered=this.latch.filter(sample); // Observe release on the first ready frame, but never act on it.
   if(!this.ready){this.ready=true;record({token:this.token,event:'ready',frame,view:this.top()?.kind});return;}
   const v=this.top(),intent=inputIntent(filtered,v.kind==='box'?'box':v.kind==='panel'?'panel':v.kind==='marks'?v.summary?'mark-summary':'mark-storage':'ordinary',v.mode==='organize');
   if(!intent.direction&&!intent.action)return;record({token:this.token,event:'input',frame,view:v.kind,cursor:v.cursor,...intent});
   try{if(intent.direction)this.direction(intent.direction);if(this.top()===v&&this.ready&&intent.action)this.action(intent.action);this.draw();}catch(e){try{this.fail(String(e));}catch(drawError){this.scene.rebuildFailed(drawError);}}
  }
  direction(dir:Direction){const v=this.top();
   if(v.kind==='menu'||v.kind==='results'){const n=v.kind==='menu'?v.items.length:v.matches.length;v.cursor=n?(v.cursor+(dir==='up'||dir==='left'?-1:1)+n)%n:0;}
   else if(v.kind==='party'){v.cursor=partyCursor(v.cursor,dir,this.snapshot.party.map((_,i)=>i));}
   else if(v.kind==='panel')v.cursor=panelCursor(v.cursor,dir);
   else if(v.kind==='box'){const result=boxCursor(v.cursor,dir);v.cursor=result.cursor;if(result.boxDelta)this.switchBox(result.boxDelta);}
   else if(v.kind==='marks')v.cursor=markCursor(v.cursor,dir);
   else if(v.kind==='summary'){
    const m=this.find(v.ids[v.cursor]);if(!m)return;
    if(v.detail==='moves'){const n=m.moves.length;if(n)v.detailCursor=(v.detailCursor+(dir==='up'||dir==='left'?-1:1)+n)%n;}
    else if(v.detail==='ribbons')v.detailCursor=ribbonCursor(v.detailCursor,dir,m.ribbons?.length??0);
    else if(dir==='left'||dir==='right'){v.page=Math.min(m.isEgg?0:4,Math.max(0,v.page+(dir==='left'?-1:1)));}
    else if(!v.held){const occupied=v.ids.map((id:string|null,i:number)=>id&&this.find(id)&&(!v.page||!this.find(id)?.isEgg)?i:-1).filter((n:number)=>n>=0);v.cursor=summaryCursor(v.cursor,dir as 'up'|'down',occupied);}
   }
  }
  action(action:Action){const v=this.top();
   if(v.kind==='menu'){if(action==='back'){if(v.cancel)v.cancel();else this.back();}else if(action==='use'){const it=v.items[v.cursor];if(it?.enabled!==false)it?.run();else this.fail(it.key==='give'||it.key==='move'?tr('sourceOff'):'unavailable');}return;}
   if(v.kind==='results'){if(action==='back'){this.back();return;}if(action==='use'){const hit=v.matches[v.cursor];if(!hit)return;this.refresh();const ref=this.snapshot.references[hit.id];if(!ref||JSON.stringify(ref.position)!==JSON.stringify(hit.position)){this.fail('stale-source');return;}this.back();const boxView=[...this.stack].reverse().find(x=>x.kind==='box');if(boxView){boxView.box=hit.position.box;boxView.cursor=hit.position.slot;this.operate({kind:'current-box',box:hit.position.box});}}return;}
   if(v.kind==='marks'){if(action==='back'){this.back();return;}if(action==='action'){v.marks=editMark(v.marks,v.cursor,true);return;}if(action==='use'){if(v.cursor===7){this.back();return;}if(v.cursor===6){const changed=JSON.stringify(v.marks)!==JSON.stringify(v.original);if(changed)this.operate({kind:'markings',source:this.reference(v.id),markings:v.marks});this.back();}else v.marks=editMark(v.marks,v.cursor,false);}return;}
   if(v.kind==='summary'){this.summaryAction(action);return;}
   if(v.kind==='party'){
    if(action==='special'&&this.boxLink()&&!this.readonly){this.storage('organize');return;}
    if(action==='back'){if(v.switchSource||v.itemSource){v.switchSource=null;v.itemSource=null;this.boundary();return;}this.back();return;}
    if(action==='action'){if(v.quick){v.switchSource=null;v.quick=false;this.boundary();}else if(!v.switchSource&&!this.readonly&&this.snapshot.party[v.cursor]){v.switchSource=this.reference(this.snapshot.party[v.cursor]!.id);v.quick=true;this.boundary();}return;}
    if(action!=='use')return;if(v.cursor===6){this.back();return;}const m=this.snapshot.party[v.cursor];if(!m)return;
    if(v.receiveReplace){this.receiveChoice(v.receiveReplace,{kind:'replace',target:this.reference(m.id)});return;}
    if(v.selecting){if(!this.qualified.has(m.id)){this.fail('not-qualified');return;}this.close({id:m.id,index:v.cursor});return;}
    if(v.receiveView){this.summary(this.snapshot.party.map(m=>m.id),v.cursor);return;}
    if(v.switchSource){const source=v.switchSource;v.switchSource=null;v.quick=false;this.operate({kind:'move',source,target:{kind:'party',index:v.cursor},expectedTargetId:m.id});return;}
    if(v.itemSource){this.itemTarget(v,m);return;}this.memberMenu(m.id);return;
   }
   if(v.kind==='box'||v.kind==='panel'){
    if(action==='jumpup'||action==='jumpdown'){if(v.kind==='box')this.switchBox(action==='jumpup'?-1:1);return;}
    if(action==='special'){if(v.kind==='box')v.cursor=-1;return;}
    if(action==='action'&&v.mode==='organize'){this.storageQuick=!this.storageQuick;this.boundary();return;}
    if(action==='back'){if(this.snapshot.held){this.confirm(tr('cancelHeld'),()=>this.operate({kind:'cancel-held'}));return;}if(v.itemSource){v.itemSource=null;return;}if(v.kind==='panel'&&v.mode==='organize'){this.back();return;}this.confirm(tr('continue'),()=>{},true,()=>this.exitStorage());return;}
    if(v.kind==='box'&&v.cursor<0){if(action==='use'){if(v.cursor===-1)this.boxMenu();else if(v.cursor===-2){if(v.mode==='organize')this.push({kind:'panel',cursor:0,mode:v.mode,box:v.box});else this.error=tr('withdrawPrompt');}else if(this.snapshot.held)this.fail(tr('heldBlock'));else this.confirm(tr('exit'),()=>this.exitStorage());}return;}
    if(v.kind==='panel'&&v.cursor===6){if(action==='use')this.back();return;}
    const position:MemberPosition=v.kind==='box'?{kind:'box',box:v.box,slot:v.cursor}:{kind:'party',index:v.cursor};const m=v.kind==='box'?this.snapshot.storage.boxes[v.box]!.slots[v.cursor]:this.snapshot.party[v.cursor];
    if(action==='use'&&v.mode==='organize'&&this.storageQuick&&!v.itemSource){if(this.snapshot.held)this.operate({kind:'place-held',target:position,expectedTargetId:m?.id??null});else if(m)this.operate({kind:'pick-up',source:this.reference(m.id)});return;}
    if(action!=='use')return;if(v.itemSource&&m){this.itemTarget(v,m);return;}
    if(this.snapshot.held){const held=this.snapshot.held;this.menu(tr('held',{name:memberName(held)}),[
     {key:'place',label:tr('store'),run:()=>{this.back();this.operate({kind:'place-held',target:position,expectedTargetId:m?.id??null});}},
     {key:'summary',label:tr('summary'),run:()=>{this.back();this.summary([held.id],0,true);}},
     {key:'item',label:tr('item'),enabled:!held.isEgg,run:()=>{this.back();this.itemMenu(held.id);}},
     {key:'mark',label:tr('mark'),run:()=>{this.back();this.marking(held.id,false);}},
     {key:'transfer',label:tr(v.kind==='box'?'withdraw':'store'),run:()=>{this.back();this.operate({kind:v.kind==='box'?'withdraw-held':'store-held'});}},
     {key:'release',label:tr('release'),enabled:!held.isEgg&&!held.mail&&!held.cannotRelease,run:()=>{this.back();this.confirm(tr('confirmRelease',{name:memberName(held)}),()=>this.confirm(tr('confirmRelease2',{name:memberName(held)}),()=>this.operate({kind:'release-held',confirmed:true})));}},
     {key:'cancel',label:tr('cancel'),run:()=>this.back()}]);return;}
    if(m)this.memberMenu(m.id);return;
   }
  }
  itemTarget(v:View,m:Member){const old=v.itemSource;v.itemSource=null;const target=this.reference(m.id);this.confirm(tr('move')+' → '+memberName(m),()=>this.operate({kind:'swap-items',source:old.source,target,expectedSourceItem:old.item,expectedTargetItem:m.item}));}
  summaryAction(action:Action){const v=this.top(),m=this.find(v.ids[v.cursor]);if(!m)return;
   if(action==='back'){if(v.selected!==null){v.selected=null;return;}if(v.detail){v.detail=null;return;}this.back();return;}
   if(action==='action'&&!v.detail&&!this.readonly&&!m.isEgg){this.marking(m.id,true);return;}
   if(action!=='use'||m.isEgg)return;
   if(!v.detail){if(v.page===3){v.detail='moves';v.detailCursor=0;}else if(v.page===4){v.detail='ribbons';v.detailCursor=0;}return;}
   if(this.readonly)return;const list=v.detail==='moves'?m.moves:m.ribbons??[];
   if(v.selected===null){if(v.detailCursor<list.length)v.selected=v.detailCursor;return;}
   if(v.detail==='moves'&&v.detailCursor>=list.length)return;
   this.operate({kind:v.detail==='moves'?'sort-moves':'sort-ribbons',source:this.reference(m.id),from:v.selected,to:v.detailCursor});v.selected=null;
  }
  exitStorage(){if(this.snapshot.held){this.fail(tr('heldBlock'));return;}const at=this.stack.findIndex(v=>v.kind==='box'||v.kind==='panel');if(at>=0)this.stack.splice(at);if(!this.stack.length)this.close(null);else{this.boundary();this.refresh();}}
  close(result:any){
   if(!this.valid())return;if(this.snapshot?.held){this.fail(tr('heldBlock'));return;}
   if(this.reception&&app().pendingReceiving?.token===this.reception.token){this.fail('receiving-pending');return;}
   if(this.managementToken){const out=app().endManagement(this.managementToken);if(out.status==='refused'){this.fail(out.reason);return;}}
   this.closed=true;this.removeInput();this.completion=result;this.scene._result=result;this.scene._done=this.request.done;
   if(G.SceneManager._scene===this.scene)this.scene.popScene();
  }
  dispose(){this.inventoryChild?.close({status:'cancelled'},true);this.inventoryChild=null;document.removeEventListener('keydown',this.onKeyDown);document.removeEventListener('keyup',this.onKeyUp);this.removeInput();
   if(!this.closed&&this.application===flow()._app&&this.generation===this.application.stateGeneration){if(this.managementToken){this.application.manage(this.managementToken,'cleanup-'+(++this.serial),{kind:'cancel-held'});this.application.endManagement(this.managementToken);}else if(this.reception&&this.application.pendingReceiving?.token===this.reception.token){const result=flow().resolveReceiving(this.reception.token,this.decisions,'scene-aborted');this.completion=result;if(!pending(result)&&result.status!=='refused'){this.scene._result=result;this.scene._done=this.request.done;}}}
   this.closed=true;if(current===this)current=null;
  }
  draw(){
   if(this.inventoryChild){this.inventoryChild.draw();return;}
   if(!this.window||!this.top())return;const win=this.window,b=win.contents,v=this.top(),w=b.width,h=b.height; b.clear();b.fontFace=flow().translator().font()||'sans-serif';b.fontSize=20;
   this.renderedText=[];const text=(s:any,x:number,y:number,width=w-x,color='#fff')=>{this.renderedText.push(String(s??''));b.textColor=color;b.drawText(String(s??''),x,y,width,28,'left');};
   const cell=(x:number,y:number,cw:number,ch:number,label:string,selected=false,color='#24334b')=>{b.fillRect(x,y,cw,ch,selected?(this.storageQuick&&['box','panel'].includes(v.kind)?'#896f3e':'#587da2'):color);text(label,x+7,y+5,cw-14);};
   const title=v.title||tr(v.kind==='panel'?'party':v.kind==='box'?v.mode:v.kind==='marks'?'mark':v.kind==='results'?'search':v.kind==='text'?'name':v.kind==='summary'?'summary':'party');text(title,4,0);
   if(v.kind==='menu'){const start=Math.max(0,v.cursor-12);for(let i=start;i<Math.min(v.items.length,start+14);i++){const it=v.items[i];cell(12,38+(i-start)*31,w-24,29,(it.enabled===false?'× ':'')+it.label,i===v.cursor,it.enabled===false?'#333':'#24334b');}}
   else if(v.kind==='party'||v.kind==='panel'){
    for(let i=0;i<6;i++){const m=this.snapshot.party[i],view=m?app().describeIndividual(m.id):null,x=(i%2)*w/2,y=42+Math.floor(i/2)*111;
     cell(x+4,y,w/2-8,103,m?memberName(m):tr('empty'),i===v.cursor,v.selecting&&m&&!this.qualified.has(m.id)?'#3b3b3b':'#24334b');if(m){text('Lv.'+m.level+' '+m.gender+(m.isEgg?' '+tr('egg'):'')+(m.shiny?' ★':''),x+12,y+31,w/2-24);text(m.isEgg?'—':`${m.hp}/${view?.stats?.hp??'?'} HP  ${m.status||''}`,x+12,y+58,w/2-24);text(m.item?'◆ '+m.item:'',x+12,y+78,w/2-24,'#ffe29a');if(!m.isEgg){const ratio=Math.min(1,Math.max(0,m.hp/(view?.stats?.hp||1)));b.fillRect(x+w/2-115,y+63,98,5,'#111');b.fillRect(x+w/2-115,y+63,98*ratio,5,ratio>0.5?'#7de385':ratio>0.2?'#f6d563':'#ee7777');}}}
    cell(4,382,w-8,34,tr('cancel'),v.cursor===6);if(v.switchSource)text(tr('switchTarget'),5,420);if(v.itemSource)text(tr('itemTarget'),5,420);text(tr('box',{n:this.snapshot.storage.boxes.reduce((n,b)=>n+b.slots.filter(Boolean).length,0)})+' / 1200  · '+tr('party')+' '+this.snapshot.party.length,5,449);text(Object.entries(this.snapshot.bag).map(([k,n])=>flow().translator().tOr('item.name.'+k,k)+' ×'+n).join(' / ')+'  '+flow().translator().t('ui.partyview.money',{money:this.snapshot.money}),5,477);
   }else if(v.kind==='box'){
    const box=this.snapshot.storage.boxes[v.box]!,color='hsl('+((box.wallpaper*137.508)%360)+',25%,22%)';b.fillRect(0,34,w,375,color);cell(4,35,w-8,34,'◀ '+boxTitle(this.snapshot,v.box)+' ▶  '+(v.box+1)+'/40',v.cursor===-1);
    const cw=w/6;for(let i=0;i<30;i++){const m=box.slots[i],x=(i%6)*cw,y=78+Math.floor(i/6)*60;cell(x+3,y,cw-6,55,m?memberName(m):'·',i===v.cursor);if(m){b.fontSize=14;text('Lv.'+m.level+(m.isEgg?' '+tr('egg'):'')+(m.shiny?' ★':''),x+8,y+26,cw-16);b.fontSize=20;}}
    cell(4,385,w/2-8,34,tr('party'),v.cursor===-2);cell(w/2+4,385,w/2-8,34,tr('close'),v.cursor===-3);
   }else if(v.kind==='summary'){this.drawSummary(v,text,cell,w);}
   else if(v.kind==='marks'){for(let i=0;i<6;i++)cell((i%3)*w/3+4,72+Math.floor(i/3)*58,w/3-8,52,['●','■','▲','♥','★','◆'][i]+' '+(v.marks[i]??0),v.cursor===i);cell(4,220,w/2-8,34,tr('ok'),v.cursor===6);cell(w/2+4,220,w/2-8,34,tr('cancel'),v.cursor===7);}
   else if(v.kind==='results'){const start=Math.max(0,v.cursor-11);if(!v.matches.length)text(tr('noResults'),8,50);for(let i=start;i<Math.min(v.matches.length,start+13);i++){const hit=v.matches[i];cell(4,38+(i-start)*30,w-8,28,memberName(hit.member)+' · '+boxTitle(this.snapshot,hit.position.box)+' / '+(hit.position.slot+1),i===v.cursor);}}
   else if(v.kind==='text')text(tr('textHelp'),8,100);
   if(this.snapshot?.held)text(tr('held',{name:memberName(this.snapshot.held)}),4,h-84,w-8,'#ffe29a');
   b.fontSize=15;text(this.error||tr('help'),4,h-42,w-8,this.error?'#ffb5b5':'#ddd');
  }
  drawSummary(v:View,text:any,cell:any,w:number){const m=this.find(v.ids[v.cursor]);if(!m)return;const view:IndividualView=app().describeIndividual(m.id),pages=['info','memo','skills','moves','ribbons'];text(memberName(m)+'  Lv.'+m.level+' '+m.gender+(m.shiny?' ★':''),4,32);text(tr(pages[v.page]!)+' '+(v.page+1)+'/'+(m.isEgg?1:5),w-180,32,180,'#b8e3ff');
   const row=(label:string,value:any,n:number,color?:string)=>text(label+': '+value,8,88+n*30,w-16,color);const paragraph=(value:string,y:number,maxLines:number)=>{const old=this.window.contents.fontSize;this.window.contents.fontSize=17;let line='',n=0;for(const ch of Array.from(value)){if(this.window.textWidth(line+ch)>w-24&&line){text(line,8,y+n*23,w-16);line='';n++;if(n>=maxLines)break;}line+=ch;}if(n<maxLines&&line)text(line,8,y+n*23,w-16);this.window.contents.fontSize=old;};
   if(m.isEgg){row(tr('egg'),tr('unknown'),0);row(tr('owner'),m.owner?.name||tr('unknown'),1);row(tr('id'),view.publicId,2);row(tr('origin'),m.origin?.text||tr('unknown'),3);return;}
   if(v.page===0){row(tr('name'),flow().speciesName(m.species,m.form),0);row(tr('type'),view.types.join(' / ')||tr('unknown'),1);row(tr('owner'),m.owner?.name||tr('unknown'),2,m.owner?.gender===0?'#aabfff':m.owner?.gender===1?'#ffb0b0':undefined);row(tr('id'),view.publicId,3);row(tr('item'),m.item||tr('none'),4);row(tr('form'),m.form,5);row(tr('ball'),m.ball,6);row(tr('exp'),m.exp+' / '+(view.nextLevelExp===null?'—':Math.max(0,view.nextLevelExp-m.exp)),7);if(m.ownerCompatibilityDefault)row('',tr('compat'),8,'#ffe29a');if(view.nextLevelExp!==null&&view.currentLevelExp!==null){const ratio=Math.min(1,Math.max(0,(m.exp-view.currentLevelExp)/(view.nextLevelExp-view.currentLevelExp)));this.window.contents.fillRect(8,375,128,8,'#222');this.window.contents.fillRect(8,375,Math.floor(128*ratio/2)*2,8,'#66bdff');}}
   else if(v.page===1){row(tr('nature'),tr('nature.'+m.nature.toLowerCase()),0);row(tr('origin'),m.origin?.text||String(m.origin?.map??tr('unknown')),1);row(tr('level'),m.origin?.level??tr('unknown'),2);row(tr('date'),m.origin?.receivedAt==null?tr('unknown'):new Date(m.origin.receivedAt*1000).toISOString().slice(0,10),3);row(tr('hatch'),m.origin?.hatchedAt==null?tr('unknown'):new Date(m.origin.hatchedAt*1000).toISOString().slice(0,10),4);row(tr('friendship'),m.friendship,5);row(tr('characteristic'),tr('characteristic.'+view.characteristic.stat+'.'+view.characteristic.variant),6);row(tr('method'),m.origin?.method??tr('unknown'),7);}
   else if(v.page===2){for(const [i,key]of['hp','atk','def','spa','spd','spe'].entries()){const k=key as keyof typeof view.modifiers;row(tr(key),key==='hp'?`${m.hp}/${view.stats?.hp??'?'}`:view.stats?.[k]??'?',i,key!=='hp'&&(view.modifiers?.[k]??100)>100?'#ffb0b0':key!=='hp'&&(view.modifiers?.[k]??100)<100?'#aabfff':undefined);}row(tr('ability'),view.ability.name,6);paragraph(view.ability.description||tr('unavailable'),290,3);row(tr('exp'),m.exp+' / '+(view.nextLevelExp??'—'),10);}
   else if(v.page===3){if(!m.moves.length)row(tr('moves'),tr('none'),0);for(const [i,move]of view.moves.entries()){cell(6,76+i*48,w-12,44,move.name+'  '+move.pp+'/'+move.maxpp+' PP',v.detail==='moves'&&v.detailCursor===i);if(v.selected===i)text('↔',w-35,78+i*48,30,'#ffe29a');}const move=view.moves[v.detailCursor];if(move){row(tr('type'),move.type+' / '+move.category,7);row(tr('power'),(move.power??'—')+'   '+tr('accuracy')+': '+(move.accuracy||'—'),8);paragraph(move.description||tr('unavailable'),350,6);}}
   else {const ribbons=m.ribbons??[],start=Math.floor(v.detailCursor/12)*12;for(let i=0;i<12;i++){const n=start+i;cell((i%4)*w/4+3,80+Math.floor(i/4)*70,w/4-6,63,ribbons[n]||'·',v.detail==='ribbons'&&v.detailCursor===n);if(v.selected===n)text('↔',(i%4)*w/4+8,105+Math.floor(i/4)*70,30);}row(tr('ribbons'),ribbons.length,8);}
   if(view.diagnostics.length)text(tr('unavailable'),4,390,w-8,'#ffb5b5');
  }
 }
 function Window_PSManagement(this:any){this.initialize(...(arguments as any));}
 Window_PSManagement.prototype=Object.create(G.Window_Base.prototype);Window_PSManagement.prototype.constructor=Window_PSManagement;
 Window_PSManagement.prototype.initialize=function(rect:any){G.Window_Base.prototype.initialize.call(this,rect);this.activate();};
 function Scene_PSManagement(this:any){this.initialize(...(arguments as any));}
 Scene_PSManagement.prototype=Object.create(G.Scene_MenuBase.prototype);Scene_PSManagement.prototype.constructor=Scene_PSManagement;
 const P=Scene_PSManagement.prototype;
 P.initialize=function(){queuedScene=initializingScene=this;this._request=nextRequest||{kind:'party'};nextRequest=null;this._psQueuedApp=flow()._app;this._psQueuedGeneration=this._psQueuedApp?.stateGeneration;try{G.Scene_MenuBase.prototype.initialize.call(this);this._psParty=true;this._psManagement=true;}finally{if(initializingScene===this)initializingScene=null;}};
 P.createPresentation=function(){G.Scene_MenuBase.prototype.create.call(this);const win=new(Window_PSManagement as any)(new G.Rectangle(0,0,G.Graphics.boxWidth,G.Graphics.boxHeight));try{this.addWindow(win);}catch(error){win.parent?.removeChild(win);win.destroy?.();throw error;}this._window=win;};
 P.create=function(){if(this._invalid)return;try{this._controller=new Controller(this,this._request);}catch(e){this._creationFailure=e;}try{this.createPresentation();}catch(e){this._creationFailure=e;}};
 P.rebuildFailed=function(error:unknown){
  console.error(NAME,'management initialization/presentation failed',error);this._initialFailure=true;
  const c=this._controller;if(c){c.resetInitialization();
   if(c.application===flow()._app&&c.generation===c.application.stateGeneration&&c.request.kind==='receiving'){
    const reception=c.application.pendingReceiving;if(reception){const out=flow().resolveReceiving(reception.token,c.decisions,'rebuild-failed');if(!pending(out)&&out.status!=='refused'){c.closed=true;this._result=out;this._done=c.request.done;this.popScene();return;}}
   }
  }
  // This fallback must not read the unusable save or redraw the failed summary.
  const message=tr('refused',{reason:String(error)})+'  '+tr('back');
  try{if(this._window?.contents){const b=this._window.contents,width=b.width-16;b.clear();b.fontSize=20;b.textColor='#fff';let line='',y=48;
   for(const char of Array.from(message)){if(this._window.textWidth(line+char)>width&&line){b.drawText(line,8,y,width,28,'left');line='';y+=30;}line+=char;}if(line)b.drawText(line,8,y,width,28,'left');
  }else G.$gameMessage.add(message);}catch{console.error(NAME,message);}
 };
 P.start=function(){if(this._invalid)return;G.Scene_MenuBase.prototype.start.call(this);
  const attempts=this._creationFailure?1:2;for(let attempt=0;attempt<attempts;attempt++){
   try{if(!this._controller)this._controller=new Controller(this,this._request);if(!this._window)this.createPresentation();this._controller.start(this._window);this._initialFailure=false;if(queuedScene===this)queuedScene=null;return;}
   catch(error){console.error(NAME,error);this._controller?.resetInitialization();if(attempt===attempts-1){this.rebuildFailed(error);return;}}
  }
 };
 P.update=function(){G.Scene_MenuBase.prototype.update.call(this);if(this._invalid){if(G.SceneManager._scene===this)this.popScene();return;}if(this._initialFailure){if(G.Input.isTriggered('cancel')||G.Input.isTriggered('ok'))this.popScene();return;}try{this._controller?.update();}catch(error){this.rebuildFailed(error);}};
 P.popScene=function(){if(this._controller?.inventoryChild){this._controller.inventoryChild.back();return;}if(this._controller&&!this._controller.closed&&!this._invalid&&!this._initialFailure){if(this._controller.input){this._controller.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}else {this._controller.action('back');this._controller.draw();}return;}G.Scene_MenuBase.prototype.popScene.call(this);};
 P.terminate=function(){if(queuedScene===this)queuedScene=null;if(initializingScene===this)initializingScene=null;G.Scene_MenuBase.prototype.terminate.call(this);this._controller?.dispose();const done=this._done,result=this._result;if(done&&this._controller.application===flow()._app&&this._controller.generation===this._controller.application.stateGeneration){this._done=null;done(result);}};
 W.Scene_PSManagement=Scene_PSManagement;W.Scene_PSParty=Scene_PSManagement;
 G.PluginManager.registerCommand('PS_BattleFlow','ShowParty',function(){ui.openParty();});
 G.PluginManager.registerCommand(NAME,'ShowStorage',function(){ui.openStorage();});
 G.PluginManager.registerCommand(NAME,'ShowSummary',function(args:any){ui.openSummary(String(args.id));});
 G.PluginManager.registerCommand(NAME,'RecoverAll',function(){const o=app().recoverAll();if(o.status==='refused')G.$gameMessage.add(tr('refused',{reason:o.reason}));});
 G.PluginManager.registerCommand(NAME,'ReceiveGift',function(this:any,args:any){let request:any;try{request=JSON.parse(String(args.request));}catch{G.$gameMessage.add(tr('refused',{reason:'invalid JSON'}));return;}const result=app().receiveGift(request);if(pending(result)){ui.openReceiving();this.setWaitMode('psReceiving');}else if(result.status==='refused')G.$gameMessage.add(tr('refused',{reason:result.reason}));else flow().waitForPokedex(this);});
 const wait=G.Game_Interpreter.prototype.updateWaitMode;
 G.Game_Interpreter.prototype.updateWaitMode=function(){if(this._waitMode==='psReceiving'){if(app().pendingReceiving||app().pendingEvolution||app().pendingPokedex)return true;this._waitMode='';return false;}return wait.call(this);};
 // A recovered placement is acknowledged only after its visible host notification has been queued.
 const mapStart=G.Scene_Map.prototype.start;
 G.Scene_Map.prototype.start=function(){mapStart.call(this);if(!flow()._app||flow()._app.pendingEvolution)return;for(const notice of flow()._app.receivingNotifications){try{const snap=app().managementSnapshot();const dest=notice.placements.map((p:any)=>p.to==='party'?tr('party'):boxTitle(snap,p.box)).join(', ');G.$gameMessage.add(tr('recovered',{dest}));app().acknowledgeReceivingNotification(notice.token);}catch(e){console.error(NAME,e);break;}}};
})();
