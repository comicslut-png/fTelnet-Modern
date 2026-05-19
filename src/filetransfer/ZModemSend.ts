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

import {
  ZRINIT, ZRPOS, ZFILE, ZACK, ZSKIP, ZABORT, ZNAK, ZFIN, ZEOF,
  ZCRCE, ZCRCG, ZCRCW,
  CANFC32,
} from './ZModem.js';
import { ZModemDecoder, type ZModemDecoderEvents } from './ZModemDecoder.js';
import { ZModemEncoder } from './ZModemEncoder.js';
import { ZModemHeader } from './ZModemHeader.js';

/**
 * A file the caller wants to send. The state machine doesn't read
 * from disk or the File API — the caller is responsible for
 * materializing the bytes (e.g. `await file.arrayBuffer()` in a
 * browser context) before constructing the send session.
 *
 * For typical BBS uploads (<10MB) this is fine; the file lives in
 * memory twice (browser's File object + our reference). Streaming
 * from disk would require an async chunk-fetch API and we'd defer
 * that to Phase 5 if anyone ever sends 100MB+ files.
 *
 * Phase 4 Stage 5.
 */
export interface ZModemFileToSend {
  /** Filename as it'll appear on the receiver. May contain a relative path. */
  name: string;
  /** Full file contents. */
  data: Uint8Array;
  /**
   * Modification time. If omitted, the wire metadata sends "0"
   * (which most receivers interpret as "unknown, use now()").
   */
  mtime?: Date;
  /**
   * UNIX file mode (permission bits). If omitted, sends "0" which
   * UNIX receivers will interpret as their umask default and
   * non-UNIX receivers ignore.
   */
  mode?: number;
}

/**
 * Callbacks for the send state machine. Mirror of
 * ZModemReceiveCallbacks. All optional.
 */
export interface ZModemSendCallbacks {
  /**
   * Bytes the state machine wants to write to the wire. Caller
   * forwards them to Connection. Only outbound side-effect; no
   * direct Connection coupling.
   */
  onBytesToSend?: (bytes: Uint8Array) => void;

  /**
   * A new file is starting. Fires when the state machine begins
   * sending ZFILE for this file (i.e. immediately after the
   * previous file's completion, or after the initial ZRINIT).
   */
  onFileStart?: (file: ZModemFileToSend) => void;

  /**
   * Current file's bytes have all been sent and acknowledged.
   * Fires after ZEOF for that file.
   */
  onFileComplete?: (file: ZModemFileToSend) => void;

  /**
   * Progress update — fires after each subpacket is sent. `sent`
   * is bytes-sent-for-this-file; `total` is the file's size.
   */
  onProgress?: (sent: number, total: number) => void;

  /**
   * Whole batch completed: all files sent and ZFIN exchanged.
   * State machine is in ENDED after this.
   */
  onSessionComplete?: () => void;

  /**
   * Unrecoverable error (receiver aborted, out-of-band CAN
   * storm, user-initiated abort). State machine is in ENDED.
   */
  onError?: (message: string) => void;
}

/**
 * Internal sender states.
 */
enum SendState {
  /** Not started. */
  IDLE,
  /** Sent ZRQINIT, waiting for receiver's ZRINIT. */
  WAITING_FOR_ZRINIT,
  /** Sent ZFILE + metadata subpacket, waiting for ZRPOS to start data. */
  WAITING_FOR_ZRPOS,
  /** Pumping ZDATA + subpackets. */
  SENDING_DATA,
  /**
   * Delta 2.11: After receiving a ZRPOS during streaming, we sent a
   * single ZCRCW subpacket and are now waiting for a matching ZACK.
   * Per ZMODEM spec (zmodem.doc § 9.3):
   *
   *   "The next transmitted data frame should be a ZCRCW frame
   *    followed by a wait to guarantee complete flushing of the
   *    network's memory. If the receiver gets a ZACK header with an
   *    address that disagrees with the sender address, it is
   *    ignored, and the sender waits for another header."
   *
   * In this state we ignore additional ZRPOSes (they're echoes of
   * pre-resync errors arriving late). When a matching ZACK arrives,
   * we transition back to SENDING_DATA and resume streaming with
   * ZCRCG subpackets.
   */
  WAITING_FOR_RESYNC_ZACK,
  /** Sent ZEOF, waiting for receiver's ZRINIT (next file) or ZRPOS (resume). */
  WAITING_AFTER_ZEOF,
  /** Sent ZFIN to wrap up; waiting for receiver's ZFIN. */
  WAITING_FOR_ZFIN_ACK,
  /** Terminal. */
  ENDED,
}

