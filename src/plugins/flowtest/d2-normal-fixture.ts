/** Explicit authored normal fixture. Constructs the production App; never starts a battle or acquires native permission. */
import { progressionDonorInputs } from './source-fixture';
import { normalDonorInput, normalPresentation } from './d2-normal-tools';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const requireTrue = (v: any, reason: string) => { if (!v) throw Error(reason); };

export function normalFixtureData(E: any): any {
  const input = progressionDonorInputs(), donor = normalDonorInput();
  input.species.find((s: any) => s.id === 'snorlax').learnset = [...['payday','splash','memento','roost'].map(move => ({level:1,move})), {level:51,move:'growl'}];
  input.species.find((s: any) => s.id === 'pidgey').learnset = [{level:1,move:'splash'}];
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map((x: any) => ({...x,source:'author-placeholder'}));
  if (!input.items.some((x: any) => x.id === 'fullrestore')) input.items.push({id:'fullrestore',name:'Full Restore',namePlural:'Full Restores',pocket:2,battleId:'fullrestore',battleUse:'member',source:'author-placeholder'});
  input.items.find((x: any) => x.id === 'fullrestore').battleUse='member';input.items.find((x: any) => x.id === 'fullrestore').battleId='fullrestore';
  input.trainerTypes=[{id:'d1-type',nameKey:'trainer.d1',gender:0,source:'author-placeholder',baseMoney:0,skillLevel:100,flags:[],items:[{item:'fullrestore',count:1}]}];
  input.trainers=[{id:'d1-win',type:'d1-type',name:'D1',version:1,source:'author-placeholder',party:[0,1].map(()=>({species:'pidgey',level:1,moves:['knockoff']}))},{id:'d1-loss',type:'d1-type',name:'D3',version:1,source:'author-placeholder',party:[{species:'pidgey',level:100,moves:['knockoff']}]}];
  const compiled=E.contentCompile.compileContent(input);requireTrue(compiled.ok,'normal fixture content invalid: '+JSON.stringify(compiled.errors));
  const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());requireTrue(!assembled.errors.length,'normal fixture assembly invalid');
  const content=assembled.content,initial=E.state.newGame({content,party:[],money:donor.initial.money,bag:{masterball:5,potion:5}});initial.badges.fill(true);
  initial.party=['P1','P2'].map(id=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species:'Snorlax',level:50},content,()=>0),content));initial.nextMemberOrdinal='3';
  for(const m of initial.party)m.item='oranberry';initial.party[0].hp-=20;initial.party[1].hp=1;initial.party[1].exp=E.growth.minExp('slow',51)-1;
  const problems=E.saveSchema.validateGameContent(initial,content);requireTrue(!problems.length,'normal fixture initial state invalid: '+JSON.stringify(problems));
  return {version:'D2-normal-formal-fixture-v1',content,initial,donor,presentation:normalPresentation(),
    capabilities:clone(donor.initial.capabilities),receivingProfile:clone(donor.initial.receiving),clock:donor.initial.clock,
    setupWriteSets:{'normal-heal-all':['party.hp','party.status','party.statusCount','party.moves.pp'],
      'replenish-masterball5-potion5':['inventory'],'controlled-input-nonP1-hp0':['party[not-P1].hp'],
      firstTrainerBattle:['engine.p2.firstMember.hp=1']}};
}

