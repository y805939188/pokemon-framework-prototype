'use strict';
// Clean-room formal-spec-derived expectations, not Ruby observations. No build, engine or GUI required.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../..');
require('../../../scripts/tests/ts-source-loader.cjs');
const sourceUrl=file=>pathToFileURL(file).href;
const imported=import(sourceUrl(path.join(root,'src/framework/content/pbs-import.ts')));
const regional=import(sourceUrl(path.join(root,'src/framework/content/pbs-regional-dex.ts')));
const csvModule=import(sourceUrl(path.join(root,'src/framework/content/pbs-progression.ts')));
const methods=require('./fixtures/pbs7/method-cases.json');
const required='GrowthRate=Medium\nBaseExp=51\nEVs=SPEED,1\nMoves=0,TACKLE,7,GROWL';
const base=(name='BASE',extra='')=>`[${name}]\n${required}\n${extra}\n`;
const file=(name,text)=>({file:name,read:()=>text});
const goodGate=id=>id==='author'?null:'unregistered source';
async function bundle(overrides={}){return (await imported).importPbsBundle({sourceId:'author',sourceProblem:goodGate,baseFiles:[file('pokemon.txt',base())],...overrides});}
function rejected(r,matcher){assert.equal(r.ok,false);assert.deepEqual(r.species,[]);assert.deepEqual(r.identities,[]);assert.deepEqual(r.texts,[]);assert.equal(r.regionalDex,undefined);if(matcher)assert.ok(r.errors.some(e=>matcher.test(e.message)),JSON.stringify(r.errors));}
const regionalOptions=(text,extra={})=>({files:[file('regional_dexes.txt',text)],sourceId:'author',sourceProblem:goodGate,resolveSpecies:s=>({BASE:'base',PEER:'peer',NIDORANmA:'nidoranma',NIDORANfE:'nidoranfe'})[s]??null,regionNameKeys:[{id:0,nameKey:'region.first'}],...extra});

test('B03 all 64 exact methods retain typed parameters and declared order',async()=>{
  assert.equal(methods.length,64);
  const text=base('BASE',methods.map(m=>`Evolution=PEER,${m.method},${m.pbs}`).join('\n'))+base('PEER');
  const r=await bundle({baseFiles:[file('all-methods.txt',text)]});assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.deepEqual(r.species[0].evolutions,methods.map(m=>({target:'peer',method:m.method,...(m.kind==='none'?{}:{parameter:m.expected})})));
});

test('B03 each of 30 integer methods, both spellings, base and explicit form: strict u domain',async()=>{
  const integers=methods.filter(m=>m.kind==='integer');assert.equal(integers.length,30);
  for(const m of integers)for(const spelling of ['Evolution','Evolutions'])for(const form of [false,true]){
    for(const [token,expected] of [['0',0],['01',1],['010',10],['0009007199254740991',9007199254740991]]){
      const field=`${spelling}=PEER,${m.method},${token}`,r=await bundle({baseFiles:[file('base.txt',base('BASE',form?'':field)+base('PEER'))],formFiles:form?[file('forms.txt',`[BASE,1]\n${field}`)]:[],resolveFormShowdownId:()=> 'basemapped'});
      assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.species[form?2:0].evolutions[0].parameter,expected);
    }
    for(const token of ['-1','-0','+1','1.0','1e2','1x','0x10','1_000','"1"','9007199254740992','9007199254740993','18446744073709551616','']){
      const field=`${spelling}=PEER,${m.method},${token}`,r=await bundle({baseFiles:[file('base.txt',base('BASE',form?'':field)+base('PEER'))],formFiles:form?[file('forms.txt',`[BASE,1]\n${field}`)]:[],resolveFormShowdownId:()=> 'basemapped'});
      rejected(r);assert.ok(r.errors.some(e=>e.file===(form?'forms.txt':'base.txt')&&e.path.endsWith('.'+spelling)),JSON.stringify(r.errors));
      if(token.startsWith('9')||token.startsWith('18'))assert.ok(r.errors.some(e=>/unsupported-integer-representation/.test(e.message)));
    }
  }
});

