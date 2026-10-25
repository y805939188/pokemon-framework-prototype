'use strict';
// Formal-spec-derived expectations: WP62 PD06–16/25–34, U05-HAB, R4/R6-PD; WP66-B §5–7; approved r3 §8.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fixtures/pokedex/support.cjs');
const query=F.load('pokedex-query'),rules=F.load('pokedex');
const ids=rows=>rows.map(r=>r.species);

test('P53-33 PD06/08/09 eligibility, separate completion flags and national-only layout', async () => {
  const q=await query,t=F.layout(),state=F.dex(t,{seen:['a','b'],owned:['a']});
  assert.deepEqual(q.dexAccessibleRegions(state,t),[0]);
  assert.deepEqual(q.dexRegionCounts(state,t,0),{status:'ok',seen:2,owned:1,allSeen:false,allOwned:false});
  const {unlocked}=q.planDexUnlock(state,t,999,true); assert.deepEqual(unlocked,[true,false,true]);
  assert.deepEqual(q.planDexUnlock(state,t,-1,true).unlocked,unlocked);
  assert.throws(()=>q.planDexUnlock(state,t,0.5,true));
  const full=F.dex(t,{seen:['a','b','c','d'],owned:['a']}); assert.equal(q.dexRegionCounts(full,t,0).allSeen,true); assert.equal(q.dexRegionCounts(full,t,0).allOwned,false);
  const only={national:['a'],regions:[]},d=F.dex(only,{seen:['a'],unlocked:[true]});
  assert.deepEqual(q.dexAccessibleRegions(d,only),[-1]); assert.equal(d.view.region,-1);
});
test('P53-33 PD07/10/22 current-region branch ignores unlock, national short-circuits unknown identity', async () => {
  const q=await query,t=F.layout(),state=F.dex(t,{seen:['c'],unlocked:[false,false,false]});
  assert.deepEqual(q.dexAccessibleRegions(state,t),[]);
  assert.deepEqual(q.dexAccessibleRegions(state,t,{useCurrentRegion:true,currentRegion:1}),[1]);
  assert.deepEqual(q.dexAccessibleRegions(state,t,{useCurrentRegion:true,currentRegion:99}),[-1]);
  assert.equal(q.dexInUnlockedRegion(state,t,'unknown'),false);
  state.unlocked[2]=true; assert.equal(q.dexInUnlockedRegion(state,t,'unknown'),true);
});
test('P53-33 PD23 access refresh is caller-local and menu gates hasDex/one/many separately', async () => {
  const q=await query,t=F.layout(),state=F.dex(t,{seen:['a','c'],unlocked:[true,true,false]});
  assert.deepEqual(q.refreshDexAccess([],state,t,{},false),[]); assert.deepEqual(q.refreshDexAccess([],state,t,{}),[0,1]);
  assert.equal(q.dexMenuEntry({...state,hasDex:false},[0]),'hidden'); assert.equal(q.dexMenuEntry(state,[]),'hidden');
  assert.equal(q.dexMenuEntry(state,[0]),'list'); assert.equal(q.dexMenuEntry(state,[0,1]),'regions');
  assert.equal(q.dexMenuEntry(state,[0,1],true),'list');
});
test('P53-33 PD11 empty regional data reports unavailable while the list falls back nationally', async () => {
  const q=await query,c=F.catalog({national:['a','b','c'],regions:[{id:0,species:[]}]}),state=F.dex(c.layout,{seen:['c']});
  assert.equal(q.dexRegionMembers(c.layout,0),null); assert.equal(q.dexRegionCounts(state,c.layout,0).status,'unavailable');
  assert.equal(q.dexRegionalNumber(c.layout,'c',0),0); assert.equal(q.dexRegionLength(c.layout,0),0);
  assert.deepEqual(ids(q.dexList(state,c,0,0,F.options).rows),['a','b','c']);
});
test('P53-33 PD25 summary stops on the first unlocked region; brief entry keeps looking', async () => {
  const q=await query,t=F.layout(),state=F.dex(t,{unlocked:[true,true,false]});
  assert.deepEqual(q.dexEntryNumber(state,t,'e','summary'),{region:0,number:null,text:'???'});
  assert.deepEqual(q.dexEntryNumber(state,t,'e','brief'),{region:1,number:2,text:'002'});
  state.unlocked[2]=true; assert.equal(q.dexEntryNumber(state,t,'e','summary').text,'005');
});
test('P53-33 GR7-M14-001 complete entry -1 uses last region, and its offset key stays -1', async () => {
  const q=await query,t=F.layout(),state=F.dex(t,{view:{region:-1,mode:0,indices:[0,0,0]},unlocked:[true,true,true]});
  assert.equal(q.dexCompleteEntryNumber(state,t,'e',F.options).text,'002');
  assert.equal(q.dexEntryNumber(state,t,'e','brief').text,'005');
  assert.equal(q.dexCompleteEntryNumber(state,t,'c',{...F.options,offsets:[-1]}).text,'000');
  assert.equal(q.dexCompleteEntryNumber(state,t,'c',{...F.options,offsets:[1]}).text,'001');
  state.view.region=0;
  assert.equal(q.dexCompleteEntryNumber(state,t,'e',{...F.options,currentRegion:1}).text,'???');
  assert.equal(q.dexCompleteEntryNumber(state,t,'e',{...F.options,useCurrentRegion:true,currentRegion:1}).text,'002');
  assert.equal(q.dexCompleteEntryNumber({...state,view:{...state.view,region:-1}},t,'e',F.options).sceneRegion,0);
});
test('P53-33/36 F2-01 complete entry → Area resolves all ten current-region options without changing -1 numbering', async () => {
  const q=await query,{dexState:b}=require('../../../js/engine/build/core.cjs'),t=F.layout();
  const state=F.freeze(F.dex(t,{seen:['e'],owned:['e'],view:{region:-1,indices:[0,0,0],mode:0}})),before=JSON.stringify(state);
  assert.deepEqual(b.dexStateProblems(state),[]);assert.deepEqual(b.dexLayoutStateProblems(state,t),[]);
  for (const useCurrentRegion of [false,true]) for (const currentRegion of [undefined,null,-1,0,1]) {
    const options={...F.options,useCurrentRegion,...(currentRegion===undefined?{}:{currentRegion})};
    const output=q.dexCompleteEntryNumber(state,t,'e',options);
    const region=useCurrentRegion&&currentRegion!==undefined&&currentRegion!==null&&currentRegion>=0?currentRegion:-1;
    assert.deepEqual(output,{region,number:region===0?null:2,text:region===0?'???':'002',sceneRegion:currentRegion===1?1:0});
    assert.equal(q.dexCompleteEntryNumber(state,t,'e',{...options,offsets:[-1]}).text,region===-1?'001':output.text);
    assert.equal(q.dexCompleteEntryNumber(state,t,'e',{...options,offsets:[1]}).text,region===1?'001':output.text);
    const area=q.dexArea('e',{region:output.sceneRegion,encounterVersion:0,tables:[{mapId:1,version:0,species:['e']},{mapId:2,version:0,species:['e']}],maps:[{mapId:1,region:0,x:0,y:0},{mapId:2,region:1,x:1,y:0}],points:[{region:0,x:0,y:0,visible:true},{region:1,x:1,y:0,visible:true}]});
    assert.equal(area.status,'known');assert.deepEqual(area.points,[{x:output.sceneRegion,y:0}]);
    assert.equal(JSON.stringify(state),before);assert.deepEqual(b.dexStateProblems(JSON.parse(JSON.stringify(state))),[]);
  }
});
test('P53-34 numeric trim removes trailing unseen and an offset-zero unseen row, retaining middle placeholders', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['c']});
  const rows=q.dexList(state,c,0,0,{...F.options,offsets:[0]}).rows;
  assert.deepEqual(ids(rows),['b','c']); assert.equal(rows[0].name,'----------'); assert.equal(rows[0].canOpen,false); assert.equal(rows[1].number,2);
  assert.deepEqual(ids(q.dexList(F.dex(c.layout),c,0,0,F.options).rows),[]);
});
test('P53-34 six modes obey seen/owned gates and stable numeric ties', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c','d'],owned:['a','b','c']});
  const expected=[['a','b','c','d'],['a','b','c','d'],['b','a','c'],['a','c','b'],['b','a','c'],['a','c','b']];
  for (let mode=0;mode<6;mode++) assert.deepEqual(ids(q.dexList(state,c,0,mode,F.options).rows),expected[mode]);
});
test('P53-34 lastSeen form data changes row measurements and alphabetical order without changing saved shiny', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b'],owned:['a','b'],lastSeenForm:{a:{gender:1,form:1,shiny:true}}});
  const before=JSON.stringify(state),rows=q.dexList(state,c,0,2,F.options).rows;
  assert.equal(rows[0].data.heightDm,40); assert.equal(rows[0].name,'Alpha Tall');
  assert.deepEqual(rows[0].appearance,{gender:1,form:1,shiny:false}); assert.equal(JSON.stringify(state),before);
});
test('P53-34/35 Chinese authored keys drive sorting/groups; missing key diagnoses other without using content ID', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c']});
  c.forms[0].name='妙蛙种子'; c.forms[0].dexSortKeys={'zh-CN':'miao'};
  c.forms[1].name='比比鸟'; c.forms[1].dexSortKeys={'zh':'miao'};
  c.forms[2].name='中文缺键';
  const opts={locale:'zh-CN'},result=q.dexList(state,c,0,1,opts);
  assert.deepEqual(ids(result.rows),['a','b','c']); assert.equal(result.diagnostics.some(d=>d.species==='c'),true);
  assert.equal(q.dexSortKey(c.forms[2],'zh-CN').key,'');
  const dir={...F.directory,names:q.dexNameGroups('zh-CN')}; assert.equal(dir.names.length,27);
  const p=F.empty();p[1]=26; assert.deepEqual(ids(q.dexSearch(state,c,0,p,dir,opts).rows),['c']);
  p[1]=12; assert.deepEqual(ids(q.dexSearch(state,c,0,p,dir,opts).rows),['a','b']);
});
test('P53-34 same localized key uses region order, with content ID only as a final deterministic tie', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c']});
  for (const f of c.forms) f.dexSortKeys={zh:'same'};
  c.layout.regions[0].species=['c','b','a','d'];
  assert.deepEqual(ids(q.dexList(state,c,0,1,{locale:'zh'}).rows),['c','b','a']);
});
test('P53-35 37 size scales preserve -1, concrete, length sentinel and closed boundaries', async () => {
  const q=await query;
  assert.equal(q.DEX_HEIGHT_STEPS_DM.length,37); assert.equal(q.DEX_WEIGHT_STEPS_HG.length,37);
  assert.deepEqual([q.DEX_HEIGHT_STEPS_DM[24],q.DEX_HEIGHT_STEPS_DM[25],q.DEX_HEIGHT_STEPS_DM[36]],[25,30,100]);
  assert.deepEqual([q.DEX_WEIGHT_STEPS_HG[11],q.DEX_WEIGHT_STEPS_HG[12],q.DEX_WEIGHT_STEPS_HG[36]],[60,70,5000]);
  for (const [kind,max] of [['height',999],['weight',9999]]) {
    assert.equal(q.dexSizeBound(kind,'lower',-1),0); assert.equal(q.dexSizeBound(kind,'upper',-1),max);
    assert.equal(q.dexSizeBound(kind,'lower',37),max); assert.equal(q.dexSizeBound(kind,'upper',37),0);
  }
  const c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c'],owned:['a','b','c']}),p=F.empty(); p[4]=9;p[5]=9;
  assert.deepEqual(ids(q.dexSearch(state,c,0,p,F.directory,F.options).rows),['a','c']);
  p[4]=-1;p[5]=37; assert.deepEqual(q.dexSearch(state,c,0,p,F.directory,F.options).rows,[]);
  assert.throws(()=>q.dexSizeBound('height','lower',38));
});
test('P53-35 ten filters use AND for two types and accept actual directory sizes beyond eighteen', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c','d'],owned:['a','b','c']});
  const p=F.empty();p[2]=0;p[3]=1;assert.deepEqual(ids(q.dexSearch(state,c,0,p,F.directory,F.options).rows),['a']);
  p[3]=0;assert.throws(()=>q.dexSearch(state,c,0,p,F.directory,F.options));
  const types=Array.from({length:23},(_,i)=>'type'+i);c.forms[0].types=['type22'];
  const ext=F.empty();ext[2]=22;assert.deepEqual(ids(q.dexSearch(state,c,0,ext,{...F.directory,types},F.options).rows),['a']);
  assert.throws(()=>q.dexSearch(state,c,0,[0,-1],F.directory,F.options));
});
test('P53-35 name is initial-group matching; type/size need owned and color/shape only need seen', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','d'],owned:['a']}),p=F.empty();
  p[1]=3;assert.deepEqual(ids(q.dexSearch(state,c,0,p,F.directory,F.options).rows),['d']);
  p[1]=7;assert.deepEqual(q.dexSearch(state,c,0,p,F.directory,F.options).rows,[]); // Alpha contains h but does not start with h.
  p[1]=-1;p[8]=0;p[9]=0;assert.deepEqual(ids(q.dexSearch(state,c,0,p,F.directory,F.options).rows),['a','d']);
  p[2]=0;assert.deepEqual(ids(q.dexSearch(state,c,0,p,F.directory,F.options).rows),['a']);
  state.owned.push('b');p[2]=2;p[8]=-1;p[9]=-1;assert.deepEqual(q.dexSearch(state,c,0,p,F.directory,F.options).rows,[]); // Owned-only is still not seen.
});
test('P53-35 PD28 empty Start changes persistent mode and preserves accepted params/list/results/draft', async () => {
  const q=await query,r=await rules,c=F.catalog(),state=F.dex(c.layout,{seen:['a']}),session=q.createDexSearchSession(state,c,0,F.options),draft=F.empty(4);
  const before=JSON.stringify({state,session,draft});
  const attempt=q.startDexSearch(state,c,0,session,draft,F.directory,F.options);
  assert.equal(attempt.empty,true);assert.equal(attempt.patch.view.mode,4);assert.deepEqual(attempt.session,session);
  const changed=r.applyDexPatch(state,attempt.patch),back=q.backDexSearch(changed,c,0,attempt.session,F.options);
  assert.equal(back.exit,true);assert.deepEqual(back.patch,{});assert.equal(changed.view.mode,4);
  assert.equal(attempt.session.accepted[0],0);assert.equal(q.createDexSearchSession(changed,c,0,F.options).accepted[0],4);
  assert.equal(JSON.stringify({state,session,draft}),before);
});
test('P53-35 failed second search retains previous successful result state, BACK then resets mode and finds species', async () => {
  const q=await query,r=await rules,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c'],owned:['a','b','c']});
  const first=q.startDexSearch(state,c,0,q.createDexSearchSession(state,c,0,F.options),F.empty(4),F.directory,F.options);
  let installed=r.applyDexPatch(state,first.patch);first.session.cursor=1;assert.equal(first.session.rows[1].species,'a');
  const bad=F.empty(3);bad[2]=4;const empty=q.startDexSearch(installed,c,0,first.session,bad,F.directory,F.options);
  installed=r.applyDexPatch(installed,empty.patch);assert.equal(installed.view.mode,3);assert.deepEqual(empty.session.accepted,F.empty(4));assert.equal(empty.session.results,true);
  const back=q.backDexSearch(installed,c,0,empty.session,F.options);
  assert.equal(back.exit,false);assert.equal(back.patch.view.mode,0);assert.equal(back.session.results,false);assert.equal(back.session.rows[back.session.cursor].species,'a');assert.deepEqual(back.session.accepted,F.empty());
});
test('P53-35 entry return reruns accepted search and clamps cursor; reset only returns draft values', async () => {
  const q=await query,c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c'],owned:['a','b','c']});
  const session=q.startDexSearch(state,c,0,q.createDexSearchSession(state,c,0,F.options),F.empty(4),F.directory,F.options).session;
  session.cursor=2;state.owned=['b'];const refreshed=q.refreshDexSearch(state,c,0,session,F.directory,F.options);
  assert.deepEqual(ids(refreshed.rows),['b']);assert.equal(refreshed.cursor,0);assert.equal(refreshed.accepted[0],4);
  assert.deepEqual(q.dexEmptySearch(),[0,-1,-1,-1,-1,-1,-1,-1,-1,-1]);assert.equal(state.view.mode,0);
});
test('P53-36 D53-02a measurement displays retain Info/search US difference; filters stay in dm/hg', async () => {
  const q=await query;
  assert.deepEqual(q.dexMeasurements(10,100,'en-GB','info'),{height:'1.0 m',weight:'10.0 kg'});
  assert.deepEqual(q.dexMeasurements(10,100,'en-US','info'),{height:'3\'03"',weight:'22.0 lb'});
  assert.equal(q.dexMeasurements(10,100,'en-US','search').weight,'39.4 lb');
  assert.equal(q.dexSizeLabel('height','upper',-1,'en-US'),'99\'00"');assert.equal(q.dexSizeLabel('weight','lower',37,'en-US'),'9999.0 lb');
  const c=F.catalog(),d=F.dex(c.layout,{seen:['a'],owned:['a']}),p=F.empty();p[6]=15;p[7]=15;
  assert.deepEqual(ids(q.dexSearch(d,c,0,p,F.directory,{locale:'en-US'}).rows),['a']);
});
test('P53-36 PD14/R4-PD ordinary Info masks owned fields and requests normal appearance without modifying shiny', async () => {
  const q=await query,c=F.catalog(),d=F.dex(c.layout,{seen:['a'],lastSeenForm:{a:{gender:1,form:0,shiny:true}},capturedCounts:{a:2},defeatedCounts:{a:3}}),before=JSON.stringify(d);
  const number=q.dexEntryNumber(d,c.layout,'a','brief'),seen=q.dexInfo(d,c,'a',number);
  assert.equal(seen.categoryKey,null);assert.equal(seen.heightDm,null);assert.deepEqual(seen.types,[]);assert.equal(seen.footprint,false);assert.equal(seen.counts.battled,5);assert.equal(seen.appearance.shiny,false);
  d.owned.push('a');const owned=q.dexInfo(d,c,'a',number);assert.equal(owned.categoryKey,'cat.a');assert.equal(owned.heightDm,10);assert.deepEqual(owned.types,['grass','poison']);assert.equal(owned.footprint,true);
  d.owned.pop();assert.equal(JSON.stringify(d),before);
});
test('P53-36 PD31 structural form/name gates apply before showAll and named form keeps first qualifying gender', async () => {
  const q=await query,c=F.catalog(),d=F.dex(c.layout,{seenForms:{a:[{gender:1,form:1,shiny:true}]}});
  const opts={showAll:false,gender:128,baseFrontsEqual:true};
  assert.deepEqual(q.dexForms(d,c,'a',opts),[{gender:1,form:1,label:'Tall'}]);
  assert.equal(q.dexForms(d,c,'a',{...opts,showAll:true}).find(x=>x.form===1).gender,0);
  c.forms.push({species:'a',form:2,name:'Unnamed'},{species:'a',form:3,name:'Redirect',formName:'Redirect',pokedexForm:1});
  assert.deepEqual(q.dexForms(d,c,'a',{...opts,showAll:true}).map(x=>x.form),[0,1]);
});
test('P53-36 PD32/33 nil and empty labels, equal-front fold and structural multi remain distinct', async () => {
  const q=await query,c=F.catalog(),d=F.dex(c.layout,{seenForms:{a:[{gender:0,form:0,shiny:false},{gender:1,form:0,shiny:true}]}});
  let opts={showAll:false,gender:128,baseFrontsEqual:true};
  assert.deepEqual(q.dexForms(d,c,'a',opts),[{gender:0,form:0,label:'One Form'}]); // Form1 exists structurally, not yet seen.
  c.forms[0].formName='';assert.deepEqual(q.dexForms(d,c,'a',opts),[{gender:0,form:0,label:''}]);
  delete c.forms[0].formName;opts.baseFrontsEqual=false;
  assert.deepEqual(q.dexForms(d,c,'a',opts),[{gender:0,form:0,label:'Male'},{gender:1,form:0,label:'Female'}]);
  c.forms[0].formName='';assert.deepEqual(q.dexForms(d,c,'a',opts).map(x=>x.label),['','']);
  c.forms=c.forms.filter(f=>f.species!=='a'||f.form===0);delete c.forms[0].formName;opts.baseFrontsEqual=true;
  assert.deepEqual(q.dexForms(d,c,'a',opts),[{gender:0,form:0,label:''}]);
});
test('P53-36 F-02 named raw form with empty translation keeps one gender and cannot enable the selector', async () => {
  const q=await query,content=F.freeze({regionalDex:{national:['x'],regions:[{id:0,species:['x']}]},forms:{x:{0:'X',1:'X-Tall'}},species:{X:{gender:128},'X-Tall':{gender:128,formName:'Tall',formNameKey:'form.tall',pokedexForm:1}}});
  const c=F.freeze(q.createDexQueryCatalog(content,{'form.tall':''})),d=F.freeze(F.dex(c.layout,{seenForms:{x:[{gender:0,form:1,shiny:false},{gender:1,form:1,shiny:false}]},lastSeenForm:{x:{gender:1,form:1,shiny:true}}}));
  const before=JSON.stringify({content,c,d}),choices=q.dexForms(d,c,'x',{showAll:false,gender:128,baseFrontsEqual:false});
  assert.deepEqual(choices,[{gender:0,form:1,label:''}]);assert.deepEqual(q.planDexFormSelection(d,'x',choices).patch,{});
  assert.equal(JSON.stringify({content,c,d}),before);
});
test('P53-36 F-02 empty raw base name with nonempty translation keeps both genders and enables the selector', async () => {
  const q=await query,r=await rules,content=F.freeze({regionalDex:{national:['x'],regions:[{id:0,species:['x']}]},forms:{x:{0:'X'}},species:{X:{gender:128,formName:'',formNameKey:'form.base'}}});
  const c=F.freeze(q.createDexQueryCatalog(content,{'form.base':'Base translated'})),d=F.freeze(F.dex(c.layout,{seenForms:{x:[{gender:0,form:0,shiny:false},{gender:1,form:0,shiny:false}]},lastSeenForm:{x:{gender:1,form:0,shiny:true}}}));
  const before=JSON.stringify({content,c,d}),choices=q.dexForms(d,c,'x',{showAll:false,gender:128,baseFrontsEqual:false});
  assert.deepEqual(choices,[{gender:0,form:0,label:'Base translated'},{gender:1,form:0,label:'Base translated'}]);
  const selected=q.planDexFormSelection(d,'x',choices);assert.equal(selected.index,1);
  assert.deepEqual(r.applyDexPatch(d,selected.patch).lastSeenForm.x,{gender:1,form:0,shiny:false});
  assert.equal(JSON.stringify({content,c,d}),before);
});
test('P53-36 same-front female-only seen folds to male display; female species and genderless retain their query gates', async () => {
  const q=await query,c=F.catalog(),d=F.dex(c.layout,{seenForms:{a:[{gender:1,form:0,shiny:true}]}});
  const opts={showAll:false,gender:128,baseFrontsEqual:true};
  assert.equal(q.dexForms(d,c,'a',opts)[0].gender,0);
  c.forms[0].gender='F';
  assert.equal(q.dexForms(d,c,'a',{...opts,gender:'F'})[0].gender,1);
  c.forms[0].gender='N';
  assert.deepEqual(q.dexForms(d,c,'a',{...opts,gender:'N'}),[]);
});
test('P53-36 each form uses its own fixed gender rather than the base form ratio', async () => {
  const q=await query,c=F.catalog(),d=F.dex(c.layout);
  c.forms.find(f=>f.species==='a'&&f.form===1).gender='F';
  const choices=q.dexForms(d,c,'a',{showAll:true,gender:128,baseFrontsEqual:true});
  assert.deepEqual(choices,[{gender:0,form:0,label:'One Form'},{gender:1,form:1,label:'Tall'}]);
});
test('P53-36 PD34/R6 first selector round writes false, BACK keeps it; one item cannot make that write', async () => {
  const q=await query,r=await rules,d=F.dex(undefined,{seen:['a'],lastSeenForm:{a:{gender:2,form:9,shiny:true}}}),choices=[{gender:0,form:0,label:'One Form'},{gender:1,form:1,label:'Tall'}];
  const before=JSON.stringify(d),first=q.planDexFormSelection(d,'a',choices);assert.equal(first.index,0);
  const installed=r.applyDexPatch(d,first.patch);assert.deepEqual(installed.lastSeenForm.a,{gender:0,form:0,shiny:false});
  assert.equal(q.moveDexFormSelection(0,2,-1),1);assert.equal(q.moveDexFormSelection(1,2,1),0);
  const moved=q.planDexFormSelection(installed,'a',choices,1);assert.deepEqual(moved.patch.lastSeenForm.a,{gender:1,form:1,shiny:false});
  assert.deepEqual(q.planDexFormSelection(d,'a',choices.slice(0,1)).patch,{});assert.equal(JSON.stringify(d),before);
  assert.deepEqual(installed.seen,d.seen);assert.deepEqual(installed.seenForms,d.seenForms);
  assert.throws(()=>q.planDexFormSelection(d,'a',[choices[0],{gender:0,form:1000,label:'bad'}],1));
});
test('P53-36 U05-HAB masks only illuminate existing occupied cells and union duplicate visible Points', async () => {
  const q=await query,input={region:0,encounterVersion:0,tables:[{mapId:1,version:0,species:['a']}],maps:[{mapId:1,region:0,x:13,y:12,size:{width:3,shape:'11111'}}],points:[]};
  for (let y=12;y<14;y++)for(let x=13;x<16;x++)input.points.push({region:0,x,y,visible:true});
  assert.deepEqual(q.dexArea('a',input).points,[{x:13,y:12},{x:14,y:12},{x:15,y:12},{x:13,y:13},{x:14,y:13}]);
  input.maps[0].size.shape='10000';input.points[0].visible=false;input.points.push({region:0,x:13,y:12,visible:true});
  assert.deepEqual(q.dexArea('a',input).points,[{x:13,y:12}]);
  input.maps[0].size.shape='2x000';assert.deepEqual(q.dexArea('a',input).points,[{x:13,y:12}]);
});
test('P53-36 PD16 version1 retains v0 enumeration, while hidden/region/no-data keep unknown', async () => {
  const q=await query,input={region:0,encounterVersion:1,tables:[{mapId:1,version:0,species:['a']},{mapId:1,version:1,species:['b']}],maps:[{mapId:1,region:0,x:0,y:0}],points:[{region:0,x:0,y:0,visible:true}]};
  assert.equal(q.dexArea('a',input).status,'known');input.maps[0].hidden=true;assert.equal(q.dexArea('a',input).status,'unknown');
  input.maps[0].hidden=false;input.maps[0].region=1;assert.equal(q.dexArea('a',input).status,'unknown');assert.equal(q.dexArea('a').status,'unknown');
  input.maps[0].region=0;input.maps[0].size={width:0,shape:'xxxxx'};assert.equal(q.dexArea('a',input).status,'known');
  input.maps[0].size={width:3,shape:'字'};assert.equal(q.dexArea('a',input).status,'invalid');
});
test('P53-45 explicit view/search/Form patches remain valid B schema7; reads do not persist cache/session', async () => {
  const q=await query,r=await rules,{dexState:b}=require('../../../js/engine/build/core.cjs'),c=F.catalog(),state=F.dex(c.layout,{seen:['a','b','c'],owned:['a','b','c']});
  const search=q.startDexSearch(state,c,0,q.createDexSearchSession(state,c,0,F.options),F.empty(4),F.directory,F.options);
  let next=r.applyDexPatch(state,search.patch);next=r.applyDexPatch(next,q.backDexSearch(next,c,0,search.session,F.options).patch);
  next=r.applyDexPatch(next,q.planDexFormSelection(next,'a',[{gender:0,form:0,label:''},{gender:0,form:1,label:'Tall'}],1).patch);
  const saved=JSON.parse(JSON.stringify(next));assert.deepEqual(b.dexStateProblems(saved),[]);assert.deepEqual(b.dexLayoutStateProblems(saved,c.layout),[]);
  assert.equal(Object.hasOwn(saved,'accessible'),false);assert.equal(Object.hasOwn(saved,'search'),false);assert.equal(saved.lastSeenForm.a.form,1);
  assert.deepEqual(q.planDexViewing(next,c.layout,{cursor:1,searchResults:true}),{});
});
test('P53-33–36 frozen catalog/state and returned nested values are isolated, including empty-result copies', async () => {
  const q=await query,c=F.freeze(F.catalog()),state=F.freeze(F.dex(c.layout,{seen:['a','c']})),before=JSON.stringify({c,state});
  const session=q.createDexSearchSession(state,c,0,F.options),attempt=q.startDexSearch(state,c,0,session,F.empty(4),F.directory,F.options);
  attempt.session.rows[0].data.types.push('mutated');attempt.session.rows[0].appearance.form=999;
  assert.deepEqual(session.rows[0].data.types,['grass','poison']);assert.equal(session.rows[0].appearance.form,0);
  q.dexForms(state,c,'a',{showAll:true,gender:128,baseFrontsEqual:true});q.dexInfo(state,c,'a',{region:0,number:1,text:'001'});
  assert.equal(JSON.stringify({c,state}),before);
});
test('P53-33 B content adapter preserves authored keys, forms, translation and isolated layout arrays', async () => {
  const q=await query,content={regionalDex:{national:['x'],regions:[{id:0,species:['x']}]},forms:{x:{0:'X',1:'X-Tall'}},species:{X:{nameKey:'x',dexSortKeys:{zh:'miao'},types:['grass']},'X-Tall':{nameKey:'xtall',formName:'Tall',pokedexForm:1,heightDm:40}}};
  const c=q.createDexQueryCatalog(F.freeze(content),{x:'妙蛙',xtall:'高妙蛙'});
  assert.equal(c.forms[0].name,'妙蛙');assert.equal(c.forms[0].dexSortKeys.zh,'miao');assert.equal(c.forms[1].form,1);
  c.layout.regions[0].species.push('a');c.forms[0].types.push('fire');assert.deepEqual(content.species.X.types,['grass']);assert.deepEqual(content.regionalDex.regions[0].species,['x']);
});
