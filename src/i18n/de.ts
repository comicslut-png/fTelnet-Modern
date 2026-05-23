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
 * German (Deutsch) string catalog. Phase 5 (beta.6).
 *
 * FIRST PASS — machine/best-effort translation, pending review by
 * a native speaker (the maintainer is sourcing this). Any key not
 * present here falls back to the English base (see index.ts `t()`),
 * so a partial catalog is fine: the app stays fully usable, showing
 * German where translated and English everywhere else.
 *
 * REVIEW NOTES for the translator:
 *   - "Full Screen" → "Vollbild" (standard).
 *   - "Auto Detect" → "Automatische Erkennung" is the literal, but
 *     it's long; "Auto-Erkennung" is a common shorter form. Chose
 *     the shorter one to fit the narrow Protocol column.
 *   - "Scrollback" has no clean German word; "Verlauf" (history) is
 *     the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Signaltöne stummschalten". "Bell" here
 *     is the terminal bell (ASCII 7), so "Signalton" fits better
 *     than a literal "Glocke".
 *   - Theme names: left as-is (proper names) except where a German
 *     reader would expect a word — only "Cartoon" arguably differs,
 *     left as-is for consistency.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item rather than a quick label.
 */
export const de: Catalog = {
  // ── Main menu buttons (FUNCTIONAL — the beta.6 proving ground) ─
  'menu.connect': 'Verbinden',
  'menu.disconnect': 'Trennen',
  'menu.copy': 'Kopieren',
  'menu.paste': 'Einfügen',
  'menu.upload': 'Hochladen',
  'menu.download': 'Herunterladen',
  'menu.keyboard': 'Tastatur',
  'menu.fullscreen': 'Vollbild',
  'menu.scrollback': 'Verlauf anzeigen',
  // (English base is "View Scrollback Buffer"; German uses the
  // shorter idiomatic "Verlauf anzeigen" = "show history".)
  'menu.settings': 'Einstellungen',
  'menu.manual': 'Handbuch',
  'menu.button': 'Menü',
  // {cols}/{rows} stay as numbers; "Spalten"=columns, "Zeilen"=rows.
  'menu.screensize': '{cols} Spalten x {rows} Zeilen',

  // ── Status bar (best-effort; review pending) ────────────────
  // {host}/{proxy} placeholders are preserved verbatim.
  'status.notConnected': 'Nicht verbunden',
  'status.connecting': 'Verbinde mit {host}',
  'status.connecting.proxy': 'Verbinde mit {host} über {proxy}',
  'status.connected': 'Verbunden mit {host}',
  'status.connected.proxy': 'Verbunden mit {host} über {proxy}',
  'status.disconnected': 'Getrennt von {host}',
  'status.unable': 'Verbindung zu {host} nicht möglich',
  'status.unable.proxy': 'Verbindung zu {host} über {proxy} nicht möglich',
  'status.button.connect': 'Verbinden',
  'status.button.reconnect': 'Erneut verbinden',
  'status.button.retry': 'Erneut versuchen',

  // ── Settings panel (best-effort; review pending) ────────────
  'settings.title': 'Einstellungen',
  'settings.theme': 'Design',
  'settings.protocol': 'Protokoll',
  'settings.protocol.default': 'Standard',
  'settings.protocol.autodetect': 'Auto-Erkennung',
  'settings.language': 'Sprache',
  'settings.sound': 'Ton',
  'settings.sound.mute': 'Signaltöne stummschalten',
  'settings.touch': 'Touch',
  'settings.touch.vibrate': 'Vibrationsdauer:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Über',
  'settings.close': 'Schließen',

  // Theme names — left as proper names.
  'settings.theme.classic': 'Classic',
  'settings.theme.dos-classic': 'DOS-Classic',
  'settings.theme.crt-green': 'CRT-Green',
  'settings.theme.cyberpunk': 'Cyberpunk',
  'settings.theme.gothic': 'Gothic',
  'settings.theme.cartoon': 'Cartoon',

  // Language names — endonyms, NOT translated (each language's own
  // name shown in that language).
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
  'settings.language.other': 'Andere',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Dateien herunterladen',
  'dialog.download.body':
    'Verwenden Sie den Download-Befehl der BBS — ZMODEM wird ' +
    'automatisch erkannt.\n\n' +
    'Wenn die BBS die Übertragung startet, erscheint das ' +
    'Fortschrittsfenster automatisch, und Ihr Browser speichert ' +
    'die Datei nach Abschluss.\n\n' +
    'Um Downloads über die Menüschaltfläche zu starten, wechseln ' +
    'Sie in den Einstellungen das Standardprotokoll zu YMODEM.',
  'dialog.copy.title': 'Text kopieren',
  'dialog.copy.body':
    'Klicken und ziehen Sie mit der Maus über den Text, den Sie ' +
    'kopieren möchten.',
};
