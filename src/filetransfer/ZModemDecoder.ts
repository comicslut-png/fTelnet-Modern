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

import { CRC } from '../common/CRC.js';
import {
  ZPAD, ZDLE, ZHEX, ZBIN, ZBIN32,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
} from './ZModem.js';
import { ZModemHeader } from './ZModemHeader.js';

/**
 * Decoder events. The consumer registers callbacks; the decoder
 * fires them as bytes are fed in.
 *
 * Phase 4 Stage 2.
 */
export interface ZModemDecoderEvents {
  /**
   * A complete header was successfully decoded (CRC passed). The
   * state machine acts on this.
   */
  onHeader?: (header: ZModemHeader) => void;

  /**
   * A chunk of unescaped subpacket data is available. May fire
   * multiple times per subpacket as bytes arrive. The receiver
   * state machine appends these to the in-progress file blob.
   */
  onSubpacketData?: (chunk: Uint8Array) => void;

  /**
   * A subpacket finished. `marker` is one of ZCRCE/G/Q/W and
   * tells the receiver what to do next:
   *   ZCRCE — end of data, no ACK expected
   *   ZCRCG — more data follows, no ACK
   *   ZCRCQ — more data follows, ACK expected
   *   ZCRCW — wait for ACK
   * `crcValid` is true if the trailing CRC matched the data.
   * If false, the receiver should request retransmission.
   */
  onSubpacketEnd?: (marker: number, crcValid: boolean) => void;

  /**
   * A byte was received that wasn't part of a recognizable ZMODEM
   * frame. The connection layer should typically pass these
   * through to the ANSI parser — they're terminal output from the
   * BBS, not part of any active transfer.
   *
   * Fires per-byte to keep the API simple; consumers can batch
   * if they care.
   */
  onGarbage?: (byte: number) => void;

  /**
   * A CRC-failed header was decoded. The state machine should
   * usually respond with ZNAK so the sender retransmits. Distinct
   * from `onHeader` so the state machine doesn't accidentally
   * act on corrupt data.
   */
  onHeaderError?: (reason: string) => void;
}

/**
 * Internal decoder state. Tracks where in a multi-byte sequence
 * we are between `feed()` calls — frames can span multiple chunks.
 */
enum DecoderState {
  /**
   * Looking for the start of a frame (a ZPAD byte). Bytes that
   * aren't part of a frame structure get reported as garbage.
   */
  IDLE,

  /**
   * Saw the first ZPAD. The next byte is either another ZPAD (hex
   * frame) or ZDLE (binary frame).
   */
  AFTER_ZPAD,

  /**
   * Saw ZPAD ZPAD. The next byte should be ZDLE.
   */
  AFTER_ZPAD_ZPAD,

  /**
   * Saw ZPAD ZDLE or ZPAD ZPAD ZDLE. Next byte is the format
   * indicator (ZHEX / ZBIN / ZBIN32).
   */
  AFTER_ZDLE,

  /**
   * Reading a hex-encoded header. Accumulates ASCII pairs into
   * raw bytes; total is 14 hex chars (7 bytes = type + 4 data + 2 CRC),
   * followed by optional CR LF XON which we tolerate but don't require.
   */
  READING_HEX,

  /**
   * Reading a binary-16 header. 7 bytes payload (type + 4 data + 2 CRC),
   * with ZDLE escaping on any byte that looks like a control char.
   */
  READING_BIN16,

  /**
   * Reading a binary-32 header. 9 bytes payload (type + 4 data + 4 CRC),
   * also ZDLE-escaped.
   */
  READING_BIN32,

  /**
   * Reading a data subpacket. Bytes accumulate via onSubpacketData
   * callbacks until a ZDLE-followed-by-marker sequence ends the
   * subpacket.
   */
  READING_SUBPACKET,

  /**
   * Saw ZDLE inside a subpacket; next byte is either an escaped
   * data byte (XOR 0x40) or a subpacket-end marker (ZCRCE/G/Q/W).
   */
  SUBPACKET_AFTER_ZDLE,

  /**
   * After a subpacket-end marker, reading the trailing CRC bytes
   * (2 for CRC-16 subpackets, 4 for CRC-32). The CRC is itself
   * ZDLE-escaped.
   */
  SUBPACKET_CRC,
}

/**
 * Hex-character → nibble value table. -1 means "not a hex digit."
 * Computed once at class-load; faster than parseInt or per-char
 * conditionals.
 */
