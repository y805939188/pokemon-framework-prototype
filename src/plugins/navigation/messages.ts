import { AuthorParameterError, registerAuthorCommand } from './author-command';
import { readInlineChoice } from './message-inline-choice';
import type { InlineChoice } from './message-inline-choice';
import type { MessageChoices } from './message-choices';
import { messageDelay, MESSAGE_SPEED_UNIT_MS } from './message-speed';
/** Opt-in map-event messages. Rendering and interpreter ownership stay with MZ/Reactor. */
type Action = { kind: 'bold' | 'italic'; change: number } | { kind: 'speed' | 'wait' | 'autoWait'; value: number };
interface TextSource { playerName(): string; money(): number; variable(id: number): unknown; actorName(id: number): string }
interface Compiled { text: string; actions: Action[]; choice: InlineChoice | null; rows: number | null }
const literal = (value: unknown): string => String(value).replace(/\x1b/g, '␛');
const entities = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&m;/g, '♂').replace(/&f;/g, '♀');

/** WP17 plain text layout; explicit line/page breaks remain native controls. */
function wrapPlainMessage(text: string, width: number, measure: (text: string) => number): string {
  // Escape codes can change styling or timing. Leave those messages on their existing path.
  if (width <= 0 || /[\x00-\x09\x0b\x0d-\x1f]/.test(text)) return text;
  const parts: string[] = [];
  let advance = 0, from = 0;
  for (const {0: run, index} of text.matchAll(/\n|\f|[^\S\n\f]+|\S+/gu)) {
    if (run === '\n' || run === '\f') {
      advance = 0;
      continue;
    }
    const runWidth = measure(run);
    // Trailing whitespace does not trigger a move. A word at line start may overflow intact.
    if (advance !== 0 && !/^\s/u.test(run) && advance + runWidth + 2 > width) {
      parts.push(text.slice(from, index), '\n');
      from = index;
      advance = 0;
    }
    advance += runWidth;
  }
  if (parts.length === 0) return text;
  parts.push(text.slice(from));
  return parts.join('');
}

