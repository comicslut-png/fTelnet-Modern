import { describe, it, expect } from 'vitest';
import { Rectangle } from '@graph/Rectangle.js';

describe('Rectangle', () => {
  describe('construction', () => {
    it('defaults to (0, 0, 0, 0)', () => {
      const r = new Rectangle();
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      expect(r.width).toBe(0);
      expect(r.height).toBe(0);
    });

    it('accepts x, y, width, height', () => {
      const r = new Rectangle(5, 10, 20, 30);
      expect(r.x).toBe(5);
      expect(r.y).toBe(10);
      expect(r.width).toBe(20);
      expect(r.height).toBe(30);
    });

    it('accepts partial args (just x, y)', () => {
      const r = new Rectangle(5, 10);
      expect(r.x).toBe(5);
      expect(r.y).toBe(10);
      expect(r.width).toBe(0);
      expect(r.height).toBe(0);
    });
  });

  describe('getters', () => {
    it('left equals x', () => {
      const r = new Rectangle(7, 0, 0, 0);
      expect(r.left).toBe(7);
    });

    it('top equals y', () => {
      const r = new Rectangle(0, 13, 0, 0);
      expect(r.top).toBe(13);
    });

    it('right is x + width', () => {
      const r = new Rectangle(5, 0, 20, 0);
      expect(r.right).toBe(25);
    });

    it('bottom is y + height', () => {
      const r = new Rectangle(0, 10, 0, 15);
      expect(r.bottom).toBe(25);
    });
  });

  describe('right and bottom setters', () => {
    it('setting right adjusts width', () => {
      const r = new Rectangle(5, 0, 10, 0);
      r.right = 30;
      // new width = 30 - left = 30 - 5 = 25
      expect(r.width).toBe(25);
      // x should be unchanged
      expect(r.x).toBe(5);
    });

    it('setting bottom adjusts height', () => {
      const r = new Rectangle(0, 10, 0, 5);
      r.bottom = 50;
      expect(r.height).toBe(40);
      expect(r.y).toBe(10);
    });
  });

  describe('left setter preserves the right edge', () => {
    it('moves x and shrinks width', () => {
      const r = new Rectangle(2, 0, 10, 0);
      // right is initially 12
      r.left = 5;
      expect(r.x).toBe(5);
      // right should still be 12
      expect(r.right).toBe(12);
      // width should now be 7
      expect(r.width).toBe(7);
    });
  });

  describe('top setter preserves the bottom edge', () => {
    it('moves y and shrinks height', () => {
      const r = new Rectangle(0, 5, 0, 20);
      // bottom is initially 25
      r.top = 10;
      expect(r.y).toBe(10);
      expect(r.bottom).toBe(25);
      expect(r.height).toBe(15);
    });
  });
});
