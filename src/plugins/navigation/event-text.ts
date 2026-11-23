import { AuthorParameterError, registerAuthorCommand } from './author-command';
import { eventKey, hostInput } from '../host-input';
import { createCursorTextScene } from './cursor-text';

/** Opt-in map-event text. Keyboard naming and free text have different cancellation contracts. */
export function installEventText(G: any, language: () => string): void {
  const interpreter = G.Game_Interpreter?.prototype, base = G.Scene_MenuBase?.prototype;
  if (!interpreter?.command357 || !base || !G.document?.createElement) return;
  interface Request { mode: 'keyboard' | 'free' | 'cursor'; initial: string; min: number; max: number; variable: number; title: string }
  let active: Request | null = null;
  const waiting = new WeakMap<object, Request>(), inputs = hostInput(G);
  const CursorScene = createCursorTextScene(G, language, {
    current: request => active === request,
    finish(request, value) { if (active === request) { G.$gameVariables.setValue(active.variable, value); active = null; } },
    release(request) { if (active === request) active = null; },
  });
  const integer = (value: string, name: string): number => {
    const n = Number(value);
    if (!value.trim() || !Number.isSafeInteger(n)) throw new AuthorParameterError(name, 'Use an integer.');
    return n;
  };
  const command = interpreter.command357, wait = interpreter.updateWaitMode;
  interpreter.command357 = function(params: any[]) {
    if (params[0] === 'PS_Management' && params[1] === 'ShowTextInput' &&
      (active || G.$gameMessage.isBusy() || G.SceneManager.isSceneChanging())) return false;
    return command.call(this, params);
  };
  interpreter.updateWaitMode = function() {
    if (this._waitMode !== 'psEventText') return wait.call(this);
    if (waiting.get(this) === active || G.SceneManager.isSceneChanging()) return true;
    waiting.delete(this); this._waitMode = ''; return false;
  };
  registerAuthorCommand(G, 'ShowTextInput', function(this: any, args: Record<string, string>) {
    const mode = args.mode ?? 'keyboard', min = integer(args.minLength ?? '0', 'minLength'), max = integer(args.maxLength ?? '12', 'maxLength');
    const variable = integer(args.resultVariableId ?? '1', 'resultVariableId');
    if (mode !== 'keyboard' && mode !== 'free' && mode !== 'cursor') throw new AuthorParameterError('mode', 'Choose keyboard, free or cursor.');
    if (max < 1 || max > 32) throw new AuthorParameterError('maxLength', 'Use maxLength 1..32.');
    if (min < 0 || min > max || mode === 'free' && min !== 0) throw new AuthorParameterError('minLength', 'Use minLength 0..maxLength; free mode requires minLength 0.');
    if (variable <= 0 || variable >= G.$dataSystem.variables.length) throw new AuthorParameterError('resultVariableId', 'Choose an existing result variable ID (1 or greater).');
    const initialVariable = integer(args.initialVariableId ?? '0', 'initialVariableId');
    if (initialVariable < 0 || initialVariable >= G.$dataSystem.variables.length) throw new AuthorParameterError('initialVariableId', 'Choose 0 or an existing initial variable ID.');
    const initial = initialVariable ? String(G.$gameVariables.value(initialVariable)) : (language() === 'zh' ? args.initialZh : args.initialEn) ?? '';
    const title = (language() === 'zh' ? args.titleZh : args.titleEn) || (language() === 'zh' ? '输入文字' : 'Enter text');
    const request: Request = { mode, initial, min, max, variable, title };
    active = request; waiting.set(this, request); this.setWaitMode('psEventText');
    try { G.SceneManager.push(mode === 'cursor' ? CursorScene : TextScene); G.SceneManager.prepareNextScene(request); }
    catch (error) { active = null; waiting.delete(this); this.setWaitMode(''); throw error; }
  });

  function TextScene(this: any) { this.initialize(); }
  TextScene.prototype = Object.create(base);
  TextScene.prototype.constructor = TextScene;
  const P = TextScene.prototype;
  P.initialize = function() { base.initialize.call(this); this._ready = false; this._closed = false; this._composing = false; };
  P.prepare = function(request: Request) { this._request = request; };
  P.updateActor = function() {}; // This event editor has no actor or business naming target.
  P.needsCancelButton = function() { return this._request.mode === 'free' || this._request.min === 0; };
  P.create = function() {
    base.create.call(this);
    const r: Request = this._request;
    const panel = G.document.createElement('div'), label = G.document.createElement('label');
    const field = G.document.createElement('input'), hint = G.document.createElement('p');
    this._panel = panel; this._field = field;
    Object.assign(panel.style, { position: 'fixed', left: '10%', top: '30%', width: '80%', boxSizing: 'border-box', padding: '16px', font: '20px sans-serif', zIndex: '99999', background: '#24334b', color: '#fff' });
    Object.assign(field.style, { display: 'block', boxSizing: 'border-box', width: '100%', fontSize: '24px', marginTop: '12px', padding: '10px', color: '#111', background: '#fff' });
    field.type = 'text'; field.value = r.initial; field.autocomplete = 'off'; field.spellcheck = false; field.setAttribute('aria-label', r.title);
    label.textContent = r.title; label.appendChild(field);
    this._hint = hint; this.refreshHint();
    this._status = G.document.createElement('p'); this._status.setAttribute('aria-live', 'polite');
    panel.appendChild(label); panel.appendChild(hint); panel.appendChild(this._status); G.document.body.appendChild(panel);
    this._accepted = field.value;
    // Let the browser own selection, arrow/backspace repeat and ordinary editing. Bound new text by characters.
    field.addEventListener('input', () => {
      if (!this.current() || this._composing) return;
      this.acceptEdit();
    });
    field.addEventListener('compositionstart', () => { this._composing = true; });
    field.addEventListener('compositionend', () => { this._composing = false; if (this.current()) this.acceptEdit(); });
    this._keydown = (event: any) => {
      if (!this.current()) return;
      event.stopPropagation();
      const key = eventKey(event);
      if (key && this._heldAtStart?.has(key)) {
        if (inputs.domPressed(key)) { event.preventDefault(); return; }
        this._heldAtStart.delete(key);
      }
      if (event.isComposing || this._composing || event.keyCode === 229) return;
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault(); inputs.consumeNative(event, event.key === 'Enter' ? 'use' : 'back');
        if (!event.repeat) this.finish(event.key === 'Escape');
      }
    };
    field.addEventListener('keydown', this._keydown); G.document.addEventListener('keydown', this._keydown);
    this._keyup = (event: any) => { const key = eventKey(event); if (key && !inputs.domPressed(key)) this._heldAtStart?.delete(key); };
    G.document.addEventListener('keyup', this._keyup);
    if (G.ConfigManager.touchUI) {
      this._okButton = new G.Sprite_Button('ok'); this._okButton.x = 4; this._okButton.y = this.buttonY();
      this._okButton.setClickHandler(() => this.finish(false)); this.addWindow(this._okButton);
      this._cancelButton?.setClickHandler(() => this.finish(true));
    }
  };
  P.start = function() { base.start.call(this); this._heldAtStart = new Set((['use', 'back', 'up', 'down', 'left', 'right', 'action', 'special'] as const).filter(key => inputs.domPressed(key))); this._ready = true; this._field.focus(); this._field.setSelectionRange(this._field.value.length, this._field.value.length); this.status(); G.Input.clear(); G.TouchInput.clear(); };
  P.refreshHint = function() {
    const r: Request = this._request, zh = language() === 'zh';
    this._language = language();
    this._hint.textContent = zh ? `Enter 确认；←/→ 移动、退格删除。新增上限 ${r.max} 字。` : `Enter: OK; arrows: move; Backspace: delete. Insert limit: ${r.max}.`;
    const cancelHint = r.mode === 'free' ? (zh ? 'Escape 取消编辑，返回原文。' : 'Escape: discard edits, return original.') : r.min === 0 ? (zh ? 'Escape 返回空串。' : 'Escape: return empty text.') : (zh ? `至少 ${r.min} 字；不可取消。` : `At least ${r.min} characters; cancel disabled.`);
    this._hint.textContent += ' ' + cancelHint;
  };
  P.update = function() {
    base.update.call(this);
    if (this._language !== language()) { this.refreshHint(); this.status(this._invalidMinimum); }
  };
  P.current = function() { return this._ready && !this._closed && active === this._request && G.SceneManager._scene === this && !G.SceneManager.isSceneChanging(); };
  P.status = function(invalidMinimum = false) { this._invalidMinimum = invalidMinimum; const message = invalidMinimum ? language() === 'zh' ? `至少输入 ${this._request.min} 字` : `Enter at least ${this._request.min} characters` : ''; this._status.textContent = `${Array.from(this._field.value).length} / ${this._request.max}` + (message ? ' — ' + message : ''); };
  P.acceptEdit = function() {
    const field = this._field, old: string = this._accepted, next: string = field.value;
    // Preserve unchanged prefix/suffix, accepting inserted characters in order up to the capacity.
    let a = 0, b = 0;
    while (a < old.length && a < next.length && old[a] === next[a]) a++;
    while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
    const prefix = next.slice(0, a), suffix = b ? next.slice(-b) : '';
    const capacity = Math.max(0, this._request.max - Array.from(prefix + suffix).length);
    const incoming = next.slice(a, next.length - b), inserted = Array.from(incoming).slice(0, capacity).join('');
    const accepted = prefix + inserted + suffix, caret = field.selectionStart;
    if (accepted !== next) { field.value = accepted; const position = Math.min(caret ?? accepted.length, prefix.length + inserted.length); field.setSelectionRange(position, position); }
    this._accepted = field.value; this.status();
  };
  P.finish = function(cancel: boolean) {
    if (!this.current() || this._composing) return;
    const r: Request = this._request;
    if (cancel && !this.needsCancelButton()) return;
    if (!cancel && Array.from(this._field.value).length < r.min) {
      this.status(true); this._field.focus(); return;
    }
    const value = cancel ? r.mode === 'free' ? r.initial : '' : this._field.value;
    this._closed = true; this.removeEditor();
    if (cancel) G.SoundManager.playCancel(); else G.SoundManager.playOk();
    G.$gameVariables.setValue(r.variable, value); active = null;
    G.Input.clear(); G.TouchInput.clear(); G.Scene_Base.prototype.popScene.call(this);
  };
  P.removeEditor = function() { this._panel?.remove(); G.document.removeEventListener('keydown', this._keydown); G.document.removeEventListener('keyup', this._keyup); };
  P.terminate = function() { this._closed = true; this.removeEditor(); if (active === this._request) active = null; G.Input.clear(); G.TouchInput.clear(); base.terminate.call(this); };
}
