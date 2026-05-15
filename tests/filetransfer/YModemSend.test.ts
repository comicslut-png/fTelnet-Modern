import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Crt } from '@crt/index.js';
import { WebSocketConnection } from '@connections/index.js';
import { YModemSend, YModemSendState, FileRecord } from '@filetransfer/index.js';

/*
  Smoke tests for YModemSend. See YModemReceive.test.ts for the
  scope rationale.
*/

describe('YModemSend', () => {
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
      expect(() => new YModemSend(crt, connection)).not.toThrow();
    });

    it('starts in the WaitingForHeaderRequest state', () => {
      const s = new YModemSend(crt, connection);
      type WithState = { _State: YModemSendState };
      const priv = s as unknown as WithState;
      expect(priv._State).toBe(YModemSendState.WaitingForHeaderRequest);
    });

    it('exposes an ontransfercomplete event', () => {
      const s = new YModemSend(crt, connection);
      expect(s.ontransfercomplete).toBeDefined();
      expect(typeof s.ontransfercomplete.on).toBe('function');
      expect(typeof s.ontransfercomplete.trigger).toBe('function');
    });
  });

  describe('Upload', () => {
    it('queues a file without showing the dialog when fileCount > 1', () => {
      // Per the original semantics, Upload(file, N) for the FIRST
      // call when N > 1 just enqueues. The dialog appears only on
      // the call that makes the queue length match fileCount.
      const s = new YModemSend(crt, connection);
      type WithFiles = { _Files: FileRecord[] };
      const priv = s as unknown as WithFiles;
      expect(priv._Files.length).toBe(0);

      // First file of a 2-file batch: queued but no dialog yet.
      s.Upload(new FileRecord('a.txt', 100), 2);
      expect(priv._Files.length).toBe(1);
    });

    it('builds the dialog and starts the timer once the queue is full', () => {
      const s = new YModemSend(crt, connection);
      type WithTimer = { _Timer: ReturnType<typeof setInterval> | undefined };
      const priv = s as unknown as WithTimer;
      expect(priv._Timer).toBeUndefined();

      // Single-file batch: dialog + timer kick in immediately.
      s.Upload(new FileRecord('a.txt', 100), 1);
      expect(priv._Timer).toBeDefined();

      // Clean up.
      if (priv._Timer !== undefined) {
        clearInterval(priv._Timer);
      }
    });
  });

  describe('independence between instances', () => {
    it('each YModemSend has its own _Files array', () => {
      const a = new YModemSend(crt, connection);
      const b = new YModemSend(crt, connection);
      type WithFiles = { _Files: FileRecord[] };
      const aFiles = (a as unknown as WithFiles)._Files;
      const bFiles = (b as unknown as WithFiles)._Files;
      expect(aFiles).not.toBe(bFiles);
    });
  });
});
