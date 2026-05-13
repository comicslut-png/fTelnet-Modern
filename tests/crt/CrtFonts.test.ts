import { describe, it, expect } from 'vitest';
import { CrtFonts } from '@crt/CrtFonts.js';

describe('CrtFonts', () => {
  describe('HasFont', () => {
    it('recognizes a family name', () => {
      expect(CrtFonts.HasFont('CP437')).toBe(true);
    });

    it('recognizes a specific size variant', () => {
      expect(CrtFonts.HasFont('CP437_8x16')).toBe(true);
    });

    it('rejects a nonexistent font', () => {
      expect(CrtFonts.HasFont('NotAFont')).toBe(false);
    });
  });

  describe('GetBestFit', () => {
    it('returns the largest CP437 size that fits a 700x400 viewport', () => {
      // CP437 has sizes from 6x8 up to 12x23. At 700x400 there's plenty
      // of room for the biggest one.
      const result = CrtFonts.GetBestFit('CP437', 700, 400);
      expect(result).toBeDefined();
      // Should pick 12x23 — biggest CP437 size.
      expect(result?.x).toBe(12);
      expect(result?.y).toBe(23);
    });

    it('falls back to the smallest size if nothing fits', () => {
      // Tiny viewport — nothing CP437 fits, return the smallest.
      const result = CrtFonts.GetBestFit('CP437', 1, 1);
      expect(result).toBeDefined();
      // Smallest CP437 is 6x8.
      expect(result?.x).toBe(6);
      expect(result?.y).toBe(8);
    });

    it('returns undefined for an unknown family', () => {
      const result = CrtFonts.GetBestFit('NotAFont', 100, 100);
      expect(result).toBeUndefined();
    });

    it('returns the sole size for single-variant families', () => {
      // RIP has multiple sizes, so pick something with one variant.
      // Looking at the catalog, several families have exactly one size.
      const amigaBStrict = CrtFonts.GetBestFit('Amiga-BStrict', 100, 100);
      expect(amigaBStrict).toBeDefined();
      expect(amigaBStrict?.x).toBe(8);
      expect(amigaBStrict?.y).toBe(8);
    });

    it('picks a smaller size when the larger does not fit', () => {
      // CP437 sizes biggest-first: 12x23, 10x19, 9x16, 8x16, 8x14, 8x13, 8x12, 7x12, 6x8, 8x8
      // Viewport 8x16 should pick 8x16 exactly (or smaller).
      const result = CrtFonts.GetBestFit('CP437', 8, 16);
      expect(result).toBeDefined();
      expect(result!.x).toBeLessThanOrEqual(8);
      expect(result!.y).toBeLessThanOrEqual(16);
    });
  });

  describe('GetRemoteUrl', () => {
    it('builds the expected CDN URL', () => {
      const url = CrtFonts.GetRemoteUrl('CP437', 8, 16);
      expect(url).toBe('//embed-v2.ftelnet.ca/ftelnet/fonts/CP437_8x16.png');
    });
  });
});
