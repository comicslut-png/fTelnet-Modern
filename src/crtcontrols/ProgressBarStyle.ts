/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) Rick Parrish, R&M Software

  This file is part of fTelnet.

  fTelnet is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  fTelnet is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY, without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with fTelnet.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Visual style for `CrtProgressBar`.
 *
 * The numeric values are the CP437 character codes used to draw each
 * style's filled cells:
 *   - `Blocks` (254): centered dot — draws a series of filled boxes
 *   - `Continuous` (219): full block — draws a solid bar
 *   - `Marquee` (0): no fill character; uses dedicated marquee logic
 *     that animates a 15-cell-wide bar bouncing back and forth
 */
export enum ProgressBarStyle {
  Blocks = 254,
  Continuous = 219,
  Marquee = 0,
}
