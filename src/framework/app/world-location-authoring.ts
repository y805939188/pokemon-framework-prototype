/** WP61 §7.1 / WP59 §5.8 author requests. No caller coordinates or authority tokens. */
export type WorldLocationAuthoringOutcome = { readonly status: 'committed' | 'unchanged' }
  | { readonly status: 'refused'; readonly reason: string };
export interface WorldLocationAuthoring {
  /** Record the actual current map, player square and direction; no healing. */
  recordRecentCenter(): WorldLocationAuthoringOutcome;
  /** Record the actual current map, one square behind and opposite direction before author presentation. */
  recordCaveEntrance(): WorldLocationAuthoringOutcome;
  /** Clear escapePoint before author presentation; never clear recentCenter or healingSpot. */
  clearCaveEscapePoint(): WorldLocationAuthoringOutcome;
}
