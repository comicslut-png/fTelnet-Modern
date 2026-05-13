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
 * States for the RLogin protocol parser.
 *
 * The handshake is: server sends `\xFF \xFF s s <8 bytes of window-size>`.
 * After those 8 bytes, we return to the Data state.
 */
export enum RLoginNegotiationState {
  /** Default data state. */
  Data = 0,

  /** Last received character was the first cookie (0xFF). */
  Cookie1 = 1,

  /** Last received character was the second cookie (0xFF). */
  Cookie2 = 2,

  /** Last received character was the first `s`. */
  S1 = 3,

  /** Last received character was the second `s`; reading 8 size bytes. */
  SS = 4,
}
