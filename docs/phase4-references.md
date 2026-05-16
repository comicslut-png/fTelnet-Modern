# Phase 4 — ZMODEM Reference Implementations

We're building ZMODEM cleanroom in TypeScript (Option C from the
Stage 1 → Stage 2 strategy discussion). When we hit ambiguous
parts of the protocol spec — and we will — these are the
reference implementations to consult for "how did others handle
this?"

## Primary reference

**FGasper's zmodem.js** — https://github.com/FGasper/zmodemjs

  - Apache-2.0, plain JavaScript
  - The de facto reference implementation in the browser space
  - Battle-tested against real lrzsz over many years
  - Quiet for 5 years but the protocol hasn't changed
  - Read order when stuck: `Detect.js`, `Header.js`, `Session.js`,
    `Subpacket.js`, then the Browser glue
  - CHANGELOG has some war stories worth reading (e.g. the
    lrzsz 0.12.20 buffer overflow that forced CRC-32 advertising)

## Secondary reference

**zxdong262's zmodem2-js** — https://github.com/zxdong262/zmodem2-js

  - MIT, TypeScript
  - Port of the Rust `zmodem2` crate (which itself is good)
  - Clean state-machine API: Sender/Receiver with
    drainOutgoing/feedIncoming/pollEvent/drainFile pattern
  - LLM-assisted port (KiloCode's GLM5), so trust the architecture
    but verify the bit-level details
  - Useful for "how does a modern state-machine version of this
    look in TS?" rather than "is this the correct byte sequence?"

## Tertiary references (don't read unless really stuck)

**lrzsz (C)** — https://www.ohse.de/uwe/software/lrzsz.html

  - The original Forsberg C code, polished by Uwe Ohse
  - What every BBS server uses; what we'd test against
  - Read for "what does the real wire format look like?" or
    "what does sz/rz actually emit?"
  - C, 25 years old, requires patience to read

**SyncTERM's zmodem** — https://gitlab.synchro.net/main/sbbs

  - Tightly coupled to SyncTERM's I/O model
  - Hard to read in isolation
  - Useful only for very specific BBS-side quirks

## When to consult what

  - "Is this CRC right?" → standard test vectors first, then
    lrzsz output if still unsure
  - "Did we escape this byte correctly?" → zmodem.js
    (FGasper) — they handle edge cases well
  - "How should this state transition work?" → zmodem2-js for
    the clean state-machine view, then cross-check with zmodem.js
  - "Does Synchronet emit something weird here?" → SyncTERM
    code as last resort

## Decision rule

We DO NOT copy code from any of these — cleanroom means our
implementation is informed by, not derived from, these
references. If we look at how zmodem.js solves a problem, we
understand the solution and re-implement in our own code with
our own structure and comments.

If we ever find ourselves wanting to literally copy a function,
that's a signal to step back and ask whether we really want
cleanroom for this piece. Right now: yes, all of it.