const HEX_VALUES: ReadonlyArray<number> = (() => {
  const t = new Array<number>(256).fill(-1);
  for (let i = 0; i < 10; i++) t[0x30 + i] = i;           // '0'..'9'
  for (let i = 0; i < 6; i++) {
    t[0x41 + i] = 10 + i;                                  // 'A'..'F'
    t[0x61 + i] = 10 + i;                                  // 'a'..'f' (tolerate)
  }
  return t;
})();

/**
 * Streaming ZMODEM decoder.
 *
 * Fed bytes one at a time (or in chunks) via `feed()`. Identifies
 * frame headers (hex, binary-16, binary-32), validates their CRCs,
 * and reports them via the `onHeader` callback. Also handles the
 * subpacket data that follows ZDATA headers: emits unescaped data
 * chunks via `onSubpacketData` and a final boundary event via
 * `onSubpacketEnd`.
 *
 * The decoder is stateful — a frame can span multiple feed() calls,
 * which is normal because WebSocket delivers bytes in arbitrary
 * chunks. The state machine remembers where it is between calls.
 *
 * Bytes outside any frame are reported as `onGarbage` so the
 * caller can pass them to the ANSI parser (they're terminal
 * output, not protocol bytes).
 *
 * Subpacket parsing is opt-in via `expectSubpacket()`. The state
 * machine calls this after a ZDATA header so the decoder knows
 * "the next batch of bytes is file data, not a new frame." Without
 * this, ZDATA's trailing subpacket would get parsed as garbage.
 *
 * Phase 4 Stage 2.
 */
export class ZModemDecoder {
  private _state: DecoderState = DecoderState.IDLE;
  private readonly _events: ZModemDecoderEvents;

  // Frame-being-decoded scratch space. Reused across frames.
  private readonly _headerBytes: number[] = [];
  private _hexHighNibble = -1; // For hex frames: half-decoded byte

  // ZDLE escape state for binary headers and subpackets
  private _escaping = false;

  // CRC accumulator for binary frames + subpackets (the same field
  // is used for both 16-bit and 32-bit modes, the state knows which).
  private _crc16 = 0;
  private _crc32 = 0xffffffff;

  // For subpacket decoding: the marker byte we saw, awaiting CRC
  private _subpacketMarker = 0;
  private _subpacketCrcMode: 'crc16' | 'crc32' = 'crc16';
  private _subpacketCrcBytes: number[] = [];
  private _expectingSubpacket = false;

  // Output buffer for subpacket data — we batch small chunks
  // before firing onSubpacketData to reduce callback overhead.
  // BBSes typically send 1024-byte subpackets so this buffer
  // gets flushed at every subpacket boundary anyway.
  private readonly _subpacketBuffer: number[] = [];

  public constructor(events: ZModemDecoderEvents = {}) {
    this._events = events;
  }

  /**
   * Feed bytes to the decoder. Either a single byte or a chunk.
   *
   * The decoder is push-based: callbacks in `events` fire as
   * frames are recognized. No return value; everything happens
   * through the event handlers.
   */
  public feed(input: number | Uint8Array | number[]): void {
    if (typeof input === 'number') {
      this.feedByte(input);
      return;
    }
    for (let i = 0; i < input.length; i++) {
      this.feedByte(input[i]!);
    }
  }

  /**
   * Tell the decoder to expect a subpacket next. Called by the
   * state machine after a ZDATA or ZFILE header is processed —
   * subpacket data follows those frames. Without this call, the
   * decoder treats post-frame bytes as garbage / new frame starts.
   *
   * `crcMode` reflects the subpacket's CRC variant: 'crc16' if
   * the preceding header was ZBIN, 'crc32' if it was ZBIN32.
   * The hex frame format doesn't precede subpackets in normal
   * ZMODEM flow.
   */
  public expectSubpacket(crcMode: 'crc16' | 'crc32'): void {
    this._expectingSubpacket = true;
    this._subpacketCrcMode = crcMode;
    this._subpacketBuffer.length = 0;
    this._crc16 = 0;
    this._crc32 = 0xffffffff;
  }

  /**
   * Reset the decoder to IDLE. Useful when the state machine
   * aborts a transfer or the connection drops mid-frame.
   */
  public reset(): void {
    this._state = DecoderState.IDLE;
    this._headerBytes.length = 0;
    this._hexHighNibble = -1;
    this._escaping = false;
    this._subpacketBuffer.length = 0;
    this._subpacketCrcBytes.length = 0;
    this._expectingSubpacket = false;
    this._crc16 = 0;
    this._crc32 = 0xffffffff;
  }

  // ───────────────────────── single-byte dispatch ─────────────────

