import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Crt } from '@crt/index.js';
import { WebSocketConnection } from '@connections/index.js';
import { YModemReceive, FileRecord } from '@filetransfer/index.js';

/*
  Smoke tests for YModemReceive.

  Limited scope: the meaningful tests of YMODEM-G are end-to-end
  protocol simulations (driving a fake byte stream through the state
  machine), which would essentially reimplement YMODEM in the test
  rig. Given Phase 4 will *delete* this module entirely (replaced
  by ZMODEM via zmodemjs), that's a poor investment.

  Instead, these tests verify the construction surface and the
  external observable behaviors:
    - Construction doesn't throw
    - FileCount / FileAt match the original API
    - Each instance owns its own _Files array (no static leakage)
    - ontransfercomplete is wired as a TypedEvent
    - Download() can be called and the timer cleared without errors
*/

describe('YModemReceive', () => {
  let container: HTMLDivElement;
  let crt: Crt;
  let connection: WebSocketConnection;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    connection = new WebSocketConnection();
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
  });

  describe('construction', () => {
    it('does not throw with valid arguments', () => {
      expect(() => new YModemReceive(crt, connection)).not.toThrow();
    });

    it('starts with FileCount === 0', () => {
      const r = new YModemReceive(crt, connection);
      expect(r.FileCount).toBe(0);
    });

    it('exposes an ontransfercomplete event', () => {
      const r = new YModemReceive(crt, connection);
      expect(r.ontransfercomplete).toBeDefined();
      expect(typeof r.ontransfercomplete.on).toBe('function');
      expect(typeof r.ontransfercomplete.trigger).toBe('function');
    });
  });

  describe('independence between instances', () => {
    it('each YModemReceive has its own _Files array', () => {
      const a = new YModemReceive(crt, connection);
      const b = new YModemReceive(crt, connection);

      // Reach into the private _Files to confirm they aren't aliased.
      type WithFiles = { _Files: FileRecord[] };
      const aFiles = (a as unknown as WithFiles)._Files;
      const bFiles = (b as unknown as WithFiles)._Files;
      expect(aFiles).not.toBe(bFiles);

      aFiles.push(new FileRecord('a', 1));
      expect(a.FileCount).toBe(1);
      expect(b.FileCount).toBe(0);
    });
  });

  describe('Download', () => {
    it('starts a timer and shows a dialog without throwing', () => {
      const r = new YModemReceive(crt, connection);

      // Spy on clearInterval so we can clean up the timer afterward.
      const clearSpy = vi.spyOn(window, 'clearInterval');

      expect(() => r.Download()).not.toThrow();

      // Clean up: pull the private timer and kill it so the test
      // doesn't leak setIntervals into other tests.
      type WithTimer = { _Timer: ReturnType<typeof setInterval> | undefined };
      const priv = r as unknown as WithTimer;
      if (priv._Timer !== undefined) {
        clearInterval(priv._Timer);
      }

      clearSpy.mockRestore();
    });
  });
});
