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
  ZESCAPED_BYTES,
  ZRINIT, ZACK, ZRPOS, ZRQINIT, ZNAK, ZABORT, ZFIN, ZSKIP,
  CANFC32, CANFDX, CANOVIO,
} from './ZModem.js';

/**
 * Encoder for outbound ZMODEM frames and subpackets.
 *
 * Produces wire bytes from typed frame definitions. The inverse of
 * ZModemDecoder: given a frame type and 4 ZP data bytes (and
 * optionally a CRC mode), build the byte sequence a ZMODEM peer
 * would expect to see on the wire.
 *
 * No state — every method is static. Frames are tiny (≤22 bytes
 * for hex, ≤13 bytes for binary headers) and produced one at a
 * time, so there's no streaming/buffering to manage.
 *
 * Validation via round-trip: tests encode a frame, feed it back
 * through ZModemDecoder, and verify the decoder reports the same
 * type and data. If encode and decode disagree, the round-trip
 * test fails — we don't ship a one-sided implementation.
 *
 * Phase 4 Stage 3.
 */
export class ZModemEncoder {
  // ────────────────────────── headers ──────────────────────────

  /**
   * Build a hex-encoded header. Format:
   *
   *   ZPAD ZPAD ZDLE 'B' <2-char type> <2-char ZP0> <2-char ZP1>
   *     <2-char ZP2> <2-char ZP3> <2-char CRC-hi> <2-char CRC-lo>
   *     CR LF XON
   *
   * Each "2-char" is the byte rendered as two lowercase ASCII hex
   * digits (matches what lrzsz emits; tests have separately verified
   * the decoder accepts both uppercase and lowercase).
   *
   * CR LF are mandatory per the spec. XON is the optional trailer
   * that lrzsz includes; some senders omit it. We include it for
   * compatibility with the strictest receivers.
   *
   * Hex headers are typically used for the initial handshake
   * (ZRQINIT, ZRINIT, ZSINIT, ZACK) where bytes need to be safe
   * through 7-bit-clean links. Once the handshake is past, peers
   * typically switch to binary frames for speed.
   */
  public static buildHexHeader(
    type: number,
    data: readonly [number, number, number, number],
    noXon = false,
  ): Uint8Array {
    // CRC-16 over the 5 payload bytes (type + ZP0..3), then the
    // standard two-zero shift-out to flush the register.
    let crc = 0;
    crc = CRC.Update16(type, crc);
    for (const b of data) crc = CRC.Update16(b, crc);
    crc = CRC.Update16(0, crc);
    crc = CRC.Update16(0, crc);
    const crcHi = (crc >> 8) & 0xff;
    const crcLo = crc & 0xff;

    // 4 frame-leader + 14 hex chars + CR + LF (+ XON unless noXon).
    // The XON is omitted for ZACK (to protect flow control in
    // streaming) and ZFIN (to allow proper session cleanup) per
    // the ZMODEM spec.
    const out = new Uint8Array(4 + 14 + (noXon ? 2 : 3));
    let i = 0;
    out[i++] = ZPAD;
    out[i++] = ZPAD;
    out[i++] = ZDLE;
    out[i++] = ZHEX;

    for (const b of [type, ...data, crcHi, crcLo]) {
      out[i++] = ZModemEncoder.hexCharFor((b >> 4) & 0xf);
      out[i++] = ZModemEncoder.hexCharFor(b & 0xf);
    }

    out[i++] = 0x0d; // CR
    out[i++] = 0x0a; // LF
    if (!noXon) {
      out[i++] = 0x11; // XON
    }
    return out;
  }

