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
 * The 10 RIPscrip stroke fonts (font indices 1-10).
 *
 * Stroke fonts are vector fonts: each character is a series of
 * "pen-up" (MOVE) and "pen-down" (DRAW) commands at relative
 * coordinates. The resulting structure is:
 *
 *   Strokes[fontIndex][charCode] = [moves[], coords[]]
 *
 * where `moves[]` is an array of `MOVE`/`DRAW` flags and `coords[]`
 * is the corresponding flat list of (x, y) pairs.
 *
 * As with `BitmapFont`, the data is fetched asynchronously; until
 * the load completes, `Strokes` contains stub data so drawing code
 * doesn't crash. Code that cares should check `Loaded`.
 *
 * Phase 1 migration notes:
 *   - XHR replaced with `fetch`. Same error-handling behavior as
 *     `BitmapFont`: `alert()` on failure, `Pixels` remains stubs.
 *   - The `Strokes` field stayed `any[]` in the original because the
 *     stroke data is genuinely heterogeneous (two arrays of different
 *     element types packed into one tuple). We type it more precisely
 *     here as `unknown[][][]`; callers in `Graph` cast back to the
 *     specific shape they need.
 */
export class StrokeFont {
  /** Pen-up flag value. */
  public static readonly MOVE = 0;

  /** Pen-down flag value. */
  public static readonly DRAW = 1;

  /**
   * Baseline character heights per stroke font (10 entries).
   * Index 0 is the bitmap font and ignored.
   */
  public static readonly Heights: readonly number[] = [31, 9, 32, 32, 37, 35, 31, 35, 55, 60];

  /**
   * Stroke definitions, structured as `Strokes[fontIndex][charCode]`.
   * Each entry is a `[moves[], coords[]]` tuple. Until loaded, every
   * entry is the placeholder `[[0], [0, 0, 0]]`.
   */
  public static Strokes: unknown[][][] = [];

  public static Loaded = false;

  /**
   * Initialize the stroke font registry: fill `Strokes` with empty
   * stubs (so drawing code doesn't crash if the load fails), then
   * fire off the async load.
   */
  public static Init(): void {
    for (let strokeIndex = 0; strokeIndex < 10; strokeIndex++) {
      const chars: unknown[][] = [];
      for (let charIndex = 0; charIndex < 256; charIndex++) {
        // Placeholder shape: one MOVE command with three zero coords.
        // Drawing this produces nothing visible.
        chars.push([[0], [0, 0, 0]]);
      }
      this.Strokes.push(chars);
    }

    if (document.getElementById('fTelnetScript') !== null) {
      void this.loadJson();
    }
  }

  private static async loadJson(): Promise<void> {
    const url = StringUtils.GetUrl('fonts/RIP-Strokes.json');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as unknown[][][];
      this.Strokes = data;
      this.Loaded = true;
    } catch {
      // eslint-disable-next-line no-alert
      alert('fTelnet Error: Unable to load RIP stroke fonts');
      // TODO: retry with remote embed-v2.ftelnet.ca URL.
    }
  }
}
