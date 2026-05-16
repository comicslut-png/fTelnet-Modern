import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fTelnetClient, fTelnetOptions } from '@ftelnetclient/index.js';

/*
  Construction smoke tests for fTelnetClient.

  The constructor builds ~270 lines of DOM, hooks up many event
  listeners, and starts a setInterval. Tests here verify it doesn't
  throw with reasonable inputs, that the expected DOM elements
  exist after construction, that the public getter surface returns
  sensible defaults, and that the rare error paths fire alerts.

  Full integration testing (actual BBS connection) is left to the
  Phase 2+ work — at that point fTelnet should be runnable in the
  browser end-to-end and amenable to manual QA against a real
  server.
*/

describe('fTelnetClient', () => {
  let scriptTag: HTMLScriptElement;
  let container: HTMLDivElement;
  let createdClient: fTelnetClient | undefined;

  beforeEach(() => {
    // The constructor requires a script tag with id="fTelnetScript"
    // (used for resolving asset paths). Synthesize one in jsdom.
    scriptTag = document.createElement('script');
    scriptTag.id = 'fTelnetScript';
    scriptTag.src = 'http://localhost/ftelnet.js';
    document.body.appendChild(scriptTag);

    // Container for the client to attach to.
    container = document.createElement('div');
    container.id = 'fTelnetContainer';
    document.body.appendChild(container);

    createdClient = undefined;
  });

  afterEach(() => {
    // If we created a client, stop its setInterval to avoid leaking
    // timers into other test files.
    if (createdClient !== undefined) {
      type WithTimer = { _Timer: ReturnType<typeof setInterval> | undefined };
      const priv = createdClient as unknown as WithTimer;
      if (priv._Timer !== undefined) {
        clearInterval(priv._Timer);
        priv._Timer = undefined;
      }
    }
    // Tear down DOM elements the constructor added directly to
    // document.body (the popup menu attaches there).
    document.body.removeChild(scriptTag);
    document.body.removeChild(container);
    // Drop any straggler menu popups added directly to body. Phase 2
    // Stage 5 turned the menu popup into <f-menu-popup>, so we look
    // for that tag (the inner .fTelnetMenuButtons div renders one
    // microtask later and would miss synchronous lookups anyway).
    for (const el of Array.from(document.getElementsByTagName('f-menu-popup'))) {
      el.remove();
    }
    // Drop the CSS link injections too.
    for (const id of ['fTelnetCss', 'fTelnetKeyboardCss']) {
      const el = document.getElementById(id);
      if (el !== null) {
        el.remove();
      }
    }
  });

  describe('construction', () => {
    it('builds without throwing given a valid container and options', () => {
      expect(() => {
        createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      }).not.toThrow();
    });

    it('attaches the client container and status bar to the host container', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());

      const clientContainers = container.getElementsByClassName('fTelnetClientContainer');
      expect(clientContainers.length).toBe(1);

      const statusBars = container.getElementsByTagName('f-status-bar');
      expect(statusBars.length).toBe(1);

      const scrollbacks = container.getElementsByTagName('f-scrollback-bar');
      expect(scrollbacks.length).toBe(1);

      // Focus warning is now a Lit component <f-focus-warning>.
      // Its inner .fTelnetFocusWarning div renders one microtask
      // later, so synchronous getElementsByClassName misses it.
      // Same applies to <f-scrollback-bar> and <f-status-bar>
      // above. The inner DOM is verified by each component's own
      // test file with `await updateComplete`.
      const focusWarnings = container.getElementsByTagName('f-focus-warning');
      expect(focusWarnings.length).toBe(1);
    });

    it('attaches the menu popup directly to document.body (not the container)', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());

      // Menu popup escapes the container's overflow clipping by
      // being a direct child of document.body. The inner
      // .fTelnetMenuButtons div renders one microtask later, so
      // we check for the custom-element tag.
      const popupsInContainer = container.getElementsByTagName('f-menu-popup');
      expect(popupsInContainer.length).toBe(0);

      const popupsInBody = document.body.getElementsByTagName('f-menu-popup');
      expect(popupsInBody.length).toBe(1);
    });

    it('injects the fTelnetCss link if missing', () => {
      expect(document.getElementById('fTelnetCss')).toBeNull();
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      expect(document.getElementById('fTelnetCss')).not.toBeNull();
    });

    it('throws when the container id does not exist', () => {
      // The constructor's error path also calls alert(). jsdom
      // implements alert as a no-op by default, so the throw is
      // observable but the alert won't fail the test.
      expect(() => {
        // eslint-disable-next-line no-new
        new fTelnetClient('nonexistentContainer', new fTelnetOptions());
      }).toThrow(/invalid container id/);
    });

    it('throws when the fTelnetScript tag is missing', () => {
      document.body.removeChild(scriptTag);
      expect(() => {
        // eslint-disable-next-line no-new
        new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      }).toThrow(/Script element with id="fTelnetScript" was not found/);
      // Re-add for afterEach.
      document.body.appendChild(scriptTag);
    });

    it('throws with a helpful message when options is undefined', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new fTelnetClient('fTelnetContainer', undefined as any);
      }).toThrow(/options parameter is required/);
    });
  });

  describe('emulation-specific defaults', () => {
    it('Atari emulation forces \\x9B Enter, Atari-Graphics font, 40 columns', () => {
      const opts = new fTelnetOptions();
      opts.Emulation = 'Atari';
      createdClient = new fTelnetClient('fTelnetContainer', opts);
      expect(opts.Enter).toBe('\x9B');
      expect(opts.Font).toBe('Atari-Graphics');
      expect(opts.ScreenColumns).toBe(40);
    });

    it('C64 emulation forces C64-Lower font and 40 columns', () => {
      const opts = new fTelnetOptions();
      opts.Emulation = 'C64';
      createdClient = new fTelnetClient('fTelnetContainer', opts);
      expect(opts.Font).toBe('C64-Lower');
      expect(opts.ScreenColumns).toBe(40);
    });

    it('RIP emulation forces RIP_8x8 font and 43 rows', () => {
      const opts = new fTelnetOptions();
      opts.Emulation = 'RIP';
      createdClient = new fTelnetClient('fTelnetContainer', opts);
      expect(opts.Font).toBe('RIP_8x8');
      expect(opts.ScreenRows).toBe(43);
    });

    it('empty emulation gets coerced to ansi-bbs', () => {
      const opts = new fTelnetOptions();
      opts.Emulation = '';
      createdClient = new fTelnetClient('fTelnetContainer', opts);
      expect(opts.Emulation).toBe('ansi-bbs');
    });
  });

  describe('public getters', () => {
    it('Connected returns false when no connection exists', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      expect(createdClient.Connected).toBe(false);
    });

    it('Connection returns undefined when no connection exists', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      expect(createdClient.Connection).toBeUndefined();
    });

    it('Crt returns the underlying Crt instance', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      expect(createdClient.Crt).toBeDefined();
      expect(typeof createdClient.Crt.WriteLn).toBe('function');
    });

    it('VirtualKeyboardVibrateDuration / Visible getters return the options values', () => {
      const opts = new fTelnetOptions();
      opts.VirtualKeyboardVibrateDuration = 100;
      createdClient = new fTelnetClient('fTelnetContainer', opts);
      expect(createdClient.VirtualKeyboardVibrateDuration).toBe(100);
      // Visible is whatever DetectMobileBrowser said — just verify
      // we get a boolean back.
      expect(typeof createdClient.VirtualKeyboardVisible).toBe('boolean');
    });
  });

  describe('lifecycle: Disconnect without prior Connect', () => {
    it('returns true and does not throw when no connection exists', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());
      expect(() => createdClient!.Disconnect(false)).not.toThrow();
      expect(createdClient.Disconnect(false)).toBe(true);
    });
  });

  describe('StuffInputBuffer', () => {
    // Note: we can't observe the keys via Crt.KeyPressed() / ReadKey()
    // here because the Crt's onkeypressed event fires synchronously
    // inside PushKeyPress and the client's listener drains the queue
    // immediately (forwarding chars to the active connection). With
    // no connection the chars are silently dropped, but the queue is
    // emptied either way. Instead, we spy on PushKeyPress directly
    // to verify each character is forwarded.
    it('calls PushKeyPress once per character in the input string', () => {
      createdClient = new fTelnetClient('fTelnetContainer', new fTelnetOptions());

      const crt = createdClient.Crt;
      const calls: Array<[number, number, boolean, boolean, boolean]> = [];
      const original = crt.PushKeyPress.bind(crt);
      crt.PushKeyPress = (
        charCode: number,
        keyCode: number,
        ctrl: boolean,
        alt: boolean,
        shift: boolean
      ): void => {
        calls.push([charCode, keyCode, ctrl, alt, shift]);
        original(charCode, keyCode, ctrl, alt, shift);
      };

      createdClient.StuffInputBuffer('Hi');

      expect(calls.length).toBe(2);
      expect(calls[0]).toEqual(['H'.charCodeAt(0), 0, false, false, false]);
      expect(calls[1]).toEqual(['i'.charCodeAt(0), 0, false, false, false]);
    });
  });
});
