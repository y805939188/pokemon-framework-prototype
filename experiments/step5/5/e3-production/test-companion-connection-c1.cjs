const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./companion-fixture.cjs');
const positions=h=>h.records().map(r=>[r.location.mapId,r.location.x,r.location.y]);
for(const [index,choice] of ['no','yes'].entries())test('CC0'+(index+5)+' actual nonempty connection through genuine C1 '+choice+' new Map and retained bridge',async()=>{
 let ports;const h=await fixture({capturePorts:p=>{ports=p;},edit(game){game.world.repelSteps=1;},nativeSetup(n,{maps}){for(const [id,x] of [[1,8],[2,7]]){maps[5].events[id].x=x;maps[5].events[id].y=2;maps[5].events[id].pages[0].image.direction=6;n.G.$gameMap._events[id].locate(x,2);n.G.$gameMap._events[id].setDirection(6);}}});
 const G=h.G,lifecycle=()=>ports.state.atomicWorldContent(()=>s=>({value:s.lifecycle})),initial=lifecycle().travelLease,oldMap=G.SceneManager._scene,prefix=h.draws.slice(),nativePrefix=h.nativeDraws.slice(),before=h.state().steps,quantity=h.quantity('repel');
 const evidence={choice,prefix,nativePrefix,before};let result,error;
 try {
 for(const id of [1,2])assert.equal((await h.settle(h.app.beginEventCompanion({kind:'register',eventId:id}).result)).status,'completed');
 const run=h.app.runWorldTravel.bind(h.app),calls=[];h.app.runWorldTravel=(...args)=>{calls.push(args);return Reflect.apply(run,h.app,args).then(value=>{result=value;return value;});};
 G.Input.dir4=6;h.tick();G.Input.dir4=0;await h.pump(()=>result!==undefined);assert.equal(result.status,'awaiting-arrival');assert.equal(calls.length,1);assert.equal(calls[0][1].kind,'connection');
 await h.pump(()=>G.PSInventory.current()?.view?.kind==='menu');
 const selection=h.selected(),inventory=G.SceneManager._scene,held=lifecycle().travelLease;assert(h.app.isOwnedRepelSelection(selection.owner,selection.selection));
 evidence.held={hasCurrent:!!held?.current,receiptSame:held?.current?.receipt===result.receipt,phase:held?.current?.phase,birthSameInitial:held?.mapBirth?.birth===initial?.mapBirth?.birth,frameDataSameCurrent:held?.mapBirth?.frame?.data===G.$dataMap,sourceHandoff:!!held?.sourceHandoff};
 assert.equal(h.state().steps,before+1);assert.equal(h.state().world.repelSteps,0);assert.equal(h.app.saveBlocked,true);
 h.choose(choice);if(choice==='yes'){assert.equal(G.PSInventory.current().view.kind,'bag');h.ready();h.press('ok');}
 await h.pump(()=>G.SceneManager._scene!==inventory&&G.SceneManager._scene!==oldMap&&G.SceneManager._scene instanceof G.Scene_Map&&!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending());
 const receiver=G.SceneManager._scene,after=lifecycle().travelLease,birth=after?.mapBirth,frame=birth?.frame;
 evidence.returned={newMap:receiver!==oldMap&&receiver!==inventory,started:receiver._started,currentNull:after.current===null,newBirth:birth.birth!==initial.mapBirth.birth,scene:birth.scene===receiver,queue:birth.queue===G.SceneManager._nextScene,player:frame?.player===h.player,map:frame?.map===G.$gameMap,data:frame?.data===G.$dataMap,mapId:frame?.mapId,positions:positions(h)};
 assert.equal(receiver._started,true);assert.equal(after.current,null);assert.notEqual(birth.birth,initial.mapBirth.birth);assert.equal(birth.scene,receiver);assert.equal(frame.player,h.player);assert.equal(frame.map,G.$gameMap);assert.equal(frame.data,G.$dataMap);assert.equal(frame.mapId,6);
 assert.deepEqual(positions(h),[[5,9,2],[5,8,2]],'C1 genuine returned Map must keep original qualified oldmap facts for both actual followers');
 assert.deepEqual(h.visual.parent.children.map(s=>s._character._x).sort((a,b)=>a-b),[-2,-1]);
 assert.equal(h.state().steps,before+1);assert.equal(h.state().stats.distance_walked,1);assert.equal(h.arrivals(),1);assert.equal(h.replies(),1);assert.equal(h.trace.filter(r=>r[0]==='native-reserve').length,1);assert.deepEqual(h.draws.slice(prefix.length),[100]);assert.deepEqual(h.nativeDraws,nativePrefix);
 assert.equal(h.quantity('repel'),quantity-(choice==='yes'?1:0));assert.equal(h.state().world.repelSteps,choice==='yes'?100:0);
 h.player.reserveTransfer(7,2,3,8,0);const records=structuredClone(h.records()),draws=h.draws.slice();assert.equal(selection.hooks.returned(selection.handle),false);await h.app.finishWorldTravelArrival(result.receipt);for(let i=0;i<5;i++)await flush();
 assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,7);assert.equal(h.player._newX,2);assert.equal(h.player._newY,3);assert.equal(h.player._newDirection,8);assert.deepEqual(h.records(),records);assert.deepEqual(h.draws,draws);evidence.successorPreserved=true;
 }catch(e){error=e;}
 evidence.result=result?{status:result.status}:null;evidence.final={positions:positions(h),render:h.visual.parent.children.map(s=>({x:s._character._x,y:s._character._y})),steps:h.state().steps,distance:h.state().stats.distance_walked,arrivals:h.arrivals(),replies:h.replies(),repel:h.state().world.repelSteps,quantity:h.quantity('repel'),draws:h.draws,nativeDraws:h.nativeDraws,trace:h.trace,pending:G.PSWorld.pending(),blocked:h.app.saveBlocked,diagnostics:G.PSWorld.diagnostics};if(error)evidence.error={message:error.message,stack:error.stack};
 fs.writeFileSync(path.join(process.env.PF_COMPANION_INGRESS_OUTPUT,'CC0'+(index+5)+'.json'),JSON.stringify(evidence,null,2)+'\n');if(error)throw error;
});
