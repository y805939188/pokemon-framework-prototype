'use strict';
// Read-only input admission. Run this before a Pokedex fixture imports any production module or plugin.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../headless-regression-binding.cjs');
const PLUGINS=['PS_Management','PS_Inventory','PS_Progression','PS_Evolution','PS_Pokedex'];
const INPUTS=['scripts/tests/pokedex-runtime-binding.cjs','tests/support/inventory/inventory-ui-host.cjs',
 'tests/support/inventory/inventory-fixture.cjs','tests/support/evolution/postbattle/helpers.cjs',
 'tests/support/pokedex/host/ui-host.cjs','tests/support/pokedex/pokedex-area-host.cjs',
 'tests/regression/pokedex/test-pokedex-area-production.cjs',...PLUGINS.map(name=>'js/plugins/'+name+'.js')];
function capturePokedexInputs(root,options={}){
 root=fs.realpathSync(root);
 const bindingFile=options.bindingFile??process.env.PF_HEADLESS_REGRESSION_BINDING;
 const selected=options.pluginRoot??process.env.PF_POKEDEX_PLUGIN_ROOT??(bindingFile?path.join(root,'js/plugins'):undefined);
 if(selected!==undefined)assert(typeof selected==='string'&&path.isAbsolute(selected),'absolute Pokedex plugin root required');
 let captured;
 if(bindingFile){
  const canonical=path.join(root,'js/plugins');
  assert.equal(path.resolve(selected),canonical,'foreign Pokedex plugin root refused before artifact read');
  const stat=fs.lstatSync(canonical);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'linked Pokedex plugin root refused');
  captured=H.capture(root,bindingFile);H.boundFiles(captured,INPUTS);
 }
 return{pluginRoot:selected,captured,verify(){if(captured)H.capture(root,bindingFile,captured.sha256);}};
}
module.exports={capturePokedexInputs,INPUTS,PLUGINS};
