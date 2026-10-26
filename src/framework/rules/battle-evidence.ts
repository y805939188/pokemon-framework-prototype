/** Internal, transient companion values. These are NOT protocol-v1 messages or persistent save fields. */
import { planFriendshipChange } from "./friendship.ts";
export interface BattleActor {
  id: string; side: string; slot: number; level: number; hp: number; active: boolean;
}
export type EvidenceGroup = "identity" | "display" | "critical" | "damage" | "friendship";
export interface EvidenceIssue { group: EvidenceGroup; memberId?: string; reason: string }
/** Actual displayed object, normalized inside the battle adapter; never parsed from a public log. */
export interface BattleDisplaySnapshot { battleSpecies: string; gender: 0 | 1 | 2; shiny: boolean }
export type BattleObservation =
  | { kind: "hit"; domain: "body" | "substitute"; source: BattleActor | null; target: BattleActor; move: string; hit: number; loss: number; critical: boolean }
  | { kind: "faint"; target: BattleActor; opponents: BattleActor[]; hookKey?: string; display?: BattleDisplaySnapshot }
  | { kind: "item"; target: BattleActor; item: string }
  | { kind: "appearance" | "display"; target: BattleActor; details: string; display?: BattleDisplaySnapshot }
  | { kind: "confusion"; target: BattleActor; loss: number };
export interface ObservationBatch { records: BattleObservation[]; issues: EvidenceIssue[] }
/** Internal adapter notifications before precise loss intervals have been resolved. Plain values only. */
export type FormatObservation = Exclude<BattleObservation, { kind: "faint" }>
  | (Extract<BattleObservation, { kind: "faint" }> & { faintToken?: object })
  | { kind: "before-loss"; target: BattleActor; source: BattleActor | null; amount: number; effect: string; effectType: string }
  | { kind: "move-aborted"; target: BattleActor }
  | { kind: "healing"; target: BattleActor };
export interface FormatObserver { emit(value: FormatObservation): void; failed(): void }
export interface BattleEvidenceContext {
  battleId: string; generation: number; contentIdentity: string;
  playerIds: string[]; initialLevels: Record<string, number>; mapId?: number;
}
export interface FriendEvidence {
  before: number; current: number;
  changes: { method: "levelup" | "battleitem" | "faint" | "faintbad"; before: number; after: number }[];
}
export interface BattleEvidence {
  context: BattleEvidenceContext; rawHash: string;
  records: BattleObservation[]; issues: EvidenceIssue[];
  critical: Record<string, number>; damage: Record<string, number>; fainted: string[];
  friendship: Record<string, FriendEvidence>;
}
export interface EvidenceBinding { battleId: string; generation: number; rawHash: string }

/** Only four battle-triggered methods in this narrow capability batch; general learning/world methods are separate. */
export function battleFriendshipValue(h: number, method: FriendEvidence["changes"][number]["method"], modifiers: { sameMap: boolean; luxuryBall: boolean; sootheBell: boolean; affection: boolean }): number | null {
  if (!Number.isSafeInteger(h) || h < 0 || h > 255) return null;
  // The session already resolved real map/item identities. This legacy value adapter preserves those four facts;
  // the local matching-map sentinel is calculation input only, never an observation or persistent provenance.
  const plan = planFriendshipChange({friendship: h, item: modifiers.sootheBell ? "soothebell" : "",
    ball: modifiers.luxuryBall ? "luxuryball" : "", ...(modifiers.sameMap ? {origin: {map: 0}} : {})},
    ["levelup", "battleitem", "faint", "faintbad"].includes(method) ? method : "",
    {mapId: modifiers.sameMap ? 0 : undefined, AFFECTION_EFFECTS: modifiers.affection});
  return plan.status === "ready" ? plan.after : null;
}
