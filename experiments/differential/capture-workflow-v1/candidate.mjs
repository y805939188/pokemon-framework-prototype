import {serialize} from 'node:v8';
// Actual production GameApplication; only upstream captured-success facts and host ports are synthetic.
import {clone,need,hashJSON,canonical,sha} from './safe.mjs';
import {BOUNDS,OPERATION} from './constants.mjs';
export function returnFact(v){
 const object=v!==null&&typeof v==='object';return {type:v===undefined?'undefined':v===null?'null':typeof v==='string'?'string':typeof v==='number'?'integer':typeof v==='boolean'?'boolean':'object',integerValue:typeof v==='number'?v:null,booleanValue:typeof v==='boolean'?v:null,value:typeof v==='string'?v:null,status:object?v.status??null:null,commit:object?v.commit??null:null,pending:object?v.pending??null:null,aborted:object?v.aborted??null:null,code:object?v.code??null:null,errorPresent:object&&Object.hasOwn(v,'error')};
}
function memberView(E,m,key,c){
 const maxHP=E.growth.computeStats(c.species[m.species].base,m.ivs,m.evs,m.level,m.statNature??m.nature).hp;
 const fields=['species','form','personalID','gender','shiny','superShiny','level','exp','owner','origin','hp','status','statusCount','firstMoves','ability','abilityIndex','effectiveAbilityIndex','friendship','nature','ivs','evs','item','mail','isEgg','cannotStore','cannotRelease','cannotTrade','ball','markings','ribbons'];
 for(const k of fields)need(Object.hasOwn(m,k),'PROJECTION_MEMBER_MISSING');
 const origin=clone(m.origin);delete origin.compatibilityDefault;
 return {key,...Object.fromEntries(fields.map(k=>[k,clone(m[k])])),origin,nickname:m.nickname??null,maxHP,moves:m.moves.map(x=>({id:x.id,pp:x.pp,maxpp:x.maxpp,ppUps:x.ppUps}))};
}
const memberAllowed=['id','species','form','nickname','level','exp','hp','status','statusCount','moves','item','ability','nature','statNature','gender','ivs','evs','friendship','ball','ot','personalID','owner','ownerCompatibilityDefault','origin','abilityIndex','effectiveAbilityIndex','shiny','superShiny','firstMoves','markings','ribbons','cannotStore','cannotRelease','cannotTrade','isEgg','mail','readyToEvolve','evolutionReadiness'];
const stateAllowed=['schema','party','storage','player','nextMemberOrdinal','inventory','badges','money','dex','appliedBattles','claims','stats','steps'];
export async function runCase(E,fixture,{onNative=()=>{}}={}){
 const {definition:d,content:c}=fixture;let installed=clone(fixture.state),app,handle,raw,templates={},idKeys=new Map(),keyIds=new Map(),reads=0,writes=0,readbacks=0,setupDraws=0,businessDraws=0,phase='setup',lastOutcome=null,decisionIndex=0,lastInstalled=null;
 const nativeCalls=[],events=[],checkpoints=[],decisions={};
 const originalMembers=new Map([...installed.party,...installed.storage.boxes.flatMap(b=>b.slots.filter(Boolean))].map(m=>[m.id,clone(m)]));
 for(const m of originalMembers.values()){idKeys.set(m.id,m.id);keyIds.set(m.id,m.id);}
 const key=id=>{need(idKeys.has(id),'PROJECTION_UNKNOWN_MEMBER');return idKeys.get(id);};
 function projection(){
  need(Object.keys(installed).every(k=>stateAllowed.includes(k)),'PROJECTION_UNSUPPORTED');
  const all=[...installed.party,...installed.storage.boxes.flatMap(b=>b.slots.filter(Boolean))],members={};
  const available=new Map([...Object.entries(templates),...all.map(m=>[m.id,m])]);
  const unexpected=[];
  for(const [id,m]of available){need(Object.keys(m).every(k=>memberAllowed.includes(k)),'PROJECTION_UNSUPPORTED');members[key(id)]=memberView(E,m,key(id),c);
   const before=originalMembers.get(id);if(before){const core=['ownerCompatibilityDefault','origin.compatibilityDefault','statNature','ot','readyToEvolve','evolutionReadiness'];for(const f of core){const value=x=>f.split('.').reduce((v,k)=>v?.[k],x)??null,a=value(before),b=value(m);if(canonical(a)!==canonical(b))unexpected.push({path:`member.${key(id)}.${f}`,beforeSHA256:hashJSON(a),afterSHA256:hashJSON(b),beforeValue:clone(a),afterValue:clone(b)});}}
  }
  const dex=clone(installed.dex);delete dex.layoutIdentity;
  return {partyOrder:installed.party.map(m=>key(m.id)),storage:{currentBox:installed.storage.currentBox,boxes:installed.storage.boxes.map(b=>({name:b.name,slots:b.slots.map(m=>m?key(m.id):null)}))},members,dex,protected:{money:installed.money,inventorySHA256:hashJSON(E.inventory.aggregateBag(installed.inventory)),inventoryCounts:E.inventory.aggregateBag(installed.inventory),playerSHA256:hashJSON(installed.player),badgesSHA256:hashJSON(installed.badges),steps:installed.steps,storageAppearanceSHA256:hashJSON(installed.storage.boxes.map(b=>b.wallpaper))},unexpectedChanges:unexpected};
 }
 function checkpoint(phase){need(checkpoints.length<BOUNDS.checkpoints,'PROJECTION_UNSUPPORTED');checkpoints.push({ordinal:checkpoints.length,atCall:nativeCalls.length,phase,state:projection()});return checkpoints.length-1;}
 function event(kind,member=null,action='none',cp=null){need(events.length<BOUNDS.events,'PROJECTION_UNSUPPORTED');events.push({ordinal:events.length+1,kind,member,action,checkpoint:cp});}
 function saveNative(role,lifecycle,value){const bytes=serialize(value),ordinal=nativeCalls.length+1;need(bytes.length<=1048576,'NATIVE_EVIDENCE_LIMIT');onNative({ordinal,role,lifecycle,bytes});return sha(bytes);}
 function call(role,fn){need(nativeCalls.length<BOUNDS.calls,'PROJECTION_UNSUPPORTED');let v;try{v=fn();need(!v?.then,'UNEXPECTED_ASYNC_BUSINESS');nativeCalls.push({ordinal:nativeCalls.length+1,role,lifecycle:'returned',returnFact:returnFact(v),errorClass:null,boundary:null,evidenceSHA256:saveNative(role,'returned',v)});lastOutcome=v;}
  catch(e){if(e.code)throw e;nativeCalls.push({ordinal:nativeCalls.length+1,role,lifecycle:'raised',returnFact:null,errorClass:e.constructor.name,boundary:null,evidenceSHA256:saveNative(role,'raised',e)});lastOutcome=null;}
  checkpoint('after-call');return v;
 }
 const complete=value=>({status:'complete',value}),faint=()=>({coverage:{status:'complete'},positiveOccurrences:[]});
 const sessions={async create(request,game,setup){
  raw={protocol:1,battleId:request.battleId,outcome:{kind:'caught',winner:null,target:setup.foes[0].id,ball:'pokeball'},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}};
  setup.foes.forEach((foe,i)=>{const q=`Q0${i+1}`;idKeys.set(foe.id,q);keyIds.set(q,foe.id);const caught={...clone(foe),hp:3,status:'psn',statusCount:0,moves:foe.moves.map(m=>({...m,pp:7}))};templates[foe.id]=E.speciesKey.toPersistentMember(caught,c);raw.captured.push(E.state.protocolMember(caught));});
  handle={result:()=>clone(raw)};sessions.game=clone(game);sessions.setup=clone(setup);return handle;
 },effects(h,binding){need(h===handle,'FIXTURE_HANDLE');const ctx=sessions.setup.evidenceContext;
  return {version:2,binding:{...binding},context:{playerIds:[...ctx.playerIds],L0:clone(ctx.initialLevels),engineRosterIds:sessions.game.party.map(m=>m.id),foeIds:sessions.setup.foes.map(m=>m.id),internalBattle:true},observer:{appearances:{},defeats:{},members:Object.fromEntries(sessions.game.party.map(m=>[m.id,{critical:complete(0),damage:complete({total:0,resetCoverage:'complete'}),faint:faint()}]))},control:{members:Object.fromEntries(sessions.game.party.map(m=>[m.id,{friendship:complete({before:m.friendship,current:m.friendship,changes:[]}),faint:faint()}]))}};
 }};
 const state={read(){reads++;if(lastInstalled){need(canonical(installed)===lastInstalled,'INSTALL_READBACK_MISMATCH');readbacks++;lastInstalled=null;}return clone(installed);},replace(next){installed=clone(next);writes++;lastInstalled=canonical(installed);}};
 app=new E.app.GameApplication({state,sessions,projection:{project(){}},content:()=>({content:clone(c)}),clock:()=>0,creationContext:()=>({map:1}),random:n=>{if(phase==='setup')setupDraws++;else businessDraws++;return 0;}},{receivingProfile:{mode:d.mode,naming:d.naming},depositHeal:d.depositHeal});
 const request={battleId:`cap-${d.id}`,kind:'wild',seq:1,foes:Array.from({length:d.queueSize},()=>({species:'Caterpie',level:5})),forceParty:d.mode===2};
 // A real owned start supplies private internalBattle authority. Direct C02 uses the documented public unowned path.
 if(d.internalBattle){handle=await app.startBattle(request);}else{
  raw={protocol:1,battleId:request.battleId,outcome:{kind:'caught',winner:null,target:'Q01',ball:'pokeball'},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}};
  const made=E.memberFactory.createMember({id:'Q01',species:'Caterpie',form:0,level:5,owner:installed.player,context:{map:1,receivedAt:0,playerId:installed.player.id}},c,n=>{setupDraws++;return 0;});
  made.hp=3;made.status='psn';made.statusCount=0;made.moves=made.moves.map(m=>({...m,pp:7}));templates.Q01=E.speciesKey.toPersistentMember(made,c);idKeys.set('Q01','Q01');keyIds.set('Q01','Q01');raw.captured=[E.state.protocolMember(made)];
 }
 need(Object.values(templates).length===fixture.upstream.length,'INITIAL_QUEUE_LENGTH');
 for(const [i,m]of Object.values(templates).entries()){const actual={...clone(m),id:`Q0${i+1}`};need(canonical(actual)===canonical(fixture.upstream[i]),'INITIAL_QUEUE_MISMATCH');}
 phase='business';const initial=projection();need(canonical(initial)===canonical(projectInitial(E,fixture)),'INITIAL_STATE_MISMATCH');if(fixture.initialProjection)need(canonical(initial)===canonical(fixture.initialProjection),'FROZEN_INITIAL_MISMATCH');checkpoint('initial');
 const invoke=()=>d.internalBattle?app.finishBattle(handle,request):app.commitResult(clone(raw),{templates:clone(templates),profile:{mode:d.mode,naming:d.naming}});
 call('terminal-consumer',invoke);
 while(app.pendingReceiving||app.pendingPokedex){
  if(app.pendingReceiving){const p=app.pendingReceiving,dec=d.decisions[decisionIndex++];need(dec,'UNEXPECTED_DECISION');need(p.members.some(m=>key(m.id)===dec.member),'UNEXPECTED_DECISION');
   event('request',dec.member,'receiving',checkpoint('request'));event('decision',dec.member,dec.kind);
   const id=keyIds.get(dec.member);let value;
   if(dec.kind==='keep-name')value={nickname:{kind:'keep'}};
   else if(dec.kind==='set-name')value={nickname:{kind:'set',value:dec.value}};
   else if(dec.kind==='BACK')value={placement:{kind:'box'}}; // Explicit WP38 mode0 BACK transport; mode2 gets the same disallowed box choice, never fallback.
   else if(dec.kind==='replace'){const at=installed.party.findIndex(m=>key(m.id)===dec.target);need(at>=0,'UNEXPECTED_DECISION');value={placement:{kind:'replace',target:{id:keyIds.get(dec.target),position:{kind:'party',index:at}}}};}
   decisions[id]={...decisions[id],...value};call('receive-decision',()=>app.resolveReceiving(p.token,clone(decisions)));
  }else{
   const p=app.pendingPokedex;need(p.phase==='message'||p.phase==='entry','PROJECTION_UNSUPPORTED');const k=key(p.entry.memberId);
   event('request',k,p.phase==='message'?'entry-message':'entry-view',checkpoint('request'));event('decision',k,'entry-ACK');
   call('entry-ack',()=>app.resolvePokedex(p.token,p.revision,{kind:p.phase==='message'?'message-complete':'close-entry'}));
   if(!app.pendingPokedex)event('entry-complete',k);
  }
 }
 need(decisionIndex===d.decisions.length,'UNUSED_DECISION');
 let replay=null;if(d.repeat){event('repeat');const r=call('repeat-consumer',invoke);replay=r?.commit??(typeof r==='string'?r:null);}
 // Re-read through the actual state port after all callbacks, including the last last-seen installation.
 state.read();const final=projection();checkpoint('final');
 const placements=[...keyIds].filter(([k])=>k.startsWith('Q')).flatMap(([k,id])=>{const p=E.storage.locateMember(installed,id)?.position;if(!p)return[];return[{member:k,position:{kind:p.kind,index:p.kind==='party'?p.index:null,box:p.kind==='box'?p.box:null,slot:p.kind==='box'?p.slot:null}}];});
 const installedResult=Object.hasOwn(installed.appliedBattles,request.battleId);
 return {caseId:d.id,operation:OPERATION,initial,final,workflow:{events,checkpoints,placements,queue:{carrier:'app-result-list-and-pending-view',original:raw.captured.map(m=>key(m.id)),remaining:handle?handle.result().captured.map(m=>key(m.id)):raw.captured.map(m=>key(m.id)),pending:app.pendingReceiving?.members.map(m=>key(m.id))??[],repeated:d.repeat},completion:installedResult&&!app.pendingReceiving&&!app.pendingPokedex&&!app.pendingEvolution&&!app.saveBlocked?'completed':'incomplete',refresh:{carrier:'derived-on-query-no-cache',calls:0,callOrdinals:[]},decisionsConsumed:events.filter(e=>e.kind==='decision').length},nativeCalls,integrity:{role:'candidate',readCount:reads,replacements:writes,readbacksVerified:readbacks,actualApp:true,candidateState:{beforeSHA256:hashJSON(fixture.state),afterSHA256:hashJSON(installed),statsBeforeSHA256:hashJSON(fixture.state.stats),statsAfterSHA256:hashJSON(installed.stats),ledgerBeforeSHA256:hashJSON(fixture.state.appliedBattles),ledgerAfterSHA256:hashJSON(installed.appliedBattles),claimsBeforeSHA256:hashJSON(fixture.state.claims),claimsAfterSHA256:hashJSON(installed.claims),inventoryBeforeSHA256:hashJSON(fixture.state.inventory),inventoryAfterSHA256:hashJSON(installed.inventory)},sourceQueueObserved:true,primaryCommitObserved:installedResult,saveBlocked:app.saveBlocked,ledgerReplay:replay,rng:{fixture:fixture.fixtureDraws,setup:setupDraws,business:businessDraws},cleanup:'controlled',unexpectedFields:false}};
}

/** Read-only common initial projection from frozen synthetic inputs; no App or business call. */
export function projectInitial(E,fixture){const state=fixture.state,c=fixture.content,all=[...state.party,...state.storage.boxes.flatMap(b=>b.slots.filter(Boolean)),...fixture.upstream];const dex=clone(state.dex);delete dex.layoutIdentity;
 return {partyOrder:state.party.map(m=>m.id),storage:{currentBox:state.storage.currentBox,boxes:state.storage.boxes.map(b=>({name:b.name,slots:b.slots.map(m=>m?.id??null)}))},members:Object.fromEntries(all.map(m=>[m.id,memberView(E,m,m.id,c)])),dex,protected:{money:state.money,inventorySHA256:hashJSON(E.inventory.aggregateBag(state.inventory)),inventoryCounts:E.inventory.aggregateBag(state.inventory),playerSHA256:hashJSON(state.player),badgesSHA256:hashJSON(state.badges),steps:state.steps,storageAppearanceSHA256:hashJSON(state.storage.boxes.map(b=>b.wallpaper))},unexpectedChanges:[]};}
