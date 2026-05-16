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
| 4. ZMODEM file transfer (replaces YMODEM as default)                   | 🚧 In progress (6/7 stages)   |
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

Phase 4 is shipping in 7 stages, currently 6 of 7 complete:

  1. ✅ CRC-32 + protocol constants (foundation)
  2. ✅ ZMODEM streaming decoder
  3. ✅ ZMODEM encoder
  4. ✅ Receive state machine
  5. ✅ Send state machine
  6. ✅ Auto-detect + fTelnetClient wiring (ZMODEM goes live)
  7. 🚧 Transfer-progress UI (faithful SyncTERM-style retro panel)

See `docs/` for stage-by-stage planning notes:
  - `phase4-references.md` — ZMODEM implementations we consult informally
  - `phase4-ui-decision.md` — Stage 7 dialog design
  - `future-protocols.md` — post-Phase-4 to-do list (HSLink, etc.)

### Test coverage

903 unit tests across 45 files, run on every commit. Phase boundaries:

  - End of Phase 1: 559 tests
  - End of Phase 2: 691 tests
  - End of Phase 3: 722 tests
  - Phase 4 Stage 1: 756 tests
  - Phase 4 Stage 2: 785 tests
  - Phase 4 Stage 3: 821 tests
  - Phase 4 Stage 4: 849 tests
  - Phase 4 Stage 5: 874 tests
  - Phase 4 Stage 6: 903 tests

## Testing against a real BBS

Once a build is loaded in the browser, you can connect to a live
Synchronet BBS to exercise the full ANSI + ZMODEM stack. Two
recommended hosts:

**Diamond Mine Online** (`sbbs.dmine.net:24`) — long-running
Synchronet BBS in Fredericksburg, VA, in operation since 1993.
Large shareware file collection (programs, games, utilities,
MIDI music) so it's a good ZMODEM target. Sysop maintains the
*Telnet BBS Guide* and *BBS Corner* sites. Backup hostname
`dmine.ddns.net:24` if primary is unreachable.

**bbs.ftelnet.ca:23** — the upstream fTelnet demo server (Rick
Parrish, R&M Software). Smaller, primarily a connectivity demo;
useful for testing the connection flow but does not have
downloadable files for exercising ZMODEM.

For ZMODEM smoke-testing, the simplest path is to edit
`src/main.ts` (the dev-server entry point) to point at Diamond
Mine via Rick Parrish's public WebSocket proxy:

```typescript
Options.Hostname = 'sbbs.dmine.net';
Options.Port = 24;
Options.ProxyHostname = 'p-us-east.ftelnet.ca';
Options.ProxyPort = 80;
Options.ProxyPortSecure = 443;
```

Save the file, then run `npm run dev` and open the page in
Firefox. The proxy bridges WebSocket → raw telnet for any
`Hostname:Port` you specify, so you don't need Diamond Mine to
run their own WebSocket bridge.

Once connected, log in with your existing Diamond Mine account,
navigate to a file area (typically `F` from the main menu),
pick a small file, and type `D` to download. Stage 6's
auto-detect should fire when Synchronet starts the ZMODEM
transfer; the browser save dialog should pop up when the
transfer completes. Visible progress UI lands in Stage 7.

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
