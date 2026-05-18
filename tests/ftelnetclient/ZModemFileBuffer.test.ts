import { describe, it, expect } from 'vitest';

/*
  Phase 5 polish: ZMODEM receive-side buffer accumulation correctness.

  The fTelnetClient's ZMODEM receive path was rewritten in Phase 5
  to fix a multi-second UI freeze on large transfers. The change:

    OLD: number[]      - per-byte `Array.push` in onFileData
                         (millions of operations per MB)
                         then `new Uint8Array(numberArray)` on
                         completion (another per-element copy)

    NEW: Uint8Array[]  - one push of the whole subpacket chunk
                         (a few thousand operations per MB)
                         then `new Blob(chunks)` which concats
                         in browser-internal C++

  These tests don't drive ZModemReceive end-to-end — that path
  is already covered by the existing ZModemReceive.test.ts. These
  tests cover specifically that the new buffer-shape produces
  byte-identical output to what the old buffer-shape would have
  produced, for the same input sequence.
*/

describe('ZMODEM file buffer (Phase 5 polish: Uint8Array[] chunks)', () => {
  it('reconstructs bytes correctly from multiple subpacket chunks', async () => {
    // Simulate ZModemReceive's onFileData firing three times
    // with consecutive subpackets, like a real transfer would.
    const subpacket1 = new Uint8Array([0x01, 0x02, 0x03]);
    const subpacket2 = new Uint8Array([0x04, 0x05, 0x06, 0x07]);
    const subpacket3 = new Uint8Array([0x08]);

    // New approach: chunks array
    const chunks: Uint8Array[] = [];
    chunks.push(subpacket1);
    chunks.push(subpacket2);
    chunks.push(subpacket3);

    const blob = new Blob(chunks as BlobPart[]);

    // Verify the Blob contains the bytes in the right order.
    const buf = await blob.arrayBuffer();
    const view = new Uint8Array(buf);
    expect(view).toEqual(
      new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
    );
  });

  it('handles a single chunk (smallest transfer case)', async () => {
    const chunks: Uint8Array[] = [
      new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]),
    ];
    const blob = new Blob(chunks as BlobPart[]);
    const view = new Uint8Array(await blob.arrayBuffer());
    expect(view).toEqual(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]));
    expect(blob.size).toBe(4);
  });

  it('produces byte-identical output to the old number[] approach', async () => {
    // For every conceivable input, the new chunks-based approach
    // must produce the same final bytes as the old per-byte
    // accumulator would have. We construct random subpackets,
    // accumulate via both approaches, and verify byte equality.
    const subpackets: Uint8Array[] = [];
    for (let i = 0; i < 50; i++) {
      const len = 1 + Math.floor(Math.random() * 100);
      const sp = new Uint8Array(len);
      for (let j = 0; j < len; j++) {
        sp[j] = Math.floor(Math.random() * 256);
      }
      subpackets.push(sp);
    }

    // Old approach: per-byte number[] accumulator
    const oldBuf: number[] = [];
    for (const sp of subpackets) {
      for (let i = 0; i < sp.length; i++) {
        oldBuf.push(sp[i]!);
      }
    }
    const oldBytes = new Uint8Array(oldBuf);

    // New approach: Uint8Array[] chunks
    const newChunks: Uint8Array[] = [];
    for (const sp of subpackets) {
      newChunks.push(sp);
    }
    const newBlob = new Blob(newChunks as BlobPart[]);
    const newBytes = new Uint8Array(await newBlob.arrayBuffer());

    expect(newBytes.length).toBe(oldBytes.length);
    expect(newBytes).toEqual(oldBytes);
  });

  it('handles 1 MB worth of subpacket chunks correctly', async () => {
    // Roughly simulates a 1 MB file transfer: ~1024 subpackets of
    // ~1024 bytes each. Verifies the new approach scales to
    // realistic file sizes without losing bytes.
    const chunks: Uint8Array[] = [];
    const SUBPACKET_SIZE = 1024;
    const NUM_SUBPACKETS = 1024; // exactly 1 MB
    let expectedTotalSize = 0;

    for (let i = 0; i < NUM_SUBPACKETS; i++) {
      const sp = new Uint8Array(SUBPACKET_SIZE);
      // Fill with a recognizable pattern: subpacket index in
      // every byte, so we can verify the chunks are in the
      // right order.
      sp.fill(i & 0xff);
      chunks.push(sp);
      expectedTotalSize += SUBPACKET_SIZE;
    }

    const blob = new Blob(chunks as BlobPart[]);
    expect(blob.size).toBe(expectedTotalSize);
    expect(blob.size).toBe(1024 * 1024); // exactly 1 MB

    // Spot-check that bytes from different positions in the file
    // hold the right values (not corrupted by chunk-ordering bugs).
    const view = new Uint8Array(await blob.arrayBuffer());
    expect(view[0]).toBe(0); // byte 0: first subpacket, filled with 0
    expect(view[1024]).toBe(1); // byte 1024: second subpacket, filled with 1
    expect(view[1024 * 100]).toBe(100); // byte 102400: 101st subpacket
    expect(view[1024 * 1023]).toBe(1023 & 0xff); // last subpacket
  });

  it('empty chunks array produces an empty Blob (edge case)', async () => {
    const blob = new Blob([] as BlobPart[]);
    expect(blob.size).toBe(0);
  });
});
