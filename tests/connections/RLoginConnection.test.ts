import { describe, it, expect, beforeEach } from 'vitest';
import { ByteArray } from '@common/ByteArray.js';
import { RLoginCommand } from '@connections/RLoginCommand.js';
import { RLoginConnection } from '@connections/RLoginConnection.js';

class TestableRLogin extends RLoginConnection {
  public feed(bytes: number[]): void {
    const ba = new ByteArray();
    for (const b of bytes) {
      ba.writeByte(b);
    }
    ba.position = 0;
    this.NegotiateInbound(ba);
  }
  public drainInput(): number[] {
    const result: number[] = [];
    this._InputBuffer.position = 0;
    while (this._InputBuffer.bytesAvailable > 0) {
      result.push(this._InputBuffer.readUnsignedByte());
    }
    return result;
  }
}

describe('RLoginConnection', () => {
  let conn: TestableRLogin;

  beforeEach(() => {
    conn = new TestableRLogin();
  });

  it('passes regular data bytes through unchanged', () => {
    conn.feed([0x41, 0x42, 0x43]);
    expect(conn.drainInput()).toEqual([0x41, 0x42, 0x43]);
  });

  it('consumes a complete control sequence (cookie cookie s s + 8 size bytes)', () => {
    conn.feed([
      RLoginCommand.Cookie,
      RLoginCommand.Cookie,
      RLoginCommand.S,
      RLoginCommand.S,
      // 8 bytes of window size data
      0, 25, 0, 80, 0, 0, 0, 0,
      // Then a regular data byte to confirm we returned to Data state
      0x41,
    ]);
    // The control sequence and its 8-byte payload are consumed silently;
    // only the trailing 0x41 should appear in the input buffer.
    expect(conn.drainInput()).toEqual([0x41]);
  });

  it('discards the 0xFF and the next byte if a control sequence does not materialize', () => {
    // Once we see the first 0xFF we enter Cookie1 state. If the next
    // byte is not also 0xFF, the original swallows both (the 0xFF that
    // got us into Cookie1 was never written, and the non-matching byte
    // is also consumed as we return to Data state). This is faithful
    // to the original behavior; arguably a bug, but not one we're
    // fixing in a refactor pass.
    conn.feed([RLoginCommand.Cookie, 0x42, 0x43]);
    expect(conn.drainInput()).toEqual([0x43]);
  });

  it('resyncs if the s s pattern is broken', () => {
    // 0xFF 0xFF s X — not actually a window-size update.
    conn.feed([RLoginCommand.Cookie, RLoginCommand.Cookie, RLoginCommand.S, 0x42, 0x43]);
    expect(conn.drainInput()).toEqual([0x43]);
    // (The byte after the failed match is also discarded — that matches
    // the original; the parser returns to Data state on the next byte.)
  });
});
