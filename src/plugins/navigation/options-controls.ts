import { installMessageSpeedConfig, playerTextSpeed, TEXT_SPEED, TEXT_SPEED_DELAYS } from './message-speed';

/** WP65 / FR-000639–641, FR-000644. Existing MZ Options owns navigation and device configuration I/O. */
interface Text { readonly lang?: string; t(key: string, params?: Record<string, string | number>): string; font?(): string | undefined }
const installed = new WeakSet<object>();
const LABELS: Record<string, string> = {
  alwaysDash: 'alwaysDash', commandRemember: 'commandRemember', touchUI: 'touchUI',
  bgmVolume: 'bgmVolume', bgsVolume: 'bgsVolume', meVolume: 'meVolume', seVolume: 'seVolume',
};
const CLOSE = 'psOptionsClose';
const SPEED_HELP = 'options.textSpeed.help';
const HELP_FONT_SIZE = 20;
interface Preview { rows: string[][]; row: number; completed: number; drawn: number; at: number; delay: number }

function* wrapLines(win: any, text: string, width: number): IterableIterator<string> {
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && win.textWidth(line + char) > width) {
        yield line; line = '';
      }
      line += char;
    }
    yield line;
  }
}

/** Draw plain translated text without interpreting message control codes. */
function lines(win: any, text: string, y: number, size = HELP_FONT_SIZE): number {
  const bitmap = win.contents, width = bitmap.width - 16, height = size + 8;
  bitmap.fontSize = size;
  for (const line of wrapLines(win, text, width)) {
    bitmap.drawText(line, 8, y, width, height, 'left'); y += height;
  }
  return y;
}

