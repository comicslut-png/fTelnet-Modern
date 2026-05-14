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

import { Benchmark, ByteArray, Point } from '../../common/index.js';
import { Ansi, Crt, KeyPressEvent } from '../../crt/index.js';
import { BitmapFont } from '../BitmapFont.js';
import { FillSettings } from '../FillSettings.js';
import { FillStyle } from '../FillStyle.js';
import { Graph } from '../Graph.js';
import { LineStyle } from '../LineStyle.js';
import { Rectangle } from '../Rectangle.js';
import { StrokeFont } from '../StrokeFont.js';
import { TextJustification } from '../TextJustification.js';
import { WriteMode } from '../WriteMode.js';
import { ButtonStyle } from './ButtonStyle.js';
import { MouseButton } from './MouseButton.js';
import { RIPParserState } from './RIPParserState.js';

/**
 * RIPscrip parser and command dispatcher.
 *
 * Consumes a stream of bytes from the BBS via `Parse(data)`, picks
 * out RIPscrip commands (which begin with `!|` at line start), and
 * dispatches them to a network of internal handlers that drive the
 * `Graph` instance. Non-RIPscrip bytes are forwarded to the `Ansi`
 * parser for normal terminal output.
 *
 * Phase 1 migration notes:
 *
 *   - All 51 RIP_XXX command handlers are migrated as-is. Each
 *     follows the same pattern: parse fixed-position fields from
 *     `_Buffer` using `parseInt(..., 36)` (RIPscrip uses base-36
 *     encoding for compact numeric values), then dispatch to a
 *     `Graph` or local method. The benchmark/`console.log` lines
 *     are preserved — they're chatty but provide invaluable trace
 *     output when something goes wrong in the field.
 *
 *   - `_KeyBuf`, `_Clipboard` are typed more precisely than the
 *     original's `any[]` / inferred `ImageData`. `_Clipboard` is
 *     `ImageData | undefined` since it's set by GetImage/LoadIcon
 *     and read by PutImage — and may be undefined at any time.
 *
 *   - The `LoadIcon` method in the original used SYNCHRONOUS XHR
 *     (`xhr.open('get', url, false)`). Synchronous XHR has been
 *     deprecated for years and modern browsers warn about it.
 *     Migrated to async fetch using the existing waiting-flag
 *     pattern (`_WaitingForIcon`), modeled on how the original
 *     handles waiting for bitmap/stroke font loads. This DOES
 *     change timing semantics: an icon load now defers parser
 *     progress until the icon arrives, rather than blocking the
 *     parser on a synchronous network call. From the BBS's
 *     perspective the visible behavior should be the same.
 *
 *   - The original's `OnGraphCanvasMouseDown` /
 *     `OnGraphCanvasMouseUp` paired with `removeEventListener`
 *     calls that wouldn't actually work — the listener was added
 *     via an arrow-function wrapper but removed via the raw method
 *     reference. Two different function objects → removeEventListener
 *     can't find a match → the listener stays attached. Every
 *     button press would leak another listener. Fixed in the
 *     migration by storing the bound handlers on the instance and
 *     using those references for both add and remove. Flagged with
 *     a comment.
 *
 *   - The stale comment `// Can't use this since it isn't referring
 *     to RIP (no fat arrow used to call)` predates the arrow-function
 *     refactor that introduced the leak above. Removed in the
 *     migrated code — the comment is misleading now.
 *
 *   - `var` → `let`/`const` everywhere. Block-level scoping in the
 *     parser switch statements means some inner `var` declarations
 *     were doing accidental hoisting; converting to `let` keeps the
 *     same behavior because each `case` block is scoped on its own.
 *
 *   - `_Benchmark` console.log lines preserved verbatim. The format
 *     is "elapsed_ms description" — useful for performance work,
 *     and matches what existing BBS sysops would have seen when
 *     debugging RIPscrip output.
 *
 *   - Several methods are documented as "Status: Not Implemented"
 *     in the original — BeginText, EndText, CopyRegion, Define,
 *     EnterBlockMode, FileQuery, ReadScene, RegionText, WriteIcon.
 *     All preserved as console.log stubs (matching the original's
 *     behavior). Implementing these is out of scope for the
 *     migration; flagged in their docstrings.
 *
 *   - `ResetWindows` originally called `delete this._Clipboard`.
 *     With strict mode and the `_Clipboard: ImageData | undefined`
 *     typing, we assign `undefined` instead. Same observable behavior.
 */
export class RIP {
  // ───────── Parser state ─────────
  private readonly _Ansi: Ansi;
  private readonly _Benchmark: Benchmark = new Benchmark();
  private _Buffer = '';
  private _ButtonInverted = false;
  private _ButtonPressed = -1;
  private _ButtonStyle: ButtonStyle = new ButtonStyle();
  private _Clipboard: ImageData | undefined;
  private _Command = '';
  private readonly _Crt: Crt;
  private _DoTextCommand = false;
  private readonly _Graph: Graph;
  private readonly _InputBuffer: number[] = [];
  private readonly _KeyBuf: KeyPressEvent[] = [];
  private _LastWasEscape = false;
  private _Level = 0;
  private _LineStartedWithRIP = false;
  private _LineStarting = true;
  private _MouseFields: MouseButton[] = [];
  private _RIPParserState: number = RIPParserState.None;
  private _SubLevel = 0;
  private _WaitingForBitmapFont = false;
  private _WaitingForStrokeFont = false;
  /**
   * Added during Phase 1 migration: set true while an icon fetch is
   * in flight so the parser pauses (matching the original's
   * `_WaitingFor*Font` pattern). Required because synchronous XHR
   * is deprecated and the migrated LoadIcon is async.
   */
  private _WaitingForIcon = false;

  /**
   * Stored references to the bound mouse handlers so both
   * addEventListener and removeEventListener see the same function
   * object. The original used arrow-function wrappers at the
   * addEventListener call site, which created fresh function objects
   * every time and left removeEventListener unable to find a match
   * (silent listener leak per button press). Fixed by storing the
   * bound handlers here.
   */
  private readonly _onMouseDown: (me: MouseEvent) => void;
  private readonly _onMouseMove: (me: MouseEvent) => void;
  private readonly _onMouseUp: (me: MouseEvent) => void;

  constructor(crt: Crt, ansi: Ansi, container: HTMLElement) {
    this._Crt = crt;
    this._Ansi = ansi;
    this._Graph = new Graph(crt, container);

    this._Crt.AllowDynamicFontResize = false;

    this._onMouseDown = (me: MouseEvent): void => this.OnGraphCanvasMouseDown(me);
    this._onMouseMove = (me: MouseEvent): void => this.OnGraphCanvasMouseMove(me);
    this._onMouseUp = (me: MouseEvent): void => this.OnGraphCanvasMouseUp(me);

    // The original kept the OnEnterFrame parser hooked up to an
    // Event.ENTER_FRAME listener in AS3 days, then commented it out
    // when moving to JS. Now Parse() calls OnEnterFrame directly.
    // Mouse handling is set up via addEventListener.
    this._Graph.Canvas.addEventListener('mousedown', this._onMouseDown);
  }

  // ───────── Public API surface (some "not implemented") ─────────

