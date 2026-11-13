/** Dormant same-case continuation planner. Reads real App/Scenes; never sends input or advances business intentions. */
import { bindNormalBattle } from './d2-normal-battle';
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function bindNormalContinuation(tools: any,E: any,G: any,W: any,fixture: any,casePlan: any,clock: any): any {
  const plan=copy(casePlan),flow=W.PSFlow,app=flow?._app,system=G.$gameSystem,op=flow?._op,scene=G.SceneManager._scene,session=scene?._session;
  if(!plan?.id||!Array.isArray(plan.policy)||!Number.isSafeInteger(plan.expected?.code))throw Error('normal case plan required');
  if(!(app instanceof E.app.GameApplication)||fixture?.app!==app||typeof fixture.assertOwned!=='function'
    ||!session||op?.session!==session||op.request?.battleId!==plan.id||session.battleId!==plan.id||!app.saveBlocked)throw Error('owned formal normal case required');
  fixture.assertOwned();
  const generation=app.stateGeneration,battle=bindNormalBattle(tools,E,G,W,clock),requestEpoch=battle.owner.epoch,owner=Object.freeze({version:'normal-case-continuation-v1',caseId:plan.id});
  const previousLedger=copy(fixture.state().appliedBattles);
  if(Object.hasOwn(previousLedger,plan.id))throw Error('normal continuation requires a new case ledger');
  let retired='',lastTick=-1,page: any=null;
  const valid=()=>{
    if(retired||G.$gameSystem!==system||flow._app!==app||app.stateGeneration!==generation||flow._op!==op||op.session!==session)return false;
    try{fixture.assertOwned();return flow.fast===false&&op.battleEffects===true;}catch{return false;}
  };
  const result=(sceneKind: string,decision: any,snapshot: any={})=>({scope:'OFFLINE_CASE_CONTINUATION_OBSERVER',nativeAdmission:false,fullTraceAccepted:false,
    decision,snapshot:{owner,caseId:plan.id,sceneKind,current:true,...snapshot}});
  const blocked=(reason: string)=>result('unavailable',{kind:'blocked',reason},{current:false});
  const wait=(kind: string,reason: string,extra: any={})=>result(kind,{kind:'wait',reason},{ready:false,...extra});
  const pending=()=>!!(app.pendingReceiving||app.pendingPokedex||app.pendingEvolution||app.pendingLearning||app.pendingTriggeredEvolution||app.pendingTrade);
  return Object.freeze({owner,
    retire(){retired='explicit retirement';page=null;},
    decide(context: any){
      if(retired)return blocked(retired);
      const current=G.SceneManager._scene;
      if(typeof G.Scene_Title==='function'&&current instanceof G.Scene_Title){retired='title boundary';page=null;return result('title',{kind:'stopped',reason:retired},{current:false});}
      if(!valid()){retired='normal case owner retired';page=null;return blocked(retired);}
      if(context?.caseId!==plan.id||!Number.isSafeInteger(context.intentIndex)||context.intentIndex<0)throw Error('normal continuation context mismatch');
      const tick=clock.gameTick();
      if(!Number.isSafeInteger(tick)||tick<lastTick){retired='normal game clock retired';return blocked(retired);}lastTick=tick;
      if(current===scene){
        page=null;
        if(!flow.running)return blocked('battle stopped before the case boundary');
        const view=E.session.readSessionRequestContext(session);
        if(view.requestViewEpoch!==requestEpoch){retired='normal Session observation generation retired';return blocked(retired);}
        if(view.status==='unavailable')return view.reason==='request-view-busy'?wait('battle','actual Session action is in progress'):blocked('normal Session view unavailable');
        let observedOutcomeCode: number|undefined;
        if(session.finished){
          const raw=session.result();if(raw.battleId!==plan.id)return blocked('terminal case mismatch');
          observedOutcomeCode=E.app.outcomeCode(raw);
          if(observedOutcomeCode!==plan.expected.code)return blocked('unexpected actual terminal outcome');
        }
        // Actual Session result overrides any caller-provided terminal metadata.
        let out: any;
        try{out=battle.decide(plan,{...context,observedOutcomeCode});}
        catch(error){
          const after=E.session.readSessionRequestContext(session);
          if(valid()&&G.SceneManager._scene===current&&after.requestViewEpoch===requestEpoch&&after.reason==='request-view-busy')return wait('battle','actual Session action is in progress');
          retired='normal battle observation rejected';return blocked(retired+': '+String(error));
        }
        if(!valid()||G.SceneManager._scene!==current||out.snapshot.current!==true){retired='normal battle view retired';return blocked(retired);}
        return result('battle',out.decision,{...out.snapshot,owner,observedOutcomeCode});
      }
      if(typeof W.Scene_PSManagement==='function'&&current instanceof W.Scene_PSManagement){
        page=null;const ui=W.PSManagement.normalObservationState?.(),receiving=app.pendingReceiving,outcome=flow.lastOutcome;
        if(!valid()||G.SceneManager._scene!==current)return blocked('receiving owner changed during projection');
        if(receiving){
          if(receiving.profile.mode!==1||receiving.profile.naming!==1)return blocked('normal receiving profile changed');
          if(outcome?.battleId!==plan.id||outcome.pending!==true||outcome.code!==plan.expected.code)return blocked('receiving case outcome unavailable');
          if(ui?.status==='available'&&(ui.requestKind!=='receiving'||ui.receivingToken!==receiving.token||ui.generation!==generation||ui.viewKind||ui.error))return blocked('unexpected interactive normal receiving question');
          return wait('receiving','actual mode1/naming1 receiving handoff');
        }
        if(ui?.status==='available'&&(ui.requestKind!=='receiving'||ui.viewKind||ui.error))return blocked('unrelated management presenter');
        return wait('receiving','receiving presenter is completing its actual transition');
      }
      const continuation=W.PSEvolution?.normalObservationState?.();
      if(!valid()||G.SceneManager._scene!==current){retired='normal continuation projection owner retired';return blocked(retired);}
      if(continuation?.status==='available'){
        const ui=continuation,dex=app.pendingPokedex,growth=app.pendingEvolution;
        if(!valid()||G.SceneManager._scene!==current)return blocked('continuation owner changed during projection');
        const root=dex?.parentToken??growth?.token;
        if(ui.current!==true||ui.battleId!==plan.id||ui.generation!==generation||!root||ui.owner!==root||app.pendingTrade||app.pendingTriggeredEvolution)return blocked('unrelated continuation owner');
        if(ui.error||ui.layer==='recovery')return blocked('continuation recovery requires an explicit policy');
        if(ui.layer==='animation'){page=null;return wait('continuation','natural evolution presentation');}
        if(!dex||!['dex-message','entry'].includes(ui.layer))return blocked('normal continuation layer needs an adapter');
        if(dex.phase!==(ui.layer==='entry'?'entry':'message'))return blocked('continuation phase changed during projection');
        const pageToken=JSON.stringify([ui.sceneToken,ui.owner,dex.token,dex.revision,ui.layer]);
        if(ui.ready!==true){page=null;return wait('continuation','continuation release boundary',{pageToken});}
        if(!page||page.scene!==current||page.token!==pageToken){page={scene:current,token:pageToken,tick};return wait('continuation','independent later game update required',{pageToken});}
        if(tick<=page.tick)return wait('continuation','independent later game update required',{pageToken});
        return result('continuation',{kind:'acknowledge',key:'ok',target:'pokedex',layer:ui.layer,pageToken},{ready:true,pageToken});
      }
      page=null;
      if(typeof G.Scene_Map==='function'&&current instanceof G.Scene_Map){
        if(pending()||flow.running||app.saveBlocked||flow.operationPending())return wait('map','actual case continuation has not released its root');
        if(!current.isStarted?.()||G.SceneManager.isSceneChanging()||current.isBusy?.()||G.$gameMessage?.isBusy?.()
          ||!current._messageWindow||!current._spriteset)return wait('map','actual map is not fully ready');
        const state=fixture.state(),outcome=flow.lastOutcome,ledger=state.appliedBattles,entry=ledger[plan.id];
        if(!valid()||G.SceneManager._scene!==current)return blocked('map owner changed during projection');
        if(outcome?.battleId!==plan.id||outcome.code!==plan.expected.code||outcome.commit!=='applied'||outcome.aborted)return blocked('case did not commit the expected actual outcome');
        if(!/^[0-9a-f]{64}$/.test(entry?.settlement?.pairHash??''))return blocked('actual paired ledger unavailable');
        const added=Object.keys(ledger).filter(id=>!Object.hasOwn(previousLedger,id));
        if(added.length!==1||added[0]!==plan.id||Object.keys(previousLedger).some(id=>JSON.stringify(ledger[id])!==JSON.stringify(previousLedger[id])))return blocked('case ledger history changed');
        return result('map',{kind:'mapReady',caseId:plan.id,outcomeCode:outcome.code,commit:'applied',pairHash:entry.settlement.pairHash},{ready:true});
      }
      return blocked('current Scene needs an explicit normal adapter');
    },
  });
}
