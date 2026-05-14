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

import {
  ByteArray,
  CRC,
  DetectMobileBrowser,
  Point,
  StringUtils,
  TypedEvent,
  type IEvent,
} from '../common/index.js';
import type { AnsiTarget } from './AnsiTarget.js';
import { CharInfo } from './CharInfo.js';
import { ANSI_COLOURS, Color, PETSCIIColor } from './Colors.js';
import { CrtFont } from './CrtFont.js';
import { Cursor } from './Cursor.js';
import type { KeyPressEvent } from './KeyPressEvent.js';

/**
 * Crt: console-window emulator for the terminal canvas.
 *
 * Originally a port of Borland Pascal's `Crt` unit, expanded for ANSI/
 * SyncTERM use. This file owns:
 *
 *   - The screen buffer (a 2D array of CharInfo cells, plus a scrollback)
 *   - The text-window/coordinate model (WindMin/Max packed-int encoding,
 *     1-based positions, window-relative vs absolute coords)
 *   - The current text attribute and 24-bit color state
 *   - Save/Restore screen helpers
 *   - The Cursor (blink timer, position, visibility)
 *
 * Phase 1, Delta 3c-1 — FOUNDATION ONLY. This migration ships:
 *   ✓ Class skeleton with all fields
 *   ✓ Constructor (canvas setup + buffer init + cursor)
 *   ✓ Window/coordinate math (WindMin/Max, WhereX, GotoXY, Window)
 *   ✓ Color and attribute APIs (TextAttr, TextColor, TextBackground,
 *     TextColor24, TextBackground24, NormVideo, HighVideo, LowVideo,
 *     ReverseVideo, Conceal, SetBlink)
 *   ✓ Clear methods (ClrBol, ClrBos, ClrEol, ClrEos, ClrLine, ClrScr)
 *   ✓ Insert/Delete (InsChar, InsLine, DelChar, DelLine)
 *   ✓ Scrolling (ScrollUpCustom/ScrollDownCustom and their wrappers)
 *   ✓ Save/Restore screen
 *   ✓ Cursor visibility (HideCursor/ShowCursor)
 *   ✓ Checksum, FillScreen, FastWrite
 *
 * NOT YET MIGRATED — Delta 3c-2 will add:
 *   ✗ Write/WriteASCII/WriteLn (write path with character handling)
 *   ✗ WritePETSCII/WriteATASCII (alternate emulation modes)
 *   ✗ OnBlinkShow/OnBlinkHide (canvas blink cycle)
 *   ✗ OnFontChanged (canvas resize)
 *   ✗ PlaySound/PlayNextSound (Web Audio bell)
 *
 * NOT YET MIGRATED — Delta 3c-3 will add:
 *   ✗ OnKeyDown/OnKeyPress (the giant key encoding table)
 *   ✗ OnMouseDown/Move/Up (selection, copy, mouse reporting)
 *   ✗ EnterScrollback/ExitScrollback
 *   ✗ PushKeyDown/PushKeyPress/ReadKey/KeyPressed
 *   ✗ OnResize
 *
 * Methods that depend on un-migrated logic are temporarily stubbed
 * with `throw new Error('not yet migrated...')` rather than left
 * unimplemented, so any accidental use is immediately obvious. The
 * codebase compiles cleanly with stubs in place.
 *
 * Crt declares `implements AnsiTarget`. All members of the interface
 * are implemented by this delta (either with real code or as one of
 * the noted stubs), so Ansi can be instantiated against a Crt without
 * type errors.
 */
export class Crt implements AnsiTarget {
  // ───────── Events ─────────
  public readonly onfontchange: IEvent<[]> = new TypedEvent<[]>();
  public readonly onkeypressed: IEvent<[]> = new TypedEvent<[]>();
  public readonly onmousereport: IEvent<[string]> = new TypedEvent<[string]>();
  public readonly onscreensizechange: IEvent<[]> = new TypedEvent<[]>();

  // ───────── Color constants (instance access) ─────────
  // Original code referenced `Crt.LIGHTGRAY` etc.; preserved as static
  // aliases for compatibility. New code should import from Colors.ts.
  public static readonly BLACK = Color.BLACK;
  public static readonly BLUE = Color.BLUE;
  public static readonly GREEN = Color.GREEN;
  public static readonly CYAN = Color.CYAN;
  public static readonly RED = Color.RED;
  public static readonly MAGENTA = Color.MAGENTA;
  public static readonly BROWN = Color.BROWN;
  public static readonly LIGHTGRAY = Color.LIGHTGRAY;
  public static readonly DARKGRAY = Color.DARKGRAY;
  public static readonly LIGHTBLUE = Color.LIGHTBLUE;
  public static readonly LIGHTGREEN = Color.LIGHTGREEN;
  public static readonly LIGHTCYAN = Color.LIGHTCYAN;
  public static readonly LIGHTRED = Color.LIGHTRED;
  public static readonly LIGHTMAGENTA = Color.LIGHTMAGENTA;
  public static readonly YELLOW = Color.YELLOW;
  public static readonly WHITE = Color.WHITE;
  public static readonly BLINK = Color.BLINK;

