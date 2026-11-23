'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{setup,clone,verify}=require('./pokedex-area-host.cjs');test.after(verify);
test('AREA01 normal production menu reaches App-backed known habitat and draws its real region/cell',async()=>{
 const w=await setup();w.menu();assert.equal(w.p()?.view.kind,'list');const before=clone(w.game()),writes=w.writes,draws=w.draws;
 const page=w.area();assert.equal(page.view.area.status,'known');assert.deepEqual(clone(page.view.area.points),[{x:13,y:12}]);assert(page.text.some(s=>s.includes('Test Coast')));assert(page.text.some(s=>s.includes('13')&&s.includes('12')));assert(!page.text.includes(w.E.i18n.translatorFor('en').t('pokedex.areaUnknown')));
 assert.deepEqual(w.game(),before);assert.equal(w.writes,writes);assert.equal(w.draws,draws);assert.equal(w.app.saveBlocked,false);
});

const noEffects=(w,before,writes,draws)=>{assert.deepEqual(w.game(),before);assert.equal(w.writes,writes);assert.equal(w.draws,draws);};
const page=async options=>{const w=await setup(options);assert.equal(w.open().status,'opened');return{w,p:w.area()};};
test('AREA02 same actual Content: Fly first-hidden cell has no fallback while Area unions later visible records',async()=>{
 const w=await setup({content:c=>{const r=c.world.regionMaps.regions[0];r.points.unshift({x:13,y:12,switchId:51});}}),before=clone(w.game()),writes=w.writes,draws=w.draws;
 assert.equal(w.app.worldFlyDestinations().status,'ready');assert.deepEqual(w.app.worldFlyDestinations().destinations,[]);
 assert.equal(w.open().status,'opened');assert.equal(w.area().view.area.status,'known');w.press('cancel');w.press('cancel');
 w.G.$gameSwitches._data[51]=true;assert.equal(w.app.worldFlyDestinations().destinations.length,0); // First record is now visible but has no healing spot.
 w.content().world.regionMaps.regions[0].points[0].healingSpot={mapId:1,x:0,y:0};assert.equal(w.app.worldFlyDestinations().destinations.length,1);
 w.G.$gameSwitches._data[51]=false;assert.equal(w.app.worldFlyDestinations().destinations.length,0);assert.equal(w.app.pokedexArea('Charizard').status,'known');noEffects(w,before,writes,draws);
});
for(const inherited of [false,true])test('AREA02 actual native '+(inherited?'inherited':'own')+' switch data toggles both Fly and Area without writes/RNG',async()=>{
 const w=await setup({content:c=>{c.world.regionMaps.regions[0].points[0].switchId=51;}}),before=clone(w.game()),writes=w.writes,draws=w.draws;
 const data=inherited?Object.create(Array.prototype):w.G.$gameSwitches._data;if(inherited){const arr=[];Object.setPrototypeOf(arr,data);w.G.$gameSwitches._data=arr;}
 data[51]=false;assert.equal(w.app.worldFlyDestinations().destinations.length,0);assert.equal(w.app.pokedexArea('Charizard').status,'unknown');
 data[51]=true;assert.equal(w.app.worldFlyDestinations().destinations.length,1);assert.equal(w.open().status,'opened');assert.equal(w.area().view.area.status,'known');noEffects(w,before,writes,draws);
});
test('AREA02 missing switch source and inherited native getter remain unavailable with explicit zero invocation',async()=>{
 const w=await setup({content:c=>{c.world.regionMaps.regions[0].points[0].switchId=51;}}),before=clone(w.game()),writes=w.writes,draws=w.draws;let gets=0;
 const proto=Object.create(Array.prototype);Object.defineProperty(proto,'51',{get(){gets++;return true;}});Object.setPrototypeOf(w.G.$gameSwitches._data,proto);
 const area=w.app.pokedexArea('Charizard');assert.equal(area.status,'unknown');assert.deepEqual(area.points,[]);assert(area.diagnostics.length);assert.equal(w.app.worldFlyDestinations().status,'blocked');assert.equal(gets,0);
 delete w.G.$gameSwitches;assert.equal(w.app.pokedexArea('Charizard').status,'unknown');assert.equal(gets,0);noEffects(w,before,writes,draws);
});
test('AREA03 geographic region7 is not regional-dex index0; v1 enumerates current plus v0 and excludes future/hidden/other-region maps',async()=>{
 const {w,p}=await page({state:g=>{g.world.encounterVersion=1;},content:c=>{
  const base=clone(c.world.encounters.tables[0]);c.world.encounters.tables=[{...clone(base),version:1,types:{Land:{stepChance:21,slots:[{species:'Venusaur',weight:100,minLevel:5,maxLevel:5}]}}},base,...[2,3,4].map(mapId=>({...clone(base),mapId,version:mapId===4?2:0}))];
  c.mapMetadata.maps[2]={mapPosition:{regionId:7,x:14,y:12},flags:['HideEncountersInPokedex']};c.mapMetadata.maps[3]={mapPosition:{regionId:8,x:15,y:12}};c.mapMetadata.maps[4]={mapPosition:{regionId:7,x:16,y:12}};
  c.world.regionMaps.regions[0].points.push({x:14,y:12},{x:15,y:12},{x:16,y:12});c.world.regionMaps.regions.push({id:8,nameKey:'other',points:[{x:15,y:12}]});
 }});assert.equal(p.view.area.status,'known');assert.equal(p.view.area.region.id,7);assert.deepEqual(clone(p.view.area.points),[{x:13,y:12}]);assert.equal(w.game().dex.view.region,-1);
});
for(const [shape,width,expected] of [['10000',3,[[13,12]]],['11111',3,[[13,12],[14,12],[15,12],[13,13],[14,13]]],['2x090',3,[[13,12],[13,13]]],['00000',0,[[13,12]]]])test('AREA03 actual Area mask '+shape+'/width'+width+' preserves ASCII occupancy and partial-row holes',async()=>{
 const {p}=await page({content:c=>{c.mapMetadata.maps[1].mapSize={width,shape};c.world.regionMaps.regions[0].points=[];for(let y=12;y<14;y++)for(let x=13;x<16;x++)c.world.regionMaps.regions[0].points.push({x,y});}});
 assert.equal(p.view.area.status,'known');assert.deepEqual(clone(p.view.area.points).map(p=>[p.x,p.y]),expected);
});
for(const variation of ['missing-world','missing-tables','missing-current-metadata','missing-position','no-species','other-region','hidden'])test('AREA04 real production Area genuine unknown: '+variation,async()=>{
 const {w,p}=await page({content:c=>{if(variation==='missing-world')delete c.world;if(variation==='missing-tables')delete c.world.encounters;if(variation==='missing-current-metadata')delete c.mapMetadata.maps[1];if(variation==='missing-position')delete c.mapMetadata.maps[1].mapPosition;if(variation==='no-species')c.world.encounters.tables[0].types.Land.slots[0].species='Venusaur';if(variation==='other-region')c.mapMetadata.maps[1].mapPosition.regionId=8;if(variation==='hidden')c.mapMetadata.maps[1].flags=['HideEncountersInPokedex'];}});
 assert.equal(p.view.area.status,'unknown');assert.deepEqual(clone(p.view.area.points),[]);assert(p.text.includes(w.E.i18n.translatorFor('en').t(p.view.area.diagnostics.length?'pokedex.areaUnavailable':'pokedex.areaUnknown')));
});
for(const variation of ['bad-current-coordinate','bad-mask','unicode-mask','bad-width','null-metadata','bad-table','null-points'])test('AREA04 real Area malformed source is invalid: '+variation,async()=>{
 const {w,p}=await page({content:c=>{if(variation==='bad-current-coordinate')c.mapMetadata.maps[1].mapPosition.x=-1;if(variation==='bad-mask')c.mapMetadata.maps[1].mapSize={width:3,shape:null};if(variation==='unicode-mask')c.mapMetadata.maps[1].mapSize={width:3,shape:'１'};if(variation==='bad-width')c.mapMetadata.maps[1].mapSize={width:-1,shape:'1'};if(variation==='null-metadata')c.mapMetadata=null;if(variation==='bad-table')c.world.encounters.tables[0].types.Land.slots=null;if(variation==='null-points')c.world.regionMaps.regions[0].points=null;}});
 assert.equal(p.view.area.status,'invalid');assert.deepEqual(clone(p.view.area.points),[]);assert(p.text.includes(w.E.i18n.translatorFor('en').t('pokedex.areaInvalid')));
});
test('AREA04 public invalid identity and unknown Content getters are rejected with separate zero-call counters',async()=>{
 const w=await setup(),before=clone(w.game()),writes=w.writes,draws=w.draws;let argumentGetter=0,contentGetter=0;
 const identity={get species(){argumentGetter++;throw Error('argument getter must not execute');}};const reads=w.reads;assert.equal(w.app.pokedexArea(identity).status,'invalid');assert.equal(argumentGetter,0);assert.equal(w.reads,reads);
 Object.defineProperty(w.content().mapMetadata.maps[1],'mapSize',{enumerable:true,get(){contentGetter++;throw Error('Content getter must not execute');}});
 const result=w.app.pokedexArea('Charizard');assert.equal(result.status,'invalid');assert(result.diagnostics.includes('invalid-pokedex-area-source'));assert.equal(contentGetter,0);noEffects(w,before,writes,draws);
});
test('AREA05 actual Summary menu attaches same known Area, retains parent and closes only its child',async()=>{
 const w=await setup(),p=w.summary();assert.equal(p.view.kind,'entry');assert.equal(p.view.area.status,'known');assert.deepEqual(clone(p.view.area.points),[{x:13,y:12}]);const parent=w.G.PSManagement.current().token,owner=w.app.pendingPokedex.token,before=clone(w.game()),writes=w.writes,draws=w.draws;
 w.press('left');w.press('right');assert.equal(w.app.pendingPokedex.token,owner);assert.equal(w.app.saveBlocked,true);noEffects(w,before,writes,draws);w.press('cancel');w.ready();assert.equal(w.p(),null);assert.equal(w.G.PSManagement.current().token,parent);assert.equal(w.G.PSManagement.current().view.kind,'summary');w.press('cancel');assert.equal(w.app.saveBlocked,false);
});
for(const variation of ['content-object','content-value','map','player','scene','switch-storage','switch-value','game-object','load'])test('AREA06 content loading callback retires changed '+variation+' source without query writes/RNG',async()=>{
 const w=await setup(),writes=w.writes,draws=w.draws;w.setContentHook(()=>{if(variation==='content-object')w.G.PSFlow._content=clone(w.content());if(variation==='content-value')w.content().world.regionMaps.regions[0].points[0].x++;if(variation==='map')w.G.$gameMap={_mapId:1};if(variation==='player')w.G.$gamePlayer={_x:0,_y:0};if(variation==='scene')w.manager._scene={};if(variation==='switch-storage')w.G.$gameSwitches._data=[];if(variation==='switch-value')w.G.$gameSwitches._data[51]=true;if(variation==='game-object')w.G.$gameSystem._psGame=clone(w.game());if(variation==='load'){w.G.$gameSystem._psGame=clone(w.game());w.app.stateReplacedByHost();}});
 assert.throws(()=>w.app.pokedexArea('Charizard'),/stale-pokedex-area/);assert.equal(w.writes,writes);assert.equal(w.draws,draws);assert.equal(w.app.saveBlocked,false);
});
test('AREA06 formal new game callback rejects old query and adds only its own two 16-bit ID draws and one install',async()=>{
 const w=await setup();let result;w.setContentHook(()=>{result=w.app.startNewGame();});const writes=w.writes,draws=w.draws;assert.throws(()=>w.app.pokedexArea('Charizard'),/stale-pokedex-area/);assert.equal(result.status,'started');assert.equal(w.writes,writes+1);assert.equal(w.draws,draws+2);assert.deepEqual(w.drawTrace.slice(draws),[65536,65536]);assert.deepEqual(w.game(),result.state);assert.equal(w.app.saveBlocked,false);
});
test('AREA06 real attached Area callback failure never clears a new Management successor',async()=>{
 const w=await setup();w.summary();let successor;w.setContentHook(()=>{w.app.stateReplacedByHost();successor=w.app.beginManagement();throw Error('source failed after successor');});const before=clone(w.game()),writes=w.writes,draws=w.draws;
 w.press('left');w.ready();assert.equal(w.p(),null);assert.doesNotThrow(()=>w.app.managementSnapshot(successor));assert.equal(w.app.endManagement(successor).status,'unchanged');noEffects(w,before,writes,draws);
});

