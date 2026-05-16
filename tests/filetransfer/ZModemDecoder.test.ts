import { describe, it, expect, beforeEach } from 'vitest';
import { CRC } from '@common/CRC.js';
import {
  ZPAD, ZDLE, ZHEX, ZBIN, ZBIN32,
  ZRQINIT, ZRINIT, ZACK, ZDATA, ZRPOS,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
  CANFC32, CANFDX, CANOVIO,
} from '@filetransfer/ZModem.js';
import { ZModemDecoder, type ZModemDecoderEvents } from '@filetransfer/ZModemDecoder.js';
import { ZModemHeader } from '@filetransfer/ZModemHeader.js';

/*
  ZModemDecoder tests — Phase 4 Stage 2.

  The decoder consumes bytes and fires callbacks. Tests build
  hand-crafted byte sequences that exercise each frame format
  and each state transition, then verify the right callback
  fires with the right payload.

  Test fixtures are constructed using small helper functions that
  produce the same wire bytes a real ZMODEM sender would.
*/

/** Helper: build a hex-encoded frame from a type + 4 data bytes. */
function buildHexFrame(type: number, data: [number, number, number, number]): number[] {
  // Compute CRC-16 over [type, ...data] with two-zero shift-out
  let crc = 0;
  crc = CRC.Update16(type, crc);
  for (const b of data) crc = CRC.Update16(b, crc);
  crc = CRC.Update16(0, crc);
  crc = CRC.Update16(0, crc);
  const crcHi = (crc >> 8) & 0xff;
  const crcLo = crc & 0xff;

  const bytes = [ZPAD, ZPAD, ZDLE, ZHEX];
  // Encode each byte as two ASCII hex chars (lowercase, matching
  // what lrzsz emits)
  for (const b of [type, ...data, crcHi, crcLo]) {
    const hi = (b >> 4) & 0xf;
    const lo = b & 0xf;
    bytes.push(hi < 10 ? 0x30 + hi : 0x61 + (hi - 10));
    bytes.push(lo < 10 ? 0x30 + lo : 0x61 + (lo - 10));
  }
  bytes.push(0x0d, 0x0a); // CR LF trailer
  return bytes;
}

/** Helper: build a binary-16 frame. */
function buildBin16Frame(type: number, data: [number, number, number, number]): number[] {
  let crc = 0;
  crc = CRC.Update16(type, crc);
  for (const b of data) crc = CRC.Update16(b, crc);
  crc = CRC.Update16(0, crc);
  crc = CRC.Update16(0, crc);
  const crcHi = (crc >> 8) & 0xff;
  const crcLo = crc & 0xff;

  const payload = [type, ...data, crcHi, crcLo];
  const bytes: number[] = [ZPAD, ZDLE, ZBIN];
  // ZDLE-escape any byte that needs it
  for (const b of payload) {
    if (needsEscape(b)) {
      bytes.push(ZDLE, b ^ 0x40);
    } else {
      bytes.push(b);
    }
  }
  return bytes;
}

/** Helper: build a binary-32 frame. */
function buildBin32Frame(type: number, data: [number, number, number, number]): number[] {
  let crc = 0xffffffff;
  crc = CRC.Update32(type, crc);
  for (const b of data) crc = CRC.Update32(b, crc);
  crc = (crc ^ 0xffffffff) >>> 0;
  const c0 = crc & 0xff;
  const c1 = (crc >>> 8) & 0xff;
  const c2 = (crc >>> 16) & 0xff;
  const c3 = (crc >>> 24) & 0xff;

  const payload = [type, ...data, c0, c1, c2, c3];
  const bytes: number[] = [ZPAD, ZDLE, ZBIN32];
  for (const b of payload) {
    if (needsEscape(b)) {
      bytes.push(ZDLE, b ^ 0x40);
    } else {
      bytes.push(b);
    }
  }
  return bytes;
}

