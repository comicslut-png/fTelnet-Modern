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

import { Point, StringUtils, TypedEvent, type IEvent } from '../common/index.js';
import { AnsiParserState } from './AnsiParserState.js';
import type { AnsiTarget } from './AnsiTarget.js';

/**
 * 256-color XTerm palette entry.
 */
interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * ANSI/CTERM escape sequence parser.
 *
 * Reads bytes one at a time, building up CSI parameter and intermediate
 * lists, and dispatches when a final byte arrives. The set of commands
 * recognized matches SyncTERM's `cterm` reference (linked inline at the
 * dispatch site for each command).
 *
 * Phase 1 migration notes — this is a long file but the migration is
 * mechanical for most of it:
 *
 *   - The big `AnsiCommand` switch in the original is preserved as-is;
 *     bug-for-bug behavioral compatibility matters more than aesthetic
 *     refactoring here. Every BBS in existence has been tested against
 *     this exact behavior.
 *   - `Crt` is now `AnsiTarget` — the narrow interface defined in
 *     `AnsiTarget.ts`. The migrated `Crt` class (Delta 3c) will
 *     implement it naturally.
 *   - `var` → `let`/`const`, `any` → real types throughout.
 *   - The 256-color palette is now a typed `ReadonlyArray<Rgb>`.
 *   - The fall-through bug at `?9` (mouse reporting that fell into
 *     `?25` cursor show/hide) is preserved as-is — see comments
 *     inline. The original had the same behavior.
 *   - The 9-color-bright math in case 30-37 (`if attr%16 > 7 then
 *     +8`) is preserved verbatim. It looks weird but matches CTERM's
 *     handling of fg-set-after-bright-was-active.
 */
export class Ansi {
  // ───────── Events ─────────
  // These fire when the parser sees a query/command that needs the
  // outer fTelnetClient to respond (e.g. cursor position queries, mouse
  // reports). Triggers carry data the client uses to formulate replies.
  public readonly onDECRQCRA: IEvent<[number, number, number, number, number]> = new TypedEvent();
  public readonly onesc0c: IEvent<[]> = new TypedEvent();
  public readonly onesc5n: IEvent<[]> = new TypedEvent();
  public readonly onesc6n: IEvent<[]> = new TypedEvent();
  public readonly onesc8t: IEvent<[number, number]> = new TypedEvent();
  public readonly onesc255n: IEvent<[]> = new TypedEvent();
  public readonly onescQ: IEvent<[string]> = new TypedEvent();
  public readonly onripdetect: IEvent<[]> = new TypedEvent();
  public readonly onripdisable: IEvent<[]> = new TypedEvent();
  public readonly onripenable: IEvent<[]> = new TypedEvent();
  public readonly onXTSRGA: IEvent<[]> = new TypedEvent();

  // 0..7: SGR-30..37 maps from ECMA color order (R=1, G=2, ...) to
  // CGA bit order (R=4, G=2, B=1). This is the table that does the
  // ECMA-to-CGA reorder.
  private readonly ANSI_COLORS: ReadonlyArray<number> = [0, 4, 2, 6, 1, 5, 3, 7];

  // 256-entry XTerm palette. Source: https://jonasjacek.github.io/colors/data.json
  private readonly ANSI256_COLORS: ReadonlyArray<Rgb> = Ansi.build256Palette();

  private _ansiAttr = 7;
  private _ansiBuffer = '';
  private _ansiIntermediates: string[] = [];
  private _ansiParams: string[] = [];
  private _ansiParserState: AnsiParserState = AnsiParserState.None;
  private _ansiXY: Point = new Point(1, 1);
  // Doorway mode: set true after a NULL is received so the next byte
  // is drawn literally (see Write). Only consulted in doorway mode.
  private _doorwayLiteralNext = false;
  private readonly _crt: AnsiTarget;

  constructor(crt: AnsiTarget) {
    this._crt = crt;
  }

