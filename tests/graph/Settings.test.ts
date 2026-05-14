import { describe, it, expect } from 'vitest';
import {
  FillSettings,
  FillStyle,
  LineSettings,
  LineStyle,
  LineThickness,
  TextSettings,
  TextJustification,
  TextOrientation,
  ViewPortSettings,
} from '@graph/index.js';

describe('FillSettings', () => {
  it('defaults to Solid white (color 15)', () => {
    const fs = new FillSettings();
    expect(fs.Style).toBe(FillStyle.Solid);
    expect(fs.Colour).toBe(15);
  });

  it('initializes Pattern as an 8x8 grid of true', () => {
    const fs = new FillSettings();
    expect(fs.Pattern.length).toBe(8);
    for (let y = 0; y < 8; y++) {
      expect(fs.Pattern[y]!.length).toBe(8);
      for (let x = 0; x < 8; x++) {
        expect(fs.Pattern[y]![x]).toBe(true);
      }
    }
  });
});

describe('LineSettings', () => {
  it('defaults to Solid Normal-thickness with all-on pattern', () => {
    const ls = new LineSettings();
    expect(ls.Style).toBe(LineStyle.Solid);
    expect(ls.Thickness).toBe(LineThickness.Normal);
    expect(ls.Pattern).toBe(0xffff);
  });
});

describe('TextSettings', () => {
  it('defaults to bitmap font, horizontal, top-left, size 1', () => {
    const ts = new TextSettings();
    expect(ts.Font).toBe(0);
    expect(ts.Direction).toBe(TextOrientation.Horizontal);
    expect(ts.HorizontalAlign).toBe(TextJustification.Left);
    expect(ts.VerticalAlign).toBe(TextJustification.Top);
    expect(ts.Size).toBe(1);
  });

  it('constructor calls SetStrokeScale (Font=0 gives NaN — preserved)', () => {
    // Font 0 is the bitmap font row, which is all zeros. Original
    // BGI code never reads StrokeScaleX/Y when Font=0, so NaN here
    // is harmless. Preserving original behavior.
    const ts = new TextSettings();
    expect(Number.isNaN(ts.StrokeScaleX)).toBe(true);
    expect(Number.isNaN(ts.StrokeScaleY)).toBe(true);
  });

  it('SetStrokeScale computes ratios for stroke fonts', () => {
    const ts = new TextSettings();
    ts.Font = 1; // TriplexFont
    ts.Size = 4; // baseline size — should give 1.0/1.0
    ts.SetStrokeScale();
    expect(ts.StrokeScaleX).toBe(1);
    expect(ts.StrokeScaleY).toBe(1);
  });

  it('SetStrokeScale at size 1 gives a fraction of size 4', () => {
    const ts = new TextSettings();
    ts.Font = 1; // TriplexFont: size 1 is [13,18], size 4 is [22,31]
    ts.Size = 1;
    ts.SetStrokeScale();
    expect(ts.StrokeScaleX).toBeCloseTo(13 / 22, 5);
    expect(ts.StrokeScaleY).toBeCloseTo(18 / 31, 5);
  });

  it('SetStrokeScale at size 10 gives a multiple of size 4', () => {
    const ts = new TextSettings();
    ts.Font = 1; // TriplexFont: size 10 is [88,124], size 4 is [22,31]
    ts.Size = 10;
    ts.SetStrokeScale();
    expect(ts.StrokeScaleX).toBeCloseTo(88 / 22, 5);
    expect(ts.StrokeScaleY).toBeCloseTo(124 / 31, 5);
  });
});

describe('ViewPortSettings', () => {
  it('defaults to standard EGA-VGA 640x350 full-screen', () => {
    const vps = new ViewPortSettings();
    expect(vps.x1).toBe(0);
    expect(vps.y1).toBe(0);
    expect(vps.x2).toBe(639);
    expect(vps.y2).toBe(349);
    expect(vps.Clip).toBe(true);
    expect(vps.FullScreen).toBe(true);
  });

  it('all From* offsets start at 0', () => {
    const vps = new ViewPortSettings();
    expect(vps.FromBottom).toBe(0);
    expect(vps.FromLeft).toBe(0);
    expect(vps.FromRight).toBe(0);
    expect(vps.FromTop).toBe(0);
  });
});
