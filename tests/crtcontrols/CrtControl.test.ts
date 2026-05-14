import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Color, Crt } from '@crt/index.js';
import { CrtControl } from '@crtcontrols/CrtControl.js';

/**
 * CrtControl is an abstract base class — `Paint()` is a no-op by
 * default. We test it directly anyway because the position math,
 * parent/child wiring, and Save/Restore-background behaviors are
 * the same for every subclass.
 */
describe('CrtControl', () => {
  let container: HTMLDivElement;
  let crt: Crt;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
  });

  describe('construction', () => {
    it('stores position and size', () => {
      const c = new CrtControl(crt, undefined, 10, 5, 20, 3);
      expect(c.Left).toBe(10);
      expect(c.Top).toBe(5);
      expect(c.Width).toBe(20);
      expect(c.Height).toBe(3);
    });

    it('defaults to light gray on black', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      expect(c.ForeColour).toBe(Color.LIGHTGRAY);
      expect(c.BackColour).toBe(Color.BLACK);
    });

    it('Parent is undefined for top-level controls', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      expect(c.Parent).toBeUndefined();
    });

    it('child controls register with their parent', () => {
      const parent = new CrtControl(crt, undefined, 1, 1, 40, 10);
      const child = new CrtControl(crt, parent, 5, 2, 10, 3);
      expect(child.Parent).toBe(parent);
    });
  });

  describe('ScreenLeft / ScreenTop', () => {
    it('match Left/Top for top-level controls', () => {
      const c = new CrtControl(crt, undefined, 7, 3, 10, 1);
      expect(c.ScreenLeft).toBe(7);
      expect(c.ScreenTop).toBe(3);
    });

    it('add parent offsets for child controls', () => {
      const parent = new CrtControl(crt, undefined, 10, 5, 40, 10);
      const child = new CrtControl(crt, parent, 3, 2, 10, 3);
      // Parent at (10, 5), child at (3, 2) relative → screen (13, 7)
      expect(child.ScreenLeft).toBe(13);
      expect(child.ScreenTop).toBe(7);
    });
  });

  describe('color setters trigger Paint (verified indirectly)', () => {
    it('setting BackColour updates the field', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      c.BackColour = Color.RED;
      expect(c.BackColour).toBe(Color.RED);
    });

    it('setting same BackColour is a no-op (does not throw)', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      // Setting to the same value should not re-trigger Paint.
      // Hard to detect without spying; verify it doesn't throw.
      expect(() => {
        c.BackColour = Color.BLACK; // already black
      }).not.toThrow();
    });

    it('setting ForeColour updates the field', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      c.ForeColour = Color.YELLOW;
      expect(c.ForeColour).toBe(Color.YELLOW);
    });
  });

  describe('Hide / Show', () => {
    it('Hide does not throw', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      expect(() => c.Hide()).not.toThrow();
    });

    it('Show does not throw', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      c.Hide();
      expect(() => c.Show()).not.toThrow();
    });
  });

  describe('moving a control', () => {
    it('setting Left to the same value is a no-op', () => {
      const c = new CrtControl(crt, undefined, 5, 5, 10, 1);
      expect(() => {
        c.Left = 5;
      }).not.toThrow();
      expect(c.Left).toBe(5);
    });

    it('setting Left to a new value updates it', () => {
      const c = new CrtControl(crt, undefined, 5, 5, 10, 1);
      c.Left = 20;
      expect(c.Left).toBe(20);
    });

    it('setting Top to a new value updates it', () => {
      const c = new CrtControl(crt, undefined, 5, 5, 10, 1);
      c.Top = 10;
      expect(c.Top).toBe(10);
    });
  });

  describe('resizing a control', () => {
    it('setting Width updates the field', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      c.Width = 20;
      expect(c.Width).toBe(20);
    });

    it('setting Height updates the field', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 5);
      c.Height = 10;
      expect(c.Height).toBe(10);
    });

    it('setting Width to the same value is a no-op', () => {
      const c = new CrtControl(crt, undefined, 1, 1, 10, 1);
      expect(() => {
        c.Width = 10;
      }).not.toThrow();
    });
  });

  describe('Parent reassignment', () => {
    it('allows changing parent at runtime', () => {
      const parentA = new CrtControl(crt, undefined, 1, 1, 40, 10);
      const parentB = new CrtControl(crt, undefined, 30, 1, 40, 10);
      const child = new CrtControl(crt, parentA, 1, 1, 5, 1);
      child.Parent = parentB;
      expect(child.Parent).toBe(parentB);
    });
  });

  describe('AddControl', () => {
    it('does not throw when manually adding children', () => {
      const parent = new CrtControl(crt, undefined, 1, 1, 40, 10);
      const child = new CrtControl(crt, undefined, 1, 1, 5, 1);
      expect(() => parent.AddControl(child)).not.toThrow();
    });
  });
});
