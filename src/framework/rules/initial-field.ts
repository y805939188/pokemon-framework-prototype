/** Per-battle author values. No world provider, mutable next-battle state or save fields. */
export const WEATHER = Object.freeze({ none: '', sun: 'sunnyday', rain: 'raindance', sandstorm: 'sandstorm', hail: 'hail', harshsun: 'desolateland', heavyrain: 'primordialsea', strongwinds: 'deltastream' } as const);
export const TERRAIN = Object.freeze({ none: '', electric: 'electricterrain', grassy: 'grassyterrain', misty: 'mistyterrain', psychic: 'psychicterrain' } as const);
export const ENVIRONMENT = Object.freeze({
  none: ['Normal', 'triattack', 'par'], grass: ['Grass', 'energyball', 'slp'], tallgrass: ['Grass', 'energyball', 'slp'],
  movingwater: ['Water', 'hydropump', 'atk'], stillwater: ['Water', 'hydropump', 'atk'], puddle: ['Water', 'mudbomb', 'spe'], underwater: ['Water', 'hydropump', 'atk'],
  cave: ['Rock', 'powergem', 'flinch'], rock: ['Ground', 'earthpower', 'accuracy'], sand: ['Ground', 'earthpower', 'accuracy'],
  forest: ['Bug', 'energyball', 'slp'], forestgrass: ['Bug', 'energyball', 'slp'], snow: ['Ice', 'icebeam', 'frz'], ice: ['Ice', 'icebeam', 'frz'],
  volcano: ['Fire', 'lavaplume', 'brn'], graveyard: ['Ghost', 'shadowball', 'flinch'], sky: ['Flying', 'airslash', 'spe'], space: ['Dragon', 'dracometeor', 'flinch'], ultraspace: ['Psychic', 'psyshock', 'def'],
} as const);
export interface InitialFieldInput { readonly weather?: keyof typeof WEATHER; readonly terrain?: keyof typeof TERRAIN; readonly environment?: keyof typeof ENVIRONMENT }
export interface InitialField { readonly weather: keyof typeof WEATHER; readonly terrain: keyof typeof TERRAIN; readonly environment: keyof typeof ENVIRONMENT }
export function normalizeInitialField(raw: unknown): InitialField | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid initialField object');
  const proto = Object.getPrototypeOf(raw), ctor = proto && Object.getOwnPropertyDescriptor(proto, 'constructor');
  // Public MZ and engine bundles may live in different JavaScript realms. Accept ordinary records, not class instances.
  if (proto !== null && proto !== Object.prototype && !(Object.getPrototypeOf(proto) === null && ctor?.value &&
    typeof ctor.value === 'function' && Function.prototype.toString.call(ctor.value) === Function.prototype.toString.call(Object))) throw new Error('invalid initialField object');
  const values: Record<string, string> = { weather: 'none', terrain: 'none', environment: 'none' };
  const tables: Record<string, object> = { weather: WEATHER, terrain: TERRAIN, environment: ENVIRONMENT };
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== 'string' || !Object.hasOwn(tables, key)) throw new Error('unknown initialField key');
    const d = Object.getOwnPropertyDescriptor(raw, key)!;
    if (!Object.hasOwn(d, 'value') || !d.enumerable) throw new Error('initialField requires own data');
    if (d.value === undefined) continue;
    if (typeof d.value !== 'string' || !Object.hasOwn(tables[key]!, d.value)) throw new Error('unsupported initialField ' + key);
    values[key] = d.value;
  }
  if (Object.values(values).every(x => x === 'none')) return undefined;
  return Object.freeze(values) as unknown as InitialField;
}
/** Do not invoke an accessor before rejecting malformed config or spreading a trainer request. */
export function captureInitialField(request: object): InitialField | undefined {
  const d = Object.getOwnPropertyDescriptor(request, 'initialField');
  if (!d) { if ('initialField' in request) throw new Error('initialField must be own data'); return undefined; }
  if (!Object.hasOwn(d, 'value')) throw new Error('initialField must be own data');
  return normalizeInitialField(d.value);
}
export function initialFieldMZ(weather: unknown, terrain: unknown, environment: unknown): InitialField | undefined {
  return normalizeInitialField({ weather: weather === '' ? undefined : weather, terrain: terrain === '' ? undefined : terrain, environment: environment === '' ? undefined : environment });
}

/** Copy the accepted request without reading a caller-replaced config getter at a later async boundary. */
export function withInitialField<T extends object>(request: T, captured: InitialField | undefined): T {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(request)) if (key !== 'initialField') Object.defineProperty(result, key, { value: (request as Record<string, unknown>)[key], enumerable: true, writable: true, configurable: true });
  result.initialField = captured;
  return result as T;
}
