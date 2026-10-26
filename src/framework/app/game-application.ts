import { planAcquisitionDex } from "../rules/acquisition-dex.ts";
import type { AcquisitionEntryIntent } from "../rules/acquisition-dex.ts";
import { semanticFingerprint } from "../rules/semantic.ts";
import { TradeOperation, tradeEligibility } from "./trade-operation.ts";
import type { TradeIntent, TradeDecision, TradeOutcome } from "./trade-operation.ts";
import type {ItemWorldContext} from '../rules/item-effects.ts';
import type { BattleEvidence } from "../rules/battle-evidence.ts";
import { moneyCap, changeMoney } from "../rules/economy.ts";
import { InventorySession } from "./inventory-session.ts";
import { EvolutionOperation } from "./evolution-operation.ts";
import { LearningOperation } from "./learning-operation.ts";
import { TriggeredEvolutionOperation } from "./triggered-evolution.ts";
import type { EvolutionItemIntent, EventEvolutionIntent, TriggeredDecision, TriggeredEvolutionOutcome } from "./triggered-evolution.ts";
import type { LearningIntent, LearningDecision, LearningParent } from "./learning-operation.ts";
import type { EvolutionDecision, EvolutionResolution, EvolutionView } from "./evolution-operation.ts";
import type { EvolutionFacts } from "../rules/evolution.ts";
import type { InventoryRequest, InventoryParent, InventoryOutcome } from "./inventory-session.ts";
import { badgeCount, hasBadge } from "../rules/economy.ts";
import { assertInventoryMapped, addItems, aggregateBag, inventoryPolicy } from "../rules/inventory.ts";
import { catalogOf } from "../rules/item-catalog.ts";
import { computedNature } from "../rules/member-metadata.ts";
/**
 * The game application: the use cases that coordinate a battle with the persistent game, and nothing else.
 *  - game rules stay in the core (`rules/`): the application calls `applyBattleResult`, it does not re-implement it;
 *  - the Showdown engine and the MZ scene/windows stay behind their own adapters: the application only sees ports.
 * Outcomes are explicit so a caller can tell the four situations apart:
 *   not committed (aborted) | committed | already committed (duplicate) | committed but the host was not informed.
 */
import { planBattlePrimary, capturedTemplates, clone, newGame, resultHash } from "../rules/state.ts";
import { assertBattleResultShape } from "../rules/battle-result-validation.ts";
import { resolveBattleEffects } from "../rules/battle-consumption.ts";
import type { EffectsBindingV2, EffectsContextV2, ResolvedBattleEffects } from "../rules/battle-consumption.ts";
import { composeBattleEffects } from "../rules/battle-effects-writeback.ts";
import type { ApplyStatus, BattleCommitOptions, BattleResult, GameState } from "../rules/state.ts";
import { allMembers, boxedMembers, locateMember } from "../rules/storage.ts";
import { DEFAULT_LIMITS, storageFull } from "../rules/limits.ts";
import type { Limits } from "../rules/limits.ts";
import { GrantRefusedError, applyGrant } from "../rules/grants.ts";
import { managementSnapshot, individualView, searchStorage } from "./management-query.ts";
import type { IndividualView, ManagementSnapshot, StorageMatch, StorageSearch } from "./management-query.ts";
import { ManagementSession } from "./management.ts";
import type { ManagementOutcome, ManagementRequest } from "./management.ts";
import { developmentCapabilities, resolveConfig } from "../rules/config.ts";
import type { DevelopmentCapabilities } from "../rules/config.ts";
import type { ItemDescriptor, MemberReference } from "../rules/storage-operations.ts";
import { healParty, recoverAll } from "../rules/heal.ts";
import { computeStats } from "../rules/growth.ts";
import { createMember, personalId } from "../rules/member-factory.ts";
import { appliesAt, pickEncounter, validateEncounterTable } from "../rules/encounter.ts";
import { isDefeat, settleDefeat } from "../rules/defeat.ts";
import { battleView, speciesDataOf, speciesKeyResolver, toBattleMember, toPersistentMember } from "../rules/species-key.ts";
import { addSteps, bumpStat } from "../rules/stats.ts";
import type { GameStats, StatCounter } from "../rules/stats.ts";
import type { Member } from "../rules/types.ts";
import { advanceMemberOrdinal, allocateMemberId, ownerLanguage } from "../rules/member-identity.ts";
import { assertCapturedHeldSources, hasForcedPartyPlan, fallbackDecisions, receiveMembers, ReceivingRefused, requireTemplate } from "../rules/receiving.ts";
import type { ReceivingDecision, ReceivingProfile, ReceivedPlacement } from "../rules/receiving.ts";
import { validateGameContent } from "../rules/save-schema.ts";
import { own, setOwn } from "../rules/own.ts";
import { findDanglingReferences, resolveSpecies, validatedContentIdentity } from "../flow/content-runtime.ts";
import type { BattleHandle, BattleOutcome, BattleSessionFactory, BattleSetup, BattleStartRequest, ClaimOutcome, ClockPort, ContentPort, CreationContext, EncounterPlan, GameStatePort, GiftOutcome, GiftRequest, HealOutcome, OutcomeProjection, PartyView, RandomPort, StepsOutcome } from "./ports.ts";

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

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
interface BattleFacts { kind: "wild" | "trainer"; canLose: boolean; experimentalHeld?: boolean }

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

