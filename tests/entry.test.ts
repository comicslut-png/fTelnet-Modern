import { describe, it, expect, beforeEach } from 'vitest';

/*
  Smoke tests for the IIFE bundle entries.

  Each entry file imports fTelnetClient + fTelnetOptions and assigns
  them to window globals. These tests verify the assignment happens
  on import — that's the entire contract.

  Tree-shaking is identical across all four flavors today (see
  src/entry/rip-xfer.ts comment). When per-flavor tree-shaking lands
  in a future delta these tests will need flavor-specific assertions.
*/

declare global {
  interface Window {
    fTelnetClient?: unknown;
    fTelnetOptions?: unknown;
  }
}

describe('IIFE bundle entries', () => {
  beforeEach(() => {
    // Reset between tests so we can observe each entry's assignment.
    delete (window as Window).fTelnetClient;
    delete (window as Window).fTelnetOptions;
  });

  it('rip-xfer assigns fTelnetClient and fTelnetOptions to window', async () => {
    await import('../src/entry/rip-xfer.js');
    expect(window.fTelnetClient).toBeDefined();
    expect(window.fTelnetOptions).toBeDefined();
    expect(typeof window.fTelnetClient).toBe('function');
    expect(typeof window.fTelnetOptions).toBe('function');
  });

  it('rip-noxfer assigns fTelnetClient and fTelnetOptions to window', async () => {
    await import('../src/entry/rip-noxfer.js');
    expect(window.fTelnetClient).toBeDefined();
    expect(window.fTelnetOptions).toBeDefined();
  });

  it('norip-xfer assigns fTelnetClient and fTelnetOptions to window', async () => {
    await import('../src/entry/norip-xfer.js');
    expect(window.fTelnetClient).toBeDefined();
    expect(window.fTelnetOptions).toBeDefined();
  });

  it('norip-noxfer assigns fTelnetClient and fTelnetOptions to window', async () => {
    await import('../src/entry/norip-noxfer.js');
    expect(window.fTelnetClient).toBeDefined();
    expect(window.fTelnetOptions).toBeDefined();
  });
});
