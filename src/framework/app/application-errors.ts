export const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A failed installation may be proved zero-write or indeterminate; the owner must not guess or roll back a partial write. */
export class StateInstallFailed extends Error {
  readonly indeterminate: boolean;
  constructor(error: unknown, indeterminate = false) { super(message(error)); this.indeterminate = indeterminate; }
}
