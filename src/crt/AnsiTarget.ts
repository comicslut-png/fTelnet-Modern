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

import type { CharInfo } from './CharInfo.js';
import type { CrtFont } from './CrtFont.js';

/**
 * Surface area `Ansi` needs from the terminal it's driving.
 *
 * This interface decouples the ANSI parser from the full `Crt` class.
 * The migrated `Crt` (Delta 3c) will implement it naturally — it
 * already exposes every member listed here.
 *
 * Same architectural pattern we used in Delta 2 for `WindowSizeSource`
 * with `TelnetConnection`: a narrow interface that captures only what
 * the dependent module uses, so tests can stub out the dependency
 * without standing up a full terminal.
 *
 * The 47 members below cover every method/property that Ansi.ts
 * touches on `_Crt` in the original code, verified via grep.
 */
export interface AnsiTarget {
  // ───────── Properties ─────────

  /** True when the terminal is in Atari mode (ANSI parsing is skipped). */
  readonly Atari: boolean;

  /** True when the terminal is in C64 mode (ANSI parsing is skipped). */
  readonly C64: boolean;

  /** The CharInfo describing the current text attribute (read by 'X'). */
  readonly CharInfo: CharInfo;

  /** Current font (read for screen-size-in-pixels queries). */
  readonly Font: CrtFont;

  /** True iff XTerm-style normal mouse reporting is enabled. */
  ReportMouse: boolean;

  /** True iff XTerm-style SGR-encoded extended mouse reporting is enabled. */
  ReportMouseSgr: boolean;

  /** Current screen size in cells (whole terminal, not window). */
  readonly ScreenCols: number;
  readonly ScreenRows: number;

  /** The current text attribute (low nibble fg, high nibble bg). */
  TextAttr: number;

  /** Current window (scroll region) width in columns. */
  readonly WindCols: number;

  /** Current window right boundary (zero-based). */
  readonly WindMaxX: number;

  /** Current window bottom boundary (zero-based). */
  readonly WindMaxY: number;

  /** Current window top boundary (zero-based). */
  readonly WindMinY: number;

  /** Current window height in rows. */
  readonly WindRows: number;

  // ───────── Methods ─────────

  /** Compute the DECRQCRA checksum of a rectangular area. */
  Checksum(x1: number, y1: number, x2: number, y2: number): string;

  /** Clear from cursor to beginning of line. */
  ClrBol(): void;

  /** Clear from cursor to beginning of screen. */
  ClrBos(): void;

  /** Clear from cursor to end of line. */
  ClrEol(): void;

  /** Clear from cursor to end of screen. */
  ClrEos(): void;

  /** Clear the entire current line. */
  ClrLine(): void;

  /** Clear the screen and move cursor to home. */
  ClrScr(): void;

  /** Conceal mode: foreground set to background color. */
  Conceal(): void;

  /** Delete `count` characters at the cursor. */
  DelChar(count: number): void;

  /** Delete `count` lines starting at the cursor. */
  DelLine(count: number): void;

  /** Write `text` at absolute (x, y) with the given attribute. */
  FastWrite(text: string, x: number, y: number, charInfo: CharInfo): void;

  /** Move the cursor (1-based, window-relative). */
  GotoXY(x: number, y: number): void;

  /** Hide the cursor. */
  HideCursor(): void;

  /** Set bright (high-intensity) text. */
  HighVideo(): void;

  /** Insert `count` blank characters at the cursor. */
  InsChar(count: number): void;

  /** Insert `count` blank lines at the cursor. */
  InsLine(count: number): void;

  /** Set dim (low-intensity) text. */
  LowVideo(): void;

  /** Restore default text attributes (light gray on black). */
  NormVideo(): void;

  /** Toggle reverse video. */
  ReverseVideo(): void;

  /** Scroll the window down `count` lines. */
  ScrollDownWindow(count: number): void;

  /** Scroll the whole screen up `count` lines. */
  ScrollUpScreen(count: number): void;

  /** Turn blink mode on or off. */
  SetBlink(value: boolean): void;

  /** Adjust the blink rate in milliseconds. */
  SetBlinkRate(milliseconds: number): void;

  /** Switch the terminal font (e.g. font-change ESC). */
  SetFont(name: string): boolean;

  /** Show the cursor. */
  ShowCursor(): void;

  /** Set the background color from the 16-color palette. */
  TextBackground(colour: number): void;

  /** Set the background to a 24-bit RGB triple. */
  TextBackground24(r: number, g: number, b: number): void;

  /** Set the foreground color from the 16-color palette. */
  TextColor(colour: number): void;

  /** Set the foreground to a 24-bit RGB triple. */
  TextColor24(r: number, g: number, b: number): void;

  /** Current cursor X (1-based, window-relative). */
  WhereX(): number;

  /** Current cursor X (1-based, screen-absolute). */
  WhereXA(): number;

  /** Current cursor Y (1-based, window-relative). */
  WhereY(): number;

  /** Current cursor Y (1-based, screen-absolute). */
  WhereYA(): number;

  /** Write text to the screen at the cursor, advancing as needed. */
  Write(text: string): void;
}
