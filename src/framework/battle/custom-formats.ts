/**
 * Showdown "custom-formats" extension (officially supported: dist/config/custom-formats.js is merged into the format
 * list). Adds `[Gen 8] RPG Custom Game` (and a doubles variant): Gen 8 Custom Game plus one engine event, `RpgAction`,
 * that resolves non-move actions inside the turn queue. Built as its OWN self-contained CommonJS bundle
 * (js/engine/build/custom-formats.cjs) and staged into the engine by scripts/build-showdown.sh; no Showdown source is
 * modified. It runs inside Showdown, so it may only depend on plain rules code (bundled in), never on the gateway.
 */
import { HEAL_ITEMS, STAT_ITEMS, STATUS_ITEMS, captureNumbers, escapeRate, healRequest, rollCapture } from "../rules/rules";
import type { ShowdownBattle, ShowdownPokemon } from "./showdown-types";
import type { FormatObserver, FormatObservation } from "../rules/battle-evidence";
import type { BattleActor, BattleDisplaySnapshot } from "../rules/battle-evidence";
import { obedienceEligible, obedienceLevelLimit } from "../rules/obedience";
import { own } from "../rules/own";
import type { HeldRuntimeObserver } from "../rules/held-facts";

/** Private actual-battle hooks. No JSON field, save setting or public log can install one. */
export const settlements = new WeakMap<object, HeldRuntimeObserver>();

interface Payload { kind: string; item?: string; target?: string; ball?: string; catchRate?: number; ctx?: Record<string, unknown> }

/** Pending actions live on the (serialized) battle object so snapshots carry them. */
function pendingFor(battle: ShowdownBattle, sideId: string, position: number): Payload | null {
  const rpg = battle.rpg;
  const key = `${sideId}:${position}`;
  const p = rpg && rpg.pending[key];
  if (rpg) delete rpg.pending[key];
  return p || null;
}

function emit(battle: ShowdownBattle, ...parts: unknown[]): void {
  battle.add("rpg", ...parts);
  if (parts[0] === "item" && parts[4] === "ok") {
    observe(battle, () => ({ kind: "item", target: actor(battle.getSide(parts[1]).pokemon.find((p: ShowdownPokemon) => p.name === parts[3])), item: String(parts[2]) }));
  }
}

function resolveItem(battle: ShowdownBattle, user: ShowdownPokemon, payload: Payload): void {
  const side = user.side;
  const item = payload.item as string;
  const target = side.pokemon.find((p: ShowdownPokemon) => p.name === payload.target);
  const spec = HEAL_ITEMS[item];
  const status = STATUS_ITEMS[item];
  const stat = STAT_ITEMS[item];
  if (target && (status || stat) && !spec) {
    if (target.fainted || target.hp <= 0) { emit(battle, "item", side.id, item, target.name, "noeffect"); return; }
    if (status) {
      const cures = status.cures === "all" ? !!target.status : status.cures.includes(target.status);
      const confused = status.confusion && target.isActive && !!target.volatiles["confusion"];
      if (!cures && !confused) { emit(battle, "item", side.id, item, target.name, "noeffect"); return; }
      if (cures) target.cureStatus(!target.isActive); // active: engine shows the cure; bench: silent
      if (confused) target.removeVolatile("confusion");
      emit(battle, "item", side.id, item, target.name, "ok");
      return;
    }
    // stat items need an active target (battle-only effect)
    if (!target.isActive) { emit(battle, "item", side.id, item, target.name, "noeffect"); return; }
    const applied = battle.boost(stat!.boosts, target, user, null, true);
    emit(battle, "item", side.id, item, target.name, applied ? "ok" : "noeffect");
    return;
  }
  if (!target || !spec) {
    emit(battle, "item", side.id, item, payload.target || "-", "invalid");
    return;
  }
  // Execution-time re-check (WP40 4.2 / WP28 3.5): fainted or already full => no effect.
  if (target.fainted || target.hp <= 0 || target.hp >= target.maxhp) {
    emit(battle, "item", side.id, item, target.name, "noeffect");
    return;
  }
  const request = healRequest(spec, target);
  const healed = target.heal(request); // actual = min(request, missing); no Heal Block etc.
  if (target.isActive) battle.add("-heal", target, target.getHealth);
  emit(battle, "item", side.id, item, target.name, "ok", healed, target.hp, target.maxhp);
}

