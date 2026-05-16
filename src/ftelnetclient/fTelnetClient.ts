/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) Rick Parrish, R&M Software

  This file is part of fTelnet.

  fTelnet is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  fTelnet is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with fTelnet.  If not, see <http://www.gnu.org/licenses/>.
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
  ZModemDetector,
  ZModemReceive,
  type ZModemFileInfo,
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
  FMenuPopup,
  FScrollbackBar,
  FSettingsPanel,
  FStatusBar,
  FVirtualKeyboard,
  type MenuActionDetail,
  type MenuClickDetail,
  type ScreenSizeChangeDetail,
  type SettingsMuteChangeDetail,
  type SettingsThemeChangeDetail,
  type SettingsVibrateChangeDetail,
  type VKKeyEventDetail,
} from '../components/index.js';
import { fTelnetOptions } from './fTelnetOptions.js';

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
 *   - Several alert() calls preserved (ClipboardCopy, constructor
 *     for fatal errors). Phase 3 will replace these with proper
 *     toast notifications as part of the chrome facelift.
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
  private _YModemSend!: YModemSend;

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
  private readonly _ZModemFileBuffers = new Map<string, number[]>();
  private _ZModemCurrentFile: ZModemFileInfo | undefined;

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

    // Restore the user's preferred screen size if they have one
    // stored from a previous session. localStorage access is
    // wrapped in try/catch because some browsers (or privacy modes)
    // disable it entirely.
    try {
      const storedColumns: string | null = window.localStorage.getItem('ScreenColumns');
      const storedRows: string | null = window.localStorage.getItem('ScreenRows');
      if (storedColumns !== null && storedRows !== null) {
        const intColumns: number = parseInt(storedColumns, 10);
        const intRows: number = parseInt(storedRows, 10);

        if (intColumns >= 80 && intColumns <= 132 && intRows >= 25 && intRows <= 60) {
          this._Options.ScreenColumns = intColumns;
          this._Options.ScreenRows = intRows;
        }
      }
    } catch {
      // Ignore — just means browser doesn't support localStorage.
    }

    // Phase 3 Stage 2: restore the Settings panel's user choices
    // (theme, mute, vibrate). Each one overrides the embed-time
    // Options default if the user previously made a choice. Same
    // try/catch dance for the same reason.
    try {
      const storedTheme = window.localStorage.getItem('fTelnet.theme');
      if (storedTheme !== null && storedTheme.length > 0) {
        this._Options.Theme = storedTheme;
      }

      const storedMute = window.localStorage.getItem('fTelnet.mute');
      if (storedMute !== null) {
        this._Options.MuteSounds = storedMute === 'true';
      }

      const storedVibrate = window.localStorage.getItem('fTelnet.vibrate');
      if (storedVibrate !== null) {
        const n = parseInt(storedVibrate, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 100) {
          this._Options.VirtualKeyboardVibrateDuration = n;
        }
      }
    } catch {
      // Ignore — same as above.
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
      }
    });

    this._MenuButtons.addEventListener('screen-size-change', (e: Event): void => {
      const detail = (e as CustomEvent<ScreenSizeChangeDetail>).detail;
      this._Crt.SetScreenSize(detail.columns, detail.rows);
      this._Crt.SetFont(this._Crt.Font.Name);
      // Close the popup. The dropdown change isn't a click on
      // the menu button, so we close without repositioning.
      this._MenuButtons.open = false;

      // Persist the choice for next visit.
      try {
        window.localStorage.setItem('ScreenColumns', detail.columns.toString());
        window.localStorage.setItem('ScreenRows', detail.rows.toString());
      } catch {
        // Ignore — browser doesn't support localStorage.
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
    this._SettingsPanel.vibrateDuration = this._Options.VirtualKeyboardVibrateDuration;

    this._SettingsPanel.addEventListener('settings-theme-change', (e: Event): void => {
      const detail = (e as CustomEvent<SettingsThemeChangeDetail>).detail;
      this.ApplyTheme(detail.theme);
      try {
        window.localStorage.setItem('fTelnet.theme', detail.theme);
      } catch {
        // Ignore — browser doesn't support localStorage.
      }
    });
    this._SettingsPanel.addEventListener('settings-mute-change', (e: Event): void => {
      const detail = (e as CustomEvent<SettingsMuteChangeDetail>).detail;
      this._Crt.Muted = detail.muted;
      this._Options.MuteSounds = detail.muted;
      try {
        window.localStorage.setItem('fTelnet.mute', String(detail.muted));
      } catch {
        // Ignore.
      }
    });
    this._SettingsPanel.addEventListener('settings-vibrate-change', (e: Event): void => {
      const detail = (e as CustomEvent<SettingsVibrateChangeDetail>).detail;
      this._Options.VirtualKeyboardVibrateDuration = detail.duration;
      this._VirtualKeyboard.vibrateDuration = detail.duration;
      try {
        window.localStorage.setItem('fTelnet.vibrate', String(detail.duration));
      } catch {
        // Ignore.
      }
    });
    this._SettingsPanel.addEventListener('settings-close', (): void => {
      this._SettingsPanel.open = false;
    });

    this._SettingsPanel.setAttribute('data-theme', this._Options.Theme);
    document.body.appendChild(this._SettingsPanel);

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
        this._Crt.Write(atob('IFImTSBTb2Z0d2FyZS6bQWxsIFJpZ2h0cyBSZXNlcnZlZJub'));
      } else {
        this._Crt.Write(atob(this._Options.SplashScreen));
      }
    } else if (this._Options.Emulation === 'C64') {
      if (this._Options.SplashScreen === '') {
        this._Crt.Write(
          atob('DQpGdEVMTkVUIC0tIHRFTE5FVCBGT1IgVEhFIHdFQg0KICB3RUIgQkFTRUQgYmJzIFRFUk1JTkFMIENMSUVOVA0KDQpjT1BZUklHSFQgKGMpIDIwMDkt')
        );
        this._Crt.Write(new Date().getFullYear().toString());
        this._Crt.Write(atob('IHImbSBzT0ZUV0FSRS4NCmFMTCBySUdIVFMgckVTRVJWRUQNCg0K'));
      } else {
        this._Crt.Write(atob(this._Options.SplashScreen));
      }
    } else if (this._Options.Emulation === 'RIP') {
      if (this._Options.SplashScreen === '') {
        this._RIP.Parse(
          atob('G1swbRtbMkobWzA7MEgbWzE7NDQ7MzRt2sTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEG1swOzQ0OzMwbb8bWzBtDQobWzE7NDQ7MzRtsyAgG1szN21XZWxjb21lISAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAbWzA7NDQ7MzBtsxtbMG0NChtbMTs0NDszNG3AG1swOzQ0OzMwbcTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE2RtbMG0NCg0KG1sxbSAbWzBtIBtbMTs0NDszNG3axMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQbWzA7NDQ7MzBtvxtbMG0NCiAgG1sxOzQ0OzM0bbMbWzA7MzRt29vb2xtbMzBt29vb29vb29vb29vb29vb29vb29vb2xtbMzRt29vb29vbG1s0NDszMG2zG1swbQ0KICAbWzE7NDQ7MzRtsxtbMDszNG3b29vbG1sxOzMwbdvb29vb29vb29vb29vb29vb29vb29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29vb2xtbMG3b29vb29vb29vb29sbWzFt29vb2xtbMzBt29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29vb2xtbMG3b29vb29vb29vbG1sxbdvb29sbWzBt29sbWzE7MzBt29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29vb2xtbMG3b29vb29vb2xtbMW3b29vbG1swbdvbG1sxbdvbG1szMG3b2xtbMDszMG3b2xtbMzRt29vb2xtbNDQ7MzBtsxtbMG0NCiAgG1sxOzQ0OzM0bbMbWzA7MzRt29vb2xtbMTszMG3b29vbG1swbdvb29vb2xtbMW3b29vbG1swbdvbG1sxbdvb29sbWzMwbdvbG1swOzMwbdvbG1szNG3b29vbG1s0NDszMG2zG1swbQ0KICAbWzE7NDQ7MzRtsxtbMDszNG3b29vbG1sxOzMwbdvb29sbWzBt29vb2xtbMW3b29vbG1swbdvbG1sxbdvb29vb2xtbMzBt29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzQwOzM3bQ0KICAbWzE7NDQ7MzRtsxtbMDszNG3b29vbG1sxOzMwbdvbG1swOzMwbdvbG1sxbdvb29vb29vb29vb29vb29vb2xtbMDszMG3b2xtbMzRt29vb2xtbNDQ7MzBtsxtbNDA7MzdtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29sbWzBt29vb29vb29vb29vb29vb29vb29sbWzMwbdvbG1szNG3b29vbG1s0NDszMG2zG1s0MDszN20NCiAgG1sxOzQ0OzM0bbMbWzA7MzBt29vb29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szNG3b2xtbNDQ7MzBtsxtbNDA7MzdtDQogIBtbMTs0NDszNG2zG1s0MDszMG3b2xtbMG3b29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szMG3b2xtbNDRtsxtbNDA7MzdtIBtbMzRtIBtbMTs0NzszN23axMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQbWzMwbb8bWzBtDQogIBtbMTs0NDszNG2zG1swOzMwbdvbG1sxbdvb29vb29vb29vb29vb29sbWzA7MzBt29vb29vb29vb2xtbMW3b2xtbMDszMG3b2xtbNDRtsxtbNDA7MzdtIBtbMzRtIBtbMTs0NzszN22zICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAbWzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1s0MDszMG3b2xtbMG3b29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szMG3b2xtbNDRtsxtbMG0gG1szNG0gG1sxOzQ3OzM3bbMgICAbWzM0bWZUZWxuZXQgLS0gVGVsbmV0IGZvciB0aGUgV2ViICAgICAgG1szMG2zG1swbQ0KG1sxbSAbWzBtIBtbMTs0NDszNG2zG1swOzMwbdvbG1sxbdvb29vb29vb29vb29vb29vb29vb29vb2xtbMDszMG3b29vb29sbWzQ0bbMbWzBtIBtbMzRtIBtbMTs0NzszN22zICAgICAbWzA7NDc7MzRtV2ViIGJhc2VkIEJCUyB0ZXJtaW5hbCBjbGllbnQgICAgG1sxOzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvbG1szMG3b29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szNG3b2xtbNDQ7MzBtsxtbMG0gG1szNG0gG1sxOzQ3OzM3bbMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIBtbMzBtsxtbMG0NCiAgG1sxOzQ0OzM0bcAbWzA7NDQ7MzBtxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTZG1swbSAbWzM0bSAbWzE7NDc7MzdtwBtbMzBtxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTZG1swbQ0KDQobWzExQxtbMTszMm1Db3B5cmlnaHQgKEMpIDIwMDkt')
        );
        this._RIP.Parse(new Date().getFullYear().toString());
        this._RIP.Parse(
          atob('IFImTSBTb2Z0d2FyZS4gIEFsbCBSaWdodHMgUmVzZXJ2ZWQNChtbMDszNG3ExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE')
        );
      } else {
        this._RIP.Parse(atob(this._Options.SplashScreen));
      }
    } else {
      // Default: ansi-bbs splash.
      if (this._Options.SplashScreen === '') {
        this._Ansi.Write(
          atob('G1swbRtbMkobWzA7MEgbWzE7NDQ7MzRt2sTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEG1swOzQ0OzMwbb8bWzBtDQobWzE7NDQ7MzRtsyAgG1szN21XZWxjb21lISAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAbWzA7NDQ7MzBtsxtbMG0NChtbMTs0NDszNG3AG1swOzQ0OzMwbcTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE2RtbMG0NCg0KG1sxbSAbWzBtIBtbMTs0NDszNG3axMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQbWzA7NDQ7MzBtvxtbMG0NCiAgG1sxOzQ0OzM0bbMbWzA7MzRt29vb2xtbMzBt29vb29vb29vb29vb29vb29vb29vb2xtbMzRt29vb29vbG1s0NDszMG2zG1swbQ0KICAbWzE7NDQ7MzRtsxtbMDszNG3b29vbG1sxOzMwbdvb29vb29vb29vb29vb29vb29vb29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29vb2xtbMG3b29vb29vb29vb29sbWzFt29vb2xtbMzBt29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29vb2xtbMG3b29vb29vb29vbG1sxbdvb29sbWzBt29sbWzE7MzBt29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29vb2xtbMG3b29vb29vb2xtbMW3b29vbG1swbdvbG1sxbdvbG1szMG3b2xtbMDszMG3b2xtbMzRt29vb2xtbNDQ7MzBtsxtbMG0NCiAgG1sxOzQ0OzM0bbMbWzA7MzRt29vb2xtbMTszMG3b29vbG1swbdvb29vb2xtbMW3b29vbG1swbdvbG1sxbdvb29sbWzMwbdvbG1swOzMwbdvbG1szNG3b29vbG1s0NDszMG2zG1swbQ0KICAbWzE7NDQ7MzRtsxtbMDszNG3b29vbG1sxOzMwbdvb29sbWzBt29vb2xtbMW3b29vbG1swbdvbG1sxbdvb29vb2xtbMzBt29sbWzA7MzBt29sbWzM0bdvb29sbWzQ0OzMwbbMbWzQwOzM3bQ0KICAbWzE7NDQ7MzRtsxtbMDszNG3b29vbG1sxOzMwbdvbG1swOzMwbdvbG1sxbdvb29vb29vb29vb29vb29vb2xtbMDszMG3b2xtbMzRt29vb2xtbNDQ7MzBtsxtbNDA7MzdtDQogIBtbMTs0NDszNG2zG1swOzM0bdvb29sbWzE7MzBt29sbWzBt29vb29vb29vb29vb29vb29vb29sbWzMwbdvbG1szNG3b29vbG1s0NDszMG2zG1s0MDszN20NCiAgG1sxOzQ0OzM0bbMbWzA7MzBt29vb29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szNG3b2xtbNDQ7MzBtsxtbNDA7MzdtDQogIBtbMTs0NDszNG2zG1s0MDszMG3b2xtbMG3b29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szMG3b2xtbNDRtsxtbNDA7MzdtIBtbMzRtIBtbMTs0NzszN23axMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQbWzMwbb8bWzBtDQogIBtbMTs0NDszNG2zG1swOzMwbdvbG1sxbdvb29vb29vb29vb29vb29sbWzA7MzBt29vb29vb29vb2xtbMW3b2xtbMDszMG3b2xtbNDRtsxtbNDA7MzdtIBtbMzRtIBtbMTs0NzszN22zICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAbWzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1s0MDszMG3b2xtbMG3b29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szMG3b2xtbNDRtsxtbMG0gG1szNG0gG1sxOzQ3OzM3bbMgICAbWzM0bWZUZWxuZXQgLS0gVGVsbmV0IGZvciB0aGUgV2ViICAgICAgG1szMG2zG1swbQ0KG1sxbSAbWzBtIBtbMTs0NDszNG2zG1swOzMwbdvbG1sxbdvb29vb29vb29vb29vb29vb29vb29vb2xtbMDszMG3b29vb29sbWzQ0bbMbWzBtIBtbMzRtIBtbMTs0NzszN22zICAgICAbWzA7NDc7MzRtV2ViIGJhc2VkIEJCUyB0ZXJtaW5hbCBjbGllbnQgICAgG1sxOzMwbbMbWzBtDQogIBtbMTs0NDszNG2zG1swOzM0bdvbG1szMG3b29vb29vb29vb29vb29vb29vb29vb29vb29vbG1szNG3b2xtbNDQ7MzBtsxtbMG0gG1szNG0gG1sxOzQ3OzM3bbMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIBtbMzBtsxtbMG0NCiAgG1sxOzQ0OzM0bcAbWzA7NDQ7MzBtxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTZG1swbSAbWzM0bSAbWzE7NDc7MzdtwBtbMzBtxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTZG1swbQ0KDQobWzExQxtbMTszMm0bWzE7MjU1OzE3ODsxMjd0Q29weXJpZ2h0IChDKSAyMDA5LQ==')
        );
        this._Ansi.Write(new Date().getFullYear().toString());
        this._Ansi.Write(
          atob('IFImTSBTb2Z0d2FyZS4gIEFsbCBSaWdodHMgUmVzZXJ2ZWQNChtbMDszNG3ExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE')
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
    // eslint-disable-next-line no-alert
    alert('Click and drag your mouse over the text you want to copy');
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
      this._StatusBar.statusText =
        'Connecting to ' + this._Options.Hostname + ':' + this._Options.Port;
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
      this._StatusBar.statusText =
        'Connecting to ' +
        this._Options.Hostname +
        ':' +
        this._Options.Port +
        ' via ' +
        this._Options.ProxyHostname;
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
  public Disconnect(prompt: boolean): boolean {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection === undefined || !this._Connection.connected) {
      return true;
    }

    // eslint-disable-next-line no-alert
    if (!prompt || confirm('Are you sure you want to disconnect?')) {
      this._Connection.onclose.off();
      this._Connection.onconnect.off();
      this._Connection.ondata.off();
      this._Connection.onioerror.off();
      this._Connection.onlocalecho.off();
      this._Connection.onsecurityerror.off();
      this._Connection.close();
      this._Connection = undefined;

      this.OnConnectionClose();
      return true;
    }

    return false;
  }

  /**
   * Start a YMODEM-G download. Stops the main poll timer (YModem
   * runs its own) and arms a one-shot completion handler that
   * restarts the timer when the download finishes.
   */
  public Download(): void {
    if (this._MenuButtons !== undefined) {
      this._MenuButtons.open = false;
    }

    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }

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
    this._StatusBar.connectButtonText = 'Reconnect';
    this._StatusBar.connectButtonVisible = true;

    this._StatusBar.statusText =
      'Disconnected from ' + this._Options.Hostname + ':' + this._Options.Port;
    this._StatusBar.state = 'error';
    this._ClientContainer.style.opacity = '0.5';

    // Tear down any in-progress ZMODEM session.
    if (this._ZModemReceive !== undefined) {
      this.endZModemReceive();
    }
  }

  private OnConnectionConnect(): void {
    this._Crt.ClrScr();

    // Make sure the ZMODEM auto-detector exists and is in a fresh
    // state. Stays alive across the whole session; resets after each
    // ZMODEM transfer so the next one auto-detects too.
    if (this._Options.ZModemAutoDetect) {
      this.ensureZModemDetector();
      this._ZModemDetector?.reset();
    }

    if (this._Options.ProxyHostname === '') {
      this._StatusBar.statusText =
        'Connected to ' + this._Options.Hostname + ':' + this._Options.Port;
      this._StatusBar.state = 'active';
      this._ClientContainer.style.opacity = '1.0';
    } else {
      this._StatusBar.statusText =
        'Connected to ' +
        this._Options.Hostname +
        ':' +
        this._Options.Port +
        ' via ' +
        this._Options.ProxyHostname;
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
          this.ondata.trigger(Data);
          if (
            this._Options.ZModemAutoDetect &&
            this._ZModemDetector !== undefined
          ) {
            // Route through the detector. Its callbacks handle
            // both passthrough-to-ANSI and divert-to-ZMODEM.
            this._ZModemDetector.feed(Data);
          } else {
            // Detector disabled — go straight to the renderer.
            this.routeToRenderer(Data);
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
    if (this._Connection === undefined) return;
    this._ZModemFileBuffers.clear();
    this._ZModemCurrentFile = undefined;

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
      },
      onFileData: (chunk) => {
        if (this._ZModemCurrentFile === undefined) return;
        const buf = this._ZModemFileBuffers.get(this._ZModemCurrentFile.name);
        if (buf === undefined) return;
        for (let i = 0; i < chunk.length; i++) {
          buf.push(chunk[i]!);
        }
      },
      onFileComplete: (file) => {
        const buf = this._ZModemFileBuffers.get(file.name);
        if (buf === undefined || buf.length === 0) return;
        const blob = new Blob([new Uint8Array(buf)]);
        saveAs(blob, file.name);
        this._ZModemFileBuffers.delete(file.name);
      },
      onSessionComplete: () => {
        this.endZModemReceive();
      },
      onError: (msg) => {
        // eslint-disable-next-line no-console
        console.warn('ZMODEM transfer error:', msg);
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
    this._StatusBar.connectButtonText = 'Retry Connection';
    this._StatusBar.connectButtonVisible = true;

    if (this._Options.ProxyHostname === '') {
      this._StatusBar.statusText =
        'Unable to connect to ' + this._Options.Hostname + ':' + this._Options.Port;
      this._StatusBar.state = 'error';
      this._ClientContainer.style.opacity = '0.5';
    } else {
      this._StatusBar.statusText =
        'Unable to connect to ' +
        this._Options.Hostname +
        ':' +
        this._Options.Port +
        ' via ' +
        this._Options.ProxyHostname;
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
    this._SettingsPanel.vibrateDuration = this._Options.VirtualKeyboardVibrateDuration;
    this._SettingsPanel.open = true;
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

  private OnUploadComplete(): void {
    // Restart the main poll timer.
    this._Timer = setInterval((): void => {
      this.OnTimer();
    }, 250);
  }

  /**
   * Fires when the hidden file input changes (user picked files).
   * Builds the YModemSend, stops the main timer, and queues each
   * selected file for upload.
   */
  public OnUploadFileSelected(): void {
    if (this._Connection === undefined || !this._Connection.connected) {
      return;
    }

    this._YModemSend = new YModemSend(this._Crt, this._Connection);

    if (this._Timer !== undefined) {
      clearInterval(this._Timer);
      this._Timer = undefined;
    }
    this._YModemSend.ontransfercomplete.on((): void => {
      this.OnUploadComplete();
    });

    if (this._UploadInput.files !== null) {
      for (let i = 0; i < this._UploadInput.files.length; i++) {
        this.UploadFile(this._UploadInput.files[i]!, this._UploadInput.files.length);
      }
    }
  }

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

  /**
   * Read a single File via FileReader (as ArrayBuffer), copy each
   * byte into a FileRecord's ByteArray, and queue it on YModemSend.
   *
   * The original ran a byte-by-byte loop; preserved here. A future
   * pass could use `new Uint8Array(arrayBuffer)` directly without
   * the loop, but the byte-by-byte form matches the ByteArray API.
   */
  private UploadFile(file: File, fileCount: number): void {
    const reader: FileReader = new FileReader();

    reader.onload = (): void => {
      const FR: FileRecord = new FileRecord(file.name, file.size);
      const Buffer = reader.result as ArrayBuffer;
      const Bytes: Uint8Array = new Uint8Array(Buffer);
      for (let i = 0; i < Bytes.length; i++) {
        FR.data.writeByte(Bytes[i]!);
      }
      FR.data.position = 0;
      this._YModemSend.Upload(FR, fileCount);
    };

    reader.readAsArrayBuffer(file);
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