  /**
   * Define a rectangular text region.
   *
   * **Status: Not Implemented** — the original logged a console
   * message and returned. Preserved with the same behavior.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public BeginText(_x1: number, _y1: number, _x2: number, _y2: number): void {
    // eslint-disable-next-line no-console
    console.log('BeginText() is not handled');
  }

  /**
   * Define a Mouse Button — the most visually complex RIP primitive,
   * with bevel, chisel, recess, sunken, and label-positioning
   * combinations all driven by `_ButtonStyle.flags`.
   *
   * **Status: Partially Implemented** — clipboard and icon types
   * are explicit early returns. The rest is mostly working.
   */
  public Button(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    hotkey: number,
    flags: number,
    text: string
  ): void {
    // flags parameter is unused — preserved from the original. The
    // button-level flags come from _ButtonStyle.flags instead.
    void flags;

    // Normalize coordinates if reversed.
    if (x2 > 0 && x1 > x2) {
      const tempX = x1;
      x1 = x2;
      x2 = tempX;
    }
    if (y2 > 0 && y1 > y2) {
      const tempY = y1;
      y1 = y2;
      y2 = tempY;
    }

    const oldColour = this._Graph.GetColour();
    const oldFillSettings: FillSettings = this._Graph.GetFillSettings();
    const tempFillSettings: FillSettings = this._Graph.GetFillSettings();

    // Split the text portion into 3 items separated by `<>`:
    //   iconfile<>label<>hostcommand
    let iconfile = '';
    let label = '';
    let hostcommand = '';
    const textarray: string[] = text.split('<>');
    if (textarray.length >= 3) {
      hostcommand = this.HandleCtrlKeys(textarray[2]!);
    }
    if (textarray.length >= 2) {
      label = textarray[1]!;
    }
    if (textarray.length >= 1) {
      iconfile = textarray[0]!;
    }
    // iconfile is captured but not used (icon-type buttons are an
    // early-return below). Preserved from the original — no warning
    // since the value might be used by a future implementation.
    void iconfile;

    // Icon-type and clipboard-type buttons are not implemented.
    if ((this._ButtonStyle.flags & 128) === 128) {
      // eslint-disable-next-line no-console
      console.log("Button() doesn't support the icon type");
      return;
    }
    if ((this._ButtonStyle.flags & 1) === 1) {
      // eslint-disable-next-line no-console
      console.log("Button() doesn't support the clipboard type");
      return;
    }

    // Compute button size: use explicit width/height from
    // _ButtonStyle if provided, otherwise derive from the rect.
    let size: Rectangle;
    let invertCoords: Rectangle;
    if (this._ButtonStyle.width === 0 || this._ButtonStyle.height === 0) {
      size = new Rectangle(x1, y1, x2 - x1 + 1, y2 - y1 + 1);
      invertCoords = new Rectangle(x1, y1, x2 - x1 + 1, y2 - y1 + 1);
    } else {
      size = new Rectangle(x1, y1, this._ButtonStyle.width, this._ButtonStyle.height);
      invertCoords = new Rectangle(x1, y1, this._ButtonStyle.width, this._ButtonStyle.height);
      x2 = size.right;
      y2 = size.bottom;
    }

    // Draw button face.
    tempFillSettings.Style = FillStyle.Solid;
    tempFillSettings.Colour = this._ButtonStyle.surface;
    this._Graph.SetFillSettings(tempFillSettings);
    this._Graph.Bar(x1, y1, x2, y2);
    this._Graph.SetFillSettings(oldFillSettings);

    // Bevel (flag 0x200): trapezoids on each side of the button to
    // make it look raised, plus colored corner pixels.
    if ((this._ButtonStyle.flags & 512) === 512) {
      this._Graph.SetLineStyle(LineStyle.Solid, 0, 1); // TODO Must restore at end (original)
      this._Graph.SetFillStyle(FillStyle.Solid, this._ButtonStyle.bright);
      this._Graph.SetColour(this._ButtonStyle.bright);

      const trapezoid: Point[] = [];
      trapezoid.push(
        new Point(x1 - this._ButtonStyle.bevelsize, y1 - this._ButtonStyle.bevelsize)
      );
      trapezoid.push(new Point(x1 - 1, y1 - 1));
      trapezoid.push(new Point(x2 + 1, y1 - 1));
      trapezoid.push(
        new Point(x2 + this._ButtonStyle.bevelsize, y1 - this._ButtonStyle.bevelsize)
      );
      this._Graph.FillPoly(trapezoid);

      trapezoid[3] = new Point(
        x1 - this._ButtonStyle.bevelsize,
        y2 + this._ButtonStyle.bevelsize
      );
      trapezoid[2] = new Point(x1 - 1, y2 + 1);
      this._Graph.FillPoly(trapezoid);

      this._Graph.SetFillStyle(FillStyle.Solid, this._ButtonStyle.dark);
      this._Graph.SetColour(this._ButtonStyle.dark);

      trapezoid[0] = new Point(
        x2 + this._ButtonStyle.bevelsize,
        y2 + this._ButtonStyle.bevelsize
      );
      trapezoid[1] = new Point(x2 + 1, y2 + 1);
      this._Graph.FillPoly(trapezoid);

      trapezoid[3] = new Point(
        x2 + this._ButtonStyle.bevelsize,
        y1 - this._ButtonStyle.bevelsize
      );
      trapezoid[2] = new Point(x2 + 1, y1 - 1);
      this._Graph.FillPoly(trapezoid);

      this._Graph.SetColour(this._ButtonStyle.cornercolour);
      this._Graph.Line(
        x1 - this._ButtonStyle.bevelsize,
        y1 - this._ButtonStyle.bevelsize,
        x1 - 1,
        y1 - 1
      );
      this._Graph.Line(
        x1 - this._ButtonStyle.bevelsize,
        y2 + this._ButtonStyle.bevelsize,
        x1 - 1,
        y2 + 1
      );
      this._Graph.Line(
        x2 + 1,
        y1 - 1,
        x2 + this._ButtonStyle.bevelsize,
        y1 - this._ButtonStyle.bevelsize
      );
      this._Graph.Line(
        x2 + 1,
        y2 + 1,
        x2 + this._ButtonStyle.bevelsize,
        y2 + this._ButtonStyle.bevelsize
      );

      size.left -= this._ButtonStyle.bevelsize;
      size.top -= this._ButtonStyle.bevelsize;
      size.width += this._ButtonStyle.bevelsize;
      size.height += this._ButtonStyle.bevelsize;
      invertCoords.left -= this._ButtonStyle.bevelsize;
      invertCoords.top -= this._ButtonStyle.bevelsize;
      invertCoords.width += this._ButtonStyle.bevelsize;
      invertCoords.height += this._ButtonStyle.bevelsize;
    }

    // Chisel (flag 0x008): nested rectangles inset by a
    // height-dependent amount, giving a chiseled-edge appearance.
    if ((this._ButtonStyle.flags & 8) === 8) {
      let xchisel: number;
      let ychisel: number;

      const height: number = y2 - y1;
      // Inset dimensions scale with button height. These thresholds
      // are from the RIPscrip spec; preserved unchanged.
      if (height >= 0 && height <= 11) {
        xchisel = 1;
        ychisel = 1;
      } else if (height >= 12 && height <= 24) {
        xchisel = 3;
        ychisel = 2;
      } else if (height >= 25 && height <= 39) {
        xchisel = 4;
        ychisel = 3;
      } else if (height >= 40 && height <= 74) {
        xchisel = 6;
        ychisel = 5;
      } else if (height >= 75 && height <= 149) {
        xchisel = 7;
        ychisel = 5;
      } else if (height >= 150 && height <= 199) {
        xchisel = 8;
        ychisel = 6;
      } else if (height >= 200 && height <= 249) {
        xchisel = 10;
        ychisel = 7;
      } else if (height >= 250 && height <= 299) {
        xchisel = 11;
        ychisel = 8;
      } else {
        xchisel = 13;
        ychisel = 9;
      }

      this._Graph.SetColour(this._ButtonStyle.bright);
      this._Graph.Rectangle(x1 + xchisel + 1, y1 + ychisel + 1, x2 - xchisel, y2 - ychisel);

      this._Graph.SetColour(this._ButtonStyle.dark);
      this._Graph.Rectangle(x1 + xchisel, y1 + ychisel, x2 - (xchisel + 1), y2 - (ychisel + 1));
      this._Graph.PutPixel(x1 + xchisel, y2 - ychisel, this._ButtonStyle.dark);
      this._Graph.PutPixel(x2 - xchisel, y1 + ychisel, this._ButtonStyle.dark);
    }
    this._Graph.SetColour(oldColour);

    // Recessed (flag 0x010): outer rectangle plus top/left dark
    // edges and bottom/right bright edges to make it look inset.
    if ((this._ButtonStyle.flags & 16) === 16) {
      this._Graph.SetColour(0);
      this._Graph.Rectangle(
        x1 - this._ButtonStyle.bevelsize - 1,
        y1 - this._ButtonStyle.bevelsize - 1,
        x2 + this._ButtonStyle.bevelsize + 1,
        y2 + this._ButtonStyle.bevelsize + 1
      );

      this._Graph.SetColour(this._ButtonStyle.dark);
      this._Graph.Line(
        x1 - this._ButtonStyle.bevelsize - 2,
        y1 - this._ButtonStyle.bevelsize - 2,
        x2 + this._ButtonStyle.bevelsize + 2,
        y1 - this._ButtonStyle.bevelsize - 2
      );
      this._Graph.Line(
        x1 - this._ButtonStyle.bevelsize - 2,
        y1 - this._ButtonStyle.bevelsize - 2,
        x1 - this._ButtonStyle.bevelsize - 2,
        y2 + this._ButtonStyle.bevelsize + 2
      );

      this._Graph.SetColour(this._ButtonStyle.bright);
      this._Graph.Line(
        x2 + this._ButtonStyle.bevelsize + 2,
        y1 - this._ButtonStyle.bevelsize - 2,
        x2 + this._ButtonStyle.bevelsize + 2,
        y2 + this._ButtonStyle.bevelsize + 2
      );
      this._Graph.Line(
        x1 - this._ButtonStyle.bevelsize - 2,
        y2 + this._ButtonStyle.bevelsize + 2,
        x2 + this._ButtonStyle.bevelsize + 2,
        y2 + this._ButtonStyle.bevelsize + 2
      );

      this._Graph.SetColour(oldColour);

      size.left -= 2;
      size.top -= 2;
      size.width += 2;
      size.height += 2;
    }

    // Sunken (flag 0x8000): dark top/left edges and bright
    // bottom/right edges for an inset-button look.
    if ((this._ButtonStyle.flags & 32768) === 32768) {
      this._Graph.SetColour(this._ButtonStyle.dark);
      this._Graph.Line(x1, y1, x2, y1);
      this._Graph.Line(x1, y1, x1, y2);

      this._Graph.SetColour(this._ButtonStyle.bright);
      this._Graph.Line(x1, y2, x2, y2);
      this._Graph.Line(x2, y1, x2, y2);

      this._Graph.SetColour(oldColour);
    }

    // Draw label, if any. orientation picks where it sits relative
    // to the button rectangle.
    if (label !== '') {
      let labelx = 0;
      let labely = 0;
      switch (this._ButtonStyle.orientation) {
        case 0: // above
          labelx =
            size.left + Math.floor(size.width / 2) - Math.floor(this._Graph.TextWidth(label) / 2);
          labely = size.top - this._Graph.TextHeight(label);
          break;
        case 1: // left
          labelx = size.left - this._Graph.TextWidth(label);
          labely =
            size.top +
            Math.floor(size.height / 2) -
            Math.floor(this._Graph.TextHeight(label) / 2);
          break;
        case 2: // middle
          labelx =
            size.left + Math.floor(size.width / 2) - Math.floor(this._Graph.TextWidth(label) / 2);
          labely =
            size.top +
            Math.floor(size.height / 2) -
            Math.floor(this._Graph.TextHeight(label) / 2);
          break;
        case 3: // right
          labelx = size.right;
          labely =
            size.top +
            Math.floor(size.height / 2) -
            Math.floor(this._Graph.TextHeight(label) / 2);
          break;
        case 4: // below
          labelx =
            size.left + Math.floor(size.width / 2) - Math.floor(this._Graph.TextWidth(label) / 2);
          labely = size.bottom;
          break;
        default:
          break;
      }
      // Drop shadow (flag 0x020).
      if ((this._ButtonStyle.flags & 32) === 32) {
        this._Graph.SetColour(this._ButtonStyle.dback);
        this._Graph.OutTextXY(labelx + 1, labely + 1, label);
      }
      this._Graph.SetColour(this._ButtonStyle.dfore);
      this._Graph.OutTextXY(labelx, labely, label);
      this._Graph.SetColour(oldColour);
    }

    // Record as a hot-mouse region (flag 0x400).
    if ((this._ButtonStyle.flags & 1024) === 1024) {
      this._MouseFields.push(
        new MouseButton(
          invertCoords,
          hostcommand,
          this._ButtonStyle.flags,
          String.fromCharCode(hotkey)
        )
      );
    }
  }

