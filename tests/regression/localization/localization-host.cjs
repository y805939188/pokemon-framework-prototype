'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {ROOT,E}=require('../interface/navigation-host.cjs');
const calls=[];
// Execute the production PSFlow language members and shipped plugin parameters.
// Other BattleFlow initialization is outside these non-battle presentation fixtures.
const source=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlow.ts'),'utf8');
const start=source.indexOf('    lang: null as string | null,');
const end=source.indexOf('\n    /**',start);
if(start<0||end<start)throw Error('PSFlow language source boundary changed');
const members=stripTypeScriptTypes('const PSFlow = {\n'+source.slice(start,end)+'\n}; globalThis.languageFlow=PSFlow;');
const config={};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'js/plugins.js'),'utf8'),config);
function languageFlow(h){
 const parameters=structuredClone(config.$plugins.find(p=>p.name==='PS_BattleFlow').parameters);
 const context={G:{PluginManager:{parameters:name=>{if(name!=='PS_BattleFlow')throw Error(name);return parameters;}}},NAME:'PS_BattleFlow',engine:()=>({B:E})};
 vm.runInNewContext(members,context,{filename:'production-PSFlow-language.js'});
 const flow=context.languageFlow,seen=new WeakSet(),original=flow.translator;
 flow.translator=function(){
  const tr=original.call(flow);
  if(!seen.has(tr)){
   seen.add(tr);
   for(const method of ['t','tOr']){
    const resolve=tr[method];tr[method]=(...args)=>{const text=resolve(...args);calls.push({lang:tr.lang,method,key:args[0],text});return text;};
   }
  }
  return tr;
 };
 Object.assign(h.G.PSFlow,{translator:()=>flow.translator(),setLanguage:lang=>flow.setLanguage(lang)});
 return flow;
}
module.exports={languageFlow,calls,ROOT,E};