  /**
   * Build a binary-16 header (ZBIN). Format:
   *
   *   ZPAD ZDLE 'A' <type> <ZP0> <ZP1> <ZP2> <ZP3> <CRC-hi> <CRC-lo>
   *
   * Each payload byte (everything after 'A') is ZDLE-escaped if it
   * appears in ZESCAPED_BYTES. CRC-16 is computed over the
   * pre-escape values; the on-wire CRC bytes are themselves
   * subject to escaping.
   *
   * Wire size: 3 leader bytes + up to 2*7 = 17 bytes if everything
   * gets escaped (rare in practice — most headers have no
   * escape-needing bytes).
   */
  public static buildBin16Header(
    type: number,
    data: readonly [number, number, number, number],
    escctl = false,
  ): Uint8Array {
    let crc = 0;
    crc = CRC.Update16(type, crc);
    for (const b of data) crc = CRC.Update16(b, crc);
    crc = CRC.Update16(0, crc);
    crc = CRC.Update16(0, crc);
    const crcHi = (crc >> 8) & 0xff;
    const crcLo = crc & 0xff;

    const result: number[] = [ZPAD, ZDLE, ZBIN];
    ZModemEncoder.writeEscapedByte(result, type, escctl);
    for (const b of data) ZModemEncoder.writeEscapedByte(result, b, escctl);
    ZModemEncoder.writeEscapedByte(result, crcHi, escctl);
    ZModemEncoder.writeEscapedByte(result, crcLo, escctl);
    return new Uint8Array(result);
  }

  /**
   * Build a binary-32 header (ZBIN32). Same shape as ZBIN but with
   * a 4-byte little-endian CRC-32. Used once both peers have
   * negotiated CRC-32 support via CANFC32 in ZRINIT.
   */
  public static buildBin32Header(
    type: number,
    data: readonly [number, number, number, number],
    escctl = false,
  ): Uint8Array {
    let crc = 0xffffffff;
    crc = CRC.Update32(type, crc);
    for (const b of data) crc = CRC.Update32(b, crc);
    crc = (crc ^ 0xffffffff) >>> 0;

    const result: number[] = [ZPAD, ZDLE, ZBIN32];
    ZModemEncoder.writeEscapedByte(result, type, escctl);
    for (const b of data) ZModemEncoder.writeEscapedByte(result, b, escctl);
    // CRC-32 wire order is little-endian
    ZModemEncoder.writeEscapedByte(result, crc & 0xff, escctl);
    ZModemEncoder.writeEscapedByte(result, (crc >>> 8) & 0xff, escctl);
    ZModemEncoder.writeEscapedByte(result, (crc >>> 16) & 0xff, escctl);
    ZModemEncoder.writeEscapedByte(result, (crc >>> 24) & 0xff, escctl);
    return new Uint8Array(result);
  }

  // ────────────────────────── subpackets ──────────────────────────

