# Phase 4 Stage 7 — Transfer dialog design

## Decision: faithful SyncTERM transfer panel

The Stage 7 progress UI mimics the classic SyncTERM/Telix/
Terminate file-transfer panel exactly. Hard-coded retro colors
(blue background, yellow border, cyan accents, bright white
text), NOT themed against the active fTelnet theme.

### Why not themed

Initial plan was to make the panel theme-aware so a user on
Cyberpunk would get magenta/cyan, Gothic would get blood-red,
etc. We reconsidered: the transfer panel isn't part of the
ongoing interface — it's a "moment" in the user experience that
appears for a few seconds and disappears. Authentic retro
styling is *more* valuable there than visual coherence with the
rest of the app. A user who connects to a BBS in 2026 and sees
the exact blue-on-yellow SyncTERM panel is *transported* — and
that's the whole point of fTelnet.

"Out of place" cuts the right way here: it signals "we're in a
different mode now," exactly the way 1990s DOS terminal programs
did when a transfer started.

## Layout (matches the SyncTERM reference screenshot)

```
┌───────────────────────────────────────────────────────┐
│ Receiving File 1 of 1: filename.zip                   │
│ Size:        123,456 bytes                            │
│ Block:           1024 / 1024                          │
│ Time:        00:00:05    ETA: 00:00:32                │
│ CPS:           24,569    Efficiency: 98%              │
│                                                       │
│ [████████████░░░░░░░░░░░░░░░░░░░░] 38%                │
│                                                       │
│ Press ESC to abort                                    │
└───────────────────────────────────────────────────────┘
< status log below, ZMODEM-CRC32: connected, etc >
```

Colors (hard-coded, NOT CSS-var-themed):
  - Border: bright yellow (#ffff55)
  - Background: blue (#0000aa)
  - Labels: cyan (#55ffff)
  - Values: bright white (#ffffff)
  - Progress bar fill: bright green (#55ff55)
  - Progress bar empty: dim blue (#0000aa with some pattern)

The protocol name shown at the bottom can adapt — "ZMODEM-CRC32"
when CRC-32 negotiated, "ZMODEM-CRC16" when not, "YMODEM-1K"
when YMODEM is active. The visual style stays constant; only the
label changes.

## Two renderers, one data source

Both renderers consume the same progress events. Configurable
via `Options.FileTransferDialog`:

  - `'in-canvas'` (default): the panel is drawn directly into
    the Crt canvas, like SyncTERM does it. Authentic but harder
    to read on tiny mobile screens.
  - `'html-overlay'`: the panel is a positioned HTML element
    above the canvas. Same visual style (same hard-coded colors,
    same layout), but rendered with HTML+CSS for crisper text on
    high-DPI displays and easier mobile scaling.

Shared `TransferProgressView` interface lets the state machines
fire events into either renderer without caring which one is
active.

## What this means for theming work

The Phase 3 theme system (6 themes, CSS variables, settings
panel) is unaffected. The transfer panel is the ONE place in
fTelnet that ignores the active theme. Everything else — focus
warning, scrollback bar, status bar, menu popup, virtual
keyboard, settings panel — continues to respect the active theme.
