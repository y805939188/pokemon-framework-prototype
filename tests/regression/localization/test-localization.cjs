'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {navigationHost}=require('../interface/navigation-host.cjs');
const {choicesHost}=require('../messages/choices-host.cjs');
const {textHost}=require('../messages/text-host.cjs');
const {host:messageHost}=require('../messages/message-host.cjs');
const {languageFlow,calls,ROOT,E}=require('./localization-host.cjs');
const vm=require('node:vm');
const end={code:0,indent:0,parameters:[]};
const expected=(lang,key,p)=>E.i18n.translatorFor(lang).t(key,p);
const readOnly=(h,before)=>{assert.equal(JSON.stringify(h.x.state.current()),before);assert.deepEqual(h.writes,[]);};
test('shipped configuration selects Chinese; existing override, unknown-language and null reset semantics remain',()=>{
 const h=navigationHost(),f=languageFlow(h),before=JSON.stringify(h.x.state.current());
 assert.equal(f.translator().lang,'zh');assert.equal(h.openMenu()._commandWindow._list.find(r=>r.symbol==='options').name,'选项');f.setLanguage('en');assert.equal(f.translator().lang,'en');f.setLanguage('unknown');assert.equal(f.translator().lang,'en');f.setLanguage(null);assert.equal(f.translator().lang,'zh');readOnly(h,before);
});
for(const lang of ['zh','en'])test(lang+' real pause, PC and storage consumers resolve framework labels with no missing diagnostics',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage(lang);const before=JSON.stringify(h.x.state.current());
 const menu=h.openMenu();assert.equal(menu._commandWindow._list.find(r=>r.symbol==='options').name,expected(lang,'navigation.pause.options'));
 assert.equal(menu._commandWindow._list.find(r=>r.symbol==='psParty').name,expected(lang,'ui.menu.party_view'));
 h.press('cancel');assert(h.G.PSNavigation.openPC());h.transition();h.ready();assert.equal(h.scene()._commands._list[0].name,expected(lang,'navigation.pc.storage'));
 h.choose('storage');h.ready();const ui=h.G.PSManagement.current();assert.equal(ui.view.items[0].label,expected(lang,'management.organize'));assert(!ui.text.some(s=>/\[missing:/.test(s)));
 h.press('cancel');h.transition();h.press('cancel');h.transition();assert.deepEqual(f.translator().diagnostics(),{missingKeys:[],missingParams:[]});readOnly(h,before);
});
test('existing language override refreshes an active pause menu while retaining selection and focus',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');const before=JSON.stringify(h.x.state.current()),s=h.openMenu(),w=s._commandWindow;
 w.selectSymbol('options');f.setLanguage('en');h.frame();assert.equal(w._list.find(r=>r.symbol==='options').name,'Options');assert.equal(w.currentSymbol(),'options');assert(w.active);
 f.setLanguage('zh');h.frame();assert.equal(w._list.find(r=>r.symbol==='options').name,'选项');assert.equal(h.scene(),s);readOnly(h,before);
});
test('active options labels, help and boolean values follow existing language override without changing settings',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');h.openMenu();h.choose('options');h.ready();const s=h.scene(),w=s._optionsWindow;
 w.selectSymbol('alwaysDash');const before=JSON.stringify(h.G.ConfigManager);f.setLanguage('en');const at=h.draws.length;h.frame();
 assert.equal(w._list.find(r=>r.symbol==='alwaysDash').name,'Always Dash');assert.equal(w.statusText(w.index()),'Off');assert(h.draws.slice(at).some(r=>r.text.includes('Run by default')));
 assert.equal(w.currentSymbol(),'alwaysDash');assert(w.active);assert.equal(JSON.stringify(h.G.ConfigManager),before);assert.deepEqual(h.writes,[]);
});
test('active ordinary PC redraws translated heading and commands without reopening or changing its selection',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');const before=JSON.stringify(h.x.state.current());h.G.PSNavigation.openPC();h.transition();h.ready();const s=h.scene();s._commands.selectSymbol('logoff');
 f.setLanguage('en');const at=h.draws.length;h.frame();assert.equal(s._commands._list[0].name,'Someone’s PC');assert(h.draws.slice(at).some(r=>r.text===expected('en','navigation.pc.boot',{name:h.x.state.current().player.name})));
 assert.equal(s._commands.currentSymbol(),'logoff');assert(s._commands.active);assert.equal(h.scene(),s);readOnly(h,before);
});
test('active trainer card refreshes labels from the original read-only view',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');const before=JSON.stringify(h.x.state.current());h.openMenu();h.choose('psTrainerCard');h.ready();const s=h.scene();
 f.setLanguage('en');const at=h.draws.length;h.frame();assert(h.draws.slice(at).some(r=>r.text==='Trainer Card'));assert(h.draws.slice(at).some(r=>r.text===h.x.state.current().player.name));assert.equal(h.scene(),s);readOnly(h,before);
});
test('active controls help changes language on the current page without resetting its transition',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');h.G.PluginManager.callCommand({},'PS_Management','ShowControls',{});h.transition();h.setTime(500);h.frame();h.setTime(1000);h.frame();const s=h.scene(),phase=s._phase,at=h.draws.length;
 f.setLanguage('en');h.frame();assert(h.draws.slice(at).some(r=>r.text==='Controls — 1 / 4'));assert.equal(s._page,1);assert.equal(s._phase,phase);assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])test(lang+' management party and summary consume catalog names instead of held-item and ball IDs',()=>{
 const h=navigationHost({edit(g){g.party[0].item='potion';g.party[0].ball='pokeball';}}),f=languageFlow(h);f.setLanguage(lang);const before=JSON.stringify(h.x.state.current());h.openMenu();h.choose('psParty');h.ready();
 assert(h.G.PSManagement.current().text.includes('◆ '+expected(lang,'item.name.potion')));assert(!h.G.PSManagement.current().text.includes('◆ potion'));
 h.press('ok');h.managementChoose('summary');h.ready();const text=h.G.PSManagement.current().text;
 assert(text.some(row=>row.endsWith(': '+expected(lang,'item.name.potion'))));assert(text.some(row=>row.endsWith(': '+expected(lang,'item.name.pokeball'))));assert(!text.some(row=>/: (potion|pokeball)$/.test(row)));readOnly(h,before);
});
for(const lang of ['zh','en'])test(lang+' catalog author name fallback and explicit empty translation reach management unchanged',()=>{
 const h=navigationHost({edit(g,c){g.party[0].item='potion';c.items.potion.nameKey='author.item';c.items.potion.name='作者原名\\V[1]<b>';}}),f=languageFlow(h);f.setLanguage(lang);h.openMenu();h.choose('psParty');h.ready();assert(h.G.PSManagement.current().text.includes('◆ 作者原名\\V[1]<b>'));
 const tr=E.i18n.createTranslator({en:{meta:{name:'en'},text:{...E.i18n.BUILTIN_LOCALES.en.text,'author.item':''}},zh:{meta:{name:'zh'},text:{...E.i18n.BUILTIN_LOCALES.zh.text,'author.item':''}}},lang);h.G.PSFlow.translator=()=>tr;h.press('down');assert(h.G.PSManagement.current().text.includes('◆ '));assert(!h.G.PSManagement.current().text.some(s=>s.includes('作者原名')));assert.deepEqual(tr.diagnostics(),{missingKeys:[],missingParams:[]});
});
for(const lang of ['zh','en'])test(lang+' reachable bag names for six existing healing keys use the selected locale',()=>{
 const ids=['hyperpotion','maxpotion','fullrestore','revive','maxrevive','fullheal'];
 const h=navigationHost({edit(g,c){g.inventory=E.inventory.inventoryFromBag(Object.fromEntries(ids.map(id=>[id,1])),c.items);}}),f=languageFlow(h);f.setLanguage(lang);h.openMenu();h.choose('psBag');h.ready();h.press('right');const text=h.G.PSInventory.current().text.join('\n');
 const names=lang==='zh'?['厉害伤药','全满药','全复药','活力碎片','活力块','万灵药']:['Hyper Potion','Max Potion','Full Restore','Revive','Max Revive','Full Heal'];for(const name of names)assert(text.includes(name),name);assert.deepEqual(f.translator().diagnostics(),{missingKeys:[],missingParams:[]});assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])test(lang+' ordinary PC search invalid form keeps a translated prompt after rebuilding the menu',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage(lang);const before=JSON.stringify(h.x.state.current());h.G.PSNavigation.openPC();h.transition();h.ready();h.choose('storage');h.ready();h.managementChoose('organize');h.ready();h.press('up');h.press('ok');h.managementChoose('search');h.managementChoose('form');
 const field=h.scene()._controller.input;field.value='abc';field.dispatch('keydown',{key:'Enter',code:'Enter',keyCode:13});h.doc.dispatch('keyup',{key:'Enter',code:'Enter',keyCode:13});h.ready();
 const ui=h.G.PSManagement.current();assert.equal(ui.view.kind,'menu');assert(ui.text.some(t=>t.includes(lang==='zh'?'形态编号请填写 0～999，或留空。':'Enter a form number from 0 to 999, or leave it empty.')));assert(!ui.text.some(t=>t.includes('invalid-search-form')));readOnly(h,before);
});
for(const lang of ['zh','en'])for(const status of ['psn','tox','brn','par','slp','frz'])test(lang+' party status '+status+' and summary types use existing locale consumers',()=>{
 const dex=E.dex.createDexLookup();let content;
 const h=navigationHost({edit(g,c){g.party[0].status=status;c.meta.showdownSourceChecked=true;content=c;},ports:{content:()=>({content,dex})}}),f=languageFlow(h);f.setLanguage(lang);const before=JSON.stringify(h.x.state.current());h.openMenu();h.choose('psParty');h.ready();assert(h.G.PSManagement.current().text.some(t=>t.endsWith('HP  '+expected(lang,'management.status.'+status))));
 h.press('ok');h.managementChoose('summary');h.ready();const view=h.app.describeIndividual(h.x.state.current().party[0].id);assert(h.G.PSManagement.current().text.some(t=>t.endsWith(': '+view.types.map(type=>expected(lang,'pokedex.type.'+type)).join(' / '))));
 h.press('right');h.press('right');h.press('right');const move=view.moves[0];assert(h.G.PSManagement.current().text.some(t=>t.endsWith(': '+expected(lang,'pokedex.type.'+move.type)+' / '+expected(lang,'management.category.'+move.category))));readOnly(h,before);
});
for(const lang of ['zh','en'])test(lang+' optional absent ball uses a translated unknown value in the real summary',()=>{
 const h=navigationHost({edit(g){delete g.party[0].ball;}}),f=languageFlow(h);f.setLanguage(lang);const before=JSON.stringify(h.x.state.current());h.openMenu();h.choose('psParty');h.ready();h.press('ok');h.managementChoose('summary');h.ready();assert(h.G.PSManagement.current().text.includes(expected(lang,'management.ball')+': '+expected(lang,'management.unknown')));assert.deepEqual(f.translator().diagnostics(),{missingKeys:[],missingParams:[]});readOnly(h,before);
});
test('ordinary storage submenu changes language without resetting its cursor or changing game state',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');const before=JSON.stringify(h.x.state.current());h.G.PSNavigation.openPC();h.transition();h.ready();h.choose('storage');h.ready();h.press('down');const cursor=h.G.PSManagement.current().view.cursor;
 f.setLanguage('en');h.frame();const ui=h.G.PSManagement.current();assert.equal(ui.view.items[0].label,'Organize boxes');assert(ui.text.includes('Storage PC'));assert.equal(ui.view.cursor,cursor);readOnly(h,before);
});
for(const lang of ['zh','en'])test(lang+' next event message consumes current language and parameters remain literal at WP17 boundary',()=>{
 const h=messageHost(),f=languageFlow(h);f.setLanguage(lang);
 const initial=lang==='zh'?'中文\\PN':'English \\PN';h.enter([h.command('中文\\PN','English \\PN'),h.command('下一条','Next message'),end]);h.until(()=>h.win.pause);
 assert(h.text().includes(initial.replace('\\PN',h.state.player.name)));f.setLanguage(lang==='zh'?'en':'zh');h.tick(25,'ok');h.until(()=>h.win.pause);assert(h.G.$gameMessage.allText().includes(lang==='zh'?'Next message':'下一条'));h.tick(25,'ok');h.until(()=>!h.map._interpreter.isRunning());assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])test(lang+' choices/help are selected together per command and literal authored controls remain unchanged',()=>{
 const h=choicesHost(),f=languageFlow(h);f.setLanguage(lang);const label='\\V[1]<b>$&';h.show({zh:['中文'+label],en:['English'+label],helpZh:['帮助'+label],helpEn:['Help'+label]});
 assert.equal(h.G.$gameMessage.choices()[0],(lang==='zh'?'中文':'English')+'\\\\V[1]<b>$&');assert.equal(h.help()._text,(lang==='zh'?'帮助':'Help')+'\\\\V[1]<b>$&');
 f.setLanguage(lang==='zh'?'en':'zh');assert.equal(h.G.$gameMessage.choices()[0],(lang==='zh'?'中文':'English')+'\\\\V[1]<b>$&');h.tick(0,'ok');h.show();assert.equal(h.G.$gameMessage.choices()[0],lang==='zh'?'A':'甲');h.tick(0,'ok');assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])test(lang+' event input retains authored initial/title and language changes apply at next request',()=>{
 const h=textHost(),f=languageFlow(h);f.setLanguage(lang);const options={mode:'free',titleZh:'作者标题',titleEn:'Authored title',initialZh:'原文\\V[1]',initialEn:'Original\\V[1]'};h.show(options);
 const s=h.scene();assert.equal(s._field.value,lang==='zh'?options.initialZh:options.initialEn);assert.equal(s._field['aria-label'],lang==='zh'?options.titleZh:options.titleEn);
 f.setLanguage(lang==='zh'?'en':'zh');h.tick();assert(s._hint.textContent.includes(lang==='zh'?'Insert limit:':'新增上限'));assert.equal(s._field.value,lang==='zh'?options.initialZh:options.initialEn);h.key('Escape');assert.equal(h.G.$gameVariables.value(1),lang==='zh'?options.initialZh:options.initialEn);h.transition();h.tick();h.show(options);assert.equal(h.scene()._field.value,lang==='zh'?options.initialEn:options.initialZh);h.key('Escape');assert.deepEqual(h.writes,[]);
});
test('empty event translation and empty choice help remain deliberate values; no fallback overwrites author input',()=>{
 const h=messageHost(),f=languageFlow(h);f.setLanguage('en');h.show('有文字','');h.until(()=>h.win.pause);assert.equal(h.G.$gameMessage.allText(),'');h.tick(25,'ok');h.until(()=>!h.map._interpreter.isRunning());
 const c=choicesHost(),cf=languageFlow(c);cf.setLanguage('en');c.show({en:[''],helpEn:['']});assert.equal(c.G.$gameMessage.choices()[0],'');assert.equal(c.help()._text,'');c.tick(0,'ok');
});
for(const lang of ['zh','en'])test(lang+' input minimum warning follows language while validation and authored fields stay intact',()=>{
 const h=textHost(),f=languageFlow(h);f.setLanguage(lang);const s=h.show({minLength:'2',titleZh:'作者标题',titleEn:'Authored title'});h.key('Enter');assert(s.current());
 f.setLanguage(lang==='zh'?'en':'zh');h.tick();assert(s._status.textContent.includes(lang==='zh'?'Enter at least 2 characters':'至少输入 2 字'));assert.equal(s._field.value,'');assert.equal(s._field['aria-label'],lang==='zh'?'作者标题':'Authored title');assert.equal(h.G.$gameVariables._data[1],undefined);h.insert('OK');h.key('Enter');assert.equal(h.G.$gameVariables.value(1),'OK');assert.deepEqual(h.writes,[]);
});
test('language refresh leaves an attached inventory consumer in ownership of its shared window',()=>{
 const h=navigationHost(),f=languageFlow(h);f.setLanguage('zh');h.openMenu();h.choose('psParty');h.ready();h.press('ok');h.managementChoose('item');h.managementChoose('use');h.ready();assert(h.G.PSInventory.current());const at=h.draws.length;
 f.setLanguage('en');h.frame();assert(h.G.PSInventory.current());assert.equal(h.draws.length,at);assert.deepEqual(h.writes,[]);
});
test('existing translator preserves empty hits, named parameters, literal replacement and explicit English fallback',()=>{
 const en={meta:{name:'English'},text:{empty:'fallback',hello:'Hello {name}',only:'English'}},zh={meta:{name:'中文'},text:{empty:'',hello:'你好{name}'}};
 const tr=E.i18n.createTranslator({en,zh},'zh'),name='$&\\V[1]{x}<b>';
 assert.equal(tr.t('empty'),'');assert.equal(tr.tOr('empty','other'),'');assert.equal(tr.t('hello',{name}),'你好'+name);assert.equal(tr.t('only'),'English');assert.equal(tr.tOr('absent','原文'),'原文');assert.equal(tr.t('absent'),'[missing:absent]');assert.deepEqual(tr.diagnostics(),{missingKeys:['absent'],missingParams:[]});
});
test('built-in tables retain complete key/placeholder parity and sample event bilingual fields are present',()=>{
 const {en,zh}=E.i18n.BUILTIN_LOCALES;assert.deepEqual(E.i18n.checkLocale(en,zh),{missing:[],extra:[],placeholderMismatch:[]});
 const keys=Object.keys(zh.text).filter(k=>k.startsWith('navigation.'));assert(keys.length>30);for(const key of keys){assert(zh.text[key]);assert(en.text[key]);}
 const map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8'));for(const event of map.events.filter(Boolean))for(const page of event.pages)for(const c of page.list){if(c.code!==357||c.parameters[0]!=='PS_Management')continue;for(const [key,value]of Object.entries(c.parameters[3]))if(key.endsWith('Zh')&&value)assert(c.parameters[3][key.slice(0,-2)+'En'],event.id+':'+key);}
});
test('native Map005 banner clears the previous title and draws nothing for the shipped map',()=>{
 const map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8'));
 const paints=[];
 const h=messageHost('zh',816,624,false,(G,{load,objects,windows})=>{
  G.Window_MapName=function(){};
  load(objects,['Game_Map.prototype.displayName']);
  load(windows,['Window_MapName.prototype.open','Window_MapName.prototype.refresh']);
 });
 const G=h.G,banner=Object.assign(new G.Window_MapName(),{
  contents:{clear:()=>paints.push('clear')},innerWidth:320,lineHeight:()=>36,
  drawBackground:()=>paints.push('background'),drawText:name=>paints.push(name),
 });
 G.$dataMap={...map,displayName:'Fixture map'};
 banner.open();
 assert.deepEqual(paints,['clear','background','Fixture map']);
 paints.length=0;
 G.$dataMap=map;
 banner.open();
 assert.deepEqual(paints,['clear']);
});

