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
 * Pixel write modes for BGI drawing operations, matching the
 * standard BGI `setwritemode` constants. `Normal` and `Copy` are
 * aliases (both = 0), as are `XOR`, `Or`, `And`, `Not`.
 */
export enum WriteMode {
  /** Plain assignment of the new pixel value */
  Normal = 0,
  /** Alias of `Normal` */
  Copy = 0,
  /** Bitwise XOR with existing pixel */
  XOR = 1,
  /** Bitwise OR with existing pixel */
  Or = 2,
  /** Bitwise AND with existing pixel */
  And = 3,
  /** Bitwise NOT of new pixel */
  Not = 4,
}
