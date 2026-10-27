'use strict';
// Built plugin in a VM: exact base-call boundaries. Actual MZ disk/restart evidence is separate.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const E = require(path.join(ROOT, 'js/engine/build/engine.cjs'));
const clone = x => JSON.parse(JSON.stringify(x));
let built, temporary;
test.before(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-save-gates7-'));
  const r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', temporary], {cwd: ROOT, env: {...process.env, RR_PLUGIN: 'PS_SaveState'}, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stdout+r.stderr);
  built = fs.readFileSync(path.join(temporary, 'PS_SaveState.js'), 'utf8');
});
test.after(() => { if (temporary) fs.rmSync(temporary, {recursive:true,force:true}); });

function host(content = E.fixtures.content) {
  let current = E.fixtures.makeGame();
  let saved = 0, made = 0, replacements = 0, unavailable = false, pending = false;
  function System() {}
  System.prototype.isSaveEnabled = () => true;
  const system = Object.assign(new System(), {_psGame: current});
  const context = {
    Error, Date, Promise, console: {error(){},warn(){}}, require: p => {assert.match(p,/production\.cjs$/);return require(path.join(ROOT, 'js/engine/build/production.cjs'));},
    Game_System: System, $gameSystem: system,
    DataManager: {extractSaveContents(){}, makeSaveContents(){made++;return {system};}, saveGame(){saved++;this.makeSaveContents();return Promise.resolve(0);}},
    PSFlow: {running:false, operationPending:()=>pending, content(){if(unavailable)throw Error('injected unavailable content');return content;},speciesKeyResolver:()=>E.speciesKey.speciesKeyResolver(content),stateReplaced(){replacements++;}},
  };
  context.window=context;
  vm.createContext(context);vm.runInContext(built,context,{filename:'PS_SaveState.js'});
  return {context,system,content,counts:()=>({saved,made,replacements}),unavailable:()=>{unavailable=true;},pending:()=>{pending=true;}};
}

