'use strict';
// Formal-spec-derived expectations (06ac r3 §§2–9); real F registration, B schema and receiving, no source-runtime claims.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
require('../../../scripts/tests/ts-source-loader.cjs');
const leaf=name=>import(pathToFileURL(resolve(__dirname,'../../../src/framework/rules',name+'.ts')));
const loaded=Promise.all(['battle-effects-writeback','battle-consumption','state','member-factory','species-key','dex-state','save-schema','evolution','storage','heal'].map(leaf));
const complete=value=>({status:'complete',value});
const unavailable=()=>({status:'unavailable',reason:'source-interrupted'});
const faintCell=(positiveOccurrences=[],coverage={status:'complete'})=>({positiveOccurrences,coverage});
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const display={battleSpecies:'Snorlax-Gmax',gender:0,shiny:true};
const appearance={memberId:'F1',sourceOrder:1,display};
const defeat={...appearance,sourceOrder:2,occurrenceOrdinal:1,hookKey:'foe-faint-1'};
async function fixture({partySize=2,capture=true}={}){
  const [W,E,S,M,K,B,V,D,T,H]=await loaded;
  const data=(contentId,form=0,extra={})=>({contentId,form,base:{hp:60,atk:60,def:60,spa:60,spd:60,spe:60},growth:'medium',baseExp:60,evYield:{},catchRate:45,learnset:{1:['Tackle']},abilities:['static'],gender:'M',...extra});
  const content={species:{Pikachu:data('hero'),Snorlax:data('snorlax'),'Snorlax-Gmax':data('snorlax',1,{formName:'Gigantamax'}),Zoroark:data('zoroark'),Magikarp:data('rear')},
    forms:{hero:{0:'Pikachu'},snorlax:{0:'Snorlax',1:'Snorlax-Gmax'},zoroark:{0:'Zoroark'},rear:{0:'Magikarp'}},
    speciesKeys:{Pikachu:{species:'hero',form:0},Snorlax:{species:'snorlax',form:0},'Snorlax-Gmax':{species:'snorlax',form:1},Zoroark:{species:'zoroark',form:0},Magikarp:{species:'rear',form:0}},
    moves:{Tackle:{id:'tackle',name:'Tackle',pp:35}},abilities:{static:{id:'static',name:'Static'}}};
  const layout={national:['hero','snorlax','zoroark','rear'],regions:[]};
  content.regionalDex={...layout,layoutIdentity:B.dexLayoutIdentity(layout)};
  const make=id=>K.toPersistentMember(M.createMember({id,species:'Pikachu',level:10,form:0},content,()=>1),content);
  const before=S.newGame({party:Array.from({length:partySize},(_,i)=>make('P'+(i+1))),money:100,content});
  before.party.forEach(m=>{m.friendship=100;m.readyToEvolve=true;m.evolutionReadiness='known';});
  const caught=K.toPersistentMember(M.createMember({id:'C1',species:'Zoroark',level:8,form:0,shiny:true},content,()=>1),content);
  const raw={protocol:1,battleId:'B1',outcome:{kind:'win',winner:'Player'},members:Object.fromEntries(before.party.map(m=>[m.id,{exp:m.exp+1,hp:m.hp-1}])),bag:{},
    captured:capture?[S.protocolMember(K.toBattleMember(caught,content))]:[],dex:{seen:['Snorlax','Magikarp','Zoroark'],owned:capture?['Zoroark']:[]},money:7};
  const expectedBinding={battleId:raw.battleId,generation:2,rawHash:S.resultHash(raw),contentIdentity:'b'.repeat(64)};
  const expectedContext={playerIds:before.party.map(m=>m.id),L0:Object.fromEntries(before.party.map(m=>[m.id,m.level])),engineRosterIds:before.party.map(m=>m.id),foeIds:['F1','F2'],internalBattle:true};
  const observerMember=()=>({critical:complete(3),damage:complete({total:49,resetCoverage:'complete'}),faint:faintCell()});
  const controlMember=()=>({friendship:complete({before:100,current:105,changes:[{method:'levelup',before:100,after:105}]}),faint:faintCell()});
  const source={expectedBinding,expectedContext,membersBefore:before.party,seal:{version:2,binding:clone(expectedBinding),context:clone(expectedContext),
    observer:{appearances:{F1:complete([clone(appearance)])},defeats:{F1:complete([clone(defeat)])},members:Object.fromEntries(before.party.map(m=>[m.id,observerMember()]))},
    control:{members:Object.fromEntries(before.party.map(m=>[m.id,controlMember()]))}}};
  function primary(extra={}){
    const result=S.applyBattleResult(before,raw,undefined,K.speciesKeyResolver(content),{content,templates:{C1:caught},profile:{mode:1,naming:1},...extra}).state;
    result.dex=clone(before.dex);return result;
  }
  function compose(options={}){return W.composeBattleEffects({before,primary:options.primary??primary(),raw,content,effects:E.resolveBattleEffects(source),internalBattle:true,...options});}
  return {W,E,S,M,K,B,V,D,T,H,content,before,caught,raw,source,primary,compose};
}
function assertFinite(S,primary,next){
  const paths=S.diffPaths(primary,next);
  assert.ok(paths.every(p=>p.startsWith('dex.')||/^(party\.\d+|storage\.boxes\.\d+\.slots\.\d+)\.(friendship|readyToEvolve|evolutionReadiness)$/.test(p)),paths.join('\n'));
}
test('real F registration and B schema compose a detached finite write set with the original main ledger',async()=>{
  const f=await fixture(),primary=f.primary(),r=f.compose({primary});
  assert.deepEqual(f.V.validateGame(r.state),[]);assert.deepEqual(f.B.dexStateProblems(r.state.dex),[]);assert.deepEqual(f.B.dexLayoutStateProblems(r.state.dex,f.content.regionalDex),[]);
  assertFinite(f.S,primary,r.state);assert.equal(r.state.party[0].exp,f.raw.members.P1.exp);assert.equal(r.state.money,107);
  assert.equal(r.state.appliedBattles.B1.hash,f.S.resultHash(f.raw));assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.deepEqual(r.state.dex.owned,['zoroark']);
  assert.deepEqual(r.state.dex.seenForms.snorlax,[{gender:0,form:1,shiny:true}]);assert.equal(r.state.dex.defeatedCounts.snorlax,1);assert.equal(r.state.dex.capturedCounts.zoroark,1);
  assert.deepEqual(r.captures,[{memberId:'C1',species:'zoroark',previouslyOwned:false}]);
});
test('missing faint coverage preserves old true as unknown while capture and primary XP remain installed',async()=>{
  const f=await fixture();f.source.seal.observer.members.P1.faint=faintCell([],unavailable());f.source.seal.control.members.P1.faint=faintCell([],unavailable());
  const r=f.compose();assert.equal(r.state.party[0].readyToEvolve,true);assert.equal(r.state.party[0].evolutionReadiness,'unknown');
  assert.equal(r.state.party[1].evolutionReadiness,'known');assert.equal(r.state.party[0].exp,f.raw.members.P1.exp);assert.equal(r.state.party[2].id,'C1');assert.equal(r.state.dex.capturedCounts.zoroark,1);
});
test('false never acquires meaningless unknown and stored outsiders keep their existing readiness',async()=>{
  const f=await fixture();f.before.party[0].readyToEvolve=false;f.source.seal.observer.members.P1.faint=faintCell([],unavailable());f.source.seal.control.members.P1.faint=faintCell([],unavailable());
  const outsider=clone(f.before.party[1]);outsider.id='Boxed';outsider.evolutionReadiness='unknown';f.before.storage.boxes[0].slots[0]=outsider;
  const r=f.compose();assert.equal(r.state.party[0].readyToEvolve,false);assert.equal(r.state.party[0].evolutionReadiness,'known');assert.deepEqual(r.state.storage.boxes[0].slots[0],outsider);
});
test('reliable raw HP0 clears R after real replacement reception deposit-heals the old member in a box',async()=>{
  const f=await fixture({partySize:6});f.raw.members.P1.hp=0;
  const primary=f.primary({depositHeal:true,decisions:{C1:{placement:{kind:'replace',target:{id:'P1',position:{kind:'party',index:0}}}}}});
  const boxed=f.T.locateMember(primary,'P1').member;assert.ok(boxed.hp>0);assert.equal(boxed.readyToEvolve,true);
  const r=f.compose({primary});const result=f.T.locateMember(r.state,'P1').member;
  assert.equal(result.readyToEvolve,false);assert.equal(result.evolutionReadiness,'known');assert.equal(result.friendship,105);assert.equal(result.hp,boxed.hp);assert.equal(r.state.party.at(-1).id,'C1');assert.equal(r.state.party[0].id,'P2');assertFinite(f.S,primary,r.state);
});
test('deposit healing alone cannot clear a previous R barrier when no real faint was proved',async()=>{
  const f=await fixture({partySize:6});f.before.party[0].evolutionReadiness='unknown';
  const primary=f.primary({depositHeal:true,decisions:{C1:{placement:{kind:'replace',target:{id:'P1',position:{kind:'party',index:0}}}}}});
  const r=f.compose({primary});assert.equal(f.T.locateMember(r.state,'P1').member.readyToEvolve,true);assert.equal(f.T.locateMember(r.state,'P1').member.evolutionReadiness,'unknown');
});
test('explicit legal raw friendship wins without changing another member replacement',async()=>{
  for(const value of [0,130,255,256,Number.MAX_SAFE_INTEGER]){
    const f=await fixture();f.raw.members.P1.friendship=value;const r=f.compose();assert.equal(r.state.party[0].friendship,value);assert.equal(r.state.party[1].friendship,105);
    assert.deepEqual(f.V.validateGame(r.state),[]);assert.ok(r.dispositions.some(d=>d.memberId==='P1'&&d.group==='friendship'&&d.reason==='legal-primary-friendship-wins'));
  }
});
test('bad member friendship is local and a missing stable ID is diagnostic only',async()=>{
  const f=await fixture();const effects=f.E.resolveBattleEffects(f.source);effects.friendshipReplacements.P1=256;effects.friendshipReplacements.Missing=100;
  const r=f.compose({effects});assert.equal(r.state.party[0].friendship,100);assert.equal(r.state.party[1].friendship,105);assert.equal(r.state.dex.capturedCounts.zoroark,1);
  assert.equal(r.dispositions.filter(d=>d.group==='friendship'&&d.status==='invalid').length,2);
});
test('observer failure still permits independent capture owned, seen and count',async()=>{
  const f=await fixture();f.source.seal.observer=null;const r=f.compose();
  assert.deepEqual(r.state.dex.owned,['zoroark']);assert.deepEqual(r.state.dex.seen,['zoroark']);assert.equal(r.state.dex.capturedCounts.zoroark,1);assert.deepEqual(r.state.dex.defeatedCounts,{});assert.equal(r.state.party[0].friendship,105);
});
test('counter MAX is local: accepted owned and display history survive capture and defeat overflow',async()=>{
  const f=await fixture();f.before.dex.capturedCounts.zoroark=Number.MAX_SAFE_INTEGER;f.before.dex.defeatedCounts.snorlax=Number.MAX_SAFE_INTEGER;
  const r=f.compose();assert.deepEqual(r.state.dex.owned,['zoroark']);assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.equal(r.state.dex.seenForms.zoroark[0].shiny,true);
  assert.equal(r.state.dex.capturedCounts.zoroark,Number.MAX_SAFE_INTEGER);assert.equal(r.state.dex.defeatedCounts.snorlax,Number.MAX_SAFE_INTEGER);assert.equal(r.state.party[0].exp,f.raw.members.P1.exp);
  assert.ok(r.dispositions.some(d=>d.group==='capture-count'&&d.status==='invalid'));assert.ok(r.dispositions.some(d=>d.group==='defeat'&&d.status==='invalid'));assert.deepEqual(f.V.validateGame(r.state),[]);
});
test('Illusion display Snorlax and received real Zoroark remain independent and raw rear seen is ignored',async()=>{
  const f=await fixture();f.before.dex.seen=['hero'];f.before.dex.owned=['rear'];const r=f.compose();
  assert.deepEqual(r.state.dex.seen,['hero','snorlax','zoroark']);assert.deepEqual(r.state.dex.owned,['rear','zoroark']);assert.equal(r.state.dex.seen.includes('rear'),false);assert.equal(r.state.dex.defeatedCounts.zoroark,undefined);assert.equal(r.state.dex.capturedCounts.snorlax,undefined);
  const unknown=await fixture();unknown.source.seal.observer.appearances.F1.value[0].display.battleSpecies='Unmapped';unknown.source.seal.observer.defeats.F1.value[0].display.battleSpecies='Unmapped';
  const u=unknown.compose();assert.deepEqual(u.state.dex.seen,['zoroark']);assert.deepEqual(u.state.dex.defeatedCounts,{});assert.equal(u.state.dex.capturedCounts.zoroark,1);
});
test('noninternal capture is owned only and does not turn all owned history into seen',async()=>{
  const f=await fixture();f.before.dex.owned=['rear'];const r=f.compose({internalBattle:false});assert.deepEqual(r.state.dex.owned,['rear','zoroark']);assert.deepEqual(r.state.dex.seen,[]);assert.deepEqual(r.state.dex.seenForms,{});assert.deepEqual(r.state.dex.capturedCounts,{});assert.deepEqual(r.state.dex.defeatedCounts,{});
});
test('no capture means raw owned cannot create ownership for an undisplayed reserve',async()=>{
  const f=await fixture({capture:false});f.raw.dex.owned=['Magikarp'];const r=f.compose();
  assert.deepEqual(r.state.dex.owned,[]);assert.deepEqual(r.state.dex.seen,['snorlax']);assert.deepEqual(r.state.dex.capturedCounts,{});assert.deepEqual(r.captures,[]);
});
test('accepted capture sent to storage still registers the actual persistent individual',async()=>{
  const f=await fixture({partySize:6});const r=f.compose();const captured=f.T.locateMember(r.state,'C1');
  assert.equal(captured.position.kind,'box');assert.equal(captured.member.species,'zoroark');assert.deepEqual(r.state.dex.owned,['zoroark']);assert.deepEqual(r.state.dex.seenForms.zoroark,[{gender:0,form:0,shiny:true}]);assert.equal(r.state.dex.capturedCounts.zoroark,1);assert.deepEqual(f.V.validateGame(r.state),[]);
});
test('reliably mapped base retains seen and defeat count when exact form normalization is unavailable',async()=>{
  const f=await fixture();delete f.content.species['Snorlax-Gmax'];const r=f.compose();
  assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.equal(r.state.dex.defeatedCounts.snorlax,1);assert.equal(Object.hasOwn(r.state.dex.seenForms,'snorlax'),false);assert.equal(Object.hasOwn(r.state.dex.lastSeenForm,'snorlax'),false);
  assert.ok(r.dispositions.some(d=>d.memberId==='F1'&&d.reason==='display-form-unavailable'));assert.equal(r.state.dex.capturedCounts.zoroark,1);assert.deepEqual(f.V.validateGame(r.state),[]);
});
test('missing exact physical form mapping never registers fallback form0 while base facts and captures survive',async()=>{
  for(const pokedexForm of [undefined,0]){
    const f=await fixture();if(pokedexForm!==undefined)f.content.species['Snorlax-Gmax'].pokedexForm=pokedexForm;
    delete f.content.forms.snorlax[1];const r=f.compose();
    assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.equal(r.state.dex.defeatedCounts.snorlax,1);
    assert.equal(Object.hasOwn(r.state.dex.seenForms,'snorlax'),false);assert.equal(Object.hasOwn(r.state.dex.lastSeenForm,'snorlax'),false);
    assert.ok(r.dispositions.some(d=>d.memberId==='F1'&&d.reason==='display-form-unavailable'));
    assert.deepEqual(r.state.dex.owned,['zoroark']);assert.equal(r.state.dex.capturedCounts.zoroark,1);assert.equal(r.state.party[0].exp,f.raw.members.P1.exp);assert.deepEqual(f.V.validateGame(r.state),[]);
  }
});
test('exact physical source mapping must match the observed battle name',async()=>{
  const f=await fixture();f.content.forms.snorlax[1]='Snorlax';const r=f.compose();
  assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.equal(r.state.dex.defeatedCounts.snorlax,1);
  assert.equal(Object.hasOwn(r.state.dex.seenForms,'snorlax'),false);assert.equal(Object.hasOwn(r.state.dex.lastSeenForm,'snorlax'),false);
});
test('explicit PokedexForm alias and legitimately unnamed forms retain F registration semantics',async()=>{
  for(const kind of ['named-alias','alias-zero','unnamed-source','unnamed-alias']){
    const f=await fixture();let expected=0;
    if(kind==='named-alias'||kind==='unnamed-alias'){
      f.content.species['Snorlax-Gmax'].pokedexForm=7;f.content.forms.snorlax[7]='Snorlax-Dex';
      f.content.species['Snorlax-Dex']={...clone(f.content.species.Snorlax),form:7,...(kind==='named-alias'?{formName:'Dex display'}:{})};
      if(kind==='named-alias')expected=7;
    }else if(kind==='alias-zero')f.content.species['Snorlax-Gmax'].pokedexForm=0;
    else delete f.content.species['Snorlax-Gmax'].formName;
    const r=f.compose();assert.deepEqual(r.state.dex.seenForms.snorlax,[{gender:0,form:expected,shiny:true}],kind);assert.equal(r.state.dex.lastSeenForm.snorlax.form,expected,kind);
    assert.equal(r.state.dex.defeatedCounts.snorlax,1);assert.equal(r.dispositions.some(d=>d.memberId==='F1'&&d.reason==='display-form-unavailable'),false,kind);
  }
});
test('missing explicit dex alias mapping or data skips only precision without borrowing form0',async()=>{
  for(const missing of ['mapping','data']){
    const f=await fixture();f.content.species['Snorlax-Gmax'].pokedexForm=7;
    if(missing==='mapping')f.content.species['Snorlax-Dex']={...clone(f.content.species.Snorlax),form:7,formName:'Dex display'};
    else f.content.forms.snorlax[7]='Snorlax-Dex';
    const r=f.compose();assert.equal(Object.hasOwn(r.state.dex.seenForms,'snorlax'),false,missing);assert.equal(Object.hasOwn(r.state.dex.lastSeenForm,'snorlax'),false,missing);
    assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.equal(r.state.dex.defeatedCounts.snorlax,1);assert.equal(r.state.dex.capturedCounts.zoroark,1);
  }
});
test('accepted nonzero-form capture without its exact mapping still owns, sees and counts without form fabrication',async()=>{
  const f=await fixture();f.caught.form=1;f.content.speciesKeys.Zoroark.form=1;
  f.content.species['Zoroark-Base']=clone(f.content.species.Zoroark);f.content.forms.zoroark[0]='Zoroark-Base';
  f.content.species.Zoroark.form=1;f.content.species.Zoroark.formName='Captured form';f.content.forms.zoroark[1]='Zoroark';
  const primary=f.primary();delete f.content.forms.zoroark[1];const r=f.compose({primary});
  assert.equal(f.T.locateMember(r.state,'C1').member.form,1);assert.deepEqual(r.state.dex.owned,['zoroark']);assert.deepEqual(r.state.dex.seen,['snorlax','zoroark']);assert.equal(r.state.dex.capturedCounts.zoroark,1);
  assert.equal(Object.hasOwn(r.state.dex.seenForms,'zoroark'),false);assert.equal(Object.hasOwn(r.state.dex.lastSeenForm,'zoroark'),false);assert.ok(r.dispositions.some(d=>d.memberId==='C1'&&d.reason==='capture-form-unavailable'));
});
test('real repeated defeat ordinals count actual occurrences without a second persistent event table',async()=>{
  const f=await fixture();f.source.seal.observer.defeats.F1.value.push({...clone(defeat),sourceOrder:4,occurrenceOrdinal:2,hookKey:'foe-faint-2'});
  const r=f.compose();assert.equal(r.state.dex.defeatedCounts.snorlax,2);assert.deepEqual(Object.keys(r.state).sort(),Object.keys(f.primary()).sort());assert.equal('events' in r.state.dex,false);assert.equal('critical' in r.state,false);assert.equal('damage' in r.state,false);
});
test('bad D preserves K for its independent consumer and writes no new R even with scan permission',async()=>{
  const f=await fixture();f.before.party[0].readyToEvolve=false;f.source.seal.observer.members.P1.damage=complete({total:49,resetCoverage:'unavailable'});
  const effects=f.E.resolveBattleEffects(f.source);assert.equal(effects.critical.P1.value,3);assert.equal(effects.damage.P1.status,'invalid');
  const r=f.compose({effects,readinessScans:{P1:{kind:'no-target',readiness:{readyToEvolve:true,evolutionReadiness:'known'}}}});
  assert.equal(r.state.party[0].readyToEvolve,false);assert.equal(r.state.party[0].friendship,105);assert.equal(r.state.dex.capturedCounts.zoroark,1);assert.equal('critical' in r.state.party[0],false);assert.equal('damage' in r.state.party[0],false);
});
test('new R waits for an actual complete ordered D scan; invalid later condition discards tentative readiness',async()=>{
  const f=await fixture();f.before.party[0].readyToEvolve=false;
  f.content.species.Pikachu.evolutions=[{target:'zoroark',method:'EventAfterDamageTaken',parameter:1}];
  const scan=f.D.scanEvolution({member:f.before.party[0],content:f.content,party:f.before.party,trigger:{family:'battle'},facts:{damageTaken:{status:'value',value:49}}});assert.equal(scan.kind,'no-target');assert.ok(scan.readiness);
  assert.equal(f.compose().state.party[0].readyToEvolve,false);assert.equal(f.compose({readinessScans:{P1:scan}}).state.party[0].readyToEvolve,true);
  f.content.species.Pikachu.evolutions.push({target:'zoroark',method:'BattleDealCriticalHit',parameter:3});
  const bad=f.D.scanEvolution({member:f.before.party[0],content:f.content,party:f.before.party,trigger:{family:'battle'},facts:{damageTaken:{status:'value',value:49}}});assert.equal(bad.kind,'context-unavailable');assert.equal(f.compose({readinessScans:{P1:bad}}).state.party[0].readyToEvolve,false);
});
test('valid faint prefix clears old R after coverage interruption without damaging main results',async()=>{
  const f=await fixture();f.source.seal.control.members.P1.faint=faintCell([{memberId:'P1',source:'control',occurrenceOrdinal:1,sourceOrder:1,hookKey:'player-faint'}],unavailable());
  const r=f.compose();assert.equal(r.state.party[0].readyToEvolve,false);assert.equal(r.state.party[0].evolutionReadiness,'known');assert.equal(r.state.party[0].exp,f.raw.members.P1.exp);assert.equal(r.state.dex.capturedCounts.zoroark,1);
});
test('capture entry intent reads preoperation ownership even across duplicate species captures',async()=>{
  const f=await fixture();f.before.dex.owned=['zoroark'];const r=f.compose();assert.equal(r.captures[0].previouslyOwned,true);assert.equal(r.state.dex.capturedCounts.zoroark,1);
  const g=await fixture();g.raw.captured.push({...clone(g.raw.captured[0]),id:'C2'});const primary=g.primary({templates:{C1:g.caught,C2:{...clone(g.caught),id:'C2'}}});const q=g.compose({primary});
  assert.deepEqual(q.captures.map(c=>c.previouslyOwned),[false,false]);assert.equal(q.state.dex.capturedCounts.zoroark,2);
});
test('deep frozen inputs remain byte-identical and every output branch is detached',async()=>{
  const f=await fixture();const input={before:f.before,primary:f.primary(),raw:f.raw,content:f.content,effects:f.E.resolveBattleEffects(f.source),internalBattle:true};
  const json=JSON.stringify(input);freeze(input);const r=f.W.composeBattleEffects(input);assert.equal(JSON.stringify(input),json);assertFinite(f.S,input.primary,r.state);
  r.state.party[0].moves[0].pp=0;r.state.storage.boxes[0].name='changed';r.state.dex.seenForms.snorlax[0].shiny=false;r.state.stats.battlesWon=999;r.captures[0].species='changed';
  assert.equal(JSON.stringify(input),json);
});
