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
 * Dev-only logger for ZMODEM auto-detect troubleshooting.
 *
 * Off by default to keep production builds quiet. Toggle on by
 * setting `window.fTelnetZModemDebug = true` in the browser
 * console before reproducing the issue, or by setting the URL
 * hash to include `#zmdebug`.
 *
 * The flag is checked on every call (not cached), so you can
 * toggle it on mid-session and start seeing logs immediately
 * without reloading the page.
 *
 * Multiple casings of the window flag are accepted (camelCase
 * `fTelnetZModemDebug` is the documented form, but `fTelnetZmodemDebug`
 * also works since ZMODEM-as-acronym fights JS casing conventions
 * and is easy to typo).
 *
 * Usage:
 *   ZmDebug.log('detector', 'trigger fired', { matchIndex: 6 });
 *   ZmDebug.bytes('detector', 'feed input', bytes);  // hex dump
 *
 * Logged output goes to console.info with a `[zmodem:<tag>]`
 * prefix so it's easy to filter in DevTools.
 *
 * Once Stage 6 ships verified, this can stay in the codebase
 * as a debugging tool — it costs nothing when disabled.
 *
 * Phase 4 Stage 6 (diagnostic addition).
 */
export class ZmDebug {
  /**
   * Is the logger currently active? Re-checked every call so
   * toggling `window.fTelnetZModemDebug = true` mid-session
   * starts logging immediately.
   *
   * Accepts any reasonable casing of the window flag — both
   * `fTelnetZModemDebug` (camelCase as documented) and
   * `fTelnetZmodemDebug` (common typo, since "ZMODEM" looks like
   * an acronym that should be all-caps but JS conventions push
   * toward camelCase).
   */
  public static get enabled(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    if (
      w.fTelnetZModemDebug === true ||
      w.fTelnetZmodemDebug === true ||
      w.ftelnetZmodemDebug === true ||
      w.FTelnetZModemDebug === true
    ) {
      return true;
    }
    if (window.location && window.location.hash.indexOf('zmdebug') >= 0) {
      return true;
    }
    return false;
  }

  /** Force-enable from code (sets the canonical window flag). */
  public static enable(): void {
    if (typeof window !== 'undefined') {
      (window as unknown as { fTelnetZModemDebug?: boolean }).fTelnetZModemDebug = true;
    }
  }

  /** Force-disable from code. */
  public static disable(): void {
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      w.fTelnetZModemDebug = false;
      w.fTelnetZmodemDebug = false;
    }
  }

  /**
   * Log a structured message. `tag` identifies the subsystem
   * (e.g. 'detector', 'receive', 'wire').
   */
  public static log(tag: string, message: string, data?: unknown): void {
    if (!this.enabled) return;
    if (data !== undefined) {
      // eslint-disable-next-line no-console
      console.info(`[zmodem:${tag}] ${message}`, data);
    } else {
      // eslint-disable-next-line no-console
      console.info(`[zmodem:${tag}] ${message}`);
    }
  }

  /**
   * Log a byte chunk as a hex+ASCII dump, lrzsz-style. Useful for
   * confirming that bytes ARE arriving and what they look like.
   * Truncates to the first 96 bytes to keep the console readable.
   */
  public static bytes(tag: string, message: string, bytes: Uint8Array | number[] | string): void {
    if (!this.enabled) return;
    const arr =
      typeof bytes === 'string'
        ? Array.from(bytes).map((c) => c.charCodeAt(0) & 0xff)
        : Array.from(bytes);
    const len = arr.length;
    const sample = arr.slice(0, 96);
    const hex = sample
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = sample
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');
    const suffix = len > 96 ? ` (… +${len - 96} more bytes)` : '';
    // eslint-disable-next-line no-console
    console.info(
      `[zmodem:${tag}] ${message} (${len} bytes)${suffix}\n  hex:   ${hex}\n  ascii: ${ascii}`,
    );
  }
}
