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

/**
 * English string catalog — the base/reference language for
 * fTelnet-Modern's UI. Phase 5 (beta.6).
 *
 * This is the SOURCE OF TRUTH for translatable keys. Every other
 * language catalog is a partial map keyed by the same strings; any
 * key a translation omits falls back to the value here (see
 * ../i18n/index.ts `t()`). That means:
 *
 *   - A new key MUST be added here first. If it's only added to a
 *     translation, the fallback has nothing to fall back to.
 *   - English is always complete by construction — it IS the
 *     catalog the others are measured against.
 *
 * Key naming: dot-namespaced by area (`menu.*`, `settings.*`,
 * `dialog.*`, ...). Keep keys stable; translators reference them.
 *
 * NOTE: dynamic fragments (the protocol name in "Upload (ZMODEM)")
 * are NOT baked into these strings. The component composes
 * `${t('menu.upload')} (${protocol})` so the protocol name stays
 * language-neutral. Keys here are the translatable part only.
 */
export const en = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Connect',
  'menu.disconnect': 'Disconnect',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.upload': 'Upload',
  'menu.download': 'Download',
  'menu.keyboard': 'Keyboard',
  'menu.fullscreen': 'Full\u00a0Screen',
  'menu.scrollback': 'View Scrollback Buffer',
  'menu.settings': 'Settings',
  'menu.manual': 'Manual',
  'menu.button': 'Menu',
  // Screen-size dropdown option label. {cols}/{rows} are numbers
  // (language-neutral); only the surrounding words translate. An
  // aspect-ratio suffix like " (16:9)" may be appended after this.
  'menu.screensize': '{cols} columns x {rows} rows',

  // ── Status bar ──────────────────────────────────────────────
  // {host} expands to "hostname:port"; {proxy} to the proxy host.
  // The "*.proxy" variants are used when a proxy is configured.
  'status.notConnected': 'Not connected',
  'status.connecting': 'Connecting to {host}',
  'status.connecting.proxy': 'Connecting to {host} via {proxy}',
  'status.connected': 'Connected to {host}',
  'status.connected.proxy': 'Connected to {host} via {proxy}',
  'status.disconnected': 'Disconnected from {host}',
  'status.unable': 'Unable to connect to {host}',
  'status.unable.proxy': 'Unable to connect to {host} via {proxy}',
  'status.button.connect': 'Connect',
  'status.button.reconnect': 'Reconnect',
  'status.button.retry': 'Retry Connection',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.theme': 'Theme',
  'settings.protocol': 'Protocol',
  'settings.protocol.default': 'Default',
  'settings.protocol.autodetect': 'Auto Detect',
  'settings.language': 'Language',
  'settings.sound': 'Sound',
  'settings.sound.mute': 'Mute bell sounds',
  'settings.touch': 'Touch',
  'settings.touch.vibrate': 'Vibrate duration:',
  'settings.touch.ms': 'ms',
  'settings.terminal': 'Terminal',
  'settings.terminal.localecho': 'Local Echo',
  'settings.terminal.autoreconnect': 'Auto Reconnect',
  'settings.terminal.doorway': 'Doorway Mode',
  'settings.terminal.rip': 'RIP',
  'settings.about': 'About',
  'settings.close': 'Close',

  // Theme names (the labels in the Theme fieldset). These are
  // proper-ish names; translators may choose to localize or leave
  // them. Provided as keys so they CAN be localized.
  'settings.theme.classic': 'Classic',
  'settings.theme.dos-classic': 'DOS-Classic',
  'settings.theme.crt-green': 'CRT-Green',
  'settings.theme.cyberpunk': 'Cyberpunk',
  'settings.theme.gothic': 'Gothic',
  'settings.theme.cartoon': 'Cartoon',

  // Language names. By convention each language's own name is
  // usually shown in that language (an endonym), so these
  // typically are NOT translated — 'Deutsch' stays 'Deutsch' in
  // every catalog. They're keyed here for completeness.
  'settings.language.english': 'English',
  'settings.language.german': 'German',
  'settings.language.french': 'French',
  'settings.language.spanish': 'Spanish',
  'settings.language.portuguese': 'Portuguese',
  'settings.language.dutch': 'Dutch',
  'settings.language.italian': 'Italian',
  'settings.language.russian': 'Russian',
  'settings.language.swedish': 'Swedish',
  'settings.language.polish': 'Polish',
  'settings.language.ukrainian': 'Ukrainian',
  'settings.language.finnish': 'Finnish',
  'settings.language.greek': 'Greek',
  'settings.language.czech': 'Czech',
  'settings.language.japanese': 'Japanese',
  'settings.language.other': 'Other',

  // ── Info dialogs ────────────────────────────────────────────
  'dialog.download.title': 'Downloading Files',
  'dialog.download.body':
    'Use the BBS\'s download command — ZMODEM auto-detects.\n\n' +
    'When the BBS starts the transfer the progress panel appears ' +
    'automatically, and your browser will save the file when it ' +
    'completes.\n\n' +
    'To use the menu button to start downloads, switch the default ' +
    'protocol to YMODEM in Settings.',
  'dialog.copy.title': 'Copying Text',
  'dialog.copy.body':
    'Click and drag your mouse over the text you want to copy.',

  // ── Upload confirmation dialog (FUploadConfirm) ─────────────
  'upload.title': 'Confirm Upload',
  'upload.title.batch': 'Confirm Upload (Batch)',
  'upload.label.file': 'File:',
  'upload.label.size': 'Size:',
  'upload.label.modified': 'Modified:',
  'upload.label.protocol': 'Protocol:',
  'upload.label.files': 'Files:',
  'upload.label.totalSize': 'Total size:',
  // {count} = number of files, e.g. "3 files"
  'upload.value.fileCount': '{count} files',
  'upload.value.unknown': 'Unknown',
  'upload.details.show': '▸ Show details',
  'upload.details.hide': '▾ Hide details',
  'upload.warning':
    '⚠️ Make sure your BBS is at an upload prompt before clicking Send.',
  'upload.button.cancel': 'Cancel',
  'upload.button.send': 'Send',
  // {count} = number of files, e.g. "Send 3 files"
  'upload.button.sendCount': 'Send {count} files',

  // ── File transfer progress panel (FTransferProgress) ────────
  //
  // NOTE: deferred. FTransferProgress is a fixed-width box-drawing
  // ASCII panel (rendered in a <pre>) with labels padded to exact
  // column widths. It's as much a retro *visual* element as it is
  // text, and translating its terse labels (CPS:, ETA:, Bytes:,
  // Errors:) safely within the box needs a dedicated, careful pass.
  // Left in English for now; revisit separately if desired.

  // ── Drag-and-drop overlay (FDropOverlay) ────────────────────
  'drop.title': 'Drop file here',
  // {protocol} = ZMODEM or YMODEM
  'drop.subtitle': 'to upload via {protocol}',

  // ── Focus warning (FFocusWarning) ───────────────────────────
  'focus.message': '*** CLICK HERE TO ENABLE KEYBOARD INPUT ***',

  // ── Open-URL confirmation (Crt single-click on a link) ──────
  'url.confirm.title': 'Open Link',
  // {url} = the clicked URL
  'url.confirm.body':
    'Would you like to open this URL in a new window?\n\n{url}',

  // ── Scrollback bar (FScrollbackBar) ─────────────────────────
  'scrollback.label': 'SCROLLBACK:',
  'scrollback.modern.hint':
    'SCROLLBACK: Scroll back down to the bottom to exit scrollback mode',
  'scrollback.lineUp': 'Line Up',
  'scrollback.lineDown': 'Line Down',
  'scrollback.pageUp': 'Page Up',
  'scrollback.pageDown': 'Page Down',
  'scrollback.exit': 'Exit',

  // ── Disconnect confirmation (themed confirm dialog) ─────────
  'disconnect.confirm.title': 'Disconnect',
  'disconnect.confirm.body': 'Are you sure you want to disconnect?',

  // ── Settings: tooltip on not-yet-translated language options ─
  'settings.language.comingSoon': 'Coming soon — translation help welcome',

  // ── Shared dialog buttons (FInfoDialog / FConfirmDialog) ────
  'dialog.button.ok': 'OK',
  'dialog.button.cancel': 'Cancel',

  // ── Auto-reconnect popup (after an unexpected disconnect) ───
  'reconnect.title': 'Connection lost',
  'reconnect.body': 'Reconnecting in {seconds} seconds…',
  'reconnect.attempts': 'Attempts: {n} of {max}',
  'reconnect.cancel': 'Cancel',
} as const;

/** The set of valid translatable keys, derived from the English base. */
export type TranslationKey = keyof typeof en;

/** A (possibly partial) catalog for a non-base language. */
export type Catalog = Partial<Record<TranslationKey, string>>;
