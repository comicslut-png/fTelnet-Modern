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
 * Italian (Italiano) string catalog. Phase 5 (beta.13).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Italy has a notably active vintage-computing scene (especially
 * Commodore/Amiga), which dovetails with fTelnet's PETSCII/Topaz
 * rendering support — so Italian reaches a community already aligned
 * with what fTelnet does.
 *
 * REVIEW NOTES for the translator:
 *   - "Connect"/"Disconnect" → "Connetti"/"Disconnetti" (imperative,
 *     standard for buttons). Verify tone vs "Connessione".
 *   - "Full Screen" → "Schermo intero" (standard).
 *   - "Auto Detect" → "Rilevamento automatico" is long for the
 *     narrow Protocol column; used "Rilevamento auto". Verify.
 *   - "Scrollback" has no clean Italian word; "Cronologia"
 *     (history) is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Disattiva i suoni". "Bell" is the
 *     terminal bell; a literal "campanello" would be odd. Used the
 *     general "disattiva i suoni" (mute the sounds).
 *   - "Upload"/"Download" → "Carica"/"Scarica" (standard Italian).
 *   - "Settings" → "Impostazioni".
 *   - "Vibrate duration" → "Durata vibrazione".
 *   - "Keyboard" → "Tastiera".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - File is UTF-8; Italian needs à/è/é/ì/ò/ù — ensure they render.
 */
