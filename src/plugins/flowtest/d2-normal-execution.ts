/** Explicit offline one-case input composition. No launch CLI, native permission, qualified deadline or full100 acceptance. */
import { bindNormalContinuation } from './d2-normal-continuation';
import { bindNormalIntentOracle } from './d2-normal-oracle';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const describeError=(e:any):any=>e?{message:String(e),...(e.primary?{primary:String(e.primary)}:{}),...(e.cleanupErrors?{cleanupErrors:e.cleanupErrors.map(String)}:{})}:null;
const KEYS=['ok','cancel','left','right','up','down','pageup','pagedown'];
export async function executeOfflineNormalCase(E:any,G:any,W:any,fixture:any,tools:any,options:any,ports:any):Promise<any>{
  if(options?.scope!=='OFFLINE_CONTROL'||ports?.deadlineKind!=='TEST_HYGIENE'||G.nw||!/^owned-[A-Za-z0-9_-]+$/.test(options.caseId??''))throw Error('explicit owned offline control required; native execution is not admitted');
  if(!Number.isFinite(ports.deadline)||ports.deadline<=ports.now()||typeof ports.dispatch!=='function'||typeof G.SceneManager.updateMain!=='function')throw Error('finite test hygiene ports required');
  fixture.assertOwned();const flow=W.PSFlow,app=fixture.app,generation=app.stateGeneration,priorStart=Object.getOwnPropertyDescriptor(app,'startBattle'),original=E.app.GameApplication.prototype.startBattle;
  if(flow._app!==app||app.startBattle!==original||priorStart||flow.running||app.saveBlocked)throw Error('idle unwrapped formal App required');
  const prepared=fixture.prepareCase(options.donorCaseId),source=tools.compileNavigation().cases.find((p:any)=>p.id===options.donorCaseId);
  if(!source)throw Error('known authored policy required');
  const plan={...copy(source),id:options.caseId},request={...copy(prepared.case.request),battleId:options.caseId,kind:prepared.case.request.trainer?'trainer':prepared.case.request.kind,battleEffects:true};
  const setup:any={sourceCase:prepared.case.id,seed:copy(prepared.seed),firstTrainer:null};
  let op:any=null,session:any=null,planner:any=null,oracle:any=null,driver:any=null,failure:any=null,map:any=null,resolved:any=null,restoreConflict=false,observations:any=null,cancelled:any=null;
  const cleanupErrors:any[]=[],decisions:any[]=[],clock=tools.installGameFrames(G,{now:ports.now,setTimer:ports.setTimer,clearTimer:ports.clearTimer});
  const valid=()=>flow._app===app&&app.stateGeneration===generation&&(!op||flow._op===op);
  const assertActive=()=>{if(cancelled)throw cancelled;};
  const dispatch=(type:string,key:string)=>{if(type==='keydown')assertActive();return ports.dispatch(type,key);};
  const cancel=()=>{cancelled??=Error('offline input cancelled');driver?.retire();planner?.retire();for(const key of KEYS)try{ports.dispatch('keyup',key);}catch(error){cleanupErrors.push(error);}try{clock.dispose();}catch(error){cleanupErrors.push(error);}};
  const assertCurrent=()=>{assertActive();fixture.assertOwned();if(!valid()||!flow.running)throw Error('offline opening owner retired');};
  const start=async function(this:any,...args:any[]){
    if(this!==app||args[0]?.battleId!==plan.id)throw Error('unexpected offline App opening');
    assertCurrent();op=flow._op;
    const s=await original.apply(app,args);assertCurrent();
    if(!op||op.request.battleId!==plan.id||s.battleId!==plan.id)throw Error('actual opened Session mismatch');
    if(prepared.case.ordinal===2){
      if(s.foe.kind!=='trainer'||!s.currentRequest()?.active||!s.foeTeam[0])throw Error('first trainer pre-input boundary unavailable');
      s.gw.seedState('p2',[{id:s.foeTeam[0].id,hp:1}]);setup.firstTrainer={side:'p2',id:s.foeTeam[0].id,hp:1,boundary:'actual App result before Scene receives Session'};
    }
    session=s;return s;
  };
  let context:any=null,last:any=null;
  const read=()=>{
    assertActive();if(!planner||!context)throw Error('offline planner not bound');
    last=planner.decide(context);const s=last.snapshot;
    return {...s,owner:planner.owner,gameTick:clock.gameTick(),fast:flow.fast,effects:op?.battleEffects===true,
      phase:s.phase??s.sceneKind,menuToken:s.pageToken??s.menuToken,items:s.items??[],index:s.index??0,columns:s.columns??1};
  };
  const wait=()=>{assertActive();return clock.nextGameUpdate(ports.deadline);};
  try{
    ports.signal?.addEventListener('abort',cancel,{once:true});if(ports.signal?.aborted)cancel();assertActive();
    Object.defineProperty(app,'startBattle',{value:start,configurable:true,enumerable:false,writable:false});
    flow.openBattle(request);op=flow._op;
    while(!session||G.SceneManager._scene?._session!==session){assertCurrent();if(!flow.running)throw Error('offline opening stopped: '+String(flow.lastOutcome?.error));await wait();}
    assertCurrent();if(op.session!==session)throw Error('actual Scene/Session opening not atomic');
    // Restore only our temporary App bridge. The production factory and its private settlement identity were never copied.
    if(app.startBattle===start)delete app.startBattle;else throw Error('offline App bridge ownership changed');
    oracle=bindNormalIntentOracle(E,G,W,fixture,plan);planner=bindNormalContinuation(tools,E,G,W,fixture,plan,clock);
    driver=new tools.NormalDriver({...clock,now:ports.now,read,dispatch},planner.owner);
    let pocketIndex=-1;const visitedPockets=new Set<number>();
    for(;;){
      oracle.poll();context=oracle.context();const snapshot=read(),out=last,decision=out.decision;
      decisions.push({gameTick:clock.gameTick(),intentIndex:context.intentIndex,sceneKind:snapshot.sceneKind,decision:copy(decision)});
      if(decision.kind==='mapReady'){map=decision;resolved=oracle.finish(map);break;}
      if(['blocked','stopped','NEEDS_BINDING'].includes(decision.kind))throw Error('offline decision stopped: '+JSON.stringify(decision));
      if(decision.kind==='wait'){await wait();continue;}
      if(decision.kind==='choose')await driver.choose(decision.phase,decision.key,ports.deadline);
      else if(decision.kind==='ackPaused')await driver.acknowledgePause(ports.deadline);
      else if(decision.kind==='ackStats')await driver.acknowledgeStats(decision.level,decision.phase,ports.deadline);
      else if(decision.kind==='acknowledge')await driver.exclusive(async()=>{
        const s=driver.inspect(ports.deadline);
        if(last.decision.kind!=='acknowledge'||last.decision.pageToken!==decision.pageToken||s.ready!==true)throw Error('continuation ACK view changed');
        await driver.pulse('ok',ports.deadline,s);
      });
      else if(decision.kind==='NEEDS_ADAPTER'&&decision.adapter==='bag-pocket-pulse')await driver.exclusive(async()=>{
        const s=driver.inspect(ports.deadline);
        if(s.phase!=='bag'||s.ready!==true||s.bag?.kind!=='items'||last.decision.targetPocket!==decision.targetPocket)throw Error('actual bag pocket view changed');
        if(pocketIndex!==context.intentIndex){pocketIndex=context.intentIndex;visitedPockets.clear();}
        if(visitedPockets.has(s.bag.pocket)||visitedPockets.size>=8)throw Error('actual pocket navigation did not reach its catalog target');
        visitedPockets.add(s.bag.pocket);await driver.pulse('right',ports.deadline,s);
      });
      else throw Error('unresolved offline input decision: '+JSON.stringify(decision));
    }
  }catch(error){failure=cancelled??error;}
  finally{
    ports.signal?.removeEventListener('abort',cancel);
    driver?.retire();planner?.retire();
    for(const key of KEYS)try{ports.dispatch('keyup',key);}catch(error){cleanupErrors.push(error);}
    try{clock.dispose();}catch(error){cleanupErrors.push(error);}
    if(oracle){try{observations=oracle.observations();const retired=oracle.dispose();if(!retired.restored)cleanupErrors.push(Error('Session observer binding ownership changed: '+retired.conflicts.join(',')));}catch(error){cleanupErrors.push(error);}}
    if(app.startBattle===start){try{if(priorStart)Object.defineProperty(app,'startBattle',priorStart);else delete app.startBattle;}catch(error){cleanupErrors.push(error);}}
    else if(Object.hasOwn(app,'startBattle')&&!priorStart)restoreConflict=true;
    if(failure&&valid()&&op&&flow.running)try{flow.abort(failure,op);}catch(error){cleanupErrors.push(error);}
  }
  const receipt={version:'D2-offline-input-case-v1',scope:'OFFLINE_CONTROL',donorCaseId:prepared.case.id,caseId:plan.id,setup,
    status:failure||cleanupErrors.length||restoreConflict?'FAIL':'OFFLINE_CASE_RESOLVED',resolved,decisions,inputs:copy(driver?.inputs??[]),
    observations,error:describeError(failure),cleanupErrors:cleanupErrors.map(String),restoreConflict,nativeAdmission:false,traceQualified:false,deadlineQualified:false,full100Accepted:false};
  if(failure||cleanupErrors.length||restoreConflict){const error=new Error('offline normal input execution failed',{cause:failure??cleanupErrors[0]});Object.assign(error,{receipt,primary:failure,cleanupErrors});throw error;}
  return receipt;
}

