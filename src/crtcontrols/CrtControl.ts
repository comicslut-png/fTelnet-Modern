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

import { CharInfo, Color, Crt } from '../crt/index.js';

/**
 * Base class for terminal-cell UI controls (panels, labels, progress
 * bars, etc.) painted on top of a `Crt` screen.
 *
 * Each control:
 *   - occupies a rectangular region defined by `Left`, `Top`, `Width`,
 *     `Height` (1-based, relative to its parent — if any — otherwise
 *     screen-absolute)
 *   - saves the screen content behind it on construction so that `Hide()`
 *     or movement can restore the original screen state
 *   - has a foreground/background `Color` pair from the CGA palette
 *   - can be a child of another `CrtControl`, forming a tree; child
 *     positions are relative to the parent's top-left
 *
 * Phase 1 migration notes:
 *   - `protected _crt` (originally `_Crt`) needs to be accessible to
 *     subclasses for their Paint() implementations. The original used
 *     the same protected access; preserved.
 *   - `_background` was implicitly initialized via the `SaveBackground()`
 *     call in the constructor. With strict mode, the field needs an
 *     initializer or definite-assignment assertion. Using `!` since
 *     SaveBackground runs unconditionally in the constructor.
 *   - The original `Paint(force)` had a `force = force` line to suppress
 *     "unused parameter" warnings. With the modern lint config we just
 *     prefix the parameter with `_` (or use it).
 */
export class CrtControl {
  private _backColour: number = Color.BLACK;
  private _background!: CharInfo[][];
  private readonly _controls: CrtControl[] = [];
  protected readonly _crt: Crt;
  private _foreColour: number = Color.LIGHTGRAY;
  private _height: number;
  private _left: number;
  private _parent: CrtControl | undefined;
  private _top: number;
  private _width: number;

  constructor(
    crt: Crt,
    parent: CrtControl | undefined,
    left: number,
    top: number,
    width: number,
    height: number
  ) {
    this._crt = crt;
    this._parent = parent;
    this._left = left;
    this._top = top;
    this._width = width;
    this._height = height;

    this.SaveBackground();

    if (this._parent) {
      this._parent.AddControl(this);
    }
  }

  /**
   * Add a child control. Called automatically by the child's constructor
   * when a parent is provided; rarely useful to call directly.
   */
  public AddControl(child: CrtControl): void {
    this._controls.push(child);
  }

  public get BackColour(): number {
    return this._backColour;
  }
  public set BackColour(value: number) {
    if (value !== this._backColour) {
      this._backColour = value;
      this.Paint(true);
    }
  }

  public get ForeColour(): number {
    return this._foreColour;
  }
  public set ForeColour(value: number) {
    if (value !== this._foreColour) {
      this._foreColour = value;
      this.Paint(true);
    }
  }

  public get Height(): number {
    return this._height;
  }
  public set Height(value: number) {
    if (value !== this._height) {
      this.RestoreBackground();
      this._height = value;
      this.SaveBackground();
      this.Paint(true);
    }
  }

  /**
   * Hide the control by restoring the screen content underneath it.
   * Doesn't actually destroy the control — calling `Show()` re-paints
   * it on top of whatever is there now.
   */
  public Hide(): void {
    this.RestoreBackground();
  }

  public get Left(): number {
    return this._left;
  }
  public set Left(value: number) {
    if (value !== this._left) {
      this.RestoreBackground();
      this._left = value;
      this.SaveBackground();
      this.Paint(true);

      // Re-paint children — their absolute positions changed when ours did.
      for (const child of this._controls) {
        child.Paint(true);
      }
    }
  }

  /**
   * Paint the control onto the `Crt`. Subclasses override this to do
   * the actual drawing; the base implementation is a no-op.
   *
   * @param force when true, redraw everything; when false, subclasses
   *   may skip redrawing pieces that haven't changed (used by
   *   `CrtProgressBar` to avoid re-rendering the percent text on every
   *   value update).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public Paint(_force: boolean): void {
    // Override in subclass.
  }

  public get Parent(): CrtControl | undefined {
    return this._parent;
  }
  public set Parent(value: CrtControl | undefined) {
    this.RestoreBackground();
    this._parent = value;
    this.SaveBackground();
    this.Paint(true);
  }

  /**
   * Walk up the parent chain to compute the absolute screen
   * coordinates of the control, then restore the saved background
   * to the screen at that location.
   */
  private RestoreBackground(): void {
    let left = this._left;
    let top = this._top;
    let p = this._parent;
    while (p) {
      left += p.Left;
      top += p.Top;
      p = p.Parent;
    }
    this._crt.RestoreScreen(this._background, left, top, left + this._width - 1, top + this._height - 1);
  }

  /**
   * Walk up the parent chain to compute the absolute screen
   * coordinates of the control, then snapshot the screen content at
   * that location for later restoration by `Hide()` or `RestoreBackground()`.
   */
  private SaveBackground(): void {
    let left = this._left;
    let top = this._top;
    let p = this._parent;
    while (p) {
      left += p.Left;
      top += p.Top;
      p = p.Parent;
    }
    this._background = this._crt.SaveScreen(left, top, left + this._width - 1, top + this._height - 1);
  }

  /**
   * Absolute screen column of the control's left edge. Sums in the
   * `Left` of the immediate parent only — does NOT walk the full
   * ancestor chain. The original had the same behavior, and it works
   * out because controls in practice are never nested more than one
   * level deep. (Deeper nesting would be a latent bug; flagged here
   * as a thing to revisit if and when nested panels appear.)
   */
  public get ScreenLeft(): number {
    return this._left + (this._parent ? this._parent.Left : 0);
  }

  /** Absolute screen row of the control's top edge. See `ScreenLeft`. */
  public get ScreenTop(): number {
    return this._top + (this._parent ? this._parent.Top : 0);
  }

  /**
   * Paint the control and all its children. Used after `Hide()` to
   * bring the control back, or for the initial render after
   * construction.
   */
  public Show(): void {
    this.Paint(true);
    for (const child of this._controls) {
      child.Paint(true);
    }
  }

  public get Top(): number {
    return this._top;
  }
  public set Top(value: number) {
    if (value !== this._top) {
      this.RestoreBackground();
      this._top = value;
      this.SaveBackground();
      this.Paint(true);
      for (const child of this._controls) {
        child.Paint(true);
      }
    }
  }

  public get Width(): number {
    return this._width;
  }
  public set Width(value: number) {
    if (value !== this._width) {
      this.RestoreBackground();
      this._width = value;
      this.SaveBackground();
      this.Paint(true);
    }
  }
}
