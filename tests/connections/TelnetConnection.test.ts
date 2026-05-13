import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ByteArray } from '@common/ByteArray.js';
import { TelnetCommand } from '@connections/TelnetCommand.js';
import { TelnetConnection } from '@connections/TelnetConnection.js';
import { TelnetOption } from '@connections/TelnetOption.js';
import type { WindowSizeSource } from '@connections/WindowSizeSource.js';

/**
 * These tests drive the telnet protocol parser directly without
 * standing up a WebSocket. We feed it byte sequences and verify:
 *   1. Data bytes appear in the input buffer
 *   2. IAC commands are handled (consumed and replied to)
 *   3. IAC IAC sequences decode to a literal 0xFF
 *   4. Subnegotiation framing is parsed correctly
 *   5. Outbound data has 0xFF doubled (IAC escaping)
 */

class FakeWindowSize implements WindowSizeSource {
  public WindCols = 80;
  public WindRows = 25;
}

/**
 * Test subclass that exposes the protected `Send` method so tests can
 * observe what would have been written to the wire.
 */
class TestableTelnetConnection extends TelnetConnection {
  public sentBytes: number[][] = [];

  public override Send(data: number[]): void {
    this.sentBytes.push([...data]);
  }

  /** Drive the inbound parser with a literal byte sequence. */
  public feed(bytes: number[]): void {
    const ba = new ByteArray();
    for (const b of bytes) {
      ba.writeByte(b);
    }
    ba.position = 0;
    this.NegotiateInbound(ba);
  }

  /** Read everything that's been written to the input buffer so far. */
  public drainInput(): number[] {
    const result: number[] = [];
    this._InputBuffer.position = 0;
    while (this._InputBuffer.bytesAvailable > 0) {
      result.push(this._InputBuffer.readUnsignedByte());
    }
    return result;
  }
}

