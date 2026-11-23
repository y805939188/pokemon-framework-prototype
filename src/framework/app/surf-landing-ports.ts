/** Sole native producer completion; opaque identities never come from a UI action. */
import type { OwnedSurfLandingProof } from './movement-start-ports';
export type { OwnedSurfLandingProof } from './movement-start-ports';
import type { CompletedWorldStep, CompletedWorldStepOutcome } from './ports';
export interface OwnedSurfLandingStepScope {
  readonly step: CompletedWorldStep;
  finish(outcome: CompletedWorldStepOutcome): void;
  cancel(): void;
}
/** Native arrival hold only. It cannot create an App D operation. */
export interface OwnedSurfLandingHold {
  readonly entry: object;
  prepare(id: string): OwnedSurfLandingStepScope;
  arrivalOnly(ticket: object): void;
  cancel(): void;
}
export interface OwnedSurfLandingBound {
  readonly proof: OwnedSurfLandingProof; readonly hold: OwnedSurfLandingHold;
}
