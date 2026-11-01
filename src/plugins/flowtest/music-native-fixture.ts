/* eslint-disable @typescript-eslint/no-explicit-any */
import { progressionDonorInputs } from './source-fixture';
import PLAN from '../../../experiments/step5/4/music-native-plan.json';

/** Author-only Gen8 fixture. No saved content or observed result is an oracle. */
export function musicNativeContent(E: any, assert: any): any {
  const input = progressionDonorInputs();
  input.manifest.id = 'native-music-v2';
  const bird = input.species.find((s: any) => s.id === 'pidgey');
  const target = { ...bird, id: 'pidgeotto', showdownId: 'pidgeotto', nameKey: 'species.pidgeotto', learnset: [{ level: 1, move: 'tackle' }] };
  delete target.evolutions;
  input.species.push(target);
  bird.learnset = [{ level: 1, move: 'tackle' }];
  bird.evolutions = [{ method: 'Level', parameter: 18, target: 'pidgeotto' }];
  input.species.find((s: any) => s.id === 'snorlax').learnset = [{ level: 1, move: 'tackle' }];
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map((item: any) => ({ ...item, source: 'author-placeholder' }));
  const variants: [string, string | null | undefined][] = [['normal', PLAN.prefix + 'intro'], ['nil', undefined], ['empty', ''], ['missing', PLAN.prefix + 'missing'], ['corrupt', PLAN.prefix + 'corrupt']];
  input.trainerTypes = variants.map(([id, intro]) => ({ id: 'music-type-' + id, nameKey: 'trainer.music', gender: 0, source: 'author-placeholder', baseMoney: 0, skillLevel: 0, flags: [], items: [], battleBgm: PLAN.prefix + 'trainer', ...(intro === undefined ? {} : { introBgm: intro }) }));
  input.trainers = variants.map(([id]) => ({ id: 'music-' + id, type: 'music-type-' + id, name: 'Native Music', version: 1, source: 'author-placeholder', party: [{ species: 'pidgey', level: 3, moves: ['tackle'] }] }));
  const compiled = E.contentCompile.compileContent(input);
  assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup());
  assert(!assembled.errors.length, JSON.stringify(assembled.errors));
  return assembled.content;
}

export function musicNativeState(E: any, content: any, kind: 'normal' | 'receiving' | 'evolution' = 'normal'): any {
  const state = E.state.newGame({ content, party: [], money: 1000, bag: { masterball: 2 } });
  const count = kind === 'receiving' ? 6 : 1;
  state.party = Array.from({ length: count }, (_, i) => E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: 'MUSIC-P' + (i + 1), species: kind === 'evolution' ? 'Pidgey' : 'Snorlax', level: kind === 'evolution' ? 17 : 100 }, content, () => 0), content));
  if (kind === 'evolution') state.party[0].exp = E.growth.CURVES.parabolic(18) - 1;
  state.nextMemberOrdinal = String(count + 1);
  state.badges.fill(true);
  state.dex.hasDex = kind === 'receiving';
  return state;
}