test('B03 no extra level/count/Beauty/Location/Region bounds and no catalog gate for integers',async()=>{
  const fields=['Level','Beauty','BattleDealCriticalHit','Location','Region','Event','EventAfterDamageTaken'].map(m=>`Evolution=PEER,${m},9007199254740991`).join('\n');
  const r=await bundle({baseFiles:[file('bounds.txt',base('BASE',fields)+base('PEER'))]});assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.ok(r.species[0].evolutions.every(e=>e.parameter===9007199254740991));
});

test('B04 last plural group precedes every singular row regardless of interleaving; singular fixed tail ignored',async()=>{
  const fields='Evolution=THIRD,Level,3\nEvolutions=PEER,Level,8\nEvolution=PEER,Trade,anything,unconsumed\nEvolutions=PEER,Level,2';
  const r=await bundle({baseFiles:[file('order.txt',base('BASE',fields)+base('PEER')+base('THIRD'))]});assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.deepEqual(r.species[0].evolutions,[{target:'peer',method:'Level',parameter:2},{target:'third',method:'Level',parameter:3},{target:'peer',method:'Trade'}]);
  assert.deepEqual(r.records[0].overridden,['Evolutions']);
});

test('B04 unknown and missing required evolution atoms are located, internal empty parameter is not shifted',async()=>{
  for(const field of ['Evolution=PEER,Constructor,1','Evolution=PEER,Level','Evolutions=PEER,Level,','Evolutions=PEER,Level,,PEER,Level,1','Evolution=UNKNOWN,Level,1','Evolution=PEER,HasMove,TAC!KLE','Evolutions=']){
    const r=await bundle({baseFiles:[file('bad.txt',base('BASE',field)+base('PEER'))]});rejected(r);assert.equal(r.errors[0].file,'bad.txt');assert.equal(r.errors[0].line,6);assert.ok(/\.(Evolution|Evolutions)$/.test(r.errors[0].path));
  }
});

test('B07 base files then form files then regional files, source gate precedes all readers and form adapter',async()=>{
  const events=[];
  const r=await bundle({sourceProblem:id=>{events.push('gate:'+id);return null;},baseFiles:[{file:'b1',read(){events.push('b1');return base('BASE');}},{file:'b2',read(){events.push('b2');return base('PEER');}}],formFiles:[{file:'f1',read(){events.push('f1');return '[BASE,1]';}}],resolveFormShowdownId:()=>{events.push('form-map');return 'basemapped';},regionalFiles:[{file:'r1',read(){events.push('r1');return '[0]\nBASE,PEER';}}],regionNameKeys:[{id:0,nameKey:'region.first'}]});
  assert.equal(r.ok,true,JSON.stringify(r.errors));assert.deepEqual(events,['gate:author','b1','b2','f1','form-map','gate:author','r1']);
  assert.deepEqual(r.species.map(s=>[s.id,s.form??0]),[['base',0],['peer',0],['base',1]]);
  let read=0,mapped=0;
  for(const sourceId of ['', 'unknown']){const bad=await bundle({sourceId,baseFiles:[{file:'never',read(){read++;return base();}}],formFiles:[file('forms','[BASE,1]')],resolveFormShowdownId:()=>{mapped++;return 'basemapped';}});rejected(bad);}
  assert.equal(read,0);assert.equal(mapped,0);
});

