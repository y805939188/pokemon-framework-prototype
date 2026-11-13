'use strict';
// Derived from sealed B r3 contracts / WP62; these are synthetic tests, not reference runtime observations.
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require(process.env.PS_B3_CORE || '../../../js/engine/build/core.cjs');
const F=require('./fixtures-migration7/fixtures.cjs'),S=E.saveSchema,D=E.dexState;
const options=C=>({content:C,speciesKey:name=>Object.hasOwn(C.species,name)?{species:name,form:0}:null});
function migrate(raw,C){const before=JSON.stringify(raw),result=S.migrateGame(F.freeze(raw),options(C));assert.equal(JSON.stringify(raw),before);return result;}
function good(raw,C){const result=migrate(raw,C);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(S.validateGameContent(result.state,C),[]);return result.state;}
function current(C=F.content(E)){return good(F.legacy6(E,C),C);}
function refuse(raw,C,code='invalid',pattern){const result=migrate(raw,C);assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.error.code,code);if(pattern)assert.match(JSON.stringify(result.error),pattern);return result;}
const members=game=>[...game.party,...game.storage.boxes.flatMap(box=>box.slots.filter(Boolean))];

test('B08: all six party and 40×30 storage slots preserve every previous value',t=>{
  const C=F.content(E),raw=F.legacy6(E,C),smallStart=performance.now();good(F.clone(raw),C);const smallMs=performance.now()-smallStart,template=raw.party[0];
  template.statNature='modest';template.moves[0]={id:'tackle',pp:7,maxpp:49,ppUps:2};
  raw.party=Array.from({length:6},(_,i)=>({...F.clone(template),id:`P${i}`,readyToEvolve:i%2===0}));
  for(const [i,box]of raw.storage.boxes.entries()) {box.name=`盒${i}`;box.wallpaper=i+40;for(let j=0;j<30;j++)box.slots[j]={...F.clone(template),id:`B${i*30+j}`,readyToEvolve:j%2===0};}
  raw.storage.currentBox=39;raw.storage.unlockedWallpapers=[16,39];
  const bytes=JSON.stringify(raw),start=performance.now(),out=good(raw,C),elapsed=performance.now()-start;
  assert.equal(members(out).length,1206);
  const stripped=F.clone(out);stripped.schema=6;stripped.dex=F.clone(raw.dex);delete stripped.defeatedTrainers;
  for(const m of members(stripped)){assert.equal(m.evolutionReadiness,'known');assert.equal(m.cannotTrade,false);delete m.evolutionReadiness;delete m.cannotTrade;}
  assert.deepEqual(stripped,raw);assert.equal(JSON.stringify(raw),bytes);
  assert.equal(out.party[0].hp,0);assert.equal(out.party[0].readyToEvolve,true);
  t.diagnostic(JSON.stringify({members:1206,inputBytes:Buffer.byteLength(bytes),outputBytes:Buffer.byteLength(JSON.stringify(out)),migrationAndValidationMs:Math.round(elapsed*100)/100,oneMemberMigrationAndValidationMs:Math.round(smallMs*100)/100}));
});

for(const version of [1,2,3,4,5,6])test(`B09: schema ${version} follows the existing chain to the current schema without mutating input`,()=>{
  const C=F.content(E),raw=F.version(E,version,C),out=good(raw,C);
  assert.equal(out.schema,E.state.GAME_SCHEMA);assert.equal(out.party[0].friendship,256);assert.deepEqual(out.appliedBattles,raw.appliedBattles);
  assert.equal(out.party[0].evolutionReadiness,'known');assert.equal(out.party[0].cannotTrade,false);
});

test('B09: missing content at each old version refuses without mutating the document',()=>{
  for(const version of [1,2,3,4,5,6]){
    const raw=F.version(E,version),bytes=JSON.stringify(raw),out=S.migrateGame(F.freeze(raw));
    assert.equal(out.ok,false);assert.equal(out.error.code,'needs-content');assert.equal(JSON.stringify(raw),bytes);
  }
});
test('B09: existing poison conversion and deterministic individual completion remain valid',()=>{
  const C=F.content(E),raw=F.version(E,1,C);raw.party[0].status='tox';delete raw.party[0].statusCount;
  const a=good(raw,C),b=good(F.clone(raw),C);assert.deepEqual(a,b);assert.equal(a.party[0].status,'psn');assert.equal(a.party[0].statusCount,0);
  assert.equal(a.party[0].origin.map,null);assert.equal(a.party[0].origin.receivedAt,null);
});
test('B09: legacy invalid member/capacity and unmapped names remain whole-document refusals',()=>{
  const C=F.content(E),bad=F.version(E,4,C);bad.party[0].hp=-1;refuse(bad,C);
  const missing=F.version(E,3,C);missing.party[0].species='Missing';refuse(missing,C,'unmapped-species');
  const over=F.version(E,4,C);over.boxes=Array.from({length:1201},(_,i)=>({...F.clone(over.party[0]),id:`B${i}`}));refuse(over,C,'capacity-exceeded');
});

