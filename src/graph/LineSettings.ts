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

import { LineStyle } from './LineStyle.js';
import { LineThickness } from './LineThickness.js';

/**
 * Current line-drawing state for `Graph`.
 *
 * When `Style` is `LineStyle.User`, `Pattern` is consulted bit-by-bit
 * to determine which pixels along a line are drawn (1 = on, 0 = skip).
 * For built-in styles, `Pattern` is ignored and a fixed pattern is
 * used.
 */
export class LineSettings {
  /** Current line style enum. */
  public Style: number = LineStyle.Solid;

  /** 16-bit dash pattern used when `Style = User`. */
  public Pattern = 0xffff;

  /** Pixel thickness. */
  public Thickness: number = LineThickness.Normal;
}
