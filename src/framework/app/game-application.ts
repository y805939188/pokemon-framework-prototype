import { planPlayerFriendshipMigration, applyPlayerFriendshipMigration, friendshipMigrationSnapshot } from "../rules/friendship-migration";
import type { FriendshipMigrationPlan } from "../rules/friendship-migration";
import type { Content } from "../rules/types";
import type { FriendshipPersistencePort, FriendshipPersistenceSnapshot, FriendshipMigrationHandle, FriendshipApplicationPreview, FriendshipApplicationResult, FriendshipPersistenceResult } from "./friendship-migration-operation";
import { normalizeMemberDexAppearance } from "../rules/acquisition-dex";
import { PokedexOperation } from "./pokedex-operation";
import type { DexEntryIntent, DexDecision, DexViewingCommand, DexResolution } from "./pokedex-operation";
import { dexShouldOfferEntry } from "../rules/pokedex";
import { dexInUnlockedRegion } from "../rules/pokedex-query";
import { dexNameGroups, DEX_COLORS, DEX_SHAPES } from "../rules/pokedex-query";
import { semanticFingerprint } from "../rules/semantic";
import { TradeOperation } from "./trade-operation";
import type { TradeIntent, TradeDecision, TradeOutcome } from "./trade-operation";
import type {ItemWorldContext} from '../rules/item-effects';
import type { BattleEvidence } from "../rules/battle-evidence";
import { InventorySession } from "./inventory-session";
import { EvolutionOperation } from "./evolution-operation";
import { LearningOperation } from "./learning-operation";
import { TriggeredEvolutionOperation } from "./triggered-evolution";
import type { EvolutionItemIntent, EventEvolutionIntent, TriggeredDecision, TriggeredEvolutionOutcome } from "./triggered-evolution";
import type { LearningIntent, LearningDecision, LearningParent } from "./learning-operation";
import type { EvolutionDecision, EvolutionResolution, EvolutionView } from "./evolution-operation";
import type { EvolutionFacts } from "../rules/evolution";
import type { InventoryRequest, InventoryParent, InventoryOutcome } from "./inventory-session";
import { badgeCount, hasBadge } from "../rules/economy";
import { assertInventoryMapped, aggregateBag } from "../rules/inventory";
import { catalogOf } from "../rules/item-catalog";
/**
 * The game application: the use cases that coordinate a battle with the persistent game, and nothing else.
 *  - game rules stay in the core (`rules/`): the application calls `applyBattleResult`, it does not re-implement it;
 *  - the Showdown engine and the MZ scene/windows stay behind their own adapters: the application only sees ports.
 * Outcomes are explicit so a caller can tell the four situations apart:
 *   not committed (aborted) | committed | already committed (duplicate) | committed but the host was not informed.
 */
import { planBattlePrimary, capturedTemplates, clone, newGame, resultHash } from "../rules/state";
import { assertBattleResultShape } from "../rules/battle-result-validation";
import { resolveBattleEffects } from "../rules/battle-consumption";
import type { EffectsBindingV2, EffectsContextV2, ResolvedBattleEffects } from "../rules/battle-consumption";
import { composeBattleEffects } from "../rules/battle-effects-writeback";
import type { ApplyStatus, BattleCommitOptions, BattleResult, GameState } from "../rules/state";
import { allMembers, locateMember } from "../rules/storage";
import { DEFAULT_LIMITS, storageFull } from "../rules/limits";
import type { Limits } from "../rules/limits";
import { managementSnapshot, individualView, searchStorage } from "./management-query";
import type { IndividualView, ManagementSnapshot, StorageMatch, StorageSearch } from "./management-query";
import { installedPokedexEntryView, learningMoveView, partyView, pokedexEntryWithMeasurements, pokedexSnapshotView, tradeCandidateViews, tradePokedexEntryInfo } from "./query-views";
import { AcquisitionOperation } from "./acquisition-operation";
import { message, StateInstallFailed } from "./application-errors";
import { stateIdentity } from "./state-identity";
import type { ReceptionContext, ReceptionPending } from "./reception-types";
import { ManagementSession } from "./management";
import type { ManagementOutcome, ManagementRequest } from "./management";
import { developmentCapabilities, resolveConfig } from "../rules/config";
import type { DevelopmentCapabilities } from "../rules/config";
import type { ItemDescriptor, MemberReference } from "../rules/storage-operations";
import { healParty, recoverAll } from "../rules/heal";
import { createMember, personalId } from "../rules/member-factory";
import { appliesAt, pickEncounter, validateEncounterTable } from "../rules/encounter";
import { isDefeat, settleDefeat } from "../rules/defeat";
import { battleView, speciesKeyResolver, toBattleMember, toPersistentMember } from "../rules/species-key";
import { addSteps, bumpStat } from "../rules/stats";
import type { GameStats, StatCounter } from "../rules/stats";
import type { Member, TrainerBattleProjection } from "../rules/types";
import { buildTrainerTeam, findTrainerRecord, trainerBattleProjection } from "../rules/trainer-team";
import { applyBattleMoneyAmount, applyTrainerPrize } from "../rules/trainer-reward";
import type { TrainerPrizeResult } from "../rules/trainer-reward";
import { allocateMemberId, ownerLanguage } from "../rules/member-identity";
import { assertCapturedHeldSources, hasForcedPartyPlan, fallbackDecisions, receiveMembers, ReceivingRefused } from "../rules/receiving";
import type { ReceivingDecision, ReceivingProfile } from "../rules/receiving";
import { snapshotForSave, validateGameContent } from "../rules/save-schema";
import { own } from "../rules/own";
import { findDanglingReferences, resolveSpecies, validatedContentIdentity } from "../flow/content-runtime";
import { planHeldWriteback, resolveRequiredFacts } from "../rules/held-facts";
import type { HeldRosterMember, RequiredFacts } from "../rules/held-facts";
import { claimSettlementHandle, registerLegacyAdmissionRoot, settlementFactorySource } from "./settlement-source";
import type { SettlementFactorySource } from "./settlement-source";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, TrainerBattleStartRequest, ClaimOutcome, ClockPort, ContentPort, CreationContext, EncounterPlan, GameStatePort, GiftOutcome, GiftRequest, HealOutcome, OutcomeProjection, PartyView, RandomPort, StepsOutcome } from "./ports";

export interface GameApplicationPorts<S extends BattleHandle> {
  state: GameStatePort;
  sessions: BattleSessionFactory<S>;
  content: ContentPort;
  projection: OutcomeProjection;
  /** Needed by the use cases that create members (grants, encounters); without it they refuse with "no-random". */
  random?: RandomPort;
  /** The host's wall clock (WP06 §3), for the use cases that need the time; see `now()`. */
  clock?: ClockPort;
  creationContext?: () => CreationContext;
  itemWorld?:()=>ItemWorldContext;
  /** Current world facts only. The application supplies private battle K/D/L0 itself. */
  evolutionWorld?: (member: Readonly<Member>) => EvolutionFacts;
  variables?:{count:()=>number;write:(id:number,value:string)=>void};
}

/** Stage configuration of the application (not ports: plain values the host reads from its settings). */
export interface GameApplicationOptions {
  limits?: Limits;
  /** Money of a new game (WP24 StartMoney; 3000 when omitted). */
  startMoney?: number;
  /** NO_MONEY_LOSS (WP42 §6.1): a defeat then costs no money (the party is still healed). */
  noMoneyLoss?: boolean;
  depositHeal?: boolean;
  capabilities?: Partial<DevelopmentCapabilities>;
  receivingProfile?: ReceivingProfile;
  playerName?: string;
  playerGender?: 0 | 1 | 2;
  playerLocale?: string;
  /** Developer-owned lookup must verify its source permission before data use; it does not enable the capability. */
  describeHeldItem?: (id: string) => ItemDescriptor | null;
}

/** How the host numbers an ending. */
export function outcomeCode(result: BattleResult): number {
  const outcome = result.outcome;
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome) || typeof outcome.kind !== "string" || !outcome.kind || !(outcome.winner === null || typeof outcome.winner === "string")) {
    throw new Error("invalid battle outcome: expected a nonempty kind and a string or null winner");
  }
  const { kind, winner } = outcome;
  return kind === "win" ? (winner === "Player" ? 1 : 4) : kind === "caught" ? 2 : kind === "run" ? 3 : 4;
}

/** What a commit needs to know about the battle beyond its result: for the statistics (WP06 §4.2, WP53 §183, WP61 §7). */
interface BattleFacts { kind: "wild" | "trainer"; canLose: boolean; moneyGain: boolean; trainer?: { projection: TrainerBattleProjection; levels: number[] } }

/**
 * Battle statistics of one committed result (host code: 1 win, 2 caught, 3 ran, 4 lost or drawn). Wild: a win or a
 * catch is won, a run, loss or draw is lost (the reference's 1/4 vs 2/3/5 split). Trainer: a win is won, a loss or draw
 * is lost. A defeat adds the money lost, and counts a blackout unless the author let the player lose this battle.
 */
function battleStats(stats: GameStats, facts: BattleFacts, code: number, defeat: { moneyLost: number } | undefined): GameStats {
  const won = facts.kind === "wild" ? code === 1 || code === 2 : code === 1;
  const key: StatCounter = `${facts.kind}_battles_${won ? "won" : "lost"}`;
  let next = bumpStat(stats, key);
  if (defeat) {
    next = bumpStat(next, "battle_money_lost", defeat.moneyLost);
    if (!facts.canLose) next = bumpStat(next, "blacked_out_count");
  }
  return next;
}

/** Private operation values: public BattleCommitOptions never carry effects authority. */
interface OwnedBattleEffects {
  battleId: string; generation: number; context: EffectsContextV2; contentIdentity: string | null;
}
interface SettlementAdmission {
  source: SettlementFactorySource | null; generation: number; battleId: string; contentIdentity: string | null;
  roster: HeldRosterMember[]; wild: boolean; handle: object | null; invalid: boolean;
  read: boolean; facts?: RequiredFacts; pairHash?: string;
  contentObserved?: boolean;
}
interface PreparedBattle {
  rawHash: string; generation: number; before: GameState; effects: ResolvedBattleEffects; captureMembers: Member[];
  sourceIdentity: string | null; sourceInvalidated: boolean; expectedContext: EffectsContextV2;
  next?: GameState; nextIdentity?: string | null; defeat?: { moneyLost: number; healed: true }; attempted: boolean; indeterminate: boolean; completed: boolean;
  trainerReward?: TrainerPrizeResult & { id: string; version: number };
  diagnostics: string[];
  entries?: DexEntryIntent[];
  required?: RequiredFacts; pairHash?: string;
}
export type CommitResultStatus = ApplyStatus | "pending" | "no-template";

