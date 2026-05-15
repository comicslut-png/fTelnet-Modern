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
 * Ambient declarations for the legacy vendor-prefixed Fullscreen API.
 *
 * The standard `requestFullscreen()` / `exitFullscreen()` /
 * `fullscreenElement` are in lib.dom.d.ts. The prefixed variants
 * still exist in some browsers (Firefox `moz*` lives on, older
 * Safari uses `webkit*`, IE/legacy Edge used `ms*`) but aren't in
 * lib.dom anymore.
 *
 * fTelnetClient.FullScreenToggle() walks through the prefixes
 * with `if (el.requestFullscreen)` runtime checks so it works
 * across browsers. To compile under strict TypeScript, those
 * vendor-prefixed methods need to exist on the type — hence this
 * ambient declaration.
 *
 * The original used two files in `definitions/`:
 *   - Document.d.ts (7 methods on Document)
 *   - HTMLElement.d.ts (5 methods on HTMLElement)
 *
 * They've been merged here since both apply to the same legacy
 * API and live in the same module.
 *
 * Each method is typed `| undefined` so the runtime guards
 * `if (el.requestFullscreen)` typecheck correctly — without the
 * optional, TS would consider the method always-defined and the
 * if-check redundant.
 */

interface Document {
  // Firefox (still around as of 2026)
  readonly mozFullScreenElement?: Element;
  mozCancelFullScreen?: () => Promise<void>;

  // Webkit (Safari)
  readonly webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;

  // Microsoft (IE 11 / legacy Edge)
  readonly msFullscreenElement?: Element;
  msExitFullscreen?: () => Promise<void>;
}

interface HTMLElement {
  // Firefox
  mozRequestFullScreen?: () => Promise<void>;

  // Webkit (Safari)
  webkitRequestFullscreen?: () => Promise<void>;

  // Microsoft (IE 11 / legacy Edge)
  msRequestFullscreen?: () => Promise<void>;
}
