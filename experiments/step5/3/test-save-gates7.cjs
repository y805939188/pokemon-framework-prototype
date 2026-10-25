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

function host() {
  const content = E.fixtures.content;
  let current = E.fixtures.makeGame();
  let saved = 0, made = 0, replacements = 0, unavailable = false, pending = false;
  function System() {}
  System.prototype.isSaveEnabled = () => true;
  const system = Object.assign(new System(), {_psGame: current});
  const context = {
    Error, Date, Promise, console: {error(){},warn(){}}, require: p => {assert.match(p,/engine\.cjs$/);return E;},
    Game_System: System, $gameSystem: system,
    DataManager: {extractSaveContents(){}, makeSaveContents(){made++;return {state:system._psGame};}, saveGame(){saved++;this.makeSaveContents();return Promise.resolve(0);}},
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
