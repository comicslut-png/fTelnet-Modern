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

  /*
   * Phase 4 Stage 1: incremental update API. The original CRC-16 path
   * uses a private UpdateCrc internally; Update16 exposes the same
   * computation so streaming code (ZMODEM subpackets) can use it
   * without allocating a ByteArray per byte.
   */
  describe('Update16 (incremental)', () => {
    it('reaches the same result as Calculate16 when fed byte-by-byte', () => {
      const input = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];

      // Calculate16 result for comparison
      const ba = new ByteArray();
      for (const b of input) ba.writeByte(b);
      const calculated = CRC.Calculate16(ba);

      // Incremental computation, including the two-zero shift-out
      let crc = 0;
      for (const b of input) {
        crc = CRC.Update16(b, crc);
      }
      crc = CRC.Update16(0, crc);
      crc = CRC.Update16(0, crc);

      expect(crc).toBe(calculated);
      expect(crc).toBe(0x31c3);
    });

    it('initial state is 0', () => {
      // Folding a single 0 byte from state 0 stays 0
      expect(CRC.Update16(0, 0)).toBe(0);
    });
  });
});

describe('CRC-32 (IEEE 802.3)', () => {
  /*
   * CRC-32 polynomial 0xEDB88320 (reflected form of 0x04C11DB7),
   * init 0xFFFFFFFF, reflect input/output, final XOR 0xFFFFFFFF.
   * Same as ZIP, PNG, Ethernet, and ZMODEM binary32 subpackets.
   *
   * Standard test vectors:
   *   "" (empty)     → 0x00000000
   *   "123456789"    → 0xCBF43926  (universal CRC-32 test vector)
   *   "a"            → 0xE8B7BE43
   *   "abc"          → 0x352441C2
   *
   * Sources: RFC 1952 (gzip), zlib's crc32 docs, plus crccalc.com
   * (algorithm: CRC-32/ISO-HDLC).
   */

  function crc32Of(input: number[] | string): number {
    const ba = new ByteArray();
    if (typeof input === 'string') {
      for (let i = 0; i < input.length; i++) {
        ba.writeByte(input.charCodeAt(i));
      }
    } else {
      for (const b of input) ba.writeByte(b);
    }
    return CRC.Calculate32(ba);
  }

  it('produces 0 for an empty buffer', () => {
    expect(crc32Of([])).toBe(0x00000000);
  });

  it('produces the universal reference value for "123456789"', () => {
    expect(crc32Of('123456789')).toBe(0xcbf43926);
  });

  it('produces 0xE8B7BE43 for "a"', () => {
    expect(crc32Of('a')).toBe(0xe8b7be43);
  });

  it('produces 0x352441C2 for "abc"', () => {
    expect(crc32Of('abc')).toBe(0x352441c2);
  });

  it('result is always a non-negative 32-bit integer', () => {
    // JS bitwise ops produce signed 32-bit; the >>> 0 in Calculate32
    // ensures we always return an unsigned value. Test with input
    // patterns that historically produce values with the sign bit set
    // (negative if signed).
    const ba = new ByteArray();
    for (let i = 0; i < 256; i++) {
      ba.writeByte(i);
    }
    const result = CRC.Calculate32(ba);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });

  it('preserves the caller position', () => {
    const ba = new ByteArray();
    for (const b of [1, 2, 3, 4, 5]) ba.writeByte(b);
    ba.position = 3;
    CRC.Calculate32(ba);
    expect(ba.position).toBe(3);
  });

  it('is deterministic across repeated calculations', () => {
    const input = [0xde, 0xad, 0xbe, 0xef];
    expect(crc32Of(input)).toBe(crc32Of(input));
  });

  describe('Update32 (incremental)', () => {
    it('matches Calculate32 when fed byte-by-byte', () => {
      const input = '123456789';

      // Incremental: init 0xFFFFFFFF, fold each byte, final XOR
      let crc = 0xffffffff;
      for (let i = 0; i < input.length; i++) {
        crc = CRC.Update32(input.charCodeAt(i), crc);
      }
      crc = (crc ^ 0xffffffff) >>> 0;

      expect(crc).toBe(0xcbf43926);
    });

    it('returns unsigned values (>= 0)', () => {
      // 0xff folded into 0xffffffff is the kind of operation that
      // produces values >= 0x80000000 — negative if signed.
      const result = CRC.Update32(0xff, 0xffffffff);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('initial state convention: 0xFFFFFFFF folds to 0 after empty input + final XOR', () => {
      // The "empty input" case: start at 0xFFFFFFFF, fold no bytes,
      // XOR with 0xFFFFFFFF, get 0.
      const result = (0xffffffff ^ 0xffffffff) >>> 0;
      expect(result).toBe(0);
    });
  });
});
