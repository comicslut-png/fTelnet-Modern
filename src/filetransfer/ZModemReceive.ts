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

import { ZmDebug } from './ZmDebug.js';
import {
  ZRQINIT, ZFILE, ZDATA, ZEOF, ZFIN, ZABORT, ZNAK, ZSKIP, ZFERR,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
} from './ZModem.js';
import { ZModemDecoder, type ZModemDecoderEvents } from './ZModemDecoder.js';
import { ZModemEncoder } from './ZModemEncoder.js';
import { ZModemHeader } from './ZModemHeader.js';
import { parseZFileSubpacket, type ZModemFileInfo } from './ZModemFileInfo.js';

/**
 * Internal receive states. Tracks where we are in the conversation
 * with the sender. Each incoming header is interpreted relative to
 * this state.
 *
 * Phase 4 Stage 4.
 */
enum ReceiveState {
  /** Not started yet, or session fully ended. */
  IDLE,
  /** Sent ZRINIT, awaiting sender's ZFILE (file announcement) or ZFIN (batch done). */
  WAITING_FOR_ZFILE,
  /** ZFILE header received, awaiting the filename/metadata subpacket. */
  READING_FILE_INFO,
  /** Sent ZRPOS, awaiting sender's ZDATA. */
  WAITING_FOR_ZDATA,
  /** ZDATA header received, accumulating file bytes via subpackets. */
  READING_FILE_DATA,
  /** ZEOF received and processed; sent ZRINIT for next file. */
  WAITING_FOR_NEXT_FILE,
  /** Sent ZFIN to wrap up; awaiting sender's ZFIN. */
  FINISHING,
  /** Session terminated. No more bytes accepted. */
  ENDED,
}

/**
 * Callbacks the state machine fires during a session. The caller
 * connects these to the actual Connection (for outbound bytes) and
 * to the UI / file system (for progress and saving).
 *
 * All callbacks are optional; the state machine won't error if any
 * are missing.
 */
export interface ZModemReceiveCallbacks {
  /**
   * The state machine wants to send these bytes to the sender.
   * The caller writes them to the Connection. This is the only
   * outbound side-effect; no direct Connection coupling.
   */
  onBytesToSend?: (bytes: Uint8Array) => void;

  /**
   * A new file is starting. Fires after ZFILE metadata is parsed,
   * before any data bytes arrive.
   */
  onFileStart?: (file: ZModemFileInfo) => void;

  /**
   * A chunk of file data arrived. May fire many times per file.
   * The caller accumulates bytes; the state machine doesn't keep
   * the file in memory itself.
   */
  onFileData?: (chunk: Uint8Array) => void;

  /**
   * The current file is complete. ZEOF was received and size
   * matched (or matched well enough — if sender's announced size
   * was 0, any received size is accepted).
   */
  onFileComplete?: (file: ZModemFileInfo, totalBytes: number) => void;

  /**
   * Progress update — fires after every subpacket completion. Use
   * for UI updates. `received` is bytes-so-far for the current
   * file; `total` is the announced file size (0 if unknown).
   */
  onProgress?: (received: number, total: number) => void;

  /**
   * The entire batch (possibly multiple files) is complete. Fires
   * after ZFIN exchange. After this fires, the state machine is
   * in ENDED state and won't process more bytes.
   */
  onSessionComplete?: () => void;

  /**
   * Something went wrong — aborted by sender, aborted by user, or
   * an unrecoverable protocol error. After this fires, the state
   * machine is in ENDED state.
   */
  onError?: (message: string) => void;
}

/**
 * ZMODEM receive state machine.
 *
 * Sits between the wire (push: feedBytes()) and the application
 * (callbacks). Drives a session from start to finish:
 *
 *   1. Caller invokes `start()`. State machine sends ZRINIT.
 *   2. Sender responds with ZFILE + filename subpacket.
 *      State machine parses metadata, fires onFileStart, sends
 *      ZRPOS(0).
 *   3. Sender sends ZDATA + subpackets of file content. State
 *      machine accumulates progress, fires onFileData per chunk,
 *      onProgress per subpacket. On ZCRCQ/W markers, sends ZACK.
 *   4. Sender sends ZEOF. State machine verifies size, fires
 *      onFileComplete, sends ZRINIT for next file.
 *   5. Either another ZFILE (loop to step 2) or ZFIN (loop to 6).
 *   6. Sender ZFIN → we ZFIN, fire onSessionComplete.
 *
 * Error handling:
 *   - CRC failure on a header → send ZNAK (sender retransmits)
 *   - CRC failure on a subpacket → send ZRPOS(last_good_position)
 *   - ZABORT from sender → fire onError, end
 *   - 5+ consecutive CAN bytes (out-of-band abort) → fire onError, end
 *   - User invokes abort() → send abort sequence + ZFIN, end
 *
 * Phase 4 Stage 4.
 */
