/** Built-in languages and the default translator (English). */
import { createTranslator } from "./translator";
import type { LocaleTable, Translator } from "./translator";
import { en } from "./locales/en";
import { zh } from "./locales/zh";

import { pokedexEnglish, pokedexChinese } from "./locales/pokedex";
import { managementEnglish, managementChinese } from "./locales/management";
export const BUILTIN_LOCALES: Record<string, LocaleTable> = { en: { ...en, text: { ...en.text, ...managementEnglish, ...pokedexEnglish } }, zh: { ...zh, text: { ...zh.text, ...managementChinese, ...pokedexChinese } } };
export const defaultTranslator = (): Translator => createTranslator(BUILTIN_LOCALES, "en");
export const translatorFor = (lang: string): Translator => createTranslator(BUILTIN_LOCALES, Object.prototype.hasOwnProperty.call(BUILTIN_LOCALES, lang) ? lang : "en");
export { createTranslator, checkLocale, placeholdersOf } from "./translator";
export type { LocaleTable, Translator, Params, TextDiagnostics, LocaleCheck } from "./translator";