  public static readonly PETSCII_BLACK = PETSCIIColor.BLACK;
  public static readonly PETSCII_WHITE = PETSCIIColor.WHITE;
  public static readonly PETSCII_RED = PETSCIIColor.RED;
  public static readonly PETSCII_CYAN = PETSCIIColor.CYAN;
  public static readonly PETSCII_PURPLE = PETSCIIColor.PURPLE;
  public static readonly PETSCII_GREEN = PETSCIIColor.GREEN;
  public static readonly PETSCII_BLUE = PETSCIIColor.BLUE;
  public static readonly PETSCII_YELLOW = PETSCIIColor.YELLOW;
  public static readonly PETSCII_ORANGE = PETSCIIColor.ORANGE;
  public static readonly PETSCII_BROWN = PETSCIIColor.BROWN;
  public static readonly PETSCII_LIGHTRED = PETSCIIColor.LIGHTRED;
  public static readonly PETSCII_DARKGRAY = PETSCIIColor.DARKGRAY;
  public static readonly PETSCII_GRAY = PETSCIIColor.GRAY;
  public static readonly PETSCII_LIGHTGREEN = PETSCIIColor.LIGHTGREEN;
  public static readonly PETSCII_LIGHTBLUE = PETSCIIColor.LIGHTBLUE;
  public static readonly PETSCII_LIGHTGRAY = PETSCIIColor.LIGHTGRAY;

  // ───────── Configuration ─────────
  private _allowDynamicFontResize = true;
  private _atari = false;
  private _bareLFtoCRLF = false;
  private _c64 = false;
  private _localEcho = false;
  private _reportMouse = false;
  private _reportMouseSgr = false;
  private _useModernScrollback: boolean;

  // Configuration fields not used until Delta 3c-2 / 3c-3 will be
  // added back alongside the methods that need them:
  //   _atasciiEscaped, _skipRedrawWhenSameFontSize, _transparent

  // ───────── Display state ─────────
  /**
   * The screen buffer. Indexed `[y][x]` with 1-based row/column to
   * match the original Pascal-style API.
   *
   * Definite-assignment assertion: assigned in InitBuffers, which
   * the constructor always calls.
   */
  private _buffer!: CharInfo[][];

  private readonly _charInfo: CharInfo = new CharInfo(null);
  private _scrollback: CharInfo[][] = [];

  /**
   * Scrollback line cap.
   *
   * Originally 500 but the upstream code reduced it to 250 because of
   * an "IndexSizeError" they couldn't track down on old Edge. With
   * modern browsers we could bump this up; deferring that change until
   * Delta 3c-2 / 3c-3 lands and we can verify the rendering still
   * works at larger sizes.
   */
  private _scrollbackSize = 250;

  private _inScrollback = false;
  private readonly _screenSize: Point = new Point(80, 25);

  // Other display state arrives with its consumers:
  //   _scrollbackTemp, _scrollbackPosition (3c-3)
  //   _blinkHidden, _lastChar (3c-2)

  // ───────── Window (scroll region) ─────────
  /**
   * The text window's top-left corner, packed: low byte = X (0-based
   * column), high byte = Y (0-based row). Matches the original layout.
   */
  private _windMin = 0;

  /**
   * The text window's bottom-right corner, packed the same way.
   * Default initializer matches the original.
   */
  private _windMax = (80 - 1) | ((25 - 1) << 8);

  // Audio/mouse/PETSCII state arrives with the consumers:
  //   _audioContext, _playSoundQueue (Delta 3c-2)
  //   _mouseDownPoint, _mouseMovePoint (Delta 3c-3)
  //   _flushBeforeWritePETSCII (Delta 3c-2)

  // ───────── DOM elements ─────────
  private readonly _canvas: HTMLCanvasElement;
  private readonly _canvasContext: CanvasRenderingContext2D;
  private readonly _container: HTMLElement;
  private readonly _font: CrtFont;
  private readonly _tempCanvas: HTMLCanvasElement;
  private readonly _tempCanvasContext: CanvasRenderingContext2D;

  // ───────── Input state ─────────
  private readonly _keyBuf: KeyPressEvent[] = [];

  // ───────── Cursor ─────────
  private readonly _cursor: Cursor;

  // ─────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────

