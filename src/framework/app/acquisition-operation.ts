/** Grant/gift preparation and acquisition-only staged installation. No battle, queue, token or generation authority. */
import { planAcquisitionDex } from "../rules/acquisition-dex";
import type { AcquisitionEntryIntent } from "../rules/acquisition-dex";
import { semanticFingerprint } from "../rules/semantic";
import { moneyCap, changeMoney } from "../rules/economy";
import { addItems, inventoryPolicy } from "../rules/inventory";
import { catalogOf } from "../rules/item-catalog";
import { clone } from "../rules/state";
import type { BattleCommitOptions, GameState } from "../rules/state";
import { allMembers, locateMember } from "../rules/storage";
import { GrantRefusedError, applyGrant } from "../rules/grants";
import { createMember, personalId } from "../rules/member-factory";
import { advanceMemberOrdinal, allocateMemberId } from "../rules/member-identity";
import { receiveMembers, ReceivingRefused, requireTemplate } from "../rules/receiving";
import type { ReceivingDecision, ReceivingProfile } from "../rules/receiving";
import { toPersistentMember } from "../rules/species-key";
import { validateGameContent } from "../rules/save-schema";
import { own, setOwn } from "../rules/own";
import { resolveSpecies } from "../flow/content-runtime";
import type { Content, Member } from "../rules/types";
import type { Limits } from "../rules/limits";
import type { ItemDescriptor } from "../rules/storage-operations";
import { message, StateInstallFailed } from "./application-errors";
import { stateIdentity } from "./state-identity";
import type { ReceptionContext, ReceptionPending } from "./reception-types";
import type { ClaimOutcome, CreationContext, GiftOutcome, GiftRequest, RandomPort } from "./ports";

interface PreparedAcquisition {
  fingerprint: string;
  before?: GameState;
  next?: GameState;
  decisions?: string;
  attempted: boolean;
  complete: boolean;
  retired?: string;
  entries: AcquisitionEntryIntent[];
}

interface AcquisitionOperationOptions {
  state: { read(): GameState; replace(next: GameState): void };
  content: () => Content;
  random?: RandomPort;
  creationContext?: () => CreationContext | undefined;
  now: () => number;
  generation: () => number;
  newContext: (options?: BattleCommitOptions) => ReceptionContext;
  setReception: (pending: ReceptionPending | null) => void;
  noteReception: (context: ReceptionContext, members: readonly Member[], next: GameState) => void;
  reserveDex: (token: string, entries: AcquisitionEntryIntent[], content: Content) => void;
  activateDex: (token: string) => void;
  stateChanged: (next: GameState) => void;
  limits: Limits;
  depositHeal: boolean;
  allowHeldItemSources: boolean;
  profile: ReceivingProfile;
  describeHeldItem: (id: string) => ItemDescriptor | null;
}

export class AcquisitionOperation {
  private operation: { generation: number } | null = null;
  private readonly prepared = new WeakMap<ReceptionContext, PreparedAcquisition>();
  private readonly options: AcquisitionOperationOptions;

  constructor(options: AcquisitionOperationOptions) { this.options = options; }
  get active(): boolean { return this.operation !== null; }
  /** Generation invalidation releases only the active preparation; private staged identities remain fenced by their context. */
  invalidate(): void { this.operation = null; }
  private assertAcquisition(owner: { generation: number }): void {
    if (this.operation !== owner || owner.generation !== this.options.generation()) throw Error("stale-acquisition");
  }