/** Helper: build a CRC-16 subpacket from data + an end marker. */
function buildSubpacketCrc16(data: number[], marker: number): number[] {
  // CRC is computed over the unescaped data bytes PLUS the marker byte.
  let crc = 0;
  for (const b of data) crc = CRC.Update16(b, crc);
  crc = CRC.Update16(marker, crc);
  crc = CRC.Update16(0, crc);
  crc = CRC.Update16(0, crc);
  const crcHi = (crc >> 8) & 0xff;
  const crcLo = crc & 0xff;

  const bytes: number[] = [];
  for (const b of data) {
    if (needsEscape(b)) {
      bytes.push(ZDLE, b ^ 0x40);
    } else {
      bytes.push(b);
    }
  }
  bytes.push(ZDLE, marker);
  // CRC bytes are also ZDLE-escaped if they need it.
  for (const b of [crcHi, crcLo]) {
    if (needsEscape(b)) {
      bytes.push(ZDLE, b ^ 0x40);
    } else {
      bytes.push(b);
    }
  }
  return bytes;
}

/** Helper: build a CRC-32 subpacket from data + an end marker. */
function buildSubpacketCrc32(data: number[], marker: number): number[] {
  let crc = 0xffffffff;
  for (const b of data) crc = CRC.Update32(b, crc);
  crc = CRC.Update32(marker, crc);
  crc = (crc ^ 0xffffffff) >>> 0;
  const c0 = crc & 0xff;
  const c1 = (crc >>> 8) & 0xff;
  const c2 = (crc >>> 16) & 0xff;
  const c3 = (crc >>> 24) & 0xff;

  const bytes: number[] = [];
  for (const b of data) {
    if (needsEscape(b)) {
      bytes.push(ZDLE, b ^ 0x40);
    } else {
      bytes.push(b);
    }
  }
  bytes.push(ZDLE, marker);
  for (const b of [c0, c1, c2, c3]) {
    if (needsEscape(b)) {
      bytes.push(ZDLE, b ^ 0x40);
    } else {
      bytes.push(b);
    }
  }
  return bytes;
}

/** Match the decoder's set of bytes that need ZDLE-escaping. */
function needsEscape(b: number): boolean {
  return (
    b === 0x10 || // DLE
    b === 0x11 || // XON
    b === 0x13 || // XOFF
    b === 0x18 || // ZDLE itself
    b === 0x90 ||
    b === 0x91 ||
    b === 0x93 ||
    b === 0x8d ||
    b === 0x0d
  );
}

