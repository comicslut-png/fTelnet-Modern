import { describe, it, expect, beforeEach } from 'vitest';
import { BitmapFont, StrokeFont } from '@graph/index.js';

describe('BitmapFont', () => {
  beforeEach(() => {
    // Reset between tests so Loaded state doesn't leak.
    BitmapFont.Loaded = false;
    BitmapFont.Pixels = [];
  });

  it('starts with Loaded=false before Init', () => {
    expect(BitmapFont.Loaded).toBe(false);
  });

  it('Init creates a 256-char fallback grid of zeros', () => {
    BitmapFont.Init();
    expect(BitmapFont.Pixels.length).toBe(256);

    // Spot-check char 0 and char 255: each should be 8 rows of 8 zeros.
    expect(BitmapFont.Pixels[0]!.length).toBe(8);
    expect(BitmapFont.Pixels[0]![0]!.length).toBe(8);
    expect(BitmapFont.Pixels[255]!.length).toBe(8);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(BitmapFont.Pixels[0]![y]![x]).toBe(0);
        expect(BitmapFont.Pixels[255]![y]![x]).toBe(0);
      }
    }
  });

  it('Init in test context (no fTelnetScript) does not crash', () => {
    // The jsdom environment doesn't have an element with id
    // 'fTelnetScript', so Init should silently skip the fetch.
    expect(() => BitmapFont.Init()).not.toThrow();
    // Loaded should still be false (no async load happened).
    expect(BitmapFont.Loaded).toBe(false);
  });
});

describe('StrokeFont', () => {
  beforeEach(() => {
    StrokeFont.Loaded = false;
    StrokeFont.Strokes = [];
  });

  it('MOVE is 0 and DRAW is 1', () => {
    expect(StrokeFont.MOVE).toBe(0);
    expect(StrokeFont.DRAW).toBe(1);
  });

  it('Heights array has 10 baseline heights', () => {
    expect(StrokeFont.Heights.length).toBe(10);
  });

  it('Heights values match the original BGI font heights', () => {
    expect(StrokeFont.Heights).toEqual([31, 9, 32, 32, 37, 35, 31, 35, 55, 60]);
  });

  it('Init creates 10 fonts × 256 chars of stub data', () => {
    StrokeFont.Init();
    expect(StrokeFont.Strokes.length).toBe(10);
    for (let f = 0; f < 10; f++) {
      expect(StrokeFont.Strokes[f]!.length).toBe(256);
    }
  });

  it('Init stub data uses the placeholder shape [[0], [0, 0, 0]]', () => {
    StrokeFont.Init();
    const stub = StrokeFont.Strokes[3]![100]!;
    expect(stub).toEqual([[0], [0, 0, 0]]);
  });

  it('Init in test context does not crash', () => {
    expect(() => StrokeFont.Init()).not.toThrow();
    expect(StrokeFont.Loaded).toBe(false);
  });
});
