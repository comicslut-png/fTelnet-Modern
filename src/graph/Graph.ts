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

import { Point, StringUtils } from '../common/index.js';
import { Crt } from '../crt/index.js';
import { BitmapFont } from './BitmapFont.js';
import { FillSettings } from './FillSettings.js';
import { FillStyle } from './FillStyle.js';
import type { IPutPixelFunction } from './IPutPixelFunction.js';
import { LineSettings } from './LineSettings.js';
import { LineStyle } from './LineStyle.js';
import { LineThickness } from './LineThickness.js';
import { Rectangle } from './Rectangle.js';
import { StrokeFont } from './StrokeFont.js';
import { TextJustification } from './TextJustification.js';
import { TextOrientation } from './TextOrientation.js';
import { TextSettings } from './TextSettings.js';
import { ViewPortSettings } from './ViewPortSettings.js';
import { WriteMode } from './WriteMode.js';

/**
 * Borland Graphics Interface (BGI) emulation, used by the RIPscrip
 * parser to render BBS graphics on an HTML5 canvas overlaid on top of
 * the `Crt` text canvas.
 *
 * The API matches the BGI primitives surface (Arc, Bar, Circle,
 * DrawPoly, Ellipse, FillPoly, FloodFill, Line, OutText, PieSlice,
 * Rectangle, Sector, plus the Set/Get state methods) closely enough
 * that the original Turbo Pascal BGI documentation is the authoritative
 * reference for behavior.
 *
 * Phase 1 migration notes:
 *
 *   - All methods are migrated as-is. The Bresenham line algorithm,
 *     the patterned-line dash logic, the ellipse rasterizer with
 *     thick-line outlining, and the stack-based flood fill are
 *     preserved verbatim except for `var → let/const` and explicit
 *     types. The block comments in `Line()` (which look like direct
 *     ports from the Turbo Pascal source) are kept for orientation.
 *
 *   - There are THREE line implementations: `Line` (full BGI), `yLine`,
 *     and `xLine`. The latter two are "doesn't support XOR" and
 *     "only supports solid" variants. The RIPscrip parser may pick
 *     one or another depending on the command. All three are
 *     preserved unchanged.
 *
 *   - The `Rectangle` method shares its name with the imported
 *     `Rectangle` class. TypeScript distinguishes them (the bare name
 *     resolves to the class inside this module; `this.Rectangle(...)`
 *     resolves to the method). Both are kept named as in the original
 *     to preserve the public API.
 *
 *   - The `_TextWindow` field is initialized in the constructor and
 *     read by `SetTextWindow`, but never written elsewhere. This means
 *     the "did the window change?" check inside `SetTextWindow` always
 *     compares against the *original* dimensions, never the current
 *     ones. The original had this behavior too — likely a latent bug
 *     where the developer forgot to update the field. Preserved as-is
 *     with a TODO; addressing this is out of scope for the migration.
 *
 *   - The original had a number of `// TODO trace(...)` lines noting
 *     incomplete error reporting. Preserved unchanged.
 *
 *   - The `EGA_PALETTE` is a class-level constant (was `private static`
 *     in the original). The `CURRENT_PALETTE` is mutable per-instance,
 *     initialized to the standard 16-entry default. Both preserved.
 */
export class Graph {
  /** Aspect ratio used by Arc and PieSlice (BGI standard: 0.775). */
  private readonly ASPECT_RATIO = 0.775;

  /** Pixel width of the graphics canvas. */
  public readonly PIXELS_X = 640;

  /** Pixel height of the graphics canvas. */
  public readonly PIXELS_Y = 350;

  /** Total pixel count (PIXELS_X × PIXELS_Y). */
  public readonly PIXELS = this.PIXELS_X * this.PIXELS_Y;

  /**
   * Full EGA palette: 64 entries of 24-bit RGB.
   *
   * Only 16 are active at a time via `CURRENT_PALETTE`. Calling
   * `SetPalette(currentIndex, egaIndex)` swaps in a different one.
   */
  private static readonly EGA_PALETTE: readonly number[] = [
    0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaaaa00, 0xaaaaaa,
    0x000055, 0x0000ff, 0x00aa55, 0x00aaff, 0xaa0055, 0xaa00ff, 0xaaaa55, 0xaaaaff,
    0x005500, 0x0055aa, 0x00ff00, 0x00ffaa, 0xaa5500, 0xaa55aa, 0xaaff00, 0xaaffaa,
    0x005555, 0x0055ff, 0x55ff00, 0x00ffff, 0xaa5555, 0xaa55ff, 0xaaff55, 0xaaffff,
    0x550000, 0x5500aa, 0x55aa00, 0x55aaaa, 0xff0000, 0xff00aa, 0xffaa00, 0xffaaaa,
    0x550055, 0x5500ff, 0x55aa55, 0x55aaff, 0xff0055, 0xff00ff, 0xffaa55, 0xffaaff,
    0x555500, 0x5555aa, 0x55ff00, 0x55ffaa, 0xff5500, 0xff55aa, 0xffff00, 0xffffaa,
    0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
  ];

  /**
   * Current 16-entry palette. Mutable: `SetPalette` writes to it.
   * The default mapping picks indices 0-5, 20, 7, then 56-63 from
   * the EGA palette — the standard BGI 16-color default.
   */
  public CURRENT_PALETTE: number[] = [
    Graph.EGA_PALETTE[0]!, Graph.EGA_PALETTE[1]!, Graph.EGA_PALETTE[2]!, Graph.EGA_PALETTE[3]!,
    Graph.EGA_PALETTE[4]!, Graph.EGA_PALETTE[5]!, Graph.EGA_PALETTE[20]!, Graph.EGA_PALETTE[7]!,
    Graph.EGA_PALETTE[56]!, Graph.EGA_PALETTE[57]!, Graph.EGA_PALETTE[58]!, Graph.EGA_PALETTE[59]!,
    Graph.EGA_PALETTE[60]!, Graph.EGA_PALETTE[61]!, Graph.EGA_PALETTE[62]!, Graph.EGA_PALETTE[63]!,
  ];

  private _FillSettings: FillSettings = new FillSettings();
  private _LineSettings: LineSettings = new LineSettings();
  private _TextSettings: TextSettings = new TextSettings();
  private _ViewPortSettings: ViewPortSettings = new ViewPortSettings();

  private _BackColour = 0;
  private readonly _Canvas: HTMLCanvasElement;
  private readonly _CanvasContext: CanvasRenderingContext2D;
  private _Colour = 0;
  private readonly _Container: HTMLElement;
  private readonly _Crt: Crt;
  private readonly _CursorPosition: Point = new Point(0, 0);
  private _FillEllipse = false;
  private _FillPolyMap: boolean[][] = [];
  private _IsLittleEndian = true;
  private readonly _TextWindow: Rectangle;
  private _WriteMode: number = WriteMode.Normal;

  /**
   * Current pixel-plotting function. Drawing primitives call through
   * this so callers can swap in alternate behaviors:
   *   - `PutPixelDefault` — the normal write path
   *   - `PutPixelPoly` — recording variant used during `FillPoly`
   *
   * Bound at the bottom of the field list (and explicitly rebound in
   * `FillPoly`) so the `this` reference inside resolves correctly.
   */
  public PutPixel: IPutPixelFunction = (x, y, paletteIndex): void =>
    this.PutPixelDefault(x, y, paletteIndex);

  constructor(crt: Crt, container: HTMLElement) {
    this._Crt = crt;
    this._Container = container;
    this._TextWindow = new Rectangle(0, 0, this._Crt.ScreenCols, this._Crt.ScreenRows);

    // Detect endianness. Used by FloodFill and SetPalette when poking
    // bytes through Uint32 views of canvas image data.
    // Reference: http://jsfiddle.net/andrewjbaker/Fnx2w/
    const endianBuffer = new ArrayBuffer(4);
    const endian8 = new Uint8Array(endianBuffer);
    const endian32 = new Uint32Array(endianBuffer);
    endian32[0] = 0x0a0b0c0d;
    if (
      endian8[0] === 0x0a &&
      endian8[1] === 0x0b &&
      endian8[2] === 0x0c &&
      endian8[3] === 0x0d
    ) {
      this._IsLittleEndian = false;
    }

    // Kick off async font loads. Both Init() methods install fallback
    // grids immediately so drawing code doesn't crash if the fetch
    // is still in flight.
    BitmapFont.Init();
    StrokeFont.Init();

    // Build the graphics canvas, sized to the BGI pixel dimensions.
    this._Canvas = document.createElement('canvas');
    this._Canvas.id = 'fTelnetGraphCanvas';
    // Fallback message for browsers without canvas support. Kept
    // unchanged from the original — the listed browser versions are
    // wildly out of date, but if a browser this old reaches the fallback
    // then "upgrade" is still the right advice.
    this._Canvas.innerHTML =
      'Your browser does not support the HTML5 Canvas element!<br>' +
      'The latest version of every major web browser supports this element, ' +
      'so please consider upgrading now:' +
      '<ul>' +
      '<li><a href="http://www.mozilla.com/firefox/">Mozilla Firefox</a></li>' +
      '<li><a href="http://www.google.com/chrome">Google Chrome</a></li>' +
      '<li><a href="http://www.apple.com/safari/">Apple Safari</a></li>' +
      '<li><a href="http://www.opera.com/">Opera</a></li>' +
      '<li><a href="http://windows.microsoft.com/en-US/internet-explorer/products/ie/home">' +
      'MS Internet Explorer</a></li>' +
      '</ul>';
    this._Canvas.style.position = 'absolute';
    this._Canvas.style.zIndex = '0';
    this._Canvas.width = this.PIXELS_X;
    this._Canvas.height = this.PIXELS_Y;

    // The container shrinks down to the BGI viewport size. The CRT
    // canvas sits absolutely on top of the graph canvas (transparent
    // for graphics content to show through).
    this._Container.style.width = `${this.PIXELS_X}px`;
    this._Container.style.height = `${this.PIXELS_Y}px`;
    this._Crt.Canvas.style.position = 'absolute';
    this._Crt.Transparent = true;

    // Defensive: if the canvas element doesn't support getContext at
    // all, log and continue. The CanvasContext acquire below would
    // then fail; the original had a `// TODOX return false` here that
    // never got implemented. Preserved as a console.log only.
    if (!this._Canvas.getContext) {
      // eslint-disable-next-line no-console
      console.log('fTelnet Error: Canvas not supported');
    }

    this._Container.appendChild(this._Canvas);

    const canvasContext = this._Canvas.getContext('2d');
    if (canvasContext === null) {
      // The original had a `// TODOX Handle null` here. If this fires
      // we have bigger problems; throw rather than crash later with a
      // confusing message about reading properties of undefined.
      throw new Error('Graph: could not acquire 2D canvas context');
    }
    this._CanvasContext = canvasContext;
    this._CanvasContext.font = '12pt monospace';
    this._CanvasContext.textBaseline = 'top';

    this.GraphDefaults();
  }