test('B07 forms inherit scalar/whole lists independently; explicit fields replace whole collections',async()=>{
  const r=await bundle({baseFiles:[file('base',base('BASE','Types=NORMAL,FIRE,WATER\nAbilities=A,B,C\nHiddenAbilities=H\nTutorMoves=TACKLE,GROWL\nFlags=DefaultForm_2\nHeight=6.9\nWeight=0.7\nFormName=Original\nCategory=Seed\nPokedex=Alpha, Beta\nEvolution=PEER,Level,16')+base('PEER'))],formFiles:[file('forms','[BASE,1]\nFormName=\n[BASE,2]\nMoves=9,GROWL\nTypes=WATER\nTutorMoves=GROWL\nHeight=1.25\nPokedexForm=0')],resolveFormShowdownId:(_,n)=>'baseform'+n});
  assert.equal(r.ok,true,JSON.stringify(r.errors));const [b,,f1,f2]=r.species;
  assert.deepEqual(f1.learnset,b.learnset);assert.deepEqual(f1.evolutions,b.evolutions);assert.deepEqual(f1.types,['normal','fire','water']);assert.deepEqual(f1.abilities,['a','b','c']);assert.deepEqual(f1.hiddenAbilities,['h']);assert.equal(f1.heightDm,69);assert.equal(f1.weightHg,7);assert.equal(f1.formName,'');assert.equal(f1.pokedexForm,1);assert.equal(f2.pokedexForm,0);assert.equal(f2.heightDm,13);assert.deepEqual(f2.learnset,[{level:9,move:'growl'}]);assert.deepEqual(f2.tutorMoves,['growl']);assert.deepEqual(f2.types,['water']);
  f1.learnset[0].move='changed';f1.evolutions[0].parameter=0;f1.abilities.push('d');f1.flags.push('x');f1.evYield.spe=3;
  assert.equal(b.learnset[0].move,'tackle');assert.equal(f2.evolutions[0].parameter,16);assert.deepEqual(b.abilities,['a','b','c']);assert.deepEqual(f2.flags,['DefaultForm_2']);assert.equal(b.evYield.spe,1);
  assert.deepEqual(r.identities[2],{symbol:'BASE_1',species:'base',form:1,showdownId:'baseform1'});
});

test('B07 required PBS empty properties reject instead of becoming JSON []; omitted form fields inherit',async()=>{
  for(const field of ['Moves','Evolutions','TutorMoves','Types','Abilities','HiddenAbilities','Flags']){
    const r=await bundle({formFiles:[file('forms',`[BASE,1]\n${field}=`)],resolveFormShowdownId:()=> 'basemapped'});rejected(r);assert.equal(r.errors[0].file,'forms');assert.equal(r.errors[0].line,2);assert.equal(r.errors[0].path,`[BASE,1].${field}`);
  }
});

test('B07/B19 cross-file duplicates, original-symbol collisions, Showdown collisions and unknown bases reject atomically',async()=>{
  for(const overrides of [
    {baseFiles:[file('one',base('BASE')),file('two',base('BASE'))]},
    {baseFiles:[file('one',base('BASE')),file('two',base('base'))]},
    {baseFiles:[file('one',base('A_B')+base('AB'))]},
    {formFiles:[file('one','[BASE,1]'),file('two','[BASE,01]')],resolveFormShowdownId:()=> 'basemapped'},
    {baseFiles:[file('one',base('BASE')+base('BASE_1'))],formFiles:[file('two','[BASE,1]')],resolveFormShowdownId:()=> 'basemapped'},
    {formFiles:[file('forms','[base,1]')],resolveFormShowdownId:()=> 'basemapped'},
    {formFiles:[file('forms','[BASE,0]')]},{formFiles:[file('forms','[BASE,1000]')]},
  ])rejected(await bundle(overrides));
});

test('B07 form Showdown mapping is explicit and source-gated; invalid mapping never guessed from name/form',async()=>{
  for(const resolveFormShowdownId of [undefined,()=>null,()=>'',()=> 'BASE-Alola'])rejected(await bundle({formFiles:[file('forms','[BASE,1]')],resolveFormShowdownId}),/explicit valid Showdown form id mapping/);
  rejected(await bundle({formFiles:[file('forms','[BASE,1]')],resolveFormShowdownId:()=> 'base'}),/collides/);
  const r=await bundle({formFiles:[file('forms','[BASE,1]')],resolveFormShowdownId:()=> 'basealola'});assert.equal(r.ok,true);assert.equal(r.species[1].showdownId,'basealola');
});

test('WP04 dimensions f domain, round/max, first fixed token, and old quoted field rejection',async()=>{
  const {importPbsSpecies}=await imported;
  for(const [token,expected] of [['.',1],['0',1],['.7',7],['6.9',69],['1.25',13],['1.',10],['1.0,junk',10]]){const r=importPbsSpecies(base('BASE',`Height=${token}\nWeight=${token}`),'author');assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.species[0].heightDm,expected);assert.equal(r.species[0].weightHg,expected);}
  for(const token of ['','-1.0','+1.0','1e2','1..0','"1.0"']){const r=importPbsSpecies(base('BASE',`Height=${token}`),'author');assert.equal(r.ok,false);assert.deepEqual(r.species,[]);}
  assert.equal(importPbsSpecies(base('BASE','Name="Name"'),'author').ok,false);
});

