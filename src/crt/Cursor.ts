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

import { Point, StringUtils, TypedEvent, type IEvent } from '../common/index.js';
import { BlinkState } from './BlinkState.js';

/**
 * Blinking text cursor for the terminal.
 *
 * Maintains its own blink timer and fires `onshow` / `onhide` events
 * that the Crt class listens for. The Crt drives the actual drawing;
 * this class only owns the blink state and position.
 *
 * Phase 1 migration notes:
 *   - `_Timer` is now properly typed as the return value of
 *     `window.setInterval`. With strict mode, this caught that the
 *     original declared it as `number` but never gave it an initial
 *     value.
 *   - `Visible` had a setter but no getter in the original; added the
 *     getter so callers (and tests) can read the current state.
 *   - A `dispose()` method is added so consumers can stop the
 *     interval timer cleanly when tearing down. The original never
 *     stopped its timer, which leaked an interval per Crt lifecycle.
 *     The Crt rewrite in Delta 3c will call it.
 *   - The `_WindowOffset` and `_WindowOffsetAdjusted` fields from the
 *     original are kept as public properties; the Crt class reads
 *     them directly. (This is the same access pattern as the original;
 *     it'll get tidied up when Crt itself is rewritten.)
 */
export class Cursor {
  // Events
  public readonly onhide: IEvent<[]> = new TypedEvent<[]>();
  public readonly onshow: IEvent<[]> = new TypedEvent<[]>();

  // Public so the Crt class can read them directly during render,
  // matching the original access pattern.
  public WindowOffset: Point = new Point(0, 0);
  public WindowOffsetAdjusted: Point = new Point(0, 0);

  private _blinkRate = 500;
  private _blinkState: BlinkState = BlinkState.Hide;
  private _colour: string;
  private _lastPosition: Point = new Point(1, 1);
  private _position: Point = new Point(1, 1);
  private _size: Point;
  private _timer: ReturnType<typeof setInterval>;
  private _visible = true;

  constructor(colour: number, size: Point) {
    this._colour = `#${StringUtils.PadLeft(colour.toString(16), '0', 6)}`;
    this._size = size;
    this._timer = setInterval(() => this.onTimer(), this._blinkRate);
  }

  /** Stop the blink timer. Call when tearing down a Crt instance. */
  public dispose(): void {
    clearInterval(this._timer);
  }

  public set BlinkRate(value: number) {
    this._blinkRate = value;
    clearInterval(this._timer);
    this._timer = setInterval(() => this.onTimer(), this._blinkRate);
  }

  public get Colour(): string {
    return this._colour;
  }

  public set Colour(value: string) {
    this._colour = value;
  }

  public get LastPosition(): Point {
    return this._lastPosition;
  }

  public set LastPosition(value: Point) {
    this._lastPosition = value;
  }

  private onTimer(): void {
    this._blinkState = this._blinkState === BlinkState.Hide ? BlinkState.Show : BlinkState.Hide;
    if (this._blinkState === BlinkState.Hide) {
      this.onhide.trigger();
    } else {
      this.onshow.trigger();
    }
  }

  public get Position(): Point {
    return this._position;
  }

  public set Position(value: Point) {
    this._position = value;
  }

  public get Size(): Point {
    return this._size;
  }

  public set Size(value: Point) {
    this._size = value;
  }

  /** Read by the Crt to determine whether to draw the cursor at all. */
  public get Visible(): boolean {
    return this._visible;
  }

  public set Visible(value: boolean) {
    this._visible = value;
  }
}
