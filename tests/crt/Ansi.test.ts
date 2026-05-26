import { describe, it, expect, beforeEach } from 'vitest';
import { CharInfo } from '@crt/CharInfo.js';
import { Ansi } from '@crt/Ansi.js';
import type { AnsiTarget } from '@crt/AnsiTarget.js';
import type { CrtFont } from '@crt/CrtFont.js';

/**
 * Recording stub for AnsiTarget. Instead of actually rendering anything,
 * it captures every method call so tests can assert on the call log.
 *
 * Cursor position and basic state are tracked so cursor-move tests
 * have something to read back. The window/screen size is fixed at
 * 80×25 unless a test overrides it.
 */
class RecordingTarget implements AnsiTarget {
  // Cursor + screen state (mutated by calls)
  private _x = 1;
  private _y = 1;
  public TextAttr = 7;
  public ReportMouse = false;
  public ReportMouseSgr = false;
  public DoorwayMode = false;

  // Fixed state
  public Atari = false;
  public C64 = false;
  public CharInfo = new CharInfo(null);
  public Font = {
    Width: 9,
    Height: 16,
  } as unknown as CrtFont;
  public ScreenCols = 80;
  public ScreenRows = 25;
  public WindCols = 80;
  public WindRows = 25;
  public WindMaxX = 79;
  public WindMaxY = 24;
  public WindMinY = 0;

  // Log of every method call, in order. Tests inspect this.
  public calls: Array<{ method: string; args: unknown[] }> = [];

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  // ───── Methods ─────
  Checksum(x1: number, y1: number, x2: number, y2: number): string {
    this.record('Checksum', x1, y1, x2, y2);
    return '0000';
  }
  ClrBol(): void { this.record('ClrBol'); }
  ClrBos(): void { this.record('ClrBos'); }
  ClrEol(): void { this.record('ClrEol'); }
  ClrEos(): void { this.record('ClrEos'); }
  ClrLine(): void { this.record('ClrLine'); }
  ClrScr(): void {
    this.record('ClrScr');
    this._x = 1;
    this._y = 1;
  }
  Conceal(): void { this.record('Conceal'); }
  DelChar(count: number): void { this.record('DelChar', count); }
  DelLine(count: number): void { this.record('DelLine', count); }
  FastWrite(text: string, x: number, y: number, info: CharInfo): void {
    this.record('FastWrite', text, x, y, info);
  }
  GotoXY(x: number, y: number): void {
    this.record('GotoXY', x, y);
    this._x = x;
    this._y = y;
  }
  HideCursor(): void { this.record('HideCursor'); }
  HighVideo(): void { this.record('HighVideo'); }
  InsChar(count: number): void { this.record('InsChar', count); }
  InsLine(count: number): void { this.record('InsLine', count); }
  LowVideo(): void { this.record('LowVideo'); }
  NormVideo(): void {
    this.record('NormVideo');
    this.TextAttr = 7;
  }
  ReverseVideo(): void { this.record('ReverseVideo'); }
  ScrollDownWindow(count: number): void { this.record('ScrollDownWindow', count); }
  ScrollUpScreen(count: number): void { this.record('ScrollUpScreen', count); }
  SetBlink(value: boolean): void { this.record('SetBlink', value); }
  SetBlinkRate(ms: number): void { this.record('SetBlinkRate', ms); }
  SetFont(name: string): boolean {
    this.record('SetFont', name);
    return true;
  }
  ShowCursor(): void { this.record('ShowCursor'); }
  TextBackground(colour: number): void { this.record('TextBackground', colour); }
  TextBackground24(r: number, g: number, b: number): void {
    this.record('TextBackground24', r, g, b);
  }
  TextColor(colour: number): void { this.record('TextColor', colour); }
  TextColor24(r: number, g: number, b: number): void {
    this.record('TextColor24', r, g, b);
  }
  WhereX(): number { return this._x; }
  WhereXA(): number { return this._x; }
  WhereY(): number { return this._y; }
  WhereYA(): number { return this._y; }
  Write(text: string): void { this.record('Write', text); }