test('legal schema7 saves through both checks; new metadata never enters frozen projection',async()=>{
  const h=host(),m=h.system._psGame.party[0];
  m.readyToEvolve=true;m.evolutionReadiness='unknown';m.cannotTrade=true;
  m.firstMoves=['tackle','gust','tackle','roost','rest','tackle'];
  await h.context.DataManager.saveGame(3);
  assert.deepEqual(h.counts(),{saved:1,made:1,replacements:0});
  const raw=E.state.protocolMember(m);
  for(const k of ['readyToEvolve','evolutionReadiness','cannotTrade','firstMoves']) assert.equal(Object.hasOwn(raw,k),false);
});
for(const [name,damage] of [
  ['false/unknown R',g=>{g.party[0].readyToEvolve=false;g.party[0].evolutionReadiness='unknown';}],
  ['missing required member field',g=>{delete g.party[0].cannotTrade;}],
  ['unmapped species',g=>{g.party[0].species='missing-from-content';}],
  ['unmapped learned move',g=>{g.party[0].firstMoves.push('missing-move');}],
  ['layout mismatch',g=>{g.dex.layoutIdentity='0'.repeat(64);}],
  ['own required property omitted by JSON',g=>{Object.defineProperty(g.party[0],'cannotTrade',{value:true,enumerable:false,configurable:true});}],
  ['null-root prototype spoof with inherited required field',g=>{const p=Object.assign(Object.create(null),{constructor:Object,cannotTrade:true});delete g.party[0].cannotTrade;Object.setPrototypeOf(g.party[0],p);}],
]) test(`loaded legal7 damaged at runtime (${name}) rejects all entry points before base calls`,async()=>{
  const h=host();h.context.DataManager.extractSaveContents({});assert.equal(h.system._psSaveError,undefined);
  const good=clone(h.system._psGame);damage(h.system._psGame);const before=JSON.stringify(h.system._psGame);
  assert.equal(h.system.isSaveEnabled(),false);
  await assert.rejects(h.context.DataManager.saveGame(4));
  await assert.rejects(h.context.DataManager.saveGame(0));
  assert.throws(()=>h.context.DataManager.makeSaveContents());
  assert.deepEqual(h.counts(),{saved:0,made:0,replacements:1});
  assert.equal(JSON.stringify(h.system._psGame),before,'no implicit repair or migration');
  assert.equal(h.context.PSState.lastSaveError.code,'state-invalid');
  h.system._psGame=good;await h.context.DataManager.saveGame(4);assert.equal(h.counts().saved,1);assert.equal(h.counts().made,1);assert.equal(h.context.PSState.lastSaveError,null);
});
test('content unavailable and active operation refuse before base save and make',async()=>{
  for(const mode of ['unavailable','pending']){
    const h=host();h[mode]();await assert.rejects(h.context.DataManager.saveGame(1));assert.throws(()=>h.context.DataManager.makeSaveContents());
    assert.equal(h.counts().saved,0);assert.equal(h.counts().made,0);
  }
});
test('empty legacy host gets validated current content layout; failure keeps raw object',()=>{
  const h=host();delete h.system._psGame;h.context.DataManager.extractSaveContents({});
  assert.equal(h.system._psGame.schema,7);assert.equal(h.system._psGame.dex.layoutIdentity,h.content.regionalDex.layoutIdentity);
  assert.equal(h.system._psSaveInfo.created,'empty');
  const bad=host();const raw=bad.system._psGame;bad.unavailable();bad.context.DataManager.extractSaveContents({});
  assert.equal(bad.system._psGame,raw);assert.equal(bad.system._psSaveError.code,'needs-content');
});
test('SaveStore rejects damaged current layout before opening a temp file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-save-store7-'));const file=path.join(dir,'save.json');
  try {
    const good=E.fixtures.makeGame(),content=E.fixtures.content,store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,content);
    store.save(good);const bytes=fs.readFileSync(file),bad=clone(good);bad.dex.layoutIdentity='0'.repeat(64);
    assert.throws(()=>store.save(bad));assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.existsSync(file+'.tmp'),false);
    const spoof=clone(good);delete spoof.party[0].cannotTrade;Object.setPrototypeOf(spoof.party[0],Object.assign(Object.create(null),{constructor:Object,cannotTrade:true}));
    assert.throws(()=>store.save(spoof));assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.existsSync(file+'.tmp'),false);
    const hidden=clone(good);Object.defineProperty(hidden.party[0],'cannotTrade',{value:true,enumerable:false});
    assert.throws(()=>store.save(hidden));assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.existsSync(file+'.tmp'),false);
    const noContent=new E.store.SaveStore(file);assert.throws(()=>noContent.save(good),/needs-content/);assert.deepEqual(fs.readFileSync(file),bytes);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('plain state crosses VM realms while custom inherited records remain invalid',()=>{
  const raw=E.fixtures.makeGame();
  const foreign=vm.runInNewContext('JSON.parse(text)',{text:JSON.stringify(raw)});
  assert.deepEqual(E.saveSchema.validateGameContent(foreign,E.fixtures.content),[]);
  const inherited=Object.assign(Object.create({unexpected:true}),raw);
  assert.match(E.saveSchema.validateGame(inherited)[0].message,/plain-data/);
  const disguised=Object.assign(Object.create(Object.create(null)),raw);
  assert.match(E.saveSchema.validateGame(disguised)[0].message,/plain-data/);
});

test('save validation refuses accessors without reading them, including schema itself',()=>{
  for(const field of ['schema','cannotTrade']){
    const g=E.fixtures.makeGame();let reads=0;const object=field==='schema'?g:g.party[0];
    Object.defineProperty(object,field,{enumerable:true,get(){reads++;return field==='schema'?7:true;}});
    assert.ok(E.saveSchema.validateGame(g).length);assert.equal(reads,0);
  }
});

