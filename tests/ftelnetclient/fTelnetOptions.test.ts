import { describe, it, expect } from 'vitest';
import { fTelnetOptions } from '@ftelnetclient/index.js';

describe('fTelnetOptions', () => {
  it('initializes with sensible defaults', () => {
    const opts = new fTelnetOptions();
    expect(opts.AllowModernScrollback).toBe(true);
    expect(opts.BareLFtoCRLF).toBe(false);
    expect(opts.BitsPerSecond).toBe(57600);
    expect(opts.ConnectionType).toBe('telnet');
    expect(opts.Emulation).toBe('ansi-bbs');
    expect(opts.Enter).toBe('\r');
    expect(opts.Font).toBe('CP437');
    expect(opts.ForceWss).toBe(false);
    expect(opts.FullScreenOnConnect).toBe(false);
    expect(opts.Hostname).toBe('bbs.ftelnet.ca');
    expect(opts.LocalEcho).toBe(false);
    expect(opts.NegotiateLocalEcho).toBe(true);
    expect(opts.Port).toBe(1123);
    expect(opts.ProxyHostname).toBe('');
    expect(opts.ProxyPort).toBe(1123);
    expect(opts.ProxyPortSecure).toBe(11235);
    expect(opts.RLoginClientUsername).toBe('');
    expect(opts.RLoginServerUsername).toBe('');
    expect(opts.RLoginTerminalType).toBe('');
    expect(opts.ScreenColumns).toBe(80);
    expect(opts.ScreenRows).toBe(25);
    expect(opts.SendLocation).toBe(true);
    expect(opts.SkipRedrawWhenSameFontSize).toBe(false);
    expect(opts.SplashScreen).toBe('');
    expect(opts.VirtualKeyboardVibrateDuration).toBe(25);
    expect(opts.WebSocketUrlPath).toBe('');
  });

  it('VirtualKeyboardVisible defaults based on DetectMobileBrowser', () => {
    // Type-check only: ensure the field is a boolean. The actual
    // value depends on the jsdom user-agent, which by default
    // doesn't match the mobile heuristics → false on desktop test
    // runners.
    const opts = new fTelnetOptions();
    expect(typeof opts.VirtualKeyboardVisible).toBe('boolean');
  });

  it('fields are mutable (the host page customizes via assignment)', () => {
    const opts = new fTelnetOptions();
    opts.Hostname = 'example.com';
    opts.Port = 23;
    opts.Emulation = 'RIP';
    expect(opts.Hostname).toBe('example.com');
    expect(opts.Port).toBe(23);
    expect(opts.Emulation).toBe('RIP');
  });

  it('each instance has independent state', () => {
    const a = new fTelnetOptions();
    const b = new fTelnetOptions();
    a.Hostname = 'a.bbs';
    expect(a.Hostname).toBe('a.bbs');
    expect(b.Hostname).toBe('bbs.ftelnet.ca');
  });
});
