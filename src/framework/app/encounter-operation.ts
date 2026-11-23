import { prepareWildIndividual } from './wild-generation-preparation';
/** The ordinary completed-step consumer. Its caller retains the existing WorldOperation parent throughout. */
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { resolveConfig } from '../rules/config';
import { catalogOf, itemOf } from '../rules/item-catalog';
import { ordinaryEncounterOpportunity, checkEncounterTrigger, checkEncounterAllowance, ordinaryEncounterIsDouble } from '../rules/encounter-trigger';
import type { EncounterCounters } from '../rules/encounter-trigger';
import { selectOrdinaryEncounterType, selectEncounterCandidate } from '../rules/encounter-selection';
import type { FormalEncounterTables, EncounterLead } from '../rules/encounter-selection';
import { projectWorldBattleContext } from '../rules/world-battle-context';
import type { CapturedWorldBallFacts } from '../rules/world-battle-context';
import { ENVIRONMENT } from '../rules/initial-field';
import { own } from '../rules/own';
import { resolveSpecies } from '../flow/content-runtime';
import type { GameState } from '../rules/state';
import type { Content, Member, DexLookup } from '../rules/types';
import type { WorldBusinessFacts, WorldLocalState, EncounterRuntime } from '../rules/world-state';
import type { EncounterTypeId, WorldFact } from '../rules/world-data';
import type { WildGenerationSource } from '../rules/wild-generation';
import type { BattleStartRequest, CompletedWorldStep, OrdinaryEncounterHostPort, RandomPort } from './ports';
import { normalizeDexAppearance, planDexRecord, applyDexPatch } from '../rules/pokedex';
import type { WildFormRegistration } from '../rules/wild-member';

export interface PreparedWorldEncounter {
  readonly request: BattleStartRequest; readonly member: Member; readonly nextMemberOrdinal: string;
  readonly contentIdentity: string; readonly stateIdentity: string; readonly capture: CapturedWorldBallFacts;
  readonly mapId: number;
  readonly onBattleStartedStat?: 'rock_smash_battles';
  readonly formRegistrations?: readonly WildFormRegistration[];
}
/** Consume only the current generator's ordered snapshots; callers retain their original installation authority. */
export function planInitialWildRegistration(game: GameState, content: Content, prepared: PreparedWorldEncounter): { next?: GameState; prepared: PreparedWorldEncounter } {
  if (!prepared.formRegistrations?.length) return { prepared };
  if (semanticFingerprint(game) !== prepared.stateIdentity || semanticFingerprint(content) !== prepared.contentIdentity) throw Error('initial-wild-registration-stale');
  let dex = game.dex;
  for (const intent of prepared.formRegistrations) {
    const appearance = normalizeDexAppearance(content, intent);
    if (!appearance) throw Error('invalid-initial-wild-registration');
    const plan = planDexRecord(dex, { source: 'form-commit', appearance });
    if (plan.status !== 'ok') throw Error('invalid-initial-wild-registration');
    dex = applyDexPatch(dex, plan.patch);
  }
  if (semanticFingerprint(dex) === semanticFingerprint(game.dex)) return { prepared };
  const next = { ...clone(game), dex };
  return { next, prepared: { ...prepared, stateIdentity: semanticFingerprint(next) } };
}
export type OrdinaryEncounterResult = { readonly status: 'prepared'; readonly prepared: PreparedWorldEncounter }
  | { readonly status: 'no-encounter' | 'unsupported'; readonly reason: string };
interface PreparationOptions {
  read(): GameState; contentView(): { content: Content; dex?: DexLookup }; assertCurrent(actualContent?: Content): void;
  facts(): WorldBusinessFacts; random: RandomPort;
  tables(game: GameState, content: Content, mapId: number): FormalEncounterTables;
  local(): Readonly<WorldLocalState>; switchOn(id: number): boolean; now(): number; allowHeldItemSources: boolean;
}
interface Options extends PreparationOptions {
  host: OrdinaryEncounterHostPort; runtime(): Readonly<EncounterRuntime>; installRuntime(next: EncounterRuntime): void;
}
export interface FieldEncounterInput {
  readonly id: string; readonly mapId: number; readonly type: EncounterTypeId;
  readonly source: 'fishing' | 'sweet-scent' | 'rock-smash';
  readonly groundEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
  readonly facingEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
}
const normalized = (value: string): string => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Exact query falls back to version zero only when the requested record is absent. */
export function findWorldEncounterTables(content: Content, mapId: number, version: number): FormalEncounterTables {
  const records = content.world?.encounters?.tables;
  return clone(records?.find(record => record.mapId === mapId && record.version === version)?.types
    ?? records?.find(record => record.mapId === mapId && record.version === 0)?.types ?? {});
}
function booleanFact(fact: { status: string; value?: unknown }, label: string): boolean {
  if (!fact || fact.status !== 'value' || typeof fact.value !== 'boolean') throw Error(`${label}-unavailable`);
  return fact.value;
}

