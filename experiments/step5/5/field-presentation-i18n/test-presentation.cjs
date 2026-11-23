'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('../e2-current-frontends/fixture.cjs');
const runtime=require('../../../../scripts/tests/final-production-runtime.cjs'),{E}=runtime.get();
const languages=['en','zh'],moves=['cut','rocksmash','strength','surf','flash','sweetscent'];
const names={cut:'Cut',rocksmash:'Rock Smash',strength:'Strength',surf:'Surf',flash:'Flash',sweetscent:'Sweet Scent',fly:'Fly',dig:'Dig',teleport:'Teleport'};
const used=(lang,name)=>lang==='zh'?'使用了'+name+'。':'Used '+name+'.';
const ask=(lang,name)=>lang==='zh'?'要使用'+name+'吗？':'Use '+name+'?';
const destAsk=(lang,move,name)=>lang==='zh'?'要使用'+move+'返回'+name+'吗？':'Use '+move+' to return to '+name+'?';
const output=process.env.PF_PRESENTATION_OUTPUT;assert(output);const selected=process.env.PF_PRESENTATION_CASE;assert(selected);const caseNames=[];function caseTest(name,body){caseNames.push(name);if(name===selected)test(name,body);}let sequence=0;const observations=[];
async function make(move='cut',lang='en',options={}){
 const dir=path.join(output,'fixture-'+(++sequence));fs.mkdirSync(dir);process.env.PF_E2_FRONT_ROOT=dir;
 const h=await fixture(['strength','fly','dig','teleport','rope'].includes(move)?'cut':move,{...options,nativeSetup(n,context,o){if(move==='strength')context.maps[5].events[1].name='Native strengthboulder';options.nativeSetup?.(n,context,o);},edit(game,content){
  if(['strength','fly','dig','teleport'].includes(move)){content.moves[move]={id:move,name:names[move],pp:20};game.party[0].moves=[{id:move,pp:20,maxpp:20,ppUps:0}];}
  if(move==='teleport'||move==='fly')content.mapMetadata.maps[5].outdoor=true;
  if(move==='rope')game.inventory=E.inventory.addItems(game.inventory,'escaperope',2,content.items,E.inventory.inventoryPolicy(content));
  options.edit?.(game,content);
 }});h.G.PSFlow.setLanguage(lang);return h;
}
async function run(h,move,entry='party',id='text-'+sequence){let result;const job=h.app.runFieldMove(id,{kind:'use',moveId:move,entry,memberId:h.state().party[0].id}).then(r=>{result=r;return r;});await h.pump(()=>result!==undefined);await job;return result;}
function stable(h,before){assert.equal(h.state().steps,before.steps);assert.deepEqual(h.state().inventory,before.inventory);assert.equal(h.saves.length,0);assert.deepEqual(h.nativeDraws,[]);}
function record(label,h,result){observations.push({label,result,messages:h.o.messages.slice(),draws:h.draws.slice(),steps:h.state().steps,saves:h.saves.length,stats:h.state().stats});}
test.after(()=>fs.writeFileSync(path.join(output,'OBSERVATIONS.json'),JSON.stringify(observations,null,2)+'\n',{flag:'wx'}));
for(const lang of languages)for(const move of moves)caseTest('native field text '+lang+'/'+move,async()=>{
 const h=await make(move,lang),before=structuredClone(h.state()),result=await run(h,move);
 assert(['completed','accepted'].includes(result.status),JSON.stringify(result));
 assert(h.o.messages.includes(move==='flash'?(lang==='zh'?'周围变亮了。':'The area became brighter.'):used(lang,names[move])),JSON.stringify(h.o.messages));
 if(move==='cut')assert.equal(h.state().stats.cut_count,before.stats.cut_count+1);
 if(move==='rocksmash')assert.equal(h.state().stats.rock_smash_count,before.stats.rock_smash_count+1);
 if(move==='strength')assert.equal(h.app.worldLocalState().strengthUsed,true);
 if(move==='surf'){assert.equal(h.state().stats.surf_count,before.stats.surf_count+1);assert.equal(h.state().world.surfing,true);assert.deepEqual([h.player.x,h.player.y],[3,2]);}
 if(move==='flash'){assert.equal(h.state().stats.flash_count,before.stats.flash_count+1);assert.equal(h.state().world.flashUsed,true);}
 if(result.status==='accepted')await h.battleAccepted();stable(h,before);record(lang+'/'+move,h,result);
});
for(const lang of languages)for(const answer of [0,1])caseTest('interaction actual native choice '+lang+'/'+answer,async()=>{
 const h=await make('strength',lang),before=structuredClone(h.state());let result;
 const original=h.app.runFieldMove;let calls=0;h.app.runFieldMove=function(...args){calls++;assert.equal(args[1].entry,'interaction');return Reflect.apply(original,this,args).then(r=>{result=r;return r;});};h.press('ok');await h.pump(()=>h.G.$gameMessage.isChoice()||result!==undefined);assert.equal(calls,1);assert.equal(h.G.$gameMessage.isChoice(),true,JSON.stringify(result));
 assert.equal(h.G.$gameMessage.allText(),ask(lang,'Strength'));assert.deepEqual(Array.from(h.G.$gameMessage._choices),lang==='zh'?['是','否']:['Yes','No']);assert.equal(h.G.$gameMessage._choiceDefaultType,1);assert.equal(h.G.$gameMessage._choiceCancelType,1);
 const late=h.G.$gameMessage._choiceCallback;h.G.$gameMessage.onChoice(answer);h.G.$gameMessage.clear();await h.pump(()=>result!==undefined);
 assert.equal(result.status,answer===0?'completed':'cancelled');assert.equal(h.app.worldLocalState().strengthUsed,answer===0);if(answer===1){late(0);assert.equal(h.app.worldLocalState().strengthUsed,false);}assert.deepEqual(h.draws,[]);stable(h,before);record(lang+'/choice/'+answer,h,result);
});
for(const lang of languages)for(const move of ['dig','teleport'])caseTest('actual target native name and cancellation '+lang+'/'+move,async()=>{
 const h=await make(move,lang),before=structuredClone(h.state()),mapId=move==='dig'?7:6;h.G.$dataMapInfos[5].name='Wrong current map';h.G.$dataMapInfos[mapId].name='Author Harbor';let result;
 h.G.PSFlow.runWorldTravel('return-name',{kind:move,memberId:h.state().party[0].id}).then(r=>{result=r;});await h.pump(()=>h.G.$gameMessage.isChoice());
 assert.equal(h.G.$gameMessage.allText(),destAsk(lang,names[move],'Author Harbor'));assert.deepEqual(Array.from(h.G.$gameMessage._choices),lang==='zh'?['是','否']:['Yes','No']);assert.equal(h.G.$gameMessage._choiceDefaultType,1);assert.equal(h.G.$gameMessage._choiceCancelType,1);
 const late=h.G.$gameMessage._choiceCallback;h.G.$gameMessage.onChoice(1);h.G.$gameMessage.clear();await h.pump(()=>result!==undefined);assert.equal(result.status,'cancelled');late(0);assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.state(),before);assert.deepEqual(h.draws,[]);stable(h,before);record(lang+'/'+move,h,result);
});
for(const lang of languages)for(const move of ['fly','rope'])caseTest('actual '+move+' message cancels before native reserve '+lang,async()=>{
 let h,token,seen=0;h=await make(move,lang,{onMessage(){if(!h)return;seen++;if(move==='fly')h.app.cancelWorldTravel('display-only');else h.app.cancelFieldItemHandoff(token);}});const before=structuredClone(h.state());let result;
 if(move==='fly')h.G.PSFlow.runWorldTravel('display-only',{kind:'fly',memberId:h.state().party[0].id,selection:{regionId:0,pointIndex:0,x:1,y:1,target:{mapId:6,x:1,y:2}}}).then(r=>{result=r;});
 else{const op=h.app.beginInventoryOperation(),view=h.app.inventorySnapshot(op),pocket=view.pockets.findIndex(rows=>rows.some(r=>r.item.id==='escaperope')),row=view.pockets[pocket].find(r=>r.item.id==='escaperope'),ticket=h.app.inventoryTicket(op,pocket+1,row.index),prepared=h.app.prepareFieldItemHandoff(op,'rope-display',ticket);assert.equal(prepared.status,'handoff',JSON.stringify(prepared));token=prepared.handoff.token;h.app.endInventoryOperation(op);h.app.runFieldItemHandoff(token).then(r=>{result=r;});}
 await h.pump(()=>result!==undefined);record(lang+'/'+move+'-terminal-before-assert',h,result);assert.equal(seen,1,JSON.stringify(result));assert(h.o.messages.includes(move==='fly'?used(lang,'Fly'):lang==='zh'?'使用了离洞绳。':'Used an Escape Rope.'));assert.equal(h.player.isTransferring(),false);assert.equal(h.G.$gameMap.mapId(),5);assert.deepEqual(h.draws,[]);stable(h,before);record(lang+'/'+move+'-display-only',h,result);
});
for(const lang of languages)caseTest('author literal move name remains display data '+lang,async()=>{const h=await make('cut',lang,{edit(_g,c){c.moves.cut.name='Author blade';}}),before=structuredClone(h.state()),r=await run(h,'cut');assert.equal(r.status,'completed');assert(h.o.messages.includes(used(lang,'Author blade')));assert.equal(h.state().stats.cut_count,1);stable(h,before);record(lang+'/literal',h,r);});
for(const lang of languages)caseTest('missing/raw-id name uses a localized generic '+lang,async()=>{const h=await make('cut',lang,{edit(_g,c){c.moves.cut.name='cut';}}),before=structuredClone(h.state()),r=await run(h,'cut');assert.equal(r.status,'completed');assert(h.o.messages.includes(used(lang,lang==='zh'?'场外招式':'the field move')));assert(!h.o.messages.some(t=>t.includes('[missing:')));stable(h,before);record(lang+'/generic',h,r);});
for(const lang of languages)caseTest('unnamed actual target never leaks map id '+lang,async()=>{const h=await make('dig',lang);h.G.$dataMapInfos[7].name='';let r;h.G.PSFlow.runWorldTravel('no-name',{kind:'dig',memberId:h.state().party[0].id}).then(x=>{r=x;});await h.pump(()=>h.G.$gameMessage.isChoice());assert.equal(h.G.$gameMessage.allText(),destAsk(lang,'Dig',lang==='zh'?'目的地':'the destination'));h.G.$gameMessage.onChoice(1);h.G.$gameMessage.clear();await h.pump(()=>r!==undefined);assert.equal(r.status,'cancelled');assert.deepEqual(h.draws,[]);record(lang+'/unnamed-target',h,r);});
caseTest('unknown language falls back through the ordinary translator to English',async()=>{const h=await make('cut','xx-unknown'),r=await run(h,'cut');assert.equal(r.status,'completed');assert(h.o.messages.includes('Used Cut.'));record('language-fallback',h,r);});
caseTest('custom translator missing a key receives built-in English fallback',async()=>{const h=await make('cut','zh'),tr=E.i18n.createTranslator({zh:{meta:{name:'Partial'},text:{}}},'zh',[]);h.G.PSFlow.translator=()=>tr;const r=await run(h,'cut');assert.equal(r.status,'completed');assert(h.o.messages.includes('Used Cut.'));record('key-fallback',h,r);});
for(const change of ['generation','content','scene'])caseTest('translation reentry '+change+' rejects old native output',async()=>{
 const h=await make('cut','zh'),before=structuredClone(h.state()),factory=h.G.PSFlow.translator;let calls=0;
 h.G.PSFlow.translator=function(){const tr=Reflect.apply(factory,this,[]);return {...tr,tOr(...args){calls++;if(change==='generation')h.app.stateReplacedByHost();else if(change==='content')h.G.PSFlow._content={...h.G.PSFlow._content};else h.G.SceneManager._scene=new h.G.Scene_Map();return tr.tOr(...args);}};};
 const r=await run(h,'cut');assert(calls>0);assert(!['completed','accepted'].includes(r.status),JSON.stringify(r));assert.equal(h.o.messages.length,0);assert.equal(h.state().stats.cut_count,before.stats.cut_count);assert.equal(h.G.$gameMap.event(1)._erased,false);assert.deepEqual(h.draws,[]);stable(h,before);record('reentry-'+change,h,r);
});
caseTest('cancelled translation result cannot emit or clean a newer owner',async()=>{const h=await make('cut','zh'),factory=h.G.PSFlow.translator;let nested,started=false;
 h.G.PSFlow.translator=function(){const tr=Reflect.apply(factory,this,[]);return {...tr,tOr(...args){if(!started){started=true;h.app.cancelFieldMove('old-text');h.G.PSFlow.translator=factory;h.app.runFieldMove('nested-text',{kind:'use',moveId:'cut',entry:'party',memberId:h.state().party[0].id}).then(r=>{nested=r;});}return tr.tOr(...args);}};};
 const old=await run(h,'cut','party','old-text');await h.pump(()=>nested!==undefined);record('translation-nested-terminal',h,{old,nested});assert.equal(old.status,'cancelled');assert.equal(nested.status,'refused');assert.equal(nested.reason,'operation-active');assert.equal(h.o.messages.length,0);assert.equal(h.state().stats.cut_count,0);assert.equal(h.G.$gameMap.event(1)._erased,false);
 const successor=await run(h,'cut','party','new-text');assert.equal(successor.status,'completed');assert.deepEqual(h.o.messages,['使用了Cut。']);assert.equal(h.state().stats.cut_count,1);assert.equal(h.G.$gameMap.event(1)._erased,true);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);record('successor',h,{old,nested,successor});});
