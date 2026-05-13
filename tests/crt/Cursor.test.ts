import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Point } from '@common/Point.js';
import { BlinkState } from '@crt/BlinkState.js';
import { Cursor } from '@crt/Cursor.js';

describe('Cursor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts hidden (BlinkState.Hide)', () => {
    const cursor = new Cursor(0xffffff, new Point(9, 16));
    // The first onTimer fires after 500ms; before that the state is Hide.
    const onShow = vi.fn();
    const onHide = vi.fn();
    cursor.onshow.on(onShow);
    cursor.onhide.on(onHide);

    // No timer fires yet — neither should be called.
    expect(onShow).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
    cursor.dispose();
  });

  it('alternates between Show and Hide on each blink tick', () => {
    const cursor = new Cursor(0xffffff, new Point(9, 16));
    const order: BlinkState[] = [];
    cursor.onshow.on(() => order.push(BlinkState.Show));
    cursor.onhide.on(() => order.push(BlinkState.Hide));

    // Start state is Hide; first tick flips to Show.
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);

    expect(order).toEqual([BlinkState.Show, BlinkState.Hide, BlinkState.Show, BlinkState.Hide]);
    cursor.dispose();
  });

  it('changing BlinkRate resets the timer to the new interval', () => {
    const cursor = new Cursor(0xffffff, new Point(9, 16));
    const onShow = vi.fn();
    cursor.onshow.on(onShow);

    cursor.BlinkRate = 100;
    vi.advanceTimersByTime(100);
    expect(onShow).toHaveBeenCalledOnce();
    cursor.dispose();
  });

  it('formats the colour as a 6-digit hex CSS string', () => {
    const cursor = new Cursor(0xff8800, new Point(9, 16));
    expect(cursor.Colour).toBe('#ff8800');
    cursor.dispose();
  });

  it('pads short colour values to 6 digits', () => {
    const cursor = new Cursor(0x42, new Point(9, 16));
    expect(cursor.Colour).toBe('#000042');
    cursor.dispose();
  });

  it('Position can be read and written', () => {
    const cursor = new Cursor(0xffffff, new Point(9, 16));
    expect(cursor.Position.x).toBe(1);
    expect(cursor.Position.y).toBe(1);
    cursor.Position = new Point(40, 12);
    expect(cursor.Position.x).toBe(40);
    expect(cursor.Position.y).toBe(12);
    cursor.dispose();
  });

  it('Visible defaults to true and can be toggled', () => {
    const cursor = new Cursor(0xffffff, new Point(9, 16));
    expect(cursor.Visible).toBe(true);
    cursor.Visible = false;
    expect(cursor.Visible).toBe(false);
    cursor.dispose();
  });

  it('dispose() stops the timer (no more events fire afterward)', () => {
    const cursor = new Cursor(0xffffff, new Point(9, 16));
    const onShow = vi.fn();
    cursor.onshow.on(onShow);
    cursor.dispose();
    vi.advanceTimersByTime(10_000); // 10 seconds; many would-be ticks
    expect(onShow).not.toHaveBeenCalled();
  });
});
