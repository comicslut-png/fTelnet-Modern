import { describe, it, expect } from 'vitest';
import {
  ZPAD, ZDLE, ZHEX, ZBIN, ZBIN32,
  ZRQINIT, ZRINIT, ZACK, ZRPOS, ZNAK, ZFIN, ZABORT, ZDATA,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
  CANFC32, CANFDX, CANOVIO,
} from '@filetransfer/ZModem.js';
import { ZModemEncoder } from '@filetransfer/ZModemEncoder.js';
import { ZModemDecoder, type ZModemDecoderEvents } from '@filetransfer/ZModemDecoder.js';
import { ZModemHeader } from '@filetransfer/ZModemHeader.js';

/*
  ZModemEncoder tests — Phase 4 Stage 3.

  Two test strategies, both used:

    1. Round-trip: encode a frame, feed the bytes to ZModemDecoder,
       verify the decoder reports the same type/data. This catches
       any asymmetry between encoder and decoder.

    2. Golden vectors: a few hand-computed wire byte sequences
       for specific frames, verifying the encoder produces exactly
       what lrzsz/zmodem.js would. Catches "decoder and encoder both
       wrong in the same way" — round-trip alone can't detect that.
*/

describe('ZModemEncoder', () => {
  // ──────────────────── helper: round-trip ────────────────────

  function decodeFrame(bytes: Uint8Array): {
    headers: ZModemHeader[];
    errors: string[];
  } {
    const headers: ZModemHeader[] = [];
    const errors: string[] = [];
    const events: ZModemDecoderEvents = {
      onHeader: (h) => headers.push(h),
      onHeaderError: (r) => errors.push(r),
    };
    const d = new ZModemDecoder(events);
    d.feed(bytes);
    return { headers, errors };
  }

  function decodeSubpacket(
    bytes: Uint8Array,
    crcMode: 'crc16' | 'crc32',
  ): {
    data: Uint8Array;
    marker: number | null;
    crcValid: boolean;
  } {
    const chunks: Uint8Array[] = [];
    let marker: number | null = null;
    let crcValid = false;
    const events: ZModemDecoderEvents = {
      onSubpacketData: (c) => chunks.push(c),
      onSubpacketEnd: (m, v) => {
        marker = m;
        crcValid = v;
      },
    };
    const d = new ZModemDecoder(events);
    d.expectSubpacket(crcMode);
    d.feed(bytes);

    let total = 0;
    for (const c of chunks) total += c.length;
    const data = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      data.set(c, off);
      off += c.length;
    }
    return { data, marker, crcValid };
  }

  // ──────────────────── headers: hex ────────────────────

  describe('hex headers', () => {
    it('round-trips ZRQINIT', () => {
      const bytes = ZModemEncoder.buildHexHeader(ZRQINIT, [0, 0, 0, 0]);
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZRQINIT);
      expect([...headers[0]!.data]).toEqual([0, 0, 0, 0]);
      expect(headers[0]!.encoding).toBe('hex');
    });

    it('round-trips ZRPOS with a specific position', () => {
      // Position = 0x12345678 → little-endian bytes [0x78, 0x56, 0x34, 0x12]
      const bytes = ZModemEncoder.buildHexHeader(
        ZRPOS,
        [0x78, 0x56, 0x34, 0x12],
      );
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect(headers[0]!.getPosition()).toBe(0x12345678);
    });

    it('starts with ZPAD ZPAD ZDLE ZHEX', () => {
      const bytes = ZModemEncoder.buildHexHeader(ZRQINIT, [0, 0, 0, 0]);
      expect(bytes[0]).toBe(ZPAD);
      expect(bytes[1]).toBe(ZPAD);
      expect(bytes[2]).toBe(ZDLE);
      expect(bytes[3]).toBe(ZHEX);
    });

    it('ends with CR LF XON', () => {
      const bytes = ZModemEncoder.buildHexHeader(ZRQINIT, [0, 0, 0, 0]);
      expect(bytes[bytes.length - 3]).toBe(0x0d);
      expect(bytes[bytes.length - 2]).toBe(0x0a);
      expect(bytes[bytes.length - 1]).toBe(0x11);
    });

    it('total size is 21 bytes (4 leader + 14 hex chars + CR LF XON)', () => {
      const bytes = ZModemEncoder.buildHexHeader(ZRQINIT, [0, 0, 0, 0]);
      expect(bytes.length).toBe(21);
    });

    it('uses lowercase hex chars', () => {
      // type = 0xab, data = [0xcd, 0xef, 0xfa, 0xbe] — all need
      // letters in their hex representation
      const bytes = ZModemEncoder.buildHexHeader(0xab, [0xcd, 0xef, 0xfa, 0xbe]);
      // Slice out just the hex char region (bytes 4..18)
      const hexRegion = bytes.slice(4, 18);
      for (const b of hexRegion) {
        // Each char is either 0-9 or a-f
        const isDigit = b >= 0x30 && b <= 0x39;
        const isLowerHex = b >= 0x61 && b <= 0x66;
        expect(isDigit || isLowerHex).toBe(true);
      }
    });
  });

  // ──────────────────── headers: bin16 ────────────────────

  describe('binary-16 headers', () => {
    it('round-trips ZACK', () => {
      const bytes = ZModemEncoder.buildBin16Header(ZACK, [0x40, 0x30, 0x20, 0x10]);
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZACK);
      expect(headers[0]!.encoding).toBe('bin16');
      expect(headers[0]!.getPosition()).toBe(0x10203040);
    });

    it('starts with ZPAD ZDLE ZBIN', () => {
      const bytes = ZModemEncoder.buildBin16Header(ZACK, [0, 0, 0, 0]);
      expect(bytes[0]).toBe(ZPAD);
      expect(bytes[1]).toBe(ZDLE);
      expect(bytes[2]).toBe(ZBIN);
    });

    it('escapes XON/XOFF/DLE/CAN bytes in payload', () => {
      // All four data bytes need escaping
      const bytes = ZModemEncoder.buildBin16Header(ZACK, [0x11, 0x13, 0x10, 0x18]);
      // The escaped form has ZDLE followed by (byte ^ 0x40):
      //   0x11 → 0x18 0x51
      //   0x13 → 0x18 0x53
      //   0x10 → 0x18 0x50
      //   0x18 → 0x18 0x58
      const stream = [...bytes];
      // Check that ZDLE escape pairs appear at positions covering the data
      // (rather than as raw bytes that would break the parser)
      expect(stream.includes(0x11)).toBe(false);  // bare XON should not appear
      expect(stream.includes(0x13)).toBe(false);  // bare XOFF should not appear
      // ZDLE (0x18) appears multiple times — once as frame-leader, once per escape
      const zdleCount = stream.filter((b) => b === ZDLE).length;
      expect(zdleCount).toBeGreaterThanOrEqual(5); // leader + 4 escapes

      // Round-trip confirms the escapes are well-formed
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect([...headers[0]!.data]).toEqual([0x11, 0x13, 0x10, 0x18]);
    });

    it('round-trips with random-ish data including high bits', () => {
      const data: [number, number, number, number] = [0xff, 0x80, 0x7f, 0x01];
      const bytes = ZModemEncoder.buildBin16Header(ZDATA, data);
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect([...headers[0]!.data]).toEqual([0xff, 0x80, 0x7f, 0x01]);
    });
  });

  // ──────────────────── headers: bin32 ────────────────────

  describe('binary-32 headers', () => {
    it('round-trips ZDATA', () => {
      const bytes = ZModemEncoder.buildBin32Header(ZDATA, [0x00, 0x04, 0x00, 0x00]);
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect(headers[0]!.type).toBe(ZDATA);
      expect(headers[0]!.encoding).toBe('bin32');
      expect(headers[0]!.getPosition()).toBe(1024);
    });

    it('starts with ZPAD ZDLE ZBIN32', () => {
      const bytes = ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]);
      expect(bytes[0]).toBe(ZPAD);
      expect(bytes[1]).toBe(ZDLE);
      expect(bytes[2]).toBe(ZBIN32);
    });

    it('round-trips a large position (>2GB) as unsigned', () => {
      // 0x80000000 has the sign bit set; verify it survives the
      // encode-decode round trip as an unsigned value.
      const data: [number, number, number, number] = [0x00, 0x00, 0x00, 0x80];
      const bytes = ZModemEncoder.buildBin32Header(ZDATA, data);
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect(headers[0]!.getPosition()).toBe(0x80000000);
      expect(headers[0]!.getPosition()).toBeGreaterThan(0);
    });
  });

  // ──────────────────── subpackets ────────────────────

  describe('CRC-16 subpackets', () => {
    it('round-trips a small ZCRCG subpacket', () => {
      const data = new Uint8Array([0x41, 0x42, 0x43, 0x44]);
      const bytes = ZModemEncoder.buildSubpacketCrc16(data, ZCRCG);
      const result = decodeSubpacket(bytes, 'crc16');
      expect(result.crcValid).toBe(true);
      expect(result.marker).toBe(ZCRCG);
      expect([...result.data]).toEqual([0x41, 0x42, 0x43, 0x44]);
    });

    it('handles data with embedded escape-needing bytes', () => {
      // XON, XOFF, ZDLE all in the data
      const data = new Uint8Array([0x41, 0x11, 0x13, 0x18, 0x42]);
      const bytes = ZModemEncoder.buildSubpacketCrc16(data, ZCRCE);
      const result = decodeSubpacket(bytes, 'crc16');
      expect(result.crcValid).toBe(true);
      expect([...result.data]).toEqual([0x41, 0x11, 0x13, 0x18, 0x42]);
    });

    it('supports all four end-markers', () => {
      for (const marker of [ZCRCE, ZCRCG, ZCRCQ, ZCRCW]) {
        const bytes = ZModemEncoder.buildSubpacketCrc16(
          new Uint8Array([0x55, 0xaa]),
          marker,
        );
        const result = decodeSubpacket(bytes, 'crc16');
        expect(result.marker).toBe(marker);
        expect(result.crcValid).toBe(true);
      }
    });

    it('handles empty data subpackets', () => {
      // ZMODEM allows zero-length subpackets ending in ZCRCE
      const bytes = ZModemEncoder.buildSubpacketCrc16(new Uint8Array(0), ZCRCE);
      const result = decodeSubpacket(bytes, 'crc16');
      expect(result.crcValid).toBe(true);
      expect(result.data.length).toBe(0);
    });

    it('handles a large subpacket (1024 bytes)', () => {
      // 1024-byte subpacket is the typical max for ZMODEM with CRC-16
      const data = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) data[i] = i & 0xff;
      const bytes = ZModemEncoder.buildSubpacketCrc16(data, ZCRCG);
      const result = decodeSubpacket(bytes, 'crc16');
      expect(result.crcValid).toBe(true);
      expect(result.data.length).toBe(1024);
      // Spot-check a few values
      expect(result.data[0]).toBe(0);
      expect(result.data[100]).toBe(100);
      expect(result.data[255]).toBe(255);
      expect(result.data[256]).toBe(0); // wrapped
    });
  });

  describe('CRC-32 subpackets', () => {
    it('round-trips a small subpacket', () => {
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const bytes = ZModemEncoder.buildSubpacketCrc32(data, ZCRCG);
      const result = decodeSubpacket(bytes, 'crc32');
      expect(result.crcValid).toBe(true);
      expect([...result.data]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    it('handles binary data with all 256 byte values', () => {
      const data = new Uint8Array(256);
      for (let i = 0; i < 256; i++) data[i] = i;
      const bytes = ZModemEncoder.buildSubpacketCrc32(data, ZCRCE);
      const result = decodeSubpacket(bytes, 'crc32');
      expect(result.crcValid).toBe(true);
      expect(result.data.length).toBe(256);
      for (let i = 0; i < 256; i++) {
        expect(result.data[i]).toBe(i);
      }
    });
  });

  // ──────────────────── convenience builders ────────────────────

  describe('common frames', () => {
    it('buildZRINIT defaults to CANFDX | CANOVIO | CANFC32', () => {
      const bytes = ZModemEncoder.buildZRINIT();
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZRINIT);
      expect(headers[0]!.getCapabilityFlags()).toBe(
        CANFDX | CANOVIO | CANFC32,
      );
    });

    it('buildZRINIT with custom flags', () => {
      const bytes = ZModemEncoder.buildZRINIT(CANFC32);
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.getCapabilityFlags()).toBe(CANFC32);
    });

    it('buildZRINIT with max buffer size', () => {
      const bytes = ZModemEncoder.buildZRINIT(CANFC32, 4096);
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.getMaxBufferSize()).toBe(4096);
    });

    it('buildZRQINIT', () => {
      const bytes = ZModemEncoder.buildZRQINIT();
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZRQINIT);
      expect([...headers[0]!.data]).toEqual([0, 0, 0, 0]);
    });

    it('buildZACK encodes position as a hex header (spec-compliant)', () => {
      // Per ZMODEM spec, ZACK is sent as HEX, not binary. (Receiver
      // responses always go hex so the sender can sample for them.)
      // Pre-Stage-6, this encoder defaulted to bin32, which our
      // round-trip tests accepted but real BBSes never see —
      // ZModemReceive only ever sends ZACK to confirm subpackets.
      const bytes = ZModemEncoder.buildZACK(2048);
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZACK);
      expect(headers[0]!.encoding).toBe('hex');
      expect(headers[0]!.getPosition()).toBe(2048);
    });

    it('buildZACK omits the XON trailer (spec exception)', () => {
      // XON is appended to every hex header EXCEPT ZACK and ZFIN.
      // ZACK omits XON to protect software flow control during
      // streaming transfers — an inadvertent XON would unstick
      // the sender's flow control state.
      const bytes = ZModemEncoder.buildZACK(0);
      // 4 leader + 14 hex chars + CR + LF = 20 bytes (no trailing XON)
      expect(bytes.length).toBe(20);
      expect(bytes[bytes.length - 1]).toBe(0x0a); // LF, not XON
    });

    it('buildZRPOS as hex header', () => {
      const bytes = ZModemEncoder.buildZRPOS(8192);
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZRPOS);
      expect(headers[0]!.encoding).toBe('hex');
      expect(headers[0]!.getPosition()).toBe(8192);
    });

    it('buildZNAK', () => {
      const bytes = ZModemEncoder.buildZNAK();
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZNAK);
    });

    it('buildZFIN', () => {
      const bytes = ZModemEncoder.buildZFIN();
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZFIN);
    });

    it('buildZABORT', () => {
      const bytes = ZModemEncoder.buildZABORT();
      const { headers } = decodeFrame(bytes);
      expect(headers[0]!.type).toBe(ZABORT);
    });

    it('buildAbortSequence is 8 CANs + 10 backspaces', () => {
      const bytes = ZModemEncoder.buildAbortSequence();
      expect(bytes.length).toBe(18);
      for (let i = 0; i < 8; i++) expect(bytes[i]).toBe(0x18);
      for (let i = 8; i < 18; i++) expect(bytes[i]).toBe(0x08);
    });
  });

  // ──────────────────── golden vectors ────────────────────

  /*
    Hand-computed wire byte sequences. These ensure our encoder
    produces exactly the bytes lrzsz/zmodem.js would produce — if
    the round-trip tests pass but a golden vector fails, the bug
    is somewhere both encoder AND decoder are wrong in the same
    way.

    Golden vectors below are computed manually with reference
    to the protocol spec; if any fail, suspect the encoder first
    (the decoder has been tested against synthetic frames built
    by the same encoder, so a decoder bug would have surfaced).
  */

  describe('golden wire vectors', () => {
    it('ZRQINIT hex form matches reference', () => {
      // ZRQINIT (type 0x00) with all-zero data:
      //   CRC-16 over [0,0,0,0,0] + two-zero shift-out = 0x0000
      // Expected wire bytes:
      //   ZPAD ZPAD ZDLE 'B' '0' '0' '0' '0' '0' '0' '0' '0' '0' '0' '0' '0' '0' '0' CR LF XON
      const bytes = ZModemEncoder.buildZRQINIT();
      // The first 4 bytes are leaders
      expect(bytes[0]).toBe(0x2a);
      expect(bytes[1]).toBe(0x2a);
      expect(bytes[2]).toBe(0x18);
      expect(bytes[3]).toBe(0x42);
      // 14 hex chars of '0' (since payload is all zero AND CRC-16 of
      // [0,0,0,0,0,0,0] is 0x0000)
      for (let i = 4; i < 18; i++) {
        expect(bytes[i]).toBe(0x30); // '0'
      }
      // Trailer
      expect(bytes[18]).toBe(0x0d);
      expect(bytes[19]).toBe(0x0a);
      expect(bytes[20]).toBe(0x11);
    });

    it('ZACK hex at position 0 starts with the right leader', () => {
      // ZACK is now hex-encoded per spec (Stage 6 fix). The leader
      // is ZPAD ZPAD ZDLE ZHEX (`* * \x18 B`) instead of the old
      // pre-fix ZPAD ZDLE ZBIN32 (`* \x18 C`).
      const bytes = ZModemEncoder.buildZACK(0);
      expect(bytes[0]).toBe(0x2a); // ZPAD
      expect(bytes[1]).toBe(0x2a); // ZPAD
      expect(bytes[2]).toBe(0x18); // ZDLE
      expect(bytes[3]).toBe(0x42); // ZHEX ('B')
      // Type byte ZACK = 0x03 → two hex chars '0' '3'
      expect(bytes[4]).toBe(0x30);
      expect(bytes[5]).toBe(0x33);
    });

    it('encoder + decoder agree on 100 random round trips', () => {
      // Throw lots of random frames at the encoder and verify the
      // decoder reads them back identical. This catches subtle
      // CRC/escape bugs that pinpoint tests might miss.
      for (let i = 0; i < 100; i++) {
        const type = Math.floor(Math.random() * 0x14); // ZRQINIT..ZSTDERR
        const data: [number, number, number, number] = [
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
        ];
        const useBin32 = (i & 1) === 0;
        const bytes = useBin32
          ? ZModemEncoder.buildBin32Header(type, data)
          : ZModemEncoder.buildBin16Header(type, data);

        const { headers, errors } = decodeFrame(bytes);
        expect(errors).toEqual([]);
        expect(headers.length).toBe(1);
        expect(headers[0]!.type).toBe(type);
        expect([...headers[0]!.data]).toEqual(data);
      }
    });
  });

  // ──────────────────── ESCCTL mode ────────────────────

  describe('ESCCTL escape mode', () => {
    it('without escctl, only telnet-dangerous bytes are escaped', () => {
      // 0x05 is "ENQ" — not in the default escape set
      const bytes = ZModemEncoder.buildBin16Header(ZACK, [0x05, 0x06, 0x07, 0x09]);
      // None of these bytes need escaping by default; expect them raw
      const stream = [...bytes];
      expect(stream.includes(0x05)).toBe(true);
      expect(stream.includes(0x06)).toBe(true);
    });

    it('with escctl, all control characters get escaped', () => {
      // With escctl=true, bytes where (b & 0x60) == 0 (i.e.
      // 0x00..0x1F and 0x80..0x9F) all get escaped too
      const bytes = ZModemEncoder.buildBin16Header(
        ZACK,
        [0x05, 0x06, 0x07, 0x09],
        true,
      );
      const stream = [...bytes];
      expect(stream.includes(0x05)).toBe(false);
      expect(stream.includes(0x06)).toBe(false);
      // Round-trip still works
      const { headers, errors } = decodeFrame(bytes);
      expect(errors).toEqual([]);
      expect([...headers[0]!.data]).toEqual([0x05, 0x06, 0x07, 0x09]);
    });
  });
});
