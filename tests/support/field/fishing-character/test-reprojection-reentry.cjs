'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('../fishing-presentation/fixture.cjs');
for(const surfing of [false,true])test('POSE06/08 current generation reprojection preserves author image at final source callback '+surfing,async()=>{
 const scope=path.join(process.env.PF_E1_CASE_ROOT,'reproject-'+surfing);fs.mkdirSync(scope);
 const h=await fixture({scope,lang:'en',surfing});let calls=0,injected=0,sourceReads=0;
 try{
  if(surfing)h.G.$gamePlayer.setImage('FixtureSurf',4);
  await h.bag();const old=h.nativeSessions.at(-1).session,draws=h.business.length;
  h.app.stateReplacedByHost();old.dispose();await flush();
  const game=h.G.PSFlow.game;
  h.G.PSFlow.game=function(...args){
   const result=Reflect.apply(game,this,args);calls++;
   // Target the last external source observation before the real refresh/setImage.
   // This selects an adversarial callback boundary; no replacement state/DTO grants authority.
   if(new Error().stack.includes('at sameSource')&&++sourceReads===(surfing?7:2)){
    injected++;h.G.$gamePlayer.setImage('ReprojectAuthor',6);
   }
   return result;
  };
  for(let i=0;i<6;i++){h.tick();await flush();}
  assert.equal(injected,1,'final source callback actually authored a new image');
  assert.deepEqual([h.G.$gamePlayer.characterName(),h.G.$gamePlayer.characterIndex()],['ReprojectAuthor',6]);
  assert.equal(h.state().stats.fishing_count,1);assert.equal(h.state().stats.fishing_battles,0);assert.equal(h.business.length,draws);
  const writes=h.characters.images.length;old.dispose();h.lateNativeCallback();h.tick();
  assert.equal(h.characters.images.length,writes,'old scope cannot later reapply its cleanup');
 }finally{
  fs.writeFileSync(path.join(scope,'REPROJECT.json'),JSON.stringify({surfing,calls,injected,sourceReads,images:h.characters.images},null,2)+'\n',{flag:'wx'});h.restore();
 }
});
