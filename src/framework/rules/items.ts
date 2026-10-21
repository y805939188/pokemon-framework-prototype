/**
 * The bag items this build knows (step 4): the battle items of rules.ts plus the balls the capture rules handle.
 * Content (grants) may only hand out these ids; anything else is refused when the content is compiled.
 */
import { HEAL_ITEMS, STAT_ITEMS, STATUS_ITEMS } from "./rules.ts";

/** Balls with a defined capture rule (rules.ts ballRate; pokeball and premierball have no modifier). */
export const BALLS: readonly string[] = [
  "pokeball", "premierball", "greatball", "ultraball", "masterball", "safariball", "sportball", "netball", "diveball", "nestball",
  "repeatball", "timerball", "duskball", "quickball", "fastball", "levelball", "lureball", "loveball", "moonball", "dreamball",
  "beastball", "heavyball",
];

export const BAG_ITEMS: readonly string[] = [...Object.keys(HEAL_ITEMS), ...Object.keys(STATUS_ITEMS), ...Object.keys(STAT_ITEMS), ...BALLS];

export function isBagItem(id: string): boolean {
  return BAG_ITEMS.includes(id);
}