  /**
   * Build a data subpacket with CRC-16 trailing CRC. Format:
   *
   *   <data, ZDLE-escaped> ZDLE <marker> <CRC-hi> <CRC-lo>
   *
   * Where marker is one of ZCRCE/G/Q/W. CRC is computed over the
   * raw data bytes followed by the marker byte (NOT the ZDLE that
   * precedes the marker on the wire).
   *
   * Subpackets follow a ZDATA header during sender-to-receiver
   * file transfer. The marker tells the receiver what comes next:
   *   ZCRCE — end of data, no ACK
   *   ZCRCG — more subpackets follow, no ACK
   *   ZCRCQ — more subpackets, ACK expected
   *   ZCRCW — wait for ACK before more
   */
  public static buildSubpacketCrc16(
    data: Uint8Array | number[],
    marker: number,
    escctl = false,
  ): Uint8Array {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc = CRC.Update16(data[i]!, crc);
    }
    crc = CRC.Update16(marker, crc);
    crc = CRC.Update16(0, crc);
    crc = CRC.Update16(0, crc);
    const crcHi = (crc >> 8) & 0xff;
    const crcLo = crc & 0xff;

    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      ZModemEncoder.writeEscapedByte(result, data[i]!, escctl);
    }
    // ZDLE + marker is a fixed two-byte sequence; the marker is
    // NOT XOR'd with 0x40 (it's a literal marker code, not an
    // escaped data byte).
    result.push(ZDLE, marker);
    ZModemEncoder.writeEscapedByte(result, crcHi, escctl);
    ZModemEncoder.writeEscapedByte(result, crcLo, escctl);
    return new Uint8Array(result);
  }

  /**
   * Build a data subpacket with CRC-32 trailing CRC. Same shape
   * as CRC-16 but with a 4-byte little-endian CRC.
   */
  public static buildSubpacketCrc32(
    data: Uint8Array | number[],
    marker: number,
    escctl = false,
  ): Uint8Array {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = CRC.Update32(data[i]!, crc);
    }
    crc = CRC.Update32(marker, crc);
    crc = (crc ^ 0xffffffff) >>> 0;

    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      ZModemEncoder.writeEscapedByte(result, data[i]!, escctl);
    }
    result.push(ZDLE, marker);
    ZModemEncoder.writeEscapedByte(result, crc & 0xff, escctl);
    ZModemEncoder.writeEscapedByte(result, (crc >>> 8) & 0xff, escctl);
    ZModemEncoder.writeEscapedByte(result, (crc >>> 16) & 0xff, escctl);
    ZModemEncoder.writeEscapedByte(result, (crc >>> 24) & 0xff, escctl);
    return new Uint8Array(result);
  }

  // ──────────────── convenience: common frames ────────────────

  /**
   * Build a ZRINIT header in hex format. ZRINIT is the receiver's
   * "I'm ready" announcement and carries capability flags.
   *
   * The four data bytes are:
   *   ZP0 — low byte of max-buffer-size (0 = unlimited)
   *   ZP1 — high byte of max-buffer-size
   *   ZP2 — reserved
   *   ZP3 — capability flags (CANFC32, CANFDX, CANOVIO, ...)
   *
   * Default flags: CANFDX | CANOVIO | CANFC32 — the typical
   * modern receiver advertises full-duplex, overlap I/O, and
   * CRC-32 support. fTelnet's WebSocket connection is reliable so
   * we don't need the CANBRK escape behavior.
   */
  public static buildZRINIT(
    flags: number = CANFDX | CANOVIO | CANFC32,
    maxBufferSize: number = 0,
  ): Uint8Array {
    const lo = maxBufferSize & 0xff;
    const hi = (maxBufferSize >> 8) & 0xff;
    return ZModemEncoder.buildHexHeader(ZRINIT, [lo, hi, 0, flags & 0xff]);
  }

  /**
   * Build a ZRQINIT header (sender's "are you there?"). The data
   * bytes are conventionally all zero — the type byte alone is
   * the signal.
   *
   * Used by the sender at session start, and as the auto-download
   * trigger embedded in the ZMODEM_AUTO_TRIGGER sequence.
   */
  public static buildZRQINIT(): Uint8Array {
    return ZModemEncoder.buildHexHeader(ZRQINIT, [0, 0, 0, 0]);
  }

  /**
   * Build a ZACK acknowledging a specific byte position. The
   * receiver sends this after each ZCRCQ/ZCRCW subpacket to tell
   * the sender how far they've gotten.
   *
   * `position` is encoded as little-endian 32-bit.
   */
  /**
   * Build a ZACK header at the given file offset. Receiver sends
   * this to acknowledge a ZCRCQ/ZCRCW subpacket and report progress.
   *
   * Per the ZMODEM spec, ZACK is sent as a HEX frame and the XON
   * trailer is omitted (the XON would otherwise interfere with
   * software flow control during streaming).
   *
   * `position` is encoded as little-endian 32-bit.
   */
  public static buildZACK(position: number): Uint8Array {
    const data: [number, number, number, number] = [
      position & 0xff,
      (position >>> 8) & 0xff,
      (position >>> 16) & 0xff,
      (position >>> 24) & 0xff,
    ];
    return ZModemEncoder.buildHexHeader(ZACK, data, /* noXon */ true);
  }

  /**
   * Build a ZRPOS header. Receiver tells the sender "I have
   * everything up to byte N, start sending from there." Used both
   * for normal start-of-file and for crash-recovery resumes.
   *
   * Typically sent as a hex header so the sender can recover
   * after a CRC error in a binary frame.
   */
  public static buildZRPOS(position: number): Uint8Array {
    const data: [number, number, number, number] = [
      position & 0xff,
      (position >>> 8) & 0xff,
      (position >>> 16) & 0xff,
      (position >>> 24) & 0xff,
    ];
    return ZModemEncoder.buildHexHeader(ZRPOS, data);
  }

  /**
   * Build a ZNAK — "your last header had a bad CRC, retransmit
   * it please." Typically hex format so a single bit flip in the
   * binary stream doesn't prevent recovery.
   */
  public static buildZNAK(): Uint8Array {
    return ZModemEncoder.buildHexHeader(ZNAK, [0, 0, 0, 0]);
  }

  /**
   * Build a ZFIN — "I'm done with this batch, ack to confirm and
   * we'll both hang up the ZMODEM session." Sender and receiver
   * exchange a pair of ZFINs at the end of a transfer.
   *
   * Per spec, ZFIN omits the XON trailer to allow proper session
   * cleanup (the trailing XON would otherwise be consumed by the
   * peer after the session ended).
   */
  public static buildZFIN(): Uint8Array {
    return ZModemEncoder.buildHexHeader(ZFIN, [0, 0, 0, 0], /* noXon */ true);
  }

  /**
   * Build a ZSKIP — "skip this file, move on to the next." Receiver
   * sends this when the user declines a specific file in a batch
   * (e.g., when a duplicate would overwrite a newer local copy).
   * The sender responds by either advancing to the next file or
   * by sending ZFIN if no more files remain.
   */
  public static buildZSKIP(): Uint8Array {
    return ZModemEncoder.buildHexHeader(ZSKIP, [0, 0, 0, 0]);
  }

  /**
   * Build a ZABORT — "abort the entire transfer." Sent in either
   * direction when something has gone wrong unrecoverably.
   *
   * ZMODEM also has an out-of-band abort sequence (5 CANs in a
   * row) that bypasses the frame structure entirely; that's
   * handled separately by the state machine, not here.
   */
  public static buildZABORT(): Uint8Array {
    return ZModemEncoder.buildHexHeader(ZABORT, [0, 0, 0, 0]);
  }

  /**
   * The out-of-band abort sequence — five CAN bytes in a row,
   * optionally followed by backspaces to clean up the terminal.
   * Used when the state machine can't recover the protocol; lrzsz
   * always recognizes this even mid-frame.
   *
   * Eight CANs + ten backspaces matches what zmodem.js sends.
   */
  public static buildAbortSequence(): Uint8Array {
    const out = new Uint8Array(8 + 10);
    for (let i = 0; i < 8; i++) out[i] = 0x18; // CAN
    for (let i = 0; i < 10; i++) out[8 + i] = 0x08; // BS
    return out;
  }

  // ────────────────────────── internals ──────────────────────────

  /**
   * Write a byte to the output, ZDLE-escaping if necessary.
   *
   * `escctl` enables ESCAPE-Control mode where every byte under
   * 0x20 gets escaped, not just the four telnet-dangerous ones.
   * Some BBSes need this; most don't. Default off.
   */
  private static writeEscapedByte(
    out: number[],
    b: number,
    escctl: boolean,
  ): void {
    const needsEscape = escctl
      ? ZESCAPED_BYTES.has(b) || (b & 0x60) === 0
      : ZESCAPED_BYTES.has(b);
    if (needsEscape) {
      out.push(ZDLE, b ^ 0x40);
    } else {
      out.push(b);
    }
  }

  /**
   * Convert a nibble (0..15) to its ASCII hex char. Lowercase to
   * match lrzsz output; ZModemDecoder accepts either case.
   */
  private static hexCharFor(nibble: number): number {
    return nibble < 10 ? 0x30 + nibble : 0x61 + (nibble - 10);
  }
}
