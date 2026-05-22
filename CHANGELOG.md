# Changelog

All notable changes to fTelnet-Modern are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.0-beta.4] — 2026-05-22

A polish-and-fix release. No new headline feature — four focused
improvements to existing behavior and presentation.

### Fixed

  - **Screen size now resets for fresh visitors.** Previously the
    chosen screen size (e.g. 132×37) was saved to localStorage and
    persisted forever — so on a shared or public BBS page, the next
    visitor inherited whatever the previous person had set. Screen
    size now uses sessionStorage instead: it still survives reloads
    and disconnect/reconnect within the same browser-tab session
    (so a user who resizes, connects, drops, and reconnects keeps
    their size), but a brand-new visitor in a fresh tab always
    starts at the default 80×25 and makes their own choice. A
    one-time cleanup removes the old localStorage keys.

### Changed

  - **Protocol radios reordered.** In Settings → Protocol, ZModem
    now appears first (it's the default the menu acts on), with
    YModem second as the legacy fallback. The previous order had
    YModem listed first.

  - **Themed informational dialogs.** The "how downloads work" and
    "how to copy text" messages were previously raw browser
    `alert()` popups — tiny text, no title bar, the page origin
    ("localhost:5173") shown as a pseudo-title. They're now a
    proper themed `<f-info-dialog>` component: a real title bar,
    larger readable body text, and chrome that follows the active
    theme across all six themes. Dismissed by OK, Escape, Enter,
    or click-outside.

### Documentation

  - **README: new "Multi-platform BBS rendering" feature entry.**
    Documents fTelnet-Modern's faithful support for vintage BBS
    display styles — ANSI/CP437, PETSCII (Commodore), ATASCII
    (Atari), Topaz/Amiga ANSI, and RIPscrip — each sysop-configured
    at embed time via `Options.Emulation`. Tightened the
    "all original features intact" line to avoid duplication.

### Tests

1099 → 1121. Four new tests covering the sessionStorage screen-size
behavior (restore from sessionStorage, ignore stale localStorage,
clean up legacy keys, reject out-of-range values), one new
assertion locking in the ZModem-first protocol order, and a new
17-test suite for the `<f-info-dialog>` component (rendering,
paragraph splitting, and all four dismissal paths).

### Bundle

~640 → ~646 KB raw / ~140 → ~141 KB gzipped. The small bump is the
new info-dialog component; the screen-size and protocol changes
are behavioral, not new code paths.

## [2.0.0-beta.3] — 2026-05-20

User-facing feature addition: an in-app user manual.

### Added

  - **User Manual popup.** A new "Manual" button on the main menu
    opens a floating, draggable, resizable popup with the complete
    user manual. Written for users of all experience levels — from
    teenagers who've never seen a BBS to seasoned sysops. Includes
    a table of contents with jump-to-section anchors, friendly
    explanations of every menu button, a section on how file
    transfers work, and a troubleshooting tips section covering
    common situations including BBS display styles (ANSI, PETSCII,
    ATASCII, Topaz/Amiga). Larger font size (14px body / 18px
    headings) for readability.

  - **Menu layout: Settings split into Settings + Manual.** The
    previous full-width "Settings..." cell is now two adjacent
    half-width cells: "Settings" on the left and "Manual" on the
    right. Both are always visible — the Manual is one click away
    for first-time users.

### Behavior

  - **Per-session manual visibility.** The manual stays open
    across menu/settings interactions during a session, but
    closes automatically on disconnect and re-opens centered on
    next demand (any drag-positioning the user did is forgotten).
  - **Theme-aware.** The manual popup follows the active theme;
    switching themes mid-session updates the manual's appearance
    live.

### Tests

1082 → 1099. Seventeen new tests in `FUserManual.test.ts` cover
default state, visibility toggling, first-open centering,
position-reset behavior, close button + event dispatch, TOC
anchor handling, and multi-instance independence. Two entries
added to the menu action-button test for Settings and Manual.

### Bundle

619 → 640 KB raw / 133.64 → 139.68 KB gzipped. About 21 KB added
for the manual content (hardcoded TypeScript constant) and
component code.

## [2.0.0-beta.2] — 2026-05-20

Patch release fixing a user-facing label inconsistency reported
during beta.1 smoke testing.

### Fixed

  - **Upload confirm dialog and drop overlay now reflect the
    active transfer protocol.** With YMODEM selected as the
    default, the menu buttons correctly relabeled to "Upload
    (YMODEM)" / "Download (YMODEM)" — but the upload confirm
    dialog still showed "Protocol: ZMODEM" and the drag-and-drop
    overlay still said "to upload via ZMODEM", regardless of the
    setting. The routing was correct (YModemSend received the
    bytes) but the UI labels lied about which protocol was in
    use, undermining the whole point of the protocol picker.
    Fix follows the same reactive-property pattern FMenuPopup
    already uses: fTelnetClient pushes the active protocol value
    to both components at construction and on every settings
    change.

### Tests

1075 → 1082. Seven new regression tests covering the upload
confirm dialog's single-file and multi-file body renderers, and
the drop overlay's subtitle, including live re-render on
setting change.

### Bundle

618 → 619 KB raw / 133.51 → 133.64 KB gzipped — barely changed
(about 1 KB for the new properties and conditional templates).

## [2.0.0-beta.1] — 2026-05-20

First public beta of the fTelnet-Modern fork. Architecturally
settled, feature-complete for everyday BBS use, and tested
against Synchronet, Mystic, and PCBoard hosts.

### Added

  - **Modern toolchain**: TypeScript 5.9 strict, Vite 5, ESM, Vitest 2.
    Full dev-server with hot reload; four build flavors
    (norip/rip × noxfer/xfer).
  - **Lit web component UI**: every chrome element — focus warning,
    scrollback bar, status bar, menu popup, virtual keyboard,
    settings panel, transfer progress, upload confirm dialog, drop
    overlay — is now a `<f-*>` web component using light DOM so
    existing CSS selectors continue to apply.
  - **Theming system**: 6 built-in themes (Classic, DOS-Classic,
    CRT-Green, Cyberpunk, Gothic, Cartoon) selectable at runtime.
    Theme persists across reloads via localStorage.
  - **Settings panel**: runtime preferences UI floating over the
    canvas. Four-column layout (Theme | Protocol | Sound+Touch |
    Reserved-for-future). Includes an About section with version,
    fork attribution, upstream attribution, and license info.
  - **ZMODEM file transfer**: cleanroom TypeScript implementation
    of the ZMODEM protocol, replacing YMODEM as the default. Full
    bidirectional send/receive, multi-file batch upload via
    drag-and-drop, auto-detect on inbound transfers, SyncTERM-style
    progress panel updating at 10 Hz.
  - **Default Transfer Protocol setting**: user-facing picker
    (ZMODEM/YMODEM) in Settings. Menu's Upload/Download buttons
    show the active protocol in their labels and route to the
    matching state machine.
  - **YMODEM upload wiring**: the `YModemSend` class existed in
    the original codebase with unit tests but no UI path called
    it. Now wired through the same drag-drop confirm flow as the
    ZMODEM upload, using YMODEM's legacy in-canvas progress
    dialog.
  - **Custom splash screen**: hand-crafted fTelnet-Modern ANSI
    block-art greets users on connect.
  - **Diagnostic logger module** (`ZmDebug`): categorized
    in-context logging for ZMODEM state-machine investigation.

### Fixed

  - **ZMODEM sender XON byte after ZCRCW subpackets** — Phase 5
    Delta 2.20. Every ZCRCW subpacket must end with XON (0x11) per
    Forsberg's reference zmodem.cpp. Our encoder omitted it. This
    single missing byte explained both multi-file batch aborts on
    Synchronet AND "every-other-block CRC error" patterns on
    PCBoard. The companion decoder fix silently absorbs XON/XOFF
    in IDLE state. See `docs/phase5-zmodem-saga.md` for the full
    diagnostic arc.
  - **ZMODEM sender hardening (defensive)** — resync retry timer
    (Delta 2.13), stale-ZRPOS deduplication (Delta 2.15), ZNULLS
    prefix before resync ZDATA (Delta 2.16), time-windowed dedup
    (Delta 2.17). Kept as scaffolding for now; candidates for
    cleanup after more field experience confirms the XON fix is
    sufficient alone.

### Preserved from the original fTelnet

  - All original features: ANSI/CTERM parser, RIPscrip graphics,
    telnet negotiation, font collection, virtual keyboard,
    copy/paste, scrollback, focus warning, screen-size selector,
    Atari/C64/PETSCII emulation modes.
  - Public API surface for embedded integrations
    (`fTelnetClient`, `fTelnetOptions`) — existing sysop embeds
    continue to work unchanged.
  - AGPL-3.0 license and Rick Parrish / R&M Software attribution.

### Known limitations

  - **Large-file save lag**: per-byte accumulator pattern in the
    download path causes a multi-second freeze when ZMODEM
    finishes a multi-MB file. Fix queued for early 2.0.0-beta.2.
  - **YMODEM throttle interaction**: the original codebase pauses
    a throttle mechanism during YMODEM transfers to allow full
    speed. Whether ZMODEM transfers correctly pause the same
    throttle is still under investigation — may affect PCBoard
    transfer speeds. Slated for beta.2.
  - **YMODEM auto-detect**: deferred. ZMODEM has a distinctive
    six-byte trigger sequence; YMODEM's start pattern collides
    with common ANSI bytes and risks false positives that would
    hijack the terminal display. YMODEM stays user-initiated via
    the menu Download button with YMODEM picked as the default
    protocol.
  - **PWA install manifest** and **in-canvas progress panel**:
    Phase 5 polish items still in flight.

### Tests

1075 unit tests across 52 files. Phase boundaries:

  - End of Phase 1 (modernize foundation): 559 tests
  - End of Phase 2 (Lit components): 691 tests
  - End of Phase 3 (theming): 722 tests
  - End of Phase 4 (ZMODEM): 980 tests
  - 2.0.0-beta.1 (Phase 5 in progress): 1075 tests

### Bundle

  - `ftelnet.rip.xfer.min.js`: ~618 KB / ~133 KB gzipped
  - `ftelnet.norip.xfer.min.js`: ZMODEM without RIPscrip
  - `ftelnet.rip.noxfer.min.js`: RIPscrip without file transfer
  - `ftelnet.norip.noxfer.min.js`: ANSI/BBS only, smallest bundle

## Pre-history

The 2.0.0 line is a major modernization of the original fTelnet
by Rick Parrish (R&M Software). The original is documented at
<https://www.ftelnet.ca>. Pre-2.0 releases predate this fork.
