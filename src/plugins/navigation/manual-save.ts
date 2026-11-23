interface Text { t(key: string, params?: Record<string, string | number>): string }

/** WP65 §4.1: confirm the destination before the pause menu invokes native manual saving. */
export function installPauseManualSave(G: any, translator: () => Text): void {
  const save = G.Scene_Save?.prototype, menu = G.Scene_Menu?.prototype;
  if (!save || !menu || !G.Window_Command) return;
  const tr = (key: string, params?: Record<string, string | number>) => translator().t('navigation.manualSave.' + key, params);

  function Confirmation(this: any, rect: any) { G.Window_Command.prototype.initialize.call(this, rect); }
  Confirmation.prototype = Object.create(G.Window_Command.prototype);
  Confirmation.prototype.constructor = Confirmation;
  Confirmation.prototype.makeCommandList = function () {
    this.addCommand(tr('yes'), 'yes');
    this.addCommand(tr('no'), 'no');
  };

  function PauseSave(this: any) { this.initialize(); }
  PauseSave.prototype = Object.create(save);
  PauseSave.prototype.constructor = PauseSave;
  const P = PauseSave.prototype;
  const current = (scene: any) => G.SceneManager._scene === scene && !G.SceneManager.isSceneChanging();
  P.helpWindowText = function () { return tr('selectSlot'); };
  P.create = function () {
    save.create.call(this);
    const width = Math.min(320, G.Graphics.boxWidth), height = this.calcWindowHeight(2, true);
    const rect = new G.Rectangle((G.Graphics.boxWidth - width) / 2, (G.Graphics.boxHeight - height) / 2, width, height);
    const choice = this._psSaveChoice = new (Confirmation as any)(rect);
    this.addWindow(choice);
    // Accept a new press on either side of the modal. Native Back repeats even when _canRepeat is false.
    for (const window of [this._listWindow, choice]) {
      window._canRepeat = false;
      window.isCancelTriggered = () => G.Input.isTriggered('cancel');
    }
    choice.hide(); choice.deactivate();
    const choose = (yes: boolean) => {
      const request = this._psSaveRequest;
      if (!request || !current(this)) return;
      this._psSaveRequest = null;
      choice.hide(); choice.deactivate();
      if (!yes) { this._helpWindow.setText(this.helpWindowText()); this.activateListWindow(); return; }
      if (G.$gameSystem !== request.system || !G.$gameSystem.isSaveEnabled() || !this.isSavefileEnabled(request.slot)) {
        this.onSaveFailure(); return;
      }
      // File presence, not the title index: a previous file can exist without a preview row.
      if (!request.occupied && G.DataManager.savefileExists(request.slot)) { show(request.slot, true); return; }
      this._psSaveWriting = true;
      try { this.executeSave(request.slot); } catch { this.onSaveFailure(); }
    };
    const show = (slot: number, occupied: boolean) => {
      this._psSaveRequest = { slot, occupied, system: G.$gameSystem };
      this._helpWindow.setText(tr(occupied ? 'overwrite' : 'confirm', { slot }));
      choice.refresh(); choice.selectSymbol('no'); choice.show(); choice.activate();
    };
    this._psShowSaveChoice = show;
    choice.setHandler('yes', () => choose(true));
    choice.setHandler('no', () => choose(false));
    choice.setHandler('cancel', () => choose(false));
  };
  P.onSavefileOk = function () {
    if (!current(this) || this._psSaveRequest || this._psSaveWriting) return;
    const slot = this.savefileId();
    if (!G.$gameSystem.isSaveEnabled() || !this.isSavefileEnabled(slot)) { this.onSaveFailure(); return; }
    this._psShowSaveChoice(slot, G.DataManager.savefileExists(slot));
  };
  P.onSaveSuccess = function () { if (current(this)) save.onSaveSuccess.call(this); };
  P.onSaveFailure = function () {
    if (!current(this)) return;
    this._psSaveWriting = false;
    this._helpWindow.setText(tr('failed'));
    save.onSaveFailure.call(this);
  };

  // Other native Scene_Save users, autosave and Continue keep their own entry points.
  menu.commandSave = function () { G.SceneManager.push(PauseSave); };
}