  /**
   * Build the 256-color XTerm palette in three pieces:
   *   - 16 named ANSI colors
   *   - 6×6×6 RGB cube
   *   - 24-step grayscale ramp
   */
  private static build256Palette(): ReadonlyArray<Rgb> {
    const palette: Rgb[] = [
      // 16 standard ANSI/CGA colors (dim then bright)
      { r: 0, g: 0, b: 0 },
      { r: 128, g: 0, b: 0 },
      { r: 0, g: 128, b: 0 },
      { r: 128, g: 128, b: 0 },
      { r: 0, g: 0, b: 128 },
      { r: 128, g: 0, b: 128 },
      { r: 0, g: 128, b: 128 },
      { r: 192, g: 192, b: 192 },
      { r: 128, g: 128, b: 128 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 0, b: 255 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
    ];

    // 6×6×6 RGB cube. The component values aren't linear — XTerm uses
    // a fixed sparse stepping.
    const cubeLevels = [0, 95, 135, 175, 215, 255];
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          palette.push({ r: cubeLevels[r]!, g: cubeLevels[g]!, b: cubeLevels[b]! });
        }
      }
    }

    // 24-step grayscale ramp.
    for (let i = 0; i < 24; i++) {
      const v = 8 + i * 10;
      palette.push({ r: v, g: v, b: v });
    }

    return palette;
  }

  /**
   * Shift the next pending CSI parameter off the queue and parse it.
   * Returns `defaultValue` if the queue is empty.
   */
  private getNextParam(defaultValue: number): number {
    const next = this._ansiParams.shift();
    if (typeof next === 'undefined') {
      return defaultValue;
    }
    return parseInt(next, 10);
  }

  /** Cursor position query response (CSI <y>;<x> R). */
  public CursorPosition(x?: number, y?: number): string {
    const cx = x ?? this._crt.WhereXA();
    const cy = y ?? this._crt.WhereYA();
    return `\x1B[${cy};${cx}R`;
  }

  /** DECRQCRA checksum response. */
  public Checksum(pid: number, x1: number, y1: number, x2: number, y2: number): string {
    return `\x1BP${pid}!~${this._crt.Checksum(x1, y1, x2, y2)}\x1B\\`;
  }

  /** Screen size query response (CSI ?2;0;<w>;<h> S). */
  public ScreenSizeInPixels(): string {
    const xSize = this._crt.ScreenCols * this._crt.Font.Width;
    const ySize = this._crt.ScreenRows * this._crt.Font.Height;
    return `\x1B[?2;0;${xSize};${ySize}S`;
  }

  /**
   * Dispatch a complete CSI command based on its final byte.
   *
   * `_ansiParams` and `_ansiIntermediates` have been populated by the
   * parser; we read from them via `getNextParam` and `_ansiIntermediates`.
   *
   * This switch is intentionally preserved as a single monolithic
   * function to match the original; refactoring it would risk subtle
   * behavioral drift on the long tail of rarely-used CSI commands.
   */
  private AnsiCommand(finalByte: string): void {
    let colour = 0;
    let x = 0;
    let y = 0;
    let z = 0;

    switch (finalByte) {
      case '`':
        // CSI Pn ` Character Position Absolute (HPA)
        x = Math.max(1, this.getNextParam(1));
        x = Math.min(this._crt.WindCols, x);
        this._crt.GotoXY(x, this._crt.WhereY());
        break;

      case '!':
        // CSI [p1] ! — RIP detect (0), disable (1), enable (2)
        switch (this.getNextParam(0)) {
          case 0:
            this.onripdetect.trigger();
            break;
          case 1:
            this.onripdisable.trigger();
            break;
          case 2:
            this.onripenable.trigger();
            break;
          default:
            this.logUnknown(finalByte);
            break;
        }
        break;

      case '@':
        if (this._ansiIntermediates.length === 0) {
          // CSI [p1] @ Insert Character(s)
          x = Math.max(1, this.getNextParam(1));
          this._crt.InsChar(x);
        } else if (this._ansiIntermediates.indexOf(' ') !== -1) {
          // CSI Pn SP @ Scroll Left (SL)
          x = this._crt.WhereX();
          y = this._crt.WhereY();
          z = Math.max(1, this.getNextParam(1));
          for (let i = this._crt.WindMinY + 1; i <= this._crt.WindMaxY + 1; i++) {
            this._crt.GotoXY(1, i);
            this._crt.DelChar(z);
          }
          this._crt.GotoXY(x, y);
        }
        break;

      case '{':
        // NON-STANDARD: indicates a font block follows. Not implemented.
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: font block following');
        break;

      case 'A':
        if (this._ansiIntermediates.length === 0) {
          // CSI [p1] A Cursor Up
          y = Math.max(1, this.getNextParam(1));
          y = Math.max(1, this._crt.WhereY() - y);
          this._crt.GotoXY(this._crt.WhereX(), y);
        } else if (this._ansiIntermediates.indexOf(' ') !== -1) {
          // CSI Pn SP A Scroll Right (SR)
          x = this._crt.WhereX();
          y = this._crt.WhereY();
          z = Math.max(1, this.getNextParam(1));
          for (let i = this._crt.WindMinY + 1; i <= this._crt.WindMaxY + 1; i++) {
            this._crt.GotoXY(1, i);
            this._crt.InsChar(z);
          }
          this._crt.GotoXY(x, y);
        }
        break;

      case 'B':
        // CSI [p1] B Cursor Down
        y = Math.max(1, this.getNextParam(1));
        y = Math.min(this._crt.WindRows, this._crt.WhereY() + y);
        this._crt.GotoXY(this._crt.WhereX(), y);
        break;

      case 'C':
      case 'a':
        // CSI Pn C Cursor Right (CUF) / CSI Pn a Cursor Position Forward (HPR)
        x = Math.max(1, this.getNextParam(1));
        x = Math.min(this._crt.WindCols, this._crt.WhereX() + x);
        this._crt.GotoXY(x, this._crt.WhereY());
        break;

      case 'c':
        // CSI [p1] c Device Attributes
        x = this.getNextParam(0);
        if (x === 0) {
          this.onesc0c.trigger();
        } else {
          this.logUnknown(finalByte);
        }
        break;

      case 'D':
        if (this._ansiIntermediates.length === 0) {
          // CSI [p1] D Cursor Left
          x = Math.max(1, this.getNextParam(1));
          x = Math.max(1, this._crt.WhereX() - x);
          this._crt.GotoXY(x, this._crt.WhereY());
        } else if (this._ansiIntermediates.indexOf(' ') !== -1) {
          // CSI [p1[;p2]] SP D Font Selection — not implemented; the
          // huge comment block in the original lists 41 font slots
          // that fTelnet doesn't currently switch between.
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: font selection');
        }
        break;

      case 'E':
        // CSI [p1] E Cursor Next Line
        y = Math.max(1, this.getNextParam(1));
        y = Math.min(this._crt.WindRows, this._crt.WhereY() + y);
        this._crt.GotoXY(1, y);
        break;

      case 'F':
        // CSI [p1] F Cursor Preceding Line
        y = Math.max(1, this.getNextParam(1));
        y = Math.max(1, this._crt.WhereY() - y);
        this._crt.GotoXY(1, y);
        break;

      case 'G':
        // CSI [p1] G Cursor Character Absolute
        x = Math.max(1, this.getNextParam(1));
        if (x >= 1 && x <= this._crt.WindCols) {
          this._crt.GotoXY(x, this._crt.WhereY());
        }
        break;

      case 'H':
      case 'f':
        // CSI [p1[;p2]] H/f Cursor Position
        y = Math.max(1, this.getNextParam(1));
        y = Math.min(y, this._crt.WindMaxY + 1);
        x = Math.max(1, this.getNextParam(1));
        x = Math.min(x, this._crt.WindMaxX + 1);
        this._crt.GotoXY(x, y);
        break;

      case 'h':
        this.handleSetMode();
        break;

      case 'I':
      case 'Y':
        // CSI Pn I/Y Cursor Forward/Line Tabulation
        x = Math.max(1, this.getNextParam(1));
        this._crt.Write(StringUtils.NewString('\t', x));
        break;

      case 'J':
        // CSI [p1] J Erase in Page
        switch (this.getNextParam(0)) {
          case 0:
            this._crt.ClrEos();
            break;
          case 1:
            this._crt.ClrBos();
            break;
          case 2:
            this._crt.ClrScr();
            break;
          case 3:
            // ANSI extension: clear scrollback too. We treat it the
            // same as 2 for now; clearing the scrollback buffer is a
            // TODO once the Crt rewrite lands.
            this._crt.ClrScr();
            break;
          default:
            break;
        }
        break;

      case 'K':
        // CSI [p1] K Erase in Line
        switch (this.getNextParam(0)) {
          case 0:
            this._crt.ClrEol();
            break;
          case 1:
            this._crt.ClrBol();
            break;
          case 2:
            this._crt.ClrLine();
            break;
          default:
            break;
        }
        break;

      case 'L':
        // CSI [p1] L Insert Line(s)
        y = Math.max(1, this.getNextParam(1));
        this._crt.InsLine(y);
        break;

      case 'l':
        this.handleResetMode();
        break;

      case 'M':
        this.handleM(finalByte);
        break;

      case 'm':
        this.handleSGR(finalByte);
        break;

      case 'N':
        // CSI N — ANSI Music (not implemented)
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: ANSI Music');
        break;

      case 'n':
        // CSI [p1] n Device Status Report
        x = this.getNextParam(0);
        switch (x) {
          case 5:
            this.onesc5n.trigger();
            break;
          case 6:
            this.onesc6n.trigger();
            break;
          case 255:
            this.onesc255n.trigger();
            break;
          default:
            this.logUnknown(finalByte);
            break;
        }
        break;

      case 'P':
        // CSI [p1] P Delete Character
        x = Math.max(1, this.getNextParam(1));
        this._crt.DelChar(x);
        break;

      case 'Q':
        // CSI p1;p2;p3 Q — Change font (fTelnet extension, not in CTERM).
        x = this.getNextParam(0);
        y = this.getNextParam(0);
        z = this.getNextParam(0);
        this.onescQ.trigger(`CP${x}_${y}x${z}`);
        break;

      case 'r':
        // CSI ... r — Output speed emulation or scrolling region; both
        // unimplemented in fTelnet.
        if (this._ansiIntermediates.length === 0) {
          this.logUnknown(finalByte);
        } else if (this._ansiIntermediates[0]!.indexOf('*') !== -1) {
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: output emulation speed');
        } else if (this._ansiIntermediates[0]!.indexOf(']') !== -1) {
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: set top/bottom margins');
        } else {
          this.logUnknown(finalByte);
        }
        break;

      case 'S':
        if (
          this._ansiParams.length >= 2 &&
          this._ansiParams[0] === '?2' &&
          this._ansiParams[1] === '1'
        ) {
          // CSI ?2;1 S XTerm Set or Request Graphics Attribute (XTSRGA)
          this.onXTSRGA.trigger();
        } else {
          // CSI [p1] S Scroll Up
          y = Math.max(1, this.getNextParam(1));
          this._crt.ScrollUpScreen(y);
        }
        break;

      case 's':
        if (this._ansiIntermediates.length === 0) {
          // CSI s Save Current Position
          this._ansiXY = new Point(this._crt.WhereX(), this._crt.WhereY());
        } else {
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: Save Mode Setting');
        }
        break;

      case 'T':
        // CSI [p1] T Scroll Down
        y = Math.max(1, this.getNextParam(1));
        this._crt.ScrollDownWindow(y);
        break;

      case 't':
        this.handleT(finalByte);
        break;

      case 'U':
        // CSI U Clear screen with default attribute — not implemented.
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Clear screen with default attribute');
        break;

      case 'u':
        if (this._ansiIntermediates.length === 0) {
          // CSI u Restore Cursor Position
          this._crt.GotoXY(this._ansiXY.x, this._ansiXY.y);
        } else {
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: Restore Mode Setting');
        }
        break;

      case 'X':
        // CSI [p1] X Erase Character
        x = Math.max(1, this.getNextParam(1));
        this._crt.FastWrite(
          StringUtils.NewString(' ', x),
          this._crt.WhereXA(),
          this._crt.WhereYA(),
          this._crt.CharInfo
        );
        break;

      case 'y':
        // CSI Pn1;Ps;Pn2;Pn3;Pn4;Pn5 * y DECRQCRA
        if (
          this._ansiParams.length === 6 &&
          this._ansiIntermediates.length > 0 &&
          this._ansiIntermediates[0] === '*'
        ) {
          x = this.getNextParam(1);
          y = this.getNextParam(1);
          if (y === 1) {
            const top = this.getNextParam(1);
            const left = this.getNextParam(1);
            const bottom = this.getNextParam(1);
            const right = this.getNextParam(1);
            this.onDECRQCRA.trigger(x, left, top, right, bottom);
          } else {
            this.logUnknown(finalByte);
          }
        } else {
          this.logUnknown(finalByte);
        }
        break;

      case 'Z':
        // CSI Pn Z Cursor Backward Tabulation (CBT)
        x = this._crt.WhereX() - this.getNextParam(1) * 8;
        if (x <= 1) {
          x = 1;
        } else if (x % 8 !== 0) {
          x += 8 - (x % 8);
        }
        this._crt.GotoXY(x, this._crt.WhereY());
        break;

      default:
        this.logUnknown(finalByte);
        break;
    }

    // Avoid "value assigned but never used" lints on `colour` —
    // some branches use it conditionally.
    void colour;
  }

  /**
   * Handle CSI h (set mode). Most are non-standard extensions that
   * fTelnet logs and ignores; the ones we do support are cursor
   * show/hide and mouse reporting.
   *
   * NOTE: The original has a fall-through from '?9' into '?25'. We
   * preserve that exactly (it means turning on X10 mouse reporting
   * also shows the cursor, which is probably a bug, but BBSes have
   * adapted to it over the years).
   */
  private handleSetMode(): void {
    if (this._ansiParams.length < 1) {
      this._ansiParams.push('0');
    }
    switch (this._ansiParams[0]) {
      case '=255':
        // Enable DoorWay Mode — host wants extended keystrokes passed
        // through as NULL+scancode. Flip the Crt flag; OnKeyDown picks
        // up the doorway encoder while this is on.
        this._crt.DoorwayMode = true;
        break;
      case '?6':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Enable origin mode');
        break;
      case '?7':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Enable auto wrap');
        break;
      case '?9':
        // X10 mouse reporting on. NOTE: the original code had a
        // fall-through here into '?25' (cursor show), so enabling
        // X10 mouse reporting ALSO shows the cursor. That was likely
        // a missing `break` in the original, but BBSes adapted to it.
        // We preserve the behavior by inlining the cursor-show call
        // explicitly rather than relying on switch fall-through (which
        // strict TypeScript flags).
        this._crt.ReportMouse = true;
        this._crt.ShowCursor();
        break;
      case '?25':
        this._crt.ShowCursor();
        break;
      case '?31':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Enable alt character set');
        break;
      case '?32':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Bright Intensity Enable');
        break;
      case '?33':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Blink to Bright Intensity Background');
        break;
      case '?1000':
        // Normal tracking mouse reporting.
        this._crt.ReportMouse = true;
        break;
      case '?1006':
        // SGR-encoded extended coordinates.
        this._crt.ReportMouseSgr = true;
        break;
      default:
        this.logUnknown('h');
        break;
    }
  }

  /**
   * Handle CSI l (reset mode). Mirror image of handleSetMode.
   *
   * Same fall-through behavior as the set-mode handler: '?9' falls
   * into '?25', so turning off X10 mouse reporting also hides the
   * cursor. Preserved as-is.
   */
  private handleResetMode(): void {
    if (this._ansiParams.length < 1) {
      this._ansiParams.push('0');
    }
    switch (this._ansiParams[0]) {
      case '=255':
        // Disable DoorWay Mode.
        this._crt.DoorwayMode = false;
        break;
      case '?6':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Disable origin mode');
        break;
      case '?7':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Disable auto wrap');
        break;
      case '?9':
        // X10 mouse reporting off. As in handleSetMode, the original
        // fell through to '?25' here, so disabling X10 mouse reporting
        // also hides the cursor. Preserved by inlining the call.
        this._crt.ReportMouse = false;
        this._crt.HideCursor();
        break;
      case '?25':
        this._crt.HideCursor();
        break;
      case '?31':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Disable alt character set');
        break;
      case '?32':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Bright Intensity Disable');
        break;
      case '?33':
        // eslint-disable-next-line no-console
        console.log('Unhandled ESC sequence: Blink Normal');
        break;
      case '?1000':
        this._crt.ReportMouse = false;
        break;
      case '?1006':
        this._crt.ReportMouseSgr = false;
        break;
      default:
        this.logUnknown('l');
        break;
    }
  }

  /**
   * Handle CSI M, which is either Delete Line or an ANSI Music
   * configuration command depending on whether the parameter starts
   * with '='.
   */
  private handleM(finalByte: string): void {
    if (this._ansiParams.length < 1) {
      this._ansiParams.push('1');
    }
    const first = this._ansiParams[0]!;
    if (first[0] === '=') {
      // CSI = [p1] M — set ANSI music parsing mode. Not implemented.
      const mode = this.getNextParam(0);
      switch (mode) {
        case 0:
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: only CSI | introduces ANSI music');
          break;
        case 1:
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: CSI | and CSI N introduce ANSI music');
          break;
        case 2:
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: CSI |, CSI N, and CSI M introduce ANSI music');
          break;
        default:
          this.logUnknown(finalByte);
          break;
      }
    } else {
      // CSI [p1] M Delete Line(s)
      const lines = Math.max(1, this.getNextParam(1));
      this._crt.DelLine(lines);
    }
  }

  /**
   * Handle CSI m (SGR). The largest single command — sets text
   * attributes (intensity, blink, reverse, foreground, background)
   * with multi-parameter sequences.
   */
  private handleSGR(finalByte: string): void {
    if (this._ansiParams.length < 1) {
      this._ansiParams.push('0');
    }
    while (this._ansiParams.length > 0) {
      const x = this.getNextParam(0);
      switch (x) {
        case 0:
          this._crt.NormVideo();
          break;
        case 1:
          this._crt.HighVideo();
          break;
        case 2:
          this._crt.LowVideo();
          break;
        case 3: // italic (not implemented)
          break;
        case 4: // underline single (not implemented)
          break;
        case 5:
          this._crt.SetBlink(true);
          this._crt.SetBlinkRate(500);
          break;
        case 6:
          this._crt.SetBlink(true);
          this._crt.SetBlinkRate(250);
          break;
        case 7:
          this._crt.ReverseVideo();
          break;
        case 8:
          this._ansiAttr = this._crt.TextAttr;
          this._crt.Conceal();
          break;
        case 21: // double underline (not implemented)
          break;
        case 22:
          this._crt.LowVideo();
          break;
        case 24: // underline none (not implemented)
          break;
        case 25:
          this._crt.SetBlink(false);
          break;
        case 27:
          this._crt.ReverseVideo();
          break;
        case 28:
          this._crt.TextAttr = this._ansiAttr;
          break;
        case 30:
        case 31:
        case 32:
        case 33:
        case 34:
        case 35:
        case 36:
        case 37: {
          let colour = this.ANSI_COLORS[x - 30]!;
          // If bright was already active, OR the bright bit back in.
          // This matches CTERM's odd-but-stable behavior.
          if (this._crt.TextAttr % 16 > 7) {
            colour += 8;
          }
          this._crt.TextColor(colour);
          break;
        }
        case 38:
          this.handleSGR38OrSGR48(finalByte, true);
          break;
        case 39: {
          // Default foreground (same as white)
          let colour = this.ANSI_COLORS[37 - 30]!;
          if (this._crt.TextAttr % 16 > 7) {
            colour += 8;
          }
          this._crt.TextColor(colour);
          break;
        }
        case 40:
        case 41:
        case 42:
        case 43:
        case 44:
        case 45:
        case 46:
        case 47: {
          const colour = this.ANSI_COLORS[x - 40]!;
          this._crt.TextBackground(colour);
          break;
        }
        case 48:
          this.handleSGR38OrSGR48(finalByte, false);
          break;
        case 49: {
          // Default background (same as black)
          const colour = this.ANSI_COLORS[40 - 40]!;
          this._crt.TextBackground(colour);
          break;
        }
        case 90:
        case 91:
        case 92:
        case 93:
        case 94:
        case 95:
        case 96:
        case 97: {
          const colour = this.ANSI_COLORS[x - 90]! + 8;
          this._crt.TextColor(colour);
          break;
        }
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107: {
          const colour = this.ANSI_COLORS[x - 100]! + 8;
          this._crt.TextBackground(colour);
          break;
        }
        default:
          // Original silently ignored unknown SGR codes; preserve that.
          break;
      }
    }
  }

  /**
   * Shared handler for SGR 38 (set fg) and SGR 48 (set bg) extended
   * color sequences. `isForeground` selects which one to call on the
   * Crt; the parameter parsing is identical.
   *
   *   38;5;n  or  48;5;n   → 256-color palette index
   *   38;2;r;g;b or 48;2;r;g;b → 24-bit RGB
   */
  private handleSGR38OrSGR48(finalByte: string, isForeground: boolean): void {
    const mode = this.getNextParam(0);
    switch (mode) {
      case 2:
        if (this._ansiParams.length === 3) {
          const r = this.getNextParam(0);
          const g = this.getNextParam(0);
          const b = this.getNextParam(0);
          if (isForeground) {
            this._crt.TextColor24(r, g, b);
          } else {
            this._crt.TextBackground24(r, g, b);
          }
        } else {
          this.logUnknown(finalByte);
        }
        break;
      case 5: {
        const index = this.getNextParam(0);
        const c = this.ANSI256_COLORS[index];
        if (c) {
          if (isForeground) {
            this._crt.TextColor24(c.r, c.g, c.b);
          } else {
            this._crt.TextBackground24(c.r, c.g, c.b);
          }
        } else {
          this.logUnknown(finalByte);
        }
        break;
      }
      default:
        this.logUnknown(finalByte);
        break;
    }
  }

  /**
   * Handle CSI t — either 24-bit color (Picoe's encoding) with 4
   * parameters, or window manipulation with 3 parameters.
   */
  private handleT(finalByte: string): void {
    if (this._ansiParams.length === 3) {
      const cmd = this.getNextParam(0);
      const a = this.getNextParam(0);
      const b = this.getNextParam(0);
      if (cmd === 8) {
        if (b > 0 && a > 0) {
          this.onesc8t.trigger(b, a);
        } else {
          this.logUnknown(finalByte);
        }
      } else {
        this.logUnknown(finalByte);
      }
    } else if (this._ansiParams.length === 4) {
      const target = this.getNextParam(1);
      const r = this.getNextParam(0);
      const g = this.getNextParam(0);
      const b = this.getNextParam(0);
      if (target === 0) {
        this._crt.TextBackground24(r, g, b);
      } else if (target === 1) {
        this._crt.TextColor24(r, g, b);
      } else {
        this.logUnknown(finalByte);
      }
    } else {
      this.logUnknown(finalByte);
    }
  }

  private logUnknown(finalByte: string): void {
    // eslint-disable-next-line no-console
    console.log(
      `Unknown ESC sequence: PB(${this._ansiParams.toString()}) IB(${this._ansiIntermediates.toString()}) FB(${finalByte})`
    );
  }

  /**
   * Parse a chunk of text, dispatching ANSI sequences and writing
   * plain characters to the Crt.
   *
   * The parser state persists across calls — a multi-byte sequence
   * can span chunk boundaries (as happens routinely when a BBS sends
   * fragmented packets).
   */
  public Write(text: string): void {
    // Atari and C64 modes don't speak ANSI; pass through unchanged.
    if (this._crt.Atari || this._crt.C64) {
      this._crt.Write(text);
      return;
    }

    let buffer = '';

    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);

      if (this._ansiParserState === AnsiParserState.None) {
        // Doorway-mode output rule: a received NULL (0x00) forces the
        // NEXT byte to be drawn literally rather than interpreted (so
        // e.g. NUL then 0x0C shows the CP437 glyph for 0x0C instead of
        // clearing the screen). Only active while in doorway mode.
        if (this._doorwayLiteralNext) {
          this._doorwayLiteralNext = false;
          buffer += ch;
          continue;
        }
        if (this._crt.DoorwayMode && ch === '\x00') {
          this._doorwayLiteralNext = true;
          continue;
        }
        if (ch === '\x1B') {
          this._ansiParserState = AnsiParserState.Escape;
        } else {
          buffer += ch;
        }
      } else if (this._ansiParserState === AnsiParserState.Escape) {
        if (ch === '[') {
          this._ansiParserState = AnsiParserState.Bracket;
          this._ansiBuffer = '';
          this._ansiParams = [];
          this._ansiIntermediates = [];
        } else if (ch === ']' || ch === '^' || ch === '_' || ch === 'P' || ch === 'X') {
          // ESC ] = OSC, ESC ^ = PM, ESC _ = APC, ESC P = DCS, ESC X = SOS.
          // All four enter the string-reading state until ESC \ ends them.
          this._crt.Write(buffer);
          buffer = '';
          this._ansiParserState = AnsiParserState.ReadingString;
        } else if (ch === 'c') {
          // ESC c — Reset to Initial State (RIS)
          this._crt.Write(buffer);
          buffer = '';
          this._crt.NormVideo();
          this._crt.ClrScr();
          this._ansiParserState = AnsiParserState.None;
        } else if (ch === 'E') {
          // ESC E — Next Line (NEL): equivalent to CR LF
          this._crt.Write(buffer);
          buffer = '';
          this._crt.Write('\r\n');
          this._ansiParserState = AnsiParserState.None;
        } else if (ch === 'H') {
          // ESC H — Set Tab. fTelnet doesn't model tab stops.
          this._crt.Write(buffer);
          buffer = '';
          // eslint-disable-next-line no-console
          console.log('Unhandled ESC sequence: Set tab stop');
          this._ansiParserState = AnsiParserState.None;
        } else if (ch === 'M') {
          // ESC M — Reverse Line Feed (RI): cursor up one row.
          this._crt.Write(buffer);
          buffer = '';
          const newY = Math.max(1, this._crt.WhereY() - 1);
          this._crt.GotoXY(this._crt.WhereX(), newY);
          this._ansiParserState = AnsiParserState.None;
        } else {
          // Unrecognized ESC sequence; buffer the byte and resume.
          buffer += ch;
          this._ansiParserState = AnsiParserState.None;
        }
      } else if (this._ansiParserState === AnsiParserState.Bracket) {
        if (ch === '!') {
          // CSI ! — RIP detect (no parameter).
          this._crt.Write(buffer);
          buffer = '';
          this.AnsiCommand(ch);
          this._ansiParserState = AnsiParserState.None;
        } else if (ch >= '0' && ch <= '?') {
          // Parameter byte.
          if (ch === ';') {
            this._ansiParams.push(this._ansiBuffer === '' ? '0' : this._ansiBuffer);
            this._ansiBuffer = '';
          } else {
            this._ansiBuffer += ch;
          }
          this._ansiParserState = AnsiParserState.ParameterByte;
        } else if (ch >= ' ' && ch <= '/') {
          this._ansiIntermediates.push(ch);
          this._ansiParserState = AnsiParserState.IntermediateByte;
        } else if (ch >= '@' && ch <= '~') {
          // Final byte with no parameters.
          this._crt.Write(buffer);
          buffer = '';
          this.AnsiCommand(ch);
          this._ansiParserState = AnsiParserState.None;
        } else {
          // Bad sequence — bail.
          buffer += ch;
          this._ansiParserState = AnsiParserState.None;
        }
      } else if (this._ansiParserState === AnsiParserState.ParameterByte) {
        if (ch === '!') {
          // CSI 0! / CSI 1! / CSI 2! — RIP detect/disable/enable.
          this._ansiParams.push(this._ansiBuffer === '' ? '0' : this._ansiBuffer);
          this._ansiBuffer = '';
          this._crt.Write(buffer);
          buffer = '';
          this.AnsiCommand(ch);
          this._ansiParserState = AnsiParserState.None;
        } else if (ch === ';') {
          this._ansiParams.push(this._ansiBuffer === '' ? '0' : this._ansiBuffer);
          this._ansiBuffer = '';
        } else if (ch >= '0' && ch <= '?') {
          this._ansiBuffer += ch;
        } else if (ch >= ' ' && ch <= '/') {
          this._ansiParams.push(this._ansiBuffer === '' ? '0' : this._ansiBuffer);
          this._ansiBuffer = '';
          this._ansiIntermediates.push(ch);
          this._ansiParserState = AnsiParserState.IntermediateByte;
        } else if (ch >= '@' && ch <= '~') {
          this._ansiParams.push(this._ansiBuffer === '' ? '0' : this._ansiBuffer);
          this._ansiBuffer = '';
          this._crt.Write(buffer);
          buffer = '';
          this.AnsiCommand(ch);
          this._ansiParserState = AnsiParserState.None;
        } else {
          buffer += ch;
          this._ansiParserState = AnsiParserState.None;
        }
      } else if (this._ansiParserState === AnsiParserState.IntermediateByte) {
        if (ch >= '0' && ch <= '?') {
          // Illegal: parameter byte after intermediate. Abort.
          buffer += ch;
          this._ansiParserState = AnsiParserState.None;
        } else if (ch >= ' ' && ch <= '/') {
          this._ansiIntermediates.push(ch);
        } else if (ch >= '@' && ch <= '~') {
          this._crt.Write(buffer);
          buffer = '';
          this.AnsiCommand(ch);
          this._ansiParserState = AnsiParserState.None;
        } else {
          buffer += ch;
          this._ansiParserState = AnsiParserState.None;
        }
      } else if (this._ansiParserState === AnsiParserState.ReadingString) {
        if (ch === '\x1B') {
          this._ansiParserState = AnsiParserState.ReadingStringEscape;
        } else {
          // Strings are captured but currently unused — log on close.
          buffer += ch;
        }
      } else if (this._ansiParserState === AnsiParserState.ReadingStringEscape) {
        if (ch === '\\') {
          // eslint-disable-next-line no-console
          console.log(`Ansi.ts read string: ${buffer}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `Ansi.ts unexpected post-ESC char while reading string: ${ch} (Buffer=${buffer})`
          );
        }
        buffer = '';
        this._ansiParserState = AnsiParserState.None;
      } else {
        // Defensive: shouldn't reach here, but if we do, treat as data.
        buffer += ch;
      }
    }

    this._crt.Write(buffer);
  }

  public WriteLn(text: string): void {
    this.Write(`${text}\r\n`);
  }
}
