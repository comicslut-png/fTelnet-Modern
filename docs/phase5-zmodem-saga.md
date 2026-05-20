# Phase 5 — the ZMODEM diagnostic arc

A multi-day investigation that started with "multi-file upload
fails on Synchronet" and ended with three distinct lessons. Written
honestly so future-us doesn't repeat the same mistakes.

## TL;DR

The actual bug was a single missing byte: **every ZCRCW subpacket
must end with XON (0x11)**, per Forsberg's reference. Our encoder
omitted it. Five deltas worth of symptom-treating preceded the
moment we read the canonical source and found this in the first
function we looked at.

A separate lesson: **multi-file ZMODEM batches require the BBS's
batch upload area**, not the single-file upload command. The two
are different commands with different session semantics.

## The arc

### Phase 4 felt done

End of Phase 4 Stage 7: working ZMODEM sender/receiver. Smoke-
tested against Synchronet (Diamond Mine) — clean. Smoke-tested
against PCBoard (Danger Bay) with a 35KB test bundle — clean,
PFED passed. We shipped.

### Phase 5 added multi-file drag-and-drop

Suddenly the 150KB-ZIP-to-PCBoard path was flaky. Sometimes it
aborted partway through, sometimes it completed. The 35KB test
bundle still worked. We assumed the dense binary content of the
larger ZIP exposed some edge case.

### Deltas 2.13–2.17: treating symptoms

Five rounds of looking at wire traces and inferring receiver-side
behavior:

| Delta | Trace evidence | Our theory |
|---|---|---|
| 2.13 | Resync ZCRCW never gets ACKed first try | Receiver missed it; add retry timer |
| 2.15 | Stale ZRPOSes after successful resync | In-flight ZRPOSes overlapping our ACK |
| 2.16 | Even retries miss first time | Direction-reversal byte loss (ZNULLS prefix) |
| 2.17 | Dedup too aggressive when receiver stuck | Add time window to stale-dedup |
| 2.18 | Maybe slow down sends? | 5ms pacing — REGRESSED 9x worse |
| 2.19 | Revert 2.18 | Back to 2.17 baseline |

Each delta was driven by visible symptoms in traces. Each one
helped a little. None addressed the actual bug.

**The mistake here was inductive thinking from receiver behavior
without checking what the canonical sender actually transmits.**
We had Forsberg's reference C++ implementation cited in
`docs/phase4-references.md` from day one. We didn't open it for
five rounds.

### The pushback that mattered