  // Helpers for tests
  callsOf(method: string): Array<{ method: string; args: unknown[] }> {
    return this.calls.filter((c) => c.method === method);
  }
  lastCallOf(method: string): { method: string; args: unknown[] } | undefined {
    return this.calls.slice().reverse().find((c) => c.method === method);
  }
}

describe('Ansi parser', () => {
  let target: RecordingTarget;
  let ansi: Ansi;

  beforeEach(() => {
    target = new RecordingTarget();
    ansi = new Ansi(target);
  });

  describe('plain text', () => {
    it('passes plain text through to the target', () => {
      ansi.Write('Hello');
      // Plain text is buffered and flushed at end of Write — may be one
      // call with the full string, or one per character; we just check
      // the concatenation.
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('Hello');
    });

    it('skips ANSI parsing entirely in Atari mode', () => {
      target.Atari = true;
      ansi.Write('\x1B[31mRED');
      // The whole thing should be passed straight through unchanged.
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('\x1B[31mRED');
    });

    it('skips ANSI parsing entirely in C64 mode', () => {
      target.C64 = true;
      ansi.Write('\x1B[31mRED');
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('\x1B[31mRED');
    });
  });

  describe('SGR — text attributes (CSI m)', () => {
    it('CSI 0 m resets to normal video', () => {
      ansi.Write('\x1B[0m');
      expect(target.callsOf('NormVideo').length).toBe(1);
    });

    it('CSI m (no parameters) defaults to 0 and resets', () => {
      ansi.Write('\x1B[m');
      expect(target.callsOf('NormVideo').length).toBe(1);
    });

    it('CSI 1 m sets high intensity', () => {
      ansi.Write('\x1B[1m');
      expect(target.callsOf('HighVideo').length).toBe(1);
    });

    it('CSI 5 m enables blink at 500ms rate', () => {
      ansi.Write('\x1B[5m');
      expect(target.lastCallOf('SetBlink')?.args[0]).toBe(true);
      expect(target.lastCallOf('SetBlinkRate')?.args[0]).toBe(500);
    });

    it('CSI 6 m enables blink at 250ms (fast) rate', () => {
      ansi.Write('\x1B[6m');
      expect(target.lastCallOf('SetBlinkRate')?.args[0]).toBe(250);
    });

    it('CSI 25 m disables blink', () => {
      ansi.Write('\x1B[25m');
      expect(target.lastCallOf('SetBlink')?.args[0]).toBe(false);
    });

    it('CSI 7 m reverses video', () => {
      ansi.Write('\x1B[7m');
      expect(target.callsOf('ReverseVideo').length).toBe(1);
    });

    it('CSI 32 m sets foreground to green (ECMA→CGA reorder = 2)', () => {
      ansi.Write('\x1B[32m');
      // ANSI_COLORS[32-30] = ANSI_COLORS[2] = 2 (green in CGA).
      expect(target.lastCallOf('TextColor')?.args[0]).toBe(2);
    });

    it('CSI 31 m sets foreground to red (ECMA 1 → CGA 4)', () => {
      ansi.Write('\x1B[31m');
      expect(target.lastCallOf('TextColor')?.args[0]).toBe(4);
    });

    it('CSI 44 m sets background to blue (ECMA 4 → CGA 1)', () => {
      ansi.Write('\x1B[44m');
      expect(target.lastCallOf('TextBackground')?.args[0]).toBe(1);
    });

    it('handles compound SGR like CSI 1;32;44 m', () => {
      ansi.Write('\x1B[1;32;44m');
      expect(target.callsOf('HighVideo').length).toBe(1);
      expect(target.lastCallOf('TextColor')?.args[0]).toBe(2);
      expect(target.lastCallOf('TextBackground')?.args[0]).toBe(1);
    });

    it('CSI 90 m sets bright black (gray) via ECMA→CGA map +8', () => {
      ansi.Write('\x1B[90m');
      // Color 0 (black) + 8 = 8 (dark gray)
      expect(target.lastCallOf('TextColor')?.args[0]).toBe(8);
    });

    it('CSI 38;2;255;128;0 m sets 24-bit foreground', () => {
      ansi.Write('\x1B[38;2;255;128;0m');
      const call = target.lastCallOf('TextColor24');
      expect(call?.args).toEqual([255, 128, 0]);
    });

    it('CSI 48;2;10;20;30 m sets 24-bit background', () => {
      ansi.Write('\x1B[48;2;10;20;30m');
      const call = target.lastCallOf('TextBackground24');
      expect(call?.args).toEqual([10, 20, 30]);
    });

    it('CSI 38;5;n m looks up the 256-color palette', () => {
      // Palette index 9 is bright red (255, 0, 0)
      ansi.Write('\x1B[38;5;9m');
      const call = target.lastCallOf('TextColor24');
      expect(call?.args).toEqual([255, 0, 0]);
    });

    it('CSI 38;5;n m index 15 is white', () => {
      ansi.Write('\x1B[38;5;15m');
      expect(target.lastCallOf('TextColor24')?.args).toEqual([255, 255, 255]);
    });

    it('CSI 38;5;n m grayscale ramp (entry 232 is darkest gray)', () => {
      ansi.Write('\x1B[38;5;232m');
      expect(target.lastCallOf('TextColor24')?.args).toEqual([8, 8, 8]);
    });
  });

  describe('cursor movement', () => {
    it('CSI <y>;<x> H moves the cursor', () => {
      ansi.Write('\x1B[10;20H');
      const call = target.lastCallOf('GotoXY');
      expect(call?.args).toEqual([20, 10]);
    });

    it('CSI H with no parameters goes home (1,1)', () => {
      ansi.Write('\x1B[H');
      expect(target.lastCallOf('GotoXY')?.args).toEqual([1, 1]);
    });

    it('CSI 5 A moves cursor up 5 lines, clamped at 1', () => {
      target.GotoXY(10, 3);
      target.calls = []; // reset history
      ansi.Write('\x1B[5A');
      // From y=3 up 5 should clamp to 1
      expect(target.lastCallOf('GotoXY')?.args[1]).toBe(1);
    });

    it('CSI 3 B moves cursor down 3 lines', () => {
      target.GotoXY(10, 5);
      target.calls = [];
      ansi.Write('\x1B[3B');
      // From y=5 down 3 = 8 (well within 25-row window)
      expect(target.lastCallOf('GotoXY')?.args[1]).toBe(8);
    });

    it('CSI C with default of 1 moves cursor right one column', () => {
      target.GotoXY(10, 5);
      target.calls = [];
      ansi.Write('\x1B[C');
      expect(target.lastCallOf('GotoXY')?.args[0]).toBe(11);
    });

    it('CSI s saves and CSI u restores cursor position', () => {
      target.GotoXY(40, 12);
      target.calls = [];
      ansi.Write('\x1B[s');
      target.GotoXY(1, 1);
      target.calls = [];
      ansi.Write('\x1B[u');
      expect(target.lastCallOf('GotoXY')?.args).toEqual([40, 12]);
    });
  });

  describe('screen clearing', () => {
    it('CSI 2 J clears the screen', () => {
      ansi.Write('\x1B[2J');
      expect(target.callsOf('ClrScr').length).toBe(1);
    });

    it('CSI J (default 0) clears to end of screen', () => {
      ansi.Write('\x1B[J');
      expect(target.callsOf('ClrEos').length).toBe(1);
    });

    it('CSI 1 J clears to beginning of screen', () => {
      ansi.Write('\x1B[1J');
      expect(target.callsOf('ClrBos').length).toBe(1);
    });

    it('CSI K (default 0) clears to end of line', () => {
      ansi.Write('\x1B[K');
      expect(target.callsOf('ClrEol').length).toBe(1);
    });

    it('CSI 2 K clears entire line', () => {
      ansi.Write('\x1B[2K');
      expect(target.callsOf('ClrLine').length).toBe(1);
    });
  });

  describe('mouse reporting modes', () => {
    it('CSI ?1000 h enables normal tracking mouse reporting', () => {
      ansi.Write('\x1B[?1000h');
      expect(target.ReportMouse).toBe(true);
    });

    it('CSI ?1000 l disables normal tracking mouse reporting', () => {
      target.ReportMouse = true;
      ansi.Write('\x1B[?1000l');
      expect(target.ReportMouse).toBe(false);
    });

    it('CSI ?1006 h enables SGR-encoded extended coordinates', () => {
      ansi.Write('\x1B[?1006h');
      expect(target.ReportMouseSgr).toBe(true);
    });

    it('CSI ?9 h enables X10 mouse AND shows cursor (matches original)', () => {
      // The original had a missing `break` after the ?9 case so it
      // fell through into ?25 (cursor show). We preserve that.
      ansi.Write('\x1B[?9h');
      expect(target.ReportMouse).toBe(true);
      expect(target.callsOf('ShowCursor').length).toBe(1);
    });
  });

  describe('cursor visibility', () => {
    it('CSI ?25 h shows the cursor', () => {
      ansi.Write('\x1B[?25h');
      expect(target.callsOf('ShowCursor').length).toBe(1);
    });

    it('CSI ?25 l hides the cursor', () => {
      ansi.Write('\x1B[?25l');
      expect(target.callsOf('HideCursor').length).toBe(1);
    });
  });

  describe('multi-chunk parsing', () => {
    it('handles an escape sequence split across two Write calls', () => {
      ansi.Write('\x1B[3');
      ansi.Write('1m');
      // After both calls, the parser should have seen CSI 31 m.
      expect(target.lastCallOf('TextColor')?.args[0]).toBe(4); // ECMA 1 → CGA 4
    });

    it('handles plain text interleaved with sequences', () => {
      ansi.Write('A\x1B[31mB\x1B[0mC');
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('ABC');
      expect(target.callsOf('TextColor').length).toBe(1);
      expect(target.callsOf('NormVideo').length).toBe(1);
    });
  });

  describe('special sequences', () => {
    it('ESC c (RIS) resets video and clears screen', () => {
      ansi.Write('\x1Bc');
      expect(target.callsOf('NormVideo').length).toBe(1);
      expect(target.callsOf('ClrScr').length).toBe(1);
    });

    it('ESC E (NEL) writes CRLF', () => {
      ansi.Write('\x1BE');
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('\r\n');
    });
  });

  describe('insert/delete operations', () => {
    it('CSI 3 @ inserts 3 characters', () => {
      ansi.Write('\x1B[3@');
      expect(target.lastCallOf('InsChar')?.args[0]).toBe(3);
    });

    it('CSI 5 P deletes 5 characters', () => {
      ansi.Write('\x1B[5P');
      expect(target.lastCallOf('DelChar')?.args[0]).toBe(5);
    });

    it('CSI 2 L inserts 2 lines', () => {
      ansi.Write('\x1B[2L');
      expect(target.lastCallOf('InsLine')?.args[0]).toBe(2);
    });

    it('CSI 4 M deletes 4 lines', () => {
      ansi.Write('\x1B[4M');
      expect(target.lastCallOf('DelLine')?.args[0]).toBe(4);
    });
  });

  describe('device status report', () => {
    it('CSI 5 n fires onesc5n', () => {
      let fired = false;
      ansi.onesc5n.on(() => {
        fired = true;
      });
      ansi.Write('\x1B[5n');
      expect(fired).toBe(true);
    });

    it('CSI 6 n fires onesc6n (cursor position query)', () => {
      let fired = false;
      ansi.onesc6n.on(() => {
        fired = true;
      });
      ansi.Write('\x1B[6n');
      expect(fired).toBe(true);
    });

    it('CSI 255 n fires onesc255n (screen size query)', () => {
      let fired = false;
      ansi.onesc255n.on(() => {
        fired = true;
      });
      ansi.Write('\x1B[255n');
      expect(fired).toBe(true);
    });
  });

  describe('CursorPosition response format', () => {
    it('formats a position as CSI <y>;<x> R', () => {
      target.GotoXY(40, 12);
      expect(ansi.CursorPosition()).toBe('\x1B[12;40R');
    });

    it('accepts explicit x/y', () => {
      expect(ansi.CursorPosition(5, 3)).toBe('\x1B[3;5R');
    });
  });

  describe('ScreenSizeInPixels response format', () => {
    it('multiplies cell size by font dimensions', () => {
      // 80 × 9 = 720, 25 × 16 = 400
      expect(ansi.ScreenSizeInPixels()).toBe('\x1B[?2;0;720;400S');
    });
  });

  describe('RIP detect / enable / disable', () => {
    it('CSI 0 ! fires onripdetect', () => {
      let fired = false;
      ansi.onripdetect.on(() => {
        fired = true;
      });
      ansi.Write('\x1B[0!');
      expect(fired).toBe(true);
    });

    it('CSI 1 ! fires onripdisable', () => {
      let fired = false;
      ansi.onripdisable.on(() => {
        fired = true;
      });
      ansi.Write('\x1B[1!');
      expect(fired).toBe(true);
    });

    it('CSI 2 ! fires onripenable', () => {
      let fired = false;
      ansi.onripenable.on(() => {
        fired = true;
      });
      ansi.Write('\x1B[2!');
      expect(fired).toBe(true);
    });
  });

  describe('malformed sequences', () => {
    it('treats CSI followed by unknown final byte as a no-op', () => {
      // \x1B [ ` is HPA, but \x1B [ \x01 is nonsense — should be benign.
      // The buffered \x1B will be added to the buffer when the parser
      // resets to None, but we won't crash.
      expect(() => ansi.Write('\x1B[\x01')).not.toThrow();
    });

    it('survives a parameter byte after an intermediate (invalid)', () => {
      // CSI SP 5 m is illegal sequencing; parser should abort and not crash.
      expect(() => ansi.Write('\x1B[ 5m')).not.toThrow();
    });

    it('does not crash on unknown CSI command', () => {
      expect(() => ansi.Write('\x1B[Z')).not.toThrow();
      // Z is actually CBT — let's pick something truly unknown.
      expect(() => ansi.Write('\x1B[~')).not.toThrow();
    });
  });

  describe('doorway mode (beta.44)', () => {
    it('ESC[=255h enables doorway mode on the target', () => {
      ansi.Write('\x1B[=255h');
      expect(target.DoorwayMode).toBe(true);
    });

    it('ESC[=255l disables doorway mode', () => {
      target.DoorwayMode = true;
      ansi.Write('\x1B[=255l');
      expect(target.DoorwayMode).toBe(false);
    });

    it('in doorway mode, a NULL forces the next byte to be written literally', () => {
      target.DoorwayMode = true;
      // NUL then ESC: without the literal rule, ESC would start an
      // escape sequence. With it, the ESC byte is written as text.
      ansi.Write('\x00\x1B');
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('\x1B');
    });

    it('the literal rule consumes only ONE byte (next char parses normally)', () => {
      target.DoorwayMode = true;
      // NUL X (X literal), then a real ESC[31m should still set color.
      ansi.Write('\x00X\x1B[31m');
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      expect(writes).toBe('X');
      // The ESC[31m after the literal X is parsed normally (red = CGA 4).
      expect(target.lastCallOf('TextColor')?.args[0]).toBe(4);
    });

    it('NOT in doorway mode, a NULL is handled normally (no literal latch)', () => {
      // doorway off (default): NUL then ESC[2J behaves as usual (the
      // ESC sequence is interpreted, not written literally).
      ansi.Write('\x00\x1B[2J');
      const writes = target.callsOf('Write').map((c) => c.args[0]).join('');
      // The ESC[2J should NOT appear as literal text.
      expect(writes.includes('\x1B')).toBe(false);
    });
  });
});
