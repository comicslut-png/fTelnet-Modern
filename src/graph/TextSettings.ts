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

import { TextJustification } from './TextJustification.js';
import { TextOrientation } from './TextOrientation.js';

/**
 * Current text-rendering state for `Graph`.
 *
 * `StrokeScaleX/Y` are computed scale factors used when rendering
 * stroke fonts (`Font` 1-10) at the current `Size`. They're recomputed
 * by `SetStrokeScale()` whenever `Font` or `Size` changes — the
 * constructor calls it once with defaults, and `Graph.SetTextStyle`
 * calls it again when it mutates this struct.
 *
 * `Font = 0` is the bitmap font (loaded by `BitmapFont`); fonts 1-10
 * are stroke fonts (loaded by `StrokeFont`).
 *
 * The `STROKE_SCALES` table is the BGI's canonical per-font, per-size
 * baseline dimensions in [width, height] pairs. Size 4 is treated as
 * the unit scale (1.0×1.0) in `SetStrokeScale`; all other sizes are
 * expressed as a fraction of size 4.
 */
export class TextSettings {
  public Direction: number = TextOrientation.Horizontal;
  public Font = 0;
  public HorizontalAlign: number = TextJustification.Left;
  public Size = 1;
  public StrokeScaleX!: number;
  public StrokeScaleY!: number;
  public VerticalAlign: number = TextJustification.Top;

  /**
   * Per-font, per-size [width, height] baselines for stroke fonts.
   * Index 0 is the bitmap-font row (all zeros — unused). Indices 1-10
   * are the ten stroke fonts.
   *
   * The original marked some rows as "may not be 100% correct" — these
   * were copied from earlier rows as placeholders. Preserved as-is to
   * match the original's rendering.
   */
  private static readonly STROKE_SCALES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    // BitmapFont (unused — bitmap font is fixed-size)
    [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    // TriplexFont
    [[0, 0], [13, 18], [14, 20], [16, 23], [22, 31], [29, 41], [36, 51], [44, 62], [55, 77], [66, 93], [88, 124]],
    // SmallFont
    [[0, 0], [3, 5], [4, 6], [4, 6], [6, 9], [8, 12], [10, 15], [12, 18], [15, 22], [18, 27], [24, 36]],
    // SansSerifFont
    [[0, 0], [11, 19], [12, 21], [14, 24], [19, 32], [25, 42], [31, 53], [38, 64], [47, 80], [57, 96], [76, 128]],
    // GothicFont
    [[0, 0], [13, 19], [14, 21], [16, 24], [22, 32], [29, 42], [36, 53], [44, 64], [55, 80], [66, 96], [88, 128]],
    // ScriptFont (placeholder — may not be 100% correct, preserved from original)
    [[0, 0], [11, 19], [12, 21], [14, 24], [19, 32], [25, 42], [31, 53], [38, 64], [47, 80], [57, 96], [76, 128]],
    // SimplexFont (placeholder)
    [[0, 0], [11, 19], [12, 21], [14, 24], [19, 32], [25, 42], [31, 53], [38, 64], [47, 80], [57, 96], [76, 128]],
    // TriplexScriptFont (placeholder)
    [[0, 0], [13, 18], [14, 20], [16, 23], [22, 31], [29, 41], [36, 51], [44, 62], [55, 77], [66, 93], [88, 124]],
    // ComplexFont (placeholder)
    [[0, 0], [11, 19], [12, 21], [14, 24], [19, 32], [25, 42], [31, 53], [38, 64], [47, 80], [57, 96], [76, 128]],
    // EuropeanFont (placeholder)
    [[0, 0], [11, 19], [12, 21], [14, 24], [19, 32], [25, 42], [31, 53], [38, 64], [47, 80], [57, 96], [76, 128]],
    // BoldFont (placeholder)
    [[0, 0], [11, 19], [12, 21], [14, 24], [19, 32], [25, 42], [31, 53], [38, 64], [47, 80], [57, 96], [76, 128]],
  ];

  constructor() {
    this.SetStrokeScale();
  }

  /**
   * Recompute `StrokeScaleX/Y` from the current `Font` and `Size`.
   * Should be called any time `Font` or `Size` changes.
   *
   * The scale is `current[font][size] / current[font][4]` — i.e.,
   * size 4 is the unit scale, and other sizes are fractions of it.
   */
  public SetStrokeScale(): void {
    const fontRow = TextSettings.STROKE_SCALES[this.Font]!;
    const sizePair = fontRow[this.Size]!;
    const basePair = fontRow[4]!;
    this.StrokeScaleX = sizePair[0] / basePair[0];
    this.StrokeScaleY = sizePair[1] / basePair[1];
  }
}
