'use strict';
// Selected installed MZ AudioManager/WebAudio lifecycle bodies are real; decoder,
// sources, clock and renderer are controlled. Real temporary filesystem, no NW.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,make,Wait,parse;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-capture-me-port-'));const root=process.env.PF_CAPTURE_PORT_SOURCE||path.join(ROOT,'src/plugins/battleflow');
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'out'),noEmitOnError:true},files:[path.join(root,'capture-me-mz.ts')]}));
 const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);make=require(path.join(temp,'out/capture-me-mz.js')).createCaptureMEMZ;Wait=require(path.join(temp,'out/capture-melody.js')).CaptureMelodyWait;parse=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst;
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function install(G,file,left){const text=fs.readFileSync(path.join(ROOT,'js',file),'utf8');let node;(function walk(n){if(!n||typeof n!=='object'||node)return;if(Array.isArray(n))return n.forEach(walk);if(n.type==='AssignmentExpression'&&text.slice(n.left.start,n.left.end)===left)node=n;else Object.values(n).forEach(walk);})(parse(text));assert(node,left);vm.runInContext(text.slice(node.start,node.end)+';',G);}
function host({ready=false,encrypted=false}={}){
 const f={root:fs.mkdtempSync(path.join(temp,'game-')),time:0,timers:new Map(),ordinal:0,live:true,buffers:[],events:[],hook:null,createError:null,volume:60,fsError:null};fs.mkdirSync(path.join(f.root,'audio/me'),{recursive:true});
 function AudioBuffer(){this._stopListeners=[];this._loadListeners=[];this.ready=ready;this.error=false;this.plays=[];this.destroyed=0;this.stopped=0;this._isPlaying=false;this.queued=[];this.failDestroy=0;}
 Object.assign(AudioBuffer.prototype,{_removeEndTimer(){},_removeNodes(){},_destroyDecoder(){},isReady(){return this.ready;},isError(){return this.error;},isPlaying(){return this._isPlaying;},seek(){f.hook?.('seek',this);return this.position??7;},fadeIn(n){this.fade=n;f.hook?.('fade',this);},play(loop,pos){this._isPlaying=true;this.plays.push({loop,pos,at:f.time});f.events.push(['play',this.name]);f.hook?.('play',this);}});
 const audio={_meBuffer:null,_bgmBuffer:null,_currentBgm:null,_meVolume:60,_bgmVolume:50,_replayFadeTime:0.5,_bgmSequence:null,stopBgmSequence(){},audioFileExt:()=>'.ogg'};
 Object.defineProperty(audio,'meVolume',{get:()=>audio._meVolume});
 const G={AudioManager:audio,WebAudio:AudioBuffer,Utils:{hasEncryptedAudio:()=>encrypted},Error};vm.createContext(G);AudioBuffer._loadWatchList=[];
 for(const name of ['stop','clear','destroy','addStopListener','addLoadListener'])install(G,'reactor_core.js','WebAudio.prototype.'+name);
 const stop=AudioBuffer.prototype.stop;AudioBuffer.prototype.stop=function(){this.stopped++;return stop.call(this);};
 const destroy=AudioBuffer.prototype.destroy;AudioBuffer.prototype.destroy=function(){if(this.failDestroy-->0)throw Error('controlled destroy refusal');this.destroyed++;f.hook?.('destroy',this);const value=destroy.call(this);this.ready=false;return value;};
 const listen=AudioBuffer.prototype.addLoadListener;AudioBuffer.prototype.addLoadListener=function(fn){this.queued.push(fn);return listen.call(this,fn);};
 for(const name of ['playMe','stopMe','updateMeParameters','updateBufferParameters','playBgm','stopBgm','isCurrentBgm','updateBgmParameters','updateCurrentBgm'])install(G,'reactor_managers.js','AudioManager.'+name);
 f.makeBuffer=name=>{const b=new AudioBuffer();b.name=name;for(const field of ['volume','pitch','pan']){let v;Object.defineProperty(b,field,{get:()=>v,set:n=>{v=n;f.hook?.('parameters',b);},configurable:true});}AudioBuffer._loadWatchList.push(b);f.buffers.push(b);return b;};
 audio.createBuffer=function(folder,name){f.events.push(['create',folder,name]);if(f.createError)throw f.createError;const b=f.makeBuffer(name);b.folder=folder;f.hook?.('create',b);return b;};
 f.bgm=f.makeBuffer('World');f.bgm._isPlaying=true;f.bgm.ready=true;audio._bgmBuffer=f.bgm;audio._currentBgm={name:'World',pos:0,volume:100,pitch:100,pan:0};
 f.clock={now:()=>f.time,after(ms,fn){const id=++f.ordinal;f.timers.set(id,{at:f.time+ms,fn});return id;},clear(id){f.timers.delete(id);}};
 f.advance=time=>{f.time=time;for(let i=0;i<1000;i++){const due=[...f.timers].find(([,v])=>v.at<=time);if(!due)return;f.timers.delete(due[0]);due[1].fn();}assert.fail('timer loop did not stop');};
 f.resolve=b=>{b.ready=true;for(const fn of b._loadListeners.splice(0))fn();};f.late=b=>{for(const fn of b.queued)fn();};f.end=b=>b.stop();
 f.write=(name='Capture')=>{const file=path.join(f.root,'audio/me',name+'.ogg'+(encrypted?'_':''));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'controlled decode fixture; not real audio');};f.write();
 const fakeFS=new Proxy(fs,{get(target,key){if(key==='realpathSync'&&f.fsError)return()=>{throw f.fsError;};return target[key];}}),req=n=>n==='fs'?fakeFS:n==='path'?path:assert.fail('unexpected require '+n);
 f.current=()=>{f.hook?.('current');return f.live;};f.createPort=()=>make(G,req,f.root,f.current,f.clock);f.port=f.createPort();f.request=(start=0,name='Capture')=>f.port.request({name,volume:70,pitch:120,pan:-20},start);f.audio=audio;f.G=G;return f;
}

