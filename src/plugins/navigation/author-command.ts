/** Failure-only diagnostics for opt-in author message commands. No raw arguments/errors are reported. */
export class AuthorParameterError extends Error {
  constructor(readonly field: string, readonly hint: string) { super(hint); }
}
export function authorJson(text: string, field: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new AuthorParameterError(field, 'Use valid JSON; check quotes, commas and brackets.'); }
}
export function registerAuthorCommand(G: any, command: string, run: (this: any, args: Record<string, string>) => void): void {
  G.PluginManager.registerCommand('PS_Management', command, function(this: any, args: Record<string, string>) {
    try { return run.call(this, args); }
    catch (error) {
      const parameter = error instanceof AuthorParameterError;
      // Keep the ordinary host's stop/error contract. Its player display and console receive only this safe error.
      const safe = new Error(`PS_Management.${command}: ${parameter ? '事件参数无效 / Invalid event parameters' : '事件无法执行 / Event could not run'} [${parameter ? 'WP07-EVENT' : 'WP07-HOST'}]`);
      safe.stack = `${safe.name}: ${safe.message}`;
      if (G.Utils?.isOptionValid?.('test')) {
        const id = (value: unknown): number | null => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
        const mapId = id(this._mapId), eventId = id(this._eventId), list = this._list;
        const pages = mapId === G.$gameMap?.mapId?.() ? G.$dataMap?.events?.[eventId ?? -1]?.pages : undefined;
        const pageIndex = Array.isArray(pages) ? pages.findIndex((page: any) => page.list === list) : -1;
        const common = Array.isArray(G.$dataCommonEvents) ? G.$dataCommonEvents.find((event: any) => event && event.list === list) : undefined;
        try { G.console.error('PS_Management author command', {
          plugin: 'PS_Management', command, mapId, eventId, page: pageIndex >= 0 ? pageIndex + 1 : null,
          commonEventId: id(common?.id), commandNumber: id(this._index) === null ? null : this._index + 1,
          field: parameter ? error.field : null,
          hint: parameter ? error.hint : 'Check the required message/scene host and plugin order; no original exception or input is included.',
        }); } catch { /* The safe host failure still propagates if the developer console fails. */ }
      }
      throw safe;
    }
  });
}
