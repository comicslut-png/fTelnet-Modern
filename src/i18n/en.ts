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
} as const;

/** The set of valid translatable keys, derived from the English base. */
export type TranslationKey = keyof typeof en;

/** A (possibly partial) catalog for a non-base language. */
export type Catalog = Partial<Record<TranslationKey, string>>;
