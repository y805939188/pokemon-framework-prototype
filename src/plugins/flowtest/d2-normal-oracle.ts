/** Private per-Session action observations for the offline input tool; JSON/input acknowledgements cannot advance intent. */
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const actor=(v: unknown,side: string,id?: string)=>typeof v==='string'&&new RegExp('^'+side+'[a-z]?: ').test(v)&&(!id||v.slice(v.indexOf(': ')+2)===id);
export function bindNormalIntentOracle(E: any,G: any,W: any,fixture: any,casePlan: any): any {
  const plan=copy(casePlan),flow=W.PSFlow,app=flow._app,op=flow._op,session=op?.session,scene=G.SceneManager._scene,generation=app?.stateGeneration;
  if(!session||scene?._session!==session||fixture.app!==app||session.battleId!==plan.id||op.request.battleId!==plan.id)throw Error('actual owned case required for intent observations');
  fixture.assertOwned();
  const epoch=E.session.readSessionRequestContext(session).requestViewEpoch,methods=['chooseMove','chooseSwitch','useItem','throwBall','decideLearn','run'];
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),wrappers=new Map<string,any>(),queue: any[]=[],history: any[]=[],steps: any[]=[],events: any[]=[];
  const initial=fixture.state();let retired='',index=0,offset=0,serial=0,moveCount=0,disposed=false;
  const valid=()=>{
    if(disposed||flow._app!==app||app.stateGeneration!==generation||flow._op!==op||op.session!==session)return false;
    try{fixture.assertOwned();return E.session.readSessionRequestContext(session).requestViewEpoch===epoch;}catch{return false;}
  };
  const state=()=>({bag:copy(session.bag),forced:!!session.currentRequest()?.forceSwitch?.some(Boolean),
    source:E.session.readSessionRequestContext(session),ledger:copy(session.ledger),
    live:copy(session.gw.readState('p1')),party:copy(session.party),
    summary:Object.fromEntries(session.party.map((m: any)=>[m.id,E.battlePresentation.readBattleSummary(session,m.id)]))});
  for(const name of methods){
    const original=E.session.BattleSession.prototype[name],desc=Object.getOwnPropertyDescriptor(session,name);
    if(typeof original!=='function'||desc||session[name]!==original)throw Error('intent observer requires unwrapped production Session methods');
    descriptors.set(name,desc);
  }
  try{for(const name of methods){
    const original=E.session.BattleSession.prototype[name];
    const wrapper=async function(this: any,...args: any[]){
      const owned=this===session&&valid();let before: any;
      if(owned){try{before=state();}catch{retired='action observation unavailable';}}
      let value:any;
      try{value=await original.apply(this,args);}
      catch(error){if(owned)retired='real Session action rejected: '+String(error);throw error;}
      try{
        if(owned&&before&&!retired){
          if(!valid())retired='action observation owner/epoch retired';
          else {
            const messages=Array.isArray(value)?value:value?.messages??[];
            queue.push({serial:++serial,method:name,args:copy(args),before,after:state(),ok:Array.isArray(value)||value?.ok===true,messages:copy(messages),finished:session.finished,
              ...(session.finished?{result:copy(session.result())}:{})});
          }
        }
      }catch(error){retired='action observation unavailable: '+String(error);}
      return value; // Observation failure cannot change the exact actual result or rejection.
    };
    wrappers.set(name,wrapper);Object.defineProperty(session,name,{value:wrapper,configurable:true,enumerable:false,writable:false});
  }}catch(error){for(const [name,wrapper]of wrappers)if(session[name]===wrapper)delete session[name];throw error;}
  const has=(row: any,type: string,predicate: (e: any)=>boolean)=>row.messages.some((m: any)=>m.kind==='events'&&m.events.some((e: any)=>e.type===type&&predicate(e)));
  const event=(row: any,kind: string,id: string,status: string)=>has(row,'rpg',(e: any)=>e.args[0]===kind&&e.args[1]==='p1'&&e.args[2]===id&&e.args[4]===status);
  const spent=(row: any,kind: string,id: string,target?: string)=>{
    const old=row.before.ledger.length,added=row.after.ledger.slice(old);
    return row.after.bag[id]===row.before.bag[id]-1&&added.length===1&&added[0].kind===kind&&added[0].itemId===id&&added[0].state==='consumed'&&(!target||added[0].target===target);
  };
  const complete=(row: any)=>{steps.push({index,step:plan.policy[index].step,actionSerial:row.serial});index++;moveCount=0;};
  return Object.freeze({
    context(){return {caseId:plan.id,intentIndex:index};},
    observations(){return copy({retired,index,offset,history,pending:queue.slice(offset)});},
    poll(){try{
      if(retired)throw Error(retired);
      if(!valid()){retired='intent observation owner/epoch retired';throw Error(retired);}
      while(offset<queue.length){
        const row=queue[offset++];history.push(row);for(const m of row.messages)if(m.kind==='events')events.push(...m.events);
        if(!row.ok){retired='real planned action refused';throw Error(retired);}
        const intent=plan.policy[index];if(!intent){retired='extra real action after all intentions';throw Error(retired);}
        if(row.method==='chooseSwitch'&&row.before.forced){
          if(row.args[0]!=='P1'||row.before.source.status!=='available'||!has(row,'switch',e=>actor(e.args[0],'p1','P1')))throw Error('unresolved real forced replacement');
          continue; // A real forced P1 replacement is a branch of the current intention, not the next business step.
        }
        if(row.method==='decideLearn'){
          if(intent.learnSlot!==3||row.args[0]!==3||!row.messages.some((m: any)=>m.kind==='learned'&&m.member==='P2'&&m.move==='growl'&&m.replaced===3))throw Error('unexpected actual learning decision');
          // Learning does not finish moveUntilEnd; its real terminal result is still required below.
        }else if(intent.kind==='item'){
          if(row.method!=='useItem'||row.args[0]!==intent.item||row.args[1]!==intent.member||!spent(row,'item',intent.item,intent.member)||!event(row,'item',intent.item,'ok'))throw Error('actual item effect/ledger does not match intention');
          complete(row);continue;
        }else if(intent.kind==='switch'){
          if(row.method!=='chooseSwitch'||row.args[0]!==intent.member||!has(row,'switch',e=>actor(e.args[0],'p1',intent.member)))throw Error('actual voluntary switch does not match intention');
          complete(row);continue;
        }else if(intent.kind==='ball'){
          const status=intent.expected==='blocked'?'blocked':'caught';
          if(row.method!=='throwBall'||row.args[0]!==intent.item||!spent(row,'ball',intent.item)||!event(row,'ball',intent.item,status))throw Error('actual ball effect/ledger does not match intention');
          if(status==='caught'&&(!row.finished||row.result.outcome.kind!=='caught'||row.result.captured.length!==1))throw Error('actual capture result missing');
          complete(row);continue;
        }else if(intent.kind==='moveUntilEnd'){
          if(row.method!=='chooseMove'||row.args[0]!==intent.legacyMenuKey)throw Error('unexpected actual move action');
          if(++moveCount>16)throw Error('inherited real finishing-action guard exceeded');
          const moved=has(row,'move',e=>actor(e.args[0],'p1')&&String(e.args[1]).toLowerCase().replace(/[^a-z0-9]/g,'')===intent.move);
          const defeat=intent.step==='memento-or-genuine-defeat'&&row.finished&&E.app.outcomeCode(row.result)===4&&row.after.live.every((m: any)=>m.hp===0);
          if(!moved&&!defeat)throw Error('actual player move or genuine defeat missing');
        }else throw Error('unresolved actual intention');
        if(row.finished){
          if(E.app.outcomeCode(row.result)!==plan.expected.code)throw Error('unexpected real terminal outcome');
          if(intent.learnSlot===3&&!history.some(r=>r.messages.some((m: any)=>m.kind==='learned'&&m.member==='P2'&&m.move==='growl'&&m.replaced===3)))throw Error('actual intended learning missing');
          complete(row);
        }
      }
      return {caseId:plan.id,intentIndex:index,total:plan.policy.length,complete:index===plan.policy.length,steps:copy(steps),actionCount:history.length};
    }catch(error){retired=retired||String(error);throw error;}},
    finish(map: any){try{
      const progress=this.poll();if(!progress.complete||map.kind!=='mapReady'||map.caseId!==plan.id)throw Error('semantic intentions incomplete at Map boundary');
      const final=fixture.state(),expected=plan.expected,current=G.SceneManager._scene,outcome=flow.lastOutcome,ledger=final.appliedBattles,entry=ledger[plan.id];
      if(!(current instanceof G.Scene_Map)||!current.isStarted?.()||G.SceneManager.isSceneChanging()||current.isBusy?.()||G.$gameMessage?.isBusy?.()
        ||!current._messageWindow||!current._spriteset||flow.running||app.saveBlocked||flow.operationPending()
        ||app.pendingReceiving||app.pendingPokedex||app.pendingEvolution||app.pendingLearning||app.pendingTriggeredEvolution||app.pendingTrade
        ||outcome?.battleId!==plan.id||outcome.code!==expected.code||outcome.commit!=='applied'||outcome.aborted
        ||!/^[0-9a-f]{64}$/.test(entry?.settlement?.pairHash??'')||map.pairHash!==entry.settlement.pairHash
        ||Object.keys(ledger).filter(id=>!Object.hasOwn(initial.appliedBattles,id)).join(',')!==plan.id
        ||Object.keys(initial.appliedBattles).some(id=>JSON.stringify(ledger[id])!==JSON.stringify(initial.appliedBattles[id])))throw Error('actual committed ready Map and unchanged paired ledger history required');
      if(!valid()||G.SceneManager._scene!==current)throw Error('Map observation owner retired');
      if(expected.trainerFullRestore!==undefined){
        const count=events.filter(e=>e.type==='rpg'&&e.args[0]==='item'&&e.args[1]==='p2'&&e.args[2]==='fullrestore'&&e.args[4]==='ok').length;
        if(count!==expected.trainerFullRestore)throw Error('actual trainer Full Restore count mismatch');
      }
      if(expected.heldConsumed){const id=expected.heldConsumed;if(!events.some(e=>String(e.type).replace(/^-/,'')==='enditem'&&actor(e.args[0],'p1',id))||final.party.find((m: any)=>m.id===id)?.item!=='')throw Error('actual held consumption missing');}
      if(expected.heldRestored){const id=expected.heldRestored,original=initial.party.find((m: any)=>m.id===id)?.item;
        if(!original||!history.some(r=>[r.before,r.after].some(s=>s.summary[id]?.heldItemKnown&&s.summary[id].item===''))||final.party.find((m: any)=>m.id===id)?.item!==original)throw Error('actual temporary held loss/restoration missing');}
      if(expected.learning&&!final.party.find((m: any)=>m.id==='P2')?.moves.some((m: any)=>m.id==='growl'))throw Error('actual learned move not persisted');
      if(expected.healed&&app.describeParty().members.some((m: any)=>m.hp!==m.maxhp||m.status||m.moves.some((x: any)=>x.pp!==x.maxpp)))throw Error('actual defeat healing missing');
      if(expected.blackout&&(flow.lastOutcome?.blackout!==true||flow.lastReturn?.status!=='requested'))throw Error('actual blackout return request missing');
      return {...progress,status:'OFFLINE_SEMANTIC_CASE_RESOLVED',actions:copy(history),map:copy(map),nativeAdmission:false,traceQualified:false};
    }catch(error){retired=retired||String(error);throw error;}},
    dispose(){
      disposed=true;const conflicts=[];
      for(const [name,wrapper]of wrappers){if(session[name]===wrapper){const desc=descriptors.get(name);if(desc)Object.defineProperty(session,name,desc);else delete session[name];}else conflicts.push(name);}
      return {restored:conflicts.length===0,conflicts};
    },
  });
}
