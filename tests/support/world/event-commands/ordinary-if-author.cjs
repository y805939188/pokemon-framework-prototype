'use strict';
// G IF author data only. The installed IIFE is responsible for the one normal load/freezing.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
const marker='g-if-ordinary';
const source='author-placeholder';
function physicalDirectory(dir){
 const stat=fs.lstatSync(dir);
 assert(path.isAbsolute(dir)&&stat.isDirectory()&&fs.realpathSync(dir)===dir);
}
function physicalFile(file,privateLeaf=false){
 const stat=fs.lstatSync(file);
 assert(stat.isFile()&&fs.realpathSync(file)===file);
 if(privateLeaf)assert(stat.uid===process.getuid()&&stat.nlink===1&&(stat.mode&0o777)===0o600);
 return fs.readFileSync(file);
}
function prepare(runtime,selector,earlyId){
 const {root,E,files,parentBindingSHA256,identity}=runtime;
 const family=process.env.PF_FINAL_PRODUCTION_FAMILY,run=process.env.PF_FINAL_PRODUCTION_RUN,scope=process.env.PF_G_NATIVE_OUTPUT;
 assert(['g-native-commands','legacy-capture-compat'].includes(family));
 if(selector==='IF-BUSY-APIS')assert.equal(family,'g-native-commands');
 else assert.match(selector,/^IF-(?:(?:WILD|TRAINER)-(?:META|SESSION|ARGS)|SOURCE|CONTENT|GENERATION|HOUR|INVALID-META)$/);
 assert.equal(selector,process.env.PF_FINAL_PRODUCTION_SELECTOR);
 assert.equal(selector,process.env.PF_G_COMMAND_CASE);
 assert.equal(scope,path.join(run,selector));
 assert.equal(path.dirname(run),path.join(root,'build/headless-final-production'));
 assert(path.basename(run).startsWith(family+'-'));
 for(const dir of [root,path.dirname(run),run,scope])physicalDirectory(dir);

 const sourceHashes={};
 const authored=Object.fromEntries(['manifest','sources','species'].map(name=>{
  const leaf='content/sample/'+name+'.json',bytes=physicalFile(path.join(root,leaf));
  sourceHashes[leaf]=sha(bytes);
  assert.equal(sourceHashes[leaf],files[leaf],'input differs from the captured worker parent: '+leaf);
  return [name,JSON.parse(bytes.toString('utf8'))];
 }));
 assert.equal(authored.manifest.schema,2);
 const pidgey=authored.species.filter(row=>row.id==='pidgey');
 assert.equal(pidgey.length,1);
 const slots=[{species:'pidgey',weight:1,minLevel:5,maxLevel:5}];
 const inputs={manifest:{...authored.manifest,id:marker,title:'G ordinary native IF command author control'},
  sources:authored.sources,species:pidgey.map(row=>({...row,abilities:['keeneye'],hiddenAbilities:[],wildItemCommon:[],wildItemUncommon:[],wildItemRare:[],learnset:[{level:1,move:'tackle'}],evolutions:[]})),
  overlays:[],settings:{AFFECTION_EFFECTS:false},regionalDex:{source,national:['pidgey'],regions:[]},
  mapMetadata:{source,maps:{5:{outdoor:false,environment:'cave'},6:{outdoor:true},7:{outdoor:true}}},
  encounters:{source,tables:[{mapId:5,version:0,types:{Land:{stepChance:1,slots}}}]},
  trainerTypes:[{id:'ace',nameKey:'type.ace',gender:0,baseMoney:10,skillLevel:0,flags:[],items:[],source}],
  trainers:[{id:'npc',type:'ace',name:'Tester',version:0,party:[{species:'pidgey',level:5,moves:['tackle']}],source}],
 };
 const compiled=E.contentCompile.compileContent(inputs,{},{showdownSha:identity.showdownSHA});
 assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
 const raw=json(compiled.data),compiledSHA256=sha(raw),checked=E.contentRuntime.loadCompiled(JSON.parse(raw.toString('utf8')));
 const inputsHash=E.contentCompile.hashInputs(inputs);
 assert.equal(checked.schema,5);
 assert.equal(checked.contentId,marker);
 assert.equal(checked.inputsHash,inputsHash);
 assert.equal(checked.showdownSha,identity.showdownSHA);
 const dex=E.dex.createDexLookup(),seedContent=E.contentRuntime.assembleContent(checked,dex);
 assert.deepEqual(seedContent.errors,[]);
 const contentIdentity=E.contentRuntime.validatedContentIdentity(seedContent.content);
 assert.equal(contentIdentity,checked.contentIdentity);
 assert.match(contentIdentity,/^[0-9a-f]{64}$/);
 const seedFingerprint=E.semantic.semanticFingerprint(seedContent.content);

 const mount=fs.mkdtempSync(path.join(scope,'g-if-author-'));
 physicalDirectory(mount);
 const dataDir=path.join(mount,'data','framework');
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const compiledFile=path.join(dataDir,'content.json'),inputFile=path.join(mount,'AUTHOR-INPUTS.json');
 const inputBytes=json(inputs),inputFileSHA256=sha(inputBytes);
 fs.writeFileSync(compiledFile,raw,{flag:'wx',mode:0o600});
 fs.writeFileSync(inputFile,inputBytes,{flag:'wx',mode:0o600});
 let reads=0,loaded=null,restoreDate=null,clockFault=null;
 const validWallMillis=Date.UTC(2020,0,2,12);
 const scopedFs=Object.freeze({readFileSync(file,encoding){
  assert.equal(file,compiledFile,'IF normal author mount has no alternate data path');
  assert.equal(encoding,'utf8');
  const before=physicalFile(file,true);
  assert.equal(sha(before),compiledSHA256);
  reads++;
  return before.toString('utf8');
 }});
 const evidence={schema:'g-if-ordinary-compiled-input-v1',family,selector,role:path.basename(mount),marker,sourceHashes,
  inputsHash,inputFileSHA256,compiledSHA256,contentIdentity,showdown:checked.showdownSha,parentBindingSHA256};
 return {
  root:mount,fs:scopedFs,crypto,evidence,initialContent:seedContent.content,
  seedGame(game){
   const member=E.speciesKey.toPersistentMember(E.memberFactory.createMember(
    {species:'Pidgey',level:5,id:earlyId,owner:game.player},seedContent.content,()=>0),seedContent.content);
   assert.equal(member.species,'pidgey');assert.equal(member.form,0);assert.equal(member.item,'');
   assert.deepEqual(member.moves.map(row=>row.id),['tackle']);
   const initial=E.state.newGame({content:seedContent.content,party:[member],player:game.player,money:12});
   Object.assign(game,initial);game.world.visitedMaps=[5,6,7];game.badges=Array(8).fill(true);
   assert.deepEqual(E.saveSchema.validateGameContent(game,seedContent.content),[]);
  },
  install(G){
   const original=Object.getOwnPropertyDescriptor(G,'Date');
   assert(typeof original?.value==='function'&&original.writable);
   const HostDate=original.value;
   class AuthorVmDate extends HostDate {
    static now(){
     if(!clockFault||clockFault.fired)return validWallMillis;
     clockFault.fired++;
     return clockFault.callback();
    }
   }
   Object.defineProperty(G,'Date',{...original,value:AuthorVmDate});
   restoreDate=()=>{
    assert.strictEqual(G.Date,AuthorVmDate);
    Object.defineProperty(G,'Date',original);
   };
  },
  withClockFault(callback,run){
   assert(restoreDate&&!clockFault);
   const fault=clockFault={callback,fired:0};
   try{run();assert.equal(fault.fired,1,'one actual VM world clock read must trigger the late fault');}
   finally{clockFault=null;}
  },
  stable(actual,game){
   assert.equal(reads,1);
   assert.equal(sha(physicalFile(compiledFile,true)),compiledSHA256);
   assert.equal(sha(physicalFile(inputFile,true)),inputFileSHA256);
   assert.strictEqual(actual,loaded);
   assert.notStrictEqual(actual,seedContent.content,'a donor assembly is never the runtime-owned snapshot');
   assert(Object.isFrozen(actual)&&Object.isFrozen(actual.mapMetadata.maps[5]));
   assert.equal(actual.mapMetadata.maps[5].environment,'cave');
   assert.equal(actual.meta.showdownSourceChecked,true);
   assert.equal(actual.meta.id,marker);
   assert.equal(E.contentRuntime.validatedContentIdentity(actual),contentIdentity);
   assert.equal(E.semantic.ownedImmutableFingerprint(actual),seedFingerprint);
   assert.deepEqual(E.saveSchema.validateGameContent(game,actual),[]);
  },
  confirm(actual,game){
   assert.equal(loaded,null);
   loaded=actual;this.stable(actual,game);
   fs.writeFileSync(path.join(mount,'CONSUMED.json'),json({...evidence,actualCompiledReadCount:reads}),{flag:'wx',mode:0o600});
  },
  dispose(){if(restoreDate)restoreDate();},
 };
}
module.exports={prepare};
