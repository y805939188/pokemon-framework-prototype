/** 5.2 host presentation. Application plans/install resources; this adapter owns focus and answers. */
import {InputLatch} from './management/model.ts';
import type {InputFrame} from './management/model.ts';
import {quantityStep,nextPocket,animationPhase,itemIconFrame} from './inventory/model.ts';
import {importantItem,showsQuantity,catalogOf,holdableItem,hasFlag} from '../framework/rules/item-catalog.ts';
import type {ItemDefinition} from '../framework/rules/item-catalog.ts';
import type {InventoryOutcome,InventoryParent,InventoryTicket} from '../framework/app/inventory-session.ts';
(() => {
 const G:any=globalThis,W:any=window,NAME='PS_Inventory',clone=structuredClone;
 const flow=()=>W.PSFlow,app=()=>flow().app(),tr=(k:string,p?:Record<string,string|number>)=>flow().translator().t('inventory.'+k,p);
 const why=(o:any)=>String(o?.reason??o?.error??o?.message??o),detail=(o:any)=>flow().translator().tOr('inventory.reason.'+why(o),why(o));
 const name=(it:ItemDefinition)=>flow().translator().tOr(it.nameKey??'item.name.'+it.id,it.name);
 type Request={kind:'bag'|'select'|'shop'|'use';parent?:InventoryParent;itemId?:string;quantity?:number;memberId?:string;filter?:(item:ItemDefinition)=>boolean;variableId?:number;shop?:any;prices?:{itemId:string;buy:number;sell?:number}[];done?:(o:InventoryOutcome)=>void;retireParent?:()=>void};
 type Handle={id:string;application:any;generation:number;done:boolean;result?:InventoryOutcome};
 type Choice={key:string;label:string;displayName?:string;details?:string[];enabled?:boolean;run:()=>void};
 type InventoryRow={item:ItemDefinition;quantity:number;index:number;pocket:number};
 type View={kind:string;cursor:number;title?:string;items?:Choice[];[key:string]:any};
 type Queued={request:Request;handle:Handle;scene?:any;constructing?:boolean};
 let active:Controller|null=null,queued:Queued|null=null,reserved:Queued|null=null,sequence=0;
 // A dead presentation can retain a child recovery barrier. Transfer only its exact process-local parent token.
 const abandoned:{application:any;generation:number;token:string;owner:string;retireParent?:()=>void}[]=[];
 const sameHandle=(h:Handle)=>h.application===flow()._app&&h.generation===h.application.stateGeneration;
 function retireQueued(q:Queued,result:InventoryOutcome){if(queued===q)queued=null;if(reserved===q)reserved=null;if(q.handle.done)return;q.handle.done=true;q.handle.result=clone(result);if(sameHandle(q.handle)&&q.request.done)notices.push({application:q.handle.application,generation:q.handle.generation,result:clone(result),done:q.request.done});}
 function retireOrphan(){for(let i=abandoned.length-1;i>=0;i--)if(abandoned[i]!.application!==flow()._app||abandoned[i]!.generation!==abandoned[i]!.application.stateGeneration)abandoned.splice(i,1);const q=reserved;if(!q||q.constructing)return;const m=G.SceneManager;if(q.handle.done||!sameHandle(q.handle)||q.scene&&'_nextScene'in m&&q.scene!==m._scene&&q.scene!==m._nextScene)retireQueued(q,{status:'refused',reason:'stale-operation'});}
 function queuedValid(scene:any){const q=scene._request;if(!q||q.handle.done||!sameHandle(q.handle)){if(q)retireQueued(q,{status:'refused',reason:'stale-operation'});scene._finished=true;scene._controller?.close({status:'refused',reason:'stale-operation'},true);return false;}return true;}
 function acknowledgeRecoveredItem(application:any,generation:number,owner:string){
  for(let i=abandoned.length-1;i>=0;i--){const entry=abandoned[i]!;if(entry.application!==flow()._app||entry.generation!==entry.application.stateGeneration){abandoned.splice(i,1);continue;}
   if(entry.application!==application||entry.generation!==generation||entry.owner!==owner)continue;
   if(application.pendingTriggeredEvolution||application.pendingEvolution||application.pendingPokedex)return;
   const out=application.endInventoryOperation(entry.token);if(out.status==='refused')return;abandoned.splice(i,1);entry.retireParent?.();
  }
 }
 const waits=new WeakMap<object,Handle>(),outcomes=new WeakMap<object,InventoryOutcome>();
 const notices:{application:any;generation:number;result:InventoryOutcome;done:(o:InventoryOutcome)=>void}[]=[];
 const discardStaleNotices=()=>{for(let i=notices.length-1;i>=0;i--)if(notices[i]!.application!==flow()._app||notices[i]!.generation!==notices[i]!.application.stateGeneration)notices.splice(i,1);};
 const frames:any[]=[];const record=(row:any)=>{frames.push(row);if(frames.length>256)frames.shift();};
 const handle=():Handle=>{const application=app(),h={id:'inventory-ui:'+ ++sequence,done:false}as Handle;Object.defineProperties(h,{application:{value:application},generation:{value:application.stateGeneration}});return h;};
 function open(request:Request):Handle|null {
  retireOrphan();discardStaleNotices();const scene=G.SceneManager._scene;
  if(active||queued||reserved||notices.length||scene?._psInventory||G.SceneManager.isSceneChanging()||scene?.isStarted?.()===false||G.$gameMessage?.isBusy?.())return null;
  const application=app();if(application.encounterBlocked)return null;const h=handle(),q:Queued={request,handle:h,constructing:true};queued=reserved=q;
  try{G.SceneManager.push(Scene_PSInventory);}catch(error){const created=active as Controller|null;if(created?.handle===h)created.close({status:'refused',reason:'presentation-failed',error:String(error)},true);retireQueued(q,{status:'refused',reason:'presentation-failed',error:String(error)});throw error;}finally{q.constructing=false;}return h;
 }
 class Controller {
  readonly application:any;readonly generation:number;readonly handle:Handle;readonly request:Request;
  token='';selection='';giveToken='';selectedTicket:InventoryTicket|null=null;closed=false;closing=false;ready=false;frame=0;serial=0;window:any;view!:View;error='';text:string[]=[];latch=new InputLatch();
  pocket=1;indices:number[]=Array(8).fill(0);visited=new Set<number>();bag:any;sorting=false;busy=false;operation:any=null;presentationOutcome:InventoryOutcome|null=null;afterMessage:(()=>void)|null=null;cancelWait:(()=>void)|null=null;lastPhase='';
  // Sort cancellation restores the live row, while indices retain the last moved saved position.
  restoredSortCursor:number|null=null;evolutionOwner='';evolutionChild:any=null;evolutionIntent:{itemId:string;memberId:string;quantity:number}|null=null;learningChild:any=null;learningItem:{itemId:string;memberId:string}|null=null;machineBrowse:{itemId:string;annotations:any[];members:any[]}|null=null;
  constructor(request:Request,h:Handle,readonly finish:(o:InventoryOutcome)=>void){this.request=request;this.handle=h;this.application=h.application;this.generation=h.generation;}
  valid(){try{return !this.closed&&!this.handle.done&&active===this&&this.application===app()&&this.generation===this.application.stateGeneration;}catch{return false;}}
  get saveBlocked(){return !!this.evolutionChild||!!this.learningChild||!!this.selectedTicket||!!this.operation||!!this.giveToken||this.busy||this.view?.kind==='quantity'||this.view?.pending===true;}
  id(){return 'ui-'+ ++this.serial;}
  start(win:any){
   if(!this.valid())throw Error('stale-operation');
   this.window=win;
   this.token=this.request.kind==='shop'?this.application.beginMoneyShop(this.request.shop??{}):this.application.beginInventoryOperation(this.request.parent||this.request.kind==='use'?'item':'bag',this.request.parent);
   for(const p of this.request.prices??[])this.application.setShopPrices(this.token,p.itemId,p.buy,p.sell);
   if(this.request.kind==='select')this.selection=this.application.beginItemSelection(this.token,this.request.filter,this.request.variableId);
   this.refreshBag();this.pocket=this.bag.lastPocket;this.indices=[...this.bag.indices];
   if(this.request.kind==='shop')this.shopMenu();
   else if(this.request.kind==='use'){if(this.machine(this.request.itemId!))this.machineOpening(this.request.itemId!,()=>this.request.memberId?this.beginUse(this.request.itemId!,this.request.memberId,1):this.machineTargets(this.request.itemId!));else if(this.triggerItem(this.request.itemId!)&&!this.request.memberId)this.target(this.request.itemId!);else this.beginUse(this.request.itemId!,this.request.memberId,this.request.quantity??1);}
   else this.bagView();
  }
  sample():InputFrame {return W.PSManagement.inputFrame();}
  boundary(){this.ready=false;this.frame=G.Graphics.frameCount??0;const pressed=this.sample().pressed;this.latch.arm(pressed);G.Input.clear();G.TouchInput.clear();record({event:'boundary',token:this.handle.id,frame:this.frame,view:this.view?.kind,pressed});}
  set(v:View){this.view=v;this.error='';this.boundary();this.draw();}
  refreshBag(){const bag=this.selection?this.application.itemSelectionView(this.token,this.selection):this.application.inventorySnapshot(this.token,this.request.parent?(it:ItemDefinition)=>(this.triggerItem(it.id)||['tm','hm','tr'].includes(it.fieldUse)||this.application.queryItemUse(this.token,it.id,1,this.request.parent!.memberId).ready):undefined);this.bag={...bag,pockets:bag.pockets.map((rows:Omit<InventoryRow,'pocket'>[],pocket:number)=>rows.map(row=>({...row,pocket:pocket+1})))};}
  bagView(){this.selectedTicket=null;this.refreshBag();const filtered=!!this.selection&&!!this.request.filter||!!this.request.parent;if(filtered&&!this.bag.pockets[this.pocket-1]?.length)this.pocket=nextPocket(this.pocket,1,this.bag.pockets.map((p:any[])=>p.length),true);this.indices[this.pocket-1]=Math.min(this.indices[this.pocket-1]??0,this.bag.pockets[this.pocket-1].length);this.set({kind:'bag',cursor:Math.min(this.restoredSortCursor??this.indices[this.pocket-1]!,this.bag.pockets[this.pocket-1].length),filtered});}
  flushBrowse(){if(this.selection||this.request.parent||this.request.kind==='use'||this.request.kind==='shop')return;for(const p of new Set([...this.visited].filter(p=>p!==this.pocket).concat(this.pocket))){const r=this.application.inventoryRequest(this.token,this.id(),{kind:'browse',pocket:p,index:Math.min(this.indices[p-1]??0,this.bag.pockets[p-1].length)});if(r.status==='refused')throw Error(why(r));}this.visited.clear();}
  rows(){return this.bag.pockets[this.pocket-1] as InventoryRow[];}
  choose(title:string,items:Choice[],back:()=>void,cursor=0){this.set({kind:'menu',title,items,cursor,back});}
  confirm(title:string,yes:()=>void,no:()=>void){this.choose(title,[{key:'yes',label:tr('yes'),run:yes},{key:'no',label:tr('no'),run:no}],no);this.view.pending=true;}
  message(text:string,done:()=>void){this.afterMessage=done;this.set({kind:'message',cursor:0,title:text});}
  fail(o:any,done=()=>this.bagView()){G.SoundManager.playBuzzer();this.message(tr('refused',{reason:detail(o)}),done);}
  fatal(error:unknown){if(this.closed){console.error(NAME,error);return;}const installed=this.presentationOutcome;this.close(installed?{...clone(installed),presentation:'failed',error:String(error)}:{status:'refused',reason:'presentation-failed',presentation:'failed',error:String(error)},true);try{G.$gameMessage.add(installed?tr('presentationFailed'):tr('refused',{reason:detail(error)}));}catch{console.error(NAME,error);}}
  finishSelection(itemId:string|null){const r=this.application.finishItemSelection(this.token,this.selection,this.id(),itemId);if(r.status!=='refused'){this.close(r);return;}if(['invalid-variable','stale-operation','stale-content'].includes(r.reason??'')){this.fail(r,()=>this.close(r,true));return;}this.choose(tr('refused',{reason:detail(r)}),[{key:'retry',label:tr('retry'),run:()=>this.bagView()},{key:'close',label:tr('close'),run:()=>this.close(r,true)}],()=>this.close(r,true));}
  quantity(max:number,shop:boolean,done:(q:number)=>void){if(max<1){this.fail({reason:'no-effect'},()=>shop?this.shopMenu():this.bagView());return;}const item=this.selectedTicket?this.catalog()[this.selectedTicket.itemId]:undefined;this.set({kind:'quantity',cursor:0,value:1,maximum:max,shop,done,title:tr('quantity')+(item?' · '+name(item):'')});}
  total(itemId:string){return this.bag.pockets.flat().reduce((n:number,r:any)=>n+(r.item.id===itemId?r.quantity:0),0);}
  itemMenu(row:any){
   const ticket:InventoryTicket=this.application.inventoryTicket(this.token,row.pocket,row.index);if(ticket.itemId!==row.item.id)throw Error('stale-slot');this.selectedTicket=ticket;
   const ready=this.triggerItem(row.item.id)||['tm','hm','tr'].includes(row.item.fieldUse)||this.application.queryItemUse(this.token,row.item.id,1,this.request.parent?.memberId).ready;
   this.choose(name(row.item),[
    {key:'use',label:tr('use'),enabled:ready,run:()=>this.target(row.item.id)},
    ...(!this.request.parent&&holdableItem(row.item)&&this.application.heldItemSourcesEnabled()?[{key:'give',label:tr('give'),run:()=>this.give(row)}]:[]),
    ...(!this.request.parent&&!importantItem(row.item)?[{key:'toss',label:tr('toss'),enabled:this.application.queryInventoryItemQuantity(this.token,row.item.id)>0,run:()=>this.toss(row)}]:[]),
    {key:'close',label:tr('back'),run:()=>this.bagView()}],()=>this.bagView());
   if(!ready){this.error=tr('notReady');this.draw();}
  }
  give(row:any){
   this.flushBrowse();if(this.selectedTicket&&JSON.stringify(this.selectedTicket)!==JSON.stringify(this.application.inventoryTicket(this.token,this.selectedTicket.pocket,this.selectedTicket.index))){this.fail({reason:'stale-slot'},()=>this.close({status:'refused',reason:'stale-slot'}));return;}const ended=this.application.endInventoryOperation(this.token);if(ended.status==='refused')throw Error(why(ended));this.token='';this.giveToken=this.application.beginManagement();
   const snap=this.application.managementSnapshot(this.giveToken),resume=()=>{const out=this.application.endManagement(this.giveToken);if(out.status==='refused')throw Error(why(out));this.giveToken='';this.token=this.application.beginInventoryOperation();this.bagView();};
   this.choose(tr('target'),[...snap.party.filter((m:any)=>!m.isEgg).map((m:any)=>({key:m.id,label:m.nickname||flow().speciesName(m.species,m.form),run:()=>{const apply=()=>{const r=this.application.manage(this.giveToken,this.id(),{kind:'give-item',source:snap.references[m.id],item:row.item.id});if(r.status==='refused')this.fail(r,resume);else{this.presentationOutcome={status:r.status==='unchanged'?'unchanged':'committed',result:{itemId:row.item.id,memberId:m.id,quantity:1}};this.message(tr('done'),resume);}};if(m.item)this.confirm(tr('confirmUse'),apply,resume);else apply();}})),{key:'close',label:tr('back'),run:resume}],resume);
  }
  party(){return clone(flow().game().party) as any[];}
  triggerItem(itemId:string){const item=this.catalog()[itemId];return typeof W.PSEvolution?.attachItem==='function'&&item?.fieldUse==='member'&&(['rare-candy','exp-candy','evolution'].includes(item.effect?.family??'')||hasFlag(item,'EvolutionStone'));}
  machine(itemId:string){return ['tm','hm','tr'].includes(this.catalog()[itemId]?.fieldUse??'');}
  machineOpening(itemId:string,next:()=>void){
   const item=this.catalog()[itemId]!,move=Object.values(flow().content().moves??{}).find((v:any)=>v.id===item.move)as any;
   this.message(tr('machineOpened',{item:name(item),move:move?.name??item.move??''}),()=>this.confirm(tr('machineTeach',{move:move?.name??item.move??''}),next,()=>this.request.kind==='use'?this.close({status:'cancelled'}):this.bagView()));
  }
  machineTargets(itemId:string,reuse=false){
   if(!reuse||this.machineBrowse?.itemId!==itemId)this.machineBrowse={itemId,annotations:this.application.teachingCandidates({kind:'machine',itemId,entry:'bag'}),members:this.party()};
   const {annotations,members}=this.machineBrowse!;
   const cancel=()=>this.request.kind==='use'?this.close({status:'cancelled'}):this.bagView();
   const show=()=>this.choose(tr('target'),[...members.map(m=>{const annotation=annotations.find((a:any)=>a.id===m.id);return {key:m.id,label:(m.nickname||flow().speciesName(m.species,m.form))+' · '+tr('machine.'+(annotation?.annotation??'not-able')),run:()=>{
    // Annotations are cached display data, never install authority. The selected member is rechecked by beginLearning.
    this.beginUse(itemId,m.id,1);
   }};}),{key:'close',label:tr('back'),run:cancel}],cancel);
   show();
  }
  target(itemId:string){
   this.flushBrowse();
   if(this.machine(itemId)){
    if(this.request.parent){const annotation=this.application.teachingCandidates({kind:'machine',itemId,entry:'party'}).find((a:any)=>a.id===this.request.parent!.memberId);if(annotation?.annotation!=='able'){this.fail({reason:annotation?.reason??'not-able'});return;}this.machineOpening(itemId,()=>this.beginUse(itemId,this.request.parent!.memberId,1));}
    else this.machineOpening(itemId,()=>this.machineTargets(itemId));return;
   }
   if(this.request.parent){this.useQuantity(itemId,this.request.parent.memberId);return;}
   const direct=this.rows().find(r=>r.item.id===itemId)?.item.effect?.family==='sacred-ash';if(direct){this.useQuantity(itemId);return;}
   const members=this.party(),back=()=>this.request.kind==='use'?this.close({status:'cancelled'}):this.bagView();this.choose(tr('target'),[...members.map(m=>({key:m.id,label:(m.nickname||flow().speciesName(m.species,m.form))+` Lv.${m.level} HP ${m.hp} ${m.status||''}`+(m.isEgg?' '+tr('egg'):''),run:()=>this.request.kind==='use'?this.beginUse(itemId,m.id,this.request.quantity??1):this.useQuantity(itemId,m.id)})),{key:'close',label:tr('back'),run:back}],back);
  }
  useQuantity(itemId:string,memberId?:string){if(['tm','hm','tr'].includes(this.catalog()[itemId]?.fieldUse??'')){this.beginUse(itemId,memberId,1);return;}const item=this.catalog()[itemId],member=this.party().find(m=>m.id===memberId);if(this.triggerItem(itemId)&&(item.effect?.family==='evolution'||hasFlag(item,'EvolutionStone')||item.effect?.family==='rare-candy'&&member?.level===100)){this.beginUse(itemId,memberId,1);return;}const q=this.application.queryItemUse(this.token,itemId,1,memberId);if(q.eligible!=='eligible'){this.fail(q,()=>this.request.parent?this.bagView():this.target(itemId));return;}const max=q.maximum??1;if(max>1)this.quantity(max,false,n=>{if(n)this.beginUse(itemId,memberId,n);else this.request.parent?this.bagView():this.target(itemId);});else this.beginUse(itemId,memberId,1);}
  beginUse(itemId:string,memberId:string|undefined,quantity:number){
   this.refreshBag();const row=this.bag.pockets.flat().find((r:any)=>r.item.id===itemId);if(!row){this.fail({reason:'not-enough-items'},()=>this.request.kind==='use'?this.close({status:'refused',reason:'not-enough-items'}):this.bagView());return;}
   if(this.triggerItem(itemId)){
    if(!memberId){this.fail({reason:'absent-party-target'});return;}
    if(this.selectedTicket&&JSON.stringify(this.selectedTicket)!==JSON.stringify(this.application.inventoryTicket(this.token,this.selectedTicket.pocket,this.selectedTicket.index))){this.fail({reason:'stale-slot'},()=>this.close({status:'refused',reason:'stale-slot'}));return;}
    this.presentationOutcome=null;this.evolutionIntent={itemId,memberId,quantity};this.evolutionChild=W.PSEvolution.attachItem(this.window,this.token,this.id(),this.evolutionIntent);this.evolutionOwner=this.evolutionChild.request.owner;return;
   }
   if(['tm','hm','tr'].includes(row.item.fieldUse)){
    if(!memberId||!W.PSProgression){this.fail({reason:'learning-screen-unavailable'});return;}
    if(this.selectedTicket&&JSON.stringify(this.selectedTicket)!==JSON.stringify(this.application.inventoryTicket(this.token,this.selectedTicket.pocket,this.selectedTicket.index))){this.fail({reason:'stale-slot'},()=>this.close({status:'refused',reason:'stale-slot'}));return;}
    this.learningItem={itemId,memberId};this.learningChild=W.PSProgression.attachLearning(this.window,{kind:'teach',memberId,source:{kind:'machine',itemId,entry:this.request.parent?'party':'bag'}},{kind:'inventory',token:this.token},(out:any)=>{
     if(this.closed||this.closing)return;
     this.learningChild=null;this.selectedTicket=null;const r:InventoryOutcome={status:['committed','unchanged','cancelled'].includes(out.status)?out.status:'refused',...(out.status==='refused'?{reason:out.reason}:{}),result:{itemId,memberId}};
     if(this.request.kind==='use')this.close(r);else if(out.status==='refused'&&!this.request.parent)this.machineTargets(itemId,true);else{this.bagView();}
    });return;
   }
   this.operation={id:this.id(),request:{kind:'use-item',itemId,quantity,...(memberId?{memberId}:{}),ticket:this.selectedTicket??this.application.inventoryTicket(this.token,row.pocket,row.index),answers:{}}};this.submitUse();
  }
  evolutionOutcome(child:any):InventoryOutcome {
   const out=child.completedOutcome,body=out?.result,confirmed=child.confirmedItem,primary=body?.primaryCommitted===true||confirmed?.primaryCommitted===true,itemResult=primary?(body?.item??confirmed?.itemResult):undefined,blocked=out?.status==='pending'||this.application.pendingTriggeredEvolution?.token===child.request.owner;
   const status=blocked?'refused':out?.status==='committed'||primary?'committed':out?.status==='unchanged'?'unchanged':'refused';
   return {status,...(status==='refused'?{reason:blocked?'evolution-recovery-required':out?.reason??'presentation-ended'}:{}),...((blocked||child.presentationError||out?.status==='technically-terminated')?{presentation:'failed'}:{}),result:{...this.evolutionIntent,evolution:body,primaryCommitted:primary,...(itemResult?{itemResult}: {})}};
  }
  finishEvolutionChild(child:any){
   if(this.evolutionChild!==child)return;const result=this.evolutionOutcome(child);this.evolutionChild=null;this.selectedTicket=null;
   if(this.request.kind==='use'){this.close(result);return;}
   if(child.presentationError){this.presentationOutcome=result.status==='committed'?result:null;this.message(result.status==='committed'?tr('presentationFailed'):tr('refused',{reason:detail(result)}),()=>{this.presentationOutcome=null;result.reason==='evolution-recovery-required'?this.close(result,true):this.bagView();});return;}
   this.presentationOutcome=null;this.bagView();
  }
  submitUse(){
   const op=this.operation,r=this.application.inventoryRequest(this.token,op.id,op.request);
   if(r.status==='pending'){this.answer(r.result.selection);return;}
   if(r.status==='refused'){
    const retired=r.reason==='stale-item-selection'||r.reason==='stale-slot'||r.reason==='stale-target'||r.reason==='stale-content';
    this.fail(r,()=>retired||this.request.kind==='use'?this.close(r):this.bagView());return;
   }
   this.operation=null;this.selectedTicket=null;
   if(r.status==='cancelled'){this.request.kind==='use'?this.close(r):this.bagView();return;}
   this.presentationOutcome=r;
   const result=r.result??{},text=tr('used',{quantity:op.request.quantity,item:name(this.catalog()[op.request.itemId]!)})+(result.newLevel!==undefined?` Lv.${result.oldLevel} → ${result.newLevel}`:'')+(result.actualHp?` HP ${result.actualHp>0?'+':''}${result.actualHp}`:'')+(result.learned?.length?tr('learned',{moves:result.learned.join(', ')}):'')+(result.skipped?.length?tr('skipped',{moves:result.skipped.join(', ')}):'');
   this.message(text,()=>this.request.kind==='use'?this.close(r):this.request.parent?this.bagView():this.target(op.request.itemId));
  }
  answer(s:any){
   const op=this.operation,submit=()=>this.submitUse();
   if(s.kind==='confirm'){this.confirm(tr('confirmUse'),()=>{op.request.answers.confirmed=true;submit();},()=>{op.request.answers.confirmed=false;submit();});return;}
   if(s.kind==='move'){
    this.choose(tr('move'),s.moves.map((m:any,i:number)=>({key:String(i),label:`${m.id} ${m.pp}/${m.maxpp} PP`,run:()=>{op.request.answers.moveIndex=i;submit();}})),()=>{op.request.answers.cancelled=true;submit();});return;
   }
   const learn=(answer:any)=>{op.request.answers.learning??=[];op.request.answers.learning[s.answerIndex]=answer;submit();};
   if(s.kind==='give-up'){this.confirm(tr('giveUp',{move:s.move.name||s.move.id}),()=>learn({kind:'decline',giveUp:true}),()=>learn({kind:'decline',giveUp:false}));return;}
   this.choose(tr('learn',{move:s.move.name||s.move.id}),[...s.moves.map((m:any,i:number)=>({key:String(i),label:`${m.id} ${m.pp}/${m.maxpp} PP`,run:()=>learn({kind:'replace',slot:i})})),{key:'new',label:tr('keep',{move:s.move.name||s.move.id}),run:()=>learn({kind:'decline'})}],()=>learn({kind:'decline'}));
   if(s.reason){this.error=detail({reason:s.reason});this.draw();}
  }
  toss(row:any){this.flushBrowse();const ticket=this.selectedTicket??this.application.inventoryTicket(this.token,row.pocket,row.index);this.quantity(this.application.queryInventoryItemQuantity(this.token,row.item.id),false,q=>{if(!q){this.bagView();return;}this.confirm(tr('confirmToss',{quantity:q,item:name(row.item)}),()=>{
   this.busy=true;const id=this.id();this.application.tossItems(this.token,id,row.item.id,q,ticket,true,()=>new Promise<void>(resolve=>{this.cancelWait=resolve;this.message(tr('tossing',{quantity:q,item:name(row.item)}),()=>{this.cancelWait=null;resolve();});})).then((r:InventoryOutcome)=>{this.busy=false;if(!this.valid())return;if(r.status==='refused')this.fail(r);else{this.presentationOutcome=r;this.message(tr('done'),()=>this.bagView());}}).catch((e:unknown)=>{this.busy=false;if(this.valid())this.fatal(e);});
  },()=>this.bagView());});}
  shopText(key:'greetingKey'|'farewellKey',fallback:string){const definition=this.request.shop?.shopId?flow().content().shops?.[this.request.shop.shopId]:undefined;return flow().translator().tOr(definition?.[key]??'inventory.'+fallback,tr(fallback));}
  closeShop(){const definition=this.request.shop?.shopId?flow().content().shops?.[this.request.shop.shopId]:undefined;if(definition?.farewellKey)this.message(this.shopText('farewellKey','farewell'),()=>this.close({status:'cancelled'}));else this.close({status:'cancelled'});}
  shopMenu(){const stock=this.application.shopView(this.token);this.choose(this.shopText('greetingKey','welcome'),[{key:'buy',label:tr('buy'),run:()=>this.shopList(false)},...(stock.allowSell?[{key:'sell',label:tr('sell'),run:()=>this.shopList(true)}]:[]),{key:'close',label:tr('leave'),run:()=>this.closeShop()}],()=>this.closeShop());}
  catalog():Record<string,ItemDefinition>{return catalogOf(flow().content());}
  shopList(selling:boolean){this.refreshBag();const ids=selling?[...new Set(this.bag.pockets.flat().map((r:any)=>r.item.id))]:this.application.shopView(this.token).stock;
   this.choose(tr(selling?'sell':'buy'),[...ids.map((id:string)=>{const item=this.catalog()[id]!;try{const quote=this.application.shopQuote(this.token,id,selling);return {key:id,label:`${name(item)}  ${tr('price',{price:quote.price})}  ${tr('owned',{quantity:this.total(id)})}`,displayName:name(item),details:[tr('price',{price:quote.price}),tr('owned',{quantity:this.total(id)})],enabled:quote.maximum>0,run:()=>this.shopQuantity(id,selling)};}catch(error){if(!selling||why(error)!=='not-sellable')throw error;return {key:id,label:name(item)+' · '+detail(error),displayName:name(item),details:[detail(error)],enabled:false,run:()=>{}};}}),{key:'close',label:tr('back'),run:()=>this.shopMenu()}],()=>this.shopMenu());}
  shopQuantity(itemId:string,selling:boolean){const quote=this.application.shopQuote(this.token,itemId,selling);this.quantity(quote.maximum,true,q=>{if(!q){this.shopList(selling);return;}if(!Number.isSafeInteger(quote.price*q)){this.fail({reason:'integer-overflow'},()=>this.shopList(selling));return;}this.confirm(tr('confirmTrade',{quantity:q,item:name(this.catalog()[itemId]!),total:quote.price*q}),()=>{const r=this.application.inventoryRequest(this.token,this.id(),{kind:selling?'sell':'buy',itemId,quantity:q,confirmed:true,expectedPrice:quote.price,expectedRevision:quote.revision});if(r.status==='refused'){this.fail(r,()=>this.shopList(selling));return;}this.presentationOutcome=r;this.message(tr('tradeDone',{quantity:q,item:name(this.catalog()[itemId]!)} )+(r.result?.bonus?tr('bonus',{quantity:r.result.bonus as number}):''),()=>this.shopList(selling));},()=>this.shopList(selling));this.view.summary=[tr('quantity')+': '+q,tr('price',{price:quote.price}),tr('total',{total:quote.price*q})];this.draw();});if(this.view.kind==='quantity'){this.view.unitPrice=quote.price;this.view.title=tr('quantity')+' · '+name(this.catalog()[itemId]!);this.draw();}}
  update(){
   if(!this.valid()){this.close({status:'refused',reason:'stale-operation'},true);return;}
   if(this.evolutionChild){const child=this.evolutionChild;child.update();if(child.closed)this.finishEvolutionChild(child);return;}
   if(this.learningChild){this.learningChild.update();return;}
   if(!this.view)return;const frame=G.Graphics.frameCount??0;if(!this.ready&&(frame<=this.frame||G.SceneManager.isSceneChanging()))return;
   const f=this.latch.filter(this.sample());if(!this.ready){this.ready=true;record({event:'ready',token:this.handle.id,frame,view:this.view.kind});return;}
   if(G.$gameMessage?.isBusy?.()||this.busy&&this.view.kind!=='message')return;
   const v=this.view;if(Object.values(f.triggered).some(Boolean)||Object.values(f.repeated).some(Boolean))record({event:'input',token:this.handle.id,frame,view:v.kind,...f});try{
    if(v.kind==='quantity'){const q=quantityStep(v.value,v.maximum,f,v.shop);v.value=q.value;if(q.done)v.done(q.value);else this.draw();return;}
    if(f.triggered.back){this.back();return;}
    if(f.triggered.use){this.use();return;}
    if(v.kind==='bag'&&f.triggered.action){if(!this.selection&&!this.request.parent&&v.cursor<this.rows().length){if(!this.sorting&&this.rows().length<2)return;const r=this.sorting?this.application.endInventorySort(this.token):this.application.beginInventorySort(this.token,this.pocket,v.cursor);if(r.status==='refused')this.fail(r);else{this.sorting=!this.sorting;this.boundary();this.draw();}}return;}
    const direction=(['up','down','left','right']as const).find(k=>f.repeated[k]);if(direction)this.direction(direction);
    const now=G.performance?.now?.()??Date.now(),phase=[animationPhase(now,8,.1),animationPhase(now,4,.15),itemIconFrame(now,192,48)].join(':');if(phase!==this.lastPhase){this.lastPhase=phase;this.draw();}
   }catch(error){this.fatal(error);}
  }
  direction(dir:'up'|'down'|'left'|'right'){
   const v=this.view;if(v.kind==='bag'){
    if(this.sorting){if(dir==='left'||dir==='right')return;const to=Math.max(0,Math.min(this.rows().length-1,v.cursor+(dir==='up'?-1:1)));if(to===v.cursor)return;const r=this.application.moveInventorySort(this.token,to);if(r.status==='refused'){this.fail(r,()=>this.close(r));return;}this.indices[this.pocket-1]=to;this.refreshBag();v.cursor=to;}
    else if(dir==='left'||dir==='right'){if(this.restoredSortCursor===null)this.indices[this.pocket-1]=v.cursor;this.visited.add(this.pocket);this.pocket=nextPocket(this.pocket,dir==='left'?-1:1,this.bag.pockets.map((p:any[])=>p.length),v.filtered);v.cursor=Math.min(this.indices[this.pocket-1]??0,this.rows().length);}
    else v.cursor=(v.cursor+(dir==='up'?-1:1)+this.rows().length+1)%(this.rows().length+1);
    this.restoredSortCursor=null;this.indices[this.pocket-1]=v.cursor;if(this.selection)this.application.browseItemSelection(this.token,this.selection,this.pocket,v.cursor);
   }else if(v.items?.length)v.cursor=(v.cursor+(dir==='up'||dir==='left'?-1:1)+v.items.length)%v.items.length;
   this.draw();
  }
  use(){const v=this.view;if(v.kind==='message'){const done=this.afterMessage;this.afterMessage=null;this.presentationOutcome=null;done?.();return;}if(v.kind==='bag'){
   if(this.sorting){this.application.endInventorySort(this.token);this.sorting=false;this.boundary();this.draw();return;}
   const row=this.rows()[v.cursor];if(!row){this.back();return;}
   if(this.selection){this.finishSelection(row.item.id);return;}this.itemMenu(row);
  }else {const it=v.items?.[v.cursor];if(it?.enabled===false){G.SoundManager.playBuzzer();return;}it?.run();}}
  back(){if(this.evolutionChild){this.evolutionChild.back();return;}if(this.learningChild){this.learningChild.model.back();this.learningChild.boundary();this.learningChild.draw();return;}const v=this.view;if(v.kind==='message'){this.use();return;}if(v.kind==='bag'){
   if(this.sorting){const r=this.application.endInventorySort(this.token,true);this.sorting=false;if(r.status==='refused')this.fail(r);else{this.restoredSortCursor=r.result.index;this.bagView();}return;}
   if(this.selection)this.finishSelection(null);else{this.flushBrowse();this.close({status:'cancelled'});}return;
  }v.back?.();}
  close(result:InventoryOutcome,invalid=false){
   if(this.closed||this.closing)return;this.closing=true;try{if(this.evolutionChild){const child=this.evolutionChild;this.evolutionChild=null;child.dispose();const outcome=this.evolutionOutcome(child);if(outcome.status==='committed')this.presentationOutcome=outcome;else result={...outcome,...(result.reason&&outcome.reason!=='evolution-recovery-required'?{reason:result.reason}:{})};}if(this.learningChild){const child=this.learningChild;this.learningChild=null;child.dispose();const done=child.completedOutcome;if(done?.status==='committed')this.presentationOutcome={status:'committed',result:{...this.learningItem}};else if(done?.status==='refused'&&done.reason==='learning-recovery-required')result={status:'refused',reason:done.reason,presentation:'failed'};}const same=this.application===flow()._app&&this.generation===this.application.stateGeneration;
   if(invalid&&this.presentationOutcome&&['cancelled','refused'].includes(result.status))result={...clone(this.presentationOutcome),presentation:'failed',error:result.error??why(result)};
   if(this.giveToken&&same){const out=this.application.endManagement(this.giveToken);if(out.status==='refused'&&!invalid){this.fail(out,()=>this.close(out,true));return;}}
   if(this.token&&same){const out=this.application.endInventoryOperation(this.token);if(out.status==='refused'&&!invalid){this.fail(out,()=>this.close(out,true));return;}if(out.reason==='child-operation-active'&&this.evolutionOwner&&this.application.pendingTriggeredEvolution?.token===this.evolutionOwner&&!abandoned.some(e=>e.application===this.application&&e.token===this.token))abandoned.push({application:this.application,generation:this.generation,token:this.token,owner:this.evolutionOwner,retireParent:this.request.retireParent});}
   this.closed=true;this.handle.done=true;this.handle.result=clone(result);if(active===this)active=null;
   const pending=this.cancelWait;this.cancelWait=null;this.afterMessage=null;pending?.();this.finish(result);
   if(same&&this.request.done)notices.push({application:this.application,generation:this.generation,result:clone(result),done:this.request.done});
   }finally{this.closing=false;}
  }
  draw(){
   if(this.evolutionChild){this.evolutionChild.draw();return;}
   if(this.learningChild){this.learningChild.draw();return;}
   if(!this.window||!this.view)return;const b=this.window.contents,v=this.view,w=b.width,h=b.height;b.clear();b.fontFace=flow().translator().font()||'sans-serif';b.fontSize=20;this.text=[];
   const line=(value:string,y:number,color='#fff',x=12,width=w-24)=>{if(width<=0)return;if(this.window.textWidth(value)>width){let fitted='';for(const ch of Array.from(value)){if(this.window.textWidth(fitted+ch+'…')>width)break;fitted+=ch;}value=fitted+'…';}this.text.push(value);b.textColor=color;b.drawText(value,x,y,width,28,'left');};
   // Reserve measured regions for quantities/prices/reasons; ellipsize only the remaining name area.
   const columns=(label:string,details:string[],y:number,color='#fff')=>{let right=w-12;for(const value of [...details].reverse()){const width=this.window.textWidth(value);right-=width;line(value,y,color,right,width);right-=16;}line(label,y,color,12,right-12);};
   const wrap=(value:string,y:number,max:number)=>{let text='',n=0;for(const char of Array.from(value)){if(this.window.textWidth(text+char)>w-28&&text){line(text,y+n*25);text='';if(++n>=max)return;}text+=char;}if(text)line(text,y+n*25);};
   line(v.title??tr('bag'),2,'#b8e3ff');if(v.summary)columns('',v.summary,35);
   if(v.kind==='bag'){
    line(tr('pocket.'+this.pocket)+` (${this.pocket}/8)`+(this.sorting?' '+tr('sorting'):''),35);const rows=this.rows(),start=Math.max(0,v.cursor-9);
    for(let i=start;i<Math.min(rows.length+1,start+10);i++){const row=rows[i],prefix=i===v.cursor?'▶ ':'  ',quantity=row&&showsQuantity(row.item)?' ×'+row.quantity:'';if(row)columns(prefix+name(row.item),quantity?[quantity]:[],72+(i-start)*29);else line(prefix+tr('close'),72+(i-start)*29);}
    const row=rows[v.cursor];if(row){wrap(name(row.item),h-184,2);line(tr('owned',{quantity:this.total(row.item.id)}),h-132);wrap(flow().translator().tOr(row.item.descriptionKey??'item.description.'+row.item.id,row.item.effect?flow().translator().tOr('inventory.effect.'+row.item.effect.family,tr('description',{item:name(row.item)})):tr('notReady')),h-102,2);const now=G.performance?.now?.()??Date.now();b.fillRect(w-62,2,48,48,['#446088','#527b96','#6899b6','#527b96'][itemIconFrame(now,192,48)]);b.drawText('◇',w-54,10,32,32,'center');}
   }else if(v.kind==='quantity'){line(`${v.value} / ${v.maximum}`,80);line(tr('quantityHelp'),130);if(v.unitPrice!==undefined){line(tr('price',{price:v.unitPrice}),180);line(Number.isSafeInteger(v.unitPrice*v.value)?tr('total',{total:v.unitPrice*v.value}):tr('reason.integer-overflow'),215);}}
   else if(v.kind==='message')wrap(v.title??'',72,12);
   else {const rows=v.items??[],start=Math.max(0,v.cursor-10);for(let i=start;i<Math.min(rows.length,start+11);i++){const row=rows[i]!,prefix=(v.cursor===i?'▶ ':'  ')+(row.enabled===false?'× ':''),y=(v.summary?88:56)+(i-start)*31,color=row.enabled===false?'#aaa':'#fff';if(row.details)columns(prefix+row.displayName,row.details,y,color);else line(prefix+row.label,y,color);}}
   if(this.request.kind==='shop')line(tr('money',{money:flow().game().money}),h-90,'#ffe29a');
   if(this.error)wrap(this.error,h-90,2);const now=G.performance?.now?.()??Date.now();line(tr('help'),h-38,'#b8e3ff');b.drawText('‹ ›',w-126,2+[0,1,2,3,4,3,2,1][animationPhase(now,8,.1)]!,54,28,'center');if(v.kind==='message')b.drawText(['▼','▽','▾','▿'][animationPhase(now,4,.15)],w-42,h-44,28,28,'center');
  }
 }
 function Scene_PSInventory(this:any){this.initialize(...(arguments as any));}
 const P=Scene_PSInventory.prototype=Object.create(G.Scene_MenuBase.prototype);P.constructor=Scene_PSInventory;
 P.initialize=function(){this._psInventory=true;this._request=queued;if(this._request)this._request.scene=this;queued=null;G.Scene_MenuBase.prototype.initialize.call(this);};
 P.create=function(){if(!queuedValid(this))return;try{G.Scene_MenuBase.prototype.create.call(this);if(!queuedValid(this))return;const q=this._request;if(!q)throw Error('missing-inventory-request');this._controller=new Controller(q.request,q.handle,()=>{this._finished=true;});active=this._controller;this._window=new G.Window_Base(new G.Rectangle(0,0,G.Graphics.boxWidth,G.Graphics.boxHeight));this.addWindow(this._window);this._attached=true;if(!queuedValid(this))return;this._controller.start(this._window);if(reserved===q)reserved=null;}catch(error){this._failure=String(error);if(this._window&&!this._attached){try{this._window.destroy?.();}catch{}}this._controller?.close({status:'refused',reason:'presentation-failed',error:this._failure},true);if(this._request&&!this._request.handle.done){this._request.handle.done=true;this._request.handle.result={status:'refused',reason:'presentation-failed',error:this._failure};}try{const applied=['committed','duplicate','unchanged'].includes(this._request?.handle.result?.status);G.$gameMessage.add(applied?tr('presentationFailed'):tr('refused',{reason:this._failure}));}catch{}}};
 P.update=function(){if(this._finished||this._failure){if(!G.SceneManager.isSceneChanging())G.Scene_MenuBase.prototype.popScene.call(this);return;}G.Scene_MenuBase.prototype.update.call(this);try{this._controller?.update();}catch(error){this._controller?.fatal(error);}};
 P.popScene=function(){const c=this._controller;if(c&&!c.closed&&(c.evolutionChild||c.learningChild)){c.back();return;}G.Scene_MenuBase.prototype.popScene.call(this);};
 P.start=function(){G.Scene_MenuBase.prototype.start.call(this);queuedValid(this);};
 P.terminate=function(){G.Scene_MenuBase.prototype.terminate.call(this);if(this._controller)this._controller.close({status:'cancelled'},true);else if(this._request)retireQueued(this._request,{status:'cancelled'});if(reserved===this._request)reserved=null;};
 const ui:any=W.PSInventory={
  trace:()=>clone(frames),
  saveBlocked:()=>{retireOrphan();return !!queued||!!reserved||!!active?.saveBlocked;},
  acknowledgeRecoveredItem,
  showBag:(done?:Request['done'])=>open({kind:'bag',done}),selectItem:(filter?:Request['filter'],variableId?:number,done?:Request['done'])=>open({kind:'select',filter,variableId,done}),openShop:(shop:any,prices?:Request['prices'],done?:Request['done'])=>open({kind:'shop',shop,prices,done}),useItem:(itemId:string,memberId?:string,quantity=1,done?:Request['done'])=>open({kind:'use',itemId,memberId,quantity,done}),
  attach:(win:any,parent:InventoryParent,done:()=>void,retireParent?:()=>void)=>{retireOrphan();if(active||queued||reserved)throw Error('inventory-operation-active');const h=handle(),c=new Controller({kind:'bag',parent,retireParent},h,done);active=c;try{c.start(win);}catch(error){c.close({status:'refused',reason:'presentation-failed',error:String(error)},true);throw error;}return c;},
  current:()=>active&&!active.closed?{token:active.token,generation:active.generation,ready:active.ready,pocket:active.pocket,sorting:active.sorting,text:[...active.text],view:{kind:active.view?.kind,cursor:active.view?.cursor,value:active.view?.value,maximum:active.view?.maximum,title:active.view?.title,items:active.view?.items?.map(i=>({key:i.key,label:i.label,enabled:i.enabled}))},frames:clone(frames)}:null,
 };
 const pending=flow().operationPending;
 flow().operationPending=function(){return (pending?pending.call(this):!!this._app?.saveBlocked)||ui.saveBlocked();};
 const integer=(value:any):number=>{if(typeof value==='string'&&!/^-?\d+$/.test(value))throw Error('invalid-integer');const n=Number(value);if(!Number.isSafeInteger(n))throw Error('invalid-integer');return n;};
 const bool=(value:any):boolean=>{if(value!==true&&value!==false&&value!=='true'&&value!=='false')throw Error('invalid-boolean');return value===true||value==='true';};
 const variable=(id:any)=>{if(id===undefined||id==='')return undefined;const n=integer(id);if(n<1||n>=G.$dataSystem.variables.length)throw Error('invalid-variable');return n;};
 const waitFor=(interpreter:any,h:Handle|null)=>{if(!h)throw Error('inventory-operation-active');waits.set(interpreter,h);interpreter.setWaitMode('psInventory');};
 const register=(command:string,run:(self:any,args:any)=>void)=>G.PluginManager.registerCommand(NAME,command,function(this:any,args:any){try{run(this,args);}catch(error){this._psInventoryOutcome={status:'refused',reason:String(error)};G.$gameMessage.add(tr('refused',{reason:detail(error)}));}});
 const instant=(self:any,request:any)=>{const token=app().beginInventoryOperation();try{self._psInventoryOutcome=app().inventoryRequest(token,'command',request);if(self._psInventoryOutcome.status==='refused')G.$gameMessage.add(tr('refused',{reason:detail(self._psInventoryOutcome)}));}finally{app().endInventoryOperation(token);}};
 register('ShowBag',self=>waitFor(self,ui.showBag()));
 register('SelectItem',(self,a)=>{const ids=a.itemIds?JSON.parse(a.itemIds):undefined;if(ids!==undefined&&(!Array.isArray(ids)||ids.some(x=>typeof x!=='string')))throw Error('invalid-filter');waitFor(self,ui.selectItem(ids?(it:ItemDefinition)=>ids.includes(it.id):undefined,variable(a.variableId)));});
 register('OpenShop',(self,a)=>waitFor(self,ui.openShop(a.shopId?{shopId:a.shopId,...(a.allowSell?{allowSell:bool(a.allowSell)}:{})}:{stock:JSON.parse(a.stock),allowSell:a.allowSell?bool(a.allowSell):true},a.prices?JSON.parse(a.prices):undefined)));
 register('UseItemOnMember',(self,a)=>waitFor(self,ui.useItem(String(a.itemId),a.memberId?String(a.memberId):undefined,integer(a.quantity??'1'))));
 for(const [cmd,kind]of [['GiveItems','add-items'],['RemoveItems','remove-items']])register(cmd!,(self,a)=>instant(self,{kind,itemId:String(a.itemId),quantity:integer(a.quantity),...(a.claimId?{claimId:a.claimId}:{})}));
 register('ChangeMoney',(self,a)=>instant(self,{kind:'change-money',amount:integer(a.amount)}));register('SetBadge',(self,a)=>instant(self,{kind:'set-badge',index:integer(a.index),owned:bool(a.owned)}));
 register('QueryBadge',(self,a)=>{const id=variable(a.variableId),q=app().queryBadges(a.index!==undefined&&a.index!==''?integer(a.index):undefined);self._psInventoryOutcome={status:'unchanged',result:q};if(id!==undefined)G.$gameVariables.setValue(id,q.owned??q.count);});
 const wait=G.Game_Interpreter.prototype.updateWaitMode;
 Object.defineProperty(G.Game_Interpreter.prototype,'_psInventoryOutcome',{configurable:true,enumerable:false,get(){const value=outcomes.get(this);return value?clone(value):undefined;},set(value:InventoryOutcome){outcomes.set(this,clone(value));}});
 G.Game_Interpreter.prototype.updateWaitMode=function(){if(this._waitMode==='psInventory'){const h=waits.get(this);if(h&&!h.done&&h.application===flow()._app&&h.generation===h.application.stateGeneration)return true;this._psInventoryOutcome=h?.result??{status:'refused',reason:'stale-operation'};this._waitMode='';waits.delete(this);return false;}return wait.call(this);};
 const abandon=(self:object)=>{const h=waits.get(self);waits.delete(self);outcomes.delete(self);if(h&&!h.done){if(active?.handle===h)active.close({status:'refused',reason:'event-aborted'},true);else{h.done=true;h.result={status:'refused',reason:'event-aborted'};if(reserved?.handle===h)retireQueued(reserved,h.result);if(queued?.handle===h)queued=null;}}};
 for(const method of ['clear','terminate']){const previous=G.Game_Interpreter.prototype[method];if(typeof previous==='function')G.Game_Interpreter.prototype[method]=function(...args:any[]){abandon(this);return previous.apply(this,args);};}
 const updateScene=G.SceneManager.updateScene;
 if(typeof updateScene==='function')G.SceneManager.updateScene=function(...args:any[]){retireOrphan();const value=updateScene.apply(this,args);retireOrphan();discardStaleNotices();const parent=this._scene;if(notices.length&&parent&&!parent._psInventory&&!this.isSceneChanging()&&parent.isStarted?.()!==false&&!G.$gameMessage?.isBusy?.()){const notice=notices.shift()!;try{notice.done(clone(notice.result));}catch(error){console.error(NAME,'completion callback failed',error);}}return value;};
 if(G.Window_MenuCommand&&G.Scene_Menu){const commands=G.Window_MenuCommand.prototype.addOriginalCommands;G.Window_MenuCommand.prototype.addOriginalCommands=function(){commands.call(this);let enabled=false;try{app().describeParty();enabled=true;}catch{}this.addCommand(tr('bag'),'psBag',enabled);};const create=G.Scene_Menu.prototype.createCommandWindow;G.Scene_Menu.prototype.createCommandWindow=function(){create.call(this);this._commandWindow.setHandler('psBag',()=>{try{const h=ui.showBag();if((!h||h.done)&&G.SceneManager._scene===this)this._commandWindow.activate();}catch(error){this._commandWindow.activate();G.$gameMessage.add(tr('refused',{reason:detail(error)}));}});};}
 W.Scene_PSInventory=Scene_PSInventory;
})();
