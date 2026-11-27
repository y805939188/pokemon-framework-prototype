'use strict';
// Test observations only. These helpers never query a provider or issue work.
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const sameNative=(a,b)=>!!a&&!!b&&a.application===b.application&&a.generation===b.generation
 &&a.scene===b.scene&&a.map===b.map&&a.data===b.data&&a.player===b.player;
const samePhysical=(a,b)=>object(a)&&object(b)&&a.phase==='arrived'&&b.phase==='arrived'
 &&object(a.lease)&&object(a.serial)&&a.lease===b.lease&&a.serial===b.serial&&a.owner===b.owner
 &&a.receipt===b.receipt&&a.player===b.player&&a.scene===b.scene;
// The confirmed physical arrival exists inside onMapLoaded, before ready can
// publish a loaded birth. Associate only a rich observation the actual atomic
// consumer later receives for this same confirmation and retained native frame.
function associateArrivalBirth(arrival,observation){
 if(!arrival||!observation||arrival.result?.status!=='arrived'||!arrival.request
  ||!object(observation.birth)||!object(observation.registry)||!sameNative(arrival.snapshot,observation.snapshot)
  ||!samePhysical(arrival.physical,observation.physical)||arrival.registry!==observation.registry
  ||observation.physical.owner!==arrival.owner||observation.physical.receipt!==arrival.receipt
  ||observation.physical.player!==arrival.snapshot.player||observation.physical.scene!==arrival.snapshot.scene
  ||observation.birthScene!==arrival.snapshot.scene||observation.handoff)return null;
 const frame=observation.frame,snapshot=arrival.snapshot;
 if(frame?.map!==snapshot.map||frame.data!==snapshot.data||frame.player!==snapshot.player||frame.mapId!==snapshot.map._mapId)return null;
 if(arrival.birth!==undefined&&(!object(arrival.birth)||arrival.birth!==observation.birth))return null;
 if(observation!==arrival.observation&&observation.sequence<=arrival.sequence)return null;
 return Object.freeze({arrival,birth:observation.birth,snapshot:observation.snapshot,physical:observation.physical,
  registry:observation.registry,observationSequence:observation.sequence});
}
function failedArrivalReady({requestId,receipt,reason,current,request,arrival,finish,lifecycle,lastFrame,recovery,errors}){
 if(!object(receipt)||!object(current?.application)||!object(current.scene)||!object(current.map)||!object(current.data)||!object(current.player)
  ||!Array.isArray(errors)||errors.length||!request||!arrival||!finish||!lifecycle||!lastFrame)return false;
 const physical=lifecycle.physical,prior=arrival.physical,frame=lifecycle.frame,bound=arrival.birthBinding;
 return request.id===requestId&&request.status==='fulfilled'&&request.value?.status==='awaiting-arrival'
  &&request.value.receipt===receipt&&request.snapshot.application===current.application&&request.snapshot.generation===current.generation
  &&receipt.generation===current.generation&&arrival.request===request&&arrival.receipt===receipt&&arrival.result?.status==='arrived'
  &&finish.receipt===receipt&&finish.status==='fulfilled'&&finish.value?.status==='failed'&&finish.value.reason===reason
  &&sameNative(current,arrival.snapshot)&&sameNative(current,finish.snapshot)&&sameNative(current,lifecycle.snapshot)&&sameNative(current,lastFrame.snapshot)
  &&lastFrame.sequence>finish.sequence&&object(lifecycle.registry)&&lifecycle.registry===arrival.registry
  &&object(physical)&&object(prior)&&physical.phase==='arrived'&&prior.phase==='arrived'
  &&object(physical.lease)&&object(physical.serial)&&physical.lease===prior.lease&&physical.serial===prior.serial
  &&physical.owner===arrival.owner&&physical.owner===prior.owner&&physical.receipt===receipt&&prior.receipt===receipt
  &&physical.player===current.player&&physical.scene===current.scene&&physical.player===prior.player&&physical.scene===prior.scene
  &&!lifecycle.handoff&&object(lifecycle.birth)&&bound?.arrival===arrival&&lifecycle.birth===bound.birth
  &&sameNative(bound.snapshot,current)&&samePhysical(bound.physical,physical)&&bound.registry===lifecycle.registry&&lifecycle.birthScene===current.scene
  &&frame?.map===current.map&&frame.data===current.data&&frame.player===current.player&&frame.mapId===current.map._mapId
  &&recovery?.status==='failed'&&recovery.phase==='after-arrival'&&recovery.physical==='arrived'
  &&recovery.reasonCode==='tail-failed'&&recovery.retry?.enabled===true&&recovery.cancel?.enabled===false;
}
function countCharacterUpdates(native,counts){
 return function(...args){counts.set(this,(counts.get(this)||0)+1);return Reflect.apply(native,this,args);};
}
// Diagnostics consume the last actual observation only. No raw identity object
// escapes, so retained/cyclic native objects cannot expand a timeout report.
function failedArrivalSummary(observed){
 if(!observed)return null;
 const {requestId,receipt,reason,current,request,arrival,finish,lifecycle,lastFrame,recovery,errors}=observed;
 const bound=arrival?.birthBinding,physical=lifecycle?.physical,prior=arrival?.physical,frame=lifecycle?.frame;
 const native=value=>!!current&&sameNative(current,value);
 const text=value=>typeof value==='string'?value.slice(0,240):null;
 return {
  request:{id:text(requestId),status:text(request?.status),result:text(request?.value?.status),linked:arrival?.request===request,
   receipt:request?.value?.receipt===receipt,generation:request?.snapshot?.generation===current?.generation&&receipt?.generation===current?.generation},
  arrival:{status:text(arrival?.result?.status),receipt:arrival?.receipt===receipt,native:native(arrival?.snapshot)},
  finish:{status:text(finish?.status),result:text(finish?.value?.status),reason:text(finish?.value?.reason),expectedReason:text(reason),
   reasonMatches:finish?.value?.reason===reason,receipt:finish?.receipt===receipt,native:native(finish?.snapshot),sequence:finish?.sequence??null},
  birthBinding:{present:!!bound,arrival:!!bound&&bound.arrival===arrival,birth:!!bound&&bound.birth===lifecycle?.birth,
   registry:!!bound&&bound.registry===lifecycle?.registry,native:!!bound&&native(bound.snapshot),physical:!!bound&&samePhysical(bound.physical,physical)},
  conditions:{requestPresent:!!request,arrivalPresent:!!arrival,finishPresent:!!finish,lifecyclePresent:!!lifecycle,
   registry:object(lifecycle?.registry)&&lifecycle.registry===arrival?.registry,
   owner:object(physical)&&physical.owner===arrival?.owner&&physical.owner===prior?.owner,
   lease:object(physical?.lease)&&physical.lease===prior?.lease,serial:object(physical?.serial)&&physical.serial===prior?.serial,
   physical:samePhysical(physical,prior),handoffClear:!lifecycle?.handoff,birthScene:lifecycle?.birthScene===current?.scene,
   lifecycleNative:native(lifecycle?.snapshot),frameNative:native(lastFrame?.snapshot),laterFrame:!!lastFrame&&!!finish&&lastFrame.sequence>finish.sequence,
   frame:!!frame&&frame.map===current?.map&&frame.data===current?.data&&frame.player===current?.player&&frame.mapId===current?.map?._mapId,
   errorsClear:Array.isArray(errors)&&errors.length===0},
  recovery:{status:text(recovery?.status),phase:text(recovery?.phase),physical:text(recovery?.physical),reasonCode:text(recovery?.reasonCode),
   retry:recovery?.retry?.enabled===true,cancel:recovery?.cancel?.enabled===true},
  errorCount:Array.isArray(errors)?errors.length:null
 };
}
// Project only the same evaluation cached by failedArrival(). No provider or
// public recovery call is made here. null means unavailable observation, never
// an observed false condition. Opaque native/authority values are compared only.
function compactFailedArrival(observed){
 const checks={},check=(key,available,test)=>{checks[key]=available?!!test():null;};
 if(!observed)return {observed:false,conditions:{observationPresent:false},unmet:['observationPresent'],unknown:['failedArrivalEvaluation'],recovery:null};
 const {requestId,receipt,reason,current,request,arrival,finish,lifecycle,lastFrame,recovery,errors}=observed;
 const physical=lifecycle?.physical,prior=arrival?.physical,frame=lifecycle?.frame,bound=arrival?.birthBinding;
 const currentKnown=object(current),native=value=>object(value)&&sameNative(current,value);
 const own=(value,key)=>{if(!object(value))return undefined;const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
 const text=value=>typeof value==='string'?value.slice(0,48):value===null?null:undefined;
 const requestValue=own(request,'value'),arrivalResult=own(arrival,'result'),finishValue=own(finish,'value');
 const view=(value,key)=>text(own(value,key));
 const button=value=>object(value)?{enabled:typeof own(value,'enabled')==='boolean'?own(value,'enabled'):null,disabledReason:view(value,'disabledReason')??null}:null;
 checks.receiptObject=object(receipt);checks.currentPresent=currentKnown;checks.requestPresent=!!request;checks.arrivalPresent=!!arrival;
 checks.finishPresent=!!finish;checks.lifecyclePresent=!!lifecycle;checks.lastFramePresent=!!lastFrame;checks.recoveryPresent=!!recovery;
 checks.errorsObserved=Array.isArray(errors);check('errorsClear',Array.isArray(errors),()=>errors.length===0);
 check('currentObjects',currentKnown,()=>['application','scene','map','data','player'].every(key=>object(current[key])));
 check('requestId',!!request,()=>request.id===requestId);check('requestFulfilled',!!request,()=>request.status==='fulfilled');
 check('requestAwaitingArrival',own(requestValue,'status')!==undefined,()=>own(requestValue,'status')==='awaiting-arrival');
 check('requestReceipt',object(requestValue)&&object(receipt),()=>own(requestValue,'receipt')===receipt);
 check('requestApplication',!!request?.snapshot&&currentKnown,()=>request.snapshot.application===current.application);
 check('requestGeneration',!!request?.snapshot&&currentKnown,()=>request.snapshot.generation===current.generation);
 const receiptGeneration=own(receipt,'generation');check('receiptGeneration',receiptGeneration!==undefined&&currentKnown,()=>receiptGeneration===current.generation);
 check('arrivalRequest',!!arrival&&!!request,()=>arrival.request===request);check('arrivalReceipt',!!arrival&&object(receipt),()=>arrival.receipt===receipt);
 check('arrivalArrived',own(arrivalResult,'status')!==undefined,()=>own(arrivalResult,'status')==='arrived');
 check('finishReceipt',!!finish&&object(receipt),()=>finish.receipt===receipt);check('finishFulfilled',!!finish,()=>finish.status==='fulfilled');
 check('finishFailed',own(finishValue,'status')!==undefined,()=>own(finishValue,'status')==='failed');check('finishReason',own(finishValue,'reason')!==undefined,()=>own(finishValue,'reason')===reason);
 for(const [key,value]of [['arrivalNative',arrival?.snapshot],['finishNative',finish?.snapshot],['lifecycleNative',lifecycle?.snapshot],['lastFrameNative',lastFrame?.snapshot]])check(key,currentKnown&&!!value,()=>native(value));
 check('frameAfterFinish',!!lastFrame&&!!finish,()=>lastFrame.sequence>finish.sequence);
 check('registryObject',!!lifecycle,()=>object(lifecycle.registry));check('registrySame',!!lifecycle&&!!arrival,()=>lifecycle.registry===arrival.registry);
 checks.physicalPresent=object(physical);checks.priorPhysicalPresent=object(prior);checks.framePresent=!!frame;checks.birthBindingPresent=!!bound;
 check('physicalArrived',object(physical),()=>physical.phase==='arrived');check('priorArrived',object(prior),()=>prior.phase==='arrived');
 check('leaseSame',object(physical)&&object(prior),()=>object(physical.lease)&&physical.lease===prior.lease);
 check('serialSame',object(physical)&&object(prior),()=>object(physical.serial)&&physical.serial===prior.serial);
 check('ownerSame',object(physical)&&object(prior)&&!!arrival,()=>physical.owner===arrival.owner&&physical.owner===prior.owner);
 check('physicalReceipt',object(physical)&&object(prior)&&object(receipt),()=>physical.receipt===receipt&&prior.receipt===receipt);
 check('physicalPlayer',object(physical)&&object(prior)&&currentKnown,()=>physical.player===current.player&&physical.player===prior.player);
 check('physicalScene',object(physical)&&object(prior)&&currentKnown,()=>physical.scene===current.scene&&physical.scene===prior.scene);
 check('handoffClear',!!lifecycle,()=>!lifecycle.handoff);check('birthObject',!!lifecycle,()=>object(lifecycle.birth));
 check('bindingArrival',!!bound&&!!arrival,()=>bound.arrival===arrival);check('bindingBirth',!!bound&&!!lifecycle,()=>bound.birth===lifecycle.birth);
 check('bindingNative',!!bound?.snapshot&&currentKnown,()=>native(bound.snapshot));
 check('bindingPhysical',!!bound&&object(physical),()=>samePhysical(bound.physical,physical));check('bindingRegistry',!!bound&&!!lifecycle,()=>bound.registry===lifecycle.registry);
 check('birthScene',!!lifecycle&&currentKnown,()=>lifecycle.birthScene===current.scene);
 for(const key of ['map','data','player'])check('frame'+key[0].toUpperCase()+key.slice(1),!!frame&&currentKnown,()=>frame[key]===current[key]);
 const mapId=own(current?.map,'_mapId');check('frameMapId',!!frame&&mapId!==undefined,()=>frame.mapId===mapId);
 for(const [key,expected]of [['status','failed'],['phase','after-arrival'],['physical','arrived'],['reasonCode','tail-failed']])check('recovery'+key[0].toUpperCase()+key.slice(1),own(recovery,key)!==undefined,()=>own(recovery,key)===expected);
 const retry=own(recovery,'retry'),cancel=own(recovery,'cancel');check('retryEnabled',typeof own(retry,'enabled')==='boolean',()=>own(retry,'enabled')===true);check('cancelDisabled',typeof own(cancel,'enabled')==='boolean',()=>own(cancel,'enabled')===false);
 return {observed:true,requestStatus:text(request?.status)??null,requestResult:view(requestValue,'status')??null,arrivalResult:view(arrivalResult,'status')??null,
  finishStatus:text(finish?.status)??null,finishResult:view(finishValue,'status')??null,finishReason:view(finishValue,'reason')??null,expectedReason:text(reason)??null,
  recovery:recovery?{status:view(recovery,'status')??null,phase:view(recovery,'phase')??null,physical:view(recovery,'physical')??null,reasonCode:view(recovery,'reasonCode')??null,retry:button(retry),cancel:button(cancel),arrivalField:'not-in-public-view',lastFailureField:'not-in-public-view'}:null,
  conditions:checks,unmet:Object.keys(checks).filter(key=>checks[key]===false),unknown:Object.keys(checks).filter(key=>checks[key]===null)};
}
module.exports={sameNative,associateArrivalBirth,failedArrivalReady,failedArrivalSummary,countCharacterUpdates,compactFailedArrival};
