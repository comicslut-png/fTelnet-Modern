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
 * A partial port of the ActionScript 3 ByteArray class.
 *
 * Provides a position-tracked binary buffer used throughout fTelnet
 * for telnet/RLogin/file-transfer byte streams.
 *
 * Phase 1 migration notes:
 *   - Public API is preserved exactly (positions, lengths, method signatures)
 *     so callers don't need to change.
 *   - Thrown strings are now real `Error` instances (typed as `RangeError`
 *     where appropriate) — easier to catch and inspect.
 *   - Default parameter values replace `typeof === 'undefined'` checks.
 *   - The original `readBytes` defaulted `length` to 0, which meant a
 *     no-argument call silently did nothing. That behavior is preserved
 *     for compatibility, but documented.
 *   - The `writeBytes` parameter validation in the original was a tangle
 *     of `if (!offset) { offset = 0 }` (which treats 0 the same as
 *     undefined — fine here, but worth noting). Logic preserved.
 *
 * Future work (post-Phase-1):
 *   - The backing store is still a `number[]` for byte-for-byte fidelity
 *     with the original. Migrating to `Uint8Array` is straightforward and
 *     would be a meaningful perf win, but is deferred until after the rest
 *     of the codebase migrates to avoid mixing concerns.
 */
export class ByteArray {
  private _bytes: number[] = [];
  private _length = 0;
  private _position = 0;

  public get bytesAvailable(): number {
    return this._length - this._position;
  }

  public clear(): void {
    this._bytes = [];
    this._length = 0;
    this._position = 0;
  }

  public get length(): number {
    return this._length;
  }

  public set length(value: number) {
    if (value <= 0) {
      this.clear();
      return;
    }

    if (value < this._length) {
      this._bytes.splice(value, this._length - value);
    } else if (value > this._length) {
      for (let i = this._length + 1; i <= value; i++) {
        this._bytes.push(0);
      }
    }
    this._length = value;
  }

  public get position(): number {
    return this._position;
  }

  public set position(value: number) {
    if (value <= 0) {
      this._position = 0;
    } else if (value >= this._length) {
      this._position = this._length;
    } else {
      this._position = value;
    }
  }

  /**
   * Read `length` bytes from this array into `target`, starting at `offset`
   * within the target. The target's position is restored afterward.
   *
   * Note: the original defaults both `offset` and `length` to 0, which means
   * a call like `src.readBytes(dest)` is a no-op. Preserved for compatibility.
   */
  public readBytes(target: ByteArray, offset: number = 0, length: number = 0): void {
    if (this._position + length > this._length) {
      throw new RangeError('ByteArray.readBytes: insufficient data available');
    }

    const savedPosition = target.position;
    target.position = offset;
    for (let i = 0; i < length; i++) {
      target.writeByte(this._bytes[this._position++]! & 0xff);
    }
    target.position = savedPosition;
  }

  /**
   * Read up to `length` bytes as a string (one char per byte, ISO-8859-1 style).
   * If the buffer is fully consumed afterward, it is cleared.
   */
  public readString(length?: number): string {
    let remaining = length ?? this._length;
    let result = '';
    while (remaining-- > 0 && this._position < this._length) {
      result += String.fromCharCode(this._bytes[this._position++]!);
    }

    // Match original behavior: auto-clear when fully drained.
    if (this.bytesAvailable === 0) {
      this.clear();
    }
    return result;
  }

  public readUnsignedByte(): number {
    if (this._position >= this._length) {
      throw new RangeError('ByteArray.readUnsignedByte: insufficient data available');
    }
    return this._bytes[this._position++]! & 0xff;
  }

  /**
   * Read a big-endian unsigned 16-bit value.
   * The original had a "TODOX Endian problems?" comment — for our use
   * (telnet/RLogin/YModem protocols, all network byte order), big-endian
   * is correct. Documenting that here so the question doesn't get asked again.
   */
  public readUnsignedShort(): number {
    if (this._position >= this._length - 1) {
      throw new RangeError('ByteArray.readUnsignedShort: insufficient data available');
    }
    const high = this._bytes[this._position++]! & 0xff;
    const low = this._bytes[this._position++]! & 0xff;
    return (high << 8) + low;
  }

  public toString(): string {
    let result = '';
    for (let i = 0; i < this._length; i++) {
      result += String.fromCharCode(this._bytes[i]!);
    }
    return result;
  }

  public write24Bit(value: number): void {
    this.writeByte((value & 0xff0000) >> 16);
    this.writeByte((value & 0x00ff00) >> 8);
    this.writeByte(value & 0x0000ff);
  }

  public writeByte(value: number): void {
    this._bytes[this._position++] = value & 0xff;
    if (this._position > this._length) {
      this._length++;
    }
  }

  public writeBytes(source: ByteArray, offset: number = 0, length: number = 0): void {
    if (offset < 0) {
      offset = 0;
    }
    if (length < 0) {
      return;
    }
    if (length === 0) {
      length = source.length;
    }

    if (offset >= source.length) {
      offset = 0;
    }
    if (length > source.length) {
      length = source.length;
    }
    if (offset + length > source.length) {
      length = source.length - offset;
    }

    const savedPosition = source.position;
    source.position = offset;
    for (let i = 0; i < length; i++) {
      this.writeByte(source.readUnsignedByte());
    }
    source.position = savedPosition;
  }

  public writeShort(value: number): void {
    this.writeByte((value & 0xff00) >> 8);
    this.writeByte(value & 0x00ff);
  }

  public writeString(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.writeByte(text.charCodeAt(i) & 0xff);
    }
  }
}