export function installOptionsControls(G: any, translator: () => Text): void {
  const speedEnabled = installMessageSpeedConfig(G);
  const options = G.Window_Options?.prototype, scene = G.Scene_Options?.prototype;
  if (!options || !scene || installed.has(options)) return;
  installed.add(options);
  const tr = (key: string, params?: Record<string, string | number>) => translator().t('navigation.' + key, params);
  const make = options.makeCommandList, status = options.statusText, ok = options.processOk;
  const left = options.cursorLeft, right = options.cursorRight, count = scene.maxCommands;
  const updateOptions = options.update;
  options.makeCommandList = function (...args: any[]) {
    make.apply(this, args);
    for (const row of this._list) if (Object.hasOwn(LABELS, row.symbol)) row.name = tr('options.' + LABELS[row.symbol]);
    if (speedEnabled) this.addCommand(translator().t('options.textSpeed.label'), TEXT_SPEED);
    this.addCommand(tr('close'), CLOSE);
    this._psLanguage = translator().lang;
  };
  options.update = function (...args: any[]) {
    if (this._psLanguage !== translator().lang) { this.refresh(); this.callUpdateHelp(); }
    updateOptions?.apply(this, args);
  };
  options.booleanStatusText = function (value: boolean) { return tr(value ? 'on' : 'off'); };
  options.statusText = function (index: number) {
    const symbol = this.commandSymbol(index);
    if (symbol === CLOSE) return '';
    if (symbol === TEXT_SPEED) return translator().t('options.textSpeed.value.' + playerTextSpeed(G));
    return status.call(this, index);
  };
  options.processOk = function (...args: any[]) {
    const symbol = this.commandSymbol(this.index());
    if (symbol === CLOSE) this.processCancel();
    else if (symbol !== TEXT_SPEED) ok.apply(this, args);
  };
  const moveSpeed = (win: any, step: number): void => {
    const current = playerTextSpeed(G), next = current + step;
    if (next < 0 || next >= TEXT_SPEED_DELAYS.length || !win.isCommandEnabled(win.index())) return;
    win.changeValue(TEXT_SPEED, next);
    win._helpWindow?.setText(translator().t(SPEED_HELP), TEXT_SPEED_DELAYS[next]);
  };
  options.cursorLeft = function (...args: any[]) {
    const symbol = this.commandSymbol(this.index());
    if (symbol === TEXT_SPEED) moveSpeed(this, -1);
    else if (symbol !== CLOSE) left.apply(this, args);
  };
  options.cursorRight = function (...args: any[]) {
    const symbol = this.commandSymbol(this.index());
    if (symbol === TEXT_SPEED) moveSpeed(this, 1);
    else if (symbol !== CLOSE) right.apply(this, args);
  };
  options.updateHelp = function () {
    const symbol = this.commandSymbol(this.index());
    const key = symbol === CLOSE ? 'closeHelp' : Object.hasOwn(LABELS, symbol) || symbol === 'psBattleStyle' || symbol === 'psBattleEffects' ? 'options.help.' + symbol : null;
    this._helpWindow?.setText(symbol === TEXT_SPEED ? translator().t(SPEED_HELP) : key ? tr(key) : '');
  };
  scene.maxCommands = function (...args: any[]) { return count.apply(this, args) + (speedEnabled ? 2 : 1); };
  const rect = scene.optionsWindowRect, create = scene.create;
  scene.optionsWindowRect = function (...args: any[]) {
    const r = rect.apply(this, args);
    r.width = Math.min(560, G.Graphics.boxWidth); r.x = (G.Graphics.boxWidth - r.width) / 2;
    // Native buttons exist before Options; reserve their footprint where the list crosses them.
    const button = this._cancelButton;
    const top = button && r.x < button.x + button.width && r.x + r.width > button.x ? button.y + button.height : 0;
    const available = G.Graphics.boxHeight - 120 - top;
    r.height = Math.min(r.height, available); r.y = top + Math.max(0, (available - r.height) / 2);
    return r;
  };
  function Help(this: any, r: any) { G.Window_Base.prototype.initialize.call(this, r); }
  Help.prototype = Object.create(G.Window_Base.prototype);
  Help.prototype.constructor = Help;
  Help.prototype.setText = function (text: string, delay?: number) {
    const locale = translator();
    if (delay === undefined && text === this._psHelpText && locale.lang === this._psHelpLang) return;
    this._psHelpText = text; this._psHelpLang = locale.lang; this._psPreview = undefined;
    this.contents.clear(); this.resetFontSettings();
    const font = locale.font?.();
    if (font) this.contents.fontFace = font;
    if (!delay) { lines(this, text, 0); return; }
    this.contents.fontSize = HELP_FONT_SIZE;
    const rows = Array.from(wrapLines(this, text, this.contents.width - 16), line => Array.from(line));
    this._psPreview = { rows, row: 0, completed: 0, drawn: 0, at: G.performance.now(), delay };
    this.updatePreview();
  };
  Help.prototype.update = function () {
    G.Window_Base.prototype.update.call(this);
    if (this._psPreview) this.updatePreview();
  };
  Help.prototype.updatePreview = function () {
    const state: Preview = this._psPreview;
    const due = 1 + Math.floor((G.performance.now() - state.at) / state.delay);
    if (due <= state.drawn) return;
    const bitmap = this.contents, width = bitmap.width - 16, height = HELP_FONT_SIZE + 8;
    // The layout was measured once. Only redraw the line(s) gaining characters this update.
    while (state.row < state.rows.length) {
      const row = state.rows[state.row], y = state.row * height;
      const length = Math.min(row.length, due - state.completed);
      if (length > 0) {
        if (state.drawn > state.completed) bitmap.clearRect(8, y, width, height);
        bitmap.drawText(row.slice(0, length).join(''), 8, y, width, height, 'left');
        state.drawn = state.completed + length;
      }
      if (length < row.length) return;
      state.completed += row.length; state.row++;
    }
    this._psPreview = undefined;
  };
  scene.create = function (...args: any[]) {
    create.apply(this, args);
    this._helpWindow = new (Help as any)(new G.Rectangle(0, G.Graphics.boxHeight - 120, G.Graphics.boxWidth, 120));
    this.addWindow(this._helpWindow); this._optionsWindow.setHelpWindow(this._helpWindow);
  };

  // Four-page, read-only event scene. Uses the host's existing semantic input; no new key or persistent field.
  function Controls(this: any) { this.initialize(); }
  Controls.prototype = Object.create(G.Scene_MenuBase.prototype);
  Controls.prototype.constructor = Controls;
  const P = Controls.prototype;
  P.initialize = function () {
    G.Scene_MenuBase.prototype.initialize.call(this);
    this._page = 1; this._phase = 'out'; this._phaseAt = G.performance.now();
  };
  P.needsCancelButton = function () { return false; };
  P.create = function () {
    G.Scene_MenuBase.prototype.create.call(this);
    this._window = new G.Window_Base(new G.Rectangle(0, 0, G.Graphics.boxWidth, G.Graphics.boxHeight));
    this._window.contentsOpacity = 0; this.addWindow(this._window);
  };
  P.start = function () { G.Scene_MenuBase.prototype.start.call(this); this._phaseAt = G.performance.now(); };
  P.drawPage = function () {
    this._language = translator().lang;
    const win = this._window; win.contents.clear(); win.resetFontSettings();
    if (translator().font?.()) win.contents.fontFace = translator().font!();
    let y = lines(win, tr('controls.title', { page: this._page }), 8, 26);
    y = lines(win, tr('controls.page' + this._page), y + 24);
    lines(win, tr(this._page === 4 ? 'controls.finish' : 'controls.next'), Math.max(y + 24, win.contents.height - 80));
  };
  P.update = function () {
    G.Scene_MenuBase.prototype.update.call(this);
    const now = G.performance.now(), elapsed = now - this._phaseAt;
    if (this._phase === 'exit') {
      this._fadeOpacity = Math.min(255, elapsed / 400 * 255); this.updateColorFilter();
      if (elapsed >= 400) { this._phase = 'closed'; this.popScene(); }
      return;
    }
    if (this._phase === 'closed') return;
    if (this._language !== undefined && this._language !== translator().lang) this.drawPage();
    if (this._phase === 'out' || this._phase === 'in') {
      this._window.contentsOpacity = this._phase === 'out' ? (this._initialShown ? Math.max(0, 255 - elapsed / 500 * 255) : 0) : Math.min(255, elapsed / 500 * 255);
      if (elapsed >= 500) {
        this._phaseAt = now;
        if (this._phase === 'out') { this.drawPage(); this._phase = 'in'; }
        else { this._phase = 'ready'; this._initialShown = true; }
      }
      return;
    }
    // BACK has precedence, including a simultaneous confirm. No back/action/direction branch advances a page.
    if (G.Input.isTriggered('cancel') || G.TouchInput.isCancelled()) return;
    if (G.Input.isTriggered('ok') || G.TouchInput.isTriggered()) {
      this._phaseAt = now;
      if (this._page === 4) { G.SceneManager.snapForBackground(); this._phase = 'exit'; }
      else { this._page++; this._phase = 'out'; }
    }
  };
  G.Scene_PSControls = Controls;
  G.PluginManager.registerCommand('PS_Management', 'ShowControls', () => G.SceneManager.push(Controls));
  G.PluginManager.registerCommand('PS_Management', 'ShowOptions', () => G.SceneManager.push(G.Scene_Options));
}