/** Ending the engine battle is only a way to stop the queue; the business meaning is rpg.outcome. */
function finish(battle: ShowdownBattle, outcome: Record<string, unknown>): void {
  battle.rpg.outcome = outcome;
  battle.tie();
}

function foesOf(user: ShowdownPokemon): ShowdownPokemon[] {
  return user.side.foe.active.filter((p: ShowdownPokemon) => p && !p.fainted);
}

/**
 * Deterministic escape sources (WP41 7.1): Ghost type, an always-escape ability (Run Away), an always-escape
 * item (Smoke Ball). They come BEFORE any trapping check and do not count as an attempt.
 */
function certainEscape(user: ShowdownPokemon): boolean {
  return user.hasType("Ghost") || user.hasAbility("runaway") || user.hasItem("smokeball");
}

function resolveRun(battle: ShowdownBattle, user: ShowdownPokemon): void {
  const side = user.side;
  if (!battle.rpg.wild) { emit(battle, "run", side.id, "denied", "trainer"); return; }
  if (battle.rpg.noRun) { emit(battle, "run", side.id, "denied", "norun"); return; }
  if (certainEscape(user)) {
    emit(battle, "run", side.id, "ok", "certain", battle.rpg.attempts[side.id] || 0);
    finish(battle, { kind: "run", side: side.id });
    return;
  }
  if (user.trapped || user.volatiles["partiallytrapped"] || user.volatiles["trapped"]) { emit(battle, "run", side.id, "denied", "trapped"); return; }
  const foes = foesOf(user);
  if (!foes.length) { emit(battle, "run", side.id, "denied", "nofoe"); return; }
  // attempts only count once the calculation is reached (WP41 7.2)
  const attempts = (battle.rpg.attempts[side.id] = (battle.rpg.attempts[side.id] || 0) + 1);
  const ownSpeed = user.storedStats.spe; // unmodified battle copy, not boosted/paralysed speed
  const foeSpeed = Math.max(...foes.map((f) => f.storedStats.spe as number));
  const rate = escapeRate(ownSpeed, foeSpeed, attempts);
  const ok = rate >= 256 || battle.random(256) < rate;
  emit(battle, "run", side.id, ok ? "ok" : "fail", rate, attempts);
  if (ok) finish(battle, { kind: "run", side: side.id });
}

function resolveBall(battle: ShowdownBattle, user: ShowdownPokemon, payload: Payload): void {
  const side = user.side;
  const ball = payload.ball as string;
  if (!battle.rpg.wild) { emit(battle, "ball", side.id, ball, "-", "blocked"); return; } // trainer blocks the ball
  let target = side.foe.pokemon.find((p: ShowdownPokemon) => p.name === payload.target);
  if (!target) { emit(battle, "ball", side.id, ball, payload.target || "-", "notarget"); return; }
  if (target.fainted) { // WP38 2: redirect to a living companion ON THE FIELD (not the bench), else no target (ball already spent)
    target = side.foe.active.find((p: ShowdownPokemon) => p && !p.fainted && p !== target);
    if (!target) { emit(battle, "ball", side.id, ball, payload.target, "notarget"); return; }
  }
  const own = side.active.filter((p: ShowdownPokemon) => p && !p.fainted);
  const ctx = Object.assign({
    turn: battle.turn - 1, // rounds already completed
    targetLevel: target.level,
    targetTypes: target.getTypes(),
    targetBaseSpeed: target.species.baseStats.spe,
    weightHg: target.getWeight(),
    userMaxLevel: Math.max(...own.map((p: ShowdownPokemon) => p.level as number)),
    ultraBeast: !!(target.species.tags && target.species.tags.includes("Ultra Beast")),
  }, payload.ctx || {});
  const nums = captureNumbers({ ballId: ball, baseRate: payload.catchRate as number, maxHp: target.maxhp, hp: target.hp, status: target.status || "", ctx });
  const res = rollCapture(nums, ctx, (n) => battle.random(n));
  emit(battle, "ball", side.id, ball, target.name, res.shakes === 4 ? "caught" : "escaped", res.shakes, res.critical ? 1 : 0, nums.x, nums.y === null ? "-" : nums.y);
  if (res.shakes === 4) {
    finish(battle, {
      kind: "caught", side: side.id, target: target.name, ball,
      // what the game needs to take over: stable id + current persistent-relevant state
      mon: { id: target.name, species: target.species.name, level: target.level, hp: target.hp, maxhp: target.maxhp, status: target.status || "" },
    });
  }
}

