/** Dormant normal-input observer; no registration, input, timers, action submission or native permit. */
export interface ForcedIntent { caseId: string; intentIndex: number; memberId: string }
interface Snapshot {
  status?: string; current?: boolean; sceneKind?: string; ownerToken?: string; requestViewEpoch?: number;
  source?: { version: string; side: string; occurrenceId: string }; phase?: string; ready?: boolean;
  fast?: boolean; effects?: boolean; menuToken?: string; partySub?: string; selectedMemberId?: string;
  items?: { key: unknown; enabled: boolean }[];
}
interface Scene { requestObservationState?: () => Snapshot }
interface Sample { scene: Scene; intent: ForcedIntent; snapshot: Snapshot }
export function createForcedSelectionObserver(currentScene: () => Scene | null) {
  let previous: Sample | null = null, continuation: Sample | null = null;
  const same = (a: Sample, b: Sample) => a.scene === b.scene && a.intent.caseId === b.intent.caseId
    && a.intent.intentIndex === b.intent.intentIndex && a.intent.memberId === b.intent.memberId
    && a.snapshot.ownerToken === b.snapshot.ownerToken && a.snapshot.requestViewEpoch === b.snapshot.requestViewEpoch
    && a.snapshot.source?.occurrenceId === b.snapshot.source?.occurrenceId;
  const unique = (s: Snapshot, key: string) => s.items?.filter(i => i.key === key && i.enabled === true).length === 1;
  return {
    sample(intent: ForcedIntent) {
      const scene = currentScene(), snapshot = scene?.requestObservationState?.();
      const blocked = (reason: string) => { previous = continuation = null; return { status: 'blocked' as const, reason, snapshot }; };
      if (!intent.caseId || !Number.isSafeInteger(intent.intentIndex) || intent.intentIndex < 0 || !intent.memberId) return blocked('invalid-intent');
      if (!scene || !snapshot || snapshot.status !== 'available' || snapshot.current !== true || snapshot.sceneKind !== 'battle'
        || !snapshot.ownerToken || !Number.isSafeInteger(snapshot.requestViewEpoch)
        || snapshot.source?.version !== 'player-forced-choice-source-v1' || snapshot.source.side !== 'p1' || !snapshot.source.occurrenceId
        || snapshot.fast !== false || snapshot.effects !== true || snapshot.ready !== true || !snapshot.menuToken) return blocked('source-or-ready-unavailable');
      const next: Sample = { scene, intent: { ...intent }, snapshot };
      if (snapshot.phase === 'party-forced' && snapshot.partySub === 'forced' && unique(snapshot, intent.memberId)) {
        continuation = null; previous = next;
        return { status: 'selection' as const, snapshot };
      }
      if (snapshot.phase !== 'party-command' || snapshot.partySub !== 'forced' || snapshot.selectedMemberId !== intent.memberId || !unique(snapshot, 'switch-in')) return blocked('not-forced-command');
      if (previous && same(previous, next) && previous.snapshot.phase === 'party-forced' && previous.snapshot.menuToken !== snapshot.menuToken) continuation = next;
      if (!continuation || !same(continuation, next) || continuation.snapshot.menuToken !== snapshot.menuToken) return blocked('missing-selection-cause');
      previous = next;
      return { status: 'confirmation' as const, snapshot, continuation: {
        ...intent, ownerToken: snapshot.ownerToken, requestViewEpoch: snapshot.requestViewEpoch, occurrenceId: snapshot.source.occurrenceId,
      } };
    },
    retire() { previous = continuation = null; },
  };
}
