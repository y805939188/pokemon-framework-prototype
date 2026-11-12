/**
 * Showdown "custom-formats" extension (officially supported: dist/config/custom-formats.js is merged into the format
 * list). Adds `[Gen 8] RPG Custom Game` (and a doubles variant): Gen 8 Custom Game plus one engine event, `RpgAction`,
 * that resolves non-move actions inside the turn queue. Built as its OWN self-contained CommonJS bundle
 * (js/engine/build/custom-formats.cjs) and staged into the engine by scripts/build-showdown.sh; no Showdown source is
 * modified. It runs inside Showdown, so it may only depend on plain rules code (bundled in), never on the gateway.
 */
import { HEAL_ITEMS, REVIVE_ITEMS, STAT_ITEMS, STATUS_ITEMS, PP_ITEMS, ESCAPE_ITEMS, ppRecovery, captureNumbers, escapeRate, healRequest, rollCapture } from "../rules/rules";
import type { ShowdownBattle, ShowdownPokemon } from "./showdown-types";
import type { FormatObserver, FormatObservation } from "../rules/battle-evidence";
import type { BattleActor, BattleDisplaySnapshot } from "../rules/battle-evidence";
import { obedienceEligible, obedienceLevelLimit } from "../rules/obedience";
import { own } from "../rules/own";
import type { HeldRuntimeObserver } from "../rules/held-facts";

/** RPG-only defaults and per-use environment effects. Never patch the shared Dex or upstream runtime. */
import { ENVIRONMENT, WEATHER, TERRAIN, normalizeInitialField } from '../rules/initial-field';
import type { InitialField } from '../rules/initial-field';

type Runtime = { config: InitialField; hooks: Set<object> };
const runtimes = new WeakMap<object, Runtime>();
const primal = new Set(['desolateland', 'primordialsea', 'deltastream']);
const ordinary = new Set(['sunnyday', 'raindance', 'sandstorm', 'hail']);
const definitions = new WeakMap<object, object>();
const pending = new WeakMap<object, Map<object, Record<string, unknown>>>();
const completing = new WeakSet<object>();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function config(b: ShowdownBattle): InitialField | undefined { return b.rpg?.initialField; }
function announceWeather(b: ShowdownBattle, id: string): void { b.add('-weather', b.dex.conditions.get(id).name); }
function announceTerrain(b: ShowdownBattle, id: string): void { b.add('-fieldstart', 'move: ' + b.dex.moves.get(id).name); }
function weather(b: ShowdownBattle, id: string, announce: boolean): void {
  b.field.weather = id; b.field.weatherState = b.initEffectState({ id });
  if (id && announce) announceWeather(b, id);
}
function terrain(b: ShowdownBattle, id: string, announce: boolean): void {
  b.field.terrain = id; b.field.terrainState = b.initEffectState({ id });
  if (id && announce) announceTerrain(b, id);
}

/** Called by the format after team choices, before first switchIn and entry abilities. */
function startInitialField(b: ShowdownBattle): void {
  const c = config(b); if (!c) return;
  attachInitialField(b);
  if (WEATHER[c.weather]) weather(b, WEATHER[c.weather], true);
  if (TERRAIN[c.terrain]) terrain(b, TERRAIN[c.terrain], true);
}

/** Bind only canonical data after onBegin/setPlayer, before team choices. */
function bindInitialField(b: ShowdownBattle, raw: unknown): void {
  const c = normalizeInitialField(raw); if (!c) return;
  if (!b.rpg || b.format.id !== 'gen8rpgcustomgame') throw new Error('initial-field-requires-rpg-singles');
  b.rpg.initialField = c;
}

