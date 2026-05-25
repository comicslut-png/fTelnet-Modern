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
 * Finnish (Suomi) string catalog. Phase 5 (beta.18).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * Finland is a Nordic demoscene and BBS heartland (Assembly, the
 * sce.org culture, a famously high density of technically-minded
 * retro users), so Finnish reaches a concentrated pocket of
 * fTelnet's natural audience. Pairs naturally with the Swedish
 * catalog already shipped.
 *
 * REVIEW NOTES for the translator:
 *   - Finnish is agglutinative; several UI terms come out longer
 *     than the English. Watched the tight spots (status bar,
 *     buttons) and chose the more compact common forms — verify
 *     they read naturally.
 *   - "Connect"/"Disconnect" → "Yhdistä"/"Katkaise yhteys".
 *     "Katkaise yhteys" (lit. "cut the connection") is the standard
 *     phrase but two words; a shorter "Katkaise" alone is sometimes
 *     used — verify it fits the button.
 *   - "Full Screen" → "Koko näyttö" (standard).
 *   - "Auto Detect" → "Automaattinen tunnistus" is long for the
 *     narrow Protocol column; used "Tunnista autom." Verify.
 *   - "Scrollback" → "Historia" (history) — closest idiomatic term.
 *   - "Mute bell sounds" → "Mykistä äänet" (mute the sounds); the
 *     terminal "bell" doesn't translate literally.
 *   - "Upload"/"Download" → "Lähetä"/"Lataa". Note "lataa" can mean
 *     both load/download; "Lähetä" (send) is used for upload to
 *     disambiguate. Verify for your audience.
 *   - "Settings" → "Asetukset".
 *   - "Vibrate duration" → "Värinän kesto".
 *   - "Keyboard" → "Näppäimistö".
 *   - "Manual" → "Käyttöohje".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - File is UTF-8; Finnish needs ä/ö (and rarely å) — ensure they
 *     render.
 */
