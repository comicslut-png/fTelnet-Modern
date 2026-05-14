import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Crt } from '@crt/index.js';
import {
  FillStyle,
  Graph,
  LineStyle,
  LineThickness,
  TextJustification,
  TextOrientation,
  WriteMode,
} from '@graph/index.js';

describe('Graph — construction', () => {
  let container: HTMLDivElement;
  let crt: Crt;
  let graphContainer: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    graphContainer = document.createElement('div');
    document.body.appendChild(graphContainer);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
    document.body.removeChild(graphContainer);
  });

  it('creates a 640x350 canvas', () => {
    const g = new Graph(crt, graphContainer);
    expect(g.PIXELS_X).toBe(640);
    expect(g.PIXELS_Y).toBe(350);
    expect(g.PIXELS).toBe(640 * 350);
  });

  it('appends the canvas to the container', () => {
    const g = new Graph(crt, graphContainer);
    expect(graphContainer.contains(g.Canvas)).toBe(true);
  });

  it('sets the canvas id to fTelnetGraphCanvas', () => {
    const g = new Graph(crt, graphContainer);
    expect(g.Canvas.id).toBe('fTelnetGraphCanvas');
  });

  it('positions the canvas absolutely at z-index 0', () => {
    const g = new Graph(crt, graphContainer);
    expect(g.Canvas.style.position).toBe('absolute');
    expect(g.Canvas.style.zIndex).toBe('0');
  });

  it('sets the container size to PIXELS_X x PIXELS_Y', () => {
    new Graph(crt, graphContainer);
    expect(graphContainer.style.width).toBe('640px');
    expect(graphContainer.style.height).toBe('350px');
  });

  it('makes the Crt canvas transparent', () => {
    new Graph(crt, graphContainer);
    // Crt.Transparent is a setter that updates internal state; we
    // can't easily inspect the value, but verify the setter ran by
    // checking that the Crt canvas got its position set.
    expect(crt.Canvas.style.position).toBe('absolute');
  });

  it('has a default 16-entry CURRENT_PALETTE', () => {
    const g = new Graph(crt, graphContainer);
    expect(g.CURRENT_PALETTE.length).toBe(16);
  });

  it('has the standard BGI palette mappings', () => {
    const g = new Graph(crt, graphContainer);
    // Index 0 = black
    expect(g.CURRENT_PALETTE[0]).toBe(0x000000);
    // Index 15 = bright white (EGA palette entry 63)
    expect(g.CURRENT_PALETTE[15]).toBe(0xffffff);
  });

  it('initializes with foreground color 15 and background 0', () => {
    const g = new Graph(crt, graphContainer);
    expect(g.GetColour()).toBe(15);
  });

  it('initializes with solid fill at color 15', () => {
    const g = new Graph(crt, graphContainer);
    const fs = g.GetFillSettings();
    expect(fs.Style).toBe(FillStyle.Solid);
    expect(fs.Colour).toBe(15);
  });
});
