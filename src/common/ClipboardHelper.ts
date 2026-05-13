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
 * Clipboard read/write helper.
 *
 * Phase 1 migration notes:
 *   - Switched from the deprecated `document.execCommand('copy'|'paste')`
 *     to the async Clipboard API (`navigator.clipboard`).
 *   - Methods are now async — callers must `await` or `.then()` them. This
 *     is a small breaking change for any external code calling these, but
 *     internal callers are updated in lockstep.
 *   - Removed the `window.clipboardData` (IE) branch and the `prompt()`
 *     fallback.
 *   - Permission to read the clipboard requires a user gesture; failures
 *     are surfaced as Promise rejections rather than swallowed.
 *
 * Browser support: Chrome 66+, Firefox 63+ (read requires 64+), Safari
 * 13.4+. All released years ago.
 */
export class ClipboardHelper {
  public static async GetData(): Promise<string> {
    if (!navigator.clipboard) {
      throw new Error(
        'Clipboard API is not available. fTelnet must be served over HTTPS for clipboard access.'
      );
    }
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      // Most commonly: user denied permission, or no user gesture present.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read clipboard: ${message}`);
    }
  }

  public static async SetData(text: string): Promise<void> {
    if (!navigator.clipboard) {
      throw new Error(
        'Clipboard API is not available. fTelnet must be served over HTTPS for clipboard access.'
      );
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write clipboard: ${message}`);
    }
  }
}
