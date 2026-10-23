/** Read models for the management host. Copies only: the save remains the sole authority. */
import { clone } from '../rules/value.ts';
import { allMembers, locateMember } from '../rules/storage.ts';
import type { MemberCollection, MemberPosition } from '../rules/storage.ts';
import type { GameState } from '../rules/state.ts';
import { computeStats, minExp, natureModifiers } from '../rules/growth.ts';
import { characteristic, publicIdText } from '../rules/member-identity.ts';
import { battleNameOf, memberKey, speciesDataOf } from '../rules/species-key.ts';
import type { Content, DexLookup, Member, Owner, Stats } from '../rules/types.ts';
import type { Limits } from '../rules/limits.ts';
import type { MemberReference } from '../rules/storage-operations.ts';

export interface ManagementSnapshot extends MemberCollection {
  generation: number;
  player: Owner;
  bag: Record<string, number>;
  money: number;
  limits: Limits;
  held: Member | null;
  references: Record<string, MemberReference>;
  heldSourcesEnabled: boolean;
}
export interface IndividualView {
  member: Member;
  position: MemberPosition | null;
  nameKey?: string;
  battleName: string | null;
  stats: Stats | null;
  modifiers: Partial<Stats>;
  nextLevelExp: number | null;
  currentLevelExp: number | null;
  publicId: string;
  characteristic: { stat: keyof Stats; variant: number };
  types: string[];
  ability: { name: string; description: string };
  moves: { id: string; name: string; pp: number; maxpp: number; type: string; category: string; power: number | null; accuracy: number; description: string }[];
  diagnostics: string[];
}
export function managementSnapshot(game: GameState, collection: MemberCollection, held: Member | null, generation: number, limits: Limits, sourceAllowed: boolean): ManagementSnapshot {
  return clone({ generation, party: collection.party, storage: collection.storage, held, player: game.player, bag: game.bag, money: game.money, limits, heldSourcesEnabled: sourceAllowed,
    references: Object.fromEntries(allMembers(game).map(m => [m.id, { id: m.id, position: locateMember(game, m.id)!.position }])) });
}
export function individualView(member: Member, game: GameState, content: Content, dex?: DexLookup): IndividualView {
  const species = speciesDataOf(content, member), battleName = battleNameOf(content, memberKey(member));
  // Missing/unapproved content never authorizes a speculative external data lookup.
  const allowedDex = species && content.meta?.showdownSourceChecked ? dex : undefined;
  const statics = battleName ? allowedDex?.species(battleName) : null;
  return clone({ member, position: locateMember(game, member.id)?.position ?? null, ...(species?.nameKey ? { nameKey: species.nameKey } : {}), battleName,
    stats: species ? computeStats(species.base, member.ivs, member.evs, member.level, member.nature) : null,
    modifiers: natureModifiers(member.nature), currentLevelExp: species ? minExp(species.growth,member.level) : null, nextLevelExp: species && member.level < 100 ? minExp(species.growth, member.level + 1) : null,
    publicId: publicIdText(member.owner?.id ?? 0), characteristic: characteristic(member.personalID ?? 0, member.ivs ?? {}), types: statics?.types ?? [],
    ability: allowedDex?.abilityInfo?.(member.ability) ?? { name: member.ability, description: '' },
    moves: member.moves.map(move => ({ ...move, ...(allowedDex?.moveDetails?.(move.id) ?? { name: move.id, type: '', category: '', power: null, accuracy: 0, description: '' }) })),
    diagnostics: species ? [] : ['member-content-unavailable'] });
}
export interface StorageSearch { text?: string; form?: number | null; markings?: { index: number; value: number }[] }
export interface StorageMatch { id: string; position: Extract<MemberPosition, { kind: 'box' }>; member: Member }
export function searchStorage(game: MemberCollection, search: StorageSearch, displayName: (member: Member) => string): StorageMatch[] {
  if (search.form != null && (!Number.isInteger(search.form) || search.form < 0 || search.form > 999)) throw new Error('invalid-search-form');
  if ((search.markings ?? []).some(m => !Number.isInteger(m.index) || m.index < 0 || m.index > 5 || !Number.isInteger(m.value) || m.value < 0)) throw new Error('invalid-search-marking');
  const fold = (s: string): string => s.normalize('NFKC').toLocaleLowerCase();
  const text = fold(search.text?.trim() ?? ''), out: StorageMatch[] = [];
  for (const [box, record] of game.storage.boxes.entries()) for (const [slot, member] of record.slots.entries()) {
    if (!member || (search.form != null && member.form !== search.form) || !(search.markings ?? []).every(m => (member.markings?.[m.index] ?? 0) === m.value)) continue;
    if (text && ![member.nickname ?? '', member.species, displayName(clone(member))].some(s => fold(s).includes(text))) continue;
    out.push({ id: member.id, position: { kind: 'box', box, slot }, member: clone(member) });
  }
  return out;
}
