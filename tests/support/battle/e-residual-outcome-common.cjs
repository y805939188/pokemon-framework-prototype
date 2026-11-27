'use strict';
const assert=require('node:assert/strict');
const clone=v=>JSON.parse(JSON.stringify(v));
const events=row=>row.messages.flatMap(m=>m.kind==='events'?m.events:[]);
const member=(row,id)=>row.p1.find(m=>m.id===id);
const targets=(e,id)=>new RegExp('^p1(?:a)?: '+id+'$').test(e.args[0]??'');
function verifyPP(row,id,move){const b=member(row.before,id),a=member(row.after,id);for(const [key,value]of Object.entries(b.pp))assert.equal(a.pp[key],value-(key===move?1:0),key+' actual PP');}
module.exports={assert,clone,events,member,targets,verifyPP};