  // ───────────────────────────────────────────────────────────
  // Drawing primitives — arcs / circles / ellipses
  // ───────────────────────────────────────────────────────────

  /**
   * Draws a circular arc from `startAngle` to `endAngle` centered at
   * `(x, y)` with the given radius. The vertical radius is computed
   * by applying the aspect ratio.
   */
  public Arc(x: number, y: number, startAngle: number, endAngle: number, radius: number): void {
    this.Ellipse(x, y, startAngle, endAngle, radius, Math.floor(radius * this.ASPECT_RATIO));
  }

  /**
   * Draws a circle at `(x, y)` with the given radius using the current
   * line style and color.
   */
  public Circle(x: number, y: number, radius: number): void {
    this.Ellipse(x, y, 0, 360, radius, Math.floor(radius * this.ASPECT_RATIO));
  }

  /**
   * Draws (and optionally fills, via `_FillEllipse`) an elliptical arc
   * from `startAngle` to `endAngle` centered at `(x, y)` with horizontal
   * radius `xRadius` and vertical radius `yRadius`.
   *
   * Algorithm: walk 1/4 of the circumference parametrically (angles
   * 0..90 in `Delta` steps), plotting each computed point at all four
   * symmetric reflections. The four-way symmetry trick means we only
   * compute one quadrant's worth of trig.
   *
   * Thick lines are handled by recursing with `radius±1` at normal
   * thickness. Filled ellipses use the `_FillEllipse` flag to also
   * call `Bar` for each scanline as we draw.
   *
   * If `endAngle < startAngle` (the arc spans 0°), the call is split
   * into two — start..360, then 0..endAngle. Equal start/end yields
   * nothing.
   */
  public Ellipse(
    x: number,
    y: number,
    startAngle: number,
    endAngle: number,
    xRadius: number,
    yRadius: number
  ): void {
    if (startAngle === endAngle) {
      return;
    }

    const convFac = Math.PI / 180.0;

    // Normalize angles modulo 360 (kept as 361 to match the original;
    // there's no behavioral difference but `% 361` was the value used).
    startAngle = startAngle % 361;
    endAngle = endAngle % 361;

    // Split arcs that wrap past 0°.
    if (endAngle < startAngle) {
      this.Ellipse(x, y, startAngle, 360, xRadius, yRadius);
      this.Ellipse(x, y, 0, endAngle, xRadius, yRadius);
      return;
    }

    // Thick lines: draw two normal-thickness ellipses bracketing the
    // target radius, then continue with the inner one. Matches the
    // BGI behavior of "thick = three pixels wide".
    if (this._LineSettings.Thickness === LineThickness.Thick) {
      const oldLineWidth = this._LineSettings.Thickness;
      this._LineSettings.Thickness = LineThickness.Normal;

      this.Ellipse(x, y, startAngle, endAngle, xRadius + 1, yRadius + 1);
      this.Ellipse(x, y, startAngle, endAngle, xRadius, yRadius);

      this._LineSettings.Thickness = oldLineWidth;

      if (xRadius > 0 && yRadius > 0) {
        // Then the inner one — drawn with the original (possibly
        // patterned) line settings so patterned ellipses keep their
        // pattern on the innermost ring.
        xRadius--;
        yRadius--;
      } else {
        return;
      }
    }

    // Zero radii become 1 to avoid the degenerate case below.
    if (xRadius === 0) xRadius++;
    if (yRadius === 0) yRadius++;

    // Effectively-a-point ellipses get one pixel.
    if (xRadius <= 1 && yRadius <= 1) {
      this.PutPixel(x, y, this._Colour);
      return;
    }

    // Approximate pixel count from the perimeter (changed from the
    // exact formula via trial and error — the original's comment).
    const numOfPixels = Math.round(
      Math.sqrt(3) * Math.sqrt(Math.pow(xRadius, 2) + Math.pow(yRadius, 2))
    );

    const delta = 90.0 / numOfPixels;

    let j = 0;
    // Stop slightly past 90° — otherwise the last pixel can be lost.
    const deltaEnd = 91;

    let xnext = xRadius;
    let ynext = 0;

    do {
      const xtemp = xnext;
      const ytemp = ynext;

      const tempTerm = (j + delta) * convFac;

      xnext = Math.round(xRadius * Math.cos(tempTerm));
      ynext = Math.round(yRadius * Math.sin(tempTerm + Math.PI));

      const xp = x + xtemp;
      const xm = x - xtemp;
      const yp = y + ytemp;
      const ym = y - ytemp;

      // Four-way symmetry: each computed quarter-circle point gets
      // reflected through both axes for the other three quadrants.
      // The angle checks decide which reflections are actually within
      // the requested arc range.
      if (j >= startAngle && j <= endAngle) {
        this.PutPixel(xp, yp, this._Colour);
      }
      if (180 - j >= startAngle && 180 - j <= endAngle) {
        this.PutPixel(xm, yp, this._Colour);
      }
      if (j + 180 >= startAngle && j + 180 <= endAngle) {
        this.PutPixel(xm, ym, this._Colour);
      }
      if (360 - j >= startAngle && 360 - j <= endAngle) {
        this.PutPixel(xp, ym, this._Colour);
      }

      // For filled ellipses, draw vertical bars between symmetric
      // points to fill the interior. The current fill style is used,
      // which is why this lives inside Ellipse rather than being a
      // separate post-pass.
      if (this._FillEllipse) {
        this.Bar(
          Math.max(0, xm + 1),
          Math.max(0, yp + 1),
          Math.min(this.PIXELS_X - 1, xm + 1),
          Math.min(this.PIXELS_Y - 1, ym - 1)
        );
        this.Bar(
          Math.max(0, xp - 1),
          Math.max(0, yp + 1),
          Math.min(this.PIXELS_X - 1, xp - 1),
          Math.min(this.PIXELS_Y - 1, ym - 1)
        );
      }

      j = j + delta;
    } while (j <= deltaEnd);
  }

  /** Draws a filled ellipse centered at `(x, y)`. */
  public FillEllipse(x: number, y: number, xRadius: number, yRadius: number): void {
    this._FillEllipse = true;
    this.Ellipse(x, y, 0, 360, xRadius, yRadius);
    this._FillEllipse = false;
  }

  /** Draws and fills a pie slice. */
  public PieSlice(
    x: number,
    y: number,
    startAngle: number,
    endAngle: number,
    radius: number
  ): void {
    this.Sector(x, y, startAngle, endAngle, radius, Math.floor(radius * this.ASPECT_RATIO));
  }

  /**
   * Draws (and fills, via the current FillSettings) an elliptical sector.
   *
   * The original had TODOs about also drawing the two radial lines
   * from the center to the arc endpoints. Without those, this is
   * essentially just `Ellipse` with a fill. Preserved as-is.
   */
  public Sector(
    x: number,
    y: number,
    startAngle: number,
    endAngle: number,
    xRadius: number,
    yRadius: number
  ): void {
    this.Ellipse(x, y, startAngle, endAngle, xRadius, yRadius);
    // TODO: also draw the two radial lines from center to arc endpoints
    // (`GetArcCoords()` would tell us where they are). The original
    // never implemented this; preserved.
  }

  // ───────────────────────────────────────────────────────────
  // Bars, rectangles, bezier curves
  // ───────────────────────────────────────────────────────────