Tom (the maintainer, who's been running PCBoard since 1990) saw
me about to ship a "Known limitations: large uploads to PCBoard
may fail" section in the README and pushed back hard. PCBoard had
handled ZMODEM batches reliably for 30+ years with Telemate,
Telix, QMODEM, Terminate, and HSLink. He sent screenshots of
HSLink doing simultaneous bidirectional file transfer with
in-band chat in 1995. The receivers weren't the problem. Our
code was.

He pointed us at the canonical source. That was the day we found
the bug.

### Delta 2.20: the actual fix

Read Forsberg's `zmodem.cpp` `SendDataFrame`:

```cpp
if ( frameend == ZCRCW )
    SendChar( XON );
```

**Every ZCRCW subpacket gets a trailing XON byte.** Mandatory.
ZCRCW means "sender pauses here for ACK"; the XON tells the
receiver "the byte stream from me ends now," letting it complete
the direction reversal cleanly. Without it, vintage receivers
keep scanning for our next byte and miss subsequent headers.

We send ZFILE metadata as a ZCRCW subpacket. We never appended
XON. The receiver consumed our metadata, sent its response, but
its parser kept looking for a "sender pause" signal. While in
that state, the next file's ZFILE header bytes arrived — looking
to the receiver like garbage mid-frame. Abort.

Same bug also explained PCBoard's "every-other-block CRC error"
during transfers — every resync we sent was a ZCRCW subpacket
missing its XON. PCBoard's slower-hardware input pipeline was
more sensitive to this. The retry timer, ZNULLS prefix, and
stale-ZRPOS dedup deltas (2.13, 2.16, 2.17) had been papering
over the symptoms.

Companion fix in the decoder: silently absorb XON/XOFF in IDLE
state. Reference receivers also send XON between frames; logging
them as "garbage" was wrong and noisy.

One byte. Five deltas of scaffolding preceded it.

### The third lesson: batch upload areas

After 2.20 landed, the multi-file Synchronet test still failed —
but only on the first attempt of the session. Second attempt
succeeded cleanly. Same code, same files (renamed), same BBS.
Confusing.

Tom went back to look and realized he'd been testing in two
different upload areas. Synchronet (and PCBoard, and most BBSes)
offers two distinct upload commands:

- **Single-file upload**: receive one file, process it
  immediately (PFED / ZIP integrity / virus scan / "Hit a key"),
  return to menu. The ZMODEM session ENDS with the first file.
  Sending more ZFILE headers after ZEOF gets you a CAN abort
  because the BBS shell has moved on.

- **Batch upload area**: receive multiple files within one
  ZMODEM session, defer all processing until ZFIN, run PFED on
  the batch afterward. This is where ZMODEM-90's batch semantics
  actually apply.

The first attempt was in single-file area: aborted at file 2
(correctly, from the BBS's point of view). Second attempt was in
batch area: all 3 files transferred cleanly.

**This isn't a bug in either side.** It's a property of the BBS
shell command. Documented in the README now.

## Where we ended up

```
Synchronet batch upload area, 3 files: clean transfer
PCBoard upload, 3 files: completes reliably (slowly)
Synchronet single-file area, multiple files: aborts after file 1 (expected)
```

PCBoard is slow because it processes ZMODEM serially on
1990s-vintage I/O paths. 161 ZRPOSes for 3×35KB is a lot of
resync activity, but with XON in place every resync now succeeds
on its first or second retry. The protocol works. Throughput is
the issue, not correctness.

## Configuration knobs (all in `ZModemSend.ts`)

  - `INTER_SUBPACKET_DELAY_MS = 0` — pacing between data
    subpackets. Delta 2.18 tried 5ms and regressed 9x. Don't
    touch.
  - `RESYNC_ZACK_TIMEOUT_MS = 1000` — how long to wait for ZACK
    before retrying a resync ZCRCW.
  - `RESYNC_MAX_RETRIES = 5` — cap on retries at the same
    position.
  - `ZNULLS_BEFORE_RESYNC = 32` — NUL bytes prepended to resync
    ZDATA frames. May be redundant now that XON is in place;
    candidate for removal after more testing.
  - `STALE_ZRPOS_WINDOW_MS = 500` — within this window of a
    successful resync ZACK, drop same-position ZRPOSes as stale.
    Also possibly redundant now; same disposition.

These zero-overhead on receivers that don't generate errors
(Synchronet, Mystic). They only fire under PCBoard's slower
processing pattern.

## What would speed PCBoard transfers up?

The remaining bottleneck is rate mismatch. We push bytes into our
WebSocket buffer at modern-machine speeds; PCBoard chews through
them at 1990s speeds. ZRPOS is its way of saying "slow down, I
missed something." Each successful resync costs a round-trip.

**ZCRCQ window flow control** is the canonical answer. Instead of
pure streaming, periodically send ZCRCQ subpackets that solicit
ZACKs. If we get too far ahead of the receiver's last ACK, pause
until they catch up. Forsberg's spec describes this as "WINDOW
MANAGEMENT" / "FULL STREAMING WITH SLIDING WINDOW." lrzsz `sz`
exposes this via `-w N`. Adding it would help PCBoard significantly
without hurting modern receivers.

Estimated cost: ~150 lines. Currently parked in `future-protocols.md`.

## Lessons learned

1. **Read the canonical reference EARLY.** Wire traces tell you
   what the receiver is doing; canonical sender source tells you
   what YOU should be doing. We had the reference cited from day
   one and didn't open it for five deltas. Opening it took
   minutes. The XON line is in the first function.

2. **Trust the experienced operator.** "This worked fine for 30
   years with every terminal program" is high-quality signal.
   When that user pushes back on a "known limitations" claim,
   the first move is to check your own code, not to document the
   limitation.

3. **BBS shell semantics are a separate layer from ZMODEM
   protocol semantics.** Single-file commands and batch commands
   do different things at the shell level even though they use
   the same ZMODEM protocol underneath. Document this for users.

4. **Symptom-treating compounds.** Each of deltas 2.13–2.17
   added complexity to handle a symptom. By 2.17 the code had
   five interacting workaround mechanisms. After 2.20 (the real
   fix) most of that scaffolding may be unnecessary. Leaving it
   in for now is defensive, but it's a candidate for cleanup
   once we have more field experience confirming XON alone is
   sufficient.

5. **Diagnostic infrastructure pays for itself.** The `ZmDebug`
   module added during Delta 2.15 prep was essential for every
   subsequent investigation. The next Phase 5 item — generalize
   it into a categorized sysop-facing diagnostic log — is worth
   doing while this experience is fresh.

## File locations

  - `src/filetransfer/ZModemEncoder.ts` — XON-after-ZCRCW fix
    (Delta 2.20). Both CRC-16 and CRC-32 subpacket builders.
  - `src/filetransfer/ZModemDecoder.ts` — silent XON/XOFF
    absorption in IDLE state.
  - `src/filetransfer/ZModemSend.ts` — retry timer, ZNULLS
    prefix, time-windowed dedup (Deltas 2.13/2.16/2.17,
    candidates for cleanup).
  - `src/filetransfer/ZmDebug.ts` — diagnostic logger.
  - `tests/filetransfer/ZModemEncoder.test.ts` — XON regression
    test asserting ZCRCW gets XON, other markers do not.
  - `tests/filetransfer/ZModemSend.test.ts` — dedup regression
    tests from Deltas 2.15 and 2.17.

## References that mattered

  - Forsberg's reference `zmodem.cpp` (the canonical sender):
    http://www.staroceans.org/DC/HWBooks/Serial%20Communications%20Dev%20guide/CHAPT16/ZMODEM.CPP
  - Synchronet wiki ZMODEM protocol reference:
    http://wiki.synchro.net/ref:zmodem
  - lrzsz `sz(1)` manpage — the ZNULLS hint for direction-reversal:
    https://linux.die.net/man/1/sz
  - FGasper/zmodemjs — the de facto JavaScript reference:
    https://github.com/FGasper/zmodemjs
