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

/**
 * ZMODEM protocol constants.
 *
 * Reference: Chuck Forsberg's "The ZMODEM Inter Application File
 * Transfer Protocol" (October 14, 1988), informally known as
 * zmodem.doc. Distributed with lrzsz; also archived at:
 *   https://gallium.inria.fr/~doligez/zmodem/zmodem.txt
 *
 * Naming convention: ZMODEM constants in the original C reference are
 * SCREAMING_SNAKE_CASE prefixed with Z (e.g. `ZRQINIT`, `ZACK`). I'm
 * keeping that convention here because:
 *   - It matches every other ZMODEM implementation (lrzsz, zmodemjs,
 *     SyncTERM, NetRunner). Anyone debugging fTelnet's ZMODEM by
 *     reading those references will find names they recognize.
 *   - The names ARE the protocol's vocabulary. Renaming would harm
 *     long-term maintenance for marginal style consistency.
 *
 * Phase 4 Stage 1: this file is constants and the CRC32 table only.
 * The actual parser/encoder/state-machine logic lands in Stages 2-5.
 */

// ─────────────────────────────────────────────────────────────────
// Frame-leader bytes
// ─────────────────────────────────────────────────────────────────

/** Start of a ZMODEM frame. */
export const ZPAD = 0x2a; // '*'
/** ZDLE — ZMODEM Data Link Escape (=CAN, 0x18). */
export const ZDLE = 0x18;
/** Same value as ZDLE, used in some doc contexts where the meaning
 *  is "the literal escape byte rather than the encoding semantics." */
export const ZDLEE = 0x18;
/** Hex-frame leader sentinel (preceded by ZPAD, ZPAD, ZDLE). */
export const ZBIN = 0x41; // 'A' — binary 16-bit CRC header follows
export const ZHEX = 0x42; // 'B' — hex-encoded header follows
export const ZBIN32 = 0x43; // 'C' — binary 32-bit CRC header follows

// ─────────────────────────────────────────────────────────────────
// Frame types (the first byte of any header)
// ─────────────────────────────────────────────────────────────────

/** Request receiver to start (sender → receiver). */
export const ZRQINIT = 0x00;
/** Receiver ready to receive (receiver → sender). Carries capability flags. */
export const ZRINIT = 0x01;
/** Sender sends parameters (sender → receiver). */
export const ZSINIT = 0x02;
/** Acknowledgment frame. */
export const ZACK = 0x03;
/** File name and size header (precedes file data). */
export const ZFILE = 0x04;
/** Skip this file (receiver tells sender). */
export const ZSKIP = 0x05;
/** "I have no more data" — used when receiver doesn't expect anything else. */
export const ZNAK = 0x06;
/** Abort the entire batch. */
export const ZABORT = 0x07;
/** End-of-file marker (sender tells receiver this file is done). */
export const ZEOF = 0x08;
/** Frame CRC failed — receiver telling sender to retransmit. */
export const ZFERR = 0x09;
/** Data packet header — precedes a subpacket of file content. */
export const ZDATA = 0x0a;
/** End of file batch — sender tells receiver "no more files." */
export const ZFIN = 0x0b;
/** Resume data transmission from a given offset (crash recovery). */
export const ZRPOS = 0x0c;
/** Receiver acknowledges receipt of data up to a given offset. */
export const ZRQ = 0x0d; // also called ZRACK
/** Sender requesting the receiver's challenge response. */
export const ZCHALLENGE = 0x0e;
/** Compare file contents (rarely implemented). */
export const ZCOMPL = 0x0f;
/** A "can't open file" or other unrecoverable error from the sender. */
export const ZCAN = 0x10;
/** Free disk space query/response. */
export const ZFREECNT = 0x11;
/** Generic command frame. */
export const ZCOMMAND = 0x12;
/** Stderr output from the sender (rare). */
export const ZSTDERR = 0x13;

// ─────────────────────────────────────────────────────────────────
// Subpacket-end markers (a.k.a. ZCRC* — what follows the data
// section of a subpacket and tells the receiver "end of subpacket,
// here's what to do next").
// ─────────────────────────────────────────────────────────────────

/** End of subpacket, follow data, no response expected. */
export const ZCRCE = 0x68; // 'h'
/** End of subpacket, frame continues with more data, no response. */
export const ZCRCG = 0x69; // 'i'
/** End of subpacket, frame continues, response expected (ZACK or ZRPOS). */
export const ZCRCQ = 0x6a; // 'j'
/** End of subpacket, frame continues, sender wants the receiver to
 *  send a ZACK back so it knows where the receiver got to. */
export const ZCRCW = 0x6b; // 'k'

// ─────────────────────────────────────────────────────────────────
// Bytes that need ZDLE-escaping when sent in a subpacket
// ─────────────────────────────────────────────────────────────────

/** Control bytes that ALWAYS get escaped (the telnet/terminal layer
 *  is likely to eat or interpret them otherwise). */
export const ZESCAPED_BYTES: ReadonlySet<number> = new Set([
  0x10, // DLE
  0x11, // XON
  0x13, // XOFF
  0x18, // CAN (== ZDLE itself; must escape so receiver can tell
        //       data CAN from frame-start CAN)
  0x90, // DLE | 0x80 (high-bit variant for 8-bit-clean links)
  0x91, // XON | 0x80
  0x93, // XOFF | 0x80
  0x8d, // CR | 0x80 (some hosts strip parity-bit CRs)
  0x0d, // CR (often escaped optionally; included for completeness)
]);

// ─────────────────────────────────────────────────────────────────
// ZRINIT capability flags (low byte of the ZRINIT header's ZF0)
// ─────────────────────────────────────────────────────────────────

/** Can handle full-duplex */
export const CANFDX = 0x01;
/** Can overlap I/O (read while writing) */
export const CANOVIO = 0x02;
/** Receiver can survive a CAN-break sequence in the data stream */
export const CANBRK = 0x04;
/** Receiver can decrypt (almost never set) */
export const CANCRY = 0x08;
/** Receiver can decompress LZW (rarely set) */
export const CANLZW = 0x10;
/** Receiver can do CRC-32 subpackets (the modern default) */
export const CANFC32 = 0x20;
/** Sender can use ESCAPE for control characters (== CANFDX + sane defaults) */
export const ESCCTL = 0x40;
/** Escape the 0x80 high bit too */
export const ESC8 = 0x80;

// ─────────────────────────────────────────────────────────────────
// Auto-download trigger sequence
// ─────────────────────────────────────────────────────────────────

/**
 * The byte sequence a ZMODEM sender emits at the start of a transfer.
 * If the receiving terminal sees this, it should switch into ZMODEM
 * receive mode automatically. fTelnet's ANSI parser will be wired to
 * detect this in Stage 6 (auto-detect).
 *
 * Sequence: `**\x18B00\r\n` (the `00` is two ASCII zeros, encoding
 * the ZRQINIT frame type as a 2-digit hex).
 */
export const ZMODEM_AUTO_TRIGGER: ReadonlyArray<number> = [
  0x2a, // '*'
  0x2a, // '*'
  0x18, // ZDLE
  0x42, // 'B' — ZHEX (hex-encoded header)
  0x30, // '0' — high nibble of frame type
  0x30, // '0' — low nibble of frame type (ZRQINIT == 0x00)
];
