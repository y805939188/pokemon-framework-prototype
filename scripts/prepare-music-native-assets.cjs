'use strict';
// Test-only synthetic tones. Never downloads, installs, plays audio, launches NW or changes an existing asset.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const plan=require('../experiments/step5/4/music-native-plan.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function wav(row){const samples=Math.round(row.seconds*plan.sampleRate),bytes=samples*2,b=Buffer.alloc(44+bytes);b.write('RIFF');b.writeUInt32LE(36+bytes,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(plan.sampleRate,24);b.writeUInt32LE(plan.sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(bytes,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(plan.amplitude*Math.sin(2*Math.PI*row.frequency*i/plan.sampleRate)),44+i*2);return b;}
function command(argv){const r=cp.spawnSync(argv[0],argv.slice(1),{encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0)throw Error(argv[0]+' failed: '+r.stdout+r.stderr);return r.stdout;}

const DURATION_CONTRACT='vorbis-granule-exact-v3',PAGE_DURATION_US=100000;
function oggTiming(bytes){
 let pos=0,headers=0,packet=Buffer.alloc(0),audioPackets=0;const pages=[],payload=crypto.createHash('sha256');
 while(pos<bytes.length){
  if(pos+27>bytes.length||bytes.toString('ascii',pos,pos+4)!=='OggS'||bytes[pos+4]!==0)throw Error('truncated/invalid Ogg page');
  const count=bytes[pos+26],headerEnd=pos+27+count;if(headerEnd>bytes.length)throw Error('truncated Ogg lacing');
  const laces=bytes.subarray(pos+27,headerEnd),end=headerEnd+laces.reduce((n,v)=>n+v,0);if(end>bytes.length)throw Error('truncated Ogg body');
  const raw=bytes.readBigInt64LE(pos+6);if(raw<0n||raw>BigInt(Number.MAX_SAFE_INTEGER))throw Error('unsupported granule');
  let cursor=headerEnd,audio=0;
  for(const size of laces){packet=Buffer.concat([packet,bytes.subarray(cursor,cursor+size)]);cursor+=size;if(size<255){
   if(headers<3){if(packet[0]!==headers*2+1||packet.toString('ascii',1,7)!=='vorbis')throw Error('unexpected Vorbis headers');headers++;}
   else{audio++;audioPackets++;const sizeBytes=Buffer.alloc(4);sizeBytes.writeUInt32LE(packet.length);payload.update(sizeBytes);payload.update(packet);}
   packet=Buffer.alloc(0);
  }}
  if(audio)pages.push({granule:Number(raw),eos:!!(bytes[pos+5]&4),packets:audio});pos=end;
 }
 if(headers!==3||packet.length||!pages.length||!pages.at(-1).eos)throw Error('incomplete Vorbis stream');
 return {audioPages:pages,audioPackets,audioPayloadSHA256:payload.digest('hex')};
}
function qualifyTiming(ogg,packets,frames,sourceFrames,containerFrames,decodedFrames,quantum){
 const integer=n=>Number.isSafeInteger(n)&&n>0;
 if(![sourceFrames,containerFrames,decodedFrames,quantum].every(integer)||decodedFrames!==containerFrames||Math.abs(containerFrames-sourceFrames)>quantum)throw Error('PCM/granule disagreement');
 if(ogg.audioPages.length<2||ogg.audioPages[0].eos||ogg.audioPages[0].granule<=0||ogg.audioPages.at(-1).granule!==containerFrames)throw Error('first audio page must precede EOS with a usable granule');
 for(let i=1;i<ogg.audioPages.length;i++)if(ogg.audioPages[i].granule<ogg.audioPages[i-1].granule||ogg.audioPages[i-1].eos)throw Error('nonmonotonic Ogg granule');
 if(!packets.length||!integer(packets[0].duration)||packets[0].duration>quantum||packets[0].pts!==-packets[0].duration)throw Error('invalid Vorbis priming timestamp');
 let packetEnd=0;for(const p of packets.slice(1)){if(!integer(p.duration)||p.duration>quantum||p.pts!==packetEnd)throw Error('invalid/gapped packet timing');packetEnd+=p.duration;}
 let frameEnd=0;for(const f of frames){if(!integer(f.nb_samples)||f.pts!==frameEnd)throw Error('invalid/gapped PCM timing');frameEnd+=f.nb_samples;}
 if(packetEnd!==containerFrames||frameEnd!==containerFrames)throw Error('packet/frame EOS disagrees with granule');
 return {contract:DURATION_CONTRACT,verified:true,firstPacketPTS:packets[0].pts,lastPacketEnd:packetEnd,decodedFrames:frameEnd,audioPages:ogg.audioPages.length,audioPackets:ogg.audioPackets,audioPayloadSHA256:ogg.audioPayloadSHA256};
}

function generate(out){out=path.resolve(out);const manifest=path.join(out,'ASSETS.json'),recipe=hash(fs.readFileSync(__filename)),input=hash(Buffer.from(JSON.stringify(plan)));
 if(fs.existsSync(manifest)){const x=JSON.parse(fs.readFileSync(manifest));if(x.recipe!==recipe||x.input!==input)throw Error('existing asset recipe differs; preserve it and choose a new output');for(const row of x.files)if(hash(fs.readFileSync(path.join(out,row.path)))!==row.sha256)throw Error('existing asset hash mismatch; never overwrite');return x;}
 if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('refusing nonempty asset output');fs.mkdirSync(out,{recursive:true});const rows=[];
 const ffmpeg=command(['ffmpeg','-version']).split('\n')[0],ffprobe=command(['ffprobe','-version']).split('\n')[0];
 for(const row of plan.assets){const raw=wav(row),source=path.join(out,'sources',row.name+'.wav'),rel='audio/'+row.kind+'/'+plan.prefix+row.name+'.ogg',file=path.join(out,rel);fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(source,raw,{flag:'wx'});
  command(['ffmpeg','-nostdin','-v','error','-threads','1','-i',source,'-map_metadata','-1','-fflags','+bitexact','-flags:a','+bitexact','-c:a','vorbis','-strict','experimental','-ac',String(plan.encodedChannels),'-q:a','4','-page_duration',String(PAGE_DURATION_US),file]);
  const probe=JSON.parse(command(['ffprobe','-v','error','-show_entries','stream=codec_name,sample_rate,channels,duration:format=format_name,duration','-of','json',file]));
  if(probe.streams?.length!==1||probe.streams[0].codec_name!=='vorbis'||Number(probe.streams[0].sample_rate)!==plan.sampleRate||Number(probe.streams[0].channels)!==plan.encodedChannels||probe.format.format_name!=='ogg')throw Error('unexpected Ogg format');
  const decoded=cp.spawnSync('ffmpeg',['-nostdin','-v','error','-threads','1','-i',file,'-f','f32le','-acodec','pcm_f32le','pipe:1'],{maxBuffer:8*1024*1024});if(decoded.status!==0)throw Error('full offline decode failed: '+decoded.stderr);
  const frames=decoded.stdout.length/(4*plan.encodedChannels),duration=frames/plan.sampleRate;
  const timingProbe=JSON.parse(command(['ffprobe','-v','error','-show_packets','-show_frames','-show_entries','packet=pts,duration:frame=pts,nb_samples','-of','json',file])).packets_and_frames;
  const frameProbe=timingProbe.filter(r=>r.type==='frame'),packetProbe=timingProbe.filter(r=>r.type==='packet');
  const frameSum=frameProbe.reduce((n,f)=>n+f.nb_samples,0),quantum=Math.max(...frameProbe.map(f=>f.nb_samples));
  const sourceFrames=Math.round(row.seconds*plan.sampleRate),containerFrames=Math.round(Number(probe.format.duration)*plan.sampleRate);
  if(frames!==frameSum)throw Error('full decode and PCM frame sum disagree');
  const packetTiming=qualifyTiming(oggTiming(fs.readFileSync(file)),packetProbe,frameProbe,sourceFrames,containerFrames,frames,quantum);
  rows.push({path:rel,logicalName:plan.prefix+row.name,kind:row.kind,sha256:hash(fs.readFileSync(file)),sourceWav:'sources/'+row.name+'.wav',sourceSHA256:hash(raw),sourceSeconds:row.seconds,sourceFrames,decodedFrames:frames,containerFrames,decodedMaximumFrame:quantum,decodedPCM_SHA256:hash(decoded.stdout),paddingFrames:frames-sourceFrames,expectedNativeSeconds:duration,nativeDurationRangeSeconds:[(containerFrames-2)/plan.sampleRate,(containerFrames+2)/plan.sampleRate],durationContract:DURATION_CONTRACT,packetTiming,durationPolicy:'v3: paginated Vorbis with verified priming/EOS timestamps; full decoded PCM equals container granule; native duration must match that granule within two source samples, never a fitted old observation',expectedNativeChannels:plan.encodedChannels,frequencyHz:row.frequency,probe,offlineDecode:'PASS_NATIVE_NW_NOT_RUN'});
 }
 for(const alias of plan.aliases??[]){const original=rows.find(row=>row.kind==='bgm'&&row.logicalName===plan.prefix+alias.source);if(!original)throw Error('unknown alias source');const file=path.join(out,alias.path);fs.copyFileSync(path.join(out,original.path),file,fs.constants.COPYFILE_EXCL);rows.push({...original,path:alias.path,logicalName:path.basename(alias.path,'.ogg'),aliasOf:original.path});}
 const bad=path.join(out,plan.intentionalBadAsset);fs.writeFileSync(bad,Buffer.from('intentional invalid Ogg fixture for M05\n'),{flag:'wx'});rows.push({path:plan.intentionalBadAsset,sha256:hash(fs.readFileSync(bad)),intentional:'corrupt negative control'});
 const x={version:plan.version,mediaQualificationVersion:3,pageDurationMicroseconds:PAGE_DURATION_US,recipe,input,ffmpeg,ffprobe,qualification:'author synthetic PCM encoded as actual Ogg/Vorbis; explicit pagination/priming/EOS qualification, no reference media',files:rows,nativeNW:'NOT_RUN',physicalHearing:'NOT_VERIFIED'};fs.writeFileSync(manifest,JSON.stringify(x,null,2)+'\n',{flag:'wx'});return x;
}
module.exports={generate,wav,plan,oggTiming,qualifyTiming,DURATION_CONTRACT,PAGE_DURATION_US};
if(require.main===module){if(process.argv.length!==3)throw Error('usage: node scripts/prepare-music-native-assets.cjs NEW_OUTPUT');console.log(JSON.stringify(generate(process.argv[2]),null,2));}
