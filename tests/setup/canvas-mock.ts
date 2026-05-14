/*
  Mock the 2D canvas context for tests.

  jsdom (which Vitest uses for browser-like tests) ships without a
  canvas implementation. The full `canvas` npm package would solve this
  but requires native compilation, which is platform-specific and slow.
  For Crt's purposes we only need a stand-in that doesn't throw — the
  pixel-perfect rendering tests aren't meaningful in jsdom anyway.

  This setup file registers a no-op CanvasRenderingContext2D substitute
  that records calls (helpful for tests that want to assert "did Crt
  call fillRect with these args") but doesn't actually draw anything.

  Loaded automatically by vitest.config.ts via `test.setupFiles`.
*/

import { vi } from 'vitest';

/**
 * Record of canvas calls — visible to tests so they can assert on
 * rendering activity without a real pixel buffer.
 */
export const canvasCalls: Array<{ method: string; args: unknown[] }> = [];

function recordCall(method: string, args: unknown[]): void {
  canvasCalls.push({ method, args });
}

function fakeImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

const stubContext = {
  // Settable properties the Crt constructor touches
  font: '',
  textBaseline: 'top' as CanvasTextBaseline,
  fillStyle: '#000' as string | CanvasGradient | CanvasPattern,
  strokeStyle: '#000' as string | CanvasGradient | CanvasPattern,
  globalAlpha: 1,

  // Drawing operations: record and no-op
  fillRect: vi.fn((...args: unknown[]) => recordCall('fillRect', args)),
  clearRect: vi.fn((...args: unknown[]) => recordCall('clearRect', args)),
  strokeRect: vi.fn((...args: unknown[]) => recordCall('strokeRect', args)),
  fillText: vi.fn((...args: unknown[]) => recordCall('fillText', args)),
  drawImage: vi.fn((...args: unknown[]) => recordCall('drawImage', args)),
  putImageData: vi.fn((...args: unknown[]) => recordCall('putImageData', args)),
  getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => fakeImageData(w, h)),
  createImageData: vi.fn((w: number, h: number) => fakeImageData(w, h)),

  // Path operations (used by RIP; not by Crt, but a real context exposes them)
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  rect: vi.fn(),

  // Transform operations
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),

  // Measurement
  measureText: vi.fn(() => ({ width: 9 }) as TextMetrics),
};

// Override getContext on every canvas created in tests. Each canvas
// gets its own stub object so they don't share state, but the recorded
// call log is shared globally so a single assertion can inspect the
// full render history.
HTMLCanvasElement.prototype.getContext = vi.fn(function (
  this: HTMLCanvasElement,
  type: string
): CanvasRenderingContext2D | null {
  if (type === '2d') {
    return stubContext as unknown as CanvasRenderingContext2D;
  }
  return null;
}) as typeof HTMLCanvasElement.prototype.getContext;

// Image loading also doesn't work in jsdom — CrtFont kicks off a
// background PNG load that would error out and noisily reject. Stub
// the Image element so its onload never fires (Crt only reads the
// font size on font-change, and 80x25 at the default 9x16 size is
// already set up by Crt's constructor before any load completes).
Object.defineProperty(window, 'Image', {
  writable: true,
  value: class FakeImage {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public src = '';
    public crossOrigin: string | null = null;
    public width = 9 * 256; // wide enough to hold 256 glyphs
    public height = 16;
  },
});

// Reset call log between tests.
import { beforeEach } from 'vitest';
beforeEach(() => {
  canvasCalls.length = 0;
});
