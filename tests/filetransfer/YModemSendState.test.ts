import { describe, it, expect } from 'vitest';
import { YModemSendState } from '@filetransfer/index.js';

describe('YModemSendState', () => {
  it('declares the five expected protocol states', () => {
    // Sanity-check the state machine has the states YModemSend
    // expects. The numeric values aren't externally observable
    // (the original used implicit enum values), but they need to
    // be distinct.
    const states = new Set([
      YModemSendState.WaitingForHeaderRequest,
      YModemSendState.WaitingForHeaderAck,
      YModemSendState.WaitingForFileRequest,
      YModemSendState.SendingData,
      YModemSendState.WaitingForFileAck,
    ]);
    expect(states.size).toBe(5);
  });

  it('first state (default for new sends) is WaitingForHeaderRequest', () => {
    // YModemSend initializes _State to this — confirmed in the
    // source. This test guards against accidentally changing the
    // declaration order, which would silently change the initial
    // state (since the original used implicit numeric values).
    expect(YModemSendState.WaitingForHeaderRequest).toBe(0);
  });
});
