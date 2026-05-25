/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) 2009-2026 Rick Parrish, R&M Software

  fTelnet-Modern: modernized fork
  Copyright (C) 2026 Tom Swartz <dangerbaybbs@hotmail.com>

  This file is part of fTelnet-Modern.

  fTelnet-Modern is free software: you can redistribute it and/or
  modify it under the terms of the GNU Affero General Public License
  as published by the Free Software Foundation, either version 3 of
  the License, or any later version.

  fTelnet-Modern is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public
  License along with fTelnet-Modern.  If not, see
  <http://www.gnu.org/licenses/>.

  SPDX-License-Identifier: AGPL-3.0-or-later
*/

import {
  ClipboardHelper,
  DetectMobileBrowser,
  GetScrollbarWidth,
  StringUtils,
  TypedEvent,
  type IEvent,
} from '../common/index.js';
import {
  RLoginConnection,
  TelnetConnection,
  WebSocketConnection,
} from '../connections/index.js';
import { Ansi, Crt, KeyboardKeys, KeyPressEvent } from '../crt/index.js';
import { RIP } from '../graph/index.js';
import { saveAs } from 'file-saver';
import {
  FileRecord,
  YModemReceive,
  YModemSend,
  ZmDebug,
  ZModemDetector,
  ZModemReceive,
  ZModemSend,
  type ZModemFileInfo,
  type ZModemFileToSend,
} from '../filetransfer/index.js';
// Force component registration as a side effect even if all named
// imports below get tree-shaken (they would: the named imports are
// only used as type annotations, which TypeScript erases at compile
// time, so the bundler sees no runtime use). Without this bare
// import the @customElement registrations never run in production
// builds and <f-focus-warning> tags render as empty inline elements.
import '../components/index.js';
import {
  FFocusWarning,
  FDropOverlay,
  FInfoDialog,
  FConfirmDialog,
  FReconnectDialog,
  FMenuPopup,
  FScrollbackBar,
  FSettingsPanel,
  FStatusBar,
  FTransferProgress,
  FUploadConfirm,
  FUserManual,
  FVirtualKeyboard,
  type DropFileSelectedDetail,
  type MenuActionDetail,
  type MenuClickDetail,
  type ScreenSizeChangeDetail,
  type SettingsMuteChangeDetail,
  type SettingsLocalEchoChangeDetail,
  type SettingsAutoReconnectChangeDetail,
  type SettingsThemeChangeDetail,
  type SettingsVibrateChangeDetail,
  type SettingsZModemAutoDetectChangeDetail,
  type SettingsDefaultProtocolChangeDetail,
  type SettingsLanguageChangeDetail,
  type UploadConfirmDetail,
  type VKKeyEventDetail,
} from '../components/index.js';
import { fTelnetOptions } from './fTelnetOptions.js';
import { TransferStats } from '../filetransfer/TransferStats.js';
import { isAvailable, t, tf, type Language } from '../i18n/index.js';

/**
 * Top-level fTelnet client.
 *
 * This is the glue file: builds the entire UI (focus warning bar,
 * scrollback bar, status bar, menu, virtual keyboard), wires the
 * Crt to the Ansi parser to the connection to the RIP parser to
 * YModem, handles ANSI-escape responses (cursor reports, screen
 * size changes, RIP detection), drives the per-tick poll loop,
 * and exposes a tiny public API for the host page to call
 * (`Connect`, `Disconnect`, `Upload`, `Download`, etc.).
 *
 * Phase 1 migration notes:
 *
 *   - The constructor builds ~270 lines of DOM. It's all linear:
 *     create element, set class/innerHTML/style, append. Migrated
 *     as-is.
 *
 *   - Real bug in original FIXED during Phase 2 component
 *     refactor: the lines `if (this._ScrollbackBar.style.display = 'none')`
 *     in `EnterScrollback`/`ExitScrollback` used a single `=`
 *     (assignment), not `===` (comparison). The assignment
 *     expression evaluated to the assigned string (`'none'` /
 *     `'block'`), always truthy, so the if-body always ran. In
 *     the original the effect was harmless (the operations are
 *     idempotent), so Phase 1 preserved the bug. In Phase 2 the
 *     scrollback bar became a Lit component with a `.visible`
 *     boolean property — porting the literal characters of the
 *     bug would have produced `if (this._ScrollbackBar.visible = false)`,
 *     always-falsy, never-execute, which is a real regression.
 *     Fixed at the time of the refactor to use the obviously-
 *     intended `if (!this._ScrollbackBar.visible)` etc. Same
 *     observable behavior as the original buggy code.
 *
 *   - `LoadProxySettings` migrated from synchronous-style XHR to
 *     async fetch, matching the pattern used elsewhere
 *     (connections/, graph-1, RIP icon loading). The
 *     `_LoadingProxySettings` retry counter still works the same:
 *     `Connect()` polls it via `setTimeout` and the fetch
 *     completion clears it.
 *
 *   - `delete this._Connection` and `delete this._Timer` from
 *     strict-mode unfriendly to `this._Connection = undefined`
 *     and `clearInterval(); this._Timer = undefined;`. The fields
 *     are typed `T | undefined` accordingly.
 *
 *   - `OnMenuButtonClick(null)` was a call site passing null where
 *     MouseEvent was declared. Phase 1 fixed this by widening the
 *     parameter type to `MouseEvent | null`. Phase 2 Stage 4
 *     widened it further to `{ pageX, pageY } | null` since the
 *     <f-status-bar> component dispatches a MenuClickDetail
 *     object rather than the raw MouseEvent. Phase 2 Stage 5
 *     narrowed back to non-null `{ pageX, pageY }` once the
 *     <f-menu-popup> component took over: the screen-size-change
 *     handler now closes the popup directly via `.open = false`,
 *     so the null branch no longer has callers.
 *
 *   - `!window.cordova` guards dropped. Cordova support was already
 *     removed from DetectMobileBrowser in an earlier delta, so the
 *     guards always evaluate to true (or rather, the bodies
 *     always execute). Stripped to keep the code linear.
 *
 *   - `_Keys`, `_Rows`, dialog elements, etc. all properly typed.
 *     `delete this._Timer` etc. patterns updated. catch-clause
 *     bindings now `unknown` instead of inferred any.
 *
 *   - The huge base64-encoded splash screen blobs are preserved
 *     verbatim. They decode (via atob) to ANSI/RIP/Atari/C64
 *     "Welcome to fTelnet" screens — long strings that would be
 *     pointless to break across lines.
 *
 *   - alert() use: the two user-facing informational messages
 *     (ClipboardCopy's drag-to-select hint and Download's ZMODEM
 *     explanation) now use the themed <f-info-dialog> component
 *     (Phase 5 beta.4). A few rare error-path alert()s remain in
 *     the constructor and font loaders — those fire in failure
 *     cases (and sometimes before the theme system is ready), so
 *     a plain browser alert is acceptable there.
 *
 *   - `// TODOX return false` and `// TODOX return true` comments
 *     preserved — they're remnants from when this was a `Boolean
 *     Init()` method that became a constructor. The TODOX prefix
 *     means "would-have-returned but constructor can't return".
 */
export class fTelnetClient {
  // ───── Public events ─────
  public ondata: IEvent<[string]> = new TypedEvent<[string]>();

  // ───── Private state ─────
  private _Ansi!: Ansi;
  private _ClientContainer!: HTMLDivElement;
  private _Connection: WebSocketConnection | undefined;
  private _Crt!: Crt;
  private _DataTimer: ReturnType<typeof setTimeout> | undefined;
  private _FocusWarningBar!: FFocusWarning;
  private _fTelnetContainer!: HTMLElement;
  private _HasFocus = true;
  private _InitMessageBar!: HTMLDivElement;
  private _LastTimer = 0;
  /**
   * Retry counter used by Connect() to wait for an in-flight
   * proxy-settings fetch. Set to 10 when the fetch starts; Connect
   * polls every 100ms via setTimeout, decrementing each time.
   * Cleared back to 0 by the fetch's success/error handlers.
   */
  private _LoadingProxySettings = 0;
  private _MenuButtons!: FMenuPopup;
  private _RIP!: RIP;
  private _ScrollbackBar!: FScrollbackBar;
  private _SettingsPanel!: FSettingsPanel;
  /**
   * Phase 5: drag-and-drop overlay shown when the user is dragging
   * a file over the page. Stays in the DOM forever; its `visible`
   * property gates whether anything renders. Owns the document-level
   * drag listeners; dispatches `drop-file-selected` on drop.
   */
  private _DropOverlay!: FDropOverlay;
  /**
   * Phase 5: upload confirmation dialog. Shown after a file is
   * selected (via drop OR menu picker) and before any bytes go to
   * the wire. Dispatches `upload-confirm` (Send clicked) or
   * `upload-cancel`. The current pending file is held on the
   * component's `file` property.
   */
  private _UploadConfirm!: FUploadConfirm;
  /**
   * Phase 5 (beta.4): themed informational dialog — a replacement
   * for browser alert() on user-facing info messages. Created
   * lazily on first use, then stays in the DOM with its `open`
   * property gating visibility.
   */
  private _InfoDialog?: FInfoDialog;
  /**
   * Phase 5 (beta.22): themed yes/no confirm dialog, replacing the
   * unthemed native confirm() (e.g. the disconnect prompt). Created
   * lazily on first use; lives on document.body like the other
   * floating popups. See showConfirmDialog().
   */
  private _ConfirmDialog?: FConfirmDialog;
  /**
   * Phase 5 (beta.41): themed auto-reconnect countdown popup, shown
   * after an UNEXPECTED disconnect (never a user-initiated one).
   * Created lazily on first use; lives on document.body. See
   * showReconnectDialog().
   */
  private _ReconnectDialog?: FReconnectDialog;
  /**
   * True while a disconnect is user-initiated (via Disconnect() ->
   * performDisconnect()). OnConnectionClose() reads it to decide
   * whether the close was expected (no auto-reconnect) or an
   * unexpected drop (show the reconnect countdown). Reset each time
   * it's consumed. Auto-reconnect is otherwise always on; a retry
   * cap can be layered on later via a counter without touching this.
   */
  private _userInitiatedDisconnect = false;
  /**
   * Count of consecutive auto-reconnect attempts since the last
   * successful connection. Incremented each time the countdown popup
   * is shown; once it reaches MAX_RECONNECT_ATTEMPTS the popup stops
   * appearing (we give up). Reset to 0 in OnConnectionConnect on a
   * successful connect, so a later unrelated drop gets a fresh budget.
   */
  private _reconnectAttempt = 0;
  /** Hard cap on consecutive auto-reconnect attempts. */
  private static readonly MAX_RECONNECT_ATTEMPTS = 3;
  /**
   * Phase 5 (beta.3): user manual popup. Created lazily on first
   * open. Stays in the DOM after that; its `open` property gates
   * visibility. Resets position state on disconnect so the next
   * open re-centers (in case the user dragged it off-screen).
   */
  private _UserManual?: FUserManual;
  /**
   * The status-bar component. Phase 2 collapsed what used to be
   * four separate fields (`_StatusBar`, `_StatusBarLabel`,
   * `_ConnectButton`, `_MenuButton`) into this single component
   * reference. Reactive properties on the component handle what
   * used to be `.innerHTML = ...` / `.style.display = ...` /
   * `.style.backgroundColor = ...` assignments.
   */
  private _StatusBar!: FStatusBar;
  private _Timer: ReturnType<typeof setInterval> | undefined;
  private _UploadInput!: HTMLInputElement;
  private _UseModernScrollback = false;
  private _VirtualKeyboard!: FVirtualKeyboard;
  private _YModemReceive!: YModemReceive;

  /**
   * ZMODEM auto-detect state, Phase 4 Stage 6.
   *
   * `_ZModemDetector` watches the incoming byte stream for the
   * auto-trigger sequence and is always present (lazily created on
   * first connect). Bytes flow through it; non-ZMODEM bytes pass
   * to the ANSI parser as normal terminal output.
   *
   * `_ZModemReceive` is the active receive state machine, created
   * when the detector fires and torn down when the session ends.
   * Non-null only during a ZMODEM transfer.
   *
   * `_ZModemFileBuffers` accumulates each in-progress file's bytes.
   * Indexed by filename. Cleared per-file as ZEOF arrives and the
   * file is handed to FileSaver.
   */
  private _ZModemDetector: ZModemDetector | undefined;
  private _ZModemReceive: ZModemReceive | undefined;
  /**
   * Per-file byte buffers, keyed by filename. Phase 5 polish:
   * stores `Uint8Array[]` (array of subpacket chunks) instead of
   * the previous `number[]` (single growing flat array of byte
   * values).
   *
   * Why: ZModemReceive's `onFileData` callback delivers chunks
   * as `Uint8Array` already. The old code copied each chunk
   * byte-by-byte into a `number[]` via per-byte `Array.push`,
   * then on completion did `new Uint8Array(numberArray)` —
   * another per-element conversion-copy. For multi-MB files
   * that's millions of per-byte operations on the main thread,
   * producing a multi-second UI freeze between "100%" on the
   * progress panel and the browser save dialog appearing.
   *
   * The new approach: push each Uint8Array chunk directly into
   * the array (one push per subpacket — typically ~1024 bytes
   * each, so ~1000 pushes for a 1 MB file rather than 1,000,000).
   * On completion, `new Blob(chunks)` accepts an array of
   * Uint8Array directly — no concat step needed. The Blob
   * constructor handles the multi-chunk case natively in C++
   * inside the browser, not in JavaScript.
   *
   * Expected impact: the visible freeze on multi-MB transfers
   * collapses from several seconds to sub-100ms.
   */
  private readonly _ZModemFileBuffers = new Map<string, Uint8Array[]>();
  private _ZModemCurrentFile: ZModemFileInfo | undefined;

  /**
   * Phase 5 — outbound ZMODEM session (uploads). When non-undefined,
   * a send is in progress: inbound bytes from the wire (which are
   * the receiver's ACK/NAK/header responses) get routed to
   * `_ZModemSend.feedBytes()` instead of to the terminal renderer
   * or the auto-detector. `endZModemSend()` clears this back to
   * undefined.
   */
  private _ZModemSend: ZModemSend | undefined;

  /**
   * Phase 4 Stage 7 — file-transfer progress panel.
   *
   * `_TransferProgressPanel` is the Lit component that renders the
   * SyncTERM-style retro overlay. It's appended to the container
   * once during construction and stays in the DOM forever; the
   * `visible` property gates whether anything renders.
   *
   * `_TransferStats` is the pure stats engine fed by ZModemReceive's
   * onProgress callback. Recreated per transfer session.
   *
   * `_TransferStatsTimer` drives the rendering clock — 10 Hz updates
   * so the CPS / ETA / elapsed-time fields don't appear frozen
   * between subpacket arrivals. Set on session start, cleared on
   * session end (or linger-done).
   */
  private _TransferProgressPanel!: FTransferProgress;
  private _TransferStats: TransferStats | undefined;
  private _TransferStatsTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * Phase 4 Stage 7 (final) — short fixed post-abort drop window.
   *
   * History of why this is here:
   *
   *   The "no cooldown" approach inspired by zmodem.js/xterm.js
   *   integrations leaked a handful of binary file-content bytes
   *   into the ANSI parser after abort. Real-world log from a
   *   user test showed 3-4 lines of `unexpected post-ESC char`
   *   with raw binary buffer content (high-bit characters) hitting
   *   the parser immediately after the abort fired.
   *
   *   That happens because our detector resets the moment we abort,
   *   so trailing in-flight ZMODEM file bytes have nowhere to go
   *   but the ANSI passthrough. zmodem.js's architecture avoids
   *   this differently (the Sentry keeps watching the stream); our
   *   architecture needs a brief window where post-abort bytes get
   *   discarded.
   *
   *   1.5 seconds is short enough to NOT interfere with normal BBS
   *   interaction (the user sees a brief pause but the BBS prompt
   *   appears quickly afterward) and long enough to catch the
   *   typical in-flight ZMODEM buffer drain.
   *
   *   For very large files where the in-flight buffer is bigger
   *   than 1.5s of draining, some bytes may still leak through.
   *   The ANSI parser handles them gracefully (drops them in
   *   recovery mode); a few may render as CP437 glyphs on the
   *   canvas before the BBS prompt arrives. This is an acceptable
   *   tradeoff — the alternative (longer drop) would suppress
   *   legitimate BBS output if the post-abort BBS prompt arrives
   *   within the drop window.
   */
  private _PostAbortDropUntil = 0;
  private static readonly POST_ABORT_DROP_MS = 1_500;

