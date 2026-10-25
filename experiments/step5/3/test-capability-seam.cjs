'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs'),F=E.fixtures,clone=x=>JSON.parse(JSON.stringify(x));
const dex=E.dex.createDexLookup(),C=clone(F.content),seed=[1,2,3,4];
for(const id of ['splash','surgingstrikes','substitute','endure','frostbreath','confuseray','return']){const m=dex.move(id);C.moves[id]={id:m.id,name:m.name,pp:m.pp};}
for(const species of ['Zoroark','Mimikyu','Eiscue']){const d=dex.species(species);C.species[species]={base:d.baseStats,growth:'medium',baseExp:50,evYield:{},catchRate:255,learnset:{}};}
function set(id,species,level,moves,extra={}){return {name:id,species,level,moves,ability:dex.species(species).abilities[0],nature:'Hardy',gender:'M',ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31},evs:{},happiness:70,...extra};}
function member(id,species,level,moves,extra={}){const s=set(id,species,level,moves),hp=E.growth.computeStats(C.species[species].base,s.ivs,s.evs,level,'hardy').hp;return {id,species,form:0,level,exp:E.growth.minExp(C.species[species].growth,level),hp,status:'',item:'',ability:s.ability,nature:'hardy',gender:'M',ivs:s.ivs,evs:s.evs,moves:moves.map(id=>({id,pp:dex.move(id).pp,maxpp:dex.move(id).pp})),...extra};}
async function gw(a,b,doubles=false){const g=await E.gateway.BattleGateway.create({formatid:doubles?'gen8rpgdoublescustomgame':'gen8rpgcustomgame',seed,players:[{name:'Player',team:a},{name:'Wild',team:b}],wild:true});await g.choose('p1','team '+a.map((_,i)=>i+1).join(''));await g.choose('p2','team '+b.map((_,i)=>i+1).join(''));return g;}
async function turn(g,a='move 1',b='move 1'){assert(await g.choose('p1',a));assert(await g.choose('p2',b));return g.drain();}
const hitFacts=g=>g.drainObservations().records.filter(r=>r.kind==='hit');
const norm=messages=>messages.map(m=>m.kind==='events'?{...m,events:m.events.filter(e=>e.type!=='t:')}:m);
async function session({party=[member('P1','Charizard',50,['flamethrower'])],foes=[member('F1','Pidgey',5,['splash'])],evidence=true,battleId='seam',driver}={}){
 const game=E.state.newGame({party,bag:{potion:4,masterball:3,revive:2},content:C,money:1000});
 const context={battleId,generation:2,contentIdentity:'seam-fixture',playerIds:game.party.map(m=>m.id),initialLevels:Object.fromEntries(game.party.map(m=>[m.id,m.level])),mapId:123};
 const s=await E.session.BattleSession.create({game,battleId,content:C,seed,foe:{kind:'wild',team:foes},...(evidence?{evidence:context}:{}),...(driver?{driver}:{})});s.take();return {s,game,context};
}
const seal=s=>{const raw=s.result();return E.session.sealBattleEvidence(s,{battleId:raw.battleId,generation:2,rawHash:E.state.resultHash(raw)});};

