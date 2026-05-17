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
 * Regression tests for ZRUB0 / ZRUB1 ZDLE-escape handling in the
 * subpacket decoder.
 *
 * Per the Forsberg ZMODEM spec, the receiver decodes most
 * `ZDLE <byte>` sequences as "byte XOR 0x40" (the general escape
 * rule), but two specific escapes are special:
 *
 *   ZDLE 0x6c  (ZRUB0)  →  literal 0x7f (DEL / RUBOUT)
 *   ZDLE 0x6d  (ZRUB1)  →  literal 0xff
 *
 * Pre-Stage-6, our decoder applied the bare XOR rule to ZRUB
 * sequences, so a stream of `0x18 0x6d` (which a real sender uses
 * to escape a literal 0xff data byte) was being decoded as
 * `0x6d ^ 0x40 = 0x2d`. That corrupted every 0xff byte in
 * transferred files, broke the subpacket CRC, and led to the
 * infinite-retransmit loop we hit on Mystic-based BBSes
 * (Synchronet's ALICE29.TXT test never exercised 0xff so the
 * bug was invisible there).
 *
 * This file pins both the data-byte path and the CRC-byte path,
 * so a future refactor of the decoder can't reintroduce the
 * defect silently.
 *
 * Phase 4 Stage 6 (ZRUB interop fix).
 */

import { describe, it, expect } from 'vitest';
import { ZModemReceive } from '@filetransfer/ZModemReceive.js';
import { ZModemEncoder } from '@filetransfer/ZModemEncoder.js';
import { CRC } from '@common/CRC.js';
import { ZDATA, ZFILE, ZCRCG, ZCRCW } from '@filetransfer/ZModem.js';

/** Build a CRC-32 subpacket where individual bytes are wire-escaped
 *  per the caller's hand-crafted sequence. Used to construct
 *  ZRUB-escaped streams that our normal encoder doesn't produce
 *  (our encoder doesn't need to send 0x7f/0xff in headers and our
 *  Stage 4 didn't implement file-sending of those bytes). */
function buildHandCraftedSubpacket(
  rawData: readonly number[],
  wireBytes: readonly number[],
  marker: number,
): Uint8Array {
  // CRC computed over the raw (unescaped) data + marker byte
  let crc = 0xffffffff;
  for (const b of rawData) crc = CRC.Update32(b, crc);
  crc = CRC.Update32(marker, crc);
  crc = (crc ^ 0xffffffff) >>> 0;

  const out: number[] = [
    ...wireBytes,
    0x18, marker, // ZDLE + marker
    crc & 0xff,
    (crc >>> 8) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 24) & 0xff,
  ];
  return new Uint8Array(out);
}

describe('ZModemDecoder ZRUB0/ZRUB1 escape handling', () => {
  function setupReceive(): { recv: ZModemReceive; fileData: number[]; errors: string[] } {
    const fileData: number[] = [];
    const errors: string[] = [];
    const recv = new ZModemReceive({
      onBytesToSend: () => {},
      onFileData: (chunk) => { fileData.push(...chunk); },
      onError: (msg) => { errors.push(msg); },
    });
    recv.start();
    // Advance into READING_FILE_DATA: ZFILE + filename subpacket + ZDATA
    recv.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
    recv.feedBytes(ZModemEncoder.buildSubpacketCrc32(
      [...new TextEncoder().encode('test.bin\x004 \x00')], ZCRCW,
    ));
    recv.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
    return { recv, fileData, errors };
  }

  it('decodes ZDLE 0x6d (ZRUB1) as literal 0xff', () => {
    const { recv, fileData, errors } = setupReceive();
    // Wire bytes for raw data [0xaa, 0xff]:
    //   0xaa  (raw)
    //   0x18 0x6d  (ZDLE ZRUB1 → 0xff)
    const sub = buildHandCraftedSubpacket(
      [0xaa, 0xff],
      [0xaa, 0x18, 0x6d],
      ZCRCG,
    );
    recv.feedBytes(sub);
    expect(errors).toEqual([]);
    expect(fileData).toEqual([0xaa, 0xff]);
  });

  it('decodes ZDLE 0x6c (ZRUB0) as literal 0x7f', () => {
    const { recv, fileData, errors } = setupReceive();
    const sub = buildHandCraftedSubpacket(
      [0xbb, 0x7f],
      [0xbb, 0x18, 0x6c],
      ZCRCG,
    );
    recv.feedBytes(sub);
    expect(errors).toEqual([]);
    expect(fileData).toEqual([0xbb, 0x7f]);
  });

  it('handles a mix of ZRUB and standard escapes in one subpacket', () => {
    const { recv, fileData, errors } = setupReceive();
    // raw data: [0xaa, 0xff, 0xbb, 0x18, 0x7f, 0x10]
    // wire:
    //   0xaa  (raw)
    //   0x18 0x6d  (ZRUB1 → 0xff)
    //   0xbb  (raw)
    //   0x18 0x58  (escaped 0x18 — XOR 0x40 = 0x18)
    //   0x18 0x6c  (ZRUB0 → 0x7f)
    //   0x18 0x50  (escaped 0x10 — XOR 0x40 = 0x10)
    const sub = buildHandCraftedSubpacket(
      [0xaa, 0xff, 0xbb, 0x18, 0x7f, 0x10],
      [0xaa, 0x18, 0x6d, 0xbb, 0x18, 0x58, 0x18, 0x6c, 0x18, 0x50],
      ZCRCG,
    );
    recv.feedBytes(sub);
    expect(errors).toEqual([]);
    expect(fileData).toEqual([0xaa, 0xff, 0xbb, 0x18, 0x7f, 0x10]);
  });

  it('handles 0xff bytes scattered through a larger subpacket (Mystic ZIP scenario)', () => {
    const { recv, fileData, errors } = setupReceive();
    // Simulate what Mystic actually sends: random binary data with
    // a sprinkle of 0xff bytes (high entropy ZIP file content).
    const rawData = [
      0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0xff, 0xff,
      0xaa, 0x55, 0x7f, 0xff, 0x42,
    ];
    // Build wire bytes: 0xff escaped as 18 6d, 0x7f as 18 6c.
    const wire: number[] = [];
    for (const b of rawData) {
      if (b === 0xff) wire.push(0x18, 0x6d);
      else if (b === 0x7f) wire.push(0x18, 0x6c);
      else wire.push(b);
    }
    const sub = buildHandCraftedSubpacket(rawData, wire, ZCRCG);
    recv.feedBytes(sub);
    expect(errors).toEqual([]);
    expect(fileData).toEqual(rawData);
  });

  it('still decodes generic XOR-0x40 escapes correctly (no regression)', () => {
    const { recv, fileData, errors } = setupReceive();
    // Non-ZRUB escapes should still XOR with 0x40 as before. Pick
    // bytes well outside the ZRUB range to be sure.
    //   0x18 0x53  → 0x13 (XOFF)
    //   0x18 0x51  → 0x11 (XON)
    //   0x18 0xd0  → 0x90 (high-bit DLE)
    const sub = buildHandCraftedSubpacket(
      [0x13, 0x11, 0x90],
      [0x18, 0x53, 0x18, 0x51, 0x18, 0xd0],
      ZCRCG,
    );
    recv.feedBytes(sub);
    expect(errors).toEqual([]);
    expect(fileData).toEqual([0x13, 0x11, 0x90]);
  });
});