/** Values are literal text; only authored controls become renderer instructions. */
export function compileMessage(text: string, source: TextSource, field = 'text'): Compiled {
  const actions: Action[] = [];
  let choice: InlineChoice | null = null;
  let rows: number | null = null;
  const control = (action: Action): string => '\x1bPSMSG[' + (actions.push(action) - 1) + ']';
  const token = /\\\\|\\(?:ch|l)\[|\\(?:pn|pm)(?![a-z])|\\[nv]\[\d+\]|\\n(?!\[)|\\(?:ts|wt|wtnp)\[\d*\]|\\c\[\d+\]|\\[.!|^1]|<\/?[bi]>|<br>/gi;
  let result = '', cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    result += entities(literal(text.slice(cursor, match.index)));
    const raw = match[0], lower = raw.toLowerCase();
    if (raw === '\\ch[') {
      if (choice) throw new AuthorParameterError(field + '.ch', 'Use at most one inline choice in a message.');
      const parsed = readInlineChoice(text, token.lastIndex, field);
      choice = parsed.value; cursor = token.lastIndex = parsed.end;
      continue;
    } else if (raw === '\\l[') {
      if (rows !== null) throw new AuthorParameterError(field + '.l', 'Use at most one line-count tag in a message.');
      const end = text.indexOf(']', token.lastIndex), digits = text.slice(token.lastIndex, end), value = Number(digits);
      if (end < 0 || !/^\d+$/.test(digits) || !Number.isSafeInteger(value) || value < 1)
        throw new AuthorParameterError(field + '.l', 'Use a positive integer line count, such as \\l[2].');
      rows = value; cursor = token.lastIndex = end + 1;
      continue;
    } else if (lower === '\\ch[' || lower === '\\l[') result += literal(raw); // Only the documented lowercase spelling is enabled.
    else if (lower === '\\\\') result += '\\';
    else if (lower === '\\pn') result += literal(source.playerName());
    else if (lower === '\\pm') result += literal(source.money().toLocaleString('en-US'));
    else if (/^\\v\[/i.test(raw)) result += literal(source.variable(Number(raw.slice(3, -1))));
    else if (/^\\n\[/i.test(raw)) { const id = Number(raw.slice(3, -1)); result += id >= 1 && id <= 8 ? literal(source.actorName(id)) : raw; }
    else if (lower === '\\n' || lower === '<br>') result += '\n';
    else if (/^<\/?[bi]>$/.test(lower)) result += control({ kind: lower.includes('b') ? 'bold' : 'italic', change: lower[1] === '/' ? -1 : 1 });
    else if (/^\\(ts|wt|wtnp)\[/i.test(raw)) {
      const name = lower.slice(1, lower.indexOf('[')), value = Number(lower.slice(lower.indexOf('[') + 1, -1));
      result += control({ kind: name === 'ts' ? 'speed' : name === 'wt' ? 'wait' : 'autoWait', value });
    } else result += '\x1b' + (lower === '\\1' ? '!' : raw.slice(1).toUpperCase());
    cursor = match.index + raw.length;
  }
  return { text: result + entities(literal(text.slice(cursor))), actions, choice, rows };
}

export function installMessages(G: any, flow: () => { game(): { player: { name: string }; money: number }; translator(): { lang: string } }, choices?: MessageChoices): void {
  const window = G.Window_Message?.prototype, interpreter = G.Game_Interpreter?.prototype;
  if (!window || !interpreter?.command357) return;
  const requests = new WeakMap<object, Compiled>();
  interface Display { compiled: Compiled; delay: number; nextAt: number; started: boolean; waitUntil: number | null; glyph: boolean; bold: number; italic: number; originalBold: boolean; originalItalic: boolean }
  const displays = new WeakMap<object, Display>();
  const originalHeights = new WeakMap<object, number>();
  const resize = (win: any, height: number): void => {
    if (win.height === height) return;
    const bold = win.contents.fontBold, italic = win.contents.fontItalic;
    win.height = height; win.createContents();
    win.contents.fontBold = bold; win.contents.fontItalic = italic;
  };
  const restoreLayout = (win: any): void => {
    const height = originalHeights.get(win);
    if (height === undefined) return;
    originalHeights.delete(win); resize(win, height); win.updatePlacement();
  };
  const now = (): number => G.performance.now();
  const font = (win: any, state: Display): void => { win.contents.fontBold = state.bold > 0; win.contents.fontItalic = state.italic > 0; };
  const baseCommand = interpreter.command357;
  interpreter.command357 = function(params: any[]) {
    // Like native Show Text: keep this event command pending while another message owns the host.
    if (params[0] === 'PS_Management' && params[1] === 'ShowMessage' && G.$gameMessage.isBusy()) return false;
    return baseCommand.call(this, params);
  };
  registerAuthorCommand(G, 'ShowMessage', function(this: any, args: Record<string, string>) {
    const message = G.$gameMessage, game = flow().game();
    const field = flow().translator().lang === 'zh' ? 'textZh' : 'textEn';
    const compiled = compileMessage(String(args[field] ?? ''), {
      playerName: () => game.player.name, money: () => game.money,
      variable: id => G.$gameVariables.value(id),
      // Game_Actors.actor() lazily creates a saved actor; a message only reads an existing name or its database default.
      actorName: id => G.$gameActors?._data?.[id]?.name() ?? G.$dataActors?.[id]?.name ?? '',
    }, field);
    if (compiled.rows !== null) {
      const host = G.SceneManager._scene?._messageWindow;
      if (!host) throw new Error('message-window-unavailable');
      if (host.fittingHeight(compiled.rows) > G.Graphics.boxHeight)
        throw new AuthorParameterError(field + '.l', 'Choose a line count whose message window fits the current screen.');
    }
    const inline = compiled.choice;
    if (inline) {
      if (!choices) throw new Error('inline-choice-host-unavailable');
      if (inline.variable >= G.$dataSystem.variables.length) throw new AuthorParameterError(field + '.ch', 'Choose variable zero or an existing result variable ID.');
    }
    requests.set(message, compiled);
    message.setFaceImage('', 0); message.setSpeakerName(''); message.setBackground(0);
    message.setPositionType(Number(args.position ?? 2));
    if (inline) {
      const variables = G.$gameVariables;
      choices!.inline(inline.choices, inline.cancel, index => variables.setValue(inline.variable, index), () => G.$gameVariables === variables);
    }
    // Even an empty translation owns a native message and requires confirmation.
    message.add(compiled.text);
    this.setWaitMode('message');
  });
  const start = window.startMessage;
  window.startMessage = function() {
    const compiled = requests.get(G.$gameMessage);
    if (compiled && compiled.rows !== null) {
      if (!originalHeights.has(this)) originalHeights.set(this, this.height);
      resize(this, this.fittingHeight(compiled.rows));
    } else restoreLayout(this);
    if (compiled) displays.set(this, { compiled, delay: messageDelay(G), nextAt: 0, started: false, waitUntil: null, glyph: false, bold: 0, italic: 0,
      originalBold: this.contents.fontBold, originalItalic: this.contents.fontItalic });
    else displays.delete(this);
    const result = start.call(this);
    // Native start set the text origin and reset the page font but has not drawn a glyph yet.
    const textState = this._textState;
    if (compiled && textState && !textState.rtl) {
      const width = this.contentsWidth() - textState.startX;
      textState.text = wrapPlainMessage(textState.text, width, text => this.textWidth(text));
    }
    return result;
  };
  const close = window.updateClose;
  window.updateClose = function() {
    close.call(this);
    // Keep the final page intact throughout the native closing animation.
    if (this.isClosed()) restoreLayout(this);
  };
  const convert = window.convertEscapeCharacters;
  window.convertEscapeCharacters = function(text: string) { return displays.has(this) ? text : convert.call(this, text); };
  const page = window.newPage;
  window.newPage = function(textState: any) { page.call(this, textState); const state = displays.get(this); if (state) font(this, state); };
  const process = window.processCharacter;
  window.processCharacter = function(textState: any) {
    const state = displays.get(this);
    if (state) state.glyph = textState.text.charCodeAt(textState.index) >= 0x20;
    return process.call(this, textState);
  };
  const fast = window.updateShowFast;
  window.updateShowFast = function() { if (!displays.has(this)) return fast.call(this); };
  const shouldBreak = window.shouldBreakHere;
  window.shouldBreakHere = function(textState: any) {
    const state = displays.get(this);
    if (!state) return shouldBreak.call(this, textState);
    if (this.isWaiting()) return true;
    if (state.glyph && this.canBreakHere(textState)) {
      state.nextAt += state.delay;
      return state.delay > 0 && now() < state.nextAt;
    }
    return false;
  };
  const update = window.updateMessage;
  window.updateMessage = function() {
    const state = displays.get(this);
    if (!state) return update.call(this);
    // Native update does not reach text while opening/loading. Those frames are not typing time.
    if (!state.started) { state.started = true; state.nextAt = now(); }
    if (this._textState && now() < state.nextAt) return true;
    state.glyph = false;
    return update.call(this);
  };
  const wait = window.updateWait;
  window.updateWait = function() {
    const state = displays.get(this);
    if (!state) return wait.call(this);
    if (state.waitUntil !== null && now() < state.waitUntil) return true;
    if (state.waitUntil !== null) state.nextAt = now();
    state.waitUntil = null;
    return false;
  };
  const waiting = window.isWaiting;
  window.isWaiting = function() { const state = displays.get(this); return state ? this.pause || state.waitUntil !== null : waiting.call(this); };
  const pause = window.startPause;
  window.startPause = function() { if (displays.has(this)) this.pause = true; else pause.call(this); };
  const triggered = window.isTriggered;
  window.isTriggered = function() { return displays.has(this) ? G.Input.isTriggered('ok') || G.Input.isTriggered('cancel') || G.TouchInput.isTriggered() : triggered.call(this); };
  const input = window.updateInput;
  window.updateInput = function() {
    const state = displays.get(this);
    if (state && this.pause && this.isTriggered()) { G.SoundManager.playOk(); state.nextAt = now(); }
    return input.call(this);
  };
  const escape = window.processEscapeCharacter;
  window.processEscapeCharacter = function(code: string, textState: any) {
    const state = displays.get(this);
    if (!state) return escape.call(this, code, textState);
    if (code === 'PSMSG') {
      const action = state.compiled.actions[Number(this.obtainEscapeParam(textState))];
      if (action?.kind === 'speed') state.delay = action.value * MESSAGE_SPEED_UNIT_MS;
      else if (action?.kind === 'wait' || action?.kind === 'autoWait') {
        state.waitUntil = now() + action.value * 50;
        if (action.kind === 'autoWait') this._pauseSkip = true;
      } else if (action?.kind === 'bold' || action?.kind === 'italic') { state[action.kind] += action.change; font(this, state); }
    } else if (code === '.' || code === '|') state.waitUntil = now() + (code === '.' ? 250 : 1000);
    else return escape.call(this, code, textState);
  };
  const end = window.terminateMessage;
  window.terminateMessage = function() {
    const owned = displays.get(this);
    end.call(this);
    if (owned) {
      requests.delete(G.$gameMessage); displays.delete(this);
      this.contents.fontBold = owned.originalBold; this.contents.fontItalic = owned.originalItalic;
      this.resetFontSettings(); G.Input.update(); G.TouchInput.update();
      if (this.isClosed()) restoreLayout(this);
    }
  };
}
