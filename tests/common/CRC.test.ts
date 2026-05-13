import { describe, it, expect } from 'vitest';
import { ByteArray } from '@common/ByteArray.js';
import { CRC } from '@common/CRC.js';

describe('CRC-16/XMODEM', () => {
  /**
   * Reference values verified against:
   *   - The Pascal source the original was ported from
   *   - https://crccalc.com/ (algorithm: CRC-16/XMODEM, init 0x0000,
   *     poly 0x1021, no reflection, no final XOR)
   *
   * Note: the CRC class appends two trailing zero bytes as part of the
   * shift-out, so our results match "input + 0x00 0x00" through a
   * standard CRC-16/XMODEM calculator.
   */

  function crcOf(input: number[]): number {
    const ba = new ByteArray();
    for (const b of input) {
      ba.writeByte(b);
    }
    return CRC.Calculate16(ba);
  }

  it('produces 0 for an empty buffer', () => {
    expect(crcOf([])).toBe(0);
  });

  it('produces the standard reference value for "123456789"', () => {
    // The well-known reference check value for CRC-16/XMODEM is 0x31C3
    // for the input "123456789". The two zero-byte shift-out at the end
    // of Calculate16 is part of the standard CRC-CCITT computation
    // (it's how the algorithm flushes the final byte through the
    // shift register), so the published reference value already accounts
    // for it.
    const result = crcOf([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(result).toBe(0x31c3);
  });

  it('is deterministic across repeated calculations', () => {
    const input = [0xde, 0xad, 0xbe, 0xef];
    expect(crcOf(input)).toBe(crcOf(input));
  });

  it('preserves the caller position', () => {
    const ba = new ByteArray();
    for (const b of [1, 2, 3, 4, 5]) {
      ba.writeByte(b);
    }
    ba.position = 2;
    CRC.Calculate16(ba);
    expect(ba.position).toBe(2);
  });

  it('result is always within 16 bits', () => {
    const ba = new ByteArray();
    // Some bytes that historically tickled overflow bugs in similar impls
    for (let i = 0; i < 256; i++) {
      ba.writeByte(i);
    }
    const result = CRC.Calculate16(ba);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
  });
});