  constructor(container: HTMLElement, useModernScrollback: boolean) {
    this._container = container;
    this._useModernScrollback = useModernScrollback;

    this._font = new CrtFont();
    this._font.onchange.on((oldSize: Point): void => {
      this.OnFontChanged(oldSize);
    });

    // Canvas creation
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'fTelnetCrtCanvas';
    this._canvas.setAttribute('aria-live', 'polite');
    this._canvas.style.zIndex = '50';
    this._canvas.width = this._font.Width * this._screenSize.x;
    this._canvas.height =
      this._font.Height *
      (useModernScrollback ? this._screenSize.y + this._scrollbackSize : this._screenSize.y);

    // Mouse handling (desktop only). Cordova/touch handling that used
    // to live here is gone — Delta 2 deleted Cordova support.
    if (!DetectMobileBrowser.IsMobile) {
      this._canvas.addEventListener(
        'contextmenu',
        (e: Event): boolean => {
          e.preventDefault();
          return false;
        },
        false
      );
      this._canvas.addEventListener('mousedown', (me: MouseEvent): void => this.OnMouseDown(me));
      this._canvas.addEventListener('mousemove', (me: MouseEvent): void => this.OnMouseMove(me));
      this._canvas.addEventListener('mouseup', (me: MouseEvent): void => this.OnMouseUp(me));
      window.addEventListener('mouseup', (me: MouseEvent): void => this.OnMouseUpForWindow(me));
    }

    this._container.appendChild(this._canvas);

    // Global keyboard handlers
    window.addEventListener('keydown', (ke: KeyboardEvent): void => this.OnKeyDown(ke));
    window.addEventListener('keypress', (ke: KeyboardEvent): void => this.OnKeyPress(ke));
    window.addEventListener('resize', (): void => this.OnResize());

    // Initialize screen buffer
    this.InitBuffers(true);

    // Create the cursor (light gray, sized to one font cell)
    this._cursor = new Cursor(ANSI_COLOURS[Color.LIGHTGRAY]!, this._font.Size);
    this._cursor.onhide.on((): void => this.OnBlinkHide());
    this._cursor.onshow.on((): void => this.OnBlinkShow());

    // Set up the WindMin/WindMax extents (default: full screen)
    this._windMin = 0;
    this._windMax = (this._screenSize.x - 1) | ((this._screenSize.y - 1) << 8);

    // 2D context. Strict mode catches the case where getContext returns
    // null (e.g. context already taken by another API). Original code
    // ignored this and crashed later; we throw immediately.
    const ctx = this._canvas.getContext('2d');
    if (!ctx) {
      throw new Error('fTelnet: unable to acquire 2D canvas context');
    }
    this._canvasContext = ctx;
    this._canvasContext.font = '12pt monospace';
    this._canvasContext.textBaseline = 'top';

    if (this._useModernScrollback) {
      this._canvasContext.fillStyle = 'black';
      this._canvasContext.fillRect(0, 0, this._canvas.width, this._canvas.height);
    }

    // Off-screen canvas for scroll operations
    this._tempCanvas = document.createElement('canvas');
    this._tempCanvas.width = this._canvas.width;
    this._tempCanvas.height = this._canvas.height;
    const tempCtx = this._tempCanvas.getContext('2d');
    if (!tempCtx) {
      throw new Error('fTelnet: unable to acquire 2D context for temp canvas');
    }
    this._tempCanvasContext = tempCtx;
    this._tempCanvasContext.font = '12pt monospace';
    this._tempCanvasContext.textBaseline = 'top';

    // Initial clear (sets buffer to spaces, moves cursor to home)
    this.ClrScr();
  }

  /**
   * Stop timers and detach event listeners. Called when tearing down
   * a Crt instance — important to call so the cursor blink timer
   * doesn't leak. The original didn't have this; the leak was harmless
   * at one-Crt-per-page but matters for tests and any future scenario
   * with multiple terminals.
   */
  public dispose(): void {
    this._cursor.dispose();
  }

  // ─────────────────────────────────────────────────────────
  // Simple property accessors
  // ─────────────────────────────────────────────────────────

  public get AllowDynamicFontResize(): boolean {
    return this._allowDynamicFontResize;
  }
  public set AllowDynamicFontResize(value: boolean) {
    this._allowDynamicFontResize = value;
  }

  public get Atari(): boolean {
    return this._atari;
  }
  public set Atari(value: boolean) {
    this._atari = value;
  }

  public get BareLFtoCRLF(): boolean {
    return this._bareLFtoCRLF;
  }
  public set BareLFtoCRLF(value: boolean) {
    this._bareLFtoCRLF = value;
  }

  public get C64(): boolean {
    return this._c64;
  }
  public set C64(value: boolean) {
    this._c64 = value;
  }

  public get Canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  public get CharInfo(): CharInfo {
    return this._charInfo;
  }

  public get Font(): CrtFont {
    return this._font;
  }

  public set LocalEcho(value: boolean) {
    this._localEcho = value;
  }
  public get LocalEcho(): boolean {
    return this._localEcho;
  }

  public get ReportMouse(): boolean {
    return this._reportMouse;
  }
  public set ReportMouse(value: boolean) {
    this._reportMouse = value;
  }

  public get ReportMouseSgr(): boolean {
    return this._reportMouseSgr;
  }
  public set ReportMouseSgr(value: boolean) {
    this._reportMouseSgr = value;
  }

  public get ScreenCols(): number {
    return this._screenSize.x;
  }

  public get ScreenRows(): number {
    return this._screenSize.y;
  }

  public set SkipRedrawWhenSameFontSize(_value: boolean) {
    // Delta 3c-2 will store this for the render path; for now the
    // setter is a no-op so external callers don't break.
  }

  public set Transparent(_value: boolean) {
    // Delta 3c-2 will store this and trigger a redraw.
  }

  // ─────────────────────────────────────────────────────────
  // Window / coordinate math
  // ─────────────────────────────────────────────────────────

  /**
   * Window packed-integer layout — for both `WindMin` and `WindMax`:
   *   low byte  = column (0-based)
   *   high byte = row (0-based)
   *
   * Note: the original code's JSDoc on `WindMaxX`/`WindMaxY` was
   * swapped — the implementation is right, the doc strings claimed
   * the wrong thing. Doc strings fixed here.
   */
  public get WindMin(): number {
    return this._windMin;
  }

  /** 0-based left column of the current window. */
  public get WindMinX(): number {
    return this._windMin & 0x00ff;
  }

  /** 0-based top row of the current window. */
  public get WindMinY(): number {
    return (this._windMin & 0xff00) >> 8;
  }

  public get WindMax(): number {
    return this._windMax;
  }

