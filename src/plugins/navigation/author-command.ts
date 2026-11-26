/** Failure-only diagnostics for opted-in commands. Raw arguments and exceptions never become output. */
import { isolatedTestScope, testStorageStillBound } from '../isolated-test-scope';
import { runtimeError } from './runtime-error';

const fields = new Set(['choicesZh','choicesEn','helpZh','helpEn','defaultIndex','cancelValue','resultVariableId',
  'settings','settings.range','mode','maxLength','minLength','initialVariableId','textZh.ch','textEn.ch',
  'textZh.l','textEn.l','historyLimit']);
const fieldAllowed = (field: string): boolean =>
  fields.has(field) || /^settings\[(?:0|[1-9]\d{0,8})\](?:\.(?:operation|value|maximum))?$/.test(field);
const parameters = new WeakMap<object, { readonly field: string; readonly hint: string }>();

export class AuthorParameterError extends Error {
  constructor(field: string, hint: string) {
    super(hint);
    // Field suffixes are derived by the parsers from their own index, never from a JSON key.
    // The diagnostic hints are fixed literals at the call sites, not the Error.message.
    if (fieldAllowed(field)) parameters.set(this, { field, hint });
  }
}
export function authorJson(text: string, field: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new AuthorParameterError(field, 'Use valid JSON; check quotes, commas and brackets.'); }
}
export function registerAuthorCommand(G: any, command: string, run: (this: any, args: Record<string, string>) => void): void {
  const scope = isolatedTestScope(G);
  G.PluginManager.registerCommand('PS_Management', command, function(this: any, args: Record<string, string>) {
    try { return run.call(this, args); }
    catch (error) {
      const parameter = error !== null && typeof error === 'object' ? parameters.get(error) : undefined;
      // Keep the normal Reactor stop/error contract, but print only fixed public text.
      const safe = runtimeError(`PS_Management.${command}: ${parameter ? '事件参数无效 / Invalid event parameters' : '事件无法执行 / Event could not run'} [${parameter ? 'WP07-EVENT' : 'WP07-HOST'}]`);
      if (testStorageStillBound(G, scope)) try {
        const id = (value: unknown): number | null =>
          typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 0x7fffffff ? value : null;
        const mapId = id(this?._mapId), eventId = id(this?._eventId), list = this?._list;
        const byList = Array.isArray(list);
        const pages = byList && mapId !== null && mapId === G.$gameMap?.mapId?.() ? G.$dataMap?.events?.[eventId ?? -1]?.pages : undefined;
        const pageIndex = Array.isArray(pages) ? pages.findIndex((page: any) => page?.list === list) : -1;
        const common = byList && Array.isArray(G.$dataCommonEvents) ? G.$dataCommonEvents.find((event: any) => event && event.list === list) : undefined;
        const index = id(this?._index);
        G.console.error('PS_Management author command', {
          plugin: 'PS_Management', command, mapId, eventId, page: pageIndex >= 0 ? id(pageIndex + 1) : null,
          commonEventId: id(common?.id), commandNumber: index === null ? null : id(index + 1),
          field: parameter?.field ?? null,
          hint: parameter?.hint ?? 'Check the required message/scene host and plugin order; no original exception or input is included.',
        });
      } catch { /* The coarse safe failure still propagates if a location or the local console is unavailable. */ }
      throw safe;
    }
  });
}
