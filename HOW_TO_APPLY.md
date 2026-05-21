# 2.0.0-beta.3 release — apply and tag

Feature release: in-app user manual. New "Manual" button on the
main menu (split from the Settings cell) opens a floating popup
with the complete user guide. Written for all experience levels.

Same workflow as beta.1 and beta.2: apply files, build, commit
via GitHub Desktop, create release on github.com.

## Step 1 — Apply the file changes

Copy these files from this package into your local repo. Folder
structure mirrors the repo layout.

**New file (added):**
  - `src/components/FUserManual.ts` (NEW — the manual component)
  - `tests/components/FUserManual.test.ts` (NEW — 15 tests)

**Modified files:**
  - `src/components/FMenuPopup.ts` (Settings/Manual split)
  - `src/components/index.ts` (exports new component + type)
  - `src/components/FSettingsPanel.ts` (VERSION bump only)
  - `src/ftelnetclient/fTelnetClient.ts` (OpenUserManual, wiring)
  - `public/ftelnet.css` (manual popup styles)
  - `tests/components/FMenuPopup.test.ts` (Settings + Manual tests)
  - `package.json` (version → 2.0.0-beta.3)
  - `package-lock.json` (synced)
  - `CHANGELOG.md` (beta.3 entry prepended)
  - `README.md` (Manual feature, test count, bundle size)

The `dist/` folder in this package contains pre-built bundles for
upload to the GitHub release in Step 4. Those don't get committed
(your `.gitignore` already excludes `dist/`).

## Step 2 — Verify locally

```powershell
cd C:\path\to\fTelnet-Modern
npm install              # syncs node_modules with the new lock
npm run typecheck        # clean
npm test                 # 1099 passing across 53 files
npm run build:all        # produces all four flavors in dist/
```

Open `Settings → About` in a dev build — version line should read
**fTelnet-Modern v2.0.0-beta.3**.

Click **Manual** on the main menu — the user manual popup should
appear, centered, with a draggable title bar and scrollable body.
Try dragging it around, resizing the corner, scrolling through
the content, and clicking TOC anchors at the top.

## Step 3 — Commit and push via GitHub Desktop

1. Open the GitHub Desktop app. It should auto-detect all 11
   changed files (10 modified + 1 new) plus the 1 new test file.

2. Verify all checkboxes are checked.

3. At the bottom-left, fill in:
   - **Summary**: `Release 2.0.0-beta.3 — User Manual`
   - **Description** (optional):
     ```
     - Add FUserManual component: floating popup with the
       complete user guide. Draggable, resizable, theme-aware.
     - Menu: split Settings cell into Settings + Manual.
     - Bump version: 2.0.0-beta.2 → 2.0.0-beta.3
     - Tests: 1082 → 1099 (17 new in FUserManual.test.ts)
     - Bundle: 619 → 640 KB raw / 134 → 140 KB gzipped
     ```

4. Click the blue **Commit to main** button.

5. After committing, click **Push origin** at the top.

## Step 4 — Create the GitHub release

1. Open browser to
   **https://github.com/comicslut-png/fTelnet-Modern/releases**

2. Click the **Draft a new release** button (top right)

3. **Choose a tag** dropdown: click it, type `v2.0.0-beta.3`,
   click **"Create new tag: v2.0.0-beta.3 on publish"**

4. **Target**: leave as `main`

5. **Release title**:
   ```
   2.0.0-beta.3 — in-app User Manual
   ```

6. **Describe this release** (paste the markdown below):

```markdown
## 2.0.0-beta.3 — in-app User Manual

A friendly addition for everyone, especially first-time BBS
users: a complete user manual now lives right inside the app.

### Added

**User Manual popup.** A new "Manual" button on the main menu
opens a floating, draggable, resizable popup with the complete
user guide. Written for users of all experience levels — from
teenagers who've never seen a BBS to seasoned sysops who just
want a reference.

The manual covers:

- Every menu button and what it does
- How file transfers work (ZMODEM and YMODEM, with the multi-file
  batch upload note we learned about the hard way)
- BBS display styles — ANSI, PETSCII (Commodore), ATASCII (Atari),
  Topaz (Amiga) — so users understand why some BBSes look
  different and what to ask their sysop about
- Common tips and troubleshooting

Larger font (14px body / 18px headings) for readability. Theme-
aware, so it matches whichever of the six themes you've picked.

**Menu layout: Settings + Manual.** The previous full-width
"Settings..." cell is now two adjacent buttons: "Settings" on
the left, "Manual" on the right. Both always visible — the
Manual is one click away for new users.

### Behavior

- The manual stays open across menu/settings interactions during
  a session, but closes automatically on disconnect.
- Next open re-centers fresh in case the user dragged it
  off-screen and then disconnected.
- Switching themes mid-session updates the manual's appearance
  live.

### Tests

1082 → 1099. Seventeen new tests in `FUserManual.test.ts` cover
default state, visibility, first-open centering, position-reset
behavior, close button + event dispatch, TOC anchor handling,
and multi-instance independence.

### Bundle

619 → 640 KB raw / 134 → 140 KB gzipped. About 21 KB added for
the manual content (hardcoded in the component) plus the
component code itself.

### Download

Pre-built bundles are attached. Pick the flavor that matches
your needs:

| File | Includes |
|------|----------|
| `ftelnet.norip.noxfer.js` | ANSI/BBS only |
| `ftelnet.norip.xfer.js` | + YMODEM + ZMODEM |
| `ftelnet.rip.noxfer.js` | + RIPscrip graphics |
| `ftelnet.rip.xfer.js` | Everything |

See [the 2.0.0-beta.1 release notes](https://github.com/comicslut-png/fTelnet-Modern/releases/tag/v2.0.0-beta.1)
and [2.0.0-beta.2 release notes](https://github.com/comicslut-png/fTelnet-Modern/releases/tag/v2.0.0-beta.2)
for the full feature list.
```

7. Scroll down to the **"Attach binaries by dropping them here or
   selecting them"** area. Drag these four files from this
   package's `dist/` folder onto the drop zone:
     - `ftelnet.norip.noxfer.js`
     - `ftelnet.norip.xfer.js`
     - `ftelnet.rip.noxfer.js`
     - `ftelnet.rip.xfer.js`

8. ✅ Check **"Set as a pre-release"**

9. ❌ Leave **"Set as the latest release"** UNCHECKED

10. Click the green **Publish release** button at the bottom.

The page redirects to:
**https://github.com/comicslut-png/fTelnet-Modern/releases/tag/v2.0.0-beta.3**

## Smoke test after publishing

  1. Load a dev build. Open the main menu.
  2. Confirm "Settings" and "Manual" appear as two adjacent
     half-width buttons.
  3. Click **Manual**. Popup appears centered.
  4. Verify the title bar reads "fTelnet User Manual" and there's
     a close (✕) on the right.
  5. Scroll the body — content should flow smoothly with readable
     14px text.
  6. Click each TOC anchor at the top — the body should scroll to
     the matching section.
  7. Drag the title bar — the popup should follow the cursor.
  8. Grab the bottom-right corner — the popup should resize
     (min 400×300).
  9. Switch themes via Settings (with the Manual still open).
     The Manual should update its appearance live to match.
 10. Connect to a BBS. Disconnect. Confirm the Manual auto-closes
     on disconnect. Reopen — should re-center fresh.

## Followup candidates for beta.4

  - **RIP toggle** (the "fifth build" we discussed). User-
    selectable ANSI/RIP at launch. Highest-priority item.
  - **YMODEM throttle investigation** (Rick's hint).
  - **Large-file save lag fix**.
  - Other Phase 5 polish items.