function environmentMove(this: ShowdownBattle, move: ShowdownPokemon): void {
  const c = config(this);
  if (!c || c.environment === 'none' || this.field.terrain) return;
  const [type, called, effect] = ENVIRONMENT[c.environment];
  if (move.id === 'naturepower') {
    move.onTryHit = function(this: ShowdownBattle, target: ShowdownPokemon, user: ShowdownPokemon) {
      this.actions.useMove(this.dex.moves.get(called).exists ? called : 'triattack', user, { target }); return null;
    };
  } else if (move.id === 'camouflage') {
    move.onHit = function(this: ShowdownBattle, target: ShowdownPokemon) {
      const selected = this.dex.types.get(type).exists ? type : 'Normal';
      if (target.getTypes().join() === selected || !target.setType(selected)) return false;
      this.add('-start', target, 'typechange', selected); return undefined;
    };
  } else if (move.id === 'secretpower') {
    const secondary = { chance: 30, ...(['atk','spe','accuracy','def'].includes(effect) ? { boosts: { [effect]: -1 } }
      : effect === 'flinch' ? { volatileStatus: 'flinch' } : { status: effect }) };
    definitions.set(move, secondary); move.secondaries = [secondary];
  }
}
function secondaryHit(this: ShowdownBattle, values: Record<string, unknown>[], target: ShowdownPokemon, _source: ShowdownPokemon, move: ShowdownPokemon): unknown {
  if (completing.has(move)) return values;
  const definition = definitions.get(move); if (!definition) return values;
  // A substitute can turn the target into null/Battle before this callback. A callback alone is not a body hit.
  if (target?.hp > 0 && this.getAllPokemon().includes(target) && move.secondaries?.includes(definition)) {
    let targets = pending.get(move); if (!targets) { targets = new Map(); pending.set(move, targets); }
    targets.set(target, copy(definition) as Record<string, unknown>);
  }
  return values.filter(value => value !== definition);
}
function secondaryEnd(this: ShowdownBattle, target: ShowdownPokemon, source: ShowdownPokemon, move: ShowdownPokemon): void {
  const targets = pending.get(move), effect = targets?.get(target);
  if (!effect) return;
  targets!.delete(target); // consume before any reentrant native callback
  if (!target?.hp || !this.getAllPokemon().includes(target) || this.suppressingSecondaries()) return;
  const view = { ...move, multihitType: undefined, secondaries: [effect] };
  completing.add(view);
  try { this.actions.secondaries([target], source, view, view, false); }
  finally { completing.delete(view); }
}

/** Reconstruct nonserialized hooks on restore. Does not replay defaults, opening or entry abilities. */
function attachInitialField(b: ShowdownBattle): void {
  if (runtimes.has(b)) return;
  const c = normalizeInitialField(config(b)); if (!c) return;
  b.rpg.initialField = c;
  const runtime: Runtime = { config: c, hooks: new Set() }; runtimes.set(b, runtime);
  const on = (name: string, priority: number, callback: unknown) => {
    b.onEvent(name, b.format, priority, callback);
    runtime.hooks.add(b.events['on' + name].at(-1));
  };
  on('SetWeather', 1, function(this: ShowdownBattle, _target: unknown, _source: unknown, next: ShowdownPokemon) {
    if (primal.has(this.field.weather) && ordinary.has(next.id)) return false;
    return undefined;
  });
  if (c.environment !== 'none') {
    on('ModifyMove', 1, environmentMove);
    on('ModifySecondaries', -100, secondaryHit);
    on('AfterMoveSecondary', -100, secondaryEnd);
    on('AfterMove', -100, function(_target: unknown, _source: unknown, move: object) { definitions.delete(move); pending.delete(move); });
  }
  const field = b.field, clearWeather = field.clearWeather, clearTerrain = field.clearTerrain;
  Object.defineProperty(field, 'clearWeather', { configurable: true, value: function(this: ShowdownPokemon) {
    const expired = this.weatherState.duration === 0;
    const result = clearWeather.call(this);
    const id = WEATHER[c.weather];
    if (result && !this.weather && id) {
      weather(b, id, true); const restored = this.weatherState;
      b.eachEvent('WeatherChange');
      if (expired && this.weather === id && this.weatherState === restored) b.singleEvent('FieldResidual', b.dex.conditions.get(id), restored, this);
    }
    return result;
  } });
  Object.defineProperty(field, 'clearTerrain', { configurable: true, value: function(this: ShowdownPokemon) {
    const expired = this.terrainState.duration === 0;
    const result = clearTerrain.call(this), id = TERRAIN[c.terrain];
    if (result && expired && !this.terrain && id) {
      // Native clear already notified the empty field; notify the restored default only once.
      terrain(b, id, true); b.eachEvent('TerrainChange');
    }
    return result;
  } });
}