  /**
   * Base64-encoded CP437/ANSI splash screen for fTelnet-Modern.
   * Hand-crafted ANSI block-art designed by Tom Swartz for this
   * fork. 4458 bytes raw, ~22 rows × 75 cols, uses CP437 box
   * drawing and shaded blocks for the "fTelnet" and "Modern" big
   * letters, followed by a tagline and the GitHub URL.
   *
   * Used by the default ANSI splash path and the RIP path
   * (RIPscrip is an ANSI superset so the same blob works). The
   * Atari and C64 paths use entirely different character sets and
   * still render their original 2009-era splashes; redesigning
   * those is future work.
   *
   * Sysops can still override per-instance via
   * `Options.SplashScreen` (base64-encoded ANSI of their own).
   */
  private static readonly SPLASH_ANSI_DEFAULT =
    'G1swbQ0KICAgICAgG1sxbdrExMTExMTEvxtbMG0gG1sxbdrExMTExMTEvxtbMG0gG1sxbdrExMTExMTEvxtbMG0gG1sxbdrExMS/G1swbSAgICAgG1sxbdrExMTExMTEvxtbMG0gG1sxbdrExMTExMTEvxtbMG0gG1sxbdrExMTExMTEvxtbMG0NCiAgICAgG1szMW3NG1sxOzM3bbMbWzMwbfkbWzBtICDVzRtbMW24G1szMG35G1swbbMbWzMxbc0bWzM3bdTNG1sxbbgbWzMwbfkbWzBtIBtbMTszMG35G1swbdXNvhtbMzFtzRtbMTszN22zG1szMG35G1swbSAg1c0bWzFtuBtbMzBt+RtbMG2zG1szMW3NG1sxOzM3bbMbWzMwbfkbWzBtICCzG1szMW3Nzc3NzRtbMTszN22zG1szMG35G1swbSAg1c0bWzFtuBtbMzBt+RtbMzdtsxtbMDszMW3NG1sxOzM3bbMbWzMwbfkbWzBtICDVzRtbMW24G1szMG35G1swbbMbWzMxbc0bWzM3bdTNG1sxbbgbWzMwbfkbWzBtIBtbMTszMG35G1swbdXNvg0KICAgICAbWzQ0bSAbWzE7NDBtsxtbMG0gICDAG1sxbb/AxBtbMG3ZG1sxOzM0OzQ0bbCwsRtbMzc7NDBtsxtbMG0gICCzG1sxOzM0bbEbWzQ0bbAbWzA7NDRtIBtbMTs0MG2zG1swbSAgIMAbWzFtv8DEG1swbdkbWzE7MzQ7NDRtsBtbMzc7NDBtsxtbMG0gICCzG1sxOzM0OzQ0bdsbWzQwbbKyshtbMDs0NG0gG1sxOzQwbbMbWzBtICAgsxtbMTszNG2yG1szN22zG1swbSCzG1s0NG0gG1sxOzQwbbMbWzBtICAgwBtbMW2/wMQbWzBt2RtbMTszNDs0NG2wsLEbWzM3OzQwbbMbWzBtICAgsxtbMTszNG2xG1s0NG2wG1swbQ0KICAgICAbWzE7MzQ7NDRtsBtbMzc7NDBtsxtbMG0gICDa2RtbMTszNG2wsbIbWzQ0bbCwsRtbMzc7NDBtsxtbMG0gICCzG1sxOzM0OzQ0bbGwsBtbMzc7NDBtsxtbMG0gICDa2RtbMW3axL8bWzM0OzQ0bbEbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2yG1szNzs0MG3axL8bWzM0OzQ0bbAbWzM3OzQwbbMbWzBtICAgsxtbMTszNG2xG1szN22zG1swbSCzG1sxOzM0OzQ0bbAbWzM3OzQwbbMbWzBtICAg2tkbWzFt2sS/G1szNDs0NG2wsLEbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2xsBtbMG0NCiAgICAgG1sxOzM0OzQ0bbEbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2wsLGysLCxG1szNzs0MG2zG1swbSAgILMbWzE7MzQ7NDRtsbCxG1szNzs0MG2zG1swbSAgILMbWzE7MzQ7NDRtsBtbMzc7NDBtsxtbMG0gsxtbMTszNDs0NG2yG1szNzs0MG2zG1swbSAgIMAbWzFtxNkbWzBtILMbWzE7MzQ7NDRtsRtbMzc7NDBtsxtbMG0gICCzG1sxOzM0OzQ0bbAbWzM3OzQwbbMbWzBtILMbWzE7MzQ7NDRtsRtbMzc7NDBtsxtbMG0gICCzG1sxOzM0OzQ0bbAbWzM3OzQwbbMbWzBtILMbWzE7MzQ7NDRtsLCxG1szNzs0MG2zG1swbSAgILMbWzE7MzQ7NDRtsbAbWzBtDQogICAgIBtbMzFtzRtbMTszN22zG1szMG35G1swbSAgsxtbMzFtzc3Nzc3NzRtbMTszN22zG1szMG35G1swbSAbWzE7MzBt+RtbMG2zG1szMW3Nzc0bWzE7MzdtsxtbMzBt+RtbMG0gINTNG1sxbb4bWzMwbfkbWzBtsxtbMzFtzRtbMTszN22zG1szMG35G1swbSAgICAgG1sxOzMwbfkbWzBtsxtbMzFtzRtbMTszN22zG1szMG35G1swbSAgsxtbMzFtzRtbMTszN22zG1szMG35G1swbbMbWzMxbc0bWzE7MzdtsxtbMzBt+RtbMG0gINTNG1sxbb4bWzMwbfkbWzBtsxtbMzFtzc3NG1sxOzM3bbMbWzMwbfkbWzBtIBtbMTszMG35G1swbbMbWzMxbc3NG1szN20NCiAgICAgIBtbMW3UG1swbc3Nzb4gICAgICAgG1sxbdQbWzBtzc3NviAgIBtbMW3UG1swbc3Nzc3Nzc2+IBtbMW3UG1swbc3Nzc3Nzc2+IBtbMW3UG1swbc3Nzb4gG1sxbdQbWzBtzb4gG1sxbdQbWzBtzc3Nzc3Nzb4gICAbWzFt1BtbMG3Nzc2+ICANCg0KICAgICAgICAgICAbWzFt2sTExMTExMS/G1swbSAbWzFt2sTExMTExMS/G1swbSAbWzFt2sTExMTExL8bWzBtICAbWzFt2sTExMTExMS/G1swbSAbWzFt2sTExMTExMS/G1swbSAbWzFt2sTExMTExMS/G1swbSANCiAgICAgICAgICAbWzMxbc0bWzE7MzdtsxtbMzBt+RtbMG0g1RtbMW241bgbWzMwbfkbWzM3bbMbWzA7MzFtzRtbMTszN22zG1szMG35G1swbSAg1c0bWzFtuBtbMzBt+RtbMG2zG1szMW3NG1sxOzM3bbMbWzMwbfkbWzBtICDVzRtbMW24wL8bWzA7MzFtzRtbMTszN22zG1szMG35G1swbSAg1c0bWzFtuBtbMzBt+RtbMG2zG1szMW3NG1sxOzM3bbMbWzMwbfkbWzBtICDVzRtbMW24G1szMG35G1swbbMbWzMxbc0bWzE7MzdtsxtbMzBt+RtbMG0gINXNG1sxbbgbWzMwbfkbWzM3bbMbWzA7MzFtzRtbMzdtDQogICAgICAgICAgG1s0NG0gG1sxOzQwbbMbWzBtICCzG1sxbdS+sxtbMG0gsxtbMTszNDs0NG2wG1szNzs0MG2zG1swbSAgILMbWzE7MzQ7NDRt2xtbMzc7NDBtsxtbMG0gsxtbNDRtIBtbMTs0MG2zG1swbSAgILMbWzE7MzQ7NDRt2xtbMzc7NDBtsxtbMG0gsxtbNDRtIBtbMTs0MG2zG1swbSAgIMAbWzFtv8DEG1swbdkbWzQ0bSAbWzE7NDBtsxtbMG0gICDAG1sxbcTZ2tkbWzM0OzQ0bbIbWzM3OzQwbbMbWzBtICAgsxtbMTszNG2yG1szN22zG1swbSCzG1sxOzM0OzQ0bbAbWzBtDQogICAgICAgICAgG1sxOzM0OzQ0bbAbWzM3OzQwbbMbWzBtICCzG1sxOzM0bbKxG1szN22zG1swbSCzG1sxOzM0OzQ0bbEbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2yG1szNzs0MG2zG1swbSCzG1sxOzM0OzQ0bbAbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2yG1szNzs0MG2zG1swbSCzG1sxOzM0OzQ0bbAbWzM3OzQwbbMbWzBtICAg2tkbWzFt2sS/G1szNDs0NG2wG1szNzs0MG2zG1swbSAgINXNuBtbMW3AvxtbMzQ7NDRt2xtbMzc7NDBtsxtbMG0gICCzG1sxOzM0bbEbWzM3bbMbWzBtILMbWzE7MzQ7NDRtsRtbMG0NCiAgICAgICAgICAbWzE7MzQ7NDRtsRtbMzc7NDBtsxtbMG0gILMbWzE7MzRtsRtbNDRtsBtbMzc7NDBtsxtbMG0gsxtbMTszNDs0NG2yG1szNzs0MG2zG1swbSAgIMAbWzFtxNkbWzBtILMbWzE7MzQ7NDRtsRtbMzc7NDBtsxtbMG0gICDAG1sxbcTZG1swbSCzG1sxOzM0OzQ0bbEbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2wG1szNzs0MG2zG1swbSCzG1sxOzM0OzQ0bbEbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2wG1szNzs0MG2zG1swbSCzG1sxOzM0OzQ0bbIbWzM3OzQwbbMbWzBtICAgsxtbMTszNDs0NG2wG1szNzs0MG2zG1swbSCzG1sxOzM0OzQ0bbIbWzBtDQogICAgICAgICAgG1szMW3NG1sxOzM3bbMbWzMwbfkbWzBtILMbWzMxbc3NG1sxOzM3bbMbWzMwbfkbWzBtsxtbMzFtzRtbMTszN22zG1szMG35G1swbSAgICAgG1sxOzMwbfkbWzBtsxtbMzFtzRtbMTszN22zG1szMG35G1swbSAgICAg2tkbWzMxbc0bWzE7MzdtsxtbMzBt+RtbMG0gINTNG1sxbb4bWzMwbfkbWzBtsxtbMzFtzRtbMTszN22zG1szMG35G1swbSAgsxtbMzFtzRtbMTszN22zG1szMG35G1swbbMbWzMxbc0bWzE7MzdtsxtbMzBt+RtbMG0gILMbWzMxbc0bWzE7MzdtsxtbMzBt+RtbMG2zG1szMW3NG1szN20NCiAgICAgICAgICAgG1sxbdQbWzBtzc2+ICAbWzFt1BtbMG3NviAbWzFt1BtbMG3Nzc3Nzc3NviAbWzFt1BtbMG3Nzc3Nzc2+ICAbWzFt1BtbMG3Nzc3Nzc3NviAbWzFt1BtbMG3Nzc2+IBtbMW3UG1swbc2+IBtbMW3UG1swbc3Nzb4gG1sxbdQbWzBtzb4gDQoNCiAgICAbWzE7MzBtxNzEG1swbSAgICAbWzE7MzBt3BtbMG0gG1szMW0gICAgIBtbMzdtIBtbMzFtIBtbMzdtIBtbMTszMG3cG1swOzMxbSAbWzM3bSAgICAgICAgG1sxOzMwbdzExNwbWzBtIBtbMTszMG3cG1swOzMxbSAgIBtbMzdtICAgICAgICAgG1sxOzMwbdwbWzBtICAgICAgICAgICAgG1sxOzMwbcTcxBtbMDszMW0gG1sxOzMwbdzExNwbWzBtIBtbMTszMG3cxMTcG1swbQ0KICAgIBtbMzFtINsg3MTcG1szN20gG1szMW3bG1szN20gG1szMW3cxNwbWzM3bSAbWzMxbdzE3BtbMzdtIBtbMzFt28QbWzM3bSAgG1sxOzMwbdwbWzA7MzFt3NwbWzE7MzBt3BtbMG0gIBtbMzFt28Tc3xtbMzdtIBtbMzFt2yAgIBtbMzdtIBtbMzFt3MTcG1szN20gG1szMW3cxNwbWzM3bSAbWzMxbdwbWzM3bSAbWzMxbdzE3BtbMzdtICAbWzE7MzBt3BtbMDszMW3c3BtbMTszMG3cG1swbSAgG1szMW0g2yDe3SAgIBtbMzdtIBtbMzFt28TE3xtbMzdtDQogICAgG1szMW0gG1sxbd8bWzA7MzFtIBtbMW3fxMQbWzBtIBtbMTszMW3fG1swbSAbWzE7MzFt3xtbMDszMW0gG1sxbd8bWzBtIBtbMTszMW3fxMQbWzBtIBtbMTszMW3fxBtbMG0gICAgICAgIBtbMTszMW3fG1swOzMxbSAgG1sxbd8bWzBtIBtbMTszMW3fxMTfG1swbSAbWzE7MzFt38TfG1swbSAbWzE7MzFt38TbG1swbSAbWzE7MzFt3xtbMG0gG1sxOzMxbd8bWzA7MzFtIBtbMW3fG1swbSAgICAgICAgG1szMW0gG1sxbd8bWzA7MzFtICAbWzFt38TE3xtbMG0gG1sxOzMxbd8bWzA7MzFtICAgG1szN20NCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIBtbMTszMW3AxN8bWzBtDQobWzE7MzVtICAgICAgICAgICAgICAgICAgICAgZ2l0aHViLmNvbS9jb21pY3NsdXQtcG5nL2ZUZWxuZXQtTW9kZXJuG1swbQ==';

  /** User-supplied configuration. Defaults are in fTelnetOptions. */
  private readonly _Options: fTelnetOptions;

