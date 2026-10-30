'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {source,inputs,clone,frozen,confirmation}=require('./helpers.cjs');
const E=require('../../js/engine/build/engine.cjs');
const modules=Promise.all([source('rules/friendship-migration'),source('content/friendship-migration'),source('rules/friendship'),source('content/compile')]);
const hash=s=>createHash('sha256').update(s).digest('hex');
function game(){const g=E.fixtures.makeGame();g.party[0].friendship=256;g.party[1].friendship=257;delete g.party[2].friendship;const m=clone(g.party[0]);m.id='BOX-1';m.friendship=256;g.storage.boxes[3].name='Old box';g.storage.boxes[3].slots[9]=m;g.appliedBattles['old']={hash:'a'.repeat(64)};g.claims.legacy={kind:'grant'};g.defeatedTrainers['legacy@1']={id:'legacy',version:1};return g;}
function author(){const i=inputs(1);i.species[0].happiness=256;i.species[1].happiness=257;i.species.push({id:i.species[0].id,form:1,showdownId:'charmeleon',source:i.species[0].source,happiness:256});i.overlays=[{target:'species/'+i.species[2].id,set:{happiness:256},reason:'explicit legacy author patch'}];return i;}
function ready(r){assert.equal(r.status,'ready',JSON.stringify(r));return r.plan;}
function refused(r,reason){assert.equal(r.status,'refused',JSON.stringify(r));if(reason)assert.equal(r.reason,reason);assert.equal(r.data,undefined);assert.equal(r.receipt,undefined);}

for(const scope of ['player','author'])test(scope+' preview is zero-write, complete hashes/identities/selection and exact256 only',async()=>{
 const [p,a]=await modules,input=scope==='player'?game():author(),before=clone(input),planFn=scope==='player'?p.planPlayerFriendshipMigration:a.planAuthorFriendshipMigration;
 const snapshot=p.friendshipMigrationSnapshot(input),plan=ready(planFn(frozen(input)));assert.deepEqual(input,before);assert.equal(plan.beforeSnapshot,snapshot);assert.deepEqual(JSON.parse(plan.beforeSnapshot),before);assert.equal(plan.beforeHash,hash(snapshot));assert.equal(plan.afterHash,hash(plan.afterSnapshot));assert.equal(plan.version,1);assert.equal(plan.kind,scope==='player'?'player-friendship-256-to-255':'author-happiness-256-to-255');assert.equal(plan.targets.length,scope==='player'?2:3);assert.equal(plan.candidates.length,plan.targets.length);for(const t of plan.targets){assert.equal(t.before,256);assert.equal(t.after,255);assert.ok(t.identity.length);assert.ok(t.path.includes(scope==='player'?'friendship':'happiness'));}
 assert.equal(plan.outOfScope.length,1);assert.equal(plan.outOfScope[0].value,257);assert.equal(plan.outOfScope[0].reason,'outside-approved-256-migration');const {planHash,...body}=plan;assert.equal(planHash,hash(p.friendshipMigrationSnapshot(body)));
 const selected=ready(planFn(input,[plan.targets.at(-1).path]));assert.equal(selected.targets.length,1);assert.equal(selected.candidates.length,plan.candidates.length);assert.notEqual(selected.planHash,plan.planHash);assert.notEqual(selected.afterHash,plan.afterHash);
});

