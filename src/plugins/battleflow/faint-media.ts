import type { FaintScheduleResult } from './faint-schedule';

/** Owned by one display step, not by AudioManager or the battle model. */
export interface FaintMedia {
  poll(now: number): FaintScheduleResult;
  playCry(): void;
  playEffect(): void;
  dispose(): void;
  snapshot(): unknown;
}
