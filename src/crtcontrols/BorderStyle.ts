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
 * Border styles for `CrtPanel`. Each style picks a different set of
 * box-drawing characters from CP437 for the four corners, the top
 * and bottom edges, and the left and right edges.
 */
export enum BorderStyle {
  /** Single lines all around. */
  Single = 0,

  /** Double lines all around. */
  Double = 1,

  /** Single lines horizontally, double lines vertically. (See `DoubleV`.) */
  SingleH = 2,

  /** Single lines vertically, double lines horizontally. (See `DoubleH`.) */
  SingleV = 3,

  /** Double lines horizontally, single lines vertically. (See `SingleV`.) */
  DoubleH = 4,

  /** Double lines vertically, single lines horizontally. (See `SingleH`.) */
  DoubleV = 5,
}
