/** Composition factory for the travel/F parent. It does not register a missing application operation. */
import type { WorldFact } from '../../framework/rules/world-data';
import { createTransferHost } from './transfer-host';
import type { TransferHostPorts, TransferHost } from './transfer-host';
import type { MZTerrainMeanings } from './runtime-inputs-mz';
import type { SurfTerrainMeaning } from './transfer-surf-facts';
export type SurfPassageMode = 'none' | 'boat' | 'ship';
export function parseSurfPassageMode(raw: unknown): SurfPassageMode {
  if (raw === undefined || raw === '' || raw === 'none') return 'none';
  if (raw === 'boat' || raw === 'ship') return raw;
  throw Error('surf-native-passage-configuration-invalid');
}
export function configuredSurfTerrain(meanings: MZTerrainMeanings, tag: number): WorldFact<SurfTerrainMeaning> {
  const meaning = meanings.get(tag);
  if (!meaning || typeof meaning.canSurf !== 'boolean') return { status: 'unavailable', reason: `surf-target-terrain-unconfigured:${tag}` };
  return { status: 'value', value: { canSurf: meaning.canSurf, waterfall: meaning.waterfall, waterfallCrest: meaning.waterfallCrest } };
}
export function createConfiguredTransferMZ(root: unknown, ports: Omit<TransferHostPorts, 'surf'>, meanings: MZTerrainMeanings, passageMode: SurfPassageMode): TransferHost {
  return createTransferHost(root, { ...ports, surf: { passageMode, terrain: tag => configuredSurfTerrain(meanings, tag) } });
}
