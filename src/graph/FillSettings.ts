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

import { FillStyle } from './FillStyle.js';

/**
 * Current fill state for `Graph` operations.
 *
 * `Pattern` is an 8x8 boolean grid that's only consulted when `Style`
 * is `FillStyle.User`; otherwise the style enum picks one of the
 * pre-defined BGI patterns implemented inside `Graph`.
 *
 * Note: the original initialized `Pattern` to all `true` (a solid
 * fill), which is the same as `FillStyle.Solid` would have produced
 * anyway. Preserved.
 */
export class FillSettings {
  /** Palette index for the fill color (1-15 for the EGA palette). */
  public Colour = 15;

  /** 8x8 user-defined fill pattern, only used when `Style = User`. */
  public Pattern: boolean[][] = [];

  /** Current fill style. */
  public Style: number = FillStyle.Solid;

  constructor() {
    // Default pattern: 8x8 of `true` (equivalent to solid fill).
    for (let y = 0; y < 8; y++) {
      this.Pattern[y] = [];
      for (let x = 0; x < 8; x++) {
        this.Pattern[y]![x] = true;
      }
    }
  }
}
