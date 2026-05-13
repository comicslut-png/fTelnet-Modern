import { describe, it, expect } from 'vitest';
import { ANSI_COLOURS, Color, PETSCII_COLOURS, PETSCIIColor } from '@crt/Colors.js';

describe('Colors', () => {
  describe('Color (ANSI/CGA palette indices)', () => {
    it('matches the standard CGA color order', () => {
      expect(Color.BLACK).toBe(0);
      expect(Color.BLUE).toBe(1);
      expect(Color.GREEN).toBe(2);
      expect(Color.CYAN).toBe(3);
      expect(Color.RED).toBe(4);
      expect(Color.MAGENTA).toBe(5);
      expect(Color.BROWN).toBe(6);
      expect(Color.LIGHTGRAY).toBe(7);
    });

    it('high-intensity colors are 8-15', () => {
      expect(Color.DARKGRAY).toBe(8);
      expect(Color.WHITE).toBe(15);
    });

    it('BLINK flag is bit 7', () => {
      expect(Color.BLINK).toBe(128);
    });
  });

  describe('ANSI_COLOURS palette', () => {
    it('has 16 entries', () => {
      expect(ANSI_COLOURS.length).toBe(16);
    });

    it('black is 0x000000', () => {
      expect(ANSI_COLOURS[Color.BLACK]).toBe(0x000000);
    });

    it('white is 0xFCFCFC (matches the original VGA-ish palette)', () => {
      expect(ANSI_COLOURS[Color.WHITE]).toBe(0xfcfcfc);
    });

    it('all entries are valid 24-bit RGB values', () => {
      for (const c of ANSI_COLOURS) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
    });
  });

  describe('PETSCII_COLOURS palette', () => {
    it('has 16 entries', () => {
      expect(PETSCII_COLOURS.length).toBe(16);
    });

    it('black and white match the C64 reference', () => {
      expect(PETSCII_COLOURS[PETSCIIColor.BLACK]).toBe(0x000000);
      expect(PETSCII_COLOURS[PETSCIIColor.WHITE]).toBe(0xfdfefc);
    });
  });

  describe('PETSCIIColor indices', () => {
    it('white is 1 (different from ANSI where black is 0 and blue is 1)', () => {
      expect(PETSCIIColor.WHITE).toBe(1);
      // This is the key difference between ANSI and PETSCII palettes —
      // the C64 numbered its colors differently.
      expect(PETSCIIColor.WHITE).not.toBe(Color.WHITE);
    });
  });
});
