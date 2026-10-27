/** Author PBS Item subset. Unsupported fields are reported; no reference implementation is read or translated. */
import { deriveIds } from './pbs-import';
import type { PbsProblem } from './pbs-import';
import type { FieldUse, ItemDefinition } from '../rules/item-catalog';

export function importPbsItems(text: string, source: string): { ok: boolean; items: Partial<ItemDefinition>[]; errors: PbsProblem[]; later: { line: number; field: string }[] } {
  const errors: PbsProblem[] = [], later: { line: number; field: string }[] = [];
  const records: { id: string; start: number; invalid: boolean; props: Map<string, { value: string; line: number }> }[] = [];
  const ids = new Set<string>();
  let current: typeof records[number] | undefined;
  const fail = (line: number, path: string, message: string) => { errors.push({ line, path, message }); if (current) current.invalid = true; };
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = i + 1;
    if (raw.startsWith('#') || raw.trim() === '') continue;
    const clean = raw.split('#')[0]!.trim(), section = /^\[(.*)\]$/.exec(clean);
    if (section) {
      const identity = deriveIds(section[1]!.trim());
      current = { id: identity?.id ?? '', start: line, invalid: !identity, props: new Map() }; records.push(current);
      if (!identity || ids.has(current.id)) fail(line, 'id', 'invalid or duplicate Item symbol');
      if (identity) ids.add(identity.id);
      continue;
    }
    const property = /^(\w+)\s*=\s*(.*)$/.exec(clean);
    if (!current || !property || property[2]!.includes('"')) { fail(line, '$', 'expected an unquoted property inside an Item section'); continue; }
    current.props.set(property[1]!, { value: property[2]!, line });
  }
  const field: Record<string, FieldUse> = { OnPokemon: 'member', Direct: 'direct', TM: 'tm', HM: 'hm', TR: 'tr' };
  const battle: Record<string, ItemDefinition['battleUse']> = { OnPokemon: 'member', OnMove: 'move', OnBattler: 'active', OnFoe: 'foe', Direct: 'direct' };
  const items: Partial<ItemDefinition>[] = [];
  for (const record of records) {
    current = record;
    const item: Partial<ItemDefinition> = { id: record.id, source };
    for (const [key, entry] of record.props) {
      const { value, line } = entry;
      if (['Name','NamePlural'].includes(key)) item[key === 'Name' ? 'name' : 'namePlural'] = value;
      else if (['Pocket','Price','SellPrice'].includes(key)) {
        const n = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!Number.isSafeInteger(n) || n < 0 || key === 'Pocket' && (n < 1 || n > 8)) fail(line, key, 'invalid nonnegative integer or pocket 1..8');
        else item[key === 'Pocket' ? 'pocket' : key === 'Price' ? 'price' : 'sellPrice'] = n;
      } else if (key === 'Flags') item.flags = value ? value.split(',').map(s => s.trim()) : [];
      else if (['Consumable','ShowQuantity'].includes(key)) {
        if (!['true','false'].includes(value.toLowerCase())) fail(line, key, 'must be true or false');
        else item[key === 'Consumable' ? 'consumable' : 'showQuantity'] = value.toLowerCase() === 'true';
      } else if (key === 'FieldUse') { if (!Object.hasOwn(field, value)) fail(line, key, 'unknown FieldUse name (numeric text is not an enum)'); else item.fieldUse = field[value]!; }
      else if (key === 'BattleUse') { if (!Object.hasOwn(battle, value)) fail(line, key, 'unknown BattleUse name (numeric text is not an enum)'); else item.battleUse = battle[value]!; }
      else if (key === 'Move') { const id = deriveIds(value); if (!id) fail(line, key, 'invalid Move symbol'); else item.move = id.showdownId; }
      else later.push({ line, field: key });
    }
    if (!record.invalid) items.push(item);
  }
  return { ok: errors.length === 0, items, errors, later };
}
