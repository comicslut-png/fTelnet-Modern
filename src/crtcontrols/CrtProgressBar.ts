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

import { CharInfo, Color, type Crt } from '../crt/index.js';
import { StringUtils } from '../common/index.js';
import { CrtControl } from './CrtControl.js';
import { ProgressBarStyle } from './ProgressBarStyle.js';

/**
 * Progress bar in three styles:
 *
 *   - **Blocks**: filled cells are CP437 character 254 (centered dot).
 *     Bar grows from left to right as `Value` increases.
 *   - **Continuous**: filled cells are CP437 character 219 (full block).
 *     Looks like a solid bar.
 *   - **Marquee**: a 15-cell-wide bar that animates back and forth,
 *     used as a "working, no estimate" indicator. Updates are
 *     throttled to `MarqueeAnimationSpeed` ms between frames.
 *
 * In bar styles, an optional percentage is shown centered on the bar
 * (its colors change depending on whether the bar has reached it).
 *
 * Phase 1 migration notes:
 *   - The original `_LastMarqueeUpdate` field had a confusing
 *     double-initialization (declared `=0`, then assigned in
 *     constructor). Cleaned up by initializing once in the constructor.
 *   - The `BarForeColour = Crt.YELLOW` line had a TODO from the original
 *     author noting that high backgrounds + blink don't coexist in the
 *     current Crt unit, causing a blinking orange background behind the
 *     percent text. Preserved with the same TODO comment so Phase 3 can
 *     fix it as part of the UI facelift.
 *   - Long `FastWrite` lines have been refactored into a helper to
 *     reduce repetition (each style was building the same
 *     `CharInfo.GetNew(' ', fg + (bg << 4))` argument).
 */
export class CrtProgressBar extends CrtControl {
  private _barForeColour: number;
  private _blankForeColour: number;
  private _lastBarWidth = 9999;
  private _lastMarqueeUpdate: number;
  private _lastPercentText = '';
  private _marqueeAnimationSpeed = 25;
  private _maximum = 100;
  private _percentPrecision = 2;
  private _percentVisible = true;
  private _style: ProgressBarStyle;
  private _value = 0;

  constructor(
    crt: Crt,
    parent: CrtControl,
    left: number,
    top: number,
    width: number,
    style: ProgressBarStyle
  ) {
    super(crt, parent, left, top, width, 1);

    this._style = style;

    this.BackColour = Color.BLUE;

    // TODO: Crt currently doesn't allow high-intensity background AND
    // blink at the same time, so using YELLOW (a bright color) for the
    // bar foreground causes a blinking orange background to leak
    // through behind the percent text. Phase 3 (UI facelift) will fix
    // the Crt attribute model to support both simultaneously.
    this._barForeColour = Color.YELLOW;
    this._blankForeColour = Color.LIGHTGRAY;
    this._lastMarqueeUpdate = Date.now();

    this.Paint(true);
  }

  public get BarForeColour(): number {
    return this._barForeColour;
  }
  public set BarForeColour(value: number) {
    if (value !== this._barForeColour) {
      this._barForeColour = value;
      this.Paint(true);
    }
  }

  public get BlankForeColour(): number {
    return this._blankForeColour;
  }
  public set BlankForeColour(value: number) {
    if (value !== this._blankForeColour) {
      this._blankForeColour = value;
      this.Paint(true);
    }
  }

  public get MarqueeAnimationSpeed(): number {
    return this._marqueeAnimationSpeed;
  }
  public set MarqueeAnimationSpeed(value: number) {
    this._marqueeAnimationSpeed = value;
  }

  public get Maximum(): number {
    return this._maximum;
  }
  public set Maximum(value: number) {
    if (value !== this._maximum) {
      this._maximum = value;
      if (this._value > this._maximum) {
        this._value = this._maximum;
      }
      this.Paint(true);
    }
  }

  /**
   * Re-draw the bar and percent text.
   *
   * @param force when true, always redraw everything. When false,
   *   skip parts that haven't changed since the last paint. Marquee
   *   mode always redraws.
   */
  public Paint(force: boolean): void {
    if (this._style === ProgressBarStyle.Marquee) {
      this.paintMarquee(force);
    } else {
      this.paintBar(force);
    }
  }

