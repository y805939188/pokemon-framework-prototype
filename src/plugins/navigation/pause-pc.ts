import { installPauseManualSave } from './manual-save';
import { openHallOfFame } from './hall-of-fame-pc';

/** WP65 §6–7: compose implemented screens around the native MZ menu/scene stack. */
export function installPausePC(G: any, flow: () => any, management: any): void {
  const tr = (key: string, params?: Record<string, string | number>) => flow().translator().t('navigation.' + key, params);
  installPauseManualSave(G, () => flow().translator());
  const commands = G.Window_MenuCommand?.prototype, menu = G.Scene_Menu?.prototype;
  if (typeof commands?.makeCommandList === 'function' && menu) {
    const make = commands.makeCommandList, create = menu.create, update = menu.update;
    const order: Record<string, number> = { psPokedex: 10, psParty: 20, psBag: 30, psTrainerCard: 50, save: 60, options: 70, gameEnd: 90 };
    const nativeActors = new Set(['item', 'skill', 'equip', 'status', 'formation']);
    commands.makeCommandList = function (...args: any[]) {
      make.apply(this, args);
      // Existing registrars still decide dex access, operation guards and recovery restrictions.
      let hasParty = false;
      try { hasParty = flow().game().party?.length > 0; } catch { /* no installed player */ }
      this._list = this._list.filter((row: any) => !nativeActors.has(row.symbol) && (row.symbol !== 'psParty' || hasParty));
      for (const row of this._list) {
        if (row.symbol === 'options') row.name = tr('pause.options');
        else if (row.symbol === 'save') row.name = tr('pause.save');
        else if (row.symbol === 'gameEnd') row.name = tr('pause.quit');
      }
      this._list.sort((a: any, b: any) => (order[a.symbol] ?? 80) - (order[b.symbol] ?? 80));
      this._psLanguage = flow().translator().lang;
    };
    // Keep the native selectable, scrolling, remembered symbol and cancel button.
    menu.commandWindowRect = function () {
      const width = Math.min(360, G.Graphics.boxWidth), top = this.mainAreaTop();
      return new G.Rectangle((G.Graphics.boxWidth - width) / 2, top, width, this.mainAreaHeight());
    };
    if (typeof create === 'function') menu.create = function (...args: any[]) {
      create.apply(this, args);
      this._goldWindow.hide(); this._statusWindow.hide();
      // A rejected push has no child to reactivate this native command window on return.
      this._commandWindow.setHandler('psParty', () => {
        if (!management.openParty()) { G.SoundManager.playBuzzer(); this._commandWindow.activate(); }
      });
    };
    if (typeof update === 'function') menu.update = function (...args: any[]) {
      const window = this._commandWindow;
      if (window && window._psLanguage !== flow().translator().lang) {
        const symbol = window.currentSymbol(); window.refresh(); window.selectSymbol(symbol);
      }
      update.apply(this, args);
      if (this._commandWindow.active && !G.SceneManager.isSceneChanging() && G.Input.isTriggered('menu')) this._commandWindow.processCancel();
    };
  }

  interface Request { application: any; generation: number; closed: boolean; opened: boolean }
  let active: Request | null = null;
  const waits = new WeakMap<object, Request>();
  const current = (r: Request | null): boolean => !!r && active === r && !r.closed && flow()._app === r.application && r.application.stateGeneration === r.generation;
  function PC(this: any) { this.initialize(); }
  PC.prototype = Object.create(G.Scene_MenuBase.prototype); PC.prototype.constructor = PC;
  const P = PC.prototype;
  P.initialize = function () { G.Scene_MenuBase.prototype.initialize.call(this); this._request = active; };
  P.create = function () {
    G.Scene_MenuBase.prototype.create.call(this);
    const request: Request | null = this._request;
    if (!request || !current(request)) return;
    const game = flow().game();
    const width = Math.min(560, G.Graphics.boxWidth), top = this._cancelButton ? this._cancelButton.y + this._cancelButton.height : 0;
    const heading = new G.Window_Base(new G.Rectangle((G.Graphics.boxWidth - width) / 2, top, width, 100));
    this._heading = heading; this._playerName = game.player.name;
    this.addWindow(heading);
    this._commands = commandWindow(new G.Rectangle((G.Graphics.boxWidth - width) / 2, top + 100, width, G.Graphics.boxHeight - top - 100),
      (game.hallOfFame?.entryCount ?? 0) > 0);
    this.addWindow(this._commands);
    this._commands.setHandler('storage', () => {
      if (!current(this._request) || !management.openStorage()) { G.SoundManager.playBuzzer(); this._commands.activate(); }
    });
    this._commands.setHandler('hallOfFame', () => {
      if (!current(request) || G.SceneManager._scene !== this || G.SceneManager.isSceneChanging()) return;
      const history = request.application.hallOfFameSnapshot();
      if (history && history.entryCount > 0) openHallOfFame(G, flow, history, () => current(request));
      else { G.SoundManager.playBuzzer(); this._commands.activate(); }
    });
    this._commands.setHandler('logoff', () => { G.SoundManager.playCancel(); this.popScene(); });
    this._commands.setHandler('cancel', () => this.popScene());
    this._cancelButton?.setClickHandler(() => { G.SoundManager.playCancel(); this.popScene(); });
    this.refreshText();
  };
  P.refreshText = function () {
    const heading = this._heading;
    heading.contents.clear(); heading.resetFontSettings();
    const font = flow().translator().font?.(); if (font) heading.contents.fontFace = font;
    heading.drawText(tr('pc.boot', { name: this._playerName }), 0, 0, heading.innerWidth);
    const symbol = this._commands.currentSymbol(); this._commands.refresh(); this._commands.selectSymbol(symbol);
    this._language = flow().translator().lang;
  };
  P.update = function () {
    if (!current(this._request)) { this.popScene(); return; }
    if (this._language !== flow().translator().lang) this.refreshText();
    G.Scene_MenuBase.prototype.update.call(this);
  };
  P.start = function () {
    G.Scene_MenuBase.prototype.start.call(this);
    if (!current(this._request)) { this.popScene(); return; }
    if (!this._request.opened) { this._request.opened = true; G.SoundManager.playOk(); }
    this._commands.select(0); this._commands.activate();
  };
  P.popScene = function () {
    const r: Request = this._request;
    if (G.SceneManager._scene !== this || G.SceneManager.isSceneChanging()) return;
    if (active === r && r) { r.closed = true; active = null; }
    G.Scene_MenuBase.prototype.popScene.call(this);
  };
  // Resolve the native command-window dependency when this presenter is actually opened.
  function commandWindow(rect: any, hasHallOfFame: boolean) {
    function Commands(this: any, bounds: any) { G.Window_Command.prototype.initialize.call(this, bounds); }
    Commands.prototype = Object.create(G.Window_Command.prototype); Commands.prototype.constructor = Commands;
    Commands.prototype.makeCommandList = function () {
      this.addCommand(tr('pc.storage'), 'storage');
      if (hasHallOfFame) this.addCommand(tr('hallOfFame.title'), 'hallOfFame');
      this.addCommand(tr('pc.logoff'), 'logoff');
    };
    return new (Commands as any)(rect);
  }
  function openPC(): Request | null {
    if (active || G.SceneManager.isSceneChanging() || flow().operationPending() || management.presentationPending()) return null;
    const application = flow().app(), r: Request = { application, generation: application.stateGeneration, closed: false, opened: false };
    active = r;
    try { G.SceneManager.push(PC); return r; }
    catch (error) { active = null; throw error; }
  }
  G.PSNavigation = { openPC: () => !!openPC() }; G.Scene_PSPC = PC;
  G.PluginManager.registerCommand('PS_Management', 'ShowPC', function (this: any) {
    const request = openPC();
    if (!request) { G.SoundManager.playBuzzer(); return; }
    waits.set(this, request); this.setWaitMode('psPC');
  });
  const interpreter = G.Game_Interpreter.prototype, wait = interpreter.updateWaitMode;
  interpreter.updateWaitMode = function (...args: any[]) {
    const r = waits.get(this);
    if (this._waitMode !== 'psPC' || !r) return wait.apply(this, args);
    // Keep the event suspended through both the child return and the final native map transition.
    if (current(r) || r.closed && G.SceneManager.isSceneChanging()) return true;
    waits.delete(this); this._waitMode = ''; return false;
  };
}
