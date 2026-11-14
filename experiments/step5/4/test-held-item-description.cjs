'use strict';
// Exact presentation semantics over pinned protocol forms and real Gen8 producers; no reference replay.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),F=require('./trainer-ai-integration/fixtures.cjs'),H=require('./e2-status-feedback-scene-host.cjs');
const event=(type,args)=>Object.freeze({type,args:Object.freeze(args),raw:'|'+type+'|'+args.join('|')});
const cases=[
 ['-enditem',['p1a: A','Sitrus Berry','[eat]'],"Alpha ate its Sitrus Berry!",'Alpha吃掉了Sitrus Berry！'],
 ['-item',['p2a: B','Leftovers','[from] ability: Frisk','[of] p1a: A'],"Frisk revealed that The foe's Beta is holding Leftovers!",'察觉发现对手的Beta携带着Leftovers！'],
 ['-item',['p1a: A','Air Balloon'],"Alpha floats in the air with its Air Balloon!",'Alpha靠着Air Balloon浮在空中！'],
 ['-enditem',['p1a: A','Air Balloon'],"Alpha's Air Balloon popped!",'Alpha的Air Balloon破掉了！'],
 ['-item',['p1a: A','Air Balloon','[from] move: Trick'],"Alpha obtained Air Balloon!",'Alpha获得了Air Balloon！'],
 ['-enditem',['p1a: A','Air Balloon','[from] move: Knock Off'],"Alpha's Air Balloon was knocked off!",'Alpha的Air Balloon被打落了！'],
];
for(const [language,index]of [['en',2],['zh',3]])for(const row of cases)test(`${language} exact semantic feedback ${row[0]} ${row[1].join('|')}`,()=>{
 const tr=E.i18n.translatorFor(language),d=E.describe.make({A:'Alpha',B:'Beta'},tr),e=event(row[0],row[1]),before=JSON.stringify(e);assert.deepEqual(d.event(e),[row[index]]);assert.deepEqual(d.message({kind:'events',seq:1,events:[e]}),[row[index]]);assert.equal(JSON.stringify(e),before);assert.deepEqual(tr.diagnostics(),{missingKeys:[],missingParams:[]});
 assert.deepEqual(d.event(event(row[0],[...row[1],'[silent]'])),[],'silent removal/revelation never becomes a public sentence');
});
async function gateway(left,right){const g=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'Player',team:[{name:'A',level:50,...left}]},{name:'Foe',team:[{name:'B',level:50,...right}]}]});assert(await g.choose('p1','team 1'));assert(await g.choose('p2','team 1'));return g;}
const events=g=>g.drain().flatMap(m=>m.kind==='events'?m.events:[]);
test('actual Frisk reveals an unchanged held item instead of acquiring it',async()=>{
 const g=await gateway({species:'Banette',ability:'Frisk',moves:['splash']},{species:'Snorlax',ability:'Immunity',moves:['splash'],item:'Leftovers'}),ev=events(g),frisk=ev.find(e=>e.type==='-item'&&e.args.includes('[from] ability: Frisk'));assert(frisk,'native Frisk producer');assert.equal(g._debugBattle().sides[1].active[0].item,'leftovers');assert.deepEqual(E.describe.make({A:'Alpha',B:'Beta'}).event(frisk),["Frisk revealed that The foe's Beta is holding Leftovers!"]);
});
test('actual Air Balloon opening and damage producers describe floating then popping',async()=>{
 const g=await gateway({species:'Snorlax',ability:'Immunity',moves:['splash'],item:'Air Balloon'},{species:'Snorlax',ability:'Immunity',moves:['tackle']}),d=E.describe.make({A:'Alpha',B:'Beta'}),opening=events(g).find(e=>e.type==='-item'&&e.args[1]==='Air Balloon');assert(opening);assert.deepEqual(d.event(opening),['Alpha floats in the air with its Air Balloon!']);assert(await g.choose('p1','move 1'));assert(await g.choose('p2','move 1'));const pop=events(g).find(e=>e.type==='-enditem'&&e.args[1]==='Air Balloon');assert(pop);assert.equal(g._debugBattle().sides[0].active[0].item,'');assert.deepEqual(d.event(pop),["Alpha's Air Balloon popped!"]);
});
test('actual Sitrus consumption says ate and leaves its healing event intact',async()=>{
 const g=await gateway({species:'Snorlax',ability:'Immunity',moves:['splash'],item:'Sitrus Berry'},{species:'Snorlax',ability:'Immunity',moves:['splash']});events(g);g.seedState('p1',[{id:'A',hp:1}]);const before=g.readState('p1')[0].hp;assert(await g.choose('p1','move 1'));assert(await g.choose('p2','move 1'));const es=events(g),eat=es.find(e=>e.type==='-enditem'&&e.args.includes('[eat]'));assert(eat);assert(es.some(e=>e.type==='-heal'));assert(g.readState('p1')[0].hp>before);assert.equal(g._debugBattle().sides[0].active[0].item,'');assert.deepEqual(E.describe.make({A:'Alpha'}).event(eat),['Alpha ate its Sitrus Berry!']);
});
test('real Full Restore status-only use omits zero recovery; positive recovery remains exact',async()=>{
 for(const hp of [400,390]){const w=await F.fixture({party:1,moves:['splash']}),p=w.session.gw._debugBattle().sides[0].active[0];p.maxhp=400;p.hp=hp;p.setStatus('par');w.session.bag.fullrestore=1;const r=await w.session.useItem('fullrestore',p.name);assert(r.ok);assert.equal(p.hp,400);assert.equal(p.status,'');assert.equal(w.session.bag.fullrestore,0);const d=E.describe.make({[p.name]:'Alpha'},undefined,{item:id=>id==='fullrestore'?'Full Restore':undefined}),es=r.messages.flatMap(m=>m.kind==='events'?m.events:[]),item=es.find(e=>e.type==='rpg'&&e.args[0]==='item');assert.deepEqual(d.event(item),[hp===400?'Used Full Restore on Alpha.':'Used Full Restore on Alpha. Recovered 10 HP.']);assert(!d.message({kind:'events',seq:1,events:es}).some(line=>line.includes('Recovered 0')));}
});
test('item display lookup honors authored names and retains unknown native fallbacks',()=>{
 const d=E.describe.make({A:'Alpha'},undefined,{item:id=>id==='potion'?'Workshop Tonic':id==='fullrestore'?'Full Restore':undefined});assert.deepEqual(d.event(event('rpg',['item','p1','potion','A','ok','20'])),['Used Workshop Tonic on Alpha. Recovered 20 HP.']);assert.deepEqual(d.event(event('-item',['p1a: A','Unknown Token','[from] move: Trick'])),['Alpha obtained Unknown Token!']);
});
test('legal nonconsumable battle healing compiles without an obsolete unsupported diagnostic',()=>{
 const input=F.inputs(),item=input.items.find(i=>i.id==='superpotion');item.consumable=false;item.effect={family:'hp',parameters:{amount:80}};const r=E.contentCompile.compileContent(input);assert(r.ok);assert(!r.warnings.some(w=>w.message.startsWith('nonconsumable-battle-healing-unsupported:')));assert.equal(r.data.items.find(i=>i.id==='superpotion').consumable,false);item.battleUse='none';const fieldOnly=E.contentCompile.compileContent(input);assert(fieldOnly.ok);assert(!fieldOnly.warnings.some(w=>w.message.startsWith('nonconsumable-battle-healing-unsupported:')));
});
test.before(H.prepare);test.after(H.cleanup);
for(const lang of ['en','zh'])test(`${lang} actual Scene resolves authored names, name keys and canonical medicine labels`,async()=>{
 const items=Object.values(E.itemCatalog.legacyCatalog()).map(item=>({...item,source:'author-placeholder'})),hyper=items.find(i=>i.id==='hyperpotion');hyper.name='Workshop Tonic';hyper.nameKey=lang==='zh'?'item.name.potion':'author.missing.item.translation';const h=await H.open({id:'ITEM-NAMES-'+lang,lang,items,player:{species:'snorlax',level:50,moves:['splash']},foe:{species:'shuckle',level:50,moves:['splash']}});try{
  const d=h.s._D,rpg=id=>event('rpg',['item','p1',id,'SCENE-P1','ok','0']),tr=h.flow.translator();assert.deepEqual(d.event(rpg('hyperpotion')),[lang==='en'?'Used Workshop Tonic on Snorlax.':'对Snorlax使用了'+tr.t('item.name.potion')+'。']);const full=d.event(rpg('fullrestore'))[0];assert(full.includes('Full Restore'));assert(!full.includes('Fullrestore'));assert(!full.includes('0 HP'));assert(!full.includes('0点'));H.unchanged(h);
 }finally{h.cleanup();}
});
