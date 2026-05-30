# Changelog

All notable changes to fTelnet-Modern are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.0-beta.48] — 2026-05-30

Connect-button restoration, menu-popup scroll fix, and the first
embed-mode options for sysops dropping fTelnet-Modern into an
existing page.

### Added

  - **Connect button is back on the status bar** as the primary
    action, alongside the existing Menu button. State-aware: reads
    "Connect" while idle, switches to "Disconnect" while connected
    (one click hangs up with a confirm prompt, matching the menu's
    Disconnect entry), and to "Reconnect" / "Retry Connection" after
    a drop or failed attempt. Hidden only briefly during the
    "Connecting…" in-flight phase to prevent double-clicks. The
    earlier rationale for hiding it (force menu discovery) didn't
    survive contact with real users — the primary action should
    always be one click away. The Connect/Disconnect entries in the
    menu drop-down remain available for users who prefer them there.
    New i18n key `status.button.disconnect`, translated in all 15
    languages (matching the existing `menu.disconnect` wording).
  - **Embed-mode options for sysops.** Two new `Options.*` knobs
    for dropping fTelnet-Modern into a constrained slot on an
    existing page rather than running as a full-page terminal:
      - `Options.AllowMenu` (default `true`) — set false to hide
        the Menu button entirely. Embedded visitors keep the Connect
        button (so they can always start/end a session) but can't
        reach Settings, Copy/Paste, Upload/Download, Keyboard, Full
        Screen, etc. No backdoor paths: when the Menu button is
        hidden, the menu popup and the settings panel are
        unreachable.
      - `Options.AllowResize` (default `true`) — set false to fully
        lock the BBS screen size. Gates BOTH the auto-resize when
        the browser window changes size (plumbed through to the
        Crt's existing `AllowDynamicFontResize`) AND the
        user-initiated screen-size picker in the Menu drop-down
        (the row is hidden entirely so there's no dead UI to
        confuse anyone). The intent is "no path to changing size,
        full stop."
    Both default true so existing deployments are unchanged. Names
    match the original fTelnet's embed-API conventions.
  - **`index-embed.html`** in the starter package — a worked example
    of an embed deployment (mock BBS-listing host page, fixed 720×400
    fTelnet slot, both embed options set false), so sysops can see a
    real embed before adapting one for their own site.

### Fixed

  - **Menu popup now tracks the canvas through page scroll.** The
    drop-down menu used `position: fixed` but was positioned with
    `pageX/pageY` (document-relative coordinates) — a mismatch that
    worked at `scrollY = 0` and drifted off the canvas by `scrollY`
    pixels once the user scrolled. Switched to `position: absolute`
    so the coordinate systems match; the popup now scrolls with the
    page in lockstep with the canvas, exactly as expected. The
    Settings panel (a centered modal by design) is unchanged.

### Changed

  - **Status-bar action-button label cycles through four states**
    (was three): Connect → Disconnect → Reconnect → Retry Connection.
    Disconnect is the new state, added with this release; the others
    are unchanged.

### Starter package

  - `README.txt` — new **EMBED MODE** section explaining both
    options, when to use each, and a worked example. New
    troubleshooting entry for "The Menu button is gone / I can't
    reach Settings anymore" — for the sysop who sets `AllowMenu`
    false, forgets, and thinks the build is broken.
  - `index-embed.html` — new file, ships alongside `index.html`.

### Tests

1356 → 1365 (+9 net):
  - FStatusBar: extended default-state assertion; flipped two
    visibility assertions; extended the label-reactivity `it.each`
    to cover the Disconnect state; new 3-test `menuButtonVisible`
    reactivity block (including a regression guard that hiding the
    menu doesn't accidentally hide the connect button).
  - FMenuPopup: flipped the `position: fixed` assertion to
    `absolute`; added a regression-guard test confirming `pageX/pageY`
    land verbatim without scroll math.
  - fTelnetOptions: added the two new defaults to the defaults list,
    plus a focused embed-mode independence test.
  - i18n: new translated-value test for `status.button.disconnect`
    across en/de/fr/ja/ru/el, confirming the bar's Disconnect label
    matches the menu's word-for-word per language.

### i18n

110 → 111 keys. New `status.button.disconnect` in all 15 catalogs;
translations identical to the existing `menu.disconnect` so the bar
and menu read the same per language.

## [2.0.0-beta.47] — 2026-05-28

Privacy housekeeping: removes the maintainer's email address from
every part of the repo and re-centers the splash-screen fork credit
now that the email is gone.

### Changed

  - **Splash screen** — the fork-credit line now reads simply
    "Modernized fork by Tom Swartz" (email removed). On the ANSI and
    RIP splashes it is true-centered on the 80-column screen (the
    29-character string starts at column 25); the Atari and C64
    splashes keep it left-aligned in their native 40-column fonts.
  - **About panel** — "Tom Swartz" is now plain text rather than a
    `mailto:` link.
  - **Copyright notices** — the email was stripped from `NOTICE`,
    `LICENSE`, `README.md`, `package.json` (`"author"`), and the
    per-file source headers in `fTelnetClient.ts`, `FReconnectDialog.ts`,
    `FDropOverlay.ts`, `FUploadConfirm.ts`, and `FConfirmDialog.ts`.
    Name and "© 2026" are retained; attribution to Rick Parrish /
    R&M Software is unchanged.

### Notes

  - No functional or i18n changes; the catalogs stay at 110 keys and
    the suite stays at 1356 tests. The public Danger Bay BBS host
    address in the README (`dangerbaybbs.dyndns.org`) is a connection
    address, not contact info, and is intentionally retained.

## [2.0.0-beta.46] — 2026-05-26

Cosmetic and usability polish for the Settings panel: aligned the
Terminal options to a clean grid and added hover tooltips across the
Sound, Touch, Terminal and Protocol groups.

### Added

  - **Settings tooltips.** Hovering a setting now shows a short,
    theme-styled tooltip above it describing what the option does.
    Covers Mute (Sound), Vibrate (Touch), Local Echo / Auto Reconnect /
    Doorway Mode / RIP (Terminal), and Auto Detect (Protocol). The
    tooltip is a filled rounded box with a small pointer, coloured a
    brighter, distinguished shade of the active theme (e.g. blue on
    Classic, inverted phosphor-green on CRT-Green, magenta on
    Cyberpunk, firebrick on Gothic, red on Cartoon). All seven
    descriptions are translated in every UI language.

### Changed

  - **Terminal options aligned to a grid.** The four Terminal options
    (Local Echo, Auto Reconnect, Doorway Mode, RIP) now sit in a
    four-column grid so the checkboxes form two straight vertical lines
    and the labels line up within each column, instead of the previous
    staggered look. The Sound, Touch and Terminal boxes remain
    height-matched and centred.



Adds a user-facing RIPscrip graphics toggle, so callers can choose RIP
mode from the Settings panel rather than needing a sysop to hard-set it
at embed time.

### Added

  - **RIP toggle** (Settings → Terminal, OFF by default). A new RIP
    checkbox in the Terminal group lets the user opt into RIPscrip
    graphics. Because RIP is initialised at client construction (its
    bitmap font, 43-row geometry and graphics layer), toggling the box
    reloads the page with a URL flag (`ftrip`) so the client boots into
    RIP the proven construction-time way — never a fragile mid-session
    switch. Behaviour:
      - Two distinct actions: checking RIP reloads into a RIP-ready
        state; the user then clicks Connect. Unchecking reloads back to
        ANSI (so a user who changes their mind before connecting can
        simply uncheck).
      - Disabled while connected — no mid-session toggling.
      - Not persisted. A user-initiated disconnect from a RIP session
        reloads back to ANSI, so every session starts fresh in ANSI
        unless RIP is explicitly chosen. (Auto-reconnect stays in RIP.)

### Changed

  - Settings Terminal group now lays its four options (Local Echo, Auto
    Reconnect, Doorway Mode, RIP) out in a 2×2 grid. The Sound, Touch
    and Terminal boxes on row 2 are height-matched and centre their
    contents so the row stays balanced.

### Notes

  - The RIP renderer itself is unchanged; this release only adds the
    user-facing way to enter RIP mode. RIP rendering is known-good on
    Synchronet; PCBoard RIP detection may still need work and should be
    treated as experimental.



Adds Doorway Mode — transmits IBM PC extended keystrokes so callers can
use sysop full-screen editors and drop-to-DOS on the BBS.

### Added

  - **Doorway Mode** (Settings → Terminal toggle, OFF by default). When
    on, extended/special keys (arrows, F1–F12, Insert/Delete/Home/End/
    PageUp/PageDown, and Alt/Ctrl key combinations) are transmitted as
    the IBM PC convention NULL (0x00) + BIOS scan code, so DOS
    full-screen programs (sysop editors, drop-to-DOS) receive them
    correctly. Plain printable keys are sent as-is. The host can also
    toggle it via the standard `ESC[=255h` / `ESC[=255l` sequences
    (previously parsed but unhandled). On the output side, a received
    NULL forces the next byte to be drawn literally. Modifier
    precedence: Alt wins over Ctrl. Not persisted — resets to off on
    each page load. Scan-code mapping verified against the HelpPC INT
    16h table and cross-checked against the Banana ANSI BBS doorway
    spec.

### Fixed

  - **Restored the bitmap font assets to `public/fonts/`.** The 150
    CP437/Amiga/Atari/C64/RIP glyph-sheet PNGs (plus the two RIP font
    JSONs) from upstream fTelnet were never carried into the modern
    repo — only the Japanese webfont was present — so the terminal's
    default font request (`fonts/CP437_9x16.png`) 404'd in any
    deployment served from the repo's public assets. All 150 PNGs + 2
    JSONs are now in `public/fonts/` and flow into every build.
  - **Added a favicon.** The repo had no `favicon.ico`, so browsers'
    automatic root favicon request 404'd on the dev server and on
    deployed pages. A small on-theme terminal icon (green prompt on a
    dark field) now ships in `public/` (favicon.ico + favicon-32.png +
    apple-touch-icon.png), referenced from the starter/test pages.

### Changed

  - Settings panel row 2 layout: the Terminal group now spans two
    columns (its right edge aligns with the Language group above),
    replacing the former empty placeholder box. The group's three
    options (Local Echo, Auto Reconnect, Doorway Mode) are laid out in
    a horizontal row rather than stacked, so the box is short and sits
    level with the Sound and Touch boxes for a streamlined row.
  - User manual: documented the Terminal settings group — Local Echo,
    Auto Reconnect, and Doorway Mode — and corrected a stale
    "four languages" mention to "fifteen languages."

### i18n

  - New key `settings.terminal.doorway`, translated in all 15
    languages. en.ts: 101 → 102 keys.

### Tests

1325 → 1347. Doorway key-encoding mappings (arrows, F-keys across all
modifier states, editing keys, Alt+letter, Alt+digit, Alt-wins
precedence, off-mode fallthrough); doorway enable/disable sequences and
the NULL-literal output rule; Settings Doorway checkbox; the new
two-row grid layout; i18n for the new key.

### Bundle

~773 → ~782 KB raw / ~168 KB gzipped.

## [2.0.0-beta.43] — 2026-05-24

Makes Auto Reconnect an opt-in setting (default off), fixing a case
where logging off the BBS triggered the reconnect popup.

### Changed

  - **Auto Reconnect is now a Settings toggle (Settings → Terminal),
    OFF by default.** Previously it was always on, so any disconnect —
    including a normal BBS logoff — popped the reconnect countdown,
    which was unwanted. Now the popup only appears when the user has
    enabled the toggle. The toggle does exactly what it says: when on,
    the countdown appears on any disconnect (except one initiated via
    fTelnet's own Disconnect button, and once the 3-attempt budget is
    spent); when off, it never appears. No close-type heuristics — the
    setting alone governs the behavior, so it's predictable regardless
    of BBS software or proxy. The choice persists per tab-session.

### i18n

  - New key `settings.terminal.autoreconnect`, translated in all 15
    languages. en.ts: 100 → 101 keys.

### Tests

1317 → 1325. Settings Auto-Reconnect checkbox (default off,
reactivity, change event); client-level trigger tests (off → no
popup; on → popup; user-initiated → no popup; budget spent → no
popup); i18n for the new key.

### Bundle

~770 → ~773 KB raw / ~166 KB gzipped.

## [2.0.0-beta.42] — 2026-05-23

Refines the beta.41 features (Local Echo + Auto Reconnect) and fixes
the Settings panel alignment.

### Changed

  - **Auto Reconnect is now capped at 3 attempts.** After three
    consecutive failed auto-reconnects the popup stops appearing and
    the client stays disconnected (Reconnect button still available).
    The counter resets to zero on any successful connection, so a
    later unrelated drop gets a fresh budget of 3. Cancelling also
    resets the budget.

  - **The reconnect popup now shows an "Attempts: n of N" line** below
    the countdown, so the user can see which attempt is in progress.
    New `reconnect.attempts` key ({n}/{max} interpolation), translated
    in all 15 languages. en.ts: 99 → 100 keys.

### Fixed

  - **Settings panel alignment.** The two rows of group boxes now sit
    on a shared 4-column CSS grid, so every box edge snaps to the same
    vertical grid lines in both rows. Previously the rows used
    flexbox with mismatched weights (a 3-box row vs a 4-box row
    subtract a different number of gaps), so the columns drifted out
    of alignment and the last box on row 2 was the wrong width. Now
    Theme/Sound, Protocol/Touch, and Language/(Terminal+placeholder)
    align cleanly, and the right edge is flush with the panel.

### Tests

1314 → 1317. Reconnect-dialog attempts-line rendering; i18n for the
new attempts key.

### Bundle

~769 → ~770 KB raw / ~166 KB gzipped.

## [2.0.0-beta.41] — 2026-05-23

Two new capabilities: a **Local Echo** setting and an **Auto
Reconnect** popup. Both fully translated across all 15 languages.

### Added

  - **Local Echo** toggle (Settings → Terminal). When on, characters
    you type are also drawn to the local screen — useful for BBSes,
    door games, or login prompts that don't echo input server-side,
    so you'd otherwise be typing blind. It drives the existing
    `Crt.LocalEcho` mechanism. **Off by default and intentionally NOT
    persisted** — it always starts off on a fresh load, since it's a
    per-session troubleshooting toggle. New `Terminal` group box in
    the Settings second row, which is now laid out as Sound | Touch |
    Terminal | (placeholder), four equal-height columns.

  - **Auto Reconnect.** When the connection drops *unexpectedly*, a
    themed popup announces "Connection lost", counts down from 5
    seconds, and reconnects automatically at zero. A single Cancel
    button (or Escape) stops it and leaves the normal disconnected
    state in place (with the Reconnect button available). It fires
    *only* on unexpected drops — never after a user-initiated
    Disconnect, distinguished by a flag set in performDisconnect().
    An accidental click outside the popup does nothing, so a misclick
    can't kill an in-progress reconnect. Always on for now (every
    unexpected drop); a retry cap can be layered on later via a
    counter at the call site without touching the popup. This is a
    feature, not a setting — there's no toggle for it.

  - New `FReconnectDialog` component (themed countdown modal, reuses
    FInfoDialog's CSS classes like FConfirmDialog does).

### i18n

  - 5 new keys, translated in all 15 languages: `settings.terminal`,
    `settings.terminal.localecho`, `reconnect.title`,
    `reconnect.body` ({seconds} interpolation), `reconnect.cancel`.
    en.ts: 94 → 99 keys.

### Tests

1299 → 1314. FReconnectDialog (countdown ticking, expiry →
reconnect, Cancel/Escape → stay disconnected, outside-click is a
no-op, timer stops after Cancel, translation); Settings Local-Echo
checkbox (default off, reactivity, change event); i18n for the new
keys; updated the row-2 layout tests for the new four-column row.

### Bundle

~757 → ~769 KB raw / ~165 KB gzipped.

## [2.0.0-beta.40] — 2026-05-23

Fourteenth and **final** language pass over the post-beta.22 message
strings: **Japanese (日本語)**. With this, all 15 languages are
complete. This release also introduces the **all-in-one sysop
starter package** as a downloadable release artifact.

### Added

  - **Japanese translations** for the complete set of message
    strings: the upload-confirm dialog, drag-and-drop overlay, focus
    warning, open-link prompt, scrollback bar, disconnect confirm,
    language-picker tooltip, and the shared OK/Cancel dialog buttons.
    Japanese has no grammatical plurals, so the `{count}`
    interpolations read naturally. Scrollback uses 履歴 to match the
    existing menu term.

    > **Native review strongly recommended.** Unlike the Latin/
    > Cyrillic/Greek passes, neither the maintainer nor the tooling
    > can reliably proofread CJK. These strings are careful best-
    > effort; corrections are catalog-only (no code change needed).

  - Verified by en/ja key diff: Japanese now has all 94 base keys
    (was 61), zero missing. No mojibake in the build.

  - **Sysop starter package** (`ftelnet-starter.zip`) — a ready-to-
    run, all-in-one bundle for BBS operators: the built client (all
    four flavors), `ftelnet.css`, fonts, the virtual keyboard assets,
    a 3-line-config `index.html`, and a plain-text README. Attached
    to this GitHub Release as a download (not committed to the source
    tree — it's a build artifact). See the release notes for usage.

### Changed

  - The i18n per-key fallback test was rewritten. Japanese was the
    last partial catalog; completing it means every real catalog is
    full, so the old "find a real language missing a key" approach
    can no longer exercise the fallback branch (its guard fired, as
    designed). It now asserts the fallback mechanism directly against
    an unregistered language code, so every English base key is
    proven to fall through to English.

### Font note (Japanese)

  - The bundled `noto-sans-jp-subset.woff2` is applied only as a
    *trailing* fallback on the UI chrome, so any Japanese codepoint
    not in the subset falls through to the system font (full JP
    coverage) rather than rendering as tofu. The new strings may
    introduce glyphs outside the current subset; regenerating the
    subset to include them is optional/cosmetic (see ja.ts notes).

### i18n — COMPLETE

All 15 languages now have the full 94-key catalog: English (base),
Dutch, German, French, Spanish, Portuguese, Italian, Russian,
Swedish, Polish, Ukrainian, Finnish, Greek, Czech, Japanese.

Intentionally left English by design: the file-transfer progress
panel (retro ASCII layout), developer/sysop error alerts, and the
user manual.

### Tests

1297 → 1299. Japanese popup/message + interpolation tests; fallback
test rewritten.

### Bundle

~755 → ~757 KB raw / ~163 KB gzipped.

## [2.0.0-beta.39] — 2026-05-23

Thirteenth language pass over the post-beta.22 message strings:
**Czech (Čeština)**.

### Added

  - **Czech translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons. Count
    strings use the label-style phrasing ("Soubory: {count}") for
    the same plural-grammar reason as Polish/Ukrainian.

  - Verified by en/cs key diff: Czech now has all 94 base keys
    (was 61), zero missing. (Best-effort, native review welcome —
    corrections are catalog-only.)

### Changed

  - The i18n fallback test was repointed from Czech (now complete)
    to Japanese — the last remaining partial catalog. (Once Japanese
    is completed, the test will need to switch to an unregistered
    code / fixture, since every real language will be complete; a
    note to that effect is in the test.)

### Tests

1295 → 1297. Czech popup/message + interpolation tests; fallback
test repointed.

### Bundle

~752 → ~755 KB raw / ~163 KB gzipped.

## [2.0.0-beta.38] — 2026-05-23

Twelfth language pass over the post-beta.22 message strings:
**Greek (Ελληνικά)** — its own (Greek) script.

### Added

  - **Greek translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons.

  - Verified by en/el key diff: Greek now has all 94 base keys
    (was 61), zero missing. Greek script confirmed intact through
    the build. (Best-effort, native review welcome — corrections are
    catalog-only.)

### Changed

  - The i18n fallback test was repointed from Greek (now complete)
    to Czech (still partial).

### Tests

1293 → 1295. Greek popup/message + interpolation tests; fallback
test repointed.

### Bundle

~750 → ~752 KB raw / ~162 KB gzipped.

## [2.0.0-beta.37] — 2026-05-23

Eleventh language pass over the post-beta.22 message strings:
**Finnish (Suomi)**.

### Added

  - **Finnish translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons.

  - Verified by en/fi key diff: Finnish now has all 94 base keys
    (was 61), zero missing. (Best-effort, native review welcome —
    corrections are catalog-only.)

### Changed

  - The i18n fallback test was repointed from Finnish (now complete)
    to Greek (still partial).

### Tests

1291 → 1293. Finnish popup/message + interpolation tests; fallback
test repointed.

### Bundle

~748 → ~750 KB raw / ~162 KB gzipped.

## [2.0.0-beta.36] — 2026-05-23

Tenth language pass over the post-beta.22 message strings:
**Ukrainian (Українська)** — second Cyrillic-script language.

### Added

  - **Ukrainian translations** for the complete set of message
    strings: the upload-confirm dialog, drag-and-drop overlay, focus
    warning, open-link prompt, scrollback bar, disconnect confirm,
    language-picker tooltip, and the shared OK/Cancel dialog buttons.

  - Verified by en/uk key diff: Ukrainian now has all 94 base keys
    (was 61), zero missing. Cyrillic confirmed intact through the
    build. Count strings use the label-style phrasing ("Файли:
    {count}") for the same plural-grammar reason as Polish. (Best-
    effort, native review welcome — corrections are catalog-only.)

### Changed

  - The i18n fallback test was repointed from Ukrainian (now
    complete) to Finnish (still partial).

### Tests

1289 → 1291. Ukrainian popup/message + interpolation tests; fallback
test repointed.

### Bundle

~746 → ~748 KB raw / ~161 KB gzipped.

## [2.0.0-beta.35] — 2026-05-23

Ninth language pass over the post-beta.22 message strings:
**Polish (Polski)**.

### Added

  - **Polish translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons.

  - Verified by en/pl key diff: Polish now has all 94 base keys
    (was 61), zero missing. Polish diacritics confirmed intact
    through the build. (Best-effort, native review welcome —
    corrections are catalog-only.)

  - Note on plurals: Polish has complex plural grammar (1 / 2–4 /
    5+ forms) that a single `{count}` template can't select. The
    count strings are phrased label-style ("Pliki: {count}",
    "Wyślij pliki: {count}") so they read correctly for any number;
    a native reviewer may prefer full plural handling, which would
    be a code change beyond catalog scope.

### Changed

  - The i18n fallback test was repointed from Polish (now complete)
    to Ukrainian (still partial).

### Tests

1287 → 1289. Polish popup/message + interpolation tests; fallback
test repointed.

### Bundle

~743 → ~746 KB raw / ~161 KB gzipped.

## [2.0.0-beta.34] — 2026-05-23

Eighth language pass over the post-beta.22 message strings:
**Swedish (Svenska)**.

### Added

  - **Swedish translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons.

  - Verified by en/sv key diff: Swedish now has all 94 base keys
    (was 61), zero missing. (Best-effort, native review welcome —
    corrections are catalog-only.)

### Changed

  - The i18n fallback test was repointed from Swedish (now complete)
    to Polish (still partial).

### Tests

1285 → 1287. Swedish popup/message + interpolation tests; fallback
test repointed.

### Bundle

~741 → ~743 KB raw / ~160 KB gzipped.

## [2.0.0-beta.33] — 2026-05-23

Seventh language pass over the post-beta.22 message strings:
**Russian (Русский)** — the first Cyrillic-script language in this
batch.

### Added

  - **Russian translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons.

  - Verified by en/ru key diff: Russian now has all 94 base keys
    (was 61), zero missing. Cyrillic confirmed intact through the
    build (no mojibake / replacement characters). (Best-effort,
    native review welcome — corrections are catalog-only.)

### Changed

  - The i18n fallback test was repointed from Russian (now complete)
    to Swedish (still partial), keeping the English-fallback path
    genuinely exercised.

### Tests

1283 → 1285. Russian popup/message + interpolation tests; fallback
test repointed.

### Bundle

~739 → ~741 KB raw / ~160 KB gzipped.

## [2.0.0-beta.32] — 2026-05-23

Sixth language pass over the post-beta.22 message strings:
**Italian (Italiano)**.

### Added

  - **Italian translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons. Informal
    "tu" register, matching the existing Italian.

  - Verified by en/it key diff: Italian now has all 94 base keys
    (was 61), zero missing. (Best-effort, native review welcome —
    corrections are catalog-only.)

### Changed

  - The i18n fallback test was repointed from Italian (now complete)
    to Russian (still partial), so it keeps genuinely exercising the
    English-fallback path. Its guard fired exactly as designed when
    Italian was completed, prompting the repoint.

### Tests

1281 → 1283. Italian popup/message + interpolation tests; fallback
test repointed.

### Bundle

~737 → ~739 KB raw / ~159 KB gzipped.

## [2.0.0-beta.31] — 2026-05-23

Fifth language pass over the post-beta.22 message strings:
**Portuguese (Português, pt-BR)**.

### Added

  - **Portuguese translations** for the complete set of message
    strings: the upload-confirm dialog, drag-and-drop overlay, focus
    warning, open-link prompt, scrollback bar, disconnect confirm,
    language-picker tooltip, and the shared OK/Cancel dialog buttons.
    Brazilian Portuguese (pt-BR), matching the existing catalog
    ("arquivos", "Configurações", "mouse", etc.).

  - Verified by en/pt key diff: Portuguese now has all 94 base keys
    (was 61), zero missing. (Best-effort, native review welcome —
    corrections are catalog-only.)

### Tests

1279 → 1281. Portuguese popup/message + interpolation tests.

### Bundle

~732 → ~737 KB raw / ~159 KB gzipped.

## [2.0.0-beta.30] — 2026-05-23

Fourth language pass over the post-beta.22 message strings:
**Spanish (Español)**.

### Added

  - **Spanish translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons. Formal
    "usted" register, matching the existing Spanish.

  - Verified by en/es key diff: Spanish has all 94 base keys, zero
    missing. (Best-effort, native review welcome — corrections are
    catalog-only.)

### Tests

1277 → 1279. Spanish popup/message + interpolation tests.

### Bundle

~732 KB raw / ~158 KB gzipped (unchanged — catalog-only).

## [2.0.0-beta.29] — 2026-05-23

Third language pass over the post-beta.22 message strings:
**French (Français)**.

### Added

  - **French translations** for the complete set of message strings:
    the upload-confirm dialog, drag-and-drop overlay, focus warning,
    open-link prompt, scrollback bar, disconnect confirm, language-
    picker tooltip, and the shared OK/Cancel dialog buttons. Formal
    "vous" register, matching the existing French.

  - Verified by en/fr key diff: French now has all 94 base keys
    (was 61), zero missing. (Best-effort, native review welcome —
    corrections are catalog-only.)

### Tests

1275 → 1277. French popup/message + interpolation tests.

### Bundle

~730 → ~732 KB raw / ~158 KB gzipped.

## [2.0.0-beta.28] — 2026-05-23

Second language pass over the post-beta.22 message strings:
**German (Deutsch)**.

### Added

  - **German translations** for the complete set of message strings
    the per-language passes cover: the upload-confirm dialog (header,
    labels, buttons, file-count/"Send N files" interpolations, the
    upload warning), the drag-and-drop overlay, the focus warning,
    the open-link prompt, the scrollback bar, the disconnect confirm,
    the language-picker tooltip, and the shared OK/Cancel dialog
    buttons. Formal "Sie" register, matching the existing German.

  - Coverage was verified by diffing the English and German key sets:
    German now has all 94 base keys (was 61), zero missing. (Best-
    effort translation, native review welcome — corrections are
    catalog-only.)

### Changed

  - The i18n fallback test was repointed from German (now a complete
    catalog) to Italian (still partial), so it keeps genuinely
    exercising the English-fallback path, with a guard that fails
    loudly if Italian is ever completed too.

### Tests

1273 → 1275. German popup/message + interpolation tests; fallback
test repointed.

### Bundle

~728 → ~730 KB raw / ~158 KB gzipped.

## [2.0.0-beta.27] — 2026-05-23

The **OK / Cancel buttons** in the themed dialogs were still hardcoded
English, even when the rest of the dialog (title, body) was
translated. Now they're catalog-driven too.

> Note: this package folds in the beta.26 changes as well (disconnect
> confirm + language-picker tooltip), so it brings the repo fully
> current to beta.27 whether or not beta.26 was already applied.

### Fixed

  - **FConfirmDialog** (the disconnect + open-link prompts) had
    `okLabel = 'OK'` / `cancelLabel = 'Cancel'` hardcoded as English
    defaults — so a Dutch disconnect dialog still showed English
    buttons. The labels now default to empty and fall back to the
    translated `dialog.button.ok` / `dialog.button.cancel` for the
    dialog's `language`. An explicitly-set label still overrides
    (used nowhere yet, but kept for flexibility).

  - **FInfoDialog** (the copy + download dialogs) had a hardcoded
    "OK" button; now translated the same way.

  - Both dialogs gained a `language` property; the client sets it
    (alongside the theme) each time it shows a dialog.

### Added

  - Shared `dialog.button.ok` / `dialog.button.cancel` keys, with
    Dutch ("OK" / "Annuleren"). Added to the master i18n list below.

### i18n coverage — master list (updated)

**Translatable:** main menu, status bar, settings panel (incl. the
language-picker "coming soon" tooltip), upload-confirm dialog,
drag-and-drop overlay, focus warning, open-link prompt, scrollback
bar, copy/download info dialogs, disconnect confirm, **and the shared
OK/Cancel/OK dialog buttons**. This is the full set a per-language
pass must cover.

**Intentionally English:** file-transfer progress panel (retro ASCII
layout), developer/sysop error alerts, user manual (deferred).

**Languages:** English (base) + Dutch (complete). The other 13 still
need the post-beta.22 message strings.

### Tests

1271 → 1273. FConfirmDialog test for the translated default buttons
(Dutch "Annuleren"); i18n test for the shared button keys.

### Bundle

~727 → ~728 KB raw / ~157 KB gzipped.

## [2.0.0-beta.26] — 2026-05-23

Catches the disconnect confirmation (still English) and the language-
picker "coming soon" tooltip, and adds their Dutch. Also records a
master i18n coverage list (below) so future language passes have a
single source of truth.

### Fixed

  - **The disconnect confirmation** ("Are you sure you want to
    disconnect?") was passing hardcoded English to the themed confirm
    dialog. It was built in beta.22, before the beta.23 i18n sweep,
    and — like the download dialog in beta.25 — it's a call-site
    string rather than component text, so it slipped the inventory.
    Now routed through `t()` (new `disconnect.confirm.*` keys).

  - **The language picker's "Coming soon — translation help welcome"
    tooltip** (shown on not-yet-translated language options) now
    comes from the catalog (`settings.language.comingSoon`).

### Added

  - Dutch for the two new keys ("Verbinding verbreken" / "Weet u
    zeker dat u de verbinding wilt verbreken?", and "Binnenkort
    beschikbaar — hulp bij vertaling welkom").

### i18n coverage — master list (as of beta.26)

**Translatable (wired through the catalog):** main menu, status bar,
settings panel, upload-confirm dialog, drag-and-drop overlay, focus
warning, open-link prompt, scrollback bar, copy/download info
dialogs, disconnect confirm, language-picker tooltip. These are the
complete set a per-language pass needs to cover.

**Intentionally English (by decision, not oversight):**
  - File-transfer progress panel (FTransferProgress) — fixed-width
    box-drawing ASCII layout; a retro visual element.
  - Developer/sysop error alerts (invalid container id, font-load
    failures, RIP debug) — for embedders; plain searchable English
    is more useful than a translation.
  - The user manual (FUserManual) — deferred by choice.

**Languages:** English (base) + Dutch (complete). The other 13
(German, French, Spanish, Portuguese, Italian, Russian, Swedish,
Polish, Ukrainian, Finnish, Greek, Czech, Japanese) have the older
menu/status/settings strings but not yet the newer message strings
(upload/drop/focus/url/scrollback/dialog/disconnect) — those are the
per-language passes still to come.

### Tests

1270 → 1271. Dutch test extended to cover the disconnect + coming-
soon strings.

### Bundle

~726 → ~727 KB raw / ~157 KB gzipped.

## [2.0.0-beta.25] — 2026-05-23

Cleans up the last two end-user messages that were still showing in
English, and adds their Dutch translations.

### Fixed

  - **The "Downloading Files" and "Copying Text" info dialogs** were
    passing hardcoded English literals to `showInfoDialog`, even
    though translated `dialog.download.*` / `dialog.copy.*` catalog
    keys have existed since beta.6 (and were already translated to
    Dutch). The two call sites now route through `t()`, so these
    dialogs finally honor the selected language.

### Added / Changed

  - **Scrollback bar (FScrollbackBar)** now pulls its text from the
    catalog: the "SCROLLBACK:" label, the modern-mode exit hint, and
    the five action links (Line Up / Line Down / Page Up / Page Down
    / Exit). New `scrollback.*` keys added to the English base and
    wired through `t()`; the client sets/propagates its language like
    the other components.

  - **Dutch** translations for the new `scrollback.*` keys
    ("TERUGSCROLLEN:", "Regel omhoog/omlaag", "Pagina omhoog/omlaag",
    "Afsluiten", and the modern hint). The download/copy dialog Dutch
    already existed; it just wasn't being used until the fix above.

### Tests

1266 → 1270. Scrollback i18n tests (English label/links/hint via
t(), settable language property) and a Dutch test covering the new
scrollback strings plus the now-wired download/copy dialog titles.

### Bundle

~725 → ~726 KB raw / ~157 KB gzipped.

## [2.0.0-beta.24] — 2026-05-23

First language pass over the new end-user message strings: **Dutch**.

### Added

  - **Dutch (Nederlands) translations** for the popup/overlay/warning
    strings that beta.23 wired into the catalog — the upload
    confirmation dialog (header, labels, buttons, the "Send N files"
    and file-count interpolations, the upload-prompt warning), the
    drag-and-drop overlay ("Sleep bestand hierheen" / "om te uploaden
    via {protocol}"), the focus warning banner, and the themed
    open-link prompt. Selecting Nederlands now shows these in Dutch
    instead of falling back to English.

  - This is a catalog-only change (`nl.ts`). It's the first of the
    per-language passes filling in the beta.23 foundation; the other
    languages follow one at a time. (Best-effort translation, native
    review welcome — corrections are catalog-only.)

### Tests

1264 → 1266. Two new tests verifying the Dutch popup/message
strings resolve through `t()` and that the `{count}`/`{protocol}`/
`{url}` interpolations produce correct Dutch output.

### Bundle

~724 → ~725 KB raw / ~157 KB gzipped.

## [2.0.0-beta.23] — 2026-05-23

i18n foundation for the remaining end-user messages. This release is
**language-independent plumbing** — it extracts the previously
hardcoded-English popup/overlay/warning strings into the translation
catalog and wires the components through `t()`/`tf()`, and themes the
last unthemed end-user `confirm()`. All fifteen languages keep
working unchanged via the English fallback; the actual translations
land per-language in the releases that follow (Dutch first).

### Added / Changed

  - **Upload confirmation dialog (FUploadConfirm)** now pulls its
    text from the catalog: the header (single + batch), the field
    labels (File/Size/Modified/Protocol/Files/Total size), the
    file-count and "Unknown" values, the show/hide-details toggle,
    the upload-prompt warning, and the Cancel/Send buttons
    (including the interpolated "Send N files").

  - **Drag-and-drop overlay (FDropOverlay)** now translates its
    "Drop file here" title and "to upload via {protocol}" subtitle.

  - **Focus warning (FFocusWarning)** — the "CLICK HERE TO ENABLE
    KEYBOARD INPUT" banner — now comes from the catalog.

  - **Open-link confirmation** — clicking a URL in the terminal used
    the browser's native `confirm()` (unthemed, untranslatable, and
    a layering wart in Crt). It's now a themed dialog: Crt emits a
    new `onopenurl` event with the URL, and the client shows the
    themed `<f-confirm-dialog>` (added in beta.22) with translated
    text before opening the link. Crt no longer touches UI chrome.

  - New catalog keys (`upload.*`, `drop.*`, `focus.*`,
    `url.confirm.*`) added to the English base. Every other catalog
    is partial and falls back to English until translated.

### Not included

  - The file-transfer progress panel (FTransferProgress) is left in
    English by design. It's a fixed-width box-drawing ASCII panel
    whose terse labels are padded to exact columns — as much a retro
    visual element as text — so it's out of scope for catalog
    translation.

  - Developer/sysop error alerts (invalid container id, font-load
    failures, etc.) remain native/English by design — they're for
    whoever embeds fTelnet, where a plain searchable English error
    is more useful than a translation.

### Tests

1255 → 1264. New i18n tests for FFocusWarning, FDropOverlay, and
FUploadConfirm (English text via t(), settable language property,
interpolated batch count), plus two Crt tests for the new
`onopenurl` event (fires with the URL on a link click; does not fire
on a non-URL word).

### Bundle

~720 → ~724 KB raw / ~157 KB gzipped.

## [2.0.0-beta.22] — 2026-05-23

### Changed

  - **Copy selection now persists on screen after you release the
    mouse.** Previously, drag-selecting text to copy would un-
    highlight the moment you let go of the mouse button, so you
    couldn't verify what you'd actually selected. Now the highlight
    stays visible after the copy — matching normal desktop text-
    selection behavior — so you can confirm you grabbed what you
    intended. The selection clears on your next click (or naturally,
    when incoming BBS output overwrites those cells). The copy itself
    still happens on release, exactly as before; only the visual
    persistence changed. This applies whether the drag is released
    over the canvas or off it.

  - **The disconnect confirmation is now a themed dialog.** The
    "Are you sure you want to disconnect?" prompt previously used the
    browser's native `confirm()`, which can't be themed and has no
    title bar — it looked like raw OS chrome bolted onto the UI. It's
    now a proper fTelnet dialog (`<f-confirm-dialog>`) with a themed
    background and a real "Disconnect" title bar, matching the rest
    of the chrome across all six themes. It reuses the existing
    InfoDialog styling and adds a Cancel button; OK/Enter confirms,
    Cancel/Escape/click-outside dismisses. (This is the yes/no
    companion to the informational `<f-info-dialog>` added in
    beta.4, which solved the same problem for `alert()`.)

### Fixed

  - The clipboard write on copy is now handled gracefully if it
    fails. `handleDragSelectionCopy` calls the async Clipboard API;
    on an insecure (non-HTTPS) context or denied permission that
    call rejects, and the rejection was previously unhandled (a
    console error in the browser, and an "unhandled rejection" notice
    in the test run). It's now caught and logged, matching the paste
    path's behavior — copy degrades gracefully and the on-screen
    selection still persists regardless.

### Tests

1233 → 1255. Five new Crt tests covering the selection-persistence
behavior: the highlight remains after mouseup, clears on the next
mousedown, a single click leaves no highlight, an off-canvas release
still persists (and then clears), and starting a new drag clears the
previous selection first. (The clipboard fix above also clears the
three unhandled-rejection notices these tests would otherwise produce
in a no-clipboard test environment.) Plus a new FConfirmDialog test
file (17 tests) covering the themed disconnect dialog: rendering, the
two buttons, custom labels, and every result path (OK/Enter →
confirm, Cancel/Escape/click-outside → cancel) including the
open-guard.

### Bundle

~710 → ~720 KB raw / ~156 KB gzipped.

## [2.0.0-beta.21] — 2026-05-23

Japanese (日本語) joins the language list — the fifteenth language
and fTelnet-Modern's **first CJK language**. This is the first
language whose script the chrome's normal fonts can't render, so it
ships with a (small, subset) Japanese webfont.

### Added

  - **Japanese translation.** A new `ja.ts` catalog (kanji, hiragana,
    katakana) covering the main menu, status bar (with
    `{host}`/`{proxy}` interpolation), screen-size dropdown, and
    Settings panel labels. Japanese is now selectable in the Settings
    language picker, completing the third language column (now full
    at five: Ukrainian, Finnish, Greek, Czech, Japanese).
    (Best-effort translation, **native review strongly recommended**
    before relying on it — corrections are catalog-only.)

  - **Subset Noto Sans JP webfont.** The chrome's normal fonts
    (Courier New, Georgia) have no CJK glyphs, so a Noto Sans JP face
    is added — SUBSET to only the ~190 characters the Japanese
    catalog uses, so it's only ~18 KB. It's defined via `@font-face`
    in `public/ftelnet.css` and appended as a trailing fallback on
    the chrome containers, so the browser uses it only for Japanese
    codepoints; all other languages are visually unchanged. The font
    file lives at `public/fonts/noto-sans-jp-subset.woff2` and is
    copied into the build output. (Noto is OFL-licensed.)

  - A `settings.language.japanese` endonym key was added to every
    catalog (the picker label "日本語" comes from the `LANGUAGES`
    registry's endonym field).

### Important notes

  - **The terminal canvas is unaffected.** It still renders the retro
    CP437/PETSCII/Topaz bitmap fonts. The Japanese setting translates
    the client's own chrome (menus, settings, status), NOT the
    content of the BBS you connect to — that's inherent to a retro
    terminal. The User Manual now states this.

  - **If you edit `ja.ts`**, the subset font must be regenerated to
    include any new characters, or new glyphs will fall back to a
    system font.

  - **Deployment:** the `noto-sans-jp-subset.woff2` font (under
    `fonts/`) must ship alongside `ftelnet.css`, the same way the
    keyboard assets do.

### Tests

1229 → 1233. Japanese lookup, interpolation, and picker-dispatch
tests; a test asserting the Japanese radio sits directly below
Czech; language-count assertions fourteen → fifteen; the
column-chunking test updated for the now-full 5/5/5 split.

### Bundle

~706 → ~710 KB raw / ~155 KB gzipped (plus the ~18 KB font asset).

## [2.0.0-beta.20] — 2026-05-23

Czech (Čeština) joins the language list — the fourteenth language,
rounding out the Central/Eastern European coverage alongside Polish,
Russian, and Ukrainian.

### Added

  - **Czech translation.** A new `cs.ts` catalog (Latin with
    háček/čárka diacritics) covering the main menu, status bar (with
    `{host}`/`{proxy}` interpolation), screen-size dropdown, and
    Settings panel labels. Czech is now selectable in the Settings
    language picker, appearing in the third language column after
    Greek. The ISO 639-1 code `cs` is used (not the country code
    "cz"). (Best-effort translation, native review pending;
    corrections are catalog-only.)

  - A `settings.language.czech` endonym key was added to every
    catalog (the picker label "Čeština" comes from the `LANGUAGES`
    registry's endonym field).

  - As with the other languages, this was a catalog-plus-registry
    change — the new `cs.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically; no layout or CSS change. The User Manual's
    language list was updated to mention Czech.

### Tests

1225 → 1229. Czech lookup, interpolation, and picker-dispatch tests;
a test asserting the Czech radio sits directly below Greek;
language-count assertions thirteen → fourteen; the column-chunking
test updated for the 5/5/4 split.

### Bundle

~702 → ~706 KB raw / ~154 KB gzipped.

## [2.0.0-beta.19] — 2026-05-23

Greek (Ελληνικά) joins the language list — the thirteenth language
and fTelnet-Modern's **third script** (after Latin and Cyrillic).

### Added

  - **Greek translation.** A new `el.ts` catalog (Greek alphabet,
    with monotonic accents) covering the main menu, status bar (with
    `{host}`/`{proxy}` interpolation), screen-size dropdown, and
    Settings panel labels. Greek is now selectable in the Settings
    language picker, appearing in the third language column after
    Finnish. The ISO 639-1 code `el` is used (not the country code
    "gr"). (Best-effort translation, native review pending;
    corrections are catalog-only.)

  - A `settings.language.greek` endonym key was added to every
    catalog (the picker label "Ελληνικά" comes from the `LANGUAGES`
    registry's endonym field).

  - As with the other languages, this was a catalog-plus-registry
    change — the new `el.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically; no layout or CSS change. The User Manual's
    language list was updated to mention Greek.

### Notes on the third script

  - Greek sits in the 2-byte UTF-8 range (like Cyrillic) and is
    covered by essentially all system fonts, so no font pack was
    needed. UTF-8 verified end to end: the Greek (with accents)
    round-trips intact through source → build → production bundle,
    and all three scripts (Latin, Cyrillic, Greek) coexist cleanly.

### Tests

1221 → 1225. Greek lookup, interpolation, and picker-dispatch tests;
a test asserting the Greek radio sits directly below Finnish;
language-count assertions twelve → thirteen; the column-chunking
test updated for the 5/5/3 split.

### Bundle

~698 → ~702 KB raw / ~153 KB gzipped.

## [2.0.0-beta.18] — 2026-05-23

Finnish (Suomi) joins the language list — the twelfth language.
Finland is a Nordic demoscene and BBS heartland (Assembly, the
sce.org culture), reaching a concentrated pocket of fTelnet's
natural audience and pairing naturally with the Swedish catalog.

### Added

  - **Finnish translation.** A new `fi.ts` catalog covering the main
    menu, status bar (with `{host}`/`{proxy}` interpolation),
    screen-size dropdown, and Settings panel labels. Finnish is now
    selectable in the Settings language picker, appearing in the
    third language column after Ukrainian (the third column now
    holds two: Ukrainian, Finnish). (Best-effort translation, native
    review pending; corrections are catalog-only.)

  - A `settings.language.finnish` endonym key was added to every
    catalog (the picker label "Suomi" comes from the `LANGUAGES`
    registry's endonym field).

  - As with the other languages, this was a catalog-plus-registry
    change — the new `fi.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically; no layout or CSS change. The User Manual's
    language list was updated to mention Finnish.

### Fixed

  - The User Manual's Language section no longer references the
    grayed-out "Other" placeholder slots, which were removed from
    the picker in beta.17.

### Tests

1217 → 1221. Finnish lookup, interpolation, and picker-dispatch
tests; a test asserting the Finnish radio sits directly below
Ukrainian; language-count assertions eleven → twelve; the
column-chunking test updated for the 5/5/2 split.

### Bundle

~695 → ~698 KB raw / ~152 KB gzipped.

## [2.0.0-beta.17] — 2026-05-23

Two changes: the status-bar **Connect button is hidden on first
load** (to push users toward the Menu), and **Ukrainian (Українська)**
joins as the eleventh language.

### Changed

  - **Connect button hidden in the initial idle state.** Long-time
    users reflexively clicked the status-bar "Connect" button and
    never discovered the menu (Settings, Language, and now Connect
    itself live there). The button no longer appears on first load —
    the only status-bar control is **Menu**, so both new and
    returning users go through it. The button still **reappears** as
    "Reconnect" after a disconnect and "Retry Connection" after a
    failed attempt, so the convenient one-click reconnect path is
    preserved for users who were already connected. Implemented by
    defaulting `FStatusBar.connectButtonVisible` to `false`; the
    client's disconnect/error handlers still set it visible.

### Added

  - **Ukrainian translation.** A new `uk.ts` catalog (Cyrillic)
    covering the main menu, status bar (with `{host}`/`{proxy}`
    interpolation), screen-size dropdown, and Settings panel labels.
    Ukrainian is the second Cyrillic-script language but a distinct
    alphabet (і/ї/є/ґ), translated independently — not a Russian
    transliteration. Selectable in the Settings picker after Polish.
    (Best-effort translation, native review pending; corrections are
    catalog-only.)

  - A `settings.language.ukrainian` endonym key was added to every
    catalog (the picker label "Українська" comes from the
    `LANGUAGES` registry's endonym field).

  - **First three-language-column picker, evenly spaced.** At
    eleven languages the 5-per-column chunking now produces a third
    language column (5 + 5 + 1 = English…Portuguese / Dutch…Polish /
    Ukrainian). The three "Other" / "coming soon" placeholder radios
    were **removed** — with eleven real languages they were just
    clutter — and the three language columns are now spread evenly
    across the full width of the Language box. (Chunking is still
    automatic; no per-language layout edits.)

### Tests

1212 → 1217. Ukrainian lookup, interpolation, and picker-dispatch
tests; a test asserting the Ukrainian radio sits directly below
Polish; language-count assertions ten → eleven; the column-chunking
test updated for the 5/5/1 split across three columns (and a test
confirming the "Other" placeholders are gone / no disabled radios
remain); and FStatusBar default-visibility tests updated for the
hidden-by-default button.

### Bundle

~691 → ~695 KB raw / ~151 KB gzipped.

## [2.0.0-beta.16] — 2026-05-23

Polish (Polski) joins the language list — the tenth language. Poland
had a large FidoNet/BBS scene and retains an active retro-computing
community, reaching another pocket of fTelnet's natural audience.

### Added

  - **Polish translation.** A new `pl.ts` catalog covering the main
    menu, status bar (with `{host}`/`{proxy}` interpolation),
    screen-size dropdown, and Settings panel labels. Polish is now
    selectable in the Settings language picker, completing the
    second language column (which is now full at five: Dutch,
    Italian, Russian, Swedish, Polish). (Best-effort translation,
    native review pending; corrections are catalog-only.)

  - A `settings.language.polish` endonym key was added to every
    catalog (the picker label "Polski" comes from the `LANGUAGES`
    registry's endonym field).

  - As with the other languages, this was a catalog-plus-registry
    change — the new `pl.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically; no layout or CSS change. The User Manual's
    language list was updated to mention Polish. (At ten languages,
    the two language columns are now both full at five; an eleventh
    language would automatically start a third language column.)

### Tests

1208 → 1212. Polish lookup, interpolation, and picker-dispatch
tests; a test asserting the Polish radio sits directly below
Swedish; language-count assertions nine → ten; the column-chunking
test updated for the 5 + 5 split.

### Bundle

~687 → ~691 KB raw / ~150 KB gzipped.

## [2.0.0-beta.15] — 2026-05-23

Swedish (Svenska) joins the language list — the ninth language.
Sweden has a strong demoscene heritage and an active retro-computing
community, reaching another pocket of fTelnet's natural audience.

### Added

  - **Swedish translation.** A new `sv.ts` catalog covering the main
    menu, status bar (with `{host}`/`{proxy}` interpolation),
    screen-size dropdown, and Settings panel labels. Swedish is now
    selectable in the Settings language picker, appearing in the
    second language column after Russian. (Best-effort translation,
    native review pending; corrections are catalog-only.)

  - A `settings.language.swedish` endonym key was added to every
    catalog (the picker label "Svenska" comes from the `LANGUAGES`
    registry's endonym field).

  - As with the other languages, this was a catalog-plus-registry
    change — the new `sv.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically; no layout or CSS change. The User Manual's
    language list was updated to mention Swedish.

### Tests

1204 → 1208. Swedish lookup, interpolation, and picker-dispatch
tests; a test asserting the Swedish radio sits directly below
Russian; language-count assertions eight → nine; the column-chunking
test updated for the 5 + 4 split.

### Bundle

~684 → ~687 KB raw / ~150 KB gzipped.

## [2.0.0-beta.14] — 2026-05-23

Russian (Русский) joins the language list — the eighth language and
fTelnet-Modern's **first non-Latin script**. Beyond reaching the
large historical Russian BBS/FidoNet community, this validates that
the i18n system handles non-Latin text cleanly end to end.

### Added

  - **Russian translation.** A new `ru.ts` catalog (Cyrillic)
    covering the main menu, status bar (with `{host}`/`{proxy}`
    interpolation — the hostname stays Latin/neutral), screen-size
    dropdown, and Settings panel labels. Russian is now selectable
    in the Settings language picker, appearing in the second
    language column after Italian. (Best-effort translation, native
    review pending; corrections are catalog-only.)

  - The picker now shows its first non-Latin endonym, "Русский".

  - As with the other languages, this was a catalog-plus-registry
    change — the new `ru.ts`, its registration in `index.ts`, and
    the `settings.language.russian` endonym key in every catalog. No
    component, client, or CSS changes; the picker renders the new
    radio automatically. The User Manual's language list was updated.

### Notes on the first non-Latin script

  - **UTF-8 end to end verified.** The Cyrillic strings round-trip
    intact through source → build → production bundle; the lookup
    and interpolation machinery is plain-string and script-agnostic,
    so no special handling was required.

  - **Theme fonts.** The six themes use various fonts; where a
    theme's font lacks Cyrillic glyphs, the browser substitutes a
    fallback font for those characters. This is purely visual and
    works correctly — worth an eyeball per theme.

  - **Keyboard** remains English by design (keymaps/IME are out of
    scope), unchanged by this release.

### Tests

1199 → 1204. Russian lookup, a dedicated Cyrillic round-trip test,
interpolation, picker-dispatch, and Russian-below-Italian ordering;
language-count assertions seven → eight; the column-chunking test
updated for the 5 + 3 split.

### Bundle

~680 → ~684 KB raw / ~149 KB gzipped.

## [2.0.0-beta.13] — 2026-05-23

Italian (Italiano) joins the language list — the seventh language.
Italy has a notably active vintage-computing scene (especially
Commodore/Amiga), which dovetails with fTelnet's PETSCII/Topaz
rendering support.

### Added

  - **Italian translation.** A new `it.ts` catalog covering the main
    menu, status bar (with `{host}`/`{proxy}` interpolation),
    screen-size dropdown, and Settings panel labels. Italian is now
    selectable in the Settings language picker, appearing at the end
    of the functional-languages column (directly below Dutch).
    (Best-effort translation, native review pending; corrections are
    catalog-only.)

  - A `settings.language.italian` endonym key was added to every
    catalog for consistency (the picker label itself comes from the
    `LANGUAGES` registry's endonym field, "Italiano").

  - As with the other languages, this was a catalog-plus-registry
    change — the new `it.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically from the registry; no layout code changed. The
    User Manual's language list was updated to mention Italian.

### Changed

  - **Language picker layout — columns now cap at 5.** The Settings
    Language fieldset previously listed all functional languages in
    a single tall column beside the "Other" placeholders. With
    seven languages that column was getting long, so the functional
    languages now flow into columns of at most five (English →
    Portuguese in the first, Dutch/Italian in a second), with the
    three "Other" placeholders as a third, dedicated column. The
    inter-column spacing was tightened so all three fit inside the
    box. This is automatic: future languages extend or add columns
    with no further layout edits.

### Tests

1192 → 1199. Italian lookup, interpolation, and picker-dispatch
tests; a test asserting the Italian radio sits directly below
Dutch; language-count assertions six → seven; and new
language-picker layout tests (column count, 5-per-column chunking,
the dedicated Other column).

### Bundle

~676 → ~680 KB raw / ~148 KB gzipped.

## [2.0.0-beta.12] — 2026-05-23

Dutch (Nederlands) joins the language list — the sixth language.
The Netherlands had an enormous 1990s BBS/FidoNet scene and retains
an unusually active retro-computing community, so Dutch reaches a
concentrated pocket of fTelnet's natural audience.

### Added

  - **Dutch translation.** A new `nl.ts` catalog covering the main
    menu, status bar (with `{host}`/`{proxy}` interpolation),
    screen-size dropdown, and Settings panel labels. Dutch is now
    selectable in the Settings language picker, appearing at the end
    of the functional-languages column (directly below Portuguese).
    (Best-effort translation, native review pending; corrections are
    catalog-only.)

  - A `settings.language.dutch` endonym key was added to every
    catalog for consistency (the picker label itself comes from the
    `LANGUAGES` registry's endonym field, "Nederlands").

  - As with the other languages, this was a catalog-plus-registry
    change — the new `nl.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically from the registry; no layout code changed. The
    User Manual's language list was updated to mention Dutch.

### Tests

1188 → 1192. Dutch lookup, interpolation, and picker-dispatch
tests; a test asserting the Dutch radio sits directly below
Portuguese; language-count assertions five → six.

### Bundle

~673 → ~676 KB raw / ~147 KB gzipped.

## [2.0.0-beta.11] — 2026-05-22

Portuguese (Português) joins the language list — the fifth language,
and likely the one reaching the most real BBS users, given Brazil's
active retro-BBS scene.

### Added

  - **Portuguese translation.** A new `pt.ts` catalog covering the
    main menu, status bar (with `{host}`/`{proxy}` interpolation),
    screen-size dropdown, and Settings panel labels. Portuguese is
    now selectable in the Settings language picker, appearing
    directly below Spanish in the left sub-column. (Best-effort
    translation leaning toward forms common to both Brazilian and
    European Portuguese; native review pending. The system supports
    splitting into distinct pt-BR / pt-PT codes later if wanted.)

  - A new `settings.language.portuguese` endonym key was added to
    every catalog (the picker shows "Português" in all languages).

  - As with the other languages, this was a catalog-plus-registry
    change — the new `pt.ts`, its registration in `index.ts`, and
    the endonym key. The Settings picker renders the new radio
    automatically from the registry; no layout code changed. The
    User Manual's language list was updated to mention Portuguese.

### Tests

1184 → 1188. Portuguese lookup, interpolation, and picker-dispatch
tests; a test asserting the Portuguese radio sits directly below
Spanish; language-count assertions updated four → five.

### Bundle

~669 → ~673 KB raw / ~146 KB gzipped.

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
