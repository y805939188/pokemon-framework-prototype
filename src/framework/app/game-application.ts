/**
 * The game application: the use cases that coordinate a battle with the persistent game, and nothing else.
 *  - game rules stay in the core (`rules/`): the application calls `applyBattleResult`, it does not re-implement it;
 *  - the Showdown engine and the MZ scene/windows stay behind their own adapters: the application only sees ports.
 * Outcomes are explicit so a caller can tell the four situations apart:
 *   not committed (aborted) | committed | already committed (duplicate) | committed but the host was not informed.
 */
import { applyBattleResult, capturedTemplates, clone, newGame, resultHash } from "../rules/state.ts";
import type { ApplyStatus, BattleCommitOptions, BattleResult, GameState } from "../rules/state.ts";
import { allMembers, boxedMembers, locateMember } from "../rules/storage.ts";
import { DEFAULT_LIMITS, storageFull } from "../rules/limits.ts";
import type { Limits } from "../rules/limits.ts";
import { GrantRefusedError, applyGrant } from "../rules/grants.ts";
import { managementSnapshot, individualView, searchStorage } from "./management-query.ts";
import type { IndividualView, ManagementSnapshot, StorageMatch, StorageSearch } from "./management-query.ts";
import { ManagementSession } from "./management.ts";
import type { ManagementOutcome, ManagementRequest } from "./management.ts";
import { developmentCapabilities } from "../rules/config.ts";
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
import { validateGame } from "../rules/save-schema.ts";
import { own, setOwn } from "../rules/own.ts";
import { findDanglingReferences, resolveSpecies } from "../flow/content-runtime.ts";
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
  constructor(error: unknown) { super(message(error)); }
}
interface ReceptionContext extends BattleCommitOptions { token: string; generation: number; rawHash?: string; recovered?: boolean }
interface ReceptionPending {
  context: ReceptionContext;
  grantId?: string;
  members: Member[];
  resume: () => BattleOutcome | ClaimOutcome | GiftOutcome | { status: string };
}
export type CommitResultStatus = ApplyStatus | "pending" | "no-template";

export class GameApplication<S extends BattleHandle = BattleHandle> {
  private readonly ports: GameApplicationPorts<S>;
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
  private generation = 0;
  private readonly bornIn = new WeakMap<object, number>();

  constructor(ports: GameApplicationPorts<S>, options: GameApplicationOptions = {}) {
    this.ports = ports;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.startMoney = options.startMoney ?? 3000;
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
    this.management = new ManagementSession(ports.state, () => ports.content().content, { limits: this.limits, depositHeal: this.depositHeal, sourceAllowed: this.capabilities.allowHeldItemSources, describeItem: this.describeHeldItem });
  }

  /** A new game: the formal empty state (no members; the player receives them through grants). Throws only if the store refuses. */
  startNewGame(): { status: "started"; state: GameState } {
    const random = this.ports.random;
    if (!random) throw new Error("no-random: a new player's trainer ID needs an injected random source");
    const state = newGame({ party: [], money: this.startMoney, player: { id: personalId(random), name: this.playerDefaults.name, gender: this.playerDefaults.gender, language: ownerLanguage(this.playerDefaults.locale) } });
    this.ports.state.replace(state);
    this.stateReplacedByHost();
    return { status: "started", state };
  }