export function prepareOrdinaryEncounter(step: CompletedWorldStep, repelActiveAtStart: boolean, options: Options): OrdinaryEncounterResult {
  options.assertCurrent();
  const game = options.read(), view = options.contentView(); options.assertCurrent(view.content);
  const { content, dex } = view, config = resolveConfig(content.settings);
  if (!game.party.some(member => !member.isEgg && member.hp > 0)) return { status: 'no-encounter', reason: 'no-able-member' };
  const host = clone(options.host.read(step)); options.assertCurrent();
  const landAllowed = booleanFact(host.landAllowed, 'encounter-terrain'), disabled = booleanFact(host.encountersDisabled, 'encounter-switch'), debugControl = booleanFact(host.debugControl, 'encounter-debug-control');
  const facts = clone(options.facts()); options.assertCurrent();
  if (facts.mapId.status !== 'value' || facts.mapId.value !== step.mapId) return { status: 'unsupported', reason: 'encounter-business-map-mismatch' };
  if (facts.hour.status !== 'value' || !Number.isInteger(facts.hour.value) || facts.hour.value < 0 || facts.hour.value > 23) throw Error('encounter-hour-unavailable');
  const cycling = booleanFact(facts.cycling, 'encounter-cycling'), surfing = game.world.surfing;
  if (facts.weather.status !== 'value') throw Error('encounter-weather-unavailable');
  const tables = options.tables(game, content, step.mapId); options.assertCurrent();
  if (!ordinaryEncounterOpportunity(tables, { surfing, ice: step.ice, landAllowed })) return { status: 'no-encounter', reason: 'no-opportunity' };
  const type = selectOrdinaryEncounterType(tables, { surfing, landAllowed, hour: facts.hour.value });
  if (!type) return { status: 'no-encounter', reason: 'no-type' };
  const party: EncounterLead[] = game.party.map(member => ({ isEgg: member.isEgg, hp: member.hp, level: member.level, ability: member.ability,
    item: itemOf(catalogOf(content), member.item)?.battleId ?? member.item }));
  const random = (upperBound: number): number => { options.assertCurrent(); const value = options.random(upperBound); options.assertCurrent(); return value; };
  const runtime = options.runtime(), local = options.local();
  const trigger = checkEncounterTrigger({ type, table: tables[type], runtime, party, local, weatherCategory: facts.weather.value.category,
    moreAbilities: config.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS, disabled, debugControl, playerPresent: true, fromStep: true, cycling, repelActive: repelActiveAtStart }, random);
  options.assertCurrent(); options.installRuntime({ ...runtime, ...trigger.runtime });
  if (!trigger.triggered) return { status: 'no-encounter', reason: trigger.reason };
  return prepareCandidate({ id: step.id, mapId: step.mapId, type, source: 'step', groundEnvironment: host.groundEnvironment, facingEnvironment: { status: 'absent' } },
    { game, content, dex, facts, party, tables, random }, options,
    { repelActive: repelActiveAtStart, runtime: trigger.runtime, install: next => options.installRuntime({ ...options.runtime(), ...next }) });
}

