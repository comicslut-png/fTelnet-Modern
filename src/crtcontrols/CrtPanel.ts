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
import { BorderStyle } from './BorderStyle.js';
import { ContentAlignment } from './ContentAlignment.js';
import { CrtControl } from './CrtControl.js';

/**
 * Bordered panel — a rectangle drawn with CP437 box-drawing
 * characters, optionally with a title positioned around the border.
 *
 * Box-drawing character codes (CP437):
 *
 * | Style                | TL  | TR  | BL  | BR  | H   | V   |
 * |----------------------|-----|-----|-----|-----|-----|-----|
 * | `Single`             | 218 | 191 | 192 | 217 | 196 | 179 |
 * | `Double`             | 201 | 187 | 200 | 188 | 205 | 186 |
 * | `DoubleH` / `SingleV`| 213 | 184 | 212 | 190 | 205 | 179 |
 * | `DoubleV` / `SingleH`| 214 | 183 | 211 | 189 | 196 | 186 |
 *
 * The `DoubleH`/`SingleV` and `DoubleV`/`SingleH` pairs share the
 * same character set because they describe the same border (single
 * along one axis, double along the other) — just named from
 * different perspectives.
 */
export class CrtPanel extends CrtControl {
  private _border: BorderStyle;
  private _text: string;
  private _textAlign: ContentAlignment;

  constructor(
    crt: Crt,
    parent: CrtControl | undefined,
    left: number,
    top: number,
    width: number,
    height: number,
    border: BorderStyle,
    foreColour: number,
    backColour: number,
    text: string,
    textAlign: ContentAlignment
  ) {
    super(crt, parent, left, top, width, height);

    this._border = border;
    this._text = text;
    this._textAlign = textAlign;

    // Color setters trigger a Paint(); order matters because Paint()
    // reads _text/_border.
    this.ForeColour = foreColour;
    this.BackColour = backColour;

    this.Paint(true);
  }

  public get Border(): BorderStyle {
    return this._border;
  }
  public set Border(value: BorderStyle) {
    if (value !== this._border) {
      this._border = value;
      this.Paint(true);
    }
  }

  /**
   * Resolve the current `BorderStyle` to its six CP437 character codes:
   * top-left, top-right, bottom-left, bottom-right, top/bottom edge,
   * left/right edge.
   */
  private getBorderChars(): {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    horizontal: string;
    vertical: string;
  } {
    switch (this._border) {
      case BorderStyle.Single:
        return {
          topLeft: String.fromCharCode(218),
          topRight: String.fromCharCode(191),
          bottomLeft: String.fromCharCode(192),
          bottomRight: String.fromCharCode(217),
          horizontal: String.fromCharCode(196),
          vertical: String.fromCharCode(179),
        };
      case BorderStyle.Double:
        return {
          topLeft: String.fromCharCode(201),
          topRight: String.fromCharCode(187),
          bottomLeft: String.fromCharCode(200),
          bottomRight: String.fromCharCode(188),
          horizontal: String.fromCharCode(205),
          vertical: String.fromCharCode(186),
        };
      case BorderStyle.DoubleH:
      case BorderStyle.SingleV:
        return {
          topLeft: String.fromCharCode(213),
          topRight: String.fromCharCode(184),
          bottomLeft: String.fromCharCode(212),
          bottomRight: String.fromCharCode(190),
          horizontal: String.fromCharCode(205),
          vertical: String.fromCharCode(179),
        };
      case BorderStyle.DoubleV:
      case BorderStyle.SingleH:
        return {
          topLeft: String.fromCharCode(214),
          topRight: String.fromCharCode(183),
          bottomLeft: String.fromCharCode(211),
          bottomRight: String.fromCharCode(189),
          horizontal: String.fromCharCode(196),
          vertical: String.fromCharCode(186),
        };
      default:
        // Fallback to ASCII box chars — matches the original's
        // initial assignments before the switch.
        return {
          topLeft: '+',
          topRight: '+',
          bottomLeft: '+',
          bottomRight: '+',
          horizontal: '-',
          vertical: '|',
        };
    }
  }

  public Paint(_force: boolean): void {
    const chars = this.getBorderChars();
    const attr = this.ForeColour + (this.BackColour << 4);
    const cellInfo = (): CharInfo => CharInfo.GetNew(' ', attr);

    // Draw the top edge: TL + H * (width-2) + TR
    this._crt.FastWrite(
      chars.topLeft + StringUtils.NewString(chars.horizontal, this.Width - 2) + chars.topRight,
      this.ScreenLeft,
      this.ScreenTop,
      cellInfo()
    );

    // Draw the middle rows: V + spaces + V
    for (let line = this.ScreenTop + 1; line < this.ScreenTop + this.Height - 1; line++) {
      this._crt.FastWrite(
        chars.vertical + StringUtils.NewString(' ', this.Width - 2) + chars.vertical,
        this.ScreenLeft,
        line,
        cellInfo()
      );
    }

    // Draw the bottom edge: BL + H * (width-2) + BR
    this._crt.FastWrite(
      chars.bottomLeft + StringUtils.NewString(chars.horizontal, this.Width - 2) + chars.bottomRight,
      this.ScreenLeft,
      this.ScreenTop + this.Height - 1,
      cellInfo()
    );

    // Draw the title, if any.
    const titleTrimmed = StringUtils.Trim(this._text);
    if (titleTrimmed.length > 0) {
      this.paintTitle(titleTrimmed, attr);
    }
  }

  /**
   * Place the title at the border position indicated by `_textAlign`.
   *
   * The title is wrapped with single spaces (so " Title " not "Title")
   * to give a visual gap from the corner characters. Title placement:
   *
   *   - `*Left`  → 2 cells inside the left border
   *   - `*Center`→ centered on the edge
   *   - `*Right` → 2 cells inside the right border
   *
   * And vertically:
   *   - `Bottom*` → bottom edge
   *   - `Middle*` / `Top*` → top edge (the original had no separate
   *     middle-row title placement; preserved)
   */
  private paintTitle(title: string, attr: number): void {
    const windowTitle = ` ${title} `;
    let titleX = 0;
    let titleY = 0;

    switch (this._textAlign) {
      case ContentAlignment.BottomLeft:
      case ContentAlignment.MiddleLeft:
      case ContentAlignment.TopLeft:
        titleX = this.ScreenLeft + 2;
        break;
      case ContentAlignment.BottomCenter:
      case ContentAlignment.MiddleCenter:
      case ContentAlignment.TopCenter:
        titleX = this.ScreenLeft + Math.round((this.Width - windowTitle.length) / 2);
        break;
      case ContentAlignment.BottomRight:
      case ContentAlignment.MiddleRight:
      case ContentAlignment.TopRight:
        titleX = this.ScreenLeft + this.Width - windowTitle.length - 2;
        break;
      default:
        // Non-positional alignments fall back to top-left.
        titleX = this.ScreenLeft + 2;
        break;
    }

    switch (this._textAlign) {
      case ContentAlignment.BottomCenter:
      case ContentAlignment.BottomLeft:
      case ContentAlignment.BottomRight:
        titleY = this.ScreenTop + this.Height - 1;
        break;
      default:
        // Middle and Top variants (and anything else) → top edge.
        titleY = this.ScreenTop;
        break;
    }

    this._crt.FastWrite(windowTitle, titleX, titleY, CharInfo.GetNew(' ', attr));
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
