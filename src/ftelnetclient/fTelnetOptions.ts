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

import { DetectMobileBrowser } from '../common/index.js';

/**
 * Configuration for an `fTelnetClient` instance.
 *
 * Pure dataclass. All fields have sensible defaults so callers
 * can construct an instance and only override what they care
 * about. Migrated as-is from the original — every field name,
 * default value, and type matches.
 *
 * The single computed default is `VirtualKeyboardVisible`, which
 * defaults to `true` on mobile browsers and `false` on desktop.
 * The detection happens at module-load time (when the class is
 * first imported); if a host page changes its viewport between
 * import and use, the cached value will be stale.
 */
export class fTelnetOptions {
  public AllowModernScrollback = true;
  public BareLFtoCRLF = false;
  public BitsPerSecond = 57600;
  public ConnectionType = 'telnet';
  /**
   * Which protocol the menu's Upload and Download buttons use, and
   * which protocol's auto-detect sequence the inbound byte-stream
   * watches for.
   *
   * Values:
   *   - 'zmodem' (default) — modern protocol. Download is auto-
   *     initiated by the BBS; the menu's Download button shows a
   *     hint dialog explaining that no manual trigger is needed.
   *     Upload routes through the multi-file drag-drop confirm
   *     dialog and ZModemSend.
   *   - 'ymodem' — legacy YMODEM-G fallback for older BBSes that
   *     don't speak ZMODEM. Download is user-initiated via the
   *     menu Download button (the standard YMODEM-G handshake).
   *     Upload routes through YModemSend with the legacy in-canvas
   *     progress dialog.
   *
   * In-band ZMODEM auto-detect is governed separately by
   * `ZModemAutoDetect`; setting `DefaultTransferProtocol` to
   * 'ymodem' does NOT silence ZMODEM auto-detect — a BBS that
   * starts blasting ZMODEM bytes will still be caught. To fully
   * lock the client to YMODEM, also set `ZModemAutoDetect` to
   * false.
   *
   * The settings panel exposes a runtime picker and the chosen
   * value persists across reloads via localStorage. This field
   * is the embed-time default when localStorage has no saved
   * preference.
   *
   * Phase 5.
   */
  public DefaultTransferProtocol: 'zmodem' | 'ymodem' = 'zmodem';
  public Emulation = 'ansi-bbs';
  public Enter = '\r';
  public Font = 'CP437';
  public ForceWss = false;
  public FullScreenOnConnect = false;
  public Hostname = 'bbs.ftelnet.ca';
  public LocalEcho = false;
  public NegotiateLocalEcho = true;
  public Port = 1123;
  public ProxyHostname = '';
  public ProxyPort = 1123;
  public ProxyPortSecure = 11235;
  public RLoginClientUsername = '';
  public RLoginServerUsername = '';
  public RLoginTerminalType = '';
  public ScreenColumns = 80;
  public ScreenRows = 25;
  public SendLocation = true;
  public SkipRedrawWhenSameFontSize = false;
  public SplashScreen = '';
  /**
   * Mute the PC-speaker bell emulation. When true, `Crt.PlaySound()`
   * early-returns without scheduling a Web Audio oscillator. Useful
   * for users who don't want the bell from pasting or BBS-side bell
   * characters.
   *
   * Default false (sounds enabled). The settings panel exposes a
   * toggle, and the chosen value persists across reloads via
   * localStorage. The default here is the embed-time fallback when
   * localStorage doesn't have a saved preference.
   */
  public MuteSounds = false;
  /**
   * Visual theme for the chrome around the BBS canvas (status bar,
   * menu popup, focus warning, scrollback bar, virtual keyboard).
   * The Crt canvas itself is not affected — the BBS controls its
   * own colors via ANSI sequences.
   *
   * Built-in values:
   *   - 'classic'    (default) — the original look from the Phase 1
   *                  CSS: solid blue/red/green bars, white buttons
   *                  with rounded corners, sans-serif text.
   *   - 'dos-classic' — Windows-3.1-era gray bevels, square buttons
   *                  with a beveled "pressable" appearance, CGA-
   *                  accented status colors. Reads as "1991 SysOp's
   *                  tower."
   *
   * Set via `Options.Theme = 'dos-classic'` before constructing
   * the fTelnetClient. The theme is applied as a `data-theme`
   * attribute on the container; CSS variables in `ftelnet.css`
   * key off the attribute to switch palettes.
   *
   * The settings panel exposes a runtime theme picker, and the
   * user's choice persists across reloads via localStorage.
   * Options.Theme is the embed-time default when localStorage
   * has no saved preference.
   */
  public Theme = 'classic';
  public VirtualKeyboardVibrateDuration = 25;
  public VirtualKeyboardVisible: boolean = DetectMobileBrowser.IsMobile;
  public WebSocketUrlPath = '';
  /**
   * Whether to auto-detect ZMODEM transfers in the incoming byte
   * stream. When true (default), seeing the ZMODEM auto-trigger
   * sequence (`**\x18B00`) automatically diverts the stream into
   * a ZModemReceive session and saves any received files via
   * the browser download mechanism. Pre-trigger bytes still
   * render through the ANSI parser normally.
   *
   * Set to false to disable, e.g. for embedders that want to
   * handle file transfers their own way or stick exclusively to
   * the legacy YMODEM "Download" button.
   *
   * Phase 4 Stage 6.
   */
  public ZModemAutoDetect = true;
}
