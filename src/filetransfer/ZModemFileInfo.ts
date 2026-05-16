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
 * Metadata parsed from a ZFILE subpacket. The subpacket payload is:
 *
 *   filename<NUL>size mtime mode serial nfiles ntotal<NUL>
 *
 * Where:
 *   - filename : the literal file name (bytes before the first NUL)
 *   - size     : decimal byte count
 *   - mtime    : octal UNIX time
 *   - mode     : octal UNIX permissions (often 0 on non-UNIX senders)
 *   - serial   : conventionally 0
 *   - nfiles   : number of files remaining in batch (informational)
 *   - ntotal   : total batch byte count (informational)
 *
 * Only `name` and `size` are reliably meaningful; the rest is
 * best-effort. Senders that don't have a real file size send 0.
 *
 * Phase 4 Stage 4.
 */
export interface ZModemFileInfo {
  /** The filename as sent. May contain path components on some BBSes. */
  name: string;
  /** File size in bytes. 0 means "unknown" — common for piped sends. */
  size: number;
  /** Modification time as a JS Date, or null if not provided. */
  mtime: Date | null;
  /** UNIX file mode (permission bits), or 0. */
  mode: number;
  /**
   * 1-based index of this file in the batch, computed from `ntotal`
   * and `nfiles` from the wire. e.g. file 2 of 6 → fileNumber=2,
   * filesInBatch=6. Defaults to 1/1 when sender doesn't supply.
   */
  fileNumber: number;
  /** Total files in this batch. */
  filesInBatch: number;
}

/**
 * Parse a ZFILE subpacket body (the bytes between the ZFILE header
 * and the ZCRCW marker) into structured metadata. Returns sensible
 * defaults for any missing fields.
 *
 * The wire format from lrzsz looks like:
 *
 *   testfile.zip\0123456 12345670077 100644 0 1 123456\0\0...
 *
 * The trailing portion may include padding bytes (often a few NULs)
 * after the second NUL. We just stop at the second NUL.
 */
export function parseZFileSubpacket(bytes: Uint8Array | number[]): ZModemFileInfo {
  // Find the first NUL — splits filename from metadata
  let firstNul = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      firstNul = i;
      break;
    }
  }
  if (firstNul < 0) {
    // No NUL — treat the whole thing as a filename, no metadata
    return {
      name: bytesToString(bytes, 0, bytes.length),
      size: 0,
      mtime: null,
      mode: 0,
      fileNumber: 1,
      filesInBatch: 1,
    };
  }

  const name = bytesToString(bytes, 0, firstNul);

  // Find the second NUL bounding the metadata string
  let secondNul = bytes.length;
  for (let i = firstNul + 1; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      secondNul = i;
      break;
    }
  }

  const metaStr = bytesToString(bytes, firstNul + 1, secondNul);
  const parts = metaStr.split(/\s+/).filter((s) => s.length > 0);

  const size = parts[0] !== undefined ? parseDecimalOrZero(parts[0]) : 0;
  const mtimeOctal = parts[1] !== undefined ? parseOctalOrZero(parts[1]) : 0;
  const modeOctal = parts[2] !== undefined ? parseOctalOrZero(parts[2]) : 0;
  // parts[3] is serial — usually 0, we don't use it
  // parts[4] is nfiles, parts[5] is ntotal — but interpretation
  //   varies between senders. Some use 1-based, some 0-based; some
  //   send remaining count, some send total count. Best effort:
  const nfiles = parts[4] !== undefined ? parseDecimalOrZero(parts[4]) : 1;
  // We treat parts[4] as "files in batch" and default fileNumber
  // to 1 — the state machine increments as it sees more files.

  const mtime = mtimeOctal > 0 ? new Date(mtimeOctal * 1000) : null;

  return {
    name,
    size,
    mtime,
    mode: modeOctal,
    fileNumber: 1,
    filesInBatch: Math.max(1, nfiles),
  };
}

// ───────────────────── helpers ─────────────────────

function bytesToString(bytes: Uint8Array | number[], start: number, end: number): string {
  // Filenames may contain non-ASCII; decode as UTF-8 best-effort.
  // ZMODEM doesn't formally specify encoding, but UTF-8 is what
  // modern BBSes mostly use; legacy CP437 names will decode as
  // mojibake but not crash.
  const slice =
    bytes instanceof Uint8Array
      ? bytes.subarray(start, end)
      : new Uint8Array(bytes.slice(start, end));
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(slice);
  } catch {
    // Fall back to byte-by-byte ASCII (mojibake for >0x7f)
    let s = '';
    for (let i = 0; i < slice.length; i++) {
      s += String.fromCharCode(slice[i]!);
    }
    return s;
  }
}

function parseDecimalOrZero(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseOctalOrZero(s: string): number {
  const n = parseInt(s, 8);
  return Number.isFinite(n) ? n : 0;
}