  /**
   * Copy a screen region from one Y to another.
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public CopyRegion(
    _x1: number,
    _y1: number,
    _x2: number,
    _y2: number,
    _desty: number
  ): void {
    // eslint-disable-next-line no-console
    console.log('CopyRegion() is not handled');
  }

  /**
   * Define a text variable.
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public Define(_flags: number, _text: string): void {
    // eslint-disable-next-line no-console
    console.log('Define() is not handled');
  }

  /**
   * End a rectangular text region.
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public EndText(): void {
    // eslint-disable-next-line no-console
    console.log('EndText() is not handled');
  }

  /**
   * Enter block transfer mode with the host (used for sending
   * binary data inline within a RIPscrip stream).
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public EnterBlockMode(
    _mode: number,
    _protocol: number,
    _filetype: number,
    _filename: string
  ): void {
    // eslint-disable-next-line no-console
    console.log('EnterBlockMode() is not handled');
  }

  /**
   * Query for information on a particular file (used to ask the
   * host whether a file is present before requesting it).
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public FileQuery(_mode: number, _filename: string): void {
    // eslint-disable-next-line no-console
    console.log('FileQuery() is not handled');
  }

  /**
   * Expand RIPscrip control-key escapes in host-command strings.
   *
   * The encoding: `^X` (where X is A-Z or a-z) becomes the
   * corresponding control character (1-26). `^@` becomes 0,
   * `^[` becomes 27 (ESC).
   *
   * Original had a TODO about also handling `@@` text variables —
   * preserved with the same TODO since those aren't part of this
   * migration's scope.
   */
  private HandleCtrlKeys(hostCommand: string): string {
    let result = hostCommand;
    for (let i = 1; i <= 26; i++) {
      // For example, replaces ^a or ^A with ASCII 1, etc.
      result = result.replace('^' + String.fromCharCode(64 + i), String.fromCharCode(i));
      result = result.replace('^' + String.fromCharCode(96 + i), String.fromCharCode(i));
    }
    result = result.replace('^@', String.fromCharCode(0));
    result = result.replace('^[', String.fromCharCode(27));
    return result;
  }

  /**
   * Process a clicked or hotkey-triggered mouse button: reset the
   * screen if requested, then send the host command via the Crt's
   * synthetic-key mechanism.
   *
   * Popup-style host commands (wrapped in `((...))`) currently
   * trigger an `alert()` — the original had a TODO to implement a
   * real popup. Preserved.
   */
  private HandleMouseButton(button: MouseButton): void {
    if (button.DoResetScreen()) {
      this.ResetWindows();
    }

    if (button.HostCommand !== '') {
      if (
        button.HostCommand.length > 2 &&
        button.HostCommand.substr(0, 2) === '((' &&
        button.HostCommand.substr(button.HostCommand.length - 2, 2) === '))'
      ) {
        // TODO: replace with a real popup (the original had this on
        // its roadmap as PopUp.show(...)). Preserved as alert.
        // eslint-disable-next-line no-alert
        alert('show popup ' + button.HostCommand);
      } else {
        for (let i = 0; i < button.HostCommand.length; i++) {
          this._Crt.PushKeyPress(button.HostCommand.charCodeAt(i), 0, false, false, false);
        }
      }
    }
  }

  /**
   * Returns true if `ch` is a valid command character at the given
   * RIPscrip level. The command character sets are spelled out
   * explicitly per the RIPscrip specification.
   */
  private IsCommandCharacter(ch: string, level: number): boolean {
    let commandChars = '';
    switch (level) {
      case 0:
        commandChars = '@#*=>AaBCcEeFgHIiLlmOoPpQRSsTVvWwXYZ';
        break;
      case 1:
        commandChars = 'BCDEFGIKMPRTtUW' + '\x1B';
        break;
      case 9:
        commandChars = '\x1B';
        break;
      default:
        break;
    }
    return commandChars.indexOf(ch) !== -1;
  }

  /**
   * Returns true if any key events are queued (from mouse hotkey
   * dispatches). The original had most of the actual implementation
   * commented out — preserved as-is, which means today this only
   * checks the buffer length without ingesting Crt key events.
   * Flagged for future work.
   */
  public KeyPressed(): boolean {
    // TODO: the original had this commented-out block for ingesting
    // keys from the Crt and routing them to MouseField hotkeys.
    // Preserved exactly as commented out so a future maintainer can
    // restore it:
    //
    //   while (this._Crt.KeyPressed()) {
    //     const kpe = this._Crt.ReadKey();
    //     let handled = false;
    //     for (let i = 0; i < this._MouseFields.length; i++) {
    //       const mb = this._MouseFields[i];
    //       if (mb.HotKey !== '' &&
    //           mb.HotKey.toUpperCase() === kpe.keyString.toUpperCase()) {
    //         this.HandleMouseButton(mb);
    //         handled = true;
    //         break;
    //       }
    //     }
    //     if (!handled) this._KeyBuf.push(kpe);
    //   }
    return this._KeyBuf.length > 0;
  }

  /**
   * Destroys all previously defined hot mouse regions.
   *
   * **Status: Fully Implemented.**
   */
  public KillMouseFields(): void {
    this._MouseFields = [];
  }

  /**
   * Loads and displays a disk-based RIPscrip icon.
   *
   * **Status: Partially Implemented** — only COPY mode is supported;
   * other modes are silently downgraded.
   *
   * Phase 1 migration: the original used SYNCHRONOUS XHR which
   * blocked the parser on a network call. Modern browsers warn
   * about that pattern. Migrated to async fetch using the existing
   * `_WaitingFor*` flag pattern: LoadIcon sets `_WaitingForIcon`,
   * the parser pauses, and OnIconLoadComplete clears the flag when
   * done. From the BBS's perspective the visible behavior is the
   * same.
   *
   * The hardcoded `http://www.ftelnet.ca/ripicons/` URL is preserved
   * from the original (it bypasses StringUtils.GetUrl, hitting the
   * remote server directly rather than the local embed path).
   * Flagged with a TODO for a future maintainer to revisit.
   */
  private LoadIcon(
    x: number,
    y: number,
    mode: number,
    clipboard: number,
    filename: string
  ): void {
    if (mode !== 0) {
      // eslint-disable-next-line no-console
      console.log('LoadIcon() only supports COPY mode');
      mode = 0;
    }

    // Ensure the filename ends with .ICN
    filename = filename.toUpperCase();
    if (filename.indexOf('.') === -1) {
      filename += '.ICN';
    }

    if (document.getElementById('fTelnetScript') !== null) {
      // TODO: use HTML5 localStorage for later use without re-downloading
      // (original's note, preserved).
      // TODO: switch to StringUtils.GetUrl('ripicons/' + filename) so
      // the URL resolves relative to the embed location (the original
      // hardcoded ftelnet.ca, preserved here for compatibility).
      this._WaitingForIcon = true;
      const url = 'http://www.ftelnet.ca/ripicons/' + filename;
      this.fetchIcon(url, x, y, mode, clipboard, filename);
    }
  }

