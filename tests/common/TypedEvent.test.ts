import { describe, it, expect, vi } from 'vitest';
import { TypedEvent } from '@common/TypedEvent.js';

describe('TypedEvent', () => {
  it('calls a registered listener', () => {
    const event = new TypedEvent<[]>();
    const listener = vi.fn();
    event.on(listener);
    event.trigger();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('passes arguments to listeners', () => {
    const event = new TypedEvent<[number, string]>();
    const listener = vi.fn();
    event.on(listener);
    event.trigger(42, 'hello');
    expect(listener).toHaveBeenCalledWith(42, 'hello');
  });

  it('calls multiple listeners in registration order', () => {
    const event = new TypedEvent<[]>();
    const calls: number[] = [];
    event.on(() => calls.push(1));
    event.on(() => calls.push(2));
    event.on(() => calls.push(3));
    event.trigger();
    expect(calls).toEqual([1, 2, 3]);
  });

  it('removes a specific listener via off()', () => {
    // This is the key regression test for the bug fixed in migration:
    // the original loop incremented `l` instead of `i`, causing this
    // case to either spin forever or remove the wrong listener.
    const event = new TypedEvent<[]>();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    event.on(a);
    event.on(b);
    event.on(c);
    event.off(b);
    event.trigger();
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledOnce();
  });

  it('removes all listeners when off() is called with no argument', () => {
    const event = new TypedEvent<[]>();
    const a = vi.fn();
    const b = vi.fn();
    event.on(a);
    event.on(b);
    event.off();
    event.trigger();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('tolerates a listener that removes itself during dispatch', () => {
    const event = new TypedEvent<[]>();
    const a = vi.fn();
    const b = vi.fn(() => event.off(b));
    const c = vi.fn();
    event.on(a);
    event.on(b);
    event.on(c);
    event.trigger();
    // c must still be called even though b removed itself mid-dispatch.
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(c).toHaveBeenCalledOnce();
  });

  it('tracks listener count', () => {
    const event = new TypedEvent<[]>();
    expect(event.listenerCount).toBe(0);
    event.on(() => {});
    event.on(() => {});
    expect(event.listenerCount).toBe(2);
    event.off();
    expect(event.listenerCount).toBe(0);
  });
});
