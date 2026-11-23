/** Advisory runtime UI contract. Exact issued request identity is the only facade input. */
export type FieldShortcutRecoveryStatus = 'unavailable' | 'pending' | 'failed' | 'completed' | 'cancelled';
export type FieldShortcutRecoveryPhase = 'preparing' | 'ready' | 'awaiting-arrival' | 'after-arrival' | 'unavailable';
export type FieldShortcutRecoveryPhysical = 'not-started' | 'reserved' | 'arrived' | 'unavailable';
export type FieldShortcutRecoveryReason = 'request-unavailable' | 'executing' | 'operation-active' | 'load-failed'
  | 'travel-failed' | 'tail-failed' | 'source-changed' | 'arrival-unconfirmed' | 'not-retryable' | 'not-cancellable' | null;
export interface FieldShortcutRecoveryButton {
  readonly enabled: boolean; readonly disabledReason: FieldShortcutRecoveryReason;
}
/** No owner, receipt, internal request ID, item token or host path is exposed. */
export interface FieldShortcutRecoverySnapshot {
  readonly status: FieldShortcutRecoveryStatus; readonly phase: FieldShortcutRecoveryPhase;
  readonly physical: FieldShortcutRecoveryPhysical; readonly reasonCode: FieldShortcutRecoveryReason;
  readonly retry: FieldShortcutRecoveryButton; readonly cancel: FieldShortcutRecoveryButton;
}
export interface FieldShortcutRecoveryActionOutcome {
  readonly status: 'accepted' | 'completed' | 'cancelled' | 'refused' | 'failed';
  readonly snapshot: FieldShortcutRecoverySnapshot; readonly reasonCode: FieldShortcutRecoveryReason;
}
/** Types-only checkpoint until the actual GameApplication methods are implemented and verified. */
export interface FieldShortcutRecoveryFacade {
  fieldShortcutRecovery(request: unknown): FieldShortcutRecoverySnapshot;
  retryFieldShortcutRecovery(request: unknown): Promise<FieldShortcutRecoveryActionOutcome>;
  cancelFieldShortcutRecovery(request: unknown): Promise<FieldShortcutRecoveryActionOutcome>;
}

/** Formatting only. These flags never authenticate an action. */
export function shortcutRecoverySnapshot(status: FieldShortcutRecoveryStatus, phase: FieldShortcutRecoveryPhase = 'unavailable',
  physical: FieldShortcutRecoveryPhysical = 'unavailable', reasonCode: FieldShortcutRecoveryReason = null,
  retry = false, cancel = false, disabled: FieldShortcutRecoveryReason = 'not-retryable'): FieldShortcutRecoverySnapshot {
  return Object.freeze({ status, phase, physical, reasonCode,
    retry: Object.freeze({ enabled: retry, disabledReason: retry ? null : disabled }),
    cancel: Object.freeze({ enabled: cancel, disabledReason: cancel ? null : disabled === 'operation-active' || disabled === 'executing' || disabled === 'request-unavailable' ? disabled : 'not-cancellable' }) });
}

/** Sanitize internal failures without publishing host strings or authority. */
export function shortcutRecoveryReason(reason: string | undefined, fallback: FieldShortcutRecoveryReason): FieldShortcutRecoveryReason {
  if (!reason) return fallback;
  if (/source|stale|content|identity|generation|target-moved|retained-native|native-arrival-proof/.test(reason)) return 'source-changed';
  if (/operation-active|management-active/.test(reason)) return 'operation-active';
  return fallback;
}
