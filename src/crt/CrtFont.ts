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

import { Point, TypedEvent, type IEvent } from '../common/index.js';
import { ANSI_COLOURS, PETSCII_COLOURS } from './Colors.js';
import type { CharInfo } from './CharInfo.js';
import { CrtFonts } from './CrtFonts.js';

/**
 * Bitmap font loader and per-character pixel colorizer.
 *
 * Each font is a single PNG with all 256 CP437/PETSCII glyphs laid out
 * horizontally in white-on-black. To draw a colored character, we copy
 * the glyph's pixels and substitute the foreground color for every white
 * pixel and the background color for every black pixel.
 *
 * Coloring is cached per (font, size, char, fg, bg, reverse) key so
 * repeat draws of the same character/color combo are constant-time
 * lookups.
 *
 * Phase 1 migration notes:
 *   - The Atari color override on Load() is the reason ANSI_COLOURS
 *     is a mutable array. When a non-Atari font is loaded after an
 *     Atari one, we restore the default colors. (This is the same
 *     pattern as the original; documented now for clarity.)
 *   - Cache maps `_CharMap` and `_CharsMap` are now properly typed
 *     `Map<string, ...>` instead of arrays-as-maps.
 *   - The `alert()` call on permanent load failure is preserved for
 *     behavioral compatibility but flagged as a Phase 3 task — alerts
 *     are out of place in the neo-retro UI we'll be building.
 */
export class CrtFont {
  public readonly onchange: IEvent<[Point]> = new TypedEvent<[Point]>();

  public static readonly TRANSPARENT_CHARCODE: number = 1000;

  // The Colors module owns the actual palette arrays; these aliases
  // exist for code that previously did `CrtFont.ANSI_COLOURS[x]`.
  // New code should import directly from Colors.ts.
  public static readonly ANSI_COLOURS = ANSI_COLOURS;
  public static readonly PETSCII_COLOURS = PETSCII_COLOURS;

  private readonly _canvas: HTMLCanvasElement;
  private readonly _canvasContext: CanvasRenderingContext2D;
  private readonly _charMap: Map<string, ImageData> = new Map();
  private readonly _charsMap: Map<string, HTMLCanvasElement> = new Map();
  private _loading = 0;
  private _name = 'CP437';
  private _newName = 'CP437';
  private _newSize: Point = new Point(9, 16);
  private _png: HTMLImageElement | undefined;
  private _size: Point = new Point(9, 16);

  constructor() {
    this._canvas = document.createElement('canvas');
    const ctx = this._canvas.getContext('2d');
    if (!ctx) {
      throw new Error('fTelnet: canvas 2D context is unavailable');
    }
    this._canvasContext = ctx;
    this.Load(this._name, this._size.x, this._size.y);
  }

  /**
   * Return the colored pixel data for one character.
   *
   * Returns `undefined` if the font is still loading (caller should
   * try again on next render) or if the character/attribute is out of
   * range.
   */
  public GetChar(charCode: number, charInfo: CharInfo): ImageData | undefined {
    if (this._loading > 0) {
      return undefined;
    }

    let alpha = 255;
    if (charCode === CrtFont.TRANSPARENT_CHARCODE) {
      alpha = 0;
      charCode = 32;
      charInfo.Attr = 0;
      charInfo.Back24 = 0;
      charInfo.Fore24 = 0;
      charInfo.Reverse = false;
    } else if (charCode < 0 || charCode > 255 || charInfo.Attr < 0 || charInfo.Attr > 255) {
      return undefined;
    }

    const cacheKey = `${this._name}-${this._size.x}-${this._size.y}-${charCode}-${charInfo.Fore24}-${charInfo.Back24}-${charInfo.Reverse}`;
    const cached = this._charMap.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Extract the glyph's pixels from the loaded PNG.
    const glyph = this._canvasContext.getImageData(
      charCode * this._size.x,
      0,
      this._size.x,
      this._size.y
    );

    // Pick the foreground/background colors. C64 fonts use PETSCII palette
    // indexed from the attribute byte; everything else uses the per-char
    // 24-bit colors stored on CharInfo.
    let back: number;
    let fore: number;
    if (this._name.indexOf('C64') === 0) {
      back = PETSCII_COLOURS[(charInfo.Attr & 0xf0) >> 4]!;
      fore = PETSCII_COLOURS[charInfo.Attr & 0x0f]!;
    } else {
      back = charInfo.Back24;
      fore = charInfo.Fore24;
    }

    if (charInfo.Reverse) {
      [back, fore] = [fore, back];
    }

    const backR = back >> 16;
    const backG = (back >> 8) & 0xff;
    const backB = back & 0xff;
    const foreR = fore >> 16;
    const foreG = (fore >> 8) & 0xff;
    const foreB = fore & 0xff;

    const data = glyph.data;
    for (let i = 0; i < data.length; i += 4) {
      // PNG is white-on-black; checking bit 0x80 of the R channel tells
      // us whether this pixel is "lit" (foreground) or "dark" (background).
      const isFore = (data[i]! & 0x80) !== 0;
      data[i] = isFore ? foreR : backR;
      data[i + 1] = isFore ? foreG : backG;
      data[i + 2] = isFore ? foreB : backB;
      data[i + 3] = alpha;
    }

    this._charMap.set(cacheKey, glyph);
    return glyph;
  }