for(const regionCount of [0,2])for(const seen of [[],['A']])for(const owned of [[],['B']])test(`B12: legacy dex truth N=${regionCount} seen=${seen.length} owned=${owned.length}`,()=>{
  const C=F.content(E,regionCount?[['A'],['B']]:[]),raw=F.legacy6(E,C);raw.dex={seen,owned};const dex=good(raw,C).dex,has=!!(seen.length||owned.length);
  assert.deepEqual(dex.seen,seen);assert.deepEqual(dex.owned,owned);assert.equal(dex.hasDex,has);
  assert.deepEqual(dex.unlocked,[has,...Array(regionCount).fill(false)]);assert.equal(dex.view.region,regionCount?0:-1);assert.deepEqual(dex.view.indices,Array(regionCount+1).fill(0));
  for(const key of ['seenForms','lastSeenForm','capturedCounts','defeatedCounts'])assert.deepEqual(dex[key],{});
});
for(const regionCount of [0,2])test(`B12: new-game dex truth N=${regionCount} differs from empty legacy migration`,()=>{
  const C=F.content(E,regionCount?[['A'],['B']]:[]),dex=D.createDexState(C);
  assert.equal(dex.hasDex,false);assert.deepEqual(dex.unlocked,[true,...Array(regionCount).fill(false)]);assert.equal(dex.view.region,regionCount?0:-1);
  assert.deepEqual(dex.view.indices,Array(regionCount+1).fill(0));assert.equal(dex.layoutIdentity,F.identity(C.regionalDex));
});
test('B12: content omission is explicit empty pure fixture; supplied incomplete content refuses',()=>{
  assert.deepEqual(D.createDexState().view,{region:-1,indices:[0],mode:0});assert.throws(()=>D.createDexState({species:{}}),/needs-content/);
  const raw=F.legacy6(E),bytes=JSON.stringify(raw),out=S.migrateGame(raw,{content:{species:{}}});assert.equal(out.error.code,'needs-content');assert.equal(JSON.stringify(raw),bytes);
});

