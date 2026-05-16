import { describe, it, expect } from 'vitest';
import * as Z from '@filetransfer/ZModem.js';

/*
  ZMODEM constants — Stage 1 establishes the protocol vocabulary.
  The actual parser/encoder/state-machine lands in Stages 2-5;
  these tests just verify the numeric values match the standard so
  later stages can rely on them.

  Reference values from Forsberg's zmodem.doc and cross-checked
  against lrzsz's zmodem.h.
*/

describe('ZModem constants', () => {
  describe('frame-leader bytes', () => {
    it('ZPAD is "*" (0x2A)', () => {
      expect(Z.ZPAD).toBe(0x2a);
    });

    it('ZDLE is CAN (0x18)', () => {
      expect(Z.ZDLE).toBe(0x18);
    });

    it('ZHEX / ZBIN / ZBIN32 are sequential ASCII A/B/C', () => {
      expect(Z.ZBIN).toBe(0x41);    // 'A'
      expect(Z.ZHEX).toBe(0x42);    // 'B'
      expect(Z.ZBIN32).toBe(0x43);  // 'C'
    });
  });

  describe('frame types', () => {
    /*
      The numeric values are protocol-defined; rename or renumber
      will silently break interop. Pinning them down to specific
      bytes here ensures a single source of truth.
    */
    it.each([
      ['ZRQINIT', Z.ZRQINIT, 0x00],
      ['ZRINIT', Z.ZRINIT, 0x01],
      ['ZSINIT', Z.ZSINIT, 0x02],
      ['ZACK', Z.ZACK, 0x03],
      ['ZFILE', Z.ZFILE, 0x04],
      ['ZSKIP', Z.ZSKIP, 0x05],
      ['ZNAK', Z.ZNAK, 0x06],
      ['ZABORT', Z.ZABORT, 0x07],
      ['ZEOF', Z.ZEOF, 0x08],
      ['ZFERR', Z.ZFERR, 0x09],
      ['ZDATA', Z.ZDATA, 0x0a],
      ['ZFIN', Z.ZFIN, 0x0b],
      ['ZRPOS', Z.ZRPOS, 0x0c],
    ])('%s is 0x%s', (_name, value, expected) => {
      expect(value).toBe(expected);
    });
  });

  describe('subpacket-end markers', () => {
    it('ZCRCE/G/Q/W are sequential ASCII h/i/j/k', () => {
      expect(Z.ZCRCE).toBe(0x68);
      expect(Z.ZCRCG).toBe(0x69);
      expect(Z.ZCRCQ).toBe(0x6a);
      expect(Z.ZCRCW).toBe(0x6b);
    });
  });

  describe('ZESCAPED_BYTES', () => {
    it('includes the must-escape control characters', () => {
      // The minimum-required escapes: anything telnet might intercept.
      expect(Z.ZESCAPED_BYTES.has(0x10)).toBe(true); // DLE
      expect(Z.ZESCAPED_BYTES.has(0x11)).toBe(true); // XON
      expect(Z.ZESCAPED_BYTES.has(0x13)).toBe(true); // XOFF
      expect(Z.ZESCAPED_BYTES.has(0x18)).toBe(true); // CAN/ZDLE
    });

    it('does not escape printable ASCII', () => {
      expect(Z.ZESCAPED_BYTES.has(0x41)).toBe(false); // 'A'
      expect(Z.ZESCAPED_BYTES.has(0x20)).toBe(false); // space
    });
  });

  describe('ZRINIT capability flags', () => {
    it('CANFC32 flag is 0x20 (CRC-32 supported)', () => {
      expect(Z.CANFC32).toBe(0x20);
    });

    it('flags are powers of two so they OR cleanly', () => {
      for (const flag of [
        Z.CANFDX,
        Z.CANOVIO,
        Z.CANBRK,
        Z.CANCRY,
        Z.CANLZW,
        Z.CANFC32,
        Z.ESCCTL,
        Z.ESC8,
      ]) {
        // (n & (n-1)) === 0 holds iff n is 0 or a power of two.
        expect((flag & (flag - 1)) === 0).toBe(true);
        expect(flag).not.toBe(0);
      }
    });
  });

  describe('ZMODEM_AUTO_TRIGGER', () => {
    /*
      The byte sequence a ZMODEM sender emits to trigger auto-
      download. Stage 6 wires this into the ANSI parser. For now
      we just check the sequence is right so the parser code we
      write later compares against the correct bytes.
    */
    it('is "**\\x18B00" (the magic ZRQINIT auto-trigger)', () => {
      expect([...Z.ZMODEM_AUTO_TRIGGER]).toEqual([
        0x2a, // '*'
        0x2a, // '*'
        0x18, // ZDLE
        0x42, // 'B' (hex frame)
        0x30, // '0' (high nibble)
        0x30, // '0' (low nibble — ZRQINIT == 0x00)
      ]);
    });
  });
});
