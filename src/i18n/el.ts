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
  'settings.language.japanese': '日本語',
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

  // ── Upload confirmation dialog (FUploadConfirm) ─────────────
  'upload.title': 'Επιβεβαίωση αποστολής',
  'upload.title.batch': 'Επιβεβαίωση αποστολής (δέσμη)',
  'upload.label.file': 'Αρχείο:',
  'upload.label.size': 'Μέγεθος:',
  'upload.label.modified': 'Τροποποιήθηκε:',
  'upload.label.protocol': 'Πρωτόκολλο:',
  'upload.label.files': 'Αρχεία:',
  'upload.label.totalSize': 'Συνολικό μέγεθος:',
  'upload.value.fileCount': '{count} αρχεία',
  'upload.value.unknown': 'Άγνωστο',
  'upload.details.show': '▸ Εμφάνιση λεπτομερειών',
  'upload.details.hide': '▾ Απόκρυψη λεπτομερειών',
  'upload.warning':
    '⚠️ Βεβαιωθείτε ότι το BBS σας βρίσκεται σε προτροπή ' +
    'αποστολής πριν κάνετε κλικ στο Αποστολή.',
  'upload.button.cancel': 'Άκυρο',
  'upload.button.send': 'Αποστολή',
  'upload.button.sendCount': 'Αποστολή {count} αρχείων',

  // ── Drag-and-drop overlay (FDropOverlay) ────────────────────
  'drop.title': 'Αποθέστε το αρχείο εδώ',
  'drop.subtitle': 'για αποστολή μέσω {protocol}',

  // ── Focus warning (FFocusWarning) ───────────────────────────
  'focus.message': '*** ΚΑΝΤΕ ΚΛΙΚ ΕΔΩ ΓΙΑ ΕΝΕΡΓΟΠΟΙΗΣΗ ΕΙΣΑΓΩΓΗΣ ΑΠΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ***',

  // ── Open-URL confirmation (Crt single-click on a link) ──────
  'url.confirm.title': 'Άνοιγμα συνδέσμου',
  'url.confirm.body':
    'Θέλετε να ανοίξετε αυτή τη διεύθυνση URL σε νέο παράθυρο;\n\n{url}',

  // ── Scrollback bar (FScrollbackBar) ─────────────────────────
  'scrollback.label': 'ΚΥΛΙΣΗ:',
  'scrollback.modern.hint':
    'ΚΥΛΙΣΗ: Κυλήστε ξανά προς τα κάτω για έξοδο από τη ' +
    'λειτουργία κύλισης',
  'scrollback.lineUp': 'Γραμμή πάνω',
  'scrollback.lineDown': 'Γραμμή κάτω',
  'scrollback.pageUp': 'Σελίδα πάνω',
  'scrollback.pageDown': 'Σελίδα κάτω',
  'scrollback.exit': 'Έξοδος',

  // ── Disconnect confirmation (themed confirm dialog) ─────────
  'disconnect.confirm.title': 'Αποσύνδεση',
  'disconnect.confirm.body':
    'Είστε βέβαιοι ότι θέλετε να αποσυνδεθείτε;',

  // ── Settings: tooltip on not-yet-translated language options ─
  'settings.language.comingSoon':
    'Σύντομα διαθέσιμο — η βοήθεια με τη μετάφραση είναι ευπρόσδεκτη',

  // ── Shared dialog buttons (FInfoDialog / FConfirmDialog) ────
  'dialog.button.ok': 'OK',
  'dialog.button.cancel': 'Άκυρο',

  // ── Terminal settings (Local Echo) ───────────────────
  'settings.terminal': 'Τερματικό',
  'settings.terminal.localecho': 'Τοπική ηχώ',
  'settings.terminal.autoreconnect': 'Αυτόματη επανασύνδεση',
  'settings.terminal.doorway': 'Λειτουργία Doorway',
  'settings.terminal.rip': 'RIP',
  'settings.sound.mute.tip': 'Σίγαση του κουδουνιού του τερματικού',
  'settings.touch.vibrate.tip': 'Διάρκεια δόνησης ανά πλήκτρο (ms)',
  'settings.terminal.localecho.tip': 'Εμφάνιση της δικής σας πληκτρολόγησης τοπικά',
  'settings.terminal.autoreconnect.tip': 'Αυτόματη επανασύνδεση σε διακοπή',
  'settings.terminal.doorway.tip': 'Αποστολή ειδικών πλήκτρων σε προγράμματα DOS',
  'settings.terminal.rip.tip': 'Ενεργοποίηση γραφικών RIPscrip (επαναφόρτωση)',
  'settings.protocol.autodetect.tip': 'Αυτόματη έναρξη μεταφορών ZMODEM',

  // ── Auto-reconnect popup ─────────────────────────
  'reconnect.title': 'Η σύνδεση χάθηκε',
  'reconnect.body': 'Επανασύνδεση σε {seconds} δευτερόλεπτα…',
  'reconnect.attempts': 'Προσπάθειες: {n} από {max}',
  'reconnect.cancel': 'Άκυρο',
};
