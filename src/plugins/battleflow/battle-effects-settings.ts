/** MZ player preference. The battle captures its effective value before any scene is shown. */
export function parseBattleEffects(value: unknown): boolean | undefined {
  if (value === undefined || value === '' || value === 'inherit') return undefined;
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new Error('battleEffects must be on, off or inherit');
}

function preference(config: any): boolean {
  // The old unregistered field was used by controlled hosts and author scripts.
  // A present new field owns the preference, including invalid-data fallback.
  if (config && Object.hasOwn(config, 'psBattleEffects')) return config.psBattleEffects !== false;
  return config?.battleEffects !== false;
}
export function playerBattleEffects(host: any): boolean { return preference(host.ConfigManager); }
/** Direct author requests use booleans; event strings are normalized at the command boundary. */
export function effectiveBattleEffects(host: any, override: unknown): boolean {
  if (override !== undefined && typeof override !== 'boolean') throw new Error('battleEffects must be boolean when provided');
  return override ?? playerBattleEffects(host);
}

const installed = new WeakSet<object>();
/** The existing MZ ConfigManager and Options remain the persistence/input owner. */
export function installBattleEffectsSettings(host: any, translator: () => { t(key: string): string }): void {
  const config = host.ConfigManager, win = host.Window_Options?.prototype;
  if (!config || installed.has(config) || typeof config.makeData !== 'function' || typeof config.applyData !== 'function') return;
  installed.add(config);
  config.psBattleEffects = preference(config);
  const make = config.makeData, apply = config.applyData;
  config.makeData = function (...args: any[]) { return { ...make.apply(this, args), psBattleEffects: this.psBattleEffects !== false }; };
  config.applyData = function (data: any, ...args: any[]) {
    const result = apply.call(this, data, ...args);
    this.psBattleEffects = preference(data);
    return result;
  };
  if (!win) return;
  const general = win.addGeneralOptions, status = win.statusText, ok = win.processOk, right = win.cursorRight, left = win.cursorLeft;
  win.addGeneralOptions = function (...args: any[]) { general.apply(this, args); this.addCommand(translator().t('ui.options.battle_effects'), 'psBattleEffects'); };
  win.statusText = function (index: number) {
    return this.commandSymbol(index) === 'psBattleEffects'
      ? translator().t(this.getConfigValue('psBattleEffects') === false ? 'ui.options.effects_off' : 'ui.options.effects_on')
      : status.call(this, index);
  };
  const change = (window: any, value: boolean) => { if (window.isCommandEnabled(window.index())) window.changeValue('psBattleEffects', value); };
  win.processOk = function (...args: any[]) {
    if (this.commandSymbol(this.index()) !== 'psBattleEffects') return ok.apply(this, args);
    change(this, this.getConfigValue('psBattleEffects') === false);
  };
  win.cursorRight = function (...args: any[]) { if (this.commandSymbol(this.index()) === 'psBattleEffects') change(this, false); else right.apply(this, args); };
  win.cursorLeft = function (...args: any[]) { if (this.commandSymbol(this.index()) === 'psBattleEffects') change(this, true); else left.apply(this, args); };
  const scene = host.Scene_Options?.prototype, count = scene?.maxCommands;
  if (typeof count === 'function') scene.maxCommands = function (...args: any[]) { return count.apply(this, args) + 1; };
}
