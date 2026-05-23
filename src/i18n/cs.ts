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
 * Czech (Čeština) string catalog. Phase 5 (beta.20).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Czechia had a vibrant FidoNet/BBS scene and retains an active
 * retro-computing community, rounding out the Central/Eastern
 * European coverage alongside Polish, Russian, and Ukrainian.
 *
 * The ISO 639-1 code for Czech is `cs` (Čeština/Czech-Slovak), NOT
 * "cz" (which is the country code). Using `cs` here.
 *
 * REVIEW NOTES for the translator:
 *   - Czech uses háček/čárka diacritics: á č ď é ě í ň ó ř š ť ú ů
 *     ý ž. Included where correct.
 *   - "Connect"/"Disconnect" → "Připojit"/"Odpojit".
 *   - "Full Screen" → "Celá obrazovka".
 *   - "Auto Detect" → "Automatická detekce" is long for the narrow
 *     Protocol column; used "Autodetekce". Verify.
 *   - "Scrollback" → "Historie" (history) — closest idiomatic term.
 *   - "Mute bell sounds" → "Ztlumit zvuky" (mute the sounds); the
 *     terminal "bell" doesn't translate literally.
 *   - "Upload"/"Download" → "Nahrát"/"Stáhnout" (standard Czech).
 *   - "Settings" → "Nastavení".
 *   - "Keyboard" → "Klávesnice".
 *   - "Manual" → "Příručka".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - File is UTF-8; ensure the háček/čárka letters render.
 */
export const cs: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Připojit',
  'menu.disconnect': 'Odpojit',
  'menu.copy': 'Kopírovat',
  'menu.paste': 'Vložit',
  'menu.upload': 'Nahrát',
  'menu.download': 'Stáhnout',
  'menu.keyboard': 'Klávesnice',
  'menu.fullscreen': 'Celá obrazovka',
  'menu.scrollback': 'Zobrazit historii',
  'menu.settings': 'Nastavení',
  'menu.manual': 'Příručka',
  'menu.button': 'Nabídka',
  // "sloupců"=columns, "řádků"=rows (genitive after a number).
  'menu.screensize': '{cols} sloupců x {rows} řádků',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Nepřipojeno',
  'status.connecting': 'Připojování k {host}',
  'status.connecting.proxy': 'Připojování k {host} přes {proxy}',
  'status.connected': 'Připojeno k {host}',
  'status.connected.proxy': 'Připojeno k {host} přes {proxy}',
  'status.disconnected': 'Odpojeno od {host}',
  'status.unable': 'Nelze se připojit k {host}',
  'status.unable.proxy': 'Nelze se připojit k {host} přes {proxy}',
  'status.button.connect': 'Připojit',
  'status.button.reconnect': 'Připojit znovu',
  'status.button.retry': 'Zkusit znovu',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Nastavení',
  'settings.theme': 'Motiv',
  'settings.protocol': 'Protokol',
  'settings.protocol.default': 'Výchozí',
  'settings.protocol.autodetect': 'Autodetekce',
  'settings.language': 'Jazyk',
  'settings.sound': 'Zvuk',
  'settings.sound.mute': 'Ztlumit zvuky',
  'settings.touch': 'Dotyk',
  'settings.touch.vibrate': 'Délka vibrace:',
  'settings.touch.ms': 'ms',
  'settings.about': 'O aplikaci',
  'settings.close': 'Zavřít',

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
  'settings.language.greek': 'Ελληνικά',
  'settings.language.czech': 'Čeština',
  'settings.language.other': 'Jiný',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Stahování souborů',
  'dialog.download.body':
    'Použijte příkaz stahování BBS — ZMODEM je detekován ' +
    'automaticky.\n\n' +
    'Když BBS zahájí přenos, panel průběhu se zobrazí automaticky ' +
    'a prohlížeč soubor uloží po dokončení.\n\n' +
    'Chcete-li spouštět stahování tlačítkem nabídky, změňte ' +
    'výchozí protokol na YMODEM v Nastavení.',
  'dialog.copy.title': 'Kopírování textu',
  'dialog.copy.body':
    'Klikněte a táhněte myší přes text, který chcete zkopírovat.',
};
