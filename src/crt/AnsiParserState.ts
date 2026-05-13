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
 * Possible states of the ANSI escape sequence parser.
 *
 * The parser walks each incoming byte and transitions between these
 * states to track where we are inside a multi-byte CSI sequence
 * (e.g. ESC [ 1 ; 32 m for "bright green text").
 */
export enum AnsiParserState {
  /** Default: pass characters through to the screen. */
  None = 0,

  /** Last received character was ESC (0x1B). */
  Escape = 1,

  /** Last received character was `[` (CSI introducer). */
  Bracket = 2,

  /** Reading numeric parameter bytes (0x30-0x3F). */
  ParameterByte = 3,

  /** Reading intermediate bytes (0x20-0x2F). */
  IntermediateByte = 4,

  /** Reading a string sequence terminated by ESC \. */
  ReadingString = 5,

  /** Reading a string sequence and just saw an ESC. */
  ReadingStringEscape = 6,
}