  constructor(containerId: string, options: fTelnetOptions) {
    // TODOX (preserved from original): Canvas test (display error in div if missing support)
    // TODOX (preserved from original): WebSocket test (display error in Crt if missing support)
    // TODOX (preserved from original): Any other tests?

    if (typeof options === 'undefined') {
      const Message = 'fTelnet Error: The options parameter is required (pass in an fTelnetOptions object)';
      // eslint-disable-next-line no-alert
      alert(Message);
      throw new Error(Message);
    }

    this._Options = options;

    // Restore the user's preferred screen size if they set one
    // earlier in THIS browser-tab session. We use sessionStorage
    // (not localStorage) deliberately: the screen size should
    // survive reloads and disconnect/reconnect within the same
    // session — so a user who picks 132x37, connects, drops, and
    // reconnects keeps their size without re-choosing — but it
    // should NOT persist to a brand-new visitor. sessionStorage is
    // cleared when the tab is closed, so the next person who opens
    // the page fresh starts at the default 80x25 and makes their
    // own choice. (Public/shared BBS pages especially want this:
    // one visitor's size preference shouldn't stick the next
    // visitor with it.)
    //
    // Access is wrapped in try/catch because some browsers (or
    // privacy modes) disable web storage entirely.
    try {
      const storedColumns: string | null =
        window.sessionStorage.getItem('ScreenColumns');
      const storedRows: string | null =
        window.sessionStorage.getItem('ScreenRows');
      if (storedColumns !== null && storedRows !== null) {
        const intColumns: number = parseInt(storedColumns, 10);
        const intRows: number = parseInt(storedRows, 10);

        if (intColumns >= 80 && intColumns <= 132 && intRows >= 25 && intRows <= 60) {
          this._Options.ScreenColumns = intColumns;
          this._Options.ScreenRows = intRows;
        }
      }
    } catch {
      // Ignore — just means browser doesn't support sessionStorage.
    }

    // One-time migration: earlier versions stored screen size in
    // localStorage (persisted forever). We've moved to sessionStorage
    // (per-tab-session). Remove any stale localStorage entries so we
    // don't leave orphan keys behind that no longer do anything.
    try {
      window.localStorage.removeItem('ScreenColumns');
      window.localStorage.removeItem('ScreenRows');
    } catch {
      // Ignore — browser doesn't support localStorage.
    }

    // Restore the Settings panel's user choices (theme, mute,
    // vibrate, auto-detect, default protocol) for THIS browser-tab
    // session. As with screen size, we use sessionStorage rather
    // than localStorage: a user's choices survive reloads and
    // disconnect/reconnect within the session, but a fresh visitor
    // in a new tab gets the embed-time defaults rather than
    // inheriting whatever the previous person picked. This matters
    // for shared/public BBS pages where one visitor's preferences
    // shouldn't stick the next visitor. Each value overrides the
    // embed-time Options default only if the user made a choice
    // this session. Same try/catch (some browsers disable web
    // storage).
    try {
      const storedTheme = window.sessionStorage.getItem('fTelnet.theme');
      if (storedTheme !== null && storedTheme.length > 0) {
        this._Options.Theme = storedTheme;
      }

      const storedMute = window.sessionStorage.getItem('fTelnet.mute');
      if (storedMute !== null) {
        this._Options.MuteSounds = storedMute === 'true';
      }

      // Auto-reconnect preference (Settings → Terminal). Off unless the
      // user has turned it on this tab-session. Stored as 'true'/'false'.
      const storedAutoReconnect = window.sessionStorage.getItem(
        'fTelnet.autoReconnect',
      );
      if (storedAutoReconnect !== null) {
        this._Options.AutoReconnect = storedAutoReconnect === 'true';
      }

      const storedVibrate = window.sessionStorage.getItem('fTelnet.vibrate');
      if (storedVibrate !== null) {
        const n = parseInt(storedVibrate, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 100) {
          this._Options.VirtualKeyboardVibrateDuration = n;
        }
      }

      // The Auto-Detect checkbox under Settings → Protocol.
      // Stored value is the literal string 'true' or 'false'.
      const storedZModemAutoDetect = window.sessionStorage.getItem(
        'fTelnet.zmodemAutoDetect',
      );
      if (storedZModemAutoDetect !== null) {
        this._Options.ZModemAutoDetect = storedZModemAutoDetect === 'true';
      }

      // Which protocol the menu's Upload and Download buttons act
      // on. Stored as the literal string 'zmodem' or 'ymodem'.
      // Unknown values are ignored (default stays).
      const storedDefaultProtocol = window.sessionStorage.getItem(
        'fTelnet.defaultTransferProtocol',
      );
      if (
        storedDefaultProtocol === 'zmodem' ||
        storedDefaultProtocol === 'ymodem'
      ) {
        this._Options.DefaultTransferProtocol = storedDefaultProtocol;
      }

      // UI language. Only honor it if it's a functional language
      // (English or German today); placeholder codes like 'fr'/'es'
      // — or any junk — are ignored so we never select a
      // non-working language. isAvailable() is the gate.
      const storedLanguage = window.sessionStorage.getItem(
        'fTelnet.language',
      );
      if (storedLanguage !== null && isAvailable(storedLanguage)) {
        this._Options.Language = storedLanguage;
      }
    } catch {
      // Ignore — same as above.
    }

    // One-time migration: earlier versions stored these settings in
    // localStorage (persisted forever). We've moved to
    // sessionStorage (per-tab-session). Remove any stale
    // localStorage entries so we don't leave orphan keys that no
    // longer do anything.
    try {
      window.localStorage.removeItem('fTelnet.theme');
      window.localStorage.removeItem('fTelnet.mute');
      window.localStorage.removeItem('fTelnet.vibrate');
      window.localStorage.removeItem('fTelnet.zmodemAutoDetect');
      window.localStorage.removeItem('fTelnet.defaultTransferProtocol');
      window.localStorage.removeItem('fTelnet.language');
    } catch {
      // Ignore — browser doesn't support localStorage.
    }

    // Emulation-specific defaults that have to be applied before
    // we build the Crt (otherwise the wrong font/size loads).
    if (this._Options.Emulation === 'Atari') {
      // Atari needs ESC-replacing enter, specific font, 40 cols.
      this._Options.Enter = '\x9B';
      this._Options.Font = 'Atari-Graphics';
      this._Options.ScreenColumns = 40;
    } else if (this._Options.Emulation === 'C64') {
      // C64 forces font + 40 cols.
      // TODOX (preserved): should this also force 40 rows?
      this._Options.Font = 'C64-Lower';
      this._Options.ScreenColumns = 40;
    } else if (this._Options.Emulation === 'RIP') {
      // RIP forces its bitmap font + 43 rows.
      this._Options.Font = 'RIP_8x8';
      this._Options.ScreenRows = 43;
    } else if (this._Options.Emulation === '') {
      this._Options.Emulation = 'ansi-bbs';
    }

    // Kick off proxy-settings fetch (no-op if we're not using a proxy).
    this.LoadProxySettings();

    // Resolve and validate the host page's container element.
    if (typeof containerId === 'string') {
      const Container = document.getElementById(containerId);
      if (Container === null) {
        const Message = 'fTelnet Error: fTelnet constructor was passed an invalid container id';
        // eslint-disable-next-line no-alert
        alert(Message);
        throw new Error(Message);
      }
      this._fTelnetContainer = Container;
    } else {
      const Message = 'fTelnet Error: fTelnet constructor was passed an invalid container id';
      // eslint-disable-next-line no-alert
      alert(Message);
      throw new Error(Message);
    }

    // Apply the chosen theme as a data-attribute on the container.
    // The CSS in ftelnet.css keys off `[data-theme="..."]` to swap
    // colors, fonts, and bevel styles. The classic theme is the
    // default for backward compatibility; callers opt into the
    // dos-classic theme (or any future theme) via `Options.Theme`.
    this._fTelnetContainer.setAttribute('data-theme', this._Options.Theme);

    // Host page must include the fTelnet script tag with the
    // expected id — we use it to resolve relative asset paths.
    if (document.getElementById('fTelnetScript') === null) {
      const Message = 'fTelnet Error: Script element with id="fTelnetScript" was not found';
      // eslint-disable-next-line no-alert
      alert(Message);
      throw new Error(Message);
    }

    // Inject the client CSS link if the page didn't.
    if (document.getElementById('fTelnetCss') === null) {
      const link = document.createElement('link');
      link.id = 'fTelnetCss';
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = StringUtils.GetUrl('ftelnet.css');
      document.getElementsByTagName('head')[0]!.appendChild(link);
    }

    // Empty placeholder for the keyboard CSS — populated below
    // once we know which keyboard size to use.
    if (document.getElementById('fTelnetKeyboardCss') === null) {
      const link = document.createElement('link');
      link.id = 'fTelnetKeyboardCss';
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = '';
      document.getElementsByTagName('head')[0]!.appendChild(link);
    }

    // Init message — gets hidden once the Crt is ready.
    this._InitMessageBar = document.createElement('div');
    this._InitMessageBar.className = 'fTelnetInitMessage';
    this._InitMessageBar.innerHTML = 'Initializing fTelnet...';
    this._fTelnetContainer.appendChild(this._InitMessageBar);

    // Client container holds the crt canvas and (in RIP mode) the
    // graph canvas. Modern scrollback uses real DOM overflow; the
    // classic path uses click-driven scrollback buttons.
    this._ClientContainer = document.createElement('div');
    this._ClientContainer.className = 'fTelnetClientContainer';
    this._fTelnetContainer.appendChild(this._ClientContainer);

    this._UseModernScrollback =
      this._Options.AllowModernScrollback &&
      DetectMobileBrowser.SupportsModernScrollback &&
      this._Options.Emulation !== 'RIP';
    if (this._UseModernScrollback) {
      this._ClientContainer.style.overflowX = 'hidden';
      this._ClientContainer.style.overflowY = 'scroll';
      // Default font is 9x16 — these dimensions get refined once
      // the Crt knows the actual font metrics.
      this._ClientContainer.style.height = this._Options.ScreenRows * 16 + 'px';
      this._ClientContainer.style.width =
        this._Options.ScreenColumns * 9 + GetScrollbarWidth.Width + 'px';
      this._ClientContainer.scrollTop = this._ClientContainer.scrollHeight;
    } else {
      // Classic scrollback: explicit dimensions to keep the border
      // tight to the canvas.
      this._ClientContainer.style.height = this._Options.ScreenRows * 16 + 'px';
      this._ClientContainer.style.width = this._Options.ScreenColumns * 9 + 'px';
    }

    // The Crt instance. From this point on, this._Crt is non-null
    // (asserted by the definite-assignment marker on the field).
    this._Crt = new Crt(this._ClientContainer, this._UseModernScrollback);
    this._InitMessageBar.style.display = 'none';

    this._Crt.onfontchange.on((): void => {
      this.OnCrtScreenSizeChanged();
    });
    this._Crt.onkeypressed.on((): void => {
      this.OnCrtKeyPressed();
    });
    this._Crt.onmousereport.on((position: string): void => {
      this.OnCrtMouseReport(position);
    });
    this._Crt.onscreensizechange.on((): void => {
      this.OnCrtScreenSizeChanged();
    });
    this._Crt.onopenurl.on((url: string): void => {
      // Themed confirm before opening a clicked link in a new window.
      void this.showConfirmDialog(
        t('url.confirm.title', this._Options.Language as Language),
        tf('url.confirm.body', this._Options.Language as Language, { url }),
      ).then((confirmed: boolean): void => {
        if (confirmed) {
          window.open(url);
        }
      });
    });
    this._Crt.Atari = this._Options.Emulation === 'Atari';
    this._Crt.BareLFtoCRLF = this._Options.BareLFtoCRLF;
    this._Crt.C64 = this._Options.Emulation === 'C64';
    this._Crt.LocalEcho = this._Options.LocalEcho;
    this._Crt.Muted = this._Options.MuteSounds;
    this._Crt.SkipRedrawWhenSameFontSize = this._Options.SkipRedrawWhenSameFontSize;
    this._Crt.SetScreenSize(this._Options.ScreenColumns, this._Options.ScreenRows);
    this._Crt.SetFont(this._Options.Font);

    // Ansi parser sits between the connection and the Crt for
    // non-RIP emulations. The OnAnsi* callbacks handle ANSI
    // escape sequences that need a response back to the server
    // (cursor position reports, screen size queries, etc).
    this._Ansi = new Ansi(this._Crt);
    this._Ansi.onDECRQCRA.on((pid: number, x1: number, y1: number, x2: number, y2: number): void => {
      this.OnAnsiDECRQCRA(pid, x1, y1, x2, y2);
    });
    this._Ansi.onesc0c.on((): void => {
      this.OnAnsiESC0c();
    });
    this._Ansi.onesc5n.on((): void => {
      this.OnAnsiESC5n();
    });
    this._Ansi.onesc6n.on((): void => {
      this.OnAnsiESC6n();
    });
    this._Ansi.onesc8t.on((columns: number, rows: number): void => {
      this.OnAnsiESC8t(columns, rows);
    });
    this._Ansi.onesc255n.on((): void => {
      this.OnAnsiESC255n();
    });
    this._Ansi.onescQ.on((font: string): void => {
      this.OnAnsiESCQ(font);
    });
    this._Ansi.onripdetect.on((): void => {
      this.OnAnsiRIPDetect();
    });
    this._Ansi.onripdisable.on((): void => {
      this.OnAnsiRIPDisable();
    });
    this._Ansi.onripenable.on((): void => {
      this.OnAnsiRIPEnable();
    });
    this._Ansi.onXTSRGA.on((): void => {
      this.OnAnsiXTSRGA();
    });

    // RIP gets its own Graph + parser stack, layered on top of the Crt.
    if (this._Options.Emulation === 'RIP') {
      this._RIP = new RIP(this._Crt, this._Ansi, this._ClientContainer);
    }

    // WebSocket support check. The 'AppleWebKit/534.30' substring
    // is a heuristic for very old Safari/Android WebView versions
    // that had a broken WebSocket implementation — kept verbatim
    // from the original (those browsers shouldn't be encountered
    // anymore but the check is harmless).
    if (!('WebSocket' in window) || navigator.userAgent.match('AppleWebKit/534.30')) {
      this._Crt.WriteLn();
      this._Crt.WriteLn("Sorry, but your browser doesn't support the WebSocket protocol!");
      this._Crt.WriteLn();
      this._Crt.WriteLn('WebSockets are how fTelnet connects to the remote server, so without them that');
      this._Crt.WriteLn("means you won't be able to connect anywhere.");
      this._Crt.WriteLn();
      this._Crt.WriteLn("If you can, try upgrading your web browser.  If that's not an option (ie you're");
      this._Crt.WriteLn('already running the latest version your platform supports, like IE 8 on');
      this._Crt.WriteLn('Windows XP), then try switching to a different web browser.');
      this._Crt.WriteLn();
      this._Crt.WriteLn("Feel free to contact me (http://www.ftelnet.ca/contact/) if you think you're");
      this._Crt.WriteLn("seeing this message in error, and I'll look into it.  Be sure to let me know");
      this._Crt.WriteLn('what browser you use, as well as which version it is.');
      // eslint-disable-next-line no-console
      console.log('fTelnet Error: WebSocket not supported');
      // TODOX return false; (would-have-bailed in old Init() method)
    }

    // ── Focus warning bar ──
    // Lit component <f-focus-warning>. Same DOM contract as the
    // original (renders a div.fTelnetFocusWarning into light DOM
    // so the existing CSS applies unchanged). Visibility is set
    // imperatively via the .visible property — see OnTimer().
    this._FocusWarningBar = document.createElement('f-focus-warning') as FFocusWarning;
    this._FocusWarningBar.language = this._Options.Language as Language;
    this._fTelnetContainer.appendChild(this._FocusWarningBar);

    // ── Scrollback bar ──
    // Lit component <f-scrollback-bar>. Same DOM contract as the
    // original (renders a div.fTelnetScrollback into light DOM
    // so the existing CSS applies unchanged). The mode property
    // selects between classic (full button set) and modern (just
    // a hint message). The classic-mode button clicks dispatch
    // custom events that we handle below — each pushes a synthetic
    // key event onto the Crt's queue, same as the original.
    this._ScrollbackBar = document.createElement('f-scrollback-bar') as FScrollbackBar;
    this._ScrollbackBar.mode = this._UseModernScrollback ? 'modern' : 'classic';
    this._ScrollbackBar.language = this._Options.Language as Language;
    this._ScrollbackBar.addEventListener('scrollback-line-up', (): void => {
      this._Crt.PushKeyDown(KeyboardKeys.UP, KeyboardKeys.UP, false, false, false);
    });
    this._ScrollbackBar.addEventListener('scrollback-line-down', (): void => {
      this._Crt.PushKeyDown(KeyboardKeys.DOWN, KeyboardKeys.DOWN, false, false, false);
    });
    this._ScrollbackBar.addEventListener('scrollback-page-up', (): void => {
      this._Crt.PushKeyDown(KeyboardKeys.PAGE_UP, KeyboardKeys.PAGE_UP, false, false, false);
    });
    this._ScrollbackBar.addEventListener('scrollback-page-down', (): void => {
      this._Crt.PushKeyDown(KeyboardKeys.PAGE_DOWN, KeyboardKeys.PAGE_DOWN, false, false, false);
    });
    this._ScrollbackBar.addEventListener('scrollback-exit', (): void => {
      this.ExitScrollback();
    });
    this._fTelnetContainer.appendChild(this._ScrollbackBar);
    // TODO (preserved): also have a span to hold the current line number

    // ── Status bar ──
    // Lit component <f-status-bar>. Same DOM contract as the
    // original (renders div.fTelnetStatusBar with .fTelnetMenuButton,
    // .fTelnetConnectButton, .fTelnetStatusBarLabel children — all
    // in light DOM so the existing CSS applies). Click handlers
    // dispatch custom events we listen for below.
    //
    // The component consolidates what used to be four separate
    // fields (_StatusBar, _StatusBarLabel, _ConnectButton,
    // _MenuButton) into a single reference. All later state
    // changes (label text, button visibility, background color)
    // are reactive property writes on this one component.
    this._StatusBar = document.createElement('f-status-bar') as FStatusBar;
    this._StatusBar.language = this._Options.Language as Language;
    // Localize the initial idle-state labels (the component's raw
    // defaults are English; push the active language's versions).
    this._StatusBar.statusText = t(
      'status.notConnected',
      this._Options.Language as Language,
    );
    this._StatusBar.connectButtonText = t(
      'status.button.connect',
      this._Options.Language as Language,
    );
    this._StatusBar.addEventListener('menu-click', (e: Event): void => {
      const detail = (e as CustomEvent<MenuClickDetail>).detail;
      // OnMenuButtonClick accepts a MouseEvent-like object with
      // pageX/pageY; the MenuClickDetail satisfies that shape.
      this.OnMenuButtonClick({ pageX: detail.pageX, pageY: detail.pageY });
    });
    this._StatusBar.addEventListener('connect-click', (): void => {
      this.Connect();
    });
    this._fTelnetContainer.appendChild(this._StatusBar);

    // ── Menu popup (action buttons + screen-size dropdown) ──
    // Lit component <f-menu-popup>. The largest piece of UI
    // chrome refactored in Phase 2: replaces ~205 lines of
    // imperative DOM construction in Phase 1, plus 8 scattered
    // `this._MenuButtons.style.display = 'none'` lines across
    // the public action methods (now `this._MenuButtons.open = false`).
    //
    // The component dispatches a single `menu-action` event with
    // a typed action name in the detail. We dispatch via a
    // switch statement on action — clearer than 8 separate
    // addEventListener calls.
    //
    // The screen-size dropdown emits its own `screen-size-change`
    // event since it carries data (new dimensions).
    //
    // Conditional rows (Copy/Paste, View Scrollback) are
    // controlled via `showCopyPaste` and `showScrollback`
    // properties — fTelnetClient still owns the conditional
    // logic (DetectMobileBrowser, _UseModernScrollback), just
    // forwards the result to the component.

    // Compute the screen-size dropdown options, including
    // prepending the current size if it's not one of the
    // standard 15. Logic preserved verbatim from Phase 1.
    const SupportedScreenSizes = [
      '80x25',
      '80x28',
      '80x30',
      '80x43',
      '80x50',
      '80x60',
      '132x37',
      '132x52',
      '132x25',
      '132x28',
      '132x30',
      '132x34',
      '132x43',
      '132x50',
      '132x60',
    ];
    const CurrentScreenSize =
      this._Options.ScreenColumns.toString() + 'x' + this._Options.ScreenRows.toString();
    if (SupportedScreenSizes.indexOf(CurrentScreenSize) === -1) {
      SupportedScreenSizes.unshift(CurrentScreenSize);
    }

    this._MenuButtons = document.createElement('f-menu-popup') as FMenuPopup;
    this._MenuButtons.showCopyPaste = !DetectMobileBrowser.IsMobile;
    this._MenuButtons.showScrollback = !this._UseModernScrollback;
    this._MenuButtons.currentScreenSize = CurrentScreenSize;
    this._MenuButtons.supportedScreenSizes = SupportedScreenSizes;
    this._MenuButtons.transferProtocol = this._Options.DefaultTransferProtocol;
    this._MenuButtons.language = this._Options.Language as Language;

    this._MenuButtons.addEventListener('menu-action', (e: Event): void => {
      const detail = (e as CustomEvent<MenuActionDetail>).detail;
      switch (detail.action) {
        case 'connect':
          this.Connect();
          break;
        case 'disconnect':
          this.Disconnect(true);
          break;
        case 'copy':
          this.ClipboardCopy();
          break;
        case 'paste':
          // ClipboardPaste is async; fire-and-forget matches the
          // original's synchronous click handler semantics.
          void this.ClipboardPaste();
          break;
        case 'upload':
          this.Upload();
          break;
        case 'download':
          this.Download();
          break;
        case 'keyboard-toggle':
          this.VirtualKeyboardVisible = !this.VirtualKeyboardVisible;
          break;
        case 'fullscreen':
          this.FullScreenToggle();
          break;
        case 'enter-scrollback':
          this.EnterScrollback();
          break;
        case 'settings':
          this.OpenSettings();
          break;
        case 'user-manual':
          this.OpenUserManual();
          break;
      }
    });

    this._MenuButtons.addEventListener('screen-size-change', (e: Event): void => {
      const detail = (e as CustomEvent<ScreenSizeChangeDetail>).detail;
      this._Crt.SetScreenSize(detail.columns, detail.rows);
      this._Crt.SetFont(this._Crt.Font.Name);
      // Close the popup. The dropdown change isn't a click on
      // the menu button, so we close without repositioning.
      this._MenuButtons.open = false;

      // Persist the choice for the rest of THIS tab session
      // (sessionStorage, not localStorage) — survives reloads and
      // reconnects, but a fresh visitor in a new tab starts at the
      // 80x25 default. See the matching restore logic in the
      // constructor for the full rationale.
      try {
        window.sessionStorage.setItem('ScreenColumns', detail.columns.toString());
        window.sessionStorage.setItem('ScreenRows', detail.rows.toString());
      } catch {
        // Ignore — browser doesn't support sessionStorage.
      }
    });

    // Popup is attached to document.body (not _fTelnetContainer)
    // so it can escape the container's overflow clipping. Same
    // as the original. The theme attribute has to be set
    // explicitly on the popup too, since CSS variables don't
    // cascade across the document-body boundary from our
    // container.
    this._MenuButtons.setAttribute('data-theme', this._Options.Theme);
    document.body.appendChild(this._MenuButtons);

    // ── Settings panel (Phase 3 Stage 2) ──
    // Lit component <f-settings-panel>. Opens from the menu popup
    // via the new "Settings..." action; floats over the page like
    // the menu popup does. Dispatches one event per change which
    // we apply immediately + persist to localStorage.
    this._SettingsPanel = document.createElement('f-settings-panel') as FSettingsPanel;
    this._SettingsPanel.currentTheme = this._Options.Theme;
    this._SettingsPanel.muted = this._Options.MuteSounds;
    this._SettingsPanel.localEcho = this._Options.LocalEcho;
    this._SettingsPanel.autoReconnect = this._Options.AutoReconnect;
    this._SettingsPanel.vibrateDuration = this._Options.VirtualKeyboardVibrateDuration;
    this._SettingsPanel.zmodemAutoDetect = this._Options.ZModemAutoDetect;
    this._SettingsPanel.defaultProtocol = this._Options.DefaultTransferProtocol;
    this._SettingsPanel.language = this._Options.Language as Language;

    this._SettingsPanel.addEventListener('settings-theme-change', (e: Event): void => {
      const detail = (e as CustomEvent<SettingsThemeChangeDetail>).detail;
      this.ApplyTheme(detail.theme);
      try {
        window.sessionStorage.setItem('fTelnet.theme', detail.theme);
      } catch {
        // Ignore — browser doesn't support sessionStorage.
      }
    });
    this._SettingsPanel.addEventListener('settings-mute-change', (e: Event): void => {
      const detail = (e as CustomEvent<SettingsMuteChangeDetail>).detail;
      this._Crt.Muted = detail.muted;
      this._Options.MuteSounds = detail.muted;
      try {
        window.sessionStorage.setItem('fTelnet.mute', String(detail.muted));
      } catch {
        // Ignore.
      }
    });
    this._SettingsPanel.addEventListener(
      'settings-localecho-change',
      (e: Event): void => {
        const detail = (e as CustomEvent<SettingsLocalEchoChangeDetail>).detail;
        // Apply to the live Crt so typed keys are (or stop being)
        // echoed to the screen immediately. Intentionally NOT
        // persisted to sessionStorage — local echo is a per-session
        // troubleshooting toggle and always starts off on a fresh
        // load, per design.
        this._Crt.LocalEcho = detail.enabled;
        this._Options.LocalEcho = detail.enabled;
      },
    );
    this._SettingsPanel.addEventListener(
      'settings-autoreconnect-change',
      (e: Event): void => {
        const detail = (e as CustomEvent<SettingsAutoReconnectChangeDetail>)
          .detail;
        this._Options.AutoReconnect = detail.enabled;
        // Persist per tab-session (like mute/theme), so the choice
        // survives reloads/reconnects within the session.
        try {
          window.sessionStorage.setItem(
            'fTelnet.autoReconnect',
            String(detail.enabled),
          );
        } catch {
          // Ignore — browser without sessionStorage.
        }
      },
    );
    this._SettingsPanel.addEventListener('settings-vibrate-change', (e: Event): void => {
      const detail = (e as CustomEvent<SettingsVibrateChangeDetail>).detail;
      this._Options.VirtualKeyboardVibrateDuration = detail.duration;
      this._VirtualKeyboard.vibrateDuration = detail.duration;
      try {
        window.sessionStorage.setItem('fTelnet.vibrate', String(detail.duration));
      } catch {
        // Ignore.
      }
    });
    this._SettingsPanel.addEventListener(
      'settings-zmodem-auto-detect-change',
      (e: Event): void => {
        const detail = (e as CustomEvent<SettingsZModemAutoDetectChangeDetail>)
          .detail;
        // Update the runtime flag. OnConnectionData checks this on
        // every read, so the change takes effect immediately — no
        // reconnect needed.
        this._Options.ZModemAutoDetect = detail.enabled;
        try {
          window.sessionStorage.setItem(
            'fTelnet.zmodemAutoDetect',
            String(detail.enabled),
          );
        } catch {
          // Ignore.
        }
      },
    );
    this._SettingsPanel.addEventListener(
      'settings-default-protocol-change',
      (e: Event): void => {
        const detail = (e as CustomEvent<SettingsDefaultProtocolChangeDetail>)
          .detail;
        // Update the runtime field and propagate to every component
        // that displays the protocol name to the user — menu button
        // labels, drop overlay subtitle, upload confirm dialog body.
        // No reconnect needed; Lit re-renders on property change.
        this._Options.DefaultTransferProtocol = detail.protocol;
        if (this._MenuButtons !== undefined) {
          this._MenuButtons.transferProtocol = detail.protocol;
        }
        if (this._DropOverlay !== undefined) {
          this._DropOverlay.transferProtocol = detail.protocol;
        }
        if (this._UploadConfirm !== undefined) {
          this._UploadConfirm.transferProtocol = detail.protocol;
        }
        try {
          window.sessionStorage.setItem(
            'fTelnet.defaultTransferProtocol',
            detail.protocol,
          );
        } catch {
          // Ignore.
        }
      },
    );
    this._SettingsPanel.addEventListener(
      'settings-language-change',
      (e: Event): void => {
        const detail = (e as CustomEvent<SettingsLanguageChangeDetail>)
          .detail;
        // Only functional languages reach here (the picker disables
        // placeholder options), but guard anyway.
        if (!isAvailable(detail.language)) {
          return;
        }
        this._Options.Language = detail.language;
        // Propagate to every localized component so Lit re-renders
        // it in the new language. Today that's the menu popup and
        // the settings panel itself; as more components adopt t(),
        // add them here.
        if (this._MenuButtons !== undefined) {
          this._MenuButtons.language = detail.language;
        }
        this._SettingsPanel.language = detail.language;
        if (this._StatusBar !== undefined) {
          // Updates the "Menu" button immediately. The dynamic
          // status text (Connected/Disconnected/...) is composed at
          // connection-event time, so it adopts the new language on
          // the next such event rather than retroactively — an
          // acceptable, low-surprise behavior for a status line.
          this._StatusBar.language = detail.language;
        }
        // Newly-localized message components (beta.23). Each is
        // persistent in the DOM and re-renders when its language
        // property changes.
        if (this._FocusWarningBar !== undefined) {
          this._FocusWarningBar.language = detail.language;
        }
        if (this._DropOverlay !== undefined) {
          this._DropOverlay.language = detail.language;
        }
        if (this._UploadConfirm !== undefined) {
          this._UploadConfirm.language = detail.language;
        }
        if (this._ScrollbackBar !== undefined) {
          this._ScrollbackBar.language = detail.language;
        }
        try {
          window.sessionStorage.setItem(
            'fTelnet.language',
            detail.language,
          );
        } catch {
          // Ignore.
        }
      },
    );
    this._SettingsPanel.addEventListener('settings-close', (): void => {
      this._SettingsPanel.open = false;
    });

    this._SettingsPanel.setAttribute('data-theme', this._Options.Theme);
    document.body.appendChild(this._SettingsPanel);

    // ── Phase 5: Upload UI — drop overlay + confirm dialog ──
    //
    // _DropOverlay: persistent in the DOM; only renders when its
    // `visible` property is true (driven by document-level drag
    // events the component owns).
    //
    // _UploadConfirm: also persistent; renders only when
    // `open && file !== null`.
    //
    // Flow:
    //   1. User drags a file → _DropOverlay becomes visible
    //   2. User drops → _DropOverlay dispatches `drop-file-selected`
    //   3. We catch it here, store the file on _UploadConfirm,
    //      open the dialog
    //   4. User clicks Send → `upload-confirm` event → we'd start
    //      ZModemSend (Delta 2 — for now just log and dismiss)
    //   5. User clicks Cancel / clicks outside / ESC → `upload-cancel`
    //      → we close the dialog without doing anything
    //
    // The same flow runs for the menu's "Upload..." action: it
    // triggers _UploadInput.click() (the existing hidden file
    // input), and OnUploadFileSelected feeds the chosen file into
    // _UploadConfirm via the same path.
    this._DropOverlay = document.createElement('f-drop-overlay') as FDropOverlay;
    this._DropOverlay.transferProtocol = this._Options.DefaultTransferProtocol;
    this._DropOverlay.language = this._Options.Language as Language;
    this._DropOverlay.addEventListener('drop-file-selected', (e: Event): void => {
      const detail = (e as CustomEvent<DropFileSelectedDetail>).detail;
      this._beginUploadFlow(detail.files);
    });
    // Lives on document.body, outside the themed container — set
    // the theme attribute directly so the overlay's CSS reads the
    // right palette. Matches what we do for FUploadConfirm below
    // and FMenuButtons / FSettingsPanel above.
    this._DropOverlay.setAttribute('data-theme', this._Options.Theme);
    document.body.appendChild(this._DropOverlay);

    this._UploadConfirm = document.createElement(
      'f-upload-confirm',
    ) as FUploadConfirm;
    this._UploadConfirm.transferProtocol = this._Options.DefaultTransferProtocol;
    this._UploadConfirm.language = this._Options.Language as Language;
    this._UploadConfirm.addEventListener('upload-confirm', (e: Event): void => {
      const detail = (e as CustomEvent<UploadConfirmDetail>).detail;
      // Symmetric reset with the cancel handler below: both `open`
      // AND `files` get cleared after consuming the event. Leaving
      // `files` set after consumption created a stale-state window
      // where subsequent drops couldn't dispatch upload-confirm
      // properly (manifested as "Send button silently does nothing
      // on second drop"). Clearing both properties matches the
      // pattern in the cancel handler and keeps the component in
      // a known-good baseline between flows.
      this._UploadConfirm.open = false;
      this._UploadConfirm.files = [];
      // Phase 5: route to the protocol the user picked in Settings.
      // ZMODEM uses the new transfer-progress panel + multi-file
      // batch flow; YMODEM uses its own legacy in-canvas progress
      // dialog and the YModemSend state machine.
      if (this._Options.DefaultTransferProtocol === 'ymodem') {
        this._beginYModemSend(detail.files);
      } else {
        this._beginZModemSend(detail.files);
      }
    });
    this._UploadConfirm.addEventListener('upload-cancel', (): void => {
      this._UploadConfirm.open = false;
      this._UploadConfirm.files = [];
    });
    this._UploadConfirm.setAttribute('data-theme', this._Options.Theme);
    document.body.appendChild(this._UploadConfirm);

    // ── Virtual keyboard ──
    // Lit component <f-virtual-keyboard>. The Phase 1 class took
    // a Crt reference and called Crt.PushKeyDown / PushKeyPress
    // directly; the component decouples by dispatching typed
    // events with matching payloads, which we forward to Crt
    // here.
    this._VirtualKeyboard = document.createElement('f-virtual-keyboard') as FVirtualKeyboard;
    this._VirtualKeyboard.vibrateDuration = this._Options.VirtualKeyboardVibrateDuration;
    this._VirtualKeyboard.visible = this._Options.VirtualKeyboardVisible;

    this._VirtualKeyboard.addEventListener('vk-key-down', (e: Event): void => {
      const d = (e as CustomEvent<VKKeyEventDetail>).detail;
      this._Crt.PushKeyDown(d.charCode, d.keyCode, d.ctrl, d.alt, d.shift);
    });
    this._VirtualKeyboard.addEventListener('vk-key-press', (e: Event): void => {
      const d = (e as CustomEvent<VKKeyEventDetail>).detail;
      this._Crt.PushKeyPress(d.charCode, d.keyCode, d.ctrl, d.alt, d.shift);
    });

    this._fTelnetContainer.appendChild(this._VirtualKeyboard);

    // ── Transfer progress panel (Phase 4 Stage 7) ──
    // Centered overlay shown during ZMODEM/YMODEM transfers. Hidden
    // by default; activated by `beginZModemReceive`. Listens for ESC
    // and click-to-abort, both routed to ZModemReceive.abort().
    this._TransferProgressPanel = document.createElement(
      'f-transfer-progress',
    ) as FTransferProgress;
    this._TransferProgressPanel.addEventListener('transfer-abort', (): void => {
      // Send the protocol abort: ZABORT hex header, 8 CAN burst,
      // 10 BS cleanup (each as a separate WebSocket message). The
      // peer sees this at its next subpacket boundary and aborts
      // on its end.
      //
      // Phase 5 Delta 2: same abort flow regardless of direction.
      // If we're receiving, ZModemReceive.abort() sends the
      // sequence. If we're sending, ZModemSend.abort() does the
      // same. Only one of these will be active at any moment, so
      // calling both is safe (the inactive one is undefined).
      this._ZModemReceive?.abort();
      this._ZModemSend?.abort();

      // ── Drain the inbound buffer ──────────────────────────
      // The architectural insight: post-abort "garbage" you see in
      // the browser is NOT the BBS still sending. The BBS aborts
      // promptly on receipt of the ZABORT. The bytes are sitting
      // in OUR _InputBuffer, having arrived via WebSocket at full
      // speed while OnConnectionData drips them out at the
      // configured BitsPerSecond throttle (a deliberate "BBS feel"
      // simulation, see Rick's fTelnet docs).
      //
      // Drain it right now without throttling, discarding the
      // backlog so it doesn't drip out as garbage long after the
      // BBS has stopped. The small 1.5s drop window below catches
      // anything that arrives in the gap between abort delivery
      // and the BBS post-abort prompt.
      if (this._Connection !== undefined) {
        const queued = this._Connection.bytesAvailable;
        if (queued > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[fTelnetClient] post-abort: draining ${queued} buffered bytes from inbound`,
          );
          this._Connection.readString(queued); // discard
        }
      }

      // Short drop window for the trickle between drain and the
      // BBS prompt. See _PostAbortDropUntil field doc.
      this._PostAbortDropUntil = Date.now() + fTelnetClient.POST_ABORT_DROP_MS;
    });
    this._TransferProgressPanel.addEventListener(
      'transfer-linger-done',
      (): void => {
        // The panel finished its post-completion linger; hide it.
        this._TransferProgressPanel.visible = false;
        this._TransferProgressPanel.reset();
      },
    );
    // Append to document.body (not _ClientContainer) so positioning
    // works against the viewport. Appending inside _ClientContainer
    // was attempted but the panel didn't render at all (cause not
    // fully diagnosed — possibly an interaction with the Crt canvas
    // siblings or _ClientContainer's overflow: hidden/scroll). The
    // viewport-centered approach has the minor cosmetic downside of
    // sitting at viewport-center rather than canvas-center on wide
    // monitors, but it RELIABLY appears. Phase 5 can revisit
    // canvas-relative centering with a more careful approach.
    document.body.appendChild(this._TransferProgressPanel);

    // Recompute sizes for the bars and keyboard now that everything
    // is in place.
    this.OnCrtScreenSizeChanged();

    // ── Splash screen ──
    // Big base64-encoded blobs preserved verbatim from the original.
    // Each decodes to a "Welcome to fTelnet" screen rendered in the
    // appropriate emulation's character set:
    //   - Atari: 40-column Atari graphics font
    //   - C64: 40-column Commodore lowercase font
    //   - RIP: full RIPscrip drawing commands
    //   - default: CP437/ansi-bbs (most BBSes)
    // The year token is patched in at runtime so the copyright
    // stays current automatically.
    if (this._Options.Emulation === 'Atari') {
      if (this._Options.SplashScreen === '') {
        this._Crt.Write(
          atob('m2ZUZWxuZXQgLS0gVGVsbmV0IGZvciB0aGUgV2VimyAgV2ViIGJhc2VkIEJCUyB0ZXJtaW5hbCBjbGllbnSbm0NvcHlyaWdodCAoYykgMjAwOS0')
        );
        this._Crt.Write(new Date().getFullYear().toString());
        this._Crt.Write(atob('IFImTSBTb2Z0d2FyZS6bQWxsIFJpZ2h0cyBSZXNlcnZlZJs='));
        // Fork attribution (Atari ATASCII: \x9b = EOL). Single
        // line; plain hyphen separator since ATASCII has no box-
        // drawing equivalent to CP437's \xc4.
        this._Crt.Write(
          'Modernized fork by Tom Swartz - dangerbaybbs@hotmail.com\x9b\x9b'
        );
      } else {
        this._Crt.Write(atob(this._Options.SplashScreen));
      }
    } else if (this._Options.Emulation === 'C64') {
      if (this._Options.SplashScreen === '') {
        this._Crt.Write(
          atob('DQpGdEVMTkVUIC0tIHRFTE5FVCBGT1IgVEhFIHdFQg0KICB3RUIgQkFTRUQgYmJzIFRFUk1JTkFMIENMSUVOVA0KDQpjT1BZUklHSFQgKGMpIDIwMDkt')
        );
        this._Crt.Write(new Date().getFullYear().toString());
        this._Crt.Write(atob('IHImbSBzT0ZUV0FSRS4NCmFMTCBySUdIVFMgckVTRVJWRUQNCg=='));
        // Fork attribution (C64 inverted case style — capital
        // letters in the source display as lowercase on a C64
        // screen, and vice versa). Single line.
        this._Crt.Write(
          'mODERNIZED FORK BY tOM sWARTZ - DANGERBAYBBS@HOTMAIL.COM\r\n\r\n'
        );
      } else {
        this._Crt.Write(atob(this._Options.SplashScreen));
      }
    } else if (this._Options.Emulation === 'RIP') {
      if (this._Options.SplashScreen === '') {
        // Clear screen + home cursor before rendering the splash.
        // See the ANSI default branch below for rationale.
        this._RIP.Parse('\x1b[0m\x1b[2J\x1b[0;0H');
        // RIPscrip is an ANSI superset, so the same hand-crafted
        // fTelnet-Modern splash blob works here. Same Option B
        // attribution stack as the default ANSI branch below:
        // new splash → R&M line → Tom Swartz fork-credit line.
        this._RIP.Parse(atob(fTelnetClient.SPLASH_ANSI_DEFAULT));
        this._RIP.Parse(
          '\r\n\x1b[11C\x1b[1;32mCopyright (C) 2009-'
        );
        this._RIP.Parse(new Date().getFullYear().toString());
        this._RIP.Parse(
          ' R&M Software.  All Rights Reserved\x1b[0m\r\n'
        );
        this._RIP.Parse(
          '\x1b[11C\x1b[1;36mModernized fork by Tom Swartz \x1b[0;36m\xc4\x1b[1;36m dangerbaybbs@hotmail.com\x1b[0m\r\n'
        );
      } else {
        this._RIP.Parse(atob(this._Options.SplashScreen));
      }
    } else {
      // Default: ansi-bbs splash.
      //
      // Option B integration:
      //   1. New hand-crafted fTelnet-Modern splash by Tom Swartz
      //      (defined as SPLASH_ANSI_DEFAULT — has "fTelnet" +
      //      "Modern" block letters, tagline, github URL).
      //   2. Below it, Rick's original "Copyright (C) ... R&M
      //      Software. All Rights Reserved" line is preserved
      //      as a visual nod to the upstream lineage.
      //   3. Below that, Tom's fork-credit line: "Modernized fork
      //      by Tom Swartz — dangerbaybbs@hotmail.com" so the
      //      maintainer's name and contact are visible on the
      //      launch screen (the splash artwork itself only shows
      //      the project repo URL, not the author's name/email).
      if (this._Options.SplashScreen === '') {
        // Clear screen + home cursor before rendering the splash.
        // The SPLASH1.ANS artwork assumes it's drawing on a blank
        // canvas starting at row 0 col 0; without this prelude
        // any leftover output (terminal init sequences, prior
        // session residue) would push the artwork down and
        // misalign the layout.
        this._Ansi.Write('\x1b[0m\x1b[2J\x1b[0;0H');
        this._Ansi.Write(atob(fTelnetClient.SPLASH_ANSI_DEFAULT));
        // Rick's copyright line below the artwork — bright green,
        // column-11 alignment matching the original splash's
        // attribution column.
        this._Ansi.Write(
          '\r\n\x1b[11C\x1b[1;32mCopyright (C) 2009-'
        );
        this._Ansi.Write(new Date().getFullYear().toString());
        this._Ansi.Write(
          ' R&M Software.  All Rights Reserved\x1b[0m\r\n'
        );
        // Tom's fork-credit line — bright cyan name/email,
        // dim cyan CP437 box-drawing separator (\xc4). Same
        // column alignment as R&M's line above.
        this._Ansi.Write(
          '\x1b[11C\x1b[1;36mModernized fork by Tom Swartz \x1b[0;36m\xc4\x1b[1;36m dangerbaybbs@hotmail.com\x1b[0m\r\n'
        );
      } else {
        this._Ansi.Write(atob(this._Options.SplashScreen));
      }
    }

    // TODOX (preserved): This was inside the old `Boolean Init()`
    // path that fired when Crt initialization failed. Constructor
    // can't return false, so this whole branch is dead. The future
    // approach: a `fTelnet.Supported` getter that callers can check
    // before they construct.
    // } else {
    //     this._InitMessageBar.innerHTML = 'fTelnet Error: Unable to init Crt class';
    //     if (typeof this._ScrollbackBar !== 'undefined') { this._ScrollbackBar.style.display = 'none'; }
    //     this._FocusWarningBar.style.display = 'none';
    //     // TODOX return false;
    // }

    // Main poll timer. Fires every 250ms to drive focus checks
    // and modern-scrollback state. The original had a TODOX about
    // firing more often to warm the font cache during the splash
    // screen — preserved.
    this._Timer = setInterval((): void => {
      this.OnTimer();
    }, 250);

    // Hidden file input used for Upload(). Triggered by .click().
    this._UploadInput = document.createElement('input') as HTMLInputElement;
    this._UploadInput.type = 'file';
    this._UploadInput.className = 'fTelnetUpload';
    // Phase 5 Delta 3: allow multi-file selection via ctrl/shift-
    // click in the OS file picker. The selected files get sent as
    // a ZMODEM batch (sequential ZFILE → ZDATA → ZEOF cycles).
    this._UploadInput.multiple = true;
    this._UploadInput.onchange = (): void => {
      this.OnUploadFileSelected();
    };
    this._UploadInput.style.display = 'none';
    this._fTelnetContainer.appendChild(this._UploadInput);

    // TODOX return true; (would-have-returned-success in old Init() method)
  }

  // ───── Public API ─────

  /**
   * Show a "click and drag to copy" prompt and dismiss the menu.
   *
   * The actual copy happens via browser selection — fTelnet just
   * tells the user how to do it. Phase 3 will likely replace this
   * with a toast or a proper copy-mode overlay.
   */
  public ClipboardCopy(): void {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }
    this.showInfoDialog(
      t('dialog.copy.title', this._Options.Language as Language),
      t('dialog.copy.body', this._Options.Language as Language),
    );
  }

  /**
   * Read clipboard text via ClipboardHelper and push each character
   * onto the Crt's synthetic-key queue (so it goes out to the BBS
   * as if typed).
   *
   * Only printable ASCII (32-126) plus CR are sent. Other chars
   * are silently dropped — matches the original.
   *
   * The original ran synchronously against the legacy
   * `window.clipboardData` API. ClipboardHelper.GetData() now uses
   * the modern Promise-based Clipboard API, so this method had to
   * become async. Caller-side: the existing click handlers fire it
   * without awaiting (they ignore the returned promise), which
   * matches the original's fire-and-forget semantics.
   */
  public async ClipboardPaste(): Promise<void> {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }

    let Text: string;
    try {
      Text = await ClipboardHelper.GetData();
    } catch (e) {
      // Clipboard API unavailable (insecure context) or user
      // denied permission. Silent failure matches the original's
      // fall-through behavior when window.clipboardData was missing.
      // eslint-disable-next-line no-console
      console.log('Clipboard paste failed: ' + String(e));
      return;
    }

    for (let i = 0; i < Text.length; i++) {
      const B: number = Text.charCodeAt(i);
      if (B === 13 || B === 32) {
        // CR and space go through PushKeyDown so they trigger Enter
        // / Space handling rather than just an ASCII character.
        this._Crt.PushKeyDown(0, B, false, false, false);
      } else if (B >= 33 && B <= 126) {
        this._Crt.PushKeyPress(B, 0, false, false, false);
      }
    }
  }

  /**
   * Initiate a connection to the configured host.
   *
   * If we're still waiting on the proxy-servers fetch, retries up
   * to 10 times at 100ms intervals (1 second total) — this exists
   * for auto-connect scenarios where Connect() fires before the
   * fetch has resolved.
   */
  public Connect(): void {
    if (this._LoadingProxySettings > 0) {
      // eslint-disable-next-line no-console
      console.log('waiting for proxy-servers.json');
      setTimeout((): void => {
        this.Connect();
      }, 100);
      this._LoadingProxySettings -= 1;
      return;
    }

    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection !== undefined && this._Connection.connected) {
      return;
    }

    // Pick the right Connection subclass for the configured protocol.
    switch (this._Options.ConnectionType) {
      case 'rlogin':
        this._Connection = new RLoginConnection();
        break;
      case 'tcp':
        this._Connection = new WebSocketConnection();
        break;
      default:
        this._Connection = new TelnetConnection(this._Crt, this._Options.Emulation);
        this._Connection.LocalEcho = this._Options.LocalEcho;
        this._Connection.onlocalecho.on((value: boolean): void => {
          this.OnConnectionLocalEcho(value);
        });
        this._Connection.SendLocation = this._Options.SendLocation;
        break;
    }

    this._Connection.onclose.on((): void => {
      this.OnConnectionClose();
    });
    this._Connection.onconnect.on((): void => {
      this.OnConnectionConnect();
    });
    this._Connection.ondata.on((): void => {
      this.OnConnectionData();
    });
    this._Connection.onioerror.on((): void => {
      this.OnConnectionIOError();
    });
    this._Connection.onsecurityerror.on((): void => {
      this.OnConnectionSecurityError();
    });

    // Reset display in the appropriate way for the emulation.
    if (this._Options.Emulation === 'RIP') {
      this._RIP.ResetWindows();
    } else {
      this._Crt.NormVideo();
      this._Crt.ClrScr();
    }

    // Direct connection (no proxy) vs proxied connection.
    if (this._Options.ProxyHostname === '') {
      this._StatusBar.connectButtonVisible = false;
      this._StatusBar.statusText = tf(
        'status.connecting',
        this._Options.Language as Language,
        { host: this._Options.Hostname + ':' + this._Options.Port },
      );
      this._StatusBar.state = 'active';
      this._ClientContainer.style.opacity = '1.0';
      this._Connection.connect(
        this._Options.Hostname,
        this._Options.Port,
        this._Options.WebSocketUrlPath,
        this._Options.ForceWss
      );
    } else {
      this._StatusBar.connectButtonVisible = false;
      this._StatusBar.statusText = tf(
        'status.connecting.proxy',
        this._Options.Language as Language,
        {
          host: this._Options.Hostname + ':' + this._Options.Port,
          proxy: this._Options.ProxyHostname,
        },
      );
      this._StatusBar.state = 'active';
      this._ClientContainer.style.opacity = '1.0';
      this._Connection.connect(
        this._Options.Hostname,
        this._Options.Port,
        '',
        this._Options.ForceWss,
        this._Options.ProxyHostname,
        this._Options.ProxyPort,
        this._Options.ProxyPortSecure
      );
    }
  }

  public get Connected(): boolean {
    if (this._Connection === undefined) {
      return false;
    }
    return this._Connection.connected;
  }

  public get Connection(): WebSocketConnection | undefined {
    return this._Connection;
  }

  public get Crt(): Crt {
    return this._Crt;
  }

  /**
   * Tear down the current connection. Returns true if the
   * disconnect proceeded, false if the user cancelled the confirm
   * dialog.
   *
   * Original used `delete this._Connection` which doesn't survive
   * strict mode. Equivalent: `this._Connection = undefined` plus
   * a `WebSocketConnection | undefined` typing on the field.
   */
  /**
   * Tear down the current connection.
   *
   * When `prompt` is true, asks the user to confirm first, using the
   * themed <f-confirm-dialog> (replacing the old unthemed native
   * confirm()). Because that dialog is asynchronous, the confirm
   * path resolves on a later tick — so this method no longer returns
   * a meaningful boolean for the prompted case. Neither caller (the
   * 'disconnect' menu action and the internal security-error path)
   * uses the return value, so this is safe; the signature is kept as
   * `void`-effectively-boolean only for the immediate non-prompt /
   * not-connected early-outs.
   *
   * Original used `delete this._Connection` which doesn't survive
   * strict mode. Equivalent: `this._Connection = undefined` plus
   * a `WebSocketConnection | undefined` typing on the field.
   */
  public Disconnect(prompt: boolean): boolean {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection === undefined || !this._Connection.connected) {
      return true;
    }

    if (!prompt) {
      this.performDisconnect();
      return true;
    }

    // Themed confirm. Resolves on a later tick; tear down only if the
    // user confirms. We intentionally don't block on this (the native
    // confirm() used to block synchronously, but no caller depends on
    // the boolean result anymore).
    void this.showConfirmDialog(
      t('disconnect.confirm.title', this._Options.Language as Language),
      t('disconnect.confirm.body', this._Options.Language as Language),
    ).then((confirmed: boolean): void => {
      if (confirmed) {
        this.performDisconnect();
      }
    });

    return false;
  }

  /**
   * Actually tear down the connection: detach all event handlers,
   * close the socket, and fire OnConnectionClose. Split out of
   * Disconnect so both the prompted (async-confirmed) and unprompted
   * paths share one implementation.
   */
  private performDisconnect(): void {
    if (this._Connection === undefined) {
      return;
    }
    // Mark this close as user-initiated so OnConnectionClose() does
    // NOT trigger the auto-reconnect countdown. (An unexpected drop
    // reaches OnConnectionClose via the still-attached onclose event
    // with this flag false.)
    this._userInitiatedDisconnect = true;
    this._Connection.onclose.off();
    this._Connection.onconnect.off();
    this._Connection.ondata.off();
    this._Connection.onioerror.off();
    this._Connection.onlocalecho.off();
    this._Connection.onsecurityerror.off();
    this._Connection.close();
    this._Connection = undefined;

    // User-initiated; _userInitiatedDisconnect is set, which suppresses
    // any auto-reconnect.
    this.OnConnectionClose();
  }

  /**
   * Start a download via the user's configured default transfer
   * protocol.
   *
   * For YMODEM (legacy fallback): stops the main poll timer
   * (YModem runs its own), arms a one-shot completion handler that
   * restarts the timer when the download finishes, and starts the
   * YMODEM-G receive handshake.
   *
   * For ZMODEM (default): shows a hint dialog explaining that
   * downloads auto-detect when the BBS initiates them — no
   * client-side button needed. ZMODEM auto-detect runs from the
   * inbound-byte stream watcher (governed separately by the
   * `ZModemAutoDetect` option, which is on by default), so the
   * actual transfer fires the moment the BBS sends the ZRQINIT
   * trigger sequence.
   *
   * The behavior is controlled by `Options.DefaultTransferProtocol`,
   * exposed in Settings.
   */
  public Download(): void {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }

    if (this._Options.DefaultTransferProtocol === 'zmodem') {
      // ZMODEM downloads auto-detect: the BBS initiates with the
      // ZRQINIT trigger sequence, our inbound-data watcher catches
      // it, and ZModemReceive takes over automatically. Tell the
      // user how that works rather than starting something here.
      this.showInfoDialog(
        t('dialog.download.title', this._Options.Language as Language),
        t('dialog.download.body', this._Options.Language as Language),
      );
      return;
    }

    // YMODEM-G receive (legacy user-initiated path).
    this._YModemReceive = new YModemReceive(this._Crt, this._Connection);

    if (this._Timer !== undefined) {
      clearInterval(this._Timer);
      this._Timer = undefined;
    }
    this._YModemReceive.ontransfercomplete.on((): void => {
      this.OnDownloadComplete();
    });

    this._YModemReceive.Download();
  }

  /**
   * Show the scrollback bar and enter Crt scrollback mode.
   *
   * Migration note: the Phase 1 port preserved a `=` (assignment)
   * vs `===` (comparison) typo from the original:
   *
   *     if (this._ScrollbackBar.style.display = 'none') { ... }
   *
   * The assignment evaluated to `'none'` (always truthy), so the
   * if-body always ran. Effect was benign because
   * `Crt.EnterScrollback()` is idempotent (it early-returns if
   * already in scrollback). With the component refactor, the
   * literal port would become:
   *
   *     if (this._ScrollbackBar.visible = false) { ... }
   *
   * which evaluates to `false` (always falsy) — the if-body
   * would NEVER run. That would be a real regression, so this
   * is the right place to fix the original typo: rewrite the
   * condition the way the author obviously meant.
   */
  public EnterScrollback(): void {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._ScrollbackBar !== undefined && !this._ScrollbackBar.visible) {
      this._Crt.EnterScrollback();
      this._ScrollbackBar.visible = true;
    }
  }

  /**
   * Exit scrollback mode and hide the scrollback bar.
   *
   * Same typo fix as `EnterScrollback` above.
   */
  public ExitScrollback(): void {
    if (this._ScrollbackBar !== undefined && this._ScrollbackBar.visible) {
      this._Crt.ExitScrollback();
      this._ScrollbackBar.visible = false;
    }
  }

  /**
   * Toggle fullscreen mode on the fTelnet container.
   *
   * The argument controls behavior at the boundary:
   *   - `null` (default): pure toggle
   *   - `true`: only enter fullscreen (no-op if already in)
   *   - `false`: only exit fullscreen (no-op if already out)
   *
   * Walks the vendor-prefixed Fullscreen API for browser
   * compatibility — see fullscreen.d.ts for the ambient
   * declarations of the prefixed methods.
   */
  public FullScreenToggle(fullscreen: boolean | null = null): void {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (
      !document.fullscreenElement &&
      !document.mozFullScreenElement &&
      !document.webkitFullscreenElement &&
      !document.msFullscreenElement
    ) {
      // Currently NOT in fullscreen.
      if (fullscreen === false) {
        return;
      }

      // Try the standard then prefixed request methods.
      if (this._fTelnetContainer.requestFullscreen) {
        void this._fTelnetContainer.requestFullscreen();
      } else if (this._fTelnetContainer.msRequestFullscreen) {
        void this._fTelnetContainer.msRequestFullscreen();
      } else if (this._fTelnetContainer.mozRequestFullScreen) {
        void this._fTelnetContainer.mozRequestFullScreen();
      } else if (this._fTelnetContainer.webkitRequestFullscreen) {
        void this._fTelnetContainer.webkitRequestFullscreen();
      }
    } else {
      // Currently IN fullscreen.
      if (fullscreen === true) {
        return;
      }

      if (document.exitFullscreen) {
        void document.exitFullscreen();
      } else if (document.msExitFullscreen) {
        void document.msExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        void document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        void document.webkitExitFullscreen();
      }
    }
  }

  /**
   * Fetch fTelnet's proxy-server registry to override the host's
   * configured proxy details if needed. Only runs when the
   * configured ProxyHostname matches `.ftelnet.ca`.
   *
   * Original used callback-style XHR; migrated to async fetch
   * matching the pattern used elsewhere in the project. The
   * `_LoadingProxySettings` retry counter is unchanged — Connect()
   * still polls it via setTimeout.
   *
   * The 10-iteration retry budget means Connect() will wait up to
   * ~1 second for this fetch before giving up.
   */
  private LoadProxySettings(): void {
    if (this._Options.ProxyHostname === '') {
      return;
    }

    // Only override settings for fTelnet's own proxy servers.
    if (this._Options.ProxyHostname.toLowerCase().indexOf('.ftelnet.ca') === -1) {
      return;
    }

    this._LoadingProxySettings = 10;

    // Fire and forget — Connect() polls _LoadingProxySettings.
    void this.LoadProxySettingsFetch();
  }

  /** Async helper for LoadProxySettings. */
  private async LoadProxySettingsFetch(): Promise<void> {
    try {
      const response = await fetch('//embed-v2.ftelnet.ca/proxy-servers.json');
      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.log('failed to get proxy-servers.json, status=' + response.status);
        this._LoadingProxySettings = 0;
        return;
      }

      const proxies: Record<string, { Hostname: string; WsPort: number; WssPort: number; CNAME?: string } | undefined> =
        await response.json();
      let proxy = proxies[this._Options.ProxyHostname.toLowerCase()];

      // Handle CNAME redirects for retired proxies.
      if (proxy != null && proxy.CNAME != null) {
        proxy = proxies[proxy.CNAME];
      }

      if (proxy != null) {
        if (proxy.Hostname !== this._Options.ProxyHostname) {
          // eslint-disable-next-line no-console
          console.log(
            'Overriding ProxyHostname to ' +
              proxy.Hostname +
              ' (from ' +
              this._Options.ProxyHostname +
              ')'
          );
          this._Options.ProxyHostname = proxy.Hostname;
        }

        if (proxy.WsPort !== this._Options.ProxyPort) {
          // eslint-disable-next-line no-console
          console.log(
            'Overriding ProxyPort to ' + proxy.WsPort + ' (from ' + this._Options.ProxyPort + ')'
          );
          this._Options.ProxyPort = proxy.WsPort;
        }

        if (proxy.WssPort !== this._Options.ProxyPortSecure) {
          // eslint-disable-next-line no-console
          console.log(
            'Overriding ProxyPortSecure to ' +
              proxy.WssPort +
              ' (from ' +
              this._Options.ProxyPortSecure +
              ')'
          );
          this._Options.ProxyPortSecure = proxy.WssPort;
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('failed to get proxy-servers.json: ' + String(e));
    } finally {
      this._LoadingProxySettings = 0;
    }
  }

  // ───── ANSI escape sequence response handlers ─────
  //
  // These fire when the Ansi parser sees a sequence that needs a
  // reply back to the server. Each writes a response string via
  // the connection.

  /** DECRQCRA - copy rectangular area checksum reply. */
  private OnAnsiDECRQCRA(pid: number, x1: number, y1: number, x2: number, y2: number): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    this._Connection.writeString(this._Ansi.Checksum(pid, x1, y1, x2, y2));
  }

  /** ESC [c — terminal-type query. Reply identifies as a VTX-ish terminal. */
  private OnAnsiESC0c(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    this._Connection.writeString('\x1B[?50;86;84;88c'); // reply for VTX ;-)
  }

  /** ESC [5n — device status report. Reply: "device OK" (0). */
  private OnAnsiESC5n(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    this._Connection.writeString('\x1B[0n');
  }

  /** ESC [6n — cursor position report. */
  private OnAnsiESC6n(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    this._Connection.writeString(this._Ansi.CursorPosition());
  }

  /** ESC [8;rows;columns t — set terminal size. */
  private OnAnsiESC8t(columns: number, rows: number): void {
    if (this._Options.Emulation !== 'RIP') {
      this._Crt.SetScreenSize(columns, rows);
      this._Crt.SetFont(this._Crt.Font.Name);
    }
  }

  /** ESC [255n — query screen size in characters. */
  private OnAnsiESC255n(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    this._Connection.writeString(
      this._Ansi.CursorPosition(this._Crt.WindCols, this._Crt.WindRows)
    );
  }

  /** ESC Q — set font. */
  private OnAnsiESCQ(font: string): void {
    if (this._Options.Emulation !== 'RIP') {
      this._Crt.SetFont(font);
    }
  }

  /** RIP detection probe. Reply with the RIPscrip version banner. */
  private OnAnsiRIPDetect(): void {
    if (this._Options.Emulation === 'RIP') {
      if (this._Connection === undefined || !this._Connection.connected) {
        return;
      }
      this._Connection.writeString('RIPSCRIP015400');
    }
  }

  /** TODO (preserved): RIP.DisableParsing() not yet implemented. */
  private OnAnsiRIPDisable(): void {
    // TODO RIP.DisableParsing();
  }

  /** TODO (preserved): RIP.EnableParsing() not yet implemented. */
  private OnAnsiRIPEnable(): void {
    // TODO RIP.EnableParsing();
  }

  /** XTSRGA — query screen size in pixels (for graphical apps). */
  private OnAnsiXTSRGA(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    this._Connection.writeString(this._Ansi.ScreenSizeInPixels());
  }

  // ───── Connection lifecycle handlers ─────

  private OnConnectionClose(): void {
    this._StatusBar.connectButtonText = t(
      'status.button.reconnect',
      this._Options.Language as Language,
    );
    this._StatusBar.connectButtonVisible = true;

    this._StatusBar.statusText = tf(
      'status.disconnected',
      this._Options.Language as Language,
      { host: this._Options.Hostname + ':' + this._Options.Port },
    );
    this._StatusBar.state = 'error';
    this._ClientContainer.style.opacity = '0.5';

    // Tear down any in-progress ZMODEM session.
    if (this._ZModemReceive !== undefined) {
      this.endZModemReceive();
    }

    // Close the user manual if open. Per the agreed UX, the manual
    // is per-session: dismissed on disconnect, the user re-opens it
    // explicitly next session. We also reset the position state so
    // the next open re-centers fresh (in case the user had dragged
    // it off-screen).
    if (this._UserManual !== undefined) {
      this._UserManual.open = false;
      this._UserManual.resetPosition();
    }

    // Auto-reconnect: governed solely by the user's setting. When ON,
    // show the countdown popup on any disconnect — EXCEPT one the user
    // initiated via fTelnet's own Disconnect button (reconnecting right
    // after the user chose to disconnect would be nonsensical), and
    // except once the attempt budget is spent. When OFF (the default),
    // no popup ever appears. The toggle does exactly what it says; no
    // close-type heuristics second-guess the user's explicit choice.
    const wasUserInitiated = this._userInitiatedDisconnect;
    this._userInitiatedDisconnect = false;
    if (
      this._Options.AutoReconnect &&
      !wasUserInitiated &&
      this._Options.Hostname &&
      this._reconnectAttempt < fTelnetClient.MAX_RECONNECT_ATTEMPTS
    ) {
      this._reconnectAttempt += 1;
      this.showReconnectDialog(this._reconnectAttempt);
    }
  }

  private OnConnectionConnect(): void {
    this._Crt.ClrScr();

    // A successful connection clears the auto-reconnect attempt
    // budget, so any later unrelated drop starts fresh at attempt 1.
    this._reconnectAttempt = 0;

    // Make sure the ZMODEM auto-detector exists and is in a fresh
    // state. Stays alive across the whole session; resets after each
    // ZMODEM transfer so the next one auto-detects too.
    if (this._Options.ZModemAutoDetect) {
      this.ensureZModemDetector();
      this._ZModemDetector?.reset();
    }

    if (this._Options.ProxyHostname === '') {
      this._StatusBar.statusText = tf(
        'status.connected',
        this._Options.Language as Language,
        { host: this._Options.Hostname + ':' + this._Options.Port },
      );
      this._StatusBar.state = 'active';
      this._ClientContainer.style.opacity = '1.0';
    } else {
      this._StatusBar.statusText = tf(
        'status.connected.proxy',
        this._Options.Language as Language,
        {
          host: this._Options.Hostname + ':' + this._Options.Port,
          proxy: this._Options.ProxyHostname,
        },
      );
      this._StatusBar.state = 'active';
      this._ClientContainer.style.opacity = '1.0';
    }

    if (this._Options.ConnectionType === 'rlogin') {
      // rlogin handshake: NUL-separated (client username, server
      // username, terminal type) terminated by NUL.
      let TerminalType: string = this._Options.RLoginTerminalType;
      if (TerminalType === '') {
        TerminalType = this._Options.Emulation + '/' + this._Options.BitsPerSecond.toString();
      }

      if (this._Connection === undefined || !this._Connection.connected) {
        return;
      }
      this._Connection.writeString(
        String.fromCharCode(0) +
          this._Options.RLoginClientUsername +
          String.fromCharCode(0) +
          this._Options.RLoginServerUsername +
          String.fromCharCode(0) +
          TerminalType +
          String.fromCharCode(0)
      );
      this._Connection.flush();
    }

    if (this._Options.FullScreenOnConnect) {
      this.FullScreenToggle(true);
    }

    // TODO (preserved): if telnet, old fTelnet used to send will
    // sga, wont linemode, and will/wont echo based on localecho.
  }

  /**
   * Drain bytes from the connection into the Ansi or RIP parser,
   * with ZMODEM auto-detect interposed when Options.ZModemAutoDetect
   * is true (the default).
   *
   * Throttled to the configured BitsPerSecond rate so a very fast
   * server can't overwhelm the renderer. If there's leftover data
   * after one tick, schedules another OnConnectionData via a 0ms
   * setTimeout to keep draining without spinning.
   */
  private OnConnectionData(): void {
    // If _Timer is undefined we're in a YMODEM file transfer — let
    // YModem handle the bytes directly. (ZMODEM uses a different
    // pattern: bytes still flow through this method, the detector
    // intercepts them.)
    if (this._Timer !== undefined) {
      if (this._Connection !== undefined) {
        // Compute elapsed time and read accordingly to maintain
        // the throttle. Floor at 1ms to avoid divide-by-zero.
        let MSecElapsed: number = new Date().getTime() - this._LastTimer;
        if (MSecElapsed < 1) {
          MSecElapsed = 1;
        }

        let BytesToRead: number = Math.floor(
          this._Options.BitsPerSecond / 8 / (1000 / MSecElapsed)
        );
        if (BytesToRead < 1) {
          BytesToRead = 1;
        }

        const Data: string = this._Connection.readString(BytesToRead);
        if (Data.length > 0) {
          ZmDebug.bytes('wire', 'OnConnectionData read', Data);

          // Short post-abort drop. After the explicit drain in the
          // transfer-abort handler, this catches any small trickle
          // of bytes that arrives between the drain and the BBS's
          // post-abort prompt.
          if (this._PostAbortDropUntil > 0 && Date.now() < this._PostAbortDropUntil) {
            ZmDebug.log(
              'wire',
              `post-abort drop: ${Data.length} bytes ` +
                `(${this._PostAbortDropUntil - Date.now()}ms left)`,
            );
          } else {
            if (this._PostAbortDropUntil > 0) {
              this._PostAbortDropUntil = 0;
            }
            this.ondata.trigger(Data);
            if (this._ZModemSend !== undefined) {
              // Phase 5 Delta 2: a send is in progress. Inbound
              // bytes are the receiver's ACK/NAK/header responses;
              // they belong to the send state machine, not to the
              // ANSI renderer or the auto-detector. Route exclusive.
              const buf = new Uint8Array(Data.length);
              for (let i = 0; i < Data.length; i++) {
                buf[i] = Data.charCodeAt(i) & 0xff;
              }
              this._ZModemSend.feedBytes(buf);
            } else if (
              this._Options.ZModemAutoDetect &&
              this._ZModemDetector !== undefined
            ) {
              // Route through the detector. Its callbacks handle
              // both passthrough-to-ANSI and divert-to-ZMODEM.
              this._ZModemDetector.feed(Data);
            } else {
              // Detector disabled — go straight to the renderer.
              ZmDebug.log('wire', 'detector disabled/missing, going straight to renderer');
              this.routeToRenderer(Data);
            }
          }
        }

        if (this._Connection.bytesAvailable > 0) {
          // Schedule another tick to drain the rest.
          if (this._DataTimer !== undefined) {
            clearTimeout(this._DataTimer);
          }
          this._DataTimer = setTimeout((): void => {
            this.OnConnectionData();
          }, 0);
        }
      }
    }
    this._LastTimer = new Date().getTime();
  }

  /**
   * Send a chunk of received bytes to whichever renderer the
   * current emulation mode dictates (ANSI or RIP). Extracted as a
   * helper because both OnConnectionData (the normal path) and the
   * ZModemDetector's onPassthrough callback need it.
   */
  private routeToRenderer(Data: string): void {
    if (this._Options.Emulation === 'RIP') {
      this._RIP.Parse(Data);
    } else {
      this._Ansi.Write(Data);
    }
  }

  /**
   * Lazily create the ZMODEM auto-detector. Called from
   * OnConnectionConnect so the detector exists as soon as the
   * connection is established and stays alive across multiple
   * transfers (the detector resets after each session).
   *
   * Phase 4 Stage 6.
   */
  private ensureZModemDetector(): void {
    if (this._ZModemDetector !== undefined) return;
    this._ZModemDetector = new ZModemDetector({
      onPassthrough: (bytes: Uint8Array) => {
        // Convert byte array back to the byte-as-char string that
        // ANSI/RIP parsers expect. (This is how readString() came
        // out of the connection originally.)
        let s = '';
        for (let i = 0; i < bytes.length; i++) {
          s += String.fromCharCode(bytes[i]!);
        }
        this.routeToRenderer(s);
      },
      onTrigger: (initialBytes: Uint8Array) => {
        this.beginZModemReceive(initialBytes);
      },
      onZmodemBytes: (bytes: Uint8Array) => {
        this._ZModemReceive?.feedBytes(bytes);
      },
    });
  }

  /**
   * Spin up a ZModemReceive session on detector trigger and feed it
   * the initial trigger bytes (which are the first 6 bytes of the
   * sender's ZRQINIT frame).
   *
   * Phase 4 Stage 6.
   */
  private beginZModemReceive(initialBytes: Uint8Array): void {
    ZmDebug.log('client', 'beginZModemReceive — spinning up state machine');
    if (this._Connection === undefined) return;
    this._ZModemFileBuffers.clear();
    this._ZModemCurrentFile = undefined;

    // Phase 4 Stage 7 — bring up the progress panel.
    // The panel starts visible right away even though we don't have
    // a filename yet (ZRQINIT just arrived; ZFILE hasn't). The first
    // few hundred ms show "???" for the filename, then update as
    // soon as ZFILE's metadata subpacket is parsed.
    this._TransferStats = new TransferStats();
    this._TransferProgressPanel.reset();
    this._TransferProgressPanel.protocolName = 'ZMODEM'; // refined on first bin32 header
    this._TransferProgressPanel.fileName = '';
    this._TransferProgressPanel.fileNumber = 1;
    this._TransferProgressPanel.filesInBatch = 1;
    this._TransferProgressPanel.snapshot = this._TransferStats.snapshot();
    this._TransferProgressPanel.statusMessage = '';
    this._TransferProgressPanel.errorCount = 0;
    this._TransferProgressPanel.visible = true;
    // 10 Hz render clock — feeds the panel a fresh snapshot every
    // 100ms so the elapsed-time/CPS/ETA/errors fields keep ticking
    // even between subpacket arrivals. Cleared in endZModemReceive.
    this._TransferStatsTimer = setInterval((): void => {
      if (this._TransferStats !== undefined) {
        this._TransferProgressPanel.snapshot = this._TransferStats.snapshot();
      }
      // Pull the latest error count from the receive state machine.
      // We could plumb this through onProgress instead, but a pull
      // on the render tick is simpler and matches how the panel
      // already gets its other stats.
      if (this._ZModemReceive !== undefined) {
        this._TransferProgressPanel.errorCount = this._ZModemReceive.errorCount;
      }
    }, 100);

    this._ZModemReceive = new ZModemReceive({
      onBytesToSend: (bytes) => {
        if (this._Connection !== undefined && this._Connection.connected) {
          // Connection.writeBytes wants a ByteArray; convert.
          for (let i = 0; i < bytes.length; i++) {
            this._Connection.writeByte(bytes[i]!);
          }
          this._Connection.flush();
        }
      },
      onFileStart: (file) => {
        this._ZModemCurrentFile = file;
        this._ZModemFileBuffers.set(file.name, []);
        // Update the panel for the new file. fileNumber/filesInBatch
        // come from the ZFILE metadata when provided (Stage 4 parses
        // them); senders that don't supply send 1/1 which is fine.
        this._TransferProgressPanel.fileName = file.name;
        this._TransferProgressPanel.fileNumber = file.fileNumber;
        this._TransferProgressPanel.filesInBatch = file.filesInBatch;
        // By the time onFileStart fires, the ZFILE header has been
        // processed and useCrc32 reflects whether the sender went
        // bin32 (Synchronet, Mystic, most modern senders) or stuck
        // to bin16 (some older DOS senders).
        this._TransferProgressPanel.protocolName = this._ZModemReceive?.useCrc32
          ? 'ZMODEM-CRC32'
          : 'ZMODEM-CRC16';
        this._TransferStats?.reset(file.size);
      },
      onFileData: (chunk) => {
        if (this._ZModemCurrentFile === undefined) return;
        const buf = this._ZModemFileBuffers.get(this._ZModemCurrentFile.name);
        if (buf === undefined) return;
        // Phase 5 polish: push the Uint8Array chunk reference
        // directly. The previous per-byte `buf.push(chunk[i])`
        // loop was the main contributor to the multi-second UI
        // freeze on large transfers. One push per subpacket
        // (typically ~1024 bytes) is dramatically cheaper than
        // 1024 pushes per subpacket.
        //
        // Note: we keep the reference, not a copy. ZModemReceive
        // is responsible for not mutating chunks after dispatch.
        buf.push(chunk);
      },
      onProgress: (received, total) => {
        // Feed the stats engine. The 10 Hz render clock picks up
        // the new state on its next tick. We could push a snapshot
        // immediately here, but the rendering clock keeps things
        // consistent — no need to also re-render on every subpacket.
        this._TransferStats?.update(received, total);
      },
      onFileComplete: (file) => {
        const chunks = this._ZModemFileBuffers.get(file.name);
        if (chunks === undefined || chunks.length === 0) return;
        // Phase 5 polish: Blob's constructor accepts an array of
        // BlobParts (including Uint8Array) and concatenates them
        // natively in browser-internal C++ — no JavaScript-level
        // copy loop. The previous code was
        // `new Blob([new Uint8Array(numberArray)])` which forced a
        // per-element copy of every byte through a JS-level
        // Uint8Array constructor call. With the chunks-array
        // approach the entire save step is one Blob allocation,
        // no copies.
        //
        // TS cast note: in TS 5.7+ `Uint8Array` became generic over
        // its backing buffer (ArrayBuffer | SharedArrayBuffer), and
        // Blob's BlobPart type only accepts ArrayBuffer-backed
        // arrays. Our chunks always come from ZModemDecoder which
        // allocates plain Uint8Array (ArrayBuffer-backed), so the
        // cast is safe.
        const blob = new Blob(chunks as BlobPart[]);
        saveAs(blob, file.name);
        this._ZModemFileBuffers.delete(file.name);
      },
      onSessionComplete: () => {
        // Pin the panel at "Complete!" with the bar at 100% for
        // ~1500ms so the user actually sees the result, then the
        // panel's `transfer-linger-done` event hides it.
        this._TransferProgressPanel.markComplete();
        this.endZModemReceive();
      },
      onError: (msg) => {
        // eslint-disable-next-line no-console
        console.warn('ZMODEM transfer error:', msg);
        // Surface the error in the panel's status line and let the
        // linger handle hiding. For now we treat any error as a
        // session end — no retry UI.
        this._TransferProgressPanel.statusMessage = msg;
        this._TransferProgressPanel.markComplete();
        this.endZModemReceive();
      },
    });

    // Feed the trigger bytes — they are the first 6 bytes of the
    // sender's ZRQINIT, which the receive state machine's
    // handleZRQINIT will recognize and respond to with ZRINIT.
    this._ZModemReceive.feedBytes(initialBytes);
  }

  /**
   * Tear down an active ZMODEM session and reset the detector so
   * it's ready to watch for the next trigger. Bytes that arrive
   * after this point flow normally through the ANSI parser.
   *
   * Phase 4 Stage 6.
   */
  private endZModemReceive(): void {
    this._ZModemReceive = undefined;
    this._ZModemCurrentFile = undefined;
    this._ZModemFileBuffers.clear();
    this._ZModemDetector?.reset();
    // Phase 4 Stage 7 — tear down the stats render clock. The panel
    // itself stays visible if `markComplete` was called (the linger
    // is handling the fade); the `transfer-linger-done` listener
    // hides it. If the session ended without markComplete (an
    // immediate failure), hide the panel directly.
    if (this._TransferStatsTimer !== undefined) {
      clearInterval(this._TransferStatsTimer);
      this._TransferStatsTimer = undefined;
    }
    this._TransferStats = undefined;
  }

  /**
   * Phase 5 Delta 2 — start a ZMODEM upload for `file`.
   *
   * Mirror of beginZModemReceive but for outbound: reads each File
   * into a Uint8Array via FileReader, constructs a ZModemFileToSend
   * per file, spins up a single ZModemSend state machine wired to
   * the same progress panel + TransferStats engine the receive path
   * uses.
   *
   * Multi-file batches (Phase 5 Delta 3) are sent sequentially in a
   * single ZMODEM session — ZMODEM's native batch flow handles them
   * via ZFILE → ZDATA → ZEOF → ZRINIT → next ZFILE → ... cycles.
   *
   * Inbound bytes from the wire (the receiver's ACK/NAK/header
   * responses) are routed to ZModemSend.feedBytes by
   * OnConnectionData's send-active branch — see the "if
   * _ZModemSend !== undefined" check there.
   *
   * Critical timing: the BBS may have already sent ZRINIT before
   * the user clicked Send (because the BBS engaged its ZMODEM
   * receiver as soon as the user selected Zmodem BATCH at the
   * protocol picker). We have to capture those bytes; if they
   * arrive while FileReader is async-reading the files they'll be
   * lost to the ANSI renderer.
   *
   * Delta 2.1 fix: spin up the state machine SYNCHRONOUSLY first
   * (still in IDLE state — doesn't send anything yet), then start
   * the FileReader(s). Any bytes arriving during the file read
   * will route to ZModemSend.feedBytes (the decoder ignores them
   * gracefully while in IDLE). Then once ALL files are loaded we
   * actually call `.start()` to begin the handshake.
   *
   * Also drains any bytes sitting in the _InputBuffer at the
   * moment of click — those are very likely to be the BBS's
   * already-sent ZRINIT, and we want them to go to the state
   * machine, not the renderer.
   */
  private _beginZModemSend(files: File[]): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    if (files.length === 0) return;

    // Spin up the progress panel immediately for visible feedback,
    // even though bytes haven't started flowing yet. Initialize
    // with the FIRST file's stats — the panel will update per-file
    // via onFileStart as the batch progresses.
    const firstFile = files[0]!;
    this._TransferStats = new TransferStats();
    this._TransferStats.reset(firstFile.size);
    this._TransferProgressPanel.reset();
    this._TransferProgressPanel.direction = 'send';
    this._TransferProgressPanel.protocolName = 'ZMODEM';
    this._TransferProgressPanel.fileName = firstFile.name;
    this._TransferProgressPanel.fileNumber = 1;
    this._TransferProgressPanel.filesInBatch = files.length;
    this._TransferProgressPanel.snapshot = this._TransferStats.snapshot();
    this._TransferProgressPanel.statusMessage =
      files.length === 1 ? 'Reading file...' : `Reading ${files.length} files...`;
    this._TransferProgressPanel.errorCount = 0;
    this._TransferProgressPanel.visible = true;

    // Construct the state machine NOW (synchronously). It starts
    // in IDLE state and won't send anything until we call .start().
    // But its existence flips the OnConnectionData routing branch,
    // so any inbound bytes during the file read will go to feedBytes
    // instead of leaking through to the renderer.
    //
    // We construct with an empty files array initially; we'll
    // replace the state machine entirely once the files are loaded.
    // (ZModemSend's _files is private and there's no public setter,
    // but that's fine — the placeholder never gets to .start() so
    // its empty files array is never consulted.)
    this._ZModemSend = new ZModemSend([], {
      onBytesToSend: () => { /* placeholder, not started yet */ },
    });

    // Drain any bytes already sitting in the input buffer. These
    // are very likely the BBS's ZRINIT (already sent because we
    // selected Zmodem at the protocol picker). Feeding them now
    // primes the decoder; though since this placeholder ZModemSend
    // is going to be replaced, the actual usefulness here is to
    // PREVENT them from reaching the renderer between now and
    // when the real ZModemSend is set up. The decoder will see
    // them but ignore them (placeholder is in IDLE).
    if (this._Connection.bytesAvailable > 0) {
      const drain = this._Connection.readString(this._Connection.bytesAvailable);
      ZmDebug.log('client', `_beginZModemSend pre-drained ${drain.length} bytes`);
    }

    // Read every file in parallel into a Uint8Array. Promise.all
    // resolves when all reads complete; any failure aborts the
    // whole batch (the user re-drops to try again).
    const readPromises: Promise<Uint8Array>[] = files.map(
      (file) =>
        new Promise<Uint8Array>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (): void => {
            resolve(new Uint8Array(reader.result as ArrayBuffer));
          };
          reader.onerror = (): void => {
            reject(reader.error ?? new Error(`Failed to read ${file.name}`));
          };
          reader.readAsArrayBuffer(file);
        }),
    );

    Promise.all(readPromises).then(
      (byteArrays) => {
        this._startZModemSendWithBytes(files, byteArrays);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[fTelnetClient] FileReader error reading upload file(s):', err);
        this._TransferProgressPanel.statusMessage = 'Failed to read file';
        this._TransferProgressPanel.markComplete();
        this._ZModemSend = undefined;
      },
    );
  }

  /**
   * Second half of _beginZModemSend, factored out because it has
   * to wait for FileReader to finish. By the time this runs we
   * have every file's full contents as Uint8Arrays.
   *
   * Replaces the placeholder ZModemSend set up in _beginZModemSend
   * with the real one (now that we have the file bytes to feed it),
   * then calls .start() to kick off the protocol handshake.
   */
  private _startZModemSendWithBytes(
    files: File[],
    byteArrays: Uint8Array[],
  ): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }

    this._TransferProgressPanel.statusMessage = '';

    // 10 Hz render clock for the panel's CPS / ETA / elapsed-time
    // fields. Cleared in _endZModemSend.
    this._TransferStatsTimer = setInterval((): void => {
      if (this._TransferStats !== undefined) {
        this._TransferProgressPanel.snapshot = this._TransferStats.snapshot();
      }
    }, 100);

    // Build the per-file payload list. The ZModemSend constructor
    // takes one array; ZMODEM's batch flow handles iteration via
    // its internal _fileIndex.
    const filesToSend: ZModemFileToSend[] = files.map((file, i) => ({
      name: file.name,
      data: byteArrays[i]!,
      mtime: new Date(file.lastModified),
      mode: 0,
    }));

    // Track which file we're on (1-indexed for display). The
    // onFileStart callback fires once per file as the protocol
    // advances past each ZFILE header.
    let currentFileNumber = 0;

    // Replace the placeholder with the real state machine. Note:
    // any bytes that arrived during FileReader and were fed to
    // the placeholder are LOST — but the placeholder was in IDLE
    // so it wouldn't have parsed them into useful state anyway.
    // The BBS will retransmit on timeout.
    this._ZModemSend = new ZModemSend(filesToSend, {
      onBytesToSend: (out) => {
        if (this._Connection !== undefined && this._Connection.connected) {
          for (let i = 0; i < out.length; i++) {
            this._Connection.writeByte(out[i]!);
          }
          this._Connection.flush();
        }
      },
      onFileStart: (f) => {
        currentFileNumber++;
        this._TransferProgressPanel.fileName = f.name;
        this._TransferProgressPanel.fileNumber = currentFileNumber;
        this._TransferProgressPanel.filesInBatch = filesToSend.length;
        this._TransferStats?.reset(f.data.length);
      },
      onProgress: (sent, total) => {
        this._TransferStats?.update(sent, total);
      },
      onFileComplete: () => {
        // Per-file done. For multi-file batches this fires
        // between files; for single-file it fires once right
        // before onSessionComplete. Nothing extra to do here —
        // the next onFileStart will update the panel.
      },
      onSessionComplete: () => {
        this._TransferProgressPanel.markComplete();
        this._endZModemSend();
      },
      onError: (msg) => {
        // eslint-disable-next-line no-console
        console.warn('ZMODEM send error:', msg);
        this._TransferProgressPanel.statusMessage = msg;
        this._TransferProgressPanel.markComplete();
        this._endZModemSend();
      },
    });

    this._ZModemSend.start();
  }

  /**
   * Tear down an active ZMODEM send session. Mirror of
   * endZModemReceive — clears the state machine, the panel render
   * clock, and the stats.
   */
  private _endZModemSend(): void {
    this._ZModemSend = undefined;
    if (this._TransferStatsTimer !== undefined) {
      clearInterval(this._TransferStatsTimer);
      this._TransferStatsTimer = undefined;
    }
    this._TransferStats = undefined;
    // Reset direction back to receive for the next session — the
    // panel defaults to 'receive', and beginZModemReceive doesn't
    // reset it explicitly, so we have to.
    this._TransferProgressPanel.direction = 'receive';
  }

  /**
   * YMODEM-G upload adapter (Phase 5). Reads each picked File into
   * a FileRecord, then queues them through YModemSend.
   *
   * Unlike the ZMODEM path, YModemSend uses its OWN in-canvas
   * CrtPanel progress dialog (the original 2017-era progress UI),
   * runs its own polling timer, and routes its outbound bytes
   * through the WebSocketConnection directly. So we don't touch
   * `_TransferProgressPanel` or `_TransferStats` here — those are
   * the new Lit-based panel used by the ZMODEM path.
   *
   * Multi-file batch: YModemSend's public `Upload(file, fileCount)`
   * expects the caller to queue every file in the batch with the
   * same fileCount; on the call where `_Files.length === fileCount`
   * the state machine kicks off. So we queue all files in a tight
   * loop after the FileReader resolves.
   *
   * Phase 5.
   */
  private _beginYModemSend(files: File[]): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    if (files.length === 0) return;

    // Read every file in parallel into a Uint8Array. Mirrors the
    // ZMODEM path's reader logic. Failure aborts the whole batch.
    const readPromises: Promise<Uint8Array>[] = files.map(
      (file) =>
        new Promise<Uint8Array>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (): void => {
            resolve(new Uint8Array(reader.result as ArrayBuffer));
          };
          reader.onerror = (): void => {
            reject(reader.error ?? new Error(`Failed to read ${file.name}`));
          };
          reader.readAsArrayBuffer(file);
        }),
    );

    Promise.all(readPromises).then(
      (byteArrays) => {
        if (this._Connection === undefined || !this._Connection.connected) {
          return;
        }
        // Build the YModemSend instance and queue every file. The
        // state machine kicks off when the last file is queued
        // (see YModemSend.Upload: `if (_Files.length === fileCount)`).
        const ymodemSend = new YModemSend(this._Crt, this._Connection);
        // The main poll timer needs to be paused while YModemSend
        // runs its own — mirror of what Download() does for receive.
        if (this._Timer !== undefined) {
          clearInterval(this._Timer);
          this._Timer = undefined;
        }
        ymodemSend.ontransfercomplete.on((): void => {
          this.OnDownloadComplete();
        });
        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          const bytes = byteArrays[i]!;
          const record = new FileRecord(file.name, bytes.length);
          for (let j = 0; j < bytes.length; j++) {
            record.data.writeByte(bytes[j]!);
          }
          // Reset the read cursor so YModemSend's reader starts
          // at offset 0.
          record.data.position = 0;
          ymodemSend.Upload(record, files.length);
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn(
          '[fTelnetClient] FileReader error reading YMODEM upload file(s):',
          err,
        );
      },
    );
  }

  private OnConnectionLocalEcho(value: boolean): void {
    if (this._Options.NegotiateLocalEcho) {
      this._Options.LocalEcho = value;
      this._Crt.LocalEcho = value;
    }
  }

  private OnConnectionIOError(): void {
    // eslint-disable-next-line no-console
    console.log('fTelnet.OnConnectionIOError');
  }

  private OnConnectionSecurityError(): void {
    this._StatusBar.connectButtonText = t(
      'status.button.retry',
      this._Options.Language as Language,
    );
    this._StatusBar.connectButtonVisible = true;

    if (this._Options.ProxyHostname === '') {
      this._StatusBar.statusText = tf(
        'status.unable',
        this._Options.Language as Language,
        { host: this._Options.Hostname + ':' + this._Options.Port },
      );
      this._StatusBar.state = 'error';
      this._ClientContainer.style.opacity = '0.5';
    } else {
      this._StatusBar.statusText = tf(
        'status.unable.proxy',
        this._Options.Language as Language,
        {
          host: this._Options.Hostname + ':' + this._Options.Port,
          proxy: this._Options.ProxyHostname,
        },
      );
      this._StatusBar.state = 'error';
      this._ClientContainer.style.opacity = '0.5';
    }
  }

  // ───── Crt event handlers ─────

  /**
   * Drain pending keypress events from the Crt and write each one
   * out to the connection (with the configured Enter translation).
   *
   * Skipped during YModem transfers (Crt's queue stays full of
   * keypresses that YModem watches for Ctrl+X aborts).
   */
  private OnCrtKeyPressed(): void {
    // TODO (preserved): maybe handle CTRL-X to abort here instead
    // of in the YModem classes.
    if (this._Timer !== undefined) {
      while (this._Crt.KeyPressed()) {
        const KPE: KeyPressEvent | undefined = this._Crt.ReadKey();
        if (KPE !== undefined && KPE.keyString.length > 0) {
          if (this._Connection !== undefined && this._Connection.connected) {
            if (KPE.keyString === '\r\n') {
              // Translate CR-LF to the configured Enter string
              // (\r for ANSI, \x9B for Atari, etc.).
              this._Connection.writeString(this._Options.Enter);
            } else {
              this._Connection.writeString(KPE.keyString);
            }
          }
        }
      }
    }
  }

  private OnCrtMouseReport(position: string): void {
    if (this._Connection !== undefined && this._Connection.connected) {
      this._Connection.writeString(position);
    }
  }

  /**
   * Recompute layout when the Crt's screen size / font changes.
   * Sizes the focus bar, scrollback bar, status bar, and chooses
   * an appropriately-sized keyboard CSS file.
   */
  private OnCrtScreenSizeChanged(): void {
    let NewWidth = 0;
    let NewHeight = 0;

    if (this._Options.Emulation === 'RIP') {
      NewWidth = 640;
    } else {
      NewHeight = this._Crt.ScreenRows * this._Crt.Font.Height;

      if (this._UseModernScrollback) {
        // Modern scrollback uses real DOM scrolling, so the client
        // container needs explicit dimensions (which include the
        // scrollbar gutter on the right).
        NewWidth = this._Crt.ScreenCols * this._Crt.Font.Width + GetScrollbarWidth.Width;
        this._ClientContainer.style.width = NewWidth + 'px';
        this._ClientContainer.style.height = NewHeight + 'px';
        this._ClientContainer.scrollTop = this._ClientContainer.scrollHeight;
      } else {
        // Classic scrollback: explicit width/height so the border
        // hugs the canvas with no whitespace.
        NewWidth = this._Crt.ScreenCols * this._Crt.Font.Width;
        this._ClientContainer.style.width = NewWidth + 'px';
        this._ClientContainer.style.height = NewHeight + 'px';
      }
    }

    // TODO (preserved): -10 is 5px of left and right padding —
    // should not be hardcoded since the .css can override it.
    if (this._FocusWarningBar !== undefined) {
      this._FocusWarningBar.widthPx = NewWidth - 10;
    }
    if (this._ScrollbackBar !== undefined) {
      this._ScrollbackBar.widthPx = NewWidth - 10;
    }
    if (this._StatusBar !== undefined) {
      this._StatusBar.widthPx = NewWidth - 10;
    }

    // Pick an appropriate keyboard CSS file based on screen size.
    // TODOX (preserved): really should build a dynamic keyboard
    // that auto-resizes to the available space.
    if (
      document.getElementById('fTelnetScript') !== null &&
      document.getElementById('fTelnetKeyboardCss') !== null
    ) {
      const KeyboardSizes: number[] = [960, 800, 720, 640, 560, 480, 360, 320];
      for (let i = 0; i < KeyboardSizes.length; i++) {
        // The screen-width check ensures phones use the 360 or
        // 320 file even if the crt would technically fit a wider
        // keyboard.
        if (
          (NewWidth >= KeyboardSizes[i]! && KeyboardSizes[i]! <= screen.width) ||
          i === KeyboardSizes.length - 1
        ) {
          (document.getElementById('fTelnetKeyboardCss') as HTMLLinkElement).href =
            StringUtils.GetUrl(
              'keyboard/keyboard-' + KeyboardSizes[i]!.toString(10) + '.min.css'
            );
          break;
        }
      }
    }
  }

  private OnDownloadComplete(): void {
    // Restart the main poll timer.
    this._Timer = setInterval((): void => {
      this.OnTimer();
    }, 250);
  }

  /**
   * Show/hide the popup menu. Pass null as the event arg to close
   * without repositioning (used after a dropdown selection).
   */
  /**
   * Toggle the popup menu open/closed in response to a click on
   * the status bar's Menu button. Sets `pageX`/`pageY` on the
   * component so it positions itself near the click.
   *
   * History: Phase 1 widened this from `MouseEvent` to
   * `MouseEvent | null` because the screen-size dropdown's
   * `change` handler called it with null to mean "close without
   * repositioning." Phase 2 Stage 4 widened further to
   * `{ pageX, pageY } | null` because the status bar now
   * dispatches a structured MenuClickDetail rather than the raw
   * MouseEvent. Phase 2 Stage 5 narrowed back to non-null
   * `{ pageX, pageY }`: the screen-size-change handler now
   * closes the popup directly via `this._MenuButtons.open = false`,
   * so the null branch no longer has any callers.
   */
  private OnMenuButtonClick(e: { pageX: number; pageY: number }): void {
    if (this._MenuButtons.open) {
      this._MenuButtons.open = false;
    } else {
      this._MenuButtons.pageX = e.pageX;
      this._MenuButtons.pageY = e.pageY;
      this._MenuButtons.open = true;
    }
  }

  /**
   * Open the settings panel, positioned near where the menu was
   * (same coordinates the menu popup used). Closes the menu so
   * the two don't visually overlap.
   *
   * Triggered by the 'settings' menu-action, which fires when the
   * user clicks "Settings..." in the menu popup.
   */
  private OpenSettings(): void {
    this._MenuButtons.open = false;
    this._SettingsPanel.pageX = this._MenuButtons.pageX;
    this._SettingsPanel.pageY = this._MenuButtons.pageY;
    this._SettingsPanel.currentTheme = this._Options.Theme;
    this._SettingsPanel.muted = this._Options.MuteSounds;
    this._SettingsPanel.localEcho = this._Options.LocalEcho;
    this._SettingsPanel.autoReconnect = this._Options.AutoReconnect;
    this._SettingsPanel.vibrateDuration = this._Options.VirtualKeyboardVibrateDuration;
    this._SettingsPanel.zmodemAutoDetect = this._Options.ZModemAutoDetect;
    this._SettingsPanel.defaultProtocol = this._Options.DefaultTransferProtocol;
    this._SettingsPanel.language = this._Options.Language as Language;
    this._SettingsPanel.open = true;
  }

  /**
   * Open the user manual popup. Lazily creates the component on
   * first call; subsequent calls just toggle `open=true` again.
   * Lives on document.body (like FDropOverlay) so the popup can
   * float freely over the entire page, not constrained to the
   * fTelnet container.
   *
   * Closes the main menu before opening, since the manual is its
   * own independent surface — once open, it stays open until the
   * user dismisses it or the session disconnects.
   *
   * Triggered by the 'user-manual' menu-action, which fires when
   * the user clicks "Manual" in the menu popup.
   */
  private OpenUserManual(): void {
    this._MenuButtons.open = false;
    if (this._UserManual === undefined) {
      this._UserManual = document.createElement(
        'f-user-manual',
      ) as FUserManual;
      // Theme attribute set directly since the manual lives on
      // document.body outside the themed container — matches the
      // pattern for FDropOverlay above.
      this._UserManual.setAttribute('data-theme', this._Options.Theme);
      this._UserManual.addEventListener('manual-close', (): void => {
        if (this._UserManual !== undefined) {
          this._UserManual.open = false;
        }
      });
      document.body.appendChild(this._UserManual);
    }
    this._UserManual.open = true;
  }

  /**
   * Show a themed informational dialog — the replacement for raw
   * alert() on user-facing info messages. Lazily creates the
   * <f-info-dialog> on first use, then reuses it. Lives on
   * document.body (like the other floating popups) so it can sit
   * above everything regardless of container clipping.
   *
   * Acknowledge-only: OK / Escape / Enter / click-outside all
   * dismiss it. Phase 5 (beta.4).
   */
  private showInfoDialog(title: string, message: string): void {
    if (this._InfoDialog === undefined) {
      this._InfoDialog = document.createElement(
        'f-info-dialog',
      ) as FInfoDialog;
      this._InfoDialog.setAttribute('data-theme', this._Options.Theme);
      this._InfoDialog.addEventListener('info-dialog-close', (): void => {
        if (this._InfoDialog !== undefined) {
          this._InfoDialog.open = false;
        }
      });
      document.body.appendChild(this._InfoDialog);
    }
    // Keep the theme current in case it changed since last shown.
    this._InfoDialog.setAttribute('data-theme', this._Options.Theme);
    this._InfoDialog.language = this._Options.Language as Language;
    this._InfoDialog.dialogTitle = title;
    this._InfoDialog.message = message;
    this._InfoDialog.open = true;
  }

  /**
   * Themed yes/no confirmation, replacing the browser's unthemed
   * native confirm(). Lazily creates the <f-confirm-dialog> on first
   * use, then reuses it. Lives on document.body like the other
   * floating popups so it sits above everything regardless of
   * container clipping. Phase 5 (beta.22).
   *
   * Returns a Promise that resolves true if the user confirmed
   * (OK / Enter) or false if they cancelled (Cancel / Escape /
   * click-outside). One result handler is registered per call and
   * removed once it fires, so concurrent/repeat opens don't leak or
   * cross-resolve.
   */
  private showConfirmDialog(title: string, message: string): Promise<boolean> {
    if (this._ConfirmDialog === undefined) {
      this._ConfirmDialog = document.createElement(
        'f-confirm-dialog',
      ) as FConfirmDialog;
      document.body.appendChild(this._ConfirmDialog);
    }
    const dialog = this._ConfirmDialog;
    // Keep the theme current in case it changed since last shown.
    dialog.setAttribute('data-theme', this._Options.Theme);
    dialog.language = this._Options.Language as Language;
    dialog.dialogTitle = title;
    dialog.message = message;

    return new Promise<boolean>((resolve) => {
      const handler = (e: Event): void => {
        dialog.removeEventListener('confirm-dialog-result', handler);
        dialog.open = false;
        const detail = (e as CustomEvent<{ confirmed: boolean }>).detail;
        resolve(detail.confirmed);
      };
      dialog.addEventListener('confirm-dialog-result', handler);
      dialog.open = true;
    });
  }

  /**
   * Show the auto-reconnect countdown popup after an unexpected
   * disconnect. Counts down 5s; on expiry it reconnects via
   * Connect(), on Cancel it closes and leaves the normal
   * disconnected state (already applied by OnConnectionClose) in
   * place. Lazy-creates the dialog on first use, like the others.
   *
   * `attempt` is the 1-based attempt number, shown as
   * "Attempts: n of N". The cap itself is enforced at the call site
   * (OnConnectionClose), which won't call this once the budget is
   * spent. Cancelling resets the budget so a later manual reconnect
   * starts fresh.
   */
  private showReconnectDialog(attempt: number): void {
    if (this._ReconnectDialog === undefined) {
      this._ReconnectDialog = document.createElement(
        'f-reconnect-dialog',
      ) as FReconnectDialog;
      document.body.appendChild(this._ReconnectDialog);
    }
    const dialog = this._ReconnectDialog;
    dialog.setAttribute('data-theme', this._Options.Theme);
    dialog.language = this._Options.Language as Language;
    dialog.seconds = 5;
    dialog.attempt = attempt;
    dialog.maxAttempts = fTelnetClient.MAX_RECONNECT_ATTEMPTS;

    const handler = (e: Event): void => {
      dialog.removeEventListener('reconnect-dialog-result', handler);
      dialog.open = false;
      const detail = (e as CustomEvent<{ reconnect: boolean }>).detail;
      if (detail.reconnect) {
        this.Connect();
      } else {
        // Cancelled: the user is done auto-reconnecting. Clear the
        // attempt budget so a fresh manual reconnect (or a later
        // unrelated drop) starts again at attempt 1. The disconnected
        // state from OnConnectionClose stays in place.
        this._reconnectAttempt = 0;
      }
    };
    dialog.addEventListener('reconnect-dialog-result', handler);
    dialog.open = true;
  }

  /**
   * Switch the active theme at runtime. Updates the `data-theme`
   * attribute on the container, the menu popup, and the settings
   * panel — all the places we set it at construction time.
   *
   * Wired to the settings panel's `settings-theme-change` event.
   * Persistence (localStorage write) happens in the event handler;
   * this method just changes what's visible on the page.
   */
  private ApplyTheme(theme: string): void {
    this._Options.Theme = theme;
    this._fTelnetContainer.setAttribute('data-theme', theme);
    this._MenuButtons.setAttribute('data-theme', theme);
    this._SettingsPanel.setAttribute('data-theme', theme);
    // These three components also live on document.body (outside
    // the themed container), so they need the attribute set
    // directly. Without this, switching themes at runtime via the
    // settings panel would leave the upload-confirm dialog, the
    // file-drop overlay, and the transfer-progress panel rendering
    // with the *previous* theme until the next page load.
    if (this._UploadConfirm !== undefined) {
      this._UploadConfirm.setAttribute('data-theme', theme);
    }
    if (this._DropOverlay !== undefined) {
      this._DropOverlay.setAttribute('data-theme', theme);
    }
    if (this._TransferProgressPanel !== undefined) {
      this._TransferProgressPanel.setAttribute('data-theme', theme);
    }
    if (this._UserManual !== undefined) {
      this._UserManual.setAttribute('data-theme', theme);
    }
  }

  /**
   * Per-tick housekeeping: focus tracking and (for modern
   * scrollback) showing/hiding the scrollback bar based on
   * scroll position.
   */
  private OnTimer(): void {
    if (this._Connection !== undefined && this._Connection.connected) {
      if (document.hasFocus() && !this._HasFocus) {
        this._HasFocus = true;
        this._FocusWarningBar.visible = false;
      } else if (!document.hasFocus() && this._HasFocus) {
        this._HasFocus = false;
        this._FocusWarningBar.visible = true;
      }
    } else {
      if (this._FocusWarningBar.visible) {
        this._FocusWarningBar.visible = false;
      }
    }

    // Modern scrollback: show/hide the scrollback bar based on
    // whether the user has scrolled up at all.
    if (this._UseModernScrollback) {
      const ScrolledUp =
        this._ClientContainer.scrollHeight -
          this._ClientContainer.scrollTop -
          this._ClientContainer.clientHeight >
        1;
      if (ScrolledUp && !this._ScrollbackBar.visible) {
        this._ScrollbackBar.visible = true;
      } else if (!ScrolledUp && this._ScrollbackBar.visible) {
        this._ScrollbackBar.visible = false;
      }
    }
  }

  /**
   * Fires when the hidden file input changes (user picked files
   * via Menu → Upload...). Phase 5: instead of starting YMODEM
   * immediately, feeds the first file into the upload confirm
   * dialog so the user can verify before any bytes go to the wire.
   *
   * Single-file only (Q7 of Phase 5 planning: multi-file deferred).
   * If the user picked multiple files, only the first is used.
   *
   * The old YModem-based code path (UploadFile + _YModemSend) is
   * preserved as `_legacyUploadFileSelectedYModem` for reference
   * and possible future revival; not currently called.
   */
  public OnUploadFileSelected(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }
    if (
      this._UploadInput.files === null ||
      this._UploadInput.files.length === 0
    ) {
      return;
    }
    // The menu-driven file picker uses a hidden <input type=file
    // multiple>, so the user can ctrl-click or shift-click to pick
    // multiple files in one shot. Collect them all into an array.
    const picked: File[] = [];
    for (let i = 0; i < this._UploadInput.files.length; i++) {
      const f = this._UploadInput.files.item(i);
      if (f !== null) picked.push(f);
    }
    // Clear the input so picking the same file twice fires a new
    // change event (browsers suppress no-change selections).
    this._UploadInput.value = '';
    this._beginUploadFlow(picked);
  }

  /**
   * Start the upload flow for one or more selected files. Common
   * entry point for both drag-and-drop (via _DropOverlay's
   * `drop-file-selected` event) and the menu picker (via
   * _UploadInput's change → above).
   *
   * Shows the confirm dialog. The dialog dispatches `upload-confirm`
   * (Send clicked) with the full file list, at which point
   * _beginZModemSend reads all files and starts a single batched
   * ZModemSend session.
   */
  private _beginUploadFlow(files: File[]): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      // Not connected — nothing to send to. Silent return matches
      // the existing behavior of Upload() in this case.
      return;
    }
    if (files.length === 0) return;
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }
    this._UploadConfirm.files = files;
    this._UploadConfirm.open = true;
  }

  // Note: The YModem-based upload path (UploadFile + _YModemSend)
  // is no longer called from anywhere. Phase 5 routes uploads
  // through _beginUploadFlow → confirm dialog → ZModemSend (Delta 2).
  // The dead code is preserved below for reference; if it's still
  // dead after Delta 2 ships, we can remove it entirely.

  /**
   * Push text directly onto the Crt's synthetic-key queue.
   * Useful for autologin / paste-style integrations.
   */
  public StuffInputBuffer(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this._Crt.PushKeyPress(text.charCodeAt(i), 0, false, false, false);
    }
  }

  /**
   * Open the file picker. The change event handler (set up in the
   * constructor) wires the rest.
   */
  public Upload(): void {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }

    this._UploadInput.click();
  }

  // ───── Public getters/setters ─────

  public get VirtualKeyboardVibrateDuration(): number {
    return this._Options.VirtualKeyboardVibrateDuration;
  }

  public set VirtualKeyboardVibrateDuration(value: number) {
    this._Options.VirtualKeyboardVibrateDuration = value;
    this._VirtualKeyboard.vibrateDuration = value;
  }

  // TODOX (preserved): ideally this would be a ToggleVirtualKeyboard().
  public get VirtualKeyboardVisible(): boolean {
    return this._Options.VirtualKeyboardVisible;
  }

  public set VirtualKeyboardVisible(value: boolean) {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    this._Options.VirtualKeyboardVisible = value;
    this._VirtualKeyboard.visible = value;
  }
}