/** Native serialization cannot carry callback functions. Filter exactly our registrations, synchronously. */
function snapshotInitialField<T>(b: ShowdownBattle, serialize: () => T): T {
  const r = runtimes.get(b); if (!r) return serialize();
  const original = b.events, retained: Record<string, unknown[]> = {};
  for (const [name, entries] of Object.entries(original ?? {})) {
    const keep = (entries as object[]).filter(row => !r.hooks.has(row)); if (keep.length) retained[name] = keep;
  }
  b.events = Object.keys(retained).length ? retained : null;
  try { return serialize(); } finally { b.events = original; }
}

export const initialFields = { bind: bindInitialField, attach: attachInitialField, snapshot: snapshotInitialField };

/** Private actual-battle hooks. No JSON field, save setting or public log can install one. */
export const settlements = new WeakMap<object, HeldRuntimeObserver>();

interface Payload { kind: string; item?: string; target?: string; moveSlot?: number; ball?: string; catchRate?: number; ctx?: Record<string, unknown> }

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
  if (Object.hasOwn(PP_ITEMS, item)) {
    if (!target || target.fainted || target.hp <= 0) { emit(battle, "item", side.id, item, payload.target || "-", "noeffect"); return; }
    const gains = ppRecovery(item, target.baseMoveSlots, payload.moveSlot);
    if (!gains.some(n => n > 0)) { emit(battle, "item", side.id, item, target.name, "noeffect"); return; }
    gains.forEach((gain, index) => {
      if (!gain) return;
      const permanent = target.baseMoveSlots[index]; permanent.pp += gain;
      // WP20: an active copy is updated only for the same move and outside Transform.
      const active = target.moveSlots[index];
      if (target.isActive && !target.transformed && active?.id === permanent.id) active.pp = permanent.pp;
    });
    emit(battle, "item", side.id, item, target.name, "ok");
    return;
  }
  if (ESCAPE_ITEMS.includes(item)) {
    if (!battle.rpg.wild || battle.rpg.noRun || target !== user || user.fainted || user.hp <= 0) {
      emit(battle, "item", side.id, item, payload.target || "-", "noeffect"); return;
    }
    emit(battle, "item", side.id, item, user.name, "ok");
    emit(battle, "run", side.id, "ok", "item", battle.rpg.attempts[side.id] || 0);
    finish(battle, { kind: "run", side: side.id });
    return;
  }
  const revive = REVIVE_ITEMS[item];
  if (revive) {
    // A revive is not Pokemon.heal(): the native heal API deliberately rejects zero HP.
    if (!target || !target.fainted || target.hp !== 0) { emit(battle, "item", side.id, item, payload.target || "-", "noeffect"); return; }
    target.fainted = false; target.faintQueued = false; target.subFainted = false;
    target.status = ""; target.statusState = { id: "", target };
    target.hp = revive.half ? Math.max(1, Math.floor(target.maxhp / 2)) : target.maxhp;
    side.pokemonLeft++;
    if (target.isActive) {
      battle.queue.addChoice({ choice: "instaswitch", pokemon: target, target });
      battle.add("-heal", target, target.getHealth);
    }
    emit(battle, "item", side.id, item, target.name, "ok", target.hp, target.hp, target.maxhp);
    return;
  }
  if (item === "fullrestore") {
    if (!target || target.fainted || target.hp <= 0) { emit(battle, "item", side.id, item, payload.target || "-", "noeffect"); return; }
    const confused = target.isActive && !!target.volatiles.confusion;
    if (target.hp === target.maxhp && !target.status && !confused) { emit(battle, "item", side.id, item, target.name, "noeffect"); return; }
    // WP28 full restore: actual max HP request when damaged, zero for a status-only cure. Never AI estimate 999.
    const request = target.hp < target.maxhp ? target.maxhp : 0;
    const healed = request ? target.heal(request) : 0;
    if (request && target.isActive) battle.add("-heal", target, target.getHealth);
    if (target.status) target.cureStatus(!target.isActive);
    if (confused) target.removeVolatile("confusion");
    emit(battle, "item", side.id, item, target.name, "ok", healed, target.hp, target.maxhp, request);
    return;
  }
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
  resolveEscape(battle, user, false);
}

