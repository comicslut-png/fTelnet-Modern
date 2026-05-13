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
 * Telnet protocol commands (RFC 854 and related).
 *
 * These are the byte values that appear in the telnet protocol after an
 * IAC (Interpret As Command) byte. The numeric values are fixed by the
 * RFC and cannot change.
 *
 * Phase 1 migration notes:
 *   - Converted from `enum` to a `const enum`-friendly object pattern.
 *     `const enum` would produce no runtime code (inlined values), but
 *     it doesn't play well with `isolatedModules: true` which we need
 *     for fast incremental builds. Plain `enum` works fine.
 *   - Doc comments converted from XML-style triple-slash to JSDoc style.
 *     TypeScript's tooling understands JSDoc natively and surfaces it
 *     in editor hovers.
 */
export enum TelnetCommand {
  /** SE: End of subnegotiation parameters. */
  EndSubnegotiation = 240,

  /** NOP: No operation. */
  NoOperation = 241,

  /**
   * Data Mark: The data stream portion of a Synch. This should always
   * be accompanied by a TCP Urgent notification.
   */
  DataMark = 242,

  /** Break: NVT character BRK. */
  Break = 243,

  /** Interrupt Process: The function IP. */
  InterruptProcess = 244,

  /** Abort output: The function AO. */
  AbortOutput = 245,

  /** Are You There: The function AYT. */
  AreYouThere = 246,

  /** Erase character: The function EC. */
  EraseCharacter = 247,

  /** Erase Line: The function EL. */
  EraseLine = 248,

  /** Go ahead: The GA signal. */
  GoAhead = 249,

  /** SB: Indicates that what follows is subnegotiation of the indicated option. */
  Subnegotiation = 250,

  /**
   * WILL: Indicates the desire to begin performing, or confirmation
   * that you are now performing, the indicated option.
   */
  Will = 251,

  /**
   * WON'T: Indicates the refusal to perform, or continue performing,
   * the indicated option.
   */
  Wont = 252,

  /**
   * DO: Indicates the request that the other party perform, or
   * confirmation that you are expecting the other party to perform,
   * the indicated option.
   */
  Do = 253,

  /**
   * DON'T: Indicates the demand that the other party stop performing,
   * or confirmation that you are no longer expecting the other party
   * to perform, the indicated option.
   */
  Dont = 254,

  /** IAC: Interpret As Command. Data byte 255. */
  IAC = 255,
}
