'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,Playback,makeAudio,plan;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-faint-view-'));const root=path.join(ROOT,'src/plugins/battleflow');
 const config={compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'out'),noEmitOnError:true},files:['picture-playback.ts','faint-mz.ts'].map(f=>path.join(root,f))};
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify(config));const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 Playback=require(path.join(temp,'out/picture-playback.js')).BattlePicturePlayback;makeAudio=require(path.join(temp,'out/faint-mz.js')).createFaintMediaMZ;plan=require(path.join(temp,'out/faint-schedule.js')).planFaintSchedule;
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const actor={id:'P',side:'p1',name:'Pidgey'};
function picture({effects=true,delay=12,pending=false}={}){
 const f={live:true,update:0,created:[],paints:[],boxes:[],released:[],cries:0,effects:0,disposed:0,polls:0,pending};
 const observations={dedicatedForm:{state:'missing'},dedicatedBase:{state:'missing'},ordinaryForm:{state:'missing'},ordinaryBase:{state:'missing'}};
 if(delay!==12)observations.dedicatedForm={state:'resolved',assetId:'cry',fileSeconds:(delay-2)/20};
 f.result=plan({candidates:observations,battleEffects:effects});
 f.media={poll(){f.polls++;f.onPoll?.();return f.pending?{state:'pending',slot:'dedicatedForm'}:f.result;},playCry(){f.cries++;f.onCry?.();},playEffect(){f.effects++;f.onEffect?.();},dispose(){f.disposed++;f.onDispose?.();},snapshot(){return{};}};
 f.view=new Playback({current:()=>f.live,updateOrdinal:()=>f.update,create:a=>{const h={actor:{...a}};f.created.push(h);return h;},paint:(h,p)=>{f.paints.push({...p});f.onPaint?.();},release:h=>f.released.push(h),failed:e=>assert.fail(String(e)),prepareFaint:()=>{f.onPrepare?.();return f.media;}},effects);
 f.step=f.view.faint(actor,value=>{f.boxes.push(value);f.onBox?.();return f.live;});
 f.at=now=>{f.update++;return f.step.advance(now);};return f;
}
for(const effects of [true,false])test(`mandatory actual consumer has independent parallel tracks effects=${effects}`,()=>{
 const f=picture({effects});assert(!f.at(0));assert.equal(f.cries,1);assert.equal(f.effects,0);assert.equal(f.boxes.at(-1),1);
 assert(!f.at(125));assert.equal(f.boxes.at(-1),.5);assert.equal(f.paints.at(-1).body,1);
 assert(!f.at(250));assert.equal(f.boxes.at(-1),0);assert.equal(f.paints.at(-1).shadow,1);
 assert(!f.at(599));assert.equal(f.effects,0);assert(!f.at(600));assert.equal(f.effects,1);assert.equal(f.paints.at(-1).shadow,0);
 assert(!f.at(850));assert.deepEqual(f.paints.at(-1),{body:.5,shadow:0,drop:.5});
 assert(!f.at(1100));const n=f.paints.length;assert(!f.step.advance(9999));assert.equal(f.paints.length,n);assert.equal(f.disposed,0);
 assert(f.at(1100));assert.equal(f.disposed,0);assert.equal(f.released.length,1);assert.equal(f.view.snapshot().runningGroups,0);f.step.cancel();assert.equal(f.disposed,0);f.view.dispose();assert.equal(f.disposed,1);assert.equal(f.effects,1);
});
test('matched zero duration waits two units rather than missing twelve',()=>{
 const f=picture({delay:2});f.at(0);assert(!f.at(99));assert.equal(f.effects,0);f.at(100);assert.equal(f.effects,1);assert(!f.at(600));assert(f.at(600));
});
test('pending decoding starts no track and same-update repeated reads do not adopt a late resolution',()=>{
 const f=picture({pending:true,delay:22});f.at(0);assert.equal(f.cries,0);assert.equal(f.boxes.length,0);f.pending=false;assert(!f.step.advance(50));assert.equal(f.polls,1);
 assert(!f.at(100));assert.equal(f.cries,1);f.at(1199);assert.equal(f.effects,0);f.at(1200);assert.equal(f.effects,1);assert(!f.at(1700));assert(f.at(1700));
});
for(const where of ['cry','effect','box'])test(`owner loss during ${where} cleans own media/images and late work cannot paint`,()=>{
 const f=picture();f['on'+where[0].toUpperCase()+where.slice(1)]=()=>{f.live=false;};f.at(0);if(where==='effect')f.at(600);
 const n=f.paints.length;assert(f.at(10000));assert.equal(f.paints.length,n);assert.equal(f.disposed,1);assert.equal(f.released.length,1);f.step.cancel();f.view.dispose();assert.equal(f.disposed,1);
});
test('cancel before first sample has no allocation, decoding or sound',()=>{
 const f=picture();f.step.cancel();assert(f.at(100));assert.equal(f.created.length,0);assert.equal(f.polls,0);assert.equal(f.disposed,0);assert.equal(f.cries,0);
});
test('preparation failure is visible and cancellation still releases its portrait',()=>{
 const f=picture();f.result={state:'failed',slot:'ordinaryForm',code:'resource-failed',detail:'read failure'};assert.throws(()=>f.at(0),/read failure/);f.step.cancel();assert.equal(f.disposed,1);assert.equal(f.released.length,1);
});
test('cancellation attempts image release even when the media cleanup throws',()=>{
 const f=picture();f.at(0);f.onDispose=()=>{throw Error('audio cleanup');};f.step.cancel();assert.equal(f.released.length,1);assert.match(f.view.snapshot().cleanupErrors.join(','),/audio cleanup/);f.view.dispose();assert.equal(f.released.length,1);
});
for(const phase of ['Prepare','Poll'])test(`reentrant ${phase} cancellation releases even a just-returned media job`,()=>{
 const f=picture();f['on'+phase]=()=>f.step.cancel();assert(f.at(0));assert.equal(f.disposed,1);assert.equal(f.released.length,1);assert.equal(f.cries,0);f.view.dispose();assert.equal(f.disposed,1);
});
test('pending consumer rejects clock regression between actual updates',()=>{
 const f=picture({pending:true});f.at(0);f.at(100);assert.throws(()=>f.at(50),/clock regressed/);f.step.cancel();
});
function wav(seconds=1){const rate=8000,bytes=Math.round(rate*seconds)*2,b=Buffer.alloc(44+bytes);b.write('RIFF');b.writeUInt32LE(36+bytes,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(bytes,40);return b;}
function audio({pending=false,hook}={}){
 const root=fs.mkdtempSync(path.join(temp,'resources-'));fs.mkdirSync(path.join(root,'audio/se/Cries'),{recursive:true});
 const f={root,live:true,rows:[],sources:[],gains:[],decodes:[],pending:[],closeCalls:0,globalStops:0,hook};
 f.write=(name,seconds=1)=>fs.writeFileSync(path.join(root,'audio/se',name),typeof seconds==='number'?wav(seconds):seconds);
 const make=(kind)=>{const node={kind,starts:0,stops:0,disconnects:0,playbackRate:{value:0},gain:{value:0},connect(){f.hook?.(kind+'-connect');},disconnect(){this.disconnects++;},start(){this.starts++;f.hook?.('start');},stop(){this.stops++;},onended:null};(kind==='source'?f.sources:f.gains).push(node);f.hook?.(kind+'-create');return node;};
 f.G={Utils:{hasEncryptedAudio:()=>false},AudioManager:{seVolume:50,stopSe(){f.globalStops++;}},WebAudio:{_masterGainNode:{foreign:true},_context:{close(){f.closeCalls++;},createBufferSource:()=>make('source'),createGain:()=>make('gain'),decodeAudioData(data){
  const bytes=Buffer.from(data);f.decodes.push(bytes);if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF')return Promise.reject(Error('decode failure'));
  const result={duration:bytes.readUInt32LE(40)/bytes.readUInt32LE(28)};
  if(!pending)return Promise.resolve(result);return new Promise((resolve,reject)=>f.pending.push({resolve:()=>resolve(result),reject}));
 }}}};
 f.make=(identity={species:'Bird',form:1})=>f.media=makeAudio(f.G,require,root,identity,()=>f.live,r=>f.rows.push(r));return f;
}
test('actual local files choose dedicated form, decode seconds and own a 100-percent cry plus independent effect',async()=>{
 const f=audio();for(const name of ['Cries/Bird_1_faint.wav','Cries/Bird_faint.wav','Cries/Bird_1.wav','Cries/Bird.wav'])f.write(name,2);f.write('Pkmn faint.wav',.2);
 const m=f.make();assert.equal(m.poll(0).state,'pending');await flush();const r=m.poll(1);assert.equal(r.state,'ready');assert.equal(r.plan.cry.slot,'dedicatedForm');assert.equal(r.plan.bodyDropStartUnits,42);assert.equal(f.decodes.length,2);
 m.playCry();m.playCry();m.playEffect();m.playEffect();assert.equal(f.sources.length,2);assert(f.sources.every(x=>x.starts===1&&x.playbackRate.value===1));assert(f.gains.every(x=>x.gain.value===.4));
 m.dispose();m.dispose();assert(f.sources.every(x=>x.stops===1&&x.disconnects===1));assert(f.gains.every(x=>x.disconnects===1));assert.equal(f.closeCalls,0);assert.equal(f.globalStops,0);
});
for(const [name,slot,pitch,d]of [['Bird_faint.wav','dedicatedBase',1,22],['Bird_1.wav','ordinaryForm',.75,29],['Bird.wav','ordinaryBase',.75,29]])test(`missing prefix falls to actual ${slot}, same pitch controls playback and scheduling`,async()=>{
 const f=audio();f.write('Cries/'+name);const m=f.make();m.poll(0);await flush();const r=m.poll(1);assert.equal(r.state,'ready');assert.equal(r.plan.cry.slot,slot);assert.equal(r.plan.bodyDropStartUnits,d);m.playCry();assert.equal(f.sources[0].playbackRate.value,pitch);m.dispose();
});
test('missing species cry still requests the independent Pkmn faint cue',async()=>{
 const f=audio();f.write('Pkmn faint.wav');const m=f.make();const r=m.poll(0);assert.equal(r.state,'ready');assert.equal(r.plan.cry,null);assert.equal(r.plan.bodyDropStartUnits,12);await flush();m.playCry();m.playEffect();assert.equal(f.sources.length,1);assert(f.rows.some(r=>r.kind==='faint-cry'&&r.status==='missing'));assert(f.rows.some(r=>r.kind==='faint-effect'));m.dispose();
});
test('selected decode failure never tries a valid lower resource',async()=>{
 const f=audio();f.write('Cries/Bird_1_faint.wav',Buffer.from('unreadable media'));f.write('Cries/Bird.wav');const m=f.make();m.poll(0);await flush();const r=m.poll(1);assert.equal(r.state,'failed');assert.equal(r.slot,'dedicatedForm');assert.equal(f.decodes.length,1);assert.equal(f.sources.length,0);m.dispose();
});
for(const outcome of ['resolve','reject'])test(`cancelled pending ${outcome} cannot allocate nodes or paint a successor`,async()=>{
 const f=audio({pending:true});f.write('Cries/Bird_faint.wav');const m=f.make();assert.equal(m.poll(0).state,'pending');m.dispose();f.live=false;
 for(const d of f.pending)outcome==='resolve'?d.resolve():d.reject(Error('late failure'));await flush();m.playCry();m.playEffect();assert.equal(f.sources.length,0);assert.equal(f.rows.length,0);assert.equal(m.snapshot().retired,true);
});
test('preparation has a finite timeout and does not retry or fall through',()=>{
 const f=audio({pending:true});f.write('Cries/Bird_faint.wav');f.write('Cries/Bird.wav');const m=f.make();assert.equal(m.poll(0).state,'pending');assert.equal(m.poll(4999).state,'pending');const r=m.poll(5000);assert.equal(r.state,'failed');assert.match(r.detail,/timeout/);assert.equal(f.decodes.length,1);m.dispose();
});
for(const phase of ['source-create','gain-create','source-connect','gain-connect','start'])test(`reentrant cancellation at ${phase} reclaims even the newly returned allocation`,async()=>{
 const f=audio();f.write('Cries/Bird_faint.wav');const m=f.make();m.poll(0);await flush();m.poll(1);f.hook=where=>{if(where===phase){f.live=false;m.dispose();}};m.playCry();
 assert(f.sources.every(x=>x.disconnects===1));assert(f.gains.every(x=>x.disconnects===1));assert.equal(m.snapshot().voices,0);assert.equal(f.closeCalls,0);m.dispose();
});
test('playback failure is visible without turning mandatory display completion into a media-read error',async()=>{
 const f=audio();f.write('Cries/Bird_faint.wav');const m=f.make();m.poll(0);await flush();m.poll(1);f.G.WebAudio._context.createBufferSource=()=>{throw Error('device stopped');};m.playCry();assert(f.rows.some(r=>r.kind==='faint-audio-play-failed'));assert.doesNotThrow(()=>m.dispose());
});
test('unavailable or malformed species identity is not used as a traversal path',()=>{
 const f=audio();for(const species of ['../secret','a/b','a\\b','..',''])assert.throws(()=>f.make({species,form:1}).poll(0),/invalid faint/);const m=f.make(null);assert.equal(m.poll(0).state,'ready');m.dispose();
});
test('a cleanup error remains visible while all other owned nodes are still released',async()=>{
 const f=audio();f.write('Cries/Bird_faint.wav');f.write('Pkmn faint.wav');const m=f.make();m.poll(0);await flush();m.poll(1);m.playCry();m.playEffect();f.sources[0].stop=()=>{throw Error('stop failed');};
 assert.throws(()=>m.dispose(),/owned faint audio cleanup.*stop failed/);assert(f.sources.every(x=>x.disconnects===1));assert(f.gains.every(x=>x.disconnects===1));assert.equal(f.sources[1].stops,1);assert.equal(m.snapshot().voices,0);assert.doesNotThrow(()=>m.dispose());assert.equal(f.closeCalls,0);
});
test('symlinked media outside the owned resource directory is rejected before decoding',()=>{
 const f=audio(),outside=path.join(temp,'outside.wav');fs.writeFileSync(outside,wav());fs.symlinkSync(outside,path.join(f.root,'audio/se/Cries/Bird_faint.wav'));
 assert.throws(()=>f.make().poll(0),/outside game resources/);assert.equal(f.decodes.length,0);
});