const handlers: Record<string, (battle: ShowdownBattle, user: ShowdownPokemon, payload: Payload) => void> = {
  item: resolveItem,
  run: resolveRun,
  ball: resolveBall,
};

/** Non-serialized per-battle callbacks (engine objects are rebuilt on restore, hooks are re-attached by the gateway). */
export const hooks = new WeakMap<object, (e: unknown) => void>();
/** Optional companion observation. It never returns a relay value or throws into an engine action. */
export const observers = new WeakMap<object, FormatObserver>();
function actor(p: ShowdownPokemon): BattleActor {
  return { id: p.name, side: p.side.id, slot: p.position, level: p.level, hp: p.hp, active: !!p.isActive };
}
function display(p: ShowdownPokemon): BattleDisplaySnapshot | undefined {
  const shown = p.illusion || p;
  if (typeof shown.species?.name !== "string" || !shown.set || (shown.set.shiny !== undefined && typeof shown.set.shiny !== "boolean") || !["M", "F", ""].includes(shown.gender)) return undefined;
  // Pinned Showdown getUpdatedDetails reads set.shiny (absence is false), and hides these two internal form names.
  const battleSpecies = ["Greninja-Bond", "Rockruff-Dusk"].includes(shown.species.name) ? shown.species.baseSpecies : shown.species.name;
  if (typeof battleSpecies !== "string") return undefined;
  return { battleSpecies, gender: shown.gender === "M" ? 0 : shown.gender === "F" ? 1 : 2, shiny: !!shown.set.shiny };
}
function observe(b: ShowdownBattle, make: () => FormatObservation): void {
  const receiver = observers.get(b);
  if (!receiver) return;
  try { receiver.emit(make()); } catch { try { receiver.failed(); } catch { /* optional observation only */ } }
}
function hit(b: ShowdownBattle, domain: "body" | "substitute", loss: number, target: ShowdownPokemon, source: ShowdownPokemon, move: ShowdownPokemon): void {
  observe(b, () => ({ kind: "hit", domain, loss, target: actor(target), source: source ? actor(source) : null,
    move: move.id, hit: move.hit ?? 1, critical: !!move.moveHitData?.[target.getSlot()]?.crit }));
}

interface ObedienceRuntime {
  depth: number;
  draws: number;
  traceDropped: number;
  trace: Record<string, unknown>[];
}

function obedienceRuntime(battle: ShowdownBattle): ObedienceRuntime {
  const rpg = battle.rpg;
  if (!rpg.obedienceRuntime) rpg.obedienceRuntime = { depth: 0, draws: 0, traceDropped: 0, trace: [] };
  return rpg.obedienceRuntime as ObedienceRuntime;
}
function obedienceTrace(battle: ShowdownBattle, kind: string, pokemon: ShowdownPokemon, move: ShowdownPokemon, details: Record<string, unknown> = {}): void {
  const runtime = obedienceRuntime(battle);
  if (runtime.trace.length >= 256) { runtime.traceDropped++; return; }
  runtime.trace.push({ kind, turn: battle.turn, side: pokemon.side.id, memberId: pokemon.name, move: move.id, level: pokemon.level, ...details });
}
function obedienceRandom(battle: ShowdownBattle, n: number): number {
  obedienceRuntime(battle).draws++;
  return battle.random(n) as number;
}
function obedienceMessage(battle: ShowdownBattle, pokemon: ShowdownPokemon, result: string, detail: string | number): void {
  battle.add("rpg", "obedience", pokemon.side.id, pokemon.name, result, detail);
}