const starterDialogues=[
 {id:1,x:6,y:4,zh:'带上这只宝可梦和这些道具吧！',en:'Take this Pokémon and these items with you!',
  command:'ClaimGrant',args:{grant:'starter',resultVariable:'11',message:'true'}},
 {id:2,x:10,y:4,zh:'我来帮你的宝可梦恢复一下。',en:'Let me heal your Pokémon.',
  command:'HealParty',args:{resultVariable:'12',message:'true'}},
 {id:3,x:12,y:8,zh:'左边的草丛（区域 1）里有野生宝可梦。你的队伍：',en:'The tall grass on the left (region 1) has wild Pokémon. Your party:',
  command:'ShowParty',args:{}},
];

function starterMapHost(lang,id) {
 const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
 const flowPlugin=read('js/plugins/PS_BattleFlow.js'),core=path.join(ROOT,'js/engine/build/production.cjs');
 const business=[],vars=new Map(),scenes=[];
 const h=messageHost(lang,816,624,false,G=>{
  const content=structuredClone(E.fixtures.content);
  Object.assign(content.species.Pidgey,{abilities:['Keen Eye'],gender:'M'});
  content.grants={starter:{id:'starter',members:[{species:'Pidgey',level:5}],items:{potion:1},money:0}};
  const initial=id===1 ? E.state.newGame({content,party:[]}) : E.fixtures.makeGame();
  if(id===2)Object.assign(initial.party[0],{hp:1,status:'psn'});
  G.$gameSystem._psGame=initial;
  G.$gameVariables.setValue=(key,value)=>vars.set(key,value);
  G.SceneManager.push=scene=>scenes.push(scene);
  G.PluginManager.parameters=name=>name==='PS_BattleFlow'?{language:lang}:{};
  G.require=Object.assign(name=>{
   if(name==='./js/engine/build/production.cjs')return require(core);
   if(name==='node:util'||name==='path')return require(name);
   throw Error('Unexpected starter-map host dependency: '+name);
  },{resolve:name=>path.resolve(ROOT,name)});
  const forward=G.PluginManager.callCommand;
  G.PluginManager.callCommand=function(interpreter,plugin,command,args){
   if(plugin==='PS_BattleFlow')business.push([command,structuredClone(args)]);
   return forward.call(this,interpreter,plugin,command,args);
  };
  require('../../../scripts/tests/legacy-mz-world-host.cjs').install(G);
  vm.runInContext(flowPlugin,G,{filename:'PS_BattleFlow.js'});
  G.PSFlow._content=content;
  G.PSFlow._app=new E.app.GameApplication({
   state:{read:()=>G.$gameSystem._psGame,replace:value=>{G.$gameSystem._psGame=value;}},
   content:()=>({content}),sessions:E.fakes.createFakeSessions({}),projection:E.fakes.createRecordingProjection(),
   random:()=>0,clock:()=>1000,
  // This fixture settles the grant directly so it can check the event's result and message wait.
  },{receivingProfile:{mode:1,naming:1}});
 });
 return {...h,business,vars,scenes,game:()=>h.G.$gameSystem._psGame};
}

