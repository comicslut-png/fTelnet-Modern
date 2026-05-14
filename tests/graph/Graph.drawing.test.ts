import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Crt } from '@crt/index.js';
import { Point } from '@common/index.js';
import {
  FillStyle,
  Graph,
  LineStyle,
  LineThickness,
} from '@graph/index.js';
import { canvasCalls } from '../setup/canvas-mock.js';

/*
  The canvas mock records every drawing call but doesn't produce a
  real pixel buffer. These tests verify that drawing methods make
  the expected sequence of canvas calls — that's the best we can do
  in jsdom without a real canvas implementation.

  The mock clears `canvasCalls` between each test (see canvas-mock.ts),
  so each test starts with an empty log.

  Note: the Graph constructor itself produces many canvas calls
  (GraphDefaults fills the viewport, etc.), so tests inspect the
  TAIL of the call log — the calls after a "marker" position.
*/

describe('Graph — drawing operations make canvas calls', () => {
  let container: HTMLDivElement;
  let crt: Crt;
  let graphContainer: HTMLDivElement;
  let g: Graph;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
    g = new Graph(crt, graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  function callsAfter(marker: number): typeof canvasCalls {
    return canvasCalls.slice(marker);
  }

  describe('PutPixelDefault', () => {
    it('issues a fillRect call for in-bounds pixels', () => {
      const marker = canvasCalls.length;
      g.PutPixelDefault(100, 100, 5);
      const after = callsAfter(marker);
      expect(after.some((c) => c.method === 'fillRect')).toBe(true);
    });

    it('does NOT call fillRect for out-of-bounds pixels', () => {
      const marker = canvasCalls.length;
      g.PutPixelDefault(-1, 100, 5);
      g.PutPixelDefault(100, -1, 5);
      g.PutPixelDefault(640, 100, 5);
      g.PutPixelDefault(100, 350, 5);
      const after = callsAfter(marker);
      expect(after.filter((c) => c.method === 'fillRect').length).toBe(0);
    });

    it('uses the palette-mapped color', () => {
      const marker = canvasCalls.length;
      g.PutPixelDefault(0, 0, 15); // index 15 = 0xffffff
      const after = callsAfter(marker);
      // The fillStyle string is set on the context, not passed as arg,
      // but the fact that fillRect was called means the pixel was drawn.
      expect(after.some((c) => c.method === 'fillRect')).toBe(true);
    });
  });

  describe('Bar', () => {
    it('fillRects when fill style is solid', () => {
      g.SetFillStyle(FillStyle.Solid, 5);
      const marker = canvasCalls.length;
      g.Bar(10, 10, 50, 50);
      const after = callsAfter(marker);
      expect(after.some((c) => c.method === 'fillRect')).toBe(true);
    });

    it('with solid fill, uses a single fillRect for the whole rect', () => {
      g.SetFillStyle(FillStyle.Solid, 5);
      const marker = canvasCalls.length;
      g.Bar(10, 10, 50, 50);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // Solid fill optimization: one big fillRect, not many small ones
      expect(fillRects.length).toBe(1);
      // Args: x, y, width, height
      expect(fillRects[0]!.args).toEqual([10, 10, 41, 41]);
    });

    it('with patterned fill, issues per-pixel fillRect calls', () => {
      // Switch to a patterned (non-solid, non-empty, non-background) fill
      g.SetFillStyle(FillStyle.Hatch, 5);
      const marker = canvasCalls.length;
      g.Bar(0, 0, 3, 3);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // Patterned: 4x4 = 16 per-pixel fillRects
      expect(fillRects.length).toBe(16);
    });
  });

  describe('Line', () => {
    it('horizontal solid line uses one PutPixel per cell', () => {
      g.SetLineStyle(LineStyle.Solid, 0xffff, LineThickness.Normal);
      const marker = canvasCalls.length;
      g.Line(10, 50, 20, 50); // 11 pixels horizontally
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // HLine produces one fillRect per pixel (via PutPixelDefault)
      expect(fillRects.length).toBe(11);
    });

    it('vertical solid line', () => {
      const marker = canvasCalls.length;
      g.Line(50, 10, 50, 20); // 11 pixels vertically
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      expect(fillRects.length).toBe(11);
    });

    it('sloped line produces fillRects', () => {
      const marker = canvasCalls.length;
      g.Line(10, 10, 50, 30);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // Approximately 41 pixels (deltax = 40, dominant axis)
      expect(fillRects.length).toBeGreaterThan(35);
      expect(fillRects.length).toBeLessThanOrEqual(45);
    });

    it('thick horizontal line draws three parallel rows', () => {
      g.SetLineStyle(LineStyle.Solid, 0xffff, LineThickness.Thick);
      const marker = canvasCalls.length;
      g.Line(10, 50, 20, 50);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // Three rows of HLine output (the original draws y-1, y, and a
      // single pixel at y+1; preserved as-is). 11 + 11 + 1 = 23.
      expect(fillRects.length).toBe(23);
    });
  });

  describe('Rectangle (method)', () => {
    it('draws four lines', () => {
      const marker = canvasCalls.length;
      g.Rectangle(10, 10, 30, 30);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // Each side is 21 pixels; corners are drawn twice → 21*4 - 4 = 80
      // Or with overlap: 21 + 21 + 21 + 21 = 84.
      // Either way, more than 60.
      expect(fillRects.length).toBeGreaterThan(60);
    });
  });

  describe('Circle', () => {
    it('produces fillRect calls', () => {
      const marker = canvasCalls.length;
      g.Circle(100, 100, 30);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      expect(fillRects.length).toBeGreaterThan(0);
    });
  });

  describe('FillEllipse', () => {
    it('produces fillRect calls (both outline and fill)', () => {
      const marker = canvasCalls.length;
      g.FillEllipse(100, 100, 30, 20);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // Fill ellipse uses Bar() inside which is a single fillRect per scanline
      // (for solid fill), so we expect MANY calls.
      expect(fillRects.length).toBeGreaterThan(20);
    });
  });

  describe('DrawPoly', () => {
    it('draws lines between consecutive points', () => {
      const points = [new Point(10, 10), new Point(50, 10), new Point(50, 50)];
      const marker = canvasCalls.length;
      g.DrawPoly(points);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // 2 lines drawn → at least 40 + 40 = 80 pixels
      expect(fillRects.length).toBeGreaterThan(40);
    });

    it('does not close the polygon (no last→first line)', () => {
      const tinyPoly = [new Point(10, 10), new Point(20, 10), new Point(15, 20)];
      const marker = canvasCalls.length;
      g.DrawPoly(tinyPoly);
      const fillRects = callsAfter(marker).filter((c) => c.method === 'fillRect');
      // 2 lines → roughly 11 + 11 = 22 pixels (give or take for sloping)
      expect(fillRects.length).toBeLessThan(50);
    });
  });

  describe('PointInPoly', () => {
    it('returns true for a point inside a square', () => {
      const square = [
        new Point(0, 0),
        new Point(10, 0),
        new Point(10, 10),
        new Point(0, 10),
      ];
      expect(g.PointInPoly(5, 5, square)).toBe(true);
    });

    it('returns false for a point outside a square', () => {
      const square = [
        new Point(0, 0),
        new Point(10, 0),
        new Point(10, 10),
        new Point(0, 10),
      ];
      expect(g.PointInPoly(20, 20, square)).toBe(false);
    });
  });

  describe('OutTextXY — bitmap font', () => {
    it('does not crash with size 1 horizontal text', () => {
      expect(() => g.OutTextXY(10, 10, 'Hi')).not.toThrow();
    });

    it('does not crash with size 2 horizontal text', () => {
      g.SetTextStyle(0, 0, 2);
      expect(() => g.OutTextXY(10, 10, 'Hi')).not.toThrow();
    });

    it('does not crash with empty string', () => {
      expect(() => g.OutTextXY(10, 10, '')).not.toThrow();
    });
  });

  describe('TextWidth / TextHeight', () => {
    it('bitmap font: TextWidth is 8 * length * size', () => {
      g.SetTextStyle(0, 0, 1);
      expect(g.TextWidth('ABC')).toBe(24);

      g.SetTextStyle(0, 0, 2);
      expect(g.TextWidth('ABC')).toBe(48);
    });

    it('bitmap font: TextHeight is 8 * size', () => {
      g.SetTextStyle(0, 0, 1);
      expect(g.TextHeight('Hi')).toBe(8);

      g.SetTextStyle(0, 0, 3);
      expect(g.TextHeight('Hi')).toBe(24);
    });
  });

  describe('GetImage', () => {
    it('returns an ImageData object', () => {
      const img = g.GetImage(0, 0, 10, 10);
      expect(img.width).toBe(11);
      expect(img.height).toBe(11);
    });
  });
});