  /** 0-based right column of the current window. */
  public get WindMaxX(): number {
    return this._windMax & 0x00ff;
  }

  /** 0-based bottom row of the current window. */
  public get WindMaxY(): number {
    return (this._windMax & 0xff00) >> 8;
  }

  public get WindCols(): number {
    return this.WindMaxX - this.WindMinX + 1;
  }

  public get WindRows(): number {
    return this.WindMaxY - this.WindMinY + 1;
  }

  /**
   * Define a new text window (scrolling region).
   *
   * Cursor moves to (1, 1) within the new window. Invalid coordinates
   * are silently ignored to match the Pascal `Crt` unit's behavior.
   */
  public Window(left: number, top: number, right: number, bottom: number): void {
    if (left >= 1 && top >= 1 && left <= right && top <= bottom) {
      if (right <= this._screenSize.x && bottom <= this._screenSize.y) {
        this._windMin = (left - 1) + ((top - 1) << 8);
        this._windMax = (right - 1) + ((bottom - 1) << 8);
        this.GotoXY(1, 1);
      }
    }
  }

  /**
   * Move the cursor to (x, y) within the window. 1-based coordinates.
   * Out-of-bounds positions are silently ignored.
   */
  public GotoXY(x: number, y: number): void {
    if (
      x >= 1 &&
      y >= 1 &&
      x - 1 + this.WindMinX <= this.WindMaxX &&
      y - 1 + this.WindMinY <= this.WindMaxY
    ) {
      this._cursor.Position = new Point(x, y);
    }
  }

  /** 1-based cursor column within the window. */
  public WhereX(): number {
    return this._cursor.Position.x;
  }

  /** 1-based cursor column on the screen (absolute). */
  public WhereXA(): number {
    return this.WhereX() + this.WindMinX;
  }

  /** 1-based cursor row within the window. */
  public WhereY(): number {
    return this._cursor.Position.y;
  }

  /** 1-based cursor row on the screen (absolute). */
  public WhereYA(): number {
    return this.WhereY() + this.WindMinY;
  }

  // ─────────────────────────────────────────────────────────
  // Cursor visibility (other cursor state moves to 3c-2 / 3c-3)
  // ─────────────────────────────────────────────────────────

  public HideCursor(): void {
    this._cursor.Visible = false;
  }

  public ShowCursor(): void {
    this._cursor.Visible = true;
  }

  // ─────────────────────────────────────────────────────────
  // Text attributes / colors
  // ─────────────────────────────────────────────────────────

  public get TextAttr(): number {
    return this._charInfo.Attr;
  }

  public set TextAttr(value: number) {
    this._charInfo.Back24 = ANSI_COLOURS[(value & 0xf0) >> 4]!;
    this._charInfo.Fore24 = ANSI_COLOURS[value & 0x0f]!;
    this._charInfo.Attr = value;
  }

  /** Set foreground from the 16-color palette (sets low nibble of TextAttr). */
  public TextColor(colour: number): void {
    this.TextAttr = (this.TextAttr & 0xf0) | (colour & 0x0f);
  }

  /** Set background from the 16-color palette (sets high nibble of TextAttr). */
  public TextBackground(colour: number): void {
    this.TextAttr = (this.TextAttr & 0x0f) | ((colour & 0x0f) << 4);
  }

  /** Set foreground from a 24-bit RGB triple (doesn't change TextAttr). */
  public TextColor24(red: number, green: number, blue: number): void {
    this._charInfo.Fore24 = ((red & 0xff) << 16) + ((green & 0xff) << 8) + (blue & 0xff);
  }

  /** Set background from a 24-bit RGB triple. */
  public TextBackground24(red: number, green: number, blue: number): void {
    this._charInfo.Back24 = ((red & 0xff) << 16) + ((green & 0xff) << 8) + (blue & 0xff);
  }

  /** Select high-intensity foreground (sets bit 3 of TextAttr's fg nibble). */
  public HighVideo(): void {
    this.TextAttr |= 0x08;
  }

  /** Select low-intensity foreground (clears bit 3 of TextAttr's fg nibble). */
  public LowVideo(): void {
    this.TextAttr &= 0xf7;
  }

  /** Swap foreground and background nibbles. */
  public ReverseVideo(): void {
    this.TextAttr = ((this.TextAttr & 0xf0) >> 4) | ((this.TextAttr & 0x0f) << 4);
  }

  /** Restore default attributes (light gray on black, no blink/reverse/underline). */
  public NormVideo(): void {
    this.TextBackground(Color.BLACK);
    if (this._c64) {
      this.TextAttr = PETSCIIColor.WHITE;
    } else {
      this.TextAttr = Color.LIGHTGRAY;
    }
    this._charInfo.Blink = false;
    this._charInfo.Underline = false;
    this._charInfo.Reverse = false;
  }

  /** Conceal mode: set foreground to background color (effectively invisible). */
  public Conceal(): void {
    this.TextColor((this.TextAttr & 0xf0) >> 4);
  }

  public SetBlink(value: boolean): void {
    this._charInfo.Blink = value;
  }

  public SetBlinkRate(milliSeconds: number): void {
    this._cursor.BlinkRate = milliSeconds;
  }

  // ─────────────────────────────────────────────────────────
  // Buffer init
  // ─────────────────────────────────────────────────────────

