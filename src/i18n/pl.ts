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

import type { Catalog } from './en.js';

/**
 * Polish (Polski) string catalog. Phase 5 (beta.16).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Poland had a large FidoNet/BBS scene and retains an active
 * retro-computing community, so Polish reaches another concentrated
 * pocket of fTelnet's natural audience.
 *
 * REVIEW NOTES for the translator:
 *   - "Connect"/"Disconnect" → "Połącz"/"Rozłącz" (imperative,
 *     standard for buttons).
 *   - "Full Screen" → "Pełny ekran" (standard).
 *   - "Auto Detect" → "Automatyczne wykrywanie" is long for the
 *     narrow Protocol column; used "Autowykrywanie". Verify.
 *   - "Scrollback" has no clean Polish word; "Historia" (history)
 *     is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Wycisz dźwięki". "Bell" is the terminal
 *     bell; a literal "dzwonek" would be odd. Used the general
 *     "wycisz dźwięki" (mute the sounds).
 *   - "Upload"/"Download" → "Wyślij"/"Pobierz" (standard Polish).
 *   - "Settings" → "Ustawienia".
 *   - "Vibrate duration" → "Czas wibracji".
 *   - "Keyboard" → "Klawiatura".
 *   - "Manual" → "Podręcznik".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - File is UTF-8; Polish needs ą/ć/ę/ł/ń/ó/ś/ź/ż — ensure they
 *     render.
 */
export const pl: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Połącz',
  'menu.disconnect': 'Rozłącz',
  'menu.copy': 'Kopiuj',
  'menu.paste': 'Wklej',
  'menu.upload': 'Wyślij',
  'menu.download': 'Pobierz',
  'menu.keyboard': 'Klawiatura',
  'menu.fullscreen': 'Pełny ekran',
  'menu.scrollback': 'Pokaż historię',
  'menu.settings': 'Ustawienia',
  'menu.manual': 'Podręcznik',
  'menu.button': 'Menu',
  // "kolumn"=columns, "wierszy"=rows (genitive after a number).
  'menu.screensize': '{cols} kolumn x {rows} wierszy',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Niepołączony',
  'status.connecting': 'Łączenie z {host}',
  'status.connecting.proxy': 'Łączenie z {host} przez {proxy}',
  'status.connected': 'Połączono z {host}',
  'status.connected.proxy': 'Połączono z {host} przez {proxy}',
  'status.disconnected': 'Rozłączono z {host}',
  'status.unable': 'Nie można połączyć się z {host}',
  'status.unable.proxy': 'Nie można połączyć się z {host} przez {proxy}',
  'status.button.connect': 'Połącz',
  'status.button.reconnect': 'Połącz ponownie',
  'status.button.retry': 'Spróbuj ponownie',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Ustawienia',
  'settings.theme': 'Motyw',
  'settings.protocol': 'Protokół',
  'settings.protocol.default': 'Domyślny',
  'settings.protocol.autodetect': 'Autowykrywanie',
  'settings.language': 'Język',
  'settings.sound': 'Dźwięk',
  'settings.sound.mute': 'Wycisz dźwięki',
  'settings.touch': 'Dotyk',
  'settings.touch.vibrate': 'Czas wibracji:',
  'settings.touch.ms': 'ms',
  'settings.about': 'O programie',
  'settings.close': 'Zamknij',

  // Theme names — left as proper names.
  'settings.theme.classic': 'Classic',
  'settings.theme.dos-classic': 'DOS-Classic',
  'settings.theme.crt-green': 'CRT-Green',
  'settings.theme.cyberpunk': 'Cyberpunk',
  'settings.theme.gothic': 'Gothic',
  'settings.theme.cartoon': 'Cartoon',

  // Language names — endonyms, NOT translated.
  'settings.language.english': 'English',
  'settings.language.german': 'Deutsch',
  'settings.language.french': 'Français',
  'settings.language.spanish': 'Español',
  'settings.language.portuguese': 'Português',
  'settings.language.dutch': 'Nederlands',
  'settings.language.italian': 'Italiano',
  'settings.language.russian': 'Русский',
  'settings.language.swedish': 'Svenska',
  'settings.language.polish': 'Polski',
  'settings.language.ukrainian': 'Українська',
  'settings.language.finnish': 'Suomi',
  'settings.language.other': 'Inny',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Pobieranie plików',
  'dialog.download.body':
    'Użyj polecenia pobierania BBS — ZMODEM jest wykrywany ' +
    'automatycznie.\n\n' +
    'Gdy BBS rozpocznie transfer, panel postępu pojawi się ' +
    'automatycznie, a przeglądarka zapisze plik po zakończeniu.\n\n' +
    'Aby rozpocząć pobieranie przyciskiem menu, zmień domyślny ' +
    'protokół na YMODEM w Ustawieniach.',
  'dialog.copy.title': 'Kopiowanie tekstu',
  'dialog.copy.body':
    'Kliknij i przeciągnij myszą po tekście, który chcesz ' +
    'skopiować.',
};