for(const scope of ['player','author'])test(scope+' confirm preserves full original and every non-target field/ledger; repeat is idempotent',async()=>{
 const [p,a]=await modules,input=scope==='player'?game():author(),before=clone(input),planFn=scope==='player'?p.planPlayerFriendshipMigration:a.planAuthorFriendshipMigration,applyFn=scope==='player'?p.applyPlayerFriendshipMigration:a.applyAuthorFriendshipMigration;
 const plan=ready(planFn(input)),confirm=confirmation(plan);frozen(input);frozen(plan);const applied=applyFn(input,plan,confirm);assert.equal(applied.status,'applied',JSON.stringify(applied));assert.deepEqual(input,before);assert.equal(p.friendshipMigrationSnapshot(applied.data),plan.afterSnapshot);assert.equal(applied.receipt.originalSnapshot,plan.beforeSnapshot);assert.equal(hash(applied.receipt.originalSnapshot),applied.receipt.beforeHash);assert.equal(hash(applied.receipt.afterSnapshot),applied.receipt.afterHash);const {receiptHash,...receipt}=applied.receipt;assert.equal(receiptHash,hash(p.friendshipMigrationSnapshot(receipt)));
 const expected=clone(before);if(scope==='player'){expected.party[0].friendship=255;expected.storage.boxes[3].slots[9].friendship=255;assert.equal(Object.hasOwn(applied.data.party[2],'friendship'),false);for(const k of ['appliedBattles','claims','defeatedTrainers','schema','inventory','money','dex','stats','steps'])assert.deepEqual(applied.data[k],before[k]);}else{expected.species[0].happiness=255;expected.species.at(-1).happiness=255;expected.overlays[0].set.happiness=255;assert.equal(applied.data.manifest.schema,1);assert.equal(Object.hasOwn(applied.data.species[2],'happiness'),false);}
 assert.deepEqual(applied.data,expected);const repeated=applyFn(frozen(applied.data),JSON.parse(JSON.stringify(plan)),confirmation(plan));assert.equal(repeated.status,'already-applied',JSON.stringify(repeated));assert.deepEqual(repeated.data,expected);assert.deepEqual(repeated.receipt,applied.receipt);const nextPlan=ready(planFn(repeated.data));assert.equal(nextPlan.targets.length,0);const unchanged=applyFn(repeated.data,nextPlan,confirmation(nextPlan));assert.equal(unchanged.status,'unchanged');assert.deepEqual(unchanged.data,expected);assert.equal(nextPlan.outOfScope[0].value,257);
});

for(const scope of ['player','author'])test(scope+' only selected targets change, while unselected256 and other legacy values remain explicit',async()=>{
 const [p,a]=await modules,input=scope==='player'?game():author(),planFn=scope==='player'?p.planPlayerFriendshipMigration:a.planAuthorFriendshipMigration,applyFn=scope==='player'?p.applyPlayerFriendshipMigration:a.applyAuthorFriendshipMigration;
 const all=ready(planFn(input)),plan=ready(planFn(input,[all.candidates[0].path])),r=applyFn(input,plan,confirmation(plan));assert.equal(r.status,'applied');const remaining=ready(planFn(r.data));assert.equal(remaining.candidates.length,all.candidates.length-1);assert.equal(remaining.outOfScope.length,1);const none=ready(planFn(input,[]));assert.equal(applyFn(input,none,confirmation(none)).status,'unchanged');
 for(const paths of [[all.candidates[0].path,all.candidates[0].path],['unknown'],[all.outOfScope[0].path],new Array(1),[undefined]])refused(planFn(input,paths),'invalid-selection');
});

for(const scope of ['player','author'])test(scope+' stale full snapshot, wrong confirmation, incomplete/modified plan fail atomically',async()=>{
 const [p,a]=await modules,input=scope==='player'?game():author(),planFn=scope==='player'?p.planPlayerFriendshipMigration:a.planAuthorFriendshipMigration,applyFn=scope==='player'?p.applyPlayerFriendshipMigration:a.applyAuthorFriendshipMigration;
 const before=clone(input),plan=ready(planFn(input)),confirm=confirmation(plan);
 const stale=clone(input);if(scope==='player')stale.money++;else stale.manifest.title+=' changed';const staleBefore=clone(stale);refused(applyFn(stale,plan,confirm),'stale-plan');assert.deepEqual(stale,staleBefore);
 const partially=JSON.parse(plan.afterSnapshot);if(scope==='player')partially.storage.boxes[3].slots[9].friendship=256;else partially.species.at(-1).happiness=256;refused(applyFn(partially,plan,confirm),'stale-plan');
 for(const approved of [{...confirm,planHash:'0'.repeat(64)},{...confirm,targetPaths:[]},{...confirm,targetPaths:[...confirm.targetPaths].reverse()}])refused(applyFn(input,plan,approved),'confirmation-mismatch');
 const mutations=[q=>delete q.afterHash,q=>q.version=2,q=>q.kind='wrong',q=>q.beforeHash='0'.repeat(64),q=>q.afterHash='0'.repeat(64),q=>q.planHash='0'.repeat(64),q=>q.targets.pop(),q=>q.targets[0].identity+=' changed',q=>q.candidates.pop(),q=>q.outOfScope=[],q=>q.afterSnapshot=q.beforeSnapshot,q=>q.beforeSnapshot='{}',q=>q.extra='unrecognized'];
 for(const edit of mutations){const changed=clone(plan);edit(changed);refused(applyFn(input,changed,confirm),'invalid-plan');assert.deepEqual(input,before);}
 // Recomputing hashes cannot bypass independently retained confirmation of the displayed preview.
 const replacement=ready(planFn(input,[plan.candidates[0].path]));refused(applyFn(input,replacement,confirm),'confirmation-mismatch');
});