for(const event of starterDialogues)for(const lang of ['zh','en'])test(`Map005 event ${event.id} ${lang} opens with localized text and confirms before ${event.command}`,()=>{
 const system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8'));
 const map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8'));
 const source=map.events[event.id],page=source.pages[0];
 assert.equal(system.startMapId,5);
 assert.deepEqual([source.x,source.y,page.trigger,page.priorityType],[event.x,event.y,0,1]);
 const h=starterMapHost(lang,event.id),before=JSON.stringify(h.game());
 const canConfirm=()=>h.win.pause&&!h.win._textState&&h.win._waitCount===0;
 const interpreter=h.enter(page.list,event.id);
 assert.equal(interpreter._waitMode,'message');
 assert(!h.G.$gamePlayer.canMove());
 h.until(canConfirm);
 assert.equal(h.text(),event[lang]);
 assert.deepEqual(h.business,[]);
 assert.equal(JSON.stringify(h.game()),before);

 h.tick(25,'ok');
 assert.deepEqual(h.business,[[event.command,event.args]]);
 if(event.id===1){
  assert.equal(h.vars.get(11),1);
  assert.equal(h.G.PSFlow.lastClaim.status,'applied');
  assert.equal(h.game().party.length,1);
  assert.equal(h.game().party[0].species,'Pidgey');
  assert(Object.hasOwn(h.game().claims,'starter'));
  assert.equal(E.inventory.itemQuantity(h.game().inventory,'potion',h.G.PSFlow.content().items),1);
 }else if(event.id===2){
  assert.equal(h.vars.get(12),1);
  assert.equal(h.G.PSFlow.lastHeal.status,'healed');
  assert.equal(h.game().party[0].status,'');
  assert(h.game().party[0].hp>1);
 }else{
  assert.deepEqual(h.scenes,[h.G.Scene_PSManagement]);
  assert.equal(JSON.stringify(h.game()),before);
 }
 if(event.id!==3){
  assert.equal(interpreter._waitMode,'message');
  h.until(canConfirm);
  h.tick(25,'ok');
 }
 assert(!interpreter.isRunning());
 assert(h.G.$gamePlayer.canMove());
 assert.deepEqual(h.writes,[]);
});

test.after(()=>{
 if(process.env.PF_LOCALIZATION_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.PF_LOCALIZATION_EVIDENCE_DIR,'consumer-calls.json'),JSON.stringify(calls,null,2)+'\n');
});
