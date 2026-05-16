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

/**
 * A decoded ZMODEM frame header.
 *
 * Every ZMODEM header has the same logical shape regardless of its
 * wire encoding (hex, binary16, binary32):
 *
 *   - A `type` byte (one of the Z* constants in ZModem.ts:
 *     ZRQINIT, ZRINIT, ZFILE, ZDATA, ZEOF, ...)
 *   - Four "ZP" data bytes — what they mean depends on `type`:
 *
 *     - For ZRPOS / ZACK / ZDATA / ZEOF: the bytes encode a little-
 *       endian 32-bit file position. Use `getPosition()`.
 *     - For ZRINIT: byte 0 is the high byte of the receiver's
 *       buffer-size hint, byte 1 is the low byte (so bytes 0..1
 *       are a little-endian 16-bit max buffer size), and bytes
 *       2..3 carry capability flags (CANFC32 etc.).
 *     - For ZSINIT: byte 3 carries the sender's escape-mask flags.
 *     - For ZRQINIT / ZNAK / ZFIN / ZSKIP / etc: usually all four
 *       are zero; the type alone is the signal.
 *
 * The decoder produces these; the state machine interprets them
 * based on `type`. We don't decode `position` or capability fields
 * eagerly — the consumer pulls only the fields they need via the
 * helper methods.
 *
 * Phase 4 Stage 2.
 */
export class ZModemHeader {
  /**
   * Frame type byte (e.g. `ZRQINIT`, `ZRINIT`, ...). See ZModem.ts
   * for the named constants.
   */
  public readonly type: number;

  /** The four "ZP" data bytes from the header, in wire order. */
  public readonly data: Readonly<[number, number, number, number]>;

  /**
   * Encoding the header arrived in. Useful for debugging and for
   * the response state machine (e.g. if we received a ZBIN32 header
   * we should reply in kind to acknowledge CRC-32 support).
   */
  public readonly encoding: 'hex' | 'bin16' | 'bin32';

  public constructor(
    type: number,
    data: readonly [number, number, number, number],
    encoding: 'hex' | 'bin16' | 'bin32'
  ) {
    this.type = type;
    this.data = data;
    this.encoding = encoding;
  }

  /**
   * Decode the 4 data bytes as a little-endian 32-bit file position.
   * Used by ZRPOS / ZACK / ZDATA / ZEOF / ZFIN.
   *
   * Returns a regular JS number. File positions in real ZMODEM
   * transfers stay well below 2^53 (Number.MAX_SAFE_INTEGER); the
   * protocol is 32-bit so anything above 4 GiB needs ZMODEM's
   * unimplemented extensions anyway.
   *
   * The `>>> 0` makes the result unsigned. JS bitwise ops would
   * otherwise treat byte 3's high bit as the sign bit for files
   * larger than 2 GiB.
   */
  public getPosition(): number {
    const [b0, b1, b2, b3] = this.data;
    return ((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
  }

  /**
   * Decode the receiver's max buffer size from a ZRINIT header.
   * Bytes 0 and 1 are the little-endian 16-bit value; 0 means
   * "no limit" (receiver can take arbitrarily large subpackets).
   *
   * Only meaningful when `type === ZRINIT`.
   */
  public getMaxBufferSize(): number {
    return this.data[0] | (this.data[1] << 8);
  }

  /**
   * Decode the capability flag byte from a ZRINIT header (byte 3
   * of the data — the original ZMODEM doc calls this ZF0).
   *
   * Check against CANFC32 etc. from ZModem.ts:
   *     const flags = header.getCapabilityFlags();
   *     const supportsCrc32 = (flags & CANFC32) !== 0;
   *
   * Only meaningful when `type === ZRINIT`.
   */
  public getCapabilityFlags(): number {
    return this.data[3];
  }
}