  /**
   * Return a canvas containing all 256 glyphs at the requested color
   * combination. Used by RIP/Graph for bulk character drawing.
   */
  public GetChars(charInfo: CharInfo): HTMLCanvasElement | undefined {
    if (this._loading > 0) {
      return undefined;
    }

    const cacheKey = `${this._name}-${this._size.x}-${this._size.y}-${charInfo.Fore24}-${charInfo.Back24}-${charInfo.Reverse}`;
    const cached = this._charsMap.get(cacheKey);
    if (cached) {
      return cached;
    }

    const all = this._canvasContext.getImageData(0, 0, this._canvas.width, this._canvas.height);

    let back: number;
    let fore: number;
    if (this._name.indexOf('C64') === 0) {
      back = PETSCII_COLOURS[(charInfo.Attr & 0xf0) >> 4]!;
      fore = PETSCII_COLOURS[charInfo.Attr & 0x0f]!;
    } else {
      back = charInfo.Back24;
      fore = charInfo.Fore24;
    }

    if (charInfo.Reverse) {
      [back, fore] = [fore, back];
    }

    const backR = back >> 16;
    const backG = (back >> 8) & 0xff;
    const backB = back & 0xff;
    const foreR = fore >> 16;
    const foreG = (fore >> 8) & 0xff;
    const foreB = fore & 0xff;

    const data = all.data;
    for (let i = 0; i < data.length; i += 4) {
      const isFore = (data[i]! & 0x80) !== 0;
      data[i] = isFore ? foreR : backR;
      data[i + 1] = isFore ? foreG : backG;
      data[i + 2] = isFore ? foreB : backB;
    }

    const out = document.createElement('canvas');
    out.width = all.width;
    out.height = all.height;
    const outCtx = out.getContext('2d');
    if (!outCtx) {
      return undefined;
    }
    outCtx.putImageData(all, 0, 0);

    this._charsMap.set(cacheKey, out);
    return out;
  }

  public get Height(): number {
    return this._size.y;
  }

  /**
   * Asynchronously load a font PNG. Returns true if the requested font
   * exists; false if not. The actual load completes some time later,
   * at which point `onchange` fires.
   */
  public Load(font: string, maxWidth: number, maxHeight: number): boolean {
    let bestFit: Point | undefined;
    if (font.indexOf('_') >= 0) {
      // Specific size requested (e.g. "RIP_8x8")
      if (CrtFonts.HasFont(font)) {
        const parts = font.split('_');
        const sizeParts = parts[1]!.split('x');
        bestFit = new Point(parseInt(sizeParts[0]!, 10), parseInt(sizeParts[1]!, 10));
        font = parts[0]!;
      }
    } else {
      bestFit = CrtFonts.GetBestFit(font, maxWidth, maxHeight);
    }

    if (!bestFit) {
      // eslint-disable-next-line no-console
      console.log(`fTelnet Error: Font CP=${font} does not exist`);
      return false;
    }

    // Already loaded?
    if (
      this._png !== undefined &&
      this._name === font &&
      this._size.x === bestFit.x &&
      this._size.y === bestFit.y
    ) {
      return true;
    }

    // Restore the default palette in case the previous font was Atari
    // (which overrode entries 0 and 7).
    ANSI_COLOURS[7] = 0xa8a8a8;
    ANSI_COLOURS[0] = 0x000000;

    this._loading += 1;
    this._newName = font;
    this._newSize = new Point(bestFit.x, bestFit.y);

    // Atari-specific palette override (signature dark blue and pale
    // blue scheme used by the Atari 8-bit family).
    if (font.indexOf('Atari') === 0) {
      ANSI_COLOURS[7] = 0x63b6e7;
      ANSI_COLOURS[0] = 0x005184;
    }

    this._png = new Image();
    this._png.crossOrigin = 'Anonymous';
    this._png.onload = (): void => this.OnPngLoad();
    this._png.onerror = (): void => this.OnPngError();
    this._png.src = CrtFonts.GetLocalUrl(font, this._newSize.x, this._newSize.y);

    return true;
  }

  public get Name(): string {
    return this._name;
  }

  /**
   * Local PNG fetch failed — try the remote CDN as a fallback. If that
   * also fails, alert the user and abandon the load. (The alert() will
   * be replaced with an in-page toast notification during the UI
   * facelift phase.)
   */
  private OnPngError(): void {
    this._png = new Image();
    this._png.crossOrigin = 'Anonymous';
    this._png.onload = (): void => this.OnPngLoad();
    this._png.onerror = (): void => {
      // eslint-disable-next-line no-alert
      alert('fTelnet Error: Unable to load requested font');
      this._loading -= 1;
    };
    this._png.src = CrtFonts.GetRemoteUrl(this._newName, this._newSize.x, this._newSize.y);
  }

  /**
   * PNG finished loading — copy it into the working canvas and notify
   * listeners. If multiple loads are in flight (because the user
   * switched fonts rapidly), only the last one wins.
   */
  private OnPngLoad(): void {
    if (this._loading === 1 && this._png) {
      const oldSize = new Point(this._size.x, this._size.y);
      this._name = this._newName;
      this._size = this._newSize;

      this._canvas.width = this._png.width;
      this._canvas.height = this._png.height;
      this._canvasContext.drawImage(this._png, 0, 0);

      // Color caches are tied to (font, size, ...); they're invalid now.
      this._charMap.clear();
      this._charsMap.clear();

      this._loading -= 1;
      this.onchange.trigger(oldSize);
    } else {
      this._loading -= 1;
    }
  }

  public get Size(): Point {
    return this._size;
  }

  public get Width(): number {
    return this._size.x;
  }
}