/** Active producers have already passed their own R07/R11 gates; they skip step probability and allowance. */
export function prepareFieldEncounter(input: FieldEncounterInput, options: PreparationOptions): OrdinaryEncounterResult {
  options.assertCurrent();
  const game = options.read(), { content, dex } = options.contentView(); options.assertCurrent(content);
  if (!game.party.some(member => !member.isEgg && member.hp > 0)) return { status: 'no-encounter', reason: 'no-able-member' };
  const facts = clone(options.facts()); options.assertCurrent();
  if (facts.mapId.status !== 'value' || facts.mapId.value !== input.mapId) return { status: 'unsupported', reason: 'encounter-business-map-mismatch' };
  if (facts.hour.status !== 'value' || !Number.isInteger(facts.hour.value) || facts.hour.value < 0 || facts.hour.value > 23) throw Error('encounter-hour-unavailable');
  const tables = options.tables(game, content, input.mapId); options.assertCurrent();
  if (!tables[input.type]?.slots.length) return { status: 'no-encounter', reason: 'no-candidate' };
  const party: EncounterLead[] = game.party.map(member => ({ isEgg: member.isEgg, hp: member.hp, level: member.level, ability: member.ability,
    item: itemOf(catalogOf(content), member.item)?.battleId ?? member.item }));
  const random: RandomPort = upperBound => { options.assertCurrent(); const value = options.random(upperBound); options.assertCurrent(); return value; };
  return prepareCandidate(input, { game, content, dex, facts, party, tables, random }, options);
}
interface CandidateInput extends Omit<FieldEncounterInput, 'source'> { readonly source: WildGenerationSource }
function prepareCandidate(input: CandidateInput,
  observed: { game: GameState; content: Content; dex?: DexLookup; facts: WorldBusinessFacts; party: EncounterLead[]; tables: FormalEncounterTables; random: RandomPort },
  options: PreparationOptions, allow?: { repelActive: boolean; runtime: EncounterCounters; install(next: EncounterCounters): void }): OrdinaryEncounterResult {
  const { game, content, dex, facts, party, tables, random } = observed, type = input.type, config = resolveConfig(content.settings), local = options.local();
  if (facts.hour.status !== 'value') throw Error('encounter-hour-unavailable');
  let registeredTypes: string[] = [], speciesTypes: Record<string, readonly string[]> = {};
  const leadAbility = normalized(game.party.find(member => !member.isEgg)?.ability ?? '');
  const prefersTypes = ['magnetpull', 'static'].includes(leadAbility) || config.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS && ['flashfire', 'harvest', 'lightningrod', 'stormdrain'].includes(leadAbility);
  if (prefersTypes) {
    if (!dex?.allTypes) return { status: 'unsupported', reason: 'encounter-type-directory-unavailable' };
    registeredTypes = dex.allTypes().map(type => type.name); options.assertCurrent();
    for (const slot of tables[type]?.slots ?? []) {
      const name = resolveSpecies(content, slot.species), data = name ? own(content.species, name) : undefined;
      if (!data?.types) return { status: 'unsupported', reason: `encounter-species-types-unavailable:${slot.species}` };
      speciesTypes[slot.species] = [...data.types];
    }
  }
  const candidate = selectEncounterCandidate(tables[type], { party, local, moreAbilities: config.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS, registeredTypes, speciesTypes }, random);
  if (!candidate) return { status: 'no-encounter', reason: 'no-candidate' };
  if (allow) {
    const allowance = checkEncounterAllowance({ candidate, party, repelActive: allow.repelActive,
      repelCountsFainted: config.REPEL_COUNTS_FAINTED_POKEMON, runtime: allow.runtime }, random);
    options.assertCurrent(); allow.install(allowance.runtime);
    if (!allowance.allowed) return { status: 'no-encounter', reason: allowance.reason };
  }
  ordinaryEncounterIsDouble(); // This approved release is single battle; no double/partner/terrain draw.
  const projected = projectWorldBattleContext({ facts, source: type, groundEnvironment: input.groundEnvironment,
    facingEnvironment: input.facingEnvironment, weatherSetsTerrain: config.OVERWORLD_WEATHER_SETS_BATTLE_TERRAIN });
  if (projected.status !== 'value') return { status: 'unsupported', reason: ('reason' in projected ? projected.reason : undefined) ?? 'world-battle-context-unavailable' };
  const creationEnvironment = input.source === 'fishing' ? input.facingEnvironment : input.groundEnvironment;
  if (creationEnvironment.status !== 'value' || !Object.hasOwn(ENVIRONMENT, creationEnvironment.value)) return { status: 'unsupported', reason: 'encounter-ground-environment-unavailable' };
  const species = resolveSpecies(content, candidate.species);
  if (!species) return { status: 'unsupported', reason: `encounter-species-unavailable:${candidate.species}` };
  const generated=prepareWildIndividual(candidate.species,candidate.level,{game,content,dex,facts,mapId:input.mapId,environment:creationEnvironment,source:input.source},options);
  if(generated.status!=='created')return generated;
  const member=generated.member;
  const baseId = `world:${input.id}`;
  let battleId = baseId, suffix = 0;
  while (Object.hasOwn(game.appliedBattles, battleId)) {
    if (!Number.isSafeInteger(++suffix)) throw Error('world-battle-id-space-exhausted');
    battleId = `${baseId}:${suffix}`;
  }
  return { status: 'prepared', prepared: { request: { battleId, kind: 'wild', foes: [{ species, level: candidate.level }], seq: 0,
      ...(projected.value.initialField ? { initialField: projected.value.initialField } : {}) }, member,
    nextMemberOrdinal: generated.nextMemberOrdinal, capture: projected.value.capture,
    ...(generated.registrations?.length ? { formRegistrations: generated.registrations } : {}),
    mapId: input.mapId, contentIdentity: semanticFingerprint(content), stateIdentity: semanticFingerprint(game) } };
}