export class GameApplication<S extends BattleHandle = BattleHandle> {
  private readonly ports: GameApplicationPorts<S>;
  private readonly battleStatePort: GameStatePort;
  private readonly limits: Limits;
  private readonly startMoney: number;
  private readonly noMoneyLoss: boolean;
  private readonly capabilities: DevelopmentCapabilities;
  private readonly management: ManagementSession;
  private readonly depositHeal: boolean;
  private readonly profile: ReceivingProfile;
  private readonly playerDefaults: { name: string; gender: 0 | 1 | 2; locale: string };
  private operationSequence = 0;
  private reception: ReceptionPending | null = null;
  private readonly receptionNotices = new Map<string, { id: string; to: "party" | "boxes"; box?: number; boxName?: string }[]>();
  private readonly receptionReceipts = new Map<string, ReturnType<ReceptionPending["resume"]>>();
  private readonly battleContexts = new WeakMap<object, ReceptionContext>();
  private readonly describeHeldItem: (id: string) => ItemDescriptor | null;
  /**
   * The battle operation this application has started and not ended: from the moment startBattle reads the state (the
   * session is still being created: "pending") until finishBattle of its session or abortBattle of its battleId. The
   * session works on the state read at the start and commits back over it, so grants and heals are refused meanwhile
   * ("battle-active"), and a second battle cannot start. Each operation is its own object: a creation that fails, or
   * completes after its operation was aborted, only ever touches that object, never a later operation.
   */
  private op: { battleId: string; session: S | null; facts: BattleFacts } | null = null;
  /**
   * State generation: raised whenever the host installs a state the application did not produce (a save loaded, a new
   * game). Every session remembers the generation it was opened in; a session of an earlier generation (open or already
   * finished) belongs to a state that no longer exists, so finishing it commits nothing (final review P4-2).
   */
  private readonly inventory: InventorySession;
  private readonly evolutions: EvolutionOperation;
  private readonly learning: LearningOperation;
  private readonly triggered: TriggeredEvolutionOperation;
  private readonly trade: TradeOperation;
  private readonly pokedex: PokedexOperation;
  private dexBattleCompletion: { parentToken: string; generation: number; outcome: BattleOutcome & { result?: BattleResult } } | null = null;
  private readonly acquisition: AcquisitionOperation;
  private evolutionCompletion: { token: string; generation: number; outcome: BattleOutcome & { result?: BattleResult } } | null = null;
  readonly #friendshipRawState: GameStatePort;
  #friendshipRevision = 0;
  #friendshipOwner: { invalid: boolean } | null = null;
  readonly #friendshipPreviews = new WeakMap<FriendshipMigrationHandle, {
    generation: number; revision: number; content: Content; contentHash: string; before: string; target: FriendshipPersistenceSnapshot;
    plan: FriendshipMigrationPlan; persistence: FriendshipPersistencePort; result?: FriendshipApplicationResult; completedHostIdentity?: string;
  }>();
  private generation = 0;
  private readonly bornIn = new WeakMap<object, number>();
  private readonly completedEvidence = new WeakMap<object, BattleEvidence>();
  private readonly ownedBattleEffects = new WeakMap<object, OwnedBattleEffects>();
  private readonly receptionActions = new WeakSet<ReceptionContext>();
  private readonly preparedBattles = new WeakMap<ReceptionContext, PreparedBattle>();
  readonly #settlementAdmissions = new WeakMap<ReceptionContext, SettlementAdmission>();
  readonly #settlementFactoryRoot: SettlementFactorySource | null;
  #currentSettlementAdmission: SettlementAdmission | null = null;
  private battleCommitOwner: ReceptionContext | null = null;
  private readonly finishing = new WeakSet<object>();
  private readonly terminatedBattles = new WeakSet<ReceptionContext>();
  private get battleBusy(): boolean { return !!this.#friendshipOwner || !!this.op || !!this.battleCommitOwner || !!this.evolutions?.active || !!this.learning?.active || !!this.triggered?.active || !!this.trade?.active || !!this.acquisition?.active || !!this.pokedex?.active || !!this.dexBattleCompletion; }
  private assertBattleContext(context: ReceptionContext, requireOwner = false): void {
    if (context.generation !== this.generation || this.terminatedBattles.has(context)
      || requireOwner && this.battleCommitOwner !== context) throw new Error("stale battle commit generation or owner");
  }
  private invalidatePreparedSource(prepared: PreparedBattle, battleId: string): void {
    const admission = this.battleCommitOwner ? this.#settlementAdmissions.get(this.battleCommitOwner) : undefined;
    if (admission?.source?.mode === "required") { admission.invalid = true; throw new Error("required-settlement-source-permanently-invalidated"); }
    this.evolutions.discardPrepared();
    this.pokedex.discardReserved(this.battleCommitOwner?.token ?? "");
    prepared.sourceInvalidated = true;
    prepared.effects = resolveBattleEffects({ seal: null, expectedBinding: {
      battleId, generation: prepared.generation, rawHash: prepared.rawHash,
      contentIdentity: prepared.sourceIdentity ?? "0".repeat(64),
    }, expectedContext: prepared.expectedContext, membersBefore: prepared.before.party });
    delete prepared.next; delete prepared.nextIdentity; delete prepared.defeat;
    delete prepared.entries;
    prepared.diagnostics = [];
  }

  /** Read-only transient companion view. It supplies no commit authority and is never a persistent save record. */
  battleEvidenceSnapshot(handle: S): BattleEvidence | null {
    const value = this.completedEvidence.get(handle);
    return value?.context.generation === this.generation ? clone(value) : null;
  }

  private readonly retireSession:((handle:S)=>void)|null;
  constructor(ports: GameApplicationPorts<S>, options: GameApplicationOptions = {}) {
    this.retireSession=ports.sessions?.retire?.bind(ports.sessions)??null;
    this.#settlementFactoryRoot = settlementFactorySource(ports.sessions);
    this.#friendshipRawState = ports.state;
    this.battleStatePort = {read:()=>ports.state.read(),replace:next=>{this.assertNoFriendshipWrite();this.#friendshipRevision++;ports.state.replace(next);}};
    this.ports = {...ports,state:{read:()=>ports.state.read(),replace:next=>{this.assertNoFriendshipWrite();const problems=validateGameContent(next,ports.content().content);if(problems.length)throw new Error(`invalid next state: ${problems[0]!.path} ${problems[0]!.message}`);this.#friendshipRevision++;ports.state.replace(next);this.inventory?.stateChanged(next);}}};
    const contentPort = ports.content;
    this.ports.content = () => {
      const result = contentPort.call(this.ports), admission = this.#currentSettlementAdmission;
      if (admission?.source?.mode === "required") {
        const identity = validatedContentIdentity(result.content);
        if (!admission.contentObserved) { admission.contentObserved = true; admission.contentIdentity = identity; }
        else if (identity !== admission.contentIdentity) admission.invalid = true;
      }
      return result;
    };
    registerLegacyAdmissionRoot(this, {
      open: (battleId, options) => this.openLegacyProducer(battleId, options),
      commit: (battleId, options) => {
        const handle = this.openLegacyProducer(battleId, options), context = this.battleContexts.get(handle)!;
        try {
          const raw = handle.result(); assertBattleResultShape(raw); this.assertBattleContext(context, true);
          if (raw.battleId !== battleId) throw new Error("legacy-producer-battle-id-mismatch");
          return this.commitResultWithContext(clone(raw), context, handle as S);
        } catch (error) {
          if (context.generation === this.generation && this.battleCommitOwner === context && this.reception?.context !== context
            && !this.preparedBattles.get(context)?.indeterminate) {
            this.terminatedBattles.add(context); this.battleCommitOwner = null;
          }
          throw error;
        }
      },
    });
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.startMoney = options.startMoney ?? 3000;
    if (!Number.isSafeInteger(this.startMoney) || this.startMoney < 0) throw new Error("invalid-start-money");
    this.noMoneyLoss = options.noMoneyLoss ?? false;
    this.capabilities = developmentCapabilities(options.capabilities);
    this.depositHeal = options.depositHeal ?? false;
    this.profile = { ...(options.receivingProfile ?? { mode: 0, naming: 0 }) };
    if (![0, 1, 2].includes(this.profile.mode) || !Number.isSafeInteger(this.profile.naming) || this.profile.naming < 0) throw new Error("invalid receiving profile");
    this.playerDefaults = { name: options.playerName ?? "player", gender: options.playerGender ?? 2, locale: options.playerLocale ?? "en" };
    this.describeHeldItem = options.describeHeldItem ?? ((id) => {
      const { content, dex } = this.ports.content();
      if (!content.meta?.showdownSourceChecked) throw new ReceivingRefused("held-item-source-unchecked");
      const item = dex?.heldItem?.(id);
      return item && (item.id === undefined || item.id === id) ? item : null;
    });
    this.management = new ManagementSession(this.ports.state, () => this.ports.content().content, { limits: this.limits, depositHeal: this.depositHeal, sourceAllowed: this.capabilities.allowHeldItemSources, describeItem: this.describeHeldItem });
    this.pokedex = new PokedexOperation({ state: this.battleStatePort, content: this.ports.content, generation: () => this.generation,
      changed: next => this.inventory?.stateChanged(next), leaveSummary:parent=>this.management.releaseChild(parent), enter: parent => {
        if (this.op || this.battleCommitOwner || this.evolutions?.active || this.learning?.active || this.triggered?.active || this.trade?.active || this.acquisition?.active || this.reception || this.inventory?.active || !parent&&this.management.active) throw Error("operation-active");
        if(parent)this.management.reserveDexChild(parent);
      } });
    this.inventory = new InventorySession(this.ports.state,()=>this.ports.content().content,{world:ports.itemWorld,variables:ports.variables,limits:this.limits,generation:()=>this.generation,install:next=>this.install(next),
      enter:parent=>{if(this.battleBusy||this.reception)throw new Error('operation-active');if(parent)this.management.reserveChild(parent.token);else if(this.management.active)throw new Error('management-active');},
      leave:parent=>{if(parent)this.management.releaseChild(parent.token);}});
    this.evolutions = new EvolutionOperation({ state: { read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, content: this.ports.content, generation: () => this.generation, limits: this.limits,
      facts: (member, content) => this.evolutionFacts(member, content), entries: {
        prepare: (token, before, next, memberId, content) => {
          const member = locateMember(next, memberId)?.member;
          const entry = member && this.memberEntry(before, member, content, "evolution");
          return !!entry && this.pokedex.reserve(token, "evolution", [entry], content);
        }, activate: token => this.pokedex.activate(token),
        blocked: token => this.pokedex.view?.parentToken === token,
        discard: token => this.pokedex.discardReserved(token),
      } });
    this.learning = new LearningOperation({ read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, this.ports.content, { generation: () => this.generation, world: () => clone(ports.itemWorld?.() ?? {}),
      enter: (parent, intent) => {
        if (this.op || this.battleCommitOwner || this.evolutions.active || this.triggered?.active || this.trade?.active || this.acquisition?.active || this.reception || this.pokedex.active) throw new Error("operation-active");
        if (parent?.kind === "inventory") {
          if (intent.kind !== "teach" || intent.source.kind !== "machine") throw new Error("invalid-learning-parent");
          this.inventory.reserveLearning(parent.token, intent.memberId, intent.source.entry);
        } else {
          if (this.inventory.active) throw new Error("inventory-operation-active");
          if (intent.kind === "teach" && intent.source.kind === "machine") throw new Error("machine-inventory-parent-required");
          if (parent?.kind === "management") this.management.reserveChild(parent.token);
          else if (this.management.active) throw new Error("management-operation-active");
        }
      },
      leave: parent => { if (parent?.kind === "inventory") this.inventory.releaseLearning(parent.token);
        else if (parent?.kind === "management") this.management.releaseChild(parent.token); } });
    this.triggered = new TriggeredEvolutionOperation({ state: { read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, content: this.ports.content, generation: () => this.generation, limits: this.limits, evolutions: this.evolutions,
      world: () => clone(ports.itemWorld?.() ?? {}), facts: (member, content) => this.evolutionFacts(member, content),
      ownsParent: token => this.inventory.owns(token), enter: (parent, memberId) => {
        if (this.op || this.battleCommitOwner || this.evolutions.active || this.learning.active || this.trade?.active || this.acquisition?.active || this.reception || this.pokedex.active) throw new Error("operation-active");
        if (parent) this.inventory.reserveEvolution(parent, memberId!);
        else if (this.inventory.active || this.management.active) throw new Error("management-operation-active");
      }, leave: parent => { if (parent) this.inventory.releaseLearning(parent); } });
    this.trade = new TradeOperation({ state: { read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, content: this.ports.content, generation: () => this.generation, limits: this.limits,
      enter: () => { if (this.op || this.battleCommitOwner || this.evolutions.active || this.learning.active || this.triggered.active || this.acquisition?.active || this.reception || this.inventory.active || this.management.active || this.pokedex.active) throw Error("operation-active"); },
      world: () => clone(ports.itemWorld?.() ?? {}), facts: (member, content) => this.evolutionFacts(member, content),
      random: this.ports.random, now: () => this.now(), creationContext: this.ports.creationContext,
      allowHeldSources: this.capabilities.allowHeldItemSources, holdable: id => { const item = this.describeHeldItem(id); return !!item?.holdable && !item.mail; } });
    this.acquisition = new AcquisitionOperation({
      state: this.battleStatePort, content: () => this.ports.content().content, random: this.ports.random,
      creationContext: () => this.ports.creationContext?.(), now: () => this.now(), generation: () => this.generation,
      newContext: options => this.newReceptionContext(options), setReception: pending => { this.reception = pending; },
      noteReception: (context, members, next) => this.noteReception(context, members, next),
      reserveDex: (token, entries, content) => { this.pokedex.reserve(token, "acquisition", entries, content); },
      activateDex: token => { this.pokedex.activate(token); }, stateChanged: next => this.inventory.stateChanged(next),
      limits: this.limits, depositHeal: this.depositHeal, allowHeldItemSources: this.capabilities.allowHeldItemSources,
      profile: this.profile, describeHeldItem: id => this.describeHeldItem(id),
    });
  }

  private evolutionFacts(member: Readonly<Member>, content: ReturnType<ContentPort>["content"]): EvolutionFacts {
    let world: EvolutionFacts = {};
    try { world = this.ports.evolutionWorld?.(member) ?? {}; }
    catch { const invalid = { status: "invalid" as const, reason: "world-provider-failed" };
      world = { hour: invalid, mapId: invalid, mapMetadata: invalid, weather: invalid, cycling: invalid, surfing: invalid, diving: invalid, beauty: invalid, moveTypes: invalid }; }
    return world;
  }
  private memberEntry(before: GameState, member: Readonly<Member>, content: ReturnType<ContentPort>["content"], source: "capture" | "evolution"): DexEntryIntent | null {
    const appearance = normalizeMemberDexAppearance(content, member, "recent");
    if (!appearance) return null;
    const previouslyOwned = before.dex.owned.includes(member.species);
    return { memberId: member.id, species: member.species, source, previouslyOwned, appearance,
      offer: dexShouldOfferEntry({ source, previouslyOwned, hasDex: before.dex.hasDex,
        inUnlockedDex: !!content.regionalDex && dexInUnlockedRegion(before.dex, content.regionalDex, member.species),
        moreOften: resolveConfig(content.settings).SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN }) };
  }
  get pendingPokedex() { return this.pokedex.view; }
  beginSummaryPokedex(parentToken:string,memberId:string):DexResolution { this.assertNoFriendshipWrite();return this.pokedex.beginSummary(parentToken,memberId);}
  updatePokedex(command: DexViewingCommand): DexResolution { this.assertNoFriendshipWrite(); return this.pokedex.begin(command); }
  /** Read-only directory from the source-checked adapter, never inferred from species currently in the dex. */
  pokedexSearchDirectory(locale: string) {
    const generation = this.generation, source = this.ports.content();
    if (generation !== this.generation) throw Error('stale-pokedex-query');
    if (source.content.meta?.showdownSourceChecked !== true) throw Error('pokedex-type-source-unchecked');
    this.pokedex.observeContent(source.content);
    if (!source.dex?.allTypes) throw Error('pokedex-type-directory-unavailable');
    const identity=semanticFingerprint(source.content),types = source.dex.allTypes().map(t => t.name);
    if(identity!==semanticFingerprint(this.ports.content().content))throw Error("stale-pokedex-query-content");
    if (generation !== this.generation) throw Error('stale-pokedex-query');
    if (!types.length || types.some(t => typeof t !== 'string' || !t) || new Set(types).size !== types.length) throw Error('invalid-pokedex-type-directory');
    return { names: dexNameGroups(locale), types, colors: [...DEX_COLORS], shapes: [...DEX_SHAPES] };
  }
  pokedexSnapshot(text: Readonly<Record<string, string>> = {}, currentRegion: number | null = null) {
    const generation = this.generation, state = clone(this.ports.state.read()), content = clone(this.ports.content().content);
    if (generation !== this.generation) throw Error("stale-pokedex-query");
    this.pokedex.observeContent(content);
    return pokedexSnapshotView(generation, state, content, text, currentRegion);
  }
  /** Read-only installed-entry projection. Draft trade entries remain owned by their separate view. */
  describePokedexEntry(species: string, locale = "en", text: Readonly<Record<string, string>> = {}) {
    const snapshot = this.pokedexSnapshot(text), content = this.ports.content().content;
    return installedPokedexEntryView(snapshot, content, species, locale);
  }
  /** Read-only entry from this exact trade draft. Never reads its incoming member from the real party. */
  describeTradeEntry(token: string, revision: number, locale = "en", text: Readonly<Record<string, string>> = {}) {
    const generation = this.generation, view = this.trade.view;
    if (!view || view.token !== token || view.revision !== revision || !view.dex || !view.entry) return null;
    const content = clone(this.ports.content().content);
    if (validatedContentIdentity(content) !== view.contentIdentity) throw Error("stale-trade-entry-content");
    const info = tradePokedexEntryInfo(view, content, text);
    const current = this.trade.view;
    if (generation !== this.generation || current?.token !== token || current.revision !== revision) throw Error("stale-trade-entry-query");
    return pokedexEntryWithMeasurements(info, locale);
  }
  resolvePokedex(token: string, revision: number, decision: DexDecision) { this.assertNoFriendshipWrite();
    const generation = this.generation, before = this.pokedex.view, outcome = this.pokedex.resolve(token, revision, decision);
    if (generation !== this.generation) return { status: "refused" as const, reason: "stale-pokedex-operation" };
    if (outcome.status === "pending" || outcome.status === "refused" || !before) return outcome;
    if (before.owner === "evolution") {
      const continuation = this.pendingEvolution;
      if (continuation && continuation.token === before.parentToken && continuation.phase === "after-evolution") {
        return { ...outcome, continuation: this.resolveEvolution(continuation.token, continuation.revision, { kind: decision.kind === "technical-terminate" ? "technical-terminate" : "continue-learning" }) };
      }
    }
    const completion = this.dexBattleCompletion;
    if (before.owner === "capture" && completion && completion.parentToken === before.parentToken && completion.generation === generation) {
      if (decision.kind === "technical-terminate") this.evolutions.cancelPrepared(completion.parentToken);
      const continuation = decision.kind === "technical-terminate" ? { status: "technically-terminated" as const, diagnostics: ["首获展示后续已技术终止，已安装主战果保留"] } : this.evolutions.activate(completion.parentToken);
      if (this.dexBattleCompletion !== completion || generation !== this.generation) return { status: "refused" as const, reason: "stale-pokedex-operation" };
      const continued = this.evolutionOutcome(completion.outcome, continuation);
      if (continuation.status === "pending") this.evolutionCompletion = { token: completion.parentToken, generation, outcome: clone(completion.outcome) };
      this.dexBattleCompletion = null;
      if (continuation.status !== "pending") this.project(continued);
      return { ...outcome, continuation: continued };
    }
    return outcome;
  }
  get pendingEvolution(): EvolutionView | null { return this.trade?.continuation ?? this.evolutions.view; }
  get pendingLearning() { return this.learning.view; }
  teachingCandidates(source: Extract<LearningIntent, { kind: 'teach' }>['source']) { return this.learning.candidates(source); }
  describeLearningMove(id: string) {
    const { content, dex } = this.ports.content();
    return learningMoveView(content, dex, id);
  }
  beginLearning(intent: LearningIntent, parent?: LearningParent) { this.assertNoFriendshipWrite(); return this.learning.begin(intent, parent); }
  resolveLearning(token: string, revision: number, decision: LearningDecision) { this.assertNoFriendshipWrite(); return this.learning.resolve(token, revision, decision); }
  get pendingTrade() { return this.trade.view; }
  beginTrade(requestId: string, intent: TradeIntent) { this.assertNoFriendshipWrite(); return this.trade.begin(requestId, intent); }
  resolveTrade(token: string, revision: number, decision: TradeDecision) { this.assertNoFriendshipWrite(); return this.trade.resolve(token, revision, decision); }
  tradeCandidates(requiredSpecies?: string) {
    const game = this.ports.state.read(), world = clone(this.ports.itemWorld?.() ?? {});
    return tradeCandidateViews(game, world, requiredSpecies);
  }
  get pendingTriggeredEvolution() { return this.triggered.view; }
  beginEvolutionItem(parent: string, requestId: string, intent: EvolutionItemIntent) { this.assertNoFriendshipWrite(); return this.triggered.beginItem(parent, requestId, intent); }
  beginEventEvolution(intent: EventEvolutionIntent = {}) { this.assertNoFriendshipWrite(); return this.triggered.beginEvent(intent); }
  resolveTriggeredEvolution(token: string, revision: number, decision: TriggeredDecision) { this.assertNoFriendshipWrite(); return this.triggered.resolve(token, revision, decision); }
  private evolutionOutcome(outcome: BattleOutcome & { result?: BattleResult }, resolved: EvolutionResolution): BattleOutcome & { result?: BattleResult } {
    if (resolved.status === "refused") return { ...outcome, error: resolved.reason };
    const next = { ...clone(outcome), ...(resolved.diagnostics.length ? { diagnostics: [...new Set([...(outcome.diagnostics ?? []), ...resolved.diagnostics])] } : {}) };
    if (resolved.status === "pending") return { ...next, pending: true, continuationToken: resolved.view.token, continuationRevision: resolved.view.revision };
    delete next.pending; delete next.continuationToken; delete next.continuationRevision;
    if (resolved.status === "technically-terminated") next.diagnostics = [...(next.diagnostics ?? []), "战后进化后续已技术终止，已提交战果保留"];
    return next;
  }
  resolveEvolution(token: string, revision: number, decision: EvolutionDecision): (BattleOutcome & { result?: BattleResult }) | TriggeredEvolutionOutcome | TradeOutcome | { status: "refused"; reason: string } { this.assertNoFriendshipWrite();
    if (this.trade.matchesContinuation(token)) return this.trade.resolveEvolution(token, revision, decision);
    if (this.triggered.matchesContinuation(token)) return this.triggered.resolveContinuation(token, revision, decision);
    const completion = this.evolutionCompletion;
    if (!completion || completion.token !== token || completion.generation !== this.generation) return { status: "refused", reason: "stale-evolution-operation" };
    const resolved = this.evolutions.resolve(token, revision, decision);
    if (completion.generation !== this.generation || this.evolutionCompletion !== completion) return { status: "refused", reason: "stale-evolution-operation" };
    if (resolved.status === "refused") return resolved;
    const outcome = this.evolutionOutcome(completion.outcome, resolved);
    if (resolved.status !== "pending") { this.evolutionCompletion = null; this.project(outcome); }
    return outcome;
  }

  beginInventoryOperation(kind:'bag'|'item'|'shop'='bag',parent?:InventoryParent):string { this.assertNoFriendshipWrite(); return this.inventory.begin(kind,parent); }
  endInventoryOperation(token:string):InventoryOutcome { this.assertNoFriendshipWrite(); return this.inventory.end(token); }
  inventorySnapshot(token:string,filter?:Parameters<InventorySession['snapshot']>[1]) { return this.inventory.snapshot(token,filter); }
  queryInventoryItemQuantity(token:string,itemId:string):number { return this.inventory.quantity(token,itemId); }
  inventoryTicket(token:string,pocket:number,index:number) { return this.inventory.ticket(token,pocket,index); }
  inventoryRequest(token:string,requestId:string,request:InventoryRequest,present?:(outcome:InventoryOutcome)=>void):InventoryOutcome { this.assertNoFriendshipWrite(); return this.inventory.execute(token,requestId,request,present); }
  beginInventorySort(token:string,pocket:number,index:number,filtered=false):InventoryOutcome { this.assertNoFriendshipWrite(); return this.inventory.beginSort(token,pocket,index,filtered); }
  moveInventorySort(token:string,to:number):InventoryOutcome { this.assertNoFriendshipWrite(); return this.inventory.moveSort(token,to); }
  endInventorySort(token:string,cancel=false):InventoryOutcome { this.assertNoFriendshipWrite(); return this.inventory.endSort(token,cancel); }
  queryItemUse(token:string,itemId:string,quantity=1,memberId?:string) { return this.inventory.queryUse(token,itemId,quantity,memberId); }
  beginMoneyShop(input:Parameters<InventorySession['configureShop']>[1]):string { this.assertNoFriendshipWrite();const token=this.inventory.begin('shop');try{this.inventory.configureShop(token,input);return token;}catch(error){this.inventory.end(token);throw error;}}
  shopView(token:string){return this.inventory.shopView(token);}
  shopQuote(token:string,itemId:string,selling=false){return this.inventory.quote(token,itemId,selling);}
  setShopPrices(token:string,itemId:string,buy:number,sell?:number):void{ this.assertNoFriendshipWrite();this.inventory.setPrices(token,itemId,buy,sell);}
  clearShopPrices(token:string):void{ this.assertNoFriendshipWrite();this.inventory.clearPrices(token);}
  beginItemSelection(...args:Parameters<InventorySession['beginSelection']>){ this.assertNoFriendshipWrite();return this.inventory.beginSelection(...args);}
  itemSelectionView(...args:Parameters<InventorySession['selectionView']>){return this.inventory.selectionView(...args);}
  browseItemSelection(...args:Parameters<InventorySession['selectionBrowse']>){ this.assertNoFriendshipWrite();return this.inventory.selectionBrowse(...args);}
  finishItemSelection(...args:Parameters<InventorySession['finishSelection']>){ this.assertNoFriendshipWrite();return this.inventory.finishSelection(...args);}
  tossItems(...args:Parameters<InventorySession['toss']>){ this.assertNoFriendshipWrite();return this.inventory.toss(...args);}
  queryBadges(index?:number):{count:number;owned?:boolean}{const game=this.ports.state.read();return {count:badgeCount(game.badges),...(index===undefined?{}:{owned:hasBadge(game.badges,index)})};}
  hasBoxLink():boolean {return this.inventory.hasBoxLink();}
  heldItemSourcesEnabled():boolean {return this.capabilities.allowHeldItemSources;}

  /** A new game: the formal empty state (no members; the player receives them through grants). Throws only if the store refuses. */
  startNewGame(): { status: "started"; state: GameState } { this.assertNoFriendshipWrite();
    const random = this.ports.random;
    if (!random) throw new Error("no-random: a new player's trainer ID needs an injected random source");
    const content = this.ports.content().content;
    if (!content.regionalDex) throw new Error("needs-content: new game requires a validated regional layout");
    const state = newGame({ content, party: [], money: this.startMoney, player: { id: personalId(random), name: this.playerDefaults.name, gender: this.playerDefaults.gender, language: ownerLanguage(this.playerDefaults.locale) } });
    this.install(state);
    this.stateReplacedByHost();
    return { status: "started", state };
  }

  /** Give a content grant once per save timeline. Never throws; a refusal commits nothing (and writes no claim). */
  claimGrant(grantId: string, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): ClaimOutcome { this.assertNoFriendshipWrite();
    const refused = (reason: string, error: unknown): ClaimOutcome => ({ status: "refused", grantId, reason, error: message(error) });
    if (this.reception?.grantId === grantId) return { status: "pending", grantId, token: this.reception.context.token };
    if (this.battleBusy || this.management.active || this.reception || this.inventory.active) return refused(this.battleBusy ? "battle-active" : "operation-active", "another operation is open");
    return this.acquisition.claimGrant(grantId, options);
  }

  receiveGift(request: GiftRequest, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): GiftOutcome { this.assertNoFriendshipWrite();
    if (this.battleBusy || this.management.active || this.reception || this.inventory.active) return { status: "refused", reason: "operation-active" };
    return this.acquisition.receiveGift(request, options);
  }

  /** Discard only a proved uninstalled acquisition. An installed result is acknowledged, never rolled back. */
  terminateAcquisition(token: string): { status: "aborted" | "already-installed" | "refused" | "reload-required"; reason?: string } { this.assertNoFriendshipWrite();
    const pending = this.reception;
    if (!pending || pending.context.token !== token || pending.context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    if (!this.acquisition.hasPrepared(pending.context)) return { status: "refused", reason: "not-an-acquisition" };
    if (this.receptionActions.has(pending.context)) return { status: "refused", reason: "reception-busy" };
    this.receptionActions.add(pending.context);
    try {
    const probe = this.acquisition.terminationProbe(pending.context, () => pending.context.generation === this.generation && this.reception === pending);
    if (probe === "stale") return { status: "refused", reason: "stale-operation" };
    if (probe === "reload-required") return { status: "reload-required", reason: "acquisition-install-indeterminate" };
    if (probe === "installed") { this.receptionActions.delete(pending.context); const outcome = this.resolveReceiving(token); return "status" in outcome && outcome.status === "applied"
      ? { status: "already-installed" } : { status: "refused", reason: "resume-installed-acquisition" }; }
    this.pokedex.discardReserved(pending.context.token);
    if (this.reception === pending) this.reception = null;
    return { status: "aborted" };
    } finally { this.receptionActions.delete(pending.context); }
  }
  private install(next: GameState): void {
    const content = this.ports.content().content;
    if (next.inventory.pockets.some(pocket => pocket.length)) assertInventoryMapped(next.inventory, catalogOf(content));
    const problems = validateGameContent(next, content);
    if (problems.length) throw new Error(`invalid next state: ${problems[0]!.path} ${problems[0]!.message}`);
    try { this.ports.state.replace(next); } catch (error) { throw new StateInstallFailed(error); }
  }
  get receivingNotifications(): { token: string; placements: { id: string; to: "party" | "boxes"; box?: number; boxName?: string }[] }[] { return [...this.receptionNotices].map(([token, placements]) => ({ token, placements: clone(placements) })); }
  acknowledgeReceivingNotification(token: string): void { this.receptionNotices.delete(token); }
  private noteReception(context: ReceptionContext, members: readonly Member[], next: GameState): void {
    if (!context.recovered) return;
    const placements: { id: string; to: "party" | "boxes"; box?: number; boxName?: string }[] = [];
    for (const m of members) { const found = locateMember(next, m.id); if (found) placements.push(found.position.kind === "party" ? { id: m.id, to: "party" } : { id: m.id, to: "boxes", box: found.position.box, boxName: next.storage.boxes[found.position.box]!.name }); }
    this.receptionNotices.set(context.token, placements);
  }
  private newReceptionContext(options: BattleCommitOptions = {}): ReceptionContext {
    if (this.receptionNotices.size >= 32) throw new Error("unpresented-reception-notifications: present and acknowledge them before opening another receive operation");
    const profile = { ...(options.profile ?? this.profile) };
    if (![0, 1, 2].includes(profile.mode) || !Number.isSafeInteger(profile.naming) || profile.naming < 0) throw new ReceivingRefused("invalid-profile");
    return { ...clone(options), profile, token: `receive:${this.generation}:${++this.operationSequence}`, generation: this.generation };
  }
  get pendingReceiving(): { token: string; members: Member[]; profile: ReceivingProfile } | null { return this.reception ? { token: this.reception.context.token, members: clone(this.reception.members), profile: { ...(this.reception.context.profile ?? this.profile) } } : null; }
  resolveReceiving(token: string, decisions: Record<string, ReceivingDecision> = {}, signal?: "scene-aborted" | "rebuild-failed"): ReturnType<ReceptionPending["resume"]> { this.assertNoFriendshipWrite();
    const receipt = this.receptionReceipts.get(token); if (receipt) return clone(receipt);
    const pending = this.reception;
    if (!pending || pending.context.token !== token || pending.context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    if (this.receptionActions.has(pending.context)) return { status: "refused", reason: "reception-busy" };
    this.receptionActions.add(pending.context);
    try {
    const acquisitionNext = this.acquisition.hasPreparedNext(pending.context);
    const merged = { ...pending.context.decisions, ...clone(decisions) };
    if (acquisitionNext && this.acquisition.decisionConflict(pending.context, merged)) return { status: "refused", reason: "acquisition-decision-conflict" };
    pending.context.decisions = merged;
    if (signal !== undefined) {
      if (!["scene-aborted", "rebuild-failed"].includes(signal)) return { status: "refused", reason: "invalid-recovery-signal" };
      try { if (!acquisitionNext) pending.context.decisions = fallbackDecisions(this.ports.state.read(), pending.members, { limits: this.limits, content: this.ports.content().content, profile: pending.context.profile ?? this.profile, depositHeal: this.depositHeal }, pending.context.decisions); pending.context.recovered = true; }
      catch (error) { return { status: "pending", reason: message(error) }; }
    }
    const outcome = pending.resume();
    if (pending.context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    if (!("pending" in outcome && outcome.pending) && !("status" in outcome && outcome.status === "pending") && !("status" in outcome && outcome.status === "refused")) {
      this.receptionReceipts.set(token, clone(outcome));
      if (this.receptionReceipts.size > 32) this.receptionReceipts.delete(this.receptionReceipts.keys().next().value!);
    }
    return outcome;
    } finally { this.receptionActions.delete(pending.context); }
  }

  /** Technical termination of a proved zero-write battle attempt. It never rolls back an installed primary result. */
  terminateBattleCommit(token: string): { status: "aborted" | "refused" | "reload-required"; reason?: string } { this.assertNoFriendshipWrite();
    const context = this.battleCommitOwner;
    if (!context || context.token !== token || context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    const prepared = this.preparedBattles.get(context);
    if (!prepared) return { status: "refused", reason: "not-a-prepared-battle" };
    let current: GameState;
    try { current = this.battleStatePort.read(); }
    catch { prepared.indeterminate = true; return { status: "reload-required", reason: "state-install-indeterminate" }; }
    if (context.generation !== this.generation || this.battleCommitOwner !== context) return { status: "refused", reason: "stale-operation" };
    if (prepared.completed || prepared.next && stateIdentity(current) === stateIdentity(prepared.next)) return { status: "refused", reason: "already-installed: resume the pending operation" };
    if (stateIdentity(current) !== stateIdentity(prepared.before)) { prepared.indeterminate = true; return { status: "reload-required", reason: "state-install-indeterminate" }; }
    prepared.indeterminate = false;
    if (this.reception?.context === context) this.reception = null;
    if (this.op?.session && this.battleContexts.get(this.op.session) === context) this.op = null;
    this.terminatedBattles.add(context);
    this.pokedex.discardReserved(context.token);
    this.evolutions.cancelPrepared(context.token);
    this.battleCommitOwner = null;
    return { status: "aborted" };
  }

  /** What a party/bag screen shows. Throws when the state is unusable (the screen then says so). */
  describeParty(): PartyView {
    const game = this.ports.state.read();
    const { content } = this.ports.content();
    return partyView(game, content);
  }

  /** Heal the party (HP, status, PP). Safe to repeat: an already healed party writes nothing. Never throws. */
  healParty(): HealOutcome { this.assertNoFriendshipWrite();
    if (this.management.active || this.reception || this.inventory.active) return { status: "refused", reason: "management-active" };
    if (this.battleBusy) return { status: "refused", reason: "battle-active", error: "a battle is open: its result would overwrite the state" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { status: "refused", reason: "state-unusable", error: message(error) }; }
    let next: GameState;
    try { next = healParty(game, this.ports.content().content); } catch (error) { return { status: "refused", reason: "invalid", error: message(error) }; }
    if (JSON.stringify(next.party) === JSON.stringify(game.party)) return { status: "unchanged" };
    try { this.ports.state.replace(next); } catch (error) { return { status: "refused", reason: "commit-failed", error: message(error) }; }
    return { status: "healed" };
  }

  /** Read-only preview over an application-owned plan and an explicitly selected persistence adapter. */
  async previewFriendshipMigration(persistence: FriendshipPersistencePort, paths?: readonly string[]): Promise<FriendshipApplicationPreview | FriendshipApplicationResult> {
    this.assertNoFriendshipWrite();
    if (this.encounterBlocked || this.saveBlocked) return {status:"refused",reason:"operation-active"};
    const owner = {invalid:false}; this.#friendshipOwner = owner;
    try {
      const generation = this.generation, revision = this.#friendshipRevision, content = this.ports.content().content;
      const contentHash = semanticFingerprint(JSON.parse(JSON.stringify(content)) as unknown);
      const current = snapshotForSave(this.ports.state.read(),content);
      if (!current.ok) throw Error("friendship-state-invalid");
      const before = friendshipMigrationSnapshot(current.state);
      const target = clone(await persistence.preview());
      if (owner.invalid || generation !== this.generation || revision !== this.#friendshipRevision || this.ports.content().content !== content || semanticFingerprint(JSON.parse(JSON.stringify(content)) as unknown) !== contentHash
        || friendshipMigrationSnapshot(this.ports.state.read()) !== before || owner.invalid) throw Error("friendship-preview-stale");
      if (friendshipMigrationSnapshot(target.state) !== before) throw Error("friendship-selected-save-mismatch");
      const preview = planPlayerFriendshipMigration(current.state,paths);
      if (preview.status !== "ready") throw Error(preview.reason);
      const handle = Object.freeze({}) as FriendshipMigrationHandle;
      this.#friendshipPreviews.set(handle,{generation,revision,content,contentHash,before,target,plan:preview.plan,persistence});
      return {status:"ready",handle,target:target.target,rawHash:target.rawHash,planHash:preview.plan.planHash,
        targets:clone(preview.plan.targets),candidates:clone(preview.plan.candidates),outOfScope:clone(preview.plan.outOfScope)};
    } catch (error) { return {status:"refused",reason:"preview-rejected",error:message(error)}; }
    finally { if (this.#friendshipOwner === owner) this.#friendshipOwner = null; }
  }
  cancelFriendshipMigration(handle: FriendshipMigrationHandle): FriendshipApplicationResult {
    this.assertNoFriendshipWrite();
    const preview = this.#friendshipPreviews.get(handle);
    if (!preview) return {status:"refused",reason:"unknown-preview"};
    // This describes the historical operation, without making a claim about a subsequently loaded save.
    // Retain the handle so repeated confirmation still performs its full current-state verification.
    if (preview.result) return {status:"refused",reason:"preview-completed"};
    this.#friendshipPreviews.delete(handle);
    return {status:"cancelled"};
  }
  /** Confirm only the opaque handle. Caller-supplied plans, signatures and candidates confer no authority. */
  async confirmFriendshipMigration(handle: FriendshipMigrationHandle): Promise<FriendshipApplicationResult> {
    this.assertNoFriendshipWrite();
    const preview = this.#friendshipPreviews.get(handle);
    if (!preview) return {status:"refused",reason:"unknown-preview"};
    if (this.encounterBlocked || this.saveBlocked) return {status:"refused",reason:"operation-active"};
    const owner = {invalid:false}; this.#friendshipOwner = owner;
    let committed = false, release = true;
    let persisted: FriendshipPersistenceResult | undefined;
    const assertCurrent = () => {
      const content = this.ports.content().content;
      const contentHash = semanticFingerprint(JSON.parse(JSON.stringify(content)) as unknown);
      const before = friendshipMigrationSnapshot(this.ports.state.read());
      if (owner.invalid || this.#friendshipOwner !== owner || preview.generation !== this.generation || preview.revision !== this.#friendshipRevision || content !== preview.content
        || contentHash !== preview.contentHash || before !== preview.before) throw Error("friendship-confirmation-stale");
    };
    try {
      if (preview.result) {
        const now = await preview.persistence.preview();
        if (preview.generation !== this.generation || preview.revision !== this.#friendshipRevision || this.ports.content().content !== preview.content
          || semanticFingerprint(JSON.parse(JSON.stringify(preview.content)) as unknown) !== preview.contentHash
          || friendshipMigrationSnapshot(this.ports.state.read()) !== preview.plan.afterSnapshot
          || friendshipMigrationSnapshot(now.state) !== preview.plan.afterSnapshot || now.target !== preview.target.target
          || now.rawHash !== preview.result.persistence?.rawHash || now.hostIdentity !== preview.completedHostIdentity || owner.invalid) throw Error("friendship-replay-stale");
        return clone({...preview.result,status:preview.result.status === "unchanged" ? "unchanged" : "already-applied"});
      }
      assertCurrent();
      const target = clone(await preview.persistence.preview()); assertCurrent();
      if (friendshipMigrationSnapshot(target) !== friendshipMigrationSnapshot(preview.target)) throw Error("friendship-selected-save-stale");
      const applied = applyPlayerFriendshipMigration(JSON.parse(preview.before) as unknown,preview.plan,{planHash:preview.plan.planHash,targetPaths:preview.plan.targets.map(t=>t.path)});
      if (applied.status === "refused") throw Error(applied.reason);
      const candidate = snapshotForSave(applied.data,preview.content);
      if (!candidate.ok || friendshipMigrationSnapshot(candidate.state) !== preview.plan.afterSnapshot) throw Error("friendship-candidate-invalid");
      if (applied.status === "unchanged") {
        const result: FriendshipApplicationResult = {status:"unchanged",persistence:{status:"committed",rawHash:target.rawHash}};
        preview.result = result; preview.completedHostIdentity = target.hostIdentity; return clone(result);
      }
      try { persisted = await preview.persistence.commit({before:clone(preview.target),next:clone(candidate.state),plan:clone(preview.plan),receipt:clone(applied.receipt),contentHash:preview.contentHash,contentIdentity:validatedContentIdentity(preview.content),assertCurrent}); }
      catch (error) { release = false; return {status:"reload-required",reason:"persistence-unknown",persistence:{status:"unknown",error:message(error)},error:message(error)}; }
      if (persisted.status === "unknown") { release = false; return {status:"reload-required",reason:"persistence-unknown",persistence:persisted}; }
      if (persisted.status === "not-committed") return {status:"refused",reason:"persistence-not-committed",persistence:persisted};
      committed = true;
      assertCurrent();
      const installedFile = await preview.persistence.preview(); assertCurrent();
      if (installedFile.target !== preview.target.target || installedFile.rawHash !== persisted.rawHash || installedFile.hostIdentity !== preview.target.hostIdentity || friendshipMigrationSnapshot(installedFile.state) !== preview.plan.afterSnapshot) throw Error("friendship-persistence-readback-mismatch");
      let installError: unknown;
      try { this.#friendshipRawState.replace(clone(candidate.state)); } catch (error) { installError = error; }
      if (owner.invalid || preview.generation !== this.generation || this.ports.content().content !== preview.content
        || semanticFingerprint(JSON.parse(JSON.stringify(preview.content)) as unknown) !== preview.contentHash
        || friendshipMigrationSnapshot(this.#friendshipRawState.read()) !== preview.plan.afterSnapshot || owner.invalid) throw Error("friendship-install-readback-mismatch");
      const completed = await preview.persistence.preview();
      if (owner.invalid || preview.generation !== this.generation || this.ports.content().content !== preview.content
        || semanticFingerprint(JSON.parse(JSON.stringify(preview.content)) as unknown) !== preview.contentHash
        || friendshipMigrationSnapshot(this.#friendshipRawState.read()) !== preview.plan.afterSnapshot
        || completed.target !== preview.target.target || completed.rawHash !== persisted.rawHash
        || friendshipMigrationSnapshot(completed.state) !== preview.plan.afterSnapshot || owner.invalid) throw Error("friendship-completed-host-unverified");
      preview.completedHostIdentity = completed.hostIdentity;
      this.#friendshipRevision++; preview.revision = this.#friendshipRevision;
      this.inventory.stateChanged(candidate.state);
      const result: FriendshipApplicationResult = {status:"applied",persistence:persisted,...(installError?{error:message(installError)}:{})};
      preview.result = clone(result);
      return result;
    } catch (error) {
      if (committed) { release = false; return {status:"reload-required",reason:"committed-install-unverified",persistence:persisted,error:message(error)}; }
      return {status:"refused",reason:"confirmation-rejected",error:message(error)};
    } finally { if (release && this.#friendshipOwner === owner) { this.#friendshipOwner = null; if (owner.invalid && !preview.result) this.#friendshipPreviews.delete(handle); } }
  }
  /** Host must call BEFORE replacing any host objects, including asynchronous load callbacks. */
  assertHostStateReplacementAllowed(): void { this.assertNoFriendshipWrite(); }
  get friendshipMigrationPending(): boolean { return !!this.#friendshipOwner; }
  private assertNoFriendshipWrite(): void {
    if (this.#friendshipOwner) { this.#friendshipOwner.invalid = true; throw Error("friendship-migration-active"); }
  }

  /** Root management sessions may contain independent edits and one pending movement chain. */
  get stateGeneration(): number { return this.generation; }
  managementSnapshot(token?: string): ManagementSnapshot {
    const game = this.ports.state.read(), virtual = token ? this.management.snapshot(token) : { collection: game, held: null };
    return managementSnapshot(game, virtual.collection, virtual.held, this.generation, this.limits, this.capabilities.allowHeldItemSources);
  }
  /** Decision preview for a receiving UI. Replays completed choices without writing any save record. */
  previewReceiving(token: string, decisions: Record<string, ReceivingDecision>, completed: number): ManagementSnapshot {
    const reception=this.reception;if(!reception||reception.context.token!==token||reception.context.generation!==this.generation)throw new Error('stale-operation');
    if(!Number.isInteger(completed)||completed<0||completed>reception.members.length)throw new Error('invalid-preview-count');
    const prepared=this.acquisition.preparedNext(reception.context);
    if(prepared)return managementSnapshot(prepared,prepared,null,this.generation,this.limits,this.capabilities.allowHeldItemSources);
    const game=this.ports.state.read(),collection=receiveMembers(game,reception.members.slice(0,completed),decisions,{limits:this.limits,content:this.ports.content().content,profile:reception.context.profile??this.profile,depositHeal:this.depositHeal}).state;
    return managementSnapshot(collection,collection,null,this.generation,this.limits,this.capabilities.allowHeldItemSources);
  }
  describeIndividual(id: string): IndividualView {
    const game = this.ports.state.read(), member = locateMember(game, id)?.member ?? this.reception?.members.find(m => m.id === id);
    if (!member) throw new Error("stale-source");
    const { content, dex } = this.ports.content(); return individualView(member, game, content, dex);
  }
  searchStorage(search: StorageSearch, displayName: (member: Member) => string): StorageMatch[] { return searchStorage(this.ports.state.read(), search, displayName); }
  holdableBagItems(): { id: string; count: number }[] {
    if (!this.capabilities.allowHeldItemSources) throw new Error("held-item-source-disabled");
    return Object.entries(aggregateBag(this.ports.state.read().inventory)).filter(([id, count]) => { const item = this.describeHeldItem(id); return count > 0 && item?.holdable && !item.mail; }).map(([id, count]) => ({ id, count }));
  }
  beginManagement(): string { this.assertNoFriendshipWrite(); if (this.battleBusy || this.reception || this.inventory.active) throw new Error("operation-active"); return this.management.begin(); }
  manage(token: string, requestId: string, request: ManagementRequest): ManagementOutcome { this.assertNoFriendshipWrite();
    if (this.battleBusy) return { status: "refused", reason: "battle-active" };
    return this.management.execute(token, requestId, request);
  }
  endManagement(token: string): ManagementOutcome { this.assertNoFriendshipWrite(); return this.management.end(token); }
  heldMemberReference(token: string): MemberReference | null { return this.management.heldReference(token); }
  get encounterBlocked(): boolean { return this.battleBusy || !!this.reception || this.management.active || this.inventory.active; }
  get saveBlocked(): boolean { return this.battleBusy || !!this.reception || this.management.saveBlocked || this.inventory.saveBlocked; }
  recoverAll(): HealOutcome { this.assertNoFriendshipWrite();
    if (this.battleBusy || this.management.active || this.reception || this.inventory.active) return { status: "refused", reason: this.battleBusy ? "battle-active" : "management-active" };
    try { const game = this.ports.state.read(); const next = recoverAll(game, this.ports.content().content, this.depositHeal); if (JSON.stringify(next) === JSON.stringify(game)) return { status: "unchanged" }; this.ports.state.replace(next); return { status: "healed" }; }
    catch (error) { return { status: "refused", reason: "invalid", error: message(error) }; }
  }

  /**
   * The current wall-clock time from the injected clock (milliseconds since the Unix epoch). The single way the
   * application reads time: use cases that need it (time conditions 5.3, time of day 5.5, play time 5.6) take it from
   * here and hand it to the rules as an argument. Throws when no clock is configured or it answers something that is
   * not a finite number of milliseconds.
   */
  now(): number {
    const clock = this.ports.clock;
    if (!clock) throw new Error("no clock is configured for this application");
    const t = clock();
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) throw new Error(`the clock answered ${String(t)}, not a time in milliseconds`);
    return t;
  }

  /** Count steps the player took (WP06 §4.1: the global counter, wrapping at 2^31). The host applies the guards of that step. */
  recordSteps(n = 1): StepsOutcome { this.assertNoFriendshipWrite();
    if (this.management.active || this.reception || this.inventory.active) return { status: "refused", reason: "management-active" };
    if (this.battleBusy) return { status: "refused", reason: "battle-active", error: "a battle is open: its result would overwrite the state" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { status: "refused", reason: "state-unusable", error: message(error) }; }
    let steps: number;
    try { steps = addSteps(game.steps, n); } catch (error) { return { status: "refused", reason: "invalid", error: message(error) }; }
    try { this.ports.state.replace({ ...game, steps }); } catch (error) { return { status: "refused", reason: "commit-failed", error: message(error) }; }
    return { status: "counted", steps };
  }

  /**
   * The host installed a state the application did not produce (a save was loaded, a new game was set up). A battle
   * still open belongs to the replaced state: its operation is released (otherwise grants, heals and battles would stay
   * refused for good, final review P4-2), and its session, should it still finish, commits nothing.
   */
  stateReplacedByHost(): void { this.assertNoFriendshipWrite();
    const retiring=this.op?.session;
    this.generation++;
    if (this.#currentSettlementAdmission) this.#currentSettlementAdmission.invalid = true;
    this.#currentSettlementAdmission = null;
    this.acquisition.invalidate();
    this.op = null;
    this.battleCommitOwner = null;
    this.evolutions.invalidate(); this.evolutionCompletion = null;
    this.pokedex.invalidate(); this.dexBattleCompletion = null;
    this.learning.invalidate();
    this.triggered.invalidate();
    this.trade.invalidate();
    this.inventory.invalidate();
    this.management.invalidate();
    this.reception = null;
    this.receptionReceipts.clear();
    this.receptionNotices.clear();
    if(retiring)try{this.retireSession?.(retiring);}catch{/* generation already retired; host completion stays authoritative */}
  }

  /**
   * Open a battle. A save written against older content is explained here, with the record and the missing thing,
   * instead of crashing inside a battle. The foes are created here from the content (species + level, member-factory)
   * with ids W<seq>-<n>; a foe that cannot be created, or a party with nobody able to battle, refuses the battle.
   * Balls are disabled when a caught member would have nowhere to go (D1). Throws; nothing has been committed or changed.
   * Only one battle at a time: while another is open (also while its session is still being created) this throws. When
   * the battle is aborted before its session exists, a session that arrives later is not kept or returned (rejects).
   */
  /** Stable id + author-version query; C/D receive projections only, not behavior claims. */
  trainerRecord(id: string, version: number): TrainerBattleProjection | null {
    if (typeof id !== "string" || !Number.isSafeInteger(version) || version < 0 || version > 255) throw new Error("invalid trainer record identity");
    const found = findTrainerRecord(this.ports.content().content, id, version);
    return found ? trainerBattleProjection(found.record, found.type) : null;
  }

  async startTrainerBattle(request: TrainerBattleStartRequest): Promise<S> { this.assertNoFriendshipWrite();
    return this.startBattle({ ...request, kind: "trainer", foes: [], trainer: { ...request.trainer } });
  }

  async startBattle(request: BattleStartRequest): Promise<S> { this.assertNoFriendshipWrite();
    if (this.management.active || this.reception || this.inventory.active) throw new Error("operation-active");
    if (this.op) throw new Error(`a battle is already open (${this.op.battleId})`);
    if (this.battleCommitOwner) throw new Error("battle-commit-active");
    if (this.evolutions.active) throw new Error("evolution-operation-active");
    if (this.battleBusy) throw new Error("operation-active");
    const generation = this.generation;
    // The mode is fixed before the first host callback. Returning a handle or omitting a method cannot downgrade it.
    const settlementSource = this.#settlementFactoryRoot;
    const op: { battleId: string; session: S | null; facts: BattleFacts } = { battleId: request.battleId, session: null, facts: { kind: request.kind, canLose: !!request.canLose, moneyGain: true } };
    this.op = op; // reserve before synchronous host ports, not merely before the first await
    const admission: SettlementAdmission = { source: settlementSource, generation, battleId: op.battleId, contentIdentity: null,
      roster: [], wild: op.facts.kind === "wild", handle: null, invalid: false, read: false, contentObserved: false };
    this.#currentSettlementAdmission = admission;
    const assertCurrent = () => { if (this.op !== op || this.generation !== generation) throw new Error(`battle ${request.battleId} was aborted while its session was being created; the late session is not used`); };
    try {
      const moneyGain = request.moneyGain; assertCurrent();
      if (moneyGain !== undefined && typeof moneyGain !== "boolean") throw new Error("moneyGain must be boolean when provided");
      op.facts.moneyGain = moneyGain ?? true;
      const game = this.ports.state.read(); assertCurrent();
      if (!this.capabilities.allowExperimentalHeldItemBattle && game.party.some((m) => !!m.item)) throw new Error("held-item-battle-disabled: battle item write-back is incomplete");
      if (settlementSource?.mode === "legacy-no-held" && (this.capabilities.allowHeldItemSources || this.capabilities.allowExperimentalHeldItemBattle)) throw new Error("legacy-no-held-source-gate");
      const { content, dex } = this.ports.content(); assertCurrent();
      const trainer = request.trainer ? findTrainerRecord(content, request.trainer.id, request.trainer.version) : null;
      if (request.trainer && (request.kind !== "trainer" || !trainer)) throw new Error(`missing trainer record "${request.trainer.id}" version ${request.trainer.version}`);
      if (trainer) op.facts.trainer = { projection: trainerBattleProjection(trainer.record, trainer.type), levels: trainer.record.party.map(member => member.level) };
      assertCurrent();
      const dangling = findDanglingReferences(game, content, dex); assertCurrent();
      if (dangling.length) throw new Error("the save refers to content that no longer exists: " + dangling.slice(0, 3).map((d) => `${d.path} ${d.message}`).join("; "));
      if (!game.party.some((m) => !m.isEgg && m.hp > 0)) throw new Error("no party member can battle");
      const sourceRandom = this.ports.random;
      if (!sourceRandom) throw new Error("no random source is configured for this application (needed to create the foes)");
      const random = (n: number) => { assertCurrent(); const value = sourceRandom(n); assertCurrent(); return value; };
      if (!trainer && !request.foes.length) throw new Error("a battle needs at least one foe");
      const templates: Record<string, Member> = {};
      let ordinal = game.nextMemberOrdinal;
      const taken = new Set(allMembers(game).map((m) => m.id));
      const allocate = (): string => { const allocated = allocateMemberId(ordinal, taken); ordinal = allocated.nextMemberOrdinal; taken.add(allocated.id); return allocated.id; };
      const createdAt = Math.floor(this.now() / 1000); assertCurrent();
      const creationContext = this.ports.creationContext?.() ?? {}; assertCurrent();
      const foes: Member[] = [];
      if (trainer) {
        if (!content.registrationOrder || !content.trainerTypeOrder) throw new Error("trainer content requires explicit species and trainer-type registration orders");
        const generatedOwner = personalId(random), ownerId = generatedOwner === game.player.id ? (generatedOwner ^ 1) >>> 0 : generatedOwner;
        const owner = { id: ownerId, name: trainer.record.name, gender: trainer.type.gender, language: trainer.record.language ?? 2 };
        const built = buildTrainerTeam({ content, registrationOrder: content.registrationOrder, trainerTypeOrder: content.trainerTypeOrder,
          record: trainer.record, type: trainer.type, owner, random, receivedAt: createdAt, allocateId: () => allocate(), context: creationContext });
        for (const [i, member] of built.entries()) {
          if (!member.moves.length) throw new Error(`trainer foe ${i + 1}: ${member.species} at level ${member.level} knows no move`);
          templates[member.id] = toPersistentMember(member, content);
          foes.push(toBattleMember(templates[member.id]!, content));
        }
      } else for (const [i, f] of request.foes.entries()) {
        const species = resolveSpecies(content, f.species);
        if (!species) throw new Error(`foe ${i + 1}: species "${f.species}" is not in the content`);
        const m = createMember({ id: allocate(), species, level: f.level, owner: game.player, context: { ...creationContext, receivedAt: createdAt, playerId: game.player.id } }, content, random);
        if (!m.moves.length) throw new Error(`foe ${i + 1}: ${species} at level ${f.level} knows no move in the content (its learnset has nothing at or below that level)`);
        templates[m.id] = toPersistentMember(m, content);
        foes.push(toBattleMember(templates[m.id]!, content));
      }
      assertCurrent();
      const heldBattle = game.party.some(m => !!m.item) || foes.some(m => !!m.item);
      if (heldBattle && !this.capabilities.allowExperimentalHeldItemBattle) throw new Error("held-item-battle-disabled: held battle capability required for either side");
      for (const member of [...game.party, ...foes]) if (member.item) {
        const item = dex?.heldItem?.(member.item); assertCurrent();
        if (!item?.holdable || item.mail || item.id !== undefined && item.id !== member.item) throw new Error(`unsupported battle held item ${member.item}; use a canonical held item id`);
      }
      const context = this.newReceptionContext({ templates, decisions: {}, profile: request.forceParty ? { ...this.profile, mode: 2 } : this.profile, nextMemberOrdinal: ordinal });
      const full = storageFull(game, this.limits);
      const forcedNoRoom = context.profile?.mode === 2 && !Object.values(templates).every((member) => hasForcedPartyPlan(game, member, { limits: this.limits, content, profile: context.profile!, depositHeal: this.depositHeal }));
      const diagnostics = [...(forcedNoRoom ? ["forced-party-no-target"] : [])];
      const config = resolveConfig(content.settings), contentIdentity = validatedContentIdentity(content) ?? content.meta?.inputsHash ?? content.meta?.id ?? "anonymous-content";
      const memberOwners = Object.fromEntries(game.party.map(member => {
        if (!member.owner) throw new Error(`player member ${member.id} has no authoritative owner for obedience`);
        return [member.id, { ...member.owner }];
      }));
      const setup: BattleSetup = { foes, noRun: !!request.noRun, noBall: !!request.noBall || full || forcedNoRoom, storageFull: full,
        obedience: { player: { ...game.player }, members: memberOwners, badges: badgeCount(game.badges), anyHighLevel: config.ANY_HIGH_LEVEL_POKEMON_CAN_DISOBEY,
          foreignHighLevel: config.FOREIGN_HIGH_LEVEL_POKEMON_CAN_DISOBEY, generation, contentIdentity },
        // This host-facing DTO must never alias the private settlement facts.
        ...(op.facts.trainer ? { trainer: clone(op.facts.trainer.projection), isCurrentBattle: () => this.op === op && this.generation === generation } : {}),
        ...(diagnostics.length ? { diagnostics } : {}), ...(heldBattle ? { experimentalHeldBattle: true } : {}) };
      let mapId: number | undefined;
      try { mapId = this.ports.itemWorld?.().mapId ?? creationContext.map; } catch { /* optional companion context unavailable */ }
      assertCurrent(); // a swallowed optional-port failure must not swallow a timeline/owner replacement
      setup.evidenceContext = {
        battleId: request.battleId, generation, contentIdentity,
        playerIds: game.party.map(m => m.id), initialLevels: Object.fromEntries(game.party.map(m => [m.id, m.level])),
        ...(Number.isSafeInteger(mapId) && mapId! >= 0 ? { mapId } : {}),
      };
      const view = battleView(game, content);
      view.party = view.party.filter((m) => !m.isEgg); // the session speaks Showdown names (protocol v1); the save keeps content ids
      admission.roster = [
          ...view.party.slice(0, 6).map(m => ({ id: m.id, side: "p1" as const, initial: m.item })),
          ...foes.map(m => ({ id: m.id, side: "p2" as const, initial: m.item })),
        ];
      this.#settlementAdmissions.set(context, admission);
      if (settlementSource?.mode === "required" && (!admission.contentIdentity || admission.invalid)) throw new Error("required-settlement-content-identity-unavailable-or-changed");
      if (settlementSource?.mode === "legacy-no-held" && (this.capabilities.allowHeldItemSources || this.capabilities.allowExperimentalHeldItemBattle || admission.roster.some(m => !!m.initial))) throw new Error("legacy-no-held-source-gate");
      assertCurrent();
      // The required source sees the operation's captured kind/id, not fields a prior host callback changed.
      // Explicit old adapters retain their historical request object contract.
      const factoryRequest = settlementSource?.mode === "required" ? { ...request, battleId: op.battleId, kind: op.facts.kind } : request;
      assertCurrent();
      const session = await (settlementSource ? settlementSource.create(factoryRequest, view, setup) : this.ports.sessions.create(request, view, setup)) as S;
      assertCurrent();
      if (!claimSettlementHandle(session, this, context)) throw new Error("battle-handle-already-bound");
      admission.handle = session;
      op.session = session;
      if (typeof session === "object" && session !== null) {
        this.bornIn.set(session, this.generation); this.battleContexts.set(session, context);
        this.ownedBattleEffects.set(session, { battleId: request.battleId, generation, contentIdentity: validatedContentIdentity(content), context: {
          playerIds: [...setup.evidenceContext.playerIds], L0: clone(setup.evidenceContext.initialLevels),
          engineRosterIds: view.party.filter(m => !m.isEgg).slice(0, 6).map(m => m.id), foeIds: foes.map(m => m.id), internalBattle: true,
        } });
      }
      return session;
    } catch (error) { if (this.op === op) { this.op = null; if (this.#currentSettlementAdmission) this.#currentSettlementAdmission.invalid = true; this.#currentSettlementAdmission = null; } throw error; }
  }

  /**
   * A wild encounter for a host table at a region (WP36 §5.1 selection, decided here so the host keeps no rule).
   * Never throws: "not-here" when the table does not apply at the region, and no encounter when nobody can battle.
   */
  prepareEncounter(table: unknown, region: number): EncounterPlan {
    if (this.encounterBlocked) return { ok: false, reason: "operation-active" };
    const checked = validateEncounterTable(table);
    if (!checked.table) return { ok: false, reason: "invalid-table", error: checked.problems.map((p) => `${p.path} ${p.message}`).join("; ") };
    if (!appliesAt(checked.table, region)) return { ok: false, reason: "not-here" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { ok: false, reason: "state-unusable", error: message(error) }; }
    if (!this.capabilities.allowExperimentalHeldItemBattle && game.party.some((m) => !!m.item)) return { ok: false, reason: "held-item-battle-disabled" };
    if (!game.party.some((m) => !m.isEgg && m.hp > 0)) return { ok: false, reason: "no-able-member" };
    const random = this.ports.random;
    if (!random) return { ok: false, reason: "no-random", error: "no random source is configured for this application" };
    try {
      const content = this.ports.content().content;
      for (const slot of checked.table.slots) if (!resolveSpecies(content, slot.species)) return { ok: false, reason: "unknown-species", error: `"${slot.species}" is not in the content` };
      const pick = pickEncounter(checked.table, random);
      return { ok: true, foe: { species: resolveSpecies(content, pick.species)!, level: pick.level } };
    } catch (error) { return { ok: false, reason: "invalid-content", error: message(error) }; } // an unusable content port or random source
  }

  /**
   * Apply a result to the persistent state. Safe to call twice: the same result is a no-op, a different result for the
   * same battle is refused. Throws on a contract violation and then the state is exactly as it was. Without a battle
   * operation the application does not know the battle's kind, so no battle statistics are counted (finishBattle does).
   */
  commitResult(result: BattleResult, options: BattleCommitOptions = {}): CommitResultStatus { this.assertNoFriendshipWrite();
    if (this.management.active || this.inventory.active) throw new Error("management-active");
    if (this.battleBusy) throw new Error("battle-active: use the current battle/receiving operation");
    if (this.reception) throw new Error("receiving-active: use its receiving token");
    assertBattleResultShape(result);
    const context = this.newReceptionContext(options);
    return this.commitResultWithContext(clone(result), context);
  }
  private commitResultWithContext(result: BattleResult, context: ReceptionContext, handle?: S): CommitResultStatus {
    try { const status = this.commit(result, undefined, context, handle).status; if (status === "applied") this.pokedex.activate(context.token); return status; }
    catch (error) {
      this.assertBattleContext(context);
      if (error instanceof StateInstallFailed || error instanceof ReceivingRefused && error.reason === "pending") {
        const members = this.preparedBattles.get(context)?.captureMembers ?? [];
        this.reception = { context, members: clone(members), resume: () => ({ status: this.commitResultWithContext(result, context, handle) }) };
        return "pending";
      }
      if (!(error instanceof ReceivingRefused)) throw error;
      if (error.reason === "no-template") return "no-template";
      throw error;
    } finally {
      if (this.battleCommitOwner === context && this.reception?.context !== context && !this.preparedBattles.get(context)?.indeterminate) this.battleCommitOwner = null;
    }
  }

  private openLegacyProducer(battleId: string, options: BattleCommitOptions): BattleHandle {
    const source = this.#settlementFactoryRoot;
    if (source?.mode !== "legacy-no-held" || !source.legacyProduce) throw new Error("legacy-producer-not-selected-at-composition");
    if (!battleId || typeof battleId !== "string") throw new Error("invalid-legacy-producer");
    if (this.battleBusy || this.reception || this.management.active || this.inventory.active) throw new Error("operation-active");
    if (this.capabilities.allowHeldItemSources || this.capabilities.allowExperimentalHeldItemBattle) throw new Error("legacy-no-held-source-gate");
    const generation = this.generation, context = this.newReceptionContext(options);
    if (this.battleBusy || this.reception || this.management.active || this.inventory.active || generation !== this.generation) throw new Error("operation-active");
    this.battleCommitOwner = context;
    const produce = source.legacyProduce;
    let produced: BattleResult | undefined;
    const handle: BattleHandle = { result: () => {
      this.assertBattleContext(context);
      if (produced) return clone(produced); // Original exact query never invokes a newer producer or needs fresh ownership.
      this.assertBattleContext(context, true);
      const game = this.ports.state.read(); this.assertBattleContext(context, true);
      if (game.party.some(m => !!m.item)) { admission.invalid = true; throw new Error("legacy-no-held-source-gate"); }
      admission.roster = game.party.filter(m => !m.isEgg).map(m => ({ id: m.id, side: "p1", initial: "" }));
      const received = produce(battleId); assertBattleResultShape(received);
      this.assertBattleContext(context, true);
      produced = clone(received);
      return clone(produced);
    } };
    const admission: SettlementAdmission = { source,
      generation, battleId, contentIdentity: null, roster: [], wild: false, handle, invalid: false, read: false };
    this.#settlementAdmissions.set(context, admission);
    if (!claimSettlementHandle(handle, this, context)) throw new Error("battle-handle-already-bound");
    this.battleContexts.set(handle, context); this.bornIn.set(handle, generation);
    return handle;
  }

  /** Read only the source's already sealed final pair, once. No engine or newer content is consulted for replay. */
  private readRequiredSettlement(admission: SettlementAdmission, hash: string, context: ReceptionContext, handle: S): void {
    if (admission.source?.mode !== "required") return;
    if (admission.invalid || admission.generation !== this.generation || admission.handle !== handle || !admission.contentIdentity) throw new Error("required-settlement-source-unknown-or-retired");
    if (!admission.read) {
      admission.read = true;
      try {
        const binding = { battleId: admission.battleId, generation: admission.generation, rawHash: hash, contentIdentity: admission.contentIdentity };
        const sealed = admission.source.collect?.(handle, binding);
        this.assertBattleContext(context);
        if (admission.invalid) throw new Error("required-settlement-source-permanently-invalidated");
        const resolved = resolveRequiredFacts(sealed, { binding, roster: admission.roster, wild: admission.wild });
        if (!resolved.ok) throw new Error(resolved.reason);
        admission.facts = resolved.facts; admission.pairHash = resolved.pairHash;
      } catch (error) { admission.invalid = true; throw error; }
    }
    if (!admission.facts || admission.facts.binding.rawHash !== hash) { admission.invalid = true; throw new Error("required-settlement-paired-result-changed"); }
  }

  /**
   * One state replacement per result: the result (species mapped to persistent keys through the content, D5-3), for a
   * lost or drawn battle the defeat settlement (money loss and party heal, D3), and the battle statistics. All are
   * identified by the result's battleId + hash in appliedBattles, so a repeat (already-applied) never settles again.
   */
  private commit(result: BattleResult, facts: BattleFacts | undefined, context: ReceptionContext, handle?: S): { status: ApplyStatus; defeat?: { moneyLost: number; healed: true }; trainerReward?: TrainerPrizeResult & { id: string; version: number }; diagnostics?: string[] } {
    assertBattleResultShape(result);
    this.assertBattleContext(context);
    const authority = handle ? this.ownedBattleEffects.get(handle) : undefined;
    if (authority && authority.battleId !== result.battleId) throw new Error("battle-result-owner-mismatch");
    // read() is a synchronous host port and may call back into the application. Reserve before the first read,
    // including exact replay, so no other operation can take a stale snapshot in that callback window.
    if (this.battleCommitOwner && this.battleCommitOwner !== context) throw new Error("battle-commit-active");
    if (this.op && (!handle || this.op.session !== handle)) throw new Error("battle-active");
    this.battleCommitOwner = context;
    const code = outcomeCode(result), hash = resultHash(result), current = this.ports.state.read();
    this.assertBattleContext(context);
    let prepared = this.preparedBattles.get(context);
    const previous = own(current.appliedBattles, result.battleId);
    let admission = this.#settlementAdmissions.get(context);
    if (previous) {
      if (previous.hash !== hash) throw new Error(`battle ${result.battleId} already applied with a different result`);
      if (previous.settlement && admission?.source?.mode === "required") {
        // Only this original, authenticated cached pair may outlive fresh-source invalidation. A new handle
        // must still authenticate its own seal before querying a ledger with a paired identity.
        if (!admission.facts) this.readRequiredSettlement(admission, hash, context, handle!);
        if (admission.handle !== handle || admission.generation !== this.generation
          || admission.facts?.binding.rawHash !== hash || !admission.pairHash) throw new Error("required-settlement-paired-result-changed");
      }
      if (previous.settlement && admission?.pairHash && previous.settlement.pairHash !== admission.pairHash) throw new Error("battle settlement pair conflict");
      if (previous.trainer && facts?.trainer && (previous.trainer.id !== facts.trainer.projection.id || previous.trainer.version !== facts.trainer.projection.version)) throw new Error("trainer battle ledger identity conflict");
      if (prepared?.attempted && !prepared.completed && prepared.next) {
        if (stateIdentity(current) !== stateIdentity(prepared.next)) { prepared.indeterminate = true; throw new StateInstallFailed("state-install-indeterminate: reload the last complete save", true); }
        prepared.completed = true; prepared.indeterminate = false;
        this.noteReception(context, result.captured, current); this.reception = null;
        return { status: "applied", ...(prepared.defeat ? { defeat: prepared.defeat } : {}), ...(prepared.trainerReward ? { trainerReward: prepared.trainerReward } : {}), diagnostics: [...prepared.diagnostics, "状态已完整安装，已核定原提交"] };
      }
      // Exact replay is content-independent and never fetches a newer effects seal or a second prize.
      return { status: "already-applied" };
    }
    // A closed external source refuses before any content/producer lookup. This is not a legacy admission.
    if (!this.capabilities.allowHeldItemSources) assertCapturedHeldSources(result.captured, context.templates ?? {}, { allowed: false, describe: this.describeHeldItem });
    // A deliberately selected legacy direct producer can preserve the old public direct API. The supplied JSON is
    // compared to that preselected producer, never used to choose a mode or manufacture a source capability.
    if (!handle && !admission && this.#settlementFactoryRoot?.mode === "legacy-no-held" && this.#settlementFactoryRoot.legacyProduce) {
      if (this.capabilities.allowHeldItemSources || this.capabilities.allowExperimentalHeldItemBattle || current.party.some(m => !!m.item)) throw new Error("legacy-no-held-source-gate");
      const source = this.#settlementFactoryRoot, producedHandle: BattleHandle = { result: () => source.legacyProduce!(result.battleId) };
      admission = { source, generation: context.generation, battleId: result.battleId, contentIdentity: null, roster: [], wild: false,
        handle: producedHandle, invalid: false, read: false };
      this.#settlementAdmissions.set(context, admission); this.battleContexts.set(producedHandle, context); this.bornIn.set(producedHandle, context.generation);
      if (!claimSettlementHandle(producedHandle, this, context)) throw new Error("battle-handle-already-bound");
      try {
        const actual = producedHandle.result(); assertBattleResultShape(actual); this.assertBattleContext(context, true);
        if (resultHash(actual) !== hash) throw new Error("legacy-direct-producer-result-mismatch");
      } catch (error) { admission.invalid = true; throw error; }
    }
    if (!handle && admission?.source?.mode === "legacy-no-held" && admission.handle) handle = admission.handle as S;
    if (!admission?.source || admission.invalid || admission.generation !== this.generation || admission.battleId !== result.battleId || admission.handle !== handle) throw new Error("battle-settlement-source-unknown-or-retired");
    if (admission.source.mode === "legacy-no-held" && (this.capabilities.allowHeldItemSources || this.capabilities.allowExperimentalHeldItemBattle
      || current.party.some(m => !!m.item) || result.captured.some(m => !!m.item))) { admission.invalid = true; throw new Error("legacy-no-held-source-gate"); }
    // This fresh-only closed-source guard must not load current content or an external item catalog.
    assertCapturedHeldSources(result.captured, context.templates ?? {}, { allowed: this.capabilities.allowHeldItemSources, describe: this.describeHeldItem });
    const { content } = this.ports.content(), identity = validatedContentIdentity(content);
    this.assertBattleContext(context, true);
    if (admission.source.mode === "required") {
      if (identity !== admission.contentIdentity || !identity) { admission.invalid = true; throw new Error("required-settlement-content-source-changed"); }
      this.readRequiredSettlement(admission, hash, context, handle!);
    }
    if (prepared && (prepared.rawHash !== hash || prepared.generation !== this.generation)) throw new Error("prepared battle binding changed");
    if (prepared && stateIdentity(current) !== stateIdentity(prepared.before)) {
      prepared.indeterminate = true;
      throw new StateInstallFailed("state-changed-during-prepared-commit: reload the last complete save", true);
    }
    // A new content identity may revalidate a zero-write primary plan, but can never revive the old source seal.
    // Actual installed/indeterminate attempts were handled above against their original next state first.
    if (prepared && (!prepared.sourceInvalidated && prepared.sourceIdentity !== identity
      || prepared.next && prepared.nextIdentity !== identity)) this.invalidatePreparedSource(prepared, result.battleId);
    if (!prepared?.next) {
      // Fresh reference checks are complete before a pending receiving choice can defer the source seal.
      let applied: ReturnType<typeof planBattlePrimary> | undefined;
      let receiving: ReceivingRefused | undefined;
      try {
        applied = planBattlePrimary(current, result, this.limits, speciesKeyResolver(content), { ...context, content, depositHeal: this.depositHeal,
          heldItemSource: { allowed: this.capabilities.allowHeldItemSources, describe: this.describeHeldItem } });
      } catch (error) {
        if (!(error instanceof ReceivingRefused) || error.reason !== "pending") throw error;
        receiving = error;
      }
      this.assertBattleContext(context, true);
      if (!prepared) {
        const owned = handle ? this.ownedBattleEffects.get(handle) : undefined;
        const expectedContext: EffectsContextV2 = owned?.context ?? {
          playerIds: current.party.map(m => m.id), L0: Object.fromEntries(current.party.map(m => [m.id, m.level])),
          engineRosterIds: current.party.filter(m => !m.isEgg).slice(0, 6).map(m => m.id), foeIds: result.captured.map(m => m.id), internalBattle: false,
        };
        const binding: EffectsBindingV2 = { battleId: result.battleId, generation: this.generation, rawHash: hash, contentIdentity: owned?.contentIdentity ?? "0".repeat(64) };
        let seal: unknown = null;
        const compatible = !!owned && owned.generation === this.generation && owned.contentIdentity !== null && owned.contentIdentity === identity;
        if (compatible && handle && this.ports.sessions.effects) {
          try { seal = this.ports.sessions.effects(handle, binding); } catch { /* Auxiliary absence never discards the legal primary plan. */ }
        }
        this.assertBattleContext(context, true);
        prepared = { rawHash: hash, generation: this.generation, before: clone(current), expectedContext: clone(expectedContext),
          effects: resolveBattleEffects({ seal, expectedBinding: binding, expectedContext, membersBefore: current.party }),
          captureMembers: capturedTemplates(result, context.templates ?? {}, speciesKeyResolver(content), content),
          sourceIdentity: owned?.contentIdentity ?? null, sourceInvalidated: !compatible, attempted: false, indeterminate: false, completed: false, diagnostics: [] };
        if (admission.facts) { prepared.required = clone(admission.facts); prepared.pairHash = admission.pairHash; }
        this.preparedBattles.set(context, prepared);
      }
      // Content changes can only downgrade a prepared source. They never cause a new source lookup/backfill.
      if (!prepared.sourceInvalidated && prepared.sourceIdentity !== identity) {
        this.invalidatePreparedSource(prepared, result.battleId);
      }
      // Reception may return pending before an install exists. It must still observe any content replacement
      // made by the one source callback; returning to the old identity later cannot revive that old authority.
      const afterSourceIdentity = validatedContentIdentity(this.ports.content().content);
      this.assertBattleContext(context, true);
      if (!prepared.sourceInvalidated && prepared.sourceIdentity !== afterSourceIdentity) this.invalidatePreparedSource(prepared, result.battleId);
      if (receiving) throw receiving;
      if (!applied || applied.status !== "applied") throw new Error("primary planning failed");
      const composed = composeBattleEffects({ before: prepared.before, primary: applied.state, raw: result, content, effects: prepared.effects, internalBattle: prepared.expectedContext.internalBattle });
      let next = composed.state;
      if (prepared.required) {
        next = planHeldWriteback({ before: prepared.before, primary: next, facts: prepared.required,
          capturedOrigins: Object.fromEntries(result.captured.map(m => [m.id, m.id])) }).state;
        const ledger = own(next.appliedBattles, result.battleId);
        if (!ledger || !prepared.pairHash) throw new Error("required-settlement-ledger-missing");
        ledger.settlement = { version: 1, pairHash: prepared.pairHash };
      }
      prepared.entries = composed.captures.flatMap(capture => {
        const member = locateMember(next, capture.memberId)?.member;
        const entry = member && this.memberEntry(prepared!.before, member, content, "capture");
        return entry ? [{ ...entry, previouslyOwned: capture.previouslyOwned }] : [];
      });
      const eligibleHp = Object.fromEntries(next.party.map(member => [member.id, member.hp]));
      if (facts?.trainer && code === 1) {
        const { id, version, baseMoney } = facts.trainer.projection;
        if (facts.moneyGain) {
          const multiplier = prepared.required ? (prepared.required.money.amuletCoin ? 2 : 1) * (prepared.required.money.happyHour ? 2 : 1) : 1;
          const prize = applyTrainerPrize(next, [{ baseMoney, levels: facts.trainer.levels }], content, this.limits, multiplier);
          next = prize.state;
          prepared.trainerReward = { id, version, ...prize.reward };
          if (prize.reward.normalizationLoss > 0) prepared.diagnostics.push(`旧钱包超过上限，规范化下降 ${prize.reward.normalizationLoss}；不计负奖金`);
        }
        const key = `${id}@${version}`, prior = own(next.defeatedTrainers, key);
        if (prior && (prior.id !== id || prior.version !== version)) throw new Error("defeated trainer record conflict");
        next.defeatedTrainers[key] = { id, version };
        const ledger = own(next.appliedBattles, result.battleId);
        if (!ledger) throw new Error("trainer battle ledger was not prepared");
        ledger.trainer = { id, version };
      }
      if (prepared.required && facts?.moneyGain && (code === 1 || code === 2) && prepared.required.money.payDay > 0) {
        const multiplier = (prepared.required.money.amuletCoin ? 2 : 1) * (prepared.required.money.happyHour ? 2 : 1);
        const paid = applyBattleMoneyAmount(next, prepared.required.money.payDay * multiplier, content, this.limits);
        next = paid.state;
        if (paid.reward.actual > 0) prepared.diagnostics.push(`聚宝功获得 ${paid.reward.actual}`);
        if (paid.reward.normalizationLoss > 0) prepared.diagnostics.push(`旧钱包超过上限，规范化下降 ${paid.reward.normalizationLoss}；不计负奖金`);
      }
      if (isDefeat(result)) {
        const settled = settleDefeat(next, content, { noMoneyLoss: this.noMoneyLoss, badges: badgeCount(next.badges), moneyLimit: this.limits.money });
        next = settled.state; prepared.defeat = { moneyLost: settled.moneyLost, healed: true };
      }
      if (facts) next = { ...next, stats: battleStats(next.stats, facts, code, prepared.defeat) };
      if (handle && authority) {
        const config = resolveConfig(content.settings);
        next = this.evolutions.prepare({ token: context.token, generation: context.generation, context: prepared.expectedContext, effects: prepared.effects,
          eligibleHp, lateHeal: isDefeat(result) && facts?.canLose === false,
          // WP32 T4: disabling all-endings excludes only normal loss/tie, not a successful escape.
          // Technical aborts never reach this owned, validated result transaction.
          enabled: config.CHECK_EVOLUTION_AFTER_ALL_BATTLES || !isDefeat(result) }, next, content);
      }
      if (prepared.effects.dispositions.some(d => d.status !== "complete") || composed.dispositions.some(d => d.status !== "applied")) prepared.diagnostics.push("部分战斗附加事实不可用，主战果保留");
      prepared.next = clone(next); prepared.nextIdentity = identity;
    }
    const next = prepared.next!;
    const problems = validateGameContent(next, content);
    if (problems.length) throw new Error(`invalid battle next state: ${problems[0]!.path} ${problems[0]!.message}`);
      this.pokedex.reserve(context.token, "capture", prepared.entries ?? [], content);
    if (next.inventory.pockets.some(pocket => pocket.length)) assertInventoryMapped(next.inventory, catalogOf(content));
    const latest = this.battleStatePort.read();
    this.assertBattleContext(context, true);
    if (stateIdentity(latest) !== stateIdentity(prepared.before)) {
      prepared.indeterminate = true;
      throw new StateInstallFailed("state-changed-before-battle-install: reload the last complete save", true);
    }
    const latestIdentity = validatedContentIdentity(this.ports.content().content);
    this.assertBattleContext(context, true);
    if (latestIdentity !== identity) {
      this.invalidatePreparedSource(prepared, result.battleId);
      throw new StateInstallFailed("content-changed-before-battle-install: retry with stable current content");
    }
    if (admission.invalid) throw new Error("required-settlement-source-permanently-invalidated");
    prepared.attempted = true;
    let failure: unknown;
    try { this.battleStatePort.replace(clone(next)); this.inventory.stateChanged(next); }
    catch (error) { failure = error; }
    let installed: GameState;
    try { installed = this.battleStatePort.read(); }
    catch (error) { prepared.indeterminate = true; throw new StateInstallFailed(error, true); }
    this.assertBattleContext(context, true);
    if (stateIdentity(installed) !== stateIdentity(next)) {
      prepared.indeterminate = stateIdentity(installed) !== stateIdentity(prepared.before);
      throw new StateInstallFailed(failure ?? "state port did not install the complete battle state", prepared.indeterminate);
    }
    if (failure) prepared.diagnostics.push(`状态已完整安装，宿主确认失败: ${message(failure)}`);
    prepared.completed = true; prepared.indeterminate = false;
    this.noteReception(context, result.captured, next); this.reception = null;
    return { status: "applied", ...(prepared.defeat ? { defeat: prepared.defeat } : {}), ...(prepared.trainerReward ? { trainerReward: prepared.trainerReward } : {}), ...(prepared.diagnostics.length ? { diagnostics: [...prepared.diagnostics] } : {}) };
  }

  /**
   * End a battle: read its result, commit it once, tell the host. Never throws. A battle whose result cannot be read
   * (unfinished, closed after a failure) or committed ends aborted with the persistent state untouched; once the state
   * is committed a failing host projection is reported on the outcome and does not undo or repeat the commit.
   */
  finishBattle(handle: S, request: Pick<BattleStartRequest, "battleId"> | null): BattleOutcome & { result?: BattleResult } { this.assertNoFriendshipWrite();
    if ((typeof handle !== "object" || handle === null) && typeof handle !== "function") return this.abortBattle(request, new Error("invalid battle handle"));
    const born = typeof handle === "object" && handle !== null ? this.bornIn.get(handle) : undefined;
    if (born !== undefined && born !== this.generation) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "the game state was replaced while this battle was open (a save was loaded or a new game started); its result is not committed" };
    if (this.finishing.has(handle)) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "battle-finish-active" };
    if (this.op && this.op.session !== handle) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "stale battle session" };
    const ownedOp = this.op?.session === handle ? this.op : null, facts = ownedOp?.facts;
    const remembered = this.battleContexts.get(handle);
    if (this.battleCommitOwner && remembered !== this.battleCommitOwner) return { code: 0, battleId: request?.battleId ?? null, commit: "none", error: "battle-commit-active" };
    if (this.dexBattleCompletion) {
      const pending = this.pokedex.view;
      if (remembered?.token === this.dexBattleCompletion.parentToken && pending) return { ...clone(this.dexBattleCompletion.outcome), pending: true, continuationToken: pending.token, continuationRevision: pending.revision };
      return { code: 0, battleId: request?.battleId ?? null, commit: "none", error: "pokedex-operation-active" };
    }
    if (this.evolutions.active && this.evolutionCompletion) {
      if (remembered?.token === this.evolutionCompletion.token) return this.evolutionOutcome(this.evolutionCompletion.outcome, { status: "pending", view: this.evolutions.view!, diagnostics: [] });
      return { code: 0, battleId: request?.battleId ?? null, commit: "none", error: "evolution-operation-active" };
    }
    const context = remembered ?? this.newReceptionContext();
    if (!claimSettlementHandle(handle, this, context)) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "battle-handle-owned-by-another-operation" };
    if (this.terminatedBattles.has(context)) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "battle-commit-terminated" };
    let result: BattleResult | undefined;
    this.finishing.add(handle);
    try {
      const received = handle.result();
      assertBattleResultShape(received); // Before outcome, copying, hash or any source callback.
      const hash = resultHash(received);
      this.assertBattleContext(context);
      this.battleContexts.set(handle, context); this.bornIn.set(handle, context.generation);
      result = clone(received);
      const code = outcomeCode(result), kind = result.outcome.kind, battleId = request?.battleId ?? result.battleId;
      if (context.rawHash && context.rawHash !== hash) throw new Error("battle result changed while receiving decisions were pending");
      context.rawHash = hash;
      const committed = this.commit(result, facts, context, handle);
      this.assertBattleContext(context);
      if (this.op === ownedOp) this.op = null;
      const outcome: BattleOutcome & { result?: BattleResult } = { code, battleId, commit: committed.status, kind,
        ...(committed.diagnostics?.length ? { diagnostics: [...committed.diagnostics] } : {}),
        ...(committed.defeat ? { defeat: committed.defeat } : {}), ...(committed.trainerReward ? { trainerReward: committed.trainerReward } : {}) };
      // Legacy diagnostics are optional and supply no authority to the V2 consumer or public options.
      if (committed.status === "applied" && this.ports.sessions.evidence) {
        try {
          const evidence = this.ports.sessions.evidence(handle, { battleId: result.battleId, generation: this.generation, rawHash: hash });
          const currentContent = this.ports.content().content;
          const identity = validatedContentIdentity(currentContent) ?? currentContent.meta?.inputsHash ?? currentContent.meta?.id ?? "anonymous-content";
          if (evidence && evidence.rawHash === hash && evidence.context.battleId === result.battleId && evidence.context.generation === this.generation && evidence.context.contentIdentity === identity) {
            this.completedEvidence.set(handle, clone(evidence));
            if (evidence.issues.length) outcome.diagnostics = [...(outcome.diagnostics ?? []), "部分战斗伴随事实不可用"];
          } else outcome.diagnostics = [...(outcome.diagnostics ?? []), "战斗伴随事实不可用"];
        } catch { outcome.diagnostics = [...(outcome.diagnostics ?? []), "战斗伴随事实读取失败"]; }
      }
      this.assertBattleContext(context);
      if (committed.status === "applied") {
        if (this.pokedex.activate(context.token)) {
          this.dexBattleCompletion = { parentToken: context.token, generation: this.generation, outcome: clone({ ...outcome, result }) };
          const pending = this.pokedex.view!;
          return { ...outcome, result, pending: true, continuationToken: pending.token, continuationRevision: pending.revision };
        }
        const continuation = this.evolutions.activate(context.token);
        const continued = this.evolutionOutcome({ ...outcome, result }, continuation);
        if (continuation.status === "pending") {
          this.evolutionCompletion = { token: context.token, generation: this.generation, outcome: clone({ ...outcome, result }) };
          return continued;
        }
        if (continuation.status !== "refused" && continuation.diagnostics.length) outcome.diagnostics = continued.diagnostics;
      }
      this.project(outcome); outcome.result = result;
      return outcome;
    } catch (error) {
      // A callback may have loaded another game and even opened a same-id battle. The old completion must not
      // enqueue a receiving operation, project into that game, or abort its new operation by matching the id.
      if (context.generation !== this.generation || this.terminatedBattles.has(context)) return { code: 0, battleId: request?.battleId ?? result?.battleId ?? null, commit: "none", aborted: true, error: message(error) };
      if (result && (error instanceof StateInstallFailed || error instanceof ReceivingRefused && error.reason === "pending")) {
        this.reception = { context, members: clone(this.preparedBattles.get(context)?.captureMembers ?? []), resume: () => this.finishBattle(handle, request) };
        return { code: outcomeCode(result), battleId: result.battleId, commit: "none", pending: true, receivingToken: context.token,
          pendingMember: error instanceof ReceivingRefused ? error.memberId : undefined,
          ...(error instanceof StateInstallFailed ? { error: `commit-failed: ${message(error)}` } : {}) };
      }
      if (this.reception?.context === context) this.reception = null;
      if (!this.preparedBattles.get(context)?.indeterminate) this.terminatedBattles.add(context);
      this.evolutions.cancelPrepared(context.token);
      this.pokedex.discardReserved(context.token);
      if (this.op === ownedOp) this.op = null;
      return this.abortBattle(request, error);
    } finally {
      this.finishing.delete(handle);
      if (this.battleCommitOwner === context && this.reception?.context !== context && !this.preparedBattles.get(context)?.indeterminate) this.battleCommitOwner = null;
      if (this.#currentSettlementAdmission === this.#settlementAdmissions.get(context) && this.reception?.context !== context && !this.preparedBattles.get(context)?.indeterminate) this.#currentSettlementAdmission = null;
    }
  }

  /**
   * End without a result (a failure, a cancelled scene). Nothing is committed. Never throws. Ends the open operation when
   * it is this battle (same battleId), also while its session is still being created.
   */
  abortBattle(request: Pick<BattleStartRequest, "battleId"> | null, error: unknown): BattleOutcome { this.assertNoFriendshipWrite();
    const operation = this.op;
    const context = operation?.session ? this.battleContexts.get(operation.session) : !operation ? this.battleCommitOwner : undefined;
    const admission = context ? this.#settlementAdmissions.get(context) : this.#currentSettlementAdmission;
    const matches = request && (operation ? operation.battleId === request.battleId
      : admission?.source?.mode === "legacy-no-held" && admission.battleId === request.battleId);
    if (matches) {
      // The unowned legacy producer also reserves an operation identity. Retire exactly that reservation;
      // incomplete/unknown installation keeps its barrier, and no callback may clear a successor owner.
      if (!context || !this.preparedBattles.get(context)?.indeterminate) {
        const installed = context && this.preparedBattles.get(context)?.completed;
        if (admission && !installed) admission.invalid = true;
        if (this.#currentSettlementAdmission === admission) this.#currentSettlementAdmission = null;
        if (context) {
          this.evolutions.cancelPrepared(context.token);
          this.pokedex.discardReserved(context.token);
          if (!installed) this.terminatedBattles.add(context);
          if (this.reception?.context === context) this.reception = null;
          if (this.battleCommitOwner === context) this.battleCommitOwner = null;
        }
      }
      if (this.op === operation) this.op = null;
    }
    if(matches&&operation?.session)try{this.retireSession?.(operation.session);}catch{/* the old operation is already retired */}
    const outcome: BattleOutcome = { code: 0, battleId: request ? request.battleId : null, commit: "none", aborted: true, error: message(error) };
    this.project(outcome);
    return outcome;
  }

  private project(outcome: BattleOutcome): void {
    try { this.ports.projection.project(outcome); outcome.projection = "ok"; }
    catch (error) { outcome.projection = "failed"; outcome.projectionError = message(error); }
  }
}
