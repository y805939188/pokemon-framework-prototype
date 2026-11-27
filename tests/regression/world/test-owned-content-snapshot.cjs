'use strict';
// Fixed value vectors, ownership/cache boundary and actual compiled Content loader. No NW or player saves.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');
const E=require(process.env.PF_SNAPSHOT_ENGINE||path.join(ROOT,'js/engine/build/production.cjs'));
const own=value=>E.semantic.ownedImmutableSnapshot?E.semantic.ownedImmutableSnapshot(value):value;
const vectors=require('../../../tests/support/validation/contract-vectors/value-semantics-vectors.json').vectors;
const F=require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
const flush=()=>new Promise(setImmediate);
function scanCount(run){const original=Object.getOwnPropertyDescriptors;let scans=0;Object.getOwnPropertyDescriptors=function(value){scans++;return Reflect.apply(original,Object,[value]);};try{return {result:run(),scans};}finally{Object.getOwnPropertyDescriptors=original;}}
function loader(){
 const file=process.env.PF_SNAPSHOT_FLOW||path.join(ROOT,'js/plugins/PS_BattleFlow.js'),source=fs.readFileSync(file,'utf8');
 const a=source.indexOf('\n\t\t\tcontent() {'),b=source.indexOf('\n\t\t\t_content:',a);assert(a>=0&&b>a,'actual compiled Content loader');
 const G={PluginManager:{parameters:()=>({contentSource:'sample'})}},PSFlow={_content:null,developerCapabilities:{}};
 const root=process.env.PF_SNAPSHOT_RUNTIME||ROOT;
 let reads=0;
 // This slice tests the admitted compiled loader/cache, not the isolated admission boundary.
 const context=vm.createContext({G,PSFlow,NAME:'PS_BattleFlow',fixtureSource:()=>false,battleCapabilities:()=>({}),engine:()=>({B:E,root}),
  nodeRequire:id=>id==='fs'?{readFileSync(...args){reads++;return fs.readFileSync(...args);}}:require(id),testing:()=>{throw Error('unexpected fixture source');},COMPILED_SCHEMA_VERSION:E.contentSchema.COMPILED_SCHEMA_VERSION,
  contentFailure:kind=>assert.fail('formal positive content load unexpectedly refused: '+kind),isSafeStartupFailure:()=>false});
 vm.runInContext('PSFlow.content=({'+source.slice(a,b)+'}).content;',context,{filename:file+':actual-content-loader'});
 return {flow:PSFlow,reads:()=>reads};
}
test('owned formal load is detached, deeply immutable and cached until normal content invalidation',()=>{
 const {flow,reads}=loader(),first=flow.content();assert.equal(reads(),1);assert(Object.isFrozen(first));assert(Object.isFrozen(first.moves));assert(Object.isFrozen(first.world.encounters.tables));
 assert.strictEqual(flow.content(),first);assert.equal(reads(),1);assert.equal(scanCount(()=>E.semantic.semanticFingerprint(first)).scans,0,'loaded content must not rescan');
 assert.equal(E.semantic.ownedImmutableFingerprint(first),E.semantic.semanticFingerprint(first));
 const before=E.semantic.semanticFingerprint(first);assert.throws(()=>{first.moves.Growl.pp++;},TypeError);assert.equal(E.semantic.semanticFingerprint(first),before);
 flow._content=null;const second=flow.content();assert.equal(reads(),2);assert.notStrictEqual(second,first);assert.equal(E.semantic.semanticFingerprint(second),before);assert(Object.isFrozen(second));
 const mutable=structuredClone(first);flow._content=mutable;assert.strictEqual(flow.content(),mutable);const old=E.semantic.semanticFingerprint(mutable);mutable.moves.Growl.pp++;assert.notEqual(E.semantic.semanticFingerprint(mutable),old);assert(scanCount(()=>E.semantic.semanticFingerprint(mutable)).scans>0);
});
test('only a newly owned deep copy is cached; aliases and caller-frozen records remain observable',()=>{
 const source={z:[{value:1}],a:{text:'中文'}},snapshot=own(source),expected=E.semantic.semanticFingerprint(source);
 assert.notStrictEqual(snapshot,source);assert.notStrictEqual(snapshot.z,source.z);assert.notStrictEqual(snapshot.z[0],source.z[0]);assert(Object.isFrozen(snapshot.z[0]));
 source.z[0].value=2;assert.equal(E.semantic.semanticFingerprint(snapshot),expected);assert.notEqual(E.semantic.semanticFingerprint(source),expected);
 assert.equal(scanCount(()=>{for(let i=0;i<8;i++)assert.equal(E.semantic.semanticFingerprint(snapshot),expected);}).scans,0);
 const external=Object.freeze({nested:{value:1},meta:{contentIdentity:expected}});const before=E.semantic.semanticFingerprint(external);external.nested.value=3;assert.notEqual(E.semantic.semanticFingerprint(external),before);assert(scanCount(()=>E.semantic.semanticFingerprint(external)).scans>0);
 const externalDeep=Object.freeze({nested:Object.freeze({value:1})});assert(scanCount(()=>E.semantic.semanticFingerprint(externalDeep)).scans>0,'caller deep-freeze grants no cache ownership');
 for(const externalValue of [source,external,externalDeep,null,'external-id'])assert.equal(E.semantic.ownedImmutableFingerprint(externalValue),undefined);
 const wrapped=new Proxy(snapshot,{});assert.equal(E.semantic.semanticFingerprint(wrapped),expected);assert(scanCount(()=>E.semantic.semanticFingerprint(wrapped)).scans>0,'a wrapper cannot borrow the snapshot cache');
 assert.equal(E.semantic.ownedImmutableFingerprint(wrapped),undefined);
 const copy=structuredClone(snapshot);copy.z[0].value=4;assert.notEqual(E.semantic.semanticFingerprint(copy),expected);
});
test('owned business data keeps JSON key order and safe own keys while identity ignores dictionary order',()=>{
 const input=JSON.parse('{"z":{"second":2,"first":1},"10":"ten","2":"two","__proto__":{"owned":true},"constructor":"label","01":"leading","a":[{"right":2,"left":1}]}');
 const reordered=JSON.parse('{"a":[{"left":1,"right":2}],"01":"leading","constructor":"label","__proto__":{"owned":true},"2":"two","10":"ten","z":{"first":1,"second":2}}');
 const snapshot=own(input),other=own(reordered);
 assert.equal(JSON.stringify(snapshot),JSON.stringify(input));
 assert.equal(JSON.stringify(other),JSON.stringify(reordered));
 assert.deepEqual(Object.keys(snapshot),['2','10','z','__proto__','constructor','01','a']);
 assert.equal(Object.getPrototypeOf(snapshot),Object.prototype);
 assert.equal(Object.getOwnPropertyDescriptor(snapshot,'__proto__').value.owned,true);
 assert.equal(Object.getOwnPropertyDescriptor(snapshot,'constructor').value,'label');
 assert.equal(Object.getPrototypeOf(snapshot).owned,undefined);
 assert(Object.isFrozen(snapshot.__proto__));
 const identity=E.semantic.semanticFingerprint(input);
 assert.equal(E.semantic.semanticFingerprint(reordered),identity);
 assert.equal(E.semantic.ownedImmutableFingerprint(snapshot),identity);
 assert.equal(E.semantic.ownedImmutableFingerprint(other),identity);
});
for(const vector of vectors)test('owned snapshot preserves fixed canonical bytes/hash: '+vector.id,()=>{const original=E.semantic.semanticFingerprint(vector.value),snapshot=own(vector.value);assert.equal(original,vector.sha256);assert.equal(E.semantic.semanticFingerprint(snapshot),original);});
test('owned snapshot rejects existing invalid intent inputs and never executes an accessor',()=>{
 let calls=0;const accessor={};Object.defineProperty(accessor,'field',{enumerable:true,get(){calls++;return 1;}});
 const cycle={};cycle.self=cycle;
 for(const value of [accessor,cycle,{x:undefined},[undefined],Array(1),{x:NaN},new Date(),new Map()])assert.throws(()=>own(value));
 assert.equal(calls,0);
});
function world(options={}){
 let content=F.content(E);content.settings={POISON_IN_FIELD:false,AFFECTION_EFFECTS:false};if(options.owned)content=own(content);
 let game=E.state.newGame({party:[],content}),app,writes=0,arrivals=0,release,entered=false;
 const here={hostOwner:{},generation:0,map:{},player:{},mapId:5,x:8,y:9};
 const gate=new Promise(resolve=>{release=resolve;});
 const host={current(){options.onCurrent?.(api);return {...here};},dispatchArrival(){arrivals++;return {status:'event-dispatched'};},present(request){entered=true;return gate.then(()=>({id:request.effect.id,status:'completed'}));},openRepelSelection(){throw Error('no selection');}};
 app=new E.app.GameApplication({state:{read(){return game;},replace(next){writes++;game=next;}},content(){options.onContent?.(api);return {content};},completedSteps:host,sessions:{create(){throw Error('no battle');}},projection:{project(){}}});
 const api={app,here,state:()=>game,content:()=>content,replace:c=>{content=c;},writes:()=>writes,arrivals:()=>arrivals,release,entered:()=>entered,step:id=>({...here,id,regionId:0,terrainTag:0,ice:false,sceneActive:true}),expire(){game.world.repelSteps=1;}};return api;
}
test('owned normal completion commits/arrives once; duplicate and stale positions retain original protection',async()=>{
 const w=world({owned:true}),step=w.step('one'),pending=w.app.completeWorldStep(step);assert.strictEqual(w.app.completeWorldStep(step),pending);const result=await pending;assert.equal(result.status,'completed');assert.equal(w.writes(),1);assert.equal(w.arrivals(),1);assert.equal((await w.app.completeWorldStep(step)).status,'duplicate');assert.equal(w.writes(),1);
 const next=w.step('two');const p=w.app.completeWorldStep(next);w.here.x++;assert.equal((await p).status,'failed');assert.equal(w.writes(),1);assert.equal(w.app.saveBlocked,false);
});
for(const kind of ['mutable-in-place','owned-replacement','state-in-place','generation'])test('pending completion still refuses '+kind+' after real presentation wait',async()=>{
 const w=world({owned:kind!=='mutable-in-place'});w.expire();const p=w.app.completeWorldStep(w.step(kind));await flush();assert(w.entered());assert.equal(w.writes(),1);assert.equal(w.app.saveBlocked,true);
 if(kind==='mutable-in-place')w.content().settings.POISON_IN_FIELD=true;
 if(kind==='owned-replacement'){const next=structuredClone(w.content());next.settings.POISON_IN_FIELD=true;w.replace(own(next));}
 if(kind==='state-in-place')w.state().money++;
 if(kind==='generation')w.app.stateReplacedByHost();
 w.release();assert(['failed','cancelled'].includes((await p).status));assert.equal(w.arrivals(),0);assert.equal(w.writes(),1);assert.equal(w.app.saveBlocked,false);
});
test('fresh replacement refreshes content; an in-flight mutable callback change still refuses',async()=>{
 let armed=false,changed=false;const w=world({owned:true,onCurrent(api){if(armed&&!changed){changed=true;const replacement=structuredClone(api.content());replacement.settings.POISON_IN_FIELD=true;api.replace(replacement);}}});
 await w.app.completeWorldStep(w.step('first'));armed=true;const result2=await w.app.completeWorldStep(w.step('second'));assert(changed);assert.equal(result2.status,'completed');assert.equal(w.writes(),2);assert.equal(w.content().settings.POISON_IN_FIELD,true);assert.equal(Object.isFrozen(w.content()),false);
 // Mutate from the post-observation content callback, after its initial identity was captured.
 let reads=0;const v=world({onContent(api){if(++reads===3)api.content().settings.POISON_IN_FIELD=true;}});const result=await v.app.completeWorldStep(v.step('reentrant'));assert.equal(result.status,'failed');assert.equal(v.writes(),0);assert.equal(v.arrivals(),0);
});
let companionModules;
async function companionSource(){
 require('../../../scripts/tests/ts-source-loader.cjs');
 const {pathToFileURL}=require('node:url');
 return companionModules??=Promise.all(['app/event-companion-operation.ts','rules/semantic.ts'].map(file=>import(pathToFileURL(path.join(process.env.PF_COMPANION_SOURCE_ROOT||ROOT,'src/framework',file)).href)));
}
for(const kind of ['owned-alias','mutable-in-place','owned-replacement','state-in-place','generation'])test('companion private expected Content retains '+kind+' protection across host wait',async()=>{
 const [{EventCompanionOperation},semantic]=await companionSource(),source=F.content(E),owner={};
 let content=kind==='mutable-in-place'?source:semantic.ownedImmutableSnapshot(source),game=E.state.newGame({party:[],content}),generation=0,writes=0,entered=false,release;
 const gate=new Promise(resolve=>{release=resolve;}),actual=()=>({owner,generation,game,content,action:{kind:'player-moved',player:{mapId:5,x:8,y:9,direction:6},instant:false},authorVisible:true,transferHidden:[]});
 const parent={observe:actual,commitCompanions(transform){const write=transform(actual());game=write.game;writes++;return actual();},release(){}};
 const host={source(){throw Error('empty chain');},trail:{},move(){throw Error('empty chain');},async project(){entered=true;await gate;}};
 const operation=new EventCompanionOperation(parent,host,{owner,generation}),pending=operation.run();await flush();assert(entered);assert.equal(writes,1);
 if(kind==='owned-alias')source.moves.Growl.pp++;
 if(kind==='mutable-in-place')content.moves.Growl.pp++;
 if(kind==='owned-replacement'){const next=structuredClone(content);next.moves.Growl.pp++;content=semantic.ownedImmutableSnapshot(next);}
 if(kind==='state-in-place')game.money++;
 if(kind==='generation')generation++;
 release();const result=await pending;assert.equal(result.status,kind==='owned-alias'?'completed':'failed');assert.equal(writes,kind==='owned-alias'?2:1);
 if(kind!=='owned-alias')assert.match(result.reason,/companion-(context-changed|owner-stale)/);
});
test('save/install validation reuses only private immutable Content directories, while checking current state each time',()=>{
 const source=F.content(E),content=own(source),game=E.state.newGame({party:[F.member()],content});assert.deepEqual(E.saveSchema.validateGameContent(game,content),[]);
 const original=Object.values,directories=[content.moves,content.abilities,content.species];let enumerations=0;
 Object.values=function(value){if(directories.includes(value))enumerations++;return Reflect.apply(original,this,[value]);};
 try{assert.deepEqual(E.saveSchema.validateGameContent(game,content),[]);game.party[0].moves[0].maxpp++;assert(E.saveSchema.validateGameContent(game,content).some(p=>p.path.endsWith('.maxpp')));}finally{Object.values=original;}
 assert.equal(enumerations,0);source.moves.Tackle.pp++;assert.notEqual(source.moves.Tackle.pp,content.moves.Tackle.pp);
});
test('mutable and replacement Content retain fresh PP directories at every save/install boundary',()=>{
 const content=F.content(E),game=E.state.newGame({party:[F.member()],content});assert.deepEqual(E.saveSchema.validateGameContent(game,content),[]);content.moves.Tackle.pp++;
 assert(E.saveSchema.validateGameContent(game,content).some(p=>p.path.endsWith('.maxpp')),'same mutable reference must rebuild');
 const original=own(F.content(E)),changed=structuredClone(original);changed.moves.Tackle.pp++;
 assert.deepEqual(E.saveSchema.validateGameContent(game,original),[]);assert(E.saveSchema.validateGameContent(game,own(changed)).some(p=>p.path.endsWith('.maxpp')),'new immutable root must build its own directory');
});
test('companion wait reuses only its frozen expected game; live mutable game checks remain at both guards',async()=>{
 const [{EventCompanionOperation},semantic]=await companionSource(),source=F.content(E),content=semantic.ownedImmutableSnapshot?.(source)??source,owner={};
 const game=E.state.newGame({party:[],content}),actual=()=>({owner,generation:0,game,content,action:{kind:'player-moved',player:{mapId:5,x:8,y:9,direction:6},instant:false},authorVisible:true,transferHidden:[]});
 let entered=false,release,detached=0,live=0,atFinal;
 const gate=new Promise(resolve=>{release=resolve;}),parent={observe:actual,commitCompanions(transform){const write=transform(actual());if(write.terminal)atFinal={detached,live};return actual();},release(){}};
 const host={source(){throw Error('empty');},trail:{},move(){throw Error('empty');},async project(){entered=true;await gate;}};
 const op=new EventCompanionOperation(parent,host,{owner,generation:0}),pending=op.run();await flush();assert(entered);assert.equal(Object.isFrozen(game),false);assert.equal(Object.isFrozen(game.storage.boxes[0].slots),false);
 const original=Object.getOwnPropertyDescriptors;Object.getOwnPropertyDescriptors=function(value){if(value&&typeof value==='object'&&Object.hasOwn(value,'storage')&&Object.hasOwn(value,'party')&&Object.hasOwn(value,'stats')){if(value===game)live++;else detached++;}return Reflect.apply(original,this,[value]);};
 try{release();assert.equal((await pending).status,'completed');}finally{Object.getOwnPropertyDescriptors=original;}
 assert.equal(atFinal.detached,0,'the private expected copy was already hashed before the wait');assert.equal(atFinal.live,2,'both original live-state checks must still perform canonical validation');
});
