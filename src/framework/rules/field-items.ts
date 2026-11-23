/** No-target field identity. Classification is not permission, execution or consumption. */
import type { ItemDefinition } from './item-catalog';
import { fieldEffectProblem } from './item-families';

export type NoTargetFieldItemAction =
  | { kind: 'repel'; steps: 100 | 200 | 250 }
  | { kind: 'flute'; color: 'black' | 'white' }
  | { kind: 'sweet-scent' }
  | { kind: 'escape-rope' }
  | { kind: 'fishing'; rod: 1 | 2 | 3 }
  | { kind: 'sacred-ash' };

export function classifyFieldItem(item: ItemDefinition): NoTargetFieldItemAction | null {
  if (!['direct', 'field'].includes(item.fieldUse) || !item.effect || fieldEffectProblem(item.effect)) return null;
  const { family, parameters: p } = item.effect;
  if (family === 'repel' && (p.steps === 100 || p.steps === 200 || p.steps === 250)) return { kind: 'repel', steps: p.steps };
  if (family === 'flute' && (p.color === 'black' || p.color === 'white')) return { kind: 'flute', color: p.color };
  if (family === 'fishing' && (p.rod === 1 || p.rod === 2 || p.rod === 3)) return { kind: 'fishing', rod: p.rod };
  if (family === 'sweet-scent' || family === 'escape-rope' || family === 'sacred-ash') return { kind: family };
  return null;
}
