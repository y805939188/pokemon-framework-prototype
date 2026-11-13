'use strict';
// Actual rebuilt Scene + production App/Session/Gen8. Only host rendering/input/time are controlled.
// Opening uses the existing fast fixture; every tested turn uses normal typing and one-second dwell.
const test=require('node:test'),H=require('./e2-status-feedback-scene-host.cjs');
const {assert,clone,E}=H;test.before(H.prepare);test.after(H.cleanup);
const events=r=>r.result.messages.flatMap(m=>m.kind==='events'?m.events:[]);
function config(lang,id,player,foe){return{id:'CANT-'+id+'-'+lang,lang,seed:[9,10,11,12],player,foe};}
const fast=(moves=['splash'],extra={})=>({species:'aerodactyl',abilityIndex:1,level:50,moves,...extra});
const slow=(moves=['splash'])=>({species:'slowbro',level:50,moves});
async function turn(h,slot=1,{automaticTurns=0}={}){
 await H.mode(h,'main');const lineStart=h.lines.length,calls=h.calls.length;
 await H.pick(h,'fight');await H.mode(h,'moves');await H.pick(h,slot);
 await h.waitFor(()=>h.calls.length===calls+1&&h.calls.at(-1).after,'real session action completed');
 const frames=new Map(),observed=new Map(),displayCalls=[],displayEvent=h.s._display.event,seen=[];
 h.s._display.event=function(e){const before=clone(this.snapshot()),steps=displayEvent.call(this,e);if(e.type==='cant')displayCalls.push({before,after:clone(this.snapshot()),steps:steps.length});return steps;};
 const capture=()=>{for(const row of h.calls.slice(calls))if(row.after&&!observed.has(row))observed.set(row,JSON.stringify(row.result.messages));};
 try{
  for(let i=0;i<5000;i++){
   capture();
   if(h.s.inputState().ready&&h.s._mode==='main'&&!h.s._busy&&!h.s._queue.length)break;
   const st=h.s.ordinaryMessageState(),owner=h.s._ordinaryMessage;
   if(st&&owner&&st.phase!=='done'){
    let record=frames.get(owner);if(!record){record={call:h.calls.length,live:H.live(h.session),partial:false,full:0,text:'',firstFull:null,lastFull:null};frames.set(owner,record);}
    assert.equal(h.calls.length,record.call,'one message owner cannot advance to another turn while typing/dwelling');assert.deepEqual(H.live(h.session),record.live,'the same message owner keeps the whole live state fixed during typing/dwell');
    record.partial ||= st.visible>0&&st.visible<st.total;
    if(st.phase==='full'){record.full++;record.text=h.s._log._lines.join('');record.firstFull??=h.G.performance.now();record.lastFull=h.G.performance.now();}
    assert.equal(h.s.inputState().ready,false);assert.equal(h.s._menu.visible,false);
    const beforeInput=H.live(h.session);h.s.onMenuOk();assert.equal(h.calls.length,record.call,'ordinary text input cannot submit another turn');assert.deepEqual(H.live(h.session),beforeInput,'message input does not advance the engine');
   }
   await h.frames(1);
  }
 }finally{h.s._display.event=displayEvent;}
 capture();const rows=h.calls.slice(calls);assert.equal(rows.length,1+automaticTurns,'only the declared hard-locked continuation may follow the first action');
 assert(h.s.inputState().ready&&h.s._mode==='main','normal-speed queue returns to command without injected confirmation');
 const allEvents=rows.flatMap(events),expected=allEvents.flatMap(e=>h.s._D.event(e));assert.deepEqual(h.lines.slice(lineStart),expected,'Scene publishes every actual turn in raw event description order');
 for(const [index,row]of rows.entries()){
  assert.equal(JSON.stringify(row.result.messages),observed.get(row),'Scene does not rewrite protocol');
  for(const e of events(row).filter(e=>e.type==='cant')){
   const text=h.s._D.event(e)[0],matches=[...frames.values()].filter(r=>r.call===calls+index+1&&r.text===text);
   assert.equal(matches.length,1,'one actual message instance per turn/cant');const r=matches[0];assert(r.partial,'cant message really typed');assert(r.full>=59,'cant message really dwelled for one second');assert(r.lastFull-r.firstFull>=960);seen.push({turn:index,reason:e.args[1],actor:e.args[0],fullFrames:r.full});
  }
 }
 assert.deepEqual(H.live(h.session),rows.at(-1).after,'final typing/dwell does not advance the engine');H.unchanged(h);
 for(const e of allEvents.filter(e=>e.type==='cant')){const before=clone(h.s._display.snapshot());assert.deepEqual(Array.from(h.s._display.event(e)),[]);assert.deepEqual(clone(h.s._display.snapshot()),before,'cant is text only, never clears HP/status or changes actor');}
 for(const x of displayCalls){assert.equal(x.steps,0);assert.deepEqual(x.after,x.before);}
 console.log('CANT_SCENE_TURN '+JSON.stringify({id:h.request.battleId,slot,turns:rows.length,seen,fast:h.flow.fast,NW:0}));
 return automaticTurns?rows:rows[0];
}