  /**
   * Draws a filled bar (rectangle) using the current FillSettings.
   *
   * Optimization: when the fill is solid or the fill color matches
   * the background color, we can do a single `fillRect` instead of
   * a per-pixel pattern lookup.
   */
  public Bar(x1: number, y1: number, x2: number, y2: number): void {
    // Translate to global coords if the viewport is restricted.
    if (this._ViewPortSettings.Clip && !this._ViewPortSettings.FullScreen) {
      x1 += this._ViewPortSettings.x1;
      y1 += this._ViewPortSettings.y1;
      x2 += this._ViewPortSettings.x1;
      y2 += this._ViewPortSettings.y1;

      // Entirely off-viewport → nothing to do.
      if (x1 > this._ViewPortSettings.x2 || y1 > this._ViewPortSettings.y2) {
        return;
      }
    }

    // Clamp the bottom-right corner to the viewport.
    x2 = Math.min(x2, this._ViewPortSettings.x2);
    y2 = Math.min(y2, this._ViewPortSettings.y2);

    if (
      this._FillSettings.Colour === this._BackColour ||
      this._FillSettings.Style === FillStyle.Empty ||
      this._FillSettings.Style === FillStyle.Solid
    ) {
      // No pattern lookup needed: either we'd paint with a single
      // color anyway, or empty-fill means "background everywhere".
      const colourIndex =
        this._FillSettings.Style === FillStyle.Solid ? this._FillSettings.Colour : this._BackColour;
      const colour = this.CURRENT_PALETTE[colourIndex]!;
      this._CanvasContext.fillStyle = `#${StringUtils.PadLeft(colour.toString(16), '0', 6)}`;

      // Single fillRect call. The original had a per-pixel loop
      // commented out as a "TODO Confirm that this doesn't cause
      // anti-aliasing" hedge; the fillRect version is the live path.
      this._CanvasContext.fillRect(x1, y1, x2 - x1 + 1, y2 - y1 + 1);
    } else {
      // Patterned fill: per-pixel lookup using `Pattern[y&7][x&7]`.
      const colourOn = `#${StringUtils.PadLeft(
        this.CURRENT_PALETTE[this._FillSettings.Colour]!.toString(16),
        '0',
        6
      )}`;
      // The original commented "TODO Should [0] be [this._BackColour]?"
      // here. Preserved using palette[0] to keep observable behavior.
      const colourOff = `#${StringUtils.PadLeft(
        this.CURRENT_PALETTE[0]!.toString(16),
        '0',
        6
      )}`;

      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          this._CanvasContext.fillStyle = this._FillSettings.Pattern[y & 7]![x & 7]
            ? colourOn
            : colourOff;
          this._CanvasContext.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  /**
   * Draws a cubic Bezier curve through four control points using
   * `count` line segments. Adapted from Paul Tondeur's AS3 code.
   */
  public Bezier(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
    count: number
  ): void {
    let lastx = x1;
    let lasty = y1;

    for (let u = 0; u <= 1; u += 1 / count) {
      const usquared = u * u;
      const ucubed = usquared * u;

      // Standard cubic Bezier formula.
      const nextx = Math.round(
        ucubed * (x4 + 3 * (x2 - x3) - x1) +
          3 * usquared * (x1 - 2 * x2 + x3) +
          3 * u * (x2 - x1) +
          x1
      );
      const nexty = Math.round(
        ucubed * (y4 + 3 * (y2 - y3) - y1) +
          3 * usquared * (y1 - 2 * y2 + y3) +
          3 * u * (y2 - y1) +
          y1
      );
      this.Line(lastx, lasty, nextx, nexty);

      lastx = nextx;
      lasty = nexty;
    }

    // Snap the final segment to the second anchor point (the loop
    // can stop short due to floating-point step accumulation).
    this.Line(lastx, lasty, x4, y4);
  }

  /**
   * Draws a rectangle outline using the current line style. Shares
   * its name with the imported `Rectangle` class; TypeScript
   * distinguishes them by context.
   */
  public Rectangle(x1: number, y1: number, x2: number, y2: number): void {
    this.Line(x1, y1, x2, y1);
    this.Line(x2, y1, x2, y2);
    this.Line(x2, y2, x1, y2);
    this.Line(x1, y2, x1, y1);
  }

  // ───────────────────────────────────────────────────────────
  // Clearing operations
  // ───────────────────────────────────────────────────────────

  /**
   * Clears the text-mode window region (the area covered by the Crt
   * canvas) by painting it with the current background color, then
   * clears the Crt screen.
   */
  public ClearTextWindow(): void {
    const left = this._Crt.Canvas.style.left;
    const top = this._Crt.Canvas.style.top;
    if (left !== null && top !== null) {
      const x1 = parseInt(left.replace('px', ''), 10);
      const x2 = x1 + this._Crt.Canvas.width - 1;
      const y1 = parseInt(top.replace('px', ''), 10);
      const y2 = y1 + this._Crt.Canvas.height - 1;

      this._CanvasContext.fillStyle = `#${StringUtils.PadLeft(
        this.CURRENT_PALETTE[this._BackColour]!.toString(16),
        '0',
        6
      )}`;
      this._CanvasContext.fillRect(x1, y1, x2 - x1 + 1, y2 - y1 + 1);

      this._Crt.ClrScr();
    }
  }

  /**
   * Clears the viewport by drawing an empty-fill Bar over the entire
   * canvas, then homes the cursor.
   */
  public ClearViewPort(): void {
    this.MoveTo(0, 0);

    // Temporarily switch to Empty fill so Bar() paints with the
    // background color regardless of the current fill style.
    const oldFillStyle = this._FillSettings.Style;
    this._FillSettings.Style = FillStyle.Empty;

    this.Bar(0, 0, this.PIXELS_X - 1, this.PIXELS_Y - 1);

    this._FillSettings.Style = oldFillStyle;
  }

  /**
   * Clears from the cursor to the end of the current line, both on
   * the graph canvas (covering the cell area with background color)
   * and on the Crt screen.
   *
   * Original noted "TODO Not tested yet". Preserved as-is.
   */
  public EraseEOL(): void {
    const left = this._Crt.Canvas.style.left;
    const top = this._Crt.Canvas.style.top;
    if (left !== null && top !== null) {
      const x1 =
        parseInt(left.replace('px', ''), 10) + (this._Crt.WhereX() - 1) * this._Crt.Font.Width;
      const x2 = x1 + this._Crt.Canvas.width - 1;
      const y1 =
        parseInt(top.replace('px', ''), 10) + (this._Crt.WhereY() - 1) * this._Crt.Font.Height;
      const y2 = y1 + this._Crt.Font.Height;

      this._CanvasContext.fillStyle = `#${StringUtils.PadLeft(
        this.CURRENT_PALETTE[this._BackColour]!.toString(16),
        '0',
        6
      )}`;
      this._CanvasContext.fillRect(x1, y1, x2 - x1 + 1, y2 - y1 + 1);

      this._Crt.ClrEol();
    }
  }

  // ───────────────────────────────────────────────────────────
  // Polygons
  // ───────────────────────────────────────────────────────────

  /**
   * Draws the outline of a polygon using the current line style.
   * Does NOT close the polygon — the caller should repeat the first
   * point as the last if a closed shape is wanted.
   */
  public DrawPoly(points: Point[]): void {
    for (let i = 1; i < points.length; i++) {
      this.Line(points[i - 1]!.x, points[i - 1]!.y, points[i]!.x, points[i]!.y);
    }
  }

  /**
   * Fills a polygon using the current fill style and color.
   *
   * Algorithm: draw the outline through `PutPixelPoly` (which records
   * each plotted pixel into `_FillPolyMap`), then for each row in the
   * polygon's bounding rect, walk left to right tracking edges and
   * fill spans between transitions from "outside" to "inside".
   *
   * The "only call PointInPoly after crossing an edge" optimization
   * was a key one for the original — naive per-pixel PointInPoly is
   * ~6× slower.
   */
  public FillPoly(points: Point[]): void {
    // Reset the pixel-map of "which pixels are part of the outline".
    this._FillPolyMap = [];
    for (let y = 0; y <= this.PIXELS_Y; y++) {
      this._FillPolyMap[y] = [];
    }

    // Redirect PutPixel to record into the map, draw the outline,
    // then restore the default plotter.
    this.PutPixel = (x, y, paletteIndex): void => this.PutPixelPoly(x, y, paletteIndex);
    this.DrawPoly(points);
    this.PutPixel = (x, y, paletteIndex): void => this.PutPixelDefault(x, y, paletteIndex);

    // Compute bounding rect.
    const bounds = new Rectangle();
    bounds.left = points[0]!.x;
    bounds.top = points[0]!.y;
    bounds.right = points[0]!.x;
    bounds.bottom = points[0]!.y;

    for (let i = 1; i < points.length; i++) {
      if (points[i]!.x < bounds.left) bounds.left = points[i]!.x;
      if (points[i]!.y < bounds.top) bounds.top = points[i]!.y;
      if (points[i]!.x > bounds.right) bounds.right = points[i]!.x;
      if (points[i]!.y > bounds.bottom) bounds.bottom = points[i]!.y;
    }

    // Clamp to canvas bounds.
    bounds.left = Math.max(bounds.left, 0);
    bounds.top = Math.max(bounds.top, 0);
    bounds.right = Math.min(bounds.right, 639);
    bounds.bottom = Math.min(bounds.bottom, 349);

    // For each row, scan left to right collecting spans of "inside
    // the polygon" pixels and filling them with Bar.
    for (let y = bounds.top; y <= bounds.bottom; y++) {
      let inPoly = false;
      let lastWasEdge = false;
      let leftPoint = -1;
      let rightPoint = -1;

      for (let x = bounds.left; x <= bounds.right; x++) {
        if (this._FillPolyMap[y]![x]) {
          // This pixel is on the outline.
          if (lastWasEdge) {
            // Adjacent edge pixels just mean we're traversing a
            // thick or horizontal edge — nothing to do.
          } else {
            // Just left an inside-span. Fill what we collected.
            if (leftPoint !== -1) {
              this.Bar(leftPoint, y, rightPoint, y);
              leftPoint = -1;
              rightPoint = -1;
            }
          }
          lastWasEdge = true;
        } else {
          // Off-outline pixel.
          if (lastWasEdge) {
            // We just crossed an edge — recompute inside/outside.
            inPoly = this.PointInPoly(x, y, points);
          }

          if (inPoly) {
            if (leftPoint === -1) {
              leftPoint = x;
              rightPoint = x;
            } else {
              rightPoint = x;
            }
          }
          lastWasEdge = false;
        }
      }
    }
  }

  /**
   * Point-in-polygon test using the ray-casting algorithm.
   *
   * The "x" prefix on the legacy variant indicates the original
   * left it around as the older implementation; this newer version
   * (without the prefix) is the one called by `FillPoly`.
   *
   * Adapted from http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
   */
  public PointInPoly(x: number, y: number, points: Point[]): boolean {
    let c = false;
    const len = points.length;
    for (let i = 0, j = len - 1; i < len; j = i++) {
      if (
        points[i]!.y > y !== points[j]!.y > y &&
        x <
          ((points[j]!.x - points[i]!.x) * (y - points[i]!.y)) / (points[j]!.y - points[i]!.y) +
            points[i]!.x
      ) {
        c = !c;
      }
    }
    return c;
  }

  /**
   * Older point-in-polygon implementation, preserved from the
   * original for compatibility. Not called from anywhere in this
   * class — kept in case external callers depend on it.
   */
  public xPointInPoly(x: number, y: number, points: Point[]): boolean {
    let j = points.length - 1;
    let oddNodes = false;

    for (let i = 0; i < points.length; i++) {
      if (
        ((points[i]!.y < y && points[j]!.y >= y) || (points[j]!.y < y && points[i]!.y >= y)) &&
        (points[i]!.x <= x || points[j]!.x <= x)
      ) {
        if (
          points[i]!.x +
            ((y - points[i]!.y) / (points[j]!.y - points[i]!.y)) *
              (points[j]!.x - points[i]!.x) <
          x
        ) {
          oddNodes = !oddNodes;
        }
      }
      j = i;
    }
    return oddNodes;
  }

  // ───────────────────────────────────────────────────────────
  // Flood fill — stack-based scanline algorithm
  // ───────────────────────────────────────────────────────────

  /**
   * Fills a bounded region using the current FillSettings.
   *
   * Algorithm: starting at `(x, y)`, scan up until hitting the border
   * color, then sweep down filling pixels and pushing left/right
   * neighbors onto a stack. The `Visited` map prevents re-walking
   * already-filled territory.
   *
   * Adapted from
   * http://www.williammalone.com/articles/html5-canvas-javascript-paint-bucket-tool/
   *
   * Endianness-aware: on little-endian machines (most current x86 /
   * ARM), we have to byte-swap the comparison colors before testing
   * pixels through a Uint32 view.
   */
  public FloodFill(x: number, y: number, border: number): void {
    // Adjust for restricted viewport, if any.
    if (this._ViewPortSettings.Clip && !this._ViewPortSettings.FullScreen) {
      x += this._ViewPortSettings.x1;
      y += this._ViewPortSettings.y1;

      if (
        x < this._ViewPortSettings.x1 ||
        x > this._ViewPortSettings.x2 ||
        y < this._ViewPortSettings.y1 ||
        y > this._ViewPortSettings.y2
      ) {
        return;
      }
    }

    // Precompute the three colors involved as 32-bit RGBA values.
    let borderColour = this.CURRENT_PALETTE[border]!;
    let colourOn = this.CURRENT_PALETTE[this._FillSettings.Colour]!;
    // The original had "TODO Should 0 be this._BackColour?" — preserved.
    let colourOff = this.CURRENT_PALETTE[0]!;

    if (this._IsLittleEndian) {
      // Reverse byte order to match the canvas's little-endian RGBA
      // representation (alpha goes in the high byte).
      const flip = (c: number): number => {
        const r = (c & 0xff0000) >> 16;
        const g = (c & 0x00ff00) >> 8;
        const b = (c & 0x0000ff) >> 0;
        return 0xff000000 + (b << 16) + (g << 8) + (r << 0);
      };
      borderColour = flip(borderColour);
      colourOn = flip(colourOn);
      colourOff = flip(colourOff);
    } else {
      // Big-endian: shift left to make room for alpha.
      borderColour = (borderColour << 8) + 0x000000ff;
      colourOn = (colourOn << 8) + 0x000000ff;
      colourOff = (colourOff << 8) + 0x000000ff;
    }

    const pixelData: ImageData = this._CanvasContext.getImageData(
      0,
      0,
      this.PIXELS_X,
      this.PIXELS_Y
    );
    const pixels = new Uint32Array(pixelData.data.buffer);

    // Skip work if the starting pixel is already the border color.
    if (pixels[x + y * this.PIXELS_X] === borderColour) {
      return;
    }

    const visited: boolean[] = [];

    // Stack-based scanline flood. Each entry is [x, y] to start a new
    // vertical fill from.
    const pixelStack: Array<[number, number]> = [[x, y]];
    while (pixelStack.length > 0) {
      const newPos = pixelStack.pop()!;
      const sx = newPos[0];
      let sy = newPos[1];

      // Walk up until hitting the border or the top of the viewport.
      let pixelPos = sy * this.PIXELS_X + sx;
      while (sy-- >= this._ViewPortSettings.y1 && pixels[pixelPos] !== borderColour) {
        pixelPos -= this.PIXELS_X;
      }
      pixelPos += this.PIXELS_X;
      ++sy;

      let reachLeft = false;
      let reachRight = false;

      // Walk down filling. Each step checks left and right neighbors
      // and pushes them as new starting points when appropriate.
      while (sy++ < this._ViewPortSettings.y2 - 1 && pixels[pixelPos] !== borderColour) {
        pixels[pixelPos] = this._FillSettings.Pattern[sy & 7]![sx & 7] ? colourOn : colourOff;
        visited[pixelPos] = true;

        if (sx > this._ViewPortSettings.x1 && !visited[pixelPos - 1]) {
          if (pixels[pixelPos - 1] !== borderColour) {
            if (!reachLeft) {
              pixelStack.push([sx - 1, sy]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }

        if (sx < this._ViewPortSettings.x2 - 1 && !visited[pixelPos + 1]) {
          if (pixels[pixelPos + 1] !== borderColour) {
            if (!reachRight) {
              pixelStack.push([sx + 1, sy]);
              reachRight = true;
            }
          } else if (reachRight) {
            reachRight = false;
          }
        }

        pixelPos += this.PIXELS_X;
      }
    }

    this._CanvasContext.putImageData(pixelData, 0, 0);
  }

  // ───────────────────────────────────────────────────────────
  // Image operations
  // ───────────────────────────────────────────────────────────

  /** Returns an ImageData snapshot of the given region. */
  public GetImage(x1: number, y1: number, x2: number, y2: number): ImageData {
    return this._CanvasContext.getImageData(x1, y1, x2 - x1 + 1, y2 - y1 + 1);
  }

  /**
   * Puts an ImageData onto the canvas at `(x, y)`.
   *
   * Only `WriteMode.Copy` is supported; the original noted this with
   * a TODO and silently coerced other modes. Preserved.
   */
  public PutImage(x: number, y: number, bitmap: ImageData, bitBlt: number): void {
    if (x < 0 || y < 0 || x >= this.PIXELS_X || y >= this.PIXELS_Y) {
      return;
    }

    if (bitBlt !== WriteMode.Copy) {
      // TODO: PutImage only supports COPY mode. Other modes would
      // need per-pixel composition.
      bitBlt = WriteMode.Copy;
    }

    if (bitmap !== undefined) {
      this._CanvasContext.putImageData(bitmap, x, y);
    }
  }

  /**
   * Inverts each pixel's RGB channels in the given region.
   *
   * Original had TODOs about endian handling and "needs testing".
   * Preserved with the same caveats.
   */
  public Invert(x1: number, y1: number, x2: number, y2: number): void {
    if (this._ViewPortSettings.Clip && !this._ViewPortSettings.FullScreen) {
      x1 += this._ViewPortSettings.x1;
      y1 += this._ViewPortSettings.y1;
      x2 += this._ViewPortSettings.x1;
      y2 += this._ViewPortSettings.y1;

      if (x1 > this._ViewPortSettings.x2 || y1 > this._ViewPortSettings.y2) {
        return;
      }

      x2 = Math.min(x2, this._ViewPortSettings.x2);
      y2 = Math.min(y2, this._ViewPortSettings.y2);
    }

    const pixelData: ImageData = this._CanvasContext.getImageData(
      0,
      0,
      this.PIXELS_X,
      this.PIXELS_Y
    );
    const pixels = pixelData.data;

    for (let y = y1; y <= y2; y++) {
      const rowStart = y * this.PIXELS_X * 4;
      for (let i = rowStart + x1 * 4, n = rowStart + x2 * 4; i <= n; i += 4) {
        pixels[i]! = 255 - pixels[i]!;     // red
        pixels[i + 1]! = 255 - pixels[i + 1]!; // green
        pixels[i + 2]! = 255 - pixels[i + 2]!; // blue
        // i+3 is alpha — left alone.
      }
    }

    this._CanvasContext.putImageData(pixelData, 0, 0);
  }

  // ───────────────────────────────────────────────────────────
  // Line drawing — primary implementation
  // ───────────────────────────────────────────────────────────

  /**
   * Horizontal line helper. Both endpoints are normalized so `x <= x2`.
   */
  private HLine(x: number, x2: number, y: number): void {
    if (x >= x2) {
      const tmp = x2;
      x2 = x;
      x = tmp;
    }
    for (; x <= x2; x++) {
      this.PutPixel(x, y, this._Colour);
    }
  }

  /**
   * Vertical line helper. Both endpoints are normalized so `y <= y2`.
   */
  private VLine(x: number, y: number, y2: number): void {
    if (y >= y2) {
      const tmp = y2;
      y2 = y;
      y = tmp;
    }
    for (; y <= y2; y++) {
      this.PutPixel(x, y, this._Colour);
    }
  }

  /**
   * Draws a line using the current line style and color.
   *
   * The implementation handles four cases:
   *   1. Solid horizontal (delegate to HLine, with thickness ±1 rows)
   *   2. Solid vertical (delegate to VLine, with thickness ±1 cols)
   *   3. Solid sloped (Bresenham)
   *   4. Patterned (apply the 16-bit pattern mask along the line)
   *
   * The Bresenham implementation in case 3 is a direct port of the
   * Turbo Pascal BGI source — the `/*{ }* /` block comments are kept
   * to mark the original section boundaries. The bit-shift operations
   * (`<< 1`) and the dual-direction increments (`dinc1`/`dinc2`) are
   * the classic BGI optimization for avoiding multiplication in the
   * inner loop.
   */
  public Line(x1: number, y1: number, x2: number, y2: number): void {
    if (this._LineSettings.Style === LineStyle.Solid) {
      // Separate normal- vs thick-line branches for speed AND because
      // the BGI compatibility note "would not be 100% compatible with
      // the TP graph unit otherwise" — preserved.
      if (y1 === y2) {
        // Solid horizontal
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          this.HLine(x1, x2, y2);
        } else {
          this.HLine(x1, x2, y2 - 1);
          this.HLine(x1, x2, y2);
          this.HLine(x2, x2, y2 + 1); // (Bug? Original draws just one cell here.)
        }
      } else if (x1 === x2) {
        // Solid vertical
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          this.VLine(x1, y1, y2);
        } else {
          this.VLine(x1 - 1, y1, y2);
          this.VLine(x1, y1, y2);
          this.VLine(x1 + 1, y1, y2);
        }
      } else {
        // Solid sloped line (Bresenham).
        const deltax = Math.abs(x2 - x1);
        const deltay = Math.abs(y2 - y1);

        let numpixels: number;
        let d: number;
        let dinc1: number;
        let dinc2: number;
        let xinc1: number;
        let xinc2: number;
        let yinc1: number;
        let yinc2: number;
        let flag: boolean;

        if (deltax >= deltay) {
          flag = false;
          // x is independent variable
          numpixels = deltax + 1;
          d = 2 * deltay - deltax;
          dinc1 = deltay << 1;
          dinc2 = (deltay - deltax) << 1;
          xinc1 = 1;
          xinc2 = 1;
          yinc1 = 0;
          yinc2 = 1;
        } else {
          flag = true;
          // y is independent variable
          numpixels = deltay + 1;
          d = 2 * deltax - deltay;
          dinc1 = deltax << 1;
          dinc2 = (deltax - deltay) << 1;
          xinc1 = 0;
          xinc2 = 1;
          yinc1 = 1;
          yinc2 = 1;
        }

        // Direction handling.
        if (x1 > x2) {
          xinc1 = -xinc1;
          xinc2 = -xinc2;
        }
        if (y1 > y2) {
          yinc1 = -yinc1;
          yinc2 = -yinc2;
        }

        let x = x1;
        let y = y1;

        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let i = 1; i <= numpixels; i++) {
            this.PutPixel(x, y, this._Colour);
            if (d < 0) {
              d = d + dinc1;
              x = x + xinc1;
              y = y + yinc1;
            } else {
              d = d + dinc2;
              x = x + xinc2;
              y = y + yinc2;
            }
          }
        } else {
          // Thick lines: plot three pixels per step. The "flag" branch
          // decides whether the extra pixels go above/below or
          // left/right based on which axis is the dominant one.
          for (let i = 1; i <= numpixels; i++) {
            if (flag) {
              this.PutPixel(x - 1, y, this._Colour);
              this.PutPixel(x, y, this._Colour);
              this.PutPixel(x + 1, y, this._Colour);
            } else {
              this.PutPixel(x, y - 1, this._Colour);
              this.PutPixel(x, y, this._Colour);
              this.PutPixel(x, y + 1, this._Colour);
            }

            if (d < 0) {
              d = d + dinc1;
              x = x + xinc1;
              y = y + yinc1;
            } else {
              d = d + dinc2;
              x = x + xinc2;
              y = y + yinc2;
            }
          }
        }
      }
    } else {
      // Patterned lines: same algorithm as solid, but each pixel is
      // gated by the corresponding bit in the 16-bit pattern. The
      // bit index is `pixelcount % 16`, computed as `& 15`.
      if (y1 === y2) {
        if (x1 >= x2) {
          const tmp = x1;
          x1 = x2;
          x2 = tmp;
        }
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let pixelcount = x1; pixelcount <= x2; pixelcount++) {
            if ((this._LineSettings.Pattern & (1 << (pixelcount & 15))) !== 0) {
              this.PutPixel(pixelcount, y2, this._Colour);
            }
          }
        } else {
          for (let i = -1; i <= 1; i++) {
            for (let pixelcount = x1; pixelcount <= x2; pixelcount++) {
              if ((this._LineSettings.Pattern & (1 << (pixelcount & 15))) !== 0) {
                this.PutPixel(pixelcount, y2 + i, this._Colour);
              }
            }
          }
        }
      } else if (x1 === x2) {
        if (y1 >= y2) {
          const tmp = y1;
          y1 = y2;
          y2 = tmp;
        }
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let pixelcount = y1; pixelcount <= y2; pixelcount++) {
            if ((this._LineSettings.Pattern & (1 << (pixelcount & 15))) !== 0) {
              this.PutPixel(x2, pixelcount, this._Colour);
            }
          }
        } else {
          for (let i = -1; i <= 1; i++) {
            for (let pixelcount = y1; pixelcount <= y2; pixelcount++) {
              if ((this._LineSettings.Pattern & (1 << (pixelcount & 15))) !== 0) {
                this.PutPixel(x2 + i, pixelcount, this._Colour);
              }
            }
          }
        }
      } else {
        // Patterned sloped lines: Bresenham + pattern gating.
        const deltax = Math.abs(x2 - x1);
        const deltay = Math.abs(y2 - y1);

        let numpixels: number;
        let d: number;
        let dinc1: number;
        let dinc2: number;
        let xinc1: number;
        let xinc2: number;
        let yinc1: number;
        let yinc2: number;
        let flag: boolean;

        if (deltax >= deltay) {
          flag = false;
          numpixels = deltax + 1;
          d = 2 * deltay - deltax;
          dinc1 = deltay << 1;
          dinc2 = (deltay - deltax) << 1;
          xinc1 = 1;
          xinc2 = 1;
          yinc1 = 0;
          yinc2 = 1;
        } else {
          flag = true;
          numpixels = deltay + 1;
          d = 2 * deltax - deltay;
          dinc1 = deltax << 1;
          dinc2 = (deltax - deltay) << 1;
          xinc1 = 0;
          xinc2 = 1;
          yinc1 = 1;
          yinc2 = 1;
        }

        if (x1 > x2) {
          xinc1 = -xinc1;
          xinc2 = -xinc2;
        }
        if (y1 > y2) {
          yinc1 = -yinc1;
          yinc2 = -yinc2;
        }

        let x = x1;
        let y = y1;
        let pixelcount = 0;
        let tmpnumpixels = numpixels;

        if (this._LineSettings.Thickness === LineThickness.Normal) {
          while (tmpnumpixels-- > 0) {
            if ((this._LineSettings.Pattern & (1 << (pixelcount++ & 15))) !== 0) {
              this.PutPixel(x, y, this._Colour);
            }
            if (d < 0) {
              d = d + dinc1;
              x = x + xinc1;
              y = y + yinc1;
            } else {
              d = d + dinc2;
              x = x + xinc2;
              y = y + yinc2;
            }
          }
        } else {
          while (tmpnumpixels-- > 0) {
            if ((this._LineSettings.Pattern & (1 << (pixelcount++ & 15))) !== 0) {
              if (flag) {
                this.PutPixel(x - 1, y, this._Colour);
                this.PutPixel(x, y, this._Colour);
                this.PutPixel(x + 1, y, this._Colour);
              } else {
                this.PutPixel(x, y - 1, this._Colour);
                this.PutPixel(x, y, this._Colour);
                this.PutPixel(x, y + 1, this._Colour);
              }
            }
            if (d < 0) {
              d = d + dinc1;
              x = x + xinc1;
              y = y + yinc1;
            } else {
              d = d + dinc2;
              x = x + xinc2;
              y = y + yinc2;
            }
          }
        }
      }
    }
  }

  /**
   * Alternative line implementation — variant used by RIPscrip for
   * some primitives. Doesn't support XOR write mode (silently
   * downgrades), and uses a different slope handling for solid lines.
   *
   * Preserved from the original because RIPscrip command paths
   * specifically call this variant rather than `Line`. Removing it
   * could change observable rendering behavior for certain BBS
   * graphics.
   *
   * The "y" prefix on the name appears to indicate it was the
   * predecessor to `Line` proper — neither was named consistently.
   */
  public yLine(x0: number, y0: number, x1: number, y1: number): void {
    if (this._WriteMode === WriteMode.XOR) {
      // TODO: yLine doesn't support XOR write mode. Silent downgrade.
    }

    if (this._LineSettings.Style === LineStyle.Solid) {
      const dx = x1 - x0;
      // Vertical case
      if (dx === 0) {
        const start = Math.min(y0, y1);
        const end = Math.max(y0, y1);
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let y = start; y <= end; y++) {
            this.PutPixel(x0, y, this._Colour);
          }
        } else {
          const x0minus = x0 - 1;
          const x0plus = x0 + 1;
          for (let y = start; y <= end; y++) {
            this.PutPixel(x0minus, y, this._Colour);
            this.PutPixel(x0, y, this._Colour);
            this.PutPixel(x0plus, y, this._Colour);
          }
        }
        return;
      }

      const dy = y1 - y0;
      if (dy === 0) {
        // Horizontal
        const start = Math.min(x0, x1);
        const end = Math.max(x0, x1);
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let x = start; x <= end; x++) {
            this.PutPixel(x, y0, this._Colour);
          }
        } else {
          const y0minus = y0 - 1;
          const y0plus = y0 + 1;
          for (let x = start; x <= end; x++) {
            this.PutPixel(x, y0minus, this._Colour);
            this.PutPixel(x, y0, this._Colour);
            this.PutPixel(x, y0plus, this._Colour);
          }
        }
        return;
      }

      // Sloped: use y = m*x + b, walking the dominant axis.
      const m = dy / dx;
      const b = y0 - m * x0;

      if (Math.abs(dy) > Math.abs(dx)) {
        const start = Math.min(y0, y1);
        const end = Math.max(y0, y1);
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let y = start; y <= end; y++) {
            const x = Math.round((y - b) / m);
            this.PutPixel(x, y, this._Colour);
          }
        } else {
          for (let y = start; y <= end; y++) {
            const x = Math.round((y - b) / m);
            this.PutPixel(x - 1, y, this._Colour);
            this.PutPixel(x, y, this._Colour);
            this.PutPixel(x + 1, y, this._Colour);
          }
        }
      } else {
        const start = Math.min(x0, x1);
        const end = Math.max(x0, x1);
        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let x = start; x <= end; x++) {
            const y = Math.round(m * x + b);
            this.PutPixel(x, y, this._Colour);
          }
        } else {
          for (let x = start; x <= end; x++) {
            const y = Math.round(m * x + b);
            this.PutPixel(x, y - 1, this._Colour);
            this.PutPixel(x, y, this._Colour);
            this.PutPixel(x, y + 1, this._Colour);
          }
        }
      }
    }
  }

  /**
   * Third line implementation. Forces solid line style, doesn't
   * support XOR, and uses a simpler integer-arithmetic walk than
   * `Line`. Preserved for RIPscrip command compatibility.
   */
  public xLine(x1: number, y1: number, x2: number, y2: number): void {
    if (this._LineSettings.Style !== LineStyle.Solid) {
      // TODO: xLine only supports solid line types. Silent downgrade.
      this._LineSettings.Style = LineStyle.Solid;
      this._LineSettings.Pattern = 0xffff;
    }
    if (this._WriteMode === WriteMode.XOR) {
      // TODO: xLine doesn't support XOR. Silent downgrade.
    }

    if (this._LineSettings.Style === LineStyle.Solid) {
      if (x1 === x2) {
        // Vertical solid
        const yStart = Math.min(y1, y2);
        const yEnd = Math.max(y1, y2);

        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let y = yStart; y <= yEnd; y++) {
            this.PutPixel(x1, y, this._Colour);
          }
        } else {
          const x1minus = x1 - 1;
          const x1plus = x1 + 1;
          for (let y = yStart; y <= yEnd; y++) {
            this.PutPixel(x1minus, y, this._Colour);
            this.PutPixel(x1, y, this._Colour);
            this.PutPixel(x1plus, y, this._Colour);
          }
        }
      } else if (y1 === y2) {
        // Horizontal solid
        const xStart = Math.min(x1, x2);
        const xEnd = Math.max(x1, x2);

        if (this._LineSettings.Thickness === LineThickness.Normal) {
          for (let x = xStart; x <= xEnd; x++) {
            this.PutPixel(x, y1, this._Colour);
          }
        } else {
          const y1minus = y1 - 1;
          const y1plus = y1 + 1;
          for (let x = xStart; x <= xEnd; x++) {
            this.PutPixel(x, y1minus, this._Colour);
            this.PutPixel(x, y1, this._Colour);
            this.PutPixel(x, y1plus, this._Colour);
          }
        }
      } else {
        // Sloped solid: variant of Bresenham, walking the dominant axis.
        if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
          // X-dominant
          const m = (y2 - y1) / (x2 - x1);
          const b = y1 - m * x1;
          const xStart = Math.min(x1, x2);
          const xEnd = Math.max(x1, x2);

          if (this._LineSettings.Thickness === LineThickness.Normal) {
            for (let x = xStart; x <= xEnd; x++) {
              const y = Math.round(m * x + b);
              this.PutPixel(x, y, this._Colour);
            }
          } else {
            for (let x = xStart; x <= xEnd; x++) {
              const y = Math.round(m * x + b);
              this.PutPixel(x, y - 1, this._Colour);
              this.PutPixel(x, y, this._Colour);
              this.PutPixel(x, y + 1, this._Colour);
            }
          }
        } else {
          // Y-dominant
          const m = (x2 - x1) / (y2 - y1);
          const b = x1 - m * y1;
          const yStart = Math.min(y1, y2);
          const yEnd = Math.max(y1, y2);

          if (this._LineSettings.Thickness === LineThickness.Normal) {
            for (let y = yStart; y <= yEnd; y++) {
              const x = Math.round(m * y + b);
              this.PutPixel(x, y, this._Colour);
            }
          } else {
            for (let y = yStart; y <= yEnd; y++) {
              const x = Math.round(m * y + b);
              this.PutPixel(x - 1, y, this._Colour);
              this.PutPixel(x, y, this._Colour);
              this.PutPixel(x + 1, y, this._Colour);
            }
          }
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────
  // Pixel plotting
  // ───────────────────────────────────────────────────────────

  /**
   * Default pixel plotter — checks bounds, applies viewport, and
   * draws via `fillRect` with the palette-mapped color.
   */
  public PutPixelDefault(x: number, y: number, paletteIndex: number): void {
    if (x < 0 || y < 0 || x >= this.PIXELS_X || y >= this.PIXELS_Y) {
      return;
    }

    if (this._ViewPortSettings.Clip && !this._ViewPortSettings.FullScreen) {
      x += this._ViewPortSettings.x1;
      y += this._ViewPortSettings.y1;
      if (x > this._ViewPortSettings.x2) return;
      if (y > this._ViewPortSettings.y2) return;
    }

    const pos = x + y * this.PIXELS_X;
    if (pos >= 0 && pos < this.PIXELS) {
      this._CanvasContext.fillStyle = `#${StringUtils.PadLeft(
        this.CURRENT_PALETTE[paletteIndex]!.toString(16),
        '0',
        6
      )}`;
      this._CanvasContext.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Pixel plotter used during `FillPoly` outline drawing — records
   * the pre-viewport pixel coordinates into `_FillPolyMap` so the
   * scanline filler can find them later.
   */
  public PutPixelPoly(x: number, y: number, paletteIndex: number): void {
    // Same bounds check as PutPixelDefault, repeated here because the
    // _FillPolyMap write below would crash on out-of-range coords.
    if (x < 0 || y < 0 || x >= this.PIXELS_X || y >= this.PIXELS_Y) {
      return;
    }

    this.PutPixelDefault(x, y, paletteIndex);

    // Record (without viewport adjustment — FillPoly reasons in
    // un-translated coordinates).
    this._FillPolyMap[y]![x] = true;
  }

  // ───────────────────────────────────────────────────────────
  // Text rendering
  // ───────────────────────────────────────────────────────────

  /** Moves the cursor (used by `OutText`) to `(x, y)`. */
  public MoveTo(x: number, y: number): void {
    this._CursorPosition.x = x;
    this._CursorPosition.y = y;
  }

  /**
   * Writes text at the current cursor position. After writing,
   * advances the cursor horizontally if the text direction and
   * alignment allow it.
   */
  public OutText(text: string): void {
    this.OutTextXY(this._CursorPosition.x, this._CursorPosition.y, text);
    if (
      this._TextSettings.Direction === TextOrientation.Horizontal &&
      this._TextSettings.HorizontalAlign === TextJustification.Left
    ) {
      this._CursorPosition.x += this.TextWidth(text);
      if (this._CursorPosition.x > 639) {
        this._CursorPosition.x = 639;
      }
    }
  }

  /**
   * Writes text at the given absolute position.
   *
   * Two rendering paths:
   *   - `Font = 0` → bitmap font: per-character 8×8 grid lookup
   *     into `BitmapFont.Pixels`. Supports horizontal and vertical
   *     orientation, and integer size scaling.
   *   - `Font 1..10` → stroke fonts: each character is a series of
   *     `MOVE` and `DRAW` commands at scaled (x, y) offsets, drawn
   *     via `Line`.
   *
   * The line settings are temporarily forced to solid/thin during
   * stroke text rendering so the stroke font characters render
   * correctly regardless of the caller's line state. Original
   * settings are restored on exit.
   *
   * The vertical-text bitmap branch is unimplemented in the original
   * ("TODO Vertical Normal Size" / "TODO Vertical Scaled Size").
   * Preserved unchanged.
   */
  public OutTextXY(x: number, y: number, text: string): void {
    const oldLinePattern = this._LineSettings.Pattern;
    const oldLineStyle = this._LineSettings.Style;
    const oldLineThickness = this._LineSettings.Thickness;

    this._LineSettings.Pattern = 0xffff;
    this._LineSettings.Style = LineStyle.Solid;
    this._LineSettings.Thickness = LineThickness.Normal;

    if (this._TextSettings.Font === 0) {
      // Bitmap font rendering.
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);

        if (this._TextSettings.Direction === TextOrientation.Vertical) {
          // TODO: vertical bitmap text was not implemented in the
          // original. Preserved as a no-op aside from cursor
          // advancement so the cursor still moves correctly.
          y -= 8 * this._TextSettings.Size;
        } else if (this._TextSettings.Size === 1) {
          // Horizontal at size 1: direct pixel-for-pixel copy.
          for (let py = 0; py < 8; py++) {
            for (let px = 0; px < 8; px++) {
              if (BitmapFont.Pixels[code]![py]![px] !== 0) {
                this.PutPixel(x + px, y + py, this._Colour);
              }
            }
          }
          x += 8 * this._TextSettings.Size;
        } else {
          // Horizontal scaled: replicate each pixel into a Size×Size block.
          let yy = 0;
          let cnt3 = 0;
          while (yy <= 7) {
            for (let cnt4 = 0; cnt4 < this._TextSettings.Size; cnt4++) {
              let xx = 0;
              let cnt2 = 0;
              while (xx <= 7) {
                for (let cnt1 = 0; cnt1 < this._TextSettings.Size; cnt1++) {
                  if (BitmapFont.Pixels[code]![yy]![xx] !== 0) {
                    this.PutPixel(x + cnt1 + cnt2, y + cnt3 + cnt4, this._Colour);
                  }
                }
                xx++;
                cnt2 += this._TextSettings.Size;
              }
            }
            yy++;
            cnt3 += this._TextSettings.Size;
          }
          x += 8 * this._TextSettings.Size;
        }
      }
    } else {
      // Stroke font rendering.
      //
      // `StrokeFont.Strokes[font-1][char]` is a packed array:
      //   [0]    = character advance width
      //   [1..n] = drawing commands, each `[opcode, x, y]`
      //
      // We cast through `unknown` because StrokeFont declares the
      // strokes as `unknown[][][]` (the data is heterogeneous in
      // shape). Casting to the specific tuple shape used here.
      for (let i = 0; i < text.length; i++) {
        const lastPoint = new Point(x, y);
        const nextPoint = new Point(x, y);

        // Index into the stroke table for this font and char.
        const strokes = StrokeFont.Strokes[this._TextSettings.Font - 1]![
          text.charCodeAt(i)
        ]! as Array<number | [number, number, number]>;
        const len = strokes.length;

        for (let j = 1; j < len; j++) {
          const cmd = strokes[j] as [number, number, number];

          if (this._TextSettings.Direction === TextOrientation.Vertical) {
            // TODO original questioned "Is this right to flip Y and X?"
            // Preserved unchanged.
            nextPoint.x = x + Math.floor(cmd[2] * this._TextSettings.StrokeScaleY);
            nextPoint.y = y - Math.floor(cmd[1] * this._TextSettings.StrokeScaleX);
          } else {
            nextPoint.x = x + Math.floor(cmd[1] * this._TextSettings.StrokeScaleX);
            nextPoint.y = y + Math.floor(cmd[2] * this._TextSettings.StrokeScaleY);
          }

          if (cmd[0] === StrokeFont.DRAW) {
            this.Line(lastPoint.x, lastPoint.y, nextPoint.x, nextPoint.y);
          }

          lastPoint.x = nextPoint.x;
          lastPoint.y = nextPoint.y;
        }

        // Advance the cursor by the character's recorded width.
        const advance = strokes[0] as number;
        if (this._TextSettings.Direction === TextOrientation.Vertical) {
          // TODO original questioned "right to use X here and not Y?"
          // Preserved.
          y -= Math.floor(advance * this._TextSettings.StrokeScaleX);
        } else {
          x += Math.floor(advance * this._TextSettings.StrokeScaleX);
        }
      }
    }

    // Restore line settings.
    this._LineSettings.Pattern = oldLinePattern;
    this._LineSettings.Style = oldLineStyle;
    this._LineSettings.Thickness = oldLineThickness;
  }

  /**
   * Returns the height of `text` in pixels at the current text
   * style. The text parameter is consulted only for stroke fonts
   * (where char-specific stroke data could matter); in this
   * implementation, all chars in a font share a baseline height,
   * so the input is effectively ignored. Preserved for API parity.
   */
  public TextHeight(_text: string): number {
    if (this._TextSettings.Font === 0) {
      return this._TextSettings.Size * 8;
    }
    return StrokeFont.Heights[this._TextSettings.Font - 1]! * this._TextSettings.StrokeScaleY;
  }

  /**
   * Returns the width of `text` in pixels at the current text style.
   * Bitmap-font text is fixed-width (8 px per char × Size); stroke
   * text sums per-character advance widths from the stroke data.
   */
  public TextWidth(text: string): number {
    const length = text.length;

    if (this._TextSettings.Font === 0) {
      return length * (this._TextSettings.Size * 8);
    }

    let result = 0;
    for (let i = 0; i < length; i++) {
      const strokes = StrokeFont.Strokes[this._TextSettings.Font - 1]![
        text.charCodeAt(i)
      ]! as Array<number>;
      result += Math.floor(strokes[0]! * this._TextSettings.StrokeScaleX);
    }
    return result;
  }

  // ───────────────────────────────────────────────────────────
  // State getters / setters
  // ───────────────────────────────────────────────────────────

  public get Canvas(): HTMLCanvasElement {
    return this._Canvas;
  }

  /** Returns the current draw color (0-15). */
  public GetColour(): number {
    return this._Colour;
  }

  /** Returns the current FillSettings. */
  public GetFillSettings(): FillSettings {
    return this._FillSettings;
  }

  /**
   * Resets the graphics system to BGI defaults: solid white-on-black
   * line/fill, full-screen viewport, default 16-color palette,
   * top-left text origin, 8x8 bitmap font.
   */
  public GraphDefaults(): void {
    this.SetLineStyle(LineStyle.Solid, 0xffff, LineThickness.Normal);
    this.SetFillStyle(FillStyle.Solid, 15);
    this.SetColour(15);
    this.SetBkColour(0);

    // Update palette but don't repaint — the viewport will be cleared
    // immediately after, which obviates the repaint.
    this.SetAllPalette([0, 1, 2, 3, 4, 5, 20, 7, 56, 57, 58, 59, 60, 61, 62, 63], false);
    this.SetViewPort(0, 0, this.PIXELS_X - 1, this.PIXELS_Y - 1, true);
    this.ClearViewPort();

    this.MoveTo(0, 0);
    this.SetWriteMode(WriteMode.Copy);
    this.SetTextStyle(0, TextOrientation.Horizontal, 1);
    this.SetTextJustify(TextJustification.Left, TextJustification.Top);
  }

  /** Sets all 16 palette entries by walking through SetPalette. */
  public SetAllPalette(palette: number[], updateScreen = true): void {
    for (let i = 0; i < palette.length; i++) {
      this.SetPalette(i, palette[i]!, updateScreen);
    }
  }

  /** Sets the current background color (0-15). */
  public SetBkColour(colour: number): void {
    this._BackColour = colour;
  }

  /** Sets the current draw color (0-15). Out-of-range values are ignored. */
  public SetColour(colour: number): void {
    if (colour < 0 || colour > 15) {
      // TODO trace invalid colour. Preserved as a silent ignore.
      return;
    }
    this._Colour = colour;
  }

  /**
   * Selects a user-defined 8x8 fill pattern. The pattern is passed
   * as 8 bytes, each representing one row, MSB first.
   */
  public SetFillPattern(pattern: number[], colour: number): void {
    const andArray = [128, 64, 32, 16, 8, 4, 2, 1];

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        this._FillSettings.Pattern[y]![x] = (pattern[y]! & andArray[x]!) !== 0;
      }
    }

    if (colour < 0 || colour > 15) {
      // TODO trace invalid fill colour. Preserved as silent ignore.
    } else {
      this._FillSettings.Colour = colour;
    }
    this._FillSettings.Style = FillStyle.User;
  }

  /** Replaces the entire FillSettings object. */
  public SetFillSettings(fillSettings: FillSettings): void {
    this._FillSettings = fillSettings;
  }

  /**
   * Sets the fill pattern and color by enum-named pattern. The
   * patterns are hard-coded 8-byte sequences matching the BGI
   * standard patterns. The original noted "TODO Test each of the
   * fill patterns to ensure they match" — preserved unchanged.
   */
  public SetFillStyle(style: number, colour: number): void {
    switch (style) {
      case 0: this.SetFillPattern([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], colour); break;
      case 1: this.SetFillPattern([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], colour); break;
      case 2: this.SetFillPattern([0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00], colour); break;
      case 3: this.SetFillPattern([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80], colour); break;
      case 4: this.SetFillPattern([0x07, 0x0e, 0x1c, 0x38, 0x70, 0xe0, 0xc1, 0x83], colour); break;
      case 5: this.SetFillPattern([0x07, 0x83, 0xc1, 0xe0, 0x70, 0x38, 0x1c, 0x0e], colour); break;
      case 6: this.SetFillPattern([0x5a, 0x2d, 0x96, 0x4b, 0xa5, 0xd2, 0x69, 0xb4], colour); break;
      case 7: this.SetFillPattern([0xff, 0x88, 0x88, 0x88, 0xff, 0x88, 0x88, 0x88], colour); break;
      case 8: this.SetFillPattern([0x18, 0x24, 0x42, 0x81, 0x81, 0x42, 0x24, 0x18], colour); break;
      case 9: this.SetFillPattern([0xcc, 0x33, 0xcc, 0x33, 0xcc, 0x33, 0xcc, 0x33], colour); break;
      case 10: this.SetFillPattern([0x80, 0x00, 0x08, 0x00, 0x80, 0x00, 0x08, 0x00], colour); break;
      case 11: this.SetFillPattern([0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00], colour); break;
      default:
        // For style 12 (User) or out-of-range values, leave the
        // pattern untouched and just set the style/color.
        break;
    }
    if (colour < 0 || colour > 15) {
      // TODO trace invalid fill colour. Preserved as silent ignore.
    } else {
      this._FillSettings.Colour = colour;
    }
    this._FillSettings.Style = style;
  }

  /**
   * Sets the line style/pattern/thickness. The 16-bit pattern is
   * only used when `style === User` — built-in styles map to fixed
   * patterns (Solid: 0xFFFF, Dotted: 0x3333, etc.).
   */
  public SetLineStyle(style: number, pattern: number, thickness: number): void {
    this._LineSettings.Style = style;
    switch (style) {
      case 0: this._LineSettings.Pattern = 0xffff; break;
      case 1: this._LineSettings.Pattern = 0x3333; break;
      case 2: this._LineSettings.Pattern = 0x1e3f; break;
      case 3: this._LineSettings.Pattern = 0x1f1f; break;
      case 4: this._LineSettings.Pattern = pattern; break;
      default: break;
    }
    this._LineSettings.Thickness = thickness;
  }

  /**
   * Changes one palette slot, optionally repainting the screen to
   * reflect the new color (every existing pixel matching the old
   * palette entry is replaced with the new one).
   */
  public SetPalette(
    currentPaletteIndex: number,
    egaPaletteIndex: number,
    updateScreen = true
  ): void {
    if (this.CURRENT_PALETTE[currentPaletteIndex] === Graph.EGA_PALETTE[egaPaletteIndex]) {
      // No change → nothing to do.
      return;
    }

    if (updateScreen) {
      // Repaint: find every pixel matching the OLD palette color and
      // replace it with the new one. Endian-aware byte swizzling
      // because the canvas image data is little-endian RGBA.
      const flip = (c: number): number => {
        const r = (c & 0xff0000) >> 16;
        const g = (c & 0x00ff00) >> 8;
        const b = (c & 0x0000ff) >> 0;
        return 0xff000000 + (b << 16) + (g << 8) + (r << 0);
      };

      const oldColour = flip(this.CURRENT_PALETTE[currentPaletteIndex]!);
      const newColour = flip(Graph.EGA_PALETTE[egaPaletteIndex]!);

      const pixelData: ImageData = this._CanvasContext.getImageData(
        0,
        0,
        this.PIXELS_X,
        this.PIXELS_Y
      );
      const pixels = new Uint32Array(pixelData.data.buffer);

      for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] === oldColour) {
          pixels[i] = newColour;
        }
      }

      this._CanvasContext.putImageData(pixelData, 0, 0);
    }

    this.CURRENT_PALETTE[currentPaletteIndex] = Graph.EGA_PALETTE[egaPaletteIndex]!;
  }

  /** Sets text justification (horizontal × vertical). */
  public SetTextJustify(horizontal: number, vertical: number): void {
    this._TextSettings.HorizontalAlign = horizontal;
    this._TextSettings.VerticalAlign = vertical;
  }

  /** Sets the current text font, direction, and size. */
  public SetTextStyle(font: number, direction: number, size: number): void {
    this._TextSettings.Font = font;
    this._TextSettings.Direction = direction;
    this._TextSettings.Size = size;
    this._TextSettings.SetStrokeScale();
  }

  /**
   * Repositions and resizes the embedded Crt text window over the
   * graphics canvas.
   *
   * Wrap mode is parsed but the Crt.AutoWrap setter isn't wired
   * through yet — original TODOs preserved. `size` picks one of five
   * predefined RIP fonts (RIP-8x8 through RIP-16x14).
   *
   * Bug preserved: `_TextWindow` is never *written* to after the
   * constructor, so the same-settings shortcut (the `if` branch
   * comparing left/top/right/bottom) always compares against the
   * original dimensions, not the current ones. This means
   * SetTextWindow will repeat the full update path on every call
   * after the first one with new dimensions. Preserved with a TODO.
   */
  public SetTextWindow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    _wrap: number,
    size: number
  ): void {
    if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) {
      // All-zero coords → hide the Crt window.
      this._Crt.Canvas.style.opacity = '0';
    } else if (x2 === 0 || y2 === 0) {
      // Sanity check.
      this._Crt.Canvas.style.opacity = '0';
    } else if (x1 > x2 || y1 > y2) {
      // Inverted rect — do nothing.
    } else if (
      x1 === this._TextWindow.left &&
      y1 === this._TextWindow.top &&
      x2 === this._TextWindow.right &&
      y2 === this._TextWindow.bottom &&
      size === this._TextSettings.Size
    ) {
      // TODO: handle the wrap parameter (this._Crt.AutoWrap = wrap !== 0).
      // The original had this TODO; preserved.
      //
      // ALSO: `_TextWindow` is never written to, so this branch
      // effectively only fires when the user re-requests the same
      // dimensions as the *initial* text window. See class doc.
    } else {
      // TODO: handle the wrap parameter (see above).
      this._Crt.SetScreenSize(x2 - x1 + 1, y2 - y1 + 1);
      switch (size) {
        case 0:
          this._Crt.Canvas.style.left = `${x1 * 8}px`;
          this._Crt.Canvas.style.top = `${y1 * 8}px`;
          this._Crt.SetFont('RIP-8x8');
          break;
        case 1:
          this._Crt.Canvas.style.left = `${x1 * 7}px`;
          this._Crt.Canvas.style.top = `${y1 * 8}px`;
          this._Crt.SetFont('RIP-7x8');
          break;
        case 2:
          this._Crt.Canvas.style.left = `${x1 * 8}px`;
          this._Crt.Canvas.style.top = `${y1 * 14}px`;
          this._Crt.SetFont('RIP-8x14');
          break;
        case 3:
          this._Crt.Canvas.style.left = `${x1 * 7}px`;
          this._Crt.Canvas.style.top = `${y1 * 14}px`;
          this._Crt.SetFont('RIP-7x14');
          break;
        case 4:
          this._Crt.Canvas.style.left = `${x1 * 16}px`;
          this._Crt.Canvas.style.top = `${y1 * 14}px`;
          this._Crt.SetFont('RIP-16x14');
          break;
        default:
          break;
      }
      this._Crt.TextAttr = 15;
      this._Crt.ClrScr();
      this._Crt.Canvas.style.opacity = '1';
    }
  }

  /**
   * Sets the current viewport. Coordinates are validated against the
   * full canvas; invalid input silently does nothing (matches the
   * BGI standard, which returns `grError` in that case).
   */
  public SetViewPort(x1: number, y1: number, x2: number, y2: number, clip: boolean): void {
    if (x1 < 0 || x1 > x2) return;
    if (y1 < 0 || y1 > y2) return;
    if (x2 > this.PIXELS_X - 1) return;
    if (y2 > this.PIXELS_Y - 1) return;

    this._ViewPortSettings.x1 = x1;
    this._ViewPortSettings.y1 = y1;
    this._ViewPortSettings.x2 = x2;
    this._ViewPortSettings.y2 = y2;
    this._ViewPortSettings.Clip = clip;

    this._ViewPortSettings.FromBottom = this.PIXELS_Y - 1 - y2;
    this._ViewPortSettings.FromLeft = x1;
    this._ViewPortSettings.FromRight = this.PIXELS_X - 1 - x2;
    this._ViewPortSettings.FromTop = y1;
    this._ViewPortSettings.FullScreen =
      x1 === 0 && y1 === 0 && x2 === this.PIXELS_X - 1 && y2 === this.PIXELS_Y - 1;
  }

  /**
   * Sets the write mode for line drawing.
   *
   * Only `Normal` is implemented. Other modes are silently coerced
   * to `Normal` (the original noted this with a TODO and the FPC
   * mapping was sketched but not implemented). Preserved.
   */
  public SetWriteMode(mode: number): void {
    if (mode !== WriteMode.Normal) {
      // TODO: only Normal is supported. Silent downgrade.
      mode = WriteMode.Normal;
    }
    this._WriteMode = mode;
  }
}
