/** Read adapter connecting reviewed normal-input core to actual current Scene/source observations. No input is sent. */
import { createForcedSelectionObserver } from './forced-request-observer';
export function bindNormalBattle(tools: any,E: any,G: any,W: any,clock: any): any {
  const flow=W.PSFlow,scene=G.SceneManager._scene,session=scene?._session;
  if(!session||flow?._op?.session!==session||flow?._app?.saveBlocked!==true)throw Error('actual normal App/Session owner required');
  const first=E.session.readSessionRequestContext(session);
  if(first.status==='unavailable'||!Number.isSafeInteger(first.requestViewEpoch))throw Error('normal Session source view unavailable');
  const original=tools.bindBattleScene(G,W,clock,()=>flow._op?.battleEffects===true),owner=Object.freeze({original:original.owner,session,epoch:first.requestViewEpoch});
  const forced=createForcedSelectionObserver(()=>G.SceneManager._scene);
  const binding: any={owner,
    read(){
      const base=original.read(),bag=scene.battleBagState?.()??null,cards=scene.presentationState?.().cards??[];
      // Scene.showMoves assigns request slot i the menu key i+1; navigation indexes by that key.
      const request=session.currentRequest(),moveIds=Object.fromEntries((request?.active?.[0]?.moves??[]).map((m: any,i: number)=>[i+1,m.id]));
      const observed=scene.requestObservationState?.();
      const current=base.current===true&&G.SceneManager._scene===scene&&scene._session===session&&flow._op?.session===session
        &&observed?.current===true&&observed.status!=='unavailable'&&observed.requestViewEpoch===owner.epoch;
      const foes=cards.filter((m: any)=>m.side==='p2'&&m.active&&m.hp>0);
      return {...base,...(observed?.status==='available'?observed:{}),owner,current,sceneKind:'battle',
        partySub:scene._partySub??null,selectedMemberId:scene._partySelected??null,moveIds,bag,
        ...(foes.length===1?{activeFoeStableId:foes[0].id}:{}),
        forcedRequestToken:current&&observed.status==='available'?observed.source.occurrenceId:null};
    },
    catalogPockets(){return Object.fromEntries(Object.values(E.itemCatalog.catalogOf(session.content)).map((x: any)=>[x.id,x.pocket]));},
  };
  binding.decide=(casePlan: any,context: any)=>{
    if(casePlan.id!==session.battleId||context.caseId!==session.battleId)throw Error('normal case/session mismatch');
    const snapshot=binding.read();if(!snapshot.current)throw Error('normal battle owner retired');
    const observed=forced.sample({caseId:context.caseId,intentIndex:context.intentIndex,memberId:'P1'});
    const next={...context,ownerToken:snapshot.ownerToken,catalogPockets:binding.catalogPockets(),activeFoeStableId:snapshot.activeFoeStableId};
    delete next.forcedReplacement;
    if(snapshot.phase==='party-forced'||snapshot.phase==='party-command'&&snapshot.partySub==='forced') {
      if(!['selection','confirmation'].includes(observed.status)||observed.snapshot?.ownerToken!==snapshot.ownerToken
        ||observed.snapshot?.source?.occurrenceId!==snapshot.forcedRequestToken||observed.snapshot?.requestViewEpoch!==snapshot.requestViewEpoch
        ||(['phase','ready','menuToken','partySub','selectedMemberId'] as const).some(key=>observed.snapshot?.[key]!==snapshot[key]))throw Error('normal forced transition source unavailable');
      if(observed.status==='confirmation')next.forcedReplacement={caseId:context.caseId,intentIndex:context.intentIndex,
        ownerToken:snapshot.ownerToken,requestToken:snapshot.forcedRequestToken,memberId:'P1'};
    }
    return {decision:tools.nextDecision(casePlan,next,snapshot),context:next,snapshot};
  };
  return Object.freeze(binding);
}