/**
 * ZMODEM send state machine.
 *
 * Mirror of ZModemReceive. Caller provides:
 *   - a list of files (each with name + Uint8Array of bytes)
 *   - callbacks for outbound bytes + progress + completion
 *
 * State machine handles:
 *   - Initial handshake (send ZRQINIT, wait for ZRINIT)
 *   - Capability negotiation (detect CANFC32 in ZRINIT and use
 *     CRC-32 for the data subpackets if supported)
 *   - File announcement (ZFILE + filename/metadata subpacket)
 *   - Data streaming (ZDATA + 1024-byte ZCRCG subpackets + final ZCRCE)
 *   - Per-file ZEOF
 *   - Multi-file batch (loop through ZFILE/ZDATA/ZEOF for each)
 *   - End-of-batch ZFIN exchange
 *   - "OO" trailer after final ZFIN
 *   - Error handling: receiver ZABORT, receiver ZSKIP, receiver
 *     ZNAK (resend last header), receiver ZRPOS (resume from
 *     given position — backwards or sideways)
 *   - User-initiated abort via abort()
 *   - Out-of-band 5-CAN storm from receiver
 *
 * Subpacket strategy:
 *   - 1024 bytes per subpacket (the ZMODEM classic default)
 *   - ZCRCG for all subpackets except the last in a ZDATA frame
 *   - ZCRCE for the final subpacket before ZEOF
 *   - No ZCRCQ/ZCRCW — we don't currently need flow-control ACKs
 *     since modern BBSes over reliable TCP don't backpressure us.
 *     If we ever hit a sender that needs them, this is the place
 *     to add periodic ZCRCQ subpackets.
 *
 * Resume: if the receiver sends ZRPOS with a non-zero position
 * (typically because they have a partial file from a previous
 * attempt), we honor it and start ZDATA from that offset. If the
 * position is beyond the file's size, we treat it as "skip this
 * file" and move on.
 *
 * Phase 4 Stage 5.
 */
export class ZModemSend {
  /** Standard ZMODEM subpacket size. lrzsz uses 1024. */
  private static readonly SUBPACKET_SIZE = 1024;

  private _state: SendState = SendState.IDLE;
  private readonly _callbacks: ZModemSendCallbacks;
  private readonly _decoder: ZModemDecoder;
  private readonly _files: ZModemFileToSend[];

  /** Index into _files for the currently-active file. */
  private _fileIndex = 0;
  /** Current send position within the active file (also the ZDATA offset). */
  private _position = 0;

  /**
   * Delta 2.11: position from the most recent ZRPOS we acted on.
   * Used to distinguish stale repeated ZRPOSes (same position,
   * retries from the receiver while it waits for our response)
   * from fresh ZRPOSes (different position — the receiver detected
   * another error and wants us to restart from somewhere else).
   *
   * `-1` means we haven't acted on any ZRPOS yet.
   */
  private _lastActedZRPOS = -1;

  /**
   * Delta 2.11: end-offset of the ZCRCW resync subpacket we sent
   * after a ZRPOS. While in `WAITING_FOR_RESYNC_ZACK` state, we
   * wait for a ZACK at exactly this position. Per ZMODEM spec §9.3,
   * ZACKs at a different position are ignored.
   *
   * `-1` means we're not waiting for a resync ZACK.
   */
  private _resyncEndOffset = -1;

  /**
   * Delta 2.13: timer handle for the resync ZACK wait. If no ZACK
   * arrives within `RESYNC_ZACK_TIMEOUT_MS`, our resync ZCRCW
   * probably got corrupted in flight — re-send it.
   *
   * PCBoard's silent behavior on lost resync subpackets is what
   * stalled previous traces. The retry kicks the pipe back into
   * life.
   */
  private _resyncTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Delta 2.13: how many times in a row we've retried the same
   * resync without getting a ZACK. After `RESYNC_MAX_RETRIES`,
   * we give up and fail the transfer rather than spinning forever.
   */
  private _resyncRetryCount = 0;

  private static readonly RESYNC_ZACK_TIMEOUT_MS = 2000;
  private static readonly RESYNC_MAX_RETRIES = 5;

  /**
   * Whether we're using CRC-32 for subpackets. Set after parsing
   * the receiver's ZRINIT capability flags. Default true; we
   * advertise CANFC32 in our own ZRINIT (when we're the receiver)
   * and most senders use it as a baseline.
   */
  private _useCrc32 = false;

