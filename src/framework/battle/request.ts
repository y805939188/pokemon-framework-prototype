/** Value-only request contract for pinned Showdown 7244fe8 (sim/side and Battle.getRequests).
 * PP/target may be absent for locked moves/Recharge/Struggle; an empty doubles seat serializes as null.
 * Engine-specific additional JSON fields are preserved at the adapter boundary, never exposed as an index signature.
 */
export interface RequestMove {
  move: string; id: string; pp?: number; maxpp?: number; target?: string;
  disabled?: boolean | string; disabledSource?: string;
}
export interface RequestActive {
  moves: RequestMove[]; trapped?: boolean; maybeTrapped?: boolean; maybeDisabled?: boolean; maybeLocked?: boolean;
  canMegaEvo?: boolean; canMegaEvoX?: boolean; canMegaEvoY?: boolean; canUltraBurst?: boolean;
  canDynamax?: boolean; canTerastallize?: string;
}
export interface RequestPokemon {
  ident: string; details: string; condition: string; active: boolean;
  /** The fixed simulator provides these; lightweight custom drivers may omit fields no consumer needs. */
  stats?: { atk: number; def: number; spa: number; spd: number; spe: number };
  moves?: string[]; baseAbility?: string; item?: string; pokeball?: string; ability?: string;
  commanding?: boolean; reviving?: boolean; teraType?: string; terastallized?: string;
}
export interface RequestSide { name: string; id: string; pokemon: RequestPokemon[]; noCancel?: boolean }
interface RequestMeta { rqid?: number; noCancel?: boolean; update?: boolean }
export interface MoveRequest extends RequestMeta {
  active: (RequestActive | null)[]; side: RequestSide; ally?: RequestSide;
  wait?: undefined; forceSwitch?: undefined; teamPreview?: undefined;
}
export interface SwitchRequest extends RequestMeta {
  forceSwitch: boolean[]; side: RequestSide; active?: undefined; wait?: undefined; teamPreview?: undefined;
}
export interface TeamPreviewRequest extends RequestMeta {
  teamPreview: true; side: RequestSide; maxChosenTeamSize?: number;
  active?: undefined; wait?: undefined; forceSwitch?: undefined;
}
export interface WaitRequest extends RequestMeta {
  wait: true; side: RequestSide; active?: undefined; forceSwitch?: undefined; teamPreview?: undefined;
}
/** Some custom drivers publish an empty request; it grants no choice and has no invented active/side fields. */
export interface EmptyRequest extends RequestMeta {
  active?: undefined; side?: undefined; wait?: undefined; forceSwitch?: undefined; teamPreview?: undefined;
}
export type BattleRequest = MoveRequest | SwitchRequest | TeamPreviewRequest | WaitRequest | EmptyRequest;

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optional = (v: unknown, kind: 'boolean' | 'string' | 'number'): boolean => v === undefined || typeof v === kind && (kind !== 'number' || Number.isFinite(v));
const optionalStrings = (v: Record<string, unknown>, keys: readonly string[]): boolean => keys.every(k => optional(v[k], 'string'));
function stats(v: unknown): boolean {
  return record(v) && ['atk','def','spa','spd','spe'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]));
}
function pokemon(p: unknown): p is RequestPokemon {
  return record(p) && typeof p.ident === 'string' && typeof p.details === 'string' && typeof p.condition === 'string' && typeof p.active === 'boolean'
    && optionalStrings(p, ['baseAbility', 'item', 'pokeball', 'ability', 'teraType', 'terastallized'])
    && optional(p.commanding, 'boolean') && optional(p.reviving, 'boolean')
    && (p.moves === undefined || Array.isArray(p.moves) && p.moves.every((move: unknown) => typeof move === 'string'))
    && (p.stats === undefined || stats(p.stats));
}
function side(v: unknown): v is RequestSide {
  return record(v) && typeof v.name === 'string' && typeof v.id === 'string' && optional(v.noCancel, 'boolean')
    && Array.isArray(v.pokemon) && v.pokemon.every(pokemon);
}
function active(v: unknown): v is RequestActive | null {
  return v === null || record(v) && Array.isArray(v.moves) && v.moves.every((m: unknown) => record(m)
    && typeof m.move === 'string' && typeof m.id === 'string' && optional(m.pp, 'number') && optional(m.maxpp, 'number')
    && optional(m.target, 'string') && optional(m.disabledSource, 'string') && (m.disabled === undefined || typeof m.disabled === 'boolean' || typeof m.disabled === 'string'))
    && ['trapped','maybeTrapped','maybeDisabled','maybeLocked','canMegaEvo','canMegaEvoX','canMegaEvoY','canUltraBurst','canDynamax'].every(k => optional(v[k], 'boolean'))
    && optional(v.canTerastallize, 'string');
}
function request(v: unknown): v is BattleRequest {
  if (!record(v) || !optional(v.rqid, 'number') || !optional(v.noCancel, 'boolean') || !optional(v.update, 'boolean')) return false;
  if (v.active !== undefined) return v.wait === undefined && v.forceSwitch === undefined && v.teamPreview === undefined
    && side(v.side) && (v.ally === undefined || side(v.ally)) && Array.isArray(v.active) && v.active.every(active);
  if (v.forceSwitch !== undefined) return v.wait === undefined && v.teamPreview === undefined && side(v.side)
    && Array.isArray(v.forceSwitch) && v.forceSwitch.every((x: unknown) => typeof x === 'boolean');
  if (v.teamPreview !== undefined) return v.teamPreview === true && v.wait === undefined && side(v.side) && optional(v.maxChosenTeamSize, 'number');
  if (v.wait !== undefined) return v.wait === true && side(v.side);
  return v.side === undefined;
}
/** Validate once where dynamic simulator JSON enters the value contract. No fields are added, dropped or normalized. */
export function parseBattleRequest(value: unknown): BattleRequest | null {
  if (value === null || request(value)) return value;
  throw new Error('invalid battle request payload');
}
