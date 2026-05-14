import { describe, it, expect } from 'vitest';
import { ButtonStyle, MouseButton, RIPParserState } from '@graph/index.js';
import { Rectangle } from '@graph/index.js';

describe('ButtonStyle', () => {
  it('all numeric fields default to 0', () => {
    const bs = new ButtonStyle();
    expect(bs.width).toBe(0);
    expect(bs.height).toBe(0);
    expect(bs.orientation).toBe(0);
    expect(bs.flags).toBe(0);
    expect(bs.bevelsize).toBe(0);
    expect(bs.dfore).toBe(0);
    expect(bs.dback).toBe(0);
    expect(bs.bright).toBe(0);
    expect(bs.dark).toBe(0);
    expect(bs.surface).toBe(0);
    expect(bs.groupid).toBe(0);
    expect(bs.flags2).toBe(0);
    expect(bs.underlinecolour).toBe(0);
    expect(bs.cornercolour).toBe(0);
  });

  it('fields are mutable (matches original dataclass semantics)', () => {
    const bs = new ButtonStyle();
    bs.flags = 0x400;
    bs.surface = 8;
    expect(bs.flags).toBe(0x400);
    expect(bs.surface).toBe(8);
  });
});

describe('MouseButton', () => {
  it('exposes coords, host command, and hot key via getters', () => {
    const rect = new Rectangle(10, 20, 100, 50);
    const mb = new MouseButton(rect, 'go menu', 0, 'M');
    expect(mb.Coords).toBe(rect);
    expect(mb.HostCommand).toBe('go menu');
    expect(mb.HotKey).toBe('M');
  });

  it('IsInvertable: bit 2 of flags', () => {
    const rect = new Rectangle(0, 0, 10, 10);
    const noFlags = new MouseButton(rect, '', 0, '');
    expect(noFlags.IsInvertable()).toBe(false);

    const withInvert = new MouseButton(rect, '', 2, '');
    expect(withInvert.IsInvertable()).toBe(true);

    // Other bits set without bit 2: still not invertable.
    const otherBits = new MouseButton(rect, '', 4 | 8 | 16, '');
    expect(otherBits.IsInvertable()).toBe(false);

    // Bit 2 plus other bits: still invertable.
    const mixed = new MouseButton(rect, '', 2 | 4, '');
    expect(mixed.IsInvertable()).toBe(true);
  });

  it('DoResetScreen: bit 4 of flags', () => {
    const rect = new Rectangle(0, 0, 10, 10);
    const noFlags = new MouseButton(rect, '', 0, '');
    expect(noFlags.DoResetScreen()).toBe(false);

    const withReset = new MouseButton(rect, '', 4, '');
    expect(withReset.DoResetScreen()).toBe(true);

    const mixed = new MouseButton(rect, '', 2 | 4, '');
    expect(mixed.DoResetScreen()).toBe(true);
  });

  it('handles empty host command and hotkey', () => {
    const rect = new Rectangle(0, 0, 5, 5);
    const mb = new MouseButton(rect, '', 0, '');
    expect(mb.HostCommand).toBe('');
    expect(mb.HotKey).toBe('');
  });
});

describe('RIPParserState', () => {
  it('has the expected numeric values', () => {
    expect(RIPParserState.None).toBe(0);
    expect(RIPParserState.GotExclamation).toBe(1);
    expect(RIPParserState.GotPipe).toBe(2);
    expect(RIPParserState.GotLevel).toBe(3);
    expect(RIPParserState.GotSubLevel).toBe(4);
    expect(RIPParserState.GotCommand).toBe(5);
  });
});
