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
 * Greek (Ελληνικά) string catalog. Phase 5 (beta.19).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * SIGNIFICANCE: Greek is fTelnet-Modern's THIRD script — after
 * Latin (most languages) and Cyrillic (Russian, Ukrainian), the
 * Greek alphabet is distinct again. Like Cyrillic it sits in the
 * 2-byte UTF-8 range and is covered by essentially all system
 * fonts (Greek has been in core fonts for decades), so no font
 * pack is needed — but it's another confirmation that the
 * lookup/fallback machinery is genuinely script-agnostic.
 *
 * The ISO 639-1 code for Greek is `el` (Ellinika), NOT "gr" (which
 * is the country code). Using `el` here.
 *
 * REVIEW NOTES for the translator:
 *   - Greek uses accents (tonos) on stressed vowels: ά έ ή ί ό ύ ώ,
 *     plus diaeresis ϊ ϋ. These are normal modern (monotonic)
 *     orthography — included where correct.
 *   - "Connect"/"Disconnect" → "Σύνδεση"/"Αποσύνδεση" (noun forms,
 *     common on buttons). Verify vs imperative "Συνδεθείτε".
 *   - "Full Screen" → "Πλήρης οθόνη".
 *   - "Auto Detect" → "Αυτόματη ανίχνευση" is long for the narrow
 *     Protocol column; used "Αυτόματη". Verify.
 *   - "Scrollback" → "Ιστορικό" (history) — closest idiomatic term.
 *   - "Mute bell sounds" → "Σίγαση ήχων" (mute the sounds); the
 *     terminal "bell" doesn't translate literally.
 *   - "Upload"/"Download" → "Μεταφόρτωση"/"Λήψη" (standard Greek
 *     computing terms).
 *   - "Settings" → "Ρυθμίσεις".
 *   - "Keyboard" → "Πληκτρολόγιο".
 *   - "Manual" → "Εγχειρίδιο".
 *   - Theme names left as proper (Latin) names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim;
 *     the hostname stays Latin/neutral.
 *   - File is UTF-8; all Greek below is literal UTF-8.
 */
export const el: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Σύνδεση',
  'menu.disconnect': 'Αποσύνδεση',
  'menu.copy': 'Αντιγραφή',
  'menu.paste': 'Επικόλληση',
  'menu.upload': 'Μεταφόρτωση',
  'menu.download': 'Λήψη',
  'menu.keyboard': 'Πληκτρολόγιο',
  'menu.fullscreen': 'Πλήρης οθόνη',
  'menu.scrollback': 'Εμφάνιση ιστορικού',
  'menu.settings': 'Ρυθμίσεις',
  'menu.manual': 'Εγχειρίδιο',
  'menu.button': 'Μενού',
  // "στήλες"=columns, "γραμμές"=rows.
  'menu.screensize': '{cols} στήλες x {rows} γραμμές',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Χωρίς σύνδεση',
  'status.connecting': 'Σύνδεση με {host}',
  'status.connecting.proxy': 'Σύνδεση με {host} μέσω {proxy}',
  'status.connected': 'Συνδέθηκε με {host}',
  'status.connected.proxy': 'Συνδέθηκε με {host} μέσω {proxy}',
  'status.disconnected': 'Αποσυνδέθηκε από {host}',
  'status.unable': 'Αδύνατη η σύνδεση με {host}',
  'status.unable.proxy': 'Αδύνατη η σύνδεση με {host} μέσω {proxy}',
  'status.button.connect': 'Σύνδεση',
  'status.button.reconnect': 'Επανασύνδεση',
  'status.button.retry': 'Επανάληψη',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Ρυθμίσεις',
  'settings.theme': 'Θέμα',
  'settings.protocol': 'Πρωτόκολλο',
  'settings.protocol.default': 'Προεπιλογή',
  'settings.protocol.autodetect': 'Αυτόματη',
  'settings.language': 'Γλώσσα',
  'settings.sound': 'Ήχος',
  'settings.sound.mute': 'Σίγαση ήχων',
  'settings.touch': 'Αφή',
  'settings.touch.vibrate': 'Διάρκεια δόνησης:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Σχετικά',
  'settings.close': 'Κλείσιμο',

  // Theme names — left as proper (Latin) names.
  'settings.theme.classic': 'Classic',
  'settings.theme.dos-classic': 'DOS-Classic',
  'settings.theme.crt-green': 'CRT-Green',
  'settings.theme.cyberpunk': 'Cyberpunk',
  'settings.theme.gothic': 'Gothic',
  'settings.theme.cartoon': 'Cartoon',

  // Language names — endonyms, NOT translated (each shown in its
  // own language/script).
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
  'settings.language.other': 'Άλλη',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Λήψη αρχείων',
  'dialog.download.body':
    'Χρησιμοποιήστε την εντολή λήψης του BBS — το ZMODEM ' +
    'ανιχνεύεται αυτόματα.\n\n' +
    'Όταν το BBS ξεκινά τη μεταφορά, ο πίνακας προόδου εμφανίζεται ' +
    'αυτόματα, και το πρόγραμμα περιήγησης αποθηκεύει το αρχείο ' +
    'μόλις ολοκληρωθεί.\n\n' +
    'Για να ξεκινάτε λήψεις από το κουμπί μενού, αλλάξτε το ' +
    'προεπιλεγμένο πρωτόκολλο σε YMODEM στις Ρυθμίσεις.',
  'dialog.copy.title': 'Αντιγραφή κειμένου',
  'dialog.copy.body':
    'Κάντε κλικ και σύρετε το ποντίκι πάνω από το κείμενο που ' +
    'θέλετε να αντιγράψετε.',
};