test('B10/X-SAVE-01 pure gate: required readiness pair and cannotTrade are strict in every persistent slot',()=>{
  const C=F.content(E),base=current(C);base.storage.boxes[39].slots[29]={...F.clone(base.party[0]),id:'Last'};
  for(const target of [g=>g.party[0],g=>g.storage.boxes[39].slots[29]])for(const edit of [m=>delete m.evolutionReadiness,m=>m.evolutionReadiness='maybe',m=>{m.readyToEvolve=false;m.evolutionReadiness='unknown';},m=>delete m.cannotTrade,m=>m.cannotTrade='false']){
    const bad=F.clone(base);edit(target(bad));refuse(bad,C);assert(S.validateGameContent(bad,C).length);
  }
  const unknown=F.clone(base);unknown.party[0].evolutionReadiness='unknown';assert.deepEqual(good(unknown,C),unknown);
});
test('B10: future versions refuse explicitly, and incomplete seven never receives defaults',()=>{
  const C=F.content(E),base=current(C);refuse({...F.clone(base),schema:E.state.GAME_SCHEMA+1},C,'unknown-version');
  for(const field of ['hasDex','seenForms','lastSeenForm','capturedCounts','defeatedCounts','unlocked','view','layoutIdentity']){const bad=F.clone(base);delete bad.dex[field];refuse(bad,C);}
  refuse(F.clone(base),undefined,'needs-content');
});
test('B10: existing persistent metadata remains required in schema 7; content checks never fill defaults',()=>{
  const C=F.content(E),base=current(C);
  for(const field of ['personalID','owner','ownerCompatibilityDefault','origin','abilityIndex','effectiveAbilityIndex','shiny','superShiny','firstMoves','markings','ribbons','cannotStore','cannotRelease','isEgg','mail','readyToEvolve','statNature']){const bad=F.clone(base);delete bad.party[0][field];refuse(bad,C);}
  const pp=F.clone(base);delete pp.party[0].moves[0].ppUps;refuse(pp,C);
});
test('B13/14/15: long ordered repeated firstMoves, zero current moves, null slots and 256 round-trip unchanged',()=>{
  const C=F.content(E),raw=current(C);Object.assign(raw.party[0],{moves:[],firstMoves:['tackle','growl','tackle','growl','tackle','growl'],ability:'Legacy Override',abilityIndex:null,effectiveAbilityIndex:null,evolutionReadiness:'unknown',cannotTrade:true});
  const out=good(raw,C);assert.deepEqual(out,raw);assert.deepEqual(good(JSON.parse(JSON.stringify(out)),C),raw);assert.equal(out.party[0].friendship,256);
  const older=F.legacy6(E,C);older.party[0].firstMoves=raw.party[0].firstMoves;refuse(older,C);
});
test('B14: exact checked ability directory recognizes override; no PID or target-slot guesses',()=>{
  const C=F.content(E),raw=F.legacy6(E,C);raw.party[0].ability='Legacy Override';assert.equal(good(raw,C).party[0].abilityIndex,null);
  const bad=F.clone(raw);bad.party[0].ability='legacy override';refuse(bad,C,'invalid',/unmapped ability/);
  const noDirectory=F.clone(C);delete noDirectory.abilities;refuse(F.clone(raw),noDirectory,'invalid',/unmapped ability/);
  const regular=F.legacy6(E,noDirectory);assert.equal(good(regular,noDirectory).party[0].ability,'Known');
});
test('B11: clear readiness deeply clones, clears both fields and preserves unrelated persistent metadata',()=>{
  const C=F.content(E),m=current(C).party[0];m.evolutionReadiness='unknown';m.cannotTrade=true;
  const before=F.clone(m),out=E.evolutionReadiness.clearEvolutionReadiness(F.freeze(m));assert.deepEqual(m,before);
  assert.equal(out.readyToEvolve,false);assert.equal(out.evolutionReadiness,'known');assert.notEqual(out.moves,m.moves);assert.notEqual(out.owner,m.owner);
  assert.deepEqual({...out,readyToEvolve:before.readyToEvolve,evolutionReadiness:before.evolutionReadiness},before);
});

test('B10/17: sparse arrays and inherited records refuse; prototype-looking own IDs survive JSON',()=>{
  const C=F.content(E),base=current(C);
  for(const edit of [g=>delete g.party[0].firstMoves[0],g=>delete g.dex.unlocked[0],g=>delete g.storage.boxes[0].slots[0],g=>g.dex.view=Object.create(g.dex.view)]){
    const bad=F.clone(base);edit(bad);assert(S.validateGame(bad).length);assert.equal(S.migrateGame(bad,options(C)).ok,false);
  }
  const own=F.clone(base);own.dex.seen=['constructor','__proto__','toString'];own.dex.owned=['toString'];
  for(const key of ['constructor','__proto__','toString']){
    Object.defineProperty(own.dex.seenForms,key,{value:[{gender:0,shiny:false,form:0}],enumerable:true});
    Object.defineProperty(own.dex.lastSeenForm,key,{value:{gender:2,shiny:true,form:999},enumerable:true});
    Object.defineProperty(own.dex.capturedCounts,key,{value:256,enumerable:true});Object.defineProperty(own.dex.defeatedCounts,key,{value:0,enumerable:true});
  }
  assert.deepEqual(good(JSON.parse(JSON.stringify(own)),C),own);assert.equal(Object.getPrototypeOf(own.dex.capturedCounts),Object.prototype);assert.equal({}.polluted,undefined);
  const unavailable=F.clone(C);delete unavailable.species.constructor;refuse(F.clone(own),unavailable,'invalid',/unmapped species/);
});
test('B10/X-SAVE-02 pure gate: required species/move/firstMove/ability/item/dex references fail after legal load',()=>{
  const C=F.content(E),base=current(C);
  for(const edit of [g=>g.party[0].species='Missing',g=>g.party[0].moves[0].id='missing',g=>g.party[0].firstMoves=['missing'],g=>g.party[0].ability='Missing',g=>g.party[0].item='missing',g=>g.party[0].ball='missing',g=>g.dex.seen=['Missing'],g=>g.dex.capturedCounts.Missing=1,g=>g.dex.lastSeenForm.Missing={gender:0,shiny:false,form:0},g=>g.inventory.pockets[1][0].itemId='missing']){
    const bad=F.clone(base);edit(bad);assert.deepEqual(S.validateGame(bad),[]);assert(S.validateGameContent(bad,C).length);refuse(bad,C);
  }
  const form=F.clone(base);form.party[0].form=999;assert.deepEqual(S.validateGameContent(form,C),[]); // Existing form lookup fallback.
});
test('B10: malformed dex dictionaries, duplicates, counters and cursor domains reject',()=>{
  const C=F.content(E),base=current(C);
  for(const edit of [g=>g.dex.seenForms.A=[{gender:2,shiny:false,form:0}],g=>g.dex.seenForms.A=[{gender:0,shiny:false,form:0},{form:0,shiny:false,gender:0}],g=>g.dex.lastSeenForm.A={gender:3,shiny:false,form:0},g=>g.dex.capturedCounts.A=-1,g=>g.dex.defeatedCounts.A=Number.MAX_SAFE_INTEGER+1,g=>g.dex.view.mode=6,g=>g.dex.extra={},g=>g.dex.hasDex='true']){const bad=F.clone(base);edit(bad);refuse(bad,C);}
});
test('B12: named last-seen keys remain distinct from base keys; missing forms retain the established base fallback',()=>{
  const C=F.content(E),raw=current(C);C.forms={A:{0:'A',1:'A-Form1'},B:{0:'B'},C:{0:'C'}};C.speciesKeys={A:{species:'A',form:0},'A-Form1':{species:'A',form:1},B:{species:'B',form:0},C:{species:'C',form:0}};C.species['A-Form1']=F.clone(C.species.A);
  raw.party[0].form=999;raw.dex.seenForms={A:[{gender:0,shiny:false,form:999}]};raw.dex.lastSeenForm={A:{gender:2,shiny:false,form:0},'A-Form1':{gender:1,shiny:true,form:1}};
  const out=good(raw,C);assert.deepEqual(out,raw);assert.equal(Object.keys(out.dex.lastSeenForm).length,2);
});

