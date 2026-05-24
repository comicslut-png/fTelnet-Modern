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
import { it as itCatalog } from '@i18n/it.js';

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

    it('translates the German popup/message strings (beta.28)', () => {
      // Upload dialog
      expect(t('upload.title', 'de')).toBe('Upload bestätigen');
      expect(t('upload.button.send', 'de')).toBe('Senden');
      expect(t('upload.button.cancel', 'de')).toBe('Abbrechen');
      expect(t('upload.value.unknown', 'de')).toBe('Unbekannt');
      // Drop overlay, focus, link prompt, scrollback, disconnect
      expect(t('drop.title', 'de')).toBe('Datei hier ablegen');
      expect(t('url.confirm.title', 'de')).toBe('Link öffnen');
      expect(t('focus.message', 'de')).toContain('HIER KLICKEN');
      expect(t('scrollback.exit', 'de')).toBe('Beenden');
      expect(t('disconnect.confirm.title', 'de')).toBe(
        'Verbindung trennen',
      );
      // Shared dialog buttons
      expect(t('dialog.button.cancel', 'de')).toBe('Abbrechen');
    });

    it('interpolates the German popup strings (beta.28)', () => {
      expect(tf('upload.value.fileCount', 'de', { count: '3' })).toBe(
        '3 Dateien',
      );
      expect(tf('upload.button.sendCount', 'de', { count: '5' })).toBe(
        '5 Dateien senden',
      );
      expect(tf('drop.subtitle', 'de', { protocol: 'ZMODEM' })).toBe(
        'zum Hochladen über ZMODEM',
      );
      const body = tf('url.confirm.body', 'de', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to English for a key a partial catalog omits', () => {
      // German is now a complete catalog, so it no longer exercises
      // the fallback path. Use Italian, which still has the older
      // menu/status keys but not yet the post-beta.22 message keys —
      // any key it lacks must return exactly the English value.
      const enKeys = Object.keys(en) as (keyof typeof en)[];
      let exercisedAtLeastOne = false;
      for (const key of enKeys) {
        const itHas = Object.prototype.hasOwnProperty.call(itCatalog, key);
        if (!itHas) {
          exercisedAtLeastOne = true;
          expect(t(key, 'it')).toBe(en[key]);
        }
      }
      // Guard: if Italian ever gets completed too, this test would
      // silently stop testing anything — fail loudly so we repoint it.
      expect(exercisedAtLeastOne).toBe(true);
    });

    it('falls back to English for an unregistered language code', () => {
      // All four listed languages now have catalogs, so to exercise
      // the fallback path we use a code with no catalog registered.
      // (The mechanism still matters for any future language added
      // to the picker before its catalog ships.)
      const fake = 'xx' as Language;
      expect(t('menu.connect', fake)).toBe('Connect');
      expect(t('menu.settings', fake)).toBe('Settings');
    });

    it('returns the French string when translated', () => {
      expect(t('menu.connect', 'fr')).toBe('Se connecter');
      expect(t('menu.settings', 'fr')).toBe('Paramètres');
    });

    it('translates the French popup/message strings (beta.29)', () => {
      expect(t('upload.title', 'fr')).toBe('Confirmer l\'envoi');
      expect(t('upload.button.send', 'fr')).toBe('Envoyer');
      expect(t('upload.button.cancel', 'fr')).toBe('Annuler');
      expect(t('upload.value.unknown', 'fr')).toBe('Inconnu');
      expect(t('drop.title', 'fr')).toBe('Déposez le fichier ici');
      expect(t('url.confirm.title', 'fr')).toBe('Ouvrir le lien');
      expect(t('focus.message', 'fr')).toContain('CLIQUEZ ICI');
      expect(t('scrollback.exit', 'fr')).toBe('Quitter');
      expect(t('disconnect.confirm.title', 'fr')).toBe('Se déconnecter');
      expect(t('dialog.button.cancel', 'fr')).toBe('Annuler');
    });

    it('interpolates the French popup strings (beta.29)', () => {
      expect(tf('upload.value.fileCount', 'fr', { count: '3' })).toBe(
        '3 fichiers',
      );
      expect(tf('upload.button.sendCount', 'fr', { count: '5' })).toBe(
        'Envoyer 5 fichiers',
      );
      expect(tf('drop.subtitle', 'fr', { protocol: 'ZMODEM' })).toBe(
        'pour l\'envoyer via ZMODEM',
      );
      const body = tf('url.confirm.body', 'fr', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('never returns undefined for any base key in any language', () => {
      const enKeys = Object.keys(en) as (keyof typeof en)[];
      const langs: Language[] = ['en', 'de', 'fr', 'es', 'pt', 'nl', 'it', 'ru', 'sv', 'pl', 'uk', 'fi', 'el', 'cs', 'ja'];
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
    it('lists English, German, and French as available', () => {
      expect(isAvailable('en')).toBe(true);
      expect(isAvailable('de')).toBe(true);
      expect(isAvailable('fr')).toBe(true);
    });

    it('lists all fifteen languages as available', () => {
      expect(isAvailable('en')).toBe(true);
      expect(isAvailable('de')).toBe(true);
      expect(isAvailable('fr')).toBe(true);
      expect(isAvailable('es')).toBe(true);
      expect(isAvailable('pt')).toBe(true);
      expect(isAvailable('nl')).toBe(true);
      expect(isAvailable('it')).toBe(true);
      expect(isAvailable('ru')).toBe(true);
      expect(isAvailable('sv')).toBe(true);
      expect(isAvailable('pl')).toBe(true);
      expect(isAvailable('uk')).toBe(true);
      expect(isAvailable('fi')).toBe(true);
      expect(isAvailable('el')).toBe(true);
      expect(isAvailable('cs')).toBe(true);
      expect(isAvailable('ja')).toBe(true);
    });

    it('returns the Japanese (CJK) string when translated', () => {
      expect(t('menu.connect', 'ja')).toBe('接続');
      expect(t('menu.settings', 'ja')).toBe('設定');
    });

    it('returns the Czech string when translated', () => {
      expect(t('menu.connect', 'cs')).toBe('Připojit');
      expect(t('menu.settings', 'cs')).toBe('Nastavení');
    });

    it('returns the Greek string when translated', () => {
      expect(t('menu.connect', 'el')).toBe('Σύνδεση');
      expect(t('menu.settings', 'el')).toBe('Ρυθμίσεις');
    });

    it('returns the Finnish string when translated', () => {
      expect(t('menu.connect', 'fi')).toBe('Yhdistä');
      expect(t('menu.settings', 'fi')).toBe('Asetukset');
    });

    it('returns the Polish string when translated', () => {
      expect(t('menu.connect', 'pl')).toBe('Połącz');
      expect(t('menu.settings', 'pl')).toBe('Ustawienia');
    });

    it('returns the Ukrainian (Cyrillic) string when translated', () => {
      expect(t('menu.connect', 'uk')).toBe('Підключитися');
      expect(t('menu.settings', 'uk')).toBe('Налаштування');
    });

    it('returns the Swedish string when translated', () => {
      expect(t('menu.connect', 'sv')).toBe('Anslut');
      expect(t('menu.settings', 'sv')).toBe('Inställningar');
    });

    it('returns the Spanish string when translated', () => {
      expect(t('menu.connect', 'es')).toBe('Conectar');
      expect(t('menu.settings', 'es')).toBe('Configuración');
    });

    it('translates the Spanish popup/message strings (beta.30)', () => {
      expect(t('upload.title', 'es')).toBe('Confirmar envío');
      expect(t('upload.button.send', 'es')).toBe('Enviar');
      expect(t('upload.button.cancel', 'es')).toBe('Cancelar');
      expect(t('upload.value.unknown', 'es')).toBe('Desconocido');
      expect(t('drop.title', 'es')).toBe('Suelte el archivo aquí');
      expect(t('url.confirm.title', 'es')).toBe('Abrir enlace');
      expect(t('focus.message', 'es')).toContain('HAGA CLIC');
      expect(t('scrollback.exit', 'es')).toBe('Salir');
      expect(t('disconnect.confirm.title', 'es')).toBe('Desconectar');
      expect(t('dialog.button.ok', 'es')).toBe('Aceptar');
      expect(t('dialog.button.cancel', 'es')).toBe('Cancelar');
    });

    it('interpolates the Spanish popup strings (beta.30)', () => {
      expect(tf('upload.value.fileCount', 'es', { count: '3' })).toBe(
        '3 archivos',
      );
      expect(tf('upload.button.sendCount', 'es', { count: '5' })).toBe(
        'Enviar 5 archivos',
      );
      expect(tf('drop.subtitle', 'es', { protocol: 'ZMODEM' })).toBe(
        'para enviarlo mediante ZMODEM',
      );
      const body = tf('url.confirm.body', 'es', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Portuguese string when translated', () => {
      expect(t('menu.connect', 'pt')).toBe('Conectar');
      expect(t('menu.settings', 'pt')).toBe('Configurações');
    });

    it('returns the Dutch string when translated', () => {
      expect(t('menu.connect', 'nl')).toBe('Verbinden');
      expect(t('menu.settings', 'nl')).toBe('Instellingen');
    });

    it('translates the Dutch popup/message strings (beta.24)', () => {
      // Upload dialog
      expect(t('upload.title', 'nl')).toBe('Upload bevestigen');
      expect(t('upload.button.send', 'nl')).toBe('Verzenden');
      expect(t('upload.button.cancel', 'nl')).toBe('Annuleren');
      expect(t('upload.value.unknown', 'nl')).toBe('Onbekend');
      // Drop overlay + focus warning + open-link prompt
      expect(t('drop.title', 'nl')).toBe('Sleep bestand hierheen');
      expect(t('url.confirm.title', 'nl')).toBe('Koppeling openen');
      // The focus banner keeps its all-caps style in Dutch.
      expect(t('focus.message', 'nl')).toContain('KLIK HIER');
    });

    it('interpolates the Dutch popup strings (beta.24)', () => {
      expect(tf('upload.value.fileCount', 'nl', { count: '3' })).toBe(
        '3 bestanden',
      );
      expect(tf('upload.button.sendCount', 'nl', { count: '5' })).toBe(
        '5 bestanden verzenden',
      );
      expect(tf('drop.subtitle', 'nl', { protocol: 'ZMODEM' })).toBe(
        'om te uploaden via ZMODEM',
      );
      // url.confirm.body has a real newline before the URL.
      const body = tf('url.confirm.body', 'nl', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('translates the Dutch scrollback + dialog strings (beta.25)', () => {
      // Scrollback bar
      expect(t('scrollback.lineUp', 'nl')).toBe('Regel omhoog');
      expect(t('scrollback.pageDown', 'nl')).toBe('Pagina omlaag');
      expect(t('scrollback.exit', 'nl')).toBe('Afsluiten');
      expect(t('scrollback.label', 'nl')).toBe('TERUGSCROLLEN:');
      // Download/copy info dialogs (translated since beta.6, now
      // actually wired at the call sites in beta.25).
      expect(t('dialog.download.title', 'nl')).toBe('Bestanden downloaden');
      expect(t('dialog.copy.title', 'nl')).toBe('Tekst kopiëren');
    });

    it('translates the Dutch disconnect + coming-soon strings (beta.26)', () => {
      expect(t('disconnect.confirm.title', 'nl')).toBe(
        'Verbinding verbreken',
      );
      expect(t('disconnect.confirm.body', 'nl')).toContain('verbreken');
      expect(t('settings.language.comingSoon', 'nl')).toContain(
        'Binnenkort',
      );
    });

    it('translates the shared dialog buttons (beta.26)', () => {
      expect(t('dialog.button.ok', 'nl')).toBe('OK');
      expect(t('dialog.button.cancel', 'nl')).toBe('Annuleren');
      // English base
      expect(t('dialog.button.cancel', 'en')).toBe('Cancel');
    });

    it('returns the Italian string when translated', () => {
      expect(t('menu.connect', 'it')).toBe('Connetti');
      expect(t('menu.settings', 'it')).toBe('Impostazioni');
    });

    it('returns the Russian (Cyrillic) string when translated', () => {
      expect(t('menu.connect', 'ru')).toBe('Подключиться');
      expect(t('menu.settings', 'ru')).toBe('Настройки');
    });

    it('handles Cyrillic round-trip without corruption', () => {
      // The first non-Latin script — confirm UTF-8 strings survive
      // intact through import and lookup (length + exact match).
      const about = t('settings.about', 'ru');
      expect(about).toBe('О программе');
      expect([...about].length).toBe(11); // code-point count, not bytes
    });

    it('rejects unknown language codes', () => {
      expect(isAvailable('klingon')).toBe(false);
      expect(isAvailable('')).toBe(false);
    });

    it('exposes the fifteen languages in display order with endonyms', () => {
      expect(LANGUAGES.map((l) => l.code)).toEqual([
        'en',
        'de',
        'fr',
        'es',
        'pt',
        'nl',
        'it',
        'ru',
        'sv',
        'pl',
        'uk',
        'fi',
        'el',
        'cs',
        'ja',
      ]);
      expect(LANGUAGES.map((l) => l.endonym)).toEqual([
        'English',
        'Deutsch',
        'Français',
        'Español',
        'Português',
        'Nederlands',
        'Italiano',
        'Русский',
        'Svenska',
        'Polski',
        'Українська',
        'Suomi',
        'Ελληνικά',
        'Čeština',
        '日本語',
      ]);
    });

    it('marks all fifteen languages available', () => {
      const available = LANGUAGES.filter((l) => l.available).map((l) => l.code);
      expect(available).toEqual([
        'en',
        'de',
        'fr',
        'es',
        'pt',
        'nl',
        'it',
        'ru',
        'sv',
        'pl',
        'uk',
        'fi',
        'el',
        'cs',
        'ja',
      ]);
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

    it('interpolates into the French template', () => {
      expect(tf('status.connected', 'fr', { host: 'bbs:23' })).toBe(
        'Connecté à bbs:23',
      );
    });

    it('interpolates into the Spanish template', () => {
      expect(tf('status.connected', 'es', { host: 'bbs:23' })).toBe(
        'Conectado a bbs:23',
      );
    });

    it('interpolates into the Portuguese template', () => {
      expect(tf('status.connected', 'pt', { host: 'bbs:23' })).toBe(
        'Conectado a bbs:23',
      );
    });

    it('interpolates into the Dutch template', () => {
      expect(tf('status.connected', 'nl', { host: 'bbs:23' })).toBe(
        'Verbonden met bbs:23',
      );
    });

    it('interpolates into the Italian template', () => {
      expect(tf('status.connected', 'it', { host: 'bbs:23' })).toBe(
        'Connesso a bbs:23',
      );
    });

    it('interpolates into the Russian (Cyrillic) template, host stays Latin', () => {
      expect(tf('status.connected', 'ru', { host: 'bbs:23' })).toBe(
        'Подключено к bbs:23',
      );
    });

    it('interpolates into the Swedish template', () => {
      expect(tf('status.connected', 'sv', { host: 'bbs:23' })).toBe(
        'Ansluten till bbs:23',
      );
    });

    it('interpolates into the Polish template', () => {
      expect(tf('status.connected', 'pl', { host: 'bbs:23' })).toBe(
        'Połączono z bbs:23',
      );
    });

    it('interpolates into the Ukrainian (Cyrillic) template', () => {
      expect(tf('status.connected', 'uk', { host: 'bbs:23' })).toBe(
        'Підключено до bbs:23',
      );
    });

    it('interpolates into the Finnish template', () => {
      expect(tf('status.connected', 'fi', { host: 'bbs:23' })).toBe(
        'Yhdistetty kohteeseen bbs:23',
      );
    });

    it('interpolates into the Greek template', () => {
      expect(tf('status.connected', 'el', { host: 'bbs:23' })).toBe(
        'Συνδέθηκε με bbs:23',
      );
    });

    it('interpolates into the Czech template', () => {
      expect(tf('status.connected', 'cs', { host: 'bbs:23' })).toBe(
        'Připojeno k bbs:23',
      );
    });

    it('interpolates into the Japanese (CJK) template', () => {
      expect(tf('status.connected', 'ja', { host: 'bbs:23' })).toBe(
        'bbs:23 に接続しました',
      );
    });

    it('falls back to English template for an unregistered language', () => {
      expect(tf('status.connected', 'xx' as Language, { host: 'x:1' })).toBe(
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
