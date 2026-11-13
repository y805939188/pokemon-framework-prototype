'use strict';
// Copy three already qualified synthetic tones, without re-encoding, NW or reference/player assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const PLAN=require('../experiments/step5/4/ball-feedback-native-plan.json');
const {oggTiming,DURATION_CONTRACT,PAGE_DURATION_US}=require('./prepare-music-native-assets.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fileHash=f=>hash(fs.readFileSync(f));
const inside=(root,p)=>{const r=path.relative(root,p);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};
function prepare(source,out){
 source=fs.realpathSync(source);out=path.resolve(out);assert(!fs.existsSync(out),'new asset directory only');assert.equal(fileHash(source),PLAN.sourceAssetsManifestSHA256,'fixed qualified Ogg/WAV source manifest');
 const root=path.dirname(source),media=JSON.parse(fs.readFileSync(source));assert.equal(media.mediaQualificationVersion,3);assert.equal(media.pageDurationMicroseconds,PAGE_DURATION_US);
 const rows=PLAN.requiredAssets.map(p=>{const row=media.files.find(r=>r.path===p);assert(row&&row.sourceWav);const clip=fs.realpathSync(path.join(root,p)),wav=fs.realpathSync(path.join(root,row.sourceWav));assert(inside(root,clip)&&inside(root,wav));assert.equal(fileHash(clip),row.sha256);assert.equal(fileHash(wav),row.sourceSHA256);assert.equal(row.durationContract,DURATION_CONTRACT);assert.equal(row.containerFrames,row.decodedFrames);const timing=oggTiming(fs.readFileSync(clip));assert.equal(timing.audioPayloadSHA256,row.packetTiming.audioPayloadSHA256);assert(timing.audioPages.length>1&&!timing.audioPages[0].eos&&timing.audioPages.at(-1).granule===row.containerFrames);return{...row,_clip:clip,_wav:wav};});
 fs.mkdirSync(out,{recursive:true});for(const r of rows){const dest=path.join(out,r.path),wav=path.join(out,r.sourceWav);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.mkdirSync(path.dirname(wav),{recursive:true});fs.copyFileSync(r._clip,dest,fs.constants.COPYFILE_EXCL);fs.copyFileSync(r._wav,wav,fs.constants.COPYFILE_EXCL);delete r._clip;delete r._wav;}
 const result={version:PLAN.version,input:hash(Buffer.from(JSON.stringify(PLAN))),recipe:fileHash(__filename),sourceManifestSHA256:fileHash(source),mediaQualificationVersion:3,pageDurationMicroseconds:PAGE_DURATION_US,files:rows,qualification:'exact copied previously qualified paginated Ogg/Vorbis and original synthetic source WAV; no new native execution',NW:'NOT_RUN'};fs.writeFileSync(path.join(out,'ASSETS.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
module.exports={prepare};if(require.main===module){assert.equal(process.argv.length,4,'usage: node scripts/prepare-ball-native-assets.cjs SOURCE_ASSETS_JSON NEW_OUT');console.log(JSON.stringify({files:prepare(...process.argv.slice(2)).files.length,NW:'NOT_RUN'}));}