  /** Last header sent. Resent on ZNAK. */
  private _lastSent: Uint8Array | null = null;

  /** Out-of-band CAN counter for abort detection from receiver. */
  private _consecutiveCans = 0;

  public constructor(
    files: ZModemFileToSend[],
    callbacks: ZModemSendCallbacks = {},
  ) {
    this._files = files;
    this._callbacks = callbacks;

    const decoderEvents: ZModemDecoderEvents = {
      onHeader: (h) => this.handleHeader(h),
      onSubpacketData: () => { /* sender doesn't expect subpackets in */ },
      onSubpacketEnd: () => { /* same */ },
      onHeaderError: (msg) => this.handleHeaderError(msg),
      onGarbage: () => { /* receiver chatter; ignored */ },
    };
    this._decoder = new ZModemDecoder(decoderEvents);
  }

  /**
   * Begin the send session. Sends ZRQINIT to wake the receiver.
   * Idempotent.
   */
  public start(): void {
    if (this._state !== SendState.IDLE) return;
    if (this._files.length === 0) {
      // Nothing to send. Just complete immediately.
      this._state = SendState.ENDED;
      this._callbacks.onSessionComplete?.();
      return;
    }
    this._state = SendState.WAITING_FOR_ZRINIT;
    const initBytes = ZModemEncoder.buildZRQINIT();
    this._lastSent = initBytes;
    this.sendBytes(initBytes);
  }

  /**
   * Feed bytes received from the wire (receiver's side of the
   * conversation). State machine advances based on what it sees.
   *
   * Bytes received in ENDED state are silently dropped.
   */
  public feedBytes(bytes: Uint8Array | number[]): void {
    if (this._state === SendState.ENDED) return;

    // Watch for the out-of-band 5+CAN abort sequence the way
    // ZModemReceive does. Receivers may send this if they want to
    // abort mid-stream and the in-band ZABORT didn't make it
    // through, or the receiver crashed.
    for (let i = 0; i < bytes.length; i++) {
      const b = (bytes as Uint8Array | number[])[i]!;
      if (b === 0x18) {
        this._consecutiveCans++;
        if (this._consecutiveCans >= 5) {
          this.fail('receiver aborted (out-of-band CAN sequence)');
          return;
        }
      } else {
        this._consecutiveCans = 0;
      }
    }

    this._decoder.feed(bytes);
  }

  /**
   * User-initiated abort. Sends the out-of-band abort sequence
   * (8 CANs + 10 backspaces) so the receiver tears down immediately,
   * then transitions to ENDED.
   */
  public abort(): void {
    if (this._state === SendState.ENDED) return;
    // Delta 2.13: clear any pending resync retry timer so it
    // doesn't fire and try to send bytes on a torn-down session.
    if (this._resyncTimer !== null) {
      clearTimeout(this._resyncTimer);
      this._resyncTimer = null;
    }
    this.sendBytes(ZModemEncoder.buildAbortSequence());
    this._state = SendState.ENDED;
    this._callbacks.onError?.('aborted by user');
  }

  /** Current state, for testing/debugging. */
  public get state(): string {
    return SendState[this._state]!;
  }

  // ─────────────────────── header dispatch ───────────────────────

