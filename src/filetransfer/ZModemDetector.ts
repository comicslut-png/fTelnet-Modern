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

import { ZMODEM_AUTO_TRIGGER } from './ZModem.js';
import { ZmDebug } from './ZmDebug.js';

/**
 * Callbacks for ZModemDetector. The detector splits its input
 * byte stream into three sinks:
 *
 *   - "normal terminal output" (passed to onPassthrough)
 *   - "the moment ZMODEM begins" (onTrigger fires once with the
 *     6 trigger bytes — these are the start of a real ZRQINIT
 *     hex frame)
 *   - "ZMODEM body bytes" (onZmodemBytes fires repeatedly as
 *     subsequent bytes arrive, until reset() is called)
 *
 * Phase 4 Stage 6.
 */
export interface ZModemDetectorCallbacks {
  /**
   * Bytes that are not part of (and not a partial match for) the
   * ZMODEM trigger sequence. The caller forwards these to the
   * ANSI parser for normal rendering.
   *
   * May fire multiple times per `feed()` call as the detector
   * flushes accumulated non-match bytes.
   */
  onPassthrough?: (bytes: Uint8Array) => void;

  /**
   * The ZMODEM auto-trigger sequence was matched. Fires exactly
   * once per "watch session" (i.e. between reset() calls). The
   * `initialBytes` argument contains the trigger bytes themselves
   * (`**\x18B00`) — these are the start of a real ZRQINIT hex
   * frame and the caller should feed them to ZModemReceive.
   */
  onTrigger?: (initialBytes: Uint8Array) => void;

  /**
   * Bytes received AFTER the trigger has already fired. Fires
   * repeatedly as the ZMODEM session proceeds — these are the
   * rest of the ZRQINIT frame, then ZFILE, ZDATA, subpackets, etc.
   * The caller forwards them to ZModemReceive.feedBytes().
   *
   * No more onPassthrough or onTrigger calls happen until reset()
   * is invoked.
   */
  onZmodemBytes?: (bytes: Uint8Array) => void;
}

/**
 * Watches an incoming byte stream for the ZMODEM auto-trigger
 * sequence (`** \x18 B 0 0`, the start of a hex-encoded ZRQINIT
 * frame). When the full sequence is matched, fires onTrigger.
 * All non-matching bytes flow through to onPassthrough so the
 * ANSI parser can render them.
 *
 * The detector lives in front of the ANSI parser, examining every
 * byte from the connection. It's transparent during normal terminal
 * activity: bytes flow through with at most a 6-byte buffering
 * delay (the trigger sequence length) before being passed along.
 *
 * Once triggered, the detector switches to pass-through mode — all
 * subsequent bytes go directly to onTrigger so the caller can feed
 * them to a ZModemReceive instance. Call reset() when the ZMODEM
 * session ends to return to watching for the next trigger.
 *
 * Phase 4 Stage 6.
 */
export class ZModemDetector {
  /** The trigger sequence we're watching for. From ZModem.ts. */
  private static readonly TRIGGER = ZMODEM_AUTO_TRIGGER;

  private readonly _callbacks: ZModemDetectorCallbacks;

  /**
   * Number of consecutive trigger bytes we've matched so far.
   * 0 = not in a partial match.
   * N = matched bytes 0..N-1 of TRIGGER; next byte should be TRIGGER[N].
   * TRIGGER.length = full match (fires onTrigger then resets to triggered mode).
   */
  private _matchIndex = 0;

  /**
   * Whether the trigger has fired and we're now in pass-through-
   * to-ZMODEM mode. While true, all feed()d bytes go straight to
   * onTrigger; the matcher is disengaged until reset().
   */
  private _triggered = false;

  /**
   * Accumulator for bytes that aren't part of a partial trigger
   * match. Flushed to onPassthrough at the end of each feed() call
   * (or sooner if a partial match fails). Pre-allocated to a
   * reasonable size to avoid reallocation churn for typical chunks.
   */
  private _passBuffer: number[] = [];

  public constructor(callbacks: ZModemDetectorCallbacks = {}) {
    this._callbacks = callbacks;
  }

