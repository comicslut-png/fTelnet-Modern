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

import { CharInfo, type Crt } from '../crt/index.js';
import { StringUtils } from '../common/index.js';
import { ContentAlignment } from './ContentAlignment.js';
import { CrtControl } from './CrtControl.js';

/**
 * Single-line (or short multi-line) text label.
 *
 * Only the `Left`, `Center`, and `Right` `ContentAlignment` values
 * are honored — the compound ones (BottomLeft, MiddleCenter, etc.)
 * are silently ignored, matching the original. Use `CrtPanel` if you
 * need title placement around a border.
 *
 * Phase 1 migration notes:
 *   - **Bug fix**: The original `Paint()` had a real bug in the Center
 *     branch: the inner `for` loop reused the outer loop's `i`
 *     variable, so `Lines[i].length` inside the spacing calculations
 *     referenced the wrong line. Multi-line centered labels rendered
 *     with junk spacing. Fixed by renaming the inner variables
 *     (`spacesIndex`, `leftSpaces`, `rightSpaces`).
 *   - The original passed `' '` as the char arg to `CharInfo.GetNew`
 *     even though the *real* char comes from the text — `GetNew` only
 *     uses the char to seed the cell; subsequent writes overwrite it.
 *     Preserved as-is.
 */
export class CrtLabel extends CrtControl {
  private _text: string;
  private _textAlign: ContentAlignment;

  constructor(
    crt: Crt,
    parent: CrtControl,
    left: number,
    top: number,
    width: number,
    text: string,
    textAlign: ContentAlignment,
    foreColour: number,
    backColour: number
  ) {
    super(crt, parent, left, top, width, 1);

    this._text = text;
    this._textAlign = textAlign;

    // The color setters trigger a Paint() so they have to be done
    // after _text is initialized. (The original had the same ordering
    // requirement with a comment about it.)
    this.ForeColour = foreColour;
    this.BackColour = backColour;

    this.Paint(true);
  }

  public Paint(_force: boolean): void {
    const lines = this._text.replace('\r\n', '\n').split('\n');
    const attr = this.ForeColour + (this.BackColour << 4);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (lineIndex === this.Height) {
        break;
      }
      const line = lines[lineIndex]!;

      switch (this._textAlign) {
        case ContentAlignment.Center:
          if (line.length >= this.Width) {
            // Truncate when the text is wider than the available space.
            this._crt.FastWrite(
              line.substring(0, this.Width),
              this.ScreenLeft,
              this.ScreenTop + lineIndex,
              CharInfo.GetNew(' ', attr)
            );
          } else {
            // Center the text by padding with spaces on both sides.
            // The original had a shadowed-`i` bug here that broke
            // multi-line centered labels; using distinct names now.
            const totalPad = this.Width - line.length;
            const leftPad = Math.floor(totalPad / 2);
            const rightPad = totalPad - leftPad;
            const leftSpaces = ' '.repeat(leftPad);
            const rightSpaces = ' '.repeat(rightPad);
            this._crt.FastWrite(
              leftSpaces + line + rightSpaces,
              this.ScreenLeft,
              this.ScreenTop + lineIndex,
              CharInfo.GetNew(' ', attr)
            );
          }
          break;

        case ContentAlignment.Left:
          this._crt.FastWrite(
            StringUtils.PadRight(line, ' ', this.Width),
            this.ScreenLeft,
            this.ScreenTop + lineIndex,
            CharInfo.GetNew(' ', attr)
          );
          break;

        case ContentAlignment.Right:
          this._crt.FastWrite(
            StringUtils.PadLeft(line, ' ', this.Width),
            this.ScreenLeft,
            this.ScreenTop + lineIndex,
            CharInfo.GetNew(' ', attr)
          );
          break;

        default:
          // Other alignment values are not meaningful for a single-line
          // label; original silently ignored them. Preserved.
          break;
      }
    }
  }

  public get Text(): string {
    return this._text;
  }
  public set Text(value: string) {
    this._text = value;
    this.Paint(true);
  }

  public get TextAlign(): ContentAlignment {
    return this._textAlign;
  }
  public set TextAlign(value: ContentAlignment) {
    if (value !== this._textAlign) {
      this._textAlign = value;
      this.Paint(true);
    }
  }
}
