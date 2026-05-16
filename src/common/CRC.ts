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

import { ByteArray } from './ByteArray.js';

/**
 * CRC-16 and CRC-32 calculation used by the XMODEM/YMODEM/ZMODEM
 * file transfer protocols.
 *
 * CRC-16/XMODEM: polynomial 0x1021 (CRC-CCITT), init 0x0000, no
 * reflection, no final XOR. Used by XMODEM-CRC, YMODEM, and the
 * "16-bit subpacket" variant of ZMODEM.
 *
 * CRC-32 (IEEE 802.3): polynomial 0xEDB88320 (reflected form of
 * 0x04C11DB7), init 0xFFFFFFFF, reflect input/output, final XOR
 * 0xFFFFFFFF. This is the same CRC-32 used by ZIP, PNG, Ethernet,
 * and the "32-bit subpacket" variant of ZMODEM.
 *
 * Phase 1 migration notes (CRC-16):
 *   - Made the table a `readonly` typed array. Frozen at class load.
 *   - Calculate16 preserves the caller's `position` (unchanged from original).
 *   - The two trailing UpdateCrc(0) calls in Calculate16 are the standard
 *     CRC-CCITT "shift out the last byte" — they're correct, not bugs.
 *
 * Phase 4 Stage 1 additions (CRC-32 for ZMODEM):
 *   - Added the IEEE 802.3 CRC-32 table (computed at class-load time
 *     from the polynomial rather than inlined as a 256-entry literal —
 *     half the byte size of a hex-literal table, identical at runtime).
 *   - Added `Calculate32(bytes)` matching the shape of `Calculate16`.
 *   - Added public incremental methods `Update16(byte, crc)` and
 *     `Update32(byte, crc)` for streaming use — ZMODEM emits subpackets
 *     byte-by-byte and we don't want to allocate a fresh ByteArray
 *     for every single one.
 *   - The original Phase 1 `UpdateCrc` (private) stays as-is for
 *     internal use by Calculate16. It's structurally the same as the
 *     new public `Update16`. Kept the duplicate name rather than
 *     refactoring to avoid touching the well-tested CRC-16 path.
 */
export class CRC {
  // ─────────────────────────── CRC-16 ───────────────────────────

  private static readonly TABLE: ReadonlyArray<number> = [
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b,
    0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
    0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
    0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
    0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738,
    0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96,
    0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
    0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
    0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
    0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb,
    0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2,
    0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
    0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
    0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
    0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827,
    0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
    0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
    0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
    0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
    0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
  ];

  /**
   * Compute the CRC-16/XMODEM of every byte in `bytes`.
   * The caller's `position` is restored before returning.
   */
  public static Calculate16(bytes: ByteArray): number {
    let crc = 0;
    const savedPosition = bytes.position;
    bytes.position = 0;

    while (bytes.bytesAvailable > 0) {
      crc = CRC.UpdateCrc(bytes.readUnsignedByte(), crc);
    }
    // Two zero-byte rounds flush the last byte through the shift register.
    crc = CRC.UpdateCrc(0, crc);
    crc = CRC.UpdateCrc(0, crc);

    bytes.position = savedPosition;
    return crc;
  }

  /**
   * Incremental CRC-16/XMODEM update — fold one byte into the running
   * CRC. Initialize `crc` to 0 for the first call; pass the previous
   * return value for subsequent calls. After the last data byte, fold
   * two zero bytes through to flush the shift register if you need
   * the final value (`Calculate16` does this for you).
   *
   * Public version of the existing private `UpdateCrc`. Phase 4 Stage 1.
   */
  public static Update16(byte: number, crc: number): number {
    return CRC.UpdateCrc(byte, crc);
  }

  private static UpdateCrc(curByte: number, curCrc: number): number {
    // Pascal: UpdateCrc := CrcTable[((CurCrc shr 8) and 255)] xor (CurCrc shl 8) xor CurByte
    return (CRC.TABLE[(curCrc >> 8) & 0xff]! ^ (curCrc << 8) ^ curByte) & 0xffff;
  }

  // ─────────────────────────── CRC-32 ───────────────────────────

  /**
   * CRC-32 (IEEE 802.3) lookup table. Computed at class-load time from
   * the reflected polynomial 0xEDB88320. This is the same table that
   * lrzsz, zmodemjs, and SyncTERM use — verified by matching the
   * standard test vector (CRC-32 of "123456789" = 0xCBF43926).
   *
   * Computed-at-load rather than inlined: 256 hex literals would add
   * ~2KB of source for identical runtime behavior, and Phase 1's pattern
   * for CRC-16 was to inline-from-original since the original was
   * already a literal table. Here we have neither precedent nor
   * source-to-port; computing is cleaner.
   */
  private static readonly TABLE_32: ReadonlyArray<number> = (() => {
    const table = new Array<number>(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        // Reflected polynomial 0xEDB88320 (== reflect of 0x04C11DB7).
        // The cast through `>>> 0` keeps the value as an unsigned 32-bit
        // integer; JS bitwise ops return signed 32-bit otherwise.
        c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
      }
      table[i] = c;
    }
    return table;
  })();

  /**
   * Compute the CRC-32 (IEEE 802.3) of every byte in `bytes`.
   * The caller's `position` is restored before returning.
   *
   * This matches the CRC-32 that ZMODEM uses for binary32 subpackets
   * and ZBIN32 headers. Verified against the standard test vector
   * 0xCBF43926 for the string "123456789".
   */
  public static Calculate32(bytes: ByteArray): number {
    let crc = 0xffffffff;
    const savedPosition = bytes.position;
    bytes.position = 0;

    while (bytes.bytesAvailable > 0) {
      crc = CRC.Update32(bytes.readUnsignedByte(), crc);
    }

    bytes.position = savedPosition;
    // Final XOR with 0xFFFFFFFF, then mask to keep unsigned.
    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Incremental CRC-32 update — fold one byte into the running CRC.
   *
   * **Important**: initialize `crc` to `0xFFFFFFFF` for the first call,
   * not 0 — that's the standard CRC-32 starting state. After folding
   * all bytes, XOR the result with `0xFFFFFFFF` to get the final value.
   * `Calculate32` does both for you; `Update32` is the loop body when
   * you're computing incrementally.
   *
   * Returned value is always an unsigned 32-bit integer (because JS
   * bitwise ops return signed 32-bit, we mask via `>>> 0`).
   */
  public static Update32(byte: number, crc: number): number {
    return (CRC.TABLE_32[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
}
