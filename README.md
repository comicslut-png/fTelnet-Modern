# fTelnet (modernized)

An HTML5 WebSocket client for connecting to BBSes and other text-mode
hosts. This repository is a modernization fork of the original fTelnet
by Rick Parrish (R&M Software), bringing the 2017-era TypeScript
codebase up to a current toolchain while preserving every feature and
the BBS-era aesthetic.

## Status

This is a multi-phase modernization shipped in small reviewable
deltas. Each phase has multiple stages; each stage is independently
applicable.

| Phase                                                                  | Status                        |
| ---------------------------------------------------------------------- | ----------------------------- |
| 1. Modernize foundation (TS 5, Vite, ESM, strict, Vitest)              | ✅ Complete                   |
| 2. Refactor UI layer into Lit Web Components                           | ✅ Complete (6 stages)        |
| 3. Neo-retro chrome facelift (theming system, settings panel, 6 themes) | ✅ Complete (3 main + deltas) |
| 4. ZMODEM file transfer (replaces YMODEM as default)                   | 🚧 In progress (2/7 stages)   |
| 5. Polish (PWA, performance, docs, embed wizard refresh)               | ⏳ Planned                    |

### What works today

- **Modern build**: TypeScript 5.9 strict, Vite 5, ESM, Vitest 2 — full
  dev-server with hot reload.
- **Lit component architecture**: every UI element (focus warning,
  scrollback bar, status bar, menu popup, virtual keyboard, settings
  panel) is a `<f-*>` web component using light DOM so existing CSS
  selectors keep working.
- **Theming system**: 6 built-in themes selectable at runtime:
  - **Classic** — the original fTelnet look (blue/white/green panels)
  - **DOS-Classic** — Windows 3.1 gray bevels + CGA accents
  - **CRT-Green** — phosphor-on-black with subtle text-shadow glow
  - **Cyberpunk** — magenta/cyan neon, ALL-CAPS HUD labels
  - **Gothic** — blood-red serifs on near-black
  - **Cartoon** — primary colors, thick black outlines, Comic Sans
- **Settings panel**: runtime theme switching, bell-sound mute,
  vibrate-duration slider. All preferences persist in localStorage.
- **YMODEM file transfers**: send and receive, unchanged from the
  original (kept as fallback during Phase 4).
- **All original features intact**: ANSI/CTERM parser, RIPscrip
  graphics, telnet negotiation, font collection, virtual keyboard,
  copy/paste, scrollback, focus warning, screen-size selector,
  modern/classic scrollback modes.

### What's coming next (Phase 4)

ZMODEM file transfers — the major feature missing from the original.
Synchronet, Mystic, ENiGMA½, and other modern BBSes all use ZMODEM by
default; YMODEM-G is unreliable over today's TCP-and-WebSocket stack.

Phase 4 is shipping in 7 stages, currently 2 of 7 complete:

  1. ✅ CRC-32 + protocol constants (foundation)
  2. ✅ ZMODEM streaming decoder
  3. 🚧 ZMODEM encoder (next)
  4. ⏳ Receive state machine
  5. ⏳ Send state machine
  6. ⏳ Auto-detect in the ANSI parser
  7. ⏳ Transfer-progress UI (SyncTERM-style, themed per active theme)

See `docs/` for stage-by-stage planning notes:
  - `phase4-references.md` — ZMODEM implementations we consult informally
  - `phase4-ui-decision.md` — Stage 7 dialog design

### Test coverage

785 unit tests across 41 files, run on every commit. Phase boundaries:

  - End of Phase 1: 559 tests
  - End of Phase 2: 691 tests
  - End of Phase 3: 722 tests
  - Phase 4 Stage 1: 756 tests
  - Phase 4 Stage 2: 785 tests

## Quick start

```bash
npm install              # install dependencies
npm run dev              # start Vite dev server with hot reload (port 5173)
npm test                 # run the full Vitest suite
npm run typecheck        # tsc --noEmit
npm run build:all        # produce all four bundle flavors
```

Output bundles land in `dist/`:

- `ftelnet.norip.noxfer.js` — ANSI/BBS only, smallest bundle (~400KB)
- `ftelnet.norip.xfer.js` — adds file transfer (YMODEM today; YMODEM+ZMODEM after Phase 4)
- `ftelnet.rip.noxfer.js` — adds RIPscrip graphics emulation
- `ftelnet.rip.xfer.js` — everything (~483KB / ~102KB gzipped)

Each comes with a source map and a minified `.min.js` variant.

## Embedding

The public API matches the original fTelnet exactly. Existing sysop
integrations continue to work unchanged.

```html
<div id="fTelnetContainer"></div>
<script src="ftelnet.norip.xfer.min.js" id="fTelnetScript"></script>
<script>
  const options = new fTelnetOptions();
  options.Hostname = 'bbs.ftelnet.ca';
  options.Port = 1123;

  // New in Phase 3 — pick the visual theme for the chrome:
  options.Theme = 'dos-classic';        // or any of the 6 themes

  // New in Phase 3 — runtime defaults the user can override:
  options.MuteSounds = false;            // bell sounds (paste-bell etc.)
  options.VirtualKeyboardVibrateDuration = 25;  // ms

  const client = new fTelnetClient('fTelnetContainer', options);
</script>
```

Users can change theme / mute / vibrate at runtime via the Menu →
Settings... popup. Their choices override the embed defaults and
persist in localStorage.

## Architecture notes

Brief orientation for contributors:

- **`src/common/`** — the protocol-independent foundations: `ByteArray`
  (binary buffer with read/write cursor), `CRC` (CRC-16 and CRC-32),
  `StringUtils`, `KeyboardKeys`, telnet codes.
- **`src/connections/`** — WebSocket connection wrappers (TelnetConnection
  for raw telnet, RLogin, SSH-over-WebSocket).
- **`src/crt/`** — the BBS canvas itself: text rendering, font loading,
  ANSI/CTERM parser, scrollback buffer, Atari/C64/PETSCII modes,
  RIPscrip integration.
- **`src/components/`** — Lit `<f-*>` web components for all UI chrome.
- **`src/filetransfer/`** — YMODEM today; ZMODEM in progress (Phase 4).
- **`src/ftelnetclient/`** — `fTelnetClient` and `fTelnetOptions`, the
  facade the embedded `<script>` integration sees.
- **`public/ftelnet.css`** — design tokens + theme blocks + component
  styles. Themes are CSS-only: ~30 lines of `[data-theme='...']`
  variable definitions per theme.

Path aliases (configured in `tsconfig.json` and `vite.config.ts`):
`@common`, `@components`, `@connections`, `@crt`, `@crtcontrols`,
`@filetransfer`, `@graph`, `@ftelnetclient`.

## License

GNU Affero General Public License v3, matching upstream fTelnet.
See `LICENSE`.

## Acknowledgements

Original fTelnet © Rick Parrish, R&M Software. The hard work — the
ANSI/CTERM parser, RIPscrip interpreter, telnet negotiation, font
collection, and architectural design — is his. This fork is
maintenance and modernization on top of that foundation.

Phase 4 ZMODEM implementation is cleanroom TypeScript informed by:
  - **FGasper's zmodem.js** (Apache-2.0) — the de facto JS reference
  - **zxdong262's zmodem2-js** (MIT) — TypeScript port of the Rust
    zmodem2 crate
  - **lrzsz** by Uwe Ohse (public domain) — the wire-format reference
    every BBS server uses

We consult these implementations when the spec is ambiguous; we do
not copy code from them. See `docs/phase4-references.md`.