  private handleHeader(h: ZModemHeader): void {
    switch (h.type) {
      case ZRINIT:
        this.handleZRINIT(h);
        break;

      case ZRPOS:
        // Delta 2.11: protocol-correct resync handshake.
        //
        // Per ZMODEM spec §9.3:
        //   "A ZRPOS header resets the sender's file offset to the
        //    correct position. ... The next transmitted data frame
        //    should be a ZCRCW frame followed by a wait to guarantee
        //    complete flushing of the network's memory."
        //
        // And from the zmodem.js CHANGELOG:
        //   "Ignore extra ZRPOS if received while sending a file."
        //
        // We distinguish STALE repeated ZRPOSes (receiver retrying at
        // the SAME position while waiting on our response) from FRESH
        // ZRPOSes (receiver detected another error, asking us to
        // restart at a DIFFERENT position).
        //
        // While in WAITING_FOR_RESYNC_ZACK, ignore ZRPOSes at the same
        // position we just acted on. ZRPOSes at a new position mean
        // the resync itself failed and the receiver wants us to try
        // again from somewhere else.
        if (
          this._state === SendState.WAITING_FOR_RESYNC_ZACK &&
          h.getPosition() === this._lastActedZRPOS
        ) {
          // Stale repeat — ignore.
          break;
        }
        this.handleZRPOS(h);
        break;

      case ZACK: {
        // Delta 2.11: ZACK is meaningful when we're waiting for a
        // resync confirmation after sending a ZCRCW post-ZRPOS.
        //
        // Per spec §9.3:
        //   "If the receiver gets a ZACK header with an address that
        //    disagrees with the sender address, it is ignored, and
        //    the sender waits for another header."
        //
        // (Note: the spec wording is from the receiver's POV but the
        // intent is: only treat a ZACK whose position matches our
        // resync target as a valid resume signal.)
        if (this._state === SendState.WAITING_FOR_RESYNC_ZACK) {
          if (h.getPosition() === this._resyncEndOffset) {
            // Resync confirmed. ZCRCW closed the frame, so before
            // resuming with ZCRCG subpackets we must send a fresh
            // ZDATA header to open a new frame. `sendZDATAAndPump`
            // does both: emits ZDATA at current _position and then
            // pumps the next subpacket.
            //
            // Delta 2.11.1 fix: previously we called
            // _pumpNextSubpacket directly here, which sent a bare
            // ZCRCG subpacket without a preceding ZDATA header. The
            // receiver (PCBoard) saw what looked like garbage bytes
            // after the closed ZCRCW frame and either silently
            // discarded them or got stuck waiting for a new header.
            this._resyncEndOffset = -1;
            this._resyncRetryCount = 0;
            if (this._resyncTimer !== null) {
              clearTimeout(this._resyncTimer);
              this._resyncTimer = null;
            }
            this._state = SendState.SENDING_DATA;
            this.sendZDATAAndPump();
          }
          // else: stale ACK at a different position — ignore, wait
          // for the next header.
        }
        // In other states ZACK is a no-op (we don't use ZCRCQ for
        // periodic polling; only ZCRCW for resync).
        break;
      }

      case ZSKIP:
        this.handleZSKIP();
        break;

      case ZABORT:
        this.fail('receiver sent ZABORT');
        break;

      case ZFIN:
        this.handleZFIN();
        break;

      case ZNAK:
        // Receiver didn't like our last header. Resend it.
        if (this._lastSent !== null) {
          this.sendBytes(this._lastSent);
        }
        break;

      default:
        // Unknown / unexpected header — ignore. Don't try to
        // interpret things like ZRQINIT (which would mean the
        // receiver thinks they're the sender — protocol confusion
        // we can't recover from).
        break;
    }
  }

  /**
   * Receiver's ZRINIT — they're ready, here are their capabilities.
   * This is the first thing we expect after ZRQINIT. Subsequent
   * ZRINITs during the session mean "I'm ready for the next file."
   */
  private handleZRINIT(h: ZModemHeader): void {
    const flags = h.getCapabilityFlags();
    this._useCrc32 = (flags & CANFC32) !== 0;

    if (this._state === SendState.WAITING_FOR_ZRINIT) {
      // Session-initial ZRINIT. Start the first file.
      this.startCurrentFile();
    } else if (this._state === SendState.WAITING_AFTER_ZEOF) {
      // Per-file ZRINIT means receiver acknowledged ZEOF and is
      // ready for the next file. Advance.
      this._callbacks.onFileComplete?.(this._files[this._fileIndex]!);
      this._fileIndex++;
      if (this._fileIndex < this._files.length) {
        this.startCurrentFile();
      } else {
        // All files done; send ZFIN to wrap up.
        this._state = SendState.WAITING_FOR_ZFIN_ACK;
        this.sendBytes(ZModemEncoder.buildZFIN());
      }
    }
  }