function resolveEscape(battle: ShowdownBattle, user: ShowdownPokemon, replacement: boolean): void {
  const side = user.side;
  if (!battle.rpg.wild) { emit(battle, "run", side.id, "denied", "trainer"); return; }
  if (battle.rpg.noRun) { emit(battle, "run", side.id, "denied", "norun"); return; }
  if (!replacement && certainEscape(user)) {
    emit(battle, "run", side.id, "ok", "certain", battle.rpg.attempts[side.id] || 0);
    finish(battle, { kind: "run", side: side.id });
    return;
  }
  if (!replacement && (user.trapped || user.volatiles["partiallytrapped"] || user.volatiles["trapped"])) { emit(battle, "run", side.id, "denied", "trapped"); return; }
  const foes = foesOf(user);
  if (!foes.length) { emit(battle, "run", side.id, "denied", "nofoe"); return; }
  // attempts only count once the calculation is reached (WP41 7.2)
  const attempts = replacement ? (battle.rpg.attempts[side.id] || 0)
    : (battle.rpg.attempts[side.id] = (battle.rpg.attempts[side.id] || 0) + 1);
  const ownSpeed = user.storedStats.spe; // unmodified battle copy, not boosted/paralysed speed
  const foeSpeed = Math.max(...foes.map((f) => f.storedStats.spe as number));
  const rate = escapeRate(ownSpeed, foeSpeed, attempts);
  const ok = rate >= 256 || battle.random(256) < rate;
  emit(battle, "run", side.id, ok ? "ok" : "fail", rate, attempts);
  if (ok) finish(battle, { kind: "run", side: side.id });
}