  /**
   * Async helper for LoadIcon. The original wrapped this in
   * sync XHR; we use fetch with a binary-as-text encoding that
   * preserves the byte values for the ByteArray reader.
   */
  private async fetchIcon(
    url: string,
    x: number,
    y: number,
    mode: number,
    clipboard: number,
    filename: string
  ): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      // The original used XHR with overrideMimeType to force the
      // server's response to be treated as latin1-encoded text so
      // each byte maps to a char code 0-255. We replicate that by
      // reading the response as an ArrayBuffer and walking byte-by-
      // byte to build the equivalent string.
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let asString = '';
      for (let i = 0; i < bytes.length; i++) {
        asString += String.fromCharCode(bytes[i]!);
      }
      this.OnIconLoadComplete(asString, x, y, mode, clipboard, filename);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Error loading icon: ' + String(e));
    } finally {
      this._WaitingForIcon = false;
      // Resume parsing now that the icon load is complete.
      this.OnEnterFrame();
    }
  }

  /**
   * Called after a successful icon fetch. Decodes the 4-plane EGA
   * bitmap format used by RIPscrip .ICN files and PutImages it onto
   * the canvas, optionally also caching it in `_Clipboard`.
   *
   * Migration note: parameter type changed from `XMLHttpRequest` to
   * `string` (the raw binary-as-string response body) to match the
   * fetch-based loader.
   *
   * The decode loop walks four bit planes per row (one for each
   * EGA palette bit), combining them into a 4-bit palette index per
   * pixel. The endian-flip at the end is the same dance Graph
   * uses for FloodFill.
   */
  private OnIconLoadComplete(
    responseText: string,
    x: number,
    y: number,
    _mode: number,
    clipboard: number,
    _filename: string
  ): void {
    try {
      const left = x;
      const top = y;

      const BA = new ByteArray();
      BA.writeString(responseText);

      BA.position = 0;
      const width = BA.readUnsignedShort();
      const height = BA.readUnsignedShort();

      // Read the raw byte sequence after the 4-byte header.
      const InV: number[] = [];
      while (BA.bytesAvailable > 0) {
        InV.push(BA.readUnsignedByte());
      }

      const BD = new ImageData(width, height);
      const OutV = new Uint32Array(BD.data.buffer);
      let offset = 0;

      const bytes_per_plane = Math.floor((width - 1) / 8) + 1;
      const plane_offset0 = bytes_per_plane * 0;
      const plane_offset1 = bytes_per_plane * 1;
      const plane_offset2 = bytes_per_plane * 2;
      const plane_offset3 = bytes_per_plane * 3;

      for (let py = 0; py < height; ++py) {
        const row_offset = bytes_per_plane * 4 * py; // 4 = number of planes
        for (let px = 0; px < width; ++px) {
          const byte_offset = Math.floor(px / 8);
          const right_shift = 7 - (px & 7);

          // Roll in one bit from each plane to build a 4-bit
          // palette index for this pixel.
          let colour = (InV[row_offset + plane_offset0 + byte_offset]! >> right_shift) & 0x01;
          colour <<= 1;
          colour |= (InV[row_offset + plane_offset1 + byte_offset]! >> right_shift) & 0x01;
          colour <<= 1;
          colour |= (InV[row_offset + plane_offset2 + byte_offset]! >> right_shift) & 0x01;
          colour <<= 1;
          colour |= (InV[row_offset + plane_offset3 + byte_offset]! >> right_shift) & 0x01;

          let resolvedColour = this._Graph.CURRENT_PALETTE[colour]!;
          // Endian flip — see Graph.FloodFill for the same pattern.
          const r = (resolvedColour & 0xff0000) >> 16;
          const g = (resolvedColour & 0x00ff00) >> 8;
          const b = (resolvedColour & 0x0000ff) >> 0;
          resolvedColour = 0xff000000 + (b << 16) + (g << 8) + (r << 0);

          OutV[offset++] = resolvedColour;
        }
      }

      this._Graph.PutImage(left, top, BD, WriteMode.Copy);

      if (clipboard === 1) {
        this._Clipboard = BD;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Error loading icon: ' + String(e));
    }
  }

  /**
   * Append bytes to the input buffer and run the parser.
   *
   * Called from outside (typically the fTelnetClient that wires
   * up the connection). The "hackish way" comment is from the
   * original — preserved because the alternative (a real event
   * loop) is out of scope for the migration.
   */
  public Parse(data: string): void {
    for (let i = 0; i < data.length; i++) {
      this._InputBuffer.push(data.charCodeAt(i));
    }
    this.OnEnterFrame(); // TODO hackish way to get the processing done
  }

  /**
   * The parser state machine, driven character-by-character through
   * the input buffer. Three concurrent jobs:
   *
   *   1. Detect command starts (`!|` at line start or after a
   *      previous command on the same line).
   *   2. Track the current parser state (level, sublevel, command
   *      char, then payload buffer).
   *   3. Forward non-RIPscrip bytes to the Ansi parser.
   *
   * The post-state-update switch dispatches to RIP_XXX handlers
   * when enough payload has been collected for the current command.
   *
   * Pauses if `_WaitingForBitmapFont`, `_WaitingForStrokeFont`, or
   * `_WaitingForIcon` is set — the parser will be re-run when the
   * waiting flag is cleared.
   */
  private OnEnterFrame(): void {
    while (this._InputBuffer.length > 0) {
      // Pause if we're waiting for a font or icon to load.
      if (this._WaitingForBitmapFont) {
        if (BitmapFontLoaded()) {
          this._WaitingForBitmapFont = false;
        } else {
          return;
        }
      }
      if (this._WaitingForStrokeFont) {
        if (StrokeFontLoaded()) {
          this._WaitingForStrokeFont = false;
        } else {
          return;
        }
      }
      if (this._WaitingForIcon) {
        return;
      }

      const code = this._InputBuffer.shift();
      if (code === undefined) {
        continue;
      }
      const ch = String.fromCharCode(code);

      switch (this._RIPParserState) {
        case RIPParserState.None:
          if (ch === '!' && this._LineStarting) {
            this._Buffer = '';
            this._DoTextCommand = false;
            this._LineStartedWithRIP = true;
            this._LineStarting = false;
            this._RIPParserState = RIPParserState.GotExclamation;
          } else if (ch === '|' && this._LineStartedWithRIP) {
            this._Buffer = '';
            this._DoTextCommand = false;
            this._RIPParserState = RIPParserState.GotPipe;
          } else {
            this._LineStarting = code === 10;
            if (this._LineStarting) {
              this._LineStartedWithRIP = false;
            }
            this._Ansi.Write(ch);
          }
          break;

        case RIPParserState.GotExclamation:
          if (ch === '|') {
            this._RIPParserState = RIPParserState.GotPipe;
          } else {
            this._Ansi.Write('!' + ch);
            this._RIPParserState = RIPParserState.None;
          }
          break;

        case RIPParserState.GotPipe:
          this._Buffer = '';
          this._DoTextCommand = false;
          if (ch >= '0' && ch <= '9') {
            this._Level = parseInt(ch, 10);
            this._RIPParserState = RIPParserState.GotLevel;
          } else if (this.IsCommandCharacter(ch, 0)) {
            this._Command = ch;
            this._Level = 0;
            this._SubLevel = 0;
            this._RIPParserState = RIPParserState.GotCommand;
          } else {
            this._Ansi.Write('|' + ch);
            this._RIPParserState = RIPParserState.None;
          }
          break;

        case RIPParserState.GotLevel:
          if (ch >= '0' && ch <= '9') {
            this._SubLevel = parseInt(ch, 10);
            this._RIPParserState = RIPParserState.GotSubLevel;
          } else if (this.IsCommandCharacter(ch, this._Level)) {
            this._Command = ch;
            this._SubLevel = 0;
            this._RIPParserState = RIPParserState.GotCommand;
          } else {
            this._Ansi.Write('|' + this._Level.toString() + ch);
            this._RIPParserState = RIPParserState.None;
          }
          break;

        case RIPParserState.GotSubLevel:
          // TODO: original noted "Could be up to 8 sublevels altogether"
          // — preserved with the same incomplete handling.
          if (this.IsCommandCharacter(ch, this._Level)) {
            this._Command = ch;
            this._RIPParserState = RIPParserState.GotCommand;
          } else {
            this._Ansi.Write(
              '|' + this._Level.toString() + this._SubLevel.toString() + ch
            );
            this._RIPParserState = RIPParserState.None;
          }
          break;

        case RIPParserState.GotCommand:
          if (ch === '\\') {
            if (this._LastWasEscape) {
              this._LastWasEscape = false;
              this._Buffer += '\\';
            } else {
              this._LastWasEscape = true;
            }
          } else if (ch === '!') {
            if (this._LastWasEscape) {
              this._LastWasEscape = false;
              this._Buffer += '!';
            } else {
              // TODO: original noted "This shouldn't happen, so what
              // do we do if it does?" Preserved as silent ignore.
            }
          } else if (ch === '|') {
            if (this._LastWasEscape) {
              this._LastWasEscape = false;
              this._Buffer += '|';
            } else {
              // New command starting
              this._RIPParserState = RIPParserState.GotPipe;
              this._DoTextCommand = true;
            }
          } else if (code === 10) {
            if (this._LastWasEscape) {
              // Line wrap, ignore.
            } else {
              this._DoTextCommand = true;
              this._LineStarting = true;
              this._LineStartedWithRIP = false;
            }
          } else if (code === 13) {
            // Always ignore CR
          } else {
            this._Buffer += ch;
            this._LastWasEscape = false;
          }
          break;

        default:
          break;
      }

      // Some commands have 0 parameters, so we need to handle them
      // in the same loop that we moved to GotCommand. The dispatch
      // tables below check the current level and command character
      // against the expected payload length, and only execute the
      // RIP_XXX handler once enough payload has been collected.
      if (this._RIPParserState === RIPParserState.GotCommand || this._DoTextCommand) {
        this.dispatchByLevel();
      }
    }
  }

  /**
   * Dispatch loop body extracted from OnEnterFrame for readability.
   * Picks one of three level handlers based on `_Level`.
   */
  private dispatchByLevel(): void {
    switch (this._Level) {
      case 0:
        this.dispatchLevel0();
        break;
      case 1:
        this.dispatchLevel1();
        break;
      case 9:
        this.dispatchLevel9();
        break;
      default:
        break;
    }
  }

  /**
   * Level-0 RIPscrip commands. The most common — drawing primitives,
   * palette/style, text. Each case checks `_Buffer.length` to make
   * sure the command's fixed-size payload has arrived, then dispatches.
   *
   * Most cases are straightforward; the polygon-family (`l`/`P`/`p`)
   * have variable lengths driven by the first 2 chars of the buffer.
   */
  private dispatchLevel0(): void {
    let points: number;
    switch (this._Command) {
      case '@': // text_xy
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_TEXT_XY();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case '#': // no more
        this.RIP_NO_MORE();
        this._RIPParserState = RIPParserState.None;
        break;
      case '*': // reset windows
        this.RIP_RESET_WINDOWS();
        this._RIPParserState = RIPParserState.None;
        break;
      case '=': // line style
        if (this._Buffer.length === 8) {
          this.RIP_LINE_STYLE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case '>': // erase eol
        this.RIP_ERASE_EOL();
        this._RIPParserState = RIPParserState.None;
        break;
      case 'A': // arc
        if (this._Buffer.length === 10) {
          this.RIP_ARC();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'a': // one palette
        if (this._Buffer.length === 4) {
          this.RIP_ONE_PALETTE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'B': // bar
        if (this._Buffer.length === 8) {
          this.RIP_BAR();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'C': // circle
        if (this._Buffer.length === 6) {
          this.RIP_CIRCLE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'c': // colour
        if (this._Buffer.length === 2) {
          this.RIP_COLOUR();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'E': // erase view
        this.RIP_ERASE_VIEW();
        this._RIPParserState = RIPParserState.None;
        break;
      case 'e': // erase window
        this.RIP_ERASE_WINDOW();
        this._RIPParserState = RIPParserState.None;
        break;
      case 'F': // fill
        if (this._Buffer.length === 6) {
          this.RIP_FILL();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'g': // gotoxy
        if (this._Buffer.length === 4) {
          this.RIP_GOTOXY();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'H': // home
        this.RIP_HOME();
        this._RIPParserState = RIPParserState.None;
        break;
      case 'I': // pie slice
        if (this._Buffer.length === 10) {
          this.RIP_PIE_SLICE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'i': // oval pie slice
        if (this._Buffer.length === 12) {
          this.RIP_OVAL_PIE_SLICE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'L': // line
        if (this._Buffer.length === 8) {
          this.RIP_LINE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'l': // polyline (variable length)
        if (this._Buffer.length >= 2) {
          points = parseInt(this._Buffer.substr(0, 2), 36);
          if (this._Buffer.length === 2 + 4 * points) {
            this.RIP_POLYLINE();
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'm': // move
        if (this._Buffer.length === 4) {
          this.RIP_MOVE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'O': // oval
        if (this._Buffer.length === 12) {
          this.RIP_OVAL();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'o': // filled oval
        if (this._Buffer.length === 8) {
          this.RIP_FILLED_OVAL();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'P': // polygon (variable length)
        if (this._Buffer.length >= 2) {
          points = parseInt(this._Buffer.substr(0, 2), 36);
          if (this._Buffer.length === 2 + 4 * points) {
            this.RIP_POLYGON();
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'p': // filled polygon (variable length)
        if (this._Buffer.length >= 2) {
          points = parseInt(this._Buffer.substr(0, 2), 36);
          if (this._Buffer.length === 2 + 4 * points) {
            this.RIP_FILLED_POLYGON();
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'Q': // set palette
        if (this._Buffer.length === 32) {
          this.RIP_SET_PALETTE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'R': // rectangle
        if (this._Buffer.length === 8) {
          this.RIP_RECTANGLE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'S': // fill style
        if (this._Buffer.length === 4) {
          this.RIP_FILL_STYLE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 's': // fill pattern
        if (this._Buffer.length === 18) {
          this.RIP_FILL_PATTERN();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'T': // text
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_TEXT();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'V': // oval arc
        if (this._Buffer.length === 12) {
          this.RIP_OVAL_ARC();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'v': // view port
        if (this._Buffer.length === 8) {
          this.RIP_VIEWPORT();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'W': // write mode
        if (this._Buffer.length === 2) {
          this.RIP_WRITE_MODE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'w': // text window
        if (this._Buffer.length === 10) {
          this.RIP_TEXT_WINDOW();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'X': // pixel
        if (this._Buffer.length === 4) {
          this.RIP_PIXEL();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'Y': // font style
        if (this._Buffer.length === 8) {
          // Peek to see what font is being requested. Stroke fonts
          // (1-10) need the stroke data loaded; bitmap font (0)
          // needs the bitmap data. Set the appropriate waiting flag
          // and stop until the load completes.
          const font: number = parseInt(this._Buffer.substr(0, 2), 36);
          if (font > 0) {
            if (StrokeFontLoaded()) {
              this.RIP_FONT_STYLE();
              this._RIPParserState = RIPParserState.None;
            } else {
              this._WaitingForStrokeFont = true;
            }
          } else {
            if (BitmapFontLoaded()) {
              this.RIP_FONT_STYLE();
              this._RIPParserState = RIPParserState.None;
            } else {
              this._WaitingForBitmapFont = true;
            }
          }
        }
        break;
      case 'Z': // bezier
        if (this._Buffer.length === 18) {
          this.RIP_BEZIER();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      default:
        break;
    }
  }

  /** Level-1 (extended) RIPscrip commands: text variables, buttons, images. */
  private dispatchLevel1(): void {
    switch (this._Command) {
      case '\x1B': // query
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_QUERY();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'B': // button style
        if (this._Buffer.length === 36) {
          this.RIP_BUTTON_STYLE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'C': // get image
        if (this._Buffer.length === 9) {
          this.RIP_GET_IMAGE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'D': // define
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_DEFINE();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'E': // end text
        this.RIP_END_TEXT();
        this._RIPParserState = RIPParserState.None;
        break;
      case 'F': // file query
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_FILE_QUERY();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'G': // copy region
        if (this._Buffer.length === 12) {
          this.RIP_COPY_REGION();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'I': // load icon
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_LOAD_ICON();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'K': // kill mouse fields
        this.RIP_KILL_MOUSE_FIELDS();
        this._RIPParserState = RIPParserState.None;
        break;
      case 'M': // mouse
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_MOUSE();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'P': // put image
        if (this._Buffer.length === 7) {
          this.RIP_PUT_IMAGE();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 'R': // read scene
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_READ_SCENE();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'T': // begin text
        if (this._Buffer.length === 10) {
          this.RIP_BEGIN_TEXT();
          this._RIPParserState = RIPParserState.None;
        }
        break;
      case 't': // region text
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_REGION_TEXT();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'U': // button
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_BUTTON();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      case 'W': // write icon
        if (this._DoTextCommand) {
          this._DoTextCommand = false;
          this.RIP_WRITE_ICON();
          if (this._RIPParserState === RIPParserState.GotCommand) {
            this._RIPParserState = RIPParserState.None;
          }
        }
        break;
      default:
        break;
    }
  }

  /** Level-9 RIPscrip commands: just the file-block-mode initiator. */
  private dispatchLevel9(): void {
    if (this._Command === '\x1B') {
      if (this._DoTextCommand) {
        this._DoTextCommand = false;
        this.RIP_ENTER_BLOCK_MODE();
        if (this._RIPParserState === RIPParserState.GotCommand) {
          this._RIPParserState = RIPParserState.None;
        }
      }
    }
  }

  // ───────── Mouse handlers ─────────
  //
  // The original carried stale comments noting "Can't use this since
  // it isn't referring to RIP (no fat arrow used to call)" — those
  // predated an arrow-function refactor that introduced a subtle
  // listener leak. Each `addEventListener` used a fresh arrow-function
  // wrapper but `removeEventListener` was called with the raw method
  // reference, so removal silently failed every time. Fixed in
  // migration by storing the bound handlers as instance fields.

  private OnGraphCanvasMouseDown(me: MouseEvent): void {
    for (let i = this._MouseFields.length - 1; i >= 0; i--) {
      const mb: MouseButton = this._MouseFields[i]!;

      // Hit test.
      if (me.offsetX < mb.Coords.left) continue;
      if (me.offsetX > mb.Coords.right) continue;
      if (me.offsetY < mb.Coords.top) continue;
      if (me.offsetY > mb.Coords.bottom) continue;

      // Hit. Swap mousedown for mousemove+mouseup until the user
      // releases. Using stored bound handlers so the listeners can
      // be removed later.
      this._Graph.Canvas.removeEventListener('mousedown', this._onMouseDown);
      this._Graph.Canvas.addEventListener('mousemove', this._onMouseMove);
      this._Graph.Canvas.addEventListener('mouseup', this._onMouseUp);

      if (mb.IsInvertable()) {
        this._Graph.Invert(mb.Coords.left, mb.Coords.top, mb.Coords.right, mb.Coords.bottom);
      }
      this._ButtonInverted = true;
      this._ButtonPressed = i;
      break;
    }
  }

  private OnGraphCanvasMouseMove(me: MouseEvent): void {
    const mb: MouseButton = this._MouseFields[this._ButtonPressed]!;

    let over = true;
    if (me.offsetX < mb.Coords.left) over = false;
    if (me.offsetX > mb.Coords.right) over = false;
    if (me.offsetY < mb.Coords.top) over = false;
    if (me.offsetY > mb.Coords.bottom) over = false;

    if (mb.IsInvertable() && over !== this._ButtonInverted) {
      this._Graph.Invert(mb.Coords.left, mb.Coords.top, mb.Coords.right, mb.Coords.bottom);
      this._ButtonInverted = over;
    }
  }

  private OnGraphCanvasMouseUp(me: MouseEvent): void {
    this._Graph.Canvas.removeEventListener('mouseup', this._onMouseUp);
    this._Graph.Canvas.removeEventListener('mousemove', this._onMouseMove);
    this._Graph.Canvas.addEventListener('mousedown', this._onMouseDown);

    const mb: MouseButton = this._MouseFields[this._ButtonPressed]!;

    let over = true;
    if (me.offsetX < mb.Coords.left) over = false;
    if (me.offsetX > mb.Coords.right) over = false;
    if (me.offsetY < mb.Coords.top) over = false;
    if (me.offsetY > mb.Coords.bottom) over = false;

    if (over) {
      if (mb.IsInvertable() && this._ButtonInverted) {
        this._Graph.Invert(mb.Coords.left, mb.Coords.top, mb.Coords.right, mb.Coords.bottom);
      }
      this._ButtonInverted = false;
      this._ButtonPressed = -1;

      this.HandleMouseButton(mb);
    }
  }

  /**
   * Draw a poly-line (multi-faceted line). The connecting `Line`
   * calls handle line style, thickness, etc.
   *
   * **Status: Fully Implemented**, since Line() handles the heavy lifting.
   */
  public PolyLine(points: Point[]): void {
    for (let i = 1; i < points.length; i++) {
      this._Graph.Line(points[i - 1]!.x, points[i - 1]!.y, points[i]!.x, points[i]!.y);
    }
  }

  /**
   * Query the contents of a text variable.
   *
   * **Status: Partially Implemented** — handles a few specific
   * built-in queries (`$ETW$`, `$SBAROFF$`); everything else is
   * a console-log stub. Preserved from the original.
   */
  public Query(mode: number, text: string): void {
    if (mode !== 0) {
      // eslint-disable-next-line no-console
      console.log('Query() only supports immediate execution');
      mode = 0;
    }

    if (text === '$ETW$') {
      this._Graph.ClearTextWindow();
    } else if (text === '$SBAROFF$') {
      // No status bar to disable — nothing to do.
    } else {
      // eslint-disable-next-line no-console
      console.log('Query(' + text + ') is not handled');
    }
  }

  /**
   * Playback local .RIP file.
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public ReadScene(_filename: string): void {
    // eslint-disable-next-line no-console
    console.log('ReadScene() is not handled');
  }

  /**
   * Display a line of text in a rectangular text region.
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public RegionText(_justify: number, _text: string): void {
    // eslint-disable-next-line no-console
    console.log('RegionText() is not handled');
  }

  /**
   * Clear graphics/text windows and reset to full-screen state.
   *
   * **Status: Fully Implemented**, since the logic is delegated.
   *
   * Original used `delete this._Clipboard`; with strict typing
   * we assign `undefined` instead. Same observable behavior.
   */
  public ResetWindows(): void {
    this.KillMouseFields();

    this._Graph.SetTextWindow(0, 0, 79, 42, 1, 0);
    // No need to call ClearTextWindow() here — GraphDefaults() will
    // clear the whole screen anyway.
    this._Crt.ClrScr();

    this._Graph.GraphDefaults();

    this._Clipboard = undefined;
  }

  // ───────── RIP_XXX command handlers ─────────
  //
  // Each handler follows the same pattern:
  //   1. Parse fixed-position fields from `_Buffer` using
  //      `parseInt(substr, 36)` (RIPscrip uses base-36 for compact
  //      numeric values: 0-9, A-Z = 0-35).
  //   2. Start a benchmark timer.
  //   3. Call into Graph / RIP / Crt.
  //   4. Log the elapsed time and a human-readable form of the call.
  //
  // The console.log lines are preserved verbatim from the original.
  // They're chatty but invaluable for debugging in the field.

  private RIP_ARC(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const startangle = parseInt(this._Buffer.substr(4, 2), 36);
    const endangle = parseInt(this._Buffer.substr(6, 2), 36);
    const radius = parseInt(this._Buffer.substr(8, 2), 36);

    this._Benchmark.Start();
    this._Graph.Arc(xcenter, ycenter, startangle, endangle, radius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' Arc(' +
        xcenter +
        ', ' +
        ycenter +
        ', ' +
        startangle +
        ', ' +
        endangle +
        ', ' +
        radius +
        ');'
    );
  }

  private RIP_BAR(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);

    this._Benchmark.Start();
    this._Graph.Bar(x1, y1, x2, y2);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' Bar(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ');');
  }

  private RIP_BEGIN_TEXT(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);
    // reserved field at offset 8 (2 chars)

    this._Benchmark.Start();
    this.BeginText(x1, y1, x2, y2);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed + ' BeginText(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ');'
    );
  }

  private RIP_BEZIER(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);
    const x3 = parseInt(this._Buffer.substr(8, 2), 36);
    const y3 = parseInt(this._Buffer.substr(10, 2), 36);
    const x4 = parseInt(this._Buffer.substr(12, 2), 36);
    const y4 = parseInt(this._Buffer.substr(14, 2), 36);
    const count = parseInt(this._Buffer.substr(16, 2), 36);

    this._Benchmark.Start();
    this._Graph.Bezier(x1, y1, x2, y2, x3, y3, x4, y4, count);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' Bezier(' +
        x1 +
        ', ' +
        y1 +
        ', ' +
        x2 +
        ', ' +
        y2 +
        ', ' +
        x3 +
        ', ' +
        y3 +
        ', ' +
        x4 +
        ', ' +
        y4 +
        ', ' +
        count +
        ');'
    );
  }

  private RIP_BUTTON(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);
    const hotkey = parseInt(this._Buffer.substr(8, 2), 36);
    const flags = parseInt(this._Buffer.substr(10, 1), 36);
    // reserved field at offset 11 (1 char)
    const text = this._Buffer.substr(12, this._Buffer.length - 12);

    this._Benchmark.Start();
    this.Button(x1, y1, x2, y2, hotkey, flags, text);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' Button(' +
        x1 +
        ', ' +
        y1 +
        ', ' +
        x2 +
        ', ' +
        y2 +
        ', ' +
        hotkey +
        ', ' +
        flags +
        ', ' +
        text +
        ');'
    );
  }

  private RIP_BUTTON_STYLE(): void {
    const width = parseInt(this._Buffer.substr(0, 2), 36);
    const height = parseInt(this._Buffer.substr(2, 2), 36);
    const orientation = parseInt(this._Buffer.substr(4, 2), 36);
    const flags = parseInt(this._Buffer.substr(6, 4), 36);
    const bevelsize = parseInt(this._Buffer.substr(10, 2), 36);
    const dfore = parseInt(this._Buffer.substr(12, 2), 36);
    const dback = parseInt(this._Buffer.substr(14, 2), 36);
    const bright = parseInt(this._Buffer.substr(16, 2), 36);
    const dark = parseInt(this._Buffer.substr(18, 2), 36);
    const surface = parseInt(this._Buffer.substr(20, 2), 36);
    const groupid = parseInt(this._Buffer.substr(22, 2), 36);
    const flags2 = parseInt(this._Buffer.substr(24, 2), 36);
    const underlinecolour = parseInt(this._Buffer.substr(26, 2), 36);
    const cornercolour = parseInt(this._Buffer.substr(28, 2), 36);
    // reserved field at offset 30 (6 chars)

    this._Benchmark.Start();
    this.SetButtonStyle(
      width,
      height,
      orientation,
      flags,
      bevelsize,
      dfore,
      dback,
      bright,
      dark,
      surface,
      groupid,
      flags2,
      underlinecolour,
      cornercolour
    );
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' SetButtonStyle(' +
        width +
        ', ' +
        height +
        ', ' +
        orientation +
        ', ' +
        flags +
        ', ' +
        bevelsize +
        ', ' +
        dfore +
        ', ' +
        dback +
        ', ' +
        bright +
        ', ' +
        dark +
        ', ' +
        surface +
        ', ' +
        groupid +
        ', ' +
        flags2 +
        ', ' +
        underlinecolour +
        ', ' +
        cornercolour +
        ');'
    );
  }

  private RIP_CIRCLE(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const radius = parseInt(this._Buffer.substr(4, 2), 36);

    this._Benchmark.Start();
    this._Graph.Circle(xcenter, ycenter, radius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed + ' Circle(' + xcenter + ', ' + ycenter + ', ' + radius + ');'
    );
  }

  private RIP_COLOUR(): void {
    const colour = parseInt(this._Buffer.substr(0, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetColour(colour);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' SetColour(' + colour + ');');
  }

  private RIP_COPY_REGION(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);
    // reserved field at offset 8 (2 chars)
    const desty = parseInt(this._Buffer.substr(10, 2), 36);

    this._Benchmark.Start();
    this.CopyRegion(x1, y1, x2, y2, desty);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' CopyRegion(' +
        x1 +
        ', ' +
        y1 +
        ', ' +
        x2 +
        ', ' +
        y2 +
        ', ' +
        desty +
        ');'
    );
  }

  private RIP_DEFINE(): void {
    const flags = parseInt(this._Buffer.substr(0, 3), 36);
    // reserved field at offset 3 (2 chars)
    const text = this._Buffer.substr(5, this._Buffer.length - 5);

    this._Benchmark.Start();
    this.Define(flags, text);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' Define(' + flags + ', ' + text + ');');
  }

  private RIP_END_TEXT(): void {
    this._Benchmark.Start();
    this.EndText();
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' EndText();');
  }

  private RIP_ENTER_BLOCK_MODE(): void {
    const mode = parseInt(this._Buffer.substr(0, 1), 36);
    const protocol = parseInt(this._Buffer.substr(1, 1), 36);
    const filetype = parseInt(this._Buffer.substr(2, 2), 36);
    // reserved field at offset 4 (4 chars)
    const filename = this._Buffer.substr(8, this._Buffer.length - 8);

    this._Benchmark.Start();
    this.EnterBlockMode(mode, protocol, filetype, filename);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' EnterBlockMode(' +
        mode +
        ', ' +
        protocol +
        ', ' +
        filetype +
        ', ' +
        filename +
        ');'
    );
  }

  private RIP_ERASE_EOL(): void {
    this._Benchmark.Start();
    this._Graph.EraseEOL();
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' EraseEOL();');
  }

  private RIP_ERASE_VIEW(): void {
    this._Benchmark.Start();
    this._Graph.ClearViewPort();
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' EraseView();');
  }

  private RIP_ERASE_WINDOW(): void {
    this._Benchmark.Start();
    this._Graph.ClearTextWindow();
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' EraseWindow();');
  }

  private RIP_FILE_QUERY(): void {
    const mode = parseInt(this._Buffer.substr(0, 2), 36);
    // reserved field at offset 2 (4 chars)
    const filename = this._Buffer.substr(6, this._Buffer.length - 6);

    this._Benchmark.Start();
    this.FileQuery(mode, filename);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' FileQuery(' + mode + ', ' + filename + ');');
  }

  private RIP_FILL(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);
    const border = parseInt(this._Buffer.substr(4, 2), 36);

    this._Benchmark.Start();
    this._Graph.FloodFill(x, y, border);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' Fill(' + x + ', ' + y + ', ' + border + ');');
  }

  private RIP_FILL_PATTERN(): void {
    const c1 = parseInt(this._Buffer.substr(0, 2), 36);
    const c2 = parseInt(this._Buffer.substr(2, 2), 36);
    const c3 = parseInt(this._Buffer.substr(4, 2), 36);
    const c4 = parseInt(this._Buffer.substr(6, 2), 36);
    const c5 = parseInt(this._Buffer.substr(8, 2), 36);
    const c6 = parseInt(this._Buffer.substr(10, 2), 36);
    const c7 = parseInt(this._Buffer.substr(12, 2), 36);
    const c8 = parseInt(this._Buffer.substr(14, 2), 36);
    const colour = parseInt(this._Buffer.substr(16, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetFillStyle(FillStyle.User, colour);
    this._Graph.SetFillPattern([c1, c2, c3, c4, c5, c6, c7, c8], colour);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' SetFillPattern(' +
        c1 +
        ', ' +
        c2 +
        ', ' +
        c3 +
        ', ' +
        c4 +
        ', ' +
        c5 +
        ', ' +
        c6 +
        ', ' +
        c7 +
        ', ' +
        c8 +
        ', ' +
        colour +
        ');'
    );
  }

  private RIP_FILL_STYLE(): void {
    const pattern = parseInt(this._Buffer.substr(0, 2), 36);
    const colour = parseInt(this._Buffer.substr(2, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetFillStyle(pattern, colour);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' SetFillStyle(' + pattern + ', ' + colour + ');');
  }

  private RIP_FILLED_OVAL(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const xradius = parseInt(this._Buffer.substr(4, 2), 36);
    const yradius = parseInt(this._Buffer.substr(6, 2), 36);

    this._Benchmark.Start();
    this._Graph.FillEllipse(xcenter, ycenter, xradius, yradius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' this._Graph.FillEllipse(' +
        xcenter +
        ', ' +
        ycenter +
        ', ' +
        xradius +
        ', ' +
        yradius +
        ');'
    );
  }

  private RIP_FILLED_POLYGON(): void {
    this._Benchmark.Start();
    const count = parseInt(this._Buffer.substr(0, 2), 36);
    const points: Point[] = [];

    if (count >= 2) {
      for (let i = 0; i < count; i++) {
        points[i] = new Point(
          parseInt(this._Buffer.substr(2 + i * 4, 2), 36),
          parseInt(this._Buffer.substr(4 + i * 4, 2), 36)
        );
      }
      // Close the polygon for the fill.
      points.push(new Point(points[0]!.x, points[0]!.y));

      this._Graph.FillPoly(points);
      // eslint-disable-next-line no-console
      console.log(this._Benchmark.Elapsed + ' FillPoly(' + points.toString() + ');');
    } else {
      // eslint-disable-next-line no-console
      console.log('RIP_FILLED_POLYGON with ' + count + ' points is not allowed');
    }
  }

  private RIP_FONT_STYLE(): void {
    const font = parseInt(this._Buffer.substr(0, 2), 36);
    const direction = parseInt(this._Buffer.substr(2, 2), 36);
    const size = parseInt(this._Buffer.substr(4, 2), 36);
    // reserved field at offset 6 (2 chars)

    this._Benchmark.Start();
    this._Graph.SetTextStyle(font, direction, size);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' SetFontStyle(' +
        font +
        ', ' +
        direction +
        ', ' +
        size +
        ');'
    );
  }

  private RIP_GET_IMAGE(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);
    // reserved field at offset 7 (1 char)

    if (x1 > x2 || y1 > y2) {
      // eslint-disable-next-line no-console
      console.log('TODO Invalid coordinates: ' + x1 + ',' + y1 + ' to ' + x2 + ',' + y2);
      return;
    }

    this._Benchmark.Start();
    this._Clipboard = this._Graph.GetImage(x1, y1, x2, y2);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed + ' GetImage(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ');'
    );
  }

  private RIP_GOTOXY(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);

    this._Benchmark.Start();
    this._Crt.GotoXY(x, y);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' this._Crt.GotoXY(' + x + ', ' + y + ');');
  }

  private RIP_HOME(): void {
    this._Benchmark.Start();
    this._Crt.GotoXY(1, 1);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' this._Crt.GotoXY(1, 1);');
  }

  private RIP_KILL_MOUSE_FIELDS(): void {
    this._Benchmark.Start();
    this.KillMouseFields();
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' KillMouseFields();');
  }

  private RIP_LINE(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);

    this._Benchmark.Start();
    this._Graph.Line(x1, y1, x2, y2);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' Line(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ');');
  }

  private RIP_LINE_STYLE(): void {
    const style = parseInt(this._Buffer.substr(0, 2), 36);
    const userpattern = parseInt(this._Buffer.substr(2, 4), 36);
    const thickness = parseInt(this._Buffer.substr(6, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetLineStyle(style, userpattern, thickness);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' SetLineStyle(' +
        style +
        ', ' +
        userpattern +
        ', ' +
        thickness +
        ');'
    );
  }

  private RIP_LOAD_ICON(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);
    const mode = parseInt(this._Buffer.substr(4, 2), 36);
    const clipboard = parseInt(this._Buffer.substr(6, 1), 36);
    // reserved field at offset 7 (2 chars)
    const filename = this._Buffer.substr(9, this._Buffer.length - 9);

    this._Benchmark.Start();
    this.LoadIcon(x, y, mode, clipboard, filename);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' LoadIcon(' +
        x +
        ', ' +
        y +
        ', ' +
        mode +
        ', ' +
        clipboard +
        ', ' +
        filename +
        ');'
    );
  }

  private RIP_MOUSE(): void {
    // First field at offset 0 (2 chars) is the mouse-field number — unused.
    const x1 = parseInt(this._Buffer.substr(2, 2), 36);
    const y1 = parseInt(this._Buffer.substr(4, 2), 36);
    const x2 = parseInt(this._Buffer.substr(6, 2), 36);
    const y2 = parseInt(this._Buffer.substr(8, 2), 36);
    const invert = parseInt(this._Buffer.substr(10, 1), 36);
    const clear = parseInt(this._Buffer.substr(11, 1), 36);
    // reserved field at offset 12 (5 chars)
    const hostcommand = this._Buffer.substr(17, this._Buffer.length - 17);

    this._Benchmark.Start();
    // TODO move this into a function (original's note, preserved)
    let flags = 0;
    if (invert === 1) {
      flags |= 2;
    }
    if (clear === 1) {
      flags |= 4;
    }
    this._MouseFields.push(
      new MouseButton(
        new Rectangle(x1, y1, x2 - x1 + 1, y2 - y1 + 1),
        hostcommand,
        flags,
        ''
      )
    );
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' this._MouseFields.push(new MouseButton(new Rectangle(' +
        x1 +
        ', ' +
        y1 +
        ', ' +
        (x2 - x1 + 1) +
        ', ' +
        (y2 - y1 + 1) +
        "), " +
        hostcommand +
        ', ' +
        flags +
        ", '')"
    );
  }

  private RIP_MOVE(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);

    this._Benchmark.Start();
    this._Graph.MoveTo(x, y);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' this._Graph.MoveTo(' + x + ', ' + y + ');');
  }

  private RIP_NO_MORE(): void {
    // Marker command — nothing to do.
  }

  private RIP_ONE_PALETTE(): void {
    const colour = parseInt(this._Buffer.substr(0, 2), 36);
    const value = parseInt(this._Buffer.substr(2, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetPalette(colour, value);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' OnePalette(' + colour + ', ' + value + ');');
  }

  private RIP_OVAL(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const startangle = parseInt(this._Buffer.substr(4, 2), 36);
    const endangle = parseInt(this._Buffer.substr(6, 2), 36);
    const xradius = parseInt(this._Buffer.substr(8, 2), 36);
    const yradius = parseInt(this._Buffer.substr(10, 2), 36);

    this._Benchmark.Start();
    this._Graph.Ellipse(xcenter, ycenter, startangle, endangle, xradius, yradius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' Oval(' +
        xcenter +
        ', ' +
        ycenter +
        ', ' +
        startangle +
        ', ' +
        endangle +
        ', ' +
        xradius +
        ', ' +
        yradius +
        ');'
    );
  }

  private RIP_OVAL_ARC(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const startangle = parseInt(this._Buffer.substr(4, 2), 36);
    const endangle = parseInt(this._Buffer.substr(6, 2), 36);
    const xradius = parseInt(this._Buffer.substr(8, 2), 36);
    const yradius = parseInt(this._Buffer.substr(10, 2), 36);

    this._Benchmark.Start();
    this._Graph.Ellipse(xcenter, ycenter, startangle, endangle, xradius, yradius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' OvalArc(' +
        xcenter +
        ', ' +
        ycenter +
        ', ' +
        startangle +
        ', ' +
        endangle +
        ', ' +
        xradius +
        ', ' +
        yradius +
        ');'
    );
  }

  private RIP_OVAL_PIE_SLICE(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const startangle = parseInt(this._Buffer.substr(4, 2), 36);
    const endangle = parseInt(this._Buffer.substr(6, 2), 36);
    const xradius = parseInt(this._Buffer.substr(8, 2), 36);
    const yradius = parseInt(this._Buffer.substr(10, 2), 36);

    this._Benchmark.Start();
    this._Graph.Sector(xcenter, ycenter, startangle, endangle, xradius, yradius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' this._Graph.Sector(' +
        xcenter +
        ', ' +
        ycenter +
        ', ' +
        startangle +
        ', ' +
        endangle +
        ', ' +
        xradius +
        ', ' +
        yradius +
        ');'
    );
  }

  private RIP_PIE_SLICE(): void {
    const xcenter = parseInt(this._Buffer.substr(0, 2), 36);
    const ycenter = parseInt(this._Buffer.substr(2, 2), 36);
    const startangle = parseInt(this._Buffer.substr(4, 2), 36);
    const endangle = parseInt(this._Buffer.substr(6, 2), 36);
    const radius = parseInt(this._Buffer.substr(8, 2), 36);

    this._Benchmark.Start();
    this._Graph.PieSlice(xcenter, ycenter, startangle, endangle, radius);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' this._Graph.PieSlice(' +
        xcenter +
        ', ' +
        ycenter +
        ', ' +
        startangle +
        ', ' +
        endangle +
        ', ' +
        radius +
        ');'
    );
  }

  private RIP_PIXEL(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);

    this._Benchmark.Start();
    this._Graph.PutPixel(x, y, this._Graph.GetColour());
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' Pixel(' + x + ', ' + y + ');');
  }

  private RIP_POLYGON(): void {
    this._Benchmark.Start();
    const count = parseInt(this._Buffer.substr(0, 2), 36);
    const points: Point[] = [];

    for (let i = 0; i < count; i++) {
      points[i] = new Point(
        parseInt(this._Buffer.substr(2 + i * 4, 2), 36),
        parseInt(this._Buffer.substr(4 + i * 4, 2), 36)
      );
    }
    // Close the polygon.
    points.push(new Point(points[0]!.x, points[0]!.y));

    this._Graph.DrawPoly(points);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' DrawPoly(' + points.toString() + ');');
  }

  private RIP_POLYLINE(): void {
    this._Benchmark.Start();
    const count = parseInt(this._Buffer.substr(0, 2), 36);
    const points: Point[] = [];

    for (let i = 0; i < count; i++) {
      points[i] = new Point(
        parseInt(this._Buffer.substr(2 + i * 4, 2), 36),
        parseInt(this._Buffer.substr(4 + i * 4, 2), 36)
      );
    }

    // Polyline does NOT close the loop (unlike polygon).
    this._Graph.DrawPoly(points);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' DrawPoly(' + points.toString() + ');');
  }

  private RIP_PUT_IMAGE(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);
    const mode = parseInt(this._Buffer.substr(4, 2), 36);
    // reserved field at offset 6 (1 char)

    this._Benchmark.Start();
    if (this._Clipboard !== undefined) {
      this._Graph.PutImage(x, y, this._Clipboard, mode);
    }
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' PutImage(' + x + ', ' + y + ', ' + mode + ');');
  }

  private RIP_QUERY(): void {
    const mode = parseInt(this._Buffer.substr(0, 1), 36);
    // reserved field at offset 1 (3 chars)
    const text = this._Buffer.substr(4, this._Buffer.length - 4);

    this._Benchmark.Start();
    this.Query(mode, text);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' Query(' + mode + ', ' + text + ');');
  }

  private RIP_READ_SCENE(): void {
    // reserved field at offset 0 (8 chars)
    const filename = this._Buffer.substr(8, this._Buffer.length - 8);

    this._Benchmark.Start();
    this.ReadScene(filename);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' ReadScene(' + filename + ');');
  }

  private RIP_RECTANGLE(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);

    this._Benchmark.Start();
    this._Graph.Rectangle(x1, y1, x2, y2);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed + ' Rectangle(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ');'
    );
  }

  private RIP_REGION_TEXT(): void {
    const justify = parseInt(this._Buffer.substr(0, 1), 36);
    const text = this._Buffer.substr(1, this._Buffer.length - 1);

    this._Benchmark.Start();
    this.RegionText(justify, text);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' RegionText(' + justify + ', ' + text + ');');
  }

  private RIP_RESET_WINDOWS(): void {
    this._Benchmark.Start();
    this.ResetWindows();
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' ResetWindows();');
  }

  private RIP_SET_PALETTE(): void {
    const c1 = parseInt(this._Buffer.substr(0, 2), 36);
    const c2 = parseInt(this._Buffer.substr(2, 2), 36);
    const c3 = parseInt(this._Buffer.substr(4, 2), 36);
    const c4 = parseInt(this._Buffer.substr(6, 2), 36);
    const c5 = parseInt(this._Buffer.substr(8, 2), 36);
    const c6 = parseInt(this._Buffer.substr(10, 2), 36);
    const c7 = parseInt(this._Buffer.substr(12, 2), 36);
    const c8 = parseInt(this._Buffer.substr(14, 2), 36);
    const c9 = parseInt(this._Buffer.substr(16, 2), 36);
    const c10 = parseInt(this._Buffer.substr(18, 2), 36);
    const c11 = parseInt(this._Buffer.substr(20, 2), 36);
    const c12 = parseInt(this._Buffer.substr(22, 2), 36);
    const c13 = parseInt(this._Buffer.substr(24, 2), 36);
    const c14 = parseInt(this._Buffer.substr(26, 2), 36);
    const c15 = parseInt(this._Buffer.substr(28, 2), 36);
    const c16 = parseInt(this._Buffer.substr(30, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetAllPalette([c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16]);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' SetPalette(' +
        [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16].join(', ') +
        ');'
    );
  }

  private RIP_TEXT(): void {
    const text = this._Buffer;

    this._Benchmark.Start();
    this._Graph.SetTextJustify(TextJustification.Left, TextJustification.Top);
    this._Graph.OutText(text);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' OutText(' + text + ');');
  }

  private RIP_TEXT_WINDOW(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);
    const wrap = parseInt(this._Buffer.substr(8, 1), 36);
    const size = parseInt(this._Buffer.substr(9, 1), 36);

    this._Benchmark.Start();
    this._Graph.SetTextWindow(x1, y1, x2, y2, wrap, size);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed +
        ' SetTextWindow(' +
        x1 +
        ', ' +
        y1 +
        ', ' +
        x2 +
        ', ' +
        y2 +
        ', ' +
        wrap +
        ', ' +
        size +
        ');'
    );
  }

  private RIP_TEXT_XY(): void {
    const x = parseInt(this._Buffer.substr(0, 2), 36);
    const y = parseInt(this._Buffer.substr(2, 2), 36);
    const text = this._Buffer.substr(4, this._Buffer.length - 4);

    this._Benchmark.Start();
    this._Graph.SetTextJustify(TextJustification.Left, TextJustification.Top);
    this._Graph.OutTextXY(x, y, text);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' TextXY(' + x + ', ' + y + ', ' + text + ');');
  }

  private RIP_VIEWPORT(): void {
    const x1 = parseInt(this._Buffer.substr(0, 2), 36);
    const y1 = parseInt(this._Buffer.substr(2, 2), 36);
    const x2 = parseInt(this._Buffer.substr(4, 2), 36);
    const y2 = parseInt(this._Buffer.substr(6, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetViewPort(x1, y1, x2, y2, true);
    // eslint-disable-next-line no-console
    console.log(
      this._Benchmark.Elapsed + ' SetViewPort(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ');'
    );
  }

  private RIP_WRITE_ICON(): void {
    // reserved field at offset 0 (1 char)
    const filename = this._Buffer.substr(1, this._Buffer.length - 1);

    this._Benchmark.Start();
    this.WriteIcon(filename);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' WriteIcon(' + filename + ');');
  }

  private RIP_WRITE_MODE(): void {
    const mode = parseInt(this._Buffer.substr(0, 2), 36);

    this._Benchmark.Start();
    this._Graph.SetWriteMode(mode);
    // eslint-disable-next-line no-console
    console.log(this._Benchmark.Elapsed + ' SetWriteMode(' + mode + ');');
  }

  /**
   * Button style definition.
   *
   * **Status: Partially Implemented.** Original note from the
   * author: "TButtonStyle shouldn't use ints for things that don't
   * make sense, should add additional fields to expand flags" —
   * preserved as-is since refactoring ButtonStyle would force
   * changes throughout the file.
   */
  public SetButtonStyle(
    width: number,
    height: number,
    orientation: number,
    flags: number,
    bevelsize: number,
    dfore: number,
    dback: number,
    bright: number,
    dark: number,
    surface: number,
    groupid: number,
    flags2: number,
    underlinecolour: number,
    cornercolour: number
  ): void {
    this._ButtonStyle.width = width;
    this._ButtonStyle.height = height;
    this._ButtonStyle.orientation = orientation;
    this._ButtonStyle.flags = flags;
    this._ButtonStyle.bevelsize = bevelsize;
    this._ButtonStyle.dfore = dfore;
    this._ButtonStyle.dback = dback;
    this._ButtonStyle.bright = bright;
    this._ButtonStyle.dark = dark;
    this._ButtonStyle.surface = surface;
    this._ButtonStyle.groupid = groupid;
    this._ButtonStyle.flags2 = flags2;
    this._ButtonStyle.underlinecolour = underlinecolour;
    this._ButtonStyle.cornercolour = cornercolour;
  }

  /**
   * Write contents of the clipboard (icon) to disk.
   *
   * **Status: Not Implemented.** Preserved as a console-log stub.
   */
  public WriteIcon(_filename: string): void {
    // eslint-disable-next-line no-console
    console.log('WriteIcon() is not handled');
  }
}

// ───────── Module-local helpers ─────────
//
// The original code referenced `BitmapFont.Loaded` and
// `StrokeFont.Loaded` as static properties directly. Wrapped here in
// small helper functions to centralize the access point — makes it
// easier for tests to mock font readiness, and clarifies what the
// parser's waiting-loops are actually checking.

function BitmapFontLoaded(): boolean {
  return BitmapFont.Loaded;
}

function StrokeFontLoaded(): boolean {
  return StrokeFont.Loaded;
}
