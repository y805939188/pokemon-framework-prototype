import { AuthorParameterError, authorJson, registerAuthorCommand } from './author-command';
import { messageLiteral } from '../message-literal';

export interface MessageChoices {
  inline(choices: string[], cancel: number, result: (index: number) => void, isCurrent: () => boolean): void;
}

/** WP17-B owns explicit and inline requests; native event choices retain their contract. */
export function installMessageChoices(G: any, language: () => string): MessageChoices | undefined {
  const choice = G.Window_ChoiceList?.prototype, message = G.Game_Message?.prototype, interpreter = G.Game_Interpreter?.prototype;
  if (!choice || !message || !interpreter?.command357) return;
  interface Request { cancel: number; help: string[] | null; inline: boolean; finished: boolean; host: object; scene?: object; window?: any; isCurrent?: () => boolean }
  const requests = new WeakMap<object, Request>(), helps = new WeakMap<object, any>(), windows = new WeakMap<object, Request>();
  const owned = (): Request | undefined => requests.get(G.$gameMessage);
  const requestCurrent = (request: Request): boolean => owned() === request && G.$gameMessage === request.host &&
    !request.finished && !!request.window && request.scene === G.SceneManager._scene && !G.SceneManager.isSceneChanging() &&
    request.window.isOpen() && (!request.isCurrent || request.isCurrent());
  const open = (choices: string[], initial: number, cancel: number, help: string[] | null, result: (index: number) => void, inline = false, isCurrent?: () => boolean): void => {
    const host = G.$gameMessage, request: Request = { cancel, help, inline, finished: false, host, isCurrent };
    requests.set(host, request);
    host.setChoices(choices.map(messageLiteral), initial, cancel > 0 ? cancel - 1 : cancel);
    host.setChoiceBackground(0); host.setChoicePositionType(2);
    host.setChoiceCallback((index: number) => {
      if (!requestCurrent(request)) return;
      request.finished = true;
      result(index);
    });
  };
  const array = (text: string, name: string): string[] | null => {
    const value: unknown = authorJson(text, name);
    if (value === null || (Array.isArray(value) && value.every(item => typeof item === 'string'))) return value;
    throw new AuthorParameterError(name, 'Use a JSON string array or null.');
  };
  const integer = (text: string, name: string): number => {
    const value = Number(text);
    if (text.trim() && Number.isSafeInteger(value)) return value;
    throw new AuthorParameterError(name, 'Use an integer.');
  };
  const command = interpreter.command357;
  interpreter.command357 = function(params: any[]) {
    if (params[0] === 'PS_Management' && params[1] === 'ShowChoices' && G.$gameMessage.isBusy()) return false;
    return command.call(this, params);
  };
  registerAuthorCommand(G, 'ShowChoices', function(this: any, args: Record<string, string>) {
    const zh = language() === 'zh', choices = array((zh ? args.choicesZh : args.choicesEn) ?? '[]', zh ? 'choicesZh' : 'choicesEn');
    const helpInput = array((zh ? args.helpZh : args.helpEn) || 'null', zh ? 'helpZh' : 'helpEn');
    const help = helpInput?.length ? helpInput : null;
    const initial = integer(args.defaultIndex ?? '0', 'defaultIndex'), cancel = integer(args.cancelValue ?? '0', 'cancelValue');
    const variable = integer(args.resultVariableId ?? '0', 'resultVariableId');
    if (variable <= 0 || variable >= G.$dataSystem.variables.length) throw new AuthorParameterError('resultVariableId', 'Choose an existing result variable ID (1 or greater).');
    if (initial < 0 || initial >= Math.max(1, choices?.length ?? 0)) throw new AuthorParameterError('defaultIndex', 'Choose a zero-based index within the selected language choices.');
    const result = (index: number): void => G.$gameVariables.setValue(variable, index);
    // Ordinary nil exits before entering a window loop. [] deliberately keeps a busy choice request.
    if (choices === null) { result(0); return; }
    open(choices, initial, cancel, help, result);
    this.setWaitMode('message');
  });
  const isChoice = message.isChoice;
  message.isChoice = function() { return requests.has(this) || isChoice.call(this); };
  const clear = message.clear;
  message.clear = function() {
    const request = requests.get(this);
    if (request?.window) { helps.get(request.window)?.hide(); request.window.setHelpWindow(null); }
    requests.delete(this);
    return clear.call(this);
  };
  const start = choice.start;
  choice.start = function() {
    const request = owned();
    if (request) {
      request.window = this; request.scene = G.SceneManager._scene; windows.set(this, request);
      if (request.help !== null) {
        let help = helps.get(this);
        if (!help) {
          const height = G.Window_Base.prototype.fittingHeight.call(this, 2);
          help = new G.Window_Help(new G.Rectangle(0, G.Graphics.boxHeight - height, G.Graphics.boxWidth, height));
          G.SceneManager._scene.addWindow(help); helps.set(this, help);
        }
        this.setHelpWindow(help); help.show();
      }
    } else windows.delete(this);
    start.call(this);
    if (this._cancelButton) {
      this._cancelButton.setClickHandler(request ? () => {
        if (requestCurrent(request) && this.isOpenAndActive() && request.cancel !== 0) G.Input.virtualClick('cancel');
      } : null);
    }
    if (request) {
      this.callUpdateHelp();
      if (request.inline) { G.Input.update(); G.TouchInput.update(); }
    }
  };
  const updateHelp = choice.updateHelp;
  choice.updateHelp = function() {
    const request = owned();
    if (!request) return updateHelp.call(this);
    if (this._helpWindow) this._helpWindow.setText(messageLiteral(request.help?.[this.index()] ?? ''));
  };
  const helpHeight = (win: any): number => owned()?.help !== null ? helps.get(win)?.height ?? 0 : 0;
  const rows = choice.numVisibleRows;
  choice.numVisibleRows = function() {
    if (!owned()) return rows.call(this);
    const available = G.Graphics.boxHeight - helpHeight(this) - this.padding * 2;
    return Math.max(1, Math.min(G.$gameMessage.choices().length, Math.floor(available / this.itemHeight())));
  };
  const width = choice.windowWidth;
  choice.windowWidth = function() {
    const reserve = owned() && this.isCancelEnabled() && this._cancelButton ? this._cancelButton.width + 8 : 0;
    return Math.min(width.call(this), G.Graphics.boxWidth - reserve);
  };
  const y = choice.windowY;
  choice.windowY = function() { return owned() ? Math.floor((G.Graphics.boxHeight - helpHeight(this) - this.windowHeight()) / 2) : y.call(this); };
  const enabled = choice.isCancelEnabled, button = choice.needsCancelButton, current = choice.isCurrentItemEnabled;
  choice.isCancelEnabled = function() { const request = owned(); return request ? request.cancel !== 0 : enabled.call(this); };
  choice.needsCancelButton = function() { return owned() ? this.isCancelEnabled() : button.call(this); };
  choice.isCurrentItemEnabled = function() { return owned() && this.maxItems() === 0 ? true : current.call(this); };
  const handling = choice.processHandling;
  choice.processHandling = function() {
    if (!owned()) return handling.call(this);
    // Native update already moved the cursor (and help) this round. WP17 then resolves BACK before USE.
    if (this.isOpenAndActive()) {
      if (this.isCancelEnabled() && G.Input.isTriggered('cancel')) return this.processCancel();
      if (this.isOkEnabled() && this.isOkTriggered()) return this.processOk();
    }
  };
  for (const name of ['callOkHandler', 'callCancelHandler']) {
    const finish = choice[name];
    choice[name] = function() {
      const request = owned();
      const bound = windows.get(this);
      if (bound && (bound !== request || !requestCurrent(bound))) return;
      finish.call(this);
      if (request && !request.inline) { G.Input.update(); G.TouchInput.update(); }
    };
  }
  return { inline: (choices, cancel, result, isCurrent) => open(choices, 0, cancel, null, result, true, isCurrent) };
}
