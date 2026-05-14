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
 * States of the RIPscrip stream parser state machine.
 *
 * RIPscrip commands start with `!|` (at the beginning of a line, or
 * after a previous `!|`-prefixed command on the same line). After
 * `!|`, the parser reads an optional level digit, an optional
 * sublevel digit, and finally a command character, then collects
 * fixed-length or variable-length payload until the command's
 * arguments are satisfied.
 *
 * The state names track the most-recent significant character:
 *   - `None`              → ready to start a new command
 *   - `GotExclamation`    → saw `!`, waiting for `|`
 *   - `GotPipe`           → saw `|`, waiting for level digit or
 *                           level-0 command char
 *   - `GotLevel`          → got a level digit, waiting for either
 *                           a sublevel digit or a command char at
 *                           that level
 *   - `GotSubLevel`       → got a sublevel digit, waiting for a
 *                           command char
 *   - `GotCommand`        → got a command char, collecting payload
 */
export enum RIPParserState {
  /** The default data state. */
  None = 0,

  /** The last received character was a `!`. */
  GotExclamation = 1,

  /** The last received character was a `|`. */
  GotPipe = 2,

  /** The last received character was a numeric level. */
  GotLevel = 3,

  /** The last received character was a numeric sublevel. */
  GotSubLevel = 4,

  /** The last received character was a command. */
  GotCommand = 5,
}
