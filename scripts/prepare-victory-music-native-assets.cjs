'use strict';
// Copy four distinct existing synthetic tones, without re-encoding or touching the original evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const PLAN=require('../experiments/step5/4/victory-music-native-plan.json');
const {oggTiming,DURATION_CONTRACT,PAGE_DURATION_US}=require('./prepare-music-native-assets.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fileHash=f=>hash(fs.readFileSync(f));
const inside=(root,p)=>{const rel=path.relative(root,p);return !!rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
function prepare(source,out){
 source=fs.realpathSync(source);out=path.resolve(out);assert(!fs.existsSync(out),'new asset directory only');
 assert.equal(fileHash(source),PLAN.sourceAssetsManifestSHA256,'exact previously qualified synthetic source manifest');
 const root=path.dirname(source),media=JSON.parse(fs.readFileSync(source));assert.equal(media.mediaQualificationVersion,3);assert.equal(media.pageDurationMicroseconds,PAGE_DURATION_US);
 const rows=[];
 for(const[name,origin]of Object.entries(PLAN.sourceMediaMap)){
  const row=media.files.find(r=>r.logicalName.endsWith('/'+origin));assert(row&&row.sourceWav,'known tone and source WAV');
  const src=fs.realpathSync(path.join(root,row.path)),wav=fs.realpathSync(path.join(root,row.sourceWav));assert(inside(root,src)&&inside(root,wav));
  assert.equal(fileHash(src),row.sha256);assert.equal(fileHash(wav),row.sourceSHA256);assert.equal(row.durationContract,DURATION_CONTRACT);assert.equal(row.containerFrames,row.decodedFrames);
  const timing=oggTiming(fs.readFileSync(src));assert.equal(timing.audioPayloadSHA256,row.packetTiming.audioPayloadSHA256);assert(timing.audioPages.length>1&&!timing.audioPages[0].eos&&timing.audioPages.at(-1).granule===row.containerFrames);
  rows.push({...row,name,kind:'bgm',path:'audio/bgm/'+PLAN.prefix+name+'.ogg',logicalName:PLAN.prefix+name,sourceWav:'sources/'+name+'.wav',origin:{path:row.path,sourceWav:row.sourceWav,sha256:row.sha256},_src:src,_wav:wav});
 }
 assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.sha256)).size,4,'world/battle/wild victory/trainer victory have distinct encoded tones');
 fs.mkdirSync(out,{recursive:true});
 for(const r of rows){const f=path.join(out,r.path),wav=path.join(out,r.sourceWav);fs.mkdirSync(path.dirname(f),{recursive:true});fs.mkdirSync(path.dirname(wav),{recursive:true});fs.copyFileSync(r._src,f,fs.constants.COPYFILE_EXCL);fs.copyFileSync(r._wav,wav,fs.constants.COPYFILE_EXCL);delete r._src;delete r._wav;}
 const result={version:PLAN.version,input:hash(Buffer.from(JSON.stringify(PLAN))),recipe:fileHash(__filename),sourceManifestSHA256:fileHash(source),mediaQualificationVersion:3,pageDurationMicroseconds:PAGE_DURATION_US,qualification:'copied exact prior synthetic Ogg/WAV bytes; no new native execution',files:rows,nativeNW:'NOT_RUN',physicalHearing:'NOT_VERIFIED'};
 fs.writeFileSync(path.join(out,'ASSETS.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
module.exports={prepare};
if(require.main===module){assert.equal(process.argv.length,4,'usage: node scripts/prepare-victory-music-native-assets.cjs SOURCE_ASSETS_JSON NEW_OUT');console.log(JSON.stringify({files:prepare(...process.argv.slice(2)).files.length,native:'NOT_RUN'}));}
