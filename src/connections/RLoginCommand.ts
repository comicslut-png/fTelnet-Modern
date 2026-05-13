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
 * Byte values significant to RLogin's handshake.
 *
 * RLogin (RFC 1282) is a much simpler protocol than telnet. The only
 * inline-control sequence fTelnet needs to handle is the in-band window-
 * size update, which starts with a "cookie" byte followed by two `s`s.
 */
export enum RLoginCommand {
  /** Cookie: byte 0xFF, marks the start of an in-band control sequence. */
  Cookie = 255,

  /** Lowercase `s`. Two of these in a row signal a window-size update. */
  S = 115,
}
