/** Public entry of the game application layer: runtime facade plus the named host/use-case contracts. */
export { GameApplication, outcomeCode } from "./game-application";
export type { FieldItemExecutionPort, FieldItemExecutionRequest, FieldItemExecutionResult, FieldItemHandoff, FieldItemHandoffOutcome, FieldItemRunOutcome, WorldOperationOutcome } from './world-operation';
export type { WorldNoticeReceipt, WorldNoticeFlushOutcome } from './world-operation';
export type { WorldBusinessFacts, HostWorldFacts, WorldMapEntry, WorldState, WorldLocalState, EncounterRuntime, LegacyWeatherInput } from '../rules/world-state';
export type { NoTargetFieldItemAction } from '../rules/field-items';
export type { CommitResultStatus, GameApplicationOptions, GameApplicationPorts } from "./game-application";
export type {
  BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, TrainerBattleStartRequest, GivenWildBattleStartRequest, GeneratedWildBattleStartRequest, WildGenerationHostPort, ClaimOutcome, ClockPort,
  EncounterPlan, ContentPort, CreationContext, GameStatePort, AtomicStateResult, AtomicWorldState, AtomicFieldQueryState, WorldHostLifecycle, WorldBattleSceneLifecycle, GiftOutcome, GiftRequest, HealOutcome,
  OutcomeProjection, PartyView, RandomPort, StepsOutcome,
  CompletedStepLocation, CompletedWorldStep, CompletedStepPermit, RepelSelectionPermit, OwnedRepelSelection,
  RepelSelectionReply, CompletedStepPresentation, CompletedStepPresentationAck, CompletedStepArrival,
  CompletedStepHostPort, CompletedStepPrefix, CompletedWorldStepOutcome,
  WorldBattleScenePort, FieldEncounterHostPort, FieldMoveBattlePermit, WorldBattleParentPermit, FieldBattlePermit, WorldBattleOffer, WorldBattleAdmission, OrdinaryEncounterHostFacts, OrdinaryEncounterHostPort,
} from "./ports";
export type { ManagementRequest, ManagementOutcome } from "./management";
export type { IndividualView, ManagementSnapshot, StorageMatch, StorageSearch } from "./management-query";
export { individualView } from './management-query';
export type { InventoryRequest, InventoryTicket, InventoryParent, InventoryOutcome } from "./inventory-session";
export type { LearningDecision, LearningIntent, LearningOutcome, LearningParent, LearningView } from "./learning-operation";
export type { BattleEvolutionSeed, EvolutionDecision, EvolutionResolution, EvolutionView, SelectedEvolutionSeed } from "./evolution-operation";
export type {
  EventEvolutionIntent, EvolutionItemIntent, TriggeredDecision, TriggeredEvolutionOutcome, TriggeredEvolutionView,
  TriggeredMemberResult, TriggeredResult,
} from "./triggered-evolution";
export type { TradeDecision, TradeDraftView, TradeIntent, TradeOutcome } from "./trade-operation";
export type { DexDecision, DexEntryIntent, DexEntryOwner, DexOperationView, DexResolution, DexViewingCommand } from "./pokedex-operation";
export type {
  FriendshipMigrationHandle, FriendshipPersistencePort, FriendshipPersistenceSnapshot, FriendshipPersistenceRequest,
  FriendshipPersistenceResult, FriendshipApplicationPreview, FriendshipApplicationResult,
} from "./friendship-migration-operation";

export type { FieldMoveAction, FieldMoveExecutionPort } from './field-move-operation';
export type { FieldMoveRunOutcome } from './world-operation';
export type { FieldShortcutQueries, FieldShortcutSelection, FieldShortcutSnapshot, FieldShortcutResolution } from './field-shortcut-query';
export type { FieldShortcutEntry, FieldShortcutRequest, FieldShortcutPreparation, FieldShortcutExecutionOutcome, FieldShortcutExecutionOptions } from './field-shortcut-selection';

export type { WorldTravelHost, WorldTravelRequest, WorldTravelOutcome, WorldTravelSourceFacts, WorldTravelStepFacts } from './world-travel-ports';
export type { TravelReceipt, TravelArrival, TravelHostEffect, TravelEffectResult, TravelConfirmation } from './world-travel-operation';
export type { FlyDestination } from '../rules/region-map';

export type { FieldShortcutRecoverySnapshot, FieldShortcutRecoveryActionOutcome, FieldShortcutRecoveryFacade } from './field-shortcut-recovery';

export type { MovementStartResult, MovementStartDelta, MovementStartApplicationQueries } from './movement-start-ports';

export type { EventCompanionIntent, EventCompanionIntentReceipt, OrdinaryEventCompanionApplication, EventCompanionProductionChannel } from './event-companion-public-ports';