  claimGrant(grantId: string, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): ClaimOutcome {
    const refused = (reason: string, error: unknown): ClaimOutcome => ({ status: "refused", grantId, reason, error: message(error) });
    const acquisition = { generation: this.options.generation() }; this.operation = acquisition;
    try {
    try { options = clone(options); } catch (error) { return refused("invalid", error); }
    let game: GameState;
    try { game = this.options.state.read(); this.assertAcquisition(acquisition); } catch (error) { return refused("state-unusable", error); }
    try {
      if (own(game.claims, grantId)) return { status: "already-claimed", grantId };
      if (!this.options.random) return refused("no-random", "no random source");
      const content = clone(this.options.content()); this.assertAcquisition(acquisition);
      const sourceGrant = own(content.grants, grantId); if (!sourceGrant) throw new GrantRefusedError("unknown-grant", `grant "${grantId}" is not in the content`);
      for (const member of sourceGrant.members) if (member.item) {
        if (!this.options.allowHeldItemSources) throw new GrantRefusedError("held-item-source-disabled", "held-item-source-disabled");
        const descriptor = this.options.describeHeldItem(member.item); if (!descriptor?.holdable || descriptor.mail) throw new GrantRefusedError("invalid-held-item", `unsupported held item ${member.item}`);
      }
      const prepared = applyGrant(game, grantId, content, this.options.random, this.options.limits, { ...(sourceGrant.members.length ? { ...this.options.creationContext?.(), receivedAt: Math.floor(this.options.now() / 1000) } : {}), allowHeldItemSources: this.options.allowHeldItemSources });
      this.assertAcquisition(acquisition);
      if (prepared.status !== "applied") return { status: "already-claimed", grantId };
      const oldIds = new Set(allMembers(game).map((m) => m.id));
      const members = allMembers(prepared.state).filter((m) => !oldIds.has(m.id));
      const grant = own(content.grants, grantId)!;
      const context = this.options.newContext({ profile: options.profile ?? this.options.profile, decisions: options.decisions ?? {}, nextMemberOrdinal: prepared.state.nextMemberOrdinal });
      this.prepared.set(context, { fingerprint: semanticFingerprint(content), attempted: false, complete: false, entries: [] });
      let completed: ClaimOutcome | undefined;
      const finish = (next: GameState): ClaimOutcome => { this.options.activateDex(context.token); this.options.noteReception(context, members, next); this.options.setReception(null); return clone(completed!); };
      const resume = (): ClaimOutcome => {
        try {
          const staged = this.prepared.get(context)!;
          if (staged.next) return finish(this.installAcquisition(context));
          this.acquisitionContent(context);
          const current = clone(this.options.state.read());
          if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
          if (own(current.claims, grantId)) { this.options.setReception(null); return { status: "already-claimed", grantId }; }
          const plan = receiveMembers(current, members, context.decisions ?? {}, { limits: this.options.limits, content, profile: context.profile!, depositHeal: this.options.depositHeal });
          const next = plan.state;
          for (const [item, count] of Object.entries(grant.items)) next.inventory = addItems(next.inventory, item, count, catalogOf(content), inventoryPolicy(content, this.options.limits));
          if (!Number.isSafeInteger(next.money + grant.money)) throw new Error("money-overflow");
          next.money = changeMoney(next.money,grant.money,moneyCap(content,this.options.limits.money));
          const registration = planAcquisitionDex(next.dex, members.map(m => locateMember(next, m.id)!.member), content, { source: "grant", seeForm: true, showMessages: true });
          if (registration.status !== "ready") throw new ReceivingRefused(registration.reason);
          next.dex = registration.dex;
          setOwn(next.claims, grantId, { kind: "grant" }); next.nextMemberOrdinal = context.nextMemberOrdinal!;
          completed = { status: "applied", grantId, placed: plan.placed.map(p => { const m = locateMember(next, p.id)!.member; return { id: m.id, species: m.species, form: m.form ?? 0, level: m.level, to: p.to }; }), items: { ...grant.items }, money: next.money - current.money };
          this.prepareAcquisition(context, current, next, registration.entries);
          return finish(this.installAcquisition(context));
        } catch (error) {
          if (context.generation !== this.options.generation()) return refused("stale-operation", error);
          if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) { this.options.setReception({ context, members, resume, grantId }); return { status: "pending", grantId, token: context.token, pendingMember: error instanceof ReceivingRefused ? error.memberId : undefined, ...(error instanceof StateInstallFailed ? { reason: "commit-failed", error: message(error) } : {}) }; }
          return refused(error instanceof ReceivingRefused ? error.reason : "commit-failed", error);
        }
      };
      return resume();
    } catch (error) { return refused(error instanceof GrantRefusedError ? error.reason : "invalid", error); }
    } finally { if (this.operation === acquisition) this.operation = null; }
  }

  receiveGift(request: GiftRequest, options: { decisions?: Record<string, ReceivingDecision>; profile?: ReceivingProfile } = {}): GiftOutcome {
    const acquisition = { generation: this.options.generation() }; this.operation = acquisition;
    try {
    try {
      request = clone(request); options = clone(options);
      if (!["normal", "silent", "party", "party-silent", "foreign"].includes(request.kind)) throw new ReceivingRefused("invalid-gift-mode");
      if (request.seeForm !== undefined && typeof request.seeForm !== "boolean") throw new ReceivingRefused("invalid-see-form");
      const input = request.member;
      if (!input || Object.keys(input).some((k) => !("existing" in input ? ["existing"] : ["species", "level", "form", "item"]).includes(k))) throw new ReceivingRefused("invalid-member");
      if ("existing" in input && (input.existing.isEgg || input.existing.mail)) throw new ReceivingRefused(input.existing.isEgg ? "egg-not-supported" : "mail-not-supported");
      const held = "existing" in input ? input.existing.item : input.item;
      if (held && !this.options.allowHeldItemSources) throw new ReceivingRefused("held-item-source-disabled");
      if (held && (!this.options.describeHeldItem(held)?.holdable || this.options.describeHeldItem(held)?.mail)) throw new ReceivingRefused("invalid-held-item");
      const game = this.options.state.read(), content = clone(this.options.content()); this.assertAcquisition(acquisition);
      const partyOnly = ["party", "party-silent", "foreign"].includes(request.kind);
      if (partyOnly && game.party.length >= this.options.limits.party) throw new ReceivingRefused("party-full");
      let nextOrdinal = game.nextMemberOrdinal;
      let owner = game.player;
      if (request.kind === "foreign") {
        if (!this.options.random) throw new ReceivingRefused("no-random");
        let id = personalId(this.options.random); if (id === game.player.id) id = (id + 1) >>> 0;
        owner = { id, name: request.foreignOwner?.name ?? "", gender: request.foreignOwner?.gender ?? 0, language: request.foreignOwner?.language ?? 2 };
      }
      let member: Member;
      if ("existing" in input) { requireTemplate(input.existing, input.existing.id); member = clone(input.existing); if (request.kind === "foreign") { member.owner = clone(owner); member.ownerCompatibilityDefault = false; } }
      else {
        if (!this.options.random) throw new ReceivingRefused("no-random");
        if (request.kind === "party-silent" && input.level === undefined) throw new ReceivingRefused("level-required");
        const allocated = allocateMemberId(nextOrdinal, new Set(allMembers(game).map((m) => m.id))); nextOrdinal = allocated.nextMemberOrdinal;
        const name = resolveSpecies(content, input.species); if (!name) throw new ReceivingRefused("unknown-species");
        member = toPersistentMember(createMember({ id: allocated.id, species: name, level: input.level ?? 1, ...(input.form !== undefined ? { form: input.form } : {}), owner, context: { ...this.options.creationContext?.(), receivedAt: Math.floor(this.options.now() / 1000), playerId: game.player.id } }, content, this.options.random), content);
        member.item = input.item ?? "";
      }
      this.assertAcquisition(acquisition);
      nextOrdinal = advanceMemberOrdinal(game.nextMemberOrdinal, [member.id], nextOrdinal);
      if (request.kind === "foreign" && request.nickname) member.nickname = Array.from(request.nickname).slice(0, 10).join("");
      const silent = ["silent", "party-silent", "foreign"].includes(request.kind);
      const context = this.options.newContext({ decisions: options.decisions ?? {}, profile: silent ? { mode: 1, naming: 1 } : options.profile ?? this.options.profile, nextMemberOrdinal: nextOrdinal });
      this.prepared.set(context, { fingerprint: semanticFingerprint(content), attempted: false, complete: false, entries: [] });
      let completed: GiftOutcome | undefined;
      const finish = (next: GameState): GiftOutcome => { this.options.activateDex(context.token); this.options.noteReception(context, [member], next); this.options.setReception(null); return clone(completed!); };
      const resume = (): GiftOutcome => {
        try {
          const staged = this.prepared.get(context)!;
          if (staged.next) return finish(this.installAcquisition(context));
          this.acquisitionContent(context);
          const current = clone(this.options.state.read());
          if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
          const plan = receiveMembers(current, [member], context.decisions ?? {}, { limits: this.options.limits, content, profile: context.profile!, partyOnly, depositHeal: this.options.depositHeal });
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
          if (context.generation !== this.options.generation()) return { status: "refused", reason: "stale-operation" };
          if (error instanceof StateInstallFailed || (error instanceof ReceivingRefused && error.reason === "pending")) { this.options.setReception({ context, members: [member], resume }); return { status: "pending", token: context.token, ...(error instanceof StateInstallFailed ? { reason: "commit-failed", error: message(error) } : {}) }; }
          return { status: "refused", reason: error instanceof ReceivingRefused ? error.reason : "commit-failed", error: message(error) };
        }
      }; return resume();
    } catch (error) { return { status: "refused", reason: error instanceof ReceivingRefused ? error.reason : "invalid", error: message(error) }; }
    } finally { if (this.operation === acquisition) this.operation = null; }
  }

  private acquisitionContent(context: ReceptionContext): Content {
    const staged = this.prepared.get(context); if (!staged || context.generation !== this.options.generation()) throw Error("stale-acquisition");
    if (staged.retired) throw new StateInstallFailed(Error(staged.retired), staged.retired === "acquisition-install-indeterminate");
    let content: Content;
    try { content = this.options.content(); } catch (error) { throw new StateInstallFailed(error); }
    if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
    // This private definition fingerprint only binds this gift plan. It never grants battle auxiliary authority.
    let fingerprint: string;
    try { fingerprint = semanticFingerprint(clone(content)); }
    catch (error) { staged.retired = "invalid-acquisition-content"; throw new StateInstallFailed(error); }
    if (fingerprint !== staged.fingerprint) { staged.retired = "stale-acquisition-content"; throw new StateInstallFailed(Error(staged.retired)); }
    return content;
  }

  private prepareAcquisition(context: ReceptionContext, before: GameState, next: GameState, entries: AcquisitionEntryIntent[]): void {
    const staged = this.prepared.get(context)!;
    const content = this.acquisitionContent(context), errors = validateGameContent(next, content);
    if (errors.length) throw new ReceivingRefused("invalid-acquisition-next", errors[0]!.path + ": " + errors[0]!.message);
    staged.before = clone(before); staged.next = clone(next); staged.entries = clone(entries);
    staged.decisions = semanticFingerprint(context.decisions ?? {});
    this.options.reserveDex(context.token, entries, content);
  }

  private installAcquisition(context: ReceptionContext): GameState {
    const staged = this.prepared.get(context); if (!staged?.next || !staged.before || context.generation !== this.options.generation()) throw Error("stale-acquisition");
    let current: GameState;
    try { current = clone(this.options.state.read()); } catch (error) { throw new StateInstallFailed(error, staged.attempted); }
    if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
    if (stateIdentity(current) === stateIdentity(staged.next)) { staged.complete = true; this.options.stateChanged(staged.next); return clone(staged.next); }
    if (stateIdentity(current) !== stateIdentity(staged.before)) { staged.retired = "acquisition-install-indeterminate"; throw new StateInstallFailed(Error(staged.retired), true); }
    const content = this.acquisitionContent(context), errors = validateGameContent(staged.next, content);
    if (errors.length) throw new StateInstallFailed(Error("invalid-acquisition-next:" + errors[0]!.path));
    // State readers may invoke host code; recheck both definition and base before the actual write.
    this.acquisitionContent(context); current = clone(this.options.state.read());
    if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
    if (stateIdentity(current) !== stateIdentity(staged.before)) { staged.retired = "acquisition-install-indeterminate"; throw new StateInstallFailed(Error(staged.retired), true); }
    this.acquisitionContent(context);
    if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
    staged.attempted = true; let failure: unknown;
    try { this.options.state.replace(clone(staged.next)); } catch (error) { failure = error; }
    if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
    try { current = clone(this.options.state.read()); } catch (error) { throw new StateInstallFailed(error, true); }
    if (context.generation !== this.options.generation()) throw Error("stale-acquisition");
    if (stateIdentity(current) === stateIdentity(staged.next)) { staged.complete = true; this.options.stateChanged(staged.next); return clone(staged.next); }
    if (stateIdentity(current) !== stateIdentity(staged.before)) staged.retired = "acquisition-install-indeterminate";
    throw new StateInstallFailed(failure ?? Error("acquisition-not-installed"), !!staged.retired);
  }

  /** Read-only staged queries used by the one facade-owned shared receiving queue. */
  hasPrepared(context: ReceptionContext): boolean { return this.prepared.has(context); }
  hasPreparedNext(context: ReceptionContext): boolean { return !!this.prepared.get(context)?.next; }
  decisionConflict(context: ReceptionContext, merged: Record<string, ReceivingDecision>): boolean {
    return semanticFingerprint(merged) !== this.prepared.get(context)!.decisions;
  }
  preparedNext(context: ReceptionContext): GameState | undefined { return this.prepared.get(context)?.next; }

  /** Probe only the acquisition facts. The callback performs the facade's queue identity check after a successful host read. */
  terminationProbe(context: ReceptionContext, isCurrent: () => boolean): "uninstalled" | "installed" | "reload-required" | "stale" {
    const staged = this.prepared.get(context)!;
    if (staged.attempted && staged.next && staged.before) {
      let current: GameState; try { current = clone(this.options.state.read()); } catch { return "reload-required"; }
      if (!isCurrent()) return "stale";
      if (stateIdentity(current) === stateIdentity(staged.next)) return "installed";
      if (stateIdentity(current) !== stateIdentity(staged.before)) return "reload-required";
    }
    return "uninstalled";
  }
}