for(const slots of [[],[null]])test(`author explicit natural slots ${JSON.stringify(slots)} can create, grant, save and reload legal no-ability member`,()=>{
  const read=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'content/sample',name+'.json'),'utf8'));
  const source={manifest:read('manifest'),sources:read('sources'),species:read('species'),overlays:read('overlays'),grants:[{id:'no-ability',members:[{species:'pidgey',level:5}],items:{},money:0,source:'author-placeholder'}]};
  const authored=source.species.find(sp=>sp.id==='pidgey');authored.abilities=slots;authored.hiddenAbilities=[];
  const compiled=E.contentCompile.compileContent(source);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
  const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);
  const content=assembled.content,state=E.fakes.createMemoryState(E.state.newGame({party:[],content}));
  const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),projection:E.fakes.createRecordingProjection(),content:()=>({content}),random:()=>0,clock:()=>0},{receivingProfile:{mode:1,naming:1}});
  assert.equal(app.claimGrant('no-ability').status,'applied');const game=state.current();assert.equal(game.party[0].ability,'');assert.equal(game.party[0].effectiveAbilityIndex,null);assert.deepEqual(E.saveSchema.validateGameContent(game,content),[]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-empty-ability7-'));try{const store=new E.store.SaveStore(path.join(dir,'save.json'),{},E.speciesKey.speciesKeyResolver(content),content);store.save(game);assert.deepEqual(store.load(),game);}finally{fs.rmSync(dir,{recursive:true,force:true});}
  const corrupt=clone(game);corrupt.party[0].ability='missing-named-ability';assert.ok(E.saveSchema.validateGameContent(corrupt,content).some(p=>p.path.endsWith('.ability')));
  const sp=content.species.Pidgey;sp.abilities=['Keen Eye'];const falseEmpty=clone(game);assert.ok(E.saveSchema.validateGameContent(falseEmpty,content).some(p=>p.path.endsWith('.ability')));
});

test('required fields inherited from a real foreign intrinsic are not persistent data',()=>{
  const own=E.fixtures.makeGame();const foreign=vm.runInNewContext(`const g=JSON.parse(text); delete g.party[0].cannotTrade; Object.defineProperty(Object.prototype,'cannotTrade',{value:true,configurable:true});g`,{text:JSON.stringify(own)});
  assert.ok(E.saveSchema.validateGameContent(foreign,E.fixtures.content).some(p=>p.path.endsWith('.cannotTrade')));
  const h=host();h.system._psGame=foreign;assert.throws(()=>h.context.DataManager.makeSaveContents());assert.equal(h.counts().made,0);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-inherited-required7-'));try{const file=path.join(dir,'save.json'),store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,E.fixtures.content);store.save(own);const before=fs.readFileSync(file);assert.throws(()=>store.save(foreign));assert.deepEqual(fs.readFileSync(file),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('claims require their own kind, not a foreign intrinsic fallback',()=>{
 const foreign=vm.runInNewContext(`const g=JSON.parse(text);g.claims.fake={payload:1};Object.defineProperty(Object.prototype,'kind',{value:'grant'});g`,{text:JSON.stringify(E.fixtures.makeGame())});
 assert.ok(E.saveSchema.validateGame(foreign).some(p=>p.path.includes('claims')));
});