export const fi: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Yhdistä',
  'menu.disconnect': 'Katkaise yhteys',
  'menu.copy': 'Kopioi',
  'menu.paste': 'Liitä',
  'menu.upload': 'Lähetä',
  'menu.download': 'Lataa',
  'menu.keyboard': 'Näppäimistö',
  'menu.fullscreen': 'Koko näyttö',
  'menu.scrollback': 'Näytä historia',
  'menu.settings': 'Asetukset',
  'menu.manual': 'Käyttöohje',
  'menu.button': 'Valikko',
  // "saraketta"=columns, "riviä"=rows (partitive after a number).
  'menu.screensize': '{cols} saraketta x {rows} riviä',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Ei yhteyttä',
  'status.connecting': 'Yhdistetään kohteeseen {host}',
  'status.connecting.proxy': 'Yhdistetään kohteeseen {host} välityspalvelimen {proxy} kautta',
  'status.connected': 'Yhdistetty kohteeseen {host}',
  'status.connected.proxy': 'Yhdistetty kohteeseen {host} välityspalvelimen {proxy} kautta',
  'status.disconnected': 'Yhteys katkaistu kohteeseen {host}',
  'status.unable': 'Yhteyttä kohteeseen {host} ei voitu muodostaa',
  'status.unable.proxy': 'Yhteyttä kohteeseen {host} välityspalvelimen {proxy} kautta ei voitu muodostaa',
  'status.button.connect': 'Yhdistä',
  'status.button.reconnect': 'Yhdistä uudelleen',
  'status.button.retry': 'Yritä uudelleen',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Asetukset',
  'settings.theme': 'Teema',
  'settings.protocol': 'Protokolla',
  'settings.protocol.default': 'Oletus',
  'settings.protocol.autodetect': 'Tunnista autom.',
  'settings.language': 'Kieli',
  'settings.sound': 'Ääni',
  'settings.sound.mute': 'Mykistä äänet',
  'settings.touch': 'Kosketus',
  'settings.touch.vibrate': 'Värinän kesto:',
  'settings.touch.ms': 'ms',
  'settings.about': 'Tietoja',
  'settings.close': 'Sulje',

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
  'settings.language.other': 'Muu',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Tiedostojen lataus',
  'dialog.download.body':
    'Käytä BBS:n latauskomentoa — ZMODEM tunnistetaan ' +
    'automaattisesti.\n\n' +
    'Kun BBS aloittaa siirron, edistymispaneeli avautuu ' +
    'automaattisesti, ja selain tallentaa tiedoston, kun se on ' +
    'valmis.\n\n' +
    'Aloittaaksesi lataukset valikkopainikkeesta vaihda ' +
    'oletusprotokollaksi YMODEM Asetuksissa.',
  'dialog.copy.title': 'Tekstin kopiointi',
  'dialog.copy.body':
    'Napsauta ja vedä hiirellä tekstin yli, jonka haluat kopioida.',

  // ── Upload confirmation dialog (FUploadConfirm) ─────────────
  'upload.title': 'Vahvista lähetys',
  'upload.title.batch': 'Vahvista lähetys (erä)',
  'upload.label.file': 'Tiedosto:',
  'upload.label.size': 'Koko:',
  'upload.label.modified': 'Muokattu:',
  'upload.label.protocol': 'Protokolla:',
  'upload.label.files': 'Tiedostot:',
  'upload.label.totalSize': 'Kokonaiskoko:',
  'upload.value.fileCount': '{count} tiedostoa',
  'upload.value.unknown': 'Tuntematon',
  'upload.details.show': '▸ Näytä tiedot',
  'upload.details.hide': '▾ Piilota tiedot',
  'upload.warning':
    '⚠️ Varmista, että BBS on lähetyskehotteessa ennen kuin ' +
    'napsautat Lähetä.',
  'upload.button.cancel': 'Peruuta',
  'upload.button.send': 'Lähetä',
  'upload.button.sendCount': 'Lähetä {count} tiedostoa',

  // ── Drag-and-drop overlay (FDropOverlay) ────────────────────
  'drop.title': 'Pudota tiedosto tähän',
  'drop.subtitle': 'lähettääksesi protokollalla {protocol}',

  // ── Focus warning (FFocusWarning) ───────────────────────────
  'focus.message': '*** NAPSAUTA TÄSTÄ OTTAAKSESI NÄPPÄIMISTÖSYÖTÖN KÄYTTÖÖN ***',

  // ── Open-URL confirmation (Crt single-click on a link) ──────
  'url.confirm.title': 'Avaa linkki',
  'url.confirm.body':
    'Haluatko avata tämän URL-osoitteen uudessa ikkunassa?\n\n{url}',

  // ── Scrollback bar (FScrollbackBar) ─────────────────────────
  'scrollback.label': 'VIERITYS:',
  'scrollback.modern.hint':
    'VIERITYS: Vieritä takaisin alas poistuaksesi ' +
    'vieritystilasta',
  'scrollback.lineUp': 'Rivi ylös',
  'scrollback.lineDown': 'Rivi alas',
  'scrollback.pageUp': 'Sivu ylös',
  'scrollback.pageDown': 'Sivu alas',
  'scrollback.exit': 'Poistu',

  // ── Disconnect confirmation (themed confirm dialog) ─────────
  'disconnect.confirm.title': 'Katkaise yhteys',
  'disconnect.confirm.body':
    'Haluatko varmasti katkaista yhteyden?',

  // ── Settings: tooltip on not-yet-translated language options ─
  'settings.language.comingSoon':
    'Tulossa pian — apua käännöksessä otetaan vastaan',

  // ── Shared dialog buttons (FInfoDialog / FConfirmDialog) ────
  'dialog.button.ok': 'OK',
  'dialog.button.cancel': 'Peruuta',

  // ── Terminal settings (Local Echo) ───────────────────
  'settings.terminal': 'Pääte',
  'settings.terminal.localecho': 'Paikallinen kaiku',
  'settings.terminal.autoreconnect': 'Yhdistä uudelleen',

  // ── Auto-reconnect popup ─────────────────────────
  'reconnect.title': 'Yhteys katkesi',
  'reconnect.body': 'Yhdistetään uudelleen {seconds} sekunnin kuluttua…',
  'reconnect.attempts': 'Yritykset: {n} / {max}',
  'reconnect.cancel': 'Peruuta',
};
