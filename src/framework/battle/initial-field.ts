/** RPG-only defaults and per-use environment effects. Never patch the shared Dex or upstream runtime. */
import { ENVIRONMENT, WEATHER, TERRAIN, normalizeInitialField } from '../rules/initial-field';
import type { InitialField } from '../rules/initial-field';
import type { ShowdownBattle, ShowdownPokemon } from './showdown-types';

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
export function startInitialField(b: ShowdownBattle): void {
  const c = config(b); if (!c) return;
  attachInitialField(b);
  if (WEATHER[c.weather]) weather(b, WEATHER[c.weather], true);
  if (TERRAIN[c.terrain]) terrain(b, TERRAIN[c.terrain], true);
}

/** Bind only canonical data after onBegin/setPlayer, before team choices. */
export function bindInitialField(b: ShowdownBattle, raw: unknown): void {
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
export function attachInitialField(b: ShowdownBattle): void {
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
      terrain(b, id, true); b.eachEvent('TerrainChange'); b.eachEvent('TerrainChange');
    }
    return result;
  } });
}

/** Native serialization cannot carry callback functions. Filter exactly our registrations, synchronously. */
export function snapshotInitialField<T>(b: ShowdownBattle, serialize: () => T): T {
  const r = runtimes.get(b); if (!r) return serialize();
  const original = b.events, retained: Record<string, unknown[]> = {};
  for (const [name, entries] of Object.entries(original ?? {})) {
    const keep = (entries as object[]).filter(row => !r.hooks.has(row)); if (keep.length) retained[name] = keep;
  }
  b.events = Object.keys(retained).length ? retained : null;
  try { return serialize(); } finally { b.events = original; }
}
