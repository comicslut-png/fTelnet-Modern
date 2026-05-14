import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Crt } from '@crt/index.js';
import {
  FillSettings,
  FillStyle,
  Graph,
  LineStyle,
  LineThickness,
  TextJustification,
  TextOrientation,
  WriteMode,
} from '@graph/index.js';

describe('Graph — state setters', () => {
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

  describe('SetColour', () => {
    it('updates the draw color for valid values', () => {
      g.SetColour(5);
      expect(g.GetColour()).toBe(5);
    });

    it('silently ignores out-of-range values', () => {
      g.SetColour(5);
      g.SetColour(-1);
      expect(g.GetColour()).toBe(5);
      g.SetColour(16);
      expect(g.GetColour()).toBe(5);
    });

    it('accepts 0 and 15 (boundary values)', () => {
      g.SetColour(0);
      expect(g.GetColour()).toBe(0);
      g.SetColour(15);
      expect(g.GetColour()).toBe(15);
    });
  });

  describe('SetBkColour', () => {
    it('does not validate the input (matches original)', () => {
      // Unlike SetColour, SetBkColour silently accepts any value.
      // Preserved from the original.
      g.SetBkColour(100);
      // No way to read back BackColour directly, but verify no throw.
      expect(() => g.SetBkColour(-5)).not.toThrow();
    });
  });

  describe('SetLineStyle', () => {
    it('sets a built-in line style with its predefined pattern', () => {
      g.SetLineStyle(LineStyle.Dotted, 0, LineThickness.Normal);
      // Can't directly read line settings, but verify no throw.
      // We'll cover patterns indirectly via SetFillStyle below.
      expect(() => g.SetLineStyle(LineStyle.Dotted, 0, LineThickness.Normal)).not.toThrow();
    });

    it('uses the provided pattern for LineStyle.User', () => {
      expect(() =>
        g.SetLineStyle(LineStyle.User, 0xabcd, LineThickness.Thick)
      ).not.toThrow();
    });
  });

  describe('SetFillStyle', () => {
    it('updates fill style and color', () => {
      g.SetFillStyle(FillStyle.Hatch, 10);
      const fs = g.GetFillSettings();
      expect(fs.Style).toBe(FillStyle.Hatch);
      expect(fs.Colour).toBe(10);
    });

    it('silently ignores out-of-range color', () => {
      g.SetFillStyle(FillStyle.Solid, 5);
      g.SetFillStyle(FillStyle.Hatch, 50); // out of range
      const fs = g.GetFillSettings();
      // Style updated but color preserved
      expect(fs.Style).toBe(FillStyle.Hatch);
      expect(fs.Colour).toBe(5);
    });

    it('User pattern style preserves existing pattern (no fill table entry)', () => {
      g.SetFillStyle(FillStyle.User, 7);
      const fs = g.GetFillSettings();
      expect(fs.Style).toBe(FillStyle.User);
      expect(fs.Colour).toBe(7);
    });
  });

  describe('SetFillPattern', () => {
    it('writes the 8x8 pattern to FillSettings.Pattern', () => {
      // Pattern: alternating rows of all-on and all-off.
      g.SetFillPattern([0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00], 10);
      const fs = g.GetFillSettings();

      // Row 0 all true
      for (let x = 0; x < 8; x++) {
        expect(fs.Pattern[0]![x]).toBe(true);
      }
      // Row 1 all false
      for (let x = 0; x < 8; x++) {
        expect(fs.Pattern[1]![x]).toBe(false);
      }
    });

    it('translates MSB-first bits correctly', () => {
      // 0x80 = 1000_0000 → only first column (index 0) is on
      g.SetFillPattern([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80], 10);
      const fs = g.GetFillSettings();
      expect(fs.Pattern[0]![0]).toBe(true);
      expect(fs.Pattern[0]![1]).toBe(false);
      expect(fs.Pattern[0]![7]).toBe(false);
    });

    it('sets style to User after manual pattern', () => {
      g.SetFillStyle(FillStyle.Solid, 5);
      g.SetFillPattern([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80], 10);
      const fs = g.GetFillSettings();
      expect(fs.Style).toBe(FillStyle.User);
    });

    it('updates color when valid', () => {
      g.SetFillPattern([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], 7);
      expect(g.GetFillSettings().Colour).toBe(7);
    });

    it('ignores out-of-range color', () => {
      g.SetFillStyle(FillStyle.Solid, 5);
      g.SetFillPattern([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], 99);
      // Color stays at 5
      expect(g.GetFillSettings().Colour).toBe(5);
    });
  });

  describe('SetFillSettings', () => {
    it('replaces the entire FillSettings reference', () => {
      const newFs = new FillSettings();
      newFs.Colour = 9;
      newFs.Style = FillStyle.Slash;
      g.SetFillSettings(newFs);
      expect(g.GetFillSettings()).toBe(newFs);
      expect(g.GetFillSettings().Colour).toBe(9);
    });
  });

  describe('SetWriteMode', () => {
    it('does not throw with Normal', () => {
      expect(() => g.SetWriteMode(WriteMode.Normal)).not.toThrow();
    });

    it('silently downgrades non-Normal modes', () => {
      // Preserved behavior: XOR, Or, And, Not are silently coerced
      // to Normal. No throw.
      expect(() => g.SetWriteMode(WriteMode.XOR)).not.toThrow();
      expect(() => g.SetWriteMode(WriteMode.And)).not.toThrow();
    });
  });

  describe('SetTextJustify', () => {
    it('does not throw', () => {
      expect(() =>
        g.SetTextJustify(TextJustification.Center, TextJustification.Center)
      ).not.toThrow();
    });
  });

  describe('SetTextStyle', () => {
    it('does not throw with bitmap font', () => {
      expect(() => g.SetTextStyle(0, TextOrientation.Horizontal, 1)).not.toThrow();
    });

    it('does not throw with stroke fonts', () => {
      expect(() => g.SetTextStyle(1, TextOrientation.Horizontal, 4)).not.toThrow();
    });

    it('does not throw with vertical orientation', () => {
      expect(() => g.SetTextStyle(0, TextOrientation.Vertical, 2)).not.toThrow();
    });
  });

  describe('SetPalette', () => {
    it('updates the palette entry when changed', () => {
      const before = g.CURRENT_PALETTE[0];
      // Replace index 0 with EGA palette entry 5 (0xAA00AA, magenta-ish)
      g.SetPalette(0, 5, false);
      const after = g.CURRENT_PALETTE[0];
      expect(after).not.toBe(before);
      expect(after).toBe(0xaa00aa);
    });

    it('is a no-op when the new color matches the existing entry', () => {
      // Index 0 starts as 0x000000 (= EGA palette[0])
      const before = g.CURRENT_PALETTE[0];
      g.SetPalette(0, 0, false);
      expect(g.CURRENT_PALETTE[0]).toBe(before);
    });
  });

  describe('SetAllPalette', () => {
    it('walks through SetPalette for each entry', () => {
      const newPalette = [
        0, 1, 2, 3, 4, 5, 6, 7,
        8, 9, 10, 11, 12, 13, 14, 15,
      ];
      g.SetAllPalette(newPalette, false);
      // EGA index 6 is 0xAAAA00
      expect(g.CURRENT_PALETTE[6]).toBe(0xaaaa00);
    });
  });

  describe('SetViewPort', () => {
    it('accepts valid coordinates', () => {
      expect(() => g.SetViewPort(0, 0, 639, 349, true)).not.toThrow();
    });

    it('silently rejects negative x1', () => {
      // Hard to observe; verify no throw at least.
      expect(() => g.SetViewPort(-1, 0, 100, 100, true)).not.toThrow();
    });

    it('silently rejects x2 > PIXELS_X-1', () => {
      expect(() => g.SetViewPort(0, 0, 1000, 100, true)).not.toThrow();
    });

    it('silently rejects inverted rect (x1 > x2)', () => {
      expect(() => g.SetViewPort(100, 0, 50, 100, true)).not.toThrow();
    });
  });

  describe('MoveTo', () => {
    it('does not throw', () => {
      expect(() => g.MoveTo(100, 100)).not.toThrow();
    });

    it('accepts coords outside the screen (no clamp in MoveTo)', () => {
      expect(() => g.MoveTo(-50, 999)).not.toThrow();
    });
  });
});

describe('Graph — GraphDefaults', () => {
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

  it('resets draw color to 15', () => {
    g.SetColour(3);
    g.GraphDefaults();
    expect(g.GetColour()).toBe(15);
  });

  it('resets fill to solid 15', () => {
    g.SetFillStyle(FillStyle.Hatch, 5);
    g.GraphDefaults();
    expect(g.GetFillSettings().Style).toBe(FillStyle.Solid);
    expect(g.GetFillSettings().Colour).toBe(15);
  });
});