for(const lang of ['en','zh']){
 for(const status of ['slp','par','frz'])test(`${lang} player ${status}: real carried status, blocked PP and normal Scene waits`,async()=>{
  const h=await H.open(config(lang,status,fast(['splash'],{status,statusCount:3}),slow()));try{let blocked=0;
   for(let i=0;i<(status==='par'?7:5);i++){const shownBefore=clone(h.s._display.snapshot()),row=await turn(h),ev=events(row),cant=ev.filter(e=>e.type==='cant'&&e.args[0]==='p1a: SCENE-P1'&&e.args[1]===status),move=ev.filter(e=>e.type==='move'&&e.args[0]==='p1a: SCENE-P1');blocked+=cant.length;assert.equal(cant.length+move.length,1);assert.equal(row.before.p1[0].pp.splash-row.after.p1[0].pp.splash,move.length);if(cant.length){assert.equal(row.after.p1[0].status,status);assert.deepEqual(clone(h.s._display.snapshot()),shownBefore,'a cant-only player turn preserves the pre-existing display projection');}}
   assert.equal(blocked,status==='par'?2:status==='slp'?2:5,'fixed sequence reaches the characterized blocked rounds');
  }finally{h.cleanup();}
 });
 test(`${lang} foe sleep is produced by real Spore before its cant, no foe PP spent`,async()=>{
  const h=await H.open(config(lang,'foe-sleep',fast(['spore']),slow()));try{const row=await turn(h),ev=events(row),status=ev.findIndex(e=>e.type==='-status'&&e.args[0].startsWith('p2a:')),cant=ev.findIndex(e=>e.type==='cant'&&e.args[0].startsWith('p2a:')&&e.args[1]==='slp');assert(status>=0&&cant>status);assert.equal(row.before.p2[0].pp.splash,row.after.p2[0].pp.splash);assert.equal(h.s.statusCardState().find(x=>x.side==='p2'&&x.visible).condition.kind,'slp');}finally{h.cleanup();}
 });
 for(const side of ['p1','p2'])test(`${lang} ${side} real Fake Out flinch reaches the correct actor`,async()=>{
  const h=await H.open(config(lang,'flinch-'+side,side==='p1'?slow():fast(['fakeout','splash']),side==='p1'?fast(['fakeout']):slow()));try{const row=await turn(h),ev=events(row),cant=ev.find(e=>e.type==='cant'&&e.args[0].startsWith(side+'a:')&&e.args[1]==='flinch');assert(cant);assert.equal(row.before[side][0].pp.splash,row.after[side][0].pp.splash);assert.equal(row.after[side][0].status,'');}finally{h.cleanup();}
 });
 for(const move of ['hyperbeam','dig'])test(`${lang} ${move}: real Scene locked turn, recharge is not two-turn charging`,async()=>{
  const h=await H.open(config(lang,move,{species:'snorlax',abilityIndex:1,level:50,moves:[move,'splash']},{species:'shuckle',level:100,moves:['splash']}));try{const [first,second]=await turn(h,1,{automaticTurns:1});assert.equal(first.before.p1[0].pp[move]-first.after.p1[0].pp[move],1);assert.equal(second.before.p1[0].pp[move],second.after.p1[0].pp[move]);const ev=events(second);
   if(move==='hyperbeam'){assert(ev.some(e=>e.type==='cant'&&e.args[1]==='recharge'));assert(!ev.some(e=>e.type==='move'&&e.args[0].startsWith('p1a:')));assert(!events(first).some(e=>e.type==='cant'&&e.args[1]==='recharge'));}
   else{assert(events(first).some(e=>e.type==='-prepare'&&e.args[1]==='Dig'));assert(!ev.some(e=>e.type==='cant'));assert(ev.some(e=>e.type==='move'&&e.args[1]==='Dig'));}
  }finally{h.cleanup();}
 });
 for(const move of ['snore','sleeptalk'])test(`${lang} ${move}: sleeping notice still precedes actual allowed move`,async()=>{
  const h=await H.open(config(lang,move,fast([move,'splash'],{status:'slp',statusCount:3}),slow()));try{const row=await turn(h),ev=events(row),cant=ev.findIndex(e=>e.type==='cant'&&e.args[1]==='slp'),used=ev.findIndex(e=>e.type==='move'&&e.args[0].startsWith('p1a:'));assert(cant>=0&&used>cant);assert.equal(row.before.p1[0].pp[move]-row.after.p1[0].pp[move],1);assert.equal(row.after.p1[0].status,'slp');}finally{h.cleanup();}
 });
 test(`${lang} abort retires an in-progress cant without stale repaint or save writes`,async()=>{
  const h=await H.open(config(lang,'abort',fast(['splash'],{status:'slp',statusCount:3}),slow()));try{
   await H.pick(h,'fight');await H.mode(h,'moves');await H.pick(h,1);await h.waitFor(()=>h.s.ordinaryMessageState()?.phase==='full'&&h.s._log._lines.join('').includes(lang==='zh'?'仍在熟睡':'fast asleep'),'cant fully painted');
   const step=h.s._ordinaryMessage,paint=h.s._log.setLines;let paints=0;h.s._log.setLines=function(...args){paints++;return paint.apply(this,args);};h.flow.abort(Error('owned cant cancellation'));await h.frames(2);assert.equal(h.s.ordinaryMessageState(),null);const count=paints;assert(step.advance(h.G.performance.now()+5000));assert.equal(paints,count);H.unchanged(h);assert(!h.flow.app().saveBlocked);
  }finally{h.cleanup();}
 });
}