caseTest('raw translator accessor is rejected without executing the getter',async()=>{const h=await make(),before=structuredClone(h.state());let getters=0,factories=0;const raw=Object.defineProperty({},'tOr',{get(){getters++;throw Error('must not execute getter');}});h.G.PSFlow.translator=()=>{factories++;return raw;};const r=await run(h,'cut');assert.equal(factories,1);assert.equal(getters,0);assert(!['completed','accepted'].includes(r.status));assert.equal(h.o.messages.length,0);assert.deepEqual(h.state(),before);assert.deepEqual(h.draws,[]);record('raw-translator-accessor',h,r);});
caseTest('raw target name accessor is rejected without executing the getter',async()=>{const h=await make('dig','zh'),before=structuredClone(h.state());let getters=0;Object.defineProperty(h.G.$dataMapInfos[7],'name',{get(){getters++;throw Error('must not execute getter');},configurable:true});let r;h.G.PSFlow.runWorldTravel('raw-target',{kind:'dig',memberId:h.state().party[0].id}).then(x=>{r=x;});await h.pump(()=>r!==undefined);assert.equal(getters,0);assert(!['completed','awaiting-arrival'].includes(r.status));assert.equal(h.o.messages.length,0);assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.state(),before);assert.deepEqual(h.draws,[]);record('raw-target-accessor',h,r);});
caseTest('weather-blocked Sweet Scent adds no text, effects, Session or random draw',async()=>{const h=await make('sweetscent','zh',{edit(g){g.world.weather.type='Rain';}}),before=structuredClone(h.state()),r=await run(h,'sweetscent');assert.equal(r.status,'completed');assert.equal(r.outcome,'weather-blocked');assert.equal(h.o.messages.length,0);assert.equal(h.o.flashes.length,0);assert.equal(h.o.sessionStarts.length,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.state(),before);record('weather-blocked',h,r);});
for(const lang of languages)for(const entry of ['party','shortcut'])caseTest('real '+entry+' handoff keeps native field text '+lang,async()=>{const h=await make('cut','en'),before=structuredClone(h.state()),execute=h.app.executeFieldShortcut;let executions=0;
 h.app.executeFieldShortcut=function(...args){executions++;h.G.PSFlow.setLanguage(lang);return Reflect.apply(execute,this,args);};
 const r=await h[entry]();assert.equal(r.status,'completed');assert.equal(executions,1);assert(h.calls.some(x=>x.kind==='prepare'&&x.args[0]===entry));assert(h.o.messages.includes(used(lang,'Cut')));assert.equal(h.state().stats.cut_count,before.stats.cut_count+1);assert.equal(h.G.$gameMap.event(1)._erased,true);assert.deepEqual(h.draws,[]);stable(h,before);record('real-'+entry+'-'+lang,h,r);
});