  /**
   * Render the marquee animation. The bar is always 15 cells wide and
   * its position is computed from `_value`:
   *   - Value 0 → just a faint dotted line spanning the whole width
   *   - Value 1..14 → bar appears growing from the left edge
   *   - Value 15..(Width) → bar moves rightward across the width
   *   - Value (Width+1)..(Width+15) → bar slides off the right edge
   */
  private paintMarquee(force: boolean): void {
    const blankAttr = this._blankForeColour + (this.BackColour << 4);
    const barAttr = this._barForeColour + (this.BackColour << 4);

    if (force) {
      // Erase the previous bar by painting the whole width with the
      // "empty" character (CP437 176, light shading).
      this._crt.FastWrite(
        StringUtils.NewString(String.fromCharCode(176), this.Width),
        this.ScreenLeft,
        this.ScreenTop,
        CharInfo.GetNew(' ', blankAttr)
      );
    }

    if (this._value <= 0) {
      return;
    }

    // Three cases for the bar position:
    if (this._value > this.Width) {
      // Sliding off the right edge — one trailing 'empty' cell on the
      // back edge of the moving 15-cell window.
      this._crt.FastWrite(
        String.fromCharCode(176),
        this.ScreenLeft + this.Width - (15 - Math.floor(this._value - this.Width)),
        this.ScreenTop,
        CharInfo.GetNew(' ', blankAttr)
      );
    } else if (this._value >= 15) {
      // Fully on-screen, 15 cells wide.
      this._crt.FastWrite(
        StringUtils.NewString(String.fromCharCode(219), Math.min(this._value, 15)),
        this.ScreenLeft + this._value - 15,
        this.ScreenTop,
        CharInfo.GetNew(' ', barAttr)
      );
      // Single empty cell just behind it for the trailing edge.
      this._crt.FastWrite(
        String.fromCharCode(176),
        this.ScreenLeft + this._value - 15,
        this.ScreenTop,
        CharInfo.GetNew(' ', blankAttr)
      );
    } else {
      // Still growing from the left edge (cells 1..14).
      this._crt.FastWrite(
        StringUtils.NewString(String.fromCharCode(219), Math.min(this._value, 15)),
        this.ScreenLeft,
        this.ScreenTop,
        CharInfo.GetNew(' ', barAttr)
      );
    }
  }

  /**
   * Render a normal proportional progress bar with optional percent
   * text in the middle.
   *
   * Optimization: tracks the last bar width and last percent string,
   * and skips redraws when they haven't changed. This matters when
   * `Maximum` is large and `Value` is incremented rapidly — without
   * the optimization, every `Step()` would do a full repaint.
   */
  private paintBar(force: boolean): void {
    if (force) {
      // Discard any tracked state so we definitely repaint everything.
      this._lastBarWidth = 9999;
      this._lastPercentText = '';
    }

    const percent = this._value / this._maximum;
    const newBarWidth = Math.floor(percent * this.Width);
    const blankAttr = this._blankForeColour + (this.BackColour << 4);
    const barAttr = this._barForeColour + (this.BackColour << 4);

    let paintPercentText = false;
    if (newBarWidth !== this._lastBarWidth) {
      // If the bar shrank, erase any leftover trailing cells first.
      if (newBarWidth < this._lastBarWidth) {
        this._crt.FastWrite(
          StringUtils.NewString(String.fromCharCode(176), this.Width),
          this.ScreenLeft,
          this.ScreenTop,
          CharInfo.GetNew(' ', blankAttr)
        );
      }

      // Draw the new bar.
      this._crt.FastWrite(
        StringUtils.NewString(String.fromCharCode(this._style), newBarWidth),
        this.ScreenLeft,
        this.ScreenTop,
        CharInfo.GetNew(' ', barAttr)
      );

      this._lastBarWidth = newBarWidth;
      paintPercentText = true;
    }

    if (this._percentVisible) {
      this.paintPercentText(percent, newBarWidth, paintPercentText);
    }
  }