  /**
   * Feed bytes to the detector. They're either:
   *   - Passed through to onPassthrough (normal terminal output)
   *   - Held silently while a partial trigger match is in progress
   *   - Released to onPassthrough if the partial match fails
   *   - Released to onTrigger if the partial match completes
   *   - Passed directly to onTrigger if we're already triggered
   *
   * Input can be a string (in which case each character's char code
   * is used — the natural fit for the ANSI parser's existing byte-
   * as-char data flow), a Uint8Array, or a number array.
   */
  public feed(input: string | Uint8Array | number[]): void {
    ZmDebug.bytes('detector', 'feed()', input);
    if (this._triggered) {
      // Already in ZMODEM mode — pass everything straight through.
      this._callbacks.onZmodemBytes?.(toUint8Array(input));
      return;
    }

    if (typeof input === 'string') {
      for (let i = 0; i < input.length; i++) {
        this.feedByte(input.charCodeAt(i) & 0xff);
        // If feedByte triggered, the rest of the string goes
        // directly to onZmodemBytes.
        if (this._triggered) {
          const rest = input.substring(i + 1);
          if (rest.length > 0) {
            this._callbacks.onZmodemBytes?.(toUint8Array(rest));
          }
          break;
        }
      }
    } else {
      for (let i = 0; i < input.length; i++) {
        this.feedByte(input[i]!);
        if (this._triggered) {
          // Slice the remaining bytes and pass them to onZmodemBytes.
          if (i + 1 < input.length) {
            const rest = input instanceof Uint8Array
              ? input.subarray(i + 1)
              : new Uint8Array(input.slice(i + 1));
            this._callbacks.onZmodemBytes?.(rest);
          }
          break;
        }
      }
    }

    // Flush any accumulated passthrough bytes.
    this.flushPassthrough();
  }

  /**
   * Reset the detector to look for a new trigger. Called by the
   * caller when a ZMODEM session ends and normal terminal flow
   * should resume.
   */
  public reset(): void {
    this._matchIndex = 0;
    this._triggered = false;
    this._passBuffer.length = 0;
  }

  /**
   * Is the detector currently in triggered (passing-to-ZMODEM) state?
   */
  public get triggered(): boolean {
    return this._triggered;
  }

  // ───────────────────── internals ─────────────────────

  private feedByte(b: number): void {
    const expected = ZModemDetector.TRIGGER[this._matchIndex]!;

    if (b === expected) {
      // Bytes that are part of a (possibly complete) trigger match
      // aren't added to the passthrough buffer — they're held until
      // we know whether the match succeeds.
      this._matchIndex++;

      if (this._matchIndex === ZModemDetector.TRIGGER.length) {
        // Full match. The trigger bytes themselves are part of the
        // real ZRQINIT frame the sender is starting — feed them to
        // onTrigger so the ZMODEM decoder sees them. They are NOT
        // sent to passthrough.
        this._triggered = true;
        ZmDebug.log('detector', 'TRIGGER FIRED');
        this.flushPassthrough(); // flush any pre-trigger normal bytes first
        this._callbacks.onTrigger?.(new Uint8Array(ZModemDetector.TRIGGER));
        // Caller code calls .feed(rest_of_buffer) which we'll handle
        // via the `_triggered` flag.
        return;
      }
      // Partial match in progress — keep waiting for the next byte.
      return;
    }

    // Mismatch. The bytes we held thinking they might be a trigger
    // turn out to be normal terminal output. Release them.
    if (this._matchIndex > 0) {
      for (let i = 0; i < this._matchIndex; i++) {
        this._passBuffer.push(ZModemDetector.TRIGGER[i]!);
      }
      this._matchIndex = 0;
    }

    // Now consider whether THIS byte starts a new match. Common case:
    // we held one '*' but the next byte was something else; if that
    // something else is itself '*', it might start a NEW match.
    if (b === ZModemDetector.TRIGGER[0]) {
      this._matchIndex = 1;
    } else {
      this._passBuffer.push(b);
    }
  }

  private flushPassthrough(): void {
    if (this._passBuffer.length === 0) return;
    const out = new Uint8Array(this._passBuffer);
    this._passBuffer.length = 0;
    this._callbacks.onPassthrough?.(out);
  }
}

/** Convert various input shapes to Uint8Array for callback emission. */
function toUint8Array(input: string | Uint8Array | number[]): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input.charCodeAt(i) & 0xff;
    return out;
  }
  return new Uint8Array(input);
}