for(const change of ['content','scene'])caseTest('native travel message add reentry '+change+' cannot install old choices',async()=>{let h,adds=0;h=await make('dig','zh',{onMessage(){if(!h)return;adds++;if(change==='content')h.G.PSFlow._content={...h.G.PSFlow._content};else h.G.SceneManager._scene=new h.G.Scene_Map();}});let r;h.G.PSFlow.runWorldTravel('native-add-stale',{kind:'dig',memberId:h.state().party[0].id}).then(x=>{r=x;});await h.pump(()=>r!==undefined);assert.equal(adds,1);assert.notEqual(r.status,'awaiting-arrival');assert.equal(h.G.$gameMessage.isChoice(),false);assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.draws,[]);assert.equal(h.saves.length,0);record('native-add-'+change,h,r);});



for(const value of ['',17])caseTest('missing or nonstring move name '+JSON.stringify(value)+' uses generic without coercion',async()=>{const h=await make('cut','zh',{edit(_g,c){c.moves.cut.name=value;}}),r=await run(h,'cut');assert.equal(r.status,'completed');assert.deepEqual(h.o.messages,['使用了场外招式。']);assert.equal(h.state().stats.cut_count,1);assert.deepEqual(h.draws,[]);record('name-'+JSON.stringify(value),h,r);});

