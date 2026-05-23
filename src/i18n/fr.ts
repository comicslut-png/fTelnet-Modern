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
 * French (Français) string catalog. Phase 5 (beta.8).
 *
 * FIRST PASS — best-effort translation, pending review by a native
 * speaker (the maintainer is sourcing this). Any key not present
 * here falls back to the English base (see index.ts `t()`), so a
 * partial catalog is fine.
 *
 * REVIEW NOTES for the translator:
 *   - "Full Screen" → "Plein écran" (standard).
 *   - "Auto Detect" → "Détection auto" — the full form is
 *     "Détection automatique" but it's long for the narrow Protocol
 *     column; chose the shorter common form. Verify.
 *   - "Scrollback" has no clean French word; "Historique" (history)
 *     is the closest idiomatic choice. Verify.
 *   - "Mute bell sounds" → "Couper les sons" — "bell" is the
 *     terminal bell; a literal "cloche" would be wrong. Used the
 *     general "couper les sons" (mute the sounds). Could be
 *     "Couper le bip" if you want to keep the bell sense.
 *   - "Vibrate duration" → "Durée de vibration".
 *   - Theme names left as proper names.
 *   - Status messages keep the {host}/{proxy} placeholders verbatim.
 *   - The download dialog body is long prose; flagged as a careful
 *     review item.
 *   - Accents matter: ensure é/è/à/ç render — the file is UTF-8.
 */
export const fr: Catalog = {
  // ── Main menu buttons ───────────────────────────────────────
  'menu.connect': 'Se connecter',
  'menu.disconnect': 'Se déconnecter',
  'menu.copy': 'Copier',
  'menu.paste': 'Coller',
  'menu.upload': 'Envoyer',
  'menu.download': 'Télécharger',
  'menu.keyboard': 'Clavier',
  'menu.fullscreen': 'Plein écran',
  'menu.scrollback': 'Afficher l\u2019historique',
  'menu.settings': 'Paramètres',
  'menu.manual': 'Manuel',
  'menu.button': 'Menu',
  // "colonnes"=columns, "lignes"=rows.
  'menu.screensize': '{cols} colonnes x {rows} lignes',

  // ── Status bar ──────────────────────────────────────────────
  'status.notConnected': 'Non connecté',
  'status.connecting': 'Connexion à {host}',
  'status.connecting.proxy': 'Connexion à {host} via {proxy}',
  'status.connected': 'Connecté à {host}',
  'status.connected.proxy': 'Connecté à {host} via {proxy}',
  'status.disconnected': 'Déconnecté de {host}',
  'status.unable': 'Impossible de se connecter à {host}',
  'status.unable.proxy': 'Impossible de se connecter à {host} via {proxy}',
  'status.button.connect': 'Se connecter',
  'status.button.reconnect': 'Se reconnecter',
  'status.button.retry': 'Réessayer',

  // ── Settings panel ──────────────────────────────────────────
  'settings.title': 'Paramètres',
  'settings.theme': 'Thème',
  'settings.protocol': 'Protocole',
  'settings.protocol.default': 'Par défaut',
  'settings.protocol.autodetect': 'Détection auto',
  'settings.language': 'Langue',
  'settings.sound': 'Son',
  'settings.sound.mute': 'Couper les sons',
  'settings.touch': 'Tactile',
  'settings.touch.vibrate': 'Durée de vibration\u00a0:',
  'settings.touch.ms': 'ms',
  'settings.about': 'À propos',
  'settings.close': 'Fermer',

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
  'settings.language.other': 'Autre',

  // ── Info dialogs (best-effort; review pending) ──────────────
  'dialog.download.title': 'Téléchargement de fichiers',
  'dialog.download.body':
    'Utilisez la commande de téléchargement du BBS — le ZMODEM ' +
    'est détecté automatiquement.\n\n' +
    'Lorsque le BBS démarre le transfert, le panneau de ' +
    'progression apparaît automatiquement, et votre navigateur ' +
    'enregistre le fichier une fois terminé.\n\n' +
    'Pour lancer les téléchargements via le bouton du menu, ' +
    'passez le protocole par défaut à YMODEM dans les Paramètres.',
  'dialog.copy.title': 'Copier le texte',
  'dialog.copy.body':
    'Cliquez et faites glisser la souris sur le texte que vous ' +
    'souhaitez copier.',
};
