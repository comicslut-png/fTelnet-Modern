# Changelog

All notable changes to fTelnet-Modern are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.0-beta.10] — 2026-05-22

Extends localization coverage beyond the chrome translated in
beta.6–9: the screen-size dropdown now translates, and the in-app
User Manual documents the language feature. No new language — this
broadens what the existing four languages cover.

### Added

  - **Screen-size dropdown localized.** The "{n} columns x {m}
    rows" option labels in the menu's screen-size picker now
    translate (German "Spalten/Zeilen", French "colonnes/lignes",
    Spanish "columnas/filas") via a new `menu.screensize` catalog
    key and the `tf()` interpolation helper. The numbers and
    aspect-ratio suffixes (16:9, 5:4) stay as-is. The on-screen
    keyboard deliberately remains English — localizing keymaps/IME
    is out of scope.

  - **User Manual: Language section.** The in-app manual gained a
    new "Language" section (and a Settings-panel mention) explaining
    the language picker, which areas translate, that the BBS content
    and the keyboard stay as-is, and how to volunteer a translation.
    The Settings section's persistence note was also corrected to
    describe the per-session (reset-for-next-visitor) behavior.

### Tests

1182 → 1184. Two screen-size dropdown localization tests; User
Manual TOC/section assertions updated for the new Language section.

### Bundle

~666 → ~669 KB raw / ~146 KB gzipped.

## [2.0.0-beta.9] — 2026-05-22

Spanish (Español) joins the language list, completing the four
languages the picker has advertised since beta.6. Like French, it's
a catalog-only addition.

### Added

  - **Spanish translation.** A new `es.ts` catalog covering the main
    menu, the status bar (with `{host}`/`{proxy}` interpolation),
    and the Settings panel labels. Spanish is now selectable in the
    Settings language picker — its radio, the last remaining
    disabled "coming soon" placeholder, is now live. (Best-effort
    translation, native review pending; corrections are
    catalog-only.)

  - As with French, this touched only `src/i18n/` — the new
    `es.ts` plus registering it in `index.ts`. No component,
    client, or CSS changes.

### Note

All four advertised languages (English, German, French, Spanish)
are now functional — none of the picker's language radios are
disabled anymore. The "coming soon" disabled-radio mechanism
remains in the code for any future language and still backs the
three "Other" placeholder slots.

### Tests

1179 → 1182. Spanish lookup, interpolation, menu-switch, and
picker-dispatch tests. The fallback-to-English tests, which
previously used Spanish as the unregistered example, now use a
synthetic unregistered code (since all four listed languages have
catalogs).

### Bundle

~663 → ~666 KB raw / ~145 KB gzipped.

## [2.0.0-beta.8] — 2026-05-22

French (Français) joins the language list — the first language added
purely through the catalog system, with no component changes, which
is exactly what the i18n architecture was built for.

### Added

  - **French translation.** A new `fr.ts` catalog covering
    everything German covers today: the main menu, the status bar
    (with `{host}`/`{proxy}` interpolation), and the Settings panel
    labels. French is now selectable in the Settings language
    picker — its radio, previously a disabled "coming soon"
    placeholder, is now live. (Best-effort translation, native
    review pending; corrections are catalog-only.)

  - Adding French touched only `src/i18n/` — the new `fr.ts`, plus
    registering it in `index.ts` (import, `CATALOGS`, and flipping
    its `available` flag to true). No component, client, or CSS
    changes were needed. Spanish remains a "coming soon"
    placeholder.

### Tests

1175 → 1179. French lookup and interpolation tests, a French
menu-switch test, and a French language-picker dispatch test; the
existing "placeholder language" fallback tests were repointed from
French to Spanish (since French now has a real catalog).

### Bundle

~660 → ~663 KB raw / ~144 KB gzipped.

## [2.0.0-beta.7] — 2026-05-22

Continues the localization work from beta.6: the status bar — the
persistent chrome below the terminal — now translates too.

### Added

  - **Localized status bar.** The "Menu" button and every dynamic
    connection-status message — "Connecting to…", "Connected to…",
    "Disconnected from…", "Unable to connect to…" (each with its
    "via proxy" variant), plus the "Not connected" idle label and
    the Connect / Reconnect / Retry Connection button text — now
    render in the active language. German is translated (best
    effort, review pending); other languages fall back to English
    per key as usual.

  - **Parameterized translations.** A new `tf(key, lang, params)`
    helper interpolates `{host}` / `{proxy}` placeholders into a
    translated template, so status messages keep their
    hostname/port (which stay language-neutral) while the
    surrounding words translate. Unmatched tokens are left intact
    rather than silently dropped.

### Note on timing

The "Menu" button and idle labels switch language immediately. The
live connection-status text is composed at connection-event time,
so a mid-session language change is reflected on the next status
event (connect/disconnect) rather than retroactively — a
deliberate, low-surprise choice for a status line.

### Still English for now

Screen-size dropdown, user manual, virtual keyboard, and transfer
dialogs remain English — later passes. (The info-dialog keys
already exist in the catalog.)

### Tests

1168 → 1175. Five new `tf()` interpolation tests (single/multiple
placeholders, German template, unmatched-token, placeholder-language
fallback) and two status-bar Menu-button localization tests.

### Bundle

