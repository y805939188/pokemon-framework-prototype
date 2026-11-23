import type { WorldFact } from '../../framework/rules/world-data';
import type { FieldMoveDarkMask, FieldMoveSound } from './field-move-host';

export type DefaultFieldSound = 'cut' | 'rock-smash' | 'strength-push';
/** Visual input only. These observations never issue a field-operation permission. */
export interface FieldDarknessObservation {
  readonly application: object;
  readonly generation: number;
  readonly mapId: number;
  readonly darkMap: WorldFact<boolean>;
  readonly flashUsed: boolean;
}
export interface FieldDarknessOptions {
  current(): WorldFact<FieldDarknessObservation>;
  /** Reuse the existing installed FieldMoveFramesMZ wait; do not install a second frame hook. */
  nextFrame(assertCurrent: () => void): Promise<void>;
  isProxy(value: unknown): boolean;
  diagnostic(reason: string): void;
  readonly initialRadius?: number;
  readonly expandedRadius?: number;
  readonly expansionFrames?: number;
}
export interface FieldDarknessAdapter {
  /** Closed native validity cell for the existing field-facts descriptor observer. */
  readonly observation: { readonly revision: number };
  /** Sole Native caller: after its actual entry/load and genuine Map readiness. No synthetic B notice. */
  synchronize(): WorldFact<FieldMoveDarkMask>;
  darkMask(): WorldFact<FieldMoveDarkMask>;
  /** Follow the actual current player after the existing real Map update. */
  update(): void;
  /** An old Scene termination may release only resources belonging to that exact Scene. */
  release(scene: object): void;
}
export interface FieldDefaultSoundOptions {
  readonly sounds?: unknown;
  /** Names witnessed by the build/package asset list. Omitted uses the declared three default files. */
  readonly availableSounds?: unknown;
  isProxy(value: unknown): boolean;
}
export interface FieldDefaultSounds {
  /** Resource DTO only: the existing field leaf invokes AudioManager.playSe under its guard. */
  sound(kind: DefaultFieldSound): WorldFact<FieldMoveSound>;
}
