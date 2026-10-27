/**
 * A scripted stand-in for the battle engine, behind the same BattleDriver seam as Pokemon Showdown. It plays back a
 * script (one entry per turn: the event lines, who loses HP, whether the battle ends) and answers the session's
 * queries from the teams it was given. It contains NO battle rules: its only job is to prove that the session, the
 * ledger, the growth coordination and the game application work against the seam and not against Showdown.
 * Singles only. Failure injection (a throwing operation, a failing checkpoint restore) is built in.
 */
import type {
  BattleDriver, BattleDriverFactory, DriverCheckpoint, GatewayMessage, GatewayOptions, GrowthApplication, GrowthOutcome, MemberState, SlotSpec, StateRecord, Unsequenced,
} from "../battle/driver";
import type { BattleEvent } from "../battle/protocol";

export interface ScriptedTurn {
  /** Raw engine lines, e.g. "|move|p1a: A-0001|Tackle|p2a: W1-1", "|-damage|p2a: W1-1|0 fnt", "|faint|p2a: W1-1". */
  events: string[];
  /** HP lost per member id when the turn resolves (negative = healed); a member at 0 is fainted. */
  damage?: Record<string, number>;
  /** Present when the turn ends the battle. */
  end?: { winner: string | null; reason: string; outcome?: Record<string, unknown> };
}

export interface ScriptedBattle {
  turns: ScriptedTurn[];
  /** Maximum HP per member id (the driver has no stat model; by default a member's max HP is the HP it was seeded with). */
  maxhp?: Record<string, number>;
}

type Op = "choose" | "act" | "cancel" | "refreshRequests" | "applyGrowth" | "readState";
interface Injection { op: Op; times: number; error: Error; afterEffect: boolean }

interface Mon { id: string; species: string; level: number; hp: number; maxhp: number; fainted: boolean; status: string; moves: string[]; pp: Record<string, number> }
interface State {
  teams: Record<string, Mon[]>;
  active: Record<string, number>;
  turn: number;
  next: number; // next scripted turn
  seq: number;
  closed: boolean;
  queue: GatewayMessage[];
  pending: Record<string, Record<string, unknown> | null>;
  chosen: Record<string, string | null>;
  wild: boolean;
}

const parse = (raw: string): BattleEvent => { const parts = raw.slice(1).split("|"); return { type: parts[0] ?? "", args: parts.slice(1), raw }; };
const sideOf = (id: string): string => id;

export interface ScriptedFactory extends BattleDriverFactory {
  readonly drivers: ScriptedDriver[];
  /** Make the next `times` calls of `op` throw (after having had their effect when `afterEffect`). */
  failNext(op: Op, error?: Error, times?: number, afterEffect?: boolean): void;
  /** Make every checkpoint restore fail (a rollback that cannot roll back). */
  failRestore: Error | null;
}

export function createScriptedFactory(script: ScriptedBattle): ScriptedFactory {
  const injections: Injection[] = [];
  const checkpoints = new WeakMap<object, State>();
  const factory: ScriptedFactory = {
    drivers: [], failRestore: null,
    failNext(op, error = new Error(`injected ${op} failure`), times = 1, afterEffect = false) { injections.push({ op, times, error, afterEffect }); },
    async create(options: GatewayOptions) {
      const teams: Record<string, Mon[]> = {};
      for (const [i, player] of (options.players ?? []).entries()) {
        teams[`p${i + 1}`] = (player.team as { name: string; species: string; level?: number; moves: string[] }[]).map((set) => (
          { id: set.name, species: set.species, level: set.level ?? 50, hp: 1, maxhp: 1, fainted: false, status: "", moves: [...set.moves], pp: {} }));
      }
      const state: State = { teams, active: { p1: 0, p2: 0 }, turn: 1, next: 0, seq: 0, closed: false, queue: [], pending: { p1: null, p2: null }, chosen: { p1: null, p2: null }, wild: !!options.wild };
      const driver = new ScriptedDriver(state, script, injections, checkpoints, factory);
      // the opening: both leads enter (the session learns who is active from these lines)
      driver.emit({ kind: "events", events: ["p1", "p2"].map((s) => { const m = teams[s]![0]!; return parse(`|switch|${s}a: ${m.id}|${m.species}, L${m.level}|1/1`); }) });
      factory.drivers.push(driver);
      return driver;
    },
    async fromCheckpoint(token) {
      if (factory.failRestore) throw factory.failRestore;
      const saved = checkpoints.get(token as object);
      if (!saved) throw new Error("not a checkpoint of this factory");
      const driver = new ScriptedDriver(JSON.parse(JSON.stringify(saved)) as State, script, injections, checkpoints, factory);
      factory.drivers.push(driver);
      return driver;
    },
    async moveNames() { return (id: string): string => id.charAt(0).toUpperCase() + id.slice(1); },
  };
  return factory;
}