test('WP04 q/ordinary line preprocessor, raw text provenance and empty form name remain distinct',async()=>{
  const r=await bundle({baseFiles:[file('text',base('BASE','Category=Seed\nPokedex= Alpha, Beta #Gamma\nFormName=Base'))],formFiles:[file('forms','[BASE,1]\nPokedex=\nCategory=\nFormName=')],resolveFormShowdownId:()=> 'basemapped'});assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.deepEqual(r.texts.map(t=>[t.key,t.text,t.file,t.source]),[['species.base.category','Seed','text','author'],['species.base.entry','Alpha, Beta','text','author'],['species.base.form1.category','','forms','author'],['species.base.form1.entry','','forms','author']]);
  assert.equal(r.species[1].entryKey,'species.base.form1.entry');assert.equal(r.species[1].formName,'');
  const absent=await bundle({formFiles:[file('forms','[BASE,1]')],resolveFormShowdownId:()=> 'basemapped'});assert.equal(Object.hasOwn(absent.species[1],'formName'),false);
  rejected(await bundle({baseFiles:[file('syntax',base('BASE',' # indented comment'))]}),/indented comment/);
});

test('WP04 local Flags token markers preserve the documented nonfinal/final distinction',async()=>{
  const {progressionCsv}=await csvModule;const marked=String.raw`\"Alpha,Beta\"`;
  assert.deepEqual(progressionCsv(marked),[marked]);assert.deepEqual(progressionCsv(marked+',Other'),['Alpha,Beta','Other']);
  const r=await bundle({baseFiles:[file('flags',base('BASE',`Flags=${marked},Other`))]});assert.equal(r.ok,true);assert.deepEqual(r.species[0].flags,['Alpha,Beta','Other']);
  assert.deepEqual(progressionCsv('A,M,,B,Level,1'),['A','M','','B','Level','1']);
});

test('B06/B29 regional multi-file [1] then [0], explicit empty section and author names produce normal JSON',async()=>{
  const {importPbsRegionalDex}=await regional;
  const r=importPbsRegionalDex(regionalOptions('',{files:[file('first','[1]\npeer,base'),file('second','[0]')],regionNameKeys:[{id:0,nameKey:'region.shared'},{id:1,nameKey:'region.shared'}]}));assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.deepEqual(r.regionalDex,{source:'author',regions:[{id:0,nameKey:'region.shared',species:[]},{id:1,nameKey:'region.shared',species:['peer','base']}]});assert.equal(Object.hasOwn(r.regionalDex,'national'),false);assert.equal(Object.hasOwn(r.regionalDex,'transitions'),false);
  assert.deepEqual(importPbsRegionalDex(regionalOptions('',{regionNameKeys:[]})).regionalDex,{source:'author',regions:[]});
});

test('B06 original symbols and dedicated uppercase/NIDORAN normalization, exact JSON ids remain untouched',async()=>{
  const {importPbsRegionalDex}=await regional;
  const r=importPbsRegionalDex(regionalOptions('[0]\n nidoranma,Nidoranfe,base'));assert.equal(r.ok,true);assert.deepEqual(r.regionalDex.regions[0].species,['nidoranma','nidoranfe','base']);
  const bad=importPbsRegionalDex(regionalOptions('[0]\nFoo',{resolveSpecies:s=>s==='Foo'?'foo':null}));assert.equal(bad.ok,false);assert.match(bad.errors[0].message,/FOO/);
});

test('B06 regional missing initial section, duplicates incl empty, gaps and unknown symbols reject with file/line',async()=>{
  const {importPbsRegionalDex}=await regional;
  for(const text of ['BASE','[0]\nBASE,base','[0]\n[0]','[1]\nBASE','[0]\n[2]','[-1]','[0]\nUNKNOWN','[0]\nBASE,,PEER']){const r=importPbsRegionalDex(regionalOptions(text));assert.equal(r.ok,false,text);assert.equal(r.regionalDex,undefined);assert.ok(r.errors.some(e=>e.file==='regional_dexes.txt'&&e.line>=1),JSON.stringify(r.errors));}
});

