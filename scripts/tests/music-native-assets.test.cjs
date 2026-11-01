'use strict';
// Pure timing/structure controls; no ffmpeg, NW, decoder or generated media required in CI.
const test=require('node:test'),assert=require('node:assert/strict');
const {qualifyTiming,oggTiming,DURATION_CONTRACT}=require('../prepare-music-native-assets.cjs');
function vector(){return {ogg:{audioPages:[{granule:2048,eos:false},{granule:4000,eos:true}],audioPackets:5,audioPayloadSHA256:'synthetic'},packets:[{pts:-1024,duration:1024},{pts:0,duration:1024},{pts:1024,duration:1024},{pts:2048,duration:1024},{pts:3072,duration:928}],frames:[{pts:0,nb_samples:1024},{pts:1024,nb_samples:1024},{pts:2048,nb_samples:1024},{pts:3072,nb_samples:928}],source:4000,container:4000,decoded:4000,quantum:1024};}
const qualify=v=>qualifyTiming(v.ogg,v.packets,v.frames,v.source,v.container,v.decoded,v.quantum);
test('canonical priming/packet/frame/granule timings agree exactly',()=>{const r=qualify(vector());assert.equal(r.contract,DURATION_CONTRACT);assert.equal(r.lastPacketEnd,4000);assert.equal(r.decodedFrames,4000);});
for(const [name,change]of [
 ['single EOS audio page',v=>v.ogg.audioPages=[{granule:4000,eos:true}]],
 ['zero first usable granule',v=>v.ogg.audioPages[0].granule=0],
 ['nonmonotonic page',v=>v.ogg.audioPages[0].granule=5000],
 ['unadjusted first priming pts',v=>v.packets[0].pts=0],
 ['underflowed terminal duration',v=>v.packets.at(-1).duration=4294966784],
 ['packet gap',v=>v.packets[2].pts++],
 ['packet end mismatch',v=>v.packets.at(-1).duration--],
 ['PCM gap',v=>v.frames[1].pts++],
 ['truncated decoded PCM',v=>v.decoded-=1024],
 ['wrong granule',v=>v.container++],
 ['source mismatch beyond encoded frame',v=>v.source=1],
 ['missing decoded frames',v=>v.frames=[]],
 ['nonfinite decoded length',v=>v.decoded=NaN]
])test('timing qualification rejects '+name,()=>{const v=vector();change(v);assert.throws(()=>qualify(v));});
test('Ogg structural gate rejects wrong signatures and truncated bodies',()=>{assert.throws(()=>oggTiming(Buffer.from('not Ogg')));const b=Buffer.alloc(28);b.write('OggS');b[26]=1;b[27]=20;assert.throws(()=>oggTiming(b),/truncated/);});

