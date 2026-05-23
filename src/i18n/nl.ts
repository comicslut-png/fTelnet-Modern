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
 * Dutch (Nederlands) string catalog. Phase 5 (beta.12).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * The Netherlands had an enormous BBS/FidoNet scene in the 1990s and
 * retains an unusually active retro-computing and preservation
 * community, so Dutch reaches a concentrated pocket of exactly the
 * users fTelnet serves.
 *
 * REVIEW NOTES for the translator:
 *   - "Connect"/"Disconnect" → "Verbinden"/"Verbinding verbreken".
 *     The latter is literally "break connection"; a shorter
 *     "Verbreken" is also common — chose the fuller form for
 *     clarity but it's longer, verify it fits the button.
 *   - "Full Screen" → "Volledig scherm" (standard).
 *   - "Auto Detect" → "Automatisch detecteren" is long for the
 *     narrow Protocol column; used "Autodetectie". Verify.
 *   - "Scrollback" has no clean Dutch word; "Geschiedenis"
 *     (history) is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Geluiden dempen". "Bell" is the
 *     terminal bell; a literal "bel" would be odd. Used the general
 *     "geluiden dempen" (mute sounds).
 *   - "Upload"/"Download" → Dutch generally keeps the English
 *     "Uploaden"/"Downloaden" (very common loanwords). Used those.
 *   - "Settings" → "Instellingen".
 *   - "Vibrate duration" → "Trilduur".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - File is UTF-8; Dutch needs no special letters beyond the
 *     occasional accented loanword, but the ij digraph etc. are
 *     plain ASCII.
 */
export const nl: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Verbinden',
  'menu.disconnect': 'Verbinding verbreken',
  'menu.copy': 'Kopiëren',
  'menu.paste': 'Plakken',
  'menu.upload': 'Uploaden',
  'menu.download': 'Downloaden',
  'menu.keyboard': 'Toetsenbord',
  'menu.fullscreen': 'Volledig scherm',
  'menu.scrollback': 'Geschiedenis weergeven',
  'menu.settings': 'Instellingen',
  'menu.manual': 'Handleiding',
  'menu.button': 'Menu',
  // "kolommen"=columns, "rijen"=rows.
  'menu.screensize': '{cols} kolommen x {rows} rijen',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Niet verbonden',
  'status.connecting': 'Verbinden met {host}',
  'status.connecting.proxy': 'Verbinden met {host} via {proxy}',
  'status.connected': 'Verbonden met {host}',
  'status.connected.proxy': 'Verbonden met {host} via {proxy}',
  'status.disconnected': 'Verbinding met {host} verbroken',
  'status.unable': 'Kan geen verbinding maken met {host}',
  'status.unable.proxy': 'Kan geen verbinding maken met {host} via {proxy}',
  'status.button.connect': 'Verbinden',
  'status.button.reconnect': 'Opnieuw verbinden',
  'status.button.retry': 'Opnieuw proberen',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Instellingen',
  'settings.theme': 'Thema',
  'settings.protocol': 'Protocol',
  'settings.protocol.default': 'Standaard',
  'settings.protocol.autodetect': 'Autodetectie',
  'settings.language': 'Taal',
  'settings.sound': 'Geluid',
  'settings.sound.mute': 'Geluiden dempen',
  'settings.touch': 'Aanraken',
  'settings.touch.vibrate': 'Trilduur:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Over',
  'settings.close': 'Sluiten',

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
  'settings.language.other': 'Andere',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Bestanden downloaden',
  'dialog.download.body':
    'Gebruik de downloadopdracht van het BBS — ZMODEM wordt ' +
    'automatisch gedetecteerd.\n\n' +
    'Wanneer het BBS de overdracht start, verschijnt het ' +
    'voortgangsvenster automatisch, en uw browser slaat het ' +
    'bestand op zodra het klaar is.\n\n' +
    'Om downloads via de menuknop te starten, wijzigt u het ' +
    'standaardprotocol naar YMODEM in Instellingen.',
  'dialog.copy.title': 'Tekst kopiëren',
  'dialog.copy.body':
    'Klik en sleep met de muis over de tekst die u wilt kopiëren.',
};