class StateInstallFailed extends Error {
  readonly indeterminate: boolean;
  constructor(error: unknown, indeterminate = false) { super(message(error)); this.indeterminate = indeterminate; }
}
/** Private operation values: public BattleCommitOptions never carry effects authority. */
interface OwnedBattleEffects {
  battleId: string; generation: number; context: EffectsContextV2; contentIdentity: string | null;
}
interface PreparedBattle {
  rawHash: string; generation: number; before: GameState; effects: ResolvedBattleEffects; captureMembers: Member[];
  sourceIdentity: string | null; sourceInvalidated: boolean; expectedContext: EffectsContextV2;
  next?: GameState; nextIdentity?: string | null; defeat?: { moneyLost: number; healed: true }; attempted: boolean; indeterminate: boolean; completed: boolean;
  diagnostics: string[];
}
function stateIdentity(value: GameState): string {
  return JSON.stringify(value, (_key, data: unknown) => data && typeof data === "object" && !Array.isArray(data)
    ? Object.fromEntries(Object.keys(data).sort().map(key => [key, (data as Record<string, unknown>)[key]])) : data);
}
interface ReceptionContext extends BattleCommitOptions { token: string; generation: number; rawHash?: string; recovered?: boolean }
interface PreparedAcquisition {
  fingerprint: string; before?: GameState; next?: GameState; decisions?: string;
  attempted: boolean; complete: boolean; retired?: string; entries: AcquisitionEntryIntent[];
}
interface ReceptionPending {
  context: ReceptionContext;
  grantId?: string;
  members: Member[];
  resume: () => BattleOutcome | ClaimOutcome | GiftOutcome | { status: string };
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
  private acquisition: { generation: number } | null = null;
  private evolutionCompletion: { token: string; generation: number; outcome: BattleOutcome & { result?: BattleResult } } | null = null;
  private generation = 0;
  private readonly bornIn = new WeakMap<object, number>();
  private readonly completedEvidence = new WeakMap<object, BattleEvidence>();
  private readonly ownedBattleEffects = new WeakMap<object, OwnedBattleEffects>();
  private readonly preparedAcquisitions = new WeakMap<ReceptionContext, PreparedAcquisition>();
  private readonly preparedBattles = new WeakMap<ReceptionContext, PreparedBattle>();
  private battleCommitOwner: ReceptionContext | null = null;
  private readonly finishing = new WeakSet<object>();
  private readonly terminatedBattles = new WeakSet<ReceptionContext>();
  private get battleBusy(): boolean { return !!this.op || !!this.battleCommitOwner || !!this.evolutions?.active || !!this.learning?.active || !!this.triggered?.active || !!this.trade?.active || !!this.acquisition; }
  private assertBattleContext(context: ReceptionContext, requireOwner = false): void {
    if (context.generation !== this.generation || this.terminatedBattles.has(context)
      || requireOwner && this.battleCommitOwner !== context) throw new Error("stale battle commit generation or owner");
  }
  private invalidatePreparedSource(prepared: PreparedBattle, battleId: string): void {
    this.evolutions.discardPrepared();
    prepared.sourceInvalidated = true;
    prepared.effects = resolveBattleEffects({ seal: null, expectedBinding: {
      battleId, generation: prepared.generation, rawHash: prepared.rawHash,
      contentIdentity: prepared.sourceIdentity ?? "0".repeat(64),
    }, expectedContext: prepared.expectedContext, membersBefore: prepared.before.party });
    delete prepared.next; delete prepared.nextIdentity; delete prepared.defeat;
    prepared.diagnostics = [];
  }

  /** Read-only transient companion view. It supplies no commit authority and is never a persistent save record. */
  battleEvidenceSnapshot(handle: S): BattleEvidence | null {
    const value = this.completedEvidence.get(handle);
    return value?.context.generation === this.generation ? clone(value) : null;
  }