test('actual body/substitute hits carry true IDs and final critical values, including Illusion',async()=>{
 const g=await gw([set('P1','Zoroark',50,['splash','surgingstrikes'],{ability:'Illusion'}),set('P2','Snorlax',50,['splash'])],[set('F1','Snorlax',100,['substitute'])]);
 g.drainObservations();g.drain();await turn(g);await turn(g,'move 2');const hits=hitFacts(g);assert.equal(hits.length,3);assert(hits.every(h=>h.domain==='substitute'&&h.source.id==='P1'&&h.target.id==='F1'&&h.critical));
});
test('substitute actual loss excludes its construction cost and clamps a breaking hit',async()=>{
 const g=await gw([set('P1','Snorlax',50,['substitute'])],[set('F1','Charizard',100,['splash','surgingstrikes'])]);await turn(g);g.drainObservations();const sub=g._debugBattle().p1.pokemon[0].volatiles.substitute.hp;await turn(g,'move 1','move 2');const hits=hitFacts(g);assert.equal(hits.find(h=>h.domain==='substitute').loss,sub);assert(hits.some(h=>h.domain==='body'));
});
test('Endure loss is actual19, not theoretical damage; lethal loss precedes true faint',async()=>{
 const g=await gw([set('P1','Pidgey',5,['endure']),set('P2','Snorlax',100,['splash'])],[set('F1','Charizard',100,['quickattack'])]);g.drainObservations();await turn(g);assert.equal(hitFacts(g)[0].loss,19);
 await turn(g,'move 1');const facts=g.drainObservations().records;assert.equal(facts.find(f=>f.kind==='hit').loss,1);assert(facts.findIndex(f=>f.kind==='hit')<facts.findIndex(f=>f.kind==='faint'));
});
for(const [species,ability,move,count]of [['Mimikyu','Disguise','frostbreath',0],['Eiscue','Ice Face','surgingstrikes',2]])test(species+' absorbed hit has loss0/final critical false',async()=>{
 const g=await gw([set('P1','Charizard',50,[move])],[set('F1',species,50,['splash'],{ability})]);await turn(g);const hits=hitFacts(g);assert.equal(hits[0].loss,0);assert.equal(hits.filter(h=>h.critical).length,count);
});
test('friendly target criticals retain player source ownership (engine-only doubles)',async()=>{
 const g=await gw([set('P1','Charizard',50,['surgingstrikes']),set('P2','Snorlax',100,['splash'])],[set('F1','Snorlax',100,['splash']),set('F2','Snorlax',100,['splash'])],true);await turn(g,'move 1 -2, move 1','move 1, move 1');const hits=hitFacts(g);assert.equal(hits.length,3);assert(hits.every(h=>h.source.id==='P1'&&h.target.id==='P2'&&h.critical));
});
test('confusion interval captures exact46 and lethal1; a normal aborted move adds nothing',async()=>{
 for(const hp of [461,1]){const g=await gw([set('P1','Snorlax',100,['splash']),set('P2','Charizard',100,['splash'])],[set('F1','Gengar',50,['confuseray'])]);g.seedState('p1',[{id:'P1',hp}]);g.drainObservations();let facts=[];for(let i=0;i<6&&!facts.some(f=>f.kind==='confusion');i++){await turn(g);facts.push(...g.drainObservations().records);}assert.equal(facts.find(f=>f.kind==='confusion').loss,hp===1?1:46);}
});
test('unclosed/overlapping/healed confusion intervals become unavailable, never approximate',async()=>{
 const g=await gw([set('P1','Snorlax',100,['splash'])],[set('F1','Snorlax',100,['splash'])]);g.drainObservations();const actor={id:'P1',side:'p1',slot:0,level:100,hp:10,active:true};const pre={kind:'before-loss',target:actor,source:actor,amount:46,effect:'confused',effectType:'Move'};
 g._observe(pre);let batch=g.drainObservations();assert(batch.issues.some(i=>i.reason==='unclosed-loss-interval'));assert(!batch.records.some(f=>f.kind==='confusion'));
 g._observe(pre);g._observe({kind:'healing',target:actor});g._observe({kind:'move-aborted',target:{...actor,hp:0}});batch=g.drainObservations();assert(batch.issues.some(i=>i.reason==='healing-inside-loss-interval'));assert(!batch.records.some(f=>f.kind==='confusion'));
});
test('observer exceptions do not reject choices or change primary messages/state',async()=>{
 const a=await gw([set('P1','Charizard',50,['surgingstrikes'])],[set('F1','Snorlax',100,['splash'])]),b=await gw([set('P1','Charizard',50,['surgingstrikes'])],[set('F1','Snorlax',100,['splash'])]);a.drain();b.drain();b._observe=()=>{throw Error('injected observer');};const x=await turn(a),y=await turn(b);assert.deepEqual(norm(x),norm(y));assert.deepEqual(a.readState('p2'),b.readState('p2'));assert(b.drainObservations().issues.some(i=>i.group==='identity'));
});
test('friend operation validates expected/value and both writable fields before any write',async()=>{
 const g=await gw([set('P1','Snorlax',50,['return'])],[set('F1','Snorlax',100,['splash'])]),before=g.snapshot();for(const value of [-1,256,NaN,1.1])assert.throws(()=>g.applyFriendship('p1','P1',{expected:70,value}));assert.throws(()=>g.applyFriendship('p1','P1',{expected:69,value:80}));assert.equal(g.snapshot(),before);
 Object.freeze(g._debugBattle().p1.pokemon[0].set);assert.throws(()=>g.applyFriendship('p1','P1',{expected:70,value:80}),/writable/);assert.equal(g._debugBattle().p1.pokemon[0].happiness,70);
});
test('friend changes Return in this battle and opaque restore rolls live/set and observations back',async()=>{
 const g=await gw([set('P1','Snorlax',50,['return'],{happiness:0})],[set('F1','Snorlax',100,['splash'])]);g.drain();const checkpoint=g.checkpoint();g.applyFriendship('p1','P1',{expected:0,value:255});await turn(g);const high=g.readState('p2')[0].hp;const r=await E.gateway.BattleGateway.fromCheckpoint(checkpoint);assert.equal(r._debugBattle().p1.pokemon[0].happiness,0);assert.equal(r._debugBattle().p1.pokemon[0].set.happiness,0);await turn(r);assert(r.readState('p2')[0].hp>high);assert(r.drainObservations().records.some(f=>f.kind==='hit'));
});
test('real item then in-field level-up apply ordered nonlinear friend changes, without new result fields',async()=>{
 const m=member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99});m.exp=E.growth.minExp(C.species.Charizard.growth,51)-1;const {s}=await session({party:[m],foes:[member('F1','Caterpie',5,['splash']),member('F2','Pidgey',5,['splash'])]});await s.useItem('potion','P1');await s.chooseMove(1);await s.throwBall('masterball');const evidence=seal(s);assert.deepEqual(evidence.friendship.P1.changes.map(c=>c.method),['battleitem','levelup']);assert.equal(evidence.friendship.P1.current,104);assert(!('friendship'in s.result().members.P1));assert.equal(evidence.rawHash,E.state.resultHash(s.result()));
});
test('actual faintbad and faint reset D, retain K and record a clear-R lifecycle fact',async()=>{
 const {s}=await session({party:[member('P1','Pidgey',5,['splash'],{hp:1,friendship:99}),member('P2','Snorlax',100,['splash'])],foes:[member('F1','Charizard',100,['quickattack'])]});await s.chooseMove(1);await s.chooseForcedSwitch('P2');await s.throwBall('masterball');const e=seal(s);assert(e.fainted.includes('P1'));assert.equal(e.damage.P1,0);assert.equal(e.critical.P1,0);assert.equal(e.friendship.P1.current,94);assert.equal(e.friendship.P1.changes[0].method,'faintbad');
});
test('trusted256 skips only that member friend group and preserves capture/XP primary result',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:256})]});await s.useItem('potion','P1');await s.throwBall('masterball');const e=seal(s);assert(e.issues.some(i=>i.group==='friendship'&&i.memberId==='P1'));assert.equal(s.party[0].friendship,256);assert.equal(s.result().captured.length,1);assert.equal(e.friendship.P1,undefined);
});
test('an observation drain failure preserves legal capture and XP; seal is a copy and checks bindings',async()=>{
 const {s,game}=await session();s.gw.drainObservations=()=>{throw Error('injected drain');};await s.throwBall('masterball');assert(s.result().members.P1.exp>game.party[0].exp);const e=seal(s);assert(e.issues.some(i=>i.group==='identity'));e.records.length=0;assert(seal(s).records.length>0);const raw=s.result();assert.equal(E.session.sealBattleEvidence(s,{battleId:raw.battleId,generation:3,rawHash:E.state.resultHash(raw)}),null);
});
test('session failure after execution restores recorder, working friend, engine and retry without duplicates',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});const before=clone(s._evidence.value),choose=s.gw.choose.bind(s.gw);s.gw.choose=async(...args)=>{const ok=await choose(...args);if(args[0]==='p2')throw Error('after engine');return ok;};await assert.rejects(s.useItem('potion','P1'),/after engine/);assert.deepEqual(s._evidence.value,before);assert.equal(s.party[0].friendship,99);await s.useItem('potion','P1');await s.throwBall('masterball');assert.equal(seal(s).friendship.P1.changes.filter(c=>c.method==='battleitem').length,1);
});
test('bench upgrade does not produce in-field levelup friendship',async()=>{
 const a=member('P1','Charizard',50,['splash'],{friendship:99});a.exp=E.growth.minExp(C.species.Charizard.growth,51)-1;
 const {s}=await session({party:[a,member('P2','Blastoise',50,['hydropump'])],foes:[member('F1','Caterpie',5,['splash'])]});await s.chooseMove(1);await s.chooseSwitch('P2');await s.chooseMove(1);assert.equal(s.result().members.P1.level,51);assert.equal(seal(s).friendship.P1,undefined);
});
test('bad member damage coverage retains independently recorded criticals',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['surgingstrikes'])],foes:[member('F1','Snorlax',100,['splash'])]});s.gw._observationIssue('damage','injected-loss-gap','P1');await s.chooseMove(1);await s.throwBall('masterball');const e=seal(s);assert.equal(e.critical.P1,3);assert(e.issues.some(i=>i.group==='damage'&&i.memberId==='P1'));assert.equal(s.result().captured.length,1);
});
test('optional observer failure cannot suppress authoritative item friendship or change later Return',async()=>{
 const runs=[];
 for(const failure of [false,true]){
  const {s}=await session({party:[member('P1','Snorlax',50,['return'],{hp:50,friendship:99})],foes:[member('F1','Snorlax',100,['splash'])]});
  if(failure)s.gw._observe=()=>{throw Error('optional observer failed');};
  await s.useItem('potion','P1');assert.equal(s.party[0].friendship,100);await s.chooseMove(1);await s.throwBall('masterball');runs.push({result:s.result(),evidence:seal(s)});
 }
 assert.deepEqual(runs[0].result,runs[1].result);assert.equal(runs[0].evidence.friendship.P1.current,100);assert.equal(runs[1].evidence.friendship.P1,undefined);assert(runs[1].evidence.issues.some(i=>i.group==='identity'));
});
test('invalid friendship ACK closes only that member ordered group, keeping legal primary capture',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});s.gw.applyFriendship=()=>({before:7,after:8});await s.useItem('potion','P1');await s.throwBall('masterball');const e=seal(s);assert(e.issues.some(i=>i.reason==='invalid-friendship-ack'&&i.memberId==='P1'));assert.equal(s.party[0].friendship,99);assert.equal(s.result().captured.length,1);
});
function sample(){const fs=require('node:fs'),path=require('node:path'),read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../../content/sample',n)));const compiled=E.contentCompile.compileContent({manifest:read('manifest.json'),sources:read('sources.json'),species:read('species.json'),overlays:read('overlays.json'),grants:read('grants.json')});assert(compiled.ok);const c=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(c.errors,[]);return c.content;}
test('real application factory binds companion to generation/raw hash; snapshots are copies and duplicates do not backfill',async()=>{
 const content=sample(),game=F.savedFor(F.makeGame(),content),state=E.fakes.createMemoryState(game),factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>seed});let seals=0;const reader=factory.evidence.bind(factory);factory.evidence=(...args)=>{seals++;return reader(...args);};
 const app=new E.app.GameApplication({state,sessions:factory,projection:E.fakes.createRecordingProjection(),content:()=>({content}),random:n=>0,clock:()=>0,itemWorld:()=>({mapId:123})},{receivingProfile:{naming:1,mode:1}}),request={battleId:'app-evidence',kind:'wild',seq:1,foes:[{species:'pidgey',level:5}]};
 const s=await app.startBattle(request);await s.throwBall('masterball');const out=app.finishBattle(s,request);assert.equal(out.commit,'applied');const evidence=app.battleEvidenceSnapshot(s);assert.equal(evidence.rawHash,E.state.resultHash(s.result()));assert.equal(evidence.context.generation,0);assert(evidence.records.some(f=>f.kind==='appearance'));assert.equal(state.replaced.length,1);evidence.records.length=0;assert(app.battleEvidenceSnapshot(s).records.length>0);assert.equal(app.finishBattle(s,request).commit,'already-applied');assert.equal(seals,1);assert.equal(state.replaced.length,1);app.stateReplacedByHost();assert.equal(app.battleEvidenceSnapshot(s),null);
});
test('factory seal failure cannot lose capture/XP or rerun on duplicate finish',async()=>{
 const content=sample(),game=F.savedFor(F.makeGame(),content),state=E.fakes.createMemoryState(game),factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>seed});let calls=0;factory.evidence=()=>{calls++;throw Error('injected seal failure');};
 const app=new E.app.GameApplication({state,sessions:factory,projection:E.fakes.createRecordingProjection(),content:()=>({content}),random:n=>0,clock:()=>0},{receivingProfile:{naming:1,mode:1}}),request={battleId:'app-seal-failure',kind:'wild',seq:1,foes:[{species:'pidgey',level:5}]};const s=await app.startBattle(request);await s.throwBall('masterball');const out=app.finishBattle(s,request);assert.equal(out.commit,'applied');assert.equal(state.current().party.length,4);assert(state.current().party[0].exp>game.party[0].exp);assert(out.diagnostics.some(x=>x.includes('读取失败')));assert.equal(app.battleEvidenceSnapshot(s),null);assert.equal(app.finishBattle(s,request).commit,'already-applied');assert.equal(calls,1);
});