  /** Give a content grant once per save timeline. Never throws; a refusal commits nothing (and writes no claim). */
  claimGrant(grantId: string, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): ClaimOutcome {
    const refused = (reason: string, error: unknown): ClaimOutcome => ({ status: "refused", grantId, reason, error: message(error) });
    if (this.reception?.grantId === grantId) return { status: "pending", grantId, token: this.reception.context.token };
    if (this.op || this.management.active || this.reception) return refused(this.op ? "battle-active" : "operation-active", "another operation is open");
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return refused("state-unusable", error); }
    try {
      if (own(game.claims, grantId)) return { status: "already-claimed", grantId };
      if (!this.ports.random) return refused("no-random", "no random source");
      const content = this.ports.content().content;
      const sourceGrant = own(content.grants, grantId); if (!sourceGrant) throw new GrantRefusedError("unknown-grant", `grant "${grantId}" is not in the content`);
      for (const member of sourceGrant.members) if (member.item) {
        if (!this.capabilities.allowHeldItemSources) throw new GrantRefusedError("held-item-source-disabled", "held-item-source-disabled");
        const descriptor = this.describeHeldItem(member.item); if (!descriptor?.holdable || descriptor.mail) throw new GrantRefusedError("invalid-held-item", `unsupported held item ${member.item}`);
      }
      const prepared = applyGrant(game, grantId, content, this.ports.random, this.limits, { ...(sourceGrant.members.length ? { ...this.ports.creationContext?.(), receivedAt: Math.floor(this.now() / 1000) } : {}), allowHeldItemSources: this.capabilities.allowHeldItemSources });
      if (prepared.status !== "applied") return { status: "already-claimed", grantId };
      const oldIds = new Set(allMembers(game).map((m) => m.id));
      const members = allMembers(prepared.state).filter((m) => !oldIds.has(m.id));
      const grant = own(content.grants, grantId)!;
      const context = this.newReceptionContext({ profile: options.profile ?? this.profile, decisions: options.decisions ?? {}, nextMemberOrdinal: prepared.state.nextMemberOrdinal });
      const resume = (): ClaimOutcome => {
        try {
          const current = this.ports.state.read();
          if (own(current.claims, grantId)) { this.reception = null; return { status: "already-claimed", grantId }; }
          const plan = receiveMembers(current, members, context.decisions ?? {}, { limits: this.limits, content, profile: context.profile!, depositHeal: this.depositHeal });
          const next = plan.state;
          for (const [item, count] of Object.entries(grant.items)) { const n = (own(next.bag, item) ?? 0) + count; if (n > this.limits.bagPerItem) throw new Error("bag-full"); setOwn(next.bag, item, n); }
          next.money = next.money > this.limits.money ? next.money : Math.min(next.money + grant.money, this.limits.money);
          for (const m of members) for (const key of ["seen", "owned"] as const) if (!next.dex[key].includes(m.species)) next.dex[key].push(m.species);
          setOwn(next.claims, grantId, { kind: "grant" }); next.nextMemberOrdinal = context.nextMemberOrdinal!;
          this.install(next); this.noteReception(context, members, next); this.reception = null;
          return { status: "applied", grantId, placed: plan.placed.map((p) => { const m = allMembers(next).find((m) => m.id === p.id)!; return { id: m.id, species: m.species, form: m.form ?? 0, level: m.level, to: p.to }; }), items: { ...grant.items }, money: next.money - current.money };
        } catch (error) {
          if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) { this.reception = { context, members, resume, grantId }; return { status: "pending", grantId, token: context.token, pendingMember: error instanceof ReceivingRefused ? error.memberId : undefined, ...(error instanceof StateInstallFailed ? { reason: "commit-failed", error: message(error) } : {}) }; }
          return refused(error instanceof ReceivingRefused ? error.reason : "commit-failed", error);
        }
      };
      return resume();
    } catch (error) { return refused(error instanceof GrantRefusedError ? error.reason : "invalid", error); }
  }

  receiveGift(request: GiftRequest, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): GiftOutcome {
    if (this.op || this.management.active || this.reception) return { status: "refused", reason: "operation-active" };
    try {
      if (!["normal", "silent", "party", "party-silent", "foreign"].includes(request.kind)) throw new ReceivingRefused("invalid-gift-mode");
      const input = request.member;
      if (!input || Object.keys(input).some((k) => !("existing" in input ? ["existing"] : ["species", "level", "form", "item"]).includes(k))) throw new ReceivingRefused("invalid-member");
      if ("existing" in input && (input.existing.isEgg || input.existing.mail)) throw new ReceivingRefused(input.existing.isEgg ? "egg-not-supported" : "mail-not-supported");
      const held = "existing" in input ? input.existing.item : input.item;
      if (held && !this.capabilities.allowHeldItemSources) throw new ReceivingRefused("held-item-source-disabled");
      if (held && (!this.describeHeldItem(held)?.holdable || this.describeHeldItem(held)?.mail)) throw new ReceivingRefused("invalid-held-item");
      const game = this.ports.state.read(), content = this.ports.content().content;
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
      nextOrdinal = advanceMemberOrdinal(game.nextMemberOrdinal, [member.id], nextOrdinal);
      if (request.kind === "foreign" && request.nickname) member.nickname = Array.from(request.nickname).slice(0, 10).join("");
      const silent = ["silent", "party-silent", "foreign"].includes(request.kind);
      const context = this.newReceptionContext({ decisions: options.decisions ?? {}, profile: silent ? { mode: 1, naming: 1 } : options.profile ?? this.profile, nextMemberOrdinal: nextOrdinal });
      const resume = (): GiftOutcome => {
        try {
          const current = this.ports.state.read();
          const plan = receiveMembers(current, [member], context.decisions ?? {}, { limits: this.limits, content, profile: context.profile!, partyOnly, depositHeal: this.depositHeal });
          plan.state.nextMemberOrdinal = context.nextMemberOrdinal!;
          for (const key of ["seen", "owned"] as const) if (!plan.state.dex[key].includes(member.species)) plan.state.dex[key].push(member.species);
          this.install(plan.state); this.noteReception(context, [member], plan.state); this.reception = null; return { status: "applied", placed: plan.placed };
        } catch (error) {
          if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) { this.reception = { context, members: [member], resume }; return { status: "pending", token: context.token, ...(error instanceof StateInstallFailed ? { reason: "commit-failed", error: message(error) } : {}) }; }
          return { status: "refused", reason: error instanceof ReceivingRefused ? error.reason : "commit-failed", error: message(error) };
        }
      }; return resume();
    } catch (error) { return { status: "refused", reason: error instanceof ReceivingRefused ? error.reason : "invalid", error: message(error) }; }
  }

  private install(next: GameState): void { const problems = validateGame(next); if (problems.length) throw new Error(`invalid next state: ${problems[0]!.path} ${problems[0]!.message}`); try { this.ports.state.replace(next); } catch (error) { throw new StateInstallFailed(error); } }
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
    pending.context.decisions = { ...pending.context.decisions, ...clone(decisions) };
    if (signal !== undefined) {
      if (!["scene-aborted", "rebuild-failed"].includes(signal)) return { status: "refused", reason: "invalid-recovery-signal" };
      try { pending.context.decisions = fallbackDecisions(this.ports.state.read(), pending.members, { limits: this.limits, content: this.ports.content().content, profile: pending.context.profile ?? this.profile, depositHeal: this.depositHeal }, pending.context.decisions); pending.context.recovered = true; }
      catch (error) { return { status: "pending", reason: message(error) }; }
    }
    const outcome = pending.resume();
    if (!("pending" in outcome && outcome.pending) && !("status" in outcome && outcome.status === "pending") && !("status" in outcome && outcome.status === "refused")) {
      this.receptionReceipts.set(token, clone(outcome));
      if (this.receptionReceipts.size > 32) this.receptionReceipts.delete(this.receptionReceipts.keys().next().value!);
    }
    return outcome;
  }

  /** What a party/bag screen shows. Throws when the state is unusable (the screen then says so). */
  describeParty(): PartyView {
    const game = this.ports.state.read();
    const { content } = this.ports.content();
    return {
      members: game.party.map((m) => {
        const sp = speciesDataOf(content, m);
        const maxhp = sp ? computeStats(sp.base, m.ivs, m.evs, m.level, m.nature).hp : m.hp;
        return { id: m.id, species: m.species, form: m.form ?? 0, ...(sp?.nameKey ? { nameKey: sp.nameKey } : {}), level: m.level, hp: m.hp, maxhp, status: m.status, moves: m.moves.map((x) => ({ ...x })) };
      }),
      boxes: boxedMembers(game).length, bag: { ...game.bag }, money: game.money,
    };
  }

  /** Heal the party (HP, status, PP). Safe to repeat: an already healed party writes nothing. Never throws. */
  healParty(): HealOutcome {
    if (this.management.active || this.reception) return { status: "refused", reason: "management-active" };
    if (this.op) return { status: "refused", reason: "battle-active", error: "a battle is open: its result would overwrite the state" };
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
    return Object.entries(this.ports.state.read().bag).filter(([id, count]) => { const item = this.describeHeldItem(id); return count > 0 && item?.holdable && !item.mail; }).map(([id, count]) => ({ id, count }));
  }
  beginManagement(): string { if (this.op || this.reception) throw new Error("operation-active"); return this.management.begin(); }
  manage(token: string, requestId: string, request: ManagementRequest): ManagementOutcome {
    if (this.op) return { status: "refused", reason: "battle-active" };
    return this.management.execute(token, requestId, request);
  }
  endManagement(token: string): ManagementOutcome { return this.management.end(token); }
  heldMemberReference(token: string): MemberReference | null { return this.management.heldReference(token); }
  get saveBlocked(): boolean { return !!this.op || !!this.reception || this.management.saveBlocked; }
  recoverAll(): HealOutcome {
    if (this.op || this.management.active || this.reception) return { status: "refused", reason: this.op ? "battle-active" : "management-active" };
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
    if (this.management.active || this.reception) return { status: "refused", reason: "management-active" };
    if (this.op) return { status: "refused", reason: "battle-active", error: "a battle is open: its result would overwrite the state" };
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
    this.op = null;
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
    if (this.management.active || this.reception) throw new Error("operation-active");
    if (this.op) throw new Error(`a battle is already open (${this.op.battleId})`);
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
    const view = battleView(game, content);
    view.party = view.party.filter((m) => !m.isEgg); // the session speaks Showdown names (protocol v1); the save keeps content ids
    const op: { battleId: string; session: S | null; facts: BattleFacts } = { battleId: request.battleId, session: null, facts: { kind: request.kind, canLose: !!request.canLose, experimentalHeld: game.party.some((m) => !!m.item) } };
    this.op = op; // taken before the first await: nothing can write between reading the state and opening the battle
    let session: S;
    try { session = await this.ports.sessions.create(request, view, setup); }
    catch (error) { if (this.op === op) this.op = null; throw error; }
    if (this.op !== op) throw new Error(`battle ${request.battleId} was aborted while its session was being created; the late session is not used`);
    op.session = session;
    if (typeof session === "object" && session !== null) { this.bornIn.set(session, this.generation); this.battleContexts.set(session, context); }
    return session;
  }

  /**
   * A wild encounter for a host table at a region (WP36 §5.1 selection, decided here so the host keeps no rule).
   * Never throws: "not-here" when the table does not apply at the region, and no encounter when nobody can battle.
   */
  prepareEncounter(table: unknown, region: number): EncounterPlan {
    const checked = validateEncounterTable(table);
    if (!checked.table) return { ok: false, reason: "invalid-table", error: checked.problems.map((p) => `${p.path} ${p.message}`).join("; ") };
    if (!appliesAt(checked.table, region)) return { ok: false, reason: "not-here" };
    let game: GameState;
    try { game = this.ports.state.read(); } catch (error) { return { ok: false, reason: "state-unusable", error: message(error) }; }
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
    if (this.management.active) throw new Error("management-active");
    if (this.op && this.op.battleId !== result.battleId) throw new Error("another battle is active");
    if (this.reception) throw new Error("receiving-active: use its receiving token");
    const context = this.op?.session ? this.battleContexts.get(this.op.session) ?? this.newReceptionContext(options) : this.newReceptionContext(options);
    return this.commitResultWithContext(clone(result), context);
  }
  private commitResultWithContext(result: BattleResult, context: ReceptionContext): CommitResultStatus {
    try { return this.commit(result, undefined, context).status; }
    catch (error) {
      if (!(error instanceof ReceivingRefused)) throw error;
      if (error.reason === "no-template") return "no-template";
      if (error.reason !== "pending") throw error;
      const members = capturedTemplates(result, context.templates ?? {}, speciesKeyResolver(this.ports.content().content));
      this.reception = { context, members, resume: () => ({ status: this.commitResultWithContext(result, context) }) }; return "pending";
    }
  }

  /**
   * One state replacement per result: the result (species mapped to persistent keys through the content, D5-3), for a
   * lost or drawn battle the defeat settlement (money loss and party heal, D3), and the battle statistics. All are
   * identified by the result's battleId + hash in appliedBattles, so a repeat (already-applied) never settles again.
   */
  private commit(result: BattleResult, facts?: BattleFacts, options: BattleCommitOptions = {}): { status: ApplyStatus; defeat?: { moneyLost: number; healed: true } } {
    const code = outcomeCode(result); // pure validation precedes any source lookup or persistent installation
    const heldItemSource = { allowed: this.capabilities.allowHeldItemSources, describe: this.describeHeldItem };
    assertCapturedHeldSources(result.captured ?? [], options.templates ?? {}, heldItemSource);
    const { content } = this.ports.content();
    const applied = applyBattleResult(this.ports.state.read(), result, this.limits, speciesKeyResolver(content), { ...options, content, depositHeal: this.depositHeal, heldItemSource });
    if (applied.status !== "applied") return { status: applied.status };
    let next = applied.state;
    let defeat: { moneyLost: number; healed: true } | undefined;
    if (isDefeat(result)) {
      const settled = settleDefeat(next, content, { noMoneyLoss: this.noMoneyLoss });
      next = settled.state;
      defeat = { moneyLost: settled.moneyLost, healed: true };
    }
    if (facts) next = { ...next, stats: battleStats(next.stats, facts, code, defeat) };
    this.install(next);
    if ("token" in options) this.noteReception(options as ReceptionContext, result.captured, next);
    this.reception = null;
    return defeat ? { status: "applied", defeat } : { status: "applied" };
  }

  /**
   * End a battle: read its result, commit it once, tell the host. Never throws. A battle whose result cannot be read
   * (unfinished, closed after a failure) or committed ends aborted with the persistent state untouched; once the state
   * is committed a failing host projection is reported on the outcome and does not undo or repeat the commit.
   */
  finishBattle(handle: S, request: Pick<BattleStartRequest, "battleId"> | null): BattleOutcome & { result?: BattleResult } {
    const born = typeof handle === "object" && handle !== null ? this.bornIn.get(handle) : undefined;
    if (born !== undefined && born !== this.generation) {
      // the state this battle read is gone: no commit, no projection into the new state, and no lock to release
      return { code: 0, battleId: request ? request.battleId : null, commit: "none", aborted: true, error: "the game state was replaced while this battle was open (a save was loaded or a new game started); its result is not committed" };
    }
    if (this.op && this.op.session !== handle) return { code: 0, battleId: request?.battleId ?? null, commit: "none", aborted: true, error: "stale battle session" };
    const ownedOp = this.op && this.op.session === handle ? this.op : null;
    const facts = ownedOp?.facts;
    const context = this.battleContexts.get(handle) ?? this.newReceptionContext();
    let result: BattleResult;
    let outcome: BattleOutcome & { result?: BattleResult };
    try {
      result = handle.result();
      // Read and validate every result field needed after commit first. A bad handle must never leave a committed
      // battle that the caller subsequently mistakes for an abort.
      const code = outcomeCode(result), kind = result.outcome.kind;
      const battleId = request ? request.battleId : result.battleId;
      const hash = resultHash(result);
      if (context.rawHash && context.rawHash !== hash) throw new Error("battle result changed while receiving decisions were pending");
      context.rawHash = hash;
      const committed = this.commit(result, facts, context);
      if (this.op === ownedOp) this.op = null;
      outcome = { code, battleId, commit: committed.status, kind, ...(facts?.experimentalHeld ? { diagnostics: ["战后持物写回未完成"] } : {}), ...(committed.defeat ? { defeat: committed.defeat } : {}) };
    } catch (error) {
      if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) {
        const raw = handle.result();
        this.reception = { context, members: capturedTemplates(raw, context.templates ?? {}, speciesKeyResolver(this.ports.content().content)), resume: () => this.finishBattle(handle, request) };
        return { code: outcomeCode(raw), battleId: raw.battleId, commit: "none", pending: true, receivingToken: context.token, pendingMember: error instanceof ReceivingRefused ? error.memberId : undefined, ...(error instanceof StateInstallFailed ? { error: `commit-failed: ${message(error)}` } : {}) };
      }
      if (this.reception?.context === context) this.reception = null;
      if (this.op === ownedOp) this.op = null;
      return this.abortBattle(request, error);
    }
    this.project(outcome);
    outcome.result = result;
    return outcome;
  }

  /**
   * End without a result (a failure, a cancelled scene). Nothing is committed. Never throws. Ends the open operation when
   * it is this battle (same battleId), also while its session is still being created.
   */
  abortBattle(request: Pick<BattleStartRequest, "battleId"> | null, error: unknown): BattleOutcome {
    if (this.op && request && this.op.battleId === request.battleId) {
      const context = this.op.session ? this.battleContexts.get(this.op.session) : undefined;
      if (context && this.reception?.context === context) this.reception = null;
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