test('private decode does not pause BGM until publication; actual parameter scaling and stop/resume semantics match MZ',()=>{
 const f=host(),l=f.request(),b=f.buffers.at(-1);assert.equal(l.snapshot().status,'loading');assert.equal(f.audio._meBuffer,null);assert(f.bgm.isPlaying());assert.equal(b.plays.length,0);assert(!l.snapshot().stopConfirmed);
 f.audio._meVolume=40;f.time=100;f.resolve(b);assert.equal(l.snapshot().status,'playing');assert.equal(f.audio._meBuffer,b);assert(!f.bgm.isPlaying());assert.deepEqual(b.plays,[{loop:false,pos:0,at:100}]);assert(Math.abs(b.volume-.28)<1e-10);assert.equal(b.pitch,1.2);assert.equal(b.pan,-.2);
 f.advance(3500);const view=l.snapshot();assert(view.deadlineReached&&view.stopConfirmed&&view.retired);assert.equal(view.status,'stopped');assert.equal(f.audio._meBuffer,null);assert.equal(b.destroyed,1);assert(f.bgm.isPlaying());assert.deepEqual(f.bgm.plays,[{loop:true,pos:7,at:3500}]);assert.equal(f.bgm.destroyed,0);assert.equal(f.timers.size,0);
});
test('cached decode requests once; duplicate load callbacks do not replay and snapshots are detached',()=>{
 const f=host({ready:true}),l=f.request(),b=f.buffers.at(-1);assert.equal(b.plays.length,1);f.late(b);f.late(b);assert.equal(b.plays.length,1);const v=l.snapshot();v.track.name='changed';v.errors.push('fake');assert.equal(l.snapshot().track.name,'Capture');assert.deepEqual(l.snapshot().errors,[]);l.release();assert.equal(f.timers.size,0);
});
test('missing and decode failure release media but do not acknowledge or shorten the pure3500 wait',()=>{
 for(const kind of ['missing','decode-error','create-error']){const f=host();if(kind==='missing')fs.unlinkSync(path.join(f.root,'audio/me/Capture.ogg'));if(kind==='create-error')f.createError=Error('create fail');const wait=new Wait();wait.begin(0);const l=f.request();if(kind==='decode-error'){f.buffers.at(-1).error=true;f.advance(25);}assert.equal(l.snapshot().status,kind==='missing'?'missing':'failed');assert(f.bgm.isPlaying());assert(wait.advance(3499).busy);assert.throws(()=>wait.acknowledgeStop(),/not due/);f.advance(3500);assert(l.snapshot().deadlineReached);assert(l.snapshot().stopConfirmed);wait.advance(3500);assert.equal(wait.acknowledgeStop().phase,'done');assert.equal(f.timers.size,0);if(kind!=='missing')assert(l.snapshot().errors.length);}
});
test('deadline is logical begin plus3500, not decode-ready; at/after deadline even delayed timer cannot play',()=>{
 for(const time of [3500,8000]){const f=host(),l=f.request(),b=f.buffers.at(-1);f.time=time;f.resolve(b);assert.equal(b.plays.length,0);assert.equal(l.snapshot().status,'timeout');assert(l.snapshot().deadlineReached);assert(l.snapshot().stopConfirmed);f.late(b);assert.equal(b.plays.length,0);assert.equal(f.timers.size,0);}
 const f=host();f.time=1000;const l=f.request(0),b=f.buffers.at(-1);f.time=3499;f.resolve(b);assert.equal(b.plays[0].at,3499);f.advance(3500);assert(l.snapshot().stopConfirmed);assert.equal(b.destroyed,1);
});
test('already expired or future/invalid phase clocks never allocate an audio buffer',()=>{
 const f=host();f.time=5000;const before=f.buffers.length,l=f.request(0);assert.equal(l.snapshot().status,'timeout');assert.equal(f.buffers.length,before);for(const bad of [NaN,Infinity,-1,6000,Number.MAX_SAFE_INTEGER])assert.throws(()=>f.request(bad),/clock/);assert.equal(f.buffers.length,before);
});
for(const when of ['loading','playing'])test('owner cancellation during '+when+' releases only own resources and suppresses late callbacks',()=>{
 const f=host({ready:when==='playing'}),l=f.request(),b=f.buffers.at(-1);f.live=false;f.advance(25);assert.equal(l.snapshot().status,'superseded');assert(l.snapshot().retired&&l.snapshot().stopConfirmed);const n=b.plays.length;f.late(b);assert.equal(b.plays.length,n);assert.equal(f.bgm.destroyed,0);assert.equal(f.timers.size,0);
});
test('explicit cancel and retry after destroy failure expose failed confirmation, never silently succeed',()=>{
 const f=host({ready:true}),l=f.request(),b=f.buffers.at(-1);b.failDestroy=1;f.advance(3500);assert(!l.snapshot().stopConfirmed);assert(l.snapshot().fault?.includes('stop failed'));assert.equal(f.timers.size,0);assert(!f.bgm.isPlaying(),'failed ME stop must not resume BGM over a possibly-live source');assert(l.release().stopConfirmed);assert(f.bgm.isPlaying());assert.equal(l.snapshot().status,'stopped');const destroyed=b.destroyed;l.release();f.late(b);assert.equal(b.destroyed,destroyed);assert(l.snapshot().errors.length);
});
test('new external ME while decoding is preserved and the pending old private buffer never plays',()=>{
 const f=host(),l=f.request(),old=f.buffers.at(-1);f.audio.playMe({name:'External',volume:100,pitch:100,pan:0});const other=f.audio._meBuffer;f.resolve(old);assert.equal(l.snapshot().status,'superseded');assert.equal(f.audio._meBuffer,other);assert.equal(other.destroyed,0);assert.equal(old.plays.length,0);assert(old.destroyed);assert.equal(f.timers.size,0);
});
test('a preceding ME can end naturally before private decode without vetoing the new capture',()=>{
 const f=host();f.audio.playMe({name:'Previous',volume:100,pitch:100,pan:0});const previous=f.audio._meBuffer,l=f.request(),b=f.buffers.at(-1);f.end(previous);assert.equal(f.audio._meBuffer,null);f.resolve(b);assert.equal(l.snapshot().status,'playing');assert.equal(f.audio._meBuffer,b);l.release();
});
test('natural ME completion waits out the fixed phase, resumes BGM once and does not call global stop on a successor',()=>{
 const f=host({ready:true}),l=f.request(),b=f.buffers.at(-1);f.time=100;f.end(b);f.advance(100);assert.equal(l.snapshot().status,'ended');assert(l.snapshot().stopConfirmed);assert(!l.snapshot().deadlineReached);assert.equal(f.bgm.plays.length,1);f.advance(200);assert.equal(l.snapshot().status,'ended');f.advance(3500);assert(l.snapshot().deadlineReached);assert.equal(f.bgm.plays.length,1);
});
test('native playMe replacing the owned ME cannot be undone by its old natural/destroy callback',()=>{
 const f=host({ready:true}),l=f.request(),old=f.buffers.at(-1);f.audio.playMe({name:'External',volume:100,pitch:100,pan:0});const other=f.audio._meBuffer;f.advance(0);assert.equal(f.audio._meBuffer,other);assert.equal(other.destroyed,0);l.release();f.late(old);assert.equal(f.audio._meBuffer,other);assert.equal(other.destroyed,0);
});
test('external successor installed during own destroy survives and prevents stale BGM resume',()=>{
 const f=host({ready:true}),l=f.request(),b=f.buffers.at(-1);let other;f.hook=(kind,value)=>{if(kind==='destroy'&&value===b){f.hook=null;other=f.makeBuffer('Successor');other._isPlaying=true;f.audio._meBuffer=other;}};l.release();assert.equal(f.audio._meBuffer,other);assert.equal(other.destroyed,0);assert.equal(f.bgm.plays.length,0);assert(l.snapshot().stopConfirmed);
});
test('a successor BGM queued under ME is the one resumed; the old BGM is never adopted or destroyed by the adapter',()=>{
 const f=host({ready:true}),l=f.request();f.audio.playBgm({name:'New world',volume:100,pitch:100,pan:0},13);const bgm=f.audio._bgmBuffer;assert(!bgm.isPlaying());f.advance(3500);assert.equal(f.audio._bgmBuffer,bgm);assert.equal(bgm.destroyed,0);assert.deepEqual(bgm.plays,[{loop:true,pos:13,at:3500}]);assert(l.snapshot().stopConfirmed);
});
for(const event of ['create','parameters','play'])test('replacement reentry during '+event+' cannot publish or keep stale ME',()=>{
 const f=host({ready:true});f.hook=kind=>{if(kind===event){f.hook=null;f.live=false;}};const l=f.request();assert.equal(l.snapshot().status,'superseded');assert.equal(f.audio._meBuffer,null);assert(l.snapshot().stopConfirmed);assert.equal(f.timers.size,0);
});
test('request supersession retires only the previous lease; two adapters can safely share a backend',()=>{
 const f=host({ready:true}),a=f.request(),old=f.audio._meBuffer,port2=f.createPort(),b=port2.request({name:'Capture',volume:100,pitch:100,pan:0},0),next=f.audio._meBuffer;assert.notEqual(old,next);a.release();assert.equal(f.audio._meBuffer,next);assert.equal(next.destroyed,0);b.release();assert.equal(f.audio._meBuffer,null);
});
test('a backend returning the already published buffer is rejected without mutating that predecessor',()=>{
 const f=host({ready:true}),a=f.request(),shared=f.audio._meBuffer,volume=shared.volume,create=f.audio.createBuffer;f.audio.createBuffer=()=>shared;const b=f.createPort().request({name:'Capture',volume:100,pitch:100,pan:0},0);f.audio.createBuffer=create;assert.equal(b.snapshot().status,'failed');assert.equal(f.audio._meBuffer,shared);assert.equal(shared.volume,volume);assert.equal(shared.destroyed,0);b.release();assert.equal(f.audio._meBuffer,shared);a.release();
});
test('a sibling may adopt an in-flight private buffer; old cancellation cannot destroy the newer claim',()=>{
 const f=host({ready:true}),create=f.audio.createBuffer;let newer,shared;f.hook=(kind,b)=>{if(kind==='create'){f.hook=null;shared=b;f.audio.createBuffer=()=>b;newer=f.createPort().request({name:'Capture',volume:80,pitch:100,pan:0},0);f.audio.createBuffer=create;}};const old=f.request();assert.equal(old.snapshot().status,'superseded');assert.equal(newer.snapshot().status,'playing');old.release();assert.equal(f.audio._meBuffer,shared);assert.equal(shared.destroyed,0);newer.release();assert.equal(f.audio._meBuffer,null);
});
for(const name of ['../escape','bad\\path','bad%20','/absolute','a//b','a/./b'])test('invalid ME path '+JSON.stringify(name)+' is failed, not missing or delivered',()=>{
 const f=host(),l=f.request(0,name);assert.equal(l.snapshot().status,'failed');assert(l.snapshot().errors.length);assert.equal(f.buffers.length,1);f.advance(3500);assert.equal(f.audio._meBuffer,null);
});
test('encrypted MZ suffix and real symlink containment distinguish valid resource from escape/access failure',()=>{
 const f=host({encrypted:true}),l=f.request(),b=f.buffers.at(-1);f.resolve(b);assert.equal(l.snapshot().status,'playing');l.release();
 const other=fs.mkdtempSync(path.join(temp,'outside-'));fs.writeFileSync(path.join(other,'X.ogg'),'outside');const g=host();fs.symlinkSync(path.join(other,'X.ogg'),path.join(g.root,'audio/me/X.ogg'));const escaped=g.request(0,'X');assert.equal(escaped.snapshot().status,'failed');assert(escaped.snapshot().errors.some(x=>x.includes('escapes')));g.advance(3500);
 const h=host();h.fsError=Object.assign(Error('permission denied'),{code:'EACCES'});const denied=h.request();assert.equal(denied.snapshot().status,'failed');assert(denied.snapshot().errors.some(x=>x.includes('permission')));h.advance(3500);
});
test('backwards clock and throwing owner check retire with a fault and no timer loop',()=>{
 for(const mode of ['clock','owner']){const f=host({ready:true}),l=f.request();f.time=50;f.advance(50);if(mode==='clock'){f.time=40;f.late(f.buffers.at(-1));}else{f.hook=kind=>{if(kind==='current')throw Error('owner unavailable');};f.advance(75);}assert.equal(l.snapshot().status,'failed');assert(l.snapshot().fault);assert(!l.snapshot().stopConfirmed);assert.equal(f.timers.size,0);}
});
test('preceding ME destruction failure remains unconfirmed even when private preparation was cleaned up',()=>{
 const f=host({ready:true});f.audio.playMe({name:'Previous',volume:100,pitch:100,pan:0});const previous=f.audio._meBuffer;previous.failDestroy=1;const l=f.request();assert.equal(l.snapshot().status,'failed');assert(l.snapshot().fault?.includes('preceding'));assert(!l.snapshot().stopConfirmed);assert.equal(f.timers.size,0);assert(previous.isPlaying());
 // Explicit retry retains first fault; it may clean the known predecessor but
 // cannot turn this failed phase into an ordinary successful capture wait.
 l.release();assert(previous.destroyed);assert(f.bgm.isPlaying());assert(l.snapshot().fault?.includes('preceding'));assert(!l.snapshot().stopConfirmed);
});
test('a decoder readiness exception is a diagnosed media failure; fixed phase still reaches its deadline',()=>{
 const f=host(),l=f.request(),b=f.buffers.at(-1);b.isReady=()=>{throw Error('decoder readiness failed');};f.advance(25);assert.equal(l.snapshot().status,'failed');assert(l.snapshot().errors.some(x=>x.includes('readiness')));assert(!l.snapshot().deadlineReached);f.advance(3500);assert(l.snapshot().deadlineReached);assert(l.snapshot().stopConfirmed);
});
test('a failed predecessor is retained for explicit cleanup but never retried over a new ME',()=>{
 const f=host({ready:true});f.audio.playMe({name:'Previous',volume:100,pitch:100,pan:0});const previous=f.audio._meBuffer;previous.failDestroy=2;const l=f.request();const successor=f.makeBuffer('New owner');successor._isPlaying=true;f.audio._meBuffer=successor;const remaining=previous.failDestroy;l.release();assert.equal(previous.failDestroy,remaining);assert.equal(successor.destroyed,0);assert.equal(f.audio._meBuffer,successor);assert(!l.snapshot().stopConfirmed);
 // Remove only this test's controlled successor, then explicitly retry known cleanup.
 f.audio._meBuffer=null;l.release();l.release();assert(previous.destroyed);assert.equal(successor.destroyed,0);assert(l.snapshot().fault);
});
test('a silent no-op destroy cannot be acknowledged while the owned ME is still playing',()=>{
 const f=host({ready:true}),l=f.request(),b=f.audio._meBuffer,destroy=b.destroy;b.destroy=()=>{};f.advance(3500);assert(!l.snapshot().stopConfirmed);assert(l.snapshot().fault?.includes('stop failed'));assert(!f.bgm.isPlaying());b.destroy=destroy;assert(l.release().stopConfirmed);assert(f.bgm.isPlaying());
});
test('falsey host play rejections remain explicit faults and retire the request',()=>{
 for(const cause of [null,0,'']){const f=host({ready:true});f.hook=event=>{if(event==='play')throw cause;};const l=f.request();assert(l.snapshot().retired);assert(l.snapshot().fault!==null&&l.snapshot().fault.length>0);assert(!l.snapshot().stopConfirmed);assert.equal(f.timers.size,0);}
});
test('successful preceding ME handoff preserves native BGM resume then repause before the replacement',()=>{
 const f=host({ready:true});f.audio.playMe({name:'Previous',volume:100,pitch:100,pan:0});assert(!f.bgm.isPlaying());const l=f.request();assert.equal(l.snapshot().status,'playing');assert.equal(f.bgm.plays.length,1);assert(!f.bgm.isPlaying());assert.equal(f.audio._currentBgm.pos,7);f.advance(3500);assert.equal(f.bgm.plays.length,2);assert(f.bgm.isPlaying());
});
test('release after a finished deadline preserves its terminal reason and is idempotent',()=>{
 const f=host({ready:true}),l=f.request();f.advance(3500);const before=l.snapshot();assert.deepEqual(l.release(),before);assert.deepEqual(l.release(),before);assert.equal(f.timers.size,0);
});
test('a play call that returns past the deadline is retired immediately, without a later timer extension',()=>{
 const f=host();f.time=3499;f.hook=kind=>{if(kind==='play'){f.hook=null;f.time=4000;}};const l=f.request(0),b=f.buffers.at(-1);f.resolve(b);assert(l.snapshot().deadlineReached);assert(l.snapshot().stopConfirmed);assert.equal(l.snapshot().status,'stopped');assert.equal(b.destroyed,1);assert.equal(f.timers.size,0);
});
test('a retained old stop callback cannot stop a later external ME',()=>{
 const f=host({ready:true}),l=f.request(),old=f.audio._meBuffer,late=old._stopListeners[0];l.release();f.audio.playMe({name:'Successor',volume:100,pitch:100,pan:0});const next=f.audio._meBuffer;late();f.advance(0);assert.equal(f.audio._meBuffer,next);assert.equal(next.destroyed,0);
});
