# Phase 4 Stage 7 — UI design decisions

User showed me a SyncTERM screenshot during Phase 4 Stage 1
development of the BBS-side ZMODEM dialog. Key reference:

  - Blue panel with yellow border (double-line top/bottom)
  - Title "ZMODEM Download"
  - 5 lines of status:
    1. "File (N of M): filename.zip"
    2. "Byte: NNN of MMM (KKK KB)"
    3. "Time: M:SS  ETA: M:SS  Block: 1024/CRC-32  CCCCC cps"
    4. Percent ("71%")
    5. Progress bar with ASCII shading + [brackets]
  - "ESC to Abort" footer
  - Below-panel log of protocol events

## Decisions for Stage 7

### 1. Visual style: per-theme, layout matches SyncTERM

- **Layout** (field positions, field labels, ASCII progress-bar
  style, ESC-to-Abort footer, below-panel log) matches SyncTERM
  across all themes.
- **Colors** come from the active fTelnet theme:
  - `classic`     → cyan/blue/yellow (SyncTERM defaults)
  - `dos-classic` → gray panel + CGA accents matching the chrome
  - `crt-green`   → phosphor green on dark green
  - `cyberpunk`   → magenta/cyan on near-black
  - `gothic`      → blood-red on black
  - `cartoon`     → ... this one will be interesting. Probably
                    primary colors with thick black borders.
- Color mapping is part of the theme infrastructure built in
  Phase 3, but exposed via new theme variables specifically for
  the transfer dialog (e.g. `--ft-xfer-panel-bg`,
  `--ft-xfer-panel-fg`, `--ft-xfer-border-fg`, `--ft-xfer-label-fg`).

### 2. Rendering: configurable in-canvas vs HTML overlay

New option:
```typescript
Options.FileTransferDialog: 'in-canvas' | 'html-overlay' = 'in-canvas';
```

- **in-canvas** (default): drawn via CrtLabel/CrtPanel into the
  BBS canvas. Period-authentic. The fTelnet "themed" colors get
  mapped to the closest ANSI palette entries the Crt supports.
  This is the SyncTERM look.
- **html-overlay**: a Lit component
  (`<f-file-transfer-dialog>`) floats above the canvas. Same
  layout, real CSS variables so theme colors are exact, real
  Cancel button as a clickable element. For users who'd rather
  have modern accessibility (screen readers, real focus, etc.).

Default to `'in-canvas'` because that's what the user explicitly
asked to preserve. `'html-overlay'` is the escape hatch for
accessibility / "I want a real Cancel button" cases.

## What this means for the build

Stage 7 ships TWO renderers, not one:

  - A Crt-canvas-based renderer using CrtLabel/CrtPanel (or
    new methods extending them for things like progress bars
    with ASCII shading). Uses ANSI palette indices selected per
    theme.
  - A Lit-component-based renderer with the same layout, using
    CSS variables for color. Light DOM, light layer above the
    container. Real DOM elements for accessibility.

Both renderers consume the same progress-update events from
`ZModemReceive` / `ZModemSend`. The two implementations of an
interface like:

```typescript
interface TransferProgressView {
  show(): void;
  hide(): void;
  setFile(name: string, currentIndex: number, totalCount: number, totalBytes: number): void;
  setProgress(bytesReceived: number, cps: number, etaSeconds: number): void;
  addLogLine(message: string): void;
}
```

Stage 7 picks the right one at construction based on
`Options.FileTransferDialog`.

## What's still TBD (not for now)

- The exact ANSI color mapping per theme for the in-canvas
  renderer. We'll figure it out when we get there — probably
  6 small per-theme color tables.
- Whether the dialog overlay covers the BBS or shrinks the
  canvas. SyncTERM covers. We'll match that.
- Cancel handling: ESC key (matches SyncTERM); html-overlay
  also gets a click target.

## Status

This decision binds Stage 7 specifically. Stages 2-6 are
protocol/decoder work, unaffected by this UI choice.
