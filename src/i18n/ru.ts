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
 * Russian (Русский) string catalog. Phase 5 (beta.14).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * SIGNIFICANCE: this is fTelnet-Modern's FIRST non-Latin-script
 * language. Beyond reaching the large historical Russian
 * BBS/FidoNet community, it deliberately exercises parts of the
 * stack the all-Latin languages never did:
 *   - UTF-8 handling end to end (source → build → bundle → DOM).
 *     Verified: existing accented strings round-trip, and Cyrillic
 *     uses the same UTF-8 path, so this should "just work" — but
 *     it's worth confirming in the browser.
 *   - Theme font coverage. The six themes use various fonts; if a
 *     theme's font lacks Cyrillic glyphs the browser substitutes a
 *     fallback font for those characters. This is a VISUAL thing to
 *     check per-theme in a real browser (jsdom can't see it).
 *   - String length. Russian runs longer than English in places;
 *     watch the status bar and buttons for crowding.
 *
 * REVIEW NOTES for the translator:
 *   - Button forms are imperative/short where the UI is tight.
 *   - "Reconnect" → "Переподключиться" is long; a shorter
 *     "Переподключить" is used to ease button width. Verify.
 *   - "Retry" → "Повторить" (retry/repeat).
 *   - "Scrollback" → "История" (history) — closest idiomatic term.
 *   - "Mute bell sounds" → "Отключить звук" (mute the sound); the
 *     terminal "bell" doesn't translate literally.
 *   - "Full Screen" → "Полный экран".
 *   - "Auto Detect" → "Автоопределение" (one word, fits the narrow
 *     Protocol column).
 *   - "Settings" → "Настройки".
 *   - Theme names left as proper (Latin) names — they're product
 *     identifiers, not translated.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim;
 *     the hostname stays Latin/neutral.
 *   - File is UTF-8; all Cyrillic below is literal UTF-8.
 */
export const ru: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Подключиться',
  'menu.disconnect': 'Отключиться',
  'menu.copy': 'Копировать',
  'menu.paste': 'Вставить',
  'menu.upload': 'Загрузить',
  'menu.download': 'Скачать',
  'menu.keyboard': 'Клавиатура',
  'menu.fullscreen': 'Полный экран',
  'menu.scrollback': 'Показать историю',
  'menu.settings': 'Настройки',
  'menu.manual': 'Руководство',
  'menu.button': 'Меню',
  // "столбцов"=columns, "строк"=rows (genitive after a number).
  'menu.screensize': '{cols} столбцов x {rows} строк',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Не подключено',
  'status.connecting': 'Подключение к {host}',
  'status.connecting.proxy': 'Подключение к {host} через {proxy}',
  'status.connected': 'Подключено к {host}',
  'status.connected.proxy': 'Подключено к {host} через {proxy}',
  'status.disconnected': 'Отключено от {host}',
  'status.unable': 'Не удалось подключиться к {host}',
  'status.unable.proxy': 'Не удалось подключиться к {host} через {proxy}',
  'status.button.connect': 'Подключиться',
  'status.button.reconnect': 'Переподключить',
  'status.button.retry': 'Повторить',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Настройки',
  'settings.theme': 'Тема',
  'settings.protocol': 'Протокол',
  'settings.protocol.default': 'По умолчанию',
  'settings.protocol.autodetect': 'Автоопределение',
  'settings.language': 'Язык',
  'settings.sound': 'Звук',
  'settings.sound.mute': 'Отключить звук',
  'settings.touch': 'Сенсор',
  'settings.touch.vibrate': 'Длительность вибрации:',
  'settings.touch.ms': 'мс',
  'settings.about': 'О программе',
  'settings.close': 'Закрыть',

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
  'settings.language.other': 'Другой',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Скачивание файлов',
  'dialog.download.body':
    'Используйте команду скачивания на BBS — ZMODEM определяется ' +
    'автоматически.\n\n' +
    'Когда BBS начинает передачу, панель прогресса появляется ' +
    'автоматически, и браузер сохранит файл по завершении.\n\n' +
    'Чтобы запускать скачивание кнопкой меню, измените протокол ' +
    'по умолчанию на YMODEM в Настройках.',
  'dialog.copy.title': 'Копирование текста',
  'dialog.copy.body':
    'Нажмите и проведите мышью по тексту, который хотите ' +
    'скопировать.',
};