  /**
   * Receiver's ZRPOS — they want us to start (or restart) sending
   * data from a given offset. Sent right after we send ZFILE
   * (to start the file) or after a CRC error to ask for resume.
   */
  private handleZRPOS(h: ZModemHeader): void {
    const position = h.getPosition();
    const file = this._files[this._fileIndex];
    if (file === undefined) {
      // ZRPOS with no active file — shouldn't happen. Bail.
      this.fail('ZRPOS with no active file');
      return;
    }

    if (position > file.data.length) {
      // Receiver wants to resume from beyond the end of our file.
      // Interpret as "skip this file" — they probably have a newer
      // version already.
      this.handleZSKIP();
      return;
    }

    // Delta 2.13: a NEW ZRPOS at a different position resets the
    // retry counter (we're starting a fresh resync attempt, not
    // continuing the previous one). Also clear any pending retry
    // timer so it doesn't fire after we've already moved on.
    if (this._resyncTimer !== null) {
      clearTimeout(this._resyncTimer);
      this._resyncTimer = null;
    }
    if (position !== this._lastActedZRPOS) {
      this._resyncRetryCount = 0;
    }

    this._position = position;
    this._lastActedZRPOS = position;

    // Delta 2.11: distinguish between the INITIAL ZRPOS (which kicks
    // off data transfer after we send ZFILE) and a RESYNC ZRPOS (which
    // arrives mid-stream after the receiver detects a CRC error).
    //
    // Per ZMODEM spec §9.3, a mid-stream ZRPOS requires:
    //   1. Send ZDATA at the new offset
    //   2. Send EXACTLY ONE subpacket with ZCRCW marker
    //   3. Wait for ZACK at the matching position before resuming
    //
    // This handshake gives stale data in the network buffers time to
    // drain at the receiver before more streaming subpackets arrive.
    // Without it, post-ZRPOS subpackets get interleaved with stale
    // pre-ZRPOS subpackets at the receiver, triggering more CRC errors
    // and more ZRPOSes — a cascade we observed in Delta 2.10's trace.
    const isInitial = this._state === SendState.WAITING_FOR_ZRPOS;
    this._state = SendState.SENDING_DATA;
    if (isInitial) {
      // Initial trigger — start normal streaming.
      this.sendZDATAAndPump();
    } else {
      // Mid-stream resync — ZDATA + single ZCRCW + wait for matching
      // ZACK.
      this._sendResyncFrame();
    }
  }

  /**
   * Delta 2.11: send a ZDATA header + a single ZCRCW subpacket to
   * resync after a mid-stream ZRPOS. After this completes, we wait
   * for a ZACK at the matching offset before resuming streaming.
   */
  private _sendResyncFrame(): void {
    const file = this._files[this._fileIndex];
    if (file === undefined) return;

    // ZDATA header at current position.
    const zdataData: [number, number, number, number] = [
      this._position & 0xff,
      (this._position >>> 8) & 0xff,
      (this._position >>> 16) & 0xff,
      (this._position >>> 24) & 0xff,
    ];
    const zdata = this._useCrc32
      ? ZModemEncoder.buildBin32Header(0x0a /* ZDATA */, zdataData, true)
      : ZModemEncoder.buildBin16Header(0x0a, zdataData, true);
    this._lastSent = zdata;
    this.sendBytes(zdata);

    // One subpacket with ZCRCW marker. Spec says "ZCRCW data
    // subpackets expect a ZACK header before the next frame is
    // sent" — exactly the synchronization we need post-ZRPOS.
    //
    // Subpacket size: use the smaller of SUBPACKET_SIZE and the
    // remaining file bytes, so we don't overshoot the file end.
    // If the receiver's ZRPOS is at or near end-of-file, send a
    // short subpacket. If even one byte is available we send one
    // ZCRCW subpacket; if zero bytes remain (ZRPOS at exact EOF),
    // we skip directly to ZEOF.
    const remaining = file.data.length - this._position;
    if (remaining <= 0) {
      // ZRPOS at exact end-of-file — receiver wants ZEOF.
      this._sendZEOF(file);
      return;
    }

    const chunkSize = Math.min(ZModemSend.SUBPACKET_SIZE, remaining);
    const chunk = file.data.subarray(
      this._position,
      this._position + chunkSize,
    );
    const subpacket = this._useCrc32
      ? ZModemEncoder.buildSubpacketCrc32(chunk, ZCRCW, true)
      : ZModemEncoder.buildSubpacketCrc16(chunk, ZCRCW, true);
    this.sendBytes(subpacket);

    // Bookkeeping: we've SENT bytes through (_position + chunkSize),
    // and we expect a ZACK with that offset. Note _position is NOT
    // advanced yet — when the ZACK arrives confirming sync, the
    // resumed pump will start from (_position + chunkSize).
    this._resyncEndOffset = this._position + chunkSize;
    this._position = this._resyncEndOffset;
    this._callbacks.onProgress?.(this._position, file.data.length);

    // If the resync subpacket happens to be the last one in the file,
    // proceed to ZEOF without further pumping. The receiver's ZACK
    // here would normally let us continue streaming, but there's
    // nothing left to stream.
    if (this._position >= file.data.length) {
      this._sendZEOF(file);
      return;
    }

    this._state = SendState.WAITING_FOR_RESYNC_ZACK;

    // Delta 2.13: arm the retry timer. If no ZACK arrives within
    // RESYNC_ZACK_TIMEOUT_MS, our ZCRCW resync probably got dropped
    // somewhere in the pipeline. Re-send it (up to RESYNC_MAX_RETRIES
    // times) before giving up.
    this._armResyncRetryTimer();
  }

