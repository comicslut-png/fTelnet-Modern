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

/**
 * String utilities used throughout fTelnet.
 *
 * Phase 1 migration notes:
 *   - `AddCommas` is now a one-liner using `Intl.NumberFormat`. The original
 *     hand-rolled implementation predated wide browser support; we no longer
 *     need to do this by hand.
 *   - `Trim/TrimLeft/TrimRight` delegate to native `String.prototype.trim*`
 *     which all modern browsers ship.
 *   - `GetUrl` is unchanged — it depends on the embed convention where a
 *     `<script id="fTelnetScript">` tag exposes the path the bundle was
 *     loaded from. The non-null assertion is documented inline.
 */
export class StringUtils {
  public static AddCommas(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
  }

  public static FormatPercent(value: number, fractionDigits: number): string {
    return `${(value * 100).toFixed(fractionDigits)}%`;
  }

  /**
   * Resolve a sibling-asset URL based on the location of the `<script
   * id="fTelnetScript">` tag that loaded fTelnet. This lets sysops host
   * fTelnet from any path on their site without configuring asset URLs.
   *
   * Throws if the script tag isn't present — the same condition the
   * constructor in fTelnetClient checks for.
   */
  public static GetUrl(filename: string): string {
    const scriptEl = document.getElementById('fTelnetScript') as HTMLScriptElement | null;
    if (!scriptEl) {
      throw new Error('fTelnet: <script id="fTelnetScript"> not found in the document');
    }
    const parts = scriptEl.src.split('?');
    const scriptUrl = parts[0]!;
    const scriptPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));
    const version = parts.length === 1 ? 'v=1' : parts[1]!;
    return `${scriptPath}/${filename}?${version}`;
  }

  public static NewString(ch: string, length: number): string {
    if (ch.length === 0) {
      return '';
    }
    return ch.charAt(0).repeat(length);
  }

  public static PadLeft(text: string, ch: string, length: number): string {
    if (ch.length === 0) {
      return text;
    }
    return text.padStart(length, ch.charAt(0)).substring(0, length);
  }

  public static PadRight(text: string, ch: string, length: number): string {
    if (ch.length === 0) {
      return text;
    }
    return text.padEnd(length, ch.charAt(0)).substring(0, length);
  }

  public static Trim(text: string): string {
    return text.trim();
  }

  public static TrimLeft(text: string): string {
    return text.trimStart();
  }

  public static TrimRight(text: string): string {
    return text.trimEnd();
  }
}
