/** A command window around the same move details renderer used by teaching/reminding.
 * The caller owns decisions; this window only returns its selected command slot.
 */
import { drawLearningPage } from './learning-draw';
import type { LearningPage } from './learning-screen';

export function createMoveSelectionWindow(G: any, rect: any, ports: Parameters<typeof drawLearningPage>[2]): any {
  function MoveWindow(this: any) { this.initialize(rect); }
  const P = MoveWindow.prototype = Object.create(G.Window_Command.prototype);
  P.constructor = MoveWindow;
  P.initialize = function (rectangle: any) {
    this._items = [];
    this.page = { kind: 'moves', title: '', rows: [], cursor: 0 } satisfies LearningPage;
    this.rendered = [];
    G.Window_Command.prototype.initialize.call(this, rectangle);
  };
  P.makeCommandList = function () {
    for (const item of this._items) this.addCommand(item.name, 'ok', true, item.ext);
  };
  P.setItems = function (items: any[]) {
    this._items = items;
    this.refresh();
    this.select(0);
  };
  P.itemAt = function (index: number) { return this._items[index]; };
  P.maxCols = function () { return 1; };
  P.itemHeight = function () { return 34; };
  // The shared renderer scrolls rows itself; the host must not scroll its details panel.
  P.ensureCursorVisible = function () {};
  P.maxScrollY = function () { return 0; };
  P.itemRect = function (index: number) {
    const count = Math.max(1, Math.floor((this.contents.height - 200) / 34));
    const start = Math.max(0, this.page.cursor - count + 1);
    return new G.Rectangle(8, 124 + (index - start) * 34, Math.floor(this.contents.width * .46) - 16, 32);
  };
  P.drawAllItems = function () {
    this.rendered = drawLearningPage(this, this.page, ports);
  };
  P.select = function (index: number) {
    G.Window_Command.prototype.select.call(this, index);
    if (this.page && index >= 0 && index < this.page.rows.length) {
      this.page.cursor = index;
      this.drawAllItems();
    }
  };
  return new (MoveWindow as any)();
}