  private feedByte(b: number): void {
    // If we're waiting for a subpacket and not currently in any
    // frame-parsing state, the byte starts the subpacket.
    if (
      this._expectingSubpacket &&
      this._state === DecoderState.IDLE
    ) {
      this._expectingSubpacket = false;
      this._state = DecoderState.READING_SUBPACKET;
      this._escaping = false;
      // fall through into the state-switch below
    }

    switch (this._state) {
      case DecoderState.IDLE:
        this.handleIdle(b);
        break;
      case DecoderState.AFTER_ZPAD:
        this.handleAfterZpad(b);
        break;
      case DecoderState.AFTER_ZPAD_ZPAD:
        this.handleAfterZpadZpad(b);
        break;
      case DecoderState.AFTER_ZDLE:
        this.handleAfterZdle(b);
        break;
      case DecoderState.READING_HEX:
        this.handleReadingHex(b);
        break;
      case DecoderState.READING_BIN16:
        this.handleReadingBin(b, false);
        break;
      case DecoderState.READING_BIN32:
        this.handleReadingBin(b, true);
        break;
      case DecoderState.READING_SUBPACKET:
        this.handleReadingSubpacket(b);
        break;
      case DecoderState.SUBPACKET_AFTER_ZDLE:
        this.handleSubpacketAfterZdle(b);
        break;
      case DecoderState.SUBPACKET_CRC:
        this.handleSubpacketCrc(b);
        break;
    }
  }

  // ───────────────────────── state handlers ─────────────────

  private handleIdle(b: number): void {
    if (b === ZPAD) {
      this._state = DecoderState.AFTER_ZPAD;
      return;
    }
    this._events.onGarbage?.(b);
  }

  private handleAfterZpad(b: number): void {
    if (b === ZPAD) {
      this._state = DecoderState.AFTER_ZPAD_ZPAD;
      return;
    }
    if (b === ZDLE) {
      this._state = DecoderState.AFTER_ZDLE;
      return;
    }
    // The first ZPAD turned out to be a false alarm. Flush it as
    // garbage along with this byte.
    this._events.onGarbage?.(ZPAD);
    this._state = DecoderState.IDLE;
    this.feedByte(b);
  }

  private handleAfterZpadZpad(b: number): void {
    if (b === ZDLE) {
      this._state = DecoderState.AFTER_ZDLE;
      return;
    }
    // False alarm again. Flush both ZPADs as garbage.
    this._events.onGarbage?.(ZPAD);
    this._events.onGarbage?.(ZPAD);
    this._state = DecoderState.IDLE;
    this.feedByte(b);
  }

  private handleAfterZdle(b: number): void {
    this._headerBytes.length = 0;
    this._hexHighNibble = -1;
    this._escaping = false;
    this._crc16 = 0;
    this._crc32 = 0xffffffff;

    switch (b) {
      case ZHEX:
        this._state = DecoderState.READING_HEX;
        break;
      case ZBIN:
        this._state = DecoderState.READING_BIN16;
        break;
      case ZBIN32:
        this._state = DecoderState.READING_BIN32;
        break;
      default:
        // Unknown frame format. Treat as garbage.
        this._events.onHeaderError?.(`unknown frame format byte 0x${b.toString(16)}`);
        this._state = DecoderState.IDLE;
        break;
    }
  }

  /**
   * Hex frame format:
   *   ZPAD ZPAD ZDLE 'B' <14 hex chars> [CR LF [XON]]
   *
   * The 14 hex chars decode to 7 bytes: type + 4 ZP data + 2 CRC.
   * CRC is computed over (type + 4 ZP) bytes; the trailing CR/LF
   * are tolerance for sender quirks and don't count.
   */
  private handleReadingHex(b: number): void {
    // Tolerate trailing CR / LF / XON after a complete header.
    // (Some senders pad; we just ignore until we get a non-hex byte.)
    if (this._headerBytes.length === 7) {
      if (b === 0x0d || b === 0x0a || b === 0x11) {
        // CR, LF, XON — sender padding, ignore.
        return;
      }
      // We're done with this header. Re-process this byte from IDLE.
      this._state = DecoderState.IDLE;
      this.feedByte(b);
      return;
    }

    const nibble = HEX_VALUES[b];
    if (nibble === undefined || nibble < 0) {
      this._events.onHeaderError?.(`non-hex byte 0x${b.toString(16)} in hex header`);
      this._state = DecoderState.IDLE;
      return;
    }

    if (this._hexHighNibble < 0) {
      this._hexHighNibble = nibble;
      return;
    }
    const decoded = (this._hexHighNibble << 4) | nibble;
    this._hexHighNibble = -1;
    this._headerBytes.push(decoded);

    if (this._headerBytes.length === 7) {
      this.completeHexHeader();
    }
  }

