/** Stable F failures allow saving and one explicit retry, without granting native authority. */
import type { HostApplication } from '../application-host';
import type { BlackoutRunResult } from '../../framework/app/blackout-operation';
import { hostRecord, invoke } from './host-access';

type Application = Pick<HostApplication, 'stateGeneration' | 'blackoutRecoveryPending' | 'saveBlocked'>;
interface Options {
  readonly root: Record<string, unknown>;
  application(): Application | null;
  pending(): boolean;
  retry(application: Application): Promise<BlackoutRunResult>;
  text(key: 'retry' | 'restricted' | 'failed'): string;
  diagnostic(reason: string): void;
}
interface Intent { readonly app: Application; readonly generation: number; running: boolean }
const symbol = 'psBlackoutRetry';
export function installBlackoutRecoveryMenuMZ(options: Options): void {
  const { root } = options;
  let intent: Intent | null = null, noticed: { app: Application; generation: number } | null = null;
  const current = (value: Intent): boolean => options.application() === value.app
    && value.app.stateGeneration === value.generation && value.app.blackoutRecoveryPending;
  const available = (app: Application | null): app is Application => !!app && app.blackoutRecoveryPending
    && !app.saveBlocked && !options.pending();
  const message = (key: 'restricted' | 'failed'): void => { invoke(root.$gameMessage, 'add', [options.text(key)]); };
  const command = hostRecord(hostRecord(root.Window_MenuCommand)?.prototype);
  const originalList = command?.makeCommandList, originalCommands = command?.addOriginalCommands;
  if (command && typeof originalCommands === 'function') command.addOriginalCommands = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(originalCommands, this, args), app = options.application();
    if (app?.blackoutRecoveryPending) invoke(this, 'addCommand', [options.text('retry'), symbol, available(app)]);
    return result;
  };
  if (command && typeof originalList === 'function') command.makeCommandList = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(originalList, this, args);
    if (options.application()?.blackoutRecoveryPending) {
      const list = hostRecord(this)?._list;
      if (Array.isArray(list)) for (const value of list) {
        const row = hostRecord(value);
        if (row && row.symbol !== 'save' && row.symbol !== 'gameEnd' && row.symbol !== symbol) row.enabled = false;
      }
    }
    return result;
  };
  const menu = hostRecord(hostRecord(root.Scene_Menu)?.prototype), create = menu?.createCommandWindow;
  if (menu && typeof create === 'function') menu.createCommandWindow = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(create, this, args);
    invoke(hostRecord(this)?._commandWindow, 'setHandler', [symbol, () => {
      const app = options.application();
      if (intent || !available(app)) { invoke(hostRecord(this)?._commandWindow, 'activate'); return; }
      const requested: Intent = { app, generation: app.stateGeneration, running: false };
      intent = requested;
      try { invoke(root.SceneManager, 'pop'); }
      catch (error) { if (intent === requested) intent = null; options.diagnostic(String(error)); invoke(hostRecord(this)?._commandWindow, 'activate'); }
    }]);
    return result;
  };
  const map = hostRecord(hostRecord(root.Scene_Map)?.prototype), update = map?.update;
  if (map && typeof update === 'function') map.update = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(update, this, args);
    const app = options.application(), requested = intent;
    if (requested && !current(requested)) intent = null;
    if (!app?.blackoutRecoveryPending) { noticed = null; return result; }
    if (hostRecord(root.SceneManager)?._scene !== this || invoke(this, 'isActive') !== true
      || invoke(root.SceneManager, 'isSceneChanging') !== false || invoke(root.$gamePlayer, 'isTransferring') !== false
      || invoke(root.$gameMessage, 'isBusy') !== false || !available(app)) return result;
    if (intent && !intent.running) {
      const running = intent; running.running = true;
      // Only the production retry closure can authenticate the actual new Map/source.
      // This UI schedules intent; it never constructs an owner, ready frame or receipt.
      void Promise.resolve().then(() => {
        if (intent !== running || !current(running)) return null;
        return options.retry(running.app);
      }).then(outcome => {
        if (intent !== running) return;
        intent = null;
        if (outcome && current(running) && (outcome.status === 'failed' || outcome.status === 'cancelled')) {
          options.diagnostic(outcome.status === 'failed' ? outcome.reason : 'blackout-retry-cancelled'); message('failed');
        }
      }, error => {
        if (intent !== running) return;
        intent = null;
        if (current(running)) { options.diagnostic(String(error)); message('failed'); }
      });
    } else if (!intent && (!noticed || noticed.app !== app || noticed.generation !== app.stateGeneration)) {
      noticed = { app, generation: app.stateGeneration }; message('restricted');
    }
    return result;
  };
}
