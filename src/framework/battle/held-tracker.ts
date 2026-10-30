/**
 * RPG held-item journal around actual pinned-engine objects. This is not a log parser or a persistent store.
 * Instance-local descriptors see direct assignments as well as primitive calls, including nested item activation.
 * Unknown mutations poison the complete channel; they never become an empty successful settlement.
 */
import type { ShowdownBattle, ShowdownPokemon } from "./showdown-types";
import type { HeldBinding, HeldEvent, HeldMemberFact, HeldReason, HeldValues, RequiredFacts } from "../rules/held-facts";

interface Cell extends HeldMemberFact { pokemon: ShowdownPokemon }
interface Call { pokemon: ShowdownPokemon; method: string; source: ShowdownPokemon | null }
interface Taken { pokemon: ShowdownPokemon; item: string; recovery: string; effect: string; move: object | null; turn: number; used: boolean }
export interface HeldTrackerSnapshot {
  members: HeldMemberFact[]; events: HeldEvent[]; invalid: string[];
  positions: string[][]; money: RequiredFacts["money"];
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const transfer = new Set(["thief", "covet", "trick", "switcheroo", "bestow"]);
const removal = new Set([...transfer, "knockoff", "incinerate", "bugbite", "pluck"]);
const itemId = (value: unknown): value is string => typeof value === "string" && /^(?:[a-z0-9]{1,64})?$/.test(value);

export class HeldTracker {
  private readonly battle: ShowdownBattle;
  private readonly wild: boolean;
  private readonly cells = new Map<ShowdownPokemon, Cell>();
  private readonly byId = new Map<string, Cell>();
  private readonly calls: Call[] = [];
  private readonly taken: Taken[] = [];
  private events: HeldEvent[] = [];
  private invalid: string[] = [];
  private money: RequiredFacts["money"] = { amuletCoin: false, happyHour: false, payDay: 0 };
  constructor(battle: ShowdownBattle, wild: boolean, roster: readonly { id: string; side: "p1" | "p2"; initial: string }[], restore?: HeldTrackerSnapshot) {
    this.battle = battle; this.wild = wild;
    if (restore) {
      this.events = copy(restore.events); this.invalid = [...restore.invalid]; this.money = { ...restore.money };
      // Position arrays follow the engine's switched team. They only locate restored objects; the sealed
      // logical roster order remains part of the facts/pair identity, independent of that physical order.
      for (const member of restore.members) {
        const sideIndex = member.side === "p1" ? 0 : 1;
        const position = restore.positions[sideIndex]?.indexOf(member.id) ?? -1;
        const pokemon = battle.sides[sideIndex]?.pokemon[position];
        if (!pokemon) throw new Error("held-checkpoint-object-binding-missing");
        this.bind(pokemon, member);
      }
    } else {
      for (const entry of roster) {
        const side = battle.sides[entry.side === "p1" ? 0 : 1];
        // This one creation-time match is against the app-supplied immutable set, before switches/Illusion.
        const pokemon = side?.pokemon.find((p: ShowdownPokemon) => p.set.name === entry.id);
        if (!pokemon || pokemon.item !== entry.initial || this.byId.has(entry.id)) throw new Error("held-initial-object-binding-mismatch");
        this.bind(pokemon, { ...entry, current: entry.initial, recovery: entry.initial, recycle: "" });
      }
    }
    if (this.cells.size !== battle.sides.reduce((n: number, side: { pokemon: unknown[] }) => n + side.pokemon.length, 0)) throw new Error("held-roster-incomplete");
  }
  private fail(reason: string): void { if (!this.invalid.includes(reason) && this.invalid.length < 128) this.invalid.push(reason); }
  private state(cell: Cell): HeldValues { return { current: cell.current, recovery: cell.recovery, recycle: cell.recycle }; }
  private record(cell: Cell, reason: HeldReason, after: HeldValues, sourceId: string | null = null): void {
    if (this.events.length >= 100000) { this.fail("held-event-capacity"); return; }
    this.events.push({ ordinal: this.events.length + 1, id: cell.id, side: cell.side, sourceId, reason, before: this.state(cell), after: { ...after } });
    Object.assign(cell, after);
  }
  private effect(): string { return String(this.battle.effect?.id ?? ""); }
  private bind(pokemon: ShowdownPokemon, member: HeldMemberFact): void {
    if (this.cells.has(pokemon) || this.byId.has(member.id)) throw new Error("held-duplicate-object-binding");
    const cell: Cell = { ...member, pokemon };
    if (pokemon.item !== cell.current || pokemon.lastItem !== cell.recycle) throw new Error("held-restored-engine-state-mismatch");
    this.cells.set(pokemon, cell); this.byId.set(cell.id, cell);
    let actualItem: string = pokemon.item, actualRecycle: string = pokemon.lastItem;
    Object.defineProperty(pokemon, "item", { enumerable: true, configurable: false,
      get: () => actualItem,
      set: (next: unknown) => {
        if (!itemId(next)) { this.fail("held-invalid-engine-item"); throw new Error("invalid engine held item"); }
        if (next !== actualItem) this.itemChanged(cell, next);
        actualItem = next;
      },
    });
    Object.defineProperty(pokemon, "lastItem", { enumerable: true, configurable: false,
      get: () => actualRecycle,
      set: (next: unknown) => {
        if (!itemId(next)) { this.fail("held-invalid-engine-recycle"); throw new Error("invalid engine recycle item"); }
        const method = this.calls.at(-1), effect = this.effect();
        const consumption = !!method && method.pokemon === pokemon && ["eatItem", "useItem"].includes(method.method)
          || ["fling", "naturalgift"].includes(effect);
        if (next !== actualRecycle && !consumption && !["recycle", "harvest"].includes(effect)) {
          if (!next) this.record(cell, "clear-recycle", { ...this.state(cell), recycle: "" });
          else this.fail(`unhandled-recycle:${effect}`);
        }
        actualRecycle = next;
      },
    });
    for (const method of ["eatItem", "useItem", "takeItem", "setItem"] as const) {
      const original = pokemon[method];
      if (typeof original !== "function") throw new Error(`held-primitive-missing:${method}`);
      Object.defineProperty(pokemon, method, { enumerable: false, configurable: false, value: (...args: unknown[]) => {
        const before = this.state(cell), effect = this.effect();
        const source = args[method === "setItem" || method === "eatItem" ? 1 : 0];
        this.calls.push({ pokemon, method, source: source && typeof source === "object" ? source : null });
        try {
          const result: unknown = original.apply(pokemon, args);
          if (method === "takeItem" && result && before.current) {
            if (this.taken.length >= 4096) this.fail("held-transfer-capacity");
            else this.taken.push({ pokemon, item: before.current, recovery: before.recovery, effect, move: this.battle.activeMove ?? null, turn: this.battle.turn, used: false });
          }
          return result;
        } finally { this.calls.pop(); }
      } });
    }
  }
  private itemChanged(cell: Cell, next: string): void {
    const active = this.calls.at(-1), method = active && active.pokemon === cell.pokemon ? active.method : "", effect = this.effect();
    const before = this.state(cell);
    const sourceId = this.cells.get(active?.source ?? this.battle.activePokemon)?.id ?? null;
    if (!next) {
      if (["eatItem", "useItem"].includes(method) || effect === "airballoon" || method === "setItem" && ["fling", "naturalgift"].includes(effect)) {
        const recyclable = effect !== "airballoon";
        this.record(cell, recyclable ? "consume" : "consume-no-recycle", { current: "", recovery: before.current === before.recovery ? "" : before.recovery, recycle: recyclable ? before.current : before.recycle }, sourceId);
      } else if (method === "takeItem" && removal.has(effect)) {
        const permanent = ["incinerate", "bugbite", "pluck"].includes(effect);
        this.record(cell, permanent ? "permanent-loss" : "temporary-remove", { ...before, current: "", ...(permanent && before.current === before.recovery ? { recovery: "" } : {}) }, sourceId);
      } else { this.fail(`unhandled-held-remove:${method}:${effect}`); this.record(cell, "temporary-remove", { ...before, current: "" }); }
      return;
    }
    if (method === "setItem" && ["recycle", "harvest"].includes(effect) && !before.current && before.recycle === next) {
      this.record(cell, "recycle", { current: next, recovery: this.wild && !before.recovery ? next : before.recovery, recycle: "" });
      return;
    }
    if (transfer.has(effect)) {
      const donor = [...this.taken].reverse().find(t => !t.used && t.pokemon !== cell.pokemon && t.item === next && t.effect === effect && t.turn === this.battle.turn && t.move === (this.battle.activeMove ?? null));
      if (donor) {
        donor.used = true;
        const other = this.cells.get(donor.pokemon)!;
        const permanent = this.wild && cell.side === "p1" && other.side === "p2" && !before.recovery && donor.item === donor.recovery;
        if (permanent && !["trick", "switcheroo"].includes(effect)) this.record(other, "transfer-release", { ...this.state(other), recovery: "" }, cell.id);
        this.record(cell, permanent ? "permanent-gain" : "temporary-receive", { current: next, recovery: permanent ? next : before.recovery, recycle: before.recycle }, other.id);
        return;
      }
      // The pinned engine restores a prior take on an unsuccessful transfer. No I change happened yet.
      if (this.taken.some(t => t.pokemon === cell.pokemon && t.item === next && t.effect === effect)) {
        this.record(cell, "temporary-receive", { ...before, current: next }); return;
      }
    }
    this.fail(`unhandled-held-receive:${method}:${effect}`);
    this.record(cell, "temporary-receive", { ...before, current: next });
  }
  /** Called from the actual format hook, with the actual entering object. Item effectiveness is irrelevant. */
  entered(pokemon: ShowdownPokemon): void {
    const cell = this.cells.get(pokemon);
    if (!cell) { this.fail("unbound-entering-member"); return; }
    if (cell.side === "p1" && ["amuletcoin", "luckincense"].includes(cell.initial)) this.money.amuletCoin = true;
  }
  moneyMove(pokemon: ShowdownPokemon, kind: "payday" | "happyhour"): void {
    const cell = this.cells.get(pokemon);
    if (!cell) { this.fail("unbound-money-member"); return; }
    if (cell.side !== "p1") return;
    if (kind === "happyhour") this.money.happyHour = true;
    else {
      const next = this.money.payDay + 5 * pokemon.level;
      if (!Number.isSafeInteger(next) || next < 0) this.fail("money-accumulation-overflow"); else this.money.payDay = next;
    }
  }
  private check(): void {
    for (const cell of this.cells.values()) if (cell.pokemon.item !== cell.current || cell.pokemon.lastItem !== cell.recycle) this.fail("held-engine-state-diverged");
    if (this.calls.length) this.fail("held-checkpoint-inside-primitive");
  }
  boundary(): void { this.taken.length = 0; }
  snapshot(): HeldTrackerSnapshot {
    this.check();
    return { members: [...this.cells.values()].map(({ pokemon: _p, ...member }) => ({ ...member })), events: copy(this.events), invalid: [...this.invalid],
      positions: this.battle.sides.map((side: { pokemon: ShowdownPokemon[] }) => side.pokemon.map(p => {
        const cell = this.cells.get(p); if (!cell) throw new Error("held-checkpoint-unbound-object"); return cell.id;
      })), money: { ...this.money } };
  }
  facts(binding: HeldBinding): RequiredFacts {
    if (!this.battle.ended) throw new Error("required-settlement-driver-not-ended");
    const state = this.snapshot();
    if (state.invalid.length) throw new Error(`required-held-facts-unavailable: ${state.invalid.join(",")}`);
    return { version: 1, binding: { ...binding }, coverage: "complete", members: state.members, events: state.events, money: state.money };
  }
}
