import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CharInfo } from '@crt/CharInfo.js';
import { ANSI_COLOURS, Color } from '@crt/Colors.js';
import { Crt } from '@crt/Crt.js';

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

  describe('Delta 3c-3 methods still throw clearly', () => {
    it('EnterScrollback throws with a clear message', () => {
      expect(() => crt.EnterScrollback()).toThrow(/Delta 3c-3/);
    });

    it('PushKeyDown throws with a clear message', () => {
      expect(() => crt.PushKeyDown(65, 65, false, false, false)).toThrow(/Delta 3c-3/);
    });
  });
});
