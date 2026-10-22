/** Public entry of the game application layer. */
export { GameApplication, outcomeCode } from "./game-application.ts";
export type { GameApplicationOptions, GameApplicationPorts } from "./game-application.ts";
export type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, ClaimOutcome, EncounterPlan, ContentPort, GameStatePort, HealOutcome, OutcomeProjection, PartyView, RandomPort } from "./ports.ts";

export type { ManagementRequest, ManagementOutcome } from "./management.ts";
