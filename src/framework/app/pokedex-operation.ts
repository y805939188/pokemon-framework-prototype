/** Explicit viewing edits and the installed-member Info continuation. No render-triggered writes or saved workflow. */
import { clone } from "../rules/value.ts";
import { normalizeMemberDexAppearance } from "../rules/acquisition-dex.ts";
import { semanticFingerprint } from "../rules/semantic.ts";
import { applyDexPatch, planDexLastSeen } from "../rules/pokedex.ts";
import type { DexAppearance, DexPatch } from "../rules/pokedex.ts";
import { createDexQueryCatalog, dexAccessibleRegions, dexForms, planDexFormSelection, planDexUnlock, planDexViewing } from "../rules/pokedex-query.ts";
import { resolveConfig } from "../rules/config.ts";
import { locateMember } from "../rules/storage.ts";
import { validateGameContent } from "../rules/save-schema.ts";
import type { Content } from "../rules/types.ts";
import type { GameState } from "../rules/state.ts";
import type { ContentPort, GameStatePort } from "./ports.ts";

export interface DexEntryIntent {
  memberId: string; species: string; previouslyOwned: boolean; offer: boolean; appearance: DexAppearance;
  source: "grant" | "receive" | "party-gift" | "party-silent" | "capture" | "evolution";
}
export type DexEntryOwner = "acquisition" | "capture" | "evolution";
export type DexViewingCommand = { kind: "entitlement"; value: boolean }
  | { kind: "unlock"; region: number; unlocked: boolean }
  | { kind: "view"; value: { region?: number; mode?: number; cursor?: number; searchResults?: boolean } }
  | { kind: "form"; species: string; baseFrontsEqual: boolean; selected?: number; text?: Record<string, string>; currentRegion?: number | null };
export type DexDecision = { kind: "message-complete" | "close-entry" | "retry" | "technical-terminate" }
 | { kind:"summary-form"; selected?:number; baseFrontsEqual:boolean; text?:Record<string,string>;currentRegion?:number|null };
export interface DexOperationView {
  token: string; revision: number; purpose: "entry" | "edit" | "summary"; phase: "message" | "entry" | "failed";
  parentToken?: string; owner?: DexEntryOwner; source: "installed";
  summary?:{parentToken:string;memberId:string;species:string};
  entry?: DexEntryIntent; error?: string; reloadRequired?: boolean;
}
export type DexResolution = { status: "pending"; view: DexOperationView }
  | { status: "complete" | "technically-terminated" | "applied" | "unchanged"; token: string; parentToken?: string; owner?: DexEntryOwner }
  | { status: "refused"; reason: string };