caseTest('absent translator uses the ordinary English default',async()=>{const h=await make('cut','zh');delete h.G.PSFlow.translator;const r=await run(h,'cut');assert.equal(r.status,'completed');assert.deepEqual(h.o.messages,['Used Cut.']);assert.deepEqual(h.draws,[]);record('absent-translator',h,r);});



caseTest('late native choice from canceled owner cannot resolve successor',async()=>{const h=await make('strength','zh');let old,next;h.app.runFieldMove('old-choice',{kind:'use',moveId:'strength',entry:'direct'}).then(r=>{old=r;});await h.pump(()=>h.G.$gameMessage.isChoice());const callback=h.G.$gameMessage._choiceCallback;assert.equal(typeof callback,'function');h.app.cancelFieldMove('old-choice');h.G.$gameMessage.clear();await h.pump(()=>old!==undefined);assert.equal(old.status,'cancelled');
 h.app.runFieldMove('new-choice',{kind:'use',moveId:'strength',entry:'direct'}).then(r=>{next=r;});await h.pump(()=>h.G.$gameMessage.isChoice());const current=h.G.$gameMessage._choiceCallback;assert.notEqual(current,callback);callback(0);assert.equal(next,undefined);assert.equal(h.app.worldLocalState().strengthUsed,false);assert.equal(h.app.saveBlocked,true);assert.equal(h.G.$gameMessage._choiceCallback,current);assert.equal(h.G.$gameMessage.isChoice(),true);h.G.$gameMessage.onChoice(1);h.G.$gameMessage.clear();await h.pump(()=>next!==undefined);assert.equal(next.status,'cancelled');assert.equal(h.app.worldLocalState().strengthUsed,false);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);assert.equal(h.saves.length,0);record('late-choice-successor',h,{old,next});});



caseTest('actual native SceneManager.goto during translation cannot emit old travel text',async()=>{const h=await make('dig','zh');let changed=false,result;const factory=h.G.PSFlow.translator;h.G.PSFlow.translator=function(){const tr=Reflect.apply(factory,this,[]);return {...tr,tOr(...args){if(!changed){changed=true;h.G.SceneManager.goto(h.G.Scene_Map);}return tr.tOr(...args);}};};h.G.PSFlow.runWorldTravel('native-goto',{kind:'dig',memberId:h.state().party[0].id}).then(r=>{result=r;});await h.pump(()=>result!==undefined);record('actual-native-goto',h,result);assert(changed);assert.deepEqual(h.o.messages,[]);assert.equal(h.G.$gameMessage.isChoice(),false);assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.draws,[]);assert.equal(h.saves.length,0);assert.notEqual(result.status,'awaiting-arrival');});

assert(caseNames.includes(selected),'unknown explicit presentation case: '+selected);
