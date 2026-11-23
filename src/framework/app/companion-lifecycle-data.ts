/** Materialized lifecycle data only; no operation/application dependency. Shape is not authority. */
import type { Content } from '../rules/types';
import type { GameState } from '../rules/state';
import type { WorldLocation } from '../rules/world-data';
export interface WorldCompanionNativeTransferLifecycle {
  readonly observation: object; readonly serial: object; readonly epoch: object;
  readonly application: object; readonly generation: number;
  readonly game: GameState; readonly gameIdentity: string;
  readonly content: Content; readonly contentIdentity: string;
  readonly manager: object; readonly sourceScene: object; readonly scene: object;
  readonly birth: object; readonly queue: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly data: object;
  readonly target: Readonly<WorldLocation>;
}
/** Native surface presentation only. It cannot acknowledge a write or authorize another action. */
export interface CompanionRuntimePresentation {
  readonly generation: number; readonly revision: number;
  readonly transferHidden: readonly string[];
  readonly turnTowardPlayer: boolean;
}
