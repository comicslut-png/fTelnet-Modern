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
 * States for the telnet protocol parser's state machine.
 *
 * The parser walks the input stream byte by byte, transitioning between
 * these states to track where we are in a multi-byte sequence (e.g. an
 * IAC + DO + option triple, or an IAC + SB + ... + IAC + SE subnegotiation).
 */
export enum TelnetNegotiationState {
  /** Default data state: regular characters pass through. */
  Data = 0,

  /** Last received character was an IAC. */
  IAC = 1,

  /** Last received character was a DO command. */
  Do = 2,

  /** Last received character was a DONT command. */
  Dont = 3,

  /** Last received character was a WILL command. */
  Will = 4,

  /** Last received character was a WONT command. */
  Wont = 5,

  /** Last received character was an SB (start subnegotiation) command. */
  Subnegotiation = 6,

  /**
   * The subnegotiation option byte has been seen; we're now reading
   * the option's parameter data.
   */
  SubnegotiationData = 7,

  /** Last received character was an IAC during subnegotiation data. */
  SubnegotiationIAC = 8,
}