~657 → ~660 KB raw / ~143 → ~144 KB gzipped.

## [2.0.0-beta.6] — 2026-05-22

The first step toward a multilingual fTelnet-Modern: a language
system, with the main menu fully translatable and German as the
first non-English language. International sysops run BBSes in their
own languages; this lets their users navigate the client chrome in
a language they read.

### Added

  - **Internationalization (i18n) system.** A new `src/i18n` module
    holds one string catalog per language, keyed by stable IDs,
    with English (`en.ts`) as the base. A `t(key, lang)` helper
    returns the translation for the active language, falling back
    to English for any key a translation hasn't filled in yet — so
    a partially-translated language is still fully usable (German
    where translated, English elsewhere). Adding a language later
    is catalog-only: copy the English file, translate the values,
    register it. No component changes needed.

  - **Language picker in Settings.** A new Language fieldset with
    English and German functional today, and French, Spanish, and
    three "Other" slots shown as disabled "coming soon"
    placeholders — advertising the feature and inviting translation
    contributions. The choice persists per browser-tab session
    (sessionStorage, like the other settings) and resets to the
    default for a fresh visitor.

  - **German translation of the main menu.** Selecting German
    switches every main-menu button (Connect, Disconnect, Copy,
    Paste, Upload, Download, Keyboard, Full Screen, View
    Scrollback, Settings, Manual) to German live, without a
    reconnect. The Settings panel's own labels (legends, header,
    Close, Auto Detect) are wired to the system too. NOTE: the
    German strings are a first-pass best effort pending native-
    speaker review.

### Changed

  - **Settings panel: two-row grid + Language column.** Reshaped to
    a 2×3 grid — Theme | Protocol | Language on top, Sound | Touch |
    placeholder below — with the Language column wider to fit its
    two internal sub-columns of radios. About spans full width
    below as before.

  - **Settings panel: icons removed.** The emoji icons on the
    option labels (🎨 themes, 📡/📼 protocols, 🔍 auto-detect, 🔇
    mute, 📳 vibrate) are gone; the panel is now clean text
    throughout, matching the requested mockup.

### Not yet translated (English for now, by design)

The status bar (the "Menu" button and connection-status messages),
the screen-size dropdown, the user manual, the virtual keyboard,
and the transfer dialogs remain English in this release. They're
slated for a later pass; the i18n keys for several already exist.

### Tests

1135 → 1168. New i18n-core suite (14: lookup, English fallback,
placeholder-language fallback, registry availability); menu
localization (4); settings language picker and panel localization
(12); and the settings layout tests rewritten for the two-row grid
(net +3).

### Bundle

~646 → ~657 KB raw / ~141 → ~143 KB gzipped. The increase is the
i18n catalogs and the expanded settings panel.

## [2.0.0-beta.5] — 2026-05-22

A performance fix, a privacy/sharing fix, and a settings-panel
layout tidy-up.

### Fixed

  - **YMODEM large-file save lag.** Saving a received YMODEM file
    went through an intermediate JavaScript string the size of the
    whole file, then a per-byte `DataView.setUint8` loop to walk
    that string back into an `ArrayBuffer` — two O(n) main-thread
    passes plus a full-size string allocation. On multi-megabyte
    files this produced a visible freeze at save time. The file's
    bytes are now read straight out of the `ByteArray` into a
    `Uint8Array` (new `ByteArray.toUint8Array()` accessor) and
    handed directly to the `Blob` constructor, which does the one
    underlying copy in native code. This is the YMODEM analogue of
    the ZMODEM save-lag fix already shipped earlier in Phase 5; the
    two receive paths now save efficiently and consistently.

  - **Settings no longer persist to the next visitor.** Theme,
    mute, vibrate duration, ZMODEM auto-detect, and default
    protocol were saved to localStorage and persisted forever — so
    on a shared or public BBS page, the next visitor inherited
    whatever the previous person had set. These now use
    sessionStorage instead (the same approach beta.4 applied to
    screen size): a user's choices survive reloads and
    disconnect/reconnect within the same browser-tab session, but a
    brand-new visitor in a fresh tab always starts at the
    embed-time defaults. Stale localStorage keys from older
    versions are cleaned up automatically. All six user-adjustable
    settings (these five plus screen size) now behave consistently.

### Changed

  - **Settings panel: four columns → three.** The dedicated empty
    fourth column is gone. The panel is now Theme | Protocol |
    Sound+Touch, more compact, with the empty bordered placeholder
    fieldset relocated to the bottom of the third column (below
    Touch) rather than occupying a full column of its own. It still
    reserves room for a future setting; it just doesn't waste a
    whole column's width doing so. The Theme column sets the panel
    height and the placeholder stretches to fill the leftover space
    in column 3, keeping the bottom edges aligned.

### Tests

1121 → 1135. Five new tests for `ByteArray.toUint8Array()`; eight
new tests for the sessionStorage settings persistence (one restore
test per setting, plus legacy-localStorage-ignored,
legacy-key-cleanup, and unknown-protocol-rejected); and the
settings-panel layout tests updated from four-column to
three-column with a new assertion that the placeholder fieldset
sits at the bottom of column 3.

### Bundle

Essentially unchanged at ~646 KB raw / ~141 KB gzipped.

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