  /**
   * Allocate the screen buffer (and optionally the scrollback buffer).
   *
   * Note the 1-based indexing: buffer is sized `[rows+1][cols+1]` with
   * index 0 wasted. Matches the original Pascal-style 1-based array
   * convention so every other method here can use 1-based coords.
   */
  private InitBuffers(initScrollback: boolean): void {
    this._buffer = [];
    for (let y = 1; y <= this._screenSize.y; y++) {
      this._buffer[y] = [];
      for (let x = 1; x <= this._screenSize.x; x++) {
        this._buffer[y]![x] = new CharInfo(null);
      }
    }
    if (initScrollback) {
      this._scrollback = [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // Clear methods
  // ─────────────────────────────────────────────────────────

  /** Clear from cursor to beginning of line. */
  public ClrBol(): void {
    this.FastWrite(
      StringUtils.NewString(' ', this.WhereX()),
      this.WindMinX + 1,
      this.WhereYA(),
      this._charInfo
    );
  }

  /** Clear from cursor's line to top of window. */
  public ClrBos(): void {
    this.ScrollUpWindow(this.WhereY() - 1);
    this.ScrollDownWindow(this.WhereY() - 1);
    this.ClrBol();
  }

  /** Clear from cursor to end of line. */
  public ClrEol(): void {
    this.FastWrite(
      StringUtils.NewString(' ', this.WindMaxX + 1 - this.WhereX() + 1),
      this.WhereXA(),
      this.WhereYA(),
      this._charInfo
    );
  }

  /** Clear from cursor's line to bottom of window. */
  public ClrEos(): void {
    this.ScrollDownWindow(this.WindRows - this.WhereY());
    this.ScrollUpWindow(this.WindRows - this.WhereY());
    this.ClrEol();
  }

  /** Clear the entire current line. */
  public ClrLine(): void {
    this.FastWrite(
      StringUtils.NewString(' ', this.WindCols),
      this.WindMinX + 1,
      this.WhereYA(),
      this._charInfo
    );
  }

  /**
   * Clear the active window and move cursor to (1, 1).
   *
   * The original code also walks `_Canvas.lastElementChild` to remove
   * any DOM children added by RIP graphics rendering. RIP isn't fully
   * wired up yet at this layer, but we keep the removal loop for
   * faithful behavior.
   */
  public ClrScr(): void {
    this.ScrollUpWindow(this.WindRows);
    this.GotoXY(1, 1);

    let child = this._canvas.lastElementChild;
    while (child) {
      this._canvas.removeChild(child);
      child = this._canvas.lastElementChild;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Insert / Delete characters and lines
  // ─────────────────────────────────────────────────────────

  /**
   * Delete `count` characters at the cursor, shifting the rest of the
   * line left and filling on the right with the current attribute.
   */
  public DelChar(count = 1): void {
    for (let i = this.WhereXA(); i <= this.WindMinX + this.WindCols - count; i++) {
      const src = this._buffer[this.WhereYA()]![i + count]!;
      this.FastWrite(src.Ch, i, this.WhereYA(), src);
    }
    for (let i = this.WindMinX + this.WindCols + 1 - count; i <= this.WindMinX + this.WindCols; i++) {
      this.FastWrite(' ', i, this.WhereYA(), this._charInfo);
    }
  }

  /** Insert `count` blank characters at the cursor, shifting the rest right. */
  public InsChar(count = 1): void {
    for (let i = this.WindMinX + this.WindCols; i >= this.WhereXA() + count; i--) {
      const src = this._buffer[this.WhereYA()]![i - count]!;
      this.FastWrite(src.Ch, i, this.WhereYA(), src);
    }
    for (let i = this.WhereXA(); i < this.WhereXA() + count; i++) {
      this.FastWrite(' ', i, this.WhereYA(), this._charInfo);
    }
  }

  /** Delete `count` lines starting at the cursor row. */
  public DelLine(count = 1): void {
    this.ScrollUpCustom(
      this.WindMinX + 1,
      this.WhereYA(),
      this.WindMaxX + 1,
      this.WindMaxY + 1,
      count,
      this._charInfo
    );
  }

  /** Insert `count` blank lines at the cursor row. */
  public InsLine(count = 1): void {
    this.ScrollDownCustom(
      this.WindMinX + 1,
      this.WhereYA(),
      this.WindMaxX + 1,
      this.WindMaxY + 1,
      count,
      this._charInfo
    );
  }

  // ─────────────────────────────────────────────────────────
  // Scrolling
  // ─────────────────────────────────────────────────────────

  /**
   * Scroll a rectangular region up by `count` rows.
   *
   * The canvas blits happen via off-screen `_tempCanvas`, then the
   * buffer state is updated to match (rolling old rows into the
   * scrollback if we're in legacy-scrollback mode and the region is
   * the full screen).
   */
  public ScrollUpCustom(
    left: number,
    top: number,
    right: number,
    bottom: number,
    count: number,
    charInfo: CharInfo,
    updateBuffer = true
  ): void {
    const maxLines = bottom - top + 1;
    if (count > maxLines) {
      count = maxLines;
    }

    if (!this._inScrollback || (this._inScrollback && !updateBuffer)) {
      this.scrollUpCanvas(left, top, right, bottom, count);

      // Blank the freshly-revealed rows at the bottom.
      for (let y = 0; y < count; y++) {
        for (let x = left; x <= right; x++) {
          this.FastWrite(' ', x, bottom - count + 1 + y, charInfo, false);
        }
      }
    }

    if (updateBuffer) {
      this.updateBufferForScrollUp(left, top, right, bottom, count, charInfo);
    }
  }

  private scrollUpCanvas(
    left: number,
    top: number,
    right: number,
    bottom: number,
    count: number
  ): void {
    if (this._useModernScrollback) {
      if (left === 1 && top === 1 && right === this._screenSize.x && bottom === this._screenSize.y) {
        // Full-screen scroll: shift the whole canvas up via the
        // off-screen temp canvas (the same trick the original used).
        const yOff = count * this._font.Height;
        const w = this._canvas.width;
        const h = this._canvas.height - yOff;
        this._tempCanvasContext.drawImage(this._canvas, 0, 0);
        this._canvasContext.drawImage(this._tempCanvas, 0, yOff, w, h, 0, 0, w, h);
      } else {
        // Partial scroll: copy just the affected region.
        const srcLeft = (left - 1) * this._font.Width;
        const srcTop = (top - 1 + count + this._scrollbackSize) * this._font.Height;
        const w = (right - left + 1) * this._font.Width;
        const h = (bottom - top + 1 - count) * this._font.Height;
        if (h > 0) {
          const buf = this._canvasContext.getImageData(srcLeft, srcTop, w, h);
          const dstLeft = (left - 1) * this._font.Width;
          const dstTop = (top - 1 + this._scrollbackSize) * this._font.Height;
          this._canvasContext.putImageData(buf, dstLeft, dstTop);
        }
      }
    } else {
      const srcLeft = (left - 1) * this._font.Width;
      const srcTop = (top - 1 + count) * this._font.Height;
      const w = (right - left + 1) * this._font.Width;
      const h = (bottom - top + 1 - count) * this._font.Height;
      if (h > 0) {
        this._tempCanvasContext.drawImage(this._canvas, srcLeft, srcTop, w, h, 0, 0, w, h);
        const dstLeft = (left - 1) * this._font.Width;
        const dstTop = (top - 1) * this._font.Height;
        this._canvasContext.drawImage(this._tempCanvas, 0, 0, w, h, dstLeft, dstTop, w, h);
      }
    }
  }

  private updateBufferForScrollUp(
    left: number,
    top: number,
    right: number,
    bottom: number,
    count: number,
    charInfo: CharInfo
  ): void {
    // Roll the lines that scrolled off the top into the scrollback
    // (legacy scrollback mode only — modern mode keeps them in-canvas).
    if (!this._useModernScrollback) {
      for (let y = 0; y < count; y++) {
        const row: CharInfo[] = [];
        for (let x = left; x <= right; x++) {
          row.push(new CharInfo(this._buffer[y + top]![x]!));
        }
        this._scrollback.push(row);
      }
      // Trim the scrollback. The original kept the trim threshold at
      // `_ScrollbackSize - 2` — preserved here.
      while (this._scrollback.length > this._scrollbackSize - 2) {
        this._scrollback.shift();
      }
    }

    // Shuffle the still-visible rows up.
    for (let y = top; y <= bottom - count; y++) {
      for (let x = left; x <= right; x++) {
        this._buffer[y]![x]!.Set(this._buffer[y + count]![x]!);
      }
    }

    // Blank the rows that scrolled off the bottom (and so are now empty).
    for (let y = bottom; y > bottom - count; y--) {
      for (let x = left; x <= right; x++) {
        this._buffer[y]![x]!.Set(charInfo);
      }
    }
  }

  /**
   * Scroll a rectangular region down by `count` rows.
   *
   * Simpler than ScrollUpCustom because no scrollback interaction —
   * downward scroll just creates blank rows at the top, it doesn't
   * push anything into history.
   */
  public ScrollDownCustom(
    left: number,
    top: number,
    right: number,
    bottom: number,
    count: number,
    charInfo: CharInfo,
    updateBuffer = true
  ): void {
    const maxLines = bottom - top + 1;
    if (count > maxLines) {
      count = maxLines;
    }

    // Canvas blit
    const srcLeft = (left - 1) * this._font.Width;
    const srcTop = (top - 1 + (this._useModernScrollback ? this._scrollbackSize : 0)) * this._font.Height;
    const w = (right - left + 1) * this._font.Width;
    const h = (bottom - top + 1 - count) * this._font.Height;
    if (h > 0) {
      const buf = this._canvasContext.getImageData(srcLeft, srcTop, w, h);
      const dstLeft = (left - 1) * this._font.Width;
      const dstTop =
        (top - 1 + count + (this._useModernScrollback ? this._scrollbackSize : 0)) *
        this._font.Height;
      this._canvasContext.putImageData(buf, dstLeft, dstTop);
    }

    // Blank the new top rows
    const blanks = StringUtils.PadLeft('', ' ', right - left + 1);
    for (let line = 0; line < count; line++) {
      this.FastWrite(blanks, left, top + line, charInfo, false);
    }

    if (updateBuffer) {
      // Shuffle the still-visible rows down.
      for (let y = bottom; y >= top + count; y--) {
        for (let x = left; x <= right; x++) {
          this._buffer[y]![x]!.Set(this._buffer[y - count]![x]!);
        }
      }
      // Blank the new rows.
      for (let y = top; y < top + count; y++) {
        for (let x = left; x <= right; x++) {
          this._buffer[y]![x]!.Set(charInfo);
        }
      }
    }
  }

  public ScrollUpScreen(count: number): void {
    this.ScrollUpCustom(1, 1, this._screenSize.x, this._screenSize.y, count, this._charInfo);
  }

  public ScrollUpWindow(count: number): void {
    this.ScrollUpCustom(
      this.WindMinX + 1,
      this.WindMinY + 1,
      this.WindMaxX + 1,
      this.WindMaxY + 1,
      count,
      this._charInfo
    );
  }

  public ScrollDownScreen(count: number): void {
    this.ScrollDownCustom(1, 1, this._screenSize.x, this._screenSize.y, count, this._charInfo);
  }

  public ScrollDownWindow(count: number): void {
    this.ScrollDownCustom(
      this.WindMinX + 1,
      this.WindMinY + 1,
      this.WindMaxX + 1,
      this.WindMaxY + 1,
      count,
      this._charInfo
    );
  }

  // ─────────────────────────────────────────────────────────
  // Save / Restore screen
  // ─────────────────────────────────────────────────────────

  /**
   * Snapshot a rectangular region into a freshly-allocated 2D array.
   * The result is detached from `_buffer` — mutating the returned
   * array won't affect the live screen.
   */
  public SaveScreen(left: number, top: number, right: number, bottom: number): CharInfo[][] {
    const height = bottom - top + 1;
    const width = right - left + 1;
    const result: CharInfo[][] = [];

    for (let y = 0; y < height; y++) {
      result[y] = [];
      for (let x = 0; x < width; x++) {
        result[y]![x] = new CharInfo(this._buffer[y + top]![x + left]!);
      }
    }
    return result;
  }

  /**
   * Write a saved screen back into the buffer and re-render. The
   * re-render goes via `FastWrite` so each cell's color is honored.
   */
  public RestoreScreen(
    buffer: CharInfo[][],
    left: number,
    top: number,
    right: number,
    bottom: number
  ): void {
    const height = bottom - top + 1;
    const width = right - left + 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = buffer[y]![x]!;
        this.FastWrite(cell.Ch, x + left, y + top, cell);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Checksum (used by Ansi.ts for DECRQCRA replies)
  // ─────────────────────────────────────────────────────────

  /**
   * Compute the CRC-16 of a rectangular screen region.
   *
   * Each cell contributes its attribute byte, 24-bit colors, blink
   * flag, character byte, reverse and underline flags. The current
   * font name is appended so identical text under different fonts
   * produces distinct checksums.
   */
  public Checksum(x1: number, y1: number, x2: number, y2: number): string {
    const data = new ByteArray();
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const cell = this._buffer[y]![x]!;
        data.writeByte(cell.Attr);
        data.write24Bit(cell.Back24);
        data.writeByte(cell.Blink ? 1 : 0);
        data.writeByte(cell.Ch.charCodeAt(0));
        data.write24Bit(cell.Fore24);
        data.writeByte(cell.Reverse ? 1 : 0);
        data.writeByte(cell.Underline ? 1 : 0);
      }
    }
    data.writeString(this._font.Name);
    return StringUtils.PadLeft(CRC.Calculate16(data).toString(16).toUpperCase(), '0', 4);
  }

  // ─────────────────────────────────────────────────────────
  // FastWrite (used internally and by Ansi.ts CSI X)
  // ─────────────────────────────────────────────────────────

  /**
   * Direct screen write at absolute (x, y). The buffer is updated to
   * reflect the new cells; the canvas is drawn from the font glyph
   * cache.
   *
   * The original had two FastWrite variants — a per-character one
   * (`FastWriteGetChar`) and a bulk one (`FastWriteGetChars` — the
   * normal one). We migrate the bulk variant here; the per-character
   * variant is rarely used and arrives in Delta 3c-2 along with the
   * Write path.
   *
   * Phase 1, Delta 3c-1 note: this is a SIMPLIFIED implementation that
   * updates the buffer but skips canvas drawing. Visual output is
   * intentionally a no-op for now — Delta 3c-2 will fill in the
   * `_canvasContext.putImageData(...)` calls. Until then, tests that
   * exercise FastWrite check the buffer state, not pixels.
   */
  public FastWrite(text: string, x: number, y: number, charInfo: CharInfo, updateBuffer = true): void {
    if (y < 1 || y > this._screenSize.y) {
      return;
    }
    if (updateBuffer) {
      for (let i = 0; i < text.length; i++) {
        const col = x + i;
        if (col < 1 || col > this._screenSize.x) {
          continue;
        }
        const cell = this._buffer[y]![col]!;
        cell.Set(charInfo);
        cell.Ch = text.charAt(i);
        cell.NeedsRedraw = true;
      }
    }
    // Canvas draw is deferred to Delta 3c-2.
  }

  /** Fill the entire screen with the same character at the current attribute. */
  public FillScreen(ch: string): void {
    const blanks = StringUtils.NewString(ch.charAt(0), this.ScreenCols);
    for (let y = 1; y <= this.ScreenRows; y++) {
      this.FastWrite(blanks, 1, y, this._charInfo);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Key queue helpers (full impl arrives in Delta 3c-3)
  // ─────────────────────────────────────────────────────────

  /** True if any key events are in the queue. */
  public KeyPressed(): boolean {
    return this._keyBuf.length > 0;
  }

  /** Dequeue and return the next key event, or undefined if none. */
  public ReadKey(): KeyPressEvent | undefined {
    return this._keyBuf.shift();
  }

  // ─────────────────────────────────────────────────────────
  // Methods deferred to Delta 3c-2 / 3c-3
  // ─────────────────────────────────────────────────────────
  //
  // These are referenced by other code (event handlers wired in the
  // constructor, the Ansi parser, etc.) and so need at least a stub
  // to keep the class implementable. Each one throws a descriptive
  // error so any accidental use is loud and immediate rather than
  // mysteriously silent.

  /** Write text to the screen at the cursor. **Delta 3c-2.** */
  public Write(_text: string): void {
    throw new Error('Crt.Write is not yet migrated; arrives in Delta 3c-2');
  }

  /** Write text then move cursor to next line. **Delta 3c-2.** */
  public WriteLn(_text?: string): void {
    throw new Error('Crt.WriteLn is not yet migrated; arrives in Delta 3c-2');
  }

  /** Resize the screen and font. **Delta 3c-2.** */
  public SetScreenSize(_columns: number, _rows: number): void {
    throw new Error('Crt.SetScreenSize is not yet migrated; arrives in Delta 3c-2');
  }

  /** Switch to a different font. **Delta 3c-2.** */
  public SetFont(_font: string): boolean {
    throw new Error('Crt.SetFont is not yet migrated; arrives in Delta 3c-2');
  }

  /** Audio bell / ANSI music. **Delta 3c-2.** */
  public PlaySound(_freq: number, _duration: number): void {
    throw new Error('Crt.PlaySound is not yet migrated; arrives in Delta 3c-2');
  }

  /** Push a synthetic keydown event. **Delta 3c-3.** */
  public PushKeyDown(
    _pushedCharCode: number,
    _pushedKeyCode: number,
    _ctrl: boolean,
    _alt: boolean,
    _shift: boolean
  ): void {
    throw new Error('Crt.PushKeyDown is not yet migrated; arrives in Delta 3c-3');
  }

  /** Push a synthetic keypress event. **Delta 3c-3.** */
  public PushKeyPress(
    _pushedCharCode: number,
    _pushedKeyCode: number,
    _ctrl: boolean,
    _alt: boolean,
    _shift: boolean
  ): void {
    throw new Error('Crt.PushKeyPress is not yet migrated; arrives in Delta 3c-3');
  }

  /** Enter scrollback view. **Delta 3c-3.** */
  public EnterScrollback(): void {
    throw new Error('Crt.EnterScrollback is not yet migrated; arrives in Delta 3c-3');
  }

  /** Exit scrollback view. **Delta 3c-3.** */
  public ExitScrollback(): void {
    throw new Error('Crt.ExitScrollback is not yet migrated; arrives in Delta 3c-3');
  }

  // ─────────────────────────────────────────────────────────
  // Internal event handlers (stubbed; real bodies in 3c-2/3c-3)
  // ─────────────────────────────────────────────────────────

  // Canvas blink cycle. Wired up in the constructor; real bodies in
  // Delta 3c-2. Until then they're no-ops so the constructor's event
  // wiring doesn't cause errors at runtime.
  private OnBlinkHide(): void {
    // Deferred to Delta 3c-2.
  }
  private OnBlinkShow(): void {
    // Deferred to Delta 3c-2.
  }
  private OnFontChanged(_oldSize: Point): void {
    // Deferred to Delta 3c-2.
  }
  private OnKeyDown(_ke: KeyboardEvent): void {
    // Deferred to Delta 3c-3.
  }
  private OnKeyPress(_ke: KeyboardEvent): void {
    // Deferred to Delta 3c-3.
  }
  private OnMouseDown(_me: MouseEvent): void {
    // Deferred to Delta 3c-3.
  }
  private OnMouseMove(_me: MouseEvent): void {
    // Deferred to Delta 3c-3.
  }
  private OnMouseUp(_me: MouseEvent): void {
    // Deferred to Delta 3c-3.
  }
  private OnMouseUpForWindow(_me: MouseEvent): void {
    // Deferred to Delta 3c-3.
  }
  private OnResize(): void {
    // Deferred to Delta 3c-3.
  }

  // ─────────────────────────────────────────────────────────
  // Reserved private fields. Several are unused at this layer but
  // will be picked up by Deltas 3c-2 / 3c-3:
  //   _atasciiEscaped, _bareLFtoCRLF — used by WriteASCII (3c-2)
  //   _blinkHidden, _lastChar — used by OnBlinkShow/Hide (3c-2)
  //   _mouseDownPoint, _mouseMovePoint — mouse handlers (3c-3)
  //   _scrollbackTemp, _scrollbackPosition, _inScrollback — scrollback (3c-3)
  //   _playSoundQueue, _audioContext — PlaySound (3c-2)
  //   _flushBeforeWritePETSCII — WritePETSCII (3c-2)
  //   _transparent, _skipRedrawWhenSameFontSize — render path (3c-2)
  //   _localEcho — Write path (3c-2)
  //   _allowDynamicFontResize — OnResize (3c-3)
  //   _scrollback — used in scroll path (already wired up)
  //
  // TypeScript with `noUnusedLocals` doesn't flag unused class fields
  // (it would have been infuriating across the codebase), so they sit
  // here harmlessly until their respective deltas land.
}