export function createFormalNormalFixture(E: any, options: any = {}): any {
  const data=normalFixtureData(E),dex=E.dex.createDexLookup(),assertOwned=options.assertOwned??(()=>{});let current=clone(data.initial),seed=[1,2,3,4],selected: any=null,prepared=false,worldDraws=0;
  const state=options.stateFactory?options.stateFactory(clone(data.initial)):{read:()=>current,replace:(next: any)=>{current=next;}};
  requireTrue(JSON.stringify(state.read())===JSON.stringify(data.initial),'normal fixture state must start at exact authored initial');
  // Pass the exact registered production root: copying/wrapping it loses its private required-settlement authority.
  const sessions=E.composition.createBattleSessionFactory({content:()=>data.content,seed:()=>clone(seed),...(options.trainerAiTiming?{trainerAiTiming:options.trainerAiTiming}:{})});
  const app=new E.app.GameApplication({state,content:()=>({content:data.content,dex}),sessions,projection:{project:options.project??(()=>{})},
    random:(n: number)=>{requireTrue(Number.isSafeInteger(n)&&n>0,'finite fixture RandomN');worldDraws++;return 0;},clock:()=>data.clock},
    {capabilities:data.capabilities,receivingProfile:data.receivingProfile});
  return {
    app,content:data.content,get data(){return {version:data.version,initial:clone(data.initial),donor:clone(data.donor),presentation:clone(data.presentation),setupWriteSets:clone(data.setupWriteSets)};},
    state:()=>clone(state.read()),worldDraws:()=>worldDraws,
    prepareCase(id: string){
      assertOwned();requireTrue(!app.saveBlocked,'normal fixture setup during active operation');
      selected=null;prepared=false;
      const c=data.donor.cases.find((x: any)=>x.id===id);requireTrue(c,'unknown authored normal case');
      const before=clone(state.read());
      // Preserve the original authored D1 recipe order; this is setup, not business-intent advancement.
      if(c.ordinal>=3){const healed=app.healParty();requireTrue(['healed','unchanged'].includes(healed.status),'normal fixture healing refused');}
      const game=state.read();game.inventory=E.inventory.inventoryFromBag({masterball:5,potion:5},E.itemCatalog.catalogOf(data.content));
      if(c.kind==='trainer-loss-D3')for(const m of game.party)if(m.id!=='P1')m.hp=0;
      const problems=E.saveSchema.validateGameContent(game,data.content);requireTrue(!problems.length,'normal fixture setup state invalid: '+JSON.stringify(problems));
      seed=clone(c.seed);selected=c;options.onSeed?.(clone(seed));prepared=true;
      return {case:clone(c),before,after:clone(game),seed:clone(seed),battleStartedByThisCall:false};
    },
    async startPreparedBattle(){
      assertOwned();requireTrue(selected&&prepared&&!app.saveBlocked,'normal fixture prepared idle case required');prepared=false;
      const c=selected,generation=app.stateGeneration,request=clone(c.request);
      const session=await (request.trainer?app.startTrainerBattle(request):app.startBattle(request));
      assertOwned();requireTrue(selected===c&&app.stateGeneration===generation&&app.saveBlocked&&session.battleId===c.id&&!session.finished,'normal fixture session owner mismatch');
      // This synchronous pre-input setup applies only to the handle returned by this exact App call.
      if(c.ordinal===2){
        requireTrue(session.foe.kind==='trainer'&&session.foeTeam[0]&&session.currentRequest()?.active,'first trainer setup boundary unavailable');
        session.gw.seedState('p2',[{id:session.foeTeam[0].id,hp:1}]);
      }
      return {session,request,battleSetup:c.ordinal===2?'engine.p2.firstMember.hp=1':null};
    },
    describe(){return {version:data.version,source:'same authored D1 recipe, normal presentation',presentation:clone(data.presentation),capabilities:clone(data.capabilities),receivingProfile:clone(data.receivingProfile),clock:data.clock,engineWallClock:'NOT_INSTALLED',selectedCase:selected?.id??null,worldDraws,nativeAdmission:false};},
  };
}

/** Explicit attachment only for a caller-owned isolated host. The CLI preparation route never calls this. */
export function installNormalHostFixture(E: any, G: any, W: any, options: any = {}): any {
  const flow=W.PSFlow,system=G.$gameSystem;
  requireTrue(flow&&system&&!flow.running&&!flow._op&&!flow._app?.saveBlocked,'normal fixture requires idle isolated host');
  const names=['_app','_content','_dex','fast','receiveOptions','developerCapabilities','lang','_tr','seed'];
  const previous=Object.fromEntries(names.map(k=>[k,{own:Object.hasOwn(flow,k),value:flow[k]}])),oldGame=system._psGame,oldGameOwn=Object.hasOwn(system,'_psGame');
  let fixture: any=null,installed=false,retired=false,generation: number|null=null,ownedGame: any=null;
  const guard=()=>{
    requireTrue(!retired&&G.$gameSystem===system,'normal fixture host retired');
    if(installed)requireTrue(flow._app===fixture.app&&flow._content===fixture.content&&fixture.app.stateGeneration===generation&&system._psGame===ownedGame,'normal fixture owner changed');
  };
  const restoreFields=()=>{if(oldGameOwn)system._psGame=oldGame;else delete system._psGame;for(const k of names){if(previous[k].own)flow[k]=previous[k].value;else delete flow[k];}};
  try {
    fixture=createFormalNormalFixture(E,{assertOwned:guard,...(options.trainerAiTiming?{trainerAiTiming:options.trainerAiTiming}:{}),
      stateFactory:(initial: any)=>{ownedGame=initial;system._psGame=initial;return {read:()=>{guard();return system._psGame;},replace:(next: any)=>{guard();ownedGame=next;system._psGame=next;}};},
      project:(out: any)=>flow.projectOutcome(out),onSeed:(seed: number[])=>{flow.seed=seed;}});
    flow._app=fixture.app;flow._content=fixture.content;flow._dex=E.dex.createDexLookup();flow.fast=false;
    flow.receiveOptions={mode:1,naming:1};flow.developerCapabilities={allowHeldItemSources:true,allowExperimentalHeldItemBattle:true};flow.setLanguage('en');flow.seed=[1,2,3,4];
    generation=fixture.app.stateGeneration;installed=true;
  } catch(error) {restoreFields();throw error;}
  return {...fixture,restore(){guard();requireTrue(!flow.running&&!flow._op&&!fixture.app.saveBlocked,'normal fixture cannot retire during active operation');restoreFields();retired=true;},
    assertOwned:guard,scope:'EXPLICIT_ISOLATED_HOST_ATTACHMENT_NOT_NATIVE_ADMISSION'};
}
