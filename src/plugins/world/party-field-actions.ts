/** Explicit attachment for PS_Management's own current party controller. Never patches ordinary menus. */
import { createFieldShortcutMenus } from './field-shortcut-menu';
import type { FieldMenuHandle, FieldMenuOptions } from './field-shortcut-menu';

interface PartyHost {
  currentCaller(): object | null;
  /** Suspend only that caller's controls; returned function restores its previous active state. */
  pause(caller: object): () => void;
}
type Options = Omit<FieldMenuOptions, 'entry' | 'memberId' | 'onClose' | 'onDispose'> & { onAccepted?(): void };
export function createPartyFieldActions(host: PartyHost) {
  const menus = createFieldShortcutMenus();
  return {
    pending: menus.pending,
    open(caller: object, memberId: string, options: Options): FieldMenuHandle | null {
      const current = (): boolean => host.currentCaller() === caller && options.isCurrent();
      if (menus.pending() || !current() || !options.query.snapshot(memberId).moves.length || !current()) return null;
      const resume = host.pause(caller);
      if (!current()) return null;
      let restored = false;
      const restore = (): void => { if (!restored && current() && !menus.pending()) { restored = true; resume(); } };
      try {
        const handle = menus.open({ ...options, entry: 'party', memberId, isCurrent: current,
          onDispose: restore,
          onClose(reason) { if (reason === 'accepted' && current()) options.onAccepted?.(); } });
        if (!handle) restore();
        return handle;
      } catch (error) { restore(); throw error; }
    },
  };
}
