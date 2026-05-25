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
 * Japanese (日本語) string catalog. Phase 5 (beta.21).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker. Japanese is the one language where neither the maintainer
 * nor the assistant can proofread the result, so a native review is
 * STRONGLY recommended before relying on it. Any key not present
 * here falls back to the English base (see index.ts `t()`).
 *
 * SIGNIFICANCE: Japanese is fTelnet-Modern's FIRST CJK language.
 * Unlike the Latin/Cyrillic/Greek catalogs, the UI chrome cannot
 * render these glyphs with the existing fonts — so this release is
 * paired with a Noto Sans JP webfont (subset to the characters used
 * here) added as a fallback in the chrome font stack. See the
 * font-plumbing change (beta.21a) and `public/fonts/`.
 *
 * IMPORTANT: the TERMINAL CANVAS is unaffected — it still renders
 * the retro CP437/PETSCII/Topaz bitmap fonts. Japanese chrome does
 * NOT make BBS sessions Japanese-capable; that's inherent to a
 * retro terminal. Only the menu/settings/status chrome is Japanese.
 *
 * If you EDIT this file, you must also re-subset the webfont so it
 * includes any new characters (see scripts/subset-noto-jp notes in
 * the release), or new glyphs will fall back to a system font.
 *
 * REVIEW NOTES for the translator:
 *   - Button labels use common katakana loanwords where those are
 *     the natural UI term (コピー copy, ペースト paste) and kanji
 *     where those read better (設定 settings, 接続 connect).
 *   - "Connect"/"Disconnect" → 接続/切断.
 *   - "Upload"/"Download" → アップロード/ダウンロード.
 *   - "Full Screen" → 全画面.
 *   - "Scrollback" → 履歴 (history).
 *   - "Settings" → 設定.  "Manual" → マニュアル.
 *   - "Keyboard" → キーボード.
 *   - Screen-size uses 列 (columns) / 行 (rows).
 *   - Theme names left as proper (Latin) names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 */
export const ja: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': '接続',
  'menu.disconnect': '切断',
  'menu.copy': 'コピー',
  'menu.paste': 'ペースト',
  'menu.upload': 'アップロード',
  'menu.download': 'ダウンロード',
  'menu.keyboard': 'キーボード',
  'menu.fullscreen': '全画面',
  'menu.scrollback': '履歴を表示',
  'menu.settings': '設定',
  'menu.manual': 'マニュアル',
  'menu.button': 'メニュー',
  // 列=columns, 行=rows.
  'menu.screensize': '{cols} 列 x {rows} 行',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': '未接続',
  'status.connecting': '{host} に接続中',
  'status.connecting.proxy': '{proxy} 経由で {host} に接続中',
  'status.connected': '{host} に接続しました',
  'status.connected.proxy': '{proxy} 経由で {host} に接続しました',
  'status.disconnected': '{host} から切断しました',
  'status.unable': '{host} に接続できません',
  'status.unable.proxy': '{proxy} 経由で {host} に接続できません',
  'status.button.connect': '接続',
  'status.button.reconnect': '再接続',
  'status.button.retry': '再試行',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': '設定',
  'settings.theme': 'テーマ',
  'settings.protocol': 'プロトコル',
  'settings.protocol.default': 'デフォルト',
  'settings.protocol.autodetect': '自動検出',
  'settings.language': '言語',
  'settings.sound': 'サウンド',
  'settings.sound.mute': '音を消す',
  'settings.touch': 'タッチ',
  'settings.touch.vibrate': '振動の長さ:',
  'settings.touch.ms': 'ミリ秒',
  'settings.about': '情報',
  'settings.close': '閉じる',

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
  'settings.language.other': 'その他',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'ファイルのダウンロード',
  'dialog.download.body':
    'BBS のダウンロードコマンドを使用してください。ZMODEM は' +
    '自動的に検出されます。\n\n' +
    'BBS が転送を開始すると、進行状況パネルが自動的に表示され、' +
    '完了するとブラウザがファイルを保存します。\n\n' +
    'メニューボタンからダウンロードを開始するには、設定で' +
    'デフォルトのプロトコルを YMODEM に変更してください。',
  'dialog.copy.title': 'テキストのコピー',
  'dialog.copy.body':
    'コピーしたいテキストの上でマウスをクリックしてドラッグして' +
    'ください。',

  // ── Upload confirmation dialog (FUploadConfirm) ─────────────
  'upload.title': 'アップロードの確認',
  'upload.title.batch': 'アップロードの確認（一括）',
  'upload.label.file': 'ファイル:',
  'upload.label.size': 'サイズ:',
  'upload.label.modified': '更新日時:',
  'upload.label.protocol': 'プロトコル:',
  'upload.label.files': 'ファイル:',
  'upload.label.totalSize': '合計サイズ:',
  'upload.value.fileCount': '{count} 個のファイル',
  'upload.value.unknown': '不明',
  'upload.details.show': '▸ 詳細を表示',
  'upload.details.hide': '▾ 詳細を非表示',
  'upload.warning':
    '⚠️ 送信をクリックする前に、BBS がアップロードの' +
    '入力待ち状態であることを確認してください。',
  'upload.button.cancel': 'キャンセル',
  'upload.button.send': '送信',
  'upload.button.sendCount': '{count} 個のファイルを送信',

  // ── Drag-and-drop overlay (FDropOverlay) ────────────────────
  'drop.title': 'ここにファイルをドロップ',
  'drop.subtitle': '{protocol} でアップロード',

  // ── Focus warning (FFocusWarning) ───────────────────────────
  'focus.message': '*** キーボード入力を有効にするにはここをクリック ***',

  // ── Open-URL confirmation (Crt single-click on a link) ──────
  'url.confirm.title': 'リンクを開く',
  'url.confirm.body':
    'この URL を新しいウィンドウで開きますか？\n\n{url}',

  // ── Scrollback bar (FScrollbackBar) ─────────────────────────
  'scrollback.label': '履歴:',
  'scrollback.modern.hint':
    '履歴: 履歴モードを終了するには一番下まで' +
    'スクロールしてください',
  'scrollback.lineUp': '1行上',
  'scrollback.lineDown': '1行下',
  'scrollback.pageUp': '1ページ上',
  'scrollback.pageDown': '1ページ下',
  'scrollback.exit': '終了',

  // ── Disconnect confirmation (themed confirm dialog) ─────────
  'disconnect.confirm.title': '切断',
  'disconnect.confirm.body':
    '本当に切断しますか？',

  // ── Settings: tooltip on not-yet-translated language options ─
  'settings.language.comingSoon':
    '近日公開 — 翻訳のご協力を歓迎します',

  // ── Shared dialog buttons (FInfoDialog / FConfirmDialog) ────
  'dialog.button.ok': 'OK',
  'dialog.button.cancel': 'キャンセル',

  // ── Terminal settings (Local Echo) ───────────────────
  'settings.terminal': 'ターミナル',
  'settings.terminal.localecho': 'ローカルエコー',
  'settings.terminal.autoreconnect': '自動再接続',

  // ── Auto-reconnect popup ─────────────────────────
  'reconnect.title': '接続が切断されました',
  'reconnect.body': '{seconds} 秒後に再接続します…',
  'reconnect.attempts': '再接続: {n} / {max} 回',
  'reconnect.cancel': 'キャンセル',
};
