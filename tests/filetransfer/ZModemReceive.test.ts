import { describe, it, expect, beforeEach } from 'vitest';
import {
  ZRQINIT, ZRINIT, ZFILE, ZDATA, ZEOF, ZFIN, ZABORT, ZNAK, ZSKIP,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
} from '@filetransfer/ZModem.js';
import { ZModemDecoder, type ZModemDecoderEvents } from '@filetransfer/ZModemDecoder.js';
import { ZModemEncoder } from '@filetransfer/ZModemEncoder.js';
import { ZModemHeader } from '@filetransfer/ZModemHeader.js';
import { ZModemReceive, type ZModemReceiveCallbacks } from '@filetransfer/ZModemReceive.js';
import type { ZModemFileInfo } from '@filetransfer/ZModemFileInfo.js';
import { parseZFileSubpacket } from '@filetransfer/ZModemFileInfo.js';

/*
  ZModemReceive tests — Phase 4 Stage 4.

  Strategy: simulate a sender by using ZModemEncoder to produce wire
  bytes, feed them to ZModemReceive, then inspect the bytes the
  receiver sent back (by decoding them with ZModemDecoder). This
  exercises the full encode/decode/state-machine loop and verifies
  the conversation goes the way ZMODEM expects.

  A typical test:
    1. Build a "sender output" byte sequence (ZRQINIT, ZFILE+meta,
       ZDATA+data, ZEOF, ZFIN).
    2. Feed those bytes to ZModemReceive via .feedBytes()
    3. Decode whatever ZModemReceive wrote via .onBytesToSend to
       verify it sent the expected response headers in order.
*/

