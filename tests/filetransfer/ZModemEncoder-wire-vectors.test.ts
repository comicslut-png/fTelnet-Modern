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
 * Wire-byte regression vectors for ZModemEncoder hex-header output.
 *
 * These tests pin our wire output against bytes produced by
 * FGasper's zmodem.js (the most widely-used JS ZMODEM reference,
 * https://github.com/FGasper/zmodemjs) using `Zmodem.Header.build(...)
 * .to_hex()`. Reproducing the vectors:
 *
 *   npm install zmodem.js
 *   node -e "const Z = require('zmodem.js');
 *            console.log(Z.Header.build('ZRPOS', 0).to_hex()
 *              .map(b => b.toString(16).padStart(2, '0')).join(' '))"
 *
 * The original Stage 1-5 tests only round-tripped through our own
 * decoder, which masked a frame-type-numbering bug for many turns:
 * ZRPOS was wired as 0x0c (ZFERR) instead of 0x09. Both Synchronet
 * and Mystic reject ZRPOS-as-ZFERR (sensibly — ZFERR is "receiver
 * had an error, abort") and the resulting infinite retransmit loop
 * looked like a CRC problem from the receiver's vantage point.
 *
 * Lesson: round-trip tests with your own decoder cannot detect a
 * defect that's symmetric between encoder and decoder. Pin against
 * an external reference, even if just statically once.
 *
 * Phase 4 Stage 6 (regression-after-interop-bug addition).
 */

import { describe, expect, it } from 'vitest';
import { ZModemEncoder } from '@filetransfer/ZModemEncoder.js';
import { CANFDX, CANOVIO, CANFC32 } from '@filetransfer/ZModem.js';

/** Hex string → byte array, ignoring whitespace. */
function hex(s: string): number[] {
  const cleaned = s.replace(/\s+/g, '');
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    out.push(parseInt(cleaned.substring(i, i + 2), 16));
  }
  return out;
}

/** Compare two byte sequences and return a readable diff if mismatched. */
function expectBytes(actual: Uint8Array, expected: number[], label: string): void {
  const a = Array.from(actual);
  if (a.length !== expected.length || a.some((b, i) => b !== expected[i])) {
    const fmt = (arr: number[]): string =>
      arr.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    throw new Error(
      `${label} wire bytes mismatch\n  expected: ${fmt(expected)}\n  actual:   ${fmt(a)}`
    );
  }
  // If we got here, they match. Use expect() so vitest counts the assertion.
  expect(a).toEqual(expected);
}

describe('ZModemEncoder wire-byte vectors (vs FGasper zmodem.js)', () => {
  // Reference: Zmodem.Header.build('ZRQINIT').to_hex()
  it('ZRQINIT matches reference', () => {
    expectBytes(
      ZModemEncoder.buildZRQINIT(),
      hex('2a 2a 18 42 30 30 30 30 30 30 30 30 30 30 30 30 30 30 0d 0a 11'),
      'ZRQINIT'
    );
  });

  // Reference: Zmodem.Header.build('ZRINIT', ['CANFDX','CANOVIO','CANFC32']).to_hex()
  // Capability byte = CANFDX|CANOVIO|CANFC32 = 0x01|0x02|0x20 = 0x23
  it('ZRINIT(CANFDX|CANOVIO|CANFC32) matches reference', () => {
    expectBytes(
      ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32),
      hex('2a 2a 18 42 30 31 30 30 30 30 30 30 32 33 62 65 35 30 0d 0a 11'),
      'ZRINIT'
    );
  });

  // Reference: Zmodem.Header.build('ZACK', 0).to_hex()
  // Note: no XON trailer on ZACK (spec exception).
  it('ZACK(0) matches reference (no XON trailer)', () => {
    expectBytes(
      ZModemEncoder.buildZACK(0),
      hex('2a 2a 18 42 30 33 30 30 30 30 30 30 30 30 65 65 64 32 0d 0a'),
      'ZACK'
    );
  });

  // Reference: Zmodem.Header.build('ZSKIP').to_hex()
  it('ZSKIP matches reference', () => {
    expectBytes(
      ZModemEncoder.buildZSKIP(),
      hex('2a 2a 18 42 30 35 30 30 30 30 30 30 30 30 32 33 35 37 0d 0a 11'),
      'ZSKIP'
    );
  });

  // Reference: Zmodem.Header.build('ZABORT').to_hex()
  it('ZABORT matches reference', () => {
    expectBytes(
      ZModemEncoder.buildZABORT(),
      hex('2a 2a 18 42 30 37 30 30 30 30 30 30 30 30 36 37 64 34 0d 0a 11'),
      'ZABORT'
    );
  });

  // Reference: Zmodem.Header.build('ZFIN').to_hex()
  // Note: no XON trailer on ZFIN (spec exception, to allow session cleanup).
  it('ZFIN matches reference (no XON trailer)', () => {
    expectBytes(
      ZModemEncoder.buildZFIN(),
      hex('2a 2a 18 42 30 38 30 30 30 30 30 30 30 30 30 32 32 64 0d 0a'),
      'ZFIN'
    );
  });

  // Reference: Zmodem.Header.build('ZRPOS', 0).to_hex()
  // THIS IS THE ONE THAT REVEALED THE BUG. Type byte must be '09'
  // (hex chars 30 39), NOT '0c' (hex chars 30 63 = ZFERR).
  it('ZRPOS(0) matches reference — the interop-bug regression case', () => {
    expectBytes(
      ZModemEncoder.buildZRPOS(0),
      hex('2a 2a 18 42 30 39 30 30 30 30 30 30 30 30 61 38 37 63 0d 0a 11'),
      'ZRPOS(0)'
    );
  });

  // Reference: Zmodem.Header.build('ZRPOS', 8192).to_hex()
  // Verifies position is encoded little-endian: 8192 = 0x2000,
  // wire bytes [00, 20, 00, 00], hex chars "00 20 00 00" = "30 30 32 30 30 30 30 30"
  it('ZRPOS(8192) matches reference (little-endian position encoding)', () => {
    expectBytes(
      ZModemEncoder.buildZRPOS(8192),
      hex('2a 2a 18 42 30 39 30 30 32 30 30 30 30 30 32 65 62 61 0d 0a 11'),
      'ZRPOS(8192)'
    );
  });

  // ZNAK has no factory in zmodem.js so the reference vector here
  // is hand-derived: type=0x06, position=0, CRC over [06,0,0,0,0,0,0]
  // is 0xcd85 by the standard XMODEM/ZMODEM CRC. Synchronet's
  // implementation produces the same.
  it('ZNAK matches a hand-derived canonical vector', () => {
    expectBytes(
      ZModemEncoder.buildZNAK(),
      hex('2a 2a 18 42 30 36 30 30 30 30 30 30 30 30 63 64 38 35 0d 0a 11'),
      'ZNAK'
    );
  });
});