export const it: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Connetti',
  'menu.disconnect': 'Disconnetti',
  'menu.copy': 'Copia',
  'menu.paste': 'Incolla',
  'menu.upload': 'Carica',
  'menu.download': 'Scarica',
  'menu.keyboard': 'Tastiera',
  'menu.fullscreen': 'Schermo intero',
  'menu.scrollback': 'Mostra cronologia',
  'menu.settings': 'Impostazioni',
  'menu.manual': 'Manuale',
  'menu.button': 'Menu',
  // "colonne"=columns, "righe"=rows.
  'menu.screensize': '{cols} colonne x {rows} righe',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Non connesso',
  'status.connecting': 'Connessione a {host}',
  'status.connecting.proxy': 'Connessione a {host} via {proxy}',
  'status.connected': 'Connesso a {host}',
  'status.connected.proxy': 'Connesso a {host} via {proxy}',
  'status.disconnected': 'Disconnesso da {host}',
  'status.unable': 'Impossibile connettersi a {host}',
  'status.unable.proxy': 'Impossibile connettersi a {host} via {proxy}',
  'status.button.connect': 'Connetti',
  'status.button.reconnect': 'Riconnetti',
  'status.button.retry': 'Riprova',
  'status.button.disconnect': 'Disconnetti',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Impostazioni',
  'settings.theme': 'Tema',
  'settings.protocol': 'Protocollo',
  'settings.protocol.default': 'Predefinito',
  'settings.protocol.autodetect': 'Rilevamento auto',
  'settings.language': 'Lingua',
  'settings.sound': 'Suono',
  'settings.sound.mute': 'Disattiva i suoni',
  'settings.touch': 'Tocco',
  'settings.touch.vibrate': 'Durata vibrazione:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Informazioni',
  'settings.close': 'Chiudi',

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
  'settings.language.japanese': '日本語',
  'settings.language.other': 'Altro',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Download dei file',
  'dialog.download.body':
    'Usa il comando di download del BBS — lo ZMODEM viene rilevato ' +
    'automaticamente.\n\n' +
    'Quando il BBS avvia il trasferimento, il pannello di ' +
    'avanzamento appare automaticamente, e il browser salverà il ' +
    'file al termine.\n\n' +
    'Per avviare i download dal pulsante del menu, cambia il ' +
    'protocollo predefinito in YMODEM nelle Impostazioni.',
  'dialog.copy.title': 'Copia testo',
  'dialog.copy.body':
    'Fai clic e trascina il mouse sul testo che desideri copiare.',

  // ── Upload confirmation dialog (FUploadConfirm) ─────────────
  'upload.title': 'Conferma invio',
  'upload.title.batch': 'Conferma invio (batch)',
  'upload.label.file': 'File:',
  'upload.label.size': 'Dimensione:',
  'upload.label.modified': 'Modificato:',
  'upload.label.protocol': 'Protocollo:',
  'upload.label.files': 'File:',
  'upload.label.totalSize': 'Dimensione totale:',
  'upload.value.fileCount': '{count} file',
  'upload.value.unknown': 'Sconosciuto',
  'upload.details.show': '▸ Mostra dettagli',
  'upload.details.hide': '▾ Nascondi dettagli',
  'upload.warning':
    '⚠️ Assicurati che il tuo BBS sia a un prompt di invio ' +
    'prima di fare clic su Invia.',
  'upload.button.cancel': 'Annulla',
  'upload.button.send': 'Invia',
  'upload.button.sendCount': 'Invia {count} file',

  // ── Drag-and-drop overlay (FDropOverlay) ────────────────────
  'drop.title': 'Trascina il file qui',
  'drop.subtitle': 'per inviarlo tramite {protocol}',

  // ── Focus warning (FFocusWarning) ───────────────────────────
  'focus.message': '*** FAI CLIC QUI PER ATTIVARE L\'INPUT DA TASTIERA ***',

  // ── Open-URL confirmation (Crt single-click on a link) ──────
  'url.confirm.title': 'Apri link',
  'url.confirm.body':
    'Vuoi aprire questo URL in una nuova finestra?\n\n{url}',

  // ── Scrollback bar (FScrollbackBar) ─────────────────────────
  'scrollback.label': 'CRONOLOGIA:',
  'scrollback.modern.hint':
    'CRONOLOGIA: Scorri di nuovo verso il basso per uscire ' +
    'dalla modalità cronologia',
  'scrollback.lineUp': 'Riga su',
  'scrollback.lineDown': 'Riga giù',
  'scrollback.pageUp': 'Pagina su',
  'scrollback.pageDown': 'Pagina giù',
  'scrollback.exit': 'Esci',

  // ── Disconnect confirmation (themed confirm dialog) ─────────
  'disconnect.confirm.title': 'Disconnetti',
  'disconnect.confirm.body':
    'Vuoi davvero disconnetterti?',

  // ── Settings: tooltip on not-yet-translated language options ─
  'settings.language.comingSoon':
    'Disponibile a breve — aiuto con la traduzione benvenuto',

  // ── Shared dialog buttons (FInfoDialog / FConfirmDialog) ────
  'dialog.button.ok': 'OK',
  'dialog.button.cancel': 'Annulla',

  // ── Terminal settings (Local Echo) ───────────────────
  'settings.terminal': 'Terminale',
  'settings.terminal.localecho': 'Eco locale',
  'settings.terminal.autoreconnect': 'Riconnessione auto',
  'settings.terminal.doorway': 'Modalità Doorway',
  'settings.terminal.rip': 'RIP',
  'settings.sound.mute.tip': 'Silenzia il segnale acustico del terminale',
  'settings.touch.vibrate.tip': 'Durata vibrazione per tasto (ms)',
  'settings.terminal.localecho.tip': 'Mostra localmente ciò che digiti',
  'settings.terminal.autoreconnect.tip': 'Riconnetti automaticamente se cade',
  'settings.terminal.doorway.tip': 'Invia tasti speciali ai programmi DOS',
  'settings.terminal.rip.tip': 'Attiva grafica RIPscrip (ricarica)',
  'settings.protocol.autodetect.tip': 'Avvia automaticamente i trasferimenti ZMODEM',

  // ── Auto-reconnect popup ─────────────────────────
  'reconnect.title': 'Connessione persa',
  'reconnect.body': 'Riconnessione tra {seconds} secondi…',
  'reconnect.attempts': 'Tentativi: {n} di {max}',
  'reconnect.cancel': 'Annulla',
};
