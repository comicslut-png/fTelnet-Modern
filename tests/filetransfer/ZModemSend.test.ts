import { describe, it, expect, beforeEach } from 'vitest';
import {
  ZRINIT, ZRQINIT, ZFILE, ZDATA, ZEOF, ZFIN, ZSKIP, ZNAK,
  CANFDX, CANOVIO, CANFC32,
} from '@filetransfer/ZModem.js';
import { ZModemDecoder, type ZModemDecoderEvents } from '@filetransfer/ZModemDecoder.js';
import { ZModemEncoder } from '@filetransfer/ZModemEncoder.js';
import { ZModemHeader } from '@filetransfer/ZModemHeader.js';
import {
  ZModemSend,
  type ZModemFileToSend,
  type ZModemSendCallbacks,
} from '@filetransfer/ZModemSend.js';

/*
  ZModemSend tests — Phase 4 Stage 5.

  Strategy mirrors Stage 4's tests: simulate the receiver with the
  encoder. We build receiver-side bytes (ZRINIT, ZRPOS, ZFIN, etc.)
  with ZModemEncoder, feed them to ZModemSend, then decode the
  sender's output via ZModemDecoder to verify the conversation went
  the way ZMODEM expects.
*/

describe('ZModemSend', () => {
  let bytesSent: Uint8Array[];
  let filesStarted: ZModemFileToSend[];
  let filesComplete: ZModemFileToSend[];
  let progressEvents: Array<{ sent: number; total: number }>;
  let sessionComplete: boolean;
  let errors: string[];

  beforeEach(() => {
    bytesSent = [];
    filesStarted = [];
    filesComplete = [];
    progressEvents = [];
    sessionComplete = false;
    errors = [];
  });

  function makeCallbacks(): ZModemSendCallbacks {
    return {
      onBytesToSend: (b) => bytesSent.push(b),
      onFileStart: (f) => filesStarted.push(f),
      onFileComplete: (f) => filesComplete.push(f),
      onProgress: (s, t) => progressEvents.push({ sent: s, total: t }),
      onSessionComplete: () => { sessionComplete = true; },
      onError: (m) => errors.push(m),
    };
  }

  // ─────────────────── helpers ───────────────────

  /** Decode all bytes the sender has sent so far. Also collects subpacket data. */
  function decodeSent(): {
    headers: ZModemHeader[];
    subpackets: Array<{ data: Uint8Array; marker: number; crcValid: boolean }>;
  } {
    const headers: ZModemHeader[] = [];
    const subpackets: Array<{ data: Uint8Array; marker: number; crcValid: boolean }> = [];
    let currentChunks: Uint8Array[] = [];
    let crcMode: 'crc16' | 'crc32' = 'crc16';

    const decoder = new ZModemDecoder({
      onHeader: (h) => {
        headers.push(h);
        // Lock crcMode once we see the sender use bin32
        if (h.encoding === 'bin32') crcMode = 'crc32';
        // ZFILE is followed by a filename subpacket; ZDATA is
        // followed by data subpackets.
        if (h.type === ZFILE || h.type === ZDATA) {
          decoder.expectSubpacket(crcMode);
        }
      },
      onSubpacketData: (chunk) => {
        currentChunks.push(chunk);
      },
      onSubpacketEnd: (marker, crcValid) => {
        let total = 0;
        for (const c of currentChunks) total += c.length;
        const data = new Uint8Array(total);
        let off = 0;
        for (const c of currentChunks) {
          data.set(c, off);
          off += c.length;
        }
        subpackets.push({ data, marker, crcValid });
        currentChunks = [];

        // After ZCRCG/ZCRCQ, more subpackets follow. After ZCRCE/W,
        // the next thing is a header.
        if (marker === 0x69 /* ZCRCG */ || marker === 0x6a /* ZCRCQ */) {
          decoder.expectSubpacket(crcMode);
        }
      },
    } as ZModemDecoderEvents);

    for (const chunk of bytesSent) {
      decoder.feed(chunk);
    }
    return { headers, subpackets };
  }

  /** Simulate the receiver sending a ZRINIT with CRC-32 support. */
  function feedReceiverZRINIT(send: ZModemSend): void {
    send.feedBytes(
      ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32),
    );
  }

  /** Simulate the receiver sending ZRPOS at a given position. */
  function feedReceiverZRPOS(send: ZModemSend, position: number): void {
    send.feedBytes(ZModemEncoder.buildZRPOS(position));
  }

  /** Simulate the receiver sending ZFIN. */
  function feedReceiverZFIN(send: ZModemSend): void {
    send.feedBytes(ZModemEncoder.buildZFIN());
  }

  /** Reset bytesSent — drop anything previously captured. */
  function clearSent(): void {
    bytesSent = [];
  }

  /** Concatenate all of bytesSent into a single Uint8Array. */
  function allSent(): Uint8Array {
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

  // ─────────────────── start ───────────────────

  describe('start', () => {
    it('sends ZRQINIT immediately', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1, 2, 3]) }],
        makeCallbacks(),
      );
      send.start();

      const { headers } = decodeSent();
      expect(headers.length).toBe(1);
      expect(headers[0]!.type).toBe(ZRQINIT);
    });

    it('with no files, completes immediately', () => {
      const send = new ZModemSend([], makeCallbacks());
      send.start();

      expect(sessionComplete).toBe(true);
      expect(bytesSent.length).toBe(0);
    });

    it('is idempotent', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      send.start();
      send.start();
      const { headers } = decodeSent();
      expect(headers.filter((h) => h.type === ZRQINIT).length).toBe(1);
    });
  });

  // ─────────────────── single-file happy path ───────────────────

  describe('single-file send (happy path)', () => {
    function simulateSingleFile(
      filename: string,
      content: number[],
    ): { send: ZModemSend } {
      const file: ZModemFileToSend = {
        name: filename,
        data: new Uint8Array(content),
      };
      const send = new ZModemSend([file], makeCallbacks());

      send.start();
      // ZRQINIT sent. Receiver replies ZRINIT.
      feedReceiverZRINIT(send);
      // Sender now sends ZFILE + meta subpacket. Receiver replies ZRPOS(0).
      feedReceiverZRPOS(send, 0);
      // Sender sends ZDATA + subpackets + ZEOF. Receiver replies ZRINIT (next file ready).
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      // No more files → sender sends ZFIN. Receiver replies ZFIN.
      feedReceiverZFIN(send);

      return { send };
    }

    it('sends a small file end to end', () => {
      simulateSingleFile('hello.txt', [0x48, 0x65, 0x6c, 0x6c, 0x6f]);

      expect(errors).toEqual([]);
      expect(filesStarted.length).toBe(1);
      expect(filesStarted[0]!.name).toBe('hello.txt');
      expect(filesComplete.length).toBe(1);
      expect(sessionComplete).toBe(true);

      const { headers, subpackets } = decodeSent();

      // Verify the wire conversation
      expect(headers[0]!.type).toBe(ZRQINIT);           // initial
      expect(headers.find((h) => h.type === ZFILE)).toBeDefined();
      expect(headers.find((h) => h.type === ZDATA)).toBeDefined();
      expect(headers.find((h) => h.type === ZEOF)).toBeDefined();
      expect(headers.find((h) => h.type === ZFIN)).toBeDefined();

      // ZEOF should carry the file size
      const zeof = headers.find((h) => h.type === ZEOF);
      expect(zeof!.getPosition()).toBe(5);

      // We should have seen a metadata subpacket (the filename
      // string) and at least one data subpacket
      expect(subpackets.length).toBeGreaterThanOrEqual(2);
      // The data subpacket should contain "Hello"
      const dataSubpackets = subpackets.filter((s) => s.crcValid);
      const lastData = dataSubpackets[dataSubpackets.length - 1]!;
      expect([...lastData.data]).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it('uses CRC-32 when receiver advertises CANFC32', () => {
      simulateSingleFile('x.bin', [0, 1, 2]);
      const { headers } = decodeSent();
      // ZFILE / ZDATA / ZEOF should all be bin32
      const zfile = headers.find((h) => h.type === ZFILE);
      const zdata = headers.find((h) => h.type === ZDATA);
      const zeof = headers.find((h) => h.type === ZEOF);
      expect(zfile!.encoding).toBe('bin32');
      expect(zdata!.encoding).toBe('bin32');
      expect(zeof!.encoding).toBe('bin32');
    });

    it('uses CRC-16 when receiver does NOT advertise CANFC32', () => {
      const file: ZModemFileToSend = {
        name: 't.bin',
        data: new Uint8Array([1, 2, 3]),
      };
      const send = new ZModemSend([file], makeCallbacks());

      send.start();
      // Receiver supports FDX + OVIO but NOT FC32 → sender should use CRC-16
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO));
      feedReceiverZRPOS(send, 0);
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO));
      feedReceiverZFIN(send);

      const { headers } = decodeSent();
      const zdata = headers.find((h) => h.type === ZDATA);
      expect(zdata!.encoding).toBe('bin16');
    });

    it('fires onProgress events', () => {
      simulateSingleFile('p.bin', [1, 2, 3, 4, 5]);
      expect(progressEvents.length).toBeGreaterThan(0);
      const last = progressEvents[progressEvents.length - 1]!;
      expect(last.sent).toBe(5);
      expect(last.total).toBe(5);
    });

    it('handles file with binary content including escape-needing bytes', () => {
      simulateSingleFile('bin.dat', [0x00, 0x11, 0x13, 0x18, 0xff]);
      expect(errors).toEqual([]);
      const { subpackets } = decodeSent();
      const dataSub = subpackets.find(
        (s) => s.crcValid && s.data.length === 5,
      );
      expect(dataSub).toBeDefined();
      expect([...dataSub!.data]).toEqual([0x00, 0x11, 0x13, 0x18, 0xff]);
    });
  });

  // ─────────────────── multi-subpacket files ───────────────────

  describe('multi-subpacket files', () => {
    it('chunks a large file into 1024-byte subpackets', () => {
      // 2500 bytes → 3 subpackets: 1024 + 1024 + 452
      const content = new Uint8Array(2500);
      for (let i = 0; i < 2500; i++) content[i] = i & 0xff;
      const file: ZModemFileToSend = { name: 'big.bin', data: content };
      const send = new ZModemSend([file], makeCallbacks());

      send.start();
      feedReceiverZRINIT(send);
      feedReceiverZRPOS(send, 0);
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      feedReceiverZFIN(send);

      expect(errors).toEqual([]);

      const { subpackets } = decodeSent();
      // Filter to data subpackets only (skip the file-meta subpacket
      // which has the filename string)
      const dataSubs = subpackets.filter(
        (s) =>
          s.crcValid &&
          s.data.length > 0 &&
          // Heuristic: file-meta subpacket starts with the filename
          // 'big.bin\0...', so its first byte is 'b' = 0x62. Data
          // subpackets start with our test content (which begins
          // with 0x00 because data[0] = 0).
          !(s.data[0] === 0x62 && s.marker === 0x6b /* ZCRCW */),
      );

      // Should be 3 chunks total
      expect(dataSubs.length).toBe(3);
      expect(dataSubs[0]!.data.length).toBe(1024);
      expect(dataSubs[1]!.data.length).toBe(1024);
      expect(dataSubs[2]!.data.length).toBe(452);
      // Last chunk should end with ZCRCE
      expect(dataSubs[2]!.marker).toBe(0x68); // ZCRCE
      // Earlier chunks should be ZCRCG (no ACK needed)
      expect(dataSubs[0]!.marker).toBe(0x69); // ZCRCG
      expect(dataSubs[1]!.marker).toBe(0x69); // ZCRCG
    });

    it('progress fires multiple times for a large file', () => {
      const content = new Uint8Array(2500);
      const file: ZModemFileToSend = { name: 'big.bin', data: content };
      const send = new ZModemSend([file], makeCallbacks());

      send.start();
      feedReceiverZRINIT(send);
      feedReceiverZRPOS(send, 0);
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      feedReceiverZFIN(send);

      // 3 subpackets → 3 progress events
      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      expect(progressEvents[0]!.sent).toBe(1024);
      expect(progressEvents[1]!.sent).toBe(2048);
      expect(progressEvents[2]!.sent).toBe(2500);
    });
  });

  // ─────────────────── multi-file batch ───────────────────

  describe('multi-file batch', () => {
    it('sends two files in a single session', () => {
      const files: ZModemFileToSend[] = [
        { name: 'a.txt', data: new Uint8Array([0x41]) },
        { name: 'b.txt', data: new Uint8Array([0x42, 0x42]) },
      ];
      const send = new ZModemSend(files, makeCallbacks());

      send.start();
      feedReceiverZRINIT(send);             // initial
      feedReceiverZRPOS(send, 0);            // for file 1
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32)); // ready for file 2
      feedReceiverZRPOS(send, 0);            // for file 2
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32)); // ready for next (none)
      feedReceiverZFIN(send);                // batch done

      expect(errors).toEqual([]);
      expect(filesStarted.length).toBe(2);
      expect(filesStarted[0]!.name).toBe('a.txt');
      expect(filesStarted[1]!.name).toBe('b.txt');
      expect(filesComplete.length).toBe(2);
      expect(sessionComplete).toBe(true);

      const { headers } = decodeSent();
      // Should have two ZFILE and two ZEOF, one ZFIN
      expect(headers.filter((h) => h.type === ZFILE).length).toBe(2);
      expect(headers.filter((h) => h.type === ZEOF).length).toBe(2);
      expect(headers.filter((h) => h.type === ZFIN).length).toBe(1);
    });

    it('emits OO trailer after final ZFIN exchange', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      feedReceiverZRINIT(send);
      feedReceiverZRPOS(send, 0);
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      feedReceiverZFIN(send);

      const all = allSent();
      // Last two bytes should be 'O' 'O'
      expect(all[all.length - 2]).toBe(0x4f);
      expect(all[all.length - 1]).toBe(0x4f);
    });
  });

  // ─────────────────── resume ───────────────────

  describe('resume (ZRPOS with non-zero position)', () => {
    it('resumes from receiver-specified offset', () => {
      // Receiver claims to have first 100 bytes already
      const content = new Uint8Array(500);
      for (let i = 0; i < 500; i++) content[i] = i & 0xff;
      const send = new ZModemSend(
        [{ name: 'r.bin', data: content }],
        makeCallbacks(),
      );

      send.start();
      feedReceiverZRINIT(send);
      // Receiver says "I have bytes 0-99 already, send from 100"
      feedReceiverZRPOS(send, 100);
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      feedReceiverZFIN(send);

      const { headers, subpackets } = decodeSent();
      // ZDATA should be at position 100
      const zdata = headers.find((h) => h.type === ZDATA);
      expect(zdata!.getPosition()).toBe(100);

      // Total data we sent should be 400 bytes (500 - 100)
      const dataSubs = subpackets.filter(
        (s) => s.crcValid && s.marker === 0x68 /* ZCRCE */ && s.data.length < 1024,
      );
      // The final ZCRCE subpacket holds the tail
      expect(dataSubs.length).toBeGreaterThan(0);

      // ZEOF should still report the full file size (500)
      const zeof = headers.find((h) => h.type === ZEOF);
      expect(zeof!.getPosition()).toBe(500);
    });

    it('treats ZRPOS beyond file end as skip', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1, 2, 3]) }],
        makeCallbacks(),
      );

      send.start();
      feedReceiverZRINIT(send);
      // Receiver says "skip to byte 1000" but file is only 3 bytes
      feedReceiverZRPOS(send, 1000);
      // No ZRINIT-next-file because there's no next file; sender
      // proceeds to ZFIN
      feedReceiverZFIN(send);

      const { headers } = decodeSent();
      // Should NOT have sent ZDATA for this file
      expect(headers.filter((h) => h.type === ZDATA).length).toBe(0);
      // Should still have ZFIN
      expect(headers.filter((h) => h.type === ZFIN).length).toBe(1);
    });
  });

  // ─────────────────── error handling ───────────────────

  describe('error handling', () => {
    it('aborts on receiver ZABORT', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      send.feedBytes(ZModemEncoder.buildZABORT());

      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('ZABORT');
    });

    it('aborts on 5+ consecutive CAN bytes', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      send.feedBytes(new Uint8Array([0x18, 0x18, 0x18, 0x18, 0x18]));

      expect(errors.length).toBe(1);
      expect(errors[0]!).toContain('out-of-band');
    });

    it('does not abort on 4 CANs (below threshold)', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      send.feedBytes(new Uint8Array([0x18, 0x18, 0x18, 0x18]));

      expect(errors.length).toBe(0);
    });

    it('handles ZSKIP by moving to next file', () => {
      const send = new ZModemSend(
        [
          { name: 'a.txt', data: new Uint8Array([1, 2, 3]) },
          { name: 'b.txt', data: new Uint8Array([4, 5, 6]) },
        ],
        makeCallbacks(),
      );

      send.start();
      feedReceiverZRINIT(send);
      // Receiver skips file 1
      send.feedBytes(ZModemEncoder.buildHexHeader(ZSKIP, [0, 0, 0, 0]));
      // Now sender should be starting file 2 — receiver sends ZRPOS
      feedReceiverZRPOS(send, 0);
      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      feedReceiverZFIN(send);

      expect(errors).toEqual([]);
      expect(filesStarted.length).toBe(2);
      // File 1 should be marked complete (we report it via the
      // completion callback even though we skipped it; downstream
      // UI can interpret).
      expect(filesComplete.length).toBe(2);
    });

    it('resends last header on receiver ZNAK', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );

      send.start();
      // ZRQINIT sent. Now receiver replies ZNAK.
      const beforeNak = bytesSent.length;
      send.feedBytes(ZModemEncoder.buildZNAK());
      // Sender should have resent something (the ZRQINIT)
      expect(bytesSent.length).toBeGreaterThan(beforeNak);
    });
  });

  // ─────────────────── user abort ───────────────────

  describe('user abort', () => {
    it('emits abort sequence', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      clearSent();

      send.abort();

      const all = allSent();
      // 8 CANs + 10 BS = 18 bytes
      expect(all.length).toBe(18);
      for (let i = 0; i < 8; i++) expect(all[i]).toBe(0x18);
      for (let i = 8; i < 18; i++) expect(all[i]).toBe(0x08);
      expect(errors.length).toBe(1);
    });

    it('ignores feedBytes after abort', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      send.abort();
      clearSent();

      send.feedBytes(ZModemEncoder.buildZRINIT(CANFDX | CANOVIO | CANFC32));
      expect(bytesSent.length).toBe(0);
    });

    it('abort() is idempotent', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      send.abort();
      const before = bytesSent.length;
      send.abort();
      expect(bytesSent.length).toBe(before);
    });
  });

  // ─────────────────── file metadata ───────────────────

  describe('file metadata', () => {
    it('encodes filename in the meta subpacket', () => {
      const send = new ZModemSend(
        [{ name: 'special_name.zip', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      feedReceiverZRINIT(send);

      // Look for the file meta subpacket
      const { subpackets } = decodeSent();
      // The meta subpacket has marker ZCRCW (0x6b) and contains
      // the filename followed by NUL.
      const metaSub = subpackets.find((s) => s.marker === 0x6b);
      expect(metaSub).toBeDefined();
      // First chars should be the filename
      const nameBytes = 'special_name.zip'.split('').map((c) => c.charCodeAt(0));
      for (let i = 0; i < nameBytes.length; i++) {
        expect(metaSub!.data[i]).toBe(nameBytes[i]);
      }
      // Then NUL
      expect(metaSub!.data[nameBytes.length]).toBe(0);
    });

    it('encodes UTF-8 filenames', () => {
      const send = new ZModemSend(
        [{ name: 'héllo.txt', data: new Uint8Array([1]) }],
        makeCallbacks(),
      );
      send.start();
      feedReceiverZRINIT(send);

      const { subpackets } = decodeSent();
      const metaSub = subpackets.find((s) => s.marker === 0x6b);
      expect(metaSub).toBeDefined();
      // 'h' 0x68, then 'é' UTF-8 = 0xc3 0xa9, then 'llo.txt'
      expect(metaSub!.data[0]).toBe(0x68);
      expect(metaSub!.data[1]).toBe(0xc3);
      expect(metaSub!.data[2]).toBe(0xa9);
    });

    it('encodes file size in the metadata string', () => {
      const send = new ZModemSend(
        [{ name: 't.txt', data: new Uint8Array(12345) }],
        makeCallbacks(),
      );
      send.start();
      feedReceiverZRINIT(send);

      const { subpackets } = decodeSent();
      const metaSub = subpackets.find((s) => s.marker === 0x6b);
      // After the filename and NUL, the metadata string should start
      // with the decimal size '12345'
      const subAsString = new TextDecoder().decode(metaSub!.data);
      expect(subAsString).toContain('12345');
    });
  });
});
