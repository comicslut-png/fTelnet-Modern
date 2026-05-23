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
 * Swedish (Svenska) string catalog. Phase 5 (beta.15).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Sweden has a strong demoscene heritage and an active retro-
 * computing community, so Swedish reaches a pocket of fTelnet's
 * natural audience.
 *
 * REVIEW NOTES for the translator:
 *   - "Connect"/"Disconnect" → "Anslut"/"Koppla från".
 *   - "Full Screen" → "Helskärm" (standard).
 *   - "Auto Detect" → "Automatisk identifiering" is long for the
 *     narrow Protocol column; used "Autoidentifiering". Verify.
 *   - "Scrollback" has no clean Swedish word; "Historik" (history)
 *     is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Stäng av ljud". "Bell" is the terminal
 *     bell; a literal "klocka" would be odd. Used the general
 *     "stäng av ljud" (mute the sound).
 *   - "Upload"/"Download" → "Ladda upp"/"Ladda ner" (standard).
 *   - "Settings" → "Inställningar".
 *   - "Vibrate duration" → "Vibrationslängd".
 *   - "Keyboard" → "Tangentbord".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - File is UTF-8; Swedish needs å/ä/ö — ensure they render.
 */
export const sv: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Anslut',
  'menu.disconnect': 'Koppla från',
  'menu.copy': 'Kopiera',
  'menu.paste': 'Klistra in',
  'menu.upload': 'Ladda upp',
  'menu.download': 'Ladda ner',
  'menu.keyboard': 'Tangentbord',
  'menu.fullscreen': 'Helskärm',
  'menu.scrollback': 'Visa historik',
  'menu.settings': 'Inställningar',
  'menu.manual': 'Handbok',
  'menu.button': 'Meny',
  // "kolumner"=columns, "rader"=rows.
  'menu.screensize': '{cols} kolumner x {rows} rader',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Inte ansluten',
  'status.connecting': 'Ansluter till {host}',
  'status.connecting.proxy': 'Ansluter till {host} via {proxy}',
  'status.connected': 'Ansluten till {host}',
  'status.connected.proxy': 'Ansluten till {host} via {proxy}',
  'status.disconnected': 'Frånkopplad från {host}',
  'status.unable': 'Kan inte ansluta till {host}',
  'status.unable.proxy': 'Kan inte ansluta till {host} via {proxy}',
  'status.button.connect': 'Anslut',
  'status.button.reconnect': 'Återanslut',
  'status.button.retry': 'Försök igen',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Inställningar',
  'settings.theme': 'Tema',
  'settings.protocol': 'Protokoll',
  'settings.protocol.default': 'Standard',
  'settings.protocol.autodetect': 'Autoidentifiering',
  'settings.language': 'Språk',
  'settings.sound': 'Ljud',
  'settings.sound.mute': 'Stäng av ljud',
  'settings.touch': 'Pekskärm',
  'settings.touch.vibrate': 'Vibrationslängd:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Om',
  'settings.close': 'Stäng',

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
  'settings.language.other': 'Annat',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Ladda ner filer',
  'dialog.download.body':
    'Använd BBS:ens nedladdningskommando — ZMODEM identifieras ' +
    'automatiskt.\n\n' +
    'När BBS:en startar överföringen visas förloppspanelen ' +
    'automatiskt, och din webbläsare sparar filen när den är ' +
    'klar.\n\n' +
    'För att starta nedladdningar med menyknappen, ändra ' +
    'standardprotokollet till YMODEM i Inställningar.',
  'dialog.copy.title': 'Kopiera text',
  'dialog.copy.body':
    'Klicka och dra musen över texten du vill kopiera.',
};
