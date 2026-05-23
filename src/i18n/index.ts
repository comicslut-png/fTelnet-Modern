/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) Rick Parrish, R&M Software

  This file is part of fTelnet.

  fTelnet is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  fTelnet is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with fTelnet.  If not, see <http://www.gnu.org/licenses/>.
*/

import { en, type TranslationKey, type Catalog } from './en.js';
import { de } from './de.js';
import { fr } from './fr.js';

/**
 * fTelnet-Modern internationalization (i18n) core. Phase 5 (beta.6).
 *
 * Design: a flat key → string catalog per language, with English
 * (`en.ts`) as the base/fallback. `t(key, lang)` returns the
 * `lang` translation if present, else the English base string. This
 * fallback is what makes incremental translation safe — a language
 * can ship with only some keys translated and the app stays fully
 * usable (translated where available, English elsewhere).
 *
 * Adding a language later is a three-step, code-light process:
 *   1. Copy `en.ts` to e.g. `fr.ts`, translate the values, type it
 *      as `Catalog` (so missing keys are allowed).
 *   2. Import it here and add it to `CATALOGS`.
 *   3. Set the matching entry in `LANGUAGES` to `available: true`.
 * No component code changes — every component already calls `t()`.
 *
 * The `LANGUAGES` list also carries "coming soon" placeholders
 * (available: false) so the Settings picker can advertise languages
 * that aren't translated yet, inviting contributions, without
 * letting users select a non-functional option.
 */

/** Supported language codes. 'en' is the base and always complete. */
export type Language = 'en' | 'de' | 'fr' | 'es';

/**
 * Catalogs for languages that have (at least partial) translations.
 * English is the base; others are partial and fall back to it.
 * Languages NOT in this map (currently 'es') are placeholders —
 * selecting them is prevented at the UI layer (see `available`
 * below), but if one somehow reached `t()` it would simply fall
 * back to English.
 */
const CATALOGS: Partial<Record<Language, Catalog>> = {
  de,
  fr,
};

/**
 * Descriptor for a language shown in the Settings picker.
 *   - code: the Language value persisted/selected
 *   - endonym: the language's own name (shown to the user)
 *   - available: whether it's actually functional. false = "coming
 *     soon" placeholder, rendered disabled in the picker.
 */
export interface LanguageInfo {
  code: Language;
  endonym: string;
  available: boolean;
}

/**
 * The languages the picker knows about, in display order. English,
 * German, and French are functional; Spanish is a placeholder
 * ("coming soon") to advertise the feature and invite translation
 * help. Add real translations by flipping `available` to true and
 * registering the catalog above.
 */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', endonym: 'English', available: true },
  { code: 'de', endonym: 'Deutsch', available: true },
  { code: 'fr', endonym: 'Français', available: true },
  { code: 'es', endonym: 'Español', available: false },
];

/** True if `lang` is a real, selectable (functional) language. */
export function isAvailable(lang: string): lang is Language {
  return LANGUAGES.some((l) => l.code === lang && l.available);
}

/** The default/base language used when nothing else applies. */
export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * Translate `key` into `lang`. Returns the language's string if the
 * catalog has it, otherwise the English base string. `key` is typed
 * to the set of valid keys, so typos are caught at compile time.
 *
 * @param key  a key from the English base catalog
 * @param lang the target language (defaults to English)
 */
export function t(key: TranslationKey, lang: Language = DEFAULT_LANGUAGE): string {
  if (lang !== 'en') {
    const catalog = CATALOGS[lang];
    if (catalog !== undefined) {
      const translated = catalog[key];
      if (translated !== undefined) {
        return translated;
      }
    }
  }
  return en[key];
}

/**
 * Translate `key` and interpolate `{placeholder}` tokens from
 * `params`. Used for parameterized strings like the status-bar
 * messages ("Connecting to {host}"). A token with no matching
 * param is left untouched (so a missing param is visible rather
 * than silently dropped). Falls back to English like `t()`.
 *
 * @example tf('status.connecting', 'de', { host: 'bbs:23' })
 *          → "Verbinde mit bbs:23"
 */
export function tf(
  key: TranslationKey,
  lang: Language,
  params: Record<string, string>,
): string {
  const template = t(key, lang);
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    return Object.prototype.hasOwnProperty.call(params, name)
      ? params[name]!
      : match;
  });
}

export type { TranslationKey, Catalog } from './en.js';
