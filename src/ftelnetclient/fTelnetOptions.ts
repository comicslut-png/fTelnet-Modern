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
   */
  public Theme = 'classic';
  public VirtualKeyboardVibrateDuration = 25;
  public VirtualKeyboardVisible: boolean = DetectMobileBrowser.IsMobile;
  public WebSocketUrlPath = '';
}