// A JSON write must not accept elements hidden by caller-supplied array traversal.
const arrayBoundaryCases = [
 ['party.entries / missing second required field', 'entries', g=>{g.party=[g.party[0],{...clone(g.party[0]),id:'HiddenP2'}];delete g.party[1].cannotTrade;return g.party;}],
 ['party.map / unchecked member content', 'map', g=>{g.party[0].species='missing-species';return g.party;}],
 ['boxes.entries / unchecked last box', 'entries', g=>{const m=clone(g.party[0]);m.id='HiddenB2';delete m.cannotTrade;g.storage.boxes[39].slots[29]=m;return g.storage.boxes;}],
 ['slots.entries / unchecked last member', 'entries', g=>{const m=clone(g.party[0]);m.id='HiddenS2';delete m.cannotTrade;g.storage.boxes[39].slots[29]=m;return g.storage.boxes[39].slots;}],
 ['moves.entries / invalid PP Ups', 'entries', g=>{g.party[0].moves[0].ppUps=4;return g.party[0].moves;}],
 ['firstMoves.entries / unmapped record', 'entries', g=>{g.party[0].firstMoves=['missing-move'];return g.party[0].firstMoves;}],
 ['pockets.forEach / invalid slot quantity', 'forEach', g=>{g.inventory.pockets[0]=[{itemId:'potion',quantity:-1}];return g.inventory.pockets;}],
 ['pocket.entries / unmapped item', 'entries', g=>{g.inventory.pockets[0]=[{itemId:'missing-item',quantity:1}];return g.inventory.pockets[0];}],
 ['seen.some / invalid identity', 'some', g=>{g.dex.seen=['missing-species'];return g.dex.seen;}],
 ['seenForms.entries / invalid gender', 'entries', g=>{g.dex.seenForms.Pidgey=[{gender:9,shiny:false,form:0}];return g.dex.seenForms.Pidgey;}],
 ['unlocked.some / invalid boolean', 'some', g=>{g.dex.unlocked[0]='false';return g.dex.unlocked;}],
 ['view.indices.some / invalid cursor', 'some', g=>{g.dex.view.indices[0]=-1;return g.dex.view.indices;}],
 ['badges.some / invalid boolean', 'some', g=>{g.badges[0]='false';return g.badges;}],
 ['statistics.some / invalid counter', 'some', g=>{g.stats.gym_leader_attempts[0]=-1;return g.stats.gym_leader_attempts;}],
 ['statistics iterator / invalid badge time', Symbol.iterator, g=>{g.stats.times_to_get_badges=[-1];return g.stats.times_to_get_badges;}],
];
for(const [name,method,damage] of arrayBoundaryCases)test(`array boundary rejects ${name} before all save base calls`,async()=>{
 const h=host(),good=clone(h.system._psGame),list=damage(h.system._psGame);let calls=0;
 const hidden=method==='entries'||method===Symbol.iterator?function*(){calls++;}:method==='map'?function(){calls++;return [];}:method==='some'?function(){calls++;return false;}:function(){calls++;};
 Object.setPrototypeOf(list,Object.create(Array.prototype,{[method]:{value:hidden}}));
 const before=JSON.stringify(h.system._psGame);
 assert.ok(E.saveSchema.validateGameContent(h.system._psGame,h.content).length);
 assert.equal(h.system.isSaveEnabled(),false);
 for(const slot of [0,4])await assert.rejects(h.context.DataManager.saveGame(slot));
 assert.throws(()=>h.context.DataManager.makeSaveContents());
 assert.equal(h.counts().saved,0);assert.equal(h.counts().made,0);assert.equal(calls,0,'untrusted traversal never executes');
 assert.equal(JSON.stringify(h.system._psGame),before,'no normalization or partial repair');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-array-boundary7-'));
 try{const file=path.join(dir,'save.json'),store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,h.content);store.save(good);const bytes=fs.readFileSync(file);assert.throws(()=>store.save(h.system._psGame));assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.existsSync(file+'.tmp'),false);assert.deepEqual(store.load(),good);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 h.system._psGame=good;await h.context.DataManager.saveGame(4);assert.equal(h.counts().saved,1);
});

test('native cross-realm arrays remain valid; overwritten foreign intrinsic traversals cannot hide invalid members',()=>{
 const good=E.fixtures.makeGame(),text=JSON.stringify(good);
 for(const method of ['entries','map','some','forEach','iterator']){
  const foreign=vm.runInNewContext(`const g=JSON.parse(text);const key=method==='iterator'?Symbol.iterator:method;let calls=0;Object.defineProperty(Array.prototype,key,{value:method==='entries'||method==='iterator'?function*(){calls++;}:method==='map'?function(){calls++;return [];}:method==='some'?function(){calls++;return false;}:function(){calls++;},configurable:true});delete g.party[0].cannotTrade;({g,calls:()=>calls})`,{text,method});
  assert.ok(E.saveSchema.validateGameContent(foreign.g,E.fixtures.content).length,method);assert.equal(foreign.calls(),0,method);
 }
 const foreign=vm.runInNewContext('JSON.parse(text)',{text});Object.freeze(foreign.party);
 assert.deepEqual(E.saveSchema.validateGameContent(foreign,E.fixtures.content),[]);
 const noPrototype=clone(good);Object.setPrototypeOf(noPrototype.party,null);
 assert.ok(E.saveSchema.validateGame(noPrototype).length);
});

