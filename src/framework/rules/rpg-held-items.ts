/**
 * RPG holders absent from the pinned competitive Dex. Only identity and Gen 8 Fling data live here;
 * experience and money remain owned by growth/settlement, not by native field-effect callbacks.
 * WP47-B control-items coverage: Lucky Egg/Amulet Coin 30; Luck Incense 10.
 */
export const RPG_HELD_ITEMS: Readonly<Record<string, Readonly<{ name: string; gen: number; flingPower: number }>>> = Object.freeze({
  luckyegg: Object.freeze({ name: "Lucky Egg", gen: 2, flingPower: 30 }),
  amuletcoin: Object.freeze({ name: "Amulet Coin", gen: 2, flingPower: 30 }),
  luckincense: Object.freeze({ name: "Luck Incense", gen: 4, flingPower: 10 }),
});
