/** Trusted static catalog assembly. Only the actual pinned engine and validated author content enter here. */
import type { TrainerAiCatalog, Ratio } from '../rules/trainer-ai';
import type { Content } from '../rules/types';
import { catalogOf } from '../rules/item-catalog';
import { HEAL_ITEMS, STATUS_ITEMS } from '../rules/rules';
import { semanticFingerprint as canonicalJson } from '../rules/semantic';
import { sha256Hex } from '../rules/sha256';
import { readEngineSha } from './showdown-loader';
import type { LoadedSim } from './showdown-loader';
export const TRAINER_AI_SHOWDOWN = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
export interface AssembledTrainerCatalog {
  catalog: TrainerAiCatalog; identity: string; authorIdentity: string;
  battleItems: Readonly<Record<string, string>>;
}
export function assembleTrainerCatalog(env: LoadedSim, content: Content, contentIdentity: string): AssembledTrainerCatalog {
  if (readEngineSha(env.root) !== TRAINER_AI_SHOWDOWN || !/^[a-f0-9]{64}$/.test(contentIdentity)) throw new Error('trainer-ai-catalog-source-mismatch');
  const dex = env.sim.Dex.forGen(8);
  const moves: Record<string, TrainerAiCatalog['moves'][string]> = {};
  for (const m of dex.moves.all()) {
    if (!m.exists || m.gen > 8 || m.isNonstandard === 'Future') continue;
    // Static fixed-power single-hit damage only. Callbacks, fixed/variable damage and multi-hit remain explicit omissions.
    const complex = m.basePowerCallback || m.damageCallback || m.damage || m.multihit || m.ohko || m.onTry || m.onTryHit || m.onModifyMove || m.onHit || m.callsMove || m.isZ || m.isMax;
    moves[m.id] = { family: m.category !== 'Status' && m.basePower > 0 && !complex ? 'basic-damage' : 'unmodeled', moveType: m.type, basePower: m.basePower, accuracy: m.accuracy === true ? {kind:'always'} : {kind:'percent',value:m.accuracy} };
  }
  const types: Record<string, Record<string, Ratio>> = {};
  const names = dex.types.all().filter((t: {exists:boolean;isPseudoType?:boolean;isNonstandard?:string|null}) => t.exists && !t.isPseudoType && t.isNonstandard !== 'Future').map((t:{name:string})=>t.name as string);
  for (const attack of names) {
    const row: Record<string, Ratio> = {}; types[attack] = row;
    for (const defense of names) {
      const code = dex.types.get(defense).damageTaken[attack];
      row[defense] = code === 3 ? {numerator:0,denominator:1} : code === 1 ? {numerator:2,denominator:1} : code === 2 ? {numerator:1,denominator:2} : {numerator:1,denominator:1};
    }
  }
  const items: Record<string, TrainerAiCatalog['items'][string]> = {}, battleItems: Record<string,string> = {};
  const authors = catalogOf(content);
  for (const [id,item] of Object.entries(authors)) {
    const battleId = item.battleId ?? '';
    let data: TrainerAiCatalog['items'][string] = {family:'unsupported',estimateHp:0,cures:[],curesConfusion:false};
    if (item.battleUse === 'member' && item.consumable) {
      if (battleId === 'fullrestore') data = {family:'full-restore',estimateHp:999,cures:'all',curesConfusion:true};
      else if (HEAL_ITEMS[battleId]) {
        const amount = HEAL_ITEMS[battleId]!.amount;
        data = {family:'heal-hp',estimateHp:amount === 'full' ? 999 : amount === 'quarter' ? 1 : amount,cures:[],curesConfusion:false};
      } else if (STATUS_ITEMS[battleId]) {
        const spec = STATUS_ITEMS[battleId]!;
        data = {family:'cure-status',estimateHp:0,cures:spec.cures as 'all' | ('slp'|'frz'|'par'|'psn'|'tox'|'brn')[],curesConfusion:!!spec.confusion};
      }
    }
    items[id] = data; battleItems[id] = battleId;
  }
  const catalog: TrainerAiCatalog = {gen:8,moves,types,items};
  const authorIdentity = sha256Hex(canonicalJson(authors));
  return {catalog,authorIdentity,battleItems,identity:sha256Hex(canonicalJson({version:'gen8-author-catalog-v1',showdown:TRAINER_AI_SHOWDOWN,contentIdentity,authorIdentity,catalog}))};
}
