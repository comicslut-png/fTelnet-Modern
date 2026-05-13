import { describe, it, expect } from 'vitest';
import { KeyboardKeys } from '@crt/KeyboardKeys.js';

describe('KeyboardKeys', () => {
  // These are sanity tests — the values are dictated by the legacy
  // KeyboardEvent.keyCode spec. If anyone "fixes" these to use modern
  // KeyboardEvent.code strings without updating the rest of the codebase,
  // these tests will catch the mistake immediately.

  it('has expected values for standard navigation keys', () => {
    expect(KeyboardKeys.UP).toBe(38);
    expect(KeyboardKeys.DOWN).toBe(40);
    expect(KeyboardKeys.LEFT).toBe(37);
    expect(KeyboardKeys.RIGHT).toBe(39);
    expect(KeyboardKeys.HOME).toBe(36);
    expect(KeyboardKeys.END).toBe(35);
    expect(KeyboardKeys.PAGE_UP).toBe(33);
    expect(KeyboardKeys.PAGE_DOWN).toBe(34);
  });

  it('has expected values for control keys', () => {
    expect(KeyboardKeys.ENTER).toBe(13);
    expect(KeyboardKeys.ESCAPE).toBe(27);
    expect(KeyboardKeys.BACKSPACE).toBe(8);
    expect(KeyboardKeys.TAB).toBe(9);
    expect(KeyboardKeys.SPACE).toBe(32);
    expect(KeyboardKeys.DELETE).toBe(46);
    expect(KeyboardKeys.INSERT).toBe(45);
  });

  it('has F1-F12 in the standard 112-123 range', () => {
    expect(KeyboardKeys.F1).toBe(112);
    expect(KeyboardKeys.F12).toBe(123);
    // And the sequence is contiguous.
    expect(KeyboardKeys.F12 - KeyboardKeys.F1).toBe(11);
  });

  it('has fTelnet-specific codes above 1000', () => {
    expect(KeyboardKeys.BREAK).toBe(1000);
    expect(KeyboardKeys.APPMENU).toBe(1001);
    expect(KeyboardKeys.NUM_LOCK).toBe(1002);
    expect(KeyboardKeys.WINDOWS).toBe(1003);
    expect(KeyboardKeys.SHIFTLEFT).toBe(1004);
    expect(KeyboardKeys.SHIFTRIGHT).toBe(1005);
  });
});