  /**
   * Delta 2.13: arm or re-arm the resync-ZACK retry timer.
   * Cleared in the ZACK handler on a matching ZACK, or in
   * `endSession`-style paths.
   */
  private _armResyncRetryTimer(): void {
    if (this._resyncTimer !== null) {
      clearTimeout(this._resyncTimer);
    }
    this._resyncTimer = setTimeout(() => {
      this._resyncTimer = null;
      // Only act if we're still actually waiting for the resync ACK.
      // (A ZACK or ZRPOS at a new position could have raced us.)
      if (this._state !== SendState.WAITING_FOR_RESYNC_ZACK) return;

      this._resyncRetryCount++;
      if (this._resyncRetryCount > ZModemSend.RESYNC_MAX_RETRIES) {
        this.fail(
          `resync stalled at position ${this._lastActedZRPOS} ` +
          `(no ZACK after ${ZModemSend.RESYNC_MAX_RETRIES} retries)`,
        );
        return;
      }
      // Rewind _position back to where the resync was supposed to
      // start, so the re-send sends the same chunk again. _sendResyncFrame
      // will advance _position to _resyncEndOffset again.
      this._position = this._lastActedZRPOS;
      this._sendResyncFrame();
    }, ZModemSend.RESYNC_ZACK_TIMEOUT_MS);
  }

  private handleZSKIP(): void {
    // Receiver wants to skip the current file. Fire complete (with
    // the partial position) and move to the next file.
    const file = this._files[this._fileIndex];
    if (file !== undefined) {
      this._callbacks.onFileComplete?.(file);
    }
    this._fileIndex++;
    if (this._fileIndex < this._files.length) {
      this.startCurrentFile();
    } else {
      this._state = SendState.WAITING_FOR_ZFIN_ACK;
      this.sendBytes(ZModemEncoder.buildZFIN());
    }
  }

  private handleZFIN(): void {
    if (this._state === SendState.WAITING_FOR_ZFIN_ACK) {
      // Final ZFIN exchange done. Send "OO" trailer per protocol
      // and end the session.
      this.sendBytes(new Uint8Array([0x4f, 0x4f]));
      this._state = SendState.ENDED;
      this._callbacks.onSessionComplete?.();
    }
    // ZFIN at unexpected times — ignore (legacy senders sometimes
    // send extras).
  }

  private handleHeaderError(_msg: string): void {
    // Receiver's header CRC was wrong on our end — they're
    // sending corrupted bytes. Send ZNAK to ask for retransmit.
    this.sendBytes(ZModemEncoder.buildZNAK());
  }

  // ─────────────────────── per-file flow ───────────────────────

