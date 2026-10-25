/** Internal, transient companion values. These are NOT protocol-v1 messages or persistent save fields. */
export interface BattleActor {
  id: string; side: string; slot: number; level: number; hp: number; active: boolean;
}
export type EvidenceGroup = "identity" | "display" | "critical" | "damage" | "friendship";
export interface EvidenceIssue { group: EvidenceGroup; memberId?: string; reason: string }
export type BattleObservation =
  | { kind: "hit"; domain: "body" | "substitute"; source: BattleActor | null; target: BattleActor; move: string; hit: number; loss: number; critical: boolean }
  | { kind: "faint"; target: BattleActor; opponents: BattleActor[] }
  | { kind: "item"; target: BattleActor; item: string }
  | { kind: "appearance" | "display"; target: BattleActor; details: string }
  | { kind: "confusion"; target: BattleActor; loss: number };
export interface ObservationBatch { records: BattleObservation[]; issues: EvidenceIssue[] }
/** Internal adapter notifications before precise loss intervals have been resolved. Plain values only. */
export type FormatObservation = BattleObservation
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
  const row = { levelup: [5, 4, 3], battleitem: [1, 1, 0], faint: [-1, -1, -1], faintbad: [-5, -5, -10] }[method];
  let delta = row[Math.floor(h / 100)]!;
  if (delta > 0) {
    if (modifiers.sameMap) delta++;
    if (modifiers.luxuryBall) delta++;
    if (modifiers.sootheBell) delta = Math.floor(delta * 1.5);
    if (modifiers.affection) delta = h >= 179 ? 0 : Math.min(delta, 179 - h);
  }
  return Math.min(255, Math.max(0, h + delta));
}