export class ZModemReceive {
  private _state: ReceiveState = ReceiveState.IDLE;
  private readonly _callbacks: ZModemReceiveCallbacks;
  private readonly _decoder: ZModemDecoder;

  // Per-file state
  private _currentFile: ZModemFileInfo | null = null;
  private _currentFileBytes = 0;
  /** Buffer for the ZFILE metadata subpacket (filename + meta). */
  private _fileInfoBuffer: number[] = [];

  /**
   * Whether the sender supports CRC-32. Derived from ZRINIT response —
   * if we advertised CANFC32 and the sender chooses to use bin32
   * frames, that's the answer. Affects subpacket CRC mode (16 vs 32).
   * Default to true since we always advertise CANFC32 in our ZRINIT.
   */
  private _useCrc32 = true;

  /**
   * The last header we sent. If sender sends ZNAK back, we resend
   * this. Stored as the raw bytes so resending is exact.
   */
  private _lastSent: Uint8Array | null = null;

  /**
   * Sliding-window CAN counter for out-of-band abort detection.
   * ZMODEM senders signal "abort immediately, even mid-frame" by
   * sending 5+ consecutive 0x18 bytes. The decoder treats stray
   * 0x18s as ZDLE which doesn't catch this case, so we count
   * separately here.
   */
  private _consecutiveCans = 0;

  /**
   * How many files have we received so far. Used to set fileNumber
   * on subsequent files in a batch (the wire metadata's nfiles
   * field is unreliable).
   */
  private _fileIndex = 0;

  /**
   * Have we ever seen a bin32 frame from the sender? Once they
   * use bin32 we know they support CRC-32; subsequent bin16
   * frames don't mean they DON'T support CRC-32, just that they
   * chose not to use it for that frame. Stays true once set.
   */
  private _everSawBin32 = false;

  public constructor(callbacks: ZModemReceiveCallbacks = {}) {
    this._callbacks = callbacks;
    const decoderEvents: ZModemDecoderEvents = {
      onHeader: (h) => this.handleHeader(h),
      onSubpacketData: (chunk) => this.handleSubpacketData(chunk),
      onSubpacketEnd: (marker, crcValid) => this.handleSubpacketEnd(marker, crcValid),
      onHeaderError: (msg) => this.handleHeaderError(msg),
      // Bytes outside any frame are normal: e.g. terminal output the
      // sender wrote before the transfer started, or sender's idle
      // line noise. We deliberately ignore them; the state machine
      // is reading ZMODEM-only.
      onGarbage: () => { /* ignored — caller routes pre-transfer bytes elsewhere */ },
    };
    this._decoder = new ZModemDecoder(decoderEvents);
  }

  /**
   * Begin the receive session. Sends our ZRINIT to announce
   * readiness and capability flags.
   *
   * Idempotent: calling start() multiple times has no effect
   * after the first.
   */
  public start(): void {
    if (this._state !== ReceiveState.IDLE) return;
    this._state = ReceiveState.WAITING_FOR_ZFILE;
    this.sendZRINIT();
  }

