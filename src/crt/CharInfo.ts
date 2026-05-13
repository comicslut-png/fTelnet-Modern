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

import { ANSI_COLOURS, Color } from './Colors.js';

/**
 * Per-cell rendering state for one character on the screen.
 *
 * The Crt class maintains a 2D array of these — one entry per screen
 * cell — that mirrors what's currently drawn. When something changes,
 * the cell is marked `NeedsRedraw` and the next render pass blits it.
 *
 * Fields:
 *   - Attr        : Classic 8-bit CGA attribute byte (fg in low nibble,
 *                   bg in high nibble, bit 7 = blink). Used for legacy
 *                   16-color rendering and PETSCII translation.
 *   - Fore24      : 24-bit foreground color (0xRRGGBB). Used when 256-
 *                   color or 24-bit color ANSI escapes are in play.
 *   - Back24      : 24-bit background color (0xRRGGBB).
 *   - Ch          : The single character to render in this cell.
 *   - Blink       : True if the character should blink.
 *   - Reverse     : Swap foreground and background.
 *   - Underline   : Draw an underline.
 *   - NeedsRedraw : Set by writes, cleared by the render pass.
 */
export class CharInfo {
  public Attr: number;
  public Back24: number;
  public Blink: boolean;
  public Ch: string;
  public Fore24: number;
  public NeedsRedraw: boolean;
  public Reverse: boolean;
  public Underline: boolean;

  /**
   * Construct from an existing CharInfo (copy) or null (default values).
   * Matches the original signature exactly.
   */
  constructor(oldCharInfo: CharInfo | null) {
    if (oldCharInfo === null) {
      this.Attr = Color.LIGHTGRAY;
      this.Back24 = ANSI_COLOURS[Color.BLACK]!;
      this.Blink = false;
      this.Ch = ' ';
      this.Fore24 = ANSI_COLOURS[Color.LIGHTGRAY]!;
      this.NeedsRedraw = false;
      this.Reverse = false;
      this.Underline = false;
    } else {
      // Set() initializes everything except NeedsRedraw; default it here
      // first so strictPropertyInitialization is satisfied.
      this.Attr = 0;
      this.Back24 = 0;
      this.Blink = false;
      this.Ch = ' ';
      this.Fore24 = 0;
      this.NeedsRedraw = false;
      this.Reverse = false;
      this.Underline = false;
      this.Set(oldCharInfo);
    }
  }

  /**
   * Build a fresh CharInfo from a character and an 8-bit attribute byte.
   * Splits the attribute into 24-bit foreground/background palette lookups.
   */
  static GetNew(ch: string, attr: number): CharInfo {
    const result = new CharInfo(null);
    result.Attr = attr;
    result.Back24 = ANSI_COLOURS[(attr & 0xf0) >> 4]!;
    result.Ch = ch;
    result.Fore24 = ANSI_COLOURS[attr & 0x0f]!;
    return result;
  }

  /**
   * Copy fields from another CharInfo. Note: this does NOT copy
   * `NeedsRedraw` — matches the original behavior, where Set() was
   * used to apply formatting from one cell to another without
   * implying the destination needs to be redrawn.
   */
  public Set(oldCharInfo: CharInfo): void {
    this.Attr = oldCharInfo.Attr;
    this.Back24 = oldCharInfo.Back24;
    this.Blink = oldCharInfo.Blink;
    this.Ch = oldCharInfo.Ch;
    this.Fore24 = oldCharInfo.Fore24;
    this.Reverse = oldCharInfo.Reverse;
    this.Underline = oldCharInfo.Underline;
  }
}
