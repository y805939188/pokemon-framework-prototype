/** Read-only application projections. Callers own all port reads, freshness checks and operation authority. */
import { clone } from "../rules/state";
import type { GameState } from "../rules/state";
import { boxedMembers } from "../rules/storage";
import { aggregateBag } from "../rules/inventory";
import { computedNature } from "../rules/member-metadata";
import { computeStats } from "../rules/growth";
import { speciesDataOf } from "../rules/species-key";
import { createDexQueryCatalog, dexAccessibleRegions, dexMenuEntry, dexInfo, dexEntryNumber, dexMeasurements } from "../rules/pokedex-query";
import { resolveConfig } from "../rules/config";
import { tradeEligibility } from "./trade-operation";
import type { TradeDraftView } from "./trade-operation";
import type { Content, DexLookup } from "../rules/types";
import type { ItemWorldContext } from "../rules/item-effects";
import type { PartyView } from "./ports";

export function partyView(game: GameState, content: Content): PartyView {
  return {
    members: game.party.map((m) => {
      const sp = speciesDataOf(content, m);
      const maxhp = sp ? computeStats(sp.base, m.ivs, m.evs, m.level, computedNature(m)).hp : m.hp;
      return { id: m.id, species: m.species, form: m.form ?? 0, ...(sp?.nameKey ? { nameKey: sp.nameKey } : {}), level: m.level, hp: m.hp, maxhp, status: m.status, moves: m.moves.map((x) => ({ ...x })) };
    }),
    boxes: boxedMembers(game).length, bag: aggregateBag(game.inventory), money: game.money,
  };
}

export function learningMoveView(content: Content, dex: DexLookup | undefined, id: string) {
  const move = Object.values(content.moves ?? {}).find(value => value.id === id);
  if (!move) return null;
  return { ...(dex?.moveDetails?.(id) ?? { type: '', category: '', power: null, accuracy: 0, description: '' }), ...clone(move) };
}

export function tradeCandidateViews(game: GameState, world: ItemWorldContext, requiredSpecies?: string) {
  return game.party.map(member => ({ memberId: member.id, name: member.nickname || member.species,
    eligible: tradeEligibility(member, world, requiredSpecies) === null, reason: tradeEligibility(member, world, requiredSpecies) }));
}

export function pokedexSnapshotView(generation: number, state: GameState, content: Content,
  text: Readonly<Record<string, string>>, currentRegion: number | null) {
  const catalog = createDexQueryCatalog(content, text), config = resolveConfig(content.settings);
  const accessible = dexAccessibleRegions(state.dex, catalog.layout, { useCurrentRegion: config.USE_CURRENT_REGION_DEX, currentRegion });
  return { generation, dex: state.dex, catalog, accessible, menu: dexMenuEntry(state.dex, accessible, config.USE_CURRENT_REGION_DEX) };
}

export function pokedexEntryWithMeasurements(info: ReturnType<typeof dexInfo>, locale: string) {
  return info ? { ...info, measurements: info.heightDm === null || info.weightHg === null ? null : dexMeasurements(info.heightDm, info.weightHg, locale, "info") } : null;
}

export function installedPokedexEntryView(snapshot: ReturnType<typeof pokedexSnapshotView>, content: Content,
  species: string, locale: string) {
  const config = resolveConfig(content.settings);
  const info = dexInfo(snapshot.dex, snapshot.catalog, species, dexEntryNumber(snapshot.dex, snapshot.catalog.layout, species, "brief", config.DEXES_WITH_OFFSETS));
  return pokedexEntryWithMeasurements(info, locale);
}

/** Compute only the draft info. The facade rechecks its owner before adding measurements, in the original order. */
export function tradePokedexEntryInfo(view: TradeDraftView, content: Content, text: Readonly<Record<string, string>>) {
  const catalog = createDexQueryCatalog(content, text), config = resolveConfig(content.settings);
  return dexInfo(view.dex!, catalog, view.entry!.species, dexEntryNumber(view.dex!, catalog.layout, view.entry!.species, "brief", config.DEXES_WITH_OFFSETS));
}
