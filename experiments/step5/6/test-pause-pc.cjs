'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
const {navigationHost:host,ROOT,E}=require('./navigation-host.cjs');
const symbols=s=>Array.from(s._commandWindow._list,r=>r.symbol);
for(const lang of ['zh','en'])test(lang+' native map ACTION → implemented pause commands in spec order; no native actor or PC commands',()=>{
 const h=host({lang}),before=JSON.stringify(h.x.state.current()),s=h.openMenu();
 assert.deepEqual(symbols(s),['psPokedex','psParty','psBag','psTrainerCard','save','options','gameEnd']);
 assert(!s._goldWindow.visible&&!s._statusWindow.visible);assert.equal(s._commandWindow._list[3].name,h.x.state.current().player.name);
 h.press('cancel');assert.equal(h.scene().constructor,h.G.Scene_Map);assert.equal(JSON.stringify(h.x.state.current()),before);assert.deepEqual(h.writes,[]);
});
for(const [party,hasDex,seen,unlocked,wantParty,wantDex]of [[0,false,0,true,false,false],[1,false,1,true,true,false],[1,true,0,true,true,false],[1,true,1,false,true,false],[1,true,1,true,true,true]])test('visible gates '+JSON.stringify([party,hasDex,seen,unlocked]),()=>{
 const h=host({hasDex,edit(g){g.party=g.party.slice(0,party);g.dex.seen=seen?['Charizard']:[];g.dex.owned=[];g.dex.unlocked=[unlocked];}}),s=h.openMenu(),rows=symbols(s);
 assert.equal(rows.includes('psParty'),wantParty);assert.equal(rows.includes('psPokedex'),wantDex);for(const name of ['psBag','psTrainerCard','options'])assert(rows.includes(name));
});
for(const [symbol,marker]of [['psParty','_psManagement'],['psBag','_psInventory'],['psPokedex','_request'],['psTrainerCard','_window'],['options','_optionsWindow']])test('actual child '+symbol+' returns to same native selected command',()=>{
 const h=host(),s=h.openMenu();h.choose(symbol);h.ready();const child=h.scene();assert.notEqual(child.constructor,h.G.Scene_Menu);assert(child[marker]);
 if(symbol==='psTrainerCard'){for(let i=0;i<24;i++)h.frame();h.press('cancel');for(let i=0;i<24;i++)h.frame();}else h.press('cancel');
 h.transition();assert.equal(h.scene().constructor,h.G.Scene_Menu);assert.equal(h.scene()._commandWindow.currentSymbol(),symbol);assert(h.scene()._commandWindow.active);assert.equal(h.G.SceneManager._stack.length,1);assert.deepEqual(h.writes,[]);
});
test('refused party, bag and dex leave native menu active and selection intact',()=>{
 const h=host(),s=h.openMenu(),w=s._commandWindow;
 const original=h.G.PSManagement.openParty;h.G.PSManagement.openParty=()=>false;h.choose('psParty');assert(w.active);assert.equal(w.currentSymbol(),'psParty');assert.equal(h.scene(),s);h.G.PSManagement.openParty=original;
 const token=h.app.beginManagement();h.choose('psBag');assert(w.active);assert.equal(w.currentSymbol(),'psBag');assert.equal(h.scene(),s);h.choose('psPokedex');assert(w.active);assert.equal(w.currentSymbol(),'psPokedex');h.app.endManagement(token);
});
test('native save enabled gate and the Game End handler remain unchanged',()=>{
 const h=host({saveEnabled:false}),s=h.openMenu(),w=s._commandWindow;
 assert.equal(w._list.find(r=>r.symbol==='save').enabled,false);assert.equal(w._list.find(r=>r.symbol==='gameEnd').enabled,true);
 // The confirmed manual save consumer is covered separately in test-manual-save.cjs.
 assert.match(String(h.G.Scene_Menu.prototype.commandGameEnd),/SceneManager.push\(Scene_GameEnd\)/);assert.deepEqual(h.writes,[]);
});
test('ACTION closes native menu; disabled menu/event-running guards still prevent map entry',()=>{
 let h=host();h.openMenu();h.press('menu');assert.equal(h.scene().constructor,h.G.Scene_Map);
 h=host();h.G.$gameSystem.isMenuEnabled=()=>false;h.keys.add('menu');h.scene().updateCallMenu();assert(!h.G.SceneManager.isSceneChanging());
 h=host();h.G.$gameMap.isEventRunning=()=>true;h.keys.add('menu');h.scene().updateCallMenu();assert(!h.G.SceneManager.isSceneChanging());
});
for(const touchUI of [false,true])for(const [width,height]of [[512,384],[816,624]])test('native pause/PC layout and keyboard/cancel-button input '+width+'x'+height+' touch='+touchUI,()=>{
 const h=host({width,height,touchUI}),s=h.openMenu(),w=s._commandWindow;assert(w.x>=0&&w.y>=0&&w.x+w.width<=width&&w.y+w.height<=height);
 if(touchUI)assert(w.y>=s._cancelButton.y+s._cancelButton.height);h.press('down');assert.equal(w.currentSymbol(),'psParty');
 if(touchUI){s._cancelButton.onClick();h.frame();}else h.press('cancel');h.transition();assert.equal(h.scene().constructor,h.G.Scene_Map);
 assert(h.G.PSNavigation.openPC());h.transition();h.ready();const pc=h.scene(),cw=pc._commands;assert(cw.x>=0&&cw.y>=0&&cw.x+cw.width<=width&&cw.y+cw.height<=height);
 assert.equal(cw.currentSymbol(),'storage');h.press('down');assert.equal(cw.currentSymbol(),'logoff');if(touchUI)pc._cancelButton.onClick();else h.press('cancel');h.transition();assert.equal(h.scene().constructor,h.G.Scene_Map);assert.deepEqual(h.writes,[]);
});
for(const exit of ['cancel','close'])test('ordinary PC storage child returns to main index zero; only BACK/logoff closes PC '+exit,()=>{
 const h=host(),interpreter=h.enter([{code:357,indent:0,parameters:['PS_Management','ShowPC','PC',{}]},{code:0,indent:0,parameters:[]}]);h.transition();h.ready();
 assert.equal(interpreter._waitMode,'psPC');assert(interpreter.updateWaitMode());assert(!h.G.$gamePlayer.canMove());
 assert.deepEqual(Array.from(h.scene()._commands._list,r=>r.symbol),['storage','logoff']);h.choose('storage');h.ready();assert.equal(h.G.PSManagement.current().view.pcRoot,true);assert(interpreter.updateWaitMode());
 h.managementChoose('withdraw');h.ready();assert.equal(h.G.PSManagement.current().view.mode,'withdraw');h.press('cancel');h.managementChoose('no');h.ready();
 assert.equal(h.G.PSManagement.current().view.cursor,1,'storage submenu keeps its own index');if(exit==='close')h.managementChoose('close');else h.press('cancel');h.transition();h.ready();
 assert.equal(h.scene().constructor,h.G.Scene_PSPC);assert.equal(h.scene()._commands.index(),0);assert(interpreter.updateWaitMode());
 h.choose('logoff');h.transition();h.tick();assert.equal(h.scene().constructor,h.G.Scene_Map);assert(!interpreter.isRunning());assert(h.G.$gamePlayer.canMove());assert.deepEqual(h.writes,[]);
});
test('PC rejected storage push restores its own active selection and event wait',()=>{
 const h=host(),interpreter=h.enter([{code:357,indent:0,parameters:['PS_Management','ShowPC','PC',{}]},{code:0,indent:0,parameters:[]}]);h.transition();h.ready();const s=h.scene();h.G.PSManagement.openStorage=()=>false;h.choose('storage');assert.equal(h.scene(),s);assert(s._commands.active);assert.equal(s._commands.currentSymbol(),'storage');assert(interpreter.updateWaitMode());h.press('cancel');h.transition();h.tick();assert(!interpreter.isRunning());
});
for(const [gate,edit,message]of [['withdraw',g=>{while(g.party.length<6){const m=structuredClone(g.party[0]);m.id='FULL'+g.party.length;g.party.push(m);}},'fullParty'],['deposit',g=>{g.party=g.party.slice(0,1);},'lastAble'],['deposit-egg',g=>{g.party=g.party.slice(0,2);g.party[1].isEgg=true;},'lastAble'],['deposit-fainted',g=>{g.party=g.party.slice(0,2);g.party[1].hp=0;},'lastAble']])test('storage entry rejection retains focus and specific reason '+gate,()=>{
 const h=host({edit}),before=JSON.stringify(h.x.state.current());assert(h.G.PSNavigation.openPC());h.transition();h.ready();h.choose('storage');h.ready();h.managementChoose(gate.startsWith('deposit')?'deposit':gate);h.ready();const ui=h.G.PSManagement.current();assert(ui.view.pcRoot);assert(ui.text.join('\n').includes(h.G.PSFlow.translator().t('management.'+message)));assert.equal(JSON.stringify(h.x.state.current()),before);assert.deepEqual(h.writes,[]);
});
test('reachable shipped PC event4 → storage → root → BACK → following message/balloon → player movement',()=>{
 const h=host({lang:'en'}),G=h.G,m=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),e=m.events[4],system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8')),tiles=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Tilesets.json'),'utf8'));
 const source=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8');
 for(const name of ['Game_Map.prototype.checkPassage','Game_Map.prototype.tileId','Game_Map.prototype.layeredTiles','Game_Map.prototype.allTiles','Game_Map.prototype.isPassable','Game_Map.prototype.isAnyEventStarting','Game_Player.prototype.triggerButtonAction','Game_Player.prototype.startMapEvent','Game_Player.prototype.checkEventTriggerHere','Game_Player.prototype.checkEventTriggerThere']){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(source.slice(a,b+3),G);}
 G.$dataMap=m;const map=h.map;map.tilesetFlags=()=>tiles[m.tilesetId].flags;map.tileEventsXy=()=>[];map.isCounter=()=>false;map.roundXWithDirection=(x,d)=>x+(d===6?1:d===4?-1:0);map.roundYWithDirection=(y,d)=>y+(d===2?1:d===8?-1:0);
 const events=m.events.filter(Boolean).map(e=>{const p=e.pages[0];return Object.assign(Object.create(G.Game_Event.prototype),{x:e.x,y:e.y,_trigger:p.trigger,list:()=>p.list,eventId:()=>e.id,lock(){},isNormalPriority:()=>p.priorityType===1,through:p.through});});map.events=()=>events;map.eventsXy=(x,y)=>events.filter(e=>e.x===x&&e.y===y);
 const start=[system.startX,system.startY],queue=[start],parent=new Map([[start.join(','),null]]);let goal;
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(Math.abs(x-e.x)+Math.abs(y-e.y)===1){goal=[x,y];break;}for(const d of [2,4,6,8]){const nx=map.roundXWithDirection(x,d),ny=map.roundYWithDirection(y,d),k=nx+','+ny;if(nx<0||ny<0||nx>=m.width||ny>=m.height||parent.has(k)||events.some(e=>e.x===nx&&e.y===ny&&e.isNormalPriority()&&!e.through))continue;if(!map.isPassable(x,y,d)||!map.isPassable(nx,ny,10-d))continue;parent.set(k,[x,y]);queue.push([nx,ny]);}}
 assert.equal(system.startMapId,5);assert(goal,'native tile passage and event collision permit approaching the PC');const route=[];for(let p=goal;p;p=parent.get(p.join(',')))route.unshift(p);console.log('WP65 PC Map005 native approach '+JSON.stringify({start,route,approach:goal,event:[e.x,e.y]}));
 Object.assign(G.$gamePlayer,{x:goal[0],y:goal[1],getOnOffVehicle:()=>false,canStartLocalEvents:()=>true,direction:()=>e.x>goal[0]?6:e.x<goal[0]?4:e.y>goal[1]?2:8});h.keys.add('ok');assert(G.$gamePlayer.triggerButtonAction());h.keys.clear();map.updateInterpreter();assert.equal(map._interpreter._eventId,4);
 h.transition();h.ready();assert.equal(h.scene().constructor,G.Scene_PSPC);h.choose('storage');h.ready();h.managementChoose('organize');h.ready();assert.equal(G.PSManagement.current().view.mode,'organize');h.press('cancel');h.managementChoose('no');h.ready();h.press('cancel');h.transition();h.ready();h.press('cancel');h.transition();
 for(let n=0;n<1000&&h.map._interpreter.isRunning();n++){h.tick(25,...(h.win.pause?['ok']:[]));if(h.balloon)h.releaseBalloon();}
 assert(!h.map._interpreter.isRunning());assert(h.text().includes('PC closed. Event continued'));assert(h.G.$gamePlayer.canMove());assert.equal(h.G.SceneManager._stack.length,0);assert.deepEqual(h.writes,[]);
});