export class ScriptedDriver implements BattleDriver {
  readonly state: State;
  private readonly script: ScriptedBattle;
  private readonly injections: Injection[];
  private readonly checkpoints: WeakMap<object, State>;
  private readonly factory: ScriptedFactory;

  constructor(state: State, script: ScriptedBattle, injections: Injection[], checkpoints: WeakMap<object, State>, factory: ScriptedFactory) {
    this.state = state; this.script = script; this.injections = injections; this.checkpoints = checkpoints; this.factory = factory;
  }

  emit(message: Unsequenced): void {
    this.state.queue.push({ ...message, seq: this.state.seq++ } as GatewayMessage);
  }

  /** Throw an injected failure for `op`: before the operation's effect, or (afterEffect) after it. */
  private guard<T>(op: Op, run: () => T): T {
    const hit = this.injections.find((i) => i.op === op && i.times > 0);
    if (hit && !hit.afterEffect) { hit.times--; throw hit.error; }
    const value = run();
    if (hit && hit.afterEffect) { hit.times--; throw hit.error; }
    return value;
  }

  private request(side: string): Record<string, unknown> {
    const team = this.state.teams[side]!;
    return {
      rqid: this.state.turn,
      active: [{ moves: team[this.state.active[side]!]!.moves.map((id) => ({ move: id.charAt(0).toUpperCase() + id.slice(1), id, pp: 10, maxpp: 10, target: "normal", disabled: false })) }],
      side: { name: side, id: side, pokemon: team.map((m, i) => ({ ident: `${side}: ${m.id}`, details: `${m.species}, L${m.level}`, condition: m.fainted ? "0 fnt" : `${m.hp}/${m.maxhp}`, active: i === this.state.active[side] })) },
    };
  }

  private issueRequests(): GatewayMessage[] {
    const out: GatewayMessage[] = [];
    this.state.queue = this.state.queue.filter((m) => m.kind !== "request");
    if (this.state.closed) return out;
    for (const side of ["p1", "p2"]) {
      const request = this.request(side);
      this.state.pending[side] = request; this.state.chosen[side] = null;
      this.emit({ kind: "request", side, request });
      out.push(this.state.queue[this.state.queue.length - 1]!);
    }
    return out;
  }

  private resolveIfReady(): void {
    if (!this.state.chosen["p1"] || !this.state.chosen["p2"]) return;
    const turn = this.script.turns[this.state.next++];
    if (!turn) throw new Error(`the script has no turn ${this.state.next}`);
    this.emit({ kind: "events", events: turn.events.map(parse) });
    for (const [id, lost] of Object.entries(turn.damage ?? {})) {
      for (const team of Object.values(this.state.teams)) { const m = team.find((x) => x.id === id); if (m) { m.hp = Math.min(m.maxhp, Math.max(0, m.hp - lost)); m.fainted = m.hp === 0; } }
    }
    this.state.pending = { p1: null, p2: null }; this.state.chosen = { p1: null, p2: null };
    this.state.turn++;
    if (turn.end) {
      this.state.closed = true;
      this.emit({ kind: "end", winner: turn.end.winner, turn: this.state.turn - 1, reason: turn.end.reason, ...(turn.end.outcome ? { outcome: turn.end.outcome } : {}) });
    } else this.issueRequests();
  }