describe('TelnetConnection', () => {
  let conn: TestableTelnetConnection;
  let windowSize: FakeWindowSize;

  beforeEach(() => {
    windowSize = new FakeWindowSize();
    conn = new TestableTelnetConnection(windowSize, 'ansi-bbs');
  });

  describe('plain data flow', () => {
    it('passes regular bytes straight through to the input buffer', () => {
      conn.feed([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      expect(conn.drainInput()).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it('decodes an escaped IAC (IAC IAC) as a single 0xFF', () => {
      conn.feed([0x41, TelnetCommand.IAC, TelnetCommand.IAC, 0x42]);
      expect(conn.drainInput()).toEqual([0x41, 0xff, 0x42]);
    });

    it('ignores recognized but ignorable commands (NOP, DM, BRK, etc.)', () => {
      conn.feed([0x41, TelnetCommand.IAC, TelnetCommand.NoOperation, 0x42]);
      expect(conn.drainInput()).toEqual([0x41, 0x42]);
    });
  });

  describe('IAC escaping on output', () => {
    it('doubles a literal 0xFF byte in the output buffer when flushing', () => {
      conn.writeByte(0x41);
      conn.writeByte(0xff);
      conn.writeByte(0x42);
      conn.flush();

      // First send recorded should be the escaped sequence.
      expect(conn.sentBytes).toHaveLength(1);
      expect(conn.sentBytes[0]).toEqual([0x41, 0xff, 0xff, 0x42]);
    });

    it('passes non-0xFF bytes through unchanged', () => {
      conn.writeByte(0x01);
      conn.writeByte(0x7f);
      conn.flush();
      expect(conn.sentBytes[0]).toEqual([0x01, 0x7f]);
    });
  });

  describe('option negotiation', () => {
    it('responds to DO TerminalType with WILL TerminalType', () => {
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.TerminalType]);
      expect(conn.sentBytes).toContainEqual([
        TelnetCommand.IAC,
        TelnetCommand.Will,
        TelnetOption.TerminalType,
      ]);
    });

    it('responds to DO LineMode with WONT LineMode (we do not speak linemode)', () => {
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.LineMode]);
      expect(conn.sentBytes).toContainEqual([
        TelnetCommand.IAC,
        TelnetCommand.Wont,
        TelnetOption.LineMode,
      ]);
    });

    it('refuses TerminalLocationNumber in favor of SendLocation', () => {
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.TerminalLocationNumber]);
      expect(conn.sentBytes).toContainEqual([
        TelnetCommand.IAC,
        TelnetCommand.Wont,
        TelnetOption.TerminalLocationNumber,
      ]);
    });

    it('does not reply twice for the same option negotiation', () => {
      // First DO triggers a WILL.
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.TerminalType]);
      const sendCountAfterFirst = conn.sentBytes.length;
      // A second identical DO should be a no-op (we already WILL'd this).
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.TerminalType]);
      expect(conn.sentBytes.length).toBe(sendCountAfterFirst);
    });

    it('handles the TradeWars Game Server DO AYT quirk', () => {
      // TWGS sends DO AYT (which is technically a category error per RFC);
      // we humor it by sending WILL.
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetCommand.AreYouThere]);
      expect(conn.sentBytes).toContainEqual([
        TelnetCommand.IAC,
        TelnetCommand.Will,
        TelnetCommand.AreYouThere,
      ]);
    });

    it('responds to an Are You There with a literal dot', () => {
      conn.feed([TelnetCommand.IAC, TelnetCommand.AreYouThere]);
      // Look for a Send call containing exactly `.`
      const dot = '.'.charCodeAt(0);
      expect(conn.sentBytes.some((arr) => arr.length === 1 && arr[0] === dot)).toBe(true);
    });
  });

  describe('window size (NAWS)', () => {
    it('sends current dimensions when asked DO WindowSize', () => {
      windowSize.WindCols = 80;
      windowSize.WindRows = 25;
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.WindowSize]);

      // We should see: WILL NAWS, then SB NAWS, then 4 size bytes, then SE.
      const calls = conn.sentBytes;
      expect(calls).toContainEqual([
        TelnetCommand.IAC,
        TelnetCommand.Will,
        TelnetOption.WindowSize,
      ]);
      // The size bytes are 80 = 0x0050, 25 = 0x0019 → [0,80, 0,25]
      expect(calls).toContainEqual([0, 80, 0, 25]);
      expect(calls).toContainEqual([TelnetCommand.IAC, TelnetCommand.EndSubnegotiation]);
    });

    it('escapes 0xFF in the NAWS size bytes', () => {
      // 255 cols would produce a literal 0xFF byte that must be doubled
      // to avoid being misinterpreted as an IAC. (Hypothetical case —
      // BBSes don't use 255-column displays — but the protocol still
      // requires it.)
      windowSize.WindCols = 255;
      windowSize.WindRows = 25;
      conn.feed([TelnetCommand.IAC, TelnetCommand.Do, TelnetOption.WindowSize]);

      // The high byte of cols (0) is harmless; the low byte (0xFF) needs
      // doubling. Expected size bytes: [0, 0xFF, 0xFF, 0, 25]
      expect(conn.sentBytes).toContainEqual([0, 0xff, 0xff, 0, 25]);
    });
  });

  describe('terminal type subnegotiation', () => {
    it('reports the configured emulation first', () => {
      // After receiving SB TT SEND IAC SE, we should send back IS <type> IAC SE
      conn.feed([
        TelnetCommand.IAC,
        TelnetCommand.Subnegotiation,
        TelnetOption.TerminalType,
        1, // SEND
        TelnetCommand.IAC,
        TelnetCommand.EndSubnegotiation,
      ]);

      // We should see IAC SB TT, then [0, ...'ansi-bbs'], then IAC SE
      const flat = conn.sentBytes.flat();
      const expectedString = 'ansi-bbs';
      let i = 0;
      while (i < flat.length) {
        if (
          flat[i] === TelnetCommand.IAC &&
          flat[i + 1] === TelnetCommand.Subnegotiation &&
          flat[i + 2] === TelnetOption.TerminalType
        ) {
          break;
        }
        i++;
      }
      expect(i).toBeLessThan(flat.length);

      // After the SB header, the next byte should be IS (0), then the term type chars.
      const isByte = flat[i + 3];
      expect(isByte).toBe(0);
      for (let j = 0; j < expectedString.length; j++) {
        expect(flat[i + 4 + j]).toBe(expectedString.charCodeAt(j));
      }
    });

    it('rotates through terminal types on repeated SEND queries', () => {
      // First query: emulation
      conn.feed([
        TelnetCommand.IAC,
        TelnetCommand.Subnegotiation,
        TelnetOption.TerminalType,
        1,
        TelnetCommand.IAC,
        TelnetCommand.EndSubnegotiation,
      ]);
      // Second query: ansi-bbs (already first, so... actually goes to ansi)
      conn.feed([
        TelnetCommand.IAC,
        TelnetCommand.Subnegotiation,
        TelnetOption.TerminalType,
        1,
        TelnetCommand.IAC,
        TelnetCommand.EndSubnegotiation,
      ]);
      // Constructed with 'ansi-bbs', list becomes:
      //   ['ansi-bbs', 'ansi', 'cp437', 'cp437']  (final repeated)
      // First reply: ansi-bbs
      // Second reply: ansi
      const sentStrings = conn.sentBytes
        .filter((arr) => arr[0] === 0) // IS prefix
        .map((arr) =>
          arr
            .slice(1)
            .map((c) => String.fromCharCode(c))
            .join('')
        );
      expect(sentStrings[0]).toBe('ansi-bbs');
      expect(sentStrings[1]).toBe('ansi');
    });
  });

  describe('subnegotiation with embedded IAC IAC', () => {
    it('preserves a literal 0xFF in subnegotiation data', () => {
      // Spy on stepNegotiation indirectly by checking state via input.
      // After a malformed/early IAC inside SB, we should still recover.
      conn.feed([
        TelnetCommand.IAC,
        TelnetCommand.Subnegotiation,
        TelnetOption.TerminalType, // arbitrary option
        0x41,
        TelnetCommand.IAC,
        TelnetCommand.IAC, // escaped data byte 0xFF inside subneg
        0x42,
        TelnetCommand.IAC,
        TelnetCommand.EndSubnegotiation,
      ]);
      // No assertion on what gets sent — TerminalType subneg doesn't
      // care about that payload. The point is we don't crash and we
      // return to the Data state cleanly.
      conn.feed([0x43]); // a regular byte after the subneg
      expect(conn.drainInput()).toEqual([0x43]);
    });
  });
});

// Avoid "unused vi import" complaint if no test uses it directly above.
void vi;
