/** Public entry of the game application layer: runtime facade plus the named host/use-case contracts. */
export { GameApplication, outcomeCode } from "./game-application";
export type { CommitResultStatus, GameApplicationOptions, GameApplicationPorts } from "./game-application";
export type {
  BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, TrainerBattleStartRequest, ClaimOutcome, ClockPort,
  EncounterPlan, ContentPort, CreationContext, GameStatePort, GiftOutcome, GiftRequest, HealOutcome,
  OutcomeProjection, PartyView, RandomPort, StepsOutcome,
} from "./ports";
export type { ManagementRequest, ManagementOutcome } from "./management";
export type { IndividualView, ManagementSnapshot, StorageMatch, StorageSearch } from "./management-query";
export type { InventoryRequest, InventoryTicket, InventoryParent, InventoryOutcome } from "./inventory-session";
export type { LearningDecision, LearningIntent, LearningOutcome, LearningParent, LearningView } from "./learning-operation";
export type { BattleEvolutionSeed, EvolutionDecision, EvolutionResolution, EvolutionView, SelectedEvolutionSeed } from "./evolution-operation";
export type {
  EventEvolutionIntent, EvolutionItemIntent, TriggeredDecision, TriggeredEvolutionOutcome, TriggeredEvolutionView,
  TriggeredMemberResult, TriggeredResult,
} from "./triggered-evolution";
export type { TradeDecision, TradeDraftView, TradeIntent, TradeOutcome } from "./trade-operation";
export type { DexDecision, DexEntryIntent, DexEntryOwner, DexOperationView, DexResolution, DexViewingCommand } from "./pokedex-operation";