describe('ZModemReceive', () => {
  let bytesSent: Uint8Array[];
  let filesStarted: ZModemFileInfo[];
  let fileData: Uint8Array[];
  let filesComplete: Array<{ file: ZModemFileInfo; total: number }>;
  let progressEvents: Array<{ received: number; total: number }>;
  let sessionComplete: boolean;
  let errors: string[];
  let receive: ZModemReceive;

  beforeEach(() => {
    bytesSent = [];
    filesStarted = [];
    fileData = [];
    filesComplete = [];
    progressEvents = [];
    sessionComplete = false;
    errors = [];

    const cb: ZModemReceiveCallbacks = {
      onBytesToSend: (b) => bytesSent.push(b),
      onFileStart: (f) => filesStarted.push(f),
      onFileData: (c) => fileData.push(c),
      onFileComplete: (f, t) => filesComplete.push({ file: f, total: t }),
      onProgress: (r, t) => progressEvents.push({ received: r, total: t }),
      onSessionComplete: () => { sessionComplete = true; },
      onError: (m) => errors.push(m),
    };
    receive = new ZModemReceive(cb);
  });

  // ─────────────────── helpers ───────────────────

  /** Decode all bytes the receiver has sent so far into headers. */
  function decodeSentHeaders(): ZModemHeader[] {
    const headers: ZModemHeader[] = [];
    const events: ZModemDecoderEvents = {
      onHeader: (h) => headers.push(h),
    };
    const d = new ZModemDecoder(events);
    for (const chunk of bytesSent) {
      d.feed(chunk);
    }
    return headers;
  }

  /** Concatenate all the bytes sent so far into one Uint8Array. */
  function allBytesSent(): Uint8Array {
    let total = 0;
    for (const b of bytesSent) total += b.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const b of bytesSent) {
      out.set(b, off);
      off += b.length;
    }
    return out;
  }

  /** Concatenate received file data chunks for current file. */
  function allFileData(): Uint8Array {
    let total = 0;
    for (const c of fileData) total += c.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of fileData) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  /**
   * Build a ZFILE subpacket payload: "filename\0size mtime mode serial 1 size\0"
   */
  function buildFileMetaSubpacket(name: string, size: number): number[] {
    const meta = `${size} 0 0 0 1 ${size}`;
    const out: number[] = [];
    for (let i = 0; i < name.length; i++) out.push(name.charCodeAt(i));
    out.push(0);
    for (let i = 0; i < meta.length; i++) out.push(meta.charCodeAt(i));
    out.push(0);
    return out;
  }

  // ─────────────────── start / ZRINIT ───────────────────

  describe('start', () => {
    it('sends ZRINIT immediately', () => {
      receive.start();
      const headers = decodeSentHeaders();
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZRINIT);
    });

    it('is idempotent', () => {
      receive.start();
      receive.start();
      receive.start();
      const headers = decodeSentHeaders();
      expect(headers.length).toBe(1);
    });

    it('responds to sender ZRQINIT with ZRINIT', () => {
      receive.start();
      bytesSent = []; // discard the initial ZRINIT from start()

      receive.feedBytes(ZModemEncoder.buildZRQINIT());

      const headers = decodeSentHeaders();
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZRINIT);
    });
  });

  // ─────────────────── single-file happy path ───────────────────

  describe('single-file receive (happy path)', () => {
    function simulateSingleFileTransfer(
      filename: string,
      fileContent: number[],
    ): void {
      receive.start();
      // Discard initial ZRINIT; we're focusing on what comes after
      bytesSent = [];

      // 1. Sender announces the file with ZFILE + filename subpacket
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      const metaSubpacket = ZModemEncoder.buildSubpacketCrc32(
        buildFileMetaSubpacket(filename, fileContent.length),
        ZCRCW,
      );
      receive.feedBytes(metaSubpacket);

      // Receiver should have replied ZRPOS(0)
      let headers = decodeSentHeaders();
      expect(headers[headers.length - 1]!.type).toBe(ZRPOS_TYPE);
      expect(headers[headers.length - 1]!.getPosition()).toBe(0);

      // 2. Sender sends ZDATA(0) + subpacket(content, ZCRCE) + ZEOF
      bytesSent = [];
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(fileContent, ZCRCE),
      );
      receive.feedBytes(
        ZModemEncoder.buildBin32Header(ZEOF, [
          fileContent.length & 0xff,
          (fileContent.length >>> 8) & 0xff,
          (fileContent.length >>> 16) & 0xff,
          (fileContent.length >>> 24) & 0xff,
        ]),
      );

      // Receiver should have sent ZRINIT after the ZEOF (for next file)
      headers = decodeSentHeaders();
      expect(headers[headers.length - 1]!.type).toBe(ZRINIT);

      // 3. Sender sends ZFIN
      bytesSent = [];
      receive.feedBytes(ZModemEncoder.buildZFIN());

      // Receiver should send ZFIN
      headers = decodeSentHeaders();
      expect(headers[headers.length - 1]!.type).toBe(ZFIN);
    }

    it('completes a small file transfer end-to-end', () => {
      simulateSingleFileTransfer('hello.txt', [0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

      expect(errors).toEqual([]);
      expect(filesStarted.length).toBe(1);
      expect(filesStarted[0]!.name).toBe('hello.txt');
      expect(filesStarted[0]!.size).toBe(5);
      expect(filesComplete.length).toBe(1);
      expect(filesComplete[0]!.total).toBe(5);
      expect([...allFileData()]).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(sessionComplete).toBe(true);
    });

    it('handles file with binary content including escape-needing bytes', () => {
      const content = [0x00, 0x11, 0x13, 0x18, 0xff, 0x42];
      simulateSingleFileTransfer('binary.dat', content);

      expect(errors).toEqual([]);
      expect([...allFileData()]).toEqual(content);
    });

    it('handles 1024-byte file (typical subpacket size)', () => {
      const content = Array.from({ length: 1024 }, (_, i) => i & 0xff);
      simulateSingleFileTransfer('1k.bin', content);

      expect(errors).toEqual([]);
      expect(allFileData().length).toBe(1024);
      expect(allFileData()[100]).toBe(100);
    });

    it('fires onProgress on each subpacket', () => {
      simulateSingleFileTransfer('progress.txt', [0x41, 0x42, 0x43]);
      expect(progressEvents.length).toBeGreaterThan(0);
      const last = progressEvents[progressEvents.length - 1]!;
      expect(last.received).toBe(3);
      expect(last.total).toBe(3);
    });
  });

  // ─────────────────── multi-subpacket file ───────────────────

  describe('multi-subpacket file', () => {
    it('handles a file split across multiple ZCRCG subpackets', () => {
      receive.start();
      bytesSent = [];

      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(
          buildFileMetaSubpacket('multi.bin', 12),
          ZCRCW,
        ),
      );

      // Sender sends ZDATA then three subpackets:
      //   [0..3] with ZCRCG (no ack)
      //   [4..7] with ZCRCG
      //   [8..11] with ZCRCE (end)
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([0, 1, 2, 3], ZCRCG));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([4, 5, 6, 7], ZCRCG));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([8, 9, 10, 11], ZCRCE));
      receive.feedBytes(
        ZModemEncoder.buildBin32Header(ZEOF, [12, 0, 0, 0]),
      );
      receive.feedBytes(ZModemEncoder.buildZFIN());

      expect(errors).toEqual([]);
      expect([...allFileData()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(filesComplete[0]!.total).toBe(12);
    });

    it('sends ZACK in response to ZCRCQ marker', () => {
      receive.start();
      bytesSent = [];

      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(
          buildFileMetaSubpacket('q.bin', 8),
          ZCRCW,
        ),
      );

      // ZDATA + subpacket-with-ZCRCQ (we should ACK)
      bytesSent = [];
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([0, 1, 2, 3], ZCRCQ));

      // Look for a ZACK among what we sent
      const headers = decodeSentHeaders();
      const acks = headers.filter((h) => h.type === ZACK);
      expect(acks.length).toBeGreaterThan(0);
      expect(acks[0]!.getPosition()).toBe(4);
    });

    it('sends ZACK in response to ZCRCW marker', () => {
      receive.start();
      bytesSent = [];

      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(
          buildFileMetaSubpacket('w.bin', 4),
          ZCRCW,
        ),
      );

      bytesSent = [];
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([0, 1, 2, 3], ZCRCW));

      const headers = decodeSentHeaders();
      const acks = headers.filter((h) => h.type === ZACK);
      expect(acks.length).toBeGreaterThan(0);
      expect(acks[0]!.getPosition()).toBe(4);
    });
  });

  // ─────────────────── multi-file batch ───────────────────

  describe('multi-file batch', () => {
    it('two files in one session', () => {
      receive.start();
      bytesSent = [];

      // File 1
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(
          buildFileMetaSubpacket('a.txt', 3),
          ZCRCW,
        ),
      );
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([0x41, 0x42, 0x43], ZCRCE));
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZEOF, [3, 0, 0, 0]));

      // File 2
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(
          buildFileMetaSubpacket('b.txt', 4),
          ZCRCW,
        ),
      );
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      receive.feedBytes(ZModemEncoder.buildSubpacketCrc32([0x44, 0x45, 0x46, 0x47], ZCRCE));
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZEOF, [4, 0, 0, 0]));

      // End of batch
      receive.feedBytes(ZModemEncoder.buildZFIN());

      // Sender's traditional "OO" trailer after ZFIN
      receive.feedBytes(new Uint8Array([0x4f, 0x4f]));

      expect(errors).toEqual([]);
      expect(filesStarted.length).toBe(2);
      expect(filesStarted[0]!.name).toBe('a.txt');
      expect(filesStarted[1]!.name).toBe('b.txt');
      expect(filesStarted[0]!.fileNumber).toBe(1);
      expect(filesStarted[1]!.fileNumber).toBe(2);
      expect(filesComplete.length).toBe(2);
      expect(sessionComplete).toBe(true);
    });
  });

  // ─────────────────── error handling ───────────────────

  describe('error handling', () => {
    it('sends ZNAK in response to a header with a bad CRC', () => {
      receive.start();
      bytesSent = [];

      // Build a ZRQINIT and corrupt one of its hex chars
      const bytes = [...ZModemEncoder.buildZRQINIT()];
      bytes[15]! = bytes[15]! === 0x30 ? 0x31 : 0x30; // flip a CRC nibble
      receive.feedBytes(new Uint8Array(bytes));

      const headers = decodeSentHeaders();
      const naks = headers.filter((h) => h.type === ZNAK);
      expect(naks.length).toBe(1);
    });

    it('sends ZRPOS in response to a subpacket with bad CRC', () => {
      receive.start();
      bytesSent = [];

      receive.feedBytes(ZModemEncoder.buildBin32Header(ZFILE, [0, 0, 0, 0]));
      receive.feedBytes(
        ZModemEncoder.buildSubpacketCrc32(
          buildFileMetaSubpacket('crc.bin', 8),
          ZCRCW,
        ),
      );

      bytesSent = [];
      receive.feedBytes(ZModemEncoder.buildBin32Header(ZDATA, [0, 0, 0, 0]));
      // Build a subpacket and corrupt its CRC
      const sub = [...ZModemEncoder.buildSubpacketCrc32([0, 1, 2, 3], ZCRCG)];
      sub[sub.length - 1]! ^= 0xff; // corrupt the last CRC byte
      receive.feedBytes(new Uint8Array(sub));

      const headers = decodeSentHeaders();
      const zrpos = headers.filter((h) => h.type === ZRPOS_TYPE);
      expect(zrpos.length).toBeGreaterThan(0);
    });

    it('aborts on ZABORT from sender', () => {
      receive.start();
      receive.feedBytes(ZModemEncoder.buildZABORT());

      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('ZABORT');
    });

    it('aborts on 5+ consecutive CAN bytes (out-of-band)', () => {
      receive.start();
      receive.feedBytes(new Uint8Array([0x18, 0x18, 0x18, 0x18, 0x18]));

      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('out-of-band');
    });

    it('does not abort on 4 CANs (below threshold)', () => {
      receive.start();
      receive.feedBytes(new Uint8Array([0x18, 0x18, 0x18, 0x18]));
      expect(errors.length).toBe(0);
    });

    it('does not abort on CANs separated by other bytes', () => {
      receive.start();
      receive.feedBytes(new Uint8Array([0x18, 0x41, 0x18, 0x41, 0x18, 0x41, 0x18]));
      expect(errors.length).toBe(0);
    });

    it('handles ZSKIP by waiting for next file', () => {
      receive.start();
      receive.feedBytes(ZModemEncoder.buildHexHeader(ZSKIP, [0, 0, 0, 0]));
      // After ZSKIP the receiver should send ZRINIT awaiting the
      // next ZFILE. No error.
      expect(errors).toEqual([]);
    });
  });

  // ─────────────────── ZNAK / retransmit ───────────────────

  describe('ZNAK retransmit', () => {
    it('resends the last header on receiving ZNAK', () => {
      receive.start();
      const initialBytes = allBytesSent();
      bytesSent = [];

      receive.feedBytes(ZModemEncoder.buildZNAK());

      // The receiver should have resent its last sent header (ZRINIT)
      expect(bytesSent.length).toBe(1);
      expect([...bytesSent[0]!]).toEqual([...initialBytes]);
    });
  });

  // ─────────────────── user abort ───────────────────

  describe('user abort', () => {
    it('emits abort sequence and signals error on abort()', () => {
      receive.start();
      bytesSent = [];

      receive.abort();

      // We expect three components, concatenated:
      //   1. ZABORT hex header (21 bytes: **\x18B07 + 8 hex + 4 CRC hex + \r\n + XON)
      //   2. 8 CAN bytes (the out-of-band burst)
      //   3. 10 BS bytes (terminal cleanup)
      const out = allBytesSent();
      // The hex header length depends on the exact encoder
      // implementation, but the total must end with 8 CANs + 10 BS.
      const totalLen = out.length;
      // The last 18 bytes must be 8 CANs followed by 10 BS:
      const tailStart = totalLen - 18;
      for (let i = 0; i < 8; i++) {
        expect(out[tailStart + i]).toBe(0x18);
      }
      for (let i = 0; i < 10; i++) {
        expect(out[tailStart + 8 + i]).toBe(0x08);
      }
      // The header must start with ZPAD ZPAD ZDLE:
      expect(out[0]).toBe(0x2a);
      expect(out[1]).toBe(0x2a);
      expect(out[2]).toBe(0x18);

      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('user');
    });

    it('ignores feedBytes after abort', () => {
      receive.start();
      receive.abort();
      bytesSent = [];

      receive.feedBytes(ZModemEncoder.buildZRQINIT());
      // Nothing should happen
      expect(bytesSent.length).toBe(0);
    });

    it('abort() is idempotent', () => {
      receive.start();
      receive.abort();
      const before = bytesSent.length;
      receive.abort();
      expect(bytesSent.length).toBe(before);
    });
  });

  // ─────────────────── ZModemFileInfo parsing ───────────────────

  describe('parseZFileSubpacket', () => {
    it('parses standard lrzsz format', () => {
      const meta = buildFileMetaSubpacket('foo.zip', 12345);
      const info = parseZFileSubpacket(meta);
      expect(info.name).toBe('foo.zip');
      expect(info.size).toBe(12345);
    });

    it('handles no metadata after first NUL', () => {
      const bytes: number[] = [];
      const name = 'noname.txt';
      for (let i = 0; i < name.length; i++) bytes.push(name.charCodeAt(i));
      bytes.push(0);
      const info = parseZFileSubpacket(bytes);
      expect(info.name).toBe('noname.txt');
      expect(info.size).toBe(0);
    });

    it('handles no NUL at all', () => {
      const bytes = [0x41, 0x42, 0x43]; // "ABC"
      const info = parseZFileSubpacket(bytes);
      expect(info.name).toBe('ABC');
    });

    it('decodes UTF-8 filename', () => {
      // "héllo.txt" — the é is two UTF-8 bytes
      const bytes = [
        0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f, 0x2e, 0x74, 0x78, 0x74, 0,
      ];
      const info = parseZFileSubpacket(bytes);
      expect(info.name).toBe('héllo.txt');
    });

    it('decodes mtime if present', () => {
      const bytes = buildFileMetaSubpacket('t.txt', 0);
      const info = parseZFileSubpacket(bytes);
      // We built with mtime "0" (octal), so mtime will be null
      expect(info.mtime).toBe(null);
    });

    it('returns defaults for empty input', () => {
      const info = parseZFileSubpacket([]);
      expect(info.name).toBe('');
      expect(info.size).toBe(0);
      expect(info.fileNumber).toBe(1);
    });
  });
});

// ZRPOS isn't exported as a Z* constant by name in the test imports
// — it's imported as `ZRPOS` from ZModem.ts. We re-bind here for the
// helper assertions above. (The test file imports the matching name
// at the top in cleaner files; here we shimmed it to avoid import
// noise inside the simulateSingleFileTransfer body.)
const ZRPOS_TYPE = 0x09;
const ZACK = 0x03;
const ZRPOS = ZRPOS_TYPE;
void ZRPOS;