  constructor(ports: GameApplicationPorts<S>, options: GameApplicationOptions = {}) {
    this.battleStatePort = ports.state;
    this.ports = {...ports,state:{read:()=>ports.state.read(),replace:next=>{const problems=validateGameContent(next,ports.content().content);if(problems.length)throw new Error(`invalid next state: ${problems[0]!.path} ${problems[0]!.message}`);ports.state.replace(next);this.inventory?.stateChanged(next);}}};
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
      return dex?.heldItem?.(id) ?? null;
    });
    this.management = new ManagementSession(this.ports.state, () => this.ports.content().content, { limits: this.limits, depositHeal: this.depositHeal, sourceAllowed: this.capabilities.allowHeldItemSources, describeItem: this.describeHeldItem });
    this.inventory = new InventorySession(this.ports.state,()=>this.ports.content().content,{world:ports.itemWorld,variables:ports.variables,limits:this.limits,generation:()=>this.generation,install:next=>this.install(next),
      enter:parent=>{if(this.battleBusy||this.reception)throw new Error('operation-active');if(parent)this.management.reserveChild(parent.token);else if(this.management.active)throw new Error('management-active');},
      leave:parent=>{if(parent)this.management.releaseChild(parent.token);}});
    this.evolutions = new EvolutionOperation({ state: { read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, content: this.ports.content, generation: () => this.generation, limits: this.limits,
      facts: (member, content) => this.evolutionFacts(member, content) });
    this.learning = new LearningOperation({ read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, this.ports.content, { generation: () => this.generation, world: () => clone(ports.itemWorld?.() ?? {}),
      enter: (parent, intent) => {
        if (this.op || this.battleCommitOwner || this.evolutions.active || this.triggered?.active || this.trade?.active || this.acquisition || this.reception) throw new Error("operation-active");
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
        if (this.op || this.battleCommitOwner || this.evolutions.active || this.learning.active || this.trade?.active || this.acquisition || this.reception) throw new Error("operation-active");
        if (parent) this.inventory.reserveEvolution(parent, memberId!);
        else if (this.inventory.active || this.management.active) throw new Error("management-operation-active");
      }, leave: parent => { if (parent) this.inventory.releaseLearning(parent); } });
    this.trade = new TradeOperation({ state: { read: () => this.battleStatePort.read(), replace: next => {
      this.battleStatePort.replace(next); this.inventory.stateChanged(next);
    } }, content: this.ports.content, generation: () => this.generation, limits: this.limits,
      enter: () => { if (this.op || this.battleCommitOwner || this.evolutions.active || this.learning.active || this.triggered.active || this.acquisition || this.reception || this.inventory.active || this.management.active) throw Error("operation-active"); },
      world: () => clone(ports.itemWorld?.() ?? {}), facts: (member, content) => this.evolutionFacts(member, content),
      random: this.ports.random, now: () => this.now(), creationContext: this.ports.creationContext,
      allowHeldSources: this.capabilities.allowHeldItemSources, holdable: id => { const item = this.describeHeldItem(id); return !!item?.holdable && !item.mail; } });
  }

  private evolutionFacts(member: Readonly<Member>, content: ReturnType<ContentPort>["content"]): EvolutionFacts {
    let world: EvolutionFacts = {};
    try { world = this.ports.evolutionWorld?.(member) ?? {}; }
    catch { const invalid = { status: "invalid" as const, reason: "world-provider-failed" };
      world = { hour: invalid, mapId: invalid, mapMetadata: invalid, weather: invalid, cycling: invalid, surfing: invalid, diving: invalid, beauty: invalid, moveTypes: invalid }; }
    return world;
  }
  get pendingEvolution(): EvolutionView | null { return this.trade?.continuation ?? this.evolutions.view; }
  get pendingLearning() { return this.learning.view; }
  beginLearning(intent: LearningIntent, parent?: LearningParent) { return this.learning.begin(intent, parent); }
  resolveLearning(token: string, revision: number, decision: LearningDecision) { return this.learning.resolve(token, revision, decision); }
  get pendingTrade() { return this.trade.view; }
  beginTrade(requestId: string, intent: TradeIntent) { return this.trade.begin(requestId, intent); }
  resolveTrade(token: string, revision: number, decision: TradeDecision) { return this.trade.resolve(token, revision, decision); }
  tradeCandidates(requiredSpecies?: string) {
    const game = this.ports.state.read(), world = clone(this.ports.itemWorld?.() ?? {});
    return game.party.map(member => ({ memberId: member.id, name: member.nickname || member.species,
      eligible: tradeEligibility(member, world, requiredSpecies) === null, reason: tradeEligibility(member, world, requiredSpecies) }));
  }
  get pendingTriggeredEvolution() { return this.triggered.view; }
  beginEvolutionItem(parent: string, requestId: string, intent: EvolutionItemIntent) { return this.triggered.beginItem(parent, requestId, intent); }
  beginEventEvolution(intent: EventEvolutionIntent = {}) { return this.triggered.beginEvent(intent); }
  resolveTriggeredEvolution(token: string, revision: number, decision: TriggeredDecision) { return this.triggered.resolve(token, revision, decision); }
  private evolutionOutcome(outcome: BattleOutcome & { result?: BattleResult }, resolved: EvolutionResolution): BattleOutcome & { result?: BattleResult } {
    if (resolved.status === "refused") return { ...outcome, error: resolved.reason };
    const next = { ...clone(outcome), ...(resolved.diagnostics.length ? { diagnostics: [...new Set([...(outcome.diagnostics ?? []), ...resolved.diagnostics])] } : {}) };
    if (resolved.status === "pending") return { ...next, pending: true, continuationToken: resolved.view.token, continuationRevision: resolved.view.revision };
    delete next.pending; delete next.continuationToken; delete next.continuationRevision;
    if (resolved.status === "technically-terminated") next.diagnostics = [...(next.diagnostics ?? []), "战后进化后续已技术终止，已提交战果保留"];
    return next;
  }
  resolveEvolution(token: string, revision: number, decision: EvolutionDecision): (BattleOutcome & { result?: BattleResult }) | TriggeredEvolutionOutcome | TradeOutcome | { status: "refused"; reason: string } {
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

  beginInventoryOperation(kind:'bag'|'item'|'shop'='bag',parent?:InventoryParent):string { return this.inventory.begin(kind,parent); }
  endInventoryOperation(token:string):InventoryOutcome { return this.inventory.end(token); }
  inventorySnapshot(token:string,filter?:Parameters<InventorySession['snapshot']>[1]) { return this.inventory.snapshot(token,filter); }
  queryInventoryItemQuantity(token:string,itemId:string):number { return this.inventory.quantity(token,itemId); }
  inventoryTicket(token:string,pocket:number,index:number) { return this.inventory.ticket(token,pocket,index); }
  inventoryRequest(token:string,requestId:string,request:InventoryRequest,present?:(outcome:InventoryOutcome)=>void):InventoryOutcome { return this.inventory.execute(token,requestId,request,present); }
  beginInventorySort(token:string,pocket:number,index:number,filtered=false):InventoryOutcome { return this.inventory.beginSort(token,pocket,index,filtered); }
  moveInventorySort(token:string,to:number):InventoryOutcome { return this.inventory.moveSort(token,to); }
  endInventorySort(token:string,cancel=false):InventoryOutcome { return this.inventory.endSort(token,cancel); }
  queryItemUse(token:string,itemId:string,quantity=1,memberId?:string) { return this.inventory.queryUse(token,itemId,quantity,memberId); }
  beginMoneyShop(input:Parameters<InventorySession['configureShop']>[1]):string {const token=this.inventory.begin('shop');try{this.inventory.configureShop(token,input);return token;}catch(error){this.inventory.end(token);throw error;}}
  shopView(token:string){return this.inventory.shopView(token);}
  shopQuote(token:string,itemId:string,selling=false){return this.inventory.quote(token,itemId,selling);}
  setShopPrices(token:string,itemId:string,buy:number,sell?:number):void{this.inventory.setPrices(token,itemId,buy,sell);}
  clearShopPrices(token:string):void{this.inventory.clearPrices(token);}
  beginItemSelection(...args:Parameters<InventorySession['beginSelection']>){return this.inventory.beginSelection(...args);}
  itemSelectionView(...args:Parameters<InventorySession['selectionView']>){return this.inventory.selectionView(...args);}
  browseItemSelection(...args:Parameters<InventorySession['selectionBrowse']>){return this.inventory.selectionBrowse(...args);}
  finishItemSelection(...args:Parameters<InventorySession['finishSelection']>){return this.inventory.finishSelection(...args);}
  tossItems(...args:Parameters<InventorySession['toss']>){return this.inventory.toss(...args);}
  queryBadges(index?:number):{count:number;owned?:boolean}{const game=this.ports.state.read();return {count:badgeCount(game.badges),...(index===undefined?{}:{owned:hasBadge(game.badges,index)})};}
  hasBoxLink():boolean {return this.inventory.hasBoxLink();}
  heldItemSourcesEnabled():boolean {return this.capabilities.allowHeldItemSources;}

  /** A new game: the formal empty state (no members; the player receives them through grants). Throws only if the store refuses. */
  startNewGame(): { status: "started"; state: GameState } {
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
  claimGrant(grantId: string, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): ClaimOutcome {
    const refused = (reason: string, error: unknown): ClaimOutcome => ({ status: "refused", grantId, reason, error: message(error) });
    if (this.reception?.grantId === grantId) return { status: "pending", grantId, token: this.reception.context.token };
    if (this.battleBusy || this.management.active || this.reception || this.inventory.active) return refused(this.battleBusy ? "battle-active" : "operation-active", "another operation is open");
    const acquisition = { generation: this.generation }; this.acquisition = acquisition;
    try {
    try { options = clone(options); } catch (error) { return refused("invalid", error); }
    let game: GameState;
    try { game = this.ports.state.read(); this.assertAcquisition(acquisition); } catch (error) { return refused("state-unusable", error); }
    try {
      if (own(game.claims, grantId)) return { status: "already-claimed", grantId };
      if (!this.ports.random) return refused("no-random", "no random source");
      const content = clone(this.ports.content().content); this.assertAcquisition(acquisition);
      const sourceGrant = own(content.grants, grantId); if (!sourceGrant) throw new GrantRefusedError("unknown-grant", `grant "${grantId}" is not in the content`);
      for (const member of sourceGrant.members) if (member.item) {
        if (!this.capabilities.allowHeldItemSources) throw new GrantRefusedError("held-item-source-disabled", "held-item-source-disabled");
        const descriptor = this.describeHeldItem(member.item); if (!descriptor?.holdable || descriptor.mail) throw new GrantRefusedError("invalid-held-item", `unsupported held item ${member.item}`);
      }
      const prepared = applyGrant(game, grantId, content, this.ports.random, this.limits, { ...(sourceGrant.members.length ? { ...this.ports.creationContext?.(), receivedAt: Math.floor(this.now() / 1000) } : {}), allowHeldItemSources: this.capabilities.allowHeldItemSources });
      this.assertAcquisition(acquisition);
      if (prepared.status !== "applied") return { status: "already-claimed", grantId };
      const oldIds = new Set(allMembers(game).map((m) => m.id));
      const members = allMembers(prepared.state).filter((m) => !oldIds.has(m.id));
      const grant = own(content.grants, grantId)!;
      const context = this.newReceptionContext({ profile: options.profile ?? this.profile, decisions: options.decisions ?? {}, nextMemberOrdinal: prepared.state.nextMemberOrdinal });
      this.preparedAcquisitions.set(context, { fingerprint: semanticFingerprint(content), attempted: false, complete: false, entries: [] });
      let completed: ClaimOutcome | undefined;
      const finish = (next: GameState): ClaimOutcome => { this.noteReception(context, members, next); this.reception = null; return clone(completed!); };
      const resume = (): ClaimOutcome => {
        try {
          const staged = this.preparedAcquisitions.get(context)!;
          if (staged.next) return finish(this.installAcquisition(context));
          this.acquisitionContent(context);
          const current = clone(this.battleStatePort.read());
          if (context.generation !== this.generation) throw Error("stale-acquisition");
          if (own(current.claims, grantId)) { this.reception = null; return { status: "already-claimed", grantId }; }
          const plan = receiveMembers(current, members, context.decisions ?? {}, { limits: this.limits, content, profile: context.profile!, depositHeal: this.depositHeal });
          const next = plan.state;
          for (const [item, count] of Object.entries(grant.items)) next.inventory = addItems(next.inventory, item, count, catalogOf(content), inventoryPolicy(content, this.limits));
          if (!Number.isSafeInteger(next.money + grant.money)) throw new Error("money-overflow");
          next.money = changeMoney(next.money,grant.money,moneyCap(content,this.limits.money));
          const registration = planAcquisitionDex(next.dex, members.map(m => locateMember(next, m.id)!.member), content, { source: "grant", seeForm: true, showMessages: true });
          if (registration.status !== "ready") throw new ReceivingRefused(registration.reason);
          next.dex = registration.dex;
          setOwn(next.claims, grantId, { kind: "grant" }); next.nextMemberOrdinal = context.nextMemberOrdinal!;
          completed = { status: "applied", grantId, placed: plan.placed.map(p => { const m = locateMember(next, p.id)!.member; return { id: m.id, species: m.species, form: m.form ?? 0, level: m.level, to: p.to }; }), items: { ...grant.items }, money: next.money - current.money };
          this.prepareAcquisition(context, current, next, registration.entries);
          return finish(this.installAcquisition(context));
        } catch (error) {
          if (context.generation !== this.generation) return refused("stale-operation", error);
          if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) { this.reception = { context, members, resume, grantId }; return { status: "pending", grantId, token: context.token, pendingMember: error instanceof ReceivingRefused ? error.memberId : undefined, ...(error instanceof StateInstallFailed ? { reason: "commit-failed", error: message(error) } : {}) }; }
          return refused(error instanceof ReceivingRefused ? error.reason : "commit-failed", error);
        }
      };
      return resume();
    } catch (error) { return refused(error instanceof GrantRefusedError ? error.reason : "invalid", error); }
    } finally { if (this.acquisition === acquisition) this.acquisition = null; }
  }

  receiveGift(request: GiftRequest, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): GiftOutcome {
    if (this.battleBusy || this.management.active || this.reception || this.inventory.active) return { status: "refused", reason: "operation-active" };
    const acquisition = { generation: this.generation }; this.acquisition = acquisition;
    try {
    try {
      request = clone(request); options = clone(options);
      if (!["normal", "silent", "party", "party-silent", "foreign"].includes(request.kind)) throw new ReceivingRefused("invalid-gift-mode");
      if (request.seeForm !== undefined && typeof request.seeForm !== "boolean") throw new ReceivingRefused("invalid-see-form");
      const input = request.member;
      if (!input || Object.keys(input).some((k) => !("existing" in input ? ["existing"] : ["species", "level", "form", "item"]).includes(k))) throw new ReceivingRefused("invalid-member");
      if ("existing" in input && (input.existing.isEgg || input.existing.mail)) throw new ReceivingRefused(input.existing.isEgg ? "egg-not-supported" : "mail-not-supported");
      const held = "existing" in input ? input.existing.item : input.item;
      if (held && !this.capabilities.allowHeldItemSources) throw new ReceivingRefused("held-item-source-disabled");
      if (held && (!this.describeHeldItem(held)?.holdable || this.describeHeldItem(held)?.mail)) throw new ReceivingRefused("invalid-held-item");
      const game = this.ports.state.read(), content = clone(this.ports.content().content); this.assertAcquisition(acquisition);
      const partyOnly = ["party", "party-silent", "foreign"].includes(request.kind);
      if (partyOnly && game.party.length >= this.limits.party) throw new ReceivingRefused("party-full");
      let nextOrdinal = game.nextMemberOrdinal;
      let owner = game.player;
      if (request.kind === "foreign") {
        if (!this.ports.random) throw new ReceivingRefused("no-random");
        let id = personalId(this.ports.random); if (id === game.player.id) id = (id + 1) >>> 0;
        owner = { id, name: request.foreignOwner?.name ?? "", gender: request.foreignOwner?.gender ?? 0, language: request.foreignOwner?.language ?? 2 };
      }
      let member: Member;
      if ("existing" in input) { requireTemplate(input.existing, input.existing.id); member = clone(input.existing); if (request.kind === "foreign") { member.owner = clone(owner); member.ownerCompatibilityDefault = false; } }
      else {
        if (!this.ports.random) throw new ReceivingRefused("no-random");
        if (request.kind === "party-silent" && input.level === undefined) throw new ReceivingRefused("level-required");
        const allocated = allocateMemberId(nextOrdinal, new Set(allMembers(game).map((m) => m.id))); nextOrdinal = allocated.nextMemberOrdinal;
        const name = resolveSpecies(content, input.species); if (!name) throw new ReceivingRefused("unknown-species");
        member = toPersistentMember(createMember({ id: allocated.id, species: name, level: input.level ?? 1, ...(input.form !== undefined ? { form: input.form } : {}), owner, context: { ...this.ports.creationContext?.(), receivedAt: Math.floor(this.now() / 1000), playerId: game.player.id } }, content, this.ports.random), content);
        member.item = input.item ?? "";
      }
      this.assertAcquisition(acquisition);
      nextOrdinal = advanceMemberOrdinal(game.nextMemberOrdinal, [member.id], nextOrdinal);
      if (request.kind === "foreign" && request.nickname) member.nickname = Array.from(request.nickname).slice(0, 10).join("");
      const silent = ["silent", "party-silent", "foreign"].includes(request.kind);
      const context = this.newReceptionContext({ decisions: options.decisions ?? {}, profile: silent ? { mode: 1, naming: 1 } : options.profile ?? this.profile, nextMemberOrdinal: nextOrdinal });
      this.preparedAcquisitions.set(context, { fingerprint: semanticFingerprint(content), attempted: false, complete: false, entries: [] });
      let completed: GiftOutcome | undefined;
      const finish = (next: GameState): GiftOutcome => { this.noteReception(context, [member], next); this.reception = null; return clone(completed!); };
      const resume = (): GiftOutcome => {
        try {
          const staged = this.preparedAcquisitions.get(context)!;
          if (staged.next) return finish(this.installAcquisition(context));
          this.acquisitionContent(context);
          const current = clone(this.battleStatePort.read());
          if (context.generation !== this.generation) throw Error("stale-acquisition");
          const plan = receiveMembers(current, [member], context.decisions ?? {}, { limits: this.limits, content, profile: context.profile!, partyOnly, depositHeal: this.depositHeal });
          plan.state.nextMemberOrdinal = context.nextMemberOrdinal!;
          const registration = planAcquisitionDex(plan.state.dex, [locateMember(plan.state, member.id)!.member], content,
            { source: request.kind === "party-silent" ? "party-silent" : request.kind === "party" ? "party-gift" : "receive", seeForm: request.seeForm ?? true,
              showMessages: request.kind !== "silent" && request.kind !== "party-silent" });
          if (registration.status !== "ready") throw new ReceivingRefused(registration.reason);
          plan.state.dex = registration.dex;
          completed = { status: "applied", placed: plan.placed };
          this.prepareAcquisition(context, current, plan.state, registration.entries);
          return finish(this.installAcquisition(context));
        } catch (error) {
          if (context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
          if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) { this.reception = { context, members: [member], resume }; return { status: "pending", token: context.token, ...(error instanceof StateInstallFailed ? { reason: "commit-failed", error: message(error) } : {}) }; }
          return { status: "refused", reason: error instanceof ReceivingRefused ? error.reason : "commit-failed", error: message(error) };
        }
      }; return resume();
    } catch (error) { return { status: "refused", reason: error instanceof ReceivingRefused ? error.reason : "invalid", error: message(error) }; }
    } finally { if (this.acquisition === acquisition) this.acquisition = null; }
  }

  private acquisitionContent(context: ReceptionContext): ReturnType<ContentPort>["content"] {
    const staged = this.preparedAcquisitions.get(context); if (!staged || context.generation !== this.generation) throw Error("stale-acquisition");
    if (staged.retired) throw new StateInstallFailed(Error(staged.retired), staged.retired === "acquisition-install-indeterminate");
    let content: ReturnType<ContentPort>["content"];
    try { content = this.ports.content().content; } catch (error) { throw new StateInstallFailed(error); }
    if (context.generation !== this.generation) throw Error("stale-acquisition");
    // This private definition fingerprint only binds this gift plan. It never grants battle auxiliary authority.
    let fingerprint: string;
    try { fingerprint = semanticFingerprint(clone(content)); }
    catch (error) { staged.retired = "invalid-acquisition-content"; throw new StateInstallFailed(error); }
    if (fingerprint !== staged.fingerprint) { staged.retired = "stale-acquisition-content"; throw new StateInstallFailed(Error(staged.retired)); }
    return content;
  }
  private prepareAcquisition(context: ReceptionContext, before: GameState, next: GameState, entries: AcquisitionEntryIntent[]): void {
    const staged = this.preparedAcquisitions.get(context)!;
    const content = this.acquisitionContent(context), errors = validateGameContent(next, content);
    if (errors.length) throw new ReceivingRefused("invalid-acquisition-next", errors[0]!.path + ": " + errors[0]!.message);
    staged.before = clone(before); staged.next = clone(next); staged.entries = clone(entries);
    staged.decisions = semanticFingerprint(context.decisions ?? {});
  }
  private installAcquisition(context: ReceptionContext): GameState {
    const staged = this.preparedAcquisitions.get(context); if (!staged?.next || !staged.before || context.generation !== this.generation) throw Error("stale-acquisition");
    let current: GameState;
    try { current = clone(this.battleStatePort.read()); } catch (error) { throw new StateInstallFailed(error, staged.attempted); }
    if (context.generation !== this.generation) throw Error("stale-acquisition");
    if (stateIdentity(current) === stateIdentity(staged.next)) { staged.complete = true; this.inventory.stateChanged(staged.next); return clone(staged.next); }
    if (stateIdentity(current) !== stateIdentity(staged.before)) { staged.retired = "acquisition-install-indeterminate"; throw new StateInstallFailed(Error(staged.retired), true); }
    const content = this.acquisitionContent(context), errors = validateGameContent(staged.next, content);
    if (errors.length) throw new StateInstallFailed(Error("invalid-acquisition-next:" + errors[0]!.path));
    // State readers may invoke host code; recheck both definition and base before the actual write.
    this.acquisitionContent(context); current = clone(this.battleStatePort.read());
    if (context.generation !== this.generation) throw Error("stale-acquisition");
    if (stateIdentity(current) !== stateIdentity(staged.before)) { staged.retired = "acquisition-install-indeterminate"; throw new StateInstallFailed(Error(staged.retired), true); }
    this.acquisitionContent(context);
    if (context.generation !== this.generation) throw Error("stale-acquisition");
    staged.attempted = true; let failure: unknown;
    try { this.battleStatePort.replace(clone(staged.next)); } catch (error) { failure = error; }
    if (context.generation !== this.generation) throw Error("stale-acquisition");
    try { current = clone(this.battleStatePort.read()); } catch (error) { throw new StateInstallFailed(error, true); }
    if (context.generation !== this.generation) throw Error("stale-acquisition");
    if (stateIdentity(current) === stateIdentity(staged.next)) { staged.complete = true; this.inventory.stateChanged(staged.next); return clone(staged.next); }
    if (stateIdentity(current) !== stateIdentity(staged.before)) staged.retired = "acquisition-install-indeterminate";
    throw new StateInstallFailed(failure ?? Error("acquisition-not-installed"), !!staged.retired);
  }
  /** Discard only a proved uninstalled acquisition. An installed result is acknowledged, never rolled back. */
  terminateAcquisition(token: string): { status: "aborted" | "already-installed" | "refused" | "reload-required"; reason?: string } {
    const pending = this.reception;
    if (!pending || pending.context.token !== token || pending.context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    const staged = this.preparedAcquisitions.get(pending.context); if (!staged) return { status: "refused", reason: "not-an-acquisition" };
    if (staged.attempted && staged.next && staged.before) {
      let current: GameState; try { current = clone(this.battleStatePort.read()); } catch { return { status: "reload-required", reason: "acquisition-install-indeterminate" }; }
      if (pending.context.generation !== this.generation || this.reception !== pending) return { status: "refused", reason: "stale-operation" };
      if (stateIdentity(current) === stateIdentity(staged.next)) { const outcome = this.resolveReceiving(token); return "status" in outcome && outcome.status === "applied"
        ? { status: "already-installed" } : { status: "refused", reason: "resume-installed-acquisition" }; }
      if (stateIdentity(current) !== stateIdentity(staged.before)) return { status: "reload-required", reason: "acquisition-install-indeterminate" };
    }
    if (this.reception === pending) this.reception = null;
    return { status: "aborted" };
  }
  private assertAcquisition(owner: { generation: number }): void {
    if (this.acquisition !== owner || owner.generation !== this.generation) throw Error("stale-acquisition");
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
  resolveReceiving(token: string, decisions: Record<string, ReceivingDecision> = {}, signal?: "scene-aborted" | "rebuild-failed"): ReturnType<ReceptionPending["resume"]> {
    const receipt = this.receptionReceipts.get(token); if (receipt) return clone(receipt);
    const pending = this.reception;
    if (!pending || pending.context.token !== token || pending.context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    const acquisition = this.preparedAcquisitions.get(pending.context);
    const merged = { ...pending.context.decisions, ...clone(decisions) };
    if (acquisition?.next && semanticFingerprint(merged) !== acquisition.decisions) return { status: "refused", reason: "acquisition-decision-conflict" };
    pending.context.decisions = merged;
    if (signal !== undefined) {
      if (!["scene-aborted", "rebuild-failed"].includes(signal)) return { status: "refused", reason: "invalid-recovery-signal" };
      try { if (!acquisition?.next) pending.context.decisions = fallbackDecisions(this.ports.state.read(), pending.members, { limits: this.limits, content: this.ports.content().content, profile: pending.context.profile ?? this.profile, depositHeal: this.depositHeal }, pending.context.decisions); pending.context.recovered = true; }
      catch (error) { return { status: "pending", reason: message(error) }; }
    }
    const outcome = pending.resume();
    if (pending.context.generation !== this.generation) return { status: "refused", reason: "stale-operation" };
    if (!("pending" in outcome && outcome.pending) && !("status" in outcome && outcome.status === "pending") && !("status" in outcome && outcome.status === "refused")) {
      this.receptionReceipts.set(token, clone(outcome));
      if (this.receptionReceipts.size > 32) this.receptionReceipts.delete(this.receptionReceipts.keys().next().value!);
    }
    return outcome;
  }

  /** Technical termination of a proved zero-write battle attempt. It never rolls back an installed primary result. */
  terminateBattleCommit(token: string): { status: "aborted" | "refused" | "reload-required"; reason?: string } {
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
    this.evolutions.cancelPrepared(context.token);
    this.battleCommitOwner = null;
    return { status: "aborted" };
  }

  /** What a party/bag screen shows. Throws when the state is unusable (the screen then says so). */
  describeParty(): PartyView {
    const game = this.ports.state.read();
    const { content } = this.ports.content();
    return {
      members: game.party.map((m) => {
        const sp = speciesDataOf(content, m);
        const maxhp = sp ? computeStats(sp.base, m.ivs, m.evs, m.level, computedNature(m)).hp : m.hp;
        return { id: m.id, species: m.species, form: m.form ?? 0, ...(sp?.nameKey ? { nameKey: sp.nameKey } : {}), level: m.level, hp: m.hp, maxhp, status: m.status, moves: m.moves.map((x) => ({ ...x })) };
      }),
      boxes: boxedMembers(game).length, bag: aggregateBag(game.inventory), money: game.money,
    };
  }

  /** Heal the party (HP, status, PP). Safe to repeat: an already healed party writes nothing. Never throws. */
  healParty(): HealOutcome {
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
    const prepared=this.preparedAcquisitions.get(reception.context);
    if(prepared?.next)return managementSnapshot(prepared.next,prepared.next,null,this.generation,this.limits,this.capabilities.allowHeldItemSources);
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
  beginManagement(): string { if (this.battleBusy || this.reception || this.inventory.active) throw new Error("operation-active"); return this.management.begin(); }
  manage(token: string, requestId: string, request: ManagementRequest): ManagementOutcome {
    if (this.battleBusy) return { status: "refused", reason: "battle-active" };
    return this.management.execute(token, requestId, request);
  }
  endManagement(token: string): ManagementOutcome { return this.management.end(token); }
  heldMemberReference(token: string): MemberReference | null { return this.management.heldReference(token); }
  get encounterBlocked(): boolean { return this.battleBusy || !!this.reception || this.management.active || this.inventory.active; }
  get saveBlocked(): boolean { return this.battleBusy || !!this.reception || this.management.saveBlocked || this.inventory.saveBlocked; }
  recoverAll(): HealOutcome {
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
  recordSteps(n = 1): StepsOutcome {
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
  stateReplacedByHost(): void {
    this.generation++;
    this.acquisition = null;
    this.op = null;
    this.battleCommitOwner = null;
    this.evolutions.invalidate(); this.evolutionCompletion = null;
    this.learning.invalidate();
    this.triggered.invalidate();
    this.trade.invalidate();
    this.inventory.invalidate();
    this.management.invalidate();
    this.reception = null;
    this.receptionReceipts.clear();
    this.receptionNotices.clear();
  }

  /**
   * Open a battle. A save written against older content is explained here, with the record and the missing thing,
   * instead of crashing inside a battle. The foes are created here from the content (species + level, member-factory)
   * with ids W<seq>-<n>; a foe that cannot be created, or a party with nobody able to battle, refuses the battle.
   * Balls are disabled when a caught member would have nowhere to go (D1). Throws; nothing has been committed or changed.
   * Only one battle at a time: while another is open (also while its session is still being created) this throws. When
   * the battle is aborted before its session exists, a session that arrives later is not kept or returned (rejects).
   */
  async startBattle(request: BattleStartRequest): Promise<S> {
    if (this.management.active || this.reception || this.inventory.active) throw new Error("operation-active");
    if (this.op) throw new Error(`a battle is already open (${this.op.battleId})`);
    if (this.battleCommitOwner) throw new Error("battle-commit-active");
    if (this.evolutions.active) throw new Error("evolution-operation-active");
    const game = this.ports.state.read();
    if (!this.capabilities.allowExperimentalHeldItemBattle && game.party.some((m) => !!m.item)) throw new Error("held-item-battle-disabled: battle item write-back is incomplete");
    const { content, dex } = this.ports.content();
    const dangling = findDanglingReferences(game, content, dex);
    if (dangling.length) throw new Error("the save refers to content that no longer exists: " + dangling.slice(0, 3).map((d) => `${d.path} ${d.message}`).join("; "));
    if (!game.party.some((m) => !m.isEgg && m.hp > 0)) throw new Error("no party member can battle");
    const random = this.ports.random;
    if (!random) throw new Error("no random source is configured for this application (needed to create the foes)");
    if (!request.foes.length) throw new Error("a battle needs at least one foe");
    const templates: Record<string, Member> = {};
    let ordinal = game.nextMemberOrdinal;
    const taken = new Set(allMembers(game).map((m) => m.id));
    const createdAt = Math.floor(this.now() / 1000);
    const creationContext = this.ports.creationContext?.() ?? {};
    const foes: Member[] = request.foes.map((f, i) => {
      const species = resolveSpecies(content, f.species);
      if (!species) throw new Error(`foe ${i + 1}: species "${f.species}" is not in the content`);
      const allocated = allocateMemberId(ordinal, taken); ordinal = allocated.nextMemberOrdinal; taken.add(allocated.id);
      const m = createMember({ id: allocated.id, species, level: f.level, owner: game.player, context: { ...creationContext, receivedAt: createdAt, playerId: game.player.id } }, content, random);
      if (!m.moves.length) throw new Error(`foe ${i + 1}: ${species} at level ${f.level} knows no move in the content (its learnset has nothing at or below that level)`);
      templates[m.id] = toPersistentMember(m, content);
      return toBattleMember(templates[m.id]!, content);
    });
    const context = this.newReceptionContext({ templates, decisions: {}, profile: request.forceParty ? { ...this.profile, mode: 2 } : this.profile, nextMemberOrdinal: ordinal });
    const full = storageFull(game, this.limits);
    const forcedNoRoom = context.profile?.mode === 2 && !Object.values(templates).every((member) => hasForcedPartyPlan(game, member, { limits: this.limits, content, profile: context.profile!, depositHeal: this.depositHeal }));
    const diagnostics = [...(forcedNoRoom ? ["forced-party-no-target"] : []), ...(game.party.some((m) => !!m.item) ? ["战后持物写回未完成"] : [])];
    const setup: BattleSetup = { foes, noRun: !!request.noRun, noBall: !!request.noBall || full || forcedNoRoom, storageFull: full, ...(diagnostics.length ? { diagnostics } : {}), ...(game.party.some((m) => !!m.item) ? { experimentalHeldBattle: true } : {}) };
    let mapId: number | undefined;
    try { mapId = this.ports.itemWorld?.().mapId ?? creationContext.map; } catch { /* optional companion context unavailable */ }
    setup.evidenceContext = {
      battleId: request.battleId, generation: this.generation, contentIdentity: validatedContentIdentity(content) ?? content.meta?.inputsHash ?? content.meta?.id ?? "anonymous-content",
      playerIds: game.party.map(m => m.id), initialLevels: Object.fromEntries(game.party.map(m => [m.id, m.level])),
      ...(Number.isSafeInteger(mapId) && mapId! >= 0 ? { mapId } : {}),
    };
    const view = battleView(game, content);
    view.party = view.party.filter((m) => !m.isEgg); // the session speaks Showdown names (protocol v1); the save keeps content ids
    const op: { battleId: string; session: S | null; facts: BattleFacts } = { battleId: request.battleId, session: null, facts: { kind: request.kind, canLose: !!request.canLose, experimentalHeld: game.party.some((m) => !!m.item) } };
    this.op = op; // taken before the first await: nothing can write between reading the state and opening the battle
    let session: S;
    try { session = await this.ports.sessions.create(request, view, setup); }
    catch (error) { if (this.op === op) this.op = null; throw error; }
    if (this.op !== op) throw new Error(`battle ${request.battleId} was aborted while its session was being created; the late session is not used`);
    op.session = session;
    if (typeof session === "object" && session !== null) {
      this.bornIn.set(session, this.generation); this.battleContexts.set(session, context);
      this.ownedBattleEffects.set(session, { battleId: request.battleId, generation: this.generation, contentIdentity: validatedContentIdentity(content), context: {
        playerIds: [...setup.evidenceContext.playerIds], L0: clone(setup.evidenceContext.initialLevels),
        engineRosterIds: view.party.filter(m => !m.isEgg).slice(0, 6).map(m => m.id), foeIds: foes.map(m => m.id), internalBattle: true,
      } });
    }
    return session;
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
  commitResult(result: BattleResult, options: BattleCommitOptions = {}): CommitResultStatus {
    if (this.management.active || this.inventory.active) throw new Error("management-active");
    if (this.battleBusy) throw new Error("battle-active: use the current battle/receiving operation");
    if (this.reception) throw new Error("receiving-active: use its receiving token");
    assertBattleResultShape(result);
    const context = this.newReceptionContext(options);
    return this.commitResultWithContext(clone(result), context);
  }
  private commitResultWithContext(result: BattleResult, context: ReceptionContext): CommitResultStatus {
    try { return this.commit(result, undefined, context).status; }
    catch (error) {
      this.assertBattleContext(context);
      if (error instanceof StateInstallFailed || error instanceof ReceivingRefused && error.reason === "pending") {
        const members = this.preparedBattles.get(context)?.captureMembers ?? [];
        this.reception = { context, members: clone(members), resume: () => ({ status: this.commitResultWithContext(result, context) }) };
        return "pending";
      }
      if (!(error instanceof ReceivingRefused)) throw error;
      if (error.reason === "no-template") return "no-template";
      throw error;
    } finally {
      if (this.battleCommitOwner === context && this.reception?.context !== context && !this.preparedBattles.get(context)?.indeterminate) this.battleCommitOwner = null;
    }
  }

  /**
   * One state replacement per result: the result (species mapped to persistent keys through the content, D5-3), for a
   * lost or drawn battle the defeat settlement (money loss and party heal, D3), and the battle statistics. All are
   * identified by the result's battleId + hash in appliedBattles, so a repeat (already-applied) never settles again.
   */
  private commit(result: BattleResult, facts: BattleFacts | undefined, context: ReceptionContext, handle?: S): { status: ApplyStatus; defeat?: { moneyLost: number; healed: true }; diagnostics?: string[] } {
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
    if (previous) {
      if (previous.hash !== hash) throw new Error(`battle ${result.battleId} already applied with a different result`);
      if (prepared?.attempted && !prepared.completed && prepared.next) {
        if (stateIdentity(current) !== stateIdentity(prepared.next)) { prepared.indeterminate = true; throw new StateInstallFailed("state-install-indeterminate: reload the last complete save", true); }
        prepared.completed = true; prepared.indeterminate = false;
        this.noteReception(context, result.captured, current); this.reception = null;
        return { status: "applied", ...(prepared.defeat ? { defeat: prepared.defeat } : {}), diagnostics: [...prepared.diagnostics, "状态已完整安装，已核定原提交"] };
      }
      // Exact replay is content-independent and never fetches a newer effects seal.
      return { status: "already-applied" };
    }
    // This fresh-only closed-source guard must not load current content or an external item catalog.
    assertCapturedHeldSources(result.captured, context.templates ?? {}, { allowed: this.capabilities.allowHeldItemSources, describe: this.describeHeldItem });
    const { content } = this.ports.content(), identity = validatedContentIdentity(content);
    this.assertBattleContext(context, true);
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
      const eligibleHp = Object.fromEntries(next.party.map(member => [member.id, member.hp]));
      if (isDefeat(result)) {
        const settled = settleDefeat(next, content, { noMoneyLoss: this.noMoneyLoss, badges: badgeCount(next.badges), moneyLimit: this.limits.money });
        next = settled.state; prepared.defeat = { moneyLost: settled.moneyLost, healed: true };
      }
      if (facts) next = { ...next, stats: battleStats(next.stats, facts, code, prepared.defeat) };
      if (handle && authority) {
        const config = resolveConfig(content.settings);
        next = this.evolutions.prepare({ token: context.token, generation: context.generation, context: prepared.expectedContext, effects: prepared.effects,
          eligibleHp, lateHeal: isDefeat(result) && facts?.canLose === false,
          enabled: config.CHECK_EVOLUTION_AFTER_ALL_BATTLES || code === 1 || code === 2 }, next, content);
      }
      if (prepared.effects.dispositions.some(d => d.status !== "complete") || composed.dispositions.some(d => d.status !== "applied")) prepared.diagnostics.push("部分战斗附加事实不可用，主战果保留");
      prepared.next = clone(next); prepared.nextIdentity = identity;
    }
    const next = prepared.next!;
    const problems = validateGameContent(next, content);
    if (problems.length) throw new Error(`invalid battle next state: ${problems[0]!.path} ${problems[0]!.message}`);
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
    return { status: "applied", ...(prepared.defeat ? { defeat: prepared.defeat } : {}), ...(prepared.diagnostics.length ? { diagnostics: [...prepared.diagnostics] } : {}) };
  }

  /**
   * End a battle: read its result, commit it once, tell the host. Never throws. A battle whose result cannot be read
   * (unfinished, closed after a failure) or committed ends aborted with the persistent state untouched; once the state
   * is committed a failing host projection is reported on the outcome and does not undo or repeat the commit.
   */
  finishBattle(handle: S, request: Pick<BattleStartRequest, "battleId"> | null): BattleOutcome & { result?: BattleResult } {
    if ((typeof handle !== "object" || handle === null) && typeof handle !== "function") return this.abortBattle(request, new Error("invalid battle handle"));
    const born = typeof handle === "object" && handle !== null ? this.bornIn.get(handle) : undefined;
    if (born !== undefined && born !== this.generation) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "the game state was replaced while this battle was open (a save was loaded or a new game started); its result is not committed" };
    if (this.finishing.has(handle)) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "battle-finish-active" };
    if (this.op && this.op.session !== handle) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "stale battle session" };
    const ownedOp = this.op?.session === handle ? this.op : null, facts = ownedOp?.facts;
    const remembered = this.battleContexts.get(handle);
    if (this.evolutions.active && this.evolutionCompletion) {
      if (remembered?.token === this.evolutionCompletion.token) return this.evolutionOutcome(this.evolutionCompletion.outcome, { status: "pending", view: this.evolutions.view!, diagnostics: [] });
      return { code: 0, battleId: request?.battleId ?? null, commit: "none", error: "evolution-operation-active" };
    }
    let context = remembered ?? this.newReceptionContext();
    if (this.terminatedBattles.has(context)) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "battle-commit-terminated" };
    let result: BattleResult | undefined;
    this.finishing.add(handle);
    try {
      const received = handle.result();
      assertBattleResultShape(received); // Before outcome, copying, hash or any source callback.
      const hash = resultHash(received);
      this.assertBattleContext(context);
      // Legacy callers may recreate an unowned handle for an existing receiving retry. Matching the private pending
      // hash can resume that same zero-authority context; it cannot borrow a started session's source authority.
      if (!remembered && !this.op && this.battleCommitOwner && this.reception?.context === this.battleCommitOwner
        && this.preparedBattles.get(this.battleCommitOwner)?.rawHash === hash) context = this.battleCommitOwner;
      this.battleContexts.set(handle, context); this.bornIn.set(handle, context.generation);
      result = clone(received);
      const code = outcomeCode(result), kind = result.outcome.kind, battleId = request?.battleId ?? result.battleId;
      if (context.rawHash && context.rawHash !== hash) throw new Error("battle result changed while receiving decisions were pending");
      context.rawHash = hash;
      const committed = this.commit(result, facts, context, handle);
      this.assertBattleContext(context);
      if (this.op === ownedOp) this.op = null;
      const outcome: BattleOutcome & { result?: BattleResult } = { code, battleId, commit: committed.status, kind,
        ...(facts?.experimentalHeld ? { diagnostics: ["战后持物写回未完成"] } : {}),
        ...(committed.diagnostics?.length ? { diagnostics: [...(facts?.experimentalHeld ? ["战后持物写回未完成"] : []), ...committed.diagnostics] } : {}),
        ...(committed.defeat ? { defeat: committed.defeat } : {}) };
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
      if (this.op === ownedOp) this.op = null;
      return this.abortBattle(request, error);
    } finally {
      this.finishing.delete(handle);
      if (this.battleCommitOwner === context && this.reception?.context !== context && !this.preparedBattles.get(context)?.indeterminate) this.battleCommitOwner = null;
    }
  }

  /**
   * End without a result (a failure, a cancelled scene). Nothing is committed. Never throws. Ends the open operation when
   * it is this battle (same battleId), also while its session is still being created.
   */
  abortBattle(request: Pick<BattleStartRequest, "battleId"> | null, error: unknown): BattleOutcome {
    if (this.op && request && this.op.battleId === request.battleId) {
      const context = this.op.session ? this.battleContexts.get(this.op.session) : undefined;
      if (context && !this.preparedBattles.get(context)?.indeterminate) {
        this.evolutions.cancelPrepared(context.token);
        this.terminatedBattles.add(context);
        if (this.reception?.context === context) this.reception = null;
        if (this.battleCommitOwner === context) this.battleCommitOwner = null;
      }
      this.op = null;
    }
    const outcome: BattleOutcome = { code: 0, battleId: request ? request.battleId : null, commit: "none", aborted: true, error: message(error) };
    this.project(outcome);
    return outcome;
  }

  private project(outcome: BattleOutcome): void {
    try { this.ports.projection.project(outcome); outcome.projection = "ok"; }
    catch (error) { outcome.projection = "failed"; outcome.projectionError = message(error); }
  }
}