/** Frozen workload order with distinct owned IDs; failures stop the sequence and are never retried. */
export async function executeOfflineNormalWorkload(E:any,G:any,W:any,fixture:any,tools:any,options:any,portsForCase:any):Promise<any>{
  if(options?.scope!=='OFFLINE_CONTROL'||!/^owned-[A-Za-z0-9_-]+$/.test(options.caseIdPrefix??'')||typeof portsForCase!=='function')throw Error('explicit offline workload owner and case ports required');
  const donor=fixture.data.donor,count=options.caseCount??donor.cases.length;
  if(!Number.isSafeInteger(count)||count<1||count>donor.cases.length)throw Error('bounded frozen workload prefix required');
  const cases:any[]=[];
  try{for(const c of donor.cases.slice(0,count)){
    const caseId=options.caseIdPrefix+'-'+String(c.ordinal+1).padStart(3,'0');
    cases.push(await executeOfflineNormalCase(E,G,W,fixture,tools,{scope:'OFFLINE_CONTROL',donorCaseId:c.id,caseId},portsForCase(c.id,caseId)));
  }}catch(cause){const error=new Error('offline workload stopped without retry',{cause});Object.assign(error,{completed:cases,failed:(cause as any)?.receipt??null});throw error;}
  return {version:'D2-offline-input-workload-v1',scope:'OFFLINE_CONTROL',status:'OFFLINE_PREFIX_RESOLVED',sourceCount:donor.cases.length,executedCount:count,cases,
    nativeAdmission:false,traceQualified:false,deadlineQualified:false,full100Accepted:false};
}
