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
 * Portuguese (Português) string catalog. Phase 5 (beta.11).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Brazil has a notably active retro-BBS and demoscene community, so
 * of the languages added so far this one likely reaches the most
 * real BBS users. Where Brazilian (pt-BR) and European (pt-PT)
 * Portuguese differ, the choices below lean toward forms common to
 * both; the translator can split into pt-BR/pt-PT later if desired
 * (the system supports any number of distinct language codes).
 *
 * REVIEW NOTES for the translator:
 *   - "Full Screen" → "Tela cheia" (pt-BR) / "Ecrã inteiro" (pt-PT).
 *     Used "Tela cheia" as the more widely recognized form. Verify
 *     for your audience.
 *   - "Auto Detect" → "Detecção automática" is the full form but
 *     long for the narrow Protocol column; used "Autodetecção".
 *     Verify it fits.
 *   - "Scrollback" has no clean Portuguese word; "Histórico"
 *     (history) is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Silenciar sons" — "bell" is the
 *     terminal bell; a literal "sino" would be odd. Could be
 *     "Silenciar o bipe" to keep the beep sense.
 *   - "Upload"/"Download" → "Enviar"/"Baixar" (pt-BR). pt-PT often
 *     uses "Transferir" for download; "Baixar" chosen as the more
 *     common Brazilian term. Verify for your audience.
 *   - "Settings" → "Configurações".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - Accents/ç matter: ensure ã/õ/á/é/ê/ç render — file is UTF-8.
 */
export const pt: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Conectar',
  'menu.disconnect': 'Desconectar',
  'menu.copy': 'Copiar',
  'menu.paste': 'Colar',
  'menu.upload': 'Enviar',
  'menu.download': 'Baixar',
  'menu.keyboard': 'Teclado',
  'menu.fullscreen': 'Tela cheia',
  'menu.scrollback': 'Ver histórico',
  'menu.settings': 'Configurações',
  'menu.manual': 'Manual',
  'menu.button': 'Menu',
  // "colunas"=columns, "linhas"=rows.
  'menu.screensize': '{cols} colunas x {rows} linhas',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Não conectado',
  'status.connecting': 'Conectando a {host}',
  'status.connecting.proxy': 'Conectando a {host} via {proxy}',
  'status.connected': 'Conectado a {host}',
  'status.connected.proxy': 'Conectado a {host} via {proxy}',
  'status.disconnected': 'Desconectado de {host}',
  'status.unable': 'Não foi possível conectar a {host}',
  'status.unable.proxy': 'Não foi possível conectar a {host} via {proxy}',
  'status.button.connect': 'Conectar',
  'status.button.reconnect': 'Reconectar',
  'status.button.retry': 'Tentar novamente',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Configurações',
  'settings.theme': 'Tema',
  'settings.protocol': 'Protocolo',
  'settings.protocol.default': 'Padrão',
  'settings.protocol.autodetect': 'Autodetecção',
  'settings.language': 'Idioma',
  'settings.sound': 'Som',
  'settings.sound.mute': 'Silenciar sons',
  'settings.touch': 'Toque',
  'settings.touch.vibrate': 'Duração da vibração:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Sobre',
  'settings.close': 'Fechar',

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
  'settings.language.other': 'Outro',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Baixar arquivos',
  'dialog.download.body':
    'Use o comando de download do BBS — o ZMODEM é detectado ' +
    'automaticamente.\n\n' +
    'Quando o BBS inicia a transferência, o painel de progresso ' +
    'aparece automaticamente, e seu navegador salvará o arquivo ' +
    'ao concluir.\n\n' +
    'Para iniciar downloads pelo botão do menu, altere o ' +
    'protocolo padrão para YMODEM nas Configurações.',
  'dialog.copy.title': 'Copiar texto',
  'dialog.copy.body':
    'Clique e arraste o mouse sobre o texto que deseja copiar.',
};
