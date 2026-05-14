import { describe, it, expect } from 'vitest';
import {
  FillStyle,
  LineStyle,
  LineThickness,
  TextJustification,
  TextOrientation,
  WriteMode,
} from '@graph/index.js';

describe('graph enums', () => {
  describe('FillStyle', () => {
    it('Empty=0 and Solid=1 match BGI', () => {
      expect(FillStyle.Empty).toBe(0);
      expect(FillStyle.Solid).toBe(1);
    });

    it('User pattern is 12', () => {
      expect(FillStyle.User).toBe(12);
    });
  });

  describe('LineStyle', () => {
    it('Normal and Solid are both 0 (aliases)', () => {
      expect(LineStyle.Normal).toBe(0);
      expect(LineStyle.Solid).toBe(0);
    });

    it('User pattern is 4', () => {
      expect(LineStyle.User).toBe(4);
    });
  });

  describe('LineThickness', () => {
    it('Normal=1 and Thick=3 (pixel widths)', () => {
      expect(LineThickness.Normal).toBe(1);
      expect(LineThickness.Thick).toBe(3);
    });
  });

  describe('WriteMode', () => {
    it('Normal and Copy are both 0 (aliases)', () => {
      expect(WriteMode.Normal).toBe(0);
      expect(WriteMode.Copy).toBe(0);
    });

    it('XOR, Or, And, Not are 1-4', () => {
      expect(WriteMode.XOR).toBe(1);
      expect(WriteMode.Or).toBe(2);
      expect(WriteMode.And).toBe(3);
      expect(WriteMode.Not).toBe(4);
    });
  });

  describe('TextOrientation', () => {
    it('Horizontal=0, Vertical=1', () => {
      expect(TextOrientation.Horizontal).toBe(0);
      expect(TextOrientation.Vertical).toBe(1);
    });
  });

  describe('TextJustification', () => {
    it('horizontal: Left/Center/Right are 0/1/2', () => {
      expect(TextJustification.Left).toBe(0);
      expect(TextJustification.Center).toBe(1);
      expect(TextJustification.Right).toBe(2);
    });

    it('vertical: Bottom=0 (alias Left), Top=2 (alias Right)', () => {
      expect(TextJustification.Bottom).toBe(0);
      expect(TextJustification.Top).toBe(2);
    });
  });
});