/** WP41 replacement escape is immediate, outside the move queue; a refusal never consumes a foe action. */
export function runAfterFaint(battle: ShowdownBattle, sideId: string): boolean {
  const side = battle.sides.find((s: ShowdownPokemon) => s.id === sideId), user = side?.active[0];
  if (sideId !== 'p1' || battle.ended || !battle.rpg?.wild || side?.active.length !== 1
    || battle.requestState !== 'switch' || side.activeRequest?.forceSwitch?.[0] !== true || !user?.fainted
    || !side.pokemon.some((p: ShowdownPokemon) => !p.isActive && !p.fainted && p.hp > 0)) return false;
  resolveEscape(battle, user, true);
  return true;
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

/** Refresh native move-selection gates at execution time, after any faster opponent's effects. */
function obedienceCandidates(battle: ShowdownBattle, pokemon: ShowdownPokemon, original: ShowdownPokemon): ShowdownPokemon[] {
  for (const slot of pokemon.moveSlots) { slot.disabled = false; slot.disabledSource = ""; }
  battle.runEvent("DisableMove", pokemon);
  for (const slot of pokemon.moveSlots) {
    const active = battle.dex.getActiveMove(slot.id);
    battle.singleEvent("DisableMove", active, null, pokemon);
    if (active.flags.cantusetwice && pokemon.lastMove?.id === slot.id) pokemon.disableMove(slot.id);
  }
  return pokemon.moveSlots.filter((slot: ShowdownPokemon) => slot.id !== original.id && slot.pp > 0 && !slot.disabled);
}

/** Real WP40 branch selection. A replacement continues the same native runMove, not a nested action. */
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
      const candidates = obedienceCandidates(battle, pokemon, move);
      if (!candidates.length) {
        obedienceTrace(battle, "no-other-move", pokemon, move, { roll: second, b });
        obedienceMessage(battle, pokemon, "ignored", "no-other-move");
        return false;
      }
      const selected = candidates[obedienceRandom(battle, candidates.length)]!;
      const targetLoc = target ? pokemon.getLocOf(target) : 0;
      obedienceTrace(battle, "change", pokemon, move, { roll: second, b, newMove: selected.id, targetLoc });
      obedienceMessage(battle, pokemon, "change", selected.id);
      // runMove retains this ActiveMove object as both move and baseMove. Replace only that per-use
      // copy, preserving the queued priority, so native PP/BeforeMove/AfterMove run exactly once.
      const replacement = battle.dex.getActiveMove(selected.id);
      replacement.priority = move.priority;
      replacement.pranksterBoosted = move.pranksterBoosted;
      for (const key of Object.keys(move)) delete move[key];
      Object.assign(move, replacement, { rpgObedienceChanged: true });
      return;
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
  onBattleStart(this: ShowdownBattle): void {
    // The native start action resets pokemonLeft after Team Preview. Restore carried-faint
    // counts before any switch-in/entry effect, without a new KO or another HP/status/PP seed.
    for (const side of this.sides) side.pokemonLeft = side.pokemon.filter((p: ShowdownPokemon) => !p.fainted).length;
    // Native Zacian/Zamazenta BattleStart replaces the Iron Head slot and refills it.
    // WP21 §4.2: retain PP Ups, clamp the imported current PP to the new move's cap.
    // Only a witnessed permanent opening replacement receives the persistent identity.
    for (const side of this.sides) for (const p of side.pokemon) {
      const saved = p.rpgCrownedMove;
      if (saved) {
        const slot = p.baseMoveSlots[saved.index];
        if (slot?.id === saved.battleId && this.toID(p.set.moves[saved.index]) === "ironhead") {
          slot.rpgPermanentMoveId = "ironhead";
          slot.pp = Math.min(saved.pp, slot.maxpp);
        }
        delete p.rpgCrownedMove;
      }
    }
    startInitialField(this);
  },
  onModifyMove(this: ShowdownBattle, move: ShowdownPokemon, pokemon: ShowdownPokemon): void {
    const observer = settlements.get(this);
    if (!observer) return;
    if (move.id === "payday") {
      const prior = move.onHit, priorSub = move.onAfterSubDamage;
      let paid = false;
      move.onHit = function(this: ShowdownBattle, target: ShowdownPokemon, source: ShowdownPokemon, ...args: unknown[]) {
        const result = prior?.call(this, target, source, ...args);
        if (!paid && result !== false && result !== null) { paid = true; settlements.get(this)?.moneyMove(source, "payday"); }
        return result;
      };
      // Substitute bypasses onHit. Its actual damage hook shares the per-use latch with body hits, so
      // a successful hit is counted once without inferring success from protocol messages or RNG.
      move.onAfterSubDamage = function(this: ShowdownBattle, damage: number, target: ShowdownPokemon, source: ShowdownPokemon, effect: ShowdownPokemon) {
        priorSub?.call(this, damage, target, source, effect);
        if (!paid && damage > 0) { paid = true; settlements.get(this)?.moneyMove(source, "payday"); }
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
    // WP47-B: a wild user cannot steal the player's item. Knock Off is temporary
    // battle removal, so keep its native effect; held settlement preserves original ownership.
    if (this.rpg.wild && pokemon.side.id === "p2" && ["thief", "covet"].includes(move.id)) move.onAfterHit = undefined;
    // Fail an attempted exchange after the engine's ordinary PP deduction, not at BeforeMove.
    if (this.rpg.wild && pokemon.side.id === "p2" && ["trick", "switcheroo"].includes(move.id)) move.onTry = () => false;
  },
  // useMove still receives runMove's old lexical target. Resolve the replacement target before
  // native scripted-target callbacks; do not mutate the shared Dex or re-enter runMove.
  onModifyTargetPriority: 100,
  onModifyTarget(this: ShowdownBattle, relay: { target: ShowdownPokemon }, pokemon: ShowdownPokemon, _target: ShowdownPokemon, move: ShowdownPokemon): void {
    if (!move.rpgObedienceChanged) return;
    delete move.rpgObedienceChanged;
    relay.target = this.getRandomTarget(pokemon, move);
  },
  onBeforeMovePriority: 9.5,
  onBeforeMove(this: ShowdownBattle, pokemon: ShowdownPokemon, target: ShowdownPokemon, move: ShowdownPokemon): boolean | undefined {
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
    for (const side of this.sides) for (const p of side.pokemon) {
      const battleId = p.species.id === "zacian" && p.item === "rustedsword" ? "behemothblade"
        : p.species.id === "zamazenta" && p.item === "rustedshield" ? "behemothbash" : null;
      const index = p.baseMoveSlots.findIndex((slot: { id: string }) => slot.id === "ironhead");
      if (battleId && index >= 0) p.rpgCrownedMove = { index, battleId, pp: p.baseMoveSlots[index].pp };
    }
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