/** Real WP40 branch selection. Returning false is before deductPP; a nested selected move pays its own PP once. */
function checkObedience(battle: ShowdownBattle, pokemon: ShowdownPokemon, target: ShowdownPokemon, move: ShowdownPokemon): boolean | undefined {
  const control = battle.rpg?.obedience;
  if (!control || pokemon.side.id !== "p1") return;
  const runtime = obedienceRuntime(battle);
  if (runtime.depth > 0) { obedienceTrace(battle, "recursive", pokemon, move); return; }
  // Showdown external/called moves skip the ordinary status/obedience stage; Struggle deliberately does not.
  if (move.isExternal && move.id !== "struggle") { obedienceTrace(battle, "special-skip", pokemon, move, { draws: 0 }); return; }
  const locked = pokemon.getLockedMove();
  const owner: import("../rules/types").Owner | undefined = own(control.members, pokemon.name);
  if (!owner) throw new Error(`obedience-owner-context-missing:${pokemon.name}`);
  const limit = obedienceLevelLimit(control.badges);
  if (!obedienceEligible({ level: pokemon.level, owner, player: control.player, badges: control.badges,
    anyHighLevel: control.anyHighLevel, foreignHighLevel: control.foreignHighLevel, locked: !!locked })) {
    obedienceTrace(battle, "ineligible", pokemon, move, { limit, lockedMove: locked || null, draws: 0 });
    return;
  }
  const first = obedienceRandom(battle, 256);
  const a = Math.floor((pokemon.level + limit) * first / 256);
  obedienceTrace(battle, "eligible", pokemon, move, { limit, roll: first, a, draws: 1 });
  if (a < limit) return;
  runtime.depth = 1;
  try {
    if (pokemon.status === "slp" && move.sleepUsable) {
      obedienceTrace(battle, "sleep-usable-refusal", pokemon, move);
      obedienceMessage(battle, pokemon, "sleep", move.id);
      return false;
    }
    const second = obedienceRandom(battle, 256), b = Math.floor((pokemon.level + limit) * second / 256);
    if (b < limit) {
      const candidates = pokemon.moveSlots.filter((slot: ShowdownPokemon) => slot.id !== move.id && slot.pp > 0 && !slot.disabled);
      if (!candidates.length || pokemon.side.activeRequest?.wait) {
        obedienceTrace(battle, "no-other-move", pokemon, move, { roll: second, b });
        obedienceMessage(battle, pokemon, "ignored", "no-other-move");
        return false;
      }
      const selected = candidates[obedienceRandom(battle, candidates.length)]!;
      const targetLoc = target ? pokemon.getLocOf(target) : 0;
      obedienceTrace(battle, "change", pokemon, move, { roll: second, b, newMove: selected.id, targetLoc });
      obedienceMessage(battle, pokemon, "change", selected.id);
      battle.actions.runMove(selected.id, pokemon, targetLoc, {});
      return false;
    }
    const c = pokemon.level - limit, roll = obedienceRandom(battle, 256);
    if (roll < c && !pokemon.status) {
      const applied = !!pokemon.trySetStatus("slp", pokemon);
      obedienceTrace(battle, "self-sleep", pokemon, move, { roll, c, applied });
      if (applied) {
        obedienceMessage(battle, pokemon, "self-sleep", roll);
        return false;
      }
    }
    if (roll - c < c && pokemon.status !== "slp") {
      obedienceTrace(battle, "self-hit", pokemon, move, { roll, c });
      obedienceMessage(battle, pokemon, "self-hit", roll);
      battle.activeTarget = pokemon;
      const damage = battle.actions.getConfusionDamage(pokemon, 40);
      if (typeof damage !== "number") throw new Error("obedience confusion damage not dealt");
      const activeMove = { id: battle.toID("confused"), effectType: "Move", type: "???" };
      battle.damage(damage, pokemon, pokemon, activeMove);
      return false;
    }
    const refusal = obedienceRandom(battle, 4);
    obedienceTrace(battle, "refuse", pokemon, move, { roll, c, refusal });
    obedienceMessage(battle, pokemon, "refuse", refusal);
    return false;
  } finally {
    runtime.depth = 0;
  }
}