  async choose(side: string, choice: string): Promise<boolean> {
    return this.guard("choose", () => {
      if (choice.startsWith("team ")) return true;
      if (!this.state.pending[side] || this.state.chosen[side]) { this.emit({ kind: "error", side, message: "choice rejected by engine", choice }); return false; }
      this.state.chosen[side] = choice;
      this.resolveIfReady();
      return true;
    });
  }

  async act(side: string, payload: SlotSpec): Promise<boolean> {
    return this.guard("act", () => {
      if (!this.state.pending[side] || this.state.chosen[side]) { this.emit({ kind: "error", side, message: "no move request pending", payload }); return false; }
      this.state.chosen[side] = `action:${String(payload.kind)}`;
      this.resolveIfReady();
      return true;
    });
  }

  async chooseSlots(): Promise<boolean> { throw new Error("the scripted driver is singles only"); }

  async cancel(side: string): Promise<void> {
    this.guard("cancel", () => { this.state.chosen[side] = null; });
  }

  query(_side: string, _what: string): { allowed: boolean; reason?: string } { return { allowed: true }; }

  readState(side: string): MemberState[] {
    return this.guard("readState", () => (this.state.teams[side] ?? []).map((m, i): MemberState => ({
      id: m.id, hp: m.hp, maxhp: m.maxhp, level: m.level, fainted: m.fainted, status: m.status, statusCount: 0, pp: { ...m.pp },
      stats: { hp: m.maxhp, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, active: i === this.state.active[sideOf(side)], confused: false, boosts: {},
    })));
  }

  seedState(side: string, records: StateRecord[]): void {
    for (const r of records) {
      const m = this.state.teams[side]?.find((x) => x.id === r.id);
      if (!m) continue;
      m.hp = r.hp; m.maxhp = this.script.maxhp?.[r.id] ?? Math.max(m.maxhp, r.hp); m.fainted = r.hp <= 0; m.status = r.status ?? "";
      for (const mv of r.moves ?? []) m.pp[mv.id] = mv.pp;
    }
  }

  applyGrowth(side: string, id: string, change: GrowthApplication): GrowthOutcome {
    return this.guard("applyGrowth", () => {
      const m = this.state.teams[side]?.find((x) => x.id === id);
      if (!m) throw new Error(`unknown member ${side}:${id}`);
      const before = { level: m.level, maxhp: m.maxhp, hp: m.hp };
      m.level = change.level; // no stat model here: scripts use growth that does not change HP
      return { before, after: { level: m.level, maxhp: m.maxhp, hp: m.hp }, stats: { hp: m.maxhp, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } };
    });
  }

  moveInfo(nameOrId: string): { id: string; name: string; pp: number } {
    const id = nameOrId.toLowerCase().replace(/[^a-z0-9]/g, "");
    return { id, name: id.charAt(0).toUpperCase() + id.slice(1), pp: 10 };
  }

  refreshRequests(): GatewayMessage[] { return this.guard("refreshRequests", () => this.issueRequests()); }

  activeId(side: string, slot = 0): string | null {
    const team = this.state.teams[side];
    return team && slot === 0 ? (team[this.state.active[side]!]?.id ?? null) : null;
  }

  awaitingChoice(side: string): Record<string, unknown> | null {
    const request = this.state.pending[side];
    return request && !this.state.chosen[side] ? (JSON.parse(JSON.stringify(request)) as Record<string, unknown>) : null;
  }

  drain(): GatewayMessage[] { return this.state.queue.splice(0); }
  discardQueued(): void { this.state.queue.length = 0; }

  checkpoint(): DriverCheckpoint {
    const token = Object.freeze({});
    this.checkpoints.set(token, JSON.parse(JSON.stringify(this.state)) as State);
    return token as DriverCheckpoint;
  }

  /** For tests: the factory this driver came from. */
  get owner(): ScriptedFactory { return this.factory; }
}
