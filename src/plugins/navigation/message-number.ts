import { AuthorParameterError, authorJson, registerAuthorCommand } from './author-command';
/** WP17-C is opt-in. Native MZ command 103 keeps its own window/exit contract. */
export class NumberInputParameters {
  private low = 0;
  private high = 99;
  private initialValue: unknown = 0;
  private cancelValue: number | undefined;
  private digitCount: number | null = null;
  signed = false;
  setRange(min: number, max: number): void { this.low = min; this.high = Math.max(min, max); this.digitCount = null; }
  setDigits(digits: number): void { this.digitCount = digits; this.low = -(10 ** digits - 1); this.high = -this.low; }
  setDefault(value: unknown): void { this.initialValue = value; this.cancelValue = undefined; }
  setInitial(value: unknown): void { this.initialValue = value; }
  setCancel(value: number): void { this.cancelValue = value; }
  get min(): number { return this.signed ? this.low : Math.max(0, this.low); }
  get max(): number { return this.signed ? this.high : Math.max(0, this.high); }
  get digits(): number { return this.digitCount ?? String(Math.max(Math.abs(this.min), Math.abs(this.max))).length; }
  get initial(): number {
    const value = typeof this.initialValue === 'number' && Number.isFinite(this.initialValue) ? Math.trunc(this.initialValue) : 0;
    return Math.min(this.max, Math.max(this.min, value));
  }
  get cancel(): number { return this.cancelValue ?? this.initial; }
}