test('invalid player member, duplicate identity and invalid author fields reject whole preview without writes',async()=>{
 const [p,a]=await modules;for(const value of [-1,1.5,null,'256',Number.MAX_SAFE_INTEGER+1]){
  const g=game();g.storage.boxes[3].slots[9].friendship=value;const before=clone(g),r=p.planPlayerFriendshipMigration(g);refused(r,'invalid-input');assert.ok(r.problems.some(e=>e.path==='$.storage.boxes[3].slots[9].friendship'));assert.deepEqual(g,before);
  const i=author();i.species.at(-1).happiness=value;const beforeI=clone(i);refused(a.planAuthorFriendshipMigration(i),'invalid-input');assert.deepEqual(i,beforeI);
 }
 const g=game();g.storage.boxes[3].slots[9].id=g.party[0].id;refused(p.planPlayerFriendshipMigration(g),'invalid-input');for(const v of [{}, {schema:8,party:[],storage:{}}, {schema:8,party:[],storage:{boxes:[{}]}}])refused(p.planPlayerFriendshipMigration(v),'invalid-input');
});

test('snapshot rejects lossy/non-JSON/hidden/sparse inputs without invoking getters or modifying original',async()=>{
 const [p,a]=await modules;let calls=0;const access={};Object.defineProperty(access,'x',{enumerable:true,get(){calls++;return 256;}});const cycle={};cycle.x=cycle;const hidden={};Object.defineProperty(hidden,'x',{value:256});
 for(const bad of [undefined,NaN,Infinity,-0,()=>0,1n,new Date(),{x:undefined},new Array(1),Object.assign([], {extra:1}),access,cycle,hidden,{[Symbol('x')]:256}]){assert.throws(()=>p.friendshipMigrationSnapshot(bad));refused(p.planPlayerFriendshipMigration(bad),'invalid-snapshot');refused(a.planAuthorFriendshipMigration(bad),'invalid-snapshot');}
 assert.equal(calls,0);
});

test('snapshot canonical key order hashes full unrelated data and keeps __proto__ as own JSON data',async()=>{
 const [p]=await modules;const x=JSON.parse('{"__proto__":{"kept":true},"z":[1,{"b":2,"a":3}],"a":0}'),s=p.friendshipMigrationSnapshot(x);assert.equal(s,'{"__proto__":{"kept":true},"a":0,"z":[1,{"a":3,"b":2}]}');assert.ok(Object.hasOwn(JSON.parse(s),'__proto__'));assert.equal({}.kept,undefined);
});