const rpgHandlers = {
  onModifyMove(this: ShowdownBattle, move: ShowdownPokemon, pokemon: ShowdownPokemon): void {
    const observer = settlements.get(this);
    if (!observer) return;
    if (move.id === "payday") {
      const prior = move.onHit;
      let paid = false;
      move.onHit = function(this: ShowdownBattle, target: ShowdownPokemon, source: ShowdownPokemon, ...args: unknown[]) {
        const result = prior?.call(this, target, source, ...args);
        if (!paid && result !== false && result !== null) { paid = true; settlements.get(this)?.moneyMove(source, "payday"); }
        return result;
      };
    } else if (move.id === "happyhour") {
      // Showdown's display-only move has no RPG consumer. Install its actual successful primary effect.
      const prior = move.onHitSide;
      move.onHitSide = function(this: ShowdownBattle, target: ShowdownPokemon, source: ShowdownPokemon) {
        const result = prior?.call(this, target, source);
        if (result === false || result === null) return result;
        settlements.get(this)?.moneyMove(source, "happyhour");
        return true;
      };
    }
    // WP47-B: a wild user cannot steal/remove the player's item; the damaging move itself still executes.
    if (this.rpg.wild && pokemon.side.id === "p2" && ["thief", "covet", "knockoff"].includes(move.id)) move.onAfterHit = undefined;
  },
  onBeforeMovePriority: 9.5,
  onBeforeMove(this: ShowdownBattle, pokemon: ShowdownPokemon, target: ShowdownPokemon, move: ShowdownPokemon): boolean | undefined {
    if (settlements.has(this) && this.rpg.wild && pokemon.side.id === "p2" && ["trick", "switcheroo"].includes(move.id)) return false;
    return checkObedience(this, pokemon, target, move);
  },
  onDamagingHitPriority: -100000,
  onDamagingHit(this: ShowdownBattle, loss: number, target: ShowdownPokemon, source: ShowdownPokemon, move: ShowdownPokemon): void { hit(this, "body", loss, target, source, move); },
  onAfterSubDamagePriority: -100000,
  onAfterSubDamage(this: ShowdownBattle, loss: number, target: ShowdownPokemon, source: ShowdownPokemon, move: ShowdownPokemon): void { hit(this, "substitute", loss, target, source, move); },
  onDamagePriority: -100000,
  onDamage(this: ShowdownBattle, amount: number, target: ShowdownPokemon, source: ShowdownPokemon, effect: ShowdownPokemon): void {
    observe(this, () => ({ kind: "before-loss", target: actor(target), source: source ? actor(source) : null, amount, effect: effect?.id ?? "", effectType: effect?.effectType ?? "" }));
  },
  onMoveAbortedPriority: -100000,
  onMoveAborted(this: ShowdownBattle, target: ShowdownPokemon): void { observe(this, () => ({ kind: "move-aborted", target: actor(target) })); },
  onTryHealPriority: -100000,
  onTryHeal(this: ShowdownBattle, _amount: number, target: ShowdownPokemon): void { observe(this, () => ({ kind: "healing", target: actor(target) })); },
  onSwitchInPriority: -100000,
  onSwitchIn(this: ShowdownBattle, target: ShowdownPokemon): void {
    settlements.get(this)?.entered(target);
    observe(this, () => ({ kind: "appearance", target: actor(target), details: String((target.illusion || target).details), display: display(target) }));
  },
  onUpdatePriority: -100000,
  onUpdate(this: ShowdownBattle, target: ShowdownPokemon): void {
    if (target.isActive) observe(this, () => ({ kind: "display", target: actor(target), details: String((target.illusion || target).details), display: display(target) }));
  },
  onFaint(this: ShowdownBattle, pokemon: ShowdownPokemon): void {
    // One opaque token per actual hook invocation binds the two sources. It is resolved to a plain key in gateway,
    // never persisted or sent through the public protocol; source ordinals alone do not prove this association.
    const faintToken = {};
    observe(this, () => ({ kind: "faint", target: actor(pokemon), opponents: pokemon.side.foe.active.filter(Boolean).map(actor), display: display(pokemon), faintToken }));
    const h = hooks.get(this);
    if (h) h({ event: "faint", side: pokemon.side.id, id: pokemon.name, faintToken });
  },
  onBegin(this: ShowdownBattle): void {
    this.rpg = { pending: {}, attempts: {} };
  },
  onRpgAction(this: ShowdownBattle, pokemon: ShowdownPokemon): void {
    const payload = pendingFor(this, pokemon.side.id, pokemon.position);
    if (!payload) return;
    const h = handlers[payload.kind];
    if (!h) {
      emit(this, "unknown", pokemon.side.id, payload.kind);
      return;
    }
    h(this, pokemon, payload);
  },
};
const common = {
  mod: "gen8",
  searchShow: false,
  debug: true,
  battle: { trunc: Math.trunc },
  ruleset: ["Team Preview", "Cancel Mod", "Max Team Size = 24", "Max Move Count = 24", "Max Level = 9999", "Default Level = 100"],
  ...rpgHandlers,
};

export const Formats = [
  { section: "RPG" }, // section header is its own list element
  { name: "[Gen 8] RPG Custom Game", ...common },
  { name: "[Gen 8] RPG Doubles Custom Game", gameType: "doubles", ...common },
];
