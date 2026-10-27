/** Test donor inputs bundled by Vite. Offline app.nw intentionally contains no author source directory.
 * This is the versioned sample donor used by progressionContent, not the player's content loader.
 * The donor's optional file is grants.json; regional layout and scenario settings/items/shops are explicit fixture edits.
 */
import manifest from '../../../content/sample/manifest.json';
import sources from '../../../content/sample/sources.json';
import species from '../../../content/sample/species.json';
import overlays from '../../../content/sample/overlays.json';
import grants from '../../../content/sample/grants.json';
export function progressionDonorInputs():any {
 return JSON.parse(JSON.stringify({manifest,sources,species,overlays,grants}));
}