export function installMessageNumber(G: any): void {
  const window = G.Window_NumberInput?.prototype, message = G.Game_Message?.prototype, interpreter = G.Game_Interpreter?.prototype;
  if (!window || !message || !interpreter?.command357) return;
  interface Request { parameters: NumberInputParameters; negative: boolean; window?: any; cancelButton?: any }
  const requests = new WeakMap<object, Request>(), cancelButtons = new WeakMap<object, any>();
  const owned = (win?: any): Request | undefined => {
    const request = requests.get(G.$gameMessage);
    return !win || request?.window === win ? request : undefined;
  };
  const integer = (value: unknown, name: string): number => {
    const number = Number(value);
    if (String(value).trim() && Number.isSafeInteger(number)) return number;
    throw new AuthorParameterError(name, 'Use an integer.');
  };
  const variable = (value: unknown, field: string): number => {
    const id = integer(value, field);
    if (id <= 0 || id >= G.$dataSystem.variables.length) throw new AuthorParameterError(field, 'Choose an existing variable ID (1 or greater).');
    return id;
  };
  const command = interpreter.command357;
  interpreter.command357 = function(params: any[]) {
    if (params[0] === 'PS_Management' && params[1] === 'ShowNumber' && G.$gameMessage.isBusy()) return false;
    return command.call(this, params);
  };
  registerAuthorCommand(G, 'ShowNumber', function(this: any, args: Record<string, string>) {
    const id = variable(args.resultVariableId ?? '1', 'resultVariableId'), parameters = new NumberInputParameters();
    parameters.setInitial(G.$gameVariables.value(id));
    const settings: unknown = authorJson(args.settings || '[]', 'settings');
    if (!Array.isArray(settings)) throw new AuthorParameterError('settings', 'Use an ordered JSON array of setting operations.');
    for (const [index, entry] of settings.entries()) {
      const setting = typeof entry === 'string' ? authorJson(entry, `settings[${index}]`) : entry;
      if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw new AuthorParameterError(`settings[${index}]`, 'Use a setting object with operation and value.');
      const row = setting as Record<string, unknown>, value = row.value, field = `settings[${index}].value`;
      switch (row.operation) {
        case 'range': parameters.setRange(integer(value, field), integer(row.maximum, `settings[${index}].maximum`)); break;
        case 'digits': {
          const digits = integer(value, field);
          if (digits < 1 || digits > 15) throw new AuthorParameterError(field, 'Use 1 to 15 digits.');
          parameters.setDigits(digits); break;
        }
        case 'negative': {
          if (String(value) !== '0' && String(value) !== '1') throw new AuthorParameterError(field, 'Use 0 or 1.');
          parameters.signed = String(value) === '1'; break;
        }
        case 'default': parameters.setDefault(Number(value)); break;
        case 'initial': parameters.setInitial(Number(value)); break;
        case 'initialVariable': parameters.setInitial(G.$gameVariables.value(variable(value, `settings[${index}].value`))); break;
        case 'cancel': parameters.setCancel(integer(value, field)); break;
        default: throw new AuthorParameterError(`settings[${index}].operation`, 'Choose range, digits, negative, default, initial, initialVariable or cancel.');
      }
    }
    if (Math.max(Math.abs(parameters.min), Math.abs(parameters.max)) > 10 ** 15 - 1) throw new AuthorParameterError('settings.range', 'Use a range with at most 15 digits.');
    requests.set(G.$gameMessage, { parameters, negative: parameters.initial < 0 });
    G.$gameMessage.setNumberInput(id, parameters.digits);
    this.setWaitMode('message');
  });
  const clear = message.clear;
  message.clear = function() {
    const request = requests.get(this), win = request?.window;
    if (win) {
      if (request.cancelButton) {
        request.cancelButton.visible = false;
        win._buttons = win._buttons.filter((button: any) => button !== request.cancelButton);
      }
      for (const [index, name] of ['onButtonDown', 'onButtonUp', 'onButtonOk'].entries()) win._buttons[index]?.setClickHandler(win[name].bind(win));
      win.deactivate(); win.close();
    }
    requests.delete(this);
    return clear.call(this);
  };
  const start = window.start;
  window.start = function() {
    const request = owned();
    if (!request) return start.call(this);
    request.window = this;
    const p = request.parameters;
    this._maxDigits = p.digits + Number(p.signed);
    // Keep the sign separate so -0 can be edited into a negative value.
    this._number = Math.min(10 ** p.digits - 1, p.signed ? Math.abs(p.initial) : Math.max(0, p.initial));
    if (G.ConfigManager.touchUI && this._buttons.length) {
      let button = cancelButtons.get(this);
      if (!button) { button = new G.Sprite_Button('cancel'); cancelButtons.set(this, button); this.addInnerChild(button); }
      request.cancelButton = button; button.visible = true; this._buttons.push(button);
      for (const [index, action] of [() => this.changeDigit(false), () => this.changeDigit(true), () => this.processOk(), () => this.processCancel()].entries()) {
        this._buttons[index].setClickHandler(() => { if (owned(this) === request && this.isOpenAndActive()) action(); });
      }
    }
    this.updatePlacement(); this.placeButtons(); this.createContents(); this.refresh(); this.open(); this.activate(); this.select(0);
  };
  const placement = window.updatePlacement, itemWidth = window.itemWidth;
  window.itemWidth = function() { return owned(this) ? Math.min(48, Math.floor((G.Graphics.boxWidth - this.padding * 2) / this.maxCols())) : itemWidth.call(this); };
  window.updatePlacement = function() {
    if (!owned(this)) return placement.call(this);
    this.width = this.windowWidth(); this.height = this.windowHeight();
    this.x = (G.Graphics.boxWidth - this.width) / 2; this.y = (G.Graphics.boxHeight - this.height) / 2;
  };
  const draw = window.drawItem;
  window.drawItem = function(index: number) {
    const request = owned(this);
    if (!request) return draw.call(this, index);
    const p = request.parameters, rect = this.itemLineRect(index);
    const text = (p.signed ? request.negative ? '-' : '+' : '') + String(this._number).padStart(p.digits, '0');
    this.resetTextColor(); this.drawText(text[index], rect.x, rect.y, rect.width, 'center');
  };
  const cursor = window.processCursorMove;
  window.processCursorMove = function() {
    if (!owned(this)) return cursor.call(this);
    if (this.isOpenAndActive()) {
      const previous = this.index();
      if (G.Input.isRepeated('right')) this.select((previous + 1) % this.maxItems());
      else if (G.Input.isRepeated('left')) this.select((previous + this.maxItems() - 1) % this.maxItems());
      if (this.index() !== previous) this.playCursorSound();
    }
  };
  const digit = window.changeDigit;
  window.changeDigit = function(up: boolean) {
    const request = owned(this);
    if (!request) return digit.call(this, up);
    if (request.parameters.signed && this.index() === 0) request.negative = !request.negative;
    else {
      const place = 10 ** (this._maxDigits - 1 - this.index()), old = Math.floor(this._number / place) % 10;
      this._number += ((old + (up ? 1 : 9)) % 10 - old) * place;
    }
    this.refresh(); this.playCursorSound();
  };
  const handling = window.processHandling, update = window.update, touch = window.processTouch;
  window.update = function() {
    if (!owned(this)) return update.call(this);
    // The native number window edits after handling. This entry edits before its USE/BACK decision.
    G.Window_Selectable.prototype.update.call(this);
  };
  window.processHandling = function() {
    if (!owned(this)) return handling.call(this);
    if (this.isOpenAndActive()) {
      this.processDigitChange();
      if (G.Input.isTriggered('ok')) return this.processOk();
      if (G.Input.isTriggered('cancel')) return this.processCancel();
    }
  };
  window.processTouch = function() {
    if (owned(this) && G.Input.isTriggered('ok')) return;
    return touch.call(this);
  };
  const finish = (win: any, value: number, cancel: boolean): void => {
    if (cancel) G.SoundManager.playCancel(); else win.playOkSound();
    G.$gameVariables.setValue(G.$gameMessage.numInputVariableId(), value);
    win._messageWindow.terminateMessage(); win.updateInputData(); win.deactivate(); win.close();
  };
  const ok = window.processOk, cancel = window.processCancel, enabled = window.isCancelEnabled;
  window.processOk = function() {
    const request = owned(this);
    if (!request) return ok.call(this);
    const value = request.negative && this._number !== 0 ? -this._number : this._number, p = request.parameters;
    if (value < p.min || value > p.max) return this.playBuzzerSound();
    finish(this, value, false);
  };
  window.isCancelEnabled = function() { return owned(this) ? true : enabled.call(this); };
  window.processCancel = function() {
    const request = owned(this);
    if (!request) return cancel.call(this);
    finish(this, request.parameters.cancel, true);
  };
}
