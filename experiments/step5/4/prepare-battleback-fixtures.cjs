'use strict';
// Test-only solid colours, not game artwork. Explicit output; refuses to overwrite an existing file.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'');if(process.argv.length!==3)throw Error('usage: node prepare-battleback-fixtures.cjs OUTPUT_DIRECTORY');
fs.mkdirSync(root,{recursive:true});
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,b){const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(b.length);crc.writeUInt32BE(crc32(Buffer.concat([t,b])));return Buffer.concat([n,t,b,crc]);}
function png(rgb){const h=Buffer.alloc(13);h.writeUInt32BE(8,0);h.writeUInt32BE(8,4);h[8]=8;h[9]=2;const scan=Buffer.concat(Array.from({length:8},()=>Buffer.from([0,...Array.from({length:8},()=>rgb).flat()])));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);}
function gif(rgb){return Buffer.concat([Buffer.from('GIF89a'),Buffer.from([1,0,1,0,0x80,0,0,...rgb,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0,0x3b])]);}
const files={
 'pf_backdrop_night_bg.png':png([28,53,87]),'pf_backdrop_message.png':png([72,36,82]),
 'pf_backdrop_water_base0.png':png([35,105,64]),'pf_backdrop_water_base1.png':png([132,76,30]),
 'pf_pngwins_bg.png':png([159,42,38]),
 'pf_pngwins_bg.gif':gif([23,88,199]),'pf_gifonly_bg.gif':gif([23,88,199]),'pf_corrupt_bg.png':Buffer.from('deliberately invalid image test fixture\n'),
};
const rows=[];for(const[name,bytes]of Object.entries(files)){const p=path.join(root,name);fs.writeFileSync(p,bytes,{flag:'wx'});rows.push({name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
process.stdout.write(JSON.stringify({kind:'GENERATED_TEST_ONLY_SOLID_COLOURS',root,files:rows},null,2)+'\n');
