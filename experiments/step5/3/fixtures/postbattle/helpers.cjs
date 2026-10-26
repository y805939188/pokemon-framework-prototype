'use strict';
// Explicit synthetic V2 receipts; actual application, C/D/F and save gates. Not engine observation evidence.
const path=require('node:path'),fs=require('node:fs');
const E=require(path.resolve(__dirname,'../../../../../js/engine/build/engine.cjs')),clone=x=>JSON.parse(JSON.stringify(x));
const complete=value=>({status:'complete',value}),faint=()=>({coverage:{status:'complete'},positiveOccurrences:[]});
function world({initial,entries=[{method:'Level',parameter:51,target:'Blastoise'}],targetMoves=[],settings={},patch={},critical=0,damage=0,worldFacts,changeContent,port,extraContent,profile,real=false,contentPort}={}){
 const content=clone(E.fixtures.content),dex=E.dex.createDexLookup();
 for(const [name,data]of Object.entries(content.species)){const d=dex.species(name);Object.assign(data,{abilities:d.abilities,hiddenAbilities:d.hiddenAbilities,gender:d.gender});}
 const ids=['flamethrower','airslash','dragonpulse','roost','hydropump','icebeam','flashcannon','protect','gigadrain','sludgebomb','earthquake','synthesis','tackle','gust','quickattack','wingattack','growl','rest','surgingstrikes'];
 content.moves=Object.fromEntries(ids.map(id=>{const m=dex.move(id);return[m.name,m];}));content.species.Pidgey.learnset={1:['Tackle']};
 content.species.Charizard.evolutions=entries;content.species.Blastoise.learnset={0:targetMoves};content.settings=settings;
 if(extraContent)extraContent(content);
 const inputsHash=E.digest.sha256Hex(E.contentCompile.canonicalJson(content)),showdownSha=fs.readFileSync(path.resolve(__dirname,'../../../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),compiledSemantics=2;
 content.meta={kind:'fixture',id:'postbattle',compiledSemantics,inputsHash,showdownSha,contentIdentity:E.digest.sha256Hex(E.contentCompile.canonicalJson({compiledSemantics,inputsHash,showdownSha}))};
 const game=initial??E.fixtures.makeGame();game.party[0].friendship=99;
 const state=E.fakes.createMemoryState(game),projection=E.fakes.createRecordingProjection();let app;
 const statePort=port?port(state,()=>app):state;
 let sessions={created:[],calls:0,async create(request,view,setup){const id=view.party[0].id,result={protocol:1,battleId:request.battleId,outcome:{kind:'run',winner:null},members:{[id]:{level:51,exp:E.growth.minExp(content.species.Charizard.growth,51),...clone(patch)}},bag:{},captured:[],dex:{seen:[],owned:[]}};
  const handle={result:()=>clone(result)};sessions.created.push({request,view,setup,result,handle});return handle;},
  effects(handle,binding){sessions.calls++;const made=sessions.created.find(x=>x.handle===handle),context=made.setup.evidenceContext;
   const result={version:2,binding:{...binding},context:{playerIds:[...context.playerIds],L0:clone(context.initialLevels),engineRosterIds:made.view.party.map(m=>m.id),foeIds:made.setup.foes.map(m=>m.id),internalBattle:true},
    observer:{appearances:{},defeats:{},members:Object.fromEntries(made.view.party.map((m,i)=>[m.id,{critical:complete(i?0:critical),damage:complete({total:i?0:damage,resetCoverage:'complete'}),faint:faint()}]))},
    control:{members:Object.fromEntries(made.view.party.map(m=>[m.id,{friendship:complete({before:m.friendship,current:m.friendship,changes:[]}),faint:faint()}]))}};
   if(changeContent)changeContent(content);return result;
  }};
 if(real){sessions=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]});const effects=sessions.effects;sessions.calls=0;sessions.seals=[];sessions.effects=(...args)=>{sessions.calls++;const seal=effects(...args);sessions.seals.push(seal);return seal;};}
 app=new E.app.GameApplication({state:statePort,sessions,projection,content:()=>contentPort?contentPort(content):({content}),random:()=>0,clock:()=>0,evolutionWorld:worldFacts},{receivingProfile:profile??{mode:1,naming:1}});
 const request={battleId:'postbattle-1',kind:'wild',seq:1,foes:[{species:'Pidgey',level:5}]};
 return{E,app,state,projection,sessions,content,request,async finish(){const h=await app.startBattle(request);return{h,outcome:app.finishBattle(h,request)};},answer(decision){const p=app.pendingEvolution;if(!p)throw Error('no evolution pending');return app.resolveEvolution(p.token,p.revision,decision);}};
}
module.exports={world,E,clone};
