import { describe, it, expect } from 'vitest';
import { CharInfo } from '@crt/CharInfo.js';
import { ANSI_COLOURS, Color } from '@crt/Colors.js';

describe('CharInfo', () => {
  describe('default constructor (null arg)', () => {
    it('initializes with light gray on black', () => {
      const c = new CharInfo(null);
      expect(c.Attr).toBe(Color.LIGHTGRAY);
      expect(c.Back24).toBe(ANSI_COLOURS[Color.BLACK]);
      expect(c.Fore24).toBe(ANSI_COLOURS[Color.LIGHTGRAY]);
      expect(c.Ch).toBe(' ');
      expect(c.Blink).toBe(false);
      expect(c.Reverse).toBe(false);
      expect(c.Underline).toBe(false);
      expect(c.NeedsRedraw).toBe(false);
    });
  });

  describe('copy constructor', () => {
    it('copies all fields from another CharInfo', () => {
      const src = new CharInfo(null);
      src.Attr = 0x12;
      src.Back24 = 0x101010;
      src.Fore24 = 0xfefefe;
      src.Ch = 'A';
      src.Blink = true;
      src.Reverse = true;
      src.Underline = true;

      const copy = new CharInfo(src);
      expect(copy.Attr).toBe(0x12);
      expect(copy.Back24).toBe(0x101010);
      expect(copy.Fore24).toBe(0xfefefe);
      expect(copy.Ch).toBe('A');
      expect(copy.Blink).toBe(true);
      expect(copy.Reverse).toBe(true);
      expect(copy.Underline).toBe(true);
    });

    it('does not copy NeedsRedraw (matches original behavior)', () => {
      const src = new CharInfo(null);
      src.NeedsRedraw = true;
      const copy = new CharInfo(src);
      expect(copy.NeedsRedraw).toBe(false);
    });
  });

  describe('GetNew factory', () => {
    it('extracts foreground from low nibble of attribute', () => {
      const c = CharInfo.GetNew('X', Color.CYAN);
      expect(c.Fore24).toBe(ANSI_COLOURS[Color.CYAN]);
    });

    it('extracts background from high nibble of attribute', () => {
      // Background red = 4 << 4 = 0x40
      const c = CharInfo.GetNew('X', 0x40 | Color.WHITE);
      expect(c.Back24).toBe(ANSI_COLOURS[Color.RED]);
      expect(c.Fore24).toBe(ANSI_COLOURS[Color.WHITE]);
    });

    it('preserves the full attribute byte', () => {
      const c = CharInfo.GetNew('X', 0x4a);
      expect(c.Attr).toBe(0x4a);
    });

    it('sets the character', () => {
      const c = CharInfo.GetNew('Z', 0);
      expect(c.Ch).toBe('Z');
    });
  });

  describe('Set method', () => {
    it('updates an existing CharInfo from another', () => {
      const dst = new CharInfo(null);
      const src = CharInfo.GetNew('Q', Color.YELLOW);
      src.Blink = true;
      dst.Set(src);
      expect(dst.Ch).toBe('Q');
      expect(dst.Attr).toBe(Color.YELLOW);
      expect(dst.Blink).toBe(true);
    });
  });
});
