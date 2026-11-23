'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./companion-fixture.cjs');
test('CI09 nondefault source opacity is normalized in Game JSON before the actual native autosave consumer',async()=>{
 const h=await fixture();h.G.$gameMap._events[1].setOpacity(31);h.G.$gameMap._events[2].setOpacity(77);
 for(const id of[1,2])assert.equal((await h.settle(h.app.beginEventCompanion({kind:'register',eventId:id}).result)).status,'completed');
 const sourceOpacity=h.records().map(r=>r.appearance.opacity);assert.deepEqual(sourceOpacity,[31,77]);const prefix=h.draws.slice(),snapshots=[];
 const nativeConsumer=h.G.DataManager.saveGame;
 h.G.DataManager.saveGame=function(...args){const game=JSON.parse(JSON.stringify(h.state()));snapshots.push({nativeMapId:h.G.$gameMap.mapId(),companions:game.world.companions,presentation:structuredClone(h.service.runtimePresentation()),args:[...args]});return Reflect.apply(nativeConsumer,this,args);};
 const previous=h.G.SceneManager._scene;h.player.reserveTransfer(7,3,3,8,0);h.tick();await h.pump(()=>h.G.SceneManager._scene!==previous&&h.G.SceneManager._scene._started&&!h.G.PSWorld.pending()&&!h.G.PSFlow.companionNativePending()&&!h.app.saveBlocked);
 assert(snapshots.length>=1,'natural native autosave reached the observed consumer');
 for(const s of snapshots){assert.equal(s.nativeMapId,7);assert.equal(s.companions.length,2);assert(s.companions.every(r=>r.location.mapId===7&&r.location.x===3&&r.location.y===3&&r.appearance.opacity===255));assert.equal(s.presentation.transferHidden.length,2);}
 assert(h.visual.parent.children.every(s=>s._character._transparent===true));assert.deepEqual(h.draws,prefix);
 fs.writeFileSync(path.join(process.env.PF_COMPANION_INGRESS_OUTPUT,'CI09.json'),JSON.stringify({sourceOpacity,snapshots,drawPrefix:prefix,drawAfter:h.draws,additionalDraws:h.draws.slice(prefix.length),additionalSaveRequestsIssuedByTest:0,consumer:'actual native autosave -> observed DataManager.saveGame facade; JSON of actual Game, not PS_SaveState disk'},null,2)+'\n');
});