test('after player migration every existing change/query uses normal255 domain; other legacy values remain refused',async()=>{
 const [p,,f]=await modules,g=game(),plan=ready(p.planPlayerFriendshipMigration(g)),r=p.applyPlayerFriendshipMigration(g,plan,confirmation(plan));assert.equal(r.status,'applied');const m=r.data.party[0],before=clone(m),ctx={AFFECTION_EFFECTS:false};assert.deepEqual(f.deriveAffection(m),{status:'ready',affection:5});for(const method of ['walking','levelup','groom','evberry','vitamin','wing','machine','battleitem','faint','faintbad','powder','energyroot','revivalherb'])assert.equal(f.planFriendshipChange(m,method,ctx).status,'ready');assert.deepEqual(f.planFriendshipChange(m,'faintbad',ctx),{status:'ready',method:'faintbad',before:255,after:245,delta:-10});assert.deepEqual(m,before);
 for(const method of ['unknown','constructor','__proto__'])assert.deepEqual(f.planFriendshipChange(m,method,ctx),{status:'refused',reason:'unknown-friendship-method',method});assert.equal(f.deriveAffection(r.data.party[1]).reason,'friendship-out-of-domain');assert.equal(f.planFriendshipChange(r.data.party[1],'walking',ctx).reason,'friendship-out-of-domain');
 const adapted=clone(m);E.itemEffects.changeFriendship(adapted,'energyroot',{},{});assert.equal(adapted.friendship,240);assert.deepEqual(f.deriveAffection(adapted),{status:'ready',affection:4});
});

test('author migration then explicit manifest2 produces ordinary member255; other >255 blocks standard upgrade',async()=>{
 const [p,a,f,c]=await modules,i=author(),plan=ready(a.planAuthorFriendshipMigration(i)),r=a.applyAuthorFriendshipMigration(i,plan,confirmation(plan));assert.equal(r.status,'applied');assert.equal(c.compileContent(r.data).ok,true);const remains=clone(r.data);remains.manifest.schema=2;assert.equal(c.compileContent(remains).ok,false,'257 is explicitly outside this migration');
 const clean=inputs(1);clean.species[0].happiness=256;const only=ready(a.planAuthorFriendshipMigration(clean)),out=a.applyAuthorFriendshipMigration(clean,only,confirmation(only));out.data.manifest.schema=2;const compiled=c.compileContent(out.data);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const m=E.memberFactory.createMember({id:'MIG-1',species:'Charizard',level:5,form:0},assembled.content,()=>0);assert.equal(m.friendship,255);assert.equal(f.deriveAffection(m).status,'ready');assert.equal(f.planFriendshipChange(m,'walking',{AFFECTION_EFFECTS:false}).status,'ready');assert.equal(clean.species[0].happiness,256);
});

test('exact256 migration preserves every other nonnegative safe legacy value including MAX_SAFE_INTEGER',async()=>{
 const [p,a]=await modules;for(const value of [257,1024,Number.MAX_SAFE_INTEGER]){
  const g=game();g.party[1].friendship=value;const gp=ready(p.planPlayerFriendshipMigration(g)),gr=p.applyPlayerFriendshipMigration(g,gp,confirmation(gp));assert.equal(gr.status,'applied');assert.equal(gr.data.party[1].friendship,value);assert.equal(gp.outOfScope[0].value,value);
  const i=author();i.species[1].happiness=value;const ip=ready(a.planAuthorFriendshipMigration(i)),ir=a.applyAuthorFriendshipMigration(i,ip,confirmation(ip));assert.equal(ir.status,'applied');assert.equal(ir.data.species[1].happiness,value);assert.equal(ip.outOfScope[0].value,value);
 }
});

test('author inherited form omission remains omitted; normal compilation inherits migrated base255',async()=>{
 const [,a,,c]=await modules,i=inputs(1);i.species[0].happiness=256;i.species.push({id:i.species[0].id,form:1,showdownId:'charmeleon',source:i.species[0].source});const plan=ready(a.planAuthorFriendshipMigration(i));assert.equal(plan.targets.length,1);const r=a.applyAuthorFriendshipMigration(i,plan,confirmation(plan));assert.equal(r.status,'applied');assert.equal(Object.hasOwn(r.data.species.at(-1),'happiness'),false);const compiled=c.compileContent(r.data);assert.equal(compiled.ok,true);assert.equal(compiled.data.species.find(s=>s.form===1).happiness,255);
});