  private completeHexHeader(): void {
    const [type, b0, b1, b2, b3, crcHi, crcLo] = this._headerBytes as [
      number, number, number, number, number, number, number,
    ];
    const receivedCrc = (crcHi << 8) | crcLo;

    // CRC over type + 4 data bytes, plus two trailing zeros to
    // shift out (same convention as Calculate16 over a ByteArray).
    let crc = 0;
    crc = CRC.Update16(type, crc);
    crc = CRC.Update16(b0, crc);
    crc = CRC.Update16(b1, crc);
    crc = CRC.Update16(b2, crc);
    crc = CRC.Update16(b3, crc);
    crc = CRC.Update16(0, crc);
    crc = CRC.Update16(0, crc);

    if (crc !== receivedCrc) {
      this._events.onHeaderError?.(
        `hex header CRC mismatch: expected 0x${crc.toString(16)}, got 0x${receivedCrc.toString(16)}`
      );
      this._state = DecoderState.IDLE;
      return;
    }

    const header = new ZModemHeader(type, [b0, b1, b2, b3], 'hex');
    this._events.onHeader?.(header);

    // Hex headers may be followed by CR LF XON which we tolerate
    // in the state machine above. Move back to IDLE; if the next
    // byte is a continuation it'll be ignored, otherwise it starts
    // the next frame.
    this._state = DecoderState.READING_HEX; // stay here briefly to absorb CR/LF/XON
    // (handleReadingHex will see we're full and transition to IDLE)
  }

  /**
   * Binary frame format:
   *   ZPAD ZDLE 'A' <type> <ZP0> <ZP1> <ZP2> <ZP3> <CRC-hi> <CRC-lo>  (ZBIN)
   *   ZPAD ZDLE 'C' <type> <ZP0> <ZP1> <ZP2> <ZP3> <CRC0..3>          (ZBIN32)
   *
   * Each byte after the format indicator is ZDLE-escaped. CRC is
   * computed over the raw (post-unescape) bytes excluding the CRC
   * itself.
   */
  private handleReadingBin(b: number, crc32mode: boolean): void {
    const expectedLength = crc32mode ? 9 : 7; // type + 4 data + CRC

    if (this._escaping) {
      this._escaping = false;
      // ZDLE special markers don't appear in headers (they only
      // mark subpacket ends), so any post-ZDLE byte here is an
      // escaped data byte: XOR with 0x40.
      this._headerBytes.push(b ^ 0x40);
    } else if (b === ZDLE) {
      this._escaping = true;
      return;
    } else {
      this._headerBytes.push(b);
    }

    if (this._headerBytes.length === expectedLength) {
      this.completeBinHeader(crc32mode);
    }
  }

  private completeBinHeader(crc32mode: boolean): void {
    const [type, b0, b1, b2, b3] = this._headerBytes as [
      number, number, number, number, number,
    ];

    let crcValid: boolean;
    if (crc32mode) {
      // CRC-32 over type + 4 data, compared against bytes 5..8.
      // The CRC's wire order is little-endian.
      let crc = 0xffffffff;
      for (let i = 0; i < 5; i++) {
        crc = CRC.Update32(this._headerBytes[i]!, crc);
      }
      crc = (crc ^ 0xffffffff) >>> 0;
      const received =
        (this._headerBytes[5]! |
          (this._headerBytes[6]! << 8) |
          (this._headerBytes[7]! << 16) |
          (this._headerBytes[8]! << 24)) >>> 0;
      crcValid = crc === received;
      if (!crcValid) {
        this._events.onHeaderError?.(
          `bin32 header CRC mismatch: expected 0x${crc.toString(16)}, got 0x${received.toString(16)}`
        );
      }
    } else {
      // CRC-16 over type + 4 data, with two zero-byte shift-out
      let crc = 0;
      for (let i = 0; i < 5; i++) {
        crc = CRC.Update16(this._headerBytes[i]!, crc);
      }
      crc = CRC.Update16(0, crc);
      crc = CRC.Update16(0, crc);
      // CRC-16 wire order: high byte first, then low byte
      const received = (this._headerBytes[5]! << 8) | this._headerBytes[6]!;
      crcValid = crc === received;
      if (!crcValid) {
        this._events.onHeaderError?.(
          `bin16 header CRC mismatch: expected 0x${crc.toString(16)}, got 0x${received.toString(16)}`
        );
      }
    }

    this._state = DecoderState.IDLE;
    if (!crcValid) return;

    const header = new ZModemHeader(
      type,
      [b0, b1, b2, b3],
      crc32mode ? 'bin32' : 'bin16'
    );
    this._events.onHeader?.(header);
  }

