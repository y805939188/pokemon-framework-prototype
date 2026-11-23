import { eventKey, hostInput } from '../host-input';
import { InputLatch } from '../management/model';
import { NamingGrid } from './naming-grid';

interface CursorRequest { initial: string; min: number; max: number; title: string }
interface Lifetime {
  current(request: CursorRequest): boolean;
  finish(request: CursorRequest, value: string): void;
  release(request: CursorRequest): void;
}

/** Explicit event cursor input. The event command continues to own result and waiting. */
export function createCursorTextScene(G: any, language: () => string, lifetime: Lifetime): any {
  const base = G.Scene_MenuBase.prototype, inputs = hostInput(G);
  function CursorScene(this: any) { this.initialize(); }
  CursorScene.prototype = Object.create(base);
  CursorScene.prototype.constructor = CursorScene;
  const P = CursorScene.prototype;
  P.initialize = function() { base.initialize.call(this); this._ready = false; this._closed = false; this._latch = new InputLatch(); this._backStart = null; };
  P.prepare = function(request: CursorRequest) { this._request = request; this._variables = G.$gameVariables; this._grid = new NamingGrid(request.initial, request.max); };
  P.updateActor = function() {};
  P.needsCancelButton = function() { return false; }; // BACK deletes; this mode has no cancellation result.
  P.current = function() {
    return this._ready && !this._closed && lifetime.current(this._request) &&
      G.$gameVariables === this._variables && G.SceneManager._scene === this && !G.SceneManager.isSceneChanging();
  };
  P.create = function() {
    base.create.call(this);
    const panel = G.document.createElement('div'); this._panel = panel; panel.tabIndex = -1;
    Object.assign(panel.style, { position: 'fixed', left: '5%', top: '8%', width: '90%', maxHeight: '84%', overflowY: 'auto', boxSizing: 'border-box', padding: '10px', font: '18px sans-serif', zIndex: '99999', background: '#24334b', color: '#fff' });
    const title = G.document.createElement('div'); title.textContent = this._request.title; panel.appendChild(title);
    this._text = G.document.createElement('div'); Object.assign(this._text.style, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '8px 0', fontSize: '24px' }); this._text.setAttribute('aria-live', 'polite'); panel.appendChild(this._text);
    this._hint = G.document.createElement('div'); Object.assign(this._hint.style, { fontSize: '13px', marginBottom: '6px' }); panel.appendChild(this._hint);
    const area = G.document.createElement('div'); area.setAttribute('role', 'grid'); area.setAttribute('aria-label', this._request.title);
    Object.assign(area.style, { display: 'grid', gridTemplateColumns: 'repeat(13,minmax(0,1fr))', gap: '2px' }); panel.appendChild(area);
    this._buttons = [];
    for (let index = 0; index < 71; index++) {
      const button = G.document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      Object.assign(button.style, { height: '32px', padding: '0', font: '18px sans-serif', whiteSpace: 'pre', color: '#111', background: '#fff' });
      if (index >= 65) button.style.gridColumn = 'span ' + [2, 2, 2, 2, 3, 2][index - 65];
      button.setAttribute('role', 'gridcell');
      button.addEventListener('click', () => {
        if (!this.current() || button.disabled) return;
        this._grid.index = index; this._pointerHandled = true;
        this.operate(this._grid.step({ pressed: {}, repeated: {}, triggered: { use: true } }));
      });
      area.appendChild(button); this._buttons.push(button);
    }
    this._status = G.document.createElement('div'); this._status.setAttribute('aria-live', 'polite'); panel.appendChild(this._status);
    G.document.body.appendChild(panel);
    this._keydown = (event: any) => {
      if (!this.current()) return;
      const key = eventKey(event); if (!key) return;
      event.preventDefault(); event.stopPropagation();
      if (key === 'use' || key === 'back') inputs.consumeNative(event, key);
    };
    G.document.addEventListener('keydown', this._keydown); this.refresh();
  };
  P.start = function() {
    base.start.call(this); this._latch.arm(inputs.inputFrame().pressed);
    G.Input.clear(); G.TouchInput.clear(); this._ready = true; this._panel.focus();
  };
  P.update = function() {
    base.update.call(this); if (!this.current()) return;
    if (this._language !== language()) this.refresh();
    if (this._pointerHandled) { this._pointerHandled = false; return; }
    const frame = inputs.inputFrame(), now = G.Graphics.frameCount;
    if (!frame.pressed.back) this._backStart = null;
    else if (this._backStart === null) this._backStart = now;
    const age = now - (this._backStart ?? now);
    if (frame.pressed.back && age >= (G.Input.keyRepeatWait ?? 24) && (age - (G.Input.keyRepeatWait ?? 24)) % (G.Input.keyRepeatInterval ?? 6) === 0) frame.triggered.back = true;
    this.operate(this._grid.step(this._latch.filter(frame)));
  };
  P.operate = function(operation: string | null) {
    if (!operation || !this.current()) return;
    if (operation === 'confirm') {
      G.SoundManager.playOk();
      if (Array.from(this._grid.text).length < this._request.min) { this._invalidMinimum = true; this.refresh(); return; }
      inputs.consumeConfirmUntilRelease();
      this._closed = true; this.removeEditor(); lifetime.finish(this._request, this._grid.text);
      G.Input.clear(); G.TouchInput.clear(); G.Scene_Base.prototype.popScene.call(this); return;
    }
    if (operation === 'move' || operation === 'mode') G.SoundManager.playCursor();
    else if (operation === 'delete') G.SoundManager.playCancel();
    else if (operation === 'insert') G.SoundManager.playOk();
    this._invalidMinimum = false; this.refresh();
  };
  P.refresh = function() {
    const grid: NamingGrid = this._grid, zh = language() === 'zh', changedLanguage = this._language !== language();
    if (this._shownGroup !== grid.group || changedLanguage) {
      for (let i = 0; i < 65; i++) { const button = this._buttons[i], char = grid.character(i); button.textContent = char; button.disabled = !grid.columnAvailable(i % 13); button.setAttribute('aria-label', char === ' ' ? (zh ? '空格' : 'Space') : char); }
      for (let i = 0; i < 4; i++) this._buttons[65 + i].setAttribute('aria-pressed', String(i === grid.group));
      this._shownGroup = grid.group;
    }
    if (this._shownIndex !== grid.index) {
      const previous = this._buttons[this._shownIndex]; if (previous) { previous.style.outline = ''; previous.setAttribute('aria-selected', 'false'); }
      const button = this._buttons[grid.index]; button.style.outline = '3px solid #ffd34e'; button.setAttribute('aria-selected', 'true'); this._shownIndex = grid.index;
    }
    if (changedLanguage) {
      const labels = ['UPPER', 'lower', 'accents', 'other', zh ? '删除' : 'Delete', 'OK'];
      for (let i = 0; i < labels.length; i++) this._buttons[65 + i].textContent = labels[i];
      this._hint.textContent = zh ? '方向键选格；Z/Enter选择；Ctrl切组；Shift到OK；X/Esc删除，不取消。' : 'Arrows: move; Z/Enter: choose; Ctrl: group; Shift: OK; X/Esc: delete, not cancel.';
      this._language = language();
    }
    this._text.textContent = grid.text;
    this._status.textContent = `${Array.from(grid.text).length} / ${this._request.max}` + (this._invalidMinimum ? (zh ? ` — 至少输入 ${this._request.min} 字` : ` — Enter at least ${this._request.min} characters`) : '');
  };
  P.removeEditor = function() { this._panel?.remove(); G.document.removeEventListener('keydown', this._keydown); };
  P.terminate = function() { this._closed = true; this.removeEditor(); lifetime.release(this._request); G.Input.clear(); G.TouchInput.clear(); base.terminate.call(this); };
  return CursorScene;
}