for(const kind of ['array','record','accessor'])test(`inherited ${kind} JSON hook cannot overwrite a readable save`,()=>{
 const good=E.fixtures.makeGame();
 const foreign=vm.runInNewContext(`const g=JSON.parse(text);let calls=0;const p=kind==='array'?Array.prototype:Object.prototype;Object.defineProperty(p,'toJSON',kind==='accessor'?{get(){calls++;return undefined;},configurable:true}:{value:function(){calls++;return this===g.party||this===g?[null]:this;},configurable:true});({g,calls:()=>calls})`,{text:JSON.stringify(good),kind});
 assert.ok(E.saveSchema.validateGameContent(foreign.g,E.fixtures.content).length);assert.equal(foreign.calls(),0);
 const h=host();h.system._psGame=foreign.g;assert.throws(()=>h.context.DataManager.makeSaveContents());assert.equal(h.counts().made,0);assert.equal(foreign.calls(),0);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-array-hook7-'));
 try{const file=path.join(dir,'save.json'),store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,E.fixtures.content);store.save(good);const bytes=fs.readFileSync(file);assert.throws(()=>store.save(foreign.g));assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.existsSync(file+'.tmp'),false);assert.deepEqual(store.load(),good);assert.equal(foreign.calls(),0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('non-callable inherited toJSON data is inert and remains readable',()=>{
 const text=JSON.stringify(E.fixtures.makeGame()),foreign=vm.runInNewContext(`Object.defineProperty(Object.prototype,'toJSON',{value:0,configurable:true});JSON.parse(text)`,{text});
 assert.deepEqual(E.saveSchema.validateGameContent(foreign,E.fixtures.content),[]);
 assert.deepEqual(E.saveSchema.validateGameContent(JSON.parse(JSON.stringify(foreign)),E.fixtures.content),[]);
});

for(const method of ['next','iterator'])test(`foreign native array Iterator.${method} cannot hide stored members`,()=>{
 const good=E.fixtures.makeGame();
 const foreign=vm.runInNewContext(`const g=JSON.parse(text);delete g.party[1].cannotTrade;let calls=0;const p=Object.getPrototypeOf(g.party.entries()),next=p.next;if(method==='next')Object.defineProperty(p,'next',{value:function(){calls++;const v=Reflect.apply(next,this,[]);return !v.done&&Array.isArray(v.value)&&v.value[0]===1?{done:true}:v;},configurable:true});else Object.defineProperty(p,Symbol.iterator,{value:function*(){calls++;},configurable:true});({g,calls:()=>calls})`,{text:JSON.stringify(good),method});
 assert.ok(E.saveSchema.validateGameContent(foreign.g,E.fixtures.content).some(p=>p.path==='$.party[1].cannotTrade'));
 assert.equal(foreign.calls(),0,'validation never executes a foreign iterator');
 const h=host();h.system._psGame=foreign.g;assert.throws(()=>h.context.DataManager.makeSaveContents());assert.equal(h.counts().made,0);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-array-iterator7-'));try{const file=path.join(dir,'save.json'),store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,E.fixtures.content);store.save(good);const bytes=fs.readFileSync(file);assert.throws(()=>store.save(foreign.g));assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.existsSync(file+'.tmp'),false);assert.equal(foreign.calls(),0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('validation view preserves invalid primitives instead of repairing them with JSON conversion',()=>{
 for(const damage of [g=>{g.party[0].origin.map=NaN;},g=>{g.storage.boxes[0].slots[0]=undefined;},g=>{g.money=Infinity;}]){const g=E.fixtures.makeGame();damage(g);assert.ok(E.saveSchema.validateGameContent(g,E.fixtures.content).length);}
});

function actualMZJsonEx(){
 const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');
 const start=core.indexOf('function JsonEx()'),end=core.indexOf('//-----------------------------------------------------------------------------',core.indexOf('JsonEx._decode = function'));
 assert.ok(start>=0&&end>start,'pinned actual MZ serializer source is installed');
 return vm.runInNewContext(core.slice(start,end)+'\nJsonEx',{window:{}});
}
test('optional inherited fields remain rejected in the own-data view without calling their getters',()=>{
 for(const key of ['nickname','statusCount']){
  const f=vm.runInNewContext(`const g=JSON.parse(text);delete g.party[0][key];let calls=0;Object.defineProperty(Object.prototype,key,{get(){calls++;return key==='nickname'?'Inherited':1;},configurable:true});({g,calls:()=>calls})`,{text:JSON.stringify(E.fixtures.makeGame()),key});
  assert.ok(E.saveSchema.validateGameContent(f.g,E.fixtures.content).some(p=>p.path===`$.party[0].${key}`));assert.equal(f.calls(),0);
 }
});
test('both writers use an owned verified snapshot, including actual MZ serializer hook behavior',()=>{
 for(const hook of ['tag','constructor-name']){
  const h=host(),good=clone(h.system._psGame);
  if(hook==='constructor-name')Object.defineProperty(good.appliedBattles,'constructor',{value:{hash:'0'.repeat(64)},enumerable:true,writable:true,configurable:true});
  const f=vm.runInNewContext(`const g=JSON.parse(text);let calls=0;if(hook==='tag')Object.defineProperty(Array.prototype,Symbol.toStringTag,{get(){calls++;if(this===g.party)delete g.party[1].cannotTrade;return 'Array'},configurable:true});else Object.defineProperty(Object.prototype,'name',{get(){calls++;delete g.party[1].cannotTrade;return 'Bad'},configurable:true});({g,calls:()=>calls})`,{text:JSON.stringify(good),hook});
  h.system._psGame=f.g;const contents=h.context.DataManager.makeSaveContents();
  assert.notEqual(contents.system,h.system);assert.equal(Object.getPrototypeOf(contents.system),Object.getPrototypeOf(h.system));assert.notEqual(contents.system._psGame,f.g);
  const encoded=actualMZJsonEx().stringify(contents),parsed=storedFramework(actualMZJsonEx().parse(encoded).system._psGame);
  assert.deepEqual(parsed,good);assert.equal(f.calls(),0);assert.equal(Object.hasOwn(f.g.party[1],'cannotTrade'),true);assert.equal(Object.hasOwn(h.system,'@'),false);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-owned-snapshot7-'));
  try{const store=new E.store.SaveStore(path.join(dir,'save.json'),{},E.speciesKey.identityKeys,h.content);store.save(f.g);assert.deepEqual(store.load(),good);assert.equal(f.calls(),0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
});
test('snapshot is detached, preserves legal dictionary keys and rejects extra ledger data before encoding',()=>{
 const h=host(),raw=h.system._psGame;
 Object.defineProperty(raw.appliedBattles,'constructor',{value:{hash:'0'.repeat(64)},enumerable:true});
 Object.defineProperty(raw.appliedBattles,'__proto__',{value:{hash:'1'.repeat(64)},enumerable:true});
 const expected=clone(raw),contents=h.context.DataManager.makeSaveContents();raw.party[0].cannotTrade=true;
 assert.deepEqual(storedFramework(actualMZJsonEx().parse(actualMZJsonEx().stringify(contents)).system._psGame),expected,'the exact verified values are owned by the pending contents');
 assert.equal(raw.party[0].cannotTrade,true);assert.equal(Object.hasOwn(raw.appliedBattles,'@'),false);
 const bad=clone(expected);bad.appliedBattles.constructor.name='Bad';assert.ok(E.saveSchema.validateGameContent(bad,h.content).some(p=>p.path.endsWith('.name')));
});
test('SaveStore never reads raw schema accessors before its shared gate',()=>{
 const g=E.fixtures.makeGame();let calls=0;Object.defineProperty(g,'schema',{get(){calls++;return 7;},enumerable:true});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-schema-accessor7-'));
 try{const file=path.join(dir,'save.json'),store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,E.fixtures.content);assert.throws(()=>store.save(g));assert.equal(calls,0);assert.equal(fs.existsSync(file),false);assert.equal(fs.existsSync(file+'.tmp'),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('fake intrinsic constructor metadata is rejected without executing a prototype getter',()=>{
 const g=E.fixtures.makeGame();let calls=0;const ctor=()=>{};Object.defineProperty(ctor,'prototype',{get(){calls++;return proto;}});const proto=Object.assign(Object.create(null),{constructor:ctor});Object.setPrototypeOf(g.party[0],proto);assert.ok(E.saveSchema.validateGame(g).length);assert.equal(calls,0);
});


// Only the MZ wire envelope changes; the decoded owned game and SaveStore keep schema7.
function storedFramework(raw) {
 assert.equal(raw.encoding,'pokemon-framework-json');assert.equal(raw.version,1);
 assert.deepEqual(Object.keys(raw).sort(),['data','encoding','version']);
 return JSON.parse(raw.data);
}
function battleResult(id,money=0) {
 return {protocol:1,battleId:id,outcome:{kind:'run',winner:null},members:{},bag:{},captured:[],dex:{seen:[],owned:[]},money};
}
for(const ids of [['normal'],['@'],['constructor'],['constructor','@'],['@','constructor']])test(`actual JsonEx full round trip retains legal battle IDs ${ids.join(' then ')} and replay`,()=>{
 const h=host();let g=h.system._psGame;
 const results=ids.map(id=>battleResult(id,id==='@'?7:0));
 for(const result of results){const applied=E.state.applyBattleResult(g,result,undefined,undefined,{content:h.content});assert.equal(applied.status,'applied');g=applied.state;}
 const expected=clone(g);h.system._psGame=g;
 const J=actualMZJsonEx(),pending=h.context.DataManager.makeSaveContents(),text=J.stringify(pending),contents=J.parse(text);
 assert.deepEqual(storedFramework(contents.system._psGame),expected);
 assert.deepEqual(g,expected,'encoding leaves the live state unchanged');
 h.system._psGame=contents.system._psGame;h.context.DataManager.extractSaveContents(contents);
 assert.equal(h.system._psSaveError,undefined);assert.deepEqual(h.system._psGame,expected);
 for(const result of results){const again=E.state.applyBattleResult(h.system._psGame,result,undefined,undefined,{content:h.content});assert.equal(again.status,'already-applied');assert.deepEqual(again.state,expected);}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-jsonex-ledger7-'));
 try{const store=new E.store.SaveStore(path.join(dir,'save.json'),{},E.speciesKey.identityKeys,h.content);store.save(g);assert.deepEqual(store.load(),expected);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'save.json'),'utf8')),expected);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('legal reserved and punctuation grant IDs and ledger IDs survive JsonEx without a second reward',()=>{
 const ids=['constructor','__proto__','toJSON','#.:_-'];
 const content={...E.fixtures.content,grants:Object.fromEntries(ids.map(id=>[id,{members:[],items:{},money:3}]))},h=host(content);
 let g=h.system._psGame;
 for(const id of ids){const grant=E.grants.applyGrant(g,id,content,()=>0);assert.equal(grant.status,'applied');g=grant.state;const battle=E.state.applyBattleResult(g,battleResult(id,7),undefined,undefined,{content});assert.equal(battle.status,'applied');g=battle.state;}
 const expected=clone(g);assert.deepEqual(E.saveSchema.validateGameContent(g,content),[]);h.system._psGame=g;
 const J=actualMZJsonEx(),contents=J.parse(J.stringify(h.context.DataManager.makeSaveContents()));
 h.system._psGame=contents.system._psGame;h.context.DataManager.extractSaveContents(contents);assert.equal(h.system._psSaveError,undefined);assert.deepEqual(h.system._psGame,expected);
 for(const id of ids){const again=E.grants.applyGrant(h.system._psGame,id,content,()=>0);assert.equal(again.status,'already-claimed');assert.deepEqual(again.state,expected);const replay=E.state.applyBattleResult(h.system._psGame,battleResult(id,7),undefined,undefined,{content});assert.equal(replay.status,'already-applied');assert.deepEqual(replay.state,expected);}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-jsonex-claims7-'));
 try{const store=new E.store.SaveStore(path.join(dir,'save.json'),{},E.speciesKey.identityKeys,content);store.save(g);assert.deepEqual(store.load(),expected);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
for(const [name,raw] of [
 ['unknown encoding version',{encoding:'pokemon-framework-json',version:2,data:'{}'}],
 ['non-string encoding data',{encoding:'pokemon-framework-json',version:1,data:{schema:7}}],
 ['truncated encoding data',{encoding:'pokemon-framework-json',version:1,data:'{'}],
 ['extra encoding field',{encoding:'pokemon-framework-json',version:1,data:'{}',extra:true}],
 ['invalid decoded state',{encoding:'pokemon-framework-json',version:1,data:'{"schema":7}'}],
])test(`unreadable host envelope (${name}) retains raw document and blocks every writer`,async()=>{
 const h=host();h.system._psGame=raw;const before=JSON.stringify(raw);h.context.DataManager.extractSaveContents({});
 assert.equal(h.system._psGame,raw);assert.equal(JSON.stringify(raw),before);assert.ok(h.system._psSaveError);assert.equal(h.system.isSaveEnabled(),false);
 await assert.rejects(h.context.DataManager.saveGame(54));assert.throws(()=>h.context.DataManager.makeSaveContents());assert.equal(h.counts().saved,0);assert.equal(h.counts().made,0);
});
