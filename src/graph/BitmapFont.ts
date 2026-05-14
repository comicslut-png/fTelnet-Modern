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

import { StringUtils } from '../common/index.js';

/**
 * The RIPscrip 8x8 bitmap font (font index 0).
 *
 * A single global table mapping each of 256 character codes to an 8x8
 * pixel grid (`number[8][8]` per char — values 0 or 1). The grid is
 * loaded asynchronously from a JSON resource hosted alongside the
 * fTelnet embed script.
 *
 * Until the load completes, `Pixels` contains all-zero grids so any
 * code drawing the bitmap font won't crash — it'll just render
 * invisible characters. Code that cares should check `Loaded`.
 *
 * Phase 1 migration notes:
 *   - XHR replaced with `fetch`. Behavior is the same: on success,
 *     `Pixels` is replaced and `Loaded` becomes true; on failure
 *     (non-2xx HTTP or network error), an `alert()` fires and `Pixels`
 *     stays as the all-zero grid.
 *   - The `alert()` is preserved for migration safety; Phase 3 will
 *     replace it with a toast as part of the UI facelift.
 *   - The `document.getElementById('fTelnetScript')` gate skips the
 *     load entirely when we're not in the embed context (e.g. during
 *     unit tests). Preserved unchanged.
 */
export class BitmapFont {
  public static Loaded = false;

  /**
   * 256 chars × 8 rows × 8 columns of 0/1 pixels.
   *
   * Typed as `number[][][]` rather than `any[]` (the original).
   */
  public static Pixels: number[][][] = [];

  /**
   * Initialize the bitmap font: create the empty fallback grid, then
   * kick off an async fetch of the real font data. Safe to call from
   * any context; if `fTelnetScript` isn't in the DOM, the fetch is
   * skipped.
   */
  public static Init(): void {
    // Build the all-zero fallback grid so drawing code can't crash
    // even if the load never completes.
    for (let char = 0; char < 256; char++) {
      this.Pixels[char] = [];
      for (let y = 0; y < 8; y++) {
        this.Pixels[char]![y] = [];
        for (let x = 0; x < 8; x++) {
          this.Pixels[char]![y]![x] = 0;
        }
      }
    }

    if (document.getElementById('fTelnetScript') !== null) {
      void this.loadJson();
    }
  }

  /**
   * Kick off the JSON fetch and parse the result on success.
   *
   * Errors (HTTP non-2xx, network failure, JSON parse failure) all
   * funnel into the same `alert()` — matches the original's behavior.
   */
  private static async loadJson(): Promise<void> {
    const url = StringUtils.GetUrl('fonts/RIP-Bitmap_8x8.json');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as number[][][];
      this.Pixels = data;
      this.Loaded = true;
    } catch {
      // eslint-disable-next-line no-alert
      alert('fTelnet Error: Unable to load RIP bitmap font');
      // TODO: retry with remote embed-v2.ftelnet.ca URL (matches the
      // original's deferred retry plan).
    }
  }
}
