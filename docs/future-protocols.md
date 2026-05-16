# Future protocols (post-Phase-4 to-do list)

fTelnet currently supports YMODEM (legacy fallback) and ZMODEM
(default; auto-detected on modern BBSes). Several other file-
transfer protocols were historically common on BBSes and could
be added as future phases:

## HSLink

A bidirectional, simultaneous-send-and-receive protocol with
built-in compression and windowed flow control. Significantly
more complex than ZMODEM — roughly 5-10× the implementation
effort.

Status: tabled until after Phase 4. The user has the DOS source
for HSLink which would serve as a reference (cleanroom port,
not literal copy — same approach as ZMODEM used FGasper's
zmodem.js and zxdong262's zmodem2-js).

If added: probably its own phase (call it Phase 6) shipped in
5-7 stages mirroring the ZMODEM plan. Bidirectional flow may
require changes to Connection/Crt's "one direction at a time"
assumption.

## Others (lower priority)

  - **BiModem**: another bidirectional protocol, similar
    complexity to HSLink. Very few extant BBSes support it.
  - **VFAST**: essentially ZMODEM with larger window sizes.
    Could potentially be added as a ZMODEM variant rather than
    a separate implementation.
  - **Puma / Lynx / Jmodem**: minor variants of
    XMODEM/YMODEM/ZMODEM mechanics. Low value-to-effort.

## Decision rule

These are all "after the production package ships" features.
The current phases (ZMODEM via Phase 4, polish via Phase 5)
deliver a production-ready modern fTelnet. Anything beyond is
an afterthought feature, prioritized by user demand.
