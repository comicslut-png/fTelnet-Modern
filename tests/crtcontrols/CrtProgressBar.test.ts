import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Color, Crt } from '@crt/index.js';
import { CrtControl } from '@crtcontrols/CrtControl.js';
import { CrtProgressBar } from '@crtcontrols/CrtProgressBar.js';
import { ProgressBarStyle } from '@crtcontrols/ProgressBarStyle.js';

describe('CrtProgressBar', () => {
  let container: HTMLDivElement;
  let crt: Crt;
  let parent: CrtControl;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    parent = new CrtControl(crt, undefined, 1, 1, 80, 25);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
  });

  describe('construction (Blocks style)', () => {
    it('defaults to Maximum=100, Value=0', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(bar.Maximum).toBe(100);
      expect(bar.Value).toBe(0);
    });

    it('has fixed height of 1', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(bar.Height).toBe(1);
    });

    it('uses BLUE background by default', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(bar.BackColour).toBe(Color.BLUE);
    });

    it('uses YELLOW bar foreground by default', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(bar.BarForeColour).toBe(Color.YELLOW);
    });

    it('uses LIGHTGRAY blank foreground by default', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(bar.BlankForeColour).toBe(Color.LIGHTGRAY);
    });

    it('starts with PercentVisible=true and PercentPrecision=2', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(bar.PercentVisible).toBe(true);
      expect(bar.PercentPrecision).toBe(2);
    });
  });

  describe('Value clamping (Blocks/Continuous)', () => {
    it('clamps negative values to 0', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Value = -10;
      expect(bar.Value).toBe(0);
    });

    it('clamps values above Maximum to Maximum', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Value = 150;
      expect(bar.Value).toBe(100);
    });

    it('accepts in-range values directly', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Value = 50;
      expect(bar.Value).toBe(50);
    });
  });

  describe('Step / StepBy', () => {
    it('Step() increments Value by 1', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Step();
      expect(bar.Value).toBe(1);
    });

    it('StepBy(n) increments Value by n', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.StepBy(25);
      expect(bar.Value).toBe(25);
    });

    it('StepBy past Maximum clamps to Maximum', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.StepBy(200);
      expect(bar.Value).toBe(100);
    });
  });

  describe('Maximum property', () => {
    it('changing Maximum updates the field', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Maximum = 50;
      expect(bar.Maximum).toBe(50);
    });

    it('lowering Maximum below current Value clamps Value to new Maximum', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Value = 75;
      bar.Maximum = 50;
      expect(bar.Value).toBe(50);
    });

    it('setting Maximum to the current value is a no-op', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(() => {
        bar.Maximum = 100;
      }).not.toThrow();
    });
  });

  describe('Style property', () => {
    it('changing Style triggers a repaint', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Style = ProgressBarStyle.Continuous;
      expect(bar.Style).toBe(ProgressBarStyle.Continuous);
    });

    it('setting Style to the same value is a no-op', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      expect(() => {
        bar.Style = ProgressBarStyle.Blocks;
      }).not.toThrow();
    });
  });

  describe('color setters', () => {
    it('BarForeColour setter updates the field', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.BarForeColour = Color.GREEN;
      expect(bar.BarForeColour).toBe(Color.GREEN);
    });

    it('BlankForeColour setter updates the field', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.BlankForeColour = Color.CYAN;
      expect(bar.BlankForeColour).toBe(Color.CYAN);
    });

    it('PercentVisible can be turned off', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.PercentVisible = false;
      expect(bar.PercentVisible).toBe(false);
    });

    it('PercentPrecision can be changed', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.PercentPrecision = 1;
      expect(bar.PercentPrecision).toBe(1);
    });
  });

  describe('Marquee style', () => {
    beforeEach(() => {
      // Date.now() drives the throttling; fake the clock so we can
      // step through frames deterministically.
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts at Value 0', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Marquee);
      expect(bar.Value).toBe(0);
    });

    it('respects MarqueeAnimationSpeed throttle', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Marquee);
      bar.MarqueeAnimationSpeed = 100;

      // Initially _lastMarqueeUpdate = Date.now() from constructor.
      // Advancing by less than the throttle should not update Value.
      vi.advanceTimersByTime(50);
      bar.Value = 5;
      expect(bar.Value).toBe(0); // throttled — should not have changed

      // Now advance past the throttle.
      vi.advanceTimersByTime(100);
      bar.Value = 5;
      expect(bar.Value).toBe(5);
    });

    it('wraps Value back to 0 when it exceeds Width + 15', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Marquee);
      bar.MarqueeAnimationSpeed = 0; // disable throttle

      vi.advanceTimersByTime(1);
      bar.Value = 40; // 20 + 15 = 35 → above the cap
      expect(bar.Value).toBe(0);
    });

    it('clamps negative values to 0 in marquee mode', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Marquee);
      bar.MarqueeAnimationSpeed = 0;

      vi.advanceTimersByTime(1);
      bar.Value = -5;
      expect(bar.Value).toBe(0);
    });

    it('MarqueeAnimationSpeed setter works', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Marquee);
      bar.MarqueeAnimationSpeed = 100;
      expect(bar.MarqueeAnimationSpeed).toBe(100);
    });
  });

  describe('paint optimization', () => {
    it('setting Value to its current value is a no-op', () => {
      const bar = new CrtProgressBar(crt, parent, 1, 1, 20, ProgressBarStyle.Blocks);
      bar.Value = 50;
      expect(() => {
        bar.Value = 50;
      }).not.toThrow();
    });
  });
});
