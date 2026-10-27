'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{setup,dispose,E}=require('./pokedex/ui-host.cjs');test.after(dispose);
for(const locale of ['en','zh'])test('I-H2-WARN-01 '+locale+' 640x480 empty-search notice fits between form controls and footer',()=>{
 const w=setup();w.G.PSFlow.translator=()=>E.i18n.translatorFor(locale);w.open();const c=w.manager._scene._controller;
 Object.assign(c.window.contents,{width:640,height:480});w.press('shift');assert.equal(c.screen.view.kind,'search');c.screen.view.notice='empty';c.draw();
 const draw=w.drawCalls.filter(x=>x.op==='drawText').map(x=>x.args),footer=draw.at(-1),message=draw.find(x=>x[0]===E.i18n.translatorFor(locale).t('pokedex.noMatches')||String(x[0]).trim()===E.i18n.translatorFor(locale).t('pokedex.noMatches'));
 assert(message,'actual notice draw');assert(message[2]+message[4]<=footer[2],'notice does not overlap footer');
 const controls=draw.filter(x=>x!==footer&&x!==message&&x[2]>=48);assert(controls.every(x=>x[2]+x[4]<=message[2]),'notice does not overlap any form control');
 assert(message[1]>=0&&message[1]+message[3]<=640);assert(footer[2]+footer[4]<=480);
});
