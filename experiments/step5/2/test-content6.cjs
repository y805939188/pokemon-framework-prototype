'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/engine.cjs');
const base=()=>({manifest:{schema:1,id:'test',title:'test'},sources:[{id:'local',kind:'author-placeholder',status:'placeholder',description:'test',license:'test',ref:'test',usedFor:['items']}],species:[],overlays:[]});
const item=(id='medicine',extra={})=>({id,source:'local',...extra});
test('P52-01/32 FR722: absent optional files retain hash; explicit defaults and independent plural',()=>{
 const input=base(),hash=E.contentCompile.hashInputs(input);assert.equal(hash,E.contentCompile.hashInputs({...input,items:undefined,shops:undefined}));
 const r=E.contentCompile.compileContent({...input,items:[item('medicine',{name:'Review',price:301,sellPrice:0})],shops:[{id:'mart',stock:['medicine'],source:'local'}]});assert.equal(r.ok,true);assert.equal(r.data.items[0].namePlural,'Unnamed');assert.equal(r.data.items[0].sellPrice,0);assert.equal(r.data.items[0].pocket,1);assert.notEqual(hash,r.data.inputsHash);
});
test('P52-28/32 FR188: all author fields reject invalid and ambiguous identities',()=>{
 for(const data of [{pocket:0},{pocket:9},{price:-1},{price:1.2},{price:Infinity},{fieldUse:'constructor'},{consumable:1},{effect:{family:'x',parameters:{n:NaN}}},{fieldUse:'tm'}])assert.equal(E.contentCompile.compileContent({...base(),items:[item('x',data)]}).ok,false,JSON.stringify(data));
 assert.equal(E.contentCompile.compileContent({...base(),items:[item('x',{battleId:'potion'}),item('y',{battleId:'potion'})]}).ok,false);
 assert.equal(E.contentCompile.compileContent({...base(),items:[item('x',{legacyIds:['y']}),item('y')]}).ok,false);
});
test('P52-32 FR188: forbidden item source rejected before any Dex call, including tampered compiled content',()=>{
 const input={...base(),items:[item()]},good=E.contentCompile.compileContent(input);assert.equal(good.ok,true);
 const changed=structuredClone(good.data);changed.sources[0].usageCheck={checkedOn:'2026-10-23',checkedBy:'test',conditions:'denied',decision:'not-allowed'};
 let calls=0;const dex=new Proxy({},{get(){calls++;throw Error('Dex must remain cold');}});const out=E.contentRuntime.assembleContent(changed,dex);assert.ok(out.errors.length);assert.equal(calls,0);
});
test('P52-09/19/32: empty item catalog remains empty and unsafe own ID keeps identity',()=>{
 const empty=E.contentCompile.compileContent({...base(),items:[]});const a=E.contentRuntime.assembleContent(empty.data,{sha(){throw Error('cold');}});assert.deepEqual(a.content.items,{});
 const r=E.contentCompile.compileContent({...base(),items:[item('__proto__',{fieldUse:'tr',move:'tackle'})]});assert.equal(r.ok,true);
});
test('P52-01/32 FR722: PBS Item subset enforces enum spelling and keeps report for unsupported fields',()=>{
 const r=E.pbsItems.importPbsItems('[REVIEW]\nName = Review\nPocket = 2\nPrice = 100\nFieldUse = TR\nMove = TACKLE\nUnknownField = keep-report\n','local');assert.equal(r.ok,true);assert.equal(r.items[0].fieldUse,'tr');assert.equal(r.items[0].move,'tackle');assert.equal(r.later[0].field,'UnknownField');
 for(const value of ['0','tr','constructor'])assert.equal(E.pbsItems.importPbsItems('[X]\nFieldUse = '+value,'local').ok,false);
 assert.equal(E.pbsItems.importPbsItems('[X]\nPocket = 0','local').ok,false);
});
test('P52-01/04: boolean and array settings validate independently; capabilities cannot enter settings',()=>{
 for(const input of [{BAG_POCKET_SLOTS:[1]},{BAG_AUTO_SORT:Array(8).fill(1)},{USE_MULTIPLE_STAT_ITEMS_AT_ONCE:1},{allowHeldItemSources:true}])assert.ok(E.config.checkOverrides(input).length);
 const c=E.config.resolveConfig({BAG_POCKET_SLOTS:[1,2,-1,-1,-1,-1,-1,-1],USE_MULTIPLE_STAT_ITEMS_AT_ONCE:false});assert.equal(c.BAG_POCKET_SLOTS[1],2);assert.equal(c.USE_MULTIPLE_STAT_ITEMS_AT_ONCE,false);c.BAG_POCKET_SLOTS[0]=7;assert.equal(E.config.resolveConfig().BAG_POCKET_SLOTS[0],-1);
});
test('P52-01/21: shop override slots validate without interpreting buy/sell transactions',()=>{
 const b={...base(),items:[item('x')],shops:[{id:'mart',stock:['x'],source:'local',overrides:{x:{buy:0,sell:-1}}}]};const r=E.contentCompile.compileContent(b);assert.equal(r.ok,true);assert.deepEqual(r.data.shops[0].overrides,{x:{buy:0,sell:-1}});
 for(const slots of [{buy:-2,sell:0},{buy:1.5,sell:1},{buy:0,sell:Infinity}])assert.equal(E.contentCompile.compileContent({...b,shops:[{...b.shops[0],overrides:{x:slots}}]}).ok,false);
});
test('P52-32: malformed compiled optional files return located errors with a cold Dex',()=>{
 const good=E.contentCompile.compileContent(base()).data;for(const patch of [{items:{}},{shops:{}},{items:[null]}]){let calls=0;const dex=new Proxy({},{get(){calls++;throw Error('cold');}});const r=E.contentRuntime.assembleContent({...good,...patch},dex);assert.ok(r.errors.length);assert.equal(calls,0);}
});
test('P52-32: PBS Item CLI rejects denied source before opening a missing file, and writes validated author report',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),root=fs.mkdtempSync(path.join(os.tmpdir(),'p52-pbs-'));try{const input=base();for(const [k,v]of Object.entries(input))fs.writeFileSync(path.join(root,k+'.json'),JSON.stringify(v));const pbs=path.join(root,'items.txt'),report=path.join(root,'report.json');fs.writeFileSync(pbs,'[REVIEW]\nPrice = 123\nPocket = 2\n');const cli=path.resolve(__dirname,'../../../js/engine/build/content-cli.cjs');const run=file=>spawnSync(process.execPath,[cli,'import-pbs-items','--src='+root,'--source=local','--file='+file,'--report='+report],{encoding:'utf8'});const okay=run(pbs);assert.equal(okay.status,0,okay.stderr);assert.equal(JSON.parse(fs.readFileSync(report)).items[0].price,123);fs.unlinkSync(report);input.sources[0].usageCheck={checkedOn:'2026-10-23',checkedBy:'test',conditions:'test deny',decision:'not-allowed'};fs.writeFileSync(path.join(root,'sources.json'),JSON.stringify(input.sources));const denied=run(path.join(root,'missing'));assert.equal(denied.status,1);assert.match(denied.stderr,/may not be used/);assert.doesNotMatch(denied.stderr,/cannot read/);assert.equal(fs.existsSync(report),false);}finally{fs.rmSync(root,{recursive:true});}
});