test('B29 names are dense complete explicit array; missing/invalid/duplicate/unknown/source rejected',async()=>{
  const {importPbsRegionalDex}=await regional;
  for(const regionNameKeys of [[],undefined,null,[{id:0,nameKey:''}],[{id:'0',nameKey:'region.first'}],[{id:0,nameKey:'Bad Key'}],[{id:0,nameKey:'region.first'},{id:0,nameKey:'region.first'}],[{id:0,nameKey:'region.first'},{id:1,nameKey:'region.second'}],new Array(1)]){const r=importPbsRegionalDex(regionalOptions('[0]\nBASE',{regionNameKeys}));assert.equal(r.ok,false,JSON.stringify(regionNameKeys));assert.equal(r.regionalDex,undefined);}
  let reads=0,resolves=0;const r=importPbsRegionalDex(regionalOptions('[0]',{sourceProblem:()=> 'not-allowed',files:[{file:'never',read(){reads++;return '[0]';}}],resolveSpecies:()=>{resolves++;return 'base';}}));assert.equal(r.ok,false);assert.equal(reads,0);assert.equal(resolves,0);
});

test('atomic proposal with regional rejection, file read failure or syntax rejection exposes no usable prefix',async()=>{
  rejected(await bundle({regionalFiles:[file('region','[0]\nUNKNOWN')],regionNameKeys:[{id:0,nameKey:'region.first'}]}));
  rejected(await bundle({baseFiles:[file('base',base()),{file:'unreadable',read(){throw Error('test I/O failure');}}]}),/test I\/O failure/);
  rejected(await bundle({baseFiles:[file('base',base('BASE','Category=still diagnostic\nnot a property'))]}),/invalid property syntax/);
});

test('legacy single-text API keeps old shape/valid-prefix diagnostics and level-zero extension',async()=>{
  const {importPbsSpecies}=await imported;
  const r=importPbsSpecies(base('BASE')+'[BAD]\nName="Bad"\n'+required+'\n'+base('PEER'),'author');assert.equal(r.ok,false);assert.deepEqual(r.species.map(s=>s.id),['base','peer']);assert.equal(r.errors[0].path,'[BAD].Name');
  assert.deepEqual(Object.keys(r.species[0]).sort(),['id','showdownId','nameKey','growth','baseExp','evYield','catchRate','happiness','learnset','source'].sort());
  assert.equal(r.species[0].learnset[0].level,0);assert.equal(r.texts,undefined);
});

test('B06/B21 complete synthetic PBS files equal independently authored species/region JSON proposals',async()=>{
  const fixture=path.join(__dirname,'fixtures/pbs7'),input=name=>({file:name,read:()=>fs.readFileSync(path.join(fixture,name),'utf8')});
  const r=await bundle({baseFiles:[input('pokemon.txt')],formFiles:[input('pokemon_forms.txt')],resolveFormShowdownId:()=> 'baseform1',regionalFiles:[input('regional-first.txt'),input('regional-second.txt')],regionNameKeys:[{id:0,nameKey:'region.shared'},{id:1,nameKey:'region.shared'}]});
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.deepEqual(r.species,JSON.parse(fs.readFileSync(path.join(fixture,'species.json'),'utf8')));
  assert.deepEqual(r.regionalDex,JSON.parse(fs.readFileSync(path.join(fixture,'regional-dex.json'),'utf8')));
  assert.deepEqual(r.texts.map(t=>[t.key,t.text]),[['species.base.category','Seed'],['species.base.entry','Alpha, Beta'],['species.base.form1.category','Alternate'],['species.base.form1.entry','An alternate, form']]);
});

test('legacy standalone target references validate symbol syntax and defer catalog existence to compile',async()=>{
  const {importPbsSpecies}=await imported;
  const r=importPbsSpecies(base('BASE','Evolution=EXTERNAL_SPECIES,Level,16'),'author');assert.equal(r.ok,true,JSON.stringify(r.errors));assert.deepEqual(r.species[0].evolutions,[{target:'external-species',method:'Level',parameter:16}]);
  assert.equal(importPbsSpecies(base('BASE','Evolution=EXTERNAL!SPECIES,Level,16'),'author').ok,false);
  rejected(await bundle({baseFiles:[file('bundle',base('BASE','Evolution=EXTERNAL_SPECIES,Level,16'))]}),/unknown/);
});
