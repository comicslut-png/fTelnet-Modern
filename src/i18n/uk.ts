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
 * Ukrainian (Українська) string catalog. Phase 5 (beta.17).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Ukrainian is the second Cyrillic-script language (after Russian)
 * but a distinct alphabet — it has letters Russian lacks (і, ї, є,
 * ґ) and omits some Russian ones. It is NOT a dialect of Russian;
 * the translations below are independent, not transliterations.
 *
 * REVIEW NOTES for the translator:
 *   - "Connect"/"Disconnect" → "Підключитися"/"Відключитися".
 *   - "Full Screen" → "Повний екран".
 *   - "Auto Detect" → "Автовизначення" (fits the narrow Protocol
 *     column).
 *   - "Scrollback" → "Історія" (history) — closest idiomatic term.
 *   - "Mute bell sounds" → "Вимкнути звук" (mute the sound); the
 *     terminal "bell" doesn't translate literally.
 *   - "Upload"/"Download" → "Завантажити"/"Завантажити" can collide
 *     in Ukrainian (both senses use завантажити). Used
 *     "Вивантажити" (upload, lit. "load out") vs "Завантажити"
 *     (download) to disambiguate — verify this reads naturally for
 *     your audience; some prefer "Надіслати" for upload.
 *   - "Settings" → "Налаштування".
 *   - "Manual" → "Посібник".
 *   - Theme names left as proper (Latin) names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim;
 *     the hostname stays Latin/neutral.
 *   - File is UTF-8; all Cyrillic below is literal UTF-8. Note the
 *     distinctly Ukrainian letters і/ї/є.
 */
export const uk: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Підключитися',
  'menu.disconnect': 'Відключитися',
  'menu.copy': 'Копіювати',
  'menu.paste': 'Вставити',
  'menu.upload': 'Вивантажити',
  'menu.download': 'Завантажити',
  'menu.keyboard': 'Клавіатура',
  'menu.fullscreen': 'Повний екран',
  'menu.scrollback': 'Показати історію',
  'menu.settings': 'Налаштування',
  'menu.manual': 'Посібник',
  'menu.button': 'Меню',
  // "стовпців"=columns, "рядків"=rows (genitive after a number).
  'menu.screensize': '{cols} стовпців x {rows} рядків',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Не підключено',
  'status.connecting': 'Підключення до {host}',
  'status.connecting.proxy': 'Підключення до {host} через {proxy}',
  'status.connected': 'Підключено до {host}',
  'status.connected.proxy': 'Підключено до {host} через {proxy}',
  'status.disconnected': 'Відключено від {host}',
  'status.unable': 'Не вдалося підключитися до {host}',
  'status.unable.proxy': 'Не вдалося підключитися до {host} через {proxy}',
  'status.button.connect': 'Підключитися',
  'status.button.reconnect': 'Перепідключитися',
  'status.button.retry': 'Повторити',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Налаштування',
  'settings.theme': 'Тема',
  'settings.protocol': 'Протокол',
  'settings.protocol.default': 'За замовчуванням',
  'settings.protocol.autodetect': 'Автовизначення',
  'settings.language': 'Мова',
  'settings.sound': 'Звук',
  'settings.sound.mute': 'Вимкнути звук',
  'settings.touch': 'Дотик',
  'settings.touch.vibrate': 'Тривалість вібрації:',
  'settings.touch.ms': 'мс',
  'settings.about': 'Про програму',
  'settings.close': 'Закрити',

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
  'settings.language.other': 'Інша',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Завантаження файлів',
  'dialog.download.body':
    'Використовуйте команду завантаження BBS — ZMODEM визначається ' +
    'автоматично.\n\n' +
    'Коли BBS починає передачу, панель прогресу з’являється ' +
    'автоматично, і браузер збереже файл після завершення.\n\n' +
    'Щоб запускати завантаження кнопкою меню, змініть протокол за ' +
    'замовчуванням на YMODEM у Налаштуваннях.',
  'dialog.copy.title': 'Копіювання тексту',
  'dialog.copy.body':
    'Натисніть і проведіть мишею по тексту, який хочете ' +
    'скопіювати.',
};
