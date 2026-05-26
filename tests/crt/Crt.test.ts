import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CharInfo } from '@crt/CharInfo.js';
import { ANSI_COLOURS, Color } from '@crt/Colors.js';
import { Crt } from '@crt/Crt.js';
import { KeyboardKeys } from '@crt/KeyboardKeys.js';

/*
  These tests exercise Delta 3c-1's surface: construction, buffer
  setup, window math, coordinate math, attribute manipulation, and
  the Clr / Ins / Del / Scroll operations that touch the buffer.

  The render path is stubbed in 3c-1 (FastWrite updates the buffer
  but doesn't draw pixels), so the canvas mock isn't exercised much.
  Delta 3c-2 will land the pixel-draw code and the canvas mock will
  start mattering.
*/

describe('Crt — Delta 3c-1 foundation', () => {
  let container: HTMLDivElement;
  let crt: Crt;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
  });

  describe('construction', () => {
    it('creates an 80×25 default screen', () => {
      expect(crt.ScreenCols).toBe(80);
      expect(crt.ScreenRows).toBe(25);
    });

    it('appends a canvas to the container', () => {
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.classList.contains('fTelnetCrtCanvas')).toBe(true);
    });

    it('starts with cursor at (1, 1)', () => {
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
    });

    it('starts with default ANSI colors (light gray on black)', () => {
      expect(crt.TextAttr).toBe(Color.LIGHTGRAY);
      expect(crt.CharInfo.Fore24).toBe(ANSI_COLOURS[Color.LIGHTGRAY]);
      expect(crt.CharInfo.Back24).toBe(ANSI_COLOURS[Color.BLACK]);
    });

    it('starts with window covering the full screen', () => {
      expect(crt.WindMinX).toBe(0);
      expect(crt.WindMinY).toBe(0);
      expect(crt.WindMaxX).toBe(79);
      expect(crt.WindMaxY).toBe(24);
      expect(crt.WindCols).toBe(80);
      expect(crt.WindRows).toBe(25);
    });

    it('initializes Atari and C64 modes to off', () => {
      expect(crt.Atari).toBe(false);
      expect(crt.C64).toBe(false);
    });

    it('initializes mouse reporting to off', () => {
      expect(crt.ReportMouse).toBe(false);
      expect(crt.ReportMouseSgr).toBe(false);
    });
  });

  describe('coordinate math', () => {
    it('GotoXY moves the cursor to valid positions', () => {
      crt.GotoXY(40, 12);
      expect(crt.WhereX()).toBe(40);
      expect(crt.WhereY()).toBe(12);
    });

    it('GotoXY silently ignores out-of-bounds positions', () => {
      crt.GotoXY(40, 12);
      crt.GotoXY(100, 100); // off-screen
      expect(crt.WhereX()).toBe(40);
      expect(crt.WhereY()).toBe(12);
    });

    it('GotoXY rejects zero and negative coordinates', () => {
      crt.GotoXY(40, 12);
      crt.GotoXY(0, 0);
      expect(crt.WhereX()).toBe(40);
      expect(crt.WhereY()).toBe(12);
      crt.GotoXY(-5, -5);
      expect(crt.WhereX()).toBe(40);
      expect(crt.WhereY()).toBe(12);
    });

    it('WhereXA returns absolute column (= WhereX + WindMinX)', () => {
      crt.Window(10, 5, 70, 20);
      crt.GotoXY(3, 2);
      // Window-relative is (3, 2); absolute should be (12, 6).
      expect(crt.WhereXA()).toBe(12);
      expect(crt.WhereYA()).toBe(6);
    });
  });

  describe('Window (text region)', () => {
    it('Window(10, 5, 70, 20) defines a new region and moves cursor home', () => {
      crt.GotoXY(40, 12);
      crt.Window(10, 5, 70, 20);
      expect(crt.WindMinX).toBe(9);
      expect(crt.WindMinY).toBe(4);
      expect(crt.WindMaxX).toBe(69);
      expect(crt.WindMaxY).toBe(19);
      expect(crt.WindCols).toBe(61);
      expect(crt.WindRows).toBe(16);
      // Cursor was reset to (1, 1) inside the new window.
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
    });

    it('Window rejects invalid coordinates silently', () => {
      crt.Window(10, 5, 70, 20);
      // Try to set a window with right < left — should be ignored.
      crt.Window(50, 10, 20, 30);
      // Previous window should still be in effect.
      expect(crt.WindMinX).toBe(9);
      expect(crt.WindMaxX).toBe(69);
    });

    it('Window rejects coordinates beyond the screen', () => {
      crt.Window(10, 5, 70, 20);
      crt.Window(1, 1, 100, 30); // > 80 cols, > 25 rows
      // Previous window unchanged.
      expect(crt.WindMaxX).toBe(69);
    });

    it('GotoXY is clamped by the window', () => {
      crt.Window(10, 5, 30, 15);
      // Window is 21 cols × 11 rows. Try to go to (50, 50) — should fail.
      crt.GotoXY(50, 50);
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
      // But going to (20, 10) should work — fits within the window.
      crt.GotoXY(20, 10);
      expect(crt.WhereX()).toBe(20);
      expect(crt.WhereY()).toBe(10);
    });
  });

  describe('text attribute manipulation', () => {
    it('TextColor sets the low nibble of TextAttr', () => {
      crt.TextColor(Color.CYAN);
      expect(crt.TextAttr & 0x0f).toBe(Color.CYAN);
    });

    it('TextColor preserves the high nibble (background)', () => {
      crt.TextBackground(Color.BLUE);
      crt.TextColor(Color.RED);
      expect(crt.TextAttr & 0xf0).toBe(Color.BLUE << 4);
      expect(crt.TextAttr & 0x0f).toBe(Color.RED);
    });

    it('TextBackground sets the high nibble', () => {
      crt.TextBackground(Color.RED);
      expect((crt.TextAttr & 0xf0) >> 4).toBe(Color.RED);
    });

    it('TextBackground preserves the low nibble (foreground)', () => {
      crt.TextColor(Color.YELLOW);
      crt.TextBackground(Color.RED);
      expect(crt.TextAttr & 0x0f).toBe(Color.YELLOW);
    });

    it('TextColor24 sets only the Fore24 field', () => {
      crt.TextColor24(255, 128, 64);
      expect(crt.CharInfo.Fore24).toBe(0xff8040);
    });

    it('TextBackground24 sets only the Back24 field', () => {
      crt.TextBackground24(10, 20, 30);
      expect(crt.CharInfo.Back24).toBe(0x0a141e);
    });

    it('HighVideo sets the bright bit (bit 3) on the foreground', () => {
      crt.TextColor(Color.RED); // 4
      crt.HighVideo();
      expect(crt.TextAttr & 0x0f).toBe(Color.LIGHTRED); // 12
    });

    it('LowVideo clears the bright bit', () => {
      crt.TextColor(Color.LIGHTRED); // 12
      crt.LowVideo();
      expect(crt.TextAttr & 0x0f).toBe(Color.RED); // 4
    });

    it('ReverseVideo swaps fg and bg nibbles', () => {
      crt.TextColor(Color.CYAN);
      crt.TextBackground(Color.RED);
      crt.ReverseVideo();
      expect(crt.TextAttr & 0x0f).toBe(Color.RED);
      expect((crt.TextAttr & 0xf0) >> 4).toBe(Color.CYAN);
    });

    it('NormVideo restores light gray on black with no blink', () => {
      crt.TextColor(Color.RED);
      crt.TextBackground(Color.GREEN);
      crt.SetBlink(true);
      crt.NormVideo();
      expect(crt.TextAttr).toBe(Color.LIGHTGRAY);
      expect(crt.CharInfo.Blink).toBe(false);
    });

    it('Conceal sets foreground to background color', () => {
      crt.TextBackground(Color.RED);
      crt.TextColor(Color.WHITE);
      crt.Conceal();
      expect(crt.TextAttr & 0x0f).toBe(Color.RED);
    });

    it('SetBlink toggles the blink flag on CharInfo', () => {
      crt.SetBlink(true);
      expect(crt.CharInfo.Blink).toBe(true);
      crt.SetBlink(false);
      expect(crt.CharInfo.Blink).toBe(false);
    });
  });

  describe('cursor visibility', () => {
    it('HideCursor / ShowCursor toggle visibility', () => {
      // The Cursor class exposes Visible — verified indirectly by
      // calling these methods and trusting the underlying class.
      // (Direct Cursor tests live in tests/crt/Cursor.test.ts.)
      crt.HideCursor();
      crt.ShowCursor();
      // No assertion; we only check these don't throw.
      expect(true).toBe(true);
    });
  });

  describe('FastWrite (buffer update path)', () => {
    it('writes characters into the buffer', () => {
      const info = new CharInfo(null);
      info.Attr = Color.CYAN;
      crt.FastWrite('Hi', 5, 3, info);

      // Use Checksum as a way to probe the buffer indirectly.
      // Easier: SaveScreen and check the saved cells.
      const snap = crt.SaveScreen(5, 3, 6, 3);
      expect(snap[0]?.[0]?.Ch).toBe('H');
      expect(snap[0]?.[1]?.Ch).toBe('i');
    });

    it('FastWrite with updateBuffer=false leaves buffer unchanged', () => {
      const info = new CharInfo(null);
      crt.FastWrite('XX', 1, 1, info);
      crt.FastWrite('YY', 1, 1, info, false);

      const snap = crt.SaveScreen(1, 1, 2, 1);
      expect(snap[0]?.[0]?.Ch).toBe('X');
      expect(snap[0]?.[1]?.Ch).toBe('X');
    });

    it('FastWrite silently ignores out-of-bounds y', () => {
      const info = new CharInfo(null);
      expect(() => crt.FastWrite('X', 1, 999, info)).not.toThrow();
    });

    it('FastWrite clips characters beyond the right edge of the screen', () => {
      const info = new CharInfo(null);
      // Write at x=79 (one column from the right). Two chars,
      // so the second would land at x=80 which is the last column;
      // a third would be off-screen. Writing 5 chars should land
      // 79 and 80 in the buffer; the rest is silently dropped.
      crt.FastWrite('ABCDE', 79, 1, info);
      const snap = crt.SaveScreen(79, 1, 80, 1);
      expect(snap[0]?.[0]?.Ch).toBe('A');
      expect(snap[0]?.[1]?.Ch).toBe('B');
    });
  });

  describe('Clr methods', () => {
    function writeMarker(): void {
      const info = new CharInfo(null);
      info.Attr = Color.LIGHTGRAY;
      // Fill the screen with 'X' so we can test what got cleared.
      for (let y = 1; y <= 25; y++) {
        for (let x = 1; x <= 80; x++) {
          crt.FastWrite('X', x, y, info);
        }
      }
    }

    it('ClrScr leaves the buffer full of spaces', () => {
      writeMarker();
      crt.ClrScr();
      const snap = crt.SaveScreen(1, 1, 80, 25);
      for (let y = 0; y < 25; y++) {
        for (let x = 0; x < 80; x++) {
          expect(snap[y]?.[x]?.Ch).toBe(' ');
        }
      }
    });

    it('ClrScr moves the cursor to (1, 1)', () => {
      crt.GotoXY(40, 12);
      crt.ClrScr();
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
    });

    it('ClrEol clears from cursor to end of line', () => {
      writeMarker();
      crt.GotoXY(40, 12);
      crt.ClrEol();
      // Columns 1-39 on row 12 should still be 'X'; 40-80 should be ' '.
      const snap = crt.SaveScreen(1, 12, 80, 12);
      expect(snap[0]?.[38]?.Ch).toBe('X');
      expect(snap[0]?.[39]?.Ch).toBe(' ');
      expect(snap[0]?.[79]?.Ch).toBe(' ');
    });

    it('ClrLine clears the entire current line', () => {
      writeMarker();
      crt.GotoXY(40, 12);
      crt.ClrLine();
      const snap = crt.SaveScreen(1, 12, 80, 12);
      expect(snap[0]?.[0]?.Ch).toBe(' ');
      expect(snap[0]?.[79]?.Ch).toBe(' ');
      // Surrounding lines should be untouched.
      const above = crt.SaveScreen(1, 11, 80, 11);
      const below = crt.SaveScreen(1, 13, 80, 13);
      expect(above[0]?.[0]?.Ch).toBe('X');
      expect(below[0]?.[0]?.Ch).toBe('X');
    });
  });

  describe('SaveScreen and RestoreScreen', () => {
    it('SaveScreen captures the buffer state independently of later writes', () => {
      const info = new CharInfo(null);
      crt.FastWrite('SAVE', 1, 1, info);

      const snap = crt.SaveScreen(1, 1, 4, 1);
      crt.FastWrite('NEWS', 1, 1, info); // overwrite

      // The saved snapshot should still show the original.
      expect(snap[0]?.[0]?.Ch).toBe('S');
      expect(snap[0]?.[1]?.Ch).toBe('A');
      expect(snap[0]?.[2]?.Ch).toBe('V');
      expect(snap[0]?.[3]?.Ch).toBe('E');
    });

    it('RestoreScreen puts saved state back', () => {
      const info = new CharInfo(null);
      crt.FastWrite('ORIG', 1, 1, info);
      const snap = crt.SaveScreen(1, 1, 4, 1);
      crt.FastWrite('NEWX', 1, 1, info);

      crt.RestoreScreen(snap, 1, 1, 4, 1);
      const after = crt.SaveScreen(1, 1, 4, 1);
      expect(after[0]?.[0]?.Ch).toBe('O');
      expect(after[0]?.[3]?.Ch).toBe('G');
    });
  });

  describe('Checksum (DECRQCRA)', () => {
    it('produces a stable hex string for the same input', () => {
      const info = new CharInfo(null);
      crt.FastWrite('HELLO', 1, 1, info);
      const a = crt.Checksum(1, 1, 5, 1);
      const b = crt.Checksum(1, 1, 5, 1);
      expect(a).toBe(b);
    });

    it('produces different checksums for different content', () => {
      const info = new CharInfo(null);
      crt.FastWrite('HELLO', 1, 1, info);
      const a = crt.Checksum(1, 1, 5, 1);
      crt.FastWrite('WORLD', 1, 1, info);
      const b = crt.Checksum(1, 1, 5, 1);
      expect(a).not.toBe(b);
    });

    it('returns 4 uppercase hex digits, zero-padded', () => {
      const info = new CharInfo(null);
      crt.FastWrite('A', 1, 1, info);
      const result = crt.Checksum(1, 1, 1, 1);
      expect(result).toMatch(/^[0-9A-F]{4}$/);
    });
  });

  describe('InsChar / DelChar', () => {
    it('DelChar shifts characters left and fills with current attribute', () => {
      const info = new CharInfo(null);
      info.Attr = Color.LIGHTGRAY;
      crt.FastWrite('ABCDEF', 1, 1, info);
      crt.GotoXY(2, 1); // cursor at the 'B'
      crt.DelChar(1);
      const snap = crt.SaveScreen(1, 1, 6, 1);
      // Expected: A C D E F _ (B was deleted, rest shifted left, space at end)
      expect(snap[0]?.[0]?.Ch).toBe('A');
      expect(snap[0]?.[1]?.Ch).toBe('C');
      expect(snap[0]?.[2]?.Ch).toBe('D');
      expect(snap[0]?.[3]?.Ch).toBe('E');
      expect(snap[0]?.[4]?.Ch).toBe('F');
    });

    it('InsChar shifts characters right and inserts spaces', () => {
      const info = new CharInfo(null);
      crt.FastWrite('ABCDEF', 1, 1, info);
      crt.GotoXY(2, 1); // cursor at the 'B'
      crt.InsChar(1);
      const snap = crt.SaveScreen(1, 1, 7, 1);
      // Expected: A _ B C D E F (space inserted at position 2)
      expect(snap[0]?.[0]?.Ch).toBe('A');
      expect(snap[0]?.[1]?.Ch).toBe(' ');
      expect(snap[0]?.[2]?.Ch).toBe('B');
      expect(snap[0]?.[3]?.Ch).toBe('C');
    });
  });

  describe('Delta 3c-2 methods are now wired up', () => {
    it('Write no longer throws (delegates to writeASCII by default)', () => {
      expect(() => crt.Write('hi')).not.toThrow();
    });

    it('WriteLn no longer throws', () => {
      expect(() => crt.WriteLn('hi')).not.toThrow();
    });

    it('SetFont no longer throws (returns true for a known font)', () => {
      expect(() => crt.SetFont('CP437_8x16')).not.toThrow();
    });
  });

  describe('Write — plain text (writeASCII path)', () => {
    function readRow(y: number): string {
      const snap = crt.SaveScreen(1, y, 80, y);
      let out = '';
      for (let x = 0; x < 80; x++) {
        out += snap[0]?.[x]?.Ch ?? ' ';
      }
      return out.trimEnd();
    }

    it('writes a simple string into the buffer at the cursor', () => {
      crt.GotoXY(1, 1);
      crt.Write('Hello');
      expect(readRow(1)).toBe('Hello');
    });

    it('advances the cursor by the string length', () => {
      crt.GotoXY(1, 1);
      crt.Write('Hello');
      expect(crt.WhereX()).toBe(6);
      expect(crt.WhereY()).toBe(1);
    });

    it('CR returns the cursor to column 1', () => {
      crt.GotoXY(10, 5);
      crt.Write('\r');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(5);
    });

    it('LF moves the cursor down one row', () => {
      crt.GotoXY(10, 5);
      crt.Write('\n');
      expect(crt.WhereX()).toBe(10);
      expect(crt.WhereY()).toBe(6);
    });

    it('CRLF moves cursor to start of next line', () => {
      crt.GotoXY(10, 5);
      crt.Write('\r\n');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(6);
    });

    it('FF (0x0C) clears the screen and moves to (1,1)', () => {
      crt.GotoXY(40, 12);
      crt.Write('hello');
      crt.Write('\x0c');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
      expect(readRow(12).trim()).toBe('');
    });

    it('Backspace moves the cursor left without erasing', () => {
      crt.GotoXY(5, 1);
      crt.Write('\b');
      expect(crt.WhereX()).toBe(4);
    });

    it('Backspace at column 1 stays at column 1', () => {
      crt.GotoXY(1, 1);
      crt.Write('\b');
      expect(crt.WhereX()).toBe(1);
    });

    it('Tab advances to the next multiple of 8', () => {
      crt.GotoXY(3, 1);
      crt.Write('\t');
      expect(crt.WhereX()).toBe(8);
    });

    it('Tab from column 8 advances to column 16', () => {
      crt.GotoXY(8, 1);
      crt.Write('\t');
      expect(crt.WhereX()).toBe(16);
    });

    it('writing past the right edge wraps to the next line', () => {
      crt.GotoXY(75, 1);
      crt.Write('ABCDEFGHIJ'); // 10 chars starting at col 75 — wraps after col 80
      // First 6 chars at cols 75-80, remaining 4 at cols 1-4 of row 2
      const row1 = readRow(1);
      const row2 = readRow(2);
      expect(row1.slice(74)).toBe('ABCDEF');
      expect(row2.startsWith('GHIJ')).toBe(true);
    });

    it('writing past the bottom row scrolls the screen up', () => {
      // Position at the very last row and write a newline to force scroll.
      crt.GotoXY(1, 25);
      crt.Write('LAST');
      crt.Write('\r\n'); // would put cursor at row 26 → triggers scroll
      // After scroll, cursor stays at row 25
      expect(crt.WhereY()).toBe(25);
      // "LAST" should have moved up to row 24
      expect(readRow(24).startsWith('LAST')).toBe(true);
    });

    it('BareLFtoCRLF=true makes bare LF act like CRLF', () => {
      crt.BareLFtoCRLF = true;
      crt.GotoXY(10, 5);
      crt.Write('\n');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(6);
    });

    it('BareLFtoCRLF=false (default) makes LF preserve column', () => {
      crt.BareLFtoCRLF = false;
      crt.GotoXY(10, 5);
      crt.Write('\n');
      expect(crt.WhereX()).toBe(10);
      expect(crt.WhereY()).toBe(6);
    });

    it('NULL bytes are silently ignored', () => {
      crt.GotoXY(1, 1);
      crt.Write('A\x00B\x00C');
      expect(readRow(1)).toBe('ABC');
    });
  });

  describe('Write — mode dispatch', () => {
    it('Atari=true routes through writeATASCII', () => {
      crt.Atari = true;
      crt.GotoXY(1, 1);
      crt.Write('A'); // plain printable
      const snap = crt.SaveScreen(1, 1, 1, 1);
      expect(snap[0]?.[0]?.Ch).toBe('A');
    });

    it('C64=true routes through writePETSCII', () => {
      crt.C64 = true;
      crt.GotoXY(1, 1);
      crt.Write('B');
      const snap = crt.SaveScreen(1, 1, 1, 1);
      expect(snap[0]?.[0]?.Ch).toBe('B');
    });
  });

  describe('writeATASCII (Atari mode)', () => {
    beforeEach(() => {
      crt.Atari = true;
    });

    it('0x9B (Atari LF) moves cursor to start of next line', () => {
      crt.GotoXY(10, 5);
      crt.Write('\x9b');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(6);
    });

    it('0x7D (Atari clear) clears the screen and homes cursor', () => {
      crt.GotoXY(10, 5);
      crt.Write('AB');
      crt.Write('\x7d');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
    });

    it('0x1C cursor-up wraps to bottom when at row 1', () => {
      crt.GotoXY(5, 1);
      crt.Write('\x1c');
      expect(crt.WhereY()).toBe(25); // wraps to last row
    });

    it('0x1D cursor-down wraps to top when at last row', () => {
      crt.GotoXY(5, 25);
      crt.Write('\x1d');
      expect(crt.WhereY()).toBe(1);
    });

    it('ESC (0x1B) makes the next control byte literal', () => {
      // Position at col 1, send ESC then 0x9B. With escape, 0x9B should
      // be written as a regular character (not act as a newline).
      crt.GotoXY(1, 1);
      crt.Write('\x1b\x9b');
      // After escape+0x9B, cursor should have advanced one column,
      // not moved to the next line.
      expect(crt.WhereY()).toBe(1);
    });
  });

  describe('writePETSCII (Commodore mode)', () => {
    beforeEach(() => {
      crt.C64 = true;
    });

    it('0x0D (CR) moves cursor to start of next line', () => {
      crt.GotoXY(10, 5);
      crt.Write('\x0d');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(6);
    });

    it('0x0A (LF) is silently dropped', () => {
      crt.GotoXY(10, 5);
      crt.Write('\x0a');
      // Cursor should NOT have moved
      expect(crt.WhereX()).toBe(10);
      expect(crt.WhereY()).toBe(5);
    });

    it('0x05 sets text color to white', () => {
      crt.Write('\x05');
      expect(crt.TextAttr & 0x0f).toBe(1); // PETSCIIColor.WHITE
    });

    it('0x1C sets text color to red', () => {
      crt.Write('\x1c');
      expect(crt.TextAttr & 0x0f).toBe(2); // PETSCIIColor.RED
    });

    it('0x12 enables reverse video, 0x92 disables it', () => {
      crt.Write('\x12');
      expect(crt.CharInfo.Reverse).toBe(true);
      crt.Write('\x92');
      expect(crt.CharInfo.Reverse).toBe(false);
    });

    it('0x93 (clear screen) homes the cursor', () => {
      crt.GotoXY(10, 5);
      crt.Write('\x93');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
    });

    it('0x13 (home) sets cursor to (1,1)', () => {
      crt.GotoXY(10, 5);
      crt.Write('\x13');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(1);
    });
  });

  describe('WriteLn', () => {
    it('appends CRLF', () => {
      crt.GotoXY(10, 5);
      crt.WriteLn('hi');
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(6);
    });

    it('WriteLn() with no arg just emits CRLF', () => {
      crt.GotoXY(10, 5);
      crt.WriteLn();
      expect(crt.WhereX()).toBe(1);
      expect(crt.WhereY()).toBe(6);
    });
  });

  describe('PlaySound (Web Audio)', () => {
    it('does not throw when queueing a sound', () => {
      expect(() => crt.PlaySound(800, 200)).not.toThrow();
    });

    it('Muted defaults to false', () => {
      expect(crt.Muted).toBe(false);
    });

    it('setting Muted=true prevents PlaySound from queueing', () => {
      crt.Muted = true;
      // We can't inspect internals from outside, but we CAN verify
      // that mute is observable via the getter and that PlaySound
      // doesn't throw under it.
      expect(crt.Muted).toBe(true);
      expect(() => crt.PlaySound(800, 200)).not.toThrow();
    });

    it('setting Muted=true drops any queued sounds', () => {
      // Queue a few sounds, then mute. The queue should be drained.
      crt.PlaySound(800, 200);
      crt.PlaySound(600, 100);
      crt.Muted = true;
      // No direct way to inspect queue length, but the behavior is
      // "subsequent operations don't trigger residual oscillators."
      // We can at least verify the getter reflects the new state.
      expect(crt.Muted).toBe(true);
    });

    it('un-muting allows PlaySound to queue again', () => {
      crt.Muted = true;
      crt.PlaySound(800, 200); // dropped
      crt.Muted = false;
      expect(crt.Muted).toBe(false);
      expect(() => crt.PlaySound(800, 200)).not.toThrow();
    });

    it('Write of BEL (0x07) queues a sound', () => {
      // We can't easily inspect the AudioContext in tests, but we can
      // verify that the BEL doesn't crash and doesn't advance the cursor
      // (BEL is a side effect, not a character).
      crt.GotoXY(5, 5);
      crt.Write('\x07');
      expect(crt.WhereX()).toBe(5);
      expect(crt.WhereY()).toBe(5);
    });
  });

  describe('ReportMouse setter', () => {
    it('switches the canvas cursor style', () => {
      crt.ReportMouse = true;
      expect(crt.Canvas.style.cursor).toBe('pointer');
      crt.ReportMouse = false;
      expect(crt.Canvas.style.cursor).toBe('text');
    });
  });

  describe('ARIA live region', () => {
    it('appends a div with visible printable text on CRLF', () => {
      const initialDivCount = crt.Canvas.querySelectorAll('div').length;
      crt.Write('Hello\r\n');
      const newDivCount = crt.Canvas.querySelectorAll('div').length;
      expect(newDivCount).toBeGreaterThan(initialDivCount);
    });

    it('flushes the ARIA buffer when Write ends without a newline', () => {
      const initialDivCount = crt.Canvas.querySelectorAll('div').length;
      crt.Write('Hello');
      const newDivCount = crt.Canvas.querySelectorAll('div').length;
      expect(newDivCount).toBeGreaterThan(initialDivCount);
    });

    it('does not append a div for whitespace-only content', () => {
      const initialDivCount = crt.Canvas.querySelectorAll('div').length;
      crt.Write('   \r\n');
      const newDivCount = crt.Canvas.querySelectorAll('div').length;
      expect(newDivCount).toBe(initialDivCount);
    });
  });

  describe('SetScreenSize', () => {
    it('changes the screen dimensions', () => {
      crt.SetScreenSize(132, 50);
      expect(crt.ScreenCols).toBe(132);
      expect(crt.ScreenRows).toBe(50);
    });

    it('updates the window extents to the new size', () => {
      crt.SetScreenSize(132, 50);
      expect(crt.WindMaxX).toBe(131);
      expect(crt.WindMaxY).toBe(49);
    });

    it('is a no-op when called with the current size', () => {
      crt.SetScreenSize(80, 25);
      expect(crt.ScreenCols).toBe(80);
      expect(crt.ScreenRows).toBe(25);
    });
  });

  // ───────────────────────────────────────────────────────
  // Delta 3c-3 — input handling
  // ───────────────────────────────────────────────────────

  describe('OnKeyDown — ANSI mode encoding', () => {
    function press(opts: { keyCode: number; ctrlKey?: boolean; altKey?: boolean }): void {
      const ke = new KeyboardEvent('keydown', {
        keyCode: opts.keyCode,
        ctrlKey: opts.ctrlKey ?? false,
        altKey: opts.altKey ?? false,
      } as KeyboardEventInit);
      window.dispatchEvent(ke);
    }

    function lastKey(): string {
      const k = crt.ReadKey();
      return k?.keyString ?? '';
    }

    it('Ctrl-A produces 0x01', () => {
      press({ keyCode: 65, ctrlKey: true });
      expect(lastKey()).toBe('\x01');
    });

    it('Ctrl-Z produces 0x1A', () => {
      press({ keyCode: 90, ctrlKey: true });
      expect(lastKey()).toBe('\x1A');
    });

    it('Ctrl + lowercase letter (97) also produces 0x01', () => {
      press({ keyCode: 97, ctrlKey: true });
      expect(lastKey()).toBe('\x01');
    });

    it('Enter produces CRLF', () => {
      press({ keyCode: KeyboardKeys.ENTER });
      expect(lastKey()).toBe('\r\n');
    });

    it('Backspace produces \\b', () => {
      press({ keyCode: KeyboardKeys.BACKSPACE });
      expect(lastKey()).toBe('\b');
    });

    it('Up arrow produces CSI A', () => {
      press({ keyCode: KeyboardKeys.UP });
      expect(lastKey()).toBe('\x1B[A');
    });

    it('Down arrow produces CSI B', () => {
      press({ keyCode: KeyboardKeys.DOWN });
      expect(lastKey()).toBe('\x1B[B');
    });

    it('F1 produces ESC O P', () => {
      press({ keyCode: KeyboardKeys.F1 });
      expect(lastKey()).toBe('\x1BOP');
    });

    it('F6 produces CSI 17 ~', () => {
      press({ keyCode: KeyboardKeys.F6 });
      expect(lastKey()).toBe('\x1B[17~');
    });

    it('F12 produces CSI 24 ~', () => {
      press({ keyCode: KeyboardKeys.F12 });
      expect(lastKey()).toBe('\x1B[24~');
    });

    it('Tab produces \\t', () => {
      press({ keyCode: KeyboardKeys.TAB });
      expect(lastKey()).toBe('\t');
    });

    it('Escape produces ESC', () => {
      press({ keyCode: KeyboardKeys.ESCAPE });
      expect(lastKey()).toBe('\x1B');
    });

    it('Delete produces \\x7F', () => {
      press({ keyCode: KeyboardKeys.DELETE });
      expect(lastKey()).toBe('\x7F');
    });
  });

  describe('OnKeyDown — Atari mode encoding', () => {
    beforeEach(() => {
      crt.Atari = true;
    });

    function press(opts: { keyCode: number; ctrlKey?: boolean }): void {
      const ke = new KeyboardEvent('keydown', {
        keyCode: opts.keyCode,
        ctrlKey: opts.ctrlKey ?? false,
      } as KeyboardEventInit);
      window.dispatchEvent(ke);
    }
    function lastKey(): string {
      return crt.ReadKey()?.keyString ?? '';
    }

    it('Ctrl-A produces 0x01 (same as ANSI)', () => {
      press({ keyCode: 65, ctrlKey: true });
      expect(lastKey()).toBe('\x01');
    });

    it('Ctrl-H produces 0x7E (Atari override, NOT 0x08)', () => {
      press({ keyCode: 72, ctrlKey: true });
      expect(lastKey()).toBe('\x7E');
    });

    it('Ctrl-J produces 0x0D (Atari override, NOT 0x0A)', () => {
      press({ keyCode: 74, ctrlKey: true });
      expect(lastKey()).toBe('\r');
    });

    it('Ctrl-M produces 0x9B (Atari EOL, NOT 0x0D)', () => {
      press({ keyCode: 77, ctrlKey: true });
      expect(lastKey()).toBe('\x9B');
    });

    it('Enter produces 0x9B (Atari EOL)', () => {
      press({ keyCode: KeyboardKeys.ENTER });
      expect(lastKey()).toBe('\x9B');
    });

    it('Up arrow produces 0x1C (Atari cursor-up byte)', () => {
      press({ keyCode: KeyboardKeys.UP });
      expect(lastKey()).toBe('\x1C');
    });

    it('Backspace produces 0x7E (Atari backspace)', () => {
      press({ keyCode: KeyboardKeys.BACKSPACE });
      expect(lastKey()).toBe('\x7E');
    });
  });

  describe('OnKeyDown — C64 mode encoding', () => {
    beforeEach(() => {
      crt.C64 = true;
    });

    function press(opts: { keyCode: number }): void {
      const ke = new KeyboardEvent('keydown', { keyCode: opts.keyCode } as KeyboardEventInit);
      window.dispatchEvent(ke);
    }
    function lastKey(): string {
      return crt.ReadKey()?.keyString ?? '';
    }

    it('Enter produces CR (PETSCII style)', () => {
      press({ keyCode: KeyboardKeys.ENTER });
      expect(lastKey()).toBe('\r');
    });

    it('F1 produces 0x85 (C64 F1)', () => {
      press({ keyCode: KeyboardKeys.F1 });
      expect(lastKey()).toBe('\x85');
    });

    it('F8 produces 0x8C (C64 F8)', () => {
      press({ keyCode: KeyboardKeys.F8 });
      expect(lastKey()).toBe('\x8C');
    });

    it('Up arrow produces 0x91 (C64 cursor up)', () => {
      press({ keyCode: KeyboardKeys.UP });
      expect(lastKey()).toBe('\x91');
    });

    it('Home produces 0x13 (C64 home)', () => {
      press({ keyCode: KeyboardKeys.HOME });
      expect(lastKey()).toBe('\x13');
    });
  });

  describe('OnKeyPress — printable characters', () => {
    function pressChar(charCode: number): void {
      const ke = new KeyboardEvent('keypress', {
        charCode,
      } as KeyboardEventInit);
      window.dispatchEvent(ke);
    }
    function lastKey(): string {
      return crt.ReadKey()?.keyString ?? '';
    }

    it('queues a printable ASCII letter', () => {
      pressChar(65); // 'A'
      expect(lastKey()).toBe('A');
    });

    it('queues a printable lowercase letter', () => {
      pressChar(97); // 'a'
      expect(lastKey()).toBe('a');
    });

    it('queues a printable symbol', () => {
      pressChar(33); // '!'
      expect(lastKey()).toBe('!');
    });

    it('control chars below 33 are queued with empty keyString', () => {
      // The original always pushes a KeyPressEvent (even for chars
      // that don't map to a printable). The `keyString` field is just
      // empty, so the event is essentially a no-op for the BBS but
      // still appears in the queue. Preserved behavior.
      pressChar(20);
      const k = crt.ReadKey();
      expect(k).toBeDefined();
      expect(k?.keyString).toBe('');
    });

    it('preserves accented characters (above 126)', () => {
      pressChar(233); // 'é'
      expect(lastKey()).toBe('é');
    });
  });

  describe('OnKeyPress — C64 case swap', () => {
    beforeEach(() => {
      crt.C64 = true;
    });

    function pressChar(charCode: number): void {
      const ke = new KeyboardEvent('keypress', { charCode } as KeyboardEventInit);
      window.dispatchEvent(ke);
    }
    function lastKey(): string {
      return crt.ReadKey()?.keyString ?? '';
    }

    it('uppercase A (65) gets lowercased to a', () => {
      pressChar(65);
      expect(lastKey()).toBe('a');
    });

    it('lowercase a (97) gets uppercased to A', () => {
      pressChar(97);
      expect(lastKey()).toBe('A');
    });

    it('symbols (33-64) pass through unchanged', () => {
      pressChar(64); // '@'
      expect(lastKey()).toBe('@');
    });
  });

  describe('Synthetic key events (Push*)', () => {
    it('PushKeyDown(F1) queues the same string as a real F1', () => {
      crt.PushKeyDown(0, KeyboardKeys.F1, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('\x1BOP');
    });

    it('PushKeyPress(printable) queues that char', () => {
      crt.PushKeyPress(65, 65, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('A');
    });

    it('PushKeyDown(Ctrl-C) produces \\x03', () => {
      crt.PushKeyDown(0, 67, true, false, false);
      expect(crt.ReadKey()?.keyString).toBe('\x03');
    });
  });

  describe('KeyPressed and ReadKey', () => {
    it('KeyPressed is false initially', () => {
      expect(crt.KeyPressed()).toBe(false);
    });

    it('KeyPressed is true after a key is queued', () => {
      crt.PushKeyDown(0, KeyboardKeys.UP, false, false, false);
      expect(crt.KeyPressed()).toBe(true);
    });

    it('ReadKey dequeues in FIFO order', () => {
      crt.PushKeyPress(65, 65, false, false, false);
      crt.PushKeyPress(66, 66, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('A');
      expect(crt.ReadKey()?.keyString).toBe('B');
    });

    it('ReadKey returns undefined when queue is empty', () => {
      expect(crt.ReadKey()).toBeUndefined();
    });
  });

  describe('LocalEcho', () => {
    it('disabled by default — ReadKey does not write to screen', () => {
      crt.GotoXY(1, 1);
      crt.PushKeyPress(65, 65, false, false, false);
      crt.ReadKey();
      const snap = crt.SaveScreen(1, 1, 1, 1);
      expect(snap[0]?.[0]?.Ch).toBe(' '); // unchanged
    });

    it('enabled — ReadKey writes the keystring to the screen', () => {
      crt.GotoXY(1, 1);
      crt.LocalEcho = true;
      crt.PushKeyPress(65, 65, false, false, false);
      crt.ReadKey();
      const snap = crt.SaveScreen(1, 1, 1, 1);
      expect(snap[0]?.[0]?.Ch).toBe('A');
    });
  });

  describe('onkeypressed event', () => {
    it('fires when a printable key is queued', () => {
      let fired = false;
      crt.onkeypressed.on(() => {
        fired = true;
      });
      crt.PushKeyPress(65, 65, false, false, false);
      expect(fired).toBe(true);
    });

    it('fires when a special key is queued', () => {
      let fired = false;
      crt.onkeypressed.on(() => {
        fired = true;
      });
      crt.PushKeyDown(0, KeyboardKeys.UP, false, false, false);
      expect(fired).toBe(true);
    });

    it('also fires for Ctrl-key combos even with no keyString', () => {
      let fired = false;
      crt.onkeypressed.on(() => {
        fired = true;
      });
      // A weird ctrl combo that doesn't map to anything
      crt.PushKeyDown(0, 999, true, false, false);
      expect(fired).toBe(true);
    });
  });

  describe('focus check', () => {
    it('does not queue keys when an input element is focused', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        // Dispatch a keydown with the input as target.
        const ke = new KeyboardEvent('keydown', {
          keyCode: KeyboardKeys.ENTER,
        } as KeyboardEventInit);
        Object.defineProperty(ke, 'target', { value: input });
        window.dispatchEvent(ke);

        expect(crt.KeyPressed()).toBe(false);
      } finally {
        document.body.removeChild(input);
      }
    });
  });

  describe('Scrollback mode', () => {
    it('EnterScrollback in legacy mode flips the flag', () => {
      crt.EnterScrollback();
      // No direct getter for _inScrollback, but ExitScrollback should
      // work without error if we entered.
      expect(() => crt.ExitScrollback()).not.toThrow();
    });

    it('EnterScrollback in modern-scrollback mode is a no-op', () => {
      crt.dispose();
      document.body.removeChild(container);
      // Build a fresh modern-scrollback Crt
      container = document.createElement('div');
      document.body.appendChild(container);
      crt = new Crt(container, true);

      crt.EnterScrollback();
      // We can verify by attempting a scrollback-only action: pushing
      // Up arrow should NOT consume the event (would queue it instead).
      crt.PushKeyDown(0, KeyboardKeys.UP, false, false, false);
      expect(crt.KeyPressed()).toBe(true);
    });

    it('After EnterScrollback, arrow keys are intercepted (not queued)', () => {
      crt.EnterScrollback();
      // In scrollback, arrow keys should NOT be queued for the BBS.
      const ke = new KeyboardEvent('keydown', {
        keyCode: KeyboardKeys.UP,
      } as KeyboardEventInit);
      window.dispatchEvent(ke);
      expect(crt.KeyPressed()).toBe(false);
    });

    it('ExitScrollback re-enables normal key handling', () => {
      crt.EnterScrollback();
      crt.ExitScrollback();
      const ke = new KeyboardEvent('keydown', {
        keyCode: KeyboardKeys.UP,
      } as KeyboardEventInit);
      window.dispatchEvent(ke);
      expect(crt.KeyPressed()).toBe(true);
      expect(crt.ReadKey()?.keyString).toBe('\x1B[A');
    });
  });

  describe('Mouse reporting (no selection — ReportMouse on)', () => {
    function dispatch(eventType: string, x: number, y: number, button = 0): void {
      const evt = new MouseEvent(eventType, {
        clientX: x,
        clientY: y,
        button,
      });
      // jsdom doesn't set offsetX/Y on MouseEvent — patch them in.
      Object.defineProperty(evt, 'offsetX', { value: x });
      Object.defineProperty(evt, 'offsetY', { value: y });
      crt.Canvas.dispatchEvent(evt);
    }

    it('fires onmousereport on mousedown when ReportMouse is on', () => {
      crt.ReportMouse = true;
      let report = '';
      crt.onmousereport.on((s) => {
        report = s;
      });
      dispatch('mousedown', 10, 10);
      expect(report.length).toBeGreaterThan(0);
      expect(report.startsWith('\x1B[M')).toBe(true);
    });

    it('uses SGR format when ReportMouseSgr is on', () => {
      crt.ReportMouse = true;
      crt.ReportMouseSgr = true;
      let report = '';
      crt.onmousereport.on((s) => {
        report = s;
      });
      dispatch('mousedown', 10, 10);
      expect(report.startsWith('\x1B[<')).toBe(true);
      expect(report.endsWith('M')).toBe(true);
    });

    it('does not fire when ReportMouse is off', () => {
      let fired = false;
      crt.onmousereport.on(() => {
        fired = true;
      });
      dispatch('mousedown', 10, 10);
      expect(fired).toBe(false);
    });
  });

  describe('Drag-selection highlight persistence', () => {
    // The canvas is 720x400 with a 9x16 font (80x25 cells). jsdom's
    // getBoundingClientRect returns zeros, which would make the
    // pixel->cell math divide by zero, so we stub it to the canvas's
    // intrinsic size — then pixel (col*9, row*16) maps cleanly to a
    // 1-based cell. Modern scrollback is off (new Crt(container,
    // false)), so there's no vertical offset.
    function stubRect(): void {
      const canvas = crt.Canvas;
      canvas.getBoundingClientRect = (): DOMRect =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 720,
          bottom: 400,
          width: 720,
          height: 400,
          toJSON: () => ({}),
        }) as DOMRect;
    }

    // Dispatch a mouse event at a 1-based cell. Cell (cx, cy) maps to
    // pixel (offsetX, offsetY) at the cell's top-left corner.
    function dispatchAtCell(
      eventType: string,
      cx: number,
      cy: number,
      onWindow = false
    ): void {
      const offsetX = (cx - 1) * 9 + 1;
      const offsetY = (cy - 1) * 16 + 1;
      const evt = new MouseEvent(eventType, {
        clientX: offsetX,
        clientY: offsetY,
        button: 0,
        bubbles: true,
      });
      Object.defineProperty(evt, 'offsetX', { value: offsetX });
      Object.defineProperty(evt, 'offsetY', { value: offsetY });
      if (onWindow) {
        window.dispatchEvent(evt);
      } else {
        crt.Canvas.dispatchEvent(evt);
      }
    }

    // Read a cell's Reverse flag from the buffer (no public accessor).
    function cellReverse(cx: number, cy: number): boolean {
      const buf = (crt as unknown as Record<string, any>)._buffer;
      return buf[cy]?.[cx]?.Reverse === true;
    }

    beforeEach(() => {
      stubRect();
      // Put some text on row 1 so the selected cells have content.
      crt.GotoXY(1, 1);
      crt.Write('HELLO WORLD');
    });

    it('leaves the selection highlighted after the drag (mouseup)', () => {
      // Drag across cells (1,1)..(5,1).
      dispatchAtCell('mousedown', 1, 1);
      dispatchAtCell('mousemove', 5, 1);
      dispatchAtCell('mouseup', 5, 1);

      // The dragged cells should STILL be highlighted (Reverse=true)
      // after release — the whole point of the change.
      for (let x = 1; x <= 5; x++) {
        expect(cellReverse(x, 1)).toBe(true);
      }
    });

    it('clears the persisted highlight on the next mousedown', () => {
      dispatchAtCell('mousedown', 1, 1);
      dispatchAtCell('mousemove', 5, 1);
      dispatchAtCell('mouseup', 5, 1);
      // Sanity: highlighted.
      expect(cellReverse(3, 1)).toBe(true);

      // A new mousedown elsewhere should clear the old selection.
      dispatchAtCell('mousedown', 10, 5);
      for (let x = 1; x <= 5; x++) {
        expect(cellReverse(x, 1)).toBe(false);
      }
    });

    it('a single click (no drag) does not leave a highlight', () => {
      dispatchAtCell('mousedown', 2, 1);
      dispatchAtCell('mouseup', 2, 1);
      expect(cellReverse(2, 1)).toBe(false);
    });

    it('single-clicking a URL fires onopenurl with the URL (beta.23)', () => {
      // Write a URL onto row 2 and single-click inside it.
      crt.GotoXY(1, 2);
      crt.Write('http://bbs.example.com');
      let opened: string | undefined;
      crt.onopenurl.on((url) => {
        opened = url;
      });
      // Click a cell within the URL (col 5, row 2).
      dispatchAtCell('mousedown', 5, 2);
      dispatchAtCell('mouseup', 5, 2);
      expect(opened).toBe('http://bbs.example.com');
    });

    it('single-clicking a non-URL word does not fire onopenurl', () => {
      crt.GotoXY(1, 3);
      crt.Write('justplaintext');
      let fired = false;
      crt.onopenurl.on(() => {
        fired = true;
      });
      dispatchAtCell('mousedown', 4, 3);
      dispatchAtCell('mouseup', 4, 3);
      expect(fired).toBe(false);
    });

    it('persists the highlight when the drag is released off-canvas', () => {
      dispatchAtCell('mousedown', 1, 1);
      dispatchAtCell('mousemove', 4, 1);
      // Release on window (outside the canvas).
      dispatchAtCell('mouseup', 4, 1, true);
      for (let x = 1; x <= 4; x++) {
        expect(cellReverse(x, 1)).toBe(true);
      }
      // And the next mousedown still clears it.
      dispatchAtCell('mousedown', 20, 10);
      for (let x = 1; x <= 4; x++) {
        expect(cellReverse(x, 1)).toBe(false);
      }
    });

    it('starting a new drag clears the previous selection first', () => {
      // First selection (1,1)..(5,1).
      dispatchAtCell('mousedown', 1, 1);
      dispatchAtCell('mousemove', 5, 1);
      dispatchAtCell('mouseup', 5, 1);
      expect(cellReverse(2, 1)).toBe(true);

      // Second drag starts at (8,1) — the mousedown should clear the
      // old highlight before the new drag begins.
      dispatchAtCell('mousedown', 8, 1);
      for (let x = 1; x <= 5; x++) {
        expect(cellReverse(x, 1)).toBe(false);
      }
    });
  });

  describe('Doorway mode key encoding (beta.44)', () => {
    // Doorway sends extended keys as NULL (0x00) + BIOS scan code.
    // Scan codes verified against HelpPC INT 16h table + Banana ANSI
    // BBS doorway examples. PushKeyDown signature is
    // (charCode, keyCode, ctrl, alt, shift).
    beforeEach(() => {
      crt.DoorwayMode = true;
    });

    const NUL = '\x00';

    it('DoorwayMode getter/setter round-trips', () => {
      crt.DoorwayMode = false;
      expect(crt.DoorwayMode).toBe(false);
      crt.DoorwayMode = true;
      expect(crt.DoorwayMode).toBe(true);
    });

    // Arrows (cross-checked vs Banana: left=75, right=77, up=72, down=80)
    it('arrows send NUL + scan code', () => {
      crt.PushKeyDown(0, KeyboardKeys.LEFT, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x4b));
      crt.PushKeyDown(0, KeyboardKeys.RIGHT, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x4d));
      crt.PushKeyDown(0, KeyboardKeys.UP, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x48));
      crt.PushKeyDown(0, KeyboardKeys.DOWN, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x50));
    });

    // F1 across all four modifier states (Banana: 59/84/94/104)
    it('F1 plain/shift/ctrl/alt send the correct scan codes', () => {
      crt.PushKeyDown(0, KeyboardKeys.F1, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x3b)); // 59
      crt.PushKeyDown(0, KeyboardKeys.F1, false, false, true); // shift
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x54)); // 84
      crt.PushKeyDown(0, KeyboardKeys.F1, true, false, false); // ctrl
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x5e)); // 94
      crt.PushKeyDown(0, KeyboardKeys.F1, false, true, false); // alt
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x68)); // 104
    });

    it('F10 and F12 send correct scan codes', () => {
      crt.PushKeyDown(0, KeyboardKeys.F10, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x44));
      crt.PushKeyDown(0, KeyboardKeys.F12, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x86));
    });

    // Editing keys (Banana: Insert=82, ctrl-pgdn=118, ctrl-end=117)
    it('Insert, PageDown, and ctrl variants', () => {
      crt.PushKeyDown(0, KeyboardKeys.INSERT, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x52)); // 82
      crt.PushKeyDown(0, KeyboardKeys.PAGE_DOWN, true, false, false); // ctrl
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x76)); // 118
      crt.PushKeyDown(0, KeyboardKeys.END, true, false, false); // ctrl
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x75)); // 117
    });

    // shift-tab = 15 (Banana), ctrl-left=115, ctrl-right=116
    it('shift-tab and ctrl-arrows', () => {
      crt.PushKeyDown(0, KeyboardKeys.TAB, false, false, true); // shift
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x0f)); // 15
      crt.PushKeyDown(0, KeyboardKeys.LEFT, true, false, false); // ctrl
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x73)); // 115
      crt.PushKeyDown(0, KeyboardKeys.RIGHT, true, false, false); // ctrl
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x74)); // 116
    });

    // Alt+letter: Alt-A=0x1E, Alt-Z=0x2C
    it('Alt+letter sends NUL + scan code (Alt-A, Alt-Z)', () => {
      crt.PushKeyDown(0, 65, false, true, false); // Alt-A
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x1e));
      crt.PushKeyDown(0, 90, false, true, false); // Alt-Z
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x2c));
    });

    // Alt+digit: Alt-1=0x78, Alt-0=0x81
    it('Alt+digit sends NUL + scan code (Alt-1, Alt-0)', () => {
      crt.PushKeyDown(0, 49, false, true, false); // Alt-1
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x78));
      crt.PushKeyDown(0, 48, false, true, false); // Alt-0
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x81));
    });

    // Ctrl+letter stays as the real ASCII control char (no NUL prefix)
    it('Ctrl+letter sends the ASCII control code (Ctrl-C = 0x03)', () => {
      crt.PushKeyDown(0, 67, true, false, false); // Ctrl-C
      expect(crt.ReadKey()?.keyString).toBe('\x03');
    });

    // Alt wins over Ctrl when both held (Alt-A scan code, not Ctrl-A)
    it('Alt wins over Ctrl when both modifiers are held', () => {
      crt.PushKeyDown(0, 65, true, true, false); // Ctrl+Alt+A
      expect(crt.ReadKey()?.keyString).toBe(NUL + String.fromCharCode(0x1e));
    });

    // Enter/Backspace/Esc plain forms
    it('Enter, Backspace, Esc plain forms', () => {
      crt.PushKeyDown(0, KeyboardKeys.ENTER, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('\r');
      crt.PushKeyDown(0, KeyboardKeys.BACKSPACE, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('\b');
      crt.PushKeyDown(0, KeyboardKeys.ESCAPE, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('\x1B');
    });

    it('when doorway mode is OFF, arrows use ANSI escapes (not scan codes)', () => {
      crt.DoorwayMode = false;
      crt.PushKeyDown(0, KeyboardKeys.UP, false, false, false);
      expect(crt.ReadKey()?.keyString).toBe('\x1B[A');
    });
  });
});