  /**
   * Feed bytes received from the Connection. The state machine
   * processes them, fires callbacks, and may produce outbound
   * bytes via onBytesToSend.
   *
   * Bytes received in ENDED state are silently dropped.
   */
  public feedBytes(bytes: Uint8Array | number[]): void {
    ZmDebug.bytes('receive', 'feedBytes()', bytes);
    if (this._state === ReceiveState.ENDED) return;
    // Check for the out-of-band CAN-storm abort before handing to decoder.
    // The decoder eats CANs as part of escape sequences; we need to count
    // them at the raw-byte level here.
    for (let i = 0; i < bytes.length; i++) {
      const b = (bytes as Uint8Array | number[])[i]!;
      if (b === 0x18) {
        this._consecutiveCans++;
        if (this._consecutiveCans >= 5) {
          this.fail('sender aborted (out-of-band CAN sequence)');
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
   * (8 CANs + 10 backspaces) so the sender stops immediately,
   * then transitions to ENDED.
   */
  public abort(): void {
    if (this._state === ReceiveState.ENDED) return;
    this.emit(ZModemEncoder.buildAbortSequence());
    this._state = ReceiveState.ENDED;
    this._callbacks.onError?.('aborted by user');
  }

  /**
   * Current state, exposed for testing/debugging.
   */
  public get state(): string {
    return ReceiveState[this._state]!;
  }

  // ─────────────────────── header dispatch ───────────────────────

  private handleHeader(h: ZModemHeader): void {
    ZmDebug.log('receive', `header type=0x${h.type.toString(16)} encoding=${h.encoding}`, {
      data: [...h.data].map((b) => b.toString(16).padStart(2, '0')).join(' '),
      state: ReceiveState[this._state],
    });
    // Note the sender's CRC mode based on encoding. Once we see
    // a bin32 frame from the sender, lock to CRC-32 for subpackets;
    // otherwise default to CRC-16. (We advertise CANFC32 in our
    // ZRINIT so most senders will use bin32, but some old ones don't.)
    if (h.encoding === 'bin32') {
      this._everSawBin32 = true;
      this._useCrc32 = true;
    } else if (h.encoding === 'bin16' && !this._everSawBin32) {
      this._useCrc32 = false;
    }
    // hex frames don't change the CRC mode decision either way

    switch (h.type) {
      case ZRQINIT:
        // Sender wants to know if we're alive. Resend ZRINIT.
        this.sendZRINIT();
        break;

      case ZFILE:
        this.handleZFile(h);
        break;

      case ZDATA:
        this.handleZData(h);
        break;

      case ZEOF:
        this.handleZEof(h);
        break;

      case ZFIN:
        this.handleZFin();
        break;

      case ZABORT:
        this.fail('sender sent ZABORT');
        break;

      case ZNAK:
        // Sender didn't like our last header — resend it.
        if (this._lastSent !== null) {
          this.emit(this._lastSent);
        }
        break;

      case ZSKIP:
      case ZFERR:
        // Sender is signaling "skip this file" or a recoverable
        // error condition. Bail on the current file but stay in
        // the session.
        this._currentFile = null;
        this._currentFileBytes = 0;
        this._state = ReceiveState.WAITING_FOR_ZFILE;
        this.sendZRINIT();
        break;

      default:
        // Unknown header type — ignore. The sender may send things
        // we don't implement (ZCHALLENGE, ZCOMPL, ZSTDERR); the
        // safe response is to do nothing and let the sender time
        // out / move on.
        break;
    }
  }

  private handleZFile(h: ZModemHeader): void {
    // ZFILE's 4 data bytes carry conversion / management / transport
    // flags that almost no sender uses meaningfully. Skip them.
    // The next thing on the wire is a ZCRCW-terminated subpacket
    // with filename + metadata.
    this._fileInfoBuffer = [];
    this._state = ReceiveState.READING_FILE_INFO;
    this._decoder.expectSubpacket(h.encoding === 'bin32' ? 'crc32' : 'crc16');
  }

  private handleZData(h: ZModemHeader): void {
    if (this._currentFile === null) {
      // ZDATA without a preceding ZFILE — protocol violation.
      // Send ZNAK and hope the sender restarts cleanly.
      this.sendZNAK();
      return;
    }

    // Position in the data stream the sender is restarting from.
    // If it doesn't match what we've received, we trust the sender
    // and reset our counter — they're resuming from an earlier
    // good position after a CRC error.
    const position = h.getPosition();
    if (position !== this._currentFileBytes) {
      // Truncate any partial bytes we received past `position` —
      // the sender is re-sending from there.
      this._currentFileBytes = position;
      // The caller's onFileData accumulator should handle this
      // by truncating its in-progress buffer. We pass through
      // the position via onProgress.
    }

    this._state = ReceiveState.READING_FILE_DATA;
    this._decoder.expectSubpacket(h.encoding === 'bin32' ? 'crc32' : 'crc16');
    if (h.encoding === 'bin32') this._everSawBin32 = true;
  }

  private handleZEof(h: ZModemHeader): void {
    if (this._currentFile === null) {
      // ZEOF without a file — ignore, send ZRINIT.
      this.sendZRINIT();
      this._state = ReceiveState.WAITING_FOR_ZFILE;
      return;
    }

    const announcedEnd = h.getPosition();
    if (this._currentFile.size > 0 && announcedEnd !== this._currentFile.size) {
      // The sender's reported file size disagrees with what we got.
      // This can happen with text-mode transfers that did CR/LF
      // conversion mid-stream; we accept what we got and proceed.
    }

    this._callbacks.onFileComplete?.(this._currentFile, this._currentFileBytes);
    this._currentFile = null;
    this._currentFileBytes = 0;
    this._state = ReceiveState.WAITING_FOR_NEXT_FILE;
    this.sendZRINIT();
    this._state = ReceiveState.WAITING_FOR_ZFILE;
  }

  private handleZFin(): void {
    // Sender is done with the batch. Send our own ZFIN to confirm.
    this.sendZFIN();
    // After ZFIN exchange, the sender may send "OO" (two 'O' chars)
    // as a final acknowledgement. We ignore it (it shows up as
    // garbage). Session is done.
    this._state = ReceiveState.ENDED;
    this._callbacks.onSessionComplete?.();
  }

  // ─────────────────────── subpacket dispatch ───────────────────────

  private handleSubpacketData(chunk: Uint8Array): void {
    switch (this._state) {
      case ReceiveState.READING_FILE_INFO:
        // Accumulate the filename + metadata bytes
        for (let i = 0; i < chunk.length; i++) {
          this._fileInfoBuffer.push(chunk[i]!);
        }
        break;

      case ReceiveState.READING_FILE_DATA:
        if (this._currentFile === null) return;
        this._currentFileBytes += chunk.length;
        this._callbacks.onFileData?.(chunk);
        this._callbacks.onProgress?.(this._currentFileBytes, this._currentFile.size);
        break;

      default:
        // Subpacket data in an unexpected state — discard.
        break;
    }
  }

  private handleSubpacketEnd(marker: number, crcValid: boolean): void {
    if (!crcValid) {
      // CRC failure. Ask the sender to resume from our last confirmed
      // position. (For file-info subpackets, that's position 0 of
      // this file; for data subpackets, the byte count we have.)
      if (this._state === ReceiveState.READING_FILE_DATA) {
        this.sendZRPOS(this._currentFileBytes);
        this._state = ReceiveState.WAITING_FOR_ZDATA;
      } else {
        // File-info subpacket CRC failed. Send ZNAK to ask for retry.
        this.sendZNAK();
        this._state = ReceiveState.WAITING_FOR_ZFILE;
      }
      return;
    }

    if (this._state === ReceiveState.READING_FILE_INFO) {
      // Parse the accumulated filename + metadata
      this._fileIndex++;
      const info = parseZFileSubpacket(this._fileInfoBuffer);
      info.fileNumber = this._fileIndex;
      this._currentFile = info;
      this._currentFileBytes = 0;
      this._callbacks.onFileStart?.(info);
      // Reply with ZRPOS(0) to start receiving from the beginning.
      // (Crash-recovery resume would set this to the file's existing
      // size on disk; Stage 4 doesn't implement resume.)
      this.sendZRPOS(0);
      this._state = ReceiveState.WAITING_FOR_ZDATA;
      return;
    }

    if (this._state === ReceiveState.READING_FILE_DATA) {
      // The marker tells us what comes next.
      switch (marker) {
        case ZCRCG:
          // More subpackets follow with no ACK needed. Stay in this
          // state; decoder is already expecting another subpacket.
          this._decoder.expectSubpacket(this._useCrc32 ? 'crc32' : 'crc16');
          break;
        case ZCRCQ:
          // More subpackets, ACK expected.
          this.sendZACK(this._currentFileBytes);
          this._decoder.expectSubpacket(this._useCrc32 ? 'crc32' : 'crc16');
          break;
        case ZCRCW:
          // Sender wants ACK before sending more.
          this.sendZACK(this._currentFileBytes);
          // Don't expect a subpacket — wait for the next header
          // (likely another ZDATA after the sender processes our ACK).
          this._state = ReceiveState.WAITING_FOR_ZDATA;
          break;
        case ZCRCE:
          // End of this ZDATA. Next header is likely ZEOF.
          this._state = ReceiveState.WAITING_FOR_ZDATA;
          break;
      }
    }
  }

  private handleHeaderError(_msg: string): void {
    ZmDebug.log('receive', `header CRC error: ${_msg}`);
    // A header's CRC didn't match. Send ZNAK so the sender retransmits.
    this.sendZNAK();
  }

  // ─────────────────────── outbound senders ───────────────────────

  private sendZRINIT(): void {
    const bytes = ZModemEncoder.buildZRINIT();
    this._lastSent = bytes;
    this.emit(bytes);
  }

  private sendZRPOS(position: number): void {
    const bytes = ZModemEncoder.buildZRPOS(position);
    this._lastSent = bytes;
    this.emit(bytes);
  }

  private sendZACK(position: number): void {
    // ZACK is always sent as a hex header per spec (the bin variant
    // was a pre-Stage-6 mistake — see the wire-vector tests for
    // the byte-level rationale). The `_useCrc32` flag here only
    // determined which binary variant to use, which is moot now.
    const bytes = ZModemEncoder.buildZACK(position);
    this._lastSent = bytes;
    this.emit(bytes);
  }

  private sendZNAK(): void {
    const bytes = ZModemEncoder.buildZNAK();
    this._lastSent = bytes;
    this.emit(bytes);
  }

  private sendZFIN(): void {
    const bytes = ZModemEncoder.buildZFIN();
    this._lastSent = bytes;
    this.emit(bytes);
  }

  // ─────────────────────── housekeeping ───────────────────────

  private emit(bytes: Uint8Array): void {
    ZmDebug.bytes('receive', 'sending to wire', bytes);
    this._callbacks.onBytesToSend?.(bytes);
  }

  private fail(message: string): void {
    this._state = ReceiveState.ENDED;
    this._callbacks.onError?.(message);
  }
}