  /**
   * Subpacket decoding. Subpackets carry the actual file data
   * after a ZDATA header. Format:
   *
   *   <data bytes, ZDLE-escaped> ZDLE <marker> <CRC>
   *
   * Where marker is one of ZCRCE/G/Q/W and CRC is 2 bytes (CRC-16)
   * or 4 bytes (CRC-32) depending on which mode the sender chose.
   *
   * Inside the subpacket, ZDLE-escape rules apply:
   *   ZDLE byte (0x18) → followed by a byte; if that byte is
   *   one of ZCRC*, this is the end-of-subpacket marker; otherwise
   *   the byte is XOR'd with 0x40 to recover the original data byte.
   */
  private handleReadingSubpacket(b: number): void {
    if (b === ZDLE) {
      this._state = DecoderState.SUBPACKET_AFTER_ZDLE;
      return;
    }
    // Regular data byte — accumulate in the buffer + CRC.
    this._subpacketBuffer.push(b);
    this.updateSubpacketCrc(b);
  }

  private handleSubpacketAfterZdle(b: number): void {
    // Subpacket-end markers: byte tells us what comes next.
    if (b === ZCRCE || b === ZCRCG || b === ZCRCQ || b === ZCRCW) {
      this._subpacketMarker = b;
      // The marker byte ITSELF is part of the CRC computation
      // (per the protocol). Fold it in.
      this.updateSubpacketCrc(b);
      // Flush any buffered data before we transition.
      this.flushSubpacketBuffer();
      this._subpacketCrcBytes.length = 0;
      this._state = DecoderState.SUBPACKET_CRC;
      return;
    }
    // Otherwise it's an escaped data byte (XOR 0x40).
    const dataByte = b ^ 0x40;
    this._subpacketBuffer.push(dataByte);
    this.updateSubpacketCrc(dataByte);
    this._state = DecoderState.READING_SUBPACKET;
  }

  private handleSubpacketCrc(b: number): void {
    // CRC bytes are also ZDLE-escaped. Reuse the escape state.
    if (this._escaping) {
      this._escaping = false;
      this._subpacketCrcBytes.push(b ^ 0x40);
    } else if (b === ZDLE) {
      this._escaping = true;
      return;
    } else {
      this._subpacketCrcBytes.push(b);
    }

    const expected = this._subpacketCrcMode === 'crc32' ? 4 : 2;
    if (this._subpacketCrcBytes.length < expected) return;

    // We have all the CRC bytes. Verify.
    let crcValid: boolean;
    if (this._subpacketCrcMode === 'crc32') {
      // CRC-32 wire order: little-endian
      const received =
        (this._subpacketCrcBytes[0]! |
          (this._subpacketCrcBytes[1]! << 8) |
          (this._subpacketCrcBytes[2]! << 16) |
          (this._subpacketCrcBytes[3]! << 24)) >>> 0;
      const computed = (this._crc32 ^ 0xffffffff) >>> 0;
      crcValid = computed === received;
    } else {
      // CRC-16: the original protocol folds two zero bytes through
      // the shift register to finalize, then the wire order is
      // high byte first.
      let crc = this._crc16;
      crc = CRC.Update16(0, crc);
      crc = CRC.Update16(0, crc);
      const received = (this._subpacketCrcBytes[0]! << 8) | this._subpacketCrcBytes[1]!;
      crcValid = crc === received;
    }

    this._events.onSubpacketEnd?.(this._subpacketMarker, crcValid);

    // After a subpacket ends, what comes next depends on the marker
    // and on what the state machine wants. ZCRCG / ZCRCQ mean "more
    // subpackets follow"; ZCRCE / ZCRCW mean "back to header territory."
    // The state machine will call expectSubpacket() again if needed.
    this._state = DecoderState.IDLE;
    this._subpacketBuffer.length = 0;
    this._subpacketCrcBytes.length = 0;
    this._crc16 = 0;
    this._crc32 = 0xffffffff;
  }

  private updateSubpacketCrc(b: number): void {
    if (this._subpacketCrcMode === 'crc32') {
      this._crc32 = CRC.Update32(b, this._crc32);
    } else {
      this._crc16 = CRC.Update16(b, this._crc16);
    }
  }

  private flushSubpacketBuffer(): void {
    if (this._subpacketBuffer.length === 0) return;
    const chunk = new Uint8Array(this._subpacketBuffer);
    this._events.onSubpacketData?.(chunk);
    this._subpacketBuffer.length = 0;
  }
}
