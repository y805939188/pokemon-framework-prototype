/** Built-in languages and the default translator (English). */
import { createTranslator } from "./translator.ts";
import type { LocaleTable, Translator } from "./translator.ts";
import { en } from "./locales/en.ts";
import { zh } from "./locales/zh.ts";

import { managementEnglish, managementChinese } from "./locales/management.ts";
export const BUILTIN_LOCALES: Record<string, LocaleTable> = { en: { ...en, text: { ...en.text, ...managementEnglish } }, zh: { ...zh, text: { ...zh.text, ...managementChinese } } };
export const defaultTranslator = (): Translator => createTranslator(BUILTIN_LOCALES, "en");
export const translatorFor = (lang: string): Translator => createTranslator(BUILTIN_LOCALES, Object.prototype.hasOwnProperty.call(BUILTIN_LOCALES, lang) ? lang : "en");
export { createTranslator, checkLocale, placeholdersOf } from "./translator.ts";
export type { LocaleTable, Translator, Params, TextDiagnostics, LocaleCheck } from "./translator.ts";
