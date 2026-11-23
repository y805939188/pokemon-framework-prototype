/** A Fly destination is an intent. The App re-derives it after this picker has closed. */
import type { FlyDestination } from '../../framework/rules/region-map';
import { InputLatch } from '../management/model';
import type { InputFrame } from '../management/model';

export interface FlyMenuModel {
  readonly regionId: number; readonly destinations: readonly FlyDestination[]; readonly row: number;
}
export interface FlyMenuView { show(model: FlyMenuModel): void; dispose(): void }
export type FlyMenuResult = { readonly status: 'selected'; readonly destination: FlyDestination } | { readonly status: 'cancelled' };
export interface FlyMenuHandle {
  readonly result: Promise<FlyMenuResult>;
  update(input: InputFrame): void;
  select(value: unknown): boolean;
  cancel(): void;
  dispose(): void;
}
interface Options {
  readonly regionId: number; readonly destinations: readonly FlyDestination[]; readonly view: FlyMenuView;
  readonly initialInput: InputFrame;
  isCurrent(): boolean;
}
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function matches(value: unknown, destination: FlyDestination): boolean {
  const target = own(value, 'target');
  return own(value, 'regionId') === destination.regionId && own(value, 'pointIndex') === destination.pointIndex
    && own(value, 'x') === destination.x && own(value, 'y') === destination.y
    && own(target, 'mapId') === destination.target.mapId && own(target, 'x') === destination.target.x && own(target, 'y') === destination.target.y;
}
export function createFlyDestinationMenus() {
  let active: object | null = null;
  return {
    pending: (): boolean => active !== null,
    open(options: Options): FlyMenuHandle | null {
      if (active) { options.view.dispose(); return null; }
      const owner = {}; active = owner;
      let closed = false, row = 0, settle!: (result: FlyMenuResult) => void;
      const result = new Promise<FlyMenuResult>(resolve => { settle = resolve; });
      const latch = new InputLatch(); latch.arm(options.initialInput.pressed);
      const current = (): boolean => !closed && active === owner && options.isCurrent();
      const finish = (answer: FlyMenuResult): void => {
        if (closed) return;
        closed = true; if (active === owner) active = null;
        try { options.view.dispose(); }
        finally { settle(answer); }
      };
      const handle: FlyMenuHandle = {
        result,
        select(value) {
          if (!current()) { finish({ status: 'cancelled' }); return false; }
          const found = options.destinations.find(destination => matches(value, destination));
          if (!found || !current()) return false;
          const destination = Object.freeze({ ...found, target: Object.freeze({ ...found.target }) });
          finish({ status: 'selected', destination }); return true;
        },
        update(frame) {
          if (!current()) { finish({ status: 'cancelled' }); return; }
          const input = latch.filter(frame);
          if (input.triggered.back) { finish({ status: 'cancelled' }); return; }
          if (input.repeated.up) row = Math.max(0, row - 1);
          else if (input.repeated.down) row = Math.min(options.destinations.length, row + 1);
          else if (input.triggered.use) {
            const destination = options.destinations[row];
            if (destination) handle.select(destination); else finish({ status: 'cancelled' });
            return;
          } else return;
          options.view.show({ regionId: options.regionId, destinations: options.destinations, row });
          if (!current()) finish({ status: 'cancelled' });
        },
        cancel() { finish({ status: 'cancelled' }); },
        dispose() { finish({ status: 'cancelled' }); },
      };
      try {
        if (!current()) { finish({ status: 'cancelled' }); return null; }
        options.view.show({ regionId: options.regionId, destinations: options.destinations, row });
        if (!current()) { finish({ status: 'cancelled' }); return null; }
        return handle;
      } catch (error) { finish({ status: 'cancelled' }); throw error; }
    },
  };
}
