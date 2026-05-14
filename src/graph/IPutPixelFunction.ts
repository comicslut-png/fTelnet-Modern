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
 * Pixel-plotting callback signature.
 *
 * Drawing primitives (lines, circles, fills) accept a callback of
 * this shape so they can be parameterized by *how* a single pixel
 * gets written — for example, `Normal` mode just assigns, `XOR`
 * mode toggles, `User` styles consult a fill pattern.
 *
 * `Graph` exposes pre-built variants via methods like `PutPixel`
 * (writes through the current `WriteMode`), `PutPixelDirect` (bypasses
 * the mode and writes directly), and pattern-based variants for fills.
 */
export type IPutPixelFunction = (x: number, y: number, paletteIndex: number) => void;
