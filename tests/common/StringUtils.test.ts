import { describe, it, expect } from 'vitest';
import { StringUtils } from '@common/StringUtils.js';

describe('StringUtils', () => {
  describe('AddCommas', () => {
    it('formats small numbers without commas', () => {
      expect(StringUtils.AddCommas(0)).toBe('0');
      expect(StringUtils.AddCommas(999)).toBe('999');
    });

    it('inserts thousands separators', () => {
      expect(StringUtils.AddCommas(1000)).toBe('1,000');
      expect(StringUtils.AddCommas(1234567)).toBe('1,234,567');
    });
  });

  describe('FormatPercent', () => {
    it('formats a fraction as a percentage', () => {
      expect(StringUtils.FormatPercent(0.5, 0)).toBe('50%');
      expect(StringUtils.FormatPercent(0.1234, 2)).toBe('12.34%');
    });
  });

  describe('NewString', () => {
    it('produces a string of repeated characters', () => {
      expect(StringUtils.NewString('x', 5)).toBe('xxxxx');
    });

    it('returns empty for empty character', () => {
      expect(StringUtils.NewString('', 5)).toBe('');
    });

    it('uses only the first character if a longer string is given', () => {
      expect(StringUtils.NewString('abc', 3)).toBe('aaa');
    });
  });

  describe('PadLeft / PadRight', () => {
    it('pads left to target length', () => {
      expect(StringUtils.PadLeft('42', '0', 5)).toBe('00042');
    });

    it('pads right to target length', () => {
      expect(StringUtils.PadRight('42', ' ', 5)).toBe('42   ');
    });

    it('truncates if input exceeds target length', () => {
      expect(StringUtils.PadLeft('123456', '0', 4)).toBe('1234');
      expect(StringUtils.PadRight('123456', ' ', 4)).toBe('1234');
    });
  });

  describe('Trim variants', () => {
    it('trims whitespace on both sides', () => {
      expect(StringUtils.Trim('  hi  ')).toBe('hi');
    });

    it('trims left only', () => {
      expect(StringUtils.TrimLeft('  hi  ')).toBe('hi  ');
    });

    it('trims right only', () => {
      expect(StringUtils.TrimRight('  hi  ')).toBe('  hi');
    });
  });
});
