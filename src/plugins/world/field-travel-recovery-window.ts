/** Small failure window. Opaque App diagnostics never become player-facing text. */
import type { RecoveryChoice, RecoveryView } from './field-travel-recovery-ui-mz';
import type { createMZFieldShortcutView } from './field-shortcut-window';

type Host = Parameters<typeof createMZFieldShortcutView>[0];
export function createMZFieldTravelRecoveryView(host: Host): RecoveryView {
  const window = new host.Window_Base(new host.Rectangle(0, 0, host.width, host.height)); let disposed = false;
  try { host.scene.addWindow(window); } catch (error) { window.destroy(); throw error; }
  const text = (key: string, en: string, zh: string): string => host.translator.tOr('world.recovery.' + key, host.translator.lang === 'zh' ? zh : en);
  return {
    show(model) {
      if (disposed) return;
      const state = model.snapshot, arrived = state.physical === 'arrived' || state.phase === 'after-arrival';
      window.contents.clear(); window.contents.fontFace = host.translator.font() ?? 'sans-serif'; window.contents.fontSize = 20;
      const width = window.innerWidth, line = 34;
      window.drawText(state.status === 'unavailable' ? text('unavailableTitle', 'Operation unfinished', '操作尚未完成') : text('title', 'Travel unfinished', '移动尚未完成'), 0, 0, width);
      const message = model.actionReason === 'source-changed' || model.actionReason === 'request-unavailable'
        ? text('changed', 'The situation changed. Close this window and choose again.', '情况已经变化，请关闭窗口后重新选择。')
        : state.reasonCode === 'operation-active' ? text('busy', 'Another operation is active. Try again after it ends.', '另一项操作正在进行，结束后可以再试。')
        : arrived ? text('arrived', 'You have arrived, but the remaining steps did not finish.', '已经抵达目的地，但收尾步骤尚未完成。')
        : state.reasonCode === 'load-failed' ? text('load', 'The destination could not be loaded. You are still on the source map.', '目的地暂时无法载入，你仍在原地图。')
        : state.status === 'unavailable' ? text('select', 'This attempt cannot continue. Close this window and choose again.', '这次尝试无法继续，关闭窗口后可以重新选择。')
        : state.physical === 'unavailable' ? text('unknown', 'Arrival could not be confirmed. No completed step will be undone.', '暂时无法确认抵达情况；已经完成的步骤不会撤回。')
        : text('failed', 'The move stopped. Completed steps will be kept.', '这次移动未能完成，已经完成的步骤会保留。');
      window.drawText(message, 0, line * 2, width);
      if (arrived) window.drawText(text('noRollback', 'Retry finishes the remaining work; it does not move you back.', '重试只补齐收尾，不会把你移回原处。'), 0, line * 3, width);
      const label = (choice: RecoveryChoice): string => choice === 'retry'
        ? (arrived ? text('finish', 'Finish remaining steps', '完成收尾') : text('retry', 'Retry', '重试')) + (state.retry.enabled ? '' : text('disabled', ' (unavailable now)', '（暂不可用）'))
        : choice === 'cancel' ? text('cancel', 'Cancel this move', '取消这次移动') : text('hide', 'Close for now', '暂时收起');
      model.choices.forEach((choice, index) => window.drawText((model.row === index ? '▶ ' : '  ') + label(choice), 0, line * (index + 5), width));
      window.drawText(text('help', 'Arrows: choose   Enter: select   Esc: close', '方向键选择　回车确定　Esc收起'), 0, window.innerHeight - line, width);
      window.show();
    },
    dispose() { if (disposed) return; disposed = true; try { window.parent?.removeChild(window); } finally { window.destroy(); } },
  };
}
