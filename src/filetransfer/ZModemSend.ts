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
  ZCRCE, ZCRCG,
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
        this.handleZRPOS(h);
        break;

      case ZACK:
        // Stage 5 doesn't send ZCRCQ/ZCRCW subpackets, so we
        // shouldn't receive ZACKs during normal flow. If a
        // receiver sends one anyway (some legacy ones might),
        // treat it as a flow-control hint and continue.
        break;

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

    this._position = position;
    this._state = SendState.SENDING_DATA;
    this.sendZDATAAndPump();
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
    this._callbacks.onFileStart?.(file);

    // Build the ZFILE header. The 4 ZP bytes carry conversion /
    // management / transport flags; we send all zeros (matches
    // what lrzsz does by default).
    const zfileHeader = this._useCrc32
      ? ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0])
      : ZModemEncoder.buildBin16Header(ZFILE, [0, 0, 0, 0]);
    this._lastSent = zfileHeader;
    this.sendBytes(zfileHeader);

    // Then the metadata subpacket: filename\0size mtime mode serial nfiles ntotal\0
    const metaBytes = this.buildFileMetaPayload(file);
    const metaSubpacket = this._useCrc32
      ? ZModemEncoder.buildSubpacketCrc32(metaBytes, 0x6b) // ZCRCW
      : ZModemEncoder.buildSubpacketCrc16(metaBytes, 0x6b);
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
   */
  private sendZDATAAndPump(): void {
    const file = this._files[this._fileIndex];
    if (file === undefined) return;

    // ZDATA header with the offset
    const zdataData: [number, number, number, number] = [
      this._position & 0xff,
      (this._position >>> 8) & 0xff,
      (this._position >>> 16) & 0xff,
      (this._position >>> 24) & 0xff,
    ];
    const zdata = this._useCrc32
      ? ZModemEncoder.buildBin32Header(0x0a /* ZDATA */, zdataData)
      : ZModemEncoder.buildBin16Header(0x0a, zdataData);
    this._lastSent = zdata;
    this.sendBytes(zdata);

    // Now stream the file in 1024-byte subpackets
    while (this._position < file.data.length) {
      const remaining = file.data.length - this._position;
      const chunkSize = Math.min(ZModemSend.SUBPACKET_SIZE, remaining);
      const chunk = file.data.subarray(
        this._position,
        this._position + chunkSize,
      );

      // ZCRCE for the last subpacket (no more in this ZDATA),
      // ZCRCG for all others (no ACK needed, continue streaming).
      const isLast = this._position + chunkSize === file.data.length;
      const marker = isLast ? ZCRCE : ZCRCG;
      const subpacket = this._useCrc32
        ? ZModemEncoder.buildSubpacketCrc32(chunk, marker)
        : ZModemEncoder.buildSubpacketCrc16(chunk, marker);

      this.sendBytes(subpacket);
      this._position += chunkSize;
      this._callbacks.onProgress?.(this._position, file.data.length);
    }

    // File fully sent. ZEOF with total size.
    const sizeBytes: [number, number, number, number] = [
      file.data.length & 0xff,
      (file.data.length >>> 8) & 0xff,
      (file.data.length >>> 16) & 0xff,
      (file.data.length >>> 24) & 0xff,
    ];
    const zeof = this._useCrc32
      ? ZModemEncoder.buildBin32Header(ZEOF, sizeBytes)
      : ZModemEncoder.buildBin16Header(ZEOF, sizeBytes);
    this._lastSent = zeof;
    this.sendBytes(zeof);

    this._state = SendState.WAITING_AFTER_ZEOF;
  }

  // ─────────────────────── housekeeping ───────────────────────

  private sendBytes(bytes: Uint8Array): void {
    this._callbacks.onBytesToSend?.(bytes);
  }

  private fail(message: string): void {
    this._state = SendState.ENDED;
    this._callbacks.onError?.(message);
  }
}
