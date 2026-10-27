/** Public entry of the game application layer: runtime facade plus the named host/use-case contracts. */
export { GameApplication, outcomeCode } from "./game-application.ts";
export type { CommitResultStatus, GameApplicationOptions, GameApplicationPorts } from "./game-application.ts";
export type {
  BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, ClaimOutcome, ClockPort,
  EncounterPlan, ContentPort, CreationContext, GameStatePort, GiftOutcome, GiftRequest, HealOutcome,
  OutcomeProjection, PartyView, RandomPort, StepsOutcome,
} from "./ports.ts";
export type { ManagementRequest, ManagementOutcome } from "./management.ts";
export type { IndividualView, ManagementSnapshot, StorageMatch, StorageSearch } from "./management-query.ts";
export type { InventoryRequest, InventoryTicket, InventoryParent, InventoryOutcome } from "./inventory-session.ts";
export type { LearningDecision, LearningIntent, LearningOutcome, LearningParent, LearningView } from "./learning-operation.ts";
export type { BattleEvolutionSeed, EvolutionDecision, EvolutionResolution, EvolutionView, SelectedEvolutionSeed } from "./evolution-operation.ts";
export type {
  EventEvolutionIntent, EvolutionItemIntent, TriggeredDecision, TriggeredEvolutionOutcome, TriggeredEvolutionView,
  TriggeredMemberResult, TriggeredResult,
} from "./triggered-evolution.ts";
export type { TradeDecision, TradeDraftView, TradeIntent, TradeOutcome } from "./trade-operation.ts";
export type { DexDecision, DexEntryIntent, DexEntryOwner, DexOperationView, DexResolution, DexViewingCommand } from "./pokedex-operation.ts";