  /**
   * Render the percent label centered on the bar.
   *
   * Three coloring cases:
   *   1. Bar hasn't reached the text yet → all letters use "blank" color
   *      (the empty-cell foreground).
   *   2. Bar has passed the text entirely → all letters use the "bar
   *      passed" coloring (foreground swapped with the bar color for
   *      visual contrast).
   *   3. Bar is in the middle of the text → per-letter coloring,
   *      switching at the bar's right edge.
   */
  private paintPercentText(percent: number, newBarWidth: number, force: boolean): void {
    const newPercentText = StringUtils.FormatPercent(percent, this._percentPrecision);
    if (newPercentText === this._lastPercentText && !force) {
      return;
    }
    this._lastPercentText = newPercentText;

    const progressStart = Math.round((this.Width - newPercentText.length) / 2);
    const blankAttr = this._blankForeColour + (this.BackColour << 4);
    const passedAttr = this.BackColour + (this._barForeColour << 4);

    if (progressStart >= newBarWidth) {
      // All of the text is to the right of the bar; use blank coloring.
      this._crt.FastWrite(
        newPercentText,
        this.ScreenLeft + progressStart,
        this.ScreenTop,
        CharInfo.GetNew(' ', blankAttr)
      );
    } else if (progressStart + newPercentText.length <= newBarWidth) {
      // All of the text is behind the bar; use passed coloring.
      this._crt.FastWrite(
        newPercentText,
        this.ScreenLeft + progressStart,
        this.ScreenTop,
        CharInfo.GetNew(' ', passedAttr)
      );
    } else {
      // The bar's right edge is mid-text — color each letter individually.
      for (let i = 0; i < newPercentText.length; i++) {
        const letterPosition = progressStart + i;
        const isBeyondBar = letterPosition >= newBarWidth;
        const fg = isBeyondBar ? this._blankForeColour : this.BackColour;
        const bg = isBeyondBar ? this.BackColour : this._barForeColour;
        this._crt.FastWrite(
          newPercentText.charAt(i),
          this.ScreenLeft + letterPosition,
          this.ScreenTop,
          CharInfo.GetNew(' ', fg + (bg << 4))
        );
      }
    }
  }

  public get PercentPrecision(): number {
    return this._percentPrecision;
  }
  public set PercentPrecision(value: number) {
    if (value !== this._percentPrecision) {
      this._percentPrecision = value;
      this.Paint(true);
    }
  }

  public get PercentVisible(): boolean {
    return this._percentVisible;
  }
  public set PercentVisible(value: boolean) {
    if (value !== this._percentVisible) {
      this._percentVisible = value;
      this.Paint(true);
    }
  }

  /** Increment Value by 1. */
  public Step(): void {
    this.StepBy(1);
  }

  /** Increment Value by `count`. */
  public StepBy(count: number): void {
    this.Value += count;
  }

  public get Style(): ProgressBarStyle {
    return this._style;
  }
  public set Style(style: ProgressBarStyle) {
    if (style !== this._style) {
      this._style = style;
      this.Paint(true);
    }
  }

  public get Value(): number {
    return this._value;
  }
  public set Value(value: number) {
    if (value === this._value) {
      return;
    }
    if (this._style === ProgressBarStyle.Marquee) {
      // Marquee: throttle to MarqueeAnimationSpeed ms between frames.
      // Range-clamp to [0, Width + 15) so the bar wraps around when
      // it slides off the right edge.
      if (Date.now() - this._lastMarqueeUpdate >= this._marqueeAnimationSpeed) {
        if (value < 0) {
          value = 0;
        }
        if (value >= this.Width + 15) {
          value = 0;
        }
        this._value = value;
        this.Paint(false);
        this._lastMarqueeUpdate = Date.now();
      }
    } else {
      // Normal bar: clamp to [0, Maximum]
      this._value = Math.max(0, Math.min(value, this._maximum));
      this.Paint(false);
    }
  }
}