describe('ZModemDecoder', () => {
  let headers: ZModemHeader[];
  let subpacketChunks: Uint8Array[];
  let subpacketEnds: Array<{ marker: number; crcValid: boolean }>;
  let garbage: number[];
  let errors: string[];
  let decoder: ZModemDecoder;

  beforeEach(() => {
    headers = [];
    subpacketChunks = [];
    subpacketEnds = [];
    garbage = [];
    errors = [];

    const events: ZModemDecoderEvents = {
      onHeader: (h) => headers.push(h),
      onSubpacketData: (c) => subpacketChunks.push(c),
      onSubpacketEnd: (marker, crcValid) => subpacketEnds.push({ marker, crcValid }),
      onGarbage: (b) => garbage.push(b),
      onHeaderError: (r) => errors.push(r),
    };
    decoder = new ZModemDecoder(events);
  });

  // ────────────────── hex frames ──────────────────

  describe('hex frames', () => {
    it('decodes a ZRQINIT header with all-zero data', () => {
      const frame = buildHexFrame(ZRQINIT, [0, 0, 0, 0]);
      decoder.feed(frame);

      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZRQINIT);
      expect([...headers[0]!.data]).toEqual([0, 0, 0, 0]);
      expect(headers[0]!.encoding).toBe('hex');
    });

    it('decodes a ZRINIT with capability flags', () => {
      // ZRINIT: bytes 0-1 are max-buf-size, byte 3 is capability flags
      const frame = buildHexFrame(ZRINIT, [0x00, 0x00, 0x00, CANFC32 | CANFDX | CANOVIO]);
      decoder.feed(frame);

      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZRINIT);
      const flags = headers[0]!.getCapabilityFlags();
      expect(flags & CANFC32).toBe(CANFC32);
      expect(flags & CANFDX).toBe(CANFDX);
      expect(flags & CANOVIO).toBe(CANOVIO);
    });

    it('rejects a hex frame with bad CRC', () => {
      const frame = buildHexFrame(ZRQINIT, [0, 0, 0, 0]);
      // Corrupt the CRC (the last two hex bytes before CR LF)
      frame[frame.length - 3]! ^= 0x01; // flip a nibble in the CRC
      decoder.feed(frame);

      expect(headers.length).toBe(0);
      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('CRC mismatch');
    });

    it('rejects non-hex bytes inside a hex header', () => {
      const bytes = [ZPAD, ZPAD, ZDLE, ZHEX, 0x47]; // 'G' isn't a hex char
      decoder.feed(bytes);

      expect(headers.length).toBe(0);
      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('non-hex byte');
    });

    it('tolerates uppercase hex chars', () => {
      // buildHexFrame uses lowercase; build one manually with uppercase
      const type = ZRQINIT;
      const data: [number, number, number, number] = [0xab, 0xcd, 0xef, 0x12];
      let crc = 0;
      crc = CRC.Update16(type, crc);
      for (const b of data) crc = CRC.Update16(b, crc);
      crc = CRC.Update16(0, crc);
      crc = CRC.Update16(0, crc);

      const bytes = [ZPAD, ZPAD, ZDLE, ZHEX];
      for (const b of [type, ...data, (crc >> 8) & 0xff, crc & 0xff]) {
        const hi = (b >> 4) & 0xf;
        const lo = b & 0xf;
        bytes.push(hi < 10 ? 0x30 + hi : 0x41 + (hi - 10)); // uppercase
        bytes.push(lo < 10 ? 0x30 + lo : 0x41 + (lo - 10));
      }
      bytes.push(0x0d, 0x0a);

      decoder.feed(bytes);
      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect([...headers[0]!.data]).toEqual([0xab, 0xcd, 0xef, 0x12]);
    });

    it('tolerates XON padding after a hex header', () => {
      const frame = buildHexFrame(ZRQINIT, [0, 0, 0, 0]);
      frame.push(0x11); // XON
      decoder.feed(frame);
      expect(headers.length).toBe(1);
      expect(errors).toEqual([]);
    });
  });

  // ────────────────── binary-16 frames ──────────────────

  describe('binary-16 frames', () => {
    it('decodes a ZACK with position field', () => {
      const frame = buildBin16Frame(ZACK, [0x40, 0x30, 0x20, 0x10]);
      decoder.feed(frame);

      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZACK);
      expect(headers[0]!.encoding).toBe('bin16');
      // Little-endian position decode
      expect(headers[0]!.getPosition()).toBe(0x10203040);
    });

    it('handles ZDLE-escaped bytes in the payload', () => {
      // Use data bytes that need escaping (e.g. XON, XOFF, DLE)
      const frame = buildBin16Frame(ZDATA, [0x11, 0x13, 0x10, 0x18]);
      decoder.feed(frame);

      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect([...headers[0]!.data]).toEqual([0x11, 0x13, 0x10, 0x18]);
    });

    it('rejects a binary-16 with bad CRC', () => {
      const frame = buildBin16Frame(ZACK, [0, 0, 0, 0]);
      // Corrupt the second-to-last payload byte (a CRC byte, not a data byte)
      // The last byte is the CRC-lo; we'll flip a bit there.
      frame[frame.length - 1]! ^= 0x01;
      decoder.feed(frame);

      expect(headers.length).toBe(0);
      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('CRC mismatch');
    });
  });

  // ────────────────── binary-32 frames ──────────────────

  describe('binary-32 frames', () => {
    it('decodes a ZDATA with position field', () => {
      const frame = buildBin32Frame(ZDATA, [0x00, 0x04, 0x00, 0x00]);
      decoder.feed(frame);

      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZDATA);
      expect(headers[0]!.encoding).toBe('bin32');
      expect(headers[0]!.getPosition()).toBe(1024);
    });

    it('rejects a binary-32 with bad CRC', () => {
      const frame = buildBin32Frame(ZDATA, [0, 0, 0, 0]);
      frame[frame.length - 1]! ^= 0x01;
      decoder.feed(frame);

      expect(headers.length).toBe(0);
      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('CRC mismatch');
    });
  });

  // ────────────────── garbage / non-frame bytes ──────────────────

  describe('garbage handling', () => {
    it('reports non-ZPAD bytes as garbage', () => {
      decoder.feed([0x41, 0x42, 0x43]); // 'ABC'
      expect(garbage).toEqual([0x41, 0x42, 0x43]);
      expect(headers.length).toBe(0);
    });

    it('flushes a false ZPAD start as garbage', () => {
      // ZPAD followed by something not-ZPAD-and-not-ZDLE
      decoder.feed([ZPAD, 0x41]);
      expect(garbage).toEqual([ZPAD, 0x41]);
    });

    it('flushes two false ZPADs as garbage', () => {
      decoder.feed([ZPAD, ZPAD, 0x41]);
      expect(garbage).toEqual([ZPAD, ZPAD, 0x41]);
    });

    it('passes garbage through between frames', () => {
      const frame1 = buildHexFrame(ZRQINIT, [0, 0, 0, 0]);
      const frame2 = buildHexFrame(ZRINIT, [0, 0, 0, 0x23]);
      const stream = [...frame1, 0x42, 0x42, 0x42, ...frame2];
      decoder.feed(stream);

      expect(headers.length).toBe(2);
      expect(garbage).toEqual([0x42, 0x42, 0x42]);
    });
  });

  // ────────────────── streaming (multi-chunk feed) ──────────────────

  describe('streaming behavior', () => {
    it('decodes a frame split into two chunks', () => {
      const frame = buildHexFrame(ZRQINIT, [0, 0, 0, 0]);
      const mid = Math.floor(frame.length / 2);
      decoder.feed(frame.slice(0, mid));
      decoder.feed(frame.slice(mid));

      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
    });

    it('decodes a frame fed byte by byte', () => {
      const frame = buildBin32Frame(ZDATA, [1, 2, 3, 4]);
      for (const b of frame) {
        decoder.feed(b);
      }
      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
    });

    it('decodes consecutive frames', () => {
      const f1 = buildHexFrame(ZRQINIT, [0, 0, 0, 0]);
      const f2 = buildBin16Frame(ZACK, [0x10, 0x00, 0x00, 0x00]);
      const f3 = buildBin32Frame(ZDATA, [0x00, 0x04, 0x00, 0x00]);
      decoder.feed([...f1, ...f2, ...f3]);
      expect(headers.length).toBe(3);
      expect(headers[0]!.type).toBe(ZRQINIT);
      expect(headers[1]!.type).toBe(ZACK);
      expect(headers[2]!.type).toBe(ZDATA);
    });
  });

  // ────────────────── subpackets ──────────────────

  describe('subpacket decoding (CRC-16)', () => {
    beforeEach(() => {
      decoder.expectSubpacket('crc16');
    });

    it('decodes a small ZCRCG subpacket', () => {
      const data = [0x41, 0x42, 0x43, 0x44]; // 'ABCD'
      const sub = buildSubpacketCrc16(data, ZCRCG);
      decoder.feed(sub);

      expect(errors).toEqual([]);
      expect(subpacketEnds.length).toBe(1);
      expect(subpacketEnds[0]!.marker).toBe(ZCRCG);
      expect(subpacketEnds[0]!.crcValid).toBe(true);
      // Verify the data came through
      const all = concatChunks(subpacketChunks);
      expect([...all]).toEqual(data);
    });

    it('handles ZDLE-escaped bytes inside subpacket', () => {
      const data = [0x11, 0x13, 0x18, 0x41]; // XON, XOFF, ZDLE, 'A'
      const sub = buildSubpacketCrc16(data, ZCRCE);
      decoder.feed(sub);

      expect(errors).toEqual([]);
      expect(subpacketEnds.length).toBe(1);
      const all = concatChunks(subpacketChunks);
      expect([...all]).toEqual(data);
    });

    it('reports a CRC failure on a corrupted subpacket', () => {
      const data = [0x41, 0x42, 0x43];
      const sub = buildSubpacketCrc16(data, ZCRCG);
      sub[sub.length - 1]! ^= 0x01; // flip a CRC bit
      decoder.feed(sub);

      expect(subpacketEnds.length).toBe(1);
      expect(subpacketEnds[0]!.crcValid).toBe(false);
    });

    it('handles all four marker types', () => {
      for (const marker of [ZCRCE, ZCRCG, ZCRCQ, ZCRCW]) {
        // Fresh decoder for each
        const events: ZModemDecoderEvents = {
          onSubpacketEnd: (m, valid) => subpacketEnds.push({ marker: m, crcValid: valid }),
          onSubpacketData: () => {},
        };
        const d = new ZModemDecoder(events);
        d.expectSubpacket('crc16');
        const sub = buildSubpacketCrc16([0x55], marker);
        d.feed(sub);
      }
      expect(subpacketEnds.map((s) => s.marker)).toEqual([ZCRCE, ZCRCG, ZCRCQ, ZCRCW]);
    });
  });

  describe('subpacket decoding (CRC-32)', () => {
    beforeEach(() => {
      decoder.expectSubpacket('crc32');
    });

    it('decodes a CRC-32 subpacket', () => {
      const data = [0x41, 0x42, 0x43];
      const sub = buildSubpacketCrc32(data, ZCRCG);
      decoder.feed(sub);

      expect(subpacketEnds.length).toBe(1);
      expect(subpacketEnds[0]!.crcValid).toBe(true);
      const all = concatChunks(subpacketChunks);
      expect([...all]).toEqual(data);
    });

    it('CRC-32 subpacket fed byte-by-byte still validates', () => {
      const sub = buildSubpacketCrc32([0xde, 0xad, 0xbe, 0xef], ZCRCE);
      for (const b of sub) decoder.feed(b);
      expect(subpacketEnds.length).toBe(1);
      expect(subpacketEnds[0]!.crcValid).toBe(true);
    });
  });

  // ────────────────── ZModemHeader helper methods ──────────────────

  describe('ZModemHeader helpers', () => {
    it('getPosition decodes little-endian 32-bit', () => {
      const h = new ZModemHeader(ZRPOS, [0x78, 0x56, 0x34, 0x12], 'hex');
      expect(h.getPosition()).toBe(0x12345678);
    });

    it('getPosition returns unsigned for high bit set', () => {
      const h = new ZModemHeader(ZRPOS, [0x00, 0x00, 0x00, 0x80], 'hex');
      expect(h.getPosition()).toBe(0x80000000);
      expect(h.getPosition()).toBeGreaterThan(0);
    });

    it('getMaxBufferSize is LE 16-bit from bytes 0-1', () => {
      const h = new ZModemHeader(ZRINIT, [0x00, 0x04, 0, 0], 'hex');
      expect(h.getMaxBufferSize()).toBe(1024);
    });

    it('getCapabilityFlags is byte 3', () => {
      const h = new ZModemHeader(ZRINIT, [0, 0, 0, CANFC32 | CANFDX], 'hex');
      expect(h.getCapabilityFlags()).toBe(CANFC32 | CANFDX);
    });
  });

  // ────────────────── reset / re-use ──────────────────

  describe('reset behavior', () => {
    it('reset() returns to IDLE and clears in-progress state', () => {
      // Start a frame but don't finish it
      decoder.feed([ZPAD, ZPAD, ZDLE, ZHEX, 0x30]); // start of hex frame, one nibble
      decoder.reset();
      // Now feed a complete frame; should still parse cleanly
      decoder.feed(buildHexFrame(ZRQINIT, [0, 0, 0, 0]));
      expect(headers.length).toBe(1);
      expect(errors).toEqual([]);
    });
  });
});

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
