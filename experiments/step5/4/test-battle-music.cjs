'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,Playback,config,track,makeMZ;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-battle-music-'));const root=path.join(ROOT,'src/plugins/battleflow');
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'out'),noEmitOnError:true},files:['battle-music.ts','battle-music-mz.ts'].map(f=>path.join(root,f))}));
 const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 ({BattleMusicPlayback:Playback,battleMusicConfig:config,musicTrack:track}=require(path.join(temp,'out/battle-music.js')));makeMZ=require(path.join(temp,'out/battle-music-mz.js')).createBattleMusicMZ;
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function pure(memory={memo:null,pending:null}){
 const f={live:true,memory,order:[],rows:[],leases:[],position:17,current:'A'};
 f.port={current:()=>f.live,currentTrack(){f.order.push('current');f.onCurrent?.();return f.current===null?null:track(f.current);},position(){f.order.push('position');f.onPosition?.();if(f.positionError)throw Error('position');return f.position;},request(t,p,terminal,observe){f.order.push('request');f.onRequest?.();const l={released:0,release(){this.released++;}};f.leases.push(l);f.rows.push({t,p,terminal,observe});observe({state:f.mediaError?'failed':'requested',detail:f.mediaError?'media failure':undefined});return l;}};
 f.player=new Playback(f.port,memory);return f;
}
test('parameters: direct strings default 100/100; parsed presets and records retain independent values',()=>{
 assert.deepEqual(track('Theme:70:120'),{name:'Theme',volume:100,pitch:100,pan:0});assert.deepEqual(track('Theme:70:120',true),{name:'Theme',volume:70,pitch:120,pan:0});assert.equal(track('Theme:120',true).pitch,100);
 assert.deepEqual(track({name:'A',volume:70,pitch:120,pan:-20}),{name:'A',volume:70,pitch:120,pan:-20});
 for(const bad of [null,[],{name:2},'A:x','A:1:2:3',{name:'A',volume:Infinity},{name:'A',pitch:-1},{name:'A',pan:101},'A:'+('9'.repeat(400))])assert.throws(()=>track(bad,true),/invalid battle music/);
});
test('raw presets empty/string/object are normalized once, three slots and metadata stay independent',()=>{
 const input={presets:{battle:'X:70:120',victory:'',capture:{name:'C',volume:80}},map:{wildBattle:'M'},global:{wildBattle:'G'}},c=config(input);input.presets.battle='new';input.map.wildBattle='new';assert(Object.isFrozen(c.context));
 assert.equal(c.context.presets.battle,'X');assert(!('victory'in c.presets));assert.equal(c.presets.battle.volume,70);assert.equal(c.presets.capture.volume,80);assert.equal(c.context.map.wildBattle,'M');
 const f=pure();f.player.start(c);assert.equal(f.rows[0].t.volume,70);assert.equal(f.rows[0].t.pitch,120);assert.equal(c.context.presets.battle,'X');
});
test('invalid raw config is refused rather than silently becoming default music',()=>{
 for(const value of [null,[],{presets:2},{presets:{battle:0}},{map:{wildBattle:false}},{global:[]}])assert.throws(()=>config(value),/invalid battle music/);
});
test('trainer projection fields use the existing pure selector and preserve its last-empty fallback',()=>{
 const f=pure();f.player.start(config({map:{trainerBattle:'M'}}),[{battleBgm:'B'},{battleBgm:''}]);assert.equal(f.rows[0].t.name,'M');
 const g=pure();g.player.start(config(),[{battleBgm:'B:70:120'}]);assert.equal(g.rows[0].t.name,'B');assert.equal(g.rows[0].t.volume,100);
});
test('PT58 pending Q is cancelled and remembered at zero before I request, not current A',()=>{
 const memory={memo:null,pending:{track:{name:'Q',volume:100,pitch:100,pan:0},cancel(){f.order.push('cancel');}}},f=pure(memory);f.player.intro('I');
 assert.deepEqual(f.order,['cancel','request']);assert.equal(memory.memo.track.name,'Q');assert.equal(memory.memo.position,0);assert.equal(memory.pending,null);assert.equal(f.rows[0].t.name,'I');
});
test('PT59 existing R9 retains pending Q timer and is visible before intro delivery',()=>{
 const memo={track:{name:'R',volume:100,pitch:100,pan:0},position:9},pending={track:{name:'Q',volume:100,pitch:100,pan:0},cancel(){assert.fail('must retain pending');}},f=pure({memo,pending});f.onRequest=()=>assert.equal(f.memory.memo,memo);f.player.intro('I');assert.equal(f.memory.pending,pending);assert.equal(f.memory.memo,memo);assert.deepEqual(f.order,['request']);
});
test('PT60 current A17 is memorized before request; normal return has original position exactly once',()=>{
 const f=pure();f.onRequest=()=>assert.equal(f.memory.memo.track.name,'A');f.player.intro('I');assert.deepEqual(f.order,['current','position','request']);assert.equal(f.memory.memo.position,17);
 f.player.start(config({global:{wildBattle:'B'}}));assert.equal(f.memory.memo.track.name,'A');f.player.restore();f.player.restore();assert.equal(f.rows.length,3);assert.deepEqual(f.rows[2],{...f.rows[2],t:track('A'),p:17,terminal:true});
});
test('PT61 only failed position query falls back to zero; current-track failure still propagates',()=>{
 const f=pure();f.positionError=true;f.player.intro('I');assert.equal(f.memory.memo.position,0);
 const g=pure();g.onCurrent=()=>{throw Error('registration');};assert.throws(()=>g.player.intro('I'),/registration/);assert.equal(g.rows.length,0);assert.equal(g.memory.memo,null);
});
test('PT62 nil/empty intro does not request, read host, modify memo or cancel a timer',()=>{
 for(const value of [null,undefined,'']){const f=pure({memo:{track:track('R'),position:9},pending:{track:track('Q'),cancel(){assert.fail();}}});const before=f.memory;f.player.intro(value);assert.equal(f.memory,before);assert.equal(f.memory.memo.position,9);assert.equal(f.order.length,0);}
});
test('media request failure preserves preceding memo/cancel side effects and has visible failure',()=>{
 const f=pure();f.mediaError=true;f.player.intro('I');assert.equal(f.memory.memo.position,17);assert.equal(f.player.snapshot().requests[0].detail,'media failure');
 f.port.request=()=>{throw Error('backend');};f.player.start(config());assert.equal(f.player.snapshot().requests.at(-1).state,'failed');assert.equal(f.memory.memo.track.name,'A');
});
for(const step of ['Current','Position','Request'])test(`owner replacement during ${step} cannot leave a new lease or restore into successor`,()=>{
 const f=pure();f['on'+step]=()=>{f.live=false;};f.player.intro('I');f.player.restore();assert.equal(f.rows.length,step==='Request'?1:0);if(step==='Request')assert.equal(f.leases[0].released,1);
});
test('cancel during request before its handle returns releases that exact newly returned lease',()=>{
 const f=pure();f.onRequest=()=>f.player.cancel();f.player.intro('I');assert.equal(f.leases[0].released,1);assert(f.player.snapshot().closed);f.player.cancel();assert.equal(f.leases[0].released,1);
});
test('reentrant intro/start from a host position query does not recurse or duplicate memory/request',()=>{
 const f=pure();f.onPosition=()=>{f.player.intro('nested');f.player.start(config());};f.player.start(config());assert.equal(f.rows.length,1);assert.equal(f.rows[0].t.name,'Battle wild');f.player.start(config());assert.equal(f.rows.length,1);
});
test('snapshots are detached; cancelled player no longer issues requests or clears caller presets/memo',()=>{
 const f=pure();f.player.start(config());const s=f.player.snapshot();s.memo.track.name='bad';s.requests[0].logical.name='bad';assert.equal(f.player.snapshot().memo.track.name,'A');assert.equal(f.player.snapshot().requests[0].logical.name,'Battle wild');f.player.cancel();f.player.intro('I');f.player.restore();assert.equal(f.rows.length,1);assert.equal(f.memory.memo.track.name,'A');
});
function host({ready=false,hasMap=true,override,requireOverride}={}){
 const root=fs.mkdtempSync(path.join(temp,'mz-'));fs.mkdirSync(path.join(root,'audio/bgm'),{recursive:true});
 const f={root,live:true,time:0,timers:new Map(),seq:0,buffers:[],rows:[],stops:0,updates:[],plays:[],hook:null};
 f.write=(name='B')=>{const file=path.join(root,'audio/bgm',name+'.ogg');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic file; buffer is a controlled port');};
 const map=hasMap?{name:'Map',volume:80,pitch:100,pan:0,pos:17}:null;
 const initial=hasMap?{seek:()=>17,destroy(){this.destroyed=(this.destroyed||0)+1;}}:null;
 f.audio={_currentBgm:map,_bgmBuffer:initial,_meBuffer:null,bgmVolume:50,audioFileExt:()=>'.ogg',createBuffer(folder,name){assert.equal(folder,'bgm/');const b={name,ready,error:false,destroyed:0,listeners:[],isReady(){return this.ready;},isError(){return this.error;},addLoadListener(fn){this.listeners.push(fn);f.hook?.('listener');if(this.ready)fn();},play(loop,pos){f.plays.push({b:this,loop,pos});f.hook?.('play');},destroy(){this.destroyed++;f.hook?.('destroy');},seek:()=>23};f.buffers.push(b);f.hook?.('create');return b;},updateBufferParameters(b,v,t){f.updates.push({b,volume:v*t.volume/100,track:{...t}});f.hook?.('parameters');},stopBgm(){f.stops++;this._bgmBuffer?.destroy();this._bgmBuffer=null;this._currentBgm=null;f.hook?.('stop');}};
 f.initial=initial;f.map=map;f.clock={now:()=>f.time,after(ms,cb){const id=++f.seq;f.timers.set(id,{at:f.time+ms,cb});return id;},clear(id){f.timers.delete(id);}};
 f.advance=now=>{f.time=now;for(let n=0;n<1000;n++){const entry=[...f.timers].find(([,x])=>x.at<=f.time);if(!entry)return;f.timers.delete(entry[0]);entry[1].cb();}assert.fail('unbounded timer loop');};
 f.load=(b=f.buffers.at(-1))=>{b.ready=true;for(const cb of [...b.listeners])cb();};
 f.port=makeMZ({AudioManager:f.audio,Utils:{hasEncryptedAudio:()=>false},performance:{now:()=>f.time}},requireOverride??require,root,()=>f.live,{clock:f.clock,...(override?{defaultBgm:override}:{})});
 f.request=(name='B',terminal=false,pos=0)=>f.port.request(name===null?null:track(name),pos,terminal,row=>f.rows.push(row));
 return f;
}
test('MZ prepares privately: no global replacement until decoded; channel uses music volume and requested position',()=>{
 const f=host();f.write();const l=f.port.request(track({name:'B',volume:70}),4,false,r=>f.rows.push(r));assert.equal(f.stops,0);assert.equal(f.audio._bgmBuffer,f.initial);assert.equal(f.plays.length,0);f.load();assert.equal(f.stops,1);assert.equal(f.initial.destroyed,1);assert.equal(f.plays[0].pos,4);assert.equal(f.updates[0].volume,35);assert.equal(f.audio._currentBgm.name,'B');assert.equal(f.rows.at(-1).state,'requested');assert.equal(f.timers.size,0);l.release();l.release();assert.equal(f.buffers[0].destroyed,1);assert.equal(f.audio._bgmBuffer,null);
});
test('missing BGM records logical request in controller but leaves current host output untouched',()=>{
 const f=host(),player=new Playback(f.port);player.start(config({global:{wildBattle:'Missing'}}));assert.equal(player.snapshot().logical.name,'Missing');assert.equal(player.snapshot().requests[0].state,'missing');assert.equal(f.stops,0);assert.equal(f.audio._currentBgm,f.map);player.cancel();assert.equal(f.initial.destroyed,undefined);
});
test('decoding owner cancellation suppresses late autoplay and does not stop map output',()=>{
 const f=host();f.write();const l=f.request();const b=f.buffers[0];f.live=false;f.load();assert.equal(f.plays.length,0);assert.equal(f.stops,0);assert.equal(b.destroyed,1);assert.equal(f.rows.at(-1).state,'superseded');l.release();assert.equal(b.destroyed,1);assert.equal(f.timers.size,0);
});
test('decode deadline is independent of Scene polls, and exact-deadline late load cannot start',()=>{
 for(const lateTimer of [false,true]){const f=host();f.write();f.request();if(lateTimer)f.time=5000;else f.advance(5000);f.load();assert.equal(f.plays.length,0);assert.equal(f.stops,0);assert.equal(f.rows.at(-1).state,'timeout');assert.equal(f.timers.size,0);assert.equal(f.buffers[0].destroyed,1);}
});
test('error and clock failures are diagnosed, bounded and cannot publish a buffer',()=>{
 for(const kind of ['error','regression','invalid']){const f=host();f.write();f.request();if(kind==='error'){f.buffers[0].error=true;f.advance(25);}else{f.time=kind==='invalid'?NaN:-1;f.load();}assert.equal(f.rows.at(-1).state,'failed');assert.equal(f.plays.length,0);assert.equal(f.timers.size,0);assert.equal(f.buffers[0].destroyed,1);}
});
test('new logical request cancels earlier pending decoding even when new resource is missing',()=>{
 const f=host();f.write('B');f.request('B');f.request('Missing');f.load(f.buffers[0]);assert.equal(f.plays.length,0);assert.equal(f.rows.at(-1).state,'missing');assert.equal(f.timers.size,0);
});
test('late old callbacks cannot play over a newer ready BGM or stop its channel',()=>{
 const f=host();f.write('B');f.write('C');const old=f.request('B'),next=f.request('C');f.load(f.buffers[1]);old.release();f.load(f.buffers[0]);assert.deepEqual(f.plays.map(x=>x.b.name),['C']);assert.equal(f.audio._currentBgm.name,'C');next.release();assert.equal(f.audio._bgmBuffer,null);
});
test('foreign channel changes block publication, cleanup and even terminal return replacement',()=>{
 const f=host();f.write();const l=f.request();const foreign={destroy(){assert.fail('foreign teardown');}};f.audio._bgmBuffer=foreign;f.audio._currentBgm={name:'Foreign'};f.load();l.release();f.request('B',true);assert.equal(f.plays.length,0);assert.equal(f.audio._bgmBuffer,foreign);assert.equal(f.rows.at(-1).state,'superseded');
});
test('same-buffer newer registration is not destroyed by the old lease',()=>{
 const f=host({ready:true});f.write();const l=f.request();const b=f.audio._bgmBuffer;f.audio._currentBgm={...f.audio._currentBgm};l.release();assert.equal(b.destroyed,0);assert.equal(f.audio._bgmBuffer,b);
});
test('terminal restore retains original position and survives old player cancellation after handoff',()=>{
 const f=host({ready:true});f.write('B');f.write('Map');const p=new Playback(f.port);p.start(config({global:{wildBattle:'B'}}));p.restore();assert.deepEqual(f.plays.map(x=>[x.b.name,x.pos]),[['B',0],['Map',17]]);const returned=f.audio._bgmBuffer;p.cancel();assert.equal(f.audio._bgmBuffer,returned);assert.equal(returned.destroyed,0);
});
test('pending restore still belongs to its operation and cancellation cannot later start world music',()=>{
 const f=host();f.write('B');f.write('Map');const p=new Playback(f.port);p.start(config({global:{wildBattle:'B'}}));f.load();p.restore();const restore=f.buffers.at(-1);p.cancel();f.load(restore);assert.deepEqual(f.plays.map(x=>x.b.name),['B']);assert.equal(restore.destroyed,1);
});
test('empty original map BGM restores silence; default override changes host song but not logical requested song',()=>{
 const f=host({hasMap:false,ready:true});f.write();const p=new Playback(f.port);p.start(config({global:{wildBattle:'B'}}));p.restore();assert.equal(f.audio._bgmBuffer,null);assert.equal(p.snapshot().memo.track,null);
 const g=host({ready:true,override:{name:'Default',volume:40}});g.write('Default');const q=new Playback(g.port);q.start(config({global:{wildBattle:'Logical'}}));assert.equal(q.snapshot().logical.name,'Logical');assert.equal(g.plays[0].b.name,'Default');assert.equal(g.updates[0].volume,20);q.cancel();
});
test('active MZ ME defers BGM start without stealing or stopping the ME channel',()=>{
 const f=host({ready:true});f.write();const me={};f.audio._meBuffer=me;f.request();assert.equal(f.plays.length,0);assert.equal(f.audio._meBuffer,me);assert.equal(f.audio._currentBgm.name,'B');assert.equal(f.rows.at(-1).state,'requested');
});
for(const where of ['create','parameters','stop','play'])test(`reentrant owner change at MZ ${where} cannot retain an owned buffer or overwrite successor`,()=>{
 const f=host({ready:true});f.write();f.hook=event=>{if(event===where)f.live=false;};const lease=f.request();lease.release();assert.equal(f.buffers[0].destroyed,1);assert.equal(f.timers.size,0);if(where!=='play')assert.equal(f.plays.length,0);
});
test('reentrant stop callback installs successor channel, which must not be overwritten or destroyed',()=>{
 const f=host({ready:true});f.write();const other={destroy(){assert.fail('successor destroyed');}};f.hook=event=>{if(event==='stop'){f.audio._bgmBuffer=other;f.audio._currentBgm={name:'Other'};}};f.request();assert.equal(f.audio._bgmBuffer,other);assert.equal(f.buffers[0].destroyed,1);assert.equal(f.plays.length,0);assert.equal(f.rows.at(-1).state,'superseded');
});
test('MZ resource identities, symlink escape and actual permission failures fail closed, no fictional missing success',()=>{
 const f=host();for(const name of ['../A','/A','A\\B','A/../B','A?x','A%2fB','A//B']){f.request(name);assert.equal(f.rows.at(-1).state,'failed');}assert.equal(f.buffers.length,0);
 const external=path.join(temp,'external.ogg');fs.writeFileSync(external,'x');fs.symlinkSync(external,path.join(f.root,'audio/bgm/Escape.ogg'));f.request('Escape');assert.equal(f.rows.at(-1).state,'failed');assert.match(f.rows.at(-1).detail,/escapes/);
 const g=host({requireOverride:name=>name==='fs'?{...fs,realpathSync(){throw Object.assign(Error('permission denied'),{code:'EACCES'});}}:require(name)});g.request();assert.equal(g.rows.at(-1).state,'failed');assert.match(g.rows.at(-1).detail,/permission denied/);
});
test('decode cleanup failure preserves original error diagnosis and never publishes success',()=>{
 const f=host();f.write();f.request();f.buffers[0].error=true;f.buffers[0].destroy=()=>{throw Error('destroy failure');};f.advance(25);assert.equal(f.rows.at(-1).state,'failed');assert.match(f.rows.at(-1).detail,/decoding failed.*cleanup:.*destroy failure/);assert.equal(f.plays.length,0);assert.equal(f.timers.size,0);
});
test('invalid adapter position and terminal routing never get to the MZ player',()=>{
 const f=host({ready:true});f.write();for(const value of [-1,NaN,Infinity])f.port.request(track('B'),value,false,r=>f.rows.push(r));f.port.request(track('B'),0,'yes',r=>f.rows.push(r));assert.equal(f.rows.length,4);assert(f.rows.every(r=>r.state==='failed'));assert.equal(f.buffers.length,0);
});
test('repeated undecoded callbacks retain one independent timer rather than multiplying poll loops',()=>{
 const f=host();f.write();const lease=f.request();const cb=f.buffers[0].listeners[0];for(let i=0;i<20;i++)cb();assert.equal(f.timers.size,1);f.advance(25);assert.equal(f.timers.size,1);lease.release();assert.equal(f.timers.size,0);
});
test('controller cancellation during synchronous buffer creation cannot publish before handle returns',()=>{
 const f=host({ready:true});f.write();const p=new Playback(f.port);f.hook=event=>{if(event==='create')p.cancel();};p.start(config({global:{wildBattle:'B'}}));assert.equal(f.plays.length,0);assert.equal(f.buffers[0].destroyed,1);assert.equal(f.timers.size,0);
});
test('silent return under a default override remains explicit unsupported, never a successful stop',()=>{
 const f=host({ready:true,override:'Default'});f.write('Default');f.request('B');const active=f.audio._bgmBuffer;f.request(null,true);assert.equal(f.rows.at(-1).state,'failed');assert.match(f.rows.at(-1).detail,/outer wrapper/);assert.equal(f.audio._bgmBuffer,active);assert.equal(active.destroyed,0);
});
test('silent return stop callback cannot adopt a foreign channel as its own or permit a following overwrite',()=>{
 const f=host({ready:true});f.write();f.request();const foreign={destroy(){assert.fail('foreign channel destroyed');}};f.hook=event=>{if(event==='stop'){f.audio._bgmBuffer=foreign;f.audio._currentBgm={name:'Other'};}};f.request(null,true);assert.equal(f.rows.at(-1).state,'superseded');assert(!f.port.current());f.request();assert.equal(f.rows.at(-1).state,'superseded');assert.equal(f.audio._bgmBuffer,foreign);assert.equal(f.plays.length,1);
});
test('silent return owner loss during stop cannot be reported as completed delivery',()=>{
 const f=host({ready:true});f.write();f.request();f.hook=event=>{if(event==='stop')f.live=false;};f.request(null,true);assert.equal(f.rows.at(-1).state,'superseded');assert.equal(f.audio._bgmBuffer,null);
});