function layoutCase(){const old=F.content(E),next=F.content(E,[['B','A'],['A','B']]);next.regionalDex.national=['C','B','A'];next.regionalDex.layoutIdentity=F.identity(next.regionalDex);next.regionalDex.transitions=[F.transition(old.regionalDex,next.regionalDex)];const raw=current(old);raw.dex.unlocked=[true,false,true];raw.dex.view={region:0,indices:[1,1,2],mode:4};raw.dex.hasDex=false;raw.dex.capturedCounts={C:3};raw.dex.seenForms={A:[{gender:0,shiny:false,form:99}]};return {old,next,raw};}
test('B26/28 X-LAYOUT-01: explicit swap moves unlocks/view and remaps every cursor by stable base ID',()=>{
  const {next,raw}=layoutCase(),result=migrate(raw,next);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.migrated,true);const out=result.state;assert.deepEqual(S.validateGameContent(out,next),[]);assert.deepEqual(out.dex.unlocked,[false,true,true]);assert.deepEqual(out.dex.view,{region:1,indices:[1,1,0],mode:4});
  assert.equal(out.dex.hasDex,false);for(const field of ['seen','owned','seenForms','lastSeenForm','capturedCounts','defeatedCounts'])assert.deepEqual(out.dex[field],raw.dex[field]);
  assert.equal(out.dex.layoutIdentity,next.regionalDex.layoutIdentity);assert.notEqual(out.dex.layoutIdentity,raw.dex.layoutIdentity);
});
test('B26/28 X-LAYOUT-02: missing/empty/nonmatching transitions refuse; no implicit positional migration',()=>{
  for(const change of [C=>delete C.regionalDex.transitions,C=>C.regionalDex.transitions=[]]){const {next,raw}=layoutCase();change(next);refuse(raw,next,'needs-content',/layout-transition-missing/);}
  const {next,raw,old}=layoutCase(),unrelated=F.clone(old.regionalDex);unrelated.national=['B','A','C'];unrelated.layoutIdentity=F.identity(unrelated);next.regionalDex.transitions=[F.transition(unrelated,next.regionalDex)];refuse(raw,next,'needs-content',/layout-transition-missing/);
});
test('B26/28 X-LAYOUT-03/04: duplicate from, stale target and old hash corruption reject defensively',()=>{
  for(const [edit,pattern]of [[C=>C.regionalDex.transitions.push(F.clone(C.regionalDex.transitions[0])),/ambiguous-layout-transition/],[C=>C.regionalDex.transitions[0].to='f'.repeat(64),/target-layout-mismatch/],[C=>C.regionalDex.transitions[0].oldLayout.national.reverse(),/old-layout-hash-mismatch/],[C=>C.regionalDex.transitions[0].from='f'.repeat(64),/old-layout-hash-mismatch/]]){const {next,raw}=layoutCase();edit(next);refuse(raw,next,'invalid',pattern);}
});
test('B26/28 X-LAYOUT-05: incomplete/duplicate/aliasing maps and national deletion/redirection all reject',()=>{
  for(const map of [[{from:0,to:1},{from:-1,to:-1}],[{from:0,to:1},{from:0,to:0},{from:-1,to:-1}],[{from:0,to:0},{from:1,to:0},{from:-1,to:-1}],[{from:0,to:1},{from:1,to:0},{from:-1,to:null}],[{from:0,to:1},{from:1,to:0},{from:-1,to:0}],[{from:0,to:-1},{from:1,to:0},{from:-1,to:-1}],[{from:0,to:1},{from:1,to:9},{from:-1,to:-1}]]){const {next,raw}=layoutCase();next.regionalDex.transitions[0].regionMap=map;refuse(raw,next,'invalid',/invalid-region-map/);}
});
test('B26: same layout does not select a transition and never repairs lengths, view or bounds',()=>{
  const C=F.content(E),base=current(C);
  for(const edit of [g=>g.dex.unlocked.pop(),g=>g.dex.view.indices.pop(),g=>g.dex.view.region=2,g=>g.dex.view.indices[0]=2]){const bad=F.clone(base);edit(bad);refuse(bad,C);assert(S.validateGameContent(bad,C).length);}
  const out=migrate(base,C);assert.equal(out.ok,true);assert.equal(out.migrated,false);assert.deepEqual(out.state,base);
});
test('B26: invalid old layout cursors/lengths refuse before any remap',()=>{
  for(const edit of [g=>g.dex.unlocked.pop(),g=>g.dex.view.indices.pop(),g=>g.dex.view.region=2,g=>g.dex.view.indices[1]=2]){const {next,raw}=layoutCase();edit(raw);refuse(raw,next);}
});
test('B26: add/delete regions and cursor fallback never grant unlocks or filter historical records',()=>{
  const old=F.content(E),next=F.content(E,[['C'],['A'],[]]),raw=current(old);raw.dex.view={region:1,indices:[1,0,1],mode:5};raw.dex.unlocked=[true,true,false];raw.dex.defeatedCounts={B:9};
  next.regionalDex.transitions=[F.transition(old.regionalDex,next.regionalDex,[{from:0,to:1},{from:1,to:null},{from:-1,to:-1}])];
  const result=migrate(raw,next);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.state.dex.unlocked,[false,true,false,false]);assert.deepEqual(result.state.dex.view,{region:0,indices:[0,0,0,1],mode:5});assert.deepEqual(result.state.dex.defeatedCounts,{B:9});assert.match(result.notes.join('\n'),/deleted|reset to zero/);
  const noRegions=F.content(E,[]);noRegions.regionalDex.transitions=[F.transition(old.regionalDex,noRegions.regionalDex,[{from:0,to:null},{from:1,to:null},{from:-1,to:-1}])];const only=good(F.clone(raw),noRegions);assert.equal(only.dex.view.region,-1);assert.deepEqual(only.dex.unlocked,[false]);
});
test('B26: empty old/current tables require cursor zero; historical layout can name removed unused species',()=>{
  const old=F.content(E,[[]]),raw=current(old),next=F.content(E,[['C']]);next.regionalDex.transitions=[F.transition(old.regionalDex,next.regionalDex,[{from:0,to:0},{from:-1,to:-1}])];good(raw,next);
  const bad=F.clone(raw);bad.dex.view.indices[0]=1;refuse(bad,next);
  const historical=F.clone(old.regionalDex);historical.national.push('Removed');historical.layoutIdentity=F.identity(historical);const historicRaw=F.clone(raw);historicRaw.dex.layoutIdentity=historical.layoutIdentity;next.regionalDex.transitions=[F.transition(historical,next.regionalDex,[{from:0,to:0},{from:-1,to:-1}])];good(historicRaw,next);
});
test('B26: save/install gate rejects layout mismatch even if migration could succeed',()=>{
  const {next,raw}=layoutCase(),bytes=JSON.stringify(raw);assert(S.validateGameContent(raw,next).some(p=>p.path==='$.dex.layoutIdentity'));assert.equal(JSON.stringify(raw),bytes);assert.equal(migrate(raw,next).ok,true);
});
