/** Caller-owned presentation only: no global input hook, persistent write, operation token or execution lease. */
import { fieldShortcutSelection } from '../../framework/app/field-shortcut-query';
import type { FieldShortcutQueries, FieldShortcutSelection, FieldShortcutSnapshot } from '../../framework/app/field-shortcut-query';
import type { InputFrame } from '../management/model';
import { InputLatch } from '../management/model';

export type FieldMenuEntry = 'shortcut' | 'party';
export type FieldMenuRow = FieldShortcutSnapshot['moves'][number] | FieldShortcutSnapshot['items'][number];
export interface FieldMenuModel {
  readonly entry: FieldMenuEntry;
  readonly columns: readonly [readonly FieldMenuRow[], readonly FieldMenuRow[]];
  readonly column: 0 | 1; readonly row: number; readonly empty: boolean; readonly message?: string;
}
export interface FieldMenuView { show(model: FieldMenuModel): void; hide(): void; dispose(): void }
export interface FieldMenuOptions {
  readonly entry: FieldMenuEntry; readonly memberId?: string; readonly query: FieldShortcutQueries; readonly view: FieldMenuView;
  /** Must bind application, generation, scene and actual parent caller, rather than a displayed DTO. */
  isCurrent(): boolean;
  /** Sole execution boundary. The production parent must freshly admit and validate this identity again. */
  admit(selection: FieldShortcutSelection, entry: FieldMenuEntry): Promise<unknown> | unknown;
  onClose?(reason: 'accepted' | 'cancelled'): void;
  /** Release the current caller's presentation controls, including explicit scene disposal. */
  onDispose?(): void;
  readonly initialInput?: InputFrame;
}
export interface FieldMenuHandle {
  snapshot(): FieldMenuModel;
  refresh(): void;
  update(frame: InputFrame): boolean;
  select(selection: unknown): Promise<boolean>;
  cancel(): boolean;
  dispose(): void;
}
function same(a: FieldShortcutSelection, b: FieldShortcutSelection): boolean {
  return a.kind === 'item' ? b.kind === 'item' && a.itemId === b.itemId : b.kind === 'move' && a.memberId === b.memberId && a.moveId === b.moveId;
}
function outcome(value: unknown): { accepted: boolean; message?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { accepted: false, message: 'invalid-field-admission-result' };
  const status = Object.getOwnPropertyDescriptor(value, 'status'), reason = Object.getOwnPropertyDescriptor(value, 'reason');
  const code: unknown = status && 'value' in status ? status.value : undefined;
  if (code === 'completed' || code === 'duplicate' || code === 'handoff' || code === 'accepted') return { accepted: true };
  if (code === 'cancelled') return { accepted: false };
  const message: unknown = reason && 'value' in reason ? reason.value : undefined;
  return { accepted: false, message: typeof message === 'string' && message.length > 0 ? message : 'field-admission-refused' };
}
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function createFieldShortcutMenus() {
  let active: FieldMenuHandle | null = null;
  return {
    pending: (): boolean => active !== null,
    open(options: FieldMenuOptions): FieldMenuHandle | null {
      if (active || !options.isCurrent() || options.entry === 'party' && !options.memberId) return null;
      let closed = false, selectionOwner: object | null = null, column: 0 | 1 = 0, row = 0, message: string | undefined;
      let columns: FieldMenuModel['columns'] = [[], []];
      const latch = new InputLatch(); if (options.initialInput) latch.arm(options.initialInput.pressed);
      const current = (): boolean => {
        if (closed || active !== handle) return false;
        try { return options.isCurrent(); } catch { return false; }
      };
      const dispose = (): void => {
        if (closed) return;
        const wasCurrent = current();
        closed = true; if (active === handle) active = null;
        try { options.view.dispose(); }
        finally { if (wasCurrent && active === null && options.isCurrent()) options.onDispose?.(); }
      };
      const finish = (reason: 'accepted' | 'cancelled'): void => {
        if (!current()) { dispose(); return; }
        dispose();
        // dispose() can reenter the host and install a new menu. An old receipt cannot resume it.
        if (active === null && options.isCurrent()) options.onClose?.(reason);
      };
      const model = (): FieldMenuModel => ({ entry: options.entry, columns, column, row, empty: !columns[0].length && !columns[1].length, ...(message === undefined ? {} : { message }) });
      const refresh = (): void => {
        if (!current()) { dispose(); return; }
        const snapshot = options.query.snapshot(options.memberId);
        if (!current()) { dispose(); return; }
        if (snapshot.status === 'stale') message = snapshot.reason;
        columns = [snapshot.moves, options.entry === 'party' ? [] : snapshot.items];
        if (!columns[column].length && columns[column === 0 ? 1 : 0].length) column = column === 0 ? 1 : 0;
        row = Math.min(row, columns[column].length);
        options.view.show(model());
        if (!current()) dispose();
      };
      const handle: FieldMenuHandle = {
        snapshot: model,
        refresh,
        async select(value) {
          if (selectionOwner) return false;
          // Reserve before isCurrent(), identity parsing or any query/provider callback can reenter.
          const reservation = {}; selectionOwner = reservation;
          let repaint = false;
          try {
            if (!current()) { dispose(); return false; }
            const selection = fieldShortcutSelection(value);
            if (!selection || !columns.flat().some(entry => same(entry, selection))) return false;
            const resolved = options.query.resolve(selection, options.memberId);
            if (!current()) { dispose(); return false; }
            if (resolved.status !== 'available') { message = resolved.reason; repaint = true; return false; }
            // A projection can identify a choice, but cannot switch it or authorize execution.
            if (!same(resolved.selection, selection)) { message = 'invalid-shortcut-resolution'; repaint = true; return false; }
            options.view.hide();
            if (!current()) { dispose(); return false; }
            const result = outcome(await options.admit(selection, options.entry));
            if (!current()) { dispose(); return false; }
            if (result.accepted) { finish('accepted'); return true; }
            message = result.message; repaint = true;
          } catch (error) {
            if (!current()) { dispose(); return false; }
            message = errorText(error); repaint = true;
          } finally {
            try { if (repaint) { if (current()) refresh(); else dispose(); } }
            finally { if (selectionOwner === reservation) selectionOwner = null; }
          }
          return false;
        },
        update(frame) {
          if (!current()) { dispose(); return false; }
          if (selectionOwner) return false;
          const input = latch.filter(frame);
          if (input.triggered.back) { finish('cancelled'); return true; }
          const direction = (['up', 'down', 'left', 'right'] as const).find(key => input.repeated[key]);
          if (direction) {
            if ((direction === 'left' || direction === 'right') && options.entry === 'shortcut') { column = direction === 'left' ? 0 : 1; row = Math.min(row, columns[column].length); }
            else if (direction === 'up') row = Math.max(0, row - 1);
            else if (direction === 'down') row = Math.min(columns[column].length, row + 1);
            options.view.show(model());
            if (!current()) dispose();
            return true;
          }
          if (input.triggered.use) {
            const selected = columns[column][row];
            if (selected) void handle.select(selected); else finish('cancelled');
            return true;
          }
          return false;
        },
        cancel() { if (!current()) { dispose(); return false; } if (selectionOwner) return false; finish('cancelled'); return true; },
        dispose,
      };
      active = handle;
      try { refresh(); } catch (error) { dispose(); throw error; }
      return closed ? null : handle;
    },
  };
}
