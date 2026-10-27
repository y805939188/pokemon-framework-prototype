/** WP30 §7 / approved 5.3 r3 §6.2. Pure queries: callers own eligibility, timing and installation. */
import type { RuleConfig } from "./config";
import type { Member } from "./types";

export type FriendshipMember = Readonly<Pick<Member, "friendship" | "ball" | "item">> & {
  readonly origin?: Readonly<Pick<NonNullable<Member["origin"]>, "map">>;
};

export interface FriendshipContext {
  /** Missing/null is unknown, including when the obtained map is also unknown. */
  readonly mapId?: number | null;
  readonly AFFECTION_EFFECTS: RuleConfig["AFFECTION_EFFECTS"];
}

const CHANGES = {
  walking: [2, 2, 1],
  levelup: [5, 4, 3],
  groom: [10, 10, 4],
  evberry: [10, 5, 2],
  vitamin: [5, 3, 2],
  wing: [3, 2, 1],
  machine: [1, 1, 0],
  battleitem: [1, 1, 0],
  faint: [-1, -1, -1],
  faintbad: [-5, -5, -10],
  powder: [-5, -5, -10],
  energyroot: [-10, -10, -15],
  revivalherb: [-15, -15, -20],
} as const;

export type FriendshipMethod = keyof typeof CHANGES;
export type FriendshipDomainFailure = {
  status: "refused";
  reason: "friendship-out-of-domain";
  value: number;
};
export type FriendshipPlan = {
  status: "ready";
  method: FriendshipMethod;
  before: number;
  after: number;
  /** Actual change after all modifiers and the 0..255 clamp. */
  delta: number;
} | FriendshipDomainFailure | {
  status: "refused";
  reason: "unknown-friendship-method";
  method: string;
};

function inDomain(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 255;
}

function knownMethod(method: string): method is FriendshipMethod {
  return Object.hasOwn(CHANGES, method);
}

/**
 * The existing missing-value fallback is 70. Author values such as 256 remain untouched and yield a refusal;
 * the item/battle caller must apply its own approved refusal/skip policy. Walking here does not count steps or roll RNG.
 */
export function planFriendshipChange(member: FriendshipMember, method: string, context: FriendshipContext): FriendshipPlan {
  const before = member.friendship ?? 70;
  if (!inDomain(before)) return { status: "refused", reason: "friendship-out-of-domain", value: before };
  if (!knownMethod(method)) return { status: "refused", reason: "unknown-friendship-method", method };

  let delta: number = CHANGES[method][Math.floor(before / 100)]!;
  if (delta > 0) {
    if (context.mapId != null && member.origin?.map === context.mapId) delta += 1;
    if (member.ball?.toLowerCase() === "luxuryball") delta += 1;
    if (member.item.toLowerCase() === "soothebell") delta = Math.floor(delta * 1.5);
    if (context.AFFECTION_EFFECTS && method !== "evberry") {
      delta = before >= 179 ? 0 : Math.min(delta, 179 - before);
    }
  }
  const after = Math.min(255, Math.max(0, before + delta));
  return { status: "ready", method, before, after, delta: after - before };
}

export type Affection = 0 | 1 | 2 | 3 | 4 | 5;
export type AffectionResult = { status: "ready"; affection: Affection } | FriendshipDomainFailure;

/** No second persistent field, projection into the normal domain, or battle effect is installed. */
export function deriveAffection(member: Readonly<Pick<Member, "friendship">>): AffectionResult {
  const value = member.friendship ?? 70;
  if (!inDomain(value)) return { status: "refused", reason: "friendship-out-of-domain", value };
  const affection: Affection = value < 100 ? 0 : value < 150 ? 1 : value < 200 ? 2 : value < 230 ? 3 : value < 255 ? 4 : 5;
  return { status: "ready", affection };
}
