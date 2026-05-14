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
 * Fill pattern styles for BGI-emulation graphics operations
 * (`Graph.SetFillStyle`, `Graph.Bar`, `Graph.FillPoly`, etc.).
 *
 * Values 0-11 correspond directly to Borland Graphics Interface
 * fill style constants. `User` lets the application supply a custom
 * 8x8 boolean fill pattern via `Graph.SetFillPattern`.
 */
export enum FillStyle {
  /** No fill — uses the background color */
  Empty = 0,
  /** Solid fill using the current draw color */
  Solid = 1,
  /** Horizontal lines */
  Line = 2,
  /** Thin slash (`/`) */
  LightSlash = 3,
  /** Thick slash (`/`) */
  Slash = 4,
  /** Thick backslash (`\`) */
  BackSlash = 5,
  /** Thin backslash (`\`) */
  LightBackSlash = 6,
  /** Light hatching */
  Hatch = 7,
  /** Heavy cross-hatching */
  CrossHatch = 8,
  /** Interleaved lines */
  Interleave = 9,
  /** Widely spaced dots */
  WideDot = 10,
  /** Closely spaced dots */
  CloseDot = 11,
  /** User-supplied 8x8 pattern */
  User = 12,
}
