'use strict';
// Actual internal consumer and MZ adapter. ES2022 ports here; real pixels are a separate NW gate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,Playback,makeMZ;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-battle-picture-'));
 const root=path.join(ROOT,'src/plugins/battleflow'),config={compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'out'),noEmitOnError:true},files:['picture-playback.ts','picture-mz.ts'].map(x=>path.join(root,x))};
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify(config));const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 Playback=require(path.join(temp,'out/picture-playback.js')).BattlePicturePlayback;makeMZ=require(path.join(temp,'out/picture-mz.js')).createBattlePicturesMZ;
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
const actor=(id='P',side='p1')=>({id,side,name:'Pidgey'});
function fixture(units, effects=true){
 const f={live:true,update:0,created:[],paints:[],released:[],failures:[]};
 f.ports={current:()=>f.live,updateOrdinal:()=>f.update,create:a=>{const h={actor:{...a},seq:f.created.length};f.created.push(h);return h;},paint:(h,p)=>f.paints.push({handle:h,pose:{...p}}),release:h=>f.released.push(h),failed:e=>f.failures.push(e)};
 f.view=new Playback(f.ports,effects,units);return f;
}
test('real consumer owns detached public actors and removes only inactive handles',()=>{
 const f=fixture(),a=actor();f.view.sync([a,actor('F','p2')]);a.id='changed';const s=f.view.snapshot();s.actors[0].id='other';assert.equal(f.view.snapshot().actors[0].id,'P');
 f.view.sync([actor('F','p2')]);assert.equal(f.created.length,2);assert.equal(f.released.length,1);f.view.dispose();f.view.dispose();assert.equal(f.released.length,2);assert(f.view.snapshot().retired);assert.equal(f.view.snapshot().actors.length,0);
});
test('send-out first actual sample starts its own origin and interpolates two parallel images',()=>{
 const f=fixture(),s=f.view.step('send-out',actor());assert.equal(f.created.length,0);assert(!s.advance(9000));assert.deepEqual(f.paints.at(-1).pose,{body:0,shadow:0});
 f.update=1;assert(!s.advance(9250));assert.deepEqual(f.paints.at(-1).pose,{body:.5,shadow:.5});f.update=2;assert(!s.advance(9500));assert.deepEqual(f.paints.at(-1).pose,{body:1,shadow:1});f.update=3;assert(s.advance(9500));assert.equal(f.view.snapshot().runningGroups,0);f.view.dispose();
});
test('same-update repeated reads cannot complete, even with later timestamps; next update can share the endpoint timestamp',()=>{
 const f=fixture({sendOut:0,recall:0}),s=f.view.step('send-out',actor());assert(!s.advance(0));assert(!s.advance(100));assert(!s.advance(100));assert.equal(f.view.snapshot().runningGroups,1);f.update++;assert(s.advance(100));f.view.dispose();
});
test('late sampling reaches endpoint without restarting duration but retains one update completion observation',()=>{
 const f=fixture(),s=f.view.step('send-out',actor());s.advance(0);f.update++;assert(!s.advance(8000));assert.equal(f.paints.at(-1).pose.body,1);assert(!s.advance(9000));f.update++;assert(s.advance(9000));f.view.dispose();
});
test('recall shrinks both owned images and does not release or write a battle model',()=>{
 const f=fixture(),s=f.view.step('recall',actor());s.advance(0);assert.equal(f.paints.at(-1).pose.body,1);f.update++;s.advance(125);assert.equal(f.paints.at(-1).pose.body,.5);f.update++;assert(!s.advance(250));assert.equal(f.paints.at(-1).pose.body,0);f.update++;assert(s.advance(250));assert.equal(f.released.length,0);f.view.sync([]);assert.equal(f.released.length,1);
});
test('mandatory send-out and recall run with effects off',()=>{
 for(const kind of ['send-out','recall']){const f=fixture({sendOut:0,recall:0},false),s=f.view.step(kind,actor());assert(!s.advance(0));assert.equal(f.created.length,1);f.update++;assert(s.advance(0));f.view.dispose();}
});
test('cancel before the first sample allocates no handle and cannot mutate later',()=>{
 const f=fixture(),s=f.view.step('send-out',actor());s.cancel();s.cancel();assert(s.advance(0));assert.equal(f.created.length,0);assert.equal(f.view.snapshot().runningGroups,0);f.view.dispose();
});
test('cancel after sampling releases exactly once and late advance stays inert',()=>{
 const f=fixture(),s=f.view.step('send-out',actor());s.advance(0);s.cancel();const n=f.paints.length;f.update++;assert(s.advance(500));assert.equal(f.paints.length,n);f.view.dispose();assert.equal(f.released.length,1);
});
test('late cancel of a completed step cannot release a new step using the same actor',()=>{
 const f=fixture({sendOut:0,recall:0}),old=f.view.step('send-out',actor());old.advance(0);f.update++;assert(old.advance(0));const next=f.view.step('recall',actor());next.advance(0);old.cancel();assert.equal(f.released.length,0);assert.equal(f.view.snapshot().runningGroups,1);next.cancel();assert.equal(f.released.length,1);f.view.dispose();
});
test('owner replacement during allocation releases the old allocation without painting',()=>{
 const f=fixture();f.ports.create=a=>{const h={actor:a};f.created.push(h);f.live=false;return h;};assert(f.view.step('send-out',actor()).advance(0));assert.equal(f.paints.length,0);assert.equal(f.released.length,1);assert(f.view.snapshot().retired);
});
test('cancel reentered from allocation or initial paint cannot leave a new handle or pose',()=>{
 for(const at of ['create','paint']){const f=fixture(),s=f.view.step('send-out',actor()),create=f.ports.create,paint=f.ports.paint;
  if(at==='create')f.ports.create=a=>{s.cancel();return create(a);};else f.ports.paint=(h,p)=>{paint(h,p);s.cancel();};
  assert(s.advance(0));assert.equal(f.released.length,1);assert.equal(f.view.snapshot().actors.length,0);assert.equal(f.paints.length,at==='create'?0:1);f.view.dispose();
 }
});
test('reentrant reads from paint cannot consume another update observation',()=>{
 const f=fixture({sendOut:0,recall:0}),s=f.view.step('send-out',actor()),paint=f.ports.paint;let nested=0;f.ports.paint=(h,p)=>{paint(h,p);assert(!s.advance(0));nested++;};assert(!s.advance(0));assert(!s.advance(0));f.update++;assert(s.advance(0));assert(nested>=3);f.view.dispose();
});
test('a clock or ordinal callback cannot authorize an old owner',()=>{
 const f=fixture();f.ports.updateOrdinal=()=>{f.live=false;return 0;};assert(f.view.step('send-out',actor()).advance(0));assert.equal(f.created.length,0);f.view.dispose();
});
test('invalid actor, preset, clock and ordinal are rejected without business fallbacks',()=>{
 const f=fixture();assert.throws(()=>f.view.sync([actor(),actor()]),/duplicate/);assert.throws(()=>f.view.step('send-out',actor('')),/invalid/);assert.throws(()=>new Playback(f.ports,true,{sendOut:Infinity,recall:1}),/preset/);assert.throws(()=>new Playback(f.ports,true,{sendOut:1e308,recall:1}),/preset/);
 assert.throws(()=>new Playback(f.ports,true,{sendOut:'10',recall:1}),/preset/);
 const s=f.view.step('send-out',actor());assert.throws(()=>s.advance(-1),/clock/);f.update=NaN;assert.throws(()=>s.advance(0),/ordinal/);assert.equal(f.created.length,0);f.view.dispose();
});
test('ordinal and monotonic clock cannot rewind across updates',()=>{
 const f=fixture(),s=f.view.step('send-out',actor());s.advance(10);f.update=1;s.advance(20);f.update=0;assert.throws(()=>s.advance(30),/ordinal/);f.update=2;assert.throws(()=>s.advance(19),/monotonic|backward|clock/);f.view.dispose();
});
test('disposed factory and callbacks neither adopt nor release a successor consumer',()=>{
 const old=fixture(),step=old.view.step('send-out',actor());step.advance(0);old.live=false;old.view.dispose();const next=fixture();next.view.sync([actor()]);assert(step.advance(1000));old.view.step('recall',actor()).cancel();assert.equal(next.released.length,0);assert.equal(next.view.snapshot().actors.length,1);assert.equal(old.released.length,1);next.view.dispose();
});
test('paint failure retires all handles, preserves the original exception and records cleanup failure',()=>{
 const f=fixture();f.view.sync([actor(),actor('F','p2')]);const error=Error('real paint failure');
 f.ports.paint=()=>{throw error;};f.ports.release=h=>{f.released.push(h);throw Error('separate cleanup failure');};
 assert.throws(()=>f.view.step('send-out',actor()).advance(0),e=>e===error);assert(f.view.snapshot().retired);assert.equal(f.released.length,2);assert.equal(f.view.snapshot().actors.length,0);assert.equal(f.view.snapshot().cleanupErrors.length,2);f.view.dispose();assert.equal(f.released.length,2);
});
test('lost-owner cleanup failures cannot invoke the successor failure port',()=>{
 const f=fixture();f.view.sync([actor()]);f.live=false;f.ports.release=()=>{throw Error('owned cleanup');};f.view.dispose();assert.equal(f.failures.length,0);assert.equal(f.view.snapshot().cleanupErrors.length,1);
});
test('MZ allocation failure or replacement during a native callback rolls back only partially owned images',()=>{
 for(const phase of ['draw','attach','replace']){
  let live=true;const images=[],sprites=[],external={foreign:true},scene={children:[external],addChild(s){this.children.push(s);s.parent=this;if(phase==='attach')throw Error('attach failed');if(phase==='replace')live=false;},removeChild(s){this.children.splice(this.children.indexOf(s),1);s.parent=null;}};
  class Bitmap{constructor(){this.destroys=0;images.push(this);}fillAll(){}drawText(){if(phase==='draw')throw Error('draw failed');}destroy(){this.destroys++;}}
  class Sprite{constructor(bitmap){this.bitmap=bitmap;this.anchor={};this.scale={};this.destroys=0;sprites.push(this);}destroy(){this.destroys++;}}
  const view=makeMZ({Bitmap,Sprite,Graphics:{boxWidth:816}},scene,()=>live,()=>0,()=>assert.fail('wrong error recipient'));
  assert.throws(()=>view.sync([actor()]),/draw failed|attach failed|stale picture allocation/);view.dispose();assert(images.length);assert(images.every(x=>x.destroys===1));assert(sprites.every(x=>x.destroys===1));assert.deepEqual(scene.children,[external]);
 }
});
test('MZ adapter paints real private Sprite properties below windows and destroys only its own images',()=>{
 let update=0,live=true;const bitmaps=[],sprites=[];
 class Bitmap{constructor(w,h){this.width=w;this.height=h;this.destroyed=0;bitmaps.push(this);}fillAll(){}drawText(){}destroy(){this.destroyed++;}}
 class Sprite{constructor(bitmap){this.bitmap=bitmap;this.anchor={};this.scale={};this.destroyed=0;sprites.push(this);}destroy(){this.destroyed++;}}
 const window={},scene={_windowLayer:window,children:[window],addChildAt(s,i){this.children.splice(i,0,s);s.parent=this;},removeChild(s){this.children.splice(this.children.indexOf(s),1);s.parent=null;}};
 const view=makeMZ({Bitmap,Sprite,Graphics:{boxWidth:816,boxHeight:624}},scene,()=>live,()=>update,e=>assert.fail(String(e)));view.sync([actor()]);assert.equal(scene.children.at(-1),window);assert.equal(sprites.length,2);const step=view.step('send-out',actor());step.advance(0);assert(sprites.every(s=>s.opacity===0&&!s.visible));update++;step.advance(500);assert(sprites.every(s=>s.opacity===255&&s.visible&&s.scale.x===1));update++;assert(step.advance(500));live=false;view.dispose();view.dispose();assert.equal(scene.children.length,1);assert(bitmaps.every(b=>b.destroyed===1));assert(sprites.every(s=>s.destroyed===1&&s.bitmap===null));assert.deepEqual(view.snapshot().cleanupErrors,[]);
});
