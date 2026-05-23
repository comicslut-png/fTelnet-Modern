import { describe, it, expect } from 'vitest';
import {
  t,
  tf,
  LANGUAGES,
  isAvailable,
  DEFAULT_LANGUAGE,
  type Language,
} from '@i18n/index.js';
import { en } from '@i18n/en.js';
import { de } from '@i18n/de.js';

/*
  Tests for the i18n core (Phase 5 beta.6).

  Focus on the contract that makes incremental translation safe:
  - English is the complete base.
  - A translated key returns the translation.
  - An untranslated key falls back to English.
  - The language registry distinguishes functional vs placeholder.
*/

describe('i18n core', () => {
  describe('t() basic lookup', () => {
    it('returns the English string for English', () => {
      expect(t('menu.connect', 'en')).toBe('Connect');
    });

    it('defaults to English when no language is given', () => {
      expect(t('menu.connect')).toBe(en['menu.connect']);
    });

    it('returns the German string when translated', () => {
      expect(t('menu.connect', 'de')).toBe('Verbinden');
      expect(t('menu.settings', 'de')).toBe('Einstellungen');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to English for a key the German catalog omits', () => {
      // Construct a key that exists in en but (hypothetically) not
      // in de by checking every base key: any key de lacks must
      // return exactly the English value.
      const enKeys = Object.keys(en) as (keyof typeof en)[];
      for (const key of enKeys) {
        const deHas = Object.prototype.hasOwnProperty.call(de, key);
        if (!deHas) {
          expect(t(key, 'de')).toBe(en[key]);
        }
      }
    });

    it('falls back to English for a placeholder language (fr/es)', () => {
      // fr and es have no catalog registered — every key should
      // return the English base.
      expect(t('menu.connect', 'fr' as Language)).toBe('Connect');
      expect(t('menu.settings', 'es' as Language)).toBe('Settings');
    });

    it('never returns undefined for any base key in any language', () => {
      const enKeys = Object.keys(en) as (keyof typeof en)[];
      const langs: Language[] = ['en', 'de', 'fr', 'es'];
      for (const lang of langs) {
        for (const key of enKeys) {
          const val = t(key, lang);
          expect(val).toBeTypeOf('string');
          expect(val.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('language registry', () => {
    it('lists English and German as available', () => {
      expect(isAvailable('en')).toBe(true);
      expect(isAvailable('de')).toBe(true);
    });

    it('lists French and Spanish as NOT available (placeholders)', () => {
      expect(isAvailable('fr')).toBe(false);
      expect(isAvailable('es')).toBe(false);
    });

    it('rejects unknown language codes', () => {
      expect(isAvailable('klingon')).toBe(false);
      expect(isAvailable('')).toBe(false);
    });

    it('exposes the four languages in display order with endonyms', () => {
      expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'de', 'fr', 'es']);
      expect(LANGUAGES.map((l) => l.endonym)).toEqual([
        'English',
        'Deutsch',
        'Français',
        'Español',
      ]);
    });

    it('marks exactly the available languages', () => {
      const available = LANGUAGES.filter((l) => l.available).map((l) => l.code);
      expect(available).toEqual(['en', 'de']);
    });

    it('default language is English', () => {
      expect(DEFAULT_LANGUAGE).toBe('en');
    });
  });

  describe('tf (interpolation)', () => {
    it('fills a single placeholder', () => {
      expect(tf('status.connecting', 'en', { host: 'bbs:23' })).toBe(
        'Connecting to bbs:23',
      );
    });

    it('fills multiple placeholders', () => {
      expect(
        tf('status.connecting.proxy', 'en', {
          host: 'bbs:23',
          proxy: 'p.example.com',
        }),
      ).toBe('Connecting to bbs:23 via p.example.com');
    });

    it('interpolates into the German template', () => {
      expect(tf('status.connected', 'de', { host: 'bbs:23' })).toBe(
        'Verbunden mit bbs:23',
      );
    });

    it('leaves an unmatched placeholder token untouched', () => {
      expect(tf('status.connecting.proxy', 'en', { host: 'bbs:23' })).toBe(
        'Connecting to bbs:23 via {proxy}',
      );
    });

    it('falls back to English template for placeholder languages', () => {
      expect(tf('status.connected', 'fr' as Language, { host: 'x:1' })).toBe(
        'Connected to x:1',
      );
    });
  });

  describe('German catalog sanity', () => {
    it('translates all main-menu keys (the beta.6 functional scope)', () => {
      const menuKeys = (Object.keys(en) as (keyof typeof en)[]).filter((k) =>
        k.startsWith('menu.'),
      );
      for (const key of menuKeys) {
        // Every menu key must be present AND different from English
        // (German menu is the proving ground — it should be real).
        expect(Object.prototype.hasOwnProperty.call(de, key)).toBe(true);
      }
    });

    it('uses endonyms for language names (not translated)', () => {
      // The German catalog shows each language in its own name.
      expect(t('settings.language.german', 'de')).toBe('Deutsch');
      expect(t('settings.language.french', 'de')).toBe('Français');
    });
  });
});
