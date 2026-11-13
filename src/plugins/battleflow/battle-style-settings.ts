/** MZ player preference only. A battle captures it before its Map transition; rules may override it. */
export type BattleStyle = 'switch' | 'set';
export function parseBattleStyle(value: unknown): BattleStyle | undefined {
  if (value === undefined || value === '' || value === 'inherit') return undefined;
  if (value === 'switch' || value === 'set') return value;
  throw new Error('battleStyle must be switch, set or inherit');
}
export function playerBattleStyle(host: any): BattleStyle {
  return host.ConfigManager?.psBattleStyle === 'set' ? 'set' : 'switch';
}
export function effectiveBattleStyle(host: any, override: unknown): BattleStyle {
  return parseBattleStyle(override) ?? playerBattleStyle(host);
}
const installed = new WeakSet<object>();
/** Existing MZ configuration persistence and Options navigation remain the owner of saving and input. */
export function installBattleStyleSettings(host: any, translator: () => { t(key: string): string }): void {
  const config = host.ConfigManager, win = host.Window_Options?.prototype;
  if (!config || installed.has(config) || typeof config.makeData !== 'function' || typeof config.applyData !== 'function') return;
  installed.add(config);
  config.psBattleStyle = playerBattleStyle(host);
  const make = config.makeData, apply = config.applyData;
  config.makeData = function (...args: any[]) { return { ...make.apply(this, args), psBattleStyle: this.psBattleStyle === 'set' ? 'set' : 'switch' }; };
  config.applyData = function (data: any, ...args: any[]) {
    const result = apply.call(this, data, ...args);
    this.psBattleStyle = data?.psBattleStyle === 'set' ? 'set' : 'switch';
    return result;
  };
  if (!win) return;
  const general = win.addGeneralOptions, status = win.statusText, ok = win.processOk, right = win.cursorRight, left = win.cursorLeft;
  win.addGeneralOptions = function (...args: any[]) { general.apply(this, args); this.addCommand(translator().t('ui.options.battle_style'), 'psBattleStyle'); };
  win.statusText = function (index: number) {
    return this.commandSymbol(index) === 'psBattleStyle'
      ? translator().t(this.getConfigValue('psBattleStyle') === 'set' ? 'ui.options.style_set' : 'ui.options.style_switch')
      : status.call(this, index);
  };
  const change = (window: any, value: BattleStyle) => { if (window.isCommandEnabled(window.index())) window.changeValue('psBattleStyle', value); };
  win.processOk = function (...args: any[]) {
    if (this.commandSymbol(this.index()) !== 'psBattleStyle') return ok.apply(this, args);
    change(this, this.getConfigValue('psBattleStyle') === 'set' ? 'switch' : 'set');
  };
  win.cursorRight = function (...args: any[]) { if (this.commandSymbol(this.index()) === 'psBattleStyle') change(this, 'set'); else right.apply(this, args); };
  win.cursorLeft = function (...args: any[]) { if (this.commandSymbol(this.index()) === 'psBattleStyle') change(this, 'switch'); else left.apply(this, args); };
  const scene = host.Scene_Options?.prototype, count = scene?.maxCommands;
  if (typeof count === 'function') scene.maxCommands = function (...args: any[]) { return count.apply(this, args) + 1; };
}
