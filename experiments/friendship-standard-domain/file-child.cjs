'use strict';
const fs=require('node:fs'),path=require('node:path');const E=require(path.resolve(__dirname,'../../js/engine/build/production.cjs')),T=require(path.resolve(__dirname,'../../js/engine/build/testing.cjs'));
(async()=>{
 const [file,point,mode]=process.argv.slice(2),c=T.fixtures.content;let current=JSON.parse(fs.readFileSync(file));
 const store=new E.store.SaveStore(file,{},E.speciesKey.speciesKeyResolver(c),c);
 const app=new E.app.GameApplication({state:{read:()=>current,replace:n=>{current=n;}},content:()=>({content:c}),sessions:{create:async()=>null},projection:{project(){}}});
 const p=await app.previewFriendshipMigration(store.friendshipMigration(p=>{if(p===point){fs.writeFileSync(file+'.reached',p);if(mode==='kill'){process.kill(process.pid,'SIGKILL');}else throw Error('injected-'+p);}}));
 if(p.status!=='ready')throw Error(JSON.stringify(p));const r=await app.confirmFriendshipMigration(p.handle);fs.writeFileSync(file+'.result',JSON.stringify(r));
})().catch(e=>{console.error(e);process.exitCode=1;});