interface PendingWrite {
  before: GameState; next: GameState; attempted: boolean;
  beforeKey?: string; nextKey?: string;
}
interface Operation {
  token: string; generation: number; revision: number; purpose: "entry" | "edit" | "summary";
  parentToken?: string; owner?: DexEntryOwner; entries: DexEntryIntent[]; cursor: number;
  phase: "reserved" | "message" | "entry"; fingerprint: string;
  summary?:{parentToken:string;memberId:string;species:string};
  pendingWrite?: PendingWrite;
  error?: string; retired?: string; reloadRequired: boolean;
}
const key = (state: GameState): string => JSON.stringify(state, (_k, v: unknown) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]])) : v);
// Only the operation's detached snapshots are memoized. Every host readback is still cloned and canonicalized afresh.
const pendingBefore = (pending: PendingWrite): string => pending.beforeKey ??= key(pending.before);
const pendingNext = (pending: PendingWrite): string => pending.nextKey ??= key(pending.next);
const fingerprint = (content: Content): string => semanticFingerprint(clone(content));
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class PokedexOperation {
  private operation: Operation | null = null;
  private sequence = 0;
  private resolving = false;
  private readonly ports: { state: GameStatePort; content: ContentPort; generation: () => number; enter: (parent?:string) => void; leaveSummary:(parent:string)=>void; changed: (next: GameState) => void };
  constructor(ports: PokedexOperation["ports"]) { this.ports = ports; }
  get active(): boolean { return this.operation !== null; }
  get view(): DexOperationView | null {
    const op = this.operation; if (!op || op.phase === "reserved") return null;
    return clone({ token: op.token, revision: op.revision, purpose: op.purpose, source: "installed" as const,
      phase: op.error ? "failed" as const : op.phase,
      ...(op.parentToken ? { parentToken: op.parentToken, owner: op.owner } : {}),
      ...(op.purpose === "entry" ? { entry: op.entries[op.cursor] } : {}),
      ...(op.summary ? {summary:op.summary}:{}),
      ...(op.error ? { error: op.error, reloadRequired: op.reloadRequired } : {}) });
  }
  invalidate(): void { const op=this.operation;this.operation = null;if(op?.summary)this.ports.leaveSummary(op.summary.parentToken); }
  /** Read-only queries can observe a changed definition too. Retire the in-memory plan without writing the save. */
  observeContent(content: Content): void {
    const op = this.operation; if (!op || !op.fingerprint || op.generation !== this.ports.generation()) return;
    try { if (fingerprint(content) !== op.fingerprint) op.retired = "pokedex-content-changed"; }
    catch { op.retired = "invalid-pokedex-content"; }
  }
  private current(op: Operation): void { if (this.operation !== op || op.generation !== this.ports.generation()) throw Error("stale-pokedex-operation"); }
  private pending(op: Operation): DexResolution { this.current(op); return { status: "pending", view: this.view! }; }
  private finish(op: Operation, status: "complete" | "technically-terminated" | "applied" | "unchanged"): DexResolution {
    this.current(op); this.operation = null;if(op.summary)this.ports.leaveSummary(op.summary.parentToken);
    return { status, token: op.token, ...(op.parentToken ? { parentToken: op.parentToken, owner: op.owner } : {}) };
  }
  /** Private source owner calls this before its primary write; no view exists until that write is proved. */
  reserve(parentToken: string, owner: DexEntryOwner, entries: readonly DexEntryIntent[], content: Content): boolean {
    const selected = entries.filter(e => e.offer); if (!selected.length) return false;
    if (this.operation?.parentToken === parentToken && this.operation.phase === "reserved") return true;
    if (this.operation || this.resolving) throw Error("pokedex-operation-active");
    this.operation = { token: `dex:${this.ports.generation()}:${++this.sequence}`, parentToken, owner,
      generation: this.ports.generation(), revision: 1, purpose: "entry", phase: "reserved", entries: clone(selected),
      cursor: 0, fingerprint: fingerprint(content), reloadRequired: false };
    return true;
  }
  activate(parentToken: string): boolean {
    const op = this.operation; if (!op || op.parentToken !== parentToken) return false;
    this.current(op); if (op.phase === "reserved") op.phase = "message"; return true;
  }
  discardReserved(parentToken: string): void {
    if (this.operation?.parentToken === parentToken && this.operation.phase === "reserved") this.operation = null;
  }
  private content(op: Operation): Content {
    this.current(op); if (op.retired) throw Error(op.retired);
    const content = this.ports.content().content; this.current(op);
    // A private display/edit binding only. It supplies no battle observation or auxiliary-fact authority.
    if (fingerprint(content) !== op.fingerprint) { op.retired = "pokedex-content-changed"; throw Error(op.retired); }
    return content;
  }
  private patch(state: GameState, content: Content, command: DexViewingCommand, summary=false): DexPatch {
    if (!content.regionalDex) throw Error("pokedex-layout-unavailable");
    switch (command.kind) {
      case "entitlement":
        if (typeof command.value !== "boolean") throw Error("invalid-dex-entitlement");
        return state.dex.hasDex === command.value ? {} : { hasDex: command.value };
      case "unlock":
        if (typeof command.unlocked !== "boolean") throw Error("invalid-dex-unlock");
        return planDexUnlock(state.dex, content.regionalDex, command.region, command.unlocked);
      case "view":
        if (!command.value || typeof command.value !== "object" || Object.keys(command.value).some(k => !["region", "mode", "cursor", "searchResults"].includes(k))
          || command.value.searchResults !== undefined && typeof command.value.searchResults !== "boolean") throw Error("invalid-dex-view-command");
        return planDexViewing(state.dex, content.regionalDex, command.value);
      case "form": {
        if (!state.dex.hasDex || !state.dex.seen.includes(command.species)) throw Error("pokedex-entry-not-accessible");
        if (typeof command.baseFrontsEqual !== "boolean") throw Error("pokedex-front-equality-required");
        if (command.currentRegion !== undefined && command.currentRegion !== null && !Number.isSafeInteger(command.currentRegion)) throw Error("invalid-pokedex-current-region");
        const catalog = createDexQueryCatalog(content, command.text ?? {}), config = resolveConfig(content.settings);
        const accessible = dexAccessibleRegions(state.dex, catalog.layout, { useCurrentRegion: config.USE_CURRENT_REGION_DEX, currentRegion: command.currentRegion ?? null });
        if (!summary&&!accessible.some(region => (region === -1 ? catalog.layout.national : catalog.layout.regions[region]?.species ?? []).includes(command.species))) throw Error("pokedex-entry-not-accessible");
        const base = catalog.forms.find(f => f.species === command.species && f.form === 0);
        if (base?.gender === undefined) throw Error("pokedex-gender-rule-unavailable");
        const choices = dexForms(state.dex, catalog, command.species, { showAll: config.DEX_SHOWS_ALL_FORMS,
          gender: base.gender, baseFrontsEqual: command.baseFrontsEqual });
        if (!choices.length || command.selected !== undefined && (!Number.isInteger(command.selected) || command.selected < 0 || command.selected >= choices.length)) throw Error("pokedex-form-unavailable");
        return planDexFormSelection(state.dex, command.species, choices, command.selected).patch;
      }
      default: throw Error("unknown-dex-command");
    }
  }
  /** Complete single entry attached to an exact management owner, including held-member summaries. */
  beginSummary(parentToken:string,memberId:string):DexResolution {
    if(typeof parentToken!=='string'||!parentToken||typeof memberId!=='string'||!memberId)return {status:'refused',reason:'invalid-summary-parent'};
    if(this.operation||this.resolving)return {status:'refused',reason:'pokedex-operation-active'};
    let op:Operation|undefined;this.resolving=true;
    try{
      op={token:`dex-summary:${this.ports.generation()}:${++this.sequence}`,generation:this.ports.generation(),revision:1,purpose:'summary',phase:'entry',entries:[],cursor:0,fingerprint:'',reloadRequired:false};
      this.operation=op;this.ports.enter(parentToken);this.current(op);
      op.summary={parentToken,memberId,species:''};
      const state=clone(this.ports.state.read());this.current(op);const content=clone(this.ports.content().content);this.current(op);op.fingerprint=fingerprint(content);
      const member=locateMember(state,memberId)?.member;
      if(!state.dex.hasDex||!member||member.isEgg)throw Error('pokedex-summary-not-accessible');
      const appearance=normalizeMemberDexAppearance(content,member,'recent');if(!appearance)throw Error('pokedex-summary-appearance-unavailable');
      op.summary.species=member.species;const plan=planDexLastSeen(state.dex,member.species,appearance);if(plan.status!=='ok')throw Error(plan.reason);
      if(!plan.changed)return this.pending(op);
      const next=clone(state);next.dex=applyDexPatch(next.dex,plan.patch);const errors=validateGameContent(next,content);if(errors.length)throw Error(`invalid-pokedex-next:${errors[0]!.path}`);
      op.pendingWrite={before:state,next,attempted:false};return this.install(op);
    }catch(error){
      if(!op||this.operation!==op||op.generation!==this.ports.generation())return {status:'refused',reason:'stale-pokedex-operation'};
      if(!op.pendingWrite){this.finish(op,'technically-terminated');return {status:'refused',reason:message(error)};}
      op.error=message(error);op.revision++;return this.pending(op);
    }finally{this.resolving=false;}
  }
  begin(command: DexViewingCommand): DexResolution {
    if (this.operation || this.resolving) return { status: "refused", reason: "pokedex-operation-active" };
    // JSON copies map nonfinite numbers to null; validate this nullable author input before retaining it.
    if (command?.kind === "form" && command.currentRegion !== undefined && command.currentRegion !== null && !Number.isSafeInteger(command.currentRegion)) return { status: "refused", reason: "invalid-pokedex-current-region" };
    let op: Operation | undefined;
    this.resolving = true;
    try {
      op = { token: `dex-edit:${this.ports.generation()}:${++this.sequence}`, generation: this.ports.generation(), revision: 1,
        purpose: "edit", phase: "entry", entries: [], cursor: 0, fingerprint: "", reloadRequired: false };
      this.operation = op; this.ports.enter(); this.current(op);
      const input = clone(command), state = clone(this.ports.state.read()); this.current(op);
      const content = clone(this.ports.content().content); this.current(op); op.fingerprint = fingerprint(content);
      const patch = this.patch(state, content, input);
      if (!Object.keys(patch).length) return this.finish(op, "unchanged");
      const next = clone(state); next.dex = applyDexPatch(next.dex, patch);
      const errors = validateGameContent(next, content); if (errors.length) throw Error(`invalid-pokedex-next:${errors[0]!.path}`);
      op.pendingWrite = { before: state, next, attempted: false };
      return this.install(op);
    } catch (error) {
      if (!op || this.operation !== op || op.generation !== this.ports.generation()) return { status: "refused", reason: "stale-pokedex-operation" };
      if (!op.pendingWrite) { this.operation = null; return { status: "refused", reason: message(error) }; }
      op.error = message(error); op.revision++; return this.pending(op);
    } finally { this.resolving = false; }
  }
  private installed(op: Operation): DexResolution {
    const next = op.pendingWrite!.next; delete op.pendingWrite; op.error = undefined; op.reloadRequired = false; op.revision++;
    this.ports.changed(next); this.current(op);
    if (op.purpose === "edit") return this.finish(op, "applied");
    op.phase = "entry"; return this.pending(op);
  }
  private install(op: Operation): DexResolution {
    const pending = op.pendingWrite!;
    let current = clone(this.ports.state.read()); this.current(op);
    let currentKey = key(current);
    if (currentKey === pendingNext(pending)) return this.installed(op);
    if (currentKey !== pendingBefore(pending)) { op.reloadRequired = true; throw Error("pokedex-install-indeterminate:reload-required"); }
    const content = this.content(op), errors = validateGameContent(pending.next, content);
    if (errors.length) throw Error(`invalid-pokedex-next:${errors[0]!.path}`);
    current = clone(this.ports.state.read()); this.current(op); this.content(op);
    currentKey = key(current);
    if (currentKey !== pendingBefore(pending)) { op.reloadRequired = true; throw Error("pokedex-install-indeterminate:reload-required"); }
    pending.attempted = true; let failure: unknown;
    try { this.ports.state.replace(clone(pending.next)); } catch (error) { failure = error; }
    this.current(op);
    try { current = clone(this.ports.state.read()); } catch (error) { op.reloadRequired = true; throw error; }
    this.current(op);
    currentKey = key(current);
    if (currentKey === pendingNext(pending)) return this.installed(op);
    op.reloadRequired = currentKey !== pendingBefore(pending);
    throw failure ?? Error(op.reloadRequired ? "pokedex-install-indeterminate:reload-required" : "pokedex-state-not-installed");
  }
  resolve(token: string, revision: number, decision: DexDecision): DexResolution {
    const op = this.operation;
    if (!op || op.phase === "reserved" || op.token !== token || op.generation !== this.ports.generation()) return { status: "refused", reason: "stale-pokedex-operation" };
    if (revision !== op.revision) return { status: "refused", reason: "stale-pokedex-decision" };
    if (this.resolving) return { status: "refused", reason: "pokedex-resolution-active" };
    this.resolving = true;
    try {
      if (decision.kind === "technical-terminate") {
        if (op.pendingWrite?.attempted) {
          const current = clone(this.ports.state.read()); this.current(op);
          if (![pendingBefore(op.pendingWrite), pendingNext(op.pendingWrite)].includes(key(current))) { op.reloadRequired = true; throw Error("pokedex-install-indeterminate:reload-required"); }
        }
        return this.finish(op, "technically-terminated");
      }
      if (op.pendingWrite) {
        if (decision.kind !== "retry") return { status: "refused", reason: "pokedex-retry-or-terminate-required" };
        return this.install(op);
      }
      if(op.purpose==='summary'){
        if(decision.kind==='close-entry')return this.finish(op,'complete');
        if(decision.kind!=='summary-form')return {status:'refused',reason:'pokedex-summary-decision-required'};
        const before=clone(this.ports.state.read());this.current(op);const content=this.content(op);
        const patch=this.patch(before,content,{kind:'form',species:op.summary!.species,baseFrontsEqual:decision.baseFrontsEqual,selected:decision.selected,text:decision.text,currentRegion:decision.currentRegion},true);
        if(!Object.keys(patch).length)return this.pending(op);
        const next=clone(before);next.dex=applyDexPatch(next.dex,patch);const errors=validateGameContent(next,content);if(errors.length)throw Error(`invalid-pokedex-next:${errors[0]!.path}`);
        op.pendingWrite={before,next,attempted:false};return this.install(op);
      }
      if (op.purpose !== "entry") return { status: "refused", reason: "pokedex-edit-not-pending" };
      if (op.phase === "entry") {
        if (decision.kind !== "close-entry") return { status: "refused", reason: "pokedex-close-entry-required" };
        op.cursor++; op.revision++; op.error = undefined;
        if (op.cursor >= op.entries.length) return this.finish(op, "complete");
        op.phase = "message"; return this.pending(op);
      }
      if (decision.kind !== "message-complete" && !(decision.kind === "retry" && op.error)) return { status: "refused", reason: "pokedex-message-completion-required" };
      const before = clone(this.ports.state.read()); this.current(op); const content = this.content(op), entry = op.entries[op.cursor]!;
      const member = locateMember(before, entry.memberId)?.member;
      if (!member || member.species !== entry.species) throw Error("pokedex-presented-member-changed");
      if (JSON.stringify(normalizeMemberDexAppearance(content, member, "recent")) !== JSON.stringify(entry.appearance)) throw Error("pokedex-presented-appearance-changed");
      const plan = planDexLastSeen(before.dex, entry.species, entry.appearance);
      if (plan.status !== "ok") throw Error(plan.reason);
      if (!plan.changed) { op.phase = "entry"; op.error = undefined; op.revision++; return this.pending(op); }
      const next = clone(before); next.dex = applyDexPatch(next.dex, plan.patch);
      const errors = validateGameContent(next, content); if (errors.length) throw Error(`invalid-pokedex-next:${errors[0]!.path}`);
      op.pendingWrite = { before, next, attempted: false };
      return this.install(op);
    } catch (error) {
      if (this.operation !== op || op.generation !== this.ports.generation()) return { status: "refused", reason: "stale-pokedex-operation" };
      op.error = message(error); op.revision++; return this.pending(op);
    } finally { this.resolving = false; }
  }
}