test('AREA05 real held-member Summary entry keeps held ownership through known Area and close',async()=>{
 const w=await setup(),id=w.game().party[0].id;w.G.PSManagement.openStorage();w.ready();w.managementChoose('organize');w.press('control');w.press('up');w.press('ok');w.press('ok');w.managementChoose('pick');assert.equal(w.G.PSManagement.current().heldId,id);w.press('ok');w.managementChoose('summary');w.press('ok');w.managementChoose('pokedex');w.ready();w.press('right');assert.equal(w.p().view.area.status,'known');const before=clone(w.game()),writes=w.writes,draws=w.draws;w.press('cancel');w.ready();assert.equal(w.G.PSManagement.current().heldId,id);assert.equal(w.app.saveBlocked,true);noEffects(w,before,writes,draws);
});
test('AREA06 a legacy read callback retiring the generation cannot return a stale Area or clear successor',async()=>{
 const w=await setup(),before=clone(w.game()),writes=w.writes,draws=w.draws;let successor;w.setReadHook(()=>{w.app.stateReplacedByHost();successor=w.app.beginManagement();});assert.throws(()=>w.app.pokedexArea('Charizard'),/stale-pokedex-area/);assert.doesNotThrow(()=>w.app.managementSnapshot(successor));assert.equal(w.app.endManagement(successor).status,'unchanged');noEffects(w,before,writes,draws);
});
test('AREA03-SIGNED current signed encounter version selects its exact table without positive-version v0 compatibility',async()=>{
 const {p}=await page({state:g=>{g.world.encounterVersion=-2;},content:c=>{const table=clone(c.world.encounters.tables[0]);c.world.encounters.tables[0].types.Land.slots[0].species='Venusaur';c.world.encounters.tables.push({...table,version:-2});}});assert.equal(p.view.area.status,'known');assert.deepEqual(clone(p.view.area.points),[{x:13,y:12}]);
});
test('AREA03-SIGNED a legal unrelated negative version table cannot invalidate current-version Area',async()=>{
 const {p}=await page({content:c=>{c.world.encounters.tables.push({...clone(c.world.encounters.tables[0]),version:-2});}});assert.equal(p.view.area.status,'known');assert.deepEqual(clone(p.view.area.points),[{x:13,y:12}]);
});
test('AREA06-APP replacing the actual native App during content loading rejects old query and preserves successor',async()=>{
 const w=await setup(),next=await setup(),before=clone(w.game()),writes=w.writes,draws=w.draws;w.setContentHook(()=>{w.G.PSFlow._app=next.app;});assert.throws(()=>w.app.pokedexArea('Charizard'),/stale-pokedex-area/);assert.equal(w.G.PSFlow._app,next.app);assert.equal(next.app.saveBlocked,false);noEffects(w,before,writes,draws);
});
