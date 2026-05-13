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
 * Minimal interface that TelnetConnection needs from the terminal.
 *
 * The original code took a full `Crt` object — a 2,500-line class with
 * canvas rendering, font management, keystroke handling, audio, and
 * scrollback. The connection layer only ever uses two properties from
 * it (the current window column and row counts, for NAWS negotiation),
 * so depending on the full class was unnecessary coupling.
 *
 * This interface narrows that surface to exactly what's used. Bonus:
 * tests can construct a fake `WindowSizeSource` without standing up a
 * canvas, font, etc.
 *
 * `Crt` (when it's migrated in the next phase) will implement this
 * interface naturally — it already has both properties.
 */
export interface WindowSizeSource {
  /** Current window width in character columns. */
  readonly WindCols: number;

  /** Current window height in character rows. */
  readonly WindRows: number;
}
