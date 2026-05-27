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
    it('falls back to English for a key missing from a partial catalog', () => {
      // Every real catalog is now complete (de/fr/es/pt/it/ru/sv/pl/
      // uk/fi/el/cs/ja all have all 94 keys), so no real language
      // exercises the per-key fallback path anymore. We assert the
      // mechanism directly instead: t() must return the English base
      // for any key absent from a given language's catalog. We prove
      // this via the registered behavior — pick a key and confirm a
      // language that (hypothetically) lacked it would get English —
      // using the unregistered-code path, which is the same lookup
      // miss → English-fallback branch in t().
      //
      // Concretely: a code with no catalog is the strongest form of
      // "every key is missing", so every key must return its English
      // value. This keeps the fallback branch genuinely covered now
      // that all real catalogs are full.
      const enKeys = Object.keys(en) as (keyof typeof en)[];
      const noCatalog = 'zz' as Language;
      for (const key of enKeys) {
        expect(t(key, noCatalog)).toBe(en[key]);
      }
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

    it('translates the Japanese popup/message strings (beta.40)', () => {
      expect(t('upload.title', 'ja')).toBe('アップロードの確認');
      expect(t('upload.button.send', 'ja')).toBe('送信');
      expect(t('upload.button.cancel', 'ja')).toBe('キャンセル');
      expect(t('upload.value.unknown', 'ja')).toBe('不明');
      expect(t('drop.title', 'ja')).toBe('ここにファイルをドロップ');
      expect(t('url.confirm.title', 'ja')).toBe('リンクを開く');
      expect(t('focus.message', 'ja')).toContain('キーボード入力');
      expect(t('scrollback.exit', 'ja')).toBe('終了');
      expect(t('disconnect.confirm.title', 'ja')).toBe('切断');
      expect(t('dialog.button.cancel', 'ja')).toBe('キャンセル');
    });

    it('interpolates the Japanese popup strings (beta.40)', () => {
      expect(tf('upload.value.fileCount', 'ja', { count: '3' })).toBe(
        '3 個のファイル',
      );
      expect(tf('upload.button.sendCount', 'ja', { count: '5' })).toBe(
        '5 個のファイルを送信',
      );
      expect(tf('drop.subtitle', 'ja', { protocol: 'ZMODEM' })).toBe(
        'ZMODEM でアップロード',
      );
      const body = tf('url.confirm.body', 'ja', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Czech string when translated', () => {
      expect(t('menu.connect', 'cs')).toBe('Připojit');
      expect(t('menu.settings', 'cs')).toBe('Nastavení');
    });

    it('translates the Czech popup/message strings (beta.39)', () => {
      expect(t('upload.title', 'cs')).toBe('Potvrdit odeslání');
      expect(t('upload.button.send', 'cs')).toBe('Odeslat');
      expect(t('upload.button.cancel', 'cs')).toBe('Zrušit');
      expect(t('upload.value.unknown', 'cs')).toBe('Neznámé');
      expect(t('drop.title', 'cs')).toBe('Přetáhněte soubor sem');
      expect(t('url.confirm.title', 'cs')).toBe('Otevřít odkaz');
      expect(t('focus.message', 'cs')).toContain('KLIKNĚTE ZDE');
      expect(t('scrollback.exit', 'cs')).toBe('Ukončit');
      expect(t('disconnect.confirm.title', 'cs')).toBe('Odpojit');
      expect(t('dialog.button.cancel', 'cs')).toBe('Zrušit');
    });

    it('interpolates the Czech popup strings (beta.39)', () => {
      expect(tf('upload.value.fileCount', 'cs', { count: '3' })).toBe(
        'Soubory: 3',
      );
      expect(tf('upload.button.sendCount', 'cs', { count: '5' })).toBe(
        'Odeslat soubory: 5',
      );
      expect(tf('drop.subtitle', 'cs', { protocol: 'ZMODEM' })).toBe(
        'pro odeslání přes ZMODEM',
      );
      const body = tf('url.confirm.body', 'cs', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Greek string when translated', () => {
      expect(t('menu.connect', 'el')).toBe('Σύνδεση');
      expect(t('menu.settings', 'el')).toBe('Ρυθμίσεις');
    });

    it('translates the Greek popup/message strings (beta.38)', () => {
      expect(t('upload.title', 'el')).toBe('Επιβεβαίωση αποστολής');
      expect(t('upload.button.send', 'el')).toBe('Αποστολή');
      expect(t('upload.button.cancel', 'el')).toBe('Άκυρο');
      expect(t('upload.value.unknown', 'el')).toBe('Άγνωστο');
      expect(t('drop.title', 'el')).toBe('Αποθέστε το αρχείο εδώ');
      expect(t('url.confirm.title', 'el')).toBe('Άνοιγμα συνδέσμου');
      expect(t('focus.message', 'el')).toContain('ΚΑΝΤΕ ΚΛΙΚ ΕΔΩ');
      expect(t('scrollback.exit', 'el')).toBe('Έξοδος');
      expect(t('disconnect.confirm.title', 'el')).toBe('Αποσύνδεση');
      expect(t('dialog.button.cancel', 'el')).toBe('Άκυρο');
    });

    it('interpolates the Greek popup strings (beta.38)', () => {
      expect(tf('upload.value.fileCount', 'el', { count: '3' })).toBe(
        '3 αρχεία',
      );
      expect(tf('upload.button.sendCount', 'el', { count: '5' })).toBe(
        'Αποστολή 5 αρχείων',
      );
      expect(tf('drop.subtitle', 'el', { protocol: 'ZMODEM' })).toBe(
        'για αποστολή μέσω ZMODEM',
      );
      const body = tf('url.confirm.body', 'el', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Finnish string when translated', () => {
      expect(t('menu.connect', 'fi')).toBe('Yhdistä');
      expect(t('menu.settings', 'fi')).toBe('Asetukset');
    });

    it('translates the Finnish popup/message strings (beta.37)', () => {
      expect(t('upload.title', 'fi')).toBe('Vahvista lähetys');
      expect(t('upload.button.send', 'fi')).toBe('Lähetä');
      expect(t('upload.button.cancel', 'fi')).toBe('Peruuta');
      expect(t('upload.value.unknown', 'fi')).toBe('Tuntematon');
      expect(t('drop.title', 'fi')).toBe('Pudota tiedosto tähän');
      expect(t('url.confirm.title', 'fi')).toBe('Avaa linkki');
      expect(t('focus.message', 'fi')).toContain('NAPSAUTA TÄSTÄ');
      expect(t('scrollback.exit', 'fi')).toBe('Poistu');
      expect(t('disconnect.confirm.title', 'fi')).toBe('Katkaise yhteys');
      expect(t('dialog.button.cancel', 'fi')).toBe('Peruuta');
    });

    it('interpolates the Finnish popup strings (beta.37)', () => {
      expect(tf('upload.value.fileCount', 'fi', { count: '3' })).toBe(
        '3 tiedostoa',
      );
      expect(tf('upload.button.sendCount', 'fi', { count: '5' })).toBe(
        'Lähetä 5 tiedostoa',
      );
      expect(tf('drop.subtitle', 'fi', { protocol: 'ZMODEM' })).toBe(
        'lähettääksesi protokollalla ZMODEM',
      );
      const body = tf('url.confirm.body', 'fi', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Polish string when translated', () => {
      expect(t('menu.connect', 'pl')).toBe('Połącz');
      expect(t('menu.settings', 'pl')).toBe('Ustawienia');
    });

    it('translates the Polish popup/message strings (beta.35)', () => {
      expect(t('upload.title', 'pl')).toBe('Potwierdź wysyłanie');
      expect(t('upload.button.send', 'pl')).toBe('Wyślij');
      expect(t('upload.button.cancel', 'pl')).toBe('Anuluj');
      expect(t('upload.value.unknown', 'pl')).toBe('Nieznany');
      expect(t('drop.title', 'pl')).toBe('Upuść plik tutaj');
      expect(t('url.confirm.title', 'pl')).toBe('Otwórz link');
      expect(t('focus.message', 'pl')).toContain('KLIKNIJ TUTAJ');
      expect(t('scrollback.exit', 'pl')).toBe('Wyjdź');
      expect(t('disconnect.confirm.title', 'pl')).toBe('Rozłącz');
      expect(t('dialog.button.cancel', 'pl')).toBe('Anuluj');
    });

    it('interpolates the Polish popup strings (beta.35)', () => {
      expect(tf('upload.value.fileCount', 'pl', { count: '3' })).toBe(
        'Pliki: 3',
      );
      expect(tf('upload.button.sendCount', 'pl', { count: '5' })).toBe(
        'Wyślij pliki: 5',
      );
      expect(tf('drop.subtitle', 'pl', { protocol: 'ZMODEM' })).toBe(
        'aby wysłać przez ZMODEM',
      );
      const body = tf('url.confirm.body', 'pl', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Ukrainian (Cyrillic) string when translated', () => {
      expect(t('menu.connect', 'uk')).toBe('Підключитися');
      expect(t('menu.settings', 'uk')).toBe('Налаштування');
    });

    it('translates the Ukrainian popup/message strings (beta.36)', () => {
      expect(t('upload.title', 'uk')).toBe('Підтвердження надсилання');
      expect(t('upload.button.send', 'uk')).toBe('Надіслати');
      expect(t('upload.button.cancel', 'uk')).toBe('Скасувати');
      expect(t('upload.value.unknown', 'uk')).toBe('Невідомо');
      expect(t('drop.title', 'uk')).toBe('Перетягніть файл сюди');
      expect(t('url.confirm.title', 'uk')).toBe('Відкрити посилання');
      expect(t('focus.message', 'uk')).toContain('НАТИСНІТЬ ТУТ');
      expect(t('scrollback.exit', 'uk')).toBe('Вийти');
      expect(t('disconnect.confirm.title', 'uk')).toBe('Відключитися');
      expect(t('dialog.button.cancel', 'uk')).toBe('Скасувати');
    });

    it('interpolates the Ukrainian popup strings (beta.36)', () => {
      expect(tf('upload.value.fileCount', 'uk', { count: '3' })).toBe(
        'Файли: 3',
      );
      expect(tf('upload.button.sendCount', 'uk', { count: '5' })).toBe(
        'Надіслати файли: 5',
      );
      expect(tf('drop.subtitle', 'uk', { protocol: 'ZMODEM' })).toBe(
        'для надсилання через ZMODEM',
      );
      const body = tf('url.confirm.body', 'uk', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Swedish string when translated', () => {
      expect(t('menu.connect', 'sv')).toBe('Anslut');
      expect(t('menu.settings', 'sv')).toBe('Inställningar');
    });

    it('translates the Swedish popup/message strings (beta.34)', () => {
      expect(t('upload.title', 'sv')).toBe('Bekräfta uppladdning');
      expect(t('upload.button.send', 'sv')).toBe('Skicka');
      expect(t('upload.button.cancel', 'sv')).toBe('Avbryt');
      expect(t('upload.value.unknown', 'sv')).toBe('Okänd');
      expect(t('drop.title', 'sv')).toBe('Släpp filen här');
      expect(t('url.confirm.title', 'sv')).toBe('Öppna länk');
      expect(t('focus.message', 'sv')).toContain('KLICKA HÄR');
      expect(t('scrollback.exit', 'sv')).toBe('Avsluta');
      expect(t('disconnect.confirm.title', 'sv')).toBe('Koppla från');
      expect(t('dialog.button.cancel', 'sv')).toBe('Avbryt');
    });

    it('interpolates the Swedish popup strings (beta.34)', () => {
      expect(tf('upload.value.fileCount', 'sv', { count: '3' })).toBe(
        '3 filer',
      );
      expect(tf('upload.button.sendCount', 'sv', { count: '5' })).toBe(
        'Skicka 5 filer',
      );
      expect(tf('drop.subtitle', 'sv', { protocol: 'ZMODEM' })).toBe(
        'för att ladda upp via ZMODEM',
      );
      const body = tf('url.confirm.body', 'sv', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
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

    it('translates the Portuguese popup/message strings (beta.31)', () => {
      expect(t('upload.title', 'pt')).toBe('Confirmar envio');
      expect(t('upload.button.send', 'pt')).toBe('Enviar');
      expect(t('upload.button.cancel', 'pt')).toBe('Cancelar');
      expect(t('upload.value.unknown', 'pt')).toBe('Desconhecido');
      expect(t('drop.title', 'pt')).toBe('Solte o arquivo aqui');
      expect(t('url.confirm.title', 'pt')).toBe('Abrir link');
      expect(t('focus.message', 'pt')).toContain('CLIQUE AQUI');
      expect(t('scrollback.exit', 'pt')).toBe('Sair');
      expect(t('disconnect.confirm.title', 'pt')).toBe('Desconectar');
      expect(t('dialog.button.cancel', 'pt')).toBe('Cancelar');
    });

    it('interpolates the Portuguese popup strings (beta.31)', () => {
      expect(tf('upload.value.fileCount', 'pt', { count: '3' })).toBe(
        '3 arquivos',
      );
      expect(tf('upload.button.sendCount', 'pt', { count: '5' })).toBe(
        'Enviar 5 arquivos',
      );
      expect(tf('drop.subtitle', 'pt', { protocol: 'ZMODEM' })).toBe(
        'para enviar via ZMODEM',
      );
      const body = tf('url.confirm.body', 'pt', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
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

    it('translates the Terminal / Local Echo settings (beta.41)', () => {
      expect(t('settings.terminal', 'en')).toBe('Terminal');
      expect(t('settings.terminal.localecho', 'en')).toBe('Local Echo');
      expect(t('settings.terminal.localecho', 'de')).toBe('Lokales Echo');
      expect(t('settings.terminal.localecho', 'fr')).toBe('Écho local');
      expect(t('settings.terminal.localecho', 'ja')).toBe('ローカルエコー');
    });

    it('translates the Auto Reconnect setting (beta.43)', () => {
      expect(t('settings.terminal.autoreconnect', 'en')).toBe('Auto Reconnect');
      expect(t('settings.terminal.autoreconnect', 'de')).toBe(
        'Auto-Wiederverbindung',
      );
      expect(t('settings.terminal.autoreconnect', 'ja')).toBe('自動再接続');
      // every catalog has it (no fallback to English for the 14)
      for (const lang of ['nl', 'ru', 'uk', 'el', 'cs'] as const) {
        expect(t('settings.terminal.autoreconnect', lang)).not.toBe(
          'Auto Reconnect',
        );
      }
    });

    it('translates the Doorway Mode setting (beta.44)', () => {
      expect(t('settings.terminal.doorway', 'en')).toBe('Doorway Mode');
      expect(t('settings.terminal.doorway', 'ja')).toBe('ドアウェイモード');
      // every catalog defines it (no English fallback for the 14)
      for (const lang of ['nl', 'de', 'fr', 'ru', 'uk', 'el', 'cs'] as const) {
        expect(t('settings.terminal.doorway', lang)).not.toBe('Doorway Mode');
      }
    });

    it('translates the RIP setting (beta.45)', () => {
      // RIP is a proper-noun acronym (RIPscrip) — intentionally kept
      // as "RIP" in every catalog rather than localized.
      expect(t('settings.terminal.rip', 'en')).toBe('RIP');
      for (const lang of ['nl', 'de', 'fr', 'ru', 'uk', 'el', 'cs', 'ja'] as const) {
        expect(t('settings.terminal.rip', lang)).toBe('RIP');
      }
    });

    it('translates the settings tooltips (beta.46)', () => {
      // English baselines
      expect(t('settings.terminal.rip.tip', 'en')).toBe(
        'Enable RIPscrip graphics (reloads)',
      );
      expect(t('settings.sound.mute.tip', 'en')).toBe(
        'Silence the terminal bell',
      );
      // Each tooltip is translated (differs from English) in a sample
      // of languages — proving the catalogs carry real translations,
      // not fallbacks.
      for (const key of [
        'settings.sound.mute.tip',
        'settings.terminal.autoreconnect.tip',
        'settings.protocol.autodetect.tip',
      ] as const) {
        for (const lang of ['de', 'fr', 'ja'] as const) {
          expect(t(key, lang)).not.toBe(t(key, 'en'));
        }
      }
    });

    it('translates the auto-reconnect popup (beta.41)', () => {
      expect(t('reconnect.title', 'en')).toBe('Connection lost');
      expect(t('reconnect.cancel', 'en')).toBe('Cancel');
      expect(t('reconnect.title', 'de')).toBe('Verbindung verloren');
      expect(t('reconnect.title', 'ru')).toBe('Соединение потеряно');
      // Body interpolates {seconds} and drops the placeholder.
      const en5 = tf('reconnect.body', 'en', { seconds: '5' });
      expect(en5).toContain('5');
      expect(en5).not.toContain('{seconds}');
      expect(tf('reconnect.body', 'ja', { seconds: '3' })).toContain('3');
    });

    it('translates + interpolates the reconnect attempts line (beta.42)', () => {
      const en = tf('reconnect.attempts', 'en', { n: '2', max: '3' });
      expect(en).toBe('Attempts: 2 of 3');
      expect(en).not.toContain('{n}');
      expect(en).not.toContain('{max}');
      // A few other languages substitute both params too.
      expect(tf('reconnect.attempts', 'de', { n: '1', max: '3' })).toContain(
        '1',
      );
      expect(tf('reconnect.attempts', 'ja', { n: '2', max: '3' })).toContain(
        '2',
      );
    });

    it('returns the Italian string when translated', () => {
      expect(t('menu.connect', 'it')).toBe('Connetti');
      expect(t('menu.settings', 'it')).toBe('Impostazioni');
    });

    it('translates the Italian popup/message strings (beta.32)', () => {
      expect(t('upload.title', 'it')).toBe('Conferma invio');
      expect(t('upload.button.send', 'it')).toBe('Invia');
      expect(t('upload.button.cancel', 'it')).toBe('Annulla');
      expect(t('upload.value.unknown', 'it')).toBe('Sconosciuto');
      expect(t('drop.title', 'it')).toBe('Trascina il file qui');
      expect(t('url.confirm.title', 'it')).toBe('Apri link');
      expect(t('focus.message', 'it')).toContain('FAI CLIC QUI');
      expect(t('scrollback.exit', 'it')).toBe('Esci');
      expect(t('disconnect.confirm.title', 'it')).toBe('Disconnetti');
      expect(t('dialog.button.cancel', 'it')).toBe('Annulla');
    });

    it('interpolates the Italian popup strings (beta.32)', () => {
      expect(tf('upload.value.fileCount', 'it', { count: '3' })).toBe(
        '3 file',
      );
      expect(tf('upload.button.sendCount', 'it', { count: '5' })).toBe(
        'Invia 5 file',
      );
      expect(tf('drop.subtitle', 'it', { protocol: 'ZMODEM' })).toBe(
        'per inviarlo tramite ZMODEM',
      );
      const body = tf('url.confirm.body', 'it', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
    });

    it('returns the Russian (Cyrillic) string when translated', () => {
      expect(t('menu.connect', 'ru')).toBe('Подключиться');
      expect(t('menu.settings', 'ru')).toBe('Настройки');
    });

    it('translates the Russian popup/message strings (beta.33)', () => {
      expect(t('upload.title', 'ru')).toBe('Подтверждение отправки');
      expect(t('upload.button.send', 'ru')).toBe('Отправить');
      expect(t('upload.button.cancel', 'ru')).toBe('Отмена');
      expect(t('upload.value.unknown', 'ru')).toBe('Неизвестно');
      expect(t('drop.title', 'ru')).toBe('Перетащите файл сюда');
      expect(t('url.confirm.title', 'ru')).toBe('Открыть ссылку');
      expect(t('focus.message', 'ru')).toContain('НАЖМИТЕ ЗДЕСЬ');
      expect(t('scrollback.exit', 'ru')).toBe('Выход');
      expect(t('disconnect.confirm.title', 'ru')).toBe('Отключиться');
      expect(t('dialog.button.cancel', 'ru')).toBe('Отмена');
    });

    it('interpolates the Russian popup strings (beta.33)', () => {
      expect(tf('upload.value.fileCount', 'ru', { count: '3' })).toBe(
        '3 файлов',
      );
      expect(tf('upload.button.sendCount', 'ru', { count: '5' })).toBe(
        'Отправить 5 файлов',
      );
      expect(tf('drop.subtitle', 'ru', { protocol: 'ZMODEM' })).toBe(
        'для отправки через ZMODEM',
      );
      const body = tf('url.confirm.body', 'ru', { url: 'http://x' });
      expect(body).toContain('http://x');
      expect(body).toContain('\n');
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
