import type { BattleSessionView } from "../framework/flow/session-view";
/** Compile-time MZ boundary. Imports are types only; no second application/runtime is bundled into a plugin. */
import type { GameApplication } from '../framework/app';
import type { BattleSessionFactory } from '../framework/app';
import type { Content, DexLookup } from '../framework/rules/types';
import type { LogSink, RingLogger } from '../framework/flow/log';
import type { GameState } from '../framework/rules/state';
import type { Limits } from '../framework/rules/limits';

export type HostApplication = GameApplication<BattleSessionView>;
type CommandKey = 'beginLearning' | 'resolveLearning' | 'beginEvolutionItem' | 'beginEventEvolution' | 'resolveTriggeredEvolution'
  | 'terminateAcquisition' | 'pokedexSnapshot' | 'updatePokedex' | 'resolvePokedex' | 'beginTrade' | 'resolveTrade'
  | 'resolveReceiving' | 'resolveEvolution';
// These mixed continuations historically inspect absent fields as undefined. Preserve that fact without any,
// while retaining each real discriminator and its associated payload.
type HostResult<T> = T extends object ? T & {
  [K in Exclude<'status' | 'reason' | 'error' | 'continuation' | 'continuationToken' | 'battleId', keyof T>]?: never;
} : T;
type ApplicationCommands = { [K in CommandKey]: (...args: Parameters<HostApplication[K]>) => HostResult<ReturnType<HostApplication[K]>> };
export interface ApplicationHost extends ApplicationCommands {
  app(): HostApplication;
  _app: HostApplication | null;
}
export interface ApplicationCompositionHost extends ApplicationHost {
  begin(): Promise<BattleSessionView>;
  game(): GameState;
  content(): Content;
  limits(): Limits;
  random(n: number): number;
  now(): number;
  param(name: string, fallback: number): number;
  flagParam(name: string, fallback: boolean): boolean;
  _content: Content | null;
  _dex: DexLookup | null;
  logger: RingLogger | null;
  seed: number[] | string | undefined;
}
export type LearningApplication = Pick<HostApplication,
  'stateGeneration' | 'encounterBlocked' | 'pendingLearning' | 'beginLearning' | 'resolveLearning' | 'describeLearningMove'>;
export type SaveApplication = Pick<HostApplication,
  'previewFriendshipMigration' | 'confirmFriendshipMigration' | 'cancelFriendshipMigration' | 'assertHostStateReplacementAllowed'>;

/** Only the dynamically loaded exports consumed by application construction. Remaining MZ edges stay separate. */
interface SessionOptions {
  content: () => Content;
  seed?: () => number[] | string | undefined;
  logger?: () => LogSink | undefined;
  replacementOffers?: boolean;
}
export interface ProductionRuntime {
  app: Pick<typeof import('../framework/app'), 'GameApplication' | 'individualView'>;
  composition: {
    createBattleSessionFactory(options: SessionOptions): BattleSessionFactory<BattleSessionView>;
    createLegacyNoHeldBattleSessionFactory(options: SessionOptions): BattleSessionFactory<BattleSessionView>;
  };
  dex: { createDexLookup(engineRoot?: string): DexLookup };
  log: { createRingLogger(capacity?: number): RingLogger };
}


export type InventoryApplication = Pick<HostApplication,
  'beginInventoryOperation'
  | 'beginInventorySort'
  | 'beginItemSelection'
  | 'beginManagement'
  | 'beginMoneyShop'
  | 'browseItemSelection'
  | 'describeParty'
  | 'encounterBlocked'
  | 'endInventoryOperation'
  | 'endInventorySort'
  | 'endManagement'
  | 'finishItemSelection'
  | 'heldItemSourcesEnabled'
  | 'inventoryRequest'
  | 'inventorySnapshot'
  | 'inventoryTicket'
  | 'itemSelectionView'
  | 'manage'
  | 'managementSnapshot'
  | 'moveInventorySort'
  | 'now'
  | 'pendingEvolution'
  | 'pendingPokedex'
  | 'pendingTriggeredEvolution'
  | 'queryBadges'
  | 'queryInventoryItemQuantity'
  | 'queryItemUse'
  | 'saveBlocked'
  | 'setShopPrices'
  | 'shopQuote'
  | 'shopView'
  | 'stateGeneration'
  | 'teachingCandidates'
  | 'tossItems'>;

export type ManagementApplication = Pick<HostApplication,
  'acknowledgeReceivingNotification'
  | 'beginManagement'
  | 'describeIndividual'
  | 'endManagement'
  | 'hasBoxLink'
  | 'holdableBagItems'
  | 'manage'
  | 'managementSnapshot'
  | 'pendingEvolution'
  | 'pendingPokedex'
  | 'pendingReceiving'
  | 'pokedexSnapshot'
  | 'previewReceiving'
  | 'receiveGift'
  | 'receivingNotifications'
  | 'recoverAll'
  | 'resolveReceiving'
  | 'searchStorage'
  | 'stateGeneration'>;

export type EvolutionApplication = Pick<HostApplication,
  'beginEventEvolution'
  | 'beginEvolutionItem'
  | 'beginTrade'
  | 'describeLearningMove'
  | 'describePokedexEntry'
  | 'describeTradeEntry'
  | 'encounterBlocked'
  | 'now'
  | 'pendingEvolution'
  | 'pendingPokedex'
  | 'pendingTrade'
  | 'pendingTriggeredEvolution'
  | 'resolveEvolution'
  | 'resolvePokedex'
  | 'resolveTrade'
  | 'resolveTriggeredEvolution'
  | 'stateGeneration'
  | 'tradeCandidates'>;

export type PokedexApplication = Pick<HostApplication,
  'beginSummaryPokedex'
  | 'encounterBlocked'
  | 'pendingPokedex'
  | 'pokedexSearchDirectory'
  | 'pokedexSnapshot'
  | 'resolvePokedex'
  | 'stateGeneration'
  | 'updatePokedex'>;
