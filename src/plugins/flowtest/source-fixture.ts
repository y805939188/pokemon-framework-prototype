/** Test donor inputs bundled by Vite. Offline app.nw intentionally contains no author source directory.
 * This is the versioned sample donor used by progressionContent, not the player's content loader.
 * The donor's optional file is grants.json; regional layout and scenario settings/items/shops are explicit fixture edits.
 */
import manifest from '../../../content/sample/manifest.json';
import sources from '../../../content/sample/sources.json';
import species from '../../../content/sample/species.json';
import overlays from '../../../content/sample/overlays.json';
import grants from '../../../content/sample/grants.json';
import convergenceSource from '../../../experiments/step5/3/fixtures/m1/convergence.cjs?raw';
export function progressionDonorInputs():any {
 return JSON.parse(JSON.stringify({manifest,sources,species,overlays,grants}));
}
/** Exact M1 fixture, in the Node engine's realm with only its existing assert dependency.
 * Static source, no offline experiments directory or filesystem reader required.
 */
export function m1ConvergenceFixture(assertModule:any,runInThisContext:(source:string,options:{filename:string})=>any):any {
 const loaded={exports:{}};
 const factory=runInThisContext('(function(require,module,exports){\n'+convergenceSource+'\n})',{filename:'bundled/step53-m1-convergence.cjs'});
 factory((id:string)=>{if(id!=='node:assert/strict')throw Error('unsupported M1 fixture dependency: '+id);return assertModule;},loaded,loaded.exports);
 return loaded.exports;
}
