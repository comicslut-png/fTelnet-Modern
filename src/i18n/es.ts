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
 * Spanish (Español) string catalog. Phase 5 (beta.9).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * REVIEW NOTES for the translator:
 *   - "Full Screen" → "Pantalla completa" (standard).
 *   - "Auto Detect" → "Detección automática" is the full form but
 *     long for the narrow Protocol column; used "Autodetección"
 *     (one word, common). Verify it fits / reads well.
 *   - "Scrollback" has no clean Spanish word; "Historial" (history)
 *     is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Silenciar sonidos" — "bell" is the
 *     terminal bell; a literal "campana" would be odd. Used the
 *     general "silenciar sonidos" (mute the sounds). Could be
 *     "Silenciar el pitido" to keep the bell/beep sense.
 *   - "Vibrate duration" → "Duración de vibración".
 *   - "Upload"/"Download" → "Subir"/"Descargar" (standard in es).
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item. Note Spanish opening punctuation (¿ ¡) where
 *     relevant — none needed in the current strings, but watch for
 *     it if you rephrase as questions.
 *   - Accents/ñ matter: ensure á/é/í/ó/ú/ñ render — file is UTF-8.
 */
export const es: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Conectar',
  'menu.disconnect': 'Desconectar',
  'menu.copy': 'Copiar',
  'menu.paste': 'Pegar',
  'menu.upload': 'Subir',
  'menu.download': 'Descargar',
  'menu.keyboard': 'Teclado',
  'menu.fullscreen': 'Pantalla completa',
  'menu.scrollback': 'Ver historial',
  'menu.settings': 'Configuración',
  'menu.manual': 'Manual',
  'menu.button': 'Menú',
  // "columnas"=columns, "filas"=rows.
  'menu.screensize': '{cols} columnas x {rows} filas',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'No conectado',
  'status.connecting': 'Conectando a {host}',
  'status.connecting.proxy': 'Conectando a {host} vía {proxy}',
  'status.connected': 'Conectado a {host}',
  'status.connected.proxy': 'Conectado a {host} vía {proxy}',
  'status.disconnected': 'Desconectado de {host}',
  'status.unable': 'No se puede conectar a {host}',
  'status.unable.proxy': 'No se puede conectar a {host} vía {proxy}',
  'status.button.connect': 'Conectar',
  'status.button.reconnect': 'Reconectar',
  'status.button.retry': 'Reintentar',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Configuración',
  'settings.theme': 'Tema',
  'settings.protocol': 'Protocolo',
  'settings.protocol.default': 'Predeterminado',
  'settings.protocol.autodetect': 'Autodetección',
  'settings.language': 'Idioma',
  'settings.sound': 'Sonido',
  'settings.sound.mute': 'Silenciar sonidos',
  'settings.touch': 'Táctil',
  'settings.touch.vibrate': 'Duración de vibración:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Acerca de',
  'settings.close': 'Cerrar',

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
  'settings.language.other': 'Otro',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Descarga de archivos',
  'dialog.download.body':
    'Use el comando de descarga del BBS — ZMODEM se detecta ' +
    'automáticamente.\n\n' +
    'Cuando el BBS inicia la transferencia, el panel de progreso ' +
    'aparece automáticamente, y su navegador guardará el archivo ' +
    'al completarse.\n\n' +
    'Para iniciar descargas con el botón del menú, cambie el ' +
    'protocolo predeterminado a YMODEM en Configuración.',
  'dialog.copy.title': 'Copiar texto',
  'dialog.copy.body':
    'Haga clic y arrastre el ratón sobre el texto que desea ' +
    'copiar.',
};
