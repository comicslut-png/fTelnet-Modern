/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) Rick Parrish, R&M Software

  This file is part of fTelnet.

  fTelnet is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  fTelnet is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with fTelnet.  If not, see <http://www.gnu.org/licenses/>.
*/

import type { ByteArray } from '../common/index.js';
import { RLoginCommand } from './RLoginCommand.js';
import { RLoginNegotiationState } from './RLoginNegotiationState.js';
import { WebSocketConnection } from './WebSocketConnection.js';

/**
 * RLogin protocol connection (RFC 1282).
 *
 * Much simpler than telnet — the only inline control sequence the
 * client needs to recognize is the in-band window-size update, which
 * fTelnet currently ignores (we negotiate window size at connect time
 * and don't expect it to change mid-session).
 *
 * The handshake sequence is: server sends `\xFF \xFF s s` followed by
 * 8 bytes of window-size data. After those 8 bytes we return to passing
 * data through unchanged.
 *
 * Phase 1 migration notes: no behavioral changes; just `var`→`const`,
 * tighter types, and adoption of the new `WebSocketConnection` base.
 */
export class RLoginConnection extends WebSocketConnection {
  private _negotiationState: RLoginNegotiationState = RLoginNegotiationState.Data;
  private _ssBytes = 0;

  public override NegotiateInbound(data: ByteArray): void {
    while (data.bytesAvailable > 0) {
      const b = data.readUnsignedByte();
      this._negotiationState = this.stepNegotiation(b);
    }
  }

  /**
   * One byte of input through the RLogin state machine.
   * Pulled out as a method for testability — the same pattern used in
   * TelnetConnection.
   */
  private stepNegotiation(b: number): RLoginNegotiationState {
    switch (this._negotiationState) {
      case RLoginNegotiationState.Data:
        if (b === RLoginCommand.Cookie) {
          return RLoginNegotiationState.Cookie1;
        }
        this._InputBuffer.writeByte(b);
        return RLoginNegotiationState.Data;

      case RLoginNegotiationState.Cookie1:
        if (b === RLoginCommand.Cookie) {
          return RLoginNegotiationState.Cookie2;
        }
        // Not actually a control sequence; treat as data and resync.
        // (We have lost the first 0xFF here; that matches the original
        // behavior, which also silently swallowed it.)
        return RLoginNegotiationState.Data;

      case RLoginNegotiationState.Cookie2:
        if (b === RLoginCommand.S) {
          return RLoginNegotiationState.S1;
        }
        return RLoginNegotiationState.Data;

      case RLoginNegotiationState.S1:
        if (b === RLoginCommand.S) {
          this._ssBytes = 0;
          return RLoginNegotiationState.SS;
        }
        return RLoginNegotiationState.Data;

      case RLoginNegotiationState.SS:
        // 8 bytes of window-size data follow; we read but discard them.
        this._ssBytes += 1;
        if (this._ssBytes >= 8) {
          this._ssBytes = 0;
          return RLoginNegotiationState.Data;
        }
        return RLoginNegotiationState.SS;

      default:
        return RLoginNegotiationState.Data;
    }
  }
}