for(const failure of ['throw','malformed','sparse','sparse-opponents'])test('control drain '+failure+' preserves successful item, capture and XP while closing only friend execution',async()=>{
 const {s,game}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});
 s.gw.drainFriendshipFaints=()=>{if(failure==='throw')throw Error('injected control read');if(failure==='sparse')return Array(1);if(failure==='sparse-opponents')return [{kind:'faint',target:{id:'P1',side:'p1',slot:0,level:50,hp:0,active:true},opponents:Array(1)}];return [{}];};
 assert((await s.useItem('potion','P1')).ok);assert.equal(s.bag.potion,3);assert(s.gw.readState('p1')[0].hp>50);
 await s.throwBall('masterball');assert.equal(s.result().captured.length,1);assert(s.result().members.P1.exp>game.party[0].exp);assert(seal(s).issues.some(i=>i.reason==='friendship-control-drain-failed'));
});
for(const failure of ['bad-ack','postwrite-throw'])test('friend '+failure+' restores live/set and working value before later Return',async()=>{
 const outcomes=[];
 for(const injected of [false,true]){
  const {s}=await session({party:[member('P1','Snorlax',100,['return'],{hp:50,friendship:4})],foes:[member('F1','Snorlax',100,['splash'])]});
  const apply=s.gw.applyFriendship.bind(s.gw);s.gw.applyFriendship=(...args)=>{if(!injected)throw Error('before write');const ack=apply(...args);if(failure==='postwrite-throw')throw Error('after write');return {before:ack.before+1,after:ack.after+1};};
  await s.useItem('potion','P1');assert.equal(s.party[0].friendship,4);assert.equal(s.gw._debugBattle().p1.pokemon[0].happiness,4);assert.equal(s.gw._debugBattle().p1.pokemon[0].set.happiness,4);
  const hp=s.gw.readState('p2')[0].hp;await s.chooseMove(1);outcomes.push(hp-s.gw.readState('p2')[0].hp);await s.throwBall('masterball');assert.equal(s.result().captured.length,1);
 }
 assert.deepEqual(outcomes,[3,3]);
});
test('friend checkpoint is owner-bound, preserves absent set default and restores only friend',async()=>{
 const g=await gw([set('P1','Snorlax',50,['return'],{happiness:255})],[set('F1','Snorlax',100,['splash'])]),other=await gw([set('P1','Snorlax',50,['return'])],[set('F1','Snorlax',100,['splash'])]);
 const p=g._debugBattle().p1.pokemon[0];delete p.set.happiness;const token=g.checkpointFriendship('p1','P1');assert.deepEqual(Object.keys(token),[]);
 g.applyFriendship('p1','P1',{expected:255,value:70});g.seedState('p1',[{id:'P1',hp:50}]);assert.throws(()=>other.restoreFriendship(token));assert.throws(()=>g.restoreFriendship(clone(token)));
 g.restoreFriendship(token);assert.equal(p.happiness,255);assert(!Object.hasOwn(p.set,'happiness'));assert.equal(p.hp,50);assert.throws(()=>g.restoreFriendship(token));
});
test('missing friend recovery capability refuses the new effect before a write, preserving main capture',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});let calls=0;const apply=s.gw.applyFriendship.bind(s.gw);s.gw.applyFriendship=(...args)=>{calls++;return apply(...args);};s.gw.restoreFriendship=undefined;
 await s.useItem('potion','P1');await s.throwBall('masterball');assert.equal(calls,0);assert.equal(s.party[0].friendship,99);assert.equal(s.result().captured.length,1);
});
test('genuine local friend recovery failure marks the session broken instead of continuing inconsistent play',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});const apply=s.gw.applyFriendship.bind(s.gw);s.gw.applyFriendship=(...args)=>{apply(...args);throw Error('after write');};s.gw.restoreFriendship=()=>{throw Error('local restore failed');};
 await assert.rejects(s.useItem('potion','P1'),e=>e.name==='SessionBrokenError'&&/after write/.test(String(e.original))&&/local restore failed/.test(String(e.restoreError)));assert(s.broken);await assert.rejects(s.chooseMove(1),/unusable/);
});
test('friend observation-copy failure cannot undo successful control or stop a later real level trigger',async()=>{
 const m=member('P1','Snorlax',50,['return'],{hp:50,friendship:99});m.exp=E.growth.minExp(C.species.Snorlax.growth,51)-1;
 const {s}=await session({party:[m]});Object.freeze(s._evidence.value.friendship);await s.useItem('potion','P1');assert.equal(s.party[0].friendship,100);await s.throwBall('masterball');assert.equal(s.party[0].friendship,104);assert.equal(s.gw._debugBattle().p1.pokemon[0].happiness,104);assert(seal(s).issues.some(i=>i.reason==='friendship-record-failed'));assert.equal(s.result().captured.length,1);
});
for(const id of ['constructor','__proto__','toString'])test('legal member ID '+id+' survives JSON/opaque restore without prototype writes or missing groups',async()=>{
 const before=[Object.getOwnPropertyDescriptor(Object.prototype,'current'),Object.getOwnPropertyDescriptor(Object,'current'),Object.getOwnPropertyDescriptor(Object.prototype.toString,'current')];
 const {s}=await session({party:[member(id,'Snorlax',50,['return'],{hp:50,friendship:99})],foes:[member('F1','Pidgey',5,['tackle'])]});
 await s.useItem('potion',id);const checkpoint=s._checkpoint();await s.useItem('potion',id);await s._restoreCheckpoint(checkpoint);await s.useItem('potion',id);await s.throwBall('masterball');const evidence=seal(s);
 assert(Object.hasOwn(evidence.friendship,id));assert.equal(evidence.friendship[id].current,101);assert.equal(evidence.friendship[id].changes.length,2);assert(Object.hasOwn(evidence.damage,id));assert(evidence.damage[id]>0);assert.deepEqual(evidence.issues,[]);
 assert.deepEqual([Object.getOwnPropertyDescriptor(Object.prototype,'current'),Object.getOwnPropertyDescriptor(Object,'current'),Object.getOwnPropertyDescriptor(Object.prototype.toString,'current')],before);
});

