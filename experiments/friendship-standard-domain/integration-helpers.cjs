'use strict';
const fs=require('node:fs'),path=require('node:path');
const {workspace,ROOT}=require('./helpers.cjs');
const E=require(path.join(ROOT,'js/engine/build/production.cjs')),T=require(path.join(ROOT,'js/engine/build/testing.cjs'));
const J=v=>JSON.parse(JSON.stringify(v));
function fixture(options={}){
 const dir=workspace(),file=path.join(dir,'player.json');let content=J(T.fixtures.content),current=J(T.fixtures.makeGame());current.party[0].friendship=256;
 if(options.game)current=options.game(current);fs.writeFileSync(file,JSON.stringify(current,null,3)+'\n');
 const state={read:()=>current,replace:next=>{if(options.install)options.install(next,v=>{current=v;});else current=next;}};
 const store=new E.store.SaveStore(file,{},E.speciesKey.speciesKeyResolver(content),content);
 const app=new E.app.GameApplication({state,sessions:{create:async()=>({result(){throw Error('unused');}})},projection:{project(){}},content:()=>({content}),random:n=>0,clock:()=>123});
 return {E,T,app,store,file,dir,state,read:()=>current,set:v=>{current=v;},content:()=>content,replaceContent:()=>{content=J(content);store.content=content;},J};
}
module.exports={fixture,E,T,J,ROOT,workspace};
