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
  ClipboardHelper,
  CRC,
  DetectMobileBrowser,
  getOffset,
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
import { KeyboardKeys } from './KeyboardKeys.js';
import { KeyPressEvent } from './KeyPressEvent.js';

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
 * Phase 1, Delta 3c-1 (foundation) — buffer/coords/attrs/clear/scroll.
 * Phase 1, Delta 3c-2 (write path) — Write + WriteASCII/ATASCII/PETSCII,
 *   FastWrite rendering, blink cycle, font change, audio.
 * Phase 1, Delta 3c-3 (this delta) — input handling:
 *   ✓ OnKeyDown / OnKeyPress with separate ANSI / Atari / C64 encoders
 *   ✓ PushKeyDown / PushKeyPress (synthetic events for the on-screen
 *     keyboard and the scrollback pager)
 *   ✓ OnMouseDown / Move / Up / UpForWindow (text selection, copy,
 *     mouse reporting in both xterm and SGR-extended formats)
 *   ✓ EnterScrollback / ExitScrollback (legacy scrollback view)
 *   ✓ OnResize (dynamic font resize on window change)
 *   ✓ Single-cell-click hyperlink detection
 *   ✓ ReadKey now honors LocalEcho
 *
 * After this delta the Crt class is feature-complete. The remaining
 * Phase 1 work is in other modules (crtcontrols/, graph/, filetransfer/,
 * ftelnetclient/), not Crt itself.
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
  private _atasciiEscaped = false;
  private _bareLFtoCRLF = false;
  private _c64 = false;
  private _localEcho = false;
  private _reportMouse = false;
  private _reportMouseSgr = false;
  private _skipRedrawWhenSameFontSize = false;
  private _transparent = false;
  private _useModernScrollback: boolean;

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
  private _blinkHidden = false;
  private _lastChar = 0x00;
  private readonly _screenSize: Point = new Point(80, 25);

  // Scrollback view state. `_scrollbackTemp` is a working copy of
  // `_scrollback` plus the live screen, used while the user is
  // browsing history. `_scrollbackPosition` tracks where in that
  // buffer the top row of the visible viewport currently is.
  private _scrollbackTemp: CharInfo[][] = [];
  private _scrollbackPosition = -1;

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

  // ───────── Mouse drag state ─────────
  // Set on mousedown, cleared on mouseup. When defined, a drag
  // selection is in progress; mousemove events update the highlight.
  private _mouseDownPoint: Point | undefined;
  private _mouseMovePoint: Point | undefined;

  // ───────── Audio (Web Audio API) ─────────
  //
  // The original eagerly constructed an AudioContext in the constructor.
  // Modern browsers refuse to do that without a user gesture and print
  // a console warning. We construct it lazily on first PlaySound call
  // instead. As of late 2024, every browser supports this pattern.
  private _audioContext: AudioContext | undefined;
  private readonly _playSoundQueue: Point[] = [];

  // PETSCII control bytes that must flush the output buffer before
  // being processed. From the original; see WritePETSCII for use.
  private readonly _flushBeforeWritePETSCII: ReadonlySet<number> = new Set([
    0x05, 0x07, 0x08, 0x09, 0x0a, 0x0d, 0x0e, 0x11, 0x12, 0x13, 0x14, 0x1c, 0x1d, 0x1e, 0x1f, 0x81,
    0x8d, 0x8e, 0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9d,
    0x9e, 0x9f,
  ]);

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
    // Match the original behavior: switching to mouse-reporting mode
    // changes the CSS cursor to a pointer so users see that clicks
    // will be reported (rather than starting a text selection).
    this._canvas.style.cursor = value ? 'pointer' : 'text';
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

  public set SkipRedrawWhenSameFontSize(value: boolean) {
    this._skipRedrawWhenSameFontSize = value;
  }

  public set Transparent(value: boolean) {
    this._transparent = value;
    // The original had a `// TODO Redraw` comment here but didn't
    // actually redraw. Preserving that behavior — the next time
    // FastWrite is called for an affected cell, the new transparent
    // setting is honored.
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
   * reflect the new cells, and pixels are drawn to the canvas via
   * the font's pre-colored glyph map.
   *
   * The original had two FastWrite variants:
   *   - `FastWriteGetChar` — getImageData + putImageData per character.
   *     ~30× slower in Firefox; preserved as commented-out legacy code.
   *   - `FastWriteGetChars` — getImageData once per attribute, then
   *     drawImage per character. This is the one fTelnet uses today
   *     and the one we migrate.
   *
   * If the font hasn't finished loading, the glyph map will be undefined.
   * In that case we mark the cell as `NeedsRedraw` so OnFontChanged can
   * fix it up when the load completes.
   */
  /**
   * Direct screen write at absolute (x, y). The buffer is updated to
   * reflect the new cells, and pixels are drawn to the canvas via
   * the font's pre-colored glyph map.
   *
   * Behavior of the `text` parameter:
   *   - undefined → write a single space (or a transparent placeholder
   *     if Transparent mode is on). Used by callers who want to clear
   *     one cell without specifying a char.
   *   - '' (empty string) → no-op. Callers in the Write path pass
   *     this when their buffer is empty during a flush, and the
   *     flush should not corrupt the cell at (x, y).
   *   - any other string → draw each character starting at (x, y).
   *
   * If the font hasn't finished loading, the glyph map will be undefined.
   * In that case we mark the cell as `NeedsRedraw` so OnFontChanged can
   * fix it up when the load completes.
   */
  public FastWrite(
    text: string | undefined,
    x: number,
    y: number,
    charInfo: CharInfo,
    updateBuffer = true
  ): void {
    if (x > this._screenSize.x || y > this._screenSize.y) {
      return;
    }
    if (y < 1) {
      return;
    }

    let chars: string[];
    let charCodes: number[];
    if (text === undefined) {
      chars = [' '];
      charCodes = [this._transparent ? CrtFont.TRANSPARENT_CHARCODE : 32];
    } else if (text.length === 0) {
      // No-op — see docstring above.
      return;
    } else {
      chars = [];
      charCodes = [];
      for (let i = 0; i < text.length; i++) {
        chars.push(text.charAt(i));
        charCodes.push(text.charCodeAt(i));
      }
    }

    // Get the font's pre-colored char map for this attribute. May be
    // undefined if the font PNG is still loading.
    const charMap = this._font.GetChars(charInfo);
    const textLength = chars.length;

    for (let i = 0; i < textLength; i++) {
      const col = x + i;
      if (col < 1 || col > this._screenSize.x) {
        continue;
      }

      if (charMap === undefined) {
        // Font isn't ready; flag for redraw when it finishes loading.
        const cell = this._buffer[y]?.[col];
        if (cell) {
          cell.NeedsRedraw = true;
        }
      } else {
        const srcX = charCodes[i]! * this._font.Width;
        const dstX = (col - 1) * this._font.Width;
        const dstY =
          (y - 1 + (this._useModernScrollback ? this._scrollbackSize : 0)) * this._font.Height;

        // In legacy-scrollback mode, skip drawing while the user is
        // browsing the scrollback (unless updateBuffer is false, in
        // which case the caller wants a transient draw like the blink
        // cycle).
        if (!this._useModernScrollback && this._inScrollback && updateBuffer) {
          // skip canvas draw
        } else {
          this._canvasContext.drawImage(
            charMap,
            srcX,
            0,
            this._font.Width,
            this._font.Height,
            dstX,
            dstY,
            this._font.Width,
            this._font.Height
          );
        }
      }

      if (updateBuffer) {
        const cell = this._buffer[y]?.[col];
        if (cell) {
          cell.Set(charInfo);
          cell.Ch = chars[i]!;
        }
      }

      if (col >= this._screenSize.x) {
        break;
      }
    }
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

  /**
   * Dequeue and return the next key event, or undefined if none.
   * If `LocalEcho` is on, the dequeued keystring is also written
   * to the screen — convenient for terminals that aren't getting
   * server-side echo.
   */
  public ReadKey(): KeyPressEvent | undefined {
    const kpe = this._keyBuf.shift();
    if (!kpe) {
      return undefined;
    }
    if (this._localEcho) {
      this.Write(kpe.keyString);
    }
    return kpe;
  }

  // ─────────────────────────────────────────────────────────
  // Write path: dispatches to ASCII, ATASCII, or PETSCII writer
  // depending on the current emulation mode.
  // ─────────────────────────────────────────────────────────

  /**
   * Write text to the screen at the cursor position. Dispatches to
   * one of three writer variants based on emulation mode, then
   * mirrors visible text into the canvas as ARIA live-region updates
   * so screen readers can read the BBS output.
   */
  public Write(text: string): void {
    if (this._atari) {
      this.writeATASCII(text);
    } else if (this._c64) {
      this.writePETSCII(text);
    } else {
      this.writeASCII(text);
    }

    // Mirror visible chunks of text into screen-reader-accessible
    // <div>s appended to the canvas. The Crt canvas has aria-live
    // set to 'polite' so screen readers will announce each block.
    let ariaText = '';
    for (let i = 0; i < text.length; i++) {
      const cc = text.charCodeAt(i);
      if (cc === 10 || cc === 13) {
        if (ariaText.trim() !== '') {
          this.appendAriaDiv(ariaText);
          ariaText = '';
        }
      } else if (cc >= 32 && cc <= 126) {
        ariaText += text.charAt(i);
      }
    }
    if (ariaText.trim() !== '') {
      this.appendAriaDiv(ariaText);
    }
  }

  /** Write text followed by CRLF. */
  public WriteLn(text = ''): void {
    this.Write(`${text}\r\n`);
  }

  private appendAriaDiv(text: string): void {
    const div = document.createElement('div');
    div.innerText = text;
    this._canvas.appendChild(div);
  }

  /**
   * ASCII/ANSI writer. Handles control characters (BEL, BS, HT, LF, FF,
   * CR), regular printable characters, and word wrap at the window edge.
   *
   * Note: ANSI escape sequence handling is NOT here — that lives in
   * the `Ansi` class (Delta 3b). By the time bytes get to this method,
   * the Ansi parser has already stripped any escape sequences.
   */
  private writeASCII(text: string): void {
    let x = this.WhereX();
    let y = this.WhereY();
    let buf = '';

    for (let i = 0; i < text.length; i++) {
      const cc = text.charCodeAt(i);
      let doGoto = false;

      if (cc === 0x00) {
        // NULL — ignore
      } else if (cc === 0x07) {
        // BEL
        this.PlaySound(800, 200);
      } else if (cc === 0x08) {
        // Backspace — flush buffer, move cursor left one
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        if (x > 1) {
          x -= 1;
        }
        doGoto = true;
        buf = '';
      } else if (cc === 0x09) {
        // Tab — flush buffer, advance to next 8-column stop
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        buf = '';

        if (x === this.WindCols) {
          // At last column → tab wraps to start of next line
          x = 1;
          y += 1;
        } else {
          // Advance to next multiple of 8, capped at window width
          // (caps matter when WindCols isn't divisible by 8)
          x += 8 - (x % 8);
          x = Math.min(x, this.WindCols);
        }
        doGoto = true;
      } else if (cc === 0x0a) {
        // LF — flush buffer, move down. If `BareLFtoCRLF` is set and
        // we didn't just see a CR, also reset to column 1.
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        if (this._bareLFtoCRLF && this._lastChar !== 0x0d) {
          x = 1;
        } else {
          x += buf.length;
        }
        y += 1;
        doGoto = true;
        buf = '';
      } else if (cc === 0x0c) {
        // FF — clear screen
        this.ClrScr();
        x = 1;
        y = 1;
        buf = '';
      } else if (cc === 0x0d) {
        // CR — flush, return to column 1
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x = 1;
        doGoto = true;
        buf = '';
      } else {
        // Printable: buffer it. When the buffer would push past the
        // right edge, flush and wrap.
        buf += String.fromCharCode(cc & 0xff);
        if (x + buf.length > this.WindCols) {
          this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
          buf = '';
          x = 1;
          y += 1;
          doGoto = true;
        }
      }

      this._lastChar = cc;

      // Scroll if we walked off the bottom of the window.
      if (y > this.WindRows) {
        y = this.WindRows;
        this.ScrollUpWindow(1);
        doGoto = true;
      }

      if (doGoto) {
        this.GotoXY(x, y);
      }
    }

    // Final flush
    if (buf.length > 0) {
      this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
      x += buf.length;
      this.GotoXY(x, y);
    }
  }

  /**
   * ATASCII writer — Atari 8-bit family character handling.
   *
   * ATASCII has its own set of control codes (0x1B-0x1F for cursor
   * movement, 0x7D-0x7F for clear/backspace/tab, 0x9B-0x9D for line
   * operations, etc.) that don't overlap with ANSI. The 0x1B byte
   * does double duty as both an inline escape and a regular char,
   * gated by the `_atasciiEscaped` flag.
   *
   * The structure mirrors writeASCII closely; differences are in the
   * specific control bytes and the cursor-wrap semantics (Atari wraps
   * the cursor around the window rather than scrolling).
   */
  private writeATASCII(text: string): void {
    let x = this.WhereX();
    let y = this.WhereY();
    let buf = '';

    for (let i = 0; i < text.length; i++) {
      const cc = text.charCodeAt(i);
      let doGoto = false;

      if (cc === 0x00) {
        // NULL — ignore
      } else if (cc === 0x1b && !this._atasciiEscaped) {
        // Inline escape: next byte is treated literally even if it
        // would normally be a control byte.
        this._atasciiEscaped = true;
      } else if (cc === 0x1c && !this._atasciiEscaped) {
        // Cursor up (wraps)
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        y = y > 1 ? y - 1 : this.WindRows;
        doGoto = true;
        buf = '';
      } else if (cc === 0x1d && !this._atasciiEscaped) {
        // Cursor down (wraps)
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        y = y < this.WindRows ? y + 1 : 1;
        doGoto = true;
        buf = '';
      } else if (cc === 0x1e && !this._atasciiEscaped) {
        // Cursor left (wraps)
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        x = x > 1 ? x - 1 : this.WindCols;
        doGoto = true;
        buf = '';
      } else if (cc === 0x1f && !this._atasciiEscaped) {
        // Cursor right (wraps)
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        x = x < this.WindCols ? x + 1 : 1;
        doGoto = true;
        buf = '';
      } else if (cc === 0x7d && !this._atasciiEscaped) {
        // Clear screen
        this.ClrScr();
        x = 1;
        y = 1;
        buf = '';
      } else if (cc === 0x7e && !this._atasciiEscaped) {
        // Backspace
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        buf = '';
        doGoto = true;
        if (x > 1) {
          x -= 1;
          this.FastWrite(' ', x, this.WhereYA(), this._charInfo);
        }
      } else if (cc === 0x7f && !this._atasciiEscaped) {
        // Tab
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        buf = '';
        if (x === this.WindCols) {
          x = 1;
          y += 1;
        } else {
          x += 8 - (x % 8);
        }
        doGoto = true;
      } else if (cc === 0x9b && !this._atasciiEscaped) {
        // EOL / LF
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x = 1;
        y += 1;
        doGoto = true;
        buf = '';
      } else if (cc === 0x9c && !this._atasciiEscaped) {
        // Delete line
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x = 1;
        buf = '';
        this.GotoXY(x, y);
        this.DelLine();
      } else if (cc === 0x9d && !this._atasciiEscaped) {
        // Insert line
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x = 1;
        buf = '';
        this.GotoXY(x, y);
        this.InsLine();
      } else if (cc === 0xfd && !this._atasciiEscaped) {
        // BEL (Atari)
        this.PlaySound(800, 200);
      } else if (cc === 0xfe && !this._atasciiEscaped) {
        // Delete character
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        buf = '';
        this.GotoXY(x, y);
        this.DelChar();
      } else if (cc === 0xff && !this._atasciiEscaped) {
        // Insert character
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        buf = '';
        this.GotoXY(x, y);
        this.InsChar();
      } else {
        // Printable — but apply the Lantronix workaround: some Lantronix
        // adapters send 0x00 after every 0x0D, which we silently drop
        // to avoid double-spacing.
        if (cc === 0x00 && this._lastChar === 0x0d) {
          // drop
        } else {
          buf += String.fromCharCode(cc & 0xff);
        }
        this._atasciiEscaped = false;
        this._lastChar = cc;

        if (x + buf.length > this.WindCols) {
          this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
          buf = '';
          x = 1;
          y += 1;
          doGoto = true;
        }
      }

      if (y > this.WindRows) {
        y = this.WindRows;
        this.ScrollUpWindow(1);
        doGoto = true;
      }

      if (doGoto) {
        this.GotoXY(x, y);
      }
    }

    if (buf.length > 0) {
      this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
      x += buf.length;
      this.GotoXY(x, y);
    }
  }

  /**
   * PETSCII writer — Commodore 64/128 character handling.
   *
   * PETSCII has even more inline color/control codes than ATASCII:
   * 0x05/0x1C/etc. set foreground color, 0x12/0x92 toggle reverse,
   * 0x0E/0x8E switch between upper-case-only and mixed-case fonts.
   * The control byte set is captured in `_flushBeforeWritePETSCII`.
   *
   * One quirk: PETSCII uses 0x0D (and 0x8D) for newline; the trailing
   * 0x0A from any CR-LF pair is silently dropped to match the C64's
   * single-byte line terminator convention.
   */
  private writePETSCII(text: string): void {
    let x = this.WhereX();
    let y = this.WhereY();
    let buf = '';

    for (let i = 0; i < text.length; i++) {
      const cc = text.charCodeAt(i);
      let doGoto = false;

      // PETSCII control codes flush the buffer before being processed.
      if (buf !== '' && this._flushBeforeWritePETSCII.has(cc)) {
        this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
        x += buf.length;
        doGoto = true;
        buf = '';
      }

      if (cc === 0x00) {
        // NULL — ignore
      } else if (cc === 0x05) {
        this.TextColor(PETSCIIColor.WHITE);
      } else if (cc === 0x07) {
        this.PlaySound(800, 200);
      } else if (cc === 0x08 || cc === 0x09) {
        // SHIFT+C= charset lock toggles — not implemented
        // eslint-disable-next-line no-console
        console.log(`PETSCII charset lock 0x${cc.toString(16)}`);
      } else if (cc === 0x0a) {
        // LF — silently dropped (PETSCII uses 0x0D alone for newline)
      } else if (cc === 0x0d || cc === 0x8d) {
        // CR
        x = 1;
        y += 1;
        this._charInfo.Reverse = false;
        doGoto = true;
      } else if (cc === 0x0e) {
        this.SetFont('C64-Lower');
      } else if (cc === 0x11) {
        // Cursor down
        y += 1;
        doGoto = true;
      } else if (cc === 0x12) {
        // Reverse on
        this._charInfo.Reverse = true;
      } else if (cc === 0x13) {
        // Home
        x = 1;
        y = 1;
        doGoto = true;
      } else if (cc === 0x14) {
        // Delete (backspace + erase)
        if (x > 1 || y > 1) {
          if (x === 1) {
            x = this.WindCols;
            y -= 1;
          } else {
            x -= 1;
          }
          this.GotoXY(x, y);
          this.DelChar(1);
        }
      } else if (cc === 0x1c) {
        this.TextColor(PETSCIIColor.RED);
      } else if (cc === 0x1d) {
        // Cursor right (wraps)
        if (x === this.WindCols) {
          x = 1;
          y += 1;
        } else {
          x += 1;
        }
        doGoto = true;
      } else if (cc === 0x1e) {
        this.TextColor(PETSCIIColor.GREEN);
      } else if (cc === 0x1f) {
        this.TextColor(PETSCIIColor.BLUE);
      } else if (cc === 0x81) {
        this.TextColor(PETSCIIColor.ORANGE);
      } else if (cc === 0x8e) {
        this.SetFont('C64-Upper');
      } else if (cc === 0x90) {
        this.TextColor(PETSCIIColor.BLACK);
      } else if (cc === 0x91) {
        // Cursor up
        if (y > 1) {
          y -= 1;
          doGoto = true;
        }
      } else if (cc === 0x92) {
        this._charInfo.Reverse = false;
      } else if (cc === 0x93) {
        // Clear screen
        this.ClrScr();
        x = 1;
        y = 1;
      } else if (cc === 0x94) {
        this.GotoXY(x, y);
        this.InsChar(1);
      } else if (cc === 0x95) {
        this.TextColor(PETSCIIColor.BROWN);
      } else if (cc === 0x96) {
        this.TextColor(PETSCIIColor.LIGHTRED);
      } else if (cc === 0x97) {
        this.TextColor(PETSCIIColor.DARKGRAY);
      } else if (cc === 0x98) {
        this.TextColor(PETSCIIColor.GRAY);
      } else if (cc === 0x99) {
        this.TextColor(PETSCIIColor.LIGHTGREEN);
      } else if (cc === 0x9a) {
        this.TextColor(PETSCIIColor.LIGHTBLUE);
      } else if (cc === 0x9b) {
        this.TextColor(PETSCIIColor.LIGHTGRAY);
      } else if (cc === 0x9c) {
        this.TextColor(PETSCIIColor.PURPLE);
      } else if (cc === 0x9d) {
        // Cursor left (wraps)
        if (x > 1 || y > 1) {
          if (x === 1) {
            x = this.WindCols;
            y -= 1;
          } else {
            x -= 1;
          }
          doGoto = true;
        }
      } else if (cc === 0x9e) {
        this.TextColor(PETSCIIColor.YELLOW);
      } else if (cc === 0x9f) {
        this.TextColor(PETSCIIColor.CYAN);
      } else {
        // Printable
        buf += String.fromCharCode(cc & 0xff);
        if (x + buf.length > this.WindCols) {
          this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
          buf = '';
          x = 1;
          y += 1;
          doGoto = true;
        }
      }

      if (y > this.WindRows) {
        y = this.WindRows;
        this.ScrollUpWindow(1);
        doGoto = true;
      }

      if (doGoto) {
        this.GotoXY(x, y);
      }
    }

    if (buf.length > 0) {
      this.FastWrite(buf, this.WhereXA(), this.WhereYA(), this._charInfo);
      x += buf.length;
      this.GotoXY(x, y);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Font and screen-size management
  // ─────────────────────────────────────────────────────────

  /**
   * Request a font load. Returns true if the font is recognized.
   * The actual PNG load happens asynchronously; OnFontChanged fires
   * when it's ready and redraws the screen.
   *
   * Picks the largest available size that fits in the container's
   * width and the window's height.
   */
  public SetFont(font: string): boolean {
    // The container's parent is now the same width as the canvas in
    // both classic and modern scrollback modes, so we have to look at
    // the grandparent to discover the actual available width.
    const widthSource = this._container.parentElement ?? this._container;
    const maxCellWidth = Math.floor(widthSource.clientWidth / this._screenSize.x);
    const maxCellHeight = Math.floor(window.innerHeight / this._screenSize.y);
    return this._font.Load(font, maxCellWidth, maxCellHeight);
  }

  /**
   * Change the number of cells on the screen. Preserves as much of the
   * existing screen contents as fits.
   *
   * Original comment: `// TODO Doesn't seem to be working`. We keep
   * the behavior the same — if it's been buggy, fixing it should be
   * its own change, not part of this migration.
   */
  public SetScreenSize(columns: number, rows: number): void {
    if (this._inScrollback) {
      return;
    }
    if (columns === this._screenSize.x && rows === this._screenSize.y) {
      return;
    }

    // Save old buffer
    const oldBuffer: CharInfo[][] = [];
    for (let y = 1; y <= this._screenSize.y; y++) {
      oldBuffer[y] = [];
      for (let x = 1; x <= this._screenSize.x; x++) {
        oldBuffer[y]![x] = new CharInfo(this._buffer[y]![x]!);
      }
    }
    const oldScreenSize = new Point(this._screenSize.x, this._screenSize.y);

    // Update size, window extents, and buffer.
    this._screenSize.x = columns;
    this._screenSize.y = rows;
    this._windMin = 0;
    this._windMax = (this._screenSize.x - 1) | ((this._screenSize.y - 1) << 8);
    this.InitBuffers(false);

    // Resize canvas
    this._canvas.width = this._font.Width * this._screenSize.x;
    if (this._useModernScrollback) {
      this._canvas.height = this._font.Height * (this._screenSize.y + this._scrollbackSize);
      this._canvasContext.fillRect(0, 0, this._canvas.width, this._canvas.height);
      this._tempCanvas.width = this._canvas.width;
      this._tempCanvas.height = this._canvas.height;
    } else {
      this._canvas.height = this._font.Height * this._screenSize.y;
    }

    // Restore as much of the old screen as fits (top-aligned —
    // matches the original's behavior, including its "TODO restore
    // bottom portion if shrinking" comment).
    for (let y = 1; y <= Math.min(this._screenSize.y, oldScreenSize.y); y++) {
      for (let x = 1; x <= Math.min(this._screenSize.x, oldScreenSize.x); x++) {
        this.FastWrite(oldBuffer[y]![x]!.Ch, x, y, oldBuffer[y]![x]!);
      }
    }

    this.onscreensizechange.trigger();
  }

  // ─────────────────────────────────────────────────────────
  // Audio: PC speaker emulation via Web Audio API
  // ─────────────────────────────────────────────────────────

  /**
   * Play a tone of `freq` Hz for `duration` ms.
   *
   * Requests are queued. If a tone is already playing, this one waits
   * its turn — important for ANSI music sequences that send multiple
   * notes in rapid succession.
   *
   * The Web Audio context is created lazily on first call to avoid
   * the "AudioContext not created on user gesture" console warning
   * that every browser prints when the eager construction would have
   * happened during page load.
   */
  public PlaySound(freq: number, duration: number): void {
    this._playSoundQueue.push(new Point(freq, duration));
    if (this._playSoundQueue.length === 1) {
      this.playNextSound();
    }
  }

  private playNextSound(): void {
    if (this._playSoundQueue.length === 0) {
      return;
    }

    // Lazy-init the AudioContext. Some browsers throw if you call new
    // AudioContext() without a recent user gesture; in that case we
    // drop the request silently.
    if (!this._audioContext) {
      try {
        this._audioContext = new AudioContext();
      } catch {
        this._playSoundQueue.length = 0;
        return;
      }
    }
    const audioContext = this._audioContext;

    const next = this._playSoundQueue[0]!;
    const freq = next.x;
    const duration = next.y;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain).connect(audioContext.destination);
    osc.frequency.value = freq;

    osc.onended = (): void => {
      this._playSoundQueue.shift();
      if (this._playSoundQueue.length > 0) {
        this.playNextSound();
      }
    };

    // Ramp gain from 0 → 1 at the start and 1 → 0 at the end to
    // avoid the click that abrupt amplitude changes produce.
    const startTime = audioContext.currentTime;
    const endTime = startTime + duration / 1000;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + 0.05);
    gain.gain.setValueAtTime(1, endTime - 0.05);
    gain.gain.linearRampToValueAtTime(0, endTime);
    osc.start(startTime);
    osc.stop(endTime);
  }

  // ─────────────────────────────────────────────────────────
  // Synthetic key events (used by the on-screen virtual keyboard
  // and by the scrollback view for paging)
  // ─────────────────────────────────────────────────────────

  /**
   * Push a synthetic keydown event into the input pipeline. The on-
   * screen virtual keyboard uses this for keys that browsers don't
   * fire normal `keydown` events for (Break, function keys on mobile,
   * etc.); the scrollback view uses it internally to handle Page Up /
   * Page Down by simulating multiple Up/Down arrow presses.
   *
   * The original cast a partial object literal to `KeyboardEvent`. In
   * strict TypeScript that requires a structural assertion; rather
   * than fight the type system, we build a minimal stub that
   * implements just the fields OnKeyDown actually reads, then assert
   * to KeyboardEvent at the call site.
   */
  public PushKeyDown(
    pushedCharCode: number,
    pushedKeyCode: number,
    ctrl: boolean,
    alt: boolean,
    shift: boolean
  ): void {
    this.OnKeyDown(this.makeSyntheticKeyEvent(pushedCharCode, pushedKeyCode, ctrl, alt, shift));
  }

  /** Push a synthetic keypress event. Counterpart to PushKeyDown. */
  public PushKeyPress(
    pushedCharCode: number,
    pushedKeyCode: number,
    ctrl: boolean,
    alt: boolean,
    shift: boolean
  ): void {
    this.OnKeyPress(this.makeSyntheticKeyEvent(pushedCharCode, pushedKeyCode, ctrl, alt, shift));
  }

  /**
   * Build a partial KeyboardEvent stub for the synthetic-key helpers.
   * Only the fields OnKeyDown / OnKeyPress actually read are filled
   * in; the `as KeyboardEvent` cast at the end tells TypeScript to
   * trust the caller.
   */
  private makeSyntheticKeyEvent(
    charCode: number,
    keyCode: number,
    ctrl: boolean,
    alt: boolean,
    shift: boolean
  ): KeyboardEvent {
    return {
      altKey: alt,
      charCode,
      ctrlKey: ctrl,
      keyCode,
      shiftKey: shift,
      which: charCode,
      target: null,
      preventDefault: (): void => {
        /* synthetic event — nothing to suppress */
      },
    } as unknown as KeyboardEvent;
  }

  // ─────────────────────────────────────────────────────────
  // Scrollback view
  // ─────────────────────────────────────────────────────────

  /**
   * Enter scrollback mode: stop accepting normal input and let the
   * user page through history with Up/Down/PageUp/PageDown.
   *
   * Modern-scrollback mode doesn't need this — the whole scrollback
   * lives on the canvas above the visible viewport and the user can
   * just scroll the page. This method is a no-op in that mode.
   */
  public EnterScrollback(): void {
    if (this._useModernScrollback) {
      return;
    }
    if (this._inScrollback) {
      return;
    }
    this._inScrollback = true;

    // Build the scrollback view: history rows + current screen.
    this._scrollbackTemp = [];
    for (let y = 0; y < this._scrollback.length; y++) {
      const row: CharInfo[] = [];
      const sourceRow = this._scrollback[y]!;
      for (let x = 0; x < sourceRow.length; x++) {
        row.push(new CharInfo(sourceRow[x]!));
      }
      this._scrollbackTemp.push(row);
    }
    for (let y = 1; y <= this._screenSize.y; y++) {
      const row: CharInfo[] = [];
      for (let x = 1; x <= this._screenSize.x; x++) {
        row.push(new CharInfo(this._buffer[y]![x]!));
      }
      this._scrollbackTemp.push(row);
    }

    // Position at the bottom of history (showing the live screen).
    this._scrollbackPosition = this._scrollbackTemp.length;
  }

  /**
   * Exit scrollback mode and return to the live screen.
   */
  public ExitScrollback(): void {
    // Repaint the live buffer over whatever scrollback rows were shown.
    for (let y = 1; y <= this._screenSize.y; y++) {
      for (let x = 1; x <= this._screenSize.x; x++) {
        const cell = this._buffer[y]?.[x];
        if (cell) {
          this.FastWrite(cell.Ch, x, y, cell, false);
        }
      }
    }
    this._inScrollback = false;
  }

  // ─────────────────────────────────────────────────────────
  // Internal event handlers
  // ─────────────────────────────────────────────────────────

  /**
   * Cursor blink "hide" tick. Two things happen here:
   *   1. Any blinking text in the buffer is temporarily replaced
   *      with spaces (drawn to canvas only — buffer unchanged).
   *   2. The cursor block is drawn at the current position.
   *
   * The original comment notes the cursor is drawn on hide (not show)
   * so blinking text and the cursor never overlap visually.
   */
  private OnBlinkHide(): void {
    this._blinkHidden = true;

    for (let y = 1; y <= this._screenSize.y; y++) {
      for (let x = 1; x <= this._screenSize.x; x++) {
        const cell = this._buffer[y]?.[x];
        if (cell?.Blink && cell.Ch !== ' ') {
          this.FastWrite(' ', x, y, cell, false);
        }
      }
    }

    // Draw the cursor as a thin bar at the bottom 20% of the cell.
    this._canvasContext.fillStyle = this._cursor.Colour;
    const barHeight = this._font.Size.y * 0.2;
    const xPx = (this.WhereXA() - 1) * this._font.Size.x;
    const baseY = this._useModernScrollback
      ? (this.WhereYA() + this._scrollbackSize) * this._font.Size.y
      : this.WhereYA() * this._font.Size.y;
    this._canvasContext.fillRect(xPx, baseY - barHeight, this._font.Size.x, barHeight);
    this._cursor.LastPosition = new Point(this.WhereXA(), this.WhereYA());
  }

  /**
   * Cursor blink "show" tick. Counterpart to OnBlinkHide:
   *   1. Restore any blinking text that was hidden.
   *   2. Redraw the cell at the cursor's last drawn position to
   *      erase the cursor bar.
   *
   * The "last drawn position" tracking is imperfect — the original
   * notes that hitting Enter or Backspace while the cursor is shown
   * can leave a stray cursor artifact. Preserved as-is.
   */
  private OnBlinkShow(): void {
    if (this._blinkHidden) {
      this._blinkHidden = false;
      for (let y = 1; y <= this._screenSize.y; y++) {
        for (let x = 1; x <= this._screenSize.x; x++) {
          const cell = this._buffer[y]?.[x];
          if (cell?.Blink && cell.Ch !== ' ') {
            this.FastWrite(cell.Ch, x, y, cell, false);
          }
        }
      }
    }

    // Erase the cursor by redrawing the cell where it was last drawn.
    const lastX = this._cursor.LastPosition.x;
    const lastY = this._cursor.LastPosition.y;
    const cell = this._buffer[lastY]?.[lastX];
    if (cell) {
      this.FastWrite(cell.Ch, lastX, lastY, cell, false);
    }
  }

  /**
   * Called by CrtFont after a new font PNG has been loaded.
   *
   * If the new font has the same dimensions as the old and
   * `_skipRedrawWhenSameFontSize` is set, we only redraw cells that
   * were marked `NeedsRedraw` (cells that were written while the font
   * load was in flight). Otherwise we resize the canvas and redraw
   * the entire buffer.
   */
  private OnFontChanged(oldSize: Point): void {
    if (oldSize.x === this._font.Size.x && oldSize.y === this._font.Size.y) {
      if (this._skipRedrawWhenSameFontSize) {
        // Partial redraw: only cells that asked for it.
        for (let y = 1; y <= this._screenSize.y; y++) {
          for (let x = 1; x <= this._screenSize.x; x++) {
            const cell = this._buffer[y]?.[x];
            if (cell?.NeedsRedraw) {
              this.FastWrite(cell.Ch, x, y, cell, false);
              cell.NeedsRedraw = false;
            }
          }
        }
        return;
      }
    }

    // Full canvas resize and redraw.
    this._cursor.Size = this._font.Size;
    this._canvas.width = this._font.Width * this._screenSize.x;
    if (this._useModernScrollback) {
      this._canvas.height = this._font.Height * (this._screenSize.y + this._scrollbackSize);
      this._canvasContext.fillRect(0, 0, this._canvas.width, this._canvas.height);
    } else {
      this._canvas.height = this._font.Height * this._screenSize.y;
    }
    this._tempCanvas.width = this._canvas.width;
    this._tempCanvas.height = this._canvas.height;

    // Repaint every cell.
    for (let y = 1; y <= this._screenSize.y; y++) {
      for (let x = 1; x <= this._screenSize.x; x++) {
        const cell = this._buffer[y]?.[x];
        if (cell) {
          this.FastWrite(cell.Ch, x, y, cell, false);
          cell.NeedsRedraw = false;
        }
      }
    }

    this.onfontchange.trigger();
  }
  // ─────────────────────────────────────────────────────────
  // Keyboard handlers
  // ─────────────────────────────────────────────────────────

  /**
   * Handle a `keydown` event. Two main responsibilities:
   *
   *   1. While in scrollback mode, intercept arrow / page keys and
   *      page through history instead of sending them to the BBS.
   *   2. Otherwise, map keys (modifier + keycode combinations) to
   *      the ANSI escape sequences the BBS expects, then queue them.
   *
   * The mapping tables vary by emulation mode (Atari / C64 / ANSI).
   * Ctrl-A through Ctrl-Z generate 0x01-0x1A in ANSI mode; the Atari
   * variant has overrides for Ctrl-H/J/M (which map to ATASCII-specific
   * codes 0x7E, 0x0D, 0x9B respectively).
   */
  private OnKeyDown(ke: KeyboardEvent): void {
    // Skip if focus is on an input element somewhere on the page —
    // otherwise typing in those would also get queued as terminal input.
    if (ke.target instanceof HTMLInputElement || ke.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (this._inScrollback) {
      this.handleKeyDownInScrollback(ke);
      return;
    }

    let keyString = '';

    if (this._atari) {
      keyString = this.encodeKeyDownAtari(ke);
    } else if (this._c64) {
      keyString = this.encodeKeyDownC64(ke);
    } else {
      keyString = this.encodeKeyDownAnsi(ke);
    }

    this._keyBuf.push(new KeyPressEvent(ke, keyString));

    // We consume the event (and notify listeners) only if we mapped
    // it to something. Ctrl is always consumed even with no mapping
    // so the browser doesn't intercept (e.g. Ctrl-N opening a new
    // window when we wanted to send Ctrl-N to the BBS).
    if (keyString !== '' || ke.ctrlKey) {
      ke.preventDefault();
      this.onkeypressed.trigger();
    }
  }

  /**
   * Scrollback-mode key handling: Up/Down scroll one row, PageUp/Down
   * scroll one screen (implemented as a loop of single-row scrolls
   * via the synthetic-key mechanism so the same logic handles both).
   */
  private handleKeyDownInScrollback(ke: KeyboardEvent): void {
    if (ke.keyCode === KeyboardKeys.DOWN) {
      this.scrollbackScrollDown();
    } else if (ke.keyCode === KeyboardKeys.UP) {
      this.scrollbackScrollUp();
    } else if (ke.keyCode === KeyboardKeys.PAGE_DOWN) {
      for (let i = 0; i < this._screenSize.y; i++) {
        this.PushKeyDown(KeyboardKeys.DOWN, KeyboardKeys.DOWN, false, false, false);
      }
    } else if (ke.keyCode === KeyboardKeys.PAGE_UP) {
      for (let i = 0; i < this._screenSize.y; i++) {
        this.PushKeyDown(KeyboardKeys.UP, KeyboardKeys.UP, false, false, false);
      }
    }
    ke.preventDefault();
  }

  /** Scroll one row down in scrollback view (toward the live screen). */
  private scrollbackScrollDown(): void {
    if (this._scrollbackPosition < this._scrollbackTemp.length) {
      this._scrollbackPosition += 1;
      this.ScrollUpCustom(
        1,
        1,
        this._screenSize.x,
        this._screenSize.y,
        1,
        new CharInfo(null),
        false
      );

      const yDest = this._screenSize.y;
      const ySource = this._scrollbackPosition - 1;
      const sourceRow = this._scrollbackTemp[ySource];
      if (sourceRow) {
        const xEnd = Math.min(this._screenSize.x, sourceRow.length);
        for (let x = 0; x < xEnd; x++) {
          this.FastWrite(sourceRow[x]!.Ch, x + 1, yDest, sourceRow[x]!, false);
        }
      }
    }
  }

  /** Scroll one row up in scrollback view (further back in history). */
  private scrollbackScrollUp(): void {
    if (this._scrollbackPosition > this._screenSize.y) {
      this._scrollbackPosition -= 1;
      this.ScrollDownCustom(
        1,
        1,
        this._screenSize.x,
        this._screenSize.y,
        1,
        new CharInfo(null),
        false
      );

      const yDest = 1;
      const ySource = this._scrollbackPosition - this._screenSize.y;
      const sourceRow = this._scrollbackTemp[ySource];
      if (sourceRow) {
        const xEnd = Math.min(this._screenSize.x, sourceRow.length);
        for (let x = 0; x < xEnd; x++) {
          this.FastWrite(sourceRow[x]!.Ch, x + 1, yDest, sourceRow[x]!, false);
        }
      }
    }
  }

  /**
   * Encode a keydown event in ANSI/CTERM mode.
   *
   * Ctrl-letter: A-Z (65-90) → 0x01-0x1A; a-z (97-122) → 0x01-0x1A.
   * Other special keys map to standard CSI sequences (CSI A for up,
   * CSI [ H for Home, etc.) Function keys use the xterm convention
   * (F1-F5 → ESC O P/Q/R/S/t, F6-F12 → CSI 17-24 ~).
   */
  private encodeKeyDownAnsi(ke: KeyboardEvent): string {
    if (ke.ctrlKey) {
      if (ke.keyCode >= 65 && ke.keyCode <= 90) {
        return String.fromCharCode(ke.keyCode - 64);
      }
      if (ke.keyCode >= 97 && ke.keyCode <= 122) {
        return String.fromCharCode(ke.keyCode - 96);
      }
      return '';
    }

    switch (ke.keyCode) {
      case KeyboardKeys.BACKSPACE: return '\b';
      case KeyboardKeys.DELETE: return '\x7F';
      case KeyboardKeys.DOWN: return '\x1B[B';
      case KeyboardKeys.END: return '\x1B[K';
      case KeyboardKeys.ENTER: return '\r\n';
      case KeyboardKeys.ESCAPE: return '\x1B';
      case KeyboardKeys.F1: return '\x1BOP';
      case KeyboardKeys.F2: return '\x1BOQ';
      case KeyboardKeys.F3: return '\x1BOR';
      case KeyboardKeys.F4: return '\x1BOS';
      case KeyboardKeys.F5: return '\x1BOt';
      case KeyboardKeys.F6: return '\x1B[17~';
      case KeyboardKeys.F7: return '\x1B[18~';
      case KeyboardKeys.F8: return '\x1B[19~';
      case KeyboardKeys.F9: return '\x1B[20~';
      case KeyboardKeys.F10: return '\x1B[21~';
      case KeyboardKeys.F11: return '\x1B[23~';
      case KeyboardKeys.F12: return '\x1B[24~';
      case KeyboardKeys.HOME: return '\x1B[H';
      case KeyboardKeys.INSERT: return '\x1B@';
      case KeyboardKeys.LEFT: return '\x1B[D';
      case KeyboardKeys.PAGE_DOWN: return '\x1B[U';
      case KeyboardKeys.PAGE_UP: return '\x1B[V';
      case KeyboardKeys.RIGHT: return '\x1B[C';
      case KeyboardKeys.SPACE: return ' ';
      case KeyboardKeys.TAB: return '\t';
      case KeyboardKeys.UP: return '\x1B[A';
      default: return '';
    }
  }

  /**
   * Encode a keydown event in Atari ATASCII mode.
   *
   * Ctrl handling has three overrides from the otherwise-standard
   * "Ctrl-X → X-64" pattern:
   *   Ctrl-H → 0x7E (ATASCII backspace, not 0x08)
   *   Ctrl-J → 0x0D (CR, not 0x0A)
   *   Ctrl-M → 0x9B (ATASCII EOL, not 0x0D)
   *
   * Non-ctrl special keys use ATASCII-specific control bytes
   * (0x1C-0x1F for cursor moves, etc.) — completely different from
   * the ANSI mode's CSI sequences.
   */
  private encodeKeyDownAtari(ke: KeyboardEvent): string {
    if (ke.ctrlKey) {
      if (ke.keyCode >= 65 && ke.keyCode <= 90) {
        switch (ke.keyCode) {
          case 72: return String.fromCharCode(126); // Ctrl-H → ~
          case 74: return String.fromCharCode(13);  // Ctrl-J → CR
          case 77: return String.fromCharCode(155); // Ctrl-M → ATASCII EOL
          default: return String.fromCharCode(ke.keyCode - 64);
        }
      }
      if (ke.keyCode >= 97 && ke.keyCode <= 122) {
        switch (ke.keyCode) {
          case 104: return String.fromCharCode(126);
          case 106: return String.fromCharCode(13);
          case 109: return String.fromCharCode(155);
          default: return String.fromCharCode(ke.keyCode - 96);
        }
      }
      return '';
    }

    switch (ke.keyCode) {
      case KeyboardKeys.BACKSPACE: return '\x7E';
      case KeyboardKeys.DELETE: return '\x7E';
      case KeyboardKeys.DOWN: return '\x1D';
      case KeyboardKeys.ENTER: return '\x9B';
      case KeyboardKeys.LEFT: return '\x1E';
      case KeyboardKeys.RIGHT: return '\x1F';
      case KeyboardKeys.SPACE: return ' ';
      case KeyboardKeys.TAB: return '\x7F';
      case KeyboardKeys.UP: return '\x1C';
      default: return '';
    }
  }

  /**
   * Encode a keydown event in Commodore 64 PETSCII mode.
   *
   * The C64 doesn't use Ctrl-letter combos the same way — special
   * keys go through the function-key set (F1-F8) with their own
   * PETSCII codes.
   */
  private encodeKeyDownC64(ke: KeyboardEvent): string {
    switch (ke.keyCode) {
      case KeyboardKeys.BACKSPACE: return '\x14';
      case KeyboardKeys.DELETE: return '\x14';
      case KeyboardKeys.DOWN: return '\x11';
      case KeyboardKeys.ENTER: return '\r';
      case KeyboardKeys.F1: return '\x85';
      case KeyboardKeys.F2: return '\x89';
      case KeyboardKeys.F3: return '\x86';
      case KeyboardKeys.F4: return '\x8A';
      case KeyboardKeys.F5: return '\x87';
      case KeyboardKeys.F6: return '\x8B';
      case KeyboardKeys.F7: return '\x88';
      case KeyboardKeys.F8: return '\x8C';
      case KeyboardKeys.HOME: return '\x13';
      case KeyboardKeys.INSERT: return '\x94';
      case KeyboardKeys.LEFT: return '\x9D';
      case KeyboardKeys.RIGHT: return '\x1D';
      case KeyboardKeys.SPACE: return ' ';
      case KeyboardKeys.UP: return '\x91';
      default: return '';
    }
  }

  /**
   * Handle a `keypress` event — fired for printable characters,
   * regardless of locale or input method. This is where we collect
   * actual typed text (vs OnKeyDown's special-key handling).
   *
   * Modifier keys (Alt, Ctrl) are ignored here — those are handled
   * in OnKeyDown's encode* methods. Alt+key isn't even routed through
   * keypress on most browsers.
   *
   * Phase 1 note: the original used a deprecated `ke.charCode` field
   * with a fallback to `ke.which`. Modern browsers prefer
   * `KeyboardEvent.key` (a string) over both. We keep the deprecated
   * path for now to avoid changing input behavior during the migration;
   * the UI facelift in Phase 3 will modernize this.
   */
  private OnKeyPress(ke: KeyboardEvent): void {
    if (ke.target instanceof HTMLInputElement || ke.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (this._inScrollback) {
      return;
    }
    if (ke.altKey || ke.ctrlKey) {
      return;
    }

    let keyString = '';
    // Some old browsers (Opera) used `which` instead of `charCode`.
    const which = typeof ke.charCode !== 'undefined' ? ke.charCode : ke.which;

    if (this._atari) {
      if (which >= 33 && which <= 122) {
        keyString = String.fromCharCode(which);
      }
    } else if (this._c64) {
      // C64 mode swaps case for letters since PETSCII fonts encode
      // upper- and lower-case in non-standard slots.
      if (which >= 33 && which <= 64) {
        keyString = String.fromCharCode(which);
      } else if (which >= 65 && which <= 90) {
        keyString = String.fromCharCode(which).toLowerCase();
      } else if (which >= 91 && which <= 95) {
        keyString = String.fromCharCode(which);
      } else if (which >= 97 && which <= 122) {
        keyString = String.fromCharCode(which).toUpperCase();
      }
    } else {
      // ANSI: original capped at 126 but commented that this breaks
      // French accented chars, and the simplified `>= 33` was kept.
      // We preserve that.
      if (which >= 33) {
        keyString = String.fromCharCode(which);
      }
    }

    this._keyBuf.push(new KeyPressEvent(ke, keyString));
    if (keyString !== '') {
      ke.preventDefault();
      this.onkeypressed.trigger();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Mouse handlers
  // ─────────────────────────────────────────────────────────

  /**
   * Convert a mouse event's pixel coordinates to a 1-based screen cell.
   * Accounts for canvas CSS scaling and the modern-scrollback offset.
   */
  private MousePositionToScreenPosition(x: number, y: number): Point {
    const rect = this._canvas.getBoundingClientRect();
    x *= this._canvas.width / rect.width;
    y *= this._canvas.height / rect.height;
    if (this._useModernScrollback) {
      y -= this._scrollbackSize * this._font.Height;
    }
    return new Point(Math.floor(x / this._font.Width) + 1, Math.floor(y / this._font.Height) + 1);
  }

  /**
   * Start a click / drag selection. If mouse reporting is enabled,
   * also fires an `onmousereport` event with the encoded position
   * (xterm-style or SGR-extended depending on `ReportMouseSgr`).
   */
  private OnMouseDown(me: MouseEvent): void {
    this._mouseDownPoint = this.mouseEventToScreenPosition(me);
    this._mouseMovePoint = new Point(this._mouseDownPoint.x, this._mouseDownPoint.y);

    if (this._reportMouse) {
      this.fireMouseReport(me.button, this._mouseDownPoint, false);
    }
  }

  /** Resolve a MouseEvent to a 1-based screen cell. */
  private mouseEventToScreenPosition(me: MouseEvent): Point {
    if (typeof me.offsetX !== 'undefined') {
      return this.MousePositionToScreenPosition(me.offsetX, me.offsetY);
    }
    const off = getOffset(this._canvas);
    return this.MousePositionToScreenPosition(me.clientX - off.x, me.clientY - off.y);
  }

  /**
   * Emit a mouse-position report in either the old xterm CSI M format
   * or the SGR-extended CSI < ... M/m format, depending on settings.
   *
   * @param isUp true for mouseup events (uses button 3 in xterm mode,
   *             lowercase 'm' in SGR mode)
   */
  private fireMouseReport(button: number, pos: Point, isUp: boolean): void {
    if (this._reportMouseSgr) {
      const terminator = isUp ? 'm' : 'M';
      this.onmousereport.trigger(`\x1B[<${button};${pos.x};${pos.y}${terminator}`);
      return;
    }

    // Classic xterm encoding: ESC [ M then three encoded bytes.
    // Button: 32 + n (mouseup uses 32 + 3 = 35).
    // Position: 33 + (n - 1), clamped to 0..222 (the cap matches the
    // original; xterm's spec actually allows higher with extended
    // coordinates, but the classic mode caps at 7-bit ASCII range).
    const buttonChar = ' '.charCodeAt(0) + (isUp ? 3 : button);
    const clamp = (n: number): number => Math.max(0, Math.min(222, n));
    const xChar = clamp('!'.charCodeAt(0) + pos.x - 1);
    const yChar = clamp('!'.charCodeAt(0) + pos.y - 1);
    this.onmousereport.trigger(
      `\x1B[M${String.fromCharCode(buttonChar)}${String.fromCharCode(xChar)}${String.fromCharCode(yChar)}`
    );
  }

  /**
   * Mid-drag mouse-move: update the selection highlight.
   *
   * Two passes: first un-highlight the previous selection rectangle
   * (set Reverse=false and redraw), then highlight the new one. This
   * avoids flicker compared to redrawing the whole screen every move.
   */
  private OnMouseMove(me: MouseEvent): void {
    if (!this._mouseDownPoint) {
      return;
    }
    const newMovePoint = this.mouseEventToScreenPosition(me);

    if (this._mouseMovePoint) {
      // Bail if the cursor hasn't moved to a new cell.
      if (this._mouseMovePoint.x === newMovePoint.x && this._mouseMovePoint.y === newMovePoint.y) {
        return;
      }

      // Un-highlight the previous selection rectangle.
      this.applyHighlightRange(this._mouseDownPoint, this._mouseMovePoint, false);
      // Highlight the new one.
      this.applyHighlightRange(this._mouseDownPoint, newMovePoint, true);
    }

    this._mouseMovePoint = newMovePoint;
  }

  /**
   * Set or clear `Reverse` on every cell between `from` and `to`
   * (text-flow order: row by row, left to right). The orientation
   * is normalized internally so callers don't have to worry about
   * which point is upper-left vs lower-right.
   */
  private applyHighlightRange(from: Point, to: Point, highlight: boolean): void {
    let a = new Point(from.x, from.y);
    let b = new Point(to.x, to.y);
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) {
      [a, b] = [b, a];
    }
    for (let y = a.y; y <= b.y; y++) {
      const firstX = y === a.y ? a.x : 1;
      const lastX = y === b.y ? b.x : this._screenSize.x;
      for (let x = firstX; x <= lastX; x++) {
        const cell = this._buffer[y]?.[x];
        if (cell) {
          cell.Reverse = highlight;
          this.FastWrite(cell.Ch, x, y, cell, false);
        }
      }
    }
  }

  /**
   * Mouse-up over the canvas. Two cases:
   *
   *   1. Single-cell click (down and up at the same position) → check
   *      whether the clicked word is a URL; if so, prompt to open it.
   *   2. Multi-cell drag → un-highlight the selection and copy the
   *      selected text to the system clipboard.
   *
   * In either case, if mouse reporting is enabled, also fires the
   * mouseup report. The original explicitly used button=3 (xterm
   * release marker) in xterm mode and just `m` instead of `M` in SGR.
   */
  private OnMouseUp(me: MouseEvent): void {
    const upPoint = this.mouseEventToScreenPosition(me);

    if (this._mouseDownPoint) {
      const downPoint = new Point(this._mouseDownPoint.x, this._mouseDownPoint.y);

      if (downPoint.x === upPoint.x && downPoint.y === upPoint.y) {
        this.handleSingleCellClick(downPoint);
      } else {
        this.handleDragSelectionCopy(downPoint, upPoint);
      }
    }

    this._mouseDownPoint = undefined;
    this._mouseMovePoint = undefined;

    if (this._reportMouse) {
      this.fireMouseReport(me.button, upPoint, true);
    }
  }

  /**
   * Handle a single-cell click: scan left and right from the clicked
   * cell to extract the contiguous word, and if it starts with
   * http:// or https://, prompt the user to open it.
   */
  private handleSingleCellClick(downPoint: Point): void {
    const row = this._buffer[downPoint.y];
    if (!row) {
      return;
    }
    const cell = row[downPoint.x];
    if (!cell) {
      return;
    }
    const cc = cell.Ch.charCodeAt(0);
    if (cc <= 32 || cc > 126) {
      // Clicked on a space or non-printable; nothing to do.
      return;
    }

    // Walk left to the previous non-printable.
    let startX = downPoint.x;
    while (startX > 1) {
      const prev = row[startX - 1];
      if (!prev) break;
      const pc = prev.Ch.charCodeAt(0);
      if (pc <= 32 || pc > 126) break;
      startX -= 1;
    }
    // Walk right to the next non-printable.
    let endX = downPoint.x;
    while (endX < this._screenSize.x) {
      const next = row[endX + 1];
      if (!next) break;
      const nc = next.Ch.charCodeAt(0);
      if (nc <= 32 || nc > 126) break;
      endX += 1;
    }

    let clickedWord = '';
    for (let x = startX; x <= endX; x++) {
      clickedWord += row[x]?.Ch ?? '';
    }

    const lower = clickedWord.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      // eslint-disable-next-line no-alert
      if (confirm(`Would you like to open this url in a new window?\n\n${clickedWord}`)) {
        window.open(clickedWord);
      }
    }
  }

  /**
   * Handle a multi-cell drag: un-highlight the selection rectangle
   * and copy the selected text (with newlines between rows) to the
   * clipboard.
   *
   * Note: the original had a subtle bug — it added `\r\n` between
   * rows only when `y < DownPoint.y` (a condition that's impossible
   * after the point-flip earlier in the method, so it never fired).
   * The net effect was that multi-row selections came out concatenated
   * with no line breaks. We preserve the original's behavior here
   * rather than "fix" it, since changing copy semantics during a pure
   * migration is risky. Flagged as a TODO for a later pass.
   */
  private handleDragSelectionCopy(downPoint: Point, upPoint: Point): void {
    let a = downPoint;
    let b = upPoint;
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) {
      [a, b] = [b, a];
    }

    let text = '';
    for (let y = a.y; y <= b.y; y++) {
      const firstX = y === a.y ? a.x : 1;
      const lastX = y === b.y ? b.x : this._screenSize.x;
      const row = this._buffer[y];
      if (!row) continue;

      for (let x = firstX; x <= lastX; x++) {
        const cell = row[x];
        if (cell) {
          cell.Reverse = false;
          this.FastWrite(cell.Ch, x, y, cell, false);
          text += cell.Ch;
        } else {
          text += ' ';
        }
      }
      // See docstring: the original's "add CRLF between rows" check
      // was unreachable. Preserving that.
    }

    ClipboardHelper.SetData(text);
  }

  /**
   * Mouseup outside the canvas. If a drag was in progress, just
   * un-highlight the selection — don't copy.
   */
  private OnMouseUpForWindow(_me: MouseEvent): void {
    if (this._mouseDownPoint && this._mouseMovePoint) {
      if (
        this._mouseDownPoint.x !== this._mouseMovePoint.x ||
        this._mouseDownPoint.y !== this._mouseMovePoint.y
      ) {
        this.applyHighlightRange(this._mouseDownPoint, this._mouseMovePoint, false);
      }
    }
    this._mouseDownPoint = undefined;
    this._mouseMovePoint = undefined;
  }

  /**
   * Window resize: if dynamic font resize is enabled, ask CrtFont to
   * pick the largest size that still fits the new viewport.
   */
  private OnResize(): void {
    if (this._allowDynamicFontResize) {
      this.SetFont(this._font.Name);
    }
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
