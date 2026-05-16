import { describe, it, expect, beforeEach } from 'vitest';
import { ZModemDetector, type ZModemDetectorCallbacks } from '@filetransfer/ZModemDetector.js';
import { ZMODEM_AUTO_TRIGGER } from '@filetransfer/ZModem.js';

/*
  ZModemDetector tests — Phase 4 Stage 6.

  The detector watches a byte stream for the ZMODEM auto-trigger
  sequence `** \x18 B 0 0`. Until matched, every byte passes
  through to the ANSI parser. Once matched, the trigger bytes
  (and all subsequent bytes) flow to the ZMODEM receiver.

  Test categories:
    - Basic passthrough (bytes that don't look like trigger)
    - Full trigger match (clean activation)
    - Partial match that fails (held bytes get released)
    - Partial match across feed() boundaries (split chunks)
    - Asterisks in normal text (common edge case — many BBSes
      use '*' as a separator or border character)
    - After trigger fires, all subsequent bytes go to onTrigger
    - reset() returns to watch mode
*/

describe('ZModemDetector', () => {
  let passthrough: number[];
  let triggered: number[];       // bytes from the trigger event itself (the 6 magic bytes)
  let zmodemBytes: number[];     // bytes received after trigger fired
  let triggerFireCount: number;
  let detector: ZModemDetector;

  beforeEach(() => {
    passthrough = [];
    triggered = [];
    zmodemBytes = [];
    triggerFireCount = 0;

    const cb: ZModemDetectorCallbacks = {
      onPassthrough: (bytes) => {
        for (let i = 0; i < bytes.length; i++) passthrough.push(bytes[i]!);
      },
      onTrigger: (bytes) => {
        triggerFireCount++;
        for (let i = 0; i < bytes.length; i++) triggered.push(bytes[i]!);
      },
      onZmodemBytes: (bytes) => {
        for (let i = 0; i < bytes.length; i++) zmodemBytes.push(bytes[i]!);
      },
    };
    detector = new ZModemDetector(cb);
  });

  // ───────────────── passthrough ─────────────────

  describe('passthrough mode (no trigger)', () => {
    it('passes plain ASCII through', () => {
      detector.feed('Hello, world!');
      expect(triggerFireCount).toBe(0);
      expect(String.fromCharCode(...passthrough)).toBe('Hello, world!');
    });

    it('passes high-bit bytes through (CP437 graphics)', () => {
      detector.feed(new Uint8Array([0xb0, 0xb1, 0xb2, 0xdb, 0xdc]));
      expect(triggerFireCount).toBe(0);
      expect(passthrough).toEqual([0xb0, 0xb1, 0xb2, 0xdb, 0xdc]);
    });

    it('passes ANSI escape sequences through', () => {
      const ansi = '\x1b[2J\x1b[H\x1b[31mRed text\x1b[0m';
      detector.feed(ansi);
      expect(triggerFireCount).toBe(0);
      expect(String.fromCharCode(...passthrough)).toBe(ansi);
    });

    it('handles empty input', () => {
      detector.feed('');
      detector.feed(new Uint8Array(0));
      detector.feed([]);
      expect(triggerFireCount).toBe(0);
      expect(passthrough.length).toBe(0);
    });
  });

  // ───────────────── trigger detection ─────────────────

  describe('full trigger match', () => {
    it('fires onTrigger when the exact sequence is seen', () => {
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(triggerFireCount).toBe(1);
      // The trigger bytes themselves are passed to onTrigger
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
      // Nothing went to passthrough
      expect(passthrough.length).toBe(0);
    });

    it('fires when trigger arrives after some text', () => {
      const text = 'Sending File(s) - Start your download...\r\n';
      const combined = new Uint8Array(text.length + ZMODEM_AUTO_TRIGGER.length);
      for (let i = 0; i < text.length; i++) combined[i] = text.charCodeAt(i);
      for (let i = 0; i < ZMODEM_AUTO_TRIGGER.length; i++) {
        combined[text.length + i] = ZMODEM_AUTO_TRIGGER[i]!;
      }
      detector.feed(combined);

      expect(triggerFireCount).toBe(1);
      expect(String.fromCharCode(...passthrough)).toBe(text);
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
    });

    it('puts post-trigger bytes into onZmodemBytes, not onPassthrough', () => {
      // Real ZRQINIT continues after the trigger with more hex digits
      // + CR LF [XON]. Simulate that here.
      const trigger = new Uint8Array(ZMODEM_AUTO_TRIGGER);
      const rest = new Uint8Array([
        0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, // 8 more hex chars
        0x30, 0x30, 0x30, 0x30, // CRC bytes (zeros for ZRQINIT)
        0x0d, 0x0a, 0x11, // CR LF XON trailer
      ]);
      const combined = new Uint8Array(trigger.length + rest.length);
      combined.set(trigger);
      combined.set(rest, trigger.length);

      detector.feed(combined);

      expect(triggerFireCount).toBe(1);
      // The 6 trigger bytes go to onTrigger (one fire)
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
      // The rest of the frame goes to onZmodemBytes
      expect(zmodemBytes).toEqual([...rest]);
      expect(passthrough.length).toBe(0);
    });

    it('handles trigger split across two feed() calls', () => {
      // Sender's WebSocket chunk boundary lands mid-trigger
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER.slice(0, 3))); // *, *, ZDLE
      expect(triggerFireCount).toBe(0); // not yet
      expect(passthrough.length).toBe(0); // nothing released yet (still holding)

      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER.slice(3))); // B, 0, 0
      expect(triggerFireCount).toBe(1);
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
    });

    it('handles trigger split byte-by-byte', () => {
      for (const b of ZMODEM_AUTO_TRIGGER) {
        detector.feed(new Uint8Array([b]));
      }
      expect(triggerFireCount).toBe(1);
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
    });
  });

  // ───────────────── partial match fail ─────────────────

  describe('partial match that fails', () => {
    it('releases held bytes when next byte breaks the match', () => {
      // Feed `**\x18B0X` — close but wrong last byte
      const partial = new Uint8Array([0x2a, 0x2a, 0x18, 0x42, 0x30, 0x58]);
      detector.feed(partial);

      expect(triggerFireCount).toBe(0);
      // All 6 bytes should have been released to passthrough
      expect(passthrough).toEqual([0x2a, 0x2a, 0x18, 0x42, 0x30, 0x58]);
    });

    it('releases held byte when next byte is unrelated', () => {
      // Feed `*A` — single star followed by 'A'
      detector.feed(new Uint8Array([0x2a, 0x41]));
      expect(triggerFireCount).toBe(0);
      expect(passthrough).toEqual([0x2a, 0x41]);
    });

    it('handles partial match that ITSELF restarts a match', () => {
      // Feed `***` — second '*' isn't trigger[1] of ZPAD-ZPAD-ZDLE.
      // Actually trigger[1] IS ZPAD (0x2a), so the second '*' continues
      // the match. The third '*' is also 0x2a, but trigger[2] is ZDLE
      // (0x18), so it breaks. But then the third '*' could itself
      // start a new match.
      detector.feed(new Uint8Array([0x2a, 0x2a, 0x2a]));
      expect(triggerFireCount).toBe(0);
      // First two stars matched bytes 0 and 1 of trigger. Third star
      // broke the match (since trigger[2] is ZDLE). We release the two
      // stars, then notice the third byte IS trigger[0], so we hold it.
      // End result: 2 bytes in passthrough, 1 still held.
      expect(passthrough).toEqual([0x2a, 0x2a]);
    });

    it('handles `*A*` correctly', () => {
      detector.feed(new Uint8Array([0x2a, 0x41, 0x2a]));
      expect(triggerFireCount).toBe(0);
      // First star matched trigger[0]. 'A' broke the match (we release
      // the star and don't add 'A' to a new match either since A isn't
      // 0x2a). 'A' goes to passthrough. Third byte IS 0x2a, so it's
      // held. End: passthrough = [*, A], 1 byte held.
      expect(passthrough).toEqual([0x2a, 0x41]);
    });

    it('handles long stream of asterisks (BBS border characters)', () => {
      // Many BBSes use '*' as decorative borders. This test ensures
      // we don't fire trigger on long runs of asterisks.
      //
      // Walking through the state machine for 20 consecutive 0x2a:
      // - Byte 1: matches TRIGGER[0], hold (matchIndex=1)
      // - Byte 2: matches TRIGGER[1], hold (matchIndex=2)
      // - Byte 3: TRIGGER[2] is ZDLE (0x18), not 0x2a → mismatch.
      //   Release the 2 held bytes to passthrough. Byte 3 itself
      //   matches TRIGGER[0], so hold it (matchIndex=1).
      // - Byte 4: matches TRIGGER[1], hold (matchIndex=2).
      // - Byte 5: mismatch, release 2, hold byte 5.
      // - ... repeats: every "pair" of stars releases 2 to
      //   passthrough at the start of the NEXT pair.
      // - After 20 bytes: 9 full pairs released = 18 bytes in
      //   passthrough, and 2 bytes still held (matchIndex=2).
      const stars = new Uint8Array(20).fill(0x2a);
      detector.feed(stars);
      expect(triggerFireCount).toBe(0);
      expect(passthrough.length).toBe(18);
    });

    it('eventually releases held stars when a non-star arrives', () => {
      // Continuation of the previous test's edge case: any non-trigger
      // byte will release the held bytes. Most realistic terminator
      // is a space, CR, or LF.
      detector.feed(new Uint8Array(20).fill(0x2a));
      expect(passthrough.length).toBe(18); // 2 held

      detector.feed(new Uint8Array([0x20])); // space
      // The 2 held stars get released; the space goes through too.
      // Total: 18 + 2 + 1 = 21
      expect(passthrough.length).toBe(21);
      expect(triggerFireCount).toBe(0);
    });

    it('releases final held star when followed by space', () => {
      detector.feed(new Uint8Array([0x2a, 0x2a, 0x20])); // "** "
      // First * matches trigger[0]. Second * matches trigger[1].
      // Space (0x20) doesn't match trigger[2] (ZDLE 0x18). Both
      // stars get released; space goes to passthrough.
      expect(triggerFireCount).toBe(0);
      expect(passthrough).toEqual([0x2a, 0x2a, 0x20]);
    });
  });

  // ───────────────── after trigger ─────────────────

  describe('after trigger fires', () => {
    it('passes subsequent bytes to onZmodemBytes', () => {
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      // After trigger, the 6 trigger bytes are in `triggered` and
      // `zmodemBytes` is still empty (we haven't fed anything more).
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
      expect(zmodemBytes.length).toBe(0);

      // Now feed some ZMODEM body bytes — these should go to onZmodemBytes
      detector.feed(new Uint8Array([0x30, 0x30, 0x0d, 0x0a]));
      expect(zmodemBytes).toEqual([0x30, 0x30, 0x0d, 0x0a]);
      // No additional onTrigger fires, no passthrough
      expect(triggerFireCount).toBe(1);
      expect(passthrough.length).toBe(0);
    });

    it('does not fire onTrigger more than once unless reset', () => {
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(triggerFireCount).toBe(1);

      // Feed another full trigger sequence; should not fire onTrigger
      // again — those bytes just look like more ZMODEM body content
      // and go to onZmodemBytes
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(triggerFireCount).toBe(1);
      expect(zmodemBytes).toEqual([...ZMODEM_AUTO_TRIGGER]);
    });

    it('triggered getter reflects state', () => {
      expect(detector.triggered).toBe(false);
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(detector.triggered).toBe(true);
    });
  });

  // ───────────────── reset ─────────────────

  describe('reset', () => {
    it('returns to watch mode after trigger', () => {
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(detector.triggered).toBe(true);

      detector.reset();
      expect(detector.triggered).toBe(false);

      // Now normal text should pass through
      detector.feed('hello');
      expect(String.fromCharCode(...passthrough)).toBe('hello');
    });

    it('clears partial-match state', () => {
      // Start a partial match
      detector.feed(new Uint8Array([0x2a, 0x2a, 0x18]));
      expect(passthrough.length).toBe(0); // bytes held

      detector.reset();
      detector.feed('A');
      // The held bytes are gone after reset; only 'A' shows up
      expect(passthrough).toEqual([0x41]);
    });

    it('allows re-triggering after a session', () => {
      // First session
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(triggerFireCount).toBe(1);

      detector.reset();

      // Second session: same trigger should fire
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(triggerFireCount).toBe(2);
    });
  });

  // ───────────────── input formats ─────────────────

  describe('input format flexibility', () => {
    it('accepts a string', () => {
      detector.feed('Hello');
      expect(String.fromCharCode(...passthrough)).toBe('Hello');
    });

    it('accepts a Uint8Array', () => {
      detector.feed(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
      expect(passthrough).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it('accepts a plain number[]', () => {
      detector.feed([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(passthrough).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it('handles string with high-bit chars (char codes >127)', () => {
      // CP437 byte 0xb0 (light shade)
      const s = String.fromCharCode(0xb0, 0xb1, 0xb2);
      detector.feed(s);
      expect(passthrough).toEqual([0xb0, 0xb1, 0xb2]);
    });
  });

  // ───────────────── realistic BBS scenarios ─────────────────

  describe('realistic BBS scenarios', () => {
    it('triggers correctly on Synchronet-style download intro', () => {
      // Typical Synchronet output before a ZMODEM transfer:
      //   "Sending File(s) - Start your download ...\r\n**\x18B00000000000000\r\x8a\x11"
      const intro = 'Sending File(s) - Start your download ...\r\n';
      const trigger = '**\x18B00';
      const rest = '000000000000\r\x8a\x11';

      // Feed in three chunks like a real connection would
      detector.feed(intro);
      expect(triggerFireCount).toBe(0);
      expect(String.fromCharCode(...passthrough)).toBe(intro);
      passthrough.length = 0;

      detector.feed(trigger);
      expect(triggerFireCount).toBe(1);
      // The trigger bytes themselves went to onTrigger
      expect(triggered).toEqual([...ZMODEM_AUTO_TRIGGER]);
      expect(passthrough.length).toBe(0);

      detector.feed(rest);
      // The body bytes go to onZmodemBytes
      const expectedBody = [];
      for (let i = 0; i < rest.length; i++) expectedBody.push(rest.charCodeAt(i) & 0xff);
      expect(zmodemBytes).toEqual(expectedBody);
      expect(passthrough.length).toBe(0);
    });

    it('handles a menu with asterisk borders before transfer', () => {
      // Common BBS pattern: decorative line of asterisks, then transfer
      const border = '*'.repeat(40);
      detector.feed(border);
      // Last star is held; first 39 release. Trigger doesn't fire.
      expect(triggerFireCount).toBe(0);

      // Then a newline (which definitely isn't trigger[1])
      detector.feed('\r\n');
      // Now everything flushes
      expect(passthrough.length).toBe(40 + 2);
      expect(triggerFireCount).toBe(0);
    });

    it('handles spurious "**" followed by trigger', () => {
      // Pretend the BBS outputs "** " (decorative) and then later
      // begins a real transfer
      detector.feed('** Welcome to BBS **\r\n');
      expect(triggerFireCount).toBe(0);
      passthrough.length = 0;

      // Now the real trigger arrives
      detector.feed(new Uint8Array(ZMODEM_AUTO_TRIGGER));
      expect(triggerFireCount).toBe(1);
    });
  });
});