test('R4 same-side wrong member is refused before any friend write; capture and XP still complete',async()=>{
 const {s,game}=await session({party:[member('P1','Pidgey',5,['splash'],{hp:1,friendship:99}),member('P2','Snorlax',50,['splash'],{friendship:99})],foes:[member('F1','Charizard',100,['quickattack'])]});
 const drain=s.gw.drainFriendshipFaints.bind(s.gw);s.gw.drainFriendshipFaints=()=>drain().map(r=>r.target.side==='p1'?{...r,target:{...r.target,id:'P2',level:50}}:r);
 await s.chooseMove(1);for(const id of ['P1','P2']){assert.equal(s.party.find(m=>m.id===id).friendship,99);const p=s.gw._debugBattle().p1.pokemon.find(p=>p.name===id);assert.equal(p.happiness,99);assert.equal(p.set.happiness,99);}
 assert(s._evidence.value.issues.some(i=>i.reason==='faint-control-source-unavailable'));await s.chooseForcedSwitch('P2');await s.throwBall('masterball');assert.equal(s.result().captured.length,1);assert(s.result().members.P2.exp>game.party.find(m=>m.id==='P2').exp);
});
test('R4 extra control with no public faint is closed in the same batch, preserving a legal potion and capture',async()=>{
 const {s,game}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});const drain=s.gw.drainFriendshipFaints.bind(s.gw);s.gw.drainFriendshipFaints=()=>[...drain(),{kind:'faint',target:{id:'P1',side:'p1',slot:0,level:50,hp:0,active:true},opponents:[]}];
 await s.useItem('potion','P1');assert.equal(s.bag.potion,3);assert(s.gw.readState('p1')[0].hp>50);assert.equal(s._pendingFriendFaints.length,0);assert.equal(s.party[0].friendship,99);await s.throwBall('masterball');assert.equal(s.result().captured.length,1);assert(s.result().members.P1.exp>game.party[0].exp);assert(seal(s).issues.some(i=>i.reason==='faint-control-source-unavailable'));
});
test('R4 real Illusion poison faint uses true P1 while the public faint displays P2',async()=>{
 const {s}=await session({party:[member('P1','Zoroark',5,['splash'],{hp:1,status:'psn',ability:'Illusion',friendship:99}),member('P2','Snorlax',100,['splash'],{friendship:99})],foes:[member('F1','Charizard',100,['splash'])]});const turn=await s.chooseMove(1);
 assert(turn.messages.filter(m=>m.kind==='events').flatMap(m=>m.events).some(e=>e.type==='faint'&&e.args[0]==='p1a: P2'));assert.equal(s.party.find(m=>m.id==='P1').friendship,94);assert.equal(s.party.find(m=>m.id==='P2').friendship,99);assert(!s._evidence.value.issues.some(i=>i.group==='friendship'));
 await s.chooseForcedSwitch('P2');await s.throwBall('masterball');assert.equal(s.result().captured.length,1);
});
test('R4 private canonical faint binding survives opaque restore and is consumed once',async()=>{
 const g=await gw([set('P1','Pidgey',5,['splash']),set('P2','Snorlax',100,['splash'])],[set('F1','Charizard',100,['quickattack'])]);g.seedState('p1',[{id:'P1',hp:1}]);g.drain();g.drainFriendshipFaints();await g.choose('p1','move 1');await g.choose('p2','move 1');const cp=g.checkpoint();
 const check=driver=>{const messages=driver.drain(),facts=driver.drainFriendshipFaints(),idents=messages.filter(m=>m.kind==='events').flatMap(m=>m.events).filter(e=>e.type==='faint').map(e=>e.args[0]);assert.equal(driver.validateFriendshipFaints(facts,idents),true);assert.equal(driver.validateFriendshipFaints(facts,idents),false);};check(g);check(await E.gateway.BattleGateway.fromCheckpoint(cp));
});
test('R4 seal cannot call residual pending friend coverage complete, and leaves primary result unchanged',async()=>{
 const {s}=await session({party:[member('P1','Charizard',50,['flamethrower'],{hp:50,friendship:99})]});await s.useItem('potion','P1');await s.throwBall('masterball');const raw=clone(s.result());assert(seal(s).friendship.P1);
 s._pendingFriendFaints.push({kind:'faint',target:{id:'P1',side:'p1',slot:0,level:50,hp:0,active:true},opponents:[]});const evidence=seal(s);assert.deepEqual(evidence.friendship,{});assert(evidence.issues.some(i=>i.reason==='unpaired-faint-control'));assert.deepEqual(s.result(),raw);assert.equal(raw.captured.length,1);
});
