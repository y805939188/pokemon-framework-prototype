'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const before=['encounterSelection','encounterTrigger','fieldItems','fieldPassives','fieldShortcuts','fishing','worldBattleContext','worldData','worldState','trainerAi','heldFacts','acquisitionDex','pokedex','pokedexQuery','friendship','learning','evolution','evolutionSuccess','evolutionCommit','learningActions','dexState','evolutionReadiness','itemEffects','shop','economy','inventory','itemCatalog','memberMetadata','semantic','config','creationForms','defeat','digest','encounter','grants','growth','heal','items','limits','memberFactory','memberIdentity','receiving','rules','saveSchema','speciesKey','state','stats','storage','storageOperations','wildGeneration'];
test('private core remains host-free and preserves all baseline public namespaces plus worldTravel',()=>{
 const source=fs.readFileSync(process.env.PF_E3_CORE_BUNDLE,'utf8');assert.doesNotMatch(source,/\brequire\s*\(|\bprocess\.|\bBuffer\b|__dirname|__filename|['"]node:|\bwindow\.|\bdocument\.|\$game[A-Z]/);
 const module={exports:{}},context=vm.createContext({module,exports:module.exports});vm.runInContext(source,context);
 const core=module.exports;assert.deepEqual(Object.keys(core).sort(),[...before,'worldTravel'].sort());assert.equal(core.worldTravel.travelNeedsConfirmation('dig'),true);assert.equal(core.worldTravel.travelNeedsConfirmation('teleport'),true);assert.equal(core.worldTravel.travelNeedsConfirmation('fly'),false);
 for(const name of ['process','Buffer','require','TextEncoder','window','document'])assert.equal(vm.runInContext('typeof '+name,context),'undefined');
});