  /**
   * Begin sending the file at `_fileIndex`. Sends ZFILE + the
   * metadata subpacket; receiver should reply with ZRPOS.
   */
  private startCurrentFile(): void {
    const file = this._files[this._fileIndex];
    if (file === undefined) {
      // Shouldn't happen — caller should have already transitioned
      // to ZFIN. Defensive bail.
      this._state = SendState.ENDED;
      return;
    }

    this._position = 0;
    this._resyncEndOffset = -1;
    this._lastActedZRPOS = -1;
    this._resyncRetryCount = 0;
    if (this._resyncTimer !== null) {
      clearTimeout(this._resyncTimer);
      this._resyncTimer = null;
    }
    this._callbacks.onFileStart?.(file);

    // Build the ZFILE header. The 4 ZP bytes carry conversion /
    // management / transport flags; we send all zeros (matches
    // what lrzsz does by default).
    const zfileHeader = this._useCrc32
      ? ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0], /*escctl*/ true)
      : ZModemEncoder.buildBin16Header(ZFILE, [0, 0, 0, 0], /*escctl*/ true);
    this._lastSent = zfileHeader;
    this.sendBytes(zfileHeader);

    // Then the metadata subpacket: filename\0size mtime mode serial nfiles ntotal\0
    const metaBytes = this.buildFileMetaPayload(file);
    const metaSubpacket = this._useCrc32
      ? ZModemEncoder.buildSubpacketCrc32(metaBytes, 0x6b, /*escctl*/ true) // ZCRCW
      : ZModemEncoder.buildSubpacketCrc16(metaBytes, 0x6b, /*escctl*/ true);
    this.sendBytes(metaSubpacket);

    this._state = SendState.WAITING_FOR_ZRPOS;
  }

  /**
   * Build the wire bytes for a ZFILE's filename + metadata.
   * Format: filename\0size mtime mode serial nfiles ntotal\0
   *
   * - size: decimal bytes
   * - mtime: octal UNIX seconds (0 = unknown)
   * - mode: octal UNIX mode (0 = unknown)
   * - serial: conventionally 0
   * - nfiles: remaining files in batch (informational; we send
   *   total-current as an approximation)
   * - ntotal: total bytes across remaining files
   */
  private buildFileMetaPayload(file: ZModemFileToSend): number[] {
    const mtimeOctal = file.mtime
      ? Math.floor(file.mtime.getTime() / 1000).toString(8)
      : '0';
    const modeOctal = file.mode !== undefined && file.mode > 0
      ? file.mode.toString(8)
      : '0';

    // Remaining files including this one
    const filesRemaining = this._files.length - this._fileIndex;
    // Total bytes across remaining files
    let bytesRemaining = 0;
    for (let i = this._fileIndex; i < this._files.length; i++) {
      bytesRemaining += this._files[i]!.data.length;
    }

    const meta = `${file.data.length} ${mtimeOctal} ${modeOctal} 0 ${filesRemaining} ${bytesRemaining}`;

    const out: number[] = [];
    // Filename as UTF-8 bytes
    const nameBytes = new TextEncoder().encode(file.name);
    for (let i = 0; i < nameBytes.length; i++) out.push(nameBytes[i]!);
    out.push(0); // NUL separator
    for (let i = 0; i < meta.length; i++) out.push(meta.charCodeAt(i));
    out.push(0); // trailing NUL
    return out;
  }

  /**
   * Send a ZDATA header at the current position, then pump the
   * file's bytes through as subpackets until the file is fully
   * sent. After the last subpacket (with ZCRCE marker), send
   * ZEOF.
   *
   * Phase-5 evolution (Deltas 2.1 → 2.8):
   *
   * We went through several pump strategies trying to get reliable
   * uploads against PCBoard via fTelnetProxy. The final approach,
   * informed by FGasper's zmodemjs (Apache 2.0):
   *
   *   - Send ZDATA header once at the start (or on ZRPOS restart)
   *   - Stream subpackets with ZCRCG marker (no-ack continuation)
   *   - Final subpacket uses ZCRCE (end-of-frame)
   *   - Send ZEOF when done
   *   - Trust the reliable WebSocket transport; let the receiver
   *     drive error recovery via ZRPOS
   *
   * 25ms pacing between subpackets keeps the BBS happy without
   * adding much latency overhead. No ZCRCQ-based stop-and-wait —
   * that was confusing PCBoard into sending paired ZACK+ZRPOS
   * responses that knotted the protocol.
   */
  /**
   * Delta 2.12: pacing delay between consecutive ZCRCG subpackets.
   * Previously 25ms; PCBoard's segmented-mode ZMODEM driver (1993
   * vintage) was timing out during our 25ms gaps and sending
   * spurious ZRPOSes that we'd interpret as errors, triggering
   * resync cascades.
   *
   * Setting to 0 means each subpacket still goes through setTimeout
   * (yielding to the event loop for ws/io progress and abort
   * responsiveness) but with no artificial delay. Effective rate
   * is event-loop-overhead-limited — typically 1-5ms between
   * subpackets — which should stay under PCBoard's timeout.
   *
   * If 0 still triggers spurious ZRPOSes, the next escalation
   * would be queueMicrotask or fully synchronous bursting.
   */
  private static readonly INTER_SUBPACKET_DELAY_MS = 0;

  private sendZDATAAndPump(): void {
    const file = this._files[this._fileIndex];
    if (file === undefined) return;

    // ZDATA header with the offset. zmodem.js only sends this ONCE
    // per file (tracked via `this._sent_ZDATA`). On ZRPOS-triggered
    // restart, we DO send a new ZDATA (since position changed), but
    // we don't send one mid-stream.
    const zdataData: [number, number, number, number] = [
      this._position & 0xff,
      (this._position >>> 8) & 0xff,
      (this._position >>> 16) & 0xff,
      (this._position >>> 24) & 0xff,
    ];
    const zdata = this._useCrc32
      ? ZModemEncoder.buildBin32Header(0x0a /* ZDATA */, zdataData, /*escctl*/ true)
      : ZModemEncoder.buildBin16Header(0x0a, zdataData, /*escctl*/ true);
    this._lastSent = zdata;
    this.sendBytes(zdata);

    // Kick off the async subpacket pump.
    this._pumpNextSubpacket();
  }

  /**
   * Send one ZCRCG subpacket from `_position` then schedule the next
   * via setTimeout. When we hit the end of the file, send the final
   * subpacket with ZCRCE marker, then ZEOF.
   *
   * Unlike Delta 2.6's ZCRCQ-per-subpacket stop-and-wait, this is
   * pure streaming. The receiver acks errors via ZRPOS, which our
   * handleZRPOS handles correctly.
   */
  private _pumpNextSubpacket(): void {
    // If the session was aborted while we were waiting on a timer,
    // bail.
    if (this._state === SendState.ENDED) return;

    // Delta 2.11: if a ZRPOS arrived while we were waiting on the
    // pacing timer, state has moved to WAITING_FOR_RESYNC_ZACK and
    // _sendResyncFrame has already issued the ZDATA + ZCRCW. Bail
    // out of this pump tick — we'll resume from a fresh setTimeout
    // when the matching ZACK arrives.
    if (this._state !== SendState.SENDING_DATA) return;

    const file = this._files[this._fileIndex];
    if (file === undefined) return;

    if (this._position >= file.data.length) {
      // File fully sent. ZEOF with total size.
      this._sendZEOF(file);
      return;
    }

    const remaining = file.data.length - this._position;
    const chunkSize = Math.min(ZModemSend.SUBPACKET_SIZE, remaining);
    const chunk = file.data.subarray(
      this._position,
      this._position + chunkSize,
    );

    const isLast = this._position + chunkSize === file.data.length;
    const marker = isLast ? ZCRCE : ZCRCG;

    // Delta 2.9: force escctl=true for data subpackets, matching
    // zmodem.js's FORCE_ESCAPE_CTRL_CHARS = true approach. This
    // escapes every byte with `(b & 0x60) === 0` — i.e. all C0/C1
    // control characters (0x00-0x1f, 0x80-0x9f). Without this,
    // bytes like 0x0a, 0x0b, 0x0c, 0x0e, 0x0f, 0x16 etc. flow
    // through unescaped, and any layer in between (fTelnetProxy,
    // websockify, telnet line discipline, terminal IEXTEN) can
    // eat or transform them, corrupting the stream and breaking
    // CRC validation at the receiver. See:
    // https://stackoverflow.com/questions/23155939/missing-0xf-and-0x16-when-binary-data-through-virtual-serial-port-pair-created-b
    const subpacket = this._useCrc32
      ? ZModemEncoder.buildSubpacketCrc32(chunk, marker, /*escctl*/ true)
      : ZModemEncoder.buildSubpacketCrc16(chunk, marker, /*escctl*/ true);

    this.sendBytes(subpacket);
    this._position += chunkSize;
    this._callbacks.onProgress?.(this._position, file.data.length);

    if (isLast) {
      // Last subpacket sent. Now ZEOF.
      this._sendZEOF(file);
      return;
    }

    // Schedule the next subpacket after a small pacing delay.
    setTimeout(
      () => this._pumpNextSubpacket(),
      ZModemSend.INTER_SUBPACKET_DELAY_MS,
    );
  }

  private _sendZEOF(file: ZModemFileToSend): void {
    const sizeBytes: [number, number, number, number] = [
      file.data.length & 0xff,
      (file.data.length >>> 8) & 0xff,
      (file.data.length >>> 16) & 0xff,
      (file.data.length >>> 24) & 0xff,
    ];
    const zeof = this._useCrc32
      ? ZModemEncoder.buildBin32Header(ZEOF, sizeBytes, /*escctl*/ true)
      : ZModemEncoder.buildBin16Header(ZEOF, sizeBytes, /*escctl*/ true);
    this._lastSent = zeof;
    this.sendBytes(zeof);
    this._state = SendState.WAITING_AFTER_ZEOF;
  }


  // ─────────────────────── housekeeping ───────────────────────

  private sendBytes(bytes: Uint8Array): void {
    this._callbacks.onBytesToSend?.(bytes);
  }

  private fail(message: string): void {
    // Delta 2.13: clear any pending resync retry timer.
    if (this._resyncTimer !== null) {
      clearTimeout(this._resyncTimer);
      this._resyncTimer = null;
    }
    this._state = SendState.ENDED;
    this._callbacks.onError?.(message);
  }
}
